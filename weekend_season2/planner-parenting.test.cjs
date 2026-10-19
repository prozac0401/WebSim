const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js'),B=require('./planner-bridge.js');
const completedYear=require('./fixtures/completed-year.cjs');
const groups=[{age:1,ids:['baby_feed','baby_change','baby_sleep']},{age:4,ids:['preschool_hygiene','preschool_play','preschool_ready']},{age:9,ids:['school_homework','school_reading','school_tidy']}];

function completedParent(age,ids,careShare=100){
  const state=E.create({...D.DEFAULT_CONFIG,year:2026,seed:47,children:1,childAge:age<=2?'toddler':age<=6?'preschool':'school',childProfiles:[{age,gender:'woman',militaryStatus:'none'}],careShare,preferences:[],personalBudget:1000000,startCash:5000000});
  ids.forEach((activityId,index)=>{const result=E.addPlan(state,{date:'2026-01-03',slot:['morning','afternoon','evening'][index],activityId,payment:'cash'});assert.ok(result.ok,result.reason);});
  for(let turns=0;state.phase!=='finished'&&turns<400;turns++){const result=E.advanceAutomatic(state);assert.ok(result.ok,result.reason);}
  assert.equal(state.phase,'finished');assert.deepEqual(S.validate(state),[]);return state;
}

test('parenting records transfer their actual activity plus residual care once, for all nine tasks and overlap boundaries',()=>{
  for(const {age,ids,share=100}of [...groups,{...groups[0],share:10},{...groups[0],share:0}]){
    const state=completedParent(age,ids,share),before=JSON.stringify(state),draft=B.createDraft(state,{today:'2026-01-03'});
    assert.ok(B.validateDraft(draft).ok);assert.equal(draft.source.mode,'experienced');
    const records=state.log.filter(log=>log.date==='2026-01-03'),tasks=records.filter(log=>log.type==='activity');
    assert.deepEqual(tasks.map(log=>log.activityId),ids,'the engine must really complete the requested tasks');
    const care=records.filter(log=>log.type==='care').reduce((sum,log)=>sum+log.minutes,0),overlap=tasks.reduce((sum,log)=>sum+(log.careOverlapMinutes||0),0);
    const events=draft.planner.events.filter(event=>event.sourceDate==='2026-01-03');
    for(const log of tasks){
      const activity=D.ACTIVITY_MAP[log.activityId],event=events.find(event=>event.sourceLabel===activity.name);
      assert.ok(event,activity.name);assert.equal(event.type,'family_dining');assert.equal(event.sourceKind,'actual');
      assert.equal(event.sourceMinutes,activity.minutes+activity.prep);assert.equal(event.travel,0);
      assert.equal(log.careOverlapMinutes,log.slot==='morning'?Math.min(care,activity.minutes):0);
    }
    const baseline=events.find(event=>event.sourceLabel.includes('기본 돌봄'));
    assert.equal(baseline?.sourceMinutes||0,Math.max(0,care-overlap));
    assert.equal(events.reduce((sum,event)=>sum+event.sourceMinutes,0),tasks.reduce((sum,log)=>sum+log.minutes,0),'time occupied by care and activity is a union, not two copies');
    if(share===10){assert.ok(overlap>0);assert.equal(baseline,undefined,'a shorter baseline is fully covered by the task');}
    assert.equal(JSON.stringify(state),before,'draft transfer must preserve full source state including its overlap records');
  }
});

test('weekend averages subtract recorded parenting overlap before dividing by every observed Saturday',()=>{
  const state=completedParent(groups[0].age,groups[0].ids),saturdays=state.log.filter(log=>log.type==='daily'&&new Date(log.date+'T12:00:00Z').getUTCDay()===6);
  const total=saturdays.reduce((sum,day)=>{
    const logs=state.log.filter(log=>log.date===day.date),activities=logs.filter(log=>log.type==='activity'&&log.slot==='morning');
    if(activities.some(log=>log.activityId==='care'))return sum;
    const care=logs.filter(log=>log.type==='care').reduce((n,log)=>n+log.minutes,0);
    return sum+Math.max(0,care-activities.reduce((n,log)=>n+(log.careOverlapMinutes||0),0));
  },0);
  const draft=B.createDraft(state,{today:'2027-01-02'}),baseline=draft.planner.events.find(event=>event.day==='sat'&&event.sourceLabel.includes('기본 돌봄'));
  assert.equal(draft.source.mode,'year-average');assert.ok(baseline);assert.equal(baseline.sourceKind,'average');
  assert.equal(baseline.sourceMinutes,Math.round(total/saturdays.length*100)/100);
});

