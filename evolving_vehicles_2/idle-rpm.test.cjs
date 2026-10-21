'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Profiles = require('./powertrain-profiles.js'), Dynamics = require('./powertrain-dynamics.js');
const Telemetry = require('./powertrain-telemetry.js'), Evolution = require('./tuning-evolution.js'), Race = require('./race-engine.js');
const DT = Race.FIXED_DT;
const R22 = new Set(['g70-2.2d-rwd', 'g70-2.2d-awd', 'staria-2.2d-fwd', 'staria-2.2d-awd']);
const entries = Object.entries(Evolution.VARIANTS).flatMap(([vehicleId, variants]) => variants.map(variant =>
  Evolution.createEntrant({ vehicleId, variantId: variant.id, uid: variant.id, budget: 0 })));
const expectedIdle = type => ({ gasoline: 750, lpg: 750, diesel: 800, hybrid: 1000, electric: 0 })[type];
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function carFor(e, speed = 0, dynamics = Dynamics) {
  const car = { entrant: e, vehicleId: e.vehicleId, spec: e.spec, speed, reduction: e.spec.reduction, driveReduction: e.spec.reduction };
  car.transmission = dynamics.create(car); car.telemetry = Telemetry.create(car);
  return car;
}
function assertIdle(car, profile) {
  assert.equal(car.transmission.rpm, profile.idleRPM, car.entrant.variantId);
  assert.equal(car.transmission.gear, 1); assert.equal(car.transmission.shifting, false);
  assert.equal(car.telemetry.gearSource, 'physics'); assert.equal(car.telemetry.gear, 1);
  assert.equal(car.telemetry.rpmNormalized, 0); assert.equal(car.telemetry.shiftLights, 0);
}
const straight = { id: 'idle-return-validation', lengthM: 4800,
  coordinates: [[1000, 0], [2000, 0], [2000, 400], [0, 400], [0, 0], [1000, 0]]
    .map(([x, y]) => [127 + x / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + y / 111195.08]) };

test('registered idle floors remain estimates and do not inherit a six-speed R2.2 observation', () => {
  const eightSpeedR22 = [];
  for (const e of entries) {
    const p = Profiles.resolve({ entrant: e, spec: e.spec }), idle = expectedIdle(p.powertrainType);
    assert.ok(Number.isFinite(idle), e.variantId + ': missing family');
    assert.equal(p.variantId, e.variantId); assert.equal(p.idleRPM, idle, e.variantId);
    assert.equal(p.idleModel.rpm, idle);
    assert.equal(p.idleModel.status, p.powertrainType === 'electric' ? 'not-applicable' : 'estimated');
    if (R22.has(e.variantId)) {
      eightSpeedR22.push(e.variantId);
      assert.equal(p.transmissionType, 'AT'); assert.equal(p.gearCount, 8);
      assert.equal(p.idleRPM, 800); assert.notEqual(p.idleRPM, 830);
    }
    if (p.powertrainType !== 'electric') {
      assert.ok(p.idleRPM >= 500 && p.idleRPM + 1000 < p.shiftRPM && p.shiftRPM <= p.maxRPM);
      assert.ok(p.estimatedFields.includes('idleRPM'), 'an idle calibration is not a factory-certified measurement');
      assert.ok(!p.verifiedFields.includes('idleRPM'));
    }
  }
  assert.deepEqual(eightSpeedR22.sort(), [...R22].sort());
  for (const id of ['carnival-2.2d', 'porter-diesel-mt', 'porter-diesel-at']) assert.equal(Profiles.PROFILES[id].idleRPM, 800);
});

