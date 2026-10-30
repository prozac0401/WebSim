/* UI/replay reads recorded physical states. Evolution runs off the render thread. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),renderer=new DriftRenderer($('canvas'));
  let runtimeIdentity=null;
  const params=new URLSearchParams(location.search),development=params.get('development')==='1',availableTracks=DriftTrack.list({includeDevelopment:development});
  const preferredTrack=params.get('track')||(development?DriftTrack.DEVELOPMENT_ID:'kr-kic-t21-kdl-2016-r2');
  let vehicle=DriftCatalog.get('porter-lpg-mt'),track=availableTracks.find(t=>t.id===preferredTrack)||availableTracks[0]||null,worker=null,engine=null,baseline=null,best=null,selected=null,archive=[],state=null,playing=false,evolving=false,pauseRequested=false,evolutionTimer=null,time=0,last=0,camera='follow',ready=false,manual=false,token=0,appMode='initializing',baselineError=null;
  let autoFollow=true,finishHoldMs=0,autoStartPending=true;
  const labels={finished:'유효 완주',offtrack:'앞바퀴 이탈 · 실패',collision:'차체 충돌 · 실패',timeout:'시간 초과',invalid:'계산 오류',spin:'스핀 · 자세 회복'};
  const resultLabel=r=>r.status==='timeout'?(r.reason==='주행 정지'?'주행 정지 · 실패':'제한 시간 초과 · 실패'):(labels[r.status]||r.status);
  // Keep the verified market/specification in the catalog; shorten only the selector label.
  DriftCatalog.list().forEach(v=>{const option=document.createElement('option');option.value=v.id;option.textContent=v.label.replace(/(^|\s)(국내|독일|일본)(?=\s|$)/g,'$1').replace(/\s{2,}/g,' ').trim();$('vehicle').append(option);});$('vehicle').value=vehicle.id;
  availableTracks.forEach(t=>{const option=document.createElement('option');option.value=t.id;option.textContent=t.name;$('track').append(option);});
  if(track)$('track').value=track.id;else{const option=document.createElement('option');option.value='';option.textContent='불러올 수 있는 코스 없음';$('track').append(option);}
  $('track').disabled=!availableTracks.length;
  $('development-notice').hidden=track?.kind!=='development';
  let scoreCache=new WeakMap(),scoreTimeline=[],replayScoring=null;
  const phaseNames={course:'일반 코스',zone:'ZONE 구간',transition:'방향 전환',spin:'스핀 · 자세 회복'};
  const criterionLabels={angle:'각도 10~70°',speed:'속도 ≥ 28.8km/h',retention:'속도 유지 > 70%',forward:'새 구간으로 전진'};
  const percent=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'—';
  const multiplier=value=>'×'+(Number.isFinite(value)?value:1).toFixed(2);
  const connectionState=arc=>arc?.complete?'완전 연결':arc?.anchored?'apex 통과 · 연결 중':'apex 진입 탐색 중';
  const connectionCount=drift=>Number.isFinite(drift?.totalArcCount)?(drift.fullConnectionCount||0)+' / '+drift.totalArcCount:'—';
  const linkCount=drift=>Number.isFinite(drift?.totalLinkCount)?(drift.straightLinkCount||0)+' / '+drift.totalLinkCount:'—';
  const linkState=(link,total)=>total===0?'해당 직선 없음':link?.complete?'앞뒤 코너 연결 완료':link?.coverage>0?'앞뒤 코너 연결 중':'직선 연결 탐색 중';
  const canReplayLink=link=>Number.isFinite(link?.startTime)&&link.duration>0;
  const linkRetention=link=>Number.isFinite(link?.startTime)&&link.minSpeed>0?percent(link.speedRetention):'—';
  const failureAnalysis=()=>selected?.result.valid===false?selected.result.failureAnalysis||null:null;
  const count=value=>Number.isFinite(value)?Math.max(0,Math.floor(value)).toLocaleString('ko-KR'):'—';
  const reuseRatio=stats=>stats?.totalTicks>0&&Number.isFinite(stats.reusedTicks)?stats.reusedTicks/stats.totalTicks:null;
  const locationText=point=>[Number.isFinite(point?.time)?point.time.toFixed(2)+'초':null,Number.isFinite(point?.s)?point.s.toFixed(1)+' m':null].filter(Boolean).join(' · ')||'위치 미확인';
  const familyLabels={'brake-release':'과도한 제동 완화','entry-speed':'진입 전 감속·제동 해제',lead:'카운터 준비',steer:'조향',line:'목표 경로',power:'가속·제동',gear:'유지 기어',angle:'목표 슬립각',combined:'연속 조작',timing:'진입·전환 시점'};
  function drawFailureAnalysis(){
    const failed=selected?.result.valid===false,analysis=failureAnalysis();$('failure-analysis').hidden=!failed;
    $('failure-evidence').replaceChildren();$('failure-hypotheses').replaceChildren();
    $('failure-marker').textContent=failed?resultLabel(selected.result):'';
    $('failure-summary').textContent=analysis?.summary||(failed?'이 기록에는 선행 징후 분석이 없습니다. 실패 순간까지 리플레이를 살펴볼 수 있습니다.':'');
    $('failure-origin').textContent=analysis?(analysis.origin?'선행 징후 '+locationText(analysis.origin)+' → ':'선행 징후 시점 미확인 · ')+'실패 '+locationText(analysis.failure):'';
    $('failure-details').hidden=!analysis;
    $('replay-failure-origin').disabled=!Number.isFinite(analysis?.origin?.time);
    for(const item of analysis?.evidence||[]){const row=document.createElement('li'),label=document.createElement('span'),value=document.createElement('strong');label.textContent=item.label;value.textContent=(typeof item.value==='number'?(Number.isFinite(item.value)?String(Math.round(item.value*100)/100):'—'):String(item.value??'—'))+(item.unit?' '+item.unit:'');row.append(label,value);$('failure-evidence').append(row);}
    if(analysis&&!analysis.evidence?.length){const row=document.createElement('li');row.textContent='기록된 관찰 값이 없습니다.';$('failure-evidence').append(row);}
    for(const hypothesis of analysis?.hypotheses||[]){const row=document.createElement('li');row.textContent=hypothesis.summary+(hypothesis.confidence==='low'?' (근거 수준: 낮음)':hypothesis.confidence==='medium'?' (근거 수준: 보통)':'');$('failure-hypotheses').append(row);}
    if(analysis&&!analysis.hypotheses?.length){const row=document.createElement('li');row.textContent='현재 기록만으로 원인 가설을 좁히기 어렵습니다.';$('failure-hypotheses').append(row);}
    const window=analysis?.window;$('failure-window').textContent=window?'분석 범위 '+locationText({s:window.startS,time:window.startTime})+' ~ '+locationText({s:window.endS,time:window.endTime}):'';
    const families=(analysis?.recommendedFamilies||[]).map(key=>familyLabels[key]).filter(Boolean);$('failure-next').textContent=families.length?'검토할 조작: '+families.join(' · '):'';
  }
  function drawEvaluationProgress(){
    const evaluation=state?.evaluationStats,learning=state?.learningStats,ratio=reuseRatio(evaluation);
    $('evaluation-progress').hidden=!evaluation;
    $('evaluation-reuse').textContent='물리 계산 재사용 '+percent(ratio);
    $('evaluation-detail').textContent=evaluation?'새 계산 '+count(evaluation.simulatedTicks)+'회 · 재사용 '+count(evaluation.reusedTicks)+'회 / 전체 '+count(evaluation.totalTicks)+'회 · 재사용 후보 '+count(evaluation.cacheHits)+' / 평가 '+count(evaluation.evaluations)+'개':'';
    $('learning-progress').hidden=!learning?.enabled;
    $('learning-progress').textContent=learning?.enabled?'실패 분석 '+count(learning.failuresAnalyzed)+'개 · 가설 기반 시도 '+count(learning.guidedProposals)+'개 · 취약 구간 탐색 '+count(learning.focusProposals||0)+'개':'';
    const search=state?.trajectorySearch;
    if(search?.enabled){$('learning-progress').hidden=false;$('learning-progress').textContent=({coarse:'전체 라인 탐색',refine:'라인을 유지하며 조작 다듬기',reopen:'다른 라인 재탐색'}[search.phase]||'전체 라인 탐색')+' · 보존한 라인 '+count(search.families)+'개';}
  }
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
    const label=invalid?'점수 무효':s.provisional?'잠정 점수':'확정 점수';
    $('replay-score-label').textContent=label;$('replay-score').textContent=s.score.toFixed(2);
    $('score-overlay').textContent=label+' '+s.score.toFixed(2)+' · '+(s.earning?'득점 중':phaseNames[s.phase]||'코스 주행');
    $('replay-scoring').classList.toggle('earning',s.earning);$('replay-scoring').classList.toggle('invalid',invalid);
    $('score-phase').textContent=phaseNames[s.phase]||'코스 주행';$('score-reason').textContent=s.reason;
    $('score-chain-multiplier').textContent=multiplier(s.chainMultiplier);
    $('score-zone-multiplier').textContent='×'+(s.zoneMultiplier===2?2:1);
    $('score-combined-multiplier').textContent=multiplier(s.combinedMultiplier);
    $('score-connection').textContent='코너 연결 '+connectionCount(s)+(s.arc?' · '+connectionState(s.arc):'');
    $('score-link').textContent='직선 연결 '+linkCount(s)+' · '+linkState(s.link,s.totalLinkCount);
    $('score-link-detail').hidden=!s.link;
    $('score-link-detail').textContent=s.link?'직선 연결률 '+percent(s.link.coverage)+' · 직선 내 최저속도 유지율 '+linkRetention(s.link):'';
    $('score-link-transition').hidden=!s.transitioning;
    $('score-link-transition').textContent=s.transitioning?'방향 전환 중 · 연속 배수 유지, 득점과 배수 증가는 정지':'';
    $('score-change').textContent=invalid?'선발 제외':s.delta>0?(s.delta>=.001?'+'+s.delta.toFixed(s.delta>=.01?2:3)+'점':'득점 중'):'득점 없음';
    $('score-exit').textContent='현재 연속 드리프트 '+(Number.isFinite(s.chainDistance)?s.chainDistance:0).toFixed(1)+' m';
    $('score-speed').textContent=Number.isFinite(s.referenceSpeed)?'속도 기준 '+(s.referenceSpeed*3.6).toFixed(1)+' km/h · 현재 속도 유지율 '+percent(s.speedRetention):'각도와 속도를 유지하며 전진할 때 득점합니다.';
    $('score-criteria').replaceChildren();for(const [key,label] of Object.entries(criterionLabels)){const chip=document.createElement('span'),met=s.conditions[key];chip.className=met?'met':'unmet';chip.textContent=(met?'✓ ':'○ ')+label;$('score-criteria').append(chip);}
    const partNames={base:'기본 득점',continuity:'연속 배수 가산',zone:'ZONE 가산'};
    $('score-parts').textContent=(invalid?'무효 처리: ':'')+Object.entries(s.parts).map(([key,value])=>partNames[key]+' '+value.toFixed(2)).join(' · ');
  }
  function specification(){const p=vehicle.physics;$('factory-stats').innerHTML='<div>'+Math.round(p.peakPowerW/735.49875)+' PS<small>순정 출력</small></div><div>'+p.peakTorque+' Nm<small>최대 토크</small></div><div>'+p.massKg+' kg<small>공차 중량</small></div>';$('limitations').textContent=vehicle.limitations.join(' ');$('factory-source').href=vehicle.sourceUrl;}
  function courseSpecification(){
    const synthetic=track?.kind==='development',kic=track?.id==='kr-kic-t21-kdl-2016-r2';
    $('development-notice').hidden=!synthetic;$('course-summary').hidden=!track||synthetic;
    $('course-code').textContent=track?.shortName||(kic?'KIC T21':track?(track.name||track.id).split(' · ')[0]:'코스 준비');
    const rounds=track?.event?.rounds||(track?.event?.round?[track.event.round]:[]);
    const eventLabel=track?.event?[track.event.year,track.event.series,rounds.length?'R'+rounds.join('·'):''].filter(Boolean).join(' '):'';
    $('course-description').textContent=track?(synthetic?'가상 개발 코스 · ':eventLabel?eventLabel+' · ':'')+Math.round(track.length)+' m · 전체 코스 채점':'코스 자료를 불러올 수 없습니다.';
    if(!track)return;
    $('course-event-title').textContent=track.name||track.id;
    $('course-measures').textContent='전체 주행 구간 '+Math.round(track.length)+' m · ZONE에서 추가 2배';
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
  function stopFollowing(){autoFollow=false;finishHoldMs=0;}
  function choose(entry,{follow=false,autoplay=false}={}){if(!entry)return;selected=entry;time=0;autoFollow=follow;finishHoldMs=0;playing=autoplay;$('play').textContent=playing?'Ⅱ 일시정지':'▶ 재생';renderRecords();drawFailureAnalysis();draw();}
  function followBest(){if(best?.result.valid&&best.result.status==='finished')choose(best,{follow:true,autoplay:true});}
  function renderRecords(){
    const entries=[baseline?{id:'baseline',generation:0,kind:'baseline',gene:baseline.gene,result:baseline.result,record:baseline.record}:null,best&&best.id!=='baseline'?best:null,...archive.slice().reverse()].filter(Boolean),seen=new Set();$('records').replaceChildren();
    for(const entry of entries){if(seen.has(entry.id))continue;seen.add(entry.id);const b=document.createElement('button');b.className='record';b.setAttribute('aria-pressed',String(selected?.id===entry.id));const r=entry.result;const name=entry.id==='baseline'?'그립 기준':entry.id+(entry.id===best?.id?' · 대표':'');for(const [i,text] of [name,resultLabel(r),r.valid?r.score.toFixed(2)+'점'+(r.drift?' · 완전 '+connectionCount(r.drift):''):'선발 제외',r.time.toFixed(2)+'초'].entries()){const s=document.createElement('span');s.textContent=text;if(i===1)s.className=r.valid?'valid':'failed';b.append(s);}b.addEventListener('click',()=>entry.id===best?.id?followBest():choose(entry));$('records').append(b);}
  }
  function stats(){
    if(!state)return;
    drawEvaluationProgress();
    $('generation').textContent=state.generation+'세대';$('best-score').textContent=best?.result.score.toFixed(2)||'—';
    $('baseline-score').textContent='그립 '+baseline.result.time.toFixed(2)+'초 · '+baseline.result.score.toFixed(2)+'점';
    const drift=best.result.drift,arc=drift?.bestArc;
    $('full-connections').textContent=connectionCount(drift);$('straight-links').textContent=linkCount(drift);
    const scoring=drift?.scoring;
    $('best-summary').textContent=scoring?.scoredDistance>0?'최장 연결 '+scoring.maxChainDistance.toFixed(1)+' m · 최고 연속 '+multiplier(scoring.maxMultiplier)+' · 평균 '+scoring.meanAngle.toFixed(1)+'°':'연속 드리프트를 탐색하고 있습니다.';
    $('replay-straight-link').disabled=!canReplayLink(drift?.bestLink);
    $('replay-apex-arc').disabled=!arc;
    const completed=state.history.at(-1),current=state.evaluated?state.stats:completed;
    $('valid-count').textContent=current?.validCount||0;$('failed-count').textContent=current?.failureCount||0;$('evaluated-count').textContent=state.evaluated+' / 20';
    $('generation-progress').value=state.evaluated;
  }
  function receive(m){
    if(m.type==='ready'||m.type==='candidate')try{DriftRuntime.assertIdentity(m.runtimeIdentity,runtimeIdentity);}catch(error){worker?.terminate();receive({type:'error',message:error.message,updateRequired:true});return;}
    if(m.type==='ready'){appMode='ready';baselineError=null;baseline={...m.baseline,result:m.best.result};best=m.best;state=m.state;$('loading').hidden=true;$('baseline-notice').hidden=true;setReady(true);running(false);$('evolution-status').textContent=(track.kind==='development'?'가상 개발 코스 · ':'')+'준비된 기준 기록을 불러왔습니다. 진화를 시작할 수 있습니다.';followBest();stats();if(autoStartPending){autoStartPending=false;evolve(false);}}
    if(m.type==='candidate'){state=m.state;archive.push(m.candidate);if(archive.length>12)archive.shift();if(m.best?.result.valid&&m.best.result.status==='finished'&&(!best||m.best.result.score>=best.result.score))best=m.best;stats();renderRecords();$('evolution-status').textContent=state.totalEvaluated+'개 후보 평가 · 최근 후보 '+(m.candidate.result.valid?'유효 완주':'실패 · 선발 제외');}
    if(m.type==='paused'){pauseRequested=false;running(false);}
    if(m.type==='error'){
      const loading=!baseline;appMode=loading?'baseline-unavailable':'error';baselineError=m.message||'기준 기록을 불러오지 못했습니다.';pauseRequested=false;stopFollowing();playing=false;$('play').textContent='▶ 재생';clearTimeout(evolutionTimer);evolutionTimer=null;running(false);setReady(false);
      $('loading').hidden=!!track;$('baseline-notice').hidden=!track;$('baseline-notice-title').textContent=loading?'이 사양의 기준 주행을 준비 중입니다':'진화 계산을 멈췄습니다';
      const detail=loading?'코스와 카메라는 살펴볼 수 있습니다. 준비된 기준 기록을 불러온 뒤 재생과 진화를 시작합니다.':'새 실험으로 다시 시작할 수 있습니다. 저장된 주행 기록은 계속 재생할 수 있습니다.';
      if(m.updateRequired){$('baseline-notice-title').textContent='실행 파일 업데이트 필요';$('baseline-notice-detail').textContent=m.message;$('evolution-status').textContent=m.message;}
      else{$('baseline-notice-detail').textContent=detail;$('evolution-status').textContent=detail;}
      if(loading){$('run-label').textContent='코스 미리보기';$('run-state').textContent='선택 사양의 기준 기록 준비 중';$('replay-time').textContent='—';}
      else for(const id of ['play','restart','timeline'])$(id).disabled=false;
      if(!track){setBusy('코스를 불러오지 못했습니다',false);$('loading-detail').textContent='코스 자료와 연결 상태를 확인해 주세요.';}draw();
    }
  }
  async function initialize(){
    $('best-summary').textContent='연속 드리프트를 탐색하고 있습니다.';$('replay-apex-arc').disabled=true;$('replay-straight-link').disabled=true;
    for(const id of ['baseline-score','full-connections','straight-links'])$(id).textContent='—';
    $('generation').textContent='0세대';$('valid-count').textContent='0';$('failed-count').textContent='0';$('evaluated-count').textContent='0 / 20';$('generation-progress').value=0;
    const current=++token;worker?.terminate();worker=null;engine=null;baseline=best=selected=null;archive=[];state=null;baselineError=null;time=0;playing=false;autoFollow=true;finishHoldMs=0;pauseRequested=false;scoreCache=new WeakMap();scoreTimeline=[];replayScoring=null;drawScore();drawFailureAnalysis();drawEvaluationProgress();clearTimeout(evolutionTimer);evolutionTimer=null;running(false);setReady(false);$('baseline-notice').hidden=true;
    vehicle=DriftCatalog.get($('vehicle').value);renderer.retryVehicle(vehicle.vehicleId);track=availableTracks.find(t=>t.id===$('track').value)||null;
    specification();courseSpecification();$('records').replaceChildren();$('best-score').textContent='—';
    $('play').textContent='▶ 재생';
    $('stage').classList.toggle('no-course',!track);document.body.classList.toggle('no-course',!track);
    for(const id of ['seed','reset','playback','fullscreen','fov','smoke','marks'])$(id).disabled=!track;
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
    try{runtimeIdentity=DriftRuntime.identity(vehicle,track);}catch(error){receive({type:'error',message:error.message,updateRequired:error.code==='runtime-mismatch'});return;}
    if(location.protocol!=='file:'&&typeof Worker!=='undefined'){worker=new Worker(DriftRuntime.url('worker.js'));worker.onmessage=e=>{if(current===token)receive(e.data);};worker.onerror=e=>{if(current===token)receive({type:'error',message:e.message||'계산 작업을 시작하지 못했습니다.',updateRequired:String(e.message||'').includes('실행 파일의 버전이 다릅니다')});};worker.postMessage({type:'init',variantId:vehicle.id,trackId:track.id,seed,includeDevelopment:development,workers:Number(params.get('workers'))||undefined,runtimeIdentity});}
    else try{const b=await DriftPreparedGrips.load(vehicle,track);if(current!==token)return;engine=new DriftEvolution.Engine(vehicle,track,{seed,populationSize:20,knots:128,baseline:b});engine.initialize();if(!engine.ready)throw new Error(engine.blockedReason||'준비된 기준 기록을 사용할 수 없습니다.');receive({type:'ready',baseline:b,best:engine.best,state:engine.snapshot(),runtimeIdentity});}catch(e){if(current===token)receive({type:'error',message:e.message});}
  }
  function evolve(once){
    if(!ready||pauseRequested)return;
    if(evolving){
      stopFollowing();playing=false;$('play').textContent='▶ 재생';
      if(worker){pauseRequested=true;running(true);worker.postMessage({type:'pause'});}
      else{clearTimeout(evolutionTimer);evolutionTimer=null;receive({type:'paused'});}
      return;
    }
    running(true);followBest();$('evolution-status').textContent='진화 중 · 새로운 주행을 평가하고 있습니다.';
    if(worker){worker.postMessage({type:'run',once});return;}
    const current=token,stop=once?engine.generation+1:Infinity;
    function tick(){evolutionTimer=null;if(!evolving||current!==token)return;try{engine.step(1);receive({type:'candidate',state:engine.snapshot(),candidate:engine.lastCandidate,best:engine.best,runtimeIdentity});if(engine.generation>=stop)receive({type:'paused'});else evolutionTimer=setTimeout(tick,10);}catch(e){receive({type:'error',message:e.message});}}
    evolutionTimer=setTimeout(tick,10);
  }
  function pedalInputs(car){
    // Recorded engagement includes both the MT shift mechanism and clutch kicks.
    // clutchPedal alone contains only the kick command, not the shift operation.
    const clutch=Number.isFinite(car.clutchEngagement)?1-car.clutchEngagement:car.clutchPedal;
    return {clutch:vehicle.physics.transmissionType==='MT'?clutch:null,brake:car.brake,throttle:car.throttle};
  }
  function drawDashboard(car){
    const p=vehicle.physics,manualClutch=p.transmissionType==='MT',electric=!!p.electric;
    const inputs=pedalInputs(car);$('clutch-input').hidden=!manualClutch;
    const fraction=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
    // Match EV2's eight shift lamps, using this replay's physical engine RPM.
    const rpm=Number.isFinite(car.rpm)?Math.round(car.rpm):0;
    const normalized=electric?0:fraction((rpm-p.idleRPM)/Math.max(1,p.shiftRPM-p.idleRPM));
    const lamps=Math.min(8,Math.ceil(normalized*8)),cue=!electric&&!(car.shiftTimer>0)&&car.gear<p.gearRatios.length&&normalized>=.94;
    $('speed-value').textContent=(car.speed*3.6).toFixed(0);
    $('gear-value').textContent=electric?'D':car.gear;
    $('rpm-value').textContent=electric?'전기':rpm.toLocaleString('en-US')+' rpm';
    $('shift-readout').hidden=electric;
    [...$('shift-lights').children].forEach((lamp,i)=>lamp.classList.toggle('lit',i<lamps));
    $('shift-lights').setAttribute('aria-valuenow',Math.round(normalized*100));
    $('shift-lights').setAttribute('aria-valuetext',rpm+' rpm'+(cue?' · 변속 시점':''));
    $('shift-cue').textContent=cue?'변속':'변속 신호';$('shift-cue').classList.toggle('shift-ready',cue);
    for(const [id,label,value,available] of [['clutch','클러치',inputs.clutch,manualClutch],['brake','브레이크',inputs.brake,true],['throttle','악셀',inputs.throttle,true]]){
      const percent=available?Math.round(fraction(value)*100):0,meter=$(id+'-input');
      $(id+'-value').textContent=available?percent+'%':'—';$(id+'-fill').style.width=percent+'%';
      meter.setAttribute('aria-valuenow',percent);meter.setAttribute('aria-valuetext',available?label+' '+percent+'%':label+' 페달 없음');
      meter.setAttribute('aria-disabled',String(!available));
    }
  }
  function draw(){
    if(!track){const canvas=$('canvas'),ctx=canvas.getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();return;}
    const frames=selected?.record||selected?.result.frames||[],car=DriftRenderer.sampleFrames(frames,time)||DriftPhysics.initialState(vehicle,track);
    scoreReplay();drawScore();
    renderer.render({track,car,record:frames,time,mode:camera,fov:Number($('fov').value),smoke:$('smoke').checked,marks:$('marks').checked,vehicle});
    drawDashboard(car);
    const end=selected?.result.time||0;$('replay-time').textContent=selected?time.toFixed(1)+' / '+end.toFixed(1)+' s':'—';$('timeline').value=end?time/end*1000:0;if(selected){$('run-label').textContent=selected.id==='baseline'?'그립 기준 주행':selected.id+(selected.id===best?.id?' · 대표 주행':'');$('run-state').textContent=time>=end?resultLabel(selected.result)+(selected.result.reason&&selected.result.status!=='timeout'?' · '+selected.result.reason:''):'진행 '+Math.min(track.length,car.s).toFixed(0)+' / '+Math.round(track.length)+'m';}$('model-source').textContent=renderer.getState().modelSource?.label||'EV2 외형 자산';
  }
  function advance(ms){
    if(playing&&selected){
      if(finishHoldMs>0){
        finishHoldMs=Math.max(0,finishHoldMs-ms);
        // Pick the newest representative only after this run and its goal hold.
        if(finishHoldMs===0&&autoFollow)followBest();
      }else{
        time=Math.min(selected.result.time,time+ms/1000*Number($('playback').value));
        // Show the finished frame for one real second, independent of replay
        // speed. The renderer holds its camera until the replay rewinds.
        if(time>=selected.result.time){
          if(autoFollow&&selected.result.valid&&selected.result.status==='finished')finishHoldMs=1000;
          else{playing=false;$('play').textContent='▶ 재생';}
        }
      }
    }
    draw();
  }
  $('replay-apex-arc').onclick=()=>{const arc=best?.result.drift?.bestArc;if(!arc)return;choose(best);time=Math.max(0,(arc.initiationTime??arc.startTime)-.5);playing=true;$('play').textContent='Ⅱ 일시정지';draw();$('stage').scrollIntoView?.({block:'center'});};
  $('replay-straight-link').onclick=()=>{const link=best?.result.drift?.bestLink;if(!canReplayLink(link))return;choose(best);time=Math.max(0,link.startTime-.5);playing=true;$('play').textContent='Ⅱ 일시정지';draw();$('stage').scrollIntoView?.({block:'center'});};
  $('replay-failure-origin').onclick=()=>{const analysis=failureAnalysis();if(!Number.isFinite(analysis?.origin?.time))return;stopFollowing();time=Math.max(0,Math.min(selected.result.time,analysis.origin.time));playing=true;$('play').textContent='Ⅱ 일시정지';draw();$('stage').scrollIntoView?.({block:'center'});};
  $('play').onclick=()=>{if(!selected)return;stopFollowing();if(!playing&&time>=selected.result.time)time=0;playing=!playing;$('play').textContent=playing?'Ⅱ 일시정지':'▶ 재생';draw();};$('restart').onclick=()=>{stopFollowing();time=0;draw();};$('timeline').oninput=()=>{stopFollowing();playing=false;$('play').textContent='▶ 재생';time=Number($('timeline').value)/1000*(selected?.result.time||0);draw();};
  $('evolve').onclick=()=>evolve(false);$('one-generation').onclick=()=>evolve(true);$('reset').onclick=initialize;for(const id of ['vehicle','track','seed'])$(id).onchange=initialize;
  for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{camera=button.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('fov').disabled=camera!=='follow';draw();};
  $('fov').oninput=()=>{$('fov-value').value=$('fov').value+'°';draw();};for(const id of ['smoke','marks'])$(id).onchange=draw;
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch(e){$('stage').classList.toggle('fallback-fullscreen');}renderer.resize();draw();}$('fullscreen').onclick=fullscreen;
  document.addEventListener('keydown',e=>{if(/INPUT|SELECT/.test(e.target.tagName))return;if(e.key==='f')fullscreen();if(e.key==='Escape')$('stage').classList.remove('fallback-fullscreen');if(e.code==='Space'){e.preventDefault();$('play').click();}});
  window.addEventListener('resize',()=>{renderer.resize();draw();});
  document.addEventListener('fullscreenchange',()=>{renderer.resize();draw();});
  window.advanceTime=ms=>{manual=true;advance(ms);};
  window.render_game_to_text=()=>{
    const car=track?DriftRenderer.sampleFrames(selected?.record,time)||DriftPhysics.initialState(vehicle,track):null;
    return JSON.stringify({mode:appMode,development,availableCourses:DriftTrack.list().length,verifiedCourses:DriftTrack.list().length,coordinates:'metres; x east, y north, yaw CCW; z reconstructed relative height',variant:vehicle.id,stock:true,rwd:vehicle.spec.factoryDrive,course:track?.id||null,courseKind:track?.kind||null,courseMetadata:track?{name:track.name,length:track.length,judgedStart:track.judgedStart,judgedEnd:track.judgedEnd,elevation:track.elevation,provenance:track.provenance,reconstruction:track.reconstruction}:null,
      release:DriftRuntime.RELEASE,runtimeIdentity,generation:state?.generation||0,evaluated:state?.totalEvaluated||0,workerCount:state?.workerCount||1,score:best?.result.score,baselineTime:baseline?.result.time,preparedBaseline:baseline?.prepared===true,baselineError,genes:selected?.gene.length,
      replayScoring,failureAnalysis:failureAnalysis(),evaluationStats:state?.evaluationStats||null,evaluationReuseRatio:reuseRatio(state?.evaluationStats),learningStats:state?.learningStats||null,selectionStats:state?.selectionStats||null,trajectorySearch:state?.trajectorySearch||null,genome:{version:DriftGenome.VERSION,knots:DriftGenome.KNOTS,stride:DriftGenome.STRIDE,targets:selected&&car?DriftGenome.sample(selected.gene,car.s,track.length):null},
      objective:{type:'whole-course-continuous-drift',fullConnectionCount:best?.result.drift?.fullConnectionCount||0,totalArcCount:best?.result.drift?.totalArcCount||0,straightLinkCount:best?.result.drift?.straightLinkCount||0,totalLinkCount:best?.result.drift?.totalLinkCount||0,parts:best?.result.drift?.scoring?.parts||null,scoring:best?.result.drift?.scoring||null,bestArc:best?.result.drift?.bestArc||null,bestLink:best?.result.drift?.bestLink||null},evolving,pauseRequested,playing,replay:{id:selected?.id,time,end:selected?.result.time,status:selected?.result.status,reason:selected?.result.reason,autoFollow,finishHoldMs},car:car?{x:car.x,y:car.y,z:car.z,grade:car.grade,bank:car.bank,s:car.s,speed:car.speed,beta:car.beta,steer:car.steer,gear:car.gear,rpm:car.rpm,inputs:pedalInputs(car),clutch:{pedal:car.clutchPedal,engagement:car.clutchEngagement,torque:car.clutchTorque,slipRPM:car.clutchSlipRPM,active:car.clutchKickActive,count:car.clutchKickCount},wheelSlip:car.wheelSlip,driver:Object.fromEntries(DriftDriver.TELEMETRY.map(key=>[key,car[key]]))}:null,camera:renderer.getState(),lastCandidate:archive.at(-1)?{id:archive.at(-1).id,status:archive.at(-1).result.status,valid:archive.at(-1).result.valid}:null});
  };
  let lastPaint=0;
  function raf(now){const dt=last?Math.min(100,now-last):0;last=now;if(!manual&&(playing||now-lastPaint>300)){advance(dt);lastPaint=now;}requestAnimationFrame(raf);}specification();initialize();requestAnimationFrame(raf);
})();
