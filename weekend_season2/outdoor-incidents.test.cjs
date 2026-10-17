'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),F=require('./finance.js'),S=require('./storage.js');
const ids=['motorbike_tour','domestic_trip','golf_round','circuit_drive'];
const clone=value=>JSON.parse(JSON.stringify(value));
const nextRng=value=>(Math.imul(1664525,value>>>0)+1013904223)>>>0;
const game=overrides=>E.create({...D.DEFAULT_CONFIG,year:2026,seed:1664,salary:0,externalAllowance:0,fixedCosts:0,startCash:5000000,personalBudget:5000000,preferences:[],...overrides});
function plan(state,id='circuit_drive',slot='afternoon'){const result=E.addPlan(state,{date:state.date,slot,activityId:id});assert.ok(result.ok,result.reason);return result.plan;}
function manualUntil(state,until){for(let i=0;i<100&&!until();i++){const result=state.phase==='event'?E.resolveAutomatic(state):state.phase==='review'?E.finishReview(state):E.advance(state);assert.ok(result.ok||state.phase==='event',result.reason);}assert.ok(until());}

test('four costly outings are explicit half-day choices with bounded durations and adult driving eligibility',()=>{
  assert.deepEqual(ids.map(id=>D.ACTIVITY_MAP[id].cost),[180000,150000,250000,450000]);
  for(const id of ids){const a=D.ACTIVITY_MAP[id],state=game();assert.equal(a.manualOnly,true);assert.equal(a.location,'local');assert.equal(a.artifact,null);assert.ok(E.activityTime(state,id,state.date,'afternoon')<=240);assert.equal(D.activityReason(state.config,id),'');assert.ok(E.addPlan(state,{date:state.date,slot:'afternoon',activityId:id}).ok);}
  for(const id of ['motorbike_tour','circuit_drive'])assert.ok(D.activityReason({...D.DEFAULT_CONFIG,age:17},id));
  const longTravel=game({region:'rural',transport:'walk'}),before=JSON.stringify(longTravel);
  assert.equal(E.addPlan(longTravel,{date:longTravel.date,slot:'afternoon',activityId:'domestic_trip'}).ok,false);assert.equal(JSON.stringify(longTravel),before);
});

test('generation, all automatic directions and new auto preferences never introduce manual-only outings',()=>{
  assert.ok(D.DEFAULT_CONFIG.preferences.every(id=>!D.ACTIVITY_MAP[id].manualOnly));
  for(let seed=0;seed<100;seed++)assert.ok(D.generateLife(seed).config.preferences.every(id=>!D.ACTIVITY_MAP[id].manualOnly));
  for(const direction of E.AUTO_DIRECTIONS){const state=game({preferences:ids});const rng=clone(state.rng);assert.ok(E.prepareAutoWeek(state,{direction}).ok);assert.ok(state.plan.every(item=>!D.ACTIVITY_MAP[item.activityId].manualOnly));assert.deepEqual(state.rng,rng);}
  const state=game(),before=JSON.stringify(state);assert.equal(E.replaceAutoWeek(state,{preferences:['motorbike_tour']}).ok,false);assert.equal(JSON.stringify(state),before);
  const recurring=game();assert.ok(E.addRule(recurring,{activityId:'domestic_trip',anchor:recurring.date,slot:'afternoon'}).ok);assert.ok(E.confirmReservations(recurring).ok);assert.ok(recurring.plan.some(item=>item.activityId==='domestic_trip'&&item.ruleId));
});

test('planning, budget rejection, cancellation and a failed execution never roll accident risk',()=>{
  const poor=game({startCash:10000,personalBudget:10000}),poorBefore=JSON.stringify(poor);assert.equal(E.addPlan(poor,{date:poor.date,slot:'afternoon',activityId:'motorbike_tour'}).ok,false);assert.equal(JSON.stringify(poor),poorBefore);
  const state=game(),rng=clone(state.rng),commit=plan(state);
  for(let i=0;i<3;i++){E.currentWeek(state);E.activityTime(state,'circuit_drive',state.date,'afternoon');E.activityCadence(state,'circuit_drive');assert.deepEqual(state.rng,rng);}
  E.removePlan(state,commit.id);E.advance(state);assert.equal(state.rng.followup,rng.followup);assert.ok(state.log.every(log=>log.type!=='incident'));assert.ok(state.finance.ledger.every(item=>item.type!=='incident-cost'));
  const blocked=game({startCash:500000,personalBudget:500000});plan(blocked);plan(blocked,'perm','morning');const before=blocked.rng.followup;
  E.advance(blocked);assert.equal(blocked.phase,'event');assert.equal(blocked.pendingEvent.catalogId,'constraint');assert.equal(blocked.rng.followup,before);assert.ok(blocked.log.every(log=>log.type!=='incident'));assert.deepEqual(S.validate(blocked),[]);
  assert.ok(E.choose(blocked,'skip').ok);assert.equal(blocked.rng.followup,before);
});

