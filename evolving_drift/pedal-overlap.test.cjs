'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./genome.js'),Strategies=require('./evolution-strategies.js'),Catalog=require('./catalog.js');
const C=G.CHANNELS;
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
// Synthetic completed telemetry isolates the mutation contract. Whether the
// resulting pedals complete and score is decided by the unchanged simulator.
function fixture({overlap=false,vehicle=Catalog.get()}={}){
 const track={length:300,width:14,sample:s=>({s,x:s,y:0,heading:0,curvature:s>=60&&s<=120?.02:s>=190&&s<=250?-.02:0})};
 const zones=[{id:'a',start:45,cornerStart:60,apex:90,exit:120,end:150,sign:1},{id:'b',start:170,cornerStart:190,apex:220,exit:250,end:285,sign:-1}];
 const links=[{id:'a-b',fromZoneId:'a',toZoneId:'b',straightStart:120,straightEnd:190}];
 const gene=G.create();
 for(let k=0;k<G.KNOTS;k++){
  const j=k*G.STRIDE,s=k/127*track.length;gene[j+C.throttle]=.55;gene[j+C.targetSlip]=-.15;gene[j+C.driveSlip]=.2;
  if(overlap&&s>75&&s<115)gene[j+C.brake]=.1*Math.sin(Math.PI*(s-75)/40)**2;
 }
 if(vehicle.physics.transmissionType==='MT'){gene[38*G.STRIDE+C.clutchKick]=1;gene[38*G.STRIDE+C.disengageSec]=.2;}
 const record=Array.from({length:301},(_,s)=>({s,time:s/20,speed:20,x:s,y:0,vx:20,vy:0,yaw:.3,beta:-.3,throttle:G.sample(gene,s,track.length).throttle,brake:G.sample(gene,s,track.length).brake}));
 const parent={id:'completed-parent',accepted:true,gene,record,result:{valid:true,status:'finished',frames:record,score:10},metric:{bestArc:{zoneId:'a',end:110,start:65},links:[]}};
 return {track,vehicle,zones,links,parent};
}
function propose(f,{seed=42,...options}={}){return Strategies.pedalOverlap(f.vehicle,f.track,f.parent,rng(seed),{zones:f.zones,links:f.links,phase:'corner',center:92,...options});}
const changed=(a,b,c)=>Array.from({length:G.KNOTS},(_,k)=>k).filter(k=>a[k*G.STRIDE+c]!==b[k*G.STRIDE+c]);

test('pedal overlap requires an accepted completed valid parent',()=>{
 const f=fixture();
 for(const patch of [{accepted:false},{result:{...f.parent.result,valid:false,status:'offtrack'}},{result:{...f.parent.result,status:'running'}},{result:{...f.parent.result,status:'timeout'}}]){
  assert.throws(()=>Strategies.pedalOverlap(f.vehicle,f.track,{...f.parent,...patch},rng(1)),/completed valid parent/);
 }
 assert.equal(Strategies.pedalOverlap(f.vehicle,f.track,{...f.parent,record:[]},rng(1)),null);
 assert.throws(()=>propose(f,{mode:'unknown'}),/Unknown pedal overlap/);
});

test('all stock transmissions receive deterministic bounded pedal-only mutations without changing inherited controls',()=>{
 const transmissions=new Set();
 for(const vehicle of Catalog.list()){
  transmissions.add(vehicle.physics.transmissionType);
  const f=fixture({vehicle}),before=JSON.stringify(f),a=propose(f,{mode:'create'}),b=propose(f,{mode:'create'});
  assert.ok(a,vehicle.id);assert.deepEqual(a,b);assert.equal(JSON.stringify(f),before);
  assert.equal(a.change.family,'pedal-overlap');assert.equal(a.change.basisCandidateId,f.parent.id);
  assert.equal(a.gene.length,G.LENGTH);assert.notDeepEqual(a.gene,f.parent.gene);
  for(let i=0;i<G.LENGTH;i++){
   assert.ok(Number.isFinite(a.gene[i]));
   if([C.throttle,C.brake].includes(i%G.STRIDE))assert.ok(a.gene[i]>=0&&a.gene[i]<=1);
   else assert.equal(a.gene[i],f.parent.gene[i],`${vehicle.id}: inherited channel ${i%G.STRIDE}`);
  }
 }
 assert.ok(transmissions.has('MT'));assert.ok(transmissions.has('AT'));assert.ok(transmissions.has('DCT'));assert.ok(transmissions.has('EV'));
});

