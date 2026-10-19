'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Profiles=require('./powertrain-profiles.js'),Evolution=require('./tuning-evolution.js');

test('all 53 actual variants have a gearbox and explicit physical shift policy without omitted or phantom variants',()=>{
  const actual=Object.entries(Evolution.VARIANTS).flatMap(([vehicleId,variants])=>variants.map(v=>({vehicleId,variantId:v.id})));
  assert.equal(actual.length,53);assert.deepEqual(Object.keys(Profiles.PROFILES).sort(),actual.map(v=>v.variantId).sort());
  const counts={};
  for(const identity of actual){
    const p=Profiles.resolve(identity);assert.equal(p.vehicleId,identity.vehicleId);assert.equal(p.variantId,identity.variantId);
    counts[p.transmissionType]=(counts[p.transmissionType]||0)+1;
    assert.ok(p.shiftModel);assert.ok(Object.isFrozen(p.shiftModel));
    assert.ok(Number.isFinite(p.shiftModel.upshiftDurationS)&&p.shiftModel.upshiftDurationS>=0);
    assert.ok(p.shiftModel.torqueRetention>=0&&p.shiftModel.torqueRetention<=1);
    for(const id of p.sourceIds)assert.ok(Profiles.SOURCES[id],id+' is a real specification source');
  }
  assert.deepEqual(counts,{AT:35,EV:6,IVT:2,DCT:5,MT:5});
});

test('manual and DCT timing and torque values stay inside the requested assumption ranges and cannot be mistaken for ratio verification',()=>{
  for(const p of Object.values(Profiles.PROFILES)){
    const s=p.shiftModel;
    if(['MT','DCT','AT'].includes(p.transmissionType)){
      assert.equal(s.assumed,true);assert.equal(s.status,'estimated');assert.ok(p.estimatedFields.includes('shiftModel'));
      assert.ok(!p.verifiedFields.includes('shiftModel'));assert.ok(!(p.referenceFields||[]).includes('shiftModel'));
    }
    if(p.transmissionType==='MT'){
      assert.equal(s.family,'manual');assert.equal(s.upshiftDurationS,.45);assert.equal(s.torqueRetention,0);
      assert.ok(s.upshiftDurationS>=.35&&s.upshiftDurationS<=.55);
    }
    if(p.transmissionType==='DCT'){
      assert.equal(s.family,'dual-clutch');assert.equal(s.upshiftDurationS,.12);assert.equal(s.torqueRetention,.85);
      assert.ok(s.upshiftDurationS>=.08&&s.upshiftDurationS<=.15);assert.ok(s.torqueRetention>=.70&&s.torqueRetention<=.95);
    }
  }
  assert.equal(Profiles.PROFILES['gr86-2.4-rz-mt'].ratioStatus,'verified-exact-market');
  assert.equal(Profiles.PROFILES['bmw-m2-3.0t-dct'].ratioStatus,'verified-exact-market');
  assert.equal(Profiles.PROFILES['avante-n-2.0t-dct'].ratioStatus,'reference-market');
});

test('ZF 8HP51, conventional automatic and stepped hybrid policies preserve their distinct identities',()=>{
  const supra=Profiles.PROFILES['supra-3.0t-rz'],gr86=Profiles.PROFILES['gr86-2.4-rz-at'];
  assert.equal(supra.transmissionType,'AT');assert.equal(supra.transmissionFamily,'ZF 8HP51');
  assert.equal(supra.shiftModel.calibration,'zf-8hp51');assert.equal(supra.shiftModel.upshiftDurationS,.16);assert.equal(supra.shiftModel.torqueRetention,.80);
  assert.equal(gr86.transmissionType,'AT');assert.equal(gr86.shiftModel.calibration,'general-automatic');
  assert.equal(gr86.shiftModel.upshiftDurationS,.25);assert.equal(gr86.shiftModel.torqueRetention,.65);
  const hybrid=Profiles.PROFILES['carnival-1.6heV'];
  assert.equal(hybrid.gearCount,6);assert.equal(hybrid.transmissionType,'AT');assert.equal(hybrid.shiftModel.family,'hybrid-step');
  assert.equal(hybrid.shiftModel.assumed,true,'HEV torque fill is not a measured control map');
  assert.equal(Profiles.PROFILES['carnival-3.5'].shiftModel.family,'torque-converter');
});

test('IVT, electric and unknown profiles do not invent stepped shift events, clutch gaps or ratio identities',()=>{
  for(const p of Object.values(Profiles.PROFILES).filter(p=>['IVT','EV'].includes(p.transmissionType))){
    assert.equal(p.gearCount,null);assert.equal(p.shiftModel.status,'not-applicable');
    assert.equal(p.shiftModel.upshiftDurationS,0);assert.equal(p.shiftModel.torqueRetention,1);
    assert.ok(!p.estimatedFields.includes('shiftModel'));
  }
  for(const car of [{vehicleId:'supra',variantId:'missing'},{entrant:{vehicleId:'gr86'}}]){
    const p=Profiles.resolve(car);assert.equal(p.transmissionType,'unknown');assert.equal(p.gearCount,null);
    assert.equal(p.shiftModel.status,'unavailable');assert.equal(p.shiftModel.upshiftDurationS,0);assert.equal(p.shiftModel.torqueRetention,1);
  }
  assert.equal(Profiles.resolve('porter2').transmissionType,'AT');
  assert.equal(Profiles.resolve('carnival').shiftModel.family,'hybrid-step');
  assert.equal(Profiles.resolve('gr86').shiftModel.family,'manual');
});
