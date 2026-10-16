const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js'),Events=require('./events.js');
function envelope(state,version=state.version){const text=JSON.stringify(state);let n=2166136261;for(let i=0;i<text.length;i++){n^=text.charCodeAt(i);n=Math.imul(n,16777619);}return JSON.stringify({format:S.FORMAT,version,state,checksum:(n>>>0).toString(16).padStart(8,'0')});}

test('new lives include 50s, 60s, very young children, adult children and serving sons',()=>{
  const stages=new Set(),decades=new Set();let serving=0;
  for(let seed=0;seed<1600;seed++){
    const {config}=D.generateLife(seed);assert.deepEqual(E.validateConfig(config),[]);
    decades.add(Math.floor(config.age/10));
    for(const child of D.getChildren(config)){
      stages.add(D.childStage(child.age));assert.ok(child.age<=config.age-18);
      if(child.militaryStatus==='serving'){serving++;assert.equal(child.gender,'man');assert.ok(child.age>=18&&child.age<=28);}
    }
  }
  for(const decade of [2,3,4,5,6])assert.ok(decades.has(decade));
  for(const stage of ['toddler','preschool','school','teen','adult'])assert.ok(stages.has(stage),stage);
  assert.ok(serving>0);assert.ok(serving<300,'service remains a fictional possibility rather than every son');
});

test('legacy child age bands have an explicit conservative fallback and no inferred military duty',()=>{
  for(const [stage,age]of [['toddler',1],['preschool',4],['school',9],['teen',16],['adult',24]]){
    const children=D.getChildren({...D.DEFAULT_CONFIG,children:2,childAge:stage});assert.equal(children.length,2);
    assert.ok(children.every(child=>child.age===age&&child.gender==='unspecified'&&child.militaryStatus==='none'));
  }
  const config={...D.DEFAULT_CONFIG,age:62,children:1,childAge:'adult',childProfiles:[{age:29,gender:'man',militaryStatus:'none'}]};
  const a=D.getChildren(config);a[0].age=10;assert.equal(config.childProfiles[0].age,29);
  assert.deepEqual(S.parse(S.serialize(E.create(config))).state.config.childProfiles,config.childProfiles);
  const six=E.create({...config,careShare:100,childAge:'preschool',childProfiles:[{age:6,gender:'unspecified',militaryStatus:'none'}]});
  assert.equal(D.childStage(6),'preschool');assert.equal(E.careMinutes(six,'2026-01-03','morning'),100);
});

test('actual published v3 pending care save keeps eleven past days and exact financial values',()=>{
  const text=fs.readFileSync(path.join(__dirname,'fixtures/v3-pending-care.json'),'utf8'),old=JSON.parse(text).state;
  assert.equal(old.version,3);assert.equal(old.log.filter(l=>l.type==='daily').length,11);
  const result=S.parse(text);assert.ok(result.ok,result.reason);assert.equal(result.state.version,D.VERSION);
  for(const field of ['finance','log','artifacts','rng','plan','rules','date','weekStart'])assert.deepEqual(result.state[field],old[field],field);
  for(const [key,value]of Object.entries(old.stats))assert.equal(result.state.stats[key],value);
  for(const key of ['health','happiness','knowledge','family'])assert.ok(Number.isFinite(result.state.stats[key]));
  assert.deepEqual(result.state.household,{cleanliness:70,lastCleaned:null});assert.equal(result.state.healthEpisode,null);
  assert.equal(result.state.config.childProfiles,null);
  assert.deepEqual(result.state.pendingEvent.choices,Events.MAP.care_appointment.choices);
  assert.ok(E.choose(result.state,'share').ok);assert.ok(S.parse(S.serialize(result.state)).ok);
  const changed=structuredClone(old);changed.pendingEvent.choices[0].action='job_accept';
  assert.equal(S.parse(envelope(changed,3)).ok,false,'migration must reject altered event actions even with a recomputed checksum');
});

