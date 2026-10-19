'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const P = require('./prices.js');
const path=require('node:path'),A=require('./activities.js'),D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js');

test('official adult-cut observations cover 16 regions and preserve the source month', () => {
  assert.equal(P.CUT_ROWS.length,16);
  assert.equal(new Set(P.CUT_ROWS.map(r=>r.provinceId)).size,16);
  assert.deepEqual(P.COVERAGE.cutMissing,['sejong']);
  assert.equal(P.COVERAGE.cutObservedAt,'2026-09');
  const anchors = {seoul:[13308,24462],busan:[11286,19614],incheon:[13833,25667],gyeonggi:[14483,19724],jeju:[13000,24375]};
  for(const [province,pair] of Object.entries(anchors)){
    assert.equal(P.quote({province},'haircut_men',20000).amount,pair[0]);
    assert.equal(P.quote({province},'haircut_women',25000).amount,pair[1]);
  }
  for(const row of P.CUT_ROWS)for(const id of ['haircut_men','haircut_women']){
    const q=P.quote({province:row.provinceId},id,1);
    assert.equal(q.basis,'regional-survey');
    assert.equal(q.sourceId,'kca-personal-2026-09');
    assert.equal(q.observedAt,'2026-09');
    assert.ok(Number.isSafeInteger(q.amount)&&q.amount>0);
  }
});

test('distinct source labels do not merge Gwangju and Jeonnam observations', () => {
  const a=P.quote({province:'gwangju'},'haircut_men',20000);
  const b=P.quote({province:'jeonnam'},'haircut_men',20000);
  assert.equal(a.amount,15200);assert.equal(b.amount,15556);
  assert.equal(a.sourceLabel,'전남광주(광주)');assert.equal(b.sourceLabel,'전남광주(전남)');
});

test('Sejong and unspecified observations use the original estimate, not invented regional factors', () => {
  for(const province of ['sejong','unspecified','constructor','__proto__','not-a-province']){
    const q=P.quote({province},'haircut_women',25317);
    assert.equal(q.amount,25317);assert.equal(q.basis,'game-estimate');
    assert.equal(q.sourceId,null);assert.equal(q.observedAt,null);
  }
  assert.match(P.quote({province:'sejong'},'haircut_men',20000).note,/자료가 확인되지/);
  assert.equal(P.COVERAGE.usesRegionalMultipliers,true);
});

test('canonical haircut uses gender while explicit saved service IDs retain their original service prices',()=>{
  for(const row of P.CUT_ROWS)for(const [gender,key]of [['man','haircut_men'],['male','haircut_men'],['woman','haircut_women'],['female','haircut_women']]){
    const q=P.quote({province:row.provinceId,gender},'haircut',25000);assert.equal(q.amount,row[key]);assert.equal(q.service,P.SOURCES[0].services[key]);
  }
  for(const province of ['sejong','unspecified'])for(const gender of ['man','male','woman','female']){
    const q=P.quote({province,gender},'haircut',25317);assert.equal(q.amount,['man','male'].includes(gender)?20000:25000);assert.equal(q.basis,'game-estimate');assert.equal(q.sourceId,null);assert.match(q.note,/게임 기본값/);
  }
  for(const province of ['seoul','busan','sejong','gyeonggi'])for(const id of ['haircut_men','haircut_women','perm','dye','culture']){
    const expected=P.quote({province,gender:'man'},id,25000);
    for(const gender of ['woman','other','unspecified',null])assert.deepEqual(P.quote({province,gender},id,25000),expected);
  }
  assert.equal(P.COVERAGE.usesGender,true);
});

