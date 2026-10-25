'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), zlib = require('node:zlib');
const source = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const ids = ['staria','ioniq5','santafe','morning','k5','carnival','g80','torres','g70','supra','bmw_m2','avante_n','gr86'];
const face = (fill = '#361015', extra = {}) => ({ fill, material: 'light', vertices: [{x:-1.8,y:.6,z:.8},{x:-1.8,y:.8,z:.8},{x:-1.8,y:.7,z:1}], ...extra });
const primitive = extra => ({ vertices: new Float32Array([-1.8,.6,.8,-1,0,0,0,0,-1.8,.8,.8,-1,0,0,1,0,-1.8,.7,1,-1,0,0,.5,1]),
  indices: new Uint16Array([0,1,2]), indexType: 2, color: [.2,.03,.04], material: 4, alpha: 1, ...extra });
const camera = {target:{x:0,y:0,z:0},yaw:0,pitch:.2,distance:12,f:400,cx:195,cy:200,sinYaw:0,cosYaw:1,sinPitch:Math.sin(.2),cosPitch:Math.cos(.2)};

function gpuFixture() {
  const uniforms = new Map(), draws = [], uploads = [], shaders = [];
  let serial = 0, bound, color, depthWrite = true;
  const gl = new Proxy({
    ARRAY_BUFFER:34962, ELEMENT_ARRAY_BUFFER:34963, NO_ERROR:0,
    getShaderParameter:()=>true, getProgramParameter:()=>true, createShader:()=>({}), createProgram:()=>({}), getExtension:()=>({}),
    shaderSource:(_shader,text)=>shaders.push(text), getAttribLocation:(_p,name)=>name, getUniformLocation:(_p,name)=>name,
    createBuffer:()=>({id:++serial}), bindBuffer:(target,value)=>{if(target===34962)bound=value;},
    bufferData:(target,data)=>uploads.push({target,bytes:Buffer.from(data.buffer,data.byteOffset,data.byteLength).toString('base64')}),
    getError:()=>0, isContextLost:()=>false, createTexture:()=>({}),
    uniform1f:(name,value)=>uniforms.set(name,value), uniform1i:(name,value)=>uniforms.set(name,value),
    uniform2f:(name,...values)=>uniforms.set(name,values), uniform3f:(name,...values)=>uniforms.set(name,values),
    uniform4f:(name,...values)=>uniforms.set(name,values), uniform3fv:(name,value)=>uniforms.set(name,Array.from(value)),
    vertexAttrib3fv:(name,value)=>{if(name==='aColor')color=Array.from(value);},
    depthMask:value=>{depthWrite=value;},
    drawElements:()=>draws.push({kind:'asset',buffer:bound,brake:uniforms.get('uBrake'),opacity:uniforms.get('uOpacity'),car:uniforms.get('uCar')[0],color,depthWrite}),
    drawArrays:()=>draws.push({kind:'effect',buffer:bound,brake:uniforms.get('uBrake'),opacity:uniforms.get('uOpacity'),car:uniforms.get('uCar')[0],depthWrite})
  }, {get:(object,key)=>key in object?object[key]:()=>{}});
  const canvas={width:390,height:400,getContext:()=>gl,addEventListener(){}};
  const context={document:{createElement:()=>canvas}};
  vm.runInNewContext(source('vehicle-surfaces.js'),context);
  const surface=new context.VehicleSurfaces(); assert.equal(surface.available,true);
  const body=primitive({material:0,color:[.3,.5,.7]}),lamp=primitive({brakeLight:{role:'stop'}});
  const data={primitives:[body,lamp],fallbackPrimitives:[body,lamp]};
  const mesh={manufacturer:data,length:4.5,width:1.8,height:1.4,modelScale:[1,1,1],modelOffset:[0,0,0]};
  const render=entries=>{draws.length=0;assert.equal(surface.render(entries,camera,390,400),canvas);return draws;};
  const entry=(id,intensity,selected=false)=>({car:{id,brakeLightState:{on:intensity>0,intensity}},position:{x:id,y:0,elevation:0},mesh,selected});
  return {surface,draws,uploads,shaders,body,lamp,data,mesh,render,entry};
}

