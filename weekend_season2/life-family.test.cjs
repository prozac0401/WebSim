const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('./data.js');
const E=require('./engine.js');
const Events=require('./events.js');
const Storage=require('./storage.js');

function life(seed){const generated=D.generateLife(seed);return E.create(generated.config,generated.presetId);}
function hash(text){let n=2166136261;for(let i=0;i<text.length;i++){n^=text.charCodeAt(i);n=Math.imul(n,16777619);}return(n>>>0).toString(16).padStart(8,'0');}
function envelope(state,version=state.version){return JSON.stringify({format:Storage.FORMAT,version,state,checksum:hash(JSON.stringify(state))});}
function legacy(state){const result=JSON.parse(JSON.stringify(state));result.version=1;for(const key of ['maritalStatus','personaName','lifeIntro','generationSeed','province','residenceOrigin','appearance','homeStyle','generationModel','incomeOrigin','economicProfile','housingOrigin'])delete result.config[key];return result;}
function resolve(state){
  const event=state.pendingEvent;
  for(const c of event.choices)if(E.choose(state,c.id).ok)return;
  assert.fail('No usable choice for '+event.catalogId);
}
function autoplay(state,direction='balanced'){
  let turns=0,stops=0;
  while(state.phase!=='finished'&&turns++<4000){
    if(state.phase==='event'){resolve(state);continue;}
    if(state.phase==='review'){E.finishReview(state);continue;}
    const prepared=E.prepareAutoWeek(state,{direction});
    if(!prepared.ok){
      stops++;assert.ok(prepared.issues.length,'No hidden auto-progress failure');
      // This test explicitly acts as the player resolving a stopped plan.
      // The preparation API itself never cancels a plan or makes this choice.
      for(const issue of prepared.issues){if(state.plan.some(p=>p.id===issue.id))E.removePlan(state,issue.id,issue.cause||'time');else E.skipReservation(state,issue,issue.cause||'time');}
      continue;
    }
    E.advance(state);
  }
  assert.equal(state.phase,'finished','autoplay must not get stuck');
  return {state,turns,stops};
}
function autoplayThroughChoices(state,direction='balanced'){
  let turns=0,constraints=0;
  while(state.phase!=='finished'&&turns++<4000){
    if(state.phase==='event'){if(state.pendingEvent.catalogId==='constraint')constraints++;resolve(state);continue;}
    if(state.phase==='review'){E.finishReview(state);continue;}
    const prepared=E.prepareAutoWeek(state,{direction});
    assert.ok(prepared.ok,'auto-only play must reach a visible choice instead of stopping in planning: '+state.date+' '+prepared.reason);
    E.advance(state);
  }
  assert.equal(state.phase,'finished');return {state,turns,constraints};
}
function trigger(state,id){state.queue.unshift({catalogId:id,date:state.date,context:{}});E.advance(state);assert.equal(state.pendingEvent.catalogId,id);}

test('generated lives are deterministic, fictional, balanced across 16 household-role combinations',()=>{
  const combinations=new Set(),genders=new Set();
  for(let seed=0;seed<64;seed++){
    const generated=D.generateLife(seed);assert.deepEqual(generated,D.generateLife(seed));assert.deepEqual(E.validateConfig(generated.config),[]);
    assert.equal(generated.config.personaName,generated.name);assert.ok(generated.intro.includes(generated.name));assert.ok(generated.intro.includes(generated.config.age+'세'));
    combinations.add([generated.config.role,generated.config.maritalStatus,!!generated.config.children].join(':'));genders.add(generated.config.gender);
  }
  assert.equal(combinations.size,16);assert.equal(genders.size,4);
  assert.throws(()=>D.generateLife(-1));assert.throws(()=>D.generateLife(1.5));
});

test('generated unpartnered parents are divorced while explicit single parents remain selectable',()=>{
  for(let seed=0;seed<2048;seed++){
    const {config,intro}=D.generateLife(seed),profile=seed%16;
    const expected=profile>=8&&profile<12?'divorced':Math.floor(profile/4)%2?'married':'single';
    assert.equal(config.maritalStatus,expected);
    assert.equal(config.maritalStatus==='single'&&config.children>0,false);
    if(config.maritalStatus==='divorced'){assert.ok(config.children>0);assert.match(intro,/이혼 후/);assert.doesNotMatch(intro,/미혼이에요/);}
  }
  const manual=E.create({...D.PRESETS[0].config,maritalStatus:'single',children:2,childAge:'school'});
  assert.equal(manual.config.maritalStatus,'single');assert.equal(manual.config.children,2);
  assert.deepEqual(E.validateConfig({...manual.config,maritalStatus:'divorced'}),[]);
});

