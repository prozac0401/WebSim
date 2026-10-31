/* Portable controls for one replay. Imported scores and frames are never used
 * as simulation evidence: the receiving session evaluates the controls again. */
(function(root){
 'use strict';
 const node=typeof module!=='undefined'&&module.exports;
 const Genome=root.DriftGenome||(node?require('./genome.js'):null);
 const Prepared=root.DriftPreparedGrips||(node?require('./prepared-grips.js'):null);
 const Fitness=root.DriftFitness||(node?require('./fitness.js'):null);
 const Catalog=root.DriftCatalog||(node?require('./catalog.js'):null);
 const Track=root.DriftTrack||(node?require('./track.js'):null);
 const FORMAT='websim-drift-run',VERSION=1,MAX_BYTES=1024*1024;
 const fail=(message,code='run-file-invalid')=>Object.assign(new Error(message),{code});
 const invalid=()=>fail('주행 파일이 손상되었거나 지원하지 않는 형식입니다.');
 const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
 function keys(value,expected){if(!plain(value)||Object.keys(value).length!==expected.length||expected.some(key=>!Object.prototype.hasOwnProperty.call(value,key)))throw invalid();}
 function short(value,max,empty=false){return typeof value==='string'&&value.length<=max&&(empty||value.length>0);}
 function seedValue(value){if(!Number.isInteger(value)||value<1||value>2147483646)throw fail('주행 파일의 진화 시드가 올바르지 않습니다.');return value;}
 function compatibility(vehicle,track){return {modelFingerprint:Prepared.fingerprint(vehicle,track),scoringFingerprint:Prepared.hash(Fitness.signature().replace(/\r\n/g,'\n'))};}
 function validateGene(values,vehicle,track){
  if(!Array.isArray(values)||values.length!==Genome.LENGTH||values.some(value=>typeof value!=='number'||!Number.isFinite(value)))throw fail('주행 파일의 유전자 값이 올바르지 않습니다.');
  const physics=vehicle.physics||vehicle,gene=Float64Array.from(values);
  // The staging worker checks the exact road corridor before accepting a
  // loaded run. Building all corridor bounds here would block the UI merely
  // to download a replay that was already validated by the evolution engine.
  const normalized=Genome.normalize(gene,{maxSteerRad:physics.maxSteer,gearCount:physics.gearRatios?.length||8});
  if(normalized.some((value,index)=>value!==gene[index]))throw fail('주행 파일의 조작값이 유전자·차량의 허용 범위를 벗어났습니다.');
  return gene;
 }
 function validateSummary(summary){
  keys(summary,['status','valid','score','time']);
  if(!short(summary.status,40)||typeof summary.valid!=='boolean'||!(summary.score===null||typeof summary.score==='number'&&Number.isFinite(summary.score))||!(summary.time===null||typeof summary.time==='number'&&Number.isFinite(summary.time)&&summary.time>=0))throw invalid();
 }
 function create({vehicle,track,entry,seed=37,createdAt=new Date().toISOString()}={}){
  if(!vehicle?.id||!track?.id||!entry?.gene)throw fail('저장할 리플레이가 없습니다.');
  const gene=validateGene(Array.from(entry.gene),vehicle,track),result=entry.result||{};
  const source={id:String(entry.id||'saved-run').trim().slice(0,80)||'saved-run',generation:Number.isSafeInteger(entry.generation)&&entry.generation>=0?entry.generation:0};
  const summary={status:String(result.status||'unknown').slice(0,40),valid:result.valid===true,score:Number.isFinite(result.score)?result.score:null,time:Number.isFinite(result.time)&&result.time>=0?result.time:null};
  if(!short(createdAt,40)||!Number.isFinite(Date.parse(createdAt)))throw invalid();
  const payload={format:FORMAT,version:VERSION,createdAt,variantId:vehicle.id,trackId:track.id,seed:seedValue(seed),source,
   genome:{version:Genome.VERSION,knots:Genome.KNOTS,stride:Genome.STRIDE,values:Array.from(gene)},compatibility:compatibility(vehicle,track),summary};
  return {...payload,contentHash:Prepared.hash(payload)};
 }
 function stringify(options){return JSON.stringify(create(options),null,2)+'\n';}
 function parse(text,{includeDevelopment=false}={}){
  if(typeof text!=='string'||text.length>MAX_BYTES||new TextEncoder().encode(text).byteLength>MAX_BYTES)throw fail('주행 파일은 1 MB 이하의 JSON 파일이어야 합니다.','run-file-size');
  let data;try{data=JSON.parse(text);}catch{throw invalid();}
  keys(data,['format','version','createdAt','variantId','trackId','seed','source','genome','compatibility','summary','contentHash']);
  if(data.format!==FORMAT||data.version!==VERSION)throw fail('지원하지 않는 주행 파일 버전입니다.','run-file-version');
  if(!short(data.createdAt,40)||!Number.isFinite(Date.parse(data.createdAt))||!short(data.variantId,120)||!short(data.trackId,120)||typeof data.contentHash!=='string'||!/^[0-9a-f]{16}$/.test(data.contentHash))throw invalid();
  keys(data.source,['id','generation']);if(!short(data.source.id,80)||!Number.isSafeInteger(data.source.generation)||data.source.generation<0)throw invalid();
  keys(data.genome,['version','knots','stride','values']);
  if(data.genome.version!==Genome.VERSION||data.genome.knots!==Genome.KNOTS||data.genome.stride!==Genome.STRIDE)throw fail('현재 시뮬레이터와 유전자 형식이 다른 주행 파일입니다.','run-file-genome');
  // Validate leaf types before hashing, so deeply nested or oversized content
  // cannot reach the recursive fingerprint helper.
  if(!Array.isArray(data.genome.values)||data.genome.values.length!==Genome.LENGTH||data.genome.values.some(value=>typeof value!=='number'||!Number.isFinite(value)))throw fail('주행 파일의 유전자 값이 올바르지 않습니다.');
  keys(data.compatibility,['modelFingerprint','scoringFingerprint']);
  if(![data.compatibility.modelFingerprint,data.compatibility.scoringFingerprint].every(value=>typeof value==='string'&&/^[0-9a-f]{16}$/.test(value)))throw invalid();
  validateSummary(data.summary);seedValue(data.seed);
  const {contentHash,...payload}=data;if(Prepared.hash(payload)!==contentHash)throw fail('주행 파일의 내용이 변경되었거나 손상되었습니다.','run-file-checksum');
  let vehicle,track;
  try{vehicle=Catalog.get(data.variantId);track=Track.get(data.trackId,{includeDevelopment});}catch{throw fail('이 주행의 차량 또는 코스를 현재 시뮬레이터에서 사용할 수 없습니다.','run-file-selection');}
  const current=compatibility(vehicle,track);
  if(current.modelFingerprint!==data.compatibility.modelFingerprint||current.scoringFingerprint!==data.compatibility.scoringFingerprint)throw fail('저장된 주행의 차량·코스·물리 또는 채점 방식이 현재 버전과 다릅니다.','run-file-incompatible');
  const gene=validateGene(data.genome.values,vehicle,track);
  return {vehicle,track,gene,genomeVersion:Genome.VERSION,seed:data.seed,sourceId:data.source.id,sourceGeneration:data.source.generation,createdAt:data.createdAt,summary:{...data.summary}};
 }
 function filename(payload){
  const safe=value=>String(value||'run').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,120);
  return 'drift-'+safe(payload?.variantId)+'-'+safe(payload?.trackId)+'-'+safe(payload?.source?.id)+'.json';
 }
 const api=Object.freeze({FORMAT,VERSION,MAX_BYTES,create,stringify,parse,filename,compatibility});root.DriftRunFile=api;if(node)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