test('successful risky activities consume exactly one draw when safe and three when an incident occurs',()=>{
  const safe=game({seed:0}),initial=safe.rng.followup;plan(safe,'motorbike_tour');E.advance(safe);
  assert.ok(safe.log.some(log=>log.type==='activity'&&log.activityId==='motorbike_tour'));assert.ok(safe.log.every(log=>log.type!=='incident'));assert.equal(safe.rng.followup,nextRng(initial));
  for(const id of ['motorbike_tour','circuit_drive']){
    const state=game(),before=state.rng.followup;plan(state,id);E.advance(state);
    assert.equal(state.rng.followup,nextRng(nextRng(nextRng(before))));const incident=state.log.find(log=>log.type==='incident');assert.ok(incident,id);
    const risk=D.ACTIVITY_MAP[id].risk;assert.ok(incident.repairCost>=risk.repairMin&&incident.repairCost<=risk.repairMax);assert.ok(incident.medicalCost>=risk.medicalMin&&incident.medicalCost<=risk.medicalMax);assert.deepEqual(incident.effects,{health:-8,fatigue:12,mood:-10});assert.deepEqual(S.validate(state),[]);
  }
  const calm=game(),before=calm.rng.followup;plan(calm,'golf_round');E.advance(calm);assert.equal(calm.rng.followup,before);assert.ok(calm.log.every(log=>log.type!=='incident'));
});

test('an actual incident is an extra reconciled expense exactly once, and save restoration replays it identically',()=>{
  const state=game();plan(state);const restored=S.parse(S.serialize(state));assert.equal(restored.ok,true,restored.reason);
  E.advance(state);E.advance(restored.state);assert.deepEqual(restored.state,state);
  const incident=state.log.find(log=>log.type==='incident'),transaction=state.finance.ledger.find(item=>item.type==='incident-cost');
  assert.equal(incident.total,920000);assert.equal(incident.repairCost,851000);assert.equal(incident.medicalCost,69000);assert.equal(incident.paid,incident.total);assert.equal(incident.unpaid,0);
  assert.equal(transaction.reference,incident.reference);assert.equal(transaction.amount,incident.total);
  const summary=F.summary(state.finance,state.config);assert.equal(summary.consumption,D.ACTIVITY_MAP.circuit_drive.cost+incident.total);assert.equal(summary.incidentCosts,incident.total);assert.equal(summary.incidentRepair,incident.repairCost);assert.equal(summary.incidentMedical,incident.medicalCost);
  const before=JSON.stringify(state),duplicate=F.chargeIncident(state.finance,incident.date,{repairCost:incident.repairCost,medicalCost:incident.medicalCost,activityId:incident.activityId,reference:incident.reference,label:transaction.label});assert.equal(duplicate.duplicate,true);assert.equal(JSON.stringify(state),before);
  assert.deepEqual(S.parse(S.serialize(state)).state,state);
});

test('unaffordable accident costs remain visible debt and actual later income pays them once',()=>{
  const state=game({startCash:450000,personalBudget:450000,salary:1000000,payDay:5});plan(state);E.advance(state);
  const incident=state.log.find(log=>log.type==='incident');assert.equal(incident.total,920000);assert.equal(incident.paid,0);assert.equal(incident.unpaid,920000);
  assert.equal(state.finance.incidentArrears,920000);assert.equal(state.finance.cash,0);assert.equal(state.finance.monthSpent,1370000);assert.equal(F.summary(state.finance,state.config).debt,920000);assert.equal(F.canSpend(state.finance,1,'card',state.config).ok,false);assert.equal(F.canSpend(state.finance,0,'cash',state.config).ok,true);
  const restored=S.parse(S.serialize(state));assert.equal(restored.ok,true,restored.reason);
  manualUntil(state,()=>state.date>='2026-01-06');manualUntil(restored.state,()=>restored.state.date>='2026-01-06');assert.deepEqual(restored.state,state);
  assert.equal(state.finance.incidentArrears,0);assert.equal(state.finance.ledger.filter(item=>item.type==='incident-arrears-payment').reduce((sum,item)=>sum+item.amount,0),920000);assert.equal(state.finance.ledger.filter(item=>item.type==='incident-cost').length,1);assert.deepEqual(S.validate(state),[]);
});

test('storage rejects changed incident costs, orphaned logs, wrong references, duplicate charges and missing debt',()=>{
  const state=game({startCash:450000,personalBudget:450000});plan(state);E.advance(state);assert.deepEqual(S.validate(state),[]);
  const mutations=[
    s=>s.log.find(item=>item.type==='incident').repairCost++,
    s=>s.finance.ledger.find(item=>item.type==='incident-cost').medicalCost++,
    s=>s.finance.ledger.find(item=>item.type==='incident-cost').reference='activity-incident:plan-9999',
    s=>{s.log=s.log.filter(item=>item.type!=='incident');},
    s=>{const item=clone(s.finance.ledger.find(item=>item.type==='incident-cost'));item.id='tx-'+(s.finance.ledger.length+1);s.finance.ledger.push(item);},
    s=>{delete s.finance.incidentArrears;},
    s=>{s.finance.incidentArrears=-1;},
    s=>s.log.find(item=>item.type==='activity'&&item.activityId==='circuit_drive').planId='plan-9999'
  ];
  for(const mutate of mutations){const corrupt=clone(state);mutate(corrupt);assert.ok(S.validate(corrupt).length,mutate.toString());}
});