test('new simultaneous pedals use independent timing, strength and ramps over multiple knots',()=>{
 const f=fixture(),a=propose(f,{mode:'create'}),b=propose(f,{mode:'create',seed:145});
 assert.notDeepEqual(a,b);
 const throttle=a.change.throttle,brake=a.change.brake,ds=f.track.length/127;
 assert.notEqual(throttle.start,brake.start);assert.notEqual(throttle.end,brake.end);
 assert.notEqual(throttle.rampIn,brake.rampIn);assert.notEqual(throttle.strength,brake.strength);
 assert.ok(brake.strength>=.02&&brake.strength<=.13,'new overlap starts with modest braking');
 for(const p of [throttle,brake]){
  assert.ok(p.end-p.start>=6*ds);assert.ok(p.rampIn>=1.5*ds);assert.ok(p.rampOut>=1.5*ds);
  assert.ok(Math.abs(p.durationSec-(p.end-p.start)/a.change.referenceSpeed)<1e-12);
  const k=changed(a.gene,f.parent.gene,C[p.channel]);assert.ok(k.length>=5);
  assert.equal(k.at(-1)-k[0]+1,k.length,'smooth support has no isolated interior holes');
  const delta=k.map(i=>Math.abs(a.gene[i*G.STRIDE+C[p.channel]]-f.parent.gene[i*G.STRIDE+C[p.channel]]));
  assert.ok(delta[0]<Math.max(...delta));assert.ok(delta.at(-1)<Math.max(...delta));
  for(let i=0;i<G.KNOTS;i++)if(i*ds<=p.start||i*ds>=p.end)assert.equal(a.gene[i*G.STRIDE+C[p.channel]],f.parent.gene[i*G.STRIDE+C[p.channel]]);
 }
 assert.ok(Array.from({length:G.KNOTS},(_,k)=>k).some(k=>a.gene[k*G.STRIDE+C.throttle]>.15&&a.gene[k*G.STRIDE+C.brake]>.015));
});

test('actual completed entry, corner, link and exit records can each anchor pedal timing',()=>{
 const f=fixture();
 for(const phase of ['entry','corner','link','exit']){
  const a=propose(f,{phase,mode:'create'});assert.ok(a);assert.equal(a.change.phase,phase);
  assert.ok(f.parent.record.some(frame=>frame.s===a.change.anchorS&&frame.speed>=6));
 }
 f.parent.record=f.parent.record.map(frame=>({...frame,speed:0}));
 assert.equal(propose(f,{mode:'create'}),null,'no moving inherited evidence means no synthetic overlap');
});

test('a selected corner only mutates its adjacent links on a multi-corner course',()=>{
 const f=fixture();f.track.length=500;
 f.zones.push({id:'c',start:330,cornerStart:350,apex:380,exit:410,end:450,sign:1});
 f.links.push({id:'b-c',fromZoneId:'b',toZoneId:'c',straightStart:250,straightEnd:350});
 f.parent.record=Array.from({length:501},(_,s)=>({s,time:s/20,speed:20,x:s,y:0,vx:20,vy:0,yaw:.3,beta:-.3,throttle:.55,brake:0}));
 f.parent.result.frames=f.parent.record;
 for(let seed=1;seed<=24;seed++)for(const [zone,link] of [[f.zones[0],f.links[0]],[f.zones[2],f.links[1]]]){
  const child=propose(f,{seed,zone,phase:'link',mode:'create'});
  assert.ok(child);assert.equal(child.change.linkId,link.id);
  assert.ok(child.change.anchorS>=link.straightStart&&child.change.anchorS<=link.straightEnd);
 }
});