test('new divorced parents retain family combinations while the new model provides household essentials',()=>{
  for(const fixture of [{seed:635,children:2},{seed:169,children:1},{seed:107,children:1}]){
    const config=D.generateLife(fixture.seed).config;
    assert.equal(config.maritalStatus,'divorced');
    for(const [key,value]of Object.entries(fixture))assert.equal(config[key],value);
    const p=config.economicProfile;
    assert.ok(config.fixedCosts>=p.minimumLiving);assert.ok(config.personalBudget>=150000);
    assert.ok(config.salary+config.externalAllowance-config.fixedCosts-p.housingTotal-config.personalBudget>=100000);
    const state=E.create(config),manual=E.create({...config,maritalStatus:'single'});
    assert.deepEqual(state.rng,manual.rng);assert.deepEqual(state.finance,manual.finance);assert.deepEqual(state.stats,manual.stats);
  }
});

test('money display rounds to one decimal 만원 without changing integer-won accounting',()=>{
  for(const [value,label]of [[0,'0만원'],[1,'0만원'],[500,'0.1만원'],[12000,'1.2만원'],[55000,'5.5만원'],[2800000,'280만원'],[-500,'-0.1만원'],[3309438,'330.9만원']])assert.equal(D.formatMoney(value),label);
  assert.throws(()=>D.formatMoney(0.1));assert.throws(()=>D.formatMoney(NaN));
  for(const event of Events.CATALOG)assert.doesNotMatch(JSON.stringify([event.description,event.choices]),/\d,\d{3}원|\d만 원/);
});

test('new life generation and auto preparation do not consume either event RNG stream',()=>{
  const s=life(4),before={...s.rng};for(let seed=0;seed<30;seed++)D.generateLife(seed);assert.deepEqual(s.rng,before);
  const prepared=E.prepareAutoWeek(s);assert.ok(prepared.ok);assert.deepEqual(s.rng,before);assert.equal(s.date,'2026-01-01');assert.equal(s.phase,'planning');assert.equal(s.log.length,0);
});

test('auto preparation is idempotent and preserves the manual plan and direction choice',()=>{
  const s=life(2);const manual=E.addPlan(s,{date:'2026-01-01',slot:'afternoon',activityId:'read'}).plan;
  assert.ok(E.prepareAutoWeek(s,{direction:'hobby'}).ok);assert.ok(s.plan.length<=3);assert.deepEqual(s.plan.find(p=>p.id===manual.id),manual);
  const snapshot=JSON.stringify(s);const again=E.prepareAutoWeek(s,{direction:'rest'});assert.ok(again.alreadyPrepared);assert.equal(again.added.length,0);assert.equal(JSON.stringify(s),snapshot);
});

test('auto preparation stops for pending moved reservations and changed resources without canceling',()=>{
  const s=life(0);E.addRule(s,{activityId:'read',anchor:'2026-01-02',kind:'weeks',slot:'morning',move:'next-off'});
  const before=JSON.stringify(s),result=E.prepareAutoWeek(s);assert.equal(result.ok,false);assert.equal(result.issues[0].moved,true);assert.equal(JSON.stringify(s),before);
  const money=life(0);E.addPlan(money,{date:'2026-01-01',slot:'afternoon',activityId:'study'});money.config.personalBudget=0;
  const unchanged=JSON.stringify(money);assert.equal(E.prepareAutoWeek(money).ok,false);assert.equal(JSON.stringify(money),unchanged);
});

test('auto activities cannot consume money already reserved for a later manual appointment',()=>{
  const s=E.create({...D.PRESETS[0].config,personalBudget:45000});
  const manual=E.addPlan(s,{date:'2026-01-04',slot:'afternoon',activityId:'pottery'}).plan;
  const prepared=E.prepareAutoWeek(s);assert.ok(prepared.ok);assert.ok(prepared.added.length>0);
  assert.ok(prepared.added.every(p=>D.ACTIVITY_MAP[p.activityId].cost===0));assert.deepEqual(s.plan.find(p=>p.id===manual.id),manual);
  assert.ok(E.prepareAutoWeek(s).ok,'manual appointment must remain feasible after preparation');
});

