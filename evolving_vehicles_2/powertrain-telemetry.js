/* Display-only drivetrain telemetry. Nothing returned here feeds vehicle
 * forces, speed limits, tuning scores or lap timing. Source-backed gearbox
 * types/counts live in powertrain-profiles.js; RPM, ratios, shift scheduling
 * and hybrid energy sharing below are presentation estimates, not OBD data.
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
    cornerFilterSeconds: .16,
    cornerEnterCurvature: .0028,
    cornerExitCurvature: .0016,
    cornerEnterLateralAcceleration: 1.6,
    cornerExitLateralAcceleration: .9,
    cornerEnterHoldSeconds: .18,
    cornerExitHoldSeconds: .22,
    cornerExitAssistSeconds: 4,
    regenerationShare: .55,
    regenerationGaugeFullScaleW: 35000,
    assistShare: .25,
    assistGaugeFullScaleW: 30000,
    flowFilterSeconds: .16,
    limitations: 'Estimated power-flow direction and relative intensity only; no SOC, battery capacity, measured motor power or real gearbox control.'
  });

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
      battery: kind === 'hybrid' ? { flow: 0, mode: 'idle' } : null };
    const idle = Math.max(500, finite(profile.idleRPM, 900)), shift = Math.max(idle + 1000, finite(profile.shiftRPM, 6000));
    internal.set(state, { profile, gearCount, idle, shift, max: Math.max(shift, finite(profile.maxRPM, 7000)),
      ratioStep: clamp(finite(profile.ratioStep, .75), .5, .92), reduction: Math.max(1, finite(profile.total1stReduction, 13.5)),
      rpm: idle, sinceShift: MODEL.minimumShiftIntervalSeconds, lampBlank: 0,
      curvature: 0, lateral: 0, inCorner: false, enterTime: 0, exitTime: 0, assistTime: 0 });
    if (car.finished || car.dnf) stop(state);
    return state;
  }

  function stop(state) {
    state.gear = null; state.gearLabel = '—'; state.rpmNormalized = 0;
    state.shiftLights = 0; state.shiftCue = false;
    if (state.battery) { state.battery.flow = 0; state.battery.mode = 'idle'; }
    const data = internal.get(state);
    if (data) { data.assistTime = 0; data.lampBlank = 0; }
    return state;
  }

  function updateCorner(data, speed, dt, curvature) {
    const amount = 1 - Math.exp(-dt / MODEL.cornerFilterSeconds), magnitude = Math.abs(finite(curvature));
    data.curvature += (magnitude - data.curvature) * amount;
    data.lateral += (magnitude * speed * speed - data.lateral) * amount;
    data.assistTime = Math.max(0, data.assistTime - dt);
    const entering = speed > 3 && (data.curvature > MODEL.cornerEnterCurvature || data.lateral > MODEL.cornerEnterLateralAcceleration);
    const leaving = data.curvature < MODEL.cornerExitCurvature && data.lateral < MODEL.cornerExitLateralAcceleration;
    if (!data.inCorner) {
      data.enterTime = entering ? data.enterTime + dt : 0;
      if (data.enterTime >= MODEL.cornerEnterHoldSeconds) {
        data.inCorner = true; data.assistTime = 0; data.enterTime = 0; data.exitTime = 0;
      }
    } else {
      data.exitTime = leaving ? data.exitTime + dt : 0;
      if (data.exitTime >= MODEL.cornerExitHoldSeconds) {
        data.inCorner = false; data.assistTime = MODEL.cornerExitAssistSeconds; data.exitTime = 0;
      }
    }
  }

  function updateBattery(car, state, data, dt, drivePower, brakePower) {
    let target = 0;
    if (car.speed > .5 && car.acceleration < -.1 && brakePower > 100) {
      target = -clamp(brakePower * MODEL.regenerationShare / MODEL.regenerationGaugeFullScaleW, 0, 1);
    } else if (!data.inCorner && data.assistTime > 0 && car.speed > .5 && car.acceleration > .18 && drivePower > 100 && brakePower <= 100) {
      target = clamp(drivePower * MODEL.assistShare / MODEL.assistGaugeFullScaleW, 0, 1);
    }
    const battery = state.battery;
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
    const spec = car.spec || {}, radius = Math.max(.15, finite(spec.factoryDrive === 'rwd' ? spec.rearTireRadiusMm : spec.frontTireRadiusMm, 320) / 1000);
    const wheelRPM = speed / (2 * Math.PI * radius) * 60;
    data.sinceShift += dt; data.lampBlank = Math.max(0, data.lampBlank - dt);
    let targetRPM;
    if (data.gearCount) {
      const rpmFor = gear => Math.max(data.idle, wheelRPM * data.reduction * Math.pow(data.ratioStep, gear - 1));
      const rpm = rpmFor(state.gear), oldGear = state.gear;
      if (data.sinceShift >= MODEL.minimumShiftIntervalSeconds) {
        if (rpm >= data.shift && state.gear < data.gearCount && brakePower <= 100) state.gear++;
        else if (state.gear > 1 && rpm < data.shift * MODEL.downshiftFraction && rpmFor(state.gear - 1) < data.shift * .86) state.gear--;
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
      updateCorner(data, speed, dt, input.curvature);
      updateBattery(car, state, data, dt, drivePower, brakePower);
    }
    return state;
  }

  const api = Object.freeze({ create, update, stop, MODEL });
  root.PowertrainTelemetry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
