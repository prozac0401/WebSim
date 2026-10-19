/** Deterministic conversion of Mona x Supercars' CC BY 4.0 Toyota GR86 (ZN8).
 * Run from the repository root: node evolving_vehicles_2/assets/models/build-free-gr86.mjs [source.glb]
 * Input is the normal signed-in Sketchfab download. No network or raster edits.
 * See gr86-source.json and gr86-LICENSE.txt, including embedded texture credits.
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
const folder = process.argv[3] ? path.resolve(process.argv[3]) : path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(folder,{recursive:true});
const filename = path.resolve(process.argv[2] || 'output/gr86/source.glb');
const expectedHash = '276db7d1eb78ee603fbceb3684f33d7069fd5044d7376170b8a14554749bc07a';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const input = fs.readFileSync(filename);
assert.equal(sha256(input), expectedHash, 'Unexpected GR86 source');
const sourceJson = JSON.parse(input.subarray(20, 20 + input.readUInt32LE(12)).toString());
assert.match(sourceJson.asset.extras.license, /CC-BY-4\.0/);
assert.match(sourceJson.asset.extras.author, /Mona x Supercars.*Car2022/);
assert.match(sourceJson.asset.extras.source, /4919d14eba9640599e838230e8e5ed74$/);
const doc = await new NodeIO().read(filename);
const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const emptyBounds = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
function include(bounds, p) {
  for (let axis = 0; axis < 3; axis++) {
    bounds.min[axis] = Math.min(bounds.min[axis], p[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], p[axis]);
  }
}
const parts = [], excluded = [], sourceBounds = emptyBounds();
for (const node of doc.getRoot().listNodes()) if (node.getMesh()) {
  for (const primitive of node.getMesh().listPrimitives()) {
    assert.equal(primitive.getMode(), 4);
    const material = primitive.getMaterial(), sourceTriangles = primitive.getIndices().getCount() / 3;
    if (material.getAlphaMode() === 'BLEND' && material.getBaseColorFactor()[3] === 0) {
      excluded.push({ name: node.getName(), materialName: material.getName(), sourceTriangles, reason: 'Source BLEND material has exactly zero opacity.' });
      continue;
    }
    parts.push({ node, primitive, name: node.getName() });
    const positions = primitive.getAttribute('POSITION');
    for (let i = 0; i < positions.getCount(); i++) include(sourceBounds, vec3.transformMat4([], positions.getElement(i, []), node.getWorldMatrix()));
  }
}
const visibleSourceTriangles = parts.reduce((n, p) => n + p.primitive.getIndices().getCount() / 3, 0);
const sourceTriangles = visibleSourceTriangles + excluded.reduce((n, p) => n + p.sourceTriangles, 0);
assert.equal(sourceTriangles, 284061); assert.equal(visibleSourceTriangles, 248857);
// Bumperf/FariFront identify world -X as front; world +Y is up. The renderer
// rear camera projects runtime +Y to screen-right. Reflect world Z into -Y
// so the original rear GR plate and badges remain readable, and flip winding.
const canonical = p => [-p[0], -p[2], p[1]];
const sourceWheelBounds = Array.from({ length: 4 }, emptyBounds);
for (const { node, primitive } of parts) if (primitive.getMaterial().getName() === 'Wheel1Mtl') {
  const positions = primitive.getAttribute('POSITION');
  for (let i = 0; i < positions.getCount(); i++) {
    const p = canonical(vec3.transformMat4([], positions.getElement(i, []), node.getWorldMatrix()));
    include(sourceWheelBounds[(p[0] > 0 ? 2 : 0) + (p[1] > 0 ? 1 : 0)], p);
  }
}
const sourceWheelCenters = sourceWheelBounds.map(b => b.min.map((v, i) => (v + b.max[i]) / 2));
const axleCenter = indices => [0, 1, 2].map(a => indices.reduce((sum, i) => sum + sourceWheelCenters[i][a], 0) / indices.length);
const rearAxle = axleCenter([0, 1]), frontAxle = axleCenter([2, 3]);
const sourcePitch = Math.atan2(frontAxle[2] - rearAxle[2], frontAxle[0] - rearAxle[0]);
const cp = Math.cos(sourcePitch), sp = Math.sin(sourcePitch);
const level = p => [p[0] * cp + p[2] * sp, p[1], -p[0] * sp + p[2] * cp];
const leveledSourceBounds = emptyBounds();
for (const { node, primitive } of parts) {
  const positions = primitive.getAttribute('POSITION');
  for (let i = 0; i < positions.getCount(); i++) include(leveledSourceBounds, level(canonical(vec3.transformMat4([], positions.getElement(i, []), node.getWorldMatrix()))));
}
const scale = 4.265 / (leveledSourceBounds.max[0] - leveledSourceBounds.min[0]);
const center = [(leveledSourceBounds.min[0] + leveledSourceBounds.max[0]) / 2, (leveledSourceBounds.min[1] + leveledSourceBounds.max[1]) / 2, leveledSourceBounds.min[2]];
const textures = [], textureInfo = [], textureIds = new Map(), texturePixels = new Map(), textureHashes = new Map();
for (const { primitive } of parts) {
  const m = primitive.getMaterial(), texture = m.getBaseColorTexture();
  if (!texture || textureIds.has(texture)) continue;
  const bytes = texture.getImage(), hash = sha256(bytes), metadata = await sharp(bytes).metadata();
  assert(metadata.width <= 2048 && metadata.height <= 2048, 'Unexpected texture dimensions');
  assert((metadata.width & (metadata.width - 1)) === 0 && (metadata.height & (metadata.height - 1)) === 0, 'Repeat sampling requires power-of-two WebGL1 textures');
  let index = textureHashes.get(hash);
  if (index === undefined) {
    index = textures.length; textureHashes.set(hash, index);
    textures.push(`data:${texture.getMimeType()};base64,${b64(bytes)}`);
    textureInfo.push({ materialNames: [m.getName()], mimeType: texture.getMimeType(), bytes: bytes.length, width: metadata.width, height: metadata.height, sha256: hash });
  } else textureInfo[index].materialNames.push(m.getName());
  textureIds.set(texture, index);
  texturePixels.set(texture, await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
}
const linearToSrgb = value => value <= .0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - .055;
function textureMean(group) {
  const texture = group.material.getBaseColorTexture(), pixels = texturePixels.get(texture);
  if (!pixels) return [1, 1, 1];
  const color = [0, 0, 0]; let count = 0;
  const step = Math.max(3, Math.ceil(group.indices.length / 1024 / 3) * 3);
  for (let k = 0; k < group.indices.length; k += step) {
    const coords = [0, 0];
    for (let j = 0; j < 3; j++) for (let axis = 0; axis < 2; axis++) coords[axis] += group.vertices[group.indices[k + j] * 8 + 6 + axis] / 3;
    const x = Math.min(pixels.info.width - 1, Math.floor((coords[0] - Math.floor(coords[0])) * pixels.info.width));
    const y = Math.min(pixels.info.height - 1, Math.floor((coords[1] - Math.floor(coords[1])) * pixels.info.height));
    const offset = (y * pixels.info.width + x) * 4;
    if (pixels.data[offset + 3] < 16) continue;
    for (let j = 0; j < 3; j++) color[j] += pixels.data[offset + j] / 255;
    count++;
  }
  return count ? color.map(v => v / count) : [.12, .12, .12];
}
function appearance(group, fallback) {
  const material = group.material, name = material.getName(), base = material.getBaseColorFactor();
  const glass = name === 'Wind1Mtl' || name === 'Wind0011Mtl', paint = name === 'Paint1Mtl';
  const lamp = /^(Fari0051|FariFront1|Ln1|Ln3|Ln4)Mtl$/.test(name);
  const metal = /^(Bumperf0051|Bumperr0041|Meshesgr86fbumper41|Wheel0021|Wheel0081|Wheelpart1)Mtl$/.test(name);
  const tire = /^(Wheel1|Wheel0031)Mtl$/.test(name);
  const visual = {
    materialName: name, role: paint ? 'factory-paint' : tire ? 'tires' : glass ? 'glass' : lamp ? 'lamp' : name,
    color: base.slice(0, 3).map(linearToSrgb), alpha: base[3],
    material: glass ? 1 : lamp ? 4 : metal ? 3 : paint ? 0 : 2,
    paint, textureOpaque: material.getAlphaMode() === 'OPAQUE'
  };
  if (group.wheel) visual.wheel = group.wheel;
  const texture = material.getBaseColorTexture();
  if (texture && !fallback) {
    visual.textureIndex = textureIds.get(texture);
    visual.textureRepeat = true;
  } else if (texture && fallback) {
    const mean = textureMean(group);
    visual.color = visual.color.map((c, i) => c * mean[i]);
  }
  return visual;
}
const groups = new Map();
// These inspected source objects contain only tires/rims. Other materials named
// Wheel contain body, engine, or brake parts and deliberately stay stationary.
const rollingObjects = new Set(['Object_40','Object_41','Object_42','Object_43','Object_44','Object_45','Object_46']);
for (const { node, primitive, name } of parts) {
  const material = primitive.getMaterial(), rolling = rollingObjects.has(name), key = material.getName()+(rolling?'|rolling':'');
  if (!groups.has(key)) groups.set(key, { material, rolling, vertices: [], indices: [], remap: new Map(), sourceParts: [] });
  const group = groups.get(key), positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL');
  assert(normals, 'Source normals required');
  const matrix = node.getWorldMatrix(), normalMatrix = mat3.normalFromMat4(mat3.create(), matrix);
  const texInfo = material.getBaseColorTextureInfo();
  const uv = texInfo ? primitive.getAttribute('TEXCOORD_' + texInfo.getTexCoord()) : null;
  const remapped = new Uint32Array(positions.getCount()), bounds = emptyBounds();
  for (let i = 0; i < positions.getCount(); i++) {
    const p = vec3.transformMat4([], positions.getElement(i, []), matrix);
    const n = vec3.normalize([], vec3.transformMat3([], normals.getElement(i, []), normalMatrix));
    const position = level(canonical(p)), normal = level(canonical(n));
    const v = [...position.map((value, axis) => (value - center[axis]) * scale), ...normal, ...(uv ? uv.getElement(i, []) : [0, 0])];
    include(bounds, v);
    const vertexKey = v.map(value => value.toFixed(6)).join(',');
    let index = group.remap.get(vertexKey);
    if (index === undefined) { index = group.vertices.length / 8; group.remap.set(vertexKey, index); group.vertices.push(...v); }
    remapped[i] = index;
  }
  const indices = primitive.getIndices().getArray(), reverse = mat3.determinant(mat3.fromMat4(mat3.create(), matrix)) > 0;
  const indexStart=group.indices.length;
  for (let i = 0; i < indices.length; i += 3) group.indices.push(remapped[indices[i]], remapped[indices[i + (reverse ? 2 : 1)]], remapped[indices[i + (reverse ? 1 : 2)]]);
  group.sourceParts.push({ name, sourceTriangles: indices.length / 3, bounds, indexStart });
}
// The source tire primitive contains all four wheels. Partition its vertices
// by axle/side; only whitelisted source objects receive rolling metadata.
const wheelBounds = Array.from({ length: 4 }, emptyBounds), tireVertices = groups.get('Wheel1Mtl|rolling').vertices;
for (let i = 0; i < tireVertices.length; i += 8) include(wheelBounds[(tireVertices[i] > 0 ? 2 : 0) + (tireVertices[i + 1] > 0 ? 1 : 0)], tireVertices.slice(i, i + 3));
const wheelCenters = wheelBounds.map((bounds, i) => ({ name: `source-tire-${i}`, center: bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2), radius: (bounds.max[2] - bounds.min[2]) / 2, axle:i<2?'rear':'front',side:i%2?1:-1,axis: [0, 1, 0], bounds }));
for(const [key,group] of [...groups]) {
  if(!group.rolling){group.sourceParts=group.sourceParts.map(({indexStart,...p})=>p);continue;}
  groups.delete(key);
  const sections=wheelCenters.map(wheel=>({...group,wheel,indices:[],sourceParts:[]}));
  for(const part of group.sourceParts){
    const partSections=wheelCenters.map(()=>({name:part.name,sourceTriangles:0,bounds:emptyBounds()}));
    for(let i=part.indexStart;i<part.indexStart+part.sourceTriangles*3;i+=3){
      const vertex=group.indices[i]*8,wi=(group.vertices[vertex]>0?2:0)+(group.vertices[vertex+1]>0?1:0);
      const section=sections[wi],p=partSections[wi];p.sourceTriangles++;
      for(let j=0;j<3;j++){const index=group.indices[i+j];section.indices.push(index);include(p.bounds,group.vertices.slice(index*8,index*8+3));}
    }
    partSections.forEach((p,i)=>{if(p.sourceTriangles)sections[i].sourceParts.push(p);});
  }
  sections.forEach((s,i)=>{if(s.indices.length)groups.set(key+'|'+i,s);});
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
    const vertices = Float32Array.from(group.vertices), original = Uint32Array.from(group.indices), name = group.material.getName();
    let indices = original, error = 0;
    const paint = name === 'Paint1Mtl', tire = /^(Wheel1|Wheel0031)Mtl$/.test(name), glass = /^Wind/.test(name);
    const engine = /^Meshes2017ToyotaGt86engines/.test(name), mixedDark = /^Wheel00[45]1Mtl$/.test(name);
    const badge = name === 'Bumprearok0011Mtl' || name === 'Meshesgr86fbumper51Mtl';
    if (!badge && !(paint && !fallback) && original.length > 120) {
      const ratio = fallback ? paint ? .3 : tire ? .5 : glass ? .2 : engine ? .025 : mixedDark ? .035 : .1
        : tire || glass ? 1 : engine ? .25 : mixedDark ? .48 : .7;
      const target = Math.max(36, Math.floor(original.length * ratio / 3) * 3);
      const textured = !!group.material.getBaseColorTexture(), stride = textured && !fallback ? 5 : 3;
      const attributes = new Float32Array(vertices.length / 8 * stride);
      for (let i = 0; i < vertices.length / 8; i++) attributes.set(vertices.subarray(i * 8 + 3, i * 8 + 3 + stride), i * stride);
      const weights = stride === 5 ? [.5, .5, .5, .15, .15] : [.5, .5, .5];
      const tolerance = fallback ? engine ? .035 : mixedDark ? .012 : .006 : .0015;
      let locked = null;
      if (fallback && (paint || name === 'Body0451Mtl')) {
        // Original red hood and its black inner skin are nearly coincident.
        // Independent approximation makes the inner skin poke through even
        // with a small global surface error. Preserve both source layers here.
        locked = new Uint8Array(vertices.length / 8);
        for (let i = 0; i < locked.length; i++) if (vertices[i * 8] > .55 && vertices[i * 8 + 2] > .6 && Math.abs(vertices[i * 8 + 1]) < .72) locked[i] = 1;
      }
      [indices, error] = MeshoptSimplifier.simplifyWithAttributes(original, vertices, 8, attributes, stride, weights, locked, target, tolerance, fallback && paint ? ['Permissive', 'LockBorder'] : ['Permissive']);
    }
    if (!indices.length) continue;
    if (fallback) {
      // Preserve source normals, and orient any reduced tiny triangle toward
      // them. No spatial clustering or geometry from another vehicle is used.
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 8, b = indices[i + 1] * 8, c = indices[i + 2] * 8;
        const ab = [vertices[b] - vertices[a], vertices[b + 1] - vertices[a + 1], vertices[b + 2] - vertices[a + 2]];
        const ac = [vertices[c] - vertices[a], vertices[c + 1] - vertices[a + 1], vertices[c + 2] - vertices[a + 2]];
        const cross = vec3.cross([], ab, ac);
        if (cross.reduce((sum, value, axis) => sum + value * (vertices[a + 3 + axis] + vertices[b + 3 + axis] + vertices[c + 3 + axis]), 0) < 0) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      }
    }
    const g = compact(vertices, indices), packed = g.vertices.length / 8 < 65536 ? Uint16Array.from(g.indices) : g.indices;
    output.push({ ...appearance(group, fallback), name: group.sourceParts.map(p => p.name).join(' | '), sourceParts: group.sourceParts,
      bounds: g.bounds, triangles: indices.length / 3, sourceTriangles: original.length / 3, simplificationError: error,
      vertices: b64(g.vertices), indices: b64(packed), indexType: packed.BYTES_PER_ELEMENT });
  }
  const floor = Math.min(...output.map(p => p.bounds.min[2]));
  for (const p of output) {
    const bytes = Buffer.from(p.vertices, 'base64'), vertices = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    for (let i = 2; i < vertices.length; i += 8) vertices[i] -= floor;
    p.vertices = b64(vertices); p.bounds.min[2] -= floor; p.bounds.max[2] -= floor;
    if(p.wheel)p.wheel={...p.wheel,center:p.wheel.center.map((v,i)=>i===2?v-floor:v)};
    p.groundShiftM = floor;
  }
  return output;
}
const primitives = convert(false), fallbackPrimitives = convert(true);
const triangles = primitives.reduce((n, p) => n + p.triangles, 0), fallbackTriangles = fallbackPrimitives.reduce((n, p) => n + p.triangles, 0);
const bounds = emptyBounds(); for (const p of primitives) { include(bounds, p.bounds.min); include(bounds, p.bounds.max); }
assert(triangles > 80000 && triangles <= 200000, `Main triangle budget: ${triangles}`);
assert(fallbackTriangles > 10000 && fallbackTriangles <= 40000, `Fallback triangle budget: ${fallbackTriangles}`);
assert(Math.abs(bounds.min[2]) < .00001);
const source = {
  kind: 'community-mesh', label: 'Toyota GR86 ZN8 · Mona x Supercars 커뮤니티 외관',
  author: 'Mona x Supercars', authorUrl: 'https://sketchfab.com/Car2022',
  url: 'https://sketchfab.com/3d-models/toyota-gr86-zn8-4919d14eba9640599e838230e8e5ed74',
  license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  configuration: '2023 Toyota GR86 ZN8 coupe exterior. Remappable factory-paint material, original GR badges, cabin and ADVAN Racing RS wheel artwork. The community wheels are not an exact factory RZ wheel match.',
  attribution: 'Toyota GR86 (ZN8) by Mona x Supercars (Car2022), CC BY 4.0. Original wheel texture also credits Kazutoshi Mods. Mesh simplified and adapted for WebSim; see gr86-source.json and gr86-LICENSE.txt.',
  sha256: expectedHash
};
const payload = { id: 'gr86', source, bounds, triangles, primitives, textures, fallbackTriangles, fallbackPrimitives, wheelCenters, wheelAnimation: 'separate-source-wheel-primitives', coordinateTransform: { worldToRuntime: ['-X', '-Z', '+Y'], handednessCorrectedForRenderer: true, windingCorrected: true, rigidPitchCorrectionRadians: -sourcePitch } };
const runtime = '/* Toyota GR86 (ZN8) by Mona x Supercars (Car2022), CC BY 4.0.\n * Wheel texture also credits Kazutoshi Mods. Simplified for WebSim. See gr86-source.json and gr86-LICENSE.txt. */\n' +
  `ManufacturerModels.registerCompressed(${JSON.stringify(gzipSync(JSON.stringify(payload), { level: 9 }).toString('base64'))});\n`;
