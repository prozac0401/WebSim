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
      const coast = release[i] && throttle < .4 && brake < .4 ? 1 : 0;
      return { s: i * spacing, targetSpeed: speed, sourceTargetSpeed: original[i], acceleration, wheelAcceleration: wheel,
        throttle, brake, coast, lateralLoad, grade: grades[i], lookaheadM: clamp(speed * 4, 100, 250), anticipation: 0, nextBrakeM: null };
    });
    // The warning begins 100–250 m before a substantial braking demand. It
    // blends in over the first 24 m, then remains yellow up to brake onset.
    // Distance is measured around the closed lap, including the timing seam.
    const scan = Math.min(count - 1, Math.ceil(250 / spacing));
    for (let i = 0; i < count; i++) {
      const p = samples[i];
      for (let k = 0; k <= scan; k++) {
        if (samples[(i + k) % count].brake < .65) continue;
        p.nextBrakeM = k * spacing;
        if (p.brake < .65) p.anticipation = smooth(0, 24, p.lookaheadM - p.nextBrakeM);
        break;
      }
      const red = smooth(.06, .9, p.brake);
      const green = (1 - red) * smooth(.15, .9, p.throttle) * (1 - p.coast) * (1 - p.anticipation);
      const yellow = 1 - red - green;
      p.color = COLORS.brake.map((v, channel) => v * red + COLORS.accelerate[channel] * green + COLORS.coast[channel] * yellow);
    }
    // Spatial smoothing is periodic. Interpolation below remains continuous at
    // every knot and at s=0, without switching palette at a lap boundary.
    const colors = samples.map(p => p.color), radius = Math.max(1, Math.ceil(4 / spacing));
    for (let i = 0; i < count; i++) {
      const result = [0, 0, 0]; let total = 0;
      for (let k = -radius; k <= radius; k++) {
        const weight = Math.exp(-.5 * (k * spacing / 2) ** 2); total += weight;
        for (let c = 0; c < 3; c++) result[c] += colors[mod(i + k, count)][c] * weight;
      }
      samples[i].color = Object.freeze(result.map(v => v / total));
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
    const color = a.color.map((v, channel) => v + (b.color[channel] - v) * t);
    const brake = mix('brake'), throttle = mix('throttle'), coast = mix('coast'), anticipation = mix('anticipation');
    return { model: MODEL, s, targetSpeed: mix('targetSpeed'), sourceTargetSpeed: mix('sourceTargetSpeed'),
      throttle, brake, coast, anticipation, acceleration: mix('acceleration'), wheelAcceleration: mix('wheelAcceleration'),
      lateralLoad: mix('lateralLoad'), grade: mix('grade'), lookaheadM: mix('lookaheadM'), nextBrakeM: a.nextBrakeM,
      phase: brake >= .55 ? 'brake' : coast >= .5 ? 'coast' : anticipation >= .5 ? 'prepare-brake' : throttle >= .75 ? 'accelerate' : 'balance',
      color, alpha: .52, fill: 'rgba(' + color.map(v => Math.round(v)).join(',') + ',0.52)' };
  }

  function sample(race, car, distance) { return sampleProfile(profile(race, car), distance); }

  const api = Object.freeze({ sample, profile, sampleProfile, COLORS, MODEL });
  root.RacingGuidance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
