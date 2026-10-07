(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AuxeticEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const COLS = 5, ROWS = 4;
  function spacing(a, theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return { x: a * c + s, y: a * s + c };
  }
  const MODEL_NOTE = '셀의 모양과 연결 간격을 하나의 전개 변수에 결합한 운동학적 예시입니다. 힘·재료·강성을 계산하는 물리 해석이나 강체 기구의 검증 결과가 아닙니다.';
  const plate = (id, label, aspect, extension, description) => ({ id, label, aspect, extension, family: '회전 판', kind: 'plate', description,
    mechanism: '크기가 일정한 직사각 판의 모서리가 연결되어 이웃한 판이 반대 방향으로 회전합니다.', aspectLabel: '판의 가로 / 세로', aspectHelp: '판 한 장의 가로 길이를 바꿉니다. 회전에 따라 높이가 증가하거나 감소할 수 있습니다.' });
  const linkage = (id, label, family, description, mechanism, extension = .48) => ({ id, label, family, kind: 'linkage', description,
    mechanism, aspect: 1, fraction: extension, aspectLabel: '형상의 가로 비율', aspectHelp: '선택한 구조를 유지하며 가로 비례를 조절합니다. 셀과 연결점도 함께 바뀝니다.', modelNote: MODEL_NOTE });
  const PRESETS = [
    plate('square', '회전 정사각', 1, 20, '같은 길이의 변을 가진 판이 돌며 가로와 세로가 함께 넓어집니다.'),
    plate('tall', '세로로 긴 판', .5, 105, '세로로 긴 판은 가장 높은 자세를 지나면 당길수록 낮아집니다.'),
    plate('wide', '가로로 긴 판', 1.8, 10, '가로로 긴 판이 작은 회전만으로 세로 공간을 만듭니다.'),
    plate('diamond', '마름모 펼침', 1, 40, '정사각 판이 거의 한계까지 돌아 마름모 모양의 틈을 만듭니다.'),
    plate('ribbon', '길쭉한 리본 판', .7, 60, '길쭉한 판의 엇갈린 회전이 높이 변화의 전환점을 보여줍니다.'),
    linkage('honeycomb', '리엔트런트 벌집', '접힘 격자', '안으로 접힌 벌집의 오목한 옆구리가 열립니다.', '오목한 셀의 폭·높이와 접힘 깊이를 함께 바꾸어 재진입 격자의 펼침을 표현합니다.'),
    linkage('chevron', '갈매기 접힘', '접힘 격자', '지그재그 골이 펴지면서 층 사이의 간격도 커집니다.', '갈매기 모양의 연속 리브와 세로 연결이 하나의 전개 변수로 움직입니다.'),
    linkage('kirigami', '키리가미 절개', '절개와 회전', '가느다란 띠가 교대로 기울며 긴 절개 사이를 엽니다.', '짧은 띠의 회전과 변형 가능한 연결을 결합한 절개 모티프입니다. 실제 시트의 굽힘은 계산하지 않습니다.')
  ];
  const presetMap = Object.fromEntries(PRESETS.map(p => [p.id, p]));
  function getPreset(state) { return presetMap[typeof state === 'string' ? state : state.structure || state.preset] || presetMap.square; }
  function maxExtension(stateOrAspect) {
    if (typeof stateOrAspect === 'number') return (Math.hypot(stateOrAspect, 1) / stateOrAspect - 1) * 100;
    const preset = getPreset(stateOrAspect);
    return preset.kind === 'plate' ? maxExtension(stateOrAspect.aspect) : modelRange(preset.id, stateOrAspect.aspect).extension;
  }
  function angleForExtension(a, extension) {
    const ratio = a * (1 + clamp(extension, 0, maxExtension(a)) / 100) / Math.hypot(a, 1);
    return Math.atan2(1, a) - Math.acos(clamp(ratio, -1, 1));
  }
  function extensionForAngle(a, theta) { return (spacing(a, theta).x / a - 1) * 100; }
  const point = (x, y) => ({ x, y });
  function extremes(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  }
  function path(points, closed = false, fill = false, role = 'ligament', lineWidth = .055) { return { points, closed, fill, role, lineWidth }; }
  function transformPoints(points, x, y, angle = 0) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return points.map(p => point(x + c * p.x - s * p.y, y + s * p.x + c * p.y));
  }
  // Folded grids and cut patterns use a single *illustrative* deployment
  // parameter. They are not inferred rigid-body mechanisms or material solvers.
  // A connector reuses its incident cell's exact port coordinates, so there are
  // no decorative floating endpoints while the coupled model is moving.
  function gridModel(cols, rows, pitchX, pitchY, makeCell, stagger = 0) {
    const paths = [], hinges = [], cells = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = (col - (cols - 1) / 2) * pitchX + (row % 2 ? stagger : -stagger), y = (row - (rows - 1) / 2) * pitchY;
      const cell = makeCell(row, col);
      const localPorts = cell.ports, ports = {};
      for (const p of cell.paths) paths.push({ ...p, points: p.points.map(p => point(p.x + x, p.y + y)) });
      for (const [key, p] of Object.entries(localPorts)) {
        ports[key] = point(p.x + x, p.y + y);
        hinges.push({ id: `n-${row}-${col}-${key}`, label: `${row + 1}행 ${col + 1}열 ${ { left: '왼쪽', right: '오른쪽', top: '위쪽', bottom: '아래쪽' }[key]} 연결`, ...ports[key] });
      }
      cells.push({ row, col, ports });
    }
    const connect = (a, b) => {
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-10) return;
      paths.push({ ...path([a, b]), connector: true, endpoints: [a, b] });
    };
    for (const cell of cells) {
      if (cell.col < cols - 1) connect(cell.ports.right, cells[cell.row * cols + cell.col + 1].ports.left);
      if (cell.row < rows - 1) connect(cell.ports.bottom, cells[(cell.row + 1) * cols + cell.col].ports.top);
    }
    return { paths, hinges };
  }
  function buildLinkage(id, t) {
    let model;
    if (id === 'honeycomb') {
      const w = 1.1 + .82 * t, h = .78 + .7 * t, dent = .33 - .21 * t;
      model = gridModel(4, 3, w, h, () => {
        const points = [point(-w / 2, -h / 2), point(w / 2, -h / 2), point(w / 2 - dent, 0), point(w / 2, h / 2), point(-w / 2, h / 2), point(-w / 2 + dent, 0)];
        return { paths: [path(points, true)], ports: { left: points[0], right: points[1], top: points[0], bottom: points[4] } };
      });
      // Shared corners are single selectable joints, even though several cells
      // meet there. Add the two inward folds of every cell as distinct hinges.
      model.hinges = [];
      for (let row = 0; row <= 3; row++) for (let col = 0; col <= 4; col++) {
        model.hinges.push({ id: `n-${row}-${col}`, label: `${row + 1}행 ${col + 1}열 공유 연결`, x: (col - 2) * w, y: (row - 1.5) * h });
      }
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) for (const side of [-1, 1]) {
        model.hinges.push({ id: `fold-${row}-${col}-${side}`, label: `${row + 1}행 ${col + 1}열 ${side < 0 ? '왼쪽' : '오른쪽'} 접힘`, x: (col - 1.5) * w + side * (w / 2 - dent), y: (row - 1) * h });
      }
    } else if (id === 'chevron') {
      const paths = [], hinges = [], step = .46 + .4 * t, pitch = .9 + .7 * t, rise = .33 * (1 - .62 * t), columns = 10;
      for (let row = 0; row < 4; row++) {
        const points = Array.from({ length: columns + 1 }, (_, col) => point((col - columns / 2) * step, (row - 1.5) * pitch + (col % 2 ? rise : -rise)));
        paths.push(path(points, false, false, 'ligament', .07));
        points.forEach((p, col) => {
          hinges.push({ id: `n-${row}-${col}`, label: `${row + 1}행 ${col + 1}번 접힘`, ...p });
          if (row < 3 && col % 2 === row % 2) {
            const b = point(p.x, p.y + pitch);
            paths.push({ ...path([p, b], false, false, 'ligament', .045), connector: true, endpoints: [p, b] });
          }
        });
      }
      model = { paths, hinges };
    } else if (id === 'kirigami') {
      const angle = .07 + .48 * t, halfLength = .46, halfThickness = .065;
      model = gridModel(5, 4, .97 + .59 * t, .38 + .54 * t, (row, col) => {
        const phi = ((row + col) % 2 ? -1 : 1) * angle;
        const vertices = transformPoints([point(-halfLength, -halfThickness), point(halfLength, -halfThickness), point(halfLength, halfThickness), point(-halfLength, halfThickness)], 0, 0, phi);
        const [left, right, top, bottom] = transformPoints([point(-halfLength, 0), point(halfLength, 0), point(0, -halfThickness), point(0, halfThickness)], 0, 0, phi);
        // The short inset line marks the cut direction; it is not an area metric.
        const slit = transformPoints([point(-.27, -.025), point(.27, -.025)], 0, 0, phi);
        return { paths: [path(vertices, true, true, 'body', .025), path(slit, false, false, 'cut', .018)], ports: { left, right, top, bottom } };
      }, .12);
    } else {
      throw new Error(`Unknown linkage: ${id}`);
    }
    return model;
  }
  const ranges = new Map();
  function measuredModel(id, aspect, t) {
    // Transform after cloning: grid ports, path points and connector endpoints
    // may intentionally describe the same location using the same point object.
    const model = buildLinkage(id, t);
    model.paths = model.paths.map(p => ({ ...p, points: p.points.map(v => point(v.x * aspect, v.y)),
      ...(p.endpoints ? { endpoints: p.endpoints.map(v => point(v.x * aspect, v.y)) } : {}) }));
    model.hinges = model.hinges.map(h => ({ ...h, x: h.x * aspect }));
    const bounds = extremes([...model.paths.flatMap(p => p.points), ...model.hinges]);
    const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
    for (const p of model.paths) {
      p.points = p.points.map(v => point(v.x - cx, v.y - cy));
      if (p.endpoints) p.endpoints = p.endpoints.map(v => point(v.x - cx, v.y - cy));
    }
    model.hinges = model.hinges.map(h => ({ ...h, x: h.x - cx, y: h.y - cy }));
    return { ...model, width: bounds.width, height: bounds.height };
  }
  function modelRange(id, aspect) {
    const key = `${id}:${aspect}`;
    if (!ranges.has(key)) {
      const base = measuredModel(id, aspect, 0), end = measuredModel(id, aspect, 1);
      ranges.set(key, { baseWidth: base.width, baseHeight: base.height, maxWidth: end.width, maxHeight: end.height,
        extension: (end.width / base.width - 1) * 100 });
    }
    return ranges.get(key);
  }
  function linkageGeometry(state, preset) {
    const range = modelRange(preset.id, state.aspect), extension = clamp(state.extension, 0, range.extension), t = extension / range.extension;
    const model = measuredModel(preset.id, state.aspect, t), width = range.baseWidth * (1 + extension / 100), scale = width / model.width;
    // Normalize width after deploying cells and spacing so it matches the
    // user-controlled extension even when rotating strips move the bounds.
    for (const p of model.paths) {
      p.points = p.points.map(v => point(v.x * scale, v.y));
      if (p.endpoints) p.endpoints = p.endpoints.map(v => point(v.x * scale, v.y));
    }
    model.hinges = model.hinges.map(h => ({ ...h, x: h.x * scale }));
    return { ...model, cells: [], width, theta: t * Math.PI / 3, angleLabel: '전개 위상', deploymentFraction: t,
      baseWidth: range.baseWidth, baseHeight: range.baseHeight, referenceWidth: range.baseWidth, referenceHeight: range.baseHeight,
      maxWidth: range.maxWidth, maxHeight: range.maxHeight, strainX: extension, strainY: (model.height / range.baseHeight - 1) * 100,
      openingFraction: null, comparisonHeight: range.baseHeight * range.baseWidth / width,
      response: t >= 1 - 1e-9 ? 'limit' : 'expanding', modelNote: MODEL_NOTE };
  }
  const MISSIONS = {
    window: { title: '01 · 창에 꼭 맞추기', aspect: 1, extension: 8, referenceTheta: 0,
      target: { width: 6.5, height: 5.2, tolerance: .065 },
      instruction: '양쪽 손잡이를 당겨 파란 창에 맞춰 보세요. 목표는 가로 6.50 u, 세로 5.20 u입니다.' },
    lock: { title: '02 · 잠긴 연결 풀기', aspect: 1, extension: 12, referenceTheta: 0,
      locked: ['h-1-2'], target: { width: 6.25, height: 5, tolerance: .065 },
      instruction: '산호색 연결이 전체 움직임을 막고 있습니다. 그 연결을 골라 잠금을 풀고, 가로 6.25 u · 세로 5.00 u의 창에 맞추세요.' },
    turn: { title: '03 · 더 넓게, 더 낮게', aspect: .5,
      extension: extensionForAngle(.5, Math.atan(.5)), referenceTheta: Math.atan(.5),
      target: { width: 5.375, height: 4 * spacing(.5, angleForExtension(.5, 115)).y, tolerance: .045 },
      instruction: '가장 높은 상태에서 출발합니다. 가로를 더 늘려 시작보다 낮은 파란 창에 맞추세요. 회색 기준선과 높이 변화를 비교하세요.' }
  };
  function createState() {
    return { aspect: 1, extension: 20, referenceTheta: 0, selected: 'h-1-2', locked: [], mission: 'free', preset: 'square', structure: 'square', time: 0 };
  }
  function setExtension(state, value) {
    if (!Number.isFinite(Number(value))) return { moved: false, reason: 'invalid' };
    if (state.locked.length) return { moved: false, reason: 'locked' };
    const next = clamp(Number(value), 0, maxExtension(state));
    const moved = Math.abs(next - state.extension) > 1e-10;
    state.extension = next;
    return { moved, reason: moved ? 'moved' : 'limit' };
  }
  function setAspect(state, value) {
    const next = clamp(Number(value), .5, 2);
    if (!Number.isFinite(next)) return false;
    const fraction = clamp(state.extension / maxExtension(state), 0, 1), structure = getPreset(state).id;
    Object.assign(state, { aspect: next, referenceTheta: 0, locked: [], mission: 'free', preset: 'custom', structure });
    state.extension = fraction * maxExtension(state);
    return true;
  }
  function loadPreset(state, name) {
    const preset = presetMap[name] || presetMap.square;
    Object.assign(state, { aspect: preset.aspect, extension: 0, referenceTheta: 0, selected: 'h-1-2', locked: [], mission: 'free', preset: preset.id, structure: preset.id, time: 0 });
    state.extension = preset.kind === 'plate' ? preset.extension : preset.fraction * maxExtension(state);
    if (preset.kind === 'linkage') state.selected = geometry(state).hinges[0].id;
  }
  function loadMission(state, name) {
    const mission = MISSIONS[name];
    if (!mission) { loadPreset(state, 'square'); return; }
    Object.assign(state, { aspect: mission.aspect, extension: mission.extension, referenceTheta: mission.referenceTheta, selected: 'h-1-2', locked: [...(mission.locked || [])], mission: name, preset: 'custom', structure: mission.aspect === .5 ? 'tall' : 'square', time: 0 });
  }
  function geometry(state) {
    const preset = getPreset(state);
    if (preset.kind === 'linkage') return linkageGeometry(state, preset);
    const a = state.aspect, theta = angleForExtension(a, state.extension), d = spacing(a, theta);
    const ref = spacing(a, state.referenceTheta), cells = [], hinges = [];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const sign = (row + col) % 2 ? -1 : 1, angle = sign * theta, c = Math.cos(angle), s = Math.sin(angle);
      const x = (col - (COLS - 1) / 2) * d.x, y = (row - (ROWS - 1) / 2) * d.y;
      const vertices = [[-a / 2, -.5], [a / 2, -.5], [a / 2, .5], [-a / 2, .5]].map(([u, v]) => ({ x: x + u * c - v * s, y: y + u * s + v * c }));
      cells.push({ row, col, sign, x, y, angle, vertices });
    }
    for (const cell of cells) {
      if (cell.col < COLS - 1) {
        const vertex = cell.sign === 1 ? 1 : 2, otherVertex = cell.sign === 1 ? 0 : 3;
        hinges.push({ id: `h-${cell.row}-${cell.col}`, label: `가로 연결 ${cell.row + 1}행 ${cell.col + 1}열`, ...cell.vertices[vertex], cell: cell.row * COLS + cell.col, vertex, otherCell: cell.row * COLS + cell.col + 1, otherVertex });
      }
      if (cell.row < ROWS - 1) {
        const vertex = cell.sign === 1 ? 2 : 3, otherVertex = cell.sign === 1 ? 1 : 0;
        hinges.push({ id: `v-${cell.row}-${cell.col}`, label: `세로 연결 ${cell.row + 1}행 ${cell.col + 1}열`, ...cell.vertices[vertex], cell: cell.row * COLS + cell.col, vertex, otherCell: (cell.row + 1) * COLS + cell.col, otherVertex });
      }
    }
    const width = COLS * d.x, height = ROWS * d.y, referenceWidth = COLS * ref.x, referenceHeight = ROWS * ref.y;
    const slopeX = -a * Math.sin(theta) + Math.cos(theta), slopeY = a * Math.cos(theta) - Math.sin(theta);
    const paths = cells.map(cell => path(cell.vertices, true, true, 'body', .025));
    return { cells, paths, hinges, theta, width, height, referenceWidth, referenceHeight, baseWidth: COLS * a, baseHeight: ROWS,
      maxWidth: COLS * Math.hypot(a, 1), maxHeight: ROWS * Math.hypot(a, 1), angleLabel: '판의 회전각', deploymentFraction: state.extension / maxExtension(state),
      strainX: (width / referenceWidth - 1) * 100, strainY: (height / referenceHeight - 1) * 100,
      openingFraction: 1 - a / (d.x * d.y), comparisonHeight: referenceHeight * referenceWidth / width,
      response: Math.abs(slopeX) < 1e-7 ? 'limit' : Math.abs(slopeY) < 1e-7 ? 'turn' : slopeY > 0 ? 'expanding' : 'contracting' };
  }
  function selectHinge(state, id) {
    if (!geometry(state).hinges.some(h => h.id === id)) return false;
    state.selected = id; return true;
  }
  function toggleLock(state, id = state.selected) {
    if (!selectHinge(state, id)) return false;
    const index = state.locked.indexOf(id);
    if (index < 0) state.locked.push(id); else state.locked.splice(index, 1);
    return true;
  }
  function evaluateMission(state) {
    const mission = MISSIONS[state.mission];
    if (!mission) return { active: false, success: false };
    const g = geometry(state), target = mission.target;
    const widthError = Math.abs(g.width - target.width), heightError = Math.abs(g.height - target.height);
    return { active: true, success: !state.locked.length && widthError <= target.tolerance && heightError <= target.tolerance, widthError, heightError, target };
  }
  return { COLS, ROWS, PRESETS, MISSIONS, getPreset, createState, spacing, maxExtension, angleForExtension, extensionForAngle, geometry, setExtension, setAspect, loadPreset, loadMission, selectHinge, toggleLock, evaluateMission };
});
