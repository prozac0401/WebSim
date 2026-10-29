'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Genome=require('./genome.js');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');

// Execute the real app and its handlers with a deliberately queued worker
// response. This tests the UI/worker boundary, not a copy of the control logic.
function environment({fallback=false,apex=false,reassess=false,complete=false,early=false,straight=false,linked=false,linkUnmeasured=false}={}){
  const elements=new Map(),workers=[],timers=new Map();let nextTimer=1,steps=0,scoreCalls=0;
  function element(){return{children:[],value:'1',disabled:false,hidden:false,checked:false,textContent:'',classList:{toggle(){},remove(){}},
    setAttribute(){},append(...items){this.children.push(...items);},before(){},replaceChildren(...items){this.children=items;},addEventListener(){},getContext(){return{save(){},restore(){},setTransform(){},clearRect(){}};}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const vehicle={id:'test-car',vehicleId:'test-car',label:'Test',physics:{peakPowerW:100000,peakTorque:200,massKg:1200},limitations:[],sourceUrl:'',spec:{factoryDrive:'RWD'}};
  const track={id:'test-track',name:'Test track',length:500,judgedStart:50,judgedEnd:450};
  const frame={time:0,s:0,x:0,y:0,yaw:0,speed:0,beta:0,steer:0,throttle:0,brake:0,gear:1,rpm:800,rearTorque:0,wheelSlip:[0,0,0,0]};
  const result={valid:true,status:'finished',score:1,time:30,maxAngle:apex?42:2,driftDistance:0};
  if(apex)result.drift={fullConnectionCount:complete?1:0,totalArcCount:2,parts:{sideways:20,connection:10,curve:8,propulsion:1},bestArc:{distance:40,duration:2.1,startTime:12,endTime:14.1,entrySpeed:20,minSpeed:18,exitSpeed:19,distanceWeightedAngle:31.6,speedRetention:.9,speedScope:'apex-window',curveQuality:.85,anchored:true,connectionCoverage:complete?1:.65,complete,initiationS:early?30:60,initiationTime:early?7:12,startedBeforeStart:early}};
  if(result.drift)Object.assign(result.drift,{straightLinkCount:linked?1:0,totalLinkCount:straight?2:0,bestLink:straight?{id:'link-1',fromZoneId:'apex-1',toZoneId:'apex-2',start:100,end:200,straightStart:130,straightEnd:170,coverage:linked?1:.6,complete:linked,distance:100,duration:13,startTime:12,endTime:25,entrySpeed:20,minSpeed:linkUnmeasured?0:18.4,exitSpeed:19,speedRetention:linkUnmeasured?0:.92,transitionDuration:.2,transitionDistance:4,score:3}:null});
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
    DriftPreparedGrips:{load:async()=>baseline},DriftEvolution:{Engine},DriftFitness:{replayTimeline(result){scoreCalls++;return [
      {time:0,score:0,delta:0,earning:false,provisional:true,fullConnectionCount:0,totalArcCount:2,straightLinkCount:0,totalLinkCount:straight?2:0,phase:'preparation',reason:'준비 구간 · 득점 없음',conditions:{},parts:{sideways:0,connection:0,curve:0,propulsion:0}},
      ...(early?[{time:8,score:0,delta:0,earning:false,provisional:true,fullConnectionCount:0,totalArcCount:2,phase:'initiation',reason:'출발선 전 드리프트 진입 · 득점 없음',preStartDrift:{active:true,s:35,speed:18,angle:22,distanceToStart:15},conditions:{speed:true,angle:true,complete:false},parts:{sideways:0,connection:0,curve:0,propulsion:0}}]:[]),
      {time:15,fullConnectionCount:complete?1:0,totalArcCount:2,score:.75,delta:.02,earning:!reassess,reassessment:reassess,provisional:true,phase:'exit',reason:reassess?'곡선 확인 · 앞선 주행 점수 재평가':'속도를 유지하며 apex 전후 연결',conditions:{angle:!reassess,speed:true,retention:true,curve:true,apex:true,complete,forward:true,propulsion:false},parts:{sideways:.4,connection:.2,curve:.15,propulsion:0},arc:result.drift?.bestArc||null},
      ...(straight?[{time:20,score:.8,delta:.05,earning:true,provisional:true,fullConnectionCount:complete?1:0,totalArcCount:2,straightLinkCount:0,totalLinkCount:2,phase:'link',reason:'코너 사이 직선 드리프트 연결',conditions:{angle:true,speed:true,retention:true,link:false},parts:{sideways:.4,connection:.25,curve:.15,propulsion:0},link:{...result.drift.bestLink,coverage:.6,complete:false}},
        {time:25,score:.9,delta:.1,earning:true,provisional:true,fullConnectionCount:complete?1:0,totalArcCount:2,straightLinkCount:linked?1:0,totalLinkCount:2,phase:'judged',reason:'다음 코너 연결 평가',conditions:{angle:true,speed:true,retention:true,link:linked},parts:{sideways:.4,connection:.35,curve:.15,propulsion:0},link:result.drift.bestLink}]:[]),
      {time:30,fullConnectionCount:complete?1:0,totalArcCount:2,score:result.valid?result.score:0,delta:0,earning:false,provisional:false,finalValid:result.valid,phase:'recovery',reason:result.valid?'회복·비채점 구간 · 득점 없음':(result.status==='collision'?'차체 충돌':'앞바퀴 이탈')+' · 점수 무효',conditions:{},parts:{sideways:.5,connection:.3,curve:.2,propulsion:0}}
    ];}}});
  vm.runInContext(source,context);
  return{get,workers,timers,state:()=>JSON.parse(window.render_game_to_text()),
    ready(worker=workers.at(-1)){worker.emit({type:'ready',baseline,best,state:state()});},
    tick(){const entry=timers.entries().next().value;if(entry){timers.delete(entry[0]);entry[1]();}},steps:()=>steps,scoreCalls:()=>scoreCalls,
    selectFailure(status='offtrack'){const entry={...best,id:'failed-test',record:[{...frame}],result:{...result,valid:false,status}};workers.at(-1).emit({type:'candidate',candidate:entry,best:entry,state:state()});workers.at(-1).emit({type:'paused'});}};
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

test('apex replay shows sustained angle and minimum speed retention, seeks its interval and resets',()=>{
  const env=environment({apex:true});env.ready();
  assert.equal(env.get('apex-arc-distance').textContent,'40.0 m');
  assert.equal(env.get('best-angle').textContent,'31.6°');
  assert.equal(env.get('peak-angle').textContent,'순간 최대 42.0°');
  assert.equal(env.get('speed-retention').textContent,'90.0%');
  assert.equal(env.get('curve-quality').textContent,'85.0%');
  assert.equal(env.get('apex-connection').textContent,'apex 통과 · 연결 중');
  assert.equal(env.get('full-connections').textContent,'0 / 2');assert.equal(env.get('connection-coverage').textContent,'65.0%');
  assert.equal(env.state().objective.type,'continuous-apex-drift');
  assert.equal(env.get('arc-speed').textContent,'기준 72.0 · 코너 최저 64.8 · 탈출 68.4 km/h');
  assert.equal(env.get('replay-apex-arc').disabled,false);
  const messageCount=env.workers[0].messages.length;
  env.get('replay-apex-arc').onclick();
  assert.equal(env.state().replay.time,11.5);assert.equal(env.state().playing,true);
  assert.equal(env.workers[0].messages.length,messageCount,'replay does not start an evolution or re-simulate');
  env.get('reset').onclick();
  assert.equal(env.get('replay-apex-arc').disabled,true);assert.equal(env.state().playing,false);
  assert.equal(env.get('apex-arc-duration').textContent,'연속 드리프트');
  assert.equal(env.get('speed-retention').textContent,'—');
  assert.equal(env.get('curve-quality').textContent,'—');assert.equal(env.get('full-connections').textContent,'—');assert.equal(env.get('connection-coverage').textContent,'—');
  assert.equal(env.get('best-angle').textContent,'—');
  assert.equal(env.get('peak-angle').textContent,'순간 최대 —');
});

test('replay scoring follows seeks, caches the timeline and invalidates a failed finish',()=>{
  const env=environment({apex:true});env.ready();assert.equal(env.scoreCalls(),1);
  assert.equal(env.state().replayScoring.phase,'preparation');assert.equal(env.get('replay-score').textContent,'0.00');
  env.get('timeline').value='500';env.get('timeline').oninput();
  assert.equal(env.state().replayScoring.earning,true);assert.equal(env.get('replay-score').textContent,'0.75');
  assert.match(env.get('score-speed').textContent,/코너 내 최저속도 유지율 90.0%/);
  assert.equal(env.state().replayScoring.conditions.propulsion,false,'propulsion is auxiliary rather than a prerequisite for earning');
  assert.match(env.get('score-parts').textContent,/옆으로 이동 0.40/);
  env.get('timeline').value='1000';env.get('timeline').oninput();assert.equal(env.get('replay-score-label').textContent,'확정 점수');
  env.get('restart').onclick();assert.equal(env.state().replayScoring.score,0);assert.equal(env.scoreCalls(),1,'seeking does not rebuild or simulate');
  env.selectFailure();env.get('timeline').value='1000';env.get('timeline').oninput();
  assert.equal(env.get('replay-score').textContent,'0.00');assert.equal(env.get('replay-score-label').textContent,'점수 무효');assert.equal(env.state().replayScoring.finalValid,false);
  assert.match(env.get('score-reason').textContent,/앞바퀴 이탈/);assert.equal(env.get('records').children.find(row=>row.children[0].textContent.includes('failed-test')).children[1].textContent,'앞바퀴 이탈 · 실패');
  env.selectFailure('collision');env.get('timeline').value='1000';env.get('timeline').oninput();
  assert.equal(env.get('replay-score').textContent,'0.00');assert.match(env.get('score-reason').textContent,/차체 충돌/);assert.equal(env.get('records').children.find(row=>row.children[0].textContent.includes('failed-test')).children[1].textContent,'차체 충돌 · 실패');
  env.get('reset').onclick();assert.equal(env.state().replayScoring,null);assert.equal(env.get('replay-scoring').hidden,true);
});


test('a confirmed earlier curve is labelled as reassessment rather than current earnings',()=>{
  const env=environment({apex:true,reassess:true});env.ready();env.get('timeline').value='500';env.get('timeline').oninput();
  assert.equal(env.state().replayScoring.conditions.angle,false);assert.equal(env.state().replayScoring.earning,false);
  assert.equal(env.get('score-change').textContent,'재평가 ↑');
  assert.equal(env.get('score-reason').textContent,'곡선 확인 · 앞선 주행 점수 재평가');
  assert.equal(env.state().objective.bestArc.speedScope,'apex-window');
});


test('full apex connection is distinct from crossing and is shown only for valid candidate records',()=>{
  const env=environment({apex:true,complete:true});env.ready();
  assert.equal(env.get('apex-connection').textContent,'완전 연결');assert.equal(env.get('full-connections').textContent,'1 / 2');
  assert.equal(env.get('connection-coverage').textContent,'100.0%');assert.equal(env.state().objective.fullConnectionCount,1);
  assert.match(env.get('records').children[0].children[2].textContent,/완전 1 \/ 2/);
  env.get('timeline').value='500';env.get('timeline').oninput();
  assert.match(env.get('score-connection').textContent,/현재까지 완전 연결 1 \/ 2 코너/);assert.equal(env.state().replayScoring.conditions.complete,true);
  env.selectFailure();const failed=env.get('records').children.find(row=>row.children[0].textContent.includes('failed-test'));
  assert.equal(failed.children[2].textContent,'선발 제외');
});

test('replay includes actual pre-start initiation without points and the shortcut seeks before it',()=>{
  const env=environment({apex:true,early:true});env.ready();assert.equal(env.get('score-prestart').hidden,true);
  env.get('replay-apex-arc').onclick();assert.equal(env.state().replay.time,6.5,'actual initiation predates the scored start at12s');
  env.get('timeline').value=String(8/30*1000);env.get('timeline').oninput();
  assert.equal(env.get('score-phase').textContent,'출발선 전 드리프트 진입');assert.equal(env.get('score-prestart').hidden,false);
  assert.match(env.get('score-prestart').textContent,/START 15.0 m 전 · 64.8 km\/h · 슬립각 22.0°/);
  assert.equal(env.state().replayScoring.earning,false);assert.equal(env.get('replay-score').textContent,'0.00');
  env.get('timeline').value='500';env.get('timeline').oninput();assert.equal(env.get('score-prestart').hidden,true);
  env.get('reset').onclick();assert.equal(env.get('replay-apex-arc').disabled,true);assert.equal(env.state().replayScoring,null);
});

test('straight drift links show current progress, transition and completed counts independently of corner completion',()=>{
  const env=environment({apex:true,straight:true,linked:true});env.ready();
  assert.equal(env.get('full-connections').textContent,'0 / 2');assert.equal(env.get('straight-links').textContent,'1 / 2');
  assert.equal(env.get('straight-link-status').textContent,'앞뒤 코너 연결 완료');assert.equal(env.get('link-coverage').textContent,'100.0%');
  assert.equal(env.get('link-retention').textContent,'최저속도 유지 92.0%');assert.equal(env.state().objective.straightLinkCount,1);
  assert.equal(env.state().objective.bestLink.fromZoneId,'apex-1');assert.equal(env.get('replay-straight-link').disabled,false);
  const messageCount=env.workers[0].messages.length;env.get('replay-straight-link').onclick();
  assert.equal(env.state().replay.time,11.5);assert.equal(env.state().playing,true);assert.equal(env.workers[0].messages.length,messageCount);
  env.get('timeline').value=String(20/30*1000);env.get('timeline').oninput();
  assert.equal(env.get('score-phase').textContent,'코너 사이 직선 드리프트');
  assert.match(env.get('score-link').textContent,/직선 연결 0 \/ 2 · 앞뒤 코너 연결 중 · 연결률 60.0% · 직선 내 최저속도 유지율 92.0%/);
  assert.equal(env.get('score-link-transition').hidden,false);assert.equal(env.get('score-link-transition').textContent,'방향 전환 0.20초 · 4.0 m');
  assert.equal(env.get('score-criteria').children.find(c=>c.textContent.includes('직선 연결 완료')).className,'unmet');
  env.get('timeline').value=String(25/30*1000);env.get('timeline').oninput();
  assert.match(env.get('score-link').textContent,/직선 연결 1 \/ 2 · 앞뒤 코너 연결 완료/);
  assert.equal(env.get('score-criteria').children.find(c=>c.textContent.includes('직선 연결 완료')).className,'met');
  env.get('restart').onclick();assert.equal(env.get('score-link-transition').hidden,true);assert.equal(env.scoreCalls(),1);
  env.selectFailure();env.get('timeline').value='1000';env.get('timeline').oninput();assert.equal(env.get('replay-score-label').textContent,'점수 무효');assert.equal(env.get('replay-score').textContent,'0.00');
  env.get('reset').onclick();assert.equal(env.get('replay-straight-link').disabled,true);assert.equal(env.get('straight-links').textContent,'—');assert.equal(env.get('link-coverage').textContent,'—');assert.equal(env.get('link-retention').textContent,'최저속도 유지 —');
});

test('courses without an intermediate straight do not show an unmet straight-link condition or enable its replay',()=>{
  const env=environment({apex:true});env.ready();
  assert.equal(env.get('straight-links').textContent,'0 / 0');assert.equal(env.get('straight-link-status').textContent,'해당 직선 없음');
  assert.equal(env.get('replay-straight-link').disabled,true);env.get('replay-straight-link').onclick();assert.equal(env.state().playing,false);
  assert.match(env.get('score-link').textContent,/해당 직선 없음/);assert.equal(env.get('score-criteria').children.some(c=>c.textContent.includes('직선 연결 완료')),false);
});

test('a started link without a measured straight speed displays missing retention rather than zero percent',()=>{
  const env=environment({apex:true,straight:true,linkUnmeasured:true});env.ready();
  assert.equal(env.state().objective.bestLink.startTime,12);assert.equal(env.state().objective.bestLink.minSpeed,0);
  assert.equal(env.get('link-retention').textContent,'최저속도 유지 —');
  env.get('timeline').value=String(20/30*1000);env.get('timeline').oninput();
  assert.match(env.get('score-link').textContent,/직선 내 최저속도 유지율 —$/);
  assert.doesNotMatch(env.get('score-link').textContent,/유지율 0\.0%/);
});
