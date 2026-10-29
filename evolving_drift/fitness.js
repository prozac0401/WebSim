/* Score recorded tyre propulsion and expose the same calculation to replays. */
(function(root){
'use strict';
const DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),cache=new WeakMap();
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
function measure(result,track,vehicle,{trace=false}={}){
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
  if(failed)reason=status==='spin'||spinDetected?'스핀 · 점수 무효':status==='offtrack'?'트랙 이탈 · 점수 무효':status==='collision'?'충돌 · 점수 무효':'완주 실패 · 점수 무효';
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
function rank(vehicle,track,result,record=result.frames){const power=measure({...result,frames:record},track,vehicle);return {...result,valid:result.valid&&!power.spinDetected,status:power.spinDetected?'spin':result.status,reason:power.spinDetected?'스핀 · 차체 제어 상실':result.reason,styleScore:power.styleScore,score:power.score,power};}
function replayTimeline(result,track,vehicle,record=result.frames){return measure({...result,frames:record},track,vehicle,{trace:true}).timeline;}
function signature(){return [exitZones,inspectFrame,completedRun,angleQuality,progressQuality,successfulParts,sumParts,scoredState,measure,rank,replayTimeline].map(String).join('\n').replace(/\r\n/g,'\n');}
const api=Object.freeze({VERSION:3,exitZones,inspectFrame,measure,rank,replayTimeline,signature});root.DriftFitness=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
