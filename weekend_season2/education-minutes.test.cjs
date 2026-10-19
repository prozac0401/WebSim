'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const education=['preschool_play','school_homework','school_reading'];
function game(extra={}){
  return E.create({...D.DEFAULT_CONFIG,age:45,children:3,childAge:'toddler',childProfiles:[1,4,9].map(age=>({age,gender:'woman',militaryStatus:'none'})),careShare:0,preferences:[],seed:47,...extra});
}
function week(state){
  for(let n=0;n<50&&!['review','finished'].includes(state.phase);n++){
    const result=state.phase==='event'?E.resolveAutomatic(state):E.advance(state);assert.ok(result.ok||state.phase==='event',result.reason);
  }
  assert.equal(state.phase,'review');return state;
}
function add(state,id,minutes,slot='morning'){
  const result=E.addPlan(state,{activityId:id,date:'2026-01-01',slot,...(minutes!==undefined?{activityMinutes:minutes}:{})});assert.ok(result.ok,result.reason);return result.plan;
}
function logFor(state,id){return state.log.find(log=>log.type==='activity'&&log.activityId===id);}

test('only the three age-specific education activities expose configurable integer minutes, without mutating defaults',()=>{
  assert.deepEqual(D.ACTIVITIES.filter(activity=>activity.education).map(activity=>activity.id),education);
  const config=game({educationMinutes:{school_reading:120}}).config,before=JSON.stringify(config);
  for(const id of education){assert.deepEqual(D.ACTIVITY_MAP[id].education,{familyCapMinutes:60});assert.equal(D.activityMinutes(null,id),D.ACTIVITY_MAP[id].minutes);}
  assert.equal(D.activityMinutes(config,'school_reading'),120);assert.equal(D.activityMinutes(config,'school_reading',30),30);
  assert.equal(D.activityMinutes(config,'read'),D.ACTIVITY_MAP.read.minutes);assert.equal(JSON.stringify(config),before);
  for(const minutes of [1,60,235,240,1440])assert.deepEqual(E.validateConfig({...config,educationMinutes:{school_reading:minutes}}),[]);
  for(const value of [0,-1,1.5,1441,NaN,Infinity,'60',null]){
    assert.ok(E.validateConfig({...config,educationMinutes:{school_reading:value}}).length);
    assert.throws(()=>D.activityMinutes(config,'school_reading',value));
  }
  for(const value of [null,[],60,'60',{read:60},{unknown:60}])assert.ok(E.validateConfig({...config,educationMinutes:value}).length);
  assert.equal(Object.hasOwn(D.DEFAULT_CONFIG,'educationMinutes'),false);
});

test('actual 30, 60, 120 and 235 minute sessions reach the same family maximum from 60 minutes onward',()=>{
  for(const id of education){
    const logs=[];
    for(const minutes of [30,60,120,235]){
      const state=game({educationMinutes:{[id]:minutes}}),plan=add(state,id);
      assert.equal(plan.activityMinutes,minutes);week(state);
      const log=logFor(state,id);assert.ok(log,id+'/'+minutes);logs.push(log);
      assert.equal(log.activityMinutes,minutes);assert.equal(log.minutes,minutes+5);assert.equal(log.careOverlapMinutes,0);
      assert.equal(log.effects.family,D.ACTIVITY_MAP[id].effects.family*Math.min(minutes,60)/60);
      assert.deepEqual(S.validate(state),[]);
    }
    assert.deepEqual(logs[1].effects,logs[2].effects);assert.deepEqual(logs[2].effects,logs[3].effects,'extra minutes do not amplify other effects');
    const {family:shortFamily,...short}=logs[0].effects,{family:longFamily,...long}=logs[1].effects;
    assert.deepEqual(short,long);assert.equal(shortFamily,longFamily/2);
  }
});

