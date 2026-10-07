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

  return Object.freeze({ modes, contains, advect, diffuse, displacementSquared, phase });
});
