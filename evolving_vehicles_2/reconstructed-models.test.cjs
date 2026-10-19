'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const registrySource=fs.readFileSync(path.join(__dirname,'manufacturer-models.js'),'utf8');
const kinds={carnival:'manufacturer-mesh',morning:'dealer-mesh',ray:'photo-reconstruction',k5:'photo-reconstruction',avante:'photo-reconstruction',grandeur:'photo-reconstruction',torres:'photo-reconstruction',musso_ev:'photo-reconstruction',porter2:'photo-reference'};

function registry(t){
 const scripts=[],waiting=new Map(),timers=new Set();
 const document={currentScript:{src:'file:///project/manufacturer-models.js?v=refined-2'},
  createElement(tag){assert.equal(tag,'script');return {removed:false,remove(){this.removed=true;}};},
  head:{append(script){const index=scripts.push(script)-1;waiting.get(index)?.(script);waiting.delete(index);}}};
 const context=vm.createContext({document,atob,Uint8Array,Uint16Array,Uint32Array,Float32Array,Blob,Response,DecompressionStream,
  setTimeout(fn,ms){const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;},
  clearTimeout(timer){timers.delete(timer);clearTimeout(timer);}});
 t.after(()=>{for(const timer of timers)clearTimeout(timer);});
 vm.runInContext(registrySource,context);document.currentScript=null;
 const api=context.ManufacturerModels;
 return {api,scripts,timers,
  scriptAt(index){return scripts[index]?Promise.resolve(scripts[index]):new Promise(resolve=>waiting.set(index,resolve));},
  execute(script,payload){
   document.currentScript=script;let registration;
   try{registration=api.registerCompressed(payload);}finally{document.currentScript=null;}
   script.onload();return registration;
  }};
}

for(const [id,kind]of Object.entries(kinds))test(`${id}: complete local geometry, source and photographic cameras`,()=>{
 let data;
 const capture={ManufacturerModels:{registerCompressed:source=>{data=JSON.parse(zlib.gunzipSync(Buffer.from(source,'base64')));}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/models',`${id}-runtime.js`),'utf8'),capture);
 assert.equal(data.id,id);assert.equal(data.source.kind,kind);assert.match(data.source.url,/^https:\/\//);
 assert.ok(data.source.label&&data.source.configuration);assert.ok(data.triangles>50000);
 let triangleCount=0;
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const part of data.primitives){
  const bytes=Buffer.from(part.vertices,'base64'),vertices=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  const indexBytes=Buffer.from(part.indices,'base64'),Index=part.indexType===2?Uint16Array:Uint32Array;
  const indices=new Index(indexBytes.buffer,indexBytes.byteOffset,indexBytes.byteLength/Index.BYTES_PER_ELEMENT);
  assert.equal(vertices.length%8,0);assert.equal(indices.length%3,0);assert.equal(part.triangles,indices.length/3);
  triangleCount+=part.triangles;
  for(let at=0;at<vertices.length;at+=8){
   for(let k=0;k<8;k++)assert.ok(Number.isFinite(vertices[at+k]),`${id}/${part.name}: finite vertex`);
   assert.ok(Math.abs(Math.hypot(vertices[at+3],vertices[at+4],vertices[at+5])-1)<.002,`${id}/${part.name}: unit normal`);
  }
  for(const i of indices){assert.ok(i<vertices.length/8);for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],vertices[i*8+axis]);max[axis]=Math.max(max[axis],vertices[i*8+axis]);}}
  if(part.textureIndex!==undefined)assert.match(data.textures[part.textureIndex],/^data:image\/(?:jpeg|png|webp);base64,/);
 }
 assert.equal(triangleCount,data.triangles);
 for(let axis=0;axis<3;axis++){assert.ok(Math.abs(min[axis]-data.bounds.min[axis])<1e-4,`${id}: minimum ${axis}`);assert.ok(Math.abs(max[axis]-data.bounds.max[axis])<1e-4,`${id}: maximum ${axis}`);}
 if(kind==='photo-reconstruction'){
  const photo=data.photoProjection;assert.ok(photo.cameras.length>=24);assert.equal(photo.textures.length,photo.cameras.length);
  assert.ok(data.primitives.some(p=>p.photoProjected));assert.ok(data.primitives.some(p=>!p.photoProjected),'inferred upper surfaces use geometry and paint');
  for(const part of data.primitives)if(part.photoCameraIndex!==undefined){assert.ok(part.photoProjected);assert.ok(Number.isInteger(part.photoCameraIndex)&&part.photoCameraIndex>=0&&part.photoCameraIndex<photo.cameras.length);}
  for(const c of photo.cameras){
   assert.ok(c.width>0&&c.height>0&&c.distance>0&&c.focal>0);assert.equal(c.center.length,2);
   for(const v of [c.eye,c.right,c.up])assert.ok(Math.abs(Math.hypot(...v)-1)<1e-5);
   for(const [a,b]of [[c.eye,c.right],[c.eye,c.up],[c.right,c.up]])assert.ok(Math.abs(a.reduce((s,v,i)=>s+v*b[i],0))<1e-5);
   assert.match(photo.textures[c.textureIndex],/^data:image\/(?:jpeg|png|webp);base64,/);
  }
 }
});

