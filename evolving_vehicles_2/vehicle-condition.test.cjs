'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('./vehicle-condition.js');
function car(kind='gasoline',levels={}){return {massKg:1600,powerPs:250,frontWeightFraction:.6,entrant:{levels},spec:{powertrainType:kind,electric:kind==='electric',powerPs:250,enginePowerPs:180,motorPowerKw:40,batteryKwh:kind==='electric'?60:undefined,massKg:1600,frontWeightFraction:.6,gripG:1,frontTire:'225/45R18',rearTire:'225/45R18'}};}
function advance(c,s,seconds,input,dt=.1){for(let t=0;t<seconds-1e-9;t+=dt)V.update(c,s,Math.min(dt,seconds-t),input);return s;}

test('factory specs are untouched and a fresh session has independent state',()=>{
 const c=car('electric',{grip:2}),before=JSON.stringify(c),a=V.create(c),b=V.create(c);
 advance(c,a,20,{speedMps:30,drivePowerW:100000});assert.equal(JSON.stringify(c),before);assert.notDeepEqual(a,b);assert.equal(b.elapsedSeconds,0);assert.equal(b.soc,.8);
});

test('friction work heats and wears brakes; natural coasting and regen do not',()=>{
 const c=car('electric'),coast=V.create(c),regen=V.create(c),friction=V.create(c);
 advance(c,coast,60,{speedMps:25});advance(c,regen,60,{speedMps:25,regenPowerW:50000});advance(c,friction,60,{speedMps:25,frictionBrakePowerW:50000});
 assert.equal(coast.energy.frictionBrakeJ,0);assert.equal(regen.energy.frictionBrakeJ,0);assert.equal(coast.brakes.front.temperatureC,regen.brakes.front.temperatureC);assert.equal(regen.brakes.front.wear,0);
 assert(friction.brakes.front.temperatureC>regen.brakes.front.temperatureC+100);assert(friction.brakes.front.wear>0);assert(Math.abs(friction.energy.frictionBrakeJ-3e6)<1e-6);
});

test('brake tuning improves heat capacity/cooling and durability under equal work',()=>{
 const base=car(),tuned=car('gasoline',{brakes:4}),a=V.create(base),b=V.create(tuned);
 const input={speedMps:20,frictionBrakePowerW:160000};advance(base,a,100,input);advance(tuned,b,100,input);
 assert(a.brakes.front.temperatureC>b.brakes.front.temperatureC);assert(a.brakes.front.wear>b.brakes.front.wear);assert(V.limits(base,a).brakeFactor<V.limits(tuned,b).brakeFactor);
 const wear=a.brakes.front.wear,hotFactor=V.limits(base,a).brakeFactor;advance(base,a,240,{speedMps:25});assert(V.limits(base,a).brakeFactor>hotFactor);assert.equal(a.brakes.front.wear,wear);
});

test('tyre wear follows wheel force/load and grip durability, independent of propulsion label',()=>{
 const aCar=car(),bCar=car('electric'),tuned=car('gasoline',{grip:4});const a=V.create(aCar),b=V.create(bCar),c=V.create(tuned),idle=V.create(aCar);
 const input={speedMps:25,lateralAcceleration:6,frontNormalLoad:9000,rearNormalLoad:6700,frontLongitudinalForceN:-3000,rearLongitudinalForceN:-1600};
 advance(aCar,a,180,input);advance(bCar,b,180,input);advance(tuned,c,180,input);advance(aCar,idle,180,{speedMps:25});
 assert.deepEqual(a.tires,b.tires);assert(a.tires.front.wear>idle.tires.front.wear);assert(a.tires.front.wear>c.tires.front.wear);assert(a.tires.front.temperatureC>idle.tires.front.temperatureC);
 const wear=a.tires.front.wear;advance(aCar,a,180,{speedMps:20});assert.equal(a.tires.front.wear,wear);
});

test('tyre heat fades contact grip and cooling recovers heat loss but never tread',()=>{
 const c=car(),s=V.create(c);s.tires.front.temperatureC=135;s.tires.front.wear=.3;
 const hot=V.limits(c,s).gripFrontFactor;advance(c,s,300,{speedMps:25});const recovered=V.limits(c,s).gripFrontFactor;
 assert(recovered>hot);assert(recovered<1);assert.equal(s.tires.front.wear,.3);
});

