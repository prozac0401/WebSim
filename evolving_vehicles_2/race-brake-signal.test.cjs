'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Race = require('./race-engine.js'), Evolution = require('./tuning-evolution.js');
const circuits = require('./circuits.js');
const DT = Race.FIXED_DT, G = 9.81;
const straight = { id: 'brake-signal-validation', lengthM: 4800,
  coordinates: [[1000, 0], [2000, 0], [2000, 400], [0, 400], [0, 0], [1000, 0]]
    .map(([x, y]) => [127 + x / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + y / 111195.08]) };
const make = (options = {}) => new Race({ circuit: straight, vehicleIds: ['g70'], initialSpeed: 20, laps: 1, ...options });
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function resistance(car, speed, grade) {
  const normal = 1 / Math.hypot(1, grade);
  return .5 * 1.225 * car.dragArea * speed * speed + car.massKg * G * normal * (car.rollingCoefficient + grade);
}
function gradeFixture(race, grade) {
  // Control only the road grade, retaining the real wheel-force solver.
  const sample = race.sampleForCar.bind(race);
  race.sampleForCar = (car, distance) => ({ ...sample(car, distance), grade });
}
function assertOff(car) {
  near(car.serviceBrakeForceN, 0); near(car.brakeDemand, 0);
  assert.equal(car.brakeLightState.on, false); assert.equal(car.brakeLightState.intensity, 0);
}

test('all registered models, including EVs, start dark and expose applied braking independently of the HUD', () => {
  const race = make({ vehicleIds: Race.VEHICLES.map(v => v.id) });
  for (const car of race.cars) assertOff(car);
  race._target = () => 0;
  race.step(DT);
  for (const car of race.cars) {
    const capacity = race._brakingCapacity(car, 20, 0) * car.massKg;
    near(car.serviceBrakeForceN, capacity);
    near(car.brakeDemand, 1);
    assert.equal(car.brakeLightState.on, true, car.vehicleId);
    assert.ok(car.brakeLightState.intensity > 0, car.vehicleId);
    near(car.massKg * car.acceleration, -capacity - resistance(car, 20, 0));
  }
  const context = { module: { exports: {} }, require: id => id === './powertrain-telemetry.js'
    ? null : require(path.resolve(__dirname, id)) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'race-engine.js'), 'utf8'), context);
  const headless = new context.module.exports({ circuit: straight, vehicleIds: ['ioniq5', 'g70'], initialSpeed: 20, laps: 1 });
  headless._target = () => 0; headless.step(DT);
  for (const car of headless.cars) {
    assert.equal(car.telemetry, undefined);
    const observed = race.cars.find(c => c.vehicleId === car.vehicleId);
    near(car.speed, observed.speed); near(car.serviceBrakeForceN, observed.serviceBrakeForceN);
    near(car.brakeLightState.intensity, observed.brakeLightState.intensity);
  }
});

test('uphill slowing and downhill coasting do not apply brakes, even when the old phase label says braking', () => {
  for (const grade of [.15, -.15]) {
    const race = make(), car = race.cars[0];
    gradeFixture(race, grade);
    // A coasting vehicle has no drive torque; the existing solver still
    // integrates drag, rolling resistance and gravity rather than freezing it.
    car.powerPs = car.torqueNm = 0; race._target = () => 100;
    const expected = -resistance(car, car.speed, grade) / car.massKg;
    race.step(DT);
    near(car.acceleration, expected); assertOff(car);
    if (grade > 0) { assert.ok(car.acceleration < -.2); assert.equal(car.phase, 'braking'); }
    else assert.ok(car.acceleration > 0);
  }
});

test('downhill service braking lights the lamps even while gravity still increases vehicle speed', () => {
  const race = make(), car = race.cars[0], grade = -.15, speed = car.speed;
  gradeFixture(race, grade); race._target = () => speed + .2 * DT;
  race.step(DT);
  near(car.acceleration, .2); assert.ok(car.speed > speed);
  const expected = -(.2 * car.massKg + resistance(car, speed, grade));
  assert.ok(expected > car.massKg * .1);
  near(car.serviceBrakeForceN, expected);
  near(car.brakeDemand, expected / (race._brakingCapacity(car, speed, grade) * car.massKg));
  assert.equal(car.brakeLightState.on, true);
});

