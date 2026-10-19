'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Telemetry = require('./powertrain-telemetry.js');
const Dynamics = require('./powertrain-dynamics.js');
const Profiles = require('./powertrain-profiles.js');
const Evolution = require('./tuning-evolution.js');
const TrackRace = require('./race-engine.js');
const circuits = require('./circuits.js');
const dt = TrackRace.FIXED_DT;
const batteryReading = state => ({ flow: state.battery.flow, mode: state.battery.mode });

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
    if (kind === 'electric') assert.deepEqual(state, { kind, gear: null, gearLabel: '—', gearSource: 'not-applicable', shifting: false, neutral: false, rpmNormalized: 0, shiftLights: 0, shiftCue: false, battery: null });
    if (label === 'IVT') {
      assert.equal(state.gear, null); assert.equal(state.gearLabel, 'IVT'); assert.ok(state.rpmNormalized > .2);
      tick(car, state, 1, { speed: 50, acceleration: 2 }, { drivePowerW: 200000, curvature: 0 });
      assert.ok(state.rpmNormalized > .94); assert.equal(state.shiftCue, false, 'IVT has no stepped upshift cue');
    }
    if (state.battery) assert.deepEqual(Object.keys(state.battery).sort(), ['cornerPhase', 'flow', 'mode'], 'corner phase is not invented SOC');
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

test('G80 WOT display uses unequal manufacturer-reference ratios and stays in third at 100 km/h', () => {
  for (const variant of Evolution.VARIANTS.g80) {
    const car = carFor('g80', variant.id), state = Telemetry.create(car), profile = Profiles.resolve(car), gearing = Telemetry.describeGearing(car);
    assert.deepEqual(profile.gearRatios, [3.665, 2.396, 1.610, 1.190, 1, .826, .643, .556]);
    assert.equal(profile.finalDriveRatio, variant.id.includes('2.5') ? 3.909 : 3.727);
    assert.equal(profile.ratioStatus, 'reference-market', 'AU source must not be presented as verified domestic ratios');
    assert.ok(profile.estimatedFields.includes('domesticRatioMatch'));
    assert.ok(profile.estimatedFields.includes('shiftRPM'));
    assert.ok(profile.estimatedFields.includes('rollingRadiusScale'));
    assert.ok(profile.sourceIds.includes('genesis-g80-au-2026-ratios'));
    assert.equal(gearing.effectiveRadiusM, .35025 * .985);
    const thirdRPM = 100 / 3.6 / (2 * Math.PI * gearing.effectiveRadiusM) * 60 * gearing.totalRatios[2];
    assert.ok(thirdRPM > 4500 && thirdRPM < 4900);
    assert.ok(Telemetry.gearSpeedAtRPM(car, 7, profile.shiftRPM) * 3.6 > 315, '7→8 must not occur near 190 km/h in a WOT schedule');
    const at = {};
    for (let i = 0; i <= 220 / dt; i++) {
      const kph = i * dt;
      car.speed = kph / 3.6; car.acceleration = 1 / 3.6;
      Telemetry.update(car, state, dt, { drivePowerW: 180000 });
      if (Math.abs(kph - 100) < dt / 2) at[100] = state.gear;
      if (Math.abs(kph - 190) < dt / 2) at[190] = state.gear;
    }
    assert.equal(at[100], 3, variant.id); assert.equal(at[190], 5, variant.id);
    tick(car, state, 3, { speed: 100 / 3.6, acceleration: -4 }, { brakePowerW: 90000 });
    tick(car, state, 2, { speed: 100 / 3.6, acceleration: 2 }, { drivePowerW: 180000 });
    assert.equal(state.gear, 3, variant.id + ': WOT corner exit must recover third after braking from fifth');
  }
});

test('exact-market Supra ratios, tuning ratio changes and unsourced fallback remain distinguishable', () => {
  const base = carFor('supra', 'supra-3.0t-rz'), profile = Profiles.resolve(base), g = Telemetry.describeGearing(base);
  assert.equal(profile.ratioStatus, 'verified-exact-market'); assert.equal(profile.ratioMarket, 'JP');
  assert.deepEqual(profile.gearRatios, [5.250, 3.360, 2.172, 1.720, 1.316, 1, .822, .640]);
  assert.equal(profile.finalDriveRatio, 3.154); assert.ok(profile.verifiedFields.includes('gearRatios'));
  assert.equal(g.totalRatios[0], 5.250 * 3.154);
  const tunedEntry = Evolution.createEntrant({ vehicleId: 'supra', variantId: 'supra-3.0t-rz', levels: { acceleration: 1 } });
  const tuned = { vehicleId: 'supra', entrant: tunedEntry, spec: tunedEntry.spec };
  assert.ok(Telemetry.gearSpeedAtRPM(tuned, 3, 6500) < Telemetry.gearSpeedAtRPM(base, 3, 6500), 'shorter modeled final drive raises RPM at the same speed');
  assert.equal(Telemetry.describeGearing(carFor()).ratioStatus, 'estimated');
  assert.equal(Profiles.resolve(carFor()).gearRatios, null, 'unverified ratios must not be fabricated as official tables');
  const gasoline = Evolution.VARIANTS.g70.filter(v => v.spec.powertrainType === 'gasoline');
  assert.equal(gasoline.length, 4, 'all four original gasoline combinations keep their reference ratios');
  for (const v of gasoline) {
    const p = Profiles.resolve(carFor('g70', v.id));
    assert.equal(p.ratioMarket, 'US'); assert.equal(p.ratioStatus, 'reference-market');
    assert.equal(p.finalDriveRatio, v.id.includes('2.0') ? 3.727 : 3.538);
    assert.equal(p.gearRatios[0], v.id.includes('2.0') ? 3.964 : 3.665);
    assert.equal(p.gearRatios[5], v.id.includes('2.0') ? .832 : .826);
    assert.ok(p.sourceIds.includes('genesis-g70-us-2019-ratios'));
    assert.ok(p.estimatedFields.includes('domesticRatioMatch'));
  }
  const diesel = Evolution.VARIANTS.g70.filter(v => v.spec.powertrainType === 'diesel');
  assert.equal(diesel.length, 2);
  for (const v of diesel) {
    const car = carFor('g70', v.id), p = Profiles.resolve(car), gearing = Telemetry.describeGearing(car);
    assert.equal(p.powertrainType, 'diesel'); assert.equal(p.gearCount, 8);
    assert.equal(p.gearRatios, null); assert.equal(p.finalDriveRatio, null); assert.equal(p.finalDriveRatios, null);
    assert.equal(p.ratioStatus, 'estimated'); assert.equal(gearing.sourceId, null);
    assert.ok(!p.sourceIds.includes('genesis-g70-us-2019-ratios'), 'gasoline tables must not label the diesel reduction as sourced');
    assert.ok(p.sourceIds.includes('genesis-g70-diesel-2019'));
    assert.equal(gearing.shiftRPM, 4200); assert.equal(p.maxRPM, 4800);
    assert.deepEqual(gearing.totalRatios, Array.from({ length: 8 }, (_, i) => 13.5 * Math.pow(.78, i)));
  }
});

