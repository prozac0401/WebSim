'use strict';
const assert=require('node:assert/strict');
const Shadow=require('./shadow-engine.js');
assert.deepEqual(Shadow.missions.map(mission=>mission.id),['gate','tree','heart','cat','butterfly','rocket','sailboat','castle','key','moon','teapot']);
const silhouettes=new Set();
for(const mission of Shadow.missions){
 const lab=new Shadow(mission.id),initial=lab.voxels.slice();assert.ok(lab.matches);assert.ok(lab.count>lab.minimum);
 for(const target of [lab.targetFront,lab.targetSide]){const signature=target.join('');assert.ok(!silhouettes.has(signature),mission.name+' must have its own silhouettes');silhouettes.add(signature);}
 let minimum=0;for(let y=0;y<lab.n;y++){const front=lab.targetFront.slice(y*lab.n,(y+1)*lab.n).reduce((a,b)=>a+b,0),side=lab.targetSide.slice(y*lab.n,(y+1)*lab.n).reduce((a,b)=>a+b,0);assert.equal(front===0,side===0,mission.name+' rows must be compatible');minimum+=Math.max(front,side);}assert.equal(lab.minimum,minimum);
 const before=lab.count,hint=lab.hint();assert.ok(hint);assert.ok(lab.safeRemove(hint.x,hint.y,hint.z));lab.set(hint.x,hint.y,hint.z,0);assert.equal(lab.count,before-1);assert.ok(lab.matches);assert.ok(lab.undo());assert.deepEqual(lab.voxels,initial);
 const solution=lab.minimumSolution();lab.apply(Array.from(solution,(value,index)=>({...lab.coordinates(index),value})));assert.equal(lab.count,lab.minimum);assert.ok(lab.matches);assert.ok(lab.solved);assert.equal(lab.hint(),null);
 const index=lab.voxels.findIndex(Boolean),point=lab.coordinates(index);lab.set(point.x,point.y,point.z,0);assert.ok(!lab.matches);assert.ok(!lab.solved);lab.undo();assert.ok(lab.solved);
 lab.load(mission.id);assert.deepEqual(lab.voxels,initial);assert.equal(lab.count,before);assert.equal(lab.undoStack.length,0);
 let next;while((next=lab.hint())){lab.set(next.x,next.y,next.z,0);assert.ok(lab.matches);assert.ok(lab.count>=minimum);}assert.ok(lab.count<before);
 console.log(mission.name+': distinct compatible projections, repeated hints, exact minimum, damage/undo/reset passed');
}
assert.throws(()=>new Shadow()._mask(['#']),/12 × 12/);
const free=new Shadow('free');assert.equal(free.count,0);assert.equal(free.set(-1,0,0,1),false);free.set(2,3,4,1);free.set(2,3,7,1);assert.equal(free.front[3*12+2],2);assert.equal(free.side[3*12+4],1);assert.equal(free.side[3*12+7],1);free.set(2,3,4,0);assert.equal(free.front[3*12+2],1);assert.equal(free.side[3*12+4],0);assert.equal(free.solved,false);
// A minimal-by-deletion edge cover can still exceed the true minimum.
const local=new Shadow('free');local.targetFront=new Uint8Array(144);local.targetSide=new Uint8Array(144);for(let i=0;i<3;i++){local.targetFront[i]=1;local.targetSide[i]=1;}local.apply([{x:0,y:0,z:0,value:1},{x:0,y:0,z:1,value:1},{x:1,y:0,z:2,value:1},{x:2,y:0,z:2,value:1}]);assert.ok(local.matches);assert.equal(local.count,4);assert.equal(local.minimum,3);assert.equal(local.hint(),null);assert.equal(local.solved,false);
console.log('Free editing, coincident projection rays, and nonoptimal edge-cover trap passed');
