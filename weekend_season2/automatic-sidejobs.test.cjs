'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),Events=require('./events.js'),F=require('./finance.js'),C=require('./calendar.js');
const game=(overrides={},role='worker')=>E.create({...D.PRESETS.find(p=>p.id===role).config,seed:47,...overrides});
function automatic(s,until=()=>s.phase==='finished',options={}){let calls=0;while(!until()&&calls++<400){const result=E.advanceAutomatic(s,options);assert.ok(result.ok,result.reason);assert.notEqual(result.stopped,'major-decision',s.pendingEvent?.catalogId);}assert.ok(until());return s;}
function trigger(s,id,date=s.date){s.queue.unshift({catalogId:id,date,context:{}});E.advance(s);assert.equal(s.pendingEvent?.catalogId,id);}
function finishEvents(s,until){for(let n=0;n<500&&!until();n++){if(s.phase==='event'){const r=E.resolveAutomatic(s);assert.ok(r.ok,r.reason);}else if(s.phase==='review')E.finishReview(s);else E.advance(s);}assert.ok(until());}

test('default automatic living completes four full years without any event or reservation click',()=>{
  for(const preset of D.PRESETS){const s=automatic(game({},preset.id));assert.equal(E.getSummary(s).daysPlayed,365);assert.ok(s.log.some(l=>l.type==='automation'&&l.eventId));assert.equal(s.pendingEvent,null);assert.equal(s.finance.cardPending,0);assert.equal(s.log.filter(l=>l.type==='daily').length,new Set(s.log.filter(l=>l.type==='daily').map(l=>l.date)).size);}
});
test('future seasons and a leap year complete chronologically with the same autonomous flow',()=>{
  for(const [year,days]of [[2027,365],[2028,366],[2100,365]]){const s=automatic(game({year,preferences:['delivery','parttime','sideproject']}));assert.equal(E.getSummary(s).daysPlayed,days);assert.equal(s.date,year+'-12-31');assert.ok(s.log.some(l=>l.eventId==='flu_vaccine_season'&&l.date===year+'-10-01'));}
});
test('automatic reservations confirm moved dates, skip unaffordable occurrences once and continue future weeks',()=>{
  const s=game({personalBudget:0,preferences:[]});
  const kept=E.addRule(s,{activityId:'read',anchor:'2026-01-02',kind:'weeks',interval:1,move:'next-off',slot:'morning',payment:'card'}).rule;
  const skipped=E.addRule(s,{activityId:'pottery',anchor:'2026-01-02',kind:'weeks',interval:1,move:'next-off',slot:'morning',payment:'card'}).rule;
  automatic(s,()=>s.date>='2026-01-25');
  assert.ok(s.log.filter(l=>l.type==='activity'&&l.ruleId===kept.id).length>=3);
  assert.ok(s.log.some(l=>l.type==='automation'&&l.ruleId===kept.id&&l.moved));
  assert.ok(Object.keys(skipped.skipped).length>=3);assert.ok(s.finance.ledger.every(l=>l.method!=='card'));
  assert.equal(s.log.filter(l=>l.type==='skipped'&&l.activityId==='pottery').length,Object.keys(skipped.skipped).length);
});
test('optional important and all-choice modes stop at documented decisions instead of changing default autoplay',()=>{
  const important=game();trigger(important,'illness_influenza');const before=JSON.stringify(important);
  assert.equal(E.advanceAutomatic(important,{decisions:'important'}).stopped,'major-decision');assert.equal(JSON.stringify(important),before);
  assert.ok(E.resolveAutomatic(important).handled);assert.equal(important.healthEpisode.kind,'influenza');
  const minor=game();trigger(minor,'household_repair');assert.equal(E.resolveAutomatic(minor,{decisions:'all'}).stopped,'major-decision');assert.equal(E.resolveAutomatic(minor,{decisions:'important'}).handled,true);
});
test('automatic living adds no card borrowing or paid commitments when funds and budget are zero',()=>{
  const s=game({salary:0,externalAllowance:0,startCash:0,fixedCosts:0,personalBudget:0,preferences:['pottery','delivery']});
  E.addRule(s,{activityId:'pt',anchor:'2026-01-03',kind:'weeks',interval:1,slot:'morning',payment:'card'});
  automatic(s);assert.equal(s.finance.cardPending+s.finance.arrears+s.finance.fixedArrears,0);assert.equal(s.finance.ledger.filter(l=>l.method==='card').length,0);assert.ok(s.finance.cash>0);assert.ok(s.log.some(l=>l.activityId==='delivery'&&l.type==='activity'));
});
test('delivery and part-time work pay exactly once the following day and never count as consumption',()=>{
  const s=game({salary:0,externalAllowance:0,fixedCosts:0,personalBudget:0});
  for(const [slot,id]of [['morning','delivery'],['afternoon','parttime']])assert.ok(E.addPlan(s,{date:s.date,slot,activityId:id}).ok);
  trigger(s,'autumn_reflection','2026-01-02');
  const summary=F.summary(s.finance);assert.equal(summary.income,50000);assert.equal(summary.consumption,0);assert.equal(summary.pendingPay,0);
  const pay=s.finance.ledger.filter(l=>l.type==='extra-pay');assert.equal(pay.length,2);assert.ok(pay.every(l=>l.date==='2026-01-02'&&l.earnedDate==='2026-01-01'));
  const before=JSON.stringify(s.finance);E.advance(s);assert.equal(JSON.stringify(s.finance),before);
});
test('side project milestones require acceptance and actual work, then pay 40000 plus 80000 only once',()=>{
  const s=game({salary:0,externalAllowance:0,fixedCosts:0,preferences:['sideproject'],personalBudget:0});
  automatic(s,()=>s.flags.sideprojectCompleted===true);
  assert.equal(s.flags.sideprojectProgress,4);assert.equal(s.flags.sideprojectActive,false);assert.equal(s.flags.sideprojectDue,undefined);
  assert.ok(s.log.some(l=>l.type==='event'&&l.eventId==='sideproject_offer'&&l.choiceId==='accept'));
  const rewards=s.finance.ledger.filter(l=>l.type==='pending-pay'&&l.kind==='sidejob');assert.deepEqual(rewards.map(l=>l.amount),[40000,80000]);
  assert.equal(new Set(rewards.map(l=>l.reference)).size,2);assert.ok(s.artifacts.some(a=>a.name==='완성한 작은 프로젝트'));
  automatic(s);assert.equal(F.summary(s.finance).income,120000);
});
test('unfinished project deadline leaves a free close/recovery path and never invents completion pay',()=>{
  const s=game({preferences:[]});trigger(s,'sideproject_offer');assert.ok(E.choose(s,'accept').ok);const due=s.flags.sideprojectDue;
  automatic(s,()=>s.date>due);
  assert.equal(s.flags.sideprojectActive,false);assert.equal(s.flags.sideprojectDue,undefined);assert.equal(s.flags.sideprojectProgress,0);
  assert.ok(s.log.some(l=>l.type==='achievement'&&l.activityId==='sideproject'&&l.completed===false));assert.equal(s.finance.ledger.filter(l=>l.type==='pending-pay'&&l.kind==='sidejob').length,0);
});
test('overworking side jobs has a worse fatigue and happiness tradeoff than a rested preferred shift',()=>{
  const rested=game({preferences:['delivery']}),tired=game({preferences:[]});tired.stats.fatigue=80;
  for(const s of [rested,tired]){assert.ok(E.addPlan(s,{date:s.date,slot:'morning',activityId:'delivery'}).ok);trigger(s,'autumn_reflection','2026-01-02');}
  assert.ok(tired.stats.fatigue>rested.stats.fatigue+25);assert.ok(tired.stats.happiness<rested.stats.happiness);
});
test('overloaded weekdays reserve Saturday for rest and move conflicting plans with truthful inability logs',()=>{
  const s=game();assert.ok(E.addPlan(s,{date:'2026-01-03',slot:'morning',activityId:'pottery'}).ok);trigger(s,'weekday_overload');assert.ok(E.choose(s,'rest').ok);
  assert.equal(s.flags.overloadSaturday,'2026-01-03');assert.equal(E.conditionMinutes(s,'2026-01-03','morning'),240);
  automatic(s,()=>s.date>='2026-01-05');
  assert.ok(s.log.some(l=>l.type==='postponed'&&l.activityId==='pottery'&&l.category==='cannot'));
  assert.equal(s.log.filter(l=>l.type==='activity'&&l.date==='2026-01-03'&&['morning','afternoon'].includes(l.slot)).length,0);
  assert.ok(s.log.some(l=>l.type==='time'&&l.date==='2026-01-03'&&l.minutes===240));assert.equal(s.flags.recoveryUntil,undefined);
});
test('traffic, low-condition and poor-sleep stories affect health/time without piling up or fabricated medical bills',()=>{
  for(const id of ['traffic_minor','low_condition_week','sleep_disruption']){
    const s=game();trigger(s,id);const money=JSON.stringify(s.finance);assert.ok(E.choose(s,'rest').ok);assert.equal(JSON.stringify(s.finance),money);assert.equal(s.flags.recoveryCause,id);assert.equal(Events.eligible(s,'illness_pneumonia'),false);assert.equal(Events.eligible(s,'low_condition_week'),false);
    const due=s.flags.recoveryUntil;finishEvents(s,()=>s.date>due&&!s.flags.recoveryUntil);assert.ok(s.log.some(l=>l.type==='health'&&l.cause===id&&l.recovered));
  }
});
test('flu vaccination spends actual time and reduces only later influenza weight without guaranteeing immunity',()=>{
  const s=game();trigger(s,'flu_vaccine_season');assert.ok(E.choose(s,'vaccinate').ok);assert.equal(s.flags.vaccineDate,'2026-01-01');assert.equal(s.flags.vaccineProtectionFrom,'2026-01-15');assert.equal(E.influenzaWeight(s,'2026-01-14'),1);assert.equal(E.influenzaWeight(s,'2026-01-15'),.5);assert.ok(Events.eligible(s,'illness_influenza'));assert.ok(Events.eligible(s,'illness_pneumonia'));assert.ok(s.log.some(l=>l.type==='time'&&l.minutes===60));assert.ok(s.log.some(l=>l.eventId==='flu_vaccination'&&l.vaccinated));
  const deferred=game();trigger(deferred,'flu_vaccine_season');E.choose(deferred,'later');assert.equal(deferred.flags.vaccineDate,undefined);assert.equal(E.influenzaWeight(deferred,'2026-12-01'),1);
});
test('2026 senior vaccination prompts use verified start dates; future prompts use an explicit game date',()=>{
  for(const [age,year,date]of [[75,2026,'10-06'],[70,2026,'10-12'],[65,2026,'10-15'],[60,2026,'10-01'],[75,2028,'10-01']]){
    const s=automatic(game({age,year}));
    assert.ok(s.log.some(l=>l.eventId==='flu_vaccine_season'&&l.type==='event'&&l.date===year+'-'+date));
  }
});
test('automatic choices, side-job rewards and recovery logs reproduce with the same seed and saved state',()=>{
  const config={preferences:['delivery','parttime','sideproject'],seed:2026,children:1,childAge:'toddler',childProfiles:[{age:1,gender:'woman',militaryStatus:'none'}]};
  const a=game(config,'caregiver'),b=game(config,'caregiver');automatic(a,()=>a.date>='2026-07-01');automatic(b,()=>b.date>='2026-07-01');assert.deepEqual(a,b);
  const restored=JSON.parse(JSON.stringify(a));automatic(a);automatic(restored);assert.deepEqual(a,restored);
});
