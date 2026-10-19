/* Focused CPU regressions for the production photo projection and GPU resource
 * lifecycle. No browser, real WebGL context, network or external test library. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'vehicle-surfaces.js'), 'utf8');
const close = (actual, expected, label, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const radians = degrees => degrees * Math.PI / 180;

function camera(angle, textureIndex = 0, pitch = .12) {
  const a = radians(angle), horizontal = [Math.cos(a), Math.sin(a), 0];
  return {
    eye: [horizontal[0] * Math.cos(pitch), horizontal[1] * Math.cos(pitch), Math.sin(pitch)],
    right: [-Math.sin(a), Math.cos(a), 0],
    up: [-horizontal[0] * Math.sin(pitch), -horizontal[1] * Math.sin(pitch), Math.cos(pitch)],
    focal: 3278.35, distance: 19.73, center: [468.8, 417.94],
    offset: [.0286, -.017, .035], width: 940, height: 515, textureIndex
  };
}

function fixture() {
  const images = [], context = {
    Image: class Image {
      constructor() { images.push(this); }
      set src(value) { this.source = value; }
    }
  };
  vm.runInNewContext(source, context, { filename: 'vehicle-surfaces.js' });
  const uploads = [], deletedTextures = [], deletedBuffers = [], uniforms = new Map(), bindings = new Map();
  let active = 33984, nextTexture = 1, updates = 0;
  const gl = {
    TEXTURE0: 33984, TEXTURE1: 33985, TEXTURE2: 33986, TEXTURE_2D: 3553,
    TEXTURE_BINDING_2D: 32873, RGBA: 6408, UNSIGNED_BYTE: 5121,
    UNPACK_FLIP_Y_WEBGL: 37440, TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, LINEAR: 9729, CLAMP_TO_EDGE: 33071,
    createTexture() { return { textureId: nextTexture++ }; },
    activeTexture(unit) { active = unit; },
    bindTexture(target, texture) { assert.equal(target, this.TEXTURE_2D); bindings.set(active, texture); },
    getParameter(parameter) { assert.equal(parameter, this.TEXTURE_BINDING_2D); return bindings.get(active) || null; },
    texImage2D(...args) { uploads.push({ texture: bindings.get(active), source: args.at(-1) }); },
    pixelStorei() {}, texParameteri() {},
    uniform1i(name, value) { uniforms.set(name, value); },
    uniform1f(name, value) { uniforms.set(name, value); },
    uniform3fv(name, value) { uniforms.set(name, Array.from(value)); },
    uniform4f(name, ...values) { uniforms.set(name, values); },
    uniformMatrix4fv(name, transpose, value) { assert.equal(transpose, false); uniforms.set(name, Array.from(value)); },
    deleteTexture(texture) { deletedTextures.push(texture); },
    deleteBuffer(buffer) { deletedBuffers.push(buffer); }
  };
  const renderer = Object.assign(Object.create(context.VehicleSurfaces.prototype), {
    gl, available: true, textures: new Map(), repeatTextureKeys: new Map(), cache: new Map(), assetCache: new Map(), textureGeneration: 0,
    uniforms: Object.fromEntries(['uPhotoTextureA', 'uPhotoTextureB', 'uPhotoMatrixA', 'uPhotoMatrixB', 'uPhotoBlend'].map(key => [key, key])),
    onUpdate() { updates++; }
  });
  return { renderer, gl, images, uploads, deletedTextures, deletedBuffers, uniforms, bindings,
    get active() { return active; }, get updates() { return updates; } };
}

test('photo matrix matches direct calibrated perspective, including offset and image Y direction', () => {
  const { renderer } = fixture();
  const points = [[0, 0, 0], [2.34, -.82, .71], [-2.42, .92, .15], [-.47, .66, 1.425], [.17, -.23, .96]];
  for (const angle of [-179, -101, -35, 0, 31, 97, 178]) {
    for (const pitch of [.058, .22, .49]) {
      const c = camera(angle, 0, pitch), matrix = renderer._photoCameraMatrix(c);
      assert.equal(matrix.length, 16);
      for (const point of points) {
        const translated = point.map((value, i) => value + c.offset[i]);
        const depth = c.distance - dot(translated, c.eye);
        const expectedU = (c.center[0] + c.focal * dot(translated, c.right) / depth) / c.width;
        const expectedV = (c.center[1] - c.focal * dot(translated, c.up) / depth) / c.height;
        const homogeneous = [0, 1, 2].map(row => matrix[row] * point[0] + matrix[4 + row] * point[1] + matrix[8 + row] * point[2] + matrix[12 + row]);
        close(homogeneous[2], depth, 'projective depth');
        close(homogeneous[0] / homogeneous[2], expectedU, 'image U');
        close(homogeneous[1] / homogeneous[2], expectedV, 'image V');
      }
    }
  }
  const unshifted = camera(43); delete unshifted.offset;
  assert.ok(renderer._photoCameraMatrix(unshifted).every(Number.isFinite), 'zero offset is supported');
});

test('cold photo binding keeps both neighbour textures and the caller texture intact', () => {
  const f = fixture(), cameras = [camera(0, 0), camera(90, 1), camera(180, 2), camera(-90, 3)];
  const mesh = { manufacturer: { photoProjection: { cameras, textures: ['front', 'right', 'rear', 'left'] } } };
  const sentinel = { unrelatedMaterial: true };
  f.gl.bindTexture(f.gl.TEXTURE_2D, sentinel);
  const position = { x: 17, y: -8, angle: 0 };
  f.renderer._bindPhoto(mesh, position, { target: { ...position, z: .7 }, yaw: radians(25) - Math.PI / 2, pitch: .25, distance: 12 });
  assert.equal(f.images.length, 2, 'only the two needed source views are allocated');
  assert.equal(f.bindings.get(f.gl.TEXTURE1), f.renderer.textures.get('front').texture);
  assert.equal(f.bindings.get(f.gl.TEXTURE2), f.renderer.textures.get('right').texture);
  assert.notEqual(f.bindings.get(f.gl.TEXTURE1), f.bindings.get(f.gl.TEXTURE2), 'cold texture creation cannot overwrite its neighbour');
  assert.equal(f.bindings.get(f.gl.TEXTURE0), sentinel);
  assert.equal(f.active, f.gl.TEXTURE0);
  assert.equal(f.uniforms.get('uPhotoTextureA'), 1);
  assert.equal(f.uniforms.get('uPhotoTextureB'), 2);
  close(f.uniforms.get('uPhotoBlend'), 25 / 90, 'angular crossfade');
  assert.deepEqual(f.uniforms.get('uPhotoMatrixA'), Array.from(f.renderer._photoCameraMatrix(cameras[0])));
  assert.deepEqual(f.uniforms.get('uPhotoMatrixB'), Array.from(f.renderer._photoCameraMatrix(cameras[1])));
});

test('view selection is relative to car heading and crosses the 180 degree seam continuously', () => {
  for (const scenario of [
    { heading: 60, worldView: 85, first: 'front', second: 'right', blend: 25 / 90 },
    { heading: -135, worldView: -110, first: 'front', second: 'right', blend: 25 / 90 },
    { heading: 0, worldView: 179, first: 'rear', second: 'right', blend: 1 / 90 },
    { heading: 0, worldView: -179, first: 'rear', second: 'left', blend: 1 / 90 }
  ]) {
    const f = fixture();
    const mesh = { manufacturer: { photoProjection: { cameras: [camera(0, 0), camera(90, 1), camera(180, 2), camera(-90, 3)], textures: ['front', 'right', 'rear', 'left'] } } };
    const position = { x: 8, y: 13, angle: radians(scenario.heading) };
    f.renderer._bindPhoto(mesh, position, { target: { ...position, z: .5 }, yaw: radians(scenario.worldView) - Math.PI / 2, pitch: .12, distance: 10 });
    assert.equal(f.bindings.get(f.gl.TEXTURE1), f.renderer.textures.get(scenario.first).texture);
    assert.equal(f.bindings.get(f.gl.TEXTURE2), f.renderer.textures.get(scenario.second).texture);
    close(f.uniforms.get('uPhotoBlend'), scenario.blend, JSON.stringify(scenario));
  }
});

test('async texture uploads restore the currently bound material and request a redraw', () => {
  const f = fixture(), sentinel = { currentMaterial: true };
  f.gl.activeTexture(f.gl.TEXTURE2); f.gl.bindTexture(f.gl.TEXTURE_2D, sentinel);
  const record = f.renderer._texture('source-photo');
  assert.equal(f.bindings.get(f.gl.TEXTURE2), sentinel, 'placeholder allocation preserves bindings');
  assert.equal(record.ready, false);
  f.images[0].onload();
  assert.equal(record.ready, true);
  assert.equal(f.uploads.at(-1).texture, record.texture);
  assert.equal(f.uploads.at(-1).source, f.images[0]);
  assert.equal(f.bindings.get(f.gl.TEXTURE2), sentinel, 'image decode callback preserves bindings');
  assert.equal(f.active, f.gl.TEXTURE2);
  assert.equal(f.updates, 1);
});

test('a fixed upper-panel camera remains stable while the user orbits the vehicle', () => {
  const f = fixture(), cameras = [camera(0, 0), camera(90, 1), camera(180, 2), camera(-90, 3)];
  const mesh = { manufacturer: { photoProjection: { cameras, textures: ['front', 'right', 'rear', 'left'] } } };
  for (const worldView of [-130, -20, 83, 179]) {
    f.renderer._bindPhoto(mesh, { x: 0, y: 0, angle: radians(35) }, { target: { x: 0, y: 0, z: .8 }, yaw: radians(worldView) - Math.PI / 2, pitch: 1.1, distance: 12 }, 2);
    assert.equal(f.bindings.get(f.gl.TEXTURE1), f.renderer.textures.get('rear').texture);
    assert.equal(f.bindings.get(f.gl.TEXTURE2), f.renderer.textures.get('rear').texture);
    assert.equal(f.uniforms.get('uPhotoBlend'), 0);
    assert.deepEqual(f.uniforms.get('uPhotoMatrixA'), Array.from(f.renderer._photoCameraMatrix(cameras[2])));
  }
  assert.equal(f.images.length, 1, 'fixed upper panels allocate only their single source');
});

test('asset drawing returns from fixed panel views to dynamic orbit views, including camera index zero', () => {
  const f = fixture(), draws = [];
  Object.assign(f.gl, {
    ARRAY_BUFFER: 34962, FLOAT: 5126, TRIANGLES: 4, BLEND: 3042,
    uniform3fv() {}, disableVertexAttribArray() {}, enableVertexAttribArray() {},
    vertexAttribPointer() {}, vertexAttrib3fv() {}, vertexAttrib1f() {}, bindBuffer() {},
    enable() {}, disable() {}, depthMask() {},
    drawArrays() {
      draws.push({ mode: f.uniforms.get('uPhotoMode'), a: f.bindings.get(f.gl.TEXTURE1), b: f.bindings.get(f.gl.TEXTURE2), blend: f.uniforms.get('uPhotoBlend') });
    }
  });
  Object.assign(f.renderer.uniforms, Object.fromEntries(['uModelScale', 'uModelOffset', 'uOpacity', 'uHasTexture', 'uOpaqueTexture', 'uPhotoMode', 'uTexture'].map(key => [key, key])));
  f.renderer.attributes = { aPosition: 0, aNormal: 1, aUV: 2, aColor: 3, aMaterial: 4 };
  const panel = overrides => ({ p: { color: [1, 1, 1], material: 4, alpha: 1, photoProjected: true, ...overrides }, buffer: {}, count: 3 });
  f.renderer._assetBuffers = () => [
    panel({ photoCameraIndex: 2 }),
    panel({ photoProjected: false, material: 0 }),
    panel({}),
    panel({ photoCameraIndex: 0 }),
    panel({})
  ];
  const mesh = { paint: '#ffffff', modelScale: [1, 1, 1], modelOffset: [0, 0, 0], manufacturer: { photoProjection: {
    cameras: [camera(0, 0), camera(90, 1), camera(180, 2), camera(-90, 3)], textures: ['front', 'right', 'rear', 'left']
  } } };
  f.renderer._drawAsset(mesh, { x: 0, y: 0, angle: 0 }, { target: { x: 0, y: 0, z: .8 }, yaw: radians(25) - Math.PI / 2, pitch: 1.1, distance: 12 });
  assert.equal(draws.length, 5);
  const tex = name => f.renderer.textures.get(name).texture;
  assert.deepEqual(draws[0], { mode: true, a: tex('rear'), b: tex('rear'), blend: 0 });
  assert.equal(draws[1].mode, false, 'inferred roof is drawn without a photograph');
  for (const index of [2, 4]) {
    assert.equal(draws[index].mode, true);
    assert.equal(draws[index].a, tex('front'));
    assert.equal(draws[index].b, tex('right'));
    close(draws[index].blend, 25 / 90, `dynamic view after fixed primitive ${index}`);
  }
  assert.deepEqual(draws[3], { mode: true, a: tex('front'), b: tex('front'), blend: 0 });
});

test('clearing geometry rejects stale image callbacks and permits a fresh replacement', () => {
  const f = fixture(), old = f.renderer._texture('same-photo'), oldImage = f.images[0];
  const localBuffer = {}, assetBuffer = {}, assetIndices = {};
  f.renderer.cache.set('authored', { buffer: localBuffer });
  f.renderer.assetCache.set('asset', [{ buffer: assetBuffer, indexBuffer: assetIndices }]);
  f.renderer.clearGeometry();
  assert.equal(f.renderer.textureGeneration, 1);
  assert.equal(f.renderer.cache.size + f.renderer.assetCache.size + f.renderer.textures.size, 0);
  assert.deepEqual(f.deletedBuffers, [localBuffer, assetBuffer, assetIndices]);
  assert.deepEqual(f.deletedTextures, [old.texture]);
  const uploadCount = f.uploads.length;
  oldImage.onload();
  assert.equal(f.uploads.length, uploadCount, 'deleted texture is never uploaded by a late callback');
  assert.equal(old.ready, false); assert.equal(f.updates, 0);
  const fresh = f.renderer._texture('same-photo');
  assert.notEqual(fresh.texture, old.texture);
  oldImage.onload();
  assert.equal(fresh.ready, false, 'an old callback cannot mark its replacement ready');
  f.images[1].onload();
  assert.equal(fresh.ready, true);
  assert.equal(f.updates, 1);
  const pending = f.renderer._texture('context-lost-photo'), count = f.uploads.length;
  f.renderer.available = false;
  f.images[2].onload();
  assert.equal(f.uploads.length, count, 'context loss also prevents pending uploads');
  assert.equal(pending.ready, false);
});
