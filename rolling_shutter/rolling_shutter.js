(() => {
  'use strict';
  const E = window.ShutterEngine, $ = id => document.getElementById(id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d'), SIZE = 256, FIELDS = ['readout','exposure','speed','phase','direction','blades'];
  let settings = {...E.DEFAULTS}, mission = E.MISSIONS[0], progress = 1, running = false, scanned = false;
  let manual = false, last = null, queued = false, snapshot, globalPhoto, reference, score = null;
  let photoCanvas, globalCanvas, referenceCanvas, differenceCanvas, instantCanvas;
  let expanded = false, currentInstantTime = 0;
  const completed = new Set();
  try { JSON.parse(localStorage.getItem('websim.camera.solved.v1') || '[]').filter(id => E.MISSIONS.some(m => m.id === id)).forEach(id => completed.add(id)); } catch (_) {}
  const message = text => { $('message').textContent = text; };
  function toCanvas(image, old) {
    const c = old || document.createElement('canvas'); c.width = image.width; c.height = image.height;
    c.getContext('2d').putImageData(new ImageData(image.pixels, image.width, image.height), 0, 0); return c;
  }
  function updateControls() {
    for (const field of FIELDS) {
      const input = $(field); input.disabled = !!mission && !mission.editable.includes(field); input.value = String(settings[field]);
      const fixed = input.disabled ? ' · 고정' : '';
      if (field === 'direction') document.querySelector('[data-fixed="direction"]').textContent = input.disabled ? '알려진 조건' : '';
      else if (field !== 'blades') $(field+'-value').textContent = field === 'speed' ? (settings.speed > 0 ? '+' : '')+settings.speed+' 바퀴/s'+fixed : settings[field]+(field === 'phase' ? '°' : ' ms')+fixed;
    }
    $('blades-control').hidden = !!mission;
    $('mission-brief').textContent = mission ? mission.brief : '회전·읽기·노출을 따로 조절해 보세요. 읽는 시간 0에서는 롤링 셔터와 글로벌 셔터가 같아집니다. 회전을 멈춰도 같은 결과가 나올까요?';
    $('mission-clue').textContent = mission ? mission.clue : '주황 날개 한 개는 방향을 구별하기 위한 표식입니다. 사진은 매번 같은 시작 각도에서 계산합니다.';
    $('check').disabled = !mission; $('hint').disabled = !mission;
    $('next').disabled = !mission || !completed.has(mission.id);
    $('next').textContent = mission && mission.id === 'spin' ? '자유 실험 →' : '다음 미션 →';
    $('comparison').querySelector('[value="reference"]').disabled = !mission;
    $('difference').disabled = !mission;
    $('solved-count').textContent = completed.size+' / 4';
  }
  function layout() {
    const mobile=window.matchMedia('(max-width: 540px)').matches;
    $(mobile?'mobile-tools-home':'toolbar-home').append($('camera-toolbar'));
    $(mobile?'mobile-message-home':'message-home').append($('message'));
    if(mobile && $('camera-preview').parentElement.id==='preview-home') {
      // Keep the one canvas beside the editable controls; its sticky area belongs to the whole control panel.
      $('mobile-preview-home').replaceWith($('camera-preview'));
    } else if(!mobile && $('camera-preview').parentElement.id!=='preview-home') {
      const anchor=document.createElement('div');anchor.id='mobile-preview-home';$('camera-preview').before(anchor);$('preview-home').append($('camera-preview'));
    }
    draw();
  }
  function rebuild() {
    snapshot = E.render(settings, SIZE); globalPhoto = E.render(settings, SIZE, SIZE, 'global');
    photoCanvas = toCanvas(snapshot, photoCanvas); globalCanvas = toCanvas(globalPhoto, globalCanvas);
    score = reference ? E.similarity(snapshot, reference) : null;
    if (reference) {
      const pixels = new Uint8ClampedArray(SIZE*SIZE*4);
      for (let i=0; i<pixels.length; i+=4) {
        const delta = Math.max(Math.abs(snapshot.pixels[i]-reference.pixels[i]), Math.abs(snapshot.pixels[i+1]-reference.pixels[i+1]), Math.abs(snapshot.pixels[i+2]-reference.pixels[i+2]));
        pixels[i]=190; pixels[i+1]=58; pixels[i+2]=109; pixels[i+3]=Math.min(190,delta*1.5);
      }
      differenceCanvas = toCanvas({width:SIZE,height:SIZE,pixels}, differenceCanvas);
    }
    draw();
  }
  function chooseMission(id) {
    mission = E.MISSIONS.find(m => m.id === id) || null;
    settings = mission ? {...mission.initial} : {...settings};
    reference = mission ? E.render(mission.target, SIZE) : null;
    referenceCanvas = reference ? toCanvas(reference, referenceCanvas) : null;
    running=false; progress=1; scanned=false; $('hint-text').hidden=true; $('difference').checked=false;
    $('comparison').value=mission?'reference':'instant'; updateControls(); rebuild();
    message(mission ? '기준 사진을 보고 열린 조건을 바꿔 보세요. ‘사진 판정’으로 96% 일치에 도전합니다.' : '모든 조건을 바꿀 수 있습니다. 읽는 시간과 노출 시간을 따로 비교해 보세요.');
  }
  function change(field) {
    settings[field] = field === 'direction' ? $(field).value : Number($(field).value);
    running=false; progress=1; scanned=false; updateControls();
    if (!queued) { queued=true; requestAnimationFrame(() => { queued=false; rebuild(); }); }
    message('설정이 바뀌었습니다. 같은 시작 각도에서 계산한 완성 사진입니다.');
  }
  for (const field of FIELDS) $(field).addEventListener(field === 'direction' || field === 'blades' ? 'change' : 'input', () => change(field));
  function start() { running=true; progress=0; scanned=true; last=null; message('한 줄씩 사진에 기록하는 과정을 천천히 재생합니다. 비교 장면을 ‘실제 순간 모습’으로 바꾸면 날개가 움직이는 모습도 볼 수 있어요.'); draw(); }
  function togglePause() { if (progress>=1) {start();return;} running=!running; last=null; message(running?'이어서 줄을 읽습니다.':'촬영을 멈췄습니다. → 키나 ‘10%씩 보기’로 다음 줄들을 볼 수 있습니다.'); draw(); }
  function step() { running=false; scanned=true; progress=progress>=1?0:progress; update(200); draw(); }
  function update(ms) {
    progress=Math.min(1, progress+ms/2000);
    if (progress >= 1) { running=false; message('촬영 완료. 위와 아래가 서로 다른 시각에 기록된 한 장의 사진입니다.'); }
  }
  function syncStats() {
    const previouslySolved=!!mission&&completed.has(mission.id);
    const currentlySolved=previouslySolved&&score!==null&&score>=96;
    $('score-stat').textContent=score===null?'자유 실험':score.toFixed(1)+'%';
    $('mobile-score').textContent=score===null?'자유 실험 · 같은 시작 각도로 비교합니다':score.toFixed(1)+'% 일치 · 목표 96%'+(currentlySolved?' · 재현 성공 ✓':previouslySolved?' · 이전 성공 기록 있음':'');
    $('turn-stat').textContent=(Math.abs(settings.speed)*settings.readout/1000).toFixed(2)+' 바퀴';
    $('scan-stat').textContent=progress>=1?'완성 사진':Math.round(progress*100)+'%';
    $('pause').disabled=progress>=1; $('pause').textContent=running?'일시정지':'계속 촬영';
    $('mode-chip').textContent=running?'한 줄씩 기록 중':progress<1?'촬영 멈춤':mission?(currentlySolved?'재현 성공':previouslySolved?'이전 성공 기록':'사진 추리'):'자유 실험';
  }
  function drawPanel(image, x, y, size, title, subtitle, rolling, narrow) {
    ctx.fillStyle='#263e33'; ctx.font='600 '+(narrow?16:19)+'px sans-serif'; ctx.textAlign='left'; ctx.fillText(title,x,y-31);
    ctx.fillStyle='#718074'; ctx.font='13px sans-serif'; ctx.fillText(subtitle,x,y-10);
    ctx.fillStyle='#f2f5ee';ctx.fillRect(x,y,size,size);ctx.drawImage(image,x,y,size,size);
    if (rolling && $('difference').checked && reference) ctx.drawImage(differenceCanvas,x,y,size,size);
    if (rolling && progress<1) {
      const fromTop=settings.direction==='down', height=(1-progress)*size, startY=fromTop?y+progress*size:y;
      ctx.fillStyle='#e7ece4';ctx.fillRect(x,startY,size,height);
      const lineY=fromTop?y+progress*size:y+(1-progress)*size;
      ctx.strokeStyle='#d66d4b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,lineY);ctx.lineTo(x+size,lineY);ctx.stroke();
      if(height>60){ctx.fillStyle='#718074';ctx.font='13px sans-serif';ctx.textAlign='center';ctx.fillText('아직 읽지 않은 줄',x+size/2,startY+height/2);}
    }
    ctx.strokeStyle='#d4dfce';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,size-1,size-1);
    ctx.textAlign='left';
  }
  function draw() {
    if(!photoCanvas)return;
    const mobile=window.matchMedia('(max-width: 540px)').matches;
    const portrait=mobile && (!!document.fullscreenElement || expanded), narrow=mobile&&!portrait;
    const width=mobile?460:900,height=portrait?1030:narrow?295:555;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.fillStyle='#f8faf5';ctx.fillRect(0,0,width,height);
    const compare=$('comparison').value;
    currentInstantTime=scanned?progress*settings.readout/1000+settings.exposure/1000:(settings.readout+settings.exposure)/2000;
    let left=referenceCanvas, title='기준 사진', subtitle='이 사진을 만든 촬영 조건을 추리하세요';
    if(compare==='instant') {instantCanvas=toCanvas(E.render(settings,192,192,'instant',currentInstantTime),instantCanvas);left=instantCanvas;title='실제 순간 모습';subtitle='모든 점이 같은 시각 · t = '+(currentInstantTime*1000).toFixed(0)+' ms';}
    if(compare==='global'){left=globalCanvas;title='글로벌 셔터 사진';subtitle='모든 줄을 동시에 노출 · 같은 노출 길이';}
    const x1=portrait?30:narrow?20:26,y1=narrow?52:68,size=portrait?400:narrow?200:410,x2=portrait?30:narrow?240:464,y2=portrait?558:y1;
    drawPanel(left||globalCanvas,x1,y1,size,narrow?({'instant':'순간 모습','global':'글로벌 사진','reference':'기준 사진'}[compare]):title,narrow?(compare==='reference'?'추리할 사진':compare==='global'?'모든 줄을 동시에':'t = '+(currentInstantTime*1000).toFixed(0)+' ms'):subtitle,false,narrow);
    drawPanel(photoCanvas,x2,y2,size,narrow?'내 사진 · 롤링':'내 롤링 셔터 사진',narrow?(settings.direction==='down'?'위 → 아래':'아래 → 위'):(settings.direction==='down'?'위에서 아래로 · 줄마다 다른 시각':'아래에서 위로 · 줄마다 다른 시각'),true,narrow);
    const footerY=portrait?986:narrow?274:507;
    ctx.fillStyle='#718074';ctx.font='13px sans-serif';ctx.textAlign='left';
    ctx.fillText('읽기 '+settings.readout+' ms + 각 줄 노출 '+settings.exposure+' ms',x1,footerY);
    ctx.fillStyle='#d4dfce';ctx.fillRect(x1,footerY+14,width-2*x1,5);
    ctx.fillStyle='#39745a';ctx.fillRect(x1,footerY+14,(width-2*x1)*progress,5);
    syncStats();
  }
  $('capture').onclick=start; $('pause').onclick=togglePause; $('step').onclick=step;
  $('reset').onclick=()=>{if(!mission)settings={...E.DEFAULTS};chooseMission($('mission').value);};
  $('mission').onchange=()=>chooseMission($('mission').value);
  $('comparison').onchange=draw; $('difference').onchange=draw;
  $('hint').onclick=()=>{if(!mission)return;$('hint-text').textContent=mission.hint;$('hint-text').hidden=!$('hint-text').hidden;};
  $('check').onclick=()=>{
    if(!mission)return;
    // Judge the actual current image, even if an input's queued animation frame has not run yet.
    rebuild();running=false;progress=1;scanned=false;
    if(score>=96){completed.add(mission.id);try{localStorage.setItem('websim.camera.solved.v1',JSON.stringify([...completed]));}catch(_){}message('재현 성공! '+score.toFixed(1)+'% 일치합니다. 같은 사진을 만드는 조건을 찾았어요. 다음 미션으로 이어가세요.');}
    else message(score.toFixed(1)+'% 일치합니다. 96% 이상이면 성공입니다. 주황 날개의 위치와 곡률, 번짐을 비교해 보세요.');
    updateControls();draw();
  };
  $('next').onclick=()=>{if(!mission||!completed.has(mission.id))return;const i=E.MISSIONS.indexOf(mission);$('mission').value=E.MISSIONS[i+1]?.id||'free';chooseMission($('mission').value);};
  $('save').onclick=()=>{if(queued){queued=false;rebuild();}const a=document.createElement('a');a.download='websim-rolling-shutter.png';a.href=photoCanvas.toDataURL('image/png');a.click();message('내 롤링 셔터 완성 사진을 PNG로 저장했습니다. 비교 화면과 차이 강조는 포함하지 않습니다.');};
  async function fullscreen() {
    if(expanded){expanded=false;$('stage').classList.remove('camera-expanded');$('exit-fullscreen').hidden=true;draw();return;}
    if(document.fullscreenElement){await document.exitFullscreen();return;}
    try{if(!$('stage').requestFullscreen)throw new Error('unsupported');await $('stage').requestFullscreen();}
    catch(_){expanded=true;$('stage').classList.add('camera-expanded');$('exit-fullscreen').hidden=false;message('확대 화면입니다. 닫기 버튼이나 Esc, F 키로 돌아갈 수 있습니다.');draw();}
    canvas.focus();
  }
  $('fullscreen').onclick=fullscreen;$('exit-fullscreen').onclick=fullscreen;
  document.addEventListener('fullscreenchange',()=>{$('exit-fullscreen').hidden=!document.fullscreenElement;draw();});window.addEventListener('resize',layout);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded){fullscreen();}if((e.key.toLowerCase()==='f')&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();fullscreen();}});
  canvas.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();togglePause();}if(e.key==='ArrowRight'){e.preventDefault();step();}});
  canvas.addEventListener('dblclick',()=>{if(expanded)fullscreen();});
  window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'image origin top-left, x right, y down; positive angle clockwise; phase 0 points orange blade right',mission:mission?.id||'free',settings:{...settings},editable:mission?.editable||FIELDS,comparison:$('comparison').value,scorePercent:score===null?null:Number(score.toFixed(3)),successThreshold:96,completed:[...completed],running,scanProgress:Number(progress.toFixed(3)),instantTimeMs:Number((currentInstantTime*1000).toFixed(2)),firstRowStartMs:E.rowStart(0,SIZE,settings)*1000,lastRowStartMs:E.rowStart(SIZE-1,SIZE,settings)*1000,exposureSamples:snapshot?.samples,photographTimeOrigin:0});
  window.advanceTime=ms=>{manual=true;if(running)update(Math.max(0,Number(ms)||0));draw();};
  function frame(now){if(!manual&&running&&last!==null){update(Math.min(100,now-last));draw();}last=now;requestAnimationFrame(frame);}
  chooseMission('bend');layout();requestAnimationFrame(frame);
})();
