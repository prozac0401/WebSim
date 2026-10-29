/* Observations from a complete failed replay, not a causal proof or a new
 * simulation. Thresholds suppress short transients; they are model heuristics. */
(function(root){
 'use strict';
 const VERSION=2,DEG=Math.PI/180,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const finite=Number.isFinite,wrap=x=>Math.atan2(Math.sin(x),Math.cos(x)),round=x=>Math.round(x*1000)/1000;
 function stoppedRun(p,frames,features,failure,status){
  if(status!=='timeout'||features.length<3)return null;
  const end=features.at(-1);if(end.i!==frames.length-1||end.speed>=.5)return null;
  let stopIndex=features.length-1;
  while(stopIndex>0&&features[stopIndex].dt>0&&features[stopIndex-1].speed<.5)stopIndex--;
  const stop=features[stopIndex],duration=end.time-stop.time;
  if(duration<1)return null;
  // Walk back to the latest speed peak before the stop, ending at a sustained
  // intervening acceleration or a telemetry gap. Earlier braking which was
  // followed by recovery must not be presented as this deceleration's origin.
  let peakIndex=stopIndex,peak=stop.speed,recoveryTime=0;
  for(let i=stopIndex-1;i>=0;i--){
   if(features[i+1].dt<=0)break;
   const f=features[i];
   // Equal-speed samples belong to the preceding cruise plateau. Keep its
   // latest endpoint instead of moving the deceleration origin to launch.
   if(f.speed>peak+1e-6){peak=f.speed;peakIndex=i;recoveryTime=0;}
   else if(peak-f.speed>.5){recoveryTime+=features[i+1].dt;if(recoveryTime>=.3)break;}
   else recoveryTime=0;
  }
  const decelerated=peak-stop.speed>=2&&stop.time-features[peakIndex].time>=.3;
  const start=decelerated?features[peakIndex]:stop;
  let brakeTime=0,brakeRun=0,brakePeak=0,throttleTime=0,throttleIntegral=0,suppressedTime=0,suppressedRun=0,heldTime=0,heldRun=0,heldGear=null,minRPM=Infinity;
  for(let i=stopIndex+1;i<features.length;i++){
   const f=features[i],q=frames[f.i],dt=f.dt;
   if(finite(q.brake))brakePeak=Math.max(brakePeak,q.brake);
   brakeRun=finite(q.brake)&&q.brake>.05?brakeRun+dt:0;brakeTime=Math.max(brakeTime,brakeRun);
   if(finite(q.throttle)){throttleIntegral+=q.throttle*dt;throttleTime+=dt;}
   suppressedRun=finite(q.driverThrottleCorrection)&&q.driverThrottleCorrection<-.03?suppressedRun+dt:0;suppressedTime=Math.max(suppressedTime,suppressedRun);
   if(!p.electric&&finite(p.idleRPM)&&finite(q.rpm)&&q.rpm<=p.idleRPM*1.2&&Number.isInteger(q.gear)&&q.gear>1&&q.requestedGear===q.gear){heldRun+=dt;heldTime=Math.max(heldTime,heldRun);heldGear=heldGear===null?q.gear:heldGear===q.gear?heldGear:0;minRPM=Math.min(minRPM,q.rpm);}else heldRun=0;
  }
  const evidence=[{label:'정지에 가까운 속도 지속',value:round(duration),unit:'s'},
   {label:'정지 구간 진행 거리',value:round(Math.max(0,end.s-stop.s)),unit:'m'}];
  if(decelerated)evidence.push({label:'감속 시작 관측 속도',value:round(start.speed*3.6),unit:'km/h'},
   {label:'정지 전 감속 구간',value:round(stop.time-start.time),unit:'s'});
  if(throttleTime>0)evidence.push({label:'정지 구간 평균 가속 입력',value:round(throttleIntegral/throttleTime*100),unit:'%'});
  const hypotheses=[],recommended=new Set();
  if(brakeTime>=.5){
   evidence.push({label:'정지 중 제동 입력 유지',value:round(brakeTime),unit:'s'},{label:'정지 구간 최대 제동 입력',value:round(brakePeak*100),unit:'%'});
   hypotheses.push({kind:'brake-held-stop',confidence:'medium',summary:'정지에 가까운 속도에서도 제동 입력이 유지됐습니다. 거리 기준 조작이 다음 제동 해제 지점에 도달하지 못했을 가능성이 있으므로 해제 시점을 점검해야 합니다. 이 관측만으로 제동을 유일한 원인이라고 확정할 수는 없습니다.'});
   recommended.add('brake-release');recommended.add('timing');
  }
  if(suppressedTime>=.5){
   evidence.push({label:'정지 중 가속 입력 하향 보정',value:round(suppressedTime),unit:'s'});
   hypotheses.push({kind:'throttle-suppressed-stop',confidence:'low',summary:'정지 구간에서 기록된 가속 보정이 유전자 입력을 낮추는 방향으로 지속됐습니다. 자세·경로 오차와 가속 입력을 함께 점검할 필요가 있지만, 보정만으로 정지 원인을 확정할 수는 없습니다.'});recommended.add('power');
  }
  if(heldTime>=.5){
   evidence.push({label:'저회전에서 2단 이상 유지 요청',value:round(heldTime),unit:'s'},{label:'유지 요청 중 최저 RPM',value:round(minRPM),unit:'rpm'});
   if(heldGear)evidence.push({label:'정지 구간 유지 요청 기어',value:heldGear,unit:'단'});
   hypotheses.push({kind:'held-gear-low-rpm',confidence:'low',summary:'정지 구간에서 공회전 부근의 RPM과 2단 이상 기어 유지 요청이 함께 기록됐습니다. 저속 구동력을 제한했을 가능성을 점검할 수 있으나, 기어 요청이 정지를 일으켰다고 단정할 수는 없습니다.'});
  }
  const origin={time:start.time,s:start.s,zoneIndex:start.zoneIndex};
  return {version:VERSION,kind:'sustained-stop',summary:(decelerated?'주행 중 감속한 뒤 ':'')+'0.5m/s 미만의 속도가 약 '+duration.toFixed(1)+'초 이어져 주행을 끝내지 못한 기록입니다. 조작 입력의 관측과 원인 가설을 구분해 표시합니다.',
   failure,origin,window:{startS:start.s,endS:failure.s,startTime:start.time,endTime:failure.time},evidence,hypotheses,recommendedFamilies:[...recommended]};
 }
 function analyze(vehicle,track,result,{zones}={}){
  if(!result||result.valid===true)return null;
  const frames=result.frames;if(!Array.isArray(frames)||frames.length<3)return null;
  const last=frames.at(-1),failure={time:finite(last?.time)?last.time:finite(result.time)?result.time:null,s:finite(last?.s)?last.s:null,reason:result.reason||last?.reason||result.status||'unknown'};
  const unknown=()=>({version:VERSION,kind:'unresolved',summary:'기록에서 실패에 앞선 지속적인 경로·자세 이탈의 시작을 확인하지 못했습니다.',failure,origin:null,window:null,evidence:[],hypotheses:[],recommendedFamilies:[]});
  if(!track||typeof track.sample!=='function'||!finite(track.length))return unknown();
  if(!Array.isArray(zones)){
   const fitness=root.DriftFitness||(typeof require==='function'?require('./fitness.js'):null);
   try{zones=fitness?.apexZones(track)||[];}catch(_){zones=[];}
  }
  const p=vehicle?.physics||vehicle||{},features=[];let previous=null,zoneCursor=0,episode=null;
  for(let i=0;i<frames.length;i++){
   const f=frames[i];if(!f||![f.time,f.s,f.x,f.y,f.vx,f.vy,f.yaw].every(finite)){previous=null;episode=null;continue;}
   let road;try{road=track.sample(clamp(f.s,0,track.length));}catch(_){previous=null;episode=null;continue;}
   if(!road||![road.x,road.y,road.heading].every(finite)){previous=null;episode=null;continue;}
   while(zoneCursor+1<zones.length&&f.s>=zones[zoneCursor+1].start)zoneCursor++;
   while(zoneCursor>0&&f.s<zones[zoneCursor].start)zoneCursor--;
   const zone=zones[zoneCursor],zoneIndex=zone?zoneCursor:null,speed=Math.hypot(f.vx,f.vy),offset=finite(f.lineOffset)?f.lineOffset:0;
   const reference={x:road.x-Math.sin(road.heading)*offset,y:road.y+Math.cos(road.heading)*offset};
   const dt=previous?f.time-previous.time:0,progress=previous?f.s-previous.s:0;
   const continuous=!!previous&&dt>0&&dt<=.100001&&progress>=0;
   let tangent=road.heading;
   if(continuous&&progress>.01&&Math.hypot(reference.x-previous.reference.x,reference.y-previous.reference.y)>.01)tangent=Math.atan2(reference.y-previous.reference.y,reference.x-previous.reference.x);
   const heading=speed>1?Math.atan2(f.vy,f.vx):f.yaw,beta=wrap(heading-f.yaw);
   const pathError=finite(f.pathError)?f.pathError:(f.x-reference.x)*-Math.sin(tangent)+(f.y-reference.y)*Math.cos(tangent);
   const headingError=wrap(heading-tangent),turnRate=continuous?wrap(heading-previous.heading)/dt:0;
   const growth=continuous?(Math.abs(pathError)-Math.abs(previous.pathError))/dt:0;
   const slipGrowth=continuous?(Math.abs(beta)-Math.abs(previous.beta))/dt:0;
   const threshold=Math.max(.6,Math.min(1.4,((road.widthLeft??track.width/2)+(road.widthRight??track.width/2))*.055||.8));
   const outward=Math.sign(pathError)*headingError;
   const path=speed>=3&&Math.abs(pathError)>=threshold&&(outward>6*DEG||growth>.45||Math.abs(pathError)>2*threshold&&Math.abs(headingError)>12*DEG);
   const excessSlip=finite(f.targetSlip)&&Math.abs(beta)>Math.abs(f.targetSlip)+12*DEG;
   const spin=speed>=3&&Math.abs(beta)>=55*DEG&&(Math.abs(beta)>=70*DEG||excessSlip)&&slipGrowth>5*DEG&&Math.abs(f.r||0)>.35;
   const feature={i,time:f.time,s:f.s,speed,reference,heading,beta,pathError,headingError,turnRate,dt:continuous?dt:0,
    zoneIndex,core:!!zone&&f.s>=zone.cornerStart&&f.s<=zone.exit,threshold,path,spin,growth,slipGrowth,
    yawRate:finite(f.r)?f.r:null,steer:finite(f.steer)?f.steer:null,correction:finite(f.driverSteerCorrection)?f.driverSteerCorrection:null,
    slipError:finite(f.targetSlip)?wrap((finite(f.predictedSlip)?f.predictedSlip:beta)-f.targetSlip):null,
    steerRate:continuous&&finite(f.steer)&&finite(previous.steer)?(f.steer-previous.steer)/dt:null,
    demand:finite(p.gripCoefficient)&&p.gripCoefficient>0&&finite(road.curvature)?speed*speed*Math.abs(road.curvature)/(9.81*p.gripCoefficient):null};
   features.push(feature);
   if(!continuous)episode=null;
   if(path||spin){
    if(!episode)episode={index:features.length-1,adverseTime:0,distance:0,recoveryTime:0};
    episode.adverseTime+=feature.dt;episode.distance+=speed*feature.dt;episode.recoveryTime=0;
   }else if(episode){
    const recovered=Math.abs(pathError)<threshold*.6&&Math.abs(headingError)<5*DEG&&slipGrowth<5*DEG;
    episode.recoveryTime=recovered?episode.recoveryTime+feature.dt:0;
    if(episode.recoveryTime>=.5)episode=null;
   }
   previous=feature;
  }
  const stop=stoppedRun(p,frames,features,failure,result.status);if(stop)return stop;
  if(!episode||episode.adverseTime<.3||episode.distance<2.5||features.length<3)return unknown();
  const originFrame=features[episode.index],end=features.at(-1),span=features.slice(episode.index),hypotheses=[],recommended=new Set(['line','combined']);
  let maxPath=0,maxHeading=0,maxSlip=0,maxDemand=0,saturation=0,counter=0,demandTime=0,oppositeTime=0,oppositeLongest=0,oppositeZone=null,oppositeRunZone=null,priorDriftTime=0,slipErrorMax=0,demandFrame=null;
  for(const f of span){
   maxPath=Math.max(maxPath,Math.abs(f.pathError));maxHeading=Math.max(maxHeading,Math.abs(f.headingError));maxSlip=Math.max(maxSlip,Math.abs(f.beta));
   const adverse=f.path||f.spin;
   if(adverse&&f.core&&f.zoneIndex!==null&&end.zoneIndex!==null&&f.zoneIndex<end.zoneIndex&&Math.abs(f.beta)>=10*DEG)priorDriftTime+=f.dt;
   const limited=finite(p.maxSteer)&&f.steer!==null&&Math.abs(f.steer)>=p.maxSteer*.95||finite(p.steerRate)&&f.steerRate!==null&&Math.abs(f.steerRate)>=p.steerRate*.9;
   if(adverse&&limited)saturation+=f.dt;
   if(f.slipError!==null)slipErrorMax=Math.max(slipErrorMax,Math.abs(f.slipError));
   if(adverse&&f.slipError!==null&&Math.abs(f.slipError)>10*DEG&&f.correction!==null&&f.correction*Math.sign(f.slipError)<1*DEG)counter+=f.dt;
   if(adverse&&f.demand!==null&&f.demand>1.1){demandTime+=f.dt;if(f.demand>maxDemand){maxDemand=f.demand;demandFrame=f;}}
   const z=zones[f.zoneIndex];
   // A body can countersteer or keep rotating during a correct direction
   // change. Only the measured velocity trajectory, after the entry margin
   // and while a path/posture error persists, supports this observation.
   const opposing=adverse&&f.core&&f.s>z.cornerStart+Math.min(4,(z.exit-z.cornerStart)*.1)&&f.turnRate*z.sign<-.08;
   oppositeTime=opposing?(oppositeRunZone===f.zoneIndex?oppositeTime:0)+f.dt:0;
   oppositeRunZone=opposing?f.zoneIndex:null;
   if(oppositeTime>oppositeLongest){oppositeLongest=oppositeTime;oppositeZone=f.zoneIndex;}
  }
  const evidence=[{label:'실패보다 앞선 관측 시작',value:round(Math.max(0,failure.time-originFrame.time)),unit:'s'},
   {label:'지속된 경로·자세 오차',value:round(episode.adverseTime),unit:'s'},
   {label:'최대 목표선 오차',value:round(maxPath),unit:'m'},
   {label:'최대 진행 방향 오차',value:round(maxHeading/DEG),unit:'°'},
   {label:'관측 구간 최대 슬립각',value:round(maxSlip/DEG),unit:'°'}];
  const origin={time:originFrame.time,s:originFrame.s,zoneIndex:originFrame.zoneIndex};
  const earlierZone=origin.zoneIndex!==null&&end.zoneIndex!==null&&origin.zoneIndex<end.zoneIndex?origin.zoneIndex:null;
  let precedingZoneIndex=earlierZone;
  const oppositePrior=oppositeZone>0&&zones[oppositeZone-1].sign!==zones[oppositeZone].sign?oppositeZone-1:null;
  if(oppositeLongest>=.35){
   precedingZoneIndex=precedingZoneIndex??oppositePrior;
   hypotheses.push({kind:oppositePrior!==null?'opposite-turn-persistence':'opposite-trajectory-turn',confidence:'medium',summary:oppositePrior!==null?'반대 방향 코너에 들어간 뒤에도 실제 이동 궤적이 앞 코너 방향으로 돌아가는 구간이 이어졌습니다. 자세 전환 시점이 늦었을 가능성을 확인해야 합니다.':'코너 안에서 실제 이동 궤적이 코스가 꺾이는 방향과 반대로 돌아가는 구간이 이어졌습니다. 진입 자세와 조향 시점을 점검할 필요가 있습니다.'});
   evidence.push({label:'코너 반대 방향으로 궤적 회전',value:round(oppositeLongest),unit:'s'});recommended.add('timing');recommended.add('lead');
  }
  if(earlierZone!==null&&priorDriftTime>=.35){
   hypotheses.push({kind:'prior-drift-residual',confidence:'low',summary:'앞선 코너의 미끄럼과 경로 오차가 회복되지 않은 채 다음 구간으로 이어졌을 가능성이 있습니다. 앞 코너 자체가 원인이라고 확정할 수는 없습니다.'});
   evidence.push({label:'이전 코너에서 미끄럼과 오차 동시 관측',value:round(priorDriftTime),unit:'s'});
   recommended.add('timing');recommended.add('angle');recommended.add('lead');
  }
  if(saturation>=.25){
   hypotheses.push({kind:'control-saturation',confidence:'medium',summary:'오차가 커지는 동안 실제 조향각 또는 조향 속도가 설정 한계에 가까웠습니다. 보정 시작 시점과 목표 경로를 함께 점검할 필요가 있습니다.'});
   evidence.push({label:'오차 중 조향 한계 근접 시간',value:round(saturation),unit:'s'});recommended.add('steer');recommended.add('lead');recommended.add('timing');
  }else if(counter>=.35){
   hypotheses.push({kind:'counter-response',confidence:'low',summary:'큰 슬립 목표 오차에 비해 기록된 조향 보정의 방향·크기가 충분하지 않았을 가능성이 있습니다. 목표선 보정과의 상쇄도 가능하므로 조향 부호만으로 원인을 단정하지 않습니다.'});
   evidence.push({label:'예측 슬립각과 목표 차이',value:round(slipErrorMax/DEG),unit:'°'});recommended.add('lead');recommended.add('steer');
  }
  let speedPreparation=null;
  if(demandTime>=.4&&demandFrame){
   hypotheses.push({kind:'speed-demand',confidence:'low',summary:'관측 속도와 코스 곡률로 계산한 횡가속 요구가 차량의 명목 접지 추정치를 넘었습니다. 실제 목표선과 노면의 근사가 있으므로 과속이 원인이라고 확정할 수 없습니다.'});
   evidence.push({label:'명목 접지 대비 곡률·속도 요구',value:round(maxDemand),unit:'배'});recommended.add('entry-speed');recommended.add('power');recommended.add('angle');
   // Locate a possible braking window before the observed error. This is an
   // estimate for selecting gene mutations, never an injected speed limit.
   const targetSpeed=demandFrame.speed/Math.sqrt(maxDemand),deceleration=.55*Math.min(p.brakeAcceleration||9.8,9.81*(p.gripCoefficient||1));
   const observedSpeed=Math.max(originFrame.speed,demandFrame.speed),distance=Math.max(0,(observedSpeed**2-targetSpeed**2)/(2*deceleration))+observedSpeed*.4;
   speedPreparation={targetS:demandFrame.s,observedSpeed,targetSpeed,requiredDistanceM:distance,brakingStartS:Math.max(2.5,demandFrame.s-distance),deceleration};
   evidence.push({label:'사전 감속 탐색에 필요한 추정 거리',value:round(distance),unit:'m'});
  }
  // Include preparation before the observed divergence, without labelling
  // that earlier, possibly normal, driving as a proven cause.
  let startS=Math.max(2.5,origin.s-clamp(originFrame.speed*.8,8,35));
  if(speedPreparation)startS=Math.min(startS,speedPreparation.brakingStartS);
  if(precedingZoneIndex!==null){const prior=zones[precedingZoneIndex];if(prior)startS=Math.min(startS,Math.max(2.5,prior.exit-clamp(originFrame.speed*.8,10,35)));}
  let startTime=origin.time;for(const f of features){if(f.s>=startS){startTime=f.time;break;}}
  const kind=span.some(f=>f.path)?'trajectory-divergence':'spin-development';
  return {version:VERSION,kind,summary:'실패 '+Math.max(0,failure.time-origin.time).toFixed(1)+'초 전부터 '+(kind==='trajectory-divergence'?'목표선 오차와 진행 방향의 어긋남':'슬립각 증가와 차체 회전')+'이 지속된 기록이 확인됩니다. 원인 가설은 별도로 표시합니다.',
   failure,origin,window:{startS,endS:failure.s,startTime,endTime:failure.time},evidence,hypotheses,recommendedFamilies:[...recommended],...(speedPreparation?{speedPreparation}:{}),...(precedingZoneIndex!==null?{precedingZoneIndex}:{})};
 }
 const api=Object.freeze({VERSION,analyze});root.DriftFailureAnalysis=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
