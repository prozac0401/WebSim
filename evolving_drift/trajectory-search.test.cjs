'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./genome.js'),E=require('./evolution.js'),S=require('./evolution-strategies.js'),T=require('./trajectory-search.js'),F=require('./fitness.js'),C=G.CHANNELS;
// Synthetic outcomes test search policy, never claim these paths are drivable.
function fixture({manual=false,offset=0,beta=-.3,heading=0,coverage=.4,score=10}={}){
 const vehicle={physics:{transmissionType:manual?'MT':'AT',wheelbaseM:2.6,lengthM:4.5,widthM:1.8,massKg:1500,maxSteer:.6,gearRatios:[4,2.7,1.8,1.3,1,.8],finalDrive:3.5,tireRadius:.34,shiftRPM:6500}};
 const track={length:300,width:20,judgedStart:20,judgedEnd:290,sample:s=>({s,x:s,y:0,z:0,heading:0,widthLeft:10,widthRight:10,curvature:s>=70&&s<=120?.02:s>=185&&s<=235?.018:0})};
 const record=Array.from({length:601},(_,i)=>({s:i*.5,time:i*.025,x:i*.5,y:offset,speed:20,vx:20*Math.cos(heading),vy:20*Math.sin(heading),yaw:heading-beta,beta,r:0,brake:0,throttle:.5,rearTorque:100,pathError:offset}));
 const gene=G.create();for(let i=0;i<G.KNOTS;i++){gene[i*G.STRIDE+C.throttle]=.5;gene[i*G.STRIDE+C.targetSlip]=beta;}
 const zones=S.zones(track),links=S.links(track);
 const drift={arcs:zones.map(z=>({zoneId:z.id,complete:coverage>=1,score:coverage*20,bestArc:{start:z.cornerStart,end:z.cornerStart+(z.exit-z.cornerStart)*coverage,connectionCoverage:coverage,speedRetention:1,turnRatio:1,minSpeed:20,startTime:z.cornerStart/20,endTime:(z.cornerStart+(z.exit-z.cornerStart)*coverage)/20}})),links:links.map(l=>({id:l.id,complete:false,coverage:coverage/2,speedRetention:1,turnRatio:1,startTime:l.start/20,endTime:l.end/20}))};
 const parent={id:'parent',sequence:1,accepted:true,gene,record,result:{valid:true,status:'finished',time:15,score,frames:record,drift}};
 return {vehicle,track,record,gene,zones,parent};
}
test('actual velocity direction, rather than sideways body yaw, determines directional search quality',()=>{
 const a=fixture({beta:-.2}),b=fixture({beta:-.6}),out=fixture({heading:-.5,offset:-7});
 const pa=T.measure(a.vehicle,a.track,a.parent),pb=T.measure(b.vehicle,b.track,b.parent),po=T.measure(out.vehicle,out.track,out.parent);
 assert(pa.observed&&pb.observed&&po.observed);assert.equal(pa.direction,pb.direction);assert.equal(pa.headingError,0);assert(po.geometry<pa.geometry);assert(po.outward>0);assert(po.minimumMargin<pa.minimumMargin);
 assert.equal(pa.states[0].beta,-.2);assert.equal(pb.states[0].beta,-.6);assert.equal(pa.states[0].velocityHeading,pb.states[0].velocityHeading);
});
test('self-authored target-line changes cannot improve measured actual-trajectory merit',()=>{
 const f=fixture(),a=T.measure(f.vehicle,f.track,f.parent),gene=G.clone(f.gene);for(let i=0;i<G.KNOTS;i++)gene[i*G.STRIDE+C.lineOffset]=5*Math.sin(i/127*Math.PI);
 const b=T.measure(f.vehicle,f.track,{...f.parent,gene});assert.deepEqual(a,b);
});
test('clean grip geometry earns no search merit without observed moving drift',()=>{
 const grip=fixture({beta:0,coverage:0,score:0}),drift=fixture({coverage:0,score:0});
 const a=T.measure(grip.vehicle,grip.track,grip.parent),b=T.measure(drift.vehicle,drift.track,drift.parent);
 assert(a.geometry>.9);assert.equal(a.eligibleDistance,0);assert.equal(a.driftCoverage,0);assert.equal(a.geometryCredit,0);assert.equal(a.merit,0);assert.equal(a.feasible,false);
 assert(b.eligibleDistance>10);assert(b.geometryCredit>0);assert(b.merit>a.merit);
});
test('equal drift distance receives equal coverage and angle credit at different valid speeds',()=>{
 const fast=fixture(),slow=fixture();for(const f of slow.record){f.speed=8;f.vx=8;f.time=f.s/8;}
 const a=T.measure(fast.vehicle,fast.track,fast.parent),b=T.measure(slow.vehicle,slow.track,slow.parent);
 assert.equal(a.eligibleDistance,a.windowDistance);assert.equal(b.eligibleDistance,a.eligibleDistance);assert.equal(b.driftCoverage,a.driftCoverage);assert.equal(b.angle,a.angle);
});
test('backtracking and repeated road segments cannot backfill grip distance with drift credit',()=>{
 const once=fixture({coverage:0}),repeat=fixture({coverage:0});
 for(const f of once.record)if(f.s>=90&&f.s<=120)f.beta=0;
 const end=once.record.findIndex(f=>f.s===120),before=once.record.slice(0,end+1).map(f=>({...f})),after=once.record.slice(end+1).map(f=>({...f}));
 const backward=Array.from({length:60},(_,i)=>({...repeat.record[0],s:119.5-i*.5,x:119.5-i*.5,vx:-20}));
 const forward=Array.from({length:60},(_,i)=>({...repeat.record[0],s:90.5+i*.5,x:90.5+i*.5}));
 repeat.parent.record=[...before,...backward,...forward,...after];repeat.parent.record.forEach((f,i)=>{f.time=i*.025;});
 const a=T.measure(once.vehicle,once.track,once.parent),b=T.measure(repeat.vehicle,repeat.track,repeat.parent);
 assert(b.pathProfile.backtrackingM>=30);assert.equal(b.eligibleDistance,a.eligibleDistance);assert.equal(b.angle,a.angle);assert.equal(b.driftCoverage,a.driftCoverage);
});
test('fine eligibility requires a partial corner anchor and meaningful moving drift distance',()=>{
 const linkOnly=fixture({coverage:.4}),partial=fixture({coverage:.15}),brief=fixture({coverage:.4});
 for(const arc of linkOnly.parent.result.drift.arcs){arc.bestArc.connectionCoverage=0;arc.bestArc.end=arc.bestArc.start;}
 for(const f of brief.record)if(f.s<90||f.s>95)f.beta=0;
 const a=T.measure(linkOnly.vehicle,linkOnly.track,linkOnly.parent),b=T.measure(partial.vehicle,partial.track,partial.parent),c=T.measure(brief.vehicle,brief.track,brief.parent);
 assert(a.progress>.015);assert(a.eligibleDistance>10);assert.equal(a.maxCornerProgress,0);assert.equal(a.feasible,false,'an isolated link is not a corner anchor');
 assert(b.maxCornerProgress>=.10&&b.maxCornerProgress<1);assert.equal(b.completed,0);assert.equal(b.feasible,true,'partial corner evidence can be refined before completion');
 assert(c.maxCornerProgress>=.10);assert(c.eligibleDistance<10);assert.equal(c.feasible,false,'a brief angle impulse is not a viable global drift line');
});
test('slow slides, reverse motion and recovered-spin frames earn no angle or velocity-stability search bonus',()=>{
 const healthy=fixture({beta:-40*Math.PI/180}),wide=fixture({beta:-70*Math.PI/180}),spin=fixture({beta:-80*Math.PI/180}),slow=fixture({beta:-40*Math.PI/180}),tagged=fixture({beta:-40*Math.PI/180}),reverse=fixture({beta:-40*Math.PI/180});
 for(const f of slow.record){f.speed=5;f.vx=5;}
 for(const f of tagged.record)f.status='spin';for(const f of reverse.record)f.vx=-20;
 const good=T.measure(healthy.vehicle,healthy.track,healthy.parent);assert(good.angle>0);assert(T.measure(wide.vehicle,wide.track,wide.parent).angle>good.angle);
 for(const f of [spin,slow,tagged,reverse]){const measured=T.measure(f.vehicle,f.track,f.parent);assert.equal(measured.angle,0);assert.equal(measured.velocitySamples,0);assert.equal(measured.direction,0);assert.equal(measured.recovery,0);assert.equal(measured.curvature,0);assert(measured.geometry<good.geometry);assert.equal(measured.valid,true,'recovered episodes do not invalidate a valid finish');}
});
test('failed or sparse runs supply no trusted trajectory archive evidence',()=>{
 const f=fixture();for(const patch of [{accepted:false},{result:{...f.parent.result,valid:false,status:'offtrack'}},{record:[]}])assert.equal(T.measure(f.vehicle,f.track,{...f.parent,...patch}).observed,false);
});
test('physical line preservation checks position, velocity direction, speed and exit yaw despite fixed genes',()=>{
 const f=fixture(),original=T.measure(f.vehicle,f.track,f.parent),shifted=fixture({offset:2}),next=T.measure(shifted.vehicle,shifted.track,shifted.parent);
 assert.equal(T.comparePath(original,original).preserved,true);const comparison=T.comparePath(original,next);assert.equal(comparison.preserved,false);assert.equal(comparison.lateralRms,2);
 const changed=structuredClone(original);changed.states.at(-1).yawRate=1;assert.equal(T.comparePath(original,changed).preserved,false);
});
test('uniform actual-path samples detect a mid-span bulge even when every sparse gate is unchanged',()=>{
 const f=fixture(),bulge=fixture(),small=fixture();
 for(const r of bulge.record){const u=(r.s-137)/9;r.y=Math.abs(u)<1?3.4*(1-u*u)**2:0;}
 for(const r of small.record)r.y=.2*Math.sin(r.s/300*Math.PI)**2;
 const a=T.measure(f.vehicle,f.track,f.parent),b=T.measure(bulge.vehicle,bulge.track,bulge.parent),c=T.measure(small.vehicle,small.track,small.parent);
 assert.deepEqual(b.states,a.states,'all entry, apex, exit and midpoint gates coincide');assert.equal(a.pathProfile.points.length,96);assert.equal(a.pathProfile.coverage,1);
 const bad=T.comparePath(a,b);assert.equal(bad.preserved,false);assert(bad.lateralRms<.9,'the narrow bulge can have a small RMS');assert(bad.maxLateral>3);assert(bad.maxXY>3);assert.equal(bad.sampled,true);assert.equal(bad.continuousProof,false);assert.equal(bad.samples,96);
 const good=T.comparePath(a,c);assert.equal(good.preserved,true);assert(good.maxLateral<.21);assert(good.xyRms<.21);
 const incomplete=structuredClone(a);incomplete.pathProfile.points=incomplete.pathProfile.points.slice(0,80);assert.equal(T.comparePath(a,incomplete).preserved,false);
});
test('coarse line spans survive a saturated knot without collapsing every corner or duplicating the parent',()=>{
 const f=fixture(),bounds=Array.from({length:G.KNOTS},()=>({min:-4,max:4}));bounds[45]={min:0,max:0};
 const before=Array.from(f.gene),options={zones:f.zones,lineBounds:bounds,referenceRecord:f.record,referenceGene:f.gene,scale:.8};
 const a=T.coarse(f.vehicle,f.track,f.parent,E.createRng(37),options),b=T.coarse(f.vehicle,f.track,f.parent,E.createRng(37),options);
 assert.deepEqual(a,b);assert.deepEqual(Array.from(f.gene),before);assert(a.gene.every(Number.isFinite));assert.equal(a.gene[45*G.STRIDE+C.lineOffset],0);
 const edited=[];for(let i=0;i<G.KNOTS;i++)if(a.gene[i*G.STRIDE+C.lineOffset]!==f.gene[i*G.STRIDE+C.lineOffset])edited.push(i);
 assert(edited.length>20);assert(edited.some(i=>i<45)&&edited.some(i=>i>45));assert.equal(a.change.family,'coarse-line-speed');assert.equal(a.change.entrySpeedPlans.length,2);
 assert.deepEqual(G.normalize(a.gene,{maxSteerRad:.6,gearCount:6,lineBounds:bounds}),a.gene);
});
test('archive retains actual path families and completed regional parents independently of displayed score',()=>{
 const f=fixture(),entries=Array.from({length:5},(_,i)=>({...f.parent,id:'p'+i,sequence:i,result:{...f.parent.result,score:100-i},profile:{observed:true,merit:.9-i*.05,family:'line-'+i,vector:[i,0],regions:[{id:'corner',complete:i===4}]}}));
 const saved=T.retain(entries,e=>e.profile,3);assert(saved.some(e=>e.id==='p4'));assert(saved.some(e=>e.id==='p0'));assert.equal(new Set(saved.map(e=>e.profile.family)).size,3);
});
test('many distinct completed specialists cannot exceed the global archive memory bound',()=>{
 const f=fixture(),entries=Array.from({length:20},(_,i)=>({...f.parent,id:'p'+i,sequence:i,profile:{observed:true,merit:1-i*.01,family:'line-'+i,vector:[i,0],regions:[{id:'corner-'+i,complete:true}]}}));
 const saved=T.retain(entries,e=>e.profile,8);assert.equal(saved.length,8);assert.equal(saved[0].id,'p0');assert(saved.every(e=>e.profile.regions[0].complete));assert.throws(()=>T.retain(entries,e=>e.profile,0),/positive integer/);
});
test('moving drift families reserve the archive before at most two grip-only seeds',()=>{
 const f=fixture(),grip=Array.from({length:10},(_,i)=>({...f.parent,id:'g'+i,sequence:i,profile:{observed:true,merit:1-i*.01,eligibleDistance:0,family:'grip-'+i,vector:[i,0],regions:[]}}));
 const drift=Array.from({length:3},(_,i)=>({...f.parent,id:'d'+i,sequence:10+i,profile:{observed:true,merit:.2-i*.01,eligibleDistance:20,family:'drift-'+i,vector:[i,1],regions:[{id:'corner',complete:i===2}]}}));
 assert.equal(T.retain(grip,e=>e.profile).length,8,'broad grip families remain available before any drift exists');
 const saved=T.retain([...grip,...drift],e=>e.profile);
 assert.equal(saved.filter(e=>e.profile.eligibleDistance===0).length,2);assert.equal(saved.length,5);assert.equal(new Set(saved.filter(e=>e.id.startsWith('d')).map(e=>e.profile.family)).size,3);assert.equal(saved[0].id,'d2','completed specialist has first reservation');
});
test('unanchored search keeps a bounded coarse share even after stagnation',()=>{
 for(const stale of [0,3,4,100])assert.deepEqual(T.allocation(0,stale),{phase:'coarse',coarseShare:.20,fineShare:0});
 assert.deepEqual(T.allocation(1,0),{phase:'refine',coarseShare:.25,fineShare:.35});
 assert.deepEqual(T.allocation(3,4),{phase:'reopen',coarseShare:.40,fineShare:.10});
 const f=engineFixture();f.engine._trajectoryStale=100;f.engine._rng=()=>.21;assert.equal(f.engine._trajectoryCandidate(),null);
 f.engine._rng=()=>.19;assert.equal(f.engine._trajectoryCandidate().kind,'coarse-line-speed');
});
test('browser script loading fails explicitly when a required search dependency is absent',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),source=fs.readFileSync(require.resolve('./trajectory-search.js'),'utf8');
 assert.throws(()=>vm.runInNewContext(source,{DriftGenome:G,DriftEvolutionStrategies:S,DriftEntrySpeedPlanner:{}}),/ConnectionAnalysis.*before TrajectorySearch/);
});
test('three repeated failures cool down the same parent/region/operator while alternatives and later retries remain',()=>{
 const retry=new T.RetryPolicy(),entry={parentId:'p',accepted:false,mutation:{connectionId:'link-0',family:'connection-fine',retryFamily:'connection-angle'}};
 for(let i=0;i<3;i++)retry.observe(entry,2);assert.equal(retry.allowed('p','link-0','connection-angle',3),false);assert.equal(retry.allowed('p','link-0','connection-line',3),true);assert.equal(retry.allowed('other','link-0','connection-angle',3),true);assert.equal(retry.allowed('p','link-0','connection-angle',6),true);
 retry.observe({...entry,accepted:true},3);assert.equal(retry.allowed('p','link-0','connection-angle',3),true);
 for(let i=0;i<300;i++)retry.observe({...entry,parentId:'p'+i},4);assert(retry.records.size<=256);
});
test('manual clutch mutation changes a timed event and ordinary pedals, never an automatic genome or a pose',()=>{
 const auto=fixture(),mt=fixture({manual:true}),before=JSON.stringify(mt.parent),options={zones:mt.zones,zone:mt.zones[0],scale:.7};
 assert.equal(S.clutchKick(auto.vehicle,auto.track,auto.parent,E.createRng(9),options),null);
 const a=S.clutchKick(mt.vehicle,mt.track,mt.parent,E.createRng(9),options),b=S.clutchKick(mt.vehicle,mt.track,mt.parent,E.createRng(9),options);assert.deepEqual(a,b);assert.equal(JSON.stringify(mt.parent),before);
 assert.equal(a.change.family,'clutch-kick');const k=a.change.eventKnot;assert.equal(a.gene[k*G.STRIDE+C.clutchKick],1);assert(a.change.disengageSec>=.04&&a.change.disengageSec<=.45);assert(a.change.reengageSec>=.03&&a.change.reengageSec<=.3);
 for(let i=0;i<G.KNOTS;i++)for(const c of [C.steer,C.lineOffset,C.targetSlip,C.counterLead,C.driveSlip,C.gearHold])assert.equal(a.gene[i*G.STRIDE+c],mt.gene[i*G.STRIDE+c]);
 assert.deepEqual(Object.keys(a).sort(),['change','gene']);
});
test('removed, moved and replaced clutch events leave canonical inactive timing alleles',()=>{
 const canonical=gene=>{for(let i=0;i<G.KNOTS;i++)if(!gene[i*G.STRIDE+C.clutchKick])for(const c of [C.disengageSec,C.reengageSec])assert.equal(gene[i*G.STRIDE+c],G.DESCRIPTORS[c].defaultValue);};
 for(const random of [.1,.9]){
  const f=fixture({manual:true}),k=40;f.gene[k*G.STRIDE+C.clutchKick]=1;f.gene[k*G.STRIDE+C.disengageSec]=.3;f.gene[k*G.STRIDE+C.reengageSec]=.2;
  f.gene[3*G.STRIDE+C.disengageSec]=.4;
  const proposal=S.clutchKick(f.vehicle,f.track,f.parent,()=>random,{zones:f.zones,zone:f.zones[0],connectionTarget:{breakS:k/127*f.track.length}});
  assert.equal(proposal.change.previousEventKnot,k);assert.notEqual(proposal.change.eventKnot,k);canonical(proposal.gene);
  assert.equal(proposal.gene[k*G.STRIDE+C.clutchKick],0);assert.equal(proposal.change.removed,random===.1);
  if(proposal.change.removed){assert.equal(proposal.change.disengageSec,.12);assert.equal(proposal.change.reengageSec,.08);}
 }
 const f=fixture({manual:true});for(let i=0;i<8;i++){const k=25+i*5;f.gene[k*G.STRIDE+C.clutchKick]=1;f.gene[k*G.STRIDE+C.disengageSec]=.3;f.gene[k*G.STRIDE+C.reengageSec]=.2;}
 const replaced=S.clutchKick(f.vehicle,f.track,f.parent,()=>.9,{zones:f.zones,zone:f.zones[1],connectionTarget:{breakS:260}});
 canonical(replaced.gene);assert.equal(Array.from({length:G.KNOTS},(_,i)=>replaced.gene[i*G.STRIDE+C.clutchKick]).reduce((a,b)=>a+b,0),8);
});
test('fine exploration extends a proven corner into its adjacent straight and respects operator cooldown',()=>{
 const f=fixture(),profile=T.measure(f.vehicle,f.track,f.parent),options={zones:f.zones,profile,referenceRecord:f.record,referenceGene:f.gene,scale:.4};
 const a=T.fine(f.vehicle,f.track,f.parent,()=>.1,options);assert.equal(a.change.family,'connection-angle');assert.equal(a.change.kind,'link');assert.equal(a.change.phase,'fine');
 assert.equal(a.change.physicalPathMustBeRemeasured,true);
 const b=T.fine(f.vehicle,f.track,f.parent,()=>.1,{...options,allowedConnection:()=>false});assert(!b.change.family.startsWith('connection-'));
});
function engineFixture(options={}){
 const f=fixture({coverage:0,beta:0,score:0});f.parent.id='baseline';const baseline={genomeVersion:G.VERSION,gene:f.gene,result:f.parent.result,record:f.record};
 const engine=new E.Engine(f.vehicle,f.track,{seed:37,baseline,rankResult:(_v,_t,r)=>r,...options});engine.initialize();return {...f,engine};
}
test('hierarchy is default, can be isolated for ablation, and keeps representative promotion based on score',()=>{
 const on=engineFixture(),off=engineFixture({trajectorySearch:false});assert(on.engine.ready&&off.engine.ready);assert.equal(on.engine.snapshot().trajectorySearch.enabled,true);assert.equal(off.engine.snapshot().trajectorySearch.enabled,false);
 const kinds=[];for(let i=0;i<20;i++)kinds.push(on.engine.planCandidate().kind);assert(kinds.includes('coarse-line-speed'));
 const jobs=[...on.engine._planned];for(const [i,job]of jobs.entries())on.engine.acceptCandidate(job,{...on.parent.result,score:i===0?50:2,frames:on.record});assert.equal(on.engine.best.id,jobs[0].id);assert.equal(on.engine.best.result.score,50);
 for(let i=0;i<20;i++)assert.notEqual(off.engine.planCandidate().kind,'coarse-line-speed');
});
test('generation barriers keep sequential and batched reservations identical with trajectory archives',()=>{
 const a=engineFixture(),b=engineFixture();for(let generation=0;generation<2;generation++){
  const jobs=Array.from({length:20},()=>a.engine.planCandidate());
  for(const [i,job]of jobs.entries()){
   const other=b.engine.planCandidate();assert.equal(other.kind,job.kind);assert.equal(other.parentId,job.parentId);assert.deepEqual(other.gene,job.gene);
   const result={...a.parent.result,score:1+i/100,frames:a.record};a.engine.acceptCandidate(job,result);b.engine.acceptCandidate(other,result);
  }
 }
 assert.deepEqual(a.engine.snapshot().trajectorySearch,b.engine.snapshot().trajectorySearch);
});
test('score-only improvement without a drift anchor keeps broad search available',()=>{
 const f=engineFixture();for(let generation=0;generation<5;generation++){
  const jobs=Array.from({length:20},()=>f.engine.planCandidate());for(const [i,job]of jobs.entries())f.engine.acceptCandidate(job,{...f.parent.result,score:generation*20+i+1,frames:f.record});
 }
 const state=f.engine.snapshot();assert.equal(state.bestScore,100);assert.equal(state.trajectorySearch.phase,'coarse');assert(state.trajectorySearch.staleGenerations>=4);assert(state.trajectorySearch.coarseProposals>0);assert.equal(state.trajectorySearch.fineProposals,0);
});
