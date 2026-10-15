const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
const lights=require('./g70-patrol-lights.js');
const race={time:0,sample:()=>({curvature:0})},car={vehicleId:'g70',uid:'g70-31415-g1-1',speed:35,distance:100,phase:'accelerating'};
const mesh={paint:'#d9dcdb',manufacturer:{primitives:[{paint:true}]}};
function activeTime(){for(let t=0;t<400;t+=.1){race.time=t;const s=lights.sample(race,car,mesh);if(s?.red)return t;}throw Error('No deterministic opportunity found');}
test('G70 eligibility follows actual neutral paint, not the timing-label color',()=>{
  for(const paint of ['#d9dcdb','#8c979e','#151515','#fff'])assert(lights.achromatic(paint),paint);
  for(const paint of ['#526573','#303a46','#776a63','#8a3f43','#6b7770','none'])assert(!lights.achromatic(paint),paint);
  race.time=activeTime();assert(lights.sample(race,{...car,color:'#e22'},mesh));
  assert.equal(lights.sample(race,{...car,color:'#fff'},{...mesh,paint:'#ff0000'}),null);
  assert.equal(lights.sample(race,{...car,vehicleId:'g80'},mesh),null);
});
test('deterministic finite bursts stop at corners, braking, rest and finish without changing race data',()=>{
  race.time=activeTime();const before=JSON.stringify({race,car,mesh}),s=lights.sample(race,car,mesh);
  for(let i=0;i<100;i++)assert.deepEqual(lights.sample(race,car,mesh),s);
  assert.equal(JSON.stringify({race,car,mesh}),before);
  for(const change of [{phase:'braking'},{finished:true},{dnf:true},{speed:0}])assert.equal(lights.sample(race,{...car,...change},mesh),null);
  assert.equal(lights.sample({...race,sample:d=>({curvature:d>car.distance+15?.01:0})},car,mesh),null,'upcoming curve turns the effect off');
  let on=0,off=0,red=0,blue=0;for(let t=0;t<500;t+=.1){const s=lights.sample({...race,time:t},car,mesh);s?on++:off++;if(s?.red)red++;if(s?.blue)blue++;}
  assert(on>50&&off>on*2);assert(red>20&&blue>20);
});
test('LED geometry stays on actual G70 front/rear glazing and caches bounded phase meshes',()=>{
  let model;vm.runInNewContext(fs.readFileSync(__dirname+'/assets/models/g70-runtime.js','utf8'),{ManufacturerModels:{registerCompressed:s=>model=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')))}});
  for(const p of model.primitives){for(const [key,Type]of [['vertices',Float32Array],['indices',p.indexType===2?Uint16Array:Uint32Array]]){const b=Buffer.from(p[key],'base64');p[key]=new Type(b.buffer,b.byteOffset,b.byteLength/Type.BYTES_PER_ELEMENT);}}
  const exact={...mesh,manufacturer:model,modelOffset:[0,0,0],modelScale:[1,1,1],length:4.685,width:1.85,height:1.4};
  race.time=activeTime();const effect=lights.create(race,car,exact);assert(effect.faces.length>=24);assert(effect.faces.length<=48);
  assert.deepEqual(new Set(effect.faces.map(f=>f.part)),new Set(['patrol-front','patrol-rear']));
  for(const f of effect.faces)for(const p of f.vertices){assert(Math.abs(p.y)<.55);assert(p.z>1.05&&p.z<1.31);assert(f.part==='patrol-front'?p.x>=.39&&p.x<=.47:p.x>=-1.59&&p.x<=-1.51);}
  assert.equal(lights.create(race,car,exact),effect);
});
