/** Deterministic conversion of Manuel Contento's CC BY 4.0 BMW M2.
 * Run from the repository root: node evolving_vehicles_2/assets/models/build-free-bmw-m2.mjs [source.glb] [output-folder]
 * Input is the normal signed-in Sketchfab GLB download with 1k textures.
 * No network, raster editing or generative processing.
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
const assetFolder = path.dirname(fileURLToPath(import.meta.url));
const folder = path.resolve(process.argv[3] || assetFolder);
fs.mkdirSync(folder, { recursive: true });
const filename = path.resolve(process.argv[2] || 'output/model-finish-qa/bmw-m2-original-1k.glb');
const expectedHash = 'e4d9445c333acfe70ed8aaaa800b1c79a60d1702cdc2db0bdffc5124450aff0e';
// BMW documents the factory paint name/code, not an exact display RGB value.
// This fixed RGB is a visual approximation under the existing metallic shader.
const stockPaint = {
  name: 'Long Beach Blue Metallic', code: 'C16', displayHex: '#167fa7',
  color: [22 / 255, 127 / 255, 167 / 255], renderApproximation: true,
  sourceUrl: 'https://www.press.bmwgroup.com/usa/article/detail/T0238507EN_US/the-all-new-2016-bmw-m2',
  codeSourceUrl: 'https://www.bmw.ie/content/dam/bmw/marketIE/bmw_ie/pdf/BMWM2Coup%C3%A9_F87_201707.pdf.asset.1550226992546.pdf'
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const input = fs.readFileSync(filename);
assert.equal(sha256(input), expectedHash, 'Unexpected BMW M2 source');
const sourceJson = JSON.parse(input.subarray(20, 20 + input.readUInt32LE(12)).toString());
assert.match(sourceJson.asset.extras.author, /Manuel Contento/);
assert.match(sourceJson.asset.extras.license, /CC-BY-4\.0/);
assert.match(sourceJson.asset.extras.source, /394feedd0a0742c595917c7b0f6edcad$/);
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
    // getElement also handles normalized accessors without changing their units.
    include(sourceBounds, vec3.transformMat4([], positions.getElement(i, []), node.getWorldMatrix()));
  }
}
const scale = 4.468 / (sourceBounds.max[2] - sourceBounds.min[2]);
const center = [(sourceBounds.min[0] + sourceBounds.max[0]) / 2, sourceBounds.min[1], (sourceBounds.min[2] + sourceBounds.max[2]) / 2];
// Renderer rear-screen right is runtime +Y. Source world -X is that side:
// the original rear m6 badge is there, matching BMW's official rear layout.
const canonical = p => [(p[2] - center[2]) * scale, -(p[0] - center[0]) * scale, (p[1] - center[1]) * scale];
const wheelBounds = Array.from({ length: 4 }, emptyBounds);
for (const { node, primitive, name } of parts) if (/^Rim/.test(name)) {
  const positions = primitive.getAttribute('POSITION');
  for (let i = 0; i < positions.getCount(); i++) {
    const p = canonical(vec3.transformMat4([], positions.getElement(i, []), node.getWorldMatrix()));
    include(wheelBounds[(p[0] > 0 ? 2 : 0) + (p[1] > 0 ? 1 : 0)], p);
  }
}
const wheelCenters = wheelBounds.map((bounds, i) => ({
  center: bounds.min.map((v, axis) => (v + bounds.max[axis]) / 2),
  radius: (bounds.max[2] - bounds.min[2]) / 2, axle: i > 1 ? 'front' : 'rear', side: i % 2 ? 1 : -1
}));
// Source planar disc normals have their dominant axis at 18.5 degrees on both
// front wheels. Undo that baked steering pose as a rigid rotation, including
// stationary calipers and the separate hub roundels, without reshaping parts.
const sourceSteeringRadians = 18.5 * Math.PI / 180;
function wheelIndex(p) { return (p[0] > 0 ? 2 : 0) + (p[1] > 0 ? 1 : 0); }
function neutralize(p, n, wheel) {
  if (wheel.axle !== 'front') return;
  const a = sourceSteeringRadians, c = Math.cos(a), s = Math.sin(a);
  const x = p[0] - wheel.center[0], y = p[1] - wheel.center[1];
  p[0] = wheel.center[0] + x*c-y*s; p[1] = wheel.center[1]+x*s+y*c;
  const nx = n[0]; n[0] = nx*c-n[1]*s; n[1] = nx*s+n[1]*c;
}
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
      material: 0, paint: true, textureOpaque: true };
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
function geometry(primitive, matrix, fallback, name, selectedIndices) {
  const positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL');
  const ti = primitive.getMaterial().getBaseColorTextureInfo(), transform = ti?.getExtension('KHR_texture_transform');
  const uv = primitive.getAttribute('TEXCOORD_' + (transform?.getTexCoord() ?? ti?.getTexCoord() ?? 0));
  assert(normals && uv, 'Required source normals/UVs missing');
  const uvScale = transform?.getScale() || [1, 1], offset = transform?.getOffset() || [0, 0], angle = transform?.getRotation() || 0;
  let vertices = new Float32Array(positions.getCount() * 8);
  const normalMatrix = mat3.normalFromMat4(mat3.create(), matrix);
  for (let i = 0; i < positions.getCount(); i++) {
    const p = vec3.transformMat4([], positions.getElement(i, []), matrix);
    const n = vec3.normalize([], vec3.transformMat3([], normals.getElement(i, []), normalMatrix));
    // [Z,-X,Y] is reflected to match the renderer; normals and winding follow.
    const position = canonical(p), normal = [n[2], -n[0], n[1]];
    if (/^Rim/.test(name) || /^(BMW_LOGO6|BMW_LOGO1)$/.test(name)) neutralize(position, normal, wheelCenters[wheelIndex(position)]);
    vertices.set([...position, ...normal], i * 8);
    const coord = uv.getElement(i, []), u = coord[0] * uvScale[0], v = coord[1] * uvScale[1];
    vertices[i * 8 + 6] = offset[0] + Math.cos(angle) * u - Math.sin(angle) * v;
    vertices[i * 8 + 7] = offset[1] + Math.sin(angle) * u + Math.cos(angle) * v;
  }
  let indices = Uint32Array.from(selectedIndices || primitive.getIndices().getArray());
  if (mat3.determinant(mat3.fromMat4(mat3.create(), matrix)) > 0) {
    for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
  }
  const body = name === 'Livery', badge = /^BMW_LOGO|^m[56]$/.test(name), wheel = /^Rim/.test(name);
  if(body){
    // Body paint no longer samples the stripe atlas. Merge its UV-only seams
    // before reduction so preserving true geometric borders does not lock
    // invisible texture chart boundaries in the original 200k-triangle shell.
    const keys=new Map(),remap=new Uint32Array(vertices.length/8),joined=[];
    for(let i=0;i<remap.length;i++){
      const v=Array.from(vertices.subarray(i*8,i*8+8));v[6]=v[7]=0;
      const key=v.slice(0,6).map(x=>x.toFixed(6)).join(',');
      if(!keys.has(key)){keys.set(key,joined.length/8);joined.push(...v);}
      remap[i]=keys.get(key);
    }
    vertices=Float32Array.from(joined);indices=Uint32Array.from(indices,i=>remap[i]);
  }
  if ((fallback || !body && !badge) && indices.length > 120) {
    const ratio = fallback ? body ? .10 : wheel ? .03 : badge ? .35 : .06 : wheel ? .12 : .15;
    const target = Math.max(36, Math.floor(indices.length * ratio / 3) * 3);
    const stride = fallback ? 3 : 5, attributes = new Float32Array(vertices.length/8 * stride);
    for (let i = 0; i < vertices.length/8; i++) attributes.set(vertices.subarray(i * 8 + 3, i * 8 + 3 + stride), i * stride);
    [indices] = MeshoptSimplifier.simplifyWithAttributes(indices, vertices, 8, attributes, stride,
      fallback ? [.3,.3,.3] : [.7,.7,.7,.15,.15], null, target, fallback ? .006 : .001, body ? ['Permissive','LockBorder'] : ['Permissive']);
    if (!indices.length) return null;
  }
  if (fallback) {
    // Keep source smooth normals and correct only reduced face winding.
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
    const sections = new Map(), wheelPart = /^Rim/.test(name) || /^(BMW_LOGO6|BMW_LOGO1|BMW_LOGO2)$/.test(name);
    if (wheelPart) {
      const positions = primitive.getAttribute('POSITION'), uv = primitive.getAttribute('TEXCOORD_0'), indices = primitive.getIndices().getArray();
      for (let i=0;i<indices.length;i+=3) {
        const p=canonical(vec3.transformMat4([],positions.getElement(indices[i],[]),node.getWorldMatrix())), wi=wheelIndex(p);
        // The creator's atlas has the blue brake-caliper islands entirely in
        // the lower-right UV square. They steer with the assembly, but do not roll.
        const caliper=/^Rim/.test(name)&&[0,1,2].every(j=>{const t=uv.getElement(indices[i+j],[]);return t[0]>.8&&t[1]>.8;});
        const key=wi+'|'+(caliper?'caliper':'wheel');
        if(!sections.has(key))sections.set(key,{indices:[],wi,caliper});
        sections.get(key).indices.push(indices[i],indices[i+1],indices[i+2]);
      }
    } else sections.set('body',{indices:null});
    for(const section of sections.values()) {
    const visual = appearance(primitive, name, fallback);
    if(section.wi!==undefined) {
      if(section.caliper)visual.role='stationary-brake-caliper';
      else visual.wheel=wheelCenters[section.wi];
    }
    const g = geometry(primitive, node.getWorldMatrix(), fallback, name, section.indices);
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
    const visual={...g.visual};
    if(visual.wheel)visual.wheel={...visual.wheel,center:visual.wheel.center.map((v,i)=>i===2?v-floor:v)};
    return { ...visual, name: g.parts.map(p => p.name).join(' | '), sourceParts: g.parts, bounds: g.bounds, triangles: size / 3, vertices: b64(vertices), indices: b64(indices), indexType: indices.BYTES_PER_ELEMENT };
  });
}
const primitives = convert(), fallbackPrimitives = convert(true);
const triangles = primitives.reduce((n, p) => n + p.triangles, 0), fallbackTriangles = fallbackPrimitives.reduce((n, p) => n + p.triangles, 0);
const bounds = emptyBounds(); for (const p of primitives) { include(bounds, p.bounds.min); include(bounds, p.bounds.max); }
assert(triangles > 200000 && triangles <= 350000, `Main triangle budget: ${triangles}`);
assert(fallbackTriangles > 10000 && fallbackTriangles <= 65000, `Fallback triangle budget: ${fallbackTriangles}`);
assert(Math.abs(bounds.min[2]) < .00001);
assert(Math.abs(bounds.max[0] - bounds.min[0] - 4.468) < .00001);
assert(primitives.filter(p => p.materialName === 'MAT_FRONTLIGHT').every(p => p.bounds.min[0] > 1.6));
assert(primitives.filter(p => p.materialName === 'MAT_BACKLIGHT').every(p => p.bounds.max[0] < -1.7));
const source = {
  kind: 'community-mesh', label: 'BMW M2 F87 · Manuel Contento 커뮤니티 외관',
  author: 'Manuel Contento', authorUrl: 'https://sketchfab.com/manuelcontento',
  url: 'https://sketchfab.com/3d-models/bmw-m2-394feedd0a0742c595917c7b0f6edcad',
  license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  configuration: 'Original F87 M2 / N55, 2016–2017 pre-LCI exterior. Not M2 Competition. Body stripes removed with a separate remappable factory-paint material; digital paint approximation. Original baked front-wheel steering neutralized.',
  stockPaint,
  attribution: 'BMW M2 by Manuel Contento, CC BY 4.0. Normal original Sketchfab download, adapted for WebSim; see bmw_m2-source.json and bmw_m2-LICENSE.txt.',
  downloadUrl: 'https://sketchfab.com/3d-models/bmw-m2-394feedd0a0742c595917c7b0f6edcad#download',
  sha256: expectedHash
};
const payload = { id: 'bmw_m2', source, bounds, triangles, primitives, textures, fallbackTriangles, fallbackPrimitives, wheelCenters, wheelAnimation:'separate-source-wheel-primitives', sourceSteeringRadians,coordinateTransform:{worldToRuntime:['+Z','-X','+Y'],handednessCorrectedForRenderer:true,windingCorrected:true} };
const runtime = '/* BMW M2 by Manuel Contento, CC BY 4.0. See bmw_m2-source.json and bmw_m2-LICENSE.txt.\n * Body stripes replaced with Long Beach Blue (C16) material; badges and detail textures retained. */\n' +
  `ManufacturerModels.registerCompressed(${JSON.stringify(gzipSync(JSON.stringify(payload), { level: 9 }).toString('base64'))});\n`;
