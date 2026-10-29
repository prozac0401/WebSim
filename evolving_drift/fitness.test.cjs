'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Fitness=require('./fitness.js');
const DEG=Math.PI/180,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const vehicle={physics:{massKg:1500}};
const track={id:'test-apex',length:240,judgedStart:20,judgedEnd:200,sample:s=>({curvature:s>=60&&s<=130?.014:0})};

// Fixed spatial samples keep comparisons of angle, speed and propulsion on
// exactly the same physical path. Changing speed changes time, not geometry.
function replay({angle=35,speed=20,force=2500,torque=2500,throttle=.6,brake=0,curve=s=>track.sample(s).curvature,valid=true}={}){
  const frames=[];let x=0,y=0,heading=0,time=0;
  const value=(v,s)=>typeof v==='function'?v(s):v,ds=.25;
  for(let s=0;s<=track.length;s+=ds){
    const v=value(speed,s),degrees=s>=40&&s<=185?value(angle,s):0,beta=-degrees*DEG;
    frames.push({time,s,x,y,vx:v*Math.cos(heading),vy:v*Math.sin(heading),yaw:heading-beta,speed:v,beta,throttle:value(throttle,s),brake:value(brake,s),rearTorque:value(torque,s),wheelSlip:[0,0,.2,.2],wheelForces:[{},{},{fx:value(force,s)/2},{fx:value(force,s)/2}],status:s===track.length?(valid?'finished':'offtrack'):'running'});
    const k=curve(s+ds/2);x+=Math.cos(heading+k*ds/2)*ds;y+=Math.sin(heading+k*ds/2)*ds;heading+=k*ds;time+=ds/v;
  }
  return {valid,status:valid?'finished':'offtrack',score:20,time,frames};
}
const metric=(options={})=>Fitness.measure(replay(options),track,vehicle);
const sum=parts=>Object.values(parts).reduce((n,v)=>n+v,0);
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}

test('apex evaluation includes linked bends without a powered-exit straight',()=>{
  const linked={id:'linked',length:190,judgedStart:15,judgedEnd:160,sample:s=>({curvature:s>=25&&s<80?.02:s>=80&&s<=140?-.02:0})};
  const zones=Fitness.apexZones(linked);assert.equal(zones.length,2);assert.deepEqual(zones.map(z=>z.sign),[1,-1]);
  for(const z of zones){assert.ok(z.start<z.apex&&z.apex<z.end);assert.ok(z.referenceStart<=z.start);assert.ok(z.fitRadius>0);}
  const synthetic=require('./track.js').create();assert.equal(Fitness.apexZones(synthetic).length,3,'all three S500 bends count, including its linked first two');
});

test('larger sustained sideways angle wins on the same path and maintained speed',()=>{
  const angles=[15,25,40,55,70],metrics=angles.map(angle=>metric({angle}));
  for(let i=0;i<metrics.length;i++){
    const m=metrics[i];assert.ok(m.score>0&&m.score<=100);assert.ok(Math.abs(m.score-sum(m.parts))<1e-9);
    assert.ok(m.sidewaysDistance>0);assert.ok(m.bestArc);
    if(i)assert.ok(m.score>metrics[i-1].score,angles[i]+' degrees must beat '+angles[i-1]);
  }
});

test('losing 90 to 40 km/h suppresses the main objective despite a larger angle',()=>{
  const held=metric({angle:35,speed:25}),lost=metric({angle:55,speed:s=>25-(25-40/3.6)*clamp((s-60)/25,0,1)});
  assert.ok(lost.score<held.score*.6,'high-angle deceleration must not beat maintained-speed drift');
  assert.ok(lost.parts.sideways<held.parts.sideways);assert.ok(lost.parts.connection<held.parts.connection);
  assert.ok(lost.speedRetention<held.speedRetention);
});

test('speed retention rewards recovery continuously and never resets at a new slide',()=>{
  const outcomes=[.71,.8,.9,.95,1].map(r=>metric({speed:s=>s<60?20:20*r}));
  for(let i=1;i<outcomes.length;i++)assert.ok(outcomes[i].score>outcomes[i-1].score||i===outcomes.length-1&&Math.abs(outcomes[i].score-outcomes[i-1].score)<1e-8);
  const fast=metric({angle:45,speed:20});
  const resetAttempt=metric({angle:s=>s>85&&s<100?0:45,speed:s=>s<60?20:8});
  assert.ok(resetAttempt.score<fast.score*.4,'a later low-speed slide cannot define a fresh low entry-speed target');
});

test('low speed during an apex drift invalidates the whole window and cannot be hidden by restarting',()=>{
  const options={angle:s=>s>=75&&s<85?0:55,speed:s=>s<60?25:40/3.6};
  const m=metric(options);assert.equal(m.score,0);assert.ok(m.bestArc);
  assert.equal(m.bestArc.speedScope,'apex-window');
  assert.ok(Math.abs(m.bestArc.speedRetention-(40/3.6)/25)<1e-9,'display the lost window speed, not a short earlier 100% run');
  assert.ok(Math.abs(m.speedRetention-m.bestArc.speedRetention)<1e-9);
});

