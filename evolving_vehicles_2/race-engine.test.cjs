'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TrackRace = require('./race-engine.js');
const specifications = require('./circuit-vehicle-specs.js');
const circuits = require('./circuits.js');

const circle = {
  id: 'test-circle', name: '200 m radius validation circle', lengthM: 400 * Math.PI,
  coordinates: Array.from({ length: 257 }, (_, i) => {
    const angle = i / 256 * 2 * Math.PI;
    return [127 + Math.cos(angle) * 200 / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + Math.sin(angle) * 200 / 111195.08];
  })
};
const make = options => new TrackRace({ circuit: circle, vehicleIds: ['k5'], laps: 2, ...options });
function finish(race) {
  for (let i = 0; i < 240 && !race.finished; i++) race.step(30);
  assert.equal(race.finished, true, 'race should finish without a stuck vehicle');
  return race;
}

test('all circuit presets use the original or circuit-only factory mass, power and torque', () => {
  assert.equal(TrackRace.VEHICLES.length, 15);
  for (const vehicle of TrackRace.VEHICLES) {
    assert.equal(vehicle.massKg, specifications[vehicle.id].curbMassKg);
    assert.equal(vehicle.powerPs, specifications[vehicle.id].powerPs);
    assert.equal(vehicle.torqueNm, specifications[vehicle.id].torqueNm);
  }
  const factory = make(), tuned = make({ tuning: 1.6 });
  assert.equal(tuned.cars[0].massKg, factory.cars[0].massKg);
  assert.equal(tuned.cars[0].powerPs, factory.cars[0].powerPs * 1.6);
  assert.equal(tuned.cars[0].torqueNm, factory.cars[0].torqueNm * 1.6);
  assert.equal(tuned.cars[0].grip, factory.cars[0].grip);
});

test('geographic track has metre scale, periodic samples and stable circle curvature', () => {
  const race = make();
  assert.equal(race.track.length, circle.lengthM);
  assert.ok(Math.abs(race.track.bounds.width - 400) < 1);
  assert.ok(Math.abs(race.track.bounds.height - 400) < 1);
  const a = race.sample(17), b = race.sample(17 + race.track.length), c = race.sample(17 - race.track.length);
  for (const key of ['x', 'y', 'curvature']) {
    assert.ok(Math.abs(a[key] - b[key]) < 1e-8);
    assert.ok(Math.abs(a[key] - c[key]) < 1e-8);
  }
  for (const point of race.track.points) assert.ok(Math.abs(Math.abs(point.curvature) - 1 / 200) < .0002);
});

test('fixed timestep produces identical results regardless of frame batching', () => {
  const a = make({ vehicleIds: ['k5', 'g80', 'ray'] }), b = make({ vehicleIds: ['k5', 'g80', 'ray'] });
  a.step(60);
  for (let i = 0; i < 3600; i++) b.step(1 / 60);
  assert.equal(a.time, 60);
  assert.equal(a.time, b.time);
  assert.deepEqual(a.cars.map(c => [c.distance, c.speed, c.lapTimes]), b.cars.map(c => [c.distance, c.speed, c.lapTimes]));
});

test('lap crossings interpolate finish time and finished state remains stable', () => {
  const race = finish(make({ vehicleIds: ['k5', 'ray', 'g80'], laps: 3 }));
  for (const car of race.cars) {
    assert.equal(car.lap, 3);
    assert.equal(car.currentLap, 3);
    assert.equal(car.distance, race.totalDistance);
    assert.equal(car.lapTimes.length, 3);
    assert.ok(car.lapTimes.every(t => t > 0));
    assert.ok(Math.abs(car.lapTimes.reduce((a, b) => a + b, 0) - car.finishTime) < 1e-9);
    assert.equal(car.bestLap, Math.min(...car.lapTimes));
  }
  const order = race.standings();
  assert.ok(order.every((car, i) => i === 0 || car.finishTime >= order[i - 1].finishTime));
  assert.equal(race.time, Math.max(...race.cars.map(c => c.finishTime)));
  const before = JSON.stringify(race.cars), time = race.time;
  race.step(60);
  assert.equal(JSON.stringify(race.cars), before);
  assert.equal(race.time, time);
});

test('wet surface reduces corner speed and increases lap time; power tuning reduces time', () => {
  const dry = finish(make()), wet = finish(make({ surface: 'wet' })), tuned = finish(make({ tuning: 1.6 }));
  assert.ok(wet.cars[0].finishTime > dry.cars[0].finishTime * 1.05);
  assert.ok(tuned.cars[0].finishTime < dry.cars[0].finishTime);
  assert.ok(wet.cars[0].maxSpeed < dry.cars[0].maxSpeed);
  assert.equal(wet.cars[0].braking, dry.cars[0].braking * .62);
  assert.ok(Math.abs(dry.cars[0].maxSpeed - Math.sqrt(dry.cars[0].grip * 200)) < 1);
});

