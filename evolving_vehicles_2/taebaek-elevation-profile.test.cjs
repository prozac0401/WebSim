'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Profile = require('./taebaek-elevation-profile.js'), Pose = require('./driving-pose.js'), Race = require('./race-engine.js');
const Evolution = require('./tuning-evolution.js'), circuits = require('./circuits.js'), Renderer = require('./circuit-renderer.js');
const circuit = circuits.find(c => c.id === 'taebaek'), reference = { ...circuit, id: 'taebaek-dem-reference' };
const rms = xs => Math.sqrt(xs.reduce((sum, x) => sum + x * x, 0) / xs.length);
const peak = xs => Math.max(...xs.map(Math.abs));
const derivative = xs => xs.slice(1).map((x, i) => (x - xs[i]) / .25);
function fixture(source, vehicleId = 'supra') {
  const race = new Race({ circuit: source, entrants: Evolution.createPopulation({ vehicleId, budget: 30, seed: 31415, count: 8 }), laps: 1 });
  const r = new Renderer({ style: {}, getContext: () => ({}), addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 980, height: 615 }) });
  r.setRace(race); return { race, car: race.cars[0], r };
}
function motion(f, from, to) {
  const pitch = [];
  for (let s = from; s < to; s += .25) pitch.push(Math.atan(f.r._displayPose(Pose.sampleCar(f.race, f.car, s), f.car).grade));
  const rates = derivative(pitch);
  return { maximumPitchDeg: peak(pitch) * 180 / Math.PI, maximumPitchRateDegPerM: peak(rates) * 180 / Math.PI,
    pitchRateRMS: rms(rates), pitchSecondRMS: rms(derivative(rates)) };
}

// Recorded from released 6cc17ff with the same entrants, renderer and 25 cm
// samples: [DEM peak rate, DEM second RMS, regraded peak rate, regraded second
// RMS]. Freeze the original reported problem instead of changing its denominator
// whenever XY fairing also improves the unadjusted DEM comparison path.
const releasedHill = {
  supra: {
    corner: [2.448622113575111, .007009826986425559, .4832214175160786, .0014243209799495202],
    whole: [2.448622113575111, .00314505784830192, .4832214175160786, .001009494115050416]
  },
  staria: {
    corner: [2.3358161696544024, .006314568690459958, .44776102005863794, .0012023085828021247],
    whole: [2.3358161696544024, .002776998336771465, .44776102005863794, .0006448789376681924]
  }
};

test('Taebaek regrading preserves source data, XY, line lengths, extrema and the untouched tail exactly', () => {
  const saved = JSON.stringify(circuit), old = Race.buildTrack(reference), now = Race.buildTrack(circuit);
  assert.equal(JSON.stringify(circuit), saved);
  assert.equal(now.elevationRefinement.kind, 'simulation-adjustment');
  assert.equal(now.elevationRefinement.method, 'c2-grade-redistribution');
  assert.equal(now.elevationRefinement.minimumDisplaySubdivisions, 6);
  assert.ok(now.elevationRefinement.maximumAdjustmentM > 32 && now.elevationRefinement.maximumAdjustmentM < 33);
  assert.equal(now.elevationSmoothingSigmaM, 90, 'the initial DEM filter is retained');
  assert.equal(now.elevationProfile, null, 'this is not the official Spa altitude profile');
  for (const key of ['length', 'spacing', 'rawLength', 'scale', 'elevationMin', 'elevationMax']) assert.equal(now[key], old[key], key);
  assert.deepEqual(now.projection, old.projection); assert.deepEqual(now.bounds, old.bounds);
  now.points.forEach((p, i) => {
    const q = old.points[i];
    for (const key of ['x', 'y', 's', 'curvature', 'rawZ']) assert.equal(p[key], q[key], key);
    assert.equal(p.demZ, q.z);
    if (p.s <= 50 || p.s >= 680) assert.equal(p.z, q.z, 'standing-start area and remaining lap heights unchanged');
    assert.ok(p.z >= now.elevationMin && p.z <= now.elevationMax, 'no new extrema');
  });
  assert.ok(peak(now.points.map(p => p.grade)) < .20, 'the relocated climb stays below 20%, versus the previous 23% hill');
  assert.ok(Math.abs(now.elevationGainM - old.elevationGainM) < 1e-9, 'same cumulative ascent');
  assert.equal(now.racingLine.length, old.racingLine.length);
  now.racingLine.points.forEach((p, i) => { for (const key of ['x', 'y', 'centerS']) assert.equal(p[key], old.racingLine.points[i][key], key); });
});

