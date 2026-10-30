'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),vm=require('node:vm');
const Build=require('./build-grips.cjs'),Catalog=require('./catalog.js'),Tracks=require('./track.js'),Prepared=require('./prepared-grips.js'),Physics=require('./physics.js'),Genome=require('./genome.js');
function archivedReference(){
 const bundle=JSON.parse(zlib.gunzipSync(fs.readFileSync(require.resolve('./test-results/coarse-line-v1/reproduction-inputs-v1.json.gz'))));
 const context={module:{exports:{}}};vm.runInNewContext(bundle.files['source/evolving_drift/grip-records/kr-kic-t21-kdl-2016-r2--g80-3.5t-rwd.js'],context);
 return JSON.parse(JSON.stringify(context.module.exports));
}
test('offline v2 nonmanual migration requires an exact complete physical replay, never a new fingerprint alone',()=>{
 const vehicle=Catalog.get('g80-3.5t-rwd'),track=Tracks.get('kr-kic-t21-kdl-2016-r2'),pair=Build.plan([vehicle],[track])[0],old=archivedReference();
 const migration=Build.upgradeNonmanualReference(pair,old,{allowBuilderUpdate:true});assert.equal(migration.ok,true,migration.reason);
 const fresh=migration.artifact;assert.equal(fresh.schema,Prepared.SCHEMA);assert.equal(fresh.baseline.gene.length,Genome.LENGTH);
 assert.equal(fresh.baseline.referenceValidation.searchRepeated,false);assert.equal(fresh.baseline.referenceValidation.legacyRecordedTelemetryExact,true);
 for(let i=0;i<Genome.KNOTS;i++)assert.equal(fresh.baseline.gene[i*Genome.STRIDE+Genome.CHANNELS.clutchKick],0);
 assert.deepEqual(fresh.baseline.result,old.baseline.result);assert.notEqual(fresh.payloadHash,old.payloadHash);
 const wrong=structuredClone(old);wrong.baseline.result.time+=1;wrong.payloadHash=Prepared.hash({baseline:wrong.baseline,replay:wrong.replay});
 assert.equal(Build.upgradeNonmanualReference(pair,wrong,{allowBuilderUpdate:true}).ok,false,'changed dynamics cannot be certified by updating a hash');
});
test('MT references and corrupt source payloads cannot enter the nonmanual migration path',()=>{
 const old=archivedReference(),track=Tracks.get('kr-kic-t21-kdl-2016-r2'),original=Physics.evaluateGene;
 Physics.evaluateGene=()=>{throw Error('untrusted source must not simulate');};
 try{
  assert.equal(Build.upgradeNonmanualReference(Build.plan([Catalog.get('gr86-2.4-rz-mt')],[track])[0],old).ok,false);
  assert.equal(Build.upgradeNonmanualReference(Build.plan([Catalog.get('g80-3.5t-rwd')],[track])[0],{...old,payloadHash:'corrupt'}).ok,false);
 }finally{Physics.evaluateGene=original;}
});
