'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./genome.js'),E=require('./evolution.js'),F=require('./fitness.js'),Strategies=require('./evolution-strategies.js');
const C=G.CHANNELS,DEG=Math.PI/180;
// Synthetic telemetry and ranked outcomes isolate mutation/selection mechanics.
// These fixtures do not assert that any modified genome physically completes.
function fixture({opposite=false}={}){
 const vehicle={stock:true,spec:{factoryDrive:'rwd'},physics:{wheelbaseM:2.6,widthM:1.8,lengthM:4.5,massKg:1500,maxSteer:.6,gearRatios:[4,2.7,1.8,1.3,1,.8],finalDrive:3.5,tireRadius:.34,shiftRPM:6500}};
 const track={length:300,width:14,judgedStart:10,judgedEnd:280,sample:s=>({s,x:s,y:0,heading:0,curvature:s>=50&&s<=100?.02:s>=185&&s<=240?(opposite?-.02:.02):0})};
 const record=Array.from({length:601},(_,i)=>{const s=i*.5;return {s,time:s/20,x:s,y:2,speed:20,vx:20,vy:0,yaw:.3,beta:-.3,pathError:2,driverThrottleCorrection:-.4,brake:s>=100&&s<=130?.3:0};});
 const gene=G.create();for(let k=0;k<G.KNOTS;k++){const s=k/127*track.length;gene[k*G.STRIDE+C.throttle]=.35;gene[k*G.STRIDE+C.brake]=s>=100&&s<=130?.3:0;gene[k*G.STRIDE+C.driveSlip]=.2;gene[k*G.STRIDE+C.targetSlip]=-.2;}
 const parent={id:'synthetic-parent',sequence:1,accepted:true,gene,record,result:{valid:true,status:'finished',score:12,time:15,frames:record}};
 const zones=F.apexZones(track),links=F.straightLinks(track),z=zones[0];
 const target={id:z.id,kind:'corner',zoneId:z.id,start:z.cornerStart,end:z.exit,actualStart:z.cornerStart,actualEnd:z.exit-15,coverage:.5,speedRetention:1,turnRatio:1,complete:false,progress:.5,reason:'exit',breakS:z.exit-15,sourceS:z.exit-20,missingBefore:0,missingAfter:15,speedLimited:false};
 return {vehicle,track,record,parent,zones,links,target};
}
const changed=(a,b,c)=>Array.from({length:G.KNOTS},(_,k)=>k).filter(k=>Math.abs(a[k*G.STRIDE+c]-b[k*G.STRIDE+c])>1e-12);
const deepFreeze=value=>{if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)){for(const item of Object.values(value))deepFreeze(item);Object.freeze(value);}return value;};
function propose(f,{seed=41,mode='angle',target=f.target}={}){return Strategies.connect(f.vehicle,f.track,f.parent,E.createRng(seed),{connectionTarget:target,connectionMode:mode,zones:f.zones,scale:.7});}

test('connection mutations reject incomplete, invalid and unaccepted parents and already completed targets',()=>{
 const f=fixture();
 for(const patch of [{accepted:false},{result:{...f.parent.result,valid:false,status:'offtrack'}},{result:{...f.parent.result,status:'timeout'}}]){
  assert.throws(()=>Strategies.connect(f.vehicle,f.track,{...f.parent,...patch},E.createRng(1),{connectionTarget:f.target}),/completed valid parent/);
 }
 assert.throws(()=>propose(f,{target:{...f.target,complete:true}}),/incomplete measured connection/);
});

test('seeded connection proposals are deterministic, finite normalized genomes and preserve all parent data and stock settings',()=>{
 for(const mode of ['angle','line','speed']){
  const f=fixture(),before=JSON.stringify({parent:f.parent,vehicle:f.vehicle,target:f.target});deepFreeze(f.parent);deepFreeze(f.vehicle);deepFreeze(f.target);
  const a=propose(f,{mode}),b=propose(f,{mode});
  assert.deepEqual(a,b);assert.equal(a.gene.length,1408);assert.ok(Array.from(a.gene).every(Number.isFinite));
  assert.deepEqual(G.normalize(a.gene,{maxSteerRad:.6,gearCount:6,lineBounds:G.corridorBounds(f.vehicle,f.track)}),a.gene);
  assert.notDeepEqual(a.gene,f.parent.gene);assert.equal(JSON.stringify({parent:f.parent,vehicle:f.vehicle,target:f.target}),before);
  assert.deepEqual(Object.keys(a).sort(),['change','gene']);assert.equal(f.parent.result.valid,true);assert.equal(f.parent.result.status,'finished');assert.equal(f.parent.result.score,12);
 }
});

