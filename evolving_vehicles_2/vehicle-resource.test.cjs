'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Renderer = require('./circuit-renderer.js');

function fixture() {
  const events = new Map(), images = [], buffers = new Map(), bindings = new Map();
  const calls = { created: 0, deleted: [], textureDeleted: [], textureParameters: [], uniforms: [], colors: [], ranges: [], uploads: 0, checks: 0, draws: 0, updates: 0 };
  let error = 0, failure = null, textureBinding = null;
  const gl = new Proxy({
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, TEXTURE_2D: 3553,
    TEXTURE_BINDING_2D: 32873, TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, CLAMP_TO_EDGE: 33071, REPEAT: 10497, NO_ERROR: 0, OUT_OF_MEMORY: 1285,
    getShaderParameter: () => true, getProgramParameter: () => true,
    createShader: () => ({}), createProgram: () => ({}), getExtension: () => ({}),
    getAttribLocation: (_p, name) => name, getUniformLocation: (_p, name) => name,
    uniform4f(name,...values) { calls.uniforms.push({name,values}); },
    vertexAttrib3fv(name,values) { if(name==='aColor')calls.colors.push(Array.from(values)); },
    isContextLost: () => false,
    createBuffer() { calls.created++; return failure === 'buffer-null' ? null : { id: calls.created }; },
    bindBuffer(target, buffer) { bindings.set(target, buffer); },
    bufferData(target, data) {
      calls.uploads++;
      if (failure === 'buffer-data' || failure === 'index-data' && target === this.ELEMENT_ARRAY_BUFFER) error = this.OUT_OF_MEMORY;
      else if (bindings.get(target)) buffers.set(bindings.get(target), data.byteLength);
    },
    deleteBuffer(buffer) { calls.deleted.push(buffer); buffers.delete(buffer); },
    createTexture() { return failure === 'texture-null' ? null : {}; },
    bindTexture(_target, texture) { textureBinding = texture; },
    getParameter: () => textureBinding,
    texImage2D() { if (failure === 'texture-data') error = this.OUT_OF_MEMORY; },
    texParameteri(_target, name, value) { calls.textureParameters.push({ texture:textureBinding, name, value }); },
    deleteTexture(texture) { calls.textureDeleted.push(texture); },
    getError() { calls.checks++; const value = error; error = 0; return value; },
    drawElements() {
      // Like a failed WebGL buffer allocation, zero/unallocated storage produces
      // no geometry, without throwing a JavaScript exception.
      if (buffers.get(bindings.get(this.ARRAY_BUFFER)) && buffers.get(bindings.get(this.ELEMENT_ARRAY_BUFFER))) calls.draws++;
    },
    drawArrays(_mode,first,count) { calls.ranges.push({first,count}); }
  }, { get: (target, name) => name in target ? target[name] : () => {} });
  const canvas = { width: 300, height: 150, getContext: () => gl, addEventListener: (name, fn) => events.set(name, fn) };
  const context = { document: { createElement: () => canvas }, Image: class { constructor() { this.width=1024;this.height=512;images.push(this); } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./vehicle-surfaces.js'), 'utf8'), context);
  const surface = new context.VehicleSurfaces(() => { calls.updates++; });
  const primitive = { vertices: new Float32Array([0,0,0, 0,0,1, 0,0, 1,0,0, 0,0,1, 1,0, 0,1,0, 0,0,1, 0,1]),
    indices: new Uint16Array([0,1,2]), indexType: 2, color: [1,1,1], material: 0, alpha: 1 };
  const mesh = { manufacturer: { primitives: [primitive] }, length: 4.5, width: 1.8, height: 1.4, modelScale: [1,1,1], modelOffset: [0,0,0] };
  const camera = { target: { x:0,y:0,z:0 }, yaw:0,pitch:.2,distance:12,f:400,cx:195,cy:200,sinYaw:0,cosYaw:1,sinPitch:Math.sin(.2),cosPitch:Math.cos(.2) };
  const entries = [{ car: { id:0 }, mesh, position: { x:0,y:0 }, selected:true }];
  return { gl, surface, canvas, primitive, mesh, camera, entries, events, images, calls, context,
    fail(value) { failure = value; }, render() { return surface.render(entries, camera, 390, 400); } };
}

test('factory paint allocates one filtered flake texture and releases it with its geometry', () => {
  const f=fixture();f.primitive.paint=true;f.mesh.paint='#e8e9e5';
  f.mesh.paintFinish={finish:'pearl',roughness:.22,clearcoat:.92};
  assert.equal(f.render(),f.canvas);const texture=f.surface.paintTexture,checks=f.calls.checks;
  assert.ok(texture);assert.deepEqual(f.calls.uniforms.find(c=>c.name==='uPaint').values,[.22,.75,1,.92]);
  assert.equal(f.render(),f.canvas);assert.equal(f.surface.paintTexture,texture);assert.equal(f.calls.checks,checks);
  f.surface.clearGeometry();assert.equal(f.surface.paintTexture,null);assert(f.calls.textureDeleted.includes(texture));
});

test('wheel and paint uniforms reset for static trim in the same draw pass', () => {
  const f=fixture();f.context.VehicleWheels={angle:(_mesh,wheel,car)=>car.distance/wheel.radius};
  f.entries[0].car.distance=1.2;f.primitive.wheel={center:[1,.8,.3],radius:.3};
  f.primitive.paint=true;f.mesh.paint='#e8e9e5';f.mesh.paintFinish={finish:'metallic',roughness:.28,clearcoat:.92};
  f.mesh.manufacturer.primitives.push({...f.primitive,wheel:undefined,paint:false});
  assert.equal(f.render(),f.canvas);
  assert.deepEqual(f.calls.uniforms.filter(c=>c.name==='uWheel').map(c=>c.values),[[1,.8,.3,4],[0,0,0,0]]);
  assert.deepEqual(f.calls.uniforms.filter(c=>c.name==='uPaint').map(c=>c.values),[[.28,.75,0,.92],[0,0,0,0]]);
});

test('explicit factory matte disables clearcoat and flakes without altering the following static material', () => {
 const f=fixture();f.primitive.paint=true;f.mesh.paint='#747d7b';
 // Even a caller accidentally retaining glossy defaults cannot add a shiny
 // coat to a color explicitly classified as the factory matte option.
 f.mesh.paintFinish={finish:'matte',roughness:.2,clearcoat:.92};
 f.mesh.manufacturer.primitives.push({...f.primitive,paint:false,material:1});
 assert.equal(f.render(),f.canvas);
 assert.deepEqual(f.calls.uniforms.filter(c=>c.name==='uPaint').map(c=>c.values),[[.65,0,0,0],[0,0,0,0]]);
 f.calls.uniforms.length=0;f.mesh.paintFinish={finish:'solid',roughness:.24,clearcoat:.92};
 assert.equal(f.render(),f.canvas);assert.deepEqual(f.calls.uniforms.find(c=>c.name==='uPaint').values,[.24,0,0,.92]);
});

test('photo-matched inferred panels use a weak neutral coat and keep the ready photograph color during a cold switch',()=>{
 const f=fixture();f.primitive.photoProjected=true;f.primitive.material=4;
 const fill={...f.primitive,photoProjected:false,paint:true,photoPaint:true,material:0,photoPaintColors:{EBL:'#848283',GAO:'#575d58'}};
 f.mesh.manufacturer.primitives.push(fill);
 const camera=(eye,index)=>({eye,right:[1,0,0],up:[0,0,1],distance:10,center:[500,250],focal:1000,width:1000,height:500,textureIndex:index});
 f.mesh.manufacturer.photoProjection={cameras:[camera([0,1,0],0),camera([1,0,0],1)],textures:['original-front','original-side'],paintVariants:{GAO:{textures:['green-front','green-side']}}};
 f.mesh.paint='#b4b09f';f.mesh.paintFinish={code:'EBL',finish:'metallic',roughness:.18,clearcoat:1};
 assert.equal(f.render(),f.canvas);f.images.forEach(image=>image.onload());f.render();
 const originalColor=f.calls.colors.at(-1);assert.deepEqual(originalColor,[132/255,130/255,131/255]);
 f.mesh.paint='#415b52';f.mesh.paintFinish={code:'GAO',finish:'metallic',roughness:.18,clearcoat:1};
 f.render();assert.deepEqual(f.calls.colors.at(-1),originalColor,'fill and held original photos change together');
 const fresh=f.images.slice(-2);fresh[0].onload();f.render();assert.deepEqual(f.calls.colors.at(-1),originalColor);
 fresh[1].onload();f.render();assert.deepEqual(f.calls.colors.at(-1),[87/255,93/255,88/255]);
 assert.deepEqual(f.calls.uniforms.filter(c=>c.name==='uPaint').at(-1).values,[.4,0,-1,.18]);
 assert.equal(f.mesh.paintFinish.finish,'metallic','factory paint classification is never rewritten to matte');
});

test('failed procedural paint upload falls back and releases the failed texture', () => {
  const f=fixture();f.primitive.paint=true;f.mesh.paintFinish={finish:'pearl'};f.fail('texture-data');
  assert.equal(f.render(),null);assert.equal(f.surface.available,false);assert.equal(f.calls.textureDeleted.length,1);
});

test('procedural GPU fallback uses the selected factory finish for its paint faces', () => {
 const f=fixture();f.entries[0].mesh={paintFinish:{finish:'matte',roughness:.8,clearcoat:0},faces:[{fill:'#778899',material:'paint',vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0}]}]};
 assert.equal(f.render(),f.canvas);assert.deepEqual(f.calls.uniforms.find(c=>c.name==='uPaint').values,[.8,0,0,0]);
});

