/* Acquire actual Copernicus GLO-90 heights through Open-Meteo.
 * Preserve source GeoJSON; add collinear samples at <=75m along source segments.
 * Original API responses and query coordinates are retained. No invented height
 * or missing-data fallback is allowed. Re-runs reuse validated cached samples.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { MAX_SPACING_M, coordinatesFromGeoJSON, densify, coordinateHash } = require('./circuit-geometry.cjs');
const dir = path.join(__dirname, 'elevation');
fs.mkdirSync(dir, { recursive: true });
const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const tracks = manifest.circuits.map(c => {
  const sourceCoordinates = coordinatesFromGeoJSON(JSON.parse(fs.readFileSync(path.join(__dirname, c.file), 'utf8')));
  return { c, sourceCoordinates, coordinates: densify(sourceCoordinates) };
});
const key = p => p.join(',');
const unique = [...new Map(tracks.flatMap(t => t.coordinates).map(p => [key(p), p])).values()];
const samples = new Map(), usedRawFiles = new Set();
let latestRetrievedAt = '';
const valid = z => Number.isFinite(z) && z > -500 && z < 9000;
const metadata = {
  elevationSource: 'Open-Meteo · Copernicus DEM 2021 GLO-90',
  elevationSourceUrl: 'https://open-meteo.com/en/docs/elevation-api',
  elevationDatasetUrl: 'https://doi.org/10.5270/ESA-c5d3d65',
  elevationResolutionM: 90, elevationSamplingMaxSpacingM: MAX_SPACING_M,
  elevationVerticalDatum: 'EGM2008 (metres above geoid)',
  elevationLicense: 'Open-Meteo CC BY 4.0; Copernicus DEM free licence',
  elevationLicenseUrl: 'https://open-meteo.com/en/licence',
  elevationAttribution: 'Open-Meteo / Copernicus DEM GLO-90 (2021), European Union and ESA',
  elevationCopyright: 'produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
  elevationRetrievedOn: null,
  elevationNote: '90m 해상도의 지표면 고도(DSM) 추정값입니다. 원본 경로의 모든 점을 보존하고 긴 구간은 75m 이하로 나눠 고도를 조회했습니다. 도로 측량·교량 높이·캠버 자료가 아니며 건물·수목·과거 지형이 포함될 수 있습니다. 원 응답은 보존하고 주행 모형에서 고도만 거리 기준 주기 Gaussian(σ=90m, ±270m)으로 평활화합니다.'
};
function readRaw(filename) {
  const record = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8'));
  if (!Array.isArray(record.coordinates) || record.coordinateHash !== coordinateHash(record.coordinates) || !Array.isArray(record.response?.elevation)
      || record.coordinates.length !== record.response.elevation.length || record.response.elevation.some(z => !valid(z))) throw new Error('Invalid cached elevation record: ' + filename);
  record.coordinates.forEach((p, i) => samples.set(key(p), record.response.elevation[i]));
  if (typeof record.retrievedAt !== 'string' || !Number.isFinite(Date.parse(record.retrievedAt))) throw new Error('Missing retrieval timestamp: ' + filename);
  if (record.retrievedAt > latestRetrievedAt) latestRetrievedAt = record.retrievedAt;
  usedRawFiles.add(filename);
  return record;
}
for (const filename of fs.readdirSync(dir).filter(n => /^open-meteo-.*\.raw\.json$/.test(n))) readRaw(filename);
const missing = unique.filter(p => !samples.has(key(p)));
const batches = Array.from({ length: Math.ceil(missing.length / 100) }, (_, i) => missing.slice(i * 100, (i + 1) * 100));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function getBatch(points, index) {
  const hash = coordinateHash(points), filename = `open-meteo-dense-${hash.slice(0, 16)}.raw.json`;
  if (fs.existsSync(path.join(dir, filename))) { readRaw(filename); return; }
  const params = new URLSearchParams({ latitude: points.map(p => p[1]).join(','), longitude: points.map(p => p[0]).join(',') });
  const url = 'https://api.open-meteo.com/v1/elevation?' + params;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'WebSim-CircuitData/1.0 (local educational simulator)' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 150)}`);
      const body = await response.json();
      if (!Array.isArray(body.elevation) || body.elevation.length !== points.length || body.elevation.some(z => !valid(z))) throw new Error('Missing or invalid DEM value; no substitution allowed.');
      const record = { url, retrievedAt: new Date().toISOString(), coordinateHash: hash, coordinates: points, response: body };
      fs.writeFileSync(path.join(dir, filename), JSON.stringify(record, null, 2) + '\n');
      readRaw(filename);
      console.log(`DEM request ${index + 1}/${batches.length}: ${points.length} actual samples saved`);
      return;
    } catch (error) {
      if (attempt === 3) throw new Error(`DEM request ${index + 1}: ${error.message}`);
      console.error(`Retry DEM request ${index + 1}: ${error.message}`);
      await sleep(5000 * (attempt + 1));
    }
  }
}
(async () => {
  console.log(`${tracks.length} circuits: ${unique.length} unique dense coordinates; ${unique.length - missing.length} cached, ${missing.length} to fetch (${batches.length} requests).`);
  for (let i = 0; i < batches.length; i += 2) await Promise.all(batches.slice(i, i + 2).map((points, j) => getBatch(points, i + j)));
  metadata.elevationRetrievedOn = latestRetrievedAt.slice(0, 10);
  for (const { c, coordinates, sourceCoordinates } of tracks) {
    const elevations = coordinates.map(p => samples.get(key(p)));
    if (elevations.some(z => !valid(z))) throw new Error(c.id + ': DEM incomplete.');
    if (elevations[0] !== elevations.at(-1)) throw new Error(c.id + ': inconsistent closure.');
    const elevationFile = `elevation/${c.id}.json`;
    fs.writeFileSync(path.join(__dirname, elevationFile), JSON.stringify({ circuitId: c.id, sourceCoordinateHash: coordinateHash(sourceCoordinates), coordinateHash: coordinateHash(coordinates), sourcePointCount: sourceCoordinates.length, coordinates,
      metadata, elevations }, null, 2) + '\n');
    c.elevationFile = elevationFile;
    console.log(`${c.id}: ${sourceCoordinates.length} source -> ${coordinates.length} samples, elevation ${Math.min(...elevations)}–${Math.max(...elevations)}m`);
  }
  fs.writeFileSync(path.join(dir, 'acquisition.json'), JSON.stringify({ ...metadata, uniqueCoordinates: unique.length, circuitCount: tracks.length, rawFiles: [...usedRawFiles].sort(),
    method: 'All original vertices retained; original straight line segments subdivided by linear coordinate interpolation until spacing <=75m. Every resulting unique coordinate queried against Open-Meteo. Repeated coordinates share their exact API sample. No interpolation of missing API values.' }, null, 2) + '\n');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  require('./build-circuits.cjs');
})().catch(error => { console.error(error); process.exitCode = 1; });
