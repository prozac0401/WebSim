'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Dynamics = require('./powertrain-dynamics.js'), Profiles = require('./powertrain-profiles.js');
const Evolution = require('./tuning-evolution.js'), Race = require('./race-engine.js');
const DT = Race.FIXED_DT;
const straight = { id: 'shift-validation', lengthM: 4800,
  coordinates: [[1000, 0], [2000, 0], [2000, 400], [0, 400], [0, 0], [1000, 0]]
    .map(([x, y]) => [127 + x / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + y / 111195.08]) };
const entry = (vehicleId, variantId) => Evolution.createEntrant({ vehicleId, variantId, budget: 0 });
function carFor(vehicleId, variantId, speed = 0) {
  const entrant = entry(vehicleId, variantId), spec = entrant.spec;
  const car = { vehicleId, entrant, spec, speed, reduction: spec.reduction, driveReduction: spec.reduction };
  car.transmission = Dynamics.create(car);
  return car;
}
const makeRace = (vehicleId, variantId, initialSpeed = 0) => new Race({ circuit: straight,
  entrants: [entry(vehicleId, variantId)], initialSpeed, racingLine: false, laps: 1 });
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('manual upshift transmits zero torque for the full assumed duration, then restores the next ratio', () => {
  const car = carFor('avante_n', 'avante-n-2.0t-mt'), profile = Profiles.resolve(car), s = car.transmission;
  car.speed = Dynamics.gearSpeedAtRPM(car, 1, profile.shiftRPM) * 1.001;
  let elapsed = 0, deliveredTime = 0;
  do {
    const force = Dynamics.advance(car, s, DT, { accelerating: true });
    deliveredTime += force.torqueFactor * DT; elapsed += DT;
    if (s.shifting) { assert.equal(s.neutral, true); assert.equal(s.gear, 1); assert.equal(force.forceRatio, 0); }
  } while (s.shifting);
  close(elapsed, profile.shiftModel.upshiftDurationS);
  close(deliveredTime, 0);
  assert.equal(s.gear, 2); assert.equal(s.neutral, false); assert.equal(s.upshiftCount, 1);
  const restored = Dynamics.advance(car, s, DT, { accelerating: true });
  close(restored.forceRatio, Dynamics.describeGearing(car).totalRatios[1]);
  assert.equal(restored.torqueFactor, 1);
});

test('DCT handover preserves configured torque and integrates its fractional final tick without an extra upshift lock', () => {
  const car = carFor('avante_n', 'avante-n-2.0t-dct'), p = Profiles.resolve(car), s = car.transmission;
  car.speed = Dynamics.gearSpeedAtRPM(car, 1, p.shiftRPM) * 1.001;
  const ratios = Dynamics.describeGearing(car).totalRatios;
  let elapsed = 0, delivered = 0, ratioIntegral = 0;
  do {
    const force = Dynamics.advance(car, s, DT, { accelerating: true });
    elapsed += DT; delivered += force.torqueFactor * DT; ratioIntegral += force.forceRatio * DT;
    assert.equal(s.neutral, false); assert.ok(force.torqueFactor >= p.shiftModel.torqueRetention);
  } while (s.shifting);
  const duration = p.shiftModel.upshiftDurationS, retention = p.shiftModel.torqueRetention;
  close(delivered, duration * retention + elapsed - duration);
  close(ratioIntegral, duration * retention * (ratios[0] + ratios[1]) / 2 + (elapsed - duration) * ratios[1]);
  assert.ok(elapsed < .65); assert.equal(s.gear, 2);
  car.speed = Dynamics.gearSpeedAtRPM(car, 2, p.shiftRPM) * 1.001;
  Dynamics.advance(car, s, DT, { accelerating: true });
  assert.equal(s.shifting, true); assert.equal(s.toGear, 3); assert.equal(s.upshiftCount, 2);
});

test('braking downshift is rev-matched immediately without a manual neutral or torque-cut interval', () => {
  const car = carFor('avante_n', 'avante-n-2.0t-mt', 23), s = car.transmission;
  assert.equal(s.gear, 2);
  car.speed = 6;
  const force = Dynamics.advance(car, s, DT, { braking: true });
  assert.equal(s.gear, 1); assert.equal(s.downshiftCount, 1); assert.equal(s.upshiftCount, 0);
  assert.equal(s.shifting, false); assert.equal(s.neutral, false); assert.equal(force.torqueFactor, 1);
  assert.ok(s.rpm < Profiles.resolve(car).shiftRPM);
});

test('future-speed preview is pure, advances predicted gears, and keeps EV/IVT/unknown fallbacks', () => {
  const car = carFor('supra', 'supra-3.0t-rz'), snapshot = JSON.stringify(car);
  const fast = Dynamics.preview(car, 75), slow = Dynamics.preview(car, 10);
  assert.ok(fast.gear > slow.gear && fast.totalRatio < slow.totalRatio);
  assert.equal(JSON.stringify(car), snapshot);
  for (const [vehicle, variant] of [['ioniq5', 'ioniq5-long-rwd'], ['avante', 'avante-2.0-18']]) {
    const c = carFor(vehicle, variant);
    assert.equal(Dynamics.preview(c, 30), null);
    for (let i = 0; i < 100; i++) Dynamics.advance(c, c.transmission, DT, { accelerating: true });
    assert.equal(c.transmission.shiftCount, 0);
  }
  assert.equal(Dynamics.preview({ spec: { factoryDrive: 'rwd', rearTireRadiusMm: 350 }, driveReduction: 9 }, 40), null);
});

