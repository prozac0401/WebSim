'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('./catalog.js');
const tracks = require('./track.js');
const physics = require('./physics.js');
const genome = require('./genome.js');
const driver = require('./driver.js');
const baselines = new Map();
const near = (actual, expected, tolerance = 1e-8, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);

function straightTrack() {
  return {
    length: 2000, width: 100, judgedStart: 120, judgedEnd: 1900, obstacles: [],
    sample: s => ({ x: s, y: 0, s, heading: 0, curvature: 0 }),
    project: (x, y) => ({ x, y: 0, s: x, error: y, distance: Math.abs(y), heading: 0 })
  };
}

function slopedTrack(gx,gy=0,muScale=1){
  const track=straightTrack();
  track.sample=s=>({x:s,y:0,s,heading:0,curvature:0,z:gx*s,grade:gx,bank:Math.atan(gy)});
  track.surface=(x,y)=>({z:gx*x+gy*y,gradientX:gx,gradientY:gy,normalZ:1/Math.hypot(1,gx,gy),muScale});
  return track;
}

test('asset body origins shift collision hulls and obstacles while keeping front contacts at the physical axles',()=>{
  const car=catalog.get('g80-2.5t-rwd'),p=car.physics,track=straightTrack(),state={x:20,y:0,s:20,yaw:0};
  const centre=physics.bodyCenter(car,state),body=physics.footprint(car,state),neutral={...car,physics:{...p,bodyCenterOffsetM:0}};
  near(body.reduce((n,v)=>n+v.x,0)/4,centre.x);near(centre.x,state.x+p.bodyCenterOffsetM);
  assert.deepEqual(physics.frontContacts(car,state),physics.frontContacts(neutral,state));
  const rectangle=(x,y)=>[{x:x-.01,y:y-.01},{x:x+.01,y:y-.01},{x:x+.01,y:y+.01},{x:x-.01,y:y+.01}];
  for(const polygon of [false,true]){
    const x=state.x-p.lengthM/2+p.bodyCenterOffsetM/2;
    track.obstacles=polygon?[{type:'polygon',points:rectangle(x,0)}]:[{x,y:0,r:.01}];
    assert.equal(physics.failure(car,track,state),'collision','the shifted rear overhang reaches this obstacle');
    assert.equal(physics.failure(neutral,track,state),null);
    const clearX=state.x+p.lengthM/2+p.bodyCenterOffsetM/2;
    track.obstacles=polygon?[{type:'polygon',points:rectangle(clearX,0)}]:[{x:clearX,y:0,r:.01}];
    assert.equal(physics.failure(car,track,state),null,'the old geometric-origin nose no longer produces a false collision');
    assert.equal(physics.failure(neutral,track,state),'collision');
  }
  const rotated={...state,yaw:.8};near(physics.footprint(car,rotated).reduce((n,v)=>n+v.x,0)/4,state.x+p.bodyCenterOffsetM*Math.cos(.8));
  near(physics.footprint(car,rotated).reduce((n,v)=>n+v.y,0)/4,p.bodyCenterOffsetM*Math.sin(.8));
});

test('body-origin alignment changes no force, mass, wheel position or integrated free-road trajectory',()=>{
  const car=catalog.get('porter-lpg-mt'),neutral={...car,physics:{...car.physics,bodyCenterOffsetM:0}},track=straightTrack(),a=physics.initialState(car,track),b=physics.initialState(neutral,track);
  for(let i=0;i<240;i++){const input={steer:i<120?.025:-.025,throttle:.6,brake:0};physics.step(car,track,a,input);physics.step(neutral,track,b,input);}
  assert.equal(a.status,'running');assert.deepEqual(physics.frame(a),physics.frame(b));
});

test('explicit flat surfaces preserve the previous planar trajectory',()=>{
  const car=catalog.get(),implicit=tracks.create(),explicit={...implicit,surface:()=>({z:17,gradientX:0,gradientY:0,normalZ:1,muScale:1})};
  const a=physics.initialState(car,implicit),b=physics.initialState(car,explicit);
  for(let i=0;i<240;i++){const input={steer:i<100?.02:-.015,throttle:.65,brake:0};physics.step(car,implicit,a,input);physics.step(car,explicit,b,input);}
  for(const key of ['x','y','yaw','vx','vy','r','s','speed','beta','torque','rearTorque'])assert.equal(a[key],b[key],key);
  assert.deepEqual(a.wheelOmega,b.wheelOmega);assert.deepEqual(a.wheelSlip,b.wheelSlip);
  // Preserve the historical integrator fixture at its original 900-rpm
  // reference. The current stock Supra now inherits EV2's 650-rpm observed
  // setting; its flat-versus-explicit invariance is checked above unchanged.
  const referenceCar={...car,physics:{...car.physics,idleRPM:900}},reference=physics.initialState(referenceCar,implicit);
  for(let i=0;i<240;i++)physics.step(referenceCar,implicit,reference,{steer:i<100?.02:-.015,throttle:.65,brake:0});
  for(const [key,value] of Object.entries({x:8.892033768744227,y:-.07664032218749643,yaw:-.02714837605785923,vx:7.243430819326722,vy:-.21927440952674437,r:-.04102022704698218,torque:297.41925839731573}))near(reference[key],value,1e-10,'legacy '+key);
  assert.equal(a.z,0);assert.equal(b.z,17);assert.equal(b.grade,0);assert.equal(b.bank,0);
});