test('the first slide-release frame cannot hide a simultaneous large speed drop',()=>{
  const m=metric({angle:s=>s<110?35:0,speed:s=>s<110?20:8});
  assert.equal(m.score,0,'changing beta to zero on the slowing frame must not preserve the former score');
});

test('braking for the next bend after a clean recovery does not erase the completed drift',()=>{
  const held=metric({angle:s=>s<150?35:0,speed:20});
  const recovered=metric({angle:s=>s<150?35:0,speed:s=>s<160?20:5});
  assert.ok(held.score>0);assert.ok(Math.abs(held.score-recovered.score)<1e-9);
});

test('an intentionally slow approach is constrained by the prepared reference speed',()=>{
  const reference=replay({speed:25}),slow=replay({speed:8,angle:55});
  const ranked=Fitness.rank(vehicle,track,slow,slow.frames,{reference:reference.frames});
  const fast=Fitness.rank(vehicle,track,replay({speed:25,angle:35}),undefined,{reference:reference.frames});
  assert.ok(ranked.score<fast.score*.25);assert.ok(ranked.drift.speedRetention<fast.drift.speedRetention);
});

test('propulsion is a bounded five-point supporting factor, not the objective gate',()=>{
  const powered=metric(),coasting=metric({force:0,torque:0,throttle:0}),braking=metric({force:0,torque:0,throttle:0,brake:.3});
  assert.ok(coasting.score>0);assert.ok(powered.score>=coasting.score);assert.ok(powered.score-coasting.score<=5+1e-9);
  for(const key of ['sideways','connection','curve'])assert.ok(Math.abs(powered.parts[key]-coasting.parts[key])<1e-9,key+' must not require acceleration');
  assert.ok(Math.abs(braking.score-coasting.score)<1e-9,'identical physical speed/path/angle are not invalidated solely by a pedal');
  const largerAngle=metric({angle:55,force:0,torque:0,throttle:0}),smallPowered=metric({angle:15,force:9000,torque:6000});
  assert.ok(largerAngle.score>smallPowered.score);
});

test('one continuous drift crossing the apex beats disconnected slides and angle spikes',()=>{
  const steady=metric({angle:35}),split=metric({angle:s=>s>=88&&s<=102?0:35}),spike=metric({angle:s=>s>=94&&s<=95?70:15});
  assert.ok(steady.parts.connection>split.parts.connection);assert.ok(steady.score>split.score);assert.ok(steady.score>spike.score);
  const wrongSign=metric({angle:-35});assert.ok(wrongSign.score<steady.score*.1,'opposite-signed body slip is not the same apex drift');
});

test('straight cuts and oscillating trajectories cannot earn a clean apex curve',()=>{
  const smooth=metric(),cut=metric({curve:()=>0}),weave=metric({curve:s=>track.sample(s).curvature+.08*Math.sin(s*.65)});
  assert.ok(cut.parts.connection<smooth.parts.connection*.1);assert.ok(cut.parts.curve<smooth.parts.curve*.1);
  assert.ok(cut.score<smooth.score);assert.ok(weave.parts.curve<smooth.parts.curve);assert.ok(weave.score<smooth.score);
});

test('longer elapsed time, stationary poses and inflated projected progress cannot add sideways distance',()=>{
  const raw=replay(),normal=Fitness.measure(raw,track,vehicle);
  const slower={...raw,frames:raw.frames.map(f=>({...f,time:f.time*1.25,speed:f.speed/1.25,vx:f.vx/1.25,vy:f.vy/1.25}))};
  assert.ok(Fitness.measure(slower,track,vehicle).score<=normal.score+1e-8,'time alone earns no bonus');
  const shortened={...raw,frames:raw.frames.map(f=>({...f,x:f.x*.2,y:f.y*.2}))};
  assert.ok(Fitness.measure(shortened,track,vehicle).sidewaysDistance<normal.sidewaysDistance*.3);
  const end=raw.frames.at(-1),stalled={...raw,frames:[...raw.frames,...Array.from({length:20},(_,i)=>({...end,time:end.time+(i+1)*.025,status:i===19?'finished':'running'}))]};
  assert.ok(Math.abs(Fitness.measure(stalled,track,vehicle).score-normal.score)<1e-9);
});

test('a telemetry gap breaks apex continuity instead of joining separated sections',()=>{
  const raw=replay(),normal=Fitness.measure(raw,track,vehicle),gapped={...raw,frames:raw.frames.filter(f=>f.s<88||f.s>102)};
  const m=Fitness.measure(gapped,track,vehicle);assert.ok(m.parts.connection<normal.parts.connection);assert.ok(m.score<normal.score);
});

