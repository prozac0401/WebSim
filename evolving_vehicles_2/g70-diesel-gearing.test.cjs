'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Dynamics = require('./powertrain-dynamics.js'), Telemetry = require('./powertrain-telemetry.js');
const Profiles = require('./powertrain-profiles.js'), Evolution = require('./tuning-evolution.js');
const Race = require('./race-engine.js'), circuits = require('./circuits.js');

// Independent reference fixtures: the UK G70 2.2D RWD total reductions are
// published to three decimal places. Applying this overseas data to the Korean
// presets is a reference assumption, not verification of a domestic TCU map.
const SOURCE_TOTALS = [13.418, 8.354, 5.449, 3.980, 3.385, 2.816, 2.207, 1.912];
const RATIOS = [3.964, 2.468, 1.610, 1.176, 1, .832, .652, .565], FINAL_DRIVE = 3.385;
const NOMINAL_RADIUS = 17 * 25.4 / 2000 + 225 * .50 / 1000;
const RADIUS = NOMINAL_RADIUS * .985; // Loaded-radius correction remains an estimate.
const IDLE = 800, SHIFT = 4200, DT = Race.FIXED_DT;
const VARIANTS = ['g70-2.2d-rwd', 'g70-2.2d-awd'];
const population = Evolution.createPopulation({ vehicleId: 'g70', count: 8, seed: 31415, budget: 30 });
const tuned = id => population.find(e => e.variantId === id);
const stock = id => Evolution.createEntrant({ vehicleId: 'g70', variantId: id, uid: id + '-stock', budget: 0 });
const scaleOf = e => e.spec.reduction / e.factorySpec.reduction;
const rpmAt = (kph, gear, scale = 1) => kph / 3.6 * 60 / (2 * Math.PI * RADIUS) * RATIOS[gear - 1] * FINAL_DRIVE * scale;
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} != ${expected} (tolerance ${tolerance})`);
function carFor(entrant, kph = 0) {
  const car = { vehicleId: 'g70', entrant, spec: entrant.spec, speed: kph / 3.6 };
  car.transmission = Dynamics.create(car); car.telemetry = Telemetry.create(car);
  return car;
}
function checkSnapshot(car) {
  const s = car.transmission, hud = car.telemetry;
  assert.equal(car.dnf, false);
  if (car.finished) { assert.equal(hud.gear, null); assert.equal(hud.shiftLights, 0); return; }
  const fraction = s.shifting ? 1 - s.remainingSeconds / s.durationSeconds : 1;
  const ratio = s.shifting ? RATIOS[s.fromGear - 1] * (1 - fraction) + RATIOS[s.toGear - 1] * fraction : RATIOS[s.gear - 1];
  const expectedRPM = Math.max(IDLE, car.speed * 60 / (2 * Math.PI * RADIUS) * ratio * FINAL_DRIVE * scaleOf(car.entrant));
  close(s.totalRatio, ratio * FINAL_DRIVE * scaleOf(car.entrant)); close(s.rpm, expectedRPM);
  assert.equal(hud.gearSource, 'physics'); assert.equal(hud.gear, s.gear);
  assert.equal(hud.gearLabel, String(s.gear)); assert.equal(hud.shifting, s.shifting); assert.equal(hud.neutral, false);
  const normalized = Math.max(0, Math.min(1, (expectedRPM - IDLE) / (SHIFT - IDLE)));
  close(hud.rpmNormalized, normalized); assert.equal(hud.shiftLights, Math.ceil(normalized * 8));
}

test('G70 diesel uses reference ratios rather than the old geometric progression, retaining separate idle and shift estimates', () => {
  for (const id of VARIANTS) {
    const car = carFor(stock(id)), p = Profiles.resolve(car), gearing = Dynamics.describeGearing(car);
    assert.deepEqual(p.gearRatios, RATIOS); assert.equal(p.finalDriveRatio, FINAL_DRIVE);
    assert.equal(p.ratioStatus, 'reference-market'); assert.ok(p.ratioSourceId && Profiles.SOURCES[p.ratioSourceId]);
    assert.equal(p.ratioMarket, 'EU (DE/UK)');
    assert.equal(p.ratioSourceId, 'genesis-g70-diesel-de-2024-ratios');
    assert.equal(p.finalDriveSourceId, 'genesis-g70-diesel-uk-2021-overall');
    assert.ok(Profiles.SOURCES[p.finalDriveSourceId]); assert.ok(p.referenceFields.includes('gearRatios'));
    if (id.endsWith('-awd')) {
      assert.equal(p.finalDriveStatus, 'estimated-rwd-reference');
      assert.ok(!p.referenceFields.includes('finalDriveRatio'));
      for (const field of ['finalDriveRatio', 'awdFinalDriveMatch']) assert.ok(p.estimatedFields.includes(field));
    } else {
      assert.equal(p.finalDriveStatus, 'derived-reference-market');
      assert.ok(p.referenceFields.includes('finalDriveRatio'));
    }
    assert.equal(p.ratioStep, null); assert.equal(p.drivenAxle, 'rear');
    assert.ok(!p.verifiedFields.includes('gearRatios'), 'do not promote an overseas reference to domestic verification');
    assert.deepEqual([p.idleRPM, p.shiftRPM, p.maxRPM, p.ratedPowerRPM], [800, 4200, 4800, 3800]);
    assert.equal(p.idleModel.status, 'estimated');
    close(gearing.nominalRadiusM, NOMINAL_RADIUS); close(gearing.effectiveRadiusM, RADIUS);
    gearing.totalRatios.forEach((ratio, i) => {
      close(ratio, SOURCE_TOTALS[i], .001);
      close(ratio, RATIOS[i] * FINAL_DRIVE);
    });
  }
});

test('default diesel tuning applies its gearing scale once, and fixed eighth at 100 km/h stays below 2000 RPM', () => {
  const first = tuned(VARIANTS[0]);
  assert.equal(first.uid, 'g70-31415-g1-1');
  assert.deepEqual(first.levels, { acceleration: 4, topSpeed: 3, brakes: 3, grip: 2 });
  close(scaleOf(first), 15.114 / 13.5);
  for (const id of VARIANTS) for (const e of [stock(id), tuned(id)]) {
    const scale = scaleOf(e), car = carFor(e), gearing = Dynamics.describeGearing(car);
    const expectedReduction = e.budget === 0 ? 13.5 : Math.round(13.5 * (1 + .045 * e.levels.acceleration) / (1 + .018 * e.levels.topSpeed) * 1000) / 1000;
    close(e.spec.reduction, expectedReduction); close(gearing.tunedFinalDriveScale, expectedReduction / 13.5);
    gearing.totalRatios.forEach((ratio, i) => close(ratio, RATIOS[i] * FINAL_DRIVE * scale));
    // An engaged-gear calculation is intentionally separate from the racing
    // WOT scheduler. This does not force eighth gear at 100 km/h in a race.
    for (const [kph, gear] of [[80, 5], [100, 8]]) {
      car.speed = kph / 3.6; car.transmission.gear = gear; Dynamics.updateRPM(car);
      car.telemetry = Telemetry.create(car);
      close(car.transmission.rpm, rpmAt(kph, gear, scale));
      assert.equal(car.telemetry.gear, gear); assert.equal(car.telemetry.gearLabel, String(gear));
      if (gear === 8) assert.ok(car.transmission.rpm < 2000, e.uid + ': fixed eighth at 100 km/h');
      if (gear === 5) assert.ok(car.transmission.rpm < 2500, e.uid + ': the old 3610-RPM fifth-gear reproduction is gone');
    }
  }
  close(rpmAt(80, 5), 2220.6400199750856);
  close(rpmAt(100, 8), 1568.3270141074042);
  close(rpmAt(100, 8, scaleOf(first)), 1755.8292215718009);
});

test('actual G70 diesel AT handover keeps motion and time continuous while HUD reads the physical intermediate ratio', () => {
  const straight = { id: 'g70-diesel-shift-validation', lengthM: 4800,
    coordinates: [[1000, 0], [2000, 0], [2000, 400], [0, 400], [0, 0], [1000, 0]]
      .map(([x, y]) => [127 + x / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + y / 111195.08]) };
  for (const id of VARIANTS) {
    const race = new Race({ circuit: straight, entrants: [stock(id)], racingLine: false, laps: 1 }), car = race.cars[0];
    race._target = () => 170 / 3.6; // Only the driver's target is controlled.
    for (let i = 0; i < 45 / DT && !(car.transmission.shifting && car.transmission.fromGear === 4); i++) race.step(DT);
    const state = car.transmission;
    assert.equal(state.shifting, true); assert.equal(state.fromGear, 4); assert.equal(state.toGear, 5);
    checkSnapshot(car);
    const before = { speed: car.speed, distance: car.distance, time: race.time, rpm: state.rpm };
    race.step(DT); checkSnapshot(car);
    close(race.time - before.time, DT); close(car.distance - before.distance, (before.speed + car.speed) * .5 * DT);
    assert.ok(car.speed > before.speed && state.rpm < before.rpm, 'clutch handover lowers RPM while the car keeps accelerating');
    assert.equal(state.gear, 4); assert.equal(car.telemetry.gearLabel, '4'); assert.equal(state.neutral, false);
    let ticks = 0;
    while (state.shifting && ticks++ < 60) { race.step(DT); checkSnapshot(car); }
    assert.equal(state.shifting, false); assert.equal(state.gear, 5); assert.equal(car.telemetry.gearLabel, '5');
    assert.ok(car.distance > before.distance && race.time > before.time);
  }
});

for (const circuitId of ['inje', 'taebaek']) test(`G70 diesel stock and default-tuned RWD/AWD finish ${circuitId} with consistent physical RPM and HUD`, () => {
  const entrants = VARIANTS.flatMap(id => [stock(id), tuned(id)]);
  const race = new Race({ circuit: circuits.find(c => c.id === circuitId), entrants, laps: 1 });
  const near80 = entrants.map(() => 0), near100 = entrants.map(() => 0), shifting = entrants.map(() => 0);
  for (let tick = 0; tick < 300 / DT && !race.finished; tick++) {
    race.step(DT);
    race.cars.forEach((car, i) => {
      checkSnapshot(car);
      if (!car.finished && Math.abs(car.speed * 3.6 - 80) < .5) near80[i]++;
      if (!car.finished && Math.abs(car.speed * 3.6 - 100) < .5) near100[i]++;
      if (car.transmission.shifting) shifting[i]++;
    });
  }
  assert.equal(race.finished, true);
  for (const [i, car] of race.cars.entries()) {
    assert.equal(car.finished, true); assert.equal(car.dnf, false);
    assert.ok(car.maxSpeed > 100 / 3.6 && car.finishTime > 0);
    assert.ok(near80[i] > 3 && near100[i] > 3, car.uid + ': speed-specific checks actually ran');
    assert.ok(shifting[i] > 10 && car.transmission.upshiftCount > 1 && car.transmission.downshiftCount > 0);
    close(car.driveReduction, RATIOS[0] * FINAL_DRIVE * scaleOf(car.entrant));
  }
});
