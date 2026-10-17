const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js'),B=require('./planner-bridge.js');
const completedYear=require('./fixtures/completed-year.cjs');

test('only an engine-completed ordinary or leap year can create a public draft',()=>{
  for(const [year,totalDays]of [[2026,365],[2028,366]]){
    const state=completedYear(year),before=JSON.stringify(state),status=B.completionStatus(state);
    assert.deepEqual(status,{ok:true,reason:'',year,completedDays:totalDays,totalDays,completedOn:year+'-12-31'});
    const draft=B.createDraft(state,{today:'2026-10-17'});
    assert.equal(JSON.stringify(state),before);
    assert.equal(draft.source.completed,true);assert.equal(draft.source.completedDays,totalDays);assert.equal(draft.source.totalDays,totalDays);assert.equal(draft.source.completedOn,year+'-12-31');
    assert.ok(B.validateDraft(draft).ok);
    assert.equal(draft.source.mode,year===2026?'experienced':'year-average');
    assert.ok(draft.planner.events.every(event=>event.sourceKind===(year===2026?'actual':'average')));
  }
});

test('active, event and review phases stay locked, even when positioned on December 31',()=>{
  const active=E.create(D.DEFAULT_CONFIG);
  assert.deepEqual(B.completionStatus(active),{ok:false,reason:'이 삶으로 한 해를 끝까지 살아본 뒤 주말 계획표 초안을 만들 수 있어요.',year:2026,completedDays:0,totalDays:365,completedOn:null});
  for(const phase of ['planning','event','review']){
    const state=completedYear(2026);state.phase=phase;
    const before=JSON.stringify(state);assert.equal(B.completionStatus(state).ok,false);
    assert.throws(()=>B.createDraft(state,{today:'2026-10-17'}),/한 해/);assert.equal(JSON.stringify(state),before);
  }
});

test('changing a start state to finished cannot bypass the full daily evidence requirement',()=>{
  const state=E.create(D.DEFAULT_CONFIG);state.phase='finished';state.date='2026-12-31';
  assert.equal(B.completionStatus(state).ok,false);assert.equal(B.completionStatus(state).completedDays,0);
  assert.throws(()=>B.createDraft(state,{today:'2026-10-17'}),/기록/);
});

test('finished years reject missing, duplicate, impossible or foreign dates and unfinished state',()=>{
  for(const mutate of [
    state=>{state.log.splice(state.log.findIndex(log=>log.type==='daily'),1);},
    state=>{state.log.push(structuredClone(state.log.find(log=>log.type==='daily')));},
    state=>{state.log.find(log=>log.type==='daily').date='2026-02-30';},
    state=>{state.log.find(log=>log.type==='daily').date='2025-01-01';},
    state=>{state.date='2026-12-30';},state=>{state.pendingEvent={id:'still-pending'};},state=>{state.dayState={date:state.date};}
  ]){
    const state=completedYear(2026);mutate(state);const before=JSON.stringify(state);
    assert.equal(B.completionStatus(state).ok,false);assert.throws(()=>B.createDraft(state,{today:'2026-10-17'}));assert.equal(JSON.stringify(state),before);
  }
});

test('saved completed years retain eligibility and standalone validation checks completion provenance',()=>{
  const original=completedYear(2026),restored=S.parse(S.serialize(original));assert.ok(restored.ok,restored.reason);
  assert.ok(B.completionStatus(restored.state).ok);
  const draft=B.createDraft(restored.state,{today:'2026-10-17'}),sandbox={};
  vm.runInNewContext(fs.readFileSync(require.resolve('./planner-bridge.js'),'utf8'),sandbox);
  assert.ok(sandbox.S2PlannerBridge.validateDraft(draft).ok);
  assert.equal(sandbox.S2PlannerBridge.completionStatus(restored.state).ok,true);
  for(const mutate of [
    value=>{delete value.source.completed;},value=>{value.source.completed=false;},value=>{value.source.completedDays=364;},value=>{value.source.totalDays=366;},value=>{value.source.completedOn='2026-12-30';}
  ]){const invalid=structuredClone(draft);mutate(invalid);assert.equal(B.validateDraft(invalid).ok,false);assert.equal(sandbox.S2PlannerBridge.validateDraft(invalid).ok,false);}
});

test('browser and Node expose no draft-builder bypass for partial evidence',()=>{
  assert.equal(B.__test,undefined);assert.equal(B.buildDraft,undefined);
  const sandbox={};vm.runInNewContext(fs.readFileSync(require.resolve('./planner-bridge.js'),'utf8'),sandbox);
  assert.equal(sandbox.S2PlannerBridge.__test,undefined);assert.equal(sandbox.S2PlannerBridge.buildDraft,undefined);
  assert.throws(()=>B.createDraft(E.create(D.DEFAULT_CONFIG),{today:'2026-10-17'}),/한 해/);
  assert.throws(()=>sandbox.S2PlannerBridge.createDraft(E.create(D.DEFAULT_CONFIG),{today:'2026-10-17'}),/한 해/);
});
