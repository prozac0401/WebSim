/* Rear stop-lamp selection on the released model geometry. This module contains
 * no vehicle state: every source color, texture and buffer remains immutable.
 * The renderer applies emission per instance. Reflectors, reverse/turn lamps
 * and front DRLs are deliberately excluded. Coordinates are source metres.
 */
(function(root){
  'use strict';
  const cache=new WeakMap();
  const outer=source=>({role:'stop',source}),high=source=>({role:'high-mount',source});
  const recipes={
    staria:[
      {part:p=>p.name==='BODYTYPE_PREMIUM'&&p.materialName==='CheckerWhite',point:(x,y,z)=>x<-2.3&&Math.abs(y)>.7&&z>1.2,info:outer('upper original premium rear pixel emitters; lower auxiliary lights excluded')},
      {part:p=>p.name==='BODYTYPE_LIFTBACK_COMMON'&&p.materialName==='REDGLASS',info:high('original roof-spoiler stop lens')}
    ],
    ioniq5:[
      {part:p=>p.name==='STOCK_LIGHTS'&&p.materialName==='REFRACT',point:(x,y,z)=>x<-2&&Math.abs(y)>.4&&z>.93,info:outer('outer upper rear pixel guides; front guides and central/lower lamps excluded')},
      {part:p=>p.name==='ExteriorBaseModel'&&p.materialName==='REDREFLECTOR',point:(x,y,z)=>x<-1.7&&Math.abs(y)<.41&&z>1.4,info:high('original rear-spoiler strip, distinguished from lower reflectors by source part and position')}
    ],
    santafe:[
      {part:p=>p.materialName==='L_lamp_REF_square_Rear_On.001',info:outer('original H-shaped rear stop emitters; separate rear-direct/fog parts excluded')},
      {part:p=>p.name==='Object154'&&p.materialName==='L_lamp_REF_square_C.001',info:high('original spoiler stop emitter')}
    ],
    morning:[
      {part:p=>p.name==='Ext_GTL_taillights_chromered001'&&p.materialName==='Chrome',info:outer('original red-lens optical guides; amber Lights_red bulb material and lower bumper lamps excluded')},
      {part:p=>p.name==='Mesh220_9'&&p.materialName==='Rearlight',point:(x,y,z)=>x<-1.4&&Math.abs(y)<.25&&z>1.30,info:high('upper central spoiler lens within the combined rear-lens source')}
    ],
    k5:[
      {part:p=>p.materialName==='Red_Light'&&p.name==='lights rear_Red_Light_0',info:outer('facelift original rear red light guides; combined bumper-reflector material excluded')},
      {part:p=>p.name==='lights glass_Material #2125716590_0'&&p.materialName==='Material_2125716590',point:(x,y,z)=>x<-2&&z>.73,info:{...outer('original outer red stop lens above lower auxiliary/reflector region; separate clear lens retained'),cover:true}}
    ],
    carnival:[
      {part:p=>p.name==='RL red001'&&p.materialName==='rl signal on',info:outer('original red outer star-map guides; separate RL signal amber bars excluded')},
      {part:p=>p.materialName==='rear stop',info:high('original rear-spoiler stop strip')}
    ],
    g80:[
      {part:p=>p.materialName==='LGT_STOP_CR_RED',info:outer('original STOP optical material; reverse and reflector materials excluded')},
      {part:p=>p.materialName==='Glass_Rear_Red',point:(x,y,z)=>x<-1.9&&z>.75,info:{...outer('two original upper red stop-lamp cover bands; lower bumper reflector excluded'),cover:true}},
      {part:p=>p.name==='92401T1010_21'&&p.materialName==='EXT_COMMON_GLASS_IOR_16',info:{...outer('original outer red stop-lamp optical cover'),cover:true}}
    ],
    g70:[{part:p=>p.name==='Object_15'&&p.materialName==='Material__290',point:(x,y,z)=>x<-1.7&&z>.77,info:outer('upper red stop lens; lower clear/amber strip and bumper reflectors excluded')}],
    supra:[
      {part:p=>p.materialName==='tailight'||p.materialName==='tailight.003',info:outer('original rear red optical guides; lower bumper reflectors and amber material excluded')},
      {part:p=>p.materialName==='tailight.004',info:high('original central rear-window stop strip')}
    ],
    bmw_m2:[
      {part:p=>p.materialName==='MAT_BACKLIGHT'&&p.material===4,sourcePart:name=>/^red_/.test(name),info:outer('original red optical source parts; orange turn lamp, clear lenses and chrome excluded')},
      {part:p=>p.materialName==='MAT_BACKLIGHT'&&p.material===2,sourcePart:name=>/^r_glass_0[24]$/.test(name),info:{...outer('original opaque red lower and upper stop lenses; o_glass_01 and clear glass_01/02 excluded'),cover:true}}
    ],
    avante_n:[
      {part:p=>/_RedMain1$/.test(p.materialName||''),info:outer('original outer rear stop emitters; reflectors, red trim and shared DRLs excluded')},
      {part:p=>/_BrakeLightsGlass$/.test(p.materialName||''),point:(x,y,z)=>x<-1.7&&Math.abs(y)>.36&&z>.83,info:{...outer('outer upper red stop areas of the original dark cover; lower clear turn/reverse region and center tail bar retained'),cover:true}},
      {part:p=>/_DarkRed$/.test(p.materialName||''),point:(x,y,z)=>x<-1.5&&Math.abs(y)<.2&&z>1,info:high('original central rear-window stop strip')}
    ],
    gr86:[
      {part:p=>p.materialName==='Ln4Mtl',point:(x,y,z)=>x<-1.6&&Math.abs(y)>.45&&z>.68,info:outer('original red rear optical geometry; lower reflector/fog region excluded')},
      {part:p=>p.materialName==='Ln4Mtl',point:(x,y,z)=>x<-1.6&&Math.abs(y)<.23&&z>.92,info:high('original central trunk stop strip within shared red material')},
      {part:p=>p.name==='Object_11'&&p.materialName==='Wind0011Mtl',point:(x,y,z)=>x<-1.6&&(z>.835||z<.778||Math.abs(y)>.655),info:{...outer('original opaque C-shaped stop cover; central clear rectangle excluded by its separate triangles'),cover:true}}
    ]
  };
  function compact(p,indices,sourceParts){
    const map=new Map(),vertices=[],remapped=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
    for(const old of indices){let index=map.get(old);if(index===undefined){index=map.size;map.set(old,index);for(let j=0;j<8;j++){const value=p.vertices[old*8+j];vertices.push(value);if(j<3){bounds.min[j]=Math.min(bounds.min[j],value);bounds.max[j]=Math.max(bounds.max[j],value);}}}remapped.push(index);}
    const Index=map.size<65536?Uint16Array:Uint32Array;
    return {...p,vertices:new Float32Array(vertices),indices:new Index(remapped),indexType:Index.BYTES_PER_ELEMENT,bounds,triangles:indices.length/3,...(sourceParts?{sourceParts}:{} )};
  }
  function tag(p,info,id){return {...p,brakeLight:Object.freeze({vehicle:id,...info})};}
  function split(parts,recipe,id){
    const out=[];
    for(const p of parts){
      if(p.brakeLight||p.drl||p.wheel||p.paint||!recipe.part(p)){out.push(p);continue;}
      if(!recipe.point&&!recipe.sourcePart){out.push(tag(p,recipe.info,id));continue;}
      const sourceParts=p.sourceParts||[];
      if(recipe.sourcePart&&sourceParts.reduce((n,s)=>n+s.triangles,0)!==p.indices.length/3){out.push(p);continue;}
      const selected=[],rest=[],selectedParts=[],restParts=[],v=p.vertices;let si=0,end=sourceParts[0]?.triangles||0;
      for(let t=0;t<p.indices.length/3;t++){
        while(t>=end&&si+1<sourceParts.length){si++;end+=sourceParts[si].triangles;}
        const tri=Array.from(p.indices.subarray(t*3,t*3+3)),x=tri.reduce((s,i)=>s+v[i*8],0)/3,y=tri.reduce((s,i)=>s+v[i*8+1],0)/3,z=tri.reduce((s,i)=>s+v[i*8+2],0)/3;
        const yes=recipe.sourcePart?recipe.sourcePart(sourceParts[si].name):recipe.point(x,y,z);
        (yes?selected:rest).push(...tri);
      }
      if(!selected.length){out.push(p);continue;}
      if(recipe.sourcePart)for(const s of sourceParts)(recipe.sourcePart(s.name)?selectedParts:restParts).push(s);
      if(rest.length)out.push(compact(p,rest,recipe.sourcePart?restParts:undefined));
      out.push(tag(rest.length?compact(p,selected,recipe.sourcePart?selectedParts:undefined):p,recipe.info,id));
    }
    return out;
  }
  function torresOverlays(data){
    const cameras=data.photoProjection?.cameras,cam=cameras?.reduce((a,b)=>a.eye[0]<b.eye[0]?a:b);
    if(!cam||cam.eye[0]>-.9)return [];
    const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),offset=cam.offset||[0,0,0];
    const project=p=>{const q=p.map((v,i)=>v+offset[i]),depth=cam.distance-dot(cam.eye,q);return [(cam.center[0]+cam.focal*dot(cam.right,q)/depth)/cam.width,(cam.center[1]-cam.focal*dot(cam.up,q)/depth)/cam.height,depth];};
    const triangles=[];
    for(const p of data.primitives){if(!p.photoProjected||p.wheel)continue;const v=p.vertices;
      for(let i=0;i<p.indices.length;i+=3){const a=[0,1,2].map(j=>Array.from(v.subarray(p.indices[i+j]*8,p.indices[i+j]*8+3)));if(a.some(q=>q[0]>-1.5)||a.every(q=>q[2]<.65))continue;const uv=a.map(project);triangles.push({a,uv,minU:Math.min(...uv.map(q=>q[0])),maxU:Math.max(...uv.map(q=>q[0])),minV:Math.min(...uv.map(q=>q[1])),maxV:Math.max(...uv.map(q=>q[1]))});}
    }
    function surface(u,w){
      let best=null,bestDepth=Infinity;
      for(const tri of triangles){if(u<tri.minU-1e-7||u>tri.maxU+1e-7||w<tri.minV-1e-7||w>tri.maxV+1e-7)continue;const {a,uv}=tri,[A,B,C]=uv,den=(B[1]-C[1])*(A[0]-C[0])+(C[0]-B[0])*(A[1]-C[1]);if(Math.abs(den)<1e-12)continue;
        const s=((B[1]-C[1])*(u-C[0])+(C[0]-B[0])*(w-C[1]))/den,t=((C[1]-A[1])*(u-C[0])+(A[0]-C[0])*(w-C[1]))/den;
        if(s< -1e-7||t< -1e-7||s+t>1.0000001)continue;
        const weights=[s/A[2],t/B[2],(1-s-t)/C[2]],sum=weights.reduce((m,n)=>m+n,0),depth=1/sum;
        if(depth<bestDepth){bestDepth=depth;best=[0,1,2].map(j=>weights.reduce((m,n,i)=>m+n*a[i][j],0)/sum);}
      }
      return best;
    }
    // Calibrated to the original rear turntable frame23 (1440x729 image).
    // Only the three red vertical stop elements per side and roof stop strip
    // are overlaid; white reversing areas and the bumper reflectors stay photo.
    const regions=[...[[461,465],[469,473],[477,481],[959,963],[967,971],[975,979]].map(([a,b])=>({rect:[a,333,b,369],role:'stop'})),{rect:[635,121,806,125],role:'high-mount'}];
    const parts=[];
    for(let r=0;r<regions.length;r++){
      const {rect:[x0,y0,x1,y1],role}=regions[r],vertices=[],indices=[],rows=role==='stop'?8:1,cols=role==='stop'?1:20;
      for(let j=0;j<rows;j++)for(let k=0;k<cols;k++){
        const uv=[[k/cols,j/rows],[(k+1)/cols,j/rows],[(k+1)/cols,(j+1)/rows],[k/cols,(j+1)/rows]].map(([u,v])=>[(x0+(x1-x0)*u)/1440,(y0+(y1-y0)*v)/729]);
        const points=uv.map(([u,v])=>surface(u,v));if(points.some(p=>!p))continue;
        const start=vertices.length/8;for(const p of points)vertices.push(p[0]-.004,p[1],p[2],-1,0,0,0,0);indices.push(start,start+1,start+2,start,start+2,start+3);
      }
      if(!indices.length)continue;
      const p={name:'torres-stop-overlay-'+r,materialName:'source-photo-stop-overlay',vertices:new Float32Array(vertices),indices:new Uint16Array(indices),indexType:2,triangles:indices.length/3,color:[.85,.012,.018],material:4,paint:false,alpha:1,texture:null,photoProjected:false};
      parts.push(tag(p,{role,overlay:true,source:'small stop regions fitted to original rear photo and existing hull surface; 4 mm display offset'},data.id));
    }
    return parts;
  }
  function prepare(data){
    if(!data||!Array.isArray(data.primitives)||(!recipes[data.id]&&data.id!=='torres'))return data;
    if(cache.has(data))return cache.get(data);
    let result;
    if(data.id==='torres'){
      const overlays=torresOverlays(data);
      result={...data,primitives:[...data.primitives,...overlays]};
      // Its normal Canvas body is generated by VehicleMeshes rather than a
      // decoded fallback. The integration uses these same source-space overlays.
      result.brakeLightOverlays=overlays;
    }else{
      const convert=parts=>recipes[data.id].reduce((out,recipe)=>split(out,recipe,data.id),parts);
      result={...data,primitives:convert(data.primitives),...(data.fallbackPrimitives?{fallbackPrimitives:convert(data.fallbackPrimitives)}:{})};
    }
    cache.set(data,result);cache.set(result,result);return result;
  }
  const api=Object.freeze({prepare});root.VehicleBrakeLights=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
