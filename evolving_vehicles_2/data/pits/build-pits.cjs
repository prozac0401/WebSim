const fs=require('node:fs'),path=require('node:path');
const data={};
for(const file of fs.readdirSync(__dirname).filter(f=>f.endsWith('.json')).sort()){
  const collection=JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8'));
  if(!collection.circuitId||collection.type!=='FeatureCollection')throw Error('Invalid collection: '+file);
  if(data[collection.circuitId])throw Error('Duplicate circuit: '+collection.circuitId);
  data[collection.circuitId]=collection;
}
fs.writeFileSync(path.join(__dirname,'../../pit-facility-data.js'),'/* Photo-referenced pit and service facilities. See data/pits/README.md for sources and estimates. */\n(function(root){const data='+JSON.stringify(data)+';root.PitFacilityData=data;if(typeof module!=="undefined"&&module.exports)module.exports=data;})(typeof window!=="undefined"?window:globalThis);\n');
console.log('Pit facility collections: '+Object.keys(data).join(', '));