test('input beyond an hour remains valid while the full 240-minute slot includes preparation and rejects atomically',()=>{
  for(const minutes of [236,240,1440]){
    const state=game({educationMinutes:{school_reading:minutes}}),before=JSON.stringify(state);
    const result=E.addPlan(state,{activityId:'school_reading',date:state.date,slot:'morning'});
    assert.equal(result.ok,false);assert.equal(result.cause,'time');assert.equal(result.details.requiredMinutes,minutes+5);assert.equal(JSON.stringify(state),before);
  }
  for(const minutes of [0,-1,30.5,1441,'60',null]){
    const state=game(),before=JSON.stringify(state);assert.equal(E.addPlan(state,{activityId:'school_reading',date:state.date,slot:'morning',activityMinutes:minutes}).ok,false);assert.equal(JSON.stringify(state),before);
  }
  const state=game(),before=JSON.stringify(state);assert.equal(E.addPlan(state,{activityId:'read',date:state.date,slot:'morning',activityMinutes:30}).ok,false);assert.equal(JSON.stringify(state),before);
});

test('a confirmed education snapshot survives setting changes, restore and automatic preparation',()=>{
  const state=game({educationMinutes:{school_reading:120}}),plan=add(state,'school_reading');
  state.config.educationMinutes.school_reading=30;
  assert.ok(E.prepareAutoWeek(state).ok);assert.deepEqual(state.plan.find(item=>item.id===plan.id),plan);
  const restored=S.parse(S.serialize(state));assert.ok(restored.ok,restored.reason);assert.deepEqual(restored.state,state);
  week(state);week(restored.state);assert.deepEqual(restored.state,state);
  assert.equal(logFor(state,'school_reading').activityMinutes,120);assert.equal(logFor(state,'school_reading').minutes,125);
});

test('existing plans without a duration retain catalog time while old completed records and saves remain untouched',()=>{
  const state=game(),plan=add(state,'school_homework');delete plan.activityMinutes;
  state.config.educationMinutes={school_homework:120};const before=clone(state),restored=S.parse(S.serialize(state));
  assert.ok(restored.ok,restored.reason);assert.deepEqual(restored.state,before);assert.equal(Object.hasOwn(restored.state.plan[0],'activityMinutes'),false);
  week(restored.state);const log=logFor(restored.state,'school_homework');assert.equal(log.activityMinutes,45);assert.equal(log.minutes,50);assert.equal(log.effects.family,2.25);
  const legacy=clone(restored.state);delete logFor(legacy,'school_homework').activityMinutes;logFor(legacy,'school_homework').effects.family=3;
  const loaded=S.parse(S.serialize(legacy));assert.ok(loaded.ok,loaded.reason);assert.deepEqual(loaded.state,legacy,'past completed effects are never recalculated');
  const old=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/v6-young-parent.json'),'utf8')),parsed=S.parse(JSON.stringify(old));
  assert.ok(parsed.ok,parsed.reason);assert.deepEqual(parsed.state,old.state);
});

test('education time overlaps baseline care once, including shorter work, longer work and shared care',()=>{
  for(const [minutes,share]of [[30,100],[60,100],[120,100],[235,100],[120,10],[30,0]]){
    const state=game({careShare:share,educationMinutes:{school_reading:minutes}}),care=E.careMinutes(state,state.date,'morning');
    assert.equal(E.activityTime(state,'school_reading',state.date,'morning'),5+Math.max(minutes,care));
    add(state,'school_reading');week(state);const log=logFor(state,'school_reading');
    assert.equal(log.careOverlapMinutes,Math.min(minutes,care));assert.equal(log.minutes,5+Math.max(minutes,care));assert.deepEqual(S.validate(state),[]);
  }
});

test('education still requires a resident child in the matching age range, regardless of configured time',()=>{
  for(const age of [0,2,3,6,7,12,13,24])for(const id of education){
    const state=game({children:1,childAge:D.childStage(age),childProfiles:[{age,gender:'woman',militaryStatus:'none'}],educationMinutes:{[id]:120}}),before=JSON.stringify(state);
    const available=id==='preschool_play'?age>=3&&age<=6:age>=7&&age<=12;
    const result=E.addPlan(state,{activityId:id,date:state.date,slot:'morning'});assert.equal(result.ok,available,id+'/'+age);if(!available)assert.equal(JSON.stringify(state),before);
  }
});

