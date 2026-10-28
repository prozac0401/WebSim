'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Evolution = require('./tuning-evolution.js'), Profiles = require('./powertrain-profiles.js');
const Dynamics = require('./powertrain-dynamics.js'), Telemetry = require('./powertrain-telemetry.js');
const Race = require('./race-engine.js'), circuits = require('./circuits.js');

// Independent KA4 diesel Israeli reference-table values. Their use on the
// Korean facelift preset does not verify a Korean factory shift-control map.
const RATIOS = [4.808, 2.901, 1.864, 1.424, 1.219, 1, .799, .648], FINAL_DRIVE = 3.510;
const NOMINAL_RADIUS = (235 * .60 + 18 * 12.7) / 1000;
const RADIUS = NOMINAL_RADIUS * .985; // Estimated loaded-radius correction.
const IDLE = 700, SHIFT = 4200, DT = Race.FIXED_DT;
const stock = Evolution.createEntrant({ vehicleId: 'carnival', variantId: 'carnival-2.2d', budget: 0, uid: 'carnival-diesel-stock' });
const defaults = Evolution.createPopulation({ vehicleId: 'carnival', count: 8, seed: 31415, budget: 30 })
  .filter(e => e.variantId === 'carnival-2.2d');
const scaleOf = e => e.spec.reduction / e.factorySpec.reduction;
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} != ${expected} (tolerance ${tolerance})`);
function carFor(entrant) {
  const car = { vehicleId: 'carnival', entrant, spec: entrant.spec, speed: 0 };
  car.transmission = Dynamics.create(car); car.telemetry = Telemetry.create(car); return car;
}
function checkSnapshot(car) {
  const state = car.transmission, hud = car.telemetry;
  assert.equal(car.dnf, false);
  if (car.finished) { assert.equal(hud.gear, null); assert.equal(hud.shiftLights, 0); return; }
  const fraction = state.shifting ? 1 - state.remainingSeconds / state.durationSeconds : 1;
  const ratio = state.shifting ? RATIOS[state.fromGear - 1] * (1 - fraction) + RATIOS[state.toGear - 1] * fraction : RATIOS[state.gear - 1];
  const total = ratio * FINAL_DRIVE * scaleOf(car.entrant);
  const expectedRPM = Math.max(IDLE, car.speed * 60 / (2 * Math.PI * RADIUS) * total);
  close(state.totalRatio, total); close(state.rpm, expectedRPM);
  assert.equal(hud.gearSource, 'physics'); assert.equal(hud.gear, state.gear);
  assert.equal(hud.gearLabel, String(state.gear)); assert.equal(hud.shifting, state.shifting); assert.equal(hud.neutral, false);
  const normalized = Math.max(0, Math.min(1, (expectedRPM - IDLE) / (SHIFT - IDLE)));
  close(hud.rpmNormalized, normalized); assert.equal(hud.shiftLights, Math.ceil(normalized * 8));
}

test('Carnival diesel keeps its Korean 2151 cc identity while distinguishing overseas ratios from estimated shift controls', () => {
  const car = carFor(stock), p = Profiles.resolve(car), spec = stock.factorySpec, gearing = Dynamics.describeGearing(car);
  assert.deepEqual([spec.modelYear, spec.market, spec.displacementCc, spec.engineFamily, spec.factoryDrive],
    [2024, 'KR', 2151, 'Smartstream D2.2', 'fwd']);
  assert.deepEqual([spec.transmissionType, spec.gearCount, spec.massKg, spec.powerPs], ['AT', 8, 2115, 194]);
  assert.deepEqual([spec.frontTire, spec.rearTire, spec.frontTireRadiusMm, spec.rearTireRadiusMm],
    ['235/60R18', '235/60R18', 369.6, 369.6]);
  assert.deepEqual(p.gearRatios, RATIOS); assert.equal(p.finalDriveRatio, FINAL_DRIVE); assert.equal(p.ratioStep, null);
  assert.equal(p.ratioStatus, 'reference-market'); assert.equal(p.ratioMarket, 'IL');
  assert.equal(p.ratioSourceId, 'kia-carnival-diesel-il-2024-ratios'); assert.ok(Profiles.SOURCES[p.ratioSourceId]);
  assert.ok(!p.sourceIds.includes('kia-carnival-us-2025-ratios'), 'diesel reference is sourced separately from the petrol table');
  assert.ok(p.referenceFields.includes('gearRatios') && p.referenceFields.includes('finalDriveRatio'));
  assert.ok(!p.verifiedFields.includes('gearRatios') && !p.verifiedFields.includes('finalDriveRatio'));
  assert.deepEqual([p.idleRPM, p.shiftRPM, p.maxRPM, p.ratedPowerRPM], [700, 4200, 4800, 3800]);
  for (const field of ['idleRPM', 'shiftRPM', 'maxRPM', 'shiftModel']) assert.ok(p.estimatedFields.includes(field));
  assert.equal(p.idleModel.status, 'observed'); assert.equal(p.idleModel.simulationCalibration, true);
  assert.equal(p.drivenAxle, 'front');
  close(gearing.nominalRadiusM, NOMINAL_RADIUS); close(gearing.effectiveRadiusM, RADIUS);
});

test('Carnival stock and default diesel tuning have independently checked fifth-through-eighth RPM with a single gearing multiplier', () => {
  assert.equal(defaults[0].uid, 'carnival-31415-g1-1');
  assert.deepEqual(defaults[0].levels, { acceleration: 3, topSpeed: 3, brakes: 4, grip: 1 });
  close(scaleOf(defaults[0]), 14.537 / 13.5);
  const expected = {
    80: [2494.0289898911583, 2045.9630762027546, 1634.724497886001, 1325.784073379385],
    100: [3117.5362373639477, 2557.4538452534434, 2043.4056223575012, 1657.2300917242312]
  };
  for (const e of [stock, ...defaults]) {
    const car = carFor(e), scale = scaleOf(e), gearing = Dynamics.describeGearing(car);
    const reduction = e.budget === 0 ? 13.5 : Math.round(13.5 * (1 + .045 * e.levels.acceleration) / (1 + .018 * e.levels.topSpeed) * 1000) / 1000;
    close(e.spec.reduction, reduction); close(scale, reduction / 13.5);
    gearing.totalRatios.forEach((ratio, i) => close(ratio, RATIOS[i] * FINAL_DRIVE * scale));
    for (const kph of [80, 100]) for (let gear = 5; gear <= 8; gear++) {
      // Hold an engaged ratio for this calculation only. A racing WOT
      // scheduler is not required to select eighth at a cruising road speed.
      car.speed = kph / 3.6; car.transmission.gear = gear; Dynamics.updateRPM(car);
      car.telemetry = Telemetry.create(car);
      close(car.transmission.rpm, expected[kph][gear - 5] * scale);
      assert.equal(car.telemetry.gear, gear); assert.equal(car.telemetry.gearLabel, String(gear));
      if (kph === 100 && gear === 8) assert.ok(car.transmission.rpm < 2000, e.uid + ': fixed eighth at 100 km/h');
    }
  }
});

test('Carnival diesel AT upshift retains physical movement and displays the same intermediate RPM as the drivetrain', () => {
  const straight = { id: 'carnival-diesel-shift-validation', lengthM: 4800,
    coordinates: [[1000, 0], [2000, 0], [2000, 400], [0, 400], [0, 0], [1000, 0]]
      .map(([x, y]) => [127 + x / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + y / 111195.08]) };
  const race = new Race({ circuit: straight, entrants: [stock], racingLine: false, laps: 1 }), car = race.cars[0];
  race._target = () => 160 / 3.6;
  for (let i = 0; i < 45 / DT && !(car.transmission.shifting && car.transmission.fromGear === 4); i++) race.step(DT);
  const state = car.transmission;
  assert.equal(state.shifting, true); assert.equal(state.fromGear, 4); assert.equal(state.toGear, 5);
  checkSnapshot(car);
  const before = { speed: car.speed, distance: car.distance, time: race.time, rpm: state.rpm };
  race.step(DT); checkSnapshot(car);
  close(race.time - before.time, DT); close(car.distance - before.distance, (before.speed + car.speed) * .5 * DT);
  assert.ok(car.speed > before.speed && state.rpm < before.rpm);
  assert.equal(state.gear, 4); assert.equal(car.telemetry.gearLabel, '4'); assert.equal(state.neutral, false);
  let ticks = 0;
  while (state.shifting && ticks++ < 60) { race.step(DT); checkSnapshot(car); }
  assert.equal(state.shifting, false); assert.equal(state.gear, 5); assert.equal(car.telemetry.gearLabel, '5');
  assert.ok(car.distance > before.distance && race.time > before.time);
});

for (const circuitId of ['inje', 'taebaek']) test(`Carnival diesel stock and default tuning finish ${circuitId} with consistent RPM and HUD`, () => {
  const race = new Race({ circuit: circuits.find(c => c.id === circuitId), entrants: [stock, defaults[0]], laps: 1 });
  const near80 = [0, 0], near100 = [0, 0], shifting = [0, 0];
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
    assert.ok(near80[i] > 3 && near100[i] > 3, car.uid + ': near-speed checks actually ran');
    assert.ok(shifting[i] > 10 && car.transmission.upshiftCount > 1 && car.transmission.downshiftCount > 0);
    close(car.driveReduction, RATIOS[0] * FINAL_DRIVE * scaleOf(car.entrant));
  }
});
