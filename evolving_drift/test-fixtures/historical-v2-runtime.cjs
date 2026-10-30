'use strict';
// Historical evidence is replayed against its archived model in an isolated
// global context. Nothing is migrated into, or claimed valid for, current v3.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),vm=require('node:vm');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function loadFrozenRuntime(){
 const archive=fs.readFileSync(path.join(__dirname,'../test-results/coarse-line-v1/reproduction-inputs-v1.json.gz'));
 if(sha(archive)!=='3ef23de11c9534e80e62a58cb11e335a4296524a660303b5f4b60de62bda92f9')throw Error('Historical source archive changed');
 const bundle=JSON.parse(zlib.gunzipSync(archive)),sources=new Map();
 for(const [key,source]of Object.entries(bundle.files))if(key.startsWith('source/')){
  if(sha(Buffer.from(source))!==bundle.hashes[key])throw Error('Historical source hash mismatch: '+key);
  sources.set(key.slice('source/'.length),source);
 }
 const extraArchive=fs.readFileSync(path.join(__dirname,'historical-v2-porter-diesel-reference.json.gz'));
 if(sha(extraArchive)!=='45623c1f4aa374b8c7eb78a5ccec40976bb1aea9b6bbf5a6dd81ebd13619c98c')throw Error('Historical Porter archive changed');
 const extra=JSON.parse(zlib.gunzipSync(extraArchive));
 if(extra.path!=='evolving_drift/grip-records/kr-kic-t21-kdl-2016-r2--porter-diesel-mt.js'||sha(Buffer.from(extra.source))!==extra.sha256)throw Error('Historical Porter reference changed');
 sources.set(extra.path,extra.source);
 const context=vm.createContext({console,Buffer,setTimeout,clearTimeout,URL,URLSearchParams,TextEncoder,TextDecoder,performance});
 const cache=new Map();
 function load(request,parent=''){
  if(!request.startsWith('.'))throw Error('Historical runtime dependency must be archived: '+request);
  let file=path.posix.normalize(path.posix.join(path.posix.dirname(parent||'index.js'),request));
  if(!path.posix.extname(file))file+='.js';
  if(!sources.has(file))throw Error('Historical runtime source missing: '+file);
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const factory=new vm.Script('(function(exports,require,module,__filename,__dirname){\n'+sources.get(file)+'\n})',{filename:'historical-v2/'+file}).runInContext(context);
  factory(module.exports,child=>load(child,file),module,file,path.posix.dirname(file));return module.exports;
 }
 const get=name=>load('./evolving_drift/'+name+'.js');
 return {Catalog:get('catalog'),Tracks:get('track'),Physics:get('physics'),Fitness:get('fitness'),Genome:get('genome'),Prepared:get('prepared-grips'),Analysis:get('connection-analysis')};
}
module.exports={loadFrozenRuntime};
