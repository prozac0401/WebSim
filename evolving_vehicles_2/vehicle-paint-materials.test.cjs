'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),path=require('node:path');
const Paint=require('./vehicle-paint-materials.js'),Wheels=require('./vehicle-wheels.js'),DRL=require('./vehicle-drl.js');
const ids=['g80','ioniq5','santafe','staria','carnival','morning','k5','torres','g70','supra','bmw_m2','avante_n','gr86'];
function load(id){let data;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/models',id+'-runtime.js'),'utf8'),{ManufacturerModels:{registerCompressed:s=>data=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')))}});
 const unpack=p=>{const v=Buffer.from(p.vertices,'base64'),b=Buffer.from(p.indices,'base64'),I=p.indexType===2?Uint16Array:Uint32Array;return {...p,texture:p.texture??data.textures?.[p.textureIndex],vertices:new Float32Array(v.buffer,v.byteOffset,v.length/4),indices:new I(b.buffer,b.byteOffset,b.length/I.BYTES_PER_ELEMENT)};};
 data.primitives=data.primitives.map(unpack);if(data.fallbackPrimitives)data.fallbackPrimitives=data.fallbackPrimitives.map(unpack);return data;
}
test('all thirteen selectable exteriors expose isolated paint while wheel, lamp and trim buffers remain untouched',()=>{
 for(const id of ids){const source=DRL.prepare(Wheels.prepare(load(id))),out=Paint.prepare(source);
  assert.equal(Paint.prepare(source),out);assert.equal(Paint.prepare(out),out);
  for(const key of ['primitives','fallbackPrimitives']){if(!source[key])continue;assert.equal(out[key].length,source[key].length,id+' primitive count');
   const paint=out[key].filter(p=>p.paint);assert.ok(paint.length,id+' '+key+' has painted body');
   for(let i=0;i<source[key].length;i++){const a=source[key][i],b=out[key][i];assert.equal(b.vertices,a.vertices);assert.equal(b.indices,a.indices);assert.equal(b.texture,a.texture);assert.equal(b.alpha,a.alpha);
    if(!b.paint)assert.equal(b,a,id+' immutable nonpaint '+a.name);
    if(b.paint){assert.equal(b.material,0);assert.ok(!b.wheel&&!b.drl&&!b.drlCover&&!b.photoProjected);assert.ok(!b.texture,'no original pigment texture multiplies the replacement color');}
   }
  }
 }
});
test('CN7 recolors only Ceramic White in both LODs, retaining red accents, black moldings and every glass material',()=>{
 const source=load('avante_n'),out=Paint.prepare(source);
 for(const key of ['primitives','fallbackPrimitives']){
  const body=out[key].filter(p=>p.paint);assert.equal(body.length,1);assert.equal(body[0].materialName,'M_2022_Hyundai_Elantra_N_Ceramic_White');
  assert.ok(body[0].indices.length>3000,'real body geometry');
  for(const p of source[key])if(p.materialName!=='M_2022_Hyundai_Elantra_N_Ceramic_White')assert.ok(out[key].includes(p));
  assert.ok(out[key].some(p=>/_Windows$/.test(p.materialName)&&!p.paint));
  assert.ok(out[key].some(p=>/_RedBadges$/.test(p.materialName)&&!p.paint));
 }
});
test('Torres swaps only complete calibrated photo sets and paints only its inferred roof and hood',()=>{
 const source=load('torres'),frames=source.photoProjection.cameras.map((_,i)=>'https://example.invalid/white/'+i+'.jpg'),variants={WAA:{textures:frames}};
 globalThis.VehiclePaintPhotos={torres:{paintVariants:variants}};
 try{const out=Paint.prepare(source);assert.equal(out.photoProjection.paintVariants,variants);assert.equal(out.photoProjection.cameras,source.photoProjection.cameras);assert.equal(out.photoProjection.textures,source.photoProjection.textures);assert.equal(source.photoProjection.paintVariants,undefined);
  assert.deepEqual(out.primitives.filter(p=>p.paint).map(p=>p.name),['inferred-painted-roof','inferred-painted-hood']);
  for(const p of out.primitives.filter(p=>p.paint)){
   assert.equal(p.photoPaint,true,'inferred panels use the separate photo-matched finish');
   assert.deepEqual(Object.keys(p.photoPaintColors),['EBL','WAA','GAO','ADL','BAS','LAK']);
   assert.equal(!!p.photoProjected,false,'uncalibrated inferred panels must not stretch windshield pixels');
   assert.equal(Object.isFrozen(p.photoPaintColors),true);
  }
  assert.equal(out.primitives[0],source.primitives[0],'photo hull remains identical, with all glass/DRL/trim pixels');
 }finally{delete globalThis.VehiclePaintPhotos;}
});
test('hidden exterior registrations are unaffected by paint preparation',()=>{
 for(const id of ['grandeur','avante','ray','musso_ev','porter2','unknown']){const data={id,primitives:[]};assert.equal(Paint.prepare(data),data);}
 assert.equal(Paint.prepare(null),null);
});
