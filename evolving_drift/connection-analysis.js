/* Search diagnostics from measured runs, never substitute scoring or physical
 * success. Synthetic replay tests exercise analysis only, not drivability. */
(function(root){
 'use strict';
 const F=root.DriftFitness||(typeof require==='function'?require('./fitness.js'):null);
 const DEG=Math.PI/180,EPS=1e-9,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const number=v=>Number.isFinite(v)?v:null,wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
 function atTime(record,time){
  if(!Number.isFinite(time)||!record.length||time<record[0].time-EPS||time>record.at(-1).time+EPS)return null;
  for(let i=0;i<record.length;i++){
   const b=record[i];if(b.time+EPS<time)continue;
   const a=record[Math.max(0,i-1)],u=b.time>a.time?clamp((time-a.time)/(b.time-a.time),0,1):1;
   return a.s+(b.s-a.s)*u;
  }
  return null;
 }
 function measuredTurn(record,run,zone,kind){
  if(!Number.isFinite(run.startTime)||!Number.isFinite(run.endTime)||run.endTime<=run.startTime)return null;
  let previous=null,core=0,before=0,after=0,samples=0;
  for(let i=1;i<record.length;i++){
   const a=record[i-1],b=record[i],dt=b.time-a.time;
   if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||!(dt>0&&dt<.1)||b.s<=a.s||Math.hypot(b.x-a.x,b.y-a.y)<=0){previous=null;continue;}
   const heading=Math.atan2(b.y-a.y,b.x-a.x),turn=previous===null?null:wrap(heading-previous);previous=heading;
   if(turn===null||b.time<=run.startTime+EPS||b.time>run.endTime+EPS)continue;
   samples++;
   if(kind==='corner'){if(b.s>=zone.cornerStart&&a.s<=zone.exit)core+=turn*zone.sign;}
   else{
    if(b.s>=zone.start&&a.s<=zone.straightStart)before+=turn*zone.fromSign;
    if(b.s>=zone.straightEnd&&a.s<=zone.end)after+=turn*zone.toSign;
   }
  }
  if(!samples)return null;
  const required=kind==='corner'?Math.min(.25,Math.abs(zone.turn)*.25):null;
  const ratio=kind==='corner'?(required>0?core/required:null):zone.fromTurn>0&&zone.toTurn>0?Math.min(before/zone.fromTurn,after/zone.toTurn):null;
  return Number.isFinite(ratio)?clamp(ratio,0,1):null;
 }
 function descriptor(kind,item,zone,record){
  const run=kind==='corner'?item.bestArc||{}:item,start=kind==='corner'?zone.cornerStart:zone.start,end=kind==='corner'?zone.exit:zone.end;
  const actualStart=kind==='corner'?number(run.start):atTime(record,run.startTime),actualEnd=kind==='corner'?number(run.end):atTime(record,run.endTime);
  const measuredCoverage=kind==='corner'?number(run.connectionCoverage??item.connectionCoverage):number(item.coverage);
  const coverage=clamp(measuredCoverage??0,0,1),speedRetention=number(run.speedRetention),rawTurn=number(run.turnRatio)??measuredTurn(record,run,zone,kind),turnRatio=rawTurn===null?null:clamp(rawTurn,0,1);
  const complete=item.complete===true,speedLimited=speedRetention===null?null:speedRetention<.9;
  const missingBefore=actualStart===null?null:clamp(actualStart-start,0,end-start),missingAfter=actualEnd===null?null:clamp(end-actualEnd,0,end-start);
  // Corner completion uses the weaker apex-side fraction. Raw metres can
  // point to the opposite side when the two required spans differ in length.
  const knownRange=actualStart!==null&&actualEnd!==null;
  const entryCoverage=kind==='corner'&&knownRange?clamp((Math.min(actualEnd,zone.apex)-Math.max(actualStart,start))/Math.max(1e-9,zone.apex-start),0,1):null;
  const exitCoverage=kind==='corner'&&knownRange?clamp((Math.min(actualEnd,end)-Math.max(actualStart,zone.apex))/Math.max(1e-9,end-zone.apex),0,1):null;
  const relevant=record.filter(f=>f.s>=start-EPS&&f.s<=end+EPS);
  const partial=coverage<1-EPS;
  const preferredBoundary=!partial||!knownRange?null:kind==='corner'?(entryCoverage<=exitCoverage?'entry':'exit'):(missingBefore>missingAfter?'entry':'exit');
  let reason=complete?'complete':partial?(actualStart===null||actualEnd===null?'entry':missingBefore>EPS&&missingAfter>EPS?'gap':missingBefore>EPS?'entry':missingAfter>EPS?'exit':'gap'):speedLimited?'speed':'turn';
  // Geometry chooses the boundary to work on. Evidence is always an actual
  // recorded sample; speed loss elsewhere in the window stays independently
  // visible even when a missing entry/exit is the primary search target.
  let target=reason==='entry'?actualStart??start:reason==='exit'?actualEnd??end:reason==='gap'?(preferredBoundary==='entry'?actualStart:actualEnd)??start:start;
  let evidence=null,evidenceSource=null;
  const minimumSpeed=number(run.minSpeed);
  if(reason==='speed'){
   const window=record.filter(f=>f.s>=(kind==='corner'?zone.start:zone.straightStart)&&f.s<=(kind==='corner'?zone.end:zone.straightEnd)&&Number.isFinite(f.speed));
   // A slower later grip sample did not necessarily contribute to the
   // scorer's regional minimum. Match the measured minimum before tracing
   // its earlier braking episode; never silently substitute that grip dip.
   if(minimumSpeed!==null){
    evidence=window.find(f=>Math.abs(f.speed-minimumSpeed)<=Math.max(1e-8,Math.abs(minimumSpeed)*1e-9))||null;
    evidenceSource=evidence?'metric-minimum':'metric-minimum-unobserved';
   }else{
    evidence=window.reduce((best,f)=>!best||f.speed<best.speed?f:best,null);
    evidenceSource=evidence?'window-minimum':null;
   }
  }else if(reason!=='complete'){
   const before=reason==='entry'||reason==='gap'&&preferredBoundary==='entry';
   const boundary=relevant.filter(f=>before?f.s<target-EPS:f.s>target+EPS);
   const candidates=boundary.length?boundary:relevant;
   evidence=candidates.reduce((best,f)=>!best||Math.abs(f.s-target)<Math.abs(best.s-target)?f:best,null);
  }
  const breakS=evidence?evidence.s:null;
  let source=null;
  if(breakS!==null)for(const f of record){
   if(f.s>breakS+EPS||f.s<start-(end-start)||!Number.isFinite(f.beta)||!Number.isFinite(f.speed))continue;
   const angle=Math.abs(f.beta)/DEG,sign=kind==='corner'?-zone.sign:(f.s<=zone.straightStart?-zone.fromSign:f.s>=zone.straightEnd?-zone.toSign:Math.sign(f.beta));
   if(angle>=10&&angle<=70&&f.speed>=8&&Math.sign(f.beta)===sign)source=f;
  }
  const unknown=[];
  if(measuredCoverage===null)unknown.push('coverage');if(actualStart===null||actualEnd===null)unknown.push('actual-range');
  if(speedRetention===null)unknown.push('speed-retention');if(turnRatio===null)unknown.push('turn');if(!record.length)unknown.push('record');
  if(reason==='speed'&&minimumSpeed!==null&&!evidence)unknown.push('minimum-speed-evidence');
  const speedProgress=speedRetention===null?0:clamp(speedRetention/.9,0,1);
  const progress=complete?1:Math.min(1-1e-6,coverage*(.5+.25*(turnRatio??0)+.25*speedProgress));
  return {id:zone.id,kind,zoneId:kind==='corner'?zone.id:null,fromZoneId:kind==='link'?zone.fromZoneId:null,toZoneId:kind==='link'?zone.toZoneId:null,
   start,end,actualStart,actualEnd,coverage,entryCoverage,exitCoverage,preferredBoundary,speedRetention,turnRatio,complete,progress,reason,speedLimited,missingBefore,missingAfter,breakS,sourceS:source?.s??null,
   minimumSpeed,evidenceSource,
   transitionDuration:kind==='link'?number(item.transitionDuration):null,transitionDistance:kind==='link'?number(item.transitionDistance):null,
   transitionLimitSeconds:kind==='link'&&zone.fromSign!==zone.toSign ? .35 : null,
   transitionLimitDistance:kind==='link'&&zone.fromSign!==zone.toSign?Math.min(8,(zone.straightEnd-zone.straightStart)*.25):null,
   uncertain:unknown.length>0,unknown,turnSource:turnRatio===null?null:Number.isFinite(run.turnRatio)?'metric':'replay',
   evidence:evidence?{s:evidence.s,time:evidence.time,speed:number(evidence.speed),angle:Number.isFinite(evidence.beta)?Math.abs(evidence.beta)/DEG:null}:null};
 }
 function measure(track,metric={},record=[]){
  const frames=Array.isArray(record)?record.filter(f=>f&&Number.isFinite(f.s)&&Number.isFinite(f.time)):[];
  const corners=[],connections=[];
  if(!track||typeof track.sample!=='function'||!Number.isFinite(track.length)||track.length<=0)return {regions:[],corners,links:connections};
  const zones=F.apexZones(track),links=F.straightLinks(track);
  for(const item of Array.isArray(metric?.arcs)?metric.arcs:[]){const zone=zones.find(z=>z.id===item.zoneId);if(zone)corners.push(descriptor('corner',item,zone,frames));}
  for(const item of Array.isArray(metric?.links)?metric.links:[]){const link=links.find(z=>z.id===item.id);if(link)connections.push(descriptor('link',item,link,frames));}
  return {regions:[...corners,...connections],corners,links:connections};
 }
 const api=Object.freeze({measure});root.DriftConnectionAnalysis=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis==='undefined'?window:globalThis);
