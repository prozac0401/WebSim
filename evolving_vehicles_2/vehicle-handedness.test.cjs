'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const Wheels=require('./vehicle-wheels.js'),Renderer=require('./circuit-renderer.js');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const legacy=['g70','g80','ioniq5','santafe','staria','carnival','morning','supra'];
const corrected=['bmw_m2','avante_n','gr86','k5'];
const spec={lengthMm:4000,widthMm:2000,heightMm:2000};
const b64=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');
const decode=(value,Type)=>{const bytes=Buffer.from(value,'base64');return new Type(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};
function primitive(extra={}){
 const vertices=new Float32Array([-1,.6,.5,0,1,0,.1,.8,-1,.6,1,0,1,0,.1,.2,1,.6,.5,0,1,0,.9,.8]);
 return{name:'asymmetric-left-marker',materialName:'source-marker',vertices:b64(vertices),indices:b64(new Uint16Array([0,1,2])),indexType:2,triangles:1,color:[.4,.5,.6],alpha:1,material:2,paint:false,...extra};
}
function payload(id,extra={}){const p=primitive();return{id,source:{kind:'fixture'},bounds:{min:[-2,-1,0],max:[2,1,2]},triangles:1,primitives:[p],fallbackPrimitives:[p],...extra};}
function registry(extra={}){
 const context=vm.createContext({atob,Uint8Array,Uint16Array,Uint32Array,Float32Array,Blob,Response,DecompressionStream,...extra});
 vm.runInContext(read('manufacturer-models.js'),context);return context.ManufacturerModels;
}
function packed(id){let data,compressed;vm.runInNewContext(read('assets/models/'+id+'-runtime.js'),{ManufacturerModels:{registerCompressed:s=>{compressed=s;data=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')));}}});return{data,compressed};}
const scaled=(p,mesh)=>({x:(p.x+mesh.modelOffset[0])*mesh.modelScale[0],y:(p.y+mesh.modelOffset[1])*mesh.modelScale[1],z:(p.z+mesh.modelOffset[2])*mesh.modelScale[2]});
const vector=(array,k=0)=>({x:array[k],y:array[k+1],z:array[k+2]});
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-9,message||`${a} != ${b}`);
function rearCamera(heading=0){return Renderer.prototype._createCamera({x:0,y:0,z:0},20,heading+Math.PI/2,.2,400,400,300);}

test('only the eight legacy left-axis assets are reflected; corrected four, Torres and explicit source metadata take precedence',()=>{
 const api=registry();
 for(const id of [...legacy,...corrected,'torres']){
  const data=payload(id),before=JSON.stringify(data);api.register(data);const mesh=api.create(id,spec,'#abcdef'),sign=legacy.includes(id)?-1:1;
  assert.equal(mesh.metadata.lateralSign,sign,id);assert.equal(Math.sign(mesh.modelScale[1]),sign,id);
  assert.ok(mesh.modelScale[0]>0&&mesh.modelScale[2]>0);
  assert.deepEqual(Array.from(mesh.manufacturer.primitives[0].vertices),Array.from(decode(JSON.parse(before).primitives[0].vertices,Float32Array)),'source geometry is not rewritten');
  assert.deepEqual(mesh.manufacturer.bounds,{min:[-2,-1,0],max:[2,1,2]});
 }
 for(const id of legacy){api.register(payload(id,{coordinateTransform:{handednessCorrectedForRenderer:true}}));assert.equal(api.create(id,spec,'#abcdef').metadata.lateralSign,1,id+' explicit corrected asset must not be reflected twice');}
 for(const id of corrected){const summary=JSON.parse(read('assets/models/'+id+'-runtime-summary.json'));assert.equal(summary.coordinateTransform.handednessCorrectedForRenderer,true,id+' actual released asset already has the correction');}
});

test('actual G70 geometry remains intact and the original Indian Carnival steering wheel occupies physical right',()=>{
 const api=registry();
 for(const id of ['g70','carnival']){
  const {data}=packed(id),bounds=JSON.stringify(data.bounds),first=decode(data.primitives[0].vertices,Float32Array),steering=data.primitives.find(p=>p.name==='str whl logo');
  api.register(data);const mesh=api.create(id,{lengthMm:id==='g70'?4685:5155,widthMm:1900,heightMm:id==='g70'?1400:1785},'#777777');
  assert.equal(mesh.metadata.lateralSign,-1);assert.equal(JSON.stringify(mesh.manufacturer.bounds),bounds);assert.deepEqual(Array.from(mesh.manufacturer.primitives[0].vertices),Array.from(first));
  if(id==='carnival'){
   assert.ok(steering&&steering.bounds.max[1]<0,'actual source steering-wheel logo is on the legacy negative-Y side');
   const y=(steering.bounds.min[1]+steering.bounds.max[1])/2,p=scaled({x:.68,y,z:1.1},mesh);
   assert.ok(p.y>0,'Indian RHD source steering wheel becomes physical right (+Y south at heading east)');
   const camera=rearCamera(),projected=Renderer.prototype._project(p,camera);assert.ok(projected.x>camera.cx,'rear view agrees with physical right');
  }
 }
});

test('source-derived Canvas fallback reverses triangle winding while independent procedural bodies remain untouched',()=>{
 const authored={faces:[{vertices:[{x:0,y:-.8,z:1},{x:1,y:-.8,z:1},{x:0,y:-.8,z:1.4}],fill:'#111111',material:'trim'}]},api=registry({VehicleMeshes:{create:()=>authored}});
 for(const id of ['g70','gr86']){
  api.register(payload(id));const mesh=api.create(id,spec,'#abcabc'),v=mesh.manufacturer.fallbackPrimitives[0].vertices,source=[0,1,2].map(i=>scaled(vector(v,i*8),mesh));
  const expected=id==='g70'?[source[0],source[2],source[1]]:source;
  assert.equal(JSON.stringify(mesh.faces[0].vertices),JSON.stringify(expected));
  assert.equal(mesh.faces,mesh.faces,'fallback geometry is cached, not repeatedly reflected');
  const [a,b,c]=mesh.faces[0].vertices,normalY=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
  assert.equal(Math.sign(normalY),id==='g70'?-1:1,'winding agrees with the reflected source normal');
 }
 api.register(payload('g80',{fallbackPrimitives:undefined}));const mesh=api.create('g80',spec,'#abcabc');
 assert.equal(mesh.faces,authored.faces,'independently authored fallback already uses the renderer frame');
 assert.equal(mesh.faces[0].vertices[0].y,-.8);
});

function gpuFixture(){
 const uniforms=new Map(),shaders=[],draws=[];const gl=new Proxy({NO_ERROR:0,ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,
  getShaderParameter:()=>true,getProgramParameter:()=>true,createShader:()=>({}),createProgram:()=>({}),getExtension:()=>({}),getError:()=>0,isContextLost:()=>false,
  shaderSource:(_s,text)=>shaders.push(text),getAttribLocation:(_p,name)=>name,getUniformLocation:(_p,name)=>name,createBuffer:()=>({}),createTexture:()=>({}),
  uniform1f:(n,v)=>uniforms.set(n,v),uniform1i:(n,v)=>uniforms.set(n,v),uniform2f:(n,...v)=>uniforms.set(n,v),uniform3f:(n,...v)=>uniforms.set(n,v),uniform4f:(n,...v)=>uniforms.set(n,v),uniform3fv:(n,v)=>uniforms.set(n,Array.from(v)),
  drawElements:()=>draws.push(new Map(uniforms)),drawArrays:()=>draws.push(new Map(uniforms))
 },{get:(o,k)=>k in o?o[k]:()=>{}});
 const canvas={width:800,height:600,getContext:()=>gl,addEventListener:()=>{}},context={document:{createElement:()=>canvas}};
 vm.runInNewContext(read('vehicle-surfaces.js'),context);const surface=new context.VehicleSurfaces();assert.equal(surface.available,true);
 const body=/vec3 rotateCar\(vec3 p\)\{([^}]+)\}/.exec(shaders.find(s=>s.includes('vec3 rotateCar')))[1].replace(/\bfloat\b/g,'let');
 const rotate=new Function('p','uPose','cos','sin','vec3',body);
 return{surface,draws,rotate:(p,pose)=>rotate(p,{x:pose[0],y:pose[1]},Math.cos,Math.sin,(x,y,z)=>({x,y,z}))};
}
test('captured production GPU transform and Canvas project an asymmetric left marker consistently at arbitrary heading and grade',()=>{
 const api=registry();api.register(payload('g70'));const mesh=api.create('g70',spec,'#777777'),gpu=gpuFixture(),car={id:0,vehicleId:'g70',distance:0,spec};
 const renderer=Object.create(Renderer.prototype);renderer._mesh=()=>mesh;renderer._project=()=>({scale:100});renderer._queue=(face,_camera,queue)=>queue.push(face);
 for(const [heading,grade]of [[0,0],[Math.PI/2,.2],[-2.4,-.15]]){
  const pose={x:7,y:-12,elevation:20,angle:heading,grade},camera=rearCamera(heading),queue=[];
  gpu.draws.length=0;gpu.surface.render([{mesh,car,position:pose,selected:true}],camera,800,600);
  assert.equal(gpu.surface.available,true,gpu.surface.failure);const uniform=gpu.draws[0];assert.equal(uniform.get('uModelScale')[1],-1);
  renderer._carFaces(car,pose,camera,queue);const face=queue[1],v=mesh.manufacturer.primitives[0].vertices;
  for(const [canvasIndex,sourceIndex]of [[0,0],[1,2],[2,1]]){
   const p=gpu.rotate(scaled(vector(v,sourceIndex*8),mesh),uniform.get('uPose')),translation=uniform.get('uCar'),actual=face.vertices[canvasIndex];
   close(actual.x,p.x+translation[0]);close(actual.y,p.y+translation[1]);close(actual.z+.005,p.z+translation[2],'existing GPU .055 / Canvas .05 clearance is the only vertical difference');
  }
 }
 const left=scaled({x:0,y:.6,z:1},mesh),camera=rearCamera();assert.ok(Renderer.prototype._project(left,camera).x<camera.cx,'original left marker appears on the left of a rear view');
 const normal=gpu.rotate({x:0,y:1/mesh.modelScale[1],z:0},[0,0]);assert.equal(normal.y,-1,'inverse-transpose normal changes with the reflected basis');
});

test('negative lateral scale reflects wheel centres without reversing forward spin or changing rolling distance',()=>{
 const wheel={center:[1,.8,.4],radius:.3,axle:'front',side:1},mesh={modelScale:[2,-2,3],modelOffset:[-.1,.2,-.3]},car={distance:.25,spec:{frontTireRadiusMm:327}},phase=Wheels.angle(mesh,wheel,car);
 assert.equal(phase,.25/.327);const local=Wheels.localWheel(mesh,wheel);assert.equal(local.center[1],-2);
 const source={x:1.1,y:.85,z:.65},expected=scaled(Wheels.rotate(source,wheel,phase),mesh),actual=Wheels.rotate(scaled(source,mesh),local,phase,mesh.modelScale);
 for(const key of ['x','y','z'])close(actual[key],expected[key]);
 const top=scaled({x:1,y:.8,z:.7},mesh),rotated=Wheels.rotate(top,local,Math.PI/2,mesh.modelScale);assert.ok(rotated.x>local.center[0],'top tread still moves forward');
 car.speed=0;assert.equal(Wheels.angle(mesh,wheel,car),phase,'a stopped car has no wall-clock spin');
 assert.deepEqual(wheel.center,[1,.8,.4],'source wheel metadata remains immutable');
});

test('Supra removes only its old authored-plate U compensation once during normal compressed registration',async()=>{
 const {data,compressed}=packed('supra'),original=[data.primitives,data.fallbackPrimitives].map(list=>list.map(p=>decode(p.vertices,Float32Array))),api=registry();
 await api.registerCompressed(compressed);await api.ready;const loaded=api.get('supra');assert.ok(loaded);let plates=0;
 for(const [group,list]of [loaded.primitives,loaded.fallbackPrimitives].entries())for(const [index,p]of list.entries()){
  const before=original[group][index],plate=p.materialName==='WebSim_display_plate';assert.equal(p.vertices.length,before.length);if(plate)plates++;
  for(let i=0;i<before.length;i++)assert.equal(p.vertices[i],plate&&i%8===6?Math.fround(1-before[i]):before[i],p.materialName+' only the compensated plate U may change');
 }
 assert.equal(plates,2,'both GPU and source fallback carry the single authored plate');
 const plate=loaded.primitives.find(p=>p.materialName==='WebSim_display_plate'),uv=Array.from(plate.vertices);
 for(let i=0;i<4;i++){api.create('supra',spec,'#777777');await api.ready;}
 assert.deepEqual(Array.from(plate.vertices),uv,'get/create/ready cannot toggle U on subsequent frames');
 assert.equal(api.get('supra'),loaded);
 const correctedData=payload('supra',{coordinateTransform:{handednessCorrectedForRenderer:true},primitives:[primitive({materialName:'WebSim_display_plate'})]});
 const unmodified=decode(correctedData.primitives[0].vertices,Float32Array);api.register(correctedData);assert.deepEqual(Array.from(api.get('supra').primitives[0].vertices),Array.from(unmodified),'future corrected source no longer receives the legacy workaround');
});

test('Carnival raw PlayCanvas UVs receive a textured-only V correction, keeping both plates upright and source data intact',async()=>{
 const {data,compressed}=packed('carnival'),api=registry(),originalBounds=JSON.stringify(data.bounds);
 await api.registerCompressed(compressed);await api.ready;const loaded=api.get('carnival');assert.ok(loaded);
 assert.equal(loaded.primitives.length,data.primitives.length);assert.equal(JSON.stringify(loaded.bounds),originalBounds);
 assert.deepEqual(Array.from(loaded.textures),data.textures,'all 37 original texture image byte strings remain untouched');
 let textured=0,untextured=0,plates=0;
 for(let part=0;part<data.primitives.length;part++){
  const source=data.primitives[part],actual=loaded.primitives[part],before=decode(source.vertices,Float32Array),hasTexture=!!(source.texture||source.textureIndex!==undefined);
  if(hasTexture)textured++;else untextured++;
  assert.equal(actual.vertices.length,before.length);
  for(let k=0;k<before.length;k++)assert.equal(actual.vertices[k],hasTexture&&k%8===7?Math.fround(1-before[k]):before[k],source.name+' changes only textured V; position/normal/U are original');
  assert.equal(b64(actual.indices),source.indices,'topology is unchanged');assert.equal(JSON.stringify(actual.bounds),JSON.stringify(source.bounds));
  assert.equal(actual.texture,source.texture??data.textures[source.textureIndex],'the loader keeps the original image, not a mirrored replacement');
  if(source.materialName==='nameplate'){
   plates++;const values=[];for(let k=0;k<actual.vertices.length;k+=8)values.push({z:actual.vertices[k+2],v:actual.vertices[k+7]});
   const minZ=Math.min(...values.map(v=>v.z)),maxZ=Math.max(...values.map(v=>v.z));
   const low=values.filter(v=>v.z<minZ+.001),high=values.filter(v=>v.z>maxZ-.001);
   assert.ok(maxZ-minZ>.1&&low.length&&high.length,'actual front/rear plate spans its original vertical panel');
   assert.ok(Math.max(...high.map(v=>v.v))<Math.min(...low.map(v=>v.v)),'higher physical plate vertices sample smaller image V');
  }
 }
 assert.ok(textured>50&&untextured>200,'exercise all textured and plain production components');assert.equal(loaded.textures.length,37);assert.equal(plates,2);
 const currentPlate=loaded.primitives.find(p=>p.materialName==='nameplate'),once=Array.from(currentPlate.vertices);
 for(let i=0;i<3;i++){api.create('carnival',spec,'#777777');await api.ready;}
 assert.deepEqual(Array.from(currentPlate.vertices),once,'cached model creation cannot flip V again');
 const sourcePlate=data.primitives.find(p=>p.materialName==='nameplate'),original=decode(sourcePlate.vertices,Float32Array);
 for(const geometryCorrected of [false,true])for(const uvCorrected of [false,true]){
  api.register(payload('carnival',{coordinateTransform:{handednessCorrectedForRenderer:geometryCorrected,uvOriginCorrectedForRenderer:uvCorrected},primitives:[{...sourcePlate}],textures:data.textures}));
  const p=api.get('carnival').primitives[0];
  for(let k=0;k<original.length;k++)assert.equal(p.vertices[k],!uvCorrected&&k%8===7?Math.fround(1-original[k]):original[k],'UV correction flag is independent of geometry handedness');
  assert.equal(api.create('carnival',spec,'#777777').metadata.lateralSign,geometryCorrected?1:-1);
 }
 for(const id of [...legacy.filter(id=>id!=='carnival'),...corrected,'torres']){
  const p=primitive({textureIndex:0}),vertices=decode(p.vertices,Float32Array);api.register(payload(id,{primitives:[p],textures:['unchanged-texture-bytes']}));
  assert.deepEqual(Array.from(api.get(id).primitives[0].vertices),Array.from(vertices),id+' does not use the raw Carnival JSON UV convention');
 }
});

test('Torres original photo-camera bases already agree with renderer screen right and remain unreflected',()=>{
 const {data}=packed('torres'),cameras=data.photoProjection.cameras,before=JSON.stringify(cameras),api=registry();api.register(data);
 const mesh=api.create('torres',spec,'#777777');assert.equal(mesh.metadata.lateralSign,1);assert.equal(JSON.stringify(mesh.manufacturer.photoProjection.cameras),before);
 for(const camera of cameras){const [x,y]=camera.eye,n=Math.hypot(x,y),dot=camera.right[0]*y/n-camera.right[1]*x/n;close(dot,1,'original photograph horizontal direction agrees with the world camera');}
});
