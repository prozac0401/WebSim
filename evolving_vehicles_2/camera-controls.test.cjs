const test = require('node:test');
const assert = require('node:assert/strict');
const CircuitRenderer = require('./circuit-renderer.js');

function fixture() {
  const listeners = new Map(), captured = new Set();
  let selections = 0;
  const canvas = {
    style: {}, getContext: () => ({}), focus() {},
    getBoundingClientRect: () => ({ left: 20, top: 40, width: 900, height: 565 }),
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener() {},
    setPointerCapture(id) { captured.add(id); }, hasPointerCapture: id => captured.has(id),
    releasePointerCapture(id) { captured.delete(id); }
  };
  const renderer = new CircuitRenderer(canvas, { onSelect() { selections++; } });
  renderer.race = {
    track: { points: [{x:0,y:0,z:30},{x:100,y:20,z:31},{x:0,y:40,z:30}], bounds: { minX: -100, maxX: 400, minY: -250, maxY: 500, width: 500, height: 750 }, elevationMin: 30, elevationMax: 100 },
    cars: [{ id: 0, distance: 0, spec: { lengthMm: 5000 } }],
    sample: distance => ({ x: distance, y: 20 + distance * .2, elevation: 40 + distance * .01, angle: Math.atan2(.2, 1) })
  };
  const event = (type, id, x, y, extras = {}) => listeners.get(type)({
    type, pointerId: id, pointerType: 'mouse', button: 0, clientX: x + 20, clientY: y + 40,
    preventDefault() {}, ...extras
  });
  return { renderer, captured, event, selections: () => selections };
}
function near(actual, expected, epsilon = 1e-8) { assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`); }

test('screen-ground intersection inverts projection through rotated and top cameras', () => {
  const { renderer: r } = fixture();
  for (const pitch of [.18, .7, 1.1, Math.PI / 2 - .008]) for (const yaw of [-2, 0, 1.2]) {
    r.pitch = pitch; r.yaw = yaw;
    const camera = r._interactionCamera();
    for (const screen of [{ x: 450, y: 277 }, { x: 650, y: 420 }, { x: 200, y: 350 }]) {
      const world = r._groundPoint(screen.x, screen.y, camera);
      const projected = r._project(world, camera);
      near(projected.x, screen.x); near(projected.y, screen.y);
    }
  }
});

test('drag pans the grabbed point by exact screen pixels and survives zoom/orbit', () => {
  const { renderer: r } = fixture();
  for (const mode of ['overview', 'follow', 'follow-classic', 'top']) {
    r.setView(mode);
    const anchor = { x: 390, y: mode === 'follow' ? 510 : 330 }, original = r._groundPoint(anchor.x, anchor.y, r._interactionCamera());
    r.pan(83, -31, anchor);
    const p = r._project(original, r._interactionCamera());
    near(p.x, anchor.x + 83); near(p.y, anchor.y - 31);
    const offset = { ...r.panOffset };
    r.zoom(1.5); r.orbit(15, -2);
    assert.deepEqual(r.panOffset, offset);
    assert.deepEqual(r.getState().pan, offset);
    r.recenter(); assert.deepEqual(r.panOffset, { x: 0, y: 0, z: 0 });
    near(r.zoomLevel, 1.5);
  }
});

test('wheel/pinch zoom keeps the cursor world anchor stationary', () => {
  const { renderer: r } = fixture();
  for (const mode of ['overview', 'follow', 'follow-classic', 'top']) {
    r.setView(mode); r.pan(-65, 12);
    const anchor = { x: 650, y: mode === 'follow' ? 420 : 380 }, world = r._groundPoint(anchor.x, anchor.y, r._interactionCamera());
    for (const factor of [1.7, .4, 20, .6]) {
      r.zoom(factor, anchor);
      const projected = r._project(world, r._interactionCamera());
      near(projected.x, anchor.x); near(projected.y, anchor.y);
    }
  }
});

test('mouse pan controls preserve rotation and never select a vehicle after a drag', () => {
  for (const extras of [{ button: 2 }, { button: 1 }, { shiftKey: true }, {}]) {
    const { renderer: r, event, captured, selections } = fixture();
    if (!Object.keys(extras).length) r.setInteractionMode('pan');
    r.markerPositions = [{ id: 0, x: 500, y: 350, anchorX: 500, anchorY: 350, radius: 50, length: 10 }];
    const yaw = r.yaw, pitch = r.pitch;
    event('pointerdown', 1, 440, 320, extras);
    event('pointermove', 1, 500, 350, extras);
    event('pointerup', 1, 500, 350, extras);
    assert.notEqual(r.panOffset.x, 0); near(r.yaw, yaw); near(r.pitch, pitch);
    assert.equal(selections(), 0); assert.equal(captured.size, 0); assert.equal(r.pointers.size, 0);
  }
});

test('two fingers translate and pinch, remaining finger resumes, cancellation clears capture', () => {
  const { renderer: r, event, captured, selections } = fixture();
  const touch = { pointerType: 'touch' };
  event('pointerdown', 1, 300, 320, touch); event('pointerdown', 2, 500, 320, touch);
  event('pointermove', 1, 320, 350, touch); event('pointermove', 2, 540, 350, touch);
  assert.notEqual(r.panOffset.x, 0); assert.ok(r.zoomLevel > 1); near(r.yaw, -.42);
  event('pointerup', 2, 540, 350, touch);
  const yaw = r.yaw;
  event('pointermove', 1, 330, 350, touch); assert.notEqual(r.yaw, yaw);
  event('pointercancel', 1, 330, 350, touch);
  assert.equal(r.pointers.size, 0); assert.equal(captured.size, 0); assert.equal(r.drag, null); assert.equal(selections(), 0);
  event('pointerdown', 3, 300, 350, touch); event('lostpointercapture', 3, 300, 350, touch);
  assert.equal(r.pointers.size, 0); assert.equal(r.drag, null);
});

test('follow camera retains world pan as its vehicle moves; view buttons recenter', () => {
  const { renderer: r } = fixture();
  r.setView('follow'); r.pan(80, 40);
  const before = r._interactionCamera().target, offset = { ...r.panOffset };
  r.race.cars[0].distance += 100;
  r.advanceCamera(0, { snap: true });
  const after = r._interactionCamera().target;
  near(after.x - before.x, 100); near(after.y - before.y, 20); near(after.z - before.z, 1.75);
  assert.deepEqual(r.panOffset, offset);
  r.setView('overview'); assert.deepEqual(r.panOffset, { x: 0, y: 0, z: 0 }); near(r.zoomLevel, 1);
});

test('near-horizon drag and invalid zoom stay finite', () => {
  const { renderer: r } = fixture();
  r.pitch = .18; r.pan(20, -12, { x: 450, y: 0 });
  r.zoom(2, { x: 450, y: 0 });
  for (const value of Object.values(r.panOffset)) assert.ok(Number.isFinite(value));
  const zoom = r.zoomLevel;
  for (const factor of [0, -1, NaN, Infinity]) r.zoom(factor);
  near(r.zoomLevel, zoom);
});

function eye(camera) {
  return { x: camera.target.x - Math.sin(camera.yaw) * camera.distance * camera.cosPitch,
    y: camera.target.y + Math.cos(camera.yaw) * camera.distance * camera.cosPitch,
    z: camera.target.z + camera.distance * camera.sinPitch };
}

test('telephoto follow opens low above the driven road and frames mobile/desktop vehicles', t => {
  const reports = [];
  for (const [width, height] of [[346,346], [390, 565], [390, 844], [1200, 700]]) {
    const { renderer: r } = fixture(); r.width = width; r.height = height;
    r.race.sample = s => ({x:s,y:0,elevation:10,angle:0});
    r.setView('follow');
    const camera = r._interactionCamera(), position = eye(camera);
    near(r.followYaw, 0); near(r.pitch, 0);
    near(position.z - r._displayHeight(10), 1.15); near(camera.target.z - r._displayHeight(10), .65);
    near(2 * Math.atan(height / (2 * camera.f)) * 180 / Math.PI, 32);
    near(camera.cy / height, .64);
    assert(position.x < -11 && position.x > -25);
    if(width===346)near(-position.x,17.5*.72);
    assert(Math.abs(camera.pitch) < .05, 'flat-ground gaze stays almost horizontal');
    const corners = [];
    for (const x of [-2.5,2.5]) for (const y of [-.95,.95]) for (const z of [r._displayHeight(10),r._displayHeight(10)+1.6]) {
      const p = r._project({x,y,z}, camera); corners.push(p);
      assert(p && p.x > 0 && p.x < width && p.y > height*.35 && p.y < height*.85);
    }
    reports.push({width,height,distance:+camera.distance.toFixed(3),heightAboveRoad:1.15,pitchDegrees:+(camera.pitch*180/Math.PI).toFixed(3),bodyWidthPixels:+(Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x))).toFixed(2)});
  }
  t.diagnostic(JSON.stringify(reports));
});

test('classic rear view restores the released lens, target, pitch, responsive distance and framing', () => {
  for(const [width,height]of [[346,346],[390,844],[1200,700]]){
    const {renderer:r}=fixture();r.width=width;r.height=height;r.setView('follow-classic');
    const car=r.race.cars[0],p=r.race.sample(car.distance),camera=r._interactionCamera(),f=height/(2*Math.tan(29*Math.PI/180));
    near(camera.f,f);near(camera.pitch,.24);near(camera.target.x,p.x);near(camera.target.y,p.y);near(camera.target.z,r._displayHeight(p.elevation)+.8);
    near(camera.distance,Math.max(6.6,5*1.72,1.85*f/Math.max(105,Math.min(190,width*.36))));
    near(camera.cx,width*.5);near(camera.cy,height*.64);near(camera.yaw,p.angle+Math.PI/2);
    const info=r.getState().followCamera;assert.equal(info.positionMode,'heading-orbit');near(info.verticalFovDegrees,58);
    r.orbit(0,-1000);near(r.pitch,.18);r.zoom(100);near(r.zoomLevel,6);
  }
});

test('close telephoto is twenty-eight percent nearer for the normal Supra screen', () => {
  const {renderer:r}=fixture();r.width=346;r.height=346;r.race.cars[0].spec={lengthMm:4379,widthMm:1854};
  r.race.sample=s=>({x:s,y:0,elevation:40,angle:0});r.setView('follow');
  const camera=r._interactionCamera();near(-eye(camera).x,11.52);near(11.52/16,.72);
  near(r.getState().followCamera.verticalFovDegrees,32);
});

test('classic angular spring preserves the original elapsed-time response and read-only camera controls', () => {
  const {renderer:a}=fixture(),{renderer:b}=fixture();let heading=0;
  for(const r of [a,b]){r.race.sample=s=>({x:s*Math.cos(heading),y:s*Math.sin(heading),elevation:40,angle:heading});r.setView('follow-classic');r._interactionCamera();}
  heading=.2;a.advanceCamera(.1);for(let i=0;i<6;i++)b.advanceCamera(1/60);
  const omega=9.5,t=.1,expected=.2*(1-(1+omega*t)*Math.exp(-omega*t));
  near(a._classicFollowState.heading,expected);near(a._classicFollowState.headingVelocity,.2*omega*omega*t*Math.exp(-omega*t));
  for(const key of ['x','y','z','heading','headingVelocity'])near(a._classicFollowState[key],b._classicFollowState[key]);
  const state={...a._classicFollowState};a._interactionCamera();a.pan(10,20);a.zoom(1.1);a.orbit(5,2);assert.deepEqual(a._classicFollowState,state);
  for(let i=0;i<300;i++)a.advanceCamera(1/60);near(a._classicFollowState.heading,.2);near(a._classicFollowState.headingVelocity,0);
  assert.equal(a.advanceCamera(1/60),false);
});

test('switching rear presets resets only camera state and each preset survives an idle resize', () => {
  const {renderer:r}=fixture();let size={width:346,height:346};
  r.canvas.getBoundingClientRect=()=>({left:0,top:0,...size});r.resize();
  for(const mode of ['follow','follow-classic','follow','follow-classic']){
    r.setView(mode);assert.equal(r.mode,mode);near(r.zoomLevel,1);near(r.followYaw,0);assert.deepEqual(r.panOffset,{x:0,y:0,z:0});
    const camera=r._interactionCamera();near(2*Math.atan(r.height/(2*camera.f))*180/Math.PI,mode==='follow'?32:58);
    r.orbit(12,2);r.pan(7,5);r.zoom(1.1);
    const pan={...r.panOffset},yaw=r.followYaw,zoom=r.zoomLevel,pitch=r.pitch;
    size={width:390,height:844};r.resize();
    const resized=r._interactionCamera();near(resized.cx,195);near(resized.cy,844*.64);
    near(r.followYaw,yaw);near(r.zoomLevel,zoom);near(r.pitch,pitch);assert.deepEqual(r.panOffset,pan);
    if(mode==='follow')near(r._followState.trail,r._followDistance(r.race.cars[0]));
    size={width:346,height:346};r.resize();
  }
});

test('classic watched vehicle and race changes reset state while a flying lap keeps angular continuity', () => {
  const {renderer:r}=fixture(),car=r.race.cars[0];r.race.circuit={id:'fixture'};car.totalDistance=1000;
  car.distance=1000;r.setView('follow-classic');r._interactionCamera();const state=r._classicFollowState;
  r.setRace({...r.race,cars:[{...car,distance:0}]},{preserveCamera:true});assert.equal(r._classicFollowState,state);near(state.distance,0);
  r.race.cars.push({...car,id:1,distance:300});r.watch=1;near(r._interactionCamera().target.x,300);assert.equal(r._classicFollowState.id,1);
  r._makeRoad=()=>{};r.setRace({...r.race,cars:[{...car,distance:100}]});near(r._interactionCamera().target.x,100);assert.equal(r._classicFollowState.id,0);
});

test('both rear presets use close scenery and pit queries, keep tree shadows and omit the overview inset', () => {
  const {renderer:r}=fixture();let inset=0;const queries=[],queued=[];
  r.ctx={setTransform(){}};r._background=r._paintWorld=r._startLine=r._drawVehicles=r._labels=r._compass=r._caption=r._queueWorldFaces=()=>{};
  r._inset=()=>{inset++;};r._queue=f=>queued.push(f);r._mesh=()=>({length:4.4,width:1.9});
  r.environment={query(_x,_y,radius){queries.push(radius);return[{faces:[{kind:'tree-shadow'}]}];}};
  r.pits={query(_x,_y,radius){queries.push(radius);return[];}};
  for(const mode of ['follow','follow-classic'])r.render({mode});
  assert.equal(inset,0);assert.equal(queued.length,2);assert(queries.every(radius=>radius===440));
});

test('path-follow heading crosses the signed-angle seam by the short arc', () => {
  const { renderer: r } = fixture(), car = r.race.cars[0], radius = 50;
  r.race.sample = s => ({x:radius*Math.sin(s/radius),y:radius*(1-Math.cos(s/radius)),elevation:10,angle:s/radius});
  car.speed=10;car.distance=Math.PI*radius;r.setView('follow');
  let previous=r._interactionCamera().yaw;
  for(let i=0;i<180;i++) {
    car.distance+=car.speed/60;r.advanceCamera(1/60);
    const yaw=r._interactionCamera().yaw;
    assert(yaw>=previous && yaw-previous<.01, 'no signed-angle flip');previous=yaw;
  }
});

test('distance damping uses elapsed time and settles without idle drift', () => {
  const { renderer: a } = fixture(), { renderer: b } = fixture();
  for(const r of [a,b]) { r.setView('follow');r._interactionCamera();r.race.cars[0].distance=3; }
  a.advanceCamera(.1);for(let frame=0;frame<6;frame++)b.advanceCamera(1/60);
  for(const key of ['x','y','z','eyeX','eyeY','eyeZ','eyeDistance','eyeVelocity'])near(a._followState[key],b._followState[key]);
  assert(a._followState.eyeDistance<a._followState.goalEyeDistance);
  for(let frame=0;frame<300;frame++)a.advanceCamera(1/60);
  near(a._followState.eyeDistance,a._followState.goalEyeDistance);near(a._followState.eyeVelocity,0);
  const settled={...a._followState};assert.equal(a.advanceCamera(1/60),false);assert.deepEqual(a._followState,settled);
});

test('camera reads and pointer controls never advance a pending follow interpolation', () => {
  const { renderer: r } = fixture();
  r.setView('follow'); r.advanceCamera(0);
  r.race.cars[0].distance=.5;r.advanceCamera(1/60);
  const state={...r._followState},anchor={x:490,y:510};
  const world=r._groundPoint(anchor.x,anchor.y,r._interactionCamera());
  r.pan(31,12,anchor);
  let p=r._project(world,r._interactionCamera());near(p.x,anchor.x+31);near(p.y,anchor.y+12);
  const zoomAnchor={x:550,y:510},zoomWorld=r._groundPoint(zoomAnchor.x,zoomAnchor.y,r._interactionCamera());
  r.zoom(1.4,zoomAnchor);r._interactionCamera();r._interactionCamera();
  p=r._project(zoomWorld,r._interactionCamera());near(p.x,zoomAnchor.x);near(p.y,zoomAnchor.y);
  assert.deepEqual(r._followState,state);
});

test('the rig anchors the car exactly while the low eye follows road height and a bank floor', () => {
  const { renderer:r }=fixture(),car=r.race.cars[0];car.speed=30;
  r.race.sample=s=>({x:s,y:0,elevation:10+s*.08,angle:0});
  r.setView('follow');r._interactionCamera();car.distance=5;r.advanceCamera(1/60);
  const goal=r._followGoal(car),pose=r._followState,camera=r._interactionCamera(),position=eye(camera);
  for(const key of ['x','y','z'])near(pose[key],goal[key]);
  const screen=r._project(goal,camera);near(screen.x,camera.cx);near(screen.y,camera.cy);
  near(position.z-r._displayHeight(10+pose.sampleDistance*.08),1.15);
  assert(camera.pitch<0,'uphill gaze reflects road grade instead of forcing world-horizontal');
  r.terrainGeometry={sampleHeight:()=>position.z+2};r.advanceCamera(0,{snap:true});
  const raised=eye(r._interactionCamera());assert(raised.z>=position.z+2.65-1e-8);
});

test('large playback steps bound trailing lag; explicit timeline jumps remove it', () => {
  const {renderer:r}=fixture(),car=r.race.cars[0];
  car.speed=40;r.setView('follow');r._interactionCamera();car.distance=1000;
  assert.equal(r.advanceCamera(1/60),true);
  const pose=r._followState;near(r._interactionCamera().target.x,1000);
  assert(car.distance-pose.sampleDistance<=pose.trail*1.35+1e-8);
  assert(car.distance-pose.sampleDistance>=pose.trail*.65-1e-8);
  assert.equal(r.advanceCamera(0,{snap:true}),true);
  near(r._followState.eyeDistance,r._followState.goalEyeDistance);near(r._followState.eyeVelocity,0);
  const state=r._followState;assert.equal(r.advanceCamera(0,{snap:true}),false);assert.equal(r._followState,state);
});

test('new race, view and watched vehicle reset stale follow state', () => {
  const {renderer:r}=fixture();r.setView('follow');r._interactionCamera();r.race.cars[0].distance=10;r.advanceCamera(1/60);
  r._makeRoad=()=>{};r.setRace({...r.race,cars:[{...r.race.cars[0],distance:100}]});
  near(r._interactionCamera().target.x,100);
  r.race.cars[0].distance=200;r.setView('overview');r.setView('follow');
  near(r._interactionCamera().target.x,200);near(r.followYaw,0);
  r.race.cars.push({...r.race.cars[0],id:1,distance:300});r.watch=1;
  near(r._interactionCamera().target.x,300);
});

test('a flying generation preserves the same eye and distance damping across the lap seam', () => {
  const {renderer:r}=fixture(),length=1000,radius=length/(2*Math.PI),car=r.race.cars[0];
  r.race.circuit={id:'ring'};r.race.totalDistance=length;car.totalDistance=length;car.speed=20;
  r.race.sample=s=>({x:radius*Math.sin(s/radius),y:radius*(1-Math.cos(s/radius)),elevation:40,angle:s/radius});
  car.distance=length-.2;r.setView('follow');r._interactionCamera();car.distance=length+.2;r.advanceCamera(.02);
  const before=eye(r._interactionCamera()),oldDistance=r._followState.eyeDistance;
  r.setRace({...r.race,cars:[{...car,distance:.2,standingStartDistance:null}]},{preserveCamera:true});
  assert.deepEqual(eye(r._interactionCamera()),before);near(r._followState.eyeDistance,oldDistance-length);
  r.race.cars[0].distance+=.4;r.advanceCamera(.02);
  const after=eye(r._interactionCamera());assert(Math.hypot(after.x-before.x,after.y-before.y)<.5);
});

test('a fresh standing grid uses the exact start tangent and stays still while paused', t => {
  const previous=global.DrivingPose;t.after(()=>{if(previous===undefined)delete global.DrivingPose;else global.DrivingPose=previous;});
  global.DrivingPose=require('./driving-pose.js');
  const Race=require('./race-engine.js'),circuit=require('./circuits.js').find(c=>c.id==='taebaek'),{renderer:r}=fixture();
  r.race=new Race({circuit,vehicleIds:['supra'],racingLine:true,laps:1});r.setView('follow');
  const car=r.race.cars[0],body=global.DrivingPose.sampleCar(r.race,car),camera=r._interactionCamera(),position=eye(camera);
  near(camera.target.x,body.x);near(camera.target.y,body.y);near(wrap(camera.yaw-Math.PI/2-body.angle),0);
  near((position.x-body.x)*Math.cos(body.angle)+(position.y-body.y)*Math.sin(body.angle),-r._followDistance(car));
  const state={...r._followState};for(let i=0;i<60;i++)assert.equal(r.advanceCamera(1/60),false);
  assert.deepEqual(r._followState,state);near(r.getState().followCamera.verticalFovDegrees,32);
});

test('the chase eye occupies the actual past path instead of a rotated car-centred offset', () => {
  const {renderer:r}=fixture(),car=r.race.cars[0],radius=25;
  r.race.sample=s=>({x:radius*Math.sin(s/radius),y:radius*(1-Math.cos(s/radius)),elevation:10,angle:s/radius});
  car.speed=12;r.setView('follow');r._interactionCamera();
  for(let i=1;i<180;i++){
    car.distance=i/60*car.speed;r.advanceCamera(1/60);
    const pose=r._followState,prior=r.race.sample(pose.sampleDistance),position=eye(r._interactionCamera());
    near(position.x,prior.x);near(position.y,prior.y);near(position.z,r._displayHeight(10)+1.15);
    const current=r.race.sample(car.distance),rigid={x:current.x-Math.cos(current.angle)*pose.trail,y:current.y-Math.sin(current.angle)*pose.trail};
    assert(Math.hypot(position.x-rigid.x,position.y-rigid.y)>2,'past-trajectory eye must differ from yaw-pivot orbit');
  }
});

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const rms = values => Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);
function chase(r, speed, start, framePattern, duration, collectAfter=0, playback=1) {
  const car=r.race.cars[0];car.speed=speed;car.distance=start;r.setView('follow');r._interactionCamera();
  const frames=[],checkpoints=[];let elapsed=0,index=0,previous=r._followState.heading;
  while(elapsed<duration-1e-9){
    const checkpoint=Math.min(duration,Math.floor(elapsed+1e-8)+1);
    const dt=Math.min(framePattern[index++%framePattern.length],checkpoint-elapsed);
    elapsed+=dt;car.distance=start+elapsed*speed*playback;r.advanceCamera(dt);
    const heading=r._followState.heading;
    if(elapsed>collectAfter)frames.push({heading,rate:wrap(heading-previous)/dt,distance:car.distance});
    if(Math.abs(elapsed-checkpoint)<1e-8)checkpoints.push(heading);
    previous=heading;
  }
  return {frames,checkpoints};
}

test('millimetre-scale path ripples do not produce repeated straight/turn camera pulses', t => {
  const sample=s=>{
    const radius=250,k=2*Math.PI/10;
    return {x:radius*Math.sin(s/radius),y:radius*(1-Math.cos(s/radius))+.008*Math.sin(k*s),elevation:10,
      angle:Math.atan2(Math.sin(s/radius)+.008*k*Math.cos(k*s),Math.cos(s/radius))};
  };
  const results=[];
  for(const pattern of [[1/30],[1/60],[1/120,1/45,1/80,1/28]]){
    const {renderer:a}=fixture();a.race.sample=sample;
    const current=chase(a,100/3.6,-60,pattern,8,3),legacy={frames:current.frames.map(f=>({...f,rate:(wrap(sample(f.distance+.001).angle-sample(f.distance-.001).angle))/.002*(100/3.6)}))};
    const changes=frames=>frames.slice(1).map((v,i)=>v.rate-frames[i].rate);
    const ratio=rms(changes(current.frames))/rms(changes(legacy.frames));
    assert.ok(ratio<.20,'remove short direction pulses at every cadence, ratio '+ratio);
    assert.ok(current.frames.every(f=>f.rate>.06&&f.rate<.15),'continue turning through a gentle bend');
    results.push({pattern,ratio,checkpoints:current.checkpoints});
  }
  for(const result of results.slice(1))result.checkpoints.forEach((heading,i)=>{
    assert.ok(Math.abs(wrap(heading-results[0].checkpoints[i]))<.0025,'camera follows elapsed time across fixed/variable frame rates');
  });
  t.diagnostic(JSON.stringify(results.map(({pattern,ratio})=>({pattern,angularRippleRatio:+ratio.toFixed(5)}))));
});

test('sharp-course camera target has no adaptation-switch direction kinks', t => {
  const previous = global.DrivingPose;
  t.after(() => { if (previous === undefined) delete global.DrivingPose; else global.DrivingPose = previous; });
  global.DrivingPose = require('./driving-pose.js');
  const TrackRace = require('./race-engine.js'), circuits = require('./circuits.js');
  // Maximum change of direction gradient (rad/m²) over the actual bends.
  // These limits distinguish a smooth change of bend radius from a cusp
  // caused by switching the dominant look-ahead chord or quadrature count.
  const corners = [
    ['everland', 3860, .004], ['inje', 220, .005], ['yeongam', 3670, .012],
    ['yeongam-permanent', 145, .009], ['taebaek', 540, .004],
    ['bmw-incheon', 2385, .012], ['hmg-taean', 1940, .002],
    ['pocheon', 2730, .04], ['monza', 655, .008], ['silverstone', 4055, .004], ['spa', 240, .01]
  ];
  const reports = [];
  for (const [id, center, limit] of corners) {
    const { renderer: r } = fixture();
    r.race = new TrackRace({ circuit: circuits.find(c => c.id === id), vehicleIds: ['g80'], racingLine: true, laps: 1 });
    const car = r.race.cars[0]; car.speed = 12;
    const headings = [];
    for (let s = center - 30; s <= center + 30; s += .1) {
      car.distance = s;
      const goal = r._followGoal(car), body = global.DrivingPose.sampleCar(r.race, car, s);
      headings.push(goal.heading);
      assert.ok(Math.abs(wrap(goal.heading - body.angle)) < Math.PI*.5, id + ': do not look around the return leg');
    }
    const maximum = Math.max(...headings.slice(2).map((h, i) => Math.abs(wrap(h - headings[i + 1]) - wrap(headings[i + 1] - headings[i])) / .01));
    assert.ok(maximum < limit, id + ': abrupt camera direction-gradient change ' + maximum);
    reports.push({ id, maximumGradientChange: +maximum.toFixed(5) });
  }
  t.diagnostic(JSON.stringify(reports));
});

// A long lens on the driven path can briefly see a car's side at the end of
// a tiny hairpin. Enforce a bounded, continuous path-based view rather than
// moving the eye off-road just to stay in the car's local rear hemisphere.
test('actual sharp corners keep bounded viewing angles and cadence-independent motion at 1x, 2x and 3x', t => {
  const previous = global.DrivingPose;
  t.after(() => { if (previous === undefined) delete global.DrivingPose; else global.DrivingPose = previous; });
  global.DrivingPose = require('./driving-pose.js');
  const TrackRace = require('./race-engine.js'), circuits = require('./circuits.js');
  const reports = [], patterns = [[1 / 30], [1 / 60], [1 / 120, 1 / 45, 1 / 80, 1 / 28]];
  for (const [id, center] of [['everland', 3860], ['yeongam', 3670], ['pocheon', 2730], ['taebaek', 540], ['spa', 240]]) {
    const race = new TrackRace({ circuit: circuits.find(c => c.id === id), vehicleIds: ['g80'], racingLine: true, laps: 1 });
    for (const playback of [1, 2, 3]) {
      let reference = null, worstOffset = 0;
      for (const pattern of patterns) {
        const { renderer: r } = fixture(); r.race = race;
        const run = chase(r, 12, center - 45, pattern, 90 / (12 * playback), 0, playback);
        for (const frame of run.frames) {
          const body = global.DrivingPose.sampleCar(race, race.cars[0], frame.distance);
          worstOffset = Math.max(worstOffset, Math.abs(wrap(frame.heading - body.angle)));
        }
        const car = race.cars[0], goal = r._followGoal(car);
        for (const key of ['x', 'y', 'z']) near(r._followState[key], goal[key]);
        if (reference) run.checkpoints.forEach((heading, i) => {
          assert.ok(Math.abs(wrap(heading - reference[i])) < .012, id + ' ' + playback + 'x: fixed/uneven frame agreement');
        }); else reference = run.checkpoints;
      }
      assert.ok(worstOffset < Math.PI*.75, id + ' ' + playback + 'x: path-follow view remains bounded through the return leg');
      reports.push({ id, playback, maximumBodyOffsetDegrees: +(worstOffset * 180 / Math.PI).toFixed(2) });
    }
  }
  t.diagnostic(JSON.stringify(reports));
});

test('tight hairpins follow the trailing path without excessive early rotation or heading flips', () => {
  for(const radius of [6,12,25]){
    const {renderer:r}=fixture(),car=r.race.cars[0],length=Math.PI*radius;car.speed=radius*.8;
    r.race.sample=s=>s<0?{x:s,y:0,elevation:10,angle:0}:s>length?{x:-(s-length),y:radius*2,elevation:10,angle:Math.PI}:
      {x:radius*Math.sin(s/radius),y:radius*(1-Math.cos(s/radius)),elevation:10,angle:s/radius};
    let previous=null;
    for(let s=-40;s<length+40;s+=.25){
      car.distance=s;const goal=r._followGoal(car),actual=r.race.sample(s);
      assert.ok(Math.abs(wrap(goal.heading-actual.angle))<Math.PI*.75,'remain behind the car on radius '+radius+' at '+s);
      if(s<=-20)assert.ok(Math.abs(goal.heading)<.025,'do not rotate around an unseen return leg');
      if(previous!==null)assert.ok(Math.abs(wrap(goal.heading-previous))<.09,'no hairpin heading flip');
      previous=goal.heading;
    }
  }
});

test('Everland reported gentle corner maintains steady angular velocity at 30/60 Hz and uneven frames', t => {
  const previous=global.DrivingPose;
  t.after(()=>{if(previous===undefined)delete global.DrivingPose;else global.DrivingPose=previous;});
  global.DrivingPose=require('./driving-pose.js');
  const TrackRace=require('./race-engine.js'),circuit=require('./circuits.js').find(c=>c.id==='everland');
  const reports=[];
  for(const pattern of [[1/30],[1/60],[1/120,1/45,1/80,1/28]]){
    const {renderer:r}=fixture();r.race=new TrackRace({circuit,vehicleIds:['g80'],racingLine:true,laps:1});
    const run=chase(r,100/3.6,2490,pattern,6.1),frames=run.frames.filter(f=>f.distance>=2530&&f.distance<=2645);
    const rates=frames.map(f=>Math.abs(f.rate)),minimum=Math.min(...rates),maximum=Math.max(...rates);
    assert.ok(minimum>.065&&maximum<.155,'reported corner must neither straighten nor suddenly tighten: '+minimum+'..'+maximum);
    assert.ok(maximum/minimum<1.65,'reported corner turn-rate range: '+maximum/minimum);
    reports.push({pattern,minimum,maximum,checkpoints:run.checkpoints});
  }
  for(const report of reports.slice(1))report.checkpoints.forEach((heading,i)=>{
    assert.ok(Math.abs(wrap(heading-reports[0].checkpoints[i]))<.006,'real corner camera is stable across frame cadence');
  });
  t.diagnostic(JSON.stringify(reports.map(({pattern,minimum,maximum})=>({pattern,minDegreesPerSecond:+(minimum*180/Math.PI).toFixed(3),maxDegreesPerSecond:+(maximum*180/Math.PI).toFixed(3)}))));
});

test('Taebaek and Spa T1 keep the complete car framed in both rear presets at every cadence', t => {
  const previous=global.DrivingPose;t.after(()=>{if(previous===undefined)delete global.DrivingPose;else global.DrivingPose=previous;});
  global.DrivingPose=require('./driving-pose.js');
  const Race=require('./race-engine.js'),circuits=require('./circuits.js'),reports=[];
  for(const [id,center]of [['taebaek',540],['spa',240]])for(const [width,height]of [[346,346],[390,844],[1200,700]])for(const mode of ['follow','follow-classic']){
    const race=new Race({circuit:circuits.find(c=>c.id===id),vehicleIds:['supra'],racingLine:true,laps:1});
    const runs=[];
    for(const pattern of [[1/30],[1/60],[1/120,1/45,1/80,1/28]]){
      const {renderer:r}=fixture();r.race=race;r.width=width;r.height=height;
      const car=race.cars[0];car.speed=12;car.distance=center-45;r.setView(mode);r._interactionCamera();
      const checkpoints=[];let time=0,frame=0,minEdge=Infinity,maxPitch=0,maxEyeStep=0,lastEye=eye(r._interactionCamera());
      while(time<7.5-1e-9){
        const next=Math.min(7.5,Math.floor(time+1e-8)+1),dt=Math.min(pattern[frame++%pattern.length],next-time);
        time+=dt;car.distance=center-45+time*12;r.advanceCamera(dt);
        const camera=r._interactionCamera(),position=eye(camera),body=r._followSample(car,car.distance),pose=mode==='follow'?r._followState:r._classicFollowState;
        if(mode==='follow'){const past=r._followSample(car,pose.sampleDistance);near(position.x,past.x);near(position.y,past.y);near(position.z,past.z+1.15);}else near(camera.pitch,.24);
        maxEyeStep=Math.max(maxEyeStep,Math.hypot(position.x-lastEye.x,position.y-lastEye.y)/dt);lastEye=position;
        maxPitch=Math.max(maxPitch,Math.abs(camera.pitch));
        const L=(car.spec.lengthMm||4500)/2000,W=(car.spec.widthMm||1900)/2000,H=(car.spec.heightMm||1400)/1000;
        for(const x of [-L,L])for(const y of [-W,W])for(const z of [0,H]){
          const slope=Math.atan(body.grade),longitudinal=x*Math.cos(slope)-z*Math.sin(slope);
          const p=r._project({x:body.x+Math.cos(body.angle)*longitudinal-Math.sin(body.angle)*y,y:body.y+Math.sin(body.angle)*longitudinal+Math.cos(body.angle)*y,z:body.z+.055+x*Math.sin(slope)+z*Math.cos(slope)},camera);
          const margin=mode==='follow'?12:0;
          assert(p&&p.x>margin&&p.x<width-margin&&p.y>margin&&p.y<height-margin,id+' '+width+' '+mode+': complete body stays visible '+JSON.stringify(p));
          minEdge=Math.min(minEdge,p.x,width-p.x,p.y,height-p.y);
        }
        if(Math.abs(time-next)<1e-8)checkpoints.push({eye:position,heading:pose.heading});
      }
      runs.push(checkpoints);reports.push({id,width,height,mode,cadence:pattern.length===1?1/pattern[0]:'uneven',minimumFrameMarginPx:+minEdge.toFixed(2),maximumPitchDegrees:+(maxPitch*180/Math.PI).toFixed(2),maximumEyeSpeed:+maxEyeStep.toFixed(2)});
    }
    for(const run of runs.slice(1))run.forEach((p,i)=>{assert(Math.hypot(p.eye.x-runs[0][i].eye.x,p.eye.y-runs[0][i].eye.y)<(mode==='follow'?.002:.10),'camera position is cadence independent');assert(Math.abs(wrap(p.heading-runs[0][i].heading))<(mode==='follow'?.0002:.012));});
  }
  t.diagnostic(JSON.stringify(reports));
});

test('low follow eye smoothly clears the actual road top planes under the car on Taebaek and Spa', t => {
  const previous=global.DrivingPose,previousRoad=global.CircuitRoad;
  t.after(()=>{if(previous===undefined)delete global.DrivingPose;else global.DrivingPose=previous;if(previousRoad===undefined)delete global.CircuitRoad;else global.CircuitRoad=previousRoad;});
  global.DrivingPose=require('./driving-pose.js');global.CircuitRoad=require('./circuit-road.js');
  const Race=require('./race-engine.js'),circuits=require('./circuits.js'),reports=[];
  const contains=(p,a,b,c)=>{
    const side=(u,v)=>(v.x-u.x)*(p.y-u.y)-(v.y-u.y)*(p.x-u.x),s=[side(a,b),side(b,c),side(c,a)];
    return s.every(v=>v>=-1e-7)||s.every(v=>v<=1e-7);
  };
  for(const [id,center]of [['taebaek',535],['spa',240]])for(const [width,height]of [[348,348],[390,844],[1200,700]]){
    const {renderer:r}=fixture();r.width=width;r.height=height;
    r.setRace(new Race({circuit:circuits.find(c=>c.id===id),vehicleIds:['supra'],racingLine:true,laps:1}));
    const car=r.race.cars[0];car.speed=12;car.distance=center-25;r.setView('follow');
    const heights=[];let maximumLift=0,minimumClearance=Infinity,checked=0,centerLift=0,centerMinimumLift=0;
    for(let s=center-25;s<=center+25;s+=.1){
      car.distance=s;r.advanceCamera(0,{snap:true});const camera=r._interactionCamera(),position=eye(camera),p=r._followSample(car,s),past=r._followSample(car,r._followState.sampleDistance);
      near(position.x,past.x);near(position.y,past.y);heights.push(position.z);maximumLift=Math.max(maximumLift,r._followState.eyeSafetyLiftM);
      if(Math.abs(s-center)<.05)centerLift=r._followState.eyeSafetyLiftM;
      const L=(car.spec.lengthMm||4500)/2000,W=(car.spec.widthMm||1900)/2000;
      const wheels=[{x:p.x,y:p.y},...[-.7,.7].flatMap(x=>[-.8,.8].map(y=>({x:p.x+Math.cos(p.angle)*x*L-Math.sin(p.angle)*y*W,y:p.y+Math.sin(p.angle)*x*L+Math.cos(p.angle)*y*W})))];
      for(let i=0;i<r.roadEdges.length;i++){
        const a=r.roadEdges[i],b=r.roadEdges[(i+1)%r.roadEdges.length];
        if(!wheels.some(w=>contains(w,a.left,b.left,b.right)||contains(w,a.left,b.right,a.right)))continue;
        const u={x:b.left.x-a.left.x,y:b.left.y-a.left.y,z:b.left.z-a.left.z},v={x:b.right.x-a.left.x,y:b.right.y-a.left.y,z:b.right.z-a.left.z};
        let nx=u.y*v.z-u.z*v.y,ny=u.z*v.x-u.x*v.z,nz=u.x*v.y-u.y*v.x;if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
        if(Math.abs(nz)<1e-9)continue;
        const clearance=(nx*(position.x-a.left.x)+ny*(position.y-a.left.y)+nz*(position.z-a.left.z))/Math.hypot(nx,ny,nz);
        assert(clearance>.05,id+' '+width+' s='+s+': watched road top must face the camera, clearance '+clearance);
        minimumClearance=Math.min(minimumClearance,clearance);checked++;
        if(Math.abs(s-center)<.05)centerMinimumLift=Math.max(centerMinimumLift,r._followState.eyeSafetyLiftM-clearance*Math.hypot(nx,ny,nz)/nz+.25);
      }
    }
    const maximumHeightSecondDifference=Math.max(...heights.slice(2).map((z,i)=>Math.abs(z-2*heights[i+1]+heights[i])));
    assert(checked>500);assert(maximumHeightSecondDifference<.035,'camera elevation must not pop between local road faces: '+maximumHeightSecondDifference);
    if(id==='taebaek')assert(maximumLift>.5,'fixture must exercise the previously hidden road-top condition');
    reports.push({id,width,height,centerLiftM:+centerLift.toFixed(3),centerRequiredLiftM:+centerMinimumLift.toFixed(3),maximumLiftM:+maximumLift.toFixed(3),minimumPlaneClearanceM:+minimumClearance.toFixed(3),maximumHeightSecondDifferenceM:+maximumHeightSecondDifference.toFixed(5)});
  }
  const {renderer:flat}=fixture();flat.race.sample=s=>({x:s,y:0,elevation:40,angle:0});
  flat.roadEdges=[{left:{x:-100,y:-5,z:40},right:{x:-100,y:5,z:40}},{left:{x:100,y:-5,z:40},right:{x:100,y:5,z:40}}];
  flat.setView('follow');const state=flat._followPose(flat.race.cars[0]);near(state.eyeSafetyLiftM,0);near(state.eyeZ,flat._displayHeight(40)+1.15);
  // A separate upper return leg overlaps this road in XY. Its plane must not
  // raise the low camera on the lower road by twenty metres.
  const ground=flat._displayHeight(40);
  flat.roadEdges=[[-100,ground],[100,ground],[100,ground+20],[-100,ground+20]].map(([x,z])=>({left:{x,y:-5,z},right:{x,y:5,z}}));
  flat.advanceCamera(0,{snap:true});near(flat._followState.eyeSafetyLiftM,0);near(flat._followState.eyeZ,ground+1.15);
  t.diagnostic(JSON.stringify(reports));
});
