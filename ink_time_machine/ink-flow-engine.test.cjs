const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./ink-flow-engine.js');

const modeNames = ['cylinder', 'square', 'vortices', 'plates'];
const samples = [[.48, .11], [.55, -.22], [-.61, .16], [0, .72], [-.35, -.46], [.66, .37]];
const particle = ([x, y]) => ({ x, y, x0: x, y0: y, c: 2 });
function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
}
function follow(mode, p, path) {
  for (let i = 1; i < path.length; i++) E.advect(mode, p, path[i - 1], path[i]);
}
function separation(mode, first, second) {
  return Math.sqrt(E.displacementSquared(mode, { x: first.x, y: first.y, x0: second.x, y0: second.y }));
}

test('four flow geometries expose their actual dimensions and boundary topology', () => {
  assert.deepEqual(Object.keys(E.modes).sort(), [...modeNames].sort());
  const expected = {
    cylinder: [1, 1, false, false], square: [1, 1, true, true],
    vortices: [1.3, .85, false, false], plates: [1.3, .75, true, false]
  };
  for (const mode of modeNames) {
    const m = E.modes[mode];
    assert.deepEqual([m.halfWidth, m.halfHeight, m.periodicX, m.periodicY], expected[mode]);
    assert.ok(m.label.length > 0);
  }
});

test('drawing containment excludes cylinder core and respects each rectangular wall and brush margin', () => {
  assert.equal(E.contains('cylinder', 0, 0), false);
  assert.equal(E.contains('cylinder', .31, 0), false);
  assert.equal(E.contains('cylinder', .5, .5), true);
  assert.equal(E.contains('cylinder', .8, .8), false);
  assert.equal(E.contains('cylinder', .33, 0, .02), false);
  assert.equal(E.contains('cylinder', .99, 0, .02), false);
  for (const mode of modeNames.slice(1)) {
    const { halfWidth: w, halfHeight: h } = E.modes[mode];
    assert.equal(E.contains(mode, 0, 0), true);
    assert.equal(E.contains(mode, w - .01, h - .01), true);
    assert.equal(E.contains(mode, w - .01, h - .01, .02), false);
    assert.equal(E.contains(mode, -w - .001, 0), false);
    assert.equal(E.contains(mode, 0, h + .001), false);
  }
});

test('alternating phases undo the interval being left at positive and negative half-cycle boundaries', () => {
  for (const mode of ['square', 'vortices']) {
    for (const [amount, forward, reverse] of [[0, 0, 1], [.5, 1, 0], [1, 0, 1], [-.5, 1, 0], [-1, 0, 1]]) {
      assert.equal(E.phase(mode, amount, 1), forward);
      assert.equal(E.phase(mode, amount, -1), reverse);
    }
    assert.equal(E.phase(mode, .499, 1), 0);
    assert.equal(E.phase(mode, .501, -1), 1);
  }
  for (const mode of ['cylinder', 'plates']) assert.equal(E.phase(mode, -3.5, -1), 0);
});

for (const mode of modeNames) {
  test(`${mode}: long mixing, negative motion and mid-flight retargeting return to the starting coordinates`, () => {
    const paths = [
      [0, 9.375, 0],
      [0, -3.375, 0],
      [0, 2.275, .625, 3.5, -.875, .5, 0],
      [.23, 1.57, -1.125, .23]
    ];
    for (const path of paths) for (const point of samples) {
      const p = particle(point);
      follow(mode, p, path);
      // Alternating shears amplify floating-point roundoff during long mixing.
      const tolerance = path[1] > 9 ? 1e-6 : 1e-9;
      near(Math.sqrt(E.displacementSquared(mode, p)), 0, tolerance);
      assert.deepEqual([p.x0, p.y0, p.c], [...point, 2]);
    }
  });

  test(`${mode}: rendering batch sizes do not change the flow or reversal order`, () => {
    for (const [from, to] of [[0, 3.125], [3.125, -.375], [-1.23, 2.08]]) for (const point of samples) {
      const oneStep = particle(point), manySteps = particle(point);
      E.advect(mode, oneStep, from, to);
      for (let i = 0; i < 257; i++) E.advect(mode, manySteps,
        from + (to - from) * i / 257, from + (to - from) * (i + 1) / 257);
      near(separation(mode, oneStep, manySteps), 0, 1e-8);
      assert.ok(E.contains(mode, manySteps.x, manySteps.y, -1e-10));
    }
  });
}

test('each mode deforms the ink and produces a distinct flow, beyond a shared rigid translation', () => {
  const signatures = new Set();
  for (const mode of modeNames) {
    const before = samples.map(particle), after = samples.map(particle);
    for (const p of after) E.advect(mode, p, 0, .73);
    assert.ok(after.some(p => E.displacementSquared(mode, p) > .01), `${mode} must move ink`);
    let deformation = 0;
    for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) {
      deformation = Math.max(deformation, Math.abs(separation(mode, before[i], before[j]) - separation(mode, after[i], after[j])));
    }
    assert.ok(deformation > .05, `${mode} must stretch ink rather than move it rigidly`);
    signatures.add(JSON.stringify(after.map(p => [p.x.toFixed(5), p.y.toFixed(5)])));
  }
  assert.equal(signatures.size, 4);
});