test('real imported circuits have braking-feasible speed profiles across the start line', () => {
  assert.ok(circuits.length >= 3);
  for (const circuit of circuits) {
    const race = new TrackRace({ circuit, vehicleIds: ['g80'], laps: 1 });
    const car = race.cars[0], profile = car.speedProfile;
    if (circuit.elevations) {
      assert.equal(race.track.hasElevation, true, circuit.id + ' must consume its supplied DEM');
      const before = race.sample(race.track.length - .001), after = race.sample(.001);
      assert.ok(Math.abs(before.elevation - after.elevation) < .01, circuit.id + ' continuous elevation at timing line');
      assert.ok(Math.abs(before.grade - after.grade) < .001, circuit.id + ' continuous grade at timing line');
      assert.ok(Math.abs(race.track.elevationGainM - race.track.elevationLossM) < 1e-8, circuit.id + ' balanced closed-loop gain/loss');
      assert.ok(race.track.points.every(p => Number.isFinite(p.z) && Number.isFinite(p.grade)), circuit.id + ' finite DEM interpolation');
    }
    assert.ok(profile.some(v => v < car.theoreticalTopSpeed * .8), circuit.id + ' must have meaningful corners');
    for (let i = 0; i < profile.length; i++) {
      const next = profile[(i + 1) % profile.length];
      assert.ok(profile[i] ** 2 <= next ** 2 + 2 * car.brakingProfile[i] * race.track.spacing + 1e-7, circuit.id + ' grade-aware feasible braking');
      const point = race.track.points[i], normal = 1 / Math.hypot(1, point.grade);
      assert.ok(profile[i] ** 2 * Math.abs(point.curvature) <= car.grip * normal + 1e-7, circuit.id + ' corner grip and normal load');
    }
    let observedBraking = false;
    for (let i = 0; i < 2400 && !race.finished; i++) {
      race.step(.25);
      observedBraking ||= car.phase === 'braking';
      assert.ok(Number.isFinite(car.speed) && car.speed >= 0);
      assert.ok(car.speed <= race._target(car, car.distance) + .15, circuit.id + ' speed must follow feasible profile');
    }
    assert.equal(race.finished, true);
    assert.equal(observedBraking, true, circuit.id + ' must decelerate before turns');
  }
});

test('elevation follows the exact geometry interpolation and retains absolute metres when horizontally scaled', () => {
  const coordinates = circle.coordinates.map(c => [...c]);
  coordinates.splice(50, 0, [...coordinates[50]]); // shared duplicate is removed as a pair
  const radians = Math.PI / 180, factor = Math.PI * 6371008.8 / 180;
  const cosine = Math.cos(coordinates.reduce((sum, c) => sum + c[1], 0) / coordinates.length * radians);
  const elevations = coordinates.map(c => 120 + .04 * (c[0] - coordinates[0][0]) * factor * cosine - .015 * (c[1] - coordinates[0][1]) * factor);
  const race = make({ circuit: { ...circle, lengthM: circle.lengthM * 1.25, coordinates, elevations, elevationSource: 'synthetic test plane', elevationResolutionM: 5 } });
  assert.equal(race.track.hasElevation, true);
  assert.equal(race.track.elevationSource, 'synthetic test plane');
  const originElevation = race.sample(0).elevation;
  for (const p of race.track.points) {
    const expected = originElevation + (.04 * p.x + .015 * p.y) / race.track.scale;
    assert.ok(Math.abs(p.z - expected) < 1e-8, 'z must share x/y interpolation, without horizontal scaling or reindexing');
  }
  assert.ok(race.track.elevationMin > 100 && race.track.elevationMax > 120);
  assert.ok(Math.abs(race.track.elevationGainM - race.track.elevationLossM) < 1e-9, 'closed route net rise is zero');
});

test('periodic hill elevation and grade stay continuous at the start and retain expected range/gain', () => {
  const elevations = circle.coordinates.map((_, i) => 120 + 25 * Math.sin(i / 256 * Math.PI * 2));
  const race = make({ circuit: { ...circle, elevations } });
  assert.ok(Math.abs(race.track.elevationMin - 95) < .1);
  assert.ok(Math.abs(race.track.elevationMax - 145) < .1);
  assert.ok(Math.abs(race.track.elevationGainM - 50) < .2);
  assert.ok(Math.abs(race.sample(race.track.length / 4).elevation - 145) < .1);
  assert.ok(Math.abs(race.sample(0).grade - 25 / 200) < .001);
  assert.ok(Math.abs(race.sample(race.track.length / 4).grade) < .001);
  const before = race.sample(race.track.length - .001), after = race.sample(.001);
  assert.ok(Math.abs(before.elevation - after.elevation) < .001);
  assert.ok(Math.abs(before.grade - after.grade) < .001);
  for (const s of [0, 19, race.track.length * .75]) {
    assert.ok(Math.abs(race.sample(s).elevation - race.sample(s + race.track.length).elevation) < 1e-10);
    assert.ok(Math.abs(race.sample(s).grade - race.sample(s - race.track.length).grade) < 1e-10);
  }
});

test('missing DEM remains explicitly unknown, while a measured level circuit has identical flat physics', () => {
  const absent = make(), level = make({ circuit: { ...circle, elevations: circle.coordinates.map(() => 250) } });
  assert.equal(absent.track.hasElevation, false);
  assert.equal(absent.track.elevationMin, null);
  assert.equal(absent.sample(10).elevation, null);
  assert.equal(absent.sample(10).grade, 0);
  assert.equal(level.track.hasElevation, true);
  assert.equal(level.sample(10).elevation, 250);
  absent.step(30); level.step(30);
  assert.equal(absent.cars[0].speed, level.cars[0].speed);
  assert.equal(absent.cars[0].distance, level.cars[0].distance);
});

