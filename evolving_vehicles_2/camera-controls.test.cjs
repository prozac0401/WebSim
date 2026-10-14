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
    track: { bounds: { minX: -100, maxX: 400, minY: -250, maxY: 500, width: 500, height: 750 }, elevationMin: 30, elevationMax: 100 },
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
  near(after.x - before.x, 100); near(after.y - before.y, 20); near(after.z - before.z, 1);
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

test('camera uses the shared visual path and lengthens corner anticipation with speed', t => {
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
  near(slow.x, 700); near(slow.y, 900); near(slow.z, 30.8); near(samples.at(-1) - car.distance, 10);
  car.speed = 50;
  const fast = r._followGoal(car);
  near(samples.at(-1) - car.distance, 20);
  assert.ok(fast.heading > slow.heading && fast.heading < .15, 'look ahead gradually around the path bend');
});
