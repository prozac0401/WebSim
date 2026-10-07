(() => {
  'use strict';
  let E = window.TreasureLab;
  const $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d');
  let selectedAgent = 0;
  const expedition = () => $('lab-mode').value === 'expedition';
  const evidence = w => $('knowledge-only').checked ? w.agents[selectedAgent].known : w.visited;
  const colors = ['#517849', '#bf8a49', '#637db0', '#a97894', '#49968d', '#a0a447'];
  const presets = { hidden: { seed: 4, terrain: 'hidden', exploration: 35, period: 8 }, simple: { seed: 7319, terrain: 'simple', exploration: 50, period: 8 }, depleting: { seed: 61, terrain: 'depleting', exploration: 65, period: 8 } };
  let state, policy = 'instant', selected = 21, running = false, elapsed = 0, last = 0, geometry;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionEnabled = () => Boolean(window.WebSimAmbient?.enabled) && !reducedMotion.matches;
  let inkClock = 0, trails = [], discoveries = [], miniHits = [], pointerStart = null;
  function resetInk() { inkClock = 0; discoveries = []; trails = state.worlds.map(w => w.agents.map(a => [a.cell])); }
  function stepWithInk() {
    const previous = state.worlds.map(w => new Set(Object.keys(w.visited)));
    if (!E.step(state)) return false;
    state.worlds.forEach((w, wi) => {
      w.agents.forEach((a, ai) => { const trail = trails[wi][ai]; if (trail[trail.length - 1] !== a.cell) { trail.push(a.cell); if (trail.length > 12) trail.shift(); } });
      if (motionEnabled()) for (const cell of Object.keys(w.visited)) if (!previous[wi].has(cell)) discoveries.push({ world: wi, cell: Number(cell), born: inkClock, day: state.day });
    });
    discoveries = discoveries.filter(p => p.day >= state.day - 2).slice(-80);
    return true;
  }
  function runWithInk(count) { for (let i = 0; i < count && stepWithInk(); i++); }
  const previewHome = $('preview').parentNode, toolbarHome = $('toolbar').parentNode;
  const brief = { hidden: '익숙한 광맥 너머에도 보물이 있습니다. ‘100일까지’를 눌러 공유 간격과 총수확의 관계를 비교해 보세요.', simple: '넓은 광맥 하나가 있는 지도입니다. 좋은 장소를 빨리 나누면 어떤 이점이 있는지 확인해 보세요.', depleting: '같은 곳을 계속 채굴하면 자원이 줄어듭니다. 가장 좋은 장소를 아는 것만으로 충분할까요?', free: '조건을 직접 조합해 보세요. 지도 번호가 같으면 지형과 탐색에 쓰는 난수를 그대로 재현합니다.' };
  function config() { return { seed: Number($('seed').value) || 1, terrain: $('terrain').value, exploration: Number($('exploration').value) / 100, period: Number($('period').value), expeditionMap: $('expedition-map').value, budget: Number($('supply').value) }; }
  function reset() { running = false; elapsed = 0; E = expedition() ? window.TreasureExpedition : window.TreasureLab; state = E.create(config()); resetInk(); $('message').textContent = expedition() ? '같은 지형과 보급으로 원정을 시작합니다. 후보지 ?를 고르면 경로와 보급 비용을 먼저 볼 수 있습니다.' : '세 방식이 같은 조건으로 출발합니다. 지도에서 칸을 골라 다음 날의 시추 위치를 지정할 수도 있습니다.'; sync(); }
  function applyPreset() { const p = presets[$('preset').value]; if (p) { $('seed').value = p.seed; $('terrain').value = p.terrain; $('exploration').value = p.exploration; $('period').value = p.period; } $('brief').textContent = brief[$('preset').value]; reset(); }
  function current() { return state.worlds[E.policies.indexOf(policy)]; }
  function message() {
    if (state.day === E.DAYS) { const best = E.summary(state).sort((a, b) => b.total - a.total)[0]; $('message').textContent = `${E.DAYS}일 완료. 이 지도에서는 ${E.labels[best.policy]}의 수확이 가장 많습니다. 지시 개입 ${state.interventions.length}회. 다른 지도나 성향에서도 같은 결과인지 비교해 보세요.`; }
    else if (state.day) { const w = current(); $('message').textContent = `${E.labels[policy]} · 1번 탐사대: ${w.agents[0].action}. ${w.agents[0].cell % E.COLS + 1}열 ${Math.floor(w.agents[0].cell / E.COLS) + 1}행에서 ${Math.round(w.agents[0].earned)} 수확. ${policy === 'independent' ? '기록은 각자 간직합니다.' : `마지막 기록 공유 ${w.lastShared}일.`}`; }
  }
  function next(n = 1) { runWithInk(n); if (state.day >= E.DAYS) running = false; message(); sync(); }
  function sync() {
    const isTrip = expedition();
    $('exploration-help').textContent = isTrip ? '목표를 새로 정할 때 미지 후보를 검토할 확률입니다. 나머지에는 기억한 채굴값과 이동 비용을 비교합니다.' : '좋은 채굴 장소를 알수록 실제 탐색 확률은 내려갑니다. 높은 성향의 탐사대는 더 자주 새 칸을 찾습니다.';
    $('config-help').textContent = isTrip ? '조건을 바꾸면 0일로 돌아갑니다. 원정 지시는 선택한 번호의 탐사대에 세 방식 모두 전달됩니다.' : '조건을 바꾸면 같은 지도 번호에서 0일로 돌아갑니다. 시추 지시는 세 방식의 1번 탐사대에 똑같이 전달됩니다.';
    $('action-help').textContent = isTrip ? '지점 선택 → 경로·비용 확인 → 원정 지시' : '지도 선택 → 시추 지시 · 방향키로 칸 이동';
    $('expedition-settings').hidden = !isTrip; $('preset').parentNode.hidden = isTrip; $('terrain').parentNode.hidden = isTrip;
    $('reveal').disabled = isTrip || $('knowledge-only').checked;
    if (isTrip || $('knowledge-only').checked) $('reveal').checked = false;
    $('brief').textContent = isTrip ? '강은 다리로, 산맥은 고개로 돌아갈 수 있습니다. ?는 미조사 후보지입니다. 지점을 고르고 보급 비용을 확인한 뒤 원정을 지시하세요.' : brief[$('preset').value];
    $('finish').textContent = `${E.DAYS}일까지`; $('dig').textContent = isTrip ? `${selectedAgent + 1}번 탐사대 원정 지시` : '1번 탐사대 시추 지시';
    $('play').textContent = state.day === E.DAYS ? '실험 완료' : running ? '일시정지' : state.day ? '이어서 진행' : '세 방식 함께 시작'; $('play').disabled = state.day === E.DAYS; $('step').disabled = state.day === E.DAYS; $('finish').disabled = state.day === E.DAYS; $('dig').disabled = state.day === E.DAYS;
    $('day-chip').textContent = `${state.day} / ${E.DAYS}일`; $('exploration-value').textContent = `${$('exploration').value}%`; $('period-value').textContent = `${$('period').value}일`;
    document.querySelectorAll('[data-policy]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.policy === policy)));
    const w = current(), value = evidence(w)[selected];
    const observed = value !== undefined || $('reveal').checked;
    const valueLabel = observed ? `${value === undefined ? '미발견 · 관찰값' : '발견값'} ${$('knowledge-only').checked ? Math.round(value) : state.field[selected]}${state.config.depletion && !$('knowledge-only').checked ? ` · 남은 채굴값 ${Math.round(state.field[selected] * w.remaining[selected])}` : ''}` : '미발견';
    $('selected-label').textContent = `선택: ${selected % E.COLS + 1}열 ${Math.floor(selected / E.COLS) + 1}행 · ${valueLabel}${state.order === selected ? ' · 시추 예약됨' : ''}`;
    $('column').value = selected % E.COLS; $('row').value = Math.floor(selected / E.COLS);
    $('mobile-summary').innerHTML = E.summary(state).map(s => `<span>${E.labels[s.policy].replace(' 공유', '').replace(' 탐색', '')}<strong>${s.total.toLocaleString('ko-KR')}</strong></span>`).join('');
    $('results').innerHTML = E.summary(state).map(s => `<div class="result-card ${s.policy === policy ? 'is-active' : ''}"><span>${E.labels[s.policy]} · 총수확</span><strong>${s.total.toLocaleString('ko-KR')}</strong><small>발견 ${s.explored} / 108칸<br>최고 발견값 ${s.best}${isTrip ? `<br>남은 보급 ${s.budget}` : ''}</small></div>`).join('');
    const agent = w.agents[selectedAgent];
    $('agent-note').textContent = `${E.labels[policy]} · ${selectedAgent + 1}번이 아는 ${Object.keys(agent.known).length}칸 · ${agent.action}${isTrip ? ` · 보급 ${agent.budget} · 목표 ${agent.target % 12 + 1}열 ${Math.floor(agent.target / 12) + 1}행. ${agent.reason}` : '. 기본 실험의 시추 지시는 항상 1번에 전달됩니다.'}`;
    $('route-preview').hidden = !isTrip;
    if (isTrip) {
      const previews = state.worlds.map((_, i) => E.preview(state, i, selectedAgent, selected));
      $('route-preview').innerHTML = `<strong>${E.terrainLabels[state.terrain[selected]]} · 자원 ${value === undefined ? '미확인' : Math.round(value)}</strong>` + previews.map((p, i) => `<span>${E.labels[E.policies[i]]}: ${p.reachable ? `${p.days}일 이동 + 채굴 1일 · 보급 ${p.totalCost}/${p.budget}${p.affordable ? '' : ' · 부족'}` : p.reason}</span>`).join('');
      $('dig').disabled = state.day === E.DAYS || !previews.some(p => p.affordable);
    }
    draw();
  }
  function mapValue(w, cell) { if ($('knowledge-only').checked) return evidence(w)[cell]; return state.field[cell] * (state.config.depletion ? w.remaining[cell] : 1); }
  function contours(w, left, top, cell) {
    const seen = i => i in evidence(w) || $('reveal').checked;
    ctx.save(); ctx.strokeStyle = 'rgba(70,100,55,.23)'; ctx.lineWidth = .85;
    for (let y = 0; y < E.ROWS - 1; y++) for (let x = 0; x < E.COLS - 1; x++) {
      const ids = [y * E.COLS + x, y * E.COLS + x + 1, (y + 1) * E.COLS + x + 1, (y + 1) * E.COLS + x];
      // A contour segment may use ONLY four already-visible values. Unknown terrain never enters this drawing.
      if (!ids.every(seen)) continue;
      const values = ids.map(i => mapValue(w, i)), points = [[x + .5, y + .5], [x + 1.5, y + .5], [x + 1.5, y + 1.5], [x + .5, y + 1.5]];
      for (const level of [15, 30, 45, 60, 75, 90]) {
        const crossings = [];
        for (let j = 0; j < 4; j++) { const k = (j + 1) % 4; if ((values[j] < level) === (values[k] < level)) continue; const t = (level - values[j]) / (values[k] - values[j]); crossings.push([left + (points[j][0] + t * (points[k][0] - points[j][0])) * cell, top + (points[j][1] + t * (points[k][1] - points[j][1])) * cell]); }
        for (let j = 0; j + 1 < crossings.length; j += 2) { ctx.beginPath(); ctx.moveTo(...crossings[j]); ctx.lineTo(...crossings[j + 1]); ctx.stroke(); }
      }
    }
    ctx.restore();
  }
  function drawMap(w, left, top, cell, miniature = false, small = false) {
    const wi = E.policies.indexOf(w.policy), visible = i => i in evidence(w) || $('reveal').checked;
    ctx.save(); ctx.beginPath(); ctx.roundRect(left, top, cell * E.COLS, cell * E.ROWS, miniature ? 3 : 8); ctx.clip();
    for (let i = 0; i < state.field.length; i++) {
      const x = left + i % E.COLS * cell, y = top + Math.floor(i / E.COLS) * cell, known = i in evidence(w);
      if (visible(i)) { const val = mapValue(w, i); ctx.fillStyle = `hsl(${58 + val * .30} 30% ${95 - val * .40}%)`; }
      else ctx.fillStyle = '#e8ece2';
      if (expedition() && state.terrain[i] === 'river') ctx.fillStyle = '#b4ced0';
      if (expedition() && state.terrain[i] === 'mountain') ctx.fillStyle = '#d4d0bf';
      if (expedition() && state.terrain[i] === 'bridge') ctx.fillStyle = '#ccac7d';
      if (expedition() && state.terrain[i] === 'pass') ctx.fillStyle = '#e7d9b7';
      ctx.fillRect(x, y, cell + .3, cell + .3);
      ctx.strokeStyle = miniature ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.45)'; ctx.lineWidth = .7; ctx.strokeRect(x, y, cell, cell);
      if (!known && !visible(i) && !miniature) { ctx.fillStyle = '#cbd4c2'; ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, 1, 0, Math.PI * 2); ctx.fill(); }
      if (expedition() && !miniature) {
        ctx.strokeStyle = '#9c9987'; ctx.lineWidth = 1;
        if (state.terrain[i] === 'mountain') { ctx.beginPath(); ctx.moveTo(x + cell * .2, y + cell * .75); ctx.lineTo(x + cell * .5, y + cell * .25); ctx.lineTo(x + cell * .8, y + cell * .75); ctx.stroke(); }
        if (state.terrain[i] === 'bridge') { ctx.strokeStyle = '#896d43'; ctx.beginPath(); ctx.moveTo(x, y + cell * .3); ctx.lineTo(x + cell, y + cell * .3); ctx.moveTo(x, y + cell * .7); ctx.lineTo(x + cell, y + cell * .7); ctx.stroke(); }
        if (state.prospects.includes(i) && !visible(i)) { ctx.fillStyle = '#886d43'; ctx.font = `${Math.max(12, cell * .55)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('?', x + cell / 2, y + cell * .7); ctx.textAlign = 'left'; }
      }
    }
    if (!miniature) {
      contours(w, left, top, cell);
      // These strokes connect successive choices; they do not describe travel through intervening cells.
      ctx.setLineDash(expedition() ? [] : [2, 5]); ctx.lineWidth = 1.05;
      trails[wi].forEach((trail, ai) => { ctx.strokeStyle = colors[ai]; ctx.globalAlpha = .20; ctx.beginPath(); trail.forEach((i, n) => { const x = left + (i % E.COLS + .5) * cell, y = top + (Math.floor(i / E.COLS) + .5) * cell; n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      if (expedition() && w.policy === policy) {
        const planned = E.preview(state, wi, selectedAgent, selected);
        if (planned.reachable) { ctx.strokeStyle = planned.affordable ? '#bd8739' : '#a48680'; ctx.lineWidth = small ? 2 : 3; ctx.setLineDash([4, 3]); ctx.beginPath(); planned.path.forEach((i, n) => { const x = left + (i % 12 + .5) * cell, y = top + (Math.floor(i / 12) + .5) * cell; n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]); }
      }
      if (motionEnabled()) for (const p of discoveries) {
        if (p.world !== wi || !visible(p.cell)) continue;
        const age = (inkClock - p.born) / 1050; if (age < 0 || age >= 1) continue;
        const x = left + (p.cell % E.COLS + .5) * cell, y = top + (Math.floor(p.cell / E.COLS) + .5) * cell;
        ctx.save(); ctx.beginPath(); ctx.rect(left + p.cell % E.COLS * cell, top + Math.floor(p.cell / E.COLS) * cell, cell, cell); ctx.clip();
        ctx.strokeStyle = `rgba(255,255,236,${.7 * (1 - age)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, cell * (.1 + .9 * age), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      for (let i = 0; i < state.field.length; i++) if (visible(i) && !small) {
        const x = left + (i % E.COLS + .5) * cell, y = top + (Math.floor(i / E.COLS) + .5) * cell;
        ctx.fillStyle = i in evidence(w) ? '#465533' : '#859078'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(Math.round($('knowledge-only').checked ? evidence(w)[i] : mapValue(w, i))), x, y + 4); ctx.textAlign = 'left';
      }
      const sx = left + selected % E.COLS * cell, sy = top + Math.floor(selected / E.COLS) * cell;
      ctx.fillStyle = 'rgba(234,202,146,.13)'; ctx.fillRect(sx, sy, cell, cell); ctx.strokeStyle = '#b98641'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1.5, sy + 1.5, cell - 3, cell - 3);
      if (state.order !== null) { ctx.strokeStyle = '#ac7131'; ctx.setLineDash([4, 3]); ctx.strokeRect(left + state.order % E.COLS * cell + 4, top + Math.floor(state.order / E.COLS) * cell + 4, cell - 8, cell - 8); ctx.setLineDash([]); }
    }
    w.agents.forEach(a => {
      const peers = w.agents.filter(b => b.cell === a.cell), offset = peers.findIndex(b => b.id === a.id) - (peers.length - 1) / 2;
      const x = left + (a.cell % E.COLS + .5) * cell + offset * (miniature ? 1.6 : small ? 3.3 : 6), y = top + (Math.floor(a.cell / E.COLS) + .5) * cell;
      if ((expedition() || $('knowledge-only').checked) && a.id === selectedAgent) { ctx.strokeStyle = '#bd8739'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, miniature ? 4 : small ? 7.5 : 11, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = colors[a.id]; ctx.strokeStyle = '#fffef7'; ctx.lineWidth = miniature ? .8 : 1.8; ctx.beginPath(); ctx.arc(x, y, miniature ? 2.4 : small ? 4.8 : 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (!miniature && !small) { ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(a.id + 1), x, y + 3); ctx.textAlign = 'left'; }
    });
    ctx.restore();
  }
  function draw() {
    const small = window.innerWidth < 541, width = Math.max(260, Math.min(900, Math.round($('stage').clientWidth))), compare = !small && width >= 640;
    const margin = small ? 14 : 26, top = small ? 40 : 68, mapWidth = compare ? width - 214 : width - margin * 2;
    const height = small ? Math.max(184, Math.min(282, Math.floor(innerHeight / 2) - 104)) : Math.max(compare ? 484 : 0, Math.ceil(top + mapWidth * .75 + 65));
    const cell = small ? Math.min(mapWidth / E.COLS, (height - 68) / E.ROWS) : mapWidth / E.COLS, left = small ? (width - cell * E.COLS) / 2 : margin;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    geometry = { left, top, cell }; miniHits = [];
    ctx.fillStyle = '#f6f6ed'; ctx.fillRect(0, 0, width, height);
    // Paper grain uses coordinates only, never undiscovered resource values.
    ctx.fillStyle = 'rgba(91,101,69,.045)';
    for (let y = 5; y < height; y += 9) for (let x = 4; x < width; x += 13) { const r = E.random(149, x, y); ctx.fillRect(x + r * 4, y + r * 3, .65, .65); }
    ctx.fillStyle = '#344831'; ctx.font = `600 ${small ? 15 : 20}px sans-serif`; ctx.fillText(E.labels[policy], margin, small ? 24 : 29);
    ctx.fillStyle = '#7c876f'; ctx.font = '12px sans-serif';
    if (small) { ctx.textAlign = 'right'; ctx.fillText(`${state.day} / ${E.DAYS}일`, width - margin, 24); ctx.textAlign = 'left'; }
    else ctx.fillText(expedition() ? '강·산지·통로는 공개, 자원은 도착해 조사해야 압니다' : '발견한 지형 위에 선택의 기록이 남습니다', margin, 49);
    drawMap(current(), left, top, cell, false, small);
    const bottom = top + cell * E.ROWS + (small ? 18 : 24);
    ctx.fillStyle = '#77836b'; ctx.font = '12px sans-serif'; ctx.fillText(expedition() ? '황금 점선: 예상 경로 · 색 실선: 실제 이동' : small ? '점선: 선택 이력 · 이동 경로 아님' : '점선은 최근 선택의 연결입니다. 실제 이동 경로가 아닙니다.', margin, bottom);
    if (!small) ctx.fillText(expedition() ? '△ 산지 3일 · 다리/고개/평지 1일 · 이동 중 채굴 없음' : $('reveal').checked ? '지형 공개 중 · 탐사대의 지식은 그대로' : '● 탐사대 6명 · 등고선은 발견한 값만 연결합니다', margin, bottom + 21);
    if (compare) {
      const mx = width - 168, mw = 142, mc = (mw - 16) / E.COLS, mh = mc * E.ROWS + 41;
      ctx.fillStyle = '#7c876f'; ctx.font = '12px sans-serif'; ctx.fillText('같은 날, 세 방식', mx, 29);
      state.worlds.forEach((w, i) => {
        const my = 44 + i * (mh + 8);
        ctx.fillStyle = w.policy === policy ? '#edf1e5' : '#fbfcf6'; ctx.strokeStyle = w.policy === policy ? '#869c72' : '#d8dfcf'; ctx.lineWidth = w.policy === policy ? 1.5 : .8;
        ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 9); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#526347'; ctx.font = '12px sans-serif'; ctx.fillText(E.labels[w.policy], mx + 8, my + 17);
        drawMap(w, mx + 8, my + 25, mc, true);
        ctx.fillStyle = '#7a866e'; ctx.font = '10px sans-serif'; ctx.fillText(`발견 ${Object.keys(w.visited).length}칸 · 최고 ${w.best}`, mx + 8, my + mh - 5);
        miniHits.push({ x: mx, y: my, width: mw, height: mh, policy: w.policy });
      });
    }
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
  $('lab-mode').onchange = reset;
  $('expedition-map').onchange = reset; $('supply').onchange = reset;
  $('agent').onchange = () => { selectedAgent = Number($('agent').value); sync(); };
  $('knowledge-only').onchange = sync;
  for (const id of ['terrain', 'exploration', 'period', 'seed']) $(id).onchange = () => { $('preset').value = 'free'; $('brief').textContent = brief.free; reset(); };
  for (const id of ['exploration', 'period']) $(id).oninput = () => { $(`${id}-value`).textContent = `${$(id).value}${id === 'period' ? '일' : '%'}`; };
  $('new-seed').onclick = () => { $('seed').value = 1 + Math.floor(Math.random() * 999998); $('preset').value = 'free'; $('brief').textContent = brief.free; reset(); };
  $('reveal').onchange = sync;
  $('column').innerHTML = Array.from({ length: E.COLS }, (_, i) => `<option value="${i}">${i + 1}</option>`).join(''); $('row').innerHTML = Array.from({ length: E.ROWS }, (_, i) => `<option value="${i}">${i + 1}</option>`).join('');
  for (const id of ['column', 'row']) $(id).onchange = () => { selected = Number($('row').value) * E.COLS + Number($('column').value); sync(); };
  document.querySelectorAll('[data-policy]').forEach(b => b.onclick = () => { policy = b.dataset.policy; message(); sync(); });
  $('dig').onclick = () => { if (E.order(state, selected, selectedAgent)) { $('message').textContent = expedition() ? `세 방식의 ${selectedAgent + 1}번 탐사대에 같은 목표를 보냈습니다. 이동·채굴 보급이 가능한 방식에서 실행하며, 원정 도중 새 지시는 경로를 바꿉니다.` : `세 방식의 1번 탐사대가 다음 날 ${selected % E.COLS + 1}열 ${Math.floor(selected / E.COLS) + 1}행을 시추합니다. 다시 누르면 예약 위치가 바뀝니다.`; sync(); } };
  canvas.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; });
  canvas.addEventListener('pointermove', event => { if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 9) pointerStart = null; });
  canvas.addEventListener('pointerup', event => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return; pointerStart = null;
    const r = canvas.getBoundingClientRect(), x = (event.clientX - r.left) * canvas.width / r.width, y = (event.clientY - r.top) * canvas.height / r.height;
    const mini = miniHits.find(m => x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.height);
    if (mini) { policy = mini.policy; message(); sync(); return; }
    const col = Math.floor((x - geometry.left) / geometry.cell), row = Math.floor((y - geometry.top) / geometry.cell);
    if (col >= 0 && col < E.COLS && row >= 0 && row < E.ROWS) { selected = row * E.COLS + col; canvas.focus({ preventScroll: true }); sync(); }
  });
  canvas.addEventListener('keydown', event => { const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -E.COLS, ArrowDown: E.COLS }; if (event.key in offsets) { event.preventDefault(); event.stopPropagation(); selected = Math.max(0, Math.min(107, selected + offsets[event.key])); sync(); } if (event.key === 'Enter') { event.preventDefault(); $('dig').click(); } });
  $('fullscreen').onclick = () => toggleFull(); $('exit-fullscreen').onclick = () => toggleFull(true);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { $('stage').classList.remove('expanded'); $('exit-fullscreen').hidden = true; } draw(); });
  document.addEventListener('keydown', event => { if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return; if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFull(); } if (event.key === 'Escape') toggleFull(true); if (event.code === 'Space' && event.target.tagName !== 'BUTTON') { event.preventDefault(); if (state.day < E.DAYS) { running = !running; sync(); } } });
  window.addEventListener('resize', responsive);
  function advance(ms) { if (!running) return; elapsed += ms; let changed = false; while (elapsed >= 260 && state.day < E.DAYS) { stepWithInk(); elapsed -= 260; changed = true; } if (state.day >= E.DAYS) running = false; if (changed) { message(); sync(); } }
  function advanceInk(ms) { if (!motionEnabled()) return; inkClock += ms; const active = discoveries.length; discoveries = discoveries.filter(p => inkClock - p.born < 1050); if (active) draw(); }
  function motionChanged() { if (!motionEnabled()) discoveries = []; draw(); }
  window.addEventListener('websim:ambient-change', motionChanged); reducedMotion.addEventListener('change', motionChanged);
  window.advanceTime = ms => { const dt = Math.max(0, ms); advance(dt); advanceInk(dt); return Promise.resolve(); };
  window.render_game_to_text = () => JSON.stringify({ coordinates: '12 columns × 9 rows, origin top-left; zero-based cell = row*12+column', mode: expedition() ? 'expedition' : 'sharing', day: state.day, running, config: state.config, visiblePolicy: policy, selectedAgent, knowledgeOnly: $('knowledge-only').checked, selectedCell: selected, scheduledDig: state.order, interventions: state.interventions, results: E.summary(state), agents: current().agents.map(a => ({ id: a.id + 1, cell: a.cell, action: a.action, earned: Math.round(a.earned), knownCells: Object.keys(a.known).length, budget: a.budget, target: a.target, route: a.route, reason: a.reason })), routePreview: expedition() ? E.preview(state, E.policies.indexOf(policy), selectedAgent, selected) : null, publicTerrain: state.terrain, visibleResources: evidence(current()), revealed: $('reveal').checked, art: { motion: motionEnabled(), discoveryRipples: discoveries.length, comparisonMinimaps: miniHits.length, visibleMap: geometry, choiceHistory: trails[E.policies.indexOf(policy)] } });
  function frame(time) { if (last) { const dt = Math.min(100, time - last); advance(dt); advanceInk(dt); } last = time; requestAnimationFrame(frame); }
  if (new URLSearchParams(location.search).get('mode') === 'expedition') $('lab-mode').value = 'expedition';
  applyPreset(); responsive(); requestAnimationFrame(frame);
})();
