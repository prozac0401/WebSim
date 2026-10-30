'use strict';
/* Deterministic model-calibration matrix, not real vehicle validation. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{Worker,isMainThread,workerData,parentPort}=require('worker_threads');
const ev2=path.resolve(__dirname,'../..'),T=require(ev2+'/tuning-evolution.js'),R=require(ev2+'/race-engine.js'),C=require(ev2+'/circuits.js'),V=require(ev2+'/vehicle-condition.js');
const cases=[['avante','avante-2.0-16'],['supra','supra-3.0t-rz'],['ioniq5','ioniq5-long-awd'],['k5','k5-2.0hev']];
const setups=[['stock',0,{acceleration:0,topSpeed:0,brakes:0,grip:0}],['acceleration',30,{acceleration:3,topSpeed:0,brakes:0,grip:3}],['balanced',30,{acceleration:2,topSpeed:1,brakes:1,grip:3}]];
function simulate({vehicleId,variantId,circuit,laps}){
 const entrants=setups.map(([name,budget,levels])=>T.createEntrant({vehicleId,variantId,budget,levels,uid:name}));
 const race=new R({circuit:C.find(c=>c.id===circuit),entrants,laps,surface:'dry'});while(!race.finished&&race.time<3600)race.step(30);
 return race.cars.map(c=>({vehicleId,variantId,circuit,laps,setup:c.uid,levels:c.entrant.levels,budget:c.entrant.budget,time:c.finishTime,dnf:c.dnf,finished:c.finished,lapTimes:c.lapTimes,condition:V.snapshot(c.condition),lapConditions:c.lapConditions}));
}
if(!isMainThread)parentPort.postMessage(simulate(workerData));
else{
 const inputs=['race-engine.js','vehicle-condition.js','tuning-evolution.js','circuits.js','circuit-vehicle-specs.js','powertrain-profiles.js','powertrain-dynamics.js','powertrain-telemetry.js','vehicle-racing-line.js','driving-pose.js','spa-elevation-profile.js','taebaek-elevation-profile.js','n-grin-shift.js','brake-light-state.js'];
 const hashes=()=>Object.fromEntries(inputs.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(ev2,file))).digest('hex')]));const sourceSha256=hashes();
 const jobs=cases.flatMap(([vehicleId,variantId])=>['inje','monza'].flatMap(circuit=>[1,3,5].map(laps=>({vehicleId,variantId,circuit,laps}))));
 let index=0,done=0,active=0;const rows=[];
 const workers=Math.max(1,Math.min(4,Number(process.env.CONDITION_WORKERS)||4));
 function finish(){
  if(JSON.stringify(sourceSha256)!==JSON.stringify(hashes()))throw Error('Source changed while calibration ran; rerun the final matrix.');
  rows.sort((a,b)=>a.vehicleId.localeCompare(b.vehicleId)||a.circuit.localeCompare(b.circuit)||a.laps-b.laps||a.setup.localeCompare(b.setup));
  const summaryRows=rows.map(({condition:s,lapConditions,...r})=>({...r,brakeTemperatureC:[s.brakes.front.temperatureC,s.brakes.rear.temperatureC],brakeFactor:s.brakes.factor,tireTemperatureC:[s.tires.front.temperatureC,s.tires.rear.temperatureC],tireWear:[s.tires.front.wear,s.tires.rear.wear],tireGripFactors:[s.tires.front.gripFactor,s.tires.rear.gripFactor],powertrain:s.powertrain,energy:s.energy,lapBrakeFactors:lapConditions.map(x=>x.brakes.factor),lapPowerFactors:lapConditions.map(x=>x.powertrain.powerFactor)}));
  const summary={model:V.MODEL.version,sourceSha256,nodeVersion:process.version,conditions:jobs.length,records:rows.length,allFinished:rows.every(r=>r.finished&&!r.dnf&&Number.isFinite(r.time)),allFinite:summaryRows.every(r=>r.brakeTemperatureC.concat(r.tireTemperatureC,r.tireWear,r.tireGripFactors,r.brakeFactor,r.powertrain.powerFactor,r.time).every(Number.isFinite)),methods:'Actual 120 Hz TrackRace with condition-dependent axle friction envelopes, braking profiles and power. Three entrants evaluated together as independent ghosts; deterministic, no GA search. Dry, warm baseline, default modeled SOC/ambient. Existing costs/specs unchanged.',limitations:'Thermal thresholds, cooling, wear, HEV battery capacity and engine charging policy are gameplay estimates. This matrix validates bounded coherent behavior and scenario differences; it is not measured vehicle calibration, human enjoyment validation, or proof that these three setups are globally optimal. Four variants, two circuits only.',rows:summaryRows};
  fs.writeFileSync(path.join(__dirname,'summary.json'),JSON.stringify(summary,null,2)+'\n');const rawDir=path.resolve(ev2,'../output/condition-calibration-final');fs.mkdirSync(rawDir,{recursive:true});fs.writeFileSync(path.join(rawDir,'raw.json'),JSON.stringify(rows,null,2)+'\n');
  console.log(JSON.stringify({conditions:summary.conditions,records:summary.records,allFinished:summary.allFinished,allFinite:summary.allFinite,summary:path.join(__dirname,'summary.json')}));
 }
 function pump(){while(active<workers&&index<jobs.length){const job=jobs[index++];active++;const w=new Worker(__filename,{workerData:job});w.on('message',result=>{rows.push(...result);done++;console.error(JSON.stringify({done,total:jobs.length,...job}));});w.on('error',err=>{console.error(err);process.exitCode=1;});w.on('exit',code=>{active--;if(code!==0)throw Error('Calibration worker failed');if(done===jobs.length&&active===0)finish();else pump();});}}
 pump();
}
