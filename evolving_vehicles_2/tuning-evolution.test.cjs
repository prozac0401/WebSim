'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./tuning-evolution.js');
const keys = T.CATEGORIES.map(category => category.id);
const levels = (acceleration = 0, topSpeed = 0, brakes = 0, grip = 0) => ({ acceleration, topSpeed, brakes, grip });

test('catalogue keeps real, immutable factory combinations for all fifteen bodies', () => {
  assert.equal(Object.keys(T.VARIANTS).length, 15);
  for (const [vehicleId, variants] of Object.entries(T.VARIANTS)) {
    assert.ok(variants.length >= 1);
    assert.equal(new Set(variants.map(variant => variant.id)).size, variants.length);
    for (const variant of variants) {
      assert.equal(variant.vehicleId, vehicleId);
      assert.ok(Object.isFrozen(variant.spec));
      assert.ok(variant.sourceUrl.startsWith('https://'));
      assert.ok(variant.spec.powerPs > 0 && variant.spec.massKg > 900);
      assert.ok(['rwd', 'fwd', 'awd'].includes(variant.spec.factoryDrive));
      assert.equal(variant.spec.displacementCc === null, variant.spec.electric);
      assert.ok(variant.spec.frontWeightFraction > .4 && variant.spec.frontWeightFraction < .7);
    }
  }
  assert.throws(() => T.createEntrant({ vehicleId: 'g80', variantId: 'k5-2.0' }), /Variant/);
  assert.equal(T.getVariant('ioniq5', 'ioniq5-long-awd').spec.factoryDrive, 'awd');
  assert.equal(T.getVariant('musso_ev', 'musso-ev-fwd').spec.factoryDrive, 'fwd');
});

test('G80 2.5T receives acceleration and speed credits/headroom relative to 3.5T', () => {
  const low = T.getRules('g80', 'g80-2.5t-awd');
  const high = T.getRules('g80', 'g80-3.5t-awd');
  assert.ok(low.credits.acceleration > high.credits.acceleration);
  assert.ok(low.credits.topSpeed > high.credits.topSpeed);
  assert.ok(low.maxLevels.acceleration > high.maxLevels.acceleration);
  assert.ok(low.maxLevels.topSpeed > high.maxLevels.topSpeed);
  const compensated = T.createEntrant({ vehicleId: 'g80', variantId: 'g80-2.5t-awd', budget: 0, levels: levels(3, 0, 0, 0) });
  assert.equal(compensated.cost, 0);
  assert.ok(compensated.spec.powerPs >= T.getVariant('g80', 'g80-3.5t-awd').spec.powerPs);
  assert.equal(compensated.spec.displacementCc, 2497);
  assert.equal(compensated.spec.engine, '직렬 4기통 가솔린 터보');
});

test('RWD compensation belongs only to grip and cannot fund brakes', () => {
  const rwd = T.getRules('g80', 'g80-3.5t-rwd');
  const awd = T.getRules('g80', 'g80-3.5t-awd');
  assert.equal(rwd.credits.grip, 8);
  assert.equal(awd.credits.grip, 0);
  assert.ok(rwd.maxLevels.grip > awd.maxLevels.grip);
  const freeGrip = T.quote({ vehicleId: 'g80', variantId: 'g80-3.5t-rwd', budget: 0, levels: levels(0, 0, 0, 2) });
  assert.equal(freeGrip.valid, true);
  assert.equal(freeGrip.cost, 0);
  assert.equal(freeGrip.totalCost, 8);
  assert.equal(freeGrip.creditUsed.grip, 8);
  assert.equal(T.quote({ vehicleId: 'g80', variantId: 'g80-3.5t-rwd', budget: 0, levels: levels(0, 0, 1, 0) }).valid, false);
  assert.equal(T.getRules('morning', 'morning-1.0-14').credits.grip, 0, 'no fictional AWD comparator');
});

test('strict manual edits reject overspend, invalid stage and unknown genes without changing entrant', () => {
  const entrant = T.createEntrant({ vehicleId: 'g80', variantId: 'g80-3.5t-awd' });
  const before = JSON.stringify(entrant);
  assert.throws(() => T.createEntrant({ ...entrant, levels: levels(3, 3, 4, 4) }), /예산/);
  assert.throws(() => T.createEntrant({ ...entrant, levels: levels(4) }), /범위/);
  assert.throws(() => T.createEntrant({ ...entrant, levels: { ...levels(), grip: -1 } }), /범위/);
  assert.throws(() => T.createEntrant({ ...entrant, levels: { ...levels(), grip: 1.2 } }), /범위/);
  assert.throws(() => T.createEntrant({ ...entrant, levels: { ...levels(), engineSwap: 1 } }), /알 수 없는/);
  assert.equal(JSON.stringify(entrant), before);
});

