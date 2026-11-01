'use strict';
// Exact source from the parent of PR #145, not regenerated expected output.
// Keep the reference engine, strategies AND trajectory's strategy closure isolated;
// sharing the current trajectory module would silently use current strategies.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const crypto=require('node:crypto'),vm=require('node:vm');
const {createRequire}=require('node:module');
const currentRequire=createRequire(path.join(__dirname,'../evolution.js'));
function loadOriginalEvolution(){
 const archive=fs.readFileSync(path.join(__dirname,'pre-pedal-overlap.json.gz'));
 if(crypto.createHash('sha256').update(archive).digest('hex')!=='8f22f76c464504399b22892ce51e4f02c028ee66da833f6f8b02a51c3d5ae0cc')throw Error('Pre-pedal-overlap source archive changed');
 const bundle=JSON.parse(zlib.gunzipSync(archive));
 if(bundle.commit!=='f7621cd9a93c23f8631026c9a1671c970f44a27e')throw Error('Unexpected reference commit');
 const context=vm.createContext({}),cache=new Map();
 function load(request){
  const name=request.replace(/^\.\//,'');
  // All other dependencies and prepared seeds intentionally match the current
  // run: this oracle isolates proposal behavior, not historical physics replay.
  if(!Object.hasOwn(bundle.files,name))return currentRequire(request);
  if(cache.has(name))return cache.get(name).exports;
  const module={exports:{}};cache.set(name,module);
  const factory=new vm.Script('(function(require,module){\n'+bundle.files[name]+'\n})',{filename:'pre-pedal-overlap/'+name}).runInContext(context);
  factory(load,module);return module.exports;
 }
 return load('./evolution.js');
}
module.exports={loadOriginalEvolution};