test('Supra rear-tyre gearing gives the expected eight-speed WOT display and corner-exit recovery', t => {
  const car = carFor('supra', 'supra-3.0t-rz'), profile = Profiles.resolve(car);
  const gearing = Telemetry.describeGearing(car), state = Telemetry.create(car);
  assert.equal(car.spec.rearTire, '275/35ZR19');
  assert.notEqual(car.spec.frontTireRadiusMm, car.spec.rearTireRadiusMm, 'staggered tyres expose an incorrect front-axle calculation');
  assert.equal(gearing.nominalRadiusM, .33755);
  assert.equal(gearing.effectiveRadiusM, .33755 * .985);
  assert.equal(profile.shiftRPM, 6500, 'the schedule uses an estimated 6500 RPM shift point');
  const expectedShiftKph = [49.20370724, 76.88079256, 118.93161281, 150.18573431, 196.29138527, 258.31946301, 314.25725428, 403.62416096];
  const shiftKph = expectedShiftKph.map((expected, i) => {
    const actual = Telemetry.gearSpeedAtRPM(car, i + 1, 6500) * 3.6;
    assert.ok(Math.abs(actual - expected) < 1e-7, 'gear ' + (i + 1) + ': rear tyre and total reduction determine speed');
    return actual;
  });
  // Synthetic telemetry input exercises all eight gears. These speeds are
  // mathematical gear limits, not claims that the race car reaches them.
  const expectedAt = { 100: 3, 150: 4, 190: 5, 200: 6, 260: 7, 320: 8 }, at = {};
  let lastShiftAt = -Infinity, shifts = 0;
  for (let i = 0; i <= 330 / dt; i++) {
    const kph = i * dt, previousGear = state.gear;
    car.speed = kph / 3.6; car.acceleration = 1 / 3.6;
    Telemetry.update(car, state, dt, { drivePowerW: 200000 });
    if (state.gear !== previousGear) {
      assert.equal(state.gear, previousGear + 1);
      assert.ok(i * dt - lastShiftAt >= Telemetry.MODEL.minimumShiftIntervalSeconds - dt);
      lastShiftAt = i * dt; shifts++;
    }
    const checkpoint = Math.round(kph);
    if (Object.hasOwn(expectedAt, checkpoint) && Math.abs(kph - checkpoint) < dt / 2) at[checkpoint] = state.gear;
  }
  assert.equal(shifts, 7); assert.deepEqual(at, expectedAt);
  tick(car, state, 3, { speed: 200 / 3.6, acceleration: -4 }, { brakePowerW: 90000 });
  tick(car, state, 3, { speed: 100 / 3.6, acceleration: -4 }, { brakePowerW: 90000 });
  tick(car, state, 2, { speed: 100 / 3.6, acceleration: 2 }, { drivePowerW: 200000 });
  assert.equal(state.gear, 3, 'accelerating out of a 100 km/h corner restores third after 200 km/h braking');
  const cornerExit100KphGear = state.gear;
  let thresholdChanges = 0;
  for (let i = 0; i < 8 / dt; i++) {
    const previousGear = state.gear;
    car.speed = shiftKph[2] / 3.6 * (1 + .01 * Math.sin(i * dt * 12)); car.acceleration = .1;
    Telemetry.update(car, state, dt, { drivePowerW: 15000 });
    if (state.gear !== previousGear) thresholdChanges++;
  }
  assert.equal(thresholdChanges, 1, 'small oscillations at the third-gear shift speed do not hunt');
  assert.equal(state.gear, 4);
  t.diagnostic('Supra synthetic HUD: ' + JSON.stringify({ shiftKph: shiftKph.map(kph => Number(kph.toFixed(8))), gearAtKph: at, cornerExit100KphGear, thresholdChanges }));
});

test('M2 7DCT and 6MT use distinct exact-market ratios with rear tyres and sequential WOT shifts', () => {
  for (const [id, ratios, expectedSpeeds, expectedAt] of [
    ['bmw-m2-3.0t-dct', [4.806, 2.593, 1.701, 1.277, 1, .844, .671],
      [48.45977038, 89.81783897, 136.91808139, 182.37874428, 232.89765645, 275.94509058, 347.09039709], { 100: 3, 150: 4, 200: 5, 240: 6, 280: 7 }],
    ['bmw-m2-3.0t-mt', [4.110, 2.315, 1.542, 1.179, 1, .846],
      [56.66609646, 100.60373929, 151.03609368, 197.53830063, 232.89765645, 275.29273812], { 100: 2, 150: 3, 200: 5, 240: 6, 280: 6 }]
  ]) {
    const car = carFor('bmw_m2', id), profile = Profiles.resolve(car), gearing = Telemetry.describeGearing(car), state = Telemetry.create(car);
    assert.deepEqual(profile.gearRatios, ratios); assert.equal(profile.finalDriveRatio, 3.462);
    assert.equal(profile.ratioStatus, 'verified-exact-market'); assert.equal(profile.ratioMarket, 'DE');
    assert.equal(profile.drivenAxle, 'rear'); assert.equal(gearing.effectiveRadiusM, .33405 * .985);
    assert.equal(profile.ratedPowerRPM, 6500); assert.equal(profile.maxRPM, 7000);
    assert.ok(profile.verifiedFields.includes('gearRatios'));
    assert.ok(profile.referenceFields.includes('maxRPM'), '7000 RPM is from the UK release for the same N55 engine');
    assert.ok(profile.estimatedFields.includes('shiftRPM')); assert.ok(!profile.estimatedFields.includes('maxRPM'));
    assert.ok(profile.sourceIds.includes('bmw-m2-2016-de')); assert.ok(profile.sourceIds.includes(profile.maxRPMSourceId));
    expectedSpeeds.forEach((kph, i) => assert.ok(Math.abs(Telemetry.gearSpeedAtRPM(car, i + 1, 6500) * 3.6 - kph) < 1e-7));
    // Synthetic input above the factory 250 km/h cap checks the top gear only;
    // these mathematical shift speeds are not achievable race-speed claims.
    const at = {}; let shifts = 0, lastShiftTime = -Infinity;
    for (let i = 0; i <= 280 / dt; i++) {
      const kph = i * dt, previousGear = state.gear, previousRpm = state.rpmNormalized;
      car.speed = kph / 3.6; car.acceleration = 1 / 3.6;
      Telemetry.update(car, state, dt, { drivePowerW: 200000 });
      if (state.gear !== previousGear) {
        assert.equal(state.gear, previousGear + 1); assert.ok(state.rpmNormalized < previousRpm);
        assert.ok(i * dt - lastShiftTime >= Telemetry.MODEL.minimumShiftIntervalSeconds - dt);
        shifts++; lastShiftTime = i * dt;
      }
      const checkpoint = Math.round(kph);
      if (Object.hasOwn(expectedAt, checkpoint) && Math.abs(kph - checkpoint) < dt / 2) at[checkpoint] = state.gear;
    }
    assert.equal(shifts, ratios.length - 1); assert.deepEqual(at, expectedAt);
    tick(car, state, 4, { speed: 100 / 3.6, acceleration: -4 }, { brakePowerW: 90000 });
    tick(car, state, 2, { speed: 100 / 3.6, acceleration: 2 }, { drivePowerW: 200000 });
    assert.equal(state.gear, 3, 'MT second would exceed the 90% downshift threshold at 100 km/h; hysteresis holds third');
    tick(car, state, 2, { speed: 80 / 3.6, acceleration: 2 }, { drivePowerW: 200000 });
    assert.equal(state.gear, 2, 'both transmissions can return to second once safely below its shift threshold');
  }
});

