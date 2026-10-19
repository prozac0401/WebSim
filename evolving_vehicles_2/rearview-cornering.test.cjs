'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Circuits=require('./circuits.js'),Race=require('./race-engine.js'),Evolution=require('./tuning-evolution.js'),Pose=require('./driving-pose.js');
require('./circuit-road.js');
const Renderer=require('./circuit-renderer.js');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),DEG=180/Math.PI,DT=1/120;
const makeRenderer=race=>{const r=new Renderer({style:{},getContext:()=>({}),getBoundingClientRect:()=>({width:1100,height:690}),addEventListener(){},removeEventListener(){}});r.setRace(race);r.setView('follow-classic');return r;};
const population=()=>Evolution.createPopulation({vehicleId:'supra',count:8,seed:31415,budget:30});
// Fixed baseline d47b918, same physical entrant: 418.2 PS / 1529 kg / cost 29.
// These car-path windows enclose the user's centreline ranges after inversion
// through car.pathPoints.centerS. Centreline and per-car chainages are distinct.
// Limits jointly constrain angular acceleration, rate and car/camera separation;
// a slower camera that only delays the corner cannot pass by acceleration alone.
const cases=[
 {id:'monza',centerRange:[592,704],range:[560,750],finish:133.82860371638503,acc:71,rate:34,relative:11.5},
 {id:'yeongam',centerRange:[3687,3763],range:[3630,3820],finish:153.43506750529755,acc:58,rate:54,relative:10.5},
 {id:'spa',centerRange:[6572,6712],range:[6460,6770],finish:175.77117046301797,acc:56,rate:44,relative:9},
 {id:'pocheon',centerRange:[1036,1096],range:[990,1150],finish:105.93045827127708,acc:18,rate:28,relative:8}
];
function motion(rows){
 const rate=rows.slice(1).map((x,i)=>({value:wrap(x.yaw-rows[i].yaw)/(x.wall-rows[i].wall)*DEG,time:(x.wall+rows[i].wall)/2}));
 const acceleration=rate.slice(1).map((x,i)=>(x.value-rate[i].value)/(x.time-rate[i].time));
 return {rate:Math.max(...rate.map(x=>Math.abs(x.value))),acc:Math.max(...acceleration.map(Math.abs)),relative:Math.max(...rows.map(x=>Math.abs(wrap(x.body-x.yaw))*DEG))};
}
for(const c of cases)test('rear-view natural camera target stays smooth and framed through '+c.id,()=>{
 const race=new Race({circuit:Circuits.find(x=>x.id===c.id),entrants:population(),laps:1,surface:'dry'}),car=race.cars[0],r=makeRenderer(race),trace=[];
 for(const centerS of c.centerRange){
  const i=car.pathPoints.findIndex((p,i,all)=>p.centerS<=centerS&&all[i+1]?.centerS>=centerS),a=car.pathPoints[i],b=car.pathPoints[i+1];
  assert.ok(i>=0,'requested centreline coordinate has monotonic source mapping');
  const distance=(i+(centerS-a.centerS)/(b.centerS-a.centerS))*car.pathSpacing;
  assert.ok(distance>=c.range[0]&&distance<=c.range[1],'measurement window includes mapped requested centreline point');
 }
 assert.equal(car.powerPs,418.2);assert.equal(car.massKg,1529);assert.equal(car.entrant.cost,29);
 while(!car.finished){
  if(car.distance>=c.range[0]-200&&car.distance<=c.range[1]+5){
   const state=[race.time,race._ticks,car.distance,car.speed,JSON.stringify(car.powertrain)],p=Pose.sampleCar(race,car),display=r._displayPose(p,car),goal=r._classicFollowGoal(car);
   assert.deepEqual([race.time,race._ticks,car.distance,car.speed,JSON.stringify(car.powertrain)],state,'camera cannot mutate the physical race');
   assert.equal(goal.x,p.x);assert.equal(goal.y,p.y);
   trace.push({time:race.time,s:car.distance,speed:car.speed,body:p.angle,display,goal});
  }
  race.step(DT);
 }
 assert.ok(Math.abs(car.finishTime-c.finish)<1e-9,'unchanged standing-start physical finish time');
 const original=r._classicFollowGoal;let current=trace[0];r._classicFollowGoal=()=>current.goal;
 for(const playback of [1,2])for(const frameMode of ['60','30','irregular']){
  current=trace[0];car.distance=current.s;car.speed=current.speed;r._classicFollowState=null;r.advanceCamera(0);
  let sim=current.time,wall=0,index=0,frame=0;const rows=[];
  while(sim<trace.at(-1).time){
   const dt=frameMode==='60'?1/60:frameMode==='30'?1/30:[1/120,1/40,1/60,1/24,1/60][frame%5];sim+=dt*playback;wall+=dt;
   while(index+1<trace.length&&trace[index+1].time<=sim+1e-9)index++;
   current=trace[index];car.distance=current.s;car.speed=current.speed;r.advanceCamera(dt);
   if(current.s>=c.range[0]&&current.s<=c.range[1]){
    rows.push({wall,yaw:r._classicFollowState.heading,body:current.body});
    if(frame%12===0)for(const [width,height]of [[1100,690],[390,844],[346,346]]){
     r.width=width;r.height=height;const cam=r._camera(car),p=current.display,z=p.elevation??p.z,grade=p.grade||0,cg=1/Math.sqrt(1+grade*grade),sg=grade*cg;
     for(const x of [-1,1])for(const y of [-1,1])for(const h of [0,1]){
      const lx=x*car.spec.lengthMm/2000,ly=y*car.spec.widthMm/2000,lz=h*car.spec.heightMm/1000,rx=lx*cg-lz*sg;
      const screen=r._project({x:p.x+Math.cos(p.angle)*rx-Math.sin(p.angle)*ly,y:p.y+Math.sin(p.angle)*rx+Math.cos(p.angle)*ly,z:z+lx*sg+lz*cg},cam);
      assert.ok(screen&&screen.x>10&&screen.x<width-10&&screen.y>10&&screen.y<height-10,'whole body stays inside viewport with 10px margin');
     }
    }
    r.width=1100;r.height=690;
   }frame++;
  }
  const m=motion(rows),context=c.id+' '+playback+'x '+frameMode;
  assert.ok(m.acc<c.acc*playback**2,context+' angular acceleration '+m.acc);
  assert.ok(m.rate<c.rate*playback,context+' angular speed '+m.rate);
  assert.ok(m.relative<c.relative+(playback-1)*4,context+' relative angle '+m.relative);
 }
 r._classicFollowGoal=original;
});