test('a reused name, different origin, reversed layout or absent elevation cannot receive this derived profile', () => {
  assert.ok(Profile.eligible(circuit));
  for (const other of [reference, circuits.find(c => c.id === 'spa'), { ...circuit, lengthM: 2500 },
    { ...circuit, coordinates: [...circuit.coordinates].reverse() }, { ...circuit, sourceProfile: 'imported' }]) {
    assert.equal(Profile.eligible(other), false); assert.equal(Race.buildTrack(other).elevationRefinement, undefined);
  }
  assert.equal(Race.buildTrack({ ...circuit, elevations: undefined }).elevationRefinement, undefined);
});

test('the first hill loses pitch pulses without moving them to its approach or the periodic seam', t => {
  const reports = [];
  for (const vehicleId of ['supra', 'staria']) {
    const old = fixture(reference, vehicleId), now = fixture(circuit, vehicleId);
    for (const [from, to] of [[0, 480], [480, 610], [0, 680], [-20, 20]]) {
      const before = motion(old, from, to), after = motion(now, from, to);
      if (from === 480 || to === 680) {
        const recorded = releasedHill[vehicleId][from === 480 ? 'corner' : 'whole'];
        assert.ok(after.maximumPitchRateDegPerM < recorded[0] * .3, 'at least 70% less maximum pitch rate than the reported DEM hill');
        assert.ok(after.pitchSecondRMS < recorded[1] * .35, 'at least 65% less rapid pitch variation than the reported DEM hill');
        assert.ok(after.maximumPitchRateDegPerM <= recorded[2], 'do not regress the already released regraded pitch-rate peak');
        assert.ok(after.pitchSecondRMS <= recorded[3], 'do not regress the already released regraded pitch variation');
      }
      if (from === 480) assert.ok(after.maximumPitchDeg < before.maximumPitchDeg * .3, 'the hill adjustment still lowers the corner slope with the current XY curve');
      if (from === 0 && to === 480) {
        assert.ok(after.maximumPitchRateDegPerM < .4, 'broad approach transition, not a relocated sharp pitch pulse');
        assert.ok(after.maximumPitchDeg < 20, 'the approach has no new steep pitch peak');
      }
      if (from < 0) assert.ok(after.maximumPitchRateDegPerM < .02, 'no timing-line height/grade kink');
      reports.push({ vehicleId, from, to, before, after });
    }
    const centre = { pathPoints: now.race.track.points, track: { ...now.race.track, length: now.race.track.centerlineLength } };
    for (const join of [0, 50, 400, 480, 500, 590, 680]) {
      const a = Pose.sample(centre, join - .0001), b = Pose.sample(centre, join + .0001);
      assert.ok(Math.abs(a.z - b.z) < .0001, 'continuous height at ' + join);
      assert.ok(Math.abs(a.grade - b.grade) < 1e-6, 'continuous grade at ' + join);
    }
    old.r.destroy(); now.r.destroy();
  }
  t.diagnostic(JSON.stringify(reports));
});

test('the adjusted hill feeds shared physics and both dry/wet races still finish deterministically', t => {
  const reports = [];
  for (const surface of ['dry', 'wet']) {
    const options = { circuit, vehicleIds: ['supra', 'gr86', 'staria'], racingLine: true, surface, laps: 1 };
    const a = new Race(options), b = new Race(options);
    while (!a.finished && a.time < 600) a.step(1);
    while (!b.finished && b.time < 600) b.step(.25);
    assert.ok(a.finished); assert.ok(a.cars.every(c => c.finished && !c.dnf));
    assert.deepEqual(a.cars, b.cars, 'fixed timestep result does not depend on batching');
    assert.ok(a.pathPoints.some(p => Math.abs(p.grade) > .1), 'gravity receives the regraded physical hill');
    reports.push({ surface, finishTimes: a.cars.map(c => ({ id: c.vehicleId, time: c.finishTime })) });
  }
  t.diagnostic(JSON.stringify(reports));
});
