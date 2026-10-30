'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./genome.js'),Shape=require('./mutation-shape.js'),E=require('./evolution.js'),Strategies=require('./evolution-strategies.js'),C=G.CHANNELS;
function base(){const gene=G.create();for(let i=0;i<G.KNOTS;i++){gene[i*G.STRIDE+C.throttle]=.4;gene[i*G.STRIDE+C.brake]=.2;gene[i*G.STRIDE+C.driveSlip]=.3;}return gene;}
const changed=(a,b,channel)=>Array.from({length:G.KNOTS},(_,k)=>k).filter(k=>a[k*G.STRIDE+channel]!==b[k*G.STRIDE+channel]);

test('spatial anchor interpolation joins zero deltas and zero slopes without altering the parent outside its window',()=>{
 const gene=base(),before=G.clone(gene),curve=Shape.add(gene,C.steer,{start:30,end:46,amount:.08,values:[0,.3,1,.6,0]},{maxSteerRad:.6});
 assert.ok(curve.changed>8);
 for(const knot of [30,34,38,42,46]){
  const h=1e-5,left=(Shape.valueAt(curve.anchors,knot)-Shape.valueAt(curve.anchors,knot-h))/h;
  const right=(Shape.valueAt(curve.anchors,knot+h)-Shape.valueAt(curve.anchors,knot))/h;
  assert.ok(Math.abs(left)<1e-5&&Math.abs(right)<1e-5,'the perturbation envelope has no slope step at its anchor');
 }
 for(let i=0;i<128;i++)for(let c=0;c<G.STRIDE;c++)if(c!==C.steer||i<=30||i>=46)assert.equal(gene[i*G.STRIDE+c],before[i*G.STRIDE+c]);
 assert.equal(Shape.valueAt(curve.anchors,29),0);assert.equal(Shape.valueAt(curve.anchors,47),0);
});

test('common headroom scaling preserves the shape through final normalization and does not leave a clipped singleton',()=>{
 const gene=base();for(let i=0;i<128;i++)gene[i*G.STRIDE+C.steer]=.59;
 gene[40*G.STRIDE+C.steer]=.605;
 const before=G.clone(gene),span={start:34,end:46,amount:.08};
 const curve=Shape.add(gene,C.steer,span,{maxSteerRad:.61}),normalized=G.normalize(gene,{maxSteerRad:.61});
 assert.ok(curve.scale>0&&curve.scale<1);assert.deepEqual(normalized,gene);assert.ok(changed(normalized,before,C.steer).length>=5);
 for(const i of changed(gene,before,C.steer))assert.ok(Math.abs((gene[i*G.STRIDE]-before[i*G.STRIDE])-Shape.valueAt(curve.anchors,i)*curve.scale)<1e-14);
 const saturated=base();for(let i=0;i<128;i++)saturated[i*G.STRIDE]=.61;saturated[50*G.STRIDE]=.1;
 const sequence=[0,0,50/128,0,.99,.5,.5];let at=0;
 const child=E.mutateGene(saturated,{strategy:'fine',maxSteerRad:.61,rng:()=>sequence[at++]??.5});
 assert.ok(changed(child,saturated,C.steer).length>=3,'the historical fine mutation changed only knot50 after clipping');
 assert.deepEqual(G.normalize(child,{maxSteerRad:.61}),child);
});

test('ordinary local mutations vary related channel sequences in both directions while fine polish stays local',()=>{
 const parent=base(),before=G.clone(parent);let multi=0,positive=false,negative=false;
 for(let seed=1;seed<=50;seed++){
  const child=E.mutateGene(parent,{strategy:'local',seed,maxSteerRad:.6});
  const channels=Array.from({length:7},(_,c)=>c).filter(c=>changed(child,parent,c).length);
  if(channels.length>=2)multi++;
  for(const c of channels){const knots=changed(child,parent,c);assert.ok(knots.length>=2);for(const k of knots){if(c===C.throttle){positive ||= child[k*G.STRIDE+c]>parent[k*G.STRIDE+c];negative ||= child[k*G.STRIDE+c]<parent[k*G.STRIDE+c];}}}
  assert.deepEqual(G.normalize(child,{maxSteerRad:.6}),child);
  for(let i=0;i<128;i++)assert.ok(Number.isInteger(child[i*G.STRIDE+C.gearHold]));
 }
 assert.ok(multi>=35);assert.ok(positive&&negative,'exploration does not systematically add throttle');assert.deepEqual(parent,before);
 const fine=E.mutateGene(parent,{strategy:'fine',seed:19,maxSteerRad:.6});
 const knots=new Set(Array.from(fine,(_,i)=>i).filter(i=>fine[i]!==parent[i]).map(i=>Math.floor(i/G.STRIDE)));
 assert.ok(knots.size>=2&&knots.size<25);
});

