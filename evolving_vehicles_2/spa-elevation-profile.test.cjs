'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Profile = require('./spa-elevation-profile.js');
const Race = require('./race-engine.js');
const circuits = require('./circuits.js');
const spa = circuits.find(c => c.id === 'spa');
const official = [[0,418],[220,424],[310,419],[690,403],[890,391],[1130,415],[1490,446],[2200,463],[2470,470],[2870,455],[3110,438],[3600,402],[4280,377],[4740,375],[5100,373],[5700,388],[6000,398],[6540,408],[7004,418]];

test('every altitude marker transcribed from page 3 of the official 2026 plan is reproduced exactly', () => {
  assert.deepEqual(Profile.stations, official);
  assert.equal(Profile.metadata.stationCount, 18);
  assert.equal(Profile.metadata.sourcePage, 3);
  for (const [distance, elevation] of official) assert.equal(Profile.sample(distance).elevation, elevation);
  assert.equal(Profile.sample(1130).elevation - Profile.sample(890).elevation, 24);
  assert.equal(Profile.sample(1490).elevation - Profile.sample(1130).elevation, 31);
});

test('intermediate elevations preserve monotonic shape, extrema and continuous grade at markers and the lap seam', () => {
  for (let i = 0; i < official.length - 1; i++) {
    const [s0, z0] = official[i], [s1, z1] = official[i + 1], direction = Math.sign(z1 - z0);
    let previous = z0;
    for (let s = s0; s <= s1; s++) {
      const p = Profile.sample(s);
      assert.ok(p.elevation >= Math.min(z0, z1) - 1e-9 && p.elevation <= Math.max(z0, z1) + 1e-9, 'no invented hill/valley');
      assert.ok(direction * (p.elevation - previous) >= -1e-9, 'monotone between measured markers');
      assert.ok(direction * p.grade >= -1e-9);
      previous = p.elevation;
    }
  }
  for (const [s] of official) {
    const a = Profile.sample(s - 1e-4), b = Profile.sample(s + 1e-4);
    assert.ok(Math.abs(a.elevation - b.elevation) < .0001);
    assert.ok(Math.abs(a.grade - b.grade) < .00001);
  }
  assert.deepEqual(Profile.sample(0), Profile.sample(7004));
  assert.deepEqual(Profile.sample(-12), Profile.sample(6992));
});

test('profile eligibility rejects another origin, direction, layout or reused Spa name', () => {
  assert.ok(Profile.forCircuit(spa));
  for (const other of [circuits[0], {...spa, lengthM:7000}, {...spa, sourceRevision:'unknown'}, {...spa, coordinates:[...spa.coordinates].reverse()}]) assert.equal(Profile.forCircuit(other), null);
});

test('official z changes retain raw DEM responses, filtered DEM and identical planar/racing-line geometry', () => {
  const source = JSON.stringify(spa), track = Race.buildTrack(spa), dem = Race.buildTrack({...spa, id:'spa-dem-comparison'});
  assert.equal(JSON.stringify(spa), source, 'source coordinates and every saved API elevation preserved');
  assert.deepEqual(track.projection, dem.projection, 'georeferencing preserved');
  for (const key of ['length','spacing','width','rawLength','scale']) assert.equal(track[key], dem[key]);
  assert.equal(track.elevationSmoothingSigmaM, 0);
  assert.equal(track.elevationSmoothingMethod, 'periodic-monotone-cubic');
  assert.equal(track.elevationSource, Profile.metadata.source);
  assert.equal(track.elevationResolutionM, null);
  assert.equal(dem.elevationSmoothingMethod, 'periodic-gaussian');
  track.points.forEach((p, i) => {
    assert.equal(p.x, dem.points[i].x); assert.equal(p.y, dem.points[i].y); assert.equal(p.s, dem.points[i].s);
    assert.equal(p.demZ, dem.points[i].z); assert.equal(p.rawZ, dem.points[i].rawZ);
    assert.equal(p.z, Profile.sample(p.s).elevation);
  });
  track.racingLine.points.forEach((p, i) => { assert.equal(p.x, dem.racingLine.points[i].x); assert.equal(p.y, dem.racingLine.points[i].y); assert.equal(p.centerS, dem.racingLine.points[i].centerS); });
  assert.equal(track.racingLine.length, dem.racingLine.length);
});

test('the Raidillon rise occurs at the official centreline stations rather than a scaled or shifted DEM hill', () => {
  const race = new Race({circuit:spa,vehicleIds:['g80'],racingLine:false});
  for (const [s,z] of official) assert.ok(Math.abs(race.sample(s).elevation-z)<.02, '4 m simulation sampling preserves marker '+s);
  const rise = race.sample(1130).elevation - race.sample(890).elevation;
  assert.ok(Math.abs(rise-24)<.01);
  const max = Math.max(...race.pathPoints.filter(p=>p.s>=890&&p.s<=1130).map(p=>p.grade));
  assert.ok(max>.12&&max<.17, 'use slopes implied by the published markers; do not force 17%');
  const line = new Race({circuit:spa,vehicleIds:['g80'],racingLine:true});
  const near = line.pathPoints.reduce((best,p)=>Math.abs(p.centerS-1130)<Math.abs(best.centerS-1130)?p:best);
  assert.ok(Math.abs(near.z-Profile.sample(near.centerS).elevation)<.02,'racing-line heights follow centreline chainage');
});
