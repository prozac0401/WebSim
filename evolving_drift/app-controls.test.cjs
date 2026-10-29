'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Genome=require('./genome.js'),Runtime=require('./runtime.js');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');
const html=fs.readFileSync(require.resolve('./evolving_drift.html'),'utf8'),pageIds=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));

// Execute the real app and its handlers with a deliberately queued worker
// response. This tests the UI/worker boundary, not a copy of the control logic.
function environment({fallback=false,apex=false,broken=false,complete=false,early=false,straight=false,linked=false,linkUnmeasured=false,transitioning=false,score=1,duration=30,timeline=null,evaluationStats=null,learningStats=null}={}){
  const elements=new Map(),workers=[],timers=new Map();let nextTimer=1,steps=0,scoreCalls=0,lastRender=null;
  function element(){return{children:[],value:'1',disabled:false,hidden:false,checked:false,textContent:'',classList:{toggle(){},remove(){}},
    setAttribute(){},append(...items){this.children.push(...items);},before(){},replaceChildren(...items){this.children=items;},addEventListener(type,handler){this['on'+type]=handler;},getContext(){return{save(){},restore(){},setTransform(){},clearRect(){}};}};}
  const get=id=>{assert.ok(pageIds.has(id),'UI must not access a removed DOM target: '+id);if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const vehicle={id:'test-car',vehicleId:'test-car',label:'Test',physics:{peakPowerW:100000,peakTorque:200,massKg:1200},limitations:[],sourceUrl:'',spec:{factoryDrive:'RWD'}};
  const track={id:'test-track',name:'Test track',length:500,judgedStart:50,judgedEnd:450};
  const frame={time:0,s:0,x:0,y:0,yaw:0,speed:0,beta:0,steer:0,throttle:0,brake:0,gear:1,rpm:800,rearTorque:0,wheelSlip:[0,0,0,0]};
  const result={valid:true,status:'finished',score,time:duration,maxAngle:apex?42:2,driftDistance:0};
  if(apex)result.drift={fullConnectionCount:complete?1:0,totalArcCount:2,parts:{sideways:20,connection:10,curve:8,propulsion:1},bestArc:{distance:40,duration:2.1,startTime:12,endTime:14.1,entrySpeed:20,minSpeed:18,exitSpeed:19,distanceWeightedAngle:31.6,speedRetention:.9,speedScope:'apex-window',curveQuality:.85,anchored:true,connectionCoverage:complete?1:.65,complete,initiationS:early?30:60,initiationTime:early?7:12,startedBeforeStart:early}};
  if(result.drift)Object.assign(result.drift,{straightLinkCount:linked?1:0,totalLinkCount:straight?2:0,bestLink:straight?{id:'link-1',fromZoneId:'apex-1',toZoneId:'apex-2',start:100,end:200,straightStart:130,straightEnd:170,coverage:linked?1:.6,complete:linked,distance:100,duration:13,startTime:12,endTime:25,entrySpeed:20,minSpeed:linkUnmeasured?0:18.4,exitSpeed:19,speedRetention:linkUnmeasured?0:.92,transitionDuration:.2,transitionDistance:4,score:3}:null});
  if(result.drift)result.drift.scoring={score:1,parts:{base:.5,continuity:.3,zone:.2},maxChainDistance:65,maxMultiplier:1.8,meanAngle:31.6,scoredDistance:100};
  const baseline={gene:Genome.create(),record:[frame],result,prepared:true};
  const best={...baseline,id:'baseline'};
  const state=()=>({generation:Math.floor(steps/20),totalEvaluated:steps,evaluated:steps%20,mutationScale:1,history:[],stats:{validCount:steps,failureCount:0},evaluationStats,learningStats});
  class Worker{
    constructor(){this.messages=[];this.alive=true;workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.alive=false;}
    emit(message){this.onmessage?.({data:{runtimeIdentity:'test-runtime',...message}});}
  }
  class Renderer{resize(){}render(options){lastRender=options;}retryVehicle(){}getState(){return{};}static sampleFrames(frames){return frames?.[0];}}
  class Engine{
    constructor(){this.ready=true;this.best=best;this.generation=0;this.lastCandidate=null;}
    initialize(){}snapshot(){return state();}
    step(){steps++;this.generation=Math.floor(steps/20);this.lastCandidate={...best,id:'candidate-'+steps};}
  }
  const window={addEventListener(){}};
  const context=vm.createContext({window,document:{getElementById:get,createElement:element,querySelector:element,querySelectorAll:()=>[],body:element(),addEventListener(){}},
    location:{protocol:fallback?'file:':'http:',search:''},URLSearchParams,requestAnimationFrame(){},
    setTimeout:fn=>{const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),Worker:fallback?undefined:Worker,
    DriftRuntime:{...Runtime,identity:()=>'test-runtime'},DriftRenderer:Renderer,DriftGenome:Genome,DriftDriver:{TELEMETRY:[]},DriftPhysics:{initialState:()=>({...frame})},
    DriftCatalog:{DEFAULT_ID:vehicle.id,get:()=>vehicle,list:()=>[vehicle]},DriftTrack:{list:()=>[track]},
    DriftPreparedGrips:{load:async()=>baseline},DriftEvolution:{Engine},DriftFitness:{replayTimeline(result){scoreCalls++;if(timeline)return timeline;return [
      {time:0,score:0,delta:0,earning:false,provisional:true,fullConnectionCount:0,totalArcCount:2,straightLinkCount:0,totalLinkCount:straight?2:0,phase:'course',reason:'속도 조건 필요',conditions:{},parts:{base:0,continuity:0,zone:0}},
      ...(early?[{time:8,score:.1,delta:.01,earning:true,provisional:true,fullConnectionCount:0,totalArcCount:2,phase:'course',reason:'전체 코스 드리프트 득점',chainMultiplier:1.1,combinedMultiplier:1.1,chainDistance:6,conditions:{speed:true,angle:true,retention:true,forward:true},parts:{base:.09,continuity:.01,zone:0}}]:[]),
      {time:15,fullConnectionCount:complete?1:0,totalArcCount:2,score:.75,delta:broken?0:.02,earning:!broken,provisional:true,phase:'zone',reason:broken?'연속 중단 · 배수 1로 초기화':'ZONE 드리프트 득점',chainMultiplier:broken?1:1.5,zoneMultiplier:2,combinedMultiplier:broken?2:3,chainDistance:broken?0:40,referenceSpeed:20,speedRetention:.9,conditions:{angle:!broken,speed:true,retention:true,forward:true},parts:{base:.4,continuity:.2,zone:.15},arc:result.drift?.bestArc||null},
      ...(straight?[{time:20,score:.8,delta:transitioning?0:.05,earning:!transitioning,provisional:true,fullConnectionCount:complete?1:0,totalArcCount:2,straightLinkCount:0,totalLinkCount:2,phase:transitioning?'transition':'course',reason:transitioning?'방향 전환 · 배수 유지':'전체 코스 드리프트 득점',transitioning,chainMultiplier:1.6,combinedMultiplier:1.6,chainDistance:50,conditions:{angle:!transitioning,speed:true,retention:true,forward:true},parts:{base:.4,continuity:.25,zone:.15},link:{...result.drift.bestLink,coverage:.6,complete:false}},
        {time:25,score:.9,delta:.1,earning:true,provisional:true,fullConnectionCount:complete?1:0,totalArcCount:2,straightLinkCount:linked?1:0,totalLinkCount:2,phase:'course',reason:'전체 코스 드리프트 득점',chainMultiplier:1.8,combinedMultiplier:1.8,chainDistance:65,conditions:{angle:true,speed:true,retention:true,forward:true},parts:{base:.4,continuity:.35,zone:.15},link:result.drift.bestLink}]:[]),
      {time:30,fullConnectionCount:complete?1:0,totalArcCount:2,score:result.valid?result.score:0,delta:0,earning:false,provisional:false,finalValid:result.valid,phase:'course',reason:result.valid?'완주 · 점수 확정':(result.status==='collision'?'차체 충돌':'앞바퀴 이탈')+' · 점수 무효',conditions:{},parts:result.valid?{base:.5,continuity:.3,zone:.2}:{base:0,continuity:0,zone:0}}
    ].map(row=>({chainMultiplier:1,zoneMultiplier:1,combinedMultiplier:1,chainDistance:0,...row}));}}});
  vm.runInContext(source,context);
  return{get,workers,timers,state:()=>JSON.parse(window.render_game_to_text()),render:()=>lastRender,advance:ms=>window.advanceTime(ms),
    ready(worker=workers.at(-1)){worker.emit({type:'ready',baseline,best,state:state()});},
    tick(){const entry=timers.entries().next().value;if(entry){timers.delete(entry[0]);entry[1]();}},steps:()=>steps,scoreCalls:()=>scoreCalls,
    updateStats(evaluation,learning){evaluationStats=evaluation;learningStats=learning;workers.at(-1).emit({type:'candidate',candidate:{...best,id:'stats-candidate'},best,state:state()});},
    publishBest(id='new-best',score=2){const entry={...best,id,record:[{...frame}],result:{...result,score}};workers.at(-1).emit({type:'candidate',candidate:entry,best:entry,state:state()});},
    selectFailure(status='offtrack',failureAnalysis=null){const entry={...best,id:'failed-test',record:[{...frame}],result:{...result,valid:false,status,failureAnalysis}};workers.at(-1).emit({type:'candidate',candidate:entry,best,state:state()});get('records').children.find(row=>row.children[0].textContent==='failed-test').onclick();}};
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

test('the page rejects an old coordinator ready response instead of enabling evolution',()=>{
  const env=environment(),worker=env.workers[0];worker.emit({type:'ready',runtimeIdentity:undefined});
  assert.equal(env.state().mode,'baseline-unavailable');assert.equal(env.get('evolve').disabled,true);
  assert.equal(worker.alive,false);assert.match(env.state().baselineError,/버전/);
  assert.match(env.get('baseline-notice-detail').textContent,/새로고침/);
});

test('the page rejects a mismatched candidate without adding it to replay or parents',()=>{
  const env=environment();env.ready();const before=env.state(),worker=env.workers[0];
  worker.emit({type:'candidate',runtimeIdentity:'old-worker'});
  const after=env.state();assert.equal(after.mode,'error');assert.equal(after.score,before.score);
  assert.equal(after.lastCandidate,null);assert.equal(worker.alive,false);assert.equal(env.get('evolve').disabled,true);
  assert.equal(after.release,Runtime.RELEASE);
});

test('a worker bootstrap release mismatch visibly asks for a page update',()=>{
  const env=environment();env.workers[0].onerror({message:'Uncaught Error: 실행 파일의 버전이 다릅니다. 페이지를 새로고침한 뒤 새 실험을 시작해 주세요.'});
  assert.equal(env.get('baseline-notice-title').textContent,'실행 파일 업데이트 필요');
  assert.match(env.get('baseline-notice-detail').textContent,/새로고침/);assert.equal(env.get('evolve').disabled,true);
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

test('the highest valid record autoplays, holds its finish for one real second, and loops while evolution continues',()=>{
  const env=environment();env.ready();env.get('evolve').onclick();const worker=env.workers[0],messages=worker.messages.length;
  assert.equal(env.state().evolving,true);assert.equal(env.state().playing,true);assert.equal(env.state().replay.autoFollow,true);
  env.advance(31000);
  const finished=env.state();assert.equal(finished.replay.id,'baseline');assert.equal(finished.replay.time,30);
  assert.equal(finished.playing,true);assert.equal(finished.replay.finishHoldMs,1000);assert.equal(finished.evolving,true);assert.equal(env.get('play').textContent,'Ⅱ 일시정지');
  assert.match(env.get('run-state').textContent,/유효 완주/);assert.equal(env.get('replay-score-label').textContent,'확정 점수');
  env.updateStats({simulatedTicks:120,reusedTicks:0,totalTicks:120,cacheHits:0,evaluations:1},{enabled:true,failuresAnalyzed:0,guidedProposals:0});
  const heldRecord=env.render().record;env.get('playback').value='4';env.advance(999);
  assert.equal(env.state().replay.time,30);assert.equal(env.render().record,heldRecord);assert.equal(env.state().replay.finishHoldMs,1);
  env.advance(1);assert.equal(env.state().replay.id,'baseline');assert.equal(env.state().replay.time,0);assert.equal(env.state().playing,true);
  env.advance(250);assert.equal(env.state().replay.time,1);
  assert.equal(env.state().evaluationStats.evaluations,1);assert.equal(worker.messages.length,messages,'finishing the replay does not pause background evaluation');
});

test('a new highest record immediately replaces autoplay or its finish hold, while lower candidates do not',()=>{
  const env=environment();env.ready();assert.equal(env.state().playing,true);env.advance(1000);
  env.publishBest();assert.equal(env.state().replay.id,'new-best');assert.equal(env.state().replay.time,0);assert.equal(env.state().playing,true);
  env.advance(31000);assert.equal(env.state().replay.finishHoldMs,1000);
  env.publishBest('newer-best',3);assert.equal(env.state().replay.id,'newer-best');assert.equal(env.state().replay.time,0);assert.equal(env.state().replay.finishHoldMs,0);
  env.advance(1000);env.updateStats(null,null);assert.equal(env.state().replay.id,'newer-best');assert.equal(env.state().replay.time,1);assert.equal(env.state().score,3);
});

test('manual pause during the finish hold prevents looping and new-best interruption until representative selection',()=>{
  const env=environment();env.ready();env.get('evolve').onclick();env.advance(31000);
  env.get('play').onclick();assert.equal(env.state().replay.time,30);assert.equal(env.state().playing,false);assert.equal(env.state().replay.autoFollow,false);
  env.publishBest();env.advance(5000);assert.equal(env.state().replay.id,'baseline');assert.equal(env.state().replay.time,30);
  env.get('play').onclick();assert.equal(env.state().replay.time,0);assert.equal(env.state().playing,true);
  env.advance(1000);assert.equal(env.state().replay.time,1);
  env.advance(30000);env.get('restart').onclick();assert.equal(env.state().replay.time,0);assert.equal(env.state().playing,false);
  env.get('records').children.find(row=>row.children[0].textContent==='new-best · 대표').onclick();
  assert.equal(env.state().replay.id,'new-best');assert.equal(env.state().replay.time,0);assert.equal(env.state().playing,true);assert.equal(env.state().replay.autoFollow,true);
});

test('manual seeking and candidate inspection are preserved until evolution starts again',()=>{
  const env=environment();env.ready();env.get('timeline').value='500';env.get('timeline').oninput();
  assert.equal(env.state().playing,false);assert.equal(env.state().replay.autoFollow,false);assert.equal(env.state().replay.time,15);
  env.publishBest();assert.equal(env.state().replay.id,'baseline');assert.equal(env.state().replay.time,15);
  env.updateStats(null,null);
  env.get('records').children.find(row=>row.children[0].textContent==='stats-candidate').onclick();
  assert.equal(env.state().replay.id,'stats-candidate');assert.equal(env.state().replay.time,0);assert.equal(env.state().playing,false);
  env.get('play').onclick();env.advance(1000);assert.equal(env.state().replay.time,1);
  env.publishBest('newer-best',3);assert.equal(env.state().replay.id,'stats-candidate');assert.equal(env.state().replay.time,1);
  env.get('evolve').onclick();assert.equal(env.state().replay.id,'newer-best');assert.equal(env.state().replay.time,0);assert.equal(env.state().replay.autoFollow,true);assert.equal(env.state().playing,true);
  env.get('reset').onclick();env.ready();assert.equal(env.state().replay.id,'baseline');assert.equal(env.state().replay.time,0);assert.equal(env.state().evolving,false);assert.equal(env.state().playing,true);
});

test('evolution pause acknowledgement does not override manual inspection or restart autoplay',()=>{
  const env=environment();env.ready();env.get('evolve').onclick();env.advance(1000);env.get('evolve').onclick();
  assert.equal(env.state().playing,false);assert.equal(env.state().replay.autoFollow,false);
  env.selectFailure();env.publishBest();env.workers[0].emit({type:'paused'});env.advance(5000);
  assert.equal(env.state().replay.id,'failed-test');assert.equal(env.state().replay.time,0);assert.equal(env.state().playing,false);
  env.get('one-generation').onclick();assert.equal(env.state().replay.id,'new-best');assert.equal(env.state().replay.autoFollow,true);assert.equal(env.state().playing,true);
  env.workers[0].emit({type:'paused'});assert.equal(env.state().evolving,false);assert.equal(env.state().playing,true,'automatic one-generation completion preserves autoplay');
});

test('representative summary shows whole-course continuity while the corner replay shortcut still seeks its interval',()=>{
  const env=environment({apex:true});env.ready();
  assert.equal(env.get('best-summary').textContent,'최장 연결 65.0 m · 최고 연속 ×1.80 · 평균 31.6°');
  assert.equal(env.get('full-connections').textContent,'0 / 2');
  assert.equal(env.state().objective.type,'whole-course-continuous-drift');assert.equal(env.state().objective.scoring.maxChainDistance,65);
  assert.equal(env.get('replay-apex-arc').disabled,false);
  const messageCount=env.workers[0].messages.length;
  env.get('replay-apex-arc').onclick();
  assert.equal(env.state().replay.time,11.5);assert.equal(env.state().playing,true);
  assert.equal(env.workers[0].messages.length,messageCount,'replay does not start an evolution or re-simulate');
  env.get('reset').onclick();
  assert.equal(env.get('replay-apex-arc').disabled,true);assert.equal(env.state().playing,false);
  assert.equal(env.get('best-summary').textContent,'연속 드리프트를 탐색하고 있습니다.');assert.equal(env.get('full-connections').textContent,'—');
});

test('replay scoring follows seeks, caches the timeline and invalidates a failed finish',()=>{
  const env=environment({apex:true});env.ready();assert.equal(env.scoreCalls(),1);
  assert.equal(env.state().replayScoring.phase,'course');assert.equal(env.get('replay-score').textContent,'0.00');
  env.get('timeline').value='500';env.get('timeline').oninput();
  assert.equal(env.state().replayScoring.earning,true);assert.equal(env.get('replay-score').textContent,'0.75');
  assert.match(env.get('score-speed').textContent,/속도 기준 72.0 km\/h · 현재 속도 유지율 90.0%/);
  assert.equal(env.get('score-criteria').children.length,4,'only actual scoring prerequisites are listed');
  assert.match(env.get('score-parts').textContent,/기본 득점 0.40/);
  env.get('timeline').value='1000';env.get('timeline').oninput();assert.equal(env.get('replay-score-label').textContent,'확정 점수');
  env.get('restart').onclick();assert.equal(env.state().replayScoring.score,0);assert.equal(env.scoreCalls(),1,'seeking does not rebuild or simulate');
  env.selectFailure();env.get('timeline').value='1000';env.get('timeline').oninput();
  assert.equal(env.get('replay-score').textContent,'0.00');assert.equal(env.get('replay-score-label').textContent,'점수 무효');assert.equal(env.state().replayScoring.finalValid,false);
  assert.equal(env.get('score-parts').textContent,'무효 처리: 기본 득점 0.00 · 연속 배수 가산 0.00 · ZONE 가산 0.00');
  assert.match(env.get('score-reason').textContent,/앞바퀴 이탈/);assert.equal(env.get('records').children.find(row=>row.children[0].textContent.includes('failed-test')).children[1].textContent,'앞바퀴 이탈 · 실패');
  env.selectFailure('collision');env.get('timeline').value='1000';env.get('timeline').oninput();
  assert.equal(env.get('replay-score').textContent,'0.00');assert.match(env.get('score-reason').textContent,/차체 충돌/);assert.equal(env.get('records').children.find(row=>row.children[0].textContent.includes('failed-test')).children[1].textContent,'차체 충돌 · 실패');
  env.get('reset').onclick();assert.equal(env.state().replayScoring,null);assert.equal(env.get('replay-scoring').hidden,true);
});


test('a broken chain resets continuity to one without subtracting earlier points or displaying reassessment',()=>{
  const env=environment({apex:true,broken:true});env.ready();env.get('timeline').value='500';env.get('timeline').oninput();
  assert.equal(env.state().replayScoring.conditions.angle,false);assert.equal(env.state().replayScoring.earning,false);
  assert.equal(env.get('score-change').textContent,'득점 없음');assert.equal(env.get('replay-score').textContent,'0.75');
  assert.equal(env.get('score-reason').textContent,'연속 중단 · 배수 1로 초기화');
  assert.equal(env.get('score-chain-multiplier').textContent,'×1.00');assert.equal(env.get('score-zone-multiplier').textContent,'×2');assert.equal(env.get('score-combined-multiplier').textContent,'×2.00');
  assert.equal(env.get('score-exit').textContent,'현재 연속 드리프트 0.0 m');
});

test('a recoverable spin retains earned points and shows a reset multiplier without a failure label',()=>{
  const rows=[
    {time:0,score:10,delta:1,earning:true,provisional:true,chainMultiplier:1.5,reason:'연속 드리프트 득점'},
    {time:15,score:10,delta:0,earning:false,provisional:true,chainMultiplier:1,reason:'스핀 · 연속 배수 초기화 · 기존 점수 유지'},
    {time:30,score:12,delta:1,earning:true,provisional:false,finalValid:true,chainMultiplier:1.2,reason:'완주 · 점수 확정'}
  ].map(row=>({phase:'course',zoneMultiplier:1,combinedMultiplier:row.chainMultiplier,chainDistance:0,conditions:{},parts:{base:row.score,continuity:0,zone:0},...row}));
  const env=environment({timeline:rows});env.ready();env.get('timeline').value='500';env.get('timeline').oninput();
  assert.equal(env.get('replay-score').textContent,'10.00');assert.equal(env.get('score-chain-multiplier').textContent,'×1.00');assert.equal(env.get('replay-score-label').textContent,'잠정 점수');
  assert.equal(env.get('score-change').textContent,'득점 없음');assert.match(env.get('score-reason').textContent,/스핀.*점수 유지/);assert.equal(env.get('failure-analysis').hidden,true);
  env.get('timeline').value='1000';env.get('timeline').oninput();assert.equal(env.get('replay-score').textContent,'12.00');assert.equal(env.get('replay-score-label').textContent,'확정 점수');
});

test('current continuity, zone and combined multipliers follow replay position without multiplying old points',()=>{
  const env=environment({apex:true,straight:true});env.ready();
  assert.equal(env.get('score-chain-multiplier').textContent,'×1.00');assert.equal(env.get('score-zone-multiplier').textContent,'×1');assert.equal(env.get('score-combined-multiplier').textContent,'×1.00');
  env.get('timeline').value='500';env.get('timeline').oninput();
  assert.equal(env.get('score-chain-multiplier').textContent,'×1.50');assert.equal(env.get('score-zone-multiplier').textContent,'×2');assert.equal(env.get('score-combined-multiplier').textContent,'×3.00');
  assert.equal(env.get('replay-score').textContent,'0.75');assert.equal(env.get('score-change').textContent,'+0.02점');assert.equal(env.get('score-phase').textContent,'ZONE 구간');
  env.get('timeline').value=String(20/30*1000);env.get('timeline').oninput();
  assert.equal(env.get('score-chain-multiplier').textContent,'×1.60');assert.equal(env.get('score-zone-multiplier').textContent,'×1');assert.equal(env.get('score-combined-multiplier').textContent,'×1.60');
  assert.equal(env.get('replay-score').textContent,'0.80');assert.equal(env.get('score-change').textContent,'+0.05점');
  env.get('restart').onclick();assert.equal(env.get('score-chain-multiplier').textContent,'×1.00');assert.equal(env.get('replay-score').textContent,'0.00');assert.equal(env.scoreCalls(),1);
});

test('an allowed transition retains its multiplier but displays no new earnings',()=>{
  const env=environment({apex:true,straight:true,transitioning:true});env.ready();env.get('timeline').value=String(20/30*1000);env.get('timeline').oninput();
  assert.equal(env.get('score-phase').textContent,'방향 전환');assert.equal(env.get('score-change').textContent,'득점 없음');
  assert.equal(env.get('score-chain-multiplier').textContent,'×1.60');assert.equal(env.get('score-link-transition').hidden,false);
  assert.match(env.get('score-link-transition').textContent,/배수 유지.*증가는 정지/);
});

test('full-course accumulated points can exceed one hundred without a display cap',()=>{
  const env=environment({score:246.81});env.ready();assert.equal(env.get('best-score').textContent,'246.81');
  env.get('timeline').value='1000';env.get('timeline').oninput();assert.equal(env.get('replay-score').textContent,'246.81');assert.equal(env.get('replay-score-label').textContent,'확정 점수');
});

test('real Fitness replay samples drive the visible total, zone multiplier, continuity reset and final score',()=>{
  const Fitness=require('./fitness.js'),road={length:100,width:14,judgedStart:30,judgedEnd:70,zones:[{s:30,length:15}],sample:s=>({x:s,y:0,heading:0,curvature:0})};
  const car={physics:{massKg:1500}},frames=[];
  for(let i=0;i<=195;i++){
    const s=2.5+i*.5,beta=s>=60&&s<=64?0:.5;
    frames.push({time:i*.025,s,x:s,y:0,vx:20,vy:0,speed:20,yaw:-beta,beta,r:0,throttle:.5,brake:0,rearTorque:1000,status:i===195?'finished':'running'});
  }
  const raw={valid:true,status:'finished',score:0,time:frames.at(-1).time,frames};
  const ranked=Fitness.rank(car,road,raw,frames,{reference:frames}),timeline=Fitness.replayTimeline(ranked,road,car,frames);
  const env=environment({score:ranked.score,duration:raw.time,timeline});env.ready();
  const seek=s=>{const row=timeline.find(row=>row.s>=s);env.get('timeline').value=String(row.time/raw.time*1000);env.get('timeline').oninput();return row;};
  const beforeZone=seek(20);assert.ok(beforeZone.score>0);assert.equal(env.get('score-zone-multiplier').textContent,'×1');
  const inZone=seek(35);assert.equal(env.get('score-zone-multiplier').textContent,'×2');assert.equal(env.get('score-combined-multiplier').textContent,'×'+inZone.combinedMultiplier.toFixed(2));
  const stopped=seek(60),stillStopped=seek(63);assert.equal(stopped.score,stillStopped.score);assert.equal(env.get('replay-score').textContent,stillStopped.score.toFixed(2));
  assert.equal(env.get('score-chain-multiplier').textContent,'×1.00');assert.equal(env.get('score-change').textContent,'득점 없음');
  env.get('timeline').value='1000';env.get('timeline').oninput();assert.equal(env.get('replay-score-label').textContent,'확정 점수');assert.equal(env.get('replay-score').textContent,ranked.score.toFixed(2));
  assert.equal(env.scoreCalls(),1);
});


test('full apex connection is distinct from crossing and is shown only for valid candidate records',()=>{
  const env=environment({apex:true,complete:true});env.ready();
  assert.equal(env.get('full-connections').textContent,'1 / 2');assert.equal(env.state().objective.fullConnectionCount,1);
  assert.match(env.get('records').children[0].children[2].textContent,/완전 1 \/ 2/);
  env.get('timeline').value='500';env.get('timeline').oninput();
  assert.match(env.get('score-connection').textContent,/코너 연결 1 \/ 2 · 완전 연결/);assert.equal(env.state().replayScoring.arc.complete,true);
  env.selectFailure();const failed=env.get('records').children.find(row=>row.children[0].textContent.includes('failed-test'));
  assert.equal(failed.children[2].textContent,'선발 제외');
});

test('drift before the former scoring start earns across the full course and its replay shortcut remains usable',()=>{
  const env=environment({apex:true,early:true});env.ready();
  env.get('replay-apex-arc').onclick();assert.equal(env.state().replay.time,6.5,'actual initiation predates the scored start at12s');
  env.get('timeline').value=String(8/30*1000);env.get('timeline').oninput();
  assert.equal(env.get('score-phase').textContent,'일반 코스');assert.equal(env.get('score-zone-multiplier').textContent,'×1');
  assert.equal(env.state().replayScoring.earning,true);assert.equal(env.get('replay-score').textContent,'0.10');assert.equal(env.get('score-change').textContent,'+0.01점');
  assert.equal(env.get('score-chain-multiplier').textContent,'×1.10');assert.equal(pageIds.has('score-prestart'),false);
  env.get('reset').onclick();assert.equal(env.get('replay-apex-arc').disabled,true);assert.equal(env.state().replayScoring,null);
});

test('straight drift links show current progress, transition and completed counts independently of corner completion',()=>{
  const env=environment({apex:true,straight:true,linked:true});env.ready();
  assert.equal(env.get('full-connections').textContent,'0 / 2');assert.equal(env.get('straight-links').textContent,'1 / 2');
  assert.equal(env.state().objective.straightLinkCount,1);
  assert.equal(env.state().objective.bestLink.fromZoneId,'apex-1');assert.equal(env.get('replay-straight-link').disabled,false);
  const messageCount=env.workers[0].messages.length;env.get('replay-straight-link').onclick();
  assert.equal(env.state().replay.time,11.5);assert.equal(env.state().playing,true);assert.equal(env.workers[0].messages.length,messageCount);
  env.get('timeline').value=String(20/30*1000);env.get('timeline').oninput();
  assert.equal(env.get('score-phase').textContent,'일반 코스');
  assert.equal(env.get('score-link').textContent,'직선 연결 0 / 2 · 앞뒤 코너 연결 중');
  assert.equal(env.get('score-link-detail').textContent,'직선 연결률 60.0% · 직선 내 최저속도 유지율 92.0%');
  assert.equal(env.get('score-link-transition').hidden,true);
  assert.equal(env.get('score-criteria').children.some(c=>c.textContent.includes('직선 연결 완료')),false,'connection diagnostics do not become a scoring prerequisite');
  env.get('timeline').value=String(25/30*1000);env.get('timeline').oninput();
  assert.match(env.get('score-link').textContent,/직선 연결 1 \/ 2 · 앞뒤 코너 연결 완료/);
  assert.equal(env.state().replayScoring.link.complete,true);
  env.get('restart').onclick();assert.equal(env.get('score-link-transition').hidden,true);assert.equal(env.scoreCalls(),1);
  env.selectFailure();env.get('timeline').value='1000';env.get('timeline').oninput();assert.equal(env.get('replay-score-label').textContent,'점수 무효');assert.equal(env.get('replay-score').textContent,'0.00');
  env.get('reset').onclick();assert.equal(env.get('replay-straight-link').disabled,true);assert.equal(env.get('straight-links').textContent,'—');
});

test('courses without an intermediate straight do not show an unmet straight-link condition or enable its replay',()=>{
  const env=environment({apex:true});env.ready();
  assert.equal(env.get('straight-links').textContent,'0 / 0');
  const before=env.state().replay;assert.equal(env.get('replay-straight-link').disabled,true);env.get('replay-straight-link').onclick();assert.deepEqual(env.state().replay,before);assert.equal(env.state().playing,true);
  assert.match(env.get('score-link').textContent,/해당 직선 없음/);assert.equal(env.get('score-criteria').children.some(c=>c.textContent.includes('직선 연결 완료')),false);
});

test('a started link without a measured straight speed displays missing retention rather than zero percent',()=>{
  const env=environment({apex:true,straight:true,linkUnmeasured:true});env.ready();
  assert.equal(env.state().objective.bestLink.startTime,12);assert.equal(env.state().objective.bestLink.minSpeed,0);
  env.get('timeline').value=String(20/30*1000);env.get('timeline').oninput();
  assert.match(env.get('score-link-detail').textContent,/직선 내 최저속도 유지율 —$/);
  assert.doesNotMatch(env.get('score-link-detail').textContent,/유지율 0\.0%/);
});

const failureFixture={version:1,kind:'trajectory-divergence',summary:'실패 2.4초 전부터 목표선 오차와 바깥쪽 진행이 이어졌습니다.',failure:{time:30,s:420,reason:'offtrack'},origin:{time:27.6,s:365,zoneIndex:1},window:{startS:330,endS:420,startTime:26,endTime:30},evidence:[{label:'목표선 오차',value:2.365,unit:'m'},{label:'회전 방향',value:'바깥쪽'}],hypotheses:[{kind:'trajectory-divergence',confidence:'medium',summary:'목표 경로와 조향 준비가 함께 영향을 주었을 가능성이 있습니다.'}],recommendedFamilies:['line','lead'],precedingZoneIndex:0};

test('failed replay separates recorded observations from hypotheses and seeks the precursor without simulation',()=>{
  const env=environment();env.ready();assert.equal(env.get('failure-analysis').hidden,true);
  env.selectFailure('offtrack',failureFixture);const worker=env.workers[0],messages=worker.messages.length,calls=env.scoreCalls();
  assert.equal(env.get('failure-analysis').hidden,false);assert.equal(env.get('failure-details').hidden,false);
  assert.equal(env.get('failure-summary').textContent,failureFixture.summary);
  assert.match(env.get('failure-origin').textContent,/27\.60초 · 365\.0 m → 실패 30\.00초 · 420\.0 m/);
  assert.equal(env.get('failure-evidence').children[0].children[0].textContent,'목표선 오차');
  assert.equal(env.get('failure-evidence').children[0].children[1].textContent,'2.37 m');
  assert.match(env.get('failure-hypotheses').children[0].textContent,/가능성.*근거 수준: 보통/);
  assert.match(env.get('failure-next').textContent,/목표 경로 · 카운터 준비/);
  assert.deepEqual(env.state().failureAnalysis,failureFixture);
  env.get('replay-failure-origin').onclick();
  assert.equal(env.state().replay.id,'failed-test');assert.equal(env.state().replay.time,27.6);assert.equal(env.state().playing,true);
  assert.equal(worker.messages.length,messages);assert.equal(env.steps(),0);assert.equal(env.scoreCalls(),calls,'seeking uses the existing replay score cache');
  env.get('timeline').value='1000';env.get('timeline').oninput();assert.equal(env.get('replay-score').textContent,'0.00');
  env.ready();assert.equal(env.get('failure-analysis').hidden,true);assert.equal(env.state().failureAnalysis,null);
  env.selectFailure('offtrack',failureFixture);env.get('reset').onclick();
  assert.equal(env.get('failure-analysis').hidden,true);assert.equal(env.get('replay-failure-origin').disabled,true);assert.equal(env.get('failure-evidence').children.length,0);assert.equal(env.state().failureAnalysis,null);
});

test('unresolved failures do not invent an origin while a real zero-second origin is replayable',()=>{
  const env=environment();env.ready();
  env.selectFailure('collision',{...failureFixture,kind:'unresolved',origin:null,window:null,evidence:[],hypotheses:[],recommendedFamilies:[]});
  assert.match(env.get('failure-origin').textContent,/선행 징후 시점 미확인/);assert.equal(env.get('replay-failure-origin').disabled,true);
  env.get('replay-failure-origin').onclick();assert.equal(env.state().playing,false);
  assert.match(env.get('failure-hypotheses').children[0].textContent,/가설을 좁히기 어렵습니다/);
  env.selectFailure('offtrack',{...failureFixture,origin:{time:0,s:0,zoneIndex:0}});assert.equal(env.get('replay-failure-origin').disabled,false);
  env.get('replay-failure-origin').onclick();assert.equal(env.state().playing,true);assert.equal(env.state().replay.time,0);
  env.selectFailure('timeout');assert.equal(env.get('failure-details').hidden,true);assert.equal(env.get('replay-failure-origin').disabled,true);assert.match(env.get('failure-summary').textContent,/분석이 없습니다/);
});

test('accepted prefix reuse totals and guided trials are shown without claiming elapsed speedup and reset cleanly',()=>{
  const evaluation={simulatedTicks:3600,reusedTicks:2400,totalTicks:6000,cacheHits:2,evaluations:3};
  const learning={enabled:true,observations:3,failuresAnalyzed:2,guidedProposals:1,explorationProposals:2,zones:[]};
  const env=environment();env.ready();assert.equal(env.get('evaluation-progress').hidden,true);assert.equal(env.get('learning-progress').hidden,true);
  env.updateStats(evaluation,learning);
  assert.equal(env.get('evaluation-progress').hidden,false);assert.equal(env.get('evaluation-reuse').textContent,'물리 계산 재사용 40.0%');
  assert.match(env.get('evaluation-detail').textContent,/새 계산 3,600회 · 재사용 2,400회 \/ 전체 6,000회 · 재사용 후보 2 \/ 평가 3개/);
  assert.equal(env.get('learning-progress').textContent,'실패 분석 2개 · 가설 기반 시도 1개 · 취약 구간 탐색 0개');
  assert.deepEqual(env.state().evaluationStats,evaluation);assert.equal(env.state().evaluationReuseRatio,.4);assert.deepEqual(env.state().learningStats,learning);
  env.updateStats({simulatedTicks:0,reusedTicks:0,totalTicks:0,cacheHits:0,evaluations:0},{...learning,enabled:false});
  assert.equal(env.get('evaluation-reuse').textContent,'물리 계산 재사용 —');assert.equal(env.state().evaluationReuseRatio,null);assert.equal(env.get('learning-progress').hidden,true);
  env.get('reset').onclick();assert.equal(env.get('evaluation-progress').hidden,true);assert.equal(env.get('evaluation-detail').textContent,'');assert.equal(env.state().evaluationStats,null);assert.equal(env.state().learningStats,null);
});

test('the shipped page supplies diagnostic targets and loads serial evaluation dependencies before evolution',()=>{
  const html=fs.readFileSync(require.resolve('./evolving_drift.html'),'utf8');
  const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(match=>match[1]);
  const index=name=>scripts.indexOf(name+'.js?v='+Runtime.RELEASE);
  for(const name of ['evaluation-cache','failure-analysis','evolution-learning','mutation-shape','course-scoring'])assert.ok(index(name)>=0,name+' must use the same release as the page');
  assert.ok(index('course-scoring')<index('fitness'));
  assert.ok(index('genome')<index('mutation-shape'));assert.ok(index('mutation-shape')<index('evolution-strategies'));
  assert.ok(index('physics')<index('evaluation-cache'));assert.ok(index('evaluation-cache')<index('evolution'));
  assert.ok(index('fitness')<index('failure-analysis'));assert.ok(index('failure-analysis')<index('evolution'));assert.ok(index('evolution-learning')<index('evolution'));
  for(const id of ['failure-analysis','failure-marker','failure-summary','failure-origin','replay-failure-origin','failure-details','failure-evidence','failure-hypotheses','failure-window','failure-next','evaluation-progress','evaluation-reuse','evaluation-detail','learning-progress'])assert.equal(html.split('id="'+id+'"').length-1,1,id+' must be present exactly once');
  assert.match(html,/원인 가설 · 미확정/);assert.match(html,/실행 시간의 단축률은 아닙니다/);
});

test('simplified page removes ghost and graphs while retaining replay, details and top controls',()=>{
  for(const id of ['ghost','gene-chart','gene-steer','gene-throttle','gene-brake','gene-cursor','factor-rows','history'])assert.equal(pageIds.has(id),false,id+' must be removed rather than hidden');
  assert.doesNotMatch(html,/<svg\b|그립 고스트|factor-panel|gene-panel/);
  assert.doesNotMatch(html,/연결 45|옆으로 이동 35|잠정 점수는 주행에 따라 낮아질/);assert.match(html,/이미 얻은 점수는 유지/);
  assert.ok(html.includes('드리프트가 끊어지거나, 스핀할 경우 배수는 1로 돌아가고 이미 얻은 점수는 유지됩니다. 짧은 방향 전환 중에는 배수만 유지합니다. 코스를 벗어나면 전체 점수가 무효가 되며, 완주해야 확정됩니다.'));
  assert.doesNotMatch(html,/이탈·충돌·스핀은 무효/);
  for(const id of ['score-chain-multiplier','score-zone-multiplier','score-combined-multiplier'])assert.ok(pageIds.has(id));
  for(const id of ['score-details','failure-details','experiment-details','stock-details','course-summary']){
    const tag=html.match(new RegExp('<details[^>]*id="'+id+'"[^>]*>'))?.[0];assert.ok(tag,id+' remains available on demand');assert.doesNotMatch(tag,/\bopen\b/);
  }
  for(const id of ['vehicle','track','evolve','one-generation'])assert.ok(html.indexOf('id="'+id+'"')<html.indexOf('id="stage"'),id+' stays above the replay');
  assert.ok(html.indexOf('id="replay-failure-origin"')<html.indexOf('id="failure-details"'),'failure replay remains available outside collapsed evidence');
  const env=environment();env.ready();assert.ok(env.render().car);assert.equal('ghost' in env.render(),false);assert.equal('reference' in env.render(),false);
  assert.equal(env.get('speed-value').textContent,'0');assert.equal(env.get('angle-value').textContent,'0.0°');assert.equal(env.get('rpm-value').textContent,'800 rpm');
});