test('automatic education captures the configured time and leaves impossible sessions out without changing preferences',()=>{
  const state=game({preferences:['school_reading'],educationMinutes:{school_reading:120}});assert.ok(E.prepareAutoWeek(state,{direction:'hobby'}).ok);
  assert.equal(state.plan.find(plan=>plan.activityId==='school_reading').activityMinutes,120);
  const impossible=game({preferences:['school_reading'],educationMinutes:{school_reading:1440}});assert.ok(E.prepareAutoWeek(impossible,{direction:'hobby'}).ok);
  assert.ok(impossible.plan.every(plan=>plan.activityId!=='school_reading'));assert.deepEqual(impossible.config.preferences,['school_reading']);assert.deepEqual(S.validate(impossible),[]);
});

function conflict(){
  const state=game({careShare:100,educationMinutes:{school_reading:120}});add(state,'school_reading',undefined,'afternoon');
  state.queue.push({catalogId:'care_appointment',date:state.date,context:{}});
  E.advance(state);assert.equal(state.pendingEvent.catalogId,'care_appointment');assert.ok(E.choose(state,'accompany').ok);
  E.advance(state);assert.equal(state.pendingEvent.catalogId,'constraint');return state;
}
test('rescheduling keeps education duration and a free recovery choice grants no education effect or leftover snapshot',()=>{
  const moved=conflict(),id=moved.plan[0].id;moved.config.educationMinutes.school_reading=30;
  assert.ok(E.choose(moved,'reschedule').ok);assert.equal(moved.plan.find(plan=>plan.id===id).activityMinutes,120);week(moved);
  assert.equal(logFor(moved,'school_reading').activityMinutes,120);assert.equal(logFor(moved,'school_reading').minutes,125);assert.deepEqual(S.validate(moved),[]);
  const free=conflict(),family=free.stats.family;assert.ok(E.choose(free,'free').ok);assert.equal(free.stats.family,family);assert.equal(free.plan.length,0);
  assert.ok(free.log.some(log=>log.type==='recovery'&&log.replacedActivity==='school_reading'&&log.minutes===90));week(free);
  assert.equal(logFor(free,'school_reading'),undefined);assert.deepEqual(S.validate(free),[]);
});

test('automatic rearrangement uses the confirmed duration, including a legacy plan without a snapshot',()=>{
  for(const legacy of [false,true]){
    const state=game({careShare:100,educationMinutes:{school_reading:120}}),plan=add(state,'school_reading',legacy?45:120,'afternoon');
    if(legacy)delete plan.activityMinutes;
    state.config.educationMinutes.school_reading=235;
    state.queue.push({catalogId:'care_appointment',date:state.date,context:{}});
    E.advance(state);assert.equal(state.pendingEvent.catalogId,'care_appointment');assert.ok(E.choose(state,'accompany').ok);
    const result=E.advanceAutomatic(state,{maxDays:1});assert.ok(result.ok,result.reason);
    const log=logFor(state,'school_reading');assert.ok(log);assert.equal(log.activityMinutes,legacy?45:120);assert.equal(log.slot,legacy?'afternoon':'evening');
    assert.equal(log.minutes,legacy?200:125);assert.deepEqual(S.validate(state),[]);
  }
});

test('storage rejects corrupt educational settings, snapshot lengths, overlap and capped family effects',()=>{
  const planned=game({careShare:100});add(planned,'school_reading',120);
  for(const minutes of [0,1.5,236,1441,'120',null]){const bad=clone(planned);bad.plan[0].activityMinutes=minutes;assert.ok(S.validate(bad).length);}
  const wrongActivity=clone(planned);wrongActivity.plan[0].activityId='read';assert.ok(S.validate(wrongActivity).length);
  week(planned);assert.deepEqual(S.validate(planned),[]);
  for(const change of [{activityMinutes:0},{activityMinutes:30},{activityMinutes:240},{activityMinutes:1441},{activityMinutes:120.5},{careOverlapMinutes:121},{careOverlapMinutes:-1},{minutes:120},{minutes:241}]){
    const bad=clone(planned);Object.assign(logFor(bad,'school_reading'),change);assert.ok(S.validate(bad).length,JSON.stringify(change));
  }
  const effect=clone(planned);logFor(effect,'school_reading').effects.family=8;assert.ok(S.validate(effect).length);
  const missingOverlap=clone(planned);delete logFor(missingOverlap,'school_reading').careOverlapMinutes;assert.ok(S.validate(missingOverlap).length);
  const nonActivity=clone(planned);nonActivity.log.find(log=>log.type==='daily').activityMinutes=60;assert.ok(S.validate(nonActivity).length);
});
