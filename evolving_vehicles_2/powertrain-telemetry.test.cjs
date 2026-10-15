'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Telemetry = require('./powertrain-telemetry.js');
const Profiles = require('./powertrain-profiles.js');
const Evolution = require('./tuning-evolution.js');
const TrackRace = require('./race-engine.js');
const circuits = require('./circuits.js');
const dt = TrackRace.FIXED_DT;

function entrant(vehicleId, variantId, suffix = '') {
  return Evolution.createEntrant({ vehicleId, variantId, uid: variantId + suffix });
}
function carFor(vehicleId = 'k5', variantId = 'k5-2.0') {
  const entry = entrant(vehicleId, variantId);
  return { vehicleId, entrant: entry, spec: entry.spec, powerPs: entry.spec.powerPs, speed: 0, acceleration: 0 };
}
function tick(car, state, seconds, values, input) {
  Object.assign(car, values);
  for (let i = 0; i < Math.round(seconds / dt); i++) Telemetry.update(car, state, dt, input);
}
function loadEngine(telemetry) {
  const filename = require.resolve('./race-engine.js'), localRequire = createRequire(filename), module = { exports: {} };
  const sandbox = { module, PowertrainTelemetry: telemetry,
    VehicleSpecs: require('../evolving_vehicles/vehicle-specs.js'), SpaElevationProfile: require('./spa-elevation-profile.js'),
    require: name => name === './powertrain-telemetry.js' ? telemetry : localRequire(name) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return module.exports;
}
function physicalSnapshot(race) {
  return JSON.parse(JSON.stringify({ time: race.time, finished: race.finished,
    order: race.standings().map(car => car.uid), cars: race.cars.map(({ telemetry, ...car }) => car) }));
}

test('actual entrant powertrains distinguish petrol/EV Ray and petrol/hybrid Carnival; no fabricated IVT gears', () => {
  for (const [id, variant, kind, label] of [
    ['ray', 'ray-1.0-14', 'combustion', '1'], ['ray', 'ray-ev', 'electric', '—'],
    ['carnival', 'carnival-3.5', 'combustion', '1'], ['carnival', 'carnival-1.6heV', 'hybrid', '1'],
    ['avante', 'avante-2.0-16', 'combustion', 'IVT']
  ]) {
    const car = carFor(id, variant), before = JSON.stringify(car), state = Telemetry.create(car);
    assert.equal(state.kind, kind); assert.equal(state.gearLabel, label);
    assert.equal(!!state.battery, kind === 'hybrid');
    assert.equal(JSON.stringify(car), before, 'creating telemetry must not alter effective specifications');
    tick(car, state, 3, { speed: 35, acceleration: 2 }, { drivePowerW: 80000, curvature: 0 });
    if (kind === 'electric') assert.deepEqual(state, { kind, gear: null, gearLabel: '—', rpmNormalized: 0, shiftLights: 0, shiftCue: false, battery: null });
    if (label === 'IVT') {
      assert.equal(state.gear, null); assert.equal(state.gearLabel, 'IVT'); assert.ok(state.rpmNormalized > .2);
      tick(car, state, 1, { speed: 50, acceleration: 2 }, { drivePowerW: 200000, curvature: 0 });
      assert.ok(state.rpmNormalized > .94); assert.equal(state.shiftCue, false, 'IVT has no stepped upshift cue');
    }
    if (state.battery) assert.deepEqual(Object.keys(state.battery).sort(), ['flow', 'mode'], 'no invented SOC');
  }
  const convertedRay = carFor('ray', 'ray-1.0-14');
  convertedRay.spec = { ...convertedRay.spec, electric: true, powertrainType: 'electric' };
  assert.equal(Telemetry.create(convertedRay).kind, 'electric', 'effective spec overrides a stale family/profile label');
});

test('acceleration produces bounded sequential shifts, lamp drop and refill, and a shift cue before upshifts', () => {
  const car = carFor(), state = Telemetry.create(car), shifts = [];
  let lastShiftAt = -Infinity, refillBy = null, cueSeen = false;
  for (let i = 0; i < 22 / dt; i++) {
    const t = i * dt, before = { ...state };
    car.speed = 2.3 * t; car.acceleration = 2.3;
    Telemetry.update(car, state, dt, { drivePowerW: 85000, curvature: 0 });
    assert.ok(state.rpmNormalized >= 0 && state.rpmNormalized <= 1);
    assert.ok(Number.isInteger(state.shiftLights) && state.shiftLights >= 0 && state.shiftLights <= 8);
    cueSeen ||= state.shiftCue;
    if (state.gear !== before.gear) {
      assert.equal(state.gear, before.gear + 1);
      assert.ok(t - lastShiftAt >= .64, 'no repeated shifts within a fraction of a second');
      assert.ok(before.shiftLights >= 7, 'lights fill before each upshift');
      assert.equal(state.shiftLights, 0, 'brief shift interruption is visible');
      assert.ok(state.rpmNormalized < before.rpmNormalized - .15, 'RPM falls with the higher gear');
      lastShiftAt = t; refillBy = t + .3; shifts.push(t);
    }
    if (refillBy !== null && t >= refillBy) { assert.ok(state.shiftLights > 0, 'lights resume after the shift'); refillBy = null; }
  }
  assert.ok(cueSeen); assert.equal(shifts.length, 5); assert.equal(state.gear, 6);
});

test('hysteresis prevents shift hunting at an upshift speed and limits rapid downshift cascades', () => {
  const car = carFor(), state = Telemetry.create(car), profile = Profiles.resolve(car);
  const thresholdSpeed = profile.shiftRPM / profile.total1stReduction * (2 * Math.PI * car.spec.frontTireRadiusMm / 1000) / 60;
  let changes = 0, previous = state.gear;
  for (let i = 0; i < 8 / dt; i++) {
    car.speed = thresholdSpeed * (1 + .025 * Math.sin(i * dt * 12)); car.acceleration = .1;
    Telemetry.update(car, state, dt, { drivePowerW: 15000 });
    if (state.gear !== previous) changes++;
    previous = state.gear;
  }
  assert.equal(changes, 1, 'small speed oscillations should not alternate between two gears');
  tick(car, state, 4, { speed: 70, acceleration: 1 }, { drivePowerW: 90000 });
  assert.equal(state.gear, 6);
  assert.equal(state.shiftLights, 8); assert.equal(state.shiftCue, false, 'top gear cannot request another upshift');
  let lastAt = -Infinity, lastGear = state.gear;
  for (let i = 0; i < 5 / dt; i++) {
    car.speed = 0; car.acceleration = -5;
    Telemetry.update(car, state, dt, { brakePowerW: 0 });
    if (lastGear !== state.gear) {
      assert.ok(i * dt - lastAt >= .64); assert.equal(lastGear - state.gear, 1);
      lastGear = state.gear; lastAt = i * dt;
    }
  }
  assert.equal(state.gear, 1); assert.equal(state.shiftLights, 0);
});

test('hybrid gauge charges on applied braking and assists only the first seconds after leaving a corner', () => {
  const car = carFor('carnival', 'carnival-1.6heV'), state = Telemetry.create(car);
  tick(car, state, 5, { speed: 20, acceleration: 2 }, { drivePowerW: 80000, curvature: 0 });
  assert.deepEqual(state.battery, { flow: 0, mode: 'idle' }, 'launch/long straight acceleration is not corner-exit assist');
  tick(car, state, 1.5, { speed: 20, acceleration: .4 }, { drivePowerW: 35000, curvature: .012 });
  assert.equal(state.battery.mode, 'idle', 'mid-corner propulsion does not trigger exit assist');
  tick(car, state, 1, { speed: 25, acceleration: 2 }, { drivePowerW: 80000, curvature: 0 });
  assert.equal(state.battery.mode, 'using'); assert.ok(state.battery.flow > .4 && state.battery.flow <= 1);
  tick(car, state, .3, { acceleration: -2 }, { brakePowerW: 90000, curvature: 0 });
  assert.equal(state.battery.mode, 'charging'); assert.ok(state.battery.flow < -.7 && state.battery.flow >= -1);
  tick(car, state, .3, { acceleration: -.5 }, { drivePowerW: 12000, brakePowerW: 0, curvature: 0 });
  assert.deepEqual(state.battery, { flow: 0, mode: 'idle' }, 'uphill slowing with positive wheel work is not regeneration');
  tick(car, state, .3, { acceleration: 1.5 }, { drivePowerW: 0, brakePowerW: 0, curvature: 0 });
  assert.deepEqual(state.battery, { flow: 0, mode: 'idle' }, 'downhill coasting acceleration is not electric assist');
  tick(car, state, 5, { acceleration: 2 }, { drivePowerW: 80000, curvature: 0 });
  assert.deepEqual(state.battery, { flow: 0, mode: 'idle' }, 'the finite exit window expires on a long straight');
});

test('brief curvature noise and short gaps inside a corner do not start the hybrid exit window', () => {
  const car = carFor('carnival', 'carnival-1.6heV'), state = Telemetry.create(car);
  for (let n = 0; n < 5; n++) {
    tick(car, state, 5 * dt, { speed: 20, acceleration: 1 }, { drivePowerW: 60000, curvature: .03 });
    tick(car, state, .8, {}, { drivePowerW: 60000, curvature: 0 });
    assert.equal(state.battery.mode, 'idle', 'isolated curvature spikes are not completed corners');
  }
  tick(car, state, 1.5, {}, { drivePowerW: 60000, curvature: .012 });
  for (let n = 0; n < 5; n++) {
    tick(car, state, .1, {}, { drivePowerW: 60000, curvature: 0 });
    assert.equal(state.battery.mode, 'idle');
    tick(car, state, .5, {}, { drivePowerW: 60000, curvature: .012 });
    assert.equal(state.battery.mode, 'idle');
  }
  tick(car, state, 1, {}, { drivePowerW: 60000, curvature: 0 });
  assert.equal(state.battery.mode, 'using', 'a sustained exit still enables assistance');
});

test('finished and retired cars clear active flow, RPM lamps and the selected gear', () => {
  for (const terminal of ['finished', 'dnf']) {
    const car = carFor('carnival', 'carnival-1.6heV'), state = Telemetry.create(car);
    tick(car, state, 1, { speed: 35, acceleration: -2 }, { brakePowerW: 60000, curvature: .01 });
    assert.equal(state.battery.mode, 'charging');
    car[terminal] = true;
    Telemetry.update(car, state, 0);
    assert.deepEqual(state, { kind: 'hybrid', gear: null, gearLabel: '—', rpmNormalized: 0, shiftLights: 0, shiftCue: false, battery: { flow: 0, mode: 'idle' } });
  }
});

test('fixed physics ticks make telemetry identical at 1x/2x/3x and irregular rendering; paused frames do nothing', () => {
  const options = { circuit: circuits.find(c => c.id === 'everland'), laps: 2,
    entrants: [entrant('carnival', 'carnival-1.6heV'), entrant('carnival', 'carnival-3.5')] };
  const races = Array.from({ length: 5 }, () => new TrackRace(options));
  races[0].step(60);
  for (let multiplier = 1; multiplier <= 3; multiplier++) {
    const race = races[multiplier];
    for (let i = 0; i < 3600 / multiplier; i++) { race.step(multiplier / 60); race.step(0); }
  }
  const schedule = [1, 7, 2, 4, 3, 5, 6];
  for (let i = 0, ticks = 0; ticks < 7200; i++) {
    const batch = Math.min(schedule[i % schedule.length], 7200 - ticks);
    races[4].step(batch * dt); ticks += batch;
  }
  for (const race of races.slice(1)) {
    assert.deepEqual(race.cars.map(car => car.telemetry), races[0].cars.map(car => car.telemetry));
    assert.deepEqual(physicalSnapshot(race), physicalSnapshot(races[0]));
  }
  const before = JSON.stringify(races[0].cars);
  for (let i = 0; i < 100; i++) races[0].step(0);
  assert.equal(JSON.stringify(races[0].cars), before);
});

test('engine instrumentation separates gravity-driven speed changes from actual drive and brake work', () => {
  const observations = [], ObservedRace = loadEngine({
    create: Telemetry.create, stop: Telemetry.stop,
    update(car, state, delta, input) { observations.push({ acceleration: car.acceleration, ...input }); return Telemetry.update(car, state, delta, input); }
  });
  for (const grade of [-.12, .12]) {
    const race = new ObservedRace({ circuit: circuits.find(c => c.id === 'everland'), laps: 1, entrants: [entrant('carnival', 'carnival-1.6heV')] });
    const car = race.cars[0], speed = 20, normal = 1 / Math.hypot(1, grade);
    const resistance = .5 * 1.225 * car.dragArea * speed * speed + car.rollingCoefficient * car.massKg * 9.81 * normal + car.massKg * 9.81 * grade * normal;
    car.speed = speed;
    race.sample = () => ({ x: 0, y: 0, elevation: 0, grade, curvature: 0 });
    race._target = () => speed - resistance / car.massKg * dt;
    race.step(dt);
    const last = observations.at(-1);
    assert.equal(Math.sign(last.acceleration), -Math.sign(grade));
    assert.ok(last.drivePowerW < 1e-6 && last.brakePowerW < 1e-6, 'coasting work must be zero despite speed changing');
    assert.deepEqual(car.telemetry.battery, { flow: 0, mode: 'idle' });
  }
});

test('telemetry makes no difference to any physical state, score inputs, terminal times or order', () => {
  const BareRace = loadEngine(null);
  for (const id of ['everland', 'spa']) {
    const options = { circuit: circuits.find(c => c.id === id), laps: 1,
      entrants: [entrant('carnival', 'carnival-1.6heV'), entrant('carnival', 'carnival-3.5')] };
    const withHUD = new TrackRace(options), withoutHUD = new BareRace(options);
    for (let batch = 0; batch < 40 && !withHUD.finished; batch++) {
      withHUD.step(30); withoutHUD.step(30);
      assert.deepEqual(physicalSnapshot(withHUD), physicalSnapshot(withoutHUD), id + ': adding a HUD must not alter the simulation');
    }
    assert.equal(withHUD.finished, true);
    for (const car of withHUD.cars) { assert.equal(car.telemetry.gearLabel, '—'); assert.equal(car.telemetry.shiftLights, 0); }
    const scores = race => Evolution.evaluate(options.entrants, race.cars).map(({ result, ...score }) => score);
    assert.deepEqual(scores(withHUD), scores(withoutHUD));
    assert.deepEqual(Evolution.breed(options.entrants, withHUD.cars, { seed: 812 }), Evolution.breed(options.entrants, withoutHUD.cars, { seed: 812 }));
  }
});
