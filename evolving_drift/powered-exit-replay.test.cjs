'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Catalog=require('./catalog.js'),Tracks=require('./track.js'),Physics=require('./physics.js'),Fitness=require('./fitness.js');
const fixture=require('./test-fixtures/supra-t21-powered-exit.json');

test('an evolved stock Supra physically accelerates through a continuous 30m corner exit and finishes',()=>{
  const vehicle=Catalog.get(fixture.vehicle),track=Tracks.get(fixture.track);
  const bytes=Buffer.alloc(fixture.gene.length*8);
  fixture.gene.forEach((value,index)=>bytes.writeDoubleLE(value,index*8));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fixture.geneHash);
  const result=Physics.evaluateGene(vehicle,track,fixture.gene,{record:true});
  assert.equal(result.valid,true);
  assert.equal(result.status,'finished');
  const power=Fitness.measure(result,track,vehicle),exit=power.bestExit;
  assert.ok(exit.anchored);
  assert.ok(exit.distance>30);
  assert.ok(exit.duration>1.4);
  assert.ok(exit.speedGain>3);
  assert.equal(exit.maxBrake,0);
  assert.ok(exit.meanRearForce>vehicle.physics.massKg*.3);
  assert.ok(exit.meanRearPowerW>100000);
  for(const key of ['distance','duration','entrySpeed','exitSpeed'])assert.ok(Math.abs(exit[key]-fixture.expected[key])<1e-7,key);
  // A useful powered exit still has not met the separate two-second goal.
  assert.equal(power.success,false);
});