test('slope gravity exchanges kinetic and potential energy with the correct sign',()=>{
  const source=catalog.get('ioniq5-standard'),car={...source,physics:{...source.physics,dragArea:1e-12}};
  for(const grade of [-.1,.1]){
    const track=slopedTrack(grade,0,0),state=physics.initialState(car,track);state.vx=20;state.speed=20;state.wheelOmega.fill(20/car.physics.tireRadius);
    const energy=a=>.5*(a.vx*a.vx+a.vy*a.vy+(grade*a.vx)**2)+9.81*a.z,initialEnergy=energy(state);
    for(let i=0;i<60;i++)physics.step(car,track,state,{steer:0,throttle:0,brake:0});
    assert.equal(state.status,'running');assert.equal(Math.sign(state.vx-20),-Math.sign(grade));
    near(state.z,grade*state.x,1e-9);near(state.grade,grade);near(energy(state),initialEnergy,.005,'energy per unit mass');
    near(state.wheelForces.reduce((n,w)=>n+w.load,0),car.physics.massKg*9.81/Math.hypot(1,grade),1e-7,'slope normal load');
  }
});

test('crossfall produces downhill lateral motion and reduces normal load',()=>{
  const source=catalog.get('ioniq5-standard'),car={...source,physics:{...source.physics,dragArea:1e-12}};
  for(const crossfall of [-.15,.15]){
    const track=slopedTrack(0,crossfall,0),state=physics.initialState(car,track);
    physics.step(car,track,state,{steer:0,throttle:0,brake:0});
    assert.equal(Math.sign(state.vy),-Math.sign(crossfall));near(state.bank,Math.atan(crossfall));near(state.z,crossfall*state.y);
    const [fl,fr,rl,rr]=state.wheelForces.map(w=>w.load);
    near(fl+fr+rl+rr,car.physics.massKg*9.81/Math.hypot(1,crossfall),1e-7);
    assert.equal(Math.sign(fr+rr-fl-rl),Math.sign(crossfall),'initial static load favours the downhill side');
  }
});

test('surface friction scales tyre force capacity without changing the stock vehicle',()=>{
  const car=catalog.get(),before=JSON.stringify(car.physics),forces=[];
  for(const scale of [1,.25]){const track=slopedTrack(0,0,scale),state=physics.initialState(car,track);Object.assign(state,{vx:12,vy:6,speed:Math.hypot(12,6)});state.wheelOmega.fill(12/car.physics.tireRadius);physics.step(car,track,state,{steer:0,throttle:0,brake:0});forces.push(state.wheelForces.reduce((sum,w)=>sum+Math.hypot(w.fx,w.fy),0));}
  assert.ok(forces[1]<forces[0]*.4);assert.equal(JSON.stringify(car.physics),before);
});

test('asymmetric varying widths and contains require both front contact points',()=>{
  const car=catalog.get(),track=straightTrack(),state=physics.initialState(car,track);
  Object.assign(state,{x:20,y:.5,s:20});track.sample=s=>({x:s,y:0,s,heading:0,curvature:0,widthLeft:s>15&&s<25?1:5,widthRight:5});
  assert.equal(physics.failure(car,track,state), 'offtrack','one front tyre leaves the narrow left edge');
  track.contains=(x,y)=>y<=1&&y>=-5;assert.equal(physics.failure(car,track,state),'offtrack','contains overrides the wide legacy width');
  state.y=-1;assert.equal(physics.failure(car,track,state),null);
});

test('road intrusions beneath body overhang do not fail valid front contacts',()=>{
  const Course=require('./course-model.js'),car=catalog.get(),track=straightTrack(),state=physics.initialState(car,track);
  const polygon=[{x:0,y:-5},{x:40,y:-5},{x:40,y:5},{x:20.33,y:5},{x:20.33,y:.5},{x:20.31,y:.5},{x:20.31,y:5},{x:0,y:5}];
  track.boundaryPolygons=[polygon];track.contains=(x,y)=>Course.inPolygon(x,y,polygon);Object.assign(state,{x:20,y:0,s:20});
  assert.ok(physics.footprint(car,state).every(p=>track.contains(p.x,p.y)));assert.ok(track.contains(state.x,state.y));
  assert.equal(physics.failure(car,track,state),null);
});

test('swept outer boundaries reject a concave notch between two valid poses',()=>{
  const Course=require('./course-model.js'),car=catalog.get(),track=straightTrack(),p=car.physics,l=p.wheelbaseM*(1-(p.frontWeightFraction||.52)),w=(p.trackWidthM||p.widthM*.84)/2;
  const x1=20+l+.07,x2=20+l+.13,y=-w+.15;
  const polygon=[{x:-20,y:-5},{x:x1,y:-5},{x:x1,y},{x:x2,y},{x:x2,y:-5},{x:50,y:-5},{x:50,y:5},{x:-20,y:5}];
  track.boundaryPolygons=[polygon];track.contains=(x,y)=>Course.inPolygon(x,y,polygon);
  const old={x:20,y:0,s:20,yaw:0},next={x:20.2,y:.2,s:20.2,yaw:0},mid={x:20.1,y:.1,s:20.1,yaw:0};
  assert.equal(physics.failure(car,track,old),null);assert.equal(physics.failure(car,track,next),null);
  assert.equal(physics.failure(car,track,mid),'offtrack','one front contact crosses the notch between endpoints');
  assert.equal(physics.failure(car,track,next,old),'offtrack');
});

