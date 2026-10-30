/* Physical intent mutations. These functions only change genome values and
 * inspect completed replays. Vehicle poses and forces remain physics outputs. */
(function(root){
'use strict';
const G=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null);
const Shape=root.DriftMutationShape||(typeof require==='function'?require('./mutation-shape.js'):null);
const F=root.DriftFitness||(typeof require==='function'?require('./fitness.js'):null);
const SpeedPlanner=root.DriftEntrySpeedPlanner||(typeof require==='function'?require('./entry-speed-planner.js'):null);
if(!G||!F)throw new Error('Load Genome and Fitness before EvolutionStrategies.');
const C=G.CHANNELS,DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const smoother=t=>{t=clamp(t,0,1);return t*t*t*(10+t*(-15+6*t));};
const pulse=(s,c,w)=>Math.abs(s-c)>=w?0:.5+.5*Math.cos(Math.PI*(s-c)/w);
const FAMILIES=Object.freeze(['link','link','link','bridge','bridge','bridge','apex-arc','apex-arc','apex-arc','sustained-angle','sustained-angle','sustained-angle','speed-hold','speed-hold','recovery','trajectory','steer','angle','combined','line','lead','power','gear','gearPower','approach','entry-speed','entry-speed','brake-release']);
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
// Ordinary angle/line/power proposals may retain a parent's two-pedal intent.
// Explicit braking/speed repairs deliberately do not use this choice.
function preservePedalOverlap(parent,gene,rng,probability=.45){
 const indices=[];
 for(let k=0;k<G.KNOTS;k++){const j=k*G.STRIDE;if(parent[j+C.throttle]>.12&&parent[j+C.brake]>.015&&gene[j+C.throttle]>.12&&gene[j+C.brake]<parent[j+C.brake])indices.push(j+C.brake);}
 if(!indices.length||rng()>=probability)return 0;
 for(const i of indices)gene[i]=parent[i];
 return indices.length;
}
function pedalEnvelope(s,profile){return smoother((s-profile.start)/profile.rampIn)*smoother((profile.end-s)/profile.rampOut);}
function pedalOverlap(vehicle,track,parent,rng,options={}){
 if(parent.accepted!==true||parent.result?.valid!==true||parent.result.status!=='finished')throw new TypeError('Pedal overlap mutations require a completed valid parent.');
 const record=parent.record||parent.result.frames;
 if(!record?.length)return null;
 const ds=track.length/(G.KNOTS-1),lower=Math.max(2.5,record[0].s),upper=Math.min(track.length,record.at(-1).s);
 if(upper-lower<8*ds)return null;
 const rnd=(a,b)=>a+(b-a)*rng(),pick=a=>a[Math.min(a.length-1,Math.floor(rng()*a.length))],gene=G.clone(parent.gene),all=options.zones||zones(track);
 // Anchor all four phases in the completed replay. There is no synthetic
 // speed/pose boost and no pedal-overlap fitness reward.
 const windows=[];
 for(const z of all){
  if(options.zone&&options.zone.id!==z.id)continue;
  windows.push({phase:'entry',zoneId:z.id,start:approachStart(track,z,all),end:z.cornerStart??z.start},
   {phase:'corner',zoneId:z.id,start:z.cornerStart??z.start,end:z.exit},
   {phase:'exit',zoneId:z.id,start:z.exit,end:z.end});
 }
 for(const l of options.links||links(track)){
  if(options.zone&&l.fromZoneId!==options.zone.id&&l.toZoneId!==options.zone.id)continue;
  windows.push({phase:'link',linkId:l.id,start:l.straightStart,end:l.straightEnd});
 }
 const eligible=windows.map(w=>({...w,frames:record.filter(f=>f.s>=Math.max(lower,w.start)&&f.s<=Math.min(upper,w.end)&&f.speed>=6)})).filter(w=>w.frames.length&&(!options.phase||w.phase===options.phase));
 if(!eligible.length)return null;
 const window=pick(eligible),frames=window.frames.filter(f=>G.sample(parent.gene,f.s,track.length).brake<.24);
 if(!frames.length)return null;
 const anchor=Number.isFinite(options.center)?frames.reduce((a,b)=>Math.abs(a.s-options.center)<Math.abs(b.s-options.center)?a:b):pick(frames);
 // Existing, light simultaneous inputs are reversible inherited episodes.
 // Heavy braking is excluded from removal and from accelerator insertion.
 const episodes=[];
 for(let k=0;k<G.KNOTS;){
  const active=i=>{const s=i*ds,j=i*G.STRIDE;return s>=lower&&s<=upper&&parent.gene[j+C.throttle]>.12&&parent.gene[j+C.brake]>.015&&parent.gene[j+C.brake]<.24&&speedAt(record,s)>=6;};
  if(!active(k)){k++;continue;}
  const first=k;while(k+1<G.KNOTS&&active(k+1))k++;
  const last=k++;if(last-first>=1)episodes.push({first,last,start:Math.max(lower,(first-2)*ds),end:Math.min(upper,(last+2)*ds)});
 }
 // A long inherited overlap can span several corners. Mutate only the
 // selected phase's slice, rather than attributing a remote episode center
 // to the selected corner's learning policy.
 const nearby=episodes.map(e=>{
  const first=Math.max(e.first,Math.ceil(window.start/ds)),last=Math.min(e.last,Math.floor(window.end/ds));
  return {first,last,start:Math.max(e.start,window.start),end:Math.min(e.end,window.end)};
 }).filter(e=>e.last-e.first>=1);
 const inherited=nearby.length?nearby.reduce((a,b)=>Math.abs((a.start+a.end)/2-anchor.s)<Math.abs((b.start+b.end)/2-anchor.s)?a:b):null;
 const modes=['strengthen','weaken','shift','duration','remove'];
 let mode=options.mode||(inherited&&rng()<.7?pick(modes):'create');
 if(!['create',...modes].includes(mode))throw new RangeError('Unknown pedal overlap mutation mode.');
 if(!inherited&&mode!=='create')mode='create';
 const existing=mode!=='create'?inherited:null,strength=clamp(options.scale??1,.03,1.5);
 const sourceS=existing?(existing.first+existing.last)*ds/2:anchor.s;
 let center=sourceS;
 const speed=Math.max(6,speedAt(record,center)),oldWidth=existing?existing.end-existing.start:0;
 if(mode==='shift')center+=rnd(-1,1)*Math.max(3*ds,speed*.9);
 let width=existing?oldWidth:rnd(1.1,2.6)*speed;
 if(mode==='duration')width*=rnd(.6,1.6);
 width=clamp(width,6*ds,Math.min(upper-lower,Math.max(9*ds,speed*3.5)));
 center=clamp(center,lower+width/2,upper-width/2);
 const old=existing?{start:existing.start,end:existing.end,rampIn:Math.min(2*ds,(existing.end-existing.start)/3),rampOut:Math.min(2*ds,(existing.end-existing.start)/3)}:null;
 const peak=c=>existing?Math.max(...Array.from({length:existing.last-existing.first+1},(_,i)=>parent.gene[(existing.first+i)*G.STRIDE+c])):0;
 const throttlePeak=peak(C.throttle),brakePeak=peak(C.brake),direction=mode==='weaken'?-1:1;
 const throttleStrength=mode==='create'?rnd(.3,.9):clamp(throttlePeak+(mode==='strengthen'||mode==='weaken'?direction*rnd(.03,.18):rnd(-.04,.04)),.12,1);
 const brakeStrength=mode==='create'?rnd(.02,.13):clamp(brakePeak+(mode==='strengthen'||mode==='weaken'?direction*rnd(.015,.065):rnd(-.015,.015)),0,.23);
 // Separate start offsets, widths and both ramps: a common accel-minus-brake
 // scalar cannot represent this shape. At least six knots carry each pulse.
 const profile=(channel,target)=>{
  const span=clamp(width*rnd(.8,1.2),6*ds,upper-lower),c=clamp(center+rnd(-.2,.2)*width,lower+span/2,upper-span/2);
  return {channel,start:c-span/2,end:c+span/2,rampIn:Math.min(span*.45,Math.max(1.5*ds,span*rnd(.2,.4))),rampOut:Math.min(span*.45,Math.max(1.5*ds,span*rnd(.2,.4))),strength:target,durationSec:span/speed};
 };
 const throttle=profile('throttle',throttleStrength),brake=profile('brake',brakeStrength);
 if(mode==='remove'||mode==='shift'||mode==='duration'){
  for(let k=0;k<G.KNOTS;k++){
   const j=k*G.STRIDE,s=k*ds;
   if(k>=existing.first&&k<=existing.last)gene[j+C.brake]*=1-Math.min(1,strength)*pedalEnvelope(s,old);
  }
 }
 if(mode!=='remove')for(let k=0;k<G.KNOTS;k++){
  const j=k*G.STRIDE,s=k*ds,baseBrake=parent.gene[j+C.brake],protection=1-smoother((baseBrake-.18)/.06);
  for(const q of [throttle,brake]){
   const c=C[q.channel],w=pedalEnvelope(s,q)*Math.min(1,strength)*protection;
   if(!w)continue;
   // Strength/weakness never inadvertently reverse direction at a low edge
   // of an inherited pulse. Shifts/length changes may rebuild its shape.
   const target=mode==='strengthen'?Math.max(gene[j+c],q.strength):mode==='weaken'?Math.min(gene[j+c],q.strength):q.strength;
   gene[j+c]=clamp(gene[j+c]+(target-gene[j+c])*w,0,1);
  }
 }
 // Only pedal channels are touched; inherited line, gearing and clutch
 // events remain byte-for-byte intact. Clamp rather than re-normalize them.
 if(!gene.some((v,i)=>v!==parent.gene[i]))return null;
 const changed=Array.from({length:G.KNOTS},(_,k)=>k).filter(k=>gene[k*G.STRIDE+C.throttle]!==parent.gene[k*G.STRIDE+C.throttle]||gene[k*G.STRIDE+C.brake]!==parent.gene[k*G.STRIDE+C.brake]);
 return {gene,change:{family:'pedal-overlap',mode,phase:window.phase,zoneId:window.zoneId,linkId:window.linkId,basisCandidateId:parent.id,
  anchorS:anchor.s,sourceS,referenceSpeed:speed,start:changed[0]*ds,end:changed.at(-1)*ds,strength,
  inherited:old,throttle:mode==='remove'?null:throttle,brake:mode==='remove'?{...old,strength:0,durationSec:(old.end-old.start)/speed}:brake}};
}
function brakingSlowdown(parent,reference,track,zone,regions){
 if(parent.accepted!==true||parent.result?.valid!==true||parent.result?.status!=='finished'||!reference?.length)return null;
 const record=parent.record||parent.result.frames;if(!record?.length)return null;
 const lower=approachStart(track,zone,regions),ds=track.length/(G.KNOTS-1);
 let trough=null,ratio=.7;
 for(const frame of record){
  if(frame.s<(zone.cornerStart??zone.start)||frame.s>zone.end)continue;
  const expected=speedAt(reference,frame.s),retention=frame.speed/Math.max(1,expected);
  if(expected>=5&&expected-frame.speed>=2&&retention<ratio){trough=frame;ratio=retention;}
 }
 if(!trough)return null;
 // Locate the last observed braking episode before the speed trough. The
 // deficit is evidence for a pedal mutation, not proof that braking alone
 // caused it. Earlier drift/line genes remain available to other families.
 let first=null,last=null;
 for(let i=record.length-1;i>=0;i--){
  const frame=record[i];if(frame.s>trough.s)continue;if(frame.s<lower)break;
  if(last&&first.s-frame.s>2*ds)break;
  if((frame.brake||0)>.03){first=frame;if(!last)last=frame;}
 }
 if(!first)return null;
 return {candidateId:parent.id,origin:{s:first.s},window:{startS:Math.max(lower,first.s-ds),endS:trough.s},
  slowdown:{s:trough.s,speed:trough.speed,referenceSpeed:speedAt(reference,trough.s),retention:ratio}};
}
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
 return bounded({arc:corners.indexOf(arc),onset,ramp:rnd(5,14),delay:rnd(0,8),entryBrake:rnd(0,.12),prepPedal:rnd(.4,1),prepRelease:rnd(.25,.9),prepLead:rnd(8,Math.max(8,onset-2.5)),feint:rnd(.3,2.2),angle:rnd(12,32),exitAngle:rnd(14,35),pedal:rnd(.5,1),slip:rng()<.15?0:rnd(.2,1.1),lead:rnd(.05,.5),gear:pick(last?[0,2,3]:[0,3,4]),line:rnd(0,last?7:3.5),apexLine:rnd(.2,2.2),bow:rnd(.5,last?4:2.5),length,recovery:rnd(14,30),steer:rnd(-.04,.04),exitSteer:rnd(-.035,.035),compensation:1,tailPedal:rnd(.25,.6),entrySpeedRatio:rnd(.9,1.25),brakeLead:rnd(-5,20),brakeStrength:rnd(.8,1.3),brakeRelease:rnd(-10,8)});
}
const scales={onset:22,prepPedal:.12,prepRelease:.15,ramp:3,delay:3,entryBrake:.04,prepLead:18,feint:.5,angle:5,exitAngle:5,pedal:.1,slip:.2,lead:.08,line:1,apexLine:.75,bow:1,length:7,recovery:5,steer:.015,exitSteer:.02,compensation:.2,tailPedal:.1,entrySpeedRatio:.12,brakeLead:10,brakeStrength:.18,brakeRelease:8};
function bounded(q){
 Object.assign(q,SpeedPlanner.parameters(q));
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
  if(acceleration>0){
   // A preparation accelerator must not silently replace the offline braking
   // phase. Its eventual replacement is the independent evolved brake plan.
   if(initial[j+C.brake]>.02&&speedAt(prepared.record,s+2)<speedAt(prepared.record,s-2))gene[j+C.throttle]=Math.min(gene[j+C.throttle],initial[j+C.throttle]);
   else{gene[j+C.throttle]+=(q.prepPedal-gene[j+C.throttle])*acceleration;gene[j+C.brake]*=1-q.prepRelease*acceleration;}
  }
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
 const preservedPedalOverlap=preservePedalOverlap(initial,gene,rng);
 const normalized=G.normalize(gene,{maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds});
 const entrySpeed=SpeedPlanner.plan(vehicle,track,normalized,prepared.record,z,q,{lower:preparationStart,arrivalRecord:prepared.record,referenceGene:initial});
 const n=SpeedPlanner.apply(normalized,entrySpeed),coupled=FF.couple(vehicle,track,initial,n,baseline.frames);
 for(let i=0;i<G.KNOTS;i++)n[i*G.STRIDE+C.steer]+=(coupled[i*G.STRIDE+C.steer]-n[i*G.STRIDE+C.steer])*q.compensation;
 return {gene:G.normalize(n,{maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds}),entrySpeed,preservedPedalOverlap};
}

 let params;if(previousParams&&previousParams.arc===arcIndex)params=mutate(previousParams);else do{params=random();}while(params.arc!==arcIndex);
 const generated=generate(params);return ensureChanged(vehicle,prepared.gene,{...generated,params:Object.freeze({...params}),change:{family:'entry',entrySpeed:generated.entrySpeed,preservedPedalOverlap:generated.preservedPedalOverlap}},rng);
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
 if(family==='brake-release'){
  const diagnosis=brakingSlowdown(parent,options.referenceRecord,track,z,all);
  if(!diagnosis)return {gene,change};
  const proposal=repair(vehicle,track,{...parent,record:parent.record||parent.result.frames},rng,
   {...options,family:'brake-release',diagnosis,scale:1});
  return {...proposal,change:{...proposal.change,source:'valid-slowdown',slowdown:diagnosis.slowdown}};
 }
 if(family==='entry-speed'){
  const params={entrySpeedRatio:rnd(.85,1.2),brakeLead:rnd(-5,30),brakeStrength:rnd(.8,1.3),brakeRelease:rnd(-15,8)};
  const entrySpeed=SpeedPlanner.plan(vehicle,track,gene,options.referenceRecord||parent.result.frames,z,params,{lower:approachStart(track,z,all),arrivalRecord:parent.result.frames,referenceGene:options.referenceGene});
  Object.assign(change,{start:entrySpeed.start,end:entrySpeed.end+entrySpeed.rampOut,entrySpeed});
  return {gene:norm(SpeedPlanner.apply(gene,entrySpeed)),change};
 }
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
  for(let i=0;i<G.KNOTS;i++){const s=i*ds,j=i*G.STRIDE,w=smooth((s-riseStart)/(riseEnd-riseStart))*(1-smooth((s-offsetReturn)/(offsetEnd-offsetReturn)));gene[j+C.lineOffset]+=offset*w;}
  const rejoinGene=G.clone(gene),hold=start+length,finish=hold+recovery,from=G.sample(parent.gene,hold,track.length),to=G.sample(parent.gene,finish,track.length);
  const holdLine={d:initialD+initialSlope*length+.5*curvature*length*length,slope:initialSlope+curvature*length,curvature},endLine=lineShape(rejoinGene,track,finish);
  const residualA=from.steer-feedforward(vehicle,track,parent.gene,hold,speedAt(parent.result.frames,hold))+steer,residualB=to.steer-feedforward(vehicle,track,parent.gene,finish,speedAt(parent.result.frames,finish));
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds,j=i*G.STRIDE,u=s-start,initialLine=gene[j+C.lineOffset];
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
 const powerSlipTarget=family==='gearPower'?rnd(.45,1.1):null;
 if(powerSlipTarget!==null)change.powerSlipTarget=powerSlipTarget;
 for(let i=0;i<G.KNOTS;i++){
  const s=i*ds,j=i*G.STRIDE,w=pulse(s,center,width);
  if(['gear','gearPower'].includes(family)&&s>=change.shiftAt&&s<=z.end+20){
   const frame=parent.result.frames.reduce((a,b)=>Math.abs(a.s-s)<Math.abs(b.s-s)?a:b),u=Math.abs(frame.vx*Math.cos(frame.yaw)+frame.vy*Math.sin(frame.yaw)),omega=u/p.tireRadius*(1+gene[j+C.driveSlip]);
   const recommended=p.gearRatios.findIndex((ratio,k)=>omega*ratio*(p.finalDriveRatios?.[k]||p.finalDrive)*60/(2*Math.PI)<p.shiftRPM*.98)+1;
   gene[j+C.gearHold]=change.gear==='rpm'?(recommended||p.gearRatios.length):change.gear;
   if(family==='gearPower'){
    const powerWeight=smoother((s-change.shiftAt)/(2*ds))*smoother((Math.min(track.length,z.end+20)-s)/(2*ds));
    gene[j+C.driveSlip]+=(Math.max(gene[j+C.driveSlip],powerSlipTarget)-gene[j+C.driveSlip])*powerWeight;
    gene[j+C.throttle]+=(Math.max(.8,gene[j+C.throttle])-gene[j+C.throttle])*powerWeight;
    gene[j+C.brake]*=1-powerWeight;
   }
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
 const proposal=mutate(parent),strength=clamp(options.scale??1,.03,1.5),mixed=G.clone(parent.gene),gearChoices=new Map();
 for(let start=0;start<G.KNOTS;){
  const gear=proposal.gene[start*G.STRIDE+C.gearHold];let end=start+1;
  while(end<G.KNOTS&&proposal.gene[end*G.STRIDE+C.gearHold]===gear)end++;
  let changed=false;for(let i=start;i<end;i++)if(parent.gene[i*G.STRIDE+C.gearHold]!==gear)changed=true;
  const adopt=changed&&(strength>=1||rng()<strength);for(let i=start;i<end;i++)gearChoices.set(i,adopt);
  start=end;
 }
 for(let i=0;i<G.LENGTH;i++){
  if(i%G.STRIDE===C.gearHold){if(gearChoices.get(Math.floor(i/G.STRIDE)))mixed[i]=proposal.gene[i];}
  else mixed[i]+=(proposal.gene[i]-parent.gene[i])*strength;
 }
 // Blend targets before recoupling steering to the normalized line. A blend
 // of already-coupled steering would use the wrong nonlinear path curvature.
 if(['link','bridge','apex-arc','sustained-angle','trajectory','power','gearPower'].includes(proposal.change.family))proposal.change.preservedPedalOverlap=preservePedalOverlap(parent.gene,mixed,rng);
 let gene=norm(FF.couple(vehicle,track,parent.gene,norm(mixed),parent.result.frames));
 // Some curve/link proposals co-evolve a local approach-speed plan. The
 // unchanged driver still executes only the resulting ordinary pedal genes.
 if(['link','bridge','apex-arc','trajectory'].includes(proposal.change.family)&&rng()<.35){
  const all=options.zones||zones(track),z=all.find(z=>z.id===proposal.change.toZoneId)||options.zone||all.find(z=>z.id===parent.metric.bestArc?.zoneId);
  if(z){
   const params={entrySpeedRatio:rnd(.9,1.25),brakeLead:rnd(-5,20),brakeStrength:rnd(.8,1.2),brakeRelease:rnd(-10,8)};
   const entrySpeed=SpeedPlanner.plan(vehicle,track,gene,options.referenceRecord||parent.result.frames,z,params,{lower:approachStart(track,z,all),arrivalRecord:parent.result.frames,referenceGene:options.referenceGene});
   const prepared=SpeedPlanner.apply(gene,entrySpeed);
   for(let i=0;i<G.LENGTH;i++)gene[i]+=(prepared[i]-gene[i])*Math.min(1,strength);
   gene=norm(gene);proposal.change.entrySpeed=entrySpeed;
  }
 }
 return proposal.change.family==='entry-speed'?ensurePedalChanged(parent.gene,{...proposal,gene},track,strength):ensureChanged(vehicle,parent.gene,{...proposal,gene},rng,strength);
}
function ensurePedalChanged(parent,proposal,track,strength=1){
 if(proposal.gene.some((value,i)=>value!==parent[i]))return proposal;
 const plan=proposal.change.entrySpeed,ds=track.length/(G.KNOTS-1),lower=clamp(Math.ceil(Math.max(2.5,plan.start)/ds),0,G.KNOTS-1),upper=clamp(Math.floor((plan.end+plan.rampOut)/ds),lower,G.KNOTS-1);
 const center=(lower+upper)/2,gene=G.clone(proposal.gene),span=Shape.window(center,3,{lower,upper});
 const amount=(gene[Math.round(center)*G.STRIDE+C.brake]>=.5?-1:1)*.002*strength;
 let changed=Shape.add(gene,C.brake,{...span,amount});
 if(!changed.changed)changed=Shape.add(gene,C.brake,{...span,amount:-amount});
 // A very short plan still needs multiple editable knots. Expand only the
 // mutation window, with zero endpoints, and never before spawn preparation.
 if(!changed.changed){
  const expanded=Shape.window(center,3,{lower:Math.ceil(2.5/ds),upper:G.KNOTS-1});
  changed=Shape.add(gene,C.brake,{...expanded,amount});
  if(!changed.changed)changed=Shape.add(gene,C.brake,{...expanded,amount:-amount});
 }
 return {...proposal,gene,change:{...proposal.change,pedalFallback:true,mutationWindow:{start:changed.start*ds,end:changed.end*ds}}};
}
function ensureChanged(vehicle,parent,proposal,rng,strength=1){
 if(proposal.gene.some((v,i)=>v!==parent[i]))return proposal;
 const gene=G.clone(proposal.gene),p=vehicle.physics||vehicle,center=2+Math.floor(rng()*(G.KNOTS-4)),current=gene[center*G.STRIDE+C.steer],direction=current>0?-1:current<0?1:rng()<.5?-1:1,amount=direction*Math.min(.002,p.maxSteer*.01)*strength;
 const limits={maxSteerRad:p.maxSteer},span=Shape.window(center,3);
 let changed=Shape.add(gene,C.steer,{...span,amount},limits);
 if(!changed.changed)changed=Shape.add(gene,C.steer,{...span,amount:-amount},limits);
 if(!changed.changed){const lead=gene[center*G.STRIDE+C.counterLead],nudge=(lead>.425?-1:1)*.002*strength;changed=Shape.add(gene,C.counterLead,{...span,amount:nudge});}
 return {...proposal,gene,change:{...(proposal.change||{}),family:'fine-fallback',mutationKnots:{start:changed.start,end:changed.end}}};
}
function repairNudge(gene,center,start,end,ds,p,direction,strength){
 let window=Shape.window(center/ds,3,{lower:Math.max(Math.ceil(2.5/ds),Math.ceil(start/ds)),upper:Math.floor(end/ds)});
 if(window.end-window.start<3)window=Shape.window(center/ds,3,{lower:Math.ceil(2.5/ds),upper:G.KNOTS-1});
 const i=Math.round((window.start+window.end)/2),current=gene[i*G.STRIDE+C.steer];
 const amount=(current>=p.maxSteer?-1:current<=-p.maxSteer?1:direction)*.002*strength,limits={maxSteerRad:p.maxSteer};
 let changed=Shape.add(gene,C.steer,{...window,amount},limits),family='steer';
 if(!changed.changed)changed=Shape.add(gene,C.steer,{...window,amount:-amount},limits);
 if(!changed.changed){family='lead';const lead=gene[i*G.STRIDE+C.counterLead];changed=Shape.add(gene,C.counterLead,{...window,amount:(lead>.425?-1:1)*.002*strength});}
 return {family,mutationWindow:{start:window.start*ds,end:window.end*ds}};
}
function repair(vehicle,track,parent,rng,options={}){
 if(parent.accepted!==true||parent.result?.valid!==true||parent.result?.status!=='finished')throw new TypeError('Repairs require a completed valid parent, never a failed genome.');
 const p=vehicle.physics||vehicle,diagnosis=options.diagnosis,ds=track.length/(G.KNOTS-1),strength=clamp(options.scale??1,.03,1.5);
 if(!diagnosis?.window||!Number.isFinite(diagnosis.origin?.s))throw new TypeError('A recorded precursor window is required.');
 const bounds=options.lineBounds||G.corridorBounds(vehicle,track),norm=g=>G.normalize(g,{maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds});
 if(options.family==='brake-release'){
  // A stopped child supplies only the observed window. Change a completed
  // parent's pedal intent; never restart the child or override its physics.
  const start=clamp(diagnosis.window.startS,0,track.length-2*ds),end=clamp(diagnosis.window.endS+ds,start+2*ds,track.length);
  const amount=(.2+.6*rng())*Math.min(1,strength),gene=G.clone(parent.gene);
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds;if(s<=start||s>=end)continue;
   const w=smooth((s-start)/ds)*(1-smooth((s-(end-ds))/ds)),j=i*G.STRIDE;
   gene[j+C.brake]*=1-amount*w;
   gene[j+C.throttle]+=.08*amount*w*(1-gene[j+C.throttle]);
  }
  const normalized=norm(gene);
  if(!normalized.some((value,i)=>value!==parent.gene[i])){
   const fallback=repair(vehicle,track,parent,rng,{...options,family:'timing'});
   return {...fallback,change:{...fallback.change,fallbackFrom:'brake-release'}};
  }
  return {gene:normalized,change:{family:'brake-release',source:'failure-window',basisCandidateId:diagnosis.candidateId,originS:diagnosis.origin.s,start,end,amount,scale:strength}};
 }
 if(options.family==='entry-speed'){
  const all=options.zones||zones(track),z=options.zone||all[diagnosis.precedingZoneIndex??diagnosis.origin.zoneIndex];
  if(!z)throw new TypeError('An observed corner is required for entry-speed repair.');
  const rnd=(a,b)=>a+(b-a)*rng(),params={entrySpeedRatio:rnd(.85,1.2),brakeLead:rnd(-5,30),brakeStrength:rnd(.8,1.3),brakeRelease:rnd(-15,8)};
  const entrySpeed=SpeedPlanner.plan(vehicle,track,parent.gene,options.referenceRecord||parent.record,z,params,{lower:approachStart(track,z,all),arrivalRecord:parent.record,referenceGene:options.referenceGene});
  const planned=SpeedPlanner.apply(parent.gene,entrySpeed),gene=G.clone(parent.gene);
  for(let i=0;i<G.LENGTH;i++)gene[i]+=(planned[i]-gene[i])*Math.min(1,strength);
  const change={family:'entry-speed',source:'failure-window',basisCandidateId:diagnosis.candidateId,originS:diagnosis.origin.s,start:entrySpeed.start,end:entrySpeed.end+entrySpeed.rampOut,scale:strength,entrySpeed};
  return ensurePedalChanged(parent.gene,{gene:norm(gene),change},track,strength);
 }
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
   for(const key of ['targetSlip','counterLead','driveSlip','throttle','brake'])gene[j+C[key]]+=(shifted[key]-gene[j+C[key]])*w;
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
  Object.assign(change,repairNudge(gene,center,start,end,ds,p,direction,strength),{fallbackFrom:family});
 }
 const normalized=norm(couple(vehicle,track,parent.gene,norm(gene),parent.record));
 if(!normalized.some((v,i)=>v!==parent.gene[i])){
  Object.assign(change,repairNudge(normalized,center,start,end,ds,p,-direction,strength),{fallbackFrom:family});
 }
 return {gene:normalized,change};
}
function connect(vehicle,track,parent,rng,options={}){
 if(parent.accepted!==true||parent.result?.valid!==true||parent.result?.status!=='finished')throw new TypeError('Connection mutations require a completed valid parent.');
 const target=options.connectionTarget,record=parent.record||parent.result.frames;
 if(!target||!record?.length||target.complete)throw new TypeError('An incomplete measured connection is required.');
 const p=vehicle.physics||vehicle,ds=track.length/(G.KNOTS-1),all=options.zones||zones(track);
 const zone=all.find(z=>z.id===(target.zoneId||target.fromZoneId)),to=all.find(z=>z.id===target.toZoneId)||zone;
 if(!zone)throw new TypeError('Connection region is unavailable.');
 const bounds=options.lineBounds||G.corridorBounds(vehicle,track),limits={maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds};
 const nearest=s=>record.reduce((a,b)=>Math.abs(a.s-s)<=Math.abs(b.s-s)?a:b),rnd=(a,b)=>a+(b-a)*rng();
 const before=target.preferredBoundary?target.preferredBoundary==='entry':target.reason==='entry'||target.reason==='gap'&&(target.missingBefore||0)>(target.missingAfter||0);
 const boundary=Number.isFinite(target.breakS)?target.breakS:before?target.start:target.end;
 const startRun=Number.isFinite(target.actualStart)?target.actualStart:target.start,endRun=Number.isFinite(target.actualEnd)?target.actualEnd:target.end;
 const sourceS=clamp(before?startRun+Math.min(8,(endRun-startRun)*.3):endRun-Math.min(8,(endRun-startRun)*.3),0,track.length);
 const source=G.sample(parent.gene,sourceS,track.length),frame=nearest(boundary),v=Math.max(8,frame.speed),strength=clamp(options.scale??1,.15,1);
 // A large target/actual path mismatch can shut the unchanged driver's
 // throttle. Alter that requested line instead of asking for yet more power.
 const pathError=Math.abs(frame.pathError||0),powerCut=(frame.driverThrottleCorrection||0)<-.2;
 const mode=options.connectionMode||(target.reason==='speed'?'speed':pathError>1.2&&powerCut&&rng()<.75?'line':target.reason==='turn'?'line':'angle');
 const lower=approachStart(track,zone,all),upper=Math.min(track.length-ds,Math.max(to.end,target.end+3*ds));
 const length=clamp(v*rnd(.9,1.8),4*ds,45),start=Math.floor(Math.max(lower,boundary-(before?length:Math.max(2*ds,v*.65)))/ds)*ds;
 const end=Math.ceil(Math.min(upper,boundary+(before?Math.max(3*ds,v*.65):length))/ds)*ds;
 const span=Math.max(ds,end-start),fade=Math.min(span*.3,2*ds),gene=G.clone(parent.gene),sign=-zone.sign;
 const change={family:'connection-'+mode,retryFamily:'connection-'+mode,connectionId:target.id,condition:target.reason,kind:target.kind,start,end,sourceS,breakS:boundary,pathError,powerCut,before};
 const weight=s=>smoother((s-start)/fade)*smoother((end-s)/fade);
 if(mode==='line'){
  // Interpolated displacement anchors follow the parent's measured on-road
  // path locally, with zero endpoints. The entire new run still needs proof.
  const values=Array.from({length:7},(_,i)=>{
   if(i===0||i===6)return 0;
   const s=start+span*i/6,f=nearest(s),road=track.sample(f.s),actual=(f.x-road.x)*-Math.sin(road.heading)+(f.y-road.y)*Math.cos(road.heading);
   return clamp(actual-G.sample(parent.gene,s,track.length).lineOffset,-3,3)*rnd(.35,.8);
  });
  change.lineAnchors=values;
  Shape.add(gene,C.lineOffset,{start:start/ds,end:end/ds,values,amount:strength},limits);
 }else if(mode==='angle'){
  const measured=Math.abs(nearest(sourceS).beta||0),desired=clamp(Math.max(Math.abs(source.targetSlip),measured+8*DEG)+rnd(-1,4)*DEG,14*DEG,42*DEG);
  change.targetSlip=sign*desired;const lead=clamp(source.counterLead+rnd(-.02,.04),.05,.8);
  const opposite=target.kind==='link'&&zone.sign!==to.sign,gap=to.cornerStart-zone.exit;
  const crossing=opposite?record.find((f,i)=>i>0&&f.s>=zone.exit&&f.s<=to.cornerStart&&f.beta*to.sign<0&&record[i-1].beta*zone.sign<0):null;
  const transitionWidth=opposite?Math.max(3*ds,v*1.875*2*desired/2.4):0;
  const transitionCenter=opposite?clamp(crossing?.s??(zone.exit+to.cornerStart)/2,zone.exit+Math.min(gap,transitionWidth)/2,to.cornerStart-Math.min(gap,transitionWidth)/2):0;
  if(opposite)Object.assign(change,{transitionCenter,transitionWidth});
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds,w=weight(s)*strength;if(!(s>start&&s<end&&w>0))continue;const j=i*G.STRIDE;
   // Never replace an opposite-direction transition with a one-knot flip.
   // If there is insufficient straight for a rate-limited bridge, retain
   // that part of the parent's transition and explore its endpoints only.
   if(opposite&&transitionWidth>gap&&s>=zone.exit&&s<=to.cornerStart)continue;
   const phase=opposite?smoother((s-transitionCenter+transitionWidth/2)/transitionWidth):0,localSign=sign*(1-phase)-to.sign*phase;
   gene[j+C.targetSlip]+=(localSign*desired-gene[j+C.targetSlip])*w;
   gene[j+C.counterLead]+=(lead-gene[j+C.counterLead])*w;
   if(!before||s>=zone.cornerStart){
    gene[j+C.driveSlip]+=(clamp(source.driveSlip,.08,.8)-gene[j+C.driveSlip])*w;
    gene[j+C.throttle]+=(Math.max(source.throttle,.45)-gene[j+C.throttle])*w;
    gene[j+C.brake]*=1-.9*w;
   }
  }
 }else if(mode==='speed'){
  const link=target.kind==='link'?links(track).find(l=>l.id===target.id):null;
  const speedStart=link?link.straightStart:target.start,speedEnd=link?link.straightEnd:target.end;
  const speedWindow=record.filter(f=>f.s>=speedStart&&f.s<=speedEnd&&Number.isFinite(f.speed));
  const observedMinimum=target.evidenceSource==='metric-minimum'&&Number.isFinite(target.evidence?.time)&&Number.isFinite(target.minimumSpeed)
   ?record.find(f=>Math.abs(f.time-target.evidence.time)<=1e-8&&Math.abs(f.s-target.evidence.s)<=1e-8&&Math.abs(f.speed-target.minimumSpeed)<=Math.max(1e-8,Math.abs(target.minimumSpeed)*1e-9)):null;
  // A fallback stays inside the metric's core (the straight for links), not
  // the whole apex-to-apex span or an unrelated slower later grip sample.
  const slow=observedMinimum||speedWindow.reduce((a,b)=>!a||b.speed<a.speed?b:a,null)||frame;
  // Correct the inherited braking/release episode before its speed trough,
  // not a torque impulse at the trough itself. Angles/line remain inherited.
  let brakeStart=slow.s,foundBrake=false;
  for(let i=record.length-1;i>=0;i--){
   const f=record[i];if(f.s>slow.s)continue;if(f.s<lower||foundBrake&&brakeStart-f.s>2*ds)break;
   if((f.brake||0)>.03){brakeStart=f.s;foundBrake=true;}
  }
  const a=Math.max(lower,brakeStart-2*ds),b=Math.min(upper,slow.s+3*ds),ramp=Math.min((b-a)*.3,2*ds);
  Object.assign(change,{start:a,end:b,slowS:slow.s,speedEvidenceSource:observedMinimum?'metric-minimum':'required-window-minimum'});const release=rnd(.35,.8);
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds,w=smoother((s-a)/ramp)*smoother((b-s)/ramp)*strength;if(!(s>a&&s<b&&w>0))continue;const j=i*G.STRIDE;
   gene[j+C.brake]*=1-release*w;gene[j+C.throttle]+=(Math.max(gene[j+C.throttle],.6)-gene[j+C.throttle])*w;
  }
 }
 if(mode==='angle')change.preservedPedalOverlap=preservePedalOverlap(parent.gene,gene,rng);
 const normalized=G.normalize(gene,limits),coupled=G.normalize(couple(vehicle,track,parent.gene,normalized,record),limits);
 if(!coupled.some((value,i)=>value!==parent.gene[i])){
  const window=Shape.window((change.start+change.end)/(2*ds),3,{lower:Math.ceil(change.start/ds),upper:Math.floor(change.end/ds)});
  const index=Math.round((window.start+window.end)/2),direction=parent.gene[index*G.STRIDE+C.counterLead]>.425?-1:1;
  Shape.add(coupled,C.counterLead,{...window,amount:direction*.005*strength},limits);change.family='connection-fine';
 }
 return {gene:coupled,change};
}
function niche(vehicle,track,result,record,zone){
 return F.measure({...result,frames:record},track,vehicle,{zoneId:zone.id,referenceSpeeds:result.drift?.referenceSpeeds,diagnostics:false});
}
function clutchKick(vehicle,track,parent,rng,options={}){
 const p=vehicle.physics||vehicle;if(p.transmissionType!=='MT'||C.clutchKick===undefined)return null;
 if(!parent.accepted||!parent.result?.valid||parent.result.status!=='finished')throw new TypeError('Clutch mutations require a completed valid parent.');
 const record=parent.record||parent.result.frames,all=options.zones||zones(track),z=options.zone||all[Math.floor(rng()*all.length)];
 if(!z||!record?.length)return null;
 const ds=track.length/(G.KNOTS-1),start=Math.max(2.5,(z.cornerStart??z.start)-25),end=Math.min(track.length-ds,z.end),frames=record.filter(f=>f.s>=start&&f.s<=end&&f.speed>=6);
 if(!frames.length)return null;
 const wanted=options.connectionTarget?.breakS,frame=Number.isFinite(wanted)?frames.reduce((a,b)=>Math.abs(a.s-wanted)<Math.abs(b.s-wanted)?a:b):frames[Math.floor(rng()*frames.length)];
 const gene=G.clone(parent.gene),clear=k=>{const j=k*G.STRIDE;for(const channel of [C.clutchKick,C.disengageSec,C.reengageSec])gene[j+channel]=G.DESCRIPTORS[channel].defaultValue;};
 for(let i=0;i<G.KNOTS;i++)if(gene[i*G.STRIDE+C.clutchKick]<.5)clear(i);
 const events=Array.from({length:G.KNOTS},(_,i)=>i).filter(i=>gene[i*G.STRIDE+C.clutchKick]>=.5),near=events.filter(i=>Math.abs(i*ds-frame.s)<20);
 const old=near.length?near[Math.floor(rng()*near.length)]:null,index=clamp(Math.round(frame.s/ds)+(old===null?0:Math.round((rng()*2-1)*3)),Math.ceil(start/ds),Math.floor(end/ds));
 const previous=old===null?null:{disengage:gene[old*G.STRIDE+C.disengageSec],reengage:gene[old*G.STRIDE+C.reengageSec]};
 if(old!==null)clear(old);
 // Event count is a bounded search representation, not a force or validity
 // constraint. The driver separately consumes distance triggers in time.
 if(old===null&&events.length>=8)clear(events[Math.floor(rng()*events.length)]);
 const j=index*G.STRIDE,strength=clamp(options.scale??1,.15,1),remove=old!==null&&rng()<.15;
 if(remove)clear(index);
 else {
  gene[j+C.clutchKick]=1;
  gene[j+C.disengageSec]=clamp((previous?.disengage??.10)+(rng()*2-1)*.07*strength,.04,.45);
  gene[j+C.reengageSec]=clamp((previous?.reengage??.09)+(rng()*2-1)*.055*strength,.03,.30);
 }
 if(!remove){Shape.bump(gene,C.throttle,index,3,.05*strength);Shape.bump(gene,C.brake,index,3,-.08*strength);}
 const bounds=options.lineBounds||G.corridorBounds(vehicle,track),normalized=G.normalize(gene,{maxSteerRad:p.maxSteer,gearCount:p.gearRatios.length,lineBounds:bounds,manualClutch:true});
 return {gene:normalized,change:{family:'clutch-kick',eventKnot:index,eventS:index*ds,removed:remove,previousEventKnot:old,disengageSec:normalized[j+C.disengageSec],reengageSec:normalized[j+C.reengageSec]}};
}
function signature(){return FAMILIES.join(',')+'\n'+Shape.signature()+'\n'+SpeedPlanner.signature()+'\n'+[entry,adaptive,repair,connect,clutchKick,pedalOverlap,pedalEnvelope,preservePedalOverlap,couple,feedforward,point,speedAt,brakingSlowdown,lineShape,joinLine,smoother,niche,zones,links,approachStart,supports,ensureChanged,ensurePedalChanged,repairNudge,trailingStraightStart].map(String).join('\n');}
const api=Object.freeze({VERSION:10,FAMILIES,zones,links,approachStart,supports,entry,adaptive,repair,connect,clutchKick,pedalOverlap,preservePedalOverlap,niche,couple,feedforward,speedAt,trailingStraightStart,signature});
root.DriftEvolutionStrategies=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
