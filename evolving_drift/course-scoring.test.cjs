'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Score=require('./course-scoring.js'),Fitness=require('./fitness.js');
const D=Math.PI/180,vehicle={physics:{massKg:1500}};
function fixture({length=202.5,step=1,zones=[],angle=70,speed=25}={}){
 const track={length,judgedStart:60,judgedEnd:150,zones,sample:s=>({s,x:s,y:0,heading:0,curvature:0})},frames=[];
 const value=(v,s)=>typeof v==='function'?v(s):v;let time=0,previousS=2.5;
 for(let n=0;;n++){
  const s=Math.min(length,2.5+n*step),v=value(speed,s),beta=value(angle,s)*D;if(n)time+=(s-previousS)/v;
  frames.push({s,time,x:s,y:0,vx:v,vy:0,yaw:-beta,beta,speed:v,brake:0,throttle:.5,rearTorque:0,status:s===length?'finished':'running'});
  if(s===length)break;previousS=s;
 }
 return {track,raw:{valid:true,status:'finished',score:0,frames,time}};
}
const integral=(a,b)=>{const f=x=>x<=60?x+x*x/120:90+2*(x-60);return f(b)-f(a);};
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ≈ ${b}`);

test('the whole mapped course earns distance points and one bounded continuity multiplier including both sides of the old judged section',()=>{
 const {track,raw}=fixture(),ranked=Fitness.rank(vehicle,track,raw),timeline=Fitness.replayTimeline(ranked,track,vehicle);
 near(ranked.score,370);near(ranked.drift.parts.base,200);near(ranked.drift.parts.continuity,170);assert.equal(ranked.drift.parts.zone,0);
 near(ranked.drift.scoring.maxMultiplier,2);near(ranked.drift.scoring.maxChainDistance,200);
 assert.ok(timeline.some(f=>f.s<track.judgedStart&&f.earning));assert.ok(timeline.some(f=>f.s>track.judgedEnd&&f.earning));
 near(timeline.at(-1).score,ranked.score);assert.equal(timeline.at(-1).finalValid,true);
});

test('breaking the chain resets only future multipliers while previously earned points remain',()=>{
 const {track,raw}=fixture({angle:s=>s===103.5?0:70}),timeline=Fitness.replayTimeline(raw,track,vehicle);
 const broken=timeline.findIndex(f=>f.s===103.5);
 assert.equal(timeline[broken].chainMultiplier,1);assert.equal(timeline[broken].delta,0);near(timeline[broken].score,timeline[broken-1].score);
 assert.ok(timeline[broken+1].chainMultiplier>1&&timeline[broken+1].chainMultiplier<1.02);
 for(let i=1;i<timeline.length;i++)assert.ok(timeline[i].score>=timeline[i-1].score);
});

test('ZONE strips use rendered start plus length, union overlaps, and split crossing frames exactly',()=>{
 const zones=[{s:17.3,length:3.6},{startS:19.4,endS:25.7}],{track,raw}=fixture({zones,step:1.7});
 assert.deepEqual(Score.zones(track),[{start:17.3,end:25.7}]);
 const ranked=Fitness.rank(vehicle,track,raw),expected=integral(17.3-2.5,25.7-2.5);
 near(ranked.drift.parts.zone,expected);near(ranked.score,370+expected);
 const fine=fixture({zones,step:.25});near(Fitness.rank(vehicle,fine.track,fine.raw).score,ranked.score);
 const timeline=Fitness.replayTimeline(ranked,track,vehicle);
 assert.equal(timeline.find(f=>f.s>12&&f.s<16).zoneMultiplier,1,'strip is not centred around s');
 assert.ok(timeline.some(f=>f.s>=17.3&&f.s<25.7&&f.zoneMultiplier===2));
});

test('a valid finishing sample beyond the timing coordinate credits only the last mapped metres',()=>{
 const f=fixture({length:202.5}),tail=f.raw.frames.at(-1);tail.s+=.4;tail.x+=.4;tail.time+=.4/25;
 near(Fitness.rank(vehicle,f.track,f.raw).score,370);
});

test('stationary time, repeated progress and low-speed launch cannot build score or multiplier',()=>{
 const {track}=fixture(),a=new Score.Accumulator(track),frame=(s,time,{x=s,speed=25,beta=70*D}={})=>({s,time,x,y:0,vx:speed,vy:0,speed,beta,status:'running'});
 let previous=frame(2.5,0);a.step(previous,null,{referenceSpeed:25});
 for(const f of [frame(3.5,.04),frame(3.5,.08,{x:4}),frame(3,.12),frame(3.5,.16),frame(4.5,.20)]){a.step(f,previous,{referenceSpeed:25});previous=f;}
 near(a.summary().scoredDistance,2);assert.ok(a.summary().score<2.1);
 const slow=fixture({speed:2}),ranked=Fitness.rank(vehicle,slow.track,slow.raw);assert.equal(ranked.score,0);assert.equal(ranked.drift.scoring.maxMultiplier,1);
});

test('prepared pace prevents slow drift farming and remains fixed during replay and prefix inspection',()=>{
 const reference=fixture(),slow=fixture({speed:8,angle:70});
 const ranked=Fitness.rank(vehicle,slow.track,slow.raw,slow.raw.frames,{reference:reference.raw.frames});
 assert.equal(ranked.score,0);assert.ok(ranked.drift.referencePace);assert.equal(Fitness.replayTimeline(ranked,slow.track,vehicle).at(-1).score,0);
 const normal=Fitness.rank(vehicle,reference.track,reference.raw,reference.raw.frames,{reference:reference.raw.frames});
 const all=Fitness.replayTimeline(normal,reference.track,vehicle),cut=normal.frames.slice(0,75);
 const prefix=Fitness.replayTimeline({...normal,status:'running',valid:false,frames:cut},reference.track,vehicle);
 for(let i=0;i<prefix.length;i++){near(prefix[i].score,all[i].score);near(prefix[i].chainMultiplier,all[i].chainMultiplier);}
 assert.equal(prefix.at(-1).provisional,true);
});

test('sustained actual speed stays a full-course basis even outside legacy regions or after restarting a slide',()=>{
 const reference=fixture({speed:15,angle:0}),raw=fixture({speed:s=>s<60?25:40/3.6,angle:s=>s>=80&&s<90?0:55});
 const ranked=Fitness.rank(vehicle,raw.track,raw.raw,raw.raw.frames,{reference:reference.raw.frames});
 const timeline=Fitness.replayTimeline(ranked,raw.track,vehicle),slow=timeline.filter(f=>f.s>61);
 assert.ok(timeline.find(f=>f.s>30).score>0);
 for(const frame of slow){assert.equal(frame.delta,0);assert.equal(frame.chainMultiplier,1);assert.ok(frame.referenceSpeed>=25);}
 near(timeline.at(-1).score,timeline.find(f=>f.s>61).score);
 const planned=fixture({speed:s=>s<60?25:15,angle:s=>s<70?0:55});
 const fair=Fitness.rank(vehicle,planned.track,planned.raw,planned.raw.frames,{reference:reference.raw.frames});
 assert.ok(fair.score>0,'ordinary braking before the first sustained drift never fixes the earlier straight peak');
});

test('only a distinct later physical corner after sustained grip recovery can establish a slower speed basis',()=>{
 const corners=[{id:'first',cornerStart:20},{id:'second',cornerStart:100}];
 const reference=fixture({speed:15,angle:0,length:130}),scenario=fixture({length:130,step:.25,speed:s=>s<50?25:12,angle:s=>s>=45&&s<100?0:35});
 const score=(selected,raw=scenario.raw)=>{const a=new Score.Accumulator(scenario.track,{corners:selected,referencePace:Score.paceProfile(reference.track,reference.raw.frames)}),rows=[];let previous=null;for(const frame of raw.frames){rows.push(a.step(frame,previous));previous=frame;}return rows;};
 const rows=score(corners),at=scenario.raw.frames.findIndex(f=>f.s>=100);
 assert.equal(rows[at].referenceReset,true);near(rows[at].referenceSpeed,12);assert.ok(rows[at+1].delta>0);
 const same=score([corners[0]]);assert.equal(same[at].referenceReset,false);assert.ok(same[at].referenceSpeed>=25);assert.equal(same[at+1].delta,0);
 const short=fixture({length:130,step:.25,speed:s=>s<95?25:12,angle:s=>s>=95&&s<100?0:35});
 const insufficient=score(corners,short.raw),entry=short.raw.frames.findIndex(f=>f.s>=100);
 assert.equal(insufficient[entry].referenceReset,false);assert.ok(insufficient[entry].referenceSpeed>=25);
 const continuing=fixture({length:130,step:.25,speed:s=>s<50?25:12,angle:35}),connected=score(corners,continuing.raw);
 assert.equal(connected[at].referenceReset,false);assert.ok(connected[at].referenceSpeed>=25,'entering another corner during the same drift cannot erase its speed loss');
 const early=fixture({length:130,step:.25,speed:s=>s<50?25:12,angle:s=>s>=45&&s<90?0:35}),earlyRows=score(corners,early.raw);
 assert.equal(earlyRows[at].referenceReset,true);near(earlyRows[at].referenceSpeed,12);assert.ok(earlyRows[at+1].delta>0,'qualified grip recovery permits starting the next drift before its physical corner');
 const launch=fixture({length:130,step:.25,speed:s=>s<50?25:12,angle:s=>s<18||s>=45&&s<90?0:35}),launchRows=score(corners,launch.raw);
 assert.equal(launchRows[at].referenceReset,true);near(launchRows[at].referenceSpeed,12);assert.ok(launchRows[at+1].delta>0,'initial grip launch cannot leave a stale recovery token ahead of the first physical corner');
 const repeatedRecovery=fixture({length:130,step:.25,speed:s=>s<70?25:12,angle:s=>s>=30&&s<50||s>=70&&s<90?0:35}),recoveredAgain=score(corners,repeatedRecovery.raw);
 assert.equal(recoveredAgain[at].referenceReset,true,'latest qualified recovery defines the next corner entry');near(recoveredAgain[at].referenceSpeed,12);
 const earlyOverspeed=fixture({length:130,step:.25,speed:s=>s<50||s>=90&&s<96?25:12,angle:s=>s>=45&&s<90?0:35}),earlyFastRows=score(corners,earlyOverspeed.raw);
 assert.equal(earlyFastRows[at].referenceReset,true);near(earlyFastRows[at].referenceSpeed,25);assert.equal(earlyFastRows[at+1].delta,0,'a new corner never hides speed lost in its own early drift entry');
 const fragmented=fixture({length:130,step:.25,speed:s=>s<50?25:12,angle:s=>s>=90&&s<100?0:35});
 const gap=fragmented.raw.frames.findIndex(f=>f.s===95);fragmented.raw.frames[gap].time+=.15;
 const fragments=score(corners,fragmented.raw);assert.equal(fragments[at].referenceReset,false,'disconnected short grip fragments do not qualify as sustained recovery');near(fragments[at].referenceSpeed,25);
});

test('only one short legitimate opposite-corner transition preserves a multiplier without earning or charging it',()=>{
 const {track}=fixture(),link={id:'opposite',fromSign:1,toSign:-1,straightStart:15,straightEnd:35};
 const run=angles=>{const a=new Score.Accumulator(track,{links:[link]}),rows=[];let previous=null;
  for(let i=0;i<angles.length;i++){const beta=angles[i]*D,s=12.5+i*.5,f={s,time:i*.025,x:s,y:0,vx:20,vy:0,speed:20,beta,status:'running'};rows.push(a.step(f,previous,{referenceSpeed:20}));previous=f;}return rows;};
 const rows=run([-12,-12,-12,-12,-12,-12,-9,-6,-3,0,3,6,9,12,12]);
 const before=rows[5];for(let i=6;i<=12;i++){assert.equal(rows[i].transitioning,true);assert.equal(rows[i].delta,0);near(rows[i].chainMultiplier,before.chainMultiplier);}
 assert.ok(rows[13].chainMultiplier>before.chainMultiplier);assert.equal(rows[13].chainReset,false);
 const repeated=run([-12,-12,-12,-12,-12,-12,-9,-6,-3,0,3,6,9,12,9,6,3,0,-3,-6,-9,-12]);
 assert.equal(repeated[14].chainMultiplier,1,'repeated weaving does not preserve the same link');
 const long=run([-12,-12,-12,-12,-12,-12,...Array(20).fill(0)]);assert.equal(long.at(-1).chainMultiplier,1);
});

test('physical corners and legitimate transitions outside the old judged range participate in full-course scoring',()=>{
 const scenario=fixture({length:150,step:.25,speed:s=>s<50?25:12,angle:s=>s<18||s>=45&&s<90?0:35});
 const track={...scenario.track,judgedStart:18,judgedEnd:50,sample:s=>({s,x:s,y:0,heading:0,curvature:s>=20&&s<=45?.02:s>=100&&s<=125?-.02:0})};
 const regional=Fitness.apexZones(track),whole=Fitness.apexZones(track,true);
 assert.equal(regional.length,1);assert.equal(whole.length,2);assert.equal(Fitness.straightLinks(track).length,0);assert.equal(Fitness.straightLinks(track,true).length,1);
 assert.equal(Fitness.apexZones(track),regional,'whole-course inference does not overwrite legacy diagnostic caches');
 const reference=fixture({length:150,speed:15,angle:0}),ranked=Fitness.rank(vehicle,track,scenario.raw,scenario.raw.frames,{reference:reference.raw.frames});
 const rows=Fitness.replayTimeline(ranked,track,vehicle),entry=rows.findIndex(f=>f.s>=whole[1].cornerStart);
 assert.equal(rows[entry].referenceReset,true);near(rows[entry].referenceSpeed,12);assert.ok(rows[entry+1].delta>0);
 const connected=fixture({length:150,step:.25,speed:20,angle:s=>s<65?-12:s>68?12:-12+8*(s-65)});
 const connectedRows=Fitness.replayTimeline(connected.raw,track,vehicle),transition=connectedRows.filter(f=>f.transitioning);
 assert.ok(transition.length>0,'the actual full-course accumulator receives links outside the old judged range');
 for(const row of transition){assert.equal(row.delta,0);assert.ok(row.chainMultiplier>1);near(row.chainMultiplier,transition[0].chainMultiplier);}
 const after=connectedRows.find(f=>f.s>68);assert.ok(after.chainMultiplier>transition[0].chainMultiplier);assert.equal(after.chainReset,false);
});

test('a future failure preserves prefix earnings but invalidates the entire final score and its parts',()=>{
 const f=fixture({zones:[{s:70,length:20}]}),ranked=Fitness.rank(vehicle,f.track,f.raw),normal=Fitness.replayTimeline(ranked,f.track,vehicle);
 const failed={...ranked,status:'offtrack',valid:false,frames:ranked.frames.map((x,i)=>i===ranked.frames.length-1?{...x,status:'offtrack'}:x)};
 const timeline=Fitness.replayTimeline(failed,f.track,vehicle),final=Fitness.rank(vehicle,f.track,failed);
 for(let i=0;i<timeline.length-1;i++)near(timeline[i].score,normal[i].score);
 assert.equal(timeline.at(-1).score,0);assert.equal(final.score,0);assert.deepEqual(timeline.at(-1).parts,{base:0,continuity:0,zone:0});
 assert.ok(timeline.at(-1).delta<0);assert.equal(timeline.at(-1).finalValid,false);
});