test('a real manual upshift loses speed to resistance without producing a brake command or lamp flash', () => {
  const entrant = Evolution.createEntrant({ vehicleId: 'avante_n', variantId: 'avante-n-2.0t-mt', budget: 0 });
  const race = make({ vehicleIds: undefined, entrants: [entrant], initialSpeed: 0, racingLine: false }), car = race.cars[0];
  for (let i = 0; i < 2000 && !car.transmission.shifting; i++) { race.step(DT); assertOff(car); }
  assert.equal(car.transmission.neutral, true);
  const speed = car.speed, force = resistance(car, speed, 0);
  race.step(DT);
  assert.ok(car.speed < speed); near(car.acceleration, -force / car.massKg);
  assertOff(car);
});

test('real dry and wet laps expose both corner-entry braking and partial braking while turning', () => {
  for (const circuitId of ['inje', 'taebaek']) for (const surface of ['dry', 'wet']) {
    const entrant = Evolution.createEntrant({ vehicleId: 'supra', variantId: 'supra-3.0t-rz', budget: 0 });
    const race = new Race({ circuit: circuits.find(c => c.id === circuitId), entrants: [entrant], surface, laps: 1 });
    const car = race.cars[0]; let entry = 0, trail = 0;
    for (let tick = 0; tick < 60000 && !race.finished; tick++) {
      const speed = car.speed, p = race.sampleForCar(car, car.distance);
      const resist = resistance(car, speed, p.grade), capacity = race._brakingCapacity(car, speed, p.grade, p.curvature) * car.massKg;
      race.step(DT);
      if (car.finished || car.dnf) continue;
      near(car.serviceBrakeForceN, Math.max(0, -(car.massKg * car.acceleration + resist)));
      near(car.brakeDemand, Math.min(1, car.serviceBrakeForceN / capacity));
      assert.ok(car.brakeDemand >= 0 && car.brakeDemand <= 1);
      if (car.serviceBrakeForceN > car.massKg * .1) {
        assert.equal(car.brakeLightState.on, true);
        if (Math.abs(p.curvature) < .003) entry++;
        if (Math.abs(p.curvature) > .003 && car.brakeDemand < .9) trail++;
      }
    }
    assert.equal(car.finished, true, `${circuitId}/${surface}`);
    assert.ok(entry > 0, `${circuitId}/${surface}: corner-entry braking`);
    assert.ok(trail > 0, `${circuitId}/${surface}: partial braking with curvature`);
    assertOff(car);
  }
});

test('physics-tick lamp state survives short brake gaps, pauses exactly and is independent of render batching', () => {
  const a = make(), b = make();
  for (const race of [a, b]) race._target = () => race.time < .1 ? 0 : 100;
  a.step(.1);
  for (let i = 0; i < 12; i++) b.step(DT);
  const paused = JSON.stringify(a.cars[0]); a.step(0);
  assert.equal(JSON.stringify(a.cars[0]), paused);
  a.step(.08); for (let i = 0; i < 8; i++) b.step(.01);
  near(a.cars[0].serviceBrakeForceN, 0);
  assert.equal(a.cars[0].brakeLightState.on, true, 'brief command gap stays lit');
  a.step(1); for (let i = 0; i < 60; i++) b.step(1 / 60);
  assertOff(a.cars[0]); assertOff(b.cars[0]);
  assert.deepEqual(a.cars[0], b.cars[0]);
});

test('finish and retirement clear an active brake signal immediately rather than leaving a held lamp behind', () => {
  const finish = make(), fc = finish.cars[0];
  finish._target = () => 0; finish.step(DT);
  assert.equal(fc.brakeLightState.on, true);
  fc.distance = fc.totalDistance - .01; finish.step(DT);
  assert.equal(fc.finished, true); assertOff(fc);
  const stopped = make(), sc = stopped.cars[0];
  stopped._target = () => 0; stopped.step(DT);
  assert.equal(sc.brakeLightState.on, true);
  sc.speed = .05; sc.stalledFor = 30 - DT; stopped.step(DT);
  assert.equal(sc.dnf, true); assertOff(sc);
});
