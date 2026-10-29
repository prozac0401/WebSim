/* UI/replay reads recorded physical states. Evolution runs off the render thread. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),renderer=new DriftRenderer($('canvas'));
  const params=new URLSearchParams(location.search),development=params.get('development')==='1',availableTracks=DriftTrack.list({includeDevelopment:development});
  const preferredTrack=params.get('track')||(development?DriftTrack.DEVELOPMENT_ID:'kr-kic-t21-kdl-2016-r2');
  let vehicle=DriftCatalog.get(DriftCatalog.DEFAULT_ID),track=availableTracks.find(t=>t.id===preferredTrack)||availableTracks[0]||null,worker=null,engine=null,baseline=null,best=null,selected=null,archive=[],state=null,playing=false,evolving=false,pauseRequested=false,evolutionTimer=null,time=0,last=0,camera='follow',ready=false,manual=false,token=0,appMode='initializing',baselineError=null;
  const labels={finished:'유효 완주',offtrack:'이탈 · 실패',collision:'충돌 · 실패',timeout:'시간 초과',invalid:'계산 오류',spin:'스핀 · 실패'};
  const factorDescriptions={lineOffset:'중앙선 기준 좌우 목표 위치. 진입 전 반대 방향으로 이동해 자세를 준비할 수 있습니다.',targetSlip:'차가 향하는 방향과 이동 방향 사이의 목표 각도. 부호는 좌우 방향입니다.',counterLead:'각도와 회전의 변화를 이 시간만큼 앞서 보고 카운터를 준비합니다.',driveSlip:'뒷바퀴가 노면보다 빠르게 도는 비율의 목표. 높이면 접지를 잃거나 스핀할 수 있습니다.',gearHold:'0은 자동 변속, 그 밖의 값은 유지 요청 기어입니다. 과회전 위험이 있으면 내려가지 않습니다.'};
  const factors=DriftGenome.DESCRIPTORS.slice(3);
  for(const d of factors){const row=document.createElement('div');row.className='factor-row';row.title=factorDescriptions[d.key];row.innerHTML='<div><span>'+d.label+'</span><strong id="factor-value-'+d.key+'">—</strong></div><svg viewBox="0 0 1000 48" preserveAspectRatio="none" role="img" aria-label="'+d.label+' 유전자"><path id="factor-path-'+d.key+'"/><line class="factor-cursor" y1="0" y2="48"/></svg>';$('factor-rows').append(row);}
  function formatFactor(d,n){return d.key==='gearHold'?(n?Math.round(n)+'단':'자동'):d.unit==='rad'?(n*180/Math.PI).toFixed(1)+'°':d.unit==='ratio'?(n*100).toFixed(1)+'%':n.toFixed(d.unit==='s'?2:1)+' '+d.unit;}
  DriftCatalog.list().forEach(v=>{const option=document.createElement('option');option.value=v.id;option.textContent=v.label;$('vehicle').append(option);});$('vehicle').value=vehicle.id;
  availableTracks.forEach(t=>{const option=document.createElement('option');option.value=t.id;option.textContent=t.name;$('track').append(option);});
  if(track)$('track').value=track.id;else{const option=document.createElement('option');option.value='';option.textContent='불러올 수 있는 코스 없음';$('track').append(option);}
  $('track').disabled=!availableTracks.length;
  $('development-notice').hidden=track?.kind!=='development';
  const metrics=document.createElement('div');metrics.className='drift-metrics';metrics.innerHTML='<div><strong id="powered-exit-distance">—</strong><span id="powered-exit-duration">연속 가속 탈출</span></div><div title="연속 2초·30m 이상, 실제 후륜 구동력과 탈출 속도 유지"><strong id="powered-exit-goal">탐색 중</strong><span id="powered-exit-speed">2초 · 30m · 속도 유지</span></div><div title="가속 탈출에서 실제 이동 거리를 기준으로 평균한 차체 슬립각"><strong id="best-angle">—</strong><span>가속 탈출 유지 각도</span><span id="peak-angle">순간 최대 —</span></div><div title="슬립각 10~70°, 속도 4m/s 이상인 구간의 합계"><strong id="drift-distance">—</strong><span>드리프트 구간 합계</span></div><button id="replay-powered-exit" class="secondary" disabled>가속 탈출 구간 보기</button>';
  document.querySelector('.counts').before(metrics);
  let scoreCache=new WeakMap(),scoreTimeline=[],replayScoring=null;
  const phaseNames={preparation:'출발선 전 준비',judged:'채점 구간',exit:'가속 탈출 구간',recovery:'회복 · 비채점 구간'};
  const criterionLabels={angle:'각도 10~55°',speed:'속도 ≥ 28.8km/h',throttle:'가속 ≥ 15%',brake:'제동 ≤ 3%',propulsion:'실제 후륜 추진력',forward:'연속 전진',corner:'코너부터 연결'};
  function scoreReplay(){
    const frames=selected?.record||selected?.result.frames;
    if(!frames?.length){scoreTimeline=[];replayScoring=null;return;}
    if(!scoreCache.has(frames))scoreCache.set(frames,DriftFitness.replayTimeline(selected.result,track,vehicle,frames));
    scoreTimeline=scoreCache.get(frames);
    let lo=0,hi=scoreTimeline.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(scoreTimeline[mid].time<=time+1e-8)lo=mid;else hi=mid-1;}
    replayScoring=scoreTimeline[lo]||null;
  }
  function drawScore(){
    const s=replayScoring;$('replay-scoring').hidden=!s;$('score-overlay').hidden=!s;if(!s)return;
    const invalid=!s.provisional&&!s.finalValid||s.reason.includes('무효');
    const label=invalid?'점수 무효':s.provisional?(s.estimatedStyle?'잠정 점수 · 보조 항목 추정':'잠정 점수'):'확정 점수';
    $('replay-score-label').textContent=label;$('replay-score').textContent=s.score.toFixed(2);
    $('score-overlay').textContent=label+' '+s.score.toFixed(2)+' · '+(s.earning?'득점 중':phaseNames[s.phase]);
    $('replay-scoring').classList.toggle('earning',s.earning);$('replay-scoring').classList.toggle('invalid',invalid);
    $('score-phase').textContent=phaseNames[s.phase];$('score-reason').textContent=s.reason;
    $('score-change').textContent=invalid?'선발 제외':s.earning?'득점 중':s.delta< -1e-7?'재평가 ↓':'득점 없음';
    $('score-exit').textContent=s.exit?'현재 최고 연속 탈출 '+s.exit.distance.toFixed(1)+' m · '+s.exit.duration.toFixed(2)+'초 · 유지 각도 '+s.exit.angle.toFixed(1)+'°':'코너부터 이어진 가속 탈출을 기다립니다.';
    $('score-criteria').replaceChildren();for(const [key,label] of Object.entries(criterionLabels)){const chip=document.createElement('span'),met=s.conditions[key];chip.className=met?'met':'unmet';chip.textContent=(met?'✓ ':'○ ')+label;$('score-criteria').append(chip);}
    const partNames={style:'보조 주행',power:'가속 품질',exit:'탈출 품질',continuity:'연속 탈출',completion:'목표 달성',distance:'추가 거리',angle:'유지 각도',speed:'속도',acceleration:'속도 증가'};
    $('score-parts').textContent=(invalid?'무효 처리 전 산정: ':'')+Object.entries(s.parts).map(([key,value])=>partNames[key]+' '+value.toFixed(2)).join(' · ');
  }
  function specification(){const p=vehicle.physics;$('factory-stats').innerHTML='<div>'+Math.round(p.peakPowerW/735.49875)+' PS<small>순정 출력</small></div><div>'+p.peakTorque+' Nm<small>최대 토크</small></div><div>'+p.massKg+' kg<small>공차 중량</small></div>';$('limitations').textContent=vehicle.limitations.join(' ');$('factory-source').href=vehicle.sourceUrl;}
  function courseSpecification(){
    const synthetic=track?.kind==='development',kic=track?.id==='kr-kic-t21-kdl-2016-r2';
    $('development-notice').hidden=!synthetic;$('course-summary').hidden=!track||synthetic;
    $('course-code').textContent=track?.shortName||(kic?'KIC T21':track?(track.name||track.id).split(' · ')[0]:'코스 준비');
    const rounds=track?.event?.rounds||(track?.event?.round?[track.event.round]:[]);
    const eventLabel=track?.event?[track.event.year,track.event.series,rounds.length?'R'+rounds.join('·'):''].filter(Boolean).join(' '):'';
    $('course-description').textContent=track?(synthetic?'가상 개발 코스 · ':eventLabel?eventLabel+' · ':'')+Math.round(track.length)+' m · 모형 채점 '+Math.round(track.judgedEnd-track.judgedStart)+' m':'코스 자료를 불러올 수 없습니다.';
    if(!track)return;
    $('course-event-title').textContent=track.name||track.id;
    $('course-measures').textContent='재구성 주행 구간 '+Math.round(track.length)+' m · 모형 채점 '+Math.round(track.judgedEnd-track.judgedStart)+' m';
    $('course-provenance').textContent=track.presentation?.geometry||(kic?'실대회 주행 구간 재구성 · 공식 클리핑 존 미확인. 영상·지도 자료로 만든 코스이며, 채점 구간과 점수는 이 실험의 설정입니다.':'실대회 주행 구간을 자료에 근거해 재구성한 모형입니다. 채점 규칙과 자료의 정확도는 코스 근거에서 확인하세요.');
    const resolution=track.elevation?.resolutionM||90,range=track.reconstruction?.heightRangeM;
    $('course-elevation-note').textContent=track.presentation?.elevation||(kic?'고도: '+resolution+' m 격자의 DEM 지표면 자료를 평활화한 근사'+(Number.isFinite(range)?' · 이 구간의 모형 고저차 '+range.toFixed(2)+' m':'')+' · 높이 과장 없이 표시. 연석·노면의 실측 높이가 아니며, 미확인 횡경사는 0°로 둡니다.':track.elevationNote||'고도·경계·환경 요소의 확인 범위는 코스 자료와 근거에 기록합니다.');
    $('course-environment-note').textContent=track.presentation?.environment||(kic?'경계는 포장 영역의 추정 범위입니다. 노면은 영상의 외관을 참고하며 마찰계수는 실측값이 아닙니다. 수목은 지도에 있는 수림을 일반 형태로 표시하고, 수종·개별 위치·시설 높이는 확인되지 않았습니다.':'경계·재질·수목·시설의 재현 범위는 연결된 코스 자료를 확인하세요.');
    $('course-evidence-link').href=typeof track.researchUrl==='string'?track.researchUrl:'track-research.html';
    $('canvas').setAttribute('aria-label',(track.name||track.id)+' 주행과 고도·환경 관찰');
  }
  function setBusy(message,busy=true){$('loading').hidden=false;$('loading-title').textContent=message;$('loading-spinner').hidden=!busy;$('research-link').hidden=busy;}
  function setReady(value){ready=value;for(const id of ['evolve','one-generation','play','restart','timeline'])$(id).disabled=!value;}
  function running(value){evolving=value;$('evolve').textContent=pauseRequested?'일시정지 중…':value?'진화 일시정지':'진화 시작';$('evolve').disabled=!ready||pauseRequested;$('one-generation').disabled=!ready||value||pauseRequested;}
  function choose(entry){if(!entry)return;selected=entry;time=0;playing=false;$('play').textContent='▶ 재생';drawGenes();renderRecords();draw();}
  function renderRecords(){
    const entries=[baseline?{id:'baseline',generation:0,kind:'baseline',gene:baseline.gene,result:baseline.result,record:baseline.record}:null,best&&best.id!=='baseline'?best:null,...archive.slice().reverse()].filter(Boolean),seen=new Set();$('records').replaceChildren();
    for(const entry of entries){if(seen.has(entry.id))continue;seen.add(entry.id);const b=document.createElement('button');b.className='record';b.setAttribute('aria-pressed',String(selected?.id===entry.id));const r=entry.result;const name=entry.id==='baseline'?'그립 기준':entry.id+(entry.id===best?.id?' · 최고':'');for(const [i,text] of [name,labels[r.status]||r.status,r.valid?r.score.toFixed(2)+'점':'선발 제외',r.time.toFixed(2)+'초'].entries()){const s=document.createElement('span');s.textContent=text;if(i===1)s.className=r.valid?'valid':'failed';b.append(s);}b.addEventListener('click',()=>choose(entry));$('records').append(b);}
  }
  function stats(){if(!state)return;$('generation').textContent=state.generation+'세대';$('best-score').textContent=best?.result.score.toFixed(2)||'—';$('baseline-score').textContent='그립 '+baseline.result.time.toFixed(2)+'초 · '+baseline.result.score.toFixed(2)+'점';$('peak-angle').textContent='순간 최대 '+best.result.maxAngle.toFixed(1)+'°';$('drift-distance').textContent=best.result.driftDistance.toFixed(1)+' m';const powered=best.result.power,exit=powered?.bestExit;$('best-angle').textContent=Number.isFinite(exit?.distanceWeightedAngle)?exit.distanceWeightedAngle.toFixed(1)+'°':'—';$('powered-exit-distance').textContent=(exit?.distance||0).toFixed(1)+' m';$('powered-exit-duration').textContent='연속 가속 탈출 · '+(exit?.duration||0).toFixed(2)+'초';$('powered-exit-goal').textContent=powered?.success?'달성':'탐색 중';$('powered-exit-speed').textContent=exit?(exit.entrySpeed*3.6).toFixed(1)+' → '+(exit.exitSpeed*3.6).toFixed(1)+' km/h':'2초 · 30m · 속도 유지';$('replay-powered-exit').disabled=!exit;const completed=state.history.at(-1),current=state.evaluated?state.stats:completed;$('valid-count').textContent=current?.validCount||0;$('failed-count').textContent=current?.failureCount||0;$('evaluated-count').textContent=state.evaluated+' / 20';$('generation-progress').value=state.evaluated;$('history').replaceChildren();const max=Math.max(1,...state.history.map(h=>h.bestScore));for(const h of state.history.slice(-24)){const bar=document.createElement('span');bar.style.height=Math.max(2,h.bestScore/max*36)+'px';bar.setAttribute('aria-label',h.generation+'세대 '+h.bestScore.toFixed(2)+'점');$('history').append(bar);}}
  function receive(m){
    if(m.type==='ready'){appMode='ready';baselineError=null;baseline={...m.baseline,result:m.best.result};best=m.best;state=m.state;$('loading').hidden=true;$('baseline-notice').hidden=true;setReady(true);running(false);$('evolution-status').textContent=(track.kind==='development'?'가상 개발 코스 · ':'')+'준비된 기준 기록을 불러왔습니다. 진화를 시작할 수 있습니다.';choose(best);stats();}
    if(m.type==='candidate'){state=m.state;archive.push(m.candidate);if(archive.length>12)archive.shift();if(m.best)best=m.best;stats();renderRecords();$('evolution-status').textContent=state.totalEvaluated+'개 후보 평가 · '+(m.candidate.result.valid?'유효 완주':'실패 개체 선발 제외')+' · 변이 폭 '+state.mutationScale.toFixed(2);}
    if(m.type==='paused'){pauseRequested=false;running(false);if(best)choose(best);}
    if(m.type==='error'){
      const loading=!baseline;appMode=loading?'baseline-unavailable':'error';baselineError=m.message||'기준 기록을 불러오지 못했습니다.';pauseRequested=false;clearTimeout(evolutionTimer);evolutionTimer=null;running(false);setReady(false);
      $('loading').hidden=!!track;$('baseline-notice').hidden=!track;$('baseline-notice-title').textContent=loading?'이 사양의 기준 주행을 준비 중입니다':'진화 계산을 멈췄습니다';
      const detail=loading?'코스와 카메라는 살펴볼 수 있습니다. 준비된 기준 기록을 불러온 뒤 재생과 진화를 시작합니다.':'새 실험으로 다시 시작할 수 있습니다. 저장된 주행 기록은 계속 재생할 수 있습니다.';
      $('baseline-notice-detail').textContent=detail;$('evolution-status').textContent=detail;
      if(loading){$('run-label').textContent='코스 미리보기';$('run-state').textContent='선택 사양의 기준 기록 준비 중';$('replay-time').textContent='—';}
      else for(const id of ['play','restart','timeline'])$(id).disabled=false;
      if(!track){setBusy('코스를 불러오지 못했습니다',false);$('loading-detail').textContent='코스 자료와 연결 상태를 확인해 주세요.';}draw();
    }
  }
  async function initialize(){
    $('best-angle').textContent='—';$('peak-angle').textContent='순간 최대 —';$('powered-exit-duration').textContent='연속 가속 탈출';$('powered-exit-speed').textContent='2초 · 30m · 속도 유지';$('replay-powered-exit').disabled=true;
    for(const id of ['best-angle','drift-distance','baseline-score','powered-exit-distance','powered-exit-goal'])$(id).textContent='—';
    $('generation').textContent='0세대';$('valid-count').textContent='0';$('failed-count').textContent='0';$('evaluated-count').textContent='0 / 20';$('generation-progress').value=0;
    const current=++token;worker?.terminate();worker=null;engine=null;baseline=best=selected=null;archive=[];state=null;baselineError=null;time=0;playing=false;pauseRequested=false;scoreCache=new WeakMap();scoreTimeline=[];replayScoring=null;drawScore();clearTimeout(evolutionTimer);evolutionTimer=null;running(false);setReady(false);$('baseline-notice').hidden=true;
    vehicle=DriftCatalog.get($('vehicle').value);renderer.retryVehicle(vehicle.vehicleId);track=availableTracks.find(t=>t.id===$('track').value)||null;
    specification();courseSpecification();$('records').replaceChildren();$('history').replaceChildren();$('best-score').textContent='—';
    $('play').textContent='▶ 재생';for(const id of ['gene-steer','gene-throttle','gene-brake'])$(id).setAttribute('d','');
    for(const factor of factors){$('factor-path-'+factor.key).setAttribute('d','');$('factor-value-'+factor.key).textContent='—';}
    $('stage').classList.toggle('no-course',!track);document.body.classList.toggle('no-course',!track);
    for(const id of ['seed','reset','playback','fullscreen','fov','smoke','marks','ghost'])$(id).disabled=!track;
    $('fov').disabled=!track||camera!=='follow';
    for(const button of document.querySelectorAll('[data-view]'))button.disabled=!track;
    if(!track){
      appMode='blocked-no-track';setBusy('코스 자료를 불러오지 못했습니다',false);
      $('loading-detail').textContent='페이지를 다시 열거나 코스 자료와 근거에서 제공 상태를 확인해 주세요.';
      $('run-label').textContent='코스 연결 확인';$('run-state').textContent='불러올 수 있는 코스가 없습니다.';
      $('evolution-status').textContent='코스 자료와 해당 차량의 기준 기록이 필요합니다.';
      $('replay-time').textContent='—';$('model-source').textContent='주행 코스가 준비되면 차량 외형을 표시합니다.';draw();return;
    }
    appMode='loading-baseline';setBusy('준비된 기준 기록을 불러오고 있습니다');$('loading-detail').textContent='선택한 차량과 코스의 저장된 조작·리플레이를 읽습니다.';
    $('run-label').textContent='기준 기록 불러오는 중';$('run-state').textContent='저장된 조작·리플레이 불러오기';$('evolution-status').textContent='준비된 기준 기록을 불러온 뒤 변이를 시작합니다.';draw();
    const seed=Math.max(1,Math.min(2147483646,Math.floor(Number($('seed').value)||37)));$('seed').value=seed;
    if(location.protocol!=='file:'&&typeof Worker!=='undefined'){worker=new Worker('worker.js');worker.onmessage=e=>{if(current===token)receive(e.data);};worker.onerror=e=>{if(current===token)receive({type:'error',message:e.message||'계산 작업을 시작하지 못했습니다.'});};worker.postMessage({type:'init',variantId:vehicle.id,trackId:track.id,seed,includeDevelopment:development,workers:Number(params.get('workers'))||undefined});}
    else try{const b=await DriftPreparedGrips.load(vehicle,track);if(current!==token)return;engine=new DriftEvolution.Engine(vehicle,track,{seed,populationSize:20,knots:128,baseline:b});engine.initialize();if(!engine.ready)throw new Error(engine.blockedReason||'준비된 기준 기록을 사용할 수 없습니다.');receive({type:'ready',baseline:b,best:engine.best,state:engine.snapshot()});}catch(e){if(current===token)receive({type:'error',message:e.message});}
  }
  function evolve(once){
    if(!ready||pauseRequested)return;
    if(evolving){
      if(worker){pauseRequested=true;running(true);worker.postMessage({type:'pause'});}
      else{clearTimeout(evolutionTimer);evolutionTimer=null;receive({type:'paused'});}
      return;
    }
    running(true);if(!once){choose(best);playing=true;$('play').textContent='Ⅱ 일시정지';}
    if(worker){worker.postMessage({type:'run',once});return;}
    const current=token,stop=once?engine.generation+1:Infinity;
    function tick(){evolutionTimer=null;if(!evolving||current!==token)return;try{engine.step(1);receive({type:'candidate',state:engine.snapshot(),candidate:engine.lastCandidate,best:engine.best});if(engine.generation>=stop)receive({type:'paused'});else evolutionTimer=setTimeout(tick,10);}catch(e){receive({type:'error',message:e.message});}}
    evolutionTimer=setTimeout(tick,10);
  }
  function drawGenes(){
    const g=selected?.gene;if(!g)return;
    const frames=selected.record||selected.result.frames||[],stride=Math.max(1,Math.floor(frames.length/500));
    for(const [k,key] of ['steer','throttle','brake'].entries()){
      let d='';for(let i=0;i<frames.length;i+=stride){const f=frames[i],x=Math.min(1,f.s/track.length)*1000,y=k===0?55-f[key]*85:105-f[key]*95;d+=(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2);}$('gene-'+key).setAttribute('d',d);
    }
    for(const factor of factors){let d='';const domain=factor.key==='lineOffset'?(state?.lineRange||{min:-track.width/2,max:track.width/2}):factor;for(let i=0;i<DriftGenome.KNOTS;i++){
      const x=i/(DriftGenome.KNOTS-1)*1000,value=g[i*DriftGenome.STRIDE+factor.index],y=43-(value-domain.min)/Math.max(.01,domain.max-domain.min)*38;
      d+=(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2);
    }$('factor-path-'+factor.key).setAttribute('d',d);}
  }
  function draw(){
    if(!track){const canvas=$('canvas'),ctx=canvas.getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();return;}
    const frames=selected?.record||selected?.result.frames||[],car=DriftRenderer.sampleFrames(frames,time)||DriftPhysics.initialState(vehicle,track);
    scoreReplay();drawScore();
    const targets=selected?DriftGenome.sample(selected.gene,car.s,track.length):null;
    for(const d of factors)$('factor-value-'+d.key).textContent=targets?formatFactor(d,targets[d.key]):'—';
    for(const cursor of document.querySelectorAll('.factor-cursor')){cursor.setAttribute('x1',Math.min(1,car.s/track.length)*1000);cursor.setAttribute('x2',Math.min(1,car.s/track.length)*1000);}
    renderer.render({track,car,record:frames,scoreTimeline,reference:baseline?.record,time,mode:camera,fov:Number($('fov').value),smoke:$('smoke').checked,marks:$('marks').checked,ghost:$('ghost').checked&&selected?.id!=='baseline',vehicle});
    $('speed-value').textContent=(car.speed*3.6).toFixed(0);$('angle-value').textContent=(Math.abs(car.beta)*180/Math.PI).toFixed(1)+'°';$('gear-value').textContent=vehicle.electric?'D':car.gear;$('rpm-value').textContent=Math.round(car.rpm)+' rpm';$('steering-value').textContent=(car.steer*180/Math.PI).toFixed(1)+'°';$('throttle-meter').value=car.throttle;$('brake-meter').value=car.brake;$('torque-value').textContent=Math.round(car.rearTorque)+' Nm';$('slip-value').textContent=car.wheelSlip.slice(2).map(x=>(100*x).toFixed(0)).join(' / ')+'%';$('gene-cursor').setAttribute('x1',car.s/track.length*1000);$('gene-cursor').setAttribute('x2',car.s/track.length*1000);
    const end=selected?.result.time||0;$('replay-time').textContent=selected?time.toFixed(1)+' / '+end.toFixed(1)+' s':'—';$('timeline').value=end?time/end*1000:0;if(selected){$('run-label').textContent=selected.id==='baseline'?'그립 기준 주행':selected.id+(selected.id===best?.id?' · 최고 유전자':'');$('run-state').textContent=time>=end?labels[selected.result.status]+' · '+(selected.result.reason||''):'진행 '+Math.min(track.length,car.s).toFixed(0)+' / '+Math.round(track.length)+'m';}$('model-source').textContent=renderer.getState().modelSource?.label||'EV2 외형 자산';
  }
  function advance(ms){if(playing&&selected){time=Math.min(selected.result.time,time+ms/1000*Number($('playback').value));if(time>=selected.result.time){if(evolving&&selected.result.valid){choose(best);playing=true;$('play').textContent='Ⅱ 일시정지';}else{playing=false;$('play').textContent='▶ 재생';}}}draw();}
  $('replay-powered-exit').onclick=()=>{const exit=best?.result.power?.bestExit;if(!exit)return;choose(best);time=Math.max(0,exit.startTime-.5);playing=true;$('play').textContent='Ⅱ 일시정지';draw();$('stage').scrollIntoView?.({block:'center'});};
  $('play').onclick=()=>{if(!selected)return;if(time>=selected.result.time)time=0;playing=!playing;$('play').textContent=playing?'Ⅱ 일시정지':'▶ 재생';draw();};$('restart').onclick=()=>{time=0;draw();};$('timeline').oninput=()=>{playing=false;$('play').textContent='▶ 재생';time=Number($('timeline').value)/1000*(selected?.result.time||0);draw();};
  $('evolve').onclick=()=>evolve(false);$('one-generation').onclick=()=>evolve(true);$('reset').onclick=initialize;for(const id of ['vehicle','track','seed'])$(id).onchange=initialize;
  for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{camera=button.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('fov').disabled=camera!=='follow';draw();};
  $('fov').oninput=()=>{$('fov-value').value=$('fov').value+'°';draw();};for(const id of ['smoke','marks','ghost'])$(id).onchange=draw;
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch(e){$('stage').classList.toggle('fallback-fullscreen');}renderer.resize();draw();}$('fullscreen').onclick=fullscreen;
  document.addEventListener('keydown',e=>{if(/INPUT|SELECT/.test(e.target.tagName))return;if(e.key==='f')fullscreen();if(e.key==='Escape')$('stage').classList.remove('fallback-fullscreen');if(e.code==='Space'){e.preventDefault();$('play').click();}});
  window.addEventListener('resize',()=>{renderer.resize();draw();});
  document.addEventListener('fullscreenchange',()=>{renderer.resize();draw();});
  window.advanceTime=ms=>{manual=true;advance(ms);};
  window.render_game_to_text=()=>{
    const car=track?DriftRenderer.sampleFrames(selected?.record,time)||DriftPhysics.initialState(vehicle,track):null;
    return JSON.stringify({mode:appMode,development,availableCourses:DriftTrack.list().length,verifiedCourses:DriftTrack.list().length,coordinates:'metres; x east, y north, yaw CCW; z reconstructed relative height',variant:vehicle.id,stock:true,rwd:vehicle.spec.factoryDrive,course:track?.id||null,courseKind:track?.kind||null,courseMetadata:track?{name:track.name,length:track.length,judgedStart:track.judgedStart,judgedEnd:track.judgedEnd,elevation:track.elevation,provenance:track.provenance,reconstruction:track.reconstruction}:null,
      generation:state?.generation||0,evaluated:state?.totalEvaluated||0,workerCount:state?.workerCount||1,score:best?.result.score,baselineTime:baseline?.result.time,preparedBaseline:baseline?.prepared===true,baselineError,genes:selected?.gene.length,
      replayScoring,genome:{version:DriftGenome.VERSION,knots:DriftGenome.KNOTS,stride:DriftGenome.STRIDE,targets:selected&&car?DriftGenome.sample(selected.gene,car.s,track.length):null},
      objective:{type:'sustained-powered-exit',success:best?.result.power?.success===true,bestExit:best?.result.power?.bestExit||null},evolving,pauseRequested,playing,replay:{id:selected?.id,time,end:selected?.result.time,status:selected?.result.status,reason:selected?.result.reason},car:car?{x:car.x,y:car.y,z:car.z,grade:car.grade,bank:car.bank,s:car.s,speed:car.speed,beta:car.beta,steer:car.steer,gear:car.gear,wheelSlip:car.wheelSlip,driver:Object.fromEntries(DriftDriver.TELEMETRY.map(key=>[key,car[key]]))}:null,camera:renderer.getState(),lastCandidate:archive.at(-1)?{id:archive.at(-1).id,status:archive.at(-1).result.status,valid:archive.at(-1).result.valid}:null});
  };
  let lastPaint=0;
  function raf(now){const dt=last?Math.min(100,now-last):0;last=now;if(!manual&&(playing||now-lastPaint>300)){advance(dt);lastPaint=now;}requestAnimationFrame(raf);}specification();initialize();requestAnimationFrame(raf);
})();
