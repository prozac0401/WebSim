'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Analysis=require('./failure-analysis.js');
const DEG=Math.PI/180,vehicle={physics:{maxSteer:.6,steerRate:3,gripCoefficient:1}};
const zones=[
 {start:15,cornerStart:30,apex:65,exit:100,end:115,sign:1},
 {start:110,cornerStart:120,apex:160,exit:200,end:215,sign:-1}
];
function course(curvature=s=>s>=30&&s<=100?.01:s>=120&&s<=200?-.01:0){
 const points=[];let x=0,y=0,heading=0;
 for(let s=0;s<=250;s+=.25){points.push({x,y,heading});const k=curvature(s+.125);x+=.25*Math.cos(heading+k*.125);y+=.25*Math.sin(heading+k*.125);heading+=k*.25;}
 return {length:250,width:12,sample(s){const i=Math.max(0,Math.min(points.length-1,Math.round(s*4)));return {...points[i],curvature:curvature(s),widthLeft:6,widthRight:6};}};
}
const track=course(),value=(x,s)=>typeof x==='function'?x(s):x;
function replay({road=track,end=190,speed=20,pathError=0,headingError=0,heading=null,beta=35*DEG,yawRate=0,steer=0,correction,targetSlip,predictedSlip,valid=false}={}){
 const frames=[];
 for(let s=0;s<=end;s++){
  const r=road.sample(s),error=value(pathError,s),h=heading?heading(s):r.heading+value(headingError,s),b=value(beta,s);
  frames.push({time:s/speed,s,x:r.x-Math.sin(r.heading)*error,y:r.y+Math.cos(r.heading)*error,vx:speed*Math.cos(h),vy:speed*Math.sin(h),yaw:h-b,
   pathError:error,r:value(yawRate,s),steer:value(steer,s),...(correction===undefined?{}:{driverSteerCorrection:value(correction,s)}),
   ...(targetSlip===undefined?{}:{targetSlip:value(targetSlip,s)}),...(predictedSlip===undefined?{}:{predictedSlip:value(predictedSlip,s)})});
 }
 return {valid,status:valid?'finished':'offtrack',reason:valid?null:'front tire left road',time:frames.at(-1).time,frames};
}
const analyze=(r,options={})=>Analysis.analyze(vehicle,track,r,{zones,...options});
const kinds=a=>a.hypotheses.map(h=>h.kind);
function divergent(options={}){return replay({pathError:s=>s<75?0:.06*(s-75),headingError:s=>s<75?0:.2,...options});}

test('valid high-angle driving is never diagnosed as a failure',()=>{
 assert.equal(analyze(replay({valid:true,beta:68*DEG,yawRate:1})),null);
});

test('a fabricated failure on a tracked high-angle arc has no attributed origin',()=>{
 const a=analyze(replay({beta:68*DEG,yawRate:1}));
 assert.equal(a.kind,'unresolved');assert.equal(a.origin,null);assert.equal(a.window,null);assert.deepEqual(a.hypotheses,[]);assert.deepEqual(a.recommendedFamilies,[]);
});

test('normal opposite-corner transition and body yaw sign alone do not imply wrong-way trajectory',()=>{
 const a=analyze(replay({beta:s=>s<110?-35*DEG:s>130?35*DEG:(s-120)*3.5*DEG,yawRate:1}));
 assert.equal(a.kind,'unresolved');assert.equal(a.origin,null);
});

test('earliest unrecovered precursor may begin in the previous corner and includes preparation',()=>{
 const a=analyze(divergent());
 assert.equal(a.kind,'trajectory-divergence');assert.ok(a.origin.s>=75&&a.origin.s<100);assert.equal(a.origin.zoneIndex,0);
 assert.equal(a.precedingZoneIndex,0);assert.ok(a.window.startS<a.origin.s);assert.ok(a.window.startTime<a.origin.time);
 assert.equal(a.window.endS,190);assert.ok(kinds(a).includes('prior-drift-residual'));assert.ok(a.recommendedFamilies.includes('timing'));
 assert.ok(a.evidence.every(e=>typeof e.value!=='number'||Number.isFinite(e.value)));
 assert.ok(a.hypotheses.every(h=>['low','medium'].includes(h.confidence)));
});

