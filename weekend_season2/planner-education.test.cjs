const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js'),B=require('./planner-bridge.js'),C=require('./calendar.js');

function completedEducation(age,id,minutes,weekly=false){
  const state=E.create({...D.DEFAULT_CONFIG,year:2026,seed:47,children:1,childAge:age<=6?'preschool':'school',childProfiles:[{age,gender:'woman',militaryStatus:'none'}],careShare:100,preferences:[],educationMinutes:{[id]:minutes},startCash:5000000,personalBudget:1000000});
  const weeks=new Set();
  for(let turn=0;state.phase!=='finished'&&turn<1500;turn++){
    if(state.phase==='event'){assert.ok(E.resolveAutomatic(state).ok);continue;}
    if(state.phase==='review'){assert.ok(E.finishReview(state).ok);continue;}
    if(!weeks.has(state.weekStart)){
      weeks.add(state.weekStart);
      const day=E.currentWeek(state).find(day=>new Date(day.date+'T12:00:00Z').getUTCDay()===6&&(weekly||day.date==='2026-01-03'));
      if(day)assert.ok(E.addPlan(state,{date:day.date,slot:'morning',activityId:id}).ok);
    }
    const result=E.advance(state);if(!result.ok)assert.equal(state.phase,'event',result.reason);
  }
  assert.equal(state.phase,'finished');assert.deepEqual(S.validate(state),[]);return state;
}

test('completed education drafts use actual selected minutes and never turn longer home study into travel or duplicate care',()=>{
  for(const [age,id,minutes]of [[4,'preschool_play',120],[9,'school_reading',30]]){
    const state=completedEducation(age,id,minutes),record=state.log.find(l=>l.type==='activity'&&l.activityId===id&&l.date==='2026-01-03');
    assert.ok(record);assert.equal(record.activityMinutes,minutes);
    state.config.educationMinutes[id]=180;
    const before=JSON.stringify(state),draft=B.createDraft(state,{today:'2026-01-03'});
    const events=draft.planner.events.filter(event=>event.sourceDate==='2026-01-03');
    const education=events.find(event=>event.sourceLabel===D.ACTIVITY_MAP[id].name);
    assert.ok(education);assert.equal(education.sourceMinutes,minutes+D.ACTIVITY_MAP[id].prep);
    assert.equal(education.travel,0);assert.equal(education.sourceKind,'actual');
    const care=state.log.filter(l=>l.type==='care'&&l.date==='2026-01-03').reduce((sum,l)=>sum+l.minutes,0);
    const baseline=events.find(event=>event.sourceLabel.includes('기본 돌봄'));
    assert.equal(baseline?.sourceMinutes||0,Math.max(0,care-minutes));
    assert.equal(events.reduce((sum,event)=>sum+event.sourceMinutes,0),record.minutes);
    assert.equal(JSON.stringify(state),before);
  }
});

test('year-average education drafts average completed study durations rather than current settings or catalog defaults',()=>{
  const id='school_homework',state=completedEducation(9,id,120,true);
  const saturdays=C.dates(2026).filter(date=>new Date(date+'T12:00:00Z').getUTCDay()===6);
  const records=state.log.filter(l=>l.type==='activity'&&l.activityId===id&&l.slot==='morning'&&saturdays.includes(l.date));
  assert.ok(records.length>35,'the year contains enough real education sessions for an average');
  assert.ok(records.every(record=>record.activityMinutes===120));
  state.config.educationMinutes[id]=15;
  const before=JSON.stringify(state),draft=B.createDraft(state,{today:'2027-01-02'});
  const education=draft.planner.events.find(event=>event.day==='sat'&&event.sourceLabel===D.ACTIVITY_MAP[id].name);
  assert.ok(education);assert.equal(education.sourceKind,'average');assert.equal(education.travel,0);
  const expected=records.reduce((sum,l)=>sum+l.activityMinutes+D.ACTIVITY_MAP[id].prep,0)/saturdays.length;
  assert.equal(education.sourceMinutes,Math.round(expected*100)/100);
  assert.equal(JSON.stringify(state),before);
});
