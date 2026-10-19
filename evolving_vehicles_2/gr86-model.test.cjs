'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {gunzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const folder=path.join(__dirname,'assets/models');
const runtime=fs.readFileSync(path.join(folder,'gr86-runtime.js'),'utf8');
const source=JSON.parse(fs.readFileSync(path.join(folder,'gr86-source.json')));
const summary=JSON.parse(fs.readFileSync(path.join(folder,'gr86-runtime-summary.json')));
let model;
vm.runInNewContext(runtime,{ManufacturerModels:{registerCompressed(data){model=JSON.parse(gunzipSync(Buffer.from(data,'base64')));}}});
function decode(text,Type){const b=Buffer.from(text,'base64');return new Type(b.buffer,b.byteOffset,b.byteLength/Type.BYTES_PER_ELEMENT);}
const part=(primitives,name)=>primitives.find(p=>p.materialName===name);

test('GR86 records the exact normal download, creator license, extra texture credit and exporter evidence',()=>{
 assert.equal(model.id,'gr86');assert.equal(model.source.kind,'community-mesh');
 assert.equal(model.source.author,'Mona x Supercars');assert.equal(source.authorUrl,'https://sketchfab.com/Car2022');
 assert.equal(model.source.url,source.sourceUrl);assert.match(source.sourceUrl,/4919d14eba9640599e838230e8e5ed74$/);
 assert.equal(model.source.license,'CC BY 4.0');assert.equal(source.licenseUrl,'https://creativecommons.org/licenses/by/4.0/');
 assert.equal(source.manufacturerOfficial,false);assert.match(source.download.method,/Normal Sketchfab download/);
 assert.equal(source.download.files[0].bytes,15861048);
 assert.equal(source.download.files[0].sha256,'276db7d1eb78ee603fbceb3684f33d7069fd5044d7376170b8a14554749bc07a');
 assert.equal(source.download.files[1].sha256,'d9387215bf32e97a9d5468c3a7c5c3ca6bf9584bc30bf1bc33b76360ec1fa18e');
 assert.equal(source.download.files[1].observedExporter,'Roblox Studio');
 assert.equal(model.source.sha256,source.download.files[0].sha256);
 assert.match(source.download.embeddedAttribution.license,/CC-BY-4\.0/);
 assert.equal(source.additionalEmbeddedCredits[0].name,'Kazutoshi Mods');
 assert.match(model.source.configuration,/not an exact factory RZ wheel match/);
 const license=fs.readFileSync(path.join(folder,'gr86-LICENSE.txt'),'utf8');
 for(const s of ['Mona x Supercars','Car2022','CC-BY-4.0','Kazutoshi Mods','Roblox Studio',source.sourceUrl,model.source.sha256,'WebSim modifications'])assert(license.includes(s));
});

test('GR86 accounts for all original parts and excludes only two completely transparent materials',()=>{
 assert.equal(source.sourceGeometry.downloadedTriangles,284061);
 assert.equal(source.sourceGeometry.visibleTriangles,248857);
 assert.equal(source.sourceGeometry.downloadedMeshes,47);assert.equal(source.sourceGeometry.downloadedMaterials,29);assert.equal(source.sourceGeometry.downloadedImages,25);
 const excluded=source.sourceGeometry.excluded;
 assert.deepEqual([...new Set(excluded.map(p=>p.materialName))].sort(),['Cupper1Mtl','Paint2Mtl']);
 assert.equal(excluded.reduce((s,p)=>s+p.sourceTriangles,0),35204);
 assert.equal(model.primitives.length,27);assert.equal(model.fallbackPrimitives.length,27);
 assert.equal(model.primitives.flatMap(p=>p.sourceParts).length+excluded.length,47);
 assert.equal(model.primitives.reduce((s,p)=>s+p.sourceTriangles,0),248857);
 for(const p of model.primitives)assert.equal(p.sourceParts.reduce((s,q)=>s+q.sourceTriangles,0),p.sourceTriangles);
 assert.equal(source.conversion.geometryAdded,false);assert.equal(source.conversion.mainPaintGeometryPreserved,true);assert.equal(source.conversion.otherGeometrySimplified,true);
 assert(model.triangles>120000&&model.triangles<=200000);assert(model.fallbackTriangles>18000&&model.fallbackTriangles<40000);
 assert(part(model.fallbackPrimitives,'Paint1Mtl').triangles>=10000);
 assert.equal(part(model.primitives,'Paint1Mtl').triangles,35108,'every opaque source painted-body triangle is retained in the watched model');
 for(const key of ['triangles','fallbackTriangles']){assert.equal(model[key],summary[key]);assert.equal(model[key],source.conversion[key]);}
 assert.equal(Buffer.byteLength(runtime),summary.runtimeBytes);assert.equal(summary.runtimeBytes,source.conversion.runtimeBytes);
 assert(Buffer.byteLength(runtime)<10*1024*1024);
});

