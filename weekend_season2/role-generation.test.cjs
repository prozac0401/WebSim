'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js');

test('new-life graduate eligibility includes age46 and excludes every older age without changing other roles',()=>{
  assert.equal(D.ROLE_MODEL.graduateMaxAge,46);
  assert.equal(D.ROLE_MODEL.graduateEligibleProbability,.02);
  for(let age=18;age<=100;age++){
    for(const role of ['worker','seeker','caregiver'])assert.equal(D.roleAvailableForNewLife(role,age),true);
    assert.equal(D.roleAvailableForNewLife('graduate',age),age<=46);
    assert.equal(D.sampleRole(age,()=>2/3)==='graduate',age<=46,'same draw respects the exact age boundary');
  }
  for(const age of [17,101,46.5,NaN]){
    assert.equal(D.roleAvailableForNewLife('graduate',age),false);
    assert.throws(()=>D.sampleRole(age,()=>.5));
  }
  assert.equal(D.roleAvailableForNewLife('unknown',46),false);
  for(const draw of [-.1,1,NaN])assert.throws(()=>D.sampleRole(46,()=>draw));
});

test('conditional role sampling gives graduates2percent and equal remaining weights, including zero graduate mass at47',()=>{
  for(const age of [22,46,47,100]){
    const counts={worker:0,seeker:0,graduate:0,caregiver:0};
    for(let i=0;i<30000;i++)counts[D.sampleRole(age,()=>(i+.5)/30000)]++;
    assert.deepEqual(counts,age<=46?{worker:9800,seeker:9800,graduate:600,caregiver:9800}:{worker:10000,seeker:10000,graduate:0,caregiver:10000});
  }
});

test('generated graduates are uncommon, age-bounded and available across all fictional household types',()=>{
  const counts={worker:0,seeker:0,graduate:0,caregiver:0},families=new Set();let eligible=0;
  const n=16384;
  for(let seed=0;seed<n;seed++){
    const life=D.generateLife(seed),c=life.config;
    counts[c.role]++;assert.equal(life.presetId,c.role);
    if(c.age<=46)eligible++;
    if(c.role==='graduate'){
      assert.ok(c.age<=46,'seed '+seed);
      families.add([c.maritalStatus,!!c.children].join(':'));
      assert.deepEqual(E.validateConfig(c),[]);
    }
  }
  assert.ok(counts.graduate/n>.007&&counts.graduate/n<.014,'overall graduate share stays near1percent, not the former25percent');
  assert.ok(Math.abs(counts.graduate/eligible-.02)<.004,'eligible-age graduates follow the2percent game weight');
  for(const role of ['worker','seeker','caregiver'])assert.ok(Math.abs(counts[role]/(n-counts.graduate)-1/3)<.015);
  assert.deepEqual([...families].sort(),['divorced:true','married:false','married:true','single:false']);
});

test('changing the role sampler leaves existing age, household, identity and illustration streams intact',()=>{
  // Snapshots from the preceding generator: no role-dependent money or housing.
  const fixtures=[
    {seed:0,age:29,gender:'man',maritalStatus:'single',children:0,childProfiles:[],careShare:45,region:'town',transport:'walk',province:'gyeongnam',personaName:'이동현',preferences:['culture','draw']},
    {seed:48,age:26,gender:'woman',maritalStatus:'single',children:0,childProfiles:[],careShare:45,region:'city',transport:'walk',province:'chungnam',personaName:'최윤서',preferences:['draw','study']},
    {seed:65702,age:26,gender:'woman',maritalStatus:'married',children:0,childProfiles:[],careShare:30,region:'city',transport:'walk',province:'gyeongbuk',personaName:'조서현',preferences:['culture','study']},
    {seed:4294967295,age:62,gender:'man',maritalStatus:'married',children:2,childProfiles:[{age:31,gender:'man',militaryStatus:'none'},{age:28,gender:'woman',militaryStatus:'none'}],careShare:60,region:'town',transport:'car',province:'seoul',personaName:'김종호',preferences:['read','culture']}
  ];
  for(const fixture of fixtures){
    const life=D.generateLife(fixture.seed),c=life.config;
    assert.deepEqual(Object.fromEntries(Object.keys(fixture).map(key=>[key,c[key]])),fixture);
    assert.deepEqual(D.generateLife(fixture.seed),life);
    const appearanceRandom=D.randomStream(fixture.seed,'appearance'),homeRandom=D.randomStream(fixture.seed,'home');
    for(const [key,values]of Object.entries({...D.APPEARANCE_OPTIONS,hairStyle:D.GENDER_HAIR_STYLES[c.gender]}))assert.equal(c.appearance[key],values[Math.floor(appearanceRandom()*values.length)]);
    for(const [key,values]of Object.entries(D.HOME_OPTIONS))assert.equal(c.homeStyle[key],values[Math.floor(homeRandom()*values.length)]);
  }
  const state=E.create(D.DEFAULT_CONFIG),before=structuredClone(state);
  for(let seed=0;seed<128;seed++)D.generateLife(seed);
  assert.deepEqual(state,before,'new-life rolls do not touch an existing life or its simulation streams');
});

test('older graduate lives remain valid and round-trip without rewriting their history or finances',()=>{
  for(const age of [46,47,80]){
    const state=E.create({...D.PRESETS.find(preset=>preset.id==='graduate').config,age});
    E.advance(state);const before=structuredClone(state),loaded=S.parse(S.serialize(state));
    assert.ok(loaded.ok,loaded.reason);assert.deepEqual(loaded.state,before);assert.deepEqual(state,before);
    assert.equal(loaded.state.config.role,'graduate');assert.equal(loaded.state.config.age,age);
  }
});
