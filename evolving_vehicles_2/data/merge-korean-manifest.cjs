const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'manifest.json');
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'kr-osm',name),'utf8'));
const imported=[...read('korean-circuits.metadata.json'),...read('kic-pocheon.metadata.json')];
const order=['everland','inje','yeongam','yeongam-permanent','taebaek','bmw-incheon','hmg-taean','pocheon'];
const byId=Object.fromEntries(imported.map(item=>[item.id,item]));
const previousById=Object.fromEntries(manifest.circuits.map(item=>[item.id,item]));
manifest.circuits=[...order.map(id=>{
  if(!byId[id])throw new Error(`Missing circuit ${id}`);
  // Preserve separately acquired elevation references on a repeat import. The
  // bundle builder validates their source-coordinate hash before accepting them.
  const previous=previousById[id];
  const c={...byId[id],...(previous?.elevationFile ? {elevationFile:previous.elevationFile} : {}),sourceProfile:'openstreetmap',country:'대한민국',countryCode:'KR'};
  if(!c.file) c.file=`kr-osm/${id}.geojson`;
  if(c.file.startsWith('data/'))c.file=c.file.slice(5);
  if(!c.file.includes('/'))c.file=`kr-osm/${c.file}`;
  if(!c.category)c.category=['bmw-incheon','hmg-taean'].includes(id)?'드라이빙 체험':'자동차 경주장';
  if(c.lengthKind==='published')c.lengthKind='official';
  delete c.coordinates;
  return c;
}),...manifest.circuits.filter(c=>c.countryCode!=='KR')];
fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
require('./build-circuits.cjs');
