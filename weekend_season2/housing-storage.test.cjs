'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const D=require('./data.js'),E=require('./engine.js'),F=require('./finance.js'),S=require('./storage.js');
function wrap(state){let hash=2166136261;const text=JSON.stringify(state);for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return JSON.stringify({format:S.FORMAT,version:state.version,state,checksum:(hash>>>0).toString(16).padStart(8,'0')});}
function tick(s){const result=E.advanceAutomatic(s,{maxDays:7,decisions:'auto'});assert.ok(result.ok,result.reason);return s;}
function finish(s){for(let i=0;i<180&&s.phase!=='finished';i++)tick(s);assert.equal(s.phase,'finished');return s;}
const config={...D.DEFAULT_CONFIG,housingTenure:'rent',monthlyRent:600001,housingLoanPrincipal:50000001,housingLoanRateBps:425,fixedCosts:800000};

test('published v4 save keeps every past transaction and gains no invented housing payment',()=>{
  const text=fs.readFileSync(path.join(__dirname,'fixtures/v4-housing-legacy.json'),'utf8');
  const old=JSON.parse(text).state,loaded=S.parse(text);assert.equal(old.version,4);assert.ok(loaded.ok,loaded.reason);
  const s=loaded.state;assert.equal(s.version,D.VERSION);assert.equal(s.config.housingTenure,'unspecified');
  for(const field of ['finance','rng','log','plan','rules','artifacts','stats','household','healthEpisode'])assert.deepEqual(s[field],old[field],field);
  assert.equal(s.config.fixedCosts,old.config.fixedCosts);assert.equal(s.config.housingLoanPrincipal,0);
  const fresh=S.parse(S.serialize(s));assert.ok(fresh.ok,fresh.reason);assert.equal(fresh.migrated,false);
  finish(fresh.state);assert.deepEqual(S.validate(fresh.state),[]);
  const bills=fresh.state.finance.ledger.filter(t=>t.type==='fixed-cost');assert.equal(bills.length,12);
  assert.ok(bills.every(t=>t.amount===old.config.fixedCosts));
  const summary=E.getSummary(fresh.state).finance;assert.equal(summary.housingCosts,0);assert.equal(summary.housingLoanPrincipal,0);
});

test('published v4 pending illness migrates without applying older event-text signatures',()=>{
  const text=fs.readFileSync(path.join(__dirname,'fixtures/v4-pending-influenza.json'),'utf8'),old=JSON.parse(text).state;
  const loaded=S.parse(text);assert.ok(loaded.ok,loaded.reason);assert.deepEqual(loaded.state.pendingEvent,old.pendingEvent);
  assert.ok(E.choose(loaded.state,'rest').ok);assert.ok(S.parse(S.serialize(loaded.state)).ok);
});

test('rent and interest survive a midyear round trip and finish with the original principal',()=>{
  const a=E.create(config);while(a.date<'2026-06-15')tick(a);
  const loaded=S.parse(S.serialize(a));assert.ok(loaded.ok,loaded.reason);const b=loaded.state;
  finish(a);finish(b);assert.deepEqual(a,b);assert.deepEqual(S.validate(b),[]);
  const summary=E.getSummary(b).finance;assert.equal(summary.housingRent,600001*12);
  assert.equal(summary.housingInterest,Math.round(50000001*425/120000)*12);
  assert.equal(summary.housingLoanPrincipal,50000001);
  assert.equal(summary.debt,summary.unpaidDebt+50000001);
  assert.equal(b.finance.cash,config.startCash+summary.income-summary.paid);
});

test('housing imports reject invalid terms and edited or missing monthly breakdowns',()=>{
  const original=tick(E.create(config));assert.deepEqual(S.validate(original),[]);
  const mutations=[
    s=>{s.config.monthlyRent=-1;},s=>{s.config.housingLoanRateBps=4.25;},
    s=>{s.config.housingLoanPrincipal=10000000001;},s=>{s.config.housingTenure='jeonse';},
    s=>{s.finance.ledger.find(t=>t.type==='fixed-cost').rent++;},
    s=>{delete s.finance.ledger.find(t=>t.type==='fixed-cost').loanInterest;},
    s=>{s.finance.ledger.find(t=>t.type==='fixed-cost').loanPrincipal--;},
    s=>{s.finance.ledger.find(t=>t.type==='fixed-cost').housingLoanRateBps++;},
    s=>{s.finance.ledger.find(t=>t.type==='fixed-cost').unpaid++;},
    s=>{s.finance.ledger.find(t=>t.type==='fixed-cost').date='2026-01-02';},
    s=>{s.config.housingLoanPrincipal++;},
  ];
  for(const mutate of mutations){const changed=structuredClone(original);mutate(changed);const result=S.parse(wrap(changed));assert.equal(result.ok,false,result.reason);}
});

test('an unpaid housing bill stays a single expense when later income settles it',()=>{
  const s=E.create({...config,startCash:0,salary:3000000,payDay:15,personalBudget:0,preferences:[]});
  tick(s);assert.equal(s.finance.fixedArrears,F.monthlyCosts(s.config).total);
  const loaded=S.parse(S.serialize(s));assert.ok(loaded.ok,loaded.reason);
  while(loaded.state.date<'2026-01-18')tick(loaded.state);
  const f=loaded.state.finance;assert.equal(f.fixedArrears,0);
  assert.equal(f.ledger.filter(t=>t.type==='fixed-cost').length,1);
  assert.equal(f.ledger.filter(t=>t.type==='fixed-arrears-payment').reduce((n,t)=>n+t.consumption,0),0);
  assert.equal(E.getSummary(loaded.state).finance.housingCosts,F.housingCosts(config).total);
  assert.deepEqual(S.validate(loaded.state),[]);
});

test('published low-income parent becomes divorced without raising any money or rewriting history',()=>{
  const text=fs.readFileSync(path.join(__dirname,'fixtures/v4-low-income-parent.json'),'utf8'),old=JSON.parse(text).state;
  assert.equal(old.config.maritalStatus,'single');assert.ok(old.config.children>0);
  assert.ok(old.config.salary+old.config.externalAllowance<100000);assert.ok(old.config.fixedCosts<50000);
  const result=S.parse(text);assert.ok(result.ok,result.reason);const s=result.state;
  assert.equal(s.config.maritalStatus,'divorced');assert.doesNotMatch(s.config.lifeIntro,/미혼/);assert.match(s.config.lifeIntro,/이혼/);
  for(const field of ['salary','externalAllowance','fixedCosts','personalBudget','cardLimit','startCash','careShare','childProfiles','incomeOrigin'])assert.deepEqual(s.config[field],old.config[field],field);
  for(const field of ['finance','rng','log','plan','rules','artifacts','stats','household','healthEpisode','pendingEvent','queue'])assert.deepEqual(s[field],old[field],field);
  assert.ok(E.choose(s,'ask').ok);assert.ok(S.parse(S.serialize(s)).ok);
  finish(s);assert.deepEqual(S.validate(s),[]);
  assert.ok(s.eventHistory.single_followup);assert.equal(s.eventHistory.partner_care,undefined);
});
