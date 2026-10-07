(() => {
  'use strict';
  const E = window.AuxeticEngine, $ = id => document.getElementById(id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d'), state = E.createState();
  const C = { green: '#21654f', mint: '#c5d8b8', light: '#dde8cf', ink: '#293d35', muted: '#718077', line: '#bbc8b6', coral: '#bc6661', blue: '#497eaa', bg: '#f5f6f1' };
  canvas.style.touchAction="pan-y";
  let drag = null, view = null, lastSuccess = false, pinned = null, familyFilter = 'all', hingeSignature = '';
  const signed = n => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
  const message = text => { $('message').textContent = text; };
  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function path(points, closed = true, target = ctx, transform = view) {
    target.beginPath(); points.forEach((p, i) => i ? target.lineTo(transform.cx + p.x * transform.scale, transform.cy + p.y * transform.scale) : target.moveTo(transform.cx + p.x * transform.scale, transform.cy + p.y * transform.scale));
    if (closed) target.closePath();
  }
  function drawPaths(paths, target = ctx, transform = view, ghost = false) {
    target.lineJoin = 'round'; target.lineCap = 'round';
    paths.forEach((shape, i) => {
      path(shape.points, shape.closed, target, transform);
      if (ghost) { target.stroke(); return; }
      if (shape.fill) { target.fillStyle = i % 2 ? C.light : C.mint; target.fill(); }
      target.strokeStyle = shape.role === 'cut' ? '#aa7757' : shape.role === 'ligament' ? '#548678' : '#73916e';
      target.lineWidth = shape.lineWidth ? Math.max(.8, shape.lineWidth * transform.scale) : shape.fill ? 1.35 : 2.1;
      target.stroke();
    });
  }
  function isSameReference() { return pinned && pinned.structure === state.structure && pinned.aspect === state.aspect; }
  function choosePreset(id) {
    E.loadPreset(state, id); lastSuccess = false; drag = null;
    message(E.getPreset(state).description + ' 손잡이를 당겨 펼쳐지는 모습을 비교해 보세요.'); render();
  }
  function updateGallery() {
    for (const button of $('shape-filters').children) button.setAttribute('aria-pressed', String(button.dataset.family === familyFilter));
    for (const button of $('shape-gallery').children) {
      button.hidden = familyFilter !== 'all' && button.dataset.family !== familyFilter;
      button.setAttribute('aria-pressed', String(button.dataset.preset === state.structure));
    }
  }
  function initLibrary() {
    $('structure-count').textContent = `${E.PRESETS.length}개 예제`;
    for (const family of ['all', ...new Set(E.PRESETS.map(p => p.family))]) {
      const button = document.createElement('button'); button.textContent = `${family === 'all' ? '전체' : family} ${family === 'all' ? E.PRESETS.length : E.PRESETS.filter(p => p.family === family).length}`; button.dataset.family = family;
      button.onclick = () => { familyFilter = family; updateGallery(); $('shape-gallery').scrollLeft = 0; };
      $('shape-filters').appendChild(button);
    }
    const groups = new Map();
    for (const preset of E.PRESETS) {
      if (!groups.has(preset.family)) { const group = document.createElement('optgroup'); group.label = preset.family; groups.set(preset.family, group); $('preset').appendChild(group); }
      const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.label; groups.get(preset.family).appendChild(option);
      const button = document.createElement('button'); button.className = 'shape-card'; button.dataset.preset = preset.id; button.dataset.family = preset.family;
      button.setAttribute('aria-label', preset.label + ' 구조 불러오기'); button.title = preset.description;
      const thumbnail = document.createElement('canvas'); thumbnail.width = 230; thumbnail.height = 120; thumbnail.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.textContent = preset.label; button.append(thumbnail, label); button.onclick = () => choosePreset(preset.id);
      $('shape-gallery').appendChild(button);
      const previewState = E.createState(); E.loadPreset(previewState, preset.id); const g = E.geometry(previewState);
      drawPaths(g.paths, thumbnail.getContext('2d'), { cx: 115, cy: 60, scale: Math.min(210 / g.width, 104 / g.height) });
    }
    const custom = document.createElement('option'); custom.value = 'custom'; custom.textContent = '직접 조절한 구조'; custom.disabled = true; $('preset').appendChild(custom);
    const shift = direction => $('shape-gallery').scrollBy({ left: direction * $('shape-gallery').clientWidth * .8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    $('gallery-prev').onclick = () => shift(-1); $('gallery-next').onclick = () => shift(1);
    updateGallery();
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
    const g = E.geometry(state), result = E.evaluateMission(state), preset = E.getPreset(state), plate = preset.kind === 'plate';
    const mobile = window.innerWidth <= 620, width = mobile ? Math.max(240, $('stage').clientWidth - 2) : 900, height = mobile ? 430 : 660, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = { mobile, width, height, cx: width / 2, cy: mobile ? 220 : 330, scale: Math.min((mobile ? width - 128 : 660) / g.maxWidth, (mobile ? 225 : 410) / g.maxHeight) };
    const left = view.cx - g.width * view.scale / 2, right = view.cx + g.width * view.scale / 2;
    const top = view.cy - g.height * view.scale / 2, bottom = view.cy + g.height * view.scale / 2;
    view.leftHandle = left - 34; view.rightHandle = right + 34;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#e5ebe0';
    for (let x = 20; x < width; x += 28) for (let y = 95; y < height - 82; y += 28) { ctx.beginPath(); ctx.arc(x, y, .7, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = mobile ? '12px sans-serif' : '14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = C.green; ctx.fillText(plate ? '● 회전하는 판' : '● 펼쳐지는 구조', mobile ? 14 : 30, mobile ? 23 : 32); ctx.fillStyle = C.muted; ctx.fillText('┄ 기준 외곽', mobile ? 153 : 176, mobile ? 23 : 32);
    if ($('comparison').checked) { ctx.fillStyle = C.coral; ctx.fillText('┄ 면적 일정 비교막', mobile ? 14 : 311, mobile ? 45 : 32); }
    if (result.active) { ctx.fillStyle = C.blue; ctx.fillText('┄ 목표 창', mobile ? 153 : 516, mobile ? 45 : 32); }
    ctx.fillStyle = C.muted; ctx.font = mobile ? '11px sans-serif' : '15px sans-serif'; ctx.fillText(state.mission === 'turn' ? '기준: 이 구조가 가장 높은 상태' : plate ? '기준: 판을 완전히 닫은 상태' : '기준: 가로 늘림 0%의 형태', mobile ? 14 : 30, mobile ? 69 : 63);
    if (!mobile) { ctx.textAlign = 'right'; ctx.fillText(`${preset.label} · 연결 ${g.hinges.length}개`, 870, 63); }
    drawPaths(g.paths);
    for (const cell of plate ? g.cells : []) {
      ctx.fillStyle = 'rgba(33,101,79,.20)'; ctx.beginPath(); ctx.arc(view.cx + cell.x * view.scale, view.cy + cell.y * view.scale, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    if(isSameReference()){ctx.save();ctx.strokeStyle='#86669e';ctx.lineWidth=1.6;ctx.globalAlpha=.65;ctx.setLineDash([3,4]);drawPaths(pinned.paths,ctx,view,true);ctx.restore();}
    rectangle(g.referenceWidth, g.referenceHeight, '#9ba898', [4, 7]);
    if ($('comparison').checked) rectangle(g.width, g.comparisonHeight, C.coral, [10, 6], 2);
    if (result.active) rectangle(result.target.width, result.target.height, C.blue, [4, 4], 2.5);
    for (const h of g.hinges) {
      const x = view.cx + h.x * view.scale, y = view.cy + h.y * view.scale, locked = state.locked.includes(h.id), selected = h.id === state.selected;
      if (selected) { ctx.beginPath(); ctx.arc(x, y, mobile ? 9 : 12, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.stroke(); }
      const nodeRadius = mobile ? Math.max(1.25, Math.min(2.2, view.scale * .06)) : 3.5;
      ctx.beginPath(); ctx.arc(x, y, locked ? 7 : nodeRadius, 0, Math.PI * 2); ctx.fillStyle = locked ? C.coral : C.green; ctx.fill();
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
    ctx.fillText(mobile ? ($('comparison').checked ? `산호색 비교막 높이 ${g.comparisonHeight.toFixed(2)} u` : '연결점을 눌러 선택할 수 있어요') : ($('comparison').checked ? `같은 가로에서 비교막의 높이 ${g.comparisonHeight.toFixed(2)} u  ·  ${plate ? '판은 늘어나지 않고 회전합니다' : '형상에 따른 펼침을 비교해 보세요'}` : '연결점을 선택한 뒤 L 키 또는 ‘선택 연결 잠그기’를 눌러 보세요'), view.cx, height - (mobile ? 29 : 35));
    $('width-stat').textContent = g.width.toFixed(2) + ' u'; $('height-stat').textContent = g.height.toFixed(2) + ' u';
    $('width-change').textContent = '기준 대비 ' + signed(g.strainX); $('height-change').textContent = '기준 대비 ' + signed(g.strainY);
    $('opening-label').textContent = plate ? '반복 셀의 빈틈' : '전개 진행률';
    $('opening-stat').textContent = (plate ? g.openingFraction * 100 : state.extension / E.maxExtension(state) * 100).toFixed(1) + '%';
    $('angle-stat').textContent = plate ? '판 회전 ' + (g.theta * 180 / Math.PI).toFixed(1) + '°' : '설정된 최대 가로 늘림 대비';
    $('extension').max = String(E.maxExtension(state)); $('extension').value = String(state.extension); $('extension-value').textContent = state.extension.toFixed(1) + '%';
    $('extension-label').textContent = plate ? '닫힘 대비 가로 늘림' : '기준 형태 대비 가로 늘림';
    $('aspect').value = String(state.aspect); $('aspect-value').textContent = state.aspect.toFixed(2);
    $('aspect-label').textContent = preset.aspectLabel;
    $('aspect').disabled = state.mission !== 'free'; $('aspect-help').textContent = state.mission === 'free' ? preset.aspectHelp : '이 미션은 판 모양이 고정됩니다. ‘자유 실험’에서 모양을 바꿀 수 있습니다.';
    const signature = g.hinges.map(h => h.id).join('|');
    if (signature !== hingeSignature) {
      $('hinge-select').replaceChildren(...g.hinges.map(hinge => { const option = document.createElement('option'); option.value = hinge.id; return option; })); hingeSignature = signature;
    }
    $('hinge-select').value = state.selected; $('lock-count').textContent = state.locked.length + '개 잠김';
    for (const option of $('hinge-select').options) { const hinge = g.hinges.find(h => h.id === option.value); option.textContent = hinge.label + (state.locked.includes(hinge.id) ? ' · 잠김' : ''); }
    const selectedLocked = state.locked.includes(state.selected); $('toggle-lock').textContent = selectedLocked ? '선택 연결 풀기' : '선택 연결 잠그기'; $('toggle-lock').setAttribute('aria-pressed', String(selectedLocked));
    $('unlock-all').disabled = !state.locked.length; $('mission').value = state.mission; $('preset').value = state.preset;
    $('mode-chip').textContent = state.locked.length ? '전체 잠김' : result.success ? '목표 달성' : g.response === 'contracting' ? '높이가 줄어드는 구간' : g.response === 'limit' ? '최대 가로 길이' : '함께 펼쳐지는 중';
    $('structure-title').textContent = preset.label; $('structure-family').textContent = preset.family;
    $('structure-description').textContent = preset.description;
    $('model-note').textContent = preset.mechanism + (plate ? ' 회전 판 5개 예제는 같은 구조에서 판의 비율과 시작 늘림을 바꾼 것입니다.' : ' 정해진 기하 규칙으로 펼치는 예시이며, 탄성이나 재료 길이 보존은 계산하지 않습니다.');
    canvas.setAttribute('aria-label', `${preset.label}. ${preset.description} 양옆 손잡이를 끌어 늘리고 연결점을 누르면 선택됩니다.`);
    $('mission-help').textContent = state.mission === 'free' ? '① 형상 고르기 → ② 손잡이 당기기 → ③ 현재 모양 기억. 회전 판·접힘 격자·절개 구조의 펼침을 비교하세요.' : E.MISSIONS[state.mission].instruction;
    $('mission-result').textContent = !result.active ? '자유 실험에서는 목표 창이 표시되지 않습니다.' : result.success ? '✓ 목표 달성! 두 길이가 모두 창의 허용 범위에 들어왔습니다.' : `목표까지 가로 ${result.widthError.toFixed(2)} u · 세로 ${result.heightError.toFixed(2)} u${state.locked.length ? ' · 잠금을 먼저 풀어 주세요.' : ''}`;
    if (result.success && !lastSuccess) message(state.mission === 'turn' ? '성공! 시작보다 가로는 넓어지고 높이는 낮아졌습니다. 판 모양과 회전 구간이 반응을 바꿉니다.' : '성공! 파란 창에 맞췄습니다. 다음 목표에서 연결과 판 모양을 바꿔 보세요.');
    lastSuccess = result.success;
    $('clear-reference').disabled=!pinned;
    $('reference-note').textContent=pinned?(isSameReference()?'보라 점선: 기억한 모양 · 가로 '+pinned.width.toFixed(2)+' / 세로 '+pinned.height.toFixed(2)+' u → 현재 변화 '+signed((g.width/pinned.width-1)*100)+' / '+signed((g.height/pinned.height-1)*100):'구조 종류나 비율이 달라 기억한 모양을 숨겼습니다. 다시 기억하면 현재 구조로 비교합니다.'):'현재 모양을 기억한 뒤 당겨 보세요. 연결부와 외곽의 변화가 겹쳐 보입니다.';
    updateGallery();
  }
  function changeExtension(value) {
    const result = E.setExtension(state, value);
    if (result.reason === 'locked') message('잠긴 연결 때문에 움직일 수 없습니다. 산호색 연결을 선택해 풀거나 ‘모두 풀기’를 누르세요.');
    else if (result.reason === 'limit') message('이 방향의 끝에 도달했습니다. 반대 방향으로 움직이거나 다른 형상을 골라 보세요.');
    else message(E.getPreset(state).kind === 'plate' ? '판의 변 길이는 그대로입니다. 기준선과 가로·세로 변화, 빈틈의 크기를 함께 읽어 보세요.' : '연결부의 펼침과 함께 가로·세로가 변합니다. 현재 모양을 기억하면 움직임을 겹쳐 볼 수 있습니다.');
    render();
  }
  function toggleLock() {
    E.toggleLock(state); message(state.locked.includes(state.selected) ? '선택한 연결의 현재 상태를 고정했습니다. 함께 펼쳐지는 이 모형에서는 전체가 멈춥니다.' : state.locked.length ? '이 연결은 풀렸습니다. 아직 다른 잠긴 연결이 남아 있습니다.' : '잠금이 풀렸습니다. 다시 손잡이를 당길 수 있습니다.'); render();
  }
  function loadMission(name) { E.loadMission(state, name); lastSuccess = false; drag = null; message(name === 'free' ? '자유 실험입니다. 라이브러리에서 다양한 형상을 불러오거나 구조의 비율을 바꿔 보세요.' : E.MISSIONS[name].instruction); render(); }
  initLibrary();
  $('pull').onclick = () => changeExtension(state.extension + 2); $('push').onclick = () => changeExtension(state.extension - 2);
  $('extension').oninput = e => {
    const value = Number(e.target.value), max = E.maxExtension(state), step = Number(e.target.step);
    // A range input rounds to its step; let its final tick reach the exact geometric limit.
    changeExtension(max - value < step - 1e-9 ? max : value);
  };
  $('aspect').oninput = e => { E.setAspect(state, e.target.value); message('선택한 형상의 비율을 바꿨습니다. 연결 잠금을 풀고 기준 형태를 새로 설정했습니다.'); render(); };
  $('mission').onchange = e => loadMission(e.target.value);
  $('preset').onchange = e => { familyFilter = 'all'; choosePreset(e.target.value); };
  $('reset').onclick = () => { if (state.mission !== 'free') loadMission(state.mission); else { E.loadPreset(state, state.structure); lastSuccess = false; drag = null; message('현재 형상의 기본 비율과 펼침 상태로 돌아왔습니다. 연결 잠금도 풀렸습니다.'); render(); } };
  $('hinge-select').onchange = e => { E.selectHinge(state, e.target.value); message('연결을 선택했습니다. ‘선택 연결 잠그기’ 또는 L 키로 고정하거나 풀 수 있습니다.'); render(); };
  $('toggle-lock').onclick = toggleLock; $('unlock-all').onclick = () => { state.locked = []; message('모든 연결을 풀었습니다. 구조를 다시 움직일 수 있습니다.'); render(); };
  $('comparison').onchange = render;
  $('pin-reference').onclick=()=>{const g=E.geometry(state);pinned={structure:state.structure,aspect:state.aspect,width:g.width,height:g.height,paths:g.paths};render();};
  $('clear-reference').onclick=()=>{pinned=null;render();};
  function point(e) { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) * view.width / rect.width, y: (e.clientY - rect.top) * view.height / rect.height, hit: 24 * view.width / rect.width }; }
  canvas.onpointerdown = e => {
    if (e.button !== 0) return;
    canvas.focus(); const p = point(e), g = E.geometry(state);
    const handles = [{ x: view.leftHandle, sign: -1 }, { x: view.rightHandle, sign: 1 }];
    const handle = handles.find(h => Math.abs(p.x - h.x) <= Math.max(25, p.hit) && Math.abs(p.y - view.cy) <= Math.max(34, p.hit));
    if (handle) { drag = { pointerId: e.pointerId, x: p.x, width: g.width, baseWidth: g.baseWidth, sign: handle.sign }; canvas.setPointerCapture(e.pointerId); if (state.locked.length) changeExtension(state.extension); return; }
    const nearest = g.hinges.map(h => ({ h, distance: Math.hypot(p.x - view.cx - h.x * view.scale, p.y - view.cy - h.y * view.scale) })).sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance < Math.max(15, p.hit)) { E.selectHinge(state, nearest.h.id); message(`${nearest.h.label} 선택. 아래 목록 또는 L 키로 잠금을 바꿀 수 있습니다.`); render(); }
  };
  canvas.onpointermove = e => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const p = point(e), width = drag.width + 2 * drag.sign * (p.x - drag.x) / view.scale;
    changeExtension((width / drag.baseWidth - 1) * 100);
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
    return JSON.stringify({ coordinateSystem: 'geometry origin at structure center, x right, y down; model units u; handle positions in logical canvas pixels', structure: state.structure, preset: state.preset, family:E.getPreset(state).family, modelKind:E.getPreset(state).kind, pathCount:g.paths.length, hingeCount:g.hinges.length, galleryFilter:familyFilter, canvas: { width: view.width, height: view.height }, pinnedReference:pinned?{structure:pinned.structure,aspect:pinned.aspect,width:pinned.width,height:pinned.height,visible:Boolean(isSameReference())}:null, mode: state.mission, aspect: state.aspect, extensionPercentFromClosed: state.extension, maxExtension: E.maxExtension(state), angleDegrees: E.getPreset(state).kind === 'plate' ? g.theta * 180 / Math.PI : null, deploymentPercent:state.extension/E.maxExtension(state)*100, dimensions: { width: g.width, height: g.height }, reference: { width: g.referenceWidth, height: g.referenceHeight, definition: state.mission === 'turn' ? 'maximum-height mission start' : 'zero-extension structure' }, strainPercent: { x: g.strainX, y: g.strainY }, openingPercent: g.openingFraction === null ? null : g.openingFraction * 100, response: g.response, selectedHinge: state.selected, lockedHinges: [...state.locked], lockModel: 'one shared deployment degree of freedom; any locked connection blocks all motion', selectedPoint: g.hinges.find(h => h.id === state.selected), handles: { left: { x: view.leftHandle, y: view.cy }, right: { x: view.rightHandle, y: view.cy } }, comparison: $('comparison').checked ? { model: 'constant-area rectangle', height: g.comparisonHeight } : null, mission: E.evaluateMission(state), fullscreen: Boolean(document.fullscreenElement || $('stage').classList.contains('stage-expanded')), time: state.time });
  };
  window.advanceTime = ms => { if (Number.isFinite(ms) && ms > 0) state.time += ms / 1000; render(); };
  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
