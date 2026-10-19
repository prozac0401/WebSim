'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DrivingPose = require('./driving-pose.js');
const TrackRace = require('./race-engine.js');
const Evolution = require('./tuning-evolution.js');
const circuits = require('./circuits.js');
const races = circuits.map(circuit => new TrackRace({ circuit, vehicleIds: ['g80'], racingLine: true, laps: 1 }));
const turn = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);

// Frozen planar recipe from deployed e778fbb. Its frame-scale angle test passed
// while a long corner still alternated between weak and strong turning. Keep
// this baseline independent of the new fit so that regressions cannot be hidden
// by changing a metadata label or by testing only mathematical continuity.
function deployedCurvature(race) {
  const subdivisions = DrivingPose.info(race).subdivisions, n = race.pathPoints.length * subdivisions;
  const spacing = race.track.length / n, wrap = i => (i % n + n) % n;
  const original = Array.from({length:n},(_,i) => {
    const index = Math.floor(i/subdivisions), t = i/subdivisions-index;
    const a = race.pathPoints[index], b = race.pathPoints[(index+1)%race.pathPoints.length];
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  });
  const rounding = Math.max(...original.map((p,i)=>Math.hypot(original[wrap(i-1)].x-2*p.x+original[wrap(i+1)].x,original[wrap(i-1)].y-2*p.y+original[wrap(i+1)].y)/6));
  const limit = Math.max(0,Math.min(.24,.4-rounding-.01)), radius = Math.min(Math.ceil(18/spacing),Math.floor((n-1)/2));
  const weights = Array.from({length:radius*2+1},(_,j)=>Math.exp(-.5*((j-radius)*spacing/6)**2)), total = weights.reduce((a,b)=>a+b,0);
  const controls = original.map((p,i)=>{
    let dx=0,dy=0;
    weights.forEach((w,j)=>{const q=original[wrap(i+j-radius)];dx+=w*q.x;dy+=w*q.y;});
    dx=dx/total-p.x;dy=dy/total-p.y;
    const gain=Math.min(1,limit/Math.max(Math.hypot(dx,dy),1e-12));
    return {x:p.x+dx*gain,y:p.y+dy*gain};
  });
  return distance=>{
    const u=((distance%race.track.length+race.track.length)%race.track.length)/spacing,i=Math.floor(u),t=u-i;
    const first=[-.5*(1-t)**2,1.5*t*t-2*t,-1.5*t*t+t+.5,.5*t*t],second=[1-t,3*t-2,1-3*t,t];
    let dx=0,dy=0,ddx=0,ddy=0;
    for(let j=0;j<4;j++){const p=controls[wrap(i+j-1)];dx+=first[j]*p.x;dy+=first[j]*p.y;ddx+=second[j]*p.x;ddy+=second[j]*p.y;}
    return (dx*ddy-dy*ddx)/Math.hypot(dx,dy)**3;
  };
}

test('all 11 course curves remain continuously bounded within 40 cm of the original scoring path', () => {
  assert.equal(races.length, 11);
  for (const race of races) {
    const info = DrivingPose.info(race);
    assert.ok(info.deviationBoundM <= .4, race.circuit.id + ': continuous Bezier bound');
    assert.equal(info.maximumElevationDeviationM, .025);
    assert.ok(info.elevationDeviationBoundM <= .025, race.circuit.id + ': continuous vertical Bezier bound');
    for (let i = 0; i < race.pathPoints.length * 8; i++) {
      const s = race.track.length * i / (race.pathPoints.length * 8), raw = race.sample(s), pose = DrivingPose.sample(race, s);
      assert.ok(Math.hypot(raw.x - pose.x, raw.y - pose.y) <= info.deviationBoundM + 1e-8, race.circuit.id + ': interior deviation');
      assert.ok(Math.abs(raw.elevation - pose.elevation) <= info.elevationDeviationBoundM + 1e-8, race.circuit.id + ': height deviation');
      for (const key of ['x', 'y', 'z', 'angle', 'grade', 'curvature']) assert.ok(Number.isFinite(pose[key]), race.circuit.id + ': ' + key);
    }
  }
});

