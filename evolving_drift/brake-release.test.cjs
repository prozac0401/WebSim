'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Catalog=require('./catalog.js'),Tracks=require('./track.js'),Physics=require('./physics.js');
const Prepared=require('./prepared-grips.js'),Strategies=require('./evolution-strategies.js'),G=require('./genome.js');
const fixture=require('./test-fixtures/g80-kic-inherited-brake.json'),C=G.CHANNELS;

test('a completed G80 parent can evolve away inherited braking after an earlier drift slowed its arrival',async()=>{
 const vehicle=Catalog.get(fixture.vehicle),track=Tracks.get(fixture.track),baseline=await Prepared.load(vehicle,track);
 const bytes=Buffer.alloc(fixture.gene.length*8);fixture.gene.forEach((v,i)=>bytes.writeDoubleLE(v,i*8));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fixture.geneHash);
 const before=Physics.evaluateGene(vehicle,track,fixture.gene),regions=Strategies.zones(track);
 assert.equal(before.valid,true);assert.equal(before.status,'finished');
 const minimum=run=>Math.min(...run.frames.filter(f=>f.s>=300&&f.s<=400).map(f=>f.speed))*3.6;
 assert.ok(minimum(before)>4&&minimum(before)<5,'historical parent crawls through the second corner despite completing');
 const parent={id:fixture.id,accepted:true,gene:fixture.gene,record:before.frames,result:before,metric:{bestArc:null}};
 const proposal=Strategies.adaptive(vehicle,track,parent,()=>0,{family:'brake-release',zone:regions[1],zones:regions,referenceRecord:baseline.record});
 assert.ok(Strategies.FAMILIES.includes('brake-release'));
 assert.equal(proposal.change.family,'brake-release');assert.equal(proposal.change.source,'valid-slowdown');
 assert.equal(proposal.change.basisCandidateId,fixture.id);
 assert.ok(proposal.change.slowdown.retention<.2);
 assert.ok(proposal.change.start>regions[0].exit&&proposal.change.start<320);
 assert.ok(proposal.change.end>350&&proposal.change.end<370);
 let changedBrakes=0;
 proposal.gene.forEach((value,i)=>{
  if(![C.brake,C.throttle].includes(i%G.STRIDE))assert.equal(value,fixture.gene[i],'steering, gearing and attitude targets stay inherited');
  if(i%G.STRIDE===C.brake){assert.ok(value<=fixture.gene[i]);if(value<fixture.gene[i])changedBrakes++;}
 });
 assert.ok(changedBrakes>0);
 const after=Physics.evaluateGene(vehicle,track,proposal.gene);
 assert.equal(after.valid,true);assert.equal(after.status,'finished','strict road/collision/spin validation still applies');
 assert.ok(minimum(after)>23,'the same vehicle and physics no longer crawl at 4.3km/h');
 assert.ok(after.time<before.time);
});

test('brake release needs a measured speed deficit and braking in the same corner approach',()=>{
 const vehicle=Catalog.get(),track=Tracks.get(fixture.track),regions=Strategies.zones(track),gene=G.create();
 for(let i=0;i<G.KNOTS;i++){gene[i*G.STRIDE+C.throttle]=.4;gene[i*G.STRIDE+C.brake]=.2;}
 const reference=Array.from({length:586},(_,s)=>({s,speed:20,x:s,y:0,vx:20,vy:0,yaw:0}));
 const run=record=>Strategies.adaptive(vehicle,track,{id:'valid',accepted:true,gene,record,result:{valid:true,status:'finished',frames:record},metric:{bestArc:null}},()=>.2,
  {family:'brake-release',zone:regions[1],zones:regions,referenceRecord:reference});
 const noDeficit=run(reference.map(f=>({...f,brake:.2})));
 assert.notEqual(noDeficit.change.source,'valid-slowdown');
 const earlierBrakeOnly=run(reference.map(f=>({...f,speed:f.s>340&&f.s<360?3:20,brake:f.s<260?.2:0})));
 assert.notEqual(earlierBrakeOnly.change.source,'valid-slowdown','an unrelated previous-corner brake is not labeled the current braking episode');
});

test('already released pedals fall back locally without inserting a brake or repeating the parent',()=>{
 const vehicle=Catalog.get(),track=Tracks.get(fixture.track),gene=G.create();
 for(let i=0;i<G.KNOTS;i++)gene[i*G.STRIDE+C.throttle]=1;
 const record=Array.from({length:586},(_,s)=>({s,speed:20,x:s,y:0,vx:20,vy:0,yaw:0}));
 const parent={accepted:true,gene,record,result:{valid:true,status:'finished',frames:record}};
 const proposal=Strategies.repair(vehicle,track,parent,()=>.5,{family:'brake-release',diagnosis:{candidateId:'failed',origin:{s:340},window:{startS:310,endS:360}}});
 assert.ok(proposal.gene.some((value,i)=>value!==gene[i]));
 assert.equal(proposal.change.fallbackFrom,'brake-release');assert.notEqual(proposal.change.family,'brake-release');
 proposal.gene.forEach((value,i)=>{if(i%G.STRIDE===C.brake)assert.equal(value,0);});
});
