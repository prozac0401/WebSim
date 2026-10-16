'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('./finance.js');
const base={startCash:100000,salary:0,externalAllowance:0,fixedCosts:0,personalBudget:1000000,cardLimit:1000000,payDay:1};

test('side jobs record earned pay today and receive income tomorrow even with no salary',()=>{
  const c={...base,payDay:15},f=F.create(c);
  F.beginDay(f,'2026-01-03',c);const before=F.summary(f);
  const result=F.addEarnedPay(f,'2026-01-03',18000,'배달 보상',{reference:'plan-delivery-1'});
  assert.ok(result.ok);assert.equal(result.duplicate,false);
  assert.equal(f.cash,before.cash);assert.equal(F.summary(f).income,before.income);
  assert.equal(F.summary(f).consumption,before.consumption);assert.equal(f.pendingPay,18000);
  assert.deepEqual(result.reward,{earnedDate:'2026-01-03',amount:18000,label:'배달 보상',dueDate:'2026-01-04',kind:'sidejob',reference:'plan-delivery-1'});
  F.endDay(f,'2026-01-03',c);F.beginDay(f,'2026-01-04',c);
  assert.equal(f.cash,before.cash+18000);assert.equal(F.summary(f).income,18000);assert.equal(f.pendingPay,0);
  const paid=f.ledger.find(t=>t.type==='extra-pay');
  assert.equal(paid.date,'2026-01-04');assert.equal(paid.reference,'plan-delivery-1');assert.equal(paid.earnedDate,'2026-01-03');assert.equal(paid.dueDate,'2026-01-04');
});

test('regular overtime keeps next-payday timing while a same-day side job pays tomorrow',()=>{
  const f=F.create(base);F.beginDay(f,'2026-01-01',base);
  F.addPendingPay(f,'2026-01-01',90000,'추가근무');
  assert.ok(F.addEarnedPay(f,'2026-01-01',32000,'아르바이트',{reference:'parttime-1'}).ok);
  F.endDay(f,'2026-01-01',base);F.beginDay(f,'2026-01-02',base);
  assert.equal(F.summary(f).income,32000);assert.equal(f.pendingPay,90000);
  F.endDay(f,'2026-01-02',base);F.beginDay(f,'2026-02-01',base);
  assert.equal(F.summary(f).income,122000);assert.equal(f.pendingPay,0);
  assert.deepEqual(f.ledger.filter(t=>t.type==='extra-pay').map(t=>[t.label,t.date]),[['아르바이트','2026-01-02'],['추가근무','2026-02-01']]);
});

test('next-day income pays new essentials then old essentials then card arrears',()=>{
  const c={...base,startCash:0,salary:20000,payDay:31},f=F.create(c);
  F.beginDay(f,'2026-01-01',c);assert.ok(F.spend(f,'2026-01-01',10000,'card','생활 지출',c).ok);F.endDay(f,'2026-01-01',c);
  const noIncome={...c,salary:0};F.beginDay(f,'2026-01-31',noIncome);F.endDay(f,'2026-01-31',noIncome);
  assert.equal(f.arrears,10000);
  const essentials={...noIncome,fixedCosts:40000};F.beginDay(f,'2026-02-01',essentials);F.endDay(f,'2026-02-01',essentials);
  assert.equal(f.fixedArrears,40000);
  F.beginDay(f,'2026-02-28',essentials);F.addEarnedPay(f,'2026-02-28',100000,'누적 프로젝트 보상',{reference:'project-final'});F.endDay(f,'2026-02-28',essentials);
  const transactions=F.beginDay(f,'2026-03-01',essentials);
  assert.deepEqual(transactions.map(t=>t.type),['extra-pay','fixed-cost','fixed-arrears-payment','arrears-payment']);
  assert.deepEqual(transactions.map(t=>t.amount),[100000,40000,40000,10000]);
  assert.equal(f.cash,10000);assert.equal(f.arrears,0);assert.equal(f.fixedArrears,0);assert.equal(f.pendingPay,0);
});

test('a side job earned on month end cannot fund that same night card settlement',()=>{
  const c={...base,startCash:0,salary:20000,payDay:31},f=F.create(c);
  F.beginDay(f,'2026-01-01',c);assert.ok(F.spend(f,'2026-01-01',10000,'card','월말 청구',c).ok);F.endDay(f,'2026-01-01',c);
  const noIncome={...c,salary:0};F.beginDay(f,'2026-01-31',noIncome);
  F.addEarnedPay(f,'2026-01-31',18000,'말일 배달',{reference:'delivery-month-end'});
  assert.equal(f.cash,0);assert.equal(F.available(f,noIncome),0);
  F.endDay(f,'2026-01-31',noIncome);assert.equal(f.arrears,10000);assert.equal(f.pendingPay,18000);
  F.beginDay(f,'2026-02-01',noIncome);assert.equal(f.cash,8000);assert.equal(f.arrears,0);
  assert.equal(F.summary(f).income,18000);assert.equal(F.summary(f).consumption,10000);
});

