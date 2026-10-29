'use strict';
const requestedRelease=new URLSearchParams(globalThis.location?.search||'').get('v')||'porter-default-20261030-1';
importScripts('runtime.js?v='+encodeURIComponent(requestedRelease));
DriftRuntime.assertRelease(requestedRelease);
importScripts(...['../evolving_vehicles/vehicle-specs.js','../evolving_vehicles_2/circuit-vehicle-specs.js','../evolving_vehicles_2/tuning-evolution.js','../evolving_vehicles_2/powertrain-profiles.js','catalog.js','course-model.js','kic-t21.js','inje-sdc.js','kic-sdc.js','ebisu-west.js','tsukuba-d1.js','track.js','genome.js','mutation-shape.js','driver.js','physics.js','evaluation-cache.js','prepared-grips-manifest.js','prepared-grips.js','course-scoring.js','fitness.js','entry-speed-planner.js','evolution-strategies.js','failure-analysis.js','evolution-learning.js','evolution.js'].map(DriftRuntime.url));
let engine=null,running=false,stopGeneration=Infinity,lastBest=null,timer=null,initToken=0;
let slots=[],jobs=[],results=new Map(),workerCount=1,configuration=null,poolPromise=null,poolEpoch=0;
let runtimeIdentity=null,evaluator=null,evaluationStats=null;
function emptyEvaluationStats(){return {simulatedTicks:0,reusedTicks:0,totalTicks:0,cacheHits:0,evaluations:0};}
function publish(message){postMessage({...message,runtimeIdentity});}
function state(){const s=engine.snapshot();delete s.best;delete s.lastCandidate;s.workerCount=workerCount;s.evaluationStats={...evaluationStats};return s;}
function publishCandidate(){const best=engine.best,changed=best.id!==lastBest;lastBest=best.id;publish({type:'candidate',candidate:engine.lastCandidate,best:changed?best:null,state:state()});}
function cancelPool(){poolEpoch++;for(const slot of slots){clearTimeout(slot.timeout);slot.worker.onmessage=null;slot.worker.onerror=null;slot.worker.terminate();}slots=[];poolPromise=null;}
function fail(error){running=false;clearTimeout(timer);cancelPool();publish({type:'error',message:error.message||String(error),updateRequired:error.code==='runtime-mismatch'});}
function fallback(schedule=true){
  cancelPool();workerCount=1;
  // Retry reservations in their original order without consuming more RNG.
  for(const job of jobs)job.dispatched=false;
  if(running&&schedule)timer=setTimeout(pump,0);
}
function ensurePool(){
  if(workerCount===1||typeof Worker!=='function')return Promise.resolve();
  if(poolPromise)return poolPromise;
  const token=initToken,epoch=poolEpoch;
  poolPromise=Promise.all(Array.from({length:workerCount},()=>new Promise((resolve,reject)=>{
    const worker=new Worker(DriftRuntime.url('evaluation-worker.js')),slot={worker,busy:null,ready:false,cacheIds:new Set()};slots.push(slot);
    const timeout=setTimeout(()=>reject(Error('Evaluator initialization timeout')),15000);slot.timeout=timeout;
    worker.onmessage=event=>{
      if(token!==initToken||epoch!==poolEpoch)return;
      const m=event.data;
      if(m.type==='ready'){clearTimeout(timeout);try{DriftRuntime.assertIdentity(m.runtimeIdentity,runtimeIdentity);}catch(error){reject(error);return;}slot.ready=true;resolve();}
      else if(m.type==='result'){
        if(slot.busy!==m.sequence)return;
        try{DriftRuntime.assertIdentity(m.runtimeIdentity,runtimeIdentity);}catch(error){fallback();return;}
        slot.busy=null;slot.cacheIds=new Set(Array.isArray(m.cacheIds)?m.cacheIds.filter(id=>typeof id==='string'):[]);results.set(m.sequence,m.result);if(running)pump();
      }else if(m.type==='error'){
        clearTimeout(timeout);if(!slot.ready)reject(Error(m.message));else fail(Error(m.message));
      }
    };
    worker.onerror=()=>{clearTimeout(timeout);if(!slot.ready)reject(Error('Evaluator unavailable'));else fallback();};
    worker.postMessage({type:'init',...configuration});
  }))).catch(()=>{if(token===initToken&&epoch===poolEpoch)fallback(false);});
  return poolPromise;
}
function drain(){
  while(running&&jobs.length&&results.has(jobs[0].sequence)){
    const job=jobs.shift(),result=results.get(job.sequence);results.delete(job.sequence);
    engine.acceptCandidate(job,result);
    const work=result.evaluation;
    if(work){for(const key of ['simulatedTicks','reusedTicks','totalTicks'])evaluationStats[key]+=work[key];if(work.cacheHit)evaluationStats.cacheHits++;}
    evaluationStats.evaluations++;publishCandidate();
    if(engine.generation>=stopGeneration){running=false;publish({type:'paused'});return;}
  }
}
function pump(){
  timer=null;if(!running||!engine)return;
  try{
    if(typeof engine.planCandidate!=='function'){
      engine.step(1);publishCandidate();if(engine.generation>=stopGeneration){running=false;publish({type:'paused'});}else timer=setTimeout(pump,5);return;
    }
    drain();if(!running)return;
    if(!jobs.length){let job;while((job=engine.planCandidate()))jobs.push({...job,dispatched:false});}
    if(!jobs.length)throw Error('No candidate could be reserved.');
    if(workerCount===1||!slots.length){
      const job=jobs[0];
      if(!results.has(job.sequence))results.set(job.sequence,evaluator.evaluate(job.gene,{id:job.id,parentId:job.parentId}));
      drain();if(running)timer=setTimeout(pump,1);return;
    }
    const dispatch=(slot,job)=>{job.dispatched=true;slot.busy=job.sequence;slot.worker.postMessage({type:'evaluate',sequence:job.sequence,id:job.id,parentId:job.parentId,gene:job.gene});};
    const idle=slots.filter(slot=>slot.ready&&slot.busy===null),pending=()=>jobs.filter(job=>!job.dispatched&&!results.has(job.sequence));
    // First preserve available parent locality, then keep every remaining
    // worker busy. Completion/acceptance order never controls RNG or parents.
    for(const slot of idle){const job=pending().find(job=>slot.cacheIds.has(job.parentId));if(job)dispatch(slot,job);}
    for(const slot of idle)if(slot.busy===null){const job=pending()[0];if(job)dispatch(slot,job);}
  }catch(error){fail(error);}
}
onmessage=async event=>{
  const m=event.data,current=m.type==='init'?++initToken:initToken;
  try{
    if(m.type==='init'){
      running=false;clearTimeout(timer);timer=null;cancelPool();jobs=[];results=new Map();engine=null;lastBest=null;evaluator=null;evaluationStats=emptyEvaluationStats();
      const vehicle=DriftCatalog.get(m.variantId),track=DriftTrack.get(m.trackId||DriftTrack.DEFAULT_ID,{includeDevelopment:m.includeDevelopment===true});
      runtimeIdentity=DriftRuntime.identity(vehicle,track);DriftRuntime.assertIdentity(m.runtimeIdentity,runtimeIdentity);
      evaluator=new DriftEvaluationCache.Evaluator(vehicle,track,{identity:runtimeIdentity});
      const baseline=await DriftPreparedGrips.load(vehicle,track);if(current!==initToken)return;
      configuration={variantId:vehicle.id,trackId:track.id,includeDevelopment:m.includeDevelopment===true,runtimeIdentity};
      const requested=Number(m.workers)||Math.max(1,(globalThis.navigator?.hardwareConcurrency||2)-1);
      workerCount=typeof Worker==='function'?Math.max(1,Math.min(4,Math.floor(requested))):1;
      engine=new DriftEvolution.Engine(vehicle,track,{seed:m.seed,populationSize:20,baseline});engine.initialize();
      if(!engine.ready)throw Error(engine.blockedReason||'준비된 기준 기록을 사용할 수 없습니다.');
      lastBest=engine.best.id;publish({type:'ready',baseline,best:engine.best,state:state()});
    }else if(m.type==='run'&&engine&&!running){
      clearTimeout(timer);running=true;stopGeneration=m.once?engine.generation+1:Infinity;
      await ensurePool();if(current===initToken&&running)pump();
    }else if(m.type==='pause'){
      // In-flight results wait for resume rather than changing a paused run.
      running=false;clearTimeout(timer);publish({type:'paused'});
    }
  }catch(error){if(current===initToken)fail(error);}
};
