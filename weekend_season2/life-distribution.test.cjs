'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('./data.js');
const E=require('./engine.js');
const S=require('./storage.js');

function envelope(state,version){let n=2166136261;const payload=JSON.stringify(state);for(let i=0;i<payload.length;i++){n^=payload.charCodeAt(i);n=Math.imul(n,16777619);}return JSON.stringify({format:S.FORMAT,version,checksum:(n>>>0).toString(16).padStart(8,'0'),state});}

test('residence sampler matches each observed population and the capital aggregate across 100000 seeds',()=>{
  const counts=Object.fromEntries(D.DEMOGRAPHICS.regions.map(r=>[r.id,0])),n=100000;
  for(let seed=0;seed<n;seed++)counts[D.sampleProvince(seed)]++;
  for(const row of D.DEMOGRAPHICS.regions){const expected=row.population/D.DEMOGRAPHICS.population.total;assert.ok(Math.abs(counts[row.id]/n-expected)<.004,`${row.id}: ${counts[row.id]/n} versus ${expected}`);}
  const capital=D.DEMOGRAPHICS.regions.filter(r=>r.capital).reduce((sum,r)=>sum+counts[r.id],0)/n;
  assert.ok(Math.abs(capital-D.DEMOGRAPHICS.population.capitalShare)<.005);
  assert.equal(Object.keys(counts).length,17,'capital is a label, not an eighteenth duplicate population');
});

test('weighted boundary draws use counts exactly and never select zero mass',()=>{
  const rows=[{id:'zero',n:0},{id:'a',n:3},{id:'b',n:7}];
  assert.equal(D.weightedPick(rows,r=>r.n,()=>0).id,'a');
  assert.equal(D.weightedPick(rows,r=>r.n,()=>.299999).id,'a');
  assert.equal(D.weightedPick(rows,r=>r.n,()=>.3).id,'b');
  assert.equal(D.weightedPick(rows,r=>r.n,()=>.999999).id,'b');
  for(const bad of [-.1,1,NaN])assert.throws(()=>D.weightedPick(rows,r=>r.n,()=>bad));
  assert.throws(()=>D.weightedPick([{n:0}],r=>r.n,()=>0));
  for(let seed=0;seed<1000;seed++)assert.ok(['seoul','incheon','gyeonggi'].includes(D.sampleProvince(seed,true)));
});

test('name, appearance, home and income streams are reproducible and independent of event RNG',()=>{
  const names=new Set(),faces=new Set(),hair=new Set(),rooms=new Set(),states=[];
  for(let seed=0;seed<500;seed++){
    const a=D.generateLife(seed),b=D.generateLife(seed);assert.deepEqual(a,b);assert.deepEqual(E.validateConfig(a.config),[]);
    names.add(a.name);faces.add(a.config.appearance.faceShape);hair.add(a.config.appearance.hairStyle);rooms.add(JSON.stringify(a.config.homeStyle));
    assert.ok(D.DEMOGRAPHICS.surnames.some(s=>D.DEMOGRAPHICS.names.some(n=>s.name+n.name===a.name)));
    assert.equal(a.config.province,D.sampleProvince(seed));
    if(seed<4)states.push(E.create(a.config));
  }
  assert.ok(names.size>200);assert.equal(faces.size,5);assert.equal(hair.size,10);assert.ok(rooms.size>100);
  for(const s of states){const rng={...s.rng},money={...s.finance};for(let i=0;i<30;i++)D.generateLife(i);assert.deepEqual(s.rng,rng);assert.deepEqual(s.finance,money);}
  assert.notDeepEqual(Array.from({length:10},D.randomStream(42,'home')),Array.from({length:10},D.randomStream(42,'income')));
});

test('income uses household regional distributions and lists each income source only once',()=>{
  for(let seed=0;seed<64;seed++){
    const c=D.generateLife(seed).config;
    const sampled=D.LIFECYCLE.sampleIncome(c,D.randomStream(seed,'lifecycle-income:'+c.province));
    assert.deepEqual(c.incomeOrigin,sampled.origin);
    assert.equal(c.salary,sampled.salary);
    assert.equal(c.externalAllowance,sampled.externalAllowance+c.economicProfile.gameSupport);
    assert.ok(Number.isSafeInteger(c.fixedCosts));assert.ok(c.personalBudget<=c.salary+c.externalAllowance-c.fixedCosts);
    const other={...c,gender:c.gender==='woman'?'man':'woman'};
    D.assignRegionalIncome(other);assert.equal(other.salary,c.salary);assert.equal(other.externalAllowance,c.externalAllowance);
  }
});

test('v2 saves keep finances, old appearances and unknown residence without retroactive resampling',()=>{
  const old=E.create(D.PRESETS[0].config);E.advance(old);old.version=2;
  for(const key of ['province','residenceOrigin','appearance','homeStyle','generationModel','incomeOrigin'])delete old.config[key];
  const before=structuredClone(old),result=S.parse(envelope(old,2));assert.ok(result.ok,result.reason);assert.equal(result.state.version,D.VERSION);
  for(const key of ['finance','rng','log','stats','date','phase','pendingEvent'])assert.deepEqual(result.state[key],before[key]);
  assert.equal(result.state.config.province,'unspecified');assert.equal(result.state.config.appearance,null);assert.equal(result.state.config.homeStyle,null);
  assert.equal(result.state.config.salary,before.config.salary);assert.equal(result.state.config.incomeOrigin,null);
  assert.ok(S.parse(S.serialize(result.state)).ok);
});

test('new generated identity and illustration survive saves, malformed categories do not',()=>{
  const state=E.create(D.generateLife(400).config),loaded=S.parse(S.serialize(state));assert.ok(loaded.ok,loaded.reason);assert.deepEqual(loaded.state.config,state.config);
  for(const [key,value]of [['incomeOrigin',{...state.config.incomeOrigin,baseMonthly:-1}],['incomeOrigin',{...state.config.incomeOrigin,weights:[]}],['incomeOrigin',{...state.config.incomeOrigin,sourceIds:['invented']}],['incomeOrigin',{...state.config.incomeOrigin,bandId:'invented'}],['incomeOrigin',{...state.config.incomeOrigin,provinceId:'capital'}],['incomeOrigin',{...state.config.incomeOrigin,personalEarnedMonthly:1}],['province','capital'],['residenceOrigin','invented'],['appearance',{...state.config.appearance,hairStyle:'script'}],['homeStyle',{...state.config.homeStyle,layout:'outside'}],['generationModel','unknown'],['incomeOrigin',{...state.config.incomeOrigin,sampleHouseholdMonthly:-1}],[ 'incomeOrigin',{...state.config.incomeOrigin,kind:'observed-caregiver'}]]){
    const bad=structuredClone(state);bad.config[key]=value;assert.ok(S.validate(bad).length,key);assert.equal(S.parse(envelope(bad,D.VERSION)).ok,false,key);
  }
});
