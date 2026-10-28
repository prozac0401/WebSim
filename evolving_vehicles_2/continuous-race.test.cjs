'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ContinuousRace = require('./continuous-race.js');
const TrackRace = require('./race-engine.js');
const Evolution = require('./tuning-evolution.js');
const Pose = require('./driving-pose.js');
const DT = TrackRace.FIXED_DT;
const circle = {
  id: 'continuous-test-circle', name: 'Continuous timing test circle', lengthM: 160 * Math.PI,
  coordinates: Array.from({ length: 129 }, (_, i) => {
    const a = i / 128 * 2 * Math.PI;
    return [127 + Math.cos(a) * 80 / (111195.08 * Math.cos(37 * Math.PI / 180)), 37 + Math.sin(a) * 80 / 111195.08];
  })
};
const population = () => [
  { acceleration: 3 }, {}, { acceleration: 1, grip: 2 }, { acceleration: 1, topSpeed: 1 }
].map((levels, index) => Evolution.createEntrant({ vehicleId: 'supra', uid: 'initial-' + index, levels }));
const make = (overrides = {}) => new ContinuousRace({ circuit: circle, entrants: population(), laps: 1, surface: 'dry', seed: 31415, ...overrides });
const resultSnapshot = results => results.map(car => ({ uid: car.entrant.uid, finished: car.finished,
  dnf: car.dnf, finishTime: car.finishTime, distance: car.distance, laps: car.lapTimes }));
function finish(race) {
  for (let i = 0; i < 40 && !race.finished; i++) race.step(30);
  assert.ok(race.finished);
  return race.standings();
}
function untilTransition(controller, watchId = 0) {
  for (let i = 0; i < 120 / DT; i++) {
    const events = controller.step(DT, { watchId, auto: true });
    if (events.length) return events[0];
  }
  assert.fail('watched car should reach its next timing boundary');
}
function snapshot(controller) {
  return { generation: controller.generation, stockRun: controller.stockRun,
    population: controller.population.map(p => ({ uid: p.uid, variantId: p.variantId, levels: p.levels })),
    time: controller.race.time, ticks: controller.race._ticks,
    cars: controller.race.cars.map(c => ({ distance: c.distance, speed: c.speed, lap: c.lap, finished: c.finished, telemetry: c.telemetry })) };
}

test('watched finish immediately starts the next generation at rest on the centerline and retains unused time', () => {
  const controller = make(), watchId = controller.completeEvaluation()[0].id, transition = untilTransition(controller, watchId);
  const previous = transition.previousRace.cars[transition.watchedId], current = controller.race.cars[transition.watchedId];
  assert.equal(transition.completedGeneration, 1); assert.equal(transition.generation, 2);
  assert.equal(transition.initialSpeed, 0);
  assert.ok(previous.finishSpeed > 10);
  assert.ok(transition.previousRace.cars.some(car => !car.finished), 'watched finish does not wait for the other display cars');
  assert.equal(current.speed, 0, 'the next generation starts from rest instead of inheriting finish speed');
  assert.equal(current.distance, 0); assert.equal(current.finished, false);
  assert.equal(controller.race._ticks, 0);
  assert.ok(Math.abs(controller.race._accumulator - previous.finishRemainderSeconds) < 1e-10);
  const start = controller.race.track.points[0], next = controller.race.track.points[1], heading = Math.atan2(next.y-start.y,next.x-start.x);
  for (const car of controller.race.cars) {
    assert.equal(car.speed, 0); assert.equal(car.standingStartDistance, 0);
    const pose = Pose.sampleCar(controller.race, car, 0);
    assert.ok(Math.hypot(pose.x-start.x,pose.y-start.y) < 1e-8, 'every entrant is centered on the starting road');
    assert.ok(Math.abs(Math.atan2(Math.sin(pose.angle-heading),Math.cos(pose.angle-heading))) < 1e-8, 'every entrant faces the road-forward launch direction');
  }
  assert.ok(controller.evaluationRace.cars.every(car => car.speed === 0 && car.standingStartDistance === 0));
  controller.step(DT, { watchId: transition.watchedId, auto: true });
  assert.ok(current.distance > 0); assert.ok(current.speed > 0 && current.speed < 1, 'the first new tick accelerates from rest');
});

