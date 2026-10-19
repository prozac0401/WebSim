/* Deterministic stepped-transmission physics. Shift times, torque retention,
 * WOT scheduling and instantaneous rev-matched downshifts are simulation
 * assumptions, not measured factory shift maps. No telemetry dependency. */
(function (root) {
  'use strict';
  const PROFILES = root.PowertrainProfiles || (typeof require === 'function' ? require('./powertrain-profiles.js') : null);
  if (!PROFILES) throw new Error('Load powertrain-profiles.js before powertrain-dynamics.js.');
  const internal = new WeakMap();
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const MODEL = Object.freeze({ minimumDownshiftIntervalSeconds: .65, downshiftFraction: .53,
    loadedDownshiftFraction: .82, loadedPreviousGearCeilingFraction: .90,
    downshift: 'instantaneous rev-matched estimate; no full torque interruption' });

  function describeGearing(car) {
    const profile = PROFILES.resolve(car), spec = car.spec || car.entrant?.spec || {};
    const gearCount = Number.isInteger(profile.gearCount) ? profile.gearCount : 0;
    const finalDrives = Array.isArray(profile.finalDriveRatios) && profile.finalDriveRatios.length === gearCount
      ? profile.finalDriveRatios : Array(gearCount).fill(profile.finalDriveRatio);
    const sourced = gearCount > 0 && Array.isArray(profile.gearRatios) && profile.gearRatios.length === gearCount
      && profile.gearRatios.every(ratio => Number.isFinite(ratio) && ratio > 0)
      && finalDrives.every(ratio => Number.isFinite(ratio) && ratio > 0);
    const rear = profile.drivenAxle === 'rear' || spec.factoryDrive === 'rwd';
    const nominalRadiusM = Math.max(.15, finite(rear ? spec.rearTireRadiusMm : spec.frontTireRadiusMm, 320) / 1000);
    const rollingRadiusScale = clamp(finite(profile.rollingRadiusScale, 1), .9, 1.02);
    const factoryReduction = car.entrant?.factorySpec?.reduction;
    const tunedFinalDriveScale = factoryReduction > 0 && spec.reduction > 0 ? spec.reduction / factoryReduction : 1;
    const totalRatios = Array.from({ length: gearCount }, (_, i) => sourced
      ? profile.gearRatios[i] * finalDrives[i] * tunedFinalDriveScale
      : Math.max(1, finite(profile.total1stReduction, 13.5)) * Math.pow(clamp(finite(profile.ratioStep, .75), .5, .92), i) * tunedFinalDriveScale);
    return { totalRatios, nominalRadiusM, rollingRadiusScale, effectiveRadiusM: nominalRadiusM * rollingRadiusScale,
      tunedFinalDriveScale, ratioStatus: profile.ratioStatus || 'estimated', sourceId: profile.ratioSourceId || null,
      shiftRPM: finite(profile.shiftRPM, 6000), schedule: 'estimated-wide-open-throttle' };
  }

  function gearSpeedAtRPM(car, gear, rpm) {
    const g = describeGearing(car), ratio = g.totalRatios[gear - 1];
    return ratio && Number.isFinite(rpm) ? rpm / ratio * (2 * Math.PI * g.effectiveRadiusM) / 60 : null;
  }

  function configuration(car) {
    const profile = PROFILES.resolve(car), gearing = describeGearing(car);
    const stepped = profile.powertrainType !== 'electric' && gearing.totalRatios.length > 0;
    const idle = stepped ? Math.max(500, finite(profile.idleRPM, 900)) : 0;
    const shiftRPM = Math.max(idle + 1000, finite(profile.shiftRPM, 6000));
    // Profiles supply the documented calibration; these defaults also keep
    // standalone callers using older profile fixtures deterministic.
    const fallback = profile.transmissionType === 'MT' ? [.45, 0] : profile.transmissionType === 'DCT' ? [.12, .85] : [.25, .65];
    return { profile, gearing, stepped, idle, shiftRPM, maxRPM: Math.max(shiftRPM, finite(profile.maxRPM, 7000)),
      duration: stepped ? clamp(finite(profile.shiftModel?.upshiftDurationS, fallback[0]), 0, 2) : 0,
      retention: stepped ? clamp(finite(profile.shiftModel?.torqueRetention, fallback[1]), 0, 1) : 1,
      sinceShift: MODEL.minimumDownshiftIntervalSeconds };
  }

  function wheelRPM(data, speed) { return Math.max(0, finite(speed)) * 60 / (2 * Math.PI * data.gearing.effectiveRadiusM); }
  function scheduledGear(data, speed) {
    if (!data.stepped) return null;
    const rpm = wheelRPM(data, speed), ratios = data.gearing.totalRatios;
    let gear = 1;
    while (gear < ratios.length && rpm * ratios[gear - 1] >= data.shiftRPM) gear++;
    return gear;
  }

  function preview(car, speed) {
    // Pure future-speed envelope. Never borrow a current shifting/low-gear
    // state, and never advance a timer while guidance samples the road ahead.
    const data = internal.get(car.transmission) || configuration(car), gear = scheduledGear(data, speed);
    if (!gear) return null; // EV, IVT and identity-free fixtures retain their original force envelope.
    const totalRatio = data.gearing.totalRatios[gear - 1];
    const rpm = Math.max(data.idle, wheelRPM(data, speed) * totalRatio);
    return { gear, rpm, totalRatio, effectiveRadiusM: data.gearing.effectiveRadiusM,
      torqueFactor: rpm >= data.maxRPM ? 0 : 1, ratioStatus: data.gearing.ratioStatus };
  }

  function create(car) {
    const data = configuration(car), gear = scheduledGear(data, car.speed);
    const state = { transmissionType: data.profile.transmissionType, gearCount: data.gearing.totalRatios.length || null,
      gear, rpm: 0, shifting: false, fromGear: null, toGear: null, neutral: false,
      torqueFactor: 1, appliedTorqueFactor: 1, remainingSeconds: 0, durationSeconds: 0,
      shiftCount: 0, upshiftCount: 0, downshiftCount: 0,
      totalRatio: gear ? data.gearing.totalRatios[gear - 1] : finite(car.driveReduction, car.reduction || 13.5),
      effectiveRadiusM: gear ? data.gearing.effectiveRadiusM : data.gearing.nominalRadiusM,
      ratioStatus: data.gearing.ratioStatus };
    internal.set(state, data);
    updateRPM(car, state);
    return state;
  }

  function updateRPM(car, state = car.transmission) {
    const data = internal.get(state);
    if (!data || !data.stepped) return state;
    const ratios = data.gearing.totalRatios;
    const progress = state.shifting ? 1 - state.remainingSeconds / state.durationSeconds : 1;
    state.totalRatio = state.shifting ? ratios[state.fromGear - 1] + (ratios[state.toGear - 1] - ratios[state.fromGear - 1]) * progress : ratios[state.gear - 1];
    state.rpm = Math.max(data.idle, wheelRPM(data, car.speed) * state.totalRatio);
    state.neutral = state.shifting && data.profile.transmissionType === 'MT' && data.retention === 0;
    state.torqueFactor = state.shifting ? data.retention : state.rpm >= data.maxRPM ? 0 : 1;
    return state;
  }

  function advance(car, state, dt, input = {}) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('transmission dt must be finite and nonnegative.');
    const data = internal.get(state);
    if (!data) throw new TypeError('Create transmission with PowertrainDynamics.create(car).');
    const ratios = data.gearing.totalRatios;
    updateRPM(car, state);
    if (!data.stepped || dt === 0) return { forceRatio: state.totalRatio * state.torqueFactor, torqueFactor: state.torqueFactor, effectiveRadiusM: state.effectiveRadiusM };
    const rpm = wheelRPM(data, car.speed), rpmFor = gear => Math.max(data.idle, rpm * ratios[gear - 1]);
    if (!state.shifting) {
      if (!input.braking && rpmFor(state.gear) >= data.shiftRPM && state.gear < ratios.length) {
        state.fromGear = state.gear; state.toGear = state.gear + 1;
        state.remainingSeconds = state.durationSeconds = data.duration;
        state.shifting = data.duration > 0;
        state.shiftCount++; state.upshiftCount++; data.sinceShift = 0;
        if (!state.shifting) state.gear = state.toGear;
      } else if (state.gear > 1 && data.sinceShift + 1e-12 >= MODEL.minimumDownshiftIntervalSeconds && (input.accelerating
        ? rpmFor(state.gear) < data.shiftRPM * MODEL.loadedDownshiftFraction && rpmFor(state.gear - 1) < data.shiftRPM * MODEL.loadedPreviousGearCeilingFraction
        : rpmFor(state.gear) < data.shiftRPM * MODEL.downshiftFraction && rpmFor(state.gear - 1) < data.shiftRPM * .86)) {
        // Rev matching is idealised. Braking downshifts do not replay the
        // acceleration upshift's full-cut penalty.
        state.fromGear = state.gear; state.toGear = --state.gear;
        state.shiftCount++; state.downshiftCount++; data.sinceShift = 0;
      }
    }
    let forceRatio = ratios[state.gear - 1], torqueFactor = 1, phases = null;
    if (state.shifting) {
      const during = Math.min(dt, state.remainingSeconds), after = dt - during;
      const elapsed = state.durationSeconds - state.remainingSeconds;
      const from = ratios[state.fromGear - 1], to = ratios[state.toGear - 1];
      // Integrate the linear clutch handover and any normal-drive remainder
      // exactly in time, including durations that do not divide the fixed tick.
      const meanRatio = from + (to - from) * (elapsed + during * .5) / state.durationSeconds;
      forceRatio = (meanRatio * data.retention * during + to * after) / dt;
      torqueFactor = (data.retention * during + after) / dt;
      // A tick crossing the end has two independently traction-limited parts.
      // Applying traction to an averaged engine force could otherwise restore
      // a whole tick of drive after only a fraction of the clutch has engaged.
      if (after > 1e-12) phases = [
        { fraction: during / dt, forceRatio: meanRatio * data.retention, torqueFactor: data.retention },
        { fraction: after / dt, forceRatio: to, torqueFactor: 1 }
      ];
      state.remainingSeconds = Math.max(0, state.remainingSeconds - dt);
      if (state.remainingSeconds < 1e-12) {
        state.remainingSeconds = 0; state.shifting = false; state.gear = state.toGear;
      }
    } else if (rpmFor(state.gear) >= data.maxRPM) { forceRatio = 0; torqueFactor = 0; }
    data.sinceShift += dt;
    state.appliedTorqueFactor = torqueFactor;
    updateRPM(car, state);
    return { forceRatio, torqueFactor, effectiveRadiusM: state.effectiveRadiusM, phases };
  }

  const api = Object.freeze({ create, advance, updateRPM, preview, describeGearing, gearSpeedAtRPM, MODEL });
  root.PowertrainDynamics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
