'use strict';
// Explicit opt-in study runner. All evaluated candidates are counted; the
// paired arm only toggles trajectorySearch and holds physics/scoring fixed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),output=path.join(repo,'output/drift-qa');
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
function config(args){
 const c={run:false,resume:false,scope:'all',seed:37,parallel:1,workers:2,smokeBudget:40,pairBudget:200,prefix:'line-clutch',track:'kr-kic-t21-kdl-2016-r2'};
 const values={'--scope':'scope','--seed':'seed','--parallel':'parallel','--workers':'workers','--smoke-budget':'smokeBudget','--pair-budget':'pairBudget','--prefix':'prefix','--track':'track'};
 for(let i=0;i<args.length;i++){const flag=args[i];if(flag==='--run'){c.run=true;continue;}if(flag==='--resume'){c.resume=true;continue;}const key=values[flag];if(!key||!args[i+1])throw Error('Unknown/incomplete argument: '+flag);c[key]=['seed','parallel','workers','smokeBudget','pairBudget'].includes(key)?Number(args[++i]):args[++i];}
 if(!['smoke','paired','all'].includes(c.scope))throw Error('--scope must be smoke, paired or all');
 if(!Number.isInteger(c.seed)||c.seed<0||c.seed>0xffffffff)throw Error('Invalid seed');
 for(const key of ['parallel','workers'])if(!Number.isInteger(c[key])||c[key]<1||c[key]>4)throw Error(key+' must be1..4');
 if(c.parallel*c.workers>4)throw Error('At most four physical workers in total');
 for(const key of ['smokeBudget','pairBudget'])if(!Number.isInteger(c[key])||c[key]<20||c[key]>2000||c[key]%20)throw Error(key+' must be a whole-generation budget from20 to2000');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(c.prefix))throw Error('Invalid filename prefix');
 return c;
}
function plan(c){
 const Catalog=require('../catalog.js'),ids=Catalog.list().map(v=>v.id),jobs=[];
 if(c.scope!=='paired')for(const vehicle of ids)jobs.push({phase:'smoke',vehicle,budget:c.smokeBudget,trajectorySearch:true});
 if(c.scope!=='smoke')for(const vehicle of ['porter-lpg-mt','gr86-2.4-rz-mt','supra-3.0t-rz','ioniq5-standard'])for(const trajectorySearch of [true,false])jobs.push({phase:'paired',vehicle,budget:c.pairBudget,trajectorySearch});
 return jobs.map(job=>({...job,prefix:[c.prefix,'s'+c.seed,job.phase,job.vehicle,job.trajectorySearch?'on':'off','n'+job.budget].join('-')}));
}
function reusable(file,job,c){
 if(!fs.existsSync(file))return null;
 if(!c.resume)throw Error('Report already exists; choose a new --prefix or explicitly --resume: '+file);
 const r=JSON.parse(fs.readFileSync(file));
 if(r.stopped!=='budget-exhausted'||r.error||r.evaluated!==job.budget||r.config.seed!==c.seed||r.config.vehicle!==job.vehicle||r.config.track!==c.track||r.config.workers!==c.workers||r.config.noTrajectory!==!job.trajectorySearch)throw Error('Existing report is incomplete or has different settings; preserve its evidence and choose a new --prefix: '+file);
 if(Object.entries(r.sourceHashes).some(([p,h])=>!fs.existsSync(path.join(repo,p))||sha(fs.readFileSync(path.join(repo,p)))!==h))throw Error('Existing completed report belongs to different source: '+file);
 return r;
}
function compact(job,r){return {...job,evaluated:r.evaluated,valid:r.valid,failed:r.failed,startupEvaluations:r.startupEvaluations,score:r.best.score,bestId:r.best.id,connections:r.connections,clutch:r.clutch,bestClutch:r.best.clutch,bestTrajectory:r.best.trajectory,trajectorySearch:r.trajectorySearch,signatures:r.signatures,preparedFingerprint:r.preparedFingerprint,reproductionHash:r.reproductionHash,report:r.files.report,best:r.files.best};}
async function run(c){
 const jobs=plan(c),sum=jobs.reduce((n,j)=>n+j.budget,0);
 if(!c.run){console.log(JSON.stringify({action:'plan-only; add --run to evaluate',config:c,plannedEvaluations:sum,jobs},null,2));return;}
 fs.mkdirSync(output,{recursive:true});const summaryPath=path.join(output,c.prefix+'-s'+c.seed+'-'+c.scope+'-summary.json');
 const summary={schema:1,method:'Prepared genesis only; all16 smoke; selected4 matched trajectorySearch on/off. Clutch support and retry cooldown remain enabled in both paired arms. No candidate is reused across arms.',config:c,plannedEvaluations:sum,status:'running',startedAt:new Date().toISOString(),results:[],errors:[],active:[]};
 const sourceHashes=new Map();let next=0,failed=false;
 function write(){const temp=summaryPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(summary,null,2));fs.renameSync(temp,summaryPath);}
 function verify(r){for(const [p,h]of Object.entries(r.sourceHashes)){if(sourceHashes.has(p)&&sourceHashes.get(p)!==h)throw Error('Source changed across study arms: '+p);sourceHashes.set(p,h);}if(r.error||r.stopped!=='budget-exhausted'||r.startupEvaluations!==0)throw Error('Incomplete/invalid benchmark report');}
 async function one(job){
  const file=path.join(output,job.prefix+'.json'),saved=reusable(file,job,c);
  if(saved){verify(saved);summary.results.push({...compact(job,saved),resumed:true});write();return;}
  const args=[path.join(__dirname,'benchmark-line-clutch.cjs'),'--vehicle',job.vehicle,'--track',c.track,'--seed',String(c.seed),'--budget',String(job.budget),'--workers',String(c.workers),'--out',job.prefix];if(!job.trajectorySearch)args.push('--no-trajectory');
  const log=fs.createWriteStream(path.join(output,job.prefix+'.log'));
  summary.active.push(job.prefix);write();
  try{
   await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(job.prefix+' exited '+code)));});
   const r=JSON.parse(fs.readFileSync(file));verify(r);if(r.evaluated!==job.budget)throw Error('Unexpected evaluated budget');summary.results.push(compact(job,r));console.log(JSON.stringify({completed:job.prefix,evaluated:r.evaluated,valid:r.valid,score:r.best.score,connections:r.connections.representative}));
  }finally{log.end();summary.active=summary.active.filter(p=>p!==job.prefix);write();}
 }
 write();
 await Promise.all(Array.from({length:c.parallel},async()=>{while(!failed&&next<jobs.length){const job=jobs[next++];try{await one(job);}catch(e){failed=true;summary.errors.push({job:job.prefix,message:e.stack||String(e)});}}}));
 summary.status=summary.errors.length?'error':summary.results.length===jobs.length?'completed':'incomplete';summary.completedAt=new Date().toISOString();summary.evaluated=summary.results.reduce((n,r)=>n+r.evaluated,0);write();console.log(JSON.stringify({status:summary.status,evaluated:summary.evaluated,summary:path.relative(repo,summaryPath)}));if(summary.status!=='completed')process.exitCode=1;
}
if(require.main===module)try{run(config(process.argv.slice(2))).catch(e=>{console.error(e.stack||String(e));process.exitCode=1});}catch(e){console.error(e.stack||String(e));process.exitCode=1;}
module.exports={config,plan};