test('position, heading, grade and curvature stay continuous at every knot and the lap seam', () => {
  const epsilon = 1e-5;
  for (const race of races) {
    const knots = race.pathPoints.length * DrivingPose.info(race).subdivisions;
    for (let i = 0; i < knots; i++) {
      const s = race.track.length * i / knots, a = DrivingPose.sample(race, s - epsilon), b = DrivingPose.sample(race, s + epsilon);
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < .0001, race.circuit.id + ': position knot ' + i);
      assert.ok(Math.abs(turn(b.angle - a.angle)) < .0001, race.circuit.id + ': heading knot ' + i);
      assert.ok(Math.abs(b.grade - a.grade) < .00001, race.circuit.id + ': grade knot ' + i);
      assert.ok(Math.abs(b.curvature - a.curvature) < .00002, race.circuit.id + ': curvature knot ' + i);
    }
    const a = DrivingPose.sample(race, 0), b = DrivingPose.sample(race, race.track.length);
    assert.deepEqual(a, b, race.circuit.id + ': exact timing-line periodicity');
  }
});

test('rendered direction, pitch and curvature describe the same actual 3D curve', () => {
  const h = .001;
  for (const race of races) for (let i = 0; i < 160; i++) {
    const s = race.track.length * (i + .31) / 160, a = DrivingPose.sample(race, s - h), p = DrivingPose.sample(race, s), b = DrivingPose.sample(race, s + h);
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(run > .0008 && run < .0025, race.circuit.id + ': nonzero, bounded forward motion');
    assert.ok(Math.abs(turn(Math.atan2(b.y - a.y, b.x - a.x) - p.angle)) < .00003, race.circuit.id + ': tangent alignment');
    assert.ok(Math.abs((b.z - a.z) / run - p.grade) < .00001, race.circuit.id + ': analytic grade');
    assert.ok(Math.abs(turn(b.angle - a.angle) / run - p.curvature) < .00005, race.circuit.id + ': analytic curvature');
  }
});

test('gentle-corner heading jitter drops on every real course without a delayed car heading', t => {
  const reports = [];
  for (const race of races) {
    const rawJerk = [], smoothJerk = [], rawSteps = [], smoothSteps = [];
    let older = null, previous = null;
    // 0.5 m corresponds to one 60 Hz frame at 108 km/h. Inspect consecutive
    // real gentle-corner samples, excluding straight/corner category changes.
    for (let s = 0; s < race.track.length; s += .5) {
      const raw = race.sample(s), pose = DrivingPose.sample(race, s);
      const current = { raw, pose, gentle: Math.abs(raw.curvature) > .0003 && Math.abs(raw.curvature) < .006 };
      if (older?.gentle && previous?.gentle && current.gentle) {
        const oldRawTurn = turn(previous.raw.angle - older.raw.angle), rawTurn = turn(raw.angle - previous.raw.angle);
        const oldSmoothTurn = turn(previous.pose.angle - older.pose.angle), smoothTurn = turn(pose.angle - previous.pose.angle);
        rawJerk.push(rawTurn - oldRawTurn); smoothJerk.push(smoothTurn - oldSmoothTurn);
        rawSteps.push(Math.abs(rawTurn)); smoothSteps.push(Math.abs(smoothTurn));
      }
      older = previous; previous = current;
    }
    assert.ok(rawJerk.length > 200, race.circuit.id + ': enough actual gentle-corner samples');
    const ratio = rms(smoothJerk) / rms(rawJerk);
    assert.ok(ratio < .15, race.circuit.id + ': angular second-difference RMS reduction, got ' + ratio);
    assert.ok(Math.max(...smoothSteps) < Math.max(...rawSteps) * .3, race.circuit.id + ': eliminate segment heading snaps');
    reports.push({ id: race.circuit.id, angularJitterRatio: +ratio.toFixed(4), maximumRawDegreesPerHalfMetre: +(Math.max(...rawSteps) * 180 / Math.PI).toFixed(3), maximumSmoothDegreesPerHalfMetre: +(Math.max(...smoothSteps) * 180 / Math.PI).toFixed(3) });
  }
  t.diagnostic(JSON.stringify(reports));
});

