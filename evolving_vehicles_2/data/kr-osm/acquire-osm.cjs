'use strict';
// Download source OSM raceway geometries; geometry licensing: ODbL 1.0.
// Re-run with `node evolving_vehicles_2/data/kr-osm/acquire-osm.cjs`.
const fs = require('node:fs');
const path = require('node:path');
const query = '[out:json][timeout:60];way["highway"="raceway"](33,124,39,132);out tags geom;';
async function main() {
  const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (const endpoint of servers) {
    try {
      const response = await fetch(endpoint + '?data=' + encodeURIComponent(query), { headers: { 'User-Agent': 'WebSim-CircuitData/1.0 (OSM circuit research)' }, signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      fs.writeFileSync(path.join(__dirname, 'korea-raceways.raw.json'), JSON.stringify(data, null, 2) + '\n');
      fs.writeFileSync(path.join(__dirname, 'acquisition.json'), JSON.stringify({ downloadedAt: new Date().toISOString(), endpoint, query, source: 'OpenStreetMap contributors', license: 'ODbL-1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', attributionUrl: 'https://www.openstreetmap.org/copyright' }, null, 2) + '\n');
      console.log(`Saved ${data.elements.length} source raceway ways. Bounding box includes neighbouring territory; extract only verified Korean facilities.`);
      return;
    } catch (error) { console.error(endpoint + ': ' + error.message); }
  }
  process.exitCode = 1;
}
main();
