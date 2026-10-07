(() => {
  'use strict';
  const E = window.AntEngine, $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d'), stage = $('stage');
  let state = E.create(), running = false, accumulator = 0, manualClock = false, last = performance.now(), width = 840;
  let selectedCell = state.nest, selectedAnt = null, undo = null, startingPatches = [], pinned = null, pointer = null, lastPaint = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const ambient = () => Boolean(window.WebSimAmbient?.enabled);
  const motionTime = () => ambient() ? (window.WebSimAmbient?.now?.() || 0) / 1000 : 0;
  const format = n => n.toFixed(2);
  const nameCell = i => `(${i % 30 + 1}, ${Math.floor(i / 30) + 1})`;
  const message = text => { $('message').textContent = text; };
  function stop() { running = false; accumulator = 0; }
  function settings() { return { count: +$('antCount').value, amount: +$('nutrientAmount').value, interval: +$('nutrientInterval').value, supply: $('patchEnabled').checked }; }
  function selectors() {
    $('inspect').replaceChildren(new Option(`셀 ${nameCell(selectedCell)}`, 'cell'), ...state.ants.map(a => new Option(`개미 ${a.id + 1}`, String(a.id))));
    $('inspect').value = selectedAnt === null ? 'cell' : String(selectedAnt);
    $('cellX').value = selectedCell % 30 + 1; $('cellY').value = Math.floor(selectedCell / 30) + 1;
  }
  function reset(preset) {
    stop(); undo = null;
    const seed = Math.max(1, Math.min(999999, Math.round(+$('seed').value) || 73)); $('seed').value = seed;
    if (preset) { startingPatches = []; state = E.create({ seed, preset, settings: settings() }); }
    else { state = E.create({ seed, preset: state.preset, settings: settings(), walls: state.walls, nest: state.nest }); startingPatches.forEach(p => E.addPatch(state, p.cell, p.amount)); }
    selectedCell = state.nest; selectedAnt = null; selectors(); $('preset').value = state.preset;
    message('같은 시드로 준비했습니다. 현재 벽·둥지와 시작 전 직접 놓은 패치를 유지합니다.'); render();
  }
  function remember() { stop(); undo = { state: clone(state), startingPatches: clone(startingPatches), selectedCell, selectedAnt }; }
  function editCell(cell) {
    const tool = $('tool').value;
    if (tool === 'view') { selectedCell = cell; selectedAnt = null; selectors(); return; }
    if (tool === 'food') {
      if (cell === state.nest) { message('둥지 밖의 셀에 놓아 주세요. 패치의 30%는 주변 유기물로 들어갑니다.'); return; }
      remember(); E.addPatch(state, cell, +$('nutrientAmount').value); if (state.tick === 0) startingPatches.push({ cell, amount: +$('nutrientAmount').value });
      selectedCell = cell; selectedAnt = null; message(state.lastEvent + ' · 편집 취소로 되돌릴 수 있습니다.');
    } else if (tool === 'nest') {
      if (state.tick !== 0) { message('둥지는 시작 전에 옮깁니다. 같은 시드 다시로 준비 상태를 만든 뒤 옮겨 주세요.'); return; }
      if (startingPatches.some(p => p.cell === cell)) { message('직접 놓은 패치와 겹치지 않는 셀에 둥지를 옮겨 주세요.'); return; }
      if (cell === state.nest) return;
      remember(); state = E.create({ seed: state.seed, preset: state.preset, settings: state.settings, walls: state.walls, nest: cell }); startingPatches.forEach(p => E.addPatch(state, p.cell, p.amount));
      selectedCell = cell; selectedAnt = null; message(`초기 둥지를 ${nameCell(cell)}로 옮겼습니다. 같은 시드에서 초기 자원을 다시 배치했습니다.`);
    }
    selectors();
  }
  function paintEdge(a, b) {
    const mask = $('tool').value === 'erase' ? 0 : +$('wallType').value;
    const k = E.key(a, b); if (lastPaint?.has(k)) return; lastPaint?.add(k);
    if (E.setWall(state, a, b, mask)) { $('preset').value = 'free'; message(`${mask ? '셀 사이 벽을 그렸습니다' : '셀 사이 벽을 지웠습니다'}. 개미와 양분 재고는 그대로입니다. 실행하면 편집 취소가 해제됩니다.`); }
  }
  function closestEdge(p) {
    const x = Math.min(29.999, Math.max(.001, p.x)), y = Math.min(29.999, Math.max(.001, p.y));
    if (Math.abs(x - Math.round(x)) <= Math.abs(y - Math.round(y))) { const line = Math.round(x), row = Math.floor(y); if (line > 0 && line < 30) paintEdge(row * 30 + line - 1, row * 30 + line); }
    else { const line = Math.round(y), col = Math.floor(x); if (line > 0 && line < 30) paintEdge((line - 1) * 30 + col, line * 30 + col); }
  }
  function toolChanged() {
    stop(); pointer = null; const tool = $('tool').value;
    canvas.classList.toggle('drawing', tool === 'wall' || tool === 'erase'); $('wallType').disabled = tool !== 'wall';
    $('tool-help').textContent = { view: '개미나 셀을 누르면 현재 행동과 양분 이동을 읽습니다. 보기 모드에서는 위아래로 스크롤할 수 있습니다.', food: '셀 안을 탭해 양분을 놓습니다. 총량은 투입한 만큼 증가합니다. 시작 전에 놓으면 같은 시드 다시에도 유지됩니다.', nest: '시작 전(0스텝)에 셀 안을 탭하면 둥지를 옮깁니다. 초기 개미와 자원을 같은 시드로 다시 만듭니다.', wall: '셀 사이의 선을 따라 드래그하세요. 한 번의 드래그 전체가 한 번의 편집입니다. 이 모드에서만 지도 스크롤이 잠깁니다.', erase: '지울 벽을 따라 드래그하세요. 양분·개미는 없어지지 않습니다. 보기 모드로 돌아가면 페이지를 스크롤할 수 있습니다.' }[tool]; render();
  }
  function simulate(n) { undo = null; for (let i = 0; i < n; i++) E.step(state); }
  function position(event) { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width * 30, y: (event.clientY - r.top) / r.height * 30 }; }
  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    const p = position(event), drawing = ['wall', 'erase'].includes($('tool').value);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, p, drawing };
    if (drawing) { event.preventDefault(); remember(); lastPaint = new Set(); canvas.setPointerCapture(event.pointerId); closestEdge(p); render(); }
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) pointer.moved = true;
    if (pointer.drawing) { event.preventDefault(); const p = position(event), old = pointer.p, n = Math.max(1, Math.ceil(Math.hypot(p.x - old.x, p.y - old.y) * 4)); for (let i = 1; i <= n; i++) closestEdge({ x: old.x + (p.x - old.x) * i / n, y: old.y + (p.y - old.y) * i / n }); pointer.p = p; render(); }
  });
  canvas.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const active = pointer; pointer = null; lastPaint = null;
    if (!active.drawing && !active.moved) {
      const p = position(event); if (p.x < 0 || p.y < 0 || p.x >= 30 || p.y >= 30) return;
      const cell = Math.floor(p.y) * 30 + Math.floor(p.x);
      if ($('tool').value === 'view') {
        const nearest = state.ants.reduce((best, a) => Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? a : best, state.ants[0]);
        selectedCell = cell; selectedAnt = Math.hypot(nearest.x - p.x, nearest.y - p.y) < Math.max(.42, 7 / width * 30) ? nearest.id : null; selectors();
      } else editCell(cell);
    }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); render();
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; lastPaint = null; });
  $('applyCell').onclick = () => {
    const x = Math.round(+$('cellX').value), y = Math.round(+$('cellY').value);
    if (x < 1 || x > 30 || y < 1 || y > 30 || !Number.isFinite(x + y)) { message('가로·세로 칸은 1부터 30 사이 정수입니다.'); return; }
    const cell = (y - 1) * 30 + x - 1;
    if (['wall', 'erase'].includes($('tool').value)) {
      const offset = { right: 1, left: -1, bottom: 30, top: -30 }[$('edgeDirection').value], to = cell + offset;
      if (!E.neighbors(cell).includes(to)) { message('바깥 테두리는 원래 통행·확산이 막혀 있습니다. 안쪽 면을 골라 주세요.'); return; }
      remember(); paintEdge(cell, to); selectedCell = cell;
    } else editCell(cell); render();
  };
  $('tool').onchange = toolChanged;
  $('inspect').onchange = () => { selectedAnt = $('inspect').value === 'cell' ? null : +$('inspect').value; render(); };
  $('undo').onclick = () => { if (!undo) return; stop(); state = undo.state; startingPatches = undo.startingPatches; selectedCell = undo.selectedCell; selectedAnt = undo.selectedAnt; undo = null; selectors(); $('preset').value = state.preset; message('직전 편집을 되돌렸습니다. 편집 전 재고·벽·시드를 복원했습니다.'); render(); };
  $('startBtn').onclick = () => { $('tool').value = 'view'; toolChanged(); undo = null; running = true; last = performance.now(); render(); };
  $('stopBtn').onclick = () => { stop(); render(); };
  $('stepBtn').onclick = () => { stop(); simulate(1); render(); };
  $('secondBtn').onclick = () => { stop(); simulate(30); render(); };
  $('resetBtn').onclick = () => reset(); $('preset').onchange = () => reset($('preset').value);
  $('antCount').oninput = () => { $('antCountLabel').textContent = $('antCount').value; };
  $('nutrientAmount').oninput = () => { undo = null; state.settings.amount = +$('nutrientAmount').value; $('nutrientAmountLabel').textContent = $('nutrientAmount').value; render(); };
  $('nutrientInterval').oninput = () => { undo = null; state.settings.interval = +$('nutrientInterval').value; state.nextPatch = state.tick + state.settings.interval * 30; $('nutrientIntervalLabel').textContent = $('nutrientInterval').value; render(); };
  $('patchEnabled').onchange = () => { undo = null; state.settings.supply = $('patchEnabled').checked; render(); };
  $('compare').onclick = () => { pinned = { seed: state.seed, tick: state.tick, walls: Object.keys(state.walls).length, total: E.totals(state), delivered: state.delivered }; render(); };
  $('save').onclick = () => { draw(); const a = document.createElement('a'); a.download = `ant-soil-${state.seed}-${state.tick}.png`; a.href = canvas.toDataURL('image/png'); a.click(); };
  async function fullscreen() { if (document.fullscreenElement) await document.exitFullscreen(); else if (stage.classList.contains('expanded')) stage.classList.remove('expanded'); else { try { await stage.requestFullscreen(); } catch { stage.classList.add('expanded'); } } resize(); }
  $('fullscreen').onclick = fullscreen; $('exit-fullscreen').onclick = fullscreen;
  document.addEventListener('fullscreenchange', resize);
  document.addEventListener('keydown', event => { if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return; if (event.key.toLowerCase() === 'f') { event.preventDefault(); fullscreen(); } if (event.key === 'Escape' && stage.classList.contains('expanded')) { stage.classList.remove('expanded'); resize(); } if (event.code === 'Space') { event.preventDefault(); (running ? $('stopBtn') : $('startBtn')).click(); } if (event.key === 'ArrowRight') { event.preventDefault(); $('stepBtn').click(); } });
  function resize() { width = Math.max(200, Math.round(canvas.getBoundingClientRect().width || 840)); const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(width * dpr); canvas.height = canvas.width; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render(); }
  function line(x1, y1, x2, y2, color, size = 1) { ctx.strokeStyle = color; ctx.lineWidth = size; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function circle(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function draw() {
    const c = width / 30, time = motionTime(); ctx.clearRect(0, 0, width, width); ctx.fillStyle = '#edf2e5'; ctx.fillRect(0, 0, width, width);
    state.soil.forEach((cell, i) => {
      const x = i % 30 * c, y = Math.floor(i / 30) * c;
      if (cell.org > .001) { ctx.fillStyle = `rgba(179,139,73,${Math.min(.38, cell.org * .11)})`; ctx.fillRect(x, y, c, c); }
      if (cell.nit > .001) { ctx.fillStyle = `rgba(68,135,88,${Math.min(.5, cell.nit * .2)})`; ctx.fillRect(x, y, c, c); }
    });
    for (let i = 0; i <= 30; i++) { line(i * c, 0, i * c, width, '#d8e1cf', .5); line(0, i * c, width, i * c, '#d8e1cf', .5); }
    state.soil.forEach((cell, i) => {
      if (cell.plant < .035 || i === state.nest) return;
      const x = (i % 30 + .5) * c, y = (Math.floor(i / 30) + .75) * c, h = Math.min(c * 1.5, c * (.35 + Math.sqrt(cell.plant) * .7)), sway = Math.sin(time * .6 + i) * h * .045;
      line(x, y, x + sway, y - h, '#728552', Math.max(.7, c * .055)); ctx.fillStyle = '#95b477'; ctx.beginPath(); ctx.ellipse(x + sway - h * .15, y - h * .7, h * .23, h * .11, -.6, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + sway + h * .16, y - h * .9, h * .25, h * .13, .5, 0, Math.PI * 2); ctx.fill();
    });
    state.foods.forEach(f => { const x = (f.cell % 30 + .5) * c, y = (Math.floor(f.cell / 30) + .5) * c, r = Math.max(2.5, c * (.2 + .4 * f.amount / f.initial)); ctx.fillStyle = '#9870ac'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); });
    const nx = (state.nest % 30 + .5) * c, ny = (Math.floor(state.nest / 30) + .5) * c; circle(nx, ny, c * .68, '#ba9b73'); circle(nx, ny, c * .35, '#81664a'); circle(nx - c * .05, ny + c * .05, c * .17, '#5f503d');
    Object.entries(state.walls).forEach(([k, mask]) => {
      const [a, b] = k.split(':').map(Number), vertical = b - a === 1, x = (a % 30 + (vertical ? 1 : 0)) * c, y = (Math.floor(a / 30) + (vertical ? 0 : 1)) * c;
      ctx.setLineDash(mask === 2 ? [Math.max(2, c * .2), Math.max(1, c * .12)] : []);
      line(x, y, x + (vertical ? 0 : c), y + (vertical ? c : 0), { 1: '#9b744c', 2: '#4b819c', 3: '#82648f' }[mask], Math.max(2, c * .17)); ctx.setLineDash([]);
    });
    if (selectedAnt !== null) {
      const a = state.ants[selectedAnt]; if (a?.goal >= 0) { const route = E.path(state, E.cellOf(a), a.goal); ctx.setLineDash([4, 4]); for (let j = 1; j < route.length; j++) line((route[j - 1] % 30 + .5) * c, (Math.floor(route[j - 1] / 30) + .5) * c, (route[j] % 30 + .5) * c, (Math.floor(route[j] / 30) + .5) * c, '#bd6b91', 1.8); ctx.setLineDash([]); }
    } else { ctx.strokeStyle = '#3e7054'; ctx.lineWidth = 2; ctx.strokeRect(selectedCell % 30 * c + 1, Math.floor(selectedCell / 30) * c + 1, c - 2, c - 2); }
    state.ants.forEach(a => {
      const t = running && ambient() ? Math.min(1, accumulator / (1000 / 30)) : 1, x = (a.previousX + (a.x - a.previousX) * t) * c, y = (a.previousY + (a.y - a.previousY) * t) * c, size = Math.max(2, c * .22);
      if (a.id === selectedAnt) { ctx.strokeStyle = '#bf7499'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, y, Math.max(7, size * 2.5), 0, Math.PI * 2); ctx.stroke(); }
      ctx.save(); ctx.translate(x, y); ctx.rotate(a.direction); const color = a.carryAmount > 0 ? '#b45d88' : '#40543d';
      for (let j = -1; j <= 1; j++) { line(j * size * .55, 0, j * size * .8, -size, color, .7); line(j * size * .55, 0, j * size * .8, size, color, .7); }
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(-size * .55, 0, size * .65, size * .46, 0, 0, Math.PI * 2); ctx.fill(); circle(size * .35, 0, size * .42, color); circle(size * .95, 0, size * .31, color); if (a.carryAmount > 0) circle(size * 1.5, 0, size * .4, '#c994bd'); ctx.restore();
    });
  }
  function render() {
    draw(); const t = E.totals(state);
    $('startBtn').disabled = running; $('stopBtn').disabled = !running; $('undo').disabled = !undo; $('ant-status').textContent = running ? '실행 중' : state.tick ? '멈춤' : '실험 준비';
    $('carrying-count').textContent = state.ants.filter(a => a.carryAmount > 0).length; $('soil-stock').textContent = (t.organic + t.available).toFixed(1); $('plant-stock').textContent = t.plant.toFixed(1); $('model-time').textContent = `${(state.tick / 30).toFixed(1)}s`;
    $('food-stock').textContent = `${format(t.food)} / ${format(t.carried)}`; $('balance-total').textContent = `${format(t.total)} / ${format(t.input)}`; $('balance-error').textContent = Math.abs(t.error).toFixed(6); $('delivered-stock').textContent = format(state.delivered); $('brief').textContent = E.PRESETS[state.preset].brief;
    if (selectedAnt === null) {
      const q = E.inspectCell(state, selectedCell), transport = q.edges.filter(e => e.wall & 1).length, diffusion = q.edges.filter(e => e.wall & 2).length;
      $('entity-info').textContent = `셀 ${nameCell(selectedCell)}${selectedCell === state.nest ? ' · 둥지' : ''} · 유기물 ${format(q.org)} → 이용 가능 양분 ${format(q.nit)} → 식물 ${format(q.plant)}. 패치 잔량 ${format(q.food)}. 다음 스텝 분해 ${format(q.mineralNext)}, 흡수 ${format(q.uptakeBeforeReturn)}. 운반 차단 ${transport}면 · 확산 차단 ${diffusion}면. 막힌 확산 몫은 이 셀에 남습니다.`;
    } else {
      const a = state.ants[selectedAnt]; $('entity-info').textContent = `개미 ${a.id + 1} · ${a.mode} · 셀 ${nameCell(E.cellOf(a))}. 운반 중 ${format(a.carryAmount)}, 누적 하역 ${format(a.delivered)}. ${a.reason}`;
    }
    if (pinned) $('comparison').textContent = `보관: 시드 ${pinned.seed} · ${(pinned.tick / 30).toFixed(1)}초 · 벽 ${pinned.walls}면 · 투입 ${format(pinned.total.input)} · 식물 ${format(pinned.total.plant)} · 운반 완료 ${format(pinned.delivered)}. 현재: 시드 ${state.seed} · ${(state.tick / 30).toFixed(1)}초 · 벽 ${Object.keys(state.walls).length}면 · 투입 ${format(t.input)} · 식물 ${format(t.plant)} · 운반 완료 ${format(state.delivered)}.${state.tick !== pinned.tick ? ' 시간이 다릅니다. 같은 시간에서 비교하세요.' : ''}`;
  }
  window.render_game_to_text = () => JSON.stringify({ mode: 'ant-nutrient', coordinates: '30×30 cells; origin top-left, x right, y down; canvas units CSS px; cell indices 0-based', running, tick: state.tick, seed: state.seed, ant_count: state.ants.length, time_seconds: state.tick / 30, tool: $('tool').value, touch_action: getComputedStyle(canvas).touchAction, canvas: { width, height: width }, nest: state.nest, walls: state.walls, stocks: E.totals(state), delivered: state.delivered, selectedCell, selectedAnt, selected: selectedAnt === null ? E.inspectCell(state, selectedCell) : state.ants[selectedAnt], foods: state.foods, ants: state.ants.map(a => ({ id: a.id, x: a.x, y: a.y, carry: a.carryAmount, mode: a.mode, goal: a.goal })), canUndo: Boolean(undo), startingPatches, ambient: ambient(), nonnegative: state.soil.every(c => c.org >= 0 && c.nit >= 0 && c.plant >= 0) && state.foods.every(f => f.amount >= 0) && state.ants.every(a => a.carryAmount >= 0) });
  function advance(ms) { if (running) { accumulator += ms; while (accumulator + 1e-7 >= 1000 / 30) { simulate(1); accumulator -= 1000 / 30; } } }
  window.advanceTime = ms => { manualClock = true; advance(Math.max(0, +ms || 0)); render(); };
  function frame(now) { if (!manualClock) advance(Math.min(100, now - last)); last = now; if (running) render(); else if (ambient()) draw(); requestAnimationFrame(frame); }
  window.addEventListener('resize', resize); window.addEventListener('websim:ambient-change', render);
  selectors(); toolChanged(); resize(); requestAnimationFrame(frame);
})();
