const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const D = require('./data.js');
const C = require('./calendar.js');
const F = require('./finance.js');

function activeYear(config, eventTrace, activityCatalog = D.ACTIVITIES) {
  const state = E.create(config);
  const plannedWeeks = new Set();
  let turns = 0, attempts = 0;
  while (state.phase !== 'finished' && turns++ < 1500) {
    if (state.phase === 'review') { E.finishReview(state); continue; }
    if (state.phase === 'event') {
      if (eventTrace) eventTrace.push({ date: state.date, eventId: state.pendingEvent.catalogId, queue: state.queue.map(item => ({ eventId: item.catalogId, date: item.date })) });
      let chosen = false;
      for (const choice of [...state.pendingEvent.choices]) {
        const result = E.choose(state, choice.id);
        if (result.ok) { chosen = true; break; }
      }
      assert.ok(chosen, `no usable event choice on ${state.date}`);
      continue;
    }
    if (!plannedWeeks.has(state.weekStart)) {
      plannedWeeks.add(state.weekStart);
      const activities = activityCatalog.filter(a => !a.roles || a.roles.includes(state.config.role));
      for (const day of E.currentWeek(state).filter(day => day.isOff)) {
        for (let slot = 0; slot < 3; slot++) {
          const activity = activities[attempts++ % activities.length];
          const result = E.addPlan(state, { date: day.date, slot, activityId: activity.id, payment: attempts % 2 ? 'cash' : 'card' });
          if (!result.ok) E.addPlan(state, { date: day.date, slot, activityId:'read', payment:'cash' });
        }
      }
    }
    E.advance(state);
  }
  assert.equal(state.phase, 'finished', `did not finish ${config.role}/${config.seed} in ${turns} turns`);
  return state;
}

test('active choices across four presets and three seeds complete all 365 days with exact accounting', () => {
  for (const preset of D.PRESETS) for (const seed of [1,2026,4294967295]) {
    const initial = { ...preset.config, seed }, eventTrace = [], state = activeYear(initial, eventTrace);
    const summary = E.getSummary(state), daily = state.log.filter(item => item.type === 'daily');
    assert.deepEqual(daily.map(item => item.date), C.dates(2026));
    assert.equal(summary.daysPlayed, 365);
    assert.equal(state.finance.cash - summary.finance.debt, initial.startCash + summary.finance.income - summary.finance.consumption, `${preset.id}/${seed} wealth accounting`);
    assert.equal(state.finance.ledger.filter(item => item.type === 'fixed-cost').length, 12);
    assert.equal(state.finance.ledger.filter(item => item.type === 'card-payment').length, 12);
    assert.equal(state.plan.length, 0, 'no forgotten past appointments');
    assert.ok(summary.calendar.flatMap(day => day.activities).length > 200);
    assert.equal(summary.calendar.flatMap(day => day.activities).length, Object.values(summary.activityCounts).reduce((sum,n)=>sum+n,0));
    assert.deepEqual(summary.artifacts.map(a=>a.id),state.log.filter(l=>l.type==='artifact').map(l=>l.artifactId));
    assert.deepEqual(summary.achievements,state.log.filter(l=>l.type==='achievement'));
    const weekdayLogs=state.log.filter(l=>l.type==='weekday');
    assert.ok(weekdayLogs.every(l=>!C.isOff(l.date)), 'holiday never duplicates basic work');
    assert.ok(Object.values(state.stats).every(n=>Number.isFinite(n)&&n>=0&&n<=100));
    assert.ok(state.finance.ledger.every(l=>Number.isSafeInteger(l.amount)&&l.amount>=0));
    const scheduled={exam_june:'2026-06-20',exam_nov:'2026-11-14',thesis_presentation:'2026-09-16',thesis_deadline:'2026-11-27',work_review:'2026-12-18',flu_vaccine_season:'2026-10-01',autumn_reflection:'2026-10-02',partner_weekend:'2026-02-07',partner_care:'2026-02-07',single_weekend:'2026-02-07',single_care:'2026-02-07'};
    for(const log of state.log.filter(l=>l.type==='event'&&l.source==='scheduled'&&l.eventId!=='autumn_reflection'))assert.equal(log.date,scheduled[log.eventId]);
    // The vaccine queues the reflection for Oct 2. An earlier queued deadline can
    // use that day's single event turn; the reflection must then arrive Oct 3.
    const vaccine = eventTrace.find(item => item.eventId === 'flu_vaccine_season');
    const reflectionIndex = vaccine.queue.findIndex(item => item.eventId === 'autumn_reflection');
    assert.ok(reflectionIndex >= 0, 'vaccine day must retain the seasonal reflection');
    assert.equal(vaccine.queue[reflectionIndex].date, scheduled.autumn_reflection);
    const earlier = vaccine.queue.slice(0, reflectionIndex).filter(item => item.date <= scheduled.autumn_reflection);
    const reflections = state.log.filter(item => item.type === 'event' && item.eventId === 'autumn_reflection');
    assert.equal(reflections.length, 1, 'queued reflection is delivered exactly once');
    if (earlier.length) {
      assert.equal(earlier.length, 1, 'fixture has exactly one earlier queued event');
      assert.equal(earlier[0].eventId, 'sideproject_deadline');
      const deadline = eventTrace.find(item => item.date === scheduled.autumn_reflection && item.eventId === earlier[0].eventId);
      assert.ok(deadline, 'earlier deadline consumes the Oct 2 event turn');
      assert.deepEqual(deadline.queue.find(item => item.eventId === 'autumn_reflection'), { eventId: 'autumn_reflection', date: scheduled.autumn_reflection });
      assert.equal(reflections[0].date, '2026-10-03', 'reflection is delivered at the next event turn');
    } else assert.equal(reflections[0].date, scheduled.autumn_reflection);
    assert.ok(!state.queue.some(item => item.catalogId === 'autumn_reflection'));
    if(!initial.children)assert.ok(!state.log.some(l=>l.eventId==='care_appointment'));
    const external=state.log.filter(l=>l.type==='event'&&l.source==='external');
    assert.ok(external.every((l,i)=>i===0||l.date>=C.addDays(external[i-1].date,14)), `${preset.id}/${seed}: external event dates ${external.map(l=>l.date).join(', ')}`);
  }
});

