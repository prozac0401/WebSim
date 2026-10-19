/* Taebaek's coarse DSM puts a 23% climb inside the first tight corner.
 * This is an explicit simulated road regrading, not surveyed road elevation.
 * Move part of that climb onto the long approach, preserving its total rise,
 * the original DEM, planar route, extrema and the remainder of the lap.
 */
(function (root) {
  'use strict';
  const LENGTH = 2322, FRACTION = .85;
  const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * t * (10 + t * (-15 + 6 * t)); };
  function eligible(circuit) {
    return circuit?.id === 'taebaek' && circuit.sourceProfile === 'openstreetmap' && circuit.lengthM === LENGTH &&
      circuit.sourceUrl === 'https://www.openstreetmap.org/way/240211101' && circuit.elevationResolutionM === 90 &&
      circuit.coordinates?.[0]?.[0] === 129.0182351 && circuit.coordinates?.[0]?.[1] === 37.0827744 &&
      circuit.coordinates?.[1]?.[0] === 129.0175894 && circuit.coordinates?.[1]?.[1] === 37.082687475;
  }
  function apply(circuit, points, spacing) {
    if (!eligible(circuit) || !Array.isArray(points) || points.length < 128 || !Number.isFinite(spacing) || spacing <= 0 ||
        Math.abs(points.length * spacing - LENGTH) > .001 || !points.every(p => Number.isFinite(p.z))) return null;
    const before = points.map(p => p.z), removed = [], distribution = [];
    let movedRiseM = 0, totalWeight = 0;
    for (let i = 0; i < points.length; i++) {
      const s = (i + .5) * spacing, rise = before[(i + 1) % points.length] - before[i];
      // C2 transitions: ease into a flatter 500–590 m corner, then recover
      // the existing grade by 680 m, before the original summit.
      const reduction = ease((s - 400) / 100) * (1 - ease((s - 590) / 90));
      removed[i] = Math.max(0, rise) * reduction * FRACTION;
      // A nonnegative C2 density spreads exactly the removed rise over the
      // 430 m approach after the unchanged 50 m standing-start transition.
      // Its first two derivatives vanish at both boundaries.
      const u = Math.max(0, Math.min(1, (s - 50) / 430));
      distribution[i] = (u * (1 - u)) ** 3;
      movedRiseM += removed[i]; totalWeight += distribution[i];
    }
    if (movedRiseM <= 0 || totalWeight <= 0) return null;
    let adjustment = 0, maximumAdjustmentM = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]; p.demZ = before[i];
      // Exact unchanged tail, rather than carrying floating-point integration
      // residue around the lap. The first sample is also unchanged.
      p.z = i * spacing >= 680 ? before[i] : before[i] + adjustment;
      maximumAdjustmentM = Math.max(maximumAdjustmentM, Math.abs(p.z - before[i]));
      adjustment += movedRiseM * distribution[i] / totalWeight - removed[i];
    }
    return { kind: 'simulation-adjustment', method: 'c2-grade-redistribution',
      source: 'Taebaek simulated regrading of the filtered Copernicus DEM GLO-90',
      // Regrading must not lower the six-way display fit used by the former
      // steep per-car path and reintroduce horizontal steering pulses.
      minimumDisplaySubdivisions: 6,
      approachStartM: 50, approachEndM: 480, transitionStartM: 400, cornerStartM: 500, cornerEndM: 590,
      transitionEndM: 680, removedRiseFraction: FRACTION, movedRiseM, maximumAdjustmentM };
  }
  const api = { eligible, apply };
  root.TaebaekElevationProfile = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
