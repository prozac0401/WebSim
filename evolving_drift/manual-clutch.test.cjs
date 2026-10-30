'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./manual-clutch.js'),P=require('./physics.js'),Catalog=require('./catalog.js');
const near=(a,b,t=1e-7)=>assert(Math.abs(a-b)<=t,`${a} != ${b}`);
function track(mu=1){return {length:5000,width:200,judgedStart:100,judgedEnd:4900,obstacles:[],sample:s=>({x:s,y:0,s,heading:0,curvature:0}),project:(x,y)=>({x,y:0,s:x,error:y,distance:Math.abs(y),heading:0}),surface:()=>({z:0,gradientX:0,gradientY:0,normalZ:1,muScale:mu})};}
function rolling(v,speed=18,gear=2){const a=P.initialState(v,track()),p=v.physics,ratio=p.gearRatios[gear-1]*(p.finalDriveRatios?.[gear-1]??p.finalDrive);a.vx=a.speed=speed;a.wheelOmega.fill(speed/p.tireRadius);a.gear=gear;a.engineOmega=speed/p.tireRadius*ratio;a.rpm=a.engineOmega*30/Math.PI;return a;}
const input=(clutch=0)=>({steer:0,throttle:1,brake:0,gearHold:2,clutch});

test('isolated shafts exchange angular momentum without generating rotational energy',()=>{
  for(const [engineOmega,shaftOmega,capacityNm] of [[400,40,300],[100,80,300],[0,-15,300],[200,40,300],[400,40,0],[400,40,25]]){
    const J=.3,I=3,ratio=5,dt=1/120,initial=.5*J*engineOmega**2+.5*I*shaftOmega**2;
    const r=C.solve({engineOmega,engineTorque:0,engineInertiaKgM2:J,capacityNm,gearRatio:ratio,dt,wheelResponse:t=>({shaftOmega:shaftOmega+dt*t*ratio/I})});
    assert(Math.abs(r.torque)<=capacityNm+1e-9);assert(r.engineOmega>=0);
    const final=.5*J*r.engineOmega**2+.5*I*r.wheels.shaftOmega**2;assert(final<=initial+1e-7,`passive clutch added ${final-initial} J`);
    near(J*(r.engineOmega-engineOmega)+I*(r.wheels.shaftOmega-shaftOmega)/ratio,0);
    if(capacityNm===0){near(r.torque,0);near(r.engineOmega,engineOmega);near(r.wheels.shaftOmega,shaftOmega);}
    else assert(r.torque*r.slip>=-1e-5,'friction cannot sustain torque against its final slip direction');
  }
});

test('gear losses dissipate energy in both driving and back-driving directions',()=>{
  for(const engineOmega of [100,400]){
    const J=.3,I=3,ratio=5,shaftOmega=40,dt=1/120,energy=.5*J*engineOmega**2+.5*I*shaftOmega**2;
    const r=C.solve({engineOmega,engineTorque:0,engineInertiaKgM2:J,capacityNm:300,gearRatio:ratio,dt,wheelResponse:t=>({shaftOmega:shaftOmega+dt*C.wheelTorque(t,ratio,.83)/I})});
    assert(.5*J*r.engineOmega**2+.5*I*r.wheels.shaftOmega**2<energy);
  }
  near(C.wheelTorque(100,5,.8),400);near(C.wheelTorque(-100,5,.8),-625);
});

test('all four MT variants free-rev with an open clutch and transmit zero wheel drive torque',()=>{
  const manual=Catalog.list().filter(C.isManual);assert.equal(manual.length,4);
  for(const v of manual){
    const a=rolling(v,12),rpm=a.rpm,oldOmega=a.wheelOmega[2],t=track();
    for(let i=0;i<30;i++){P.step(v,t,a,input(1));near(a.clutchTorque,0);near(a.rearTorque,0);assert.equal(a.gear,2);}
    assert(a.rpm>rpm+200,`${v.id} engine did not free-rev`);assert(a.wheelOmega[2]<oldOmega,`${v.id} powered the disconnected axle`);assert(a.engineOmega>0);
    for(let i=0;i<240;i++){P.step(v,t,a,input(1));assert(Math.max(0,a.torque)*a.engineOmega<=v.physics.peakPowerW+1e-6,`${v.id} free-rev engine power ceiling`);}
    assert(a.rpm<=v.physics.maxRPM+1e-6,`${v.id} free-rev limiter`);
  }
});

