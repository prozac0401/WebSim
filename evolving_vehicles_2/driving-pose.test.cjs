'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DrivingPose = require('./driving-pose.js');
const TrackRace = require('./race-engine.js');
const circuits = require('./circuits.js');
const races = circuits.map(circuit => new TrackRace({ circuit, vehicleIds: ['g80'], racingLine: true, laps: 1 }));
const turn = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);

test('all 11 course curves remain continuously bounded within 40 cm of the original scoring path', () => {
  assert.equal(races.length, 11);
  for (const race of races) {
    const info = DrivingPose.info(race);
    assert.ok(info.deviationBoundM <= .4, race.circuit.id + ': continuous Bezier bound');
    assert.equal(info.maximumElevationDeviationM, .025);
    assert.ok(info.elevationDeviationBoundM <= .025, race.circuit.id + ': continuous vertical Bezier bound');
    for (let i = 0; i < race.pathPoints.length * 8; i++) {
      const s = race.track.length * i / (race.pathPoints.length * 8), raw = race.sample(s), pose = DrivingPose.sample(race, s);
      assert.ok(Math.hypot(raw.x - pose.x, raw.y - pose.y) <= info.deviationBoundM + 1e-8, race.circuit.id + ': interior deviation');
      assert.ok(Math.abs(raw.elevation - pose.elevation) <= info.elevationDeviationBoundM + 1e-8, race.circuit.id + ': height deviation');
      for (const key of ['x', 'y', 'z', 'angle', 'grade', 'curvature']) assert.ok(Number.isFinite(pose[key]), race.circuit.id + ': ' + key);
    }
  }
});

test('position, heading, grade and curvature stay continuous at every knot and the lap seam', () => {
  const epsilon = 1e-5;
  for (const race of races) {
    const knots = race.pathPoints.length * DrivingPose.info(race).subdivisions;
    for (let i = 0; i < knots; i++) {
      const s = race.track.length * i / knots, a = DrivingPose.sample(race, s - epsilon), b = DrivingPose.sample(race, s + epsilon);
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < .0001, race.circuit.id + ': position knot ' + i);
      assert.ok(Math.abs(turn(b.angle - a.angle)) < .0001, race.circuit.id + ': heading knot ' + i);
      assert.ok(Math.abs(b.grade - a.grade) < .00001, race.circuit.id + ': grade knot ' + i);
      assert.ok(Math.abs(b.curvature - a.curvature) < .00002, race.circuit.id + ': curvature knot ' + i);
    }
    const a = DrivingPose.sample(race, 0), b = DrivingPose.sample(race, race.track.length);
    assert.deepEqual(a, b, race.circuit.id + ': exact timing-line periodicity');
  }
});

test('rendered direction, pitch and curvature describe the same actual 3D curve', () => {
  const h = .001;
  for (const race of races) for (let i = 0; i < 160; i++) {
    const s = race.track.length * (i + .31) / 160, a = DrivingPose.sample(race, s - h), p = DrivingPose.sample(race, s), b = DrivingPose.sample(race, s + h);
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(run > .0008 && run < .0025, race.circuit.id + ': nonzero, bounded forward motion');
    assert.ok(Math.abs(turn(Math.atan2(b.y - a.y, b.x - a.x) - p.angle)) < .00003, race.circuit.id + ': tangent alignment');
    assert.ok(Math.abs((b.z - a.z) / run - p.grade) < .00001, race.circuit.id + ': analytic grade');
    assert.ok(Math.abs(turn(b.angle - a.angle) / run - p.curvature) < .00005, race.circuit.id + ': analytic curvature');
  }
});

