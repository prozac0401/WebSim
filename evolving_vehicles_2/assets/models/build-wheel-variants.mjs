/** Preserve the published SANTA FE body and add the original ICE Calligraphy
 * wheel group. Input is the already acquired official SantaFe-2.glb, not a new
 * download. Run from repository root; optional output directory follows input. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const require=createRequire(path.resolve('output/model-tools/package.json'));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const {weld,simplify}=await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const {MeshoptSimplifier}=await import(pathToFileURL(require.resolve('meshoptimizer')));await MeshoptSimplifier.ready;
const {mat3,vec3}=require('gl-matrix'),draco=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const folder=path.dirname(fileURLToPath(import.meta.url)),input=process.argv[2]||path.join(folder,'santafe/SantaFe-2.glb'),output=process.argv[3]||folder;
const doc=await io.read(input),nodes=doc.getRoot().listNodes(),group=nodes.find(n=>n.getName()==='VARIANTGROUPACCS_wheels.002');
assert(group,'Missing original ICE Calligraphy wheel group');
await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.3,error:.00045}));
const summary=JSON.parse(fs.readFileSync(path.join(folder,'santafe-runtime-summary.json'))),bounds=summary.sourceBounds;
const cx=(bounds.min[0]+bounds.max[0])/2,ground=bounds.min[1],selected=[];
function visit(n){if(n.getMesh())selected.push(n);n.listChildren().forEach(visit);}visit(group);
const b64=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
const parts=[],boxes=Array.from({length:4},()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}));
for(const node of selected)for(const primitive of node.getMesh().listPrimitives()){
  const pos=primitive.getAttribute('POSITION').getArray(),normal=primitive.getAttribute('NORMAL')?.getArray(),uv=primitive.getAttribute('TEXCOORD_0')?.getArray(),matrix=node.getWorldMatrix(),normalMatrix=mat3.normalFromMat4(mat3.create(),matrix),v=vec3.create(),n=vec3.create(),vertices=new Float32Array(pos.length/3*8);
  for(let i=0;i<pos.length/3;i++){
    vec3.transformMat4(v,pos.subarray(i*3,i*3+3),matrix);vec3.set(n,normal?.[i*3]||0,normal?.[i*3+1]||0,normal?.[i*3+2]||0);vec3.transformMat3(n,n,normalMatrix);vec3.normalize(n,n);
    const p=[-(v[0]-cx),v[2],v[1]-ground],q=p[0]>=0?2:0,index=q+(p[1]>=0?1:0),box=boxes[index];
    vertices.set([...p,-n[0],n[2],n[1],uv?.[i*2]||0,uv?.[i*2+1]||0],i*8);
    for(let j=0;j<3;j++){box.min[j]=Math.min(box.min[j],p[j]);box.max[j]=Math.max(box.max[j],p[j]);}
  }
  const indices=primitive.getIndices()?.getArray()||Uint32Array.from({length:pos.length/3},(_,i)=>i),m=primitive.getMaterial(),name=m?.getName()||'',texture=m?.getBaseColorTexture(),base=m?.getBaseColorFactor()||[.1,.1,.1,1];
  parts.push({name:node.getName(),materialName:name,vertices,indices,color:base.slice(0,3).map(c=>Math.pow(c,1/2.2)),alpha:base[3],material:/Chrome|Silver|METAL|Rim/i.test(name)?3:2,paint:false,texture:texture?`data:${texture.getMimeType()};base64,${b64(texture.getImage())}`:null});
}
const wheels=boxes.map((b,i)=>({center:b.min.map((v,j)=>(v+b.max[j])/2),radius:Math.max(b.max[0]-b.min[0],b.max[2]-b.min[2])/2,axle:i>=2?'front':'rear',side:i%2?1:-1}));
const primitives=[];
for(const p of parts){const groups=[[],[],[],[]];for(let i=0;i<p.indices.length;i+=3){const k=p.indices[i]*8,q=(p.vertices[k]>=0?2:0)+(p.vertices[k+1]>=0?1:0);groups[q].push(...p.indices.subarray(i,i+3));}
  for(let q=0;q<4;q++)if(groups[q].length){const map=new Map(),v=[],ind=[];for(const old of groups[q]){if(!map.has(old)){map.set(old,map.size);v.push(...p.vertices.subarray(old*8,old*8+8));}ind.push(map.get(old));}const I=map.size<65536?Uint16Array:Uint32Array;
    primitives.push({...p,vertices:b64(new Float32Array(v)),indices:b64(new I(ind)),indexType:I.BYTES_PER_ELEMENT,triangles:ind.length/3,wheel:wheels[q]});}
}
assert(wheels.every(w=>w.radius>.35&&w.radius<.40),'Unexpected Calligraphy tyre radius');
let data;vm.runInNewContext(fs.readFileSync(path.join(folder,'santafe-runtime.js'),'utf8'),{ManufacturerModels:{registerCompressed:s=>data=JSON.parse(gunzipSync(Buffer.from(s,'base64')))}});
data.wheelVariants={...(data.wheelVariants||{}),'santafe-21':{label:'Korean 21-inch ICE Calligraphy wheels',sourceGroup:group.getName(),source:'https://www.hyundai.com/kr/ko/e/vehicles/santafe/price',wheelInches:21,primitives}};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'santafe-runtime.js'),'/* Manufacturer source geometry; see assets/models/README.md and SOURCES.json. */\nManufacturerModels.registerCompressed('+JSON.stringify(gzipSync(JSON.stringify(data),{level:9}).toString('base64'))+');\n');
fs.writeFileSync(path.join(output,'santafe-wheel-variants.json'),JSON.stringify({sourceGroup:group.getName(),sourceFile:path.basename(input),source:data.wheelVariants['santafe-21'].source,wheels,primitives:primitives.map(({vertices,indices,texture,...p})=>p)},null,2)+'\n');
console.log(JSON.stringify({output,primitives:primitives.length,triangles:primitives.reduce((n,p)=>n+p.triangles,0),wheels}));
