(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.InformationCascade = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const logit = p => Math.log(p / (1 - p)), logistic = x => 1 / (1 + Math.exp(-x));
  function choose(logOdds, signal, quality) { const score = logOdds + signal * logit(quality); return Math.abs(score) < 1e-9 ? signal : score > 0 ? 1 : -1; }
  function observeChoice(logOdds, action, quality) {
    let a = 0, b = 0;
    for (const signal of [1, -1]) if (choose(logOdds, signal, quality) === action) { a += signal === 1 ? quality : 1 - quality; b += signal === 1 ? 1 - quality : quality; }
    // An impossible automatic action must never create invented independent evidence.
    return a > 0 && b > 0 ? logOdds + Math.log(a / b) : logOdds;
  }
  function automatic(logOdds, signal, quality, mode) {
    const prior = mode === 'independent' ? 0 : logOdds, action = choose(prior, signal, quality);
    const ignoresSignal = mode === 'choices' && choose(logOdds, 1, quality) === choose(logOdds, -1, quality);
    const after = mode === 'hints' ? logOdds + signal * logit(quality) : mode === 'choices' ? observeChoice(logOdds, action, quality) : 0;
    return { action, before: prior, after, ignoresSignal, posterior: logistic(prior + signal * logit(quality)) };
  }
  function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function generate(seed, quality = .7, size = 13) { const random = rng(seed), truth = random() < .5 ? 1 : -1; return { truth, signals: Array.from({ length: size }, () => random() < quality ? truth : -truth) }; }
  function orderSignals(signals, order, seed = 1) {
    // The player's signal stays the same; only the twelve predecessors move.
    const result = signals.slice(0, -1), random = rng(seed);
    if (order === 'reverse') result.reverse();
    if (order === 'shuffle') for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result.concat(signals.at(-1));
  }
  function run(signals, quality, mode = 'choices') { let logOdds = 0; return signals.map(signal => { const event = automatic(logOdds, signal, quality, mode); logOdds = event.after; return { signal, ...event }; }); }
  function compare(signals, quality, truth) { return ['choices', 'hints', 'independent'].map(mode => { const events = run(signals, quality, mode); return { mode, correct: events.filter(e => e.action === truth).length, a: events.filter(e => e.action === 1).length, b: events.filter(e => e.action === -1).length, cascaded: events.filter(e => e.ignoresSignal).length }; }); }
  return { choose, observeChoice, automatic, rng, generate, orderSignals, run, compare, logistic, logit };
});
