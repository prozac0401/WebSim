'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ContinuousRace = require('./continuous-race.js');
const TrackRace = require('./race-engine.js');
const Evolution = require('./tuning-evolution.js');
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

test('watched timing-line crossing keeps position, exact crossing speed and the unused physics fraction', () => {
  const controller = make(), transition = untilTransition(controller);
  const previous = transition.previousRace.cars[transition.watchedId], current = controller.race.cars[transition.watchedId];
  assert.equal(transition.completedGeneration, 1); assert.equal(transition.generation, 2);
  assert.equal(transition.carrySpeed, previous.finishSpeed);
  assert.ok(previous.finishSpeed > 10);
  assert.equal(current.speed, previous.finishSpeed, 'there is no standstill at the generation boundary');
  assert.equal(current.distance, 0); assert.equal(current.finished, false);
  assert.equal(controller.race._ticks, 0);
  assert.ok(Math.abs(controller.race._accumulator - previous.finishRemainderSeconds) < 1e-10);
  const before = transition.previousRace.sampleForCar(previous, previous.distance), after = controller.race.sampleForCar(current, current.distance);
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1e-8, 'finish and start are the same track position');
  assert.ok(controller.race.cars.every(car => car.speed === previous.finishSpeed && car.standingStartDistance === null));
  assert.ok(controller.evaluationRace.cars.every(car => car.speed === 0 && car.standingStartDistance === 0));
  controller.step(DT, { watchId: transition.watchedId, auto: true });
  assert.ok(current.distance > 0); assert.ok(current.speed > 10);
});

test('three rolling generations use the same canonical standing-start fitness and deterministic breeding', () => {
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
    if (generation > 1) {
      const watched = transition.previousRace.cars[transition.watchedId];
      const canonical = transition.results.find(car => car.id === watched.id);
      assert.notEqual(watched.finishTime, canonical.finishTime, 'rolling display times must never replace comparable fitness');
    }
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
  assert.equal(transition.carrySpeed, transition.previousRace.cars[watchId].finishSpeed);
});

test('stock repeats preserve entrant objects and UIDs while the watch crosses continuously', () => {
  const entrants = Evolution.createPopulation({ vehicleId: 'g80', budget: 0, seed: 17 });
  const controller = make({ entrants });
  for (let run = 1; run <= 3; run++) {
    const transition = untilTransition(controller, 2);
    assert.equal(controller.population, entrants);
    assert.ok(controller.population.every((entry, i) => entry === entrants[i]));
    assert.deepEqual(controller.race.cars.map(car => car.entrant.uid), entrants.map(entry => entry.uid));
    assert.equal(controller.generation, 1); assert.equal(controller.stockRun, run + 1);
    assert.equal(transition.completedStockRun, run); assert.equal(transition.watchedId, 2);
  }
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

test('a rolling display finish cannot breed indefinitely when every canonical entrant retires', () => {
  const entrants = population().map(entry => ({ ...entry, spec: { ...entry.spec, powerPs: .0001, torqueNm: .0001 } }));
  const controller = make({ entrants });
  // Model a later generation carrying momentum that a standing start cannot
  // produce. The independent evaluation must still reject it as all-DNF.
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
