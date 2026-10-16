const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the real inline app and controls. Canvas calls are inert: browser QA
// separately verifies pixels, while these tests check model and gesture behavior.
function loadApp({ compact = false, reduced = false } = {}) {
  const html = fs.readFileSync(path.join(__dirname, 'boids_simulation.html'), 'utf8');
  const elements = new Map(), windowEvents = new Map(), documentEvents = new Map(), noOp = () => {};
  let animation, clock = 0;
  const media = new Map();
  const paint = new Proxy({ createRadialGradient: () => ({ addColorStop: noOp }) }, { get: (o, k) => k in o ? o[k] : noOp });
  function element(id = '') {
    if (elements.has(id)) return elements.get(id);
    const events = new Map(), captures = new Set();
    const e = { id, value: '', max: '', checked: false, disabled: false, style: {}, dataset: {}, attributes: {}, width: 800, height: 500,
      rect: { left: 0, top: 0, width: 800, height: 500 },
      getContext: () => paint, getBoundingClientRect() { return this.rect; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      setPointerCapture(id) { captures.add(id); }, hasPointerCapture: id => captures.has(id), releasePointerCapture(id) { captures.delete(id); },
      addEventListener(type, fn) { events.set(type, fn); },
      dispatch(type, event = {}) { events.get(type)?.(event); this['on' + type]?.(event); },
      click() { if (!this.disabled) this.dispatch('click'); }
    };
    if (id) elements.set(id, e);
    return e;
  }
  for (const tag of html.matchAll(/<(input|select|button|canvas)\b[^>]*>/g)) {
    const id = /\bid="([^"]+)"/.exec(tag[0])?.[1];
    if (!id) continue;
    const e = element(id);
    e.value = /\bvalue="([^"]*)"/.exec(tag[0])?.[1] || '';
    e.max = /\bmax="([^"]*)"/.exec(tag[0])?.[1] || '';
    e.checked = /\bchecked\b/.test(tag[0]); e.disabled = /\bdisabled\b/.test(tag[0]);
  }
  element('playback-speed').value = '1';
  const presets = ['balanced', 'separate', 'align'].map(name => { const e = element('preset-' + name); e.dataset.boidsPreset = name; return e; });
  const context = { performance: { now: () => clock }, requestAnimationFrame: fn => { animation = fn; },
    matchMedia(query) { if (!media.has(query)) media.set(query, { matches: query.includes('reduced-motion') ? reduced : compact, addEventListener(type, fn) { this.listener = fn; } }); return media.get(query); },
    addEventListener: (type, fn) => windowEvents.set(type, fn),
    document: { hidden: false, getElementById: element, createElement: () => element(), querySelectorAll: () => presets, addEventListener: (type, fn) => documentEvents.set(type, fn) }
  };
  context.window = context;
  vm.runInNewContext(/<script>\s*([\s\S]*?)<\/script>/.exec(html)[1], context, { filename: 'boids_simulation.html' });
  return { element, context, model: element('sim-app')._model, state: () => JSON.parse(context.render_game_to_text()),
    click: id => element(id).click(), advance: ms => context.advanceTime(ms), frame: t => animation(t),
    input(id, value) { element(id).value = String(value); element(id).dispatch('input'); },
    check(id, checked) { element(id).checked = checked; element(id).dispatch('change'); },
    select(id, value) { element(id).value = String(value); element(id).dispatch('change'); },
    pointer(type, overrides = {}) { element('canvas').dispatch(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 400, clientY: 250, preventDefault: noOp, ...overrides }); },
    windowEvent: type => windowEvents.get(type)?.(),
    hidden() { context.document.hidden = true; documentEvents.get('visibilitychange')?.(); },
    reduced(value) { const m = media.get('(prefers-reduced-motion: reduce)'); m.matches = value; m.listener?.(); },
    elapsed(ms) { clock += ms; }
  };
}
const seed = [
  { id: 0, x: 799, y: 250, vx: 1.5, vy: 0.1 },
  { id: 1, x: 7, y: 252, vx: -1, vy: 1 },
  { id: 2, x: 30, y: 255, vx: 1, vy: -1 },
  { id: 3, x: 400, y: 490, vx: 0.5, vy: 1.5 },
];

