(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.BraessTraffic = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const routes = [[1, 1, 0, 0, 0], [0, 0, 1, 1, 0], [1, 0, 0, 1, 1]];
  function config(input = {}) {
    return { demand: Math.max(100, Number(input.demand) || 4000), fixed: Math.max(0, Number(input.fixed ?? 45)), shortcut: Math.max(0, Number(input.shortcut ?? 0)), slope: Math.max(.00001, Number(input.slope) || .01), open: input.open !== false };
  }
  function edgeFlows(flows) { return routes[0].map((_, e) => flows.reduce((s, f, r) => s + f * routes[r][e], 0)); }
  function costs(input, flows) {
    const c = config(input), edges = edgeFlows(flows), edgeTimes = [c.slope * edges[0], c.fixed, c.fixed, c.slope * edges[3], c.shortcut];
    const times = routes.map(r => r.reduce((s, used, e) => s + used * edgeTimes[e], 0));
    const available = c.open ? [0, 1, 2] : [0, 1], best = Math.min(...available.map(i => times[i]));
    return { edges, edgeTimes, times, average: flows.reduce((s, f, i) => s + f * times[i], 0) / c.demand,
      gap: Math.max(0, ...available.filter(i => flows[i] > 1e-7).map(i => times[i] - best)) };
  }
  function equilibrium(input) {
    const c = config(input), threshold = (c.fixed - c.shortcut) / c.slope;
    const z = c.open ? Math.max(0, Math.min(c.demand, 2 * threshold - c.demand)) : 0;
    const flows = [(c.demand - z) / 2, (c.demand - z) / 2, z];
    return { flows, ...costs(c, flows) };
  }
  // Pairwise exact line search on the Beckmann potential for affine link costs.
  // A route that loses all its traffic is emptied exactly, avoiding phantom drivers.
  function step(input, before) {
    const c = config(input), flows = before.slice(), available = c.open ? [0, 1, 2] : [0, 1];
    const result = costs(c, flows), low = available.reduce((a, b) => result.times[a] <= result.times[b] ? a : b);
    const used = available.filter(i => flows[i] > 1e-7), high = used.reduce((a, b) => result.times[a] >= result.times[b] ? a : b);
    const gap = result.times[high] - result.times[low];
    if (gap < .015) return { ...equilibrium(c), moved: 0, from: high, to: low, settled: true };
    const curvature = [0, 3].reduce((s, e) => s + c.slope * (routes[high][e] - routes[low][e]) ** 2, 0);
    const moved = Math.min(flows[high], curvature ? gap / curvature : flows[high]);
    flows[high] -= moved; flows[low] += moved;
    return { flows, ...costs(c, flows), moved, from: high, to: low, settled: false };
  }
  function potential(input, flows) { const c = config(input), f = edgeFlows(flows); return .5 * c.slope * (f[0] ** 2 + f[3] ** 2) + c.fixed * (f[1] + f[2]) + c.shortcut * f[4]; }
  return { config, routes, edgeFlows, costs, equilibrium, step, potential };
});
