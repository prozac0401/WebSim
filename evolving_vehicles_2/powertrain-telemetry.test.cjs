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
    if (kind === 'electric') assert.deepEqual(state, { kind, gear: null, gearLabel: '—', rpmNormalized: 0, shiftLights: 0, shiftCue: false, battery: null });
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
  for (const v of Evolution.VARIANTS.g70) {
    const p = Profiles.resolve(carFor('g70', v.id));
    assert.equal(p.ratioMarket, 'US'); assert.equal(p.ratioStatus, 'reference-market');
    assert.equal(p.finalDriveRatio, v.id.includes('2.0') ? 3.727 : 3.538);
    assert.equal(p.gearRatios[0], v.id.includes('2.0') ? 3.964 : 3.665);
    assert.equal(p.gearRatios[5], v.id.includes('2.0') ? .832 : .826);
    assert.ok(p.sourceIds.includes('genesis-g70-us-2019-ratios'));
    assert.ok(p.estimatedFields.includes('domesticRatioMatch'));
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
  const filename = require.resolve('./powertrain-telemetry.js'), module = { exports: {} };
  const profile = { ...Profiles.PROFILES['k5-2.0'], gearCount: 4,
    gearRatios: [4, 3, 2, 1], finalDriveRatios: [3, 3, 4, 4], finalDriveRatio: 99,
    ratioStatus: 'reference-market', ratioSourceId: 'test-gear-groups' };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, PowertrainProfiles: { resolve: () => profile } }, { filename });
  const groupedTelemetry = module.exports, base = carFor();
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
  for (const variant of Evolution.VARIANTS.santafe) {
    const car = carFor('santafe', variant.id), profile = Profiles.resolve(car);
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
    assert.deepEqual(state, { kind: 'hybrid', gear: null, gearLabel: '—', rpmNormalized: 0, shiftLights: 0, shiftCue: false, battery: { flow: 0, mode: 'idle', cornerPhase: 'straight' } });
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