test('GR86 preserves the original red paint, alpha, original PNG bytes and repeat UV sampling',()=>{
 const paint=part(model.primitives,'Paint1Mtl');assert.equal(paint.paint,false);assert.equal(paint.material,0);
 assert(Math.abs(paint.color[0]-1)<1e-12);assert(paint.color[1]<.02&&paint.color[2]<.02);assert.equal(paint.textureIndex,undefined);
 assert.equal(model.textures.length,14);assert.equal(summary.textures.length,14);
 for(let i=0;i<model.textures.length;i++){
  const bytes=Buffer.from(model.textures[i].split(',')[1],'base64'),meta=summary.textures[i];
  assert.equal(bytes.length,meta.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256);
  assert.equal(bytes.readUInt32BE(0),0x89504e47);assert.equal(meta.width&(meta.width-1),0);assert.equal(meta.height&(meta.height-1),0);
 }
 const glass=part(model.primitives,'Wind1Mtl');assert.equal(glass.material,1);assert(Math.abs(glass.alpha-.301961)<.000001);
 for(const p of model.primitives.filter(p=>Number.isInteger(p.textureIndex))){assert.equal(p.textureRepeat,true);assert(model.textures[p.textureIndex]);}
 assert(model.fallbackPrimitives.every(p=>p.textureIndex===undefined));
 assert.equal(part(model.primitives,'Meshes2017ToyotaGt86engines00221Mtl').textureIndex,part(model.primitives,'Meshes2017ToyotaGt86engines01321Mtl').textureIndex,'identical engine texture bytes share one image');
 const uv=decode(part(model.primitives,'Bumperf0051Mtl').vertices,Float32Array);
 assert(Array.from({length:uv.length/8},(_,i)=>uv[i*8+7]).some(v=>v>4),'source tiled coordinates are retained, not clamped or per-vertex wrapped');
});

