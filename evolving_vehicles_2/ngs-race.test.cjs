'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Race = require('./race-engine.js'), NGS = require('./n-grin-shift.js');
const Evolution = require('./tuning-evolution.js'), Continuous = require('./continuous-race.js');
const circuits = require('./circuits.js'), DT = Race.FIXED_DT;
const entry = (variant = 'avante-n-2.0t-dct') => Evolution.createEntrant({
  vehicleId: 'avante_n', variantId: variant, budget: 0, uid: variant
});
const options = (id, variants = ['avante-n-2.0t-dct'], laps = 1) => ({
  circuit: circuits.find(c => c.id === id), entrants: variants.map(entry), laps
});
const wrap = (s, length) => ((s % length) + length) % length;
const inZone = (zones, s, length) => zones.some(z => wrap(s - z.startS, length) < z.lengthM);
const run = race => { while (!race.finished && race.time < 1000) race.step(30); assert.equal(race.finished, true); return race; };

test('real DCT laps apply NGS only in canonical DRS zones and never to the manual car', () => {
  for (const id of ['monza', 'spa', 'silverstone']) {
    const race = new Race(options(id, ['avante-n-2.0t-dct', 'avante-n-2.0t-mt'], 2));
    const [car, manual] = race.cars, zones = NGS.getZones(race.track);
    const stockPower = car.powerPs, stockTorque = car.torqueNm;
    let appliedTicks = 0, lastEnd = -Infinity, wasActive = false, started = 0;
    while (!race.finished && race.time < 650) {
      const before = race.sampleForCar(car, car.distance), previousTime = race.time;
      race.step(DT);
      if (car.activePowerPs > stockPower + 1e-10) {
        appliedTicks++;
        assert.ok(inZone(zones, before.centerS, race.track.centerlineLength), id + ': boost stayed within mapped zone');
        assert.ok(car.activePowerPs <= stockPower * NGS.MODEL.powerMultiplier + 1e-9);
      }
      if (car.ngs.active && !wasActive) {
        assert.ok(previousTime - lastEnd >= NGS.MODEL.cooldownSeconds - 2 * DT);
        started++;
      }
      if (!car.ngs.active && wasActive) lastEnd = race.time;
      wasActive = car.ngs.active;
      assert.ok(car.ngs.activeSeconds <= 10 + 1e-8);
      assert.equal(car.powerPs, stockPower); assert.equal(car.torqueNm, stockTorque);
      assert.equal(manual.ngs.active, false); assert.equal(manual.ngs.activationCount, 0);
      assert.equal(manual.activePowerPs, manual.powerPs);
    }
    assert.equal(race.finished, true, id);
    assert.ok(started >= 3 && appliedTicks > 1000, id + ': natural driving exercised repeated boosts');
    assert.equal(car.ngs.active, false); assert.equal(car.ngs.appliedPowerMultiplier, 1);
    assert.equal(car.activePowerPs, stockPower);
  }
});

test('the power boost improves actual acceleration and lap time with the same permitted speed envelope', () => {
  // Disable only the applied boost, keeping identical NGS timing, route,
  // speed limits, shifts, mass and grip. This tests the real force integrator.
  const sandbox = { module: { exports: {} }, require, NGrinShift: {
    ...NGS, update(car, state, dt, input) { NGS.update(car, state, dt, input); state.appliedPowerMultiplier = 1; return state; }
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./race-engine.js'), 'utf8'), sandbox);
  const NoAppliedBoostRace = sandbox.module.exports;
  const boosted = new Race(options('monza')), control = new NoAppliedBoostRace(options('monza'));
  assert.deepEqual(boosted.cars[0].speedProfile, Array.from(control.cars[0].speedProfile));
  run(boosted); run(control);
  assert.ok(boosted.cars[0].finishTime < control.cars[0].finishTime - .05,
    `${boosted.cars[0].finishTime} must improve on ${control.cars[0].finishTime}`);
  for (const key of ['powerPs', 'torqueNm', 'massKg', 'grip', 'braking', 'driveReduction'])
    assert.equal(boosted.cars[0][key], control.cars[0][key], key);
});

test('all domestic layouts and every non-N vehicle stay unsupported', () => {
  for (const circuit of circuits.filter(c => !['monza', 'spa', 'silverstone'].includes(c.id))) {
    const race = new Race({ ...options('monza'), circuit });
    race.step(30);
    assert.equal(race.cars[0].ngs.supported, false, circuit.id);
    assert.equal(race.cars[0].ngs.activationCount, 0);
    assert.equal(race.cars[0].activePowerPs, race.cars[0].powerPs);
  }
  for (const vehicle of Race.VEHICLES.filter(v => v.id !== 'avante_n')) {
    const race = new Race({ circuit: circuits.find(c => c.id === 'monza'), vehicleIds: [vehicle.id], laps: 1 });
    race.step(2);
    assert.equal(race.cars[0].ngs.supported, false, vehicle.id);
  }
});

test('NGS timers, power, telemetry and physics are identical across playback chunks and pause', () => {
  const races = [new Race(options('silverstone')), new Race(options('silverstone'))];
  const chunked = (race, chunks) => {
    let left = 120, i = 0;
    while (left > 1e-10) { const dt = Math.min(left, chunks[i++ % chunks.length]); race.step(dt); left -= dt; }
  };
  chunked(races[0], [1 / 60]); chunked(races[1], [.15, 1.2, .007, 2.4]);
  const snapshot = r => ({ time: r.time, distance: r.cars[0].distance, speed: r.cars[0].speed,
    power: r.cars[0].activePowerPs, transmission: r.cars[0].transmission, ngs: r.cars[0].ngs, telemetry: r.cars[0].telemetry });
  assert.deepEqual(snapshot(races[0]), snapshot(races[1]));
  const frozen = JSON.stringify(snapshot(races[0]));
  races[0].step(0); assert.equal(JSON.stringify(snapshot(races[0])), frozen);
});

test('automatic standing-start measurements reset NGS and match independent evaluation', () => {
  const session = new Continuous({ ...options('monza'), seed: 123, generation: 1 });
  let transitions = [];
  while (!transitions.length && session.race.time < 200) transitions = session.step(DT, { watchId: 0, auto: true });
  assert.equal(transitions.length, 1);
  const previous = transitions[0].previousRace.cars[0], current = session.race.cars[0];
  assert.ok(previous.ngs.activationCount >= 2); assert.equal(previous.ngs.active, false);
  assert.equal(current.ngs.activationCount, 0); assert.equal(current.ngs.cooldownSeconds, 0);
  assert.equal(current.ngs.active, false); assert.ok(current.speed < .1);
  assert.equal(transitions[0].results[0].finishTime, previous.finishTime);
});
