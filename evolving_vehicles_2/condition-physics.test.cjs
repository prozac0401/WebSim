'use strict';
// Independent integration acceptance tests: actual engine forces, planning,
// energy accounting and reset boundaries rather than thermal-formula copies.
const test = require('node:test');
const assert = require('node:assert/strict');
const Race = require('./race-engine.js');
const Tune = require('./tuning-evolution.js');
const Condition = require('./vehicle-condition.js');
const Continuous = require('./continuous-race.js');
const circuits = require('./circuits.js');
const G = 9.81;
const circle = {id:'condition-audit-circle',name:'Condition audit 120 m circle',lengthM:2*Math.PI*120,
  coordinates:Array.from({length:129},(_,i)=>{const a=i/128*Math.PI*2;return [127+Math.cos(a)*120/(111195.08*Math.cos(37*Math.PI/180)),37+Math.sin(a)*120/111195.08];})};
const variants={avante:'avante-2.0-16',supra:'supra-3.0t-rz',ioniq5:'ioniq5-long-awd',k5:'k5-2.0hev'};
function entry(vehicleId='avante',levels={},overrides={}) {
 const e=Tune.createEntrant({vehicleId,variantId:variants[vehicleId],budget:30,levels});
 return Object.keys(overrides).length?{...e,spec:{...e.spec,...overrides}}:e;
}
function make({vehicleId='avante',levels={},spec={},...options}={}) {
 return new Race({circuit:circle,entrants:[entry(vehicleId,levels,spec)],laps:3,...options});
}
function wheelForce(car,speed,grade=0){return car.massKg*car.acceleration+.5*1.225*car.dragArea*speed*speed+car.massKg*G*(car.rollingCoefficient+grade)/Math.hypot(1,grade);}

test('axle contact reserve shares corner and drive demand and preserves weight-transfer differences',()=>{
 const r=make(),c=r.cars[0],straight=r._axleEnvelope(c,20,0,0,0),turn=r._axleEnvelope(c,20,0,.01,0);
 assert(turn.front>0&&turn.front<straight.front);assert(turn.rear>0&&turn.rear<straight.rear);
 const accelerating=r._axleEnvelope(c,20,0,.01,3),braking=r._axleEnvelope(c,20,0,.01,-3);
 assert(accelerating.front<braking.front,'FWD driven front loses reserve under acceleration');
 assert(accelerating.rear>braking.rear,'RWD driven rear gains reserve under acceleration');
 for(const e of [straight,turn,accelerating,braking])assert(Math.abs(e.frontLoad+e.rearLoad-c.massKg*G)<1e-6);
});

test('hot brakes lower the backward planned speed before corner entry',()=>{
 const r=make({circuit:circuits.find(x=>x.id==='inje')}),c=r.cars[0],healthy=c.speedProfile.slice();
 c.condition.brakes.front.temperatureC=c.condition.brakes.rear.temperatureC=900;
 c.conditionProfileAt=0;r._refreshConditionProfiles(c,0);
 const changed=healthy.map((v,i)=>v-c.speedProfile[i]);
 assert(Math.max(...changed)>1,'fade must change the driving plan, not only a HUD gauge');
 const early=changed.some((d,i)=>d>.2&&healthy[i]>healthy[(i+1)%healthy.length]+.02);
 assert(early,'slower target occurs on a braking approach before a corner');
 assert(r._brakingCapacity(c,20,0,0)<c.brakingHardware);
});

test('hot worn tyres reduce both axle contact reserves and corner targets',()=>{
 const r=make(),c=r.cars[0],before=r._axleEnvelope(c,15,0,.005,0),target=c.speedProfile.slice();
 for(const axle of ['front','rear']){c.condition.tires[axle].temperatureC=135;c.condition.tires[axle].wear=.5;}
 const after=r._axleEnvelope(c,15,0,.005,0);c.conditionProfileAt=0;r._refreshConditionProfiles(c,0);
 assert(after.front<before.front&&after.rear<before.rear);
 assert(c.speedProfile.every((v,i)=>v<target[i]));
});

test('an initially hot tyre state does not permanently lower the recovered healthy profile',()=>{
 const warm=make(),hot=make({conditionOptions:{initialTireC:135}});
 for(const r of [warm,hot]){const c=r.cars[0];for(const axle of ['front','rear'])c.condition.tires[axle].temperatureC=45;c.conditionProfileAt=0;r._refreshConditionProfiles(c,0);}
 for(let i=0;i<warm.cars[0].speedProfile.length;i++)assert(Math.abs(warm.cars[0].speedProfile[i]-hot.cars[0].speedProfile[i])<1e-9,'recovered profile must not retain its initial tyre temperature');
});