test('rolling telemetry starts in the speed-appropriate gear without replaying launch or battery work', () => {
  const stationary = carFor('supra', 'supra-3.0t-rz'), stoppedState = Telemetry.create(stationary);
  assert.equal(stoppedState.gear, 1); assert.equal(stoppedState.rpmNormalized, 0);
  for (const [kph, expectedGear] of [[100, 3], [150, 4], [190, 5], [200, 6], [260, 7], [320, 8]]) {
    const car = carFor('supra', 'supra-3.0t-rz'); car.speed = kph / 3.6;
    const before = JSON.stringify(car), state = Telemetry.create(car), initial = { ...state };
    assert.equal(state.gear, expectedGear, kph + ' km/h starts in a suitable gear');
    assert.ok(state.rpmNormalized > .6 && state.rpmNormalized <= 1);
    assert.ok(state.shiftLights >= 5);
    tick(car, state, 1, { acceleration: 1 }, { drivePowerW: 200000 });
    assert.equal(state.gear, expectedGear, 'holding speed does not trigger a cascade of artificial shifts');
    assert.ok(Math.abs(state.rpmNormalized - initial.rpmNormalized) < 1e-12);
    assert.equal(JSON.stringify({ ...car, acceleration: 0 }), before, 'initializing telemetry does not change the car');
  }
  const hybrid = carFor('carnival', 'carnival-1.6heV'); hybrid.speed = 30;
  const hybridState = Telemetry.create(hybrid);
  assert.ok(hybridState.gear > 1);
  assert.deepEqual(hybridState.battery, { flow: 0, mode: 'idle', cornerPhase: 'straight' });
  const electric = carFor('ioniq5', 'ioniq5-long-awd'); electric.speed = 30;
  const electricState = Telemetry.create(electric);
  assert.equal(electricState.gear, null); assert.equal(electricState.rpmNormalized, 0);
});

test('estimated stepped gearing follows both shorter and taller tuning final drives', () => {
  for (const [vehicleId, variants] of Object.entries(Evolution.VARIANTS)) {
    for (const variant of variants) {
      const stockEntry = Evolution.createEntrant({ vehicleId, variantId: variant.id, budget: 0 });
      const stock = { vehicleId, entrant: stockEntry, spec: stockEntry.spec };
      const profile = Profiles.resolve(stock);
      if (!profile.gearCount || profile.gearRatios) continue;
      const stockGearing = Telemetry.describeGearing(stock);
      for (const levels of [{ acceleration: 1 }, { topSpeed: 1 }]) {
        const tunedEntry = Evolution.createEntrant({ vehicleId, variantId: variant.id, levels });
        const tuned = { vehicleId, entrant: tunedEntry, spec: tunedEntry.spec };
        const gearing = Telemetry.describeGearing(tuned);
        const scale = tunedEntry.spec.reduction / tunedEntry.factorySpec.reduction;
        assert.equal(gearing.tunedFinalDriveScale, scale, variant.id);
        assert.equal(gearing.ratioStatus, 'estimated', 'tuning does not upgrade source confidence');
        for (let gear = 1; gear <= profile.gearCount; gear++) {
          assert.ok(Math.abs(gearing.totalRatios[gear - 1] / stockGearing.totalRatios[gear - 1] - scale) < 1e-12, variant.id);
          const stockSpeed = Telemetry.gearSpeedAtRPM(stock, gear, profile.shiftRPM);
          const tunedSpeed = Telemetry.gearSpeedAtRPM(tuned, gear, profile.shiftRPM);
          assert.ok(Math.abs(tunedSpeed / stockSpeed - 1 / scale) < 1e-12, variant.id);
        }
      }
    }
  }
});

