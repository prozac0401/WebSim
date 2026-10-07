(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AntEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SIZE = 30;
  const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const cache = new WeakMap();
  const PRESETS = {
    open: { name: '01 · 열린 토양', brief: '벽 없이 시작합니다. 양분을 직접 놓고 한 개미의 운반을 따라가 보세요.', mask: 0 },
    transport: { name: '02 · 개미만 돌아가는 울타리', brief: '같은 위치의 울타리가 개미의 통행만 막습니다. 아래쪽 틈으로 돌아갈 수 있고, 양분은 그대로 확산합니다.', mask: 1 },
    diffusion: { name: '03 · 양분만 막는 막', brief: '개미는 지나가지만 토양 양분의 확산만 막습니다. 같은 시드의 운반 장벽과 비교해 보세요.', mask: 2 },
    free: { name: '자유 실험', brief: '셀 사이의 선을 그려 통행과 확산을 각각 바꿉니다. 벽 안의 자원은 사라지지 않습니다.', mask: 0 }
  };
  function random(s) { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; }
  function neighbors(i) { const x = i % SIZE, y = Math.floor(i / SIZE), a = []; if (x) a.push(i - 1); if (x < SIZE - 1) a.push(i + 1); if (y) a.push(i - SIZE); if (y < SIZE - 1) a.push(i + SIZE); return a; }
  function adjacent(a, b) { return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < SIZE * SIZE && b < SIZE * SIZE && neighbors(a).includes(b); }
  const blocked = (s, a, b, bit) => Boolean((s.walls[key(a, b)] || 0) & bit);
  const cellOf = a => Math.max(0, Math.min(SIZE * SIZE - 1, Math.floor(a.y) * SIZE + Math.floor(a.x)));
  function create(options = {}) {
    const seed = Number(options.seed) >>> 0 || 73;
    const preset = PRESETS[options.preset] ? options.preset : 'open';
    const settings = { count: 100, amount: 50, interval: 5, supply: true, ...options.settings };
    settings.count = Math.max(10, Math.min(500, Math.round(settings.count) || 100));
    const s = { seed, rng: seed, preset, settings, tick: 0, nest: Number.isInteger(options.nest) && options.nest >= 0 && options.nest < 900 ? options.nest : 465, walls: {}, revision: 0, soil: Array.from({ length: 900 }, () => ({ org: 0, nit: 0, plant: 0 })), ants: [], foods: [], nextFoodId: 1, nextPatch: settings.interval * 30, totalInput: 0, manualInput: 0, deliveries: 0, delivered: 0, lastEvent: '같은 출발점에서 실험을 시작합니다.' };
    if (options.walls) s.walls = { ...options.walls };
    else if (PRESETS[preset].mask) for (let y = 0; y < 24; y++) s.walls[key(y * SIZE + 10, y * SIZE + 11)] = PRESETS[preset].mask;
    for (let id = 0; id < settings.count; id++) {
      const cell = Math.floor(random(s) * 900);
      s.ants.push({ id, x: cell % SIZE + .5, y: Math.floor(cell / SIZE) + .5, previousX: cell % SIZE + .5, previousY: Math.floor(cell / SIZE) + .5, carryAmount: 0, waypoint: cell, goal: -1, foodId: null, mode: '탐색', reason: '아직 발견한 양분이 없어 통행 가능한 이웃 칸을 탐색합니다.', direction: random(s) * Math.PI * 2, revision: 0, delivered: 0 });
    }
    for (let i = 0; i < 3; i++) addRandomPatch(s);
    return s;
  }
  function addPatch(s, index, amount = s.settings.amount, manual = true) {
    if (!Number.isInteger(index) || index < 0 || index >= 900 || index === s.nest || !Number.isFinite(amount) || amount <= 0) return false;
    const around = [], x = index % SIZE, y = Math.floor(index / SIZE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < SIZE && y + dy >= 0 && y + dy < SIZE) around.push((y + dy) * SIZE + x + dx);
    s.foods.push({ id: s.nextFoodId++, cell: index, amount: amount * .7, initial: amount * .7 });
    around.forEach(i => { s.soil[i].org += amount * .3 / around.length; });
    s.totalInput += amount;
    if (manual) s.manualInput += amount;
    s.lastEvent = `${manual ? '직접' : '자동'} 투입 +${amount} · 패치 70%, 주변 유기물 30%`;
    return true;
  }
  function addRandomPatch(s) {
    const candidates = [];
    s.soil.forEach((c, i) => { if (i !== s.nest && c.plant < 6) candidates.push(i); });
    if (candidates.length) addPatch(s, candidates[Math.floor(random(s) * candidates.length)], s.settings.amount, false);
  }
  function setWall(s, a, b, mask) {
    if (!adjacent(a, b) || ![0, 1, 2, 3].includes(mask)) return false;
    const k = key(a, b); if ((s.walls[k] || 0) === mask) return false;
    if (mask) s.walls[k] = mask; else delete s.walls[k];
    s.revision++; s.preset = 'free'; cache.delete(s); return true;
  }
  function field(s, target) {
    let memo = cache.get(s); if (!memo || memo.revision !== s.revision) { memo = { revision: s.revision, fields: new Map() }; cache.set(s, memo); }
    if (memo.fields.has(target)) return memo.fields.get(target);
    const d = new Int16Array(900).fill(-1), queue = new Int16Array(900); let head = 0, tail = 1; queue[0] = target; d[target] = 0;
    while (head < tail) { const i = queue[head++]; for (const n of neighbors(i)) if (d[n] < 0 && !blocked(s, i, n, 1)) { d[n] = d[i] + 1; queue[tail++] = n; } }
    memo.fields.set(target, d); return d;
  }
  function path(s, from, target) {
    if (!Number.isInteger(from) || !Number.isInteger(target) || from < 0 || target < 0 || from >= 900 || target >= 900) return [];
    const d = field(s, target); if (d[from] < 0) return [];
    const p = [from]; while (from !== target) { from = neighbors(from).find(n => !blocked(s, from, n, 1) && d[n] === d[from] - 1); p.push(from); } return p;
  }
  function diffuse(s) {
    // Keep the blocked share in its source cell; the outer boundary is also no-flux.
    const next = new Float64Array(900);
    s.soil.forEach((c, i) => {
      const ns = neighbors(i), share = c.nit * .08 / ns.length;
      next[i] += c.nit * .92;
      ns.forEach(n => { next[blocked(s, i, n, 2) ? i : n] += share; });
    });
    s.soil.forEach((c, i) => { c.nit = next[i]; });
  }
  function moveAnt(s, a) {
    a.previousX = a.x; a.previousY = a.y;
    const here = cellOf(a), cx = here % SIZE + .5, cy = Math.floor(here / SIZE) + .5;
    if (a.revision !== s.revision) { a.waypoint = here; a.revision = s.revision; }
    const atCenter = Math.hypot(a.x - cx, a.y - cy) < .00001;
    if (atCenter) {
      if (a.carryAmount > 0 && here === s.nest) {
        s.soil[here].org += a.carryAmount; s.delivered += a.carryAmount; a.delivered += a.carryAmount; s.deliveries++; a.carryAmount = 0; a.goal = -1; a.foodId = null; a.mode = '하역'; a.reason = '둥지에 도착해 운반량을 유기물로 전부 옮겼습니다.'; a.waypoint = here; return;
      }
      if (a.carryAmount > 0) { a.goal = s.nest; a.mode = '운반'; }
      else {
        let found = null, dist = Infinity;
        for (const f of s.foods) { if (f.amount <= 0) continue; const dd = Math.hypot(f.cell % SIZE + .5 - a.x, Math.floor(f.cell / SIZE) + .5 - a.y); if (dd < 80 / 28 && dd < dist && field(s, f.cell)[here] >= 0) { found = f; dist = dd; } }
        if (found && found.cell === here) { const take = Math.min(5, found.amount); found.amount -= take; a.carryAmount = take; a.goal = s.nest; a.foodId = found.id; a.mode = '획득'; a.reason = `패치에서 ${take.toFixed(2)}를 집었습니다. 다음 스텝부터 둥지로 운반합니다.`; a.waypoint = here; return; }
        a.goal = found ? found.cell : -1; a.foodId = found ? found.id : null;
        a.mode = found ? '접근' : '탐색';
      }
      if (a.goal >= 0) {
        const d = field(s, a.goal);
        if (d[here] < 0) { a.waypoint = here; a.mode = '막힘'; a.reason = `운반 장벽 때문에 둥지로 갈 수 없습니다. 들고 있는 ${a.carryAmount.toFixed(2)}는 그대로 보존됩니다.`; return; }
        const next = neighbors(here).find(n => !blocked(s, here, n, 1) && d[n] === d[here] - 1);
        a.waypoint = next === undefined ? here : next;
        a.reason = `${a.carryAmount > 0 ? '양분을 들고 둥지' : '감지한 패치'}까지 통행 가능한 최단 경로 ${d[here]}칸. 막힌 면은 우회합니다.`;
      } else {
        const ns = neighbors(here).filter(n => !blocked(s, here, n, 1));
        a.waypoint = ns.length ? ns[Math.floor(random(s) * ns.length)] : here;
        a.reason = ns.length ? `2.86칸 이내에 도달 가능한 패치가 없어 열린 이웃 ${ns.length}칸 중 하나를 탐색합니다.` : '사방의 운반 장벽으로 갇혔습니다. 장벽 한 면을 지우면 다시 움직입니다.';
      }
    }
    const tx = a.waypoint % SIZE + .5, ty = Math.floor(a.waypoint / SIZE) + .5, dx = tx - a.x, dy = ty - a.y, distance = Math.hypot(dx, dy);
    if (distance) { const speed = Math.min(a.goal < 0 ? .12 : .13, distance); a.x += dx / distance * speed; a.y += dy / distance * speed; a.direction = Math.atan2(dy, dx); }
  }
  function step(s) {
    s.tick++;
    if (s.tick >= s.nextPatch) { if (s.settings.supply) addRandomPatch(s); s.nextPatch = s.tick + s.settings.interval * 30; }
    s.soil.forEach((c, i) => { const mineral = c.org * .02; c.org -= mineral; c.nit += mineral; const uptake = i === s.nest ? 0 : c.nit * .01; c.nit -= uptake; c.plant += uptake; const returned = c.plant * .005; c.plant -= returned; c.org += returned; });
    diffuse(s); s.ants.forEach(a => moveAnt(s, a)); s.foods = s.foods.filter(f => f.amount > 0);
  }
  function totals(s) {
    const t = { organic: 0, available: 0, plant: 0, food: 0, carried: 0, total: 0, input: s.totalInput, manualInput: s.manualInput };
    s.soil.forEach(c => { t.organic += c.org; t.available += c.nit; t.plant += c.plant; });
    s.foods.forEach(f => { t.food += f.amount; }); s.ants.forEach(a => { t.carried += a.carryAmount; });
    t.total = t.organic + t.available + t.plant + t.food + t.carried; t.error = t.total - t.input; return t;
  }
  function inspectCell(s, i) {
    const c = s.soil[i], ns = neighbors(i), outgoing = c.nit * .08 / ns.length;
    return { index: i, x: i % SIZE, y: Math.floor(i / SIZE), ...c, food: s.foods.filter(f => f.cell === i).reduce((sum, f) => sum + f.amount, 0), mineralNext: c.org * .02, uptakeBeforeReturn: i === s.nest ? 0 : (c.nit + c.org * .02) * .01, edges: ns.map(n => ({ to: n, wall: s.walls[key(i, n)] || 0, diffusionShareNow: blocked(s, i, n, 2) ? 0 : outgoing })) };
  }
  return { SIZE, PRESETS, create, random, neighbors, key, blocked, cellOf, addPatch, setWall, path, diffuse, moveAnt, step, totals, inspectCell };
});