test('the standalone planner maps all parenting tasks to family activity without loading game data',()=>{
  const sandbox={};vm.runInNewContext(fs.readFileSync(require.resolve('./planner-bridge.js'),'utf8'),sandbox);
  assert.equal(sandbox.S2Data,undefined);
  for(const {ids}of groups)for(const id of ids)assert.equal(sandbox.S2PlannerBridge.activityType(id),'family_dining');
  for(const [id,type]of Object.entries({motorbike_tour:'driving',domestic_trip:'long_travel',golf_round:'walk',circuit_drive:'driving'}))assert.equal(sandbox.S2PlannerBridge.activityType(id),type);
  assert.equal(sandbox.S2PlannerBridge.activityType('rest'),'deep_rest');
  assert.equal(sandbox.S2PlannerBridge.activityType('read'),'solo_cafe');
});

test('the unobserved day across New Year excludes unavailable parenting, recent grooming and unselected expensive hobbies',()=>{
  const expensive=['motorbike_tour','domestic_trip','golf_round','circuit_drive'];
  const state=completedYear(2033,{children:0,childProfiles:[],careShare:0,startCash:20000000,personalBudget:5000000,preferences:['baby_feed','haircut','haircut_men','haircut_women']},[{activityId:'haircut_men',anchor:'2033-12-31',kind:'weeks',interval:3,slot:'morning',payment:'cash'}]);
  assert.ok(state.log.some(log=>log.type==='activity'&&log.activityId==='haircut_men'&&log.date==='2033-12-31'));
  const before=JSON.stringify(state),draft=B.createDraft(state,{today:'2033-12-31'}),estimated=draft.planner.events.filter(event=>event.day==='sun');
  assert.ok(estimated.length);assert.ok(estimated.every(event=>event.sourceKind==='estimated'));
  const excluded=['baby_feed','haircut','haircut_men','haircut_women',...expensive,...D.ACTIVITIES.filter(activity=>activity.manualOnly).map(activity=>activity.id)].map(id=>D.ACTIVITY_MAP[id].name);
  assert.ok(estimated.every(event=>!excluded.includes(event.sourceLabel)),'estimates must not add an unavailable task, repeat a fresh haircut, buy an unselected hobby or choose a manual-only procedure');
  assert.ok(draft.planner.events.some(event=>event.sourceKind==='actual'&&event.sourceLabel===D.ACTIVITY_MAP.haircut_men.name),'the actual legacy haircut keeps its original title');
  assert.equal(JSON.stringify(state),before,'estimating must not draw incident RNG or charge any fee');
});

test('a new estimate uses one canonical haircut without rewriting saved legacy preferences',()=>{
  const preferences=['haircut_men','haircut_women'];
  const state=completedYear(2033,{children:0,childProfiles:[],careShare:0,startCash:20000000,personalBudget:5000000,preferences},[],{automatic:false});
  const before=JSON.stringify(state),draft=B.createDraft(state,{today:'2033-12-31'}),estimated=draft.planner.events.filter(event=>event.sourceKind==='estimated');
  assert.equal(estimated.filter(event=>event.sourceLabel===D.ACTIVITY_MAP.haircut.name).length,1);
  assert.ok(estimated.every(event=>!preferences.some(id=>event.sourceLabel===D.ACTIVITY_MAP[id].name)),'legacy activity titles belong to existing records, not newly suggested choices');
  assert.deepEqual(state.config.preferences,preferences);assert.equal(JSON.stringify(state),before);
  assert.ok(B.validateDraft(draft).ok);
});

test('explicit completed experiences keep their own names and travel categories without simulating additional costs',()=>{
  const ids=['motorbike_tour','domestic_trip','golf_round','circuit_drive'],types=['driving','long_travel','walk','driving'];
  const state=E.create({...D.DEFAULT_CONFIG,year:2026,seed:47,children:0,childProfiles:[],careShare:0,region:'city',transport:'car',preferences:[],personalBudget:5000000,startCash:20000000});
  ids.forEach((activityId,index)=>{const result=E.addPlan(state,{activityId,date:index===3?'2026-01-04':'2026-01-03',slot:['morning','afternoon','evening','morning'][index],payment:'cash'});assert.ok(result.ok,result.reason);});
  for(let turns=0;state.phase!=='finished'&&turns<400;turns++){const result=E.advanceAutomatic(state);assert.ok(result.ok,result.reason);}
  assert.equal(state.phase,'finished');assert.deepEqual(S.validate(state),[]);
  const before=JSON.stringify(state),draft=B.createDraft(state,{today:'2026-01-03'});
  for(let index=0;index<ids.length;index++){
    const id=ids[index],log=state.log.find(log=>log.type==='activity'&&log.activityId===id);
    assert.ok(log,'the manual experience must have really completed');
    const event=draft.planner.events.find(event=>event.sourceDate===log.date&&event.sourceLabel===D.ACTIVITY_MAP[id].name);
    assert.ok(event,id+' actual experience stays in the draft');assert.equal(event.type,types[index]);assert.equal(event.sourceKind,'actual');
    assert.equal(event.travel,E.travelMinutes(state,D.ACTIVITY_MAP[id]));
  }
  assert.equal(JSON.stringify(state),before,'rendering a completed trip cannot trigger another incident, ledger entry or random draw');
});
