'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const RunFile=require('./run-file.js'),Genome=require('./genome.js'),Prepared=require('./prepared-grips.js'),Catalog=require('./catalog.js'),Track=require('./track.js');
const vehicle=Catalog.get('porter-lpg-mt'),track=Track.get();
const entry={id:'g12-7',generation:12,gene:Genome.create(),result:{status:'finished',valid:true,score:15.123456789,time:36.42}};
const options=()=>({vehicle,track,entry,seed:37,createdAt:'2026-10-31T01:02:03.000Z'});
const fixture=RunFile.create(options()),make=()=>JSON.parse(JSON.stringify(fixture));
const signed=payload=>{const {contentHash,...body}=payload;return JSON.stringify({...body,contentHash:Prepared.hash(body)});};
const rejected=(payload,code)=>assert.throws(()=>RunFile.parse(signed(payload)),error=>error.code===(code||'run-file-invalid'));

test('one-run export round trips independent pedal controls without serializing frames or state',()=>{
 const saved=make();saved.genome.values[Genome.CHANNELS.throttle]=.372451236435;
 saved.genome.values[Genome.CHANNELS.brake]=.182443345346;saved.genome.values[Genome.CHANNELS.clutchKick]=1;
 const loaded=RunFile.parse(signed(saved));
 assert.equal(loaded.vehicle.id,vehicle.id);assert.equal(loaded.track.id,track.id);assert.equal(loaded.seed,37);
 assert.equal(loaded.sourceId,entry.id);assert.equal(loaded.sourceGeneration,12);assert.equal(loaded.genomeVersion,Genome.VERSION);
 assert.ok(loaded.gene instanceof Float64Array);assert.deepEqual(Array.from(loaded.gene),saved.genome.values);
 assert.equal(loaded.result,undefined);assert.equal(loaded.record,undefined);assert.equal(loaded.accepted,undefined);
 assert.equal(saved.record,undefined);assert.equal(saved.result,undefined);assert.equal(saved.runtimeIdentity,undefined);
 assert.ok(Buffer.byteLength(JSON.stringify(saved))<RunFile.MAX_BYTES);
});

test('save snapshots the selected entry and does not replace it with any champion',()=>{
 const selected={...entry,gene:Genome.create()},payload=RunFile.create({...options(),entry:selected});
 selected.gene[1]=1;selected.result={...selected.result,score:999};
 assert.equal(payload.genome.values[1],0);assert.equal(payload.summary.score,15.123456789);
 const loaded=RunFile.parse(JSON.stringify(payload));loaded.gene[1]=.5;
 assert.equal(payload.genome.values[1],0);assert.equal(selected.gene[1],1);
});

test('failed replay can be saved but never produces an accepted result on import',()=>{
 const saved=RunFile.create({...options(),entry:{...entry,result:{status:'offtrack',valid:false,score:0,time:12.5}}});
 const loaded=RunFile.parse(JSON.stringify(saved));
 assert.deepEqual(loaded.summary,{status:'offtrack',valid:false,score:0,time:12.5});assert.equal(loaded.result,undefined);
 // Even a recomputed checksum and forged score remain informational metadata.
 saved.summary={status:'finished',valid:true,score:1e100,time:1};
 const forged=RunFile.parse(signed(saved));assert.equal(forged.result,undefined);assert.equal(forged.accepted,undefined);
});

test('actual prepared MT and AT genomes remain exact after portable JSON round trip',async()=>{
 for(const id of ['porter-lpg-mt','supra-3.0t-rz']){
  const v=Catalog.get(id),baseline=await Prepared.load(v,track),text=RunFile.stringify({...options(),vehicle:v,entry:{...baseline,id:'baseline',generation:0}});
  const restored=RunFile.parse(text);assert.deepEqual(restored.gene,baseline.gene);assert.equal(restored.vehicle.id,id);
 }
});

test('malformed, oversized, nested and non-finite payloads fail before import',()=>{
 for(const text of ['',null,'[]','null','{"format":','x'.repeat(RunFile.MAX_BYTES+1),'"'+'한'.repeat(Math.floor(RunFile.MAX_BYTES/2))+'"'])assert.throws(()=>RunFile.parse(text));
 for(const values of [[],new Array(Genome.LENGTH).fill(null),new Array(Genome.LENGTH).fill('0'),new Array(Genome.LENGTH).fill({value:0})])rejected({...make(),genome:{...make().genome,values}});
 const infinite=JSON.stringify(make()).replace('0.25','1e999');assert.throws(()=>RunFile.parse(infinite));
 const unknown=make();unknown.result={valid:true,score:999};rejected(unknown);
 const nested=make();nested.source.id={deep:{unexpected:true}};rejected(nested);
});

