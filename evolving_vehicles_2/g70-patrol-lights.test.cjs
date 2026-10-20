const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),{createHash}=require('node:crypto');
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
let decodedModel;
function actualMesh(){
 if(decodedModel)return {...mesh,manufacturer:decodedModel,modelOffset:[0,0,0],modelScale:[1,1,1],length:4.685,width:1.85,height:1.4};
  let model;vm.runInNewContext(fs.readFileSync(__dirname+'/assets/models/g70-runtime.js','utf8'),{ManufacturerModels:{registerCompressed:s=>model=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')))}});
  for(const p of model.primitives){for(const [key,Type]of [['vertices',Float32Array],['indices',p.indexType===2?Uint16Array:Uint32Array]]){const b=Buffer.from(p[key],'base64');p[key]=new Type(b.buffer,b.byteOffset,b.byteLength/Type.BYTES_PER_ELEMENT);}}
 decodedModel=model;return actualMesh();
}
const core=f=>['#ffd6df','#d3efff'].includes(f.fill);
const digest=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
function phases(exact){
 const r={time:8,sample:()=>({curvature:0})},c={...car},found={};
 for(let i=0;i<200;i++){
  r.time=8+i*.01;const state=lights.sample(r,c,exact);assert(state);
  const name=state.red?'red':state.blue?'blue':'dark',effect=lights.create(r,c,exact);assert(effect);
  if(found[name])assert.equal(effect,found[name],'one cached mesh per pulse phase');
  else found[name]=effect;
 }
 assert.deepEqual(Object.keys(found).sort(),['blue','dark','red']);assert.equal(new Set(Object.values(found)).size,3);
 return found;
}
// Independent ray/triangle intersection checks the imported surface itself,
// rather than repeating the production YZ barycentric interpolation formula.
function frontSurfaceX(part,y,z){
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const v=part.vertices,ix=part.indices,origin=[0,y,z],direction=[1,0,0],hits=[];
 for(let i=0;i<ix.length;i+=3){
  const points=[0,1,2].map(j=>Array.from(v.subarray(ix[i+j]*8,ix[i+j]*8+3))),[a,b,c]=points,e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);
  if(Math.abs(det)<1e-12)continue;
  const t=sub(origin,a),u=dot(t,p)/det,q=cross(t,e1),w=dot(direction,q)/det;
  if(u>=-1e-7&&w>=-1e-7&&u+w<=1+1e-7)hits.push(dot(e2,q)/det);
 }
 assert(hits.length,'Every grille LED vertex must intersect original backing');return Math.max(...hits);
}

test('actual G70 glazing and grille LEDs use bounded geometry, opposite phases and three cached meshes',()=>{
 const exact=actualMesh(),before=digest(exact.manufacturer),effects=phases(exact);
 const backing=exact.manufacturer.primitives.find(p=>p.exteriorRole==='grille-backing');assert(backing);assert.equal(backing.name,'Object_19');
 for(const [phase,effect]of Object.entries(effects)){
  const grille=effect.faces.filter(f=>f.part==='patrol-grille'),windows=effect.faces.filter(f=>f.part!=='patrol-grille');
  assert.equal(effect.faces.length,phase==='dark'?48:72);
  assert.equal(grille.filter(f=>!core(f)).length,24);assert.equal(windows.filter(f=>!core(f)).length,24);
  assert.equal(grille.filter(core).length,phase==='dark'?0:12);assert.equal(windows.filter(core).length,phase==='dark'?0:12);
  assert.deepEqual(new Set(effect.faces.map(f=>f.part)),new Set(['patrol-front','patrol-rear','patrol-grille']));
  for(const f of effect.faces){assert.equal(f.vertices.length,4);assert.equal(f.material,'light');assert.equal(f.flat,true);for(const p of f.vertices)assert(Object.values(p).every(Number.isFinite));}
  for(const f of windows)for(const p of f.vertices){assert(Math.abs(p.y)<.55);assert(p.z>1.05&&p.z<1.31);assert(f.part==='patrol-front'?p.x>=.39&&p.x<=.47:p.x>=-1.59&&p.x<=-1.51);}
  for(const f of grille)for(const p of f.vertices){
   assert(Math.abs(p.y)>=.14-1e-9&&Math.abs(p.y)<=.273+1e-9);assert(p.z>=.575-1e-9&&p.z<=.647+1e-9);
   assert(Math.abs(p.x-frontSurfaceX(backing,p.y,p.z)-(core(f)?.012:.010))<1e-8,'LED is just ahead of the frontmost original grille backing');
  }
  if(phase==='dark'){
   assert(grille.every(f=>f.fill==='#101820'));assert(windows.every(f=>f.fill==='#17242f'));
  }else{
   const windowColors=phase==='red'?['#ff344e','#ffd6df']:['#258aff','#d3efff'],grilleColors=phase==='red'?['#258aff','#d3efff']:['#ff344e','#ffd6df'];
   assert.equal(windows.filter(f=>windowColors.includes(f.fill)).length,24);
   assert.equal(grille.filter(f=>grilleColors.includes(f.fill)).length,24);
   assert(windows.every(f=>f.fill==='#17242f'||windowColors.includes(f.fill)));
   assert(grille.every(f=>f.fill==='#101820'||grilleColors.includes(f.fill)));
   for(const f of grille.filter(f=>grilleColors.includes(f.fill)))assert(f.vertices.every(p=>phase==='red'?p.y>0:p.y<0),'opposite-color bank remains on its fixed side');
  }
 }
 assert.equal(digest(exact.manufacturer),before,'Generating/caching effects must not modify original geometry, materials or typed arrays');
});

test('grille LEDs apply all model offsets/scales while preserving existing glazing lift',()=>{
 const exact=actualMesh(),offset=[.17,-.08,.04],scale=[1.23,.81,1.41],scaled={...exact,modelOffset:offset,modelScale:scale};
 const source=phases(exact),transformed=phases(scaled);
 for(const name of ['red','blue','dark']){
  assert.equal(source[name].faces.length,transformed[name].faces.length);
  source[name].faces.forEach((f,i)=>{
   const actual=transformed[name].faces[i];assert.equal(actual.part,f.part);assert.equal(actual.fill,f.fill);
   f.vertices.forEach((p,j)=>{
    const lift=f.part==='patrol-grille'?0:core(f)?.009:.006;
    const expected=[(p.x+offset[0])*scale[0],(p.y+offset[1])*scale[1],(p.z-lift+offset[2])*scale[2]+lift];
    ['x','y','z'].forEach((axis,k)=>assert(Math.abs(actual.vertices[j][axis]-expected[k])<1e-9,axis+' model transform'));
   });
  });
 }
});

test('missing grille backing leaves original front/rear window effects intact',()=>{
 const exact=actualMesh(),reduced={...exact,manufacturer:{...exact.manufacturer,primitives:exact.manufacturer.primitives.filter(p=>p.exteriorRole!=='grille-backing')}};
 const full=phases(exact),windowsOnly=phases(reduced);
 for(const phase of ['red','blue','dark']){
  assert.deepEqual(windowsOnly[phase].faces,full[phase].faces.filter(f=>f.part!=='patrol-grille'));
  assert.equal(windowsOnly[phase].faces.length,phase==='dark'?24:36);
 }
});