test('resuming a care decision reaches a visible conflict choice without reopening planning',()=>{
  const state=E.create({...D.PRESETS.find(p=>p.id==='caregiver').config,gender:'woman',maritalStatus:'married',children:2,childAge:'school',startCash:1800500,seed:2026});
  assert.ok(E.addPlan(state,{date:state.date,slot:'afternoon',activityId:'pottery'}).ok);
  assert.ok(E.prepareAutoWeek(state).ok);
  trigger(state,'care_appointment');assert.ok(E.choose(state,'accompany').ok);
  const before=JSON.stringify(state.plan),prepared=E.prepareAutoWeek(state,{direction:'balanced'});
  assert.ok(prepared.ok);assert.ok(prepared.alreadyPrepared);assert.equal(JSON.stringify(state.plan),before);
  E.advance(state);assert.equal(state.phase,'event');assert.equal(state.pendingEvent.catalogId,'constraint');
  assert.equal(state.pendingEvent.context.cause,'time');assert.ok(state.pendingEvent.choices.some(c=>c.id==='reschedule'));
  const result=autoplayThroughChoices(state);assert.equal(E.getSummary(result.state).daysPlayed,365);
});

test('an already prepared week still stops for a newly added unconfirmed moved reservation',()=>{
  const state=life(0);assert.ok(E.prepareAutoWeek(state).ok);
  E.addRule(state,{activityId:'read',anchor:'2026-01-02',kind:'weeks',slot:'morning',move:'next-off'});
  const before=JSON.stringify(state);const result=E.prepareAutoWeek(state);assert.equal(result.ok,false);assert.equal(result.issues[0].moved,true);assert.equal(JSON.stringify(state),before);
});

test('zero funds and long travel select feasible free alternatives instead of retrying forever',()=>{
  const config={...D.generateLife(15).config,personalBudget:0,startCash:0,salary:0,externalAllowance:0,region:'rural',transport:'walk',preferences:['pottery','pt']};
  config.economicProfile.active=false;config.incomeOrigin.kind='custom';
  const s=E.create(config);const result=E.prepareAutoWeek(s,{direction:'hobby'});assert.ok(result.ok);assert.ok(result.notes.length);assert.ok(result.added.length>0);
  for(const plan of s.plan){assert.equal(D.ACTIVITY_MAP[plan.activityId].cost,0);assert.ok(E.activityTime(s,plan.activityId,plan.date,plan.slot)<=240);}
});

test('marital status alone never sets income, ability or caregiving burden',()=>{
  const config={...D.PRESETS[0].config,children:1,childAge:'school',careShare:60};
  const single=E.create({...config,maritalStatus:'single'});
  for(const maritalStatus of ['married','divorced']){
    const other=E.create({...config,maritalStatus});
    assert.deepEqual(single.stats,other.stats);assert.deepEqual(single.finance,other.finance);
    assert.equal(E.careMinutes(single,'2026-01-03','morning'),E.careMinutes(other,'2026-01-03','morning'));
    assert.equal(single.config.salary,other.config.salary);assert.equal(single.config.careShare,other.config.careShare);
  }
});

test('household events require marital status, child presence and an actual prior choice',()=>{
  const configs=[['single',0,'single_weekend'],['single',1,'single_care'],['divorced',0,'single_weekend'],['divorced',1,'single_care'],['married',0,'partner_weekend'],['married',1,'partner_care']];
  for(const [maritalStatus,children,eligible]of configs){
    const s=E.create({...D.PRESETS[0].config,maritalStatus,children,childAge:children?'school':'none'});
    for(const id of ['single_weekend','single_care','partner_weekend','partner_care'])assert.equal(Events.eligible(s,id),id===eligible);
    assert.equal(Events.eligible(s,'single_followup'),false);assert.equal(Events.eligible(s,'partner_followup'),false);
    trigger(s,eligible);resolve(s);
    const followup=maritalStatus==='married'?'partner_followup':'single_followup';assert.ok(Events.eligible(s,followup));assert.ok(s.queue.some(q=>q.catalogId===followup&&q.date==='2026-01-22'));
    assert.ok(s.log.some(l=>l.eventId===eligible));
  }
});

test('care-sharing effects require a choice and remain available in every marital status',()=>{
  for(const maritalStatus of ['single','divorced','married']){
    const s=E.create({...D.PRESETS[0].config,maritalStatus,children:1,childAge:'preschool',careShare:80});
    const before=E.careMinutes(s,'2026-01-03','morning');trigger(s,maritalStatus==='married'?'partner_care':'single_care');
    assert.equal(E.careMinutes(s,'2026-01-03','morning'),before);
    E.choose(s,maritalStatus==='married'?'swap':'ask');assert.equal(E.careMinutes(s,'2026-01-03','morning'),before/2);
    assert.equal(s.config.careShare,80);assert.equal(s.config.salary,D.PRESETS[0].config.salary);
  }
});

