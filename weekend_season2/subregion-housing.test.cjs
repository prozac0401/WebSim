'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const H=require('./housing-data.js'),M=require('./subregion-housing-data.js'),I=require('./subregion-income-data.js'),D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js');
const config={province:'seoul',subregionId:'11680',age:35,housing:'apartment',housingTenure:'rent'};
function sample(changes={},size=2){let calls=0;const value=H.sample({...config,...changes},{size},()=>{calls++;return .65;},{preserveTenure:true});assert.equal(calls,8);return value;}

test('municipal housing retains all56 legal districts and exact completed-quarter source cells',()=>{
 assert.equal(M.ROWS.length,56);assert.equal(new Set(M.ROWS.map(row=>row.id)).size,56);
 assert.equal(M.forProvince('seoul').length,25);assert.equal(M.forProvince('gyeonggi').length,31);
 assert.deepEqual(M.ROWS.map(({id,provinceId,name})=>({id,provinceId,name})),I.ROWS.map(({id,provinceId,name})=>({id,provinceId,name})));
 for(const row of M.ROWS)for(const key of ['salePer3_3M2Manwon','jeonsePer3_3M2Manwon'])assert.ok(Number.isInteger(row[key])&&row[key]>0,row.name);
 for(const [id,sale,jeonse]of [['11680',11324,3695],['11320',2876,1622],['41290',9463,3939],['41800',734,634]])assert.deepEqual([M.byId(id).salePer3_3M2Manwon,M.byId(id).jeonsePer3_3M2Manwon],[sale,jeonse]);
 assert.deepEqual(M.PROVINCE_REFERENCE,{seoul:{salePer3_3M2Manwon:5403,jeonsePer3_3M2Manwon:2801},gyeonggi:{salePer3_3M2Manwon:2685,jeonsePer3_3M2Manwon:1631}});
 assert.equal(M.SOURCE.period,'2026-Q2');assert.match(M.SOURCE.scope,/월세나 비아파트 단가를 관측한 자료가 아니다/);
 const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./subregion-housing-data.js'),'utf8'),context);assert.equal(JSON.stringify(context.S2SubregionHousingData.ROWS),JSON.stringify(M.ROWS));
});

test('apartment sales and jeonse use exact local observations while rent is explicitly a provincial proxy',()=>{
 const origin=sample().housingOrigin,ref=origin.marketReference,m=origin.municipalModel;
 assert.equal(ref.salePer3_3M2Won,113240000);assert.equal(ref.jeonsePer3_3M2Won,36950000);
 assert.equal(ref.rentPerHomeWon,Math.round(1768000*3695/2801));assert.equal(ref.rentPer3_3M2Won,Math.round(125000*3695/2801));
 assert.equal(m.sourcePeriod,'2026-Q2');assert.equal(m.saleRatio,11324/5403);assert.equal(m.jeonseRatio,3695/2801);
 assert.equal(m.saleBasis,'observed-apartment');assert.equal(m.jeonseBasis,'observed-apartment');assert.equal(m.rentBasis,'provincial-rent-jeonse-ratio-proxy');
 assert.match(origin.note,/관측된 시군구 월세가 아닙니다/);assert.deepEqual(H.validateOrigin(origin),[]);
});

test('studio and shared housing apply separate sale and jeonse ratios without claiming apartment values are observed for them',()=>{
 for(const housing of ['studio','shared']){
  const origin=sample({housing},1).housingOrigin,ref=origin.marketReference,m=origin.municipalModel;
  assert.equal(ref.scope,'all');assert.equal(ref.salePer3_3M2Won,Math.round(45210000*11324/5403));assert.equal(ref.jeonsePer3_3M2Won,Math.round(23930000*3695/2801));
  assert.equal(ref.rentPerHomeWon,Math.round(798000*3695/2801));assert.equal(ref.rentPer3_3M2Won,Math.round(85000*3695/2801));
  assert.equal(m.saleBasis,'provincial-all-home-apartment-ratio-proxy');assert.equal(m.jeonseBasis,m.saleBasis);assert.deepEqual(H.validateOrigin(origin),[]);
 }
});