for(const [name,primitives,count]of [['main',model.primitives,model.triangles],['fallback',model.fallbackPrimitives,model.fallbackTriangles]]){
 test(`GR86 ${name} has finite indexed geometry, unit normals and tire ground zero`,()=>{
  let total=0,lowest=Infinity,reversed=0,nondegenerate=0;
  for(const p of primitives){
   assert(p.indexType===2||p.indexType===4);
   const v=decode(p.vertices,Float32Array),idx=decode(p.indices,p.indexType===2?Uint16Array:Uint32Array);
   assert.equal(v.length%8,0);assert.equal(idx.length,p.triangles*3);total+=p.triangles;
   for(const value of v)assert(Number.isFinite(value));for(const i of idx)assert(Number.isInteger(i)&&i<v.length/8);
   for(let i=0;i<v.length;i+=8){
    assert(Math.abs(Math.hypot(v[i+3],v[i+4],v[i+5])-1)<.00001,p.materialName);
    lowest=Math.min(lowest,v[i+2]);
    for(let a=0;a<3;a++){assert(v[i+a]>=p.bounds.min[a]-.000001);assert(v[i+a]<=p.bounds.max[a]+.000001);assert(Math.abs(v[i+a])<3);}
    assert(v[i+2]>=-.000001);
   }
   for(let i=0;i<idx.length;i+=3){
    const a=idx[i]*8,b=idx[i+1]*8,c=idx[i+2]*8;
    const ab=[v[b]-v[a],v[b+1]-v[a+1],v[b+2]-v[a+2]],ac=[v[c]-v[a],v[c+1]-v[a+1],v[c+2]-v[a+2]];
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    if(Math.hypot(...n)<1e-10)continue;nondegenerate++;
    if(n.reduce((s,x,k)=>s+x*(v[a+3+k]+v[b+3+k]+v[c+3+k]),0)<0)reversed++;
   }
   assert(p.color.every(c=>c>=0&&c<=1));assert(p.alpha>0&&p.alpha<=1);
  }
  assert.equal(total,count);assert(Math.abs(lowest)<.000001);
  assert(reversed/nondegenerate<(name==='main'?.02:.00001),`${reversed}/${nondegenerate} reversed faces`);
 });
 test(`GR86 ${name} retains the front lamps, rear GR plate and all four original wheels`,()=>{
  assert(part(primitives,'FariFront1Mtl').bounds.min[0]>1.6);
  assert(part(primitives,'Fari0051Mtl').bounds.max[0]<-1.7);
  assert(part(primitives,'Bumprearok0011Mtl').bounds.max[0]<-2);
  assert.equal(part(primitives,'Ln4Mtl').material,4);
  const tires=part(primitives,'Wheel1Mtl'),v=decode(tires.vertices,Float32Array);
  for(const w of model.wheelCenters){
   assert.deepEqual(w.axis,[0,1,0]);let count=0,min=Infinity,max=-Infinity;
   for(let i=0;i<v.length;i+=8)if(Math.abs(v[i]-w.center[0])<.4&&Math.abs(v[i+1]-w.center[1])<.2){count++;min=Math.min(min,v[i+2]);max=Math.max(max,v[i+2]);}
   assert(count>=12);assert(min<.003);assert(max>.60);
  }
 });
}

test('GR86 retains source coupe proportions and static axle placement without axis stretching',()=>{
 const {min,max}=model.bounds;assert(Math.abs(max[0]-min[0]-4.265)<.001);
 assert(max[1]-min[1]>2.02&&max[1]-min[1]<2.05);assert(max[2]>1.29&&max[2]<1.32);assert.equal(min[2],0);
 assert.equal(model.wheelAnimation,'static-source-mesh');assert.equal(model.wheelCenters.length,4);
 assert(Math.max(...model.wheelCenters.map(w=>w.center[2]))-Math.min(...model.wheelCenters.map(w=>w.center[2]))<.001);
 assert(model.coordinateTransform.rigidPitchCorrectionRadians<-.01&&model.coordinateTransform.rigidPitchCorrectionRadians>-.012);
 const axle=model.wheelCenters.filter(w=>w.center[1]>0).map(w=>w.center[0]).sort((a,b)=>a-b);
 assert(Math.abs(axle[1]-axle[0]-2.575)<.01);
 const paint=part(model.primitives,'Paint1Mtl');assert(paint.bounds.max[1]-paint.bounds.min[1]>1.78&&paint.bounds.max[1]-paint.bounds.min[1]<1.81);
 assert.deepEqual(model.coordinateTransform.worldToRuntime,['-X','-Z','+Y']);
 assert.equal(model.coordinateTransform.handednessCorrectedForRenderer,true);assert.equal(model.coordinateTransform.windingCorrected,true);
});

test('GR86 rear plate texture reads left-to-right in the renderer rear-screen convention',()=>{
 // Rear camera screen-right is runtime +Y. The large flat source GR plate
 // rectangle must increase U toward that side, rather than mirror the logo.
 const p=part(model.primitives,'Bumprearok0011Mtl'),v=decode(p.vertices,Float32Array),samples=[];
 for(let i=0;i<v.length;i+=8)if(v[i]<-2.11&&Math.abs(v[i+4])<.1&&v[i+3]<-.9)samples.push({y:v[i+1],u:v[i+6]});
 assert(samples.length>=4);const my=samples.reduce((s,p)=>s+p.y,0)/samples.length,mu=samples.reduce((s,p)=>s+p.u,0)/samples.length;
 assert(samples.reduce((s,p)=>s+(p.y-my)*(p.u-mu),0)>0,'rear GR logo should not be mirrored');
});

