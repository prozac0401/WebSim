/* Causal full-course points. A completed replay validates the accumulated
 * total; later angle/pace changes never rewrite earlier earned points. */
(function(root){
 'use strict';
 const DEG=Math.PI/180,CHAIN_METRES=60,MAX_MULTIPLIER=2,ZONE_MULTIPLIER=2;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
 const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
 const finite=(x,fallback=0)=>Number.isFinite(x)?x:fallback;
 const isSpin=frame=>frame.status==='spin'||frame.speed>=3&&Math.abs(frame.beta||0)>=75*DEG;
 function zones(track){
  const ranges=(track.zones||[]).map(zone=>{
   // Same longitudinal geometry as renderer._road: s is the strip's START.
   const start=finite(zone.s,finite(zone.startS,finite(zone.start)));
   const length=finite(zone.length,finite(zone.endS,start+13)-start);
   return {start:clamp(start,2.5,track.length),end:clamp(start+length,2.5,track.length)};
  }).filter(z=>z.end>z.start).sort((a,b)=>a.start-b.start),union=[];
  for(const z of ranges){const previous=union.at(-1);if(previous&&z.start<=previous.end)previous.end=Math.max(previous.end,z.end);else union.push({...z});}
  return union;
 }
 function paceProfile(track,record=[]){
  if(record.length<2)return null;
  const start=2.5,step=2,speeds=[];let i=0;
  for(let s=start;s<track.length+step;s+=step){
   const at=Math.min(track.length,s);while(i<record.length-2&&record[i+1].s<at)i++;
   const a=record[i],b=record[i+1],u=clamp((at-a.s)/Math.max(1e-9,b.s-a.s),0,1);
   speeds.push(Math.max(0,finite(a.speed)+(finite(b.speed)-finite(a.speed))*u));
  }
  return {start,step,end:track.length,speeds};
 }
 function paceAt(profile,s){
  if(!profile?.speeds?.length)return 0;
  const t=clamp((s-profile.start)/profile.step,0,profile.speeds.length-1),i=Math.floor(t),next=Math.min(i+1,profile.speeds.length-1);
  return profile.speeds[i]+(profile.speeds[next]-profile.speeds[i])*(t-i);
 }
 function chainArea(from,gain){
  if(!(gain>0))return 1+clamp(from/CHAIN_METRES,0,1);
  const ramp=Math.min(gain,Math.max(0,CHAIN_METRES-from));
  return ((1+from/CHAIN_METRES)*ramp+ramp*ramp/(2*CHAIN_METRES)+MAX_MULTIPLIER*(gain-ramp))/gain;
 }
 class Accumulator{
  constructor(track,{referencePace=null,links=[],corners=[]}={}){
   this.track=track;this.zones=zones(track);this.referencePace=referencePace;this.links=links;this.corners=corners;
   this.highWater=2.5;this.parts={base:0,continuity:0,zone:0};this.total=0;
   this.chainDistance=0;this.chainEffectiveDistance=0;this.chainSign=0;this.transition=null;this.usedTransitions=new Set();
   this.maxChainDistance=0;this.maxMultiplier=1;this.scoredDistance=0;this.zoneDistance=0;this.angleIntegral=0;
   this.previousCurvature=null;this.actualReference=0;this.referenceRun=null;this.spinDetected=false;
   this.cornerIndex=-1;this.gripRecovery={duration:0,distance:0};this.recoveredEntry=null;
  }
  reset(){this.chainDistance=0;this.chainEffectiveDistance=0;this.chainSign=0;this.transition=null;}
  multiplier(){return 1+clamp(this.chainEffectiveDistance/CHAIN_METRES,0,1);}
  step(frame,previous,{referenceSpeed=0}={}){
   const dt=previous?frame.time-previous.time:0,progress=previous?frame.s-previous.s:0;
   const distance=previous?Math.hypot(frame.x-previous.x,frame.y-previous.y):0;
   const angle=Math.abs(frame.beta||0)/DEG,sign=Math.sign(frame.beta||0),speed=finite(frame.speed);
   const lo=Math.max(2.5,previous?.s??frame.s,this.highWater),hi=Math.min(this.track.length,frame.s);
   const moving=!!previous&&dt>0&&dt<.1&&progress>0&&distance>0&&distance<=Math.max(previous.speed,speed)*dt*1.2+.02&&progress<=Math.max(previous.speed,speed)*dt*4+.05;
   const fresh=moving&&hi>lo?Math.min(distance,progress)*(hi-lo)/progress:0;
   this.highWater=Math.max(this.highWater,Math.min(this.track.length,finite(frame.s,2.5)));
   const spinning=isSpin(frame);if(spinning){this.spinDetected=true;this.recoveredEntry=null;this.gripRecovery={duration:0,distance:0};}
   if(!spinning&&moving&&fresh>0&&angle<10){
    this.gripRecovery.duration+=dt;this.gripRecovery.distance+=fresh;
    if(this.cornerIndex>=0&&!this.gripRecovery.qualified&&this.gripRecovery.duration>=.5&&this.gripRecovery.distance>=8){
     this.recoveredEntry={fromCorner:this.cornerIndex,peak:0};this.gripRecovery.qualified=true;
    }
   }else{
    this.gripRecovery={duration:0,distance:0};
    if(!moving||fresh<=0)this.recoveredEntry=null;
   }
   // Keep a qualified recovery through an early entry before the next core.
   // Its subsequent drift peak must survive the eventual reference change.
   if(!spinning&&this.recoveredEntry&&moving&&fresh>0&&angle>=10&&angle<=70&&speed>=8)this.recoveredEntry.peak=Math.max(this.recoveredEntry.peak,speed);
   let referenceReset=false;
   if(moving&&fresh>0)for(let index=this.cornerIndex+1;index<this.corners.length;index++){
    const corner=this.corners[index];if(frame.s<corner.cornerStart)break;
    // Only crossing a distinct later physical core permits a new speed
    // basis, and only after a real grip recovery. Expanded apex windows,
    // empty straights and painted ZONE boundaries are not reset events.
    if(this.cornerIndex>=0&&previous.s<corner.cornerStart&&this.recoveredEntry&&index>this.recoveredEntry.fromCorner){
     this.actualReference=this.recoveredEntry.peak;referenceReset=true;
     this.recoveredEntry=null;this.gripRecovery={duration:0,distance:0};
    }
    this.cornerIndex=index;
   }
   // Full-course reference, including straights outside the legacy apex
   // detector. A short feint is provisional; sustained drift fixes a causal
   // speed basis that a release/restart alone cannot lower.
   if(!spinning&&moving&&fresh>0&&angle>=10&&angle<=70&&speed>=8){
    if(!this.referenceRun||this.referenceRun.sign!==sign)this.referenceRun={sign,duration:0,distance:0,peak:speed};
    const run=this.referenceRun;run.duration+=dt;run.distance+=fresh;run.peak=Math.max(run.peak,speed);
    if(run.duration>=.25-1e-9&&run.distance>=3-1e-9)this.actualReference=Math.max(this.actualReference,run.peak);
   }else this.referenceRun=null;
   const reference=Math.max(referenceSpeed,paceAt(this.referencePace,frame.s)*.8,this.actualReference,this.referenceRun?.peak||0);
   const retention=reference>0?speed/reference:0,angleQ=clamp((Math.sin(angle*DEG)-Math.sin(2*DEG))/(Math.sin(70*DEG)-Math.sin(2*DEG)),0,1);
   const speedQ=reference>0?smooth((retention-.7)/.25)*smooth((speed-5)/7):0;
   const curvature=moving?wrap(Math.atan2(frame.vy,frame.vx)-Math.atan2(previous.vy,previous.vx))/distance:0;
   const change=this.previousCurvature===null?0:(curvature-this.previousCurvature)/Math.max(distance,1e-9);
   const roadCurvature=moving?finite(this.track.sample?.((previous.s+frame.s)/2)?.curvature):0;
   const direction=Math.abs(roadCurvature)>.004?smooth(curvature/roadCurvature):1;
   const curveQ=moving?direction/(1+(change/.02)**2):0;this.previousCurvature=moving?curvature:null;
   const conditions={area:hi>lo||frame.s>=2.5&&frame.s<=this.track.length,angle:angle>=10&&angle<=70,speed:speed>=8,retention:retention>.7,forward:moving&&fresh>0};
   const eligible=Object.values(conditions).every(Boolean)&&!spinning;
   const zoneMultiplier=this.zones.some(z=>frame.s>=z.start&&frame.s<z.end)?ZONE_MULTIPLIER:1;
   let transitioning=false,reset=spinning,baseDelta=0,delta=0;
   const compatible=eligible&&(!this.chainSign||sign===this.chainSign);
   if(this.chainSign&&!compatible){
    const link=this.transition?.link||this.links.find(z=>z.fromSign!==z.toSign&&-z.fromSign===this.chainSign&&frame.s>=z.straightStart&&frame.s<=z.straightEnd&&!this.usedTransitions.has(z.id));
    const smoothTransition=!spinning&&moving&&fresh>0&&speed>=8&&retention>.7&&Math.abs(wrap((frame.beta||0)-(previous.beta||0)))/dt<=4;
    if(link&&smoothTransition&&(angle<10||this.transition&&eligible&&sign===-link.toSign)){
     if(!this.transition){this.transition={link,startTime:previous.time,distance:0};this.usedTransitions.add(link.id);}
     this.transition.distance+=fresh;
     const within=frame.s<=link.straightEnd&&frame.time-this.transition.startTime<=.35+1e-9&&this.transition.distance<=Math.min(8,(link.straightEnd-link.straightStart)*.25)+1e-9;
     if(within){transitioning=true;if(eligible&&sign===-link.toSign){this.chainSign=sign;this.transition=null;transitioning=false;}}
     else{this.reset();reset=true;}
    }else{this.reset();reset=true;}
   }else if(this.transition){this.reset();reset=true;}
   if(!eligible&&!transitioning){if(this.chainSign||this.chainEffectiveDistance>0)reset=true;this.reset();}
   if(eligible&&!transitioning){
    if(!this.chainSign)this.chainSign=sign;
    const cuts=[lo,hi];for(const z of this.zones)for(const boundary of [z.start,z.end])if(boundary>lo&&boundary<hi)cuts.push(boundary);
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
     const start=cuts[i-1],end=cuts[i],metres=fresh*(end-start)/(hi-lo),quality=angleQ*speedQ*(.25+.75*curveQ),gain=metres*angleQ*speedQ;
     const base=metres*quality,chain=chainArea(this.chainEffectiveDistance,gain),zone=this.zones.some(z=>(start+end)/2>=z.start&&(start+end)/2<z.end)?ZONE_MULTIPLIER:1;
     const continuity=base*(chain-1),bonus=(base+continuity)*(zone-1);
     this.parts.base+=base;this.parts.continuity+=continuity;this.parts.zone+=bonus;baseDelta+=base;delta+=base+continuity+bonus;
     this.chainEffectiveDistance+=gain;this.chainDistance+=metres;this.scoredDistance+=metres;if(zone===2)this.zoneDistance+=metres;
     this.angleIntegral+=angle*metres;
    }
    this.total+=delta;this.maxChainDistance=Math.max(this.maxChainDistance,this.chainDistance);this.maxMultiplier=Math.max(this.maxMultiplier,this.multiplier());
   }
   return {baseDelta,delta,chainMultiplier:this.multiplier(),zoneMultiplier,combinedMultiplier:this.multiplier()*zoneMultiplier,
    appliedMultiplier:baseDelta>0?delta/baseDelta:this.multiplier()*zoneMultiplier,chainDistance:this.chainDistance,chainEffectiveDistance:this.chainEffectiveDistance,
    spinning,transitioning,chainReset:reset,referenceReset,referenceScope:this.corners[this.cornerIndex]?.id||'course',quality:{angle:angleQ,speed:speedQ,curve:curveQ},conditions,referenceSpeed:reference,speedRetention:retention,
    phase:spinning?'spin':transitioning?'transition':zoneMultiplier===2?'zone':'course',parts:{...this.parts},potentialScore:this.total};
  }
  summary(){return {score:this.total,parts:{...this.parts},chainMultiplier:this.multiplier(),maxMultiplier:this.maxMultiplier,chainDistance:this.chainDistance,chainEffectiveDistance:this.chainEffectiveDistance,
   maxChainDistance:this.maxChainDistance,scoredDistance:this.scoredDistance,zoneDistance:this.zoneDistance,meanAngle:this.scoredDistance>0?this.angleIntegral/this.scoredDistance:0};}
 }
 function signature(){return [CHAIN_METRES,MAX_MULTIPLIER,ZONE_MULTIPLIER,...[clamp,wrap,smooth,finite,isSpin,zones,paceProfile,paceAt,chainArea,Accumulator].map(String)].join('\n');}
 const api=Object.freeze({VERSION:2,CHAIN_METRES,MAX_MULTIPLIER,ZONE_MULTIPLIER,isSpin,zones,paceProfile,paceAt,Accumulator,signature});root.DriftCourseScoring=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
