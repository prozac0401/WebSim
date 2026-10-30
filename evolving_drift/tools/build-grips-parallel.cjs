'use strict';
// Offline only. Each child owns one pair artifact; a final serial pass alone
// publishes the manifest. Startup continues to decode prepared records only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'evolving_drift');
const Catalog=require('../catalog.js'),Tracks=require('../track.js'),Prepared=require('../prepared-grips.js');
const workers=Number(process.argv[2]||3),flags=process.argv.slice(3);
if(flags.some(f=>!['--revalidate-existing','--allow-builder-update'].includes(f)))throw Error('Unknown build flag');
if(!Number.isInteger(workers)||workers<1||workers>4)throw Error('Worker count must be 1..4');
const out=path.join(root,'output/drift-qa/line-clutch/grip-build-'+Date.now());fs.mkdirSync(out,{recursive:true});
const sources=['catalog.js','genome.js','driver.js','manual-clutch.js','physics.js','prepared-grips.js','grip-baseline-builder.cjs','grip-line.js','grip-manual-fallback.cjs','build-grips.cjs'];
const hash=()=>Object.fromEntries(sources.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(base,file),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hash(),guard=()=>{if(JSON.stringify(hash())!==JSON.stringify(sourceHashes))throw Error('Frozen model/builder changed during build');};
const pairs=Tracks.list({includeDevelopment:true}).flatMap(track=>Catalog.list().map(vehicle=>({key:Prepared.key(vehicle,track),vehicle:vehicle.id,track:track.id,manual:vehicle.physics.transmissionType==='MT'})));
pairs.sort((a,b)=>(b.track==='kr-kic-t21-kdl-2016-r2')-(a.track==='kr-kic-t21-kdl-2016-r2')||Number(b.manual)-Number(a.manual));
console.log('Build evidence: '+out);
const report={startedAt:new Date().toISOString(),workers,flags,sourceHashes,total:pairs.length,completed:[],failures:[],status:'running'};
const save=()=>{fs.writeFileSync(path.join(out,'summary.json.tmp'),JSON.stringify(report,null,2));fs.renameSync(path.join(out,'summary.json.tmp'),path.join(out,'summary.json'));};
function run(args,log){return new Promise((resolve,reject)=>{
 const start=Date.now(),stream=fs.createWriteStream(path.join(out,log));
 const child=spawn(process.execPath,[path.join(base,'build-grips.cjs'),...args],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
 child.on('error',reject);child.on('close',code=>stream.end(()=>resolve({code,elapsedMs:Date.now()-start,log})));
});}
(async()=>{
 save();let next=0;
 await Promise.all(Array.from({length:workers},async()=>{
  while(next<pairs.length){guard();const pair=pairs[next++],result=await run(['--development',...flags,'--pair',pair.key],pair.key.replaceAll('/','--')+'.log');guard();
   (result.code===0?report.completed:report.failures).push({...pair,...result});save();
   console.log((result.code===0?'Ready ':'FAILED ')+pair.key+' ('+(report.completed.length+report.failures.length)+'/'+pairs.length+')');
  }
 }));
 if(report.failures.length)throw Error(report.failures.length+' pairs failed; manifest not published');
 guard();report.manifest=await run(['--development',...flags],'manifest.log');if(report.manifest.code!==0)throw Error('Manifest build failed');
 report.check=await run(['--development','--check'],'check.log');if(report.check.code!==0)throw Error('Prepared matrix check failed');
 guard();report.status='completed';report.finishedAt=new Date().toISOString();save();console.log('All '+pairs.length+' offline pairs ready and checked.');
})().catch(e=>{report.status='failed';report.error=e.stack;save();console.error(e.stack);process.exitCode=1;});
