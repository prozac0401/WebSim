/** Give the existing Picanto side-window frames/B pillars the selected body
 * finish. Glass, mirrors and interior door trim retain their source materials.
 * Geometry, normals and UVs are never moved. Optional input/output directories
 * permit isolated review; rebuild build-kia-models.mjs before changing masks. */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {fileURLToPath} from 'node:url';import {gzipSync,gunzipSync} from 'node:zlib';
const here=path.dirname(fileURLToPath(import.meta.url)),input=process.argv[2]||path.join(here,'morning-runtime.js'),output=process.argv[3]||here;
let data;vm.runInNewContext(fs.readFileSync(input,'utf8'),{ManufacturerModels:{registerCompressed:s=>data=JSON.parse(gunzipSync(Buffer.from(s,'base64')))}});
if(data.source.windowFrameFinish)throw Error('Morning window frames were already separated; rebuild the original source first.');
const sourceNames=new Set(['Mesh221_2','Mesh222_2','Mesh223_2','Mesh224_2']);let triangles=0;
const b64=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
data.primitives=data.primitives.flatMap(p=>{
 if(!sourceNames.has(p.name))return [p];
 const bytes=Buffer.from(p.vertices,'base64'),v=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),ib=Buffer.from(p.indices,'base64'),I=p.indexType===2?Uint16Array:Uint32Array,indices=new I(ib.buffer,ib.byteOffset,ib.length/I.BYTES_PER_ELEMENT),groups=[[],[]];
 for(let i=0;i<indices.length;i+=3){const tri=Array.from(indices.subarray(i,i+3)),frame=tri.every(index=>{const k=index*8;return v[k+2]>.89&&Math.abs(v[k+1])>.50&&Math.abs(v[k+1])<.80;});groups[frame?1:0].push(...tri);}
 return groups.flatMap((group,paint)=>{
  if(!group.length)return [];const map=new Map(),vertices=[],local=[];
  for(const old of group){if(!map.has(old)){map.set(old,map.size);vertices.push(...v.subarray(old*8,old*8+8));}local.push(map.get(old));}
  const Index=map.size<65536?Uint16Array:Uint32Array,a=new Float32Array(vertices),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let i=0;i<a.length;i+=8)for(let j=0;j<3;j++){bounds.min[j]=Math.min(bounds.min[j],a[i+j]);bounds.max[j]=Math.max(bounds.max[j],a[i+j]);}
  if(paint)triangles+=group.length/3;
  return [{...p,vertices:b64(a),indices:b64(new Index(local)),indexType:Index.BYTES_PER_ELEMENT,bounds,triangles:group.length/3,...(paint?{name:p.name+'__body_color_window_frame',paint:true,material:0,color:[.82,.83,.83],texture:null,textureIndex:undefined,windowFrame:true}:{})}];
 });
});
data.source.windowFrameFinish={description:'Existing side-window frame and B-pillar surfaces use selected body paint; original geometry/glass/mirror/interior preserved.',triangles};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'morning-runtime.js'),'/* Manufacturer source geometry; see assets/models/README.md and SOURCES.json. */\nManufacturerModels.registerCompressed('+JSON.stringify(gzipSync(JSON.stringify(data),{level:9}).toString('base64'))+');\n');
const summary=JSON.parse(fs.readFileSync(path.join(here,'morning-runtime-summary.json'),'utf8'));
summary.source=data.source;summary.primitives=data.primitives.map(({vertices,indices,texture,...p})=>({...p,textureBytes:(texture||data.textures?.[p.textureIndex])?.length||0}));
fs.writeFileSync(path.join(output,'morning-runtime-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({output,triangles,primitives:data.primitives.length}));
