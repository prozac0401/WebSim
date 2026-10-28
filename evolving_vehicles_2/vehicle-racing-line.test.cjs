'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TrackRace = require('./race-engine.js');
const VehicleRacingLine = require('./vehicle-racing-line.js');
const DrivingPose = require('./driving-pose.js');
const circuits = require('./circuits.js');
const races = circuits.map(circuit => new TrackRace({ circuit, vehicleIds: ['ray', 'supra'], racingLine: true, laps: 1 }));
const geometry = ({ absoluteDistance, ...pose }) => pose;

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
      assert.equal(car.racingLine, line, 'candidate ranking retains its raw source geometry');
      assert.equal(car.pathPoints, car.motionTrajectory.flying.points, 'the selected C2 trajectory drives physical sampling');
      assert.equal(car.trackLength, car.motionTrajectory.flying.length);
      assert.equal(car.firstLapLength, car.motionTrajectory.firstLapLength);
      assert.equal(car.totalDistance, car.firstLapLength + car.trackLength * (race.laps - 1));
      assert.equal(line.spacing, line.length / line.points.length);
    }
    if (race.cars[0].racingLine.id !== race.cars[1].racingLine.id) different++;
  }
  assert.ok(different >= 5, 'different acceleration/grip/braking selects different safe paths on multiple circuits');
});

test('every selected source line remains inside the road and preserves elevation without a shared timing-line constraint', () => {
  let freeSeamChoices = 0;
  for (const race of races) for (const car of race.cars) {
    const line = car.racingLine, center = race.track.points, baseline = race.track.racingLine;
    for (let i = 0; i < line.anchors.length; i++) {
      const p = line.anchors[i], a = center[i];
      assert.ok(Math.abs(p.lateralOffsetM) <= line.maxOffsetM + 1e-10, 'bounded centerline-normal movement');
      assert.ok(Math.abs(Math.hypot(p.x - a.x, p.y - a.y) - Math.abs(p.lateralOffsetM)) < 1e-9);
      assert.equal(p.z, a.z, 'lateral choices do not invent new road heights');
      if (Math.min(a.s, race.track.centerlineLength - a.s) <= 50 &&
          Math.hypot(p.x - baseline.anchors[i].x, p.y - baseline.anchors[i].y) > 1e-6) freeSeamChoices++;
    }
    for (const p of line.points) {
      const u = p.centerS / race.track.centerlineSpacing, i = Math.floor(u) % center.length, t = u - Math.floor(u);
      const z = center[i].z + (center[(i + 1) % center.length].z - center[i].z) * t;
      assert.ok(Math.abs(p.z - z) < 1e-9, 'resampling retains centerline elevation correspondence');
      assert.ok(Number.isFinite(p.curvature) && Number.isFinite(p.grade));
    }
    const flying = { ...car, standingStartDistance: null };
    assert.deepEqual(geometry(race.sampleForCar(flying, 0)), geometry(race.sampleForCar(flying, car.trackLength)), 'the flying geometry is periodic; its absolute-distance metadata is intentionally unwrapped');
    const standing = DrivingPose.sampleCar(race, { ...car, distance: 0, standingStartDistance: 0 });
    assert.equal(standing.x, center[0].x); assert.equal(standing.y, center[0].y);
  }
  assert.ok(freeSeamChoices > 0, 'at least one actual selected line can optimize its former protected timing-line corridor');
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

test('each flying line is independently periodic while every fresh measurement starts centered and straight', () => {
  for (const race of races) {
    for (const car of race.cars) {
      const rolling = { ...car, standingStartDistance: null }, p = DrivingPose.sampleCar(race, rolling, 0);
      assert.deepEqual(geometry(DrivingPose.sampleCar(race, rolling, car.trackLength)), geometry(p), 'each displayed geometry is exactly periodic');
      const start = race.track.points[0], next = race.track.points[1];
      const standing = DrivingPose.sampleCar(race, car, 0), physical = race.sampleForCar(car, 0);
      for (const pose of [standing, physical]) {
        assert.ok(Math.hypot(pose.x - start.x, pose.y - start.y) < 1e-10);
        const delta = pose.angle - Math.atan2(next.y - start.y, next.x - start.x);
        assert.ok(Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) < 1e-10);
      }
    }
  }
});

test('performance-selected geometry improves real simulated laps for both low-power and sports cars', () => {
  const options = { circuit: circuits.find(c => c.id === 'inje'), vehicleIds: ['ray', 'supra'], racingLine: true, laps: 1 };
  const selected = new TrackRace(options), control = new TrackRace(options);
  for (const car of control.cars) {
    const baseline = control.track.racingLine;
    car.racingLine = baseline;
    car.pathPoints = baseline.points; car.trackLength = baseline.length; car.pathSpacing = baseline.spacing;
    car.motionTrajectory = DrivingPose.createMotion(control, car);
    car.pathPoints = car.motionTrajectory.flying.points; car.trackLength = car.motionTrajectory.flying.length;
    car.pathSpacing = car.motionTrajectory.flying.spacing; car.firstLapLength = car.motionTrajectory.firstLapLength;
    car.totalDistance = car.firstLapLength;
    car.speedProfile = control._makeSpeedProfile(car);
    // Rebuild the launch envelope through the same public geometry used by
    // the constructor rather than accidentally keeping the selected line's.
    car.launchSpeedProfile = control._makeSpeedProfile(car, 1, car.motionTrajectory.launch);
  }
  for (let i = 0; i < 12 && (!selected.finished || !control.finished); i++) { selected.step(60); control.step(60); }
  assert.ok(selected.finished && control.finished);
  for (let i = 0; i < selected.cars.length; i++) {
    assert.ok(selected.cars[i].finishTime < control.cars[i].finishTime - .1, 'candidate ranking also benefits the actual force-integrated lap');
    assert.equal(selected.cars[i].powerPs, control.cars[i].powerPs, 'performance is not inflated to create a path benefit');
    assert.equal(selected.cars[i].massKg, control.cars[i].massKg);
  }
});
