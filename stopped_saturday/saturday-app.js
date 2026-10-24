/* Reading and animation never advance the story clock; only a confirmed choice does. */
(() => {
  'use strict';
  // Saved games restore the active passage, not the previous illustration scroll offset.
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  const $ = id => document.getElementById(id);
  const story = window.SaturdayStory;
  function storageAdapter() {
    try { return window.localStorage; }
    catch { return { getItem(){ throw new Error('저장 접근 차단'); }, setItem(){ throw new Error('저장 접근 차단'); } }; }
  }
  let archive = window.SaturdayStore.create({ storage:storageAdapter(),engine:story });
  let selectedRecordId = null;
  let exportKind = 'friend';
  let exportToken = 0;
  let validatedImport = null;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = story.freshState();
  let mode = 'cover';
  let journal = [];
  let reduced = preference.matches;
  let manualMotionPreference = false;
  let frame = 0;
  let lastFrame = 0;
  let manualTime = false;
  let runToken = 0;
  let animationElapsed = 0;
  const animationMinimum = 3000;
  const sceneFigure = document.querySelector('.scene-figure');
  const dayPanel = document.querySelector('.day-panel');
  const scene = window.SaturdayScene.create($('day-canvas'), { reducedMotion: reduced });
  const initialMotion = { kind:'rest', location:'room', caption:'발을 받치고 소파에 앉아 있다.' };
  const intensity = value => value === 0 ? '없음' : value < 3 ? '약함' : value < 7 ? '보통' : '심함';
  const limitFor = value => story.turnLimit(typeof value === 'string' ? value : value?.scenarioVersion || story.SCENARIO_VERSION);
  const durationText = minutes => `${Math.floor(minutes/60)?`${Math.floor(minutes/60)}시간 `:''}${minutes%60?`${minutes%60}분`:minutes===0?'0분':''}`.trim();
  function readableTime(value) {
    if(/^(오전|오후|다음 날)/.test(value || '')) return value;
    return String(value || '').replace(/(\d{1,2}):(\d{2})/,(_,h,m)=>story.formatTime(Number(h)*60+Number(m)));
  }
  function currentMinute() {
    if(Number.isFinite(state.minuteOfDay)) return state.minuteOfDay;
    const time=state.scene==='end'?'20:16':story.getNode(state)?.time || '10:12';
    const match=time.match(/(\d{1,2}):(\d{2})/);return match?Number(match[1])*60+Number(match[2]):612;
  }
  function historyTime(entry) {
    return Number.isFinite(entry.startMinute)&&Number.isFinite(entry.endMinute)
      ? `${story.formatTime(entry.startMinute)} → ${story.formatTime(entry.endMinute)} · ${durationText(entry.durationMinutes)}`
      : readableTime(entry.time);
  }
  function paragraphs(target, lines) {
    target.replaceChildren(...lines.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
  }
  function focusHeading(id) {
    $(id).focus({ preventScroll:true });
    // Every transition starts at the new passage, including restored reactions.
    const passage = ['game','reaction'].includes(mode) ? $('game') : mode === 'animation' ? $('animation-view') : mode === 'result' ? $('result') : mode === 'cover' ? $('cover') : $(id);
    passage.scrollIntoView({ block:'start', behavior:'instant' });
  }
  function show(next) {
    if(mode === 'animation' && next !== 'animation') {
      cancelAnimationFrame(frame); frame=0;
      scene.finish();
      dayPanel.insertBefore(sceneFigure,$('status-panel'));
    }
    if(mode !== next) $('body-notes').open = false;
    mode = next;
    document.body.dataset.mode = next === 'reaction' ? 'game' : next;
    $('cover').hidden = next !== 'cover';
    $('game').hidden = !['game', 'reaction'].includes(next);
    $('result').hidden = next !== 'result';
    $('library').hidden = next !== 'library';
    $('animation-view').hidden = next !== 'animation';
    $('status-panel').hidden = ['cover','library','animation'].includes(next);
    $('decision-view').hidden = next !== 'game';
    $('reaction-view').hidden = next !== 'reaction';
  }
  function updateMotionToggle() {
    $('motion-toggle').setAttribute('aria-pressed', String(reduced));
    $('motion-toggle').textContent = reduced ? '움직임 줄임 · 켜짐' : '움직임 줄이기';
  }
  function requestFrame() {
    if (manualTime || reduced || document.hidden || frame) return;
    lastFrame = 0;
    frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    const delta = lastFrame ? Math.min(80, now - lastFrame) : 0;
    scene.advance(delta);
    if(mode === 'animation') animationElapsed += delta;
    lastFrame = now;
    const motion = scene.snapshot();
    if(finishAnimationIfReady(motion)) return;
    if (!manualTime && !reduced && !document.hidden && (mode === 'animation' || motion.moving || motion.environmentMoving)) frame = requestAnimationFrame(tick);
  }
  function finishAnimation() {
    if(mode !== 'animation') return;
    show('reaction');
    focusHeading('reaction-title');
  }
  function finishAnimationIfReady(motion) {
    if(mode !== 'animation' || animationElapsed < animationMinimum || motion.moving || motion.environmentMoving) return false;
    finishAnimation(); return true;
  }
  function beginAnimation(title) {
    show('animation'); animationElapsed=0;
    $('animation-title').textContent=title || journal.at(-1)?.title || '선택한 행동';
    $('animation-stage').append(sceneFigure);
    focusHeading('animation-title');
    $('skip-animation').focus({preventScroll:true});
    requestFrame();
  }
  function setMotion(motion) {
    const selected = motion || initialMotion;
    scene.setScene({ energyBefore:state.energy, energyAfter:state.energy, ...selected, body:state.body, step:state.step,minuteOfDay:currentMinute(),scenarioId:state.scenarioId,context:state.context,appearance:state.initialConditions?.appearance });
    $('scene-caption').textContent = selected.caption;
    $('day-canvas').setAttribute('aria-label', [appearanceText(state.initialConditions?.appearance),selected.caption].filter(Boolean).join('. '));
    requestFrame();
  }
  function status() {
    for (const key of ['energy','mood']) {
      $(key).value = state[key];
      $(key).textContent = `${state[key]} / 10`;
      $(`${key}-value`).textContent = `${state[key]} / 10`;
    }
    const body = story.bodyDescription(state);
    window.SaturdayBodyStatus.render($('body-overview'), body);
    $('body-list').replaceChildren(...body.map(item => {
      const div = document.createElement('div'); div.className = 'body-item';
      const head = document.createElement('header');
      const label = document.createElement('strong'); label.textContent = item.label;
      const level = document.createElement('span'); level.textContent = `${intensity(item.value)} · ${item.value}/10`;
      const p = document.createElement('p'); p.textContent = item.text;
      head.append(label,level); div.append(head,p); return div;
    }));
    const prominent = body.slice().sort((a,b) => b.value - a.value).slice(0,2);
    $('body-summary').textContent = prominent.map(item => item.label).join(' · ');
    $('traces').replaceChildren(...(state.traces.length ? state.traces.slice(-3) : ['아직 선택한 행동이 없습니다']).map(text => {
      const chip = document.createElement('span'); chip.className = 'trace'; chip.textContent = text; return chip;
    }));
    const completed = state.decisions.length;
    const limit=limitFor(state);
    if($('progress-track').children.length!==limit) $('progress-track').replaceChildren(...Array.from({length:limit},()=>element('li')));
    $('progress-track').style.setProperty('--step-count',String(limit));
    $('day-elapsed').textContent=Number.isFinite(state.elapsedMinutes)?`오늘 보낸 시간 ${durationText(state.elapsedMinutes)}`:'이전 5단계 기록';
    Array.from($('progress-track').children).forEach((li,i) => {
      li.className = i < completed ? 'done' : i === completed ? 'current' : '';
      li.setAttribute('aria-label', `${i + 1}번째 선택 ${i < completed ? '완료' : '남음'}`);
      if(i === completed) li.setAttribute('aria-current','step'); else li.removeAttribute('aria-current');
    });
    $('announcement').textContent = `${completed}번 선택 완료. ${story.formatTime(currentMinute())}. 에너지 ${state.energy}, 기분 ${state.mood}. ${prominent.map(item=>`${item.label} 불편함 ${intensity(item.value)}`).join(', ')}.`;
  }
  function renderScene() {
    show('game');
    const node = story.getNode(state);
    $('time-label').textContent = readableTime(node.time);
    $('scene-clock').textContent = story.formatTime(currentMinute());
    $('chapter-label').textContent = `선택 ${state.decisions.length + 1} / ${limitFor(state)}`;
    $('scene-title').textContent = node.title;
    paragraphs($('story-text'), node.lines);
    if(node.encounter) {
      const captions={manual:'무거운 문 앞에서 목발을 짚고 서 있다.',automatic:'자동문이 열리는 동안 입구에서 기다린다.',revolving:'회전문 밖에서 돌아가는 문짝을 바라본다.',escalator:'에스컬레이터 옆의 고정된 바닥에 서 있다.',kiosk:'키오스크 화면과 결제 단말기 위치를 살핀다.'};
      setMotion({kind:'stand',location:'hall',caption:captions[node.encounter.doorType || node.encounter.kind],encounter:node.encounter});
    }
    $('choices').replaceChildren(...node.choices.map((choice,index) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'choice';
      b.setAttribute('aria-label', `${index+1}번: ${choice.title}. ${choice.note}${Number.isFinite(choice.durationMinutes)?`. 예상 ${durationText(choice.durationMinutes)}`:''}`);
      const number = document.createElement('span'); number.className = 'choice-number'; number.textContent = String(index+1); number.setAttribute('aria-hidden','true');
      const copy = document.createElement('span');
      const title = document.createElement('span'); title.className = 'choice-title'; title.textContent = choice.title;
      const note = document.createElement('span'); note.className = 'choice-note'; note.textContent = choice.note;
      copy.append(title,note);
      if(Number.isFinite(choice.durationMinutes)) copy.append(element('span',`약 ${durationText(choice.durationMinutes)}`,'choice-duration'));
      b.append(number,copy);
      b.addEventListener('click', () => choose(index)); return b;
    }));
    status(); focusHeading('scene-title');
  }
  function choose(index) {
    if (mode !== 'game') return;
    const node = story.getNode(state), choice = node.choices[index];
    if (!choice) return;
    archive.commit(index);
    syncCurrent();
    renderReaction(choice.title,true);
  }
  function renderReaction(title,animate=false) {
    show('reaction');
    $('chapter-label').textContent = `선택 ${state.decisions.length} / ${limitFor(state)}`;
    const lastAction=state.history.at(-1);
    $('time-label').textContent=historyTime(lastAction);
    $('scene-clock').textContent=story.formatTime(currentMinute());
    $('reaction-title').textContent = state.reaction.title;
    paragraphs($('reaction-text'),state.reaction.lines);
    $('reaction-choice').textContent = `내가 고른 행동 · ${title || journal.at(-1)?.title || ''}`;
    $('continue-button').replaceChildren(document.createTextNode(state.scene === 'end' ? '결과 보기 ' : '다음으로 '));
    const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden','true'); arrow.textContent = '→'; $('continue-button').append(arrow);
    status(); setMotion(state.motion);
    if(animate && !reduced) beginAnimation(title);
    else { if(reduced) scene.finish(); focusHeading('reaction-title'); }
  }
  function ending() {
    show('result');
    const end = story.determineEnding(state);
    $('ending-name').textContent = end.name;
    $('ending-quote').textContent = end.quote;
    $('ending-body').textContent = end.body;
    $('ending-takeaway').textContent = end.takeaway;
    $('scene-clock').textContent = story.formatTime(currentMinute());
    $('result-time').textContent = `${story.formatTime(currentMinute())} · ${Number.isFinite(state.elapsedMinutes)?`오늘 보낸 시간 ${durationText(state.elapsedMinutes)}`:'이전 기록의 마지막 시각'}`;
    $('journal-list').replaceChildren(...journal.map(journalEntry));
    $('feedback').textContent = '일지에서 선택을 바꾸고 결과를 비교해 볼 수 있습니다.';
    $('native-share').hidden = typeof navigator.share !== 'function';
    setMotion({ kind:'rest',location:'room',caption:'방에 편히 앉아 오늘 있었던 일을 돌아본다.' });
    scene.finish();
    status(); focusHeading('ending-name');
  }
  function start() {
    const current = archive.getSnapshot().current;
    if(current && !current.record.complete && current.record.choiceIds.length && !window.confirm('진행 중인 게임을 그만두고 처음부터 시작할까요? 완료된 일지는 그대로 남습니다.')) return;
    runToken++;
    archive.start({scenarioId:$('scenario-select').value,conditions:{...window.SaturdayEnvironment.sample(),helpStyle:$('help-style').value,phonePayment:$('phone-payment').checked}});
    syncCurrent();
    $('manual-copy').hidden = true; $('manual-copy').value = '';
    $('body-notes').open = false; document.querySelector('.journal').open = false;
    $('feedback').textContent = '';
    setMotion(state.motion || initialMotion); scene.finish(); renderScene();
  }
  function publicURL() {
    // A public URL is included only when this very document has loaded at its final public address.
    return location.protocol === 'https:' && location.hostname === 'prozac0401.github.io' && location.pathname === '/WebSim/stopped_saturday/stopped_saturday.html'
      ? location.origin + location.pathname : '';
  }
  function shareText() {
    const e = story.determineEnding(state);
    return [`《멈춘 토요일》 — ${e.name}`,e.quote,`오늘 한 일: ${state.traces.slice(-3).join(' · ')}`,e.takeaway,publicURL(),'#멈춘토요일'].filter(Boolean).join('\n\n');
  }
  async function copyResult() {
    const savedRun = runToken, text = shareText(); let copied = false;
    try { if(navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); copied = true; } } catch { /* Fall through to the selectable local copy. */ }
    if(savedRun !== runToken) return;
    if(!copied) {
      const field = $('manual-copy'); field.value = text; field.hidden = false; field.focus(); field.select();
      try { copied = document.execCommand('copy'); } catch { /* Manual selection remains available. */ }
      if(copied) { field.hidden = true; $('copy-result').focus(); }
    }
    $('feedback').textContent = copied ? '결말 문구가 복사되었습니다.' : '자동 복사를 사용할 수 없습니다. 아래 문구를 선택해 직접 복사해 주세요.';
  }
  function wrapped(ctx,text,x,y,width,lineHeight,maxLines) {
    const chars = Array.from(text); let line = '', lines = 0;
    for(let i=0;i<chars.length;i++) {
      if(ctx.measureText(line+chars[i]).width > width && line) {
        lines++;
        if(lines === maxLines) { ctx.fillText(line.slice(0,-1)+'…',x,y); return y+lineHeight; }
        ctx.fillText(line,x,y); y += lineHeight; line = chars[i];
      } else line += chars[i];
    }
    if(line) { ctx.fillText(line,x,y); y += lineHeight; }
    return y;
  }
  async function saveImage() {
    const button = $('save-image'); button.disabled = true;
    const savedRun = runToken, e = story.determineEnding(state), savedTraces = state.traces.slice(-3), savedChoiceCount=state.decisions.length, savedClock=story.formatTime(currentMinute());
    const savedScene = document.createElement('canvas'); savedScene.width=960; savedScene.height=500;
    savedScene.getContext('2d').drawImage($('day-canvas'),0,0,960,500);
    try {
      await document.fonts.ready;
      const card = document.createElement('canvas'); card.width=1080; card.height=1350;
      const ctx = card.getContext('2d');
      ctx.fillStyle='#f5f2ea'; ctx.fillRect(0,0,1080,1350);
      ctx.fillStyle='#647567'; ctx.font='600 22px sans-serif'; ctx.fillText('SATURDAY, INTERRUPTED  /  MY SATURDAY',76,79);
      ctx.fillStyle='#253f3b'; ctx.font='800 80px "Malgun Gothic", sans-serif'; ctx.fillText('멈춘 토요일.',72,185);
      ctx.drawImage(savedScene,76,231,928,483);
      ctx.fillStyle='#a6553c'; ctx.font='700 24px "Malgun Gothic", sans-serif'; ctx.fillText('나의 토요일은',76,777);
      ctx.fillStyle='#253f3b'; ctx.font='800 53px "Malgun Gothic", sans-serif';
      let y = wrapped(ctx,e.name,72,853,934,69,2)+20;
      ctx.font='400 33px "Malgun Gothic", sans-serif'; y = wrapped(ctx,e.quote,76,y,918,49,3)+22;
      ctx.fillStyle='#61705e'; ctx.font='400 25px "Malgun Gothic", sans-serif';
      wrapped(ctx,savedTraces.join('  ·  '),76,Math.max(y,1090),918,39,3);
      ctx.strokeStyle='#c9d2bf'; ctx.beginPath(); ctx.moveTo(76,1243); ctx.lineTo(1004,1243); ctx.stroke();
      ctx.fillStyle='#647567'; ctx.font='400 22px "Malgun Gothic", sans-serif'; ctx.fillText(`${savedClock} · ${savedChoiceCount}번의 선택과 그 결과.   #멈춘토요일`,76,1294);
      const blob = await new Promise(resolve => card.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('Image unavailable');
      const href = URL.createObjectURL(blob), link = document.createElement('a'); link.href=href; link.download='멈춘토요일_나의결말.png'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href),30000);
      if(savedRun === runToken) $('feedback').textContent='PNG 이미지 저장을 요청했습니다. 브라우저의 다운로드 목록을 확인해 주세요.';
    } catch { if(savedRun === runToken) $('feedback').textContent='이미지를 저장하지 못했습니다. 결말 문구 복사를 이용해 주세요.'; }
    finally { button.disabled=false; }
  }
  function element(tag,text,className) {
    const item=document.createElement(tag); if(text!==undefined) item.textContent=text; if(className) item.className=className; return item;
  }
  function action(text,handler,className='secondary') {
    const button=element('button',text,className); button.type='button'; button.addEventListener('click',handler); return button;
  }
  function allRecords() {
    const saved=archive.getSnapshot(); return [...saved.completed,...saved.replays,...saved.imported];
  }
  function scenarioName(id) { return story.SCENARIOS.find(item=>item.id===id)?.title || id; }
  function appearanceText(appearance) {
    if(!appearance) return '';
    const hair={crop:'짧은 머리','side-part':'가르마 머리',wavy:'웨이브 머리',bob:'단발머리',ponytail:'묶은 머리',bun:'올림머리'}[appearance.hairStyle];
    return `${appearance.gender==='female'?'여성':'남성'} · ${hair}`;
  }
  function conditionText(record) {
    const c=record.conditions;
    const door={manual:'무거운 미는 문',automatic:'자동문',revolving:'회전문'}[c.doorMode] || '출입문';
    const environment=[door,...(c.verticalRoute?[c.verticalRoute==='escalator'?'에스컬레이터':'계단']:[]),...(c.orderMode?[c.orderMode==='kiosk'?'키오스크 주문':'카운터 주문']:[])].join(' · ');
    return `${scenarioName(record.scenarioId)} · ${limitFor(record)}단계${record.scenarioVersion==='2'?' 이전 기록':''}${c.appearance?` · ${appearanceText(c.appearance)}`:''} · ${environment} · ${c.helpStyle==='ask'?'먼저 묻는 도움':'모두 해주겠다는 도움'} · 휴대전화 결제 ${c.phonePayment?'있음':'없음'}`;
  }
  function recordLabel(record) { return `토요일 ${record.serial} · ${record.summary?.endingName || '진행 중'}`; }
  function journalFor(record) {
    let cursor=story.forVersion(record.scenarioVersion).freshState({scenarioId:record.scenarioId,conditions:record.conditions});
    return record.choiceIds.map(id=>{
      const node=story.getNode(cursor), choice=node.choices.find(c=>c.id===id);
      cursor=story.choose(cursor,id);
      return {time:historyTime(cursor.history.at(-1)),title:choice.title,reaction:cursor.reaction.lines.slice(),sceneId:node.sceneId,choiceId:id};
    });
  }
  function journalEntry(entry,index) {
    const li=element('li',undefined,'journal-entry');
    const header=element('div',undefined,'journal-entry-heading');
    const number=element('span',String(index+1),'journal-entry-number'); number.setAttribute('aria-hidden','true');
    const heading=element('h4',undefined,'journal-entry-title');
    heading.append(element('span',`${index+1}번째 선택. `,'sr-only'),document.createTextNode(entry.title));
    const text=element('div'); text.append(element('p',entry.time,'journal-entry-time'),heading);
    header.append(number,text); li.append(header);
    const prose=element('div',undefined,'journal-entry-prose');
    for(const line of entry.reaction) {
      if(line.startsWith('몸의 반응 · ')) {
        const p=element('p',undefined,'journal-entry-body');
        p.append(element('span','몸의 반응','journal-body-label'),document.createTextNode(line.slice('몸의 반응 · '.length)));
        prose.append(p);
      } else prose.append(element('p',line));
    }
    li.append(prose); return li;
  }
  function refreshSaveStatus() {
    const saved=archive.getSnapshot(), current=saved.current;
    $('save-status').textContent=saved.persistence.warning || (current?'지금까지 선택한 내용을 이 브라우저에 저장했습니다.':'게임을 시작하면 선택할 때마다 이 브라우저에 저장합니다.');
    $('save-notice').dataset.warning=String(saved.persistence.mode!=='saved');
    $('journal-count').textContent=String(allRecords().length);
    $('resume-button').hidden=!current;
    $('resume-button').textContent=current ? `${current.record.complete?'마지막 결과 보기':'이어서 하기'} · ${current.record.choiceIds.length}/${limitFor(current.record)} 선택` : '이어서 하기';
    $('reset-current').hidden=!current;
    $('clear-journals').disabled=!allRecords().length;
  }
  function syncCurrent() {
    const current=archive.getSnapshot().current;
    if(current) { state=current.state; journal=journalFor(current.record); }
    refreshSaveStatus();
  }
  function resumeCurrent() {
    const current=archive.resume(); if(!current) { show('cover'); refreshSaveStatus(); return; }
    runToken++; syncCurrent();
    setMotion(state.motion || initialMotion); scene.advance(60000);
    if(current.phase==='result') ending();
    else if(current.phase==='reaction') { renderReaction(); scene.finish(); }
    else renderScene();
  }
  function showCover() { show('cover'); refreshSaveStatus(); focusHeading('opening-title'); }
  function openLibrary(id) {
    show('library'); refreshSaveStatus(); selectedRecordId=null;
    $('record-detail').hidden=true; $('library-feedback').textContent='';
    const saved=archive.getSnapshot(), records=allRecords();
    $('legacy-view').hidden=!saved.persistence.rawPreserved;
    $('legacy-text').value=saved.persistence.preservedRaw || '';
    $('record-list').replaceChildren(...records.map(record=>{
      const card=element('article',undefined,'record-card');
      const category=saved.imported.some(item=>item.id===record.id)?'가져온 기록':record.parentId?'선택을 바꿔 본 기록':'처음부터 플레이한 기록';
      card.append(element('p',category,'record-tag'),element('h3',recordLabel(record)),element('p',conditionText(record)),action('이 기록 보기',()=>showRecord(record.id)));
      return card;
    }));
    if(!records.length) $('record-list').append(element('p','하루를 끝까지 플레이하면 첫 일지가 남습니다.','record-empty'));
    if(id && records.some(record=>record.id===id)) showRecord(id); else focusHeading('library-heading');
  }
  function showRecord(id) {
    const record=archive.getRecord(id); if(!record) return;
    selectedRecordId=id; $('record-detail').hidden=false;
    $('record-heading').textContent=recordLabel(record);
    $('record-conditions').textContent=conditionText(record);
    const parent=record.parentId && allRecords().find(item=>item.id===record.parentId);
    $('record-origin').textContent=record.parentId ? `${parent?`원본 토요일 ${parent.serial}`:'현재 목록에 없는 원본'}의 ${record.branchIndex+1}번째 선택부터 다시 플레이했습니다. ${parent?'원본 기록은 별도로 남아 있습니다.':'원본이 삭제되어도 다시 플레이한 기록은 남아 있습니다.'}`:`처음부터 끝까지 ${record.choiceIds.length}번 선택한 기록입니다.`;
    const replayed=story.replay({scenarioVersion:record.scenarioVersion,scenarioId:record.scenarioId,conditions:record.conditions,choiceIds:record.choiceIds});
    $('record-quote').textContent=story.determineEnding(replayed).quote;
    const entries=journalFor(record);
    $('record-scenes').classList.add('journal-entries'); $('record-scenes').setAttribute('role','list');
    $('record-scenes').replaceChildren(...entries.map((entry,index)=>{
      const li=journalEntry(entry,index); li.append(action('이 선택부터 다시 해보기',()=>{
        if(!replaceCurrentAllowed()) return;
        archive.branch(id,index); resumeCurrent();
      })); return li;
    }));
    $('compare-select').replaceChildren(element('option','기록을 고르세요'));
    $('compare-select').firstChild.value='';
    for(const other of allRecords().filter(item=>item.id!==id)) { const option=element('option',`${recordLabel(other)} · ${scenarioName(other.scenarioId)}`); option.value=other.id; $('compare-select').append(option); }
    $('comparison').replaceChildren();
    if(parent && parent.complete) { $('compare-select').value=parent.id; renderComparison(parent.id); }
    focusHeading('record-heading');
  }
  function replaceCurrentAllowed() {
    const current=archive.getSnapshot().current;
    return !current || current.record.complete || !current.record.choiceIds.length || window.confirm('진행 중인 게임을 그만두고 선택한 장면부터 다시 해볼까요? 완료한 원본 일지는 그대로 남습니다.');
  }
  function renderComparison(otherId) {
    $('comparison').replaceChildren(); if(!otherId || !selectedRecordId) return;
    const comparison=archive.compare(selectedRecordId,otherId);
    const left=archive.getRecord(selectedRecordId),right=archive.getRecord(otherId);
    const conditionNames={doorMode:'출입문',verticalRoute:'층간 이동 설비',orderMode:'주문 방식',helpStyle:'도움 제안',phonePayment:'휴대전화 결제',appearance:'인물의 외형'};
    const differences=comparison.changedConditions.map(key=>conditionNames[key] || '시작 조건');
    if(left.scenarioVersion!==right.scenarioVersion) differences.push('이야기 버전');
    if(left.scenarioId!==right.scenarioId) differences.push('플레이한 이야기');
    const note=comparison.equivalent?(comparison.changedConditions.includes('appearance')?'플레이 조건은 같습니다. 인물의 성별과 머리 스타일은 결과에 영향을 주지 않습니다. 서로 고른 행동과 그 결과를 나란히 볼 수 있습니다.':'같은 이야기와 조건으로 시작했습니다. 서로 고른 행동과 그 결과를 나란히 볼 수 있습니다.'):`시작 조건이 달라 선택만으로 결과를 비교하기는 어렵습니다. 다른 조건: ${differences.join(', ')}.`;
    $('comparison').append(element('p',note,'comparison-note'));
    const grid=element('div',undefined,'compare-grid');
    for(const record of [left,right]) {
      const column=element('section',undefined,'compare-day');
      column.append(element('h4',recordLabel(record)),element('p',conditionText(record)));
      if(record.scenarioId!=='classic') {
        const context=record.summary.context;
        const place={home:'집',cafe:'가게',street:'길',entrance:'출입구','elevator-lobby':'엘리베이터 앞'}[context.location] || context.location;
        column.append(element('p',`마지막 장소: ${place} · 준비·대기·우회 ${context.plan.timeMinutes}분 · 말로 꺼낸 요청 ${context.social.requests.length}회`));
        column.append(element('p','아래에서 각자 고른 행동과 그 뒤에 일어난 일을 비교할 수 있습니다.'));
      }
      const list=element('ol',undefined,'journal-entries'); list.setAttribute('role','list');
      list.append(...journalFor(record).map(journalEntry));
      column.append(list); grid.append(column);
    }
    $('comparison').append(grid);
  }
  function openExport(text,kind) {
    exportToken++;
    exportKind=kind; $('export-heading').textContent=kind==='friend'?'친구에게 줄 기록 미리보기':'이 브라우저의 기록 백업';
    $('export-description').textContent=kind==='friend'?'시나리오·시작 조건·선택 ID만 담았습니다. 복사하거나 파일로 저장한 뒤 직접 전달하세요. 외부로 자동 전송하지 않습니다.':'현재 진행과 일지, 보존 중인 과거 저장 원문을 담습니다. 친구 비교용 파일과는 형식이 다릅니다. 손상되거나 이전 버전인 원문은 자동으로 덮어쓰지 않습니다.';
    $('export-text').value=text; $('export-feedback').textContent='미리보기입니다. 아직 복사하거나 저장하지 않았습니다.'; $('export-dialog').showModal();
  }
  async function copyExport() {
    const text=$('export-text').value, token=exportToken; let copied=false;
    try { if(navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); copied=true; } } catch { /* The preview remains selectable. */ }
    if(!$('export-dialog').open || token!==exportToken) return;
    if(!copied) { $('export-text').focus(); $('export-text').select(); try { copied=document.execCommand('copy'); } catch { /* Manual copy remains available. */ } }
    $('export-feedback').textContent=copied?'복사했습니다. 전달할 상대와 방법은 직접 선택해 주세요.':'자동 복사를 사용할 수 없습니다. 선택된 내용을 직접 복사하거나 파일로 저장하세요.';
  }
  function downloadExport() {
    const blob=new Blob([$('export-text').value],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=element('a'); link.href=url; link.download=exportKind==='friend'?'멈춘토요일_선택기록.json':'멈춘토요일_로컬백업.json'; document.body.append(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000); $('export-feedback').textContent='파일 저장을 요청했습니다. 브라우저 다운로드 목록을 확인해 주세요.';
  }
  function clearImportPreview() { validatedImport=null; $('import-confirm').disabled=true; $('import-preview-content').replaceChildren(); }
  function previewImport() {
    clearImportPreview();
    try {
      archive.previewImport($('import-text').value);
      validatedImport=$('import-text').value;
      const payload=JSON.parse(validatedImport), replayed=story.replay({scenarioVersion:payload.scenarioVersion,scenarioId:payload.scenarioId,conditions:payload.conditions,choiceIds:payload.choiceIds});
      $('import-preview-content').append(element('p',`${scenarioName(payload.scenarioId)} · ${story.determineEnding(replayed).name}`),element('p',conditionText(payload)),element('p',`선택 ${payload.choiceIds.length}개. 이름·연락처·실제 시각을 포함하지 않는 게임 기록입니다.`));
      $('import-feedback').textContent='형식과 선택 경로를 확인했습니다. 아직 일지에 추가하지 않았습니다.'; $('import-confirm').disabled=false;
    } catch(error) { $('import-feedback').textContent=`가져올 수 없습니다. ${error.message}`; }
  }
  function initialiseArchiveUI() {
    $('scenario-select').replaceChildren(...story.SCENARIOS.map(item=>{const option=element('option',item.title); option.value=item.id; return option;}));
    $('scenario-select').value='home';
    const describe=()=>{ $('scenario-description').textContent=story.SCENARIOS.find(item=>item.id===$('scenario-select').value)?.description || ''; };
    describe(); $('scenario-select').addEventListener('change',describe);
    $('home-button').addEventListener('click',showCover);
    $('library-button').addEventListener('click',()=>openLibrary());
    $('resume-button').addEventListener('click',resumeCurrent);
    $('open-completed').addEventListener('click',()=>openLibrary(archive.getSnapshot().current?.record.id));
    $('reset-current').addEventListener('click',()=>{
      if(!window.confirm('현재 하루의 이어 하기만 지울까요? 완료 일지와 가져온 기록은 그대로 남습니다.')) return;
      archive.resetCurrent(); runToken++; state=story.freshState(); journal=[]; setMotion(initialMotion); showCover();
    });
    $('clear-journals').addEventListener('click',()=>{
      if(!window.confirm('완료 일지·분기 일지·가져온 기록을 모두 삭제할까요? 끝난 하루의 이어 하기도 지워집니다. 아직 끝내지 않은 현재 진행은 남습니다.')) return;
      archive.deleteAllJournals(); openLibrary(); $('library-feedback').textContent='보관한 기록을 모두 삭제했습니다. 아직 끝내지 않은 현재 진행은 남아 있습니다.';
    });
    $('delete-record').addEventListener('click',()=>{
      if(!selectedRecordId || !window.confirm('선택한 기록 하나를 삭제할까요? 이 기록이 마지막 완료한 하루이면 해당 이어 하기도 지워집니다. 다른 일지와 아직 끝내지 않은 현재 진행은 남습니다.')) return;
      if(archive.getSnapshot().imported.some(item=>item.id===selectedRecordId)) archive.deleteImported(selectedRecordId); else archive.deleteRecord(selectedRecordId);
      openLibrary(); $('library-feedback').textContent='선택한 기록 하나를 삭제했습니다.';
    });
    $('compare-select').addEventListener('change',()=>renderComparison($('compare-select').value));
    $('export-open').addEventListener('click',()=>{if(selectedRecordId) openExport(archive.exportRecord(selectedRecordId),'friend');});
    $('backup-button').addEventListener('click',()=>openExport(archive.exportBackup(),'backup'));
    $('export-copy').addEventListener('click',copyExport); $('export-download').addEventListener('click',downloadExport); $('export-close').addEventListener('click',()=>$('export-dialog').close());
    $('export-dialog').addEventListener('close',()=>{exportToken++;});
    $('import-open').addEventListener('click',()=>{clearImportPreview(); $('import-text').value=''; $('import-file').value=''; $('import-feedback').textContent=''; $('import-dialog').showModal();});
    $('import-close').addEventListener('click',()=>$('import-dialog').close()); $('import-preview').addEventListener('click',previewImport);
    $('import-text').addEventListener('input',()=>{clearImportPreview(); $('import-feedback').textContent='내용이 바뀌었습니다. 다시 확인해 주세요.';});
    $('import-file').addEventListener('change',async()=>{
      clearImportPreview(); const file=$('import-file').files[0]; if(!file) return;
      if(file.size>window.SaturdayStore.MAX_IMPORT_BYTES) { $('import-feedback').textContent='파일이 너무 큽니다. 16 KiB 이하의 선택 기록만 열 수 있습니다.'; return; }
      try { $('import-text').value=await file.text(); previewImport(); } catch { $('import-feedback').textContent='파일을 읽지 못했습니다. 텍스트를 붙여넣을 수 있습니다.'; }
    });
    $('import-confirm').addEventListener('click',()=>{
      if(!validatedImport || validatedImport!==$('import-text').value) return;
      try { const before=new Set(allRecords().map(r=>r.id)); archive.importRecord(validatedImport); const added=allRecords().find(r=>!before.has(r.id)); $('import-dialog').close(); openLibrary(added?.id); $('library-feedback').textContent='가져온 기록을 추가했습니다. 외부 전송은 하지 않았습니다.'; }
      catch(error) { clearImportPreview(); $('import-feedback').textContent=error.message; }
    });
    window.addEventListener('pageshow',event=>{ if(!event.persisted) return; if(archive.getSnapshot().persistence.mode==='saved') archive=window.SaturdayStore.create({storage:storageAdapter(),engine:story}); resumeCurrent(); });
    refreshSaveStatus();
  }
  $('start-button').addEventListener('click',start);
  $('restart').addEventListener('click',start);
  $('continue-button').addEventListener('click',() => { if(mode !== 'reaction') return; archive.continue(); syncCurrent(); if(state.scene === 'end') ending(); else renderScene(); });
  $('skip-animation').addEventListener('click',finishAnimation);
  $('copy-result').addEventListener('click',copyResult);
  $('save-image').addEventListener('click',saveImage);
  $('native-share').addEventListener('click',async () => {
    try { await navigator.share({ title:'멈춘 토요일',text:shareText() }); $('feedback').textContent='공유 메뉴로 결말을 전달했습니다.'; }
    catch(error) { $('feedback').textContent=error.name === 'AbortError' ? '공유를 취소했습니다.' : '공유 메뉴를 열 수 없습니다. 복사나 이미지 저장을 이용해 주세요.'; }
  });
  $('motion-toggle').addEventListener('click',() => {
    manualMotionPreference = true; reduced = !reduced; scene.setReducedMotion(reduced); updateMotionToggle();
    if(reduced && mode === 'animation') finishAnimation();
    if(reduced) { cancelAnimationFrame(frame); frame=0; } else requestFrame();
  });
  preference.addEventListener('change',event => {
    if(manualMotionPreference) return;
    reduced=event.matches; scene.setReducedMotion(reduced); updateMotionToggle();
    if(reduced && mode === 'animation') finishAnimation();
    if(reduced) { cancelAnimationFrame(frame); frame=0; } else requestFrame();
  });
  document.addEventListener('visibilitychange',() => {
    if(document.hidden) { cancelAnimationFrame(frame); frame=0; } else requestFrame();
  });
  document.addEventListener('keydown',event => {
    if(mode === 'animation' && event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); finishAnimation(); return; }
    if(mode !== 'game' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing) return;
    if(event.target instanceof Element && event.target.closest('button,a,input,textarea,select,summary,[contenteditable="true"]')) return;
    if(/^[1-4]$/.test(event.key)) { event.preventDefault(); choose(Number(event.key)-1); }
  });
  window.advanceTime = ms => {
    manualTime=true; cancelAnimationFrame(frame); frame=0;
    const delta=Math.max(0,Math.min(Number(ms)||0,60000));
    scene.advance(delta);
    if(mode === 'animation') animationElapsed += delta;
    finishAnimationIfReady(scene.snapshot());
  };
  window.render_game_to_text = () => JSON.stringify({ mode,animation:mode==='animation'?{canSkip:true,elapsedMs:Math.round(animationElapsed),minimumMs:animationMinimum}:null,scene:state.scene,sceneId:mode==='game'?story.getNode(state).sceneId:null,scenarioId:state.scenarioId,scenarioVersion:state.scenarioVersion,conditions:state.initialConditions,step:state.decisions.length,maxSteps:limitFor(state),minuteOfDay:Number.isFinite(state.minuteOfDay)?state.minuteOfDay:null,elapsedMinutes:state.elapsedMinutes??null,timeLabel:story.formatTime(currentMinute()),energy:state.energy,mood:state.mood,body:state.body,context:state.context,route:state.route,traces:state.traces,choices:mode==='game'?story.getNode(state).choices.map(c=>c.title):[],choiceIds:mode==='game'?story.getNode(state).choices.map(c=>c.id):[],choiceDurations:mode==='game'?story.getNode(state).choices.map(c=>c.durationMinutes??null):[],reaction:mode==='reaction'?state.reaction:null,ending:mode==='result'?story.determineEnding(state).name:null,motion:scene.snapshot(),reducedMotion:reduced,storage:{currentId:archive.getSnapshot().current?.record.id,phase:archive.getSnapshot().current?.phase,completed:allRecords().length,persistence:archive.getSnapshot().persistence.mode} });
  initialiseArchiveUI();
  updateMotionToggle(); setMotion(initialMotion); scene.finish();
  if(archive.getSnapshot().current) resumeCurrent(); else show('cover');
})();
