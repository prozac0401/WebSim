'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Runtime=require('./runtime.js');

test('runtime identity is stable and binds physics, course and scoring without simulation',()=>{
 const Catalog=require('./catalog.js'),Track=require('./track.js'),Physics=require('./physics.js'),Fitness=require('./fitness.js');
 const vehicle=Catalog.get(),track=Track.create(),evaluate=Physics.evaluateGene;
 Physics.evaluateGene=()=>{throw Error('identity must not simulate');};
 try{
  const identity=Runtime.identity(vehicle,track);assert.equal(Runtime.identity(vehicle,track),identity);
  assert.notEqual(Runtime.identity({...vehicle,physics:{...vehicle.physics,massKg:vehicle.physics.massKg+1}},track),identity);
  assert.notEqual(Runtime.identity(vehicle,{...track,width:track.width+1}),identity);
  globalThis.DriftFitness={...Fitness,signature:()=>Fitness.signature()+'old'};
  assert.notEqual(Runtime.identity(vehicle,track),identity);
 }finally{Physics.evaluateGene=evaluate;globalThis.DriftFitness=Fitness;}
});

test('HTML and every worker import use the same versioned runtime assets',()=>{
 const html=fs.readFileSync(require.resolve('./evolving_drift.html'),'utf8');
 const paths=[...html.matchAll(/<script\b[^>]*src="([^"]+)"/g),...html.matchAll(/<link\b[^>]*href="([^" ]+\.css[^" ]*)"/g)].map(m=>m[1]);
 assert.ok(paths.some(p=>p.startsWith('runtime.js?')));assert.ok(paths.every(p=>new URL(p,'https://test.invalid/').searchParams.get('v')===Runtime.RELEASE));
 for(const file of ['worker.js','evaluation-worker.js']){
  const imported=[],context=vm.createContext({URLSearchParams,location:{search:'?v='+Runtime.RELEASE},DriftRuntime:Runtime,importScripts:(...paths)=>imported.push(...paths),onmessage:null});
  vm.runInContext(fs.readFileSync(require.resolve('./'+file),'utf8'),context);
  assert.ok(imported.length>10);assert.ok(imported.every(p=>new URL(p,'https://test.invalid/').searchParams.get('v')===Runtime.RELEASE));
  const names=imported.map(p=>p.split('?')[0]);
  assert(names.indexOf('manual-clutch.js')<names.indexOf('physics.js'));
  if(file==='worker.js')assert(names.indexOf('connection-analysis.js')<names.indexOf('trajectory-search.js')&&names.indexOf('trajectory-search.js')<names.indexOf('evolution.js'));
 }
 assert.equal(Runtime.url('record.js?x=1#part'),'record.js?x=1&v='+Runtime.RELEASE+'#part');
});

test('a pure evaluator requires a matching model before evaluating and stamps every result',()=>{
 const messages=[];let evaluations=0;
 const context=vm.createContext({URLSearchParams,importScripts(){},onmessage:null,postMessage:m=>messages.push(m),
  DriftRuntime:{...Runtime,identity:()=> 'matching-model'},DriftCatalog:{get:()=>({})},DriftTrack:{get:()=>({})},
  DriftEvaluationCache:{Evaluator:class{evaluate(){evaluations++;return{valid:true,status:'finished'};}cachedIds(){return[];}}},
  DriftPhysics:{evaluateGene(){evaluations++;return{valid:true,status:'finished'};}}});
 vm.runInContext(fs.readFileSync(require.resolve('./evaluation-worker.js'),'utf8'),context);
 const send=data=>context.onmessage({data});
 send({type:'init',runtimeIdentity:'old-model'});send({type:'evaluate',sequence:1,gene:[]});assert.equal(evaluations,0);
 assert.ok(messages.every(m=>m.type==='error'));
 send({type:'init',runtimeIdentity:'matching-model'});assert.equal(messages.at(-1).runtimeIdentity,'matching-model');
 send({type:'evaluate',sequence:2,gene:[]});assert.equal(evaluations,1);assert.equal(messages.at(-1).runtimeIdentity,'matching-model');
});

test('prepared record requests carry the release in both worker and page loaders',async()=>{
 const Genome=require('./genome.js'),source=fs.readFileSync(require.resolve('./prepared-grips.js'),'utf8');
 for(const worker of [true,false]){
  const requested=[],context=vm.createContext({URL,DriftGenome:Genome,DriftRuntime:Runtime,DriftPhysics:{signature:()=> 'fixed-model'}});
  if(worker)context.importScripts=path=>{requested.push(path);throw Error('requested');};
  else context.document={currentScript:{src:'https://example.invalid/evolving_drift/prepared-grips.js'},createElement:()=>({remove(){}}),head:{append(script){requested.push(script.src);script.onerror();}}};
  vm.runInContext(source,context);const api=context.DriftPreparedGrips;
  const vehicle={id:'test',physics:{}},track={id:'course',points:[],length:100,width:10,judgedStart:10,judgedEnd:90,sample(){},project(){}};
  context.DriftPreparedGripsManifest={schema:api.SCHEMA,genomeVersion:Genome.VERSION,stride:Genome.STRIDE,knots:Genome.KNOTS,entries:{[api.key(vehicle,track)]:{path:'grip-records/test.js',fingerprint:api.fingerprint(vehicle,track)}}};
  await assert.rejects(api.load(vehicle,track));assert.equal(requested.length,1);
  const url=new URL(requested[0],'https://example.invalid/evolving_drift/');assert.equal(url.searchParams.get('v'),Runtime.RELEASE);assert.ok(url.pathname.endsWith('/grip-records/test.js'));
 }
});
