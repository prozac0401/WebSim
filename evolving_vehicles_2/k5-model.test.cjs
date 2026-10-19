'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{gunzipSync}=require('node:zlib');
const folder=process.env.K5_MODEL_DIR||path.join(__dirname,'assets/models');
const runtime=fs.readFileSync(path.join(folder,'k5-runtime.js'),'utf8');
const source=JSON.parse(fs.readFileSync(path.join(folder,'k5-source.json'))),summary=JSON.parse(fs.readFileSync(path.join(folder,'k5-runtime-summary.json')));
let model;vm.runInNewContext(runtime,{ManufacturerModels:{registerCompressed:s=>{model=JSON.parse(gunzipSync(Buffer.from(s,'base64')));}}});
const decode=(s,T)=>{const b=Buffer.from(s,'base64');return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
test('K5 uses the exact normally downloaded facelift model with persistent CC attribution',()=>{
 assert.equal(model.id,'k5');assert.equal(model.source.kind,'community-mesh');assert.equal(model.source.author,'zapkolenko07');assert.equal(model.source.license,'CC BY 4.0');
 assert.equal(model.source.licenseUrl,'https://creativecommons.org/licenses/by/4.0/');assert.equal(source.sourceUrl,model.source.url);assert.match(source.sourceUrl,/0ed1b1fb1a074a42849076b96a15ce9f$/);
 assert.equal(model.source.sha256,'07891ce115dab0194027de0eee2b8ab525232963c5009d564cd8bd1e98aea07f');assert.equal(source.download.files[0].sha256,model.source.sha256);assert.equal(source.download.files[0].bytes,17835388);
 assert.match(source.download.method,/Normal signed-in Sketchfab/);assert.match(source.configuration.generation,/facelift/);assert.equal(source.manufacturerOfficial,false);
 const license=fs.readFileSync(path.join(folder,'k5-LICENSE.txt'),'utf8');for(const text of ['zapkolenko07','CC-BY-4.0',source.sourceUrl,model.source.sha256])assert(license.includes(text));
});
test('K5 preserves every source part and documents material reconstruction instead of a photo hull',()=>{
 assert.equal(source.sourceGeometry.downloadedTriangles,345765);assert.equal(source.sourceGeometry.downloadedMeshes,88);assert.equal(source.sourceGeometry.downloadedMaterials,22);assert.equal(source.sourceGeometry.downloadedImages,0);
 assert.equal(source.conversion.geometryAdded,false);assert.equal(model.photoProjection,undefined);assert.deepEqual(model.textures,[]);
 for(const parts of [model.primitives,model.fallbackPrimitives]){const originals=parts.flatMap(p=>p.sourceParts);assert.equal(originals.length,88);assert.equal(new Set(originals.map(p=>p.name)).size,88);assert.equal(originals.reduce((s,p)=>s+p.sourceTriangles,0),345765);}
 assert.equal(model.triangles,summary.triangles);assert.equal(model.fallbackTriangles,source.conversion.fallbackTriangles);assert.equal(Buffer.byteLength(runtime),summary.runtimeBytes);assert.equal(Buffer.byteLength(runtime),source.conversion.runtimeBytes);
 assert(model.triangles>100000&&model.triangles<240000);assert(model.fallbackTriangles>20000&&model.fallbackTriangles<85000);assert(Buffer.byteLength(runtime)<13*1024*1024);
 assert(source.conversion.changes.some(s=>/white default factors and no textures/.test(s)));
});
test('K5 fallback retains the upper cabin skin next to glass instead of exposing coarse interior facets',()=>{
 const main=model.primitives.find(p=>p.role==='interior'),low=model.fallbackPrimitives.find(p=>p.role==='interior');assert.equal(main.triangles,9173);assert(low.triangles>4000);
 const triples=p=>{const v=decode(p.vertices,Float32Array),idx=decode(p.indices,p.indexType===2?Uint16Array:Uint32Array),out=new Set();for(let i=0;i<idx.length;i+=3){const points=[idx[i],idx[i+1],idx[i+2]].map(i=>[v[i*8],v[i*8+1],v[i*8+2]]);if(points.every(v=>v[2]>.8))out.add(points.map(v=>v.map(x=>x.toFixed(6)).join(',')).sort().join('|'));}return out;};
 const originals=triples(main),reduced=triples(low);assert(originals.size>1000);for(const tri of originals)assert(reduced.has(tri),'the upper inner skin must remain on its source plane');
});
test('K5 keeps the original paint shell and thin glass/lamp surfaces, separated from other finishes',()=>{
 const paint=model.primitives.filter(p=>p.paint);assert.equal(paint.reduce((s,p)=>s+p.triangles,0),22426);assert(paint.every(p=>p.material===0&&p.triangles===p.sourceTriangles));
 assert.equal(model.paintReference.code,'SWP');assert.equal(model.paintReference.name,'스노우 화이트 펄');assert.equal(model.paintReference.finish,'pearl');assert.equal(model.paintReference.rgbStatus,'estimated-display-color');assert.match(model.paintReference.sourceUrl,/www\.kia\.com/);
 for(const parts of [model.primitives,model.fallbackPrimitives]){
  const thin=parts.filter(p=>['cabin-glass','window-trim','lamp-cover','front-lamp','rear-lamp','badge'].includes(p.role));assert(thin.length>=6);assert(thin.every(p=>p.triangles===p.sourceTriangles&&!p.paint));
  assert(parts.filter(p=>p.role==='cabin-glass').every(p=>p.material===1&&p.alpha===1));assert(parts.filter(p=>p.role==='lamp-cover').every(p=>p.material===1&&p.alpha<.3));
  assert.equal(parts.find(p=>p.role==='badge').triangles,2049);
 }
});
for(const [lod,parts,count]of [['main',model.primitives,model.triangles],['fallback',model.fallbackPrimitives,model.fallbackTriangles]]){
 test(`K5 ${lod} geometry has valid indices, finite unit normals, corrected winding and tire ground zero`,()=>{
  let total=0,floor=Infinity,reversed=0,nondegenerate=0;
  for(const p of parts){const v=decode(p.vertices,Float32Array),idx=decode(p.indices,p.indexType===2?Uint16Array:Uint32Array);assert([2,4].includes(p.indexType));assert.equal(v.length%8,0);assert.equal(idx.length,p.triangles*3);total+=p.triangles;
   for(const value of v)assert(Number.isFinite(value));for(const i of idx)assert(Number.isInteger(i)&&i<v.length/8);
   for(let i=0;i<v.length;i+=8){floor=Math.min(floor,v[i+2]);assert(Math.abs(Math.hypot(v[i+3],v[i+4],v[i+5])-1)<2e-5);for(let a=0;a<3;a++)assert(v[i+a]>=p.bounds.min[a]-1e-6&&v[i+a]<=p.bounds.max[a]+1e-6);}
   for(let i=0;i<idx.length;i+=3){const[a,b,c]=[idx[i],idx[i+1],idx[i+2]].map(i=>i*8),u=[v[b]-v[a],v[b+1]-v[a+1],v[b+2]-v[a+2]],w=[v[c]-v[a],v[c+1]-v[a+1],v[c+2]-v[a+2]],n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];if(Math.hypot(...n)<1e-10)continue;nondegenerate++;if(n.reduce((s,n,k)=>s+n*(v[a+3+k]+v[b+3+k]+v[c+3+k]),0)<-1e-10)reversed++;}
  }
  assert.equal(total,count);assert(Math.abs(floor)<1e-6);assert(reversed/nondegenerate<1e-5);
 });
 test(`K5 ${lod} has four source wheels and rotating discs while keeping offset calipers stationary`,()=>{
  const wheels=parts.filter(p=>p.wheel),calipers=parts.filter(p=>p.role==='stationary-brake-caliper');assert.equal(new Set(wheels.map(p=>p.wheel.axle+':'+p.wheel.side)).size,4);assert(calipers.length&&calipers.every(p=>!p.wheel));
  assert.equal(calipers.flatMap(p=>p.sourceParts).length,16);
  for(const p of wheels){const w=p.wheel;assert(w.radius>.34&&w.radius<.36);assert(Math.abs(w.center[2]-w.radius)<.0001);assert(w.side===-1||w.side===1);assert(w.axle==='front'?w.center[0]>1.4:w.center[0]<-1.2);assert(w.center.every(Number.isFinite));assert(!p.paint);
   for(const part of p.sourceParts)assert(/^(wheels_|Object44[789]_|Object45[0123]_|Cylinder00[1357]_)/.test(part.name),part.name);
   const v=decode(p.vertices,Float32Array);for(let i=0;i<v.length;i+=8){assert(Math.hypot(v[i]-w.center[0],v[i+2]-w.center[2])<w.radius+.025);assert(Math.abs(v[i+1]-w.center[1])<.16);}
  }
 });
}
test('K5 scaling retains source proportions and distinguishes the front, rear and badge sides',()=>{
 assert(Math.abs(model.bounds.max[0]-model.bounds.min[0]-4.905)<1e-5);assert(model.bounds.max[1]-model.bounds.min[1]>2.1&&model.bounds.max[1]-model.bounds.min[1]<2.2);assert(model.bounds.max[2]>1.45&&model.bounds.max[2]<1.52);
 assert.deepEqual(model.coordinateTransform.worldToRuntime,['-X','+Z','-Y']);assert.equal(model.coordinateTransform.windingCorrected,true);
 const front=model.primitives.filter(p=>p.role==='front-lamp'),rear=model.primitives.filter(p=>p.role==='rear-lamp');assert(front.length&&front.every(p=>p.bounds.min[0]>1.7));assert(rear.length&&rear.every(p=>p.bounds.max[0]<-1.7));
 const badge=model.primitives.find(p=>p.role==='badge'),v=decode(badge.vertices,Float32Array);let rearLeft=0,rearRight=0,frontCount=0;for(let i=0;i<v.length;i+=8){if(v[i]>2)frontCount++;if(v[i]<-2&&v[i+1]<-.2)rearLeft++;if(v[i]<-2&&v[i+1]>.2)rearRight++;}assert(frontCount>20);assert(rearLeft>20);assert.equal(rearRight,0,'rear K5 badge remains on the source left side, not mirrored');
});