test('angle extension adjusts a continuous tapered group of knots before or after the measured missing boundary',()=>{
 const f=fixture();
 for(const reason of ['entry','exit']){
  const target=reason==='entry'?{...f.target,reason,actualStart:f.target.start+15,actualEnd:f.target.end,breakS:f.target.start+15,missingBefore:15,missingAfter:0}:f.target;
  const child=propose(f,{target}),knots=changed(child.gene,f.parent.gene,C.targetSlip),delta=knots.map(k=>Math.abs(child.gene[k*G.STRIDE+C.targetSlip]-f.parent.gene[k*G.STRIDE+C.targetSlip]));
  assert.ok(knots.length>=5);assert.equal(knots.at(-1)-knots[0]+1,knots.length,'the envelope has no isolated interior knots');
  assert.ok(delta[0]<Math.max(...delta)&&delta.at(-1)<Math.max(...delta),'both ends taper');
  assert.equal(child.change.before,reason==='entry');assert.ok(child.change.start<target.breakS&&child.change.end>target.breakS);
  if(reason==='entry')assert.ok(target.breakS-child.change.start>child.change.end-target.breakS);
  else assert.ok(child.change.end-target.breakS>target.breakS-child.change.start);
  assert.ok(child.change.sourceS>=target.actualStart&&child.change.sourceS<=target.actualEnd);
  for(let k=0;k<G.KNOTS;k++){const s=k/127*f.track.length;if(s<=child.change.start||s>=child.change.end)assert.equal(child.gene[k*G.STRIDE+C.targetSlip],f.parent.gene[k*G.STRIDE+C.targetSlip]);}
 }
});

test('observed line error and throttle cut guide a smooth target correction toward the measured line',()=>{
 const f=fixture(),child=Strategies.connect(f.vehicle,f.track,f.parent,()=>.5,{connectionTarget:f.target,zones:f.zones,scale:.7});
 assert.equal(child.change.family,'connection-line');assert.equal(child.change.pathError,2);assert.equal(child.change.powerCut,true);
 const knots=changed(child.gene,f.parent.gene,C.lineOffset);assert.ok(knots.length>=5);
 for(const k of knots){const before=f.parent.gene[k*G.STRIDE+C.lineOffset],after=child.gene[k*G.STRIDE+C.lineOffset];assert.ok(after>before&&Math.abs(2-after)<Math.abs(2-before));}
 for(let k=0;k<G.KNOTS;k++)for(const channel of [C.targetSlip,C.throttle,C.brake,C.driveSlip,C.gearHold])assert.equal(child.gene[k*G.STRIDE+channel],f.parent.gene[k*G.STRIDE+channel]);
 assert.ok(changed(child.gene,f.parent.gene,C.steer).length>=2,'line correction recouples steering over the inherited path');
});

test('unchanged line targets and saturated pedals fall back only to a smooth local counter-lead curve',()=>{
 for(const mode of ['line','speed']){
  const f=fixture();
  if(mode==='line')for(const frame of f.record){frame.y=0;frame.pathError=0;frame.driverThrottleCorrection=0;}
  else{
   for(const frame of f.record)frame.brake=0;
   for(let k=0;k<G.KNOTS;k++){f.parent.gene[k*G.STRIDE+C.throttle]=1;f.parent.gene[k*G.STRIDE+C.brake]=0;}
  }
  const before=JSON.stringify(f.parent),child=propose(f,{mode}),knots=changed(child.gene,f.parent.gene,C.counterLead);
  assert.equal(child.change.family,'connection-fine');assert.ok(knots.length>=2);
  const ds=f.track.length/(G.KNOTS-1),deltas=knots.map(k=>Math.abs(child.gene[k*G.STRIDE+C.counterLead]-f.parent.gene[k*G.STRIDE+C.counterLead]));
  assert.equal(knots.at(-1)-knots[0]+1,knots.length);assert.ok(deltas[0]<Math.max(...deltas)&&deltas.at(-1)<Math.max(...deltas));
  for(let k=0;k<G.KNOTS;k++)for(let channel=0;channel<G.STRIDE;channel++){
   if(channel!==C.counterLead||k*ds<=child.change.start||k*ds>=child.change.end)assert.equal(child.gene[k*G.STRIDE+channel],f.parent.gene[k*G.STRIDE+channel],'fallback cannot mutate unrelated controls or distant knots');
  }
  for(const k of knots)assert.ok(k*ds>child.change.start&&k*ds<child.change.end);
  assert.equal(JSON.stringify(f.parent),before);assert.deepEqual(child,propose(f,{mode}));
 }
});

