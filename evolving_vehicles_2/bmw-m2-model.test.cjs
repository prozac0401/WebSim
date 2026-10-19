const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const folder = process.env.M2_MODEL_DIR || path.join(__dirname, 'assets/models');
const runtime = fs.readFileSync(path.join(folder, 'bmw_m2-runtime.js'), 'utf8');
const source = JSON.parse(fs.readFileSync(path.join(folder, 'bmw_m2-source.json')));
const summary = JSON.parse(fs.readFileSync(path.join(folder, 'bmw_m2-runtime-summary.json')));
let model;
vm.runInNewContext(runtime, { ManufacturerModels: { registerCompressed(data) { model = JSON.parse(gunzipSync(Buffer.from(data, 'base64'))); } } });
function decode(text, Type) {
  const b = Buffer.from(text, 'base64');
  return new Type(b.buffer, b.byteOffset, b.byteLength / Type.BYTES_PER_ELEMENT);
}

test('BMW M2 records the creator, CC BY terms, pinned public download and previous mirror edits', () => {
  assert.equal(model.id, 'bmw_m2');
  assert.equal(model.source.kind, 'community-mesh');
  assert.equal(model.source.author, 'Manuel Contento');
  assert.equal(model.source.author, source.author);
  assert.equal(model.source.license, 'CC BY 4.0');
  assert.equal(model.source.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(model.source.url, source.sourceUrl);
  assert.match(source.sourceUrl, /394feedd0a0742c595917c7b0f6edcad$/);
  assert.equal(source.manufacturerOfficial, false);
  assert.match(source.download.method, /Normal signed-in Sketchfab/);
  assert.match(source.download.url, /394feedd0a0742c595917c7b0f6edcad#download$/);
  assert.equal(source.download.files[0].sha256, 'e4d9445c333acfe70ed8aaaa800b1c79a60d1702cdc2db0bdffc5124450aff0e');
  assert.equal(source.download.files[0].sha256, model.source.sha256);
  assert(source.previousMirrorDownload.existingMirrorChanges.some(c => /simplification/.test(c)));
  assert.match(model.source.configuration, /F87.*N55.*2016.*2017.*Not M2 Competition/);
  assert(source.visualReferences.some(r => new URL(r.url).hostname === 'www.press.bmwgroup.com'));
  const license = fs.readFileSync(path.join(folder, 'bmw_m2-LICENSE.txt'), 'utf8');
  assert.match(license, /Manuel Contento[\s\S]*CC-BY-4\.0/);
  assert(license.includes(source.download.files[0].sha256));
});

test('BMW M2 uses the full original source and preserves its painted shell while simplifying detail', () => {
  assert.equal(source.sourceGeometry.downloadedTriangles, 677668);
  assert(model.triangles>200000&&model.triangles<=350000);
  assert.equal(source.conversion.sourceParts,77);
  assert(model.primitives.every(p => p.materialName !== 'Piano'));
  assert.equal(source.conversion.geometryAdded, false);
  assert.equal(source.conversion.fullBodySimplifiedByWebSim, false);
  assert(model.fallbackTriangles > 10000 && model.fallbackTriangles <= 65000);
  assert.equal(model.primitives.length, 21);
  assert(Buffer.byteLength(runtime) < 19 * 1024 * 1024);
  for (const key of ['triangles', 'fallbackTriangles']) {
    assert.equal(model[key], source.conversion[key]);
    assert.equal(model[key], summary[key]);
  }
  assert.equal(Buffer.byteLength(runtime), source.conversion.runtimeBytes);
  assert.equal(Buffer.byteLength(runtime), summary.runtimeBytes);
});

test('BMW M2 removes only body stripes and retains the original badge and detail textures', () => {
  assert.equal(model.textures.length, 6);
  for (let i = 0; i < model.textures.length; i++) {
    const [prefix, encoded] = model.textures[i].split(',');
    assert.match(prefix, /^data:image\/(png|jpeg);base64$/);
    const bytes = Buffer.from(encoded, 'base64'), info = summary.textures[i];
    assert.equal(bytes.length, info.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), info.sha256);
    assert.equal(info.width, 1024); assert.equal(info.height, 1024);
  }
  const body = model.primitives.find(p => p.role === 'factory-paint');
  assert.equal(body.triangles, 199724);
  assert.deepEqual(body.sourceParts.map(p => p.name), ['Livery', 'Livery']);
  assert.equal(body.paint, true);
  assert.equal(body.material, 0);
  assert.equal(body.textureIndex, undefined, 'The stripe atlas must not be sampled by the painted body');
  assert.deepEqual(body.color, [22 / 255, 127 / 255, 167 / 255]);
  const badges = model.primitives.filter(p => p.materialName === 'MAT_LIVERY');
  assert.equal(badges.reduce((s,p)=>s+p.triangles,0),5520);
  assert.deepEqual([...new Set(badges.flatMap(p=>p.sourceParts.map(p => p.name)))].sort(), ['BMW_LOGO', 'BMW_LOGO1', 'BMW_LOGO2', 'BMW_LOGO5', 'BMW_LOGO6']);
  for(const badge of badges){assert.deepEqual(badge.color,[1,1,1]);assert.equal(summary.textures[badge.textureIndex].materialName,'MAT_LIVERY');}
  assert(model.primitives.filter(p => p !== body).every(p => Number.isInteger(p.textureIndex) && p.textureIndex >= 0 && p.textureIndex < 6));
  assert(model.fallbackPrimitives.every(p => p.textureIndex === undefined));
  const fallbackBody = model.fallbackPrimitives.find(p => p.role === 'factory-paint');
  assert.deepEqual(fallbackBody.color, body.color);
  assert.deepEqual(fallbackBody.sourceParts.map(p => p.name), ['Livery', 'Livery']);
});

test('BMW M2 documents its actual factory color and distinguishes it from an official RGB specification', () => {
  assert.equal(model.source.stockPaint.name, 'Long Beach Blue Metallic');
  assert.equal(model.source.stockPaint.code, 'C16');
  assert.equal(model.source.stockPaint.renderApproximation, true);
  assert.equal(model.source.stockPaint.displayHex, '#167fa7');
  assert.equal(new URL(model.source.stockPaint.sourceUrl).hostname, 'www.press.bmwgroup.com');
  assert.equal(new URL(model.source.stockPaint.codeSourceUrl).hostname, 'www.bmw.ie');
  assert.deepEqual(source.configuration.stockPaint, model.source.stockPaint);
  assert(source.conversion.changes.some(c => /stripes.*material/i.test(c)));
});

for (const [name, primitives, count] of [['main', model.primitives, model.triangles], ['fallback', model.fallbackPrimitives, model.fallbackTriangles]]) {
  test(`BMW M2 ${name} has finite decoded geometry, unit normals, valid integer indices and ground zero`, () => {
    let triangles = 0, lowest = Infinity, reversed = 0, nondegenerate = 0;
    for (const p of primitives) {
      assert(p.indexType === 2 || p.indexType === 4, p.name);
      const v = decode(p.vertices, Float32Array), indices = decode(p.indices, p.indexType === 2 ? Uint16Array : Uint32Array);
      assert.equal(v.length % 8, 0);
      assert.equal(indices.length, p.triangles * 3);
      assert.equal(p.sourceParts.reduce((n, part) => n + part.triangles, 0), p.triangles);
      triangles += p.triangles;
      for (const value of v) assert(Number.isFinite(value), p.name);
      for (const index of indices) assert(Number.isInteger(index) && index < v.length / 8, p.name);
      for (let i = 0; i < v.length; i += 8) {
        assert(Math.abs(Math.hypot(v[i + 3], v[i + 4], v[i + 5]) - 1) < .00001, `${p.name}: normal`);
        lowest = Math.min(lowest, v[i + 2]);
        for (let axis = 0; axis < 3; axis++) {
          assert(v[i + axis] >= p.bounds.min[axis] - .000001);
          assert(v[i + axis] <= p.bounds.max[axis] + .000001);
          assert(Math.abs(v[i + axis]) < 3, 'Quantized positions must be decoded before scaling');
        }
        assert(v[i + 2] >= -.000001);
        assert(Math.abs(v[i + 6]) <= 2 && Math.abs(v[i + 7]) <= 2, 'UVs must be dequantized');
      }
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 8, b = indices[i + 1] * 8, c = indices[i + 2] * 8;
        const ab = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]], ac = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        if (Math.hypot(...normal) < 1e-10) continue;
        nondegenerate++;
        if (normal.reduce((n, value, j) => n + value * (v[a + 3 + j] + v[b + 3 + j] + v[c + 3 + j]), 0) < 0) reversed++;
      }
      assert(p.color.every(c => c >= 0 && c <= 1));
      assert(p.alpha > 0 && p.alpha <= 1);
    }
    assert.equal(triangles, count);
    assert(Math.abs(lowest) < .000001);
    // The unchanged original contains a few subpixel/internally crossed faces;
    // a global mirrored-axis regression would reverse nearly every face.
    assert(reversed / nondegenerate < (name === 'main' ? .01 : .00001));
  });

  test(`BMW M2 ${name} keeps lamps at the correct ends and distinguishes cabin glazing from lamp covers`, () => {
    const front = primitives.filter(p => p.materialName === 'MAT_FRONTLIGHT');
    const rear = primitives.filter(p => p.materialName === 'MAT_BACKLIGHT');
    assert(front.length && rear.length);
    assert(front.every(p => p.bounds.min[0] > 1.6));
    assert(rear.every(p => p.bounds.max[0] < -1.7));
    assert(front.some(p => p.material === 4) && rear.some(p => p.material === 4));
    const windows = primitives.filter(p => p.sourceParts.some(part => /Window/.test(part.name)));
    assert(windows.length && windows.every(p => p.material === 1 && p.alpha === 1));
    const covers = primitives.filter(p => p.materialName === 'MAT_GLASS' && p.alpha < 1);
    assert(covers.length && covers.every(p => p.material === 1 && p.alpha <= .22));
    const wheels = primitives.filter(p => p.materialName === 'MAT_RIM1');
    assert(wheels.length);
    const wheelParts = wheels.flatMap(p => p.sourceParts);
    assert(wheelParts.some(p => p.bounds.min[0] > 1));
    assert(wheelParts.some(p => p.bounds.max[0] < -.8));
    assert(Math.min(...wheelParts.map(p => p.bounds.min[2])) < .001);
  });
}