test('Everland long gentle corner no longer repeats weak-turn/strong-turn phases every 20–40 metres',t=>{
  const race=races.find(r=>r.circuit.id==='everland'),before=deployedCurvature(race),old=[],next=[];
  for(let s=2530;s<=2600;s++){old.push(-before(s));next.push(-DrivingPose.sample(race,s).curvature);}
  const cv=k=>{const mean=k.reduce((a,b)=>a+b,0)/k.length;return rms(k.map(v=>v-mean))/mean;};
  const oldCV=cv(old),newCV=cv(next);
  assert.ok(oldCV>.3,'the captured baseline must reproduce the reported long-corner problem');
  assert.ok(newCV<.05&&newCV<oldCV*.15,'turn-rate variation remains below 5%, not merely C2 at knots');
  assert.ok(Math.min(...next)>.0037&&Math.max(...next)<.0043,'a sustained ~250 m radius bend must not straighten or reverse');
  const phases=k=>{const mean=k.reduce((a,b)=>a+b,0)/k.length;let state=0,cycles=0;for(const value of k){if(value>mean*1.35)state=1;else if(value<mean*.65&&state){cycles++;state=0;}}return cycles;};
  assert.ok(phases(old)>=2,'baseline contains repeated turns and apparent straights');assert.equal(phases(next),0);
  t.diagnostic(JSON.stringify({distanceM:[2530,2600],beforeCV:oldCV,afterCV:newCV,beforeCycles:phases(old),afterCycles:phases(next)}));
});

test('20–40 metre curvature ripple decreases against the deployed algorithm on every real track',t=>{
  const reports=[];
  for(const race of races){
    const before=deployedCurvature(race),n=Math.floor(race.track.length/2),wrap=i=>(i%n+n)%n;
    const old=Array.from({length:n},(_,i)=>before(i*2)),next=Array.from({length:n},(_,i)=>DrivingPose.sample(race,i*2).curvature);
    const average=(values,i,radius)=>{let sum=0;for(let j=-radius;j<=radius;j++)sum+=values[wrap(i+j)];return sum/(radius*2+1);};
    const oldResidual=[],newResidual=[];
    for(let i=0;i<n;i++){
      // Select the same physical bends for both algorithms with the baseline's
      // 82 m turn average, then measure the faster 42 m curvature modulation.
      const bend=Math.abs(average(old,i,20));if(bend<.0008||bend>.007)continue;
      oldResidual.push(old[i]-average(old,i,10));newResidual.push(next[i]-average(next,i,10));
    }
    assert.ok(oldResidual.length>100,race.circuit.id+': actual gentle bends');
    const ratio=rms(newResidual)/rms(oldResidual);
    assert.ok(ratio<.8,race.circuit.id+': reduce metre-scale ripple, ratio '+ratio);
    reports.push({id:race.circuit.id,curvatureRippleRatio:+ratio.toFixed(4)});
  }
  t.diagnostic(JSON.stringify(reports));
});

test('real tight turns do not revert to polygon straight/turn pulses when the broad fit is constrained', t => {
  // Captured from the previously deployed 10/14/18 m display curve, at 1 m
  // intervals across these actual 30 m bends. These are observations, not a
  // second copy of the smoothing implementation. HMG is already smooth.
  const corners = [
    ['everland', 3860, .0183310921], ['inje', 220, .0169699715],
    ['yeongam', 3670, .0527022680], ['yeongam-permanent', 145, .0294269862],
    ['taebaek', 540, .1326872191], ['bmw-incheon', 2385, .0520927022],
    ['hmg-taean', 1940, .0009815806], ['pocheon', 2730, .2136115208],
    ['monza', 655, .0190096538], ['silverstone', 4055, .0144931552],
    ['spa', 240, .0457075695]
  ];
  const reports = [];
  for (const [id, center, before] of corners) {
    const race = races.find(r => r.circuit.id === id);
    const k = Array.from({ length: 31 }, (_, i) => DrivingPose.sample(race, center - 15 + i).curvature);
    const change = rms(k.slice(1).map((v, i) => v - k[i])), ratio = change / before;
    assert.ok(ratio < (id === 'hmg-taean' ? 1.05 : .4), id + ': tight-corner curvature ripple ratio ' + ratio);
    const sign = Math.sign(k.reduce((a, b) => a + b));
    assert.ok(k.every(v => v * sign > 0), id + ': preserve the actual bend direction');
    reports.push({ id, distanceM: center, curvatureRippleRatio: +ratio.toFixed(4) });
  }
  t.diagnostic(JSON.stringify(reports));
});

