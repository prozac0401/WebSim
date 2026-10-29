'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Planner=require('./entry-speed-planner.js'),G=require('./genome.js'),Strategies=require('./evolution-strategies.js'),Catalog=require('./catalog.js'),Physics=require('./physics.js');
const C=G.CHANNELS;
function fixture(radius=40){
 const vehicle=Catalog.get(),track={length:400,width:24,sample:s=>({s,x:radius*Math.sin(s/radius),y:radius*(1-Math.cos(s/radius)),heading:s/radius,curvature:1/radius})};
 const zone={id:'z',start:125,cornerStart:160,apex:190,exit:220,end:280,sign:1};
 const record=Array.from({length:81},(_,i)=>({s:i*5,speed:30,brake:i>=24&&i<32?.25:0}));
 const arrival=record.map(f=>({...f,speed:40})),gene=G.create();
 for(let i=0;i<128;i++){gene[i*8+C.throttle]=.8;gene[i*8+C.driveSlip]=.5;gene[i*8+C.targetSlip]=-.3;}
 return {vehicle,track,zone,record,arrival,gene};
}
test('entry speed, lead, pressure and release remain separate physical-intent parameters',()=>{
 const f=fixture(),plan=q=>Planner.plan(f.vehicle,f.track,f.gene,f.record,f.zone,q,{arrivalRecord:f.arrival}),base=plan({});
 assert.ok(plan({entrySpeedRatio:.8}).targetSpeed<base.targetSpeed);assert.ok(plan({entrySpeedRatio:1.2}).targetSpeed>base.targetSpeed);
 assert.ok(plan({brakeLead:15}).start<base.start);assert.ok(plan({brakeLead:-10}).start>base.start);
 assert.ok(plan({brakeStrength:.5}).pressure<base.pressure);assert.ok(plan({brakeStrength:1.3}).pressure>base.pressure);
 assert.equal(plan({brakeRelease:-10}).end,150);assert.equal(plan({brakeRelease:10}).end,170);
 assert.ok(base.start<f.zone.start-35,'the stopping-distance window can precede a local 35m repair window');
 assert.ok(base.requiredDistance>35);assert.ok(base.pressure>0&&base.pressure<=.85);
});
test('guidance follows the chosen line, stock vehicle and reference without a universal speed cap or simulation',()=>{
 const f=fixture(),before=JSON.stringify(Catalog.list()),inside=G.clone(f.gene);
 for(let i=0;i<128;i++)inside[i*8+C.lineOffset]=8;
 const base=Planner.plan(f.vehicle,f.track,f.gene,f.record,f.zone),tight=Planner.plan(f.vehicle,f.track,inside,f.record,f.zone);
 assert.ok(tight.curvature>base.curvature);assert.ok(tight.targetSpeed<base.targetSpeed);
 const original=Physics.step;Physics.step=()=>{throw Error('planning must not run physics');};
 try{for(const vehicle of Catalog.list()){const p=Planner.plan(vehicle,f.track,f.gene,f.record,f.zone);assert.ok([p.start,p.end,p.pressure,p.targetSpeed,p.requiredDistance].every(Number.isFinite));}}
 finally{Physics.step=original;}
 assert.equal(JSON.stringify(Catalog.list()),before);
 const gentle=fixture(80);assert.ok(Planner.plan(gentle.vehicle,gentle.track,gentle.gene,gentle.record,gentle.zone).targetSpeed>base.targetSpeed);
 // The ratio is a mutation guide, not a state speed limiter. Faster proposals
 // remain possible and must face unchanged grip/boundary/finish validation.
 assert.ok(Planner.plan(f.vehicle,f.track,f.gene,f.record,f.zone,{entrySpeedRatio:1.45}).targetSpeed>base.targetSpeed);
});
test('the plan writes only bounded pedal genes inside its braking and release window',()=>{
 const f=fixture(),before=G.clone(f.gene),plan=Planner.plan(f.vehicle,f.track,f.gene,f.record,f.zone,{}, {arrivalRecord:f.arrival}),child=Planner.apply(f.gene,plan);
 assert.deepEqual(f.gene,before);assert.equal(child.length,1024);
 assert.ok(child.some((value,i)=>i%8===C.brake&&value>before[i]));
 assert.ok(child.some((value,i)=>i%8===C.throttle&&value<before[i]));
 assert.ok(child.some((value,i)=>i%8===C.driveSlip&&value<before[i]));
 for(let i=0;i<128;i++)for(let c=0;c<8;c++){
  const s=i/127*f.track.length,j=i*8+c;
  if(![C.brake,C.throttle,C.driveSlip].includes(c)||s<=plan.start||s>=plan.end+plan.rampOut)assert.equal(child[j],before[j]);
  else assert.ok(child[j]>=0&&child[j]<=(c===C.driveSlip?1.5:1));
 }
});
test('a target faster than the observed approach preserves acceleration when no braking is requested',()=>{
 const f=fixture(80),record=f.record.map(frame=>({...frame,speed:20,brake:0}));
 const plan=Planner.plan(f.vehicle,f.track,f.gene,record,f.zone,{entrySpeedRatio:1.45},{arrivalRecord:record});
 assert.ok(plan.targetSpeed>plan.approachSpeed);assert.equal(plan.requiredDistance,0);assert.equal(plan.deceleration,0);assert.equal(plan.pressure,0);
 assert.deepEqual(Planner.apply(f.gene,plan),f.gene,'a zero-brake plan must not turn acceleration into coasting');
 const braking=G.clone(f.gene);for(let i=0;i<128;i++)braking[i*8+C.brake]=.2;
 const released=Planner.apply(braking,plan);
 assert.ok(released.some((value,i)=>i%8===C.brake&&value<braking[i]),'an unnecessary inherited brake can still be released');
 for(let i=0;i<128;i++)for(const channel of [C.throttle,C.driveSlip])assert.equal(released[i*8+channel],braking[i*8+channel]);
});
test('adaptive and failure-guided entry-speed proposals genuinely brake upstream from a valid parent',()=>{
 const f=fixture(),parent={id:'valid',accepted:true,gene:f.gene,record:f.arrival,result:{valid:true,status:'finished',frames:f.arrival},metric:{bestArc:null}};
 const options={family:'entry-speed',zones:[f.zone],zone:f.zone,referenceRecord:f.record,diagnosis:{candidateId:'failed',origin:{s:195,zoneIndex:0},window:{startS:165,endS:220}}};
 for(const proposal of [Strategies.adaptive(f.vehicle,f.track,parent,()=>.5,options),Strategies.repair(f.vehicle,f.track,parent,()=>.5,options)]){
  assert.equal(proposal.change.family,'entry-speed');assert.ok(proposal.change.entrySpeed.pressure>0);
  assert.ok(proposal.gene.some((value,i)=>i%8===C.brake&&value>parent.gene[i]&&Math.floor(i/8)/127*f.track.length<165));
  assert.ok(proposal.gene.some((value,i)=>i%8===C.throttle&&value<parent.gene[i]));
 }
 assert.throws(()=>Strategies.repair(f.vehicle,f.track,{...parent,accepted:false},()=>.5,options),/valid parent/);
});
test('a normalized-away entry-speed repair stays in its pedal window instead of changing unrelated steering',()=>{
 const f=fixture(),gene=G.create(),record=f.record.map(f=>({...f,speed:2,brake:0})),parent={accepted:true,gene,record,result:{valid:true,status:'finished',frames:record},metric:{bestArc:null}};
 const options={family:'entry-speed',zones:[f.zone],zone:f.zone,referenceRecord:record,diagnosis:{origin:{s:195,zoneIndex:0},window:{startS:165,endS:220}}};
 for(const proposal of [Strategies.repair(f.vehicle,f.track,parent,()=>.9,options),Strategies.adaptive(f.vehicle,f.track,parent,()=>.9,options)]){
  assert.equal(proposal.change.family,'entry-speed');assert.equal(proposal.change.pedalFallback,true);
  const changed=[];proposal.gene.forEach((value,i)=>{if(value!==gene[i])changed.push(i);});assert.equal(changed.length,1);assert.equal(changed[0]%8,C.brake);
  const s=Math.floor(changed[0]/8)/127*f.track.length,p=proposal.change.entrySpeed;assert.ok(s>=p.start&&s<=p.end+p.rampOut);
 }
});
test('a longer bridge can co-evolve its approach pedals while preserving drift-angle and stock-force semantics',()=>{
 const f=fixture(),run={zoneId:'z',start:195,end:230,sign:-1,distanceWeightedAngle:20},parent={gene:f.gene,result:{frames:f.arrival},metric:{bestArc:run}};
 const proposal=Strategies.adaptive(f.vehicle,f.track,parent,()=>.1,{family:'bridge',zones:[f.zone],zone:f.zone,referenceRecord:f.record});
 assert.equal(proposal.change.family,'bridge');assert.ok(proposal.change.entrySpeed);
 assert.ok(proposal.gene.some((value,i)=>i%8===C.brake&&value>parent.gene[i]));
 assert.ok(proposal.gene.some((value,i)=>i%8===C.targetSlip&&Math.abs(value)>0));
});
