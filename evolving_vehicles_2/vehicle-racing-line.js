/* Vehicle-specific simulated racing lines. Bounded lateral/apex candidates are
 * ranked by a periodic acceleration/braking speed envelope using the same
 * vehicle force helpers as TrackRace. This is a deterministic approximation,
 * not a measured driver trace or a continuous optimal-control solution. */
(function (root) {
  'use strict';
  const cache = new WeakMap(), G = 9.81, PS_WATTS = 735.49875;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mod = (v, n) => ((v % n) + n) % n;
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const smooth = t => (t = clamp(t, 0, 1), t * t * t * (10 + t * (-15 + 6 * t)));
  const PHYSICAL_KEYS = ['powerPs', 'massKg', 'torqueNm', 'driveReduction', 'efficiency', 'grip', 'braking', 'brakingHardware',
    'longitudinalGrip', 'traction', 'dragArea', 'rollingCoefficient', 'downforceArea', 'topSpeedMps', 'trackWidthM',
    'cgHeightM', 'wheelbaseM', 'frontWeightFraction', 'advancedDynamics'];

  function resample(anchors, count, track) {
    const cumulative = [0];
    for (let i = 0; i < anchors.length; i++) cumulative.push(cumulative[i] + distance(anchors[i], anchors[(i + 1) % anchors.length]));
    const length = cumulative.at(-1), spacing = length / count;
    let segment = 0;
    const points = Array.from({ length: count }, (_, i) => {
      const s = i * spacing;
      while (segment + 1 < anchors.length && cumulative[segment + 1] < s) segment++;
      const a = anchors[segment], b = anchors[(segment + 1) % anchors.length];
      const t = (s - cumulative[segment]) / (cumulative[segment + 1] - cumulative[segment]);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
        centerS: a.centerS + ((b.centerS > a.centerS ? b.centerS : track.centerlineLength) - a.centerS) * t, s };
    });
    const span = clamp(Math.round(10 / spacing), 1, 5);
    points.forEach((p, i) => {
      const a = points[mod(i - span, count)], b = points[(i + span) % count];
      const product = distance(a, p) * distance(p, b) * distance(a, b);
      p.curvature = product > .0001 ? 2 * ((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / product : 0;
      p.grade = track.hasElevation ? (b.z - a.z) / (2 * span * spacing) : 0;
    });
    return { points, anchors, length, spacing };
  }

  function candidates(track) {
    const baseline = track.racingLine, center = track.points, count = center.length;
    const offsets = baseline.anchors.map(p => p.lateralOffsetM), normals = center.map((p, i) => {
      const a = center[mod(i - 1, count)], b = center[(i + 1) % count], run = Math.max(1e-9, distance(a, b));
      return { x: -(b.y - a.y) / run, y: (b.x - a.x) / run };
    });
    const variants = [{ ...baseline, id: 'shared-baseline', apexShiftM: 0, offsetScale: 1 }];
    // Scaling trades corner radius against travelled distance. Translating the
    // bounded offset profile changes apex timing and exit acceleration room.
    // Both choices are scored physically; no car id/colour/randomness is used.
    for (const [scale, shift] of [[.85, 0], [1.1, 0], [1.25, 0], [1.5, 0], [1, -3], [1, 3], [1.25, -3], [1.25, 3]]) {
      const anchors = center.map((p, i) => {
        const u = mod(i - shift / track.centerlineSpacing, count), index = Math.floor(u), f = u - index;
        const raw = offsets[index] + (offsets[(index + 1) % count] - offsets[index]) * f;
        // Smooth saturation respects the same road ribbon without introducing
        // flat clipped peaks or sharp derivative changes at its edge.
        const shifted = baseline.maxOffsetM * Math.tanh(Math.atanh(clamp(raw / baseline.maxOffsetM, -.999999, .999999)) * scale);
        // Every candidate has the same geometric timing-line neighbourhood.
        // This allows a flying generation to inherit the preceding car pose.
        const seamDistance = Math.min(p.s, track.centerlineLength - p.s), gain = smooth((seamDistance - 50) / 50);
        const offset = offsets[i] + (shifted - offsets[i]) * gain;
        return { x: p.x + normals[i].x * offset, y: p.y + normals[i].y * offset,
          z: p.z, centerS: p.s, lateralOffsetM: offset };
      });
      variants.push({ ...resample(anchors, count, track), id: 'scale-' + scale + '-apex-' + shift,
        apexShiftM: shift, offsetScale: scale });
    }
    return variants;
  }

  function envelope(race, car, line, terminalCache) {
    const points = line.points, count = points.length, spacing = line.spacing;
    const limits = points.map(p => {
      // Millimetres/metre grade bins only share the terminal-speed solve; all
      // traction and braking calculations below retain the actual road grade.
      const grade = Math.round(p.grade * 1000) / 1000;
      if (!terminalCache.has(grade)) terminalCache.set(grade, race._equilibriumSpeed(car, grade));
      const terminal = terminalCache.get(grade), k = Math.max(.000001, Math.abs(p.curvature));
      if (!car.downforceArea) return Math.min(terminal, Math.sqrt(race._lateralCapacity(car, 0, p.grade) / k));
      let low = 0, high = terminal;
      for (let i = 0; i < 14; i++) {
        const v = (low + high) / 2;
        if (v * v * k <= race._lateralCapacity(car, v, p.grade)) low = v; else high = v;
      }
      return (low + high) / 2;
    });
    const radius = (car.spec.factoryDrive === 'rwd' ? car.spec.rearTireRadiusMm : car.spec.frontTireRadiusMm) / 1000;
    const torqueForce = car.torqueNm * car.driveReduction * car.efficiency / radius;
    const power = car.powerPs * PS_WATTS * car.efficiency;
    // Repeated periodic forward/backward passes propagate both low-power exit
    // limitations and corner-entry braking across the timing line.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = count - 1; i >= 0; i--) {
        const next = (i + 1) % count, deceleration = Math.min(race._brakingDeceleration(car, points[i].grade, limits[i]),
          race._brakingDeceleration(car, points[next].grade, limits[next]));
        limits[i] = Math.min(limits[i], Math.sqrt(Math.max(0, limits[next] ** 2 + 2 * deceleration * spacing)));
      }
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count, v = limits[i], grade = points[i].grade, normal = 1 / Math.hypot(1, grade);
        const resistance = .5 * 1.225 * car.dragArea * v * v / car.massKg + G * normal * (car.rollingCoefficient + grade);
        const acceleration = Math.min(torqueForce / car.massKg, power / (car.massKg * Math.max(4, v)),
          race._tractionAcceleration(car, v, grade, resistance)) - resistance;
        limits[next] = Math.min(limits[next], Math.sqrt(Math.max(.01, v * v + 2 * acceleration * spacing)));
      }
    }
    return limits.reduce((time, v, i) => time + 2 * spacing / Math.max(.2, v + limits[(i + 1) % count]), 0);
  }

  function build(race, car) {
    if (!race?.track?.racingLine?.anchors?.length) return null;
    const track = race.track, key = track.points;
    let entry = cache.get(key);
    if (!entry) { entry = { candidates: candidates(track), cars: new Map() }; cache.set(key, entry); }
    const signature = JSON.stringify([...PHYSICAL_KEYS.map(key => car[key]), car.spec.factoryDrive,
      car.spec.frontTireRadiusMm, car.spec.rearTireRadiusMm]);
    if (entry.cars.has(signature)) return entry.cars.get(signature);
    const terminalCache = new Map(), scores = entry.candidates.map(line => ({ line, time: envelope(race, car, line, terminalCache) }));
    let selected = scores[0];
    for (const candidate of scores.slice(1)) if (candidate.time < selected.time - 1e-9) selected = candidate;
    const result = { ...selected.line, method: 'vehicle-force-envelope-candidate-search', measuredRecord: false,
      maxOffsetM: track.racingLine.maxOffsetM, edgeAllowanceM: track.racingLine.edgeAllowanceM,
      seamPreservationM: 50, seamTransitionM: 50, candidateCount: scores.length,
      performance: Object.freeze({ powerToWeightPsPerTonne: car.powerPs * 1000 / car.massKg, grip: car.grip,
        braking: car.braking, traction: car.traction, estimatedFlyingLapSeconds: selected.time,
        baselineFlyingLapSeconds: scores[0].time, selectedCandidate: selected.line.id }),
      candidateScores: Object.freeze(scores.map(s => Object.freeze({ id: s.line.id, estimatedFlyingLapSeconds: s.time }))) };
    if (entry.cars.size >= 256) entry.cars.delete(entry.cars.keys().next().value);
    entry.cars.set(signature, result);
    return result;
  }
  const api = { build };
  root.VehicleRacingLine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
