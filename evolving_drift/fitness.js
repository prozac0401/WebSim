/* Score actual recorded tyre propulsion and continuous corner-exit drift.
 * Reading a replay never advances physics or changes the stock vehicle. */
(function(root){
'use strict';
const DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),cache=new WeakMap();
function exitZones(track){
 if(cache.has(track))return cache.get(track);const arcs=[];let run=null;
 const curvature=s=>[-4,-2,0,2,4].reduce((n,d)=>n+(track.sample(clamp(s+d,0,track.length)).curvature||0),0)/5;
 const close=()=>{if(run&&run.end-run.start>=10&&Math.abs(run.turn)>=.15)arcs.push(run);run=null;};
 for(let s=0;s<=track.length;s+=1){const c=curvature(s),sign=Math.abs(c)>.004?Math.sign(c):0;if(run&&((sign&&sign!==run.sign)||s-run.end>6))close();if(sign){if(!run)run={start:s,end:s,sign,turn:0};run.end=s;run.turn+=c;}}close();
 const zones=arcs.map((r,i)=>({...r,exit:r.end,end:Math.min(track.length-10,r.end+100,arcs[i+1]?.start??Infinity)})).filter(r=>r.start<=track.judgedEnd&&r.exit>=track.judgedStart&&r.end-r.exit>=15);const frozen=Object.freeze(zones.map(Object.freeze));cache.set(track,frozen);return frozen;
}
function measure(result,track,vehicle){
 const p=vehicle.physics||vehicle,frames=result.frames||[],zones=exitZones(track);let episode=null,run=null,totalPowerDistance=0,qualityDistance=0,exitQuality=0,best=null;const runs=[];
 function close(){if(run){run.meanThrottle/=run.duration;run.meanAngle/=run.duration;run.distanceWeightedAngle/=run.distance;run.meanRearForce/=run.duration;run.meanRearPowerW/=run.duration;run.meanRearSlip/=run.duration;run.counterFraction/=run.duration;run.meanRPM/=run.duration;run.speedGain=run.exitSpeed-run.entrySpeed;run.success=run.anchored&&run.duration+1e-8>=2&&run.distance+1e-8>=30&&run.speedGain>=-1e-8;runs.push(run);}run=null;}
 for(let i=1;i<frames.length;i++){
  const a=frames[i-1],b=frames[i],dt=b.time-a.time;if(!(dt>0&&dt<.1)){close();episode=null;continue;}
  const progress=b.s-a.s,ds=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.abs(b.beta)/DEG,rearFx=(b.wheelForces?.[2]?.fx||0)+(b.wheelForces?.[3]?.fx||0),u=b.vx*Math.cos(b.yaw)+b.vy*Math.sin(b.yaw),power=rearFx*u;
  const drifting=angle>=10&&angle<=55&&b.speed>=8&&progress>0&&ds>0&&ds<=Math.max(a.speed,b.speed)*dt*1.2+.02,sign=Math.sign(b.beta);
  if(!drifting||episode&&episode.sign!==sign)episode=null;
  if(drifting&&!episode)episode={start:a.s,sign,turns:new Map()};
  if(episode){const turn=Math.atan2(Math.sin(Math.atan2(b.vy,b.vx)-Math.atan2(a.vy,a.vx)),Math.cos(Math.atan2(b.vy,b.vx)-Math.atan2(a.vy,a.vx)));for(const z of zones)if(b.s>=z.start&&b.s<=z.exit)episode.turns.set(z.exit,(episode.turns.get(z.exit)||0)+turn);}
  const zone=zones.find(z=>b.s>=z.exit&&b.s<=z.end),inScored=b.s>=track.judgedStart&&b.s<=track.judgedEnd||!!zone;
  const drive=b.throttle>=.15&&b.brake<=.03&&b.rearTorque>0&&rearFx>p.massKg*.3&&power>0;
  const q=(angle>=10&&angle<=55?.2+.8*(angle-10)/45:0)*b.speed/Math.hypot(b.speed,12)*clamp(rearFx/(p.massKg*1.2),0,1)*clamp((.06-b.brake)/.06,0,1);
  if(inScored&&b.rearTorque>0&&b.throttle>=.1&&rearFx>0){qualityDistance+=Math.min(ds,Math.max(0,progress))*q;if(zone)exitQuality+=Math.min(ds,Math.max(0,progress))*q;}
  if(drifting&&drive){totalPowerDistance+=ds;
   const anchored=!!zone&&!!episode&&episode.start<=zone.exit-5&&(episode.turns.get(zone.exit)||0)*zone.sign>.10;
   if(run&&(!zone||run.zoneExit!==zone.exit||run.sign!==sign))close();
   if(zone){if(!run)run={start:a.s,end:b.s,startTime:a.time,endTime:b.time,distance:0,duration:0,zoneExit:zone.exit,sign,anchored,entrySpeed:a.speed,exitSpeed:b.speed,minSpeed:b.speed,meanThrottle:0,meanAngle:0,distanceWeightedAngle:0,meanRearForce:0,meanRearPowerW:0,meanRearSlip:0,counterFraction:0,meanRPM:0,maxBrake:0};run.end=b.s;run.endTime=b.time;run.distance+=ds;run.duration+=dt;run.exitSpeed=b.speed;run.minSpeed=Math.min(run.minSpeed,b.speed);run.meanThrottle+=b.throttle*dt;run.meanAngle+=angle*dt;run.distanceWeightedAngle+=angle*ds;run.meanRearForce+=rearFx*dt;run.meanRearPowerW+=power*dt;run.meanRearSlip+=((b.wheelSlip?.[2]||0)+(b.wheelSlip?.[3]||0))/2*dt;run.counterFraction+=((b.steer||0)*b.beta>0?dt:0);run.meanRPM+=(b.rpm||0)*dt;run.maxBrake=Math.max(run.maxBrake,b.brake);}
  }else close();
 }
 close();
 const angleQualityFor=r=>clamp((r.distanceWeightedAngle-10)/45,0,1);
 // Reward the actual angle sustained over the powered exit's travelled distance,
 // not a momentary peak or a larger target written in the genome. Continuity
 // remains the dominant partial reward; angle can refine an established exit.
 const progressFor=r=>Math.sqrt(clamp(r.distance/30,0,1)*clamp(r.duration/2,0,1))*clamp(1+r.speedGain/4,0,1)*(.8+.2*angleQualityFor(r));
 // Separate success from progress without flattening the unfinished search.
 // Once the time minimum is met, distance and carried speed earn the bonus;
 // deliberately slowing the same exit cannot earn extra duration points.
 const successFor=r=>60+14*clamp((r.distance-30)/70,0,1)+16*angleQualityFor(r)+6*(r.distance/r.duration)/Math.hypot(r.distance/r.duration,12)+4*clamp(r.speedGain/10,0,1);
 best=runs.filter(r=>r.anchored).sort((a,b)=>progressFor(b)-progressFor(a)||b.distance-a.distance)[0]||null;
 const sustain=best?progressFor(best):0,completed=result.valid===true&&result.status==='finished';
 const qualifying=runs.filter(r=>r.success).sort((a,b)=>successFor(b)-successFor(a)||b.distance-a.distance)[0]||null;
 const score=!completed?0:qualifying?successFor(qualifying):clamp(result.styleScore??result.score,0,100)/100+8*qualityDistance/(qualityDistance+40)+10*exitQuality/(exitQuality+20)+40*sustain;
 return {score,styleScore:result.styleScore??result.score,totalPowerDistance,qualityDistance,exitQuality,bestExit:qualifying||best,bestAttempt:best,success:completed&&!!qualifying,runs,zones};
}
function rank(vehicle,track,result,record=result.frames){const power=measure({...result,frames:record},track,vehicle);return {...result,styleScore:power.styleScore,score:power.score,power};}
function signature(){return [exitZones,measure,rank].map(String).join('\n').replace(/\r\n/g,'\n');}
const api=Object.freeze({VERSION:2,exitZones,measure,rank,signature});root.DriftFitness=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