test('matched households change housing prices by district while area, loan draws and wealth-independent contract choices stay fixed',()=>{
 for(const [province,high,low]of [['seoul','11680','11320'],['gyeonggi','41290','41800']])for(const housingTenure of ['own','rent','jeonse']){
  const a=sample({province,subregionId:high,housingTenure}),b=sample({province,subregionId:low,housingTenure});
  for(const key of ['areaM2','loanRatio','rateBps','housingType','housingTenure'])assert.equal(a.housingOrigin[key],b.housingOrigin[key],key);
  const key=housingTenure==='own'?'propertyValue':housingTenure==='jeonse'?'deposit':'monthlyRent';assert.ok(a.housingOrigin[key]>b.housingOrigin[key],province+'/'+housingTenure);
  assert.deepEqual(sample({province,subregionId:high,housingTenure,salary:0,gender:'woman'}),sample({province,subregionId:high,housingTenure,salary:99999999,gender:'man'}));
 }
});

test('every municipality and contract type produces valid rounded bills with exactly the same eight random draws',()=>{
 for(const row of M.ROWS)for(const housing of ['apartment','studio','shared'])for(const housingTenure of ['own','rent','jeonse']){
  const result=sample({province:row.provinceId,subregionId:row.id,housing,housingTenure},housing==='studio'?1:4),o=result.housingOrigin;
  assert.deepEqual(H.validateOrigin(o),[],row.id+'/'+housing+'/'+housingTenure);
  assert.equal(o.subregionId,row.id);assert.equal(o.total%100000,0);assert.equal(o.monthlyRent%100000,0);assert.equal(o.interest,Math.round(o.loanPrincipal*o.rateBps/120000));
 }
});

test('mismatched provinces and edited municipal source values, ratios or claimed rental observations are rejected',()=>{
 for(const changes of [{province:'gyeonggi',subregionId:'11680'},{province:'seoul',subregionId:'41290'},{province:'busan',subregionId:'11680'},{subregionId:'99999'}])assert.throws(()=>sample(changes));
 const original=sample().housingOrigin;
 const changes=[o=>{o.subregionId='11320';},o=>{o.provinceId='gyeonggi';o.referenceRegionId='gyeonggi';},o=>{o.municipalModel.sourcePeriod='2026-Q3';},o=>{o.municipalModel.saleRatio++;},o=>{o.municipalModel.apartmentJeonsePer3_3M2Manwon++;},o=>{o.municipalModel.rentBasis='observed-municipal-rent';},o=>{o.marketReference.rentPerHomeWon++;},o=>{delete o.municipalModel;},o=>{delete o.subregionId;},o=>{o.municipalModel=null;}];
 for(const change of changes){const bad=structuredClone(original);change(bad);assert.ok(H.validateOrigin(bad).length);}
});

test('missing municipal IDs retain exact provincial origins and published saves keep their existing housing and history',()=>{
 const provincial=sample({subregionId:undefined});assert.equal(Object.hasOwn(provincial.housingOrigin,'municipalModel'),false);assert.equal(Object.hasOwn(provincial.housingOrigin,'subregionId'),false);
 for(const subregionId of [undefined,null,''])assert.deepEqual(sample({subregionId}),provincial);
 assert.equal(provincial.housingOrigin.marketReference.salePer3_3M2Won,52110000);assert.equal(provincial.housingOrigin.marketReference.jeonsePer3_3M2Won,27510000);assert.deepEqual(H.validateOrigin(provincial.housingOrigin),[]);
 const text=fs.readFileSync(path.join(__dirname,'fixtures/v6-young-parent.json'),'utf8'),old=JSON.parse(text).state,loaded=S.parse(text);assert.ok(loaded.ok,loaded.reason);
 for(const key of ['finance','log','rng','plan','pendingEvent'])assert.deepEqual(loaded.state[key],old[key]);
 assert.deepEqual(loaded.state.config.housingOrigin,old.config.housingOrigin);assert.deepEqual(H.validateOrigin(old.config.housingOrigin),[]);
});

test('a real municipal life saves and resumes with the same current bills and housing provenance',()=>{
 const c={...D.DEFAULT_CONFIG,...config};D.assignLifeEconomy(c,{preserveTenure:true});const state=E.create(c);E.advance(state);
 const before=structuredClone(state),loaded=S.parse(S.serialize(state));assert.ok(loaded.ok,loaded.reason);assert.deepEqual(loaded.state,before);
 assert.equal(loaded.state.config.housingOrigin.subregionId,'11680');const bill=state.finance.ledger.find(row=>row.type==='fixed-cost');assert.equal(bill.rent,c.monthlyRent);assert.equal(bill.loanInterest,Math.round(c.housingLoanPrincipal*c.housingLoanRateBps/120000));
});
