/* Daylight signatures on the released source meshes. Coordinates are source
 * metres (+X forward, +Z up). No lamps, vertices or time-dependent glow are
 * added: only the identified front light-guide triangles change material.
 * Tail lamps, projector bulbs, bumper fog lamps and amber side markers retain
 * their source appearance. The source buffers remain immutable. */
(function(root){
  'use strict';
  const cache=new WeakMap(),WHITE=Object.freeze([.93,.965,1]);
  const recipes={
    staria:{part:p=>p.name==='VARIANTGROUP_HYBRID_HEADLIGHTS'&&p.materialName==='CheckerMat',description:'hybrid upper horizontal light guide'},
    ioniq5:{part:p=>p.name==='STOCK_LIGHTS'&&p.materialName==='REFRACT',point:(x,y,z)=>z>.72&&z<.82&&((Math.abs(y)<.64&&x>2.128)||(Math.abs(y)>.65&&x>1.927)),description:'four parametric-pixel headlamp outlines; upper-bumper LED guide excluded'},
    santafe:{part:p=>p.materialName==='L_lamp_REF_line_Front_On.001',description:'H signature outer uprights and horizontal connecting guides'},
    morning:{part:p=>p.name==='LightsMain__rear001'&&p.materialName==='Lights_white',point:x=>x>1.2,description:'front signature despite inherited rear source-part name'},
    k5:{part:p=>p.materialName==='white_Light223'&&/^lights front_/.test(p.name||''),description:'facelift star-map front light guides'},
    carnival:{part:p=>p.name==='HL_INNER LENS_SIGNAL'&&p.materialName==='HL',description:'star-map shared DRL/turn guide in white daytime mode; separate bulbs and fog lamps excluded'},
    g80:{part:p=>p.materialName==='LGT_DRL_TURN_LINE',description:'two-line shared DRL/turn guide in white daytime mode'},
    g70:{part:p=>p.materialName==='Material__288'&&p.name==='Object_13',component:b=>b.min[0]>2.08&&b.max[0]-b.min[0]>.14&&b.max[1]-b.min[1]>.15&&b.max[2]-b.min[2]<.06,description:'pre-facelift two narrow headlamp guides; shared projector and lower bulb components excluded'},
    supra:{part:p=>p.materialName==='headlight',description:'A90 headlamp light-guide signature'},
    bmw_m2:{part:p=>p.materialName==='MAT_FRONTLIGHT'&&(p.name||'').split(' | ').every(n=>/^lights_0[123]$/.test(n)),description:'F87 corona rings and upper eyebrow guides; lens and chrome assemblies excluded'},
    avante_n:{part:p=>/_Elantra_N_DRLs$/.test(p.materialName||''),point:x=>x>1.4,description:'CN7 front DRL strips only; shared rear and mirror geometry excluded'},
    gr86:{part:p=>p.materialName==='Ln1Mtl',point:x=>x>1.4,description:'front C-shaped guides only; shared rear geometry and separate projector lens excluded'},
    torres:{sourcePhoto:true,description:'official turntable photographs already show the white daytime signature'}
  };
  function sourcePartMask(p){
    const parts=p.sourceParts||[];if(parts.reduce((n,s)=>n+s.triangles,0)!==p.indices.length/3)return null;
    // The M2 converter concatenates indices in sourceParts order, retaining
    // exact counts after simplification. Only these two outer optical lenses
    // sit in front of the corona rings. Inner projector lenses stay unchanged.
    return parts.flatMap(s=>Array(s.triangles).fill(/^glass_0[47]$/.test(s.name)));
  }
  const covers={
    bmw_m2:{part:p=>p.materialName==='MAT_FRONTLIGHT'&&(p.sourceParts||[]).some(s=>/^glass_0[47]$/.test(s.name)),mask:sourcePartMask,cover:true,description:'two original outer corona-ring lenses'},
    avante_n:{part:p=>/_HeadLightsGlass$/.test(p.materialName||''),point:x=>x>1.4,cover:true,description:'front headlamp cover only; shared mirror cover retained'}
  };
  function compact(p,indices){
    const map=new Map(),vertices=[],remapped=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
    for(const old of indices){let n=map.get(old);if(n===undefined){n=map.size;map.set(old,n);for(let j=0;j<8;j++){const value=p.vertices[old*8+j];vertices.push(value);if(j<3){bounds.min[j]=Math.min(bounds.min[j],value);bounds.max[j]=Math.max(bounds.max[j],value);}}}remapped.push(n);}
    const Index=map.size<65536?Uint16Array:Uint32Array;
    return {...p,vertices:new Float32Array(vertices),indices:new Index(remapped),indexType:Index.BYTES_PER_ELEMENT,bounds,triangles:indices.length/3};
  }
  function illuminate(p,id,description){
    return {...p,material:4,paint:false,color:WHITE.slice(),alpha:1,texture:null,textureIndex:undefined,photoProjected:false,
      drl:{vehicle:id,mode:'daytime',source:description}};
  }
  function appearance(p,recipe,id){return recipe.cover?{...p,material:1,paint:false,alpha:.12,drlCover:{vehicle:id,source:recipe.description}}:illuminate(p,id,recipe.description);}
  function componentMask(p,select){
    // G70's source combines its two thin DRL guides, projector and three lower
    // bulbs in one material. Weld positions for connectivity (UV/normal seams
    // must not fragment a guide); select complete existing narrow components.
    // Both authored LODs retain these components, so no triangle-order or mesh
    // index assumptions are needed. This work runs only once at registration.
    const parent=Array.from({length:p.indices.length/3},(_,i)=>i),weld=new Map(),v=p.vertices;
    const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    for(let t=0;t<parent.length;t++)for(let j=0;j<3;j++){const k=p.indices[t*3+j]*8,key=[v[k],v[k+1],v[k+2]].map(x=>Math.round(x*10000)).join(':');
      if(weld.has(key))parent[find(t)]=find(weld.get(key));else weld.set(key,t);
    }
    const bounds=new Map();for(let t=0;t<parent.length;t++){const key=find(t);let b=bounds.get(key);if(!b){b={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};bounds.set(key,b);}
      for(let j=0;j<3;j++)for(let c=0;c<3;c++){const n=v[p.indices[t*3+j]*8+c];b.min[c]=Math.min(b.min[c],n);b.max[c]=Math.max(b.max[c],n);}
    }
    const accepted=new Set([...bounds].filter(([,b])=>select(b)).map(([key])=>key));return parent.map((_,i)=>accepted.has(find(i)));
  }
  function split(parts,recipe,point,id){
    const result=[];
    for(const p of parts){
      if(p.drl||p.wheel||!recipe.part(p)){result.push(p);continue;}
      if(!point&&!recipe.component&&!recipe.mask){result.push(appearance(p,recipe,id));continue;}
      const mask=recipe.mask?recipe.mask(p):recipe.component?componentMask(p,recipe.component):null;
      if(recipe.mask&&!mask){result.push(p);continue;}
      const selected=[],rest=[],v=p.vertices;
      for(let i=0;i<p.indices.length;i+=3){const a=p.indices[i],b=p.indices[i+1],c=p.indices[i+2];
        const yes=mask?mask[i/3]:point((v[a*8]+v[b*8]+v[c*8])/3,(v[a*8+1]+v[b*8+1]+v[c*8+1])/3,(v[a*8+2]+v[b*8+2]+v[c*8+2])/3);
        (yes?selected:rest).push(a,b,c);
      }
      if(!selected.length){result.push(p);continue;}
      if(rest.length)result.push(compact(p,rest));
      result.push(appearance(rest.length?compact(p,selected):p,recipe,id));
    }
    return result;
  }
  function prepare(data){
    if(!data||!Array.isArray(data.primitives)||!recipes[data.id])return data;
    if(cache.has(data))return cache.get(data);
    const recipe=recipes[data.id],cover=covers[data.id];
    // Torres' photographs already contain the illuminated signature. A white
    // replacement on its coarse hull introduced serrations and grille spill.
    // Preserve every primitive, material and photo projection byte-for-byte.
    const convert=parts=>{const lit=split(parts,recipe,recipe.point,data.id);return cover?split(lit,cover,cover.point,data.id):lit;};
    const result=recipe.sourcePhoto?{...data,daytimeLights:{mode:'source-photo-daytime',source:recipe.description}}:
      {...data,daytimeLights:{mode:'mesh-light-guides',source:recipe.description},primitives:convert(data.primitives),...(data.fallbackPrimitives?{fallbackPrimitives:convert(data.fallbackPrimitives)}:{})};
    cache.set(data,result);cache.set(result,result);return result;
  }
  const api={prepare};root.VehicleDRL=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