test('swept outer boundaries cover the arc of each rotating front contact',()=>{
  const Course=require('./course-model.js'),car=catalog.get(),track=straightTrack(),p=car.physics,l=p.wheelbaseM*(1-(p.frontWeightFraction||.52)),w=(p.trackWidthM||p.widthM*.84)/2,R=Math.hypot(l,w),heading=Math.atan2(w,l),halfAngle=.04;
  const limit=20+R*(1+Math.cos(halfAngle))/2;
  const polygon=[{x:0,y:-10},{x:limit,y:-10},{x:limit,y:10},{x:0,y:10}];
  track.boundaryPolygons=[polygon];track.contains=(x,y)=>Course.inPolygon(x,y,polygon);
  const old={x:20,y:0,s:20,yaw:heading-halfAngle},next={...old,yaw:heading+halfAngle},mid={...old,yaw:heading};
  assert.equal(physics.failure(car,track,old),null);assert.equal(physics.failure(car,track,next),null);
  assert.equal(physics.failure(car,track,mid),'offtrack');
  assert.equal(physics.failure(car,track,next,old),'offtrack','the endpoint chord alone misses the rotating contact');
  const inclusive=polygon.map(p=>({...p,x:p.x===limit?20+R:p.x}));track.boundaryPolygons=[inclusive];
  assert.equal(physics.failure(car,track,next,old),null,'a contact may touch the road boundary at the arc extremum');
});

test('swept front contacts may cross connected overlapping road polygons',()=>{
  const Course=require('./course-model.js'),car=catalog.get(),track=straightTrack();
  const rectangle=(x0,x1)=>[{x:x0,y:-5},{x:x1,y:-5},{x:x1,y:5},{x:x0,y:5}];
  track.boundaryPolygons=[rectangle(0,21),rectangle(19,50)];
  track.contains=(x,y)=>track.boundaryPolygons.some(p=>Course.inPolygon(x,y,p));
  assert.equal(physics.failure(car,track,{x:22,y:.3,s:22,yaw:.02},{x:18,y:0,s:18,yaw:0}),null);
});

test('polygon barriers detect crossed edges, contained obstacles and swept contact',()=>{
  const car=catalog.get(),track=straightTrack(),state=physics.initialState(car,track);Object.assign(state,{x:20,y:0,s:20});
  const rectangle=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  for(const obstacle of [{type:'polygon',points:rectangle(16,-.05,24,.05)},{polygon:{points:rectangle(19.9,-.1,20.1,.1)}}]){track.obstacles=[obstacle];assert.equal(physics.failure(car,track,state),'collision');}
  track.obstacles=[{type:'polygon',points:rectangle(14.9,-2,15.1,2)}];assert.equal(physics.failure(car,track,state),null);
  assert.equal(physics.failure(car,track,state,{x:10,y:0,yaw:0}),'collision','a thin wall between steps must not be skipped');
  const small={...car,physics:{...car.physics,lengthM:1,widthM:1}};
  track.obstacles=[{type:'polygon',points:[{x:19,y:2},{x:22,y:2},{x:22,y:-2},{x:21,y:-2},{x:21,y:1},{x:19,y:1}]}];
  assert.equal(physics.failure(small,track,state),null,'a concave polygon is not its bounding box');
});

test('both front contacts may remain on the road while the rear and centre leave it',()=>{
  const car=catalog.get(),track=straightTrack();track.width=4;
  const state={x:20,y:-2.5,s:20,yaw:Math.PI/2},p=car.physics;
  const contacts=physics.frontContacts(car,state),halfTrack=(p.trackWidthM||p.widthM*.84)/2;
  assert.ok(contacts.every(point=>Math.abs(point.y)<=2));assert.ok(Math.abs(state.y)>2);
  const rearY=state.y-p.wheelbaseM*(p.frontWeightFraction||.52);
  assert.ok(rearY< -2);assert.ok(physics.footprint(car,state).some(point=>Math.abs(point.y)>2));
  assert.equal(physics.failure(car,track,state),null,'rear/body overhang is allowed by the selected two-front-contact rule');
  const oneOut={x:20,y:2-halfTrack+.01,s:20,yaw:0};
  assert.equal(physics.frontContacts(car,oneOut).filter(point=>Math.abs(point.y)<=2).length,1);
  assert.equal(physics.failure(car,track,oneOut),'offtrack');
  assert.equal(physics.failure(car,track,{...oneOut,y:2-halfTrack}),null,'outer boundary contact counts as on-road');
  track.obstacles=[{x:20,y:rearY,r:.05}];
  assert.equal(physics.failure(car,track,state),'collision','rear-body contact with a barrier still fails');
});

