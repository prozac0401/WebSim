/* Local-only presentation: five decisions, with an untimed interlude after each. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const story = window.SaturdayStory;
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
  const scene = window.SaturdayScene.create($('day-canvas'), { reducedMotion: reduced });
  const initialMotion = { kind:'rest', location:'room', caption:'평소와 같은 방. 조금 다른 토요일.' };
  const intensity = value => value < 2 ? '희미함' : value < 4 ? '신경 쓰임' : value < 7 ? '뚜렷함' : '많이 신경 쓰임';
  for(let i=0;i<10;i++) $('effort-bars').append(document.createElement('span'));
  let effortText = '';

  function updateEffort() {
    const snapshot = scene.snapshot(), effort = snapshot.effort;
    const visible = Boolean(effort && effort.visible && ['game','reaction'].includes(mode));
    $('effort-monitor').hidden = !visible;
    if(!visible) return;
    const amount = Math.max(0,Math.min(10,effort.displayEnergy));
    Array.from($('effort-bars').children).forEach((bar,i) => bar.style.setProperty('--fill',`${Math.max(0,Math.min(1,amount-i))*100}%`));
    // The drawing changes between steps; assistive technology receives the result once through the main status.
    const text = `떠올린 여유 ${Math.round(amount*10)}%`;
    if(effortText !== text) { $('effort-value').textContent=text; effortText=text; }
    $('effort-thought').textContent = !snapshot.moving ? '도착하고 나서도, 돌아갈 길이 머리에 남는다.'
      : snapshot.kind === 'stairs' ? '한 단, 잠깐 멈춤. 올라가는 힘 옆에 내려갈 힘도 적힌다.'
      : '한 걸음마다 켜진다. 가는 힘, 문을 여는 힘, 돌아올 힘까지.';
  }

  function paragraphs(target, lines) {
    target.replaceChildren(...lines.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
  }
  function focusHeading(id) {
    $(id).focus({ preventScroll:true });
    // Keep the consequence text and controls in view on a narrow or zoomed screen.
    if (window.innerWidth <= 740) (mode === 'reaction' ? document.querySelector('.day-panel') : $('story-panel')).scrollIntoView({ block:'start', behavior:'instant' });
    else if (window.scrollY > 200) $('main').scrollIntoView({ block:'start', behavior:'instant' });
  }
  function show(next) {
    mode = next;
    document.body.dataset.mode = next === 'reaction' ? 'game' : next;
    $('cover').hidden = next !== 'cover';
    $('game').hidden = !['game', 'reaction'].includes(next);
    $('result').hidden = next !== 'result';
    $('status-panel').hidden = next === 'cover';
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
    scene.advance(lastFrame ? Math.min(80, now - lastFrame) : 0);
    updateEffort();
    lastFrame = now;
    if (!manualTime && !reduced && !document.hidden && scene.snapshot().moving) frame = requestAnimationFrame(tick);
  }
  function setMotion(motion) {
    const selected = motion || initialMotion;
    scene.setScene({ energyBefore:state.energy, energyAfter:state.energy, ...selected, body:state.body, step:state.step });
    $('scene-caption').textContent = selected.caption;
    $('day-canvas').setAttribute('aria-label', selected.caption);
    updateEffort();
    requestFrame();
  }
  function status() {
    for (const key of ['energy','mood']) {
      $(key).value = state[key];
      $(key).textContent = `${state[key]} / 10`;
      $(`${key}-value`).textContent = `${state[key]} / 10`;
    }
    const body = story.bodyDescription(state);
    $('body-list').replaceChildren(...body.map(item => {
      const div = document.createElement('div'); div.className = 'body-item';
      const head = document.createElement('header');
      const label = document.createElement('strong'); label.textContent = item.label;
      const level = document.createElement('span'); level.textContent = intensity(item.value);
      const p = document.createElement('p'); p.textContent = item.text;
      head.append(label,level); div.append(head,p); return div;
    }));
    const prominent = body.slice().sort((a,b) => b.value - a.value).slice(0,2);
    $('body-summary').textContent = prominent.map(item => item.label).join(' · ');
    $('traces').replaceChildren(...(state.traces.length ? state.traces.slice(-3) : ['아직 비어 있는 하루']).map(text => {
      const chip = document.createElement('span'); chip.className = 'trace'; chip.textContent = text; return chip;
    }));
    const completed = state.decisions.length;
    Array.from($('progress-track').children).forEach((li,i) => {
      li.className = i < completed ? 'done' : i === completed ? 'current' : '';
      li.setAttribute('aria-label', `${i + 1}번째 선택 ${i < completed ? '완료' : '남음'}`);
      if(i === completed) li.setAttribute('aria-current','step'); else li.removeAttribute('aria-current');
    });
    $('announcement').textContent = `${completed}번 선택 완료. 에너지 ${state.energy}, 마음의 온도 ${state.mood}.`;
  }
  function renderScene() {
    show('game');
    const node = story.getNode(state);
    $('time-label').textContent = node.time;
    $('scene-clock').textContent = node.time.split(' · ')[0];
    $('chapter-label').textContent = `선택 ${state.decisions.length + 1} / 5`;
    $('scene-title').textContent = node.title;
    paragraphs($('story-text'), node.lines);
    $('choices').replaceChildren(...node.choices.map((choice,index) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'choice';
      b.setAttribute('aria-label', `${index+1}번: ${choice.title}. ${choice.note}`);
      const number = document.createElement('span'); number.className = 'choice-number'; number.textContent = String(index+1); number.setAttribute('aria-hidden','true');
      const copy = document.createElement('span');
      const title = document.createElement('span'); title.className = 'choice-title'; title.textContent = choice.title;
      const note = document.createElement('span'); note.className = 'choice-note'; note.textContent = choice.note;
      copy.append(title,note); b.append(number,copy);
      b.addEventListener('click', () => choose(index)); return b;
    }));
    status(); focusHeading('scene-title');
  }
  function choose(index) {
    if (mode !== 'game') return;
    const node = story.getNode(state), choice = node.choices[index];
    if (!choice) return;
    state = story.choose(state, index);
    journal.push({ time:node.time, title:choice.title, reaction:state.reaction.lines.slice() });
    show('reaction');
    $('chapter-label').textContent = `선택 ${state.decisions.length} / 5`;
    $('reaction-title').textContent = state.reaction.title;
    paragraphs($('reaction-text'),state.reaction.lines);
    $('reaction-choice').textContent = `내가 고른 방향 · ${choice.title}`;
    $('continue-button').replaceChildren(document.createTextNode(state.scene === 'end' ? '오늘의 결말 펼치기 ' : '다음 장면으로 '));
    const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden','true'); arrow.textContent = '→'; $('continue-button').append(arrow);
    status(); setMotion(state.motion); focusHeading('reaction-title');
  }
  function ending() {
    show('result');
    const end = story.determineEnding(state);
    $('ending-name').textContent = end.name;
    $('ending-quote').textContent = end.quote;
    $('ending-body').textContent = end.body;
    $('ending-takeaway').textContent = end.takeaway;
    $('scene-clock').textContent = '20:16';
    $('journal-list').replaceChildren(...journal.map(entry => {
      const li = document.createElement('li');
      const h = document.createElement('strong'); h.textContent = `${entry.time.split(' · ')[0]} · ${entry.title}`;
      const p = document.createElement('p'); p.textContent = entry.reaction.join(' '); li.append(h,p); return li;
    }));
    $('feedback').textContent = '다른 선택에는 다른 장면이 남아 있습니다.';
    $('native-share').hidden = typeof navigator.share !== 'function';
    setMotion({ kind:'rest',location:'room',caption:'저녁의 방. 오늘 남은 감각과 이야기를 잠시 내려놓는다.' });
    scene.advance(1250);
    status(); focusHeading('ending-name');
  }
  function start() {
    runToken++;
    state = story.freshState(); journal = [];
    $('manual-copy').hidden = true; $('manual-copy').value = '';
    $('body-notes').open = false; document.querySelector('.journal').open = false;
    $('feedback').textContent = '';
    setMotion(initialMotion); scene.advance(1250); renderScene();
  }
  function publicURL() {
    // A public URL is included only when this very document has loaded at its final public address.
    return location.protocol === 'https:' && location.hostname === 'prozac0401.github.io' && location.pathname === '/WebSim/stopped_saturday/stopped_saturday.html'
      ? location.origin + location.pathname : '';
  }
  function shareText() {
    const e = story.determineEnding(state);
    return [`《멈춘 토요일》 — ${e.name}`,e.quote,`오늘 남긴 흔적: ${state.traces.slice(-3).join(' · ')}`,e.takeaway,publicURL(),'#멈춘토요일'].filter(Boolean).join('\n\n');
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
    const savedRun = runToken, e = story.determineEnding(state), savedTraces = state.traces.slice(-3);
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
      ctx.fillStyle='#647567'; ctx.font='400 22px "Malgun Gothic", sans-serif'; ctx.fillText('다섯 번의 선택으로 남긴, 하나의 토요일.   #멈춘토요일',76,1294);
      const blob = await new Promise(resolve => card.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('Image unavailable');
      const href = URL.createObjectURL(blob), link = document.createElement('a'); link.href=href; link.download='멈춘토요일_나의결말.png'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href),30000);
      if(savedRun === runToken) $('feedback').textContent='PNG 이미지 저장을 요청했습니다. 브라우저의 다운로드 목록을 확인해 주세요.';
    } catch { if(savedRun === runToken) $('feedback').textContent='이미지를 저장하지 못했습니다. 결말 문구 복사를 이용해 주세요.'; }
    finally { button.disabled=false; }
  }
  $('start-button').addEventListener('click',start);
  $('restart').addEventListener('click',start);
  $('continue-button').addEventListener('click',() => { if(mode !== 'reaction') return; if(state.scene === 'end') ending(); else renderScene(); });
  $('copy-result').addEventListener('click',copyResult);
  $('save-image').addEventListener('click',saveImage);
  $('native-share').addEventListener('click',async () => {
    try { await navigator.share({ title:'멈춘 토요일',text:shareText() }); $('feedback').textContent='공유 메뉴로 결말을 전달했습니다.'; }
    catch(error) { $('feedback').textContent=error.name === 'AbortError' ? '공유를 취소했습니다.' : '공유 메뉴를 열 수 없습니다. 복사나 이미지 저장을 이용해 주세요.'; }
  });
  $('motion-toggle').addEventListener('click',() => {
    manualMotionPreference = true; reduced = !reduced; scene.setReducedMotion(reduced); updateMotionToggle();
    updateEffort();
    if(reduced) { cancelAnimationFrame(frame); frame=0; } else requestFrame();
  });
  preference.addEventListener('change',event => {
    if(manualMotionPreference) return;
    reduced=event.matches; scene.setReducedMotion(reduced); updateMotionToggle();
    updateEffort();
    if(reduced) { cancelAnimationFrame(frame); frame=0; } else requestFrame();
  });
  document.addEventListener('visibilitychange',() => {
    if(document.hidden) { cancelAnimationFrame(frame); frame=0; } else requestFrame();
  });
  document.addEventListener('keydown',event => {
    if(mode !== 'game' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing) return;
    if(event.target instanceof Element && event.target.closest('button,a,input,textarea,select,summary,[contenteditable="true"]')) return;
    if(/^[1-4]$/.test(event.key)) { event.preventDefault(); choose(Number(event.key)-1); }
  });
  window.advanceTime = ms => {
    manualTime=true; cancelAnimationFrame(frame); frame=0;
    scene.advance(Math.max(0,Math.min(Number(ms)||0,60000)));
    updateEffort();
  };
  window.render_game_to_text = () => JSON.stringify({ mode,scene:state.scene,step:state.decisions.length,energy:state.energy,mood:state.mood,body:state.body,route:state.route,traces:state.traces,choices:mode==='game'?story.getNode(state).choices.map(c=>c.title):[],reaction:mode==='reaction'?state.reaction:null,ending:mode==='result'?story.determineEnding(state).name:null,motion:scene.snapshot(),reducedMotion:reduced });
  show('cover'); updateMotionToggle(); setMotion(initialMotion); scene.advance(1250);
})();
