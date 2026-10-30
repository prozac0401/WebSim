'use strict';
// Pure candidate evaluation: no parent selection, random numbers or grip search.
const requestedRelease=new URLSearchParams(globalThis.location?.search||'').get('v')||'line-study-20261030-1';
importScripts('runtime.js?v='+encodeURIComponent(requestedRelease));
DriftRuntime.assertRelease(requestedRelease);
importScripts(...['../evolving_vehicles/vehicle-specs.js','../evolving_vehicles_2/circuit-vehicle-specs.js','../evolving_vehicles_2/tuning-evolution.js','../evolving_vehicles_2/powertrain-profiles.js','catalog.js','course-model.js','kic-t21.js','inje-sdc.js','kic-sdc.js','ebisu-west.js','tsukuba-d1.js','track.js','genome.js','driver.js','physics.js','evaluation-cache.js','prepared-grips.js','course-scoring.js','fitness.js'].map(DriftRuntime.url));
let vehicle,track,runtimeIdentity,evaluator,ready=false;
onmessage=event=>{
  const message=event.data;
  try{
    if(message.type==='init'){
      ready=false;
      vehicle=DriftCatalog.get(message.variantId);
      track=DriftTrack.get(message.trackId,{includeDevelopment:message.includeDevelopment===true});
      runtimeIdentity=DriftRuntime.identity(vehicle,track);DriftRuntime.assertIdentity(message.runtimeIdentity,runtimeIdentity);
      evaluator=new DriftEvaluationCache.Evaluator(vehicle,track,{identity:runtimeIdentity});
      ready=true;postMessage({type:'ready',runtimeIdentity});
    }else if(message.type==='evaluate'){
      if(!ready||!vehicle||!track)throw Error('Evaluator has no matching fixed vehicle/course.');
      const result=evaluator.evaluate(message.gene,{id:message.id,parentId:message.parentId});
      postMessage({type:'result',sequence:message.sequence,result,runtimeIdentity,cacheIds:evaluator.cachedIds()});
    }
  }catch(error){postMessage({type:'error',message:error.message});}
};
