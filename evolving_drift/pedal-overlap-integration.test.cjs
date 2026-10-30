'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const G=require('./genome.js'),P=require('./physics.js'),Cache=require('./evaluation-cache.js');
const Catalog=require('./catalog.js'),Tracks=require('./track.js'),Prepared=require('./prepared-grips.js');
const Evolution=require('./evolution.js'),Strategies=require('./evolution-strategies.js'),Fitness=require('./fitness.js');
const C=G.CHANNELS,track=Tracks.get('kr-kic-t21-kdl-2016-r2');
const manualIds=['porter-lpg-mt','porter-diesel-mt','bmw-m2-3.0t-mt','gr86-2.4-rz-mt'];
// Frozen original f7621cd9a93c23f8631026c9a1671c970f44a27e strategies/evolution,
// with its own trajectory closure, current prepared KIC T21 seeds, seed 37 and
// 20 reservations. Golden hashes avoid requiring Git history in shallow CI.
const initialPlanHashes={
 'g80-2.5t-rwd':'9efa644cf214d4319117bf175c2d6d40411e3817eda7dc2aa5d13ddce9993517',
 'g80-3.5t-rwd':'309fdb7d9da7513e762cd2a35ca88239973222b3ccde92430e6239ed07465f50',
 'ioniq5-standard':'01954d8986b97ac542d74a717f2c918dea16b58940c553966270e7c9116afbbb',
 'ioniq5-long-rwd':'89323de67e86de9a2e17c074401b7c7fdadd943007313f53fead84a5e8b3d579',
 'porter-lpg-mt':'3d31afb9a01c594c03e5bd2a37f6b60c26d4e903b2f260da69a733d8e35105e5',
 'porter-lpg-at':'f44e5e699b0aa195aa12b8d9e094dc6dd36a0e09617fbef14ca41b94ce9c1eda',
 'porter-diesel-mt':'c1f72e8530760a185a9706191bc9efad5d3395fbb428b8b38eb4d352e085f08f',
 'porter-diesel-at':'ed1c9aed2715a3e27f01fe027ecce6e96d229d5a88cece12175c7eb6e1e5b18a',
 'g70-2.0t-rwd':'6580c2819ca7b79c67c928d80a39280c375b380e243274bccbb9702c6412979c',
 'g70-3.3t-rwd':'d3a3a7d406a29a87fa3efd8d7ed0ce184cba66549eb0d60ebcf49887e77890cd',
 'g70-2.2d-rwd':'a2c6e4705bcdb52cd93dc59f4e601858f25921da8c118c94f608342f483a9539',
 'supra-3.0t-rz':'04270a081014ffc4f03e5cfb9ac98a12be5bba792543bc922e8b05b5068865d4',
 'bmw-m2-3.0t-dct':'147b34744b0fb3368eb462ec5c10dcc8f4c22657e80459bb341223b299c90d37',
 'bmw-m2-3.0t-mt':'63874b10c75724c9156c3368651096b41cf6931bbf397b75e67c0437ced3b8df',
 'gr86-2.4-rz-mt':'f08481588eb6f880cffab1434326b3332cb0865b27a21b3ddbd2f7d9339e1ef0',
 'gr86-2.4-rz-at':'fc4a7f3f1c375673b9674d6727f80b831f993059fdb31270bbdde7d0c5ad1318'
};
function planHash(jobs){const hash=crypto.createHash('sha256');for(const job of jobs){hash.update(job.id+'\0'+job.kind+'\0'+job.parentId+'\0');const bytes=Buffer.alloc(job.gene.length*8);for(let i=0;i<job.gene.length;i++)bytes.writeDoubleLE(job.gene[i],i*8);hash.update(bytes);}return hash.digest('hex');}
const physical=result=>{const {evaluation,...rest}=result;return rest;};
const reserve=engine=>{const jobs=[];for(let job;(job=engine.planCandidate());)jobs.push(job);return jobs;};
async function preparedEngine(id,options={}){
 const vehicle=Catalog.get(id),baseline=await Prepared.load(vehicle,track);
 const engine=new Evolution.Engine(vehicle,track,{baseline,seed:37,...options});
 assert.equal(engine.initialize().ready,true,id);return {vehicle,baseline,engine};
}

