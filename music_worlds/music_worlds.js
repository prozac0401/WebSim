(() => {
  'use strict';
  const E = window.MusicWorlds, $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const palette = ['#597e50', '#c08f4b', '#627ca5', '#a3738e', '#5e9b8b', '#ab784d', '#8c9d4f', '#8b88b0'];
  const names = { ranked: '인기순 노출', visible: '인기 숫자 공개', independent: '인기 숨김' };
  const briefs = { ranked: '몇 번의 초기 선택이 나중의 노출을 바꿉니다. 먼저 ‘10명씩 입장’을 눌러 네 세계의 출발을 비교해 보세요.', visible: '곡을 접할 기회는 무작위로 주어지지만 인기 숫자는 볼 수 있습니다. 숫자만 보여도 선택이 달라질까요?', independent: '청중은 다른 사람의 선택을 모릅니다. 기본 매력과 개인 취향만으로 네 세계의 결과가 얼마나 비슷해질까요?', free: '노출 방식, 인기에 끌리는 정도, 곡의 매력 차이를 직접 조합해 보세요.' };
  let state, running = false, elapsed = 0, last = 0, selectedWorld = 0, selectedSong = 0, hitAreas = [], comparison = null;
  const previewHome = $('preview').parentNode, toolbarHome = $('toolbar').parentNode;
  function config() { return { seed: Number($('seed').value) || 1, mode: $('mode').value, influence: Number($('influence').value) / 100, spread: Number($('spread').value) / 100 }; }
  function reset() { running = false; elapsed = 0; state = E.create(config()); comparison = null; $('benchmark').hidden = true; $('message').textContent = '같은 여덟 곡과 청중 취향으로 출발합니다. 세계마다 먼저 접하는 곡과 순간 판단에 다른 우연이 작용합니다.'; sync(); }
  function applyPreset() { const mode = $('preset').value; if (mode !== 'free') { $('mode').value = mode; $('influence').value = 80; $('spread').value = 45; } $('brief').textContent = briefs[mode]; reset(); }
  function songLabel(id) { return `${String.fromCharCode(65 + id)} · ${E.titles[id]}`; }
  function next(n = 10) { E.run(state, n); if (state.listeners >= E.LIMIT) running = false; if (state.listeners === E.LIMIT) $('message').textContent = `400명 완료. 네 세계에서 ${E.stats(state).differentLeaders}종류의 1위가 나왔습니다. 진열 방식을 바꾸거나 다른 실험 번호에서도 비교해 보세요.`; sync(); }
  function sync() {
    const stats = E.stats(state); $('mode-chip').textContent = names[state.config.mode];
    $('play').textContent = state.listeners === E.LIMIT ? '실험 완료' : running ? '일시정지' : state.listeners ? '이어서 진행' : '네 세계 함께 시작'; $('play').disabled = state.listeners === E.LIMIT; $('step').disabled = state.listeners === E.LIMIT; $('finish').disabled = state.listeners === E.LIMIT;
    $('visitors').textContent = `${state.listeners} / ${E.LIMIT}명`; $('leaders').textContent = state.listeners ? `${stats.differentLeaders}곡` : '—'; $('concentration').textContent = state.listeners ? `${Math.round(stats.concentration * 100)}%` : '—';
    $('influence-value').textContent = (Number($('influence').value) / 100).toFixed(2); $('spread-value').textContent = `${$('spread').value}%`; $('influence').disabled = state.config.mode === 'independent';
    $('world').value = selectedWorld; $('song').value = selectedSong;
    const promotion = state.worlds[selectedWorld].promotion;
    $('promote').disabled = Boolean(promotion) || state.listeners === E.LIMIT;
    $('promotion-note').textContent = promotion ? `세계 ${selectedWorld + 1} · ${songLabel(promotion.song)} 노출 중, ${promotion.remaining}명 남음.` : `세계 ${selectedWorld + 1}에만 개입합니다. 현재까지 전체 노출 개입 ${state.interventions.length}회.`;
    document.querySelectorAll('[data-world]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.world) === selectedWorld)));
    $('world-peek').textContent = state.listeners ? state.worlds.map(w => `세계 ${w.id + 1} ${String.fromCharCode(65 + E.leader(w))} (${w.counts[E.leader(w)]}명)`).join(' · ') : '세계 1~4 모두 같은 여덟 곡으로 시작합니다.';
    $('song-list').innerHTML = state.songs.map(s => `<button class="song-card" data-song="${s.id}" aria-pressed="${selectedSong === s.id}"><strong style="color:${palette[s.id]}">${songLabel(s.id)}</strong><small>${E.genres[s.genre]} · 기본 매력 ${Math.round(s.quality * 100)}</small></button>`).join('');
    draw();
  }
  function draw() {
    const small = window.innerWidth < 541, width = Math.max(260, Math.min(900, Math.round($('stage').clientWidth))), height = small ? 356 : 580;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.fillStyle = '#f6f8f1'; ctx.fillRect(0, 0, width, height); hitAreas = [];
    const worlds = small ? [state.worlds[selectedWorld]] : state.worlds;
    worlds.forEach((w, index) => {
      const panelW = small ? width - 24 : (width - 48) / 2, panelH = small ? 322 : 260, px = small ? 12 : 16 + index % 2 * (panelW + 16), py = small ? 12 : 16 + Math.floor(index / 2) * 280;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = selectedWorld === w.id ? '#839d74' : '#dce4d5'; ctx.lineWidth = selectedWorld === w.id ? 2 : 1; ctx.beginPath(); ctx.roundRect(px, py, panelW, panelH, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2e4432'; ctx.font = `600 ${small ? 15 : 17}px sans-serif`; ctx.fillText(`세계 ${w.id + 1}`, px + 14, py + 27);
      ctx.fillStyle = '#7e8979'; ctx.font = `${small ? 12 : 12}px sans-serif`; ctx.textAlign = 'right'; ctx.fillText(`${state.listeners}명 입장`, px + panelW - 14, py + 26); ctx.textAlign = 'left';
      const top = py + 49, row = small ? 30 : 22, max = Math.max(1, ...w.counts), labelW = small ? 98 : 106, barX = px + 14 + labelW, barW = panelW - labelW - 65;
      for (const song of state.songs) {
        const y = top + song.id * row;
        if (selectedWorld === w.id && selectedSong === song.id) { ctx.fillStyle = '#eef3e8'; ctx.fillRect(px + 8, y - 13, panelW - 16, row); }
        ctx.fillStyle = palette[song.id]; ctx.font = '12px sans-serif'; ctx.fillText(songLabel(song.id), px + 14, y);
        ctx.fillStyle = '#edf1e7'; ctx.fillRect(barX, y - 10, barW, small ? 14 : 12); ctx.fillStyle = palette[song.id]; ctx.fillRect(barX, y - 10, barW * w.counts[song.id] / max, small ? 14 : 12);
        ctx.fillStyle = '#596753'; ctx.font = '12px sans-serif'; ctx.fillText(String(w.counts[song.id]), barX + barW + 7, y);
        hitAreas.push({ x: px + 8, y: y - 14, width: panelW - 16, height: row, world: w.id, song: song.id });
      }
      ctx.fillStyle = '#78836f'; ctx.font = `${small ? 12 : 11}px sans-serif`;
      const leader = state.listeners ? `현재 1위: ${songLabel(E.leader(w))}` : '아직 선택된 곡이 없습니다';
      ctx.fillText(leader, px + 14, py + panelH - 16);
    });
    ctx.fillStyle = '#78836f'; ctx.font = '12px sans-serif'; if (!small) ctx.fillText('각 세계의 최다 선택 = 막대 최대 길이 · 숫자는 선택 인원', 16, 576);
  }
  function responsive() { const small = window.innerWidth < 541; if (small && $('preview').parentNode !== $('mobile-preview-home')) { $('mobile-toolbar-home').appendChild($('toolbar')); $('mobile-preview-home').appendChild($('preview')); } else if (!small && $('preview').parentNode !== previewHome) { previewHome.insertBefore($('preview'), previewHome.querySelector('.stage-caption')); toolbarHome.insertBefore($('toolbar'), $('preview')); } draw(); }
  function toggleFull(forceClose = false) {
    const stage = $('stage'), open = document.fullscreenElement || stage.classList.contains('expanded');
    if (open || forceClose) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); stage.classList.remove('expanded'); $('exit-fullscreen').hidden = true; }
    else { stage.classList.add('expanded'); $('exit-fullscreen').hidden = false; if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {}); }
    draw();
  }
  $('song').innerHTML = E.titles.map((_, id) => `<option value="${id}">${songLabel(id)}</option>`).join('');
  $('play').onclick = () => { running = !running; elapsed = 0; sync(); }; $('step').onclick = () => { running = false; next(); }; $('finish').onclick = () => { running = false; next(E.LIMIT); }; $('reset').onclick = reset; $('preset').onchange = applyPreset;
  for (const id of ['mode', 'influence', 'spread', 'seed']) $(id).onchange = () => { $('preset').value = 'free'; $('brief').textContent = briefs.free; reset(); };
  for (const id of ['influence', 'spread']) $(id).oninput = () => { $(`${id}-value`).textContent = id === 'influence' ? (Number($(id).value) / 100).toFixed(2) : `${$(id).value}%`; };
  $('new-seed').onclick = () => { $('seed').value = 1 + Math.floor(Math.random() * 999998); reset(); };
  $('world').onchange = () => { selectedWorld = Number($('world').value); sync(); }; $('song').onchange = () => { selectedSong = Number($('song').value); sync(); };
  $('song-list').addEventListener('click', event => { const b = event.target.closest('[data-song]'); if (b) { selectedSong = Number(b.dataset.song); sync(); } });
  document.querySelectorAll('[data-world]').forEach(b => b.onclick = () => { selectedWorld = Number(b.dataset.world); sync(); });
  $('promote').onclick = () => { if (E.promote(state, selectedWorld, selectedSong)) { $('message').textContent = `세계 ${selectedWorld + 1}의 다음 ${Math.min(20, E.LIMIT - state.listeners)}명에게 ${songLabel(selectedSong)}을 노출합니다. 다른 세계의 노출은 바뀌지 않습니다.`; sync(); } };
  $('compare').onclick = () => { comparison = E.compare(state.config); $('benchmark').innerHTML = '<table><thead><tr><th>진열 방식</th><th>1위 종류</th><th>1위 점유율</th></tr></thead><tbody>' + comparison.map(r => `<tr><td>${names[r.mode]}</td><td>${r.differentLeaders}곡</td><td>${Math.round(r.concentration * 100)}%</td></tr>`).join('') + '</tbody></table><p>같은 번호·곡·청중으로 각 400명까지 계산한 결과입니다. 플레이어 노출 개입은 제외합니다. 1위 동률은 곡 문자 순서로 표시합니다.</p>'; $('benchmark').hidden = false; };
  canvas.addEventListener('pointerdown', event => { const r = canvas.getBoundingClientRect(), x = (event.clientX - r.left) * canvas.width / r.width, y = (event.clientY - r.top) * canvas.height / r.height; const hit = hitAreas.find(a => x >= a.x && x <= a.x + a.width && y >= a.y && y < a.y + a.height); if (hit) { selectedWorld = hit.world; selectedSong = hit.song; sync(); } });
  $('fullscreen').onclick = () => toggleFull(); $('exit-fullscreen').onclick = () => toggleFull(true);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { $('stage').classList.remove('expanded'); $('exit-fullscreen').hidden = true; } draw(); });
  document.addEventListener('keydown', event => { if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return; if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFull(); } if (event.key === 'Escape') toggleFull(true); if (event.code === 'Space' && event.target.tagName !== 'BUTTON') { event.preventDefault(); if (state.listeners < E.LIMIT) { running = !running; sync(); } } });
  function advance(ms) { if (!running) return; elapsed += ms; while (elapsed >= 300 && state.listeners < E.LIMIT) { E.run(state, 5); elapsed -= 300; } if (state.listeners >= E.LIMIT) { running = false; $('message').textContent = `400명 완료. ${E.stats(state).differentLeaders}종류의 1위가 나왔습니다. 같은 조건을 다시 돌리면 같은 결과가 나옵니다.`; } sync(); }
  window.advanceTime = ms => { advance(Math.max(0, ms)); return Promise.resolve(); };
  window.render_game_to_text = () => JSON.stringify({ coordinates: 'desktop worlds in a 2×2 grid, origin top-left; mobile shows selected world; songs A–H top-to-bottom', config: state.config, running, listenersPerWorld: state.listeners, selectedWorld: selectedWorld + 1, selectedSong, songs: state.songs.map(s => ({ ...s, quality: Math.round(s.quality * 100) })), worlds: state.worlds.map(w => ({ world: w.id + 1, counts: w.counts, exposures: w.exposures, promotion: w.promotion, last: w.last })), statistics: E.stats(state), interventions: state.interventions, comparison });
  window.addEventListener('resize', responsive);
  function frame(time) { if (last) advance(Math.min(100, time - last)); last = time; requestAnimationFrame(frame); }
  applyPreset(); responsive(); requestAnimationFrame(frame);
})();
