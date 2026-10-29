'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),E=require('./evolution.js'),G=require('./genome.js'),F=require('./fitness.js');
const C=G.CHANNELS;
function result(scores=[0,0],linkScore=0,{score=scores.reduce((a,b)=>a+b,0)+linkScore,complete=[],valid=true}={}){
 return {valid,status:valid?'finished':'offtrack',score,time:20,frames:[],drift:{arcs:scores.map((s,i)=>({zoneId:'apex-'+i,score:s,complete:!!complete[i]})),links:[{id:'link-0',fromZoneId:'apex-0',toZoneId:'apex-1',score:linkScore,complete:!!complete[2]}]}};
}
function entry(id,scores,link=0,options={}){const gene=G.create();return {id,sequence:parseInt(id)||0,result:result(scores,link,options),gene,record:[],accepted:options.valid!==false};}
function fixture(){
 const vehicle={physics:{wheelbaseM:2.6,widthM:1.8,lengthM:4.5,massKg:1500,maxSteer:.6,gearRatios:[4,2.7,1.8,1.3,1,.8],finalDrive:3.5,tireRadius:.34,shiftRPM:6500}};
 const track={length:300,width:30,judgedStart:40,judgedEnd:265,sample:s=>({s,x:s,y:0,heading:0,curvature:s>=70&&s<=110?.02:s>=170&&s<=215?-.02:0})};
 const record=Array.from({length:601},(_,i)=>({s:i*.5,time:i/40,x:i*.5,y:0,speed:20,vx:20,vy:0,yaw:0,beta:0}));
 const gene=G.create();for(let i=0;i<G.KNOTS;i++)gene[i*G.STRIDE+C.throttle]=.4;
 const baseline={genomeVersion:G.VERSION,gene,record,result:{...result(),frames:record}};
 const engine=new E.Engine(vehicle,track,{seed:417,populationSize:4,baseline,rankResult:(_v,_t,r)=>r});engine.initialize();
 return {engine,vehicle,track,record,baseline,zones:F.apexZones(track)};
}

test('higher first-corner score cannot overwrite a champion by regressing the next corner or link',()=>{
 const champion=entry('1',[10,10],10),cornerLoss=entry('2',[30,4],10),linkLoss=entry('3',[20,20],1),balanced=entry('4',[11,10],11);
 assert.ok(cornerLoss.result.score>champion.result.score);assert.equal(E.preservesRegions(cornerLoss,champion),false);
 assert.equal(E.preservesRegions(linkLoss,champion),false);assert.equal(E.preservesRegions(balanced,champion),true);
});

test('a stronger weak region can trade partial points from a stronger corner without locking in local luck',()=>{
 const incumbent=entry('1',[30,0],0),balanced=entry('2',[25,15],10);
 assert.ok(balanced.result.score>incumbent.result.score);assert.equal(E.preservesRegions(balanced,incumbent),true);
 const {engine,record}=fixture(),jobs=Array.from({length:4},()=>engine.planCandidate());
 for(const [i,r]of [incumbent.result,balanced.result,result([45,1],0),result([26,15],11)].entries())engine.acceptCandidate(jobs[i],{...r,frames:record});
 assert.equal(engine.best.id,jobs[3].id);assert.equal(engine.best.result.score,52);assert.equal(engine.snapshot().selectionStats.guardedRegressions,0,'the locally worse candidate also had lower total score and never challenged the representative');
});

test('weakest-first comparison tolerates insignificant score noise but preserves meaningful regressions',()=>{
 const incumbent=entry('1',[10,20],10);
 assert.equal(E.preservesRegions(entry('2',[9.95,21],11),incumbent),true);
 assert.equal(E.preservesRegions(entry('3',[9.8,40],20),incumbent),false);
});

test('completed regional connections cannot be exchanged for more partial points',()=>{
 const champion=entry('1',[10,10],10,{complete:[true,false,true]}),candidate=entry('2',[20,20],20);
 assert.equal(E.preservesRegions(candidate,champion),false);
 assert.equal(E.preservesRegions(entry('3',[20,20],20,{complete:[true,false,true]}),champion),true);
});

test('Pareto trade-offs survive while dominated regional results are excluded',()=>{
 const a=entry('1',[10,2]),b=entry('2',[2,10]),c=entry('3',[1,1]),d=entry('4',[10,2]);
 assert.deepEqual(E.paretoEntries([a,b,c,d]).map(e=>e.id),['1','2','4']);
 assert.ok(E.preservesRegions(a,entry('0',[0,0])),'a first useful corner retains its learning gradient');
});

