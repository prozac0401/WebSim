'use strict';
// Opt-in measured-budget runner. Every arm starts at the same saved grip; no
// candidate is imported, hand-edited, or reused as a parent across runs.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),output=path.join(repo,'output/drift-qa/pedal-overlap');
const representatives=['porter-lpg-mt','bmw-m2-3.0t-mt','supra-3.0t-rz','gr86-2.4-rz-mt'];
function parse(args){
 const config={run:false,arm:'baseline',seed:37,sourceRef:null,scope:'all',workers:2,parallel:2,smokeBudget:20,pairBudget:100,vehicles:null,prefix:'pedal-overlap',track:'kr-kic-t21-kdl-2016-r2'};
 const values={'--arm':'arm','--seed':'seed','--source-ref':'sourceRef','--scope':'scope','--workers':'workers','--parallel':'parallel','--smoke-budget':'smokeBudget','--pair-budget':'pairBudget','--prefix':'prefix','--track':'track','--vehicles':'vehicles'};
 for(let i=0;i<args.length;i++){if(args[i]==='--run'){config.run=true;continue;}const key=values[args[i]];if(!key||!args[i+1])throw Error('Unknown/incomplete option: '+args[i]);config[key]=['seed','workers','parallel','smokeBudget','pairBudget'].includes(key)?Number(args[++i]):args[++i];}
 if(!['baseline','candidate'].includes(config.arm)||!['all','representatives','smoke'].includes(config.scope))throw Error('Invalid arm or scope');
 if(config.arm==='baseline'&&!config.sourceRef)throw Error('Baseline requires an explicit frozen --source-ref');
 if(!Number.isInteger(config.seed)||config.seed<0||config.seed>0xffffffff)throw Error('Invalid seed');
 for(const key of ['workers','parallel'])if(!Number.isInteger(config[key])||config[key]<1||config[key]>4)throw Error('Invalid concurrency');
 if(config.workers*config.parallel>4)throw Error('At most four evaluator workers');
 for(const key of ['smokeBudget','pairBudget'])if(!Number.isInteger(config[key])||config[key]<20||config[key]>2000||config[key]%20)throw Error('Budget must be20..2000 in complete generations');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.prefix))throw Error('Invalid prefix');
 return config;
}
function plan(config){
 const catalog=require('../catalog.js').list().map(v=>v.id);
 const ids=config.vehicles?config.vehicles.split(','):config.scope==='representatives'?representatives:catalog;
 if(new Set(ids).size!==ids.length||ids.some(id=>!catalog.includes(id)))throw Error('Unknown or duplicate vehicle ID');
 return ids.map(vehicle=>({vehicle,budget:config.scope!=='smoke'&&representatives.includes(vehicle)?config.pairBudget:config.smokeBudget,prefix:[config.prefix,config.arm,'s'+config.seed,vehicle].join('-')}));
}
async function run(config){
 const jobs=plan(config),summary={schema:1,method:'Production Engine, prepared genesis, whole generations, ordered acceptance. Representative runs include their early smoke observations; they are not counted twice.',config,status:'running',plannedEvaluations:jobs.reduce((n,j)=>n+j.budget,0),startedAt:new Date().toISOString(),results:[],errors:[],active:[]};
 if(!config.run){console.log(JSON.stringify({...summary,jobs},null,2));return;}
 fs.mkdirSync(output,{recursive:true});const summaryFile=path.join(output,[config.prefix,config.arm,'s'+config.seed,config.scope,'summary.json'].join('-'));
 if(fs.existsSync(summaryFile))throw Error('Summary already exists; preserve evidence and choose another prefix: '+summaryFile);
 const write=()=>{const temp=summaryFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(summary,null,2));fs.renameSync(temp,summaryFile);};
 let next=0,failed=false;
 async function one(job){
  const file=path.join(output,job.prefix+'.json');if(fs.existsSync(file))throw Error('Evidence already exists: '+file);
  const args=[path.join(__dirname,'benchmark-pedal-overlap.cjs'),'--arm',config.arm,'--seed',String(config.seed),'--vehicle',job.vehicle,'--track',config.track,'--budget',String(job.budget),'--workers',String(config.workers),'--out',job.prefix];
  if(config.sourceRef)args.push('--source-ref',config.sourceRef);
  const log=fs.createWriteStream(path.join(output,job.prefix+'.log'));summary.active.push(job.prefix);write();
  try{
   await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(job.prefix+' exited '+code)));});
   const result=JSON.parse(fs.readFileSync(file));
   if(result.stopped!=='budget-exhausted'||result.error||result.evaluated!==job.budget||result.startupEvaluations!==0||result.failureScoreViolations)throw Error('Incomplete/invariant violation: '+job.prefix);
   summary.results.push({vehicle:job.vehicle,budget:job.budget,evaluated:result.evaluated,valid:result.valid,failed:result.failed,score:result.best.score,bestId:result.best.id,bestOverlap:result.best.overlap,overlap:result.overlap,connections:result.connections,statusCounts:result.statusCounts,signatures:result.signatures,preparedFingerprint:result.preparedFingerprint,genesisGeneHash:result.genesisGeneHash,elapsedMs:result.elapsedMs,report:result.files.report});
   console.log(JSON.stringify({completed:job.prefix,evaluated:result.evaluated,valid:result.valid,score:result.best.score,overlap:result.overlap.eligibleSeconds,elapsedMs:result.elapsedMs}));
  }finally{log.end();summary.active=summary.active.filter(name=>name!==job.prefix);write();}
 }
 write();await Promise.all(Array.from({length:config.parallel},async()=>{while(!failed&&next<jobs.length){const job=jobs[next++];try{await one(job);}catch(error){failed=true;summary.errors.push({vehicle:job.vehicle,message:error.stack||String(error)});}}}));
 summary.status=summary.errors.length?'error':summary.results.length===jobs.length?'completed':'incomplete';summary.evaluated=summary.results.reduce((n,row)=>n+row.evaluated,0);summary.finishedAt=new Date().toISOString();write();
 console.log(JSON.stringify({status:summary.status,evaluated:summary.evaluated,file:path.relative(repo,summaryFile)}));if(summary.status!=='completed')process.exitCode=1;
}
if(require.main===module)try{run(parse(process.argv.slice(2))).catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});}catch(error){console.error(error.stack||String(error));process.exitCode=1;}
module.exports={parse,plan,representatives};