test('Busan perm and dye are exact single-store menu examples rather than regional means', () => {
  const perm=P.quote({province:'busan'},'perm',70000),dye=P.quote({province:'busan'},'dye',60000);
  assert.equal(perm.amount,60000);assert.equal(perm.service,'스타일펌');
  assert.equal(dye.amount,45000);assert.equal(dye.service,'밀본 염색');
  for(const q of [perm,dye]){
    assert.equal(q.basis,'local-example');assert.equal(q.observedAt,'2026-09');
    assert.match(q.note,/부산 평균이 아닙니다/);assert.match(q.note,/길이/);
  }
  assert.equal(P.quote({province:'seoul'},'perm',70000).amount,70000);
  assert.equal(P.quote({province:'gyeongnam'},'dye',60000).basis,'game-estimate');
});

test('incomparable Seoul course remains an attributed reference without overriding culture prices', () => {
  const source=P.SOURCES.find(s=>s.id==='seoul-hyundai-evening-2026q4'),c=source.conversion,q=P.quote({province:'seoul'},'culture',10000);
  assert.deepEqual(c,{tuitionTotal:120000,materialsTotal:0,materialsEstimated:false,equipmentRentalTotal:24000,rentalOptional:true,sessions:6,total:144000,rounding:'nearest-won'});
  assert.equal(q.amount,10536);assert.equal(q.basis,'regional-game-estimate');assert.equal(q.conversion,undefined);assert.equal(source.referenceOnly,true);
  assert.equal(c.total,c.tuitionTotal+c.materialsTotal+c.equipmentRentalTotal);
  assert.equal(Math.round(c.total/c.sessions),24000);
  assert.match(source.note,/실제 1회 등록 가격이 아닙니다/);
  assert.match(source.note,/현재 문화 활동 요금에는 적용하지/);
});

test('Busan course keeps estimated materials as reference and uses the shared leisure model', () => {
  const source=P.SOURCES.find(s=>s.id==='busan-evening-sewing-2026q4'),c=source.conversion,q=P.quote({province:'busan'},'culture',10000);
  assert.equal(c.tuitionTotal,19250);assert.equal(c.materialsTotal,30000);
  assert.equal(c.materialsEstimated,true);assert.equal(c.sessions,11);assert.equal(c.total,49250);
  assert.equal(q.amount,9933);assert.equal(q.basis,'regional-game-estimate');assert.equal(q.conversion,undefined);assert.equal(source.referenceOnly,true);
  assert.equal(Math.round(c.total/c.sessions),4477);assert.equal(c.total-4477*c.sessions,3);
  assert.match(source.note,/예상 재료비/);assert.match(source.note,/3원 차이/);
  assert.match(source.schedule,/화요일 19:00/);
  assert.equal(source.observedAt,'2026-10-06/2026-12-15');
});

test('unknown-gender haircut and unrelated activities preserve supplied game costs', () => {
  for(const id of ['haircut','medical','study','chores','care','constructor','__proto__']){
    const q=P.quote({province:'busan',gender:'unspecified'},id,12345);
    assert.equal(q.amount,12345);assert.equal(q.basis,'game-estimate');assert.equal(q.sourceId,null);
  }
  assert.equal(P.quote(null,'walk',0).amount,0);
  for(const gender of ['unspecified','other','nonbinary',null,undefined])assert.equal(P.quote({province:'seoul',gender},'haircut',25317).amount,25317);
  assert.match(P.quote({province:'seoul'},'haircut',25000).note,/성별이 지정되지/);
});

test('every observed quote resolves to a dated first-party source and uncovered prices remain explicit', () => {
  assert.equal(new Set(P.SOURCES.map(s=>s.id)).size,P.SOURCES.length);
  for(const source of P.SOURCES){
    assert.ok(new URL(source.url).protocol==='https:');
    assert.match(source.verifiedOn,/^2026-10-(17|19)$/);assert.ok(source.observedAt);assert.ok(source.note);
  }
  for(const row of P.LOCAL_ROWS){
    const source=P.SOURCES.find(s=>s.id===row.sourceId);
    assert.ok(source);assert.equal(source.provinceId,row.provinceId);
  }
  assert.deepEqual(P.COVERAGE.localExamples,{perm:['busan'],dye:['busan']});
  assert.match(P.COVERAGE.note,/지역 물가 차이/);
});

