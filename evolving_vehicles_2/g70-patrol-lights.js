/* A display-only nod to the G70 unmarked patrol car. Reference photographs and
 * the distinction between observed mounting and simulation rules are documented
 * in G70-PATROL-REFERENCES.md. No race or tuning data is changed here. */
(function(root){
  'use strict';
  const cache=new WeakMap();
  const hash=text=>{let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return h>>>0;};
  function achromatic(paint){
    let hex=String(paint||'').replace(/^#/,'');if(hex.length===3)hex=hex.split('').map(c=>c+c).join('');
    if(!/^[a-f\d]{6}$/i.test(hex))return false;
    const n=parseInt(hex,16),c=[n>>>16,(n>>>8)&255,n&255],high=Math.max(...c),low=Math.min(...c);
    // White, silver, charcoal and black may have a small cool/warm paint cast.
    return high-low<=22&&(high-low)/Math.max(high,1)<=.15&&!(c[1]>c[0]+5&&c[1]>c[2]+5);
  }
  function sample(race,car,mesh){
    if(car?.vehicleId!=='g70'||!achromatic(mesh?.paint)||!mesh?.manufacturer?.primitives?.some(p=>p.paint)||car.finished||car.dnf||!(car.speed>=15))return null;
    const time=race?.time;if(!Number.isFinite(time)||time<0||typeof race.sample!=='function')return null;
    // Stable per-entrant lottery: 38% of 18-second opportunities can produce a
    // six-second burst. Replay, pausing and rendering frequency cannot reroll it.
    const window=Math.floor(time/18),key=(car.uid||car.id)+'|'+window,draw=hash(key);
    if(draw/4294967296>=.38)return null;
    const start=1.5+(hash(key+'|start')/4294967296)*3,elapsed=time-window*18-start;
    if(elapsed<0||elapsed>=6)return null;
    // Inspect the path around the car, not just the current polygon segment.
    // Switch off before turn-in, and never illuminate while braking for a bend.
    if(car.phase==='braking')return null;
    for(const offset of [-12,0,12,24]){
      const p=root.DrivingPose?.sample(race,car.distance+offset)||race.sample(car.distance+offset);
      if(!p||!Number.isFinite(p.curvature)||Math.abs(p.curvature)>.0018)return null;
    }
    const phase=((time+hash(car.uid||car.id)/4294967296)*1.4)%1;
    const red=phase<.13||(phase>=.21&&phase<.34),blue=(phase>=.5&&phase<.63)||(phase>=.71&&phase<.84);
    return {red,blue,window};
  }
  function meshes(mesh){
    if(cache.has(mesh))return cache.get(mesh);
    const glass=mesh.manufacturer?.primitives.find(p=>p.name==='Object_35'&&p.material===1);
    if(!glass)return null;
    // Fit every LED vertex to the actual imported G70 windshield/rear-window
    // triangles. The 6 mm offset represents emission through the opaque glazing
    // used by this renderer; the body/roof continue to depth-occlude the lights.
    function surface(x,y){
      const v=glass.vertices,idx=glass.indices;
      for(let i=0;i<idx.length;i+=3){
        const a=idx[i]*8,b=idx[i+1]*8,c=idx[i+2]*8;
        const den=(v[b+1]-v[c+1])*(v[a]-v[c])+(v[c]-v[b])*(v[a+1]-v[c+1]);if(Math.abs(den)<1e-12)continue;
        const u=((v[b+1]-v[c+1])*(x-v[c])+(v[c]-v[b])*(y-v[c+1]))/den;
        const w=((v[c+1]-v[a+1])*(x-v[c])+(v[a]-v[c])*(y-v[c+1]))/den;
        if(u>=-.00001&&w>=-.00001&&u+w<=1.00001)return u*v[a+2]+w*v[b+2]+(1-u-w)*v[c+2];
      }
      return null;
    }
    const point=(x,y,lift)=>{const z=surface(x,y);return z===null?null:{x:(x+mesh.modelOffset[0])*mesh.modelScale[0],y:(y+mesh.modelOffset[1])*mesh.modelScale[1],z:(z+mesh.modelOffset[2])*mesh.modelScale[2]+lift};};
    const result={};
    for(const phase of ['red','blue','dark']){
      const faces=[];
      for(const [window,x0,x1]of [['front',.39,.47],['rear',-1.59,-1.51]])for(const side of [-1,1])for(let i=0;i<6;i++){
        const y0=side*.09+(side<0?-1:1)*i*.075,y1=y0+side*.065;
        const vertices=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>point(x,y,.006));if(vertices.some(v=>!v))continue;
        const color=side<0?'red':'blue',lit=color===phase;
        faces.push({vertices,fill:lit?(color==='red'?'#ff344e':'#258aff'):'#17242f',material:'light',flat:true,part:'patrol-'+window});
        if(lit){const core=[[x0+.023,y0+side*.014],[x1-.023,y0+side*.014],[x1-.023,y1-side*.014],[x0+.023,y1-side*.014]].map(([x,y])=>point(x,y,.009));if(core.every(Boolean))faces.push({vertices:core,fill:color==='red'?'#ffd6df':'#d3efff',material:'light',flat:true,part:'patrol-'+window});}
      }
      result[phase]={length:mesh.length,width:mesh.width,height:mesh.height,faces};
    }
    cache.set(mesh,result);return result;
  }
  function create(race,car,mesh){const state=sample(race,car,mesh);if(!state)return null;return meshes(mesh)?.[state.red?'red':state.blue?'blue':'dark']||null;}
  const api={achromatic,sample,create};root.G70PatrolLights=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
