'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),Events=require('./events.js'),C=require('./calendar.js');
const game=(id='worker',override={})=>E.create({...D.PRESETS.find(p=>p.id===id).config,...override});
function chooseFirst(s){for(const choice of s.pendingEvent.choices)if(E.choose(s,choice.id).ok)return;assert.fail('No available choice: '+s.pendingEvent.catalogId);}
function play(s,direction='balanced',until=()=>s.phase==='finished',auto=true){
  for(let guard=0;guard<3500&&!until();guard++){
    if(s.phase==='event')chooseFirst(s);
    else if(s.phase==='review')E.finishReview(s);
    else{if(auto){const ready=E.prepareAutoWeek(s,{direction});assert.ok(ready.ok,ready.reason);}E.advance(s);}
  }
  assert.ok(until(),'The calendar did not reach the intended point');return s;
}
function trigger(s,id){s.queue.unshift({catalogId:id,date:s.date,context:{}});E.advance(s);assert.equal(s.pendingEvent?.catalogId,id);}

test('six visible measures start independently and all presets complete a mixed year without saturation',()=>{
  for(const preset of D.PRESETS){
    const s=game(preset.id,{seed:2026,preferences:['read','walk','cook','music']});
    assert.deepEqual(E.PUBLIC_STATS,['health','happiness','knowledge','mood','relationship','family']);
    assert.equal(s.stats.knowledge,35);assert.equal(s.household.cleanliness,70);
    play(s);
    const days=s.log.filter(l=>l.type==='daily');assert.equal(days.length,365);
    for(const key of E.PUBLIC_STATS){
      assert.ok(s.stats[key]>15&&s.stats[key]<95,`${preset.id} ${key}=${s.stats[key]}`);
      assert.equal(days.filter(day=>day.stats[key]===0||day.stats[key]===100).length,0,`${preset.id} ${key} should not stick to an endpoint`);
    }
    assert.ok(s.stats.fatigue>8&&s.stats.fatigue<85,`${preset.id} fatigue=${s.stats.fatigue}`);
    assert.ok(s.log.some(l=>l.type==='household'&&l.activityId));
  }
});

test('eight annual directions leave different knowledge, relationships, family, health and household outcomes',()=>{
  const results={};
  for(const direction of E.AUTO_DIRECTIONS){const s=play(game('worker',{seed:47,personalBudget:3000000,startCash:10000000,preferences:['photo','music','pottery']}),direction);results[direction]=s;assert.equal(E.getSummary(s).daysPlayed,365);}
  assert.ok(results.selfdev.stats.knowledge>results.rest.stats.knowledge+10);
  assert.ok(results.social.stats.relationship>results.rest.stats.relationship+8);
  assert.ok(results.family.stats.family>results.social.stats.family+8);
  assert.ok(results.health.stats.health>results.selfdev.stats.health+3);
  assert.ok(results.home.household.cleanliness>results.hobby.household.cleanliness+10);
  assert.ok(results.rest.stats.fatigue<results.selfdev.stats.fatigue);
  for(const s of Object.values(results))for(const key of E.PUBLIC_STATS)assert.ok(s.stats[key]>10&&s.stats[key]<99,`${key}=${s.stats[key]}`);
});

test('caregivers rotate all selected interests and self development is not restricted to a paid-work role',()=>{
  const s=game('caregiver',{seed:47,region:'city',transport:'car',preferences:['study','music','pottery'],personalBudget:1000000});
  play(s,'balanced',()=>s.date>='2026-02-15');
  for(const id of ['study','music','pottery'])assert.ok(s.activityCounts[id]>0,id);
  const learning=game('caregiver',{seed:47});assert.ok(E.prepareAutoWeek(learning,{direction:'selfdev'}).ok);
  assert.deepEqual(learning.plan.map(p=>p.activityId),['study','read','culture']);
});

test('automatic preference replacement is atomic and preserves manual and confirmed recurring appointments',()=>{
  const s=game('worker',{seed:47,preferences:['read','walk']});
  const manual=E.addPlan(s,{date:'2026-01-04',slot:'evening',activityId:'music'}).plan;
  E.addRule(s,{activityId:'read',anchor:'2026-01-03',kind:'weeks',interval:1,slot:'morning'});assert.ok(E.confirmReservations(s).ok);
  const recurring=s.plan.find(p=>p.ruleId);assert.ok(E.prepareAutoWeek(s).ok);
  assert.ok(E.replanAutoWeek(s,{preferences:['study','photo'],direction:'balanced'}).ok);
  assert.deepEqual(s.plan.find(p=>p.id===manual.id),manual);assert.deepEqual(s.plan.find(p=>p.id===recurring.id),recurring);
  assert.deepEqual(s.config.preferences,['study','photo']);
  const before=JSON.stringify(s);assert.equal(E.replanAutoWeek(s,{preferences:['missing']}).ok,false);assert.equal(JSON.stringify(s),before);
  const low=game('caregiver',{salary:0,externalAllowance:0,startCash:0,fixedCosts:0,personalBudget:0,preferences:['pottery','culture','music']});
  const prepared=E.prepareAutoWeek(low);assert.ok(prepared.ok);assert.ok(prepared.notes.length);assert.ok(low.plan.every(p=>D.activityPrice(low.config,p.activityId).amount===0));
});