test('coarse DEM cell steps are smoothed by distance without mutating source heights or planar geometry', () => {
  const elevations = circle.coordinates.map((_, i) => i >= 64 && i < 128 ? 140 : 100);
  const original = elevations.slice();
  const raw = make({ circuit: { ...circle, elevations } });
  const filtered = make({ circuit: { ...circle, elevations, elevationResolutionM: 90 } });
  assert.deepEqual(elevations, original, 'retain raw heights for provenance');
  assert.equal(filtered.track.elevationSmoothingSigmaM, 90);
  assert.equal(filtered.track.elevationSmoothingMethod, 'periodic-gaussian');
  assert.deepEqual(filtered.track.points.map(p => [p.x, p.y]), raw.track.points.map(p => [p.x, p.y]));
  assert.deepEqual(filtered.track.points.map(p => p.rawZ), raw.track.points.map(p => p.z));
  const maxGrade = race => Math.max(...race.track.points.map(p => Math.abs(p.grade)));
  assert.ok(maxGrade(filtered) < .2, '40 m cell discontinuity is spread over the 90 m resolution');
  assert.ok(maxGrade(filtered) < maxGrade(raw) / 5);
  assert.ok(filtered.track.elevationMin >= 100 - 1e-8 && filtered.track.elevationMax <= 140 + 1e-8);
  const before = filtered.sample(filtered.track.length - .001), after = filtered.sample(.001);
  assert.ok(Math.abs(before.elevation - after.elevation) < .001);
  assert.ok(Math.abs(before.grade - after.grade) < .001);
});

test('a car unable to climb retires after 30 continuous seconds, while moving cars continue and rank ahead', () => {
  const elevations = circle.coordinates.map((_, i) => 200 + 100 * Math.sin(i / 256 * Math.PI * 2));
  const circuit = { ...circle, elevations };
  const race = make({ circuit, vehicleIds: ['ray', 'g80'], laps: 1 });
  race.step(29);
  const stopped = race.cars[0], moving = race.cars[1];
  assert.equal(stopped.dnf, false);
  assert.equal(stopped.distance, 0);
  assert.ok(moving.distance > 1);
  race.step(1);
  assert.equal(stopped.dnf, true);
  assert.equal(stopped.retiredAt, 30);
  assert.equal(stopped.finishTime, null);
  assert.equal(stopped.finished, false);
  assert.equal(stopped.dnfReason, '오르막 구동력 부족');
  assert.equal(race.finished, false);
  assert.equal(race.standings()[0].vehicleId, 'g80');
  assert.equal(moving.stalledFor, 0, 'motion resets the continuous stall timer');
  finish(race);
  assert.equal(moving.finished, true);
  assert.equal(race.time, moving.finishTime);
  const terminal = JSON.stringify(race.cars);
  race.step(60);
  assert.equal(JSON.stringify(race.cars), terminal);
  const alone = make({ circuit, vehicleIds: ['ray'], laps: 1 });
  alone.step(60);
  assert.equal(alone.finished, true, 'all-DNF session must terminate');
  assert.equal(alone.time, 30);
  assert.equal(alone.cars[0].retiredAt, stopped.retiredAt);
});

test('uphill gravity reduces acceleration and downhill gravity assists it without changing the vehicle', () => {
  const elevations = circle.coordinates.map((_, i) => 120 + 20 * Math.sin(i / 256 * Math.PI * 2));
  const uphill = make({ circuit: { ...circle, elevations } });
  const downhill = make({ circuit: { ...circle, elevations: elevations.map(z => 240 - z) } });
  const flat = make();
  for (const race of [uphill, flat, downhill]) race.step(2);
  assert.ok(uphill.cars[0].speed < flat.cars[0].speed - 1);
  assert.ok(downhill.cars[0].speed > flat.cars[0].speed + 1);
  assert.ok(uphill.cars[0].slopeAcceleration < -.9);
  assert.ok(downhill.cars[0].slopeAcceleration > .9);
  assert.equal(uphill.cars[0].powerPs, downhill.cars[0].powerPs);
  assert.ok(uphill._equilibriumSpeed(uphill.cars[0], .1) < flat.cars[0].theoreticalTopSpeed);
  assert.ok(downhill._equilibriumSpeed(downhill.cars[0], -.1) > flat.cars[0].theoreticalTopSpeed);
});

test('elevation physics is deterministic across batched playback and changes the completed lap time', () => {
  const elevations = circle.coordinates.map((_, i) => 120 + 35 * Math.sin(i / 256 * Math.PI * 2));
  const options = { circuit: { ...circle, elevations }, vehicleIds: ['ray'], laps: 1 };
  const batch = make(options), frames = make(options), level = make({ vehicleIds: ['ray'], laps: 1 });
  batch.step(30);
  for (let i = 0; i < 1800; i++) frames.step(1 / 60);
  assert.equal(batch.cars[0].distance, frames.cars[0].distance);
  assert.equal(batch.cars[0].speed, frames.cars[0].speed);
  finish(batch); finish(frames); finish(level);
  assert.equal(batch.cars[0].finishTime, frames.cars[0].finishTime);
  assert.ok(Math.abs(batch.cars[0].finishTime - level.cars[0].finishTime) > 1, 'hills must affect completed race timing');
});

