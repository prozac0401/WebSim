(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoadNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TOLERANCE = 1e-6, FLOW_EPSILON = 1e-9, MAX_ITERATIONS = 30000;
  const node = (id, label, x, y) => ({ id, label, x, y });
  const edge = (id, from, to, label, a, b, controlled = false) => ({ id, from, to, label, a, b, controlled });
  const maps = [
    {
      id: 'river', name: '강을 건너는 도시', description: '북쪽과 가운데 다리를 따로 여닫고, 남쪽 다리로 돌아가는 흐름을 비교합니다.', source: 's', sink: 't', defaultDemand: 4000,
      nodes: [node('s', '집', .06, .5), node('n', '북안', .29, .2), node('l', '남안', .29, .8), node('r', '북동', .7, .2), node('d', '남동', .7, .8), node('t', '회사', .94, .5)],
      edges: [edge('s-n', 's', 'n', '북쪽 진입', .004, 5), edge('s-l', 's', 'l', '남쪽 진입', .001, 14), edge('north-bridge', 'n', 'r', '북쪽 다리', .006, 8, true), edge('south-bridge', 'l', 'd', '남쪽 다리', .003, 14), edge('r-t', 'r', 't', '북동 출구', .002, 6), edge('d-t', 'd', 't', '남동 출구', .004, 4), edge('middle-bridge', 'n', 'd', '가운데 다리', .008, 2, true), edge('bank', 'n', 'l', '강변 연결', .001, 1)]
    },
    {
      id: 'ring', name: '순환도로와 도심', description: '바깥 고리와 도심 통과 경로를 비교합니다. 도심 진입과 남쪽 출구를 따로 조절합니다.', source: 's', sink: 't', defaultDemand: 4000,
      nodes: [node('s', '집', .06, .5), node('a', '북서', .28, .16), node('b', '북동', .72, .16), node('c', '남서', .28, .84), node('d', '남동', .72, .84), node('h', '도심', .5, .5), node('t', '회사', .94, .5)],
      edges: [edge('s-a', 's', 'a', '북쪽 진입', .003, 4), edge('a-b', 'a', 'b', '북쪽 외곽', .0008, 20), edge('b-t', 'b', 't', '북쪽 출구', .003, 4), edge('s-c', 's', 'c', '남쪽 진입', .002, 5), edge('c-d', 'c', 'd', '남쪽 외곽', .001, 18), edge('d-t', 'd', 't', '남쪽 출구', .002, 5), edge('center-in', 'a', 'h', '도심 진입', .0005, 1, true), edge('c-h', 'c', 'h', '도심 북행', .008, 2), edge('h-b', 'h', 'b', '도심 동행', .008, 2), edge('center-out', 'h', 'd', '도심 남쪽 출구', .001, 1, true)]
    },
    {
      id: 'grid', name: '격자형 도심', description: '오른쪽과 아래로 가는 일방통행 격자입니다. 중앙 도로가 닫혀도 가장자리를 따라 갈 수 있습니다.', source: 's', sink: 't', defaultDemand: 4000,
      nodes: [node('s', '집', .08, .14), node('a', '가', .5, .14), node('b', '나', .92, .14), node('c', '다', .08, .5), node('h', '중앙', .5, .5), node('d', '라', .92, .5), node('e', '마', .08, .86), node('f', '바', .5, .86), node('t', '회사', .92, .86)],
      edges: [edge('s-a', 's', 'a', '북서 가로', .002, 6), edge('a-b', 'a', 'b', '북동 가로', .001, 9), edge('c-h', 'c', 'h', '중앙 서쪽', .009, 2), edge('center-east', 'h', 'd', '중앙 동쪽 길', .001, 1, true), edge('e-f', 'e', 'f', '남서 가로', .001, 9), edge('f-t', 'f', 't', '남동 가로', .002, 6), edge('s-c', 's', 'c', '서쪽 위', .004, 4), edge('a-h', 'a', 'h', '중앙 북쪽', .007, 2), edge('b-d', 'b', 'd', '동쪽 위', .002, 8), edge('c-e', 'c', 'e', '서쪽 아래', .002, 8), edge('center-south', 'h', 'f', '중앙 남쪽 길', .004, 1, true), edge('d-t', 'd', 't', '동쪽 아래', .004, 4)]
    },
    {
      id: 'double', name: '두 개의 지름길', description: '원래의 네 교차점 구조를 두 번 이어 붙였습니다. 앞쪽과 뒤쪽 지름길의 영향을 따로 비교합니다.', source: 's', sink: 't', defaultDemand: 4000,
      nodes: [node('s', '집', .035, .5), node('a', '앞 위', .23, .17), node('b', '앞 아래', .23, .83), node('m', '중간', .5, .5), node('c', '뒤 위', .77, .17), node('d', '뒤 아래', .77, .83), node('t', '회사', .965, .5)],
      edges: [edge('s-a', 's', 'a', '앞 혼잡 진입', .01, 0), edge('a-m', 'a', 'm', '앞 일정 출구', 0, 45), edge('s-b', 's', 'b', '앞 일정 진입', 0, 45), edge('b-m', 'b', 'm', '앞 혼잡 출구', .01, 0), edge('first-shortcut', 'a', 'b', '앞쪽 지름길', 0, 0, true), edge('m-c', 'm', 'c', '뒤 혼잡 진입', .01, 0), edge('c-t', 'c', 't', '뒤 일정 출구', 0, 45), edge('m-d', 'm', 'd', '뒤 일정 진입', 0, 45), edge('d-t', 'd', 't', '뒤 혼잡 출구', .01, 0), edge('second-shortcut', 'c', 'd', '뒤쪽 지름길', 0, 0, true)]
    }
  ];
  // Enumerate actual directed simple source-to-sink paths once. Closing an edge never changes route indices.
  for (const map of maps) {
    const routes = [];
    function visit(at, edgeIds, visited) {
      if (at === map.sink) {
        const via = edgeIds.slice(0, -1).map(id => map.nodes.find(n => n.id === map.edges.find(e => e.id === id).to).label);
        routes.push({ id: 'r' + routes.length, label: via.join(' → '), edgeIds });
        return;
      }
      for (const e of map.edges) if (e.from === at && !visited.has(e.to)) visit(e.to, [...edgeIds, e.id], new Set([...visited, e.to]));
    }
    visit(map.source, [], new Set([map.source]));
    map.routes = routes;
    map.nodes.forEach(Object.freeze); map.edges.forEach(Object.freeze);
    routes.forEach(r => { Object.freeze(r.edgeIds); Object.freeze(r); });
    Object.freeze(map.nodes); Object.freeze(map.edges); Object.freeze(map.routes); Object.freeze(map);
  }
  Object.freeze(maps);
  const finite = (value, fallback) => value == null || typeof value === 'boolean' || typeof value === 'string' && !value.trim() ? fallback : Number.isFinite(Number(value)) ? Number(value) : fallback;
  const getMap = id => maps.find(m => m.id === id) || maps[0];
  function config(input = {}) {
    const map = getMap(input.mapId), requested = new Set(Array.isArray(input.closed) ? input.closed : []);
    return { mapId: map.id, demand: Math.min(1e6, Math.max(100, finite(input.demand, map.defaultDemand))), fixed: Math.min(1e4, Math.max(0, finite(input.fixed, 45))), shortcut: Math.min(1e4, Math.max(0, finite(input.shortcut, 0))), closed: map.edges.filter(e => requested.has(e.id)).map(e => e.id) };
  }
  const incidence = new Map(maps.map(map => [map.id, map.routes.map(r => map.edges.map(e => Number(r.edgeIds.includes(e.id))))]));
  function availableRoutes(c, map) { const shut = new Set(c.closed); return map.routes.map((r, i) => r.edgeIds.every(id => !shut.has(id)) ? i : -1).filter(i => i >= 0); }
  function cleanFlows(map, flows) { return map.routes.map((_, i) => Math.max(0, finite(flows?.[i], 0))); }
  function costs(input, before) {
    const c = config(input), map = getMap(c.mapId), flows = cleanFlows(map, before), matrix = incidence.get(map.id), available = availableRoutes(c, map);
    const edges = map.edges.map((_, e) => flows.reduce((sum, f, i) => sum + f * matrix[i][e], 0));
    const edgeTimes = map.edges.map((e, i) => e.a * edges[i] + e.b * (c.fixed / 45) + (e.controlled ? c.shortcut : 0));
    const times = matrix.map(row => row.reduce((sum, used, e) => sum + used * edgeTimes[e], 0));
    const best = available.length ? Math.min(...available.map(i => times[i])) : Infinity;
    const used = available.filter(i => flows[i] > FLOW_EPSILON);
    return { edges, edgeTimes, times, available, average: flows.reduce((sum, f, i) => sum + f * times[i], 0) / c.demand, gap: available.length ? Math.max(0, ...used.map(i => times[i] - best)) : Infinity };
  }
  // Return null for a disconnected network; otherwise conserve the configured hourly demand.
  // Valid surviving route flows are retained. Displaced flow is placed on the cheapest remaining route before equilibration.
  function reroute(input, before) {
    const c = config(input), map = getMap(c.mapId), available = availableRoutes(c, map);
    if (!available.length) return null;
    const allowed = new Set(available), flows = cleanFlows(map, before).map((f, i) => allowed.has(i) ? f : 0);
    let sum = flows.reduce((a, b) => a + b, 0);
    if (sum > c.demand) { for (const i of available) flows[i] *= c.demand / sum; sum = flows.reduce((a, b) => a + b, 0); }
    if (sum < c.demand) {
      const now = costs(c, flows), low = available.reduce((a, b) => now.times[a] <= now.times[b] ? a : b);
      flows[low] += c.demand - sum;
    }
    const anchor = available.reduce((a, b) => flows[a] >= flows[b] ? a : b);
    flows[anchor] = Math.max(0, c.demand - flows.reduce((n, f, i) => n + (i === anchor ? 0 : f), 0));
    return flows;
  }
  function potential(input, before) {
    const c = config(input), map = getMap(c.mapId), result = costs(c, before);
    return map.edges.reduce((sum, e, i) => sum + .5 * e.a * result.edges[i] ** 2 + (e.b * c.fixed / 45 + (e.controlled ? c.shortcut : 0)) * result.edges[i], 0);
  }
  function step(input, before) {
    const c = config(input), map = getMap(c.mapId), flows = reroute(c, before);
    if (!flows) return { flows: Array(map.routes.length).fill(0), ...costs(c, []), average: Infinity, moved: 0, from: null, to: null, settled: false };
    const result = costs(c, flows), low = result.available.reduce((a, b) => result.times[a] <= result.times[b] ? a : b);
    const used = result.available.filter(i => flows[i] > FLOW_EPSILON), high = used.reduce((a, b) => result.times[a] >= result.times[b] ? a : b);
    if (result.gap <= TOLERANCE) return { flows, ...result, moved: 0, from: high, to: low, settled: true };
    const matrix = incidence.get(map.id), curvature = map.edges.reduce((sum, e, i) => sum + e.a * (matrix[high][i] - matrix[low][i]) ** 2, 0);
    const moved = Math.min(flows[high], curvature > 0 ? (result.times[high] - result.times[low]) / curvature : flows[high]);
    flows[high] -= moved; flows[low] += moved;
    const after = costs(c, flows);
    return { flows, ...after, moved, from: high, to: low, settled: after.gap <= TOLERANCE };
  }
  const equilibriumCache = new Map();
  function cloneResult(r) { return { ...r, flows: [...r.flows], edges: [...r.edges], edgeTimes: [...r.edgeTimes], times: [...r.times], available: [...r.available] }; }
  function equilibrium(input) {
    const c = config(input), key = JSON.stringify(c);
    if (equilibriumCache.has(key)) return cloneResult(equilibriumCache.get(key));
    const map = getMap(c.mapId); let flows = reroute(c, []), result, iterations = 0;
    if (!flows) return { flows: Array(map.routes.length).fill(0), ...costs(c, []), average: Infinity, converged: false, iterations };
    result = costs(c, flows);
    while (result.gap > TOLERANCE && iterations < MAX_ITERATIONS) { result = step(c, flows); flows = result.flows; iterations++; }
    const answer = { flows, ...costs(c, flows), converged: result.gap <= TOLERANCE, iterations };
    if (equilibriumCache.size >= 96) equilibriumCache.delete(equilibriumCache.keys().next().value);
    equilibriumCache.set(key, cloneResult(answer)); return cloneResult(answer);
  }
  function toggle(input, before, edgeId) {
    const c = config(input), map = getMap(c.mapId), e = map.edges.find(e => e.id === edgeId);
    if (!e) return { ok: false, config: c, flows: cleanFlows(map, before), reason: '존재하지 않는 도로입니다.' };
    const closed = new Set(c.closed); if (closed.has(edgeId)) closed.delete(edgeId); else closed.add(edgeId);
    const next = config({ ...c, closed: [...closed] }), flows = reroute(next, before);
    if (!flows) return { ok: false, config: c, flows: cleanFlows(map, before), reason: '집에서 회사로 가는 모든 경로가 끊겨 이 도로는 닫을 수 없습니다.' };
    return { ok: true, config: next, flows, reason: closed.has(edgeId) ? e.label + '을 닫고 남은 경로로 흐름을 옮겼습니다.' : e.label + '을 열었습니다. 경로 조정을 진행해 보세요.' };
  }
  function comparisons(input) {
    const c = config(input), map = getMap(c.mapId), controls = map.edges.filter(e => e.controlled).map(e => e.id), fixedClosed = c.closed.filter(id => !controls.includes(id));
    return [0, 1, 2, 3].map(mask => {
      const closed = [...fixedClosed, ...controls.filter((_, i) => mask & (1 << i))], next = config({ ...c, closed }), result = equilibrium(next);
      return { closed: next.closed, available: result.available.length > 0, flows: result.flows, average: result.available.length ? result.average : null, gap: result.available.length ? result.gap : null, converged: result.converged, iterations: result.iterations };
    });
  }
  return { maps, getMap, config, costs, equilibrium, step, potential, reroute, toggle, comparisons, TOLERANCE };
});
