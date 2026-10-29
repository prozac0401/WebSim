'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const stock = require('../evolving_vehicles_2/tuning-evolution.js');
const powertrain = require('../evolving_vehicles_2/powertrain-profiles.js');
const catalog = require('./catalog.js');

test('body origins reproduce offline EV2 axle calibration and never change stock force inputs',()=>{
  const generated=require('./build-model-origins.cjs').checkOrWrite(true);
  assert.deepEqual(catalog.BODY_ORIGINS,generated);assert.equal(Object.keys(generated).length,7);
  for(const car of catalog.list()){
    const origin=generated[car.vehicleId],p=car.physics;
    assert.match(origin.sourceSha256,/^[a-f0-9]{64}$/);assert.match(origin.wheelPreparationSha256,/^[a-f0-9]{64}$/);
    assert.match(origin.method,/not measured CG/);assert.equal(car.bodyOrigin.status,'asset-derived-origin-alignment');
    assert.equal(p.bodyCenterOffsetM,p.wheelbaseM*(.5-(p.frontWeightFraction||.52))-p.lengthM*origin.axleMidpointFraction);
    assert.equal(p.frontWeightFraction,car.spec.frontWeightFraction);assert.equal(p.massKg,car.spec.massKg);
    assert.equal(p.wheelbaseM,car.spec.wheelbaseM||car.spec.wheelbaseMm/1000);
  }
});

test('catalogue exposes every existing RWD variant and no other drivetrain', () => {
  const expected = Object.values(stock.VARIANTS).flat().filter(v => v.spec.factoryDrive === 'rwd');
  assert.deepEqual(catalog.list().map(v => v.id).sort(), expected.map(v => v.id).sort());
  assert.equal(new Set(catalog.list().map(v => v.id)).size, expected.length);
  for (const source of expected) {
    const entry = catalog.get(source.id);
    assert.equal(entry.spec, source.spec, 'preserve the original frozen factory object');
    assert.equal(entry.massKg, source.spec.massKg);
    assert.equal(entry.peakTorque, source.spec.torqueNm);
    assert.equal(entry.peakPowerW, source.spec.powerPs * catalog.PS_WATTS);
    assert.equal(entry.tireRadius, source.spec.rearTireRadiusMm / 1000);
    assert.equal(entry.spec.factoryDrive, 'rwd');
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.physics));
    assert.ok(Object.isFrozen(entry.torqueCurve));
  }
});

test('single exact variant selection does not mix engine, drivetrain or transmission', () => {
  const two = catalog.get('g70-2.0t-rwd'), three = catalog.get('g70-3.3t-rwd');
  assert.notEqual(two.massKg, three.massKg);
  assert.notEqual(two.peakTorque, three.peakTorque);
  assert.equal(two.variantId, 'g70-2.0t-rwd');
  assert.throws(() => catalog.get('g70-2.0t-awd'), RangeError);
  assert.throws(() => catalog.get('g70'), RangeError);
  assert.throws(() => catalog.get('avante-n-2.0t-dct'), RangeError);
  assert.throws(() => { two.physics.peakTorque = 999; }, TypeError);
  const list = catalog.list();
  list.length = 0;
  assert.ok(catalog.list().length > 0);
});

test('default Supra retains exact Japanese gearing and official torque anchors', () => {
  const car = catalog.get();
  assert.equal(car.id, 'supra-3.0t-rz');
  assert.equal(car.massKg, 1520);
  assert.equal(car.peakTorque, 500);
  assert.equal(car.peakPowerW, 340 * catalog.PS_WATTS);
  assert.deepEqual(car.gearRatios, [5.25, 3.36, 2.172, 1.72, 1.316, 1, .822, .64]);
  assert.equal(car.finalDrive, 3.154);
  assert.equal(car.gearingStatus, 'verified-exact-market');
  assert.equal(car.torqueCurve.find(p => p.rpm === 1600).torqueNm, 500);
  assert.equal(car.torqueCurve.find(p => p.rpm === 4500).torqueNm, 500);
  assert.equal(car.diffType, 'active-lsd');
  assert.equal(car.differentialStatus, 'verified-hardware-estimated-control');
});

