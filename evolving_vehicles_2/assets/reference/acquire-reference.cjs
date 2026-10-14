/* Re-fetch the exact public manufacturer references recorded in SOURCES.json. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'SOURCES.json'), 'utf8'));
(async () => {
  for (const asset of manifest.assets) {
    const target = path.resolve(__dirname, asset.file);
    if (path.dirname(target) !== __dirname) throw new Error('Reference path must be local');
    if (fs.existsSync(target)) {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
      if (hash === asset.sha256) continue;
    }
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`${asset.file}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (hash !== asset.sha256) throw new Error(`${asset.file}: source changed; review before replacing`);
    fs.writeFileSync(target, bytes);
    console.log(asset.file);
  }
  console.log(`${manifest.assets.length} manufacturer references verified`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