test('gap mutation follows the weaker normalized corner side instead of the larger missing distance',()=>{
 const f=fixture(),target={...f.target,reason:'gap',preferredBoundary:'entry',entryCoverage:.4,exitCoverage:.6,actualStart:f.target.start+4,breakS:f.target.start+4,missingBefore:4,missingAfter:15};
 const child=propose(f,{target});assert.equal(child.change.before,true);
 assert.ok(child.change.sourceS>target.actualStart&&child.change.sourceS<(target.actualStart+target.actualEnd)/2,'entry-side inheritance comes from the beginning of the successful episode');
 assert.ok(target.breakS-child.change.start>child.change.end-target.breakS);
});

test('speed repair changes pedals over observed prior braking rather than changing drift angles at the trough',()=>{
 const f=fixture();for(const frame of f.record){if(frame.s>=140&&frame.s<=170)frame.speed=frame.s===160?12:16;if(frame.s>=30&&frame.s<=40)frame.brake=.3;}
 for(let k=0;k<G.KNOTS;k++){const s=k/127*f.track.length;if(s>=30&&s<=40)f.parent.gene[k*G.STRIDE+C.brake]=.3;}
 const target={...f.target,kind:'link',id:f.links[0].id,zoneId:null,fromZoneId:f.links[0].fromZoneId,toZoneId:f.links[0].toZoneId,start:f.links[0].start,end:f.links[0].end,actualStart:f.links[0].start,actualEnd:f.links[0].end,coverage:1,reason:'speed',breakS:160,speedLimited:true,speedRetention:.6};
 const child=propose(f,{mode:'speed',target});assert.equal(child.change.family,'connection-speed');assert.equal(child.change.slowS,160);assert.ok(child.change.start<100&&child.change.start>90,'only the most recent braking episode is selected');assert.ok(child.change.end>160);
 const brakes=changed(child.gene,f.parent.gene,C.brake),pedals=changed(child.gene,f.parent.gene,C.throttle);assert.ok(brakes.length>=5);assert.ok(pedals.length>=brakes.length);
 for(const k of brakes){const s=k/127*f.track.length;assert.ok(s>=100&&s<=130);assert.ok(child.gene[k*G.STRIDE+C.brake]<f.parent.gene[k*G.STRIDE+C.brake]);}
 for(let k=0;k<G.KNOTS;k++)for(const channel of [C.targetSlip,C.lineOffset,C.counterLead,C.driveSlip,C.gearHold])assert.equal(child.gene[k*G.STRIDE+channel],f.parent.gene[k*G.STRIDE+channel]);
});

test('speed repair follows matching metric evidence and rejects an unrelated out-of-window trough as its fallback',()=>{
 const f=fixture(),z=f.zones[1],actual=f.record.find(r=>r.s===z.exit+1),later=f.record.find(r=>r.s===z.exit+20);
 assert.ok(actual&&later);actual.speed=12;later.speed=8;later.beta=0;
 const target={...f.target,id:z.id,zoneId:z.id,start:z.cornerStart,end:z.exit,actualStart:z.cornerStart,actualEnd:z.exit,coverage:1,reason:'speed',breakS:actual.s,
  minimumSpeed:12,evidenceSource:'metric-minimum',evidence:{s:actual.s,time:actual.time,speed:12}};
 const child=propose(f,{mode:'speed',target});assert.equal(child.change.slowS,actual.s);assert.equal(child.change.speedEvidenceSource,'metric-minimum');
 const fallback=propose(f,{mode:'speed',target:{...target,breakS:later.s,evidenceSource:null,evidence:null}});
 assert.ok(fallback.change.slowS>=z.cornerStart&&fallback.change.slowS<=z.exit);
 assert.notEqual(fallback.change.slowS,later.s);
});