test('GR86 reduced red panels stay on the original main body surface instead of cutting across roof and door sheets',t=>{
 const geometry=p=>{const v=decode(p.vertices,Float32Array),idx=decode(p.indices,p.indexType===2?Uint16Array:Uint32Array);return Array.from({length:idx.length/3},(_,i)=>Array.from({length:3},(_,j)=>Array.from(v.subarray(idx[i*3+j]*8,idx[i*3+j]*8+3))));};
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
 const main=geometry(part(model.primitives,'Paint1Mtl')).map(([a,b,c])=>{const ab=sub(b,a),ac=sub(c,a),d00=dot(ab,ab),d01=dot(ab,ac),d11=dot(ac,ac);return {a,b,c,ab,ac,d00,d01,d11,det:d00*d11-d01*d01,min:a.map((v,i)=>Math.min(v,b[i],c[i])),max:a.map((v,i)=>Math.max(v,b[i],c[i]))};});
 function edge(p,a,b){const e=sub(b,a),d=sub(p,a),f=Math.max(0,Math.min(1,dot(d,e)/(dot(e,e)||1)));return d.reduce((s,x,i)=>s+(x-f*e[i])**2,0);}
 function distance(p,tr){const {a,b,c,ab,ac,d00,d01,d11,det}=tr,ap=sub(p,a),d20=dot(ap,ab),d21=dot(ap,ac);if(det>1e-20){const v=(d11*d20-d01*d21)/det,w=(d00*d21-d01*d20)/det;if(v>=0&&w>=0&&v+w<=1)return ap.reduce((s,x,i)=>s+(x-v*ab[i]-w*ac[i])**2,0);}return Math.min(edge(p,a,b),edge(p,b,c),edge(p,c,a));}
 const reduced=geometry(part(model.fallbackPrimitives,'Paint1Mtl')),distances=[];
 for(let i=0;i<reduced.length;i+=Math.max(1,Math.floor(reduced.length/128))){const points=reduced[i],p=points[0].map((v,a)=>(v+points[1][a]+points[2][a])/3);let best=Infinity;for(const tr of main){const box=p.reduce((s,x,a)=>s+Math.max(tr.min[a]-x,0,x-tr.max[a])**2,0);if(box<best)best=Math.min(best,distance(p,tr));}distances.push(Math.sqrt(best));}
 distances.sort((a,b)=>a-b);const p95=distances[Math.floor(distances.length*.95)],maximum=distances.at(-1);
 t.diagnostic(JSON.stringify({sampledPanelCenters:distances.length,p95SurfaceErrorMm:p95*1000,maximumSurfaceErrorMm:maximum*1000}));
 assert(p95<.006);assert(maximum<.025);
});

test('GR86 fallback preserves every original protected hood triangle above its closely spaced black inner skin',()=>{
 function triangles(p){
  const v=decode(p.vertices,Float32Array),indices=decode(p.indices,p.indexType===2?Uint16Array:Uint32Array),result=[];
  for(let i=0;i<indices.length;i+=3)result.push([0,1,2].map(j=>Array.from(v.subarray(indices[i+j]*8,indices[i+j]*8+3))));
  return result;
 }
 const key=triangle=>triangle.map(p=>p.map(v=>Math.round(v*10000)).join(',')).sort().join('|');
 const low=new Set(triangles(part(model.fallbackPrimitives,'Paint1Mtl')).map(key));
 const protectedTriangles=triangles(part(model.primitives,'Paint1Mtl')).filter(tr=>tr.every(p=>p[0]>.56&&p[2]>.61&&Math.abs(p[1])<.71));
 assert(protectedTriangles.length>2000,'the test covers the full central hood, not just a few reference vertices');
 for(const triangle of protectedTriangles)assert(low.has(key(triangle)),'the hood surface must not collapse below the original inner panel');
});