function canvasRenderer(mesh, extra = {}) {
  const context={...extra};vm.runInNewContext(source('circuit-renderer.js'),context);
  const renderer=Object.create(context.CircuitRenderer.prototype);
  renderer.watch=0;renderer.race={time:1};renderer._mesh=()=>mesh;renderer._project=()=>({scale:100});
  renderer._queue=(face,_camera,queue)=>queue.push(face);
  return renderer;
}
const appearance=faces=>faces.map(f=>JSON.stringify([f.vertices,f.fill,f.material])).sort();

test('GPU brake emission is per car and primitive, resets for the next car and never tints patrol effects',()=>{
  const f=gpuFixture(),before=JSON.stringify(f.data);
  const entries=[f.entry(1,.8),f.entry(2,0),{...f.entry(0,1,true),effect:{faces:[face('#258aff')]}}];
  const draws=f.render(entries);
  assert.deepEqual(draws.filter(d=>d.kind==='asset').map(d=>[d.car,d.brake]),[[1,0],[1,.8],[2,0],[2,0],[0,0],[0,1]]);
  assert.deepEqual(draws.filter(d=>d.kind==='effect').map(d=>[d.car,d.brake,d.opacity]),[[0,0,1]]);
  draws.filter(d=>d.kind==='asset').forEach((d,i)=>assert.deepEqual(d.color,i%2?f.lamp.color:f.body.color));
  assert.equal(JSON.stringify(f.data),before,'shared colors, typed geometry and tags are not rewritten per vehicle');
});

test('switching a shared lamp off restores its source draw without rebuilding buffers, including release fade while on is false',()=>{
  const f=gpuFixture(),entry=f.entry(0,1,true);f.render([entry]);const uploadCount=f.uploads.length,cacheCount=f.surface.assetCache.size;
  entry.car.brakeLightState={on:false,intensity:.25};let draws=f.render([entry]);
  assert.equal(draws[1].brake,.25,'render uses fade intensity rather than cutting at the held switch');
  entry.car.brakeLightState.intensity=0;draws=f.render([entry]);
  assert.equal(draws[1].brake,0);assert.deepEqual(draws[1].color,f.lamp.color);assert.equal(draws[1].opacity,1);
  assert.equal(f.uploads.length,uploadCount);assert.equal(f.surface.assetCache.size,cacheCount);
});

test('photo-only overlays are absent when off and use per-car opacity without writing depth while fading',()=>{
  const f=gpuFixture();f.lamp.brakeLight={role:'stop',overlay:true};const entry=f.entry(0,0,true);
  assert.equal(f.render([entry]).length,1,'only the original body is drawn');
  entry.car.brakeLightState.intensity=.5;
  const draws=f.render([entry]);assert.equal(draws.length,2);assert.equal(draws[1].brake,.5);assert.equal(draws[1].opacity,.5);assert.equal(draws[1].depthWrite,false);
  entry.car.brakeLightState.intensity=0;assert.equal(f.render([entry]).length,1);
});

