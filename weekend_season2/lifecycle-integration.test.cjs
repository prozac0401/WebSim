'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('./data.js'),E=require('./engine.js'),F=require('./finance.js'),S=require('./storage.js');
function finish(s){for(let i=0;i<80&&s.phase!=='finished';i++){const r=E.advanceAutomatic(s,{decisions:'auto'});assert.ok(r.ok,r.reason);const loaded=S.parse(S.serialize(s));assert.ok(loaded.ok,loaded.reason);}assert.equal(s.phase,'finished');return E.getSummary(s);}
function adapted(seed,patch){const c={...D.generateLife(seed).config,...patch};if(Object.hasOwn(patch,'province')&&!Object.hasOwn(patch,'subregionId'))c.subregionId=D.sampleSubregion(seed,c.province);D.assignLifeEconomy(c,{preserveTenure:true});assert.deepEqual(E.validateConfig(c),[]);return c;}

test('the reported young single graduate and two-child parents retain usable budgets',()=>{
  for(const province of ['gyeongbuk','seoul','jeju']){
    const graduate=adapted(65702,{age:26,role:'graduate',province,maritalStatus:'single',children:0,childAge:'none',childProfiles:[],housing:'studio',housingTenure:'rent'});
    assert.equal(graduate.salary,0);assert.equal(graduate.incomeOrigin.householdContributionMonthly,0);
    assert.ok(graduate.incomeOrigin.studySupportMonthly>=800000&&graduate.incomeOrigin.studySupportMonthly<=2200000);
    for(const maritalStatus of ['divorced','widowed']){
      const c=adapted(169,{age:35,gender:'woman',role:'caregiver',province,maritalStatus,children:2,childAge:'school',childProfiles:[{age:7,gender:'man',militaryStatus:'none'},{age:10,gender:'woman',militaryStatus:'none'}],housing:'apartment',housingTenure:'rent'});
      const p=c.economicProfile;assert.equal(p.household.size,3);assert.equal(c.incomeOrigin.householdContributionMonthly,0);
      assert.ok(c.fixedCosts>=1714892);assert.ok(c.personalBudget>=150000);
      assert.ok(c.salary+c.externalAllowance-c.fixedCosts-F.housingCosts(c).total-c.personalBudget>=100000);
      assert.equal(F.housingCosts(c).total%100000,0);
    }
  }
});

test('monthly rent, precise interest and maintenance charge once, including arrears recovery',()=>{
  const c={...D.DEFAULT_CONFIG,startCash:0,salary:0,externalAllowance:0,fixedCosts:100000,housingTenure:'rent',monthlyRent:400000,housingLoanPrincipal:12345678,housingLoanRateBps:437,housingMaintenance:155042};
  const f=F.create(c),cost=F.monthlyCosts(c);F.beginDay(f,'2026-01-01',c);F.endDay(f,'2026-01-01',c);
  assert.equal(f.ledger.filter(x=>x.type==='fixed-cost').length,1);assert.equal(f.fixedArrears,cost.total);
  assert.equal(F.summary(f,c).housingMaintenance,155042);
  F.beginDay(f,'2026-01-02',c);assert.ok(F.addEarnedPay(f,'2026-01-02',2000000,'보상',{reference:'lifecycle-recovery'}).ok);F.endDay(f,'2026-01-02',c);
  F.beginDay(f,'2026-02-01',c);F.endDay(f,'2026-02-01',c);
  const result=F.summary(f,c);assert.equal(result.consumption,cost.total*2);assert.equal(result.housingMaintenance,155042*2);assert.equal(result.unpaidDebt,0);
  assert.equal(f.ledger.filter(x=>x.type==='fixed-arrears-payment').length,1);
});

test('published v5 extreme incomes import without rebasing history and finish the year',()=>{
  for(const name of ['v5-high-graduate.json','v5-low-parent.json']){
    const text=fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8'),old=JSON.parse(text).state,r=S.parse(text);assert.ok(r.ok,r.reason);
    for(const key of ['finance','rng','log','plan','rules','stats','pendingEvent','queue','artifacts'])assert.deepEqual(r.state[key],old[key],name+' '+key);
    for(const key of ['salary','externalAllowance','fixedCosts','personalBudget','startCash','monthlyRent','housingLoanPrincipal','housingLoanRateBps'])assert.equal(r.state.config[key],old.config[key]);
    assert.equal(r.state.config.economicProfile,null);assert.equal(r.state.config.housingMaintenance,0);
    const summary=finish(r.state);assert.equal(summary.daysPlayed,365);assert.equal(summary.finance.housingMaintenance,0);
    assert.deepEqual(summary.log,r.state.log);
  }
});

test('active generated provenance cannot be removed or swapped with another household',()=>{
  const c=D.generateLife(65702).config;
  for(const key of ['housingOrigin','incomeOrigin','economicProfile']){const bad={...c,[key]:null};assert.ok(E.validateConfig(bad).length,key);}
  const another=adapted(23,{province:'seoul'});
  assert.ok(E.validateConfig({...c,housingOrigin:another.housingOrigin}).length);
  const manual={...c,province:'seoul',economicProfile:{...c.economicProfile,active:false},incomeOrigin:{...c.incomeOrigin,kind:'custom'}};
  assert.deepEqual(E.validateConfig(manual),[],'manual editing preserves original evidence without presenting it as current');
  const s=E.create(c);s.config.housingOrigin=another.housingOrigin;assert.ok(S.validate(s).length);
});

test('all four roles complete the year with twelve housing charges and exact income totals',()=>{
  for(const [seed,role] of ['worker','seeker','graduate','caregiver'].entries()){
    const c=adapted(seed,{role}),s=E.create(c),summary=finish(s),bills=s.finance.ledger.filter(t=>t.type==='fixed-cost');
    assert.equal(summary.daysPlayed,365);assert.equal(bills.length,12);
    assert.ok(bills.every(t=>t.housingMaintenance===c.housingMaintenance));
    assert.equal(summary.finance.housingCosts,F.housingCosts(c).total*12);
    assert.equal(summary.finance.income,s.finance.ledger.reduce((n,t)=>n+t.income,0));
    assert.deepEqual(summary.log,s.log);assert.equal(summary.finance.debt,summary.finance.unpaidDebt+c.housingLoanPrincipal);
  }
});