test('all eleven classic camera targets remain periodic at a flying timing seam and reset at a standing generation',()=>{
 for(const circuit of Circuits){
  const race=new Race({circuit,entrants:population(),laps:3,surface:'dry'}),car=race.cars[0],r=makeRenderer(race);car.standingStartDistance=null;car.speed=30;
  const goals=[];for(const d of [car.trackLength-.1,car.trackLength,car.trackLength+.1]){car.distance=d;goals.push(r._classicFollowGoal(car));}
  assert.ok(Math.abs(wrap(goals[2].heading-goals[0].heading))<.05,circuit.id+' periodic heading');
  car.distance=car.trackLength-.1;r.advanceCamera(0,{snap:true});const before=r._classicFollowState.heading;car.distance+=.2;r.advanceCamera(.2/30);assert.ok(Math.abs(wrap(r._classicFollowState.heading-before))<.05,circuit.id+' no seam snap');
  const next=new Race({circuit,entrants:population(),laps:3,surface:'dry'});r.setRace(next,{preserveCamera:true});r.advanceCamera(0,{snap:true});const fresh=r._classicFollowGoal(next.cars[0]);
  assert.equal(next.cars[0].speed,0);assert.equal(next.cars[0].distance,0);assert.equal(r._classicFollowState.headingVelocity,0);assert.ok(Math.abs(wrap(r._classicFollowState.heading-fresh.heading))<1e-12,'next standing generation deliberately resets to its launch pose');
 }
});