test('three standing-start generations keep canonical fitness and deterministic breeding', () => {
  const controller = make();
  for (let generation = 1; generation <= 3; generation++) {
    const expected = finish(new TrackRace({ circuit: circle, entrants: controller.population, laps: 1, surface: 'dry' }));
    const oldPopulation = controller.population, transition = untilTransition(controller);
    assert.deepEqual(resultSnapshot(transition.results), resultSnapshot(expected));
    const expectedPopulation = Evolution.breed(oldPopulation, expected, {
      seed: (31415 + Math.imul(generation + 1, 104729)) >>> 0, generation: generation + 1
    });
    assert.deepEqual(controller.population, expectedPopulation);
    assert.equal(transition.completedGeneration, generation);
    const watched = transition.previousRace.cars[transition.watchedId];
    const canonical = transition.results.find(car => car.id === watched.id);
    assert.equal(watched.finishTime, canonical.finishTime, 'display and fitness use the same standing-start conditions');
    assert.equal(transition.initialSpeed, 0);
    // A previously retained fraction can leave enough input time for one
    // fresh physics tick after the restart. That tiny launch acceleration
    // must be preserved rather than holding the new generation at zero.
    assert.ok(controller.race._ticks <= 1);
    assert.ok(controller.race.cars.every(car => car.speed >= 0 && car.speed < 1 && car.standingStartDistance === 0));
  }
});

test('watching a nonwinning slot preserves that slot without changing the selected elite', () => {
  const controller = make(), canonical = controller.completeEvaluation();
  const watchId = canonical.at(-1).id, winner = canonical[0].entrant;
  assert.notEqual(watchId, canonical[0].id);
  const transition = untilTransition(controller, watchId);
  assert.equal(transition.watchedId, watchId);
  assert.equal(controller.race.cars[watchId].id, watchId);
  assert.deepEqual(controller.population[0].lineage.parents, [winner.uid]);
  assert.deepEqual(controller.population[0].levels, winner.levels);
  assert.equal(transition.initialSpeed, 0); assert.equal(controller.race.cars[watchId].speed, 0);
});

test('stock repeats preserve entrant objects and UIDs and restart every entrant from rest', () => {
  const entrants = Evolution.createPopulation({ vehicleId: 'g80', budget: 0, seed: 17 });
  const controller = make({ entrants });
  for (let run = 1; run <= 3; run++) {
    const transition = untilTransition(controller, 2);
    assert.equal(controller.population, entrants);
    assert.ok(controller.population.every((entry, i) => entry === entrants[i]));
    assert.deepEqual(controller.race.cars.map(car => car.entrant.uid), entrants.map(entry => entry.uid));
    assert.equal(controller.generation, 1); assert.equal(controller.stockRun, run + 1);
    assert.equal(transition.completedStockRun, run); assert.equal(transition.watchedId, 2);
    assert.equal(transition.initialSpeed, 0);
    // Accumulated fractional playback plus the finish-tick remainder can
    // consume one new tick before step returns. It must still be a launch
    // from rest, with a fresh first gear rather than carried finish velocity.
    assert.ok(controller.race.time <= DT + 1e-12);
    for (const car of controller.race.cars) {
      assert.equal(car.standingStartDistance, 0);
      assert.ok(car.speed <= car.longitudinalGrip * DT + 1e-9);
      assert.ok(car.distance <= car.speed * DT + 1e-9);
      assert.equal(car.transmission.gear, 1); assert.equal(car.transmission.shiftCount, 0);
      assert.equal(car.transmission.shifting, false);
    }
  }
});

test('a multi-lap measurement keeps intermediate laps moving and restarts only at its final finish', () => {
  const controller = make({ laps: 3 }), original = controller.race, watched = original.cars[0];
  const expected = finish(new TrackRace({ circuit: circle, entrants: controller.population, laps: 3, surface: 'dry' }));
  const firstBoundary = original.lapEndDistanceForCar(watched, 1);
  assert.equal(firstBoundary, watched.firstLapLength);
  assert.equal(original.lapEndDistanceForCar(watched, 3), watched.firstLapLength + 2 * watched.trackLength);
  for (let i = 0; i < 120 / DT && watched.lap === 0; i++) {
    assert.deepEqual(controller.step(DT, { watchId: 0, auto: true }), []);
  }
  assert.equal(watched.lap, 1); assert.equal(watched.finished, false); assert.ok(watched.speed > 10);
  assert.ok(watched.distance >= firstBoundary && watched.distance < firstBoundary + watched.speed * DT + 1);
  assert.equal(original.pathStateForCar(watched).pathKind, 'flying');
  assert.equal(controller.race, original); assert.equal(controller.generation, 1);
  const transition = untilTransition(controller, 0);
  assert.equal(transition.previousRace, original); assert.equal(watched.lap, 3);
  assert.deepEqual(resultSnapshot(transition.results), resultSnapshot(expected), 'multi-lap display and independent fitness use the same first/flying distances');
  assert.equal(watched.distance, watched.firstLapLength + 2 * watched.trackLength);
  assert.ok(Math.abs(watched.lapTimes.reduce((sum, time) => sum + time, 0) - watched.finishTime) < 1e-9);
  assert.equal(controller.race.laps, 3); assert.equal(controller.race.cars[0].speed, 0);
  assert.equal(controller.race.cars[0].standingStartDistance, 0); assert.equal(controller.generation, 2);
  assert.equal(controller.race.pathStateForCar(controller.race.cars[0]).pathKind, 'launch', 'every new measurement intentionally starts from its own standing grid');
});