test('procedural GPU fallback rotates wheel ranges without rotating the body or rebuilding buffers', () => {
  const f=fixture(),Wheels=require('./vehicle-wheels.js');f.context.VehicleWheels=Wheels;
  const face={fill:'#aaa',material:'rubber',vertices:[{x:1.3,y:.8,z:.3},{x:1,y:.8,z:.6},{x:.7,y:.8,z:.3}]};
  const wheel={center:[1,.8,.3],radius:.3,axle:'front',side:1,space:'mesh'};
  f.entries[0].mesh={faces:[{...face,wheel},{...face,material:'paint'}]};
  f.entries[0].car.distance=.15;
  assert.equal(f.render(),f.canvas);const uploads=f.calls.uploads;
  assert.deepEqual(f.calls.ranges,[{first:0,count:3},{first:3,count:3}]);
  assert.deepEqual(f.calls.uniforms.filter(c=>c.name==='uWheel').slice(-2).map(c=>c.values),[[1,.8,.3,.5],[0,0,0,0]]);
  f.calls.uniforms.length=0;assert.equal(f.render(),f.canvas);
  assert.equal(f.calls.uploads,uploads);
  assert.deepEqual(f.calls.uniforms.filter(c=>c.name==='uWheel').slice(-2).map(c=>c.values),[[1,.8,.3,.5],[0,0,0,0]]);
});