test('a recovered earlier excursion is not blamed for a separate later departure',()=>{
 const a=analyze(replay({pathError:s=>s>=50&&s<70?2:s>=150?(s-150)*.1:0,headingError:s=>s>=50&&s<70||s>=150?.2:0}));
 assert.ok(a.origin.s>=150);assert.equal(a.origin.zoneIndex,1);assert.equal(a.precedingZoneIndex,undefined);
 assert.ok(!kinds(a).includes('prior-drift-residual'));
});

test('slip appearing only in the final corner is not described as inherited previous drift',()=>{
 const a=analyze(divergent({beta:s=>s<120?0:35*DEG}));
 assert.equal(a.origin.zoneIndex,0);assert.ok(!kinds(a).includes('prior-drift-residual'));
});

test('persistent actual opposite trajectory after a reverse corner produces a qualified timing hypothesis',()=>{
 const anchor=track.sample(140).heading;
 const a=analyze(divergent({heading:s=>s<140?track.sample(s).heading+.2:anchor+.2+(s-140)*.012}));
 assert.ok(kinds(a).includes('opposite-turn-persistence'));assert.equal(a.precedingZoneIndex,0);
 const e=a.evidence.find(e=>e.label==='코너 반대 방향으로 궤적 회전');assert.ok(e.value>=.35);
});

test('actual opposite trajectory also diagnoses the first corner without inventing a preceding drift',()=>{
 const a=analyze(replay({end:95,pathError:s=>s<50?0:(s-50)*.1,heading:s=>s<50?track.sample(s).heading:track.sample(50).heading-(s-50)*.01}));
 assert.ok(kinds(a).includes('opposite-trajectory-turn'));assert.ok(!kinds(a).includes('prior-drift-residual'));
 assert.equal(a.precedingZoneIndex,undefined);
});

test('actual opposite trajectory diagnoses a same-sign following corner',()=>{
 const sameZones=zones.map(z=>({...z,sign:1})),road=course(s=>s>=30&&s<=100||s>=120&&s<=200?.01:0);
 const r=replay({road,pathError:s=>s<145?0:(s-145)*.1,heading:s=>s<145?road.sample(s).heading:road.sample(145).heading-(s-145)*.01});
 const a=Analysis.analyze(vehicle,road,r,{zones:sameZones});
 assert.ok(kinds(a).includes('opposite-trajectory-turn'));assert.ok(!kinds(a).includes('opposite-turn-persistence'));
});

test('a brief feint or normal low-angle transition does not claim sustained opposite travel',()=>{
 const a=analyze(divergent({heading:s=>s>=150&&s<=153?track.sample(150).heading+(s-150)*.02:track.sample(s).heading+.2}));
 assert.ok(!kinds(a).includes('opposite-turn-persistence'));assert.ok(!kinds(a).includes('opposite-trajectory-turn'));
});

test('observed steering limits are separate from unproven insufficient countersteer',()=>{
 const a=analyze(divergent({steer:.6,correction:0,targetSlip:0,predictedSlip:.5}));
 assert.ok(kinds(a).includes('control-saturation'));assert.ok(!kinds(a).includes('counter-response'));
 const b=analyze(divergent({steer:-.2}));assert.ok(!kinds(b).includes('counter-response'),'raw steering sign is not enough');
 const c=analyze(divergent({steer:.2,correction:0,targetSlip:0,predictedSlip:.5}));assert.ok(kinds(c).includes('counter-response'));
});

test('curvature and speed can suggest nominal demand but never prove overspeed',()=>{
 const a=analyze(divergent({speed:40})),h=a.hypotheses.find(h=>h.kind==='speed-demand');assert.ok(h);assert.equal(h.confidence,'low');assert.match(h.summary,/확정할 수 없습니다/);
 assert.ok(a.recommendedFamilies.includes('entry-speed'));assert.ok(a.speedPreparation.requiredDistanceM>0);
 assert.ok(a.speedPreparation.targetSpeed<a.speedPreparation.observedSpeed);
 assert.ok(a.window.startS<=a.speedPreparation.brakingStartS);assert.ok(a.window.startS<a.origin.s,'speed repair searches before the already-visible path error');
 const straight=course(()=>0),b=Analysis.analyze(vehicle,straight,replay({road:straight,speed:40,pathError:s=>s<75?0:(s-75)*.1,headingError:.2}),{zones:[]});
 assert.ok(!kinds(b).includes('speed-demand'));
 const c=Analysis.analyze({},track,divergent({speed:40}),{zones});assert.ok(!kinds(c).includes('speed-demand'));
});