fs.writeFileSync(path.join(folder, 'gr86-runtime.js'), runtime);
const summarize = ({ vertices, indices, ...p }) => p;
const summary = { ...payload, sourceBounds, leveledSourceBounds, scale, runtimeBytes: Buffer.byteLength(runtime), textures: textureInfo,
  validation: { finiteVertices: true, validIndices: true, groundZero: true, frontPositiveX: true, upPositiveZ: true, sourceRepeatSamplingPreserved: true },
  primitives: primitives.map(summarize), fallbackPrimitives: fallbackPrimitives.map(summarize) };
fs.writeFileSync(path.join(folder, 'gr86-runtime-summary.json'), JSON.stringify(summary, null, 2) + '\n');
const changes = [
  'Applied source node transforms and [world -X, -Z, +Y] to match the renderer forward/up/screen-right convention; corrected reflected normals and winding. Uniformly scaled the visible original body to 4.265 m and tire ground zero; retained original proportions.',
  `Rigidly rotated the entire original mesh and normals by ${(-sourcePitch * 180 / Math.PI).toFixed(6)} degrees around the lateral axis, leveling the source front/rear tire centers (original front tires were about 28 mm higher). No part-specific stretching, replacement wheels or body reshaping.`,
  'Excluded only source materials with exactly zero BLEND opacity: Paint2Mtl duplicate body (35,108 triangles) and Cupper1Mtl (96 triangles). No opaque source vehicle parts were substituted or excluded.',
  'Dropped unused UVs from untextured geometry, welded equivalent position/normal/UV vertices, and joined draw fragments by material.',
  'Retained every original opaque painted-body triangle in the main model; other main parts use indexed topology-, normal- and texture-coordinate-aware Meshopt simplification. The separate fallback uses normal-aware simplification with extra painted-body, tire and glass budget, never spatial clustering. Locked the original hood and its closely spaced black inner-skin vertices, and preserved painted-panel borders, in the fallback to prevent those layers from intersecting or seams opening.',
  'Converted linear glTF base factors to display-space colors. Marked only the original Paint1Mtl body as remappable factory paint; glass alpha, badging and lamp colors remain separate. Factory palette RGB/finish values are digital display approximations.',
  'Embedded visible base-color PNGs byte-for-byte, deduplicating identical engine texture bytes; retained source REPEAT UV sampling. Unused normal, metallic/roughness, emissive and invisible-material images are omitted under the existing renderer contract. No raster editing or generated images.',
  'Approximated fallback textured colors by sampling each original material at its source UVs. Packed a local gzip JavaScript payload.',
  'Separated only inspected original tire/rim objects Object_40 through Object_46 into four rolling-wheel primitives, retaining model-local centers and radii. Body, brake and engine objects remain stationary; no replacement geometry was generated.'
];
const provenanceNotes = [
  'The downloaded GLB and current public Sketchfab API identify Mona x Supercars (Car2022), this exact model ID and CC BY 4.0. No explicit game-extraction declaration or additional restrictive terms were found in those model metadata fields.',
  'The original wheel texture visibly contains the additional credit Kazutoshi Mods and ADVAN Racing RS artwork; those bytes and this credit are retained. The upload does not explain the licensing history of that component, so sole authorship by the uploader is not asserted.',
  'The source lamp atlas contains BMW Adaptive LED text and two engine materials retain Meshes2017ToyotaGt86engines names. These indicate reused component resources but do not by themselves establish a specific game source or a conflicting license.',
  'The separately downloaded original ZIP contains OBJ, MTL and PNG resources. Its OBJ header says This file is brought to you by Roblox Corporation / Generated by Roblox Studio. This is an exporter header, not proof of a specific game extraction; no separate license, restrictive notice or original-author URL was found in that archive.',
  'The appearance is a community GR86 exterior with aftermarket wheel artwork, not official Toyota CAD or an exact Japanese-market RZ configuration. Manufacturer dimensions are used only for uniform scale; source geometry is not stretched to match a specification box.'
];
const provenance = {
  id: 'gr86', title: 'Toyota GR86 (ZN8)', author: source.author, authorUrl: source.authorUrl,
  sourceUrl: source.url, license: source.license, licenseUrl: source.licenseUrl, manufacturerOfficial: false,
  verifiedDate: '2026-10-19', configuration: { generation: 'ZN8', modelYear: 2023, exterior: source.configuration }, provenanceNotes,
  additionalEmbeddedCredits: [{ name: 'Kazutoshi Mods', location: 'Wheel0081Mtl base-color texture', originalImageIndex: 21 }],
  download: { method: 'Normal Sketchfab download after user sign-in. No viewer extraction or authentication bypass.', sourcePage: source.url,
    files: [{ name: 'source.glb', bytes: input.length, sha256: expectedHash }, { name: 'original.zip', bytes: 48513077, sha256: 'd9387215bf32e97a9d5468c3a7c5c3ca6bf9584bc30bf1bc33b76360ec1fa18e', contents: 'source/2023 Toyota GR86.zip containing OBJ, MTL and PNG files', observedExporter: 'Roblox Studio' }], embeddedAttribution: sourceJson.asset.extras },
  sourceGeometry: { downloadedTriangles: sourceTriangles, visibleTriangles: visibleSourceTriangles, downloadedMeshes: sourceJson.meshes.length, downloadedMaterials: sourceJson.materials.length, downloadedImages: sourceJson.images.length, excluded },
  conversion: { builder: 'build-free-gr86.mjs', changes, geometryAdded: false, mainPaintGeometryPreserved: true, otherGeometrySimplified: true, sourceParts: parts.length,
    triangles, fallbackTriangles, drawGroups: primitives.length, fallbackDrawGroups: fallbackPrimitives.length, runtimeBytes: summary.runtimeBytes, scale, bounds, textures: textureInfo },
  attribution: source.attribution
};
fs.writeFileSync(path.join(folder, 'gr86-source.json'), JSON.stringify(provenance, null, 2) + '\n');
fs.writeFileSync(path.join(folder, 'gr86-LICENSE.txt'), `Toyota GR86 (ZN8) — Mona x Supercars (Car2022)\n\nOriginal model: ${source.url}\nCreator: ${source.authorUrl}\n\nLicensed by the uploader under Creative Commons Attribution 4.0 International (CC-BY-4.0).\nLicense: ${source.licenseUrl}\nLegal code: https://creativecommons.org/licenses/by/4.0/legalcode.en\n\nThe public model metadata and downloaded GLB identify this author, source\nand license. Verified 2026-10-19. Keep the attribution, license link and\nchange notice with redistributed copies. No endorsement by Toyota or the\ncreators is implied. This is a community model, not official manufacturer CAD.\n\nAdditional embedded credit: Kazutoshi Mods (original ADVAN Racing RS wheel texture).\nThe uploader's sole authorship of reused component resources is not asserted.\n${provenanceNotes.map(n => '- ' + n).join('\n')}\n\nAcquired through the normal Sketchfab download after user sign-in.\nInput: source.glb (${input.length} bytes)\nSHA-256: ${expectedHash}\nOriginal ZIP: 48513077 bytes\nOriginal ZIP SHA-256: d9387215bf32e97a9d5468c3a7c5c3ca6bf9584bc30bf1bc33b76360ec1fa18e\n\nWebSim modifications:\n${changes.map(c => '- ' + c).join('\n')}\n\nSee gr86-source.json, gr86-runtime-summary.json and build-free-gr86.mjs\nfor provenance and reproducible processing.\n`);
console.log(JSON.stringify({ id: payload.id, triangles, fallbackTriangles, drawGroups: primitives.length, runtimeBytes: summary.runtimeBytes, bounds, textures: textures.length, wheelCenters }));
