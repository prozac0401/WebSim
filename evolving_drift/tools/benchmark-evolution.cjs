'use strict';
// Run the production Engine from Prepared.load only. No experiment, discovered
// genome, parameter schedule or alternative selector is imported by this tool.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const repo=path.resolve(__dirname,'../..'),base=path.join(repo,'evolving_drift'),output=path.join(repo,'output','drift-qa');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function geneHash(gene){const bytes=Buffer.alloc(gene.length*8);for(let i=0;i<gene.length;i++)bytes.writeDoubleLE(gene[i],i*8);return sha(bytes);}
function sourceHashes(){
 const roots=['evolving_drift','evolving_vehicles','evolving_vehicles_2'].map(dir=>path.join(repo,dir)+path.sep);
 const files=[...new Set([__filename,...Object.keys(require.cache).filter(file=>roots.some(root=>file.startsWith(root)))])].sort();
 return Object.fromEntries(files.map(file=>[path.relative(repo,file).replaceAll(path.sep,'/'),sha(fs.readFileSync(file))]));
}
function verifySources(expected){for(const [file,hash]of Object.entries(expected))if(sha(fs.readFileSync(path.join(repo,file)))!==hash)throw Error('Source changed during benchmark: '+file);}
const retryPause=new Int32Array(new SharedArrayBuffer(4));
function retryFileAction(action){
 for(let attempt=0;;attempt++)try{return action();}catch(error){
  if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=49)throw error;
  // Windows readers can briefly hold a destination open. Preserve its last
  // complete JSON and retry the atomic replacement; never truncate in place.
  Atomics.wait(retryPause,0,0,Math.min(250,20*Math.pow(1.5,attempt)));
 }
}
function writeJSON(file,value){const temp=file+'.tmp-'+process.pid;retryFileAction(()=>fs.writeFileSync(temp,JSON.stringify(value,null,2)));retryFileAction(()=>fs.renameSync(temp,file));}
function parseArgs(args){
 const config={seed:37,vehicle:null,track:null,budget:200,workers:2,development:false,stopOnSuccess:false,noCache:false,noLearning:false,out:null,help:false};
 const numeric=new Set(['seed','budget','workers']),flags={'--development':'development','--stop-on-success':'stopOnSuccess','--no-cache':'noCache','--no-learning':'noLearning','--help':'help'},values={'--seed':'seed','--vehicle':'vehicle','--track':'track','--budget':'budget','--workers':'workers','--out':'out'};
 for(let i=0;i<args.length;i++){const flag=args[i];if(flags[flag]){config[flags[flag]]=true;continue;}const key=values[flag];if(!key||args[i+1]===undefined)throw Error('Unknown or incomplete option: '+flag);config[key]=numeric.has(key)?Number(args[++i]):args[++i];}
 if(!Number.isInteger(config.seed)||config.seed<0||config.seed>0xffffffff)throw Error('--seed must be an unsigned 32-bit integer.');
 if(!Number.isInteger(config.budget)||config.budget<0||config.budget>100000)throw Error('--budget must be 0..100000 physical candidate evaluations.');
 if(!Number.isInteger(config.workers)||config.workers<1||config.workers>4)throw Error('--workers must be 1..4 (1 supports serial parity checks).');
 if(config.out&&!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.out))throw Error('--out is a filename prefix inside output/drift-qa, not a path.');
 return config;
}
function runWorker(){
 try{
  verifySources(workerData.sourceHashes);
  const Physics=require(path.join(base,'physics.js')),Catalog=require(path.join(base,'catalog.js')),Tracks=require(path.join(base,'track.js'));
  const vehicle=Catalog.get(workerData.vehicle),track=Tracks.get(workerData.track,{includeDevelopment:workerData.development});
  const evaluator=new (require(path.join(base,'evaluation-cache.js')).Evaluator)(vehicle,track,{enabled:!workerData.noCache});
  if(sha(Physics.signature())!==workerData.physicsSignatureHash)throw Error('Evaluator physics signature differs from coordinator.');
  let evaluations=0;
  parentPort.on('message',message=>{
   if(message.type!=='evaluate')return;
   try{const start=performance.now();evaluations++;const result=evaluator.evaluate(message.gene,{id:message.id,parentId:message.parentId});parentPort.postMessage({type:'result',sequence:message.sequence,result,evaluateMs:performance.now()-start,evaluations});}
   catch(error){parentPort.postMessage({type:'error',message:error.stack||String(error),sequence:message.sequence});}
  });
  parentPort.postMessage({type:'ready',evaluations,physicsSignatureHash:workerData.physicsSignatureHash});
 }catch(error){parentPort.postMessage({type:'error',message:error.stack||String(error)});}
}
class Pool{
 constructor(count,data){this.count=count;this.data=data;this.slots=[];this.batch=null;this.closing=false;this.completionOrder=[];this.error=null;}
 async start(){await Promise.all(Array.from({length:this.count},(_,index)=>new Promise((resolve,reject)=>{
  const worker=new Worker(__filename,{workerData:this.data}),slot={index,worker,busy:null,ready:false,timer:null};this.slots.push(slot);
  const startup=setTimeout(()=>reject(Error('Evaluator initialization timed out')),30000);
  worker.on('message',m=>{
   if(m.type==='ready'){clearTimeout(startup);if(m.evaluations!==0){reject(Error('Worker evaluated during initialization'));return;}slot.ready=true;resolve();return;}
   if(m.type==='error'){const error=Error(m.message);if(!slot.ready){clearTimeout(startup);reject(error);}this.fail(error);return;}
   if(m.type==='result'){
    if(!this.batch||slot.busy?.sequence!==m.sequence){this.fail(Error('Unexpected evaluator result order/identity'));return;}
    clearTimeout(slot.timer);this.batch.results.set(m.sequence,m);this.completionOrder.push(m.sequence);slot.busy=null;
    if(this.batch.results.size===this.batch.jobs.length){const batch=this.batch;this.batch=null;batch.resolve(batch.jobs.map(job=>batch.results.get(job.sequence)));}
    else this.dispatch();
   }
  });
  worker.on('error',error=>{clearTimeout(startup);if(!slot.ready)reject(error);this.fail(error);});
  worker.on('exit',code=>{clearTimeout(startup);if(!this.closing){const error=Error('Evaluator exited unexpectedly: '+code);if(!slot.ready)reject(error);this.fail(error);}});
 })));}
 fail(error){this.error=error;if(this.batch){const batch=this.batch;this.batch=null;batch.reject(error);}}
 dispatch(){if(!this.batch)return;for(const slot of this.slots){if(slot.busy||!slot.ready||this.batch.next>=this.batch.jobs.length)continue;const job=this.batch.jobs[this.batch.next++];slot.busy=job;slot.timer=setTimeout(()=>this.fail(Error('Evaluation timed out: '+job.id)),120000);slot.worker.postMessage({type:'evaluate',sequence:job.sequence,gene:job.gene,id:job.id,parentId:job.parentId});}}
 evaluate(jobs){if(this.error)throw this.error;if(this.batch)throw Error('A batch is already active');return new Promise((resolve,reject)=>{this.batch={jobs,next:0,results:new Map(),resolve,reject};this.dispatch();});}
 async close(){this.closing=true;for(const slot of this.slots)clearTimeout(slot.timer);await Promise.allSettled(this.slots.map(slot=>slot.worker.terminate()));}
}
async function main(config){
 const Catalog=require(path.join(base,'catalog.js')),Tracks=require(path.join(base,'track.js')),Physics=require(path.join(base,'physics.js'));
 const Genome=require(path.join(base,'genome.js')),Prepared=require(path.join(base,'prepared-grips.js')),Fitness=require(path.join(base,'fitness.js')),Evolution=require(path.join(base,'evolution.js'));
 const vehicle=Catalog.get(config.vehicle||Catalog.DEFAULT_ID),track=Tracks.get(config.track||Tracks.DEFAULT_ID,{includeDevelopment:config.development});
 config={...config,vehicle:vehicle.id,track:track.id,populationSize:20};delete config.help;
 const name=config.out||['production-evolution',config.seed,vehicle.id,track.id,'w'+config.workers].join('-');
 fs.mkdirSync(output,{recursive:true});
 const files={report:path.join(output,name+'.json'),lineage:path.join(output,name+'-lineage.jsonl'),best:path.join(output,name+'-best.json')};
 const started=Date.now(),startupCalls={step:0,evaluateGene:0,buildGripBaseline:0},original={};let baseline,engine;
 // The exact production loading/initialization path is guarded, not replaced.
 for(const key of Object.keys(startupCalls)){original[key]=Physics[key];Physics[key]=()=>{startupCalls[key]++;throw Error('Unexpected startup simulation: '+key);};}
 try{baseline=await Prepared.load(vehicle,track);engine=new Evolution.Engine(vehicle,track,{seed:config.seed,populationSize:20,baseline,physics:Physics,learning:!config.noLearning});engine.initialize();if(!engine.ready)throw Error(engine.blockedReason||'Engine did not initialize');}
 finally{Object.assign(Physics,original);}
 if(engine.totalEvaluated!==0||Object.values(startupCalls).some(Boolean))throw Error('Initialization did not preserve zero candidate evaluations');
 const hashes=sourceHashes(),genesisGeneHash=geneHash(baseline.gene),signatures={physics:sha(Physics.signature()),fitness:sha(Fitness.signature()),genome:sha(Genome.signature())};
 const lineage=new Map([['baseline',{geneHash:genesisGeneHash,valid:true,status:'finished'}]]),rows=[],reservations=[],pool=new Pool(config.workers,{vehicle:vehicle.id,track:track.id,development:config.development,noCache:config.noCache,sourceHashes:hashes,physicsSignatureHash:signatures.physics});
 let valid=0,failed=0,stopped='running',lastBestId=null,error=null,lastPublishedCount=0;
 fs.writeFileSync(files.lineage,'');
 function checkpoint(){
  const best=engine.best,state=engine.snapshot(),bestGeneHash=geneHash(best.gene);
  if(lastBestId!==best.id){const {frames,...result}=best.result;writeJSON(files.best,{config,sourceHashes:hashes,signatures,genesisGeneHash,preparedFingerprint:baseline.fingerprint,id:best.id,parentId:best.parentId,kind:best.kind,geneHash:bestGeneHash,gene:Array.from(best.gene),result,frames:best.record});lastBestId=best.id;}
  const deterministicRows=rows.map(({evaluateMs,evaluation,...row})=>row);
  const reproductionHash=sha(JSON.stringify({seed:config.seed,vehicle:vehicle.id,track:track.id,genesisGeneHash,rows:deterministicRows,history:state.history,bestGeneHash}));
  const report={schema:1,method:'Production DriftEvolution.Engine; Prepared.load is the only genesis; reserve each generation of 20 before evaluation; accept in reservation order; workers only evaluate Physics.evaluateGene.',config,startedAt:new Date(started).toISOString(),elapsedMs:Date.now()-started,stopped,error,sourceHashes:hashes,signatures,geneHashEncoding:'SHA-256 of little-endian Float64 values',genesisGeneHash,preparedFingerprint:baseline.fingerprint,startupCalls,startupEvaluations:0,evaluated:rows.length,valid,failed,objective:'continuous-apex-drift',legacyPoweredExitSuccess:!error&&best.result.valid===true&&best.result.status==='finished'&&best.result.power?.success===true,best:{id:best.id,parentId:best.parentId,kind:best.kind,geneHash:bestGeneHash,score:best.result.score,status:best.result.status,drift:best.result.drift,power:best.result.power},history:state.history,finalGeneration:state.generation,remainingReservations:state.reserved,reservations,completionOrder:pool.completionOrder,rows,reproductionHash,files:Object.fromEntries(Object.entries(files).map(([key,file])=>[key,path.relative(repo,file).replaceAll(path.sep,'/')]))};
  report.method='Production Engine; Prepared.load genesis; ordered generation reservations; exact 120Hz evaluation with optional verified-prefix reuse.';
  report.learningStats=state.learningStats;
  report.selectionStats=state.selectionStats;
  report.evaluationStats=rows.reduce((sum,row)=>{for(const key of ['simulatedTicks','reusedTicks','totalTicks'])sum[key]+=row.evaluation?.[key]||0;if(row.evaluation?.cacheHit)sum.cacheHits++;return sum;},{simulatedTicks:0,reusedTicks:0,totalTicks:0,cacheHits:0,evaluations:rows.length});
  writeJSON(files.report,report);lastPublishedCount=rows.length;return report;
 }
 try{
  checkpoint();if(config.budget>0)await pool.start();
  while(rows.length<config.budget){
   verifySources(hashes);
   const all=[];let job;while((job=engine.planCandidate()))all.push(job);
   if(all.length!==20)throw Error('Expected a full production generation of 20 reservations; got '+all.length);
   for(const job of all){const parent=lineage.get(job.parentId);if(!parent?.valid||parent.status!=='finished')throw Error('Unproven or failed parent was selected: '+job.parentId);}
   const jobs=all.slice(0,config.budget-rows.length);
   reservations.push({generation:all[0].generation,ids:all.map(job=>job.id),sequences:all.map(job=>job.sequence),evaluated:jobs.length});
   const results=await pool.evaluate(jobs);
   for(let i=0;i<jobs.length;i++){
    const job=jobs[i],evaluated=results[i];if(job.sequence!==evaluated.sequence)throw Error('Evaluation lost reservation order');
    engine.acceptCandidate(job,evaluated.result);const entry=engine.lastCandidate,result=entry.result;
    const power=result.power||Fitness.measurePower(result,track,vehicle),fullValid=result.valid===true&&result.status==='finished',success=entry.accepted&&fullValid&&power.success===true;
    const {gene,...proposal}=job,row={...proposal,ordinal:rows.length+1,geneHash:geneHash(gene),parentGeneHash:lineage.get(job.parentId).geneHash,status:result.status,valid:result.valid===true,accepted:entry.accepted,score:result.score,rawPhysicsScore:evaluated.result.score,time:result.time,progress:result.progress,maxAngle:result.maxAngle,driftDistance:result.driftDistance,peakWheelSlip:result.peakWheelSlip,legacyPoweredExitSuccess:success,drift:result.drift,power,evaluateMs:evaluated.evaluateMs};
    row.evaluation=evaluated.result.evaluation;row.failureAnalysis=result.failureAnalysis;
    if(entry.accepted){valid++;lineage.set(job.id,{geneHash:row.geneHash,valid:fullValid,status:result.status});}else failed++;
    rows.push(row);fs.appendFileSync(files.lineage,JSON.stringify(row)+'\n');
   }
   const report=checkpoint();console.log(JSON.stringify({seed:config.seed,evaluated:rows.length,budget:config.budget,generation:report.finalGeneration,valid,failed,bestId:report.best.id,score:report.best.score,bestArc:report.best.drift?.bestArc||null,bestLink:report.best.drift?.bestLink||null,fullConnectionCount:report.best.drift?.fullConnectionCount||0,straightLinkCount:report.best.drift?.straightLinkCount||0,parts:report.best.drift?.parts||null}));
   // Complete the already dispatched generation: never conceal evaluated jobs.
   if(config.stopOnSuccess&&report.legacyPoweredExitSuccess){stopped='success-at-generation-boundary';break;}
  }
  if(rows.length>=config.budget&&stopped==='running')stopped='budget-exhausted';
  verifySources(hashes);const report=checkpoint();console.log(JSON.stringify({done:true,evaluated:report.evaluated,objective:report.objective,startupEvaluations:0,reproductionHash:report.reproductionHash,report:report.files.report,best:report.files.best}));
 }catch(caught){
  error=caught.stack||String(caught);stopped='error';
  try{checkpoint();}catch(publicationError){
   // Keep the last published report and the unrenamed temporary evidence.
   fs.writeFileSync(path.join(output,name+'-interruption-'+process.pid+'.json'),JSON.stringify({config,error,checkpointError:publicationError.stack||String(publicationError),evaluated:rows.length,lastPublishedCount,completed:false,sourceHashes:hashes},null,2));
  }
  throw caught;
 }
 finally{await pool.close();}
}
if(!isMainThread)runWorker();
else if(require.main===module){
 try{const config=parseArgs(process.argv.slice(2));if(config.help)console.log('Usage: node '+path.relative(repo,__filename).replaceAll(path.sep,'/')+' --seed 37 --vehicle supra-3.0t-rz --track kr-kic-t21-kdl-2016-r2 --budget 400 --workers 2 [--out prefix] [--stop-on-success] [--development] [--no-cache] [--no-learning]\nBudget 0 verifies initialization only. Workers 1 permits a serial-parity comparison. Stop-on-success is the legacy powered-exit diagnostic only; use a budget for the continuous apex objective. No discovered genome input is supported.');else main(config).catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});}
 catch(error){console.error(error.stack||String(error));process.exitCode=1;}
}
module.exports={parseArgs,geneHash,writeJSON};
