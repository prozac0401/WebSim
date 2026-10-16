'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TrackRace = require('./race-engine.js');
const VehicleRacingLine = require('./vehicle-racing-line.js');
const DrivingPose = require('./driving-pose.js');
const circuits = require('./circuits.js');
const races = circuits.map(circuit => new TrackRace({ circuit, vehicleIds: ['ray', 'supra'], racingLine: true, laps: 1 }));

test('the selected physical path minimizes the vehicle force envelope and can differ by performance', () => {
  let different = 0;
  for (const race of races) {
    for (const car of race.cars) {
      const line = VehicleRacingLine.build(race, car), times = line.candidateScores.map(s => s.estimatedFlyingLapSeconds);
      assert.equal(line.method, 'vehicle-force-envelope-candidate-search');
      assert.equal(line.candidateCount, 9);
      assert.ok(times.every(time => Number.isFinite(time) && time > 0));
      assert.equal(line.performance.estimatedFlyingLapSeconds, Math.min(...times));
      assert.ok(line.performance.estimatedFlyingLapSeconds <= line.performance.baselineFlyingLapSeconds);
      assert.equal(car.pathPoints, line.points, 'the chosen geometry drives physical sampling');
      assert.equal(car.trackLength, line.length);
      assert.equal(car.totalDistance, line.length * race.laps);
      assert.equal(line.spacing, line.length / line.points.length);
    }
    if (race.cars[0].racingLine.id !== race.cars[1].racingLine.id) different++;
  }
  assert.ok(different >= 5, 'different acceleration/grip/braking selects different safe paths on multiple circuits');
});

test('every selected line remains inside the road, preserves elevation and shares the timing-line corridor', () => {
  for (const race of races) for (const car of race.cars) {
    const line = car.racingLine, center = race.track.points, baseline = race.track.racingLine;
    for (let i = 0; i < line.anchors.length; i++) {
      const p = line.anchors[i], a = center[i];
      assert.ok(Math.abs(p.lateralOffsetM) <= line.maxOffsetM + 1e-10, 'bounded centerline-normal movement');
      assert.ok(Math.abs(Math.hypot(p.x - a.x, p.y - a.y) - Math.abs(p.lateralOffsetM)) < 1e-9);
      assert.equal(p.z, a.z, 'lateral choices do not invent new road heights');
      if (Math.min(a.s, race.track.centerlineLength - a.s) <= 50)
        assert.deepEqual(p, baseline.anchors[i], 'all candidates share the exact first/last 50 m anchors');
    }
    for (const p of line.points) {
      const u = p.centerS / race.track.centerlineSpacing, i = Math.floor(u) % center.length, t = u - Math.floor(u);
      const z = center[i].z + (center[(i + 1) % center.length].z - center[i].z) * t;
      assert.ok(Math.abs(p.z - z) < 1e-9, 'resampling retains centerline elevation correspondence');
      assert.ok(Number.isFinite(p.curvature) && Number.isFinite(p.grade));
    }
    assert.deepEqual(race.sampleForCar(car, 0), race.sampleForCar(car, car.trackLength), 'physical lap seam is periodic');
    const standing = DrivingPose.sampleCar(race, { ...car, distance: 0, standingStartDistance: 0 });
    assert.equal(standing.x, center[0].x); assert.equal(standing.y, center[0].y);
  }
});

test('physical signatures cache deterministic choices without cosmetic offsets or source mutation', () => {
  const race = races[0], car = race.cars[0], before = JSON.stringify(race.track.racingLine);
  const line = VehicleRacingLine.build(race, car);
  assert.equal(VehicleRacingLine.build(race, { ...car, id: 4321, color: '#000000', name: 'irrelevant' }), line);
  const changed = VehicleRacingLine.build(race, { ...car, powerPs: car.powerPs * 2 });
  assert.notEqual(changed, line, 'power is part of the physical cache key');
  assert.notDeepEqual(changed.candidateScores, line.candidateScores, 'power changes the acceleration envelope');
  const wet = new TrackRace({ circuit: race.circuit, vehicleIds: ['ray'], racingLine: true, surface: 'wet' });
  assert.notDeepEqual(wet.cars[0].racingLine.candidateScores, line.candidateScores, 'traction and braking alter the score');
  assert.equal(JSON.stringify(race.track.racingLine), before, 'shared source path stays unchanged');
  assert.equal(VehicleRacingLine.build({}, car), null);
});

test('a flying generation retains the same visible timing-line pose despite individual path lengths', () => {
  for (const race of races) {
    const poses = race.cars.map(car => DrivingPose.sampleCar(race, { ...car, standingStartDistance: null }, 0));
    assert.ok(Math.hypot(poses[0].x - poses[1].x, poses[0].y - poses[1].y) < .0002, 'sub-millimetre resampling variation at the shared seam');
    const angle = Math.atan2(Math.sin(poses[0].angle - poses[1].angle), Math.cos(poses[0].angle - poses[1].angle));
    assert.ok(Math.abs(angle) < .0001, 'no generation-change heading snap');
  }
});

test('performance-selected geometry improves real simulated laps for both low-power and sports cars', () => {
  const options = { circuit: circuits.find(c => c.id === 'inje'), vehicleIds: ['ray', 'supra'], racingLine: true, laps: 1 };
  const selected = new TrackRace(options), control = new TrackRace(options);
  for (const car of control.cars) {
    const baseline = control.track.racingLine;
    car.pathPoints = baseline.points; car.trackLength = baseline.length; car.pathSpacing = baseline.spacing;
    car.totalDistance = baseline.length; car.speedProfile = control._makeSpeedProfile(car);
  }
  for (let i = 0; i < 12 && (!selected.finished || !control.finished); i++) { selected.step(60); control.step(60); }
  assert.ok(selected.finished && control.finished);
  for (let i = 0; i < selected.cars.length; i++) {
    assert.ok(selected.cars[i].finishTime < control.cars[i].finishTime - .1, 'candidate ranking also benefits the actual force-integrated lap');
    assert.equal(selected.cars[i].powerPs, control.cars[i].powerPs, 'performance is not inflated to create a path benefit');
    assert.equal(selected.cars[i].massKg, control.cars[i].massKg);
  }
});
