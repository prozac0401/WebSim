/* Mutation guidance, not a vehicle controller. A braking estimate becomes
 * ordinary pedal genes; only a complete physical run can validate the plan. */
(function(root){
 'use strict';
 const G=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null),C=G.CHANNELS;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
 function at(record,s,key='speed'){
  if(!record?.length)return 0;let a=0,b=record.length-1;
  while(a+1<b){const m=(a+b)>>1;if(record[m].s<s)a=m;else b=m;}
  const x=record[a],y=record[b],u=clamp((s-x.s)/Math.max(1e-9,y.s-x.s),0,1);
  return (x[key]||0)+((y[key]||0)-(x[key]||0))*u;
 }
 function point(track,gene,s){s=clamp(s,0,track.length);const q=track.sample(s),d=G.sample(gene,s,track.length).lineOffset;return{x:q.x-Math.sin(q.heading)*d,y:q.y+Math.cos(q.heading)*d};}
 function curvature(track,gene,s,h){
  const a=point(track,gene,s-h),b=point(track,gene,s),c=point(track,gene,s+h),ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),ac=Math.hypot(c.x-a.x,c.y-a.y);
  return ab*bc*ac>1e-8?2*Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/(ab*bc*ac):0;
 }
 function parameters(values={}){return {entrySpeedRatio:clamp(values.entrySpeedRatio??1,.65,1.45),brakeLead:clamp(values.brakeLead??0,-25,45),brakeStrength:clamp(values.brakeStrength??1,.35,1.65),brakeRelease:clamp(values.brakeRelease??0,-25,20)};}
 function plan(vehicle,track,gene,referenceRecord,zone,values={},options={}){
  const p=vehicle.physics||vehicle,q=parameters(values),ds=track.length/(G.KNOTS-1),lower=clamp(options.lower??2.5,2.5,track.length-2*ds);
  const entry=zone.cornerStart??zone.start,apex=zone.apex??(entry+zone.exit)/2,end=clamp(entry+q.brakeRelease,lower+2*ds,Math.max(lower+2*ds,apex));
  const arrival=options.arrivalRecord||referenceRecord,mu=(p.gripCoefficient||1)*9.81,h=clamp(ds*.5,1,4),samples=[];
  for(let s=entry;s<=Math.max(entry,apex);s+=Math.max(1,h))samples.push(curvature(track,gene,s,h));
  samples.sort((a,b)=>a-b);const peak=samples[Math.floor((samples.length-1)*.9)]||0;
  const referenceSpeed=Math.max(1,at(referenceRecord,end)),curveSpeed=peak>1e-6?Math.sqrt(mu/peak):Infinity;
  const targetSpeed=Math.max(1,Math.min(referenceSpeed,curveSpeed)*q.entrySpeedRatio);
  // Same stock rear brake share/load-transfer constraint as offline guidance.
  // This budgets pedal intent; it adds no ABS, grip or automatic deceleration.
  const rearSafe=mu*(1-(p.frontWeightFraction||.52))/(.38+mu/9.81*(p.cgHeightM||.5)/(p.wheelbaseM||2.7))*.55;
  const braking=Math.max(.2,Math.min((p.brakeAcceleration||9.8)*.55,mu*.55,rearSafe));
  const requiredDistance=Math.max(0,(at(arrival,end)**2-targetSpeed**2)/(2*braking));
  let crossing=end-2*ds,found=false,profileStart=end-2*ds;
  for(let s=lower;s<end;s+=Math.max(1,ds*.5))if(at(arrival,s)**2>targetSpeed**2+2*braking*(end-s)){crossing=s;found=true;break;}
  const brakingFrames=referenceRecord.filter(f=>f.s>=lower&&f.s<end&&(f.brake||0)>.02);
  if(brakingFrames.length)profileStart=brakingFrames[0].s;
  const start=clamp(Math.min(found?crossing:profileStart,profileStart)-q.brakeLead,lower,end-2*ds),length=end-start;
  const rampIn=Math.min(2*ds,length*.2),rampOut=Math.min(3*ds,length*.3),effectiveDistance=Math.max(ds,length-(rampIn+rampOut)/2);
  const approachSpeed=at(arrival,start),deceleration=Math.max(0,(approachSpeed**2-targetSpeed**2)/(2*effectiveDistance));
  // The placement estimate and emitted pedal must share one braking budget.
  // A short window or strength mutation must not request more deceleration
  // than the rear load/brake-share estimate used to construct that window.
  const brakeLimit=braking/(p.brakeAcceleration||9.8);
  const pressure=clamp(deceleration/(p.brakeAcceleration||9.8)*q.brakeStrength,0,Math.min(.85,brakeLimit));
  return {zoneId:zone.id,trackLength:track.length,start,end,rampIn,rampOut,pressure,brakeLimit,targetSpeed,referenceSpeed,approachSpeed,curvature:peak,requiredDistance,deceleration,parameters:q};
 }
 function apply(gene,plan){
  const child=G.clone(gene),ds=plan.trackLength/(G.KNOTS-1);
  if(!Number.isFinite(ds)||ds<=0)throw new TypeError('The braking plan needs its fixed track length.');
  for(let i=0;i<G.KNOTS;i++){
   const s=i*ds;if(s<=plan.start||s>=plan.end+plan.rampOut)continue;
   const rise=smooth((s-plan.start)/plan.rampIn),w=rise*(1-smooth((s-(plan.end-plan.rampOut))/plan.rampOut)),edit=rise*(1-smooth((s-plan.end)/plan.rampOut)),j=i*G.STRIDE;
   child[j+C.brake]=child[j+C.brake]*(1-edit)+plan.pressure*w;
   // The driver adds drive-slip throttle correction, so both torque requests
   // must release while preparing speed. Steering/slip-angle genes stay free.
   // A faster target may release an inherited brake without requesting any
   // deceleration. Preserve acceleration in that case; coasting is not free.
   const torqueRelease=plan.pressure>0?w:0;
   child[j+C.throttle]*=1-torqueRelease;child[j+C.driveSlip]*=1-torqueRelease;
  }
  return child;
 }
 function signature(){return [at,point,curvature,parameters,plan,apply].map(String).join('\n');}
 const api=Object.freeze({VERSION:1,parameters,plan,apply,signature});root.DriftEntrySpeedPlanner=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
