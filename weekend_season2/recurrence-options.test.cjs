'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js'),R=require('./recurrence.js');
const clone=value=>JSON.parse(JSON.stringify(value));
function game(extra={}){return E.create({...D.DEFAULT_CONFIG,year:2026,age:35,children:0,childProfiles:[],childAge:'none',startCash:20000000,personalBudget:20000000,salary:0,externalAllowance:0,fixedCosts:0,preferences:[],seed:0,...extra});}
function rule(s,id='eyelid_surgery',extra={}){return E.addRule(s,{activityId:id,anchor:'2026-01-01',kind:'weeks',interval:1,move:'keep',slot:'evening',...extra});}
function until(s,predicate){for(let guard=0;guard<200&&!predicate(s);guard++){const result=s.phase==='event'?E.resolveAutomatic(s):s.phase==='review'?E.finishReview(s):E.advance(s);assert.ok(result.ok||s.phase==='event',result.reason);}assert.ok(predicate(s));}
function completedRule(){const s=game(),added=rule(s);assert.ok(added.ok);assert.ok(E.confirmReservations(s).ok);until(s,state=>state.phase==='review');assert.equal(s.activityCounts.eyelid_surgery,1);return s;}

test('every non-parenting activity supports a deliberate recurring rule under its role and minimum interval',()=>{
  const selectable=D.ACTIVITIES.filter(a=>!a.parenting);assert.ok(selectable.length>40);
  for(const activity of selectable){
    const s=game({role:activity.roles?.[0]||'worker'}),result=rule(s,activity.id,{interval:activity.procedure?.minIntervalDays?4:1});
    assert.ok(result.ok,activity.id+': '+result.reason);assert.equal(result.rule.activityId,activity.id);assert.equal(result.rule.active,true);assert.deepEqual(S.validate(s),[]);
  }
});

test('new parenting rules are excluded even with matching resident children while direct plans still work',()=>{
  for(const activity of D.ACTIVITIES.filter(a=>a.parenting)){
    const age=activity.parenting.minAge,s=game({careShare:0,children:1,childAge:D.childStage(age),childProfiles:[{age,gender:'woman',militaryStatus:'none'}]}),before=JSON.stringify(s);
    const result=rule(s,activity.id);assert.equal(result.ok,false);assert.equal(result.cause,'parenting');assert.equal(JSON.stringify(s),before);
    assert.ok(E.addPlan(s,{activityId:activity.id,date:'2026-01-01',slot:'morning'}).ok,activity.id);
  }
});

test('a skipped one-time occurrence retries next week, then actual completion stops and saves the rule',()=>{
  const s=game(),added=rule(s);assert.ok(added.ok);
  assert.ok(E.skipReservation(s,E.reservations(s)[0],'choice').ok);assert.equal(added.rule.active,true);
  until(s,state=>state.date==='2026-01-05'&&state.phase==='planning');
  assert.equal(E.reservations(s)[0].date,'2026-01-08');assert.ok(E.confirmReservations(s).ok);
  until(s,state=>state.phase==='review');
  assert.equal(s.activityCounts.eyelid_surgery,1);assert.equal(added.rule.active,false);assert.equal(added.rule.stoppedReason,'completed-once');assert.equal(added.rule.stoppedOn,'2026-01-08');assert.equal(added.rule.completed['2026-01-08'],'2026-01-08');
  assert.deepEqual(R.reservations(s.rules,'2026-01-12','2026-12-31'),[]);
  assert.deepEqual(S.validate(s),[]);assert.deepEqual(S.parse(S.serialize(s)).state,s);
  const before=JSON.stringify(s);assert.equal(rule(s,'eyelid_surgery',{anchor:'2026-01-15'}).ok,false);assert.equal(JSON.stringify(s),before);
});

test('failed and cancelled one-time appointments create no completion marker or permanent restriction',()=>{
  const s=game({startCash:0,personalBudget:0}),added=rule(s);assert.ok(added.ok);assert.equal(E.confirmReservations(s).ok,false);
  assert.equal(added.rule.active,true);assert.equal(added.rule.stoppedReason,undefined);assert.ok(E.skipReservation(s,E.reservations(s)[0],'money').ok);
  until(s,state=>state.phase==='review');assert.equal(s.activityCounts.eyelid_surgery,undefined);assert.equal(s.flags.cosmeticRecoveryUntil,undefined);assert.deepEqual(S.validate(s),[]);
  const rich=game(),first=rule(rich);assert.ok(E.confirmReservations(rich).ok);const plan=rich.plan[0];
  assert.ok(E.removePlan(rich,plan.id).ok);assert.equal(first.rule.active,true);assert.equal(first.rule.stoppedReason,undefined);assert.ok(E.activityAvailability(rich,'eyelid_surgery','2026-01-03').allowed);
});