test('format, genome schema, ids and seed are strictly checked',()=>{
 for(const version of [0,2,'1'])rejected({...make(),version},'run-file-version');
 rejected({...make(),format:'other-run'},'run-file-version');
 for(const patch of [{version:2},{knots:127},{stride:3}])rejected({...make(),genome:{...make().genome,...patch}},'run-file-genome');
 for(const variantId of ['missing-rwd','../supra'])rejected({...make(),variantId},'run-file-selection');
 rejected({...make(),trackId:'no-event'},'run-file-selection');
 for(const seed of [0,-1,2.5,2147483647,'37'])rejected({...make(),seed});
 for(const generation of [-1,1.5,Number.MAX_SAFE_INTEGER+1])rejected({...make(),source:{id:'run',generation}});
 rejected({...make(),source:{id:'x'.repeat(81),generation:0}});
});

test('edited values require a matching checksum and remain subject to physical control bounds',()=>{
 const damaged=make();damaged.genome.values[1]=.25;
 assert.throws(()=>RunFile.parse(JSON.stringify(damaged)),error=>error.code==='run-file-checksum');
 for(const [channel,value] of [[Genome.CHANNELS.throttle,1.01],[Genome.CHANNELS.brake,-.1],[Genome.CHANNELS.steer,1],[Genome.CHANNELS.gearHold,7],[Genome.CHANNELS.gearHold,2.5],[Genome.CHANNELS.clutchKick,.5],[Genome.CHANNELS.lineOffset,Genome.DESCRIPTORS[Genome.CHANNELS.lineOffset].max+1]]){
  const data=make();data.genome.values[channel]=value;rejected(data);
 }
});

test('file parsing leaves exact course corridor validation to the staging worker',()=>{
 const saved=make();saved.genome.values[Genome.CHANNELS.lineOffset]=999;
 const loaded=RunFile.parse(signed(saved));assert.equal(loaded.gene[Genome.CHANNELS.lineOffset],999);
 // Parsing neither clamps controls nor substitutes a different trajectory.
 assert.equal(loaded.result,undefined);
});

test('model and scoring incompatibility is rejected; source generation is not a continuation checkpoint',()=>{
 for(const field of ['modelFingerprint','scoringFingerprint']){
  const saved=make();saved.compatibility[field]='0123456789abcdef';rejected(saved,'run-file-incompatible');
 }
 const loaded=RunFile.parse(JSON.stringify(make()));assert.equal(loaded.generation,undefined);assert.equal(loaded.population,undefined);assert.equal(loaded.sourceGeneration,12);
});

test('development course import is explicit and cannot leak into normal course selection',()=>{
 const saved=RunFile.create({...options(),track:Track.create()});
 assert.throws(()=>RunFile.parse(JSON.stringify(saved)),error=>error.code==='run-file-selection');
 assert.equal(RunFile.parse(JSON.stringify(saved),{includeDevelopment:true}).track.id,Track.DEVELOPMENT_ID);
});

test('compatibility normalizes line endings and ignores presentation-only release tags',()=>{
 const source=fs.readFileSync(require.resolve('./run-file.js'),'utf8');
 function inContext(signature,release){const context=vm.createContext({DriftGenome:Genome,DriftPreparedGrips:Prepared,DriftFitness:{signature:()=>signature},DriftCatalog:Catalog,DriftTrack:Track,DriftRuntime:{RELEASE:release}});vm.runInContext(source,context);return context.DriftRunFile.compatibility(vehicle,track);}
 const a=inContext('first\r\nsecond','old-release'),b=inContext('first\nsecond','new-release');
 assert.equal(a.modelFingerprint,b.modelFingerprint);assert.equal(a.scoringFingerprint,b.scoringFingerprint);
});

test('export validation has no physics evaluation side effect and filenames contain no paths',()=>{
 const Physics=require('./physics.js'),evaluate=Physics.evaluateGene;Physics.evaluateGene=()=>{throw Error('must not simulate during save/parse');};
 try{RunFile.parse(RunFile.stringify(options()));}finally{Physics.evaluateGene=evaluate;}
 const filename=RunFile.filename({variantId:'../../car',trackId:'<course>',source:{id:'g1/2\\3'}});
 assert.ok(filename.endsWith('.json'));assert.ok(!/[\\/<>]/.test(filename));
});