test('releasing a kick transfers stored engine rotation into actual rear-wheel slip',()=>{
  const v=Catalog.get('gr86-2.4-rz-mt'),t=track(),kick=rolling(v,18),held=rolling(v,18);
  let peakKick=0,peakHeld=0,peakTorque=0;
  for(let i=0;i<84;i++){
    const pedal=i<30?1:i<38?1-(i-30)/8:0;
    P.step(v,t,kick,input(pedal));P.step(v,t,held,input(0));
    if(i>=30){peakKick=Math.max(peakKick,...kick.wheelSlip.slice(2));peakHeld=Math.max(peakHeld,...held.wheelSlip.slice(2));peakTorque=Math.max(peakTorque,kick.clutchTorque);}
    assert(Math.abs(kick.clutchTorque)<=C.parameters(v).clutchCapacityNm+1e-7);
    assert(kick.clutchSlipEnergyJ>=0);
  }
  assert(peakKick>peakHeld+.01,`kick ${peakKick}, held ${peakHeld}`);
  assert(peakTorque>v.physics.peakTorque,'stored flywheel energy should produce a bounded transient above engine torque');
  assert(kick.clutchSlipEnergyJ>0);assert.equal(kick.status,'running');assert.equal(held.status,'running');
});

test('manual gear changes disconnect and reconnect without resetting engine RPM',()=>{
  const v=Catalog.get('bmw-m2-3.0t-mt'),a=rolling(v,20),t=track(),before=a.engineOmega;
  P.step(v,t,a,{...input(0),gearHold:3});
  assert.equal(a.gear,3);assert(a.shiftTimer>.4);assert.equal(a.clutchEngagement,0);near(a.rearTorque,0);
  assert(Math.abs(a.engineOmega-before)<10,'shift cannot snap engine speed to the new ratio');
  for(let i=0;i<70;i++)P.step(v,t,a,{...input(0),gearHold:3});
  assert.equal(a.shiftTimer,0);assert.equal(a.clutchEngagement,1);assert(a.rearTorque>0);
});

test('launch assistance permits ordinary stock manual starts and remains finite through stopping and reverse wheel motion',()=>{
  for(const id of ['porter-lpg-mt','porter-diesel-mt','bmw-m2-3.0t-mt','gr86-2.4-rz-mt']){
    const v=Catalog.get(id),t=track(),a=P.initialState(v,t);
    for(let i=0;i<360;i++)P.step(v,t,a,{...input(0),gearHold:0,throttle:.6});
    assert(a.speed>2,`${id} failed to launch: ${a.speed}`);assert.equal(a.status,'running');
    a.vx=-2;a.speed=2;a.wheelOmega.fill(-2/v.physics.tireRadius);
    for(let i=0;i<120;i++)P.step(v,t,a,{...input(i<30?1:0),gearHold:1,throttle:.2,brake:.5});
    for(const key of ['engineOmega','clutchTorque','clutchSlipRPM','clutchSlipEnergyJ','vx','vy','r'])assert(Number.isFinite(a[key]),`${id}/${key}`);
    assert(a.engineOmega>=0);assert.equal(a.status,'running');
  }
});

test('automatic, DCT and EV force trajectories ignore clutch input exactly',()=>{
  for(const id of ['supra-3.0t-rz','bmw-m2-3.0t-dct','ioniq5-standard','porter-lpg-at']){
    const v=Catalog.get(id),t=track(),a=P.initialState(v,t),b=P.initialState(v,t);assert.equal(C.isManual(v),false);
    for(let i=0;i<120;i++){P.step(v,t,a,{...input(0),gearHold:0});P.step(v,t,b,{...input(1),gearHold:0});}
    assert.deepEqual(P.frame(a),P.frame(b));assert.equal(a.clutchPedal,0);
  }
});

test('clutch state is independent in recorded frames and can resume deterministically',()=>{
  const v=Catalog.get('gr86-2.4-rz-mt'),t=track(),a=rolling(v,18);
  for(let i=0;i<30;i++)P.step(v,t,a,input(1));
  const b={...P.frame(a),vehicle:v};
  for(let i=0;i<80;i++){const cmd=input(Math.max(0,1-i/12));P.step(v,t,a,cmd);P.step(v,t,b,cmd);}
  assert.deepEqual(P.frame(a),P.frame(b));
});
