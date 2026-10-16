'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const D = require('./data.js');
const F = require('./finance.js');
const S = require('./storage.js');

test('independent review: unaffordable event leaves money, time and effects atomic', () => {
  const s = E.create({ startCash: 0, salary: 0, externalAllowance: 0, fixedCosts: 0, personalBudget: 0 });
  s.queue.push({ catalogId: 'household_repair', date: s.date, context: {} });
  E.advance(s);
  const before = JSON.stringify({ stats:s.stats, finance:s.finance, dayState:s.dayState });
  assert.equal(E.choose(s, 'repair').ok, false);
  assert.equal(JSON.stringify({ stats:s.stats, finance:s.finance, dayState:s.dayState }), before);
  assert.equal(s.pendingEvent.catalogId, 'household_repair');
  assert.equal(E.choose(s, 'wait').ok, true);
  assert.equal(s.dayState.blocks.afternoon, 90);
  assert.equal(F.summary(s.finance).consumption, 0);
});

test('independent review: event time plus mandatory care cannot silently exceed a slot', () => {
  const s = E.create({ ...D.PRESETS.find(p=>p.id==='caregiver').config, children:6, childAge:'preschool', careShare:100 });
  s.date = '2026-01-05'; s.weekStart = s.date;
  s.queue.push({ catalogId:'fatigue_reset', date:s.date, context:{} });
  E.advance(s);
  const before = JSON.stringify({ stats:s.stats,finance:s.finance,dayState:s.dayState });
  const result = E.choose(s,'rest');
  if (!result.ok) {
    assert.equal(JSON.stringify({ stats:s.stats,finance:s.finance,dayState:s.dayState }),before);
    assert.ok(s.pendingEvent);
  } else {
    for (const slot of E.SLOT_IDS) assert.ok((s.dayState.blocks[slot]||0)+E.careMinutes(s,s.date,slot)<=240, 'event + care exceed '+slot+' capacity');
  }
});

test('independent review: extra travel applies only to the first outside activity promised by the choice', () => {
  const s=E.create();
  assert.equal(E.addPlan(s,{date:s.date,slot:'morning',activityId:'photo',payment:'cash'}).ok,true);
  assert.equal(E.addPlan(s,{date:s.date,slot:'afternoon',activityId:'walk',payment:'cash'}).ok,true);
  s.queue.push({catalogId:'weather',date:s.date,context:{}});
  E.advance(s);assert.equal(E.choose(s,'carry').ok,true);E.advance(s);
  const done=s.log.filter(l=>l.date==='2026-01-01'&&l.type==='activity');
  assert.equal(done.length,2);
  assert.equal(done[0].minutes,E.activityTime(s,'photo','2026-01-01','morning')+30);
  assert.equal(done[1].minutes,E.activityTime(s,'walk','2026-01-01','afternoon'));
});

test('independent review: overdue completion-based skip advances once from actual offered date', () => {
  const s=E.create();
  const added=E.addRule(s,{activityId:'walk',anchor:'2026-01-03',basis:'completed',kind:'weeks',interval:2,slot:'morning'});
  assert.equal(added.ok,true);
  s.date='2026-06-06';s.weekStart=s.date;
  const offered=E.reservations(s);assert.equal(offered.length,1);
  assert.equal(E.skipReservation(s,offered[0],'choice').ok,true);
  assert.equal(E.reservations(s).length,0);
  assert.equal(s.rules[0].nextOriginal,'2026-06-20');
  assert.equal(s.log.filter(l=>l.type==='skipped').length,1);
});

for(const preset of D.PRESETS) test('independent review: '+preset.id+' full-year logs and financial identities reconcile', () => {
  const s=E.create(preset.config,preset.id);
  assert.equal(E.addRule(s,{activityId:'walk',anchor:'2026-01-03',basis:'scheduled',kind:'weeks',interval:2,slot:'afternoon'}).ok,true);
  let guard=0;
  while(s.phase!=='finished'&&guard++<2000){
    if(s.phase==='event'){
      const preferences=['reschedule','share','inside','call','wait','pace','defer','rest','balance','small','extend','decline','solo','private','reduce','light','keep','free','skip'];
      const choices=s.pendingEvent.choices.slice().sort((a,b)=>{
        const ai=preferences.indexOf(a.id),bi=preferences.indexOf(b.id);
        return (ai<0?999:ai)-(bi<0?999:bi);
      });
      assert.ok(choices.some(choice=>E.choose(s,choice.id).ok),'an event must leave a feasible path');
    }else if(s.phase==='review') E.finishReview(s);
    else {
      const confirm=E.confirmReservations(s);
      for(const issue of confirm.issues) E.skipReservation(s,issue,'time');
      E.advance(s,{untilChoice:true});
    }
  }
  assert.equal(s.phase,'finished');
  const summary=E.getSummary(s),daily=s.log.filter(x=>x.type==='daily'),activities=s.log.filter(x=>x.type==='activity');
  assert.equal(daily.length,365);assert.equal(new Set(daily.map(x=>x.date)).size,365);
  assert.equal(summary.calendar.reduce((sum,day)=>sum+day.activities.length,0),activities.length);
  assert.equal(Object.values(summary.activityCounts).reduce((a,b)=>a+b,0),activities.length);
  assert.equal(summary.monthly.reduce((sum,month)=>sum+month.activities,0),activities.length);
  assert.deepEqual(summary.artifacts.map(x=>x.id).sort(),s.log.filter(x=>x.type==='artifact').map(x=>x.artifactId).sort());
  assert.equal(preset.config.startCash+summary.finance.income-summary.finance.paid,summary.finance.cash);
  assert.equal(summary.finance.consumption-summary.finance.paid,summary.finance.debt);
  assert.equal(summary.finance.pendingPay,s.finance.pendingRewards.reduce((sum,item)=>sum+item.amount,0));
  assert.equal(summary.kept,activities.filter(x=>x.ruleId).length);
  assert.deepEqual(S.validate(s),[]);
  const parsed=S.parse(S.serialize(s));assert.equal(parsed.ok,true);
  assert.deepEqual(E.getSummary(parsed.state),summary);
});

