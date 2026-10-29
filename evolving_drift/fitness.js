/* Rank continuous sideways apex arcs with speed retention. Powered exits remain
 * diagnostic telemetry, never a completion tier that overrides this objective. */
(function(root){
'use strict';
const DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),cache=new WeakMap();
const CourseScoring=root.DriftCourseScoring||(typeof require==='function'?require('./course-scoring.js'):null);
function exitZones(track){
 if(cache.has(track))return cache.get(track);const arcs=[];let run=null;
 const curvature=s=>[-4,-2,0,2,4].reduce((n,d)=>n+(track.sample(clamp(s+d,0,track.length)).curvature||0),0)/5;
 const close=()=>{if(run&&run.end-run.start>=10&&Math.abs(run.turn)>=.15)arcs.push(run);run=null;};
 for(let s=0;s<=track.length;s++){const c=curvature(s),sign=Math.abs(c)>.004?Math.sign(c):0;if(run&&((sign&&sign!==run.sign)||s-run.end>6))close();if(sign){if(!run)run={start:s,end:s,sign,turn:0};run.end=s;run.turn+=c;}}close();
 const zones=arcs.map((r,i)=>({...r,exit:r.end,end:Math.min(track.length-10,r.end+100,arcs[i+1]?.start??Infinity)})).filter(r=>r.start<=track.judgedEnd&&r.exit>=track.judgedStart&&r.end-r.exit>=15);
 const frozen=Object.freeze(zones.map(Object.freeze));cache.set(track,frozen);return frozen;
}
function inspectFrame(frame,previous,track,vehicle,zones=exitZones(track)){
 const p=vehicle.physics||vehicle,angle=Math.abs(frame.beta||0)/DEG,dt=previous?frame.time-previous.time:0;
 const progress=previous?frame.s-previous.s:0,ds=previous?Math.hypot(frame.x-previous.x,frame.y-previous.y):0;
 const rearForce=(frame.wheelForces?.[2]?.fx||0)+(frame.wheelForces?.[3]?.fx||0),forwardSpeed=frame.vx*Math.cos(frame.yaw)+frame.vy*Math.sin(frame.yaw);
 const zone=zones.find(z=>frame.s>=z.exit&&frame.s<=z.end),inScored=frame.s>=track.judgedStart&&frame.s<=track.judgedEnd||!!zone;
 const continuous=dt>0&&dt<.1,moving=progress>0&&ds>0&&ds<=Math.max(previous?.speed||0,frame.speed)*dt*1.2+.02;
 const conditions={area:inScored,angle:angle>=10&&angle<=55,speed:frame.speed>=8,throttle:frame.throttle>=.15,brake:frame.brake<=.03,propulsion:frame.rearTorque>0&&rearForce>p.massKg*.3&&rearForce*forwardSpeed>0,forward:continuous&&moving};
 const drifting=conditions.angle&&conditions.speed&&conditions.forward,drive=conditions.throttle&&conditions.brake&&conditions.propulsion;
 return {angle,dt,progress,distance:ds,rearForce,rearPower:rearForce*forwardSpeed,zone,inScored,continuous,conditions,drifting,drive,
  phase:inScored?(zone?'exit':'judged'):frame.s<track.judgedStart?'preparation':'recovery'};
}
function completedRun(raw){
 const run={...raw};for(const key of ['meanThrottle','meanAngle','meanRearForce','meanRearPowerW','meanRearSlip','counterFraction','meanRPM'])run[key]/=run.duration;
 run.distanceWeightedAngle/=run.distance;run.speedGain=run.exitSpeed-run.entrySpeed;
 run.success=run.anchored&&run.duration+1e-8>=2&&run.distance+1e-8>=30&&run.speedGain>=-1e-8;return run;
}
const angleQuality=r=>clamp((r.distanceWeightedAngle-10)/45,0,1);
const progressQuality=r=>Math.sqrt(clamp(r.distance/30,0,1)*clamp(r.duration/2,0,1))*clamp(1+r.speedGain/4,0,1)*(.8+.2*angleQuality(r));
function successfulParts(r){return {completion:60,distance:14*clamp((r.distance-30)/70,0,1),angle:16*angleQuality(r),speed:6*(r.distance/r.duration)/Math.hypot(r.distance/r.duration,12),acceleration:4*clamp(r.speedGain/10,0,1)};}
const sumParts=parts=>Object.values(parts).reduce((sum,value)=>sum+value,0);
function scoredState(runs,run,qualityDistance,exitQuality,styleScore){
 const candidates=run?[...runs,completedRun(run)]:runs;
 const best=candidates.filter(r=>r.anchored).sort((a,b)=>progressQuality(b)-progressQuality(a)||b.distance-a.distance)[0]||null;
 const qualifying=candidates.filter(r=>r.success).sort((a,b)=>sumParts(successfulParts(b))-sumParts(successfulParts(a))||b.distance-a.distance)[0]||null;
 const parts=qualifying?successfulParts(qualifying):{style:clamp(styleScore,0,100)/100,power:8*qualityDistance/(qualityDistance+40),exit:10*exitQuality/(exitQuality+20),continuity:40*(best?progressQuality(best):0)};
 return {potentialScore:sumParts(parts),parts,bestExit:qualifying||best,bestAttempt:best,qualified:!!qualifying};
}
function measurePower(result,track,vehicle,{trace=false}={}){
 const p=vehicle.physics||vehicle,frames=result.frames||[],zones=exitZones(track),runs=[],timeline=[];
 let episode=null,run=null,totalPowerDistance=0,qualityDistance=0,exitQuality=0,styleProxy=0,spinDetected=false,lastPotential=0;
 const close=()=>{if(run)runs.push(completedRun(run));run=null;};
 const finalStyle=result.styleScore??result.score??0;
 function emit(i,facts,anchored=false){
  if(!trace)return;const f=frames[i],last=i===frames.length-1,status=last?result.status:(f.status||'running');
  const style=last?finalStyle:Number.isFinite(f.scoreIntegral)?f.scoreIntegral/(track.judgedEnd-track.judgedStart)*100:styleProxy;
  const snapshot=scoredState(runs,run,qualityDistance,exitQuality,style),failed=spinDetected||status!=='running'&&status!=='finished'||last&&result.valid!==true;
  const score=failed?0:snapshot.potentialScore,delta=score-lastPotential;lastPotential=score;
  const estimatedStyle=!Number.isFinite(f.scoreIntegral)&&!last;
  const settlement=last&&!Number.isFinite(f.scoreIntegral)&&Object.prototype.hasOwnProperty.call(snapshot.parts,'style')
   &&Math.abs(clamp(finalStyle,0,100)-clamp(styleProxy,0,100))>1e-7&&Math.abs(delta)>1e-7;
  const earning=!failed&&!settlement&&facts.inScored&&delta>1e-7,conditions={...facts.conditions,corner:anchored};
  let reason;
  if(failed)reason=status==='spin'||spinDetected?'스핀 · 점수 무효':status==='offtrack'?'앞바퀴 이탈 · 점수 무효':status==='collision'?'차체 충돌 · 점수 무효':'완주 실패 · 점수 무효';
  else if(settlement)reason='완주 정산 · 보조 주행 점수 확정';
  else if(!facts.inScored)reason=facts.phase==='preparation'?'준비 구간 · 득점 없음':'회복·비채점 구간 · 득점 없음';
  else if(earning)reason=facts.drifting&&facts.drive?(anchored?'가속 탈출 · 거리와 유지 각도 반영':'가속 드리프트 · 구동 품질 반영'):'보조 주행 점수';
  else if(!conditions.forward)reason='전진 주행 필요';
  else if(!conditions.angle)reason='슬립각 10~55° 필요';
  else if(!conditions.speed)reason='속도 28.8km/h 이상 필요';
  else if(!conditions.brake)reason='제동 중 · 가속 탈출 중단';
  else if(!conditions.throttle)reason='가속 15% 이상 필요';
  else if(!conditions.propulsion)reason='실제 후륜 추진력 부족';
  else if(delta< -1e-7)reason='탈출 속도·유지 각도 변화로 점수 재평가';
  else reason='현재 최고 탈출 기록 유지';
  const exit=snapshot.bestExit;
  timeline.push({time:f.time,s:f.s,score,potentialScore:snapshot.potentialScore,delta,earning,provisional:!last,estimatedStyle,status,phase:facts.phase,reason,conditions,
   parts:snapshot.parts,qualified:snapshot.qualified&&!failed,finalValid:last&&result.valid===true&&!failed,
   exit:exit?{distance:exit.distance,duration:exit.duration,angle:exit.distanceWeightedAngle,entrySpeed:exit.entrySpeed,exitSpeed:exit.exitSpeed}:null});
 }
 if(frames.length){const first=frames[0],facts=inspectFrame(first,null,track,vehicle,zones);spinDetected=first.status==='spin'||first.speed>=3&&facts.angle>=75;emit(0,facts);}
 for(let i=1;i<frames.length;i++){
  const a=frames[i-1],b=frames[i],facts=inspectFrame(b,a,track,vehicle,zones),{dt,progress,distance:ds,angle,rearForce:rearFx,rearPower:power,zone,inScored,drifting,drive}=facts;
  if(b.status==='spin'||b.speed>=3&&angle>=75)spinDetected=true;
  if(!facts.continuous){close();episode=null;emit(i,facts);continue;}
  const sign=Math.sign(b.beta);if(!drifting||episode&&episode.sign!==sign)episode=null;
  if(drifting&&!episode)episode={start:a.s,sign,turns:new Map()};
  if(episode){const turn=Math.atan2(Math.sin(Math.atan2(b.vy,b.vx)-Math.atan2(a.vy,a.vx)),Math.cos(Math.atan2(b.vy,b.vx)-Math.atan2(a.vy,a.vx)));for(const z of zones)if(b.s>=z.start&&b.s<=z.exit)episode.turns.set(z.exit,(episode.turns.get(z.exit)||0)+turn);}
  const q=(angle>=10&&angle<=55?.2+.8*(angle-10)/45:0)*b.speed/Math.hypot(b.speed,12)*clamp(rearFx/(p.massKg*1.2),0,1)*clamp((.06-b.brake)/.06,0,1);
  if(inScored&&b.rearTorque>0&&b.throttle>=.1&&rearFx>0){qualityDistance+=Math.min(ds,Math.max(0,progress))*q;if(zone)exitQuality+=Math.min(ds,Math.max(0,progress))*q;}
  if(b.s>=track.judgedStart&&b.s<=track.judgedEnd)styleProxy+=Math.max(0,progress)*clamp((angle-2)/28,0,1)*clamp((85-angle)/30,0,1)*b.speed/Math.hypot(b.speed,12)/(track.judgedEnd-track.judgedStart)*100;
  const anchored=!!zone&&!!episode&&episode.start<=zone.exit-5&&(episode.turns.get(zone.exit)||0)*zone.sign>.10;
  if(drifting&&drive){totalPowerDistance+=ds;if(run&&(!zone||run.zoneExit!==zone.exit||run.sign!==sign))close();
   if(zone){if(!run)run={start:a.s,end:b.s,startTime:a.time,endTime:b.time,distance:0,duration:0,zoneExit:zone.exit,sign,anchored,entrySpeed:a.speed,exitSpeed:b.speed,minSpeed:b.speed,meanThrottle:0,meanAngle:0,distanceWeightedAngle:0,meanRearForce:0,meanRearPowerW:0,meanRearSlip:0,counterFraction:0,meanRPM:0,maxBrake:0};
    run.end=b.s;run.endTime=b.time;run.distance+=ds;run.duration+=dt;run.exitSpeed=b.speed;run.minSpeed=Math.min(run.minSpeed,b.speed);run.meanThrottle+=b.throttle*dt;run.meanAngle+=angle*dt;run.distanceWeightedAngle+=angle*ds;run.meanRearForce+=rearFx*dt;run.meanRearPowerW+=power*dt;run.meanRearSlip+=((b.wheelSlip?.[2]||0)+(b.wheelSlip?.[3]||0))/2*dt;run.counterFraction+=((b.steer||0)*b.beta>0?dt:0);run.meanRPM+=(b.rpm||0)*dt;run.maxBrake=Math.max(run.maxBrake,b.brake);
   }
  }else close();
  emit(i,facts,anchored);
 }
 close();const scored=scoredState(runs,null,qualityDistance,exitQuality,finalStyle),completed=result.valid===true&&result.status==='finished'&&!spinDetected;
 const output={score:completed?scored.potentialScore:0,styleScore:finalStyle,totalPowerDistance,qualityDistance,exitQuality,bestExit:scored.bestExit,bestAttempt:scored.bestAttempt,success:completed&&scored.qualified,runs,zones,spinDetected};
 if(trace)output.timeline=timeline;return output;
}
const apexCache=new WeakMap(),courseApexCache=new WeakMap(),WEIGHTS=Object.freeze({sideways:35,connection:45,curve:15,propulsion:5});
const smooth01=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const slipQuality=beta=>clamp((Math.sin(Math.abs(beta))-Math.sin(2*DEG))/(Math.sin(70*DEG)-Math.sin(2*DEG)),0,1);
const speedQuality=(speed,reference)=>reference>0?smooth01((speed/reference-.7)/.25)*smooth01((speed-5)/7):0;
function apexZones(track,fullCourse=false){
 const cache=fullCourse?courseApexCache:apexCache;if(cache.has(track))return cache.get(track);
 const scoredStart=fullCourse?2.5:track.judgedStart,scoredEnd=fullCourse?track.length:track.judgedEnd;
 const arcs=[];let run=null;
 const curvature=s=>[-4,-2,0,2,4].reduce((n,d)=>n+(track.sample(clamp(s+d,0,track.length)).curvature||0),0)/5;
 const close=()=>{if(run&&run.exit-run.cornerStart>=10&&Math.abs(run.turn)>=.15)arcs.push({...run,apex:run.moment/run.weight});run=null;};
 for(let s=0;s<=track.length;s++){
  const c=curvature(s),sign=Math.abs(c)>.004?Math.sign(c):0;
  if(run&&((sign&&sign!==run.sign)||s-run.exit>6))close();
  if(sign){if(!run)run={cornerStart:s,exit:s,sign,turn:0,moment:0,weight:0};run.exit=s;run.turn+=c;run.moment+=s*Math.abs(c);run.weight+=Math.abs(c);}
 }close();
 // Geometric apex estimates, not surveyed clipping points. Include turns with
 // short exits too; the old powered-exit detector deliberately omitted them.
 const zones=arcs.map((a,i)=>{
  const start=Math.max(scoredStart,a.cornerStart-35,i?(arcs[i-1].exit+a.cornerStart)/2:0);
  const end=Math.min(fullCourse?track.length:track.length-10,a.exit+60,i<arcs.length-1?(a.exit+arcs[i+1].cornerStart)/2:track.length);
  return {id:'apex-'+i,start,cornerStart:a.cornerStart,apex:a.apex,exit:a.exit,end,referenceStart:Math.max(2.5,start-20),sign:a.sign,turn:a.turn,fitRadius:Math.max(6,Math.min(25,(a.exit-a.cornerStart)*.35))};
 }).filter(z=>z.apex>=scoredStart&&z.apex<=scoredEnd&&z.start<z.apex&&z.end>z.apex);
 const frozen=Object.freeze(zones.map(Object.freeze));cache.set(track,frozen);return frozen;
}
const linkCache=new WeakMap(),courseLinkCache=new WeakMap();
function straightLinks(track,fullCourse=false){
 const cache=fullCourse?courseLinkCache:linkCache;if(cache.has(track))return cache.get(track);
 const zones=apexZones(track,fullCourse),links=[];
 for(let i=0;i<zones.length-1;i++){
  const a=zones[i],b=zones[i+1];if(b.cornerStart-a.exit<3)continue;
  links.push(Object.freeze({id:'link-'+i,fromZoneId:a.id,toZoneId:b.id,start:a.apex,end:b.apex,straightStart:a.exit,straightEnd:b.cornerStart,
   fromSign:a.sign,toSign:b.sign,fromTurn:Math.min(.08,Math.abs(a.turn)*.1),toTurn:Math.min(.08,Math.abs(b.turn)*.1)}));
 }
 const frozen=Object.freeze(links);cache.set(track,frozen);return frozen;
}
function newLinkState(zone,refs){return {zone,preparedPace:refs[zone.id]||0,referenceSpeed:(refs[zone.id]||0)*.8,referenceFloor:(refs[zone.id]||0)*.8,referenceFixed:false,minimumSpeed:Infinity,exitSpeed:null,run:null,runs:[],lastS:-Infinity,previousHeading:null};}
function closeLink(state){if(state.run)state.runs.push(state.run);state.run=null;}
function advanceLink(state,a,f,moving,spinDetected){
 const z=state.zone;if(!a||!moving||spinDetected){closeLink(state);state.previousHeading=null;return 0;}
 const dt=f.time-a.time,progress=f.s-a.s,ds=Math.hypot(f.x-a.x,f.y-a.y),angle=Math.abs(f.beta||0)/DEG;
 // A road projection may advance faster on a valid inside line, but it
 // cannot teleport across a connecting straight in one physical sample.
 if(progress>Math.max(a.speed,f.speed)*dt*4+.05){closeLink(state);state.previousHeading=null;return 0;}
 if(!state.referenceFixed&&a.s<=z.straightStart&&f.s>=z.straightStart){
  const u=clamp((z.straightStart-a.s)/progress,0,1);state.referenceSpeed=Math.max(state.referenceFloor,a.speed+(f.speed-a.speed)*u);state.referenceFixed=true;
 }
 const speedAt=s=>a.speed+(f.speed-a.speed)*clamp((s-a.s)/progress,0,1),speedLo=Math.max(a.s,z.straightStart),speedHi=Math.min(f.s,z.straightEnd);
 // Straight links require continuity across the whole straight. Releasing
 // drift here must not hide the subsequent speed loss in the same section.
 if(speedHi>speedLo)state.minimumSpeed=Math.min(state.minimumSpeed,speedAt(speedLo),speedAt(speedHi));
 if(a.s<z.straightEnd&&f.s>=z.straightEnd)state.exitSpeed=speedAt(z.straightEnd);
 const lo=Math.max(a.s,z.start),hi=Math.min(f.s,z.end);if(!(hi>lo)){if(f.s>z.end)closeLink(state);return 0;}
 const fresh=Math.max(0,hi-Math.max(lo,state.lastS)),effective=Math.min(ds,progress)*fresh/progress;state.lastS=Math.max(state.lastS,hi);
 if(!(effective>0)){closeLink(state);return 0;}
 const heading=Math.atan2(f.y-a.y,f.x-a.x),turn=state.previousHeading===null?0:wrap(heading-state.previousHeading);state.previousHeading=heading;
 const sign=Math.sign(f.beta),from=-z.fromSign,to=-z.toSign,drifting=angle>=10&&angle<=70&&f.speed>=8;
 const low=angle<10&&f.speed>=8,opposite=from!==to;
 let run=state.run;
 if(!run){
  if(!drifting||sign!==from)return 0;
  const time=a.time+(lo-a.s)/progress*dt;
  run=state.run={start:lo,end:hi,startTime:time,endTime:f.time,distance:0,duration:0,progress:0,phase:'from',turnBefore:0,turnAfter:0,transitionDuration:0,transitionDistance:0,transitionStartTime:null,transitionStartDistance:0,exitSpeed:f.speed};
 }else{
  let valid=drifting&&(sign===(run.phase==='to'?to:from));
  if(opposite&&Math.abs(wrap((f.beta||0)-(a.beta||0)))/dt>4)valid=false;
  else if(low&&opposite&&run.phase!=='to'&&f.s>=z.straightStart&&f.s<=z.straightEnd){
   if(run.phase==='from'){run.phase='transition';run.transitionStartTime=a.time;run.transitionStartDistance=run.distance;}
   run.transitionDuration=f.time-run.transitionStartTime;run.transitionDistance=run.distance+ds*fresh/progress-run.transitionStartDistance;
   valid=run.transitionDuration<=.35+1e-9&&run.transitionDistance<=Math.min(8,(z.straightEnd-z.straightStart)*.25)+1e-9;
  }else if(drifting&&opposite&&run.phase==='transition'&&sign===to){
   run.transitionDuration=f.time-run.transitionStartTime;run.transitionDistance=run.distance+ds*fresh/progress-run.transitionStartDistance;
   valid=run.transitionDuration<=.35+1e-9&&run.transitionDistance<=Math.min(8,(z.straightEnd-z.straightStart)*.25)+1e-9;
   if(valid)run.phase='to';
  }else if(run.phase==='transition')valid=false;
  if(!valid){closeLink(state);return 0;}
 }
 run.end=hi;run.endTime=f.time;run.distance+=ds*fresh/progress;run.duration+=dt*fresh/progress;run.progress+=fresh;run.exitSpeed=f.speed;
 if(f.s>=z.start&&a.s<=z.straightStart)run.turnBefore+=turn*z.fromSign;
 if(f.s>=z.straightEnd&&a.s<=z.end)run.turnAfter+=turn*z.toSign;
 return drifting?effective:0;
}
function linkSnapshot(state){
 const z=state.zone,runs=state.run?[...state.runs,state.run]:state.runs;
 const described=runs.map(run=>{
  const coverage=clamp(run.progress/(z.end-z.start),0,1),retention=state.referenceSpeed>0?state.minimumSpeed/state.referenceSpeed:0;
  const speed=Number.isFinite(state.minimumSpeed)?speedQuality(state.minimumSpeed,state.referenceSpeed):0;
  const turning=Math.min(smooth01(run.turnBefore/z.fromTurn),smooth01(run.turnAfter/z.toTurn));
  const direction=z.fromSign===z.toSign||run.phase==='to';
  const complete=run.start<=z.start+1e-9&&run.end>=z.end-1e-9&&coverage>=1-1e-9&&turning>=1-1e-9&&direction&&retention>=.9;
  const quality=coverage*(.2+.8*turning)*speed;
  return {...z,startTime:run.startTime,endTime:run.endTime,distance:run.distance,duration:run.duration,coverage,complete,quality,
   entrySpeed:state.referenceSpeed,minSpeed:Number.isFinite(state.minimumSpeed)?state.minimumSpeed:0,exitSpeed:state.exitSpeed??run.exitSpeed,speedRetention:Number.isFinite(retention)?retention:0,speedScope:'straight-window',referenceScope:'straight-entry',preparedPace:state.preparedPace,referenceFloor:state.referenceFloor,
   transitionDuration:run.transitionDuration,transitionDistance:run.transitionDistance,score:WEIGHTS.connection*quality*connectionFactor(coverage)};
 });
 return described.sort((a,b)=>b.score-a.score||b.coverage-a.coverage)[0]||{...z,startTime:null,endTime:null,distance:0,duration:0,coverage:0,complete:false,quality:0,entrySpeed:state.referenceSpeed,minSpeed:0,exitSpeed:0,speedRetention:0,transitionDuration:0,transitionDistance:0,score:0};
}
function preparedPace(record,start,end){
 // A fixed distance-sampled lower quintile describes the verified corner or
 // straight pace. It ignores an isolated slow sample without confusing the
 // preceding acceleration/braking approach with feasible corner speed.
 if(record.length<2||!(end>start))return 0;
 const samples=[];let i=0;const step=Math.max(1,(end-start)/200);
 for(let s=start;s<=end+1e-8;s+=step){
  while(i<record.length-2&&record[i+1].s<s)i++;
  const a=record[i],b=record[i+1];if(!a||!b||![a.s,b.s,a.speed,b.speed].every(Number.isFinite)||a.s>s||b.s<s||b.s<=a.s)continue;
  samples.push(a.speed+(b.speed-a.speed)*(s-a.s)/(b.s-a.s));
 }
 if(!samples.length)return 0;samples.sort((a,b)=>a-b);return samples[Math.floor((samples.length-1)*.2)];
}
function referenceSpeeds(track,record=[]){
 const refs={};for(const z of apexZones(track))refs[z.id]=preparedPace(record,z.cornerStart,z.exit);
 for(const z of straightLinks(track))refs[z.id]=preparedPace(record,z.straightStart,z.straightEnd);
 return refs;
}
function advanceReference(state,a,f,moving){
 const z=state.zone;if(state.referenceFixed)return;
 const floor=state.referenceFloor,eligible=q=>q&&q.s>=state.referenceAllowedStart&&q.beta*z.sign<0&&Math.abs(q.beta)/DEG>=10&&Math.abs(q.beta)/DEG<=70&&q.speed>=Math.max(8,floor*.9);
 if(moving&&f.s<=z.cornerStart&&eligible(f)){
  if(!state.referenceRun){const origin=eligible(a)?a:f;state.referenceRun={s:origin.s,time:origin.time,peak:origin.speed,distance:0};}
  const run=state.referenceRun;run.peak=Math.max(run.peak,f.speed);run.distance+=Math.hypot(f.x-a.x,f.y-a.y);
  if(f.time-run.time>=.25-1e-9&&run.distance>=3){
   if(!state.earlyReference){state.referenceS=run.s;state.referenceTime=run.time;}
   // Once sustained drift is observed, its speed reference can only rise
   // until the core entry. Release/restart or later braking cannot lower it.
   state.earlyReference=Math.max(state.earlyReference,run.peak);
  }
 }else state.referenceRun=null;
 // The current short attempt has a provisional speed too, so its first few
 // metres are not lost solely because a faster car travels farther in .25 s.
 state.referenceSpeed=Math.max(floor,state.earlyReference,state.referenceRun?.peak||0);
 const atEntry=Math.abs(f.s-z.cornerStart)<=1e-9;
 if(atEntry||moving&&a.s<z.cornerStart&&f.s>=z.cornerStart){
  const u=atEntry?1:clamp((z.cornerStart-a.s)/(f.s-a.s),0,1),entry=atEntry?f.speed:a.speed+(f.speed-a.speed)*u;
  if(!state.earlyReference){state.referenceS=z.cornerStart;state.referenceTime=atEntry?f.time:a.time+(f.time-a.time)*u;}
  state.referenceSpeed=Math.max(floor,state.earlyReference,entry);state.referenceFixed=true;
 }
}
function newFit(){return {moments:[0,0,0,0,0],x:[0,0,0],y:[0,0,0],norm:0,origin:null,start:Infinity,end:-Infinity,count:0};}
function addFit(fit,u,x,y,weight){
 if(!fit.origin)fit.origin={x,y};x-=fit.origin.x;y-=fit.origin.y;
 let power=1;for(let k=0;k<5;k++){fit.moments[k]+=weight*power;if(k<3){fit.x[k]+=weight*power*x;fit.y[k]+=weight*power*y;}power*=u;}
 fit.norm+=weight*(x*x+y*y);fit.start=Math.min(fit.start,u);fit.end=Math.max(fit.end,u);fit.count++;
}
function solveFit(m,v){
 const rows=[[m[0],m[1],m[2],v[0]],[m[1],m[2],m[3],v[1]],[m[2],m[3],m[4],v[2]]];
 for(let k=0;k<3;k++){
  let pivot=k;for(let i=k+1;i<3;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
  if(Math.abs(rows[pivot][k])<1e-10*Math.max(1,m[0]))return null;
  [rows[k],rows[pivot]]=[rows[pivot],rows[k]];const d=rows[k][k];for(let j=k;j<4;j++)rows[k][j]/=d;
  for(let i=0;i<3;i++)if(i!==k){const a=rows[i][k];for(let j=k;j<4;j++)rows[i][j]-=a*rows[k][j];}
 }return rows.map(r=>r[3]);
}
function fitQuality(state){
 const fit=state.fit,z=state.zone;
 if(fit.count<6||(fit.end-fit.start)*z.fitRadius<8)return 0;
 const x=solveFit(fit.moments,fit.x),y=solveFit(fit.moments,fit.y);if(!x||!y)return 0;
 const residual=Math.max(0,fit.norm-x.reduce((n,v,i)=>n+v*fit.x[i],0)-y.reduce((n,v,i)=>n+v*fit.y[i],0));
 const rms=Math.sqrt(residual/fit.moments[0]),tolerance=Math.max(.3,z.fitRadius*.035);
 const coherence=state.absoluteTurn>1e-8?clamp(state.signedTurn/state.absoluteTurn,0,1):0;
 return 1/(1+(rms/tolerance)**2)*coherence;
}
function turnQuality(state){return smooth01(Math.max(0,state.signedTurn)/Math.min(.35,Math.abs(state.zone.turn)*.35));}
function retainedQuality(state){return Number.isFinite(state.minimumSpeed)?speedQuality(state.minimumSpeed,state.referenceSpeed):1;}
function connectionOf(run,state){
 const z=state.zone;
 const before=clamp((Math.min(run.end,z.apex)-Math.max(run.start,z.cornerStart))/Math.max(1e-9,z.apex-z.cornerStart),0,1);
 const after=clamp((Math.min(run.end,z.exit)-Math.max(run.start,z.apex))/Math.max(1e-9,z.exit-z.apex),0,1);
 const coverage=Math.min(before,after),requiredTurn=Math.min(.25,Math.abs(z.turn)*.25),turn=smooth01(run.coreTurn/requiredTurn);
 return {coverage,turn,before,after};
}
const connectionFactor=coverage=>.15+.85*coverage*coverage;
function describeRun(run,state){
 const z=state.zone,angle=run.distance>0?run.angleIntegral/run.distance:0,minSpeed=Math.min(run.minSpeed,state.minimumSpeed),retention=state.referenceSpeed>0?minSpeed/state.referenceSpeed:0;
 const link=connectionOf(run,state),bridge=link.coverage*link.turn;
 const curve=fitQuality(state)*turnQuality(state),coverage=run.creditedDistance/(z.end-z.start);
 const complete=link.coverage>=1-1e-9&&link.turn>=1-1e-9&&retention>=.9;
 return {zoneId:z.id,zoneExit:z.exit,start:run.start,end:run.end,startTime:run.startTime,endTime:run.endTime,distance:run.distance,duration:run.duration,
  initiationS:run.initiationS,initiationTime:run.initiationTime,startedBeforeStart:run.startedBeforeStart,
  distanceWeightedAngle:angle,entrySpeed:state.referenceSpeed,minSpeed,exitSpeed:run.exitSpeed,speedRetention:retention,speedScope:'apex-window',referenceScope:'core-entry-or-earlier-drift',referenceSource:state.earlyReference?'sustained-drift':state.referenceFixed?'core-entry':state.referenceRun?'provisional-drift':'prepared-core',referenceS:state.referenceS,referenceTime:state.referenceTime,preparedPace:state.preparedPace,referenceFloor:state.referenceFloor,curveQuality:curve,
  continuity:clamp(run.progress/(z.end-z.start),0,1),anchored:link.before>0&&link.after>0&&run.turn>.08,sign:run.sign,
  connectionCoverage:link.coverage,complete,
  score:(WEIGHTS.sideways*coverage*turnQuality(state)+WEIGHTS.connection*bridge*turnQuality(state)+WEIGHTS.curve*coverage*curve+WEIGHTS.propulsion*run.propelledDistance/(z.end-z.start)*turnQuality(state))*retainedQuality(state)*connectionFactor(link.coverage),bridge};
}
function arcSnapshot(state){
 const z=state.zone,length=z.end-z.start,turn=turnQuality(state),curve=fitQuality(state)*turn;
 const runs=state.run?[...state.runs,state.run]:state.runs,described=runs.map(r=>describeRun(r,state));
 const bestArc=described.sort((a,b)=>b.score-a.score||b.distance-a.distance)[0]||null;
 const bridge=Math.max(0,...described.map(r=>r.bridge)),connectionCoverage=Math.max(0,...described.map(r=>r.connectionCoverage));
 const coverage=clamp(state.credit/length,0,1);
 const parts={sideways:WEIGHTS.sideways*coverage*turn,connection:WEIGHTS.connection*bridge*turn,
  curve:WEIGHTS.curve*coverage*curve,propulsion:WEIGHTS.propulsion*clamp(state.propulsion/length,0,1)*turn};
 for(const key of Object.keys(parts))parts[key]*=retainedQuality(state)*connectionFactor(connectionCoverage);
 return {zoneId:z.id,parts,score:sumParts(parts),bestArc,connectionCoverage,complete:described.some(r=>r.complete),curveQuality:curve,sidewaysDistance:state.sidewaysDistance,
  sustainedAngle:state.angleDistance>0?state.angleIntegral/state.angleDistance:0,coveredDistance:state.coveredDistance};
}
function objectiveSnapshot(states,linkStates=[],regional=false){
 const arcs=states.map(arcSnapshot),parts={sideways:0,connection:0,curve:0,propulsion:0},count=Math.max(1,arcs.length);
 for(const arc of arcs)for(const key of Object.keys(parts))parts[key]+=arc.parts[key]/count;
 const links=linkStates.map(linkSnapshot),linkCount=links.length,sequenceCoverage=linkCount?links.reduce((n,l)=>n+l.quality,0)/linkCount:1;
 if(linkCount)parts.connection=(parts.connection*arcs.length+links.reduce((n,l)=>n+l.score,0))/Math.max(1,arcs.length+linkCount);
 const sequenceFactor=regional||!linkCount?1:connectionFactor(sequenceCoverage);
 for(const key of Object.keys(parts))parts[key]*=sequenceFactor;
 const bestLink=links.filter(l=>l.distance>0).sort((a,b)=>b.score-a.score||b.coverage-a.coverage)[0]||null;
 const bestArc=arcs.map(a=>a.bestArc).filter(Boolean).sort((a,b)=>b.score-a.score||b.distance-a.distance)[0]||null;
 const distance=states.reduce((n,s)=>n+s.angleDistance,0);
 return {score:sumParts(parts),parts,arcs,bestArc,links,bestLink,straightLinkCount:links.filter(l=>l.complete).length,totalLinkCount:linkCount,sequenceCoverage,sequenceFactor,fullConnectionCount:arcs.filter(a=>a.complete).length,totalArcCount:arcs.length,sidewaysDistance:arcs.reduce((n,a)=>n+a.sidewaysDistance,0),
  sustainedAngle:distance>0?states.reduce((n,s)=>n+s.angleIntegral,0)/distance:0,speedRetention:bestArc?.speedRetention||0,curveQuality:bestArc?.curveQuality||0};
}
function preparationOrigin(frames,reference){
 // Recheck the contiguous pre-score suffix against the now-known approach
 // reference. Slow launch wheelspin is preparation, not a scored speed loss.
 const threshold=Math.max(8,reference*.9);let origin=null;
 for(let i=frames.length-1;i>=0;i--){if(frames[i].speed<threshold)break;origin=frames[i];}
 return origin;
}
function measure(result,track,vehicle,options={}){
 const frames=options.record||result.frames||[],allZones=apexZones(track),zones=options.zoneId?allZones.filter(z=>z.id===options.zoneId):allZones;
 const refs={...(options.referenceSpeeds||result.drift?.referenceSpeeds||(options.reference?referenceSpeeds(track,options.reference):{}))};
 const referencePace=options.referencePace||result.drift?.referencePace||(options.reference?CourseScoring.paceProfile(track,options.reference):null);
 const course=options.zoneId?null:new CourseScoring.Accumulator(track,{referencePace,links:straightLinks(track,true),corners:apexZones(track,true)});
 const states=zones.map(zone=>{const index=allZones.indexOf(zone),pace=refs[zone.id]||0;return {zone,preparedPace:pace,referenceFloor:pace*.8,referenceSpeed:pace*.8,referenceFixed:false,earlyReference:0,referenceRun:null,referenceS:null,referenceTime:null,referenceAllowedStart:index>0?allZones[index-1].exit:2.5,minimumSpeed:Infinity,preparation:[],fit:newFit(),runs:[],run:null,credit:0,propulsion:0,sidewaysDistance:0,coveredDistance:0,angleDistance:0,angleIntegral:0,signedTurn:0,absoluteTurn:0,previousHeading:null,lastS:-Infinity};});
 const linkStates=straightLinks(track).filter(z=>!options.zoneId||z.fromZoneId===options.zoneId||z.toZoneId===options.zoneId).map(z=>newLinkState(z,refs));
 const timeline=[],p=vehicle.physics||vehicle;let spinDetected=false,lastScore=0;
 const close=state=>{if(state.run)state.runs.push(state.run);state.run=null;};
 for(let i=0;i<frames.length;i++){
  const f=frames[i],a=i?frames[i-1]:null,dt=a?f.time-a.time:0,progress=a?f.s-a.s:0,ds=a?Math.hypot(f.x-a.x,f.y-a.y):0;
  const angle=Math.abs(f.beta||0)/DEG,continuous=!!a&&dt>0&&dt<.1,moving=continuous&&progress>0&&ds>0&&ds<=Math.max(a.speed,f.speed)*dt*1.2+.02;
  if(f.status==='spin'||f.speed>=3&&angle>=75)spinDetected=true;
  const rearForce=(f.wheelForces?.[2]?.fx||0)+(f.wheelForces?.[3]?.fx||0),forwardSpeed=f.vx*Math.cos(f.yaw)+f.vy*Math.sin(f.yaw);
  const propelled=f.rearTorque>0&&rearForce>p.massKg*.3&&rearForce*forwardSpeed>0&&f.throttle>=.15&&f.brake<=.03;
  let active=null,retention=0,currentRun=null,currentContribution=0;
  for(const state of states){
   const z=state.zone;
   advanceReference(state,a,f,moving&&!spinDetected);
   const reference=state.referenceSpeed,ratio=reference>0?f.speed/reference:0;
   if(f.s>=z.start&&f.s<=z.end){active=state;retention=ratio;}
   if(!a||!moving||spinDetected){close(state);state.preparation=[];state.previousHeading=null;continue;}
   const rightSign=(f.beta||0)*z.sign<0;
   if(f.s<=z.start){
    const enough=f.speed>=Math.max(8,reference*.9);
    if(rightSign&&angle>=10&&angle<=70&&enough){
     if(!state.preparation.length&&a.beta*z.sign<0&&Math.abs(a.beta)/DEG>=10&&Math.abs(a.beta)/DEG<=70&&a.speed>=Math.max(8,reference*.9))state.preparation.push(a);
     state.preparation.push(f);
    }else state.preparation=[];
    continue;
   }
   const lo=Math.max(a.s,z.start),hi=Math.min(f.s,z.end);if(!(hi>lo)){if(f.s>z.end)close(state);continue;}
   // Count each centreline interval once, but never award more distance than
   // was actually travelled. A loop or repeated crossing cannot farm points.
   const fresh=Math.max(0,hi-Math.max(lo,state.lastS)),effective=Math.min(ds,progress)*fresh/progress;state.lastS=Math.max(state.lastS,hi);
   if(!(effective>0)){close(state);continue;}
   const heading=Math.atan2(f.y-a.y,f.x-a.x),headingStep=state.previousHeading===null?0:wrap(heading-state.previousHeading);state.previousHeading=heading;
   if(f.s>=z.cornerStart&&a.s<=z.exit){state.signedTurn+=headingStep*z.sign;state.absoluteTurn+=Math.abs(headingStep);}
   if(Math.abs(f.s-z.apex)<=z.fitRadius)addFit(state.fit,(f.s-z.apex)/z.fitRadius,f.x,f.y,effective);
   const quality=rightSign&&angle<75?slipQuality(f.beta)*speedQuality(f.speed,reference):0;
   // Preserve speed loss across all slides in this apex window. Completing a
   // short fast fragment cannot hide a later slow slide by restarting its run.
   if(angle>=10||state.run){state.minimumSpeed=Math.min(state.minimumSpeed,f.speed);if(state.run){state.run.minSpeed=Math.min(state.run.minSpeed,f.speed);state.run.exitSpeed=f.speed;}}
   if(active===state)currentContribution=quality*effective*retainedQuality(state);
   state.credit+=effective*quality;state.propulsion+=propelled?effective*quality:0;state.coveredDistance+=effective;
   const drifting=rightSign&&angle>=10&&angle<=70&&f.speed>=8&&ratio>.7;
   if(drifting){
    state.sidewaysDistance+=Math.sin(angle*DEG)*effective;state.angleIntegral+=angle*effective;state.angleDistance+=effective;
    if(state.run&&state.run.sign!==Math.sign(f.beta))close(state);
    if(!state.run){
     const origin=state.preparation.at(-1)===a&&f.speed>=Math.max(8,reference*.9)?preparationOrigin(state.preparation,reference):null;
     const startTime=a.time+(lo-a.s)/progress*dt;
     state.run={start:lo,end:hi,startTime,endTime:f.time,initiationS:origin?.s??lo,initiationTime:origin?.time??startTime,startedBeforeStart:(origin?.s??lo)<track.judgedStart,distance:0,progress:0,duration:0,angleIntegral:0,creditedDistance:0,propelledDistance:0,entrySpeed:reference,minSpeed:f.speed,exitSpeed:f.speed,sign:Math.sign(f.beta),turn:0,coreTurn:0};
    }
    const run=state.run;run.end=hi;run.endTime=f.time;run.distance+=ds*fresh/progress;run.progress+=effective;run.duration+=dt*fresh/progress;run.angleIntegral+=angle*ds*fresh/progress;run.creditedDistance+=effective*quality;run.propelledDistance+=propelled?effective*quality:0;
    run.minSpeed=Math.min(run.minSpeed,f.speed);run.exitSpeed=f.speed;run.turn+=headingStep*z.sign;
    if(f.s>=z.cornerStart&&a.s<=z.exit)run.coreTurn+=headingStep*z.sign;
   }else close(state);
   state.preparation=[];
   if(active===state)currentRun=state.run;
  }
  let activeLink=null,linkContribution=0;
  for(const link of linkStates){const credit=advanceLink(link,a,f,moving,spinDetected);if(f.s>=link.zone.start&&f.s<=link.zone.end){activeLink=link;linkContribution=credit;}}
  // The full-course accumulator owns its causal speed reference. Legacy
  // regional references remain diagnostics and cannot silently reset it.
  const courseFacts=course?.step(f,a);
  if(options.trace){
   const snapshot=objectiveSnapshot(states,linkStates,!!options.zoneId),last=i===frames.length-1,status=last?result.status:(f.status||'running');
   const failed=spinDetected||status!=='running'&&status!=='finished'||last&&(result.valid!==true||result.status!=='finished');
   const score=failed?0:snapshot.score,delta=score-lastScore;lastScore=score;
   const preStartDrift=f.s<track.judgedStart?{active:!failed&&moving&&angle>=10&&angle<=70&&f.speed>=Math.max(8,(refs[allZones[0]?.id]||0)*.8*.9),s:f.s,speed:f.speed,angle,distanceToStart:track.judgedStart-f.s}:null;
   const link=activeLink?linkSnapshot(activeLink):null,inStraight=!!activeLink&&f.s>=activeLink.zone.straightStart&&f.s<=activeLink.zone.straightEnd;
   const area=!!active||!!activeLink,phase=inStraight?'link':active?(f.s>active.zone.apex?'exit':'judged'):preStartDrift?.active?'initiation':f.s<(allZones[0]?.start??track.judgedStart)?'preparation':'recovery';
   const current=active?arcSnapshot(active):null,apex=!!currentRun&&currentRun.start<active.zone.apex&&currentRun.end>active.zone.apex&&currentRun.turn>.08;
   const retained=inStraight?link.speedRetention:active?Math.min(f.speed,active.minimumSpeed)/Math.max(1e-9,active.referenceSpeed):0;
   const complete=!!current?.complete;
   const conditions={area,angle:angle>=10&&angle<=70,speed:f.speed>=8,retention:retained>=.9,forward:moving,curve:(current?.curveQuality||0)>=.7,apex,complete,link:!!link?.complete,propulsion:propelled};
   const earning=!failed&&area&&delta>1e-7,reassessment=earning&&currentContribution<=1e-12&&linkContribution<=1e-12;
   let reason=failed?(spinDetected||status==='spin'?'스핀':status==='offtrack'?'앞바퀴 이탈':status==='collision'?'차체 충돌':'완주 실패')+' · 점수 무효'
    :!area?(phase==='initiation'?'출발선 전 드리프트 · 진입 연결 준비 · 득점 없음':phase==='preparation'?'준비 구간 · 득점 없음':'회복·비채점 구간 · 득점 없음')
    :reassessment?'연결·곡선 확인 · 앞선 주행 점수 재평가'
    :active&&(retention<=.7||retainedQuality(active)===0)?'코너 내 속도 70% 이하 · 해당 코너 0점'
    :!moving?'연속 전진 필요'
    :earning?(inStraight?'코너 사이 직선 드리프트 · 다음 진입까지 연결 확인':complete?'진입부터 탈출까지 완전 연결 · 각도와 속도 유지 반영':apex?'apex 통과 · 코너 전체 연결 탐색 중':angle>=10?'연속 슬립각 · 완전 연결을 위한 탐색':'드리프트 각도 형성 중')
    :!conditions.angle?'큰 슬립각을 이어 갈 준비'
    :!conditions.retention?'속도 손실 · 전체 배점 감소'
    :delta< -1e-7?'곡선 연결·유지 각도 변화로 점수 재평가':'현재 연속 드리프트 기록 유지';
   timeline.push({time:f.time,s:f.s,score,potentialScore:snapshot.score,delta,earning,reassessment,provisional:!last,estimatedStyle:false,status,phase,reason,conditions,parts:snapshot.parts,arc:snapshot.bestArc,fullConnectionCount:snapshot.fullConnectionCount,totalArcCount:snapshot.totalArcCount,straightLinkCount:snapshot.straightLinkCount,totalLinkCount:snapshot.totalLinkCount,link,preStartDrift,finalValid:last&&!failed&&result.valid===true});
   if(courseFacts){
    const terminalFailure=spinDetected||status!=='running'&&status!=='finished'||last&&status==='finished'&&result.valid!==true;
    const previousScore=timeline.length>1?timeline.at(-2).score:0,score=terminalFailure?0:courseFacts.potentialScore;
    const c=courseFacts.conditions,reason=terminalFailure?(spinDetected||status==='spin'?'스핀':status==='offtrack'?'앞바퀴 이탈':status==='collision'?'차체 충돌':'완주 실패')+' · 전체 점수 무효'
     :courseFacts.transitioning?'방향 전환 중 · 연속 배수 유지 · 득점 없음'
     :courseFacts.delta>0?(courseFacts.zoneMultiplier===2?'ZONE ×2 · 새 진행 거리 득점':'연속 드리프트 · 새 진행 거리 득점')
     :!c.angle?'슬립각 10~70° 필요 · 연속 배수 ×1'
     :!c.speed?'속도 28.8km/h 이상 필요 · 연속 배수 ×1'
     :!c.retention?'기준 속도의 70% 이하 · 득점 중단 · 연속 배수 ×1':'새 전진 거리 필요 · 연속 배수 ×1';
    Object.assign(timeline.at(-1),courseFacts,{score,delta:score-previousScore,earning:!terminalFailure&&courseFacts.delta>0,reassessment:false,reason,
     provisional:status==='running',preStartDrift:null,parts:terminalFailure?{base:0,continuity:0,zone:0}:courseFacts.parts,
     finalValid:last&&result.valid===true&&result.status==='finished'&&!terminalFailure});
   }
  }
 }
 const snapshot=objectiveSnapshot(states,linkStates,!!options.zoneId),valid=result.valid===true&&result.status==='finished'&&!spinDetected;
 const power=options.diagnostics===false?null:measurePower({...result,frames},track,vehicle);
 const output={...snapshot,score:valid?snapshot.score:0,referenceSpeeds:refs,referencePace,spinDetected,power};
 if(course){
  const scoring=course.summary(),parts=valid?scoring.parts:{base:0,continuity:0,zone:0};
  Object.assign(output,{score:valid?scoring.score:0,parts,scoring:{...scoring,potentialScore:scoring.score,score:valid?scoring.score:0,parts},
   regionalScore:snapshot.score,regionalParts:snapshot.parts,sequenceFactor:1});
 }
 if(options.trace)output.timeline=timeline;return output;
}
function rank(vehicle,track,result,record=result.frames,options={}){
 const drift=measure({...result,frames:record},track,vehicle,options),power=drift.power;
 return {...result,valid:result.valid&&!drift.spinDetected,status:drift.spinDetected?'spin':result.status,reason:drift.spinDetected?'스핀 · 차체 제어 상실':result.reason,
  styleScore:result.styleScore??result.score??0,score:drift.score,drift,power};
}
function replayTimeline(result,track,vehicle,record=result.frames){return measure({...result,frames:record},track,vehicle,{trace:true,diagnostics:false}).timeline;}
function signature(){return JSON.stringify(WEIGHTS)+'\n'+CourseScoring.signature()+'\n'+[exitZones,inspectFrame,completedRun,angleQuality,progressQuality,successfulParts,sumParts,scoredState,measurePower,apexZones,straightLinks,newLinkState,closeLink,advanceLink,linkSnapshot,preparedPace,referenceSpeeds,advanceReference,newFit,addFit,solveFit,fitQuality,turnQuality,retainedQuality,connectionOf,connectionFactor,preparationOrigin,describeRun,arcSnapshot,objectiveSnapshot,slipQuality,speedQuality,smooth01,wrap,measure,rank,replayTimeline].map(String).join('\n').replace(/\r\n/g,'\n');}
const api=Object.freeze({VERSION:7,WEIGHTS,apexZones,straightLinks,referenceSpeeds,exitZones,inspectFrame,measurePower,measure,rank,replayTimeline,signature});root.DriftFitness=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