test('EV work consumes stored energy and regen round trip cannot manufacture energy',()=>{
 const c=car('electric'),s=V.create(c),initial=s.soc;
 advance(c,s,10,{speedMps:30,drivePowerW:50000});advance(c,s,10,{speedMps:30,regenPowerW:50000});
 assert(s.soc<initial);assert.equal(s.energy.driveJ,500000);assert.equal(s.energy.regenMechanicalJ,500000);
 const storedChange=(s.soc-initial)*s.batteryCapacityKwh*3.6e6;
 assert(Math.abs(storedChange-(s.energy.batteryChargeJ-s.energy.batteryDischargeJ))<1e-6);
 assert(s.energy.batteryChargeJ<s.energy.regenMechanicalJ);assert(s.energy.batteryDischargeJ>s.energy.driveJ);
});

test('full, empty, cold and hot batteries constrain regen/drive within physical bounds',()=>{
 const c=car('electric');
 const full=V.create(c,{initialSoc:1}),empty=V.create(c,{initialSoc:0}),cold=V.create(c,{initialBatteryC:-10}),hot=V.create(c,{initialBatteryC:65}),normal=V.create(c);
 assert.equal(V.limits(c,full).regenPowerW,0);assert.equal(V.limits(c,empty).powerFactor,0);assert.equal(V.limits(c,empty).batteryAssistPowerW,0);
 assert(V.limits(c,cold).regenPowerW<V.limits(c,normal).regenPowerW);assert(V.limits(c,hot).powerFactor<V.limits(c,normal).powerFactor);
 advance(c,full,1,{regenPowerW:1000000});assert.equal(full.soc,1);assert.equal(full.energy.batteryChargeJ,0);
 advance(c,empty,1,{drivePowerW:1000000});assert.equal(empty.soc,0);assert.equal(empty.energy.batteryDischargeJ,0);
});

test('actual sustained EV load heats drivetrain and cooling recovers reduced output',()=>{
 const c=car('electric'),loaded=V.create(c),coast=V.create(c);advance(c,loaded,600,{speedMps:10,drivePowerW:160000});advance(c,coast,600,{speedMps:10});
 assert(loaded.motorTemperatureC>coast.motorTemperatureC);assert(loaded.batteryTemperatureC>coast.batteryTemperatureC);assert(V.limits(c,loaded).powerFactor<V.limits(c,coast).powerFactor);
 const hot=V.limits(c,loaded).powerFactor;advance(c,loaded,1200,{speedMps:25});assert(V.limits(c,loaded).powerFactor>hot);
});

test('HEV depleted battery keeps combustion capability; capacities remain model estimates',()=>{
 const c=car('hybrid'),normal=V.create(c),empty=V.create(c,{initialSoc:0});
 assert.equal(normal.batteryCapacityKwh,V.MODEL.estimatedHybridCapacityKwh);assert(V.limits(c,empty).powerFactor>0);assert(V.limits(c,empty).powerFactor<V.limits(c,normal).powerFactor);assert.equal(V.limits(c,empty).batteryAssistPowerW,0);
 advance(c,empty,10,{speedMps:20,regenPowerW:10000});assert(empty.soc>0);assert(empty.energy.batteryChargeJ>0);
});

test('ICE heat tracks actual work rather than installed acceleration level',()=>{
 const c=car(),tuned=car('gasoline',{acceleration:6}),a=V.create(c),b=V.create(tuned);
 advance(c,a,300,{speedMps:15,drivePowerW:120000});advance(tuned,b,300,{speedMps:15,drivePowerW:120000});assert.equal(a.engineTemperatureC,b.engineTemperatureC);
 const hot=V.create(c,{initialEngineC:140});assert(V.limits(c,hot).powerFactor<1);advance(c,hot,500,{speedMps:25});assert(V.limits(c,hot).powerFactor>.95);
});

