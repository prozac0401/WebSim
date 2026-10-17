const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./subregion-income-data.js'),L=require('./lifecycle-economy.js');
function config(extra={}){return {age:38,role:'worker',province:'seoul',maritalStatus:'single',childProfiles:[],housingTenure:'rent',monthlyRent:700000,housingLoanPrincipal:10000000,housingLoanRateBps:400,housingMaintenance:100000,...extra};}
function random(values){let count=0;const fn=()=>{assert.ok(count<values.length,'no extra random draw');return values[count++];};fn.count=()=>count;return fn;}
function life(c,values=[.8,.5,.5]){const sample=L.sampleIncome(c,random(values));Object.assign(c,{salary:sample.salary,externalAllowance:sample.externalAllowance,incomeOrigin:sample.origin},L.completeBudget(c,sample,()=>.5));return c;}

test('official address-based taxable wage table preserves all 56 municipal counts and published province totals',()=>{
 assert.equal(M.ROWS.length,56);assert.equal(new Set(M.ROWS.map(r=>r.id)).size,56);
 for(const [province,count] of [['seoul',25],['gyeonggi',31]]){
  const rows=M.forProvince(province);assert.equal(rows.length,count);
  assert.equal(rows.reduce((sum,r)=>sum+r.count,0),M.PROVINCE_TOTALS[province].count);
  assert.ok(Math.abs(rows.reduce((sum,r)=>sum+r.grossMillionWon,0)-M.PROVINCE_TOTALS[province].grossMillionWon)<=1);
  for(const row of rows){assert.match(row.id,/^\d{5}$/);assert.ok(Number.isSafeInteger(row.count)&&row.count>0);assert.ok(Number.isSafeInteger(row.grossMillionWon)&&row.grossMillionWon>0);assert.ok(Object.isFrozen(row));}
 }
 assert.equal(M.SOURCE.year,2023);assert.equal(M.SOURCE.tableId,'DT_133001N_4215');
 assert.match(M.SOURCE.measure,/과세대상근로소득/);assert.match(M.SOURCE.geography,/주소지/);
 assert.match(M.SOURCE.scope,/전체 주민·가구의 소득이나 월 실수령액이 아니다/);
 assert.match(M.MODEL.note,/게임용 합성/);assert.match(M.SOURCE.notes.join(' '),/인구 분포가 아니다/);
 assert.ok(Object.isFrozen(M.ROWS));assert.ok(Object.isFrozen(M.PROVINCE_TOTALS.seoul));
});

test('reference samples retain their exact official cells and same-year province relative factors',()=>{
 for(const [id,province,name,count,grossMillionWon,mean] of [
  ['11680','seoul','강남구',238504,20320151,85198366],['11320','seoul','도봉구',118976,4316725,36282317],
  ['41290','gyeonggi','과천시',37802,2535300,67067880],['41800','gyeonggi','연천군',14547,503805,34632914]
 ]){
  assert.deepEqual(M.byId(id),{id,provinceId:province,name,count,grossMillionWon});
  assert.equal(Math.round(M.meanAnnual(id)),mean);
  const total=M.PROVINCE_TOTALS[province];assert.equal(M.relativeFactor(id,province),(grossMillionWon/count)/(total.grossMillionWon/total.count));
 }
 for(const invalid of [null,undefined,11680,'toString','__proto__','11681']){assert.equal(M.byId(invalid),null);assert.equal(M.meanAnnual(invalid),null);}
 assert.equal(M.relativeFactor('11680','gyeonggi'),null);assert.deepEqual(M.forProvince('toString'),[]);
});

test('municipal wage-gap adjustment preserves the original household bracket and random sequence',()=>{
 const values=[.85,.5,.4],baselineRandom=random(values),baseline=L.sampleIncome(config(),baselineRandom);
 assert.equal(baselineRandom.count(),3);assert.equal(baseline.origin.subregionIncome,undefined);
 for(const id of ['11680','11320']){
  const draws=random(values),sample=L.sampleIncome(config({subregionId:id}),draws),o=sample.origin,m=o.subregionIncome;
  assert.equal(draws.count(),3);assert.equal(o.sampleHouseholdMonthly,baseline.origin.sampleHouseholdMonthly);
  assert.equal(o.bandId,baseline.origin.bandId);assert.deepEqual(o.weights,baseline.origin.weights);
  assert.equal(m.baseHouseholdMonthly,o.sampleHouseholdMonthly);
  assert.equal(m.adjustedHouseholdMonthly,Math.round(o.sampleHouseholdMonthly*M.relativeFactor(id,'seoul')));
  assert.equal(o.baseMonthly,m.adjustedHouseholdMonthly);assert.equal(sample.salary,o.baseMonthly);
  assert.deepEqual(o.adjustments,[]);assert.deepEqual(L.validateOrigin(JSON.parse(JSON.stringify(o))),[]);
 }
 const high=L.sampleIncome(config({subregionId:'11650'}),()=>.999999);
 assert.ok(high.origin.baseMonthly>L.MODEL.topHouseholdMonthly);assert.deepEqual(L.validateOrigin(high.origin),[]);
 assert.deepEqual(L.sampleIncome(config({subregionId:''}),random(values)),baseline);
});

