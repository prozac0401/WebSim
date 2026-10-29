'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Cache=require('./evaluation-cache.js'),G=require('./genome.js'),P=require('./physics.js'),Catalog=require('./catalog.js');
const vehicle=Catalog.get(),C=G.CHANNELS;
function straight(length=160,width=40){return {id:'cache-test',length,width,judgedStart:5,judgedEnd:length-5,obstacles:[],sample:s=>({s,x:s,y:0,z:0,heading:0,curvature:0,widthLeft:width/2,widthRight:width/2}),project:(x,y)=>({s:x,error:y,distance:Math.abs(y)})};}
function gene(){const g=G.create();for(let i=0;i<G.KNOTS;i++)g[i*G.STRIDE+C.throttle]=.6;return g;}
function physical(result){const {evaluation,...rest}=result;return rest;}
function exact(evaluator,track,g,options){const full=P.evaluateGene(vehicle,track,g,{record:true}),cached=evaluator.evaluate(g,options);assert.deepEqual(physical(cached),full);assert.equal(cached.evaluation.totalTicks,cached.evaluation.simulatedTicks+cached.evaluation.reusedTicks);return cached;}

test('first influence includes interpolation, discrete gear and the full driver line lookahead',()=>{
 const a=gene(),length=635,ds=5;
 assert.equal(Cache.firstInfluence(a,a,length),Infinity);
 for(let channel=0;channel<G.STRIDE;channel++){
  const b=G.clone(a);b[50*G.STRIDE+channel]+=.1;
  const expected=(50-(channel===C.gearHold ? .5 : 1))*ds-(channel===C.lineOffset?16:0),actual=Cache.firstInfluence(a,b,length);
  assert.ok(actual<expected&&expected-actual<1e-9,`channel ${channel} starts conservatively before ${expected}`);
 }
});

test('all eight late channel changes reproduce every full-run frame and save exact physical ticks',()=>{
 const track=straight(),a=gene(),evaluator=new Cache.Evaluator(vehicle,track),base=exact(evaluator,track,a,{id:'parent'});
 assert.equal(base.valid,true);assert.equal(base.evaluation.reusedTicks,0);
 const amounts=[.003,-.04,.02,.12,.03,.05,.03,3];
 for(let channel=0;channel<G.STRIDE;channel++){
  const b=G.clone(a);for(let knot=90;knot<95;knot++)b[knot*G.STRIDE+channel]+=amounts[channel];
  const result=exact(evaluator,track,b,{id:'child-'+channel,parentId:'parent'});
  assert.ok(result.evaluation.reusedTicks>0,`channel ${channel} reuses a physical prefix`);
  assert.ok(result.evaluation.simulatedTicks>0);assert.ok(result.evaluation.reusedTicks%2===0);
 }
});

test('cached state is isolated from returned frames and no failed or prepared record can seed it',()=>{
 const track=straight(),a=gene(),evaluator=new Cache.Evaluator(vehicle,track,{record:[{s:100,time:1}],maxEntries:2});
 assert.deepEqual(evaluator.cachedIds(),[]);assert.equal(evaluator.remember,undefined);
 const stopped=G.create(),failure=exact(evaluator,track,stopped,{id:'failed'});
 assert.equal(failure.valid,false);assert.deepEqual(evaluator.cachedIds(),[]);
 const first=evaluator.evaluate(a,{id:'parent'});first.frames[100].x=999;first.frames[100].wheelOmega[0]=999;a[0]=.5;
 const child=gene();child[100*G.STRIDE+C.throttle]=.5;
 const result=exact(evaluator,track,child,{id:'child',parentId:'parent'});assert.ok(result.evaluation.cacheHit);
 assert.ok(!evaluator.cachedIds().includes('failed'));
 const failing=gene();for(let i=75;i<128;i++){failing[i*8+C.throttle]=0;failing[i*8+C.brake]=1;}
 const bad=exact(evaluator,track,failing,{id:'failed-after-prefix'});assert.equal(bad.valid,false);assert.ok(bad.evaluation.reusedTicks>0);
 assert.ok(!evaluator.cachedIds().includes('failed-after-prefix'));
});

