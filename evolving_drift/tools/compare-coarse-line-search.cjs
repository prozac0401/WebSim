'use strict';
// Exploratory postprocessing of four fixed, already evolved champions.
// This is NOT a prepared-genesis GA benchmark and is not loaded by production.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const SCRIPT_HASH=sha(fs.readFileSync(__filename));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x)),DEG=180/Math.PI;
const VEHICLES=['g80-3.5t-rwd','porter-lpg-mt','supra-3.0t-rz','gr86-2.4-rz-mt'];
const METHOD=Object.freeze({parentSeed:37,parentBudget:80,seed:137,trialsPerArm:64,coarseVectors:16,coarseTrials:32,lineParents:4,finePerLine:8,fineScale:.5,lineAmplitudeM:2.5,
 weights:{connection:.35,speed:.15,angle:.10,targetTracking:.05,trackOutward:.10,curvature:.15,apexPass:.10},
 normalizers:{trackingM:2,outwardVelocityMps:2,scoredAngleDegrees:45,curvatureBinM:5,curvatureChangePerBin:.02},
 selection:'Physical valid/finished only; highest fixed search merit, then unchanged raw drift score, then creation order. Displayed representative is separately highest unchanged valid score.',
 phases:'Hierarchical: 16 anchor vectors, each line-only and line+existing speed plan (32 trials); 4 valid line specialists, 8 sequential line-locked fine trials each (32). Control: 64 existing adaptive/connection trials with a 4-member merit beam. Every failed, unchanged or duplicate proposal consumes one physical trial.',
  limitations:['Fixed best-of-80 evolved parents; not evolution from prepared genesis.','One seed, four vehicles and 64 trials per arm do not establish a global optimum or vehicle capability.','Proxy search merit is predeclared, separate from unchanged production scoring; target agreement contributes only 5%.','State and forces are never assigned from a target. All physical evaluations start at Physics.initialState.','Sampled line perturbation has smooth zero endpoint derivatives before 128-knot discretization; runtime remains the unchanged linear genome sampler.','Endpoint genes do not guarantee endpoint physical states. Measured entry/exit differences are reported without teleporting or resetting the vehicle.','The existing stock model, including its current clutch/shift limitations, is held fixed.','This is not a timing benchmark; concurrent independent runs may change throughput, never budget or ordered selection.']});