test('invalid or fractional fallback costs are rejected before entering the won ledger', () => {
  for(const cost of [-1,1.2,NaN,Infinity,'10000',null,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>P.quote({province:'seoul'},'haircut_men',cost),RangeError);
  }
  assert.equal(P.quote({},'walk',Number.MAX_SAFE_INTEGER).amount,Number.MAX_SAFE_INTEGER);
  assert.throws(()=>P.quote({province:'seoul'},'culture',Number.MAX_SAFE_INTEGER),RangeError);
});

test('browser UMD is deterministic offline and public observations cannot be mutated', () => {
  const ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('./prices.js'),'utf8'),ctx);
  assert.equal(ctx.S2Prices.quote({province:'busan'},'culture',10000).amount,9933);
  assert.throws(()=>{P.CUT_ROWS[0].haircut_men=0;},TypeError);
  assert.throws(()=>{P.DINING_ROWS[0].prices[0]=0;},TypeError);
  assert.throws(()=>{P.REGIONAL_MODEL.referenceMeans[0]=1;},TypeError);
  assert.equal(P.quote({province:'seoul'},'haircut_men',20000).amount,13308);
});

test('dining observations preserve standardized source units and equal-region reference means',()=>{
  assert.equal(P.DINING_ROWS.length,16);assert.equal(new Set(P.DINING_ROWS.map(r=>r.provinceId)).size,16);
  for(const row of P.DINING_ROWS){assert.equal(row.prices.length,8);assert.ok(row.prices.every(v=>Number.isSafeInteger(v)&&v>0));}
  const anchors={seoul:[12692,12000,8846,21321,7808,18269,10038,3923],busan:[12000,9686,8429,18175,7000,17429,8071,3571],gyeonggi:[10931,9945,8841,18166,7586,17690,9810,3786],jeonnam:[9778,9556,8278,19235,7167,16667,9222,2944]};
  for(const [id,prices]of Object.entries(anchors))assert.deepEqual(P.DINING_ROWS.find(r=>r.provinceId===id).prices,prices);
  assert.deepEqual(P.REGIONAL_MODEL.items[3],{id:'pork_200g',label:'삼겹살',unit:'200g 환산'});
  assert.deepEqual(P.REGIONAL_MODEL.referenceMeans,[10852.625,10330.1875,9091.5,17905.5625,7233.1875,16875,9070.875,3510.875]);
  const source=P.SOURCES.find(s=>s.id===P.REGIONAL_MODEL.sourceId);assert.equal(source.observedAt,'2026-09');assert.match(source.note,/품질/);assert.match(source.note,/가중 전국 평균이 아니며/);
  assert.deepEqual(P.COVERAGE.diningMissing,['sejong']);assert.match(P.REGIONAL_MODEL.note,/게임 계수/);assert.match(P.REGIONAL_MODEL.note,/소비자물가지수가 아니며/);
});

test('every paid leisure activity uses the disclosed regional factor and free activities stay free',()=>{
  const leisureIds=A.ACTIVITY_CATEGORIES.filter(c=>c.groupId==='want').flatMap(c=>c.activityIds);
  assert.deepEqual([...P.REGIONAL_MODEL.activityIds].sort(),[...leisureIds].sort());
  for(const row of P.DINING_ROWS){
    const ratios=row.prices.map((n,i)=>n/P.REGIONAL_MODEL.referenceMeans[i]),expected=Math.min(1.15,Math.max(.85,Math.sqrt(ratios.reduce((s,n)=>s+n,0)/8)));
    assert.equal(P.regionalFactor(row.provinceId),expected);
    for(const id of leisureIds){
      const a=A.ACTIVITY_MAP[id],q=P.quote({province:row.provinceId,subregionId:'11680'},id,a.cost);assert.equal(q.amount,Math.round(a.cost*expected));
      if(a.cost){assert.equal(q.basis,'regional-game-estimate');assert.equal(q.baseAmount,a.cost);assert.equal(q.regionalFactor,expected);assert.equal(q.regionalModelId,P.REGIONAL_MODEL.id);assert.equal(q.sourceId,P.REGIONAL_MODEL.sourceId);assert.equal(q.observedAt,'2026-09');}
    }
  }
  for(const [province,amount]of Object.entries({seoul:10536,busan:9933,incheon:9969,gyeonggi:10133,chungbuk:9697}))assert.equal(P.quote({province},'culture',10000).amount,amount);
});