test('gear-specific final drives take priority over a shared final drive and retain tuning', () => {
  const filename = require.resolve('./powertrain-telemetry.js');
  const profile = { ...Profiles.PROFILES['k5-2.0'], gearCount: 4,
    gearRatios: [4, 3, 2, 1], finalDriveRatios: [3, 3, 4, 4], finalDriveRatio: 99,
    ratioStatus: 'reference-market', ratioSourceId: 'test-gear-groups' };
  const sandbox = vm.createContext({ module: { exports: {} }, PowertrainProfiles: { resolve: () => profile } });
  const dynamicsFile = require.resolve('./powertrain-dynamics.js');
  vm.runInContext(fs.readFileSync(dynamicsFile, 'utf8'), sandbox, { filename: dynamicsFile });
  sandbox.module = { exports: {} };
  vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  const groupedTelemetry = sandbox.module.exports, base = carFor();
  assert.deepEqual(Array.from(groupedTelemetry.describeGearing(base).totalRatios), [12, 9, 8, 4]);
  delete profile.finalDriveRatio;
  assert.deepEqual(Array.from(groupedTelemetry.describeGearing(base).totalRatios), [12, 9, 8, 4], 'a scalar final drive is optional');
  const tuned = { ...base, spec: { ...base.spec, reduction: base.spec.reduction * 1.1 } };
  const gearing = groupedTelemetry.describeGearing(tuned);
  assert.equal(gearing.sourceId, 'test-gear-groups');
  assert.equal(gearing.tunedFinalDriveScale, 1.1);
  for (let gear = 1; gear <= 4; gear++) {
    assert.ok(Math.abs(groupedTelemetry.gearSpeedAtRPM(tuned, gear, 6000)
      / groupedTelemetry.gearSpeedAtRPM(base, gear, 6000) - 1 / 1.1) < 1e-12);
  }
});

test('Kia reference-market ratios preserve the exact engine and gearbox combination', () => {
  for (const [vehicleId, variantId, ratios, finalDrive, sourceId] of [
    ['k5', 'k5-1.6t', [4.717, 2.906, 1.864, 1.423, 1.224, 1, .790, .635], 3.367, 'kia-k5-us-2024-ratios'],
    ['carnival', 'carnival-3.5', [4.808, 2.901, 1.864, 1.424, 1.219, 1, .799, .648], 3.510, 'kia-carnival-us-2025-ratios'],
    ['carnival', 'carnival-1.6heV', [4.639, 2.826, 1.841, 1.386, 1, .772], 3.648, 'kia-carnival-hev-us-2025-ratios']
  ]) {
    const car = carFor(vehicleId, variantId), profile = Profiles.resolve(car);
    assert.deepEqual(profile.gearRatios, ratios, variantId);
    assert.equal(profile.finalDriveRatio, finalDrive, variantId);
    assert.equal(profile.ratioMarket, 'US'); assert.equal(profile.ratioStatus, 'reference-market');
    assert.ok(profile.sourceIds.includes(sourceId)); assert.equal(profile.ratioSourceId, sourceId);
    assert.ok(profile.referenceFields.includes('gearRatios'));
    assert.ok(profile.referenceFields.includes('finalDriveRatio'));
    assert.ok(!profile.verifiedFields.includes('gearRatios'));
    assert.ok(profile.estimatedFields.includes('domesticRatioMatch'));
    assert.ok(profile.estimatedFields.includes('shiftRPM'));
    assert.equal(profile.drivenAxle, 'front');
    // Unequal fixture radii expose an accidental reuse of the older rear-drive
    // profiles' axle choice even though these stock cars have matching tyres.
    car.spec = { ...car.spec, rearTireRadiusMm: car.spec.frontTireRadiusMm + 70 };
    const gearing = Telemetry.describeGearing(car);
    assert.equal(gearing.nominalRadiusM, car.spec.frontTireRadiusMm / 1000);
    assert.equal(gearing.totalRatios[0], ratios[0] * finalDrive);
    assert.ok(gearing.totalRatios.every((ratio, i, all) => i === 0 || ratio < all[i - 1]));
  }
  assert.equal(Profiles.PROFILES['k5-2.0'].gearRatios, null, 'K5 1.6T ratios must not spill into the 2.0 6AT');
  assert.equal(Profiles.PROFILES['k5-2.0lpg'].gearRatios, null);
});

test('Santa Fe DCT final-drive groups produce real RPM drops at 2–3 and 6–7 shifts', () => {
  const variants = Evolution.VARIANTS.santafe.filter(v => v.id.startsWith('santafe-2.5t-'));
  assert.equal(variants.length, 2, 'both original ICE drive layouts keep the eight-speed DCT');
  for (const variant of variants) {
    const car = carFor('santafe', variant.id), profile = Profiles.resolve(car);
    assert.equal(profile.transmissionType, 'DCT'); assert.equal(profile.powertrainType, 'gasoline');
    assert.deepEqual(profile.gearRatios, [3.429, 2.217, 2.217, 1.621, .860, .673, .791, .653]);
    assert.deepEqual(profile.finalDriveRatios, [4.846, 4.846, 3.316, 3.316, 4.846, 4.846, 3.316, 3.316]);
    assert.equal(profile.finalDriveRatio, null);
    assert.equal(profile.ratioStatus, 'reference-market'); assert.equal(profile.ratioMarket, 'AU');
    assert.ok(profile.sourceIds.includes('hyundai-santafe-au-mx5-ratios'));
    assert.ok(profile.sourceIds.includes('hyundai-santafe-au-my21-final-drives'));
    assert.ok(profile.estimatedFields.includes('finalDriveGearAssignment'));
    assert.ok(profile.estimatedFields.includes('domesticRatioMatch'));
    assert.equal(profile.drivenAxle, 'front');
    car.spec = { ...car.spec, rearTireRadiusMm: car.spec.frontTireRadiusMm + 70 };
    const gearing = Telemetry.describeGearing(car), state = Telemetry.create(car);
    assert.equal(gearing.nominalRadiusM, car.spec.frontTireRadiusMm / 1000);
    assert.ok(gearing.totalRatios[2] < gearing.totalRatios[1], 'equal 2nd/3rd internal ratios have different final drives');
    assert.ok(gearing.totalRatios[6] < gearing.totalRatios[5], '7th internal ratio is larger but its total ratio is smaller');
    const checked = new Set();
    for (let i = 0; i < 80 / dt; i++) {
      const previous = { ...state };
      car.speed = i * dt * 5 / 3.6; car.acceleration = 5 / 3.6;
      Telemetry.update(car, state, dt, { drivePowerW: 180000 });
      if (previous.gear !== state.gear && [2, 6].includes(previous.gear)) {
        assert.equal(state.gear, previous.gear + 1, variant.id);
        assert.ok(state.rpmNormalized < previous.rpmNormalized - .15, variant.id + ': RPM must drop after upshift');
        assert.equal(state.shiftLights, 0);
        checked.add(previous.gear);
      }
    }
    assert.deepEqual([...checked], [2, 6], variant.id + ': acceleration traverses both final-drive groups');
  }
});