test('neglected cleaning accumulates and affects wellbeing; cleaning reverses the actual backlog',()=>{
  const neglected=game('worker',{seed:11}),kept=game('worker',{seed:11});
  E.addRule(kept,{activityId:'cleaning',anchor:'2026-01-03',kind:'weeks',interval:1,slot:'morning'});
  function runToApril(s){for(let guard=0;guard<1200&&s.date<'2026-04-01';guard++){if(s.phase==='event')chooseFirst(s);else if(s.phase==='review')E.finishReview(s);else{const confirmed=E.confirmReservations(s);for(const issue of confirmed.issues)E.skipReservation(s,issue,'time');E.advance(s);}}}
  runToApril(neglected);runToApril(kept);
  assert.ok(neglected.household.cleanliness<10);assert.equal(neglected.household.lastCleaned,null);
  assert.ok(kept.household.cleanliness>70);assert.ok(kept.household.lastCleaned);
  assert.ok(kept.stats.health>neglected.stats.health+5);
  assert.ok(kept.stats.happiness>neglected.stats.happiness+3);
  assert.ok(neglected.log.some(l=>l.type==='household'&&!l.activityId));
});

test('child-specific age drives care; an adult needs no basic care and gender cannot change time',()=>{
  const baseline={age:55,children:2,childAge:'adult',careShare:100,childProfiles:[{age:1,gender:'woman',militaryStatus:'none'},{age:24,gender:'man',militaryStatus:'none'}]};
  const s=game('caregiver',baseline);assert.equal(E.careMinutes(s,'2026-01-03','morning'),130);
  s.config.childProfiles[0].age=18;assert.equal(E.careMinutes(s,'2026-01-03','morning'),0);
  s.config.childProfiles[0].age=2;s.config.childProfiles[0].gender='man';assert.equal(E.careMinutes(s,'2026-01-03','morning'),130);
  assert.throws(()=>game('caregiver',{...baseline,childProfiles:[{age:1,gender:'man',militaryStatus:'serving'},{age:24,gender:'man',militaryStatus:'none'}]}));
});

test('influenza and pneumonia have free choices, real calendar recovery, no stacked illness, and truthful logs',()=>{
  for(const id of ['illness_influenza','illness_pneumonia']){
    const s=game('worker',{seed:47,salary:0,startCash:0,fixedCosts:0,personalBudget:0});trigger(s,id);
    assert.ok(E.choose(s,'rest').ok);assert.equal(s.healthEpisode.subject,'self');assert.equal(s.finance.cash,0);
    const due=s.healthEpisode.recoveryDue;assert.equal(Events.eligible(s,'illness_influenza'),false);
    play(s,'rest',()=>s.pendingEvent?.catalogId==='illness_recovery',false);
    assert.ok(s.date>=due);assert.ok(s.log.some(l=>l.type==='time'&&l.date<s.date));
    assert.ok(E.choose(s,'slow').ok);assert.equal(s.healthEpisode,null);
    assert.equal(s.log.filter(l=>l.type==='health'&&l.recovered).length,1);
  }
});

test('HFMD belongs only to a configured child aged 0–2 and does not diagnose the parent',()=>{
  const s=game('caregiver',{age:40,children:2,childAge:'school',childProfiles:[{age:9,gender:'man',militaryStatus:'none'},{age:2,gender:'woman',militaryStatus:'none'}]});
  assert.ok(Events.eligible(s,'child_hfmd'));const health=s.stats.health;
  trigger(s,'child_hfmd');assert.ok(E.choose(s,'share').ok);
  assert.equal(s.healthEpisode.kind,'hfmd');assert.equal(s.healthEpisode.subject,'child');assert.equal(s.healthEpisode.childIndex,1);assert.equal(s.stats.health,health);
  const older=game('caregiver',{children:1,childAge:'preschool',childProfiles:[{age:3,gender:'man',militaryStatus:'none'}]});assert.equal(Events.eligible(older,'child_hfmd'),false);
  assert.equal(Events.eligible(game(),'child_hfmd'),false);
  assert.match(Events.HEALTH_MODEL_NOTE,/게임용 가정/);assert.match(Events.HEALTH_SOURCES.find(x=>x.id==='kdca-hfmd').application,/실제 발병 연령의 상한이 아닙니다/);
});

test('leave and return require an explicitly serving adult son and preserve family scenes',()=>{
  const s=game('worker',{age:55,children:1,childAge:'adult',childProfiles:[{age:22,gender:'man',militaryStatus:'serving'}]});
  assert.equal(E.careMinutes(s,'2026-01-03','morning'),0);trigger(s,'military_leave');assert.ok(E.choose(s,'together').ok);assert.equal(s.flags.militaryChildIndex,0);
  play(s,'family',()=>s.pendingEvent?.catalogId==='military_return',false);assert.ok(E.choose(s,'call').ok);
  assert.equal(s.flags.militaryLeaveUntil,undefined);assert.equal(s.log.filter(l=>l.type==='relationship'&&l.eventId?.startsWith('military_')).length,2);
  for(const child of [{age:22,gender:'man',militaryStatus:'none'},{age:16,gender:'man',militaryStatus:'none'},{age:22,gender:'woman',militaryStatus:'none'}])assert.equal(Events.eligible(game('worker',{age:55,children:1,childAge:'adult',childProfiles:[child]}),'military_leave'),false);
});

test('new daily measures, illness and automatic choices replay with identical seeds',()=>{
  const config={seed:702,preferences:['read','run','culture'],childAge:'toddler',children:1,childProfiles:[{age:2,gender:'woman',militaryStatus:'none'}]};
  const a=game('caregiver',config),b=game('caregiver',config);
  play(a,'balanced',()=>a.date>='2026-04-01');play(b,'balanced',()=>b.date>='2026-04-01');assert.deepEqual(a,b);
  const restored=JSON.parse(JSON.stringify(a));
  play(a,'balanced',()=>a.date>='2026-07-01');play(restored,'balanced',()=>restored.date>='2026-07-01');assert.deepEqual(restored,a);
});
