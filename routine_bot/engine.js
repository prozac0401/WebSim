(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoutineEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ commands: 128, nesting: 4, repeat: 12, steps: 1000, evaluations: 2000, callDepth: 2 });
  const DIRECTIONS = Object.freeze([{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]);
  const TYPES = ['forward', 'left', 'right', 'wait', 'repeat', 'if', 'call'];
  const copy = value => JSON.parse(JSON.stringify(value));

  function validate(program, level) {
    const errors = [], ids = new Set(), objects = new Set();
    const edges = { main: [], F1: [], F2: [] };
    const unlocked = new Set(level && level.unlocks || TYPES.concat(['blocked', 'mark', 'box', 'home', 'F1', 'F2']));
    let count = 0, exhausted = false;
    function fail(message) { if (!errors.includes(message) && errors.length < 16) errors.push(message); }
    function walk(list, depth, owner) {
      if (!Array.isArray(list)) { fail('명령 묶음이 올바르지 않아요.'); return; }
      if (depth > LIMITS.nesting) { fail('블록은 4단계까지만 안에 넣을 수 있어요.'); return; }
      if (objects.has(list)) { fail('서로 참조하는 명령 데이터는 실행할 수 없어요.'); return; }
      objects.add(list);
      for (const node of list) {
        if (++count > LIMITS.commands) { fail('저장 블록은 최대 128개예요.'); exhausted = true; return; }
        if (!node || typeof node !== 'object' || Array.isArray(node)) { fail('읽을 수 없는 명령 블록이 있어요.'); continue; }
        if (objects.has(node)) { fail('같은 명령 데이터가 여러 곳에 연결되어 있어요.'); continue; }
        objects.add(node);
        if (typeof node.id !== 'string' || !node.id || node.id.length > 80 || ids.has(node.id)) fail('명령의 이름표가 겹치거나 올바르지 않아요.');
        ids.add(node.id);
        if (!TYPES.includes(node.type)) { fail('알 수 없는 명령 블록이 있어요.'); continue; }
        if (!unlocked.has(node.type)) fail('이 레벨에서 아직 열리지 않은 명령이 있어요.');
        if (node.type === 'repeat') {
          if (!Number.isInteger(node.count) || node.count < 2 || node.count > LIMITS.repeat) fail('반복 횟수는 2~12회로 정해 주세요.');
          walk(node.body, depth + 1, owner);
        } else if (node.type === 'if') {
          if (!['blocked', 'mark', 'box', 'home'].includes(node.condition) || !unlocked.has(node.condition)) fail('사용할 수 없는 조건이에요.');
          walk(node.then, depth + 1, owner); walk(node.else, depth + 1, owner);
        } else if (node.type === 'call') {
          if (!['F1', 'F2'].includes(node.target) || !unlocked.has(node.target)) fail('아직 사용할 수 없는 함수예요.');
          else edges[owner].push(node.target);
        }
        if (exhausted) return;
      }
    }
    if (!program || typeof program !== 'object' || Array.isArray(program)) fail('프로그램을 읽을 수 없어요.');
    else for (const scope of ['main', 'F1', 'F2']) {
      if (scope !== 'main' && Array.isArray(program[scope]) && program[scope].length && !unlocked.has(scope)) fail('이 레벨에서는 함수 보관함을 아직 쓰지 않아요.');
      walk(program[scope], 0, scope);
      if (exhausted) break;
    }
    function visit(scope, path) {
      if (path.includes(scope)) { fail('함수가 자기 자신이나 서로를 다시 부를 수 없어요.'); return; }
      for (const target of edges[scope]) visit(target, path.concat(scope));
    }
    for (const scope of ['main', 'F1', 'F2']) visit(scope, []);
    const max = Math.min(LIMITS.commands, level && Number.isInteger(level.maxCommands) ? level.maxCommands : LIMITS.commands);
    if (count > max) fail('이 레벨은 저장 블록 ' + max + '개까지 사용할 수 있어요.');
    return { ok: errors.length === 0, errors, count };
  }

  function validHazards(map) {
    if (map.hazards === undefined) return true;
    if (!Array.isArray(map.hazards) || map.hazards.length > 900) return false;
    const positions = new Set();
    return Array.from(map.hazards).every(hazard => {
      if (!hazard || !Number.isInteger(hazard.x) || !Number.isInteger(hazard.y) ||
          !map.rows[hazard.y] || !['.', '*', 'H'].includes(map.rows[hazard.y][hazard.x]) ||
          !Number.isInteger(hazard.period) || hazard.period < 2 || hazard.period > 12 ||
          !Array.isArray(hazard.activePhases) || !hazard.activePhases.length || hazard.activePhases.length > hazard.period ||
          !Array.from(hazard.activePhases).every(phase => Number.isInteger(phase) && phase >= 0 && phase < hazard.period) ||
          new Set(hazard.activePhases).size !== hazard.activePhases.length) return false;
      const position = hazard.x + ',' + hazard.y;
      if (positions.has(position)) return false;
      positions.add(position);
      return true;
    });
  }

  function validMap(map) {
    const floor = point => !!(point && Number.isInteger(point.x) && Number.isInteger(point.y) && map.rows[point.y] && ['.', '*', 'H'].includes(map.rows[point.y][point.x]));
    const unique = points => new Set(points.map(point => point.x + ',' + point.y)).size === points.length;
    const validRows = !!(map && Array.isArray(map.rows) && map.rows.length > 0 && map.rows.length <= 30 && typeof map.rows[0] === 'string' &&
      Array.from(map.rows).every(row => typeof row === 'string' && row.length === map.rows[0].length && row.length <= 30 && /^[#.*H]+$/.test(row)) &&
      validHazards(map));
    if (!validRows) return false;
    if (map.robots !== undefined) {
      if (!Array.isArray(map.robots) || map.robots.length < 1 || map.robots.length > 8 ||
          !Array.from(map.robots).every(robot => floor(robot) && typeof robot.id === 'string' && /^[A-Za-z0-9_-]{1,12}$/.test(robot.id) &&
            Number.isInteger(robot.dir) && robot.dir >= 0 && robot.dir <= 3 && floor(robot.home)) ||
          new Set(map.robots.map(robot => robot.id)).size !== map.robots.length || !unique(map.robots) || !unique(map.robots.map(robot => robot.home))) return false;
      const boxes = map.boxes === undefined ? [] : map.boxes, targets = map.targets === undefined ? [] : map.targets;
      if (!Array.isArray(boxes) || !Array.isArray(targets) || boxes.length > 900 || boxes.length !== targets.length ||
          !Array.from(boxes).every(floor) || !Array.from(targets).every(floor) || !unique(boxes) || !unique(targets)) return false;
      const occupied = (a, b) => a.some(p => b.some(q => p.x === q.x && p.y === q.y));
      if (occupied(boxes, map.robots) || occupied(targets, map.robots.map(robot => robot.home))) return false;
      // H is optional decoration in this schema; explicit, labelled homes are authoritative.
      for (let y = 0; y < map.rows.length; y++) for (let x = 0; x < map.rows[y].length; x++)
        if (map.rows[y][x] === 'H' && !map.robots.some(robot => robot.home.x === x && robot.home.y === y)) return false;
      return true;
    }
    return !!(map.boxes === undefined && map.targets === undefined && map.rows.join('').split('H').length === 2 && map.start && Number.isInteger(map.start.x) && Number.isInteger(map.start.y) &&
      Number.isInteger(map.start.dir) && map.start.dir >= 0 && map.start.dir <= 3 &&
      floor(map.start));
  }

  function hazardState(map, time = 0) {
    time = Number.isSafeInteger(time) && time >= 0 ? time : 0;
    const cells = validMap(map) ? (map.hazards || []).map(hazard => {
      const phase = time % hazard.period, nextPhase = (phase + 1) % hazard.period;
      return { x: hazard.x, y: hazard.y, period: hazard.period, phase, nextPhase,
        active: hazard.activePhases.includes(phase), nextActive: hazard.activePhases.includes(nextPhase) };
    }) : [];
    const coordinates = cell => ({ x: cell.x, y: cell.y });
    return { time, cells, active: cells.filter(cell => cell.active).map(coordinates), nextActive: cells.filter(cell => cell.nextActive).map(coordinates) };
  }

  // The old runner deliberately retains its event-by-event, fail-on-wall rules.
  // Cooperative maps use a separate interpreter boundary: exactly one world turn.
  function createCooperativeRunner(program, level, mapIndex) {
    const checked = validate(program, level), source = level.maps[mapIndex];
    const point = p => ({ x: p.x, y: p.y });
    const same = (a, b) => a.x === b.x && a.y === b.y;
    const map = validMap(source) ? {
      rows: source.rows.slice(), robots: source.robots.map(r => ({ id: r.id, ...point(r), dir: r.dir, home: point(r.home) })),
      boxes: (source.boxes || []).map(point), targets: (source.targets || []).map(point),
      hazards: (source.hazards || []).map(h => ({ ...point(h), period: h.period, activePhases: h.activePhases.slice() }))
    } : null;
    const state = { mode: 'cooperative', status: 'ready', robots: map ? map.robots.map(r => ({ ...r, currentId: null,
      callStack: [], repeatStack: [], status: 'ready', steps: 0, event: null, message: '공통 프로그램을 기다려요.' })) : [],
      boxes: map ? copy(map.boxes) : [], targets: map ? copy(map.targets) : [], steps: 0, evaluations: 0,
      movementCount: 0, currentId: null, event: null, message: '한 턴에 모든 로봇이 각자 다음 행동을 해요.', collision: null, collisions: [], mapIndex };
    function snapshot() {
      const first = state.robots[0];
      return copy({ ...state, robot: first ? { ...point(first), dir: first.dir } : { x: 0, y: 0, dir: 0 },
        currentId: first ? first.currentId : null, callStack: first ? first.callStack : [], hazards: hazardState(map, state.movementCount) });
    }
    function fail(reason, message, extra = {}) {
      state.status = 'failure'; state.message = message; state.event = { type: 'failure', reason, time: state.movementCount, ...extra };
      return snapshot();
    }
    function goal() {
      return state.robots.every(r => same(r, r.home)) && state.targets.every(t => state.boxes.some(b => same(b, t)));
    }
    function succeed(actions = []) {
      state.status = 'success'; state.message = '모든 상자를 배송하고 모든 로봇이 자기 집에 도착했어요!';
      state.event = { type: 'success', actions, time: state.movementCount }; return snapshot();
    }
    if (!checked.ok) fail('validation', checked.errors.join(' '));
    else if (!map) fail('map', '지도를 읽지 못했어요. 로봇·집·상자·목적지 배치를 확인해 주세요.');
    else {
      const active = hazardState(map, 0).active, hit = state.robots.filter(r => active.some(h => same(r, h))).sort((a, b) => a.id.localeCompare(b.id));
      if (hit.length) fail('hazard', '시간 0에 로봇의 출발 칸이 켜져 있어요.', { action: 'start', robots: hit.map(r => r.id), at: point(hit[0]) });
    }
    function cloneNodes(nodes) {
      return nodes.map(node => {
        const result = { id: node.id, type: node.type };
        if (node.type === 'repeat') { result.count = node.count; result.body = cloneNodes(node.body); }
        else if (node.type === 'if') { result.condition = node.condition; result.then = cloneNodes(node.then); result.else = cloneNodes(node.else); }
        else if (node.type === 'call') result.target = node.target;
        return result;
      });
    }
    const saved = checked.ok ? { main: cloneNodes(program.main), F1: cloneNodes(program.F1), F2: cloneNodes(program.F2) } : { main: [], F1: [], F2: [] };
    const maxSteps = Math.min(LIMITS.steps, Number.isInteger(level.maxSteps) && level.maxSteps > 0 ? level.maxSteps : LIMITS.steps);
    let turnStart = null;
    const tile = p => map.rows[p.y] && map.rows[p.y][p.x] || '#';
    function forwardIntent(robot, world) {
      const d = DIRECTIONS[robot.dir], to = { x: robot.x + d.x, y: robot.y + d.y };
      const action = { robotId: robot.id, type: 'move', from: { ...point(robot), dir: robot.dir }, to };
      if (tile(to) === '#') action.reason = 'wall';
      else if (world.robots.some(r => r.id !== robot.id && same(r, to))) action.reason = 'robot';
      const boxIndex = world.boxes.findIndex(b => same(b, to));
      if (boxIndex >= 0) {
        action.type = 'push'; action.boxIndex = boxIndex; action.boxFrom = point(to);
        action.boxTo = { x: to.x + d.x, y: to.y + d.y };
        if (tile(action.boxTo) === '#') action.reason = 'box-wall';
        else if (world.boxes.some(b => same(b, action.boxTo))) action.reason = 'box-chain';
        else if (world.robots.some(r => same(r, action.boxTo))) action.reason = 'box-robot';
      }
      return action;
    }
    function condition(robot, kind) {
      const start = turnStart.robots.find(r => r.id === robot.id);
      if (kind === 'blocked') return !!forwardIntent(start, turnStart).reason;
      if (kind === 'box') return forwardIntent(start, turnStart).type === 'push';
      if (kind === 'home') return same(start, robot.home);
      return tile(start) === '*';
    }
    function* sequence(list, robot) {
      for (const node of list) {
        if (node.type === 'repeat') {
          const frame = { id: node.id, iteration: 0, count: node.count }; robot.repeatStack.push(frame);
          for (let i = 0; i < node.count; i++) {
            frame.iteration = i + 1;
            yield { type: 'repeat', id: node.id, iteration: i + 1, count: node.count };
            yield* sequence(node.body, robot);
          }
          robot.repeatStack.pop();
        } else if (node.type === 'if') {
          const result = condition(robot, node.condition);
          yield { type: 'condition', id: node.id, condition: node.condition, result };
          yield* sequence(result ? node.then : node.else, robot);
        } else if (node.type === 'call') {
          yield { type: 'call', id: node.id, target: node.target };
          yield* sequence(saved[node.target], robot);
          yield { type: 'return', id: node.id, target: node.target };
        } else yield { type: node.type === 'forward' ? 'move' : node.type === 'wait' ? 'wait' : 'turn', id: node.id, command: node.type };
      }
    }
    const iterators = new Map(state.robots.map(robot => [robot.id, sequence(saved.main, robot)]));
    const reasons = { wall: '앞이 벽 또는 지도 밖이에요.', robot: '턴 시작에 다른 로봇이 있던 칸이에요.',
      'box-wall': '상자 뒤가 벽 또는 지도 밖이에요.', 'box-chain': '미는 방향으로 상자가 이어져 있어요. 하나만 밀 수 있어요.',
      'box-robot': '상자 뒤에 다른 로봇이 있어요.', 'same-box': '같은 상자를 함께 밀려고 해서 모두 취소했어요.',
      destination: '같은 목적 칸으로 가려고 해서 모두 취소했어요.' };
    function step() {
      if (!['ready', 'running'].includes(state.status)) return snapshot();
      if (goal()) return succeed();
      turnStart = { robots: state.robots.map(r => ({ id: r.id, ...point(r), dir: r.dir })), boxes: state.boxes.map(point) };
      const actions = [];
      // Stable evaluation order only determines diagnostics on a whole-turn budget
      // abort. It never selects a winner: collision resolution below is symmetric.
      for (const robot of state.robots.slice().sort((a, b) => a.id.localeCompare(b.id))) {
        if (robot.status === 'ended') continue;
        const controls = [];
        while (true) {
          if (state.evaluations >= LIMITS.evaluations) return fail('evaluation-limit', '제어 흐름 평가 한도에 도달했어요. 반복이나 함수 구성을 확인해 주세요.');
          const next = iterators.get(robot.id).next();
          if (next.done) {
            const lastAction = robot.event && ['move', 'push', 'turn', 'wait'].includes(robot.event.type) ? robot.event : null;
            robot.status = 'ended';
            robot.message = lastAction ? '프로그램 종료 · 마지막 행동: ' + lastAction.message : '프로그램이 끝나 이 칸에서 기다려요.';
            robot.event = { type: 'ended', controls, lastAction }; break;
          }
          const event = next.value; state.evaluations++; robot.currentId = event.id;
          if (event.type !== 'return') {
            if (state.steps >= maxSteps) return fail('limit', '실행 ' + maxSteps + '단계에 도달했어요. 이번 턴의 행동은 반영하지 않았어요.');
            state.steps++; robot.steps++;
          }
          if (event.type === 'call') {
            if (robot.callStack.length >= LIMITS.callDepth) return fail('depth', '함수는 두 겹까지만 부를 수 있어요.');
            robot.callStack.push({ target: event.target, callId: event.id }); controls.push(event);
          } else if (event.type === 'return') { robot.callStack.pop(); controls.push(event); }
          else if (event.type === 'repeat' || event.type === 'condition') controls.push(event);
          else {
            const start = turnStart.robots.find(r => r.id === robot.id);
            const action = event.type === 'move' ? forwardIntent(start, turnStart) : { robotId: robot.id, type: event.type,
              from: { ...point(start), dir: start.dir }, to: point(start) };
            Object.assign(action, { id: event.id, command: event.command, controls });
            if (event.type === 'turn') { action.fromDir = start.dir; action.toDir = (start.dir + (event.command === 'right' ? 1 : 3)) % 4; }
            actions.push(action); robot.status = 'running'; break;
          }
        }
      }
      if (!actions.length) {
        const lastActions = state.robots.map(r => r.event && r.event.lastAction).filter(Boolean).sort((a, b) => a.robotId.localeCompare(b.robotId));
        const blocked = lastActions.filter(a => a.cancelled).map(a => a.robotId + ': ' + a.message);
        return fail('exhausted', '모든 로봇의 명령이 끝났지만 배송과 귀가가 아직 함께 완료되지 않았어요.' +
          (blocked.length ? ' 마지막 막힘 — ' + blocked.join(' ') : ''), { lastActions });
      }
      const candidates = actions.filter(a => !a.reason && ['move', 'push'].includes(a.type));
      const pushing = new Map();
      for (const action of actions.filter(a => a.type === 'push')) {
        const group = pushing.get(action.boxIndex) || []; group.push(action); pushing.set(action.boxIndex, group);
      }
      for (const group of pushing.values()) if (group.length > 1) for (const action of group) action.reason = 'same-box';
      const claims = new Map();
      for (const action of candidates) for (const target of action.type === 'push' ? [action.to, action.boxTo] : [action.to]) {
        const key = target.x + ',' + target.y, group = claims.get(key) || []; group.push(action); claims.set(key, group);
      }
      for (const group of claims.values()) if (group.length > 1) for (const action of group) if (!action.reason) action.reason = 'destination';
      state.movementCount++; state.status = 'running'; state.collisions = []; state.collision = null;
      for (const action of actions) {
        const robot = state.robots.find(r => r.id === action.robotId);
        action.time = state.movementCount; action.cancelled = !!action.reason;
        if (action.cancelled) {
          action.message = reasons[action.reason]; state.collisions.push({ robotId: robot.id, at: point(action.to), reason: action.reason });
        } else if (action.type === 'push') {
          state.boxes[action.boxIndex] = point(action.boxTo); Object.assign(robot, action.to); action.message = '상자 하나를 밀고 앞으로 한 칸.';
        } else if (action.type === 'move') { Object.assign(robot, action.to); action.message = '앞으로 한 칸.'; }
        else if (action.type === 'turn') { robot.dir = action.toDir; action.message = action.command === 'right' ? '오른쪽으로 돌아요.' : '왼쪽으로 돌아요.'; }
        else action.message = '한 턴 기다려요.';
        robot.event = action; robot.message = action.message;
      }
      state.collision = state.collisions.length ? point(state.collisions[0].at) : null;
      state.event = { type: 'turn', actions, time: state.movementCount };
      state.message = actions.map(a => a.robotId + ': ' + a.message).join(' ');
      const active = hazardState(map, state.movementCount).active, hit = state.robots.filter(r => active.some(h => same(r, h))).sort((a, b) => a.id.localeCompare(b.id));
      if (hit.length) return fail('hazard', '시간 ' + state.movementCount + '에 ' + hit.map(r => r.id).join(', ') + ' 로봇의 칸이 켜졌어요.',
        { actions, robots: hit.map(r => r.id).sort(), at: point(hit.slice().sort((a, b) => a.id.localeCompare(b.id))[0]) });
      if (goal()) return succeed(actions);
      return snapshot();
    }
    function cancel() {
      if (['ready', 'running'].includes(state.status)) { state.status = 'cancelled'; state.event = { type: 'cancel' }; state.message = '실행을 멈췄어요. 작성한 명령은 그대로예요.'; }
      return snapshot();
    }
    return { step, snapshot, cancel };
  }

  function createRunner(program, level, mapIndex) {
    mapIndex = mapIndex === undefined ? 0 : mapIndex;
    if (level && Array.isArray(level.maps) && level.maps[mapIndex] && level.maps[mapIndex].robots !== undefined)
      return createCooperativeRunner(program, level, mapIndex);
    const checked = validate(program, level);
    const sourceMap = level && Array.isArray(level.maps) ? level.maps[mapIndex] : null;
    const map = validMap(sourceMap) ? { rows: sourceMap.rows.slice(), start: { x: sourceMap.start.x, y: sourceMap.start.y, dir: sourceMap.start.dir },
      hazards: (sourceMap.hazards || []).map(h => ({ x: h.x, y: h.y, period: h.period, activePhases: h.activePhases.slice() })) } : null;
    const state = { status: 'ready', robot: validMap(map) ? copy(map.start) : { x: 0, y: 0, dir: 0 }, steps: 0,
      movementCount: 0, event: null, currentId: null, message: '명령을 실행하면 로봇이 출발해요.', callStack: [], collision: null, mapIndex };
    const snapshot = () => copy({ ...state, hazards: hazardState(map, state.movementCount) });
    const fail = (reason, message, extra) => {
      state.status = 'failure'; state.message = message; state.event = Object.assign({ type: 'failure', reason }, extra); return snapshot();
    };
    if (!checked.ok) fail('validation', checked.errors.join(' '));
    else if (!validMap(map)) fail('map', '지도를 읽지 못했어요. 다른 레벨을 열어 주세요.');
    else if (hazardState(map, 0).active.some(cell => cell.x === state.robot.x && cell.y === state.robot.y))
      fail('hazard', '시간 0에 출발 칸이 켜져 있어요. 이 지도에서는 안전하게 출발할 수 없어요.', { action: 'start', time: 0, at: { x: state.robot.x, y: state.robot.y } });
    function cloneNodes(nodes) {
      return nodes.map(node => {
        const result = { id: node.id, type: node.type };
        if (node.type === 'repeat') { result.count = node.count; result.body = cloneNodes(node.body); }
        else if (node.type === 'if') { result.condition = node.condition; result.then = cloneNodes(node.then); result.else = cloneNodes(node.else); }
        else if (node.type === 'call') result.target = node.target;
        return result;
      });
    }
    const saved = checked.ok ? { main: cloneNodes(program.main), F1: cloneNodes(program.F1), F2: cloneNodes(program.F2) } : { main: [], F1: [], F2: [] };
    const maxSteps = Math.min(LIMITS.steps, level && Number.isInteger(level.maxSteps) && level.maxSteps > 0 ? level.maxSteps : LIMITS.steps);
    function tile(x, y) { return map.rows[y] && map.rows[y][x] || '#'; }
    function ahead() { const d = DIRECTIONS[state.robot.dir]; return { x: state.robot.x + d.x, y: state.robot.y + d.y }; }
    function* sequence(list) {
      for (const node of list) {
        if (node.type === 'repeat') {
          for (let i = 0; i < node.count; i++) {
            yield { type: 'repeat', id: node.id, iteration: i + 1, count: node.count };
            yield* sequence(node.body);
          }
        } else if (node.type === 'if') {
          const next = ahead();
          const result = node.condition === 'blocked' ? tile(next.x, next.y) === '#' : node.condition === 'mark' ? tile(state.robot.x, state.robot.y) === '*' : node.condition === 'home' ? tile(state.robot.x, state.robot.y) === 'H' : false;
          yield { type: 'condition', id: node.id, condition: node.condition, result };
          yield* sequence(result ? node.then : node.else);
        } else if (node.type === 'call') {
          yield { type: 'call', id: node.id, target: node.target };
          yield* sequence(saved[node.target]);
          yield { type: 'return', id: node.id, target: node.target };
        } else yield { type: node.type === 'forward' ? 'move' : node.type === 'wait' ? 'wait' : 'turn', id: node.id, command: node.type };
      }
    }
    const iterator = sequence(saved.main);
    function step() {
      if (state.status === 'success' || state.status === 'failure' || state.status === 'cancelled') return snapshot();
      if (tile(state.robot.x, state.robot.y) === 'H') { state.status = 'success'; state.message = '집에 도착했어요!'; state.event = { type: 'success' }; return snapshot(); }
      const next = iterator.next();
      if (next.done) return fail('exhausted', '명령이 끝났어요. 집까지 남은 길과 명령의 순서를 살펴보세요.');
      const event = next.value;
      state.currentId = event.id;
      if (event.type !== 'return' && state.steps >= maxSteps) return fail('limit', '실행 ' + maxSteps + '단계에 도달했어요. 반복 횟수나 이동 방향을 확인해 주세요.');
      state.status = 'running'; state.event = event;
      if (event.type !== 'return') state.steps++;
      const timedAction = ['move', 'turn', 'wait'].includes(event.type);
      if (timedAction) { state.movementCount++; event.time = state.movementCount; }
      if (event.type === 'move') {
        const target = ahead(); event.from = copy(state.robot); event.to = target;
        if (tile(target.x, target.y) === '#') {
          state.collision = target;
          const message = (level.unlocks || []).includes('if')
            ? '앞이 벽이에요. 이 이동 전에 방향을 바꾸거나 조건을 확인해 보세요.'
            : '앞이 벽이에요. 이 명령 전에 방향이나 이동 횟수를 확인해 보세요.';
          return fail('collision', message, { from: event.from, to: target });
        }
        state.robot.x = target.x; state.robot.y = target.y; state.message = '앞으로 한 칸.';
      } else if (event.type === 'turn') {
        event.fromDir = state.robot.dir;
        state.robot.dir = (state.robot.dir + (event.command === 'right' ? 1 : 3)) % 4;
        event.toDir = state.robot.dir; state.message = event.command === 'right' ? '오른쪽으로 돌아요.' : '왼쪽으로 돌아요.';
      } else if (event.type === 'wait') state.message = '한 박자 기다려요. 시간 ' + state.movementCount + '.';
      else if (event.type === 'repeat') state.message = '반복 ' + event.iteration + ' / ' + event.count + '회.';
      else if (event.type === 'condition') state.message = (event.condition === 'blocked' ? '앞이 막혔나요?' : '지금 별 표식 위인가요?') + ' → ' + (event.result ? '예' : '아니요');
      else if (event.type === 'call') {
        if (state.callStack.length >= LIMITS.callDepth) return fail('depth', '함수는 두 겹까지만 부를 수 있어요.');
        state.callStack.push({ target: event.target, callId: event.id }); state.message = event.target + ' 안으로 들어가요.';
      } else if (event.type === 'return') { state.callStack.pop(); state.message = event.target + '에서 돌아왔어요. 다음 명령을 이어가요.'; }
      if (timedAction && hazardState(map, state.movementCount).active.some(cell => cell.x === state.robot.x && cell.y === state.robot.y)) {
        const { type: action, ...detail } = event;
        return fail('hazard', '시간 ' + state.movementCount + '에 이 칸이 켜졌어요. 기다리기나 명령 순서를 바꿔 지나가 보세요.',
          { ...detail, action, at: { x: state.robot.x, y: state.robot.y } });
      }
      if (tile(state.robot.x, state.robot.y) === 'H') {
        state.status = 'success'; state.message = '집에 도착했어요!'; state.event = Object.assign({}, event, { type: 'success', action: event.type });
      }
      return snapshot();
    }
    function cancel() {
      if (state.status === 'ready' || state.status === 'running') { state.status = 'cancelled'; state.event = { type: 'cancel' }; state.message = '실행을 멈췄어요. 작성한 명령은 그대로예요.'; }
      return snapshot();
    }
    return { step, snapshot, cancel };
  }
  return Object.freeze({ LIMITS, DIRECTIONS, validate, createRunner, validMap, hazardState });
});