test('tight-turn car poses keep the same forward tangent at 1x, 2x and 3x playback', () => {
  const patterns = [[1 / 30], [1 / 60], [1 / 120, 1 / 45, 1 / 80, 1 / 28]];
  for (const [id, center] of [['everland', 3860], ['yeongam', 3670], ['pocheon', 2730], ['spa', 240]]) {
    const race = races.find(r => r.circuit.id === id);
    for (const playback of [1, 2, 3]) for (const pattern of patterns) {
      let elapsed = 0, frame = 0;
      while (elapsed * 12 * playback < 60) {
        elapsed += pattern[frame++ % pattern.length];
        const s = center - 30 + elapsed * 12 * playback, pose = DrivingPose.sample(race, s);
        const a = DrivingPose.sample(race, s - .001), b = DrivingPose.sample(race, s + .001);
        assert.ok(Math.abs(turn(pose.angle - Math.atan2(b.y - a.y, b.x - a.x))) < .00003,
          id + ': accelerated playback cannot make the body turn separately from its position');
        assert.deepEqual(DrivingPose.sample(race, s), pose, 'render cadence has no state or orientation lag');
      }
    }
  }
});

// These are the actual selected per-car paths used by the default experiment,
// not race.pathPoints. The wide-apex candidate exposes ripple that the older
// shared-line tests missed. Baseline observations are from release d42360e.
const actualCorners = [
  { id: 'taebaek', from: 480, to: 580, baseline: { curvatureChangeRMS: .006561157266694763,
    curvatureChangePeak: .021573288173363743, headingSecondRMS: .006252073980055596, turn: 2.574143871921378 } },
  { id: 'spa', from: 180, to: 300, baseline: { curvatureChangeRMS: .004344294479978085,
    curvatureChangePeak: .0148099547737717, headingSecondRMS: .004071264754978155, turn: 2.457237845503372 } }
].map(corner => {
  const race = new TrackRace({ circuit: circuits.find(c => c.id === corner.id), laps: 1,
    entrants: Evolution.createPopulation({ vehicleId: 'supra', count: 8, seed: 31415, budget: 30 }).slice(0, 1) });
  return { ...corner, race, car: race.cars[0] };
});

test('the actual Taebaek wide-apex car reduces repeated steering pulses without straightening the hairpin', t => {
  const { race, car, from, to, baseline } = actualCorners[0];
  assert.equal(car.racingLine.id, 'scale-1.5-apex-0');
  const poses = Array.from({ length: to - from + 1 }, (_, i) => DrivingPose.sampleCar(race, car, from + i));
  const change = poses.slice(1).map((p, i) => p.curvature - poses[i].curvature);
  const heading = poses.slice(1).map((p, i) => turn(p.angle - poses[i].angle));
  const second = heading.slice(1).map((value, i) => value - heading[i]);
  assert.ok(rms(change) < baseline.curvatureChangeRMS * .55, 'reduce metre-scale turn-rate pulses by at least 45%');
  assert.ok(Math.max(...change.map(Math.abs)) < baseline.curvatureChangePeak * .6, 'also reduce the worst steering pulse');
  assert.ok(rms(second) < baseline.headingSecondRMS * .55, 'the body heading itself benefits, not just metadata');
  assert.ok(Math.min(...poses.map(p => p.curvature)) > .005, 'do not alternate into an apparent straight within the bend');
  assert.ok(Math.abs(turn(poses.at(-1).angle - poses[0].angle) - baseline.turn) < Math.PI / 180,
    'retain the measured entry-to-exit turn within one degree');
  t.diagnostic(JSON.stringify({ id: 'taebaek', curvatureChangeRMS: rms(change), baseline: baseline.curvatureChangeRMS,
    headingSecondRMS: rms(second), deviationBoundM: DrivingPose.info(race, car).deviationBoundM }));
});