test('an inherited course-wide overlap uses only the selected phase as its source',()=>{
 const f=fixture();
 for(let k=0;k<G.KNOTS;k++)f.parent.gene[k*G.STRIDE+C.brake]=.08;
 f.parent.record=f.parent.record.map(frame=>({...frame,brake:.08}));f.parent.result.frames=f.parent.record;
 for(const zone of f.zones)for(const mode of ['strengthen','weaken','shift','duration','remove']){
  const child=propose(f,{zone,phase:'corner',mode});assert.ok(child);
  assert.ok(child.change.sourceS>=zone.cornerStart&&child.change.sourceS<=zone.exit);
  assert.ok(child.change.inherited.start>=zone.cornerStart&&child.change.inherited.end<=zone.exit);
  if(mode==='remove')for(let k=0;k<G.KNOTS;k++)if(k/127*f.track.length<zone.cornerStart||k/127*f.track.length>zone.exit)assert.equal(child.gene[k*G.STRIDE+C.brake],f.parent.gene[k*G.STRIDE+C.brake]);
 }
});

test('inherited overlap can grow, weaken, move, change length and disappear',()=>{
 const f=fixture({overlap:true}),before=Array.from(f.parent.gene);
 for(const mode of ['strengthen','weaken','shift','duration','remove']){
  const child=propose(f,{mode,phase:'corner',zone:f.zones[0]});assert.ok(child,mode);assert.equal(child.change.mode,mode);
  const edits=changed(child.gene,f.parent.gene,C.brake);assert.ok(edits.length>1,mode);
  if(mode==='strengthen')for(const k of edits)assert.ok(child.gene[k*G.STRIDE+C.brake]>f.parent.gene[k*G.STRIDE+C.brake]);
  if(mode==='weaken'||mode==='remove')for(const k of edits)assert.ok(child.gene[k*G.STRIDE+C.brake]<f.parent.gene[k*G.STRIDE+C.brake]);
  if(mode==='shift'||mode==='duration')assert.notEqual(child.change.brake.end-child.change.brake.start,child.change.inherited.end-child.change.inherited.start);
  if(mode==='remove'){
   assert.equal(child.change.throttle,null);assert.ok(edits.every(k=>child.gene[k*G.STRIDE+C.brake]<.03),'full-strength removal clears the observed overlap, with tapered edges');
   assert.ok(edits.some(k=>child.gene[k*G.STRIDE+C.brake]===0));
   assert.deepEqual(changed(child.gene,f.parent.gene,C.throttle),[]);
  }
 }
 assert.deepEqual(Array.from(f.parent.gene),before);
});

test('new overlap preserves heavy inherited braking and does not insert throttle there',()=>{
 const f=fixture();
 for(let k=34;k<=42;k++){f.parent.gene[k*G.STRIDE+C.brake]=.65;f.parent.gene[k*G.STRIDE+C.throttle]=.02;}
 const a=propose(f,{mode:'create'});assert.ok(a);
 for(let k=34;k<=42;k++)for(const c of [C.throttle,C.brake])assert.equal(a.gene[k*G.STRIDE+c],f.parent.gene[k*G.STRIDE+c]);
});

test('ordinary power candidates may retain an inherited overlap or explore its release',()=>{
 const f=fixture({overlap:true}),kept=[],released=[];
 for(let seed=1;seed<=50;seed++){
  const child=Strategies.adaptive(f.vehicle,f.track,f.parent,rng(seed),{family:'power',zones:f.zones,links:f.links,zone:f.zones[0]});
  if(child.change.preservedPedalOverlap>0)kept.push(child);else released.push(child);
 }
 assert.ok(kept.length>0);assert.ok(released.length>0);
 const evidence=Strategies.pedalEvidence(f.track,f.parent);
 for(const child of kept)for(let k=0;k<G.KNOTS;k++){
  const j=k*G.STRIDE,s=k/127*f.track.length;if(evidence.overlapEpisodes.some(e=>s>=e.start&&s<=e.end)&&f.parent.gene[j+C.throttle]>.12&&f.parent.gene[j+C.brake]>.015&&child.gene[j+C.throttle]>.12)assert.ok(child.gene[j+C.brake]>=f.parent.gene[j+C.brake]);
 }
 assert.ok(released.some(child=>changed(child.gene,f.parent.gene,C.brake).length>0));
});

