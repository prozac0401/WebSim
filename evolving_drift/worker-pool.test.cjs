'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Genome=require('./genome.js'),Evolution=require('./evolution.js'),Runtime=require('./runtime.js');
const source=fs.readFileSync(require.resolve('./worker.js'),'utf8');
const vehicle={id:'fixed-rwd',physics:{maxSteer:.6,gearRatios:[3,2,1],wheelbaseM:2.6}},track={id:'test',length:500,judgedStart:120,judgedEnd:400,sample:s=>({s,x:s,y:0,heading:0,curvature:.01,widthLeft:7,widthRight:7})};
const evaluateGene=(_v,_t,g)=>({valid:true,status:'finished',score:1+Array.from(g).reduce((a,n,i)=>a+(i%8===4?Math.abs(n):0),0),time:30,driftDistance:0,frames:[{x:0,y:0,s:0,time:0} ]});
const baseline={gene:Genome.create(),genomeVersion:Genome.VERSION,stride:Genome.STRIDE,record:[{x:0,y:0,s:0,time:0}],result:{valid:true,status:'finished',score:1,time:30,driftDistance:0}};
class Evaluator{
  constructor(v,t){this.vehicle=v;this.track=t;this.ids=[];}
  evaluate(gene,{id,parentId}={}){const hit=this.ids.includes(parentId),reusedTicks=hit?80:0;this.ids.push(id);this.ids=this.ids.slice(-4);return{...evaluateGene(this.vehicle,this.track,gene),evaluation:{simulatedTicks:100-reusedTicks,reusedTicks,totalTicks:100,cacheHit:hit}};}
  cachedIds(){return this.ids.slice();}
}
function environment({broken=false,staleReady=false,staleResult=false,loadedFailure=false}={}){
  const messages=[],finished=[];
  class Worker{
    constructor(){if(broken)throw Error('No nested workers');this.alive=true;}
    postMessage(m){
      if(m.type==='init'){this.evaluator=new Evaluator(vehicle,track);setTimeout(()=>this.alive&&this.onmessage?.({data:{type:'ready',runtimeIdentity:staleReady?undefined:'test-runtime'}}),0);}
      else setTimeout(()=>{if(!this.alive)return;finished.push(m.sequence);const result=this.evaluator.evaluate(m.gene,{id:m.id,parentId:m.parentId});if(staleResult)result.score=999999;this.onmessage?.({data:{type:'result',sequence:m.sequence,runtimeIdentity:staleResult?'old-runtime':'test-runtime',result,cacheIds:this.evaluator.cachedIds()}});},(5-m.sequence%4)*4);
    }
    terminate(){this.alive=false;}
  }
  const context=vm.createContext({onmessage:null,URLSearchParams,DriftRuntime:{...Runtime,identity:()=>'test-runtime'},importScripts(){},postMessage:m=>messages.push(m),setTimeout,clearTimeout,Worker,
    DriftCatalog:{get:()=>vehicle},DriftTrack:{get:()=>track,DEFAULT_ID:track.id},DriftPreparedGrips:{load:async()=>baseline},DriftEvolution:Evolution,DriftPhysics:{evaluateGene},DriftEvaluationCache:{Evaluator:class extends Evaluator{evaluate(gene,options){const result=super.evaluate(gene,options);return loadedFailure&&options?.id==='loaded'?{...result,valid:false,status:'offtrack',score:1e12}:result;}}}});
  vm.runInContext(source,context);
  return {context,messages,finished,send:m=>context.onmessage({data:{runtimeIdentity:'test-runtime',...m}}),snapshot:()=>vm.runInContext('engine.snapshot()',context),close:()=>vm.runInContext('running=false;clearTimeout(timer);cancelPool()',context)};
}
async function until(fn){const deadline=Date.now()+5000;while(!fn()){if(Date.now()>deadline)throw Error('Pool did not settle');await new Promise(r=>setTimeout(r,5));}}
test('four workers commit out-of-order completions in the same seeded order as serial evaluation',async()=>{
  const serial=environment(),parallel=environment();
  try{
    for(const [env,workers]of [[serial,1],[parallel,4]]){await env.send({type:'init',workers,seed:37});await env.send({type:'run',once:true});await until(()=>env.messages.some(m=>m.type==='paused'));}
    const candidates=env=>env.messages.filter(m=>m.type==='candidate').map(m=>({id:m.candidate.id,gene:Array.from(m.candidate.gene),score:m.candidate.result.score}));
    assert.deepEqual(candidates(parallel),candidates(serial));assert.equal(parallel.snapshot().totalEvaluated,20);
    assert.notDeepEqual(parallel.finished,[...parallel.finished].sort((a,b)=>a-b),'exercise genuinely out-of-order replies');
  }finally{serial.close();parallel.close();}
});
test('pause holds in-flight results until resume and completes exactly one generation',async()=>{
  const env=environment();try{
    await env.send({type:'init',workers:4,seed:44});await env.send({type:'run',once:true});await until(()=>env.snapshot().totalEvaluated>=1);
    await env.send({type:'pause'});const paused=env.snapshot().totalEvaluated;await new Promise(r=>setTimeout(r,70));assert.equal(env.snapshot().totalEvaluated,paused);
    await env.send({type:'run',once:true});await until(()=>env.snapshot().generation===1);assert.equal(env.snapshot().totalEvaluated,20);
  }finally{env.close();}
});
test('unavailable nested workers fall back to ordered serial evaluation',async()=>{
  const env=environment({broken:true});try{
    await env.send({type:'init',workers:4,seed:37});await env.send({type:'run',once:true});await until(()=>env.messages.some(m=>m.type==='paused'));
    assert.equal(env.snapshot().totalEvaluated,20);assert.ok(!env.messages.some(m=>m.type==='error'));assert.equal(env.messages.filter(m=>m.type==='candidate').at(-1).state.workerCount,1);
  }finally{env.close();}
});
test('a reset discards old replies and keeps the new experiment at its prepared baseline',async()=>{
  const env=environment();try{
    await env.send({type:'init',workers:4,seed:37});await env.send({type:'run'});await env.send({type:'init',workers:4,seed:99});
    await new Promise(r=>setTimeout(r,70));assert.equal(env.snapshot().totalEvaluated,0);assert.equal(env.snapshot().best.id,'baseline');
  }finally{env.close();}
});