test('excluded islands affect individual front paths without requiring the axle or rear to stay over road',()=>{
  const car=catalog.get(),track=straightTrack(),state={x:20,y:0,s:20,yaw:0},contacts=physics.frontContacts(car,state);
  const square=(x,y,r=.04)=>[{x:x-r,y:y-r},{x:x+r,y:y-r},{x:x+r,y:y+r},{x:x-r,y:y+r}];
  track.excludedPolygons=[square(contacts[0].x,0)];
  assert.equal(physics.failure(car,track,state),null,'a non-collision island between the two front tyres is permitted');
  track.excludedPolygons=[square(contacts[0].x,contacts[0].y)];
  assert.equal(physics.failure(car,track,state),'offtrack');
  track.excludedPolygons=[square(contacts[0].x+.1,contacts[0].y,.02)];
  const next={...state,x:20.2,s:20.2};
  assert.equal(physics.failure(car,track,state),null);assert.equal(physics.failure(car,track,next),null);
  assert.equal(physics.failure(car,track,next,state),'offtrack','a hole crossed entirely between integration steps is detected');
  track.excludedPolygons=[square(20-1,0)];assert.equal(physics.failure(car,track,state),null,'rear/body overlap with a road exclusion is allowed');
});

test('a rotating contact cannot arc through an excluded island between valid endpoints',()=>{
  const car=catalog.get(),track=straightTrack(),p=car.physics,l=p.wheelbaseM*(1-(p.frontWeightFraction||.52)),w=(p.trackWidthM||p.widthM*.84)/2,R=Math.hypot(l,w),heading=Math.atan2(w,l),d=.00015;
  const old={x:20,y:0,s:20,yaw:heading-.04},next={...old,yaw:heading+.04};
  track.excludedPolygons=[[{x:20+R-d,y:-d},{x:20+R+d,y:-d},{x:20+R+d,y:d},{x:20+R-d,y:d}]];
  assert.equal(physics.failure(car,track,old),null);assert.equal(physics.failure(car,track,next),null);
  assert.equal(physics.failure(car,track,next,old),'offtrack');
});

test('a polygon union cannot hide an interior hole from the rotating front-contact sweep',()=>{
  const car=catalog.get(),old={x:20,y:0,yaw:0,s:20},next={...old,yaw:.2},quarter={...old,yaw:.05};
  const hole=physics.frontContacts(car,quarter)[0],r=.0005,x0=hole.x-r,x1=hole.x+r,y0=hole.y-r,y1=hole.y+r;
  const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  // The union's enclosed 1mm hole has no separate excludedPolygons entry.
  const track={length:200,width:200,obstacles:[],boundaryPolygons:[rect(-100,-100,x0,100),rect(x1,-100,100,100),rect(x0,-100,x1,y0),rect(x0,y1,x1,100)]};
  assert.equal(physics.failure(car,track,old),null);assert.equal(physics.failure(car,track,next),null);
  assert.equal(physics.failure(car,track,quarter),'offtrack');assert.equal(physics.failure(car,track,next,old),'offtrack');
});

test('score normalization uses the actual judged interval length',()=>{
  const car=catalog.get(),track=straightTrack();Object.assign(track,{length:60,width:200,judgedStart:0,judgedEnd:60});
  const gene=genome.fromLegacy([.08,.5,0,.08,.5,0]);
  for(let i=0;i<genome.KNOTS;i++){gene[i*genome.STRIDE+genome.CHANNELS.targetSlip]=-.2;gene[i*genome.STRIDE+genome.CHANNELS.driveSlip]=.15;}
  const run=physics.evaluateGene(car,track,gene);
  assert.equal(run.status,'finished');assert.ok(run.score>0);
  near(run.score,run.frames.at(-1).scoreIntegral/60*100,1e-12);
});

for (const car of catalog.list()) {
  test('a valid grip baseline exists for stock ' + car.id, () => {
    const baseline = physics.buildGripBaseline(car, tracks.create());
    assert.equal(baseline.result.status, 'finished');
    assert.equal(baseline.result.valid, true);
    assert.ok(baseline.result.time > 0 && baseline.result.time <= 90);
    assert.ok(baseline.result.maxAngle < 7, 'baseline must remain a grip run');
    assert.ok(baseline.result.peakWheelSlip < .32, 'baseline must not qualify through excess wheelspin');
    assert.equal(baseline.gene.length,genome.LENGTH);
    assert.ok(Array.from(baseline.gene).every(Number.isFinite));
    assert.ok(baseline.result.frames.length > 100, 'baseline retains an actual replay');
    baselines.set(car.id, baseline);
  });
}

test('the same genome reproduces the recorded trajectory exactly', () => {
  const car = catalog.get(), track = tracks.create();
  const baseline = baselines.get(car.id) || physics.buildGripBaseline(car, track);
  const rerun = physics.evaluateGene(car, track, baseline.gene);
  assert.equal(rerun.status, baseline.result.status);
  assert.equal(rerun.time, baseline.result.time);
  assert.equal(rerun.score, baseline.result.score);
  assert.deepEqual(rerun.frames, baseline.result.frames);
  assert.ok(!('vehicle' in rerun.frames[0]), 'replay excludes mutable source vehicle references');
  if (rerun.frames.length > 1) {
    const untouched = rerun.frames[1].wheelOmega[0];
    rerun.frames[0].wheelOmega[0] = 123456;
    assert.equal(rerun.frames[1].wheelOmega[0], untouched, 'recorded frames must not share wheel arrays');
  }
});