test('a downhill approach plans and starts braking earlier than the same flat corner', () => {
  const metres = 111195.08, cosine = Math.cos(37 * Math.PI / 180);
  const coordinates = [[0, 0], [800, 0], [800, 100], [0, 100], [0, 0]].map(([x, y]) => [127 + x / (metres * cosine), 37 + y / metres]);
  const layout = { id: 'slope-corner-test', name: 'Synthetic closed hill', lengthM: 1800, coordinates };
  const down = new TrackRace({ circuit: { ...layout, elevations: [100, 20, 20, 100, 100] }, vehicleIds: ['g80'], laps: 1, tuning: 1.6 });
  const flat = new TrackRace({ circuit: layout, vehicleIds: ['g80'], laps: 1, tuning: 1.6 });
  const up = new TrackRace({ circuit: { ...layout, elevations: [100, 180, 180, 100, 100] }, vehicleIds: ['g80'], laps: 1, tuning: 1.6 });
  assert.ok(down._target(down.cars[0], 650) < flat._target(flat.cars[0], 650));
  assert.ok(up._target(up.cars[0], 650) > flat._target(flat.cars[0], 650));
  const brakingStarts = [down, flat, up].map(race => {
    let brakingAt = null;
    for (let i = 0; i < 1000 && race.cars[0].distance < 820; i++) {
      race.step(.05);
      const car = race.cars[0];
      if (brakingAt === null && car.distance > 100 && car.phase === 'braking') brakingAt = car.distance;
      assert.ok(car.speed <= race._target(car, car.distance) + .15);
    }
    assert.ok(brakingAt !== null);
    return brakingAt;
  });
  assert.ok(brakingStarts[0] < brakingStarts[1] - 10, 'downhill braking should begin earlier on the route');
  assert.ok(brakingStarts[2] > brakingStarts[1] + 10, 'uphill gravity allows a later braking point');
});

test('all 15 vehicles reach a terminal result on all 11 circuits in dry/wet and factory/160% conditions', t => {
  assert.equal(circuits.length, 11);
  const retirements = [];
  for (const circuit of circuits) {
    for (const surface of ['dry', 'wet']) for (const tuning of [1, 1.6]) {
      const race = finish(new TrackRace({ circuit, vehicleIds: TrackRace.VEHICLES.map(v => v.id), laps: 1, surface, tuning }));
      for (const car of race.cars) {
        const context = `${circuit.id}/${surface}/${tuning}: ${car.vehicleId}`;
        assert.ok(Number.isFinite(car.distance) && Number.isFinite(car.speed), context);
        if (car.dnf) {
          assert.equal(surface, 'wet', context + ': every dry run must finish');
          assert.ok(Number.isFinite(car.retiredAt) && car.retiredAt >= 30 && car.retiredAt < 1000, context);
          assert.equal(car.finishTime, null, context);
          assert.ok(car.stalledFor >= 30 - 1e-8 && car.speed < .1, context + ': genuine continuous stall');
          retirements.push(context);
        } else {
          assert.ok(Number.isFinite(car.finishTime) && car.finishTime > 45 && car.finishTime < 1000, context);
          assert.ok(car.maxSpeed > 15 && car.maxSpeed < 100, context);
          assert.equal(car.lap, 1, context);
        }
      }
      const g80 = race.cars.find(c => c.vehicleId === 'g80'), ray = race.cars.find(c => c.vehicleId === 'ray');
      if (!g80.dnf && !ray.dnf) assert.ok(g80.finishTime < ray.finishTime, circuit.id + ': power/weight comparison');
    }
  }
  t.diagnostic(`${TrackRace.VEHICLES.length * circuits.length * 4} vehicle-runs across ${circuits.length * 4} sessions; ${retirements.length} retirements: ${retirements.join(', ') || 'none'}`);
});

test('guards reject invalid circuits, settings and time without silently corrupting state', () => {
  assert.throws(() => new TrackRace(), /circuit/i);
  assert.throws(() => make({ circuit: { ...circle, coordinates: [[0, 0], [0, 0], [0, 0]] } }), /distinct/i);
  assert.throws(() => make({ circuit: { ...circle, lengthM: NaN } }), /lengthM/);
  assert.throws(() => make({ circuit: { ...circle, coordinates: [[Infinity, 0], [0, 0], [1, 1]] } }), /finite/);
  assert.throws(() => make({ circuit: { ...circle, elevations: [10, 20, 30] } }), /elevations/);
  assert.throws(() => make({ circuit: { ...circle, elevations: circle.coordinates.map(() => NaN) } }), /elevations/);
  const brokenClosure = circle.coordinates.map(() => 100); brokenClosure[brokenClosure.length - 1] = 110;
  assert.throws(() => make({ circuit: { ...circle, elevations: brokenClosure } }), /first\/last/);
  for (const options of [{ vehicleIds: [] }, { vehicleIds: ['k5', 'k5'] }, { vehicleIds: ['toString'] }, { vehicleIds: ['unknown'] }, { surface: 'snow' }, { tuning: 2 }, { laps: 0 }, { laps: 1.5 }])
    assert.throws(() => make(options));
  const race = make();
  for (const dt of [-1, NaN, Infinity, 61, '1']) assert.throws(() => race.step(dt), /duration/);
  assert.throws(() => race.sample(NaN), /finite/);
  assert.equal(race.step(0), race);
  assert.equal(race.time, 0);
  assert.equal(race.cars[0].distance, 0);
});

