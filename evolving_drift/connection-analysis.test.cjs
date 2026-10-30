'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Fitness=require('./fitness.js'),Analysis=require('./connection-analysis.js');
const DEG=Math.PI/180,vehicle={physics:{massKg:1500}};
// Analytic telemetry fixtures test diagnosis, not a physically successful car.
function fixture({opposite=false,angleGap=false,slow=false,late=false}={}){
 const track={id:'synthetic-connection',length:240,judgedStart:5,judgedEnd:225,sample:s=>({curvature:s>=35&&s<=80?.015:s>=140&&s<=190?(opposite?-.015:.015):0})};
 const record=[];let x=0,y=0,heading=0,time=0;
 for(let s=0;s<=240;s+=.25){
  const speed=slow&&s>=112?16:20;
  let beta=-30*DEG;
  if(opposite){const phase=Math.max(0,Math.min(1,(s-107)/6));beta=(-30+60*phase)*DEG;}
  if(angleGap&&s>=100&&s<=120||late&&s<50)beta=0;
  record.push({s,time,x,y,speed,beta,vx:speed*Math.cos(heading),vy:speed*Math.sin(heading),yaw:heading-beta,r:0,throttle:.6,brake:0,rearTorque:2000,wheelForces:[{},{},{fx:1000},{fx:1000}],status:s===240?'finished':'running'});
  const k=track.sample(s+.125).curvature;x+=.25*Math.cos(heading+k*.125);y+=.25*Math.sin(heading+k*.125);heading+=k*.25;time+=.25/speed;
 }
 const raw={valid:true,status:'finished',time:record.at(-1).time,frames:record};
 const metric=Fitness.measure(raw,track,vehicle);
 return {track,record,metric,analysis:Analysis.measure(track,metric,record)};
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

test('same-direction link analysis uses the scorer result and the winning replay interval',()=>{
 const {track,record,metric,analysis}=fixture(),link=analysis.links[0],zone=Fitness.straightLinks(track)[0];
 assert.equal(metric.links[0].complete,true);assert.equal(link.complete,true);assert.equal(link.reason,'complete');assert.equal(link.progress,1);
 assert.equal(link.start,zone.start);assert.equal(link.end,zone.end);assert.ok(Math.abs(link.actualStart-zone.start)<1e-8);assert.ok(link.actualEnd>=zone.end);
 assert.equal(link.coverage,metric.links[0].coverage);assert.ok(link.turnRatio>=1-1e-9);assert.equal(link.breakS,null);assert.equal(link.sourceS,null);
 assert.ok(record.some(frame=>frame.time===metric.links[0].endTime));
});

test('opposite-direction links retain the exact scorer transition limits and measured duration',()=>{
 const {track,metric,analysis}=fixture({opposite:true}),link=analysis.links[0],zone=Fitness.straightLinks(track)[0];
 assert.equal(metric.links[0].complete,true);assert.equal(link.complete,true);assert.equal(link.reason,'complete');
 assert.equal(link.transitionDuration,metric.links[0].transitionDuration);assert.ok(link.transitionDuration>0);
 assert.equal(link.transitionLimitSeconds,.35);assert.equal(link.transitionLimitDistance,Math.min(8,(zone.straightEnd-zone.straightStart)*.25));
});

test('full spatial coverage with a speed deficit requests speed work instead of another bridge',()=>{
 const {record,metric,analysis}=fixture({slow:true}),link=analysis.links[0];
 assert.equal(metric.links[0].coverage,1);assert.equal(metric.links[0].complete,false);
 assert.equal(link.reason,'speed');assert.equal(link.speedLimited,true);assert.ok(Math.abs(link.speedRetention-.8)<1e-8);
 assert.ok(link.progress<1&&link.progress>0);assert.ok(record.some(f=>f.s===link.breakS&&f.speed===link.evidence.speed));assert.equal(link.evidence.speed,16);
});

test('an angle interruption prioritizes missing connection while retaining independent speed evidence',()=>{
 const {record,analysis}=fixture({angleGap:true,slow:true}),link=analysis.links[0];
 assert.ok(link.coverage<1);assert.ok(['entry','exit','gap'].includes(link.reason));assert.equal(link.speedLimited,true);
 assert.ok(record.some(f=>f.s===link.breakS));assert.equal(link.evidence.angle,0);assert.ok(link.sourceS===null||record.some(f=>f.s===link.sourceS&&Math.abs(f.beta)>=10*DEG));
});

test('speed evidence identifies the scorer minimum rather than a slower later grip sample',()=>{
 const {track,metric,record}=fixture({slow:true}),zone=Fitness.apexZones(track)[1];
 const run={...metric.arcs[1].bestArc,start:zone.cornerStart,end:zone.exit,connectionCoverage:1,turnRatio:1,minSpeed:16,speedRetention:.8};
 const grip=record.find(f=>f.s>zone.exit+5&&f.s<zone.end);assert.ok(grip);
 grip.speed=12;grip.beta=0;
 const analysis=Analysis.measure(track,{arcs:[{zoneId:zone.id,connectionCoverage:1,complete:false,bestArc:run}]},record).corners[0];
 assert.equal(analysis.reason,'speed');assert.equal(analysis.minimumSpeed,16);
 assert.equal(analysis.evidence.speed,16);assert.equal(analysis.evidenceSource,'metric-minimum');
 assert.notEqual(analysis.breakS,grip.s);
 const missing=Analysis.measure(track,{arcs:[{zoneId:zone.id,connectionCoverage:1,complete:false,bestArc:{...run,minSpeed:15}}]},record).corners[0];
 assert.equal(missing.evidence,null);assert.equal(missing.evidenceSource,'metric-minimum-unobserved');
 assert.ok(missing.unknown.includes('minimum-speed-evidence'));
});

test('the 90 percent retention boundary is unchanged and missing turn remains distinct',()=>{
 const {track,metric,record}=fixture(),link=metric.links[0];
 const diagnose=retention=>Analysis.measure(track,{links:[{...link,complete:false,speedRetention:retention,turnRatio:.8}]},record).links[0];
 const below=diagnose(.9-1e-10),at=diagnose(.9);
 assert.equal(below.reason,'speed');assert.equal(below.speedLimited,true);assert.equal(at.reason,'turn');assert.equal(at.speedLimited,false);
 assert.equal(at.complete,false,'analysis cannot promote a metric that did not complete');assert.equal(at.turnRatio,.8);assert.ok(at.progress<1);
});

test('corner required bounds are core entry through exit, separate from measured episode bounds',()=>{
 const {track,metric,analysis}=fixture({late:true}),corner=analysis.corners[0],zone=Fitness.apexZones(track)[0];
 assert.equal(corner.start,zone.cornerStart);assert.equal(corner.end,zone.exit);assert.equal(corner.actualStart,metric.arcs[0].bestArc.start);
 assert.equal(corner.actualEnd,metric.arcs[0].bestArc.end);assert.equal(corner.reason,'entry');assert.ok(corner.missingBefore>0);assert.equal(corner.missingAfter,0);
 assert.equal(corner.preferredBoundary,'entry');assert.ok(corner.entryCoverage<1);assert.equal(corner.exitCoverage,1);
});

test('an asymmetric corner targets its weaker apex-side coverage even when the other side lacks more metres',()=>{
 const track={id:'synthetic-asymmetric-apex',length:220,judgedStart:5,judgedEnd:205,sample:s=>({curvature:s>=40&&s<60?.07:s>=60&&s<=160?.0056:0})};
 const zone=Fitness.apexZones(track)[0],before=zone.apex-zone.cornerStart,after=zone.exit-zone.apex;
 assert.ok(after>before*1.5,'synthetic apex intentionally gives unequal required side lengths');
 const start=zone.apex-before*.4,end=zone.apex+after*.6;
 const record=Array.from({length:441},(_,i)=>({s:i*.5,time:i*.025,x:i*.5,y:0,speed:20,beta:i*.5>=start&&i*.5<=end?-.4:0}));
 const metric={arcs:[{zoneId:zone.id,complete:false,connectionCoverage:.4,bestArc:{start,end,startTime:start/20,endTime:end/20,connectionCoverage:.4,speedRetention:1,turnRatio:1}}]};
 const target=Analysis.measure(track,metric,record).corners[0];
 assert.equal(target.reason,'gap');assert.ok(target.missingAfter>target.missingBefore,'raw distance would select the wrong side');
 assert.ok(Math.abs(target.entryCoverage-.4)<1e-12);assert.ok(Math.abs(target.exitCoverage-.6)<1e-12);
 assert.equal(target.preferredBoundary,'entry');assert.ok(target.breakS<start&&start-target.breakS<=.5+1e-9);
 assert.equal(target.coverage,.4,'authoritative coverage is preserved rather than recomputed as a new score');
});

test('missing replay leaves actual link range and turn unknown without inventing successful frames',()=>{
 const {track,metric}=fixture({slow:true}),analysis=Analysis.measure(track,metric,[]),link=analysis.links[0];
 assert.equal(link.actualStart,null);assert.equal(link.actualEnd,null);assert.equal(link.turnRatio,null);assert.equal(link.reason,'speed');
 assert.equal(link.breakS,null);assert.equal(link.sourceS,null);assert.equal(link.evidence,null);assert.equal(link.uncertain,true);assert.ok(link.unknown.includes('record'));
 for(const region of analysis.regions)assert.ok(Number.isFinite(region.progress)&&region.progress>=0&&region.progress<=1);
});

test('analysis is deterministic, accepts empty inputs and never modifies metric or replay',()=>{
 assert.deepEqual(Analysis.measure(null),{regions:[],corners:[],links:[]});
 const {track,metric,record}=fixture({angleGap:true});freeze(metric);freeze(record);
 const before=JSON.stringify({metric,record}),a=Analysis.measure(track,metric,record),b=Analysis.measure(track,metric,record);
 assert.deepEqual(a,b);assert.equal(JSON.stringify({metric,record}),before);assert.deepEqual(Analysis.measure(track,{}),{regions:[],corners:[],links:[]});
});
