'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js'),C=require('./calendar.js'),R=require('./recurrence.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const parenting=D.ACTIVITIES.filter(activity=>activity.parenting);
function game(ages=[],overrides={}){
  return E.create({...D.DEFAULT_CONFIG,age:45,children:ages.length,childAge:ages.length?D.childStage(Math.min(...ages)):'none',childProfiles:ages.map(age=>({age,gender:'woman',militaryStatus:'none'})),preferences:[],seed:47,...overrides});
}
function manualWeek(state){
  for(let n=0;n<100&&!['review','finished'].includes(state.phase);n++){
    const result=state.phase==='event'?E.resolveAutomatic(state):E.advance(state);assert.ok(result.ok||state.phase==='event',result.reason);
  }
  assert.ok(['review','finished'].includes(state.phase));return state;
}
function automatic(state,until=()=>state.phase==='finished',options={}){
  for(let n=0;n<500&&!until();n++){const result=E.advanceAutomatic(state,options);assert.ok(result.ok,result.reason);}
  assert.ok(until());return state;
}
const groups=config=>[...new Set(parenting.filter(activity=>!D.activityReason(config,activity.id)).map(activity=>activity.parenting.group))];

test('parenting catalog has three free home activities for each exact age range and matches any resident child',()=>{
  assert.equal(parenting.length,9);
  for(const [age,expected] of [[0,'baby'],[2,'baby'],[3,'preschool'],[6,'preschool'],[7,'school'],[12,'school'],[13,null]])assert.deepEqual(groups(game([age]).config),expected?[expected]:[]);
  assert.deepEqual(groups(game([]).config),[]);
  assert.deepEqual(groups(game([1,5,10]).config),['baby','preschool','school']);
  for(const activity of parenting){assert.equal(activity.cost,0);assert.equal(activity.location,'home');assert.equal(activity.mode,'together');assert.equal(activity.artifact,null);assert.equal(activity.roles,null);assert.equal(activity.careOverlap,true);assert.ok(activity.minutes>=30&&activity.minutes<=60);}
  for(const role of Object.keys(D.ROLES))for(const gender of ['man','woman'])for(const maritalStatus of ['single','married','divorced','widowed'])assert.equal(D.activityReason(game([4],{role,gender,maritalStatus,careShare:0}).config,'preschool_play'),'');
  const legacy=game([]).config;Object.assign(legacy,{children:1,childProfiles:null,childAge:'school'});assert.deepEqual(groups(legacy),['school']);
});

test('unavailable parenting is rejected by manual plans, rules and newly selected preferences without mutation',()=>{
  const state=game([14]),before=JSON.stringify(state);
  assert.equal(E.addPlan(state,{activityId:'baby_feed',date:state.date,slot:'morning'}).ok,false);
  assert.equal(E.addRule(state,{activityId:'preschool_play',anchor:state.date,slot:'morning'}).ok,false);
  assert.equal(E.replaceAutoWeek(state,{preferences:['school_reading']}).ok,false);
  assert.equal(JSON.stringify(state),before);
  // Existing saved preferences remain readable, dormant and removable.
  state.config.preferences=['baby_sleep'];assert.deepEqual(E.validateConfig(state.config),[]);
  assert.ok(E.prepareAutoWeek(state).ok);assert.ok(state.plan.every(plan=>!D.ACTIVITY_MAP[plan.activityId].parenting));
  assert.ok(E.replaceAutoWeek(state,{preferences:[]}).ok);
});

test('parenting occupies the union of its work and basic care, including shared care and zero care share',()=>{
  const state=game([1,5,10],{careShare:100});
  assert.equal(E.careMinutes(state,'2026-01-03','morning'),180);
  assert.equal(E.activityTime(state,'preschool_play','2026-01-03','morning'),185);
  assert.equal(E.activityTime(state,'preschool_play','2026-01-03','afternoon'),65);
  assert.equal(E.activityTime(state,'preschool_play','2026-01-02','evening'),185);
  state.config.careShare=10;assert.equal(E.activityTime(state,'preschool_play','2026-01-03','morning'),65);
  state.config.careShare=0;assert.equal(E.activityTime(state,'preschool_play','2026-01-03','morning'),65);
  state.config.careShare=100;state.flags.householdCareSharedUntil='2026-01-10';assert.equal(E.activityTime(state,'preschool_play','2026-01-03','morning'),95);
  assert.equal(E.activityTime(state,'care','2026-01-03','morning'),130,'legacy generic care keeps its historical time formula');
});

test('completed parenting and previously saved parenting rules preserve actual overlap, daily care, counts and storage',()=>{
  const state=game([1,5,10],{careShare:100});
  assert.ok(E.addPlan(state,{activityId:'preschool_play',date:'2026-01-01',slot:'morning'}).ok);
  // Existing published saves may contain parenting rules; only new registration is excluded.
  const rule=R.createRule({id:'rule-'+(++state.sequence),activityId:'school_reading',anchor:'2026-01-03',slot:0,interval:1});state.rules.push(rule);
  assert.deepEqual(S.parse(S.serialize(state)).state,state);
  assert.ok(E.confirmReservations(state).ok);manualWeek(state);
  const first=state.log.find(log=>log.type==='activity'&&log.activityId==='preschool_play');
  assert.equal(first.minutes,185);assert.equal(first.careOverlapMinutes,60);assert.equal(first.cost,0);
  assert.equal(state.log.filter(log=>log.type==='care'&&log.date===first.date).length,1);
  assert.equal(state.activityCounts.preschool_play,1);
  assert.ok(state.log.some(log=>log.type==='activity'&&log.ruleId===rule.id&&log.careOverlapMinutes===45));
  const restored=S.parse(S.serialize(state));assert.equal(restored.ok,true,restored.reason);assert.deepEqual(restored.state,state);
  for(const value of [-1,1.5,61,181]){const corrupt=clone(state);corrupt.log.find(log=>log.id===first.id).careOverlapMinutes=value;assert.ok(S.validate(corrupt).length);}
  const wrongSlot=clone(state);wrongSlot.log.find(log=>log.id===first.id).slot='afternoon';assert.ok(S.validate(wrongSlot).length);
  const wrongType=clone(state);wrongType.log.find(log=>log.type==='daily').careOverlapMinutes=1;assert.ok(S.validate(wrongType).length);
});

test('parent auto plans rotate all matching age groups, keep manual commitments and prioritize recovery',()=>{
  const state=game([1,5,10],{preferences:['photo'],startCash:5000000,personalBudget:2000000}),seen=new Set();
  automatic(state,()=>state.date>='2026-03-01');
  for(const log of state.log.filter(log=>log.type==='activity'&&D.ACTIVITY_MAP[log.activityId].parenting))seen.add(D.ACTIVITY_MAP[log.activityId].parenting.group);
  assert.deepEqual([...seen].sort(),['baby','preschool','school']);
  assert.ok(state.log.some(log=>log.type==='activity'&&log.activityId==='rest'));
  const manual=game([5],{preferences:['read']}),commit=E.addPlan(manual,{activityId:'draw',date:'2026-01-03',slot:'afternoon'}).plan;
  assert.ok(E.prepareAutoWeek(manual,{direction:'family'}).ok);assert.deepEqual(manual.plan.find(plan=>plan.id===commit.id),commit);assert.ok(manual.plan.some(plan=>D.ACTIVITY_MAP[plan.activityId].parenting));
  const tired=game([1]);tired.stats.fatigue=90;E.prepareAutoWeek(tired);assert.ok(tired.plan.some(plan=>plan.activityId==='rest'));
  const ill=game([1]);ill.healthEpisode={subject:'self'};E.prepareAutoWeek(ill);assert.ok(ill.plan.some(plan=>plan.activityId==='rest'));assert.ok(ill.plan.every(plan=>!D.ACTIVITY_MAP[plan.activityId].parenting));
  const poor=game([7],{startCash:0,salary:0,externalAllowance:0,personalBudget:0,fixedCosts:0});E.prepareAutoWeek(poor);assert.ok(poor.plan.some(plan=>D.ACTIVITY_MAP[plan.activityId].parenting));assert.ok(poor.plan.every(plan=>D.activityPrice(poor.config,plan.activityId).amount===0));
});

test('old saves remain unchanged and generated identity/economy/preferences stay deterministic',()=>{
  const original=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/v6-young-parent.json'),'utf8'));
  const restored=S.parse(JSON.stringify(original));assert.equal(restored.ok,true,restored.reason);assert.deepEqual(restored.state,original.state);
  assert.ok(Object.keys(restored.state.skills).every(id=>!D.ACTIVITY_MAP[id].parenting));
  for(let seed=0;seed<80;seed++){const first=D.generateLife(seed),again=D.generateLife(seed);assert.deepEqual(first,again);assert.ok(first.config.preferences.every(id=>!D.ACTIVITY_MAP[id].parenting));}
});

test('grooming cadence groups haircut variants and uses 21 days or calendar months, purely',()=>{
  const state=game();state.log=[{type:'activity',activityId:'haircut_men',date:'2026-01-03'}];const before=JSON.stringify(state);
  for(const id of ['haircut','haircut_men','haircut_women']){
    assert.deepEqual(E.activityCadence(state,id,'2026-01-23'),{allowed:false,nextDate:'2026-01-24',label:'3주에 한 번'});
    assert.equal(E.activityCadence(state,id,'2026-01-24').allowed,true);
  }
  assert.deepEqual(E.activityCadence(state,'read'),{allowed:true,nextDate:null,label:''});assert.equal(JSON.stringify(state),before);
  for(const [id,done,beforeDue,due]of [['perm','2026-01-31','2026-03-30','2026-03-31'],['perm','2026-12-31','2027-02-27','2027-02-28'],['perm','2027-12-31','2028-02-28','2028-02-29'],['dye','2026-01-31','2026-04-29','2026-04-30']]){
    state.log=[{type:'activity',activityId:id,date:done}];assert.equal(E.activityCadence(state,id,beforeDue).nextDate,due);assert.equal(E.activityCadence(state,id,beforeDue).allowed,false);assert.equal(E.activityCadence(state,id,due).allowed,true);
  }
});

test('automatic cadence respects committed future appointments from either side',()=>{
  const state=game();state.plan=[{id:'future',activityId:'perm',date:'2026-03-31'}];
  assert.equal(E.activityCadence(state,'perm','2026-01-31').allowed,true);
  assert.deepEqual(E.activityCadence(state,'perm','2026-02-01'),{allowed:false,nextDate:'2026-05-31',label:'2개월에 한 번'});
  state.plan=[{id:'future',activityId:'haircut_women',date:'2026-01-24'}];
  assert.equal(E.activityCadence(state,'haircut_men','2026-01-03').allowed,true);
  assert.equal(E.activityCadence(state,'haircut','2026-01-04').nextDate,'2026-02-14');
  assert.equal(E.activityCadence(state,'haircut','2026-02-13').allowed,false);
  assert.equal(E.activityCadence(state,'haircut','2026-02-14').allowed,true);
});

test('manual grooming and recurring choices remain explicit exceptions while auto plans yield to them',()=>{
  const manual=game([],{startCash:5000000,personalBudget:2000000});
  assert.ok(E.addPlan(manual,{activityId:'haircut',date:'2026-01-01',slot:'afternoon'}).ok);
  assert.ok(E.addPlan(manual,{activityId:'haircut_women',date:'2026-01-03',slot:'afternoon'}).ok);
  const rule=E.addRule(manual,{activityId:'perm',anchor:'2026-01-02',move:'keep',slot:'evening',interval:1}).rule;
  automatic(manual,()=>manual.date>='2026-01-19');
  assert.equal(manual.log.filter(log=>log.type==='activity'&&['haircut','haircut_women'].includes(log.activityId)).length,2);
  assert.ok(manual.log.filter(log=>log.type==='activity'&&log.ruleId===rule.id).length>=3);
  const auto=game([],{preferences:['haircut_men'],startCash:5000000,personalBudget:2000000});E.prepareAutoWeek(auto);
  assert.ok(auto.plan.some(plan=>plan.activityId==='haircut_men'&&plan.automatic));
  assert.ok(E.addPlan(auto,{activityId:'haircut_women',date:'2026-01-04',slot:'evening'}).ok);
  automatic(auto,()=>auto.date>='2026-01-05');
  const grooming=auto.log.filter(log=>log.type==='activity'&&D.ACTIVITY_MAP[log.activityId].cadence?.group==='haircut');
  assert.equal(grooming.length,1);assert.equal(grooming[0].activityId,'haircut_women');
});

test('a full automatic year never accelerates any grooming cadence and restores without changes',()=>{
  const state=game([],{preferences:['haircut','haircut_men','haircut_women','perm','dye'],salary:10000000,startCash:20000000,personalBudget:10000000});automatic(state);
  for(const group of ['haircut','perm','dye']){
    const visits=state.log.filter(log=>log.type==='activity'&&D.ACTIVITY_MAP[log.activityId].cadence?.group===group);
    assert.ok(visits.length>=2,group+' should actually recur');
    for(let i=1;i<visits.length;i++){const rule=D.ACTIVITY_MAP[visits[i].activityId].cadence,due=rule.unit==='weeks'?C.addDays(visits[i-1].date,rule.interval*7):C.addMonths(visits[i-1].date,rule.interval);assert.ok(visits[i].date>=due,group+': '+visits[i-1].date+' -> '+visits[i].date);}
  }
  const restored=S.parse(S.serialize(state));assert.equal(restored.ok,true,restored.reason);assert.deepEqual(restored.state,state);
});
