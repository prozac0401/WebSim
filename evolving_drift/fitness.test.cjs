'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Fitness=require('./fitness.js');
const vehicle={physics:{massKg:1500}};
const track={length:250,judgedStart:20,judgedEnd:120,sample:s=>({curvature:s>=20&&s<=60?.02:0})};
function replay({brake=0,force=2500,torque=2500,accelerate=1,valid=true}={}){
 const frames=[];let s=0,x=0,y=0,heading=0,time=0,speed=15;
 while(s<240){const beta=s>=35&&s<=180?-20*Math.PI/180:0,active=s>=65&&s<=165;
  frames.push({time,s,x,y,vx:speed*Math.cos(heading),vy:speed*Math.sin(heading),yaw:heading-beta,speed,beta,throttle:.6,brake,rearTorque:torque,wheelSlip:[0,0,.2,.2],wheelForces:[{},{},{fx:force/2},{fx:force/2}]});
  const dt=.05;speed+=active?accelerate*dt:0;const distance=speed*dt;s+=distance;heading+=track.sample(s).curvature*distance;x+=Math.cos(heading)*distance;y+=Math.sin(heading)*distance;time+=dt;
 }
 return {valid,status:valid?'finished':'offtrack',score:20,frames};
}
test('powered exit requires actual tyre propulsion and a continuous accelerating corner-connected run',()=>{
 const raw=replay(),ranked=Fitness.rank(vehicle,track,raw);
 assert.equal(ranked.power.success,true);assert.ok(ranked.power.bestExit.duration>=2);assert.ok(ranked.power.bestExit.distance>=30);assert.ok(ranked.power.bestExit.speedGain>0);assert.ok(ranked.power.bestExit.meanRearPowerW>20000);assert.equal(raw.score,20,'ranking does not mutate the physical result');assert.equal(ranked.styleScore,20);assert.ok(ranked.score>=60);
 for(const patch of [{brake:.2},{force:0},{force:-2500},{torque:0},{accelerate:-.5},{valid:false}])assert.equal(Fitness.rank(vehicle,track,replay(patch)).power.success,false,JSON.stringify(patch));
});
test('a high-angle braking slide cannot outrank a completed powered-exit objective',()=>{
 const complete=Fitness.rank(vehicle,track,replay()),braking=replay({brake:.2});braking.score=100;
 const incomplete=Fitness.rank(vehicle,track,braking);assert.equal(incomplete.power.success,false);assert.ok(incomplete.score<=59);assert.ok(complete.score>incomplete.score);
 const inconsistent=replay();inconsistent.status='offtrack';const rejected=Fitness.rank(vehicle,track,inconsistent);assert.equal(rejected.score,0);assert.equal(rejected.power.success,false);
 assert.deepEqual(Fitness.rank(vehicle,track,complete),complete,'ranking is idempotent');
});
test('missing force data and a straight-cut trajectory cannot masquerade as powered corner exit',()=>{
 const missing=replay();for(const f of missing.frames)delete f.wheelForces;assert.equal(Fitness.rank(vehicle,track,missing).power.success,false);
 const cut=replay();for(const f of cut.frames){f.vx=f.speed;f.vy=0;f.y=0;f.x=f.s;f.yaw=-f.beta;}assert.equal(Fitness.rank(vehicle,track,cut).power.success,false);
});
test('physical travelled distance is separate from centreline progress',()=>{
 const short=replay();for(const f of short.frames){f.x*=.2;f.y*=.2;}
 const m=Fitness.rank(vehicle,track,short).power;assert.equal(m.success,false);assert.ok(!m.bestExit||m.bestExit.distance<30);
});
test('a telemetry gap breaks drift continuity instead of joining short powered runs',()=>{
 const raw=replay(),zone=Fitness.exitZones(track)[0],inside=raw.frames.filter(f=>f.s>=zone.exit&&f.s<=zone.end);
 const origin=inside[0].time;
 raw.frames=raw.frames.filter(f=>f.time<origin+1||f.time>origin+2.4&&f.time<origin+3.4||f.s>zone.end);
 assert.equal(Fitness.rank(vehicle,track,raw).power.success,false);
});

test('stretching the same completed exit over more time cannot earn a higher score',()=>{
 const slow=replay({accelerate:0});
 // Keep the exact path, angle, pedals and tyre forces; only compare the same
 // constant-speed trajectory at two time scales. Both meet the time minimum.
 const fast={...slow,frames:slow.frames.map(f=>({...f,time:f.time/2,speed:f.speed*2,vx:f.vx*2,vy:f.vy*2}))};
 const slower=Fitness.rank(vehicle,track,slow).power,faster=Fitness.rank(vehicle,track,fast).power;
 assert.equal(slower.success,true);assert.equal(faster.success,true);
 assert.equal(slower.bestExit.distance,faster.bestExit.distance);
 assert.equal(slower.bestExit.speedGain,0);assert.equal(faster.bestExit.speedGain,0);
 assert.ok(faster.bestExit.duration>=2);assert.equal(slower.bestExit.duration,faster.bestExit.duration*2);
 assert.ok(faster.score>slower.score,'carrying more speed over the same distance must outrank taking longer');
});

test('unfinished powered exits keep improving near the duration and distance thresholds',()=>{
 const zone=Fitness.exitZones(track)[0];
 const near=duration=>{
  const raw=replay({accelerate:0});raw.score=100;
  const first=raw.frames.findIndex(f=>f.s>=zone.exit),origin=raw.frames[first-1].time;
  raw.frames=raw.frames.map(f=>f.time<=origin+duration+1e-8?f:{...f,throttle:0,rearTorque:0,wheelForces:[{},{},{fx:0},{fx:0}]});
  return Fitness.rank(vehicle,track,raw).power;
 };
 const attempts=[1.8,1.9,1.95].map(near);
 for(const [i,m] of attempts.entries()){
  assert.equal(m.success,false);assert.ok(m.bestExit.duration<2);assert.ok(m.bestExit.distance<30);
  assert.ok(m.score<59,'an unfinished attempt keeps headroom below completion');
  if(i){assert.ok(m.bestExit.distance>attempts[i-1].bestExit.distance);assert.ok(m.score>attempts[i-1].score,'additional continuous progress must not disappear into a saturated partial score');}
 }
});

test('a longer decelerating attempt cannot hide the better continuous powered exit',()=>{
 const raw=replay({accelerate:0});
 raw.frames=raw.frames.map(f=>{
  const first=f.s>=65&&f.s<=86,second=f.s>=105&&f.s<=131;
  if(!first&&!second)return {...f,throttle:0,rearTorque:0,wheelForces:[{},{},{fx:0},{fx:0}]};
  if(!second)return f;
  const speed=15-2.5*(f.s-105)/26,scale=speed/f.speed;
  return {...f,speed,vx:f.vx*scale,vy:f.vy*scale};
 });
 const m=Fitness.rank(vehicle,track,raw).power;
 assert.equal(m.success,false);assert.equal(m.runs.length,2);
 assert.ok(m.runs[1].distance>m.runs[0].distance);assert.ok(m.runs[1].speedGain<-2);
 assert.equal(m.bestExit.startTime,m.runs[0].startTime,'best progress preserves speed instead of choosing distance alone');
});
