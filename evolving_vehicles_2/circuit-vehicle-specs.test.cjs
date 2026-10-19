'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const shared = require('../evolving_vehicles/vehicle-specs.js');
const specs = require('./circuit-vehicle-specs.js');
const Evolution = require('./tuning-evolution.js');
const Profiles = require('./powertrain-profiles.js');

test('circuit additions preserve all original presets and work in a script-tag browser', () => {
  const originalIds = Object.keys(shared);
  assert.equal(shared.g70, undefined); assert.equal(shared.supra, undefined); assert.equal(shared.bmw_m2, undefined); assert.equal(shared.avante_n, undefined); assert.equal(shared.gr86, undefined);
  for (const id of Object.keys(shared)) assert.equal(specs[id], shared[id]);
  assert.equal(Object.keys(specs).length, originalIds.length + 5);
  const sandbox = { window: { VehicleSpecs: shared } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./circuit-vehicle-specs.js'), 'utf8'), sandbox);
  for (const id of Object.keys(shared)) assert.equal(sandbox.window.CircuitVehicleSpecs[id], shared[id]);
  assert.equal(sandbox.window.VehicleSpecs, shared);
  assert.ok(Object.isFrozen(specs.g70.driveVariants.awd));
});

test('pre-facelift Korean G70 keeps engine, wheel and drivetrain mass combinations together', () => {
  const expected = [
    ['g70-2.0t-rwd', 1998, 'rwd', 252, 1595, '225/45R18', '225/45R18'],
    ['g70-2.0t-awd', 1998, 'awd', 252, 1665, '225/45R18', '225/45R18'],
    ['g70-3.3t-rwd', 3342, 'rwd', 370, 1705, '225/40R19', '255/35R19'],
    ['g70-3.3t-awd', 3342, 'awd', 370, 1775, '225/40R19', '255/35R19']
  ];
  for (const [id, cc, drive, ps, kg, front, rear] of expected) {
    const s = Evolution.getVariant('g70', id).spec;
    assert.deepEqual([s.displacementCc, s.factoryDrive, s.powerPs, s.massKg, s.frontTire, s.rearTire], [cc, drive, ps, kg, front, rear]);
    assert.equal(s.modelYear, 2019); assert.equal(s.market, 'KR');
    assert.notEqual(s.displacementCc, 2497, 'the 2026 official G70 model must not leak into this pre-facelift car');
  }
  const low = Evolution.getRules('g70', 'g70-2.0t-rwd'), high = Evolution.getRules('g70', 'g70-3.3t-awd');
  assert.ok(low.credits.acceleration > high.credits.acceleration);
  assert.ok(low.credits.grip > high.credits.grip);
});

test('Supra is exclusively the 2019 Japanese RZ 3.0T with its official factory combination', () => {
  assert.deepEqual(Evolution.VARIANTS.supra.map(v => v.id), ['supra-3.0t-rz']);
  const s = Evolution.getVariant('supra', 'supra-3.0t-rz').spec;
  assert.deepEqual([s.displacementCc, s.powerPs, s.torqueNm, s.massKg, s.factoryZeroTo100S], [2997, 340, 500, 1520, 4.3]);
  assert.deepEqual([s.frontTireRadiusMm, s.rearTireRadiusMm], [330.55, 337.55]);
  assert.equal(s.factoryDrive, 'rwd'); assert.equal(s.market, 'JP'); assert.equal(s.modelYear, 2019);
  assert.deepEqual(Evolution.getRules('supra', 'supra-3.0t-rz').credits, { acceleration: 0, topSpeed: 0, brakes: 0, grip: 0 }, 'no fictional lower trim or AWD comparator');
  const population = Evolution.createPopulation({ vehicleId: 'supra', count: 12, seed: 173 });
  assert.ok(population.every(entry => entry.variantId === 'supra-3.0t-rz'));
  assert.ok(new Set(population.map(entry => JSON.stringify(entry.levels))).size > 1, 'single factory trim still evolves varied tuning');
});

test('G70 and Supra variants get the correct eight-speed combustion HUD profile', () => {
  for (const vehicleId of ['g70', 'supra']) {
    for (const variant of Evolution.VARIANTS[vehicleId]) {
      const entrant = Evolution.createEntrant({ vehicleId, variantId: variant.id, budget: 0 });
      const profile = Profiles.resolve({ vehicleId, entrant });
      assert.equal(profile.gearCount, 8); assert.equal(profile.transmissionType, 'AT');
      assert.equal(profile.powertrainType, 'gasoline'); assert.equal(profile.visible, true);
      assert.ok(profile.sourceIds.length); assert.equal(profile.variantId, variant.id);
    }
    assert.equal(Profiles.resolve(vehicleId).gearCount, 8);
  }
});

test('2016 F87 M2 retains German DIN masses and both factory transmissions without mixing Competition or overboost', () => {
  assert.deepEqual(Evolution.VARIANTS.bmw_m2.map(v => v.id), ['bmw-m2-3.0t-dct', 'bmw-m2-3.0t-mt']);
  const population = Evolution.createPopulation({ vehicleId: 'bmw_m2', budget: 0, count: 12 });
  assert.equal(population.length, 2, 'stock mode includes exactly one of each real transmission');
  for (const [id, type, gears, mass, factoryTime] of [
    ['bmw-m2-3.0t-dct', 'DCT', 7, 1520, 4.3], ['bmw-m2-3.0t-mt', 'MT', 6, 1495, 4.5]
  ]) {
    const variant = Evolution.getVariant('bmw_m2', id), s = variant.spec;
    const entry = population.find(e => e.variantId === id), profile = Profiles.resolve({ entrant: entry });
    assert.equal(entry.spec, s, 'stock mode preserves the exact factory object');
    assert.deepEqual([s.modelYear, s.market, s.massStandard, s.engineFamily], [2016, 'DE', 'DIN', 'N55']);
    assert.deepEqual([s.displacementCc, s.powerPs, s.torqueNm, s.massKg, s.curbMassKg], [2979, 370, 465, mass, mass]);
    assert.deepEqual([s.lengthMm, s.widthMm, s.heightMm, s.wheelbaseMm], [4468, 1854, 1410, 2693]);
    assert.deepEqual([s.frontTire, s.rearTire, s.frontTireRadiusMm, s.rearTireRadiusMm], ['245/35ZR19', '265/35ZR19', 327.05, 334.05]);
    assert.deepEqual([s.factoryDrive, s.transmissionType, s.gearCount, s.factoryZeroTo100S], ['rwd', type, gears, factoryTime]);
    assert.equal(s.topSpeedMps, 250 / 3.6, 'optional 270 km/h package is not the baseline');
    assert.equal(s.dragArea, .7735); assert.equal(s.trackWidthM, (1579 + 1601) / 2000);
    assert.ok(!s.modeledFields.includes('dragArea')); assert.ok(s.modeledFields.includes('cgHeightM'));
    assert.deepEqual([profile.gearCount, profile.transmissionType, profile.ratioMarket], [gears, type, s.market]);
    assert.deepEqual(Evolution.getRules('bmw_m2', id).credits, { acceleration: 0, topSpeed: 0, brakes: 0, grip: 0 });
  }
  assert.equal(Profiles.resolve('bmw_m2').variantId, 'bmw-m2-3.0t-dct');
  assert.equal(specs.bmw_m2.curbMassKg, 1520);
  assert.ok(Object.isFrozen(specs.bmw_m2.driveVariants.rwd));
});

test('CN7 Avante N keeps Korean DCT/manual masses and base power separate from ordinary Avante and NGS', () => {
  assert.ok(Object.isFrozen(specs.avante_n.driveVariants.fwd));
  assert.notEqual(specs.avante_n, shared.avante);
  assert.deepEqual(Evolution.VARIANTS.avante_n.map(v => v.id), ['avante-n-2.0t-dct', 'avante-n-2.0t-mt']);
  assert.equal(Profiles.resolve('avante_n').variantId, 'avante-n-2.0t-dct', 'the circuit baseline is the DCT');
  for (const [id, mass, transmission, gears] of [
    ['avante-n-2.0t-dct', 1485, 'DCT', 8], ['avante-n-2.0t-mt', 1450, 'MT', 6]
  ]) {
    const entry = Evolution.createEntrant({ vehicleId: 'avante_n', variantId: id, budget: 0 }), s = entry.spec;
    assert.equal(s, entry.factorySpec);
    assert.deepEqual([s.modelYear, s.market, s.displacementCc, s.powerPs, s.torqueNm, s.massKg, s.curbMassKg], [2021, 'KR', 1998, 280, 392.266, mass, mass]);
    assert.deepEqual([s.lengthMm, s.widthMm, s.heightMm, s.wheelbaseMm], [4675, 1825, 1415, 2720]);
    assert.deepEqual([s.factoryDrive, s.differential, s.transmissionType, s.gearCount], ['fwd', 'eLSD', transmission, gears]);
    assert.deepEqual([s.frontTire, s.rearTire, s.frontTireRadiusMm, s.rearTireRadiusMm], ['245/35ZR19', '245/35ZR19', 327.05, 327.05]);
    assert.deepEqual(Evolution.getRules('avante_n', id).credits, { acceleration: 0, topSpeed: 0, brakes: 0, grip: 0 }, 'equal-power FWD variants create no fictional compensation');
    assert.match(s.sourceUrl, /hyundai\.com\/contents\/repn-car\/catalog\/avante-n-price\.pdf$/);
    assert.ok(s.modeledFields.includes('gripG') && s.modeledFields.includes('dragArea'));
  }
  const stock = Evolution.createPopulation({ vehicleId: 'avante_n', budget: 0, seed: 17 });
  assert.deepEqual(stock.map(e => e.variantId).sort(), ['avante-n-2.0t-dct', 'avante-n-2.0t-mt']);
  assert.equal(Profiles.resolve('avante').transmissionType, 'IVT', 'ordinary Avante remains unchanged');
});

test('GR86 RZ uses one Japanese 2022 source for both transmissions and keeps Korean/GT86 specifications out', () => {
  assert.deepEqual(Evolution.VARIANTS.gr86.map(v => v.id), ['gr86-2.4-rz-mt', 'gr86-2.4-rz-at']);
  assert.equal(Profiles.resolve('gr86').variantId, 'gr86-2.4-rz-mt');
  for (const [id, transmission, mass] of [['gr86-2.4-rz-mt', 'MT', 1270], ['gr86-2.4-rz-at', 'AT', 1290]]) {
    const entry = Evolution.createEntrant({ vehicleId: 'gr86', variantId: id, budget: 0 }), s = entry.spec;
    assert.equal(s, entry.factorySpec);
    assert.deepEqual([s.modelYear, s.market, s.engineFamily, s.displacementCc, s.powerPs, s.torqueNm, s.massKg], [2022, 'JP', 'FA24', 2387, 235, 250, mass]);
    assert.deepEqual([s.lengthMm, s.widthMm, s.heightMm, s.roofHeightMm, s.wheelbaseMm], [4265, 1775, 1310, 1280, 2575]);
    assert.deepEqual([s.factoryDrive, s.differential, s.transmissionType, s.gearCount], ['rwd', 'Torsen LSD', transmission, 6]);
    assert.deepEqual([s.frontTire, s.rearTire, s.frontTireRadiusMm, s.rearTireRadiusMm], ['215/40R18', '215/40R18', 314.6, 314.6]);
    assert.equal(s.trackWidthM, (1520 + 1550) / 2000);
    assert.ok(!s.modeledFields.includes('trackWidthM'));
    for (const field of ['dragArea', 'gripG', 'brakeG', 'cgHeightM', 'topSpeedMps']) assert.ok(s.modeledFields.includes(field));
    assert.deepEqual(Evolution.getRules('gr86', id).credits, { acceleration: 0, topSpeed: 0, brakes: 0, grip: 0 });
    assert.match(s.sourceUrl, /toyota\.jp\/.*\/gr86\/2022-05\/pdf\/gr86_main_s_202205\.pdf$/);
  }
  const stock = Evolution.createPopulation({ vehicleId: 'gr86', budget: 0, count: 12 });
  assert.equal(stock.length, 2);
  assert.deepEqual(stock.map(e => e.variantId).sort(), ['gr86-2.4-rz-at', 'gr86-2.4-rz-mt']);
  assert.ok(Object.isFrozen(specs.gr86.driveVariants.rwd));
});
