/** Deterministic conversion of Mpgs Studios' CC BY 4.0 Toyota Supra mesh.
 * Input: output/free-models/supra/mpgs/gr_supra.gltf and scene.bin.
 * See supra-source.json and supra-LICENSE.txt for source, mirror, and attribution.
 * No network, AI model generation, or AI dataset processing is performed here.
 * Dependencies match build-models.mjs. Run from the repository root.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';import {createRequire} from 'node:module';import {pathToFileURL,fileURLToPath} from 'node:url';
const require=createRequire(path.resolve('output/model-tools/package.json'));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const {ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const {weld,simplify,compactPrimitive}=await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const {MeshoptSimplifier}=await import(pathToFileURL(require.resolve('meshoptimizer')));
const {mat3,vec3}=require('gl-matrix');const sharp=require('sharp');await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const output=path.dirname(fileURLToPath(import.meta.url));
const filename=path.resolve('output/free-models/supra/mpgs/gr_supra.gltf');
const b64=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
function worldBounds(nodes){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],v=vec3.create();
 for(const n of nodes)if(n.getMesh())for(const p of n.getMesh().listPrimitives()){
  const positions=p.getAttribute('POSITION').getArray();for(let i=0;i<positions.length;i+=3){vec3.transformMat4(v,positions.subarray(i,i+3),n.getWorldMatrix());for(let j=0;j<3;j++){min[j]=Math.min(min[j],v[j]);max[j]=Math.max(max[j],v[j]);}}
 }return {min,max};
}
const doc=await io.read(filename),sourceBounds=worldBounds(doc.getRoot().listNodes());
const scale=4.38/(sourceBounds.max[2]-sourceBounds.min[2]);
const center=[(sourceBounds.min[0]+sourceBounds.max[0])/2,sourceBounds.min[1],(sourceBounds.min[2]+sourceBounds.max[2])/2];
const textures=[],textureIndices=new Map();
const hiddenCabinNodes=new Set(['Object_21','Object_22','Object_23','Object_24','Object_25','Object_90','Object_91','Object_93','Object_94','Object_95','Object_96','Object_97','Object_98']);
async function appearance(primitive,nodeName){
 const material=primitive.getMaterial(),name=material?.getName()||'',base=material?.getBaseColorFactor()||[.3,.3,.3,1];
 const paint=/^body/i.test(name),darkGlass=/^Glass\.013$/.test(name),metal=/chrome|metal|Material\.035/i.test(name);
 let color=base.slice(0,3).map(x=>Math.pow(x,1/2.2)),alpha=base[3],type=paint?0:darkGlass?1:metal?3:2;
 if(darkGlass){color=[.06,.08,.10];alpha=1;}
 if(nodeName.endsWith('_lampCover')){color=[.32,.36,.40];alpha=.06;}
 if(metal){alpha=1;}
 // The rear diffuser is glossy black plastic, not light-absorbing rubber.
 // Keep a fixed charcoal base while using the environment reflection shader.
 if(nodeName==='Object_54'){type=0;color=[.045,.048,.052];alpha=1;}
 // The source labels the dark red lens as .001 and its LED light guide as
 // unsuffixed tailight. Keep the housing dark, with only the guide glowing.
 if(name==='tailight.001'){type=2;color=[.10,.009,.014];alpha=1;}
 if(name==='tailight'||/^tailight\.(002|003|004)$/.test(name)){type=4;color=[.92,.025,.032];alpha=1;}
 if(name==='headlight'){type=4;color=[.88,.93,.98];alpha=1;}
 if(/^glass/i.test(name)&&!darkGlass){type=1;alpha=Math.min(alpha,.20);}
 // True black values obscure the tire sidewalls in the software renderer.
 if(/^Front_Tire/.test(name))color=[.045,.047,.05];
 else if(Math.max(...color)<.001)color=[.025,.028,.033];
 const texture=material?.getBaseColorTexture();let textureIndex;
 if(texture&&!paint&&!darkGlass){
  if(!textureIndices.has(texture)){
   const data=await sharp(texture.getImage()).resize(1024,1024,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
   textureIndices.set(texture,textures.length);textures.push('data:image/png;base64,'+data.toString('base64'));
  }textureIndex=textureIndices.get(texture);
 }
 return {materialName:name,color,alpha,paint,material:type,textureIndex};
}
function geometry(p,matrix){
 compactPrimitive(p);const positions=p.getAttribute('POSITION').getArray(),normals=p.getAttribute('NORMAL')?.getArray();
 const ti=p.getMaterial()?.getBaseColorTextureInfo(),tt=ti?.getExtension('KHR_texture_transform');
 const uv=p.getAttribute('TEXCOORD_'+(tt?.getTexCoord()??ti?.getTexCoord()??0))?.getArray();
 const uvScale=tt?.getScale()||[1,1],uvOffset=tt?.getOffset()||[0,0],rotation=tt?.getRotation()||0,c=Math.cos(rotation),s=Math.sin(rotation);
 const vertices=new Float32Array(positions.length/3*8),normalMatrix=mat3.normalFromMat4(mat3.create(),matrix),v=vec3.create(),n=vec3.create();
 const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(let i=0;i<positions.length/3;i++){
  vec3.transformMat4(v,positions.subarray(i*3,i*3+3),matrix);vec3.set(n,normals?.[i*3]??0,normals?.[i*3+1]??1,normals?.[i*3+2]??0);vec3.transformMat3(n,n,normalMatrix);vec3.normalize(n,n);
  // Front headlamps are at source -Z; tail lamps at +Z. This is a proper
  // rotation (determinant +1), preserving winding and outward normals.
  const a=[-(v[2]-center[2])*scale,-(v[0]-center[0])*scale,(v[1]-center[1])*scale],nn=[-n[2],-n[0],n[1]];
  for(let j=0;j<3;j++){assert(Number.isFinite(a[j])&&Number.isFinite(nn[j]));vertices[i*8+j]=a[j];vertices[i*8+j+3]=nn[j];bounds.min[j]=Math.min(bounds.min[j],a[j]);bounds.max[j]=Math.max(bounds.max[j],a[j]);}
  const u=(uv?.[i*2]??0)*uvScale[0],w=(uv?.[i*2+1]??0)*uvScale[1];vertices[i*8+6]=uvOffset[0]+c*u-s*w;vertices[i*8+7]=uvOffset[1]+s*u+c*w;
 }
 const raw=p.getIndices()?.getArray()||Uint32Array.from({length:positions.length/3},(_,i)=>i);
 for(const x of raw)assert(x<positions.length/3);return {vertices,indices:Uint32Array.from(raw),bounds};
}
function pack(groups){return [...groups.values()].map(g=>{
 const vertices=new Float32Array(g.vertices.flat()),raw=g.indices.flat(),indices=vertices.length/8<65536?new Uint16Array(raw):new Uint32Array(raw);
 return {...g.appearance,name:g.names.join(' | '),vertices:b64(vertices),indices:b64(indices),indexType:indices.BYTES_PER_ELEMENT,bounds:g.bounds,triangles:indices.length/3};
});}
// Small authored details fill omissions in the community mesh. Their placement
// uses the source recesses and Toyota's 2019 rear photograph (see source JSON).
// Coordinates here remain in the source frame (+Z rear, +Y up).
function authoredPrimitive(name,color,material,polygons,textureIndex){
 const data=[],indices=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(const {points,uv=[]} of polygons){
  const u=vec3.subtract(vec3.create(),points[1],points[0]),v=vec3.subtract(vec3.create(),points[2],points[0]),n=vec3.normalize(vec3.create(),vec3.cross(vec3.create(),u,v)),start=data.length/8;
  points.forEach((p,i)=>{const pos=[-(p[2]-center[2])*scale,-(p[0]-center[0])*scale,(p[1]-center[1])*scale];data.push(...pos,-n[2],-n[0],n[1],...(uv[i]||[0,0]));for(let j=0;j<3;j++){bounds.min[j]=Math.min(bounds.min[j],pos[j]);bounds.max[j]=Math.max(bounds.max[j],pos[j]);}});
  for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);
 }
 return {name,materialName:name,color,alpha:1,paint:false,material,textureIndex,vertices:b64(new Float32Array(data)),indices:b64(new Uint16Array(indices)),indexType:2,bounds,triangles:indices.length/3};
}
async function rearDetails(){
 const z=y=>1.296+(y-.35)*.075;
 // The simulator's rear camera sees increasing local +Y to screen right.
 // Source +X becomes local -Y, so reverse U to keep the plate readable.
 const quad=(x0,y0,x1,y1,depth=0)=>({points:[[x0,y0,z(y0)+depth],[x1,y0,z(y0)+depth],[x1,y1,z(y1)+depth],[x0,y1,z(y1)+depth]],uv:[[1,1],[0,1],[0,0],[1,0]]});
 const frame=quad(-.185,.350,.185,.454),face=quad(-.176,.358,.176,.446,.003),bevel=[];
 for(let i=0;i<4;i++){const j=(i+1)%4;bevel.push({points:[frame.points[i],frame.points[j],face.points[j],face.points[i]]});}
 // Display plate, not a real vehicle registration or a photograph texture.
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="768" height="192" viewBox="0 0 768 192"><rect width="768" height="192" rx="10" fill="#171a1d"/><rect x="7" y="7" width="754" height="178" rx="8" fill="none" stroke="#aab0b2" stroke-width="3"/><text x="384" y="131" text-anchor="middle" font-family="Arial,sans-serif" font-size="110" font-weight="700" letter-spacing="5" fill="#edf0ed">GR SUPRA</text></svg>';
 const plateTexture=textures.length;textures.push('data:image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64'));
 const generated=[authoredPrimitive('WebSim_display_plate_frame',[.17,.18,.19],3,bevel),authoredPrimitive('WebSim_display_plate',[1,1,1],2,[face],plateTexture)];
 const lensZ=y=>1.349+(y-.19)*.13;
 const panel={points:[[-.035,.187,lensZ(.187)],[.035,.187,lensZ(.187)],[.047,.260,lensZ(.260)],[-.047,.260,lensZ(.260)]]};
 generated.push(authoredPrimitive('WebSim_reverse_lamp_housing',[.018,.020,.024],2,[panel]));
 const lenses=[];
 for(let row=0;row<4;row++)for(let col=0;col<5;col++){
  const y=.201+row*.014,x=(col-2)*(.012+row*.001),radius=.0025;
  const points=[];for(let i=0;i<10;i++){const a=i*Math.PI/5;points.push([x+radius*Math.cos(a),y+radius*Math.sin(a),lensZ(y)+.0015]);}lenses.push({points});
 }
 generated.push(authoredPrimitive('WebSim_reverse_lamp_lenses',[.48,.49,.50],3,lenses));return generated;
}
async function convert(document,ratio,error,fallback=false){
 await document.transform(weld());
 const groups=new Map();
 for(const node of document.getRoot().listNodes())if(node.getMesh()&&!hiddenCabinNodes.has(node.getName()))for(const original of node.getMesh().listPrimitives()){
  const variants=[];
  if(original.getMaterial()?.getName()==='Glass.013'){
   const surface=[],covers=[],array=original.getAttribute('POSITION').getArray(),indices=original.getIndices().getArray(),v=vec3.create(),matrix=node.getWorldMatrix();
   for(let i=0;i<indices.length;i+=3){
    const centerPoint=vec3.create();for(let j=0;j<3;j++){vec3.transformMat4(v,array.subarray(indices[i+j]*3,indices[i+j]*3+3),matrix);vec3.add(centerPoint,centerPoint,v);}vec3.scale(centerPoint,centerPoint,1/3);
    const target=centerPoint[1]<.57&&Math.abs(centerPoint[2])>1.05?covers:surface;target.push(indices[i],indices[i+1],indices[i+2]);
   }
   for(const [part,suffix] of [[surface,''],[covers,'_lampCover']])if(part.length){const p=original.clone();p.setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(part)));variants.push([p,node.getName()+suffix]);}
  }else variants.push([original,node.getName()]);
  for(const [p,partName] of variants){
  if(p.getMode()!==4)continue; // Two source primitives are lines, not surfaces.
  const mat=p.getMaterial()?.getName()||'';
  if(fallback&&/^mat_mt\.001$/i.test(mat))continue; // hidden cabin details
  if(fallback){
   const indices=p.getIndices(),positions=p.getAttribute('POSITION').getArray();
   const target=Math.max(36,Math.floor(indices.getCount()*ratio/3)*3);
   if(indices.getCount()>target){
    const [result]=MeshoptSimplifier.simplifySloppy(indices.getArray(),positions,3,null,target,error);
    if(result.length>=3)p.setIndices(document.createAccessor().setType('SCALAR').setArray(result));
   }
  }else{
   const indices=p.getIndices(),positions=p.getAttribute('POSITION').getArray(),normals=p.getAttribute('NORMAL')?.getArray(),paint=/^body/.test(mat);
   // Close chase views expose the compound rear bumper/ducktail curvature,
   // chrome tip circles and badges. Preserve these separately from cabin mesh.
   const rearPaint=['Object_4','Object_30','Object_32','Object_35'].includes(partName);
   const rearDetail=['Object_45','Object_48','Object_49','Object_54','Object_100','Object_9','Object_11'].includes(partName);
   const detailRatio=partName==='Object_30'?1:rearPaint?.16:partName==='Object_48'?.65:rearDetail?.22:paint?.06:ratio;
   const detailError=(rearPaint||rearDetail)?.0015:.003;
   const target=Math.max(3,Math.floor(indices.getCount()*detailRatio/3)*3);
   const [result]=(paint||rearDetail)&&normals?MeshoptSimplifier.simplifyWithAttributes(indices.getArray(),positions,3,normals,3,[1,1,1],null,target,detailError):MeshoptSimplifier.simplify(indices.getArray(),positions,3,target,error);
   p.setIndices(document.createAccessor().setType('SCALAR').setArray(result));
  }
  const a=await appearance(p,partName),g=geometry(p,node.getWorldMatrix()),key=JSON.stringify(a);let group=groups.get(key);
  if(!group){group={appearance:a,names:[],vertices:[],indices:[],count:0,bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}};groups.set(key,group);}
  group.names.push(partName);for(const x of g.vertices)group.vertices.push(x);for(const x of g.indices)group.indices.push(x+group.count);group.count+=g.vertices.length/8;
  for(let j=0;j<3;j++){group.bounds.min[j]=Math.min(group.bounds.min[j],g.bounds.min[j]);group.bounds.max[j]=Math.max(group.bounds.max[j],g.bounds.max[j]);}
 }
 }
 return pack(groups);
}
const primitives=await convert(doc,.02,.008);
const low=await io.read(filename),fallbackPrimitives=await convert(low,.0015,.10,true);
const details=await rearDetails();primitives.push(...details);fallbackPrimitives.push(...details);
const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const p of primitives)for(let j=0;j<3;j++){bounds.min[j]=Math.min(bounds.min[j],p.bounds.min[j]);bounds.max[j]=Math.max(bounds.max[j],p.bounds.max[j]);}
const source={kind:'community-mesh',label:'Toyota GR Supra A90 · 커뮤니티 3D 외관',url:'https://sketchfab.com/3d-models/toyota-supra-3d-model-free-41b83cfb912b4eab9af19a802bcf5ffc',author:'Mpgs Studios',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',configuration:'Community A90 exterior, modeled in Blender; not a manufacturer-authenticated trim-specific model. Simplified and reoriented for real-time rendering.'};
const data={id:'supra',source,bounds,triangles:primitives.reduce((s,p)=>s+p.triangles,0),primitives,textures,fallbackPrimitives,fallbackTriangles:fallbackPrimitives.reduce((s,p)=>s+p.triangles,0)};
assert(Math.abs(bounds.min[2])<.001,'Ground mismatch');
assert(bounds.max[0]-bounds.min[0]>4.35&&bounds.max[0]-bounds.min[0]<4.40,'Length mismatch');
fs.writeFileSync(path.join(output,'supra-runtime.js'),'/* Mpgs Studios, CC BY 4.0; see supra-LICENSE.txt and supra-source.json. */\nManufacturerModels.registerCompressed('+JSON.stringify(gzipSync(JSON.stringify(data),{level:9}).toString('base64'))+');\n');
const summary={...data,sourceBounds,scale,textures:textures.map(x=>({bytes:x.length})),fallbackTriangles:fallbackPrimitives.reduce((s,p)=>s+p.triangles,0),primitives:primitives.map(({vertices,indices,...p})=>p),fallbackPrimitives:fallbackPrimitives.map(({vertices,indices,...p})=>p)};
fs.writeFileSync(path.join(output,'supra-runtime-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({triangles:data.triangles,primitives:primitives.length,fallbackTriangles:summary.fallbackTriangles,fallbackPrimitives:fallbackPrimitives.length,bounds,bytes:fs.statSync(path.join(output,'supra-runtime.js')).size},null,2));
