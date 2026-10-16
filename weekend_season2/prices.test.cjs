'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const P = require('./prices.js');

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
  assert.equal(P.COVERAGE.usesRegionalMultipliers,false);
});

test('all genders can select every service for the same quoted amount and source', () => {
  for(const province of ['seoul','busan','sejong','gyeonggi'])for(const id of ['haircut','haircut_men','haircut_women','perm','dye','culture']){
    const expected=P.quote({province,gender:'man'},id,25000);
    for(const gender of ['woman','other','unspecified',null])assert.deepEqual(P.quote({province,gender},id,25000),expected);
  }
  assert.equal(P.COVERAGE.usesGender,false);
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

test('Seoul evening culture fee includes the explicitly optional equipment rental', () => {
  const q=P.quote({province:'seoul'},'culture',10000),c=q.conversion;
  assert.deepEqual(c,{tuitionTotal:120000,materialsTotal:0,materialsEstimated:false,equipmentRentalTotal:24000,rentalOptional:true,sessions:6,total:144000,rounding:'nearest-won'});
  assert.equal(q.amount,24000);
  assert.equal(c.total,c.tuitionTotal+c.materialsTotal+c.equipmentRentalTotal);
  assert.equal(q.amount,Math.round(c.total/c.sessions));
  assert.match(q.note,/실제 1회 등록 가격이 아닙니다/);
  assert.match(q.note,/개인 도구/);
});

test('Busan evening course keeps estimated material cost and documented 11 sessions separate', () => {
  const q=P.quote({province:'busan'},'culture',10000),c=q.conversion;
  assert.equal(c.tuitionTotal,19250);assert.equal(c.materialsTotal,30000);
  assert.equal(c.materialsEstimated,true);assert.equal(c.sessions,11);assert.equal(c.total,49250);
  assert.equal(q.amount,4477);assert.equal(q.amount,Math.round(c.total/c.sessions));
  assert.equal(c.total-q.amount*c.sessions,3);
  assert.match(q.note,/예상 재료비/);assert.match(q.note,/3원 차이/);
  const source=P.SOURCES.find(s=>s.id===q.sourceId);
  assert.match(source.schedule,/화요일 19:00/);
  assert.equal(source.observedAt,'2026-10-06/2026-12-15');
});

test('legacy and unrelated activities preserve supplied game cost without service inference', () => {
  for(const id of ['haircut','walk','pt','medical','constructor','__proto__']){
    const q=P.quote({province:'busan',gender:'woman'},id,12345);
    assert.equal(q.amount,12345);assert.equal(q.basis,'game-estimate');assert.equal(q.sourceId,null);
  }
  assert.equal(P.quote(null,'walk',0).amount,0);
  assert.match(P.quote({province:'seoul'},'haircut',25000).note,/자동 선택하지/);
});

test('every observed quote resolves to a dated first-party source and uncovered prices remain explicit', () => {
  assert.equal(new Set(P.SOURCES.map(s=>s.id)).size,P.SOURCES.length);
  for(const source of P.SOURCES){
    assert.ok(new URL(source.url).protocol==='https:');
    assert.equal(source.verifiedOn,'2026-10-17');assert.ok(source.observedAt);assert.ok(source.note);
  }
  for(const row of P.LOCAL_ROWS){
    const source=P.SOURCES.find(s=>s.id===row.sourceId);
    assert.ok(source);assert.equal(source.provinceId,row.provinceId);
  }
  assert.deepEqual(P.COVERAGE.localExamples,{perm:['busan'],dye:['busan'],culture:['seoul','busan']});
  assert.match(P.COVERAGE.note,/地域|지역 물가 차이/);
});

test('invalid or fractional fallback costs are rejected before entering the won ledger', () => {
  for(const cost of [-1,1.2,NaN,Infinity,'10000',null,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>P.quote({province:'seoul'},'haircut_men',cost),RangeError);
  }
  assert.equal(P.quote({},'walk',Number.MAX_SAFE_INTEGER).amount,Number.MAX_SAFE_INTEGER);
});

test('browser UMD is deterministic offline and public observations cannot be mutated', () => {
  const ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('./prices.js'),'utf8'),ctx);
  assert.equal(ctx.S2Prices.quote({province:'busan'},'culture',10000).amount,4477);
  assert.throws(()=>{P.CUT_ROWS[0].haircut_men=0;},TypeError);
  assert.throws(()=>{P.quote({province:'busan'},'culture',10000).conversion.sessions=1;},TypeError);
  assert.equal(P.quote({province:'seoul'},'haircut_men',20000).amount,13308);
});