test('leaving the road fails in the current step and cannot continue earning progress', () => {
  const car = catalog.get(), track = tracks.create(), state = physics.initialState(car, track);
  const where = track.sample(50);
  Object.assign(state, { x: where.x, y: where.y + track.width / 2, yaw: where.heading, s: 50 });
  physics.step(car, track, state, { steer: 0, throttle: 0, brake: 0 });
  assert.equal(state.status, 'offtrack');
  near(state.time, physics.DT);
  const failed = physics.frame(state);
  physics.step(car, track, state, { steer: .4, throttle: 1, brake: 0 });
  assert.deepEqual(physics.frame(state), failed, 'failed states must be terminal');
});

test('body contact with a course obstacle fails in the current step', () => {
  const car = catalog.get(), track = tracks.create(), state = physics.initialState(car, track);
  const obstacle = track.obstacles[0];
  Object.assign(state, { x: obstacle.x, y: obstacle.y, s: obstacle.s, yaw: track.sample(obstacle.s).heading });
  physics.step(car, track, state, { steer: 0, throttle: 0, brake: 1 });
  assert.equal(state.status, 'collision');
  near(state.time, physics.DT);
  const failed = physics.frame(state);
  physics.step(car, track, state, { steer: 0, throttle: 1, brake: 0 });
  assert.deepEqual(physics.frame(state), failed);
});

test('a moving spin continues under the same forces and can cross the finish while on the road',()=>{
  const car=catalog.get(),track=straightTrack();
  for(const sign of [-1,1]){
    const a=physics.initialState(car,track);Object.assign(a,{x:100,s:100,yaw:-sign*76*Math.PI/180,vx:8,vy:0,speed:8,r:0});a.wheelOmega.fill(8/car.tireRadius);
    physics.step(car,track,a,{steer:0,throttle:0,brake:0});
    assert.equal(a.status,'running','high sideslip alone is recoverable');
    assert.ok(Math.abs(a.beta)>=75*Math.PI/180);assert.ok(a.speed>=3);
    const before=physics.frame(a);for(let i=0;i<30;i++)physics.step(car,track,a,{steer:0,throttle:0,brake:0});
    assert.equal(a.status,'running');assert.ok(a.time>before.time);assert.notEqual(a.x,before.x);assert.notEqual(a.beta,before.beta,'the tyre forces evolve the pose instead of freezing or clamping it');
    const finishTrack={...track,length:100},finish=physics.initialState(car,finishTrack);
    Object.assign(finish,{x:99.99,s:99.99,yaw:-sign*76*Math.PI/180,vx:8,vy:0,speed:8,r:0});finish.wheelOmega.fill(8/car.tireRadius);
    physics.step(car,finishTrack,finish,{steer:0,throttle:0,brake:0});
    assert.ok(Math.abs(finish.beta)>=75*Math.PI/180);assert.equal(finish.status,'finished');assert.equal(physics.result(finish,[physics.frame(finish)],finishTrack).valid,true);
  }
});

test('boundary, collision and timeout failures remain terminal during a spin',()=>{
  const car=catalog.get();
  for(const expected of ['offtrack','collision','timeout']){
    const track=straightTrack(),state=physics.initialState(car,track);
    Object.assign(state,{x:100,s:100,yaw:-76*Math.PI/180,vx:8,vy:0,speed:8});state.wheelOmega.fill(8/car.tireRadius);
    if(expected==='offtrack'){track.length=100;track.width=2;state.y=5;}
    if(expected==='collision'){track.length=100;track.obstacles=[{x:100,y:0,r:2}];}
    if(expected==='timeout')state.time=90;
    physics.step(car,track,state,{steer:0,throttle:0,brake:0});
    assert.ok(Math.abs(state.beta)>=75*Math.PI/180);assert.equal(state.status,expected);
    const stopped=physics.frame(state);physics.step(car,track,state,{steer:.4,throttle:1,brake:0});assert.deepEqual(physics.frame(state),stopped);
  }
});

test('motion telemetry distinguishes normal heading changes, signed drift and slow launches',()=>{
  const car=catalog.get(),track=straightTrack();
  for(const heading of [-Math.PI+.01,Math.PI/2,Math.PI-.01]){
    const a=physics.initialState(car,track);Object.assign(a,{x:150,s:150,yaw:heading,vx:8*Math.cos(heading),vy:8*Math.sin(heading),speed:8});a.wheelOmega.fill(8/car.tireRadius);
    physics.step(car,track,a,{steer:0,throttle:0,brake:0});assert.equal(a.status,'running','world heading alone is not a spin');assert.ok(Math.abs(a.beta)<.05);
  }
  for(const beta of [-70,-40,0,40,70]){
    const a=physics.initialState(car,track);Object.assign(a,{x:150,s:150,yaw:-beta*Math.PI/180,vx:8,vy:0,speed:8});a.wheelOmega.fill(8/car.tireRadius);
    physics.step(car,track,a,{steer:0,throttle:0,brake:0});assert.equal(a.status,'running','opposite drift directions below the limit remain physical states');
  }
  const slow=physics.initialState(car,track);Object.assign(slow,{x:150,s:150,yaw:-100*Math.PI/180,vx:2,vy:0,speed:2});slow.wheelOmega.fill(2/car.tireRadius);
  physics.step(car,track,slow,{steer:0,throttle:0,brake:0});assert.equal(slow.status,'running','near-launch velocity direction alone is not decisive');
});

