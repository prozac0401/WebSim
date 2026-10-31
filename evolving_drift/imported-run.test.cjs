'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./genome.js'),Evolution=require('./evolution.js');
const C=G.CHANNELS;
function fixture(){
 const vehicle={id:'import-test',physics:{massKg:1500,wheelbaseM:2.6,lengthM:4.5,widthM:1.8,maxSteer:.6,gearRatios:[4,2.7,1.8,1.3,1,.8],finalDrive:3.5,tireRadius:.34,shiftRPM:6500}};
 const track={id:'import-track',length:220,width:30,judgedStart:60,judgedEnd:180,sample:s=>{
  const arc=Math.max(0,Math.min(40,s-80)),h=.02*arc,after=Math.max(0,s-120);
  return {s,x:s<80?s:80+Math.sin(.02*arc)/.02+after*Math.cos(h),y:s<80?0:(1-Math.cos(.02*arc))/.02+after*Math.sin(h),heading:h,curvature:s>=80&&s<=120?.02:0};
 }};
 const record=Array.from({length:45},(_,i)=>{const p=track.sample(i*5);return {...p,time:i/3,speed:15,vx:15*Math.cos(p.heading),vy:15*Math.sin(p.heading),yaw:p.heading,beta:0};});
 const gene=G.create();for(let i=0;i<G.KNOTS;i++)gene[i*G.STRIDE+C.throttle]=.4;
 const baseline={gene,genomeVersion:G.VERSION,record,result:{valid:true,status:'finished',score:30,time:15}};
 const references=[];
 const engine=new Evolution.Engine(vehicle,track,{baseline,seed:37,rankResult:(v,t,result,frames,{reference})=>{references.push(reference);return {...result,score:result.score,frames};}});
 const imported=G.clone(gene);for(let i=0;i<G.KNOTS;i++)imported[i*G.STRIDE+C.throttle]=.47;
 const result={valid:true,status:'finished',score:4,time:15,frames:record.map(f=>({...f,throttle:.47}))};
 return {engine,baseline,imported,result,references};
}
const reserve=engine=>{const jobs=[];for(let job;(job=engine.planCandidate());)jobs.push(job);return jobs;};

test('imported completed run is the sole starting ancestor even when its score is lower, while grip remains the independent scoring reference',()=>{
 const {engine,baseline,imported,result,references}=fixture(),before=G.clone(baseline.gene);
 const snapshot=engine.initializeImported(imported,result);
 assert.equal(snapshot.ready,true);assert.equal(snapshot.initialRunAccepted,true);assert.equal(snapshot.originId,'loaded');
 assert.equal(engine.best.id,'loaded');assert.equal(engine.best.result.score,4);assert.deepEqual(engine.best.gene,imported);
 assert.deepEqual(engine.parents.map(p=>p.id),['loaded']);assert.equal(engine._baselineEntry.result.score,30);
 assert.ok(references.every(ref=>ref===baseline.record));assert.equal(engine._baselineEntry.record,baseline.record);
 assert.ok(engine._nicheArchives.flat().every(p=>p.id==='loaded'));assert.ok(engine._trajectoryArchive.every(p=>p.id==='loaded'));
 const jobs=reserve(engine);assert.equal(jobs.length,20);assert.ok(jobs.every(job=>job.parentId==='loaded'));
 assert.ok(jobs.some(job=>job.kind==='immigrant'),'exercise entry macros that used to restart from prepared grip');
 assert.deepEqual(baseline.gene,before);
 const publicGene=engine.loadedRun.gene;publicGene[0]=.5;assert.equal(engine.loadedRun.gene[0],imported[0]);
});

test('failed offspring do not reintroduce the grip baseline after loading and seeded loaded reservations remain deterministic',()=>{
 const a=fixture(),b=fixture();a.engine.initializeImported(a.imported,a.result);b.engine.initializeImported(b.imported,b.result);
 for(let generation=0;generation<2;generation++){
  const jobs=reserve(a.engine);assert.deepEqual(jobs,reserve(b.engine));
  for(const job of jobs){
   assert.equal(job.parentId,'loaded');
   // Deliberate invalid fixture checks selection only, not physical drivability.
   const failed={...a.result,valid:false,status:'offtrack',score:1e9};
   a.engine.acceptCandidate(job,failed);b.engine.acceptCandidate(job,failed);
  }
  assert.equal(a.engine.best.id,'loaded');assert.deepEqual(a.engine.parents.map(p=>p.id),['loaded']);
  assert.ok(a.engine._nicheArchives.flat().every(p=>p.id==='loaded'));
 }
 assert.deepEqual(a.engine.snapshot().history,b.engine.snapshot().history);
});

test('a physically failed imported run can replay but its total score is zero and evolution cannot admit it',()=>{
 const {engine,imported,result}=fixture();
 const snapshot=engine.initializeImported(imported,{...result,valid:false,status:'offtrack',score:1e12});
 assert.equal(snapshot.ready,false);assert.equal(snapshot.initialRunAccepted,false);assert.match(snapshot.blockedReason,/재생만/);
 assert.equal(engine.loadedRun.accepted,false);assert.equal(engine.loadedRun.result.score,0);assert.deepEqual(engine.loadedRun.record,result.frames);
 assert.equal(engine.best.id,'baseline');assert.deepEqual(engine.parents.map(p=>p.id),['baseline']);
 assert.equal(engine.planCandidate(),null);engine.step();assert.equal(engine.totalEvaluated,0);assert.equal(engine.generation,0);
});

test('loading never silently clamps incompatible controls or replaces an active generation',()=>{
 const {engine,imported,result}=fixture();
 assert.throws(()=>engine.validateImportedGene(imported.slice(1)),/1408/);
 const wrong=G.clone(imported);wrong[C.throttle]=1.2;assert.throws(()=>engine.validateImportedGene(wrong),/허용 범위/);
 const nan=G.clone(imported);nan[C.steer]=NaN;assert.throws(()=>engine.validateImportedGene(nan),/finite/);
 engine.initialize();engine.planCandidate();assert.throws(()=>engine.initializeImported(imported,result),/새 실험/);
 assert.equal(engine.best.id,'baseline');assert.equal(engine.loadedRun,null);
});

test('real T21 saved offspring re-evaluates to the same replay and score, then produces descendants of that exact genome',async()=>{
 const Catalog=require('./catalog.js'),Tracks=require('./track.js'),Prepared=require('./prepared-grips.js'),Physics=require('./physics.js');
 const vehicle=Catalog.get('porter-lpg-mt'),track=Tracks.get('kr-kic-t21-kdl-2016-r2'),baseline=await Prepared.load(vehicle,track);
 const source=new Evolution.Engine(vehicle,track,{baseline,seed:37}),job=source.planCandidate();
 const original=Physics.evaluateGene(vehicle,track,job.gene,{record:true});assert.equal(original.valid,true);
 const fresh=Physics.evaluateGene(vehicle,track,job.gene,{record:true});assert.deepEqual(fresh,original);
 const loaded=new Evolution.Engine(vehicle,track,{baseline,seed:37});loaded.initializeImported(job.gene,fresh);
 source.acceptCandidate(job,original);
 assert.equal(loaded.best.result.score,source.lastCandidate.result.score);assert.deepEqual(loaded.best.record,source.lastCandidate.record);
 assert.deepEqual(loaded.best.gene,job.gene);assert.equal(loaded.snapshot().totalEvaluated,0);
 assert.equal(loaded._baselineEntry.record,baseline.record);assert.ok(reserve(loaded).every(child=>child.parentId==='loaded'));
});