test('Santa Fe HEV uses six hybrid automatic gears and one final drive without inheriting DCT shaft groups', () => {
  const variants = Evolution.VARIANTS.santafe.filter(v => v.id.startsWith('santafe-1.6hev-'));
  assert.equal(variants.length, 2);
  for (const variant of variants) {
    const car = carFor('santafe', variant.id), profile = Profiles.resolve(car);
    assert.equal(profile.transmissionType, 'AT'); assert.equal(profile.powertrainType, 'hybrid'); assert.equal(profile.gearCount, 6);
    assert.equal(profile.shiftModel.family, 'hybrid-step');
    assert.deepEqual(profile.gearRatios, [4.639, 2.826, 1.841, 1.386, 1, .772]);
    assert.equal(profile.finalDriveRatio, 3.51); assert.equal(profile.finalDriveRatios, null);
    assert.equal(profile.ratioStatus, 'reference-market'); assert.equal(profile.ratioMarket, 'AU');
    assert.ok(profile.sourceIds.includes('hyundai-santafe-hev-au-ratios'));
    assert.ok(!profile.sourceIds.includes('hyundai-santafe-au-my21-final-drives'));
    car.spec = { ...car.spec, rearTireRadiusMm: car.spec.frontTireRadiusMm + 70 };
    const gearing = Telemetry.describeGearing(car), state = Telemetry.create(car), shifts = new Set();
    assert.equal(gearing.nominalRadiusM, car.spec.frontTireRadiusMm / 1000);
    assert.equal(state.kind, 'hybrid'); assert.ok(state.battery);
    // Synthetic speed sweep verifies the display's six-gear limit; it is not
    // a claim that the actual HEV can reach the supplied terminal speed.
    for (let i = 0; i < 80 / dt; i++) {
      const previous = { ...state };
      car.speed = i * dt * 5 / 3.6; car.acceleration = 5 / 3.6;
      Telemetry.update(car, state, dt, { drivePowerW: 180000 });
      assert.ok(state.gear >= 1 && state.gear <= 6, variant.id);
      if (previous.gear !== state.gear) {
        assert.equal(state.gear, previous.gear + 1); shifts.add(state.gear);
        assert.ok(state.rpmNormalized < previous.rpmNormalized - .15, variant.id + ': HEV RPM drops on each upshift');
      }
    }
    assert.deepEqual([...shifts], [2, 3, 4, 5, 6]); assert.equal(state.gear, 6);
  }
});

test('an actual Spa racing-line lap charges on every braking onset and transitions from apex ramp to exit assist', t => {
  const events = [], samples = [], ObservedRace = loadEngine({
    create: Telemetry.create, stop: Telemetry.stop,
    update(car, state, delta, input) {
      const previous = state.battery.mode + '/' + state.battery.cornerPhase;
      const updated = Telemetry.update(car, state, delta, input);
      const next = state.battery.mode + '/' + state.battery.cornerPhase;
      const sample = { distance: car.distance, speed: car.speed, acceleration: car.acceleration, ...input, ...state.battery };
      samples.push(sample); if (next !== previous) events.push(sample);
      return updated;
    }
  });
  const race = new ObservedRace({ circuit: circuits.find(c => c.id === 'spa'), laps: 1, entrants: [entrant('carnival', 'carnival-1.6heV')] });
  while (!race.finished && race.time < 600) race.step(30);
  assert.equal(race.finished, true); assert.equal(race.cars[0].dnf, false);
  const braking = samples.filter(s => s.speed > .5 && s.brakePowerW > 100);
  assert.ok(braking.length > 100); assert.ok(braking.every(s => s.mode === 'charging' && s.flow < 0), 'not one actual braking tick may wait for corner entry');
  assert.ok(braking.some(s => s.cornerPhase === 'straight' || s.cornerPhase === 'exit'), 'Spa includes real braking before corner classification');
  const apex = samples.filter(s => s.mode === 'using' && s.cornerPhase === 'apex-exit');
  assert.ok(apex.length > 50, 'assist must begin while the real racing line is still opening out of a bend');
  assert.ok(apex.some(s => s.flow > .05 && s.flow < .65), 'apex phase must contain a gradual flow ramp');
  const exits = samples.filter(s => s.mode === 'using' && s.cornerPhase === 'exit');
  assert.ok(exits.some(s => s.flow > .95), 'confirmed exits reach full assistance request');
  assert.ok(samples.filter(s => s.mode === 'using').every(s => s.drivePowerW > 100 && s.brakePowerW <= 100 && s.acceleration > .18));
  const phaseChanges = events.filter((event, i) => !i || event.cornerPhase !== events[i - 1].cornerPhase);
  t.diagnostic(`Spa: ${braking.length} charging ticks, ${apex.length} apex-assist ticks, ${exits.length} exit-assist ticks; ${phaseChanges.length} corner-phase changes / ${events.length} actual-work mode changes.`);
  assert.ok(phaseChanges.length < 80, 'apex/exit hysteresis prevents frame-frequency phase toggling');
});

test('hybrid regeneration starts on the very first braking tick before any corner', () => {
  const car = carFor('carnival', 'carnival-1.6heV'), state = Telemetry.create(car);
  car.speed = 30; car.acceleration = -3;
  Telemetry.update(car, state, dt, { brakePowerW: 140000, curvature: 0 });
  assert.equal(state.battery.cornerPhase, 'straight');
  assert.equal(state.battery.mode, 'charging'); assert.ok(state.battery.flow < 0);
  car.acceleration = .5;
  Telemetry.update(car, state, dt, { brakePowerW: 30000, curvature: 0 });
  assert.equal(state.battery.mode, 'charging', 'braking downhill still recuperates even if gravity accelerates the car');
  Telemetry.update(car, state, dt, { brakePowerW: 0, drivePowerW: 0, curvature: 0 });
  assert.deepEqual(batteryReading(state), { flow: 0, mode: 'idle' });
});

