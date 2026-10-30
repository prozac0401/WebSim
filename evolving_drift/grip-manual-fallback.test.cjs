'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./genome.js'),P=require('./physics.js'),Catalog=require('./catalog.js'),Tracks=require('./track.js');
const B=require('./grip-baseline-builder.cjs'),R=require('./grip-manual-fallback.cjs');
test('rear-lock repair changes smooth ordinary pedals only and ignores power wheelspin',()=>{
  const gene=G.create(),track={length:500};for(let i=0;i<G.KNOTS;i++){gene[i*G.STRIDE+G.CHANNELS.throttle]=.7;gene[i*G.STRIDE+G.CHANNELS.brake]=.3;}
  const before=G.clone(gene),record=[{s:270,time:20,speed:15,wheelSlip:[0,0,.2,.2]},{s:340,time:24,speed:8,wheelSlip:[0,0,-.4,-.1]}],window=R.lockingWindow(record);
  assert.equal(window.sourceS,340);assert.equal(R.lockingWindow(record.slice(0,1)),null);
  const changed=R.controls(gene,track,window,.8,.7);assert.deepEqual(gene,before);
  let differences=0;for(let i=0;i<changed.length;i++){const channel=i%G.STRIDE;if(channel===G.CHANNELS.throttle||channel===G.CHANNELS.brake){assert(changed[i]>=0&&changed[i]<=gene[i]);if(changed[i]!==gene[i])differences++;}else assert.equal(changed[i],gene[i]);}
  assert(differences>10);
  assert.equal(R.repairGrip({physics:{transmissionType:'AT'}},track,[]),null);
});
test('Porter LPG T21 fallback physically resolves observed inside-rear locking without relaxing grip criteria',()=>{
  const v=Catalog.get('porter-lpg-mt'),track=Tracks.get('kr-kic-t21-kdl-2016-r2'),stop=new Error('Captured first failed finished attempt');let seed;
  try{B.buildGripBaseline(v,track,{onAttempt:snapshot=>{seed=snapshot;throw stop;}});}catch(error){if(error!==stop)throw error;}
  assert(seed,'regression source must exercise the measured brake-lock fallback');
  assert(Object.isFrozen(seed)&&Object.isFrozen(seed.gene)&&Object.isFrozen(seed.result.frames[0]));
  assert.throws(()=>{seed.gene[0]=123;},TypeError);assert(seed.result.maxAngle<7);assert(seed.result.peakWheelSlip>=.32);
  const repaired=R.repairGrip(v,track,[seed],{maxEvaluations:6});assert(repaired);
  assert.equal(repaired.result.status,'finished');assert(repaired.result.maxAngle<7);assert(repaired.result.peakWheelSlip<.32);
  assert.equal(repaired.fallback.physicsUnchanged,true);assert.equal(repaired.fallback.gripCriteriaUnchanged,true);
  assert.equal(repaired.result.time,Math.min(...repaired.attempts.filter(a=>a.grip).map(a=>a.time)));
  assert.deepEqual(P.evaluateGene(v,track,repaired.gene),repaired.result);
});
