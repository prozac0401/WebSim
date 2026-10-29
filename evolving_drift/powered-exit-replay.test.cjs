'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Catalog=require('./catalog.js'),Tracks=require('./track.js'),Physics=require('./physics.js'),Fitness=require('./fitness.js');
const fixture=require('./test-fixtures/supra-t21-powered-exit.json');

test('the historical stock Supra exit remains invalid when it crosses the current competition boundary',()=>{
  const vehicle=Catalog.get(fixture.vehicle),track=Tracks.get(fixture.track);
  const bytes=Buffer.alloc(fixture.gene.length*8);
  fixture.gene.forEach((value,index)=>bytes.writeDoubleLE(value,index*8));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fixture.geneHash);
  const result=Physics.evaluateGene(vehicle,track,fixture.gene,{record:true});
  // This historical fixture predates the narrower competition ribbon. Its
  // archived 30m exit must not override current front-contact validity.
  assert.equal(result.valid,false);
  assert.equal(result.status,'offtrack');
  assert.equal(result.score,0);
  const power=Fitness.measurePower(result,track,vehicle),exit=power.bestExit;
  assert.ok(exit.anchored);
  assert.ok(exit.distance>0&&exit.distance<30);
  assert.ok(exit.duration>0&&exit.duration<fixture.expected.duration);
  assert.ok(exit.speedGain>0);
  assert.equal(exit.maxBrake,0);
  assert.ok(exit.meanRearForce>vehicle.physics.massKg*.3);
  assert.ok(exit.meanRearPowerW>100000);
  for(const key of ['start','startTime','entrySpeed'])assert.ok(Math.abs(exit[key]-fixture.expected[key])<1e-7,key);
  assert.ok(result.frames.at(-1).s<fixture.expected.end);
  assert.equal(power.score,0);
  assert.equal(Fitness.rank(vehicle,track,result).score,0);
  assert.equal(power.success,false);
});