test('weakest region includes associated connectors without making all corners equal on a broken link',()=>{
 const {zones}=fixture();assert.deepEqual(E.weakestArcs(entry('1',[20,0]),zones),[1]);
 assert.deepEqual(E.weakestArcs(entry('2',[0,0]),zones),[0,1]);
});

test('engine compares equal-budget candidates without promoting a local overfit and keeps score semantics',()=>{
 const {engine,record}=fixture(),jobs=Array.from({length:4},()=>engine.planCandidate());
 const outcomes=[result([10,10],10),result([30,4],10),result([12,11],11),result([40,2],0)];
 for(let i=0;i<4;i++)engine.acceptCandidate(jobs[i],{...outcomes[i],frames:record});
 assert.equal(engine.best.id,jobs[2].id);assert.equal(engine.best.result.score,34);
 const stats=engine.snapshot().selectionStats;assert.equal(stats.balancedPromotions,2);assert.equal(stats.guardedRegressions,2);
 assert.equal(Math.max(...outcomes.map(r=>r.score)),44,'the former score-only winner regressed the second region');
 assert.ok(stats.paretoParents>0);assert.ok(engine._nicheArchives.flat().some(e=>e.id===jobs[1].id),'a rejected trade-off remains a real proposal parent');
});

test('zero-score niche ties retain locally diverse valid preparation rather than only the baseline',()=>{
 const {engine,zones}=fixture(),entries=[];
 for(let n=0;n<24;n++){
  const e=entry(String(n+1),[0,0]);e.gene=G.clone(engine._baselineEntry.gene);
  const begin=Math.floor(zones[1].referenceStart/engine.track.length*127),end=Math.ceil(zones[1].end/engine.track.length*127);
  for(let k=begin;k<=end;k++){e.gene[k*8+C.throttle]=n/24;e.gene[k*8+C.targetSlip]=(n%5)*.03;e.gene[k*8+C.counterLead]=.1+(n%7)*.1;}
  entries.push(e);
 }
 const failed={...entries.at(-1),id:'failed',accepted:false,result:result([100,100],45,{valid:false})};
 const pool=engine._retainNiche([engine._baselineEntry,...entries,failed],1);
 assert.ok(pool.length>=12&&pool.length<=16);assert.ok(pool.some(e=>e.id==='baseline'));assert.ok(pool.every(e=>e.id!=='failed'));
 assert.ok(new Set(pool.map(e=>G.sample(e.gene,zones[1].apex,engine.track.length).throttle.toFixed(4))).size>=10);
});

test('niche diversity measures local controls rather than unrelated previous-corner differences',()=>{
 const {engine,zones}=fixture(),a=G.clone(engine._baselineEntry.gene),b=G.clone(a);b[C.throttle]=.99;
 assert.equal(E.localGeneDistance(a,b,zones[1],engine.track.length,engine.lineBounds),0);
 b[90*8+C.throttle]=.99;assert.ok(E.localGeneDistance(a,b,zones[1],engine.track.length,engine.lineBounds)>0);
});

test('zero-score preparation is actually inherited by adaptive proposals after initial exploration',()=>{
 const {engine,record}=fixture(),parent={...entry('step',[0,0]),record,gene:G.clone(engine._baselineEntry.gene)};
 parent.gene[90*8+C.throttle]=.73;engine._nicheArchives[1]=[engine._baselineEntry,parent];engine._entryCounts[1]=20;
 const metric={score:0,bestArc:null,links:[],bestLink:null};engine._regional=()=>metric;
 let received;
 engine._weakestArcIndices=[1];engine._learning={choose(_rng,_families,options){received=options;return {arc:1,scale:.2,family:'angle'};}};
 const numbers=[.9,.75,.9,.1,.1];engine._rng=()=>numbers.length?numbers.shift():.5;
 const proposal=engine._intentCandidate();assert.deepEqual(received,{weakestArcs:[1]});
 assert.equal(proposal.parentId,'step');assert.ok(proposal.kind.startsWith('arc-'));assert.equal(proposal.gene[90*8+C.throttle],.73);
 assert.notDeepEqual(proposal.gene,parent.gene);assert.equal(parent.gene[90*8+C.throttle],.73);
});

test('weakest-region guidance changes only at the generation barrier',()=>{
 const {engine,record}=fixture();assert.deepEqual(engine._weakestArcIndices,[0,1]);
 const jobs=Array.from({length:4},()=>engine.planCandidate());
 for(let i=0;i<jobs.length;i++){
  engine.acceptCandidate(jobs[i],{...result([10,0]),frames:record});
  assert.deepEqual(engine._weakestArcIndices,i<3?[0,1]:[1]);
 }
});
