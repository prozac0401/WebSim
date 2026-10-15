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
  for (const mode of ['overview', 'follow', 'top']) {
    r.setView(mode);
    const anchor = { x: 390, y: 330 }, original = r._groundPoint(anchor.x, anchor.y, r._interactionCamera());
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
  for (const mode of ['overview', 'follow', 'top']) {
    r.setView(mode); r.pan(-65, 12);
    const anchor = { x: 650, y: 380 }, world = r._groundPoint(anchor.x, anchor.y, r._interactionCamera());
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

test('follow view opens behind the car at a low pitch and comfortable distance', () => {
  const { renderer: r } = fixture();
  r.setView('follow');
  const camera = r._interactionCamera(), heading = Math.atan2(.2, 1);
  const rearX = -Math.sin(camera.yaw), rearY = Math.cos(camera.yaw);
  near(r.followYaw, 0); near(r.pitch, .24);
  near(rearX * Math.cos(heading) + rearY * Math.sin(heading), -1);
  assert.ok(camera.distance >= 8 && camera.distance <= 11);
  near(2 * Math.atan(r.height / (2 * camera.f)) * 180 / Math.PI, 58);
  near(camera.cy / r.height, .64);
});

test('follow heading crosses the signed-angle boundary by the short arc', () => {
  const { renderer: r } = fixture();
  let heading = Math.PI - .02;
  r.race.sample = distance => ({ x: distance * Math.cos(heading), y: distance * Math.sin(heading), elevation: 10, angle: heading });
  r.setView('follow');
  const before = r._interactionCamera().yaw;
  heading = -Math.PI + .02;
  assert.equal(r.advanceCamera(1 / 60), true);
  const movement = r._interactionCamera().yaw - before;
  assert.ok(movement > 0 && movement < .04, `Wrapped heading moved ${movement} radians`);
});

test('follow smoothing uses elapsed time and settles without idle drift', () => {
  const { renderer: a } = fixture(), { renderer: b } = fixture();
  let heading = 0;
  for (const r of [a, b]) {
    r.race.sample = distance => ({ x: distance * Math.cos(heading), y: distance * Math.sin(heading), elevation: 10, angle: heading });
    r.setView('follow'); r._interactionCamera();
  }
  heading = .2;
  a.advanceCamera(.1);
  for (let frame = 0; frame < 6; frame++) b.advanceCamera(1 / 60);
  for (const key of ['x', 'y', 'z', 'heading', 'headingVelocity']) near(a._followState[key], b._followState[key]);
  assert.ok(a._followState.heading > 0 && a._followState.heading < .2);
  for (let frame = 0; frame < 300; frame++) a.advanceCamera(1 / 60);
  near(a._followState.heading, .2);
  const settled = { ...a._followState };
  assert.equal(a.advanceCamera(1 / 60), false);
  assert.deepEqual(a._followState, settled);
});

test('camera reads and pointer controls never advance a pending follow interpolation', () => {
  const { renderer: r } = fixture();
  r.setView('follow'); r.advanceCamera(0);
  r.race.cars[0].distance = .5; r.advanceCamera(1 / 60);
  const state = { ...r._followState }, anchor = { x: 490, y: 340 };
  const world = r._groundPoint(anchor.x, anchor.y, r._interactionCamera());
  r.pan(31, 12, anchor);
  let p = r._project(world, r._interactionCamera()); near(p.x, anchor.x + 31); near(p.y, anchor.y + 12);
  const zoomAnchor = { x: 550, y: 380 }, zoomWorld = r._groundPoint(zoomAnchor.x, zoomAnchor.y, r._interactionCamera());
  r.zoom(1.4, zoomAnchor); r._interactionCamera(); r._interactionCamera();
  p = r._project(zoomWorld, r._interactionCamera()); near(p.x, zoomAnchor.x); near(p.y, zoomAnchor.y);
  assert.deepEqual(r._followState, state);
});

test('the rig shares the car anchor without lateral or vertical sliding at accelerated playback', () => {
  const { renderer: r } = fixture();
  const sample = r.race.sample;
  r.race.sample = distance => ({ ...sample(distance), elevation: 40 + distance * .2 });
  r.setView('follow'); r._interactionCamera();
  r.race.cars[0].distance = 5;
  r.advanceCamera(1 / 60);
  const goal = r._followGoal(r.race.cars[0]), pose = r._followState;
  for (const key of ['x', 'y', 'z']) near(pose[key], goal[key]);
  const camera = r._interactionCamera(), screen = r._project({ x: goal.x, y: goal.y, z: goal.z }, camera);
  near(screen.x, camera.cx); near(screen.y, camera.cy); near(camera.pitch, .24);
});

test('only explicit timeline jumps snap angular state; manual idle frames do not redraw', () => {
  const { renderer: r } = fixture();
  let heading = 0;
  r.race.sample = distance => ({ x: distance, y: Math.tan(heading) * distance, elevation: 10, angle: heading });
  r.setView('follow'); r._interactionCamera();
  heading = .6; r.race.cars[0].distance = 1000;
  assert.equal(r.advanceCamera(1 / 60), true);
  near(r._interactionCamera().target.x, 1000);
  assert.ok(r._followState.heading < .1, 'large travel must not trigger an automatic yaw reset');
  assert.equal(r.advanceCamera(0, { snap: true }), true);
  near(r._followState.heading, heading); near(r._followState.headingVelocity, 0);
  const state = r._followState;
  assert.equal(r.advanceCamera(0, { snap: true }), false);
  assert.equal(r._followState, state);
});

test('new race, view and watched vehicle reset stale follow state', () => {
  const { renderer: r } = fixture();
  r.setView('follow'); r._interactionCamera(); r.race.cars[0].distance = 10; r.advanceCamera(1 / 60);
  r._makeRoad = () => {};
  r.setRace({ ...r.race, cars: [{ ...r.race.cars[0], distance: 100 }] });
  near(r._interactionCamera().target.x, 100);
  r.race.cars[0].distance = 200;
  r.setView('overview'); r.setView('follow');
  near(r._interactionCamera().target.x, 200); near(r.followYaw, 0);
  r.race.cars.push({ ...r.race.cars[0], id: 1, distance: 300 }); r.watch = 1;
  near(r._interactionCamera().target.x, 300);
});

test('corner heading carries angular velocity instead of clamping or reversing instantly', () => {
  const { renderer: r } = fixture();
  let heading = 0;
  r.race.sample = distance => ({ x: distance * Math.cos(heading), y: distance * Math.sin(heading), elevation: 10, angle: heading });
  r.setView('follow'); r._interactionCamera();
  heading = .6; r.advanceCamera(1 / 60);
  assert.ok(r._followState.heading < .03, 'first turn frame must not jump to a fixed angular-lag boundary');
  for (let frame = 0; frame < 9; frame++) r.advanceCamera(1 / 60);
  const before = { ...r._followState };
  heading = 0; r.advanceCamera(1 / 60);
  assert.ok(r._followState.heading > before.heading, 'angular inertia should carry through a sudden target change');
  assert.ok(r._followState.headingVelocity > 0 && r._followState.headingVelocity < before.headingVelocity);
  for (let frame = 0; frame < 240; frame++) r.advanceCamera(1 / 60);
  near(r._followState.heading, 0); near(r._followState.headingVelocity, 0);
});

test('camera averages the shared path around the car with limited speed-based anticipation', t => {
  const previous = global.DrivingPose, samples = [];
  t.after(() => { if (previous === undefined) delete global.DrivingPose; else global.DrivingPose = previous; });
  global.DrivingPose = { sample(race, distance) {
    samples.push(distance);
    const radius = 80, angle = distance / radius;
    return { x: 700 + radius * Math.sin(angle), y: 900 + radius * (1 - Math.cos(angle)), z: 30, elevation: 30, angle, grade: 0 };
  } };
  const { renderer: r } = fixture(), car = r.race.cars[0];
  car.speed = 0;
  const slow = r._followGoal(car);
  near(slow.x, 700); near(slow.y, 900); near(slow.z, 30.8); near(slow.heading, 0);
  assert.ok(samples.some(s=>s<car.distance)&&samples.some(s=>s>car.distance),'average both sides of the current position');
  car.speed = 50;
  const fast = r._followGoal(car);
  assert.ok(fast.heading > slow.heading && fast.heading < 4/80, 'anticipation remains under four metres of arc');
});

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const rms = values => Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);
function legacyFollowGoal(car) {
  const sample=distance=>global.DrivingPose?.sample(this.race,distance)||this.race.sample(distance);
  const p=sample(car.distance),ahead=sample(car.distance+Math.max(10,Math.min(20,10+(car.speed||0)*.22)));
  const chord=Math.atan2(ahead.y-p.y,ahead.x-p.x);
  return {id:car.id,x:p.x,y:p.y,z:(p.elevation??p.z??0)+.8,heading:p.angle+wrap(chord-p.angle)*.65,distance:car.distance};
}
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
    const {renderer:a}=fixture(),{renderer:b}=fixture();a.race.sample=sample;b.race.sample=sample;b._followGoal=legacyFollowGoal;
    const current=chase(a,100/3.6,-60,pattern,8,3),legacy=chase(b,100/3.6,-60,pattern,8,3);
    const changes=frames=>frames.slice(1).map((v,i)=>v.rate-frames[i].rate);
    const ratio=rms(changes(current.frames))/rms(changes(legacy.frames));
    assert.ok(ratio<.15,'remove short direction pulses at every cadence, ratio '+ratio);
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
      const goal = r._followGoal(car), body = global.DrivingPose.sample(r.race, s);
      headings.push(goal.heading);
      assert.ok(Math.abs(wrap(goal.heading - body.angle)) < .28, id + ': do not look around the return leg');
    }
    const maximum = Math.max(...headings.slice(2).map((h, i) => Math.abs(wrap(h - headings[i + 1]) - wrap(headings[i + 1] - headings[i])) / .01));
    assert.ok(maximum < limit, id + ': abrupt camera direction-gradient change ' + maximum);
    reports.push({ id, maximumGradientChange: +maximum.toFixed(5) });
  }
  t.diagnostic(JSON.stringify(reports));
});

