/* Offline visual-body origin calibration. This does not estimate vehicle mass
 * distribution: it maps existing EV2 mesh axles into the unchanged physics CG. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const Stock=require('../evolving_vehicles_2/tuning-evolution.js'),Wheels=require('../evolving_vehicles_2/vehicle-wheels.js');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
function build(){
  const wheelPreparationSha256=sha(fs.readFileSync(path.join(__dirname,'../evolving_vehicles_2/vehicle-wheels.js'))),origins={};
  const ids=[...new Set(Object.values(Stock.VARIANTS).flat().filter(v=>v.spec.factoryDrive==='rwd').map(v=>v.vehicleId))].sort();
  for(const id of ids){
    const sourceAsset='../evolving_vehicles_2/assets/models/'+id+'-runtime.js',bytes=fs.readFileSync(path.join(__dirname,sourceAsset));let data;
    vm.runInNewContext(bytes.toString('utf8'),{ManufacturerModels:{registerCompressed:packed=>{data=JSON.parse(zlib.gunzipSync(Buffer.from(packed,'base64')));}}});
    const unpack=p=>{const vertices=Buffer.from(p.vertices,'base64'),indices=Buffer.from(p.indices,'base64'),I=p.indexType===2?Uint16Array:Uint32Array;return {...p,vertices:new Float32Array(vertices.buffer,vertices.byteOffset,vertices.length/4),indices:new I(indices.buffer,indices.byteOffset,indices.length/I.BYTES_PER_ELEMENT)};};
    data.primitives=data.primitives.map(unpack);if(data.fallbackPrimitives)data.fallbackPrimitives=data.fallbackPrimitives.map(unpack);data=Wheels.prepare(data);
    const wheels=[...new Map(data.primitives.filter(p=>p.wheel).map(p=>[p.wheel.axle+':'+p.wheel.side,p.wheel])).values()];
    if(wheels.length!==4)throw Error(id+' must have exactly four authored axle groups');
    const sourceLength=data.bounds.max[0]-data.bounds.min[0],bodyCentre=(data.bounds.max[0]+data.bounds.min[0])/2,axleCentre=wheels.reduce((n,w)=>n+w.center[0],0)/4;
    origins[id]={axleMidpointFraction:(axleCentre-bodyCentre)/sourceLength,sourceAsset,sourceSha256:sha(bytes),wheelPreparationSha256,
      method:'Mean of the four EV2 wheel-group X centres minus source bounding-box X centre, divided by source body length. Visual/collision origin mapping, not measured CG data.'};
  }
  return origins;
}
function checkOrWrite(check=false){
  const file=path.join(__dirname,'catalog.js'),text=fs.readFileSync(file,'utf8'),origins=build();
  const block='  // BEGIN GENERATED BODY ORIGINS (node build-model-origins.cjs)\n  const BODY_ORIGINS = freeze('+JSON.stringify(origins,null,2).replace(/\n/g,'\n  ')+');\n  // END GENERATED BODY ORIGINS';
  const next=text.replace(/  \/\/ BEGIN GENERATED BODY ORIGINS[^\n]*\r?\n[\s\S]*?  \/\/ END GENERATED BODY ORIGINS/,block);
  if(next===text&&!text.includes(block))throw Error('Generated origin markers were not found');
  if(check){if(next.replace(/\r\n/g,'\n')!==text.replace(/\r\n/g,'\n'))throw Error('EV2 body-origin metadata is stale. Run node evolving_drift/build-model-origins.cjs');}
  else if(next!==text)fs.writeFileSync(file,next);
  return origins;
}
if(require.main===module){const origins=checkOrWrite(process.argv.includes('--check'));console.log(JSON.stringify({models:Object.keys(origins).length,checked:process.argv.includes('--check')}));}
module.exports={build,checkOrWrite};
