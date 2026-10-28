'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const NGS = require('./n-grin-shift.js'), Race = require('./race-engine.js'), Circuits = require('./circuits.js');
const Evolution = require('./tuning-evolution.js'), Dynamics = require('./powertrain-dynamics.js');
const tracks = Object.fromEntries(['monza', 'spa', 'silverstone'].map(id => [id, Race.buildTrack(Circuits.find(c => c.id === id))]));
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
function carFor(vehicleId = 'avante_n', variantId = 'avante-n-2.0t-dct', track = tracks.monza) {
  const entrant = Evolution.createEntrant({ vehicleId, variantId, budget: 0 });
  const car = { vehicleId, entrant, spec: entrant.spec, powerPs: entrant.spec.powerPs, speed: 50, distance: 0,
    trackLength: track.centerlineLength - 50, reduction: entrant.spec.reduction, driveReduction: entrant.spec.reduction };
  car.transmission = Dynamics.create(car);
  return car;
}
const inside = (track, index = 0) => { const z = NGS.getZones(track)[index]; return (z.startS + z.lengthM * .4) % track.centerlineLength; };
const input = centerS => ({ centerS, throttle: 1, accelerating: true });

test('historical FIA landmarks resolve six real straights, independently of racing-line length', () => {
  const expected = { monza: [[2810, 3540], [12, 510]], spa: [[1485, 2180], [6760, 145]], silverstone: [[4390, 4950], [1385, 2180]] };
  const before = JSON.stringify(Circuits);
  for (const [id, track] of Object.entries(tracks)) {
    const zones = NGS.getZones(track);
    assert.equal(zones.length, 2); assert.ok(Object.isFrozen(zones));
    zones.forEach((z, i) => {
      close(z.startS, expected[id][i][0], .1); close(z.endS, expected[id][i][1], .1);
      assert.ok(z.lengthM > 300 && z.lengthM < 1000);
      assert.match(z.sourceUrl, /^https:\/\/www\.fia\.com\//);
      assert.ok([2024, 2025].includes(z.referenceYear));
      assert.equal(z.mappingStatus, 'landmark-projected-approximation');
      assert.equal(z.endStatus, 'simulation-conservative-braking-approach');
    });
    assert.deepEqual(NGS.getZones({ ...track, length: track.racingLine.length / 2, spacing: 1 }), zones);
  }
  for (const c of Circuits.filter(c => !Object.hasOwn(tracks, c.id))) assert.deepEqual(NGS.getZones({ id: c.id }), []);
  assert.equal(JSON.stringify(Circuits), before);
  const wrongProjection = { ...tracks.monza, projection: { ...tracks.monza.projection, origin: [0, 0] } };
  assert.deepEqual(NGS.getZones(wrongProjection), []);
});

test('geographic zone anchors survive a changed canonical origin instead of assuming source distance zero is timing', () => {
  const original = Circuits.find(c => c.id === 'monza'), coordinates = original.coordinates.slice(), elevations = original.elevations.slice();
  if (JSON.stringify(coordinates[0]) === JSON.stringify(coordinates.at(-1))) { coordinates.pop(); elevations.pop(); }
  const offset = Math.floor(coordinates.length / 3), rotate = a => a.slice(offset).concat(a.slice(0, offset));
  const shifted = Race.buildTrack({ ...original, coordinates: rotate(coordinates), elevations: rotate(elevations) });
  const originalZones = NGS.getZones(tracks.monza), shiftedZones = NGS.getZones(shifted);
  assert.equal(shiftedZones.length, 2);
  assert.ok(Math.abs(shiftedZones[1].startS - originalZones[1].startS) > 500);
  shiftedZones.forEach((z, i) => close(z.lengthM, originalZones[i].lengthM, 5));
});

test('only exact CN7 N DCT entrant and physical DCT8 profile can activate; all other production variants remain inert', () => {
  for (const [vehicleId, variants] of Object.entries(Evolution.VARIANTS)) for (const variant of variants) {
    const car = carFor(vehicleId, variant.id), state = NGS.create(car, tracks.monza), before = JSON.stringify(car);
    NGS.update(car, state, 1 / 120, { ...input(inside(tracks.monza)), lapIndex: 0 });
    const expected = variant.id === 'avante-n-2.0t-dct';
    assert.equal(state.eligible, expected, variant.id); assert.equal(state.active, expected, variant.id);
    assert.equal(JSON.stringify(car), before, 'state module must not mutate physical car/entrant: ' + variant.id);
  }
  for (const alter of [c => { delete c.entrant; }, c => { c.vehicleId = 'k5'; },
    c => { c.transmission.transmissionType = 'MT'; }, c => { c.transmission.gearCount = 6; }]) {
    const car = carFor(); alter(car); const state = NGS.create(car, tracks.monza);
    NGS.update(car, state, 1, input(inside(tracks.monza))); assert.equal(state.active, false);
  }
  const car = carFor(), state = NGS.create(car, { id: 'taebaek' });
  assert.equal(state.eligible, true); assert.equal(state.supported, false);
  NGS.update(car, state, 1, input(inside(tracks.monza))); assert.equal(state.active, false);
});

test('boost lasts exactly at most ten seconds with fractional-step power, no torque or permanent power mutation', () => {
  for (const dt of [1 / 120, .07, .3, 12]) {
    const car = carFor(), state = NGS.create(car, tracks.monza), before = JSON.stringify(car);
    let delivered = 0;
    while (state.totalActiveSeconds < 10 - 1e-9) {
      NGS.update(car, state, dt, input(inside(tracks.monza)));
      delivered += (state.appliedPowerMultiplier - 1) / (NGS.MODEL.powerMultiplier - 1) * dt;
      assert.equal(state.torqueMultiplier, 1);
      assert.ok(state.remainingSeconds >= 0 && state.remainingSeconds <= 10);
    }
    close(delivered, 10, 1e-8); close(state.totalActiveSeconds, 10);
    assert.equal(state.active, false); assert.equal(state.powerMultiplier, 1); assert.equal(state.boostPs, 0);
    NGS.update(car, state, 100, input(inside(tracks.monza)));
    assert.equal(state.activationCount, 1, 'cooldown completion cannot repeat within the same zone pass');
    assert.equal(JSON.stringify(car), before);
  }
  const car = carFor(); car.powerPs = 420;
  const state = NGS.create(car, tracks.monza); NGS.update(car, state, .1, input(inside(tracks.monza)));
  close(state.boostPs, 15); close(state.powerMultiplier, 290 / 280);
});

test('throttle, speed, braking and zone exits gate actual delivery and trigger a forty-second reuse delay', () => {
  const centerS = inside(tracks.monza);
  for (const patch of [{ throttle: .8 }, { speedMps: 9.99 }, { accelerating: false }, { centerS: NaN }, { centerS: 2000 }]) {
    const car = carFor(), state = NGS.create(car, tracks.monza);
    NGS.update(car, state, .1, { ...input(centerS), ...patch }); assert.equal(state.active, false);
  }
  const car = carFor(), state = NGS.create(car, tracks.monza);
  NGS.update(car, state, 1, input(centerS)); assert.equal(state.active, true);
  NGS.update(car, state, .1, input(4000)); assert.equal(state.active, false);
  close(state.cooldownSeconds, 39.9); assert.equal(state.appliedPowerMultiplier, 1);
  NGS.update(car, state, 39.8, input(inside(tracks.monza, 1))); assert.equal(state.activationCount, 1);
  NGS.update(car, state, .1, input(inside(tracks.monza, 1))); assert.equal(state.activationCount, 1);
  NGS.update(car, state, .1, input(inside(tracks.monza, 1))); assert.equal(state.activationCount, 2);
  car.serviceBrakeForceN = 1;
  NGS.update(car, state, .1, input(inside(tracks.monza, 1))); assert.equal(state.appliedPowerMultiplier, 1); assert.equal(state.active, false);
});

test('Spa wrapped pit zone is one pass across the canonical seam and becomes reusable only on the next lap', () => {
  const track = tracks.spa, car = carFor('avante_n', 'avante-n-2.0t-dct', track), state = NGS.create(car, track);
  car.distance = car.trackLength * .98;
  NGS.update(car, state, 1, input(6900)); assert.equal(state.activationCount, 1);
  car.distance = car.trackLength + 50;
  NGS.update(car, state, 1, input(50)); assert.equal(state.activationCount, 1); assert.equal(state.active, true);
  NGS.update(car, state, .1, input(200)); assert.equal(state.active, false);
  NGS.update(car, state, 40, input(500));
  car.distance = car.trackLength * 1.98;
  NGS.update(car, state, 1, input(6900)); assert.equal(state.activationCount, 2);
  car.distance = car.trackLength * 2 + 50;
  NGS.update(car, state, 1, input(50)); assert.equal(state.activationCount, 2);
});

test('resolved lap indices own zone passes even when the first path has a different length', () => {
  for (const [id, track] of Object.entries(tracks)) {
    const car = carFor('avante_n', 'avante-n-2.0t-dct', track), state = NGS.create(car, track);
    // Deliberately cross the legacy quotient without crossing the actual
    // first-lap boundary. Route geometry belongs to the engine, not NGS.
    car.firstLapLength = car.trackLength + 120;
    car.distance = car.trackLength - 10;
    const request = { ...input(inside(track)), lapIndex: 0 };
    NGS.update(car, state, 10, request);
    assert.equal(state.activationCount, 1, id);
    NGS.update(car, state, 40, { ...request, throttle: 0 });
    car.distance = car.trackLength + 10;
    const before = JSON.stringify(car);
    NGS.update(car, state, 1, request);
    assert.equal(state.activationCount, 1, id + ': one first-lap zone pass');
    assert.equal(state.active, false);
    assert.equal(JSON.stringify(car), before, 'NGS does not update route progress');
    car.distance = car.firstLapLength + car.trackLength * .5;
    NGS.update(car, state, 1, { ...request, lapIndex: 1 });
    assert.equal(state.activationCount, 2, id + ': following flying lap can reuse the zone');
    assert.equal(state.active, true);

    const manual = carFor('avante_n', 'avante-n-2.0t-mt', track), manualState = NGS.create(manual, track);
    NGS.update(manual, manualState, 1, { ...request, lapIndex: 1 });
    assert.equal(manualState.activationCount, 0); assert.equal(manualState.appliedPowerMultiplier, 1);
  }
});

test('Spa keeps one wrapped pass across unequal first and flying lap boundaries', () => {
  const track = tracks.spa, car = carFor('avante_n', 'avante-n-2.0t-dct', track), state = NGS.create(car, track);
  car.firstLapLength = car.trackLength + 120;
  car.distance = car.firstLapLength - 80;
  NGS.update(car, state, 1, { ...input(6900), lapIndex: 0 });
  car.distance = car.firstLapLength + 50;
  NGS.update(car, state, 1, { ...input(50), lapIndex: 1 });
  assert.equal(state.activationCount, 1); assert.equal(state.active, true);
  NGS.update(car, state, 1, { ...input(50), lapIndex: 1, throttle: 0 });
  NGS.update(car, state, 40, { ...input(50), lapIndex: 1, throttle: 0 });
  NGS.update(car, state, 1, { ...input(50), lapIndex: 1 });
  assert.equal(state.activationCount, 1, 'reacceleration after cooldown cannot restart the same wrapped pass');
  car.distance = car.firstLapLength + car.trackLength - 80;
  NGS.update(car, state, 1, { ...input(6900), lapIndex: 1 });
  assert.equal(state.activationCount, 2);
  car.distance = car.firstLapLength + car.trackLength + 50;
  NGS.update(car, state, 1, { ...input(50), lapIndex: 2 });
  assert.equal(state.activationCount, 2); assert.equal(state.active, true);
});

test('invalid resolved lap indices retain the standalone legacy fallback', () => {
  for (const lapIndex of [-1, .5, NaN, Infinity, '0', Number.MAX_SAFE_INTEGER + 1]) {
    const car = carFor(), state = NGS.create(car, tracks.monza), request = input(inside(tracks.monza));
    NGS.update(car, state, 10, { ...request, lapIndex });
    NGS.update(car, state, 40, { ...request, throttle: 0, lapIndex });
    car.distance = car.trackLength + 100;
    NGS.update(car, state, 1, { ...request, lapIndex });
    assert.equal(state.activationCount, 2, String(lapIndex));
  }
});

test('pause is unchanged, finish/DNF clear immediately, and new races/cars start with independent availability', () => {
  const a = carFor(), b = carFor(), state = NGS.create(a, tracks.monza), other = NGS.create(b, tracks.monza);
  const initial = JSON.stringify(state);
  NGS.update(a, state, 0, input(inside(tracks.monza))); assert.equal(JSON.stringify(state), initial);
  NGS.update(a, state, .5, input(inside(tracks.monza))); const running = JSON.stringify(state);
  NGS.update(a, state, 0, input(4000)); assert.equal(JSON.stringify(state), running);
  assert.equal(other.activationCount, 0); assert.equal(other.cooldownSeconds, 0);
  a.finished = true; NGS.update(a, state, 0, input(inside(tracks.monza)));
  assert.equal(state.active, false); assert.equal(state.appliedPowerMultiplier, 1); assert.equal(state.cooldownSeconds, 0);
  NGS.update(b, other, .5, input(inside(tracks.monza))); b.dnf = true;
  NGS.update(b, other, 0); assert.equal(other.active, false); assert.equal(other.boostPs, 0);
  const fresh = NGS.create(carFor(), tracks.monza); assert.equal(fresh.activationCount, 0); assert.equal(fresh.supported, true);
  assert.throws(() => NGS.update(a, fresh, -1), /nonnegative/);
});