test('an unobserved link minimum falls back inside the straight instead of the following corner',()=>{
 const f=fixture(),link=f.links[0];
 for(const frame of f.record)frame.speed=frame.s>=link.straightEnd+5?8:frame.s>link.straightStart+5?16:20;
 const measured={id:link.id,coverage:1,complete:false,startTime:link.start/20,endTime:link.end/20,
  distance:link.end-link.start,minSpeed:15.95,speedRetention:.7975,turnRatio:1};
 const target=require('./connection-analysis.js').measure(f.track,{links:[measured]},f.record).links[0];
 assert.equal(target.evidenceSource,'metric-minimum-unobserved');assert.equal(target.evidence,null);
 const child=propose(f,{mode:'speed',target});
 assert.ok(child.change.slowS>=link.straightStart&&child.change.slowS<=link.straightEnd);
 assert.equal(f.record.find(frame=>frame.s===child.change.slowS).speed,16);
 assert.equal(child.change.speedEvidenceSource,'required-window-minimum');
});

test('opposite-direction link changes sign through multiple interpolated knots rather than a step',()=>{
 const f=fixture({opposite:true}),link=f.links[0],mid=(f.zones[0].exit+f.zones[1].cornerStart)/2;
 for(let k=0;k<G.KNOTS;k++)f.parent.gene[k*G.STRIDE+C.targetSlip]=0;
 const target={...f.target,...link,id:link.id,kind:'link',zoneId:null,actualStart:link.start,actualEnd:mid,coverage:.5,reason:'exit',breakS:mid,missingBefore:0,missingAfter:link.end-mid};
 const child=propose(f,{target}),values=Array.from({length:G.KNOTS},(_,k)=>child.gene[k*G.STRIDE+C.targetSlip]),peak=Math.max(...values.map(Math.abs));
 const crossing=values.findIndex((v,k)=>k&&values[k-1]<0&&v>=0);
 assert.ok(crossing>0);assert.ok(values[crossing]-values[crossing-1]<peak,'direction reversal cannot jump across the full peak angle in one knot');
 assert.ok(values.some((v,k)=>k>crossing&&v>0));assert.ok(values.some((v,k)=>k<crossing&&v<0));
 const ds=f.track.length/(G.KNOTS-1),width=child.change.transitionWidth,center=child.change.transitionCenter;
 assert.ok(width>=3*ds&&width<=f.zones[1].cornerStart-f.zones[0].exit);
 let measured=0;
 for(let k=1;k<G.KNOTS;k++)if((k-1)*ds>=center-width/2&&k*ds<=center+width/2){
  const targetRate=Math.abs(values[k]-values[k-1])/(ds/20);
  assert.ok(targetRate<=2.4+1e-9,'the interior transition respects the intended 2.4 rad/s rate');measured++;
 }
 assert.ok(measured>=2,'the transition is spread over multiple gene intervals');
});

test('opposite-direction mutation uses an observed parent transition location where straight room permits',()=>{
 const f=fixture({opposite:true}),link=f.links[0],cross=Math.ceil(((f.zones[0].exit+f.zones[1].cornerStart)/2+8)*2)/2;
 for(const frame of f.record)if(frame.s>=cross)frame.beta=.3;
 for(let k=0;k<G.KNOTS;k++)f.parent.gene[k*G.STRIDE+C.targetSlip]=0;
 const target={...f.target,...link,id:link.id,kind:'link',zoneId:null,actualStart:link.start,actualEnd:cross,coverage:.5,reason:'exit',breakS:cross,missingBefore:0,missingAfter:link.end-cross};
 const child=propose(f,{target});assert.equal(child.change.transitionCenter,cross);
 assert.ok(child.change.transitionCenter-child.change.transitionWidth/2>=f.zones[0].exit);
 assert.ok(child.change.transitionCenter+child.change.transitionWidth/2<=f.zones[1].cornerStart);
});

