/* Rank continuous sideways apex arcs with speed retention. Powered exits remain
 * diagnostic telemetry, never a completion tier that overrides this objective. */
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
const apexCache=new WeakMap(),WEIGHTS=Object.freeze({sideways:55,connection:25,curve:15,propulsion:5});
const smooth01=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const slipQuality=beta=>clamp((Math.sin(Math.abs(beta))-Math.sin(2*DEG))/(Math.sin(70*DEG)-Math.sin(2*DEG)),0,1);
const speedQuality=(speed,reference)=>reference>0?smooth01((speed/reference-.7)/.25)*smooth01((speed-5)/7):0;
function apexZones(track){
 if(apexCache.has(track))return apexCache.get(track);
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
  const start=Math.max(track.judgedStart,a.cornerStart-35,i?(arcs[i-1].exit+a.cornerStart)/2:0);
  const end=Math.min(track.length-10,a.exit+60,i<arcs.length-1?(a.exit+arcs[i+1].cornerStart)/2:track.length);
  return {id:'apex-'+i,start,cornerStart:a.cornerStart,apex:a.apex,exit:a.exit,end,referenceStart:Math.max(2.5,start-20),sign:a.sign,turn:a.turn,fitRadius:Math.max(6,Math.min(25,(a.exit-a.cornerStart)*.35))};
 }).filter(z=>z.apex>=track.judgedStart&&z.apex<=track.judgedEnd&&z.start<z.apex&&z.end>z.apex);
 const frozen=Object.freeze(zones.map(Object.freeze));apexCache.set(track,frozen);return frozen;
}
function referenceSpeeds(track,record=[]){
 const refs={};for(const z of apexZones(track)){
  let peak=0;for(const f of record)if(f.s>=z.referenceStart&&f.s<=z.start&&Number.isFinite(f.speed))peak=Math.max(peak,f.speed);
  refs[z.id]=peak;
 }return refs;
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
function describeRun(run,state){
 const z=state.zone,angle=run.distance>0?run.angleIntegral/run.distance:0,minSpeed=Math.min(run.minSpeed,state.minimumSpeed),retention=run.entrySpeed>0?minSpeed/run.entrySpeed:0;
 const before=clamp((Math.min(run.end,z.apex)-run.start)/Math.max(1,z.apex-z.start),0,1);
 const after=clamp((run.end-Math.max(run.start,z.apex))/Math.max(1,z.end-z.apex),0,1);
 const bridge=Math.min(before,after)*(run.creditedDistance/Math.max(1e-9,run.progress))*smooth01(run.turn/Math.min(.25,Math.abs(z.turn)*.25));
 const curve=fitQuality(state)*turnQuality(state),coverage=run.creditedDistance/(z.end-z.start);
 return {zoneId:z.id,zoneExit:z.exit,start:run.start,end:run.end,startTime:run.startTime,endTime:run.endTime,distance:run.distance,duration:run.duration,
  distanceWeightedAngle:angle,entrySpeed:run.entrySpeed,minSpeed,exitSpeed:run.exitSpeed,speedRetention:retention,speedScope:'apex-window',curveQuality:curve,
  continuity:clamp(run.progress/(z.end-z.start),0,1),anchored:before>0&&after>0&&run.turn>.08,sign:run.sign,
  score:(55*coverage*turnQuality(state)+25*bridge*turnQuality(state)+15*coverage*curve+5*run.propelledDistance/(z.end-z.start))*retainedQuality(state),bridge};
}
function arcSnapshot(state){
 const z=state.zone,length=z.end-z.start,turn=turnQuality(state),curve=fitQuality(state)*turn;
 const runs=state.run?[...state.runs,state.run]:state.runs,described=runs.map(r=>describeRun(r,state));
 const bestArc=described.sort((a,b)=>b.score-a.score||b.distance-a.distance)[0]||null;
 const bridge=Math.max(0,...described.map(r=>r.bridge));
 const coverage=clamp(state.credit/length,0,1);
 const parts={sideways:WEIGHTS.sideways*coverage*turn,connection:WEIGHTS.connection*bridge*turn,
  curve:WEIGHTS.curve*coverage*curve,propulsion:WEIGHTS.propulsion*clamp(state.propulsion/length,0,1)*turn};
 for(const key of Object.keys(parts))parts[key]*=retainedQuality(state);
 return {zoneId:z.id,parts,score:sumParts(parts),bestArc,curveQuality:curve,sidewaysDistance:state.sidewaysDistance,
  sustainedAngle:state.angleDistance>0?state.angleIntegral/state.angleDistance:0,coveredDistance:state.coveredDistance};
}
function objectiveSnapshot(states){
 const arcs=states.map(arcSnapshot),parts={sideways:0,connection:0,curve:0,propulsion:0},count=Math.max(1,arcs.length);
 for(const arc of arcs)for(const key of Object.keys(parts))parts[key]+=arc.parts[key]/count;
 const bestArc=arcs.map(a=>a.bestArc).filter(Boolean).sort((a,b)=>b.score-a.score||b.distance-a.distance)[0]||null;
 const distance=states.reduce((n,s)=>n+s.angleDistance,0);
 return {score:sumParts(parts),parts,arcs,bestArc,sidewaysDistance:arcs.reduce((n,a)=>n+a.sidewaysDistance,0),
  sustainedAngle:distance>0?states.reduce((n,s)=>n+s.angleIntegral,0)/distance:0,speedRetention:bestArc?.speedRetention||0,curveQuality:bestArc?.curveQuality||0};
}
function measure(result,track,vehicle,options={}){
 const frames=options.record||result.frames||[],allZones=apexZones(track),zones=options.zoneId?allZones.filter(z=>z.id===options.zoneId):allZones;
 const refs={...(options.referenceSpeeds||result.drift?.referenceSpeeds||(options.reference?referenceSpeeds(track,options.reference):{}))};
 const states=zones.map(zone=>({zone,approachPeak:0,referenceSeen:false,referenceSpeed:0,minimumSpeed:Infinity,fit:newFit(),runs:[],run:null,credit:0,propulsion:0,sidewaysDistance:0,coveredDistance:0,angleDistance:0,angleIntegral:0,signedTurn:0,absoluteTurn:0,previousHeading:null,lastS:-Infinity}));
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
   // The reference belongs to a fixed approach section, not to a sliding
   // episode. Releasing/restarting drift cannot lower it after a speed loss.
   if(f.s>=z.referenceStart&&f.s<=z.start&&Number.isFinite(f.speed)){state.approachPeak=Math.max(state.approachPeak,f.speed);state.referenceSeen=true;}
   if(a&&a.s<z.start&&f.s>z.start&&moving&&f.s-a.s<5){const u=(z.start-a.s)/(f.s-a.s);state.approachPeak=Math.max(state.approachPeak,a.speed+(f.speed-a.speed)*u);state.referenceSeen=true;}
   const reference=Math.max(state.approachPeak,(refs[z.id]||0)*.8),ratio=reference>0?f.speed/reference:0;
   state.referenceSpeed=reference;
   if(f.s>=z.start&&f.s<=z.end){active=state;retention=ratio;}
   if(!a||!moving||spinDetected){close(state);state.previousHeading=null;continue;}
   const lo=Math.max(a.s,z.start),hi=Math.min(f.s,z.end);if(!(hi>lo)){if(f.s>z.end)close(state);continue;}
   // Count each centreline interval once, but never award more distance than
   // was actually travelled. A loop or repeated crossing cannot farm points.
   const fresh=Math.max(0,hi-Math.max(lo,state.lastS)),effective=Math.min(ds,progress)*fresh/progress;state.lastS=Math.max(state.lastS,hi);
   if(!(effective>0)){close(state);continue;}
   const heading=Math.atan2(f.y-a.y,f.x-a.x),headingStep=state.previousHeading===null?0:wrap(heading-state.previousHeading);state.previousHeading=heading;
   if(f.s>=z.cornerStart&&a.s<=z.exit){state.signedTurn+=headingStep*z.sign;state.absoluteTurn+=Math.abs(headingStep);}
   if(Math.abs(f.s-z.apex)<=z.fitRadius)addFit(state.fit,(f.s-z.apex)/z.fitRadius,f.x,f.y,effective);
   const rightSign=(f.beta||0)*z.sign<0,quality=rightSign&&angle<75?slipQuality(f.beta)*speedQuality(f.speed,reference):0;
   // Preserve speed loss across all slides in this apex window. Completing a
   // short fast fragment cannot hide a later slow slide by restarting its run.
   if(angle>=10||state.run){state.minimumSpeed=Math.min(state.minimumSpeed,f.speed);if(state.run){state.run.minSpeed=Math.min(state.run.minSpeed,f.speed);state.run.exitSpeed=f.speed;}}
   if(active===state)currentContribution=quality*effective*retainedQuality(state);
   state.credit+=effective*quality;state.propulsion+=propelled?effective*quality:0;state.coveredDistance+=effective;
   const drifting=rightSign&&angle>=10&&angle<=70&&f.speed>=8&&ratio>.7;
   if(drifting){
    state.sidewaysDistance+=Math.sin(angle*DEG)*effective;state.angleIntegral+=angle*effective;state.angleDistance+=effective;
    if(state.run&&state.run.sign!==Math.sign(f.beta))close(state);
    if(!state.run)state.run={start:lo,end:hi,startTime:a.time,endTime:f.time,distance:0,progress:0,duration:0,angleIntegral:0,creditedDistance:0,propelledDistance:0,entrySpeed:reference,minSpeed:f.speed,exitSpeed:f.speed,sign:Math.sign(f.beta),turn:0};
    const run=state.run;run.end=hi;run.endTime=f.time;run.distance+=ds*fresh/progress;run.progress+=effective;run.duration+=dt*fresh/progress;run.angleIntegral+=angle*ds*fresh/progress;run.creditedDistance+=effective*quality;run.propelledDistance+=propelled?effective*quality:0;
    run.minSpeed=Math.min(run.minSpeed,f.speed);run.exitSpeed=f.speed;run.turn+=headingStep*z.sign;
   }else close(state);
   if(active===state)currentRun=state.run;
  }
  if(options.trace){
   const snapshot=objectiveSnapshot(states),last=i===frames.length-1,status=last?result.status:(f.status||'running');
   const failed=spinDetected||status!=='running'&&status!=='finished'||last&&(result.valid!==true||result.status!=='finished');
   const score=failed?0:snapshot.score,delta=score-lastScore;lastScore=score;
   const area=!!active,phase=area?(f.s>active.zone.apex?'exit':'judged'):f.s<(allZones[0]?.start??track.judgedStart)?'preparation':'recovery';
   const current=active?arcSnapshot(active):null,apex=!!currentRun&&currentRun.start<active.zone.apex&&currentRun.end>active.zone.apex&&currentRun.turn>.08;
   const retained=active?Math.min(f.speed,active.minimumSpeed)/Math.max(1e-9,active.referenceSpeed):0;
   const conditions={area,angle:angle>=10&&angle<=70,speed:f.speed>=8,retention:retained>=.9,forward:moving,curve:(current?.curveQuality||0)>=.7,apex,propulsion:propelled};
   const earning=!failed&&area&&delta>1e-7,reassessment=earning&&currentContribution<=1e-12;
   let reason=failed?(spinDetected||status==='spin'?'스핀':status==='offtrack'?'트랙 이탈':status==='collision'?'충돌':'완주 실패')+' · 점수 무효'
    :!area?(phase==='preparation'?'준비 구간 · 득점 없음':'회복·비채점 구간 · 득점 없음')
    :reassessment?'곡선 확인 · 앞선 주행 점수 재평가'
    :retention<=.7||active&&retainedQuality(active)===0?'코너 내 속도 70% 이하 · 해당 코너 0점'
    :!moving?'연속 전진 필요'
    :earning?(apex?'큰 각도로 apex 연결 · 거리와 속도 유지 반영':angle>=10?'연속 슬립각 · 속도 유지와 곡선 반영':'드리프트 각도 형성 중')
    :!conditions.angle?'큰 슬립각을 이어 갈 준비'
    :!conditions.retention?'속도 손실 · 전체 배점 감소'
    :delta< -1e-7?'곡선 연결·유지 각도 변화로 점수 재평가':'현재 연속 드리프트 기록 유지';
   timeline.push({time:f.time,s:f.s,score,potentialScore:snapshot.score,delta,earning,reassessment,provisional:!last,estimatedStyle:false,status,phase,reason,conditions,parts:snapshot.parts,arc:snapshot.bestArc,finalValid:last&&!failed&&result.valid===true});
  }
 }
 const snapshot=objectiveSnapshot(states),valid=result.valid===true&&result.status==='finished'&&!spinDetected;
 const power=options.diagnostics===false?null:measurePower({...result,frames},track,vehicle);
 const output={...snapshot,score:valid?snapshot.score:0,referenceSpeeds:refs,spinDetected,power};if(options.trace)output.timeline=timeline;return output;
}
function rank(vehicle,track,result,record=result.frames,options={}){
 const drift=measure({...result,frames:record},track,vehicle,options),power=drift.power;
 return {...result,valid:result.valid&&!drift.spinDetected,status:drift.spinDetected?'spin':result.status,reason:drift.spinDetected?'스핀 · 차체 제어 상실':result.reason,
  styleScore:result.styleScore??result.score??0,score:drift.score,drift,power};
}
function replayTimeline(result,track,vehicle,record=result.frames){return measure({...result,frames:record},track,vehicle,{trace:true,diagnostics:false}).timeline;}
function signature(){return JSON.stringify(WEIGHTS)+'\n'+[exitZones,inspectFrame,completedRun,angleQuality,progressQuality,successfulParts,sumParts,scoredState,measurePower,apexZones,referenceSpeeds,newFit,addFit,solveFit,fitQuality,turnQuality,retainedQuality,describeRun,arcSnapshot,objectiveSnapshot,slipQuality,speedQuality,smooth01,wrap,measure,rank,replayTimeline].map(String).join('\n').replace(/\r\n/g,'\n');}
const api=Object.freeze({VERSION:4,WEIGHTS,apexZones,referenceSpeeds,exitZones,inspectFrame,measurePower,measure,rank,replayTimeline,signature});root.DriftFitness=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
