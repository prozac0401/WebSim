'use strict';
// Pure candidate evaluation: no parent selection, random numbers or grip search.
importScripts('../evolving_vehicles/vehicle-specs.js','../evolving_vehicles_2/circuit-vehicle-specs.js','../evolving_vehicles_2/tuning-evolution.js','../evolving_vehicles_2/powertrain-profiles.js','catalog.js','course-model.js','kic-t21.js','inje-sdc.js','kic-sdc.js','ebisu-west.js','tsukuba-d1.js','track.js','genome.js','driver.js','physics.js');
let vehicle,track;
onmessage=event=>{
  const message=event.data;
  try{
    if(message.type==='init'){
      vehicle=DriftCatalog.get(message.variantId);
      track=DriftTrack.get(message.trackId,{includeDevelopment:message.includeDevelopment===true});
      postMessage({type:'ready'});
    }else if(message.type==='evaluate'){
      if(!vehicle||!track)throw Error('Evaluator has no fixed vehicle/course.');
      const result=DriftPhysics.evaluateGene(vehicle,track,message.gene,{record:true});
      postMessage({type:'result',sequence:message.sequence,result});
    }
  }catch(error){postMessage({type:'error',message:error.message});}
};