test('bounded caches and reset instances preserve results, including exact whole-record hits',()=>{
 const track=straight(),a=gene(),cache=new Cache.Evaluator(vehicle,track,{identity:'one',maxEntries:1}),first=cache.evaluate(a,{id:'a'});
 const same=exact(cache,track,a,{id:'same'});assert.equal(same.evaluation.simulatedTicks,0);assert.equal(same.evaluation.reusedTicks,first.evaluation.totalTicks);
 assert.deepEqual(cache.cachedIds(),['same']);
 const b=G.clone(a);b[110*8+C.throttle]=.5;exact(cache,track,b,{id:'b'});assert.deepEqual(cache.cachedIds(),['b']);
 for(const options of [{enabled:false},{maxFrames:1},{identity:'new-runtime'}]){
  const fresh=new Cache.Evaluator(vehicle,track,options),result=exact(fresh,track,a,{id:'fresh'});assert.equal(result.evaluation.reusedTicks,0);
  if(options.enabled===false||options.maxFrames===1)assert.deepEqual(fresh.cachedIds(),[]);
 }
});

test('odd terminal ticks retain exact recording parity when a late input changes',()=>{
 const long=straight(),a=gene(),run=P.evaluateGene(vehicle,long,a),frame=run.frames[Math.floor(run.frames.length*.8)];
 // This intermediate recorded state is an even tick. A finish just after it
 // is an odd tick; constant genes keep the physical launch independent of L.
 const track=straight(frame.s+.001),cache=new Cache.Evaluator(vehicle,track),base=exact(cache,track,a,{id:'parent'});
 assert.equal(base.evaluation.totalTicks%2,1);
 const child=G.clone(a);child[115*8+C.counterLead]+=.01;
 const result=exact(cache,track,child,{id:'child',parentId:'parent'});assert.equal(result.evaluation.totalTicks%2,1);assert.ok(result.evaluation.cacheHit);
});

test('resuming during a real gear shift preserves its timer, transient torque and every later frame',()=>{
 const track=straight(260),a=gene(),cache=new Cache.Evaluator(vehicle,track),base=cache.evaluate(a,{id:'parent'}),ds=track.length/127;
 const knot=Array.from({length:126},(_,i)=>i+1).find(i=>{const frame=base.frames.findLast(f=>f.status==='running'&&f.s<(i-1)*ds-1e-9);return frame?.shiftTimer>.05&&frame.s>20;});
 assert.ok(knot,'the physical run contains a usable shift checkpoint');
 const child=G.clone(a);child[knot*8+C.throttle]-=.01;
 const result=exact(cache,track,child,{id:'child',parentId:'parent'});
 assert.ok(base.frames[result.evaluation.reusedTicks/2].shiftTimer>.05);assert.ok(result.evaluation.cacheHit);
});

test('a real prepared gene is simulated before caching; recoupled late line and complete fitness stay exact',async()=>{
 const Tracks=require('./track.js'),Prepared=require('./prepared-grips.js'),Strategies=require('./evolution-strategies.js'),Fitness=require('./fitness.js');
 const track=Tracks.get('kr-kic-t21-kdl-2016-r2'),baseline=await Prepared.load(vehicle,track),cache=new Cache.Evaluator(vehicle,track);
 assert.deepEqual(cache.cachedIds(),[]);
 const first=cache.evaluate(baseline.gene,{id:'runtime-parent'});assert.equal(first.valid,true);assert.equal(first.evaluation.reusedTicks,0);
 const child=G.clone(baseline.gene);for(let i=85;i<90;i++)child[i*8+C.lineOffset]+=.02;
 const coupled=G.normalize(Strategies.couple(vehicle,track,baseline.gene,child,first.frames),{maxSteerRad:vehicle.physics.maxSteer,gearCount:vehicle.physics.gearRatios.length});
 assert.ok(coupled.some((value,index)=>index<85*8&&value!==baseline.gene[index]),'line coupling changes earlier steer knots');
 const full=P.evaluateGene(vehicle,track,coupled),cached=cache.evaluate(coupled,{id:'child',parentId:'runtime-parent'});
 assert.deepEqual(physical(cached),full);assert.ok(cached.evaluation.reusedTicks>cached.evaluation.simulatedTicks);
 const rank=r=>Fitness.rank(vehicle,track,r,r.frames,{reference:baseline.record});assert.deepEqual(rank(physical(cached)),rank(full));
});