test('visual modes, direction colors, trails and ambient setting preserve exact flock calculations', () => {
  const birds = loadApp(), lights = loadApp(), reduced = loadApp({ reduced: true });
  for (const app of [birds, lights, reduced]) { app.model.setBoids(seed); app.click('boids-start'); }
  lights.click('view-lights'); lights.check('heading-colors', true);
  reduced.click('view-lights');
  birds.check('trails', true);
  for (const app of [birds, lights, reduced]) app.advance(2000);
  assert.deepEqual(lights.state().boids, birds.state().boids);
  assert.deepEqual(reduced.state().boids, birds.state().boids);
  assert.equal(lights.state().stepCount, 120);
  assert.equal(lights.state().visualMode, 'lights');
  assert.ok(lights.state().trailPoints > 0);
  assert.equal(reduced.state().trailPoints, 0);
  const previous = lights.state().boids;
  lights.click('view-birds');
  assert.deepEqual(lights.state().boids, previous);
  assert.equal(lights.state().trailPoints, 0);
});

test('periodic neighbors, overlap separation and simultaneous stepping remain finite and order independent', () => {
  const a = loadApp(), b = loadApp();
  const points = [...seed, { id: 4, x: 30, y: 255, vx: 0, vy: 0 }];
  a.model.setBoids(points); b.model.setBoids([...points].reverse());
  assert.equal(a.model.offset(points[0], points[1]).x, 8);
  for (let i = 0; i < 60; i++) { a.model.tick(); b.model.tick(); }
  const sorted = app => app.state().boids.sort((x, y) => x.id - y.id);
  for (let i = 0; i < points.length; i++) {
    for (const k of ['x', 'y', 'vx', 'vy']) assert.ok(Math.abs(sorted(a)[i][k] - sorted(b)[i][k]) < 1e-10);
    assert.ok(sorted(a)[i].x >= 0 && sorted(a)[i].x < 800);
    assert.ok(sorted(a)[i].y >= 0 && sorted(a)[i].y < 500);
    assert.ok(Math.hypot(sorted(a)[i].vx, sorted(a)[i].vy) <= 2 + 1e-12);
  }
});

test('manual time respects pause, resumes with playback rate, and single step advances exactly once', () => {
  const a = loadApp();
  a.advance(1000); assert.equal(a.state().stepCount, 60); assert.equal(a.state().running, true);
  a.click('boids-pause'); const frozen = a.state().boids;
  a.advance(1000); assert.deepEqual(a.state().boids, frozen); assert.equal(a.state().stepCount, 60);
  a.click('boids-step'); assert.equal(a.state().stepCount, 61); assert.equal(a.state().running, false);
  a.select('playback-speed', 0.25); a.click('boids-start'); a.advance(1000);
  assert.equal(a.state().stepCount, 76);
  a.frame(1000); a.frame(2000); assert.equal(a.state().stepCount, 76, 'RAF cannot double-step manual time');
  a.click('view-lights'); a.click('boids-reset');
  assert.equal(a.state().stepCount, 0); assert.equal(a.state().running, false); assert.equal(a.state().visualMode, 'lights');
  assert.equal(a.state().playbackRate, 0.25); assert.equal(a.state().trailPoints, 0);
});

test('touch drags repel immediately, capture, skip tap inspection and clean up every ending', () => {
  const a = loadApp(); a.model.setBoids([{ id: 0, x: 410, y: 250, vx: 0, vy: 0 }]);
  a.pointer('pointerdown'); assert.equal(a.state().pointerActive, true); assert.deepEqual(a.state().mouse, { x: 400, y: 250 });
  assert.equal(a.element('canvas').hasPointerCapture(1), true);
  a.click('boids-step'); assert.ok(a.state().boids[0].vx > 0);
  a.pointer('pointermove', { clientX: 460 }); a.pointer('pointerup', { clientX: 460 });
  assert.equal(a.state().inspection, null); assert.equal(a.state().mouse, null); assert.equal(a.state().pointerActive, false);
  for (const ending of ['pointercancel', 'lostpointercapture', 'blur', 'resize', 'hidden', 'reset']) {
    a.pointer('pointerdown');
    if (ending === 'hidden') a.hidden();
    else if (ending === 'reset') a.click('boids-reset');
    else if (['blur', 'resize'].includes(ending)) a.windowEvent(ending);
    else a.pointer(ending);
    assert.equal(a.state().mouse, null, ending); assert.equal(a.state().pointerActive, false, ending);
  }
});

