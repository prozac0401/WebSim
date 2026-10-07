(() => {
  'use strict';
  const E = window.AuxeticEngine, $ = id => document.getElementById(id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d'), state = E.createState();
  const C = { green: '#21654f', mint: '#c5d8b8', light: '#dde8cf', ink: '#293d35', muted: '#718077', line: '#bbc8b6', coral: '#bc6661', blue: '#497eaa', bg: '#f5f6f1' };
  canvas.style.touchAction="pan-y";
  let drag = null, view = null, lastSuccess = false, pinned = null;
  const signed = n => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
  const message = text => { $('message').textContent = text; };
  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function path(points) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(view.cx + p.x * view.scale, view.cy + p.y * view.scale) : ctx.moveTo(view.cx + p.x * view.scale, view.cy + p.y * view.scale)); ctx.closePath();
  }
  function rectangle(w, h, color, dash, lineWidth = 1.5) {
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.setLineDash(dash);
    ctx.strokeRect(view.cx - w * view.scale / 2, view.cy - h * view.scale / 2, w * view.scale, h * view.scale); ctx.setLineDash([]);
  }
  function dimension(x1, y1, x2, y2, label, vertical = false) {
    ctx.save(); ctx.strokeStyle = C.green; ctx.fillStyle = C.green; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    if (vertical) { ctx.moveTo(x1 - 5, y1); ctx.lineTo(x1 + 5, y1); ctx.moveTo(x2 - 5, y2); ctx.lineTo(x2 + 5, y2); }
    else { ctx.moveTo(x1, y1 - 5); ctx.lineTo(x1, y1 + 5); ctx.moveTo(x2, y2 - 5); ctx.lineTo(x2, y2 + 5); }
    ctx.stroke(); ctx.translate((x1 + x2) / 2, (y1 + y2) / 2); if (vertical) ctx.rotate(-Math.PI / 2);
    ctx.font = '600 17px sans-serif'; ctx.textAlign = 'center';
    const width = ctx.measureText(label).width + 18; roundRect(-width / 2, -15, width, 25, 5, C.bg); ctx.fillStyle = C.green; ctx.fillText(label, 0, 3); ctx.restore();
  }
  function drawHandle(x, locked) {
    const half = view.mobile ? 22 : 20;
    ctx.lineWidth = 2; roundRect(x - half, view.cy - 31, half * 2, 62, 15, locked ? '#f5e5df' : '#ffffff', locked ? C.coral : C.green);
    ctx.strokeStyle = locked ? C.coral : C.green; ctx.beginPath();
    for (const dx of [-5, 0, 5]) { ctx.moveTo(x + dx, view.cy - 10); ctx.lineTo(x + dx, view.cy + 10); } ctx.stroke();
  }
  function render() {
    const g = E.geometry(state), result = E.evaluateMission(state), r = Math.hypot(state.aspect, 1);
    const mobile = window.innerWidth <= 620, width = mobile ? Math.max(240, $('stage').clientWidth - 2) : 900, height = mobile ? 430 : 660, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = { mobile, width, height, cx: width / 2, cy: mobile ? 220 : 330, scale: Math.min((mobile ? width - 128 : 660) / (E.COLS * r), (mobile ? 225 : 410) / (E.ROWS * r)) };
    const left = view.cx - g.width * view.scale / 2, right = view.cx + g.width * view.scale / 2;
    const top = view.cy - g.height * view.scale / 2, bottom = view.cy + g.height * view.scale / 2;
    view.leftHandle = left - 34; view.rightHandle = right + 34;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#e5ebe0';
    for (let x = 20; x < width; x += 28) for (let y = 95; y < height - 82; y += 28) { ctx.beginPath(); ctx.arc(x, y, .7, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = mobile ? '12px sans-serif' : '14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = C.green; ctx.fillText('● 회전하는 판', mobile ? 14 : 30, mobile ? 23 : 32); ctx.fillStyle = C.muted; ctx.fillText('┄ 기준 외곽', mobile ? 153 : 176, mobile ? 23 : 32);
    if ($('comparison').checked) { ctx.fillStyle = C.coral; ctx.fillText('┄ 면적 일정 비교막', mobile ? 14 : 311, mobile ? 45 : 32); }
    if (result.active) { ctx.fillStyle = C.blue; ctx.fillText('┄ 목표 창', mobile ? 153 : 516, mobile ? 45 : 32); }
    ctx.fillStyle = C.muted; ctx.font = mobile ? '11px sans-serif' : '15px sans-serif'; ctx.fillText(state.mission === 'turn' ? '기준: 이 구조가 가장 높은 상태' : '기준: 판을 완전히 닫은 상태', mobile ? 14 : 30, mobile ? 69 : 63);
    if (!mobile) { ctx.textAlign = 'right'; ctx.fillText(`판 ${E.COLS} × ${E.ROWS} · 연결 ${g.hinges.length}개`, 870, 63); }
    for (const cell of g.cells) {
      path(cell.vertices); ctx.fillStyle = cell.sign > 0 ? C.mint : C.light; ctx.fill(); ctx.strokeStyle = '#73916e'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(33,101,79,.20)'; ctx.beginPath(); ctx.arc(view.cx + cell.x * view.scale, view.cy + cell.y * view.scale, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    if(pinned&&pinned.aspect===state.aspect){ctx.save();ctx.strokeStyle='#86669e';ctx.lineWidth=1.6;ctx.globalAlpha=.65;ctx.setLineDash([3,4]);for(const cell of pinned.cells){path(cell.vertices);ctx.stroke();}ctx.restore();}
    rectangle(g.referenceWidth, g.referenceHeight, '#9ba898', [4, 7]);
    if ($('comparison').checked) rectangle(g.width, g.comparisonHeight, C.coral, [10, 6], 2);
    if (result.active) rectangle(result.target.width, result.target.height, C.blue, [4, 4], 2.5);
    for (const h of g.hinges) {
      const x = view.cx + h.x * view.scale, y = view.cy + h.y * view.scale, locked = state.locked.includes(h.id), selected = h.id === state.selected;
      if (selected) { ctx.beginPath(); ctx.arc(x, y, mobile ? 9 : 12, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x, y, locked ? 7 : mobile ? 3 : 4, 0, Math.PI * 2); ctx.fillStyle = locked ? C.coral : C.green; ctx.fill();
      if (locked) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 2.5, y - 2.5); ctx.lineTo(x + 2.5, y + 2.5); ctx.moveTo(x - 2.5, y + 2.5); ctx.lineTo(x + 2.5, y - 2.5); ctx.stroke(); }
    }
    dimension(left, top - 29, right, top - 29, `${g.width.toFixed(2)} u`);
    if (mobile) { ctx.fillStyle = C.green; ctx.font = '600 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`높이 ${g.height.toFixed(2)} u`, view.cx, bottom + 26); }
    else dimension(right + 70, top, right + 70, bottom, `${g.height.toFixed(2)} u`, true);
    drawHandle(view.leftHandle, state.locked.length); drawHandle(view.rightHandle, state.locked.length);
    const response = state.locked.length ? '연결이 잠겨 있습니다 · 잠금을 풀면 다시 움직입니다' : {
      expanding: '가로로 더 당기면 세로도 커집니다', contracting: '가로로 더 당기면 세로는 작아집니다', turn: '높이가 가장 큰 지점입니다 · 조금 더 당겨 보세요', limit: '가로 길이의 끝입니다 · 조금 접어서 비교해 보세요'
    }[g.response];
    ctx.fillStyle = state.locked.length ? C.coral : C.green; ctx.font = mobile ? '600 13px sans-serif' : '600 18px sans-serif'; ctx.textAlign = 'center';
    const compactResponse = state.locked.length ? '연결 잠김 · 먼저 잠금을 풀어 주세요' : { expanding: '더 당기면 세로도 커집니다', contracting: '더 당기면 세로는 작아집니다', turn: '가장 높은 상태 · 조금 더 당겨 보세요', limit: '최대 가로 길이 · 조금 접어 보세요' }[g.response];
    ctx.fillText(mobile ? compactResponse : response, view.cx, height - (mobile ? 52 : 63));
    ctx.fillStyle = C.muted; ctx.font = mobile ? '11px sans-serif' : '14px sans-serif';
    ctx.fillText(mobile ? ($('comparison').checked ? `산호색 비교막 높이 ${g.comparisonHeight.toFixed(2)} u` : '연결점을 눌러 선택할 수 있어요') : ($('comparison').checked ? `같은 가로에서 비교막의 높이 ${g.comparisonHeight.toFixed(2)} u  ·  판은 늘어나지 않고 회전합니다` : '연결점을 선택한 뒤 L 키 또는 ‘선택 연결 잠그기’를 눌러 보세요'), view.cx, height - (mobile ? 29 : 35));
    $('width-stat').textContent = g.width.toFixed(2) + ' u'; $('height-stat').textContent = g.height.toFixed(2) + ' u';
    $('width-change').textContent = '기준 대비 ' + signed(g.strainX); $('height-change').textContent = '기준 대비 ' + signed(g.strainY);
    $('opening-stat').textContent = (g.openingFraction * 100).toFixed(1) + '%'; $('angle-stat').textContent = '판 회전 ' + (g.theta * 180 / Math.PI).toFixed(1) + '°';
    $('extension').max = String(E.maxExtension(state.aspect)); $('extension').value = String(state.extension); $('extension-value').textContent = state.extension.toFixed(1) + '%';
    $('aspect').value = String(state.aspect); $('aspect-value').textContent = state.aspect.toFixed(2);
    $('aspect').disabled = state.mission !== 'free'; $('aspect-help').textContent = state.mission === 'free' ? '판 하나의 세로는 1 u입니다. 모양을 바꾸면 잠금과 기준선도 새로 설정됩니다.' : '이 미션은 판 모양이 고정됩니다. ‘자유 실험’에서 모양을 바꿀 수 있습니다.';
    $('hinge-select').value = state.selected; $('lock-count').textContent = state.locked.length + '개 잠김';
    for (const option of $('hinge-select').options) { const hinge = g.hinges.find(h => h.id === option.value); option.textContent = hinge.label + (state.locked.includes(hinge.id) ? ' · 잠김' : ''); }
    const selectedLocked = state.locked.includes(state.selected); $('toggle-lock').textContent = selectedLocked ? '선택 연결 풀기' : '선택 연결 잠그기'; $('toggle-lock').setAttribute('aria-pressed', String(selectedLocked));
    $('unlock-all').disabled = !state.locked.length; $('mission').value = state.mission; $('preset').value = state.preset;
    $('mode-chip').textContent = state.locked.length ? '전체 잠김' : result.success ? '목표 달성' : g.response === 'contracting' ? '높이가 줄어드는 구간' : g.response === 'limit' ? '최대 가로 길이' : '회전할 수 있어요';
    $('mission-help').textContent = state.mission === 'free' ? '① 당기기 → ② 연결 잠그기 → ③ 모양 바꾸기. 회전만으로 달라지는 가로·세로를 비교하세요.' : E.MISSIONS[state.mission].instruction;
    $('mission-result').textContent = !result.active ? '자유 실험에서는 목표 창이 표시되지 않습니다.' : result.success ? '✓ 목표 달성! 두 길이가 모두 창의 허용 범위에 들어왔습니다.' : `목표까지 가로 ${result.widthError.toFixed(2)} u · 세로 ${result.heightError.toFixed(2)} u${state.locked.length ? ' · 잠금을 먼저 풀어 주세요.' : ''}`;
    if (result.success && !lastSuccess) message(state.mission === 'turn' ? '성공! 시작보다 가로는 넓어지고 높이는 낮아졌습니다. 판 모양과 회전 구간이 반응을 바꿉니다.' : '성공! 파란 창에 맞췄습니다. 다음 목표에서 연결과 판 모양을 바꿔 보세요.');
    lastSuccess = result.success;
    $('clear-reference').disabled=!pinned;
    $('reference-note').textContent=pinned?(pinned.aspect===state.aspect?'보라 점선: 기억한 모양 · 가로 '+pinned.width.toFixed(2)+' / 세로 '+pinned.height.toFixed(2)+' u → 현재 변화 '+signed((g.width/pinned.width-1)*100)+' / '+signed((g.height/pinned.height-1)*100):'판 비율이 달라 기억한 모양을 숨겼습니다. 다시 기억하면 새 비율로 비교합니다.'):'현재 모양을 기억한 뒤 당겨 보세요. 판의 회전과 외곽 변화가 겹쳐 보입니다.';
  }
  function changeExtension(value) {
    const result = E.setExtension(state, value);
    if (result.reason === 'locked') message('잠긴 연결 때문에 움직일 수 없습니다. 산호색 연결을 선택해 풀거나 ‘모두 풀기’를 누르세요.');
    else if (result.reason === 'limit') message('이 방향의 끝에 도달했습니다. 반대 방향으로 움직이거나 판 모양을 바꿔 보세요.');
    else message('판의 변 길이는 그대로입니다. 기준선과 가로·세로 변화, 빈틈의 크기를 함께 읽어 보세요.');
    render();
  }
  function toggleLock() {
    E.toggleLock(state); message(state.locked.includes(state.selected) ? '선택한 힌지의 현재 각도를 고정했습니다. 모든 판이 함께 도는 이 모형에서는 전체가 멈춥니다.' : state.locked.length ? '이 연결은 풀렸습니다. 아직 다른 잠긴 연결이 남아 있습니다.' : '잠금이 풀렸습니다. 다시 손잡이를 당길 수 있습니다.'); render();
  }
  function loadMission(name) { E.loadMission(state, name); lastSuccess = false; message(name === 'free' ? '자유 실험입니다. 손잡이를 끌거나 판의 가로·세로 비를 바꿔 보세요.' : E.MISSIONS[name].instruction); render(); }
  for (const hinge of E.geometry(state).hinges) { const option = document.createElement('option'); option.value = hinge.id; option.textContent = hinge.label; $('hinge-select').appendChild(option); }
  $('pull').onclick = () => changeExtension(state.extension + 2); $('push').onclick = () => changeExtension(state.extension - 2);
  $('extension').oninput = e => changeExtension(Number(e.target.value));
  $('aspect').oninput = e => { E.setAspect(state, e.target.value); message('판의 모양을 바꿨습니다. 연결 잠금을 풀고 닫힌 구조를 기준으로 새로 비교합니다.'); render(); };
  $('mission').onchange = e => loadMission(e.target.value);
  $('preset').onchange = e => { E.loadPreset(state, e.target.value); lastSuccess = false; message('새 구조를 불러왔습니다. 조금 더 당긴 뒤 세로 길이가 어느 방향으로 바뀌는지 보세요.'); render(); };
  $('reset').onclick = () => { if (state.mission !== 'free') loadMission(state.mission); else { const currentPreset = state.preset; E.loadPreset(state, currentPreset === 'custom' ? 'square' : currentPreset); lastSuccess = false; message('구조와 잠금, 기준선을 다시 시작 상태로 돌렸습니다.'); render(); } };
  $('hinge-select').onchange = e => { E.selectHinge(state, e.target.value); message('연결을 선택했습니다. ‘선택 연결 잠그기’ 또는 L 키로 고정하거나 풀 수 있습니다.'); render(); };
  $('toggle-lock').onclick = toggleLock; $('unlock-all').onclick = () => { state.locked = []; message('모든 연결을 풀었습니다. 구조를 다시 움직일 수 있습니다.'); render(); };
  $('comparison').onchange = render;
  $('pin-reference').onclick=()=>{const g=E.geometry(state);pinned={aspect:state.aspect,width:g.width,height:g.height,cells:g.cells};render();};
  $('clear-reference').onclick=()=>{pinned=null;render();};
  function point(e) { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) * view.width / rect.width, y: (e.clientY - rect.top) * view.height / rect.height, hit: 24 * view.width / rect.width }; }
  canvas.onpointerdown = e => {
    if (e.button !== 0) return;
    canvas.focus(); const p = point(e), g = E.geometry(state);
    const handles = [{ x: view.leftHandle, sign: -1 }, { x: view.rightHandle, sign: 1 }];
    const handle = handles.find(h => Math.abs(p.x - h.x) <= Math.max(25, p.hit) && Math.abs(p.y - view.cy) <= Math.max(34, p.hit));
    if (handle) { drag = { pointerId: e.pointerId, x: p.x, width: g.width, sign: handle.sign }; canvas.setPointerCapture(e.pointerId); if (state.locked.length) changeExtension(state.extension); return; }
    const nearest = g.hinges.map(h => ({ h, distance: Math.hypot(p.x - view.cx - h.x * view.scale, p.y - view.cy - h.y * view.scale) })).sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance < Math.max(15, p.hit)) { E.selectHinge(state, nearest.h.id); message(`${nearest.h.label} 선택. 아래 목록 또는 L 키로 잠금을 바꿀 수 있습니다.`); render(); }
  };
  canvas.onpointermove = e => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const p = point(e), width = drag.width + 2 * drag.sign * (p.x - drag.x) / view.scale;
    changeExtension((width / (E.COLS * state.aspect) - 1) * 100);
  };
  canvas.onpointerup = canvas.onpointercancel = e => { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); drag = null; };
  canvas.onkeydown = e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); changeExtension(state.extension + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1)); }
    if (e.key.toLowerCase() === 'l') { e.preventDefault(); toggleLock(); }
  };
  function fallbackFullscreen() { $('stage').classList.toggle('stage-expanded'); render(); }
  async function fullscreen() {
    if ($('stage').classList.contains('stage-expanded')) { $('stage').classList.remove('stage-expanded'); render(); return; }
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (typeof $('stage').requestFullscreen === 'function') await $('stage').requestFullscreen(); else fallbackFullscreen(); }
    catch { fallbackFullscreen(); }
    canvas.focus(); render();
  }
  $('fullscreen').onclick = fullscreen;
  $('exit-fullscreen').onclick = fullscreen;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('stage').classList.remove('stage-expanded'); render(); }
    if (e.key.toLowerCase() === 'f' && !e.target.matches('input,select,textarea') && !e.target.isContentEditable) { e.preventDefault(); fullscreen(); }
  });
  document.addEventListener('fullscreenchange', render);
  window.addEventListener('resize', render);
  $('save').onclick = () => { const a = document.createElement('a'); a.download = 'websim-auxetic.png'; a.href = canvas.toDataURL('image/png'); a.click(); message('현재 구조와 비교선을 PNG로 저장했습니다.'); };
  window.render_game_to_text = () => {
    const g = E.geometry(state);
    return JSON.stringify({ coordinateSystem: 'geometry origin at grid center, x right, y down; plate height 1 u; handle positions in logical canvas pixels', canvas: { width: view.width, height: view.height }, pinnedReference:pinned?{aspect:pinned.aspect,width:pinned.width,height:pinned.height}:null, mode: state.mission, aspect: state.aspect, extensionPercentFromClosed: state.extension, maxExtension: E.maxExtension(state.aspect), angleDegrees: g.theta * 180 / Math.PI, dimensions: { width: g.width, height: g.height }, reference: { width: g.referenceWidth, height: g.referenceHeight, definition: state.mission === 'turn' ? 'maximum-height mission start' : 'closed grid' }, strainPercent: { x: g.strainX, y: g.strainY }, openingPercent: g.openingFraction * 100, response: g.response, selectedHinge: state.selected, lockedHinges: [...state.locked], lockModel: 'one shared rotation degree of freedom; any locked hinge blocks all motion', selectedPoint: g.hinges.find(h => h.id === state.selected), handles: { left: { x: view.leftHandle, y: view.cy }, right: { x: view.rightHandle, y: view.cy } }, comparison: $('comparison').checked ? { model: 'constant-area rectangle', height: g.comparisonHeight } : null, mission: E.evaluateMission(state), fullscreen: Boolean(document.fullscreenElement || $('stage').classList.contains('stage-expanded')), time: state.time });
  };
  window.advanceTime = ms => { if (Number.isFinite(ms) && ms > 0) state.time += ms / 1000; render(); };
  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