test('missing evaluator identity falls back before any unverified result is accepted',async()=>{
  const env=environment({staleReady:true});try{
    await env.send({type:'init',workers:4,seed:37});await env.send({type:'run',once:true});
    await until(()=>env.messages.some(m=>m.type==='paused'));
    assert.equal(env.snapshot().totalEvaluated,20);assert.equal(env.finished.length,0);
    assert.equal(env.messages.filter(m=>m.type==='candidate').at(-1).state.workerCount,1);
  }finally{env.close();}
});

test('a mismatched evaluator result is discarded and evaluated locally in reservation order',async()=>{
  const env=environment({staleResult:true});try{
    await env.send({type:'init',workers:4,seed:37});await env.send({type:'run',once:true});
    await until(()=>env.messages.some(m=>m.type==='paused'));
    const candidates=env.messages.filter(m=>m.type==='candidate');assert.equal(candidates.length,20);
    assert.ok(candidates.every(m=>m.candidate.result.score!==999999));assert.equal(candidates.at(-1).state.workerCount,1);
  }finally{env.close();}
});

test('a coordinator rejects a different page identity before loading a baseline',async()=>{
  const env=environment();try{
    await env.send({type:'init',workers:4,seed:37,runtimeIdentity:'old-page'});
    assert.ok(env.messages.some(m=>m.type==='error'&&m.message.includes('버전')));
    assert.ok(!env.messages.some(m=>m.type==='ready'));
  }finally{env.close();}
});

test('accepted work counters start at zero, sum exact ticks and reset with the experiment',async()=>{
 const env=environment();try{
  await env.send({type:'init',workers:4,seed:37});
  const plain=value=>JSON.parse(JSON.stringify(value)),zero={simulatedTicks:0,reusedTicks:0,totalTicks:0,cacheHits:0,evaluations:0};
  assert.deepEqual(plain(env.messages.at(-1).state.evaluationStats),zero);
  await env.send({type:'run',once:true});await until(()=>env.messages.some(m=>m.type==='paused'));
  const candidates=env.messages.filter(m=>m.type==='candidate'),last=candidates.at(-1).state.evaluationStats;
  assert.equal(last.evaluations,20);assert.equal(last.totalTicks,2000);assert.equal(last.totalTicks,last.simulatedTicks+last.reusedTicks);
  assert.deepEqual(candidates.map(m=>m.state.evaluationStats.evaluations),Array.from({length:20},(_,i)=>i+1));
  await env.send({type:'init',workers:4,seed:38});assert.deepEqual(plain(env.messages.at(-1).state.evaluationStats),zero);
 }finally{env.close();}
});

