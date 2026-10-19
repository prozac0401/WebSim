'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Renderer = require('./circuit-renderer.js');

function fixture() {
  const events = new Map(), images = [], buffers = new Map(), bindings = new Map();
  const calls = { created: 0, deleted: [], textureDeleted: [], uploads: 0, checks: 0, draws: 0, updates: 0 };
  let error = 0, failure = null, textureBinding = null;
  const gl = new Proxy({
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, TEXTURE_2D: 3553,
    TEXTURE_BINDING_2D: 32873, NO_ERROR: 0, OUT_OF_MEMORY: 1285,
    getShaderParameter: () => true, getProgramParameter: () => true,
    createShader: () => ({}), createProgram: () => ({}), getExtension: () => ({}),
    getAttribLocation: (_p, name) => name, getUniformLocation: (_p, name) => name,
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
    deleteTexture(texture) { calls.textureDeleted.push(texture); },
    getError() { calls.checks++; const value = error; error = 0; return value; },
    drawElements() {
      // Like a failed WebGL buffer allocation, zero/unallocated storage produces
      // no geometry, without throwing a JavaScript exception.
      if (buffers.get(bindings.get(this.ARRAY_BUFFER)) && buffers.get(bindings.get(this.ELEMENT_ARRAY_BUFFER))) calls.draws++;
    }
  }, { get: (target, name) => name in target ? target[name] : () => {} });
  const canvas = { width: 300, height: 150, getContext: () => gl, addEventListener: (name, fn) => events.set(name, fn) };
  const context = { document: { createElement: () => canvas }, Image: class { constructor() { images.push(this); } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./vehicle-surfaces.js'), 'utf8'), context);
  const surface = new context.VehicleSurfaces(() => { calls.updates++; });
  const primitive = { vertices: new Float32Array([0,0,0, 0,0,1, 0,0, 1,0,0, 0,0,1, 1,0, 0,1,0, 0,0,1, 0,1]),
    indices: new Uint16Array([0,1,2]), indexType: 2, color: [1,1,1], material: 0, alpha: 1 };
  const mesh = { manufacturer: { primitives: [primitive] }, length: 4.5, width: 1.8, height: 1.4, modelScale: [1,1,1], modelOffset: [0,0,0] };
  const camera = { target: { x:0,y:0,z:0 }, yaw:0,pitch:.2,distance:12,f:400,cx:195,cy:200,sinYaw:0,cosYaw:1,sinPitch:Math.sin(.2),cosPitch:Math.cos(.2) };
  const entries = [{ car: { id:0 }, mesh, position: { x:0,y:0 }, selected:true }];
  return { gl, surface, canvas, primitive, mesh, camera, entries, events, images, calls,
    fail(value) { failure = value; }, render() { return surface.render(entries, camera, 390, 400); } };
}

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