test('cooling stays consistent under different time batching; invalid dt is rejected',()=>{
 const c=car(),a=V.create(c),b=V.create(c);V.update(c,a,10,{speedMps:25});advance(c,b,10,{speedMps:25});
 for(const ax of ['front','rear'])assert(Math.abs(a.brakes[ax].temperatureC-b.brakes[ax].temperatureC)<1e-5);
 assert(Math.abs(a.engineTemperatureC-b.engineTemperatureC)<1e-9);assert.throws(()=>V.update(c,a,-1),RangeError);assert.throws(()=>V.update(c,a,NaN),RangeError);
});

test('very hot brakes shed a greater fraction of excess heat even without airflow',()=>{
 const c=car(),warm=V.create(c,{initialBrakeC:450}),hot=V.create(c,{initialBrakeC:850});
 advance(c,warm,30,{speedMps:0});advance(c,hot,30,{speedMps:0});
 for(const axle of ['front','rear']){
  const warmLoss=(450-warm.brakes[axle].temperatureC)/(450-warm.ambientC);
  const hotLoss=(850-hot.brakes[axle].temperatureC)/(850-hot.ambientC);
  assert(hotLoss>warmLoss*1.25,'high-temperature heat loss must grow faster than a fixed linear cooling coefficient');
 }
 assert.equal(hot.energy.frictionBrakeJ,0);assert.equal(hot.brakes.front.wear,0);
});

test('hot brake cooling is stable for long updates and preserves energy and wear',()=>{
 const c=car(),large=V.create(c,{initialBrakeC:900}),small=V.create(c,{initialBrakeC:900});
 V.update(c,large,60,{speedMps:30});advance(c,small,60,{speedMps:30},1/120);
 for(const axle of ['front','rear'])assert(Math.abs(large.brakes[axle].temperatureC-small.brakes[axle].temperatureC)<.01);
 const wear=large.brakes.front.wear;V.update(c,large,3600,{speedMps:30});
 for(const axle of ['front','rear']){
  assert(Number.isFinite(large.brakes[axle].temperatureC));
  assert(large.brakes[axle].temperatureC>=large.ambientC);
  assert(large.brakes[axle].temperatureC<large.ambientC+.01);
 }
 assert.equal(large.energy.frictionBrakeJ,0);assert.equal(large.brakes.front.wear,wear);
});

test('brake heating and radiation agree across thermal step sizes without hiding input work',()=>{
 const c=car();
 for(const frictionBrakePowerW of [150000,500000]){
  const large=V.create(c,{initialBrakeC:850}),small=V.create(c,{initialBrakeC:850});
  const input={speedMps:30,frictionBrakePowerW};
  V.update(c,large,60,input);advance(c,small,60,input,1/120);
  for(const axle of ['front','rear'])assert(Math.abs(large.brakes[axle].temperatureC-small.brakes[axle].temperatureC)<.01);
  assert.equal(large.energy.frictionBrakeJ,frictionBrakePowerW*60);
  assert(large.brakes.front.temperatureC>850,'sufficient ongoing braking must still heat the rotor');
 }
});

test('snapshot is isolated and contains explanatory limits and conserved work totals',()=>{
 const c=car('electric'),s=V.create(c,{initialSoc:.05,initialBrakeC:800});const snap=V.snapshot(s);
 assert.equal(snap.model,'estimated-v2');assert(snap.limitations.length>=2);assert(snap.brakes.factor<1);snap.tires.front.wear=1;assert.equal(s.tires.front.wear,0);assert.equal(V.snapshot(null),null);
});

test('an unloaded axle does not silently recover static load or accumulate contact wear',()=>{
 const c=car(),s=V.create(c);advance(c,s,60,{speedMps:25,lateralAcceleration:8,frontNormalLoad:0,rearNormalLoad:1600*9.81,frontLongitudinalForceN:5000,rearLongitudinalForceN:3000});assert.equal(s.tires.front.wear,0);assert(s.tires.rear.wear>0);
});

test('finish/stop clears only instantaneous power and preserves thermal and work history',()=>{
 const c=car('electric'),s=V.create(c);V.update(c,s,1,{speedMps:20,drivePowerW:50000});const energy={...s.energy},temperature=s.motorTemperatureC;V.stop(s);assert(Object.values(s.power).every(x=>x===0));assert.deepEqual(s.energy,energy);assert.equal(s.motorTemperatureC,temperature);
});

