'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./genome.js'),D=require('./driver.js'),P=require('./physics.js'),Cache=require('./evaluation-cache.js'),Catalog=require('./catalog.js');
const C=G.CHANNELS;
function straight(length=254,width=50){return {id:'clutch-integration',length,width,judgedStart:0,judgedEnd:length,obstacles:[],sample:s=>({s,x:s,y:0,z:0,heading:0,curvature:0,widthLeft:width/2,widthRight:width/2}),project:(x,y)=>({s:x,error:y,distance:Math.abs(y)})};}
function controls(events=[]){const gene=G.create();for(let i=0;i<G.KNOTS;i++)gene[i*G.STRIDE+C.throttle]=.48;for(const knot of events){gene[knot*G.STRIDE+C.clutchKick]=1;gene[knot*G.STRIDE+C.disengageSec]=.12;gene[knot*G.STRIDE+C.reengageSec]=.08;}return gene;}
const manual=Catalog.get('gr86-2.4-rz-mt');
function event(state,gene,vehicle=manual,track={length:127}){const before=structuredClone(state),copy=G.clone(gene),out=D.clutchCommand(vehicle,track,state,gene);assert.deepEqual(state,before,'event observation cannot mutate a checkpoint');assert.deepEqual(gene,copy);return {...state,...out};}

test('current v3 runtime rejects historical v2 genes instead of silently changing their meaning',()=>{
 const saved=require('./test-fixtures/kic-t21-guided-completed-corner.json').child.gene;
 assert.equal(saved.length,128*8);assert.equal(G.VERSION,3);
 assert.throws(()=>G.clone(saved),/v3.*1408.*offline/);
 assert.throws(()=>P.evaluateGene(manual,straight(),Float64Array.from(saved)),/v3.*1408.*offline/);
});

test('clutch event input is available for exactly the four MT variants and ignored by other transmissions',()=>{
 const gene=controls([20]),enabled=[];
 for(const vehicle of Catalog.list()){
  const out=event({s:20,time:1,...D.initialClutchState()},gene,vehicle);
  const isManual=(vehicle.physics.transmissionType||vehicle.profile.transmissionType)==='MT';
  assert.equal(out.clutch,isManual?1:0,vehicle.id);assert.equal(out.clutchKickCount,isManual?1:0,vehicle.id);
  if(isManual)enabled.push(vehicle.id);
 }
 assert.deepEqual(enabled.sort(),['porter-lpg-mt','porter-diesel-mt','bmw-m2-3.0t-mt','gr86-2.4-rz-mt'].sort());
});

test('clutch events only trigger after crossing their distance knot, not from nearest-knot interpolation',()=>{
 const gene=controls([20]);let state={s:19.99,time:1,...D.initialClutchState()};
 state=event(state,gene);assert.equal(state.clutch,0);assert.equal(state.clutchKickCount,0);
 state=event({...state,s:20,time:1.01},gene);assert.equal(state.clutch,1);assert.equal(state.clutchKickCount,1);
 state=event({...state,time:1.02},gene);assert.equal(state.clutchKickCount,1,'same knot cannot retrigger');
});

test('clutch event closes on elapsed time when progress stops, and cooldown discards passed events',()=>{
 const gene=controls([20,21,22]);let state=event({s:20,time:1,...D.initialClutchState()},gene);
 state=event({...state,s:21,time:1.05},gene);assert.equal(state.clutchKickCount,1);
 state=event({...state,time:1.16},gene);assert.ok(state.clutch>.49&&state.clutch<.51);
 state=event({...state,time:1.21},gene);assert.equal(state.clutch,0);assert.equal(state.clutchKickActive,0);
 state=event({...state,time:1.45},gene);assert.equal(state.clutchKickCount,1,'passed knot was consumed while event was active');
 state=event({...state,s:22,time:1.46},gene);assert.equal(state.clutchKickCount,2);
 state=event({...state,s:21,time:1.9},gene);assert.equal(state.clutch,0);assert.equal(state.clutchKickCount,2,'backtracking cannot replay a consumed event');
});

test('clutch event serialization preserves all lifecycle state and a fresh experiment resets it',()=>{
 const gene=controls([20]);const state=event({s:20,time:1,...D.initialClutchState()},gene);
 const restored=JSON.parse(JSON.stringify(state));
 assert.deepEqual(event({...state,time:1.17},gene),event({...restored,time:1.17},gene));
 assert.equal(event({s:20,time:5,...D.initialClutchState()},gene).clutchKickCount,1);
 for(const key of Object.keys(D.initialClutchState()))assert.ok(D.TELEMETRY.includes(key));
});

test('physical clutch event checkpoints reproduce the full 120 Hz run exactly after prefix reuse',()=>{
 const track=straight(),gene=controls([72]),cache=new Cache.Evaluator(manual,track),base=cache.evaluate(gene,{id:'parent'});
 assert.equal(base.valid,true);assert.equal(base.frames.at(-1).clutchKickCount,1);
 assert.ok(base.frames.some(f=>f.clutchKickActive===1));
 const ds=track.length/(G.KNOTS-1);
 const knot=Array.from({length:126},(_,i)=>i+1).find(k=>{const frame=base.frames.findLast(f=>f.status==='running'&&f.s<(k-1)*ds-1e-9);return frame?.clutchKickActive===1&&frame.clutchEventStart>=0;});
 assert.ok(knot,'the actual event has a reusable recorded checkpoint');
 const child=G.clone(gene);child[knot*G.STRIDE+C.throttle]-=.01;
 const cached=cache.evaluate(child,{id:'child',parentId:'parent'}),full=P.evaluateGene(manual,track,child,{record:true});
 const {evaluation,...physical}=cached;assert.ok(evaluation.reusedTicks>0);assert.ok(evaluation.simulatedTicks>0);
 assert.equal(base.frames[evaluation.reusedTicks/2].clutchKickActive,1);
 assert.deepEqual(physical,full,'engine speed, clutch state and every trajectory frame must survive cache resume');
 const returned=cached.frames.find(f=>f.clutchKickActive===1);returned.clutchEventStart=999;returned.engineOmega=999;
 const duplicate=cache.evaluate(child,{id:'duplicate'});assert.deepEqual((({evaluation,...r})=>r)(duplicate),full,'caller mutation cannot corrupt cached clutch state');
 for(const [channel,value]of [[C.clutchKick,0],[C.disengageSec,.20],[C.reengageSec,.18]]){
  const changed=G.clone(gene);changed[72*G.STRIDE+channel]=value;
  const resumed=cache.evaluate(changed,{id:'event-channel-'+channel,parentId:'parent'}),complete=P.evaluateGene(manual,track,changed,{record:true});
  assert.ok(resumed.evaluation.reusedTicks>0);assert.ok(resumed.evaluation.simulatedTicks>0);
  assert.deepEqual((({evaluation,...r})=>r)(resumed),complete,'event enable and duration edits must invalidate the affected physical suffix');
  assert.equal(complete.frames.at(-1).clutchKickCount,channel===C.clutchKick?0:1);
 }
});
