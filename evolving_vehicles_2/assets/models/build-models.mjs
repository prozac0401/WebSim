/** Reproducible local conversion of publicly served manufacturer meshes.
 * Install tooling: npm install --prefix output/model-tools @gltf-transform/core
 * @gltf-transform/extensions @gltf-transform/functions draco3dgltf meshoptimizer gl-matrix
 * Run from repository root: node evolving_vehicles_2/assets/models/build-models.mjs
 * Source meshes/assembly and provenance are preserved beside this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {pathToFileURL,fileURLToPath} from 'node:url';
const require=createRequire(path.resolve('output/model-tools/package.json'));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const {weld,simplify,compactPrimitive}=await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const {MeshoptSimplifier}=await import(pathToFileURL(require.resolve('meshoptimizer')));
const draco=require('draco3dgltf'),{mat3,vec3}=require('gl-matrix');
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const dir=path.dirname(fileURLToPath(import.meta.url));
const b64=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
function geometry(primitive,matrix,convert){
 compactPrimitive(primitive);
 const p=primitive.getAttribute('POSITION').getArray(),n=primitive.getAttribute('NORMAL')?.getArray(),uv=primitive.getAttribute('TEXCOORD_0')?.getArray();
 const data=new Float32Array(p.length/3*8),normalMatrix=mat3.normalFromMat4(mat3.create(),matrix),v=vec3.create(),nn=vec3.create(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<p.length/3;i++){
  vec3.set(v,p[i*3],p[i*3+1],p[i*3+2]);vec3.transformMat4(v,v,matrix);
  vec3.set(nn,n?.[i*3]??0,n?.[i*3+1]??1,n?.[i*3+2]??0);vec3.transformMat3(nn,nn,normalMatrix);vec3.normalize(nn,nn);
  const q=convert(v,false),r=convert(nn,true);for(let j=0;j<3;j++){data[i*8+j]=q[j];data[i*8+j+3]=r[j];min[j]=Math.min(min[j],q[j]);max[j]=Math.max(max[j],q[j]);}
  data[i*8+6]=uv?.[i*2]??0;data[i*8+7]=uv?.[i*2+1]??0;
 }
 const raw=primitive.getIndices()?.getArray()||Uint32Array.from({length:p.length/3},(_,i)=>i);
 const indices=p.length/3<65536?new Uint16Array(raw):new Uint32Array(raw);
 return {vertices:b64(data),indices:b64(indices),indexType:indices.BYTES_PER_ELEMENT,bounds:{min,max},triangles:indices.length/3};
}
function classify(name,color,paint=false){
 if(paint)return 0;
 if(/glass|window|windshield/i.test(name)&&!/mirror|red|white|lens/i.test(name))return 1;
 if(/chrome|metal|rim|satin|disc|mirror|grille/i.test(name))return 3;
 if(/LED|DRL|STOP|BACKUP|turn|light|lamp/i.test(name)&&Math.max(...color)>.35)return 4;
 return 2;
}
function save(id,primitives,source){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const p of primitives)for(let j=0;j<3;j++){min[j]=Math.min(min[j],p.bounds.min[j]);max[j]=Math.max(max[j],p.bounds.max[j]);}
 const payload={id,source,bounds:{min,max},triangles:primitives.reduce((n,p)=>n+p.triangles,0),primitives};
 fs.writeFileSync(path.join(dir,id+'-runtime.js'),'/* Manufacturer source geometry; see SOURCES.json and MODEL-SOURCES.md. */\nManufacturerModels.registerCompressed('+JSON.stringify(gzipSync(JSON.stringify(payload),{level:9}).toString('base64'))+');\n');
 fs.writeFileSync(path.join(dir,id+'-runtime-summary.json'),JSON.stringify({...payload,primitives:primitives.map(({vertices,indices,texture,...p})=>({...p,textureBytes:texture?.length||0}))},null,2));
 console.log(id,primitives.length+' primitives',payload.triangles+' triangles',fs.statSync(path.join(dir,id+'-runtime.js')).size+' bytes',payload.bounds);
}
async function g80(){
 const assembly=JSON.parse(fs.readFileSync(path.join(dir,'g80/assembly.json'))),docs=new Map(),primitives=[];
 for(const file of new Set(assembly.instances.map(i=>i.file))){
  const doc=await io.read(path.join(dir,'g80',file));
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.20,error:.00045}));docs.set(file,doc);
 }
 const center=.07338798;
 for(const inst of assembly.instances){
  const mesh=docs.get(inst.file).getRoot().listMeshes()[inst.mesh];
  for(const [i,p]of mesh.listPrimitives().entries()){
   const m=assembly.materials[inst.materials[i]||inst.materials[0]]||{},d=m.data||m,name=m.name||'',paint=inst.name==='model_body_paint';
   let color=d.diffuse||[.25,.25,.25],alpha=d.opacity??1;
   if(/Glass_Windshield/.test(name)){color=[.055,.075,.09];alpha=1;}
   if(/CHROME|Chrome|Rim_Chrome/i.test(name)&&Math.max(...color)<.2)color=[.65,.68,.70];
   if(/DRL|LED_LENS|LGT_R_BACKUP_REF/.test(name))color=[.8,.87,.9];
   if(/Glass_Rear_Red|LGT_POS_GLASS_WHITE/.test(name))color=[.6,.025,.03];
   const material=classify(name,color,paint);
   primitives.push({...geometry(p,inst.matrix,(v,normal)=>[-v[0]+(normal?0:center),v[2],v[1]+(normal?0:.0102)]),name:inst.name,materialName:name,color,material,paint,alpha,texture:null});
  }
 }
 save('g80',primitives,{kind:'manufacturer-mesh',label:'Genesis G80 2.5T · 공식 3D 외관',url:'https://playcanv.as/e/p/ignV6Ejt',configuration:'Public configurator active 2.5T body and wheel assembly; cosmetic trim is shared across simulated engines.'});
}
async function ioniq5(){
 const doc=await io.read(path.join(dir,'ioniq5/IONIQ5-7.glb'));
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.45,error:.00035}));
 const config=JSON.parse(fs.readFileSync(path.join(dir,'ioniq5/config.json'))),names=new Set(config.options[0].visibleObjs.map(n=>config.objectNames[n]||n)),primitives=[];
 for(const node of doc.getRoot().listNodes()){
  if(!node.getMesh()||!names.has(node.getName()))continue;
  for(const p of node.getMesh().listPrimitives()){
   const m=p.getMaterial(),name=m?.getName()||'',paint=/carpaint|body.?paint|exterior.?paint|AtlasWhite/i.test(name),base=m?.getBaseColorFactor()||[.4,.4,.4,1],texture=m?.getBaseColorTexture();
   let color=base.slice(0,3).map(x=>Math.pow(x,1/2.2)),alpha=base[3];
   // The race exterior uses dark privacy glazing; clear headlight lenses stay
   // transparent. This avoids unsorted opposite-side cabin glass overlays.
   if(/WINDOW/i.test(name)){color=[.055,.075,.085];alpha=1;}
   // Manufacturer coordinates are Y-up; orientation is verified by front lamps.
   primitives.push({...geometry(p,node.getWorldMatrix(),(v,normal)=>[-v[0],v[2],v[1]]),name:node.getName(),materialName:name,color,material:classify(name,color,paint),paint,alpha,texture:texture?'data:'+texture.getMimeType()+';base64,'+b64(texture.getImage()):null});
  }
 }
 save('ioniq5',primitives,{kind:'manufacturer-mesh',label:'Hyundai IONIQ 5 · 공식 3D 외관',url:'https://www.hyundai.com/au/en/cars/eco/ioniq5',configuration:'Official 2026 IONIQ 5 stock exterior; excludes N-Line/premium alternative parts.'});
}
await g80();await ioniq5();
