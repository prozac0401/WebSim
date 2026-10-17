'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js');
const make=age=>E.create({...D.DEFAULT_CONFIG,age,seed:47,preferences:['rest'],startCash:10000000});

test('new lives have explicit modest age baselines and recovery rates at every boundary',()=>{
 const cases=[[18,74,1.1],[29,74,1.1],[30,72,1],[39,72,1],[40,70,.95],[49,70,.95],[50,68,.9],[59,68,.9],[60,66,.85],[69,66,.85],[70,64,.8],[100,64,.8]];
 for(const [age,health,rate]of cases){const s=make(age),p=D.ageHealthProfile(s.config);assert.equal(s.stats.health,health);assert.equal(p.recoveryRate,rate);assert.equal(p.legacy,false);assert.deepEqual(S.parse(S.serialize(s)).state,s);}
 for(const age of [17,101,NaN])assert.throws(()=>make(age));
 assert.ok(E.validateConfig({...D.DEFAULT_CONFIG,ageHealthModel:'invented'}).length);
});

test('the same rest restores health and fatigue at the selected rate without altering spending or RNG',()=>{
 const states=[make(26),make(36),make(66)];
 for(const s of states){s.stats.health=40;s.stats.fatigue=60;s.lastExternal=s.date;assert.ok(E.addPlan(s,{date:s.date,slot:'morning',activityId:'rest'}).ok);assert.ok(E.advanceAutomatic(s,{maxDays:1,decisions:'auto'}).ok);}
 assert.ok(states[0].stats.health>states[1].stats.health);assert.ok(states[1].stats.health>states[2].stats.health);
 assert.ok(states[0].stats.fatigue<states[1].stats.fatigue);assert.ok(states[1].stats.fatigue<states[2].stats.fatigue);
 assert.ok(states[2].stats.health>40&&states[2].stats.fatigue<60,'older people still recover through rest');
 for(const s of states.slice(1)){assert.deepEqual(s.finance,states[0].finance);assert.deepEqual(s.rng,states[0].rng);}
});

test('age does not multiply immediate illness damage or change the illness follow-up date',()=>{
 const states=[make(26),make(66)];
 for(const s of states){s.stats.health=60;s.stats.fatigue=30;s.queue.unshift({catalogId:'illness_influenza',date:s.date,context:{}});E.advance(s);assert.equal(s.pendingEvent.catalogId,'illness_influenza');assert.ok(E.choose(s,'rest').ok);}
 assert.equal(states[0].stats.health,states[1].stats.health);assert.equal(states[0].stats.fatigue,states[1].stats.fatigue);
 assert.deepEqual(states[0].healthEpisode,states[1].healthEpisode);
});

test('published saves keep their original baseline, recovery rules and exact current state',()=>{
 const text=fs.readFileSync(path.join(__dirname,'fixtures/v6-young-parent.json'),'utf8'),before=JSON.parse(text).state,loaded=S.parse(text);
 assert.ok(loaded.ok,loaded.reason);assert.deepEqual(loaded.state,before);
 assert.deepEqual(D.ageHealthProfile(loaded.state.config),{modelId:null,legacy:true,ageBand:'legacy',label:'이전 저장의 기준',initialHealth:70,recoveryRate:1,sourceIds:[]});
 const a=structuredClone(loaded.state),b=structuredClone(loaded.state);b.config.age=66;
 assert.ok(E.advanceAutomatic(a,{maxDays:1}).ok);assert.ok(E.advanceAutomatic(b,{maxDays:1}).ok);
 assert.deepEqual(a.stats,b.stats);assert.deepEqual(a.rng,b.rng);assert.deepEqual(a.finance,b.finance);
});

test('choices outweigh the baseline: an older rested life can be healthier than a younger overworked life',()=>{
 const older=make(66),younger=make(26);
 for(const [s,direction]of [[older,'health'],[younger,'selfdev']]){
  for(let turns=0;s.date<'2026-03-01'&&turns<30;turns++)assert.ok(E.advanceAutomatic(s,{direction,decisions:'auto'}).ok);
 }
 assert.ok(older.stats.health>younger.stats.health,JSON.stringify([older.stats,younger.stats]));
});

test('each age band completes a deterministic year with weekly restore and finite changing wellbeing',()=>{
 for(const age of [26,36,46,56,66,76]){
  const a=make(age),b=make(age);a.config.preferences=['walk','cook','music'];b.config.preferences=['walk','cook','music'];
  for(let turn=0;a.phase!=='finished'&&turn<90;turn++){
   assert.ok(E.advanceAutomatic(a,{decisions:'auto'}).ok);assert.ok(E.advanceAutomatic(b,{decisions:'auto'}).ok);
   const loaded=S.parse(S.serialize(a));assert.ok(loaded.ok,loaded.reason);assert.deepEqual(loaded.state,b);
  }
  const days=a.log.filter(l=>l.type==='daily');assert.equal(days.length,365);
  assert.ok(new Set(days.map(l=>l.stats.health)).size>20);
  for(const day of days)for(const value of Object.values(day.stats))assert.ok(Number.isFinite(value)&&value>=0&&value<=100);
 }
});