test('progressive slip growth with body rotation is distinct from a stable large slip angle',()=>{
 const a=analyze(replay({end:110,beta:s=>s<60?40*DEG:(40+(s-60)*.8)*DEG,yawRate:1}));
 assert.equal(a.kind,'spin-development');assert.ok(a.origin.s>60);assert.ok(!kinds(a).includes('opposite-trajectory-turn'));
});

test('normal high-angle initiation below the spin margin is not diagnosed as developing spin',()=>{
 const a=analyze(replay({end:110,beta:s=>s<60?50*DEG:(50+(s-60)*.36)*DEG,targetSlip:68*DEG,yawRate:1}));
 assert.equal(a.kind,'unresolved');assert.equal(a.origin,null);
});

test('missing telemetry and minimal tracks return unresolved safely',()=>{
 assert.equal(analyze({valid:false,status:'offtrack',frames:[]}),null);
 const r=divergent();assert.equal(Analysis.analyze(vehicle,{sample:()=>({})},r,{zones}).kind,'unresolved');
 for(const f of r.frames)delete f.vy;assert.equal(analyze(r).kind,'unresolved');
 assert.doesNotThrow(()=>Analysis.analyze(vehicle,{length:250,sample(){throw Error('no sample');}},divergent(),{zones}));
});

test('a large telemetry gap breaks attribution to an earlier episode',()=>{
 const r=divergent();r.frames=r.frames.filter(f=>f.s<120||f.s>150);
 const a=analyze(r);assert.ok(a.origin.s>150);assert.equal(a.origin.zoneIndex,1);assert.ok(!kinds(a).includes('prior-drift-residual'));
});

test('analysis keeps inputs immutable and samples each frame only once with supplied zones',()=>{
 const r=divergent(),before=JSON.stringify(r);for(const f of r.frames)Object.freeze(f);Object.freeze(r.frames);Object.freeze(r);
 let samples=0;const road={...track,sample(s){samples++;return track.sample(s);}};
 Analysis.analyze(Object.freeze(vehicle),road,r,{zones:Object.freeze(zones)});
 assert.equal(JSON.stringify(r),before);assert.equal(samples,r.frames.length);
});

test('a fixed real failed physics replay yields bounded observed precursor evidence',()=>{
 const P=require('./physics.js'),G=require('./genome.js'),C=require('./catalog.js'),T=require('./track.js');
 const v=C.get(),t=T.create(),gene=G.create();
 for(let i=0;i<G.KNOTS;i++){gene[i*G.STRIDE+G.CHANNELS.steer]=v.physics.maxSteer;gene[i*G.STRIDE+G.CHANNELS.throttle]=1;gene[i*G.STRIDE+G.CHANNELS.targetSlip]=.4;}
 const r=P.evaluateGene(v,t,gene);assert.equal(r.valid,false);assert.equal(r.status,'offtrack');
 const a=Analysis.analyze(v,t,r);assert.ok(a.origin);assert.ok(a.origin.time<r.frames.at(-1).time);assert.ok(a.origin.s<r.frames.at(-1).s);
 assert.ok(a.window.startS<=a.origin.s);assert.ok(a.window.endTime<=r.frames.at(-1).time);assert.equal(a.failure.reason,r.reason);
 assert.ok(a.evidence.length>0);assert.ok(a.evidence.every(e=>typeof e.value!=='number'||Number.isFinite(e.value)));
});

