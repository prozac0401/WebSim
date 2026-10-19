'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Evolution = require('./tuning-evolution.js'), Profiles = require('./powertrain-profiles.js');
const Dynamics = require('./powertrain-dynamics.js'), Race = require('./race-engine.js');
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const entrant = (vehicleId, variantId, budget = 0, levels) => Evolution.createEntrant({ vehicleId, variantId, budget, levels });
const carFor = (vehicleId, variantId, budget = 0, levels) => {
  const entry = entrant(vehicleId, variantId, budget, levels), car = { vehicleId, entrant: entry, spec: entry.spec, speed: 0 };
  car.transmission = Dynamics.create(car); return car;
};

test('K5 offers five real engines and keeps US GT performance separate from the Korean HEV reference values', () => {
  assert.deepEqual(Evolution.VARIANTS.k5.map(v => v.id), ['k5-2.0','k5-1.6t','k5-2.0lpg','k5-2.5t-gt','k5-2.0hev']);
  const gt = entrant('k5', 'k5-2.5t-gt').factorySpec, hybrid = entrant('k5', 'k5-2.0hev').factorySpec;
  assert.equal(gt.specificationMarket, 'US'); assert.equal(gt.modelYear, 2026); assert.equal(gt.displacementCc, 2497);
  near(gt.powerPs, 290 * 745.6998715822702 / 735.49875, .0005);
  near(gt.torqueNm, 311 * 1.3558179483314, .0005); near(gt.massKg, 3596 * .45359237, .0005);
  assert.equal(gt.frontWeightFraction, .61); assert.ok(gt.verifiedFields.includes('frontWeightFraction'));
  assert.ok(!gt.modeledFields.includes('frontWeightFraction')); assert.match(gt.visualVariantNote, /미국형 GT.*공용 K5/);
  assert.equal(hybrid.displacementCc, 1999); assert.equal(hybrid.powertrainType, 'hybrid');
  assert.equal(hybrid.enginePowerPs, 152); assert.equal(hybrid.motorPowerKw, 38.6);
  assert.equal(hybrid.powerPs, 195); assert.equal(hybrid.torqueNm, 367);
  assert.notEqual(hybrid.powerPs, hybrid.enginePowerPs + hybrid.motorPowerKw / .73549875);
  assert.notEqual(hybrid.torqueNm, hybrid.engineTorqueNm + hybrid.motorTorqueNm);
  assert.deepEqual(hybrid.referenceFields, ['powerPs','torqueNm']); assert.equal(hybrid.referenceMarket, 'AZ');
  assert.equal(hybrid.massKg, 1515); assert.equal(hybrid.specificationMarket, 'KR');
  assert.ok(!Object.keys(Profiles.PROFILES).some(id => /^k5-1\.6hev/i.test(id)));
});

test('all K5 and Santa Fe factory and tuned presets agree with gearbox identity and the selected nominal tyre', () => {
  const cases = [
    ['k5','k5-2.0','AT',6,'205/65R16',336.45], ['k5','k5-1.6t','AT',8,'215/55R17',334.15],
    ['k5','k5-2.0lpg','AT',6,'205/65R16',336.45], ['k5','k5-2.5t-gt','DCT',8,'245/40R19',339.3],
    ['k5','k5-2.0hev','AT',6,'205/65R16',336.45],
    ['santafe','santafe-2.5t-fwd','DCT',8,'245/45R21',376.95], ['santafe','santafe-2.5t-awd','DCT',8,'245/45R21',376.95],
    ['santafe','santafe-1.6hev-fwd','AT',6,'235/60R18',369.6], ['santafe','santafe-1.6hev-awd','AT',6,'235/60R18',369.6]
  ];
  for (const [vehicleId, variantId, type, gears, tire, radius] of cases) for (const budget of [0,30]) {
    const entry = entrant(vehicleId, variantId, budget, budget ? { acceleration: 1 } : undefined), p = Profiles.resolve({ entrant: entry });
    assert.equal(p.transmissionType, type); assert.equal(p.gearCount, gears);
    for (const spec of [entry.factorySpec, entry.spec]) {
      assert.equal(spec.transmissionType, type, variantId); assert.equal(spec.gearCount, gears);
      assert.equal(spec.frontTire, tire); assert.equal(spec.rearTire, tire);
      assert.equal(spec.frontTireRadiusMm, radius); assert.equal(spec.rearTireRadiusMm, radius);
    }
    const g = Dynamics.describeGearing({ entrant: entry, spec: entry.spec });
    near(g.nominalRadiusM, radius / 1000);
    near(g.tunedFinalDriveScale, entry.spec.reduction / entry.factorySpec.reduction);
  }
});

test('K5 GT uses verified gear ratios but explicitly estimates its final-drive assignment', () => {
  const car = carFor('k5','k5-2.5t-gt'), p = Profiles.resolve(car), g = Dynamics.describeGearing(car);
  assert.deepEqual(p.gearRatios, [3.643,2.304,2.217,1.621,.884,.703,.791,.660]);
  assert.deepEqual(p.finalDriveValues, [4.077,2.944]); assert.equal(p.ratioStatus, 'estimated');
  assert.equal(p.gearRatiosStatus, 'verified-exact-market'); assert.equal(p.finalDriveAssignmentStatus, 'estimated');
  assert.ok(p.verifiedFields.includes('gearRatios')); assert.ok(!p.verifiedFields.includes('finalDriveRatios'));
  assert.ok(p.estimatedFields.includes('finalDriveGearAssignment')); assert.equal(p.ratioMarket, 'US');
  assert.equal(p.drivenAxle, 'front'); near(g.effectiveRadiusM, .3393 * .985);
  assert.ok(g.totalRatios.every((ratio, i, all) => i === 0 || ratio < all[i - 1]), 'shaft changes must reduce total reduction');
  const tuned = carFor('k5','k5-2.5t-gt',30,{ acceleration:1 }), tg = Dynamics.describeGearing(tuned);
  for (let i = 0; i < 8; i++) near(tg.totalRatios[i] / g.totalRatios[i], tg.tunedFinalDriveScale);
  assert.equal(Profiles.PROFILES['k5-2.0hev'].gearRatios, null, 'unknown HEV ratios must not borrow another hybrid gearbox');
});

