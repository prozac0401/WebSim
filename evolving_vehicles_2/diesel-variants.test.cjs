'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Evolution = require('./tuning-evolution.js');
const Profiles = require('./powertrain-profiles.js');
const Dynamics = require('./powertrain-dynamics.js');
const Race = require('./race-engine.js');
const shared = require('../evolving_vehicles/vehicle-specs.js');
const near = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const cases = [
  ['porter2','porter-diesel-mt',2020,2497,133,26.5,1820,'rwd','MT',6,'195/70R15','145R13',327,281.1],
  ['porter2','porter-diesel-at',2020,2497,133,26.5,1845,'rwd','AT',5,'195/70R15','145R13',327,281.1],
  ['g70','g70-2.2d-rwd',2019,2199,202,45,1690,'rwd','AT',8,'225/50R17','225/50R17',328.4,328.4],
  ['g70','g70-2.2d-awd',2019,2199,202,45,1765,'awd','AT',8,'225/50R17','225/50R17',328.4,328.4],
  ['staria','staria-2.2d-fwd',2021,2199,177,44,2320,'fwd','AT',8,'235/55R18','235/55R18',357.85,357.85],
  ['staria','staria-2.2d-awd',2021,2199,177,44,2390,'awd','AT',8,'235/55R18','235/55R18',357.85,357.85],
  ['carnival','carnival-2.2d',2024,2151,194,45,2115,'fwd','AT',8,'235/60R18','235/60R18',369.6,369.6]
];
const entrant = (vehicleId, variantId, budget = 0) => Evolution.createEntrant({ vehicleId, variantId, budget, uid: variantId,
  levels: { acceleration: budget ? 1 : 0, topSpeed: 0, brakes: 0, grip: 0 } });

test('seven diesel presets keep each complete domestic year/drive/gearbox/tyre combination through tuning', () => {
  for (const [vehicleId,id,year,cc,power,kgfm,mass,drive,type,gears,front,rear,fr,rr] of cases) {
    const original = JSON.stringify(shared[vehicleId]);
    for (const budget of [0,30]) {
      const entry = entrant(vehicleId,id,budget), s = entry.factorySpec, p = Profiles.resolve({ entrant: entry });
      assert.deepEqual([s.modelYear,s.market,s.specificationMarket,s.displacementCc,s.powerPs,s.massKg,s.factoryDrive],
        [year,'KR','KR',cc,power,mass,drive],id);
      near(s.torqueNm,Math.round(kgfm*9.80665*1000)/1000);
      for (const spec of [s,entry.spec]) {
        assert.equal(spec.powertrainType,'diesel'); assert.equal(spec.electric,false);
        assert.deepEqual([spec.transmissionType,spec.gearCount],[type,gears]);
        assert.deepEqual([spec.frontTire,spec.rearTire,spec.frontTireRadiusMm,spec.rearTireRadiusMm],[front,rear,fr,rr]);
      }
      assert.equal(p.powertrainType,'diesel'); assert.deepEqual([p.transmissionType,p.gearCount],[type,gears]);
      const g = Dynamics.describeGearing({ entrant: entry, spec: entry.spec });
      near(g.nominalRadiusM,(drive === 'rwd' || vehicleId === 'g70' ? rr : fr)/1000);
      near(g.tunedFinalDriveScale,entry.spec.reduction/s.reduction);
      if (!budget) assert.equal(entry.spec,entry.factorySpec);
    }
    assert.equal(JSON.stringify(shared[vehicleId]),original,'original simulator specifications remain untouched');
  }
});

test('diesel gearing distinguishes its own reference tables from fallback estimates and keeps shift schedules estimated', () => {
  for (const [vehicleId,id] of cases) {
    const entry = entrant(vehicleId,id), p = Profiles.resolve({ entrant: entry });
    if (vehicleId === 'g70') {
      assert.equal(p.ratioStatus,'reference-market'); assert.equal(p.gearRatios.length,8);
      assert.equal(p.finalDriveRatio,3.385); assert.equal(p.ratioStep,null);
      assert.equal(p.ratioSourceId,'genesis-g70-diesel-de-2024-ratios');
      assert.ok(!p.sourceIds.includes('genesis-g70-us-2019-ratios'));
    } else if (vehicleId === 'carnival') {
      assert.equal(p.ratioStatus,'reference-market'); assert.equal(p.gearRatios.length,8);
      assert.equal(p.finalDriveRatio,3.510); assert.equal(p.ratioStep,null);
      assert.equal(p.ratioSourceId,'kia-carnival-diesel-il-2024-ratios');
      assert.ok(!p.sourceIds.includes('kia-carnival-us-2025-ratios'));
    } else {
      assert.equal(p.ratioStatus,'estimated'); assert.equal(p.gearRatios,null); assert.equal(p.finalDriveRatio,null);
      for (const key of ['total1stReduction','ratioStep']) assert.ok(p.estimatedFields.includes(key));
    }
    assert.equal(p.finalDriveRatios,null);
    assert.equal(p.ratedPowerRPM,vehicleId === 'porter2' ? 3600 : 3800);
    assert.ok(p.verifiedFields.includes('ratedPowerRPM'));
    for (const key of ['idleRPM','shiftRPM','maxRPM','shiftModel']) {
      assert.ok(p.estimatedFields.includes(key)); assert.ok(!p.verifiedFields.includes(key));
    }
    assert.ok(p.ratedPowerRPM < p.shiftRPM && p.shiftRPM < p.maxRPM && p.maxRPM < 5000);
    for (const sourceId of p.sourceIds) assert.ok(Profiles.SOURCES[sourceId]?.url.startsWith('https://'));
    assert.equal(Profiles.resolve({ entrant: { vehicleId, spec: entry.spec } }).powertrainType,'diesel');
    assert.equal(Profiles.resolve({ entrant: { vehicleId, spec: entry.spec } }).transmissionType,'unknown');
    const g = Dynamics.describeGearing({ entrant: entry });
    assert.ok(g.totalRatios.every((r,i,a) => r > 0 && (!i || r < a[i-1])));
  }
});

