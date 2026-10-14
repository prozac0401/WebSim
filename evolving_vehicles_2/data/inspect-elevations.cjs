'use strict';
const TrackRace = require('../race-engine.js');
const circuits = require('../circuits.js');
for (const circuit of circuits) {
  const track = TrackRace.buildTrack(circuit);
  console.log(JSON.stringify({ id: circuit.id, points: circuit.coordinates.length, hasElevation: track.hasElevation,
    min: +track.elevationMin.toFixed(2), max: +track.elevationMax.toFixed(2), gain: +track.elevationGainM.toFixed(2),
    gradeMinPercent: +(100 * Math.min(...track.points.map(p => p.grade))).toFixed(2), gradeMaxPercent: +(100 * Math.max(...track.points.map(p => p.grade))).toFixed(2) }));
  if (process.argv.includes('--windows')) {
    const original = track.points.map(p => p.rawZ ?? p.z), size = original.length, wrap = i => (i + size * 2) % size;
    for (const sigma of [30, 45, 60, 90]) {
      const radius = Math.ceil(sigma * 3 / track.spacing);
      const smoothed = original.map((_, i) => {
        let sum = 0, weight = 0;
        for (let k = -radius; k <= radius; k++) { const w = Math.exp(-.5 * (k * track.spacing / sigma) ** 2); sum += original[wrap(i + k)] * w; weight += w; }
        return sum / weight;
      });
      const span = Math.round(10 / track.spacing), grades = smoothed.map((_, i) => (smoothed[wrap(i + span)] - smoothed[wrap(i - span)]) / (2 * span * track.spacing));
      console.log(`  Gaussian sigma ${sigma}m: grade ${(100 * Math.min(...grades)).toFixed(1)}..${(100 * Math.max(...grades)).toFixed(1)}%; z ${Math.min(...smoothed).toFixed(1)}..${Math.max(...smoothed).toFixed(1)}`);
    }
  }
}
