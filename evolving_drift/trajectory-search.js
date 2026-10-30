/* Search guidance measured from complete physical replays. This module never
 * changes a score, a failure rule, a vehicle pose or its physical state. */
(function(root){
 'use strict';
 const G=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null);
 const S=root.DriftEvolutionStrategies||(typeof require==='function'?require('./evolution-strategies.js'):null);
 const A=root.DriftConnectionAnalysis||(typeof require==='function'?require('./connection-analysis.js'):null);
 const Speed=root.DriftEntrySpeedPlanner||(typeof require==='function'?require('./entry-speed-planner.js'):null);
 if(!G||!S||!A||!Speed)throw new Error('Load Genome, EvolutionStrategies, ConnectionAnalysis and EntrySpeedPlanner before TrajectorySearch.');
 const C=G.CHANNELS,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
 const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:0;
 const smooth=x=>{x=clamp(x,0,1);return x*x*x*(10+x*(-15+6*x));};
 function roadPoint(track,f){
  const s=typeof track.project==='function'?track.project(f.x,f.y,f.s).s:f.s,q=track.sample(clamp(s,0,track.length));
  return {s,q,lateral:-(f.x-q.x)*Math.sin(q.heading)+(f.y-q.y)*Math.cos(q.heading)};
 }
 function polygonDistance(p,polygon){
  let inside=false,best=Infinity;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
   const a=polygon[j],b=polygon[i],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
   best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
   if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }return (inside||best<1e-9?1:-1)*best;
 }
 function frontMargin(vehicle,track,f){
  const p=vehicle.physics||vehicle,lf=(p.wheelbaseM||2.7)*(1-(p.frontWeightFraction||.52)),half=(p.trackWidthM||(p.widthM||1.8)*.84)/2,c=Math.cos(f.yaw),s=Math.sin(f.yaw);
  return Math.min(...[-half,half].map(y=>{
   const point={x:f.x+lf*c-y*s,y:f.y+lf*s+y*c};let margin;
   if(track.boundaryPolygons?.length)margin=Math.max(...track.boundaryPolygons.map(poly=>polygonDistance(point,poly)));
   else {const q=roadPoint(track,{...point,s:f.s}),left=q.q.widthLeft??(track.width||14)/2,right=q.q.widthRight??(track.width||14)/2;margin=Math.min(left-q.lateral,right+q.lateral);}
   for(const polygon of track.excludedPolygons||[])margin=Math.min(margin,-polygonDistance(point,polygon));
   return margin;
  }));
 }
 function stations(track,zones){
  if(!zones.length)return [];
  const start=Math.max(2.5,(zones[0].cornerStart??zones[0].start)-40),end=Math.min(track.length-2,zones.at(-1).exit+35);
  return [...new Set([start,end,...zones.flatMap(z=>[z.cornerStart??z.start,z.apex??((z.cornerStart??z.start)+z.exit)/2,z.exit]),...zones.slice(1).map((z,i)=>(zones[i].exit+(z.cornerStart??z.start))/2)])].filter(s=>s>=start&&s<=end).sort((a,b)=>a-b);
 }
 function measure(vehicle,track,entry,zones=S.zones(track)){
  const record=entry.record||entry.result?.frames||[],gates=stations(track,zones),valid=entry.accepted!==false&&entry.result?.valid===true&&entry.result?.status==='finished';
  if(!valid||record.length<2||gates.length<2)return {observed:false,valid,merit:0,feasible:false,family:'unknown',states:[],vector:[],progress:0,completed:0};
  const states=[],samples=[],stride=Math.max(1,Math.floor(record.length/240));let next=0,previous=null,pathNext=0,backtrackingM=0;
  const pathStations=Array.from({length:96},(_,i)=>2.5+(track.length-2.5)*i/95),pathPoints=[];
  const interpolateState=(a,b,at,u)=>{
   const point={s:at};for(const key of ['x','y','vx','vy','speed','r','beta'])point[key]=(a[key]||0)+((b[key]||0)-(a[key]||0))*u;
   point.yaw=a.yaw+wrap(b.yaw-a.yaw)*u;const q=roadPoint(track,point),heading=Math.atan2(point.vy,point.vx);
   return {s:at,x:point.x,y:point.y,lateral:q.lateral,speed:point.speed,velocityHeading:heading,velocityError:wrap(heading-q.q.heading),beta:point.beta,yawRate:point.r,point};
  };
  for(let i=0;i<record.length;i++){
   const f=record[i];if(![f.s,f.x,f.y,f.vx,f.vy,f.yaw,f.speed].every(Number.isFinite))continue;
   const road=roadPoint(track,f);
   if(previous)backtrackingM+=Math.max(0,previous.road.s-road.s);
   if(previous&&road.s>previous.road.s){
    while(next<gates.length&&gates[next]<previous.road.s)next++;
    while(next<gates.length&&gates[next]<=road.s){
     const at=gates[next++],u=clamp((at-previous.road.s)/(road.s-previous.road.s),0,1),state=interpolateState(previous.f,f,at,u),{point,...values}=state;
     states.push({...values,frontMargin:frontMargin(vehicle,track,point)});
    }
    while(pathNext<pathStations.length&&pathStations[pathNext]<previous.road.s)pathNext++;
    while(pathNext<pathStations.length&&pathStations[pathNext]<=road.s){
     const at=pathStations[pathNext++],u=clamp((at-previous.road.s)/(road.s-previous.road.s),0,1),{point,...values}=interpolateState(previous.f,f,at,u);
     pathPoints.push(values);
    }
   }
   if(i%stride===0&&road.s>=gates[0]&&road.s<=gates.at(-1)&&f.speed>=3){
    const heading=Math.atan2(f.vy,f.vx),zone=zones.find(z=>road.s>=(z.cornerStart??z.start)&&road.s<=z.exit);
    samples.push({s:road.s,time:f.time||0,lateral:road.lateral,speed:f.speed,heading,headingError:Math.abs(wrap(heading-road.q.heading)),beta:f.beta||0,yawRate:f.r||0,status:f.status,forwardSpeed:Math.cos(road.q.heading)*f.vx+Math.sin(road.q.heading)*f.vy,
     outward:zone?Math.max(0,-zone.sign*(-Math.sin(road.q.heading)*f.vx+Math.cos(road.q.heading)*f.vy)):0,margin:frontMargin(vehicle,track,f)});
   }
   previous={f,road};
  }
  const regions=A.measure(track,entry.result.drift,record).regions,progresses=regions.map(r=>clamp(r.progress||0,0,1));
  const progress=progresses.length?.65*mean(progresses)+.35*Math.min(...progresses):0,completed=regions.filter(r=>r.complete).length;
  const moving=samples.filter(f=>f.speed>=8&&f.forwardSpeed>0&&f.status!=='spin'&&Math.abs(f.beta)<75*Math.PI/180);
  // Same basic scoring eligibility: 10–70 degrees and at least 8 m/s.
  // A recovered spin remains a valid finish, but earns no search-angle bonus.
  const angle=mean(samples.map(f=>{
   const beta=Math.abs(f.beta);return f.speed>=8&&f.forwardSpeed>0&&f.status!=='spin'&&beta>=10*Math.PI/180&&beta<=70*Math.PI/180
    ?clamp((Math.sin(beta)-Math.sin(2*Math.PI/180))/(Math.sin(70*Math.PI/180)-Math.sin(2*Math.PI/180)),0,1):0;
  })),headingError=moving.length?mean(moving.map(f=>f.headingError)):Math.PI,outward=mean(moving.map(f=>f.outward));
  const margins=samples.map(f=>f.margin),minimumMargin=margins.length?Math.min(...margins):0;
  const curvatureChange=[],yawDivergence=[];let oldCurvature=null;
  for(let i=1;i<moving.length;i++){
   const a=moving[i-1],b=moving[i],ds=b.s-a.s,dt=b.time-a.time;if(ds<=.1||dt<=0||dt>.5)continue;
   const velocityRate=wrap(b.heading-a.heading)/dt,k=wrap(b.heading-a.heading)/ds;
   yawDivergence.push(Math.abs(b.yawRate-velocityRate));if(oldCurvature!==null)curvatureChange.push(Math.abs(k-oldCurvature));oldCurvature=k;
  }
  const direction=moving.length?1/(1+(headingError/.4)**2):0,recovery=yawDivergence.length?1/(1+mean(yawDivergence)/.65):0,curvature=curvatureChange.length?1/(1+mean(curvatureChange)/.025):0,clearance=mean(margins.map(m=>clamp(m/.7,0,1)));
  const geometry=.35*direction+(moving.length?.25/(1+outward/3):0)+.15*recovery+.15*curvature+.10*clearance;
  // Grip-only candidates may seed another broad line, but gain no drift
  // progress merely by being centered. Body angle is never heading error.
  const merit=.60*progress+.10*angle+.30*geometry,coverage=states.length/gates.length;
  const vector=states.flatMap(f=>[f.lateral/4,f.velocityError/.5,f.speed/25,f.beta/.6,f.yawRate]);
  const family=states.filter((_,i)=>i%2===0).map(f=>Math.round(f.lateral/2)+':'+Math.round(f.velocityError/.3)).join('|');
  const exits=zones.map(z=>states.find(f=>Math.abs(f.s-z.exit)<1e-6)).filter(Boolean),maxExitError=exits.length?Math.max(...exits.map(f=>Math.abs(f.velocityError))):Math.PI;
  return {observed:coverage>=.8,valid,merit,geometry,progress,completed,angle,direction,recovery,curvature,clearance,outward,headingError,velocitySamples:moving.length,minimumMargin,sampledMinimumMargin:minimumMargin,marginSampling:{samples:margins.length,frameStride:stride,fullPhysicsBoundaryCheck:false},coverage,states,vector,family,
   pathProfile:{start:2.5,end:track.length,spacingM:(track.length-2.5)/95,expectedSamples:96,points:pathPoints,coverage:pathPoints.length/96,backtrackingM,sampled:true,continuousProof:false},
   feasible:coverage>=.8&&progress>.015&&geometry>.52&&maxExitError<.7,regions:regions.map(r=>({id:r.id,progress:r.progress||0,complete:!!r.complete}))};
 }
 function distance(a,b){if(!a.vector.length||a.vector.length!==b.vector.length)return 0;return Math.sqrt(mean(a.vector.map((x,i)=>(x-b.vector[i])**2)));}
 function comparePath(parent,child){
  const gates=child.states.map(b=>({a:parent.states.find(a=>Math.abs(a.s-b.s)<1e-6),b})).filter(x=>x.a);
  const a=parent.pathProfile,b=child.pathProfile,pairs=(b?.points||[]).map(q=>({a:a?.points.find(p=>Math.abs(p.s-q.s)<1e-6),b:q})).filter(x=>x.a);
  if(gates.length<2||pairs.length<2)return {observed:false,preserved:false,sampled:true,continuousProof:false};
  const rms=values=>Math.sqrt(mean(values.map(x=>x*x))),lateral=pairs.map(({a,b})=>b.lateral-a.lateral),xy=pairs.map(({a,b})=>Math.hypot(b.x-a.x,b.y-a.y)),heading=pairs.map(({a,b})=>wrap(b.velocityHeading-a.velocityHeading));
  const lateralRms=rms(lateral),maxLateral=Math.max(...lateral.map(Math.abs)),xyRms=rms(xy),maxXY=Math.max(...xy),headingRms=rms(heading),maxHeading=Math.max(...heading.map(Math.abs));
  const speedChange=rms(gates.map(({a,b})=>(b.speed-a.speed)/Math.max(5,a.speed))),yawChange=Math.abs(gates.at(-1).b.yawRate-gates.at(-1).a.yawRate),backtrackingChange=Math.max(0,b.backtrackingM-a.backtrackingM);
  const coverage=pairs.length/Math.max(a.expectedSamples,b.expectedSamples);
  // Search tolerances only. A larger change is a newly explored physical
  // line, never an invalid run and never a reason to discard its score.
  return {observed:true,sampled:true,continuousProof:false,basis:'uniform-distance-path-and-entry-exit-gates',samples:pairs.length,coverage,lateralRms,maxLateral,xyRms,maxXY,headingRms,maxHeading,speedChange,exitYawRateChange:yawChange,backtrackingChange,
   preserved:coverage>=.95&&lateralRms<=.9&&maxLateral<=2&&xyRms<=1.2&&maxXY<=2.5&&headingRms<=.20&&maxHeading<=.45&&speedChange<=.25&&yawChange<=.6&&backtrackingChange<=.5};
 }
 function retain(entries,profile,limit=8){
  if(!Number.isInteger(limit)||limit<1)throw new RangeError('Trajectory archive limit must be a positive integer.');
  const unique=[...new Map(entries.filter(e=>e?.accepted!==false&&e?.result?.valid&&e.result.status==='finished').map(e=>[e.id,e])).values()],ranked=unique.filter(e=>profile(e).observed).sort((a,b)=>profile(b).merit-profile(a).merit||a.sequence-b.sequence);
  const chosen=[],add=e=>{if(e&&chosen.length<limit&&!chosen.includes(e))chosen.push(e);};
  // Reserve completed specialists within this bounded global archive. Any
  // additional completed parents remain in the engine's regional archives.
  const complete=new Map();for(const e of ranked)for(const r of profile(e).regions)if(r.complete&&!complete.has(r.id))complete.set(r.id,e);
  add(ranked[0]);for(const e of complete.values())add(e);
  const families=new Set(chosen.map(e=>profile(e).family));
  for(const e of ranked){if(chosen.length>=limit)break;if(!families.has(profile(e).family)){add(e);families.add(profile(e).family);}}
  while(chosen.length<limit){let best=null,value=-Infinity;for(const e of ranked){if(chosen.includes(e))continue;const novelty=Math.min(...chosen.map(p=>distance(profile(p),profile(e))));if(novelty<1e-5)continue;const score=.7*profile(e).merit+.3*Math.min(1,novelty);if(score>value){value=score;best=e;}}if(!best)break;add(best);}
  return chosen;
 }
 function interpolate(anchors,s){if(s<=anchors[0].s)return anchors[0].value;if(s>=anchors.at(-1).s)return anchors.at(-1).value;let i=0;while(i<anchors.length-2&&s>anchors[i+1].s)i++;const a=anchors[i],b=anchors[i+1];return a.value+(b.value-a.value)*smooth((s-a.s)/(b.s-a.s));}
 function coarse(vehicle,track,parent,rng,options={}){
  const p=vehicle.physics||vehicle,zones=options.zones||S.zones(track),bounds=options.lineBounds||G.corridorBounds(vehicle,track),limits={maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds};
  const gates=stations(track,zones),start=gates[0],end=gates.at(-1),scale=clamp(options.scale??1,.15,1),gene=G.clone(parent.gene),ds=track.length/(G.KNOTS-1);
  if(gates.length<2)return null;
  // Each span uses its own corridor headroom. A single saturated knot no
  // longer scales every unrelated corner displacement down to zero.
  const anchors=gates.map((s,i)=>({s,value:i===0||i===gates.length-1?0:(rng()*2-1)*(.35+.65*rng())*scale}));
  let changed=0;for(let i=0;i<G.KNOTS;i++){
   const s=i*ds;if(s<=start||s>=end)continue;const j=i*G.STRIDE+C.lineOffset,d=interpolate(anchors,s),space=d>=0?bounds[i].max-gene[j]:gene[j]-bounds[i].min;
   const delta=d*Math.min(2.5,Math.max(0,space)*.55);if(Math.abs(delta)>1e-10){gene[j]+=delta;changed++;}
  }
  // Smooth only the displacement field and project it locally. This keeps
  // inherited corner shapes while removing isolated corridor-edge kinks.
  for(let pass=0;pass<2;pass++){const old=G.clone(gene);for(let i=1;i<G.KNOTS-1;i++){const s=i*ds;if(s<=start||s>=end)continue;const j=i*G.STRIDE+C.lineOffset,d=(old[j-G.STRIDE]-parent.gene[j-G.STRIDE]+2*(old[j]-parent.gene[j])+old[j+G.STRIDE]-parent.gene[j+G.STRIDE])/4;gene[j]=clamp(parent.gene[j]+d,bounds[i].min,bounds[i].max);}}
  let result=G.normalize(S.couple(vehicle,track,parent.gene,gene,parent.record),limits);const plans=[];
  for(const zone of zones){
   const params={entrySpeedRatio:.84+rng()*.28,brakeLead:-4+rng()*16,brakeStrength:.8+rng()*.35,brakeRelease:-7+rng()*12};
   const plan=Speed.plan(vehicle,track,result,options.referenceRecord||parent.record,zone,params,{lower:S.approachStart(track,zone,zones),arrivalRecord:parent.record,referenceGene:options.referenceGene});
   const adjusted=Speed.apply(result,plan);for(let i=0;i<G.LENGTH;i++)result[i]+=(adjusted[i]-result[i])*scale;plans.push(plan);
  }
  result=G.normalize(result,limits);
  return {gene:result,change:{family:'coarse-line-speed',phase:'coarse',start,end,anchors,changedLineKnots:changed,entrySpeedPlans:plans}};
 }
 function fine(vehicle,track,parent,rng,options={}){
  const zones=options.zones||S.zones(track),profiles=options.profile?.regions||[],measured=A.measure(track,parent.result.drift,parent.record).regions;
  const links=measured.filter(r=>r.kind==='link'&&!r.complete&&(measured.find(a=>a.id===r.fromZoneId)?.progress||0)>=.25).sort((a,b)=>a.progress-b.progress);
  if(links.length&&rng()<.5){
   const target=links[0],mode=target.reason==='speed'?'speed':'angle';
   if(!options.allowedConnection||options.allowedConnection(target.id,'connection-'+mode)){
    const proposal=S.connect(vehicle,track,parent,rng,{...options,zones,connectionTarget:target,connectionMode:mode,scale:Math.min(.45,options.scale??.3)});
    return {...proposal,change:{...proposal.change,phase:'fine',coarseParentId:parent.id,physicalPathMustBeRemeasured:true}};
   }
  }
  const ordered=zones.map(z=>({zone:z,progress:profiles.find(r=>r.id===z.id)?.progress||0})).sort((a,b)=>a.progress-b.progress),zone=ordered[Math.floor(rng()*Math.min(2,ordered.length))]?.zone;
  if(!zone)return null;
  const parentView={...parent,result:{...parent.result,frames:parent.record},metric:S.niche(vehicle,track,parent.result,parent.record,zone)},families=['steer','angle','lead','power','entry-speed','brake-release'];
  const proposal=S.adaptive(vehicle,track,parentView,rng,{...options,zones,zone,scale:Math.min(.45,options.scale??.3),family:families[Math.floor(rng()*families.length)]});
  return {...proposal,change:{...proposal.change,phase:'fine',coarseParentId:parent.id,physicalPathMustBeRemeasured:true}};
 }
 class RetryPolicy{
  constructor(){this.records=new Map();this.skipped=0;}
  key(parent,region,family){return parent+'|'+region+'|'+family;}
  allowed(parent,region,family,generation){const r=this.records.get(this.key(parent,region,family));if(r&&r.until>generation){this.skipped++;return false;}return true;}
  observe(entry,generation){
   const region=entry.mutation?.connectionId;if(!region)return;const key=this.key(entry.parentId,region,entry.mutation.retryFamily||entry.mutation.family),previous=this.records.get(key)||{failures:0,until:0,last:generation};
   const failures=entry.accepted?0:previous.failures+1;this.records.set(key,{failures,until:entry.accepted?0:failures>=3?generation+4:previous.until,last:generation});
   if(this.records.size>256)for(const [k,r]of this.records)if(r.last<generation-8)this.records.delete(k);
   while(this.records.size>256)this.records.delete(this.records.keys().next().value);
  }
  snapshot(generation){return {blocked:[...this.records.values()].filter(r=>r.until>generation).length,skipped:this.skipped};}
 }
 const api=Object.freeze({VERSION:1,measure,retain,distance,comparePath,stations,frontMargin,coarse,fine,RetryPolicy});root.DriftTrajectorySearch=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