test('new household help halves even capped care time without rewriting legacy care rules',()=>{
  for(const maritalStatus of ['single','divorced','married']){
    const s=E.create({...D.PRESETS[0].config,maritalStatus,children:6,childAge:'preschool',careShare:100});
    assert.equal(E.careMinutes(s,'2026-01-03','morning'),180);
    trigger(s,maritalStatus==='married'?'partner_care':'single_care');E.choose(s,maritalStatus==='married'?'swap':'ask');
    assert.equal(E.careMinutes(s,'2026-01-03','morning'),90);
  }
  const previous=E.create({...D.PRESETS[0].config,children:6,childAge:'preschool',careShare:100});previous.flags.careSharedUntil='2026-01-30';
  assert.equal(E.careMinutes(previous,'2026-01-03','morning'),180,'legacy formula remains stable for migrated saves');
});

test('16 role × marital × child combinations finish an automatically prepared year with real logs',()=>{
  for(let seed=0;seed<16;seed++){
    const {state,turns}=autoplay(life(seed));assert.ok(turns<600,'unexpectedly repeated auto stops for seed '+seed);
    const summary=E.getSummary(state);assert.equal(summary.daysPlayed,365);assert.ok(summary.log.filter(l=>l.type==='activity').length>30);
    const prefix=state.config.maritalStatus==='married'?'partner':'single';assert.ok(state.eventHistory[prefix+'_followup']);
    assert.deepEqual(Storage.validate(state),[]);assert.ok(Storage.parse(Storage.serialize(state)).ok);
  }
});

test('16 generated lives finish through visible event choices without silent plan removal',()=>{
  let totalConstraints=0;
  for(let seed=0;seed<16;seed++){
    const {state,constraints}=autoplayThroughChoices(life(seed));totalConstraints+=constraints;
    assert.equal(E.getSummary(state).daysPlayed,365);assert.deepEqual(Storage.validate(state),[]);
  }
  assert.ok(totalConstraints>0,'the test must actually resolve event-induced scheduling conflicts');
});

test('auto choice policy and midyear save recover the same result for a generated life',()=>{
  const a=life(13),b=life(13);autoplay(a,'hobby');
  E.prepareAutoWeek(b,{direction:'hobby'});E.advance(b);if(b.phase==='event')resolve(b);
  const loaded=Storage.parse(Storage.serialize(b));assert.ok(loaded.ok);autoplay(loaded.state,'hobby');
  assert.deepEqual(loaded.state,a);
});

test('v1 saves migrate without inventing a spouse, touching ledger, RNG or past memories',()=>{
  const s=life(1);E.prepareAutoWeek(s);E.advance(s);if(s.phase==='event')resolve(s);
  const old=legacy(s),snapshot=JSON.parse(JSON.stringify(old));const parsed=Storage.parse(envelope(old,1));assert.ok(parsed.ok,parsed.reason);assert.equal(parsed.migrated,true);
  assert.equal(parsed.state.version,D.VERSION);assert.equal(parsed.state.config.maritalStatus,'unspecified');assert.equal(parsed.state.config.personaName,'');
  for(const key of ['finance','rng','log','artifacts','plan','rules'])assert.deepEqual(parsed.state[key],snapshot[key]);
  assert.ok(Storage.parse(Storage.serialize(parsed.state)).ok);assert.equal(Events.eligible(parsed.state,'partner_weekend'),false);assert.equal(Events.eligible(parsed.state,'single_weekend'),false);
});

test('v1 pending event labels migrate only after original choices are verified',()=>{
  const s=E.create(D.PRESETS[0].config);trigger(s,'exam_june');const old=legacy(s);
  old.pendingEvent.title='6월 자격증 시험일';old.pendingEvent.source='scheduled';
  old.pendingEvent.choices=[{id:'take',label:'시험 응시 · 20,000원',description:'현재 준비도와 피로로 판정합니다.',effects:{},action:'exam_take'},{id:'defer',label:'11월로 목표 옮기기',description:'준비도는 남고 이번 기회는 미룬 기록으로 남습니다.',effects:{mood:-1},action:'exam_defer'}];
  const parsed=Storage.parse(envelope(old,1));assert.ok(parsed.ok,parsed.reason);assert.equal(parsed.state.pendingEvent.choices[0].label,Events.MAP.exam_june.choices[0].label);
  assert.ok(E.choose(parsed.state,'take').ok);
  old.pendingEvent.choices[0].effects.preparation=100;assert.equal(Storage.parse(envelope(old,1)).ok,false);
});

test('new save validation rejects invalid household fields and impossible household events',()=>{
  const s=life(0);s.config.maritalStatus='fiction';assert.ok(Storage.validate(s).length);
  const person=life(0);person.config.personaName='x'.repeat(41);assert.ok(Storage.validate(person).length);
  const wrong=life(0);wrong.queue.push({catalogId:'partner_followup',date:wrong.date,context:{}});assert.ok(Storage.validate(wrong).length);
});
