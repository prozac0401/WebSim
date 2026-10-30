'use strict';
// Run: node <this-file> [output.json] [--vehicle supra|g80]
//      [--baseline-source <git-commit>]. No state injection in
// race runs; isolated cooling traces explicitly start at the screenshot values.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
let output, vehicleId = 'supra', baselineSource;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--vehicle') vehicleId = args[++i];
  else if (args[i] === '--baseline-source') baselineSource = args[++i];
  else if (!args[i].startsWith('--') && !output) output = args[i];
  else throw new Error('Unknown argument: ' + args[i]);
}
const variants = {supra: 'supra-3.0t-rz', g80: 'g80-2.5t-awd'};
if (!variants[vehicleId]) throw new Error('Expected --vehicle supra or g80');
const conditionFile = path.join(root, 'vehicle-condition.js');
let conditionSource = fs.readFileSync(conditionFile, 'utf8');
if (baselineSource !== undefined) {
  if (!/^[a-f0-9]{7,40}$/i.test(baselineSource)) throw new Error('Baseline source must be a Git commit hash');
  conditionSource = execFileSync('git', ['show', baselineSource + ':evolving_vehicles_2/vehicle-condition.js'], {cwd: root, encoding: 'utf8'});
  // Load historical condition code in this process only. Production files are
  // untouched, and Race receives the same module through its normal require.
  const baselineModule = new Module(conditionFile, module);
  baselineModule.filename = conditionFile;
  baselineModule.paths = Module._nodeModulePaths(root);
  require.cache[conditionFile] = baselineModule;
  baselineModule._compile(conditionSource, conditionFile);
  baselineModule.loaded = true;
}
const V = require(path.join(root, 'vehicle-condition.js'));
const Race = require(path.join(root, 'race-engine.js'));
const T = require(path.join(root, 'tuning-evolution.js'));
const circuits = require(path.join(root, 'circuits.js'));
const circuit = circuits.find(c => c.id === 'inje');
if (!circuit) throw new Error('Inje circuit missing');
const round = n => Math.round(n * 1000) / 1000;
const brakeState = s => ({frontC: round(s.brakes.front.temperatureC), rearC: round(s.brakes.rear.temperatureC), brakeFactor: round(s.brakes.factor ?? V.snapshot(s).brakes.factor)});
const configurations = [
  {name: 'stock', budget: 0, levels: {acceleration: 0, topSpeed: 0, brakes: 0, grip: 0}},
  {name: 'acceleration3-grip3-brakes0', budget: 30, levels: {acceleration: 3, topSpeed: 0, brakes: 0, grip: 3}}
].filter(config => vehicleId === 'supra' || config.name === 'stock');
function entrant(config) {
  return T.createEntrant({vehicleId, variantId: variants[vehicleId], ...config});
}
function runRace(config) {
  const race = new Race({circuit, entrants: [entrant(config)], laps: 4, surface: 'dry'});
  const car = race.cars[0], dt = .25;
  let longest = null, interval = null;
  const extrema = {frontMinC: Infinity, frontMaxC: -Infinity, rearMinC: Infinity, rearMaxC: -Infinity};
  const finishInterval = () => {
    if (interval && (!longest || interval.durationSeconds > longest.durationSeconds)) longest = interval;
    interval = null;
  };
  for (let i = 0; i < 16000 && !race.finished; i++) {
    const oldTime = car.condition.elapsedSeconds, oldEnergy = car.condition.energy.frictionBrakeJ;
    const oldState = brakeState(car.condition), oldLap = car.lap;
    race.step(dt);
    const s = car.condition, current = brakeState(s), elapsed = s.elapsedSeconds - oldTime;
    // Cumulative energy detects braking anywhere inside the sampled interval.
    if (s.energy.frictionBrakeJ - oldEnergy < 1e-6 && elapsed > 0) {
      if (!interval) interval = {startSeconds: round(oldTime), start: oldState, durationSeconds: 0};
      interval.durationSeconds = round(interval.durationSeconds + elapsed);
      interval.endSeconds = round(s.elapsedSeconds); interval.end = current;
    } else finishInterval();
    if (oldLap === 3 || car.lap === 4) {
      extrema.frontMinC = Math.min(extrema.frontMinC, current.frontC);
      extrema.frontMaxC = Math.max(extrema.frontMaxC, current.frontC);
      extrema.rearMinC = Math.min(extrema.rearMinC, current.rearC);
      extrema.rearMaxC = Math.max(extrema.rearMaxC, current.rearC);
    }
  }
  finishInterval();
  if (!car.finished || car.dnf) throw new Error(config.name + ' did not finish');
  return {configuration: config, distanceM: round(car.distance), finishSeconds: round(car.finishTime),
    frictionBrakeMJ: round(car.condition.energy.frictionBrakeJ / 1e6),
    laps: car.lapConditions.map((s, i) => ({lap: s.lap, lapSeconds: round(car.lapTimes[i]), ...brakeState(s)})),
    finalLapSampledExtrema: extrema, longestNoFrictionBrakeInterval: longest};
}
function cooling(speedKmh) {
  const entry = entrant(configurations[0]);
  const car = {spec: entry.spec, entrant: entry, massKg: entry.spec.massKg, powerPs: entry.spec.powerPs};
  const s = V.create(car); s.brakes.front.temperatureC = 851; s.brakes.rear.temperatureC = 521;
  const trace = [{seconds: 0, ...brakeState(s)}];
  for (let i = 1; i <= 240; i++) {
    V.update(car, s, .25, {speedMps: speedKmh / 3.6});
    if (i % 40 === 0) trace.push({seconds: i / 4, ...brakeState(s)});
  }
  return {speedKmh, trace, frictionBrakeJ: s.energy.frictionBrakeJ};
}
const sources = Object.fromEntries(['vehicle-condition.js', 'race-engine.js', 'tuning-evolution.js'].map(file =>
  [file, crypto.createHash('sha256').update(file === 'vehicle-condition.js' ? conditionSource : fs.readFileSync(path.join(root, file))).digest('hex')]));
const result = {model: V.MODEL.version, sources, conditionSourceCommit: baselineSource || null,
  vehicleId, variantId: variants[vehicleId], availableVariants: T.VARIANTS[vehicleId].map(v => ({id: v.id, label: v.label})), circuit: circuit.id, sampleSeconds: .25,
  scope: 'Model diagnostic, not real-vehicle calibration. Race temperatures sampled every 0.25 s; cooling traces hold stated speed without braking.',
  screenshotComparison: 'Vehicle/variant matched where stated; screenshot tuning levels are unknown. Stock and named tuning cases are controlled comparisons, not exact screenshot reproductions.',
  races: configurations.map(runRace), cooling: vehicleId === 'supra' ? [0, 78, 120].map(cooling) : []};
const json = JSON.stringify(result, null, 2) + '\n';
if (output) fs.writeFileSync(path.resolve(output), json);
process.stdout.write(json);