test('all municipal role allocations and support budgets use adjusted household input with original caps',()=>{
 for(const row of M.ROWS)for(const role of ['worker','seeker','graduate','caregiver'])for(const values of [[0,0,.5],[.6,.4,.5],[.999999,.999999,.999999]]){
  const c=life(config({province:row.provinceId,subregionId:row.id,role,maritalStatus:'married',childProfiles:[{age:8},{age:23,militaryStatus:'serving'}]}),values),o=c.incomeOrigin,p=c.economicProfile;
  assert.deepEqual(L.validateOrigin(o),[],`${row.name} ${role}`);assert.deepEqual(L.validateProfile(p,c),[],`${row.name} ${role}`);
  assert.equal(p.baseMonthly,o.baseMonthly);assert.equal(c.salary+c.externalAllowance,p.totalMonthly);
  assert.ok(p.totalMonthly-p.fixedCosts-p.housingTotal>=p.personalBudget+p.monthlyReserve);
  if(role==='graduate'){
   assert.ok(o.studySupportMonthly>=800000&&o.studySupportMonthly<=2200000);
   assert.equal(o.householdContributionMonthly,Math.max(0,Math.min(4000000,o.subregionIncome.adjustedHouseholdMonthly-o.studySupportMonthly)));
  }
  if(role==='seeker'||role==='caregiver')assert.ok(o.householdContributionMonthly<=4000000);
 }
});

test('municipal provenance rejects forged sources, years, geography, factors and adjusted amounts',()=>{
 const c=life(config({subregionId:'11680'})),origin=c.incomeOrigin;
 for(const mutate of [m=>m.modelId='fake',m=>m.sourceId='fake',m=>m.year=2024,m=>m.subregionId='11320',m=>m.provinceId='gyeonggi',m=>m.factor+=.001,m=>m.baseHouseholdMonthly++,m=>m.adjustedHouseholdMonthly++,m=>m.extra='unverified']){
  const bad=structuredClone(origin);mutate(bad.subregionIncome);assert.ok(L.validateOrigin(bad).length);
 }
 for(const value of [null,[],false,'11680',{}]){const bad=structuredClone(origin);bad.subregionIncome=value;assert.ok(L.validateOrigin(bad).length);}
 const noSource=structuredClone(origin);noSource.sourceIds=noSource.sourceIds.filter(id=>id!==M.SOURCE.id);assert.ok(L.validateOrigin(noSource).length);
 const sourceOnly=structuredClone(origin);delete sourceOnly.subregionIncome;assert.ok(L.validateOrigin(sourceOnly).length);
});

test('invalid or cross-province municipality cannot consume draws or produce a stale current budget',()=>{
 for(const extra of [{subregionId:'11680',province:'gyeonggi'},{subregionId:'41800',province:'seoul'},{subregionId:11680},{subregionId:null},{subregionId:'toString'}]){
  assert.throws(()=>L.sampleIncome(config(extra),()=>{assert.fail('invalid geography must fail before RNG');}),/시도와 시군구/);
 }
 const c=config({subregionId:'11680'}),s=L.sampleIncome(c,()=>.8);
 assert.throws(()=>L.completeBudget({...c,subregionId:'11320'},s,()=>.5),/생성 근거/);
 assert.throws(()=>L.completeBudget({...c,subregionId:undefined},s,()=>.5),/생성 근거/);
 Object.assign(c,{salary:s.salary,incomeOrigin:s.origin},L.completeBudget(c,s,()=>.5));
 assert.ok(L.validateProfile(c.economicProfile,{...c,subregionId:'11320'}).length);
 assert.ok(L.validateProfile(c.economicProfile,{...c,housingOrigin:{subregionId:'11320'}}).length);
 assert.deepEqual(L.validateProfile(c.economicProfile,{...c,housingOrigin:{subregionId:'11680'}}),[]);
 // Inactive custom provenance is historical evidence and need not match a moved household.
 assert.deepEqual(L.validateProfile({...c.economicProfile,active:false},{...c,subregionId:'11320',housingOrigin:{subregionId:'11320'}}),[]);
});

test('old origins remain untouched and valid without new municipality fields',()=>{
 const c=life(config()),before=JSON.stringify(c);
 assert.equal(c.incomeOrigin.subregionIncome,undefined);assert.ok(!c.incomeOrigin.sourceIds.includes(M.SOURCE.id));
 assert.deepEqual(L.validateOrigin(c.incomeOrigin),[]);assert.deepEqual(L.validateProfile(c.economicProfile,c),[]);
 assert.equal(JSON.stringify(c),before);
 assert.ok(L.validateProfile(c.economicProfile,{...c,subregionId:'11680'}).length);
 assert.deepEqual(L.validateProfile({...c.economicProfile,active:false},{...c,subregionId:'11680'}),[]);
});