test('Santa Fe hybrids use six stepped hybrid gears and domestic system power with explicitly referenced torque', () => {
  for (const drive of ['fwd','awd']) {
    const car = carFor('santafe','santafe-1.6hev-' + drive), spec = car.spec, p = Profiles.resolve(car), g = Dynamics.describeGearing(car);
    assert.equal(spec.factoryDrive, drive); assert.equal(spec.massKg, drive === 'awd' ? 1930 : 1865);
    assert.equal(spec.displacementCc, 1598); assert.equal(spec.powerPs, 235); assert.equal(spec.torqueNm, 367);
    assert.deepEqual(spec.referenceFields, ['torqueNm']); assert.equal(spec.referenceMarket, 'AU');
    assert.equal(spec.motorPowerKw, 47.7); assert.equal(spec.enginePowerPs, 180); assert.equal(spec.wheelInches, 18);
    assert.deepEqual(p.gearRatios, [4.639,2.826,1.841,1.386,1,.772]); assert.equal(p.finalDriveRatio, 3.51);
    assert.equal(p.ratioStatus, 'reference-market'); assert.equal(p.ratioMarket, 'AU');
    assert.equal(p.shiftModel.family, 'hybrid-step'); assert.equal(p.shiftModel.upshiftDurationS, .25); assert.equal(p.shiftModel.torqueRetention, .65);
    assert.equal(p.shiftModel.assumed, true); near(g.totalRatios[0], 4.639 * 3.51); near(g.effectiveRadiusM, .3696 * .985);
    const ice = Profiles.PROFILES['santafe-2.5t-' + drive];
    assert.equal(ice.shiftModel.family, 'dual-clutch'); assert.equal(ice.shiftModel.upshiftDurationS, .12); assert.equal(ice.shiftModel.torqueRetention, .85);
  }
});

test('K5 GT versus 1.6T and Santa Fe HEV versus 2.5T physically use their own shift duration with positive drive work', () => {
  const straight = { id:'k5-santafe-shift', lengthM:4800, coordinates:[[1000,0],[2000,0],[2000,400],[0,400],[0,0],[1000,0]]
    .map(([x,y]) => [127 + x / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + y / 111195.08]) };
  for (const [vehicleId, variantId] of [['k5','k5-1.6t'],['k5','k5-2.5t-gt'],['k5','k5-2.0hev'],['santafe','santafe-2.5t-fwd'],['santafe','santafe-1.6hev-fwd'],['santafe','santafe-1.6hev-awd']]) {
    const race = new Race({ circuit:straight, entrants:[entrant(vehicleId,variantId)], racingLine:false }), car = race.cars[0];
    for (let i=0;i<2400&&!car.transmission.shifting;i++) race.step(Race.FIXED_DT);
    assert.equal(car.transmission.shifting,true,variantId); assert.equal(car.transmission.neutral,false);
    const s = car.transmission, p = Profiles.resolve(car), startDistance = car.distance;
    assert.equal(s.durationSeconds,p.shiftModel.upshiftDurationS); assert.equal(s.torqueFactor,p.shiftModel.torqueRetention);
    let ticks=0; while(s.shifting&&ticks++<100) {
      const resistance = .5 * 1.225 * car.dragArea * car.speed ** 2 + car.rollingCoefficient * car.massKg * 9.81;
      race.step(Race.FIXED_DT); assert.equal(s.neutral,false);
      assert.ok(car.massKg * car.acceleration + resistance > 0,variantId+' positive wheel work');
    }
    assert.equal(s.gear,2); assert.equal(s.upshiftCount,1); assert.ok(car.distance>startDistance);
    assert.ok(Math.abs(ticks*Race.FIXED_DT-(p.shiftModel.upshiftDurationS-Race.FIXED_DT))<Race.FIXED_DT+1e-12);
    assert.equal(car.telemetry.gear,s.gear); assert.equal(car.telemetry.gearSource,'physics');
  }
});

test('stock comparison grids include every new K5 and Santa Fe variant once with no inherited tuning', () => {
  for (const [vehicleId, expected] of [['k5',5],['santafe',4]]) {
    const population = Evolution.createPopulation({ vehicleId, budget:0, seed:2718, count:8 });
    assert.equal(population.length,expected); assert.equal(new Set(population.map(e=>e.variantId)).size,expected);
    for (const e of population) {
      assert.equal(e.spec,e.factorySpec); assert.equal(e.spec,Evolution.getVariant(vehicleId,e.variantId).spec);
      const p = Profiles.resolve({ entrant:e });
      assert.notEqual(p.transmissionType,'unknown'); assert.equal(p.transmissionType,e.spec.transmissionType);
      assert.equal(p.gearCount,e.spec.gearCount); assert.equal(e.cost,0);
    }
  }
});