test('tap inspection, mouse hover, pointer toggle and scaled input stay usable', () => {
  const a = loadApp(); a.click('boids-pause');
  a.element('canvas').rect = { left: 20, top: 50, width: 400, height: 250 };
  a.pointer('pointerdown', { clientX: 220, clientY: 175 });
  assert.deepEqual(a.state().mouse, { x: 400, y: 250 });
  a.pointer('pointerup', { clientX: 220, clientY: 175 }); assert.ok(a.state().inspection);
  a.click('inspect-clear'); assert.equal(a.state().inspection, null);
  a.click('inspect-next'); assert.equal(a.state().inspection.id, 0);
  a.pointer('pointermove', { pointerType: 'mouse', clientX: 220, clientY: 175 });
  assert.deepEqual(a.state().mouse, { x: 400, y: 250 });
  a.check('mouseRepel', false); assert.equal(a.state().mouse, null);
  a.pointer('pointermove', { pointerType: 'touch', clientX: 250, clientY: 180 }); assert.equal(a.state().mouse, null);
  a.pointer('pointermove', { pointerType: 'mouse', clientX: 900, clientY: 900 }); assert.equal(a.state().mouse, null);
});

test('mobile population and trail storage are bounded; reduced motion clears effects without advancing time', () => {
  const a = loadApp({ compact: true });
  assert.equal(a.element('boidCount').max, '180');
  a.input('boidCount', 300); assert.equal(a.state().boids.length, 180);
  a.click('view-lights'); a.advance(2000);
  assert.equal(a.state().effectQuality, 'compact'); assert.ok(a.state().trailPoints <= 1800);
  a.input('boidCount', 10); assert.ok(a.state().trailPoints <= 100);
  const before = a.state().boids, step = a.state().stepCount;
  a.reduced(true); assert.equal(a.state().effectsEnabled, false); assert.equal(a.state().trailPoints, 0);
  assert.deepEqual(a.state().boids, before); assert.equal(a.state().stepCount, step);
  a.reduced(false); a.context.WebSimAmbient = { enabled: false }; a.windowEvent('websim:ambient-change');
  a.advance(100); assert.equal(a.state().trailPoints, 0);
});

test('presets keep the same flock; lowering count clears a removed inspection', () => {
  const a = loadApp(); a.click('boids-pause');
  const before = a.state().boids;
  a.click('preset-align'); assert.deepEqual(a.state().boids, before);
  assert.equal(a.state().params.separation, 0.6); assert.equal(a.state().params.alignment, 2.5); assert.equal(a.state().params.cohesion, 0.4);
  for (let i = 0; i < 100; i++) a.click('inspect-next');
  assert.equal(a.state().inspection.id, 99);
  a.input('boidCount', 10); assert.equal(a.state().inspection, null);
});

test('slow frames lower only decorative quality and periodic wrap never stores a canvas-wide trail', () => {
  const a = loadApp();
  a.model.setBoids([{ id: 0, x: 798, y: 250, vx: 2, vy: 0 }]); a.click('view-lights'); a.click('boids-start');
  for (let i = 0; i < 50; i++) a.frame(100 + i * 40);
  assert.equal(a.state().effectQuality, 'low'); assert.equal(a.state().running, true);
  assert.ok(a.state().trailPoints <= 10);
  const wrap = loadApp(); wrap.click('view-lights');
  wrap.model.setBoids([{ id: 0, x: 792, y: 250, vx: 2, vy: 0 }]);
  for (let i = 0; i < 4; i++) wrap.model.tick();
  assert.equal(wrap.state().boids[0].x, 0);
  assert.equal(wrap.state().trailPoints, 1, 'wrapped trajectory starts a fresh visible segment');
});