test('new child, health and household fields reject corrupted imports',()=>{
  const state=E.create({...D.DEFAULT_CONFIG,age:62,children:1,childAge:'adult',childProfiles:[{age:21,gender:'man',militaryStatus:'serving'}]});
  assert.deepEqual(S.validate(state),[]);
  const badChanges=[
    s=>{s.household.cleanliness=101;},s=>{s.household.lastCleaned='2026-02-01';},s=>{delete s.stats.health;},
    s=>{s.config.childProfiles[0].age=70;},s=>{s.config.childProfiles[0].age=1;},s=>{s.config.childProfiles[0].gender='woman';},
    s=>{s.healthEpisode={kind:'hfmd',subject:'child',childIndex:0,started:s.date,recoveryDue:'2026-01-08',approach:'rest'};},
    s=>{s.flags.militaryChildIndex=6;},s=>{s.healthEpisode={kind:'influenza',subject:'self',childIndex:null,started:s.date,recoveryDue:'2027-01-01',approach:'rest'};}
  ];
  for(const change of badChanges){const changed=structuredClone(state);change(changed);assert.ok(S.validate(changed).length);assert.equal(S.parse(envelope(changed)).ok,false);}
});

test('regional prices remain won integers while one-decimal money text is presentation only',()=>{
  const state=E.create({...D.DEFAULT_CONFIG,province:'seoul'});
  for(const a of D.ACTIVITIES){const quote=D.activityPrice(state.config,a.id);assert.ok(Number.isSafeInteger(quote.amount)&&quote.amount>=0);assert.match(D.formatMoney(quote.amount),/^-?[\d,]+(?:\.\d)?만원$/);}
  const initial=state.finance.cash;D.formatMoney(initial);assert.equal(state.finance.cash,initial);
  assert.equal(D.formatMoney(3309438),'330.9만원');assert.equal(D.formatMoney(1800500),'180.1만원');
});

test('active illness and military leave saves require their real start and scheduled followup',()=>{
  const ill=E.create(D.DEFAULT_CONFIG);ill.queue.unshift({catalogId:'illness_influenza',date:ill.date,context:{}});E.advance(ill);assert.ok(E.choose(ill,'rest').ok);assert.deepEqual(S.validate(ill),[]);
  for(const change of [s=>{s.queue=[];delete s.flags.illnessLast;},s=>{s.queue.find(q=>q.catalogId==='illness_recovery').date=s.date;},s=>{s.healthEpisode.recoveryDue='2026-03-01';},s=>{s.log=s.log.filter(l=>l.type!=='health');}]){
    const invalid=structuredClone(ill);change(invalid);assert.equal(S.parse(envelope(invalid)).ok,false);
  }
  const family=E.create({...D.DEFAULT_CONFIG,age:62,children:1,childAge:'adult',childProfiles:[{age:21,gender:'man',militaryStatus:'serving'}]});
  family.flags.militaryChildIndex=0;family.flags.militaryLeaveUntil='2099-01-01';assert.equal(S.parse(envelope(family)).ok,false);
  delete family.flags.militaryChildIndex;delete family.flags.militaryLeaveUntil;
  family.queue.unshift({catalogId:'military_leave',date:family.date,context:{}});E.advance(family);assert.ok(E.choose(family,'together').ok);assert.deepEqual(S.validate(family),[]);
  const invalid=structuredClone(family);invalid.queue=invalid.queue.filter(q=>q.catalogId!=='military_return');assert.equal(S.parse(envelope(invalid)).ok,false);
});

test('balanced automatic life respects an empty or single selection and explains unavailable role activities',()=>{
  const state=E.create({...D.DEFAULT_CONFIG,preferences:[]});
  assert.ok(E.prepareAutoWeek(state).ok);assert.ok(state.plan.every(p=>['read','walk','rest'].includes(p.activityId)));
  const before=JSON.stringify(state);const blocked=E.replaceAutoWeek(state,{preferences:['research']});
  assert.equal(blocked.ok,false);assert.match(blocked.reason,/대학원생/);assert.equal(JSON.stringify(state),before);
  assert.ok(E.replaceAutoWeek(state,{preferences:['music']}).ok);
  assert.ok(state.plan.some(p=>p.activityId==='music'));assert.ok(state.plan.every(p=>['music','read','walk','rest'].includes(p.activityId)));
  const caregiver=E.create({...D.PRESETS[3].config,preferences:['study','music']});assert.ok(E.prepareAutoWeek(caregiver).ok);assert.ok(caregiver.plan.some(p=>p.activityId==='study'));
  const previous=E.create({...D.DEFAULT_CONFIG,preferences:['research','jobstudy']});
  assert.ok(E.replaceAutoWeek(previous,{preferences:['research']}).ok,'old inactive preferences can be removed one by one');assert.ok(E.replaceAutoWeek(previous,{preferences:[]}).ok);
});
