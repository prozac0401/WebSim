'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Race = require('./race-engine.js');
const Pose = require('./driving-pose.js');
const Evolution = require('./tuning-evolution.js');
const NGS = require('./n-grin-shift.js');
const circuits = require('./circuits.js');
const DT = Race.FIXED_DT;
const turn = a => Math.atan2(Math.sin(a), Math.cos(a));
const close = (a, b, tolerance = 1e-8, context = '') => assert.ok(Math.abs(a - b) <= tolerance, `${context}: ${a} vs ${b}`);
const entry = (id = 'supra', variantId = 'supra-3.0t-rz', levels = {}, uid = 'test') =>
  Evolution.createEntrant({ vehicleId: id, variantId, levels, uid });
const make = (id = 'inje', overrides = {}) => new Race({ circuit: circuits.find(c => c.id === id),
  entrants: [entry()], laps: 3, ...overrides });
let realRaces;
const allRaces = () => realRaces ||= circuits.map(circuit => new Race({ circuit, vehicleIds: ['ray', 'supra'], racingLine: true, laps: 3 }));
const finish = race => { for (let i = 0; i < 80 && !race.finished; i++) race.step(30); assert.ok(race.finished); return race; };
function snapshot(race) {
  return JSON.parse(JSON.stringify({ time: race.time, ticks: race._ticks, finished: race.finished,
    cars: race.cars.map(c => ({ uid: c.uid, distance: c.distance, speed: c.speed, lap: c.lap,
      currentLap: c.currentLap, lapTimes: c.lapTimes, bestLap: c.bestLap, lastLapAt: c.lastLapAt,
      finishTime: c.finishTime, finishSpeed: c.finishSpeed, finishRemainderSeconds: c.finishRemainderSeconds,
      transmission: c.transmission, telemetry: c.telemetry, ngs: c.ngs })) }));
}

test('first-lap distance includes the actual open launch arc and every later lap uses the flying arc', () => {
  let unequalLengths = 0;
  for (const race of allRaces()) for (const car of race.cars) {
    const motion = car.motionTrajectory, context = race.circuit.id + '/' + car.vehicleId;
    assert.ok(motion && motion.launch && motion.flying, context);
    const first = motion.launch.length + motion.flying.length - motion.launch.joinDistance;
    close(car.firstLapLength, first, 1e-9, context);
    close(car.trackLength, motion.flying.length, 1e-9, context);
    close(car.totalDistance, first + 2 * motion.flying.length, 1e-9, context);
    if (Math.abs(first - car.trackLength) > .001) unequalLengths++;
    assert.equal(car.pathPoints, motion.flying.points);
    close(race.lapEndDistanceForCar(car, 0), 0);
    for (let lap = 1; lap <= 3; lap++) {
      const boundary = first + (lap - 1) * car.trackLength;
      close(race.lapEndDistanceForCar(car, lap), boundary, 1e-9, context);
      close(race.progressForCar(car, boundary), lap, 1e-9, context);
      assert.equal(race.pathStateForCar(car, boundary).lapIndex, lap);
      assert.ok(race.progressForCar(car, boundary - .001) < lap);
      assert.ok(race.progressForCar(car, boundary + .001) > lap);
    }
    close(race.progressForCar(car, first / 2), .5);
    close(race.progressForCar(car, first + car.trackLength / 2), 1.5);
  }
  assert.ok(unequalLengths >= 1, 'the test must exercise genuinely different first/flying lengths');
});

test('physical and displayed paths share a straight launch, C2 joins and an unconstrained periodic flying seam', () => {
  const epsilon = 1e-5;
  for (const race of allRaces()) for (const car of race.cars) {
    const context = race.circuit.id + '/' + car.vehicleId, motion = car.motionTrajectory;
    const start = race.track.points[0], next = race.track.points[1];
    const initial = race.sampleForCar(car, 0);
    close(initial.x, start.x, 1e-10, context); close(initial.y, start.y, 1e-10, context);
    close(turn(initial.angle - Math.atan2(next.y - start.y, next.x - start.x)), 0, 1e-10, context);
    close(initial.curvature, 0, 1e-10, context);
    const flyingOrigin = motion.sample(0, false), tx = Math.cos(initial.angle), ty = Math.sin(initial.angle);
    close((flyingOrigin.x - start.x) * tx + (flyingOrigin.y - start.y) * ty, 0, 1e-7, context + ': physical timing plane');
    const behind = race.sampleForCar(car, -24);
    close(Math.hypot(behind.x - initial.x, behind.y - initial.y), 24, 1e-7, context);
    close(turn(behind.angle - initial.angle), 0, 1e-10, context);
    for (const join of [motion.launch.length, car.firstLapLength, car.firstLapLength + car.trackLength]) {
      const a = race.sampleForCar(car, join - epsilon), b = race.sampleForCar(car, join + epsilon);
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y, (b.elevation || 0) - (a.elevation || 0)) < .0001, context + ': C0 join');
      assert.ok(Math.abs(turn(b.angle - a.angle)) < .0001, context + ': C1 join');
      assert.ok(Math.abs(b.grade - a.grade) < .00001, context + ': grade join');
      assert.ok(Math.abs(b.curvature - a.curvature) < .00002, context + ': C2 join');
    }
    for (const distance of [0, 1, 25, motion.launch.length, car.firstLapLength - 24,
      car.firstLapLength, car.firstLapLength + 24, car.firstLapLength + car.trackLength + 120]) {
      const physical = race.sampleForCar(car, distance), visible = Pose.sampleCar(race, car, distance);
      for (const key of ['x', 'y', 'angle', 'grade', 'curvature']) close(visible[key], physical[key], 1e-12, context + ':' + key);
      assert.equal(visible.elevation, physical.elevation);
    }
    for (let i = 1; i < 160; i++) {
      const s = car.firstLapLength * i / 160, h = .001;
      const a = race.sampleForCar(car, s - h), b = race.sampleForCar(car, s + h);
      close(Math.hypot(b.x - a.x, b.y - a.y) / (2 * h), 1, .00001, context + ': actual horizontal arc distance');
    }
    const flying = { ...car, standingStartDistance: null };
    for (const distance of [0, 23, car.trackLength - 5]) {
      const a = race.sampleForCar(flying, distance), b = race.sampleForCar(flying, distance + car.trackLength);
      for (const key of ['x', 'y', 'grade', 'curvature']) close(a[key], b[key], 1e-8, context + ': periodic ' + key);
      close(turn(a.angle - b.angle), 0, 1e-8, context);
    }
  }
});

