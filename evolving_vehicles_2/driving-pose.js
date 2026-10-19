/* Shared display-only trajectory. Physics, distance, speed and lap timing remain
 * in TrackRace. A periodic cubic B-spline supplies one position and its analytic
 * tangent for the car, follow camera and drawn racing line. It is C2 at every
 * knot, including the timing line; no frame-history or heading lag is involved.
 * A fresh standing start uses a separate C2 50 m centerline-to-racing-line
 * trajectory. Its one-time correction is excluded from the ordinary .4 m bound.
 */
(function (root) {
  'use strict';
  const cache = new WeakMap();
  // The old 24 cm control cap left usable room inside the 40 cm curve bound.
  // In the actual wide-apex Taebaek line, that cap retained 12–15 m steering
  // pulses even though the spline was C2. Use at most 35 cm for the existing
  // cubic fit; roundingBound below still subtracts the spline's own deviation.
  // Fit scales are unchanged, so this does not widen the filter or round off
  // every hairpin. Tighter source corners can still impose a smaller budget.
  const MAX_DEVIATION_M = .4, MAX_CONTROL_SHIFT_M = .35, SIGMA_M = 6;
  const MAX_ELEVATION_DEVIATION_M = .025, MAX_ELEVATION_CONTROL_SHIFT_M = .012;
  const START_TRANSITION_M = 50;
  const TIMING_LINE_CONTROL_SHIFT_M = .24;
  // Start below the source path's ~4 m point spacing. A 10 m first fit is
  // frequently constrained in a hairpin, leaving the polygon's straight/turn
  // pulses untouched. Short fits remove that ripple before longer fits taper
  // in, without giving the car a heading separate from its actual position.
  const PLANAR_SCALES_M = [2, 4, 6, 10, 14, 18], LIMIT_TRANSITION_M = 10;
  const mod = (n, d) => ((n % d) + d) % d;
  const lerp = (a, b, t) => a + (b - a) * t;

  // The difference between a cubic Bezier segment and its original straight
  // segment is itself a Bezier curve. Its control-point convex hull gives a
  // continuous bound, not just a check at a few sampled positions.
  function deviationBound(controls, original) {
    let planar = 0, vertical = 0;
    const n = controls.length;
    for (let i = 0; i < n; i++) {
      const a = controls[mod(i - 1, n)], b = controls[i], c = controls[(i + 1) % n], d = controls[(i + 2) % n];
      const from = original[i], to = original[(i + 1) % n];
      for (let k = 0; k < 4; k++) {
        const weights = k === 0 ? [1 / 6, 4 / 6, 1 / 6, 0] : k === 1 ? [0, 2 / 3, 1 / 3, 0] : k === 2 ? [0, 1 / 3, 2 / 3, 0] : [0, 1 / 6, 4 / 6, 1 / 6];
        const p = [a, b, c, d];
        const x = p.reduce((v, q, j) => v + weights[j] * q.x, 0) - lerp(from.x, to.x, k / 3);
        const y = p.reduce((v, q, j) => v + weights[j] * q.y, 0) - lerp(from.y, to.y, k / 3);
        const z = p.reduce((v, q, j) => v + weights[j] * q.z, 0) - lerp(from.z, to.z, k / 3);
        planar = Math.max(planar, Math.hypot(x, y)); vertical = Math.max(vertical, Math.abs(z));
      }
    }
    return { planar, vertical };
  }

  // A weighted local cubic fit retains constants, tangents and the quadratic
  // part of a circular arc. Ordinary Gaussian position smoothing pulls every
  // corner inward; clipping that shrinkage point by point copies the polygon's
  // alternating straight/turn curvature straight back into the visible path.
  function planarFit(points, spacing, sigma) {
    const count = points.length, radius = Math.min(Math.ceil(3 * sigma / spacing), Math.floor((count - 1) / 2));
    const gaussian = [], offsetsSquared = [];
    let m0 = 0, m2 = 0, m4 = 0;
    for (let j = -radius; j <= radius; j++) {
      const squared = (j * spacing) ** 2, w = Math.exp(-.5 * squared / (sigma * sigma));
      gaussian.push(w); offsetsSquared.push(squared); m0 += w; m2 += w * squared; m4 += w * squared * squared;
    }
    const denominator = m0 * m4 - m2 * m2;
    if (denominator < 1e-20) return points.map(p => ({ x: p.x, y: p.y }));
    const weights = gaussian.map((w, j) => w * (m4 - m2 * offsetsSquared[j]) / denominator);
    return points.map((_p, i) => {
      let x = 0, y = 0;
      for (let j = 0; j < weights.length; j++) {
        const p = points[mod(i + j - radius, count)], w = weights[j]; x += w * p.x; y += w * p.y;
      }
      return { x, y };
    });
  }

  function smoothPlanar(original, spacing, shiftLimit) {
    const count = original.length, radius = Math.min(Math.ceil(LIMIT_TRANSITION_M / spacing), Math.floor((count - 1) / 2));
    const weights = Array.from({ length: radius * 2 + 1 }, (_, j) => Math.exp(-.5 * ((j - radius) / Math.max(radius / 2, 1)) ** 2));
    const total = weights.reduce((a, b) => a + b, 0);
    // Vehicle-specific paths share their first/last 50 m anchors. Keep the
    // established fit budget there to avoid amplifying their resampling
    // differences at the flying-start pose; use the wider budget by 100 m.
    const shiftLimits = original.map((_p, i) => {
      const distance = Math.min(i, count - i) * spacing;
      const t = Math.max(0, Math.min(1, (distance - START_TRANSITION_M) / START_TRANSITION_M));
      return Math.min(shiftLimit, TIMING_LINE_CONTROL_SHIFT_M +
        (MAX_CONTROL_SHIFT_M - TIMING_LINE_CONTROL_SHIFT_M) * t * t * t * (10 + t * (-15 + 6 * t)));
    });
    let controls = original.map(p => ({ ...p }));
    for (const sigma of PLANAR_SCALES_M) {
      const target = planarFit(original, spacing, sigma);
      // Largest blend along each current->target segment that stays in the
      // original point's displacement disk. The disk is convex, so any smaller
      // blend remains within the same proved 40 cm whole-curve bound.
      const limits = controls.map((p, i) => {
        const dx = target[i].x - p.x, dy = target[i].y - p.y;
        const x = p.x - original[i].x, y = p.y - original[i].y;
        const a = dx * dx + dy * dy, b = 2 * (x * dx + y * dy), c = x * x + y * y - shiftLimits[i] * shiftLimits[i];
        return a < 1e-20 ? 1 : Math.max(0, Math.min(1, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a)));
      });
      const lower = limits.map((value, i) => {
        for (let j = -radius; j <= radius; j++) value = Math.min(value, limits[mod(i + j, count)]);
        return value;
      });
      const gains = lower.map((_value, i) => {
        let sum = 0;
        for (let j = 0; j < weights.length; j++) sum += weights[j] * lower[mod(i + j - radius, count)];
        // Each contributing minimum includes i. Positive averaging is thus
        // <= limits[i], and tapers the constraint instead of clipping each knot.
        return Math.min(limits[i], sum / total);
      });
      controls = controls.map((p, i) => ({ x: p.x + (target[i].x - p.x) * gains[i],
        y: p.y + (target[i].y - p.y) * gains[i], z: p.z }));
    }
    // Larger scales build on the already smoothed smaller-scale fit. A tight
    // hairpin therefore retains a smooth fallback, rather than the raw polygon.
    return controls;
  }

  function create(race, car) {
    const individual = Array.isArray(car?.pathPoints), owner = individual ? car : race;
    const points = individual ? car.pathPoints : race?.pathPoints, length = individual ? car.trackLength : race?.track?.length;
    if (!Array.isArray(points) || points.length < 3 || !Number.isFinite(length) || length <= 0) return null;
    const previous = cache.get(owner);
    if (previous?.source === points && previous.length === length && previous.hasElevation === !!race.track.hasElevation) return previous;
    const source = points.map(p => ({ x: p.x, y: p.y, z: Number.isFinite(p.z) ? p.z : 0 }));
    if (source.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
    const baseBound = deviationBound(source, source);
    // Subdivision leaves the source polyline exactly unchanged. It confines
    // the spline's corner rounding before the gentle, distance-based filter.
    // Height needs its own rounding budget: a planar hairpin may be gentle in
    // XY yet cross a sharp crest. Keep the complete C2 curve within 25 mm of
    // the original road height, below both renderers' vehicle-floor clearance.
    const subdivisions = Math.max(2, Math.ceil(baseBound.planar / .18), Math.ceil(baseBound.vertical / .012));
    const original = [];
    for (let i = 0; i < source.length; i++) {
      const a = source[i], b = source[(i + 1) % source.length];
      for (let j = 0; j < subdivisions; j++) {
        const t = j / subdivisions;
        original.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
      }
    }
    const count = original.length, spacing = length / count;
    const roundingBound = deviationBound(original, original);
    const shiftLimit = Math.max(0, Math.min(MAX_CONTROL_SHIFT_M, MAX_DEVIATION_M - roundingBound.planar - .01));
    const elevationShiftLimit = Math.max(0, Math.min(MAX_ELEVATION_CONTROL_SHIFT_M, MAX_ELEVATION_DEVIATION_M - roundingBound.vertical - .001));
    const radius = Math.min(Math.ceil(3 * SIGMA_M / spacing), Math.floor((count - 1) / 2));
    const weights = Array.from({ length: radius * 2 + 1 }, (_, j) => Math.exp(-.5 * ((j - radius) * spacing / SIGMA_M) ** 2));
    const total = weights.reduce((a, b) => a + b, 0);
    const controls = smoothPlanar(original, spacing, shiftLimit);
    controls.forEach((p, i) => {
      let z = 0;
      weights.forEach((w, j) => { z += w * original[mod(i + j - radius, count)].z; });
      z = z / total - original[i].z;
      p.z = original[i].z + Math.max(-elevationShiftLimit, Math.min(elevationShiftLimit, z));
    });
    const bound = deviationBound(controls, original);
    const result = { source: points, length, spacing, controls, hasElevation: !!race.track.hasElevation,
      info: Object.freeze({ method: 'periodic-c2-b-spline', planarMethod: 'progressive-local-cubic-fit',
        planarScalesM: Object.freeze(PLANAR_SCALES_M.slice()), constraintTransitionM: LIMIT_TRANSITION_M,
        smoothingSigmaM: SIGMA_M, subdivisions,
        maximumDeviationM: MAX_DEVIATION_M, deviationBoundM: bound.planar,
        maximumElevationDeviationM: MAX_ELEVATION_DEVIATION_M, elevationDeviationBoundM: bound.vertical }), drawnPath: null };
    cache.set(owner, result); return result;
  }

  function evaluate(curve, distance, withDerivatives = false) {
    const s = mod(distance, curve.length), u = s / curve.spacing, i = Math.floor(u), t = u - i, t2 = t * t, t3 = t2 * t;
    const weights = [(1 - t) ** 3 / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
    const first = [-.5 * (1 - t) ** 2, 1.5 * t2 - 2 * t, -1.5 * t2 + t + .5, .5 * t2];
    const second = [1 - t, 3 * t - 2, 1 - 3 * t, t];
    let x = 0, y = 0, z = 0, dx = 0, dy = 0, dz = 0, ddx = 0, ddy = 0, ddz = 0;
    for (let j = 0; j < 4; j++) {
      const p = curve.controls[mod(i + j - 1, curve.controls.length)];
      x += weights[j] * p.x; y += weights[j] * p.y; z += weights[j] * p.z;
      dx += first[j] * p.x; dy += first[j] * p.y; dz += first[j] * p.z;
      ddx += second[j] * p.x; ddy += second[j] * p.y; ddz += second[j] * p.z;
    }
    const planar = Math.hypot(dx, dy);
    const pose = { x, y, z, elevation: curve.hasElevation ? z : null, angle: Math.atan2(dy, dx),
      grade: curve.hasElevation && planar > 1e-9 ? dz / planar : 0,
      curvature: planar > 1e-9 ? (dx * ddy - dy * ddx) / (planar ** 3) : 0, s };
    if (withDerivatives) {
      pose.first = { x: dx / curve.spacing, y: dy / curve.spacing, z: dz / curve.spacing };
      pose.second = { x: ddx / curve.spacing ** 2, y: ddy / curve.spacing ** 2, z: ddz / curve.spacing ** 2 };
    }
    return pose;
  }

  function createStart(race, curve) {
    if (curve.start) return curve.start;
    const a = race.track.points?.[0], b = race.track.points?.[1];
    if (!a || !b) return null;
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(run > 1e-9)) return null;
    const position = { x: a.x, y: a.y, z: Number.isFinite(a.z) ? a.z : 0 };
    const first = { x: (b.x - a.x) / run, y: (b.y - a.y) / run,
      z: curve.hasElevation && Number.isFinite(b.z) ? (b.z - position.z) / run : 0 };
    const end = evaluate(curve, START_TRANSITION_M, true), coefficients = {};
    for (const key of ['x', 'y', 'z']) {
      const delta = end[key] - position[key], v0 = first[key] * START_TRANSITION_M;
      const v1 = end.first[key] * START_TRANSITION_M, a1 = end.second[key] * START_TRANSITION_M ** 2;
      // Quintic Hermite: exact starting position and road-forward tangent,
      // zero initial curvature, then exact position/first/second derivatives
      // of the ordinary racing line. It joins both ends with C2 continuity.
      coefficients[key] = [position[key], v0, 0, 10 * delta - 6 * v0 - 4 * v1 + .5 * a1,
        -15 * delta + 8 * v0 + 7 * v1 - a1, 6 * delta - 3 * v0 - 3 * v1 + .5 * a1];
    }
    curve.start = { position, first, coefficients, drawnPath: null };
    return curve.start;
  }

  function startBlend(car) {
    if (!Number.isFinite(car?.standingStartDistance) || !Number.isFinite(car?.distance)) return 1;
    const t = Math.max(0, Math.min(1, (car.distance - car.standingStartDistance) / START_TRANSITION_M));
    return t * t * t * (10 + t * (-15 + 6 * t));
  }

  function sampleCar(race, car, distance = car?.distance) {
    if (!Number.isFinite(distance)) throw new TypeError('distance must be finite.');
    // TrackRace explicitly uses 0 for a fresh starting grid and null for a
    // rolling generation. Unwrapped distance prevents a new launch each lap.
    const origin = car?.standingStartDistance;
    const curve = create(race, car);
    if (!curve) {
      const fallback = race?.sampleForCar?.(car, distance);
      return fallback ? { ...fallback, z: fallback.elevation ?? fallback.z ?? 0 } : sample(race, distance);
    }
    if (!Number.isFinite(origin) || distance - origin >= START_TRANSITION_M) return evaluate(curve, distance);
    const start = createStart(race, curve);
    if (!start) return evaluate(curve, distance);
    const travel = distance - origin, t = travel / START_TRANSITION_M, position = {}, first = {}, second = {};
    for (const key of ['x', 'y', 'z']) {
      if (travel <= 0) {
        // Camera/look-behind probes extend the launch tangent rather than
        // wrapping onto the racing line behind the timing line.
        position[key] = start.position[key] + travel * start.first[key];
        first[key] = start.first[key]; second[key] = 0;
      } else {
        const c = start.coefficients[key];
        position[key] = c[0] + t * (c[1] + t * (c[2] + t * (c[3] + t * (c[4] + t * c[5]))));
        first[key] = (c[1] + t * (2 * c[2] + t * (3 * c[3] + t * (4 * c[4] + t * 5 * c[5])))) / START_TRANSITION_M;
        second[key] = (2 * c[2] + t * (6 * c[3] + t * (12 * c[4] + t * 20 * c[5]))) / START_TRANSITION_M ** 2;
      }
    }
    const planar = Math.hypot(first.x, first.y);
    return { ...position, elevation: curve.hasElevation ? position.z : null, angle: Math.atan2(first.y, first.x),
      grade: curve.hasElevation && planar > 1e-9 ? first.z / planar : 0,
      curvature: travel > 0 && planar > 1e-9 ? (first.x * second.y - first.y * second.x) / planar ** 3 : 0,
      s: mod(distance, curve.length) };
  }

  function sample(race, distance) {
    if (!Number.isFinite(distance)) throw new TypeError('distance must be finite.');
    const curve = create(race);
    if (curve) return evaluate(curve, distance);
    const fallback = race?.sample?.(distance);
    return fallback ? { ...fallback, z: fallback.elevation ?? fallback.z ?? 0 } : null;
  }
  function path(race) {
    const curve = create(race);
    if (!curve) return race?.pathPoints || race?.track?.racingLine?.points || race?.track?.points || [];
    return curvePath(curve);
  }
  function curvePath(curve) {
    if (!curve.drawnPath) {
      const count = Math.max(curve.source.length, Math.ceil(curve.length / 2));
      curve.drawnPath = Object.freeze(Array.from({ length: count }, (_, i) => Object.freeze(evaluate(curve, curve.length * i / count))));
    }
    return curve.drawnPath;
  }
  function pathCar(race, car) {
    const curve = create(race, car);
    if (!curve) return car?.pathPoints || path(race);
    if (startBlend(car) >= 1) return curvePath(curve);
    const start = createStart(race, curve);
    if (!start) return curvePath(curve);
    // This first-lap trajectory is deliberately open: its starting centerline
    // point differs from the later flying-lap point at the same timing line.
    if (!start.drawnPath) {
      const count = Math.max(curve.source.length, Math.ceil(curve.length / 2));
      start.drawnPath = Object.freeze(Array.from({ length: count + 1 }, (_, i) =>
        Object.freeze(sampleCar(race, car, curve.length * i / count))));
    }
    return start.drawnPath;
  }
  const api = { sample, sampleCar, startBlend, path, pathCar, info: (race, car) => create(race, car)?.info || null };
  root.DrivingPose = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
