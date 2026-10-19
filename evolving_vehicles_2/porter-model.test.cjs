'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{gunzipSync}=require('node:zlib');
let model;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/models/porter2-runtime.js'),'utf8'),{ManufacturerModels:{registerCompressed:s=>{model=JSON.parse(gunzipSync(Buffer.from(s,'base64')));}}});
const decode=(s,T)=>{const b=Buffer.from(s,'base64');return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
test('Porter separates remappable cab paint from photographed glazing and light details',()=>{
 assert.equal(model.source.kind,'photo-reference');assert.match(model.source.limitations,/not manufacturer CAD/);
 for(const name of ['porter-front-cab','porter-cab-side','porter-rear-bulkhead','porter-roof']){
  const p=model.primitives.find(p=>p.name===name);assert(p,name);assert.equal(p.paint,true);assert.equal(p.material,0);assert.equal(p.textureIndex,undefined,'paint must not contain photographic shadows');
 }
 for(const view of ['front','side','rear-cab'])assert(model.primitives.some(p=>p.name==='official-photo-'+view&&Number.isInteger(p.textureIndex)));
 assert(model.primitives.some(p=>p.name==='porter-rear-press'&&p.paint));
 assert(model.primitives.some(p=>p.name==='wheels-photo-side'&&p.textureIndex===1),'wheel photographs have a separate rotating group from glass/bed');
});
test('Porter rear shoulder joins both side skins and narrows toward the roof',()=>{
 const rear=decode(model.primitives.find(p=>p.name==='porter-rear-bulkhead').vertices,Float32Array),side=decode(model.primitives.find(p=>p.name==='porter-cab-side').vertices,Float32Array);
 const rows=new Map();for(let i=0;i<rear.length;i+=8){const z=rear[i+2].toFixed(5);if(!rows.has(z))rows.set(z,[]);rows.get(z).push([rear[i],rear[i+1],rear[i+2]]);}
 let checked=0;for(const points of rows.values()){
  const z=points[0][2];if(z<1.3||z>1.9)continue;
  const maxY=Math.max(...points.map(p=>Math.abs(p[1]))),mid=points.filter(p=>Math.abs(p[1])<.02),edge=points.filter(p=>Math.abs(Math.abs(p[1])-maxY)<1e-5);
  assert(mid.length&&edge.length);assert(Math.max(...edge.map(p=>p[0]))-mid[0][0]>.09,'rounded rear corner must have physical depth');
  for(const p of edge){let nearest=Infinity;for(let i=0;i<side.length;i+=8)nearest=Math.min(nearest,Math.hypot(side[i]-p[0],side[i+1]-p[1],side[i+2]-p[2]));assert(nearest<1e-5,'bulkhead must meet the side at the same vertex');}
  checked++;
 }
 assert(checked>20);
 const width=z=>Math.max(...[...rows.values()].filter(p=>Math.abs(p[0][2]-z)<.035).flat().map(p=>Math.abs(p[1])));
 assert(width(1.9)<width(1.3)-.05,'upper rear shoulder tapers inward');
});
test('Porter revised shell retains finite indexed geometry and tire ground zero',()=>{
 let count=0,min=Infinity;for(const p of model.primitives){const v=decode(p.vertices,Float32Array),indices=decode(p.indices,Uint32Array);assert.equal(indices.length,p.triangles*3);count+=p.triangles;
  for(const value of v)assert(Number.isFinite(value));for(const i of indices)assert(i<v.length/8);
  for(let i=0;i<v.length;i+=8){min=Math.min(min,v[i+2]);assert(Math.abs(Math.hypot(v[i+3],v[i+4],v[i+5])-1)<1e-5);}
 }assert.equal(count,model.triangles);assert(Math.abs(min)<1e-6);assert(model.triangles<80000);
});
