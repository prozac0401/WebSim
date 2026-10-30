'use strict';
// Scorer-only counterexamples. These synthetic kinematic samples are NOT
// physical vehicle simulations or evidence that a stock car can perform them.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Scoring = require('../course-scoring.js');
const DEG = Math.PI / 180;

function replay({ angle = () => 30, metres = 100, opposite = false, zone = false }) {
  const track = { length: 250, sample: () => ({ curvature: 0 }), zones: zone ? [{ s: 2.5, length: 200 }] : [] };
  const links = [{ id: 'synthetic-link', straightStart: 2.5, straightEnd: 200, fromSign: -1, toSign: opposite ? 1 : -1 }];
  const accumulator = new Scoring.Accumulator(track, { links });
  const speed = 20, dt = .02, rows = [];
  let previous = null;
  for (let tick = 0; tick <= Math.round(metres / (speed * dt)); tick++) {
    const distance = tick * speed * dt, beta = angle(distance) * DEG;
    const frame = { time: tick * dt, s: 2.5 + distance, x: distance, y: 0, vx: speed, vy: 0, speed, yaw: -beta, beta, status: 'running' };
    if (previous) rows.push(accumulator.step(frame, previous, { referenceSpeed: speed }));
    previous = frame;
  }
  return { ...accumulator.summary(), resets: rows.filter(r => r.chainReset).length, transitionSamples: rows.filter(r => r.transitioning).length };
}

function audit() {
  const angles = [10, 15, 20, 30, 45, 60];
  const ramp = angles.map(angleDeg => {
    const angleQuality = (Math.sin(angleDeg * DEG) - Math.sin(2 * DEG)) / (Math.sin(70 * DEG) - Math.sin(2 * DEG));
    return { angleDeg, angleQuality, metresUntilDoubleAtFullSpeedQuality: Scoring.CHAIN_METRES / angleQuality,
      hundredMetres: replay({ angle: () => angleDeg }) };
  });
  const transfer = distance => distance <= 20 ? 30 : distance >= 26 ? -30 : 30 - (distance - 20) * 10;
  const sameRoadSigns = replay({ angle: transfer, metres: 46 });
  const oppositeRoadSigns = replay({ angle: transfer, metres: 46, opposite: true });
  const continuous = replay({ metres: 100 });
  const briefNeutral = replay({ metres: 100, angle: s => s >= 50 && s < 50.8 ? 9.9 : 30 });
  const continuousZone = replay({ metres: 100, zone: true });
  assert(sameRoadSigns.resets > 0);
  assert.equal(oppositeRoadSigns.resets, 0);
  assert(oppositeRoadSigns.transitionSamples > 0);
  assert(oppositeRoadSigns.score > sameRoadSigns.score);
  assert(briefNeutral.resets > continuous.resets);
  assert(briefNeutral.score < continuous.score);
  assert(Math.abs(continuousZone.score - 2 * continuous.score) < 1e-8);
  const source = fs.readFileSync(path.join(__dirname, '..', 'course-scoring.js'));
  return { schema: 1, kind: 'synthetic-scorer-audit', scope: 'No physical vehicle evaluation; same 20 m/s kinematic trace, production Accumulator, unchanged score rules.',
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    chainRamp: ramp,
    metadataOnlyTransitionComparison: { description: 'Identical +30 to -30 degree transition over 6 m / 0.3 s. Only the road link destination sign changes.', sameRoadSigns, oppositeRoadSigns },
    sameSignNeutralDrop: { description: 'A 0.04 s / 0.8 m dip to 9.9 degrees breaks the same-sign chain; this is a classifier check, not evidence that grace should apply to all interruptions.', continuous, briefNeutral },
    zoneDouble: { outsideScore: continuous.score, zoneScore: continuousZone.score, exactDouble: true },
    assertionsPassed: 7 };
}

if (require.main === module) {
  const report = audit();
  if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
module.exports = { audit, replay };
