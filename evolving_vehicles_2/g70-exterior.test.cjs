const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { test } = require('node:test');

const folder = path.join(__dirname, 'assets/models');
const runtime = fs.readFileSync(path.join(folder, 'g70-runtime.js'));
let model;
vm.runInNewContext(runtime.toString(), { ManufacturerModels: {
  registerCompressed(s) { model = JSON.parse(gunzipSync(Buffer.from(s, 'base64'))); }
} });
const sha = s => createHash('sha256').update(s).digest('hex');
const partDigest = (parts, filter) => sha(JSON.stringify(parts.filter(filter).map(p => [p.name, p.vertices, p.indices, p.textureIndex])));
const count = parts => parts.reduce((sum, p) => sum + p.triangles, 0);
const roles = (parts, name) => parts.filter(p => p.exteriorRole === name);
const dark = p => p.color.every(c => c < .07);
function triangleDigest(parts) {
  // Grouping/vertex indices may change. Compare the oriented triangle soup,
  // including original position, normal and UV bytes, independent of groups.
  const hashes = [];
  for (const p of parts) {
    const v = Buffer.from(p.vertices, 'base64'), b = Buffer.from(p.indices, 'base64');
    const ix = p.indexType === 2 ? new Uint16Array(b.buffer, b.byteOffset, b.length / 2) : new Uint32Array(b.buffer, b.byteOffset, b.length / 4);
    for (let i = 0; i < ix.length; i += 3) hashes.push(sha(Buffer.concat([0, 1, 2].map(a => v.subarray(ix[i + a] * 32, (ix[i + a] + 1) * 32)))));
  }
  return sha(hashes.sort().join(''));
}

test('G70 exterior refinement preserves original painted body, optics, wheels and glazing', () => {
  // Frozen released 0d721f3 buffers. New paintable mirror caps are intentionally
  // separate; none of the existing body/UV/lamp/wheel geometry may be altered.
  const body = p => /^Paint/.test(p.materialName);
  const optics = p => /^Material__(278|279|280|281|286|287|288|289|290|291|292|293|307|343|344|345|346)$|^window_glass|^Glass$/.test(p.materialName);
  assert.equal(partDigest(model.primitives, body), '9594e4046bf65b86b87312bffd0db9334aae49395fd8e977d4800551c02524c5');
  assert.equal(partDigest(model.fallbackPrimitives, body), 'e598a628f5852169006c5824f7f1d709a07fe94291419ef3601f57be7e524176');
  assert.equal(partDigest(model.primitives, optics), '3d87d17d52997b1434b2c1144282db2c5fed4ffc118b2ab0f6cbb03afb46d10d');
  assert.equal(partDigest(model.fallbackPrimitives, optics), '3b1b8187246869d73e3989dfe3465199db62ed51d721e4f9380b27e0d5aee98b');
  assert.equal(sha(JSON.stringify(model.textures)), '8d7a2a3e6960fb4024059e6654bb9a6820c68eb29d196fc9d6f700f379f87941');
});

test('G70 main grille keeps source diamond lattice and separates dark supports from metallic rim', () => {
  const p = model.primitives;
  assert.equal(count(p.filter(x => x.materialName === 'chrome')), 33915);
  const frame = roles(p, 'grille-frame'), support = roles(p, 'grille-support');
  assert.equal(frame.length, 1);
  assert(frame[0].material === 3 && frame[0].color.every(c => c > .6));
  const b = frame[0].bounds, ratio = (b.max[1] - b.min[1]) / (b.max[2] - b.min[2]);
  assert(ratio > 2.3 && ratio < 2.8, `Pre-facelift broad crest aspect ${ratio}`);
  assert(support.length && support.every(x => dark(x) && x.material === 2 && !x.paint));
  assert(roles(p, 'grille-backing').every(dark));
  assert(count(support) > 2000, 'Broad original support/closing surfaces must not remain silver');
});

for (const [label, parts] of [['main', model.primitives], ['fallback', model.fallbackPrimitives]]) {
  test(`G70 ${label} mirrors follow body paint while pillars and window perimeter keep separate finishes`, () => {
    const caps = roles(parts, 'mirror-cap'), underside = roles(parts, 'mirror-underside');
    assert.equal(caps.length, 2);
    assert(caps.every(p => p.paint && p.material === 0 && p.bounds.min[0] > .49));
    assert(caps.some(p => p.bounds.min[1] > .81) && caps.some(p => p.bounds.max[1] < -.81));
    assert(underside.length === 2 && underside.every(p => !p.paint && p.material === 2 && dark(p)));
    assert(roles(parts, 'b-pillar').length >= 2);
    assert(roles(parts, 'b-pillar').every(p => !p.paint && p.material === 1 && p.alpha === 1 && dark(p)));
    const trim = roles(parts, 'window-frame');
    assert(trim.length >= 2 && trim.every(p => !p.paint && p.material === 3 && p.color.every(c => c >= .14 && c <= .18)));
    assert(parts.filter(p => p.paint && !/^Paint/.test(p.materialName)).every(p => p.exteriorRole === 'mirror-cap'));
    assert(parts.some(p => /^chrome[34]$/.test(p.materialName) && p.exteriorRole === 'original'), 'Door handles/indicator trim remain separate');
  });
}

test('G70 rear skirt keeps source mesh detail and dark exhaust cavities inside metallic lips', () => {
  const parts = model.primitives, tips = roles(parts, 'exhaust-tip'), inside = roles(parts, 'exhaust-interior');
  assert(tips.length && inside.length);
  assert(tips.every(p => p.material === 3 && !p.paint && p.bounds.max[0] < -2.1));
  assert(inside.every(p => p.material === 2 && !p.paint && dark(p)));
  assert(count(inside) > count(tips), 'Recessed source closing surfaces are cavities, not bright solid plugs');
  assert(count(roles(parts, 'rear-mesh')) > 19000, 'Preserve fine source lower-bumper lattice');
  assert(roles(parts, 'rear-diffuser').every(p => !p.paint && p.material === 1 && dark(p)));
  assert(roles(parts, 'rear-backing').every(dark));
});

test('G70 fallback regrouping preserves every original triangle instead of adding a heavier fallback', () => {
  assert.equal(model.fallbackTriangles, 4689);
  assert.equal(triangleDigest(model.fallbackPrimitives), 'e97acbca840053e0480f82894efcf53b2e74d64d0e74034c9f57d9a12537d711');
  assert.equal(triangleDigest(model.fallbackPrimitives.filter(p => p.materialName === 'chrome')), '1d9e9ed5d1609ffcff40313ad17fe76bac8852e6fcc144e9a7bd01291ae90bc4');
});

test('G70 reproducible source record matches delivered geometry, bytes and license', () => {
  const source = JSON.parse(fs.readFileSync(path.join(folder, 'g70-model-source.json')));
  assert.equal(source.conversion.mainTriangles, model.triangles);
  assert.equal(source.conversion.paintTriangles, count(model.primitives.filter(p => p.paint)));
  assert.equal(source.conversion.fallbackTriangles, model.fallbackTriangles);
  assert.equal(source.conversion.runtimeBytes, runtime.length);
  assert.equal(source.conversion.runtimeSha256, sha(runtime));
  assert.equal(source.sourceSha256, model.source.sha256);
  assert.equal(source.license, 'CC BY 4.0');
  assert.match(source.conversion.quality, /lower grille fidelity/);
});