test('four axes have distinct effects and aerodynamic grip has drag and weight tradeoffs', () => {
  const make = value => T.createEntrant({ vehicleId: 'g80', variantId: 'g80-3.5t-awd', levels: value }).spec;
  const base = make(levels()), acceleration = make(levels(1)), speed = make(levels(0, 1)), brakes = make(levels(0, 0, 1)), grip = make(levels(0, 0, 0, 1));
  assert.ok(acceleration.powerPs > base.powerPs && acceleration.torqueNm > base.torqueNm);
  assert.ok(acceleration.reduction > base.reduction && acceleration.topSpeedMps < base.topSpeedMps);
  assert.ok(speed.dragArea < base.dragArea && speed.topSpeedMps > base.topSpeedMps);
  assert.ok(brakes.brakeG > base.brakeG && brakes.massKg > base.massKg);
  assert.ok(grip.gripG > base.gripG && grip.downforceArea > base.downforceArea);
  assert.ok(grip.dragArea > base.dragArea && grip.massKg > base.massKg && grip.cgHeightM < base.cgHeightM);
  assert.equal(grip.frontWeightFraction, base.frontWeightFraction);
});

test('seeded populations are reproducible, varied, affordable, with complete trim coverage', () => {
  const first = T.createPopulation({ vehicleId: 'g80', seed: 31415 });
  assert.deepEqual(first, T.createPopulation({ vehicleId: 'g80', seed: 31415 }));
  assert.notDeepEqual(first, T.createPopulation({ vehicleId: 'g80', seed: 31416 }));
  assert.equal(new Set(first.map(entry => entry.variantId)).size, 4);
  assert.equal(new Set(first.map(entry => entry.uid)).size, first.length);
  for (const vehicleId of Object.keys(T.VARIANTS)) for (const budget of [0, 5, 30, 80]) for (let seed = 0; seed < 10; seed++) {
    const population = T.createPopulation({ vehicleId, seed, budget, count: 12 });
    for (const entry of population) {
      assert.equal(entry.vehicleId, vehicleId);
      assert.ok(entry.cost <= budget && entry.remainingBudget >= 0);
      assert.equal(entry.totalCost, entry.cost + Object.values(entry.creditUsed).reduce((a, b) => a + b, 0));
      for (const key of keys) assert.ok(Number.isInteger(entry.levels[key]) && entry.levels[key] >= 0 && entry.levels[key] <= entry.maxLevels[key]);
    }
  }
});

test('fitness is finishing time, with uid mapping independent of standing order', () => {
  const population = T.createPopulation({ count: 4 });
  const results = [
    { entrant: population[2], finished: false, dnf: true, distance: 10000 },
    { entrant: population[0], finished: true, finishTime: 140, bestLap: 60 },
    { uid: population[3].uid, finished: true, finishTime: 130, bestLap: 61 },
    { uid: population[1].uid, finished: false, dnf: false, distance: 300 }
  ];
  const evaluated = T.evaluate(population, results);
  assert.deepEqual(evaluated.map(entry => entry.uid), [population[3].uid, population[0].uid, population[1].uid, population[2].uid]);
  assert.equal(evaluated[0].fitness, 130);
  assert.equal(evaluated[2].fitness, Infinity);
});

test('breeding preserves the elite genome and factory spec, mutates feasible offspring deterministically', () => {
  for (const vehicleId of Object.keys(T.VARIANTS)) {
    let population = T.createPopulation({ vehicleId, count: 8, seed: 101 });
    for (let generation = 2; generation <= 20; generation++) {
      const results = population.map((entry, index) => ({ uid: entry.uid, finished: true, finishTime: 200 + ((index + generation) % population.length) }));
      const best = T.evaluate(population, results)[0].entrant;
      const before = JSON.stringify(population);
      const next = T.breed(population, results, { seed: generation + 110 });
      assert.deepEqual(next, T.breed(population, results, { seed: generation + 110 }));
      assert.equal(JSON.stringify(population), before);
      assert.equal(next.length, population.length);
      assert.equal(next[0].lineage.kind, 'elite');
      assert.deepEqual(next[0].levels, best.levels);
      assert.deepEqual(next[0].spec, best.spec);
      assert.equal(next[0].variantId, best.variantId);
      assert.deepEqual(next[0].lineage.parents, [best.uid]);
      for (const entry of next) {
        assert.equal(entry.generation, generation);
        assert.ok(entry.cost <= entry.budget);
        assert.deepEqual(entry.factorySpec, T.getVariant(vehicleId, entry.variantId).spec);
        assert.equal(entry.spec.factoryDrive, entry.factorySpec.factoryDrive);
        assert.equal(entry.spec.displacementCc, entry.factorySpec.displacementCc);
      }
      population = next;
    }
  }
});

test('invalid or incomplete races cannot manufacture a next generation', () => {
  const population = T.createPopulation({ count: 4 });
  assert.throws(() => T.breed(population, []), /Run the race/);
  assert.throws(() => T.breed(population, [{ uid: population[0].uid, finished: true, finishTime: 100 }]), /all entrants/);
  assert.throws(() => T.createPopulation({ count: 1 }), /count/);
  assert.throws(() => T.createPopulation({ budget: -1 }), /예산/);
  assert.throws(() => T.createPopulation({ seed: NaN }), /seed/);
  assert.throws(() => T.breed([population[0], population[0]], []), /unique/);
  assert.throws(() => T.breed([population[0], T.createPopulation({ vehicleId: 'k5' })[0]], []), /one make/);
});