test('a one-time rule cannot be registered twice; stopping releases registration and preserves explicit confirmed-plan cancellation',()=>{
  const s=game(),first=rule(s);assert.ok(first.ok);let before=JSON.stringify(s);
  assert.equal(rule(s).cause,'procedure-once');assert.equal(JSON.stringify(s),before);
  assert.ok(E.stopRule(s,first.rule.id).ok);const second=rule(s);assert.ok(second.ok);assert.ok(E.confirmReservations(s).ok);assert.ok(E.stopRule(s,second.rule.id).ok);
  before=JSON.stringify(s);assert.equal(rule(s).ok,false);assert.equal(JSON.stringify(s),before,'a confirmed visit still exists after stopping its rule');
  assert.ok(E.removePlan(s,s.plan[0].id).ok);assert.ok(rule(s).ok);assert.deepEqual(S.validate(s),[]);
});

test('a manual completion also ends an outstanding one-time rule without inventing a completed recurrence',()=>{
  const s=game(),added=rule(s,'eyelid_surgery',{anchor:'2026-01-03'});assert.ok(added.ok);
  assert.ok(E.addPlan(s,{activityId:'eyelid_surgery',date:'2026-01-01',slot:'morning'}).ok);
  // The manual day can proceed only after this week's unconfirmed occurrence is handled.
  assert.ok(E.postponeReservation(s,E.reservations(s)[0],'2026-01-10').ok);
  until(s,state=>state.phase==='review');assert.equal(added.rule.active,false);assert.equal(added.rule.stoppedOn,'2026-01-01');assert.deepEqual(added.rule.completed,{});
  assert.deepEqual(R.reservations(s.rules,'2026-01-05','2026-12-31'),[]);assert.deepEqual(S.parse(S.serialize(s)).state,s);
});

test('one-time completion removes a conflicting legacy confirmed visit without another charge',()=>{
  const s=game(),added=rule(s);assert.ok(added.ok);assert.ok(E.confirmReservations(s).ok);
  s.plan.push({id:'plan-'+(++s.sequence),activityId:'eyelid_surgery',date:'2026-01-03',slot:'afternoon',payment:'cash',ruleId:null,originalDate:'2026-01-03'});
  assert.deepEqual(S.validate(s),[]);until(s,state=>state.phase==='review');
  assert.equal(s.activityCounts.eyelid_surgery,1);assert.equal(s.finance.ledger.filter(row=>row.type==='purchase'&&row.label===D.ACTIVITY_MAP.eyelid_surgery.name).length,1);assert.ok(s.log.some(row=>row.type==='skipped'&&row.plannedDate==='2026-01-03'&&row.reason==='procedure-once'));assert.deepEqual(S.validate(s),[]);
});

test('automatic completion metadata is tied to the exact actual activity and ending log',()=>{
  const state=completedRule();assert.deepEqual(S.validate(state),[]);
  for(const mutate of [s=>{s.rules[0].active=true;},s=>{s.rules[0].stoppedOn='2026-01-02';},s=>{s.rules[0].stoppedReason='choice';},s=>{delete s.rules[0].stoppedReason;delete s.rules[0].stoppedOn;},s=>{s.log=s.log.filter(row=>row.reason!=='completed-once');},s=>{s.rules[0].activityId='read';}]){
    const corrupt=clone(state);mutate(corrupt);assert.ok(S.validate(corrupt).some(reason=>/예약|활동/.test(reason)));
  }
});

test('automatic living confirms an explicit one-time rule once, closes it and continues subsequent weeks',()=>{
  const s=game(),added=rule(s);assert.ok(added.ok);
  for(let guard=0;guard<6&&s.date<'2026-01-18';guard++)assert.ok(E.advanceAutomatic(s).ok);
  assert.ok(s.date>='2026-01-18');assert.equal(s.activityCounts.eyelid_surgery,1);assert.equal(added.rule.active,false);assert.equal(added.rule.stoppedReason,'completed-once');
  assert.equal(s.log.filter(entry=>entry.reason==='completed-once').length,1);assert.deepEqual(S.validate(s),[]);assert.deepEqual(S.parse(S.serialize(s)).state,s);
});

test('recurring registration keeps procedure intervals, role restrictions, recovery and rejected-state purity',()=>{
  const s=game();let before=JSON.stringify(s);
  assert.equal(rule(s,'laser_hair_removal',{interval:3}).cause,'procedure-interval');assert.equal(JSON.stringify(s),before);
  assert.equal(rule(s,'research').ok,false);assert.equal(JSON.stringify(s),before);
  assert.equal(rule(s,'read',{anchor:'2025-12-31'}).ok,false);assert.equal(JSON.stringify(s),before);
  assert.ok(rule(s,'mole_removal').ok);assert.ok(E.confirmReservations(s).ok);until(s,state=>state.phase==='review');E.finishReview(s);
  before=JSON.stringify(s);assert.equal(rule(s,'walk',{anchor:'2026-01-07'}).cause,'procedure-recovery');assert.equal(JSON.stringify(s),before);
  assert.ok(rule(s,'walk',{anchor:'2026-01-09'}).ok);assert.ok(rule(s,'laser_hair_removal',{anchor:'2026-01-09',interval:4}).ok);assert.deepEqual(S.validate(s),[]);
});
