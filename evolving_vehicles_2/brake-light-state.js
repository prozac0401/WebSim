/* Display-only brake-light response. Input is applied service-brake force,
 * not vehicle deceleration: hills, drag and coasting do not operate the lamps.
 * Call once per physics tick for every car, independently of camera visibility. */
(function (root) {
  'use strict';
  const MODEL = Object.freeze({ onDecelerationMps2: .10, offDecelerationMps2: .03,
    releaseHoldSeconds: .18, attackSeconds: .035, releaseSeconds: .07,
    invisibleIntensity: .001 });

  function create() { return { on: false, intensity: 0, releaseSeconds: 0 }; }
  const approach = (value, target, seconds, duration) =>
    target + (value - target) * Math.exp(-duration / seconds);

  function update(state, dt, input = {}) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Brake-light dt must be finite and nonnegative.');
    if (input.finished || input.dnf) {
      state.on = false; state.intensity = 0; state.releaseSeconds = 0;
      return state;
    }
    if (dt === 0) return state;
    const force = Number.isFinite(input.brakeForceN) ? Math.max(0, input.brakeForceN) : 0;
    const deceleration = Number.isFinite(input.massKg) && input.massKg > 0 ? force / input.massKg : 0;
    if (deceleration >= MODEL.onDecelerationMps2 || state.on && deceleration >= MODEL.offDecelerationMps2) {
      state.on = true; state.releaseSeconds = 0;
      state.intensity = approach(state.intensity, 1, MODEL.attackSeconds, dt);
    } else if (state.on) {
      // Integrate both portions when this tick crosses the hold boundary.
      // A single large tick and several small ticks then have the same fade.
      const held = Math.min(dt, Math.max(0, MODEL.releaseHoldSeconds - state.releaseSeconds));
      state.intensity = approach(state.intensity, 1, MODEL.attackSeconds, held);
      state.releaseSeconds = Math.min(MODEL.releaseHoldSeconds, state.releaseSeconds + dt);
      if (state.releaseSeconds + 1e-12 >= MODEL.releaseHoldSeconds) {
        state.on = false; state.releaseSeconds = 0;
        state.intensity = approach(state.intensity, 0, MODEL.releaseSeconds, dt - held);
      }
    } else {
      state.releaseSeconds = 0;
      state.intensity = approach(state.intensity, 0, MODEL.releaseSeconds, dt);
    }
    if (!state.on && state.intensity <= MODEL.invisibleIntensity) state.intensity = 0;
    return state;
  }

  // `on` is the held switch state; intensity also contains its release fade.
  // Render intensity rather than suppressing the effect immediately at !on.
  const api = Object.freeze({ create, update, MODEL });
  root.BrakeLightState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