test('all sixteen prepared grip seeds keep original f7621 proposal genes and RNG order until real drift exists, including all four MT clutch searches',async()=>{
 const transmissions=new Set();
 assert.equal(Catalog.list().length,Object.keys(initialPlanHashes).length);
 for(const {id} of Catalog.list()){
  const {vehicle,baseline,engine}=await preparedEngine(id,{populationSize:20,physics:{evaluateGene(){throw Error('Reservation must not simulate');}}});
  const before=G.clone(baseline.gene),jobs=reserve(engine),overlap=jobs.filter(j=>j.kind==='pedal-overlap');
  transmissions.add(vehicle.physics.transmissionType);
  assert.equal(overlap.length,0,id+' must form drift before reserving pedal refinements');
  assert.equal(planHash(jobs),initialPlanHashes[id],id+' consumes exactly the original grip-exploration RNG sequence');
  assert.equal(Strategies.hasPedalEvidence(track,engine._baselineEntry),false);
  assert.equal(jobs.some(j=>j.kind==='clutch-kick'),manualIds.includes(id),id+' clutch transmission eligibility');
  assert.deepEqual(baseline.gene,before,'reservation cannot edit the prepared seed');
  const stats=engine.snapshot().pedalOverlapSearch;
  assert.equal(stats.enabled,true);assert.equal(stats.proposals,overlap.length);
  assert.equal(stats.evaluated,0);assert.equal(stats.valid,0);assert.equal(engine.totalEvaluated,0);
 }
 assert.deepEqual([...transmissions].sort(),['AT','DCT','EV','MT']);
 const {engine}=await preparedEngine('porter-lpg-mt',{populationSize:20,pedalOverlap:false});
 const jobs=reserve(engine);assert.equal(jobs.some(j=>j.kind==='pedal-overlap'),false);
 assert.equal(planHash(jobs),initialPlanHashes['porter-lpg-mt']);
 assert.ok(jobs.some(j=>j.kind==='clutch-kick'),'disabling this slot must not disable clutch search');
 assert.equal(engine.snapshot().pedalOverlapSearch.enabled,false);assert.equal(engine.snapshot().pedalOverlapSearch.proposals,0);
});

test('invalid grip-exploration candidates cannot become parents or open pedal refinement even with an untrusted high score',async()=>{
 // This injected failure checks admission rules, not physical drivability or evolutionary performance.
 const {baseline,engine}=await preparedEngine('supra-3.0t-rz',{populationSize:32}),jobs=reserve(engine);
 const overlaps=jobs.filter(j=>j.kind==='pedal-overlap');assert.equal(overlaps.length,0);
 const frames=baseline.record.map((f,i)=>i===baseline.record.length-1?{...f,status:'offtrack'}:f);
 const failure={...baseline.result,valid:false,status:'offtrack',score:1e12,frames};
 assert.throws(()=>engine.acceptCandidate(jobs[1],failure),/reservation order/);
 assert.equal(engine.totalEvaluated,0);
 for(const job of jobs)engine.acceptCandidate(job,failure);
 assert.equal(engine.best.id,'baseline');assert.deepEqual(engine.parents.map(p=>p.id),['baseline']);
 const stats=engine.snapshot().pedalOverlapSearch;
 assert.equal(stats.proposals,overlaps.length);assert.equal(stats.evaluated,overlaps.length);
 assert.equal(stats.valid,0);assert.equal(stats.improved,0);assert.equal(engine.snapshot().stats.validCount,0);
 const next=reserve(engine);assert.ok(next.every(j=>j.parentId==='baseline'),'failed genes cannot supply the next generation');
});

test('real drift opens refinement only after physical evidence, while reversed completion order and failed-refinement rejection stay deterministic',async()=>{
 const options={populationSize:20,reuse:false},a=await preparedEngine('porter-lpg-mt',options),b=await preparedEngine('porter-lpg-mt',options);
 let overlapCount=0,physicalCount=0;const injectedFailures=[];
 const inspect=(engine,job)=>{
  if(job.kind!=='pedal-overlap')return;
  overlapCount++;const parent=engine._parentEntry(job.parentId),evidence=Strategies.pedalEvidence(track,parent);
  assert.notEqual(parent.id,'baseline');assert.equal(parent.accepted,true);assert.equal(parent.result.valid,true);assert.equal(parent.result.status,'finished');
  assert.equal(Strategies.hasPedalEvidence(track,parent,engine._strategyZones[job.arcIndex]),true);
  assert.ok(evidence.episodes.some(e=>e.distance>=4-1e-9&&e.duration>=.15-1e-9&&job.mutation.anchorS>=e.start&&job.mutation.anchorS<=e.end),'the proposal anchor must lie in an observed sustained scored drift');
 };
 for(let generation=0;generation<2;generation++){
  const batch=reserve(b.engine),results=new Map();
  // Match the production population: all 20 first-generation jobs plus four
  // from generation two use real physics. The remaining 16 deliberately
  // exercise failure admission only; they are not empirical driving results.
  const physicalJobs=generation===0?batch:batch.slice(0,4);
  for(const job of [...physicalJobs].reverse()){results.set(job.id,P.evaluateGene(b.vehicle,track,job.gene,{record:true}));physicalCount++;}
  for(const job of batch){
   const serial=a.engine.planCandidate();assert.deepEqual(serial,job);
   inspect(a.engine,serial);
   const simulated=results.has(job.id),parent=a.engine._parentEntry(job.parentId),before=a.engine.best;
   const frames=simulated?null:[...parent.record.slice(0,-1),{...parent.record.at(-1),status:'offtrack'}];
   const result=simulated?results.get(job.id):{...parent.result,valid:false,status:'offtrack',score:1e12,frames};
   a.engine.acceptCandidate(serial,result);b.engine.acceptCandidate(job,result);
   if(!simulated){injectedFailures.push(job.id);assert.equal(a.engine.best.id,before.id);assert.equal(a.engine.best.result.score,before.result.score);}
   assert.deepEqual(a.engine.lastCandidate,b.engine.lastCandidate);
   results.delete(job.id);
  }
  assert.deepEqual(a.engine.snapshot().history,b.engine.snapshot().history);
  assert.deepEqual(a.engine.best,b.engine.best);
 }
 assert.deepEqual(a.engine.snapshot().pedalOverlapSearch,b.engine.snapshot().pedalOverlapSearch);
 assert.equal(physicalCount,24);assert.equal(injectedFailures.length,16);
 assert.ok(overlapCount>0,'the original 20-candidate grip exploration must produce evidence that opens refinement in the next reservations');
 assert.ok(a.engine.parents.every(parent=>!injectedFailures.includes(parent.id)),'injected failures never become parents');
 assert.ok(a.engine.snapshot().pedalOverlapSearch.evaluated>0);
});

