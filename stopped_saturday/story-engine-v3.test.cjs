const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./story-engine.js');

const conditions = ['manual', 'automatic'].flatMap(doorMode => ['takeover', 'ask'].flatMap(helpStyle => [false, true].map(phonePayment => ({ doorMode, helpStyle, phonePayment }))));
function finish(s, pick = () => 0) {
  while (E.getNode(s)) s = E.choose(s, pick(E.getNode(s), s));
  return s;
}
function until(s, sceneId, overrides = {}) {
  while (E.getNode(s) && s.scene !== sceneId) {
    const node = E.getNode(s);
    const id = overrides[node.sceneId] || (node.sceneId === 'R05' ? 'R05-later' : node.choices[0].id);
    s = E.choose(s, id);
  }
  assert.equal(s.scene, sceneId);
  return s;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

test('v3 starts at 오전 10:12 and interleaves seven distinct scenes with the preserved five core scenes', () => {
  const start = E.freshState();
  assert.equal(E.SCENARIO_VERSION, '3');
  assert.equal(start.minuteOfDay, 612);
  assert.equal(start.elapsedMinutes, 0);
  assert.equal(E.getNode(start).time, '오전 10:12');
  assert.equal(E.turnLimit(start), 12);
  const end = finish(start);
  assert.deepEqual(end.history.map(h => h.sceneId), ['R01', 'morning', 'outside', 'R02', 'outing_lunch', 'R03', 'afternoon', 'R04', 'R05', 'evening', 'R06', 'R07']);
  assert.equal(end.coreStep, 5);
  assert.equal(end.choiceIds.length, 12);
  assert.equal(E.choose(end, 0), end);
});

test('legacy v2 facade preserves five choices, old timestamps and strict replay compatibility', () => {
  const old = E.forVersion('2');
  const start = E.freshState({ scenarioVersion: '2' });
  assert.equal(E.turnLimit(start), 5);
  assert.equal(E.getNode(start).time, '10:12 · 토요일 오전');
  const end = finish(start);
  assert.equal(end.choiceIds.length, 5);
  assert.deepEqual(E.replay({ scenarioVersion: '2', scenarioId: 'classic', conditions: end.initialConditions, choiceIds: end.choiceIds }), old.replay({ scenarioId: 'classic', conditions: end.initialConditions, choiceIds: end.choiceIds }));
  assert.deepEqual(E.determineEnding(end), old.determineEnding(end));
  assert.deepEqual(E.bodyDescription(end), old.bodyDescription(end));
  assert.equal(E.forVersion('3'), E);
  assert.throws(() => E.forVersion('4'));
});

test('every completed route records only the advertised duration with no hidden jumps', () => {
  for (const scenario of E.SCENARIOS) for (const condition of conditions) for (let option = 0; option < 3; option++) {
    let s = E.freshState({ scenarioId: scenario.id, conditions: condition });
    let expected = 612;
    while (E.getNode(s)) {
      const node = E.getNode(s);
      assert.equal(node.time, E.formatTime(expected));
      for (const ch of node.choices) assert.ok(Number.isInteger(ch.durationMinutes) && ch.durationMinutes > 0, ch.id);
      const ch = node.choices[option % node.choices.length];
      const before = JSON.stringify(s);
      const next = E.choose(s, ch.id);
      assert.equal(JSON.stringify(s), before);
      const h = next.history.at(-1);
      assert.equal(h.startMinute, expected);
      expected += ch.durationMinutes;
      assert.equal(h.endMinute, expected);
      assert.equal(h.durationMinutes, ch.durationMinutes);
      assert.equal(next.minuteOfDay, expected);
      assert.equal(next.elapsedMinutes, expected - 612);
      assert.equal(next.motion.energyBefore, s.energy);
      assert.equal(next.motion.energyAfter, next.energy);
      for (const value of Object.values(next.body)) assert.ok(value >= 0 && value <= 10);
      assert.ok(next.body.ankle >= 2);
      assert.ok(next.energy >= 0 && next.energy <= 10);
      s = next;
    }
    assert.equal(s.choiceIds.length, 12);
    assert.deepEqual(E.replay({ scenarioVersion: '3', scenarioId: s.scenarioId, conditions: s.initialConditions, choiceIds: s.choiceIds }), s);
  }
});

test('time formatting handles noon, midnight and the following day', () => {
  assert.equal(E.formatTime(0), '오전 12:00');
  assert.equal(E.formatTime(719), '오전 11:59');
  assert.equal(E.formatTime(720), '오후 12:00');
  assert.equal(E.formatTime(1087), '오후 6:07');
  assert.equal(E.formatTime(1445), '다음 날 오전 12:05');
});

test('a short message and a film consume different visible amounts of time', () => {
  const base = until(E.freshState({ scenarioId: 'home' }), 'R04');
  const film = E.choose(base, 'R04-show');
  const call = E.choose(base, 'R04-talk');
  assert.equal(film.minuteOfDay - call.minuteOfDay, 55);
  assert.match(film.reaction.lines.join(' '), /영화/);
  assert.match(call.reaction.lines.join(' '), /통화/);
});

test('all original core branches remain reachable with one bounded rhythm path, not a twelve-level exhaustive tree', () => {
  const seen = new Set();
  const endings = new Set();
  let leaves = 0;
  function walk(s) {
    const node = E.getNode(s);
    if (!node) { leaves++; endings.add(E.determineEnding(s).id); return; }
    if (node.isRhythm) {
      const id = node.sceneId === 'R05' ? 'R05-later' : node.choices[0].id;
      walk(E.choose(s, id));
    } else {
      for (const ch of node.choices) { seen.add(ch.id); walk(E.choose(s, ch.id)); }
    }
  }
  for (const scenario of E.SCENARIOS) for (const condition of scenario.id === 'classic' ? [conditions[0]] : conditions) walk(E.freshState({ scenarioId: scenario.id, conditions: condition }));
  assert.equal(leaves, 11176);
  assert.equal(seen.size, 94);
  assert.equal(endings.size, 6);
});

test('added scenes have distinct consequences and all twenty-one new choices can be selected', () => {
  const seen = new Set();
  const titles = new Set();
  for (const scenario of E.SCENARIOS) for (let option = 0; option < 3; option++) {
    finish(E.freshState({ scenarioId: scenario.id }), node => {
      if (node.isRhythm) {
        titles.add(node.title);
        const ch = node.choices[option];
        seen.add(ch.id);
        assert.ok(ch.followUpText.length >= 2);
        assert.ok(ch.journalTrace);
        assert.equal(new Set(node.choices.map(item => item.followUpText.join(' '))).size, 3);
      }
      return option % node.choices.length;
    });
  }
  assert.equal(seen.size, 21);
  assert.ok(titles.size >= 7);
});

test('deferred water survives the added activities and can be requested later', () => {
  let s = until(E.freshState({ scenarioId: 'doors' }), 'S10');
  s = E.choose(s, 'S10-defer');
  s = until(s, 'REFLECT', { R05: 'R05-later' });
  assert.equal(s.context.needs.water, 'pending');
  assert.equal(s.context.needs.utensils, 'pending');
  assert.ok(E.getNode(s).choices.some(ch => ch.id === 'REFLECT-request'));
  const received = E.choose(s, 'REFLECT-request');
  assert.equal(received.context.needs.water, 'received');
  assert.match(received.reaction.lines.join(' '), /물과 식기가 놓인다/);
  const unresolved = finish(E.choose(s, 'REFLECT-unresolved'));
  assert.equal(unresolved.context.needs.water, 'pending');
  assert.match(E.determineEnding(unresolved).body, /아직 받지 않았다/);
});

test('a new meal option resolves deferred water only through its explicit request and receipt', () => {
  let s = until(E.freshState({ scenarioId: 'doors' }), 'S10');
  s = until(E.choose(s, 'S10-defer'), 'R05');
  const meal = E.choose(s, 'R05-meal');
  assert.equal(meal.context.needs.water, 'received');
  assert.equal(meal.context.needs.utensils, 'received');
  assert.match(meal.reaction.lines.join(' '), /부탁한다.*놓인 것을 확인/);
  assert.ok(meal.context.social.requests.some(request => request.forWhat.includes('물·식기')));
  const later = E.choose(s, 'R05-later');
  assert.equal(later.context.needs.water, 'pending');
});

test('returning home has real distance and time before later home scenes', () => {
  let s = until(E.freshState({ scenarioId: 'company' }), 'S12');
  const advertised = E.getNode(s).choices.find(ch => ch.id === 'S12-home').durationMinutes;
  const returned = E.choose(s, 'S12-home');
  assert.equal(returned.minuteOfDay - s.minuteOfDay, advertised);
  assert.equal(returned.context.location, 'home');
  assert.match(returned.reaction.lines.join(' '), /집으로 돌아가는 거리는 300m다. 오늘 길을 돌아가느라 0m를 더 이동했고, 준비하고 기다리는 데 \d+분이 걸렸다/);
  assert.match(returned.reaction.lines.join(' '), /집에 돌아오는 데는 12분이 걸렸다/);
  s = until(returned, 'HOME-4');
  assert.equal(s.context.outing, false);
  assert.equal(E.getNode(s).eligibility.matched, false);
  assert.doesNotMatch(E.getNode(s).lines.join(' '), /카페에 도착|엘리베이터에 타서/);
});

test('classic two-floor ascent is preserved and its return is a separate timed event', () => {
  let s = until(E.freshState(), 'outing_lunch');
  s = E.choose(s, 'outing-stairs');
  assert.equal(s.motion.kind, 'stairs');
  assert.ok(s.flags.includes('stairs_taken'));
  const beforeReturn = s.body.shoulder;
  s = E.choose(s, 'R03-radio');
  assert.equal(s.context.location, 'home');
  assert.match(s.reaction.lines.join(' '), /집으로 돌아가는 거리는 300m다/);
  assert.match(s.reaction.lines.join(' '), /집에 돌아오는 데는 12분이 걸렸다/);
  assert.ok(s.body.shoulder >= beforeReturn);
  assert.equal(s.scene, 'afternoon');
});

test('choosing rest keeps the final two scenes restful without forcing sleep or a new project', () => {
  let s = until(E.freshState(), 'evening');
  s = E.choose(s, 'evening-close');
  assert.match(E.getNode(s).lines.join(' '), /이제부터는 쉬기로 했다/);
  for (const ch of E.getNode(s).choices) assert.equal(ch.effect, 'rest');
  s = E.choose(s, 'R06-rest');
  assert.match(E.getNode(s).lines.join(' '), /잠들 필요는 없다/);
  s = E.choose(s, 'R07-leave');
  assert.equal(s.scene, 'end');
  assert.doesNotMatch(s.reaction.lines.join(' '), /잠들었다|아침이 됐다/);
});

test('invalid choices are inert and deeply frozen states are accepted', () => {
  const s = freeze(E.freshState());
  assert.equal(E.choose(s, -1), s);
  assert.equal(E.choose(s, 'missing'), s);
  assert.equal(E.choose(s, 1.1), s);
  assert.equal(E.choose(s, null), s);
  assert.equal(E.choose(s, 0).choiceIds.length, 1);
  assert.throws(() => E.replay({ scenarioVersion: '3', choiceIds: Array(13).fill('R01-check') }));
  assert.throws(() => E.replay({ scenarioVersion: '3', scenarioId: 'classic', choiceIds: ['morning-outside'] }));
});
