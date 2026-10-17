'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const B=require('./child-living-costs.js'),L=require('./lifecycle-economy.js'),D=require('./data.js'),E=require('./engine.js'),F=require('./finance.js'),S=require('./storage.js');
function config(province,ages,extra={}){return {...D.DEFAULT_CONFIG,age:42,role:'worker',province,subregionId:'',maritalStatus:'married',children:ages.length,childAge:ages.length?'school':'none',childProfiles:ages.map(age=>({age,gender:'woman',militaryStatus:'none'})),...extra};}
const cost=c=>B.calculate(c,6000000,L.minimumLiving(L.household(c).size));
test('regional source preserves all-student observations and child-count marginals separately',()=>{
 assert.equal(Object.keys(B.ROWS).length,18);assert.deepEqual(B.ROWS.seoul,[663000,601000,664000,767000]);assert.deepEqual(B.ROWS.jeonnam,[309000,307000,336000,285000]);assert.deepEqual(B.CHILD_COUNT_MEANS,[0,518000,474000,358000]);assert.equal(B.SOURCE.year,2025);assert.match(B.MODEL.note,/실제 생활물가가 아닙니다/);
});
test('same income and region spend more for 0..6 school children, with a lower per-child amount for larger families',()=>{
 for(const province of L.PROVINCES){let previous=0;
  for(let n=0;n<=6;n++){const c=config(province,Array(n).fill(9)),r=cost(c);assert.ok(r.total>previous||n===0);assert.equal(r.childLiving,r.amounts.reduce((a,b)=>a+b,0));previous=r.total;}
 }
 const one=cost(config('seoul',[9])),two=cost(config('seoul',[9,9]));assert.ok(two.amounts[0]<one.amounts[0]);assert.ok(two.childLiving>one.childLiving);assert.equal(cost(config('seoul',[])).childLiving,0);
});
test('child age boundaries, school tiers and military absence select the intended monthly costs',()=>{
 const ages=[0,2,3,6,7,12,13,15,16,18,19,49];
 const values=ages.map(age=>cost(config('unspecified',[age])).childLiving);
 assert.deepEqual(values.slice(0,4),[150000,150000,200000,200000]);assert.equal(values[4],Math.round(433000*518/458));assert.equal(values[4],values[5]);assert.equal(values[6],Math.round(461000*518/458));assert.equal(values[8],Math.round(499000*518/458));assert.equal(values[9],values[8]);assert.deepEqual(values.slice(-2),[0,0]);
 assert.equal(cost(config('seoul',[18],{childProfiles:[{age:18,gender:'man',militaryStatus:'serving'}]})).childLiving,0);
});
test('region and municipality change child spending at the same household income, without gender dependence',()=>{
 for(const age of [1,4,9,14,17])assert.ok(cost(config('seoul',[age])).childLiving>cost(config('jeonnam',[age])).childLiving);
 const gangnam=config('seoul',[9],{subregionId:'11680'}),gangbuk=config('seoul',[9],{subregionId:'11305'});assert.ok(cost(gangnam).childLiving>cost(gangbuk).childLiving);assert.equal(cost(gangnam).coreLiving,cost(gangbuk).coreLiving);
 assert.deepEqual(cost(gangnam),cost({...gangnam,gender:'man',childProfiles:[{age:9,gender:'man',militaryStatus:'none'}]}));
});
test('new household bills include child costs once, preserve support and survive saving',()=>{
 const c=config('jeju',[1,9]);c.generationSeed=403;D.assignLifeEconomy(c,{preserveTenure:true});assert.deepEqual(E.validateConfig(c),[]);
 const l=c.economicProfile.livingCosts;assert.equal(c.fixedCosts,l.coreLiving+l.childLiving);assert.ok(c.salary+c.externalAllowance-c.fixedCosts-F.housingCosts(c).total>=c.personalBudget+c.economicProfile.monthlyReserve);
 const state=E.create(c);E.advance(state);const bills=state.finance.ledger.filter(t=>t.type==='fixed-cost');assert.equal(bills.length,1);assert.equal(bills[0].livingCosts,l.total);assert.equal(bills[0].amount,l.total+F.housingCosts(c).total);
 const restored=S.parse(S.serialize(state));assert.ok(restored.ok,restored.reason);assert.deepEqual(restored.state.finance,state.finance);assert.deepEqual(restored.state.config.economicProfile,state.config.economicProfile);
});
test('invalid snapshots and active family drift are rejected; manual values keep historical evidence',()=>{
 const c=config('seoul',[4,9],{subregionId:'11680'});c.generationSeed=409;D.assignLifeEconomy(c,{preserveTenure:true});
 for(const mutate of [p=>p.livingCosts.childLiving++,p=>p.livingCosts.amounts[0]++,p=>p.livingCosts.children[0].age=14,p=>p.livingCosts.subregionId='11305',p=>p.livingCosts.provinceId='toString',p=>p.livingCosts=null,p=>delete p.livingCosts]){
  const p=structuredClone(c.economicProfile);mutate(p);assert.ok(L.validateProfile(p,c).length);
 }
 assert.ok(E.validateConfig({...c,childProfiles:[{age:5,gender:'woman',militaryStatus:'none'},c.childProfiles[1]]}).length);
 const manual={...c,fixedCosts:100000,economicProfile:{...c.economicProfile,active:false},incomeOrigin:{...c.incomeOrigin,kind:'custom'}};assert.deepEqual(E.validateConfig(manual),[]);
});
test('published v6 household budgets without the new snapshot import unchanged',()=>{
 const raw=fs.readFileSync(path.join(__dirname,'fixtures/v6-young-parent.json'),'utf8'),old=JSON.parse(raw).state,result=S.parse(raw);assert.ok(result.ok,result.reason);
 assert.equal(old.config.economicProfile.livingCosts,undefined);assert.deepEqual(result.state.config.economicProfile,old.config.economicProfile);assert.equal(result.state.config.fixedCosts,old.config.fixedCosts);assert.deepEqual(result.state.finance,old.finance);assert.deepEqual(result.state.log,old.log);
});
test('historical military absence still requires a plausible serving age',()=>{
 const c=config('seoul',[0,24],{childProfiles:[{age:0,militaryStatus:'serving'},{age:24,militaryStatus:'none'}]}),h=L.household(c),r=cost(c);
 assert.ok(B.validate(r,6000000,L.minimumLiving(h.size),h).length);
});
