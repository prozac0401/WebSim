'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Fitness=require('./fitness.js');
const DEG=Math.PI/180,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const vehicle={physics:{massKg:1500}};
const track={id:'test-apex',length:240,judgedStart:20,judgedEnd:200,sample:s=>({curvature:s>=60&&s<=130?.014:0})};

// Fixed spatial samples keep comparisons of angle, speed and propulsion on
// exactly the same physical path. Changing speed changes time, not geometry.
function replay({angle=35,speed=20,force=2500,torque=2500,throttle=.6,brake=0,course=track,curve=s=>course.sample(s).curvature,angleStart=40,angleEnd=185,valid=true}={}){
  const frames=[];let x=0,y=0,heading=0,time=0;
  const value=(v,s)=>typeof v==='function'?v(s):v,ds=.25;
  for(let s=0;s<=course.length;s+=ds){
    const v=value(speed,s),degrees=s>=angleStart&&s<=angleEnd?value(angle,s):0,beta=-degrees*DEG;
    frames.push({time,s,x,y,vx:v*Math.cos(heading),vy:v*Math.sin(heading),yaw:heading-beta,speed:v,beta,throttle:value(throttle,s),brake:value(brake,s),rearTorque:value(torque,s),wheelSlip:[0,0,.2,.2],wheelForces:[{},{},{fx:value(force,s)/2},{fx:value(force,s)/2}],status:s===course.length?(valid?'finished':'offtrack'):'running'});
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

test('prepared floors use robust distance-based core pace and independent connecting-straight pace',()=>{
 const course={id:'prepared-paces',length:300,judgedStart:20,judgedEnd:260,sample:s=>({curvature:s>=60&&s<=100?.014:s>=180&&s<=220?.014:0})};
 const zones=Fitness.apexZones(course),link=Fitness.straightLinks(course)[0];
 const speed=s=>s>=zones[0].cornerStart&&s<=zones[0].exit?12:s>=zones[1].cornerStart&&s<=zones[1].exit?9:s>=link.straightStart&&s<=link.straightEnd?16:30;
 const record=replay({course,speed,angle:0}).frames,refs=Fitness.referenceSpeeds(course,record);
 assert.equal(refs[zones[0].id],12);assert.equal(refs[zones[1].id],9);assert.equal(refs[link.id],16);
 const noisy=record.map(f=>({...f,speed:Math.abs(f.s-zones[0].apex)<.3?.5:f.speed}));
 assert.deepEqual(Fitness.referenceSpeeds(course,noisy),refs,'one anomalous slow sample cannot lower a fixed core reference');
});

test('planned braking before actual drift and core entry can maintain a feasible corner pace',()=>{
 const z=Fitness.apexZones(track)[0],speed=s=>25-13*clamp((s-z.start)/(z.cornerStart-z.start-4),0,1);
 const reference=replay({speed,angle:0}),raw=replay({speed,angleStart:z.cornerStart,angle:35});
 const m=Fitness.rank(vehicle,track,raw,raw.frames,{reference:reference.frames}).drift;
 assert.equal(m.fullConnectionCount,1);assert.ok(m.score>0);assert.ok(Math.abs(m.bestArc.entrySpeed-12)<1e-9);
 assert.ok(Math.abs(m.bestArc.speedRetention-1)<1e-9);assert.equal(m.bestArc.referenceScope,'core-entry-or-earlier-drift');
 assert.equal(m.bestArc.referenceSource,'core-entry');assert.equal(m.bestArc.preparedPace,12);assert.ok(Math.abs(m.bestArc.referenceFloor-9.6)<1e-9);
});

test('the same braking after sustained drift begins remains a real speed loss, including before START',()=>{
 const z=Fitness.apexZones(preparationTrack)[0],speed=s=>s<80?25:12,reference=replay({course:preparationTrack,speed:12,angle:0});
 const raw=replay({course:preparationTrack,angleStart:50,angle:s=>s>=80&&s<110?0:35,speed});
 const m=Fitness.rank(vehicle,preparationTrack,raw,raw.frames,{reference:reference.frames}).drift;
 assert.equal(m.bestArc,null,'the low-speed restart cannot even establish a credited episode');assert.equal(m.score,0);assert.equal(m.fullConnectionCount,0);
 const resumed=replay({course:preparationTrack,angleStart:50,angle:s=>s>=80&&s<110?0:35,speed:s=>s<80?25:20});
 const p=Fitness.rank(vehicle,preparationTrack,resumed,resumed.frames,{reference:reference.frames}).drift;
 assert.equal(p.bestArc.entrySpeed,25);assert.equal(p.bestArc.referenceSource,'sustained-drift');assert.ok(p.bestArc.referenceS<z.start);
 assert.ok(Math.abs(p.bestArc.speedRetention-.8)<1e-9);assert.equal(p.fullConnectionCount,0);
});

test('a brief pre-entry feint cannot anchor the unrelated earlier straight peak',()=>{
 const z=Fitness.apexZones(track)[0],feint=z.start+2,speed=s=>25-13*clamp((s-feint-2)/(z.cornerStart-feint-6),0,1);
 const raw=replay({speed,angleStart:0,angle:s=>s>=feint&&s<feint+1||s>=z.cornerStart?35:0});
 const reference=replay({speed,angle:0}),m=Fitness.rank(vehicle,track,raw,raw.frames,{reference:reference.frames}).drift;
 assert.equal(m.bestArc.entrySpeed,12);assert.equal(m.bestArc.referenceSource,'core-entry');assert.equal(m.fullConnectionCount,1);
});

test('an unconfirmed short feint at the exact core-entry sample cannot become a locked peak',()=>{
 const z=Fitness.apexZones(track)[0],speed=s=>s<z.cornerStart?25:12,raw=replay({speed,angleStart:z.cornerStart-.5}),reference=replay({speed:12,angle:0});
 const m=Fitness.rank(vehicle,track,raw,raw.frames,{reference:reference.frames}).drift;
 assert.equal(m.bestArc.entrySpeed,12);assert.equal(m.bestArc.referenceSource,'core-entry');assert.equal(m.fullConnectionCount,1);
});

test('launch preparation cannot lock a low speed before an accelerating sustained pre-START drift',()=>{
 const raw=preparationReplay({speed:s=>s<75?8:s<90?8+(s-75)*.8:20}),m=Fitness.measure(raw,preparationTrack,vehicle);
 assert.equal(m.bestArc.entrySpeed,20);assert.ok(m.bestArc.initiationS>=80);assert.equal(m.fullConnectionCount,1);
});

test('a later corner reference excludes completed drifting before the preceding physical exit',()=>{
 const course=linkedTracks[0],zones=Fitness.apexZones(course),first=zones[0],second=zones[1],speed=s=>s<=first.exit?25:25-13*clamp((s-first.exit)/30,0,1);
 const angle=s=>s<first.exit-1||s>=second.cornerStart?35:0,raw=replay({course,speed,angle,angleStart:40,angleEnd:280}),reference=replay({course,speed,angle:0});
 const m=Fitness.rank(vehicle,course,raw,raw.frames,{reference:reference.frames}).drift,arc=m.arcs.find(a=>a.zoneId===second.id);
 assert.equal(arc.bestArc.entrySpeed,12);assert.equal(arc.complete,true);
});

test('missing observed core entry cannot manufacture a complete connection from prepared pace',()=>{
 const z=Fitness.apexZones(track)[0],reference=replay({speed:12,angle:0}),raw=replay({speed:12}),truncated={...raw,frames:raw.frames.filter(f=>f.s>z.cornerStart+1)};
 const m=Fitness.rank(vehicle,track,truncated,truncated.frames,{reference:reference.frames}).drift;
 assert.equal(m.fullConnectionCount,0);assert.ok(m.bestArc.connectionCoverage<1);
});

test('a record beginning exactly at core entry locks its observed speed instead of only the prepared floor',()=>{
 const z=Fitness.apexZones(track)[0],reference=replay({speed:12,angle:0}),raw=replay({speed:s=>s<=z.cornerStart+5?12:8.8,angleStart:z.cornerStart});
 const cropped={...raw,frames:raw.frames.filter(f=>f.s>=z.cornerStart)};
 const full=Fitness.rank(vehicle,track,raw,raw.frames,{reference:reference.frames}).drift,m=Fitness.rank(vehicle,track,cropped,cropped.frames,{reference:reference.frames}).drift;
 assert.equal(m.bestArc.entrySpeed,12);assert.equal(m.bestArc.referenceSource,'core-entry');assert.equal(m.bestArc.referenceS,z.cornerStart);
 assert.ok(Math.abs(m.bestArc.speedRetention-8.8/12)<1e-9);assert.equal(m.fullConnectionCount,0);
 assert.equal(m.bestArc.speedRetention,full.bestArc.speedRetention);assert.equal(m.bestArc.complete,full.bestArc.complete);
});

test('planned approach speed changes after a prefix cannot rewrite earlier reference observations',()=>{
 const raw=preparationReplay(),cut=raw.frames.findIndex(f=>f.s===90),original=Fitness.replayTimeline(raw,preparationTrack,vehicle);
 const changed={...raw,frames:raw.frames.map((f,i)=>i<=cut?f:{...f,speed:f.speed*.6,vx:f.vx*.6,vy:f.vy*.6})};
 const later=Fitness.replayTimeline(changed,preparationTrack,vehicle);assert.deepEqual(later.slice(0,cut+1),original.slice(0,cut+1));
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

test('a complete entry-to-exit connection outranks a larger angle confined to the exit',()=>{
  const z=Fitness.apexZones(track)[0];
  const exitOnly=metric({angle:s=>s>z.apex+1?70:0});
  for(const angle of [15,25,40]){
    const connected=metric({angle});
    assert.equal(connected.bestArc.complete,true);assert.equal(connected.fullConnectionCount,1);assert.equal(connected.totalArcCount,1);
    assert.ok(Math.abs(connected.bestArc.connectionCoverage-1)<1e-9);
    assert.ok(connected.score>exitOnly.score,angle+' degrees across the whole corner must beat a 70-degree exit fragment');
  }
  assert.equal(exitOnly.bestArc.complete,false);assert.equal(exitOnly.fullConnectionCount,0);assert.equal(exitOnly.parts.connection,0);
});

test('crossing the apex by a few metres is not a complete corner connection',()=>{
  const z=Fitness.apexZones(track)[0],tiny=metric({angle:s=>Math.abs(s-z.apex)<=2?60:0}),full=metric({angle:25});
  assert.ok(tiny.bestArc);assert.equal(tiny.bestArc.complete,false);assert.equal(tiny.fullConnectionCount,0);
  assert.ok(tiny.bestArc.connectionCoverage<.1);assert.ok(tiny.parts.connection<full.parts.connection*.1);
  assert.ok(tiny.score<full.score);
});

test('the core entry and exit boundaries decide full coverage without requiring both adjacent straights',()=>{
  const z=Fitness.apexZones(track)[0],core=metric({angle:s=>s>=z.cornerStart&&s<=z.exit?25:0});
  const missesExit=metric({angle:s=>s>=z.cornerStart&&s<z.exit?25:0});
  const missesEntry=metric({angle:s=>s>z.cornerStart+1&&s<=z.exit?25:0});
  assert.equal(core.bestArc.complete,true);assert.equal(core.fullConnectionCount,1);assert.equal(core.bestArc.connectionCoverage,1);
  for(const m of [missesExit,missesEntry]){assert.equal(m.bestArc.complete,false);assert.ok(m.bestArc.connectionCoverage<1);assert.ok(m.score<core.score);}
  const raw=replay({angle:s=>s>=z.cornerStart&&s<=z.exit?25:0}),timeline=Fitness.replayTimeline(raw,track,vehicle);
  const before=raw.frames.findIndex(f=>f.s>=z.exit)-1,atExit=before+1;
  assert.equal(timeline[before].conditions.complete,false);assert.equal(timeline[atExit].conditions.complete,true);
});

test('split, reversed and missing telemetry episodes cannot assemble a complete connection',()=>{
  const z=Fitness.apexZones(track)[0],full=metric({angle:25});
  const split=metric({angle:s=>Math.abs(s-z.apex)<=2?0:65});
  const reversed=metric({angle:s=>Math.abs(s-z.apex)<=2?-65:65});
  const raw=replay({angle:65}),gapped=Fitness.measure({...raw,frames:raw.frames.filter(f=>Math.abs(f.s-z.apex)>2)},track,vehicle);
  for(const m of [split,reversed,gapped]){
    assert.equal(m.fullConnectionCount,0);assert.equal(m.bestArc.complete,false);assert.ok(m.bestArc.connectionCoverage<1);
    assert.ok(m.score<full.score,'a high-angle split must not displace a complete maintained-speed connection');
  }
});

test('full geometric coverage only counts as a maintained-speed connection at ninety percent retention',()=>{
  const almost=metric({speed:s=>s<60?20:17.9}),held=metric({speed:s=>s<60?20:18});
  assert.equal(almost.bestArc.connectionCoverage,1);assert.equal(almost.bestArc.complete,false);assert.equal(almost.fullConnectionCount,0);
  assert.equal(held.bestArc.connectionCoverage,1);assert.equal(held.bestArc.complete,true);assert.equal(held.fullConnectionCount,1);
  assert.ok(held.score>almost.score);
  const slow=metric({speed:s=>s<60?25:40/3.6,angle:55});assert.equal(slow.score,0);assert.equal(slow.fullConnectionCount,0);
});

const preparationTrack={id:'test-pre-start-drift',length:260,judgedStart:100,judgedEnd:220,sample:s=>({curvature:s>=120&&s<=180?.014:0})};
function preparationReplay(options={}){
  const raw=replay({course:preparationTrack,angleStart:50,angleEnd:240,...options});
  const reference=replay({course:preparationTrack,speed:20,angle:0});
  return {...raw,drift:{referenceSpeeds:Fitness.referenceSpeeds(preparationTrack,reference.frames)}};
}

test('sufficient-speed pre-START drift preserves its origin without awarding preparation distance',()=>{
  const early=preparationReplay(),atStart=preparationReplay({angleStart:100});
  const a=Fitness.measure(early,preparationTrack,vehicle),b=Fitness.measure(atStart,preparationTrack,vehicle);
  assert.equal(a.bestArc.startedBeforeStart,true);assert.ok(a.bestArc.initiationS<preparationTrack.judgedStart-20);
  assert.ok(a.bestArc.initiationTime<a.bestArc.startTime);assert.equal(a.bestArc.start,preparationTrack.judgedStart);
  assert.ok(Math.abs(a.bestArc.distance-b.bestArc.distance)<1e-9);assert.ok(Math.abs(a.score-b.score)<1e-9);
  assert.equal(a.fullConnectionCount,1);
  const timeline=Fitness.replayTimeline(early,preparationTrack,vehicle),pre=timeline.filter(p=>p.s<preparationTrack.judgedStart);
  assert.ok(pre.some(p=>p.phase==='initiation'&&p.preStartDrift?.active));
  for(const p of pre){assert.equal(p.score,0);assert.equal(p.earning,false);if(p.preStartDrift?.active){assert.ok(p.preStartDrift.speed>=8);assert.ok(p.preStartDrift.angle>=10);assert.ok(p.preStartDrift.distanceToStart>0);}}
});

test('release, sign reversal and a telemetry gap reset the pre-START origin',()=>{
  const release=preparationReplay({angle:s=>s>=75&&s<90?0:35});
  const reversed=preparationReplay({angle:s=>s>=75&&s<90?-35:35});
  const raw=preparationReplay(),gap={...raw,frames:raw.frames.filter(f=>f.s<75||f.s>=90)};
  for(const record of [release,reversed,gap]){
    const m=Fitness.measure(record,preparationTrack,vehicle);
    assert.equal(m.bestArc.startedBeforeStart,true);assert.ok(m.bestArc.initiationS>=89.5);assert.ok(m.bestArc.initiationS<100);
    assert.equal(m.fullConnectionCount,1);
  }
});

test('slow early preparation does not masquerade as sufficient-speed initiation or poison the later corner',()=>{
  const raw=preparationReplay({speed:s=>s<80?8:20}),m=Fitness.measure(raw,preparationTrack,vehicle);
  assert.equal(m.bestArc.startedBeforeStart,true);assert.ok(m.bestArc.initiationS>=79.5);assert.ok(m.bestArc.initiationS<100);
  assert.ok(m.score>0);assert.equal(m.fullConnectionCount,1);assert.ok(m.bestArc.speedRetention>=.9);
  const timeline=Fitness.replayTimeline(raw,preparationTrack,vehicle);
  assert.ok(timeline.filter(p=>p.s>=50&&p.s<80).every(p=>!p.preStartDrift?.active));
});

test('pre-START explanations are causal and do not infer initiation from later frames',()=>{
  const raw=preparationReplay(),cut=raw.frames.findIndex(f=>f.s===90),original=Fitness.replayTimeline(raw,preparationTrack,vehicle);
  const changed={...raw,frames:raw.frames.map((f,i)=>i<=cut?f:{...f,beta:0})};
  const later=Fitness.replayTimeline(changed,preparationTrack,vehicle);
  assert.deepEqual(later.slice(0,cut+1),original.slice(0,cut+1));assert.equal(original[cut].preStartDrift.active,true);
  assert.ok(original[cut].preStartDrift.s<=raw.frames[cut].s);assert.equal(original[cut].score,0);
});

const linkedTracks=[false,true].map(opposite=>({id:'test-linked-'+opposite,length:320,judgedStart:20,judgedEnd:260,
  sample:s=>({curvature:s>=60&&s<=100?.014:s>=180&&s<=220?(opposite?-.014:.014):0})}));
const transitionAngle=(s,center,width,from=35,to=-35)=>from+(to-from)*clamp((s-center+width/2)/width,0,1);
function linkedReplay({opposite=false,angle,transitionWidth=16,speed=20,...options}={}){
  const course=linkedTracks[opposite?1:0];
  const degrees=angle??(opposite?s=>transitionAngle(s,140,transitionWidth):35);
  return {course,raw:replay({course,angle:degrees,angleStart:40,angleEnd:280,speed,...options})};
}
function linkedMetric(options={}){const {course,raw}=linkedReplay(options);return Fitness.measure(raw,course,vehicle);}

test('straight links include the entire inter-corner gap and single-corner evaluation needs no link',()=>{
  const zones=Fitness.apexZones(linkedTracks[0]),links=Fitness.straightLinks(linkedTracks[0]);
  assert.equal(links.length,1);const l=links[0];
  assert.equal(l.fromZoneId,zones[0].id);assert.equal(l.toZoneId,zones[1].id);
  assert.equal(l.start,zones[0].apex);assert.equal(l.end,zones[1].apex);
  assert.equal(l.straightStart,zones[0].exit);assert.equal(l.straightEnd,zones[1].cornerStart);
  assert.equal(l.straightEnd-l.straightStart,76);
  const single=metric();assert.equal(single.totalLinkCount,0);assert.equal(single.straightLinkCount,0);assert.ok(single.score>0);
});

test('straight-link speed floors never inherit an unrelated corner approach or core pace',()=>{
 const {course,raw}=linkedReplay(),zones=Fitness.apexZones(course),link=Fitness.straightLinks(course)[0];
 const refs={[zones[0].id]:100,[zones[1].id]:100,[link.id]:20},m=Fitness.measure(raw,course,vehicle,{referenceSpeeds:refs});
 assert.equal(m.bestLink.entrySpeed,20);assert.equal(m.bestLink.referenceFloor,16);assert.equal(m.bestLink.preparedPace,20);
 assert.equal(m.bestLink.referenceScope,'straight-entry');assert.equal(m.bestLink.complete,true);assert.equal(m.straightLinkCount,1);
});

test('continuous drift through the straight outranks higher-angle corners separated by grip driving',()=>{
  const link=Fitness.straightLinks(linkedTracks[0])[0],held=linkedMetric({angle:25});
  const broken=linkedMetric({angle:s=>s>link.straightStart&&s<link.straightEnd?0:70});
  assert.equal(held.fullConnectionCount,2);assert.equal(held.totalLinkCount,1);assert.equal(held.straightLinkCount,1);
  assert.equal(held.bestLink.complete,true);assert.ok(Math.abs(held.bestLink.coverage-1)<1e-9);assert.ok(held.sequenceCoverage>.99);
  assert.equal(broken.fullConnectionCount,2,'both corners alone still qualify');assert.equal(broken.straightLinkCount,0);
  assert.ok(held.score>broken.score,'grip recovery between high-angle corners is not the full-course objective');
  assert.ok(Math.abs(held.score-sum(held.parts))<1e-9);assert.ok(held.score<=100);
});

test('a continuous inside line can complete a link while travelling less distance than the centreline',()=>{
  const {course,raw}=linkedReplay(),offset=4.75,wide={...course,width:16};
  // A parallel inner path stays within this road and keeps the same heading
  // progression. Its arc length and actual speed shrink by 1 - offset*kappa.
  const frames=raw.frames.map(f=>{
    const h=Math.atan2(f.vy,f.vx),speed=20*(1-offset*course.sample(f.s).curvature);
    return {...f,x:f.x-Math.sin(h)*offset,y:f.y+Math.cos(h)*offset,speed,vx:speed*Math.cos(h),vy:speed*Math.sin(h)};
  });
  const m=Fitness.measure({...raw,frames},wide,vehicle),link=Fitness.straightLinks(wide)[0];
  assert.equal(m.fullConnectionCount,2);assert.ok(Math.abs(m.bestLink.speedRetention-1)<1e-9);
  assert.ok(m.bestLink.distance<(link.end-link.start)*.98,'the inside arc is physically shorter');
  assert.equal(m.bestLink.complete,true);assert.equal(m.straightLinkCount,1);
});

test('an impossible projected-position jump breaks the straight-link episode despite continuous XY samples',()=>{
  const {course,raw}=linkedReplay(),normal=Fitness.measure(raw,course,vehicle);
  // The car still moves 0.25 m per frame, but a corrupt projection jumps
  // forty metres ahead and gradually rejoins the real station by 180 m.
  const frames=raw.frames.map(f=>({...f,s:f.s>=130&&f.s<180?170+(f.s-130)*.2:f.s}));
  const m=Fitness.measure({...raw,frames},course,vehicle);
  assert.equal(normal.straightLinkCount,1);assert.equal(m.straightLinkCount,0);assert.equal(m.bestLink?.complete??false,false);
  assert.ok(m.score<normal.score);
});

test('one short smooth sign reversal connects opposite corners while same-sign links keep their direction',()=>{
  const m=linkedMetric({opposite:true});assert.equal(m.straightLinkCount,1);assert.equal(m.bestLink.complete,true);
  assert.ok(m.bestLink.transitionDuration>0&&m.bestLink.transitionDuration<=.35+1e-9);
  assert.ok(m.bestLink.transitionDistance>0&&m.bestLink.transitionDistance<=8+1e-9);
  const wrong=linkedMetric({opposite:false,angle:s=>transitionAngle(s,140,16)});
  assert.equal(wrong.straightLinkCount,0);assert.equal(wrong.bestLink?.complete??false,false);
});

test('long grip recovery, repeated sign reversals and instant flips do not complete opposite-corner links',()=>{
  const valid=linkedMetric({opposite:true});
  const variants=[
    {transitionWidth:40},
    {angle:s=>s<130?35:s>150?-35:0},
    {angle:s=>s<135?transitionAngle(s,125,12):s<155?transitionAngle(s,145,12,-35,35):transitionAngle(s,165,12)},
    {angle:s=>s<140?35:-35},
    {transitionWidth:4}
  ];
  for(const options of variants){
    const m=linkedMetric({opposite:true,...options});assert.equal(m.straightLinkCount,0);assert.equal(m.bestLink?.complete??false,false);
    assert.ok(m.score<valid.score,'invalid transition must not score as a continuous link');
  }
});

test('opposite-corner low-angle transition must satisfy both elapsed-time and travelled-distance limits',()=>{
  const tooLong=linkedMetric({opposite:true,speed:12,transitionWidth:18});
  const tooFar=linkedMetric({opposite:true,speed:35,transitionWidth:35});
  for(const m of [tooLong,tooFar]){assert.equal(m.straightLinkCount,0);assert.equal(m.bestLink?.complete??false,false);}
  assert.equal(linkedMetric({opposite:true,speed:12,transitionWidth:12}).straightLinkCount,1);
  assert.equal(linkedMetric({opposite:true,speed:35,transitionWidth:20}).straightLinkCount,1);
});

test('speed loss in the connecting straight cannot reset its reference after a new slide',()=>{
  const held=linkedMetric(),slow=linkedMetric({speed:s=>s<130?20:10});
  assert.equal(held.straightLinkCount,1);assert.equal(slow.straightLinkCount,0);assert.ok(slow.score<held.score);
  const restarted=linkedMetric({angle:s=>s>=135&&s<145?0:35,speed:s=>s<130?20:10});
  assert.equal(restarted.straightLinkCount,0);assert.ok(restarted.score<held.score);
  assert.ok((slow.bestLink?.speedRetention??0)<.9);
});

test('releasing drift cannot hide later speed loss inside the same connecting straight',()=>{
  const m=linkedMetric({angle:s=>s<130?35:0,speed:s=>s<150?20:10});
  assert.ok(m.bestLink);assert.equal(m.bestLink.speedScope,'straight-window');
  assert.ok(Math.abs(m.bestLink.entrySpeed-20)<1e-9);assert.ok(Math.abs(m.bestLink.exitSpeed-10)<1e-9);
  assert.ok(Math.abs(m.bestLink.minSpeed-10)<1e-9);assert.ok(m.bestLink.minSpeed<=m.bestLink.exitSpeed);
  assert.ok(Math.abs(m.bestLink.speedRetention-.5)<1e-9);
  assert.equal(m.bestLink.score,0);assert.equal(m.sequenceCoverage,0);assert.equal(m.straightLinkCount,0);
});

test('braking after the straight is evaluated in the next corner without erasing held straight speed',()=>{
  const link=Fitness.straightLinks(linkedTracks[0])[0],m=linkedMetric({speed:s=>s<=link.straightEnd?20:12});
  assert.ok(m.bestLink);assert.ok(Math.abs(m.bestLink.entrySpeed-20)<1e-9);
  assert.ok(Math.abs(m.bestLink.minSpeed-20)<1e-9);assert.ok(Math.abs(m.bestLink.speedRetention-1)<1e-9);
  assert.equal(m.straightLinkCount,1);assert.ok(m.fullConnectionCount<2,'the slower next corner remains penalized independently');
});

test('a missing telemetry interval or a single drift pose at each end cannot manufacture a straight link',()=>{
  const {course,raw}=linkedReplay(),link=Fitness.straightLinks(course)[0];
  const gap=Fitness.measure({...raw,frames:raw.frames.filter(f=>f.s<130||f.s>140)},course,vehicle);
  assert.equal(gap.straightLinkCount,0);assert.equal(gap.bestLink?.complete??false,false);
  const onlyEnds=linkedMetric({angle:s=>s>=link.straightStart-.25&&s<=link.straightEnd+.25?35:0});
  assert.equal(onlyEnds.straightLinkCount,0);assert.equal(onlyEnds.bestLink?.complete??false,false);
});

test('straight-link replay remains causal and only confirms completion after the following apex',()=>{
  const {course,raw}=linkedReplay({opposite:true}),link=Fitness.straightLinks(course)[0],timeline=Fitness.replayTimeline(raw,course,vehicle);
  assert.ok(timeline.some(p=>p.phase==='link'));assert.equal(timeline.at(-1).straightLinkCount,1);
  assert.ok(timeline.filter(p=>p.s<link.end-.25).every(p=>!p.link?.complete));
  for(const s of [95,125,145,175,205]){
    const index=raw.frames.findIndex(f=>f.s>=s),prefix={...raw,frames:raw.frames.slice(0,index+1)},m=Fitness.measure(prefix,course,vehicle);
    assert.ok(Math.abs(m.score-timeline[index].score)<1e-9,'link prefix at '+s);assert.equal(m.straightLinkCount,timeline[index].straightLinkCount);
  }
  const cut=raw.frames.findIndex(f=>f.s>=135),changed={...raw,valid:false,status:'offtrack',frames:raw.frames.map((f,i)=>i<=cut?f:{...f,beta:0,status:i===raw.frames.length-1?'offtrack':'running'})};
  const later=Fitness.replayTimeline(changed,course,vehicle);assert.deepEqual(later.slice(0,cut+1),timeline.slice(0,cut+1));
  assert.equal(later.at(-1).score,0);assert.equal(later.at(-1).finalValid,false);
});

test('straight cuts and oscillating trajectories cannot earn a clean apex curve',()=>{
  const smooth=metric(),cut=metric({curve:()=>0}),weave=metric({curve:s=>track.sample(s).curvature+.08*Math.sin(s*.65)});
  assert.ok(cut.parts.connection<smooth.parts.connection*.1);assert.ok(cut.parts.curve<smooth.parts.curve*.1);
  assert.ok(cut.score<smooth.score);assert.ok(weave.parts.curve<smooth.parts.curve);assert.ok(weave.score<smooth.score);
});

test('turning only before or after a straight corner crossing does not claim a complete apex connection',()=>{
  const z=Fitness.apexZones(track)[0];
  for(const curve of [s=>s>=40&&s<z.cornerStart?.03:0,s=>s>z.exit&&s<160?.03:0]){
    const raw=replay({curve}),m=Fitness.measure(raw,track,vehicle),timeline=Fitness.replayTimeline(raw,track,vehicle);
    assert.equal(m.bestArc.connectionCoverage,1,'the same episode covers both core boundaries');
    assert.equal(m.bestArc.complete,false,'its real turn must occur within the corner itself');
    assert.equal(m.fullConnectionCount,0);assert.ok(timeline.every(p=>!p.conditions.complete));
  }
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
