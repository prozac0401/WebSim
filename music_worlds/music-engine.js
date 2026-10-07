(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MusicWorlds = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMIT = 400;
  const titles = ['새벽 산책', '종이비행기', '작은 파도', '도시의 불빛', '느린 우주', '여름 편지', '초록 신호', '마지막 별'];
  const genres = ['어쿠스틱', '일렉트로닉', '재즈'];
  function random(seed, a = 0, b = 0, c = 0) {
    let x = (seed ^ Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263) ^ Math.imul(c + 1, 1274126177)) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  function create(options = {}) {
    const config = Object.assign({ seed: 4621, mode: 'ranked', influence: .8, spread: .45 }, options);
    config.seed = Number(config.seed) >>> 0;
    config.influence = Math.max(0, Math.min(1.5, Number(config.influence)));
    config.spread = Math.max(0, Math.min(1, Number(config.spread)));
    const songs = titles.map((title, id) => ({ id, title, genre: id % 3, quality: .65 + (random(config.seed, id, 16) - .5) * config.spread }));
    return { config, songs, listeners: 0, worlds: Array.from({ length: 4 }, (_, id) => ({ id, counts: songs.map(() => 0), exposures: songs.map(() => 0), utility: 0, promotion: null, history: [], last: null })), interventions: [] };
  }
  function promote(state, worldIndex, songId) {
    const world = state.worlds[worldIndex];
    if (!world || !state.songs[songId] || state.listeners >= LIMIT || world.promotion) return false;
    const remaining = Math.min(20, LIMIT - state.listeners);
    world.promotion = { song: songId, remaining };
    state.interventions.push({ at: state.listeners, world: worldIndex, song: songId, listeners: remaining });
    return true;
  }
  function step(state) {
    if (state.listeners >= LIMIT) return false;
    const { config, listeners: n, songs } = state;
    const taste = [0, 1, 2].map(g => (random(config.seed, n, g, 90) - .5) * .6);
    for (const w of state.worlds) {
      // Same listener taste at arrival n in all worlds; discovery and momentary judgments differ by world.
      const candidates = songs.map(s => {
        const exposureWeight = config.mode === 'ranked' ? Math.pow(w.counts[s.id] + 2, 1.1) : 1;
        return { id: s.id, key: -Math.log(Math.max(1e-9, random(config.seed, n, w.id * 20 + s.id, 1))) / exposureWeight };
      }).sort((a, b) => a.key - b.key).slice(0, 3).map(s => s.id);
      if (w.promotion) {
        if (!candidates.includes(w.promotion.song)) candidates[2] = w.promotion.song;
        w.promotion.remaining--;
        if (w.promotion.remaining <= 0) w.promotion = null;
      }
      let selected = candidates[0], bestScore = -Infinity, selectedUtility = 0;
      for (const id of candidates) {
        w.exposures[id]++;
        const utility = songs[id].quality + taste[songs[id].genre];
        const judgmentNoise = (random(config.seed, n, w.id * 20 + id, 2) - .5) * .26;
        const popular = config.mode === 'independent' ? 0 : config.influence * Math.log(1 + w.counts[id]) / Math.log(4 + n);
        const score = utility + judgmentNoise + popular;
        if (score > bestScore) { selected = id; bestScore = score; selectedUtility = utility; }
      }
      w.counts[selected]++; w.utility += selectedUtility;
      w.last = { candidates, selected, taste: taste.map(t => Math.round(t * 100)) };
      w.history.push(leader(w));
    }
    state.listeners++;
    return true;
  }
  function run(state, n = LIMIT) { for (let i = 0; i < n && step(state); i++); return state; }
  function leader(w) { return w.counts.reduce((a, value, i, counts) => value > counts[a] ? i : a, 0); }
  function stats(state) {
    const tops = state.listeners ? state.worlds.map(leader) : [];
    return {
      leaders: tops,
      differentLeaders: new Set(tops).size,
      concentration: state.listeners ? state.worlds.reduce((n, w) => n + Math.max(...w.counts) / state.listeners, 0) / 4 : 0,
      satisfaction: state.listeners ? state.worlds.reduce((n, w) => n + w.utility / state.listeners, 0) / 4 : 0
    };
  }
  function compare(options = {}) {
    return ['independent', 'visible', 'ranked'].map(mode => { const state = run(create(Object.assign({}, options, { mode }))); return { mode, ...stats(state) }; });
  }
  function fork(state, worldIndex, songId, horizon = LIMIT - state.listeners) {
    if (!state.worlds[worldIndex] || !state.songs[songId] || state.listeners >= LIMIT || state.worlds[worldIndex].promotion) return null;
    // Preserve world id and arrival index: both branches consume exactly the same indexed random draws.
    const control = JSON.parse(JSON.stringify(state)), promoted = JSON.parse(JSON.stringify(state));
    const at = state.listeners, length = Math.max(0, Math.min(LIMIT - at, Math.floor(horizon)));
    promote(promoted, worldIndex, songId);
    const checkpoints = [];
    for (let i = 0; i < length; i++) {
      step(control); step(promoted);
      checkpoints.push({ at: control.listeners, control: control.worlds[worldIndex].counts[songId], promoted: promoted.worlds[worldIndex].counts[songId] });
    }
    return { at, to: control.listeners, world: worldIndex, song: songId, initial: state.worlds[worldIndex].counts[songId], initialExposures: state.worlds[worldIndex].exposures[songId], control, promoted, checkpoints };
  }
  return { LIMIT, titles, genres, random, create, promote, step, run, leader, stats, compare, fork };
});
