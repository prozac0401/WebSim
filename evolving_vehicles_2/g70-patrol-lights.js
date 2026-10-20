/* A display-only nod to the G70 unmarked patrol car. Reference photographs and
 * the distinction between observed mounting and simulation rules are documented
 * in G70-PATROL-REFERENCES.md. No race or tuning data is changed here. */
(function(root){
  'use strict';
  const cache=new WeakMap(),sessions=new WeakMap();
  const hash=text=>{let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return h>>>0;};
  function achromatic(paint){
    let hex=String(paint||'').replace(/^#/,'');if(hex.length===3)hex=hex.split('').map(c=>c+c).join('');
    if(!/^[a-f\d]{6}$/i.test(hex))return false;
    const n=parseInt(hex,16),c=[n>>>16,(n>>>8)&255,n&255],high=Math.max(...c),low=Math.min(...c);
    // White, silver, charcoal and black may have a small cool/warm paint cast.
    return high-low<=22&&(high-low)/Math.max(high,40)<=.15&&!(c[1]>c[0]+5&&c[1]>c[2]+5);
  }
  function sample(race,car,mesh){
    const variant=car?.entrant?.variantId;
    if(car?.vehicleId!=='g70'||(variant!=='g70-3.3t-rwd'&&variant!=='g70-3.3t-awd')||!achromatic(mesh?.paint)||!mesh?.manufacturer?.primitives?.some(p=>p.paint)||car.finished||car.dnf)return null;
    const time=race?.time;if(!Number.isFinite(time)||time<0||typeof race.sample!=='function')return null;
    let cars=sessions.get(race);if(!cars){cars=new WeakMap();sessions.set(race,cars);}
    let state=cars.get(car);
    const key=car.uid||car.id;
    // A new race (or a rewind) gets a guaranteed first suitable straight,
    // rather than a lottery that can hide the effect for several entire races.
    // This visual latch is external to all race/entrant/mesh data.
    if(!state||time<state.lastTime){state={lastTime:time,start:-Infinity,end:-Infinity,next:1.5+hash(key+'|start')/4294967296*3,count:0};cars.set(car,state);}
    state.lastTime=time;
    if(time>=state.end&&time>=state.next&&car.speed>=15&&car.phase!=='braking'){
      const straight=[-12,0,12,24].every(offset=>{
        const distance=car.distance+offset;
        const p=root.DrivingPose?.sampleCar(race,car,distance)||race.sampleForCar?.(car,distance)||race.sample(distance);
        return p&&Number.isFinite(p.curvature)&&Math.abs(p.curvature)<=.0018;
      });
      if(straight){
        state.start=time;state.end=time+30;state.count++;
        state.next=state.end+18+hash(key+'|cooldown|'+state.count)/4294967296*12;
      }
    }
    // Once started, the full30-second burst continues through corners and
    // braking. Pausing freezes race.time; paint/trim/finish still govern display.
    if(time>=state.end)return null;
    const phase=((time+hash(car.uid||car.id)/4294967296)*1.4)%1;
    const red=phase<.13||(phase>=.21&&phase<.34),blue=(phase>=.5&&phase<.63)||(phase>=.71&&phase<.84);
    return {red,blue,window:state.count,startedAt:state.start,endsAt:state.end};
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
    const backing=mesh.manufacturer.primitives.find(p=>p.exteriorRole==='grille-backing');
    // The police-provided pre-facelift photograph also shows two compact,
    // three-row LED banks behind the upper grille. Fit YZ to the actual backing
    // and stay behind the diamond lattice so its depth occlusion remains real.
    function grillePoint(y,z,lift){
      if(!backing)return null;
      const v=backing.vertices,idx=backing.indices;let front=-Infinity;
      for(let i=0;i<idx.length;i+=3){
        const a=idx[i]*8,b=idx[i+1]*8,c=idx[i+2]*8;
        const den=(v[b+2]-v[c+2])*(v[a+1]-v[c+1])+(v[c+1]-v[b+1])*(v[a+2]-v[c+2]);if(Math.abs(den)<1e-12)continue;
        const u=((v[b+2]-v[c+2])*(y-v[c+1])+(v[c+1]-v[b+1])*(z-v[c+2]))/den;
        const w=((v[c+2]-v[a+2])*(y-v[c+1])+(v[a+1]-v[c+1])*(z-v[c+2]))/den;
        if(u>=-.00001&&w>=-.00001&&u+w<=1.00001)front=Math.max(front,u*v[a]+w*v[b]+(1-u-w)*v[c]);
      }
      return Number.isFinite(front)?{x:(front+lift+mesh.modelOffset[0])*mesh.modelScale[0],y:(y+mesh.modelOffset[1])*mesh.modelScale[1],z:(z+mesh.modelOffset[2])*mesh.modelScale[2]}:null;
    }
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
      for(const side of [-1,1])for(let row=0;row<3;row++)for(let col=0;col<4;col++){
        const edge=side*(.14+col*.035),y0=Math.min(edge,edge+side*.028),y1=Math.max(edge,edge+side*.028),z0=.575+row*.028,z1=z0+.016;
        const vertices=[[y0,z0],[y1,z0],[y1,z1],[y0,z1]].map(([y,z])=>grillePoint(y,z,.010));if(vertices.some(v=>!v))continue;
        // In the reference's two exposure phases, the grille and windshield
        // show opposite colors. Keep that alternation within the same latch.
        const color=side<0?'red':'blue',lit=phase!=='dark'&&color!==phase;
        faces.push({vertices,fill:lit?(color==='red'?'#ff344e':'#258aff'):'#101820',material:'light',flat:true,part:'patrol-grille'});
        if(lit){const core=[[y0+.004,z0+.004],[y1-.004,z0+.004],[y1-.004,z1-.004],[y0+.004,z1-.004]].map(([y,z])=>grillePoint(y,z,.012));if(core.every(Boolean))faces.push({vertices:core,fill:color==='red'?'#ffd6df':'#d3efff',material:'light',flat:true,part:'patrol-grille'});}
      }
      result[phase]={length:mesh.length,width:mesh.width,height:mesh.height,faces};
    }
    cache.set(mesh,result);return result;
  }
  function create(race,car,mesh){const state=sample(race,car,mesh);if(!state)return null;return meshes(mesh)?.[state.red?'red':state.blue?'blue':'dark']||null;}
  const api={achromatic,sample,create};root.G70PatrolLights=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
