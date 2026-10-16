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
  const compensated = T.createEntrant({ vehicleId: 'g80', variantId: 'g80-2.5t-awd', budget: 18, levels: levels(3, 0, 0, 0) });
  assert.equal(compensated.cost, 0);
  assert.ok(compensated.spec.powerPs >= T.getVariant('g80', 'g80-3.5t-awd').spec.powerPs);
  assert.equal(compensated.spec.displacementCc, 2497);
  assert.equal(compensated.spec.engine, '직렬 4기통 가솔린 터보');
});

test('factory wheel variants keep their sourced tyre sizes and radii through entrant creation', () => {
  const expected = [
    ['ray', 'ray-1.0-14', '165/60R14', 276.8],
    ['morning', 'morning-1.0-14', '175/65R14', 291.55],
    ['avante', 'avante-2.0-16', '205/60R16', 326.2],
    ['avante', 'avante-2.0-18', '215/45R18', 325.35],
    ['k5', 'k5-1.6t', '215/55R17', 334.15],
    ['ioniq5', 'ioniq5-standard', '235/55R19', 370.55]
  ];
  for (const [vehicleId, variantId, tire, radius] of expected) {
    for (const budget of [0, 30]) {
      const entrant = T.createEntrant({ vehicleId, variantId, budget, levels: budget ? levels(1) : levels() });
      for (const spec of [entrant.factorySpec, entrant.spec]) {
        assert.deepEqual([spec.frontTire, spec.rearTire], [tire, tire], variantId + ': tyre marking');
        assert.deepEqual([spec.frontTireRadiusMm, spec.rearTireRadiusMm], [radius, radius], variantId + ': nominal radius');
      }
    }
  }
});

