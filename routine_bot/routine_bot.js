(() => {
  'use strict';
  const E = window.RoutineEngine, levels = window.RoutineLevels, $ = id => document.getElementById(id);
  const store = window.RoutineBotStorage.create(), loaded = store.load();
  let saved = loaded.data;
  const blank = () => ({main: [], F1: [], F2: []}), clone = value => JSON.parse(JSON.stringify(value));
  const labels = {forward: '앞으로', left: '왼쪽 회전', right: '오른쪽 회전', repeat: '반복', blocked: '앞이 벽?', mark: '별 위인가?', F1: 'F1 부르기', F2: 'F2 부르기'};
  const symbols = {forward: '↑', left: '↶', right: '↷', repeat: '↻', blocked: '▥?', mark: '★?', F1: 'F1', F2: 'F2'};
  const chapters = ['','01 · 첫 번째 발걸음','02 · 되풀이의 정원','03 · 생각하는 갈림길','04 · 주머니 속 작은 코드','BONUS · 조금 더 먼 집'];
  const dirs = ['북쪽 ↑','동쪽 →','남쪽 ↓','서쪽 ←'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let level, program, scope = {root: 'main', trail: []}, selected = null, history = [], runner = null, snapshot = null;
  let running = false, clock = 0, mapIndex = 0, verifiedMaps = 0, totalSteps = 0, transitioning = false, hintIndex = 0;
  let sequence = 0, generation = 0, message = '', celebration = 0, anim = null, audio = null, lastTime = performance.now();
  const initialSaveNotice = loaded.status === 'unavailable' ? '저장 불가 · 이 탭에서만 유지' : loaded.status === 'corrupt' ? '저장 손상 · 새 여정 시작' : loaded.status === 'recovered' ? '이전 저장 복구됨' : loaded.status === 'repaired' ? '일부 코드 손상 · 정상 기록 복구' : '';
  let saveProblem = initialSaveNotice;
  const ctx = $('canvas').getContext('2d');
  function unlocked() { let n = 1; while (n < levels.length && saved.completed[n]) n++; return n; }
  function uid() { return 'b' + Date.now().toString(36) + '-' + (++sequence); }
  function persist() {
    saved.currentLevel = level.id; saved.programs[level.id] = clone(program);
    const result = store.save(saved);
    if (!result.ok) saveProblem = '저장 불가 · 이 탭에서만 유지';
    else saveProblem = '';
    $('save-status').textContent = saveProblem || '✓ 기기에 자동 저장';
  }
  function tell(text) { message = text; $('message').textContent = text; }
  function nodeKey(node) { return node.type === 'if' ? node.condition : node.type === 'call' ? node.target : node.type; }
  function listAt(where = scope) {
    let list = program[where.root];
    for (const part of where.trail) { const parent = list.find(n => n.id === part.id); if (!parent || !Array.isArray(parent[part.branch])) return null; list = parent[part.branch]; }
    return list;
  }
  function parentAt(where = scope) {
    if (!where.trail.length) return null;
    const upper = {root: where.root, trail: where.trail.slice(0,-1)}, last = where.trail.at(-1);
    return listAt(upper)?.find(n => n.id === last.id);
  }
  function locate(id) {
    function visit(list, root, trail) {
      for (const n of list) { if (n.id === id) return {root, trail};
        for (const branch of ['body','then','else']) if (n[branch]) { const found = visit(n[branch],root,trail.concat({id:n.id,branch})); if (found) return found; }
      }
    }
    for (const root of ['main','F1','F2']) { const found = visit(program[root],root,[]); if(found) return found; }
    return null;
  }
  function scopeTitle() {
    const parts = [scope.root === 'main' ? '시작' : scope.root];
    let list = program[scope.root];
    for (const p of scope.trail) { const n = list.find(n => n.id === p.id); if (!n) break;
      parts.push(p.branch === 'body' ? n.count + '회 반복 안쪽' : (n.condition === 'blocked' ? '벽?' : '별?') + (p.branch === 'then' ? ' 예' : ' 아니요')); list = n[p.branch];
    }
    return parts.join(' › ');
  }
  function stop(reset = false) {
    generation++; running = false; clock = 0;
    if (reset) { if (runner) runner.cancel(); runner = null; snapshot = null; transitioning = false; verifiedMaps = 0; totalSteps = 0; anim = null; celebration = 0; $('success-panel').hidden = true; }
    renderPlayback();
  }
  function edit(change, after) {
    const before = clone(program), previousScope = clone(scope), previousSelected = selected;
    change();
    const validation = E.validate(program, level);
    if (!validation.ok) { program = before; scope = previousScope; selected = previousSelected; tell(validation.errors[0]); return false; }
    history.push({program:before,scope:previousScope,selected:previousSelected}); if(history.length > 40) history.shift();
    stop(true); mapIndex = 0; if(after) after();
    persist(); renderEditor(); renderMapDescription(); draw(); return true;
  }
  function add(kind) {
    const id = uid(); let n = {id,type:kind};
    if (kind === 'repeat') n = {id,type:'repeat',count:3,body:[]};
    if (kind === 'blocked' || kind === 'mark') n = {id,type:'if',condition:kind,then:[],else:[]};
    if (kind === 'F1' || kind === 'F2') n = {id,type:'call',target:kind};
    const ok = edit(() => { const list = listAt(); const i = list.findIndex(n => n.id === selected); list.splice(i < 0 ? list.length : i + 1,0,n); selected = id;
      if (n.type === 'repeat' || n.type === 'if') { scope.trail.push({id,branch:n.type === 'repeat' ? 'body' : 'then'}); selected = null; }
    });
    if(ok) tell(n.type === 'repeat' ? '반복 안쪽이에요. 되풀이할 블록을 넣어 주세요.' : n.type === 'if' ? '조건이 맞을 때의 코드예요. 위로 돌아가면 아니요 쪽도 고칠 수 있어요.' : labels[kind] + ' 블록을 넣었어요.');
  }
  function renderEditor() {
    if(!listAt()) {scope={root:'main',trail:[]};selected=null;}
    const checked=E.validate(program,level);
    $('command-count').textContent=`저장 ${checked.count} / ${level.maxCommands}개`;
    $('command-count').classList.toggle('over',!checked.ok);
    const paletteKeys=['forward','left','right','repeat','blocked','mark','F1','F2'].filter(k=>level.unlocks.includes(k));
    $('palette').replaceChildren(...paletteKeys.map(kind=>{const b=document.createElement('button');b.dataset.add=kind;b.setAttribute('aria-label',labels[kind]+' 넣기');b.innerHTML=`<span class="symbol" aria-hidden="true">${symbols[kind]}</span><span>${labels[kind]}</span>`;b.onclick=()=>add(kind);return b;}));
    $('scope-tabs').replaceChildren(...['main','F1','F2'].filter(root=>root==='main'||level.unlocks.includes(root)).map(root=>{const b=document.createElement('button');b.dataset.scope=root;b.textContent=root==='main'?'시작':root+' 보관함';b.setAttribute('aria-pressed',String(scope.root===root));b.onclick=()=>{scope={root,trail:[]};selected=null;renderEditor();};return b;}));
    $('scope-name').textContent=scopeTitle();$('scope-back').hidden=!scope.trail.length;
    const parent=parentAt();$('scope-repeat-wrap').hidden=parent?.type!=='repeat';
    if(parent?.type==='repeat')$('scope-repeat').value=parent.count;
    $('program').replaceChildren();
    const list=listAt();
    if(!list.length){const empty=document.createElement('div');empty.className='empty-program';empty.textContent=scope.root==='main'&&!scope.trail.length?'↑ 위의 블록을 눌러 첫 발걸음을 넣어 주세요.':scope.trail.length?'이 안에서 할 일을 위의 블록으로 넣어 주세요.':'자주 쓰는 움직임을 담아 주세요. 시작에서 '+scope.root+'을 부르면 실행돼요.';$('program').append(empty);}
    list.forEach((n,index)=>{
      const key=nodeKey(n),card=document.createElement('div');card.className='block '+n.type;card.dataset.block=n.id;
      card.classList.toggle('selected',selected===n.id);card.classList.toggle('executing',snapshot?.currentId===n.id&&snapshot?.status!=='failure');card.classList.toggle('crashed',snapshot?.currentId===n.id&&snapshot?.status==='failure');
      const b=document.createElement('button');b.className='block-main';b.dataset.node=n.id;b.setAttribute('aria-label',`${index+1}번 ${labels[key]} 선택`);b.setAttribute('aria-pressed',String(selected===n.id));
      b.innerHTML=`<span class="block-number">${String(index+1).padStart(2,'0')}</span><span class="symbol" aria-hidden="true">${symbols[key]}</span><span>${labels[key]}${n.type==='repeat'?' × '+n.count:''}</span>`;
      b.onclick=()=>{selected=n.id;renderEditor();};card.append(b);
      const enter=(branch,label)=>{const e=document.createElement('button');e.className='enter';e.dataset.enter=n.id+':'+branch;e.textContent=label;e.onclick=()=>{scope.trail.push({id:n.id,branch});selected=null;renderEditor();};card.append(e);};
      if(n.type==='repeat')enter('body','안쪽 '+n.body.length+'개 ↳');
      if(n.type==='if'){enter('then','예 '+n.then.length+'개');enter('else','아니요 '+n.else.length+'개');}
      if(n.type==='call'){const e=document.createElement('button');e.className='enter';e.textContent=n.target+' 편집 ↗';e.dataset.function=n.target;e.onclick=()=>{scope={root:n.target,trail:[]};selected=null;renderEditor();};card.append(e);}
      if(n.type==='repeat'||n.type==='if'){const summary=document.createElement('div');summary.className='block-summary';const brief=ls=>ls.length?ls.map(c=>symbols[nodeKey(c)]).join(' · '):'비어 있음';summary.textContent=n.type==='repeat'?brief(n.body):'예: '+brief(n.then)+' / 아니요: '+brief(n.else);card.append(summary);}
      $('program').append(card);
    });
    const i=list.findIndex(n=>n.id===selected);$('move-up').disabled=i<=0;$('move-down').disabled=i<0||i===list.length-1;$('delete').disabled=i<0;
    $('selected-name').textContent=i<0?'블록을 선택하면 옮길 수 있어요':`${i+1}번 ${labels[nodeKey(list[i])]} 다음에 넣어요`;
    $('insert-end').textContent=selected?'＋ 선택 해제 · 맨 뒤에 넣기':'＋ 이 범위 맨 뒤에 넣기';
    $('undo').disabled=!history.length;$('clear').disabled=!checked.count;
    $('save-status').textContent=saveProblem||'✓ 기기에 자동 저장';
    $('editor-tip').textContent=level.id===1?'↑ 앞으로를 세 번 누른 다음, ▶ 실행해 보세요.':level.id===4?'↻ 반복을 넣고, 안쪽에 되풀이할 일을 담아 보세요.':level.id===7?'조건의 예 / 아니요 안쪽에 각각 할 일을 넣어요.':level.id===10?'F1 보관함에 코드를 담고 시작에서 불러 보세요.':'블록 선택 → 그 뒤에 추가 · 안쪽 버튼 → 범위 편집';
    const stack=snapshot?.callStack.map(s=>s.target)||[];
    $('execution-path').textContent=snapshot?.event?'실행: 시작'+(stack.length?' → '+stack.join(' → '):'')+' · '+snapshot.message:'편집: '+scopeTitle();
    $('execution-path').classList.toggle('active',!!snapshot?.event);
  }
  function renderLevels() {
    const max=unlocked();$('progress-count').textContent=Object.keys(saved.completed).length+' / 15';
    $('level-select').replaceChildren(...levels.map(l=>{const o=document.createElement('option');o.value=l.id;o.textContent=(saved.completed[l.id]?'✓ ':'')+l.id+'. '+l.title;o.disabled=l.id>max;return o;}));$('level-select').value=level.id;
    $('level-buttons').replaceChildren(...levels.map(l=>{const b=document.createElement('button');b.dataset.level=l.id;b.textContent=(saved.completed[l.id]?'✓ ':l.id>max?'🔒 ':'')+l.id+'. '+l.title;b.disabled=l.id>max;b.setAttribute('aria-current',String(l.id===level.id));b.onclick=()=>{loadLevel(l.id);$('level-panel').hidden=true;$('levels-toggle').setAttribute('aria-expanded','false');};return b;}));
  }
  function renderMapDescription() {
    const map=level.maps[mapIndex],r=snapshot?.robot||map.start;
    const cells=[];map.rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(c!=='#')cells.push(`${x},${y}${c==='H'?' 집':c==='*'?' 별':''}`);}));
    $('map-description').textContent=`왼쪽 위가 0,0. x는 오른쪽, y는 아래. 로봇 ${r.x},${r.y}, ${dirs[r.dir]}. 걸을 수 있는 칸: ${cells.join(' / ')}. 그 외는 벽.`;
    $('canvas').setAttribute('aria-label',`${level.title}. 지도 ${mapIndex+1}/${level.maps.length}. 로봇 ${r.x},${r.y}, ${dirs[r.dir]}.`);
    $('tile-state').hidden=map.rows[r.y][r.x]!=='*';
    $('map-select').value=mapIndex;
  }
  function loadLevel(id) {
    stop(true);level=levels.find(l=>l.id===Number(id))||levels[0];mapIndex=0;
    program=clone(saved.programs[level.id]||blank());
    if(!E.validate(program,level).ok){program=blank();saveProblem='이 레벨의 잘못된 코드를 초기화했어요';}
    scope={root:'main',trail:[]};selected=null;history=[];hintIndex=0;
    $('chapter-name').textContent=chapters[level.chapter];$('level-title').textContent=String(level.id).padStart(2,'0')+' · '+level.title;$('brief').textContent=level.brief;
    $('map-choice').hidden=level.maps.length<2;
    $('map-select').replaceChildren(...level.maps.map((m,i)=>{const o=document.createElement('option');o.value=i;o.textContent='지도 '+(i+1);return o;}));
    $('hint-text').textContent='막히면, 길을 다른 눈으로 바라봐요.';$('hint').textContent='✦ 작은 힌트';$('hint').disabled=false;
    tell(level.id===1?'↑ 앞으로를 눌러 블록을 넣어요. 집까지 이어 볼까요?':level.brief);
    persist();renderLevels();renderEditor();renderMapDescription();renderPlayback();draw();
  }
  function renderPlayback() {
    $('run').textContent=running?'▶ 실행 중':runner&&snapshot?.status==='running'?'▶ 이어서':'▶ 실행';$('run').disabled=running;$('pause').disabled=!running;
    $('status-dot').className='status-dot '+(running?'running':snapshot?.status==='failure'?'failure':'');
    $('executed').textContent='실행 '+(totalSteps+(snapshot?.steps||0))+'회';
  }
  function startRunner() {
    const checked=E.validate(program,level);if(!checked.ok){tell(checked.errors.join(' '));return false;}
    if(!program.main.length){tell('시작에 블록을 하나 넣어 주세요.');return false;}
    if(!runner||['success','failure','cancelled'].includes(snapshot?.status)&&!transitioning){stop(true);mapIndex=0;runner=E.createRunner(program,level,0);snapshot=runner.snapshot();}
    return true;
  }
  function sound(kind) {
    if(saved.settings.muted||!audio)return;
    try{const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.type='sine';oscillator.frequency.value=kind==='success'?784:kind==='failure'?180:440;gain.gain.setValueAtTime(.04,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);oscillator.start();oscillator.stop(audio.currentTime+.13);}catch(_){/* sound is optional */}
  }
  function unlockAudio(){if(!saved.settings.muted){try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch(_){saved.settings.muted=true;updateSound();}}}
  function oneStep() {
    if(transitioning){totalSteps+=snapshot.steps;mapIndex++;runner=E.createRunner(program,level,mapIndex);snapshot=runner.snapshot();anim=null;transitioning=false;scope={root:'main',trail:[]};selected=null;tell('같은 코드로 지도 '+(mapIndex+1)+'도 출발!');renderEditor();renderMapDescription();renderPlayback();return;}
    if(!runner)return;
    const from=snapshot?.robot||level.maps[mapIndex].start;snapshot=runner.step();
    anim={from:clone(from),to:clone(snapshot.robot),elapsed:0};
    const where=locate(snapshot.currentId);if(where){scope=where;selected=snapshot.status==='failure'?snapshot.currentId:null;}
    tell(snapshot.message);
    if(snapshot.status==='success') {
      verifiedMaps++;
      if(mapIndex+1<level.maps.length){transitioning=true;tell('지도 '+(mapIndex+1)+' 도착! 코드를 그대로 다음 지도에 보내요.');}
      else complete();
    } else if(snapshot.status==='failure'){running=false;sound('failure');}
    else sound('step');
    renderEditor();renderPlayback();renderMapDescription();
  }
  function complete() {
    running=false;celebration=reduced.matches?0:1100;sound('success');
    const count=E.validate(program,level).count,executed=totalSteps+snapshot.steps;
    const previous=saved.completed[level.id];if(!previous||previous===true||count<previous.stored)saved.completed[level.id]={stored:count,executed};
    persist();renderLevels();$('success-panel').hidden=false;
    $('success-title').textContent=level.id===15?'모든 길이 집으로 이어졌어요!':level.id===12?'본편 완주! 더 먼 길이 열렸어요.':'집에 도착했어요!';
    $('success-detail').textContent=`저장 ${count}개 · 실행 ${executed}회`+(level.maps.length>1?` · 지도 ${verifiedMaps}개 통과`:'')+(level.id>3?(count<=level.compactTarget?' · ✦ 간결한 코드 배지!':` · 선택 도전: ${level.compactTarget}개 안에 담아 보기`):' · 멋진 첫걸음이에요.');
    $('next-level').textContent=level.id===15?'여정 돌아보기 ↗':level.id===12?'응용 도전으로 →':'다음 길 →';
    tell(level.id===15?'15개 레벨 완주! 루틴봇에게 집으로 가는 방법을 알려 줬어요.':'도착! 로봇의 작은 일상이 한 걸음 더 이어졌어요.');
  }
  $('run').onclick=()=>{unlockAudio();if(startRunner()){running=true;clock=0;oneStep();renderPlayback();draw();}};
  $('pause').onclick=()=>{stop(false);tell('멈췄어요. 한 단계씩 살펴보거나 이어서 실행하세요.');draw();};
  $('step').onclick=()=>{unlockAudio();stop(false);if(startRunner()){oneStep();renderPlayback();draw();}};
  $('reset').onclick=()=>{stop(true);mapIndex=0;tell('처음 위치로 돌아왔어요. 코드는 그대로예요.');renderEditor();renderMapDescription();draw();};
  $('speed').value=saved.settings.speed;$('speed').onchange=()=>{saved.settings.speed=Number($('speed').value);clock=0;persist();};
  $('map-select').onchange=()=>{const i=Number($('map-select').value);stop(true);mapIndex=i;tell('지도 '+(i+1)+' 미리 보기. 실행하면 첫 지도부터 같은 코드를 시험해요.');renderMapDescription();renderEditor();draw();};
  $('scope-back').onclick=()=>{scope.trail.pop();selected=null;renderEditor();};
  $('scope-repeat').replaceChildren(...Array.from({length:11},(_,i)=>{const o=document.createElement('option');o.value=i+2;o.textContent=i+2+'회';return o;}));
  $('scope-repeat').onchange=()=>edit(()=>{parentAt().count=Number($('scope-repeat').value);});
  $('insert-end').onclick=()=>{selected=null;renderEditor();tell('지금 범위의 맨 뒤에 넣어요. 위에서 블록을 골라 주세요.');};
  $('move-up').onclick=()=>edit(()=>{const list=listAt(),i=list.findIndex(n=>n.id===selected);if(i>0)[list[i-1],list[i]]=[list[i],list[i-1]];});
  $('move-down').onclick=()=>edit(()=>{const list=listAt(),i=list.findIndex(n=>n.id===selected);if(i>=0&&i<list.length-1)[list[i+1],list[i]]=[list[i],list[i+1]];});
  $('delete').onclick=()=>{if(selected)edit(()=>{const list=listAt(),i=list.findIndex(n=>n.id===selected);if(i>=0)list.splice(i,1);selected=null;});};
  $('clear').onclick=()=>{if(edit(()=>{program=blank();scope={root:'main',trail:[]};selected=null;}))tell('코드를 비웠어요. 실행 취소로 되돌릴 수 있어요.');};
  $('undo').onclick=()=>{if(!history.length)return;const old=history.pop();stop(true);program=old.program;scope=old.scope;selected=old.selected;mapIndex=0;persist();renderEditor();renderMapDescription();draw();tell('방금 편집을 되돌렸어요.');};
  $('hint').onclick=()=>{const hints=level.hints;$('hint-text').textContent=hints[Math.min(hintIndex,hints.length-1)];hintIndex++;$('hint').textContent=hintIndex>=hints.length?'✦ 힌트 모두 봤어요':'✦ 한 번 더 보기';$('hint').disabled=hintIndex>=hints.length;};
  $('level-select').onchange=()=>loadLevel($('level-select').value);
  $('next-level').onclick=()=>{if(level.id===levels.length){$('level-panel').hidden=false;$('levels-toggle').setAttribute('aria-expanded','true');$('level-panel').scrollIntoView({behavior:'instant'});}else loadLevel(level.id+1);};
  $('levels-toggle').onclick=()=>{$('level-panel').hidden=!$('level-panel').hidden;$('levels-toggle').setAttribute('aria-expanded',String(!$('level-panel').hidden));};
  $('levels-close').onclick=()=>{$('level-panel').hidden=true;$('levels-toggle').setAttribute('aria-expanded','false');};
  function updateSound(){ $('sound').textContent=saved.settings.muted?'♪ 소리 꺼짐':'♪ 소리 켜짐';$('sound').setAttribute('aria-pressed',String(!saved.settings.muted));$('sound').setAttribute('aria-label',saved.settings.muted?'소리 켜기':'소리 끄기'); }
  $('sound').onclick=()=>{saved.settings.muted=!saved.settings.muted;unlockAudio();updateSound();persist();sound('step');};
  document.addEventListener('keydown',event=>{if(event.target.closest('input,select,textarea,[contenteditable]'))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$('undo').click();return;}
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.code==='Space'&&!event.target.closest('button,a,summary')){event.preventDefault();(running?$('pause'):$('run')).click();}
    if(event.key.toLowerCase()==='r')$('reset').click();
    if(event.key.toLowerCase()==='f'){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else $('game').requestFullscreen?.().catch(()=>{});}
    if(event.key==='Delete'&&!event.target.closest('button'))$('delete').click();
  });
  // One synchronous clock owns all execution; reset/edit/level transitions cancel it.
  // No delayed promise or timeout can write an old runner back into the new level.
  function update(ms){
    if(anim)anim.elapsed+=ms;if(celebration>0)celebration=Math.max(0,celebration-ms);
    if(!running)return;clock+=ms;let count=0;const ticket=generation;
    while(running&&clock>=560/saved.settings.speed&&count++<1000&&ticket===generation){clock-=560/saved.settings.speed;oneStep();}
  }
  function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
  function line(x1,y1,x2,y2,color,width=2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();}
  function star(x,y,r,color){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,d=i%2?r*.45:r;const px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle=color;ctx.fill();}
  function visualRobot(){
    const robot=snapshot?.robot||level.maps[mapIndex].start;
    if(!anim||reduced.matches)return {...robot};
    const t=Math.min(1,anim.elapsed/(190/saved.settings.speed)),smooth=t*t*(3-2*t);let d=anim.to.dir-anim.from.dir;if(d>2)d-=4;if(d<-2)d+=4;
    return {x:anim.from.x+(anim.to.x-anim.from.x)*smooth,y:anim.from.y+(anim.to.y-anim.from.y)*smooth,dir:anim.from.dir+d*smooth};
  }
  function draw(){
    if(!level)return;const W=820,H=570;ctx.clearRect(0,0,W,H);ctx.fillStyle='#e8efdf';ctx.fillRect(0,0,W,H);
    // Quiet pencil grid and a hand-built garden island. No external art or fonts.
    ctx.fillStyle='#d7e0ca';for(let y=25;y<H;y+=30)for(let x=20;x<W;x+=30){ctx.beginPath();ctx.arc(x,y,.9,0,Math.PI*2);ctx.fill();}
    const map=level.maps[mapIndex],rows=map.rows.length,cols=map.rows[0].length;
    const tile=Math.min(83,650/cols,430/rows),ox=(W-cols*tile)/2,oy=(H-rows*tile)/2+9;
    rounded(ox-14,oy+12,cols*tile+28,rows*tile+10,26,'#b9c8a7');rounded(ox-14,oy-12,cols*tile+28,rows*tile+18,26,'#d3dfc4');
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const c=map.rows[y][x],px=ox+x*tile,py=oy+y*tile;
      if(c==='#'){
        rounded(px+3,py+5,tile-6,tile-7,Math.min(13,tile*.17),'#bdcda9');rounded(px+3,py+1,tile-6,tile-9,Math.min(13,tile*.17),'#cbd8b9');
        if((x*3+y*7)%5===0){line(px+tile*.42,py+tile*.61,px+tile*.43,py+tile*.4,'#a1b58b',2);line(px+tile*.43,py+tile*.55,px+tile*.35,py+tile*.46,'#a1b58b',2);line(px+tile*.43,py+tile*.5,px+tile*.51,py+tile*.39,'#a1b58b',2);}
      }else{
        rounded(px+2,py+6,tile-4,tile-5,10,'#bdc5a9');rounded(px+2,py+1,tile-4,tile-6,10,'#f7f1d8','#e5dfc2');
        if(c==='*'){star(px+tile/2,py+tile/2,tile*.24,'#c68b36');star(px+tile/2,py+tile/2,tile*.13,'#fff0ae');}
        if(c==='H'){
          rounded(px+tile*.17,py+tile*.38,tile*.66,tile*.48,6,'#f7bd82','#d08d52');
          ctx.beginPath();ctx.moveTo(px+tile*.1,py+tile*.43);ctx.lineTo(px+tile*.5,py+tile*.06);ctx.lineTo(px+tile*.9,py+tile*.43);ctx.closePath();ctx.fillStyle='#bf7656';ctx.fill();
          rounded(px+tile*.4,py+tile*.55,tile*.21,tile*.31,4,'#6e8a6c');rounded(px+tile*.65,py+tile*.53,tile*.12,tile*.13,2,'#fff2b3');
          ctx.fillStyle='#5d714e';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText('집',px+tile*.5,py+tile+15);
        }
      }
    }
    const start=map.start;ctx.fillStyle='#b1bb9d';ctx.beginPath();ctx.arc(ox+(start.x+.5)*tile,oy+(start.y+.55)*tile,tile*.21,0,Math.PI*2);ctx.fill();
    if(snapshot?.collision){const c=snapshot.collision,x=ox+c.x*tile,y=oy+c.y*tile;rounded(x+3,y+2,tile-6,tile-6,10,'#e9bd9e','#bd5b37');line(x+tile*.34,y+tile*.34,x+tile*.66,y+tile*.66,'#aa452b',4);line(x+tile*.66,y+tile*.34,x+tile*.34,y+tile*.66,'#aa452b',4);}
    const visual=visualRobot(),rx=visual.x,ry=visual.y,angle=visual.dir*Math.PI/2;
    const cx=ox+(rx+.5)*tile,cy=oy+(ry+.5)*tile,bounce=celebration>0?Math.abs(Math.sin(celebration/110))*5:0;
    const actual=snapshot?.robot||map.start;
    if(map.rows[actual.y][actual.x]==='*'){
      ctx.strokeStyle='#bd8126';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(cx,cy+tile*.13,tile*.42,tile*.32,0,0,Math.PI*2);ctx.stroke();
      star(cx+tile*.39,cy+tile*.3,tile*.12,'#b07824');
    }
    ctx.fillStyle='#546a4d30';ctx.beginPath();ctx.ellipse(cx,cy+tile*.28,tile*.3,tile*.13,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(cx,cy-bounce);const s=tile/80;ctx.scale(s,s);
    rounded(-23,11,15,17,5,'#456252');rounded(8,11,15,17,5,'#456252');rounded(-29,-22,58,45,16,'#6b9677','#41684f');rounded(-26,-25,52,40,13,'#fff9df','#5e8265');
    rounded(-18,-16,36,23,9,'#315e54');ctx.fillStyle='#e8f5d1';ctx.beginPath();ctx.arc(-8,-5,3.4,0,Math.PI*2);ctx.arc(8,-5,3.4,0,Math.PI*2);ctx.fill();
    line(0,-26,0,-34,'#527857',3);ctx.beginPath();ctx.arc(0,-37,5,0,Math.PI*2);ctx.fillStyle='#e6ab53';ctx.fill();
    rounded(-34,-8,7,19,3,'#6c9777');rounded(27,-8,7,19,3,'#6c9777');
    // Direction is a separate large arrow, leaving the face upright at every turn.
    ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,-56);ctx.lineTo(-9,-43);ctx.lineTo(9,-43);ctx.closePath();ctx.fillStyle='#bd8126';ctx.fill();ctx.restore();
    if(!snapshot){ctx.fillStyle='#506d4a';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillText('출발',cx,cy+tile*.65);}
    if(celebration>0){for(let i=0;i<18;i++){const a=i*2.4,t=(1100-celebration)/1100,d=30+t*110,x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d-t*20;ctx.globalAlpha=1-t;star(x,y,3+(i%3),i%2?'#c88c38':'#50876c');}ctx.globalAlpha=1;}
  }
  window.render_game_to_text=()=>JSON.stringify({game:'routinebot',coordinates:'origin top-left; x right; y down; dir 0 N,1 E,2 S,3 W',level:level.id,mapIndex,maps:level.maps.length,rows:level.maps[mapIndex].rows,robot:snapshot?.robot||level.maps[mapIndex].start,renderedRobot:visualRobot(),status:running?'running':snapshot?.status||'ready',paused:!running&&snapshot?.status==='running',stored:E.validate(program,level).count,executed:totalSteps+(snapshot?.steps||0),currentId:snapshot?.currentId||null,event:snapshot?.event||null,callStack:snapshot?.callStack||[],collision:snapshot?.collision||null,editing:scopeTitle(),program:clone(program),completed:Object.keys(saved.completed).map(Number),unlocked:unlocked(),verifiedMaps,message,saveStatus:saveProblem||'saved',reducedMotion:reduced.matches,generation});
  window.advanceTime=ms=>{update(Math.max(0,Math.min(Number(ms)||0,600000)));draw();};
  function frame(now){const dt=Math.min(100,Math.max(0,now-lastTime));lastTime=now;update(dt);draw();requestAnimationFrame(frame);}
  updateSound();loadLevel(Math.min(saved.currentLevel,unlocked()));if(initialSaveNotice)tell(initialSaveNotice+' · 플레이는 계속할 수 있어요.');requestAnimationFrame(frame);
})();