test('M2 F87 and GR86 ZN8 retain four exact EV2 factory combinations', () => {
  assert.equal(catalog.list().length, 16);
  const m2Dct = catalog.get('bmw-m2-3.0t-dct'), m2Mt = catalog.get('bmw-m2-3.0t-mt');
  const grMt = catalog.get('gr86-2.4-rz-mt'), grAt = catalog.get('gr86-2.4-rz-at');
  assert.deepEqual([m2Dct.modelYear, m2Dct.market, m2Dct.spec.engineFamily], [2016, 'DE', 'N55']);
  assert.deepEqual([m2Dct.massKg, m2Mt.massKg, m2Dct.peakTorque], [1520, 1495, 465]);
  assert.equal(m2Dct.peakPowerW, 370 * catalog.PS_WATTS);
  assert.deepEqual(m2Dct.gearRatios, [4.806, 2.593, 1.701, 1.277, 1, .844, .671]);
  assert.deepEqual(m2Mt.gearRatios, [4.110, 2.315, 1.542, 1.179, 1, .846]);
  assert.equal(m2Dct.finalDrive, 3.462);
  assert.equal(m2Mt.finalDrive, 3.462);
  assert.equal(m2Dct.diffType, 'active-lsd');
  assert.equal(m2Dct.torqueCurve.find(p => p.rpm === 1400).torqueNm, 465);
  assert.equal(m2Dct.torqueCurve.find(p => p.rpm === 5560).torqueNm, 465);
  assert.deepEqual([grMt.modelYear, grMt.market, grMt.spec.engineFamily], [2022, 'JP', 'FA24']);
  assert.deepEqual([grMt.massKg, grAt.massKg, grMt.peakTorque], [1270, 1290, 250]);
  assert.equal(grMt.peakPowerW, 235 * catalog.PS_WATTS);
  assert.deepEqual(grMt.gearRatios, [3.626, 2.188, 1.541, 1.213, 1, .767]);
  assert.deepEqual(grAt.gearRatios, [3.538, 2.060, 1.404, 1, .713, .582]);
  assert.equal(grMt.finalDrive, 4.1);
  assert.equal(grAt.finalDrive, 3.909);
  assert.equal(grMt.diffType, 'torsen-lsd');
  assert.equal(grMt.torqueCurve.find(p => p.rpm === 3700).torqueNm, 250);
  assert.equal(grMt.tireRadius, 314.6 / 1000);
  assert.deepEqual([m2Dct.idleRPM, m2Mt.idleRPM, grMt.idleRPM, grAt.idleRPM], [750, 750, 650, 700]);
  for (const car of [m2Dct, m2Mt, grMt, grAt]) {
    assert.equal(car.gearingStatus, 'verified-exact-market');
    assert.equal(car.differentialStatus, 'verified-hardware-estimated-control');
    assert.equal(car.torqueCurveStatus, 'official-anchors-estimated-shape');
    assert.ok(car.sources.every(source => source.url));
    assert.ok(car.limitations.some(note => note.includes('공통 차동제한 근사')));
  }
});

test('all sixteen variants preserve shared EV2 gearing and applicable engine RPM exactly', () => {
  assert.equal(catalog.list().length, 16);
  for (const car of catalog.list()) {
    const source = powertrain.resolve({vehicleId:car.vehicleId,variantId:car.id,spec:car.spec});
    assert.equal(car.profile,source,car.id+': original shared profile');
    if (car.electric) {
      assert.equal(car.idleRPM,0);assert.equal(car.shiftRPM,0);
      assert.deepEqual(car.gearRatios,[1]);
      assert.equal(car.finalDrive,source.singleSpeedReduction||car.spec.reduction);
      // EV2 maxRPM=0 denotes inapplicable engine RPM. The drift motor's
      // separate 16000-rpm modelling ceiling is not a manufacturer anchor.
      assert.equal(source.maxRPM,0);assert.equal(car.maxRPM,16000);
      assert.ok(car.provenance.estimatedFields.includes('maxRPM'));
      continue;
    }
    for (const field of ['idleRPM','shiftRPM','maxRPM'])assert.equal(car[field],source[field],car.id+': '+field);
    assert.equal(car.gearRatios.length,source.gearCount,car.id+': gear count');
    if (source.gearRatios) {
      assert.deepEqual(car.gearRatios,source.gearRatios,car.id+': individual ratios');
      assert.equal(car.finalDrive,source.finalDriveRatio||source.finalDriveRatios[0],car.id+': final drive');
      assert.deepEqual(car.finalDriveRatios,source.finalDriveRatios||null);
      assert.equal(car.gearingStatus,source.ratioStatus);
    } else {
      assert.equal(car.gearingStatus,'estimated');
      for(let i=0;i<source.gearCount;i++)assert.equal(car.gearRatios[i]*car.finalDrive,source.total1stReduction*source.ratioStep**i,car.id+': estimated total ratio '+(i+1));
    }
  }
});