function stoppedReplay({end=7,brake=.5,correction=-.05,requestedGear=2,rpm=750,status='timeout',speedAt=null}={}){
 const frames=[];let s=40;
 for(let i=0;i<=Math.round(end/.05);i++){
  const time=i*.05,speed=speedAt?speedAt(time):time<1?20-10*time:time<3?10+5*(time-1):Math.max(0,20-10*(time-3));
  if(i)s+=speed*.05;
  const road=track.sample(s);
  frames.push({time,s,x:road.x,y:road.y,vx:speed*Math.cos(road.heading),vy:speed*Math.sin(road.heading),yaw:road.heading,
   brake:time>=3?value(brake,time):0,throttle:.2,driverThrottleCorrection:value(correction,time),gear:2,requestedGear,rpm});
 }
 return {valid:false,status,reason:status==='timeout'?'주행 정지':status,time:frames.at(-1).time,frames};
}
const analyzeStop=(r,physics={idleRPM:750})=>Analysis.analyze({physics:{...vehicle.physics,...physics}},track,r,{zones});

test('a stopped timeout identifies the latest deceleration and supported pedal and gear observations',()=>{
 const r=stoppedReplay(),before=JSON.stringify(r),a=analyzeStop(r);
 assert.equal(a.kind,'sustained-stop');assert.ok(Math.abs(a.origin.time-3)<.051,'earlier recovered braking is not attributed');
 assert.ok(a.origin.s<a.failure.s);assert.equal(a.window.startTime,a.origin.time);assert.equal(a.window.endTime,r.time);
 assert.deepEqual(kinds(a),['brake-held-stop','throttle-suppressed-stop','held-gear-low-rpm']);
 assert.deepEqual(a.recommendedFamilies,['brake-release','timing','power']);assert.ok(!a.recommendedFamilies.includes('entry-speed'));
 assert.ok(a.evidence.some(e=>e.label==='정지 중 제동 입력 유지'&&e.value>=1.9));
 assert.ok(a.hypotheses.every(h=>['low','medium'].includes(h.confidence)&&/확정|단정/.test(h.summary)));
 assert.ok(a.evidence.every(e=>Number.isFinite(e.value)));assert.equal(JSON.stringify(r),before);
});

test('a constant-speed approach ends at the observed deceleration origin instead of launch',()=>{
 const a=analyzeStop(stoppedReplay({end:14,speedAt:time=>time<=10?10:Math.max(0,10-5*(time-10))}));
 assert.equal(a.kind,'sustained-stop');assert.equal(a.origin.time,10);assert.equal(a.window.startTime,10);
 const gearOnly=analyzeStop(stoppedReplay({brake:0,correction:0}));
 assert.deepEqual(kinds(gearOnly),['held-gear-low-rpm']);assert.deepEqual(gearOnly.recommendedFamilies,[],'gear remains an observation without an implemented repair family');
});

test('stopping diagnosis requires final sustained low speed and continuous telemetry',()=>{
 assert.notEqual(analyzeStop(stoppedReplay({end:5.2})).kind,'sustained-stop');
 assert.notEqual(analyzeStop(stoppedReplay({status:'offtrack'})).kind,'sustained-stop');
 const gap=stoppedReplay();gap.frames=gap.frames.filter(f=>f.time<5.5||f.time>6.6);
 assert.notEqual(analyzeStop(gap).kind,'sustained-stop','a gap cannot bridge the observed stop duration');
 const decelGap=stoppedReplay();decelGap.frames=decelGap.frames.filter(f=>f.time<4||f.time>=5);
 const a=analyzeStop(decelGap);assert.equal(a.kind,'sustained-stop');assert.ok(a.origin.time>=5,'missing deceleration cannot be invented');
});

test('missing or brief pedal data, auto gear and non-idle RPM do not invent causes',()=>{
 const r=stoppedReplay({brake:t=>Math.round(t*20)%4===0?.5:0,correction:0,requestedGear:0});
 const a=analyzeStop(r);assert.equal(a.kind,'sustained-stop');assert.deepEqual(a.hypotheses,[]);assert.deepEqual(a.recommendedFamilies,[]);
 const b=analyzeStop(stoppedReplay({brake:0,correction:0,rpm:2500}));assert.ok(!kinds(b).includes('held-gear-low-rpm'));
 const c=stoppedReplay();for(const f of c.frames){delete f.brake;delete f.driverThrottleCorrection;delete f.rpm;}
 assert.deepEqual(analyzeStop(c).hypotheses,[]);
 const electric=analyzeStop(stoppedReplay({brake:0,correction:0}),{electric:true,idleRPM:750});assert.deepEqual(electric.hypotheses,[]);
});