test('next-day pay on payday and month end is received once before activity and settlement',()=>{
  const c={...base,startCash:0,salary:30000,payDay:31},f=F.create(c);
  F.beginDay(f,'2026-01-30',c);F.addEarnedPay(f,'2026-01-30',18000,'배달',{reference:'delivery-once'});F.endDay(f,'2026-01-30',c);
  assert.deepEqual(F.beginDay(f,'2026-01-31',c).map(t=>t.type),['salary','extra-pay']);
  assert.ok(F.spend(f,'2026-01-31',10000,'card','취미',c).ok);F.endDay(f,'2026-01-31',c);
  const snapshot=JSON.stringify(f);assert.deepEqual(F.beginDay(f,'2026-01-31',c),[]);assert.deepEqual(F.endDay(f,'2026-01-31',c),[]);
  assert.equal(JSON.stringify(f),snapshot);assert.equal(f.cash,38000);
  assert.equal(F.summary(f).income,48000);assert.equal(F.summary(f).consumption,10000);
});

test('reference retries are idempotent before payout, after payout, and after JSON restoration',()=>{
  let f=F.create(base);F.beginDay(f,'2026-04-03',base);
  const args=['2026-04-03',40000,'프로젝트 중간 보상',{reference:'project-7:milestone-2'}];
  assert.ok(F.addEarnedPay(f,...args).ok);let snapshot=JSON.stringify(f);
  assert.equal(F.addEarnedPay(f,...args).duplicate,true);assert.equal(JSON.stringify(f),snapshot);
  F.endDay(f,'2026-04-03',base);F.beginDay(f,'2026-04-04',base);f=JSON.parse(JSON.stringify(f));snapshot=JSON.stringify(f);
  assert.equal(F.addEarnedPay(f,...args).duplicate,true);assert.equal(JSON.stringify(f),snapshot);
  assert.equal(f.ledger.filter(t=>t.type==='pending-pay').length,1);assert.equal(f.ledger.filter(t=>t.type==='extra-pay').length,1);assert.equal(F.summary(f).income,40000);
});

test('conflicting and malformed references fail without partially changing the ledger',()=>{
  const f=F.create(base);F.beginDay(f,'2026-05-01',base);F.addEarnedPay(f,'2026-05-01',80000,'완료 보상',{reference:'project-1:final'});
  for(const args of [
    ['2026-05-01',90000,'완료 보상',{reference:'project-1:final'}],
    ['2026-05-02',80000,'완료 보상',{reference:'project-1:final'}],
    ['2026-05-01',80000,'다른 보상',{reference:'project-1:final'}],
    ['2026-05-01',80000,'보상',{reference:''}],['2026-05-01',80000,'보상',{reference:' '.repeat(3)}],
    ['2026-05-01',80000,'보상',{reference:'x'.repeat(161)}],['2026-05-01',-1,'보상',{reference:'bad'}],
    ['2026-05-01',1.5,'보상',{reference:'bad'}],['2026-02-30',1,'보상',{reference:'bad'}]
  ]){const before=JSON.stringify(f);assert.equal(F.addEarnedPay(f,...args).ok,false);assert.equal(JSON.stringify(f),before);}
});

test('new earned rewards cannot be inserted before opening or after closing a day',()=>{
  const f=F.create(base);let snapshot=JSON.stringify(f);
  assert.equal(F.addEarnedPay(f,'2026-06-01',18000,'배달',{reference:'early'}).cause,'unopened-day');assert.equal(JSON.stringify(f),snapshot);
  F.beginDay(f,'2026-06-01',base);F.endDay(f,'2026-06-01',base);snapshot=JSON.stringify(f);
  assert.equal(F.addEarnedPay(f,'2026-06-01',18000,'배달',{reference:'late'}).cause,'closed-day');assert.equal(JSON.stringify(f),snapshot);
});

test('earned rewards preserve leap-day and year-end dates, pending totals, and payout identity',()=>{
  for(const [date,due]of [['2028-02-28','2028-02-29'],['2028-02-29','2028-03-01'],['2026-12-31','2027-01-01']]){
    const f=F.create(base);F.beginDay(f,date,base);F.addEarnedPay(f,date,80000,'프로젝트 완료',{reference:'project:'+date});F.endDay(f,date,base);
    const restored=JSON.parse(JSON.stringify(f));assert.equal(restored.pendingRewards[0].dueDate,due);assert.equal(F.summary(restored).pendingPay,80000);assert.equal(F.summary(restored).income,0);
    F.beginDay(restored,due,base);assert.equal(F.summary(restored).income,80000);assert.equal(F.summary(restored).pendingPay,0);
    assert.equal(restored.ledger.find(t=>t.type==='extra-pay').reference,'project:'+date);
  }
});

test('available budget counts earned pay in this month once, excluding next-month rewards',()=>{
  const c={...base,startCash:0,payDay:31},f=F.create(c);
  F.beginDay(f,'2026-01-30',c);F.addEarnedPay(f,'2026-01-30',18000,'배달',{reference:'january'});
  assert.equal(F.available(f,c),18000);F.endDay(f,'2026-01-30',c);F.beginDay(f,'2026-01-31',c);
  assert.equal(F.available(f,c),18000);F.addEarnedPay(f,'2026-01-31',32000,'아르바이트',{reference:'february'});
  assert.equal(F.available(f,c),18000);assert.equal(f.pendingPay,32000);assert.equal(F.summary(f).income,18000);
});