test('recorded-prefix scores are exact, causal and finish at the same ranking',()=>{
  const raw=replay(),timeline=Fitness.replayTimeline(raw,track,vehicle);
  assert.equal(timeline.length,raw.frames.length);assert.ok(timeline.some(t=>t.earning));assert.ok(timeline.every(t=>t.estimatedStyle===false));
  for(const s of [50,75,100,130,170]){
    const index=raw.frames.findIndex(f=>f.s>=s),prefix={...raw,frames:raw.frames.slice(0,index+1)};
    assert.ok(Math.abs(Fitness.measure(prefix,track,vehicle).score-timeline[index].score)<1e-9,'prefix at '+s);
  }
  const ranked=Fitness.rank(vehicle,track,raw);assert.equal(timeline.at(-1).score,ranked.score);assert.equal(timeline.at(-1).finalValid,true);
  assert.deepEqual(Fitness.rank(vehicle,track,ranked),ranked,'ranking is idempotent');
  for(const point of timeline)assert.equal(point.earning,point.conditions.area&&point.delta>1e-7);
});

test('replay explanations never announce no points while the displayed score is increasing',()=>{
  const timeline=Fitness.replayTimeline(replay({angle:55,speed:s=>s<60?25:40/3.6}),track,vehicle);
  for(const point of timeline)if(point.reason.includes('득점 없음'))assert.equal(point.earning,false,'contradictory explanation at '+point.s+'m');
});

test('future telemetry and a later failure cannot change earlier replay scores',()=>{
  const raw=replay(),cut=raw.frames.findIndex(f=>f.s>=115),original=Fitness.replayTimeline(raw,track,vehicle);
  const changed={...raw,score:999,valid:false,status:'offtrack',frames:raw.frames.map((f,i)=>i<=cut?f:{...f,beta:0,brake:1,rearTorque:0,wheelForces:[],status:i===raw.frames.length-1?'offtrack':'running'})};
  const later=Fitness.replayTimeline(changed,track,vehicle);
  assert.deepEqual(later.slice(0,cut+1),original.slice(0,cut+1));assert.ok(later[cut].score>0);
  assert.equal(later.at(-1).score,0);assert.equal(later.at(-1).finalValid,false);assert.match(later.at(-1).reason,/이탈.*무효/);
});

test('failed finishes and spins at any recorded position are never selected',()=>{
  for(const status of ['offtrack','collision','timeout','spin','invalid']){
    const raw={...replay(),valid:false,status},ranked=Fitness.rank(vehicle,track,raw),timeline=Fitness.replayTimeline(raw,track,vehicle);
    assert.equal(ranked.score,0);assert.equal(ranked.drift.score,0);assert.equal(timeline.at(-1).score,0);assert.equal(timeline.at(-1).finalValid,false);
  }
  const base=replay();
  for(const index of [0,Math.floor(base.frames.length/2),base.frames.length-1])for(const explicit of [false,true]){
    const raw={...base,frames:base.frames.map((f,i)=>i!==index?f:explicit?{...f,status:'spin'}:{...f,beta:76*DEG,yaw:Math.atan2(f.vy,f.vx)-76*DEG})};
    const ranked=Fitness.rank(vehicle,track,raw),timeline=Fitness.replayTimeline(raw,track,vehicle);
    assert.equal(ranked.valid,false);assert.equal(ranked.status,'spin');assert.equal(ranked.score,0);assert.equal(ranked.drift.spinDetected,true);
    for(const point of timeline.slice(index)){assert.equal(point.score,0);assert.equal(point.earning,false);assert.match(point.reason,/스핀.*무효/);}
  }
});

test('legacy powered-exit telemetry remains available without a sixty-point selection tier',()=>{
  const raw=replay(),legacy=Fitness.measurePower(raw,track,vehicle),ranked=Fitness.rank(vehicle,track,raw);
  assert.ok(legacy.bestExit?.distance>0);assert.ok(legacy.bestExit?.meanRearPowerW>0);
  assert.equal(ranked.score,ranked.drift.score);assert.deepEqual(ranked.power,legacy);assert.equal(raw.score,20);
  assert.ok(Fitness.measurePower(replay({force:0}),track,vehicle).success===false);
});

test('measurement, ranking and replay explanations leave frozen inputs unchanged',()=>{
  const raw=freeze(replay()),car=freeze({physics:{...vehicle.physics}}),course=Object.freeze({...track}),before=JSON.stringify({raw,car});
  const a=Fitness.measure(raw,course,car),b=Fitness.rank(car,course,raw),c=Fitness.replayTimeline(raw,course,car);
  assert.equal(JSON.stringify({raw,car}),before);assert.equal(a.score,b.score);assert.equal(c.at(-1).score,b.score);
});