test('torque lookup and transient delivered torque respect stock torque and power ceilings', () => {
  const track = straightTrack();
  for (const car of catalog.list()) {
    for (let rpm = 0; rpm <= car.maxRPM * 1.5; rpm += 137) {
      const torque = physics.torqueAt(car, rpm);
      assert.ok(torque >= 0 && torque <= car.peakTorque + 1e-8, car.id + ': torque lookup');
      assert.ok(torque * rpm * Math.PI / 30 <= car.peakPowerW + 1e-6, car.id + ': lookup power');
    }
    const state = physics.initialState(car, track);
    state.vx = 20;
    state.speed = 20;
    state.torque = car.peakTorque;
    state.shiftTimer = 1;
    const highRPM = car.maxRPM * .98;
    const omega = highRPM * Math.PI / 30 / (car.gearRatios[0] * car.finalDrive);
    state.wheelOmega.fill(omega);
    // Manual engine and wheel shafts remain independent while the shift
    // clutch is open; exercise the engine limiter on its actual state.
    if(car.physics.transmissionType==='MT')state.engineOmega=highRPM*Math.PI/30;
    physics.step(car, track, state, { steer: 0, throttle: 1, brake: 0 });
    assert.ok(state.torque <= car.peakTorque + 1e-8, car.id + ': delivered torque');
    assert.ok(Math.max(0, state.torque) * state.rpm * Math.PI / 30 <= car.peakPowerW + 1e-6, car.id + ': transient delivered power');
    state.wheelOmega.fill(car.maxRPM * 1.1 * Math.PI / 30 / (car.gearRatios[state.gear - 1] * car.finalDrive));
    if(car.physics.transmissionType==='MT')state.engineOmega=car.maxRPM*1.1*Math.PI/30;
    state.torque = car.peakTorque;
    physics.step(car, track, state, { steer: 0, throttle: 1, brake: 0 });
    assert.ok(state.torque <= 0, car.id + ': over-rev must cut positive drive immediately');
  }
});

test('an open differential applies equal rear-wheel drive torque at unequal wheel speeds', () => {
  const car = catalog.get('g70-2.0t-rwd'), track = straightTrack(), state = physics.initialState(car, track);
  Object.assign(state, { vx: 15, speed: 15, gear: 3, torque: car.peakTorque * .5, shiftTimer: 1 });
  state.wheelOmega = [15 / car.tireRadius, 15 / car.tireRadius, 25, 65];
  physics.step(car, track, state, { steer: 0, throttle: .7, brake: 0 });
  assert.equal(state.wheelForces[0].driveTorque, 0);
  assert.equal(state.wheelForces[1].driveTorque, 0);
  assert.ok(state.wheelForces[2].driveTorque > 0, 'exercise powered differential, not a zero-torque equality');
  assert.equal(state.wheelForces[2].driveTorque, state.wheelForces[3].driveTorque);
  near(state.wheelForces[2].driveTorque + state.wheelForces[3].driveTorque, state.rearTorque);
  assert.notEqual(state.wheelSlip[2], state.wheelSlip[3], 'equal input torque does not force equal wheel slip');
});

test('limited-slip transfer preserves total axle torque and resists unequal wheel speeds', () => {
  const car = catalog.get(), track = straightTrack(), state = physics.initialState(car, track);
  Object.assign(state, { vx: 15, speed: 15, gear: 3, torque: car.peakTorque * .5, shiftTimer: 1 });
  state.wheelOmega = [15 / car.tireRadius, 15 / car.tireRadius, 25, 65];
  physics.step(car, track, state, { steer: 0, throttle: .7, brake: 0 });
  near(state.wheelForces[2].driveTorque + state.wheelForces[3].driveTorque, state.rearTorque);
  assert.ok(state.wheelForces[2].driveTorque > state.wheelForces[3].driveTorque, 'slower left wheel receives more torque');
});

test('lateral transfer conserves total load and has the correct side and magnitude', () => {
  const car = catalog.get('g70-2.0t-rwd'), track = straightTrack(), state = physics.initialState(car, track);
  state.ay = 4;
  physics.step(car, track, state, { steer: 0, throttle: 0, brake: 0 });
  const [fl, fr, rl, rr] = state.wheelForces.map(wheel => wheel.load);
  near(fl + fr + rl + rr, car.massKg * 9.81, 1e-7, 'vertical force');
  near(fr + rr - fl - rl, 2 * car.massKg * 4 * car.cgHeightM / (car.physics.trackWidthM || car.widthM * .84), 1e-7, 'lateral roll moment');
  assert.ok(fr > fl && rr > rl, 'positive lateral acceleration transfers load to negative-y right wheels');
});

