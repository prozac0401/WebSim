const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const D = require('./data.js');
const C = require('./calendar.js');
const S = require('./storage.js');

function game(id='worker',override={}) { return E.create({...D.PRESETS.find(p=>p.id===id).config,...override},id); }
function resolve(s, preferred) {
  const e=s.pendingEvent;
  const choices=preferred?[...e.choices.filter(c=>c.id===preferred),...e.choices.filter(c=>c.id!==preferred)]:e.choices;
  for(const c of choices)if(E.choose(s,c.id).ok)return;
  assert.fail('No viable event option: '+e.catalogId);
}
function run(s,until=()=>s.phase==='finished',limit=3000) {
  for(let i=0;i<limit&&!until();i++){
    if(s.phase==='event')resolve(s);
    else if(s.phase==='review')E.finishReview(s);
    else {const r=E.confirmReservations(s);if(!r.ok)for(const issue of r.issues)E.skipReservation(s,issue,'time');E.advance(s);}
  }
  assert.ok(until(),'Simulation failed to reach requested state');return s;
}
function trigger(s,id,context={}) {s.queue.unshift({catalogId:id,date:s.date,context});E.advance(s);assert.equal(s.pendingEvent.catalogId,id);}

test('first fortnight executes study, meeting and overtime, carries fatigue and defers reward',()=>{
  const s=game('worker',{seed:2026});
  assert.ok(E.addPlan(s,{date:'2026-01-01',slot:'morning',activityId:'study'}).ok);
  assert.ok(E.addPlan(s,{date:'2026-01-03',slot:'morning',activityId:'overtime'}).ok);
  assert.ok(E.addPlan(s,{date:'2026-01-04',slot:'afternoon',activityId:'friends'}).ok);
  s.queue.push({catalogId:'autumn_reflection',date:'2026-01-15',context:{}});
  run(s,()=>s.phase==='event'&&s.date==='2026-01-15');
  assert.equal(s.log.filter(l=>l.type==='daily').length,14);
  assert.equal(s.activityCounts.study,1);assert.equal(s.activityCounts.overtime,1);assert.equal(s.activityCounts.friends,1);
  assert.ok(s.stats.preparation>0);assert.ok(s.stats.work>0);assert.ok(s.stats.relationship>60);
  assert.equal(s.finance.pendingPay,90000);assert.equal(s.finance.ledger.filter(t=>t.type==='extra-pay').length,0);
  assert.ok(s.log.find(l=>l.type==='daily'&&l.date==='2026-01-03').stats.fatigue>0);
  assert.equal(s.log.filter(l=>l.type==='weekday'&&l.date==='2026-01-01').length,0);
});

test('each preset completes all calendar days, year-end summary derives from actual logs',()=>{
  for(const preset of D.PRESETS){const s=run(game(preset.id));const summary=E.getSummary(s);
    assert.equal(summary.daysPlayed,365);assert.equal(summary.calendar.length,365);assert.equal(s.date,'2026-12-31');
    assert.equal(summary.achievements.length,s.log.filter(l=>l.type==='achievement').length);
    assert.deepEqual(summary.artifacts,s.artifacts);assert.deepEqual(S.validate(s),[]);
    assert.equal(summary.calendar.reduce((n,d)=>n+d.activities.length,0),s.log.filter(l=>l.type==='activity').length);
  }
});

test('leap year retains 366 days and sourced holiday status',()=>{
  const s=run(game('seeker',{year:2028}));assert.equal(E.getSummary(s).daysPlayed,366);assert.equal(C.holidayStatus(2028).verified,true);
});

test('recurrence is reserved until explicit confirmation, with moved dates visible',()=>{
  const s=game();assert.ok(E.addRule(s,{activityId:'read',anchor:'2026-01-02',kind:'weeks',interval:1,move:'next-off',slot:'morning'}).ok);
  const [r]=E.reservations(s);assert.equal(r.date,'2026-01-03');assert.equal(r.originalDate,'2026-01-02');assert.equal(r.moved,true);
  assert.equal(E.advance(s).ok,false);assert.equal(s.log.length,0);
  assert.ok(E.confirmReservations(s).ok);E.advance(s);while(s.phase==='event'){resolve(s);E.advance(s);}
  assert.equal(s.activityCounts.read,1);assert.equal(E.getSummary(s).kept,1);
});

