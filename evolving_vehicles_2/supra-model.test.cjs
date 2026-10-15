const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');
const { test } = require('node:test');

const folder = path.join(__dirname, 'assets/models');
const runtime = fs.readFileSync(path.join(folder, 'supra-runtime.js'), 'utf8');
const source = JSON.parse(fs.readFileSync(path.join(folder, 'supra-source.json')));
let model;
vm.runInNewContext(runtime, {
  ManufacturerModels: {
    registerCompressed(data) { model = JSON.parse(gunzipSync(Buffer.from(data, 'base64'))); }
  }
});
function decode(text, Type) {
  const buffer = Buffer.from(text, 'base64');
  return new Type(buffer.buffer, buffer.byteOffset, buffer.byteLength / Type.BYTES_PER_ELEMENT);
}

test('Supra keeps the selected creator, open license and pinned public download provenance', () => {
  assert.equal(model.id, 'supra');
  assert.equal(model.source.kind, 'community-mesh');
  assert.equal(model.source.author, 'Mpgs Studios');
  assert.equal(model.source.author, source.author);
  assert.equal(model.source.license, 'CC BY 4.0');
  assert.equal(model.source.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(model.source.url, source.sourceUrl);
  assert.equal(source.manufacturerOfficial, false);
  assert.match(source.sourceUrl, /41b83cfb912b4eab9af19a802bcf5ffc$/);
  assert.match(source.download.commit, /^[a-f\d]{40}$/);
  assert.equal(source.download.files.length, 3);
  assert(source.download.files.every(file => /^[a-f\d]{64}$/.test(file.sha256)));
  assert(source.visualReferences.some(ref => new URL(ref.url).hostname === 'pressroom.toyota.com.au'));
  assert(source.conversion.changes.some(change => /reverse-lamp housing/.test(change)));
  assert.match(fs.readFileSync(path.join(folder, 'supra-LICENSE.txt'), 'utf8'), /Mpgs Studios[\s\S]*CC-BY-4\.0/);
});

test('Supra keeps close-view body detail with a small fallback and declared asset budget', () => {
  assert(model.triangles > 130000 && model.triangles < 250000);
  assert(model.fallbackTriangles > 3000 && model.fallbackTriangles < 10000);
  assert(Buffer.byteLength(runtime) < 8 * 1024 * 1024);
  assert.equal(model.triangles, source.conversion.triangles);
  assert.equal(model.fallbackTriangles, source.conversion.fallbackTriangles);
  assert.equal(model.primitives.length, source.conversion.drawGroups);
  assert.equal(model.fallbackPrimitives.length, source.conversion.fallbackDrawGroups);
  assert.equal(Buffer.byteLength(runtime), source.conversion.runtimeBytes);
  assert(model.primitives.filter(p => p.paint).reduce((sum, p) => sum + p.triangles, 0) > 70000);
  assert.equal(model.textures.length, 1);
  assert(model.textures[0].startsWith('data:image/png;base64,'));
});

for (const [label, primitives, expected] of [
  ['main', model.primitives, model.triangles],
  ['fallback', model.fallbackPrimitives, model.fallbackTriangles]
]) {
  test(`Supra ${label} geometry has finite unit normals, valid indices and bounded positions`, () => {
    let triangles = 0;
    for (const p of primitives) {
      const vertices = decode(p.vertices, Float32Array);
      const indices = decode(p.indices, p.indexType === 2 ? Uint16Array : Uint32Array);
      assert(p.indexType === 2 || p.indexType === 4, p.name);
      assert.equal(vertices.length % 8, 0, p.name);
      assert.equal(indices.length / 3, p.triangles, p.name);
      triangles += p.triangles;
      for (const value of vertices) assert(Number.isFinite(value), p.name);
      for (const index of indices) assert(index < vertices.length / 8, p.name);
      for (let i = 0; i < vertices.length; i += 8) {
        assert(Math.abs(Math.hypot(...vertices.subarray(i + 3, i + 6)) - 1) < .001, `${p.name} normal`);
        for (let axis = 0; axis < 3; axis++) {
          assert(vertices[i + axis] >= p.bounds.min[axis] - .0002, `${p.name} min`);
          assert(vertices[i + axis] <= p.bounds.max[axis] + .0002, `${p.name} max`);
        }
        assert(vertices[i + 2] >= -.0002, `${p.name} ground`);
      }
      assert(p.color.every(value => value >= 0 && value <= 1));
      assert(p.alpha >= 0 && p.alpha <= 1);
    }
    assert.equal(triangles, expected);
  });

  test(`Supra ${label} rear lamps keep dark housings, red guides and visible lens covers`, () => {
    const housing = primitives.find(p => p.materialName === 'tailight.001');
    const guide = primitives.find(p => p.materialName === 'tailight');
    const front = primitives.find(p => p.materialName === 'headlight');
    assert.equal(housing.material, 2);
    assert(Math.max(...housing.color) < .15);
    assert.equal(guide.material, 4);
    assert(guide.color[0] > .7 && guide.color[1] < .1 && guide.color[2] < .1);
    assert(housing.bounds.max[0] < -1.6 && guide.bounds.max[0] < -1.6);
    assert(front.bounds.min[0] > 1.3);
    const covers = primitives.filter(p => p.name.includes('_lampCover'));
    assert(covers.length > 0);
    assert(covers.every(p => p.alpha < .2));
    assert(primitives.some(p => p.materialName === 'WebSim_reverse_lamp_lenses' && p.bounds.max[0] < -2));
  });

  test(`Supra ${label} rear display plate is upright and not mirror-written`, () => {
    const plate = primitives.find(p => p.materialName === 'WebSim_display_plate');
    const vertices = decode(plate.vertices, Float32Array);
    assert.equal(plate.textureIndex, 0);
    assert(plate.bounds.max[0] < -2);
    // Rear camera: increasing local Y is screen right. U must grow with Y.
    assert(vertices[1] > vertices[9]);
    assert(vertices[6] > vertices[14]);
    // Top vertices have smaller V because texture upload does not flip Y.
    assert(vertices[18] > vertices[10]);
    assert(vertices[23] < vertices[15]);
  });

  test(`Supra ${label} glossy rear diffuser stays charcoal while tires stay rubber`, () => {
    const diffuser = primitives.find(p => p.name === 'Object_54');
    const tires = primitives.filter(p => /^Front_Tire/.test(p.materialName));
    assert.equal(diffuser.material, 0);
    assert.equal(diffuser.paint, false);
    assert(diffuser.color.every(value => value >= .025 && value <= .07));
    assert(tires.length > 0);
    assert(tires.every(p => p.material === 2 && p.color.every(value => value < .1)));
  });
}

test('Supra dimensions retain the low A90 coupe proportions and tire ground plane', () => {
  const { min, max } = model.bounds;
  assert(Math.abs((max[0] - min[0]) - 4.38) < .002);
  assert(max[1] - min[1] > 1.95 && max[1] - min[1] < 2.06);
  assert(max[2] - min[2] > 1.27 && max[2] - min[2] < 1.33);
  assert(Math.abs(min[2]) < .0001);
});