test('rotation or sliding without new forward progress cannot accumulate drift score', () => {
  const car = catalog.get(), track = straightTrack();
  for (const moving of [false, true]) {
    const state = physics.initialState(car, track);
    // The car is revisiting an already traversed 25m of judged course. This
    // also models spinning behind the furthest valid checkpoint.
    Object.assign(state, { x: 250, y: 0, s: 275, yaw: .6, r: 1.5, vx: moving ? 5 : 0, vy: 0, speed: moving ? 5 : 0 });
    state.wheelOmega.fill(moving ? 5 / car.tireRadius : 0);
    for (let i = 0; i < 60; i++) physics.step(car, track, state, { steer: 0, throttle: 0, brake: 0 });
    assert.equal(state.s, 275);
    assert.equal(state.judgedDistance, 0);
    assert.equal(state.driftDistance, 0);
    assert.equal(state.scoreIntegral, 0);
  }
});

test('equal physical drifting at either road edge has the same score as the centre',()=>{
  const car=catalog.get(),track=straightTrack(),states=[];
  for(const y of [-20,0,20]){
    const a=physics.initialState(car,track);Object.assign(a,{x:150,y,s:150,yaw:-.25,vx:12,vy:0,speed:12,beta:.25,lineOffset:y===0?999:-999});
    a.wheelOmega.fill(12/car.tireRadius);
    for(let i=0;i<8;i++)physics.step(car,track,a,{steer:0,throttle:.3,brake:0});
    assert.equal(a.status,'running');states.push(a);
  }
  assert.ok(states[1].scoreIntegral>0);
  for(const a of [states[0],states[2]]){near(a.scoreIntegral,states[1].scoreIntegral,1e-12);near(a.driftDistance,states[1].driftDistance,1e-12);}
});

test('shift-time engine RPM matches the selected gear', () => {
  const car = catalog.get(), track = straightTrack(), state = physics.initialState(car, track);
  const shaft = 6600 * Math.PI / 30 / (car.gearRatios[0] * car.finalDrive);
  state.wheelOmega.fill(shaft);
  state.vx = 10;
  physics.step(car, track, state, { steer: 0, throttle: .8, brake: 0 });
  assert.equal(state.gear, 2);
  near(state.rpm, shaft * car.gearRatios[1] * car.finalDrive * 30 / Math.PI, 1e-7, 'engine RPM after upshift');
});

test('EV initialization has no fabricated combustion-engine idle RPM', () => {
  const track = straightTrack();
  for (const electric of catalog.list().filter(entry => entry.electric)) {
    assert.equal(physics.initialState(electric, track).rpm, 0);
  }
});

test('state feedback counters developing oversteer without changing the vehicle pose',()=>{
  const car=catalog.get(),track=straightTrack(),gene=genome.create(),left=physics.initialState(car,track),right=physics.initialState(car,track);
  Object.assign(left,{vx:12,speed:12,yaw:.2,r:1});Object.assign(right,{vx:12,speed:12,yaw:-.2,r:-1});
  const before=physics.frame(left),a=driver.command(car,track,left,gene),b=driver.command(car,track,right,gene);
  assert.ok(a.steer<0&&b.steer>0,'opposite developing spins need opposite driver steering');
  assert.deepEqual(physics.frame(left),before,'driver returns controls and cannot move or stabilize the body directly');
  assert.equal(a.brake,0,'recovery does not add an invisible brake');
});

test('releasing the drift target retains measured countersteer and crosses zero continuously',()=>{
  const car=catalog.get(),track=straightTrack(),gene=genome.create(),state=physics.initialState(car,track),DEG=Math.PI/180;
  Object.assign(state,{vx:12,vy:0,speed:12,r:0});
  const command=(beta,target)=>{
    state.yaw=-beta;
    for(let i=0;i<genome.KNOTS;i++)gene[i*genome.STRIDE+genome.CHANNELS.targetSlip]=target;
    return driver.command(car,track,state,gene);
  };
  for(const sign of [-1,1]){
    const zero=command(sign*15*DEG,0),before=physics.frame(state);
    assert.ok(sign*zero.steer>.3,'remaining sideslip still receives countersteer after the target reaches zero');
    for(const target of [-1e-9,1e-9])near(command(sign*15*DEG,target).steer,zero.steer,1e-7,'release through zero');
    assert.deepEqual(physics.frame(state),before,'the driver cannot rotate or move the body');
    assert.equal(zero.brake,0);
  }
  near(command(4*DEG,0).steer,0,1e-12,'ordinary grip sideslip keeps its deadzone');
});

test('line, drift attitude and wheel-slip genes affect bounded driver commands',()=>{
  const car=catalog.get(),track=straightTrack(),a=physics.initialState(car,track);Object.assign(a,{vx:12,speed:12});
  const fill=(key,value)=>{const g=genome.create();for(let i=0;i<genome.KNOTS;i++)g[i*genome.STRIDE+genome.CHANNELS[key]]=value;return g;};
  assert.ok(driver.command(car,track,a,fill('lineOffset',2)).steer>0);
  assert.ok(driver.command(car,track,a,fill('lineOffset',-2)).steer<0);
  assert.ok(driver.command(car,track,a,fill('targetSlip',-.3)).steer>0,'left drift target initiates yaw before countersteering');
  assert.ok(driver.command(car,track,a,fill('targetSlip',.3)).steer<0);
  const g=fill('driveSlip',.2),low=driver.command(car,track,a,g);a.wheelSlip=[0,0,.6,.6];const high=driver.command(car,track,a,g);
  assert.ok(low.throttle>high.throttle,'excess driven-wheel slip reduces the pedal');
  for(const c of [low,high]){assert.ok(c.throttle>=0&&c.throttle<=1);assert.ok(Math.abs(c.steer)<=car.maxSteer);assert.equal(c.brake,0);}
});