test('grade holding uses actual wheel work: climbing produces no brake heat; descending splits regen and friction',()=>{
 function held(grade,initialSoc=.8){
  const r=make({vehicleId:'ioniq5',initialSpeed:20,conditionOptions:{initialSoc}}),c=r.cars[0];
  r._refreshConditionProfiles=()=>{};r._target=()=>20;
  r.sampleForCar=()=>({grade,curvature:0,x:0,y:0,elevation:0,centerS:0});
  r.step(Race.FIXED_DT);return {r,c};
 }
 const up=held(.08),down=held(-.08),full=held(-.08,1);
 assert(Math.abs(up.c.acceleration)<1e-8);assert.equal(up.c.serviceBrakeForceN,0);assert.equal(up.c.condition.energy.frictionBrakeJ,0);
 for(const {r,c} of [down,full]){
  assert(Math.abs(c.acceleration)<1e-8);assert(c.serviceBrakeForceN>0);
  assert(Math.abs(c.regenBrakeForceN+c.frictionBrakeForceN-c.serviceBrakeForceN)<1e-8);
  assert(Math.abs(c.serviceBrakeForceN+wheelForce(c,20,-.08))<1e-7);
  const mechanical=(c.regenBrakeForceN+c.frictionBrakeForceN)*20*Race.FIXED_DT;
  assert(Math.abs(c.condition.energy.regenMechanicalJ+c.condition.energy.frictionBrakeJ-mechanical)<1e-6);
  assert(c.condition.energy.batteryChargeJ<=c.condition.energy.regenMechanicalJ);
 }
 assert(down.c.regenBrakeForceN>0);assert.equal(full.c.regenBrakeForceN,0);
 assert(full.c.frictionBrakeForceN>down.c.frictionBrakeForceN);
});

test('EV hot derating limits low-speed torque as well as high-speed power',()=>{
 for(const [speed,torque] of [[5,40],[35,10000]]){
  const normal=make({vehicleId:'ioniq5',initialSpeed:speed,spec:{torqueNm:torque}});
  const hot=make({vehicleId:'ioniq5',initialSpeed:speed,spec:{torqueNm:torque},conditionOptions:{initialBatteryC:65}});
  const nc=normal.cars[0],hc=hot.cars[0],factor=Condition.limits(hc,hc.condition).powerFactor;
  for(const r of [normal,hot]){r._refreshConditionProfiles=()=>{};r._target=()=>100;r.cars[0].transmission=null;r.sampleForCar=()=>({grade:0,curvature:0,x:0,y:0,elevation:0,centerS:0});r.step(Race.FIXED_DT);}
  const nf=wheelForce(nc,speed),hf=wheelForce(hc,speed);
  assert(hf>0&&hf<nf*.6,`derating is observable at ${speed}m/s`);
  assert(Math.abs(hf/nf-factor)<.002,`force follows derating at ${speed}m/s, ratio=${hf/nf}, factor=${factor}`);
 }
});

test('depleted HEV retains engine capability while EV cannot propel with empty battery',()=>{
 const hev=make({vehicleId:'k5',initialSpeed:10,conditionOptions:{initialSoc:0}}),ev=make({vehicleId:'ioniq5',initialSpeed:10,conditionOptions:{initialSoc:0}});
 assert(Condition.limits(hev.cars[0],hev.cars[0].condition).powerFactor>0);
 for(const r of [hev,ev]){r._target=()=>100;r._refreshConditionProfiles=()=>{};r.sampleForCar=()=>({grade:0,curvature:0,x:0,y:0,elevation:0,centerS:0});r.step(Race.FIXED_DT);}
 assert(wheelForce(hev.cars[0],10)>0);assert(Math.abs(wheelForce(ev.cars[0],10))<1e-8);
 assert.equal(hev.cars[0].condition.energy.batteryDischargeJ,0);assert.equal(ev.cars[0].condition.energy.batteryDischargeJ,0);
});

