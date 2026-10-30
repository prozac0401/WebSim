'use strict';
// Offline paired intervention, not a production search policy. Every child is
// evaluated from the physical initial state, with the frozen parent's diagnosis.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..');
const EXPERIMENT=Object.freeze({seed:37,budget:80,mutationSeed:137,scale:.5});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const jsonValue=value=>JSON.parse(JSON.stringify(value));
function geneHash(gene){const bytes=Buffer.alloc(gene.length*8);for(let i=0;i<gene.length;i++)bytes.writeDoubleLE(gene[i],i*8);return sha(bytes);}
function check(condition,message){if(!condition)throw Error(message);}
function parseArgs(args){
 const config={sourceRoot:repo,inputDir:null,prefix:'all-vehicle-s37-',out:path.join(repo,'output/drift-qa/all-vehicle-study/controlled-probes-s37.json'),vehicle:null,help:false};
 const names={'--source-root':'sourceRoot','--input-dir':'inputDir','--prefix':'prefix','--out':'out','--vehicle':'vehicle'};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--help'){config.help=true;continue;}
  const key=names[args[i]];check(key&&args[i+1]!==undefined,'Unknown or incomplete option: '+args[i]);config[key]=args[++i];
 }
 config.sourceRoot=path.resolve(config.sourceRoot);config.inputDir=path.resolve(config.inputDir||path.join(config.sourceRoot,'output/drift-qa'));config.out=path.resolve(config.out);
 check(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.prefix),'--prefix must be a filename prefix.');return config;
}
function verifySources(sourceRoot,expected){
 check(expected&&Object.keys(expected).length>0,'Missing parent source hashes.');
 for(const [file,hash]of Object.entries(expected))check(sha(fs.readFileSync(path.join(sourceRoot,file)))===hash,'Frozen source mismatch: '+file);
}
// Compare all JSON-visible telemetry and ranked diagnostics, not a few rounded
// score fields. Cache accounting is deliberately excluded from result parity.
function compare(expected,actual){
 const evidence={equal:true,differences:0,maxNumericDifference:0,first:[]};
 function visit(a,b,at){
  if(a===b)return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
   const keys=new Set([...Object.keys(a),...Object.keys(b)]);
   for(const key of keys)visit(a[key],b[key],at+'.'+key);return;
  }
  evidence.equal=false;evidence.differences++;
  if(typeof a==='number'&&typeof b==='number')evidence.maxNumericDifference=Math.max(evidence.maxNumericDifference,Math.abs(a-b));
  if(evidence.first.length<12)evidence.first.push({path:at,expected:a===undefined?'[missing]':a,actual:b===undefined?'[missing]':b});
 }
 visit(expected,jsonValue(actual),'$');return evidence;
}
function selectTarget(analysis){
 return analysis.regions.filter(region=>region.complete!==true&&Number.isFinite(region.progress)&&region.progress>0)
  .sort((a,b)=>b.progress-a.progress||a.id.localeCompare(b.id))[0]||null;
}
function targetMetrics(region){
 if(!region)return null;
 const keys=['id','kind','start','end','actualStart','actualEnd','coverage','progress','speedRetention','turnRatio','complete','reason','speedLimited','preferredBoundary','breakS','sourceS','unknown'];
 return Object.fromEntries(keys.map(key=>[key,region[key]??null]));
}
function summarize(result,record,track,Analysis,target){
 const analysis=Analysis.measure(track,result.drift,record),valid=result.valid===true&&result.status==='finished';
 const counts={corners:analysis.corners.filter(r=>r.complete).length,links:analysis.links.filter(r=>r.complete).length,totalCorners:analysis.corners.length,totalLinks:analysis.links.length};
 return {valid:result.valid,status:result.status,reason:result.reason,score:result.score,time:result.time,progress:result.progress,
  target:targetMetrics(analysis.regions.find(r=>r.id===target.id&&r.kind===target.kind)),
  diagnosticCompletions:counts,confirmedCompletions:{...counts,corners:valid?counts.corners:0,links:valid?counts.links:0},
  allRegions:analysis.regions.map(targetMetrics),scoreParts:result.drift?.parts,regionalScore:result.drift?.regionalScore};
}
function delta(base,child){
 const diff=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?b-a:null;
 const d={score:diff(base.score,child.score),coverage:diff(base.target?.coverage,child.target?.coverage),progress:diff(base.target?.progress,child.target?.progress),speedRetention:diff(base.target?.speedRetention,child.target?.speedRetention),
  corners:child.confirmedCompletions.corners-base.confirmedCompletions.corners,links:child.confirmedCompletions.links-base.confirmedCompletions.links};
 const valid=child.valid===true&&child.status==='finished',positive=value=>value!==null&&value>1e-9,nonnegative=value=>value!==null&&value>=-1e-9,negative=value=>value!==null&&value< -1e-9;
 return {...d,validFinished:valid,scoreImproved:valid&&positive(d.score),coverageImproved:valid&&positive(d.coverage),progressImproved:valid&&positive(d.progress),speedRetentionImproved:valid&&positive(d.speedRetention),
  coverageAndSpeedImproved:valid&&positive(d.coverage)&&positive(d.speedRetention),coverageImprovedSpeedMaintained:valid&&positive(d.coverage)&&nonnegative(d.speedRetention),
  scoreAndCoverageImproved:valid&&positive(d.score)&&positive(d.coverage),scoreGainCoverageLoss:valid&&positive(d.score)&&negative(d.coverage),coverageGainScoreLoss:valid&&positive(d.coverage)&&negative(d.score)};
}
function geneChange(parent,child,Genome){
 const changed=[];for(let i=0;i<parent.length;i++)if(parent[i]!==child[i])changed.push(i);
 return {values:changed.length,knots:new Set(changed.map(i=>Math.floor(i/Genome.STRIDE))).size,firstKnot:changed.length?Math.floor(changed[0]/Genome.STRIDE):null,lastKnot:changed.length?Math.floor(changed.at(-1)/Genome.STRIDE):null};
}
function aggregate(rows){
 const completed=rows.filter(row=>row.meaningful&&row.variants&&row.variants.length===3),variants={};
 for(const name of ['line','speed','line-then-speed']){
  const children=completed.map(row=>row.variants.find(variant=>variant.name===name));
  variants[name]={tried:children.length,valid:children.filter(child=>child.summary.valid&&child.summary.status==='finished').length};
  for(const key of ['scoreImproved','coverageImproved','progressImproved','speedRetentionImproved','coverageAndSpeedImproved','coverageImprovedSpeedMaintained','scoreAndCoverageImproved','scoreGainCoverageLoss','coverageGainScoreLoss'])variants[name][key]=children.filter(child=>child.delta[key]).length;
 }
 return {vehicles:rows.length,meaningful:rows.filter(row=>row.meaningful).length,skipped:rows.filter(row=>row.meaningful===false).length,errors:rows.filter(row=>row.error).length,evaluations:rows.reduce((sum,row)=>sum+row.evaluations,0),variants};
}
function writeJSON(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.tmp-'+process.pid;
 fs.writeFileSync(temporary,JSON.stringify(value,null,2));fs.renameSync(temporary,file);
}
async function main(config){
 const base=path.join(config.sourceRoot,'evolving_drift'),get=name=>require(path.join(base,name+'.js'));
 const Catalog=get('catalog'),Tracks=get('track'),Physics=get('physics'),Fitness=get('fitness'),Genome=get('genome'),Prepared=get('prepared-grips'),Analysis=get('connection-analysis'),Strategies=get('evolution-strategies'),Evolution=get('evolution');
 const vehicles=Catalog.list().filter(vehicle=>!config.vehicle||vehicle.id===config.vehicle);check(vehicles.length>0,'Unknown vehicle: '+config.vehicle);check(vehicles.length<=16,'This fixed study permits at most 16 vehicles / 64 physical evaluations.');
 const report={schema:1,method:'Paired full-physics, no-cache replay of seed 37/budget 80 score champions. Largest incomplete connection progress selects one fixed target per car. No thresholds or production sources changed.',
  compoundMethod:'line-then-speed applies the same line genotype transform followed by speed with a fresh RNG seed 137; both use the original verified parent record, result and target. Only genes pass between transforms; intermediate line is not relabelled as a proved valid parent.',
  config,experiment:EXPERIMENT,toolHash:sha(fs.readFileSync(__filename)),startedAt:new Date().toISOString(),status:'running',rows:[],summary:null};
 const checkpoint=()=>{report.summary=aggregate(report.rows);writeJSON(config.out,report);};checkpoint();
 for(const vehicle of vehicles){
  const row={vehicle:vehicle.id,evaluations:0};report.rows.push(row);
  try{
   const name=config.prefix+vehicle.id,files={best:path.join(config.inputDir,name+'-best.json'),report:path.join(config.inputDir,name+'.json')};row.files=files;
   const best=JSON.parse(fs.readFileSync(files.best,'utf8')),trial=JSON.parse(fs.readFileSync(files.report,'utf8'));
   row.inputHashes={best:sha(fs.readFileSync(files.best)),report:sha(fs.readFileSync(files.report))};row.parentId=best.id;row.parentGeneHash=best.geneHash;row.sourceHashes=best.sourceHashes;row.signatures=best.signatures;
   check(trial.stopped==='budget-exhausted'&&!trial.error,'Input trial is incomplete or failed: '+trial.stopped);
   for(const input of [best,trial])check(input.config.seed===EXPERIMENT.seed&&input.config.budget===EXPERIMENT.budget&&input.config.vehicle===vehicle.id,'Input experiment does not match fixed seed/budget/vehicle.');
   check(best.config.track===trial.config.track&&best.config.development===trial.config.development,'Parent and completed report use different tracks.');
   check(compare(best.sourceHashes,trial.sourceHashes).equal&&compare(best.signatures,trial.signatures).equal,'Parent and completed report use different source snapshots.');
   check(trial.evaluated===EXPERIMENT.budget,'Input physical evaluation count differs from budget.');
   check(best.geneHash===trial.best.geneHash&&best.id===trial.best.id,'Best artifact does not match completed report.');
   check(best.gene.length===Genome.LENGTH&&best.gene.every(Number.isFinite),'Invalid parent genotype.');
   check(geneHash(best.gene)===best.geneHash,'Parent genotype hash mismatch.');
   check(best.result.valid===true&&best.result.status==='finished','Parent is not a valid completion.');
   verifySources(config.sourceRoot,best.sourceHashes);
   const signatures={physics:sha(Physics.signature()),fitness:sha(Fitness.signature()),genome:sha(Genome.signature())};
   check(compare(best.signatures,signatures).equal,'Loaded source signature differs from parent.');
   const track=Tracks.get(best.config.track,{includeDevelopment:best.config.development});row.track=track.id;
   const target=selectTarget(Analysis.measure(track,best.result.drift,best.frames));row.target=target;row.meaningful=target!==null;
   if(!target){row.skipReason='No incomplete region has positive measured connection progress.';checkpoint();console.log(JSON.stringify({vehicle:vehicle.id,meaningful:false,evaluations:0}));continue;}
   check([target.actualStart,target.actualEnd,target.start,target.end].every(Number.isFinite),'Selected partial target has no measured spatial range.');
   const prepared=await Prepared.load(vehicle,track);row.preparedFingerprint=prepared.fingerprint;
   check(prepared.fingerprint===best.preparedFingerprint&&geneHash(prepared.gene)===best.genesisGeneHash,'Prepared grip reference differs from benchmark.');
   const evaluate=gene=>{row.evaluations++;const raw=Physics.evaluateGene(vehicle,track,gene,{record:true});return {result:Fitness.rank(vehicle,track,raw,raw.frames,{reference:prepared.record}),record:raw.frames};};
   const replay=evaluate(Float64Array.from(best.gene));
   const {evaluation:ignoredEvaluation,...expectedResult}=best.result,{frames:ignoredFrames,...actualResult}=replay.result;
   row.verification={frames:compare(best.frames,replay.record),rankedResult:compare(expectedResult,actualResult),referenceSpeeds:compare(best.result.drift.referenceSpeeds,replay.result.drift.referenceSpeeds),referencePace:compare(best.result.drift.referencePace,replay.result.drift.referencePace),frameCount:replay.record.length};
   check(Object.values(row.verification).filter(value=>value&&typeof value==='object').every(value=>value.equal),'Exact parent no-cache replay or prepared-reference ranking differs.');
   const verifiedTarget=selectTarget(Analysis.measure(track,replay.result.drift,replay.record));
   check(compare(target,verifiedTarget).equal,'Target diagnosis differs after parent replay.');
   const parent={accepted:true,id:best.id,gene:Float64Array.from(best.gene),record:replay.record,result:replay.result};
   row.parent=summarize(replay.result,replay.record,track,Analysis,target);
   const options={connectionTarget:target,scale:EXPERIMENT.scale,lineBounds:Genome.corridorBounds(vehicle,track),zones:Strategies.zones(track),referenceRecord:prepared.record,referenceGene:prepared.gene};
   const mutate=(gene,mode)=>Strategies.connect(vehicle,track,{...parent,gene},Evolution.createRng(EXPERIMENT.mutationSeed),{...options,connectionMode:mode});
   const line=mutate(parent.gene,'line'),speed=mutate(parent.gene,'speed'),combined=mutate(line.gene,'speed');
   const proposals=[{name:'line',proposal:line,changes:[line.change]},{name:'speed',proposal:speed,changes:[speed.change]},{name:'line-then-speed',proposal:combined,changes:[line.change,combined.change]}];row.variants=[];
   for(const {name:variantName,proposal,changes}of proposals){
    check(proposal.gene.length===Genome.LENGTH&&Array.from(proposal.gene).every(Number.isFinite),'Mutation produced invalid gene.');
    const evaluated=evaluate(proposal.gene),summary=summarize(evaluated.result,evaluated.record,track,Analysis,target);
    row.variants.push({name:variantName,geneHash:geneHash(proposal.gene),gene:Array.from(proposal.gene),geneChange:geneChange(parent.gene,proposal.gene,Genome),changes,summary,delta:delta(row.parent,summary)});
   }
   const candidates=[{name:'parent',summary:row.parent},...row.variants].filter(item=>item.summary.valid===true&&item.summary.status==='finished');
   const maxBy=read=>candidates.reduce((best,item)=>read(item.summary)>read(best.summary)?item:best,candidates[0]);
   row.maxScore=maxBy(summary=>summary.score).name;row.maxTargetCoverage=maxBy(summary=>summary.target?.coverage??-1).name;row.maxTargetProgress=maxBy(summary=>summary.target?.progress??-1).name;
   verifySources(config.sourceRoot,best.sourceHashes);
   console.log(JSON.stringify({vehicle:vehicle.id,target:target.id,evaluations:row.evaluations,maxScore:row.maxScore,maxTargetCoverage:row.maxTargetCoverage,variants:row.variants.map(item=>({name:item.name,valid:item.summary.valid,score:item.summary.score,coverage:item.summary.target?.coverage,retention:item.summary.target?.speedRetention}))}));
  }catch(error){row.error=error.stack||String(error);console.error(vehicle.id+': '+error.message);}
  checkpoint();
 }
 report.status=report.rows.some(row=>row.error)?'errors':'completed';report.finishedAt=new Date().toISOString();checkpoint();
 console.log(JSON.stringify({status:report.status,output:config.out,summary:report.summary}));return report;
}
if(require.main===module){
 try{
  const config=parseArgs(process.argv.slice(2));
  if(config.help)console.log('node evolving_drift/tools/probe-connection-controls.cjs --source-root <frozen repo> [--input-dir <reports>] [--prefix all-vehicle-s37-] [--vehicle <id>] [--out <JSON path>]\nFixed: seed 37 champions, budget 80; line / speed / line-then-speed, scale 0.5, independent RNG seed 137. Maximum four full physical evaluations per meaningful car; zero-progress cars are skipped.');
  else main(config).then(report=>{if(report.status!=='completed')process.exitCode=1;}).catch(error=>{console.error(error.stack||error);process.exitCode=1;});
 }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={EXPERIMENT,parseArgs,geneHash,compare,selectTarget,targetMetrics,delta,aggregate,main};
