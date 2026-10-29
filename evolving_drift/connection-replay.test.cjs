'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixture=require('./test-fixtures/kic-t21-connection-progress.json');
const Catalog=require('./catalog.js'),Track=require('./track.js'),Prepared=require('./prepared-grips.js');
const Physics=require('./physics.js'),Fitness=require('./fitness.js'),Analysis=require('./connection-analysis.js');
const geneHash=gene=>{const bytes=Buffer.alloc(gene.length*8);gene.forEach((v,i)=>bytes.writeDoubleLE(v,i*8));return crypto.createHash('sha256').update(bytes).digest('hex');};

test('measured valid parent/child genes reproduce partial connection gains without claiming completion',async()=>{
 const vehicle=Catalog.get(fixture.vehicle),track=Track.get(fixture.track),baseline=await Prepared.load(vehicle,track);
 assert.equal(geneHash(baseline.gene),fixture.baselineGeneHash);
 for(const pair of fixture.pairs){
  const measured=[];
  assert.equal(pair.child.parentId,pair.parent.id);
  for(const stored of [pair.parent,pair.child]){
   assert.equal(geneHash(stored.gene),stored.geneHash);
   // Full physical replay, without prefix reuse or fabricated telemetry.
   const raw=Physics.evaluateGene(vehicle,track,Float64Array.from(stored.gene),{record:true});
   assert.equal(raw.valid,true);assert.equal(raw.status,'finished');
   const ranked=Fitness.rank(vehicle,track,raw,raw.frames,{reference:baseline.record});
   const target=Analysis.measure(track,ranked.drift,raw.frames).regions.find(r=>r.id===pair.targetId);
   for(const key of ['coverage','progress','speedRetention'])assert.ok(Math.abs(target[key]-stored.expected[key])<1e-7,stored.id+' '+key);
   assert.ok(Math.abs(ranked.score-stored.expected.score)<1e-7);
   assert.equal(target.complete,false);assert.equal(ranked.drift.fullConnectionCount,0);assert.equal(ranked.drift.straightLinkCount,0);
   measured.push(target);
  }
  assert.ok(measured[1].coverage>measured[0].coverage+.01);
  assert.ok(measured[1].progress>measured[0].progress);
  if(pair.qualifies)assert.ok(measured[1].progress-measured[0].progress>=.01);
 }
});