test('hybrid tuning preserves factory engine/electric share instead of inventing free motor capacity',()=>{
 const c=car('hybrid'),tuned=car('hybrid',{acceleration:3});tuned.entrant.factorySpec={...c.spec};tuned.powerPs=tuned.spec.powerPs=c.powerPs*1.3;
 const a=V.create(c),b=V.create(tuned);assert.equal(a.engineShare,b.engineShare);assert(Math.abs(b.motorRatedW/a.motorRatedW-1.3)<1e-12);a.soc=b.soc=0;assert.equal(V.limits(c,a).powerFactor,V.limits(tuned,b).powerFactor);
});

test('HEV cruise charging consumes engine headroom, stores less energy than generated and adds heat',()=>{
 const c=car('hybrid'),charge=V.create(c,{initialSoc:.2}),noCharge=V.create(c,{initialSoc:.8});const initial=charge.soc;
 advance(c,charge,60,{speedMps:20,drivePowerW:15000});advance(c,noCharge,60,{speedMps:20,drivePowerW:15000});
 assert(charge.soc>initial);assert(charge.energy.engineGeneratorJ>0);assert(charge.energy.engineChargeJ<charge.energy.engineGeneratorJ);assert(charge.energy.engineMechanicalJ>=charge.energy.engineGeneratorJ+charge.energy.driveJ-1e-6);assert(charge.engineTemperatureC>noCharge.engineTemperatureC);
 assert.equal(charge.energy.batteryDischargeJ,0,'charging mode does not discharge traction battery at the same time');
 const storedChange=(charge.soc-initial)*charge.batteryCapacityKwh*3.6e6;assert(Math.abs(storedChange-charge.energy.engineChargeJ)<1e-6);assert.equal(charge.energy.regenMechanicalJ,0,'engine charging is not mislabelled as recovered braking');
});

test('HEV generation stops at high wheel load, during regen/braking and at target SOC',()=>{
 const c=car('hybrid');for(const [options,input] of [[{initialSoc:.2},{drivePowerW:150000}],[{initialSoc:.2},{regenPowerW:10000}],[{initialSoc:.2},{frictionBrakePowerW:10000}],[{initialSoc:.6},{drivePowerW:10000}]]){
 const s=V.create(c,options);advance(c,s,1,{speedMps:20,...input});assert.equal(s.energy.engineGeneratorJ,0);
 }
 const s=V.create(c,{initialSoc:.599});advance(c,s,1200,{speedMps:20,drivePowerW:10000});assert(s.soc<=V.MODEL.hybridChargeTargetSoc+1e-9);
});

test('factory dual tyres share axle load and heat without a vehicle-label penalty',()=>{
 const two=car(),four=car();four.spec.tireFitment={rear:{tiresPerAxle:4}};
 const a=V.create(two),b=V.create(four),input={speedMps:25,lateralAcceleration:5,rearNormalLoad:7000,rearLongitudinalForceN:5000};advance(two,a,120,input);advance(four,b,120,input);
 assert(b.tires.rear.temperatureC<a.tires.rear.temperatureC);assert(b.tires.rear.wear<a.tires.rear.wear);assert.deepEqual(a.tires.front,b.tires.front);
});

test('friction heat follows actual axle allocation even when one axle receives no friction braking',()=>{
 const c=car(),front=V.create(c),rear=V.create(c),coast=V.create(c);advance(c,front,10,{speedMps:20,frictionBrakePowerW:50000,brakeFrontFraction:1});advance(c,rear,10,{speedMps:20,frictionBrakePowerW:50000,brakeFrontFraction:0});advance(c,coast,10,{speedMps:20});
 assert.equal(front.brakes.rear.temperatureC,coast.brakes.rear.temperatureC);assert.equal(rear.brakes.front.temperatureC,coast.brakes.front.temperatureC);assert.equal(front.brakes.rear.wear,0);assert.equal(rear.brakes.front.wear,0);assert(front.brakes.front.wear>0);assert(rear.brakes.rear.wear>0);
});