function entrant(uid, overrides = {}, vehicleId = 'g80') {
  const base = TrackRace.VEHICLES.find(v => v.id === vehicleId);
  return { uid, vehicleId, variantId: uid, spec: { ...base, frontWeightFraction: .52,
    cgHeightM: .53, wheelbaseMm: 3010, trackWidthM: 1.63, downforceArea: 0,
    topSpeedMps: 85, reduction: 13.5, ...overrides } };
}

test('the model racing line is periodic, smoother, and stays inside the same road ribbon on all 11 layouts', () => {
  const segmentDistance = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  for (const circuit of circuits) {
    const race = new TrackRace({ circuit, entrants: [entrant('a'), entrant('b')], laps: 1 });
    const track = race.track, line = track.racingLine, n = track.points.length;
    assert.equal(line.measuredRecord, false);
    assert.equal(line.method, 'bounded-curvature-minimization');
    assert.equal(track.length, line.length);
    assert.equal(track.centerlineLength, circuit.lengthM);
    assert.ok(Math.abs(line.length - track.centerlineLength) > 1, 'actual racing-line distance is used without length rescaling');
    for (let i = 0; i < n; i++) {
      const anchor = line.anchors[i], center = track.points[i];
      assert.ok(Math.abs(anchor.lateralOffsetM) <= line.maxOffsetM + 1e-9, circuit.id);
      assert.ok(Math.hypot(anchor.x - center.x, anchor.y - center.y) <= line.maxOffsetM + 1e-9, circuit.id);
      assert.equal(anchor.z, center.z, 'height follows the associated road station, never a crossing road');
      const p = line.points[i], station = Math.floor(p.centerS / track.centerlineSpacing);
      let distance = Infinity;
      for (let j = station - 3; j <= station + 3; j++) {
        const k = (j % n + n) % n;
        distance = Math.min(distance, segmentDistance(p, track.points[k], track.points[(k + 1) % n]));
      }
      assert.ok(distance <= track.width / 2 - 1 + 1e-8, circuit.id + ': resampling stays within the road edge with body allowance');
    }
    const energy = points => points.reduce((sum, p) => sum + p.curvature * p.curvature, 0);
    assert.ok(energy(line.points) < energy(track.points), circuit.id + ': reduced total curvature energy');
    const a = race.sample(23), b = race.sample(23 + track.length);
    for (const key of ['x', 'y', 'elevation', 'grade']) assert.ok(Math.abs(a[key] - b[key]) < 1e-8);
    race.step(10);
    assert.equal(race.cars[0].distance, race.cars[1].distance, 'identical entrants use exactly the same line and dynamics');
    assert.deepEqual(race.sample(race.cars[0].distance), race.sample(race.cars[1].distance));
    assert.ok(!('lane' in race.cars[0]) && !('lateralOffset' in race.cars[0]));
  }
});

test('one-make entrants retain individual specs and tuning, gearing caps, and stable identifiers', () => {
  const stock = entrant('stock', { topSpeedMps: 50 });
  const tuned = entrant('tuned', { powerPs: stock.spec.powerPs * 1.35, torqueNm: stock.spec.torqueNm * 1.35,
    gripG: stock.spec.gripG * 1.2, brakeG: stock.spec.brakeG * 1.2, downforceArea: 1.5, topSpeedMps: 85 });
  const race = finish(new TrackRace({ circuit: circuits.find(c => c.id === 'monza'), entrants: [stock, tuned], laps: 1, tuning: 1.6 }));
  assert.equal(race.cars[0].entrant, stock);
  assert.equal(race.cars[0].uid, 'stock');
  assert.equal(race.cars[1].uid, 'tuned');
  assert.equal(race.cars[0].powerPs, stock.spec.powerPs, 'resolved entrant tuning is not multiplied a second time');
  assert.equal(race.cars[0].theoreticalTopSpeed, 50);
  assert.ok(race.cars[0].maxSpeed <= 50 + .05);
  assert.ok(race.cars[1].finishTime < race.cars[0].finishTime);
  assert.ok(race.cars[1].braking > race.cars[0].braking);
  assert.ok(race._lateralCapacity(race.cars[1], 60) > race._lateralCapacity(race.cars[1], 10));
  const brakeRace = make({ entrants: [entrant('huge-brakes', { brakeG: 2.5, gripG: .8 }), entrant('tyres-and-brakes', { brakeG: 2.5, gripG: 1.2 })] });
  assert.ok(brakeRace._brakingCapacity(brakeRace.cars[0], 40, 0) <= brakeRace.cars[0].longitudinalGrip + 1e-9, 'brake hardware cannot exceed tyre contact grip');
  assert.ok(brakeRace.cars[1].braking > brakeRace.cars[0].braking, 'tyre and brake upgrades work together');
  assert.throws(() => make({ entrants: [stock, entrant('other', {}, 'k5')] }), /one known vehicle model/);
  assert.throws(() => make({ entrants: [stock, stock] }), /unique/);
  assert.throws(() => make({ entrants: [entrant('invalid', { massKg: NaN })] }), /massKg/);
});