function check(ok,message){if(!ok)throw Error(message);}
function hashGene(gene){const b=Buffer.alloc(gene.length*8);for(let i=0;i<gene.length;i++)b.writeDoubleLE(gene[i],i*8);return sha(b);}
function equal(a,b){
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const ka=Object.keys(a),kb=Object.keys(b);return ka.length===kb.length&&ka.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&equal(a[k],b[k]));
}
const clean=value=>JSON.parse(JSON.stringify(value));
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
function stats(values){values=values.filter(Number.isFinite);return {count:values.length,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,mean:mean(values)};}
function finiteTree(value,at='$'){if(typeof value==='number')check(Number.isFinite(value),'Nonfinite report value at '+at);else if(value&&typeof value==='object')for(const [key,v]of Object.entries(value))finiteTree(v,at+'.'+key);}
function args(argv){
 const root=process.cwd(),out={sourceRoot:path.join(root,'output/drift-qa/all-vehicle-study/source'),inputDir:null,vehicle:null,out:null,mode:'full'};
 const names={'--source-root':'sourceRoot','--input-dir':'inputDir','--vehicle':'vehicle','--out':'out'};
 for(let i=0;i<argv.length;i++){if(argv[i]==='--dry-run'){out.mode='dry-run';continue;}if(argv[i]==='--smoke'){out.mode='smoke';continue;}check(names[argv[i]]&&argv[i+1],'Unknown/incomplete option: '+argv[i]);out[names[argv[i]]]=argv[++i];}
 out.sourceRoot=path.resolve(out.sourceRoot);out.inputDir=path.resolve(out.inputDir||path.join(out.sourceRoot,'output/drift-qa'));
 check(!out.vehicle||VEHICLES.includes(out.vehicle),'Vehicle is outside the fixed four-car study.');
 out.out=path.resolve(out.out||path.join(root,'output/drift-qa/coarse-line-study/results-'+(out.vehicle||'all')+'-'+out.mode+'.json'));return out;
}
function verifySources(root,hashes){check(hashes&&Object.keys(hashes).length,'Missing source hashes.');for(const [name,hash]of Object.entries(hashes))check(sha(fs.readFileSync(path.join(root,name)))===hash,'Frozen source mismatch: '+name);}
function write(file,report){finiteTree(report);fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(report,null,2));fs.renameSync(tmp,file);}
function smooth5(x){x=clamp(x,0,1);return x*x*x*(10+x*(-15+x*6));}
function deltaAt(anchors,s){
 if(s<=anchors[0].s||s>=anchors.at(-1).s)return 0;let i=0;while(i<anchors.length-2&&s>anchors[i+1].s)i++;
 const a=anchors[i],b=anchors[i+1];return a.delta+(b.delta-a.delta)*smooth5((s-a.s)/(b.s-a.s));
}
function lineWindow(track,zones){
 const first=zones[0],last=zones.at(-1),start=Math.max(2.5,first.cornerStart-60),end=Math.min(track.length-5,last.exit+60);
 const stations=zones.length===2?[start,first.cornerStart-15,first.apex,(first.exit+last.cornerStart)/2,last.apex,last.exit+15,end]:Array.from({length:7},(_,i)=>start+(end-start)*i/6);
 check(stations.length===7&&stations.every((s,i)=>Number.isFinite(s)&&(!i||s>stations[i-1])),'Cannot form seven ordered line anchors.');return {start,end,stations};
}
function makeLine(ctx,parent,vector){
 const {G,Strategies,vehicle,track,bounds,limits,window}=ctx,anchors=window.stations.map((s,i)=>({s,delta:i===0||i===6?0:vector[i-1]})),gene=G.clone(parent.gene),ds=track.length/(G.KNOTS-1),deltas=[];let amplitudeScale=1;
 for(let i=0;i<G.KNOTS;i++){const d=deltaAt(anchors,i*ds);if(Math.abs(d)<1e-15)continue;const j=i*G.STRIDE+G.CHANNELS.lineOffset;amplitudeScale=Math.min(amplitudeScale,d>0?(bounds[i].max-gene[j])/d:(bounds[i].min-gene[j])/d);deltas.push({j,d});}
 amplitudeScale=clamp(amplitudeScale,0,1);for(const {j,d}of deltas)gene[j]+=d*amplitudeScale;
 return {gene:G.normalize(Strategies.couple(vehicle,track,parent.gene,gene,parent.record),limits),change:{family:'coarse-line',anchors,amplitudeScale,window}};
}
function addSpeed(ctx,parent,line){
 const {G,Strategies,Speed,vehicle,track,zones,prepared}=ctx;let gene=G.clone(line.gene);const plans=[];
 // Parent speed is a measured arrival estimate; the old stock speed planner
 // is advisory only. Every resulting pedal profile still requires full proof.
 for(const zone of zones){const plan=Speed.plan(vehicle,track,gene,prepared.record,zone,{entrySpeedRatio:1,brakeLead:0,brakeStrength:1,brakeRelease:0},{lower:Strategies.approachStart(track,zone,zones),arrivalRecord:parent.record,referenceGene:prepared.gene});gene=Speed.apply(gene,plan);plans.push(plan);}
 return {gene:G.normalize(gene,ctx.limits),change:{...line.change,family:'coarse-line-speed',speedPlans:plans}};
}
function point(ctx,gene,s){s=clamp(s,0,ctx.track.length);const p=ctx.track.sample(s),d=ctx.G.sample(gene,s,ctx.track.length).lineOffset;return {x:p.x-Math.sin(p.heading)*d,y:p.y+Math.cos(p.heading)*d};}
function tangent(ctx,gene,s){const a=point(ctx,gene,s-1),b=point(ctx,gene,s+1);return Math.atan2(b.y-a.y,b.x-a.x);}
function polygonDistance(p,poly){let inside=false,best=Infinity;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return (inside||best<1e-9?1:-1)*best;}
function margin(track,p,hint){
 let m;if(track.boundaryPolygons?.length)m=Math.max(...track.boundaryPolygons.map(poly=>polygonDistance(p,poly)));else{const q=track.project(p.x,p.y,hint),s=track.sample(q.s);m=Math.min(s.widthLeft-q.error,s.widthRight+q.error);}
 for(const poly of track.excludedPolygons||[])m=Math.min(m,-polygonDistance(p,poly));return Number.isFinite(m)?m:null;
}
function crossing(ctx,record,s){
 for(let i=1;i<record.length;i++){const a=record[i-1],b=record[i],qa=ctx.track.project(a.x,a.y,a.s),qb=ctx.track.project(b.x,b.y,b.s);if(qa.s<=s&&qb.s>=s&&qb.s>qa.s){const u=(s-qa.s)/(qb.s-qa.s),result={s,time:a.time+(b.time-a.time)*u};for(const key of ['x','y','vx','vy','speed','r','beta'])result[key]=a[key]+(b[key]-a[key])*u;result.yaw=a.yaw+wrap(b.yaw-a.yaw)*u;return result;}}
 return null;
}
function stateAt(ctx,record,s){const f=crossing(ctx,record,s);if(!f)return null;const q=ctx.track.project(f.x,f.y,s);return {s,atTime:f.time,lateral:q.error,speed:f.speed,velocityHeading:Math.atan2(f.vy,f.vx),bodyYaw:f.yaw,beta:f.beta,yawRate:f.r};}
function stateDelta(parent,child){if(!parent||!child)return null;return {lateralM:child.lateral-parent.lateral,speedMps:child.speed-parent.speed,velocityHeadingDeg:wrap(child.velocityHeading-parent.velocityHeading)*DEG,bodyYawDeg:wrap(child.bodyYaw-parent.bodyYaw)*DEG,slipAngleDeg:wrap(child.beta-parent.beta)*DEG,yawRateRadSec:child.yawRate-parent.yawRate};}
function pathProfile(ctx,record){
 const stations=[...new Set([ctx.window.start,ctx.window.end,...ctx.zones.map(z=>z.apex),...Array.from({length:Math.floor((ctx.window.end-ctx.window.start)/2)},(_,i)=>ctx.window.start+2*i)])].sort((a,b)=>a-b),points=[];
 let next=0,previous=null;
 for(const frame of record){
  const roadS=ctx.track.project(frame.x,frame.y,frame.s).s;
  if(previous&&roadS>previous.roadS){
   while(next<stations.length&&stations[next]<previous.roadS)next++;
   while(next<stations.length&&stations[next]<=roadS){
    const s=stations[next++],a=previous.frame,b=frame,u=(s-previous.roadS)/(roadS-previous.roadS),road=ctx.track.sample(s),p={s};
    for(const key of ['x','y','vx','vy','speed','r'])p[key]=a[key]+(b[key]-a[key])*u;
    p.lateral=(p.x-road.x)*-Math.sin(road.heading)+(p.y-road.y)*Math.cos(road.heading);p.velocityHeading=Math.atan2(p.vy,p.vx);points.push(p);
   }
  }
  previous={frame,roadS};if(next===stations.length)break;
 }
 return {spacingM:2,expectedSamples:stations.length,points};
}
function physicalLineDelta(ctx,anchor,entry){
 const parent=new Map(anchor.pathProfile.points.map(p=>[p.s,p])),pairs=entry.pathProfile.points.filter(p=>parent.has(p.s)).map(p=>({s:p.s,a:parent.get(p.s),b:p}));
 const xy=pairs.map(({a,b})=>Math.hypot(b.x-a.x,b.y-a.y)),lateral=pairs.map(({a,b})=>b.lateral-a.lateral),heading=pairs.map(({a,b})=>wrap(b.velocityHeading-a.velocityHeading)*DEG),speed=pairs.map(({a,b})=>b.speed-a.speed);
 const rms=values=>values.length?Math.sqrt(mean(values.map(x=>x*x))):null;
 const at=s=>{const p=pairs.find(p=>p.s===s);return p?{s,lateralM:p.b.lateral-p.a.lateral,xyM:Math.hypot(p.b.x-p.a.x,p.b.y-p.a.y),velocityHeadingDeg:wrap(p.b.velocityHeading-p.a.velocityHeading)*DEG,speedMps:p.b.speed-p.a.speed,yawRateRadSec:p.b.r-p.a.r}:null;};
 return {coarseLineParentId:anchor.id,coarseLineParentGeneHash:anchor.geneHash,samples:pairs.length,expectedSamples:anchor.pathProfile.expectedSamples,completeCoverage:pairs.length===anchor.pathProfile.expectedSamples,
  xyRmseM:rms(xy),maxXyM:xy.length?Math.max(...xy):null,lateralRmseM:rms(lateral),maxAbsoluteLateralM:lateral.length?Math.max(...lateral.map(Math.abs)):null,velocityHeadingRmseDeg:rms(heading),speedRmseMps:rms(speed),
  apices:ctx.zones.map(z=>({id:z.id,delta:at(z.apex)})),entry:at(ctx.window.start),exit:at(ctx.window.end),interpretation:'Observed physical trajectory differences from the original coarse parent. A locked target gene does not guarantee a locked actual path. No extra run-validity threshold or state reset is used.'};
}
function metrics(ctx,gene,result,record){
 const {track,zones,window,Analysis,Physics,vehicle,G}=ctx,analysis=Analysis.measure(track,result.drift,record),valid=result.valid===true&&result.status==='finished';
 const tracking=[],outwardVelocity=[],coreSpeed=[],headingErrors=[],frontMargins=[],curvatureBins=new Map();let outsideSamples=0,frontSamples=0,previous=null;
 for(let i=0;i<record.length;i++){
  const f=record[i];if(f.s<window.start||f.s>window.end)continue;
  const q=track.project(f.x,f.y,f.s),road=track.sample(q.s),target=G.sample(gene,q.s,track.length),actualHeading=Math.atan2(f.vy,f.vx),zone=zones.find(z=>q.s>=z.cornerStart&&q.s<=z.exit);
  if(f.speed>=8){tracking.push(Math.abs(q.error-target.lineOffset));headingErrors.push(Math.abs(wrap(actualHeading-tangent(ctx,gene,q.s)))*DEG);}
  if(zone){coreSpeed.push(f.speed);outwardVelocity.push(Math.max(0,-zone.sign*(-Math.sin(road.heading)*f.vx+Math.cos(road.heading)*f.vy)));}
  if(i%6===0||i===record.length-1){const contacts=Physics.frontContacts(vehicle,f);frontSamples++;if(!contacts.every(p=>track.contains(p.x,p.y,f.s)))outsideSamples++;for(const p of contacts){const m=margin(track,p,f.s);if(m!==null)frontMargins.push(m);}}
  if(previous&&f.speed>=8&&previous.speed>=8){const ds=Math.hypot(f.x-previous.x,f.y-previous.y),dt=f.time-previous.time;if(ds>.01&&dt>0&&dt<.1){const curvature=wrap(actualHeading-Math.atan2(previous.vy,previous.vx))/ds,key=Math.floor((q.s-window.start)/METHOD.normalizers.curvatureBinM);if(!curvatureBins.has(key))curvatureBins.set(key,[]);curvatureBins.get(key).push(curvature);}}
  previous=f;
 }
 const apices=zones.map(zone=>{
  const f=crossing(ctx,record,zone.apex),entry=crossing(ctx,record,zone.cornerStart),exit=crossing(ctx,record,zone.exit);
  let turn=0,prior=null;for(const r of record){const q=track.project(r.x,r.y,r.s);if(q.s<zone.cornerStart||q.s>zone.exit||r.speed<2)continue;const h=Math.atan2(r.vy,r.vx);if(prior!==null)turn+=wrap(h-prior)*zone.sign;prior=h;}
  if(!f)return {id:zone.id,passed:false,actualTurn:turn,outwardOffsetM:null,positionErrorToTargetM:null,outwardQuality:0};
  const q=track.project(f.x,f.y,zone.apex),road=track.sample(zone.apex),target=G.sample(gene,zone.apex,track.length).lineOffset,outward=-zone.sign*q.error,outerWidth=zone.sign>0?road.widthRight:road.widthLeft;
  const contacts=Physics.frontContacts(vehicle,f),onRoad=contacts.every(p=>track.contains(p.x,p.y,zone.apex)),requiredTurn=Math.min(.25,Math.abs(zone.turn)*.25);
  const contactMargins=contacts.map(p=>margin(track,p,zone.apex)).filter(Number.isFinite);
  return {id:zone.id,passed:!!entry&&!!exit&&onRoad&&turn>=requiredTurn,actualTurn:turn,requiredTurn,roadStation:zone.apex,lateralOffsetM:q.error,outwardOffsetM:outward,positionErrorToTargetM:q.error-target,
   outwardQuality:1-clamp(Math.max(0,outward)/Math.max(1,outerWidth),0,1),frontContactsOnRoad:onRoad,frontMarginM:contactMargins.length===contacts.length?Math.min(...contactMargins):null,bodyYawDeg:f.yaw*DEG,velocityHeadingDeg:Math.atan2(f.vy,f.vx)*DEG,roadHeadingDeg:road.heading*DEG,bodySlipDeg:f.beta*DEG};
 });
 const bins=[...curvatureBins].sort((a,b)=>a[0]-b[0]).map(([index,values])=>({index,curvature:mean(values)})),curvatureChanges=[];
 for(let i=1;i<bins.length;i++)if(bins[i].index===bins[i-1].index+1)curvatureChanges.push(Math.abs(bins[i].curvature-bins[i-1].curvature));
 // Unknown/empty episodes earn no speed-retention search credit. Do not make
 // the mean rise just because a difficult connection disappears entirely.
 const speedValues=analysis.regions.map(r=>Number.isFinite(r.actualStart)&&Number.isFinite(r.actualEnd)&&r.actualEnd>r.actualStart&&Number.isFinite(r.speedRetention)?clamp(r.speedRetention,0,1):0),angle=result.drift?.scoring?.meanAngle??0;
 const connection=analysis.regions.length?mean(analysis.regions.map(r=>r.progress)):0,speed=speedValues.length?mean(speedValues):0;
 const trackingMean=mean(tracking),outwardMean=mean(outwardVelocity),curvatureMean=mean(curvatureChanges);
 const components={connection,speed,angle:clamp(angle/METHOD.normalizers.scoredAngleDegrees,0,1),targetTracking:trackingMean===null?0:1/(1+trackingMean/METHOD.normalizers.trackingM),
  trackOutward:apices.length?.5*mean(apices.map(a=>a.outwardQuality))+.5*(outwardMean===null?0:1/(1+outwardMean/METHOD.normalizers.outwardVelocityMps)):0,
  curvature:curvatureMean===null?0:1/(1+curvatureMean/METHOD.normalizers.curvatureChangePerBin),apexPass:apices.length?apices.filter(a=>a.passed).length/apices.length:0};
 const merit=Object.entries(METHOD.weights).reduce((n,[key,weight])=>n+weight*components[key],0);
 return {valid,status:result.status,score:result.score,merit:valid?merit:null,components,completeCorners:analysis.corners.filter(r=>r.complete).length,completeLinks:analysis.links.filter(r=>r.complete).length,
  regions:analysis.regions.map(r=>({id:r.id,kind:r.kind,coverage:r.coverage,progress:r.progress,speedRetention:r.speedRetention,complete:r.complete,reason:r.reason})),
  targetTrackingM:stats(tracking),actualOutwardVelocityMps:stats(outwardVelocity),coreSpeedMps:stats(coreSpeed),velocityTargetHeadingErrorDeg:stats(headingErrors),frontMarginM:stats(frontMargins),frontSamples,frontSamplesOutside:outsideSamples,apices,
  curvatureChangePer5m:stats(curvatureChanges),curvatureBins:bins,angleScoredDeg:angle,courseScoring:result.drift?.scoring,
  boundaries:{entry:stateAt(ctx,record,window.start),exit:stateAt(ctx,record,window.end)}};
}
function order(a,b){return b.metrics.merit-a.metrics.merit||b.result.score-a.result.score||a.sequence-b.sequence;}
function beam(entries,size=4){const seen=new Set();return entries.filter(e=>e.result.valid===true&&e.result.status==='finished').sort(order).filter(e=>{if(seen.has(e.geneHash))return false;seen.add(e.geneHash);return true;}).slice(0,size);}
function displayed(entries){return entries.filter(e=>e.result.valid===true&&e.result.status==='finished').reduce((best,e)=>!best||e.result.score>best.result.score?e:best,null);}
function createSchedule(ctx){return Array.from({length:64},(_,index)=>{const seed=(METHOD.seed+Math.imul(index+1,0x9e3779b1))>>>0,rng=ctx.Evolution.createRng(seed);return {index,seed,arc:index%ctx.zones.length,tryConnection:rng()<.25,family:ctx.Strategies.FAMILIES[Math.floor(rng()*ctx.Strategies.FAMILIES.length)]};});}
function fine(ctx,parent,schedule,lockedLine=null){
 const {G,Strategies,Analysis,Evolution,vehicle,track,zones,prepared}=ctx,zone=zones[schedule.arc],rng=Evolution.createRng(schedule.seed);
 const options={scale:METHOD.fineScale,lineBounds:ctx.bounds,zones,zone,referenceRecord:prepared.record,referenceGene:prepared.gene,family:schedule.family};
 const targets=Analysis.measure(track,parent.result.drift,parent.record).regions.filter(r=>!r.complete&&r.progress>0).sort((a,b)=>b.progress-a.progress||a.id.localeCompare(b.id));
 let proposal;if(schedule.tryConnection&&targets.length)proposal=Strategies.connect(vehicle,track,parent,rng,{...options,connectionTarget:targets[0]});
 else proposal=Strategies.adaptive(vehicle,track,{...parent,metric:Strategies.niche(vehicle,track,parent.result,parent.record,zone)},rng,options);
 let gene=G.clone(proposal.gene),restored=0;
 if(lockedLine){for(let i=0;i<G.KNOTS;i++){const j=i*G.STRIDE+G.CHANNELS.lineOffset;if(gene[j]!==lockedLine[j])restored++;gene[j]=lockedLine[j];}gene=G.normalize(Strategies.couple(vehicle,track,proposal.gene,gene,parent.record),ctx.limits);check(lineEqual(G,gene,lockedLine),'Fine mutation changed the locked line.');}
 return {gene,change:{...proposal.change,schedule,lineLocked:!!lockedLine,restoredLineKnots:restored}};
}
function lineEqual(G,a,b){for(let i=0;i<G.KNOTS;i++){const j=i*G.STRIDE+G.CHANNELS.lineOffset;if(!Object.is(a[j],b[j]))return false;}return true;}
function compact(entry,parent){return {id:entry.id,parentId:parent?.id??null,geneHash:entry.geneHash,parentGeneHash:parent?.geneHash??null,sequence:entry.sequence,change:entry.change,status:entry.result.status,valid:entry.result.valid,reason:entry.result.reason,score:entry.result.score,time:entry.result.time,progress:entry.result.progress,metrics:entry.metrics,coarseActualPathComparison:entry.coarseActualPathComparison||null,
  physicalBoundaryDeltas:parent?{entry:stateDelta(parent.metrics.boundaries.entry,entry.metrics.boundaries.entry),exit:stateDelta(parent.metrics.boundaries.exit,entry.metrics.boundaries.exit)}:null};}
