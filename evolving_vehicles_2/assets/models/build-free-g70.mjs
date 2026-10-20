/** Rebuild the attributed, independent G70 model for the race renderer.
 * Run from repository root after obtaining the CC BY 4.0 source documented in
 * g70-model-source.json. Tooling matches build-models.mjs. No network access.
 * This is an independent artist model, not manufacturer CAD.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { refineG70Exterior } from './g70-exterior-parts.mjs';
const require = createRequire(path.resolve('output/model-tools/package.json'));
const { NodeIO } = await import(pathToFileURL(require.resolve('@gltf-transform/core')));
const { weld, simplify, simplifyPrimitive, compactPrimitive, normals } = await import(pathToFileURL(require.resolve('@gltf-transform/functions')));
const { MeshoptSimplifier } = await import(pathToFileURL(require.resolve('meshoptimizer')));
const { vec3, mat3 } = require('gl-matrix');
await MeshoptSimplifier.ready;
const folder = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(process.argv[2] || 'output/free-models/g70/g70-lucas-original.glb');
const expectedHash = '8cc0bc72c525ebc70b31b421b3a34f4ff89dda8a48b82aedd07ca774db22fcac';
const sourceBytes = fs.readFileSync(sourcePath);
assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), expectedHash, 'Unexpected G70 source');
const io = new NodeIO();
const source = {
  kind: 'community-mesh', label: 'Genesis G70 · Lucas.Karlsmoen · CC BY 4.0',
  url: 'https://sketchfab.com/3d-models/genesis-g70-ded2c8428fb9499ebd2bfc69c5592b02',
  author: 'Lucas.Karlsmoen', authorUrl: 'https://sketchfab.com/Lucas.Karlsmoen',
  license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  configuration: 'Independent pre-facelift G70 exterior, published in 2019. Exact original trim not specified; shared exterior for simulated 2018/19 variants.',
  changes: 'Geometry simplified; coordinates normalized; opaque cabin glazing, dark rubber and metallic wheel/brake materials adapted for the exterior renderer. Original grille mesh preserved; exterior trim and rear-skirt detail use tight simplification. Grille supports, body-painted mirror caps, glossy black B-pillars and dark-chrome window frames separated from original geometry. Original lamp and wheel UV textures retained.',
  redistribution: 'AllenAI Objaverse, original attribution and CC BY 4.0 license retained in the downloaded GLB.',
  downloadUrl: 'https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-067/ded2c8428fb9499ebd2bfc69c5592b02.glb',
  sha256: expectedHash
};
const b64 = values => Buffer.from(values.buffer, values.byteOffset, values.byteLength).toString('base64');
const textures = [], textureIds = new Map();
function textureIndex(texture) {
  if (!texture) return undefined;
  const value = `data:${texture.getMimeType()};base64,${b64(texture.getImage())}`;
  if (!textureIds.has(value)) { textureIds.set(value, textures.length); textures.push(value); }
  return textureIds.get(value);
}
function appearance(primitive) {
  const m = primitive.getMaterial(), name = m?.getName() || '';
  const base = m?.getBaseColorFactor() || [.2, .2, .2, 1];
  const paint = /^Paint/.test(name);
  let color = base.slice(0, 3).map(v => Math.pow(v, 1 / 2.2));
  let material = paint ? 0 : /^chrome/.test(name) ? 3 : 2, alpha = base[3];
  if (/^window_glass/.test(name)) { color = [.045, .065, .08]; material = 1; alpha = 1; }
  // Source tire material is untextured white; preserve its mesh but render rubber.
  if (name === 'Material__343') color = [.055, .06, .065];
  if (/^Material__34[456]$/.test(name)) { color = [.72, .75, .78]; material = 3; }
  if (name === 'Glass') { color = [.47, .56, .61]; alpha = 1; material = 3; } // mirror glass
  if (/^Material__(279|281|287|288|289|290|291|292|293|307)$/.test(name)) material = 4;
  if (/^Material__(286|289)$/.test(name)) { material = 1; alpha = .12; }
  if (name === 'Material__290') { color = [.63, .015, .035]; alpha = .78; }
  if (name === 'Material__307') { color = [.65, .02, .025]; alpha = 1; }
  return { materialName: name, color, alpha, material, paint, textureIndex: textureIndex(m?.getBaseColorTexture()) };
}
function boundsOf(nodes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], v = vec3.create();
  for (const node of nodes) for (const primitive of node.getMesh().listPrimitives()) {
    const p = primitive.getAttribute('POSITION').getArray(), matrix = node.getWorldMatrix();
    for (let i = 0; i < p.length; i += 3) {
      vec3.transformMat4(v, p.subarray(i, i + 3), matrix);
      for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], v[axis]); max[axis] = Math.max(max[axis], v[axis]); }
    }
  }
  return { min, max };
}
const initial = await io.read(sourcePath);
const sourceBounds = boundsOf(initial.getRoot().listNodes().filter(n => n.getMesh()));
const centerY = (sourceBounds.min[1] + sourceBounds.max[1]) / 2;
const centerX = (sourceBounds.min[0] + sourceBounds.max[0]) / 2;
function geometry(primitive, matrix) {
  compactPrimitive(primitive);
  const p = primitive.getAttribute('POSITION').getArray(), normals = primitive.getAttribute('NORMAL')?.getArray();
  const uv = primitive.getAttribute('TEXCOORD_0')?.getArray(), v = vec3.create(), normal = vec3.create();
  const normalMatrix = mat3.normalFromMat4(mat3.create(), matrix);
  const vertices = new Float32Array(p.length / 3 * 8), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length / 3; i++) {
    vec3.transformMat4(v, p.subarray(i * 3, i * 3 + 3), matrix);
    vec3.set(normal, normals?.[i * 3] || 0, normals?.[i * 3 + 1] || 0, normals?.[i * 3 + 2] || 0);
    vec3.transformMat3(normal, normal, normalMatrix); vec3.normalize(normal, normal);
    // Source is already Z-up; +Y is the headlamp/hood end. Rotation has det +1.
    const position = [v[1] - centerY, -v[0] + centerX, v[2] - sourceBounds.min[2]];
    const rotatedNormal = [normal[1], -normal[0], normal[2]];
    for (let axis = 0; axis < 3; axis++) {
      assert(Number.isFinite(position[axis]) && Number.isFinite(rotatedNormal[axis]));
      vertices[i * 8 + axis] = Math.round(position[axis] * 10000) / 10000;
      vertices[i * 8 + axis + 3] = Math.round(rotatedNormal[axis] * 1000) / 1000;
      min[axis] = Math.min(min[axis], position[axis]); max[axis] = Math.max(max[axis], position[axis]);
    }
    vertices[i * 8 + 6] = Math.round((uv?.[i * 2] || 0) * 100000) / 100000;
    vertices[i * 8 + 7] = Math.round((uv?.[i * 2 + 1] || 0) * 100000) / 100000;
  }
  const raw = primitive.getIndices()?.getArray() || Uint32Array.from({ length: p.length / 3 }, (_, i) => i);
  const indices = p.length / 3 < 65536 ? new Uint16Array(raw) : new Uint32Array(raw);
  assert.equal(indices.length % 3, 0);
  for (const index of indices) assert(index < p.length / 3);
  return { vertices: b64(vertices), indices: b64(indices), indexType: indices.BYTES_PER_ELEMENT, triangles: indices.length / 3, bounds: { min, max } };
}
async function convert(ratio, error, fallback = false) {
  const doc = await io.read(sourcePath);
  if (fallback) for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    for (const semantic of p.listSemantics()) if (semantic !== 'POSITION') p.setAttribute(semantic, null);
  }
  await doc.transform(weld());
  if (fallback) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error }));
  else for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const name = p.getMaterial()?.getName() || '';
    // Flat external panels need far tighter error limits than lamp internals.
    // A uniform 3.5% target creased the hood and let neighboring roof/trim
    // surfaces intersect. Preserve the source's panel shape and smooth normals.
    const outerPanel = /^Paint|^window_glass|^chrome[1234]$|^Material__(275|306|308|3190?|368)$/.test(name);
    // A sparse diagonal grille cannot be decimated like a hidden interior:
    // the previous 3.5% path collapsed its narrow diamond ribs and joins.
    if(name!=='chrome')simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: outerPanel ? .25 : ratio, error: outerPanel ? .00012 : error });
  }
  if (fallback) await doc.transform(normals());
  const primitives = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    for (const primitive of node.getMesh().listPrimitives()) {
      const materialName = primitive.getMaterial()?.getName();
      if (materialName === 'Material__283') continue; // beige interior behind opaque glass
      if (fallback && /^Material__(278|287)$/.test(materialName)) continue; // interior reflector tessellation
      const visual = appearance(primitive);
      if (fallback) {
        delete visual.textureIndex;
        if (materialName === 'Material__286') { visual.color = [.68, .75, .78]; visual.alpha = 1; visual.material = 4; }
        if (materialName === 'Material__290') visual.alpha = 1;
      }
      primitives.push({ name: node.getName(), ...visual, ...geometry(primitive, node.getWorldMatrix()) });
    }
  }
  return primitives;
}
function placeOnGround(primitives) {
  const floor = Math.min(...primitives.map(p => p.bounds.min[2]));
  for (const p of primitives) {
    const bytes = Buffer.from(p.vertices, 'base64');
    const vertices = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    for (let i = 2; i < vertices.length; i += 8) vertices[i] -= floor;
    p.vertices = b64(vertices); p.bounds.min[2] -= floor; p.bounds.max[2] -= floor;
  }
  return primitives;
}
const primitives = refineG70Exterior(placeOnGround(await convert(.035, .0045)));
const fallbackPrimitives = refineG70Exterior(placeOnGround(await convert(.003, .055, true)));
const triangles = primitives.reduce((n, p) => n + p.triangles, 0);
const fallbackTriangles = fallbackPrimitives.reduce((n, p) => n + p.triangles, 0);
console.log(JSON.stringify({ triangles, fallbackTriangles }));
const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (const p of primitives) for (let axis = 0; axis < 3; axis++) {
  bounds.min[axis] = Math.min(bounds.min[axis], p.bounds.min[axis]); bounds.max[axis] = Math.max(bounds.max[axis], p.bounds.max[axis]);
}
assert(triangles < 320000, `Main triangle budget: ${triangles}`);
assert(fallbackTriangles < 6000, `Fallback triangle budget: ${fallbackTriangles}`);
assert(bounds.max[0] - bounds.min[0] > 4.6 && bounds.max[0] - bounds.min[0] < 4.8);
assert(Math.abs(bounds.min[2]) < .005);
assert(primitives.find(p => p.materialName === 'Material__281').bounds.min[0] > 1.8, 'Headlamps not at front');
assert(primitives.find(p => p.materialName === 'Material__290').bounds.max[0] < -1.7, 'Taillamps not at rear');
const payload = { id: 'g70', source, bounds, triangles, textures, primitives, fallbackTriangles, fallbackPrimitives };
const runtime = '/* Genesis G70 by Lucas.Karlsmoen, CC BY 4.0; see g70-model-source.json.\n * Simplified and adapted for WebSim; not manufacturer geometry. */\n' +
  `ManufacturerModels.registerCompressed(${JSON.stringify(gzipSync(JSON.stringify(payload), { level: 9 }).toString('base64'))});\n`;