test('cylinder retains the Couette profile, fixed outer wall and circular streamlines', () => {
  for (const radius of [.32, .45, .7, 1]) {
    const p = particle([radius, 0]), turns = .125;
    E.advect('cylinder', p, 0, turns);
    const expectedAngle = turns * 2 * Math.PI * (1 / radius ** 2 - 1) / (1 / .32 ** 2 - 1);
    near(p.x, radius * Math.cos(expectedAngle));
    near(p.y, radius * Math.sin(expectedAngle));
    near(Math.hypot(p.x, p.y), radius);
  }
});

test('square uses horizontal then vertical shear and exactly undoes them in reverse order', () => {
  const p = particle([.21, .34]);
  E.advect('square', p, 0, .5);
  near(p.y, .34);
  const horizontalEnd = p.x;
  assert.ok(Math.abs(horizontalEnd - .21) > .1);
  E.advect('square', p, .5, 1);
  near(p.x, horizontalEnd);
  assert.ok(Math.abs(p.y - .34) > .1);
  E.advect('square', p, 1, .5);
  near(p.x, horizontalEnd); near(p.y, .34);
  E.advect('square', p, .5, 0);
  near(Math.sqrt(E.displacementSquared('square', p)), 0);
});

test('each vortex preserves radius around its active center and never moves ink beyond its compact support', () => {
  for (const [from, to, center] of [[0, .5, -.42], [.5, 1, .42]]) {
    const p = particle([center + .24, .21]), radius = Math.hypot(p.x - center, p.y);
    E.advect('vortices', p, from, to);
    near(Math.hypot(p.x - center, p.y), radius);
    assert.ok(E.displacementSquared('vortices', p) > .01);
  }
  for (const point of [[1.29, .84], [-1.29, -.84], [0, .84]]) {
    const p = particle(point); E.advect('vortices', p, -4.25, 5.75);
    assert.deepEqual(p, particle(point));
  }
});

test('parallel plates keep layers horizontal, with stationary midline and opposite wall velocities', () => {
  const top = particle([0, -.75]), middle = particle([0, 0]), bottom = particle([0, .75]);
  for (const p of [top, middle, bottom]) E.advect('plates', p, 0, .25);
  near(top.x, -.5); near(bottom.x, .5); near(middle.x, 0);
  near(top.y, -.75); near(bottom.y, .75); near(middle.y, 0);
});

test('diffusion wraps periodic edges and reflects solid walls even across multiple tank widths', () => {
  const cases = [
    ['square', [.9, -.9], [.35, -.35], [-.75, .75]],
    ['square', [.9, -.9], [14.35, -18.35], [-.75, .75]],
    ['vortices', [1.2, .75], [.3, .3], [1.1, .65]],
    ['vortices', [1.2, .75], [52.3, 34.3], [1.1, .65]],
    ['plates', [1.2, .65], [.3, .3], [-1.1, .55]],
    ['plates', [1.2, .65], [26.3, 30.3], [-1.1, .55]],
    ['cylinder', [.9, 0], [.3, 0], [.8, 0]],
    ['cylinder', [.4, 0], [-.2, 0], [.44, 0]],
    ['cylinder', [.9, 0], [6.6, 0], [.7, 0]]
  ];
  for (const [mode, point, delta, expected] of cases) {
    const p = particle(point); E.diffuse(mode, p, ...delta);
    near(p.x, expected[0]); near(p.y, expected[1]);
    assert.deepEqual([p.x0, p.y0, p.c], [...point, 2]);
  }
  const center = particle([.4, 0]); E.diffuse('cylinder', center, -.4, 0);
  assert.ok(E.contains('cylinder', center.x, center.y), 'a noise step landing exactly at the center must remain finite and in the liquid');
  for (const mode of modeNames) {
    const p = particle([.5, .1]);
    for (let i = 0; i < 200; i++) {
      E.diffuse(mode, p, 37 * Math.sin(i * .73), 31 * Math.cos(i * 1.17));
      assert.ok(Number.isFinite(p.x + p.y));
      assert.ok(E.contains(mode, p.x, p.y, -1e-10), `${mode} particle escaped a wall`);
    }
  }
});

test('restoration error measures the shortest periodic displacement only on wrapping axes', () => {
  near(E.displacementSquared('square', { x: -.98, y: .98, x0: .98, y0: -.98 }), .0032);
  near(E.displacementSquared('plates', { x: -1.29, y: .7, x0: 1.29, y0: -.7 }), .0004 + 1.96);
  near(E.displacementSquared('vortices', { x: -1.29, y: .7, x0: 1.29, y0: -.7 }), 2.58 ** 2 + 1.4 ** 2);
  near(E.displacementSquared('cylinder', { x: -.5, y: 0, x0: .5, y0: 0 }), 1);
});

test('reversing the flow does not erase diffusion or overwrite the stored starting picture', () => {
  for (const mode of modeNames) {
    const p = particle([.48, .11]);
    E.advect(mode, p, 0, .25); E.diffuse(mode, p, .013, -.009); E.advect(mode, p, .25, 0);
    assert.ok(E.displacementSquared(mode, p) > 1e-6, `${mode} must retain irreversible diffusion`);
    assert.deepEqual([p.x0, p.y0, p.c], [.48, .11, 2]);
  }
});
