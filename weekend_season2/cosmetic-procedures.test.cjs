'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js'),C=require('./calendar.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const ids=['mole_removal','laser_hair_removal','ultherapy','botox','fraxel','eyelid_surgery'];
function game(extra={}){return E.create({...D.DEFAULT_CONFIG,year:2026,age:35,children:0,childProfiles:[],childAge:'none',startCash:20000000,personalBudget:20000000,salary:0,externalAllowance:0,fixedCosts:0,preferences:[],seed:0,...extra});}
function add(s,id,date='2026-01-01',slot='morning'){return E.addPlan(s,{activityId:id,date,slot,payment:'cash'});}
function finishWeek(s){for(let guard=0;guard<60&&!['review','finished'].includes(s.phase);guard++)s.phase==='event'?s.pendingEvent.catalogId==='constraint'?E.choose(s,'skip'):E.resolveAutomatic(s):E.advance(s);assert.ok(['review','finished'].includes(s.phase));return s;}
function completed(id){const s=game();assert.ok(add(s,id).ok);finishWeek(s);assert.equal(s.activityCounts[id],1);assert.deepEqual(S.validate(s),[]);return s;}
function pending(s,id,date,slot){const p={id:'plan-'+(++s.sequence),activityId:id,date,slot,payment:'cash',ruleId:null,originalDate:date};s.plan.push(p);return p;}

test('six explicit procedures have game costs, recovery periods and relationship benefits without becoming automatic or outdoor',()=>{
  assert.equal(D.ACTIVITIES.length,50);assert.deepEqual(D.ACTIVITIES.filter(a=>a.procedure).map(a=>a.id),ids);
  for(const [i,id]of ids.entries()){
    const a=D.ACTIVITY_MAP[id];assert.equal(a.categoryId,'personal');assert.equal(a.manualOnly,true);assert.equal(a.outdoor,false);assert.ok(a.cost>0);assert.ok(a.effects.relationship>=14);assert.equal(a.skillGain,0);assert.equal(a.procedure.recoveryDays,[7,2,1,1,7,7][i]);
  }
  assert.equal(D.ACTIVITY_MAP.laser_hair_removal.procedure.minIntervalDays,28);assert.equal(D.ACTIVITY_MAP.eyelid_surgery.procedure.oncePerLife,true);
  for(const id of ['walk','run','photo','garden','volunteer','motorbike_tour','domestic_trip','golf_round','circuit_drive','delivery'])assert.equal(D.ACTIVITY_MAP[id].outdoor,true);
  for(const id of ['pt','read','rest','culture','cinema'])assert.equal(D.ACTIVITY_MAP[id].outdoor,false);
});

test('laser planning and recurrence enforce a strict 28-day gap including future committed visits without mutation on refusal',()=>{
  const s=game();assert.ok(add(s,'laser_hair_removal').ok);let before=JSON.stringify(s);
  const rejected=add(s,'laser_hair_removal','2026-01-03','afternoon');assert.equal(rejected.ok,false);assert.equal(rejected.cause,'procedure-interval');assert.equal(rejected.nextDate,'2026-01-29');assert.equal(JSON.stringify(s),before);
  for(const interval of [undefined,1,3]){const state=game(),before=JSON.stringify(state);assert.equal(E.addRule(state,{activityId:'laser_hair_removal',anchor:'2026-01-01',interval}).ok,false);assert.equal(JSON.stringify(state),before);}
  const legal=game();assert.ok(E.addRule(legal,{activityId:'laser_hair_removal',anchor:'2026-01-01',kind:'weeks',interval:4}).ok);
  const future=game();pending(future,'laser_hair_removal','2026-01-29','morning');assert.deepEqual(S.validate(future),[]);before=JSON.stringify(future);
  assert.equal(E.activityAvailability(future,'laser_hair_removal','2026-01-01').allowed,true);
  assert.equal(E.activityAvailability(future,'laser_hair_removal','2026-01-02').nextDate,'2026-02-26');
  assert.equal(E.activityAvailability(future,'laser_hair_removal','2026-02-25').allowed,false);assert.equal(E.activityAvailability(future,'laser_hair_removal','2026-02-26').allowed,true);
  assert.equal(JSON.stringify(future),before);
});

test('actual laser completion preserves the exact earliest date through save/import and blocks another completed treatment too soon',()=>{
  const s=completed('laser_hair_removal');
  assert.equal(E.activityAvailability(s,'laser_hair_removal','2026-01-28').allowed,false);assert.equal(E.activityAvailability(s,'laser_hair_removal','2026-01-29').allowed,true);
  const restored=S.parse(S.serialize(s));assert.ok(restored.ok,restored.reason);assert.deepEqual(restored.state,s);
  const bad=clone(s),original=bad.log.find(entry=>entry.type==='activity'&&entry.activityId==='laser_hair_removal');
  bad.log.push({...original,id:'forged-second-treatment',date:'2026-01-03',procedureRecoveryUntil:'2026-01-05'});bad.activityCounts.laser_hair_removal=2;
  assert.ok(S.validate(bad).some(message=>/4주/.test(message)));
});

test('eyelid surgery permits only one pending or completed visit and rejects a rule conflicting with that visit',()=>{
  const s=game();assert.ok(add(s,'eyelid_surgery').ok);const before=JSON.stringify(s);
  assert.equal(add(s,'eyelid_surgery','2026-01-03','afternoon').cause,'procedure-once');assert.equal(JSON.stringify(s),before);
  assert.equal(E.addRule(s,{activityId:'eyelid_surgery',anchor:'2026-01-03',kind:'months',interval:12}).ok,false);assert.equal(JSON.stringify(s),before);
  assert.ok(E.removePlan(s,s.plan[0].id).ok);assert.ok(add(s,'eyelid_surgery','2026-01-03','afternoon').ok,'cancelled surgery is still available');
  const done=completed('eyelid_surgery');assert.equal(E.activityAvailability(done,'eyelid_surgery','2026-12-31').allowed,false);
  const restored=S.parse(S.serialize(done));assert.ok(restored.ok);assert.equal(E.activityAvailability(restored.state,'eyelid_surgery','2026-12-31').cause,'procedure-once');
});

test('future recovery blocks outdoor planning in both insertion orders but permits earlier same-day activity and indoor alternatives',()=>{
  const outdoorFirst=game();assert.ok(add(outdoorFirst,'walk','2026-01-03').ok);const before=JSON.stringify(outdoorFirst);
  assert.equal(add(outdoorFirst,'mole_removal').cause,'procedure-recovery');assert.equal(JSON.stringify(outdoorFirst),before);
  const procedureFirst=game();assert.ok(add(procedureFirst,'mole_removal').ok);
  for(const id of ['walk','garden','delivery'])assert.equal(add(procedureFirst,id,'2026-01-03').cause,'procedure-recovery');
  assert.ok(add(procedureFirst,'pt','2026-01-03').ok);assert.ok(add(procedureFirst,'rest','2026-01-03','afternoon').ok);
  const earlier=game();assert.ok(add(earlier,'walk').ok);assert.ok(add(earlier,'mole_removal','2026-01-01','afternoon').ok);
  assert.equal(E.activityAvailability(earlier,'walk','2026-01-01','morning').allowed,true);assert.equal(E.activityAvailability(earlier,'walk','2026-01-01','evening').allowed,false);
});

test('all six actual procedures produce their advertised relationship effects and inclusive recovery windows, with pure availability queries',()=>{
  for(const id of ids){
    const s=completed(id),a=D.ACTIVITY_MAP[id],entry=s.log.find(row=>row.type==='activity'&&row.activityId===id),until=C.addDays(entry.date,a.procedure.recoveryDays),before=JSON.stringify(s);
    assert.equal(entry.effects.relationship,a.effects.relationship);assert.equal(entry.procedureRecoveryUntil,until);assert.equal(s.flags.cosmeticRecoveryUntil,until);assert.equal(s.flags.cosmeticRecoveryStarted,entry.date);assert.equal(s.flags.cosmeticRecoveryActivity,id);
    assert.equal(E.activityAvailability(s,'walk',until,'evening').allowed,false);assert.equal(E.activityAvailability(s,'walk',C.addDays(until,1),'morning').allowed,true);assert.equal(E.activityAvailability(s,'read',until).allowed,true);
    assert.equal(JSON.stringify(s),before);assert.deepEqual(S.parse(S.serialize(s)).state,s);
  }
});

test('preexisting outdoor plans and reservations are stopped at execution after a procedure, without undoing the completed procedure',()=>{
  const s=game();assert.ok(add(s,'mole_removal').ok);pending(s,'walk','2026-01-01','afternoon');assert.deepEqual(S.validate(s),[]);
  for(let n=0;n<20&&!(s.phase==='event'&&s.pendingEvent.catalogId==='constraint');n++)s.phase==='event'?E.resolveAutomatic(s):E.advance(s);
  assert.equal(s.pendingEvent?.context.cause,'procedure-recovery');assert.equal(s.activityCounts.mole_removal,1);assert.equal(s.activityCounts.walk,undefined);assert.deepEqual(S.validate(s),[]);
  const cash=s.finance.cash;assert.ok(E.choose(s,'skip').ok);finishWeek(s);assert.equal(s.finance.cash,cash);assert.equal(s.activityCounts.walk,undefined);assert.ok(s.log.some(entry=>entry.type==='skipped'&&entry.activityId==='walk'&&entry.reason==='procedure-recovery'));
  const reserved=game();assert.ok(E.addRule(reserved,{activityId:'walk',anchor:'2026-01-03',kind:'weeks',interval:1}).ok);assert.ok(add(reserved,'mole_removal').ok);const result=E.confirmReservations(reserved);assert.equal(result.ok,false);assert.match(result.issues[0].reason,/2026-01-08/);
});

test('procedures never enter automatic plans and rejected unaffordable attempts create no recovery state or effects',()=>{
  const s=game({preferences:ids});assert.ok(E.prepareAutoWeek(s,{direction:'balanced'}).ok);assert.ok(s.plan.every(plan=>!D.ACTIVITY_MAP[plan.activityId].procedure));
  const poor=game({startCash:0,personalBudget:0}),before=JSON.stringify(poor);assert.equal(add(poor,'botox').ok,false);assert.equal(JSON.stringify(poor),before);
  pending(poor,'botox','2026-01-01','morning');finishWeek(poor);assert.equal(poor.activityCounts.botox,undefined);assert.equal(poor.flags.cosmeticRecoveryUntil,undefined);assert.ok(!poor.log.some(entry=>entry.procedureRecoveryUntil));assert.deepEqual(S.validate(poor),[]);
});

test('storage ties recovery flags and dates to actual procedure history while old states need no new fields',()=>{
  const old=game();assert.deepEqual(S.validate(old),[]);assert.deepEqual(S.parse(S.serialize(old)).state,old);
  const done=completed('fraxel');
  for(const mutate of [s=>delete s.flags.cosmeticRecoveryUntil,s=>{s.flags.cosmeticRecoveryStarted='2026-01-02';},s=>{s.flags.cosmeticRecoveryActivity='rest';},s=>{s.log.find(entry=>entry.activityId==='fraxel').procedureRecoveryUntil='2026-01-09';}]){const bad=clone(done);mutate(bad);assert.ok(S.validate(bad).some(message=>/시술/.test(message)));}
  old.flags.cosmeticRecoveryUntil='2026-01-08';assert.ok(S.validate(old).some(message=>/시술/.test(message)));
});

test('execution catches preexisting duplicate procedure plans, and a shorter later recovery never erases an earlier longer recovery',()=>{
  for(const [id,cause]of [['laser_hair_removal','procedure-interval'],['eyelid_surgery','procedure-once']]){
    const s=game();assert.ok(add(s,id).ok);pending(s,id,'2026-01-03','afternoon');assert.deepEqual(S.validate(s),[]);
    finishWeek(s);assert.equal(s.activityCounts[id],1);assert.ok(s.log.some(entry=>entry.type==='skipped'&&entry.activityId===id&&entry.reason===cause));assert.deepEqual(S.validate(s),[]);
  }
  const overlap=game();assert.ok(add(overlap,'mole_removal').ok);assert.ok(add(overlap,'botox','2026-01-03','afternoon').ok);finishWeek(overlap);
  assert.equal(overlap.activityCounts.mole_removal,1);assert.equal(overlap.activityCounts.botox,1);assert.equal(overlap.flags.cosmeticRecoveryUntil,'2026-01-08');assert.equal(overlap.flags.cosmeticRecoveryActivity,'mole_removal');assert.equal(E.activityAvailability(overlap,'walk','2026-01-06').allowed,false);assert.deepEqual(S.validate(overlap),[]);
});