test('all stepped powertrains initialize at their own physical idle with zero shift LEDs; EV and IVT retain their distinct contracts', () => {
  for (const e of entries) {
    const car = carFor(e), p = Profiles.resolve(car);
    if (p.gearCount) assertIdle(car, p);
    else {
      // The current IVT has a display estimate, not a physical stepped-engine
      // RPM state. Zero here must not be interpreted as an engine-off system.
      assert.equal(car.transmission.gear, null); assert.equal(car.transmission.rpm, 0);
      assert.equal(car.telemetry.shiftLights, 0);
      assert.equal(car.telemetry.gearSource, p.powertrainType === 'electric' ? 'not-applicable' : 'continuous-estimate');
      assert.equal(car.telemetry.gearLabel, p.powertrainType === 'electric' ? '—' : 'IVT');
    }
    if (p.powertrainType === 'hybrid') {
      assert.equal(p.idleModel.condition, 'engine-on-reference'); assert.equal(car.transmission.rpm, 1000);
      assert.equal(car.telemetry.kind, 'hybrid'); assert.equal(car.telemetry.battery.mode, 'idle');
      assert.equal(Object.hasOwn(car.telemetry.battery, 'soc'), false);
      assert.equal(Object.hasOwn(car.transmission, 'engineOn'), false, 'no engine-off/SOC controller is introduced');
    } else if (p.powertrainType === 'electric') {
      assert.equal(p.idleModel.condition, 'no-combustion-engine'); assert.equal(p.idleRPM, 0);
      assert.equal(car.telemetry.kind, 'electric'); assert.equal(car.telemetry.battery, null);
    }
  }
});

test('real acceleration and braking return to calibrated idle, and restarting creates fresh stationary state', () => {
  const ids = ['g70-3.3t-rwd', 'k5-2.0lpg', 'santafe-1.6hev-fwd', 'staria-2.2d-fwd', 'carnival-2.2d', 'porter-diesel-mt'];
  for (const id of ids) {
    const e = entries.find(e => e.variantId === id), options = { circuit: straight, entrants: [e], racingLine: false, laps: 1 };
    const race = new Race(options), car = race.cars[0], profile = Profiles.resolve(car);
    let target = 100 / 3.6;
    race._target = () => target;
    for (let tick = 0; tick < 40 / DT && car.speed < target - 1e-9; tick++) race.step(DT);
    assert.ok(car.speed >= target - 1e-9, id + ': accelerated'); assert.ok(car.transmission.upshiftCount > 0);
    target = 0;
    for (let tick = 0; tick < 20 / DT && car.speed > 1e-9; tick++) race.step(DT);
    assert.ok(car.speed < 1e-9, id + ': stopped');
    race.step(6); // Allow the existing downshift hysteresis to return to first.
    assert.equal(car.dnf, false); assertIdle(car, profile);
    const restarted = new Race(options).cars[0];
    assert.notEqual(restarted.transmission, car.transmission); assert.notEqual(restarted.telemetry, car.telemetry);
    assert.equal(restarted.transmission.shiftCount, 0); assert.equal(restarted.speed, 0); assertIdle(restarted, profile);
  }
});

test('changing only idle floors leaves engaged-gear RPM, gearing and wheel force unchanged above idle', () => {
  // Compare the same production dynamics with an isolated old 900-RPM floor.
  // This changes only its profile input, without mutating global modules or
  // manufacturing a second implementation of the transmission algorithm.
  const sandbox = { module: { exports: {} }, PowertrainProfiles: {
    resolve(car) { return { ...Profiles.resolve(car), idleRPM: 900 }; }
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./powertrain-dynamics.js'), 'utf8'), sandbox);
  const legacy = sandbox.module.exports;
  for (const e of entries) {
    const profile = Profiles.resolve({ entrant: e, spec: e.spec });
    if (!profile.gearCount) continue;
    const car = carFor(e, 100 / 3.6), old = carFor(e, 100 / 3.6, legacy);
    assert.ok(car.transmission.rpm > Math.max(900, profile.idleRPM));
    assert.equal(car.transmission.gear, old.transmission.gear);
    close(car.transmission.rpm, old.transmission.rpm); close(car.transmission.totalRatio, old.transmission.totalRatio);
    const force = Dynamics.advance(car, car.transmission, DT, { accelerating: true });
    const oldForce = legacy.advance(old, old.transmission, DT, { accelerating: true });
    close(force.forceRatio, oldForce.forceRatio); close(force.torqueFactor, oldForce.torqueFactor);
    Telemetry.update(car, car.telemetry, DT);
    const expected = Math.max(0, Math.min(1, (car.transmission.rpm - profile.idleRPM) / (profile.shiftRPM - profile.idleRPM)));
    close(car.telemetry.rpmNormalized, expected);
    assert.equal(car.telemetry.shiftLights, Math.ceil(expected * 8));
  }
});
