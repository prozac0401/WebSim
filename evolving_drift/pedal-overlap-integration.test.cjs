'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./genome.js'),P=require('./physics.js'),Cache=require('./evaluation-cache.js');
const Catalog=require('./catalog.js'),Tracks=require('./track.js'),Prepared=require('./prepared-grips.js');
const Evolution=require('./evolution.js'),Strategies=require('./evolution-strategies.js'),Fitness=require('./fitness.js');
const C=G.CHANNELS,track=Tracks.get('kr-kic-t21-kdl-2016-r2');
const manualIds=['porter-lpg-mt','porter-diesel-mt','bmw-m2-3.0t-mt','gr86-2.4-rz-mt'];
const ids=[...manualIds,'supra-3.0t-rz','bmw-m2-3.0t-dct','ioniq5-standard'];
const physical=result=>{const {evaluation,...rest}=result;return rest;};
const reserve=engine=>{const jobs=[];for(let job;(job=engine.planCandidate());)jobs.push(job);return jobs;};
async function preparedEngine(id,options={}){
 const vehicle=Catalog.get(id),baseline=await Prepared.load(vehicle,track);
 const engine=new Evolution.Engine(vehicle,track,{baseline,seed:37,...options});
 assert.equal(engine.initialize().ready,true,id);return {vehicle,baseline,engine};
}

test('prepared MT, AT, DCT and EV parents can reserve overlapping-pedal mutations without startup simulation, while every MT retains clutch-kick proposals',async()=>{
 const transmissions=new Set();
 for(const id of ids){
  const {vehicle,baseline,engine}=await preparedEngine(id,{populationSize:64,physics:{evaluateGene(){throw Error('Reservation must not simulate');}}});
  const before=G.clone(baseline.gene),jobs=reserve(engine),overlap=jobs.filter(j=>j.kind==='pedal-overlap');
  transmissions.add(vehicle.physics.transmissionType);
  assert.ok(overlap.length>0,id+' has a dedicated simultaneous-input proposal');
  for(const job of overlap){
   assert.equal(job.parentId,'baseline');assert.equal(job.mutation.family,'pedal-overlap');
   assert.notDeepEqual(job.gene,before);
   for(let k=0;k<G.KNOTS;k++)for(const channel of [C.throttle,C.brake])assert.ok(job.gene[k*G.STRIDE+channel]>=0&&job.gene[k*G.STRIDE+channel]<=1);
  }
  assert.equal(jobs.some(j=>j.kind==='clutch-kick'),manualIds.includes(id),id+' clutch transmission eligibility');
  assert.deepEqual(baseline.gene,before,'reservation cannot edit the prepared seed');
  const stats=engine.snapshot().pedalOverlapSearch;
  assert.equal(stats.enabled,true);assert.equal(stats.proposals,overlap.length);
  assert.equal(stats.evaluated,0);assert.equal(stats.valid,0);assert.equal(engine.totalEvaluated,0);
 }
 assert.deepEqual([...transmissions].sort(),['AT','DCT','EV','MT']);
 const {engine}=await preparedEngine('porter-lpg-mt',{populationSize:64,pedalOverlap:false});
 const jobs=reserve(engine);assert.equal(jobs.some(j=>j.kind==='pedal-overlap'),false);
 assert.ok(jobs.some(j=>j.kind==='clutch-kick'),'disabling this slot must not disable clutch search');
 assert.equal(engine.snapshot().pedalOverlapSearch.enabled,false);assert.equal(engine.snapshot().pedalOverlapSearch.proposals,0);
});

test('invalid simultaneous-pedal candidates cannot become parents or representatives even with an untrusted high score',async()=>{
 // This injected failure checks admission rules, not physical drivability or evolutionary performance.
 const {baseline,engine}=await preparedEngine('supra-3.0t-rz',{populationSize:32}),jobs=reserve(engine);
 const overlaps=jobs.filter(j=>j.kind==='pedal-overlap');assert.ok(overlaps.length>0);
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

test('prepared-seed reservation and acceptance stay deterministic when physical evaluations finish in reverse order',async()=>{
 const options={populationSize:12,reuse:false},a=await preparedEngine('porter-lpg-mt',options),b=await preparedEngine('porter-lpg-mt',options);
 let overlapCount=0;
 for(let generation=0;generation<2;generation++){
  const batch=reserve(b.engine),results=new Map();
  // Evaluate real physics in the opposite completion order, then commit in reservation order.
  for(const job of [...batch].reverse())results.set(job.id,P.evaluateGene(b.vehicle,track,job.gene,{record:true}));
  for(const job of batch){
   const serial=a.engine.planCandidate();assert.deepEqual(serial,job);
   if(job.kind==='pedal-overlap')overlapCount++;
   const result=results.get(job.id);a.engine.acceptCandidate(serial,result);b.engine.acceptCandidate(job,result);
   assert.deepEqual(a.engine.lastCandidate,b.engine.lastCandidate);
   results.delete(job.id);
  }
  assert.deepEqual(a.engine.snapshot().history,b.engine.snapshot().history);
  assert.deepEqual(a.engine.best,b.engine.best);
 }
 assert.ok(overlapCount>0,'exercise the new scheduling branch rather than only generic mutations');
 assert.deepEqual(a.engine.snapshot().pedalOverlapSearch,b.engine.snapshot().pedalOverlapSearch);
});

function straight(length=254,width=50){return {id:'pedal-overlap-physical-fixture',length,width,judgedStart:0,judgedEnd:length,obstacles:[],sample:s=>({s,x:s,y:0,z:0,heading:0,curvature:0,widthLeft:width/2,widthRight:width/2}),project:(x,y)=>({s:x,error:y,distance:Math.abs(y)})};}
test('late smooth pedal mutations reproduce every uncached physical frame and apply rear drive and wheel brakes together',()=>{
 // A wide straight isolates pedal forces and cache correctness; it is not evidence of a successful drift line.
 const road=straight(),zone={id:'fixture-cue',start:140,cornerStart:160,apex:180,exit:195,end:240,sign:1,turn:.4};
 for(const id of ['gr86-2.4-rz-mt','supra-3.0t-rz']){
  const vehicle=Catalog.get(id),gene=G.create();for(let k=0;k<G.KNOTS;k++)gene[k*G.STRIDE+C.throttle]=.55;
  const cache=new Cache.Evaluator(vehicle,road),base=cache.evaluate(gene,{id:'parent'});
  assert.equal(base.valid,true,id);
  const parent={id:'parent',accepted:true,gene,result:base,record:base.frames};
  const proposal=Strategies.pedalOverlap(vehicle,road,parent,Evolution.createRng(37),{mode:'create',phase:'exit',center:215,zones:[zone],links:[],zone,scale:.7});
  assert.ok(proposal);assert.ok(Cache.firstInfluence(gene,proposal.gene,road.length)>100);
  const cached=cache.evaluate(proposal.gene,{id:'child',parentId:'parent'}),full=P.evaluateGene(vehicle,road,proposal.gene,{record:true});
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