test('Canvas fallback lights every rendered car independently and preserves off lenses, body faces and patrol colors',()=>{
  const lamp=face('#361015',{brakeLight:{role:'stop'}}),body=face('#447799',{material:'trim'}),overlay=face('#b30405',{brakeLight:{role:'stop',overlay:true}});
  const mesh={length:4.5,width:1.8,height:1.4,faces:[lamp,body,overlay]},before=JSON.stringify(mesh);
  const patrol=face('#258aff',{part:'patrol-rear'}),r=canvasRenderer(mesh,{G70PatrolLights:{create:()=>({faces:[patrol]})}});
  const draw=(id,intensity,selected)=>{const queue=[];r._carFaces({id,brakeLightState:{on:false,intensity}},{x:0,y:0,elevation:0,angle:0},camera,queue,selected);return queue;};
  const off=draw(0,0,true),lit=draw(0,.5,true),ghost=draw(1,.5,false);
  assert.equal(off.filter(f=>f.brakeLight).length,1);assert.equal(off.find(f=>f.brakeLight).fill,lamp.fill);
  assert.equal(lit.filter(f=>f.brakeLight).length,2);assert.equal(ghost.filter(f=>f.brakeLight).length,2);
  assert.deepEqual(lit.filter(f=>f.brakeLight).map(f=>f.fill),ghost.filter(f=>f.brakeLight).map(f=>f.fill));
  assert.match(lit.find(f=>f.brakeLight?.overlay).fill,/,0\.5\)$/);
  assert.equal(lit.find(f=>f.part==='patrol-rear').fill,patrol.fill);assert.equal(ghost.some(f=>f.part==='patrol-rear'),false);
  assert.ok(off.some(f=>f.fill===body.fill)&&lit.some(f=>f.fill===body.fill));assert.equal(JSON.stringify(mesh),before);
});

test('all thirteen actual model registrations expose existing fallback stop faces without adding Canvas geometry',()=>{
  const BrakeLights=require('./vehicle-brake-lights.js'),DRL=require('./vehicle-drl.js');
  for(const id of ids){
    let packed;vm.runInNewContext(source('assets/models/'+id+'-runtime.js'),{ManufacturerModels:{registerCompressed:s=>packed=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')))}});
    const context=vm.createContext({VehicleBrakeLights:BrakeLights,VehicleDRL:DRL,atob:s=>Buffer.from(s,'base64').toString('binary')});
    for(const file of ['vehicle-details.js','vehicle-meshes.js','manufacturer-models.js'])vm.runInContext(source(file),context);
    const spec={lengthMm:4700,widthMm:1900,heightMm:1650,wheelbaseMm:2800,frontTireRadiusMm:330,rearTireRadiusMm:330};
    const authored=context.VehicleMeshes.create(id,spec,'#447799'),authoredBefore=JSON.stringify(authored);
    context.ManufacturerModels.register(packed);
    const mesh=context.ManufacturerModels.create(id,spec,'#447799'),faces=mesh.faces,lights=faces.filter(f=>f.brakeLight);
    assert.ok(lights.length,id+' actual manufacturer fallback has stop lamps');
    assert.equal(mesh.faces,faces,id+' fallback faces are cached');
    for(const f of lights){assert.ok(f.vertices.every(v=>v.x<0),id+' rear lamps only');assert.ok(f.fill,'source lens appearance retained');}
    if(!mesh.manufacturer.fallbackPrimitives){
      assert.equal(faces.length,authored.faces.length,id+' authored body triangle count unchanged');
      assert.deepEqual(appearance(faces),appearance(authored.faces),id+' only metadata changes in authored fallback');
    }
    const before=JSON.stringify(faces),r=canvasRenderer(mesh),queue=[];
    r._carFaces({id:0,brakeLightState:{on:false,intensity:0}},{x:0,y:0,elevation:0},camera,queue,true);
    assert.equal(JSON.stringify(faces),before,id+' off rendering preserves cached fallback');
    assert.equal(JSON.stringify(authored),authoredBefore,id+' original authored model remains immutable');
  }
});

test('browser loads brake state before physics and lamp metadata before model registration',()=>{
  const html=source('evolving_vehicles_2.html'),scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
  for(const [dependency,consumer] of [['brake-light-state.js','race-engine.js'],['vehicle-brake-lights.js','manufacturer-models.js'],['manufacturer-models.js','circuit-renderer.js'],['vehicle-surfaces.js','circuit-renderer.js']]){
    assert.ok(scripts.includes(dependency)&&scripts.includes(consumer));assert.ok(scripts.indexOf(dependency)<scripts.indexOf(consumer));
  }
});