test('BMW M2 dimensions preserve F87 coupe proportions and source geometry rather than the studio plane', () => {
  const { min, max } = model.bounds;
  assert(Math.abs(max[0] - min[0] - 4.468) < .00001);
  assert(max[1] - min[1] > 1.98 && max[1] - min[1] < 2.04);
  assert(max[2] - min[2] > 1.40 && max[2] - min[2] < 1.46);
  assert.equal(min[2], 0);
  assert(Math.abs(min[0] + max[0]) < .00001);
  assert(Math.abs(min[1] + max[1]) < .01,'source body asymmetry is preserved rather than stretched');
});

test('BMW M2 neutralizes parked front steering and rotates only original wheels, excluding calipers',()=>{
 assert.equal(model.wheelAnimation,'separate-source-wheel-primitives');
 assert(Math.abs(model.sourceSteeringRadians-18.5*Math.PI/180)<1e-10);
 for(const primitives of [model.primitives,model.fallbackPrimitives]){
  const wheels=primitives.filter(p=>p.wheel),calipers=primitives.filter(p=>p.role==='stationary-brake-caliper');
  assert.equal(new Set(wheels.map(p=>p.wheel.axle+':'+p.wheel.side)).size,4);
  assert(calipers.length>=1&&calipers.every(p=>!p.wheel));
  assert(wheels.every(p=>/^Rim|^BMW_LOGO/.test(p.name)&&!p.paint));
  for(const p of wheels){const w=p.wheel;assert(w.radius>.33&&w.radius<.35);assert(w.center.every(Number.isFinite));}
  const front=wheels.filter(p=>p.wheel.axle==='front'&&p.materialName==='MAT_RIM1');
  assert.equal(front.length,2);
  for(const p of front){
   assert(p.bounds.max[1]-p.bounds.min[1]<.28,'front wheel width is aligned with the axle, not diagonally steered');
   const v=decode(p.vertices,Float32Array);let parallel=0;
   for(let i=0;i<v.length;i+=8)if(Math.abs(v[i+4])>.999)parallel++;
   assert(parallel>50,'original planar rim/disc normals face along the lateral axle');
  }
 }
});

test('BMW M2 keeps the original front and rear M2 badges on the correct renderer screen side',()=>{
 assert.deepEqual(model.coordinateTransform.worldToRuntime,['+Z','-X','+Y']);
 assert.equal(model.coordinateTransform.handednessCorrectedForRenderer,true);
 const parts=model.primitives.flatMap(p=>p.sourceParts),front=parts.find(p=>p.name==='m5'),rear=parts.find(p=>p.name==='m6');
 assert(front.bounds.min[0]>2&&front.bounds.max[1]<-.1,'front badge appears screen-right when viewed from the front');
 assert(rear.bounds.max[0]<-2&&rear.bounds.min[1]>.3,'rear badge appears screen-right when viewed from behind');
 assert.equal(front.triangles,728);assert.equal(rear.triangles,728);
});