test('RWD compensation belongs only to grip and cannot fund brakes', () => {
  const rwd = T.getRules('g80', 'g80-3.5t-rwd');
  const awd = T.getRules('g80', 'g80-3.5t-awd');
  assert.equal(rwd.credits.grip, 8);
  assert.equal(awd.credits.grip, 0);
  assert.ok(rwd.maxLevels.grip > awd.maxLevels.grip);
  const freeGrip = T.quote({ vehicleId: 'g80', variantId: 'g80-3.5t-rwd', budget: 18, levels: levels(0, 0, 0, 2) });
  assert.equal(freeGrip.valid, true);
  assert.equal(freeGrip.cost, 0);
  assert.equal(freeGrip.totalCost, 8);
  assert.equal(freeGrip.creditUsed.grip, 8);
  assert.equal(T.quote({ vehicleId: 'g80', variantId: 'g80-3.5t-rwd', budget: 18, levels: levels(0, 0, 4, 0) }).valid, false, 'grip credits cannot fund a 25-point brake upgrade on an 18-point budget');
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

test('zero budget preserves all 36 factory specifications exactly and disables compensation and tuning', () => {
  let checked = 0;
  for (const [vehicleId, variants] of Object.entries(T.VARIANTS)) for (const variant of variants) {
    const factoryBefore = JSON.stringify(variant.spec), entry = T.createEntrant({ vehicleId, variantId: variant.id, budget: 0 });
    assert.equal(entry.spec, variant.spec, variant.id + ': no tuning arithmetic or rounding may touch a stock specification');
    assert.equal(entry.factorySpec, entry.spec); assert.ok(Object.isFrozen(entry.spec));
    assert.deepEqual(entry.levels, levels());
    for (const field of ['credits', 'compensationLevels', 'maxLevels', 'creditUsed', 'costByCategory', 'paidByCategory']) assert.deepEqual(entry[field], levels(), variant.id + ': ' + field);
    assert.deepEqual([entry.budget, entry.cost, entry.totalCost, entry.remainingBudget], [0, 0, 0, 0]);
    assert.deepEqual(T.getRules(vehicleId, variant.id, { budget: 0 }).maxLevels, levels());
    for (const key of keys) {
      const changed = { ...levels(), [key]: 1 }, quote = T.quote({ vehicleId, variantId: variant.id, budget: 0, levels: changed });
      assert.equal(quote.valid, false, variant.id + ': ' + key + ' must not be bought with compensation');
      assert.deepEqual(quote.credits, levels()); assert.deepEqual(quote.maxLevels, levels());
      assert.throws(() => T.createEntrant({ ...entry, levels: changed }), /예산 없음/);
    }
    assert.equal(JSON.stringify(variant.spec), factoryBefore);
    checked++;
  }
  assert.equal(checked, 36);
});

test('stock grids contain exactly one of each factory trim, regardless of the tuning population size', () => {
  for (const [vehicleId, variants] of Object.entries(T.VARIANTS)) {
    for (const count of [1, 4, 8, 12, 24]) {
      const population = T.createPopulation({ vehicleId, count, budget: 0, seed: 31415 });
      assert.equal(population.length, variants.length, vehicleId + ': stock count comes from available factory trims');
      assert.deepEqual(population.map(e => e.variantId).sort(), variants.map(v => v.id).sort());
      assert.equal(new Set(population.map(e => e.uid)).size, variants.length);
      for (const entry of population) assert.equal(entry.spec, T.getVariant(vehicleId, entry.variantId).spec);
    }
  }
  assert.equal(T.createPopulation({ vehicleId: 'g80', budget: 0 }).length, 4);
  assert.equal(T.createPopulation({ vehicleId: 'g70', budget: 0 }).length, 4);
  assert.equal(T.createPopulation({ vehicleId: 'supra', budget: 0 }).length, 1);
  assert.equal(T.createPopulation({ vehicleId: 'staria', budget: 0 }).length, 1);
});

test('stock regeneration and direct generation APIs keep every factory trim exactly once at zero stages', () => {
  for (const vehicleId of Object.keys(T.VARIANTS)) {
    for (const seed of [31415, 31416]) {
      const initial = T.createPopulation({ vehicleId, count: 8, budget: 0, seed });
      assert.deepEqual(initial, T.createPopulation({ vehicleId, count: 8, budget: 0, seed }));
      assert.equal(new Set(initial.map(e => e.variantId)).size, T.VARIANTS[vehicleId].length, 'all factory trims remain available');
      let population = initial;
      for (let generation = 1; generation <= 5; generation++) {
        assert.equal(population.length, T.VARIANTS[vehicleId].length);
        assert.deepEqual(population.map(e => e.variantId).sort(), T.VARIANTS[vehicleId].map(v => v.id).sort());
        for (const entry of population) {
          assert.deepEqual(entry.levels, levels()); assert.deepEqual(entry.credits, levels()); assert.deepEqual(entry.maxLevels, levels());
          assert.equal(entry.spec, T.getVariant(vehicleId, entry.variantId).spec);
          assert.equal(entry.generation, generation); assert.equal(entry.cost, 0);
        }
        if (generation === 5) break;
        const results = population.map((e, i) => ({ uid: e.uid, finished: true, finishTime: 100 + i }));
        const next = T.breed(population, results, { seed: seed + generation });
        assert.deepEqual(next, T.breed(population, results, { seed: seed + generation }));
        assert.equal(next[0].variantId, population[0].variantId);
        assert.equal(next[0].spec, population[0].spec);
        population = next;
      }
    }
  }
});

test('single-trim stock comparison can be evaluated, while incomplete or duplicate input stays invalid', () => {
  const population = T.createPopulation({ vehicleId: 'supra', budget: 0 });
  const results = [{ uid: population[0].uid, finished: true, finishTime: 120, bestLap: 120 }];
  const ranked = T.evaluate(population, results);
  assert.equal(ranked.length, 1); assert.equal(ranked[0].rank, 1); assert.equal(ranked[0].fitness, 120);
  assert.throws(() => T.breed(population, []), /Run the race/);
  assert.throws(() => T.breed([population[0], population[0]], results), /unique/);
  const next = T.breed(population, results, { seed: 42 });
  assert.equal(next.length, 1); assert.equal(next[0].spec, population[0].spec);
  assert.deepEqual(next[0].levels, levels()); assert.equal(next[0].generation, 2);
  assert.throws(() => T.breed([{ ...population[0], budget: 30 }], results), /2–24/);
});

test('stock breeding cannot inherit old paid tuning genes or a modified effective specification', () => {
  const paid = T.createPopulation({ vehicleId: 'g80', budget: 30, count: 8, seed: 99 });
  assert.ok(paid.some(e => keys.some(key => e.levels[key] > 0)));
  const staleStock = paid.map(e => ({ ...e, budget: 0 }));
  const results = staleStock.map((e, i) => ({ uid: e.uid, finished: true, finishTime: 100 + i }));
  const next = T.breed(staleStock, results, { seed: 100 });
  assert.equal(next.length, T.VARIANTS.g80.length, 'old repeated trims collapse to one stock entrant each');
  assert.deepEqual(next.map(e => e.variantId).sort(), T.VARIANTS.g80.map(v => v.id).sort());
  for (const entry of next) {
    assert.deepEqual(entry.levels, levels()); assert.deepEqual(entry.credits, levels()); assert.deepEqual(entry.maxLevels, levels());
    assert.equal(entry.spec, T.getVariant('g80', entry.variantId).spec);
  }
  assert.ok(paid.some(e => keys.some(key => e.levels[key] > 0)), 'normalizing a stock child cannot mutate the old paid experiment');
});

test('paid 18/30/45-point modes retain compensation, tuning headroom and affordable variation', () => {
  for (const budget of [18, 30, 45]) {
    assert.deepEqual(T.getRules('g80', 'g80-2.5t-rwd', { budget }), T.getRules('g80', 'g80-2.5t-rwd'), 'two-argument getRules keeps paid-mode compatibility');
    const entry = T.createEntrant({ vehicleId: 'g80', variantId: 'g80-2.5t-rwd', budget, levels: levels(3, 3, 0, 2) });
    assert.equal(entry.cost, 0); assert.equal(entry.totalCost, 38);
    assert.deepEqual(entry.creditUsed, { acceleration: 15, topSpeed: 15, brakes: 0, grip: 8 });
    assert.deepEqual(entry.maxLevels, { acceleration: 6, topSpeed: 6, brakes: 4, grip: 6 });
    assert.ok(entry.spec.powerPs > entry.factorySpec.powerPs && entry.spec.gripG > entry.factorySpec.gripG);
    for (const vehicleId of Object.keys(T.VARIANTS)) {
      const population = T.createPopulation({ vehicleId, budget, seed: 31415 });
      assert.ok(population.every(e => e.cost <= budget && e.remainingBudget >= 0));
      assert.ok(population.every(e => keys.some(key => e.levels[key] > 0)), vehicleId + ': paid tuning remains active');
    }
  }
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
