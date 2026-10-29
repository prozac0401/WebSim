/* Physical intent mutations. These functions only change genome values and
 * inspect completed replays. Vehicle poses and forces remain physics outputs. */
(function(root){
'use strict';
const G=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null);
const F=root.DriftFitness||(typeof require==='function'?require('./fitness.js'):null);
if(!G||!F)throw new Error('Load Genome and Fitness before EvolutionStrategies.');
const C=G.CHANNELS,DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const smoother=t=>{t=clamp(t,0,1);return t*t*t*(10+t*(-15+6*t));};
const pulse=(s,c,w)=>Math.abs(s-c)>=w?0:.5+.5*Math.cos(Math.PI*(s-c)/w);
const FAMILIES=Object.freeze(['link','link','link','bridge','bridge','bridge','apex-arc','apex-arc','apex-arc','sustained-angle','sustained-angle','sustained-angle','speed-hold','speed-hold','recovery','trajectory','steer','angle','combined','line','lead','power','gear','gearPower','approach']);
const straightCache=new WeakMap();
function zones(track){return F.apexZones(track);}
function links(track){return F.straightLinks(track);}
function trailingStraightStart(track){
 if(straightCache.has(track))return straightCache.get(track);
 let start=track.length;
 for(let s=track.length;s>=0;s-=2){if(Math.abs(track.sample(s).curvature||0)>.0005)break;start=s;}
 straightCache.set(track,start);return start;
}
function approachStart(track,zone,regions=zones(track)){
 const index=regions.findIndex(z=>zone.id?z.id===zone.id:z.exit===zone.exit);
 return Math.max(2.5,index>0?regions[index-1].exit:2.5);
}
function supports(vehicle,track,record){
 const p=vehicle.physics||vehicle,q=track.sample?.(0);
 return !!q&&[q.x,q.y,q.heading,p.wheelbaseM,p.maxSteer].every(Number.isFinite)
  &&Array.isArray(p.gearRatios)&&p.gearRatios.length>0&&Array.isArray(record)&&record.length>1
  &&record.every(f=>[f.s,f.speed,f.x,f.y,f.vx,f.vy,f.yaw].every(Number.isFinite));
}
function point(track,gene,s){s=clamp(s,0,track.length);const p=track.sample(s),d=G.sample(gene,s,track.length).lineOffset;return{x:p.x-Math.sin(p.heading)*d,y:p.y+Math.cos(p.heading)*d,heading:p.heading};}
function feedforward(vehicle,track,gene,s,speed){
 const L=(vehicle.physics||vehicle).wheelbaseM,look=clamp(5+speed*.48,6,16),a=point(track,gene,s),b=point(track,gene,s+look),u=point(track,gene,s-1),v=point(track,gene,s+1);
 const heading=Math.hypot(v.x-u.x,v.y-u.y)>.01?Math.atan2(v.y-u.y,v.x-u.x):a.heading,dist=Math.max(2,Math.hypot(b.x-a.x,b.y-a.y));
 return Math.atan(L*2*Math.sin(Math.atan2(b.y-a.y,b.x-a.x)-heading)/dist);
}
function speedAt(record,s){let i=0;while(i<record.length-2&&record[i+1].s<s)i++;const a=record[i],b=record[Math.min(record.length-1,i+1)],t=clamp((s-a.s)/Math.max(1e-9,b.s-a.s),0,1);return a.speed+(b.speed-a.speed)*t;}
function couple(vehicle,track,parent,child,record){
 const result=G.clone(child),p=vehicle.physics||vehicle;
 for(let i=0;i<G.KNOTS;i++){const s=i/(G.KNOTS-1)*track.length,v=speedAt(record,s),delta=feedforward(vehicle,track,result,s,v)-feedforward(vehicle,track,parent,s,v);result[i*G.STRIDE+C.steer]=clamp(result[i*G.STRIDE+C.steer]+delta,-p.maxSteer,p.maxSteer);}
 return result;
}
function lineShape(gene,track,s){
 const h=Math.min(3,track.length/(G.KNOTS-1)/2),d=G.sample(gene,s,track.length).lineOffset,a=G.sample(gene,s-h,track.length).lineOffset,b=G.sample(gene,s+h,track.length).lineOffset;
 return {d,slope:(b-a)/(2*h),curvature:(b-2*d+a)/(h*h)};
}
function joinLine(a,b,length,t){
 const c1=a.slope*length,c2=a.curvature*length*length/2,D=b.d-a.d-c1-c2,V=b.slope*length-c1-2*c2,A=b.curvature*length*length-2*c2;
 return a.d+c1*t+c2*t*t+(10*D-4*V+A/2)*t**3+(-15*D+7*V-A)*t**4+(6*D-3*V+A/2)*t**5;
}
function entry(vehicle,track,prepared,rng,arcIndex,previousParams=null,options={}){
 const p=vehicle.physics||vehicle,ds=track.length/(G.KNOTS-1),initial=prepared.gene,baseline={frames:prepared.record};
 const bounds=options.lineBounds||G.corridorBounds(vehicle,track),corners=(options.zones||zones(track)).map(z=>({...z,kStart:z.start/ds,kEnd:z.exit/ds}));
 const rnd=(a,b)=>a+(b-a)*rng(),pick=a=>a[Math.floor(rng()*a.length)],FF={couple};
 if(!corners[arcIndex])throw new RangeError('A detected exit region is required.');
function random(){
 const arc=pick(corners),last=arc===corners.at(-1),maximumLength=Math.max(0,Math.min(60,arc.end-arc.exit-8)),length=rnd(0,maximumLength),lower=approachStart(track,arc,corners),upper=Math.max(lower,(arc.apex??((arc.cornerStart??arc.start)+arc.exit)/2)-4),onset=rng()<.4?rnd(lower,upper):clamp((arc.cornerStart??arc.start)+rnd(-35,8),lower,upper);
 return bounded({arc:corners.indexOf(arc),onset,ramp:rnd(5,14),delay:rnd(0,8),entryBrake:rnd(0,.12),prepPedal:rnd(.4,1),prepRelease:rnd(.25,.9),prepLead:rnd(8,Math.max(8,onset-2.5)),feint:rnd(.3,2.2),angle:rnd(12,32),exitAngle:rnd(14,35),pedal:rnd(.5,1),slip:rng()<.15?0:rnd(.2,1.1),lead:rnd(.05,.5),gear:pick(last?[0,2,3]:[0,3,4]),line:rnd(0,last?7:3.5),apexLine:rnd(.2,2.2),bow:rnd(.5,last?4:2.5),length,recovery:rnd(14,30),steer:rnd(-.04,.04),exitSteer:rnd(-.035,.035),compensation:1,tailPedal:rnd(.25,.6)});
}
const scales={onset:22,prepPedal:.12,prepRelease:.15,ramp:3,delay:3,entryBrake:.04,prepLead:18,feint:.5,angle:5,exitAngle:5,pedal:.1,slip:.2,lead:.08,line:1,apexLine:.75,bow:1,length:7,recovery:5,steer:.015,exitSteer:.02,compensation:.2,tailPedal:.1};
function bounded(q){
 const z=corners[q.arc],apex=z.apex??((z.cornerStart??z.start)+z.exit)/2;
 const lower=approachStart(track,z,corners);q.onset=clamp(q.onset,lower,Math.max(lower,apex-4));q.prepPedal=clamp(q.prepPedal??.4,.15,1);q.prepRelease=clamp(q.prepRelease??.5,0,1);q.ramp=clamp(q.ramp,3,20);q.delay=clamp(q.delay,0,20);q.entryBrake=clamp(q.entryBrake,0,.3);
 const available=Math.max(0,q.onset-lower);q.prepLead=clamp(q.prepLead??28,Math.min(8,available),available);q.feint=clamp(q.feint??0,0,4);q.angle=clamp(q.angle,3,50);q.exitAngle=clamp(q.exitAngle,5,50);q.pedal=clamp(q.pedal,.15,1);q.slip=clamp(q.slip,0,1.5);q.lead=clamp(q.lead,.05,.8);q.line=clamp(q.line,-8,12);q.apexLine=clamp(q.apexLine??.5,-4,8);q.bow=clamp(q.bow,.1,8);
 const exitSpace=Math.max(ds,z.end-z.exit),minimumRecovery=Math.min(8,exitSpace),maximumHold=Math.max(0,exitSpace-minimumRecovery);
 q.length=clamp(q.length,0,Math.min(70,maximumHold));q.recovery=clamp(q.recovery,minimumRecovery,Math.max(minimumRecovery,exitSpace-q.length));
 q.steer=clamp(q.steer,-.1,.1);q.exitSteer=clamp(q.exitSteer,-.15,.15);q.compensation=clamp(q.compensation,0,1.3);q.tailPedal=clamp(q.tailPedal,.1,.8);return q;
}
function mutate(parent){const q=bounded({...parent}),strength=clamp(options.scale??1,.03,1.5);for(let n=1+Math.floor(rng()*4);n;n--){const key=pick([...Object.keys(scales),'gear']);if(key==='gear')q.gear=pick([0,2,3,4]);else q[key]+=rnd(-scales[key],scales[key])*strength;}if(rng()<.22){q.exitAngle+=rnd(-3,8)*strength;q.exitSteer+=rnd(-.03,.01)*strength;q.bow+=rnd(-.5,1.5)*strength;q.length+=rnd(-3,8)*strength;}return bounded(q);}
function generate(q){
 const gene=G.clone(initial),z=corners[q.arc],sign=-z.sign,apex=z.apex??((z.cornerStart??z.start)+z.exit)/2,exit=z.exit,hold=exit+q.length,R=q.recovery,finish=hold+R;
 const tailStart=Math.max(z.end+20,trailingStraightStart(track)),preparationStart=approachStart(track,z,corners);
 // Preparation can use the mapped road before START; no vehicle state is reset.
 for(let i=0;i<G.KNOTS;i++){
  const s=i*ds,j=i*G.STRIDE,acceleration=smooth((s-preparationStart)/8)*(1-smooth((s-q.onset)/(q.ramp+q.delay)));
  if(acceleration>0){gene[j+C.throttle]+=(q.prepPedal-gene[j+C.throttle])*acceleration;gene[j+C.brake]*=1-q.prepRelease*acceleration;}
  if(q.prepLead>0&&s>q.onset-q.prepLead&&s<q.onset){const u=(s-q.onset+q.prepLead)/q.prepLead,w=64*u*u*u*(1-u)**3;gene[j+C.brake]+=q.entryBrake*w;gene[j+C.lineOffset]+=sign*q.feint*w;}
 }
 const preparedLine=G.clone(gene),lineStart=Math.max(preparationStart,q.onset-12),a=lineShape(preparedLine,track,lineStart),b=lineShape(initial,track,finish),inside=z.sign*q.apexLine;
 const shape=s=>{const before=s<=apex,span=Math.max(ds,before?apex-q.onset:hold-apex),outside=sign*(q.line+(before?0:q.bow)),bend=(outside-inside)/(span*span),u=s-apex;return {d:inside+bend*u*u,slope:2*bend*u,curvature:2*bend};};
 const entryLine=shape(q.onset),exitLine=shape(hold);
 for(let i=0;i<G.KNOTS;i++){
  const s=i*ds,j=i*G.STRIDE,weight=smooth((s-q.onset)/q.ramp)*(1-smooth((s-hold)/R)),power=smooth((s-q.onset-q.delay)/q.ramp)*(1-smooth((s-hold)/R)),phase=smooth((s-apex)/Math.max(ds,exit-apex));
  if(weight>0){gene[j+C.targetSlip]=sign*(q.angle+(q.exitAngle-q.angle)*phase)*DEG*weight;gene[j+C.driveSlip]=q.slip*power;gene[j+C.counterLead]+=(q.lead-gene[j+C.counterLead])*weight;gene[j+C.throttle]+=(q.pedal-gene[j+C.throttle])*power;gene[j+C.brake]*=1-weight;gene[j+C.steer]+=sign*(q.steer+(q.exitSteer-q.steer)*phase)*weight;if(q.gear&&weight>.4)gene[j+C.gearHold]=q.gear;}
  if(s>lineStart&&s<finish)gene[j+C.lineOffset]=s<q.onset?joinLine(a,entryLine,q.onset-lineStart,(s-lineStart)/(q.onset-lineStart)):s>hold?joinLine(exitLine,b,R,(s-hold)/R):shape(s).d;
  // A changed arrival speed may require different pedals on the final straight.
  if(z===corners.at(-1)&&s>tailStart){const w=smooth((s-tailStart)/15);gene[j+C.brake]*=1-w;gene[j+C.throttle]+=(q.tailPedal-gene[j+C.throttle])*w;gene[j+C.gearHold]=0;}
 }
 const n=G.normalize(gene,{maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds}),coupled=FF.couple(vehicle,track,initial,n,baseline.frames);
 for(let i=0;i<G.KNOTS;i++)n[i*G.STRIDE+C.steer]+=(coupled[i*G.STRIDE+C.steer]-n[i*G.STRIDE+C.steer])*q.compensation;
 return G.normalize(n,{maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds});
}

 let params;if(previousParams&&previousParams.arc===arcIndex)params=mutate(previousParams);else do{params=random();}while(params.arc!==arcIndex);
 return ensureChanged(vehicle,prepared.gene,{gene:generate(params),params:Object.freeze({...params})},rng);
}
function adaptive(vehicle,track,parent,rng,options={}){
 const p=vehicle.physics||vehicle,ds=track.length/(G.KNOTS-1),bounds=options.lineBounds||G.corridorBounds(vehicle,track);
 const norm=g=>G.normalize(g,{maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds});
 const rnd=(a,b)=>a+(b-a)*rng(),pick=a=>a[Math.floor(rng()*a.length)],FF={couple};
function mutate(parent){
 const m=parent.metric.bestArc,all=options.zones||zones(track),z=options.zone||all.find(x=>m&&(x.id===m.zoneId||x.exit===m.zoneExit))||pick(all),end=m?.end||z.apex;
 const center=clamp(end+rnd(-6,12),z.start+4,z.end-8),width=rnd(8,30),gene=G.clone(parent.gene),sign=-z.sign;
 let family=options.family||pick(FAMILIES);
 const adjacent=(options.links||links(track)).filter(l=>l.fromZoneId===z.id||l.toZoneId===z.id);
 // Between real corners, recovery means a controlled drift link. Grip
 // recovery belongs only to the final corner's terminal road.
 if(family==='recovery'&&adjacent.some(l=>l.fromZoneId===z.id))family='link';
 const change={family,center,width,steer:sign*rnd(-.065,.045),angle:rnd(-3,14)*DEG,line:sign*rnd(-2.8,2.8),lead:rnd(-.16,.1),slip:rnd(-.3,.3),pedal:rnd(-.12,.2),gear:pick([0,3,4,'rpm']),shiftAt:clamp(end+rnd(-14,2),z.exit-8,z.end-15)};
 const localFine=end-z.exit>25?.28:1;
 for(const key of ['steer','angle','line','lead','slip','pedal'])change[key]*=localFine;
 if(family==='link'){
  if(!adjacent.length)return {gene,change};
  const measured=parent.metric.links||[],ranked=adjacent.map(link=>({link,quality:measured.find(r=>r.id===link.id)?.coverage||0})).sort((a,b)=>a.quality-b.quality);
  const link=options.link||ranked[rng()<.7?0:Math.floor(rng()*ranked.length)].link;
  const from=all.find(a=>a.id===link.fromZoneId),to=all.find(a=>a.id===link.toZoneId);if(!from||!to)return {gene,change};
  const start=Math.ceil(Math.max(from.start+ds,from.apex-rnd(8,18))/ds)*ds,finish=Math.floor(Math.min(to.end-ds,to.apex+rnd(8,18))/ds)*ds,length=finish-start;
  if(length<6*ds||start>=from.apex||finish<=to.apex)return {gene,change};
  const first=G.sample(parent.gene,from.apex,track.length),last=G.sample(parent.gene,to.apex,track.length),a=lineShape(parent.gene,track,start),b=lineShape(parent.gene,track,finish);
  const angleA=clamp(Math.max(12,Math.abs(first.targetSlip)/DEG)+rnd(-3,4),12,40)*DEG,angleB=clamp(Math.max(12,Math.abs(last.targetSlip)/DEG)+rnd(-3,4),12,40)*DEG;
  const signA=-from.sign,signB=-to.sign,sameSign=signA===signB,gap=Math.max(ds,link.straightEnd-link.straightStart),speed=Math.max(8,speedAt(parent.result.frames,(link.straightStart+link.straightEnd)/2));
  const transitionWidth=Math.min(gap,Math.max(2*ds,speed*1.875*(angleA+angleB)/rnd(2.4,3.8))),transitionCenter=link.straightStart+transitionWidth/2+rng()*Math.max(0,gap-transitionWidth);
  const line=from.sign*rnd(-.5,1.8),pedal=rnd(.4,.8),slip=clamp(Math.max(first.driveSlip,last.driveSlip,.12),.12,.7),lead=clamp((first.counterLead+last.counterLead)/2+rnd(0,.05),.05,.8);
  Object.assign(change,{linkId:link.id,fromZoneId:from.id,toZoneId:to.id,start,end:finish,sameSign,transitionCenter,transitionWidth,angleA,angleB,line,pedal,slip});
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds;if(s<=start||s>=finish)continue;
   const j=i*G.STRIDE,t=(s-start)/length,w=smoother((s-start)/(from.apex-start))*smoother((finish-s)/(finish-to.apex));
   const phase=sameSign?smoother((s-link.straightStart)/gap):smoother((s-transitionCenter+transitionWidth/2)/transitionWidth),target=signA*angleA*(1-phase)+signB*angleB*phase;
   const transfer=sameSign?0:4*phase*(1-phase),bow=64*t*t*t*(1-t)**3*(sameSign?1:2*t-1);
   gene[j+C.lineOffset]=joinLine(a,b,length,t)+line*bow;
   gene[j+C.targetSlip]+=(target-gene[j+C.targetSlip])*w;
   gene[j+C.driveSlip]+=(slip*(1-.55*transfer)-gene[j+C.driveSlip])*w;
   gene[j+C.counterLead]+=(lead-gene[j+C.counterLead])*w;
   gene[j+C.throttle]+=(Math.max(gene[j+C.throttle],pedal)*(1-.15*transfer)-gene[j+C.throttle])*w;
   gene[j+C.brake]*=1-.95*w;
  }
  return {gene:norm(gene),change};
 }
 if(family==='bridge'){
  // Extend the missing side of the measured episode. The source is a valid
  // parent's actual intent; all changed knots still require a full replay.
  if(!m||![m.start,m.end].every(Number.isFinite)||m.end<=m.start)return {gene,change};
  const beforeMissing=Math.max(0,m.start-(z.cornerStart??z.start)),afterMissing=Math.max(0,z.exit-m.end);
  const direction=beforeMissing>=afterMissing?'before':'after',lower=approachStart(track,z,all),extension=rnd(20,100);
  const apex=z.apex??((z.cornerStart??z.start)+z.exit)/2,slipSign=m.sign===1||m.sign===-1?m.sign:sign;
  let start,finish,sourceS;
  if(direction==='before'){
   start=Math.ceil(Math.max(lower,Math.min((z.cornerStart??z.start)-rnd(8,24),(m.initiationS??m.start)-extension))/ds)*ds;
   finish=Math.min(Math.floor((z.end-ds)/ds)*ds,Math.ceil((m.start+ds)/ds)*ds);
   sourceS=Math.min(m.end,m.start+(m.end-m.start)*.3);
  }else{
   start=Math.max(Math.ceil((z.start+ds)/ds)*ds,Math.floor((m.end-ds)/ds)*ds);
   finish=Math.floor(Math.min(z.end-ds,Math.max(z.exit+8,m.end+extension))/ds)*ds;
   sourceS=Math.max(m.start,m.end-(m.end-m.start)*.3);
  }
  const length=finish-start;if(length<3*ds)return {gene,change};
  const source=G.sample(parent.gene,sourceS,track.length),a=lineShape(parent.gene,track,start),b=lineShape(parent.gene,track,finish);
  const desired=clamp(Math.max(Math.abs(source.targetSlip),(m.distanceWeightedAngle||12)*DEG,12*DEG),0,55*DEG);
  const fade=Math.min(length*.3,Math.max(2*ds,rnd(8,16))),line=z.sign*rnd(-.3,1),pedal=Math.max(source.throttle,.35);
  Object.assign(change,{direction,start,end:finish,apex,sourceS,fade,line,angle:desired,sign:slipSign});
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds;if(s<=start||s>=finish)continue;
   const j=i*G.STRIDE,t=(s-start)/length,w=smoother((s-start)/fade)*smoother((finish-s)/fade);
   const bow=apex>start+ds&&apex<finish-ds?smoother((s-start)/(apex-start))*smoother((finish-s)/(finish-apex)):64*t*t*t*(1-t)**3;
   gene[j+C.lineOffset]=joinLine(a,b,length,t)+line*bow;
   gene[j+C.targetSlip]+=(slipSign*desired-gene[j+C.targetSlip])*w;
   gene[j+C.driveSlip]+=(Math.max(source.driveSlip,.08)-gene[j+C.driveSlip])*w;
   gene[j+C.counterLead]+=(source.counterLead-gene[j+C.counterLead])*w;
   gene[j+C.throttle]+=(Math.max(pedal,gene[j+C.throttle])-gene[j+C.throttle])*w;
   gene[j+C.brake]+=(Math.min(source.brake,.02,gene[j+C.brake])-gene[j+C.brake])*w;
  }
  return {gene:norm(gene),change};
 }
 if(family==='apex-arc'){
  // The inherited line is joined to a quadratic bow around the geometric
  // apex. This only changes driver targets; the physical replay must still
  // maintain speed and remain inside the actual road boundaries.
  const apex=z.apex??((z.cornerStart??z.start)+z.exit)/2;
  const start=Math.ceil((z.start+ds)/ds)*ds,finish=Math.floor((z.end-ds)/ds)*ds;
  const span=Math.min(rnd(24,44),(apex-start)*.65,(finish-apex)*.65);
  if(span<1.5*ds)return {gene,change};
  const first=apex-span,last=apex+span,a=lineShape(parent.gene,track,start),b=lineShape(parent.gene,track,finish);
  const inside=G.sample(parent.gene,apex,track.length).lineOffset+z.sign*rnd(-.5,1.8),bend=-z.sign*rnd(.8,3)/(span*span);
  const shape=s=>{const u=s-apex;return {d:inside+bend*u*u,slope:2*bend*u,curvature:2*bend};};
  const left=shape(first),right=shape(last),angle=rnd(2,7)*DEG,slipSign=m?.sign===1||m?.sign===-1?m.sign:sign;
  const pedal=rnd(.02,.10),lead=rnd(-.025,.055);
  Object.assign(change,{start,end:finish,apex,first,last,inside,bend,angle,sign:slipSign,pedal,lead});
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds;if(s<=start||s>=finish)continue;
   const j=i*G.STRIDE,w=smoother((s-start)/(first-start))*smoother((finish-s)/(finish-last));
   gene[j+C.lineOffset]=s<first?joinLine(a,left,first-start,(s-start)/(first-start)):s>last?joinLine(right,b,finish-last,(s-last)/(finish-last)):shape(s).d;
   gene[j+C.targetSlip]+=slipSign*angle*w;
   gene[j+C.counterLead]+=lead*w;
   gene[j+C.throttle]+=pedal*w;gene[j+C.brake]*=1-.35*w;
  }
  return {gene:norm(gene),change};
 }
 if(family==='speed-hold'){
  const frames=parent.result.frames.filter(f=>f.s>=z.start&&f.s<=z.end);
  if(!frames.length)return {gene,change};
  const slow=frames.reduce((a,b)=>a.speed<b.speed?a:b),lost=(m?.speedRetention??1)<.95;
  const center=clamp(slow.s,z.start+ds,z.end-ds),width=Math.min(rnd(14,32),center-z.start,z.end-center);
  const pedal=lost?rnd(.04,.16):rnd(-.03,.05),release=lost?rnd(.25,.65):rnd(.05,.2),excessSlip=Math.max(...(slow.wheelSlip?.slice(2)||[0]).map(Math.abs))>.45;
  Object.assign(change,{center,width,pedal,release,excessSlip});
  for(let i=0;i<G.KNOTS;i++){
   const j=i*G.STRIDE,w=pulse(i*ds,center,width);if(!w)continue;
   gene[j+C.throttle]+=pedal*w;gene[j+C.brake]*=1-release*w;
   if(excessSlip)gene[j+C.driveSlip]*=1-.25*w;
  }
  return {gene:norm(gene),change};
 }
 if(family==='sustained-angle'){
  // Refine the measured continuous apex arc, including its approach.
  // The unchanged driver supplies countersteering and pedal feedback;
  // only another complete physical replay can establish an improvement.
  if(!m||![m.start,m.end].every(Number.isFinite)||m.end<=m.start)return {gene,change};
  const start=clamp(m.start,z.start+ds,z.end-ds),finish=clamp(m.end,start,z.end-ds),fade=rnd(6,12),angle=rnd(2,7)*DEG;
  const left=Math.max(z.start+ds,start-fade),right=Math.min(z.end-ds,finish+fade),slipSign=m.sign===1||m.sign===-1?m.sign:sign;
  Object.assign(change,{start,end:finish,fade,angle,sign:slipSign,center:(start+finish)/2,width:(finish-start)/2+fade});
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds;if(s<=left||s>=right)continue;
   const w=smooth((s-left)/Math.max(ds,start-left))*smooth((right-s)/Math.max(ds,right-finish));
   gene[i*G.STRIDE+C.targetSlip]+=slipSign*angle*w;
  }
  return {gene:norm(gene),change};
 }
 if(family==='recovery'){
  if(!m?.anchored||!Number.isFinite(m.end))return {gene,change};
  // A terminal recovery may start at the real exit, before an inherited
  // episode consumes the last available knots. Keep the core arc intact.
  const earliest=Math.ceil(z.exit/ds)*ds,latest=Math.floor(Math.min(m.end,z.end-4*ds)/ds)*ds;
  if(latest<earliest)return {gene,change};
  const start=Math.floor(rnd(earliest,latest+ds)/ds)*ds,speed=speedAt(parent.result.frames,start);
  const finish=Math.floor(Math.min(z.end-ds,start+clamp(speed*rnd(1.2,2.8),4*ds,65))/ds)*ds,length=finish-start;
  if(length<3*ds)return {gene,change};
  const from=G.sample(parent.gene,start,track.length),to=G.sample(parent.gene,finish,track.length),a=lineShape(parent.gene,track,start),b=lineShape(parent.gene,track,finish);
  const frame=parent.result.frames.reduce((a,b)=>Math.abs(a.s-start)<Math.abs(b.s-start)?a:b),road=track.sample(frame.s);
  const actualD=-(frame.x-road.x)*Math.sin(road.heading)+(frame.y-road.y)*Math.cos(road.heading),delta=Math.atan2(Math.sin(Math.atan2(frame.vy,frame.vx)-road.heading),Math.cos(Math.atan2(frame.vy,frame.vx)-road.heading));
  const offset=clamp(actualD-a.d+.15*length*(Math.tan(clamp(delta,-.55,.55))-a.slope),-2.5,2.5)*rnd(.2,.8),pedal=rnd(-.08,.08);
  const residualA=from.steer-feedforward(vehicle,track,parent.gene,start,speed);
  const residualB=to.steer-feedforward(vehicle,track,parent.gene,finish,speedAt(parent.result.frames,finish));
  Object.assign(change,{start,end:finish,length,offset,pedal});
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds;if(s<=start||s>=finish)continue;
   const j=i*G.STRIDE,t=(s-start)/length,w=smoother(t),hump=64*t*t*t*(1-t)**3;
   gene[j+C.lineOffset]=joinLine(a,b,length,t)+offset*hump;
   // Both targets settle together, then reconnect smoothly to any planned
   // next-segment intent. This also preserves a subsequent drift transition.
   for(const channel of [C.targetSlip,C.driveSlip])gene[j+channel]=t<.75?from[G.DESCRIPTORS[channel].key]*(1-smoother(t/.75)):to[G.DESCRIPTORS[channel].key]*smoother((t-.75)/.25);
   for(const channel of [C.throttle,C.brake,C.counterLead]){const key=G.DESCRIPTORS[channel].key;gene[j+channel]=from[key]+(to[key]-from[key])*w;}
   gene[j+C.throttle]+=pedal*hump;
   gene[j+C.steer]=feedforward(vehicle,track,parent.gene,s,speedAt(parent.result.frames,s))+residualA+(residualB-residualA)*w;
  }
  return {gene:norm(gene),change};
 }
 if(family==='approach'){
  const limit=z.exit-8-ds,center=clamp(rng()<.6?rnd(z.start+2,z.exit-14):rnd(z.start-25,z.start),2,limit-2),width=Math.max(1,Math.min(rnd(6,20),limit-center));
  const brake=rnd(-.10,.22),pedal=rnd(-.20,.12);Object.assign(change,{center,width,brake,pedal});
  for(let i=0;i<G.KNOTS;i++){const j=i*G.STRIDE,w=pulse(i*ds,center,width);gene[j+C.brake]+=brake*w;gene[j+C.throttle]+=pedal*w;}
  return {gene:norm(gene),change};
 }
 if(family==='trajectory'){
  const start=clamp(end+rnd(-11,-4),z.exit+8,z.end-25),frame=parent.result.frames.reduce((a,b)=>Math.abs(a.s-start)<Math.abs(b.s-start)?a:b),road=track.sample(frame.s);
  const d=-(frame.x-road.x)*Math.sin(road.heading)+(frame.y-road.y)*Math.cos(road.heading),delta=Math.atan2(Math.sin(Math.atan2(frame.vy,frame.vx)-road.heading),Math.cos(Math.atan2(frame.vy,frame.vx)-road.heading));
  const available=z.end-start-ds,slope=Math.tan(clamp(delta,-.55,.55)),curvature=z.sign*rnd(.001,.012),length=Math.min(rnd(14,24),available-Math.max(6,1.5*ds)),recovery=Math.min(rnd(14,32),available-length),angle=rnd(15,30)*DEG,lead=rnd(.05,.28),steer=sign*rnd(-.05,.03),gear=pick([0,3,3,'keep']),offset=-z.sign*rnd(0,2.5),recoveryBrake=rng()<.5?0:rnd(.15,.5),recoveryPedal=rnd(.1,.5),riseStart=z.exit-rnd(18,45),riseEnd=riseStart+rnd(28,50);
  if(length<ds||recovery<ds)return {gene,change};
  Object.assign(change,{start,d,slope,curvature,length,recovery,angle,lead,steer,gear,offset,recoveryBrake,recoveryPedal,riseStart,riseEnd});
  const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  const phase=clamp((start-riseStart)/(riseEnd-riseStart),0,1),initialD=d+offset*smooth(phase),initialSlope=slope+offset*6*phase*(1-phase)/(riseEnd-riseStart);
  const offsetEnd=Math.min(z.end-2*ds,z.exit+100),offsetReturn=Math.min(z.exit+65,offsetEnd-2*ds);
  for(let i=0;i<128;i++){const s=i*ds,j=i*8,w=smooth((s-riseStart)/(riseEnd-riseStart))*(1-smooth((s-offsetReturn)/(offsetEnd-offsetReturn)));gene[j+C.lineOffset]+=offset*w;}
  const rejoinGene=G.clone(gene),hold=start+length,finish=hold+recovery,from=G.sample(parent.gene,hold,track.length),to=G.sample(parent.gene,finish,track.length);
  const holdLine={d:initialD+initialSlope*length+.5*curvature*length*length,slope:initialSlope+curvature*length,curvature},endLine=lineShape(rejoinGene,track,finish);
  const residualA=from.steer-feedforward(vehicle,track,parent.gene,hold,speedAt(parent.result.frames,hold))+steer,residualB=to.steer-feedforward(vehicle,track,parent.gene,finish,speedAt(parent.result.frames,finish));
  for(let i=0;i<128;i++){
   const s=i*ds,j=i*8,u=s-start,initialLine=gene[j+C.lineOffset];
   if(u< -12||u>=length+recovery)continue;
   const line=u<=length?initialD+initialSlope*u+.5*curvature*u*u:joinLine(holdLine,endLine,recovery,(u-length)/recovery),w=smooth((u+12)/12);
   gene[j+C.lineOffset]=initialLine+(line-initialLine)*w;
   if(u>=-7&&u<=length){const a=smooth((u+7)/10);gene[j+C.targetSlip]+=(sign*angle-gene[j+C.targetSlip])*a;gene[j+C.counterLead]+=(lead-gene[j+C.counterLead])*a;gene[j+C.steer]+=steer*a;gene[j+C.brake]*=1-a;gene[j+C.throttle]=Math.max(gene[j+C.throttle],.8*a);gene[j+C.driveSlip]=Math.max(gene[j+C.driveSlip],.7*a);if(u>=0&&gear!=='keep')gene[j+C.gearHold]=gear;}
   if(u>length){
    const t=(u-length)/recovery,r=smoother(t),hump=64*t*t*t*(1-t)**3,pedal=Math.max(from.throttle,.8);
    gene[j+C.targetSlip]=sign*angle+(to.targetSlip-sign*angle)*r;
    gene[j+C.driveSlip]=Math.max(from.driveSlip,.7)+(to.driveSlip-Math.max(from.driveSlip,.7))*r;
    gene[j+C.counterLead]=lead+(to.counterLead-lead)*r;
    gene[j+C.throttle]=pedal+(to.throttle-pedal)*r+(recoveryPedal-(pedal+to.throttle)/2)*hump;
    gene[j+C.brake]=Math.max(to.brake*r,recoveryBrake*hump);
    gene[j+C.steer]=feedforward(vehicle,track,parent.gene,s,speedAt(parent.result.frames,s))+residualA+(residualB-residualA)*r;
    if(gear!=='keep')gene[j+C.gearHold]=r<.5?gear:to.gearHold;
   }
  }
  return {gene:norm(gene),change};
 }
 for(let i=0;i<128;i++){
  const s=i*ds,j=i*8,w=pulse(s,center,width);
  if(['gear','gearPower'].includes(family)&&s>=change.shiftAt&&s<=z.end+20){
   const frame=parent.result.frames.reduce((a,b)=>Math.abs(a.s-s)<Math.abs(b.s-s)?a:b),u=Math.abs(frame.vx*Math.cos(frame.yaw)+frame.vy*Math.sin(frame.yaw)),omega=u/p.tireRadius*(1+gene[j+C.driveSlip]);
   const recommended=p.gearRatios.findIndex((ratio,k)=>omega*ratio*(p.finalDriveRatios?.[k]||p.finalDrive)*60/(2*Math.PI)<p.shiftRPM*.98)+1;
   gene[j+C.gearHold]=change.gear==='rpm'?(recommended||p.gearRatios.length):change.gear;
   if(family==='gearPower'){gene[j+C.driveSlip]=Math.max(gene[j+C.driveSlip],rnd(.45,1.1));gene[j+C.throttle]=Math.max(.8,gene[j+C.throttle]);gene[j+C.brake]=0;}
  }
  if(!w)continue;
  if(['steer','combined','spread'].includes(family))gene[j+C.steer]+=change.steer*w;
  if(['angle','combined','spread'].includes(family))gene[j+C.targetSlip]+=sign*change.angle*w;
  if(['line','combined'].includes(family))gene[j+C.lineOffset]+=change.line*w;
  if(['lead','combined'].includes(family))gene[j+C.counterLead]+=change.lead*w;
  if(family==='power'){gene[j+C.driveSlip]+=change.slip*w;gene[j+C.throttle]+=change.pedal*w;gene[j+C.brake]*=1-w;}
 }
 return {gene:norm(gene),change};
}
 const proposal=mutate(parent),strength=clamp(options.scale??1,.03,1.5),mixed=G.clone(parent.gene);
 for(let i=0;i<G.LENGTH;i++){
  if(i%G.STRIDE===C.gearHold){if(proposal.gene[i]!==parent.gene[i]&&(strength>=1||rng()<strength))mixed[i]=proposal.gene[i];}
  else mixed[i]+=(proposal.gene[i]-parent.gene[i])*strength;
 }
 // Blend targets before recoupling steering to the normalized line. A blend
 // of already-coupled steering would use the wrong nonlinear path curvature.
 const gene=norm(FF.couple(vehicle,track,parent.gene,norm(mixed),parent.result.frames));
 return ensureChanged(vehicle,parent.gene,{...proposal,gene},rng,strength);
}
function ensureChanged(vehicle,parent,proposal,rng,strength=1){
 if(proposal.gene.some((v,i)=>v!==parent[i]))return proposal;
 const gene=G.clone(proposal.gene),p=vehicle.physics||vehicle,center=2+Math.floor(rng()*(G.KNOTS-4)),current=gene[center*G.STRIDE+C.steer],direction=current>0?-1:current<0?1:rng()<.5?-1:1,amount=direction*Math.min(.002,p.maxSteer*.01)*strength;
 for(let offset=-1;offset<=1;offset++)gene[(center+offset)*G.STRIDE+C.steer]=clamp(gene[(center+offset)*G.STRIDE+C.steer]+amount*(offset===0?1:.5),-p.maxSteer,p.maxSteer);
 return {...proposal,gene,change:{...(proposal.change||{}),family:'fine-fallback'}};
}
function repair(vehicle,track,parent,rng,options={}){
 if(parent.accepted!==true||parent.result?.valid!==true||parent.result?.status!=='finished')throw new TypeError('Repairs require a completed valid parent, never a failed genome.');
 const p=vehicle.physics||vehicle,diagnosis=options.diagnosis,ds=track.length/(G.KNOTS-1),strength=clamp(options.scale??1,.03,1.5);
 if(!diagnosis?.window||!Number.isFinite(diagnosis.origin?.s))throw new TypeError('A recorded precursor window is required.');
 const bounds=options.lineBounds||G.corridorBounds(vehicle,track),norm=g=>G.normalize(g,{maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds});
 const start=clamp(diagnosis.window.startS,0,track.length-2*ds),end=clamp(diagnosis.window.endS,start+2*ds,track.length);
 const prior=Number.isInteger(diagnosis.precedingZoneIndex)?options.zones?.[diagnosis.precedingZoneIndex]:null;
 const searchPrior=!!prior&&rng()<.6;
 const priorEnd=Math.max(start+ds,Math.min(diagnosis.origin.s-ds,prior?.exit+12||diagnosis.origin.s));
 const center=clamp(searchPrior?start+ds+rng()*(priorEnd-start-ds):diagnosis.origin.s+(rng()-.5)*12,start+ds,end-ds),width=Math.max(2*ds,Math.min(30,Math.max(center-start,end-center)));
 const family=options.family||'timing',direction=rng()<.5?-1:1,magnitude=(.3+.7*rng())*strength,amount=direction*magnitude;
 const gene=G.clone(parent.gene),change={family,source:'failure-window',basisCandidateId:diagnosis.candidateId,originS:diagnosis.origin.s,precedingZoneIndex:diagnosis.precedingZoneIndex,searchPrior,start,end,center,width,direction,scale:strength};
 for(let i=0;i<G.KNOTS;i++){
  const s=i*ds;if(s<=start||s>=end)continue;
  const w=pulse(s,center,width)*smooth((s-start)/ds)*smooth((end-s)/ds),j=i*G.STRIDE;if(!w)continue;
  // Test both directions. An observed failure is a hypothesis about which
  // intents to explore, not a command to suppress every sideways movement.
  if(family==='timing'){
   const shifted=G.sample(parent.gene,clamp(s+amount*10,0,track.length),track.length);
   for(const key of ['targetSlip','counterLead','driveSlip','throttle'])gene[j+C[key]]+=(shifted[key]-gene[j+C[key]])*w;
  }
  if(['lead','combined'].includes(family))gene[j+C.counterLead]+=.09*amount*w;
  if(['steer','combined'].includes(family))gene[j+C.steer]+=.018*amount*w;
  if(['angle','combined'].includes(family))gene[j+C.targetSlip]+=3*DEG*amount*w;
  if(['line','combined'].includes(family))gene[j+C.lineOffset]+=.65*amount*w;
  if(family==='power'){gene[j+C.driveSlip]+=.1*amount*w;gene[j+C.throttle]+=.055*amount*w;}
 }
 // A timing hypothesis can be unobservable on a flat grip target. Use a
 // bounded local steering trial in that same precursor window, not elsewhere.
 if(!gene.some((v,i)=>v!==parent.gene[i])){
  const i=clamp(Math.round(center/ds),1,G.KNOTS-2),j=i*G.STRIDE+C.steer;
  gene[j]=clamp(gene[j]+(gene[j]>=p.maxSteer?-1:gene[j]<=-p.maxSteer?1:direction)*.002*strength,-p.maxSteer,p.maxSteer);
  change.family='steer';change.fallbackFrom=family;
 }
 const normalized=norm(couple(vehicle,track,parent.gene,norm(gene),parent.record));
 if(!normalized.some((v,i)=>v!==parent.gene[i])){
  const i=clamp(Math.round(center/ds),1,G.KNOTS-2),j=i*G.STRIDE+C.steer;
  normalized[j]=clamp(normalized[j]+(normalized[j]>=0?-1:1)*.002*strength,-p.maxSteer,p.maxSteer);
  change.family='steer';change.fallbackFrom=family;
 }
 return {gene:normalized,change};
}
function niche(vehicle,track,result,record,zone){
 return F.measure({...result,frames:record},track,vehicle,{zoneId:zone.id,referenceSpeeds:result.drift?.referenceSpeeds,diagnostics:false});
}
function signature(){return FAMILIES.join(',')+'\n'+[entry,adaptive,repair,couple,feedforward,point,speedAt,lineShape,joinLine,smoother,niche,zones,links,approachStart,supports,ensureChanged,trailingStraightStart].map(String).join('\n');}
const api=Object.freeze({VERSION:5,FAMILIES,zones,links,approachStart,supports,entry,adaptive,repair,niche,couple,feedforward,speedAt,trailingStraightStart,signature});
root.DriftEvolutionStrategies=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
