/* Offline only: search and physically validate the grip reference. */
'use strict';
const {DT,torqueAt,initialState,step,evaluateGene}=require('./physics.js');
const Genome=require('./genome.js');
const Driver=require('./driver.js');
const G=9.81,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),cfg=v=>v.physics||v;
  function speedProfile(v,track,aggression,line=track,brakingScale=1){
    const p=cfg(v),points=line.points,mu=p.gripCoefficient||1;
    // Brake earlier with a light, high rear axle: the prototype's fixed rear
    // brake share is .38 and deceleration transfers load to the front. This is
    // a driver envelope, not ABS or a change to the vehicle's braking force.
    const rearSafeBraking=mu*G*(1-(p.frontWeightFraction||.52))/(.38+mu*(p.cgHeightM||.5)/p.wheelbaseM)*.55;
    const braking=brakingScale*Math.min(4.2,(p.brakeAcceleration||9.8)*.55,mu*G*.55,rearSafeBraking);
    const acceleration=Math.min(3.2,mu*G*(1-(p.frontWeightFraction||.52))*.72);
    // The vehicle's stock speed limit and physical braking/curvature envelope
    // determine pace. No arbitrary 90 km/h or post-judging cruising ceiling.
    const speed=points.map(q=>Math.min(p.topSpeedMps||Infinity,
      Math.sqrt(aggression*mu*G/Math.max(Math.abs(q.curvature),.001))));
    speed[speed.length-1]=Math.min(speed[speed.length-1],8);
    // This is an open start/finish envelope; neither pass wraps across a seam.
    for(let i=speed.length-2;i>=0;i--){const ds=Math.hypot(points[i+1].x-points[i].x,points[i+1].y-points[i].y);speed[i]=Math.min(speed[i],Math.sqrt(speed[i+1]**2+2*braking*ds));}
    // Start from rest, retaining a little look-ahead acceleration allowance for
    // the feedback driver. Actual force/power limits remain in step().
    speed[0]=Math.min(speed[0],2);
    for(let i=1;i<speed.length;i++){const ds=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);speed[i]=Math.min(speed[i],Math.sqrt(speed[i-1]**2+2*acceleration*ds));}
    return {speed,acceleration,braking,at(s){let lo=0,hi=points.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].s<=s)lo=mid;else hi=mid;}const t=clamp((s-points[lo].s)/Math.max(1e-9,points[hi].s-points[lo].s),0,1);return speed[lo]+(speed[hi]-speed[lo])*t;}};
  }
  function buildGripBaseline(v,track,{knots=Genome.KNOTS}={}){
    if(knots!==Genome.KNOTS)throw new RangeError('Grip baseline requires the shared genome knot count.');
    const p=cfg(v),attempts=[],lineBuilder=require('./grip-line.js'),lineBounds=Genome.corridorBounds(v,track);
    if(!lineBuilder)throw new Error('Load DriftGripLine before building the grip baseline.');
    const lines=lineBuilder.candidates(track,v);let best=null;
    function attempt(line,aggression,{brakingScale=1,calibrate=false}={}){
      const profile=speedProfile(v,track,aggression,line,brakingScale),a=initialState(v,track),controls=[];
      while(a.status==='running'){
        const look=clamp(5+a.speed*.48,6,16),target=line.sample(a.s+look),angle=wrap(Math.atan2(target.y-a.y,target.x-a.x)-a.yaw);
        const steer=clamp(Math.atan2(2*p.wheelbaseM*Math.sin(angle),look),-p.maxSteer,p.maxSteer);
        const targetSpeed=profile.at(a.s+2);
        const desired=clamp((targetSpeed-a.speed)*1.7,-profile.braking,profile.acceleration);
        const ground=typeof track.surface==='function'?track.surface(a.x,a.y,a.s):null;
        const uphill=ground?G*(ground.gradientX*Math.cos(a.yaw)+ground.gradientY*Math.sin(a.yaw))/(1+ground.gradientX**2+ground.gradientY**2):0;
        const traction=desired+uphill;
        const ratio=p.gearRatios[a.gear-1]*p.finalDrive,force=torqueAt(v,a.rpm)*ratio*(p.efficiency||.9)/p.tireRadius;
        let throttle=traction>0?Math.pow(clamp((p.massKg*traction+.5*1.225*(p.dragArea||.65)*a.speed*a.speed)/Math.max(force,100),0,1),1/1.15):0;
        const slip=Math.max(...a.wheelSlip.slice(2));if(slip>.10)throttle*=clamp(1-(slip-.10)*2.5,.10,1);
        const input={steer,throttle,brake:traction<0?Math.min(.8,-traction/(p.brakeAcceleration||9.8)):0};
        const state=calibrate?{s:a.s,x:a.x,y:a.y,yaw:a.yaw,vx:a.vx,vy:a.vy,r:a.r,ax:a.ax,ay:a.ay,wheelSlip:[...a.wheelSlip]}:null;
        controls.push({s:a.s,...input,state});step(v,track,a,input);
      }
      const metadata={lineId:line.id,aggression,pathLength:line.pathLength,bendingEnergy:line.bendingEnergy,brakingScale,feedforwardFit:calibrate?'driver-residual':'raw'};
      if(a.status!=='finished'){attempts.push({...metadata,status:a.status,time:a.time,maxAngle:a.maxAngle,grip:false,stage:'feedback'});return;}
      const gene=Genome.create(),channels=Genome.CHANNELS,referenceStates=[];let j=0;
      for(let i=0;i<knots;i++){
        const s=i/(knots-1)*track.length;while(j<controls.length-2&&controls[j+1].s<s)j++;
        const u=controls[j],w=controls[Math.min(j+1,controls.length-1)],f=clamp((s-u.s)/Math.max(w.s-u.s,.0001),0,1);
        for(const key of ['steer','throttle','brake'])gene[i*Genome.STRIDE+channels[key]]=u[key]+(w[key]-u[key])*f;
        const center=track.sample(s),target=line.sample(s),nx=-Math.sin(center.heading),ny=Math.cos(center.heading);
        gene[i*Genome.STRIDE+channels.lineOffset]=clamp((target.x-center.x)*nx+(target.y-center.y)*ny,lineBounds[i].min,lineBounds[i].max);
        // Grip seed: existing feedforward plus the selected path, with no
        // target sideslip, driven-wheel slip request or gear-lock strategy.
        gene[i*Genome.STRIDE+channels.targetSlip]=0;
        gene[i*Genome.STRIDE+channels.counterLead]=.25;
        gene[i*Genome.STRIDE+channels.driveSlip]=0;
        gene[i*Genome.STRIDE+channels.gearHold]=0;
        if(calibrate){
          const state={...u.state,s};
          for(const key of ['x','y','vx','vy','r','ax','ay'])state[key]=u.state[key]+(w.state[key]-u.state[key])*f;
          state.yaw=u.state.yaw+wrap(w.state.yaw-u.state.yaw)*f;referenceStates.push(state);
        }
      }
      if(calibrate){
        // The source trace already used feedback steering. Fit its residual
        // feedforward against the same Driver law used at runtime, so that
        // the new path/yaw/slip correction is not counted twice. The chosen
        // path and zero-drift targets remain unchanged. Replaying the result
        // below, rather than this fit alone, decides whether it is usable.
        const corrected=Genome.clone(gene);
        for(let i=0;i<knots;i++){
          const command=Driver.command(v,track,referenceStates[i],gene),index=i*Genome.STRIDE+channels.steer;
          corrected[index]=clamp(gene[index]-command.driverSteerCorrection,-p.maxSteer,p.maxSteer);
        }
        gene.set(corrected);
      }
      // The replay, not the feedback driver's trace, must satisfy the unchanged
      // footprint/collision/score physics and the grip-specific limits.
      const run=evaluateGene(v,track,gene),grip=run.valid&&run.maxAngle<7&&run.peakWheelSlip<.32;
      attempts.push({...metadata,status:run.status,time:run.time,maxAngle:run.maxAngle,peakWheelSlip:run.peakWheelSlip,grip,stage:'genome-replay'});
      if(grip&&(!best||run.time<best.result.time))best={genomeVersion:Genome.VERSION,stride:Genome.STRIDE,knots:Genome.KNOTS,gene,record:run.frames,result:run,attempts,lineId:line.id,
        line:{id:line.id,pathLength:line.pathLength,maxOffset:line.maxOffset,closed:false},aggression,brakingScale,feedforwardFit:metadata.feedforwardFit};
      return grip;
    }
    // Bound offline work: establish one valid pace per candidate, then spend
    // the higher-speed search on the fastest valid path. Low-grip vehicles can
    // fall back to gentler driving without changing any stock vehicle value.
    for(const line of lines)for(const aggression of [.60,.45,.30,.22,.15])if(attempt(line,aggression))break;
    if(!best){
      // Only a failed default search uses this fallback. Earlier braking
      // reduces unloaded rear-wheel locking; residual fitting removes the
      // duplicated steering correction. Both are driver actions, with the
      // same stock vehicle, path, failure checks and grip thresholds.
      fallback:for(const line of lines)for(const aggression of [.45,.60,.30]){
        if(attempt(line,aggression,{brakingScale:.70,calibrate:true}))break fallback;
      }
    }
    if(best){
      const line=lines.find(candidate=>candidate.id===best.lineId);
      const options={brakingScale:best.brakingScale,calibrate:best.feedforwardFit==='driver-residual'};
      let low=best.aggression,high=null;
      const rejected=attempts.filter(candidate=>candidate.lineId===line.id&&candidate.brakingScale===best.brakingScale&&candidate.feedforwardFit===best.feedforwardFit&&!candidate.grip&&candidate.aggression>low).map(candidate=>candidate.aggression);
      if(rejected.length)high=Math.min(...rejected);
      else for(const aggression of [.60,.75,.90,1.0]){
        if(aggression<=low)continue;
        if(attempt(line,aggression,options))low=aggression;
        else {high=aggression;break;}
      }
      // One bisection improves the valid/rejected bracket without presenting
      // a global optimum or multiplying work across all 26 matrix entries.
      if(high!==null)attempt(line,(low+high)/2,options);
    }
    if(!best)throw new Error('유효한 그립 기준 주행을 만들지 못했습니다. '+JSON.stringify(attempts));
    best.attempts=attempts;
    best.description='열린 중앙선·곡률/거리 최적화 경로와 속도 후보를 동일 물리로 재생한 유효 그립 주행 중 최단 기록 · 제한된 탐색 근사이며 전역 최적 보장 없음';
    return best;
  }

module.exports={buildGripBaseline};
