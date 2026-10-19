/* Reproducible Porter II: dimension-traced curved geometry with calibrated
 * official front/side/rear photographic UVs. No manufacturer CAD is imported. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'assets/models/porter2');
fs.mkdirSync(out,{recursive:true});
const context=vm.createContext({console});
for(const name of ['vehicle-meshes.js','hyundai-refined.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context,{filename:name});
const spec={lengthMm:5155,widthMm:1740,heightMm:1970,wheelbaseMm:2640,frontTireRadiusMm:327,rearTireRadiusMm:281.3};
const mesh=context.VehicleMeshes.create('porter2',spec,'#e4e7e6');
const references=['front','side','back'].map(name=>`pip-porter2-24my-specifications-${name}-w.jpg`);
const textures=references.map(name=>'data:image/jpeg;base64,'+fs.readFileSync(path.join(root,'assets/reference/porter-refinement',name)).toString('base64'));
const materials={paint:0,glass:1,rubber:2,chrome:3,light:4,interior:2,plastic:2};
const color=hex=>{const n=parseInt(hex.replace('#',''),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];};
const triangles=[],normals=new Map();
// Paint is lit/remappable geometry. Restrict the photographs to glass, lamps,
// grille and plates: photographed shadows must not stain the cab paint.
const photographicOverlays=new Set(['porter-reflector','porter-reflector-flute','porter-indicator','porter-service-cover']);
const cross=(a,b,c)=>{const u=[b.x-a.x,b.y-a.y,b.z-a.z],v=[c.x-a.x,c.y-a.y,c.z-a.z];return[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
const shell=new Set(['porter-front-cab','porter-cab-side','porter-rear-bulkhead','porter-roof']);
const key=(p,f)=>[p.x.toFixed(5),p.y.toFixed(5),p.z.toFixed(5),shell.has(f.part)?'porter-cab-shell':f.part,f.material].join('|');
for(const f of mesh.faces){
 if(!f.fill||f.vertices.length<3||photographicOverlays.has(f.part))continue;
 for(let j=1;j<f.vertices.length-1;j++){
  const v=[f.vertices[0],f.vertices[j],f.vertices[j+1]],n=cross(...v),length=Math.hypot(...n);
  if(length<1e-10)continue;
  const center=v.reduce((s,p)=>[s[0]+p.x/3,s[1]+p.y/3,s[2]+p.z/3],[0,0,0]);
  triangles.push({v,n:n.map(a=>a/length),f,center});
  if(['paint','glass'].includes(f.material))for(const p of v){const k=key(p,f),sum=normals.get(k)||[0,0,0];normals.set(k,sum.map((a,i)=>a+n[i]));}
 }
}
const groups=new Map();
function projection(t){
 const part=t.f.part||'',x=t.center[0],y=t.center[1],z=t.center[2];
 if(['porter-front-cab','porter-cab-side','porter-rear-bulkhead','porter-rear-press','porter-fender-lip','porter-door-press','porter-service-cover','porter-bumper-guard'].includes(part))return null;
 if(part==='porter-roof'||part.includes('headboard')||part.includes('mirror')||part.includes('bed-floor')||part.includes('corrugation'))return null;
 if(part==='porter-rear-glass')return 'rear-cab';
 if(part==='porter-tailgate'&&t.n[0]<-.5)return 'rear-bed';
 if(part.includes('tail-lamp')||part==='porter-rear-license')return 'rear-bed';
 if(part==='wheels')return Math.abs(t.n[1])>.65?'side':null;
 if(part==='porter-bed-side'||part==='porter-bed-rib'||part==='porter-bed-latch')return Math.abs(t.n[1])>.55?'side':null;
 if(part==='porter-side-glass'||part==='porter-quarter-glass')return 'side';
 if(['porter-windscreen','porter-headlamp','porter-fog-lamp','porter-lower-grille','porter-license'].includes(part))return 'front';
 return null;
}
function uv(p,projection){
 // Coordinate landmarks and image measurements are preserved in calibration.
 if(projection==='front')return[(378.5-p.y*160.5)/760,(356-p.z*155.84)/520];
 if(projection==='side')return[(378.1667-p.x*(328/2.64))/760,(350-p.z*(328/2.64))/520];
 const bed=projection==='rear-bed',scale=bed?205:174;
 return[(380+p.y*scale)/760,((bed?403:369)-p.z*(bed?200:174))/520];
}
for(const t of triangles){
 const photo=projection(t),textureIndex=photo==='front'?0:photo==='side'?1:photo?2:null;
 const mat=photo?4:(materials[t.f.material]??0),paint=!photo&&t.f.material==='paint'&&!/license/.test(t.f.part||''),col=photo?[1,1,1]:color(t.f.fill);
 const name=t.f.part==='wheels'&&photo?'wheels-photo-side':photo?'official-photo-'+photo:t.f.part;
 const k=[name,mat,...col].join('|');
 if(!groups.has(k))groups.set(k,{name,photo,paint,textureIndex,color:col,material:mat,vertices:[],indices:[],keys:new Map()});
 const g=groups.get(k);
 for(const p of t.v){
  const raw=normals.get(key(p,t.f))||t.n,len=Math.hypot(...raw)||1,n=raw.map(x=>x/len),u=photo?uv(p,photo):[0,0],vertex=[p.x,p.y,p.z,...n,...u],vk=vertex.map(x=>x.toFixed(6)).join(',');
  let index=g.keys.get(vk);if(index===undefined){index=g.vertices.length/8;g.keys.set(vk,index);g.vertices.push(...vertex);}g.indices.push(index);
 }
}
const primitives=[...groups.values()].map(g=>({name:g.name,vertices:Buffer.from(new Float32Array(g.vertices).buffer).toString('base64'),indices:Buffer.from(new Uint32Array(g.indices).buffer).toString('base64'),indexType:4,triangles:g.indices.length/3,color:g.color,paint:g.paint,material:g.material,alpha:1,...(g.photo?{textureIndex:g.textureIndex,textureOpaque:true}:{})}));
const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
for(const t of triangles)for(const p of t.v)for(const [i,k]of ['x','y','z'].entries()){bounds.min[i]=Math.min(bounds.min[i],p[k]);bounds.max[i]=Math.max(bounds.max[i],p[k]);}
const source={kind:'photo-reference',label:'현대 공식 도면·사진 기반 정밀 제작',url:'https://www.hyundai.com/kr/ko/e/vehicles/porter2/intro',configuration:'Korea Porter II LPG extra-long super cab, 5155 mm with bumper guard, 2640 mm wheelbase, 1740 × 1970 mm; 2860 × 1630 × 355 mm drop-side bed. Remappable 3D cab paint; simulated engines may differ.',limitations:'Independently authored curved mesh measured from official dimension drawings; not manufacturer CAD, scan or multi-view photogrammetry. Rounded rear shoulders and pressed channels are inferred from the official rear reference. Calibrated photos supply glass, lamps and selected small details; photographed body shadows are excluded from cab paint. Roof, unseen underbody and cargo interior are inferred; opposite side reuses the available side reference.'};
const result={id:'porter2',bounds,triangles:primitives.reduce((s,p)=>s+p.triangles,0),primitives,textures,source};
const encoded=zlib.gzipSync(JSON.stringify(result),{level:9}).toString('base64');
fs.writeFileSync(path.join(root,'assets/models/porter2-runtime.js'),'ManufacturerModels.registerCompressed('+JSON.stringify(encoded)+');\n');
const calibration={sourceImages:references,sourceManifest:'../../reference/porter-refinement/SOURCES.json',dimensionsMm:spec,side:{imageSize:[760,520],frontWheelCenter:[212,309.4],rearWheelCenter:[540,315],groundY:350,pixelsPerMetre:328/2.64,centerX:378.1667},front:{imageSize:[760,520],centerX:378.5,groundY:356,horizontalPixelsPerMetre:160.5,verticalPixelsPerMetre:155.84,windshieldObservedPixels:[[260,153],[500,153],[481,65],[278,65]],lampObservedPixels:[[241,250],[294,250],[281,205],[250,193]]},sideOutlinePixels:[[69,300],[84,213],[113,193],[161,151],[199,123],[224,115],[270,112],[299,117],[318,137],[328,292]],method:'Manual dimension-photo landmarks; body loft interpolated in height with a rounded frontal/door transition. Orthographic photographic UV calibration; front image has separate horizontal and vertical calibration to retain its published proportions.',source};
fs.writeFileSync(path.join(out,'calibration.json'),JSON.stringify(calibration,null,2)+'\n');
fs.writeFileSync(path.join(out,'inspection.json'),JSON.stringify({id:result.id,bounds,triangles:result.triangles,primitives:primitives.length,runtimeBytes:encoded.length,source},null,2)+'\n');
console.log(JSON.stringify({id:result.id,triangles:result.triangles,primitives:primitives.length,runtimeBytes:encoded.length,bounds}));