test('engine families and archived body notes distinguish Smartstream from R diesel and document the Porter rear-radius assumption', () => {
  const porter = Evolution.getVariant('porter2','porter-diesel-at').spec;
  assert.deepEqual([porter.engineFamily,porter.engineCode],['A-2','D4CB']);
  assert.equal(porter.tireFitment.rear.tiresPerAxle,4); assert.ok(porter.modeledFields.includes('rearTireRadiusMm'));
  assert.match(porter.sourceNote,/80%/); assert.match(porter.visualVariantNote,/2020.*LPG/);
  const carnival = Evolution.getVariant('carnival','carnival-2.2d').spec;
  assert.equal(carnival.engineFamily,'Smartstream D2.2'); assert.equal(carnival.displacementCc,2151);
  for (const drive of ['fwd','awd']) {
    const s = Evolution.getVariant('staria','staria-2.2d-'+drive).spec;
    assert.equal(s.referenceMarket,'AU'); assert.ok(s.referenceFields.includes('engineFamily'));
    assert.equal(s.engineCode,undefined); assert.match(s.visualVariantNote,/2021.*공용 스타리아/);
  }
  assert.equal(Evolution.getVariant('g70','g70-2.2d-rwd').spec.engineFamily,'R-FR 2.2 VGT');
});

test('diesel entrants actually launch and shift with their manual or automatic torque policy and physical HUD state', () => {
  const straight = { id:'diesel-shift', lengthM:4800, coordinates:[[1000,0],[2000,0],[2000,400],[0,400],[0,0],[1000,0]]
    .map(([x,y]) => [127+x/(111195.08*Math.cos(37*Math.PI/180)),37+y/111195.08]) };
  const races = [...new Set(cases.map(c=>c[0]))].map(vehicleId => new Race({ circuit:straight,
    entrants:cases.filter(c=>c[0]===vehicleId).map(([,id])=>entrant(vehicleId,id)), racingLine:false }));
  const seen = new Set();
  for (const race of races) {
    for (let i=0;i<2400 && race.cars.some(c=>!seen.has(c.uid));i++) {
      race.step(Race.FIXED_DT);
      for (const car of race.cars) if (car.transmission.shifting && !seen.has(car.uid)) {
      const s = car.transmission, p = Profiles.resolve(car);
      assert.equal(s.gear,1); assert.equal(s.toGear,2); assert.ok(car.distance>0 && car.speed>0);
      assert.equal(s.neutral,p.transmissionType==='MT');
      assert.equal(s.durationSeconds,p.shiftModel.upshiftDurationS);
      assert.equal(s.torqueFactor,p.shiftModel.torqueRetention);
      assert.equal(car.telemetry.gearSource,'physics'); assert.equal(car.telemetry.gear,s.gear);
      assert.equal(car.telemetry.gearLabel,p.transmissionType==='MT'?'N':'1');
      const resistance=.5*1.225*car.dragArea*car.speed**2+car.rollingCoefficient*car.massKg*9.81;
      const driveForce=car.massKg*car.acceleration+resistance;
      if (p.transmissionType==='MT') assert.ok(Math.abs(driveForce)<2,'manual shift interrupts wheel drive');
      else assert.ok(driveForce>0,'automatic shift retains positive wheel drive');
        seen.add(car.uid);
      }
    }
    for (let i=0;i<120;i++) race.step(Race.FIXED_DT);
    assert.ok(race.cars.every(c=>c.transmission.gear>=2 && Number.isFinite(c.transmission.rpm)));
  }
  assert.equal(seen.size,7,'all seven sourced diesel presets reach a physical first upshift');
});

test('stock cohorts include the added diesels once each and retain their existing petrol, LPG and hybrid choices', () => {
  for (const [vehicleId,count] of [['porter2',4],['g70',6],['staria',3],['carnival',3]]) {
    const entries=Evolution.createPopulation({vehicleId,budget:0,count:8,seed:31415});
    assert.equal(entries.length,count); assert.equal(new Set(entries.map(e=>e.variantId)).size,count);
    for (const e of entries) { assert.equal(e.spec,e.factorySpec); assert.equal(e.cost,0); }
  }
});
