'use strict';

const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
const ASSETS = path.join(ROOT, 'assets/models');
const IDS = ['g80', 'ioniq5', 'santafe', 'staria'];
const DIMENSIONS = {
  g80: { length: [4.9, 5.15], height: [1.4, 1.6] },
  ioniq5: { length: [4.5, 4.8], height: [1.5, 1.75] },
  santafe: { length: [4.75, 4.95], height: [1.7, 1.88] },
  staria: { length: [5.15, 5.4], height: [1.9, 2.08] }
};
const readJSON = name => JSON.parse(fs.readFileSync(path.join(ASSETS, name), 'utf8'));
const close = (actual, expected, message, epsilon = 1e-5) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} != ${expected}`);
const inRange = (value, range, message) => assert.ok(value >= range[0] && value <= range[1], `${message}: ${value}`);
const sorted = iterable => [...iterable].sort();
const normalizedName = name => name.replace(/[^\w]/g, '');

function makeRegistry(overrides = {}) {
  let fallbackCalls = 0;
  const context = vm.createContext({
    atob, Uint8Array, Uint16Array, Uint32Array, Float32Array,
    Blob, Response, DecompressionStream,
    VehicleMeshes: {
      create(id, spec, color) {
        fallbackCalls++;
        return { faces: [{ id, color, lengthMm: spec.lengthMm }] };
      }
    },
    ...overrides
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'manufacturer-models.js'), 'utf8'), context);
  return { context, api: context.ManufacturerModels, fallbackCalls: () => fallbackCalls };
}

// Exact JSON-chunk snapshots preserve source nodes independently of the runtime.
// Binary GLB caches are intentionally excluded from the published repository.
function readGLBJSON(relative) {
  const json = readJSON(relative + '.json');
  assert.equal(json.asset?.version, '2.0', `${relative}: source glTF version`);
  assert.ok(Array.isArray(json.nodes) && json.nodes.length > 0, `${relative}: source nodes`);
  return json;
}

let registry;
before(async () => {
  registry = makeRegistry();
  assert.equal(registry.api.create('g80', {}, '#fff'), null, 'unregistered model stays available for fallback');
  for (const id of IDS) {
    const source = fs.readFileSync(path.join(ASSETS, `${id}-runtime.js`), 'utf8');
    await vm.runInContext(source, registry.context, { filename: `${id}-runtime.js` });
  }
  await registry.api.ready;
  assert.deepEqual(sorted(registry.api.ids()), sorted(IDS));
});

for (const id of IDS) test(`${id}: compressed indexed geometry is finite, normalized, bounded and complete`, () => {
  const data = registry.api.get(id), summary = readJSON(`${id}-runtime-summary.json`);
  assert.equal(data.id, id);
  assert.equal(data.source.kind, 'manufacturer-mesh');
  assert.ok(data.source.label && data.source.configuration);
  assert.match(data.source.url, /^https:\/\/(www\.hyundai\.com\/|playcanv\.as\/e\/p\/)/);
  assert.ok(data.primitives.length > 10, `${id}: exterior components missing`);
  assert.equal(data.primitives.length, summary.primitives.length);
  const totalMin = [Infinity, Infinity, Infinity], totalMax = [-Infinity, -Infinity, -Infinity];
  let triangleCount = 0;
  for (const [partIndex, part] of data.primitives.entries()) {
    const label = `${id}/${part.name}/${partIndex}`, vertices = part.vertices, indices = part.indices;
    assert.ok(vertices instanceof Float32Array, `${label}: Float32 vertex data`);
    assert.ok(vertices.length > 0 && vertices.length % 8 === 0, `${label}: position/normal/UV stride`);
    assert.ok(indices instanceof Uint16Array || indices instanceof Uint32Array, `${label}: unsigned indices`);
    assert.equal(indices.BYTES_PER_ELEMENT, part.indexType, `${label}: declared index width`);
    assert.ok(indices.length > 0 && indices.length % 3 === 0, `${label}: complete triangles`);
    assert.equal(part.triangles, indices.length / 3, `${label}: triangle metadata`);
    triangleCount += part.triangles;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let at = 0; at < vertices.length; at += 8) {
      for (let field = 0; field < 8; field++) if (!Number.isFinite(vertices[at + field]))
        assert.fail(`${label}: non-finite vertex ${at / 8}, field ${field}`);
      const normalLength = Math.hypot(vertices[at + 3], vertices[at + 4], vertices[at + 5]);
      if (Math.abs(normalLength - 1) > .001) assert.fail(`${label}: invalid normal ${at / 8}, length ${normalLength}`);
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], vertices[at + axis]);
        max[axis] = Math.max(max[axis], vertices[at + axis]);
      }
    }
    const vertexCount = vertices.length / 8;
    for (const index of indices) if (index >= vertexCount) assert.fail(`${label}: index ${index} outside ${vertexCount} vertices`);
    for (let axis = 0; axis < 3; axis++) {
      close(min[axis], part.bounds.min[axis], `${label}: minimum ${axis}`);
      close(max[axis], part.bounds.max[axis], `${label}: maximum ${axis}`);
      totalMin[axis] = Math.min(totalMin[axis], min[axis]);
      totalMax[axis] = Math.max(totalMax[axis], max[axis]);
    }
    assert.ok(Number.isInteger(part.material) && part.material >= 0 && part.material <= 4, `${label}: material class`);
    assert.ok(part.color.length === 3 && part.color.every(value => Number.isFinite(value) && value >= 0 && value <= 1), `${label}: RGB`);
    inRange(part.alpha, [0, 1], `${label}: opacity`);
    if (part.texture) {
      const match = /^data:image\/(png|jpeg|webp);base64,([\w+/=]+)$/.exec(part.texture);
      assert.ok(match, `${label}: embedded offline image`);
      const image = Buffer.from(match[2], 'base64');
      assert.ok(image.length > 16, `${label}: texture payload`);
      if (match[1] === 'png') assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      if (match[1] === 'jpeg') assert.equal(image.readUInt16BE(0), 0xffd8);
    }
  }
  assert.equal(triangleCount, data.triangles);
  assert.equal(triangleCount, summary.triangles);
  for (let axis = 0; axis < 3; axis++) {
    close(totalMin[axis], data.bounds.min[axis], `${id}: complete minimum ${axis}`);
    close(totalMax[axis], data.bounds.max[axis], `${id}: complete maximum ${axis}`);
  }
  inRange(totalMax[0] - totalMin[0], DIMENSIONS[id].length, `${id}: source length in metres`);
  inRange(totalMax[1] - totalMin[1], [1.85, 2.5], `${id}: source width including mirrors`);
  inRange(totalMax[2] - totalMin[2], DIMENSIONS[id].height, `${id}: source height in metres`);
  inRange(totalMin[2], [-.005, .02], `${id}: tyres at ground level`);
  assert.ok(data.primitives.some(p => p.paint) && data.primitives.some(p => p.material === 1), `${id}: paint and glass survived conversion`);
});

test('runtime parts match only the selected manufacturer configurations', () => {
  const assembly = readJSON('g80/assembly.json');
  assert.deepEqual(sorted(new Set(registry.api.get('g80').primitives.map(p => p.name))), sorted(new Set(assembly.instances.map(i => i.name))));
  for (const [id, file, option, descendants] of [
    ['ioniq5', 'IONIQ5-7.glb', 0, false],
    ['santafe', 'SantaFe-2.glb', 0, true],
    ['staria', 'STARIA_SPINNER_06122026.glb', 2, true]
  ]) {
    const config = readJSON(`${id}/config.json`), glb = readGLBJSON(`${id}/${file}`);
    const wanted = config.options[option].visibleObjs.map(name => config.objectNames[name] || name);
    const selected = new Set(), selectedGroups = [];
    const add = index => { selected.add(index); if (descendants) for (const child of glb.nodes[index].children || []) add(child); };
    for (const name of wanted) {
      const matches = glb.nodes.map((node, index) => ({ node, index })).filter(({ node }) => normalizedName(node.name || '') === normalizedName(name));
      assert.equal(matches.length, 1, `${id}: source group ${name}`);
      add(matches[0].index); selectedGroups.push(matches[0].node.name);
    }
    const expected = new Set([...selected].filter(index => glb.nodes[index].mesh !== undefined).map(index => glb.nodes[index].name));
    assert.deepEqual(sorted(new Set(registry.api.get(id).primitives.map(p => p.name))), sorted(expected), `${id}: variant parts must not be mixed`);
    if (descendants) assert.deepEqual(sorted(readJSON(`${id}-runtime-summary.json`).selectedGroups), sorted(selectedGroups));
  }
});

test('front lights face positive X and rear lights face negative X', () => {
  const assembly = readJSON('g80/assembly.json');
  const front = new Set(assembly.instances.filter(i => /Lights_Front/.test(i.file)).map(i => i.name));
  const rear = new Set(assembly.instances.filter(i => /Lights_Rear/.test(i.file)).map(i => i.name));
  for (const [id, frontPart, rearPart] of [
    ['g80', p => front.has(p.name), p => rear.has(p.name)],
    ['ioniq5', p => p.name === 'STOCK_BODYKIT' && p.materialName === 'LED', p => p.name === 'STOCK_LIGHTS' && p.materialName === 'ChromeLight'],
    ['santafe', p => /Headlamp_Front/.test(p.name), p => /^rearlamp_set1_housing/.test(p.name)],
    ['staria', p => p.name === 'VARIANTGROUP_HYBRID_HEADLIGHTS', p => p.name === 'BODYTYPE_LIFTBACK_COMMON']
  ]) {
    const parts = registry.api.get(id).primitives, headlights = parts.filter(frontPart), tail = parts.filter(rearPart);
    assert.ok(headlights.length && tail.length, `${id}: recognizable front and rear parts`);
    assert.ok(headlights.every(p => p.bounds.min[0] > 0), `${id}: front is +X`);
    assert.ok(tail.every(p => p.bounds.max[0] < 0), `${id}: rear is -X`);
  }
});

test('instances fit factory dimensions, sit on the ground and share decoded buffers', () => {
  const specs = require('../evolving_vehicles/vehicle-specs.js');
  for (const id of IDS) {
    const spec = specs[id], a = registry.api.create(id, spec, '#112233'), b = registry.api.create(id, spec, '#ddeeff');
    const data = registry.api.get(id);
    assert.notEqual(a, b);
    assert.equal(a.manufacturer, b.manufacturer);
    assert.equal(a.manufacturer.primitives[0].vertices, b.manufacturer.primitives[0].vertices);
    assert.equal(a.paint, '#112233'); assert.equal(b.paint, '#ddeeff');
    close(a.length, spec.lengthMm / 1000, `${id}: selected length`);
    close(a.height, spec.heightMm / 1000, `${id}: selected height`);
    close((data.bounds.max[0] - data.bounds.min[0]) * a.modelScale[0], a.length, `${id}: rendered length`);
    close((data.bounds.max[2] - data.bounds.min[2]) * a.modelScale[2], a.height, `${id}: rendered height`);
    close((data.bounds.min[2] + a.modelOffset[2]) * a.modelScale[2], 0, `${id}: tyre contact plane`);
    for (const axis of [0, 1]) close(((data.bounds.min[axis] + data.bounds.max[axis]) / 2 + a.modelOffset[axis]) * a.modelScale[axis], 0, `${id}: centred axis ${axis}`);
  }
  assert.equal(registry.fallbackCalls(), 0, 'normal GPU instances must not build the procedural fallback');
  const fallback = registry.api.create('g80', specs.g80, '#445566');
  assert.equal(fallback.faces, fallback.faces, 'fallback geometry is cached on its instance');
  assert.equal(registry.fallbackCalls(), 1);
  assert.equal(registry.api.create('unknown-model', {}, '#000'), null);
  assert.equal(registry.fallbackCalls(), 1);
});

test('damaged compressed data resolves readiness and leaves fallback available', async () => {
  const isolated = makeRegistry();
  await vm.runInContext(fs.readFileSync(path.join(ASSETS, 'ioniq5-runtime.js'), 'utf8'), isolated.context);
  const healthyModel = isolated.api.get('ioniq5');
  await isolated.api.registerCompressed(Buffer.from('not a gzip stream').toString('base64'));
  await isolated.api.ready;
  assert.equal(isolated.api.get('ioniq5'), healthyModel, 'one damaged asset must not invalidate a model that loaded successfully');
  assert.equal(isolated.api.has('g80'), false);
  assert.equal(isolated.api.create('g80', {}, '#fff'), null);
  assert.equal(isolated.api.failures.length, 1);
  const exposedFailures = isolated.api.failures;
  exposedFailures.length = 0;
  assert.equal(isolated.api.failures.length, 1, 'failure diagnostics cannot be erased through the getter');
});

test('missing decompression support leaves the simulator able to use fallback meshes', async () => {
  const isolated = makeRegistry({ DecompressionStream: undefined });
  await isolated.api.registerCompressed('H4sIAAAAAAA=');
  await isolated.api.ready;
  assert.equal(isolated.api.create('g80', {}, '#fff'), null);
  assert.equal(isolated.api.ids().length, 0);
  assert.equal(isolated.api.failures.length, 1);
});

test('community meshes use their decoded source geometry in Canvas without a substitute car', async () => {
  const isolated = makeRegistry();
  for (const id of ['g70', 'supra']) {
    assert.equal(isolated.api.requiresAsset(id), true);
    assert.equal(isolated.api.create(id, {}, '#123456'), null);
    await vm.runInContext(fs.readFileSync(path.join(ASSETS, id + '-runtime.js'), 'utf8'), isolated.context);
    const mesh = isolated.api.create(id, {lengthMm: 4600, heightMm: 1400, widthMm: 1850}, '#123456');
    const data = isolated.api.get(id);
    assert.ok(data.fallbackPrimitives.every(p => p.vertices instanceof Float32Array && p.indices instanceof Uint16Array || p.vertices instanceof Float32Array && p.indices instanceof Uint32Array));
    assert.equal(mesh.faces.length, data.fallbackPrimitives.reduce((n, p) => n + p.indices.length / 3, 0));
    assert.equal(mesh.faces, mesh.faces);
    assert.ok(mesh.faces.some(face => face.material === 'paint' && face.fill === '#123456'));
    assert.ok(mesh.faces.every(face => face.vertices.every(v => Object.values(v).every(Number.isFinite) && v.z >= -.001)));
  }
  assert.equal(isolated.fallbackCalls(), 0);
});
