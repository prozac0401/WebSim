'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Dynamics = require('./powertrain-dynamics.js'), Telemetry = require('./powertrain-telemetry.js');
const Profiles = require('./powertrain-profiles.js'), Evolution = require('./tuning-evolution.js');
const Race = require('./race-engine.js'), circuits = require('./circuits.js');

// Independent 2019 Genesis US 3.3T reference values, not generated from the
// production profile. Korean factory-spec identity remains a separate source.
// https://www.prnewswire.com/news-releases/2019-genesis-g70-equipped-to-compete-300679294.html
const RATIOS = [3.665, 2.396, 1.610, 1.190, 1, .826, .643, .556], FINAL_DRIVE = 3.538;
const NOMINAL_RADIUS = 19 * 25.4 / 2000 + 255 * .35 / 1000;
// Loaded radius, idle and WOT shift point are documented simulation assumptions.
const RADIUS = NOMINAL_RADIUS * .985, IDLE_RPM = 900, SHIFT_RPM = 6500, DT = Race.FIXED_DT;
const VARIANTS = ['g70-3.3t-rwd', 'g70-3.3t-awd'];
const straight = { id: 'g70-gearing-validation', lengthM: 4800,
  coordinates: [[1000, 0], [2000, 0], [2000, 400], [0, 400], [0, 0], [1000, 0]]
    .map(([x, y]) => [127 + x / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + y / 111195.08]) };
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} != ${expected} (tolerance ${tolerance})`);
const rpmAt = (speed, gear, scale = 1) => speed * 60 / (2 * Math.PI * RADIUS) * RATIOS[gear - 1] * FINAL_DRIVE * scale;
function entrant(variantId, tuned = false) {
  return Evolution.createEntrant({ vehicleId: 'g70', variantId, budget: tuned ? 30 : 0,
    uid: variantId + (tuned ? '-short-gearing' : '-stock'),
    levels: { acceleration: tuned ? 3 : 0, topSpeed: 0, brakes: 0, grip: 0 } });
}
function scaleOf(car) { return car.entrant.spec.reduction / car.entrant.factorySpec.reduction; }
function checkSnapshot(car) {
  const s = car.transmission, hud = car.telemetry, scale = scaleOf(car);
  assert.ok(!car.dnf);
  if (car.finished) { assert.equal(hud.gear, null); assert.equal(hud.shiftLights, 0); return; }
  const fraction = s.shifting ? 1 - s.remainingSeconds / s.durationSeconds : 1;
  const ratio = s.shifting ? RATIOS[s.fromGear - 1] * (1 - fraction) + RATIOS[s.toGear - 1] * fraction : RATIOS[s.gear - 1];
  const expectedRPM = Math.max(IDLE_RPM, car.speed * 60 / (2 * Math.PI * RADIUS) * ratio * FINAL_DRIVE * scale);
  close(s.rpm, expectedRPM); close(s.totalRatio, ratio * FINAL_DRIVE * scale);
  assert.equal(hud.gearSource, 'physics'); assert.equal(hud.gear, s.gear);
  assert.equal(hud.gearLabel, String(s.gear)); assert.equal(hud.shifting, s.shifting);
  assert.equal(hud.neutral, false);
  const normalized = Math.max(0, Math.min(1, (expectedRPM - IDLE_RPM) / (SHIFT_RPM - IDLE_RPM)));
  close(hud.rpmNormalized, normalized); assert.equal(hud.shiftLights, Math.ceil(normalized * 8));
  if (Math.abs(car.speed * 3.6 - 100) < .5) {
    assert.ok(!(hud.gear === 6 && hud.shiftLights >= 7), `${car.uid}: sixth/high LEDs at 100 km/h`);
  }
}

test('G70 3.3T RWD/AWD use the reference eight ratios and rear tyre; tuning scales final drive exactly once', () => {
  for (const variantId of VARIANTS) for (const tuned of [false, true]) {
    assert.equal(Evolution.getRules('g70', variantId, { budget: 30 }).maxLevels.acceleration, 3);
    const e = entrant(variantId, tuned), car = { vehicleId: 'g70', entrant: e, spec: e.spec, speed: 100 / 3.6 };
    car.transmission = Dynamics.create(car); car.telemetry = Telemetry.create(car);
    const p = Profiles.resolve(car), gearing = Dynamics.describeGearing(car), scale = scaleOf(car);
    assert.deepEqual(p.gearRatios, RATIOS); assert.equal(p.finalDriveRatio, FINAL_DRIVE);
    assert.equal(p.ratioStatus, 'reference-market'); assert.equal(p.drivenAxle, 'rear');
    close(gearing.nominalRadiusM, NOMINAL_RADIUS); close(gearing.effectiveRadiusM, RADIUS);
    close(scale, tuned ? 15.323 / 13.5 : 1);
    gearing.totalRatios.forEach((ratio, index) => close(ratio, RATIOS[index] * FINAL_DRIVE * scale));
    assert.equal(car.transmission.gear, 3, 'the simulator WOT schedule selects third at 100 km/h');
    close(car.transmission.rpm, tuned ? 5267.314221493896 : 4640.6540488264445);
    checkSnapshot(car);
    // Sixth can be a cruising gear in a real automatic. Its wheel-linked RPM
    // must remain low; this is not a claim that the WOT scheduler selects it.
    car.transmission.gear = 6; Dynamics.updateRPM(car);
    car.telemetry = Telemetry.create(car);
    close(car.transmission.rpm, tuned ? 2702.361209288173 : 2380.857294615306);
    assert.equal(car.telemetry.shiftLights, 3); checkSnapshot(car);
  }
});

test('G70 3.3T natural acceleration shifts in order and returns to third at 100 km/h after braking', () => {
  const race = new Race({ circuit: straight, entrants: VARIANTS.map(id => entrant(id)), racingLine: false, laps: 1 });
  let target = 200 / 3.6;
  // Replace only the driver's target on this flat fixture; speed, torque,
  // resistance, shift durations and telemetry still advance through real ticks.
  race._target = () => target;
  const completed = race.cars.map(() => [1]), crossed100 = race.cars.map(() => false);
  function tick() {
    const before = race.cars.map(car => ({ gear: car.transmission.gear, shifting: car.transmission.shifting, speed: car.speed }));
    race.step(DT);
    race.cars.forEach((car, i) => {
      checkSnapshot(car);
      const state = car.transmission;
      if (!before[i].shifting && state.shifting) {
        const startRPM = rpmAt(before[i].speed, state.fromGear);
        assert.ok(startRPM >= SHIFT_RPM && startRPM < SHIFT_RPM + 20, 'shift starts at the assumed WOT threshold');
        assert.equal(state.toGear, state.fromGear + 1);
      }
      if (state.gear !== before[i].gear) completed[i].push(state.gear);
      if (target > 50 && !crossed100[i] && car.speed >= 100 / 3.6) {
        crossed100[i] = true; assert.equal(car.transmission.gear, 3);
      }
    });
  }
  function reach(condition, seconds) {
    for (let i = 0; i < seconds / DT && !condition(); i++) tick();
    assert.ok(condition(), `failed to reach target ${target * 3.6} km/h`);
  }
  reach(() => race.cars.every(car => car.speed >= target - 1e-9), 45);
  assert.deepEqual(crossed100, [true, true]);
  for (const gears of completed) assert.deepEqual(gears, [1, 2, 3, 4, 5]);
  target = 80 / 3.6;
  reach(() => race.cars.every(car => car.speed <= target + 1e-9), 15);
  target = 100 / 3.6;
  reach(() => race.cars.every(car => car.speed >= target - 1e-9), 15);
  for (const car of race.cars) {
    assert.equal(car.transmission.gear, 3); assert.ok(car.transmission.downshiftCount >= 2);
    close(car.transmission.rpm, 4640.6540488264445); assert.equal(car.telemetry.shiftLights, 6);
    assert.ok(car.distance > 0 && !car.finished);
  }
});

test('stock and shortest-tuned G70 3.3T complete Taebaek with wheel-linked physical RPM and identical HUD gears', () => {
  const race = new Race({ circuit: circuits.find(c => c.id === 'taebaek'),
    entrants: VARIANTS.flatMap(id => [entrant(id), entrant(id, true)]), laps: 1 });
  const near100 = race.cars.map(() => 0), shifting = race.cars.map(() => 0);
  for (let tick = 0; tick < 240 / DT && !race.finished; tick++) {
    race.step(DT);
    race.cars.forEach((car, i) => {
      checkSnapshot(car);
      if (!car.finished && Math.abs(car.speed * 3.6 - 100) < .5) near100[i]++;
      if (car.transmission.shifting) shifting[i]++;
    });
  }
  assert.equal(race.finished, true);
  for (const [i, car] of race.cars.entries()) {
    assert.equal(car.finished, true); assert.equal(car.dnf, false);
    assert.ok(car.maxSpeed > 100 / 3.6 && car.finishTime > 0);
    assert.ok(near100[i] > 10, `${car.uid}: near-100 check must actually run`);
    assert.ok(shifting[i] > 10 && car.transmission.upshiftCount > 1 && car.transmission.downshiftCount > 0);
  }
});
