/** Convert public Carnival manufacturer and Picanto dealer meshes. Local cache only. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
const require=createRequire(path.resolve('output/model-tools/package.json'));
const {Document,NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const {weld,simplify,compactPrimitive}=await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const {MeshoptSimplifier}=await import(pathToFileURL(require.resolve('meshoptimizer')));
const {mat4,mat3,quat,vec3}=require('gl-matrix');
await MeshoptSimplifier.ready;
const dir=path.dirname(fileURLToPath(import.meta.url));
const b64=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
function packTextures(payload){const textures=[],lookup=new Map();return {...payload,primitives:payload.primitives.map(({texture,...p})=>{if(!texture)return p;let index=lookup.get(texture);if(index===undefined){index=textures.length;lookup.set(texture,index);textures.push(texture);}return {...p,textureIndex:index};}),textures};}
function localMatrix(n){return mat4.fromRotationTranslationScale(mat4.create(),quat.fromEuler(quat.create(),...(n.rotation||[0,0,0])),n.position||[0,0,0],n.scale||[1,1,1]);}
async function carnival(){
 const srcDir=path.join(dir,'carnival'),config=JSON.parse(fs.readFileSync(path.join(srcDir,'config.json'))),scene=JSON.parse(fs.readFileSync(path.join(srcDir,'scene.json'))),model=JSON.parse(fs.readFileSync(path.join(srcDir,'model.json'))).model;
 const asset=config.assets[204040690], entityId='fa57760e-7aaf-4fb7-aaf3-629fd6a89cda';
 function entityMatrix(id){if(!id)return mat4.create();const n=scene.entities[id];assert(n.enabled!==false,`Disabled car entity ${n.name}`);return mat4.multiply(mat4.create(),entityMatrix(n.parent),localMatrix(n));}
 const carMatrix=entityMatrix(entityId),nodeMatrices=[];
 function nodeMatrix(i){if(nodeMatrices[i])return nodeMatrices[i];return nodeMatrices[i]=mat4.multiply(mat4.create(),model.parents[i]<0?carMatrix:nodeMatrix(model.parents[i]),localMatrix(model.nodes[i]));}
 const doc=new Document(),buffer=doc.createBuffer(),instances=[];
 for(let i=0;i<model.meshInstances.length;i++){
  const instance=model.meshInstances[i],mesh=model.meshes[instance.mesh],materialId=asset.data.mapping[i]?.material,material=config.assets[materialId],name=model.nodes[instance.node].name;
  // Ground shadow is a display plane, not car geometry. Null material is a helper.
  if(!material||material.name==='Shadow'||name==='Shadow'||material.data.opacity===0)continue;
  const v=model.vertices[mesh.vertices],p=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(Float32Array.from(v.position.data)).setBuffer(buffer));
  if(v.normal)p.setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(Float32Array.from(v.normal.data)).setBuffer(buffer));
  if(v.texCoord0)p.setAttribute('TEXCOORD_0',doc.createAccessor().setType('VEC2').setArray(Float32Array.from(v.texCoord0.data)).setBuffer(buffer));
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(mesh.indices)).setBuffer(buffer));
  doc.createMesh(name).addPrimitive(p);
  instances.push({p,matrix:nodeMatrix(instance.node),name,material,materialId});
 }
 const before=instances.reduce((n,x)=>n+x.p.getIndices().getCount()/3,0);
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.35,error:.00045}));
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];const world=[];
 for(const inst of instances){compactPrimitive(inst.p);const pos=inst.p.getAttribute('POSITION').getArray(),normal=inst.p.getAttribute('NORMAL')?.getArray(),uv=inst.p.getAttribute('TEXCOORD_0')?.getArray();const nm=mat3.normalFromMat4(mat3.create(),inst.matrix),vertices=new Float32Array(pos.length/3*8),v=vec3.create(),n=vec3.create();
  for(let i=0;i<pos.length/3;i++){vec3.transformMat4(v,pos.subarray(i*3,i*3+3),inst.matrix);vec3.set(n,normal?.[i*3]??0,normal?.[i*3+1]??1,normal?.[i*3+2]??0);vec3.transformMat3(n,n,nm);vec3.normalize(n,n);for(let j=0;j<3;j++){vertices[i*8+j]=v[j];vertices[i*8+3+j]=n[j];min[j]=Math.min(min[j],v[j]);max[j]=Math.max(max[j],v[j]);}vertices[i*8+6]=uv?.[i*2]??0;vertices[i*8+7]=uv?.[i*2+1]??0;}
  world.push({...inst,vertices});
 }
 const sourceBounds={min:[...min],max:[...max]};console.log('source bounds',sourceBounds,'before tris',before);
 const center=(min[0]+max[0])/2,ground=min[1],primitives=[];min=[Infinity,Infinity,Infinity];max=[-Infinity,-Infinity,-Infinity];
 for(const inst of world){const {material:m,vertices}=inst,d=m.data,name=m.name,paint=[199247467,203792732].includes(inst.materialId);let color=d.diffuse||[.25,.25,.25],alpha=d.opacity??1,material=2;
  const glass=/window|win black|sunroof glass/i.test(name);
  if(paint){material=0;color=[.7,.7,.7];}
  else if(glass){material=1;color=[.055,.075,.09];alpha=1;}
  else if(/chrome|silver|mirror|Disk/i.test(name)){material=3;if(Math.max(...color)<.25)color=[.6,.63,.66];}
  else if(/lamp|^HL|^RL|^rl |rear stop|Rear Line|fog/i.test(name)){material=4;}
  let texture=null,texId=d.diffuseMap||d.emissiveMap;const tex=config.assets[texId];
  if(tex&&!paint&&!glass){const file=path.join(srcDir,'textures',texId+'-'+tex.file.filename);texture='data:'+(file.toLowerCase().endsWith('.png')?'image/png':'image/jpeg')+';base64,'+fs.readFileSync(file).toString('base64');if(!d.diffuseTint)color=[1,1,1];}
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let i=0;i<vertices.length;i+=8){let x=vertices[i],y=vertices[i+1],z=vertices[i+2],nx=vertices[i+3],ny=vertices[i+4],nz=vertices[i+5];vertices[i]=-(x-center);vertices[i+1]=z;vertices[i+2]=y-ground;vertices[i+3]=-nx;vertices[i+4]=nz;vertices[i+5]=ny;for(let j=0;j<3;j++){assert(Number.isFinite(vertices[i+j]),'Non-finite vertex');bounds.min[j]=Math.min(bounds.min[j],vertices[i+j]);bounds.max[j]=Math.max(bounds.max[j],vertices[i+j]);min[j]=Math.min(min[j],vertices[i+j]);max[j]=Math.max(max[j],vertices[i+j]);}}
  const raw=inst.p.getIndices().getArray(),indices=vertices.length/8<65536?new Uint16Array(raw):new Uint32Array(raw);for(const i of indices)assert(i<vertices.length/8,'Invalid index');
  primitives.push({name:inst.name,materialName:name,color,material,paint,alpha,texture,vertices:b64(vertices),indices:b64(indices),indexType:indices.BYTES_PER_ELEMENT,bounds,triangles:indices.length/3});
 }
 assert(max[0]-min[0]>5.0&&max[0]-min[0]<5.4,'Unexpected Carnival length');assert(max[2]>1.7&&max[2]<1.9,'Unexpected Carnival height');
 const payload={id:'carnival',source:{kind:'manufacturer-mesh',label:'Kia Carnival · 공식 3D 외관',url:'https://www.kia.com/in/vr/showroom/index.html',configuration:'Kia India Carnival Limousine facelift KA4, public exterior6 scene, original closed doors and 18-inch wheels. Indian RHD trim differs from Korean Noblesse hybrid.'},bounds:{min,max},triangles:primitives.reduce((n,p)=>n+p.triangles,0),primitives};
 fs.writeFileSync(path.join(dir,'carnival-runtime.js'),'/* Kia manufacturer source geometry; see kia-sources.json. */\nManufacturerModels.registerCompressed('+JSON.stringify(gzipSync(JSON.stringify(packTextures(payload)),{level:9}).toString('base64'))+');\n');
 fs.writeFileSync(path.join(dir,'carnival-runtime-summary.json'),JSON.stringify({...payload,sourceBounds,sourceTriangles:before,primitives:primitives.map(({vertices,indices,texture,...p})=>({...p,textureBytes:texture?.length||0}))},null,2));console.log('carnival',primitives.length,payload.triangles,fs.statSync(path.join(dir,'carnival-runtime.js')).size,payload.bounds);
}
async function morning(){
 const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(path.join(dir,'morning/picanto.glb'));
 // The public model-viewer starts 00_OPEN at time zero (all five closures closed).
 const animation=doc.getRoot().listAnimations().find(a=>a.getName()==='00_OPEN');assert(animation,'Missing public starting animation');
 for(const c of animation.listChannels()){const n=c.getTargetNode(),p=c.getTargetPath(),out=c.getSampler().getOutput(),a=Array.from(out.getArray()).slice(0,out.getElementSize());if(p==='translation')n.setTranslation(a);else if(p==='rotation')n.setRotation(a);else if(p==='scale')n.setScale(a);}
 const before=doc.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((t,p)=>t+p.getIndices().getCount()/3,0),0);
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.45,error:.001}));
 // The closed, opaque exterior glazing hides these explicitly named cabin parts.
 // Keep ambiguous generic nodes and every exterior mesh to avoid changing shape.
 const selected=[];doc.getRoot().getDefaultScene().traverse(n=>{if(n.getMesh()&&!/^Int_/i.test(n.getName()))selected.push(n)});
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];const world=[];
 for(const node of selected)for(const p of node.getMesh().listPrimitives()){
  compactPrimitive(p);const matrix=node.getWorldMatrix(),nm=mat3.normalFromMat4(mat3.create(),matrix),pos=p.getAttribute('POSITION').getArray(),normal=p.getAttribute('NORMAL')?.getArray(),uv=p.getAttribute('TEXCOORD_0')?.getArray(),vertices=new Float32Array(pos.length/3*8),v=vec3.create(),n=vec3.create();
  for(let i=0;i<pos.length/3;i++){vec3.transformMat4(v,pos.subarray(i*3,i*3+3),matrix);vec3.set(n,normal?.[i*3]??0,normal?.[i*3+1]??1,normal?.[i*3+2]??0);vec3.transformMat3(n,n,nm);vec3.normalize(n,n);for(let j=0;j<3;j++){vertices[i*8+j]=v[j];vertices[i*8+3+j]=n[j];min[j]=Math.min(min[j],v[j]);max[j]=Math.max(max[j],v[j]);}vertices[i*8+6]=uv?.[i*2]??0;vertices[i*8+7]=uv?.[i*2+1]??0;}
  world.push({node,p,vertices});
 }
 const sourceBounds={min:[...min],max:[...max]},center=(min[2]+max[2])/2,ground=min[1],primitives=[];min=[Infinity,Infinity,Infinity];max=[-Infinity,-Infinity,-Infinity];
 for(const {node,p,vertices}of world){const m=p.getMaterial(),name=m?.getName()||'',base=m?.getBaseColorFactor()||[.4,.4,.4,1],paint=/^Car_paint/.test(name);let color=base.slice(0,3).map(v=>Math.pow(v,1/2.2)),alpha=base[3],material=2,texture=m?.getBaseColorTexture();
  if(paint)material=0;else if(/Glass_tinted/.test(name)||(/Glass_clear/.test(name)&&/wind|glasswindow|door/i.test(node.getName()))){material=1;color=[.055,.075,.09];alpha=1;}
  else if(/chrome|aluminium|mirror/i.test(name)){material=3;}else if(/light/i.test(name)){material=4;}
  if(/Glass_clear/.test(name)&&!/headlight|lamp/i.test(node.getName())){material=1;color=[.055,.075,.09];alpha=1;}
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let i=0;i<vertices.length;i+=8){let x=vertices[i],y=vertices[i+1],z=vertices[i+2],nx=vertices[i+3],ny=vertices[i+4],nz=vertices[i+5];vertices[i]=-(z-center);vertices[i+1]=-x;vertices[i+2]=y-ground;vertices[i+3]=-nz;vertices[i+4]=-nx;vertices[i+5]=ny;for(let j=0;j<3;j++){assert(Number.isFinite(vertices[i+j]));bounds.min[j]=Math.min(bounds.min[j],vertices[i+j]);bounds.max[j]=Math.max(bounds.max[j],vertices[i+j]);min[j]=Math.min(min[j],vertices[i+j]);max[j]=Math.max(max[j],vertices[i+j]);}}
  const raw=p.getIndices().getArray(),indices=vertices.length/8<65536?new Uint16Array(raw):new Uint32Array(raw);for(const i of indices)assert(i<vertices.length/8);
  primitives.push({name:node.getName(),materialName:name,color,material,paint,alpha,textureOpaque:m?.getAlphaMode()==='OPAQUE',texture:texture?'data:'+texture.getMimeType()+';base64,'+b64(texture.getImage()):null,vertices:b64(vertices),indices:b64(indices),indexType:indices.BYTES_PER_ELEMENT,bounds,triangles:indices.length/3});
 }
 assert(max[0]-min[0]>3.5&&max[0]-min[0]<3.8,'Unexpected Picanto length');assert(max[2]>1.4&&max[2]<1.6,'Unexpected Picanto height');
 const payload={id:'morning',source:{kind:'dealer-mesh',label:'Kia Picanto · 딜러 공개 3D 외관',url:'https://kia-picanto-2024.meta-sense.fr/',configuration:'2024 Kia Picanto exterior from Edenauto launch campaign by Metasense. Exact sales trim is unconfirmed; source parts include both GT-Line and Baseline names. Default 00_OPEN time-zero closed doors; original European wheels and badges differ from Korean Morning. Explicitly named Int_ cabin meshes hidden by opaque glazing are omitted for race performance.'},bounds:{min,max},triangles:primitives.reduce((n,p)=>n+p.triangles,0),primitives};
 fs.writeFileSync(path.join(dir,'morning-runtime.js'),'/* Kia Edenauto / Metasense campaign source geometry; see kia-sources.json. */\nManufacturerModels.registerCompressed('+JSON.stringify(gzipSync(JSON.stringify(packTextures(payload)),{level:9}).toString('base64'))+');\n');
 fs.writeFileSync(path.join(dir,'morning-runtime-summary.json'),JSON.stringify({...payload,sourceBounds,sourceTriangles:before,primitives:primitives.map(({vertices,indices,texture,...p})=>({...p,textureBytes:texture?.length||0}))},null,2));console.log('morning',primitives.length,payload.triangles,fs.statSync(path.join(dir,'morning-runtime.js')).size,payload.bounds);
}
const requested=new Set(process.argv.slice(2));
if(!requested.size||requested.has('carnival'))await carnival();
if(!requested.size||requested.has('morning'))await morning();
