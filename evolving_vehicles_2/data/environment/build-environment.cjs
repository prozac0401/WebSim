/* Assemble the reviewable, source-linked feature collections for offline use. */
const fs = require('node:fs');
const path = require('node:path');
const data = {};
for (const region of ['korea', 'overseas']) {
  const dir = path.join(__dirname, region);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('-features.json')).sort()) {
    const collection = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const id = collection.circuitId || file.replace('-features.json', '');
    if (data[id]) throw Error(`Duplicate environment: ${id}`);
    data[id] = collection;
  }
}
fs.writeFileSync(path.join(__dirname, '../../track-environment-data.js'),
  '/* Photo-interpreted circuit surroundings. Boundaries and object heights are approximate; see data/environment/README.md. */\n' +
  '(function(root){const data=' + JSON.stringify(data) + ';if(typeof module!=="undefined"&&module.exports)module.exports=data;root.TrackEnvironmentData=data;})(typeof window!=="undefined"?window:globalThis);\n');
console.log('Environment collections:', Object.keys(data).join(', ') || '(none yet)');
