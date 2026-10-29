'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Policy}=require('./evolution-learning.js'),G=require('./genome.js'),Strategies=require('./evolution-strategies.js');
function rng(seed=1){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const diagnosis={kind:'residual-yaw',origin:{time:4,s:60,zoneIndex:0},window:{startS:35,endS:110,startTime:2,endTime:7},recommendedFamilies:['timing','lead']};
test('a later failure teaches the earlier source zone without retaining a failed genome',()=>{
 const p=new Policy([{},{}]);p.observe({id:'failed',arcIndex:1,gene:new Float64Array(1024).fill(99),accepted:false,result:{status:'offtrack',valid:false,failureAnalysis:diagnosis}});
 assert.equal(p.snapshot().failuresAnalyzed,1);assert.equal(p.zones[0].hints[0].candidateId,'failed');assert.equal(p.zones[1].hints.length,0);assert.equal(p.zones[0].hints[0].gene,undefined);
 const r=rng(87),choices=Array.from({length:400},()=>p.choose(r,['line','lead','power'])),guided=choices.filter(c=>c.repair);
 assert.ok(guided.length>60);assert.ok(guided.every(c=>c.arc===0));assert.ok(choices.filter(c=>c.explore).length>60);assert.ok(choices.some(c=>!c.repair&&c.arc===1));
});
test('local failed generations reduce that zone amplitude only; successful families stay probabilistic',()=>{
 const p=new Policy([{},{}]);
 for(let i=0;i<20;i++){p.observe({arcIndex:0,kind:'power',accepted:false,result:{status:'offtrack'}});p.observe({arcIndex:0,kind:'lead',accepted:true,result:{valid:true,status:'finished'}},{improved:true});}
 p.finishGeneration([{arcIndex:0,accepted:false},{arcIndex:0,accepted:false}]);assert.equal(p.zones[1].scale,1);assert.equal(p.zones[0].scale,.65);
 const r=rng(10),chosen=Array.from({length:2000},()=>p._family(p.zones[0],['lead','power'],r));
 assert.ok(chosen.filter(f=>f==='lead').length>1200);assert.ok(chosen.filter(f=>f==='power').length>100);
});
test('weak-region focus preserves uniform exploration and cannot import another region repair',()=>{
 const p=new Policy([{},{}]);p.observe({id:'old-failure',arcIndex:0,accepted:false,result:{failureAnalysis:diagnosis}});
 const random=rng(902),choices=Array.from({length:5000},()=>p.choose(random,['line','lead'],{weakestArcs:[1,1,-1,999]}));
 const focused=choices.filter(x=>x.focus),exploratory=choices.filter(x=>x.explore);
 assert.ok(focused.length>1100&&focused.length<1500);assert.ok(focused.every(x=>x.arc===1&&!x.repair&&!x.explore));
 assert.ok(exploratory.length>1100&&exploratory.length<1400);assert.ok(exploratory.some(x=>x.arc===0)&&exploratory.some(x=>x.arc===1));
 assert.ok(choices.some(x=>x.repair&&x.arc===0));assert.equal(p.snapshot().focusProposals,focused.length);
});
test('a later visible precursor can direct tests back into the previous drift tail',()=>{
 const p=new Policy([{},{}]),d={...diagnosis,origin:{time:20,s:350,zoneIndex:1},precedingZoneIndex:0,window:{startS:225,endS:400}};
 p.observe({id:'late-failure',arcIndex:1,accepted:false,result:{failureAnalysis:d}});
 assert.equal(p.zones[0].hints.length,1);assert.equal(p.zones[1].hints.length,0);
 const vehicle={physics:{maxSteer:.6,wheelbaseM:2.6,gearRatios:[4,2,1],lengthM:4.5,widthM:1.8}},track={length:500,width:30,sample:s=>({s,x:s,y:0,heading:0,curvature:0})};
 const gene=G.create(),parent={gene,record:[{s:0,speed:15},{s:500,speed:15}],accepted:true,result:{valid:true,status:'finished'}};
 const random=rng(71),samples=Array.from({length:100},()=>Strategies.repair(vehicle,track,parent,random,{family:'lead',diagnosis:p.zones[0].hints[0],zones:[{exit:250},{exit:390}]}));
 assert.ok(samples.filter(s=>s.change.searchPrior&&s.change.center<280).length>35);
 assert.ok(samples.some(s=>!s.change.searchPrior&&s.change.center>340),'both the suspected earlier action and observed current divergence remain searchable');
 assert.ok(samples.some(s=>s.gene.some((v,i)=>Math.floor(i/8)/127*500<270&&v!==gene[i])));
});
test('diagnosis storage is bounded, unknown cases are not blamed and disabled policy consumes no RNG',()=>{
 const p=new Policy([{}]);for(let i=0;i<100;i++)p.observe({id:String(i),arcIndex:0,accepted:false,result:{failureAnalysis:{...diagnosis,kind:'case-'+i}}});assert.equal(p.zones[0].hints.length,4);
 const before=p.failuresAnalyzed;p.observe({accepted:false,result:{failureAnalysis:{...diagnosis,kind:'unknown'}}});assert.equal(p.failuresAnalyzed,before);
 for(let i=0;i<7;i++)p.finishGeneration([]);assert.equal(p.zones[0].hints.length,0,'stale diagnoses do not steer every later generation');
 const off=new Policy([{}],{enabled:false});assert.equal(off.choose(()=>{throw Error('RNG consumed');},[]),null);assert.equal(off.snapshot().observations,0);
});
test('repair changes valid-parent intent in the precursor window, stays deterministic and tests both directions',()=>{
 const vehicle={physics:{maxSteer:.6,wheelbaseM:2.6,gearRatios:[4,2,1],lengthM:4.5,widthM:1.8}},track={length:220,width:30,sample:s=>({s,x:s,y:0,heading:0,curvature:0})};
 const gene=G.create();for(let i=0;i<G.KNOTS;i++){gene[i*8+G.CHANNELS.targetSlip]=.2*Math.sin(i/20);gene[i*8+G.CHANNELS.throttle]=.6;}
 const record=Array.from({length:45},(_,i)=>({s:i*5,speed:15})),parent={id:'valid-parent',gene,record,accepted:true,result:{valid:true,status:'finished'}},before=gene.slice();
 for(const family of ['timing','lead','steer','line','power','angle','combined']){
  const options={family,diagnosis:{...diagnosis,candidateId:'failed-child'},scale:.5};
  const a=Strategies.repair(vehicle,track,parent,rng(42),options),b=Strategies.repair(vehicle,track,parent,rng(42),options);
  assert.deepEqual(a,b);assert.notDeepEqual(a.gene,gene);assert.equal(a.change.basisCandidateId,'failed-child');
  assert.equal(a.change.originS,60);assert.ok(a.gene.every(Number.isFinite));
  for(let i=0;i<G.KNOTS;i++){const s=i/127*220;if(s>110||s<35)for(let c=1;c<8;c++)assert.equal(a.gene[i*8+c],gene[i*8+c]);}
 }
 assert.deepEqual(gene,before);assert.throws(()=>Strategies.repair(vehicle,track,{...parent,accepted:false},rng(),{diagnosis}),/valid parent/);
 const changes=Array.from({length:30},(_,i)=>Strategies.repair(vehicle,track,parent,rng(1000+i*10000),{family:'lead',diagnosis}).change.direction);assert.ok(changes.includes(1)&&changes.includes(-1));
 const saturated=G.clone(gene);for(let i=0;i<G.KNOTS;i++)saturated[i*8+G.CHANNELS.counterLead]=.8;
 const clipped=Strategies.repair(vehicle,track,{...parent,gene:saturated},()=>.9,{family:'lead',diagnosis});
 assert.notDeepEqual(clipped.gene,saturated,'a normalized-away repair still produces a trial within the precursor window');
 assert.equal(clipped.change.family,'steer');assert.equal(clipped.change.fallbackFrom,'lead');
});