test('gentle-corner heading jitter drops on every real course without a delayed car heading', t => {
  const reports = [];
  for (const race of races) {
    const rawJerk = [], smoothJerk = [], rawSteps = [], smoothSteps = [];
    let older = null, previous = null;
    // 0.5 m corresponds to one 60 Hz frame at 108 km/h. Inspect consecutive
    // real gentle-corner samples, excluding straight/corner category changes.
    for (let s = 0; s < race.track.length; s += .5) {
      const raw = race.sample(s), pose = DrivingPose.sample(race, s);
      const current = { raw, pose, gentle: Math.abs(raw.curvature) > .0003 && Math.abs(raw.curvature) < .006 };
      if (older?.gentle && previous?.gentle && current.gentle) {
        const oldRawTurn = turn(previous.raw.angle - older.raw.angle), rawTurn = turn(raw.angle - previous.raw.angle);
        const oldSmoothTurn = turn(previous.pose.angle - older.pose.angle), smoothTurn = turn(pose.angle - previous.pose.angle);
        rawJerk.push(rawTurn - oldRawTurn); smoothJerk.push(smoothTurn - oldSmoothTurn);
        rawSteps.push(Math.abs(rawTurn)); smoothSteps.push(Math.abs(smoothTurn));
      }
      older = previous; previous = current;
    }
    assert.ok(rawJerk.length > 200, race.circuit.id + ': enough actual gentle-corner samples');
    const ratio = rms(smoothJerk) / rms(rawJerk);
    assert.ok(ratio < .15, race.circuit.id + ': angular second-difference RMS reduction, got ' + ratio);
    assert.ok(Math.max(...smoothSteps) < Math.max(...rawSteps) * .3, race.circuit.id + ': eliminate segment heading snaps');
    reports.push({ id: race.circuit.id, angularJitterRatio: +ratio.toFixed(4), maximumRawDegreesPerHalfMetre: +(Math.max(...rawSteps) * 180 / Math.PI).toFixed(3), maximumSmoothDegreesPerHalfMetre: +(Math.max(...smoothSteps) * 180 / Math.PI).toFixed(3) });
  }
  t.diagnostic(JSON.stringify(reports));
});

test('the line drawing and every car use identical, deterministic, stateless samples', () => {
  for (const race of races) {
    const points = DrivingPose.path(race);
    assert.equal(DrivingPose.path(race), points, 'cached path avoids live reconstruction');
    assert.ok(Object.isFrozen(points) && Object.isFrozen(points[0]));
    for (let i = 0; i < points.length; i += 23) {
      assert.deepEqual(DrivingPose.sample(race, points[i].s), points[i], race.circuit.id + ': line/vehicle alignment');
      const repeated = DrivingPose.sample(race, points[i].s + race.track.length * 3);
      assert.ok(Math.hypot(points[i].x - repeated.x, points[i].y - repeated.y) < 1e-9, 'multiple lap wrap');
      DrivingPose.sample(race, points[i].s - 173.8);
      assert.deepEqual(DrivingPose.sample(race, points[i].s), points[i], 'sampling order has no state or lag');
    }
  }
});

test('display sampling cannot alter physical speeds, positions, scores or source geometry', () => {
  const opts = { circuit: circuits[0], vehicleIds: ['g80'], racingLine: true, laps: 1 };
  const observed = new TrackRace(opts), control = new TrackRace(opts), original = JSON.stringify(observed.pathPoints);
  for (let i = 0; i < 30 && !observed.finished; i++) {
    observed.step(15); control.step(15);
    DrivingPose.sample(observed, observed.cars[0].distance); DrivingPose.sample(observed, observed.cars[0].distance + 20); DrivingPose.path(observed);
  }
  assert.ok(observed.finished && control.finished, 'complete a physical lap');
  assert.deepEqual(observed.cars, control.cars, 'race outcomes remain bit-for-bit equal');
  assert.equal(JSON.stringify(observed.pathPoints), original, 'source racing line is untouched');
  assert.equal(observed.time, control.time);
});

test('legacy fixtures and missing elevation preserve their contracts', () => {
  const fake = { sample: s => ({ x: s, y: 3, elevation: null, angle: .7, grade: 0, s }) };
  assert.deepEqual(DrivingPose.sample(fake, 4), { x: 4, y: 3, z: 0, elevation: null, angle: .7, grade: 0, s: 4 });
  assert.equal(DrivingPose.sample({}, 4), null);
  assert.deepEqual(DrivingPose.path({}), []);
  const source = races[0];
  const flat = { track: { ...source.track, hasElevation: false }, pathPoints: source.pathPoints.map(p => ({ ...p, z: 0 })) };
  const sample = DrivingPose.sample(flat, 21);
  assert.equal(sample.elevation, null); assert.equal(sample.z, 0); assert.equal(sample.grade, 0);
  for (const invalid of [NaN, Infinity, -Infinity]) assert.throws(() => DrivingPose.sample(source, invalid), /finite/);
});
