/* CN7 N 8DCT-only simulation easter egg. This is power overboost, not DRS.
 * Hyundai's 2021 launch specification is 280 -> 290 PS for 20 s, with a 40 s
 * reuse interval. The user's simulation limit is 10 s, only inside the historical
 * DRS straights below. No measured extra torque curve is published here, so the
 * torque cap stays unchanged. Tuned power receives the same 290/280 ratio.
 * FIA maps identify activation landmarks, not WGS84 survey coordinates or a
 * fixed braking/closing line. Geographic pins below match those named landmarks
 * to the imported route; their ~45 m uncertainty and conservative approach ends
 * are explicit. They are not the 2026 F1 straight-mode regulations.
 */
(function (root) {
  'use strict';
  const Profiles = root.PowertrainProfiles || (typeof require === 'function' ? require('./powertrain-profiles.js') : null);
  const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const mod = (x, n) => ((x % n) + n) % n;
  const MODEL = freeze({ durationSeconds: 10, manufacturerDurationSeconds: 20, cooldownSeconds: 40,
    powerMultiplier: 290 / 280, torqueMultiplier: 1, minimumSpeedMps: 10, throttleThreshold: .8,
    activationPolicy: 'automatic-full-throttle-in-reference-zone-once-per-zone-pass',
    powerStatus: 'manufacturer-rated-peak-ratio', torqueStatus: 'unchanged-no-boost-torque-curve-verified',
    durationStatus: 'user-requested-simulation-limit', zoneStatus: 'historical-DRS-landmark-approximation',
    sourceUrls: ['https://www.hyundai.com/worldwide/en/newsroom/detail/0000000499',
      'https://cdn.dealereprocess.org/cdn/servicemanuals/hyundai/2022-elantran.pdf'] });
  const REFERENCES = freeze({
    monza: { referenceYear: 2025, referenceLengthM: 5793,
      sourceUrl: 'https://www.fia.com/system/files/decision-document/2025_monza_event_-_circuit_map_-_monza_2025_0.pdf',
      zones: [
        { id: 'monza-serraglio', label: 'Lesmo 2 → Ascari', startLandmark: 'Turn 7 exit', start: [9.2960702, 45.6281121], startOffsetM: 170,
          endLandmark: 'Ascari braking approach', end: [9.2868601, 45.6233019] },
        { id: 'monza-pit-straight', label: 'GP straight → Rettifilo', startLandmark: 'Approximate finish line', start: [9.2812225, 45.6189750], startOffsetM: 12,
          endLandmark: 'Rettifilo braking approach', end: [9.2817848, 45.6235364] }
      ] },
    spa: { referenceYear: 2025, referenceLengthM: 7004,
      sourceUrl: 'https://www.fia.com/system/files/decision-document/2025_belgian_grand_prix_-_event_notes_-_circuit_map_pit_lane_emergency_exits_quarantine_zone_and_red_zones.pdf',
      zones: [
        { id: 'spa-kemmel', label: 'Raidillon → Les Combes', startLandmark: 'Turn 4 exit', start: [5.9723781, 50.4405428], startOffsetM: 305,
          endLandmark: 'Les Combes braking approach', end: [5.9772697, 50.4322206] },
        { id: 'spa-pit-straight', label: 'Bus Stop → La Source', startLandmark: 'Turn 19 exit', start: [5.9669466, 50.4421278], startOffsetM: 30,
          endLandmark: 'La Source braking approach', end: [5.9640080, 50.4453774] }
      ] },
    silverstone: { referenceYear: 2024, referenceLengthM: 5891,
      sourceUrl: 'https://www.fia.com/sites/default/files/decision-document/2024%20Silverstone%20Event%20-%20Circuit%20Map%20Silverstone%202024.pdf',
      zones: [
        { id: 'silverstone-wellington', label: 'Aintree → Brooklands', startLandmark: 'Turn 5 exit', start: [-1.0120047, 52.0733896], startOffsetM: 30,
          endLandmark: 'Brooklands braking approach', end: [-1.0183583, 52.0769544] },
        { id: 'silverstone-hangar', label: 'Chapel → Stowe', startLandmark: 'Turn 14', start: [-1.0112346, 52.0697196], startOffsetM: 0,
          endLandmark: 'Stowe braking approach', end: [-1.0171091, 52.0636106] }
      ] }
  });
  const cache = new WeakMap(), configs = new WeakMap(), EMPTY = Object.freeze([]);
  function stationAt(track, geo) {
    const p = track.projection;
    const x = ((geo[0] - p.origin[0]) * p.metresPerDegree * Math.cos(p.latitudeRad) - p.offset.x) * p.scale;
    const y = (-(geo[1] - p.origin[1]) * p.metresPerDegree - p.offset.y) * p.scale;
    let best = Infinity, station = NaN;
    const points = track.points, length = track.centerlineLength;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], dx = b.x - a.x, dy = b.y - a.y;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
      const error = Math.hypot(x - a.x - u * dx, y - a.y - u * dy);
      if (error < best) { best = error; station = (i + u) * length / points.length; }
    }
    return best <= 45 ? mod(station, length) : NaN;
  }
  function getZones(track) {
    const reference = REFERENCES[track?.id], p = track?.projection, length = track?.centerlineLength;
    if (!reference || !Array.isArray(track.points) || track.points.length < 3 || !p?.origin || !p.offset ||
        ![length, p.scale, p.metresPerDegree, p.latitudeRad, ...p.origin, p.offset.x, p.offset.y].every(Number.isFinite) ||
        p.scale <= 0 || Math.abs(length / reference.referenceLengthM - 1) > .02) return EMPTY;
    const old = cache.get(track);
    if (old?.points === track.points && old.projection === p && old.length === length && old.id === track.id) return old.zones;
    const zones = reference.zones.map(zone => {
      const anchorS = stationAt(track, zone.start), endS = stationAt(track, zone.end);
      const startS = mod(anchorS + zone.startOffsetM, length), lengthM = mod(endS - startS, length);
      if (![startS, endS, lengthM].every(Number.isFinite) || lengthM < 100 || lengthM > 1500) return null;
      return { id: zone.id, label: zone.label, startS, endS, lengthM, referenceYear: reference.referenceYear,
        sourceUrl: reference.sourceUrl, startLandmark: zone.startLandmark, startOffsetM: zone.startOffsetM,
        endLandmark: zone.endLandmark, endStatus: 'simulation-conservative-braking-approach',
        mappingStatus: 'landmark-projected-approximation', mappingUncertaintyM: 45 };
    });
    // Reject a changed/wrong circuit with even one unmatched landmark.
    const result = zones.every(Boolean) ? freeze(zones) : EMPTY;
    cache.set(track, { points: track.points, projection: p, length, id: track.id, zones: result });
    return result;
  }
  function eligible(car) {
    if (car?.vehicleId !== 'avante_n' || car.entrant?.vehicleId !== 'avante_n' || car.entrant.variantId !== 'avante-n-2.0t-dct') return false;
    const p = Profiles?.resolve(car), t = car.transmission;
    return p?.vehicleId === 'avante_n' && p.variantId === 'avante-n-2.0t-dct' && p.transmissionType === 'DCT' && p.gearCount === 8 &&
      (!t || t.transmissionType === 'DCT' && t.gearCount === 8);
  }
  function create(car, track) {
    const zones = getZones(track), valid = eligible(car);
    const state = { eligible: valid, supported: valid && zones.length > 0, active: false, zoneId: null,
      remainingSeconds: 0, cooldownSeconds: 0, powerMultiplier: 1, appliedPowerMultiplier: 1,
      torqueMultiplier: 1, boostPs: 0, activationCount: 0, activeSeconds: 0, totalActiveSeconds: 0 };
    configs.set(state, { track, zones, usedPasses: Object.create(null) });
    return state;
  }
  function stop(state, cooldown) {
    if (state.active && cooldown) state.cooldownSeconds = MODEL.cooldownSeconds;
    state.active = false; state.remainingSeconds = 0; state.powerMultiplier = 1; state.boostPs = 0;
  }
  function update(car, state, dt, input = {}) {
    const config = configs.get(state);
    if (!config) throw new TypeError('NGS state must be created with NGrinShift.create.');
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('NGS dt must be finite and nonnegative.');
    if (car.finished || car.dnf || input.finished || input.dnf) {
      stop(state, false); state.cooldownSeconds = 0; state.zoneId = null; state.appliedPowerMultiplier = 1;
      return state;
    }
    // Pausing is a true no-op, including zone changes and automatic activation.
    if (dt === 0) return state;
    state.eligible = eligible(car); state.supported = state.eligible && config.zones.length > 0;
    state.appliedPowerMultiplier = 1;
    if (!state.supported) { stop(state, false); state.cooldownSeconds = 0; state.zoneId = null; return state; }
    const length = config.track.centerlineLength, s = Number.isFinite(input.centerS) ? mod(input.centerS, length) : NaN;
    const zone = Number.isFinite(s) ? config.zones.find(z => mod(s - z.startS, length) < z.lengthM) : null;
    const speed = input.speedMps ?? car.speed;
    const accelerating = input.accelerating !== false && Number.isFinite(input.throttle) && input.throttle > MODEL.throttleThreshold &&
      Number.isFinite(speed) && speed >= MODEL.minimumSpeedMps && !(car.serviceBrakeForceN > 0);
    const lap = Number.isFinite(car.distance) && car.trackLength > 0 ? Math.floor(Math.max(0, car.distance) / car.trackLength) :
      Number.isFinite(input.centerS) ? Math.floor(Math.max(0, input.centerS) / length) : 0;
    const pass = zone ? lap - (zone.startS > zone.endS && s < zone.startS ? 1 : 0) : null;
    if (state.active && (!zone || state.zoneId !== zone.id || !accelerating)) stop(state, true);
    state.zoneId = zone?.id || null;
    if (!state.active && state.cooldownSeconds <= 1e-10 && zone && accelerating && config.usedPasses[zone.id] !== pass) {
      state.active = true; state.remainingSeconds = MODEL.durationSeconds; state.activeSeconds = 0;
      state.activationCount++; config.usedPasses[zone.id] = pass;
    }
    if (state.active) {
      const used = Math.min(dt, state.remainingSeconds);
      state.remainingSeconds = Math.max(0, state.remainingSeconds - used);
      state.activeSeconds += used; state.totalActiveSeconds += used;
      state.appliedPowerMultiplier = 1 + (MODEL.powerMultiplier - 1) * used / dt;
      if (state.remainingSeconds <= 1e-10) { stop(state, true); state.cooldownSeconds = Math.max(0, state.cooldownSeconds - (dt - used)); }
      else { state.powerMultiplier = MODEL.powerMultiplier; state.boostPs = Math.max(0, car.powerPs || 0) * (MODEL.powerMultiplier - 1); }
    } else state.cooldownSeconds = Math.max(0, state.cooldownSeconds - dt);
    return state;
  }
  const api = Object.freeze({ MODEL, REFERENCES, getZones, eligible, create, update });
  root.NGrinShift = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
