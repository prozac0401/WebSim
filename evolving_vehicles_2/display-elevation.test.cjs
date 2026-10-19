'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Pose = require('./driving-pose.js'), Race = require('./race-engine.js');
const Evolution = require('./tuning-evolution.js'), circuits = require('./circuits.js'), Renderer = require('./circuit-renderer.js');
const rms = xs => Math.sqrt(xs.reduce((sum, x) => sum + x * x, 0) / xs.length);
function fixture(id, vehicleId = 'supra', preserveDem = false) {
  const source = circuits.find(c => c.id === id);
  const circuit = preserveDem ? { ...source, id: id + '-dem-contact-reference' } : source;
  const race = new Race({ circuit, entrants: Evolution.createPopulation({ vehicleId, budget: 0 }), laps: 1 });
  const canvas = { style: {}, getContext: () => ({}), addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 980, height: 615 }) };
  const renderer = new Renderer(canvas); renderer.setRace(race);
  return { race, car: race.cars[0], renderer };
}

test('surface projection uses the continuous ribbon including its analytic grade and periodic seam', () => {
  const radius = 80, length = 2 * Math.PI * radius;
  const sample = s => { s = (s % length + length) % length; const angle = s / radius;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z: 20 + 5 * Math.sin(angle),
      angle: angle + Math.PI / 2, grade: 5 * Math.cos(angle) / radius, curvature: 1 / radius, s }; };
  const edges = Array.from({ length: 128 }, (_, i) => {
    const s = length * i / 128, p = sample(s), at = offset => ({ x: p.x - Math.sin(p.angle) * offset, y: p.y + Math.cos(p.angle) * offset, z: p.z });
    return { p, s, left: at(-6), right: at(6), outerLeft: at(-7), outerRight: at(7) };
  });
  const road = { sample, edges, stats: { method: 'adaptive-c2-centreline' } };
  for (const s of [0, .00001, 50, 225, length - .00001, length]) for (const lateral of [-5, 0, 5]) {
    const p = sample(s), x = p.x - Math.sin(p.angle) * lateral, y = p.y + Math.cos(p.angle) * lateral;
    const q = Pose.surfaceAt(road, { x, y, z: p.z, angle: p.angle + .15 });
    assert.ok(q); assert.ok(Math.abs(q.z - p.z) < 1e-8);
    assert.ok(Math.abs(q.lateral - lateral) < 1e-8);
    assert.ok(Math.abs(q.grade - p.grade * Math.cos(.15) / (1 - lateral / radius)) < 1e-8);
    const h = .001, at = d => Pose.surfaceAt(road, { x: x + Math.cos(p.angle + .15) * d, y: y + Math.sin(p.angle + .15) * d, z: p.z }, q.s).z;
    assert.ok(Math.abs((at(h) - at(-h)) / (2 * h) - q.grade) < 1e-8, 'grade differentiates the same height field');
  }
  assert.equal(Pose.surfaceAt(road, { x: 0, y: 0, z: 20 }), null, 'far-away terrain is not a road support');
  assert.equal(Pose.surfaceAt(road, { x: 80, y: 0, z: 45, angle: Math.PI / 2 }), null, 'a different-height return leg is not selected');
  assert.equal(Pose.surfaceAt({ ...road, stats: { method: 'legacy-offset-fallback' } }, { x: 80, y: 0 }), null, 'the existing folded-source fallback is preserved');
});