test('postponing and skipping remain distinct and are reflected in the review',()=>{
  const s=game();E.addRule(s,{activityId:'read',anchor:'2026-01-03',kind:'weeks',interval:1,slot:'morning'});
  const r=E.reservations(s)[0];assert.ok(E.postponeReservation(s,r,'2026-01-04').ok);
  const moved=E.reservations(s)[0];assert.equal(moved.date,'2026-01-04');assert.ok(E.skipReservation(s,moved).ok);assert.equal(E.reservations(s).length,0);
  assert.equal(E.getSummary(s).postponed.length,2);
});

test('unchanged or earlier shifted reservation cannot create phantom postponements',()=>{
  const s=game();E.addRule(s,{activityId:'friends',anchor:'2026-01-02',kind:'weeks',interval:1,slot:'morning',move:'next-off'});
  const item=E.reservations(s)[0];assert.equal(item.date,'2026-01-03');
  const before=JSON.stringify(s);
  for(let n=0;n<3;n++)assert.equal(E.postponeReservation(s,item,'2026-01-03').ok,false);
  assert.equal(E.postponeReservation(s,item,'2026-01-02').ok,false);assert.equal(JSON.stringify(s),before);
  assert.ok(E.postponeReservation(s,item,'2026-01-04').ok);assert.equal(s.friendPostponements,1);assert.equal(s.stats.relationship,60);
  const moved=E.reservations(s)[0],after=JSON.stringify(s);assert.equal(E.postponeReservation(s,moved,'2026-01-04').ok,false);assert.equal(JSON.stringify(s),after);
});

test('time includes preparation, travel and care; no role or gender shortcut',()=>{
  const s=game('caregiver',{region:'rural',transport:'walk',children:6,careShare:100});
  assert.equal(E.addPlan(s,{date:'2026-01-03',slot:'morning',activityId:'pottery'}).ok,false);
  assert.equal(E.addPlan(s,{date:'2026-01-03',slot:'afternoon',activityId:'overtime'}).ok,false);
  const a=game('worker',{gender:'woman'}),b=game('worker',{gender:'man'});
  assert.equal(E.activityTime(a,'photo','2026-01-03','morning'),E.activityTime(b,'photo','2026-01-03','morning'));
});

test('one study session and one cancelled promise do not damage relationships',()=>{
  const s=game();E.addPlan(s,{date:'2026-01-01',slot:'morning',activityId:'study'});const p=E.addPlan(s,{date:'2026-01-03',slot:'afternoon',activityId:'friends'}).plan;E.removePlan(s,p.id,'choice');
  const control=game();assert.equal(s.stats.relationship,control.stats.relationship);E.advance(s);E.advance(control);assert.equal(s.stats.relationship,control.stats.relationship);
  const beforeRepeatedPostponements=s.stats.relationship;
  for(let n=0;n<2;n++){const fake={id:'f'+n,date:s.date,slot:'evening',activityId:'friends',payment:'cash',originalDate:s.date,ruleId:null};s.plan.push(fake);E.removePlan(s,fake.id,'choice');}
  assert.equal(s.stats.relationship,Number((beforeRepeatedPostponements-8).toFixed(2)));assert.ok(s.queue.some(q=>q.catalogId==='relationship_boundary'));
});

test('exam result happens at a scheduled decision; failure has recovery choices',()=>{
  const s=game();trigger(s,'exam_june');assert.equal(s.log.filter(l=>l.type==='achievement').length,0);assert.ok(E.choose(s,'take').ok);
  assert.equal(s.flags.certified,false);assert.ok(s.log.some(l=>l.type==='achievement'&&l.passed===false));assert.ok(s.queue.some(q=>q.catalogId==='exam_followup'));
  const ready=game();ready.stats.preparation=90;ready.stats.fatigue=10;trigger(ready,'exam_june');E.choose(ready,'take');assert.equal(ready.flags.certified,true);
});

test('overtime count alone cannot guarantee evaluation outcome and pending pay survives year-end',()=>{
  const s=game();s.stats.work=100;s.stats.fatigue=95;trigger(s,'work_review');E.choose(s,'review');assert.ok(s.log.some(l=>l.type==='achievement'&&l.positive===false));
  const ready=game();ready.stats.work=75;ready.stats.fatigue=20;trigger(ready,'work_review');E.choose(ready,'review');assert.equal(ready.finance.pendingPay,180000);
});

test('research decisions replace weekday work and preserve failure path',()=>{
  const s=game('graduate');s.queue.push({catalogId:'thesis_presentation',date:'2026-01-02',context:{}});E.advance(s);assert.equal(s.date,'2026-01-02');E.choose(s,'present');E.advance(s);
  assert.equal(s.log.filter(l=>l.date==='2026-01-02'&&l.type==='weekday').length,0);assert.ok(s.log.some(l=>l.type==='achievement'&&l.passed===false));
});