test('bufferData OUT_OF_MEMORY returns null instead of caching a permanently empty model', () => {
  const f = fixture(); f.fail('buffer-data');
  assert.equal(f.render(), null);
  assert.equal(f.surface.available, false);
  assert.match(f.surface.failure, /1285|OUT_OF_MEMORY/);
  assert.equal(f.surface.assetCache.size, 0);
  assert.equal(f.calls.draws, 0);
  assert(f.calls.deleted.length > 0);
  f.fail(null);
  assert.equal(f.render(), null, 'failed WebGL remains on the explicit software fallback path');
});

test('null buffer allocation and partial index-buffer upload both release unfinished resources', () => {
  for (const mode of ['buffer-null', 'index-data']) {
    const f = fixture(); f.fail(mode);
    assert.equal(f.render(), null, mode);
    assert.equal(f.surface.assetCache.size, 0, mode);
    assert.equal(f.surface.available, false, mode);
    if (mode === 'index-data') assert.equal(f.calls.deleted.length, 2);
  }
});

test('successful resource error checks occur only during allocation, not cached frame rendering', () => {
  const f = fixture();
  assert.equal(f.render(), f.canvas);
  assert(f.calls.checks >= 2);
  const checks = f.calls.checks, uploads = f.calls.uploads;
  assert.equal(f.render(), f.canvas);
  assert.equal(f.calls.checks, checks);
  assert.equal(f.calls.uploads, uploads);
  assert.equal(f.calls.draws, 2);
});

