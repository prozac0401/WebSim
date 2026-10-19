const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const folder = path.join(__dirname, 'assets/models');
const runtime = fs.readFileSync(path.join(folder, 'avante_n-runtime.js'), 'utf8');
const source = JSON.parse(fs.readFileSync(path.join(folder, 'avante_n-source.json')));
const summary = JSON.parse(fs.readFileSync(path.join(folder, 'avante_n-runtime-summary.json')));
let model;
vm.runInNewContext(runtime, { ManufacturerModels: { registerCompressed(data) { model = JSON.parse(gunzipSync(Buffer.from(data, 'base64'))); } } });
function decode(text, Type) {
  const b = Buffer.from(text, 'base64');
  return new Type(b.buffer, b.byteOffset, b.byteLength / Type.BYTES_PER_ELEMENT);
}
const part = (primitives, name) => primitives.find(p => p.materialName.endsWith('_' + name));

test('CN7 N carries the exact downloaded creator, model ID, CC BY license and file hash', () => {
  assert.equal(model.id, 'avante_n');
  assert.equal(model.source.kind, 'community-mesh');
  assert.equal(model.source.author, 'tonielpro520');
  assert.equal(model.source.author, source.author);
  assert.match(model.source.url, /cd5741852515425aa3c058b7e081dd2c$/);
  assert.equal(model.source.url, source.sourceUrl);
  assert.equal(model.source.license, 'CC BY 4.0');
  assert.equal(model.source.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(source.manufacturerOfficial, false);
  assert.equal(source.download.files[0].sha256, 'c614c473220709478794b641eea76f49047b1f8338b27300a8d33eb65ff289b5');
  assert.equal(model.source.sha256, source.download.files[0].sha256);
  assert.equal(source.download.files[0].bytes, 51701716);
  assert.match(source.download.embeddedAttribution.license, /CC-BY-4\.0/);
  assert.match(source.download.method, /Normal Sketchfab download/);
  assert.match(model.source.configuration, /2022.*CN7 pre-facelift/);
  assert.match(model.source.configuration, /Not N Line or TCR/);
  const license = fs.readFileSync(path.join(folder, 'avante_n-LICENSE.txt'), 'utf8');
  for (const text of ['tonielpro520', 'CC-BY-4.0', model.source.url, model.source.sha256, 'WebSim modifications']) assert(license.includes(text));
});

test('CN7 N fits runtime budgets and accounts for every source material and part', () => {
  assert.equal(source.sourceGeometry.downloadedTriangles, 500248);
  assert.equal(source.sourceGeometry.downloadedMeshes, 169);
  assert.equal(model.primitives.length, 25);
  assert.equal(model.fallbackPrimitives.length, 25);
  assert.equal(model.primitives.flatMap(p => p.sourceParts).length, 169);
  assert.equal(model.primitives.reduce((sum, p) => sum + p.sourceTriangles, 0), 500248);
  assert(model.primitives.every(p => p.sourceParts.reduce((sum, s) => sum + s.sourceTriangles, 0) === p.sourceTriangles));
  assert(model.triangles >= 180000 && model.triangles <= 250000);
  assert(model.fallbackTriangles >= 20000 && model.fallbackTriangles <= 30000);
  assert(part(model.fallbackPrimitives, 'Ceramic_White').triangles >= 5000);
  assert(part(model.fallbackPrimitives, 'Tires').triangles >= 1000);
  assert.equal(source.conversion.geometryAdded, false);
  assert.equal(source.conversion.fullBodySimplifiedByWebSim, true);
  assert(Buffer.byteLength(runtime) < 10 * 1024 * 1024);
  for (const key of ['triangles', 'fallbackTriangles']) {
    assert.equal(model[key], source.conversion[key]);
    assert.equal(model[key], summary[key]);
  }
  assert.equal(Buffer.byteLength(runtime), summary.runtimeBytes);
  assert.equal(summary.runtimeBytes, source.conversion.runtimeBytes);
});

test('CN7 N preserves white body, red N trim, glazing alpha and the exact original plate texture', () => {
  assert.equal(model.textures.length, 1);
  const bytes = Buffer.from(model.textures[0].split(',')[1], 'base64');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'd02541b7d32bb25f501faa8c09c90b653989d88c523b8b627bed805df0e82d73');
  assert.equal(bytes.length, 114499);
  assert.equal(summary.textures[0].width, 2048); assert.equal(summary.textures[0].height, 1024);
  const paint = part(model.primitives, 'Ceramic_White'), red = part(model.primitives, 'RedBadges');
  assert.equal(paint.material, 0); assert.equal(paint.paint, false);
  assert(paint.color.every(c => c > .8 && c < .9));
  assert.equal(paint.textureIndex, undefined);
  assert(red.color[0] > .7 && red.color[1] === 0 && red.color[2] === 0);
  assert(red.bounds.min[0] < -2.3 && red.bounds.max[0] > 2.3, 'Front and rear red accents survive');
  for (const name of ['Windows', 'HeadLightsGlass', 'BrakeLightsGlass', 'RedMainGlass']) {
    const p = part(model.primitives, name);
    assert.equal(p.material, 1); assert(p.alpha > .5 && p.alpha < .75);
  }
  assert(model.primitives.filter(p => Number.isInteger(p.textureIndex)).every(p => p.materialName === 'Philippine_License_Plate_Recovered'));
  assert(model.fallbackPrimitives.every(p => p.textureIndex === undefined));
});