test('driven axle load transfer changes launch and conserves front/rear normal loads', () => {
  const common = { powerPs: 600, torqueNm: 1000, frontWeightFraction: .5, cgHeightM: .6, massKg: 1800, efficiency: .85 };
  const race = make({ entrants: ['fwd', 'rwd', 'awd'].map(drive => entrant(drive, { ...common, factoryDrive: drive })) });
  race.step(2);
  const [front, rear, all] = race.cars;
  assert.ok(all.speed > rear.speed + 1, 'all-wheel traction uses both axle loads');
  assert.ok(rear.speed > front.speed + .5, 'rear-drive traction benefits from rearward launch weight transfer');
  for (const car of race.cars) {
    assert.ok(car.frontNormalLoad < car.massKg * 9.81 * .5);
    assert.ok(car.rearNormalLoad > car.massKg * 9.81 * .5);
    assert.ok(Math.abs(car.frontNormalLoad + car.rearNormalLoad - car.massKg * 9.81) < 1e-7);
  }
});

// Starts halfway along a 2 km straight, avoiding a start-line corner or any
// overridden speed/force functions when comparing factory launch performance.
const launchStraight = {
  id: 'launch-straight', name: 'Flat launch validation loop', lengthM: 4800,
  coordinates: [[1000, 0], [2000, 0], [2000, 400], [0, 400], [0, 0], [1000, 0]]
    .map(([x, y]) => [127 + x / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + y / 111195.08])
};
function measureLaunch(race) {
  const measurements = race.cars.map(car => ({ variantId: car.entrant.variantId }));
  for (let i = 0; i < 3600 && !measurements.every(m => m.t100); i++) {
    const before = race.cars.map(car => [car.speed, car.distance]);
    race.step(TrackRace.FIXED_DT);
    race.cars.forEach((car, index) => {
      assert.ok(Number.isFinite(car.speed) && car.speed >= 0);
      const [speed, distance] = before[index];
      assert.ok(car.distance >= distance && car.distance - distance <= Math.max(speed, car.speed) * TrackRace.FIXED_DT + 1e-8, 'continuous integration, no launch teleport');
      for (const kph of [30, 60, 100]) if (!measurements[index]['t' + kph] && car.speed >= kph / 3.6) {
        measurements[index]['t' + kph] = race.time - TrackRace.FIXED_DT + (kph / 3.6 - speed) / (car.speed - speed) * TrackRace.FIXED_DT;
      }
    });
  }
  assert.ok(measurements.every(m => m.t100), 'all factory cars reach 100 km/h on the straight');
  return measurements;
}

test('each same-engine stock G70/G80 pair reflects AWD launch grip in dry/wet 0–30/60/100 runs', t => {
  const tuning = require('./tuning-evolution.js'), measurements = {};
  for (const vehicleId of ['g70', 'g80']) for (const surface of ['dry', 'wet']) {
    const population = tuning.createPopulation({ vehicleId, budget: 0 });
    const before = JSON.stringify(population);
    const race = new TrackRace({ circuit: launchStraight, entrants: population, surface, laps: 1, racingLine: false });
    measurements[vehicleId + surface] = Object.fromEntries(measureLaunch(race).map(m => [m.variantId, m]));
    assert.equal(JSON.stringify(population), before, 'launch cannot alter factory presets');
    for (const engine of vehicleId === 'g70' ? ['2.0t', '3.3t'] : ['2.5t', '3.5t']) {
      const prefix = vehicleId + '-' + engine, result = measurements[vehicleId + surface];
      const rear = race.cars.find(c => c.entrant.variantId === prefix + '-rwd'), all = race.cars.find(c => c.entrant.variantId === prefix + '-awd');
      assert.equal(all.powerPs, rear.powerPs); assert.equal(all.torqueNm, rear.torqueNm);
      assert.ok(all.massKg > rear.massKg && all.efficiency < rear.efficiency, 'AWD mass/loss penalties remain');
      for (const kph of [30, 60, 100]) assert.ok(result[prefix + '-awd']['t' + kph] < result[prefix + '-rwd']['t' + kph], prefix + '/' + surface + ': traction-limited AWD launch');
      t.diagnostic(prefix + '/' + surface + ' 0–100: RWD ' + result[prefix + '-rwd'].t100.toFixed(3) + ' / AWD ' + result[prefix + '-awd'].t100.toFixed(3) + ' model seconds');
    }
  }
  for (const vehicleId of ['g70', 'g80']) for (const variant of Object.keys(measurements[vehicleId + 'dry'])) {
    assert.ok(measurements[vehicleId + 'wet'][variant].t100 > measurements[vehicleId + 'dry'][variant].t100, 'wet launch cannot acquire more tyre grip');
  }
});

