const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
const lights=require('./g70-patrol-lights.js');
const race={time:0,sample:()=>({curvature:0})},car={vehicleId:'g70',uid:'g70-31415-g1-1',entrant:{variantId:'g70-3.3t-rwd'},speed:35,distance:100,phase:'accelerating'};
const mesh={paint:'#d9dcdb',manufacturer:{primitives:[{paint:true}]}};
function activeTime(){for(let t=0;t<400;t+=.1){race.time=t;const s=lights.sample(race,car,mesh);if(s?.red)return t;}throw Error('No deterministic opportunity found');}
test('G70 eligibility follows actual neutral paint, not the timing-label color',()=>{
  for(const paint of ['#d9dcdb','#8c979e','#151515','#161A1A','#303836','#fff'])assert(lights.achromatic(paint),paint);
  for(const paint of ['#526573','#303a46','#776a63','#8a3f43','#6b7770','none'])assert(!lights.achromatic(paint),paint);
  race.time=activeTime();assert(lights.sample(race,{...car,color:'#e22'},mesh));
  assert.equal(lights.sample(race,{...car,color:'#fff'},{...mesh,paint:'#ff0000'}),null);
  assert.equal(lights.sample(race,{...car,vehicleId:'g80'},mesh),null);
});
test('only actual G70 3.3T RWD and AWD factory entrants can show patrol lights',()=>{
  const Evolution=require('./tuning-evolution.js');
  race.time=activeTime();
  for(const variant of Evolution.VARIANTS.g70){
    const entrant=Evolution.createEntrant({vehicleId:'g70',variantId:variant.id,budget:0});
    const state=lights.sample(race,{...car,entrant,spec:entrant.spec},mesh);
    assert.equal(!!state,variant.spec.displacementCc===3342,variant.id);
  }
  assert.equal(lights.sample(race,{...car,entrant:null,spec:{displacementCc:3342,powerPs:370}},mesh),null,'unknown trim does not inherit the effect');
  assert.equal(lights.sample(race,{...car,entrant:{variantId:'g70-2.0t-rwd'},spec:{displacementCc:3342,powerPs:500}},mesh),null,'tuned power cannot turn another trim into a patrol car');
});
test('first suitable straight is guaranteed and a full30-second burst survives corners and braking',()=>{
  const r={time:0,sample:()=>({curvature:.01})},c={...car};
  for(let t=0;t<8;t+=.25){r.time=t;assert.equal(lights.sample(r,c,mesh),null,'does not begin in a curve');}
  r.time=8;r.sample=()=>({curvature:0});const first=lights.sample(r,c,mesh);
  assert.equal(first.startedAt,8);assert.equal(first.endsAt,38);
  r.sample=()=>({curvature:.01});c.phase='braking';c.speed=8;
  let red=0,blue=0;
  for(let t=8.25;t<38;t+=.25){r.time=t;const s=lights.sample(r,c,mesh);assert(s,'continues into corner');red+=s.red;blue+=s.blue;}
  assert(red>20&&blue>20);
  r.time=38;assert.equal(lights.sample(r,c,mesh),null,'ends after30 seconds');
  r.time=50;r.sample=()=>({curvature:0});c.phase='accelerating';c.speed=35;
  assert.equal(lights.sample(r,c,mesh),null,'cooldown prevents permanent flashing');
  r.time=70;assert(lights.sample(r,c,mesh),'later straight can restart the effect');
});
test('start qualification follows the actual entrant path rather than the common centerline',()=>{
  const r={time:8,sample:()=>({curvature:0}),sampleForCar:()=>({curvature:.01})},c={...car};
  assert.equal(lights.sample(r,c,mesh),null);
  r.sample=()=>({curvature:.01});r.sampleForCar=()=>({curvature:0});
  assert(lights.sample(r,c,mesh));
});
test('pause, rewind and replay are stable without mutating race, entrant or mesh data',()=>{
  const r={time:8,sample:()=>({curvature:0})},c={...car};
  const before=JSON.stringify({r,c,mesh}),s=lights.sample(r,c,mesh);
  for(let i=0;i<100;i++)assert.deepEqual(lights.sample(r,c,mesh),s);
  assert.equal(JSON.stringify({r,c,mesh}),before);
  assert.equal(lights.sample(r,{...c,finished:true},mesh),null);
  assert.equal(lights.sample(r,{...c,dnf:true},mesh),null);
  r.time=0;assert.equal(lights.sample(r,c,mesh),null);
  r.time=8;assert.deepEqual(lights.sample(r,c,mesh),s,'rewind restarts the first opportunity');
  assert.deepEqual(lights.sample({...r},{...c},mesh),s,'new race replay has the same result');
  assert.equal(lights.sample({...r},{...c,speed:0},mesh),null,'a stopped car cannot start a burst');
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
