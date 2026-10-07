(() => {
  'use strict';
  const E = window.TreasureLab, $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const colors = ['#517849', '#bf8a49', '#637db0', '#a97894', '#49968d', '#a0a447'];
  const presets = { hidden: { seed: 4, terrain: 'hidden', exploration: 35, period: 8 }, simple: { seed: 7319, terrain: 'simple', exploration: 50, period: 8 }, depleting: { seed: 61, terrain: 'depleting', exploration: 65, period: 8 } };
  let state, policy = 'instant', selected = 21, running = false, elapsed = 0, last = 0, geometry;
  const previewHome = $('preview').parentNode, toolbarHome = $('toolbar').parentNode;
  const brief = { hidden: '익숙한 광맥 너머에도 보물이 있습니다. ‘100일까지’를 눌러 공유 간격과 총수확의 관계를 비교해 보세요.', simple: '넓은 광맥 하나가 있는 지도입니다. 좋은 장소를 빨리 나누면 어떤 이점이 있는지 확인해 보세요.', depleting: '같은 곳을 계속 채굴하면 자원이 줄어듭니다. 가장 좋은 장소를 아는 것만으로 충분할까요?', free: '조건을 직접 조합해 보세요. 지도 번호가 같으면 지형과 탐색에 쓰는 난수를 그대로 재현합니다.' };
  function config() { return { seed: Number($('seed').value) || 1, terrain: $('terrain').value, exploration: Number($('exploration').value) / 100, period: Number($('period').value) }; }
  function reset() { running = false; elapsed = 0; state = E.create(config()); $('message').textContent = '세 방식이 같은 조건으로 출발합니다. 지도에서 칸을 골라 다음 날의 시추 위치를 지정할 수도 있습니다.'; sync(); }
  function applyPreset() { const p = presets[$('preset').value]; if (p) { $('seed').value = p.seed; $('terrain').value = p.terrain; $('exploration').value = p.exploration; $('period').value = p.period; } $('brief').textContent = brief[$('preset').value]; reset(); }
  function current() { return state.worlds[E.policies.indexOf(policy)]; }
  function message() {
    if (state.day === E.DAYS) { const best = E.summary(state).sort((a, b) => b.total - a.total)[0]; $('message').textContent = `100일 완료. 이 지도에서는 ${E.labels[best.policy]}의 수확이 가장 많습니다. 시추 개입 ${state.interventions.length}회. 다른 지도나 성향에서도 같은 결과인지 비교해 보세요.`; }
    else if (state.day) { const w = current(); $('message').textContent = `${E.labels[policy]} · 1번 탐사대: ${w.agents[0].action}. ${w.agents[0].cell % E.COLS + 1}열 ${Math.floor(w.agents[0].cell / E.COLS) + 1}행에서 ${Math.round(w.agents[0].earned)} 수확. ${policy === 'independent' ? '기록은 각자 간직합니다.' : `마지막 기록 공유 ${w.lastShared}일.`}`; }
  }
  function next(n = 1) { E.run(state, n); if (state.day >= E.DAYS) running = false; message(); sync(); }
  function sync() {
    $('play').textContent = state.day === E.DAYS ? '실험 완료' : running ? '일시정지' : state.day ? '이어서 진행' : '세 방식 함께 시작'; $('play').disabled = state.day === E.DAYS; $('step').disabled = state.day === E.DAYS; $('finish').disabled = state.day === E.DAYS; $('dig').disabled = state.day === E.DAYS;
    $('day-chip').textContent = `${state.day} / ${E.DAYS}일`; $('exploration-value').textContent = `${$('exploration').value}%`; $('period-value').textContent = `${$('period').value}일`;
    document.querySelectorAll('[data-policy]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.policy === policy)));
    const w = current(), value = w.visited[selected];
    const observed = value !== undefined || $('reveal').checked;
    const valueLabel = observed ? `${value === undefined ? '미발견 · 관찰값' : '발견값'} ${state.field[selected]}${state.config.depletion ? ` · 남은 채굴값 ${Math.round(state.field[selected] * w.remaining[selected])}` : ''}` : '미발견';
    $('selected-label').textContent = `선택: ${selected % E.COLS + 1}열 ${Math.floor(selected / E.COLS) + 1}행 · ${valueLabel}${state.order === selected ? ' · 시추 예약됨' : ''}`;
    $('column').value = selected % E.COLS; $('row').value = Math.floor(selected / E.COLS);
    $('mobile-summary').textContent = `${state.day}일 · 총수확: ` + E.summary(state).map(s => `${E.labels[s.policy].replace(' 공유', '').replace(' 탐색', '')} ${s.total.toLocaleString('ko-KR')}`).join(' / ');
    $('results').innerHTML = E.summary(state).map(s => `<div class="result-card ${s.policy === policy ? 'is-active' : ''}"><span>${E.labels[s.policy]} · 총수확</span><strong>${s.total.toLocaleString('ko-KR')}</strong><small>발견 ${s.explored} / 108칸<br>최고 발견값 ${s.best}</small></div>`).join('');
    draw();
  }
  function draw() {
    const small = window.innerWidth < 541, width = Math.max(260, Math.min(900, Math.round($('stage').clientWidth))), height = small ? Math.round((width - 28) * .75 + 125) : Math.round((width - 96) * .75 + 122);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const w = current(), margin = small ? 14 : 48, cell = (width - margin * 2) / E.COLS, top = small ? 62 : 72;
    geometry = { left: margin, top, cell };
    ctx.fillStyle = '#f6f8f1'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#263c2b'; ctx.font = `600 ${small ? 15 : 20}px sans-serif`; ctx.fillText(E.labels[policy], margin, 28);
    ctx.fillStyle = '#778473'; ctx.font = `${small ? 12 : 13}px sans-serif`; ctx.fillText('안개는 아직 발견하지 못한 칸입니다', margin, 47);
    for (let i = 0; i < state.field.length; i++) {
      const x = margin + i % E.COLS * cell, y = top + Math.floor(i / E.COLS) * cell;
      const known = i in w.visited, visible = known || $('reveal').checked;
      const val = state.field[i] * (state.config.depletion ? w.remaining[i] : 1);
      ctx.fillStyle = visible ? `hsl(${52 + val * .36} 38% ${94 - val * .42}%)` : '#e2e8df';
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (visible && !small) { ctx.fillStyle = known ? '#3d4d2b' : '#8e9784'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(Math.round(val)), x + cell / 2, y + cell / 2 + 4); ctx.textAlign = 'left'; }
      if (!known && !visible) { ctx.fillStyle = '#c7d1c1'; ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, 1.4, 0, Math.PI * 2); ctx.fill(); }
      if (i === selected) { ctx.strokeStyle = '#c48338'; ctx.lineWidth = 2.5; ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4); }
      if (i === state.order) { ctx.strokeStyle = '#b97637'; ctx.setLineDash([4, 3]); ctx.strokeRect(x + 5, y + 5, cell - 10, cell - 10); ctx.setLineDash([]); }
    }
    w.agents.forEach(a => {
      const peers = w.agents.filter(b => b.cell === a.cell), offset = peers.findIndex(b => b.id === a.id) - (peers.length - 1) / 2;
      const x = margin + (a.cell % E.COLS + .5) * cell + offset * (small ? 4 : 8), y = top + (Math.floor(a.cell / E.COLS) + .5) * cell;
      ctx.fillStyle = colors[a.id]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, small ? 6 : 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (!small) { ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(a.id + 1), x, y + 3); ctx.textAlign = 'left'; }
    });
    const bottom = top + cell * E.ROWS + 23;
    ctx.fillStyle = '#778473'; ctx.font = '12px sans-serif'; ctx.fillText(small ? '● 탐사대 6명 · 짙은 색일수록 높은 값' : '● 탐사대 6명 · 숫자: 이 칸의 하루 채굴값', margin, bottom);
    ctx.fillText($('reveal').checked ? '지형 공개 · 탐사대의 지식은 그대로' : '칸 선택 후 아래에서 시추 지시를 보냅니다', margin, bottom + 20);
  }
  function responsive() { const small = window.innerWidth < 541; if (small && $('preview').parentNode !== $('mobile-preview-home')) { $('mobile-toolbar-home').appendChild($('toolbar')); $('mobile-preview-home').appendChild($('preview')); $('mobile-dig-home').appendChild($('dig-controls')); } else if (!small && $('preview').parentNode !== previewHome) { previewHome.insertBefore($('preview'), previewHome.querySelector('.stage-caption')); toolbarHome.insertBefore($('toolbar'), $('preview')); previewHome.insertBefore($('dig-controls'), $('results')); } draw(); }
  function toggleFull(forceClose = false) {
    const stage = $('stage'), open = document.fullscreenElement || stage.classList.contains('expanded');
    if (open || forceClose) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); stage.classList.remove('expanded'); $('exit-fullscreen').hidden = true; }
    else { stage.classList.add('expanded'); $('exit-fullscreen').hidden = false; if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {}); }
    draw();
  }
  $('play').onclick = () => { running = !running; elapsed = 0; sync(); }; $('step').onclick = () => { running = false; next(); }; $('finish').onclick = () => { running = false; next(E.DAYS); }; $('reset').onclick = reset;
  $('preset').onchange = applyPreset;
  for (const id of ['terrain', 'exploration', 'period', 'seed']) $(id).onchange = () => { $('preset').value = 'free'; $('brief').textContent = brief.free; reset(); };
  for (const id of ['exploration', 'period']) $(id).oninput = () => { $(`${id}-value`).textContent = `${$(id).value}${id === 'period' ? '일' : '%'}`; };
  $('new-seed').onclick = () => { $('seed').value = 1 + Math.floor(Math.random() * 999998); $('preset').value = 'free'; $('brief').textContent = brief.free; reset(); };
  $('reveal').onchange = sync;
  $('column').innerHTML = Array.from({ length: E.COLS }, (_, i) => `<option value="${i}">${i + 1}</option>`).join(''); $('row').innerHTML = Array.from({ length: E.ROWS }, (_, i) => `<option value="${i}">${i + 1}</option>`).join('');
  for (const id of ['column', 'row']) $(id).onchange = () => { selected = Number($('row').value) * E.COLS + Number($('column').value); sync(); };
  document.querySelectorAll('[data-policy]').forEach(b => b.onclick = () => { policy = b.dataset.policy; message(); sync(); });
  $('dig').onclick = () => { E.order(state, selected); $('message').textContent = `세 방식의 1번 탐사대가 다음 날 ${selected % E.COLS + 1}열 ${Math.floor(selected / E.COLS) + 1}행을 시추합니다. 다시 누르면 예약 위치가 바뀝니다.`; sync(); };
  canvas.addEventListener('pointerdown', event => { const r = canvas.getBoundingClientRect(), x = (event.clientX - r.left) * canvas.width / r.width, y = (event.clientY - r.top) * canvas.height / r.height; const col = Math.floor((x - geometry.left) / geometry.cell), row = Math.floor((y - geometry.top) / geometry.cell); if (col >= 0 && col < E.COLS && row >= 0 && row < E.ROWS) { selected = row * E.COLS + col; canvas.focus({ preventScroll: true }); sync(); } });
  canvas.addEventListener('keydown', event => { const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -E.COLS, ArrowDown: E.COLS }; if (event.key in offsets) { event.preventDefault(); event.stopPropagation(); selected = Math.max(0, Math.min(107, selected + offsets[event.key])); sync(); } if (event.key === 'Enter') { event.preventDefault(); $('dig').click(); } });
  $('fullscreen').onclick = () => toggleFull(); $('exit-fullscreen').onclick = () => toggleFull(true);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { $('stage').classList.remove('expanded'); $('exit-fullscreen').hidden = true; } draw(); });
  document.addEventListener('keydown', event => { if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return; if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFull(); } if (event.key === 'Escape') toggleFull(true); if (event.code === 'Space' && event.target.tagName !== 'BUTTON') { event.preventDefault(); if (state.day < E.DAYS) { running = !running; sync(); } } });
  window.addEventListener('resize', responsive);
  function advance(ms) { if (!running) return; elapsed += ms; while (elapsed >= 260 && state.day < E.DAYS) { E.step(state); elapsed -= 260; } if (state.day >= E.DAYS) running = false; message(); sync(); }
  window.advanceTime = ms => { advance(Math.max(0, ms)); return Promise.resolve(); };
  window.render_game_to_text = () => JSON.stringify({ coordinates: '12 columns × 9 rows, origin top-left; zero-based cell = row*12+column', day: state.day, running, config: state.config, visiblePolicy: policy, selectedCell: selected, scheduledDig: state.order, interventions: state.interventions, results: E.summary(state), agents: current().agents.map(a => ({ id: a.id + 1, cell: a.cell, action: a.action, earned: Math.round(a.earned), knownCells: Object.keys(a.known).length })), revealed: $('reveal').checked });
  function frame(time) { if (last) advance(Math.min(100, time - last)); last = time; requestAnimationFrame(frame); }
  applyPreset(); responsive(); requestAnimationFrame(frame);
})();