test('hybrid assist ramps after a confirmed apex, then reaches full request on exit without losing braking priority', () => {
  const car = carFor('carnival', 'carnival-1.6heV'), state = Telemetry.create(car);
  tick(car, state, 1, { speed: 20, acceleration: -2 }, { brakePowerW: 70000, curvature: .018 });
  tick(car, state, .5, { speed: 18, acceleration: 0 }, { drivePowerW: 12000, curvature: .018 });
  assert.equal(state.battery.cornerPhase, 'corner'); assert.equal(state.battery.mode, 'idle');
  const flowSamples = [];
  for (let i = 0; i < 1.4 / dt; i++) {
    car.speed = 18 + 1.5 * i * dt; car.acceleration = 1.5;
    Telemetry.update(car, state, dt, { drivePowerW: 75000, curvature: .018 - .009 * i * dt / 1.4 });
    if (state.battery.mode === 'using') flowSamples.push(state.battery.flow);
  }
  assert.equal(state.battery.cornerPhase, 'apex-exit');
  assert.ok(flowSamples.length > 20); assert.ok(flowSamples[0] < .01);
  assert.ok(flowSamples.at(-1) > .1 && flowSamples.at(-1) < .75);
  assert.ok(flowSamples.every((f, i) => !i || f >= flowSamples[i - 1]), 'opening-corner assistance rises smoothly');
  tick(car, state, 1.2, { speed: 23, acceleration: 2 }, { drivePowerW: 85000, curvature: 0 });
  assert.equal(state.battery.cornerPhase, 'exit'); assert.ok(state.battery.flow > .95);
  Telemetry.update(car, state, dt, { brakePowerW: 60000, drivePowerW: 85000, curvature: 0 });
  assert.equal(state.battery.mode, 'charging'); assert.ok(state.battery.flow < 0, 'wheel braking immediately overrides assistance');
  tick(car, state, 5, { acceleration: 2 }, { drivePowerW: 85000, curvature: 0 });
  assert.equal(state.battery.cornerPhase, 'straight'); assert.deepEqual(batteryReading(state), { flow: 0, mode: 'idle' });
});