for (const [name, primitives, count] of [['main', model.primitives, model.triangles], ['fallback', model.fallbackPrimitives, model.fallbackTriangles]]) {
  test(`CN7 N ${name} has finite geometry, valid integer indices, unit normals and ground zero`, () => {
    let total = 0, lowest = Infinity, reversed = 0, nondegenerate = 0;
    for (const p of primitives) {
      assert(p.indexType === 2 || p.indexType === 4);
      const v = decode(p.vertices, Float32Array), indices = decode(p.indices, p.indexType === 2 ? Uint16Array : Uint32Array);
      assert.equal(v.length % 8, 0); assert.equal(indices.length, p.triangles * 3); total += p.triangles;
      for (const value of v) assert(Number.isFinite(value));
      for (const index of indices) assert(Number.isInteger(index) && index < v.length / 8);
      for (let i = 0; i < v.length; i += 8) {
        assert(Math.abs(Math.hypot(v[i + 3], v[i + 4], v[i + 5]) - 1) < .00001, p.materialName);
        lowest = Math.min(lowest, v[i + 2]);
        for (let axis = 0; axis < 3; axis++) {
          assert(v[i + axis] >= p.bounds.min[axis] - .000001);
          assert(v[i + axis] <= p.bounds.max[axis] + .000001);
          assert(Math.abs(v[i + axis]) < 3);
        }
        assert(v[i + 2] >= -.000001);
        assert(Math.abs(v[i + 6]) <= 1 && Math.abs(v[i + 7]) <= 1);
      }
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 8, b = indices[i + 1] * 8, c = indices[i + 2] * 8;
        const ab = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]], ac = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        if (Math.hypot(...normal) < 1e-10) continue;
        nondegenerate++;
        if (normal.reduce((sum, value, axis) => sum + value * (v[a + 3 + axis] + v[b + 3 + axis] + v[c + 3 + axis]), 0) < 0) reversed++;
      }
      assert(p.color.every(c => c >= 0 && c <= 1)); assert(p.alpha > 0 && p.alpha <= 1);
    }
    assert.equal(total, count); assert(Math.abs(lowest) < .000001);
    assert(reversed / nondegenerate < (name === 'main' ? .02 : .00001), `${reversed}/${nondegenerate} reversed faces`);
  });

  test(`CN7 N ${name} keeps headlamps forward, rear lamps behind and four wheels on the right axes`, () => {
    assert(part(primitives, 'HeadLightsGlass').bounds.min[0] > .5);
    assert(part(primitives, 'BrakeLightsGlass').bounds.max[0] < -1.7);
    assert(part(primitives, 'RedMainMiddle').bounds.max[0] < -1.8);
    assert.equal(part(primitives, 'DRLs').material, 4);
    const tires = part(primitives, 'Tires');
    assert(Math.abs(tires.bounds.min[2]) < .000001);
    const v = decode(tires.vertices, Float32Array);
    for (const wheel of model.wheelCenters) {
      assert.deepEqual(wheel.axis, [0, 1, 0]);
      const points = [];
      for (let i = 0; i < v.length; i += 8) if (Math.abs(v[i] - wheel.center[0]) < .4 && Math.abs(v[i + 1] - wheel.center[1]) < .2) points.push([v[i], v[i + 1], v[i + 2]]);
      assert(points.length >= 12, 'Each original wheel remains represented');
      assert(Math.min(...points.map(p => p[2])) < .025);
      assert(Math.max(...points.map(p => p[2])) > .60);
    }
  });
}

test('CN7 N dimensions retain source sedan proportions and statically document the four source wheels', () => {
  const { min, max } = model.bounds;
  assert(Math.abs(max[0] - min[0] - 4.675) < .001);
  assert(max[1] - min[1] > 2.04 && max[1] - min[1] < 2.08);
  assert(max[2] - min[2] > 1.39 && max[2] - min[2] < 1.43);
  assert.equal(min[2], 0);
  assert.equal(model.wheelCenters.length, 4);
  assert.equal(model.wheelAnimation, 'static-source-mesh');
  assert.equal(model.wheelCenters.filter(w => w.center[0] > 0).length, 2);
  assert.equal(model.wheelCenters.filter(w => w.center[1] > 0).length, 2);
  const axle = model.wheelCenters.filter(w => w.center[1] > 0).map(w => w.center[0]).sort((a, b) => a - b);
  assert(Math.abs(axle[1] - axle[0] - 2.72) < .02);
});