test('launch and timing-line body corners remain on the same asphalt ribbon on all eleven courses', t => {
  const Road = require('./circuit-road.js');
  let minimum = Infinity, worst = null;
  for (const race of allRaces()) {
    const road = Road.build(race.track);
    for (const car of race.cars) {
      const width = car.spec.widthMm ?? Evolution.VARIANTS[car.vehicleId][0].spec.widthMm;
      const stations = [];
      for (let s = 0; s <= car.motionTrajectory.launch.length; s += .5) stations.push(s);
      for (let offset = -50; offset <= 50; offset += .5) stations.push(car.firstLapLength + offset);
      for (const s of stations) {
        const p = race.sampleForCar(car, s), tx = Math.cos(p.angle), ty = Math.sin(p.angle);
        for (const fore of [-1, 1]) for (const side of [-1, 1]) {
          const corner = { x: p.x + fore * car.spec.lengthMm / 2000 * tx - side * width / 2000 * ty,
            y: p.y + fore * car.spec.lengthMm / 2000 * ty + side * width / 2000 * tx };
          let nearest = Infinity;
          // Search only the corresponding road leg. A nearby parallel lane
          // must not incorrectly certify a corner that has left its own road.
          for (let ds = -15; ds < 15; ds++) {
            const a = road.sample(p.centerS + ds), b = road.sample(p.centerS + ds + 1);
            const dx = b.x - a.x, dy = b.y - a.y;
            const u = Math.max(0, Math.min(1, ((corner.x - a.x) * dx + (corner.y - a.y) * dy) / (dx * dx + dy * dy)));
            nearest = Math.min(nearest, Math.hypot(corner.x - a.x - u * dx, corner.y - a.y - u * dy));
          }
          const clearance = race.track.width / 2 - nearest;
          assert.ok(clearance > .05, race.circuit.id + '/' + car.vehicleId + ': body leaves its asphalt at ' + s);
          if (clearance < minimum) { minimum = clearance; worst = { circuit: race.circuit.id, vehicle: car.vehicleId, distance: s }; }
        }
      }
    }
  }
  t.diagnostic(JSON.stringify({ minimumAsphaltClearanceM: minimum, ...worst }));
});

test('past and future queries select their own path without mutating the current car or restarting launch', () => {
  const race = make(), car = race.cars[0], motion = car.motionTrajectory;
  const positions = [-24, 0, motion.launch.length - .01, motion.launch.length + .01,
    car.firstLapLength - 24, car.firstLapLength + .01, car.firstLapLength + 120,
    car.firstLapLength + car.trackLength + .01];
  const expected = positions.map(s => ({ pose: race.sampleForCar(car, s), path: race.pathStateForCar(car, s), target: race._target(car, s) }));
  car.distance = car.firstLapLength + .1; car.lap = 1; car.currentLap = 2;
  const before = JSON.stringify(car);
  assert.deepEqual(positions.map(s => ({ pose: race.sampleForCar(car, s), path: race.pathStateForCar(car, s), target: race._target(car, s) })), expected);
  assert.equal(JSON.stringify(car), before, 'camera and guidance queries cannot switch the active physical path');
  assert.equal(race.pathStateForCar(car, 0).pathKind, 'launch');
  assert.equal(race.pathStateForCar(car, motion.launch.length + .01).pathKind, 'flying');
  close(race.pathStateForCar(car, motion.launch.length + .01).flyingDistance, motion.launch.joinDistance + .01);
  assert.equal(race.pathStateForCar(car, car.firstLapLength + .01).pathKind, 'flying');
});

