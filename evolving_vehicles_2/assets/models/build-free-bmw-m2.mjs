/** Deterministic conversion of Manuel Contento's CC BY 4.0 BMW M2.
 * Run from the repository root: node evolving_vehicles_2/assets/models/build-free-bmw-m2.mjs [source.glb]
 * The pinned, normally downloadable input and its existing mirror edits are
 * documented in bmw_m2-source.json. No network or generative processing.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require = createRequire(path.resolve('output/model-tools/package.json'));
const { NodeIO } = await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const { ALL_EXTENSIONS } = await import(pathToFileURL(require.resolve('@gltf-transform/extensions')));
const { MeshoptDecoder, MeshoptSimplifier } = await import(pathToFileURL(require.resolve('meshoptimizer')));
const { mat3, vec3 } = require('gl-matrix');
const sharp = require('sharp');
await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const folder = path.dirname(fileURLToPath(import.meta.url));
const filename = path.resolve(process.argv[2] || 'output/new-car-candidates/bmw-m2/bmw-m2-source.glb');
const expectedHash = 'f67b1bd2fdbf083c6eb3578c7fb23992bfba1293cca5b479055e30d3fee1f400';
// BMW documents the factory paint name/code, not an exact display RGB value.
// This fixed RGB is a visual approximation under the existing metallic shader.
const stockPaint = {
  name: 'Long Beach Blue Metallic', code: 'C16', displayHex: '#167fa7',
  color: [22 / 255, 127 / 255, 167 / 255], renderApproximation: true,
  sourceUrl: 'https://www.press.bmwgroup.com/usa/article/detail/T0238507EN_US/the-all-new-2016-bmw-m2',
  codeSourceUrl: 'https://www.press.bmwgroup.com/usa/article/attachment/T0238507EN_US/391959'
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256(fs.readFileSync(filename)), expectedHash, 'Unexpected BMW M2 source');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(filename);
const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const emptyBounds = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
function include(bounds, p) {
  for (let axis = 0; axis < 3; axis++) {
    bounds.min[axis] = Math.min(bounds.min[axis], p[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], p[axis]);
  }
}
const parts = [];
for (const node of doc.getRoot().listNodes()) if (node.getMesh()) {
  for (const primitive of node.getMesh().listPrimitives()) {
    // Piano is the creator's two-triangle studio ground, not vehicle geometry.
    if (primitive.getMaterial()?.getName() === 'Piano') continue;
    assert.equal(primitive.getMode(), 4);
    parts.push({ node, primitive, name: node.getParentNode()?.getName() || node.getName() });
  }
}
const sourceBounds = emptyBounds();
for (const { node, primitive } of parts) {
  const positions = primitive.getAttribute('POSITION');
  for (let i = 0; i < positions.getCount(); i++) {
    // getElement dequantizes normalized Int16 accessors from the mirror GLB.
    include(sourceBounds, vec3.transformMat4([], positions.getElement(i, []), node.getWorldMatrix()));
  }
}
const scale = 4.468 / (sourceBounds.max[2] - sourceBounds.min[2]);
const center = [(sourceBounds.min[0] + sourceBounds.max[0]) / 2, sourceBounds.min[1], (sourceBounds.min[2] + sourceBounds.max[2]) / 2];
const textures = [], textureInfo = [], textureIds = new Map(), texturePixels = new Map();
for (const { primitive } of parts) {
  const m = primitive.getMaterial(), texture = m.getBaseColorTexture();
  if (!texture || textureIds.has(texture)) continue;
  const bytes = texture.getImage(), metadata = await sharp(bytes).metadata();
  assert(metadata.width <= 2048 && metadata.height <= 2048, 'Unexpected texture budget');
  textureIds.set(texture, textures.length);
  textures.push(`data:${texture.getMimeType()};base64,${b64(bytes)}`);
  textureInfo.push({ materialName: m.getName(), mimeType: texture.getMimeType(), bytes: bytes.length, width: metadata.width, height: metadata.height, sha256: sha256(bytes) });
  texturePixels.set(texture, await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
}
function textureMean(primitive) {
  const texture = primitive.getMaterial().getBaseColorTexture(), pixels = texturePixels.get(texture);
  if (!pixels) return [.3, .3, .3];
  const uv = primitive.getAttribute('TEXCOORD_0'), indices = primitive.getIndices().getArray();
  const color = [0, 0, 0]; let count = 0;
  const step = Math.max(3, Math.ceil(indices.length / 768 / 3) * 3);
  for (let k = 0; k < indices.length; k += step) {
    const coords = [0, 0];
    for (let j = 0; j < 3; j++) { const v = uv.getElement(indices[k + j], []); coords[0] += v[0] / 3; coords[1] += v[1] / 3; }
    const x = Math.min(pixels.info.width - 1, Math.max(0, Math.floor(coords[0] * pixels.info.width)));
    const y = Math.min(pixels.info.height - 1, Math.max(0, Math.floor(coords[1] * pixels.info.height)));
    const offset = (y * pixels.info.width + x) * 4;
    if (pixels.data[offset + 3] < 16) continue;
    for (let j = 0; j < 3; j++) color[j] += pixels.data[offset + j] / 255;
    count++;
  }
  return count ? color.map(v => v / count) : [.12, .12, .12];
}
function appearance(primitive, name, fallback) {
  const m = primitive.getMaterial(), materialName = m.getName();
  // The source atlas is shared by two painted body primitives and five separate
  // BMW roundels. Detach it only from the body; badges keep their original UVs
  // and texture. This is a 3D material edit, not a raster texture modification.
  if (materialName === 'MAT_LIVERY' && name === 'Livery') {
    return { materialName: 'WebSim_Long_Beach_Blue_C16', sourceMaterialName: materialName,
      role: 'factory-paint', color: [...stockPaint.color], alpha: 1,
      material: 0, paint: false, textureOpaque: true };
  }
  const window = materialName === 'MAT_GLASS' && /Window/i.test(name);
  const cover = materialName === 'MAT_GLASS' && !window;
  const light = materialName === 'MAT_FRONTLIGHT' && /^lights_/.test(name) || materialName === 'MAT_BACKLIGHT' && /^(red_|orange_)/.test(name);
  const chrome = /^chrome|^d_red_chrome/.test(name) || /^(Muffler|m5|m6|pPlane17)$/.test(name);
  let material = window || cover ? 1 : light ? 4 : chrome ? 3 : materialName === 'MAT_LIVERY' ? 0 : 2;
  const visual = { materialName, color: [1, 1, 1], alpha: cover ? .22 : 1, material, paint: false, textureOpaque: true };
  if (fallback) {
    visual.color = textureMean(primitive);
    if (window) visual.color = [.045, .06, .07];
    if (cover) visual.alpha = .12;
  } else visual.textureIndex = textureIds.get(m.getBaseColorTexture());
  // Window tint is opaque because the source has no finished cabin; lamp covers
  // remain transparent so the modeled reflectors and light guides stay visible.
  return visual;
}
function geometry(primitive, matrix, fallback) {
  const positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL');
  const ti = primitive.getMaterial().getBaseColorTextureInfo(), transform = ti?.getExtension('KHR_texture_transform');
  const uv = primitive.getAttribute('TEXCOORD_' + (transform?.getTexCoord() ?? ti?.getTexCoord() ?? 0));
  assert(normals && uv, 'Required source normals/UVs missing');
  const uvScale = transform?.getScale() || [1, 1], offset = transform?.getOffset() || [0, 0], angle = transform?.getRotation() || 0;
  const vertices = new Float32Array(positions.getCount() * 8), normalMatrix = mat3.normalFromMat4(mat3.create(), matrix);
  for (let i = 0; i < positions.getCount(); i++) {
    const p = vec3.transformMat4([], positions.getElement(i, []), matrix);
    const n = vec3.normalize([], vec3.transformMat3([], normals.getElement(i, []), normalMatrix));
    // Headlamps identify +Z as front; Y is up. [Z,X,Y] has determinant +1.
    const position = [(p[2] - center[2]) * scale, (p[0] - center[0]) * scale, (p[1] - center[1]) * scale];
    vertices.set([...position, n[2], n[0], n[1]], i * 8);
    const coord = uv.getElement(i, []), u = coord[0] * uvScale[0], v = coord[1] * uvScale[1];
    vertices[i * 8 + 6] = offset[0] + Math.cos(angle) * u - Math.sin(angle) * v;
    vertices[i * 8 + 7] = offset[1] + Math.sin(angle) * u + Math.cos(angle) * v;
  }
  let indices = Uint32Array.from(primitive.getIndices().getArray());
  if (mat3.determinant(mat3.fromMat4(mat3.create(), matrix)) < 0) {
    for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
  }
  if (fallback) {
    // Sloppy simplification may exceed the requested index count at its error
    // bound. This calibrated per-part target retains about 6k triangles overall.
    const target = Math.max(3, Math.floor(indices.length * 4800 / 228676 / 3) * 3);
    [indices] = MeshoptSimplifier.simplifySloppy(indices, vertices, 8, null, target, .08);
    if (!indices.length) return null;
    // Coarse clustering may reverse a small triangle on curved, nested lamp or
    // wheel surfaces. Orient fallback faces toward the retained source normals.
    for (let k = 0; k < indices.length; k += 3) {
      const a = indices[k] * 8, b = indices[k + 1] * 8, c = indices[k + 2] * 8;
      const ab = [vertices[b] - vertices[a], vertices[b + 1] - vertices[a + 1], vertices[b + 2] - vertices[a + 2]];
      const ac = [vertices[c] - vertices[a], vertices[c + 1] - vertices[a + 1], vertices[c + 2] - vertices[a + 2]];
      const normal = vec3.cross([], ab, ac);
      const dot = normal.reduce((n, value, j) => n + value * (vertices[a + 3 + j] + vertices[b + 3 + j] + vertices[c + 3 + j]), 0);
      if (dot < 0) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
    }
  }
  // Compact vertices without changing source geometry or the retained normals.
  const remap = new Map(), compact = [], remapped = new Uint32Array(indices.length), bounds = emptyBounds();
  indices.forEach((index, i) => {
    assert(Number.isInteger(index) && index < positions.getCount());
    if (!remap.has(index)) {
      remap.set(index, remap.size);
      const v = vertices.subarray(index * 8, index * 8 + 8);
      for (const value of v) assert(Number.isFinite(value));
      compact.push(...v); include(bounds, v);
    }
    remapped[i] = remap.get(index);
  });
  return { vertices: Float32Array.from(compact), indices: remapped, bounds };
}
function convert(fallback = false) {
  const groups = new Map();
  for (const { node, primitive, name } of parts) {
    const visual = appearance(primitive, name, fallback), g = geometry(primitive, node.getWorldMatrix(), fallback);
    if (!g) continue;
    const key = JSON.stringify(visual);
    if (!groups.has(key)) groups.set(key, { visual, vertices: [], indices: [], parts: [], bounds: emptyBounds(), count: 0 });
    const group = groups.get(key);
    group.vertices.push(g.vertices);
    group.indices.push(Uint32Array.from(g.indices, i => i + group.count));
    group.count += g.vertices.length / 8;
    group.parts.push({ name, triangles: g.indices.length / 3, bounds: g.bounds });
    include(group.bounds, g.bounds.min); include(group.bounds, g.bounds.max);
  }
  const floor = Math.min(...[...groups.values()].map(g => g.bounds.min[2]));
  return [...groups.values()].map(g => {
    const vertices = new Float32Array(g.count * 8); let offset = 0;
    for (const v of g.vertices) { vertices.set(v, offset); offset += v.length; }
    for (let i = 2; i < vertices.length; i += 8) vertices[i] -= floor;
    const size = g.indices.reduce((n, a) => n + a.length, 0), indices = g.count < 65536 ? new Uint16Array(size) : new Uint32Array(size);
    offset = 0;
    for (const values of g.indices) { indices.set(values, offset); offset += values.length; }
    for (const bounds of [g.bounds, ...g.parts.map(p => p.bounds)]) { bounds.min[2] -= floor; bounds.max[2] -= floor; }
    return { ...g.visual, name: g.parts.map(p => p.name).join(' | '), sourceParts: g.parts, bounds: g.bounds, triangles: size / 3, vertices: b64(vertices), indices: b64(indices), indexType: indices.BYTES_PER_ELEMENT };
  });
}
const primitives = convert(), fallbackPrimitives = convert(true);
const triangles = primitives.reduce((n, p) => n + p.triangles, 0), fallbackTriangles = fallbackPrimitives.reduce((n, p) => n + p.triangles, 0);
const bounds = emptyBounds(); for (const p of primitives) { include(bounds, p.bounds.min); include(bounds, p.bounds.max); }
assert.equal(triangles, 228676);
assert(fallbackTriangles > 3000 && fallbackTriangles <= 7000, `Fallback triangle budget: ${fallbackTriangles}`);
assert(Math.abs(bounds.min[2]) < .00001);
assert(Math.abs(bounds.max[0] - bounds.min[0] - 4.468) < .00001);
assert(primitives.filter(p => p.materialName === 'MAT_FRONTLIGHT').every(p => p.bounds.min[0] > 1.6));
assert(primitives.filter(p => p.materialName === 'MAT_BACKLIGHT').every(p => p.bounds.max[0] < -1.7));
const source = {
  kind: 'community-mesh', label: 'BMW M2 F87 · Manuel Contento 커뮤니티 외관',
  author: 'Manuel Contento', authorUrl: 'https://sketchfab.com/manuelcontento',
  url: 'https://sketchfab.com/3d-models/bmw-m2-394feedd0a0742c595917c7b0f6edcad',
  license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  configuration: 'Original F87 M2 / N55, 2016–2017 pre-LCI exterior. Not M2 Competition. Body stripes removed with a separate Long Beach Blue Metallic (C16) material; digital paint approximation.',
  stockPaint,
  attribution: 'BMW M2 by Manuel Contento, CC BY 4.0. Public processed mirror by pedrosoandre/carros. Adapted for WebSim; see bmw_m2-source.json and bmw_m2-LICENSE.txt.',
  downloadUrl: 'https://raw.githubusercontent.com/pedrosoandre/carros/0a56de377f02f2574d781f6920fed08d6423ec2f/assets/bmw-m2.glb',
  sha256: expectedHash
};
const payload = { id: 'bmw_m2', source, bounds, triangles, primitives, textures, fallbackTriangles, fallbackPrimitives };
const runtime = '/* BMW M2 by Manuel Contento, CC BY 4.0. See bmw_m2-source.json and bmw_m2-LICENSE.txt.\n * Body stripes replaced with Long Beach Blue (C16) material; badges and detail textures retained. */\n' +
  `ManufacturerModels.registerCompressed(${JSON.stringify(gzipSync(JSON.stringify(payload), { level: 9 }).toString('base64'))});\n`;