function outcome(f,{score,coverage,valid=true}){
 const z=f.zones[0],start=z.cornerStart,end=z.apex+(z.exit-z.apex)*coverage;
 return {valid,status:valid?'finished':'offtrack',score,time:15,frames:f.record,drift:{arcs:[{zoneId:z.id,score,complete:false,connectionCoverage:coverage,bestArc:{zoneId:z.id,start,end,startTime:start/20,endTime:end/20,distance:end-start,connectionCoverage:coverage,speedRetention:1,turnRatio:1,distanceWeightedAngle:20}}],links:[]}};
}

test('weak corners and late unanchored links preserve legacy archive order and exact candidate genes before useful support exists',()=>{
 const f=fixture(),baseline={gene:f.parent.gene,record:f.record,result:outcome(f,{score:0,coverage:0}),genomeVersion:G.VERSION};
 const engines=[true,false].map(connectionSearch=>{const engine=new E.Engine(f.vehicle,f.track,{seed:84,populationSize:4,baseline,connectionSearch,rankResult:(_v,_t,r)=>r});engine.initialize();return engine;});
 const link=f.links[0],late=link.start+(link.end-link.start)*.6;
 assert.ok(late>link.start+2*f.track.length/(G.KNOTS-1));
 for(let i=0;i<24;i++){
  const jobs=engines.map(engine=>engine.planCandidate());
  assert.equal(jobs[0].parentId,jobs[1].parentId);assert.equal(jobs[0].kind,jobs[1].kind);assert.equal(jobs[0].arcIndex,jobs[1].arcIndex);
  assert.deepEqual(jobs[0].gene,jobs[1].gene,'early candidate order must consume the same random stream with connection search enabled');
  const slot=i%4,result=outcome(f,{score:[50,30,80,2][slot],coverage:[.1499,.05,.08,.12][slot]});
  if(slot===1)result.drift.links=[{...link,score:20,complete:false,coverage:.4,startTime:late/20,endTime:link.end/20,speedRetention:1,turnRatio:1}];
  engines.forEach((engine,index)=>engine.acceptCandidate(jobs[index],result));
  assert.equal(engines[0].best.id,engines[1].best.id);assert.equal(engines[0].best.result.score,engines[1].best.result.score);
  if(slot===3)assert.deepEqual(engines[0]._nicheArchives.map(pool=>pool.map(entry=>entry.id)),engines[1]._nicheArchives.map(pool=>pool.map(entry=>entry.id)),'unqualified fragments cannot inject a champion or reshuffle retained parents');
 }
 assert.equal(engines[0].snapshot().selectionStats.connectionProposals,0);
});

test('lower-total valid connection specialist stays eligible and is selected without replacing the highest displayed total',()=>{
 const f=fixture(),baseline={gene:f.parent.gene,record:f.record,result:outcome(f,{score:0,coverage:0}),genomeVersion:G.VERSION};
 const engine=new E.Engine(f.vehicle,f.track,{seed:51,populationSize:4,baseline,rankResult:(_v,_t,r)=>r});engine.initialize();
 const jobs=Array.from({length:4},()=>engine.planCandidate()),outcomes=[outcome(f,{score:50,coverage:.2}),outcome(f,{score:5,coverage:.9}),outcome(f,{score:20,coverage:.3}),outcome(f,{score:999,coverage:1,valid:false})];
 for(let i=0;i<jobs.length;i++)engine.acceptCandidate(jobs[i],outcomes[i]);
 const specialist=jobs[1].id,failed=jobs[3].id;
 assert.equal(engine.best.id,jobs[0].id);assert.equal(engine.best.result.score,50);
 assert.ok(engine._nicheArchives[0].some(entry=>entry.id===specialist));assert.ok(engine._nicheArchives.flat().every(entry=>entry.id!==failed));
 const parents=[];
 for(let i=0;i<48;i++){const job=engine.planCandidate();parents.push({id:job.parentId,kind:job.kind});engine.acceptCandidate(job,outcome(f,{score:0,coverage:0}));assert.equal(engine.best.result.score,50);}
 assert.ok(parents.some(parent=>parent.id===specialist&&parent.kind.startsWith('connection-')),'retained specialist must actually supply a connection mutation');
 assert.ok(parents.every(parent=>parent.id!==failed));assert.equal(engine.best.id,jobs[0].id);
});
