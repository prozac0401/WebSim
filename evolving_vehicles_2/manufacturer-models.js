/* Indexed vehicle geometry. Data stays local and works from file://.
 * The original source provenance and configuration are in assets/models/.
 */
(function(root){
 'use strict';
 const models=new Map(),pending=[],failures=[];
 const assetOnly=new Set(['g70','supra']);
 const files=new Set(['g80','ioniq5','santafe','staria','carnival','morning','ray','k5','avante','grandeur','torres','musso_ev','porter2',...assetOnly]),loading=new Map(),active=new Set();
 const scriptUrl=root.document?.currentScript?.src||'';
 const base=scriptUrl.replace(/[?#].*$/,'').replace(/[^/]*$/,'');
 const revision=scriptUrl.match(/[?&]v=([^&#]+)/)?.[1];
 const version=revision?'?v='+revision:'';
 const decode=(s,Type)=>{const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Type(bytes.buffer);};
 function register(data){
  const unpack=p=>({...p,texture:p.texture??data.textures?.[p.textureIndex],vertices:decode(p.vertices,Float32Array),indices:decode(p.indices,p.indexType===2?Uint16Array:Uint32Array)});
  data.primitives=data.primitives.map(unpack);
  if(data.fallbackPrimitives)data.fallbackPrimitives=data.fallbackPrimitives.map(unpack);
  models.set(data.id,data);
 }
 function registerCompressed(source){
  const task=Promise.resolve().then(async()=>{
   const compressed=decode(source,Uint8Array);
   const data=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
   register(data);return true;
  }).catch(error=>{failures.push(String(error));return false;});
  pending.push(task);return task;
 }
 function create(id,spec,color){
  const data=models.get(id);if(!data)return null;
  let fallback;
  const length=(spec.lengthMm||5000)/1000,height=(spec.heightMm||1500)/1000,sourceLength=data.bounds.max[0]-data.bounds.min[0],sourceHeight=data.bounds.max[2]-data.bounds.min[2];
  const mesh={length,width:(spec.widthMm||1900)/1000,height,manufacturer:data,paint:color,
   modelScale:[length/sourceLength,length/sourceLength,height/sourceHeight],modelOffset:[-(data.bounds.max[0]+data.bounds.min[0])/2,-(data.bounds.max[1]+data.bounds.min[1])/2,-data.bounds.min[2]],
   metadata:{id,...data.source,triangles:data.triangles},get faces(){
    if(!fallback){
     if(data.fallbackPrimitives){
      const faces=[];
      for(const p of data.fallbackPrimitives){
       const fill=p.paint?color:'#'+p.color.map(c=>Math.round(Math.max(0,Math.min(1,c))*255).toString(16).padStart(2,'0')).join('');
       for(let i=0;i<p.indices.length;i+=3){const vertices=[];
        for(let j=0;j<3;j++){const k=p.indices[i+j]*8;vertices.push({x:(p.vertices[k]+mesh.modelOffset[0])*mesh.modelScale[0],y:(p.vertices[k+1]+mesh.modelOffset[1])*mesh.modelScale[1],z:(p.vertices[k+2]+mesh.modelOffset[2])*mesh.modelScale[2]});}
        faces.push({vertices,fill,material:p.paint?'paint':'trim'});
       }
      }
      fallback={faces};
     }else fallback=assetOnly.has(id)?{faces:[]}:root.VehicleMeshes.create(id,spec,color);
    }
    return fallback.faces;
   }};
  return mesh;
 }
 function load(id){
  if(models.has(id)||!files.has(id)||!root.document)return Promise.resolve(models.has(id));
  if(loading.has(id))return loading.get(id);
  active.add(id);
  const task=new Promise(resolve=>{
   const script=root.document.createElement('script');script.src=base+'assets/models/'+id+'-runtime.js'+version;
   script.onload=()=>Promise.all(pending).then(()=>resolve(models.has(id)));
   script.onerror=()=>{failures.push(id+': model file could not be loaded');resolve(false);};root.document.head.append(script);
  }).finally(()=>active.delete(id));loading.set(id,task);return task;
 }
 root.ManufacturerModels={register,registerCompressed,create,load,requiresAsset:id=>assetOnly.has(id),canLoad:id=>files.has(id),isLoading:id=>active.has(id),has:id=>models.has(id),get:id=>models.get(id),ids:()=>[...models.keys()],get failures(){return [...failures];},get ready(){return Promise.all(pending);}};
})(typeof window!=='undefined'?window:globalThis);
