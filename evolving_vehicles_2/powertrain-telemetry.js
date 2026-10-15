/* Display-only drivetrain telemetry. Nothing returned here feeds vehicle
 * forces, speed limits, tuning scores or lap timing. Source-backed gearbox
 * types/counts and explicitly sourced ratios live in powertrain-profiles.js.
 * WOT shift scheduling, effective rolling radius and hybrid energy sharing
 * remain presentation estimates, not OBD data or manufacturer control maps.
 * There is deliberately no battery state of charge or energy accounting. */
(function (root) {
  'use strict';
  const PROFILES = root.PowertrainProfiles || (typeof require === 'function' ? require('./powertrain-profiles.js') : null);
  if (!PROFILES) throw new Error('Load powertrain-profiles.js before powertrain-telemetry.js.');
  const internal = new WeakMap();
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const MODEL = Object.freeze({
    purpose: 'display-only estimates; no feedback into race physics',
    rpmScale: 'idleRPM = 0, estimated shiftRPM = 1; numerical RPM is not displayed',
    minimumShiftIntervalSeconds: .65,
    shiftLampBlankSeconds: .12,
    downshiftFraction: .53,
    loadedDownshiftFraction: .82,
    loadedPreviousGearCeilingFraction: .90,
    loadedDownshiftPowerFraction: .35,
    cornerFilterSeconds: .16,
    cornerEnterCurvature: .0028,
    cornerExitCurvature: .0016,
    cornerEnterLateralAcceleration: 1.6,
    cornerExitLateralAcceleration: .9,
    cornerEnterHoldSeconds: .18,
    cornerExitHoldSeconds: .22,
    apexMinimumCornerSeconds: .45,
    apexCurvatureDropFraction: .12,
    apexSpeedRecoveryMps: .25,
    apexConfirmationSeconds: .18,
    apexAssistRampSeconds: 1.2,
    apexAssistMaximum: .75,
    cornerExitAssistSeconds: 4,
    regenerationShare: .55,
    regenerationGaugeFullScaleW: 35000,
    flowFilterSeconds: .16,
    limitations: 'Estimated power-flow direction and relative intensity only; no SOC, battery capacity, measured motor power or real gearbox control.'
  });

  function describeGearing(car) {
    const profile = PROFILES.resolve(car), spec = car.spec || car.entrant?.spec || {};
    const gearCount = Number.isInteger(profile.gearCount) ? profile.gearCount : 0;
    const sourced = Array.isArray(profile.gearRatios) && profile.gearRatios.length === gearCount && profile.finalDriveRatio > 0;
    const rear = profile.drivenAxle === 'rear' || spec.factoryDrive === 'rwd';
    const nominalRadiusM = Math.max(.15, finite(rear ? spec.rearTireRadiusMm : spec.frontTireRadiusMm, 320) / 1000);
    const rollingRadiusScale = clamp(finite(profile.rollingRadiusScale, 1), .9, 1.02);
    const factoryReduction = car.entrant?.factorySpec?.reduction;
    const tunedFinalDriveScale = sourced && factoryReduction > 0 && spec.reduction > 0 ? spec.reduction / factoryReduction : 1;
    const totalRatios = Array.from({ length: gearCount }, (_, i) => sourced
      ? profile.gearRatios[i] * profile.finalDriveRatio * tunedFinalDriveScale
      : Math.max(1, finite(profile.total1stReduction, 13.5)) * Math.pow(clamp(finite(profile.ratioStep, .75), .5, .92), i));
    return { totalRatios, nominalRadiusM, rollingRadiusScale, effectiveRadiusM: nominalRadiusM * rollingRadiusScale,
      tunedFinalDriveScale, ratioStatus: profile.ratioStatus || 'estimated', sourceId: profile.ratioSourceId || null,
      shiftRPM: finite(profile.shiftRPM, 6000), schedule: 'estimated-wide-open-throttle' };
  }

  function gearSpeedAtRPM(car, gear, rpm) {
    const g = describeGearing(car), ratio = g.totalRatios[gear - 1];
    return ratio && Number.isFinite(rpm) ? rpm / ratio * (2 * Math.PI * g.effectiveRadiusM) / 60 : null;
  }

  function create(car) {
    const profile = PROFILES.resolve(car), spec = car.spec || {};
    // Resolve by the actual entrant powertrain, never only by family name:
    // a Ray EV must not inherit the petrol Ray's four-speed display.
    const kind = spec.electric || spec.powertrainType === 'electric' || profile.powertrainType === 'electric'
      ? 'electric' : spec.powertrainType === 'hybrid' || profile.powertrainType === 'hybrid' ? 'hybrid' : 'combustion';
    const gearCount = Number.isInteger(profile.gearCount) && profile.gearCount > 0 ? profile.gearCount : null;
    const state = { kind, gear: kind === 'electric' ? null : gearCount ? 1 : null,
      gearLabel: kind === 'electric' ? '—' : gearCount ? '1' : profile.transmissionType === 'IVT' ? 'IVT' : 'D',
      rpmNormalized: 0, shiftLights: 0, shiftCue: false,
      battery: kind === 'hybrid' ? { flow: 0, mode: 'idle', cornerPhase: 'straight' } : null };
    const idle = Math.max(500, finite(profile.idleRPM, 900)), shift = Math.max(idle + 1000, finite(profile.shiftRPM, 6000));
    internal.set(state, { profile, gearCount, idle, shift, max: Math.max(shift, finite(profile.maxRPM, 7000)),
      gearing: describeGearing(car),
      rpm: idle, sinceShift: MODEL.minimumShiftIntervalSeconds, lampBlank: 0,
      curvature: 0, signedCurvature: 0, lateral: 0, inCorner: false, enterTime: 0, exitTime: 0, assistTime: 0,
      cornerAge: 0, peakCurvature: 0, minSpeed: Infinity, turnSign: 0, reversalTime: 0,
      apexConfirmTime: 0, postApex: false, apexAssistTime: 0 });
    if (car.finished || car.dnf) stop(state);
    return state;
  }

  function stop(state) {
    state.gear = null; state.gearLabel = '—'; state.rpmNormalized = 0;
    state.shiftLights = 0; state.shiftCue = false;
    if (state.battery) { state.battery.flow = 0; state.battery.mode = 'idle'; state.battery.cornerPhase = 'straight'; }
    const data = internal.get(state);
    if (data) { data.assistTime = 0; data.lampBlank = 0; }
    return state;
  }

  function startCorner(data, speed) {
    data.inCorner = true; data.assistTime = 0; data.enterTime = 0; data.exitTime = 0;
    data.cornerAge = 0; data.peakCurvature = data.curvature; data.minSpeed = speed;
    data.turnSign = Math.sign(data.signedCurvature); data.reversalTime = 0;
    data.apexConfirmTime = 0; data.postApex = false; data.apexAssistTime = 0;
  }

  function updateCorner(data, speed, dt, curvature, accelerating, braking) {
    const amount = 1 - Math.exp(-dt / MODEL.cornerFilterSeconds), magnitude = Math.abs(finite(curvature));
    data.curvature += (magnitude - data.curvature) * amount;
    data.signedCurvature += (finite(curvature) - data.signedCurvature) * amount;
    data.lateral += (magnitude * speed * speed - data.lateral) * amount;
    data.assistTime = Math.max(0, data.assistTime - dt);
    const entering = speed > 3 && (data.curvature > MODEL.cornerEnterCurvature || data.lateral > MODEL.cornerEnterLateralAcceleration);
    const leaving = data.curvature < MODEL.cornerExitCurvature && data.lateral < MODEL.cornerExitLateralAcceleration;
    if (!data.inCorner) {
      data.enterTime = entering ? data.enterTime + dt : 0;
      if (data.enterTime >= MODEL.cornerEnterHoldSeconds) startCorner(data, speed);
    } else {
      data.cornerAge += dt;
      data.peakCurvature = Math.max(data.peakCurvature, data.curvature);
      data.minSpeed = Math.min(data.minSpeed, speed);
      const oppositeTurn = entering && Math.sign(data.signedCurvature) !== data.turnSign && Math.abs(data.signedCurvature) > MODEL.cornerEnterCurvature;
      data.reversalTime = oppositeTurn ? data.reversalTime + dt : 0;
      // A confirmed chicane direction begins a fresh approach. Once the apex
      // is passed, brief braking corrections do not rewind that phase; braking
      // still overrides the energy flow immediately in updateBattery.
      if (data.reversalTime >= MODEL.cornerEnterHoldSeconds) startCorner(data, speed);
      // Require both filtered and current curvature to remain open. Otherwise
      // filter recovery after a 0.1s geometry gap could falsely pass the hold.
      const opening = Math.max(data.curvature, magnitude) < data.peakCurvature * (1 - MODEL.apexCurvatureDropFraction);
      const recovering = speed >= data.minSpeed + MODEL.apexSpeedRecoveryMps;
      const apexCandidate = data.cornerAge >= MODEL.apexMinimumCornerSeconds && opening && recovering && accelerating && !braking;
      if (!data.postApex) {
        data.apexConfirmTime = apexCandidate ? data.apexConfirmTime + dt : 0;
        if (data.apexConfirmTime >= MODEL.apexConfirmationSeconds) { data.postApex = true; data.apexAssistTime = 0; }
      }
      if (data.postApex && accelerating && !braking) data.apexAssistTime += dt;
      data.exitTime = leaving ? data.exitTime + dt : 0;
      if (data.exitTime >= MODEL.cornerExitHoldSeconds) {
        data.inCorner = false; data.assistTime = MODEL.cornerExitAssistSeconds; data.exitTime = 0;
      }
    }
  }

  function updateBattery(car, state, data, dt, drivePower, brakePower) {
    let target = 0;
    const battery = state.battery;
    battery.cornerPhase = data.inCorner ? data.postApex ? 'apex-exit' : 'corner' : data.assistTime > 0 ? 'exit' : 'straight';
    if (car.speed > .5 && brakePower > 100) {
      // Wheel braking takes precedence from its first physics tick, even
      // before a corner or while gravity still gives positive net acceleration.
      target = -clamp(brakePower * MODEL.regenerationShare / MODEL.regenerationGaugeFullScaleW, 0, 1);
    } else if (car.speed > .5 && car.acceleration > .18 && drivePower > 100) {
      if (!data.inCorner && data.assistTime > 0) target = 1;
      else if (data.inCorner && data.postApex) {
        const progress = clamp(data.apexAssistTime / MODEL.apexAssistRampSeconds, 0, 1);
        target = MODEL.apexAssistMaximum * progress * progress * (3 - 2 * progress);
      }
    }
    // Do not leave a charging/using claim after the eligible wheel work ends.
    // The gauge eases into real eligible work; idle is immediately neutral.
    if (!target || battery.flow * target < 0) battery.flow = 0;
    battery.flow += (target - battery.flow) * (1 - Math.exp(-dt / MODEL.flowFilterSeconds));
    battery.mode = target < 0 ? 'charging' : target > 0 ? 'using' : 'idle';
  }

  function update(car, state, dt, input = {}) {
    if (car.finished || car.dnf) return stop(state);
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('telemetry dt must be finite and nonnegative.');
    if (!dt || state.kind === 'electric') return state;
    const data = internal.get(state);
    if (!data) throw new TypeError('Create telemetry with PowertrainTelemetry.create(car).');
    const speed = Math.max(0, finite(car.speed)), drivePower = Math.max(0, finite(input.drivePowerW)), brakePower = Math.max(0, finite(input.brakePowerW));
    const spec = car.spec || {}, radius = data.gearing.effectiveRadiusM;
    const wheelRPM = speed / (2 * Math.PI * radius) * 60;
    data.sinceShift += dt; data.lampBlank = Math.max(0, data.lampBlank - dt);
    let targetRPM;
    if (data.gearCount) {
      const rpmFor = gear => Math.max(data.idle, wheelRPM * data.gearing.totalRatios[gear - 1]);
      const rpm = rpmFor(state.gear), oldGear = state.gear;
      const ratedPower = Math.max(10000, finite(car.powerPs, spec.powerPs || 100) * 735.49875);
      const loadedAcceleration = car.acceleration > .18 && brakePower <= 100 && drivePower > ratedPower * MODEL.loadedDownshiftPowerFraction;
      if (data.sinceShift >= MODEL.minimumShiftIntervalSeconds) {
        if (rpm >= data.shift && state.gear < data.gearCount && brakePower <= 100) state.gear++;
        else if (state.gear > 1 && (loadedAcceleration
          ? rpm < data.shift * MODEL.loadedDownshiftFraction && rpmFor(state.gear - 1) < data.shift * MODEL.loadedPreviousGearCeilingFraction
          : rpm < data.shift * MODEL.downshiftFraction && rpmFor(state.gear - 1) < data.shift * .86)) state.gear--;
      }
      targetRPM = rpmFor(state.gear);
      if (oldGear !== state.gear) {
        data.sinceShift = 0; data.lampBlank = MODEL.shiftLampBlankSeconds;
        data.rpm = clamp(targetRPM, data.idle, data.max);
      }
      state.gearLabel = String(state.gear);
    } else {
      // IVT/unknown gearboxes show their real type or D, never invented steps.
      const ratedPower = Math.max(10000, finite(car.powerPs, spec.powerPs || 100) * 735.49875);
      const load = clamp(drivePower / ratedPower, 0, 1);
      targetRPM = speed < .1 ? data.idle : data.idle + (data.shift - data.idle) * clamp(.08 + speed / 160 + load * .84, .08, 1);
    }
    data.rpm += (clamp(targetRPM, data.idle, data.max) - data.rpm) * (1 - Math.exp(-dt / .055));
    state.rpmNormalized = clamp((data.rpm - data.idle) / (data.shift - data.idle), 0, 1);
    state.shiftLights = data.lampBlank > 0 ? 0 : Math.min(8, Math.ceil(state.rpmNormalized * 8));
    state.shiftCue = !!data.gearCount && state.gear < data.gearCount && data.lampBlank <= 0 && state.rpmNormalized >= .94;
    if (state.battery) {
      updateCorner(data, speed, dt, input.curvature, car.acceleration > .18 && drivePower > 100, brakePower > 100);
      updateBattery(car, state, data, dt, drivePower, brakePower);
    }
    return state;
  }

  const api = Object.freeze({ create, update, stop, describeGearing, gearSpeedAtRPM, MODEL });
  root.PowertrainTelemetry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