test('zero time pauses both races and auto off retains the completed generation', () => {
  const controller = make();
  controller.step(.41, { auto: true });
  const before = snapshot(controller), evaluationTime = controller.evaluationRace.time, fraction = controller.race._accumulator;
  assert.deepEqual(controller.step(0, { auto: true }), []);
  assert.deepEqual(snapshot(controller), before); assert.equal(controller.evaluationRace.time, evaluationTime);
  assert.equal(controller.race._accumulator, fraction);
  assert.deepEqual(controller.step(120, { watchId: 0, auto: false }), []);
  assert.ok(controller.race.finished); assert.equal(controller.generation, 1);
  const finished = snapshot(controller);
  assert.deepEqual(controller.step(0, { watchId: 0, auto: true }), []);
  assert.deepEqual(snapshot(controller), finished);
  assert.deepEqual(controller.step(20, { watchId: 0, auto: false }), []);
  assert.deepEqual(snapshot(controller), finished);
  assert.ok(controller.completeEvaluation().every(car => car.finished || car.dnf));
});

test('a retired watched car never triggers an automatic restart, including an all-DNF generation', () => {
  for (const allRetire of [false, true]) {
    const entrants = population().map((entry, i) => allRetire || i === 0
      ? { ...entry, spec: { ...entry.spec, powerPs: .0001, torqueNm: .0001 } } : entry);
    const controller = make({ entrants });
    assert.deepEqual(controller.step(90, { watchId: 0, auto: true }), []);
    assert.ok(controller.race.finished); assert.ok(controller.race.cars[0].dnf);
    assert.equal(controller.generation, 1);
    assert.deepEqual(controller.step(90, { watchId: 0, auto: true }), []);
    const results = controller.completeEvaluation();
    assert.equal(results.every(car => car.dnf), allRetire);
  }
});

test('an explicitly supplied rolling display cannot breed when every canonical entrant retires', () => {
  const entrants = population().map(entry => ({ ...entry, spec: { ...entry.spec, powerPs: .0001, torqueNm: .0001 } }));
  const controller = make({ entrants });
  // TrackRace still supports an explicit rolling start for other callers.
  // The independent evaluation must reject momentum unavailable from rest.
  controller.race = new TrackRace({ circuit: circle, entrants, laps: 1, surface: 'dry', initialSpeed: 200 });
  assert.deepEqual(controller.step(90, { watchId: 0, auto: true }), []);
  assert.ok(controller.race.cars[0].finished);
  assert.ok(controller.evaluationResults.every(car => car.dnf));
  assert.equal(controller.automaticBlocked, true); assert.equal(controller.generation, 1);
});

test('fractional playback batching preserves multiple boundaries and accounts for every second', () => {
  const single = make(), split = make(), duration = 100.12345;
  const all = single.step(duration, { watchId: 1, auto: true }), events = [];
  let elapsed = 0, index = 0;
  const chunks = [1 / 240, .173, 1 / 60, .031, .087];
  while (elapsed < duration) {
    const chunk = Math.min(chunks[index++ % chunks.length], duration - elapsed);
    events.push(...split.step(chunk, { watchId: 1, auto: true }));
    elapsed += chunk;
  }
  assert.ok(all.length >= 3); assert.equal(events.length, all.length);
  assert.deepEqual(snapshot(single), snapshot(split));
  assert.ok(Math.abs(single.race._accumulator - split.race._accumulator) < 1e-8);
  for (const [controller, transitions] of [[single, all], [split, events]]) {
    const completedTime = transitions.reduce((sum, event) => sum + event.previousRace.cars[event.watchedId].finishTime, 0);
    assert.ok(Math.abs(completedTime + controller.race.time + controller.race._accumulator - duration) < 1e-8,
      'crossing remainders must not be dropped or counted twice');
  }
  assert.deepEqual(events.map(e => resultSnapshot(e.results)), all.map(e => resultSnapshot(e.results)));
});