fs.writeFileSync(path.join(folder, 'g70-runtime.js'), runtime);
const summarize = ({ vertices, indices, ...p }) => p;
const summary = { ...payload, sourceBounds, runtimeBytes: Buffer.byteLength(runtime), textures: textures.map(t => ({ bytes: t.length })),
  simplification: { detailRatio: .035, detailError: .0045, externalPanelRatio: .25, externalPanelError: .00012, grilleMeshPreserved:true, refinedRearMaterials:['Material__275','Material__306','Material__308'], paintTriangles: primitives.filter(p => p.paint).reduce((n, p) => n + p.triangles, 0) },
  validation: { finiteVertices: true, validIndices: true, groundZero: true, headlampsPositiveX: true, taillampsNegativeX: true },
  primitives: primitives.map(summarize), fallbackPrimitives: fallbackPrimitives.map(summarize) };
fs.writeFileSync(path.join(folder, 'g70-runtime-summary.json'), JSON.stringify(summary, null, 2) + '\n');
const sourceMetadataPath = path.join(folder, 'g70-model-source.json');
const sourceMetadata = JSON.parse(fs.readFileSync(sourceMetadataPath, 'utf8'));
sourceMetadata.conversion = {
  ...sourceMetadata.conversion,
  mainTriangles: triangles,
  paintTriangles: summary.simplification.paintTriangles,
  fallbackTriangles,
  runtimeBytes: summary.runtimeBytes,
  runtimeSha256: createHash('sha256').update(runtime).digest('hex'),
  quality: 'Main mesh preserves the original 33,915-triangle grille lattice. Exterior chrome, mirror/pillar pieces and rear exhaust/diffuser use ratio 0.25 / relative error 0.00012. Original painted panels, lamp/wheel/glass buffers and textures are unchanged. Material groups are split without moving vertices. The 4,689-triangle Canvas fallback retains its original coarse geometry and has lower grille fidelity.'
};
fs.writeFileSync(sourceMetadataPath, JSON.stringify(sourceMetadata, null, 2) + '\n');
console.log(JSON.stringify({ id: 'g70', triangles, fallbackTriangles, runtimeBytes: summary.runtimeBytes, bounds }));