test('hybrid gauge charges on applied braking and assists only the first seconds after leaving a corner', () => {
  const car = carFor('carnival', 'carnival-1.6heV'), state = Telemetry.create(car);
  tick(car, state, 5, { speed: 20, acceleration: 2 }, { drivePowerW: 80000, curvature: 0 });
  assert.deepEqual(batteryReading(state), { flow: 0, mode: 'idle' }, 'launch/long straight acceleration is not corner-exit assist');
  tick(car, state, 1.5, { speed: 20, acceleration: .4 }, { drivePowerW: 35000, curvature: .012 });
  assert.equal(state.battery.mode, 'idle', 'mid-corner propulsion does not trigger exit assist');
  tick(car, state, 1, { speed: 25, acceleration: 2 }, { drivePowerW: 80000, curvature: 0 });
  assert.equal(state.battery.mode, 'using'); assert.ok(state.battery.flow > .4 && state.battery.flow <= 1);
  tick(car, state, .3, { acceleration: -2 }, { brakePowerW: 90000, curvature: 0 });
  assert.equal(state.battery.mode, 'charging'); assert.ok(state.battery.flow < -.7 && state.battery.flow >= -1);
  tick(car, state, .3, { acceleration: -.5 }, { drivePowerW: 12000, brakePowerW: 0, curvature: 0 });
  assert.deepEqual(batteryReading(state), { flow: 0, mode: 'idle' }, 'uphill slowing with positive wheel work is not regeneration');
  tick(car, state, .3, { acceleration: 1.5 }, { drivePowerW: 0, brakePowerW: 0, curvature: 0 });
  assert.deepEqual(batteryReading(state), { flow: 0, mode: 'idle' }, 'downhill coasting acceleration is not electric assist');
  tick(car, state, 5, { acceleration: 2 }, { drivePowerW: 80000, curvature: 0 });
  assert.deepEqual(batteryReading(state), { flow: 0, mode: 'idle' }, 'the finite exit window expires on a long straight');
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

test('a short curvature gap during genuine acceleration does not fabricate a passed apex', () => {
  const car = carFor('carnival', 'carnival-1.6heV'), state = Telemetry.create(car);
  tick(car, state, 1.5, { speed: 20, acceleration: .4 }, { drivePowerW: 60000, curvature: .012 });
  for (let n = 0; n < 5; n++) {
    for (let i = 0; i < Math.round(.6 / dt); i++) {
      car.speed += .4 * dt;
      Telemetry.update(car, state, dt, { drivePowerW: 60000, curvature: i < Math.round(.1 / dt) ? 0 : .012 });
      assert.equal(state.battery.cornerPhase, 'corner');
      assert.equal(state.battery.mode, 'idle', 'filter recovery must not turn a geometry gap into sustained opening');
    }
  }
});

test('finished and retired cars clear active flow, RPM lamps and the selected gear', () => {
  for (const terminal of ['finished', 'dnf']) {
    const car = carFor('carnival', 'carnival-1.6heV'), state = Telemetry.create(car);
    tick(car, state, 1, { speed: 35, acceleration: -2 }, { brakePowerW: 60000, curvature: .01 });
    assert.equal(state.battery.mode, 'charging');
    car[terminal] = true;
    Telemetry.update(car, state, 0);
    assert.deepEqual(state, { kind: 'hybrid', gear: null, gearLabel: '—', gearSource: 'display-estimate', shifting: false, neutral: false, rpmNormalized: 0, shiftLights: 0, shiftCue: false, battery: { flow: 0, mode: 'idle', cornerPhase: 'straight' } });
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
    race.sampleForCar = () => ({ x: 0, y: 0, elevation: 0, grade, curvature: 0 });
    race._target = () => speed - resistance / car.massKg * dt;
    race.step(dt);
    const last = observations.at(-1);
    assert.equal(Math.sign(last.acceleration), -Math.sign(grade));
    assert.ok(last.drivePowerW < 1e-6 && last.brakePowerW < 1e-6, 'coasting work must be zero despite speed changing');
    assert.deepEqual(batteryReading(car.telemetry), { flow: 0, mode: 'idle' });
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

test('Avante N DCT/manual references retain grouped final drives and shift sequentially through every gear', () => {
  for (const [id, transmission, ratios, finalDrives] of [
    ['avante-n-2.0t-dct', 'DCT', [3.714, 2.261, 2.174, 1.621, .927, .767, .878, .698], [3.8, 3.8, 2.714, 2.714, 3.8, 3.8, 2.714, 2.714]],
    ['avante-n-2.0t-mt', 'MT', [3.083, 1.931, 1.696, 1.276, 1.027, .854], [4.154, 4.154, 3.176, 3.176, 3.176, 3.176]]
  ]) {
    const car = carFor('avante_n', id), profile = Profiles.resolve(car);
    assert.equal(profile.transmissionType, transmission); assert.equal(profile.gearCount, ratios.length);
    assert.deepEqual(profile.gearRatios, ratios); assert.deepEqual(profile.finalDriveRatios, finalDrives);
    assert.equal(profile.finalDriveRatio, null); assert.equal(profile.ratioStatus, 'reference-market');
    assert.equal(profile.ratioMarket, 'AU'); assert.equal(profile.drivenAxle, 'front');
    assert.equal(profile.ratioSourceId, 'hyundai-avante-n-au-2021-ratios');
    assert.ok(profile.sourceIds.includes(profile.ratioSourceId));
    assert.ok(profile.referenceFields.includes('gearRatios') && profile.referenceFields.includes('finalDriveRatios'));
    assert.ok(!profile.verifiedFields.includes('gearRatios'));
    assert.ok(!profile.estimatedFields.includes('finalDriveGearAssignment'), 'the AU table explicitly assigns every final drive');
    for (const key of ['domesticRatioMatch', 'shiftRPM', 'maxRPM', 'rollingRadiusScale']) assert.ok(profile.estimatedFields.includes(key));
    assert.deepEqual([profile.ratedPowerRPM, profile.shiftRPM, profile.maxRPM], [6000, 6500, 7000]);
    car.spec = { ...car.spec, rearTireRadiusMm: 400 };
    const gearing = Telemetry.describeGearing(car), state = Telemetry.create(car);
    assert.equal(gearing.nominalRadiusM, .32705, 'FWD HUD uses the front tyre even with unequal fixture tyres');
    assert.equal(gearing.effectiveRadiusM, .32705 * .985);
    const expectedTotal = ratios.map((ratio, i) => ratio * finalDrives[i]);
    assert.deepEqual(gearing.totalRatios, expectedTotal);
    assert.ok(expectedTotal.every((ratio, i) => i === 0 || ratio < expectedTotal[i - 1]));
    const shifts = [];
    // Synthetic HUD ramp verifies all groups; these are not reachable race-speed claims.
    for (let i = 0; i < 72 / dt; i++) {
      const previous = { ...state }; car.speed = i * dt * 5 / 3.6; car.acceleration = 5 / 3.6;
      Telemetry.update(car, state, dt, { drivePowerW: 200000 });
      if (state.gear !== previous.gear) {
        assert.equal(state.gear, previous.gear + 1, id);
        assert.ok(state.rpmNormalized < previous.rpmNormalized - .08, id + ': each upshift drops RPM');
        shifts.push(state.gear);
      }
    }
    assert.deepEqual(shifts, Array.from({ length: ratios.length - 1 }, (_, i) => i + 2));
  }
});

test('GR86 MT/AT use exact Japanese ratios, rear tyre radius and sequential shifts with an explicitly referenced rev limit', () => {
  for (const [id, transmission, ratios, finalDrive] of [
    ['gr86-2.4-rz-mt', 'MT', [3.626, 2.188, 1.541, 1.213, 1, .767], 4.1],
    ['gr86-2.4-rz-at', 'AT', [3.538, 2.060, 1.404, 1, .713, .582], 3.909]
  ]) {
    const car = carFor('gr86', id), profile = Profiles.resolve(car);
    assert.deepEqual([profile.transmissionType, profile.gearCount, profile.ratioMarket, profile.drivenAxle], [transmission, 6, 'JP', 'rear']);
    assert.deepEqual(profile.gearRatios, ratios); assert.equal(profile.finalDriveRatio, finalDrive);
    assert.equal(profile.finalDriveRatios, null); assert.equal(profile.ratioStatus, 'verified-exact-market');
    assert.ok(profile.verifiedFields.includes('gearRatios') && profile.verifiedFields.includes('finalDriveRatio'));
    assert.equal(profile.ratioSourceId, 'toyota-gr86-jp-2022');
    assert.deepEqual([profile.ratedPowerRPM, profile.shiftRPM, profile.maxRPM], [7000, 7000, 7500]);
    assert.ok(profile.referenceFields.includes('maxRPM') && !profile.estimatedFields.includes('maxRPM'));
    assert.equal(profile.maxRPMSourceId, 'toyota-gr86-eu-2022-engine');
    assert.ok(profile.estimatedFields.includes('shiftRPM'));
    car.spec = { ...car.spec, frontTireRadiusMm: 400 };
    const gearing = Telemetry.describeGearing(car), state = Telemetry.create(car), shifts = [];
    assert.ok(Math.abs(gearing.nominalRadiusM - .3146) < 1e-12);
    assert.ok(Math.abs(gearing.effectiveRadiusM - .3146 * .985) < 1e-12);
    assert.deepEqual(gearing.totalRatios, ratios.map(ratio => ratio * finalDrive));
    for (let i = 0; i < 72 / dt; i++) {
      const previous = { ...state }; car.speed = i * dt * 5 / 3.6; car.acceleration = 5 / 3.6;
      Telemetry.update(car, state, dt, { drivePowerW: 180000 });
      if (state.gear !== previous.gear) {
        assert.equal(state.gear, previous.gear + 1);
        assert.ok(state.rpmNormalized < previous.rpmNormalized - .08);
        shifts.push(state.gear);
      }
    }
    assert.deepEqual(shifts, [2, 3, 4, 5, 6]);
    tick(car, state, 5, { speed: 0, acceleration: -5 }, { brakePowerW: 0 });
    assert.equal(state.gear, 1, 'both gearboxes return sequentially to first at rest');
  }
});

test('physical gear and RPM snapshots override standalone scheduling without changing transmission state', () => {
  const car = carFor('gr86', 'gr86-2.4-rz-mt'), profile = Profiles.resolve(car);
  car.transmission = Dynamics.create(car);
  car.speed = 90; // A display-only scheduler would immediately request an upshift.
  Object.assign(car.transmission, { gear: 2, rpm: 4200 });
  const before = JSON.stringify(car), state = Telemetry.create(car);
  assert.equal(state.gearSource, 'physics'); assert.equal(state.gear, 2);
  assert.equal(state.rpmNormalized, (4200 - profile.idleRPM) / (profile.shiftRPM - profile.idleRPM));
  tick(car, state, 3, {}, { drivePowerW: 180000 });
  assert.equal(state.gear, 2, 'the HUD must not run its own shift timer');
  assert.equal(JSON.stringify(car), before, 'telemetry only reads the physical snapshot');
  Object.assign(car.transmission, { shifting: true, neutral: true, torqueFactor: 0, remainingSeconds: .3 });
  Telemetry.update(car, state, dt);
  assert.equal(state.gear, 2); assert.equal(state.gearLabel, 'N');
  assert.equal(state.shiftCue, false); assert.equal(state.shiftLights, 0);
  const paused = JSON.stringify(state);
  Telemetry.update(car, state, 0);
  assert.equal(JSON.stringify(state), paused, 'pausing does not finish a physical shift');
  Object.assign(car.transmission, { gear: 3, shifting: false, neutral: false, torqueFactor: 1, remainingSeconds: 0, rpm: 3200 });
  Telemetry.update(car, state, dt);
  assert.equal(state.gearLabel, '3'); assert.equal(state.neutral, false);
  assert.equal(state.rpmNormalized, (3200 - profile.idleRPM) / (profile.shiftRPM - profile.idleRPM), 'RPM has no independent display lag');
  for (const terminal of ['finished', 'dnf']) {
    const ended = { ...car, [terminal]: true }, endedState = Telemetry.create(ended);
    assert.equal(endedState.gearLabel, '—'); assert.equal(endedState.neutral, false);
  }
});

function hudHarness(race) {
  let writes = 0;
  const tracked = object => new Proxy(object, { set(target, key, value) { writes++; target[key] = value; return true; } });
  const node = () => tracked({ dataset: tracked({}), style: tracked({}), attributes: {},
    setAttribute(key, value) { writes++; this.attributes[key] = String(value); },
    classList: { toggle() { writes++; } } });
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  get('shift-lights').children = Array.from({ length: 8 }, node);
  get('speed').value = '1';
  let uiUpdates = 0;
  const sandbox = vm.createContext({ $: get, vehicles: TrackRace.VEHICLES, race,
    watching: () => race.cars[0], watch: 0, lastUI: race.time, lastFrame: 1000,
    manual: false, fast: false, running: true, simulate: seconds => race.step(seconds),
    renderer: { advanceCamera: () => false }, draw() {}, requestAnimationFrame() {} });
  sandbox.updateUI = () => { uiUpdates++; sandbox.updatePowertrainHUD(race.cars[0]); };
  const source = fs.readFileSync(require.resolve('./evolving_vehicles_2.js'), 'utf8');
  const hud = source.slice(source.indexOf("let powertrainHUDKey='';"), source.indexOf('function simulate('));
  const frame = source.slice(source.indexOf('function frame('), source.indexOf('async function fullscreen('));
  const advance = source.slice(source.indexOf('window.advanceTime='), source.indexOf('window.render_game_to_text='));
  sandbox.window = {};
  vm.runInContext(hud + '\n' + frame + '\n' + advance, sandbox);
  return { sandbox, nodes, get, writes: () => writes, uiUpdates: () => uiUpdates };
}

test('rendered MT neutral and DCT/AT gear numbers track physical shift boundaries before the slow UI refresh', () => {
  for (const [id, variant, type] of [
    ['gr86', 'gr86-2.4-rz-mt', 'MT'], ['avante_n', 'avante-n-2.0t-dct', 'DCT'], ['supra', 'supra-3.0t-rz', 'AT']
  ]) {
    const observations = [], ObservedRace = loadEngine({ create: Telemetry.create, stop: Telemetry.stop,
      update(car, state, delta, input) { observations.push({ shifting: car.transmission.shifting, ...input }); return Telemetry.update(car, state, delta, input); }
    });
    const race = new ObservedRace({ circuit: circuits.find(c => c.id === 'everland'), laps: 2, entrants: [entrant(id, variant)] });
    const car = race.cars[0], profile = Profiles.resolve(car);
    race.sampleForCar = () => ({ x: 0, y: 0, elevation: 0, grade: 0, curvature: 0 });
    race._target = () => 100;
    car.speed = Dynamics.gearSpeedAtRPM(car, 1, profile.shiftRPM) * 1.001;
    const hud = hudHarness(race), { sandbox } = hud;
    sandbox.updatePowertrainHUD(car);
    sandbox.frame(1000 + 1000 / 60);
    assert.equal(hud.uiUpdates(), 0, 'the roster refresh has not run yet');
    assert.equal(car.transmission.shifting, true, type);
    assert.equal(hud.get('gear-value').textContent, type === 'MT' ? 'N' : '1', type);
    assert.equal(car.telemetry.gear, car.transmission.gear);
    assert.equal(hud.get('gear-value').title, type === 'MT' ? '수동 변속 중 · 동력 차단' : '변속 중');
    let activeFrames = 1, completed = false;
    for (let frame = 2; frame < 90; frame++) {
      // Suppress the large UI refresh to prove the per-frame HUD path alone
      // observes both start and completion, including the short DCT interval.
      sandbox.lastUI = race.time + 1 / 60;
      sandbox.frame(1000 + frame * 1000 / 60);
      const physical = car.transmission, displayed = car.telemetry;
      assert.equal(displayed.gear, physical.gear, type);
      assert.equal(displayed.gearLabel, type === 'MT' && physical.neutral ? 'N' : String(physical.gear), type);
      assert.equal(hud.get('gear-value').textContent, displayed.gearLabel, 'DOM equals the current physical snapshot');
      if (physical.shifting) activeFrames++;
      else {
        assert.equal(physical.gear, 2); assert.equal(hud.get('gear-value').textContent, '2');
        assert.equal(hud.get('gear-value').title, ''); completed = true; break;
      }
    }
    assert.ok(activeFrames > 2 && completed, type + ': a real shift was observed through completion');
    if (type === 'MT') {
      const cuts = observations.filter(o => o.shifting);
      assert.ok(cuts.length > 20);
      assert.ok(cuts.every(o => o.drivePowerW < 1e-6), 'every displayed MT neutral tick has zero applied propulsion');
    } else assert.ok(observations.filter(o => o.shifting).every(o => o.drivePowerW > 100), type + ' retains propulsion during its numeric shift');
    const writes = hud.writes();
    sandbox.running = false;
    for (let frame = 0; frame < 5; frame++) sandbox.frame(sandbox.lastFrame + 16);
    assert.equal(hud.writes(), writes, 'unchanged paused HUD makes no DOM writes');
    // The deterministic test hook ends with exactly the same DOM snapshot.
    sandbox.running = true;
    sandbox.window.advanceTime(15);
    assert.equal(hud.get('gear-value').textContent, car.telemetry.gearLabel);
    car.finished = true; Telemetry.stop(car.telemetry);
    sandbox.window.advanceTime(0);
    assert.equal(hud.get('gear-value').textContent, '—');
    assert.equal(hud.get('gear-value').attributes['aria-label'], '주행 종료');
  }
});
