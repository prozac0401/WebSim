'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fixture = require('./test-fixtures/kic-t21-completed-corner.json');
const {Catalog,Tracks,Physics,Fitness,Genome,Prepared}=require('./test-fixtures/historical-v2-runtime.cjs').loadFrozenRuntime();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function geneHash(gene) {
  const bytes = Buffer.alloc(gene.length * 8);
  gene.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
  return sha(bytes);
}

test('historical v2: a lower-score evolved child physically completes the second T21 corner without prefix reuse', { timeout: 180000 }, async () => {
  const vehicle = Catalog.get(fixture.vehicle), track = Tracks.get(fixture.track);
  assert.equal(sha(Physics.signature()), fixture.signatures.physics);
  assert.equal(sha(Fitness.signature()), fixture.signatures.fitness);
  assert.equal(sha(Genome.signature()), fixture.signatures.genome);
  const prepared = await Prepared.load(vehicle, track);
  assert.equal(prepared.fingerprint, fixture.preparedFingerprint);
  assert.equal(geneHash(prepared.gene), fixture.genesisGeneHash);
  const results = {};
  for (const role of ['parent', 'child']) {
    const saved = fixture[role];
    assert.equal(geneHash(saved.gene), saved.geneHash);
    const raw = Physics.evaluateGene(vehicle, track, Float64Array.from(saved.gene), { record: true });
    const actual = Fitness.rank(vehicle, track, raw, raw.frames, { reference: prepared.record });
    const expected = saved.result || saved.resultSummary;
    assert.equal(actual.status, 'finished');
    assert.equal(actual.valid, true);
    assert.equal(actual.score, expected.score);
    assert.deepEqual(JSON.parse(JSON.stringify(actual.drift)), expected.drift);
    for (const frame of raw.frames) {
      assert(Physics.frontContacts(vehicle, frame).every(p => track.contains(p.x, p.y, frame.s)), role + ' front tire contact at ' + frame.s);
    }
    results[role] = actual;
  }
  const parent = results.parent.drift.arcs.find(a => a.zoneId === 'apex-1');
  const child = results.child.drift.arcs.find(a => a.zoneId === 'apex-1');
  assert.equal(parent.complete, false);
  assert.equal(child.complete, true);
  assert(child.connectionCoverage >= 1 - 1e-9);
  assert(child.bestArc.speedRetention >= .9);
  assert(results.child.score < results.parent.score);
});
