/** Convert selected manufacturer SANTA FE / STARIA configurations for the local renderer.
 * Prerequisites match build-models.mjs. Run from repository root.
 * Source files and provenance remain unmodified; no network is used here.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require = createRequire(path.resolve('output/model-tools/package.json'));
const { NodeIO } = await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const { ALL_EXTENSIONS } = await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const { weld, simplify } = await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const { MeshoptSimplifier } = await import(pathToFileURL(require.resolve('meshoptimizer')));
const draco = require('draco3dgltf');
const { mat3, vec3 } = require('gl-matrix');
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco.createDecoderModule()
});
const dir = path.dirname(fileURLToPath(import.meta.url));
const b64 = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64');
// Three.js sanitizes glTF names in the official configurator (Object143.001 -> Object143001).
const normalizedName = name => name.replace(/[^\w]/g, '');

const definitions = [
  {
    id: 'santafe', file: 'SantaFe-2.glb', option: 0,
    label: 'Hyundai SANTA FE · 공식 3D 외관',
    url: 'https://www.hyundai.com/au/en/cars/suvs/santa-fe',
    configuration: 'Official SANTA FE standard exterior, base wheels; alternate Elite, Calligraphy and HEV body groups excluded.',
    paint: /^(A2B|WW2|WWM|T2X|M2F|RN2|ZGE|RS2|YBM|PB2|EcotronicGrey)(\.|$)/i,
    // Source front headlamps occupy X=-2.33..-1.94 metres; rear lamps X=1.83..2.34.
    forwardAxis: 0, forwardSign: -1, lateralAxis: 2,
    expectedLength: [4.75, 4.95], expectedHeight: [1.70, 1.88],
    frontNode: /Headlamp_Front/, rearNode: /^rearlamp_set1_housing/
  },
  {
    id: 'staria', file: 'STARIA_SPINNER_06122026.glb', option: 2,
    label: 'Hyundai STARIA Lounge · 공식 3D 외관',
    url: 'https://www.hyundai.com/au/en/cars/people-movers-and-commercial/staria',
    configuration: 'Official Staria Lounge Hybrid exterior, chosen to match the Korean Lounge reference; excludes diesel bumpers, headlights and wheels.',
    paint: /^(R2T|CBP|PE2|A2B|YAC|GMP|CarpaintSilver)(\.|$)/i,
    // Source hybrid headlights occupy Z=2.36..2.83; liftback occupies Z=-2.26..-1.86.
    forwardAxis: 2, forwardSign: 1, lateralAxis: 0,
    expectedLength: [5.15, 5.40], expectedHeight: [1.90, 2.08],
    frontNode: /^VARIANTGROUP_HYBRID_HEADLIGHTS$/, rearNode: /^BODYTYPE_LIFTBACK_COMMON$/
  }
];

function selectedNodes(doc, config, option) {
  const nodes = doc.getRoot().listNodes();
  const wanted = config.options[option].visibleObjs.map(name => config.objectNames[name] || name);
  const selected = new Set(), resolved = [];
  function add(node) { selected.add(node); node.listChildren().forEach(add); }
  for (const name of wanted) {
    const matches = nodes.filter(node => normalizedName(node.getName()) === normalizedName(name));
    assert(matches.length === 1, `Expected one configuration group ${name}, found ${matches.length}`);
    add(matches[0]); resolved.push(matches[0].getName());
  }
  return { nodes: [...selected].filter(node => node.getMesh()), resolved };
}

function worldBounds(nodes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const vector = vec3.create();
  for (const node of nodes) for (const primitive of node.getMesh().listPrimitives()) {
    const positions = primitive.getAttribute('POSITION').getArray(), matrix = node.getWorldMatrix();
    for (let i = 0; i < positions.length; i += 3) {
      vec3.transformMat4(vector, positions.subarray(i, i + 3), matrix);
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], vector[axis]);
        max[axis] = Math.max(max[axis], vector[axis]);
      }
    }
  }
  return { min, max };
}

function transformGeometry(primitive, matrix, definition, sourceBounds) {
  const positions = primitive.getAttribute('POSITION').getArray();
  const normals = primitive.getAttribute('NORMAL')?.getArray();
  const textureInfo = primitive.getMaterial()?.getBaseColorTextureInfo();
  const uvTransform = textureInfo?.getExtension('KHR_texture_transform');
  const uvSet = uvTransform?.getTexCoord() ?? textureInfo?.getTexCoord() ?? 0;
  const uv = primitive.getAttribute(`TEXCOORD_${uvSet}`)?.getArray();
  const uvOffset = uvTransform?.getOffset() || [0, 0], uvScale = uvTransform?.getScale() || [1, 1];
  const uvRotation = uvTransform?.getRotation() || 0, uvCos = Math.cos(uvRotation), uvSin = Math.sin(uvRotation);
  const vertices = new Float32Array(positions.length / 3 * 8);
  const normalMatrix = mat3.normalFromMat4(mat3.create(), matrix);
  const vector = vec3.create(), normal = vec3.create();
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const center = (sourceBounds.min[definition.forwardAxis] + sourceBounds.max[definition.forwardAxis]) / 2;
  for (let i = 0; i < positions.length / 3; i++) {
    vec3.transformMat4(vector, positions.subarray(i * 3, i * 3 + 3), matrix);
    vec3.set(normal, normals?.[i * 3] ?? 0, normals?.[i * 3 + 1] ?? 1, normals?.[i * 3 + 2] ?? 0);
    vec3.transformMat3(normal, normal, normalMatrix); vec3.normalize(normal, normal);
    const p = [definition.forwardSign * (vector[definition.forwardAxis] - center), vector[definition.lateralAxis], vector[1] - sourceBounds.min[1]];
    const n = [definition.forwardSign * normal[definition.forwardAxis], normal[definition.lateralAxis], normal[1]];
    for (let axis = 0; axis < 3; axis++) {
      assert(Number.isFinite(p[axis]) && Number.isFinite(n[axis]), 'Non-finite geometry');
      vertices[i * 8 + axis] = p[axis]; vertices[i * 8 + axis + 3] = n[axis];
      bounds.min[axis] = Math.min(bounds.min[axis], p[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], p[axis]);
    }
    const u = (uv?.[i * 2] ?? 0) * uvScale[0], v = (uv?.[i * 2 + 1] ?? 0) * uvScale[1];
    vertices[i * 8 + 6] = uvOffset[0] + uvCos * u - uvSin * v;
    vertices[i * 8 + 7] = uvOffset[1] + uvSin * u + uvCos * v;
  }
  const raw = primitive.getIndices()?.getArray() || Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
  const indices = positions.length / 3 < 65536 ? new Uint16Array(raw) : new Uint32Array(raw);
  assert(indices.length % 3 === 0, 'Non-triangle primitive');
  for (const index of indices) assert(index < positions.length / 3, 'Index outside vertex array');
  return { vertices: b64(vertices), indices: b64(indices), indexType: indices.BYTES_PER_ELEMENT, bounds, triangles: indices.length / 3 };
}

function appearance(primitive, definition) {
  const m = primitive.getMaterial(), name = m?.getName() || '';
  const base = m?.getBaseColorFactor() || [.3, .3, .3, 1], paint = definition.paint.test(name);
  let color = base.slice(0, 3).map(value => Math.pow(value, 1 / 2.2));
  let alpha = base[3], material = 2;
  const window = /window|windshield|sunroof/i.test(name);
  if (paint) material = 0;
  else if (window) { material = 1; color = [.045, .065, .085]; alpha = 1; }
  else if (/chrome|silver|metal|mirror|rim|disc/i.test(name)) material = 3;
  else if (/LIGHTSON|Front_On|Rear_On|lamp_REF|CheckerMat|CheckerWhite|LED/i.test(name)) material = 4;
  else if (/glass|grass/i.test(name)) {
    // Transparent lamp covers retain the manufacturer's color and opacity.
    material = /red|orange/i.test(name) ? 4 : 1;
    const transmission = m?.getExtension('KHR_materials_transmission')?.getTransmissionFactor() || 0;
    if (transmission > .3) alpha = Math.min(alpha, .22);
  }
  const texture = m?.getBaseColorTexture();
  return {
    materialName: name, color, material, paint, alpha,
    texture: texture ? `data:${texture.getMimeType()};base64,${b64(texture.getImage())}` : null
  };
}

function save(definition, primitives, sourceBounds, selection) {
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const primitive of primitives) for (let i = 0; i < 3; i++) {
    bounds.min[i] = Math.min(bounds.min[i], primitive.bounds.min[i]);
    bounds.max[i] = Math.max(bounds.max[i], primitive.bounds.max[i]);
  }
  const length = bounds.max[0] - bounds.min[0], width = bounds.max[1] - bounds.min[1], height = bounds.max[2] - bounds.min[2];
  assert(length >= definition.expectedLength[0] && length <= definition.expectedLength[1], 'Vehicle length/axis mismatch');
  assert(height >= definition.expectedHeight[0] && height <= definition.expectedHeight[1], 'Vehicle height/axis mismatch');
  assert(width > 1.8 && width < 2.4 && Math.abs(bounds.min[2]) < .005, 'Invalid width/ground placement');
  const front = primitives.filter(p => definition.frontNode.test(p.name)), rear = primitives.filter(p => definition.rearNode.test(p.name));
  assert(front.length && rear.length, 'Missing orientation reference parts');
  assert(front.every(p => p.bounds.min[0] > 1.4), 'Front lamps point backwards');
  assert(rear.every(p => p.bounds.max[0] < -1.3), 'Rear parts point forwards');
  const payload = {
    id: definition.id,
    source: { kind: 'manufacturer-mesh', label: definition.label, url: definition.url, configuration: definition.configuration },
    bounds, triangles: primitives.reduce((sum, p) => sum + p.triangles, 0), primitives
  };
  // Gzip deduplicates repeated source textures and base64 data; the local registry expands it before use.
  const textures = [...new Set(primitives.map(p => p.texture).filter(Boolean))];
  fs.writeFileSync(path.join(dir, `${definition.id}-runtime.js`),
    '/* Manufacturer source geometry; see assets/models/README.md and SOURCES.json. */\n' +
    `ManufacturerModels.registerCompressed("${gzipSync(JSON.stringify(payload), { level: 9 }).toString('base64')}");\n`);
  const summary = { ...payload, sourceBounds, selectedGroups: selection,
    validation: { length, widthIncludingMirrors: width, height, frontLampPositiveX: true, rearNegativeX: true, finiteVertices: true, validIndices: true },
    textureCount: textures.length, textureBytes: textures.reduce((n, t) => n + t.length, 0),
    primitives: primitives.map(({ vertices, indices, texture, ...p }) => ({ ...p, textureBytes: texture?.length || 0 })) };
  fs.writeFileSync(path.join(dir, `${definition.id}-runtime-summary.json`), JSON.stringify(summary, null, 2));
  console.log(definition.id, `${primitives.length} primitives, ${payload.triangles} triangles, ${textures.length} textures`, summary.validation);
}

for (const definition of definitions) {
  const doc = await io.read(path.join(dir, definition.id, definition.file));
  const config = JSON.parse(fs.readFileSync(path.join(dir, definition.id, 'config.json')));
  const before = selectedNodes(doc, config, definition.option);
  const sourceBounds = worldBounds(before.nodes);
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: .3, error: .00045 }));
  const selection = selectedNodes(doc, config, definition.option), primitives = [];
  for (const node of selection.nodes) for (const primitive of node.getMesh().listPrimitives()) {
    primitives.push({ ...transformGeometry(primitive, node.getWorldMatrix(), definition, sourceBounds), name: node.getName(), ...appearance(primitive, definition) });
  }
  save(definition, primitives, sourceBounds, selection.resolved);
}
