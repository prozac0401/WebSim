const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),B=require('./planner-bridge.js');
const completedYear=require('./fixtures/completed-year.cjs');
const recurringRead=[{activityId:'read',anchor:'2026-01-03',kind:'weeks',interval:1,slot:'morning',payment:'cash'},{activityId:'read',anchor:'2026-01-04',kind:'weeks',interval:1,slot:'morning',payment:'cash'}];

test('healthy ongoing lives cannot request an early varied draft',()=>{
  const state=E.create({...D.DEFAULT_CONFIG,preferences:['photo','music','draw','cook']});
  const before=JSON.stringify(state);assert.throws(()=>B.createDraft(state,{today:'2026-10-17'}),/한 해/);assert.equal(JSON.stringify(state),before);
});

test('role, illness, care and budget settings do not bypass the completed-year requirement',()=>{
  for(const changes of [{role:'graduate'},{children:3,childAge:'toddler',careShare:100},{startCash:0,personalBudget:0},{age:80}]){
    const state=E.create({...D.DEFAULT_CONFIG,...changes});state.stats.fatigue=90;
    assert.equal(B.completionStatus(state).ok,false);assert.throws(()=>B.createDraft(state,{today:'2026-10-17'}),/한 해/);
  }
});

test('completed-year daily records retain natural differences without inventing optional filler',()=>{
  const state=completedYear(2026),before=JSON.stringify(state),draft=B.createDraft(state,{today:'2026-10-17'});
  assert.deepEqual(B.createDraft(state,{today:'2026-10-17'}),draft);assert.equal(JSON.stringify(state),before);
  assert.ok(draft.planner.events.every(event=>event.sourceKind==='actual'));
  for(const event of draft.planner.events){
    assert.ok(state.log.some(log=>log.date===event.sourceDate&&['activity','care','time'].includes(log.type)));
  }
  assert.ok(B.validateDraft(draft).ok);
});

test('repeated real Saturday and Sunday activities are preserved instead of diversified away',()=>{
  const state=completedYear(2026,{},recurringRead);
  const readDates=new Set(state.log.filter(log=>log.type==='activity'&&log.activityId==='read').map(log=>log.date));
  const saturday=[...readDates].find(date=>new Date(date+'T12:00:00Z').getUTCDay()===6&&readDates.has(B.weekendFor(date).sunday));
  assert.ok(saturday,'the engine should have completed the recurring activity on both weekend days');
  const draft=B.createDraft(state,{today:saturday});
  const reads=draft.planner.events.filter(event=>event.sourceLabel==='독서');
  assert.equal(reads.length,2);assert.deepEqual(reads.map(event=>event.day),['sat','sun']);
  assert.ok(reads.every(event=>event.sourceKind==='actual'));
  assert.ok(draft.planner.events.every(event=>event.sourceKind==='actual'));
});

test('full-year averages preserve repeated observed habits and never add novelty estimates',()=>{
  const state=completedYear(2026,{},recurringRead),draft=B.createDraft(state,{today:'2027-10-16'});
  assert.equal(draft.source.mode,'year-average');assert.ok(draft.planner.events.every(event=>event.sourceKind==='average'));
  for(const day of ['sat','sun'])assert.ok(draft.planner.events.some(event=>event.day===day&&event.sourceLabel==='독서'));
  assert.equal(draft.source.completedDays,365);assert.ok(B.validateDraft(draft).ok);
});