test('Taebaek regrading preserves the established racing-line XY fit without refining the road centreline', () => {
  const { race, car } = actualCorners[0];
  const before = new TrackRace({ circuit: { ...race.circuit, id: 'taebaek-dem-curve-reference' }, laps: 1,
    entrants: Evolution.createPopulation({ vehicleId: 'supra', count: 8, seed: 31415, budget: 30 }).slice(0, 1) });
  const oldCar = before.cars[0], info = DrivingPose.info(race, car);
  assert.equal(car.racingLine.id, oldCar.racingLine.id);
  assert.equal(info.minimumDisplaySubdivisions, 6);
  assert.equal(info.subdivisions, DrivingPose.info(before, oldCar).subdivisions);
  assert.ok(info.deviationBoundM <= .4 && info.elevationDeviationBoundM <= .025);
  let heightChange = 0;
  for (let s = 0; s < car.trackLength; s += 2) {
    const now = DrivingPose.sampleCar(race, car, s), old = DrivingPose.sampleCar(before, oldCar, s);
    for (const key of ['x', 'y', 'angle', 'curvature']) assert.equal(now[key], old[key], key + ' at ' + s);
    heightChange = Math.max(heightChange, Math.abs(now.z - old.z));
  }
  assert.ok(heightChange > 30, 'the comparison includes the actually regraded hill');
  const centre = { pathPoints: race.track.points, track: race.track };
  const oldCentre = { pathPoints: before.track.points, track: before.track };
  assert.equal(DrivingPose.info(centre).minimumDisplaySubdivisions, 2);
  assert.equal(DrivingPose.info(centre).subdivisions, DrivingPose.info(oldCentre).subdivisions);
  for (let s = 0; s < race.track.centerlineLength; s += 5) {
    const now = DrivingPose.sample(centre, s), old = DrivingPose.sample(oldCentre, s);
    for (const key of ['x', 'y', 'angle', 'curvature']) assert.equal(now[key], old[key], 'road ' + key + ' at ' + s);
  }
});

test('Spa first hairpin retains its tight arc instead of being widened by a stronger smoothing filter', () => {
  const { race, car, from, to, baseline } = actualCorners[1];
  const poses = Array.from({ length: to - from + 1 }, (_, i) => DrivingPose.sampleCar(race, car, from + i));
  const change = poses.slice(1).map((p, i) => p.curvature - poses[i].curvature);
  assert.ok(rms(change) <= baseline.curvatureChangeRMS * 1.01, 'no added short-scale curvature variation');
  const peak = Math.max(...poses.map(p => p.curvature));
  assert.ok(peak > .11 && peak < .14, 'preserve the existing hairpin radius');
  assert.ok(Math.abs(turn(poses.at(-1).angle - poses[0].angle) - baseline.turn) < Math.PI / 180);
});