function hobbyEvent(){const s=E.create();s.queue.push({catalogId:'hobby_gathering',date:s.date,context:{activityId:'walk'}});E.advance(s);return s;}

test('independent review: save validator rejects pending events missing runtime context or day state', () => {
  for(const mutate of [s=>{s.pendingEvent.context=null;},s=>{s.dayState=null;}]){
    const s=hobbyEvent();assert.deepEqual(S.validate(s),[]);mutate(s);
    assert.ok(S.validate(s).length,'corrupted event state must be rejected before importing');
  }
});

test('independent review: imported recurrence must refer to a real activity', () => {
  for(const unknown of ['missing','toString','constructor','__proto__']){
    const s=E.create();E.addRule(s,{activityId:'walk',anchor:'2026-01-03',kind:'weeks',interval:1,slot:'morning'});
    s.rules[0].activityId=unknown;
    assert.ok(S.validate(s).length,'unknown activity '+unknown+' must be rejected');
  }
});

test('independent review: imported event IDs cannot resolve inherited object properties', () => {
  for(const unknown of ['missing','toString','constructor','__proto__']){
    const s=E.create();s.queue.push({catalogId:unknown,date:s.date,context:{}});
    assert.ok(S.validate(s).length,'unknown event '+unknown+' must be rejected');
  }
});

test('independent review: unchanged deferred friend reservation cannot create relationship penalties', () => {
  const s=E.create();E.addRule(s,{activityId:'friends',anchor:'2026-01-02',kind:'weeks',interval:1,slot:'afternoon'});
  const item=E.reservations(s)[0];assert.equal(item.date,'2026-01-03');
  const before=JSON.stringify({log:s.log,postponements:s.friendPostponements,stats:s.stats});
  for(let i=0;i<3;i++)assert.equal(E.postponeReservation(s,item,item.date).ok,false);
  assert.equal(JSON.stringify({log:s.log,postponements:s.friendPostponements,stats:s.stats}),before);
});

test('independent review: completed same-day slots cannot receive orphan plans', () => {
  const s=E.create();E.addPlan(s,{date:s.date,slot:'afternoon',activityId:'photo',payment:'cash'});
  s.queue.push({catalogId:'care_appointment',date:s.date,context:{}});
  E.advance(s);assert.equal(E.choose(s,'accompany').ok,true);E.advance(s);
  assert.equal(s.pendingEvent.catalogId,'constraint');assert.equal(E.choose(s,'skip').ok,true);
  assert.ok(s.dayState.done.includes('slot-morning'));
  assert.equal(E.addPlan(s,{date:s.date,slot:'morning',activityId:'walk',payment:'cash'}).ok,false);
  assert.deepEqual(S.validate(s),[]);
});

test('independent review: save validator binds budget and phase to daily accounting markers', () => {
  const initial=hobbyEvent();assert.equal(E.choose(initial,'join').ok,true);
  assert.deepEqual(S.validate(initial),[]);
  for(const mutate of [
    s=>{s.finance.monthSpent=0;},
    s=>{s.finance.monthKey='2026-12';},
    s=>{delete s.finance.processed['begin:'+s.date];},
    s=>{s.finance.processed['end:'+s.date]=true;}
  ]){
    const s=JSON.parse(JSON.stringify(initial));mutate(s);
    assert.ok(S.validate(s).length,'corrupted budget or progress marker must be rejected');
  }
});

test('independent review: activity and artifact totals cannot be dropped from an otherwise valid save', () => {
  const s=E.create();
  for(const slot of E.SLOT_IDS)assert.equal(E.addPlan(s,{date:s.date,slot,activityId:'walk',payment:'cash'}).ok,true);
  s.queue.push({catalogId:'friend_invitation',date:s.date,context:{}});
  E.advance(s);E.choose(s,'call');E.advance(s);
  assert.ok(s.activityCounts.walk>=3);assert.ok(s.artifacts.length>=1);assert.deepEqual(S.validate(s),[]);
  const lostCounts=JSON.parse(JSON.stringify(s));lostCounts.activityCounts={};
  assert.ok(S.validate(lostCounts).length);
  const lostArtifacts=JSON.parse(JSON.stringify(s));lostArtifacts.artifacts=[];
  assert.ok(S.validate(lostArtifacts).length);
});