test('hobby repetition yields an artifact and opens an opportunity only after threshold',()=>{
  const s=game();E.addRule(s,{activityId:'photo',anchor:'2026-01-03',kind:'weeks',interval:1,slot:'morning',move:'keep'});
  assert.equal(s.queue.length,0);s.queue.push({catalogId:'autumn_reflection',date:'2026-02-02',context:{}});run(s,()=>s.phase==='event'&&s.date==='2026-02-02');
  assert.ok(s.artifacts.filter(a=>a.activityId==='photo').length>=2);assert.ok(s.eventHistory.hobby_gathering||s.queue.some(q=>q.catalogId==='hobby_gathering'));
});

test('external RNG consumes fixed draws per date despite action followup interruptions',()=>{
  const a=game(),b=game();a.queue.push({catalogId:'study_checkpoint',date:'2026-01-03',context:{}});
  run(a,()=>a.phase==='review'&&a.date==='2026-01-04');run(b,()=>b.phase==='review'&&b.date==='2026-01-04');assert.equal(a.rng.external,b.rng.external);
});

test('later-slot conflict does not replay earlier activity or grant duplicate rest',()=>{
  const s=game();E.addPlan(s,{date:'2026-01-01',slot:'morning',activityId:'study'});E.addPlan(s,{date:'2026-01-01',slot:'afternoon',activityId:'study'});
  trigger(s,'care_appointment');E.choose(s,'accompany');E.advance(s);assert.equal(s.pendingEvent.catalogId,'constraint');const fatigue=s.stats.fatigue;
  assert.equal(s.activityCounts.study,1);assert.equal(E.addPlan(s,{date:'2026-01-01',slot:'morning',activityId:'study'}).ok,false);
  assert.equal(E.choose(s,'skip').ok,true);s.queue.push({catalogId:'autumn_reflection',date:'2026-01-02',context:{}});E.advance(s);
  assert.equal(s.activityCounts.study,1);assert.equal(s.log.filter(l=>l.type==='activity'&&l.date==='2026-01-01').length,1);
  assert.ok(s.stats.fatigue<fatigue&&s.stats.fatigue>fatigue-3,'Only the remaining evening and ordinary overnight recovery should reduce fatigue');
});

test('care conflict can reschedule while keeping original recurring identity',()=>{
  const s=game('caregiver');E.addRule(s,{activityId:'draw',anchor:'2026-01-01',kind:'weeks',interval:1,slot:'afternoon',move:'keep'});E.confirmReservations(s);
  trigger(s,'care_appointment');E.choose(s,'accompany');E.advance(s);assert.equal(s.pendingEvent.catalogId,'constraint');const original=s.plan[0].originalDate;assert.ok(E.choose(s,'reschedule').ok);
  assert.equal(s.plan[0].slot,'evening');assert.equal(s.plan[0].originalDate,original);assert.ok(s.plan[0].ruleId);assert.ok(E.getSummary(s).cannot.some(l=>l.type==='postponed'));
});

test('save round trip during an event resumes deterministically',()=>{
  const a=game();trigger(a,'friend_invitation');const loaded=S.parse(S.serialize(a));assert.equal(loaded.ok,true);const b=loaded.state;
  E.choose(a,'call');E.choose(b,'call');E.advance(a);E.advance(b);assert.deepEqual(a,b);
});

test('invalid saves reject version, corrupt checksum, invalid finance and duplicate days',()=>{
  const s=game();assert.equal(S.parse('{}').ok,false);const text=S.serialize(s);const parsed=JSON.parse(text);parsed.state.finance.cash++;assert.equal(S.parse(JSON.stringify(parsed)).ok,false);
  const cash=game();cash.finance.cash++;assert.ok(S.validate(cash).some(e=>e.includes('현금')));
  E.advance(s);s.log.push({...s.log.find(l=>l.type==='daily'),id:'log-tampered'});assert.ok(S.validate(s).some(e=>e.includes('중복')));
  const bad=game();bad.config.salary=-1;assert.ok(S.validate(bad).length>0);
});

test('browser storage writes and reads locally; quota failure is explicit',()=>{
  const s=game(),map=new Map(),store={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k),removeItem:k=>map.delete(k)};
  assert.ok(S.save(s,store).ok);assert.deepEqual(S.load(store).state,s);assert.ok(S.clear(store).ok);assert.equal(S.load(store).ok,false);
  assert.equal(S.save(s,{setItem(){throw Error('quota');}}).ok,false);
});