test('gender alone never changes an actively played year outside the explicit gender-priced haircut choice', () => {
  const config={...D.PRESETS[0].config, seed:7654};
  const activities=D.ACTIVITIES.filter(activity=>activity.cadence?.group!=='haircut');
  const a=activeYear({...config,gender:'woman'},null,activities), b=activeYear({...config,gender:'man'},null,activities);
  assert.ok(a.log.some(log=>log.type==='activity'&&log.cost>0),'the comparison includes actual paid activities');
  assert.ok(a.log.every(log=>log.type!=='activity'||D.ACTIVITY_MAP[log.activityId].cadence?.group!=='haircut'));
  assert.deepEqual(a.log,b.log);
  assert.deepEqual(a.finance,b.finance);
  assert.deepEqual(a.stats,b.stats);
  assert.deepEqual(a.artifacts,b.artifacts);
});

test('active-year result is reproducible from the same environment, seed and choice policy', () => {
  const config={...D.PRESETS[2].config,seed:661};
  assert.deepEqual(activeYear(config),activeYear(config));
});

test('zero funds and full care still have a year-long free recovery route with debt visible', () => {
  const initial={...D.PRESETS[3].config,startCash:0,salary:0,externalAllowance:0,personalBudget:0,children:6,careShare:100};
  const state=activeYear(initial), summary=F.summary(state.finance);
  assert.equal(summary.income,state.finance.ledger.filter(l=>l.type==='extra-pay'&&l.kind==='sidejob').reduce((sum,l)=>sum+l.amount,0),'only completed side jobs can add income to this unsupported household');
  assert.equal(summary.cash,0);
  assert.equal(summary.debt,12*initial.fixedCosts-summary.income,'earned side income pays mandatory arrears instead of disappearing');
  assert.ok(state.log.some(l=>l.type==='activity'&&l.cost===0));
  assert.ok(state.log.some(l=>l.type==='care'));
});

module.exports={activeYear};

test('intensive interview preparation respects hiring prerequisites after a role change',()=>{
  const state=E.create({...D.PRESETS[1].config,personalBudget:1000000,startCash:5000000});
  const planned=new Set();let turns=0;
  while(state.phase!=='finished'&&turns++<1500){
    if(state.phase==='event'){
      if(['job_interview','job_offer'].includes(state.pendingEvent.catalogId))assert.equal(state.config.role,'seeker','job event invalid after hire');
      let chosen=false;for(const choice of [...state.pendingEvent.choices])if(E.choose(state,choice.id).ok){chosen=true;break;}assert.ok(chosen);
    }else if(state.phase==='review')E.finishReview(state);
    else{
      if(!planned.has(state.weekStart)){
        planned.add(state.weekStart);
        if(state.config.role==='seeker')for(const day of E.currentWeek(state))for(const slot of day.slots.filter(x=>x.available))E.addPlan(state,{date:day.date,slot:slot.id,activityId:'jobstudy'});
      }
      E.advance(state);
    }
  }
  assert.equal(state.phase,'finished');
  assert.equal(state.config.role,'worker');
  assert.equal(state.log.filter(l=>l.type==='event'&&l.eventId==='job_offer'&&l.choiceId==='accept').length,1);
});
