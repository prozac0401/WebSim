/* Deterministic circuit time trial. Vehicles are independent ghosts.
 * Factory mass, PS and Nm come from shared specs plus circuit-only additions.
 * Drag area, grip, brakes, fallback reduction and efficiency are estimates.
 * Stepped ratios and estimated shift interruptions bound wheel torque. Fixed EV
 * reductions remain single speed; source status is recorded in the profiles.
 * Geographic elevations, when supplied, drive
 * road grade, gravity and normal load. No collisions, tyre wear or pits.
 * Entrants select a bounded vehicle-performance racing line. This is
 * not a measured professional driver's record trace. Legacy vehicleIds callers
 * retain centreline sampling unless racingLine:true is requested.
 * s is the planar distance along the selected path; the small 3D
 * arc-length correction and vertical-curve suspension loads are not simulated.
 */
(function (root) {
  'use strict';
  const SPECS = root.CircuitVehicleSpecs || (typeof require === 'function' ? require('./circuit-vehicle-specs.js') : root.VehicleSpecs);
  const SPA_PROFILE = root.SpaElevationProfile || (typeof require === 'function' ? require('./spa-elevation-profile.js') : null);
  const TAEBAEK_PROFILE = root.TaebaekElevationProfile || (typeof require === 'function' ? require('./taebaek-elevation-profile.js') : null);
  const TELEMETRY = root.PowertrainTelemetry || (typeof require === 'function' ? require('./powertrain-telemetry.js') : null);
  const POWERTRAIN = root.PowertrainProfiles || (typeof require === 'function' ? require('./powertrain-profiles.js') : null);
  const TRANSMISSION = root.PowertrainDynamics || (typeof require === 'function' ? require('./powertrain-dynamics.js') : null);
  const NGS = root.NGrinShift || (typeof require === 'function' ? require('./n-grin-shift.js') : null);
  const BRAKE_LIGHTS = root.BrakeLightState || (typeof require === 'function' ? require('./brake-light-state.js') : null);
  const VEHICLE_LINE = root.VehicleRacingLine || (typeof require === 'function' ? require('./vehicle-racing-line.js') : null);
  if (!SPECS) throw new Error('Load vehicle-specs.js before race-engine.js.');
  const G = 9.81, FIXED_DT = 1 / 120, PS_WATTS = 735.49875;
  const CATALOG = [
    ['ray', '기아 레이', '#fbbf24', .91, .76, .82],
    ['avante', '현대 아반떼', '#f97373', .64, .92, .94],
    ['staria', '현대 스타리아', '#a78bfa', 1.12, .76, .85],
    ['musso_ev', 'KGM 무쏘 EV', '#84cc16', 1.02, .80, .88],
    ['ioniq5', '현대 아이오닉 5', '#22d3ee', .76, .93, .95],
    ['santafe', '현대 싼타페', '#f59e0b', .96, .85, .91],
    ['morning', '기아 모닝', '#fb7185', .69, .85, .88],
    ['k5', '기아 K5', '#38bdf8', .66, .94, .96],
    ['grandeur', '현대 그랜저', '#d8b4fe', .70, .92, .95],
    ['carnival', '기아 카니발', '#facc15', 1.04, .79, .86],
    ['g80', '제네시스 G80', '#4ade80', .72, .98, 1.00],
    ['torres', 'KGM 토레스', '#2dd4bf', .97, .83, .89],
    ['porter2', '현대 포터 II', '#cbd5e1', 1.14, .68, .76],
    ['g70', '제네시스 G70 (전기형)', '#f43f5e', .66, 1.00, 1.05],
    ['supra', '토요타 GR 수프라 A90', '#e2e8f0', .62, 1.04, 1.12],
    ['bmw_m2', 'BMW M2 F87', '#38bdf8', .7735, 1.04, 1.12],
    ['avante_n', '현대 아반떼 N (CN7)', '#a9d6e8', .68, 1.04, 1.10],
    ['gr86', '토요타 GR86 ZN8', '#ef4444', .56, 1.00, 1.08]
  ];
  const VEHICLES = Object.freeze(CATALOG.map(([id, name, color, dragArea, gripG, brakeG]) => {
    const spec = SPECS[id];
    if (!spec) throw new Error('Missing shared vehicle specification: ' + id);
    return Object.freeze({ ...spec, id, name, label: name, color, massKg: spec.curbMassKg,
      dragArea, gripG, brakeG, electric: id === 'ioniq5' || id === 'musso_ev' });
  }));
  const BY_ID = Object.fromEntries(VEHICLES.map(v => [v.id, v]));
  const TRACK_CACHE = new WeakMap();
  const mod = (x, n) => ((x % n) + n) % n;
  const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
  const hypot = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function resampleClosed(points, count, centerlineLength) {
    const cumulative = [0];
    for (let i = 0; i < points.length; i++) cumulative.push(cumulative[i] + hypot(points[i], points[(i + 1) % points.length]));
    const length = cumulative[cumulative.length - 1];
    if (!Number.isFinite(length) || length < 20) throw new RangeError('Circuit geometry must describe a closed track of at least 20 metres.');
    let segment = 0;
    const sampled = Array.from({ length: count }, (_, i) => {
      const s = length * i / count;
      while (segment + 1 < points.length && cumulative[segment + 1] < s) segment++;
      const a = points[segment], b = points[(segment + 1) % points.length];
      const t = (s - cumulative[segment]) / (cumulative[segment + 1] - cumulative[segment]);
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      if (centerlineLength) p.centerS = a.centerS + ((b.centerS > a.centerS ? b.centerS : centerlineLength) - a.centerS) * t;
      return p;
    });
    return { points: sampled, length };
  }

  function optimizeRacingLine(center, centerlineLength, width, hasElevation) {
    const count = center.length, spacing = centerlineLength / count;
    // Keep a 1.25 m body/edge allowance inside the estimated road ribbon.
    // Every anchor moves only on its centreline normal, never to another leg
    // of a hairpin or across a figure-eight intersection.
    const maxOffsetM = Math.max(.25, width * .5 - 1.25);
    const normals = center.map((p, i) => {
      const a = center[mod(i - 1, count)], b = center[(i + 1) % count], norm = Math.max(1e-9, hypot(a, b));
      return { x: -(b.y - a.y) / norm, y: (b.x - a.x) / norm };
    });
    const offsets = new Float64Array(count), gradient = new Float64Array(count);
    const xs = new Float64Array(count), ys = new Float64Array(count);
    const span = Math.max(1, Math.round(14 / spacing));
    // Projected minimization of squared second differences (a discrete
    // curvature/fairness energy), with a small centre preference. Removing
    // common-mode normal drift prevents an arbitrary inward-shrunk circle.
    // 180 O(n) steps, no closest-point/all-pairs searches in the live loop.
    for (let iteration = 0; iteration < 180; iteration++) {
      for (let i = 0; i < count; i++) {
        xs[i] = center[i].x + normals[i].x * offsets[i];
        ys[i] = center[i].y + normals[i].y * offsets[i];
      }
      let mean = 0;
      for (let i = 0; i < count; i++) {
        const a = mod(i - span, count), b = (i + span) % count, aa = mod(i - 2 * span, count), bb = (i + 2 * span) % count;
        const dx = 6 * xs[i] - 4 * (xs[a] + xs[b]) + xs[aa] + xs[bb];
        const dy = 6 * ys[i] - 4 * (ys[a] + ys[b]) + ys[aa] + ys[bb];
        gradient[i] = dx * normals[i].x + dy * normals[i].y;
        mean += gradient[i] / count;
      }
      for (let i = 0; i < count; i++) offsets[i] = clamp(offsets[i] - .045 * (gradient[i] - mean + .006 * offsets[i]), -maxOffsetM, maxOffsetM);
    }
    // Suppress stencil-scale alternating offsets while keeping every anchor
    // inside its allowed ribbon. The periodic pass includes the timing line.
    for (let pass = 0; pass < 8; pass++) {
      const copy = offsets.slice();
      for (let i = 0; i < count; i++) offsets[i] = .5 * copy[i] + .25 * (copy[mod(i - 1, count)] + copy[(i + 1) % count]);
    }
    const anchors = center.map((p, i) => ({ x: p.x + normals[i].x * offsets[i], y: p.y + normals[i].y * offsets[i],
      z: p.z, centerS: p.s, lateralOffsetM: offsets[i] }));
    const resampled = resampleClosed(anchors, count, centerlineLength);
    const lineSpacing = resampled.length / count, curvatureSpan = clamp(Math.round(10 / lineSpacing), 1, 5);
    resampled.points.forEach((p, i, points) => {
      const a = points[mod(i - curvatureSpan, count)], b = points[(i + curvatureSpan) % count];
      const ab = hypot(a, p), bc = hypot(p, b), ac = hypot(a, b);
      const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
      p.s = lineSpacing * i;
      p.curvature = ab * bc * ac > .0001 ? 2 * cross / (ab * bc * ac) : 0;
      p.grade = hasElevation ? (b.z - a.z) / (2 * curvatureSpan * lineSpacing) : 0;
    });
    return { points: resampled.points, anchors, length: resampled.length, spacing: lineSpacing,
      method: 'bounded-curvature-minimization', measuredRecord: false, maxOffsetM, edgeAllowanceM: 1.25 };
  }

  function buildTrack(circuit) {
    if (!circuit || !Array.isArray(circuit.coordinates) || circuit.coordinates.length < 3 || circuit.coordinates.length > 100000)
      throw new TypeError('A circuit needs 3–100000 [longitude, latitude] coordinates.');
    for (const c of circuit.coordinates) {
      if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) >= 89)
        throw new TypeError('Circuit coordinates must be finite longitude/latitude pairs.');
    }
    if (circuit.lengthM !== undefined && (!Number.isFinite(circuit.lengthM) || circuit.lengthM < 100 || circuit.lengthM > 100000))
      throw new RangeError('Circuit lengthM must be between 100 and 100000 metres.');
    const hasElevation = circuit.elevations !== undefined && circuit.elevations !== null;
    if (hasElevation && (!Array.isArray(circuit.elevations) || circuit.elevations.length !== circuit.coordinates.length || circuit.elevations.some(z => !Number.isFinite(z))))
      throw new TypeError('Circuit elevations must be finite metres AMSL, one per coordinate.');
    const coords = circuit.coordinates, origin = coords[0];
    const latitude = coords.reduce((sum, c) => sum + c[1], 0) / coords.length * Math.PI / 180;
    const metresPerDegree = Math.PI * 6371008.8 / 180;
    let projected = [];
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i];
      const p = { x: (c[0] - origin[0]) * metresPerDegree * Math.cos(latitude), y: -(c[1] - origin[1]) * metresPerDegree, z: hasElevation ? circuit.elevations[i] : 0 };
      if (!projected.length || hypot(p, projected[projected.length - 1]) > .05) projected.push(p);
    }
    if (projected.length > 1 && hypot(projected[0], projected[projected.length - 1]) < .05) {
      if (hasElevation && Math.abs(projected[0].z - projected[projected.length - 1].z) > .05)
        throw new RangeError('Closed circuit elevations must agree at the repeated first/last coordinate.');
      projected.pop();
    }
    if (projected.length < 3) throw new RangeError('Circuit has fewer than three distinct points.');
    const rawLength = projected.reduce((sum, p, i) => sum + hypot(p, projected[(i + 1) % projected.length]), 0);
    const length = circuit.lengthM || rawLength;
    const count = clamp(Math.ceil(length / 4), 128, 8192);
    // Smooth only a short local window; preserve the imported route and start.
    projected = resampleClosed(projected, count).points;
    const spacingBeforeScale = rawLength / count;
    const radius = clamp(Math.round(5 / spacingBeforeScale), 1, 3);
    const smooth = projected.map((p, i) => {
      let x = 2 * p.x, y = 2 * p.y, z = 2 * p.z, weight = 2;
      for (let k = 1; k <= radius; k++) {
        const w = 1 / k, a = projected[mod(i - k, count)], b = projected[(i + k) % count];
        x += (a.x + b.x) * w; y += (a.y + b.y) * w; z += (a.z + b.z) * w; weight += 2 * w;
      }
      return { x: x / weight, y: y / weight, z: z / weight };
    });
    const sampled = resampleClosed(smooth, count), scale = length / sampled.length;
    const offset = sampled.points[0];
    // Elevation remains metres AMSL: do not subtract the start height or apply
    // the horizontal length scale to z. All resampling weights also carry z.
    const points = sampled.points.map((p, i) => ({ x: (p.x - offset.x) * scale, y: (p.y - offset.y) * scale, z: p.z, s: length * i / count, curvature: 0, grade: 0 }));
    const spacing = length / count, span = clamp(Math.round(10 / spacing), 1, 5);
    // Coarse DSM cells must not become near-vertical road steps. Filter height
    // along *distance*, independently of planar geometry. One DEM cell is the
    // Gaussian sigma; +/-3 sigma is used, periodically across the start line.
    // Preserve API elevations on circuit.elevations and pre-filter point.rawZ.
    const elevationSmoothingSigmaM = hasElevation && Number.isFinite(circuit.elevationResolutionM) && circuit.elevationResolutionM >= 30 ? circuit.elevationResolutionM : 0;
    if (elevationSmoothingSigmaM) {
      const rawZ = points.map(p => p.z), radius = Math.min(Math.ceil(3 * elevationSmoothingSigmaM / spacing), Math.floor((count - 1) / 2));
      const weights = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-.5 * ((i - radius) * spacing / elevationSmoothingSigmaM) ** 2));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      points.forEach((p, i) => {
        p.rawZ = p.z;
        p.z = weights.reduce((sum, w, j) => sum + rawZ[mod(i + j - radius, count)] * w, 0) / totalWeight;
      });
    }
    // Regrade Taebaek's first hill for the whole simulation, before deriving
    // either racing line. Road, terrain, vehicle poses and gravity share z.
    const elevationRefinement = hasElevation ? TAEBAEK_PROFILE?.apply(circuit, points, spacing) : null;
    // The official Spa plan supplies published altitude markers along
    // the correctly aligned 7004 m route. Retain the DEM and original API data;
    // only this track's simulated z is replaced by the bounded interpolation.
    const elevationProfile = hasElevation ? SPA_PROFILE?.forCircuit(circuit) : null;
    if (elevationProfile) for (const p of points) {
      p.demZ = p.z;
      p.z = elevationProfile.sample(p.s).elevation;
    }
    points.forEach((p, i) => {
      const a = points[mod(i - span, count)], b = points[(i + span) % count];
      const ab = hypot(a, p), bc = hypot(p, b), ac = hypot(a, b);
      const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
      p.curvature = ab * bc * ac > .0001 ? 2 * cross / (ab * bc * ac) : 0;
      // A centred ~20m run suppresses DEM/grid quantization without shifting
      // hills relative to corners. Coarse data additionally uses the resolution
      // filter above. The periodic window is continuous at s=0.
      p.grade = hasElevation ? (b.z - a.z) / (2 * span * spacing) : 0;
    });
    let elevationMin = Infinity, elevationMax = -Infinity, elevationGainM = 0, elevationLossM = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], rise = points[(i + 1) % points.length].z - p.z;
      elevationMin = Math.min(elevationMin, p.z); elevationMax = Math.max(elevationMax, p.z);
      elevationGainM += Math.max(0, rise); elevationLossM += Math.max(0, -rise);
    }
    const bounds = points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    bounds.width = bounds.maxX - bounds.minX; bounds.height = bounds.maxY - bounds.minY;
    if (bounds.width * bounds.height < 1) throw new RangeError('Circuit geometry must enclose a two-dimensional route.');
    const width = Number.isFinite(circuit.widthM) ? clamp(circuit.widthM, 6, 30) : 14;
    const racingLine = optimizeRacingLine(points, length, width, hasElevation);
    return { points, length, spacing, width, racingLine, centerlineLength: length, centerlineSpacing: spacing,
      bounds, rawLength, scale, id: circuit.id, name: circuit.name, hasElevation,
      projection: { origin: origin.slice(0, 2), latitudeRad: latitude, metresPerDegree, offset: { x: offset.x, y: offset.y }, scale },
      elevationMin: hasElevation ? elevationMin : null, elevationMax: hasElevation ? elevationMax : null,
      elevationGainM: hasElevation ? elevationGainM : null, elevationLossM: hasElevation ? elevationLossM : null,
      elevationSmoothingSigmaM: elevationProfile ? 0 : elevationSmoothingSigmaM,
      elevationSmoothingMethod: elevationProfile ? elevationProfile.metadata.method : elevationSmoothingSigmaM ? 'periodic-gaussian' : 'local-geometric',
      elevationProfile: elevationProfile ? elevationProfile.metadata : null,
      ...(elevationRefinement ? { elevationRefinement } : {}),
      elevationSource: elevationProfile ? elevationProfile.metadata.source : hasElevation ? circuit.elevationSource || null : null,
      elevationResolutionM: elevationProfile ? null : hasElevation ? circuit.elevationResolutionM || null : null };
  }

  class TrackRace {
    constructor(options = {}) {
      this.circuit = options.circuit;
      let geometry = this.circuit && TRACK_CACHE.get(this.circuit);
      if (!geometry) {
        geometry = buildTrack(this.circuit);
        TRACK_CACHE.set(this.circuit, geometry);
      }
      this.usesRacingLine = options.racingLine === undefined ? options.entrants !== undefined : !!options.racingLine;
      this.track = { ...geometry, length: this.usesRacingLine ? geometry.racingLine.length : geometry.centerlineLength,
        spacing: this.usesRacingLine ? geometry.racingLine.spacing : geometry.centerlineSpacing };
      this.pathPoints = this.usesRacingLine ? this.track.racingLine.points : this.track.points;
      this.laps = options.laps === undefined ? 3 : options.laps;
      if (!Number.isInteger(this.laps) || this.laps < 1 || this.laps > 100) throw new RangeError('laps must be an integer from 1 to 100.');
      this.surface = options.surface === undefined ? 'dry' : options.surface;
      if (!['dry', 'wet'].includes(this.surface)) throw new RangeError('surface must be dry or wet.');
      this.tuning = options.tuning === undefined ? 1 : options.tuning;
      if (![1, 1.3, 1.6].includes(this.tuning)) throw new RangeError('tuning must be 1, 1.3 or 1.6.');
      const entries = options.entrants;
      if (entries !== undefined && (!Array.isArray(entries) || !entries.length || entries.length > 64 ||
        entries.some(e => !e || !Object.hasOwn(BY_ID, e.vehicleId) || !e.spec || typeof e.spec !== 'object') ||
        new Set(entries.map(e => e.vehicleId)).size !== 1))
        throw new RangeError('entrants must contain 1–64 cars of one known vehicle model, each with an effective spec.');
      if (entries && new Set(entries.map((e, i) => e.uid || 'entrant-' + i)).size !== entries.length)
        throw new RangeError('entrant uid values must be unique.');
      const ids = entries ? entries.map(e => e.vehicleId) : options.vehicleIds === undefined ? ['k5', 'avante', 'ioniq5', 'g80'] : options.vehicleIds;
      if (!entries && (!Array.isArray(ids) || !ids.length || ids.length > VEHICLES.length || new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(BY_ID, id))))
        throw new RangeError('vehicleIds must contain 1–' + VEHICLES.length + ' unique, known vehicle IDs.');
      this.time = 0; this.finished = false; this._ticks = 0; this._accumulator = 0;
      const initialSpeed = options.initialSpeed ?? 0;
      if (!Number.isFinite(initialSpeed) || initialSpeed < 0 || initialSpeed > 200) throw new RangeError('initialSpeed must be between 0 and 200 m/s.');
      this.totalDistance = this.track.length * this.laps;
      const gripFactor = this.surface === 'wet' ? .62 : 1;
      this.cars = ids.map((vehicleId, id) => {
        const base = BY_ID[vehicleId], entrant = entries ? entries[id] : null;
        const spec = entrant ? { ...base, ...entrant.spec,
          massKg: entrant.spec.massKg ?? entrant.spec.curbMassKg ?? base.massKg } : base;
        if (entrant) {
          for (const key of ['massKg', 'powerPs', 'torqueNm', 'dragArea', 'gripG', 'brakeG', 'frontTireRadiusMm', 'rearTireRadiusMm'])
            if (!Number.isFinite(spec[key]) || spec[key] <= 0) throw new RangeError('entrant spec.' + key + ' must be finite and positive.');
          if (!['fwd', 'rwd', 'awd'].includes(spec.factoryDrive)) throw new RangeError('entrant spec.factoryDrive must be fwd, rwd or awd.');
          for (const key of ['frontWeightFraction', 'weightFront', 'cgHeightM', 'wheelbaseMm', 'wheelbaseM', 'trackWidthM', 'downforceArea', 'topSpeedMps', 'reduction'])
            if (spec[key] !== undefined && (!Number.isFinite(spec[key]) || spec[key] < 0)) throw new RangeError('entrant spec.' + key + ' must be finite and nonnegative.');
        }
        const efficiency = spec.efficiency || (spec.electric ? .91 : spec.factoryDrive === 'awd' && entrant ? .80 : .83);
        const frontWeightFraction = clamp(spec.frontWeightFraction ?? spec.weightFront ?? (spec.factoryDrive === 'fwd' ? .60 : .52), .25, .75);
        const cgHeightM = clamp(spec.cgHeightM ?? spec.heightMm * .00034, .25, 1.3);
        const wheelbaseM = clamp(spec.wheelbaseM ?? spec.wheelbaseMm / 1000, 1.5, 5.5);
        const loadSensitivity = entrant ? (base.massKg / spec.massKg) ** .07 : 1;
        const balanceFactor = entrant ? 1 - 1.05 * Math.abs(frontWeightFraction - .5) : 1;
        const rollFactor = entrant ? clamp(1 - .12 * (cgHeightM / .55 - 1), .82, 1.08) : 1;
        const brakeBalanceFactor = entrant ? clamp(1 - .08 * Math.abs(frontWeightFraction - .55) - .08 * Math.max(0, cgHeightM / .55 - 1), .85, 1) : 1;
        const longitudinalGrip = spec.gripG * G * gripFactor * loadSensitivity;
        const brakingHardware = spec.brakeG * G * gripFactor * loadSensitivity * brakeBalanceFactor;
        const car = { id, index: id, uid: entrant ? entrant.uid || 'entrant-' + id : vehicleId, entrant,
          advancedDynamics: !!entrant, vehicleId, name: entrant && entrant.name || spec.name, color: entrant && entrant.color || spec.color, spec,
          powerPs: spec.powerPs * (entrant ? 1 : this.tuning), massKg: spec.massKg, torqueNm: spec.torqueNm * (entrant ? 1 : this.tuning),
          speed: initialSpeed, distance: 0, lap: 0, currentLap: 1, lapTimes: [], bestLap: null,
          standingStartDistance: initialSpeed > 0 ? null : 0, finishSpeed: null, finishRemainderSeconds: 0,
          finished: false, finishTime: null, dnf: false, retiredAt: null, dnfReason: null, stalledFor: 0,
          targetSpeed: 0, phase: 'accelerating', acceleration: 0, serviceBrakeForceN: 0, brakeDemand: 0,
          maxSpeed: 0, lastLapAt: 0, elevation: this.track.hasElevation ? this.pathPoints[0].z : null, grade: this.pathPoints[0].grade,
          slopeAcceleration: 0, grip: spec.gripG * G * gripFactor * loadSensitivity * balanceFactor * rollFactor,
          braking: entrant ? Math.min(brakingHardware, longitudinalGrip) : brakingHardware,
          brakingHardware, longitudinalGrip, efficiency, dragArea: spec.dragArea,
          rollingCoefficient: this.surface === 'wet' ? .018 : .014,
          traction: spec.gripG * G * gripFactor * (spec.factoryDrive === 'rwd' ? .54 : .57),
          reduction: spec.reduction ?? (spec.electric ? 9 : 13.5), frontWeightFraction, cgHeightM, wheelbaseM,
          trackWidthM: clamp(spec.trackWidthM ?? 1.6, 1, 2.7),
          downforceArea: entrant ? clamp(spec.downforceArea ?? 0, 0, 8) : 0,
          topSpeedMps: entrant ? clamp(spec.topSpeedMps ?? 120, 10, 140) : 120,
          frontNormalLoad: frontWeightFraction * spec.massKg * G,
          rearNormalLoad: (1 - frontWeightFraction) * spec.massKg * G };
        // Preserve the tuning-relative scalar. The physical stepped gearbox
        // resolves each gear independently; EV/continuous fallbacks use this
        // sourced fixed/first reduction envelope.
        car.driveReduction = car.reduction;
        const transmission = entrant && POWERTRAIN?.resolve(car);
        const firstFinalDrive = transmission?.finalDriveRatios?.[0] ?? transmission?.finalDriveRatio;
        const firstReduction = transmission?.gearRatios?.[0] > 0 && firstFinalDrive > 0
          ? transmission.gearRatios[0] * firstFinalDrive : null;
        const electricReduction = transmission?.powertrainType === 'electric' && transmission.singleSpeedReduction > 0
          && ['reference-market', 'verified-exact-market'].includes(transmission.reductionStatus) ? transmission.singleSpeedReduction : null;
        const sourcedReduction = firstReduction ?? electricReduction;
        if (sourcedReduction > 0) {
          const factoryReduction = entrant.factorySpec?.reduction ?? entrant.spec.reduction;
          const tuningScale = factoryReduction > 0 ? car.reduction / factoryReduction : 1;
          car.driveReduction = sourcedReduction * tuningScale;
          car.driveReductionSource = firstReduction ? transmission.ratioStatus : transmission.reductionStatus;
        }
        if (TRANSMISSION) car.transmission = TRANSMISSION.create(car);
        if (BRAKE_LIGHTS) car.brakeLightState = BRAKE_LIGHTS.create();
        const line = this.usesRacingLine && VEHICLE_LINE ? VEHICLE_LINE.build(this, car) : null;
        car.racingLine = line;
        car.pathPoints = line?.points || this.pathPoints;
        car.trackLength = line?.length || this.track.length;
        car.pathSpacing = line?.spacing || this.track.spacing;
        car.totalDistance = car.trackLength * this.laps;
        if (NGS) car.ngs = NGS.create(car, this.track);
        // The controller permits the boosted terminal envelope so it does not
        // brake merely because NGS ends. Actual propulsion is still bounded by
        // stock power whenever the per-car boost state is inactive.
        car.speedProfile = this._makeSpeedProfile(car, car.ngs?.supported ? NGS.MODEL.powerMultiplier : 1);
        car.activePowerPs = car.powerPs;
        car.targetSpeed = car.speedProfile[0];
        if (TELEMETRY) car.telemetry = TELEMETRY.create(car);
        return car;
      });
    }

    sample(distance) {
      return this.sampleForCar(null, distance);
    }

    sampleForCar(car, distance) {
      if (!Number.isFinite(distance)) throw new TypeError('distance must be finite.');
      const length = car?.trackLength || this.track.length, spacing = car?.pathSpacing || this.track.spacing;
      const points = car?.pathPoints || this.pathPoints, position = mod(distance, length) / spacing;
      const i = Math.floor(position) % points.length, t = position - Math.floor(position), a = points[i], b = points[(i + 1) % points.length];
      const centerLength = this.track.centerlineLength, centerA = a.centerS ?? a.s ?? i * this.track.centerlineSpacing;
      const centerB = b.centerS ?? b.s ?? ((i + 1) % points.length) * this.track.centerlineSpacing;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x), curvature: a.curvature + (b.curvature - a.curvature) * t,
        elevation: this.track.hasElevation ? a.z + (b.z - a.z) * t : null,
        grade: a.grade + (b.grade - a.grade) * t, s: mod(distance, length),
        centerS: mod(centerA + mod(centerB - centerA, centerLength) * t, centerLength) };
    }

    _equilibriumSpeed(car, grade, powerMultiplier = 1) {
      // Grade-dependent power equilibrium: gravity can assist downhill motion.
      const power = car.powerPs * powerMultiplier * PS_WATTS * car.efficiency;
      const normal = 1 / Math.hypot(1, grade), sine = grade * normal;
      const constantResistance = car.massKg * G * (car.rollingCoefficient * normal + sine);
      let low = 0, high = 120;
      for (let i = 0; i < 40; i++) {
        const v = (low + high) / 2;
        const resistance = .5 * 1.225 * car.dragArea * v * v + constantResistance;
        const predicted = TRANSMISSION?.preview(car, v);
        const radius = predicted?.effectiveRadiusM || (car.spec.factoryDrive === 'rwd' ? car.spec.rearTireRadiusMm : car.spec.frontTireRadiusMm) / 1000;
        const torqueForce = car.torqueNm * (predicted?.totalRatio ?? car.driveReduction) * car.efficiency / radius;
        const force = Math.min(torqueForce, power / Math.max(4, v)) * (predicted?.torqueFactor ?? 1);
        if (resistance < force) low = v; else high = v;
      }
      return Math.min((low + high) / 2, car.topSpeedMps);
    }

    _aeroLoadAcceleration(car, speed) {
      return .5 * 1.225 * car.downforceArea * speed * speed / car.massKg;
    }

    _lateralCapacity(car, speed, grade = 0) {
      const normal = 1 / Math.hypot(1, grade), aero = this._aeroLoadAcceleration(car, speed);
      const tyreLimit = car.grip * (normal + aero / G);
      // Tall, narrow vehicles cannot acquire unlimited cornering by adding
      // tyre grip; lateral load transfer can unload an inside wheel pair.
      const rolloverLimit = car.advancedDynamics ? (G * normal + aero) * car.trackWidthM / (2 * car.cgHeightM) * .92 : Infinity;
      return Math.min(tyreLimit, rolloverLimit);
    }

    _tractionAcceleration(car, speed, grade, resistanceAcceleration) {
      const normal = 1 / Math.hypot(1, grade);
      if (!car.advancedDynamics) return car.traction * normal;
      const sine = grade * normal, totalLoad = G * normal + this._aeroLoadAcceleration(car, speed);
      const mu = car.longitudinalGrip / G;
      const transferRatio = car.cgHeightM / car.wheelbaseM;
      const allTyres = mu * totalLoad;
      // Aero drag is applied at the CG. Its pitch moment belongs in the axle
      // load balance along with acceleration and gravity; rolling resistance
      // remains at the road. See LAUNCH-DYNAMICS.md and the Vehicle Body model.
      const dragAcceleration = .5 * 1.225 * car.dragArea * speed * speed / car.massKg;
      const transferOffset = (G * sine + dragAcceleration - resistanceAcceleration) * transferRatio;
      let limit;
      if (car.spec.factoryDrive === 'awd') limit = allTyres;
      else if (car.spec.factoryDrive === 'rwd') {
        const denominator = 1 - mu * transferRatio;
        limit = denominator > 0 ? mu * ((1 - car.frontWeightFraction) * totalLoad + transferOffset) / denominator : allTyres;
      } else limit = mu * (car.frontWeightFraction * totalLoad - transferOffset) / (1 + mu * transferRatio);
      // A driven axle cannot gain more contact load than all four tyres carry.
      // This also bounds very high grip/CG tuning as an axle becomes unloaded.
      return clamp(limit, 0, allTyres);
    }

    _brakingDeceleration(car, grade, speed = 0) {
      const normal = 1 / Math.hypot(1, grade);
      // Uphill gravity aids stopping; downhill gravity reduces net deceleration.
      // Omitting drag/rolling here reserves extra real stopping capacity.
      return this._brakingCapacity(car, speed, grade) + G * grade * normal;
    }

    _brakingCapacity(car, speed, grade) {
      const normal = 1 / Math.hypot(1, grade);
      if (!car.advancedDynamics) return car.braking * normal;
      // Brake torque cannot buy more deceleration than the tyre contact patch
      // can transmit. Better brakes become useful with better tyres/aero; the
      // model does not simulate brake fade or a transient friction ellipse.
      return Math.min(car.brakingHardware, car.longitudinalGrip * (normal + this._aeroLoadAcceleration(car, speed) / G));
    }

    _makeSpeedProfile(car, powerMultiplier = 1) {
      car.theoreticalTopSpeed = this._equilibriumSpeed(car, 0);
      const permittedTerminal = powerMultiplier > 1 ? this._equilibriumSpeed(car, 0, powerMultiplier) : car.theoreticalTopSpeed;
      const points = car.pathPoints || this.pathPoints;
      const limits = points.map(p => {
        const normal = 1 / Math.hypot(1, p.grade);
        const terminal = p.grade === 0 ? permittedTerminal : this._equilibriumSpeed(car, p.grade, powerMultiplier);
        const curvature = Math.max(Math.abs(p.curvature), .000001);
        if (!car.advancedDynamics || car.downforceArea === 0) return Math.min(terminal, Math.sqrt(this._lateralCapacity(car, 0, p.grade) / curvature));
        // Solve v²*k <= lateral capacity(v), including speed-dependent
        // downforce and the inside-wheel lift bound. Bisection stays stable
        // when aero load makes the tyre-only closed form unbounded.
        let low = 0, high = terminal;
        for (let i = 0; i < 24; i++) {
          const v = (low + high) / 2;
          if (v * v * curvature <= this._lateralCapacity(car, v, p.grade)) low = v; else high = v;
        }
        return (low + high) / 2;
      });
      car.brakingProfile = points.map((p, i) => Math.min(this._brakingDeceleration(car, p.grade), this._brakingDeceleration(car, points[(i + 1) % points.length].grade)));
      // Two complete reverse passes carry corner braking constraints across s=0.
      for (let pass = 0; pass < 2; pass++) {
        for (let i = limits.length - 1; i >= 0; i--) {
          const next = limits[(i + 1) % limits.length];
          limits[i] = Math.min(limits[i], Math.sqrt(Math.max(0, next * next + 2 * car.brakingProfile[i] * (car.pathSpacing || this.track.spacing))));
        }
      }
      return limits;
    }

    _target(car, distance) {
      const pos = mod(distance, car.trackLength || this.track.length) / (car.pathSpacing || this.track.spacing);
      const i = Math.floor(pos) % car.speedProfile.length, t = pos - Math.floor(pos);
      const a = car.speedProfile[i], b = car.speedProfile[(i + 1) % car.speedProfile.length];
      // Interpolating v² preserves the constant-braking relation v²=u²+2as.
      return Math.sqrt(a * a + (b * b - a * a) * t);
    }

    _advance(car, dt, now) {
      if (car.finished || car.dnf) return;
      const oldDistance = car.distance, oldSpeed = car.speed;
      const oldPosition = this.sampleForCar(car, oldDistance), grade = oldPosition.grade, normal = 1 / Math.hypot(1, grade), sine = grade * normal;
      const target = this._target(car, oldDistance + Math.max(.1, oldSpeed * dt));
      const drag = .5 * 1.225 * car.dragArea * oldSpeed * oldSpeed;
      const rolling = car.rollingCoefficient * car.massKg * G * normal;
      const gravity = car.massKg * G * sine;
      const resistance = drag + rolling + gravity;
      const requestedForce = car.massKg * (target - oldSpeed) / dt + resistance;
      if (NGS && car.ngs) NGS.update(car, car.ngs, dt, {
        centerS: oldPosition.centerS,
        throttle: clamp(requestedForce * Math.max(4, oldSpeed) / (car.powerPs * PS_WATTS * car.efficiency), 0, 1),
        accelerating: requestedForce > 100 && target >= oldSpeed - .02
      });
      const availablePowerPs = car.powerPs * (car.ngs?.appliedPowerMultiplier || 1);
      car.activePowerPs = availablePowerPs;
      const transmission = TRANSMISSION && car.transmission ? TRANSMISSION.advance(car, car.transmission, dt, {
        braking: requestedForce < -100,
        accelerating: target > oldSpeed + .18 * dt && requestedForce * oldSpeed > car.powerPs * PS_WATTS * .35
      }) : null;
      const wheelRadius = transmission?.effectiveRadiusM || (car.spec.factoryDrive === 'rwd' ? car.spec.rearTireRadiusMm : car.spec.frontTireRadiusMm) / 1000;
      const torqueForce = car.torqueNm * (transmission?.forceRatio ?? car.driveReduction) * car.efficiency / wheelRadius;
      const powerForce = availablePowerPs * PS_WATTS * car.efficiency * (transmission?.torqueFactor ?? 1) / Math.max(4, oldSpeed);
      const tractionForce = this._tractionAcceleration(car, oldSpeed, grade, resistance / car.massKg) * car.massKg;
      const driveForce = transmission?.phases ? transmission.phases.reduce((sum, part) => sum + part.fraction * Math.min(
        car.torqueNm * part.forceRatio * car.efficiency / wheelRadius,
        availablePowerPs * PS_WATTS * car.efficiency * part.torqueFactor / Math.max(4, oldSpeed), tractionForce), 0)
        : Math.min(torqueForce, powerForce, tractionForce);
      const availableAcceleration = (driveForce - resistance) / car.massKg;
      const brakingCapacity = this._brakingCapacity(car, oldSpeed, grade);
      const minimumAcceleration = -brakingCapacity - resistance / car.massKg;
      const acceleration = Math.max(minimumAcceleration, Math.min(availableAcceleration, (target - oldSpeed) / dt));
      // Applied wheel braking excludes gravity, rolling resistance and drag.
      // This observation does not feed back into handling or gear selection;
      // the model does not split regenerative and friction brake commands.
      const wheelForce = car.massKg * acceleration + resistance;
      car.serviceBrakeForceN = Math.max(0, -wheelForce);
      car.brakeDemand = brakingCapacity > 0 ? clamp(car.serviceBrakeForceN / (car.massKg * brakingCapacity), 0, 1) : 0;
      if (BRAKE_LIGHTS) BRAKE_LIGHTS.update(car.brakeLightState, dt, { brakeForceN: car.serviceBrakeForceN, massKg: car.massKg });
      car.speed = Math.max(0, oldSpeed + acceleration * dt);
      const travel = (oldSpeed + car.speed) * .5 * dt;
      car.distance = Math.min(car.totalDistance, oldDistance + travel);
      car.acceleration = acceleration; car.targetSpeed = target; car.maxSpeed = Math.max(car.maxSpeed, car.speed);
      if (TRANSMISSION && car.transmission) TRANSMISSION.updateRPM(car, car.transmission);
      const position = this.sampleForCar(car, car.distance);
      car.grade = position.grade; car.elevation = position.elevation; car.slopeAcceleration = -G * sine;
      if (car.advancedDynamics) {
        const totalLoad = car.massKg * (G * normal + this._aeroLoadAcceleration(car, car.speed));
        const transfer = (car.massKg * (acceleration + G * sine) + drag) * car.cgHeightM / car.wheelbaseM;
        car.frontNormalLoad = clamp(totalLoad * car.frontWeightFraction - transfer, 0, totalLoad);
        car.rearNormalLoad = totalLoad - car.frontNormalLoad;
      }
      car.phase = acceleration < -.2 ? 'braking' : Math.abs(position.curvature) > .0015 && car.speed > target * .9 ? 'cornering' : 'accelerating';
      if (TELEMETRY) {
        // Observe applied wheel work, not acceleration alone: gravity/drag can
        // change speed without propulsion or regenerative braking. This is
        // energy display only; gear/RPM are read from the physical snapshot.
        const meanSpeed = (oldSpeed + car.speed) * .5;
        TELEMETRY.update(car, car.telemetry, dt, {
          drivePowerW: Math.max(0, wheelForce) * meanSpeed,
          brakePowerW: Math.max(0, -wheelForce) * meanSpeed,
          curvature: position.curvature
        });
      }
      // Do not give underpowered cars fictional climbing force or leave a race
      // running forever. Thirty continuous seconds below 0.1m/s is a retirement.
      car.stalledFor = car.speed < .1 ? car.stalledFor + dt : 0;
      if (car.stalledFor + 1e-9 >= 30) {
        car.dnf = true; car.retiredAt = now + dt; car.phase = 'dnf';
        car.dnfReason = grade > .01 && availableAcceleration < .1 ? '오르막 구동력 부족' : '30초간 주행 지속 불가';
        car.serviceBrakeForceN = car.brakeDemand = 0;
        if (NGS && car.ngs) NGS.update(car, car.ngs, 0, { dnf: true });
        car.activePowerPs = car.powerPs;
        if (BRAKE_LIGHTS) BRAKE_LIGHTS.update(car.brakeLightState, 0, { brakeForceN: 0, massKg: car.massKg, dnf: true });
        if (TELEMETRY) TELEMETRY.stop(car.telemetry);
        return;
      }
      while (car.lap < this.laps && car.distance + 1e-9 >= (car.lap + 1) * car.trackLength) {
        const remaining = (car.lap + 1) * car.trackLength - oldDistance;
        // Stable constant-acceleration root, including deceleration and launch.
        const endSpeedAtLine = Math.sqrt(Math.max(0, oldSpeed * oldSpeed + 2 * acceleration * remaining));
        const crossingDt = clamp(2 * remaining / Math.max(1e-12, oldSpeed + endSpeedAtLine), 0, dt);
        const crossingTime = now + crossingDt, lapTime = crossingTime - car.lastLapAt;
        car.lapTimes.push(lapTime); car.bestLap = car.bestLap === null ? lapTime : Math.min(car.bestLap, lapTime);
        car.lastLapAt = crossingTime; car.lap++; car.currentLap = Math.min(this.laps, car.lap + 1);
        if (car.lap === this.laps) {
          car.finished = true; car.finishTime = crossingTime; car.finishSpeed = endSpeedAtLine; car.finishRemainderSeconds = dt - crossingDt; car.distance = car.totalDistance;
          car.serviceBrakeForceN = car.brakeDemand = 0;
          if (NGS && car.ngs) NGS.update(car, car.ngs, 0, { finished: true });
          car.activePowerPs = car.powerPs;
          if (BRAKE_LIGHTS) BRAKE_LIGHTS.update(car.brakeLightState, 0, { brakeForceN: 0, massKg: car.massKg, finished: true });
          if (TELEMETRY) TELEMETRY.stop(car.telemetry);
        }
      }
    }

    step(dt) {
      if (!Number.isFinite(dt) || dt < 0 || dt > 60) throw new RangeError('step duration must be a finite number between 0 and 60 seconds.');
      if (this.finished || dt === 0) return this;
      this._accumulator += dt;
      while (this._accumulator + 1e-12 >= FIXED_DT && !this.finished) {
        const now = this._ticks * FIXED_DT;
        for (const car of this.cars) this._advance(car, FIXED_DT, now);
        this._ticks++; this._accumulator = Math.max(0, this._accumulator - FIXED_DT);
        this.time = this._ticks * FIXED_DT;
        this.finished = this.cars.every(car => car.finished || car.dnf);
        if (this.finished) { this.time = Math.max(...this.cars.map(car => car.finishTime === null ? car.retiredAt : car.finishTime)); this._accumulator = 0; }
      }
      return this;
    }

    standings() {
      return this.cars.slice().sort((a, b) => a.finished && b.finished ? a.finishTime - b.finishTime || a.id - b.id
        : a.finished ? -1 : b.finished ? 1 : a.dnf !== b.dnf ? a.dnf ? 1 : -1 : b.distance / b.trackLength - a.distance / a.trackLength || a.id - b.id);
    }
  }
  TrackRace.VEHICLES = VEHICLES;
  TrackRace.FIXED_DT = FIXED_DT;
  TrackRace.buildTrack = buildTrack;
  root.TrackRace = TrackRace;
  if (typeof module !== 'undefined' && module.exports) module.exports = TrackRace;
})(typeof window !== 'undefined' ? window : globalThis);
