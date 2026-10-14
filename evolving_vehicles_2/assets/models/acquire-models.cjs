/* Reacquire the exact public manufacturer files recorded in SOURCES.json.
   Default mode verifies local cache; --download fetches absent/mismatched files.
   Manufacturer copyright; this script does not confer redistribution rights. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'SOURCES.json'), 'utf8'));
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
(async () => {
  for (const source of manifest.files) {
    const target = path.resolve(__dirname, source.model, source.name);
    if (!target.startsWith(path.resolve(__dirname) + path.sep)) throw new Error('Invalid manifest path');
    const matches = fs.existsSync(target) && sha256(fs.readFileSync(target)) === source.sha256;
    if (!matches && process.argv.includes('--download')) {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`${response.status}: ${source.url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== source.bytes || sha256(bytes) !== source.sha256) {
        throw new Error(`Upstream source changed: ${source.model}/${source.name}; review before replacing`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    } else if (!matches) {
      throw new Error(`Missing or changed cache: ${source.model}/${source.name}`);
    }
    console.log(`Verified ${source.model}/${source.name}`);
  }
  console.log(`${manifest.files.length} manufacturer source files verified.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