test('model loading is on demand, deduplicated, awaits decompression and leaves unknown models alone',async t=>{
 const {api,scripts,timers,execute}=registry(t);
 assert.equal(scripts.length,0);assert.equal(api.canLoad('porter2'),true);assert.equal(await api.load('not-a-model'),false);assert.equal(scripts.length,0);
 const first=api.load('ray'),second=api.load('ray');assert.equal(first,second);assert.equal(scripts.length,1);assert.equal(api.isLoading('ray'),true);
 assert.equal(scripts[0].src,'file:///project/assets/models/ray-runtime.js?v=refined-2');
 const registration=execute(scripts[0],zlib.gzipSync(JSON.stringify({id:'ray',primitives:[]})).toString('base64'));
 assert.equal(api.has('ray'),false);assert.equal(api.isLoading('ray'),true);assert.equal(api.getLoadState('ray').phase,'decoding');
 assert.equal(await registration,true);assert.equal(await first,true);assert.equal(api.isLoading('ray'),false);assert.equal(api.has('ray'),true);
 assert.equal(api.getLoadState('ray').status,'ready');assert.equal(scripts[0].removed,true);assert.equal(scripts[0].onload,null);assert.equal(timers.size,0);
 assert.equal(await api.load('ray'),true);assert.equal(scripts.length,1);
});

test('missing model file and decompression errors finish bounded retries and preserve fallback',async t=>{
 const {api,scripts,timers,scriptAt,execute}=registry(t);
 const missing=api.load('ray');scripts[0].onerror();
 const networkRetry=await scriptAt(1);assert.match(networkRetry.src,/v=refined-2&retry=/);networkRetry.onerror();
 assert.equal(await missing,false);assert.equal(api.isLoading('ray'),false);assert.equal(api.create('ray',{},'#fff'),null);
 assert.equal(api.getLoadState('ray').attempt,2);assert.equal(api.getLoadState('ray').errorCode,'network');assert.equal(api.getLoadState('ray').retryable,true);
 assert.equal(scripts.length,2);assert.equal(timers.size,0,'network retries stop after two attempts');
 const invalid=api.load('k5'),badGzip=Buffer.from('not gzip').toString('base64');
 assert.equal(await execute(scripts[2],badGzip),false);
 const decodeRetry=await scriptAt(3);assert.equal(await execute(decodeRetry,badGzip),false);
 assert.equal(await invalid,false);assert.equal(api.isLoading('k5'),false);assert.equal(api.create('k5',{},'#fff'),null);
 assert.equal(api.getLoadState('k5').attempt,2);assert.equal(api.getLoadState('k5').errorCode,'decode');assert.equal(api.failures.length,4);
 assert.equal(scripts.length,4);assert.equal(timers.size,0,'decode retries stop after two attempts');assert.ok(scripts.every(script=>script.removed));
 const manualRetry=api.load('ray');assert.notEqual(manualRetry,missing);assert.match(scripts[4].src,/retry=/);
 execute(scripts[4],zlib.gzipSync(JSON.stringify({id:'ray',primitives:[]})).toString('base64'));
 assert.equal(await manualRetry,true);assert.equal(api.has('ray'),true);assert.equal(api.getLoadState('ray').error,null);assert.equal(timers.size,0);
});
