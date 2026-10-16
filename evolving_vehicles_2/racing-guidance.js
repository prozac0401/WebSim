/* Display-only driving advice derived from the watched vehicle's speed envelope,
 * tyre/brake/traction limits and road grade. This is a model, not measured ECU
 * pedal data or a real-world driving instruction. It never changes race physics. */
(function (root) {
  'use strict';
  const G = 9.81, PS_WATTS = 735.49875;
  const cache = new WeakMap();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mod = (v, n) => ((v % n) + n) % n;
  const smooth = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
  const COLORS = Object.freeze({ brake: Object.freeze([239, 68, 68]), coast: Object.freeze([250, 204, 21]), accelerate: Object.freeze([34, 197, 94]) });
  const MODEL = 'watched-vehicle-physics-advisory';
  const yellowGate = acceleration => smooth(0, .3, -acceleration);
  function colorFor(weights, acceleration) {
    const red = weights[0], yellow = weights[2] * yellowGate(acceleration), green = 1 - red - yellow;
    return COLORS.brake.map((v, c) => v * red + COLORS.accelerate[c] * green + COLORS.coast[c] * yellow);
  }
  const fillFor = color => 'rgba(' + color.map(v => Math.round(v)).join(',') + ',0.52)';

  // These are the same wheel-force limits and resistances used by _advance.
  // Using wheel force (not just negative acceleration) avoids calling uphill
  // full-throttle deceleration braking, or downhill coasting acceleration gas.
  function forces(race, car, speed, grade) {
    const normal = 1 / Math.hypot(1, grade), mass = car.massKg;
    const resistance = .5 * 1.225 * car.dragArea * speed * speed / mass + G * (car.rollingCoefficient * normal + grade * normal);
    const radius = (car.spec.factoryDrive === 'rwd' ? car.spec.rearTireRadiusMm : car.spec.frontTireRadiusMm) / 1000;
    const torque = car.torqueNm * car.driveReduction * car.efficiency / radius / mass;
    const power = car.powerPs * PS_WATTS * car.efficiency / Math.max(4, speed) / mass;
    const drive = Math.max(0, Math.min(torque, power, race._tractionAcceleration(car, speed, grade, resistance)));
    return { resistance, drive, brake: race._brakingCapacity(car, speed, grade), acceleration: drive - resistance };
  }

  function signature(race, car) {
    return [car.trackLength || race.track.length, race.surface, car.massKg, car.powerPs, car.torqueNm, car.driveReduction, car.efficiency,
      car.grip, car.traction, car.braking, car.brakingHardware, car.longitudinalGrip, car.dragArea, car.rollingCoefficient,
      car.downforceArea, car.frontWeightFraction, car.cgHeightM, car.wheelbaseM, car.trackWidthM, car.advancedDynamics,
      car.spec.factoryDrive, car.spec.frontTireRadiusMm, car.spec.rearTireRadiusMm].join('|');
  }

  function build(race, car) {
    const points = car.pathPoints || race.pathPoints, count = car.speedProfile.length, length = car.trackLength || race.track.length, spacing = length / count;
    const original = Array.from(car.speedProfile), speeds = original.slice(), release = new Array(count).fill(false);
    const grades = points.map(p => p.grade || 0), curvature = points.map(p => Math.abs(p.curvature || 0));
    // Find physical corner apexes: a local curvature maximum only qualifies
    // when the source speed profile actually reaches the vehicle's lateral cap.
    // A broad neighbourhood suppresses polygon-scale curvature ripples.
    const peakWindow = Math.max(1, Math.ceil(24 / spacing));
    const apexes = [];
    for (let i = 0; i < count; i++) {
      const lateral = original[i] * original[i] * curvature[i] / Math.max(.01, race._lateralCapacity(car, original[i], grades[i]));
      if (curvature[i] < .0015 || lateral < .88) continue;
      let peak = true;
      for (let k = -peakWindow; k <= peakWindow; k++) {
        if (!k) continue;
        const j = mod(i + k, count);
        if (curvature[j] > curvature[i] + 1e-9 || (Math.abs(curvature[j] - curvature[i]) <= 1e-9 && j < i)) { peak = false; break; }
      }
      if (peak) apexes.push(i);
    }
    for (const apex of apexes) {
      const range = Math.min(count - 1, Math.ceil(clamp(original[apex] * 3.2, 35, 115) / spacing));
      let next = speeds[apex];
      release[apex] = true;
      for (let k = 1; k <= range; k++) {
        const i = mod(apex - k, count);
        if (points[i].curvature * points[apex].curvature <= 0 || curvature[i] < curvature[apex] * .24) break;
        // v(next)^2 = v(entry)^2 - 2 * road/air resistance * ds.
        // On a descent this can require a lower entry speed; the subsequent
        // braking pass checks that entry is reachable before showing release.
        const resistance = forces(race, car, next, grades[i]).resistance;
        const coastLimit = Math.sqrt(Math.max(0, next * next + 2 * resistance * spacing));
        speeds[i] = Math.min(speeds[i], coastLimit);
        release[i] = true;
        next = speeds[i];
      }
    }
    // Bring the advisory coast target within brake and engine capabilities.
    // Cyclic sweeps propagate constraints across the start/finish line. Starting
    // at the slowest point also gives low-powered vehicles a realistic build-up
    // of speed instead of demanding fictional full-lap terminal speed.
    let start = 0;
    for (let i = 1; i < count; i++) if (speeds[i] < speeds[start]) start = i;
    for (let pass = 0; pass < 6; pass++) {
      let change = 0;
      for (let k = count - 1; k >= 0; k--) {
        const i = mod(start + k, count), j = (i + 1) % count;
        const f = forces(race, car, speeds[i], grades[i]);
        const cap = Math.sqrt(Math.max(0, speeds[j] * speeds[j] + 2 * (f.brake + f.resistance) * spacing));
        const next = Math.min(speeds[i], cap); change = Math.max(change, speeds[i] - next); speeds[i] = next;
      }
      for (let k = 0; k < count; k++) {
        const i = mod(start + k, count), j = (i + 1) % count;
        const f = forces(race, car, speeds[i], grades[i]);
        const cap = Math.sqrt(Math.max(0, speeds[i] * speeds[i] + 2 * f.acceleration * spacing));
        const next = Math.min(speeds[j], cap); change = Math.max(change, speeds[j] - next); speeds[j] = next;
      }
      if (change < .001) break;
    }
    const samples = speeds.map((speed, i) => {
      const f = forces(race, car, speed, grades[i]);
      const acceleration = (speeds[(i + 1) % count] ** 2 - speed ** 2) / (2 * spacing);
      const wheel = acceleration + f.resistance;
      const brake = clamp(-wheel / Math.max(.01, f.brake), 0, 1);
      const throttle = clamp(wheel / Math.max(.01, f.drive), 0, 1);
      const lateralLoad = speed * speed * curvature[i] / Math.max(.01, race._lateralCapacity(car, speed, grades[i]));
      const coastDemand = release[i] && throttle < .4 && brake < .4 ? 1 : 0;
      return { s: i * spacing, targetSpeed: speed, sourceTargetSpeed: original[i], acceleration, wheelAcceleration: wheel,
        throttle, brake, coastDemand, coast: 0, lateralLoad, grade: grades[i], lookaheadM: clamp(speed * 2, 40, 100), anticipationDemand: 0, anticipation: 0, nextBrakeM: null };
    });
    // The warning begins 40–100 m before a substantial braking demand. It
    // blends in over the first 15 m, then remains yellow up to brake onset.
    // Distance is measured around the closed lap, including the timing seam.
    const scan = Math.min(count - 1, Math.ceil(100 / spacing));
    for (let i = 0; i < count; i++) {
      const p = samples[i];
      for (let k = 0; k <= scan; k++) {
        if (samples[(i + k) % count].brake < .65) continue;
        p.nextBrakeM = k * spacing;
        if (p.brake < .65) p.anticipationDemand = smooth(0, 15, p.lookaheadM - p.nextBrakeM);
        break;
      }
      const red = smooth(.06, .9, p.brake);
      const green = (1 - red) * smooth(.15, .9, p.throttle) * (1 - p.coastDemand) * (1 - p.anticipationDemand);
      const yellow = 1 - red - green;
      p.colorWeights = [red, green, yellow];
    }
    // Spatial smoothing is periodic. Interpolation below remains continuous at
    // every knot and at s=0, without switching palette at a lap boundary.
    const weights = samples.map(p => p.colorWeights), radius = Math.max(1, Math.ceil(4 / spacing));
    for (let i = 0; i < count; i++) {
      const result = [0, 0, 0]; let total = 0;
      for (let k = -radius; k <= radius; k++) {
        const weight = Math.exp(-.5 * (k * spacing / 2) ** 2); total += weight;
        for (let c = 0; c < 3; c++) result[c] += weights[mod(i + k, count)][c] * weight;
      }
      samples[i].colorWeights = Object.freeze(result.map(v => v / total));
      samples[i].color = Object.freeze(colorFor(samples[i].colorWeights, samples[i].acceleration));
      samples[i].yellowWeight = samples[i].colorWeights[2] * yellowGate(samples[i].acceleration);
      samples[i].coast = samples[i].coastDemand * yellowGate(samples[i].acceleration);
      samples[i].anticipation = samples[i].anticipationDemand * yellowGate(samples[i].acceleration);
      Object.freeze(samples[i]);
    }
    return Object.freeze({ model: MODEL, length, spacing, samples: Object.freeze(samples), apexCount: apexes.length });
  }

  function profile(race, car) {
    if (!race || !car || !car.speedProfile?.length || !(car.pathPoints || race.pathPoints)?.length) return null;
    let cars = cache.get(race); if (!cars) { cars = new WeakMap(); cache.set(race, cars); }
    const key = signature(race, car), previous = cars.get(car);
    const points = car.pathPoints || race.pathPoints;
    if (previous?.source === car.speedProfile && previous.points === points && previous.key === key) return previous.result;
    const result = build(race, car); cars.set(car, { source: car.speedProfile, points, key, result }); return result;
  }

  function sampleProfile(data, distance) {
    if (!data) return null;
    const s = mod(Number.isFinite(distance) ? distance : 0, data.length), u = s / data.spacing;
    const i = Math.floor(u) % data.samples.length, t = smooth(0, 1, u - Math.floor(u));
    const a = data.samples[i], b = data.samples[(i + 1) % data.samples.length], mix = key => a[key] + (b[key] - a[key]) * t;
    // Reapply eligibility after interpolation: neighbouring yellow samples
    // must never tint a point whose own predicted speed is increasing.
    const acceleration = mix('acceleration'), gate = yellowGate(acceleration);
    const colorWeights = a.colorWeights.map((v, channel) => v + (b.colorWeights[channel] - v) * t), color = colorFor(colorWeights, acceleration);
    const brake = mix('brake'), throttle = mix('throttle'), coastDemand = mix('coastDemand'), anticipationDemand = mix('anticipationDemand');
    const coast = coastDemand * gate, anticipation = anticipationDemand * gate;
    return { model: MODEL, s, targetSpeed: mix('targetSpeed'), sourceTargetSpeed: mix('sourceTargetSpeed'),
      throttle, brake, coast, anticipation, coastDemand, anticipationDemand, acceleration, wheelAcceleration: mix('wheelAcceleration'),
      lateralLoad: mix('lateralLoad'), grade: mix('grade'), lookaheadM: mix('lookaheadM'), nextBrakeM: a.nextBrakeM,
      phase: brake >= .55 ? 'brake' : acceleration > 0 ? 'accelerate' : coast >= .5 ? 'coast' : anticipation >= .5 ? 'prepare-brake' : throttle >= .75 ? 'accelerate' : 'balance',
      color, yellowWeight: colorWeights[2] * gate, alpha: .52, fill: fillFor(color) };
  }

  function sample(race, car, distance) { return sampleProfile(profile(race, car), distance); }

  // Short live forecast from the watched car's actual state, using the engine's
  // own target rather than the advisory coast envelope. Nothing is written back
  // to the race. Absolute requested distances may be unsorted or duplicated.
  function preview(race, car, distances) {
    if (!Array.isArray(distances) || distances.length > 256) throw new RangeError('preview requires at most 256 distances.');
    if (!distances.length) return [];
    if (!Number.isFinite(car?.distance) || !Number.isFinite(car?.speed) || car.speed < 0) throw new RangeError('preview requires a finite current vehicle state.');
    const origin = car.distance;
    if (distances.some(s => !Number.isFinite(s) || s < origin - 1e-8 || s - origin > 500)) throw new RangeError('preview distances must be within 0–500 metres ahead of the car.');
    const data = profile(race, car); if (!data) return distances.map(() => null);
    const points = car.pathPoints || race.pathPoints, length = car.trackLength || race.track.length, spacing = length / car.speedProfile.length;
    const physical = distance => {
      const u = mod(distance, length) / spacing, i = Math.floor(u) % points.length, t = u - Math.floor(u), j = (i + 1) % points.length;
      return { grade: (points[i].grade || 0) + ((points[j].grade || 0) - (points[i].grade || 0)) * t,
        target: Math.sqrt(car.speedProfile[i] ** 2 + (car.speedProfile[j] ** 2 - car.speedProfile[i] ** 2) * t) };
    };
    const targetAt = distance => typeof race._target === 'function' ? race._target(car, distance) : physical(distance).target;
    let position = origin, speed = car.speed, acceleration = Number.isFinite(car.acceleration) ? car.acceleration : 0;
    let state = forces(race, car, speed, physical(position).grade), wheel = acceleration + state.resistance;
    const requests = distances.map((distance, index) => ({distance:Math.max(origin, distance),index})).sort((a,b) => a.distance - b.distance), result = new Array(distances.length);
    for (const request of requests) {
      while (position < request.distance - 1e-8) {
        const ds = Math.min(1, request.distance - position), nextPosition = position + ds;
        state = forces(race, car, speed, physical(position).grade);
        const target = targetAt(nextPosition);
        const lower = Math.max(0, speed * speed + 2 * (-state.brake - state.resistance) * ds);
        const upper = Math.max(0, speed * speed + 2 * state.acceleration * ds);
        const nextSquared = clamp(target * target, lower, upper);
        acceleration = (nextSquared - speed * speed) / (2 * ds); wheel = acceleration + state.resistance;
        speed = Math.sqrt(nextSquared); position = nextPosition;
      }
      if (request.distance > origin + 1e-8) {
        // The last metre's average acceleration can still be negative just
        // after a corner starts opening. Evaluate the engine's instantaneous
        // 120 Hz control at the arrow itself, using its predicted endpoint
        // speed and the same continuous target lookahead as _advance.
        state = forces(race, car, speed, physical(position).grade);
        const dt = 1 / 120, target = targetAt(position + Math.max(.1, speed * dt));
        acceleration = clamp((target - speed) / dt, -state.brake - state.resistance, state.acceleration);
        wheel = acceleration + state.resistance;
      }
      const base = sampleProfile(data, request.distance), brake = clamp(-wheel / Math.max(.01, state.brake), 0, 1), throttle = clamp(wheel / Math.max(.01, state.drive), 0, 1);
      const gate = yellowGate(acceleration), coastDemand = throttle < .4 && brake < .4 ? base.coastDemand : 0;
      const anticipationDemand = brake < .65 ? base.anticipationDemand : 0, coast = coastDemand * gate, anticipation = anticipationDemand * gate;
      const red = smooth(.06, .9, brake), green = (1-red) * smooth(.15,.9,throttle) * (1-coastDemand) * (1-anticipationDemand);
      const weights = [red,green,1-red-green], color = colorFor(weights,acceleration);
      result[request.index] = { ...base, basis:'actual-speed-force-preview', predictionDistanceM:request.distance-origin,
        targetSpeed:targetAt(request.distance), advisoryTargetSpeed:base.targetSpeed,
        forecastSpeed:speed, forecastAcceleration:acceleration, acceleration, wheelAcceleration:wheel, brake, throttle, coast, anticipation,
        coastDemand, anticipationDemand, yellowWeight:weights[2]*gate, color, fill:fillFor(color),
        phase:brake>=.55?'brake':acceleration>0?'accelerate':coast>=.5?'coast':anticipation>=.5?'prepare-brake':throttle>=.75?'accelerate':'balance' };
    }
    return result;
  }

  // Rendering policy, separate from the force forecast above. The user wants
  // six clearly yellow arrows at a red/green transition, including when the
  // transition touches the visible window edge. Positions remain road-fixed;
  // only this display band shifts inward when six arrows would be clipped.
  function displayPreview(race, car, distances) {
    if (!Array.isArray(distances) || distances.length > 240) throw new RangeError('display preview requires at most 240 ordered distances.');
    if (!distances.length) return [];
    const step = distances.length > 1 ? distances[1] - distances[0] : 7.5;
    if (!(step > 0) || distances.some((s, i) => !Number.isFinite(s) || i && Math.abs(s - distances[i - 1] - step) > 1e-6))
      throw new RangeError('display preview requires uniformly spaced, increasing distances.');
    const first = distances[0], last = distances.at(-1), origin = car.distance;
    // Extra future points confirm the far-edge phase before it enters view.
    // The current point is a safe rear guard; preview never samples behind it.
    const guards = Array.from({ length: 4 }, (_, i) => last + (i + 1) * step).filter(s => s - origin <= 500);
    const contextDistances = [origin, ...distances, ...guards];
    const context = preview(race, car, contextDistances), visible = context.slice(1, distances.length + 1);
    if (visible.some(p => !p)) return visible;
    const runs = [];
    context.forEach((p, i) => {
      const phase = p.brake >= .55 ? -1 : p.brake <= .2 && (p.throttle >= .5 || p.forecastAcceleration >= 0) ? 1 : 0;
      if (!phase) return; // A neutral/coasting interval joins its strong neighbours.
      let run = runs.at(-1);
      if (!run || run.phase !== phase) { run = { phase, first: contextDistances[i], last: contextDistances[i] }; runs.push(run); }
      run.last = contextDistances[i];
    });
    // A short but clearly red or green run is still a visible transition.
    // Dropping a one-arrow moderate brake would leave a red/green boundary
    // without the six yellow arrows requested by the display policy.
    const confirmed = runs;
    const boundaries = [];
    for (let i = 1; i < confirmed.length; i++) {
      const before = confirmed[i - 1], after = confirmed[i];
      if (before.phase === after.phase) continue;
      const distance = (before.last + after.first) / 2;
      // Both sides must actually be visible. A guard confirms an edge state,
      // but must not paint an otherwise all-green straight yellow merely
      // because a brake zone lies just outside this fifteen-arrow window.
      if (before.last < first - 1e-8 || after.first > last + 1e-8) continue;
      boundaries.push({ distance, direction: before.phase < 0 ? 'brake-to-accelerate' : 'accelerate-to-brake' });
    }
    const minimum = Math.min(6, distances.length), chooseStart = (boundary, protectedIndex = -1) => {
      const center = (boundary.distance - first) / step;
      let best = 0, error = Infinity;
      for (let start = 0; start <= distances.length - minimum; start++) {
        if (protectedIndex >= start && protectedIndex < start + minimum) continue;
        const nextError = Math.abs(start + (minimum - 1) / 2 - center);
        if (nextError < error - 1e-10) { best = start; error = nextError; }
      }
      return best;
    };
    let starts = boundaries.map(boundary => chooseStart(boundary)), protectedIndex = -1;
    const brakeCore = visible.map((p, i) => p.brake >= .85 ? i : -1).filter(i => i >= 0);
    // Never split a six-arrow band into two shorter pieces to save red. Move
    // whole bands around one strong-braking core instead. With fifteen arrows,
    // at least one side of any protected point has room for all six arrows.
    if (distances.length >= 13 && brakeCore.length && starts.length &&
      brakeCore.every(i => starts.some(start => i >= start - 1 && i <= start + minimum))) {
      protectedIndex = brakeCore[Math.floor((brakeCore.length - 1) / 2)];
      starts = boundaries.map(boundary => chooseStart(boundary, protectedIndex));
    }
    const bands = Object.freeze(boundaries.map((boundary, i) => Object.freeze({ boundaryM: boundary.distance,
      direction: boundary.direction, firstIndex: starts[i], lastIndex: starts[i] + minimum - 1,
      fromM: distances[starts[i]], toM: distances[starts[i] + minimum - 1], minimumArrows: minimum })));
    return visible.map((base, i) => {
      let weight = 0;
      if (i !== protectedIndex) for (const start of starts) {
        const gap = Math.max(start - i, i - (start + minimum - 1), 0);
        weight = Math.max(weight, 1 - smooth(0, 2, gap));
      }
      const color = base.color.map((v, channel) => v + (COLORS.coast[channel] - v) * weight);
      return { ...base, color, fill: fillFor(color), displayBasis: 'six-arrow-transition-band',
        displayPhase: weight >= .5 ? 'transition' : base.phase,
        displayYellowWeight: base.yellowWeight + (1 - base.yellowWeight) * weight,
        displayTransitionWeight: weight, displayTransitionBands: bands };
    });
  }

  const api = Object.freeze({ sample, profile, sampleProfile, preview, displayPreview, COLORS, MODEL });
  root.RacingGuidance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
