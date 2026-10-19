'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),path=require('node:path'),{createHash}=require('node:crypto');
const DRL=require('./vehicle-drl.js'),Wheels=require('./vehicle-wheels.js');
const ids=['staria','ioniq5','santafe','morning','k5','carnival','g80','torres','g70','supra','bmw_m2','avante_n','gr86'];
function load(id,packed=false){let data;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/models',id+'-runtime.js'),'utf8'),{ManufacturerModels:{registerCompressed:s=>data=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')))}});if(packed)return data;
 const unpack=p=>{const v=Buffer.from(p.vertices,'base64'),b=Buffer.from(p.indices,'base64'),I=p.indexType===2?Uint16Array:Uint32Array;return {...p,texture:p.texture??data.textures?.[p.textureIndex],vertices:new Float32Array(v.buffer,v.byteOffset,v.length/4),indices:new I(b.buffer,b.byteOffset,b.length/I.BYTES_PER_ELEMENT)};};
 data.primitives=data.primitives.map(unpack);if(data.fallbackPrimitives)data.fallbackPrimitives=data.fallbackPrimitives.map(unpack);return data;
}
function digest(parts){const h=createHash('sha256');for(const p of parts){h.update(Buffer.from(p.vertices.buffer,p.vertices.byteOffset,p.vertices.byteLength));h.update(Buffer.from(p.indices.buffer,p.indices.byteOffset,p.indices.byteLength));}return h.digest('hex');}
function moments(parts){const sums=Array(16).fill(0);let count=0;for(const p of parts)for(const index of p.indices){count++;for(let j=0;j<8;j++){const v=p.vertices[index*8+j];sums[j]+=v;sums[j+8]+=v*v;}}return {count,sums};}
test('all 13 selectable bodies expose only front daylight geometry in main and available fallback assets',()=>{
 for(const id of ids){const source=Wheels.prepare(load(id)),result=DRL.prepare(source);
  assert.equal(DRL.prepare(source),result,id+' cached');assert.equal(DRL.prepare(result),result,id+' idempotent');
  if(id==='torres'){assert.equal(result.daytimeLights.mode,'source-photo-daytime');assert.equal(result.primitives,source.primitives);continue;}
  for(const key of ['primitives','fallbackPrimitives']){if(!source[key])continue;const parts=result[key],lamps=parts.filter(p=>p.drl);assert.ok(lamps.length,id+' '+key+' has a daylight signature');
   for(const p of lamps){assert.equal(p.drl.vehicle,id);assert.equal(p.material,4);assert.equal(p.paint,false);assert.equal(p.alpha,1);assert.equal(p.texture,null);assert.equal(p.textureIndex,undefined);assert.equal(p.photoProjected,false);assert.ok(!p.wheel);assert.ok(p.color.every(c=>c>=.9&&c<=1));
    assert.ok(p.indices.length>0&&p.indices.length%3===0);for(const index of p.indices){assert.ok(Number.isInteger(index)&&index<p.vertices.length/8);assert.ok(p.vertices[index*8]>1.15,id+' never rear/mirror lamps');assert.ok(p.vertices[index*8+2]>.5,id+' never low bumper fog lamps');}
   }
   // Unrelated source materials/parts retain object identity, not merely their
   // current color. This includes body textures, transparent covers and wheels.
   const changedNames=new Set(parts.filter(p=>p.drl||p.drlCover).map(p=>p.name));for(const p of source[key])if(!changedNames.has(p.name)||p.wheel)assert.ok(parts.includes(p),id+' untouched '+p.name);
  }
 }
});
test('preparation preserves source bytes and every indexed position, normal and UV without introducing geometry',()=>{
 for(const id of ['ioniq5','torres','avante_n','gr86','bmw_m2','g70']){const source=Wheels.prepare(load(id));for(const key of ['primitives','fallbackPrimitives']){if(!source[key])continue;const before=digest(source[key]),a=moments(source[key]),out=DRL.prepare(source)[key],b=moments(out);
  assert.equal(digest(source[key]),before,id+' immutable');assert.equal(a.count,b.count,id+' exact triangle count');for(let i=0;i<a.sums.length;i++)assert.ok(Math.abs(a.sums[i]-b.sums[i])<Math.max(1e-5,Math.abs(a.sums[i])*1e-10),id+' indexed geometry component '+i);
 }}
});
test('G70 connected guides exclude the projector and three lower bulbs sharing their material',()=>{
 const data=DRL.prepare(load('g70'));for(const key of ['primitives','fallbackPrimitives']){const on=data[key].find(p=>p.drl),off=data[key].find(p=>p.name==='Object_13'&&!p.drl);assert.ok(on&&off);
  assert.equal(on.indices.length/3,key==='primitives'?2990:50,'only four narrow light-guide components');
  const projector=p=>{for(const index of p.indices){const k=index*8;if(p.vertices[k]>2.04&&p.vertices[k]<2.07&&Math.abs(p.vertices[k+1])>.69)return true;}return false;};
  assert.equal(projector(on),false);assert.equal(projector(off),true,'original textured projector remains unlit');assert.notEqual(off.texture,null);
 }
});
test('shared lamp materials retain their rear geometry and excluded bulbs, signals, glass and trim',()=>{
 for(const [id,exclude]of [['ioniq5',p=>p.materialName==='LED'],['g70',p=>['Material__281','Material__287'].includes(p.materialName)],['carnival',p=>/^HL bulb|fog/i.test(p.name||'')],['g80',p=>p.materialName==='EXT_COMMON_LED_LENS'],['gr86',p=>p.materialName==='FariFront1Mtl'],['avante_n',p=>/_OrangeSide$/.test(p.materialName||'')],['bmw_m2',p=>p.materialName==='MAT_FRONTLIGHT'&&!/^lights_/.test(p.name||'')&&!(p.sourceParts||[]).some(s=>/^glass_0[47]$/.test(s.name))]]){
  const source=load(id),out=DRL.prepare(source);let checked=0;for(const p of source.primitives)if(exclude(p)){assert.ok(out.primitives.includes(p),id+' excluded '+p.name);checked++;}assert.ok(checked,id+' meaningful excluded source fixture');
 }
 for(const id of ['avante_n','gr86']){const source=load(id),out=DRL.prepare(source),changed=new Set(out.primitives.filter(p=>p.drl).map(p=>p.name));const retained=out.primitives.filter(p=>changed.has(p.name)&&!p.drl);assert.ok(retained.length,id+' retains combined rear lamps');for(const p of retained)assert.ok(p.indices.some(i=>p.vertices[i*8]<0),id+' original rear geometry present');}
});
test('only verified front optical covers are made transparent, preserving their original texture and geometry',()=>{
 for(const id of ['bmw_m2','avante_n']){const source=load(id),out=DRL.prepare(source);for(const key of ['primitives','fallbackPrimitives']){const covers=out[key].filter(p=>p.drlCover);assert.ok(covers.length);for(const p of covers){assert.equal(p.material,1);assert.equal(p.alpha,.12);assert.ok(!p.drl&&!p.paint&&!p.wheel);assert.ok(p.indices.every(i=>p.vertices[i*8]>1.4));const original=source[key].find(s=>s.name===p.name);assert.equal(p.texture,original.texture);assert.deepEqual(p.color,original.color);}
   if(id==='bmw_m2')assert.equal(covers.reduce((n,p)=>n+p.indices.length/3,0),key==='primitives'?596:124,'only glass_04 and glass_07, never inner projector glass or black frame');
   if(id==='avante_n')assert.ok(out[key].some(p=>/_HeadLightsGlass$/.test(p.materialName||'')&&!p.drlCover&&p.indices.some(i=>p.vertices[i*8]<1)),'mirror covers unchanged');
  }}
});
test('Torres keeps the already illuminated official-photo DRL and all source appearance exactly',()=>{
 const source=Wheels.prepare(load('torres')),out=DRL.prepare(source);assert.equal(out.daytimeLights.mode,'source-photo-daytime');assert.equal(out.primitives,source.primitives);assert.equal(out.photoProjection,source.photoProjection);assert.equal(out.primitives.some(p=>p.drl||p.drlCover),false);
});
test('actual manufacturer Canvas fallbacks preserve clear optical covers, white guides and unchanged body faces',()=>{
 for(const id of ['bmw_m2','avante_n']){
  const register=useDRL=>{const context=vm.createContext({VehicleWheels:Wheels,...(useDRL?{VehicleDRL:DRL}:{}),atob:s=>Buffer.from(s,'base64').toString('binary')});vm.runInContext(fs.readFileSync(path.join(__dirname,'manufacturer-models.js'),'utf8'),context);context.ManufacturerModels.register(load(id,true));return context.ManufacturerModels;};
  const raw=register(false),lit=register(true),spec={lengthMm:4650,heightMm:1450,widthMm:1850},before=raw.create(id,spec,'#23678a').faces,after=lit.create(id,spec,'#23678a').faces,data=lit.get(id);
  assert.equal(before.length,after.length,id+' fallback triangle count');
  const expectedCovers=data.fallbackPrimitives.filter(p=>p.drlCover).reduce((n,p)=>n+p.indices.length/3,0),expectedGuides=data.fallbackPrimitives.filter(p=>p.drl).reduce((n,p)=>n+p.indices.length/3,0);
  assert.equal(after.filter(f=>/^rgba\([^)]*,0\.12\)$/.test(f.fill)).length,expectedCovers,id+' actual transparent Canvas covers');
  assert.equal(after.filter(f=>f.drl).length,expectedGuides);for(const f of after.filter(f=>f.drl)){assert.equal(f.material,'light');assert.equal(f.fill,'#edf6ff');}
  // The asset has one common body paint material (M2) or fixed white trim
  // (CN7). Compare every unchanged face as a multiset of actual positions,
  // material and color, independent of split-primitive ordering.
  const key=f=>JSON.stringify([f.vertices.map(v=>[v.x,v.y,v.z]),f.fill,f.material]);
  const counts=new Map();for(const f of before){const k=key(f);counts.set(k,(counts.get(k)||0)+1);}
  const unchanged=after.filter(f=>!f.drl&&!/^rgba\(/.test(f.fill));assert.ok(unchanged.length>after.length*.9);
  for(const f of unchanged){const k=key(f);assert.ok(counts.get(k)>0,id+' body/trim face unchanged');counts.set(k,counts.get(k)-1);}
 }
});
test('hidden bodies and unknown assets have no inferred daylight signature',()=>{
 for(const id of ['grandeur','avante','ray','musso_ev','porter2','unknown']){const source={id,primitives:[]};assert.equal(DRL.prepare(source),source);}
 assert.equal(DRL.prepare(null),null);assert.equal(DRL.prepare(undefined),undefined);
});
