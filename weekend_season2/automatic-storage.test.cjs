const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),F=require('./finance.js'),S=require('./storage.js');
function withEarnedPay(){
  const state=E.create(D.DEFAULT_CONFIG);
  state.queue.unshift({catalogId:'weather',date:state.date,context:{}});
  E.advance(state);
  assert.equal(state.phase,'event');
  assert.ok(F.addEarnedPay(state.finance,state.date,18000,'배달 보상',{reference:'delivery-test'}).ok);
  return state;
}
test('autoplay choice preference and next-day side job rewards survive exact save restoration',()=>{
  const state=withEarnedPay();state.flags.autoDecisions='important';
  assert.deepEqual(S.validate(state),[]);
  const loaded=S.parse(S.serialize(state));assert.ok(loaded.ok,loaded.reason);
  assert.deepEqual(loaded.state.finance,state.finance);
  assert.equal(loaded.state.flags.autoDecisions,'important');
  assert.equal(loaded.state.finance.pendingRewards[0].dueDate,'2026-01-02');
});
test('side job payment records reject disconnected, early and duplicate income promises',()=>{
  const state=withEarnedPay();
  for(const mutate of [
    s=>{s.flags.autoDecisions='whatever';},
    s=>{s.finance.pendingRewards[0].dueDate='2026-01-01';},
    s=>{s.finance.pendingRewards[0].reference='unearned';},
    s=>{s.finance.ledger.find(t=>t.kind==='sidejob').dueDate='2026-01-03';},
    s=>{s.finance.pendingRewards[0].kind='salary';},
    s=>{const r=s.finance.pendingRewards[0];s.finance.pendingRewards.push({...r});s.finance.pendingPay+=r.amount;}
  ]){const invalid=structuredClone(state);mutate(invalid);assert.ok(S.validate(invalid).length,'modified payment metadata must fail');}
});
test('health interruptions and vaccination require matching history and delayed followups',()=>{
  for(const id of ['traffic_minor','low_condition_week','sleep_disruption','weekday_overload','flu_vaccine_season']){
    const state=E.create(D.DEFAULT_CONFIG);state.queue.unshift({catalogId:id,date:state.date,context:{}});E.advance(state);
    assert.equal(state.pendingEvent.catalogId,id);assert.ok(E.choose(state,id==='flu_vaccine_season'?'vaccinate':'rest').ok);
    assert.deepEqual(S.validate(state),[],id);assert.ok(S.parse(S.serialize(state)).ok);
    for(const mutate of [
      s=>{s.queue=[];},
      s=>{if(id==='flu_vaccine_season')s.flags.vaccineProtectionFrom=s.date;else s.flags.recoveryUntil='2026-12-31';},
      s=>{s.log=s.log.filter(l=>l.type!=='health');}
    ]){const invalid=structuredClone(state);mutate(invalid);assert.ok(S.validate(invalid).length,id);}
  }
});
test('project progress and extra-shift bonuses cannot be created without work or acceptance',()=>{
  const project=E.create(D.DEFAULT_CONFIG);project.queue.unshift({catalogId:'sideproject_offer',date:project.date,context:{}});E.advance(project);assert.ok(E.choose(project,'accept').ok);
  assert.deepEqual(S.validate(project),[]);project.flags.sideprojectProgress=3;assert.ok(S.validate(project).length);
  const bonus=E.create(D.DEFAULT_CONFIG);bonus.queue.unshift({catalogId:'sidejob_offer',date:bonus.date,context:{}});E.advance(bonus);assert.ok(E.choose(bonus,'later').ok);
  assert.deepEqual(S.validate(bonus),[]);bonus.flags.sidejobBonusRemaining=2;bonus.flags.sidejobBonusUntil='2026-01-29';assert.ok(S.validate(bonus).length);
});