test('three additional diesel variants retain EV2 year, market and evidence limits', () => {
  const mt=catalog.get('porter-diesel-mt'),at=catalog.get('porter-diesel-at'),g70=catalog.get('g70-2.2d-rwd');
  for(const car of [mt,at]){
    assert.deepEqual([car.modelYear,car.market,car.spec.engineCode],[2020,'KR','D4CB']);
    assert.deepEqual([car.spec.powerPs,car.peakTorque],[133,259.876]);
    assert.deepEqual([car.idleRPM,car.shiftRPM,car.maxRPM],[800,3800,4500]);
    assert.equal(car.gearingStatus,'estimated');assert.equal(car.profile.idleModel.status,'estimated');
  }
  assert.deepEqual([mt.massKg,at.massKg,mt.gearRatios.length,at.gearRatios.length],[1820,1845,6,5]);
  assert.deepEqual([g70.modelYear,g70.market,g70.massKg,g70.spec.powerPs,g70.peakTorque],[2019,'KR',1690,202,441.299]);
  assert.deepEqual(g70.gearRatios,[3.964,2.468,1.610,1.176,1,.832,.652,.565]);
  assert.equal(g70.finalDrive,3.385);assert.equal(g70.gearingStatus,'reference-market');
  assert.equal(g70.profile.finalDriveStatus,'derived-reference-market');
  assert.deepEqual([g70.idleRPM,g70.shiftRPM,g70.maxRPM],[800,4200,4800]);
  assert.equal(g70.profile.idleModel.status,'estimated');
});

test('estimated torque anchors cannot upgrade the stock peak torque or peak power', () => {
  for (const car of catalog.list()) {
    let previous = -1;
    for (const point of car.torqueCurve) {
      assert.ok(Number.isFinite(point.rpm) && point.rpm > previous, car.id + ': ordered RPM');
      assert.ok(point.torqueNm >= 0 && point.torqueNm <= car.peakTorque, car.id + ': torque cap');
      assert.ok(point.torqueNm * point.rpm * 2 * Math.PI / 60 <= car.peakPowerW + 1e-6, car.id + ': power cap');
      previous = point.rpm;
    }
    for (const field of ['massKg', 'wheelbaseM', 'lengthM', 'widthM', 'tireRadius', 'peakTorque', 'peakPowerW', 'maxSteer', 'steerRate', 'maxRPM']) {
      assert.ok(Number.isFinite(car[field]) && car[field] > 0, car.id + ': ' + field);
      assert.equal(car[field], car.physics[field]);
    }
  }
});

test('reference-market ratios and absent stock evidence remain visible', () => {
  const g70 = catalog.get('g70-2.0t-rwd');
  assert.equal(g70.gearingStatus, 'reference-market');
  assert.equal(g70.gearingMarket, 'US');
  assert.equal(g70.differentialStatus, 'unverified-open-assumption');
  assert.ok(g70.limitations.some(note => note.includes('동일성은 미확인')));
  const porter = catalog.get('porter-lpg-mt');
  assert.equal(porter.gearingStatus, 'estimated');
  assert.equal(porter.gearRatios[0] * porter.finalDrive, porter.spec.reduction);
  assert.ok(porter.limitations.some(note => note.includes('복륜')));
  const ev = catalog.get('ioniq5-long-rwd');
  assert.equal(ev.electric, true);
  assert.deepEqual(ev.gearRatios, [1]);
  assert.equal(ev.finalDrive, 2.263 * 4.706);
  assert.equal(ev.idleRPM, 0);
  assert.equal(ev.shiftRPM, 0);
  assert.equal(catalog.get('ioniq5-standard').gearingStatus, 'estimated');
});

test('browser script loading creates the same catalogue without CommonJS', () => {
  const context = vm.createContext({ window: {} });
  for (const file of [
    '../evolving_vehicles/vehicle-specs.js', '../evolving_vehicles_2/circuit-vehicle-specs.js',
    '../evolving_vehicles_2/tuning-evolution.js', '../evolving_vehicles_2/powertrain-profiles.js', './catalog.js'
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  assert.equal(context.window.DriftCatalog.DEFAULT_ID, catalog.DEFAULT_ID);
  assert.deepEqual(Array.from(context.window.DriftCatalog.list(), car => car.id), catalog.list().map(car => car.id));
  assert.equal(context.window.DriftCatalog.get().spec, context.window.TuningEvolution.VARIANTS.supra[0].spec);
});
