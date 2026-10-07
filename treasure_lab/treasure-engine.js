(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TreasureLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLS = 12, ROWS = 9, DAYS = 100;
  const policies = ['instant', 'periodic', 'independent'];
  const labels = { instant: '즉시 공유', periodic: '주기적 공유', independent: '각자 탐색' };
  function random(seed, a = 0, b = 0, c = 0) {
    let x = (seed ^ Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263) ^ Math.imul(c + 1, 1274126177)) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  function makeField(seed, terrain) {
    const shift = random(seed, 7) > .5 ? 1 : -1;
    const peaks = terrain === 'simple' ? [[6 + shift, 3, 95, 3.4]] : [[3, 6, 55, 2.6], [9 + shift * .4, 1.5, 98, 1.2], [9, 7, 38, 1.8]];
    return Array.from({ length: COLS * ROWS }, (_, i) => {
      const x = i % COLS, y = Math.floor(i / COLS);
      return Math.round(Math.max(...peaks.map(([px, py, height, width]) => height * Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * width ** 2)))) + random(seed, i, 14) * 4);
    });
  }
  function create(options = {}) {
    const config = Object.assign({ seed: 4, terrain: 'hidden', exploration: .35, period: 8, depletion: false }, options);
    config.seed = Number(config.seed) >>> 0;
    config.exploration = Math.max(.05, Math.min(.95, Number(config.exploration)));
    config.period = Math.max(1, Math.round(Number(config.period)));
    if (config.terrain === 'depleting') config.depletion = true;
    const field = makeField(config.seed, config.terrain);
    const worlds = policies.map(policy => {
      const agents = Array.from({ length: 6 }, (_, id) => {
        const cell = (ROWS - 2) * COLS + id * 2;
        return { id, cell, previous: cell, known: { [cell]: field[cell] }, observed: { [cell]: 0 }, action: '출발', earned: 0 };
      });
      const visited = {}; agents.forEach(a => { visited[a.cell] = field[a.cell]; });
      const world = { policy, agents, visited, remaining: field.map(() => 1), total: 0, best: Math.max(...Object.values(visited)), history: [], lastShared: 0 };
      if (policy === 'instant') share(world, 0);
      return world;
    });
    return { config, field, worlds, day: 0, order: null, interventions: [] };
  }
  function share(world, day) {
    const combined = {}, observed = {};
    for (const agent of world.agents) for (const cell of Object.keys(agent.known)) {
      if (!(cell in observed) || agent.observed[cell] >= observed[cell]) { combined[cell] = agent.known[cell]; observed[cell] = agent.observed[cell]; }
    }
    for (const agent of world.agents) { agent.known = Object.assign({}, combined); agent.observed = Object.assign({}, observed); }
    world.lastShared = day;
  }
  function order(state, cell) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= state.field.length || state.day >= DAYS) return false;
    state.order = cell;
    return true;
  }
  function step(state) {
    if (state.day >= DAYS) return false;
    const { config, field, day } = state;
    for (const world of state.worlds) {
      const actions = world.agents.map(agent => {
        const known = Object.keys(agent.known).map(Number);
        const best = known.reduce((a, b) => agent.known[b] > agent.known[a] ? b : a);
        const reward = agent.known[best];
        const exploreChance = config.exploration * (.08 + .92 * Math.pow(1 - reward / 102, 3));
        const unknown = field.map((_, i) => i).filter(i => !(i in agent.known));
        if (agent.id === 0 && state.order !== null) return { cell: state.order, action: '지정 시추' };
        if (unknown.length && random(config.seed, day, agent.id, 1) < exploreChance) {
          const near = unknown.filter(i => Math.abs(i % COLS - best % COLS) + Math.abs(Math.floor(i / COLS) - Math.floor(best / COLS)) <= 3);
          const pool = near.length && random(config.seed, day, agent.id, 2) < .9 ? near : unknown;
          return { cell: pool[Math.floor(random(config.seed, day, agent.id, 3) * pool.length)], action: '새 칸 시추' };
        }
        return { cell: best, action: '알던 곳 채굴' };
      });
      // Decisions use the previous day's knowledge. A day's new finds are shared after all six actions.
      actions.forEach(({ cell, action }, id) => {
        const agent = world.agents[id];
        agent.previous = agent.cell; agent.cell = cell; agent.action = action;
        const earned = field[cell] * world.remaining[cell] * (action === '알던 곳 채굴' ? 1 : .25);
        agent.earned = earned; world.total += earned;
        world.visited[cell] = field[cell];
        if (config.depletion) world.remaining[cell] = Math.max(.02, world.remaining[cell] - .06);
        agent.known[cell] = field[cell] * world.remaining[cell]; agent.observed[cell] = (day + 1) * 6 + id;
      });
      world.best = Math.max(...Object.values(world.visited));
      if (world.policy === 'instant' || (world.policy === 'periodic' && (day + 1) % config.period === 0)) share(world, day + 1);
      world.history.push(Math.round(world.total));
    }
    if (state.order !== null) state.interventions.push({ day: day + 1, cell: state.order });
    state.order = null; state.day++;
    return true;
  }
  function run(state, count = DAYS) { for (let i = 0; i < count && step(state); i++); return state; }
  function summary(state) {
    return state.worlds.map(w => ({ policy: w.policy, total: Math.round(w.total), best: w.best, explored: Object.keys(w.visited).length, lastShared: w.lastShared }));
  }
  return { COLS, ROWS, DAYS, policies, labels, random, makeField, create, share, order, step, run, summary };
});
