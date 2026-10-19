/** Reassign existing Picanto components, without changing geometry or UVs.
 * Only door perimeter frames/B pillars use body paint. Rear window dividers,
 * mirror housings and mirror delta plastics stay black. Rebuild the original
 * build-kia-models.mjs output before applying; optional input/output paths allow
 * isolated review of that unrefined runtime. */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
const here=path.dirname(fileURLToPath(import.meta.url)),input=process.argv[2]||path.join(here,'morning-runtime.js'),output=process.argv[3]||here;
let data;vm.runInNewContext(fs.readFileSync(input,'utf8'),{ManufacturerModels:{registerCompressed:s=>data=JSON.parse(gunzipSync(Buffer.from(s,'base64')))}});
if(data.source.windowFrameFinish)throw Error('Morning window frames were already separated; rebuild the original source first.');
const black=data.primitives.find(p=>p.name==='Mesh221_2').color;
const b64=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
const stats={doorFrame:0,rearDivider:0,mirrorDelta:0,mirrorHousing:0};

function components(v,indices){
 const parent=Array.from({length:v.length/8},(_,i)=>i),root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
 const join=(a,b)=>{parent[root(a)]=root(b);},positions=new Map();
 // Source UV/normal seams duplicate vertices. Weld positions only for finding
 // connected components, at 10 micrometres; emitted vertex bytes are untouched.
 for(let i=0;i<parent.length;i++){
  const key=[v[i*8],v[i*8+1],v[i*8+2]].map(n=>Math.round(n*1e5)).join(',');
  if(positions.has(key))join(i,positions.get(key));else positions.set(key,i);
 }
 for(let i=0;i<indices.length;i+=3){join(indices[i],indices[i+1]);join(indices[i],indices[i+2]);}
 const groups=new Map();
 for(let i=0;i<indices.length;i+=3){const key=root(indices[i]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...indices.subarray(i,i+3));}
 return [...groups.values()].map(indices=>{
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const i of indices)for(let j=0;j<3;j++){min[j]=Math.min(min[j],v[i*8+j]);max[j]=Math.max(max[j],v[i*8+j]);}
  return {indices,min,max};
 });
}
function role(name,{min,max}){
 const front=/^Mesh22[12]_2$/.test(name),rear=/^Mesh22[34]_2$/.test(name);
 // The complete frame is a single connected component around each window;
 // the narrow rear divider and mirror assembly are separate source components.
 if((front&&min[0]<-.3&&max[0]<.65&&min[2]>.93&&max[2]>1.35)||
    (rear&&min[0]<-1.2&&max[0]>-.4&&min[2]>.97&&max[2]>1.4))return 'doorFrame';
 if(rear&&min[0]>-1.03&&max[0]<-.97&&min[2]>1.03&&max[2]>1.34)return 'rearDivider';
 if(front&&min[0]>.5&&max[0]<.74&&max[2]>1.12)return 'mirrorDelta';
 if(/^Mesh22[12]$/.test(name)&&min[0]>.53&&max[0]<.68&&min[2]>.96&&max[2]<1.08&&Math.max(Math.abs(min[1]),Math.abs(max[1]))>.94)return 'mirrorHousing';
 return 'unchanged';
}
const suffix={doorFrame:'body_color_window_frame',rearDivider:'black_rear_window_divider',mirrorDelta:'black_mirror_delta',mirrorHousing:'black_mirror_housing'};
data.primitives=data.primitives.flatMap(p=>{
 if(!/^Mesh22[1-4]_2$/.test(p.name)&&!/^Mesh22[12]$/.test(p.name))return [p];
 const bytes=Buffer.from(p.vertices,'base64'),v=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),ib=Buffer.from(p.indices,'base64'),I=p.indexType===2?Uint16Array:Uint32Array,indices=new I(ib.buffer,ib.byteOffset,ib.length/I.BYTES_PER_ELEMENT),groups=new Map();
 for(const component of components(v,indices)){
  const key=role(p.name,component);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...component.indices);
 }
 assert(groups.has(p.name.endsWith('_2')?'doorFrame':'mirrorHousing'),p.name+': expected source component is missing');
 if(/^Mesh22[34]_2$/.test(p.name))assert(groups.has('rearDivider'),p.name+': rear divider is missing');
 return [...groups].map(([key,group])=>{
  const map=new Map(),vertices=[],local=[];
  for(const old of group){if(!map.has(old)){map.set(old,map.size);vertices.push(...v.subarray(old*8,old*8+8));}local.push(map.get(old));}
  const Index=map.size<65536?Uint16Array:Uint32Array,a=new Float32Array(vertices),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let i=0;i<a.length;i+=8)for(let j=0;j<3;j++){bounds.min[j]=Math.min(bounds.min[j],a[i+j]);bounds.max[j]=Math.max(bounds.max[j],a[i+j]);}
  const part={...p,sourcePrimitive:p.name,vertices:b64(a),indices:b64(new Index(local)),indexType:Index.BYTES_PER_ELEMENT,bounds,triangles:group.length/3};
  if(key==='unchanged')return part;
  stats[key]+=part.triangles;const paint=key==='doorFrame';
  return {...part,name:p.name+'__'+suffix[key],finishPart:key,paint,material:paint?0:2,color:paint?[.82,.83,.83]:black,texture:null,textureIndex:undefined,...(paint?{windowFrame:true}:{})};
 });
});
data.source.windowFrameFinish={version:2,description:'Connected door perimeter frames/B pillars use body paint; separate rear window dividers, mirror housings and delta plastics are black. Original vertex positions, normals, UVs, glass and interior are preserved.',triangles:stats.doorFrame,parts:stats};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'morning-runtime.js'),'/* Manufacturer source geometry; see assets/models/README.md and SOURCES.json. */\nManufacturerModels.registerCompressed('+JSON.stringify(gzipSync(JSON.stringify(data),{level:9}).toString('base64'))+');\n');
const summary=JSON.parse(fs.readFileSync(path.join(here,'morning-runtime-summary.json'),'utf8'));
summary.source=data.source;summary.primitives=data.primitives.map(({vertices,indices,texture,...p})=>({...p,textureBytes:(texture||data.textures?.[p.textureIndex])?.length||0}));
fs.writeFileSync(path.join(output,'morning-runtime-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({output,...stats,primitives:data.primitives.length}));
