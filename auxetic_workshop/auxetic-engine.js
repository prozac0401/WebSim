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
  function maxExtension(a) { return (Math.hypot(a, 1) / a - 1) * 100; }
  function angleForExtension(a, extension) {
    const ratio = a * (1 + clamp(extension, 0, maxExtension(a)) / 100) / Math.hypot(a, 1);
    return Math.atan2(1, a) - Math.acos(clamp(ratio, -1, 1));
  }
  function extensionForAngle(a, theta) { return (spacing(a, theta).x / a - 1) * 100; }
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
    return { aspect: 1, extension: 20, referenceTheta: 0, selected: 'h-1-2', locked: [], mission: 'free', preset: 'square', time: 0 };
  }
  function setExtension(state, value) {
    if (!Number.isFinite(Number(value))) return { moved: false, reason: 'invalid' };
    if (state.locked.length) return { moved: false, reason: 'locked' };
    const next = clamp(Number(value), 0, maxExtension(state.aspect));
    const moved = Math.abs(next - state.extension) > 1e-10;
    state.extension = next;
    return { moved, reason: moved ? 'moved' : 'limit' };
  }
  function setAspect(state, value) {
    const next = clamp(Number(value), .5, 2);
    if (!Number.isFinite(next)) return false;
    const fraction = state.extension / maxExtension(state.aspect);
    Object.assign(state, { aspect: next, extension: fraction * maxExtension(next), referenceTheta: 0, locked: [], mission: 'free', preset: 'custom' });
    return true;
  }
  function loadPreset(state, name) {
    const preset = { square: [1, 20], tall: [.5, 105], wide: [1.8, 10] }[name] || [1, 20];
    Object.assign(state, { aspect: preset[0], extension: preset[1], referenceTheta: 0, selected: 'h-1-2', locked: [], mission: 'free', preset: name, time: 0 });
  }
  function loadMission(state, name) {
    const mission = MISSIONS[name];
    if (!mission) { loadPreset(state, 'square'); return; }
    Object.assign(state, { aspect: mission.aspect, extension: mission.extension, referenceTheta: mission.referenceTheta, selected: 'h-1-2', locked: [...(mission.locked || [])], mission: name, preset: 'custom', time: 0 });
  }
  function geometry(state) {
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
    return { cells, hinges, theta, width, height, referenceWidth, referenceHeight,
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
  return { COLS, ROWS, MISSIONS, createState, spacing, maxExtension, angleForExtension, extensionForAngle, geometry, setExtension, setAspect, loadPreset, loadMission, selectHinge, toggleLock, evaluateMission };
});