function straight(length=254,width=50){return {id:'pedal-overlap-physical-fixture',length,width,judgedStart:0,judgedEnd:length,obstacles:[],sample:s=>({s,x:s,y:0,z:0,heading:0,curvature:0,widthLeft:width/2,widthRight:width/2}),project:(x,y)=>({s:x,error:y,distance:Math.abs(y)})};}
test('explicit smooth pedal control fixtures reproduce every uncached physical frame and apply rear drive and wheel brakes together',()=>{
 // A wide straight isolates pedal forces and cache correctness; it is not evidence of a successful drift line.
 const road=straight();
 for(const id of ['gr86-2.4-rz-mt','supra-3.0t-rz']){
  const vehicle=Catalog.get(id),gene=G.create();for(let k=0;k<G.KNOTS;k++)gene[k*G.STRIDE+C.throttle]=.55;
  const cache=new Cache.Evaluator(vehicle,road),base=cache.evaluate(gene,{id:'parent'});
  assert.equal(base.valid,true,id);
  // This reproducible control pulse tests forces/cache only. It does not call
  // or bypass the drift-evidence mutation gate and injects no replay frames.
  const child=G.clone(gene),pulse=(s,center,halfWidth)=>Math.abs(s-center)<halfWidth?.5+.5*Math.cos(Math.PI*(s-center)/halfWidth):0;
  for(let k=0;k<G.KNOTS;k++){const j=k*G.STRIDE,s=k*road.length/(G.KNOTS-1);child[j+C.throttle]+=.10*pulse(s,211,22);child[j+C.brake]=.08*pulse(s,216,18);}
  assert.ok(Cache.firstInfluence(gene,child,road.length)>100);
  const cached=cache.evaluate(child,{id:'child',parentId:'parent'}),full=P.evaluateGene(vehicle,road,child,{record:true});
  assert.ok(cached.evaluation.reusedTicks>0);assert.ok(cached.evaluation.simulatedTicks>0);
  assert.deepEqual(physical(cached),full,id+' exact state restoration including wheel and clutch dynamics');
  const overlap=full.frames.filter(f=>f.throttle>.15&&f.brake>.03);
  assert.ok(overlap.length>2,id+' actual applied commands overlap over multiple frames');
  assert.ok(overlap.some(f=>f.wheelForces.slice(2).some(w=>w.driveTorque>0)&&f.wheelForces.slice(0,2).every(w=>w.brakeTorque>0)),id+' propulsion and braking act simultaneously');
  assert.ok(overlap.some(f=>f.wheelForces.slice(2).every(w=>w.brakeTorque>0)),id+' rear brakes remain active as well');
 }
});

test('whole-course points and continuity depend on the trajectory rather than an overlap-pedal reward or penalty',()=>{
 // Identical synthetic poses test scoring independence only, not achievable vehicle behavior.
 const road=straight(102.5),frames=[];
 for(let i=0;i<=100;i++)frames.push({s:2.5+i,time:i/25,x:2.5+i,y:0,vx:25,vy:0,yaw:-.6,beta:.6,speed:25,throttle:.6,brake:0,rearTorque:0,status:i===100?'finished':'running'});
 const vehicle={physics:{massKg:1500}},raw={valid:true,status:'finished',score:0,frames};
 const overlapped={...raw,frames:frames.map(f=>({...f,brake:.12}))};
 const a=Fitness.rank(vehicle,road,raw),b=Fitness.rank(vehicle,road,overlapped);
 assert.ok(a.score>0);assert.equal(a.score,b.score);assert.deepEqual(a.drift.scoring,b.drift.scoring);
 assert.deepEqual(Fitness.replayTimeline(a,road,vehicle).map(f=>[f.score,f.chainMultiplier]),Fitness.replayTimeline(b,road,vehicle).map(f=>[f.score,f.chainMultiplier]));
});