test('null texture and failed placeholder upload return null without caching unusable textures', () => {
  for (const mode of ['texture-null', 'texture-data']) {
    const f = fixture(); f.primitive.texture = 'data:image/png;base64,fixture'; f.fail(mode);
    assert.equal(f.render(), null, mode);
    assert.equal(f.surface.textures.size, 0);
    assert.equal(f.surface.assetCache.size, 0);
    assert.equal(f.surface.available, false);
  }
});

test('async image upload failure requests an idle redraw and never marks the texture ready', () => {
  const f = fixture(); f.primitive.texture = 'fixture-image';
  assert.equal(f.render(), f.canvas);
  const record = f.surface.textures.get('fixture-image');
  f.fail('texture-data'); f.images[0].onload();
  assert.equal(record.ready, false);
  assert.equal(f.surface.available, false);
  assert.equal(f.surface.textures.size, 0);
  assert.equal(f.calls.updates, 1);
  assert.equal(f.render(), null);
});

test('idle context loss signals a redraw and ignores pending image callbacks', () => {
  const f = fixture(); f.primitive.texture = 'pending'; f.render();
  let prevented = false;
  f.events.get('webglcontextlost')({ preventDefault() { prevented = true; } });
  assert(prevented);
  assert.equal(f.surface.available, false);
  assert.match(f.surface.failure, /context/i);
  assert.equal(f.calls.updates, 1);
  assert.equal(f.render(), null);
  f.images[0].onload();
  assert.equal(f.calls.updates, 1);
});

test('the production scene takes its same-model Canvas fallback after a GPU resource failure', () => {
  const f = fixture(); f.fail('buffer-data');
  let fallback = 0, composites = 0;
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    surfaceRenderer: f.surface, width:390, height:400, dpr:1,
    ctx:{ drawImage() { composites++; } }, _project:()=>({scale:100}), _paint(){}, _queue(){},
    _carFaces(car, position, camera, queue) { fallback++; queue.push({ car, position }); }
  });
  renderer._drawVehicleBatch(f.entries, f.camera);
  assert.equal(fallback, 1);
  assert.equal(composites, 0, 'a transparent failed GPU canvas is not treated as a rendered body');
});

test('tiled model textures use REPEAT while the same image remains separately clamped for photos/default assets', () => {
  const f=fixture();f.primitive.texture='shared-image';f.primitive.textureRepeat=true;
  assert.equal(f.render(),f.canvas);
  const repeated=f.surface._texture('shared-image',true),clamped=f.surface._texture('shared-image');
  assert.notEqual(repeated.texture,clamped.texture);
  assert.equal(f.surface.textures.size,2);
  for(const image of f.images)image.onload();
  for(const [record,wrap]of [[repeated,f.gl.REPEAT],[clamped,f.gl.CLAMP_TO_EDGE]]){
    assert.equal(record.ready,true);
    for(const name of [f.gl.TEXTURE_WRAP_S,f.gl.TEXTURE_WRAP_T])assert(f.calls.textureParameters.some(p=>p.texture===record.texture&&p.name===name&&p.value===wrap));
  }
  assert.equal(f.surface._texture('shared-image',true),repeated);
  assert.equal(f.surface._texture('shared-image'),clamped);
  const checks=f.calls.checks;f.render();assert.equal(f.calls.checks,checks,'cached tiled draws add no synchronous GL error checks');
});

test('WebGL1 rejects a non-power-of-two repeating image explicitly instead of caching an invisible incomplete texture', () => {
  const f=fixture();f.primitive.texture='non-pot';f.primitive.textureRepeat=true;f.render();
  const record=f.surface._texture('non-pot',true);f.images[0].width=600;f.images[0].onload();
  assert.equal(record.ready,false);assert.equal(f.surface.available,false);
  assert.match(f.surface.failure,/power-of-two/);assert.equal(f.surface.textures.size,0);
  assert.equal(f.calls.updates,1);assert.equal(f.render(),null);
});
