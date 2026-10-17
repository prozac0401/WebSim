const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const H=require('./housing-data.js');
function rng(seed) {return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function make(patch={},seed=1,size=1,options={preserveTenure:true}) {
  return H.sample({province:'seoul',age:26,housing:'studio',housingTenure:'rent',salary:1000000,...patch},{size},rng(seed),options);
}
test('market snapshots retain 17 provinces and national data, original units and narrow denominator',()=>{
  assert.equal(H.RAW_MARKET.length,18);
  assert.deepEqual(H.MARKET.seoul,{id:'seoul',label:'서울',allRentManwon:79.8,allRentPer3_3M2Manwon:8.5,apartmentRentManwon:176.8,apartmentRentPer3_3M2Manwon:12.5,allSalePer3_3M2Manwon:4521,apartmentSalePer3_3M2Manwon:5211,allJeonsePer3_3M2Manwon:2393,apartmentJeonsePer3_3M2Manwon:2751});
  assert.deepEqual(Object.values(H.MARKET).map(r=>r.allRentManwon),[79.8,53.3,56.5,68.3,47.6,46.4,53.3,65,63.3,50.1,51.4,51.3,42.1,48.3,45.6,45.9,76.9,61.5]);
  assert.match(H.SOURCES[0].rentalFilter,/26.7배/);
  assert.match(H.SOURCES[0].rentalFilter,/환산하거나 합산하지 않음/);
  assert.match(H.SOURCES[0].scope,/오피스텔은 포함하지 않음/);
  assert.equal(H.SOURCES[0].dataRetrievedByAuthor,'2026-09-01');
  assert.deepEqual(H.TENURE_REGION.jeju,[58.5,34.4,7]);
  assert.deepEqual(H.TENURE_AGE['20s'],[5.3,90,4.7]);
  assert.deepEqual(H.AREA_SIZE,[46.8,74.9,80.3,86.3,91.2,96.2]);
});
test('module has browser UMD global without requests or dependencies',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./housing-data.js'),'utf8'),context);
  assert.equal(context.S2HousingData.MODEL.id,H.MODEL.id);
  assert.equal(typeof context.S2HousingData.sample,'function');
});
test('new generated housing keeps original references and rounds actual monthly cost to 100000 won',()=>{
  for (let seed=0;seed<400;seed++) for (const tenure of ['own','rent','jeonse']) {
    const s=make({province:H.RAW_MARKET[seed%17][0],housingTenure:tenure,age:18+seed%80,housing:seed%2?'apartment':'studio'},seed,1+seed%8);
    assert.deepEqual(H.validateOrigin(s.housingOrigin),[],JSON.stringify(s));
    assert.equal(s.monthlyRent%100000,0);
    const interest=Math.round(s.housingLoanPrincipal*s.housingLoanRateBps/120000);
    assert.equal((s.monthlyRent+interest+s.housingMaintenance)%100000,0);
    assert.ok(s.housingMaintenance>=50000);
    assert.equal(s.housingOrigin.interest,interest);
    assert.ok(s.housingLoanPrincipal<=1e10);
    if (tenure==='rent') {
      assert.ok(s.monthlyRent>=300000);
      assert.ok(s.housingOrigin.deposit/s.monthlyRent<=26.7);
    } else assert.equal(s.monthlyRent,0);
  }
});
test('low income and high income receive same housing under same household/seed',()=>{
  const low=make({salary:0,externalAllowance:0,startCash:0,gender:'woman',role:'jobseeker'},65702,3);
  const high=make({salary:100000000,externalAllowance:1000000,startCash:900000000,gender:'man',role:'worker'},65702,3);
  assert.deepEqual(low,high);
  assert.ok(low.monthlyRent>130000);
  const regional=make({province:'gyeongbuk',salary:99999999},65702,3);
  assert.ok(regional.monthlyRent<high.monthlyRent);
  assert.equal(regional.housingOrigin.marketReference.rentPer3_3M2Won,32000);
});
test('sampling is reproducible, pure, consumes fixed draws and never deposits imaginary loan cash',()=>{
  const config={province:'busan',age:39,housing:'apartment',housingTenure:'jeonse',salary:2000000,startCash:1234567};
  const household={size:4,type:'couple-children',dependentChildren:2};const before=structuredClone({config,household});
  assert.deepEqual(H.sample(config,household,rng(321)),H.sample(config,household,rng(321)));
  assert.deepEqual({config,household},before);
  let draws=0;const patch=H.sample(config,household,()=>{draws++;return .5;});
  assert.equal(draws,8);assert.equal(Object.hasOwn(patch,'startCash'),false);assert.equal(Object.hasOwn(patch,'salary'),false);
});
test('region changes market reference while province unspecified is labelled national fallback',()=>{
  assert.ok(make({province:'seoul'},2).monthlyRent>make({province:'gyeongbuk'},2).monthlyRent);
  const unknown=make({province:'unspecified'},2);
  assert.equal(unknown.housingOrigin.provinceId,'unspecified');
  assert.equal(unknown.housingOrigin.referenceRegionId,'national');
  assert.deepEqual(H.validateOrigin(unknown.housingOrigin),[]);
  assert.equal(make({year:2100},3).housingOrigin.period,'2026-01~2026-07');
});
test('age influences size/contract synthesis rather than a direct rental discount',()=>{
  const a=make({age:22},7),b=make({age:69},7);
  assert.deepEqual(a.housingOrigin.marketReference,b.housingOrigin.marketReference);
  assert.equal(a.housingOrigin.ageBand,'20s');assert.equal(b.housingOrigin.ageBand,'60s');
  assert.ok(a.housingOrigin.areaM2<=b.housingOrigin.areaM2);
  const young=Array.from({length:200},(_,i)=>make({age:25},i,1,{})).filter(x=>x.housingTenure==='own').length;
  const older=Array.from({length:200},(_,i)=>make({age:65},i,1,{})).filter(x=>x.housingTenure==='own').length;
  assert.ok(older>young);
});
test('family size replaces an unsuitable studio; shared housing has explicit household expense share only',()=>{
  const family=make({},4,5);assert.equal(family.housing,'apartment');
  assert.match(family.housingOrigin.housingAdjustment,/3인 이상/);
  assert.ok(family.housingOrigin.areaM2>=66);
  const shared=make({housing:'shared'},4,2);
  assert.equal(shared.housingOrigin.share,.65);assert.match(shared.housingOrigin.note,/동거인의 소득을 추가하지 않음/);
  assert.equal(shared.housingOrigin.marketReference.scope,'all');
  assert.equal(Object.hasOwn(shared,'externalAllowance'),false);
});
test('preserveTenure respects all three explicit contracts and zero loan has zero interest',()=>{
  for (const t of ['own','rent','jeonse']) assert.equal(make({housingTenure:t},8).housingTenure,t);
  const s=H.sample({province:'seoul',age:80,housing:'apartment',housingTenure:'own'},{size:1},()=>0,{preserveTenure:true});
  assert.equal(s.housingLoanPrincipal,0);assert.equal(s.housingLoanRateBps,0);assert.equal(s.housingOrigin.interest,0);
  assert.equal(s.monthlyRent,0);assert.ok(s.housingMaintenance>0);
});
test('origin validation rejects changed sources, incoherent balances and prototype keys without throwing',()=>{
  const original=make({},50).housingOrigin;
  const patches=[{model:'unknown'},{sourceIds:['molit-housing-2024','molit-housing-2024']},{marketReference:null},{referenceRegionId:'__proto__'},{provinceId:'constructor'},{ageBand:'toString'},{deposit:NaN},{areaM2:0},{rateBps:3000},{total:original.total+1},{housingMaintenance:0},{loanPrincipal:original.loanPrincipal+1},{share:.1},{monthlyRent:130000},{note:null}];
  for (const patch of patches) assert.ok(H.validateOrigin({...original,...patch}).length>0,JSON.stringify(patch));
  for (const invalid of [null,[],0,'a',{},false]) assert.ok(H.validateOrigin(invalid).length>0);
});
test('input guard refuses nonadult ages, impossible household sizes and invalid RNG',()=>{
  assert.throws(()=>make({age:17}),RangeError);
  assert.throws(()=>make({},1,0),RangeError);
  assert.throws(()=>make({},1,13),RangeError);
  for (const bad of [1,-.1,NaN,Infinity]) assert.throws(()=>H.sample({age:25},{size:1},()=>bad),RangeError);
});