test('axle traction stays inside whole-car contact grip even at high CG/grip, with drag moments conserving axle loads', () => {
  const cars = ['fwd', 'rwd', 'awd'].map(drive => entrant(drive, { factoryDrive: drive, powerPs: 3000, torqueNm: 4000, gripG: 4, cgHeightM: 1.3, wheelbaseM: 1.5 }));
  const race = new TrackRace({ circuit: launchStraight, entrants: cars, laps: 1, racingLine: false });
  for (const car of race.cars) for (const speed of [0, 10, 40]) for (const grade of [-.2, 0, .2]) {
    const normal = 1 / Math.hypot(1, grade);
    const resistance = .5 * 1.225 * car.dragArea * speed * speed / car.massKg + 9.81 * (car.rollingCoefficient + grade) * normal;
    const capacity = race._tractionAcceleration(car, speed, grade, resistance);
    const allTyres = car.longitudinalGrip * (normal + race._aeroLoadAcceleration(car, speed) / 9.81);
    assert.ok(Number.isFinite(capacity) && capacity >= 0 && capacity <= allTyres + 1e-9, 'one driven axle cannot exceed all tyre contact capacity');
  }
  for (let i = 0; i < 120; i++) {
    race.step(1 / 120);
    for (const car of race.cars) {
      assert.ok(car.frontNormalLoad >= 0 && car.rearNormalLoad >= 0);
      assert.ok(Math.abs(car.frontNormalLoad + car.rearNormalLoad - car.massKg * 9.81) < 1e-7);
    }
  }
  const rear = race.cars[1];
  assert.ok(rear.frontNormalLoad < 1e-7, 'front contact can reach zero without exceeding the whole-car grip limit');
  // At a fixed transmitted force, changing drag at the CG changes net
  // acceleration but not the tractive pitch moment at the road contact.
  const lowDrag = entrant('low-drag', { factoryDrive: 'rwd', dragArea: .5 }), highDrag = entrant('high-drag', { factoryDrive: 'rwd', dragArea: 1.5 });
  const pair = new TrackRace({ circuit: launchStraight, entrants: [lowDrag, highDrag], laps: 1, racingLine: false });
  const limits = pair.cars.map(car => pair._tractionAcceleration(car, 40, 0, .5 * 1.225 * car.dragArea * 40 ** 2 / car.massKg + car.rollingCoefficient * 9.81));
  assert.ok(Math.abs(limits[0] - limits[1]) < 1e-10, 'CG drag must not spuriously remove driven-axle contact load');
});

test('source-backed first gear limits wheel torque separately from HUD gearing, retaining tuning and EV fallbacks', () => {
  const tuning = require('./tuning-evolution.js'), profiles = require('./powertrain-profiles.js'), telemetry = require('./powertrain-telemetry.js');
  for (const vehicleId of Object.keys(tuning.VARIANTS)) {
    const population = tuning.createPopulation({ vehicleId, budget: 0 });
    const race = new TrackRace({ circuit: launchStraight, entrants: population, laps: 1, racingLine: false });
    for (const car of race.cars) {
      const p = profiles.resolve(car);
      const sourced = p.gearRatios !== null;
      const firstFinalDrive = p.finalDriveRatios?.[0] ?? p.finalDriveRatio;
      assert.equal(car.driveReduction, sourced ? p.gearRatios[0] * firstFinalDrive : p.singleSpeedReduction ?? car.reduction, car.entrant.variantId);
      assert.equal(car.torqueNm, car.entrant.factorySpec.torqueNm, 'combined motor/engine torque is never multiplied by axle count');
      assert.equal(car.reduction, car.entrant.factorySpec.reduction, 'HUD tuning scale stays nominal');
      const withoutForceRatio = { ...car }; delete withoutForceRatio.driveReduction;
      assert.deepEqual(telemetry.describeGearing(car), telemetry.describeGearing(withoutForceRatio), 'launch envelope cannot change displayed gear speeds');
    }
    for (const entry of population) {
      const tuned = tuning.createEntrant({ vehicleId, variantId: entry.variantId, levels: { acceleration: 1 } });
      const tunedRace = new TrackRace({ circuit: launchStraight, entrants: [tuned], laps: 1, racingLine: false });
      const car = tunedRace.cars[0], p = profiles.resolve(car);
      const stockReduction = p.gearRatios ? p.gearRatios[0] * (p.finalDriveRatios?.[0] ?? p.finalDriveRatio) : p.singleSpeedReduction ?? tuned.factorySpec.reduction;
      assert.ok(Math.abs(car.driveReduction / stockReduction - tuned.spec.reduction / tuned.factorySpec.reduction) < 1e-12, entry.variantId);
    }
  }
});

test('IONIQ 5 long-range reduction uses both published stages without doubling AWD motor torque', () => {
  const tuning = require('./tuning-evolution.js'), profiles = require('./powertrain-profiles.js');
  const race = new TrackRace({ circuit: launchStraight, entrants: tuning.createPopulation({ vehicleId: 'ioniq5', budget: 0 }), laps: 1, racingLine: false });
  for (const car of race.cars) {
    const p = profiles.resolve(car), standard = car.entrant.variantId === 'ioniq5-standard';
    assert.equal(car.driveReduction, standard ? 9 : 2.263 * 4.706);
    assert.equal(car.torqueNm, car.entrant.factorySpec.torqueNm);
    assert.equal(p.visible, false); assert.equal(p.gearCount, null);
    assert.equal(car.telemetry.gear, null);
    if (!standard) {
      assert.equal(p.reductionStatus, 'reference-market');
      assert.ok(p.referenceFields.includes('singleSpeedReduction'));
      assert.ok(p.estimatedFields.includes('domesticReductionMatch'));
      assert.ok(p.sourceIds.includes(p.reductionSourceId));
    }
  }
});