test('actual drive and blended braking stay within the current axle reserve and friction hardware',()=>{
 for(const vehicleId of ['avante','supra','ioniq5'])for(const braking of [false,true]){
  const speed=20,grade=braking?-.04:.04,curvature=.012;
  const r=make({vehicleId,initialSpeed:speed,conditionOptions:{initialBrakeC:750}}),c=r.cars[0];
  const before=structuredClone(c.condition),beforeLimits=Condition.limits(c,before);
  r._refreshConditionProfiles=()=>{};r._target=()=>braking?1:100;
  r.sampleForCar=()=>({grade,curvature,x:0,y:0,elevation:0,centerS:0});r.step(Race.FIXED_DT);
  const after=c.condition;c.condition=before;
  const env=r._axleEnvelope(c,speed,grade,curvature,c.acceleration);c.condition=after;
  const driven=vehicleId==='avante'?env.front:vehicleId==='supra'?env.rear:env.front+env.rear;
  const wheel=wheelForce(c,speed,grade);
  if(!braking)assert(wheel<=driven+1e-5,`${vehicleId} actual drive ${wheel} > ${driven}`);
  else {
   assert(c.serviceBrakeForceN<=env.front+env.rear+1e-5,`${vehicleId} brake exceeds shared tire capacity`);
   assert(c.regenBrakeForceN<=driven+1e-5,`${vehicleId} regen exceeds driven-axle reserve`);
   assert(c.frictionBrakeForceN<=c.brakingHardware*beforeLimits.brakeFactor*c.massKg+1e-5,`${vehicleId} friction exceeds faded hardware`);
   assert(Math.abs(c.serviceBrakeForceN-c.regenBrakeForceN-c.frictionBrakeForceN)<1e-8);
  }
 }
});

test('fixed physics time gives identical condition and motion states across render batching',()=>{
 const a=make({vehicleId:'ioniq5'}),b=make({vehicleId:'ioniq5'});a.step(3);for(let i=0;i<180;i++)b.step(1/60);
 assert.deepEqual(a.cars[0].condition,b.cars[0].condition);
 assert.deepEqual([a.cars[0].speed,a.cars[0].distance],[b.cars[0].speed,b.cars[0].distance]);
});

test('lap state persists but fresh evaluation/session state resets independently without changing factory or cost',()=>{
 const e=entry('supra',{acceleration:2,grip:3}),factory=JSON.stringify(Tune.VARIANTS),cost=Tune.quote({vehicleId:e.vehicleId,variantId:e.variantId,budget:e.budget,levels:e.levels});
 const session=new Continuous({circuit:circle,entrants:[e],laps:3,seed:31415});
 assert.deepEqual(session.race.cars[0].condition,session.evaluationRace.cars[0].condition);
 assert.notEqual(session.race.cars[0].condition,session.evaluationRace.cars[0].condition);
 const c=session.race.cars[0];while(c.lap<1&&!c.dnf)session.race.step(1);
 assert.equal(c.lap,1);const wear=c.condition.tires.front.wear,elapsed=c.condition.elapsedSeconds;
 session.race.step(2);assert(c.condition.elapsedSeconds>elapsed);assert(c.condition.tires.front.wear>=wear);
 const fresh=session._newRace(0).cars[0];assert.equal(fresh.condition.elapsedSeconds,0);assert.equal(fresh.condition.tires.front.wear,0);
 assert.equal(JSON.stringify(Tune.VARIANTS),factory);assert.deepEqual(Tune.quote({vehicleId:e.vehicleId,variantId:e.variantId,budget:e.budget,levels:e.levels}),cost);
});

test('real Inje, Monza and Pocheon approaches remain feasible for both axle lateral contact budgets',()=>{
 for(const vehicleId of ['avante','supra','ioniq5'])for(const circuitId of ['inje','monza','pocheon']){
  const r=make({vehicleId,levels:{acceleration:3,grip:3},circuit:circuits.find(c=>c.id===circuitId),laps:1}),c=r.cars[0];let maximum=0,worst=null;
  while(!r.finished&&r.time<240){
   r.step(.1);const p=r.sampleForCar(c,c.distance),env=r._axleEnvelope(c,c.speed,p.grade,p.curvature,c.acceleration),f=Condition.limits(c,c.condition);
   for(const [axle,share] of [['front',c.frontWeightFraction],['rear',1-c.frontWeightFraction]]){
    const demand=c.massKg*c.speed*c.speed*Math.abs(p.curvature)*share,capacity=env[axle+'Load']*c.grip/G*f['grip'+(axle==='front'?'Front':'Rear')+'Factor'];
    const ratio=demand/Math.max(1e-9,capacity);if(ratio>maximum){maximum=ratio;worst={vehicleId,circuitId,axle,time:r.time,distance:c.distance,speed:c.speed,acceleration:c.acceleration,ratio};}
   }
  }
  assert(r.finished,vehicleId+' completes the audit lap');assert(maximum<=1.015,JSON.stringify(worst));
 }
});