test('actual hairpin car and guide remain within the scoring bound and the shared C2 asphalt ribbon', t => {
  const reports = [];
  for (const { id, race, car, from, to } of actualCorners) {
    // CircuitRoad uses this same display-only centerline contract. Dense one
    // metre chords approximate its C2 ribbon, including the road's own rounding.
    const road = { pathPoints: race.track.points, track: { ...race.track, length: race.track.centerlineLength } };
    const center = Array.from({ length: Math.ceil(race.track.centerlineLength) }, (_, i) =>
      DrivingPose.sample(road, i * race.track.centerlineLength / Math.ceil(race.track.centerlineLength)));
    const nearest = p => {
      let distance = Infinity;
      for (let i = 0; i < center.length; i++) {
        const a = center[i], b = center[(i + 1) % center.length], dx = b.x - a.x, dy = b.y - a.y;
        const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
        distance = Math.min(distance, Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy));
      }
      return distance;
    };
    let clearance = Infinity, maximumDeviation = 0;
    const info = DrivingPose.info(race, car);
    assert.ok(info.deviationBoundM <= .4); assert.ok(info.elevationDeviationBoundM <= .025);
    for (let s = from; s <= to; s += .5) {
      const p = DrivingPose.sampleCar(race, car, s), raw = race.sampleForCar(car, s);
      maximumDeviation = Math.max(maximumDeviation, Math.hypot(p.x - raw.x, p.y - raw.y));
      assert.ok(maximumDeviation <= info.deviationBoundM + 1e-8, id + ': source-path bound');
      assert.ok(Math.abs(p.z - raw.elevation) <= info.elevationDeviationBoundM + 1e-8, id + ': road contact');
      clearance = Math.min(clearance, race.track.width / 2 - nearest(p) - car.spec.widthMm / 2000);
      const a = DrivingPose.sampleCar(race, car, s - .001), b = DrivingPose.sampleCar(race, car, s + .001);
      assert.ok(Math.abs(turn(p.angle - Math.atan2(b.y - a.y, b.x - a.x))) < .00003, id + ': analytic body/guide tangent');
    }
    assert.ok(clearance > .1, id + ': actual body width remains inside the displayed asphalt');
    const guide = DrivingPose.pathCar(race, car);
    for (const p of guide.filter(p => p.s >= from && p.s <= to)) assert.deepEqual(p, DrivingPose.sampleCar(race, car, p.s));
    reports.push({ id, maximumDeviationM: maximumDeviation, minimumBodyClearanceM: clearance });
  }
  t.diagnostic(JSON.stringify(reports));
});

test('the line drawing and every car use identical, deterministic, stateless samples', () => {
  for (const race of races) {
    const points = DrivingPose.path(race);
    assert.equal(DrivingPose.path(race), points, 'cached path avoids live reconstruction');
    assert.ok(Object.isFrozen(points) && Object.isFrozen(points[0]));
    for (let i = 0; i < points.length; i += 23) {
      assert.deepEqual(DrivingPose.sample(race, points[i].s), points[i], race.circuit.id + ': line/vehicle alignment');
      const repeated = DrivingPose.sample(race, points[i].s + race.track.length * 3);
      assert.ok(Math.hypot(points[i].x - repeated.x, points[i].y - repeated.y) < 1e-9, 'multiple lap wrap');
      DrivingPose.sample(race, points[i].s - 173.8);
      assert.deepEqual(DrivingPose.sample(race, points[i].s), points[i], 'sampling order has no state or lag');
    }
  }
});

test('display sampling cannot alter physical speeds, positions, scores or source geometry', () => {
  const opts = { circuit: circuits[0], vehicleIds: ['g80'], racingLine: true, laps: 1 };
  const observed = new TrackRace(opts), control = new TrackRace(opts), original = JSON.stringify(observed.pathPoints);
  for (let i = 0; i < 30 && !observed.finished; i++) {
    observed.step(15); control.step(15);
    DrivingPose.sample(observed, observed.cars[0].distance); DrivingPose.sample(observed, observed.cars[0].distance + 20); DrivingPose.path(observed);
    DrivingPose.sampleCar(observed, { ...observed.cars[0], standingStartDistance: 0 });
  }
  assert.ok(observed.finished && control.finished, 'complete a physical lap');
  assert.deepEqual(observed.cars, control.cars, 'race outcomes remain bit-for-bit equal');
  assert.equal(JSON.stringify(observed.pathPoints), original, 'source racing line is untouched');
  assert.equal(observed.time, control.time);
});

