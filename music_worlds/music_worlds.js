(() => {
  'use strict';
  const E = window.MusicWorlds, $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const palette = ['#597e50', '#c08f4b', '#627ca5', '#a3738e', '#5e9b8b', '#ab784d', '#8c9d4f', '#8b88b0'];
  const names = { ranked: '인기순 노출', visible: '인기 숫자 공개', independent: '인기 숨김' };
  const briefs = { ranked: '몇 번의 초기 선택이 나중의 노출을 바꿉니다. 먼저 ‘자동 재생’이나 ‘한 명 입장’을 눌러 네 세계의 출발을 비교해 보세요.', visible: '곡을 접할 기회는 무작위로 주어지지만 인기 숫자는 볼 수 있습니다. 숫자만 보여도 선택이 달라질까요?', independent: '청중은 다른 사람의 선택을 모릅니다. 기본 매력과 개인 취향만으로 네 세계의 결과가 얼마나 비슷해질까요?', free: '노출 방식, 인기에 끌리는 정도, 곡의 매력 차이를 직접 조합해 보세요.' };
  let state, running = false, elapsed = 0, last = 0, selectedWorld = 0, selectedSong = 0, hitAreas = [], comparison = null;
  let playbackRate = 1, manualClock = false;
  function playback(value) { running = value; elapsed = 0; last = performance.now(); }
  let forkResult = null, forkView = false;
  function forkSummary() {
    if (!forkResult) return null;
    const f = forkResult, a = f.control.worlds[f.world], b = f.promoted.worlds[f.world];
    return { at: f.at, to: f.to, world: f.world + 1, song: f.song, initial: f.initial, control: { choices: a.counts[f.song], exposures: a.exposures[f.song], leader: E.leader(a) }, promoted: { choices: b.counts[f.song], exposures: b.exposures[f.song], leader: E.leader(b) }, delta: b.counts[f.song] - a.counts[f.song], checkpoints: f.checkpoints };
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionEnabled = () => Boolean(window.WebSimAmbient?.enabled) && !reducedMotion.matches;
  let displayCounts = [], displayRows = [], targetRows = [], easing = false, pointerStart = null;
  function resetVisuals() { displayCounts = state.worlds.map(w => w.counts.slice()); displayRows = state.worlds.map(() => E.titles.map((_, i) => i)); targetRows = displayRows.map(a => a.slice()); easing = false; }
  function targetVisuals() {
    targetRows = state.worlds.map(w => { const rows = []; w.counts.map((n, id) => ({ n, id })).sort((a, b) => b.n - a.n || a.id - b.id).forEach((s, rank) => { rows[s.id] = rank; }); return rows; });
    if (!motionEnabled()) { displayCounts = state.worlds.map(w => w.counts.slice()); displayRows = targetRows.map(a => a.slice()); easing = false; }
    else easing = state.worlds.some((w, wi) => w.counts.some((n, id) => Math.abs(n - displayCounts[wi][id]) > .04 || Math.abs(targetRows[wi][id] - displayRows[wi][id]) > .002));
  }
  const previewHome = $('preview').parentNode, toolbarHome = $('toolbar').parentNode;
  function config() { return { seed: Number($('seed').value) || 1, mode: $('mode').value, influence: Number($('influence').value) / 100, spread: Number($('spread').value) / 100 }; }
  function reset() { playback(false); state = E.create(config()); resetVisuals(); comparison = null; forkResult = null; forkView = false; $('benchmark').hidden = true; $('fork-result').hidden = true; $('message').textContent = '같은 여덟 곡과 청중 취향으로 출발합니다. 세계마다 먼저 접하는 곡과 순간 판단에 다른 우연이 작용합니다.'; sync(); }
  function applyPreset() { const mode = $('preset').value; if (mode !== 'free') { $('mode').value = mode; $('influence').value = 80; $('spread').value = 45; } $('brief').textContent = briefs[mode]; reset(); }
  function songLabel(id) { return `${String.fromCharCode(65 + id)} · ${E.titles[id]}`; }
  function next(n = 1) { forkView = false; E.run(state, n); if (state.listeners >= E.LIMIT) playback(false); if (state.listeners === E.LIMIT) $('message').textContent = `400명 완료. 네 세계에서 ${E.stats(state).differentLeaders}종류의 1위가 나왔습니다. 진열 방식을 바꾸거나 다른 실험 번호에서도 비교해 보세요.`; sync(); }
  function sync() {
    targetVisuals();
    const stats = E.stats(state); $('mode-chip').textContent = names[state.config.mode];
    $('play').textContent = state.listeners === E.LIMIT ? '실험 완료' : running ? '일시정지' : '자동 재생'; $('play').setAttribute('aria-pressed', String(running)); $('play').disabled = state.listeners === E.LIMIT; $('step').disabled = state.listeners === E.LIMIT; $('finish').disabled = state.listeners === E.LIMIT;
    $('visitors').textContent = `${state.listeners} / ${E.LIMIT}명`; $('leaders').textContent = state.listeners ? `${stats.differentLeaders}곡` : '—'; $('concentration').textContent = state.listeners ? `${Math.round(stats.concentration * 100)}%` : '—';
    $('influence-value').textContent = (Number($('influence').value) / 100).toFixed(2); $('spread-value').textContent = `${$('spread').value}%`; $('influence').disabled = state.config.mode === 'independent';
    $('world').value = selectedWorld; $('song').value = selectedSong;
    const promotion = state.worlds[selectedWorld].promotion;
    $('promote').disabled = Boolean(promotion) || state.listeners === E.LIMIT;
    $('fork').disabled = Boolean(promotion) || state.listeners === E.LIMIT;
    $('fork-preview').textContent = `지금 ${state.listeners}명째의 세계 ${selectedWorld + 1}을 복제합니다. ${songLabel(selectedSong)}을 다음 ${Math.min(20, E.LIMIT - state.listeners)}명에게 노출한 경우와 그대로 둔 경우를 400명까지 비교합니다. 실제 진행은 바뀌지 않습니다.`;
    $('chart-tabs').hidden = !forkResult;
    $('live-view').setAttribute('aria-pressed', String(!forkView)); $('fork-view').setAttribute('aria-pressed', String(forkView));
    $('promotion-note').textContent = promotion ? `세계 ${selectedWorld + 1} · ${songLabel(promotion.song)} 노출 중, ${promotion.remaining}명 남음.` : `세계 ${selectedWorld + 1}에만 개입합니다. 현재까지 전체 노출 개입 ${state.interventions.length}회.`;
    document.querySelectorAll('[data-world]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.world) === selectedWorld)));
    $('world-peek').innerHTML = state.worlds.map(w => `<span>세계 ${w.id + 1}<strong style="color:${state.listeners ? palette[E.leader(w)] : '#78836f'}">${state.listeners ? `${String.fromCharCode(65 + E.leader(w))} · ${w.counts[E.leader(w)]}명` : '시작 전'}</strong></span>`).join('');
    $('song-list').innerHTML = state.songs.map(s => `<button class="song-card" data-song="${s.id}" aria-pressed="${selectedSong === s.id}"><strong style="color:${palette[s.id]}">${songLabel(s.id)}</strong><small>${E.genres[s.genre]} · 기본 매력 ${Math.round(s.quality * 100)}</small></button>`).join('');
    draw();
  }
  function ribbon(w, x, y, width, height) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, width, height, height / 2); ctx.clip(); ctx.fillStyle = '#edf0e6'; ctx.fillRect(x, y, width, height);
    // The hue of every segment is the actual leader after that arrival; no invented popularity history.
    let start = 0;
    while (start < w.history.length) {
      const song = w.history[start]; let end = start + 1; while (end < w.history.length && w.history[end] === song) end++;
      const left = x + width * start / E.LIMIT, right = x + width * end / E.LIMIT;
      ctx.fillStyle = palette[song]; ctx.globalAlpha = .82; ctx.fillRect(left, y, Math.max(.35, right - left), height);
      ctx.globalAlpha = .15; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(left, y + height * .24); ctx.bezierCurveTo(left + (right - left) * .3, y + height * .8, left + (right - left) * .7, y - height * .2, right, y + height * .35); ctx.lineTo(right, y); ctx.lineTo(left, y); ctx.closePath(); ctx.fill();
      start = end;
    }
    ctx.restore();
  }
  function draw() {
    const small = window.innerWidth < 541, width = Math.max(260, Math.min(900, Math.round($('stage').clientWidth))), height = small ? Math.max(238, Math.min(286, Math.floor(innerHeight / 2) - 104)) : 628;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.fillStyle = '#f5f6ee'; ctx.fillRect(0, 0, width, height); hitAreas = [];
    if (forkView && forkResult) { drawFork(width, height, small); return; }
    const worlds = small ? [state.worlds[selectedWorld]] : state.worlds;
    worlds.forEach((w, index) => {
      const panelW = small ? width - 16 : (width - 48) / 2, panelH = small ? height - 16 : 288, px = small ? 8 : 16 + index % 2 * (panelW + 16), py = small ? 8 : 14 + Math.floor(index / 2) * 300;
      const active = selectedWorld === w.id;
      ctx.fillStyle = active ? '#fefff9' : '#fcfdf8'; ctx.strokeStyle = active ? '#8a9f78' : '#dbe2d3'; ctx.lineWidth = active ? 1.5 : 1;
      ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#344832'; ctx.font = `600 ${small ? 15 : 17}px sans-serif`; ctx.fillText(`세계 ${w.id + 1}`, px + 13, py + 25);
      ctx.fillStyle = '#819076'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${state.listeners}명`, px + panelW - 13, py + 24); ctx.textAlign = 'left';
      const top = py + (small ? 46 : 53), row = small ? (panelH - 118) / 7 : 22, max = Math.max(1, ...w.counts), barX = px + 122, barW = panelW - 160;
      // Paint non-selected rows first so the selected line remains readable while ranks cross.
      const drawOrder = state.songs.filter(s => s.id !== selectedSong).concat(state.songs[selectedSong]);
      for (const song of drawOrder) {
        const y = top + displayRows[w.id][song.id] * row, chosen = active && selectedSong === song.id;
        if (chosen) { ctx.fillStyle = '#eaf0e1'; ctx.beginPath(); ctx.roundRect(px + 6, y - 13, panelW - 12, Math.min(21, row), 4); ctx.fill(); }
        ctx.fillStyle = palette[song.id]; ctx.font = chosen ? '600 12px sans-serif' : '12px sans-serif'; ctx.fillText(songLabel(song.id), px + 13, y);
        ctx.fillStyle = '#edf1e5'; ctx.beginPath(); ctx.roundRect(barX, y - 9, barW, 10, 5); ctx.fill();
        const length = Math.max(0, barW * displayCounts[w.id][song.id] / max);
        if (length > .3) { const gradient = ctx.createLinearGradient(barX, 0, barX + Math.max(1, length), 0); gradient.addColorStop(0, palette[song.id] + '9c'); gradient.addColorStop(1, palette[song.id]); ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(barX, y - 9, length, 10, Math.min(5, length / 2)); ctx.fill(); }
        ctx.fillStyle = '#647258'; ctx.font = '12px sans-serif'; ctx.fillText(String(w.counts[song.id]), barX + barW + 5, y);
        hitAreas.push({ x: px + 6, y: y - 13, width: panelW - 12, height: Math.min(21, row), world: w.id, song: song.id });
      }
      ctx.fillStyle = state.listeners ? palette[E.leader(w)] : '#839076'; ctx.font = '12px sans-serif';
      ctx.fillText(state.listeners ? `1위 · ${songLabel(E.leader(w))}` : '아직 선택된 곡이 없습니다', px + 13, py + panelH - 52);
      ribbon(w, px + 13, py + panelH - 38, panelW - 26, 13);
      ctx.fillStyle = '#89947e'; ctx.font = '11px sans-serif'; ctx.fillText('리본 색 = 그때의 1위', px + 13, py + panelH - 10);
      ctx.textAlign = 'right'; ctx.fillText('0 → 400명', px + panelW - 13, py + panelH - 10); ctx.textAlign = 'left';
    });
    ctx.fillStyle = '#7d8971'; ctx.font = '12px sans-serif'; if (!small) ctx.fillText('막대는 현재 인기순 · 숫자는 선택 인원 · 각 세계의 1위가 막대 최대 길이', 16, 621);
  }
  function drawFork(width, height, small) {
    const f = forkResult, s = forkSummary(), left = small ? 36 : 68, right = width - (small ? 16 : 38), top = small ? 64 : 115, bottom = height - (small ? 51 : 88);
    const max = Math.max(5, s.control.choices, s.promoted.choices), span = Math.max(1, f.to - f.at);
    const x = at => left + (right - left) * (at - f.at) / span, y = n => bottom - (bottom - top) * n / max;
    ctx.fillStyle = '#344832'; ctx.font = `600 ${small ? 14 : 21}px sans-serif`; ctx.fillText(`세계 ${f.world + 1} · ${songLabel(f.song)}`, small ? 14 : 32, small ? 24 : 36);
    ctx.fillStyle = '#6f7f64'; ctx.font = '12px sans-serif'; ctx.fillText(`${f.at}명에서 분기 · 같은 청중과 우연`, small ? 14 : 32, small ? 44 : 60);
    ctx.fillStyle = '#f0e6cf'; ctx.fillRect(x(f.at), top, x(Math.min(f.at + 20, f.to)) - x(f.at), bottom - top);
    for (let i = 0; i <= 4; i++) { const n = max * i / 4; ctx.strokeStyle = '#e0e5d9'; ctx.beginPath(); ctx.moveTo(left, y(n)); ctx.lineTo(right, y(n)); ctx.stroke(); ctx.fillStyle = '#7d8971'; ctx.textAlign = 'right'; ctx.fillText(String(Math.round(n)), left - 6, y(n) + 4); }
    ctx.textAlign = 'left';
    const rows = [{ at: f.at, control: f.initial, promoted: f.initial }, ...f.checkpoints];
    for (const [key, color, dashed] of [['control', '#839080', true], ['promoted', palette[f.song], false]]) {
      ctx.strokeStyle = color; ctx.lineWidth = small ? 2.5 : 3.5; ctx.setLineDash(dashed ? [5, 4] : []); ctx.beginPath(); rows.forEach((p, i) => i ? ctx.lineTo(x(p.at), y(p[key])) : ctx.moveTo(x(p.at), y(p[key]))); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = '#7d8971'; ctx.fillText(`${f.at}명`, left, bottom + 17); ctx.textAlign = 'right'; ctx.fillText(`${f.to}명`, right, bottom + 17); ctx.textAlign = 'left';
    ctx.fillStyle = '#839080'; ctx.fillText(`┄ 그대로 ${s.control.choices}명`, small ? 14 : 32, height - (small ? 13 : 40));
    ctx.fillStyle = palette[f.song]; ctx.fillText(`━ 추천 ${s.promoted.choices}명 (${s.delta >= 0 ? '+' : ''}${s.delta})`, small ? width / 2 : width / 2, height - (small ? 13 : 40));
    if (!small) { ctx.fillStyle = '#958567'; ctx.fillText('옅은 배경 = 추천 노출 기간 · 세로축 = 이 곡의 누적 선택 수', 32, 88); ctx.fillStyle = '#7d8971'; ctx.fillText('선의 차이는 이 상태·이 난수에서 추천 개입으로 생긴 차이입니다. 다른 번호의 일반 효과를 뜻하지 않습니다.', 32, height - 14); }
  }
  function responsive() { const small = window.innerWidth < 541; (small ? $('mobile-intervention-home') : $('intervention-home')).appendChild($('intervention-controls')); if (small && $('preview').parentNode !== $('mobile-preview-home')) { $('mobile-toolbar-home').appendChild($('toolbar')); $('mobile-preview-home').appendChild($('preview')); } else if (!small && $('preview').parentNode !== previewHome) { previewHome.insertBefore($('preview'), previewHome.querySelector('.stage-caption')); toolbarHome.insertBefore($('toolbar'), $('preview')); } draw(); }
  function toggleFull(forceClose = false) {
    const stage = $('stage'), open = document.fullscreenElement || stage.classList.contains('expanded');
    if (open || forceClose) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); stage.classList.remove('expanded'); $('exit-fullscreen').hidden = true; }
    else { stage.classList.add('expanded'); $('exit-fullscreen').hidden = false; if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {}); }
    draw();
  }
  $('song').innerHTML = E.titles.map((_, id) => `<option value="${id}">${songLabel(id)}</option>`).join('');
  $('play').onclick = () => { forkView = false; if (state.listeners < E.LIMIT) playback(!running); sync(); }; $('step').onclick = () => { playback(false); next(); }; $('finish').onclick = () => { playback(false); next(E.LIMIT); }; $('reset').onclick = reset; $('preset').onchange = applyPreset;
  $('playback-speed').onchange = () => { playbackRate = Number($('playback-speed').value); playback(running); sync(); };
  for (const id of ['mode', 'influence', 'spread', 'seed']) $(id).onchange = () => { $('preset').value = 'free'; $('brief').textContent = briefs.free; reset(); };
  for (const id of ['influence', 'spread']) $(id).oninput = () => { $(`${id}-value`).textContent = id === 'influence' ? (Number($(id).value) / 100).toFixed(2) : `${$(id).value}%`; };
  $('new-seed').onclick = () => { $('seed').value = 1 + Math.floor(Math.random() * 999998); reset(); };
  $('world').onchange = () => { selectedWorld = Number($('world').value); sync(); }; $('song').onchange = () => { selectedSong = Number($('song').value); sync(); };
  $('song-list').addEventListener('click', event => { const b = event.target.closest('[data-song]'); if (b) { selectedSong = Number(b.dataset.song); sync(); } });
  document.querySelectorAll('[data-world]').forEach(b => b.onclick = () => { selectedWorld = Number(b.dataset.world); sync(); });
  $('promote').onclick = () => { if (E.promote(state, selectedWorld, selectedSong)) { playback(false); $('message').textContent = `세계 ${selectedWorld + 1}의 다음 ${Math.min(20, E.LIMIT - state.listeners)}명에게 ${songLabel(selectedSong)}을 노출합니다. 다른 세계의 노출은 바뀌지 않습니다.`; sync(); } };
  $('fork').onclick = () => {
    const result = E.fork(state, selectedWorld, selectedSong); if (!result) return;
    playback(false); forkResult = result; forkView = true;
    const s = forkSummary(); $('fork-result').hidden = false;
    $('fork-result').innerHTML = `<strong>${s.at}명째에서 갈라진 세계 ${s.world} · ${songLabel(s.song)}</strong><table><thead><tr><th>400명 결과</th><th>그대로</th><th>${Math.min(20, E.LIMIT - s.at)}명 추천</th></tr></thead><tbody><tr><td>이 곡 선택</td><td>${s.control.choices}명</td><td>${s.promoted.choices}명</td></tr><tr><td>이 곡 노출</td><td>${s.control.exposures}회</td><td>${s.promoted.exposures}회</td></tr><tr><td>최종 1위</td><td>${songLabel(s.control.leader)}</td><td>${songLabel(s.promoted.leader)}</td></tr></tbody></table><p>선택 변화 <b>${s.delta >= 0 ? '+' : ''}${s.delta}명</b>. 같은 출발 상태·취향·순간 판단 난수에서 추천 여부만 바꿨습니다. 노출 기회가 늘어도 선택은 늘지 않을 수 있습니다. 옅은 그래프 배경은 추천 기간입니다.</p>`;
    $('message').textContent = `분기 비교를 계산했습니다. 원래 네 세계는 ${state.listeners}명에서 멈춰 있습니다.`; sync();
  };
  $('live-view').onclick = () => { forkView = false; sync(); }; $('fork-view').onclick = () => { playback(false); forkView = true; sync(); };
  $('compare').onclick = () => { playback(false); sync(); comparison = E.compare(state.config); $('benchmark').innerHTML = '<table><thead><tr><th>진열 방식</th><th>1위 종류</th><th>1위 점유율</th></tr></thead><tbody>' + comparison.map(r => `<tr><td>${names[r.mode]}</td><td>${r.differentLeaders}곡</td><td>${Math.round(r.concentration * 100)}%</td></tr>`).join('') + '</tbody></table><p>같은 번호·곡·청중으로 각 400명까지 계산한 결과입니다. 플레이어 노출 개입은 제외합니다. 1위 동률은 곡 문자 순서로 표시합니다.</p>'; $('benchmark').hidden = false; };
  canvas.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; });
  canvas.addEventListener('pointermove', event => { if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 9) pointerStart = null; });
  canvas.addEventListener('pointerup', event => { if (!pointerStart || pointerStart.id !== event.pointerId) return; pointerStart = null; const r = canvas.getBoundingClientRect(), x = (event.clientX - r.left) * canvas.width / r.width, y = (event.clientY - r.top) * canvas.height / r.height; const hit = hitAreas.find(a => x >= a.x && x <= a.x + a.width && y >= a.y && y < a.y + a.height); if (hit) { selectedWorld = hit.world; selectedSong = hit.song; sync(); } });
  $('fullscreen').onclick = () => toggleFull(); $('exit-fullscreen').onclick = () => toggleFull(true);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { $('stage').classList.remove('expanded'); $('exit-fullscreen').hidden = true; } draw(); });
  document.addEventListener('keydown', event => { if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return; if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFull(); } if (event.key === 'Escape') toggleFull(true); if (event.code === 'Space' && event.target.tagName !== 'BUTTON') { event.preventDefault(); if (state.listeners < E.LIMIT) { forkView = false; playback(!running); sync(); } } });
  function advance(ms) { if (!running) return; elapsed += ms * playbackRate; let changed = false; while (elapsed + 1e-7 >= 500 && state.listeners < E.LIMIT) { E.step(state); elapsed -= 500; changed = true; } if (state.listeners >= E.LIMIT) { playback(false); $('message').textContent = `400명 완료. ${E.stats(state).differentLeaders}종류의 1위가 나왔습니다. 같은 조건을 다시 돌리면 같은 결과가 나옵니다.`; } if (changed) sync(); }
  function advanceVisuals(ms) {
    if (!motionEnabled() || !easing) return;
    const weight = 1 - Math.exp(-ms / 100); let pending = false;
    state.worlds.forEach((w, wi) => w.counts.forEach((n, id) => {
      displayCounts[wi][id] += (n - displayCounts[wi][id]) * weight; displayRows[wi][id] += (targetRows[wi][id] - displayRows[wi][id]) * weight;
      if (Math.abs(n - displayCounts[wi][id]) < .04) displayCounts[wi][id] = n; else pending = true;
      if (Math.abs(targetRows[wi][id] - displayRows[wi][id]) < .002) displayRows[wi][id] = targetRows[wi][id]; else pending = true;
    }));
    easing = pending; draw();
  }
  function motionChanged() { targetVisuals(); draw(); }
  window.addEventListener('websim:ambient-change', motionChanged); reducedMotion.addEventListener('change', motionChanged);
  window.advanceTime = ms => { manualClock = true; const dt = Math.max(0, Number(ms) || 0); advance(dt); advanceVisuals(dt); return Promise.resolve(); };
  window.render_game_to_text = () => JSON.stringify({ coordinates: 'desktop worlds in a 2×2 grid; mobile selected world; fork plot x=arrival index y=chosen-song cumulative selections', config: state.config, running, playbackRate, stepIntervalMs: 500 / playbackRate, listenersPerWorld: state.listeners, selectedWorld: selectedWorld + 1, selectedSong, songs: state.songs.map(s => ({ ...s, quality: Math.round(s.quality * 100) })), worlds: state.worlds.map(w => ({ world: w.id + 1, counts: w.counts, exposures: w.exposures, promotion: w.promotion, last: w.last, leaderHistory: w.history })), statistics: E.stats(state), interventions: state.interventions, comparison, forkView, fork: forkSummary(), art: { motion: motionEnabled(), easing, displayRows, targetRows, displayCounts } });
  window.addEventListener('resize', responsive);
  function frame(time) { if (last && !manualClock) { const dt = Math.min(100, time - last); advance(dt); advanceVisuals(dt); } last = time; requestAnimationFrame(frame); }
  applyPreset(); responsive(); requestAnimationFrame(frame);
})();
