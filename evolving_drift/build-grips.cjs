#!/usr/bin/env node
/* Offline build: enumerate the entire vehicle x track matrix, rebuild stale pairs. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Resolve derived geometry before loading the track registry. Browser startup
// never runs either generator; the watcher invokes this same offline command.
if(require.main===module&&!process.argv.includes('--pair'))require('node:child_process').execFileSync(process.execPath,
  [path.join(__dirname,'build-courses.cjs'),...(process.argv.includes('--check')?['--check']:[])],{stdio:'inherit',windowsHide:true});
const Catalog=require('./catalog.js'),Tracks=require('./track.js'),Prepared=require('./prepared-grips.js'),Builder=require('./grip-baseline-builder.cjs'),Physics=require('./physics.js');
const {isDeepStrictEqual}=require('node:util');
const root=__dirname,manifestPath=path.join(root,'prepared-grips-manifest.js');
function builderFingerprint(){return crypto.createHash('sha256').update(['grip-baseline-builder.cjs','grip-line.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')).join('\n')).digest('hex');}
function plan(vehicles,tracks,existing={},builder=builderFingerprint()){
  const pairs=[];for(const track of tracks)for(const vehicle of vehicles){
    const key=Prepared.key(vehicle,track),fingerprint=Prepared.fingerprint(vehicle,track),old=existing[key];
    pairs.push({key,vehicle,track,fingerprint,builder,path:'grip-records/'+encodeURIComponent(track.id)+'--'+encodeURIComponent(vehicle.id)+'.js',
      stale:!old||old.fingerprint!==fingerprint||old.builder!==builder});
  }return pairs;
}
function encodeReplay(frames){
  const stride=Prepared.fields.length+12,buffer=Buffer.alloc(frames.length*stride*8);let offset=0;
  for(const frame of frames){const values=[...Prepared.fields.map(name=>frame[name]),...frame.wheelOmega,...frame.wheelSlip,...Array.from({length:4},(_,i)=>frame.wheelForces[i]?.alpha||0)];for(const n of values){if(!Number.isFinite(n))throw Error('Nonfinite replay value');buffer.writeDoubleLE(n,offset);offset+=8;}}
  return {encoding:'float64-le',stride,count:frames.length,values:buffer.toString('base64')};
}
function moduleText(name,value){const json=JSON.stringify(value);return `/* Generated offline by build-grips.cjs. Do not hand-edit. */\n(function(root){const value=${json};if(typeof module!=='undefined'&&module.exports)module.exports=value;else ${name==='manifest'?'root.DriftPreparedGripsManifest=value':'root.DriftPreparedGrips.register(value)'};})(typeof window==='undefined'?globalThis:window);\n`;}
function writeAtomic(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,text);fs.renameSync(temp,file);}
function readModule(file){delete require.cache[require.resolve(file)];return require(file);}
// Explicit offline migration for validation-only model changes. A matching
// replay proves this reference still follows precisely the saved trajectory;
// it does not claim that the old path/speed search was repeated or is optimal.
// Never publish a new identity by merely replacing a stale fingerprint.
function revalidateArtifact(pair,asset){
  const format=value=>value?.genomeVersion===Prepared.GENOME_VERSION&&value?.stride===Prepared.STRIDE&&value?.knots===Prepared.KNOTS;
  const reject=reason=>({ok:false,reason});
  if(asset?.schema!==Prepared.SCHEMA||!format(asset)||!format(asset.baseline)||asset.key!==pair.key)return reject('record format or pair mismatch');
  if(asset.builder!==pair.builder)return reject('offline search implementation changed');
  if(asset.payloadHash!==Prepared.hash({baseline:asset.baseline,replay:asset.replay}))return reject('record payload is corrupt');
  const source=asset.baseline;
  if(!Array.isArray(source.gene)||source.gene.length!==Prepared.KNOTS*Prepared.STRIDE||source.gene.some(n=>!Number.isFinite(n)))return reject('invalid genome');
  if(!source.result?.valid||source.result.status!=='finished')return reject('source reference did not finish');
  const evaluated=Physics.evaluateGene(pair.vehicle,pair.track,Float64Array.from(source.gene),{record:true});
  if(!evaluated.valid||evaluated.status!=='finished'||evaluated.maxAngle>=7||evaluated.peakWheelSlip>=.32)return reject('current physics rejected the saved grip reference');
  const {frames,...result}=evaluated,replay=encodeReplay(frames);
  if(!isDeepStrictEqual(result,source.result))return reject('physical result changed');
  if(!isDeepStrictEqual(replay,asset.replay))return reject('recorded trajectory or telemetry changed');
  const baseline={...source,result,referenceValidation:{method:'exact-replay-current-physics',previousFingerprint:asset.fingerprint,previousPayloadHash:asset.payloadHash,
    frames:frames.length,physicalResultExact:true,recordedTelemetryExact:true,genePreserved:true,searchRepeated:false}};
  const artifact={...asset,fingerprint:pair.fingerprint,builder:pair.builder,baseline,replay};
  artifact.payloadHash=Prepared.hash({baseline,replay});
  return {ok:true,artifact};
}
function build({check=false,all=false,development=false,pairKey=null,revalidateExisting=false}={}){
  if(revalidateExisting&&(check||all))throw Error('--revalidate-existing cannot be combined with --check or --all.');
  const tracks=Tracks.list({includeDevelopment:development});
  if(!tracks.length){
    console.error('NOT READY: 검증된 실전 코스 0개. 국내 대회 코스 고증 중이며 배포용 기준 기록은 준비되지 않았습니다.');
    console.error('개발용 가상 코스만 검사하려면 --development를 명시하세요.');
    return {ready:false,scope:'production',total:0,generated:0};
  }
  let old={},oldManifest=null;if(fs.existsSync(manifestPath)){oldManifest=readModule(manifestPath);old=oldManifest.entries||{};}
  // A production-only refresh must not remove the separately prepared fixture
  // records from the shared manifest. Their freshness is checked in dev scope.
  const fixtures=new Set(Tracks.list({includeDevelopment:true}).filter(t=>t.kind==='development').map(t=>t.id));
  const matrix=plan(Catalog.list(),tracks,old),pairs=pairKey?matrix.filter(pair=>pair.key===pairKey):matrix;
  if(pairKey&&!pairs.length)throw Error('Unknown vehicle/track pair: '+pairKey);
  const entries=development?{}:Object.fromEntries(Object.entries(old).filter(([key])=>fixtures.has(key.split('/')[0]))),stale=[];let generated=0,revalidated=0;
  for(const pair of pairs){
    // An interrupted matrix build may have complete, valid pair artifacts but
    // an old manifest. Reuse those artifacts and finish the manifest offline;
    // do not repeat already validated vehicle simulations on the next run.
    const file=path.join(root,pair.path);let dirty=all||!fs.existsSync(file),asset=null;
    if(!dirty){try{asset=readModule(file);dirty=asset.schema!==Prepared.SCHEMA||asset.genomeVersion!==Prepared.GENOME_VERSION||asset.stride!==Prepared.STRIDE||asset.knots!==Prepared.KNOTS||asset.fingerprint!==pair.fingerprint||asset.builder!==pair.builder||asset.payloadHash!==Prepared.hash({baseline:asset.baseline,replay:asset.replay});}catch(e){dirty=true;}}
    if(check&&(dirty||pair.stale||oldManifest?.schema!==Prepared.SCHEMA||oldManifest?.genomeVersion!==Prepared.GENOME_VERSION||oldManifest?.stride!==Prepared.STRIDE||oldManifest?.knots!==Prepared.KNOTS)){stale.push(pair.key);continue;}
    if(dirty&&revalidateExisting&&asset){
      const start=Date.now(),validation=revalidateArtifact(pair,asset);
      if(validation.ok){writeAtomic(file,moduleText('record',validation.artifact));dirty=false;revalidated++;console.log('Revalidated '+pair.key+' · exact saved replay · '+(Date.now()-start)+' ms');}
      else console.log('Revalidation requires a new search for '+pair.key+': '+validation.reason);
    }
    if(dirty){
      console.log('Simulating '+pair.key);const start=Date.now(),baseline=Builder.buildGripBaseline(pair.vehicle,pair.track,{knots:Prepared.KNOTS});
      if(!baseline.result.valid||baseline.result.status!=='finished'||baseline.result.maxAngle>=7||baseline.result.peakWheelSlip>=.32)throw Error('No valid grip reference: '+pair.key);
      const {frames,...result}=baseline.result,{record,gene,...metadata}=baseline;
      const artifact={schema:Prepared.SCHEMA,genomeVersion:Prepared.GENOME_VERSION,stride:Prepared.STRIDE,knots:Prepared.KNOTS,key:pair.key,fingerprint:pair.fingerprint,builder:pair.builder,
        baseline:{...metadata,gene:Array.from(gene),result},replay:encodeReplay(record||frames)};
      artifact.payloadHash=Prepared.hash({baseline:artifact.baseline,replay:artifact.replay});writeAtomic(file,moduleText('record',artifact));generated++;
      console.log('Prepared '+pair.key+' · '+result.time.toFixed(3)+' s · '+(Date.now()-start)+' ms');
    }
    entries[pair.key]={path:pair.path,fingerprint:pair.fingerprint,builder:pair.builder};
  }
  if(stale.length)throw Error('Missing or stale grip references:\n'+stale.join('\n')+'\nRun: node evolving_drift/build-grips.cjs'+(development?' --development':''));
  // Independent --pair subprocesses own only their pair asset. One final
  // matrix pass verifies all artifacts and publishes the manifest atomically.
  if(!check&&!pairKey)writeAtomic(manifestPath,moduleText('manifest',{schema:Prepared.SCHEMA,genomeVersion:Prepared.GENOME_VERSION,stride:Prepared.STRIDE,knots:Prepared.KNOTS,entries}));
  const competitionTracks=tracks.filter(t=>t.verifiedCompetition===true).length,developmentTracks=tracks.filter(t=>t.kind==='development').length;
  console.log(`${competitionTracks} verified competition tracks; ${developmentTracks} development fixtures. ${pairs.length} vehicle/track pairs ready; ${generated} generated; ${revalidated} exact replays revalidated.`);
  return {ready:true,scope:development?'development':'production',total:pairs.length,generated,revalidated};
}
module.exports={plan,build,encodeReplay,builderFingerprint,revalidateArtifact};
if(require.main===module){try{const pairIndex=process.argv.indexOf('--pair'),pairKey=pairIndex<0?null:process.argv[pairIndex+1];if(pairIndex>=0&&(!pairKey||pairKey.startsWith('--')))throw Error('--pair requires a registered track/vehicle key.');const result=build({check:process.argv.includes('--check'),all:process.argv.includes('--all'),development:process.argv.includes('--development'),revalidateExisting:process.argv.includes('--revalidate-existing'),pairKey});if(!result.ready)process.exitCode=2;}catch(error){console.error(error.message);process.exitCode=1;}}