test('actual sharp corners remain rearward and cadence-independent at 1x, 2x and 3x', t => {
  const previous = global.DrivingPose;
  t.after(() => { if (previous === undefined) delete global.DrivingPose; else global.DrivingPose = previous; });
  global.DrivingPose = require('./driving-pose.js');
  const TrackRace = require('./race-engine.js'), circuits = require('./circuits.js');
  const reports = [], patterns = [[1 / 30], [1 / 60], [1 / 120, 1 / 45, 1 / 80, 1 / 28]];
  for (const [id, center] of [['everland', 3860], ['yeongam', 3670], ['pocheon', 2730], ['spa', 240]]) {
    const race = new TrackRace({ circuit: circuits.find(c => c.id === id), vehicleIds: ['g80'], racingLine: true, laps: 1 });
    for (const playback of [1, 2, 3]) {
      let reference = null, worstOffset = 0;
      for (const pattern of patterns) {
        const { renderer: r } = fixture(); r.race = race;
        const run = chase(r, 12, center - 45, pattern, 90 / (12 * playback), 0, playback);
        for (const frame of run.frames) {
          const body = global.DrivingPose.sample(race, frame.distance);
          worstOffset = Math.max(worstOffset, Math.abs(wrap(frame.heading - body.angle)));
        }
        const car = race.cars[0], goal = r._followGoal(car);
        for (const key of ['x', 'y', 'z']) near(r._followState[key], goal[key]);
        if (reference) run.checkpoints.forEach((heading, i) => {
          assert.ok(Math.abs(wrap(heading - reference[i])) < .012, id + ' ' + playback + 'x: fixed/uneven frame agreement');
        }); else reference = run.checkpoints;
      }
      assert.ok(worstOffset < 1, id + ' ' + playback + 'x: chase camera stays in the rear hemisphere');
      reports.push({ id, playback, maximumBodyOffsetDegrees: +(worstOffset * 180 / Math.PI).toFixed(2) });
    }
  }
  t.diagnostic(JSON.stringify(reports));
});

test('tight hairpins keep a rearward direction without excessive early rotation or heading flips', () => {
  for(const radius of [6,12,25]){
    const {renderer:r}=fixture(),car=r.race.cars[0],length=Math.PI*radius;car.speed=radius*.8;
    r.race.sample=s=>s<0?{x:s,y:0,elevation:10,angle:0}:s>length?{x:-(s-length),y:radius*2,elevation:10,angle:Math.PI}:
      {x:radius*Math.sin(s/radius),y:radius*(1-Math.cos(s/radius)),elevation:10,angle:s/radius};
    let previous=null;
    for(let s=-40;s<length+40;s+=.25){
      car.distance=s;const goal=r._followGoal(car),actual=r.race.sample(s);
      assert.ok(Math.abs(wrap(goal.heading-actual.angle))<.3,'remain behind the car on radius '+radius+' at '+s);
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