test('spatial mutation obeys a varying line corridor and keeps discrete gears out of interpolation',()=>{
 const parent=base(),bounds=Array.from({length:128},()=>({min:-2,max:2}));bounds[45]={min:-.02,max:.02};
 const child=G.clone(parent),curve=Shape.add(child,C.lineOffset,{start:38,end:54,amount:2},{lineBounds:bounds});
 assert.ok(curve.scale>0&&curve.scale<.1);
 assert.deepEqual(G.normalize(child,{lineBounds:bounds}),child);
 assert.ok(changed(child,parent,C.lineOffset).length>3);
 assert.throws(()=>Shape.add(child,C.gearHold,{start:10,end:20,amount:2}),/continuous/);
});

test('low mutation strength adopts a proposed gear plateau as one event',()=>{
 const vehicle={physics:{wheelbaseM:2.7,widthM:1.8,lengthM:4.5,maxSteer:.6,gearRatios:[4,2.7,1.8,1.3,1,.8],finalDrive:3.5,tireRadius:.34,shiftRPM:6500}};
 const track={length:300,width:30,judgedStart:50,judgedEnd:240,sample:s=>({s,x:s,y:0,heading:0,curvature:s>100&&s<150?.02:0})};
 const record=Array.from({length:301},(_,s)=>({s,speed:20,x:s,y:0,vx:20,vy:0,yaw:0})),gene=base(),zone=Strategies.zones(track)[0];
 const parent={gene,result:{frames:record},metric:{bestArc:{end:zone.exit+15,zoneExit:zone.exit}}};
 const random=()=>{let count=0;return()=>++count<=10?.6:count%2?.1:.9;};
 const full=Strategies.adaptive(vehicle,track,parent,random(),{family:'gear',zone,scale:1});
 const partial=Strategies.adaptive(vehicle,track,parent,random(),{family:'gear',zone,scale:.5});
 const knots=changed(full.gene,gene,C.gearHold);assert.ok(knots.length>5);
 assert.deepEqual(knots,changed(partial.gene,gene,C.gearHold),'one accepted plateau cannot be chopped into alternating gears');
 for(const k of knots)assert.equal(partial.gene[k*G.STRIDE+C.gearHold],full.gene[k*G.STRIDE+C.gearHold]);
});

test('gearPower uses one smooth pedal target across the selected gear interval',()=>{
 const vehicle={physics:{wheelbaseM:2.7,widthM:1.8,lengthM:4.5,maxSteer:.6,gearRatios:[4,2.7,1.8,1.3,1,.8],finalDrive:3.5,tireRadius:.34,shiftRPM:6500}};
 const track={length:300,width:30,judgedStart:50,judgedEnd:240,sample:s=>({s,x:s,y:0,heading:0,curvature:s>100&&s<150?.02:0})};
 const record=Array.from({length:301},(_,s)=>({s,speed:20,x:s,y:0,vx:20,vy:0,yaw:0})),gene=base(),zone=Strategies.zones(track)[0];
 const parent={gene,result:{frames:record},metric:{bestArc:{end:zone.exit+15,zoneExit:zone.exit}}};
 const proposal=Strategies.adaptive(vehicle,track,parent,E.createRng(15),{family:'gearPower',zone});
 const target=proposal.change.powerSlipTarget,ds=track.length/127;
 assert.ok(target>=.45&&target<=1.1);
 for(let k=0;k<128;k++){const s=k*ds;if(s>proposal.change.shiftAt+2*ds&&s<zone.end+20-2*ds)assert.equal(proposal.gene[k*G.STRIDE+C.driveSlip],target);}
});

test('a tiny no-op repair expands its local delta window instead of making one knot spike or editing before spawn',()=>{
 const vehicle={physics:{wheelbaseM:2.7,widthM:1.8,lengthM:4.5,maxSteer:.6,gearRatios:[4,2.7,1.8,1.3,1,.8]}};
 const track={length:300,width:30,sample:s=>({s,x:s,y:0,heading:0,curvature:0})};
 const record=[{s:0,speed:15},{s:300,speed:15}],gene=base();
 const parent={accepted:true,gene,record,result:{valid:true,status:'finished',frames:record}};
 const proposal=Strategies.repair(vehicle,track,parent,()=>.5,{family:'timing',diagnosis:{origin:{s:1},window:{startS:0,endS:2}}});
 const knots=changed(proposal.gene,gene,C.steer),window=proposal.change.mutationWindow;
 assert.ok(knots.length>=3);assert.ok(window.start>=2.5);assert.ok(window.end-window.start<=7*track.length/127);
 for(let s=0;s<=2.5;s+=.1)assert.deepEqual(G.sample(proposal.gene,s,track.length),G.sample(gene,s,track.length));
 for(let i=0;i<128;i++)if(i/127*track.length<=window.start||i/127*track.length>=window.end)assert.equal(proposal.gene[i*G.STRIDE],gene[i*G.STRIDE]);
 assert.deepEqual(G.normalize(proposal.gene,{maxSteerRad:.6}),proposal.gene);
});