test('missing leisure observations use the common game baseline without implying a measurement',()=>{
  for(const province of ['sejong','unspecified','constructor','__proto__','missing',undefined]){
    const q=P.quote({province},'pottery',45000);assert.equal(q.amount,45000);assert.equal(q.regionalFactor,1);assert.equal(q.baseAmount,45000);assert.equal(q.basis,'game-estimate');assert.equal(q.sourceId,null);assert.equal(q.observedAt,null);assert.match(q.note,/전국 공통 게임 기본값/);
  }
  assert.equal(P.regionalFactor('sejong'),1);assert.equal(P.regionalFactor(null),1);
});

test('pre-model culture and explicit haircut history imports exactly without repricing its ledger or RNG',()=>{
  const raw=fs.readFileSync(path.join(__dirname,'fixtures/v6-pre-regional-leisure.json'),'utf8'),old=JSON.parse(raw).state,loaded=S.parse(raw);
  assert.ok(loaded.ok,loaded.reason);assert.deepEqual(loaded.state,old);assert.deepEqual(S.parse(S.serialize(loaded.state)).state,old);
  const bills=loaded.state.finance.ledger.filter(t=>t.type==='purchase');assert.deepEqual(bills.map(t=>t.amount),[4477,11286]);
  assert.notEqual(D.activityPrice(old.config,'culture').amount,4477);assert.equal(D.activityPrice(old.config,'haircut_men').amount,11286);
  const before=structuredClone(loaded.state);for(const province of ['seoul','busan','sejong'])for(const id of P.REGIONAL_MODEL.activityIds)D.activityPrice({...loaded.state.config,province},id);
  assert.deepEqual(loaded.state,before);
});

test('regional prices drive plan affordability and actual payment while settled history stays fixed',()=>{
  const raw=fs.readFileSync(path.join(__dirname,'fixtures/v6-pre-regional-leisure.json'),'utf8'),loaded=S.parse(raw);assert.ok(loaded.ok,loaded.reason);
  const state=loaded.state,past=structuredClone(state.finance.ledger),pastLog=structuredClone(state.log),amount=D.activityPrice(state.config,'culture').amount;
  E.finishReview(state);const result=E.addPlan(state,{date:'2026-01-10',slot:'morning',activityId:'culture',payment:'cash'});assert.ok(result.ok,result.reason);
  for(let i=0;i<50&&state.phase!=='review';i++){if(state.phase==='event')E.choose(state,state.pendingEvent.choices[0].id);else E.advance(state);}
  assert.equal(state.phase,'review');assert.ok(state.finance.ledger.some(t=>t.date==='2026-01-10'&&t.type==='purchase'&&t.amount===amount));
  assert.deepEqual(state.finance.ledger.slice(0,past.length),past);assert.deepEqual(state.log.slice(0,pastLog.length),pastLog);assert.deepEqual(S.validate(state),[]);
  const config={...D.PRESETS[0].config,province:'seoul',gender:'man',children:0,childProfiles:[],salary:0,externalAllowance:0,fixedCosts:0,monthlyRent:0,housingMaintenance:0,startCash:100000,personalBudget:10000,preferences:[]};
  const tight=E.create(config),snapshot=structuredClone(tight),rejected=E.addPlan(tight,{date:'2026-01-03',slot:'morning',activityId:'culture',payment:'cash'});
  assert.equal(rejected.ok,false);assert.deepEqual(tight,snapshot,'a10536원 plan cannot fit a10000원 budget and rejection must be pure');
});