async function loadContext(options,vehicleId){
 const base=path.join(options.sourceRoot,'evolving_drift'),get=name=>require(path.join(base,name+'.js'));
 const ctx={G:get('genome'),Catalog:get('catalog'),Tracks:get('track'),Physics:get('physics'),Fitness:get('fitness'),Prepared:get('prepared-grips'),Analysis:get('connection-analysis'),Strategies:get('evolution-strategies'),Speed:get('entry-speed-planner'),Evolution:get('evolution')};
 const stem=path.join(options.inputDir,'all-vehicle-s37-'+vehicleId),bestText=fs.readFileSync(stem+'-best.json','utf8'),reportText=fs.readFileSync(stem+'.json','utf8'),best=JSON.parse(bestText),report=JSON.parse(reportText);
 check(report.stopped==='budget-exhausted'&&!report.error&&report.evaluated===80,'Parent benchmark is not complete at 80.');
 check(best.config.seed===37&&best.config.budget===80&&best.config.vehicle===vehicleId,'Parent does not match fixed study.');
 check(equal(best.config,report.config)&&equal(best.sourceHashes,report.sourceHashes)&&equal(best.signatures,report.signatures),'Parent/report source or configuration mismatch.');
 check(best.id===report.best.id&&best.geneHash===report.best.geneHash&&hashGene(best.gene)===best.geneHash,'Parent/report identity mismatch.');verifySources(options.sourceRoot,best.sourceHashes);
 check(equal(best.signatures,{physics:sha(ctx.Physics.signature()),fitness:sha(ctx.Fitness.signature()),genome:sha(ctx.G.signature())}),'Loaded signature differs from benchmark.');
 ctx.vehicle=ctx.Catalog.get(vehicleId);ctx.track=ctx.Tracks.get(best.config.track);ctx.prepared=await ctx.Prepared.load(ctx.vehicle,ctx.track);
 check(ctx.prepared.fingerprint===best.preparedFingerprint&&hashGene(ctx.prepared.gene)===best.genesisGeneHash,'Prepared reference mismatch.');
 ctx.zones=ctx.Strategies.zones(ctx.track);ctx.bounds=ctx.G.corridorBounds(ctx.vehicle,ctx.track);ctx.limits={maxSteerRad:ctx.vehicle.physics.maxSteer,gearCount:ctx.vehicle.physics.gearRatios.length,lineBounds:ctx.bounds};ctx.window=lineWindow(ctx.track,ctx.zones);
 ctx.input={bestFile:stem+'-best.json',reportFile:stem+'.json',bestSha256:sha(bestText),reportSha256:sha(reportText),sourceHashes:best.sourceHashes,signatures:best.signatures,preparedFingerprint:best.preparedFingerprint,parentGeneHash:best.geneHash};
 ctx.best=best;ctx.schedule=createSchedule(ctx);return ctx;
}
async function runVehicle(options,id,checkpoint){
 const ctx=await loadContext(options,id),row={vehicle:id,mode:options.mode,input:ctx.input,physicalEvaluations:0,arms:{},schedule:ctx.schedule};checkpoint(row);
 let sequence=0;
 function evaluate(gene,id,parent,change){row.physicalEvaluations++;const raw=ctx.Physics.evaluateGene(ctx.vehicle,ctx.track,gene,{record:true}),result=ctx.Fitness.rank(ctx.vehicle,ctx.track,raw,raw.frames,{reference:ctx.prepared.record});return {id,accepted:result.valid===true&&result.status==='finished',gene:ctx.G.clone(gene),geneHash:hashGene(gene),record:raw.frames,result,metrics:metrics(ctx,gene,result,raw.frames),pathProfile:pathProfile(ctx,raw.frames),sequence:sequence++,change};}
 const expected=ctx.best,loaded={id:'parent',accepted:true,gene:Float64Array.from(expected.gene),geneHash:expected.geneHash,record:expected.frames,result:{...expected.result,frames:expected.frames},sequence:sequence++};
 check(loaded.result.valid===true&&loaded.result.status==='finished','Parent must be valid and finished.');
 let parent=loaded;
 if(options.mode!=='dry-run'){
  parent=evaluate(loaded.gene,'parent',null,null);const {evaluation:ignored,...wanted}=expected.result,{frames:ignoredFrames,...actual}=parent.result;
  row.parentVerification={frames:equal(expected.frames,clean(parent.record)),rankedResult:equal(wanted,clean(actual)),frameCount:parent.record.length};check(row.parentVerification.frames&&row.parentVerification.rankedResult,'Exact no-cache parent replay failed.');
 }else{parent.metrics=metrics(ctx,parent.gene,parent.result,parent.record);parent.pathProfile=pathProfile(ctx,parent.record);}
 row.parent=compact(parent);row.window=ctx.window;const rng=ctx.Evolution.createRng(METHOD.seed),vectors=Array.from({length:16},()=>Array.from({length:5},()=>METHOD.lineAmplitudeM*(2*rng()-1)));row.anchorVectors=vectors;
 const line=makeLine(ctx,parent,vectors[0]),speed=addSpeed(ctx,parent,line),locked=fine(ctx,parent,ctx.schedule[32],parent.gene);
 check(lineEqual(ctx.G,line.gene,speed.gene),'Speed plan changed coarse line.');check(lineEqual(ctx.G,locked.gene,parent.gene),'Fine line lock failed.');
 row.proposalChecks={samePairedLine:true,lockedLineExact:true,deterministicLine:hashGene(line.gene)===hashGene(makeLine(ctx,parent,vectors[0]).gene),deterministicFine:hashGene(locked.gene)===hashGene(fine(ctx,parent,ctx.schedule[32],parent.gene).gene)};
 if(options.mode==='dry-run'){row.dryRunHashes={line:hashGene(line.gene),speed:hashGene(speed.gene),fine:hashGene(locked.gene)};checkpoint(row);return row;}
 const seenByArm=new WeakMap();
 const evaluateProposal=(proposal,id,parent,arm,lineParent=null)=>{
  const entry=evaluate(proposal.gene,id,parent,proposal.change);if(lineParent)entry.coarseActualPathComparison=physicalLineDelta(ctx,lineParent,entry);
  if(!seenByArm.has(arm))seenByArm.set(arm,new Map([[ctx.best.geneHash,'parent']]));const seen=seenByArm.get(arm),trial=compact(entry,parent);
  trial.unchangedFromParent=entry.geneHash===parent.geneHash;trial.duplicateOf=seen.get(entry.geneHash)||null;trial.zeroLineAmplitude=proposal.change?.amplitudeScale===0;
  if(!seen.has(entry.geneHash))seen.set(entry.geneHash,entry.id);arm.trials.push(trial);checkpoint(row);return entry;
 };
 if(options.mode==='smoke'){
  const arm={trials:[],notFullExperiment:true};row.arms.smoke=arm;const a=evaluateProposal(line,'smoke-line',parent,arm),b=evaluateProposal(speed,'smoke-speed',parent,arm),valid=[a,b].filter(e=>e.accepted).sort(order),fineParent=valid[0]||parent;
  evaluateProposal(fine(ctx,fineParent,ctx.schedule[32],fineParent.gene),'smoke-locked-fine',fineParent,arm,fineParent);evaluateProposal(fine(ctx,parent,ctx.schedule[32]),'smoke-control-fine',parent,arm);checkpoint(row);return row;
 }
 const hierarchy={trials:[],budget:64},control={trials:[],budget:64};row.arms.hierarchy=hierarchy;row.arms.control=control;
 const coarse=[parent],allHierarchy=[parent];
 for(let i=0;i<16;i++){
  const shape=makeLine(ctx,parent,vectors[i]);for(const [suffix,proposal]of [['line',shape],['speed',addSpeed(ctx,parent,shape)]]){const e=evaluateProposal(proposal,'h-coarse-'+i+'-'+suffix,parent,hierarchy);coarse.push(e);allHierarchy.push(e);}
 }
 const selected=beam(coarse,4);check(selected.length>0,'Lost the valid original parent.');hierarchy.distinctAvailableLineParents=selected.length;hierarchy.repeatedLineParentFallback=selected.length<4;while(selected.length<4)selected.push(selected[0]);hierarchy.selectedLineParents=selected.map(e=>({id:e.id,geneHash:e.geneHash,merit:e.metrics.merit,score:e.result.score,physicalPathProfile:e.pathProfile}));
 for(let group=0;group<4;group++){
  const lineParent=selected[group],lock=ctx.G.clone(lineParent.gene);let current=lineParent;
  for(let step=0;step<8;step++){const index=32+group*8+step,e=evaluateProposal(fine(ctx,current,ctx.schedule[index],lock),'h-fine-'+group+'-'+step,current,hierarchy,lineParent);allHierarchy.push(e);if(e.accepted&&order(e,current)<0)current=e;}
 }
 let pool=[parent];const allControl=[parent];
 for(let i=0;i<64;i++){const chosen=pool[i%pool.length],e=evaluateProposal(fine(ctx,chosen,ctx.schedule[i]),'control-'+i,chosen,control);allControl.push(e);pool=beam([...pool,e],4);}
 const finish=(arm,entries)=>{
  const representative=displayed(entries),searchBest=beam(entries,1)[0];arm.valid=arm.trials.filter(e=>e.valid&&e.status==='finished').length;arm.failed=arm.trials.length-arm.valid;arm.uniqueGenes=new Set(arm.trials.map(e=>e.geneHash)).size;arm.duplicateTrials=arm.trials.filter(e=>e.duplicateOf!==null).length;arm.unchangedTrials=arm.trials.filter(e=>e.unchangedFromParent).length;arm.zeroLineAmplitudeTrials=arm.trials.filter(e=>e.zeroLineAmplitude).length;
  arm.highestScore=compact(representative);arm.highestMerit=compact(searchBest);arm.unchangedScoreImproved=representative.result.score>parent.result.score;arm.bestCompleteCorners=Math.max(...entries.filter(e=>e.accepted).map(e=>e.metrics.completeCorners));arm.bestCompleteLinks=Math.max(...entries.filter(e=>e.accepted).map(e=>e.metrics.completeLinks));
  arm.savedRepresentatives={highestScore:{gene:Array.from(representative.gene),record:representative.record,result:{...representative.result,frames:undefined}},highestMerit:{gene:Array.from(searchBest.gene),record:searchBest.record,result:{...searchBest.result,frames:undefined}}};
 };
 finish(hierarchy,allHierarchy);finish(control,allControl);check(hierarchy.trials.length===64&&control.trials.length===64&&row.physicalEvaluations===129,'Unexpected physical evaluation budget.');
 row.comparison={scoreDelta:hierarchy.highestScore.score-control.highestScore.score,meritDelta:hierarchy.highestMerit.metrics.merit-control.highestMerit.metrics.merit,validDelta:hierarchy.valid-control.valid,cornersDelta:hierarchy.bestCompleteCorners-control.bestCompleteCorners,linksDelta:hierarchy.bestCompleteLinks-control.bestCompleteLinks};
 verifySources(options.sourceRoot,ctx.input.sourceHashes);checkpoint(row);return row;
}
async function main(options){
 const ids=options.vehicle?[options.vehicle]:VEHICLES,report={schema:1,method:METHOD,options,toolSha256:SCRIPT_HASH,startedAt:new Date().toISOString(),status:'running',vehicles:[],errors:[]};
 const checkpoint=row=>{if(row){const i=report.vehicles.findIndex(v=>v.vehicle===row.vehicle);if(i<0)report.vehicles.push(row);else report.vehicles[i]=row;}report.physicalEvaluations=report.vehicles.reduce((n,v)=>n+v.physicalEvaluations,0);write(options.out,report);};checkpoint();
 for(const id of ids)try{check(sha(fs.readFileSync(__filename))===SCRIPT_HASH,'Tool changed during experiment.');const row=await runVehicle(options,id,checkpoint);verifySources(options.sourceRoot,row.input.sourceHashes);check(sha(fs.readFileSync(__filename))===SCRIPT_HASH,'Tool changed during experiment.');row.sourcesVerifiedAtEnd=true;console.log(JSON.stringify({vehicle:id,mode:options.mode,evaluations:row.physicalEvaluations,comparison:row.comparison||null,proposalChecks:row.proposalChecks}));}catch(error){report.errors.push({vehicle:id,error:error.stack||String(error)});checkpoint();console.error(id+': '+error.message);}
 report.toolVerifiedAtEnd=sha(fs.readFileSync(__filename))===SCRIPT_HASH;if(!report.toolVerifiedAtEnd)report.errors.push({error:'Tool changed during experiment.'});report.status=report.errors.length?'errors':'completed';report.finishedAt=new Date().toISOString();checkpoint();console.log(JSON.stringify({status:report.status,output:options.out,physicalEvaluations:report.physicalEvaluations}));return report;
}
if(require.main===module){if(process.argv.includes('--help'))console.log('Offline fixed-parent study; no production changes. --source-root <frozen repo> --input-dir <80 reports> --vehicle <one fixed id> --out <json>. --dry-run = zero physics; --smoke = parent plus four probes, not experiment results. Full = 129 evaluations/car, two arms of 64.');else try{main(args(process.argv.slice(2))).then(report=>{if(report.status==='errors')process.exitCode=1;}).catch(error=>{console.error(error.stack);process.exitCode=1;});}catch(error){console.error(error.stack);process.exitCode=1;}}
module.exports={METHOD,VEHICLES,args,deltaAt,lineWindow,lineEqual,stateDelta,pathProfile,physicalLineDelta,metrics,order,beam,runVehicle,main};
