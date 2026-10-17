const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const D=require('./data.js'),E=require('./engine.js'),B=require('./planner-bridge.js');
const completedYear=require('./fixtures/completed-year.cjs');
const weekday=date=>new Date(date+'T12:00:00Z').getUTCDay();

test('current weekend includes both Saturday and Sunday; weekdays select the next one',()=>{
  for(const today of ['2026-10-12','2026-10-16','2026-10-17','2026-10-18'])assert.deepEqual(B.weekendFor(today),{saturday:'2026-10-17',sunday:'2026-10-18'});
  assert.deepEqual(B.weekendFor('2026-12-31'),{saturday:'2027-01-02',sunday:'2027-01-03'});
  assert.throws(()=>B.weekendFor('2026-02-30'));
});

test('a completed-year same-date draft is deterministic, pure and based only on actual records',()=>{
  const state=completedYear(2026),before=JSON.stringify(state),draft=B.createDraft(state,{today:'2026-10-17'});
  assert.deepEqual(B.createDraft(state,{today:'2026-10-17'}),draft);
  assert.equal(JSON.stringify(state),before);assert.ok(B.validateDraft(draft).ok);
  assert.equal(draft.source.mode,'experienced');assert.deepEqual(draft.source.dates,['2026-10-17','2026-10-18']);
  assert.equal(draft.source.sampleDays,2);assert.equal(draft.source.sampleWeekends,1);
  assert.ok(draft.planner.events.every(event=>event.sourceKind==='actual'));
  for(const log of state.log.filter(log=>log.type==='activity'&&draft.source.dates.includes(log.date))){
    const entry=draft.planner.events.find(event=>event.sourceDate===log.date&&event.sourceLabel===D.ACTIVITY_MAP[log.activityId].name);
    assert.ok(entry,log.activityId+' must retain its original title');assert.ok(entry.sourceMinutes<=log.minutes);
  }
});

test('another completed year averages only weekend days, including quiet days in the denominator',()=>{
  const state=completedYear(2028,{},[],{automatic:false}),draft=B.createDraft(state,{today:'2026-10-17'});
  const dates=state.log.filter(log=>log.type==='daily'&&[0,6].includes(weekday(log.date))).map(log=>log.date);
  assert.equal(draft.source.mode,'year-average');assert.deepEqual(draft.source.dates,dates);
  assert.equal(draft.source.sampleDays,dates.length);assert.equal(draft.source.recordedFrom,dates[0]);assert.equal(draft.source.recordedTo,dates.at(-1));
  assert.ok(dates.some(date=>!state.log.some(log=>log.type==='activity'&&log.date===date)),'quiet observed dates must be included');
  assert.ok(draft.planner.events.every(event=>event.sourceKind==='average'));
  for(const event of draft.planner.events){
    const count=dates.filter(date=>(weekday(date)===6?'sat':'sun')===event.day).length;
    assert.ok(event.sourceReason.includes(count+'일 중'));
  }
});

test('exact target dates take priority when the upcoming weekend crosses a calendar year',()=>{
  const state=completedYear(2027),draft=B.createDraft(state,{today:'2026-12-31'});
  assert.equal(draft.source.mode,'experienced');assert.deepEqual(draft.source.dates,['2027-01-02','2027-01-03']);
  assert.ok(draft.planner.events.every(event=>event.sourceKind==='actual'));
});

test('partial lives cannot turn missing experience into an editable draft',()=>{
  const state=E.create(D.DEFAULT_CONFIG);const first=E.advanceAutomatic(state);assert.ok(first.ok,first.reason);
  const before=JSON.stringify(state);assert.equal(B.completionStatus(state).ok,false);
  assert.throws(()=>B.createDraft(state,{today:'2026-10-17'}),/한 해/);assert.equal(JSON.stringify(state),before);
});

test('validator rejects malformed dates, overlapping events, invalid time rules and nonfinite numbers',()=>{
  const draft=B.createDraft(completedYear(2028),{today:'2026-10-17'});
  assert.ok(draft.planner.events.length>=2);
  for(const mutate of [
    x=>{x.weekend.saturday='2026-10-18';},x=>{x.planner.baseSleep=NaN;},x=>{x.planner.events[0].dur=99;},x=>{x.source.sampleDays=1;},
    x=>{x.planner.events[1]={...x.planner.events[0],id:'duplicate-position'};},x=>{x.planner.events[0].type='late_screen';},x=>{x.planner.events[0].sourceMinutes=Infinity;}
  ]){const invalid=structuredClone(draft);mutate(invalid);assert.equal(B.validateDraft(invalid).ok,false);}
  assert.equal(B.validateDraft(null).ok,false);const cyclic={};cyclic.self=cyclic;assert.equal(B.validateDraft(cyclic).ok,false);
});

test('standalone browser validation accepts completed transfers and exposes no ungated builder',()=>{
  const sandbox={};vm.runInNewContext(fs.readFileSync(require.resolve('./planner-bridge.js'),'utf8'),sandbox);
  assert.ok(sandbox.S2PlannerBridge.validateDraft(B.createDraft(completedYear(2026),{today:'2026-10-17'})).ok);
  assert.equal(sandbox.S2PlannerBridge.__test,undefined);assert.equal(sandbox.S2PlannerBridge.buildDraft,undefined);
  assert.throws(()=>sandbox.S2PlannerBridge.createDraft(E.create(D.DEFAULT_CONFIG),{today:'2026-10-17'}),/한 해/);
});
