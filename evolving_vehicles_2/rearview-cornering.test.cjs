'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Circuits=require('./circuits.js'),Race=require('./race-engine.js'),Evolution=require('./tuning-evolution.js'),Pose=require('./driving-pose.js');
require('./circuit-road.js');
const Renderer=require('./circuit-renderer.js');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),DEG=180/Math.PI,DT=1/120;
const makeRenderer=race=>{const r=new Renderer({style:{},getContext:()=>({}),getBoundingClientRect:()=>({width:1100,height:690}),addEventListener(){},removeEventListener(){}});r.setRace(race);r.setView('follow-classic');return r;};
const population=()=>Evolution.createPopulation({vehicleId:'supra',count:8,seed:31415,budget:30});
// Same physical entrant: 418.2 PS / 1529 kg / cost 29. An independent race
// without a renderer checks that camera observation cannot alter its physics.
// These car-path windows enclose the user's centreline ranges after inversion
// through car.pathPoints.centerS. Centreline and per-car chainages are distinct.
// Use input-relative response checks: the actual C2 arc-distance physics changes
// corner speed, so absolute wall-time thresholds from the old physical trace
// would compare different inputs. Keep framing and camera/physics separation,
// then verify damping, no added spin and consistency across frame cadences.
const cases=[
 {id:'monza',centerRange:[592,704],range:[560,750]},
 {id:'yeongam',centerRange:[3687,3763],range:[3630,3820]},
 {id:'spa',centerRange:[6572,6712],range:[6460,6770]},
 {id:'pocheon',centerRange:[1036,1096],range:[990,1150]}
];
function motion(rows){
 const measure=key=>{
  const rate=rows.slice(1).map((x,i)=>({value:wrap(x[key]-rows[i][key])/(x.wall-rows[i].wall)*DEG,time:(x.wall+rows[i].wall)/2}));
  const acceleration=rate.slice(1).map((x,i)=>(x.value-rate[i].value)/(x.time-rate[i].time));
  return {rate:Math.max(...rate.map(x=>Math.abs(x.value))),acc:Math.max(...acceleration.map(Math.abs)),
   variation:rate.slice(1).reduce((sum,x,i)=>sum+Math.abs(x.value-rate[i].value),0)};
 };
 return {...measure('yaw'),input:measure('target'),relative:Math.max(...rows.map(x=>Math.abs(wrap(x.body-x.yaw))*DEG)),
  trackingError:Math.max(...rows.map(x=>Math.abs(wrap(x.target-x.yaw))*DEG))};
}
for(const c of cases)test('rear-view natural camera target stays smooth and framed through '+c.id,()=>{
 const race=new Race({circuit:Circuits.find(x=>x.id===c.id),entrants:population(),laps:1,surface:'dry'}),car=race.cars[0],r=makeRenderer(race),trace=[];
 for(const centerS of c.centerRange){
  const i=car.pathPoints.findIndex((p,i,all)=>p.centerS<=centerS&&all[i+1]?.centerS>=centerS),a=car.pathPoints[i],b=car.pathPoints[i+1];
  assert.ok(i>=0,'requested centreline coordinate has monotonic source mapping');
  const distance=(i+(centerS-a.centerS)/(b.centerS-a.centerS))*car.pathSpacing+car.firstLapLength-car.trackLength;
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
 const control=new Race({circuit:race.circuit,entrants:[car.entrant],laps:1,surface:'dry'});
 while(!control.finished)control.step(60);
 assert.ok(Math.abs(car.finishTime-control.cars[0].finishTime)<1e-9,'camera observation preserves the same physical standing-start finish time');
 const original=r._classicFollowGoal;let current=trace[0];r._classicFollowGoal=()=>current.goal;
 const references=new Map();
 for(const playback of [1,2])for(const frameMode of ['60','30','irregular']){
  current=trace[0];car.distance=current.s;car.speed=current.speed;r._classicFollowState=null;r.advanceCamera(0);
  let sim=current.time,wall=0,index=0,frame=0;const rows=[];
  let lastGoal=current.goal.heading,unwrappedGoal=lastGoal,minimumGoal=lastGoal,maximumGoal=lastGoal;
  while(sim<trace.at(-1).time){
   const dt=frameMode==='60'?1/60:frameMode==='30'?1/30:[1/120,1/40,1/60,1/24,1/60][frame%5];sim+=dt*playback;wall+=dt;
   while(index+1<trace.length&&trace[index+1].time<=sim+1e-9)index++;
   current=trace[index];car.distance=current.s;car.speed=current.speed;r.advanceCamera(dt);
   unwrappedGoal+=wrap(current.goal.heading-lastGoal);lastGoal=current.goal.heading;
   minimumGoal=Math.min(minimumGoal,unwrappedGoal);maximumGoal=Math.max(maximumGoal,unwrappedGoal);
   const unwrappedCamera=unwrappedGoal+wrap(r._classicFollowState.heading-current.goal.heading);
   assert.ok(unwrappedCamera>=minimumGoal-1e-7&&unwrappedCamera<=maximumGoal+1e-7,'no rotation outside the complete input prefix, including preroll');
   if(current.s>=c.range[0]&&current.s<=c.range[1]){
    rows.push({wall,yaw:r._classicFollowState.heading,body:current.body,target:current.goal.heading});
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
  assert.ok(m.acc<m.input.acc,context+' angular acceleration is damped relative to its moving input');
  assert.ok(m.rate<=m.input.rate*1.03,context+' no extra rotational-speed spike');
  assert.ok(m.variation<m.input.variation,context+' angular-rate variation is reduced rather than amplified');
  assert.ok(m.trackingError/m.input.rate<=2/(9.5*Math.sqrt(playback))+1/120,context+' input-proportional tracking delay stays bounded');
  assert.ok(m.relative<45,context+' the view remains behind the vehicle through the bend');
  if(frameMode==='60')references.set(playback,rows);
  else{
   const reference=references.get(playback);let i=0,maximum=0;
   for(const row of rows){
    if(row.wall<reference[0].wall||row.wall>reference.at(-1).wall)continue;
    while(i+1<reference.length-1&&reference[i+1].wall<row.wall)i++;
    const a=reference[i],b=reference[i+1],t=(row.wall-a.wall)/(b.wall-a.wall);
    maximum=Math.max(maximum,Math.abs(wrap(row.yaw-a.yaw-wrap(b.yaw-a.yaw)*t))*DEG);
   }
   assert.ok(maximum<.5,context+' frame-cadence response difference '+maximum);
  }
 }
 r._classicFollowGoal=original;
});

test('moving rear-view target keeps the analytic ramp response and its bounded tracking delay at every frame cadence',()=>{
 const race=new Race({circuit:Circuits.find(c=>c.id==='monza'),entrants:[population()[0]],laps:3}),car=race.cars[0],r=makeRenderer(race);
 const omega=9.5,rate=Math.PI/6;
 for(const cadence of [[1/60],[1/30],[1/120,1/40,1/60,1/24,1/60]]){
  let time=0,frame=0;car.speed=20;car.distance=0;
  r._classicFollowGoal=()=>({id:car.id,x:0,y:0,z:0,heading:rate*time,distance:car.distance});
  r._classicFollowState=null;r.advanceCamera(0);
  while(time<6){
   const dt=cadence[frame++%cadence.length];time+=dt;car.distance=car.speed*time;r.advanceCamera(dt);
   // Independent solution of h''+2ωh'+ω²h=ω²(rate*t), h(0)=h'(0)=0.
   const expected=rate*time-2*rate/omega+(2*rate/omega+rate*time)*Math.exp(-omega*time);
   assert.ok(Math.abs(wrap(r._classicFollowState.heading-expected))<1e-10,'moving-target response matches the analytic solution');
  }
  assert.ok(Math.abs((rate*time-r._classicFollowState.heading)/rate-2/omega)<1e-8,'steady tracking delay stays about 0.21 seconds');
 }
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
