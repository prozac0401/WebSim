/* Wheel geometry is prepared once. Animation is a pure function of travelled
 * distance: stopping, pausing and repeated renders cannot advance its phase.
 * Source model axes are +X forward, +Y across the axle and +Z up. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,cache=new WeakMap(),faceCache=new WeakMap();
  const text=p=>(p.name||'')+' '+(p.materialName||'');
  // Explicit source parts, not a general "low dark triangle" heuristic. The
  // final cylindrical bound excludes adjacent bodywork in combined parts.
  const recipes={
    g80:{anchor:p=>p.materialName==='Tire',part:p=>/Tire|Rim_/.test(p.materialName||'')||/^(51712|58411)/.test(p.name||'')},
    g70:{anchor:p=>p.materialName==='Material__343',part:p=>/^Material__34[3-6]$/.test(p.materialName||'')},
    ioniq5:{anchor:p=>p.name==='STOCK_WHEELS',part:p=>p.name==='STOCK_WHEELS'||(p.name==='ExteriorBaseModel'&&p.materialName==='BLACKSEMIGLOSS_ATLAS'),radius:.372},
    santafe:{anchor:p=>p.name==='WHEELS_Base2'&&p.materialName==='Offroad',part:p=>p.name==='WHEELS_Base2'},
    staria:{anchor:p=>/^STARIA_HYBRID_WHEELS/.test(p.name||'')&&p.materialName==='Tire',part:p=>/^STARIA_HYBRID_WHEELS/.test(p.name||'')},
    carnival:{anchor:p=>/^tire/.test(p.name||'')&&p.materialName==='flat',part:p=>/^tire/.test(p.name||'')||/^wheel /.test(p.materialName||'')||p.materialName==='Disk'},
    morning:{anchor:p=>/DynamicPlusline.*tyres/.test(p.name||''),part:p=>/DynamicPlusline/.test(p.name||'')||(/Picanto_Base_Wheel_/.test(p.name||'')&&!/caliper/i.test(p.name))},
    supra:{anchor:p=>p.materialName==='Front_Tire.003',part:p=>/^Front_Tire\./.test(p.materialName||'')||['Material.035','glossy_black.003'].includes(p.materialName)},
    avante_n:{anchor:p=>/_Tires$/.test(p.materialName||''),part:p=>/_Rims[12]$|_Tires$|_BrakeRotors$/.test(p.materialName||'')},
    porter2:{anchor:p=>p.name==='wheels',part:p=>/^wheels(?:-photo-side)?$/.test(p.name||'')}
  };
  // Source reconstruction calibration: axle spacing, measured hub-face half
  // tracks and nominal tyre radii. These are visual-hull bounds, not CAD parts.
  const photographic={
    grandeur:[2.895,.352,.9062702143687194,.9062702143687194],
    avante:[2.750,.32535,.9014605125972458,.9014605125972458],
    k5:[2.850,.336,.8737066603303296,.9072261135810264],
    ray:[2.520,.278,.8044602634685442,.8963392376402805],
    torres:[2.680,.35785,.900990188654606,.900990188654606],
    musso_ev:[3.150,.3629,.918902431168732,.918902431168732]
  };
  const quadrant=(x,y)=>(x>=0?2:0)+(y>=0?1:0);
  function centers(primitives,recipe){
    const boxes=Array.from({length:4},()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}));
    for(const p of primitives)if(recipe.anchor(p))for(const index of p.indices){
      const k=index*8,v=p.vertices,b=boxes[quadrant(v[k],v[k+1])];
      for(let j=0;j<3;j++){b.min[j]=Math.min(b.min[j],v[k+j]);b.max[j]=Math.max(b.max[j],v[k+j]);}
    }
    return boxes.map((b,i)=>{if(!Number.isFinite(b.min[0]))return null;
      const center=b.min.map((v,j)=>(v+b.max[j])/2),radius=recipe.radius||Math.max(b.max[0]-b.min[0],b.max[2]-b.min[2])/2;
      return {center,radius,axle:i>=2?'front':'rear',side:i%2?1:-1,minY:b.min[1]-.055,maxY:b.max[1]+.055};
    });
  }
  function valid(w){return w&&Array.isArray(w.center)&&w.center.length===3&&w.center.every(Number.isFinite)&&Number.isFinite(w.radius)&&w.radius>0&&['front','rear'].includes(w.axle)&&Math.abs(w.side)===1;}
  function inside(v,k,w){return v[k+1]>=w.minY&&v[k+1]<=w.maxY&&Math.hypot(v[k]-w.center[0],v[k+2]-w.center[2])<=w.radius+.006;}
  function compact(p,indices,wheel){
    // Share no mutable buffers with the source; omit vertices unused by this
    // wheel so four split parts do not upload four copies of a combined mesh.
    const map=new Map(),vertices=[],remapped=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
    for(const old of indices){let index=map.get(old);if(index===undefined){index=map.size;map.set(old,index);for(let j=0;j<8;j++){const value=p.vertices[old*8+j];vertices.push(value);if(j<3){bounds.min[j]=Math.min(bounds.min[j],value);bounds.max[j]=Math.max(bounds.max[j],value);}}}remapped.push(index);}
    const Index=map.size<65536?Uint16Array:Uint32Array;
    return {...p,vertices:new Float32Array(vertices),indices:new Index(remapped),indexType:Index.BYTES_PER_ELEMENT,bounds,triangles:indices.length/3,...(wheel?{wheel}:{})};
  }
  function split(primitives,recipe,wheels){
    const output=[];
    for(const p of primitives){
      if(valid(p.wheel)||!recipe.part(p)){output.push(p);continue;}
      const groups=[[],[],[],[],[]],v=p.vertices;
      for(let i=0;i<p.indices.length;i+=3){const a=p.indices[i],b=p.indices[i+1],c=p.indices[i+2],q=quadrant(v[a*8],v[a*8+1]),w=wheels[q];
        const group=w&&inside(v,a*8,w)&&inside(v,b*8,w)&&inside(v,c*8,w)?q:4;
        groups[group].push(a,b,c);
      }
      if(groups[4].length===p.indices.length){output.push(p);continue;}
      for(let i=0;i<groups.length;i++)if(groups[i].length){const w=wheels[i],metadata=w?{center:w.center.slice(),radius:w.radius,axle:w.axle,side:w.side}:null;output.push(compact(p,groups[i],metadata));}
    }
    return output;
  }
  function prepare(data){
    if(!data||!Array.isArray(data.primitives))return data;
    if(cache.has(data))return cache.get(data);
    let recipe=recipes[data.id],wheels;const photo=photographic[data.id];let result=data;
    if(photo&&data.source?.kind==='photo-reconstruction'){
      recipe={part:p=>p.photoProjected===true};
      wheels=Array.from({length:4},(_,i)=>{const front=i>=2,side=i%2?1:-1,track=photo[front?2:3];return {center:[(front?1:-1)*photo[0]/2,side*track,photo[1]],radius:photo[1],axle:front?'front':'rear',side,minY:side>0?track-.18:-track-.10,maxY:side>0?track+.10:-track+.18};});
    }
    if(recipe){wheels=wheels||centers(data.primitives,recipe);
      if(wheels.every(Boolean))result={...data,primitives:split(data.primitives,recipe,wheels),...(data.fallbackPrimitives?{fallbackPrimitives:split(data.fallbackPrimitives,recipe,wheels)}:{})};
    }
    cache.set(data,result);cache.set(result,result);return result;
  }
  function radius(mesh,wheel,car){
    const spec=car?.spec||{},millimetres=wheel?.axle==='rear'?spec.rearTireRadiusMm:spec.frontTireRadiusMm;
    if(Number.isFinite(millimetres)&&millimetres>0)return millimetres/1000;
    const fallback=wheel?.radius*Math.abs(wheel?.space==='mesh'?1:mesh?.modelScale?.[0]||1);
    return Number.isFinite(fallback)&&fallback>0?fallback:0;
  }
  function angle(mesh,wheel,car){
    if(!valid(wheel)||!Number.isFinite(car?.distance))return 0;
    const r=radius(mesh,wheel,car);return r>0?(car.distance/r)%TAU:0;
  }
  function rotate(vertex,wheel,radians,scale=[1,1,1]){
    if(!radians||!valid(wheel))return vertex;
    const c=Math.cos(radians),s=Math.sin(radians),sx=scale[0]||1,sz=scale[2]||1,x=(vertex.x-wheel.center[0])/sx,z=(vertex.z-wheel.center[2])/sz;
    return {...vertex,x:wheel.center[0]+(c*x+s*z)*sx,z:wheel.center[2]+(-s*x+c*z)*sz};
  }
  function localWheel(mesh,wheel){
    if(!valid(wheel))return null;if(wheel.space==='mesh')return wheel;const scale=mesh.modelScale||[1,1,1],offset=mesh.modelOffset||[0,0,0];
    return {...wheel,center:wheel.center.map((v,i)=>(v+offset[i])*scale[i]),radius:wheel.radius*Math.abs(scale[0])};
  }
  // Procedural Canvas fallback faces already have metric coordinates. Only its
  // authored "wheels" group is considered, never neighboring wings or arches.
  function prepareFaces(mesh){
    if(!mesh||!Array.isArray(mesh.faces)||faceCache.has(mesh))return mesh;
    faceCache.set(mesh,true);const candidates=mesh.faces.filter(f=>f.part==='wheels'&&!valid(f.wheel));
    if(!candidates.length)return mesh;
    const boxes=Array.from({length:4},()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}));
    for(const f of candidates)for(const v of f.vertices){const b=boxes[quadrant(v.x,v.y)];[v.x,v.y,v.z].forEach((n,j)=>{b.min[j]=Math.min(b.min[j],n);b.max[j]=Math.max(b.max[j],n);});}
    for(const f of candidates){const v=f.vertices[0],q=quadrant(v.x,v.y),b=boxes[q];f.wheel={center:b.min.map((n,j)=>(n+b.max[j])/2),radius:(b.max[2]-b.min[2])/2,axle:q>=2?'front':'rear',side:q%2?1:-1,space:'mesh'};}
    return mesh;
  }
  const api={prepare,prepareFaces,angle,rotate,localWheel,radius};root.VehicleWheels=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