test('standing starts are exactly centered and face the painted start line on every course', () => {
  for (const race of races) {
    const car = { distance: 0, standingStartDistance: 0 }, before = JSON.stringify(car);
    const a = race.track.points[0], b = race.track.points[1], pose = DrivingPose.sampleCar(race, car);
    assert.equal(pose.x, a.x, race.circuit.id + ': lane center X');
    assert.equal(pose.y, a.y, race.circuit.id + ': lane center Y');
    assert.equal(pose.z, a.z, race.circuit.id + ': road height');
    assert.ok(Math.abs(turn(pose.angle - Math.atan2(b.y - a.y, b.x - a.x))) < 1e-14, 'painted line forward direction');
    assert.equal(pose.curvature, 0, 'wheels begin straight');
    assert.equal(DrivingPose.startBlend(car), 0, 'camera begins with the exact car tangent');
    const behind = DrivingPose.sampleCar(race, car, -24);
    assert.ok(Math.abs(turn(behind.angle - pose.angle)) < 1e-14, 'camera behind uses the same forward tangent');
    assert.ok(Math.abs(Math.hypot(behind.x - pose.x, behind.y - pose.y) - 24) < 1e-10, 'look-behind does not wrap to an offset race line');
    assert.equal(JSON.stringify(car), before, 'sampling never changes per-car start state');
  }
});

test('the 50 m launch path has matching C2 joins, road contact and a forward analytic tangent', () => {
  const epsilon = 1e-5, derivativeStep = .001;
  for (const race of races) {
    const car = { distance: 0, standingStartDistance: 0 };
    for (const join of [0, 50]) {
      const a = DrivingPose.sampleCar(race, car, join - epsilon), b = DrivingPose.sampleCar(race, car, join + epsilon);
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < .00003, race.circuit.id + ': C0 start join');
      assert.ok(Math.abs(turn(b.angle - a.angle)) < .000003, race.circuit.id + ': C1 start join');
      assert.ok(Math.abs(b.grade - a.grade) < .000001, race.circuit.id + ': C1 height join');
      assert.ok(Math.abs(b.curvature - a.curvature) < .000003, race.circuit.id + ': C2 start join');
    }
    for (let s = 0; s <= 50; s += .5) {
      const pose = DrivingPose.sampleCar(race, car, s);
      const a = DrivingPose.sampleCar(race, car, s - derivativeStep), b = DrivingPose.sampleCar(race, car, s + derivativeStep);
      const run = Math.hypot(b.x - a.x, b.y - a.y);
      assert.ok(run / (2 * derivativeStep) > .85 && run / (2 * derivativeStep) < 1.35, race.circuit.id + ': bounded launch motion without a cusp');
      assert.ok(Math.abs(turn(pose.angle - Math.atan2(b.y - a.y, b.x - a.x))) < .00001, race.circuit.id + ': body follows its actual path');
      assert.ok(Math.abs(pose.grade - (b.z - a.z) / run) < .00001, race.circuit.id + ': pitch follows height');
      let nearest = Infinity, roadHeight = 0;
      for (let i = 0; i < race.track.points.length; i++) {
        const from = race.track.points[i], to = race.track.points[(i + 1) % race.track.points.length];
        const dx = to.x - from.x, dy = to.y - from.y;
        const t = Math.max(0, Math.min(1, ((pose.x - from.x) * dx + (pose.y - from.y) * dy) / (dx * dx + dy * dy)));
        const distance = Math.hypot(pose.x - from.x - t * dx, pose.y - from.y - t * dy);
        if (distance < nearest) { nearest = distance; roadHeight = from.z + (to.z - from.z) * t; }
      }
      assert.ok(nearest + 1 < race.track.width / 2, race.circuit.id + ': two-metre-wide body stays on the road');
      assert.ok(Math.abs(pose.z - roadHeight) < .012, race.circuit.id + ': tires stay within 12 mm of the road');
    }
    assert.deepEqual(DrivingPose.sampleCar(race, car, 50), DrivingPose.sample(race, 50), 'exact ordinary trajectory after launch');
  }
});