test('idle workers receive their cached parent jobs before general dispatch',()=>{
 const env=environment();try{
  vm.runInContext(`
    globalThis.dispatches=[];running=true;engine={};workerCount=2;
    jobs=[{id:'child-a',parentId:'parent-a',sequence:1,gene:[]},{id:'child-b',parentId:'parent-b',sequence:2,gene:[]}];
    slots=['parent-b','parent-a'].map((id,index)=>({busy:null,ready:true,cacheIds:new Set([id]),worker:{postMessage:m=>dispatches.push({slot:index,sequence:m.sequence,id:m.id,parentId:m.parentId}),terminate(){}}}));
    engine.planCandidate=()=>null;pump();
  `,env.context);
  const dispatched=JSON.parse(vm.runInContext('JSON.stringify(dispatches)',env.context));
  assert.deepEqual(dispatched,[{slot:0,sequence:2,id:'child-b',parentId:'parent-b'},{slot:1,sequence:1,id:'child-a',parentId:'parent-a'}]);
 }finally{env.close();}
});

test('loading re-evaluates the gene and ignores supplied score/frames before using it as the evolution origin',async()=>{
 const env=environment();try{
  const gene=Genome.create();gene[Genome.CHANNELS.throttle]=.7;
  await env.send({type:'init',workers:1,seed:37,initialRun:{gene,genomeVersion:Genome.VERSION,result:{valid:true,status:'finished',score:1e12},record:[{x:999999}]}});
  const ready=env.messages.find(m=>m.type==='ready');assert.ok(ready);assert.equal(ready.state.initialRunAccepted,true);
  assert.equal(ready.best.id,'loaded');assert.equal(ready.loaded.id,'loaded');assert.notEqual(ready.loaded.result.score,1e12);
  assert.equal(ready.loaded.record[0].x,0);assert.equal(ready.baseline.record,baseline.record);assert.equal(ready.baseline.result,vm.runInContext('engine.baselineRun.result',env.context));assert.deepEqual(Array.from(ready.loaded.gene),Array.from(gene));
  await env.send({type:'run',once:true});await until(()=>env.messages.some(m=>m.type==='paused'));
  const candidates=env.messages.filter(m=>m.type==='candidate');assert.equal(candidates.length,20);assert.ok(candidates.every(m=>m.candidate.parentId==='loaded'));
 }finally{env.close();}
});

test('a failed loaded physical replay is published without ever becoming a parent or starting evaluation',async()=>{
 const env=environment({loadedFailure:true});try{
  await env.send({type:'init',workers:4,initialRun:{gene:Genome.create(),genomeVersion:Genome.VERSION}});
  const ready=env.messages.find(m=>m.type==='ready');assert.ok(ready);assert.equal(ready.state.initialRunAccepted,false);assert.equal(ready.state.ready,false);
  assert.equal(ready.loaded.accepted,false);assert.equal(ready.loaded.result.score,0);assert.equal(ready.best.id,'baseline');
  await env.send({type:'run'});await new Promise(r=>setTimeout(r,25));assert.equal(env.snapshot().totalEvaluated,0);
  assert.ok(env.messages.some(m=>m.type==='paused'&&m.reason.includes('재생만')));assert.ok(!env.messages.some(m=>m.type==='candidate'));
 }finally{env.close();}
});

test('a load discards old evaluator replies and admits only the new loaded origin',async()=>{
 const env=environment();try{
  await env.send({type:'init',workers:4,seed:37});await env.send({type:'run'});
  const gene=Genome.create();gene[Genome.CHANNELS.throttle]=.8;
  await env.send({type:'init',workers:4,seed:99,initialRun:{gene,genomeVersion:Genome.VERSION}});
  await new Promise(r=>setTimeout(r,70));assert.equal(env.snapshot().totalEvaluated,0);assert.equal(env.snapshot().best.id,'loaded');
  assert.deepEqual(Array.from(env.snapshot().best.gene),Array.from(gene));
 }finally{env.close();}
});

test('incompatible imported genome versions fail before publishing a loaded experiment',async()=>{
 const env=environment();try{
  await env.send({type:'init',workers:1,initialRun:{gene:Genome.create(),genomeVersion:Genome.VERSION-1}});
  assert.ok(env.messages.some(m=>m.type==='error'&&m.message.includes('유전자 버전')));assert.ok(!env.messages.some(m=>m.type==='ready'));
 }finally{env.close();}
});
