const test=require('node:test'),assert=require('node:assert/strict');
const L=require('./lifecycle-economy.js');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function config(extra={}){return {age:32,role:'worker',province:'gyeongbuk',maritalStatus:'single',children:0,childAge:'none',childProfiles:[],housingTenure:'own',monthlyRent:0,housingLoanPrincipal:0,housingLoanRateBps:0,housingMaintenance:100000,...extra};}
function life(c,seed=1){const s=L.sampleIncome(c,rng(seed));Object.assign(c,{salary:s.salary,externalAllowance:s.externalAllowance,incomeOrigin:s.origin},L.completeBudget(c,s,rng(seed+17)));return c;}
test('published source percentages retain all regions and age/size marginals without invented joint counts',()=>{
 assert.equal(L.RAW_INCOME_ROWS.filter(r=>r.group==='행정구역').length,17);
 assert.equal(L.RAW_INCOME_ROWS.filter(r=>r.group==='가구원수').length,6);
 assert.deepEqual(L.RAW_INCOME_ROWS[0].percentages,[.3,10.1,9.7,11.5,11.4,7.9,9.7,13.8,4.7,9.1,10.3]);
 assert.equal(L.RAW_INCOME_ROWS.find(r=>r.label==='3인').percentages[0],null);
 assert.equal(L.AGE_WAGES.rows['25_29'].medianManwon,284);
 assert.deepEqual(L.SINGLE_PARENT.rows.all.weights,[.7,18.7,36.5,44.1]);
 assert.match(L.MODEL.note,/실제 교차분포/);
});
test('combined weights follow the declared bounded marginal formula and sampled bands follow those weights',()=>{
 const c=config({age:26,province:'seoul'}),actual=L.distribution(c).weights;
 const rows=L.RAW_INCOME_ROWS,norm=xs=>{let total=xs.reduce((a,b)=>a+(b||0),0);return xs.map(x=>(x||0)/total);};
 const n=norm(rows[0].percentages),r=norm(rows.find(x=>x.label==='서울').percentages),a=norm(rows.find(x=>x.label==='20~29세').percentages),b=norm(rows.find(x=>x.label==='1인').percentages);
 const expected=norm(b.map((v,i)=>v*Math.sqrt(Math.max(.25,Math.min(4,r[i]/n[i])))*Math.sqrt(Math.max(.25,Math.min(4,a[i]/n[i])))));
 expected.forEach((v,i)=>assert.ok(Math.abs(v-actual[i])<1e-14));
 const N=10000,counts=Array(11).fill(0);
 for(let i=0;i<N;i++){let calls=0;const s=L.sampleIncome(c,()=>calls++===0?(i+.5)/N:.5);counts[Number(s.origin.bandId.split('-')[1])]++;}
 counts.forEach((count,i)=>assert.ok(Math.abs(count/N-actual[i])<2/N));
});
test('region and family size alter the distribution, while gender does not',()=>{
 const mean=c=>L.distribution(c).weights.reduce((sum,w,i)=>sum+w*(L.BANDS[i].min+L.BANDS[i].max)/2,0);
 assert.ok(mean(config({province:'sejong'}))>mean(config({province:'busan'})));
 assert.ok(mean(config({maritalStatus:'married',children:2,childProfiles:[{age:8},{age:10}]}))>mean(config()));
 assert.deepEqual(L.sampleIncome(config({gender:'woman'}),rng(31)),L.sampleIncome(config({gender:'man'}),rng(31)));
});
test('household distinguishes minors, adult children and military absence without inventing roommate income',()=>{
 const c=config({maritalStatus:'divorced',housing:'shared',children:2,childProfiles:[{age:16},{age:23,militaryStatus:'serving'}]});
 assert.deepEqual(L.household(c),{size:3,type:'single-parent',dependentChildren:1,adultChildren:1,awayChildren:1,partnerAdults:0});
 assert.equal(L.household({...c,childProfiles:[{age:19},{age:23}]}).type,'adult-family');
 assert.equal(L.household(config({housing:'shared'})).size,1);
});
test('single parent income uses the published parent sample instead of the general three-person household',()=>{
 const c=config({maritalStatus:'divorced',children:2,childProfiles:[{age:6},{age:9}]}),d=L.distribution(c);
 assert.equal(d.parentBand,'under40');assert.ok(d.weights[1]>0);
 assert.equal(L.distribution({...c,role:'seeker'}).parentBand,'notEmployed');
 const s=L.sampleIncome(c,rng(44));assert.ok(s.origin.sourceIds.includes('single-parent-income-2024'));
 assert.equal(L.sampleIncome({...c,childProfiles:[{age:19},{age:20}]},rng(44)).origin.parentBand,null);
});
test('high-tail Gyeongbuk graduate has bounded personal support, with family resources identified separately',()=>{
 for(const maritalStatus of ['single','married']){
  const c=config({age:26,role:'graduate',maritalStatus}),s=L.sampleIncome(c,()=>.999999);
  assert.ok(s.origin.sampleHouseholdMonthly>11000000);
  assert.ok(s.origin.studySupportMonthly<=2200000);
  assert.equal(s.salary,0);assert.equal(s.externalAllowance,s.origin.studySupportMonthly+s.origin.householdContributionMonthly);
  assert.ok(s.externalAllowance<=(maritalStatus==='married'?6200000:2200000));
  assert.deepEqual(L.validateOrigin(s.origin),[]);
 }
});
test('nonworking households never invent income from minor or serving children and cap adult contributions',()=>{
 for(const role of ['graduate','seeker','caregiver']){
  const c=config({role,maritalStatus:'divorced',children:2,childProfiles:[{age:6},{age:9}]}),minor=L.sampleIncome(c,()=>.999999);
  assert.equal(minor.origin.householdContributionMonthly,0);
  assert.equal(L.sampleIncome(config({role}),()=>.999999).origin.householdContributionMonthly,0);
  const serving=L.sampleIncome({...c,childProfiles:[{age:20,militaryStatus:'serving'},{age:23,militaryStatus:'serving'}]},()=>.999999);
  assert.equal(serving.origin.householdContributionMonthly,0);
  const adult=L.sampleIncome({...c,childProfiles:[{age:20},{age:23}]},()=>.999999);
  assert.equal(adult.origin.householdContributionMonthly,3000000);assert.deepEqual(L.validateOrigin(adult.origin),[]);
  const forged=structuredClone(minor.origin);forged.householdContributionMonthly=100000;forged.baseMonthly+=100000;assert.ok(L.validateOrigin(forged).length);
 }
});
test('ordinary attendance workers retain source draws but receive the explicit game floor and no military-child income',()=>{
 const zero=L.sampleIncome(config(),()=>0);assert.equal(zero.origin.sampleHouseholdMonthly,0);assert.equal(zero.salary,1900000);assert.deepEqual(zero.origin.adjustments,['worker-attendance-income-floor']);assert.deepEqual(L.validateOrigin(zero.origin),[]);
 const c=config({children:1,childProfiles:[{age:23,militaryStatus:'serving'}],maritalStatus:'divorced'}),s=L.sampleIncome(c,()=>.999999);
 assert.equal(s.origin.householdContributionMonthly,0);assert.equal(s.salary,s.origin.sampleHouseholdMonthly);
 const forged=structuredClone(zero.origin);forged.personalEarnedMonthly=1899999;forged.baseMonthly=1899999;assert.ok(L.validateOrigin(forged).length);
 const D=require('./data.js'),repro=D.generateLife(48).config;repro.role='worker';D.assignLifeEconomy(repro,{preserveTenure:true});assert.equal(repro.salary,1900000);assert.ok(repro.incomeOrigin.sampleHouseholdMonthly<500000);
});
test('near-zero source income parent receives only the game shortfall, covering living, housing, leisure and reserve',()=>{
 const c=config({role:'seeker',children:2,maritalStatus:'divorced',childProfiles:[{age:0},{age:2}],housingTenure:'rent',monthlyRent:650000,housingLoanPrincipal:10000000,housingLoanRateBps:450});
 const s=L.sampleIncome(c,()=>0);Object.assign(c,{salary:s.salary,externalAllowance:s.externalAllowance,incomeOrigin:s.origin},L.completeBudget(c,s,()=>.5));
 const p=c.economicProfile;
 assert.equal(p.minimumLiving,1714892);assert.equal(p.housingTotal,787500);
 assert.equal(p.baseMonthly,1);assert.equal(p.gameSupport,1714892+p.livingCosts.childLiving+787500+150000+100000-p.baseMonthly);
 assert.equal(c.salary+c.externalAllowance-c.fixedCosts-p.housingTotal,p.personalBudget+p.monthlyReserve);
 assert.equal(c.externalAllowance,p.baseExternalAllowance+p.gameSupport);assert.deepEqual(L.validateProfile(p,c),[]);
});
test('family floors and deterministic budgets hold across all roles, provinces and ages',()=>{
 for(const role of ['worker','seeker','graduate','caregiver'])for(const province of L.PROVINCES)for(const age of [22,26,38,55,69,90]){
  const c=config({role,province,age,maritalStatus:'married',children:2,childProfiles:[{age:1},{age:3}],housingTenure:'rent',monthlyRent:550000});
  const one=life(structuredClone(c),age*773),two=life(structuredClone(c),age*773);
  assert.deepEqual(one,two);assert.deepEqual(L.validateOrigin(one.incomeOrigin),[]);assert.deepEqual(L.validateProfile(one.economicProfile,one),[]);
  assert.ok(one.salary+one.externalAllowance-one.fixedCosts-one.economicProfile.housingTotal>=one.personalBudget+one.economicProfile.monthlyReserve);
 }
});
test('strict validation rejects changed source weights, mismatched role amounts and forged support',()=>{
 const c=life(config({role:'graduate'}),76);
 for(const mutate of [o=>o.weights[0]+=.05,o=>o.bandId='toString',o=>o.sourceIds=['minimum-wage-2026'],o=>o.studySupportMonthly=12000000,o=>o.personalSupportMonthly=10,o=>o.ageBand='70~79세']){
  const origin=structuredClone(c.incomeOrigin);mutate(origin);assert.ok(L.validateOrigin(origin).length);
 }
 const profile=structuredClone(c.economicProfile);profile.gameSupport++;assert.ok(L.validateProfile(profile,c).length);
 assert.ok(L.validateProfile(c.economicProfile,{...c,salary:c.salary+1}).length);
 assert.deepEqual(L.validateProfile({...c.economicProfile,active:false},{...c,salary:1}),[]);
});
test('employment ends personal support and preserves only household contribution plus the remaining game shortfall',()=>{
 const c=life(config({role:'seeker',children:2,childProfiles:[{age:6},{age:9}],maritalStatus:'divorced'}),12);
 const result=L.employmentIncome(c,1500000),p=c.economicProfile;
 assert.equal(result.householdContributionMonthly,c.incomeOrigin.householdContributionMonthly);
 assert.equal(result.externalAllowance,result.householdContributionMonthly+result.gameSupport);
 assert.ok(result.salary+result.externalAllowance>=c.fixedCosts+p.housingTotal+c.personalBudget+p.monthlyReserve);
 const wealthy=L.employmentIncome(c,15000000);assert.equal(wealthy.gameSupport,0);
 assert.deepEqual(L.employmentIncome(config({externalAllowance:500000}),2800000),{salary:2800000,externalAllowance:0});
});
test('employment respects explicitly edited allowances and does not revive old household support',()=>{
 const original=life(config({role:'seeker',maritalStatus:'married'}),80);
 assert.ok(original.incomeOrigin.householdContributionMonthly>0);
 for(const externalAllowance of [0,123000]){
  const manual=structuredClone(original);manual.externalAllowance=externalAllowance;manual.economicProfile.active=false;manual.incomeOrigin.kind='custom';
  assert.deepEqual(L.employmentIncome(manual,2400000),{salary:2400000,externalAllowance});
  manual.incomeOrigin.kind='lifecycle';assert.deepEqual(L.employmentIncome(manual,2400000),{salary:2400000,externalAllowance});
  manual.economicProfile.active=true;manual.incomeOrigin.kind='custom';assert.deepEqual(L.employmentIncome(manual,2400000),{salary:2400000,externalAllowance});
 }
});
test('future season keeps the disclosed snapshot and rejects invalid random values without silent fallback',()=>{
 assert.deepEqual(L.sampleIncome(config({year:2026}),rng(90)),L.sampleIncome(config({year:2100}),rng(90)));
 for(const r of [-1,1,NaN])assert.throws(()=>L.sampleIncome(config(),()=>r));
 const c=config(),s=L.sampleIncome(c,rng(30));assert.throws(()=>L.completeBudget({...c,role:'graduate'},s,rng(30)));
});
test('reported generation cases and four roles complete a year with paid hobbies and save recovery',()=>{
 const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js');
 const fixtures=[...[65702,5098,17401].map(seed=>({seed})),...['worker','seeker','graduate','caregiver'].map((role,seed)=>({seed,role}))];
 for(const {seed,role} of fixtures){
  const c=D.generateLife(seed).config;if(role){c.role=role;D.assignLifeEconomy(c,{preserveTenure:true});}c.preferences=['pottery','music','read'];let s=E.create(c),calls=0;
  while(s.phase!=='finished'&&calls++<400){const result=E.advanceAutomatic(s);assert.ok(result.ok,seed+': '+result.reason);assert.deepEqual(S.validate(s),[],seed+' '+s.date);if(calls%10===0){const saved=S.parse(S.serialize(s));assert.ok(saved.ok,saved.reason);s=saved.state;}}
  assert.equal(E.getSummary(s).daysPlayed,365);assert.ok(s.log.some(l=>l.type==='activity'&&['pottery','music'].includes(l.activityId)));
  assert.equal(s.finance.arrears,0);assert.equal(s.finance.fixedArrears,0);
 }
});
