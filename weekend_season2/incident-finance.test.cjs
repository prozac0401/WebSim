'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('./finance.js');
const base={startCash:100000,salary:0,externalAllowance:0,fixedCosts:0,personalBudget:1000000,cardLimit:1000000,payDay:1};
const bill={repairCost:150000,medicalCost:50000,activityId:'motorbike_tour',reference:'activity-incident:p-1',label:'오토바이 사고 수리비·병원비'};

test('incurred accident records all costs once, pays cash and retains unpaid debt beyond optional budget',()=>{
  const c={...base,personalBudget:0},f=F.create(c);F.beginDay(f,'2026-01-01',c);
  const result=F.chargeIncident(f,'2026-01-01',bill);
  assert.equal(result.ok,true);assert.equal(result.total,200000);assert.equal(result.paid,100000);assert.equal(result.unpaid,100000);
  assert.equal(f.cash,0);assert.equal(f.incidentArrears,100000);assert.equal(f.monthSpent,200000);
  assert.equal(F.summary(f).consumption,200000);assert.equal(F.summary(f).paid,100000);assert.equal(F.summary(f).debt,100000);
  assert.equal(F.summary(f).incidentRepair,150000);assert.equal(F.summary(f).incidentMedical,50000);assert.equal(F.available(f,c),0);
  assert.equal(F.canSpend(f,0,'cash',c).ok,true);
  assert.equal(F.canSpend(f,1,'card',{...c,personalBudget:1000000}).cause,'arrears');
});

test('next income pays current and old essentials before accident arrears then card arrears',()=>{
  const c={...base,startCash:0,salary:0},f=F.create(c);
  F.beginDay(f,'2026-01-01',c);
  // Future salary backs an ordinary card purchase, then no salary arrives at settlement.
  assert.equal(F.spend(f,'2026-01-01',10000,'card','기존 카드 사용',{...c,salary:30000,payDay:31}).ok,true);
  assert.equal(F.chargeIncident(f,'2026-01-01',bill).ok,true);F.endDay(f,'2026-01-01',c);
  F.beginDay(f,'2026-01-31',c);F.endDay(f,'2026-01-31',c);
  F.beginDay(f,'2026-02-01',{...c,fixedCosts:20000});F.endDay(f,'2026-02-01',c);
  const repayment={...c,fixedCosts:30000,salary:280000};
  const entries=F.beginDay(f,'2026-03-01',repayment);
  assert.deepEqual(entries.map(t=>t.type),['salary','fixed-cost','fixed-arrears-payment','incident-arrears-payment','arrears-payment']);
  assert.deepEqual(entries.map(t=>t.amount),[280000,30000,20000,200000,10000]);
  assert.equal(f.cash,20000);assert.equal(f.incidentArrears,0);assert.equal(f.fixedArrears,0);assert.equal(f.arrears,0);
  assert.equal(F.summary(f).consumption,260000);assert.equal(F.summary(f).paid,260000);
  assert.equal(f.monthSpent,0,'repayment must not consume the new month budget twice');
});

test('insufficient later income partially repays accident debt without losing the balance',()=>{
  const c={...base,startCash:0},f=F.create(c);F.beginDay(f,'2026-01-01',c);F.chargeIncident(f,'2026-01-01',bill);F.endDay(f,'2026-01-01',c);
  F.beginDay(f,'2026-02-01',{...c,salary:70000});F.endDay(f,'2026-02-01',c);
  assert.equal(f.cash,0);assert.equal(f.incidentArrears,130000);
  const summary=F.summary(f);assert.equal(summary.paid,70000);assert.equal(summary.consumption,200000);assert.equal(summary.debt,130000);
});

test('same incident is idempotent before and after JSON restoration and repayment',()=>{
  const c={...base,startCash:300000},f=F.create(c);F.beginDay(f,'2026-01-01',c);
  assert.equal(F.chargeIncident(f,'2026-01-01',bill).ok,true);F.endDay(f,'2026-01-01',c);
  const copy=JSON.parse(JSON.stringify(f)),before=JSON.stringify(copy);
  assert.equal(F.chargeIncident(copy,'2026-01-01',bill).duplicate,true);assert.equal(JSON.stringify(copy),before);
  assert.equal(copy.ledger.filter(t=>t.type==='incident-cost').length,1);
  assert.equal(copy.ledger.filter(t=>t.type==='incident-unpaid').length,0);
});

test('invalid, conflicting or unopened incident bills never partially mutate finance',()=>{
  const f=F.create(base),unopened=JSON.stringify(f);
  assert.equal(F.chargeIncident(f,'2026-01-01',bill).cause,'unopened-day');assert.equal(JSON.stringify(f),unopened);
  F.beginDay(f,'2026-01-01',base);F.chargeIncident(f,'2026-01-01',bill);
  for(const changed of [{repairCost:1},{medicalCost:1},{activityId:'circuit_drive'},{label:'다른 사고'},
    {repairCost:-1},{medicalCost:1.5},{repairCost:Infinity},{repairCost:1000000000000},{reference:''},{reference:' '.repeat(3)},
    {reference:'x'.repeat(161)},{activityId:''},{label:''},{repairCost:0,medicalCost:0}]){
    const before=JSON.stringify(f);assert.equal(F.chargeIncident(f,'2026-01-01',{...bill,...changed}).ok,false);assert.equal(JSON.stringify(f),before);
  }
  F.endDay(f,'2026-01-01',base);const before=JSON.stringify(f);
  assert.equal(F.chargeIncident(f,'2026-01-01',{...bill,reference:'second'}).cause,'closed-day');assert.equal(JSON.stringify(f),before);
});

test('legacy finance without the new field is readable and gains debt only when an accident occurs',()=>{
  const f=F.create(base);delete f.incidentArrears;F.beginDay(f,'2026-01-01',base);
  const before=JSON.stringify(f);assert.equal(F.summary(f).incidentArrears,0);assert.equal(F.summary(f).debt,0);assert.equal(F.available(f,base),100000);assert.equal(JSON.stringify(f),before);
  assert.equal(F.chargeIncident(f,'2026-01-01',bill).ok,true);assert.equal(f.incidentArrears,100000);
});