fs.writeFileSync(path.join(folder, 'bmw_m2-runtime.js'), runtime);
const summarize = ({ vertices, indices, ...p }) => p;
const summary = { ...payload, sourceBounds, scale, runtimeBytes: Buffer.byteLength(runtime), textures: textureInfo,
  validation: { finiteVertices: true, validIndices: true, normalizedQuantizedAttributesDecoded: true, groundZero: true, headlampsPositiveX: true, taillampsNegativeX: true },
  primitives: primitives.map(summarize), fallbackPrimitives: fallbackPrimitives.map(summarize) };
fs.writeFileSync(path.join(folder, 'bmw_m2-runtime-summary.json'), JSON.stringify(summary, null, 2) + '\n');
const provenancePath = path.join(folder, 'bmw_m2-source.json');
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
Object.assign(provenance.conversion, { triangles, fallbackTriangles, drawGroups: primitives.length, fallbackDrawGroups: fallbackPrimitives.length, runtimeBytes: summary.runtimeBytes, sourceParts: parts.length, scale, bounds, textures: textureInfo });
fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify({ id: payload.id, triangles, fallbackTriangles, drawGroups: primitives.length, fallbackDrawGroups: fallbackPrimitives.length, runtimeBytes: summary.runtimeBytes, bounds, textureCount: textures.length }));
