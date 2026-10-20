/* Selective material boundaries in the attributed, fixed-hash G70 source.
 * Runtime +X forward / +Y right / +Z up, metres. No geometry is moved.
 * Components are joined by quantized position to cross normal/UV seams. */
const decode=(s,T)=>{const b=Buffer.from(s,'base64');return new T(b.buffer,b.byteOffset,b.byteLength/T.BYTES_PER_ELEMENT);};
const encode=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
const colors={dark:[.018,.022,.027],chrome:[.72,.73,.74],darkChrome:[.14,.16,.18]};
function split(p,kind){
 const v=decode(p.vertices,Float32Array),ix=decode(p.indices,p.indexType===2?Uint16Array:Uint32Array),parent=Int32Array.from({length:v.length/8},(_,i)=>i),positions=new Map();
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 const join=(a,b)=>{parent[find(b)]=find(a);};
 for(let i=0;i<parent.length;i++){
  const key=[0,1,2].map(a=>Math.round(v[i*8+a]*1e4)).join(',');
  if(positions.has(key))join(positions.get(key),i);else positions.set(key,i);
 }
 for(let i=0;i<ix.length;i+=3){join(ix[i],ix[i+1]);join(ix[i],ix[i+2]);}
 const components=new Map();
 for(let i=0;i<ix.length;i++){
  const id=find(ix[i]);let b=components.get(id);
  if(!b)components.set(id,b={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
  for(let a=0;a<3;a++){const n=v[ix[i]*8+a];b.min[a]=Math.min(b.min[a],n);b.max[a]=Math.max(b.max[a],n);}
 }
 const groups=new Map();
 for(let i=0;i<ix.length;i+=3){
  const b=components.get(find(ix[i]));let role='original';
  if(kind==='grille'&&b.min[0]>2.23&&b.min[1]>-.48&&b.max[1]<.48&&b.min[2]>.30&&b.max[2]<.70){
   role=b.max[1]-b.min[1]>.89&&b.max[2]-b.min[2]>.34?'grille-frame':'grille-support';
  }else if(kind==='rear-exhaust'){
   const x=(v[ix[i]*8]+v[ix[i+1]*8]+v[ix[i+2]*8])/3;
   const y=(v[ix[i]*8+1]+v[ix[i+1]*8+1]+v[ix[i+2]*8+1])/3,z=(v[ix[i]*8+2]+v[ix[i+1]*8+2]+v[ix[i+2]*8+2])/3;
   const radial=Math.hypot((y-(b.min[1]+b.max[1])/2)/((b.max[1]-b.min[1])/2),(z-(b.min[2]+b.max[2])/2)/((b.max[2]-b.min[2])/2));
   // Keep the oval lip metallic; the source's recessed closing surface should
   // read as a dark cavity, not a bright solid plug inside the exhaust.
   role=b.max[1]-b.min[1]>.18&&x<b.min[0]+.075&&radial>.72?'exhaust-tip':'exhaust-interior';
  }
  else if(kind==='rear-diffuser'){
   role=b.max[1]-b.min[1]>1.03?'rear-surround':b.max[1]-b.min[1]>.95?'rear-diffuser':'rear-mesh';
  }else if(kind==='rear-backing'&&b.max[0]<-2.0){role='rear-backing';
  }else if(kind==='window'&&b.min[2]>.87&&b.max[2]>1.20){role='window-frame';}
  else if(kind==='window'&&b.min[2]>.87&&b.max[2]<.96&&b.max[0]-b.min[0]>.90){role='window-frame';}
  else if(kind==='mirror-pillar'){
   if(b.max[0]<-.10&&b.max[2]>1.20)role='b-pillar';
   else if(b.min[0]>.49&&Math.min(Math.abs(b.min[1]),Math.abs(b.max[1]))>.81){
    // The source indicator/lower rim ends at z=.9331 m. Only the cap above
    // that existing boundary receives body paint; its underside stays black.
    const z=(v[ix[i]*8+2]+v[ix[i+1]*8+2]+v[ix[i+2]*8+2])/3;
    role=z>.934?'mirror-cap':'mirror-underside';
   }else role='mirror-mount';
  }
  if(!groups.has(role))groups.set(role,[]);groups.get(role).push(ix[i],ix[i+1],ix[i+2]);
 }
 if(groups.size===1&&groups.has('original'))return[p];
 return [...groups].map(([role,indices])=>{
  const map=new Map(),vertices=[],compact=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const old of indices){
   if(!map.has(old)){map.set(old,map.size);vertices.push(...v.subarray(old*8,old*8+8));for(let a=0;a<3;a++){bounds.min[a]=Math.min(bounds.min[a],v[old*8+a]);bounds.max[a]=Math.max(bounds.max[a],v[old*8+a]);}}
   compact.push(map.get(old));
  }
  const I=map.size<65536?Uint16Array:Uint32Array,result={...p,name:p.name+'__'+role,sourcePart:p.name,exteriorRole:role,
   vertices:encode(new Float32Array(vertices)),indices:encode(new I(compact)),indexType:I.BYTES_PER_ELEMENT,triangles:indices.length/3,bounds};
  if(role==='grille-frame'){result.color=colors.chrome;result.material=3;}
  if(role==='grille-support'||role==='mirror-underside'||role==='mirror-mount'){result.color=colors.dark;result.material=2;}
  if(role==='exhaust-interior'||role==='rear-backing'){result.color=colors.dark;result.material=2;}
  if(role==='exhaust-tip'){result.color=[.57,.60,.63];result.material=3;}
  if(role==='rear-diffuser'){result.color=colors.dark;result.material=1;}
  if(role==='rear-surround'){result.color=[.27,.29,.31];result.material=3;}
  if(role==='rear-mesh'){result.color=[.055,.062,.069];result.material=3;}
  if(role==='b-pillar'){result.color=colors.dark;result.material=1;result.alpha=1;}
  if(role==='window-frame'){result.color=colors.darkChrome;result.material=3;}
  if(role==='mirror-cap'){result.paint=true;result.material=0;}
  return result;
 });
}
export function refineG70Exterior(primitives){
 return primitives.flatMap(p=>{
  if(p.materialName==='Material__297')return[{...p,color:colors.dark,exteriorRole:'grille-backing'}];
  if(p.materialName==='Material__275')return split(p,'rear-exhaust');
  if(p.materialName==='Material__306')return split(p,'rear-diffuser');
  if(p.materialName==='Material__308')return[{...p,color:colors.dark,material:2,exteriorRole:'rear-backing'}];
  if(p.materialName==='Material__277')return split(p,'rear-backing');
  if(p.materialName==='chrome1')return split(p,'grille');
  if(/^chrome[34]$/.test(p.materialName))return split(p,'window');
  if(p.materialName==='Material__319')return split(p,'mirror-pillar');
  if(p.materialName==='Material__3190')return[{...p,color:colors.dark,material:1,alpha:1,exteriorRole:'b-pillar'}];
  return[p];
 });
}