test('CN7 N matches the original readable rear plate and screen-right N badge in the renderer convention', () => {
  assert.deepEqual(model.coordinateTransform.worldToRuntime, ['+Z', '-X', '+Y']);
  assert.equal(model.coordinateTransform.handednessCorrectedForRenderer, true);
  assert.equal(model.coordinateTransform.windingCorrected, true);
  // The existing rear camera projects local +Y to screen-right. The original
  // Sketchfab rear image has the N badge right of ELANTRA, and readable plate
  // characters. A plain proper rotation mirrored both in this renderer.
  const red = part(model.primitives, 'RedBadges'), v = decode(red.vertices, Float32Array), rearBadge = [];
  for (let i = 0; i < v.length; i += 8) if (v[i] < -2 && v[i + 2] > .6) rearBadge.push(v[i + 1]);
  assert(rearBadge.length >= 3);
  assert(rearBadge.every(y => y > .35 && y < .5), 'Rear N badge must stay screen-right');
  const plate = model.primitives.find(p => p.materialName === 'Philippine_License_Plate_Recovered');
  const p = decode(plate.vertices, Float32Array), rearBottom = [];
  for (let i = 0; i < p.length; i += 8) if (p[i] < -2 && p[i + 7] === 0) rearBottom.push({ y: p[i + 1], u: p[i + 6] });
  assert.equal(rearBottom.length, 2);
  rearBottom.sort((a, b) => a.y - b.y);
  assert.equal(rearBottom[0].u, 0); assert.equal(rearBottom[1].u, 1);
});

test('CN7 N fallback painted panels stay close to the main surface instead of bridging roof and door sheets', t => {
  function geometry(p) {
    const v = decode(p.vertices, Float32Array), indices = decode(p.indices, p.indexType === 2 ? Uint16Array : Uint32Array);
    return Array.from({ length: indices.length / 3 }, (_, i) => Array.from({ length: 3 }, (_, j) => Array.from(v.subarray(indices[i * 3 + j] * 8, indices[i * 3 + j] * 8 + 3))));
  }
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), sub = (a, b) => a.map((v, i) => v - b[i]);
  const main = geometry(part(model.primitives, 'Ceramic_White')).map(([a, b, c]) => {
    const ab = sub(b, a), ac = sub(c, a), d00 = dot(ab, ab), d01 = dot(ab, ac), d11 = dot(ac, ac);
    return { a, b, c, ab, ac, d00, d01, d11, det: d00 * d11 - d01 * d01,
      min: a.map((v, i) => Math.min(v, b[i], c[i])), max: a.map((v, i) => Math.max(v, b[i], c[i])) };
  });
  function edgeDistance(p, a, b) {
    const e = sub(b, a), d = sub(p, a), f = Math.max(0, Math.min(1, dot(d, e) / (dot(e, e) || 1)));
    return d.reduce((s, v, i) => s + (v - f * e[i]) ** 2, 0);
  }
  function distanceSquared(p, triangle) {
    const { a, b, c, ab, ac, d00, d01, d11, det } = triangle, ap = sub(p, a), d20 = dot(ap, ab), d21 = dot(ap, ac);
    if (det > 1e-20) {
      const v = (d11 * d20 - d01 * d21) / det, w = (d00 * d21 - d01 * d20) / det;
      if (v >= 0 && w >= 0 && v + w <= 1) return ap.reduce((s, x, i) => s + (x - v * ab[i] - w * ac[i]) ** 2, 0);
    }
    return Math.min(edgeDistance(p, a, b), edgeDistance(p, b, c), edgeDistance(p, c, a));
  }
  const reduced = geometry(part(model.fallbackPrimitives, 'Ceramic_White')), distances = [];
  for (let i = 0; i < reduced.length; i += Math.max(1, Math.floor(reduced.length / 128))) {
    const points = reduced[i], p = points[0].map((v, axis) => (v + points[1][axis] + points[2][axis]) / 3);
    let best = Infinity;
    for (const triangle of main) {
      const boxDistance = p.reduce((s, v, axis) => s + Math.max(triangle.min[axis] - v, 0, v - triangle.max[axis]) ** 2, 0);
      if (boxDistance < best) best = Math.min(best, distanceSquared(p, triangle));
    }
    distances.push(Math.sqrt(best));
  }
  distances.sort((a, b) => a - b);
  const p95 = distances[Math.floor(distances.length * .95)], maximum = distances.at(-1);
  t.diagnostic(JSON.stringify({ sampledPanelCenters: distances.length, p95SurfaceErrorMm: p95 * 1000, maximumSurfaceErrorMm: maximum * 1000 }));
  assert(p95 < .006, 'The reduced panels should follow the same continuous body surface');
  assert(maximum < .025, 'A coarse triangle must not cut deeply across a neighboring body sheet');
});
