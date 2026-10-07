(function (root, factory) {
  const base = typeof module === 'object' && module.exports ? require('./treasure-engine.js') : root.TreasureLab;
  const api = factory(base);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TreasureExpedition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B) {
  'use strict';
  const { COLS, ROWS, policies, labels, random } = B, DAYS = 60;
  const terrainLabels = { plain: '평지 · 이동 1일', mountain: '산지 · 이동 3일', river: '강 · 통행 불가', bridge: '다리 · 이동 1일', rock: '절벽 · 통행 불가', pass: '고개 · 이동 1일' };
  const costOf = type => ({ plain: 1, mountain: 3, bridge: 1, pass: 1 }[type] || Infinity);
  function geography(kind) {
    return Array.from({ length: COLS * ROWS }, (_, cell) => {
      const x = cell % COLS, y = Math.floor(cell / COLS);
      if (kind === 'meander') {
        // A continuous S-shaped river: the elbows span three cells, with three crossings.
        if ((y === 3 || y === 6) && x >= 5 && x <= 7) return 'river';
        const riverX = y >= 4 && y <= 5 ? 7 : 5;
        if (x === riverX) return [1, 4, 7].includes(y) ? 'bridge' : 'river';
        if (x === 9 && y >= 3 && y <= 5) return y === 4 ? 'pass' : 'mountain';
      } else if (kind === 'ring') {
        // Four cardinal passes pierce a diamond-shaped mountain ring.
        const dx = Math.abs(x - 7), dy = Math.abs(y - 4);
        if (dx + dy === 3) return dx === 0 || dy === 0 ? 'pass' : 'mountain';
      } else if (kind === 'passes') {
        if (x === 6) return y === 2 || y === 7 ? 'pass' : 'mountain';
        if (x === 7 && y > 2 && y < 7) return 'mountain';
      } else {
        if (x === 5) return y === 7 || (kind === 'river' && y === 2) ? 'bridge' : 'river';
        if (x === 8 && y > 2 && y < 7) return y === 4 ? 'pass' : 'mountain';
        if (kind === 'island' && ((x === 9 && y < 3) || (y === 2 && x > 9))) return 'river';
      }
      return 'plain';
    });
  }
  function route(terrain, from, to) {
    if (!Number.isInteger(to) || to < 0 || to >= terrain.length || !Number.isFinite(costOf(terrain[to]))) return null;
    const distance = terrain.map(() => Infinity), previous = [], open = new Set(terrain.map((_, i) => i)); distance[from] = 0;
    while (open.size) {
      let cell = -1, best = Infinity;
      for (const id of open) if (distance[id] < best) { cell = id; best = distance[id]; }
      if (cell < 0) break; open.delete(cell); if (cell === to) break;
      const x = cell % COLS, y = Math.floor(cell / COLS);
      const neighbors = [x > 0 ? cell - 1 : -1, x < COLS - 1 ? cell + 1 : -1, y > 0 ? cell - COLS : -1, y < ROWS - 1 ? cell + COLS : -1];
      for (const next of neighbors) if (open.has(next)) { const d = best + costOf(terrain[next]); if (d < distance[next]) { distance[next] = d; previous[next] = cell; } }
    }
    if (!Number.isFinite(distance[to])) return null;
    const path = [to]; while (path[0] !== from) path.unshift(previous[path[0]]);
    return { path, cost: distance[to] };
  }
  function create(options = {}) {
    const config = Object.assign({ seed: 31, expeditionMap: 'river', budget: 42, exploration: .5, period: 8 }, options);
    config.seed = Number(config.seed) >>> 0; config.budget = Math.max(1, Math.min(60, Math.round(Number(config.budget) || 42))); config.period = Math.max(1, Math.round(Number(config.period) || 8)); config.exploration = Math.max(0, Math.min(1, Number(config.exploration))); config.depletion = true;
    const terrain = geography(config.expeditionMap);
    const field = terrain.map((type, cell) => {
      if (!Number.isFinite(costOf(type))) return 0;
      const x = cell % COLS, y = Math.floor(cell / COLS);
      return Math.round(Math.max(38 * Math.exp(-((x - 2) ** 2 + (y - 6) ** 2) / 5), 98 * Math.exp(-((x - 10) ** 2 + (y - 1) ** 2) / 5), 62 * Math.exp(-((x - 9) ** 2 + (y - 7) ** 2) / 4)) + random(config.seed, cell, 41) * 3);
    });
    const worlds = policies.map(policy => {
      const agents = Array.from({ length: 6 }, (_, id) => {
        const cell = (4 + Math.floor(id / 2)) * COLS + id % 2 + 1;
        return { id, cell, previous: cell, known: { [cell]: field[cell] }, observed: { [cell]: 0 }, budget: config.budget, target: cell, route: [], edgeDays: 0, action: '출발', reason: '현재 위치를 조사했습니다. 가까운 후보지와 먼 후보지를 비교하세요.', earned: 0, journey: [cell] };
      });
      const visited = {}; agents.forEach(a => { visited[a.cell] = field[a.cell]; });
      const w = { policy, agents, visited, remaining: field.map(() => 1), total: 0, best: Math.max(...Object.values(visited)), history: [], lastShared: 0 };
      if (policy === 'instant') B.share(w, 0); return w;
    });
    return { config, terrain, field, worlds, day: 0, order: null, orderAgent: 0, interventions: [], prospects: [6 * COLS + 2, 1 * COLS + 10, 7 * COLS + 9] };
  }
  function preview(state, worldIndex, agentId, target) {
    const agent = state.worlds[worldIndex]?.agents[agentId];
    if (!agent) return { reachable: false, affordable: false, reason: '탐사대 없음' };
    const trip = route(state.terrain, agent.cell, target);
    if (!trip) return { reachable: false, affordable: false, reason: '이어지는 통로가 없습니다', path: [], knownReward: null };
    const totalCost = trip.cost + 1, affordable = totalCost <= agent.budget && state.day + totalCost <= DAYS;
    return { reachable: true, affordable, path: trip.path, days: trip.cost, totalCost, budget: agent.budget, knownReward: target in agent.known ? agent.known[target] : null, reason: affordable ? '이동 뒤 다음 하루에 조사·채굴' : totalCost > agent.budget ? '보급이 부족합니다' : '원정 종료 전에 채굴할 수 없습니다' };
  }
  function order(state, cell, agentId = 0) {
    if (state.day >= DAYS || !Number.isInteger(agentId) || agentId < 0 || agentId >= 6 || !state.worlds.some((_, wi) => preview(state, wi, agentId, cell).affordable)) return false;
    state.order = cell; state.orderAgent = agentId; return true;
  }
  function choose(state, world, agent) {
    const wi = policies.indexOf(world.policy), unseen = state.prospects.filter(cell => !(cell in agent.known));
    const local = state.field.map((_, cell) => cell).filter(cell => !(cell in agent.known) && Math.abs(cell % COLS - agent.cell % COLS) + Math.abs(Math.floor(cell / COLS) - Math.floor(agent.cell / COLS)) <= 3);
    const exploring = random(state.config.seed, state.day, agent.id, 20) < state.config.exploration;
    const pool = exploring ? [...unseen, ...local] : Object.keys(agent.known).map(Number);
    const choices = [...new Set(pool)].map(cell => ({ cell, trip: preview(state, wi, agent.id, cell) })).filter(c => c.trip.affordable);
    if (!choices.length) return { cell: agent.cell, reason: '보급 안에서 새 경로를 찾지 못해 현재 위치를 활용합니다.' };
    choices.forEach(c => { const yieldEstimate = c.cell in agent.known ? agent.known[c.cell] : state.prospects.includes(c.cell) ? 65 : 28; c.score = yieldEstimate / (1 + c.trip.days * .25) + random(state.config.seed, state.day, agent.id, c.cell + 70) * 18; });
    choices.sort((a, b) => b.score - a.score || a.cell - b.cell);
    return { cell: choices[0].cell, reason: exploring ? '미지 후보의 공통 기대값과 이동 비용을 비교해 탐색합니다.' : '기억한 채굴값과 이동 비용을 비교해 활용합니다.' };
  }
  function step(state) {
    if (state.day >= DAYS) return false;
    for (const world of state.worlds) {
      const decisions = world.agents.map(a => a.budget > 0 && !a.route.length && !a.arrived ? choose(state, world, a) : null);
      world.agents.forEach((a, id) => {
        a.earned = 0; a.previous = a.cell;
        if (!a.budget) { a.action = '보급 소진'; a.reason = '보급이 없어 이동과 채굴을 멈춥니다.'; return; }
        let decision = decisions[id];
        if (state.order !== null && state.orderAgent === id) {
          const p = preview(state, policies.indexOf(world.policy), id, state.order);
          if (p.affordable) decision = { cell: state.order, reason: '플레이어가 지정한 원정입니다. 도착 후 하루를 써 조사·채굴합니다.' };
          else a.reason = `지시 미실행: ${p.reason}. 기존 행동을 이어갑니다.`;
        }
        if (decision) { const trip = route(state.terrain, a.cell, decision.cell); a.target = decision.cell; a.route = trip.path.slice(1); a.edgeDays = 0; a.reason = decision.reason; }
        a.budget--;
        if (a.route.length) {
          if (!a.edgeDays) a.edgeDays = costOf(state.terrain[a.route[0]]);
          a.edgeDays--; a.action = a.edgeDays ? `산지 통과 중 · ${a.edgeDays}일 더` : '이동';
          if (!a.edgeDays) { a.cell = a.route.shift(); a.journey.push(a.cell); if (a.journey.length > 60) a.journey.shift(); }
          if (!a.route.length) { a.action = '목표 도착 · 내일 조사'; a.arrived = true; }
        } else {
          const fresh = !(a.cell in a.known); a.earned = state.field[a.cell] * world.remaining[a.cell] * (fresh ? .25 : 1); world.total += a.earned;
          world.visited[a.cell] = state.field[a.cell]; world.remaining[a.cell] = Math.max(.02, world.remaining[a.cell] - .08);
          a.known[a.cell] = state.field[a.cell] * world.remaining[a.cell]; a.observed[a.cell] = (state.day + 1) * 6 + id; a.action = fresh ? '도착지 첫 시추' : '현재 위치 채굴'; a.arrived = false;
        }
      });
      world.best = Math.max(...Object.values(world.visited));
      if (world.policy === 'instant' || world.policy === 'periodic' && (state.day + 1) % state.config.period === 0) B.share(world, state.day + 1);
      world.history.push(Math.round(world.total));
    }
    if (state.order !== null) state.interventions.push({ day: state.day + 1, cell: state.order, agent: state.orderAgent });
    state.order = null; state.day++; return true;
  }
  function run(state, count = DAYS) { for (let i = 0; i < count && step(state); i++); return state; }
  const summary = state => B.summary(state).map((s, i) => ({ ...s, budget: state.worlds[i].agents.reduce((n, a) => n + a.budget, 0) }));
  return { COLS, ROWS, DAYS, policies, labels, random, terrainLabels, costOf, geography, route, create, preview, order, step, run, summary };
});
