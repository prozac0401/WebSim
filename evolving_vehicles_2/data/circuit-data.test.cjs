'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { coordinatesFromGeoJSON, coordinateHash, distance } = require('./circuit-geometry.cjs');
const circuits = require('../circuits.js');
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const manifest = read('manifest.json');

test('all 11 offline layouts preserve original route vertices and sample long segments at most 75 m apart', () => {
  assert.equal(circuits.length, 11);
  assert.equal(circuits.filter(c => c.countryCode === 'KR').length, 8);
  for (const circuit of circuits) {
    const record = manifest.circuits.find(c => c.id === circuit.id);
    const source = coordinatesFromGeoJSON(read(record.file));
    const stored = read(record.elevationFile);
    assert.equal(stored.sourceCoordinateHash, coordinateHash(source), circuit.id + ': original geometry fingerprint');
    assert.equal(stored.coordinateHash, coordinateHash(circuit.coordinates), circuit.id + ': queried coordinate fingerprint');
    assert.deepEqual(stored.coordinates, circuit.coordinates, circuit.id);
    assert.equal(circuit.sourcePointCount, source.length, circuit.id);
    assert.deepEqual(circuit.coordinates[0], source[0], circuit.id + ': original timing-line point retained');
    assert.deepEqual(circuit.coordinates.at(-1), circuit.coordinates[0], circuit.id + ': closed geometry');
    let searchFrom = 0;
    for (const original of source) {
      const index = circuit.coordinates.findIndex((p, i) => i >= searchFrom && p[0] === original[0] && p[1] === original[1]);
      assert.ok(index >= searchFrom, circuit.id + ': every source point must remain in order');
      searchFrom = index + 1;
    }
    for (let i = 1; i < circuit.coordinates.length; i++) {
      assert.ok(distance(circuit.coordinates[i - 1], circuit.coordinates[i]) <= 75.001, circuit.id + ': maximum DEM sample spacing');
    }
    assert.equal(circuit.elevationResolutionM, 90, circuit.id);
    assert.equal(circuit.elevations.length, circuit.coordinates.length, circuit.id);
    assert.deepEqual(circuit.elevations, stored.elevations, circuit.id + ': raw heights are not pre-smoothed');
    assert.equal(circuit.elevations[0], circuit.elevations.at(-1), circuit.id + ': closed elevation seam');
    assert.ok(circuit.sourceUrl && circuit.license && circuit.elevationSourceUrl && circuit.elevationCopyright, circuit.id + ': source attribution');
  }
});

test('every bundled elevation is an exact preserved API value for its own coordinate, not an index shift or fabricated fallback', () => {
  const acquisition = read('elevation/acquisition.json');
  const samples = new Map();
  for (const file of acquisition.rawFiles) {
    const raw = read('elevation/' + file), url = new URL(raw.url);
    assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/elevation');
    const latitude = url.searchParams.get('latitude').split(',').map(Number);
    const longitude = url.searchParams.get('longitude').split(',').map(Number);
    assert.ok(raw.coordinates.length > 0 && raw.coordinates.length <= 100);
    assert.equal(raw.coordinateHash, coordinateHash(raw.coordinates));
    assert.equal(raw.response.elevation.length, raw.coordinates.length);
    assert.ok(Number.isFinite(Date.parse(raw.retrievedAt)), file + ': actual acquisition timestamp');
    raw.coordinates.forEach((p, i) => {
      assert.deepEqual(p, [longitude[i], latitude[i]], file + ': query coordinates match saved response order');
      const z = raw.response.elevation[i];
      assert.ok(Number.isFinite(z) && z > -500 && z < 9000);
      const key = p.join(',');
      if (samples.has(key)) assert.equal(samples.get(key), z, file + ': repeated coordinate consistency');
      samples.set(key, z);
    });
  }
  const queried = new Set();
  for (const circuit of circuits) circuit.coordinates.forEach((p, i) => {
    const key = p.join(',');
    assert.ok(samples.has(key), circuit.id + ': real queried point');
    assert.equal(circuit.elevations[i], samples.get(key), circuit.id + ': exact raw elevation mapping');
    queried.add(key);
  });
  assert.equal(queried.size, 1703);
  assert.equal(acquisition.uniqueCoordinates, queried.size);
  assert.equal(acquisition.circuitCount, circuits.length);
});

test('Korean source route joins are bounded and geometry length estimates remain distinct from reference configurations', () => {
  const raw = read('kr-osm/korea-raceways.raw.json');
  const sourcePoints = new Set(raw.elements.filter(e => e.type === 'way').flatMap(e => e.geometry.map(p => [p.lon, p.lat].join(','))));
  for (const record of manifest.circuits.filter(c => c.countryCode === 'KR')) {
    for (const p of coordinatesFromGeoJSON(read(record.file))) assert.ok(sourcePoints.has(p.join(',')), record.id + ': original OSM coordinate');
  }
  const join = read('kr-osm/kic-derivation.json');
  assert.ok(join.rejoinGapM > 0 && join.rejoinGapM <= 1.5);
  assert.ok(Math.abs(distance(join.extensionEnd, join.permanentRejoin) - join.rejoinGapM) < 1e-7);
  for (const id of ['taebaek', 'bmw-incheon', 'yeongam-permanent']) {
    const circuit = circuits.find(c => c.id === id);
    assert.equal(circuit.lengthKind, 'geometry-estimate');
    assert.equal(circuit.lengthM, Math.round(circuit.geometryLengthM));
    assert.ok(circuit.referenceLengthM > circuit.lengthM);
  }
  const pocheon=circuits.find(c => c.id === 'pocheon');
  assert.equal(pocheon.category, '자동차 경주장');
  assert.equal(pocheon.statusNote,'주행·시승 행사 활용 코스');
  assert.equal(pocheon.statusSourceUrl,'https://www.awak.or.kr/article/view/awak202301190001');
  const source=read('kr-osm/pocheon.geojson').properties;
  const extracted=read('kr-osm/kic-pocheon.metadata.json').find(c=>c.id==='pocheon');
  const listed=manifest.circuits.find(c=>c.id==='pocheon');
  for(const field of ['category','statusNote','statusSourceUrl','description','sourceNote']) {
    for(const record of [source,extracted,listed]) assert.equal(record[field],pocheon[field],field+': Pocheon source and published guidance agree');
  }
});
