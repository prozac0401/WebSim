/* Indexed vehicle geometry. Data stays local and works from file://.
 * The original source provenance and configuration are in assets/models/.
 */
(function(root){
 'use strict';
 const models=new Map(),pending=new Set(),failures=[],wheelSelections=new WeakMap();
 const assetOnly=new Set(['g70','supra','bmw_m2','avante_n','gr86','k5']);
 const files=new Set(['g80','ioniq5','santafe','staria','carnival','morning','ray','k5','avante','grandeur','torres','musso_ev','porter2',...assetOnly]),loading=new Map(),states=new Map(),listeners=new Set(),scripts=new WeakMap();
 const LOAD_POLICY=Object.freeze({maxAttempts:2,timeoutMs:45000,retryDelayMs:500});
 let attemptSerial=0;
 const scriptUrl=root.document?.currentScript?.src||'';
 const base=scriptUrl.replace(/[?#].*$/,'').replace(/[^/]*$/,'');
 const revision=scriptUrl.match(/[?&]v=([^&#]+)/)?.[1];
 const version=revision?'?v='+revision:'';
 const decode=(s,Type)=>{const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Type(bytes.buffer);};
 const failure=error=>{failures.push(String(error));if(failures.length>100)failures.shift();};
 function getLoadState(id){return Object.freeze({id,status:models.has(id)?'ready':'idle',phase:null,attempt:0,maxAttempts:LOAD_POLICY.maxAttempts,error:null,errorCode:null,retryable:false,...states.get(id)});}
 function publish(id,update){
  const state=Object.freeze({...getLoadState(id),...update});states.set(id,state);
  for(const listener of [...listeners])try{listener(state);}catch(error){failure('model state listener: '+error);}
 }
 function accept(data,context){
  if(context&&!context.active)return false;
  if(!data||typeof data.id!=='string'||!Array.isArray(data.primitives))throw new Error('Invalid model registration');
  if(context&&data.id!==context.id)throw new Error('Model file registered '+data.id+' instead of '+context.id);
  const unpack=p=>({...p,texture:p.texture??data.textures?.[p.textureIndex],vertices:decode(p.vertices,Float32Array),indices:decode(p.indices,p.indexType===2?Uint16Array:Uint32Array)});
  data.primitives=data.primitives.map(unpack);
  if(data.fallbackPrimitives)data.fallbackPrimitives=data.fallbackPrimitives.map(unpack);
  if(data.wheelVariants)data.wheelVariants=Object.fromEntries(Object.entries(data.wheelVariants).map(([key,value])=>[key,{...value,primitives:value.primitives.map(unpack)}]));
  data=root.VehicleWheels?.prepare(data)||data;
  data=root.VehicleDRL?.prepare(data)||data;
  // A managed script commits only after its own load + decoding complete.
  // An expired script retains its invalid token in the WeakMap, so even a late
  // execution after element removal cannot become an untracked registration.
  if(context)context.data=data;
  else {models.set(data.id,data);publish(data.id,{status:'ready',phase:null,error:null,errorCode:null,retryable:false});}
  return true;
 }
 function register(data){return accept(data,scripts.get(root.document?.currentScript));}
 function registerCompressed(source){
  const context=scripts.get(root.document?.currentScript);
  if(context&&!context.active)return Promise.resolve(false);
  if(context)publish(context.id,{phase:'decoding'});
  const work=Promise.resolve().then(async()=>{
   if(context&&!context.active)return false;
   const compressed=decode(source,Uint8Array);
   source=null; // Do not retain the large base64 string while the decoder waits.
   const data=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
   return accept(data,context);
  }).catch(error=>{if(context){if(context.active)context.error={code:'decode',message:String(error)};}else failure(error);return false;});
  // Also settle ready snapshots taken before a timeout, even if a broken
  // decoder never settles. The abandoned work still checks its token on exit.
  const task=context?Promise.race([work,context.cancelled]):work;
  pending.add(task);if(context)context.tasks.push(task);
  task.then(()=>pending.delete(task));return task;
 }
 function create(id,spec,color){
  const sourceAsset=models.get(id);if(!sourceAsset)return null;
  let data=sourceAsset;
  const wheelVariant=id==='santafe'&&sourceAsset.wheelVariants?.['santafe-21']&&(spec.wheelInches===21||/R21\b/i.test(spec.frontTire||'')||/21인치/.test(spec.variant||''))?'santafe-21':null;
  if(wheelVariant&&sourceAsset.wheelVariants?.[wheelVariant]){
   let selections=wheelSelections.get(sourceAsset);if(!selections){selections=new Map();wheelSelections.set(sourceAsset,selections);}
   if(!selections.has(wheelVariant)){
    const primitives=sourceAsset.primitives.filter(p=>p.name!=='WHEELS_Base2').concat(sourceAsset.wheelVariants[wheelVariant].primitives);
    selections.set(wheelVariant,{...sourceAsset,primitives,triangles:primitives.reduce((sum,p)=>sum+p.indices.length/3,0)});
   }
   data=selections.get(wheelVariant);
  }
  let fallback;
  const length=(spec.lengthMm||5000)/1000,height=(spec.heightMm||1500)/1000,sourceLength=data.bounds.max[0]-data.bounds.min[0],sourceHeight=data.bounds.max[2]-data.bounds.min[2];
  const mesh={length,width:(spec.widthMm||1900)/1000,height,manufacturer:data,sourceAsset,paint:color,
   modelScale:[length/sourceLength,length/sourceLength,height/sourceHeight],modelOffset:[-(data.bounds.max[0]+data.bounds.min[0])/2,-(data.bounds.max[1]+data.bounds.min[1])/2,-data.bounds.min[2]],
   metadata:{id,...data.source,triangles:data.triangles,...(wheelVariant?{wheelVariant}:{})},get faces(){
    if(!fallback){
     if(data.fallbackPrimitives){
      const faces=[];
      for(const p of data.fallbackPrimitives){
       const channels=p.color.map(c=>Math.round(Math.max(0,Math.min(1,c))*255));
       const fill=p.paint?color:p.drlCover?'rgba('+channels.join(',')+','+p.alpha+')':'#'+channels.map(c=>c.toString(16).padStart(2,'0')).join('');
       for(let i=0;i<p.indices.length;i+=3){const vertices=[];
        for(let j=0;j<3;j++){const k=p.indices[i+j]*8;vertices.push({x:(p.vertices[k]+mesh.modelOffset[0])*mesh.modelScale[0],y:(p.vertices[k+1]+mesh.modelOffset[1])*mesh.modelScale[1],z:(p.vertices[k+2]+mesh.modelOffset[2])*mesh.modelScale[2]});}
        faces.push({vertices,fill,material:p.drl?'light':p.paint?'paint':'trim',...(p.drl?{drl:true}:{}),...(p.wheel?{wheel:p.wheel}:{})});
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
  const retryRequest=states.get(id)?.status==='error';
  let resolve;const task=new Promise(done=>{resolve=done;});loading.set(id,task);
  const finish=(ok,error)=>{
   ok=ok||models.has(id);
   if(loading.get(id)===task)loading.delete(id);
   publish(id,{status:ok?'ready':'error',phase:null,error:ok?null:error.message,errorCode:ok?null:error.code,retryable:!ok});resolve(ok);
  };
  (async()=>{
   let error;
   for(let attempt=1;attempt<=LOAD_POLICY.maxAttempts;attempt++){
    publish(id,{status:'loading',phase:'fetching',attempt,error:null,errorCode:null,retryable:false});
    const result=await loadAttempt(id,attempt>1||retryRequest);
    if(result.data){models.set(id,result.data);finish(true);return;}
    error=result.error;failure(id+': '+error.message);
    if(attempt<LOAD_POLICY.maxAttempts){
     publish(id,{phase:'retrying',error:error.message,errorCode:error.code});
     await new Promise(done=>root.setTimeout(done,LOAD_POLICY.retryDelayMs));
    }
   }
   finish(false,error);
  })().catch(error=>{failure(id+': '+error);finish(false,{code:'registration',message:String(error)});});
  return task;
 }
 function loadAttempt(id,retry){
  return new Promise(resolve=>{
   const script=root.document.createElement('script'),context={id,active:true,tasks:[],data:null,error:null};
   context.cancelled=new Promise(done=>{context.cancel=done;});scripts.set(script,context);
   const serial=++attemptSerial;
   script.src=base+'assets/models/'+id+'-runtime.js'+version+(retry?(version?'&':'?')+'retry='+Date.now().toString(36)+'-'+serial:'');
   const done=error=>{
    if(!context.active)return;context.active=false;context.cancel(false);root.clearTimeout(timer);
    script.onload=script.onerror=null;script.remove();
    for(const task of context.tasks)pending.delete(task);context.tasks.length=0;
    const data=error?null:context.data;context.data=null;resolve({data,error});
   };
   const timer=root.setTimeout(()=>done({code:'timeout',message:'Model loading timed out'}),LOAD_POLICY.timeoutMs);
   script.onerror=()=>done({code:'network',message:'Model file could not be loaded'});
   script.onload=()=>Promise.all(context.tasks).then(results=>done(context.error||(!context.data||results.some(ok=>!ok)?{code:'registration',message:'Model file did not register the requested model'}:null)));
   try{root.document.head.append(script);}catch(error){done({code:'network',message:String(error)});}
  });
 }
 root.ManufacturerModels={register,registerCompressed,create,load,getLoadState,subscribe(listener){if(typeof listener!=='function')throw new TypeError('Model listener must be a function');listeners.add(listener);return()=>listeners.delete(listener);},LOAD_POLICY,
  requiresAsset:id=>assetOnly.has(id),canLoad:id=>files.has(id),isLoading:id=>loading.has(id),has:id=>models.has(id),get:id=>models.get(id),ids:()=>[...models.keys()],get failures(){return [...failures];},get ready(){return Promise.all([...pending]);}};
})(typeof window!=='undefined'?window:globalThis);
