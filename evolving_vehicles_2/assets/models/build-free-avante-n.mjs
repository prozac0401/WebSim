/** Deterministic conversion of tonielpro520's CC BY 4.0 2022 Hyundai Elantra N.
 * Run from the repository root: node evolving_vehicles_2/assets/models/build-free-avante-n.mjs [source.glb]
 * Input is the ordinary signed-in Sketchfab download, never viewer extraction.
 * See avante_n-source.json and avante_n-LICENSE.txt. No network or image editing.
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
const { MeshoptSimplifier } = await import(pathToFileURL(require.resolve('meshoptimizer')));
const { mat3, vec3 } = require('gl-matrix');
const sharp = require('sharp');
await MeshoptSimplifier.ready;
const folder = path.dirname(fileURLToPath(import.meta.url));
const filename = path.resolve(process.argv[2] || 'output/cn7-n/source.glb');
const expectedHash = 'c614c473220709478794b641eea76f49047b1f8338b27300a8d33eb65ff289b5';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const input = fs.readFileSync(filename);
assert.equal(sha256(input), expectedHash, 'Unexpected CN7 N source');
const sourceJson = JSON.parse(input.subarray(20, 20 + input.readUInt32LE(12)).toString());
assert.match(sourceJson.asset.extras.license, /CC-BY-4\.0/);
assert.match(sourceJson.asset.extras.source, /cd5741852515425aa3c058b7e081dd2c$/);
const doc = await new NodeIO().read(filename);
const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const emptyBounds = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
function include(bounds, p) {
  for (let axis = 0; axis < 3; axis++) {
    bounds.min[axis] = Math.min(bounds.min[axis], p[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], p[axis]);
  }
}
const parts = [], sourceBounds = emptyBounds();
for (const node of doc.getRoot().listNodes()) if (node.getMesh()) {
  for (const primitive of node.getMesh().listPrimitives()) {
    assert.equal(primitive.getMode(), 4);
    parts.push({ node, primitive, name: node.getName() });
    const positions = primitive.getAttribute('POSITION');
    for (let i = 0; i < positions.getCount(); i++) {
      include(sourceBounds, vec3.transformMat4([], positions.getElement(i, []), node.getWorldMatrix()));
    }
  }
}
const sourceTriangles = parts.reduce((n, p) => n + p.primitive.getIndices().getCount() / 3, 0);
assert.equal(sourceTriangles, 500248);
// Front lamp lenses are at world +Z, rear lenses at -Z. World +Y is up.
// The existing renderer's rear camera displays local +Y to screen right.
// Reflect source X into runtime -Y to match that screen convention: otherwise
// ELANTRA lettering, N badge side, fuel flap and steering position are mirrored.
// Correct normals and triangle winding together with this handedness change.
const scale = 4.675 / (sourceBounds.max[2] - sourceBounds.min[2]);
const center = [(sourceBounds.min[0] + sourceBounds.max[0]) / 2, sourceBounds.min[1], (sourceBounds.min[2] + sourceBounds.max[2]) / 2];
const textures = [], textureInfo = [], textureIds = new Map();
for (const { primitive } of parts) {
  const m = primitive.getMaterial(), texture = m.getBaseColorTexture();
  if (!texture || textureIds.has(texture)) continue;
  const bytes = texture.getImage(), metadata = await sharp(bytes).metadata();
  assert(metadata.width <= 2048 && metadata.height <= 2048, 'Unexpected texture dimensions');
  textureIds.set(texture, textures.length);
  textures.push(`data:${texture.getMimeType()};base64,${b64(bytes)}`);
  textureInfo.push({ materialName: m.getName(), mimeType: texture.getMimeType(), bytes: bytes.length, width: metadata.width, height: metadata.height, sha256: sha256(bytes) });
}
const shortName = material => material.getName().replace('M_2022_Hyundai_Elantra_N_', '');
const linearToSrgb = value => value <= .0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - .055;
function appearance(material, fallback) {
  const name = shortName(material), base = material.getBaseColorFactor();
  const glass = /Glass$|^Windows$/.test(name), paint = name === 'Ceramic_White';
  const lamp = /^(DRLs|DarkRed|RedMain1|RedMainMiddle|Reflectors|OrangeSide)$/.test(name);
  const metal = /^(ChromeTrims1|BlackChrome|Mirrors|BrakeRotors|Rims1)$/.test(name);
  const visual = {
    materialName: material.getName(), role: paint ? 'factory-paint' : name === 'RedBadges' ? 'red-trim-and-badges' : name === 'Tires' ? 'tires' : name,
    color: base.slice(0, 3).map(linearToSrgb), alpha: base[3],
    material: glass ? 1 : lamp ? 4 : metal ? 3 : paint ? 0 : 2,
    paint: false, textureOpaque: material.getAlphaMode() === 'OPAQUE'
  };
  // The renderer shades display-space color. Decode glTF linear base factors
  // once; retain source glass alpha and white paint instead of UI tinting it.
  const texture = material.getBaseColorTexture();
  if (texture && !fallback) visual.textureIndex = textureIds.get(texture);
  return visual;
}
const groups = new Map(), wheelCenters = [];
for (const { node, primitive, name } of parts) {
  const material = primitive.getMaterial(), key = material.getName();
  if (!groups.has(key)) groups.set(key, { material, vertices: [], indices: [], remap: new Map(), sourceParts: [] });
  const group = groups.get(key), positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL');
  assert(normals, 'Source normals required');
  const matrix = node.getWorldMatrix(), normalMatrix = mat3.normalFromMat4(mat3.create(), matrix);
  const texInfo = material.getBaseColorTextureInfo();
  const uv = texInfo ? primitive.getAttribute('TEXCOORD_' + texInfo.getTexCoord()) : null;
  const remapped = new Uint32Array(positions.getCount()), bounds = emptyBounds();
  for (let i = 0; i < positions.getCount(); i++) {
    const p = vec3.transformMat4([], positions.getElement(i, []), matrix);
    const n = vec3.normalize([], vec3.transformMat3([], normals.getElement(i, []), normalMatrix));
    const v = [(p[2] - center[2]) * scale, -(p[0] - center[0]) * scale, (p[1] - center[1]) * scale, n[2], -n[0], n[1], ...(uv ? uv.getElement(i, []) : [0, 0])];
    include(bounds, v);
    // Untextured source UVs contain large, irrelevant coordinates and split
    // almost every triangle. Drop those UVs, then weld equivalent positions
    // and normals to one micrometre / 1e-6 normal component precision.
    const vertexKey = v.map(value => value.toFixed(6)).join(',');
    let index = group.remap.get(vertexKey);
    if (index === undefined) { index = group.vertices.length / 8; group.remap.set(vertexKey, index); group.vertices.push(...v); }
    remapped[i] = index;
  }
  const indices = primitive.getIndices().getArray(), reverse = mat3.determinant(mat3.fromMat4(mat3.create(), matrix)) > 0;
  for (let i = 0; i < indices.length; i += 3) group.indices.push(remapped[indices[i]], remapped[indices[i + (reverse ? 2 : 1)]], remapped[indices[i + (reverse ? 1 : 2)]]);
  group.sourceParts.push({ name, sourceTriangles: indices.length / 3, bounds });
  if (shortName(material) === 'Tires') wheelCenters.push({ name, center: bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2), radius: (bounds.max[2] - bounds.min[2]) / 2, axis: [0, 1, 0], bounds });
}
function compact(vertices, indices) {
  const remap = new Map(), result = [], packed = new Uint32Array(indices.length), bounds = emptyBounds();
  indices.forEach((index, i) => {
    assert(Number.isInteger(index) && index < vertices.length / 8);
    if (!remap.has(index)) {
      remap.set(index, remap.size);
      const v = vertices.subarray(index * 8, index * 8 + 8);
      for (const value of v) assert(Number.isFinite(value));
      result.push(...v); include(bounds, v);
    }
    packed[i] = remap.get(index);
  });
  return { vertices: Float32Array.from(result), indices: packed, bounds };
}
function convert(fallback) {
  const output = [];
  for (const group of groups.values()) {
    const vertices = Float32Array.from(group.vertices), original = Uint32Array.from(group.indices), name = shortName(group.material);
    let indices = original, error = 0;
    if (fallback && !group.material.getBaseColorTexture()) {
      // Spatial clustering joined disjoint roof/door/glass sheets and mixed
      // their normals, visibly crumpling the car. Keep source topology and
      // normal error in the reduced model, with extra exterior surface budget.
      const ratio = name === 'Ceramic_White' ? .10 : /Glass$|^Windows$|^Tires$/.test(name) ? .18 : name === 'RedBadges' ? .15 : .02;
      const target = Math.max(24, Math.floor(original.length * ratio / 3) * 3);
      const attributes = new Float32Array(vertices.length / 8 * 3);
      for (let i = 0; i < vertices.length / 8; i++) attributes.set(vertices.subarray(i * 8 + 3, i * 8 + 6), i * 3);
      [indices, error] = MeshoptSimplifier.simplifyWithAttributes(original, vertices, 8, attributes, 3, [.5, .5, .5], null, target, .006, ['Permissive']);
    } else if (!fallback && !group.material.getBaseColorTexture()) {
      // Preserve body contours, tires, lamp lenses and the distinctive red N
      // strips more closely than hidden cabin / large black trim geometry.
      const ratio = /^(Ceramic_White|RedBadges|Tires|.*Glass|Windows)$/.test(name) ? .72 : name === 'Interior' ? .16 : .36;
      const target = Math.max(36, Math.floor(original.length * ratio / 3) * 3);
      const attributes = new Float32Array(vertices.length / 8 * 3);
      for (let i = 0; i < vertices.length / 8; i++) attributes.set(vertices.subarray(i * 8 + 3, i * 8 + 6), i * 3);
      [indices, error] = MeshoptSimplifier.simplifyWithAttributes(original, vertices, 8, attributes, 3, [.5, .5, .5], null, target, .0015, ['Permissive']);
    }
    if (!indices.length) continue;
    if (fallback) {
      // Coarse clustering can reverse tiny curved faces. Align those faces
      // with their retained source normals, never change the main winding.
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 8, b = indices[i + 1] * 8, c = indices[i + 2] * 8;
        const ab = [vertices[b] - vertices[a], vertices[b + 1] - vertices[a + 1], vertices[b + 2] - vertices[a + 2]];
        const ac = [vertices[c] - vertices[a], vertices[c + 1] - vertices[a + 1], vertices[c + 2] - vertices[a + 2]];
        const cross = vec3.cross([], ab, ac);
        if (cross.reduce((sum, value, axis) => sum + value * (vertices[a + 3 + axis] + vertices[b + 3 + axis] + vertices[c + 3 + axis]), 0) < 0) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      }
    }
    const g = compact(vertices, indices), packed = g.vertices.length / 8 < 65536 ? Uint16Array.from(g.indices) : g.indices;
    output.push({ ...appearance(group.material, fallback), name: group.sourceParts.map(p => p.name).join(' | '), sourceParts: group.sourceParts,
      bounds: g.bounds, triangles: indices.length / 3, sourceTriangles: original.length / 3, simplificationError: error,
      vertices: b64(g.vertices), indices: b64(packed), indexType: packed.BYTES_PER_ELEMENT });
  }
  if (fallback) {
    // Simplification can omit the exact lowest tire vertex; lower the entire
    // fallback by that tiny common amount so it still rests at ground zero.
    const floor = Math.min(...output.map(p => p.bounds.min[2]));
    for (const p of output) {
      const bytes = Buffer.from(p.vertices, 'base64'), vertices = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
      for (let i = 2; i < vertices.length; i += 8) vertices[i] -= floor;
      p.vertices = b64(vertices); p.bounds.min[2] -= floor; p.bounds.max[2] -= floor;
      p.fallbackGroundShiftM = floor;
    }
  }
  return output;
}
const primitives = convert(false), fallbackPrimitives = convert(true);
const triangles = primitives.reduce((n, p) => n + p.triangles, 0), fallbackTriangles = fallbackPrimitives.reduce((n, p) => n + p.triangles, 0);
const bounds = emptyBounds(); for (const p of primitives) { include(bounds, p.bounds.min); include(bounds, p.bounds.max); }
assert(triangles > 100000 && triangles < 300000, `Main triangle budget: ${triangles}`);
assert(fallbackTriangles > 10000 && fallbackTriangles <= 45000, `Fallback triangle budget: ${fallbackTriangles}`);
assert(Math.abs(bounds.min[2]) < .00001);
const source = {
  kind: 'community-mesh', label: '아반떼 N CN7 · tonielpro520 커뮤니티 외관',
  author: 'tonielpro520', authorUrl: 'https://sketchfab.com/tonielpro520',
  url: 'https://sketchfab.com/3d-models/2022-hyundai-elantra-n-cd5741852515425aa3c058b7e081dd2c',
  license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  configuration: '2022 Elantra N / Avante N CN7 pre-facelift production exterior. Original Ceramic White material and red N trim; export ELANTRA lettering, amber details and overseas plate retained. Not N Line or TCR.',
  attribution: '2022 Hyundai Elantra N by tonielpro520, CC BY 4.0. Mesh simplified and coordinates/render materials adapted for WebSim; see avante_n-source.json and avante_n-LICENSE.txt.',
  sha256: expectedHash
};
const payload = { id: 'avante_n', source, bounds, triangles, primitives, textures, fallbackTriangles, fallbackPrimitives, wheelCenters, wheelAnimation: 'static-source-mesh', coordinateTransform: { worldToRuntime: ['+Z', '-X', '+Y'], handednessCorrectedForRenderer: true, windingCorrected: true } };
const runtime = '/* 2022 Hyundai Elantra N by tonielpro520, CC BY 4.0.\n * Simplified and adapted for WebSim. See avante_n-source.json and avante_n-LICENSE.txt. */\n' +
  `ManufacturerModels.registerCompressed(${JSON.stringify(gzipSync(JSON.stringify(payload), { level: 9 }).toString('base64'))});\n`;