test('canonical stations and NGS zones stay geographic on both first and flying laps', () => {
  for (const id of ['monza', 'spa', 'silverstone']) {
    const race = make(id, { entrants: [entry('avante_n', 'avante-n-2.0t-dct')], laps: 2 }), car = race.cars[0];
    const motion = car.motionTrajectory, offset = motion.launch.length - motion.launch.joinDistance;
    const rolling = { ...car, standingStartDistance: null }, zones = NGS.getZones(race.track), centerLength = race.track.centerlineLength;
    assert.ok(zones.length > 0);
    let wraps = 0, previous = 0;
    for (let i = 0; i <= 500; i++) {
      const s = car.trackLength * i / 500, p = race.sampleForCar(rolling, s);
      assert.ok(Number.isFinite(p.centerS) && p.centerS >= 0 && p.centerS < centerLength);
      if (i && p.centerS < previous - centerLength / 2) wraps++;
      previous = p.centerS;
      if (s >= motion.launch.joinDistance && s < car.trackLength) {
        const first = race.sampleForCar(car, s + offset), later = race.sampleForCar(car, car.firstLapLength + s);
        close(first.centerS, p.centerS, 1e-8, id + ': first-lap geographic station');
        close(later.centerS, p.centerS, 1e-8, id + ': flying-lap geographic station');
        for (const zone of zones) {
          const inside = sample => ((sample.centerS - zone.startS) % centerLength + centerLength) % centerLength < zone.lengthM;
          assert.equal(inside(first), inside(p)); assert.equal(inside(later), inside(p));
        }
      }
    }
    assert.equal(wraps, 1, id + ': exactly one canonical wrap per flying lap');
  }
});

test('intermediate lap crossings retain speed and drivetrain state; final timing sums actual unequal lap distances', () => {
  const race = make('inje', { entrants: [entry('carnival', 'carnival-1.6heV')], laps: 3 }), car = race.cars[0];
  const transmission = car.transmission, telemetry = car.telemetry, motion = car.motionTrajectory;
  let crossings = 0;
  while (!race.finished && race.time < 1500) {
    const oldLap = car.lap, oldSpeed = car.speed, oldDistance = car.distance;
    const reserve = car.telemetry.battery.reserveNormalized;
    race.step(DT);
    if (car.lap > oldLap) {
      crossings++;
      const boundary = race.lapEndDistanceForCar(car, oldLap + 1);
      assert.ok(oldDistance <= boundary && car.distance >= boundary);
      assert.equal(car.motionTrajectory, motion); assert.equal(car.transmission, transmission); assert.equal(car.telemetry, telemetry);
      if (!car.finished) {
        assert.ok(car.speed > 1, 'intermediate timing line never restarts from rest');
        assert.ok(Math.abs(car.speed - oldSpeed) < .5, 'no artificial speed reset or gift at the path boundary');
        assert.ok(Math.abs(car.telemetry.battery.reserveNormalized - reserve) < .001, 'lap crossing does not refill the display reserve');
        assert.equal(car.standingStartDistance, 0, 'absolute-distance sampling, not clearing the launch flag, prevents a repeat launch');
      }
    }
  }
  assert.equal(race.finished, true); assert.equal(car.dnf, false); assert.equal(crossings, 3);
  close(car.distance, car.firstLapLength + 2 * car.trackLength, 1e-9);
  assert.equal(car.lapTimes.length, 3);
  close(car.lapTimes.reduce((sum, time) => sum + time, 0), car.finishTime, 1e-8);
  assert.equal(car.bestLap, Math.min(...car.lapTimes));
  assert.ok(car.finishRemainderSeconds >= 0 && car.finishRemainderSeconds <= DT);
  const finished = snapshot(race); race.step(30); assert.deepEqual(snapshot(race), finished);
});

test('standing and explicit rolling measurements retain their own distances and deterministic playback', () => {
  const standing = make(), rolling = make('inje', { initialSpeed: 20 });
  assert.equal(standing.cars[0].speed, 0); assert.equal(standing.cars[0].standingStartDistance, 0);
  assert.equal(rolling.cars[0].speed, 20); assert.equal(rolling.cars[0].standingStartDistance, null);
  close(rolling.cars[0].firstLapLength, rolling.cars[0].trackLength);
  close(rolling.cars[0].totalDistance, 3 * rolling.cars[0].trackLength);
  const a = make(), b = make(), duration = 500, schedule = [1 / 30, 1 / 60, .017, .2, .007, .11];
  for (let elapsed = 0; elapsed < duration; elapsed += 30) a.step(Math.min(30, duration - elapsed));
  for (let elapsed = 0, i = 0; elapsed < duration;) {
    const delta = Math.min(schedule[i++ % schedule.length], duration - elapsed); b.step(delta); elapsed += delta;
  }
  assert.equal(a.finished, true); assert.deepEqual(snapshot(a), snapshot(b));
  const before = snapshot(b); b.step(0); assert.deepEqual(snapshot(b), before);
  finish(rolling); assert.equal(rolling.cars[0].lapTimes.length, 3);
});
