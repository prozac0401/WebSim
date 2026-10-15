const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');
const { test } = require('node:test');

const folder = path.join(__dirname, 'assets/models');
const runtime = fs.readFileSync(path.join(folder, 'g70-runtime.js'), 'utf8');
let model;
vm.runInNewContext(runtime, {
  ManufacturerModels: {
    registerCompressed(data) { model = JSON.parse(gunzipSync(Buffer.from(data, 'base64'))); }
  }
});
const source = JSON.parse(fs.readFileSync(path.join(folder, 'g70-model-source.json')));
const decode = (text, Type) => {
  const buffer = Buffer.from(text, 'base64');
  return new Type(buffer.buffer, buffer.byteOffset, buffer.byteLength / Type.BYTES_PER_ELEMENT);
};

test('G70 retains artist attribution, open license and exact source provenance', () => {
  assert.equal(model.id, 'g70');
  assert.equal(model.source.kind, 'community-mesh');
  assert.equal(source.manufacturerOfficial, false);
  assert.equal(model.source.author, source.author);
  assert.equal(model.source.author, 'Lucas.Karlsmoen');
  assert.equal(model.source.license, 'CC BY 4.0');
  assert.equal(model.source.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(model.source.url, source.sourceUrl);
  assert.equal(model.source.sha256, source.sourceSha256);
  assert.match(model.source.sha256, /^[a-f\d]{64}$/);
  assert.match(model.source.downloadUrl, /^https:\/\/huggingface\.co\/datasets\/allenai\/objaverse\/resolve\/main\/glbs\/000-067\/ded2c8428fb9499ebd2bfc69c5592b02\.glb$/);
  assert.match(model.source.changes, /simplified/i);
  assert.match(source.modelYear, /exact original model year and trim not specified/);
});

test('G70 runtime and Canvas fallback stay within measured geometry and asset budgets', () => {
  assert(model.triangles > 180000 && model.triangles < 320000);
  assert(model.fallbackTriangles > 2000 && model.fallbackTriangles < 6000);
  assert(Buffer.byteLength(runtime) < 12 * 1024 * 1024);
  assert.equal(model.textures.length, 2);
  assert(model.textures.every(t => t.startsWith('data:image/png;base64,')));
  assert(model.primitives.some(p => p.paint));
  assert(model.primitives.some(p => p.textureIndex !== undefined));
  assert(model.fallbackPrimitives.every(p => p.textureIndex === undefined));
  // Uniform heavy simplification previously reduced every body panel to 11k
  // triangles in total, visibly creasing hood/roof surfaces and trim borders.
  assert(model.primitives.filter(p => p.paint).reduce((n, p) => n + p.triangles, 0) > 50000);
});

for (const [label, primitives, count] of [
  ['main', model.primitives, model.triangles],
  ['fallback', model.fallbackPrimitives, model.fallbackTriangles]
]) {
  test(`G70 ${label} geometry has finite positions/normals/UVs and valid triangle indices`, () => {
    let total = 0;
    for (const p of primitives) {
      const vertices = decode(p.vertices, Float32Array);
      assert.equal(vertices.length % 8, 0, p.name);
      assert(p.indexType === 2 || p.indexType === 4, p.name);
      const indices = decode(p.indices, p.indexType === 2 ? Uint16Array : Uint32Array);
      assert.equal(indices.length % 3, 0, p.name);
      assert.equal(indices.length / 3, p.triangles, p.name);
      total += p.triangles;
      for (const value of vertices) assert(Number.isFinite(value), p.name);
      for (const index of indices) assert(index < vertices.length / 8, p.name);
      for (let i = 0; i < vertices.length; i += 8) {
        for (let axis = 0; axis < 3; axis++) {
          assert(vertices[i + axis] >= p.bounds.min[axis] - .0002, `${p.name} minimum`);
          assert(vertices[i + axis] <= p.bounds.max[axis] + .0002, `${p.name} maximum`);
        }
        assert(vertices[i + 2] >= -.0002, `${p.name} below ground`);
      }
      assert(p.color.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
      assert(p.alpha >= 0 && p.alpha <= 1);
    }
    assert.equal(total, count);
  });

  test(`G70 ${label} has its front lights forward, rear lights backward and opaque rubber/glazing`, () => {
    const front = primitives.find(p => p.materialName === 'Material__281');
    const rear = primitives.find(p => p.materialName === 'Material__290');
    assert(front.bounds.min[0] > 1.8);
    assert(rear.bounds.max[0] < -1.7);
    const tires = primitives.find(p => p.materialName === 'Material__343');
    assert(tires.color.every(c => c < .1));
    assert.equal(tires.alpha, 1);
    const glazing = primitives.filter(p => p.materialName.startsWith('window_glass'));
    assert.equal(glazing.length, 3);
    assert(glazing.every(p => p.alpha === 1 && p.material === 1));
    assert(!primitives.some(p => p.materialName === 'Material__283'));
  });
}

test('G70 dimensions preserve the original sedan proportions and ground placement', () => {
  const { min, max } = model.bounds;
  const length = max[0] - min[0], widthIncludingMirrors = max[1] - min[1], height = max[2] - min[2];
  assert(length > 4.6 && length < 4.8);
  assert(widthIncludingMirrors > 2.0 && widthIncludingMirrors < 2.2);
  assert(height > 1.3 && height < 1.5);
  assert(Math.abs(min[2]) < .0001);
});
