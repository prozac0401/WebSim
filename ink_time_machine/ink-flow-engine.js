(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InkFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TAU = 2 * Math.PI;
  const INNER = .32;
  const modes = Object.freeze({
    cylinder: Object.freeze({ label: '원통', halfWidth: 1, halfHeight: 1, innerRadius: INNER, periodicX: false, periodicY: false }),
    square: Object.freeze({ label: '사각 교대 전단', halfWidth: 1, halfHeight: 1, periodicX: true, periodicY: true }),
    vortices: Object.freeze({ label: '두 소용돌이', halfWidth: 1.3, halfHeight: .85, periodicX: false, periodicY: false }),
    plates: Object.freeze({ label: '평행판', halfWidth: 1.3, halfHeight: .75, periodicX: true, periodicY: false })
  });

  function dimensions(mode) {
    if (!Object.prototype.hasOwnProperty.call(modes, mode)) throw new RangeError('Unknown ink flow mode: ' + mode);
    return modes[mode];
  }

  function wrap(value, halfSize) {
    if (value >= -halfSize && value < halfSize) return value;
    const size = 2 * halfSize;
    return ((value + halfSize) % size + size) % size - halfSize;
  }

  function reflect(value, minimum, maximum) {
    if (value >= minimum && value <= maximum) return value;
    const size = maximum - minimum;
    const folded = ((value - minimum) % (2 * size) + 2 * size) % (2 * size);
    return folded <= size ? minimum + folded : maximum - (folded - size);
  }

  function contains(mode, x, y, margin = 0) {
    const shape = dimensions(mode);
    if (mode === 'cylinder') {
      const radius = Math.hypot(x, y);
      return radius >= INNER + margin && radius <= 1 - margin;
    }
    return Math.abs(x) <= shape.halfWidth - margin && Math.abs(y) <= shape.halfHeight - margin;
  }

  // At an exact half-cycle boundary, select the interval being entered.
  // Negative motion must undo the preceding interval before the one before it.
  function phase(mode, amount, direction = 1) {
    dimensions(mode);
    if (mode !== 'square' && mode !== 'vortices') return 0;
    const interval = direction < 0 ? Math.ceil(2 * amount) - 1 : Math.floor(2 * amount);
    return ((interval % 2) + 2) % 2;
  }

  function alternatingStep(mode, p, delta, active) {
    if (mode === 'square') {
      if (active === 0) p.x = wrap(p.x + 3.2 * delta * Math.sin(Math.PI * p.y), 1);
      else p.y = wrap(p.y + 3.2 * delta * Math.sin(Math.PI * p.x), 1);
      return;
    }

    // Each circular support fits fully inside the rectangular tank. Its twist
    // preserves radius, so advection needs no wall clipping or reflection.
    const center = active === 0 ? -.42 : .42;
    const x = p.x - center, y = p.y;
    const radiusSquared = x * x + y * y;
    const supportSquared = .8 * .8;
    if (radiusSquared >= supportSquared) return;
    const profile = (1 - radiusSquared / supportSquared) ** 2;
    const angle = delta * 4 * Math.PI * profile * (active === 0 ? 1 : -1);
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    p.x = center + x * cosine - y * sine;
    p.y = x * sine + y * cosine;
  }

  function advect(mode, p, from, to) {
    dimensions(mode);
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new RangeError('Flow amounts must be finite.');
    if (from === to) return;
    if (mode === 'cylinder') {
      const radiusSquared = p.x * p.x + p.y * p.y;
      const angle = (to - from) * TAU * (1 / radiusSquared - 1) / (1 / (INNER * INNER) - 1);
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      const x = p.x;
      p.x = x * cosine - p.y * sine;
      p.y = x * sine + p.y * cosine;
      return;
    }
    if (mode === 'plates') {
      p.x = wrap(p.x + 2 * (to - from) * p.y / modes.plates.halfHeight, modes.plates.halfWidth);
      return;
    }

    const direction = Math.sign(to - from);
    let current = from;
    while (direction * (to - current) > 0) {
      const boundary = direction > 0
        ? (Math.floor(2 * current) + 1) / 2
        : (Math.ceil(2 * current) - 1) / 2;
      const next = direction > 0 ? Math.min(to, boundary) : Math.max(to, boundary);
      // At amounts too large to represent another half-cycle, stop explicitly
      // rather than entering a loop that cannot make numerical progress.
      if (next === current) throw new RangeError('Flow amount exceeds half-cycle precision.');
      alternatingStep(mode, p, next - current, phase(mode, current, direction));
      current = next;
    }
  }

  function diffuse(mode, p, dx, dy) {
    const shape = dimensions(mode);
    const oldX = p.x, oldY = p.y;
    p.x += dx;
    p.y += dy;
    if (mode === 'cylinder') {
      const radius = Math.hypot(p.x, p.y);
      if (radius >= INNER && radius <= 1) return;
      const reflected = reflect(radius, INNER, 1);
      if (radius > 0) {
        p.x *= reflected / radius;
        p.y *= reflected / radius;
      } else {
        const oldRadius = Math.hypot(oldX, oldY);
        p.x = oldRadius > 0 ? oldX * reflected / oldRadius : reflected;
        p.y = oldRadius > 0 ? oldY * reflected / oldRadius : 0;
      }
      return;
    }
    p.x = shape.periodicX ? wrap(p.x, shape.halfWidth) : reflect(p.x, -shape.halfWidth, shape.halfWidth);
    p.y = shape.periodicY ? wrap(p.y, shape.halfHeight) : reflect(p.y, -shape.halfHeight, shape.halfHeight);
  }

  function displacementSquared(mode, p) {
    const shape = dimensions(mode);
    const dx = shape.periodicX ? wrap(p.x - p.x0, shape.halfWidth) : p.x - p.x0;
    const dy = shape.periodicY ? wrap(p.y - p.y0, shape.halfHeight) : p.y - p.y0;
    return dx * dx + dy * dy;
  }

  // Free ink is an independent, deliberately non-reversible visual flow. This
  // prescribed velocity field and decaying brush impulses are not a fluid solver.
  function createLive(options = {}) {
    const requested = Number(options.limit);
    return { particles: [], limit: Number.isFinite(requested) ? Math.max(64, Math.min(3600, Math.floor(requested))) : 3600,
      seed: (options.seed ?? 731) >>> 0, time: 0, next: 0, injections: 0, stirs: 0 };
  }
  function liveRandom(state) {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    return (state.seed + .5) / 4294967296;
  }
  function injectLive(state, x, y, color, count = 45, radius = .045) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !contains('vortices', x, y)) return 0;
    const amount = Math.max(0, Math.min(160, Math.floor(count) || 0));
    const size = Number.isFinite(radius) ? Math.max(.004, Math.min(.15, radius)) : .045;
    for (let i = 0; i < amount; i++) {
      const angle = liveRandom(state) * TAU, r = Math.sqrt(liveRandom(state)) * size;
      const p = { x, y, px: x, py: y, vx: 0, vy: 0, age: 0, c: ((Math.floor(color) || 0) % 4 + 4) % 4 };
      diffuse('vortices', p, Math.cos(angle) * r, Math.sin(angle) * r);
      p.px = p.x; p.py = p.y;
      if (state.particles.length < state.limit) state.particles.push(p);
      else { state.particles[state.next] = p; state.next = (state.next + 1) % state.limit; }
    }
    state.injections += amount;
    return amount;
  }
  function stirLive(state, x, y, dx, dy) {
    if (![x, y, dx, dy].every(Number.isFinite) || !contains('vortices', x, y)) return;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const scale = Math.min(1, .2 / length); dx *= scale; dy *= scale;
    for (const p of state.particles) {
      const rx = p.x - x, ry = p.y - y, r2 = rx * rx + ry * ry;
      if (r2 > .22) continue;
      const weight = (1 - r2 / .22) ** 2;
      // Curl around the dragged brush, plus a local displacement that makes the
      // touch response visible immediately, including while playback is paused.
      const curl = (rx * dy - ry * dx) * 28;
      p.vx = Math.max(-2, Math.min(2, p.vx + (dx * 22 - ry * curl) * weight));
      p.vy = Math.max(-2, Math.min(2, p.vy + (dy * 22 + rx * curl) * weight));
      p.px = p.x; p.py = p.y;
      diffuse('vortices', p, dx * .35 * weight, dy * .35 * weight);
    }
    state.stirs++;
  }
  function stepLive(state, seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Bound each step independently from presentation quality and frame rate.
    const dt = Math.min(seconds, .05), t = state.time;
    const cores = [[-.48 + .09 * Math.sin(t * .27), -.06 + .09 * Math.cos(t * .31), .49],
      [.49 + .08 * Math.cos(t * .23), .08 + .12 * Math.sin(t * .29), -.43]];
    const drag = Math.exp(-dt * 2.8);
    for (const p of state.particles) {
      p.px = p.x; p.py = p.y;
      let vx = .045 * Math.sin(p.y * 3.4 + t * .24), vy = .035 * Math.cos(p.x * 3.7 - t * .19);
      for (const [cx, cy, spin] of cores) {
        const x = p.x - cx, y = p.y - cy, r2 = x * x + y * y;
        const rotation = spin * Math.exp(-r2 * 2.4) / (.12 + r2);
        vx -= y * rotation; vy += x * rotation;
      }
      p.vx *= drag; p.vy *= drag;
      // Small seeded spreading keeps neighboring dye paths from staying rigid.
      const spread = .0035 * Math.sqrt(dt);
      diffuse('vortices', p, (vx + p.vx) * dt + (liveRandom(state) - .5) * spread,
        (vy + p.vy) * dt + (liveRandom(state) - .5) * spread);
      p.age += dt;
    }
    state.time += dt;
  }

  return Object.freeze({ modes, contains, advect, diffuse, displacementSquared, phase,
    live: Object.freeze({ create: createLive, inject: injectLive, stir: stirLive, step: stepLive }) });
});