test('rolling initialization has the correct sourced gear and RPM without replaying shifts or elapsed time', () => {
  const race = makeRace('supra', 'supra-3.0t-rz', 200 / 3.6), car = race.cars[0], s = car.transmission;
  assert.equal(s.gear, 6); assert.equal(s.shiftCount, 0); assert.equal(s.shifting, false);
  const gearing = Dynamics.describeGearing(car);
  close(s.rpm, car.speed * 60 / (2 * Math.PI * gearing.effectiveRadiusM) * gearing.totalRatios[5]);
  assert.equal(race.time, 0); assert.equal(car.distance, 0);
});

test('actual manual shift keeps time, distance and resistive coasting active instead of adding a time penalty', () => {
  const race = makeRace('avante_n', 'avante-n-2.0t-mt'), car = race.cars[0];
  for (let i = 0; i < 2000 && !car.transmission.shifting; i++) race.step(DT);
  assert.equal(car.transmission.neutral, true);
  const speed = car.speed, distance = car.distance, time = race.time;
  const drag = .5 * 1.225 * car.dragArea * speed * speed;
  const resistance = drag + car.rollingCoefficient * car.massKg * 9.81;
  race.step(DT);
  close(car.acceleration, -resistance / car.massKg, 1e-9);
  close(car.speed, speed - resistance / car.massKg * DT, 1e-9);
  close(car.distance - distance, (speed + car.speed) * .5 * DT, 1e-9);
  close(race.time - time, DT);
  assert.ok(car.distance > distance && car.speed > 0);
});

test('actual DCT and AT handovers retain positive wheel work and never become neutral', () => {
  for (const [vehicle, variant] of [['avante_n', 'avante-n-2.0t-dct'], ['supra', 'supra-3.0t-rz'], ['g80', 'g80-2.5t-rwd']]) {
    const race = makeRace(vehicle, variant), car = race.cars[0];
    for (let i = 0; i < 2400 && !car.transmission.shifting; i++) race.step(DT);
    assert.equal(car.transmission.shifting, true, variant);
    assert.equal(car.transmission.neutral, false);
    const resistance = .5 * 1.225 * car.dragArea * car.speed ** 2 + car.rollingCoefficient * car.massKg * 9.81;
    race.step(DT);
    assert.ok(car.massKg * car.acceleration + resistance > 0, variant + ' wheel work');
    assert.ok(car.transmission.torqueFactor >= .65);
  }
});

test('high-gear wheel torque uses that gear rather than the first-gear envelope', () => {
  const race = makeRace('avante_n', 'avante-n-2.0t-mt', 50), car = race.cars[0], oldSpeed = car.speed;
  car.torqueNm = 20; car.powerPs = 1000;
  const predicted = Dynamics.preview(car, oldSpeed), gear = car.transmission.gear;
  assert.ok(gear > 1);
  const resistance = .5 * 1.225 * car.dragArea * oldSpeed ** 2 + car.rollingCoefficient * car.massKg * 9.81;
  const force = car.torqueNm * predicted.totalRatio * car.efficiency / predicted.effectiveRadiusM;
  race.step(DT);
  assert.equal(car.transmission.gear, gear);
  close(car.acceleration, (force - resistance) / car.massKg, 1e-9);
  assert.ok(force < car.torqueNm * car.driveReduction * car.efficiency / predicted.effectiveRadiusM / 2);
});

test('a fractional AT completion tick respects traction separately before and after clutch engagement', () => {
  const race = makeRace('supra', 'supra-3.0t-rz'), car = race.cars[0], state = car.transmission;
  for (let i = 0; i < 2400 && !(state.shifting && state.remainingSeconds < DT); i++) race.step(DT);
  assert.ok(state.shifting && state.remainingSeconds > 0 && state.remainingSeconds < DT);
  const oldSpeed = car.speed, resistance = .5 * 1.225 * car.dragArea * oldSpeed ** 2 + car.rollingCoefficient * car.massKg * 9.81;
  const traction = race._tractionAcceleration(car, oldSpeed, 0, resistance / car.massKg) * car.massKg;
  const gearing = Dynamics.describeGearing(car), nextRatio = gearing.totalRatios[state.toGear - 1];
  // Set full engine delivery to 120% of tyre capacity. At 80% retention the
  // clutch portion is below that capacity, while the engaged portion is above.
  car.torqueNm = traction * 1.2 * gearing.effectiveRadiusM / (nextRatio * car.efficiency);
  car.powerPs = 2000;
  const activeFraction = state.remainingSeconds / DT;
  assert.ok(activeFraction > .19 && activeFraction < .21, 'ZF .16 s ends 20% into this tick');
  race.step(DT);
  const actualDrive = car.massKg * car.acceleration + resistance;
  assert.ok(actualDrive > traction * .99 && actualDrive < traction * .995,
    'roughly 9.92 kN per 10 kN capacity; averaging before traction would incorrectly give 10 kN');
  assert.equal(state.shifting, false); assert.equal(state.torqueFactor, 1);
  close(state.appliedTorqueFactor, .96, 1e-10);
});

test('physical shift state and trajectories are identical for large and fractional playback batches', () => {
  const a = makeRace('avante_n', 'avante-n-2.0t-mt'), b = makeRace('avante_n', 'avante-n-2.0t-mt');
  a.step(12);
  for (let i = 0; i < 1440; i++) b.step(DT / 3), b.step(DT * 2 / 3);
  assert.equal(a.time, b.time);
  assert.deepEqual(a.cars[0].transmission, b.cars[0].transmission);
  assert.deepEqual([a.cars[0].speed, a.cars[0].distance], [b.cars[0].speed, b.cars[0].distance]);
  const snapshot = JSON.stringify(a.cars[0].transmission); a.step(0);
  assert.equal(JSON.stringify(a.cars[0].transmission), snapshot);
});