test('overlap retention only restores reductions of actual inherited two-pedal inputs',()=>{
 const f=fixture({overlap:true}),child=G.clone(f.parent.gene);
 for(let k=0;k<G.KNOTS;k++)child[k*G.STRIDE+C.brake]=0;
 const count=Strategies.preservePedalOverlap(f.parent.gene,child,()=>0,.45,{track:f.track,parent:f.parent});assert.ok(count>0);
 for(let k=0;k<G.KNOTS;k++)if(f.parent.gene[k*G.STRIDE+C.brake]===0)assert.equal(child[k*G.STRIDE+C.brake],0);
 const plain=fixture(),noOverlap=G.clone(plain.parent.gene);
 assert.equal(Strategies.preservePedalOverlap(plain.parent.gene,noOverlap,()=>0),0);assert.deepEqual(noOverlap,plain.parent.gene);
});

test('pure grip overlap does not qualify or consume RNG for a dedicated or preservation proposal',()=>{
 const f=fixture({overlap:true});
 f.parent.record=f.parent.record.map(frame=>({...frame,beta:0,yaw:0}));f.parent.result.frames=f.parent.record;
 let draws=0;const random=()=>{draws++;return .1;},child=G.clone(f.parent.gene);
 for(let k=0;k<G.KNOTS;k++)child[k*G.STRIDE+C.brake]=0;
 assert.equal(Strategies.hasPedalEvidence(f.track,f.parent),false);
 assert.equal(Strategies.pedalOverlap(f.vehicle,f.track,f.parent,random,{zones:f.zones,links:f.links}),null);
 assert.equal(Strategies.preservePedalOverlap(f.parent.gene,child,random,.45,{track:f.track,parent:f.parent}),0);
 assert.equal(draws,0);assert.equal(Strategies.pedalEvidence(f.track,f.parent).overlapEpisodes.length,0);
});

test('evidence requires sustained actual earning and uses the prepared reference pace',()=>{
 const run=map=>{const f=fixture({overlap:true});f.parent.record=f.parent.record.map(map);f.parent.result.frames=f.parent.record;return f;};
 for(const f of [run(frame=>({...frame,beta:frame.s>=90&&frame.s<92?-.3:0})),run(frame=>({...frame,speed:7})),run(frame=>({...frame,beta:1.4}))])assert.equal(Strategies.hasPedalEvidence(f.track,f.parent),false);
 const f=fixture({overlap:true}),evidence=Strategies.pedalEvidence(f.track,f.parent);
 assert.ok(evidence.episodes.length);assert.ok(evidence.overlapEpisodes.length);
 assert.ok(evidence.episodes.every(e=>e.distance>=4&&e.duration>=.15));
 assert.equal(Strategies.pedalEvidence(f.track,f.parent),evidence,'immutable replay evidence is cached');
 f.parent.result.drift={};
 // Use the scorer's public pace shape rather than a hand-authored cache key.
 f.parent.result.drift.referencePace=require('./course-scoring.js').paceProfile(f.track,f.parent.record.map(frame=>({...frame,speed:100})));
 assert.equal(Strategies.hasPedalEvidence(f.track,f.parent),false,'20m/s is below the unchanged reference speed floor');
 assert.notEqual(Strategies.pedalEvidence(f.track,f.parent),evidence,'a different reference pace invalidates the cached evidence');
});

test('observed earning bounds regional mutation and preservation instead of genome targets',()=>{
 const f=fixture({overlap:true});
 f.parent.record=f.parent.record.map(frame=>({...frame,beta:frame.s>=75&&frame.s<=110?-.3:0,brake:frame.s>=88&&frame.s<=100?.08:0}));f.parent.result.frames=f.parent.record;
 assert.equal(Strategies.hasPedalEvidence(f.track,f.parent,f.zones[0]),true);
 assert.equal(Strategies.hasPedalEvidence(f.track,f.parent,f.zones[1]),false);
 let draws=0;
 assert.equal(Strategies.pedalOverlap(f.vehicle,f.track,f.parent,()=>{draws++;return .1;},{zones:f.zones,links:f.links,zone:f.zones[1],phase:'corner'}),null);assert.equal(draws,0);
 const child=G.clone(f.parent.gene);for(let k=0;k<G.KNOTS;k++)child[k*G.STRIDE+C.brake]=0;
 assert.ok(Strategies.preservePedalOverlap(f.parent.gene,child,()=>0,.45,{track:f.track,parent:f.parent})>0);
 for(let k=0;k<G.KNOTS;k++)if(k/127*f.track.length<87||k/127*f.track.length>100)assert.equal(child[k*G.STRIDE+C.brake],0);
});
