'use strict';
const assert=require('node:assert/strict');
const Shadow=require('./shadow-engine.js');
for(const mission of Shadow.missions){
 const lab=new Shadow(mission.id);assert.ok(lab.matches);assert.ok(lab.count>lab.minimum);const before=lab.count,hint=lab.hint();assert.ok(hint);assert.ok(lab.safeRemove(hint.x,hint.y,hint.z));lab.set(hint.x,hint.y,hint.z,0);assert.equal(lab.count,before-1);assert.ok(lab.matches);assert.ok(lab.undo());assert.equal(lab.count,before);
 const solution=lab.minimumSolution();lab.apply(Array.from(solution,(value,index)=>({...lab.coordinates(index),value})));assert.equal(lab.count,lab.minimum);assert.ok(lab.matches);assert.ok(lab.solved);assert.equal(lab.hint(),null);
 const index=lab.voxels.findIndex(Boolean),point=lab.coordinates(index);lab.set(point.x,point.y,point.z,0);assert.ok(!lab.matches);assert.ok(!lab.solved);lab.undo();assert.ok(lab.solved);
 lab.load(mission.id);assert.equal(lab.count,before);assert.equal(lab.undoStack.length,0);
 console.log(mission.name+': projections, safe deletion, exact minimum, damage/undo/reset passed');
}
const free=new Shadow('free');assert.equal(free.count,0);assert.equal(free.set(-1,0,0,1),false);free.set(2,3,4,1);free.set(2,3,7,1);assert.equal(free.front[3*12+2],2);assert.equal(free.side[3*12+4],1);assert.equal(free.side[3*12+7],1);free.set(2,3,4,0);assert.equal(free.front[3*12+2],1);assert.equal(free.side[3*12+4],0);assert.equal(free.solved,false);
// A minimal-by-deletion edge cover can still exceed the true minimum.
const local=new Shadow('free');local.targetFront=new Uint8Array(144);local.targetSide=new Uint8Array(144);for(let i=0;i<3;i++){local.targetFront[i]=1;local.targetSide[i]=1;}local.apply([{x:0,y:0,z:0,value:1},{x:0,y:0,z:1,value:1},{x:1,y:0,z:2,value:1},{x:2,y:0,z:2,value:1}]);assert.ok(local.matches);assert.equal(local.count,4);assert.equal(local.minimum,3);assert.equal(local.hint(),null);assert.equal(local.solved,false);
console.log('Free editing, coincident projection rays, and nonoptimal edge-cover trap passed');