test('gear hold preserves selected ratios and vetoes unsafe downshifts',()=>{
  const car=catalog.get(),track=straightTrack(),a=physics.initialState(car,track);
  a.gear=2;a.vx=a.speed=15;a.wheelOmega.fill(6800*Math.PI/30/(car.gearRatios[1]*car.finalDrive));
  physics.step(car,track,a,{steer:0,throttle:.6,brake:0,gearHold:2});assert.equal(a.gear,2,'held gear does not auto-upshift above shiftRPM');
  a.gear=3;a.shiftTimer=0;a.wheelOmega.fill(6000*Math.PI/30/(car.gearRatios[2]*car.finalDrive));
  physics.step(car,track,a,{steer:0,throttle:.6,brake:0,gearHold:2});assert.equal(a.gear,3);assert.equal(a.gearShiftVeto,1);
  a.wheelOmega.fill(2500*Math.PI/30/(car.gearRatios[2]*car.finalDrive));
  physics.step(car,track,a,{steer:0,throttle:.6,brake:0,gearHold:2});assert.equal(a.gear,2);assert.ok(a.shiftTimer>0);assert.equal(a.gearShiftVeto,0);
});

test('forward wheel locking does not numerically reverse the braked wheels',()=>{
  const car=catalog.get(),track=straightTrack(),a=physics.initialState(car,track);Object.assign(a,{vx:15,speed:15,gear:2,steer:.08});a.wheelOmega.fill(15/car.tireRadius);
  let locked=0;
  for(let k=0;k<120;k++){
    physics.step(car,track,a,{steer:.08,throttle:0,brake:1});
    for(let i=0;i<4;i++){assert.ok(a.wheelOmega[i]>=-1e-9,'braking must stick at zero rather than reverse');if(a.wheelOmega[i]===0)locked++;}
  }
  assert.ok(locked>0,'the case must exercise actual wheel locking');
});

test('runtime rejects the old three-channel genome rather than misreading its stride',()=>{
  assert.throws(()=>physics.evaluateGene(catalog.get(),straightTrack(),new Float64Array(384)),/genome v3/);
});

test('valid forward drift continues to earn more speed quality above 43.2 km/h',()=>{
  const car=catalog.get(),track=straightTrack(),scores=[];
  for(const speed of [12,18,25]){
    const a=physics.initialState(car,track);Object.assign(a,{x:150,s:150,vx:speed,vy:0,speed,yaw:-.6,gear:3});a.wheelOmega.fill(speed/car.tireRadius);
    physics.step(car,track,a,{steer:0,throttle:.2,brake:0});
    assert.equal(a.status,'running');assert.ok(a.judgedDistance>0);scores.push(a.scoreIntegral/a.judgedDistance);
  }
  assert.ok(scores[1]>scores[0]&&scores[2]>scores[1],'the speed contribution must not flatten at 12 m/s');
  assert.ok(scores.every(score=>score>0&&score<1));
});

test('stock Supra feedback sustains drift on a bounded circle without pose assistance',()=>{
  const car=catalog.get(),R=35,length=1000;
  const track={length,width:14,judgedStart:0,judgedEnd:999,obstacles:[],
    sample:s=>({x:R*Math.sin(s/R),y:R*(1-Math.cos(s/R)),s,heading:s/R,curvature:1/R}),
    project:(x,y,hint=0)=>{const angle=Math.atan2(x,R-y),s=R*(angle+Math.round((hint/R-angle)/(2*Math.PI))*2*Math.PI),error=R-Math.hypot(x,y-R);return {s,error,distance:Math.abs(error),heading:s/R};}};
  const gene=genome.create();
  for(let i=0;i<genome.KNOTS;i++){const k=i*genome.STRIDE;gene[k]=Math.atan(car.wheelbaseM/R);gene[k+1]=.6;gene[k+4]=-Math.PI/6;gene[k+6]=.1;gene[k+7]=2;}
  const a=physics.initialState(car,track);Object.assign(a,{vx:12*Math.cos(a.yaw),vy:12*Math.sin(a.yaw),speed:12,gear:2,r:12/R,steer:Math.atan(car.wheelbaseM/R)});a.wheelOmega.fill(12/car.tireRadius);
  let driftTicks=0,maxAngle=0;
  for(let k=0;k<1200;k++){physics.step(car,track,a,driver.command(car,track,a,gene));const angle=Math.abs(a.beta)*180/Math.PI;maxAngle=Math.max(maxAngle,angle);if(k>=600&&angle>=10&&angle<=30)driftTicks++;assert.equal(a.status,'running');}
  assert.ok(driftTicks>=240,'at least two seconds above ten degrees after the transient');
  assert.ok(maxAngle<35,'feedback avoids the uncontrolled-spin outcome');
  assert.equal(a.brake,0);assert.ok(a.driftDistance>0);
});
