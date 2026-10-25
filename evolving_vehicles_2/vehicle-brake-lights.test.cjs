'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),{createHash}=require('node:crypto');
const Brake=require('./vehicle-brake-lights.js'),Wheels=require('./vehicle-wheels.js'),DRL=require('./vehicle-drl.js'),Paint=require('./vehicle-paint-materials.js');
const ids=['staria','ioniq5','santafe','morning','k5','carnival','g80','torres','g70','supra','bmw_m2','avante_n','gr86'],fixtures=new Map();
function load(id){
 if(fixtures.has(id))return fixtures.get(id);
 let data;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/models',id+'-runtime.js'),'utf8'),{ManufacturerModels:{registerCompressed:s=>data=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')))}});
 const unpack=p=>{const v=Buffer.from(p.vertices,'base64'),i=Buffer.from(p.indices,'base64'),I=p.indexType===2?Uint16Array:Uint32Array;return {...p,texture:p.texture??data.textures?.[p.textureIndex],vertices:new Float32Array(v.buffer,v.byteOffset,v.length/4),indices:new I(i.buffer,i.byteOffset,i.length/I.BYTES_PER_ELEMENT)};};
 data.primitives=data.primitives.map(unpack);if(data.fallbackPrimitives)data.fallbackPrimitives=data.fallbackPrimitives.map(unpack);
 data=Paint.prepare(DRL.prepare(Wheels.prepare(data)));fixtures.set(id,data);return data;
}
const lampParts=d=>(d.primitives||[]).filter(p=>p.brakeLight);
function digest(parts){const h=createHash('sha256');for(const p of parts){h.update(Buffer.from(p.vertices.buffer,p.vertices.byteOffset,p.vertices.byteLength));h.update(Buffer.from(p.indices.buffer,p.indices.byteOffset,p.indices.byteLength));h.update(JSON.stringify([p.color,p.alpha,p.material,p.paint,p.texture]));}return h.digest('hex');}
function moments(parts){const sums=Array(16).fill(0);let count=0;for(const p of parts)for(const i of p.indices){count++;for(let j=0;j<8;j++){const x=p.vertices[i*8+j];sums[j]+=x;sums[j+8]+=x*x;}}return {count,sums};}
test('all 13 visible bodies have bounded rear stop geometry in main and every supplied LOD',()=>{
 for(const id of ids){const source=load(id),out=Brake.prepare(source);assert.equal(Brake.prepare(source),out,id+' source cached');assert.equal(Brake.prepare(out),out,id+' idempotent');
  for(const key of ['primitives','fallbackPrimitives']){if(!source[key])continue;const lamps=out[key].filter(p=>p.brakeLight);assert.ok(lamps.length,id+' '+key+' stop lamps');let left=false,right=false;
   for(const p of lamps){assert.equal(p.brakeLight.vehicle,id);assert.ok(Object.isFrozen(p.brakeLight));assert.ok(!p.paint&&!p.wheel&&!p.drl,id+' not paint, wheel or front DRL');assert.ok(['stop','high-mount'].includes(p.brakeLight.role));assert.ok(p.indices.length>0&&p.indices.length%3===0);
    for(const i of p.indices){assert.ok(i<p.vertices.length/8);const x=p.vertices[i*8],y=p.vertices[i*8+1],z=p.vertices[i*8+2];assert.ok(Number.isFinite(x+y+z));assert.ok(x<-.5,id+' behind cabin/front lamps');assert.ok(z>.65,id+' no low bumper reflector/fog lamp');if(p.brakeLight.role==='stop'){left||=y<-.3;right||=y>.3;}}
   }assert.ok(left&&right,id+' both outer sides');
  }
 }
});
test('the twelve real meshes preserve source bytes, every indexed vertex/normal/UV and unrelated part identity',()=>{
 for(const id of ids.filter(id=>id!=='torres')){const source=load(id);for(const key of ['primitives','fallbackPrimitives']){if(!source[key])continue;const before=digest(source[key]),out=Brake.prepare(source)[key];assert.equal(digest(source[key]),before,id+' immutable source');
   const names=new Set(out.filter(p=>p.brakeLight).map(p=>p.name)),old=source[key].filter(p=>names.has(p.name)),next=out.filter(p=>names.has(p.name));const a=moments(old),b=moments(next);
   assert.equal(a.count,b.count,id+' exact source triangle count');for(let i=0;i<a.sums.length;i++)assert.ok(Math.abs(a.sums[i]-b.sums[i])<Math.max(1e-5,Math.abs(a.sums[i])*1e-10),id+' indexed component '+i);
   for(const p of source[key])if(!names.has(p.name)||p.wheel||p.drl||p.paint)assert.ok(out.includes(p),id+' unrelated source identity '+p.name);
   for(const p of out.filter(p=>p.brakeLight)){const original=source[key].find(q=>q.name===p.name&&q.materialName===p.materialName&&q.color===p.color);assert.ok(original,id+' original part');for(const field of ['material','paint','alpha','texture','textureIndex','photoProjected'])assert.equal(p[field],original[field],id+' appearance retained '+field);assert.equal(p.color,original.color,id+' original color reference');}
  }}
});
test('rear reverse lamps, amber turn parts, bumper reflectors and shared front guides are never tagged',()=>{
 const exclusions={
  staria:p=>p.materialName==='TrimRed',
  ioniq5:p=>p.name==='STOCK_BODYKIT'&&p.materialName==='REDREFLECTOR'||p.materialName==='WHITEATLAS',
  santafe:p=>/^(reardirect|rearfog)/.test(p.name)||p.name==='Object139.002',
  morning:p=>p.materialName==='Lights_red'||/Bumper_Rear/.test(p.name),
  k5:p=>p.name==='lights rear_red_0 | rear bumper details_red_0',
  carnival:p=>p.name==='RL signal'||p.materialName==='RL ref2'||p.materialName==='RL bumper',
  g80:p=>p.materialName==='LGT_R_BACKUP_REF',
  g70:p=>['Material__279','Material__291','Material__292','Material__293','Material__307'].includes(p.materialName),
  supra:p=>['tailight.002','tailight.005','WebSim_reverse_lamp_lenses'].includes(p.materialName),
  avante_n:p=>/_Reflectors$|_RedBadges$|_DRLs$/.test(p.materialName||''),
  gr86:p=>['Fari0051Mtl','Ln1Mtl','Ln3Mtl'].includes(p.materialName)
 };
 for(const [id,predicate]of Object.entries(exclusions)){const source=load(id),out=Brake.prepare(source);const check=source.primitives.filter(predicate);assert.ok(check.length,id+' real exclusion fixture');for(const p of check){assert.ok(out.primitives.includes(p),id+' excluded identity '+p.name);assert.ok(!p.brakeLight);}}
 const bmw=Brake.prepare(load('bmw_m2'));for(const key of ['primitives','fallbackPrimitives']){const tagged=bmw[key].filter(p=>p.brakeLight);for(const p of tagged)assert.ok(p.sourceParts.every(s=>/^(red_|r_glass_0[24]$)/.test(s.name)),'only red original emitters or lenses');const amber=bmw[key].filter(p=>(p.sourceParts||[]).some(s=>s.name==='orange_01'||s.name==='o_glass_01'));assert.ok(amber.length);assert.ok(amber.every(p=>!p.brakeLight),'amber source and lens retained but not illuminated');}
});
test('opaque outer stop lenses emit without changing their OFF opacity or illuminating clear inner sections',()=>{
 for(const id of ['gr86','avante_n','bmw_m2','k5','g80']){const source=load(id),out=Brake.prepare(source);for(const key of ['primitives','fallbackPrimitives']){if(!out[key])continue;const covers=out[key].filter(p=>p.brakeLight?.cover);assert.ok(covers.length,id+' '+key+' actual visible covers');for(const p of covers){const original=source[key].find(q=>q.name===p.name&&q.materialName===p.materialName);assert.equal(p.alpha,original.alpha,id+' OFF opacity');assert.equal(p.texture,original.texture,id+' OFF texture');}
   if(id==='gr86')for(const p of covers)for(let t=0;t<p.indices.length;t+=3){const q=[0,1,2].map(j=>p.indices[t+j]*8),y=q.reduce((n,k)=>n+p.vertices[k+1],0)/3,z=q.reduce((n,k)=>n+p.vertices[k+2],0)/3;assert.ok(!(Math.abs(y)<.64&&z>.785&&z<.83),'central clear rectangle remains unlit');}
   if(id==='avante_n')for(const p of covers)for(let t=0;t<p.indices.length;t+=3){const q=[0,1,2].map(j=>p.indices[t+j]*8);assert.ok(q.reduce((n,k)=>n+p.vertices[k+2],0)/3>.83,'lower reverse/turn lenses remain unlit');}
  }}
});
test('identified central high stop strips are retained without inventing missing source lamps',()=>{
 for(const id of ['staria','ioniq5','santafe','morning','carnival','supra','avante_n','gr86']){const out=Brake.prepare(load(id)),high=lampParts(out).filter(p=>p.brakeLight.role==='high-mount');assert.ok(high.length,id+' high stop');for(const p of high)for(const i of p.indices){assert.ok(Math.abs(p.vertices[i*8+1])<.42,id+' central');assert.ok(p.vertices[i*8+2]>.9,id+' above tail lamps');}}
});
test('Torres adds only small photo-aligned stop overlays and preserves its complete photographic source',()=>{
 const source=load('torres'),before=digest(source.primitives),out=Brake.prepare(source),lamps=lampParts(out);assert.equal(digest(source.primitives),before);assert.equal(out.photoProjection,source.photoProjection);for(const p of source.primitives)assert.ok(out.primitives.includes(p));
 assert.equal(lamps.length,7);assert.equal(lamps.filter(p=>p.brakeLight.role==='stop').length,6);assert.equal(lamps.filter(p=>p.brakeLight.role==='high-mount').length,1);assert.deepEqual(out.brakeLightOverlays,lamps);assert.equal(lamps.reduce((n,p)=>n+p.triangles,0),136);
 let area=0;for(const p of lamps){assert.equal(p.brakeLight.overlay,true);assert.equal(p.photoProjected,false);assert.equal(p.texture,null);for(let t=0;t<p.indices.length;t+=3){const v=[0,1,2].map(j=>Array.from(p.vertices.subarray(p.indices[t+j]*8,p.indices[t+j]*8+3))),u=v[1].map((x,i)=>x-v[0][i]),w=v[2].map((x,i)=>x-v[0][i]);area+=Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])/2;}}
 assert.ok(area>.005&&area<.06,'small lamps, not a replacement tail panel: '+area);
 const c=source.photoProjection.cameras.reduce((a,b)=>a.eye[0]<b.eye[0]?a:b),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),rects=[[461,333,465,369],[469,333,473,369],[477,333,481,369],[959,333,963,369],[967,333,971,369],[975,333,979,369],[635,121,806,125]];
 for(const [j,p]of lamps.entries()){const [x0,y0,x1,y1]=rects[j];for(let i=0;i<p.vertices.length;i+=8){const v=[p.vertices[i]+.004,p.vertices[i+1],p.vertices[i+2]].map((x,k)=>x+(c.offset?.[k]||0)),depth=c.distance-dot(c.eye,v),x=(c.center[0]+c.focal*dot(c.right,v)/depth)/c.width*1440,y=(c.center[1]-c.focal*dot(c.up,v)/depth)/c.height*729;assert.ok(x>=x0-.002&&x<=x1+.002&&y>=y0-.002&&y<=y1+.002,'overlay exactly follows calibrated source photo region');}}
});
test('unknown models, absent photos and malformed source partitions fail closed without guessing lamps',()=>{
 for(const id of ['grandeur','avante','ray','musso_ev','porter2','unknown']){const d={id,primitives:[]};assert.equal(Brake.prepare(d),d);}
 assert.equal(Brake.prepare(null),null);assert.equal(Brake.prepare(undefined),undefined);
 const torres={id:'torres',primitives:[]};assert.equal(Brake.prepare(torres).primitives.length,0);
 const p={name:'red_01 | orange_01',materialName:'MAT_BACKLIGHT',material:4,vertices:new Float32Array(24),indices:new Uint16Array([0,1,2]),sourceParts:[{name:'red_01',triangles:2}]};const source={id:'bmw_m2',primitives:[p]};assert.equal(Brake.prepare(source).primitives[0],p);assert.equal(p.brakeLight,undefined);
});
