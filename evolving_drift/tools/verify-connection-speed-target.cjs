'use strict';
// A paired physical check of a diagnosed event, not a convergence benchmark.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const base = path.join(root, 'evolving_drift');
const defaults = { beforeRoot: path.join(root, 'output/drift-qa/all-vehicle-study/source'),
  input: path.join(base, 'test-fixtures/kic-t21-speed-target-parent.json'),
  output: path.join(root, 'output/drift-qa/all-vehicle-study/speed-target-fix-paired.json') };
function options(argv) {
  const result = { ...defaults }, keys = { '--before-root': 'beforeRoot', '--input': 'input', '--out': 'output' };
  for (let i = 0; i < argv.length; i++) {
    const key = keys[argv[i]];
    if (!key || !argv[i + 1]) throw Error('Use --before-root <checkout at 007ee68> [--input <parent JSON>] [--out <JSON>].');
    result[key] = path.resolve(argv[++i]);
  }
  return result;
}
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const geneHash = gene => { const b = Buffer.alloc(gene.length * 8); gene.forEach((v, i) => b.writeDoubleLE(v, i * 8)); return sha(b); };
async function main() {
  const { beforeRoot, input, output } = options(process.argv.slice(2)), frozen = path.join(beforeRoot, 'evolving_drift');
  const saved = JSON.parse(fs.readFileSync(input));
  for (const name of ['physics', 'fitness', 'course-scoring', 'driver', 'genome', 'catalog']) {
    const file = 'evolving_drift/' + name + '.js';
    const before = fs.readFileSync(path.join(beforeRoot, file), 'utf8'), current = fs.readFileSync(path.join(root, file), 'utf8');
    // Checkout line endings are not physics changes. Historical byte hashes
    // remain in the evidence; canonical hashes make replay portable.
    const canonical = text => sha(text.replace(/\r\n/g, '\n'));
    if (saved.canonicalSourceHashes) assert.equal(canonical(before), saved.canonicalSourceHashes[file], 'Frozen source differs: ' + file);
    else assert.equal(sha(before), saved.sourceHashes[file], 'Frozen source differs: ' + file);
    assert.equal(canonical(current), canonical(before), 'Current source differs: ' + file);
  }
  const load = name => require(path.join(frozen, name + '.js'));
  const OldAnalysis = load('connection-analysis'), OldStrategies = load('evolution-strategies');
  const Catalog = load('catalog'), Tracks = load('track'), Physics = load('physics'), Fitness = load('fitness'), Prepared = load('prepared-grips'), Evolution = load('evolution');
  const FixedAnalysis = require(path.join(base, 'connection-analysis.js')), FixedStrategies = require(path.join(base, 'evolution-strategies.js'));
  const vehicle = Catalog.get(saved.config.vehicle), track = Tracks.get(saved.config.track), prepared = await Prepared.load(vehicle, track);
  let parentEvaluations = 0;
  if (!saved.frames) {
    const raw = Physics.evaluateGene(vehicle, track, saved.gene, { record: true });
    const ranked = Fitness.rank(vehicle, track, raw, raw.frames, { reference: prepared.record });
    assert.equal(ranked.valid, true); assert.equal(ranked.status, 'finished');
    assert.equal(ranked.score, saved.result.score); assert.deepEqual(ranked.drift, saved.result.drift);
    saved.frames = raw.frames; parentEvaluations++;
  }
  const parent = { id: saved.id, gene: Float64Array.from(saved.gene), record: saved.frames, result: saved.result, accepted: true };
  assert.equal(geneHash(parent.gene), saved.geneHash); assert.equal(parent.result.valid, true); assert.equal(parent.result.status, 'finished');
  const report = { schema: 1, scope: 'Same valid physical parent, seed 137, scale .7, forced speed mutation; unchanged stock physics/scoring; two complete no-cache child evaluations. This is not a GA convergence or safety-rate comparison.',
    sourceParent: { id: parent.id, geneHash: saved.geneHash, input: path.relative(root, input).replaceAll(path.sep, '/') },
    sourceVersions: { frozen: Object.fromEntries(['connection-analysis', 'evolution-strategies', 'physics', 'fitness'].map(name => [name, sha(fs.readFileSync(path.join(frozen, name + '.js')))])),
      fixed: Object.fromEntries(['connection-analysis', 'evolution-strategies'].map(name => [name, sha(fs.readFileSync(path.join(base, name + '.js')))])) }, arms: [] };
  for (const [name, Analysis, Strategies] of [['before', OldAnalysis, OldStrategies], ['fixed', FixedAnalysis, FixedStrategies]]) {
    const target = Analysis.measure(track, parent.result.drift, parent.record).corners.find(c => c.id === 'apex-1');
    assert.equal(target.reason, 'speed'); assert.equal(target.complete, false);
    const proposal = Strategies.connect(vehicle, track, parent, Evolution.createRng(137), { connectionTarget: target, connectionMode: 'speed', zones: Strategies.zones(track), scale: .7, referenceRecord: prepared.record, referenceGene: prepared.gene });
    const raw = Physics.evaluateGene(vehicle, track, proposal.gene, { record: true });
    const result = Fitness.rank(vehicle, track, raw, raw.frames, { reference: prepared.record });
    const { frames, ...summary } = result;
    report.arms.push({ name, target, change: proposal.change, geneHash: geneHash(proposal.gene), gene: Array.from(proposal.gene), result: summary,
      cornerMetricsUnchangedFromParent: JSON.stringify(result.drift.arcs) === JSON.stringify(parent.result.drift.arcs) });
  }
  const [before, fixed] = report.arms;
  assert.equal(fixed.target.evidenceSource, 'metric-minimum');
  assert.equal(fixed.target.evidence.speed, parent.result.drift.arcs.find(a => a.zoneId === 'apex-1').bestArc.minSpeed);
  assert.equal(fixed.change.slowS, fixed.target.evidence.s);
  assert(before.change.start > fixed.change.slowS, 'Old repair starts after the event that actually defined the minimum.');
  assert(fixed.change.start < fixed.change.slowS && fixed.change.end > fixed.change.slowS);
  assert.notEqual(before.geneHash, fixed.geneHash);
  report.evaluations = 2; report.parentEvaluations = parentEvaluations; report.targetingAssertionsPassed = true;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, targetingAssertionsPassed: true, arms: report.arms.map(a => ({ name: a.name, breakS: a.target.breakS, start: a.change.start, end: a.change.end, slowS: a.change.slowS, status: a.result.status, score: a.result.score, retention: a.result.drift.arcs.find(x => x.zoneId === 'apex-1')?.bestArc?.speedRetention, completedCorners: a.result.drift.fullConnectionCount, cornerMetricsUnchangedFromParent: a.cornerMetricsUnchangedFromParent })) }));
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