test('launch blending is per car and never repeats at subsequent flying laps', () => {
  for (const race of races) {
    const standing = { distance: 0, standingStartDistance: 0 }, flying = { distance: 0, standingStartDistance: null };
    assert.deepEqual(DrivingPose.sampleCar(race, flying), DrivingPose.sample(race, 0), 'inherited speed keeps the original racing line');
    assert.equal(DrivingPose.startBlend(flying), 1, 'flying camera retains ordinary smoothing');
    for (const lap of [1, 2, 3]) for (const offset of [-.01, 0, .01, 12]) {
      const distance = lap * race.track.length + offset;
      assert.deepEqual(DrivingPose.sampleCar(race, standing, distance), DrivingPose.sample(race, distance), 'no finish-line center snap');
    }
    const progress = [0, 5, 20, 40, 50, 100].map(distance => DrivingPose.startBlend({ ...standing, distance }));
    assert.equal(progress[0], 0); assert.equal(progress.at(-1), 1);
    for (let i = 1; i < progress.length; i++) assert.ok(progress[i] >= progress[i - 1], 'smooth monotone camera release');
    assert.deepEqual(DrivingPose.sampleCar(race, { distance: 0 }), DrivingPose.sample(race, 0), 'legacy callers opt into launch explicitly');
  }
});

test('individual physical paths have independent caches and the displayed guide matches the car', () => {
  const race = races[0], points = race.pathPoints.map(p => ({ ...p, x: p.x + 2 }));
  const car = { distance: 100, standingStartDistance: null, pathPoints: points,
    trackLength: race.track.length * 1.01, pathSpacing: race.track.length * 1.01 / points.length };
  const equivalent = { ...race, pathPoints: car.pathPoints, track: { ...race.track, length: car.trackLength, spacing: car.pathSpacing } };
  assert.deepEqual(DrivingPose.sampleCar(race, car), DrivingPose.sample(equivalent, 100));
  const guide = DrivingPose.pathCar(race, car);
  assert.equal(guide, DrivingPose.pathCar(race, car), 'per-car draw cache');
  assert.notEqual(guide, DrivingPose.path(race), 'never reuses another physical line');
  for (let i = 0; i < guide.length; i += 47) assert.deepEqual(guide[i], DrivingPose.sampleCar(race, car, guide[i].s));
  const standing = { ...car, standingStartDistance: 0, distance: 0 }, launchGuide = DrivingPose.pathCar(race, standing);
  assert.deepEqual(launchGuide[0], DrivingPose.sampleCar(race, standing, 0));
  assert.deepEqual(launchGuide.at(-1), DrivingPose.sampleCar(race, standing, standing.trackLength));
  assert.notDeepEqual(launchGuide[0], launchGuide.at(-1), 'first lap guide remains open at the timing line');
  standing.distance = 50;
  assert.deepEqual(DrivingPose.pathCar(race, standing), guide, 'ordinary closed line resumes after the launch');
  const fallback = { sampleForCar: (_car, s) => ({ x: s, y: 9, elevation: null, angle: 0, grade: 0, s }) };
  assert.deepEqual(DrivingPose.sampleCar(fallback, { distance: 4 }), { x: 4, y: 9, z: 0, elevation: null, angle: 0, grade: 0, s: 4 });
});

test('legacy fixtures and missing elevation preserve their contracts', () => {
  const fake = { sample: s => ({ x: s, y: 3, elevation: null, angle: .7, grade: 0, s }) };
  assert.deepEqual(DrivingPose.sample(fake, 4), { x: 4, y: 3, z: 0, elevation: null, angle: .7, grade: 0, s: 4 });
  assert.equal(DrivingPose.sample({}, 4), null);
  assert.deepEqual(DrivingPose.path({}), []);
  const source = races[0];
  const flat = { track: { ...source.track, hasElevation: false }, pathPoints: source.pathPoints.map(p => ({ ...p, z: 0 })) };
  const sample = DrivingPose.sample(flat, 21);
  assert.equal(sample.elevation, null); assert.equal(sample.z, 0); assert.equal(sample.grade, 0);
  for (const invalid of [NaN, Infinity, -Infinity]) assert.throws(() => DrivingPose.sample(source, invalid), /finite/);
});
