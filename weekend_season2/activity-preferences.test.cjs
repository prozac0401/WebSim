'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js');
const outings=['motorbike_tour','domestic_trip','golf_round','circuit_drive'];
const clone=value=>JSON.parse(JSON.stringify(value));
function game(extra={}){return E.create({...D.DEFAULT_CONFIG,year:2026,age:35,role:'worker',gender:'woman',children:0,childProfiles:[],childAge:'none',region:'city',transport:'transit',startCash:5000000,personalBudget:5000000,salary:0,externalAllowance:0,fixedCosts:0,preferences:[],seed:0,...extra});}
function week(s){for(let guard=0;guard<50&&!['review','finished'].includes(s.phase);guard++){const result=s.phase==='event'?E.resolveAutomatic(s):E.advance(s);assert.ok(result.ok||s.phase==='event',result.reason);}assert.ok(['review','finished'].includes(s.phase));}

test('one visible haircut has gender-independent timing/effects while legacy rows retain their original definitions',()=>{
  assert.deepEqual(D.ACTIVITIES.filter(a=>a.cadence?.group==='haircut'&&!a.legacyOnly).map(a=>a.id),['haircut']);
  const cut=D.ACTIVITY_MAP.haircut;assert.equal(cut.name,'커트');assert.equal(cut.minutes,60);assert.equal(cut.prep,10);assert.deepEqual(cut.effects,{fatigue:0,mood:5});
  for(const [id,name,minutes,cost]of [['haircut_men','남성 커트',40,20000],['haircut_women','여성 커트',50,25000]]){
    const old=D.ACTIVITY_MAP[id];assert.equal(old.legacyOnly,true);assert.equal(old.canonicalId,'haircut');assert.equal(old.name,name);assert.equal(old.minutes,minutes);assert.equal(old.cost,cost);assert.deepEqual(old.effects,{fatigue:0,mood:6,happiness:3});
  }
  assert.equal(E.activityTime(game({gender:'man'}),'haircut','2026-01-01','morning'),E.activityTime(game({gender:'woman'}),'haircut','2026-01-01','morning'));
});

test('legacy haircut preferences are purely canonicalized and deduplicated for new automatic choices',()=>{
  const s=game({preferences:['haircut_men','haircut_women','haircut','read']}),before=JSON.stringify(s);
  assert.deepEqual(D.preferenceActivityIds(s.config),['haircut','read']);assert.equal(D.canonicalActivityId('haircut_women'),'haircut');assert.equal(D.canonicalActivityId('read'),'read');assert.equal(JSON.stringify(s),before);
  const preferences=clone(s.config.preferences);assert.ok(E.prepareAutoWeek(s).ok);
  assert.equal(s.plan.filter(p=>D.ACTIVITY_MAP[p.activityId].cadence?.group==='haircut').length,1);assert.ok(s.plan.some(p=>p.activityId==='haircut'));assert.ok(s.plan.every(p=>!D.ACTIVITY_MAP[p.activityId].legacyOnly));assert.deepEqual(s.config.preferences,preferences);assert.deepEqual(S.parse(S.serialize(s)).state,s);
});

test('legacy confirmed haircuts and their financial history survive save/load and still reserve the common cadence',()=>{
  const s=game({preferences:['haircut_men','haircut_women']});
  assert.ok(E.addPlan(s,{activityId:'haircut_women',date:'2026-01-01',slot:'afternoon'}).ok);assert.ok(E.prepareAutoWeek(s).ok);
  assert.equal(s.plan.filter(p=>D.ACTIVITY_MAP[p.activityId].cadence?.group==='haircut').length,1);week(s);
  const log=s.log.find(entry=>entry.type==='activity'&&entry.activityId==='haircut_women');assert.ok(log);assert.equal(log.minutes,90);assert.equal(log.effects.happiness,4);assert.equal(s.activityCounts.haircut_women,1);assert.equal(s.activityCounts.haircut,undefined);
  const before=clone(s),restored=S.parse(S.serialize(s));assert.ok(restored.ok,restored.reason);assert.deepEqual(restored.state,before);assert.deepEqual(s,before);
  assert.equal(E.activityCadence(restored.state,'haircut','2026-01-21').allowed,false);assert.equal(E.activityCadence(restored.state,'haircut','2026-01-22').allowed,true);
});