fs.writeFileSync(path.join(folder, 'bmw_m2-runtime.js'), runtime);
const summarize = ({ vertices, indices, ...p }) => p;
const summary = { ...payload, sourceBounds, scale, runtimeBytes: Buffer.byteLength(runtime), textures: textureInfo,
  validation: { finiteVertices: true, validIndices: true, normalizedQuantizedAttributesDecoded: true, groundZero: true, headlampsPositiveX: true, taillampsNegativeX: true },
  primitives: primitives.map(summarize), fallbackPrimitives: fallbackPrimitives.map(summarize) };
fs.writeFileSync(path.join(folder, 'bmw_m2-runtime-summary.json'), JSON.stringify(summary, null, 2) + '\n');
const provenancePath = path.join(folder, 'bmw_m2-source.json');
const provenance = JSON.parse(fs.readFileSync(path.join(assetFolder,'bmw_m2-source.json'), 'utf8'));
provenance.attribution=source.attribution;
if(!provenance.previousMirrorDownload)provenance.previousMirrorDownload=provenance.download;
provenance.download={url:source.downloadUrl,method:'Normal signed-in Sketchfab Download 3D Model → GLB 1k. Geometry matches the separately downloaded 4k GLB; the original download, not the previously simplified mirror, is used.',files:[{path:'bmw-m2-original-1k.glb',bytes:input.length,sha256:expectedHash}],embeddedAttribution:sourceJson.asset.extras};
provenance.configuration.visualCaveat='Community F87 exterior; source shape and smooth normals retained. Body stripes detached as a 3D material edit. Paint RGB and shader properties are display approximations. Front wheels rigidly aligned from their original parked steering pose.';
provenance.configuration.stockPaint=stockPaint;
provenance.sourceGeometry={originalCreatorTriangles:678052,downloadedTriangles:677668,downloadedMeshes:78,downloadedMaterials:7,downloadedImages:21,requiredExtensions:[]};
provenance.conversion.changes=[
 'Replaced the previously simplified public mirror with the creator’s normally downloaded Sketchfab GLB, preserving embedded CC BY attribution.',
 'Applied original node transforms and reflected [world +Z, -X, +Y] into runtime forward/up/screen-right coordinates, with matching normal/winding correction. Uniformly scaled to 4.468m length and tire ground zero. Front and rear M2 badge positions follow the original model and BMW reference.',
 'Preserved all 199,724 original painted-body triangles and source normals in the main model. Other components use Meshopt topology-, normal- and UV-aware simplification; fallback uses the same method and protected body borders. No sloppy spatial clustering.',
 'Removed body stripes with a remappable paint-only material while retaining BMW roundels, lamps, glass, grille and all original detail texture bytes.',
 'Rigidly neutralized the source 18.5 degree front-wheel steering, including hub badges and brake assemblies. Split four rolling wheel groups and kept brake calipers stationary, using their distinct source UV islands.',
 'Embedded only the six unedited 1k base-color images from the normal download; omitted unused normal/roughness maps under the renderer contract.',
 'Paint names/codes are in vehicle-paints.js; rendered RGB, roughness and clearcoat are explicitly approximate.'
];
Object.assign(provenance.conversion, { triangles, fallbackTriangles, drawGroups: primitives.length, fallbackDrawGroups: fallbackPrimitives.length, runtimeBytes: summary.runtimeBytes, sourceParts: parts.length, scale, bounds, textures: textureInfo });
fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
fs.writeFileSync(path.join(folder,'bmw_m2-LICENSE.txt'),`BMW M2 — Manuel Contento\n\nCreator: ${source.authorUrl}\nOriginal model: ${source.url}\nLicensed CC-BY-4.0: ${source.licenseUrl}\nLegal code: https://creativecommons.org/licenses/by/4.0/legalcode.en\n\nAcquired through the normal Sketchfab Download 3D Model UI after sign-in.\nOriginal GLB 1k: ${input.length} bytes\nSHA-256: ${expectedHash}\nThe separately preserved original GLB 4k has SHA-256 01b676e42e1f6385c8541ae4f8a63f5f1db7d64327f1a4fd3d2e2d3a19c8b524.\n\nThe creator describes personal high-poly modeling practice in Autodesk Maya\nand Substance Painter. This is a community model, not official BMW CAD.\nNo creator or manufacturer endorsement is implied. Retain attribution,\nlicense link and this change notice with redistributed copies.\n\nWebSim modifications:\n${provenance.conversion.changes.map(c=>'- '+c).join('\n')}\n\nPrevious releases used the processed pedrosoandre/carros mirror; its fixed\ncommit and hash remain in bmw_m2-source.json as historical provenance only.\n`);
console.log(JSON.stringify({ id: payload.id, triangles, fallbackTriangles, drawGroups: primitives.length, fallbackDrawGroups: fallbackPrimitives.length, runtimeBytes: summary.runtimeBytes, bounds, textureCount: textures.length }));
