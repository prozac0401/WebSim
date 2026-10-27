'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const Terrain=require('./circuit-terrain.js');
function fixture(separation=60){
 const points=[{x:0,y:0,z:10},{x:120,y:0,z:10},{x:120,y:separation,z:40},{x:0,y:separation,z:40}];
 const track={width:12,bounds:{minX:0,maxX:120,minY:0,maxY:separation},points};
 const edges=points.map((p,i)=>{const a=points[(i+3)%4],b=points[(i+1)%4],length=Math.hypot(b.x-a.x,b.y-a.y);const at=d=>({x:p.x-(b.y-a.y)/length*d,y:p.y+(b.x-a.x)/length*d,z:p.z});return{outerLeft:at(-7),left:at(-6),right:at(6),outerRight:at(7)};});
 return{track,edges,groundHeight:(x,y)=>y<separation/2?9.93:39.93};
}
const signature=m=>({faces:m.faces,stats:m.stats,grid:m.grid,bounds:m.bounds});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('standalone shoulder opt-in leaves absent/disabled geometry and existing relief byte-identical',()=>{
 const f=fixture(),options={groundHeight:f.groundHeight},plain=Terrain.build(f.track,f.edges,options);
 // Captured independently from b555364 before standalone grading was added;
 // topology, material, order, every coordinate, lattice and statistics count.
 assert.equal(hash(signature(plain)),'867d31dffff2a47db33b0dcc953fbecc1bc9d3075158c2f271e4fcc6d0fd6e44');
 assert.deepEqual(signature(Terrain.build(f.track,f.edges,{...options,gradedShoulder:false})),signature(plain));
 assert.equal(plain.stats.gradedShoulder,undefined);assert.equal(plain.stats.relief,undefined);
 const relief={...options,relief:(x,y)=>35*Math.sin(x/60)+20,reliefRoadBlendM:40};
 for(const gradedShoulder of [undefined,false,true]){
  const model=Terrain.build(f.track,f.edges,{...relief,gradedShoulder});
  assert.equal(hash(signature(model)),'dbe094bf7733675b1de6d07ee5d346a5fbd31952299e1acc095fd5f90450a638');
  assert.equal(model.stats.relief.shoulderCellM,6);assert.equal(model.stats.gradedShoulder,undefined);
 }
});

test('standalone grading refines only the road corridor with zero added relief and an unchanged lattice',()=>{
 const f=fixture(),before=JSON.stringify(f),options={groundHeight:f.groundHeight};
 const plain=Terrain.build(f.track,f.edges,options),graded=Terrain.build(f.track,f.edges,{...options,gradedShoulder:true});
 assert.equal(JSON.stringify(f),before);assert.deepEqual(graded.grid,plain.grid);assert.deepEqual(graded.bounds,plain.bounds);
 assert.equal(graded.stats.relief,undefined);const s=graded.stats.gradedShoulder;
 assert.equal(s.shoulderM,8);assert.equal(s.shoulderCellM,3);assert.equal(s.blendM,40);assert(s.refinedCells>0&&s.refinedCells<1000);
 for(const key of ['minDeltaM','maxDeltaM','minAppliedM','maxAppliedM'])assert.equal(s[key],0,'this is not an invented DEM');
 assert.equal(graded.heightAt,graded.sampleHeight);
 for(const [x,y]of[[60,-100],[60,160],[-100,-100],[200,160]])assert.equal(graded.sampleHeight(x,y),plain.sampleHeight(x,y),'distant terrain keeps its existing height');
 // With no road there is nothing to grade or refine, and even a nonlinear
 // input retains the original piecewise-planar mesh exactly.
 const groundHeight=(x,y)=>20+.001*x*x+.002*y*y;
 const empty=Terrain.build(f.track,[],{groundHeight}),enabled=Terrain.build(f.track,[],{groundHeight,gradedShoulder:true});
 assert.deepEqual(enabled.faces,empty.faces);assert.equal(enabled.stats.gradedShoulder.refinedCells,0);
});

test('graded shoulders preserve both return roads, underlay clearance and shared bank seam heights',()=>{
 for(const separation of[30,240]){
  const f=fixture(separation),before=JSON.stringify(f),model=Terrain.build(f.track,f.edges,{groundHeight:f.groundHeight,gradedShoulder:true});
  let supportSamples=0;
  for(let x=20;x<=100;x+=5)for(const center of[0,separation])for(let offset=-2;offset<=2;offset+=.5){
   const y=center+offset,road=model.roadHeight(x,y);if(road===null)continue;
   assert(Math.abs(model.sampleHeight(x,y)-(road-.07))<1e-6,'each road leg keeps its own original height');supportSamples++;
  }
  assert(supportSamples>250);
  const heights=new Map();
  for(const face of model.faces.filter(f=>!['terrain-base','terrain-boundary'].includes(f.kind))){
   const c=face.vertices.reduce((s,p)=>({x:s.x+p.x/3,y:s.y+p.y/3,z:s.z+p.z/3}),{x:0,y:0,z:0}),road=model.roadHeight(c.x,c.y);
   if(road!==null)assert(c.z<=road-.06,'no off-road refinement can lift soil into the road');
   for(const p of face.vertices){assert([p.x,p.y,p.z].every(Number.isFinite));const key=[p.x,p.y].map(v=>Math.round(v*1e5)).join(',');if(heights.has(key))assert(Math.abs(heights.get(key)-p.z)<1e-6);heights.set(key,p.z);}
  }
  assert.equal(JSON.stringify(f),before);assert(model.faces.length<20000,'near-road refinement is bounded');
 }
});

test('standalone grading validates its active field without changing inactive option semantics',()=>{
 const f=fixture(),base={groundHeight:f.groundHeight};
 for(const reliefRoadBlendM of[0,-1,Infinity,1001])assert.throws(()=>Terrain.build(f.track,f.edges,{...base,gradedShoulder:true,reliefRoadBlendM}),/blend/);
 assert.doesNotThrow(()=>Terrain.build(f.track,f.edges,{...base,gradedShoulder:false,reliefRoadBlendM:Infinity}));
 assert.throws(()=>Terrain.build(f.track,f.edges,{groundHeight:()=>NaN,gradedShoulder:true}),/finite/);
});
