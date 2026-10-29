'use strict';
// Run: node --test evolving_vehicles_2/vehicle-wheel-pose.test.cjs
// Observe the real asset draw method at its GL boundary; no shader reimplementation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const context = vm.createContext({});
for (const file of ['vehicle-wheels.js', 'vehicle-surfaces.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
}
const Surface = context.VehicleSurfaces;
const camera = { target: { x: 0, y: 0, z: 0 }, distance: 8, yaw: 0, pitch: 0,
  sinYaw: 0, cosYaw: 1, sinPitch: 0, cosPitch: 1, f: 600, cx: 320, cy: 200 };
const position = { x: 0, y: 0, elevation: 0, angle: 0, grade: 0 };

function recorder() {
  const values = new Map(), draws = [];
  let bound;
  const gl = {
    ARRAY_BUFFER: 1, ELEMENT_ARRAY_BUFFER: 2, TRIANGLES: 3, FLOAT: 4,
    bindBuffer(target, buffer) { if (target === this.ARRAY_BUFFER) bound = buffer; },
    drawArrays() { record(); }, drawElements() { record(); }
  };
  function record() {
    draws.push({ id: bound.id, wheel: values.get('uWheel')?.slice(),
      steer: values.get('uWheelSteer') });
  }
  for (const name of ['uniform1f', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform4f']) {
    gl[name] = (location, ...v) => values.set(location, v.length === 1 ? v[0] : v);
  }
  for (const name of ['uniform3fv', 'uniform4fv']) gl[name] = (location, v) => values.set(location, Array.from(v));
  for (const name of ['disableVertexAttribArray', 'enableVertexAttribArray', 'vertexAttribPointer',
    'vertexAttrib3fv', 'vertexAttrib1f', 'vertexAttrib2f', 'enable', 'disable', 'blendFuncSeparate',
    'depthMask', 'viewport', 'clearColor', 'clear', 'depthFunc', 'useProgram']) gl[name] = () => {};
  const surface = Object.create(Surface.prototype);
  Object.assign(surface, { gl, available: true, canvas: { width: 640, height: 400 },
    uniforms: new Proxy({}, { get: (_target, name) => name }),
    attributes: { aPosition: 0, aNormal: 1, aUV: 2, aColor: 3, aMaterial: 4 },
    lodCache: new WeakMap(), _bindPaint() {}, _fail(error) { throw error; },
    _assetBuffers(model) { return model.primitives.map(p => ({ p, buffer: p, count: 3,
      ...(p.id === 'front-source-plus' ? { indexBuffer: {}, type: 5 } : {}) })); },
    _buffer(mesh) { return { buffer: mesh, count: 3, ranges: [{ first: 0, count: 3 }] }; }
  });
  return { surface, draws, values };
}

function mesh(sideScale = 1) {
  const part = (id, axle, side) => ({ id, color: [.4, .4, .4], material: 2,
    ...(axle ? { wheel: { center: [axle === 'front' ? 1.3 : -1.3, side * .8, .3],
      radius: .3, axle, side } } : {}) });
  return { length: 4.5, width: 1.8, height: 1.4,
    modelScale: [1, sideScale, 1], modelOffset: [0, 0, 0],
    // Deliberately interleave body and wheel primitives; draw order is not wheel order.
    manufacturer: { primitives: [part('rear-source-minus', 'rear', -1),
      part('front-source-plus', 'front', 1), part('body'),
      part('rear-source-plus', 'rear', 1), part('front-source-minus', 'front', -1)] } };
}
function draw(m, car) {
  const r = recorder();
  r.surface._drawAsset(m, position, camera, false, car);
  return r;
}
function phases(draws) { return Object.fromEntries(draws.map(d => [d.id, d.wheel[3]])); }
function steering(draws) { return Object.fromEntries(draws.map(d => [d.id, d.steer])); }
const expectedSteer = amount => ({ 'rear-source-minus': 0, 'front-source-plus': amount,
  body: 0, 'rear-source-plus': 0, 'front-source-minus': amount });

test('independent left/right wheel phases override distance; only front wheels steer', () => {
  const { draws } = draw(mesh(), { distance: 100, wheelAngles: [.17, -.33, 1.03, 1.47], steer: .24 });
  assert.deepEqual(phases(draws), { 'rear-source-minus': 1.47, 'front-source-plus': .17,
    body: 0, 'rear-source-plus': 1.03, 'front-source-minus': -.33 });
  assert.deepEqual(steering(draws), expectedSteer(.24));
});

test('negative modelScale.y maps FL/FR and RL/RR after the source handedness reflection', () => {
  const { draws } = draw(mesh(-1), { wheelAngles: [.17, -.33, 1.03, 1.47], steer: -.41 });
  assert.deepEqual(phases(draws), { 'rear-source-minus': 1.03, 'front-source-plus': -.33,
    body: 0, 'rear-source-plus': 1.47, 'front-source-minus': .17 });
  assert.deepEqual(steering(draws), expectedSteer(-.41));
});

test('legacy callers retain distance / front or rear tyre radius', () => {
  const { draws } = draw(mesh(), { distance: .72,
    spec: { frontTireRadiusMm: 300, rearTireRadiusMm: 360 } });
  for (const d of draws) {
    const expected = d.id.startsWith('front') ? 2.4 : d.id.startsWith('rear') ? 2 : 0;
    assert.ok(Math.abs(d.wheel[3] - expected) < 1e-12, `${d.id}: ${d.wheel[3]}`);
    assert.equal(d.steer, 0);
  }
});

test('zero is an explicit phase, while missing or non-finite phases fall back independently', () => {
  const { draws } = draw(mesh(), { distance: .3,
    wheelAngles: [0, Number.NaN, Number.POSITIVE_INFINITY], steer: Number.NaN });
  assert.deepEqual(phases(draws), { 'rear-source-minus': 1, 'front-source-plus': 0,
    body: 0, 'rear-source-plus': 1, 'front-source-minus': 1 });
  assert.deepEqual(steering(draws), expectedSteer(0));
});

test('generic geometry rendered after an asset clears wheel spin and steering', () => {
  const r = recorder(), m = mesh();
  const layer = r.surface.render([{ mesh: m, position,
    car: { wheelAngles: [.1, .2, .3, .4], steer: .5 },
    effect: { id: 'generic-effect', faces: [] } }], camera, 640, 400);
  assert.equal(layer, r.surface.canvas);
  assert.ok(r.draws.some(d => d.steer === .5), 'asset must set steering before the reset');
  assert.deepEqual(r.draws.at(-1), { id: 'generic-effect', wheel: [0, 0, 0, 0], steer: 0 });
});
