'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./calendar.js'),D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js'),R=require('./recurrence.js');
const expected={
 '2028-01-01':'1월1일','2028-01-26':'설날','2028-01-27':'설날','2028-01-28':'설날',
 '2028-03-01':'삼일절','2028-04-12':'국회의원선거일','2028-05-01':'노동절','2028-05-02':'부처님오신날',
 '2028-05-05':'어린이날','2028-06-06':'현충일','2028-07-17':'제헌절','2028-08-15':'광복절',
 '2028-10-02':'추석','2028-10-03':'개천절 · 추석','2028-10-04':'추석','2028-10-05':'대체공휴일(추석)',
 '2028-10-09':'한글날','2028-12-25':'기독탄신일'
};
test('2028 KASI snapshot preserves all 19 names on 18 dates and counts 123 unique days off',()=>{
 assert.deepEqual(Object.fromEntries(C.dates(2028).filter(C.holiday).map(d=>[d,C.holiday(d)])),expected);
 assert.equal(Object.values(expected).flatMap(n=>n.split(' · ')).length,19);
 assert.equal(C.dates(2028).filter(C.isOff).length,123);
 assert.match(C.holidayStatus(2028).label,/공식 발표 전/);
 for(const d of ['2028-01-03','2028-06-07','2028-10-06'])assert.equal(C.isOff(d),false);
 for(let y=2029;y<=2100;y++)assert.equal(C.holidayStatus(y).verified,false);
 const rule=R.createRule({id:'holiday',activityId:'read',anchor:'2028-10-03',kind:'weeks',move:'next-off'});
 assert.equal(R.reservations([rule],'2028-10-02','2028-10-08')[0].date,'2028-10-03');
});
test('holiday daytime slots and automatic planning use the overlap and substitute as single days',()=>{
 const s=E.create({...D.PRESETS.find(p=>p.id==='worker').config,year:2028,seed:47});
 s.date='2028-10-02';s.weekStart=s.date;s.weekNumber=41;
 const week=E.currentWeek(s);
 for(const d of ['2028-10-03','2028-10-05'])assert.ok(week.find(x=>x.date===d).slots.find(x=>x.id==='morning').available);
 assert.equal(week.find(x=>x.date==='2028-10-06').slots.find(x=>x.id==='morning').available,false);
 const r=E.prepareAutoWeek(s,{direction:'rest'});assert.ok(r.ok,r.reason);
 assert.ok(s.plan.some(p=>p.date==='2028-10-03'&&p.slot!=='evening'));
 assert.ok(E.addPlan(s,{date:'2028-10-05',slot:'morning',activityId:'read'}).ok);
 assert.equal(E.addPlan(s,{date:'2028-10-06',slot:'morning',activityId:'read'}).ok,false);
});
test('four roles finish all 366 days; exact save restoration continues identically through leap day and holidays',()=>{
 for(const preset of D.PRESETS){
  let s=E.create({...preset.config,year:2028,seed:47}),restored=null;
  for(let n=0;n<100&&s.phase!=='finished';n++){
   const r=E.advanceAutomatic(s,{decisions:'auto'});assert.ok(r.ok,r.reason);
   if(restored){assert.ok(E.advanceAutomatic(restored,{decisions:'auto'}).ok);assert.deepEqual(restored,s);}
   const parsed=S.parse(S.serialize(s));assert.ok(parsed.ok,parsed.reason);assert.deepEqual(parsed.state,s);restored=parsed.state;
  }
  assert.equal(s.phase,'finished');assert.equal(s.date,'2028-12-31');
  const daily=s.log.filter(x=>x.type==='daily').map(x=>x.date);assert.deepEqual(daily,C.dates(2028));
  assert.equal(E.getSummary(s).daysPlayed,366);
  assert.ok(s.log.filter(x=>x.type==='weekday').every(x=>!C.isOff(x.date)));
 }
});