test('every role and gender can select every costly hobby even with no income, while affordability controls placement',()=>{
  for(const role of Object.keys(D.ROLES))for(const gender of ['woman','man'])for(const id of outings){
    const s=game({role,gender});assert.equal(D.activityReason(s.config,id),'');assert.equal(D.ACTIVITY_MAP[id].manualOnly,undefined);assert.equal(D.ACTIVITY_MAP[id].requiresPreference,true);
    assert.ok(E.replaceAutoWeek(s,{direction:'hobby',preferences:[id]}).ok);assert.deepEqual(s.config.preferences,[id]);assert.ok(s.plan.some(plan=>plan.activityId===id&&plan.automatic),role+'/'+gender+'/'+id);
    const poor=game({role,gender,startCash:0,personalBudget:0});assert.ok(E.replaceAutoWeek(poor,{preferences:[id]}).ok);assert.deepEqual(poor.config.preferences,[id]);assert.ok(poor.plan.every(plan=>plan.activityId!==id));assert.equal(poor.finance.cash,0);
  }
});

test('unselected costly hobbies and all cosmetic procedures remain absent from automatic fallback',()=>{
  for(const direction of E.AUTO_DIRECTIONS){const s=game();assert.ok(E.prepareAutoWeek(s,{direction}).ok);assert.ok(s.plan.every(plan=>!D.ACTIVITY_MAP[plan.activityId].requiresPreference&&!D.ACTIVITY_MAP[plan.activityId].procedure));}
  const s=game(),before=JSON.stringify(s);assert.equal(E.replaceAutoWeek(s,{preferences:['botox']}).ok,false);assert.equal(JSON.stringify(s),before);
});

test('selected costly activities still respect travel, care, recovery and money reserved for manual appointments',()=>{
  const slow=game({region:'rural',transport:'walk',preferences:outings});assert.ok(E.prepareAutoWeek(slow,{direction:'hobby'}).ok);assert.ok(slow.plan.every(plan=>!outings.includes(plan.activityId)));
  const parent=game({children:1,childAge:'toddler',childProfiles:[{age:1,gender:'woman',militaryStatus:'none'}],careShare:100,preferences:['motorbike_tour']});assert.ok(E.prepareAutoWeek(parent,{direction:'hobby'}).ok);const outing=parent.plan.find(plan=>plan.activityId==='motorbike_tour');assert.ok(outing);assert.notEqual(outing.slot,'morning');assert.ok(E.activityTime(parent,outing.activityId,outing.date,outing.slot)<=240);
  const reserved=game({startCash:500000,personalBudget:500000,preferences:['circuit_drive']});assert.ok(E.addPlan(reserved,{activityId:'golf_round',date:'2026-01-04',slot:'afternoon'}).ok);assert.ok(E.prepareAutoWeek(reserved,{direction:'hobby'}).ok);assert.ok(reserved.plan.some(plan=>plan.activityId==='golf_round'&&!plan.automatic));assert.ok(reserved.plan.every(plan=>plan.activityId!=='circuit_drive'));
  const recovering=game({preferences:outings});assert.ok(E.addPlan(recovering,{activityId:'fraxel',date:'2026-01-01',slot:'morning'}).ok);assert.ok(E.prepareAutoWeek(recovering,{direction:'hobby'}).ok);assert.ok(recovering.plan.every(plan=>!outings.includes(plan.activityId)));
});

test('a selected automatic risky hobby charges its real incident once and resumes identically from the planned state',()=>{
  const s=game({seed:1664,preferences:['circuit_drive']}),rng=clone(s.rng);assert.ok(E.prepareAutoWeek(s,{direction:'hobby'}).ok);assert.deepEqual(s.rng,rng);assert.ok(s.plan.some(plan=>plan.activityId==='circuit_drive'));
  const restored=S.parse(S.serialize(s));assert.ok(restored.ok,restored.reason);week(s);week(restored.state);assert.deepEqual(restored.state,s);
  assert.equal(s.activityCounts.circuit_drive,1);assert.equal(s.log.filter(entry=>entry.type==='incident').length,1);assert.equal(s.finance.ledger.filter(entry=>entry.type==='incident-cost').length,1);assert.deepEqual(S.validate(s),[]);
});

test('a stale automatic costly plan cannot execute without its selected preference, while explicit plans need no preference',()=>{
  const s=game({preferences:['motorbike_tour']});assert.ok(E.prepareAutoWeek(s,{direction:'hobby'}).ok);s.config.preferences=[];
  const rng=s.rng.followup;week(s);assert.equal(s.activityCounts.motorbike_tour,undefined);assert.equal(s.rng.followup,rng);assert.ok(s.log.some(entry=>entry.type==='skipped'&&entry.activityId==='motorbike_tour'));assert.deepEqual(S.validate(s),[]);
  const manual=game();assert.ok(E.addPlan(manual,{activityId:'domestic_trip',date:'2026-01-01',slot:'afternoon'}).ok);week(manual);assert.equal(manual.activityCounts.domestic_trip,1);
});