fs.writeFileSync(path.join(folder, 'avante_n-runtime.js'), runtime);
const summarize = ({ vertices, indices, ...p }) => p;
const summary = { ...payload, sourceBounds, scale, runtimeBytes: Buffer.byteLength(runtime), textures: textureInfo,
  validation: { finiteVertices: true, validIndices: true, groundZero: true, frontPositiveX: true, upPositiveZ: true },
  primitives: primitives.map(summarize), fallbackPrimitives: fallbackPrimitives.map(summarize) };
fs.writeFileSync(path.join(folder, 'avante_n-runtime-summary.json'), JSON.stringify(summary, null, 2) + '\n');
const changes = [
  'Applied world transforms and [world +Z, -X, +Y] to match the renderer forward/up/screen-right convention; corrected reflected normals and winding. This preserves readable ELANTRA lettering and original N-badge/fuel-flap/steering side in the rendered view. Uniformly scaled to 4.675 m and tire ground zero.',
  'Removed unused UVs from untextured parts, welded equivalent positions/normals, and joined source draw fragments by material without excluding source parts before simplification.',
  'Simplified indexed geometry with normal-aware Meshopt; retained source body, spoiler, N badges, red trim, lamp, grille, interior, wheel and tire geometry without adding replacement body shapes.',
  'Converted linear glTF base factors to display-space colors, mapped materials to the existing renderer, and retained original glass alpha, Ceramic White paint and red accents.',
  'Embedded the sole original JPEG license-plate texture byte-for-byte; retained its original overseas plate artwork. No raster editing or generated images.',
  'Created a separate topology- and normal-aware simplified fallback with extra body/glass/tire budget; no spatial-clustering simplification. Compacted vertices and embedded a gzip-compressed local JavaScript payload. Wheels remain static under the existing runtime contract.'
];
const provenance = {
  id: 'avante_n', title: '2022 Hyundai Elantra N', author: source.author, authorUrl: source.authorUrl,
  sourceUrl: source.url, license: source.license, licenseUrl: source.licenseUrl, manufacturerOfficial: false,
  verifiedDate: '2026-10-19', configuration: { generation: 'CN7', modelYear: 2022, facelift: false, exterior: source.configuration },
  download: { method: 'Normal Sketchfab download after user sign-in; GLB supplied by the user. No viewer extraction or authentication bypass.', sourcePage: source.url,
    files: [{ name: '2022_hyundai_elantra_n.glb', bytes: input.length, sha256: expectedHash }], embeddedAttribution: sourceJson.asset.extras },
  sourceGeometry: { downloadedTriangles: sourceTriangles, downloadedMeshes: parts.length, downloadedMaterials: groups.size, downloadedImages: textures.length },
  conversion: { builder: 'build-free-avante-n.mjs', changes, geometryAdded: false, fullBodySimplifiedByWebSim: true, sourceParts: parts.length,
    triangles, fallbackTriangles, drawGroups: primitives.length, fallbackDrawGroups: fallbackPrimitives.length, runtimeBytes: summary.runtimeBytes, scale, bounds, textures: textureInfo },
  attribution: source.attribution
};
fs.writeFileSync(path.join(folder, 'avante_n-source.json'), JSON.stringify(provenance, null, 2) + '\n');
fs.writeFileSync(path.join(folder, 'avante_n-LICENSE.txt'), `2022 Hyundai Elantra N — tonielpro520\n\nOriginal model: ${source.url}\nCreator: ${source.authorUrl}\n\nLicensed under Creative Commons Attribution 4.0 International (CC-BY-4.0).\nLicense: ${source.licenseUrl}\nLegal code: https://creativecommons.org/licenses/by/4.0/legalcode.en\n\nThe public model page and downloaded GLB identify this author, source and\nlicense. Verified 2026-10-19. Keep the attribution, license link and change\nnotice with redistributed copies. No endorsement by Hyundai or the creator\nis implied. This is a community model, not official manufacturer CAD.\n\nAcquired through the normal Sketchfab download after user sign-in.\nInput: 2022_hyundai_elantra_n.glb (${input.length} bytes)\nSHA-256: ${expectedHash}\n\nWebSim modifications:\n${changes.map(c => '- ' + c).join('\n')}\n\nSee avante_n-source.json, avante_n-runtime-summary.json and\nbuild-free-avante-n.mjs for provenance and reproducible processing.\n`);
console.log(JSON.stringify({ id: payload.id, triangles, fallbackTriangles, drawGroups: primitives.length, runtimeBytes: summary.runtimeBytes, bounds, wheelCenters }));