test('power-limited AWD retains its mass/loss penalty, and factory launch stays deterministic across playback batching', () => {
  const common = { powerPs: 50, torqueNm: 70, gripG: 1.2, frontWeightFraction: .5 };
  const race = new TrackRace({ circuit: launchStraight, entrants: [
    entrant('rwd', { ...common, factoryDrive: 'rwd', massKg: 1500 }),
    entrant('awd', { ...common, factoryDrive: 'awd', massKg: 1600 })
  ], laps: 1, racingLine: false });
  race.step(3);
  assert.ok(race.cars[0].speed > race.cars[1].speed, 'AWD is not an unconditional acceleration bonus');
  const tuning = require('./tuning-evolution.js'), options = { circuit: launchStraight, entrants: tuning.createPopulation({ vehicleId: 'g80', budget: 0 }), laps: 1, racingLine: false };
  const batch = new TrackRace(options), frames = new TrackRace(options);
  batch.step(8); for (let i = 0; i < 960; i++) frames.step(1 / 120);
  assert.deepEqual(batch.cars.map(c => [c.speed, c.distance, c.frontNormalLoad, c.rearNormalLoad, c.telemetry]), frames.cars.map(c => [c.speed, c.distance, c.frontNormalLoad, c.rearNormalLoad, c.telemetry]));
});

test('mass, balance and centre-of-gravity affect acceleration, cornering and braking independently of power', () => {
  const race = make({ entrants: [
    entrant('balanced', { frontWeightFraction: .5, cgHeightM: .5, massKg: 1700 }),
    entrant('front-heavy', { frontWeightFraction: .68, cgHeightM: .5, massKg: 1700 }),
    entrant('tall', { frontWeightFraction: .5, cgHeightM: .95, massKg: 1700 }),
    entrant('heavy', { frontWeightFraction: .5, cgHeightM: .5, massKg: 2300 })
  ] });
  const [balanced, frontHeavy, tall, heavy] = race.cars;
  assert.equal(balanced.powerPs, heavy.powerPs);
  assert.ok(balanced.grip > frontHeavy.grip);
  assert.ok(balanced.grip > tall.grip);
  assert.ok(balanced.braking > tall.braking);
  assert.ok(balanced.grip > heavy.grip, 'tyre load sensitivity penalizes greater vehicle mass');
  race.step(8);
  assert.ok(balanced.speed > heavy.speed + 1, 'greater inertia consumes the same power');
});

test('one-make variant and tuning entrants complete every elevated layout in dry and wet conditions', t => {
  let runs = 0;
  for (const circuit of circuits) for (const surface of ['dry', 'wet']) {
    const entrants = [entrant('rwd', { factoryDrive: 'rwd', powerPs: 304, torqueNm: 422, massKg: 1855 }),
      entrant('awd', { factoryDrive: 'awd', powerPs: 380, torqueNm: 530, massKg: 2020, frontWeightFraction: .54 }),
      entrant('tuned', { factoryDrive: 'rwd', powerPs: 390, torqueNm: 550, massKg: 1870, gripG: 1.16, brakeG: 1.20, downforceArea: 1.2 })];
    const race = finish(new TrackRace({ circuit, entrants, surface, laps: 1 }));
    for (const car of race.cars) {
      assert.equal(car.finished, true, circuit.id + '/' + surface + '/' + car.uid);
      assert.equal(car.dnf, false);
      assert.ok(Number.isFinite(car.finishTime) && car.finishTime > 30 && car.finishTime < 1000);
      assert.ok(Number.isFinite(car.elevation) && Number.isFinite(car.grade));
      runs++;
    }
  }
  t.diagnostic(runs + ' one-make entrant runs completed on actual elevated racing lines.');
});

test('generated factory variants run for all 15 models and tuning generations preserve the measured elite', t => {
  const tuning = require('./tuning-evolution.js');
  const circuit = circuits.find(c => c.id === 'inje');
  let runs = 0;
  for (const model of TrackRace.VEHICLES) {
    const population = tuning.createPopulation({ vehicleId: model.id, count: 8, seed: 20261014, budget: 30 });
    const race = finish(new TrackRace({ circuit, entrants: population, laps: 1 }));
    const ranked = tuning.evaluate(population, race.cars);
    assert.equal(ranked.length, population.length);
    for (const entry of ranked) {
      assert.equal(entry.finished, true, model.id + '/' + entry.entrant.variantId);
      assert.equal(entry.fitness, entry.result.finishTime);
      assert.equal(entry.result.vehicleId, model.id);
      assert.equal(entry.result.entrant, entry.entrant);
      runs++;
    }
  }
  let population = tuning.createPopulation({ vehicleId: 'g80', count: 8, seed: 99, budget: 30 });
  let previousBest = Infinity;
  const winners = [];
  for (let generation = 1; generation <= 5; generation++) {
    const race = finish(new TrackRace({ circuit, entrants: population, laps: 1 }));
    const ranked = tuning.evaluate(population, race.cars), best = ranked[0];
    assert.ok(best.finishTime <= previousBest + 1e-10, 'retained elite makes measured best fitness non-increasing');
    winners.push(best.finishTime);
    previousBest = best.finishTime;
    const next = tuning.breed(population, race.cars, { seed: 99 + generation, generation: generation + 1 });
    assert.deepEqual(next[0].spec, best.entrant.spec, 'elite inherits the entire effective configuration');
    assert.equal(next[0].variantId, best.entrant.variantId);
    assert.equal(next[0].lineage.kind, 'elite');
    population = next;
    runs += race.cars.length;
  }
  t.diagnostic(runs + ' generated-entrant runs; G80 elite finish times: ' + winners.map(v => v.toFixed(3)).join(' → '));
});
