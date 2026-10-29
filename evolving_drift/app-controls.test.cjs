'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Genome=require('./genome.js');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');

// Execute the real app and its handlers with a deliberately queued worker
// response. This tests the UI/worker boundary, not a copy of the control logic.
function environment({fallback=false,powered=false}={}){
  const elements=new Map(),workers=[],timers=new Map();let nextTimer=1,steps=0;
  function element(){return{value:'1',disabled:false,hidden:false,checked:false,textContent:'',classList:{toggle(){},remove(){}},
    setAttribute(){},append(){},before(){},replaceChildren(){},addEventListener(){},getContext(){return{save(){},restore(){},setTransform(){},clearRect(){}};}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const vehicle={id:'test-car',vehicleId:'test-car',label:'Test',physics:{peakPowerW:100000,peakTorque:200,massKg:1200},limitations:[],sourceUrl:'',spec:{factoryDrive:'RWD'}};
  const track={id:'test-track',name:'Test track',length:500,judgedStart:50,judgedEnd:450};
  const frame={time:0,s:0,x:0,y:0,yaw:0,speed:0,beta:0,steer:0,throttle:0,brake:0,gear:1,rpm:800,rearTorque:0,wheelSlip:[0,0,0,0]};
  const result={valid:true,status:'finished',score:1,time:30,maxAngle:powered?42:2,driftDistance:0};
  if(powered)result.power={success:true,bestExit:{distance:40,duration:2.1,startTime:12,entrySpeed:15,exitSpeed:20,distanceWeightedAngle:31.6}};
  const baseline={gene:Genome.create(),record:[frame],result,prepared:true};
  const best={...baseline,id:'baseline'};
  const state=()=>({generation:Math.floor(steps/20),totalEvaluated:steps,evaluated:steps%20,mutationScale:1,history:[],stats:{validCount:steps,failureCount:0}});
  class Worker{
    constructor(){this.messages=[];this.alive=true;workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.alive=false;}
    emit(message){this.onmessage?.({data:message});}
  }
  class Renderer{resize(){}render(){}retryVehicle(){}getState(){return{};}static sampleFrames(frames){return frames?.[0];}}
  class Engine{
    constructor(){this.ready=true;this.best=best;this.generation=0;this.lastCandidate=null;}
    initialize(){}snapshot(){return state();}
    step(){steps++;this.generation=Math.floor(steps/20);this.lastCandidate={...best,id:'candidate-'+steps};}
  }
  const window={addEventListener(){}};
  const context=vm.createContext({window,document:{getElementById:get,createElement:element,querySelector:element,querySelectorAll:()=>[],body:element(),addEventListener(){}},
    location:{protocol:fallback?'file:':'http:',search:''},URLSearchParams,requestAnimationFrame(){},
    setTimeout:fn=>{const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),Worker:fallback?undefined:Worker,
    DriftRenderer:Renderer,DriftGenome:Genome,DriftDriver:{TELEMETRY:[]},DriftPhysics:{initialState:()=>({...frame})},
    DriftCatalog:{DEFAULT_ID:vehicle.id,get:()=>vehicle,list:()=>[vehicle]},DriftTrack:{list:()=>[track]},
    DriftPreparedGrips:{load:async()=>baseline},DriftEvolution:{Engine}});
  vm.runInContext(source,context);
  return{get,workers,timers,state:()=>JSON.parse(window.render_game_to_text()),
    ready(worker=workers.at(-1)){worker.emit({type:'ready',baseline,best,state:state()});},
    tick(){const entry=timers.entries().next().value;if(entry){timers.delete(entry[0]);entry[1]();}},steps:()=>steps};
}

test('pause waits for its worker acknowledgement before allowing resume or one generation',()=>{
  const env=environment();env.ready();const worker=env.workers[0];
  env.get('evolve').onclick();assert.equal(worker.messages.at(-1).type,'run');
  env.get('evolve').onclick();assert.equal(worker.messages.at(-1).type,'pause');
  assert.equal(env.state().evolving,true);assert.equal(env.state().pauseRequested,true);
  assert.equal(env.get('evolve').disabled,true);assert.equal(env.get('one-generation').disabled,true);
  const count=worker.messages.length;
  env.get('evolve').onclick();env.get('one-generation').onclick();
  assert.equal(worker.messages.length,count,'even a queued/direct click cannot overtake the pause reply');
  worker.emit({type:'paused'});
  assert.equal(env.state().evolving,false);assert.equal(env.state().pauseRequested,false);
  assert.equal(env.get('evolve').disabled,false);assert.equal(env.get('one-generation').disabled,false);
  env.get('evolve').onclick();assert.equal(worker.messages.at(-1).type,'run');assert.equal(env.state().evolving,true);
});

test('error and reset clear a pending pause and old replies cannot change the new run',()=>{
  const env=environment();env.ready();const old=env.workers[0];
  env.get('evolve').onclick();env.get('evolve').onclick();old.emit({type:'error',message:'test failure'});
  assert.equal(env.state().pauseRequested,false);assert.equal(env.state().evolving,false);assert.equal(env.get('evolve').disabled,true);
  env.get('reset').onclick();env.ready();env.get('evolve').onclick();env.get('evolve').onclick();
  const pausedWorker=env.workers.at(-1);env.get('reset').onclick();
  assert.equal(env.state().pauseRequested,false);assert.equal(pausedWorker.alive,false);
  env.ready();env.get('evolve').onclick();pausedWorker.emit({type:'paused'});
  assert.equal(env.state().evolving,true);assert.equal(env.get('evolve').disabled,false);
});

test('file fallback cancels the pending tick before a fast pause and resume',async()=>{
  const env=environment({fallback:true});await new Promise(resolve=>setImmediate(resolve));
  env.get('evolve').onclick();assert.equal(env.timers.size,1);
  env.get('evolve').onclick();assert.equal(env.timers.size,0);assert.equal(env.state().evolving,false);
  env.get('evolve').onclick();assert.equal(env.timers.size,1);
  env.tick();assert.equal(env.steps(),1);assert.equal(env.timers.size,1,'exactly one loop remains after resume');
  env.get('reset').onclick();assert.equal(env.timers.size,0);
});

test('powered-exit replay seeks the measured interval and resets with a new experiment',()=>{
  const env=environment({powered:true});env.ready();
  assert.equal(env.get('powered-exit-distance').textContent,'40.0 m');
  assert.equal(env.get('best-angle').textContent,'31.6°');
  assert.equal(env.get('peak-angle').textContent,'순간 최대 42.0°');
  assert.equal(env.get('powered-exit-goal').textContent,'달성');
  assert.equal(env.get('powered-exit-speed').textContent,'54.0 → 72.0 km/h');
  assert.equal(env.get('replay-powered-exit').disabled,false);
  const messageCount=env.workers[0].messages.length;
  env.get('replay-powered-exit').onclick();
  assert.equal(env.state().replay.time,11.5);assert.equal(env.state().playing,true);
  assert.equal(env.workers[0].messages.length,messageCount,'replay does not start an evolution or re-simulate');
  env.get('reset').onclick();
  assert.equal(env.get('replay-powered-exit').disabled,true);assert.equal(env.state().playing,false);
  assert.equal(env.get('powered-exit-duration').textContent,'연속 가속 탈출');
  assert.equal(env.get('best-angle').textContent,'—');
  assert.equal(env.get('peak-angle').textContent,'순간 최대 —');
});