test('the original Taebaek DEM uphill and later crests lose contact pitch pulses without moving the driven XY line', t => {
  const reports = [];
  for (const vehicleId of ['supra', 'avante_n', 'staria']) {
    // Keep the original steep DEM here to isolate the road-contact fix. The
    // separate regrading regression compares the new hill with this baseline.
    const { race, car, renderer: r } = fixture('taebaek', vehicleId, true), before = JSON.stringify(race.cars);
    for (const [from, to] of [[480, 650], [1000, car.trackLength]]) {
      const oldPitch = [], pitch = [];
      for (let s = from; s < to; s += .1) {
        const raw = Pose.sampleCar(race, car, s), p = r._displayPose(raw, car);
        assert.deepEqual([p.x, p.y, p.angle, p.curvature], [raw.x, raw.y, raw.angle, raw.curvature]);
        oldPitch.push(Math.atan(raw.grade * 1.75)); pitch.push(Math.atan(p.grade));
      }
      const first = values => values.slice(1).map((v, i) => (v - values[i]) / .1);
      const previous = first(oldPitch), current = first(pitch), previousRipple = rms(first(previous)), ripple = rms(first(current));
      const peak = Math.max(...current.map(Math.abs));
      assert.ok(peak < .05, vehicleId + ' pitch rate / metre: ' + peak);
      if (from === 480) {
        assert.ok(peak < Math.max(...previous.map(Math.abs)) * .3, 'at least 70% less peak pitch-rate pulse');
        assert.ok(ripple < previousRipple * .2, 'at least 80% less short pitch oscillation');
      } else assert.ok(ripple < previousRipple, 'later crests and the end of the lap also improve');
      reports.push({ vehicleId, from, to, maximumPitchRateRadPerM: peak, oldPitchSecondRMS: previousRipple, pitchSecondRMS: ripple });
    }
    assert.equal(JSON.stringify(race.cars), before, 'display sampling cannot mutate physics, telemetry or score inputs'); r.destroy();
  }
  t.diagnostic(JSON.stringify(reports));
});

test('all courses keep wheelbase supports on the displayed road and retain the original horizontal trajectory', t => {
  const reports = [];
  for (const circuit of circuits) {
    const { race, car, renderer: r } = fixture(circuit.id), source = JSON.stringify(race.track);
    let maximumContactError = 0, maximumHeightCorrection = 0, minimumFloorClearance = Infinity, checked = 0;
    for (let s = 0; s < car.trackLength; s += 2) {
      const raw = Pose.sampleCar(race, car, s), p = r._displayPose(raw, car), q = Pose.surfaceAt(r.roadGeometry, p);
      assert.deepEqual([p.x, p.y, p.angle, p.curvature], [raw.x, raw.y, raw.angle, raw.curvature]);
      if (circuit.id === 'pocheon') {
        assert.equal(q, null); assert.equal(p.z, r._displayHeight(raw.z)); assert.equal(p.grade, raw.grade * 1.75); continue;
      }
      assert.ok(q, circuit.id + ' missing road support at ' + s); checked++;
      const run = car.wheelbaseM / (2 * Math.hypot(1, p.grade));
      for (const sign of [-1, 1]) {
        const support = Pose.surfaceAt(r.roadGeometry, { ...p, x: p.x + sign * run * Math.cos(p.angle), y: p.y + sign * run * Math.sin(p.angle) }, q.s);
        assert.ok(support);
        maximumContactError = Math.max(maximumContactError, Math.abs(p.z + sign * run * p.grade - support.z));
      }
      minimumFloorClearance = Math.min(minimumFloorClearance, p.z + .055 - q.z);
      maximumHeightCorrection = Math.max(maximumHeightCorrection, Math.abs(p.z - r._displayHeight(raw.z)));
    }
    assert.ok(maximumContactError < .001, circuit.id + ': wheelbase contact error ' + maximumContactError);
    assert.ok(minimumFloorClearance > .015, circuit.id + ': centre floor crosses the road');
    assert.ok(maximumHeightCorrection < .15, circuit.id + ': unexpectedly large height correction');
    assert.equal(JSON.stringify(race.track), source, 'road and physical elevations remain unchanged');
    reports.push({ id: circuit.id, checked, maximumContactError, maximumHeightCorrection }); r.destroy();
  }
  t.diagnostic(JSON.stringify(reports));
});

test('sampling the corrected display during an actual race leaves lap time and final physical state identical', () => {
  const { race, car, renderer: r } = fixture('taebaek');
  const reference = new Race({ circuit: race.circuit, entrants: Evolution.createPopulation({ vehicleId: 'supra', budget: 0 }), laps: 1 });
  r.setView('follow');
  while (!race.finished && race.time < 600) {
    race.step(.5); reference.step(.5); r._displayPose(Pose.sampleCar(race, car), car); r.advanceCamera(.1);
  }
  assert.ok(car.finished && !car.dnf); assert.deepEqual(race.standings(), reference.standings());
  assert.equal(JSON.stringify(race.cars), JSON.stringify(reference.cars)); r.destroy();
});
