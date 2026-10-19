/** Deterministic conversion of zapkolenko07's CC BY 4.0 Kia K5 2025.
 * node evolving_vehicles_2/assets/models/build-free-k5.mjs [source.glb] [output-directory]
 * Uses the normal signed-in Sketchfab download; no network or generated geometry.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
const require=createRequire(path.resolve('output/model-tools/package.json'));
const {NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const {MeshoptSimplifier}=await import(pathToFileURL(require.resolve('meshoptimizer')));
const {vec3,mat3}=require('gl-matrix');
await MeshoptSimplifier.ready;
const inputPath=path.resolve(process.argv[2]||'output/actual-mesh-qa/k5-2025/source.glb');
const folder=process.argv[3]?path.resolve(process.argv[3]):path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(folder,{recursive:true});
const input=fs.readFileSync(inputPath),sha256='07891ce115dab0194027de0eee2b8ab525232963c5009d564cd8bd1e98aea07f';
assert.equal(createHash('sha256').update(input).digest('hex'),sha256,'Pinned original GLB required');
const json=JSON.parse(input.subarray(20,20+input.readUInt32LE(12)).toString());
assert.match(json.asset.extras.author,/zapkolenko07/);
assert.match(json.asset.extras.license,/CC-BY-4\.0/);
assert.match(json.asset.extras.source,/0ed1b1fb1a074a42849076b96a15ce9f$/);
assert.equal((json.images||[]).length,0);
const doc=await new NodeIO().read(inputPath),parts=[];
const empty=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
const include=(b,p)=>{for(let k=0;k<3;k++){b.min[k]=Math.min(b.min[k],p[k]);b.max[k]=Math.max(b.max[k],p[k]);}};
const b64=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
// Original front-light geometry is world -X; world -Y is up. Reflect world
// +Z into runtime +Y so rear K5 lettering stays on the original screen side.
const canonical=p=>[-p[0],p[2],-p[1]],sourceBounds=empty();
for(const node of doc.getRoot().listNodes())if(node.getMesh())for(const primitive of node.getMesh().listPrimitives()){
 assert.equal(primitive.getMode(),4);assert(primitive.getAttribute('NORMAL'));
 const bounds=empty(),position=primitive.getAttribute('POSITION');
 for(let i=0;i<position.getCount();i++){const p=canonical(vec3.transformMat4([],position.getElement(i,[]),node.getWorldMatrix()));include(bounds,p);include(sourceBounds,p);}
 parts.push({node,primitive,bounds,name:node.getName(),materialName:primitive.getMaterial().getName()});
}
const sourceTriangles=parts.reduce((s,p)=>s+p.primitive.getIndices().getCount()/3,0);
assert.equal(sourceTriangles,345765);assert.equal(parts.length,88);
const scale=4.905/(sourceBounds.max[0]-sourceBounds.min[0]);
const center=sourceBounds.min.map((v,i)=>i===2?v:(v+sourceBounds.max[i])/2);
const position=p=>canonical(p).map((v,i)=>(v-center[i])*scale);
const wheelSources=parts.filter(p=>p.materialName==='Rubber_Rough');
assert.equal(wheelSources.length,4);
const wheelCenters=wheelSources.map(p=>{
 const c=p.bounds.min.map((v,i)=>((v+p.bounds.max[i])/2-center[i])*scale);
 return {center:c,radius:(p.bounds.max[2]-p.bounds.min[2])*scale/2,axle:c[0]>0?'front':'rear',side:c[1]>0?1:-1,sourceName:p.name};
});
const hex='#e7e9e5',paintReference={name:'스노우 화이트 펄',code:'SWP',hex,finish:'pearl',roughness:.22,clearcoat:.92,rgbStatus:'estimated-display-color',sourceUrl:'https://www.kia.com/content/dam/kwp/kr/ko/vehicles/pdf/catalog/catalog_k5.pdf'};
function appearance(p){
 const m=p.materialName,n=p.name;
 if(m==='Material_2125747591'||n.startsWith('antena_'))return {role:'factory-paint',paint:true,material:0,color:[231/255,233/255,229/255],alpha:1};
 if(n.startsWith('glass main_')||n.startsWith('body_Ma123'))return {role:'cabin-glass',paint:false,material:1,color:[.075,.10,.115],alpha:1};
 if(n.startsWith('frames main_')||n.startsWith('frame _')||(n.startsWith('body_')&&m==='Material_13422'))return {role:'window-trim',paint:false,material:2,color:[.025,.032,.038],alpha:1};
 if(n.startsWith('lights glass_'))return {role:'lamp-cover',paint:false,material:1,color:m==='Material_2125716590'?[.36,.045,.045]:[.8,.84,.86],alpha:m==='Material_2125716590'?.20:.13};
 if(m==='Red_Light'||m==='material')return {role:'rear-lamp',paint:false,material:4,color:[.65,.018,.027],alpha:1};
 if(m==='white_Light223')return {role:'front-lamp',paint:false,material:4,color:[.88,.94,1],alpha:1};
 if(/^Rubber_Rough/.test(m))return {role:'tire',paint:false,material:2,color:m==='Rubber_Rough'?[.035,.039,.042]:[.055,.059,.061],alpha:1};
 if(m==='steel2'||m==='mirror'||m==='Iron_Clean_Distorted')return {role:n.startsWith('kia logos_')?'badge':m==='mirror'?'mirror':'metal',paint:false,material:3,color:m==='mirror'?[.64,.7,.74]:[.48,.51,.54],alpha:1};
 if(m==='04_-_Default')return {role:'plate',paint:false,material:2,color:[.82,.83,.81],alpha:1};
 if(n.startsWith('interior_'))return {role:'interior',paint:false,material:2,color:[.025,.032,.038],alpha:1};
 return {role:/^(Line|Cylinder00[2468]|Object43|Object45[456])/.test(n)?'stationary-brake-caliper':'trim',paint:false,material:2,color:m==='Material_13422'?[.07,.079,.086]:[.025,.032,.038],alpha:1};
}
const rollingName=/^(wheels_|Object44[789]_|Object45[0123]_|Cylinder00[1357]_)/;
// Imported hard-normal splits on the broad body and glazing would make small
// triangles look dented under pearl lighting. Average only coincident normals
// within 35 degrees, per original part: positions, panel creases and gaps stay.
function smoothNormals(vertices){
 const groups=new Map(),threshold=Math.cos(35*Math.PI/180);
 for(let i=0;i<vertices.length;i+=8){const k=vertices.slice(i,i+3).map(v=>v.toFixed(6)).join(',');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}
 const original=vertices.slice();let adjusted=0;
 for(const group of groups.values())if(group.length>1)for(const at of group){const sum=[0,0,0];
  for(const other of group){const dot=[0,1,2].reduce((s,k)=>s+original[at+3+k]*original[other+3+k],0);if(dot>=threshold)for(let k=0;k<3;k++)sum[k]+=original[other+3+k];}
  const length=Math.hypot(...sum);if(length>1e-8)for(let k=0;k<3;k++){const v=sum[k]/length;if(Math.abs(v-original[at+3+k])>1e-5)adjusted++;vertices[at+3+k]=v;}
 }return adjusted;
}
const groups=new Map();let smoothedNormalComponents=0;
for(const part of parts){
 const {node,primitive,name,materialName}=part,style=appearance(part),rolling=rollingName.test(name);
 const sourceCenter=part.bounds.min.map((v,i)=>((v+part.bounds.max[i])/2-center[i])*scale);
 const wheel=rolling?wheelCenters.reduce((a,b)=>Math.hypot(...a.center.map((v,i)=>v-sourceCenter[i]))<Math.hypot(...b.center.map((v,i)=>v-sourceCenter[i]))?a:b):null;
 const key=materialName+'|'+style.role+(wheel?'|'+wheel.axle+'|'+wheel.side:'');
 if(!groups.has(key))groups.set(key,{materialName,...style,wheel,vertices:[],indices:[],remap:new Map(),sourceParts:[]});
 const group=groups.get(key),pos=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL'),matrix=node.getWorldMatrix(),normalMatrix=mat3.normalFromMat4(mat3.create(),matrix),vertices=[];
 for(let i=0;i<pos.getCount();i++)vertices.push(...position(vec3.transformMat4([],pos.getElement(i,[]),matrix)),...canonical(vec3.normalize([],vec3.transformMat3([],normal.getElement(i,[]),normalMatrix))),0,0);
 if(style.paint||style.role==='cabin-glass')smoothedNormalComponents+=smoothNormals(vertices);
 const remap=new Uint32Array(pos.getCount()),bounds=empty();
 for(let i=0;i<pos.getCount();i++){const v=vertices.slice(i*8,i*8+8),k=v.map(v=>v.toFixed(6)).join(',');include(bounds,v);let at=group.remap.get(k);if(at===undefined){at=group.vertices.length/8;group.remap.set(k,at);group.vertices.push(...v);}remap[i]=at;}
 const idx=primitive.getIndices().getArray(),reverse=mat3.determinant(mat3.fromMat4(mat3.create(),matrix))>0;
 for(let i=0;i<idx.length;i+=3)group.indices.push(remap[idx[i]],remap[idx[i+(reverse?2:1)]],remap[idx[i+(reverse?1:2)]]);
 group.sourceParts.push({name,materialName,sourceTriangles:idx.length/3,bounds});
}
function compact(v,indices){const map=new Map(),vertices=[],out=new Uint32Array(indices.length),bounds=empty();
 indices.forEach((index,i)=>{if(!map.has(index)){map.set(index,map.size);const p=v.subarray(index*8,index*8+8);vertices.push(...p);include(bounds,p);}out[i]=map.get(index);});return {vertices:Float32Array.from(vertices),indices:out,bounds};}
function convert(fallback){const result=[];
 for(const g of groups.values()){
  const vertices=Float32Array.from(g.vertices),original=Uint32Array.from(g.indices);let indices=original,error=0;
  const tire=g.role==='tire',disc=g.sourceParts.every(p=>/^Cylinder00[1357]_/.test(p.name)),caliper=g.role==='stationary-brake-caliper',glass=g.role==='cabin-glass',badge=g.role==='badge';
  const thinExterior=glass||g.role==='window-trim'||g.role==='lamp-cover'||g.role==='front-lamp'||g.role==='rear-lamp';
  const ratio=thinExterior?1:fallback?(g.paint?.55:tire?.13:disc?.06:caliper?.05:g.wheel?.24:.17):(g.paint||badge||g.role==='interior'?1:tire?.48:disc?.25:caliper?.45:.9);
  if(!badge&&ratio<1&&original.length>90){const attributes=new Float32Array(vertices.length/8*3);for(let i=0;i<vertices.length/8;i++)attributes.set(vertices.subarray(i*8+3,i*8+6),i*3);
   const target=Math.max(36,Math.floor(original.length*ratio/3)*3),tolerance=fallback?(g.paint||glass?.004:tire?.006:.012):.0015;
   const weight=fallback&&!g.paint&&!glass?.06:.35;
   let locked=null;
   if(fallback&&g.role==='interior'){
    // The original inner roof/rear shelf sits immediately behind the glazing.
    // Preserve that upper skin so approximated interior faces cannot pierce it.
    locked=new Uint8Array(vertices.length/8);for(let i=0;i<locked.length;i++)if(vertices[i*8+2]>.8)locked[i]=1;
   }
   [indices,error]=MeshoptSimplifier.simplifyWithAttributes(original,vertices,8,attributes,3,[weight,weight,weight],locked,target,tolerance,fallback&&!g.paint&&!glass?['Permissive']:['Permissive','LockBorder']);
  }
  // Degenerate/tiny imported faces do not define the global side of the mesh;
  // consistently orient each visible triangle toward its retained normals.
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=[indices[i],indices[i+1],indices[i+2]].map(v=>v*8),cross=vec3.cross([], [vertices[b]-vertices[a],vertices[b+1]-vertices[a+1],vertices[b+2]-vertices[a+2]],[vertices[c]-vertices[a],vertices[c+1]-vertices[a+1],vertices[c+2]-vertices[a+2]]);if(cross.reduce((s,v,k)=>s+v*(vertices[a+3+k]+vertices[b+3+k]+vertices[c+3+k]),0)<0)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];}
  const p=compact(vertices,indices),packed=p.vertices.length/8<65536?Uint16Array.from(p.indices):p.indices;
  result.push({name:g.sourceParts.map(p=>p.name).join(' | '),materialName:g.materialName,role:g.role,paint:g.paint,material:g.material,color:g.color,alpha:g.alpha,...(g.wheel?{wheel:g.wheel}:{}),sourceParts:g.sourceParts,sourceTriangles:original.length/3,triangles:indices.length/3,simplificationError:error,bounds:p.bounds,vertices:b64(p.vertices),indices:b64(packed),indexType:packed.BYTES_PER_ELEMENT});
 }
 const floor=Math.min(...result.map(p=>p.bounds.min[2]));
 for(const p of result){const bytes=Buffer.from(p.vertices,'base64'),v=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);for(let i=2;i<v.length;i+=8)v[i]-=floor;p.vertices=b64(v);p.bounds.min[2]-=floor;p.bounds.max[2]-=floor;if(p.wheel)p.wheel={...p.wheel,center:p.wheel.center.map((v,i)=>i===2?v-floor:v)};p.groundShiftM=floor;}
 return result;
}
const primitives=convert(false),fallbackPrimitives=convert(true),triangles=primitives.reduce((s,p)=>s+p.triangles,0),fallbackTriangles=fallbackPrimitives.reduce((s,p)=>s+p.triangles,0),bounds=empty();
for(const p of primitives){include(bounds,p.bounds.min);include(bounds,p.bounds.max);}
assert(triangles<240000&&triangles>100000,`Main budget ${triangles}`);assert(fallbackTriangles<85000&&fallbackTriangles>20000,`Fallback budget ${fallbackTriangles}`);
const source={kind:'community-mesh',label:'Kia K5 DL3 부분변경 · zapkolenko07 커뮤니티 외관',author:'zapkolenko07',authorUrl:'https://sketchfab.com/zapkolenko07',url:'https://sketchfab.com/3d-models/kia-k5-2025-0ed1b1fb1a074a42849076b96a15ce9f',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',sha256,configuration:'2025 Kia K5 DL3 facelift community mesh with original star-map lamps, body, badges and wheels. Snow White Pearl SWP digital paint approximation. Source wheel and equipment styling is shared across simulation powertrains, not a per-trim CAD match.',attribution:'Kia K5 2025 by zapkolenko07, CC BY 4.0. Original geometry adapted and simplified for WebSim; material colors assigned from part semantics. See k5-source.json and k5-LICENSE.txt.'};
const payload={id:'k5',source,paintReference,bounds,triangles,primitives,fallbackTriangles,fallbackPrimitives,textures:[],wheelCenters,wheelAnimation:'separate-source-wheel-primitives',coordinateTransform:{worldToRuntime:['-X','+Z','-Y'],handednessCorrectedForRenderer:true,windingCorrected:true}};
const runtime='/* Kia K5 2025 by zapkolenko07, CC BY 4.0. Adapted for WebSim. See k5-source.json and k5-LICENSE.txt. */\n'+`ManufacturerModels.registerCompressed(${JSON.stringify(gzipSync(JSON.stringify(payload),{level:9}).toString('base64'))});\n`;
fs.writeFileSync(path.join(folder,'k5-runtime.js'),runtime);
const summary={...payload,sourceBounds,scale,runtimeBytes:Buffer.byteLength(runtime),sourceTriangles,sourceParts:parts.length,smoothedNormalComponents,primitives:primitives.map(({vertices,indices,...p})=>p),fallbackPrimitives:fallbackPrimitives.map(({vertices,indices,...p})=>p)};
fs.writeFileSync(path.join(folder,'k5-runtime-summary.json'),JSON.stringify(summary,null,2)+'\n');
const changes=[
 'Applied original node transforms and the reflected [-world X, +world Z, -world Y] convention, correcting normals and winding for forward +X, lateral +Y, up +Z. Uniformly scaled the source length to 4.905 m and aligned the tire floor to zero; no part-specific stretching, generated surfaces or substituted wheels.',
 'Preserved all original painted-body and interior triangles in the main model and all original cabin-glass/window-frame/lamp triangles in both detail levels. Locked upper interior vertices above 0.8 m in the fallback so its roof/rear shelf cannot poke through adjacent glazing. Reduced tires, brakes and other repeated details with topology- and normal-aware Meshopt simplification; no sloppy spatial clustering.',
 'Smoothed only coincident imported body/glazing normals within a 35-degree crease limit, without changing any vertex positions or closing original panel gaps.',
 'The downloaded source contains 22 named materials with white default factors and no textures. Assigned paint, glass, lamps, black trim, rubber and metal display colors by original part/material semantics; these are WebSim appearance choices, not recovered original texture colors.',
 'Applied the official Snow White Pearl name/code SWP to paintable source body and mirror caps using approximate display RGB #e7e9e5; clearcoat and roughness are renderer approximations.',
 'Tagged only original tire/rim parts and complete brake discs Cylinder001/003/005/007 with four local wheel centers/radii. Offset brake calipers Line*, Cylinder002/004/006/008 and Object430/454/455/456 remain stationary.',
 'Retained all 88 original source mesh parts, including Kia/K5 badges, factory-shaped wheels, star-map lamp geometry, cabin and grille. Preserved badge triangles in both detail levels. Merged compatible draw groups and packed gzip JavaScript.'
];
const provenance={id:'k5',title:'Kia K5 2025',author:source.author,authorUrl:source.authorUrl,sourceUrl:source.url,license:source.license,licenseUrl:source.licenseUrl,manufacturerOfficial:false,verifiedDate:'2026-10-19',configuration:{generation:'DL3 facelift',modelYear:2025,paintReference,limitations:source.configuration},download:{method:'Normal signed-in Sketchfab Download 3D Model GLB, without viewer extraction or authentication bypass.',files:[{name:'source.glb',bytes:input.length,sha256}],embeddedAttribution:json.asset.extras},sourceGeometry:{downloadedTriangles:sourceTriangles,downloadedMeshes:json.meshes.length,downloadedMaterials:json.materials.length,downloadedImages:0},provenanceNotes:['The public upload and downloaded GLB attribute this exact model to zapkolenko07 under CC BY 4.0. No separate restrictive notice, explicit game-extraction declaration or conflicting source URL was found in the embedded metadata. This does not establish a complete creation history.','The front and rear geometry was compared with the official current K5 exterior; this is the DL3 facelift, unlike the other uploader model titled 2025 but showing the earlier rear lights.','Original geometry is a community approximation, not official Kia CAD. Manufacturer length is only a uniform scale reference; source proportions and equipment differences are preserved.'],visualReferences:[{url:paintReference.sourceUrl,role:'Official facelift exterior, SWP name/code and dimensions'}],conversion:{builder:'build-free-k5.mjs',changes,geometryAdded:false,sourceParts:parts.length,mainPaintGeometryPreserved:true,triangles,fallbackTriangles,runtimeBytes:summary.runtimeBytes,scale,bounds,smoothedNormalComponents},attribution:source.attribution};
fs.writeFileSync(path.join(folder,'k5-source.json'),JSON.stringify(provenance,null,2)+'\n');
fs.writeFileSync(path.join(folder,'k5-LICENSE.txt'),`Kia K5 2025 — zapkolenko07\n\nOriginal: ${source.url}\nAuthor: ${source.authorUrl}\nLicense: Creative Commons Attribution 4.0 International (CC-BY-4.0)\n${source.licenseUrl}\nhttps://creativecommons.org/licenses/by/4.0/legalcode.en\n\nKeep author/source/license attribution and modification notice with copies.\nNo endorsement by Kia or the author is implied. This is not official Kia CAD.\n\nNormal signed-in Sketchfab download, verified 2026-10-19.\nInput source.glb: ${input.length} bytes\nSHA-256: ${sha256}\n\n${provenance.provenanceNotes.map(n=>'- '+n).join('\n')}\n\nWebSim changes:\n${changes.map(n=>'- '+n).join('\n')}\n\nOfficial paint reference: ${paintReference.sourceUrl}\nRGB and shader finish parameters are digital approximations, not measured OEM data.\n`);
console.log(JSON.stringify({id:'k5',triangles,fallbackTriangles,runtimeBytes:summary.runtimeBytes,groups:primitives.length,bounds,wheelCenters,smoothedNormalComponents}));
