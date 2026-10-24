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

test('a takeaway attempt cannot bring food home while both hands hold crutches', () => {
  for (const scenarioId of ['doors', 'cafe']) for (const condition of conditions) {
    const before = until(E.freshState({ scenarioId, conditions: condition }), 'S09');
    const choice = E.getNode(before).choices.find(ch => ch.id === 'S09-takeout');
    const after = E.choose(before, choice.id);
    assert.match(after.reaction.lines.join(' '), /양손으로 목발.*집에 가져갈 수가 없게/);
    assert.match(after.reaction.lines.join(' '), /빈손으로 집에 돌아온다/);
    assert.doesNotMatch(after.reaction.lines.join(' '), /집 식탁에 앉아 포장해 온|궁금했던 맛은 볼 수/);
    assert.equal(after.context.items.cupLocation, 'store-counter');
    assert.equal(after.context.items.drinkPlace, null);
    assert.equal(after.context.day.ate, false);
    assert.equal(after.context.location, 'home');
    assert.equal(after.context.returned, true);
    assert.equal(after.minuteOfDay - before.minuteOfDay, choice.durationMinutes);
    assert.equal(after.history.at(-1).travelMinutes, 12);
    assert.match(after.traces.at(-1), /운반 불가.*빈손/);
    assert.doesNotMatch(after.history.at(-1).facts.join(' '), /집에서 마셨다/);
    assert.match(E.choose(after, 'R03-snack').reaction.lines.join(' '), /집에 있던 음식/);
    const later = until(after, 'R05');
    assert.match(E.choose(later, 'R05-simple').reaction.lines.join(' '), /집에 있던/);
  }
});

test('packing leftovers later also fails to carry them home with crutches', () => {
  let s = until(E.freshState({ scenarioId: 'doors' }), 'S10');
  s = E.choose(s, 'S10-defer');
  s = until(s, 'REFLECT');
  const choice = E.getNode(s).choices.find(ch => ch.id === 'REFLECT-change-order');
  const after = E.choose(s, choice.id);
  assert.match(after.reaction.lines.join(' '), /양손으로 목발.*집에 가져갈 수 없다/);
  assert.match(after.reaction.lines.join(' '), /빈손으로 집에 돌아온다/);
  assert.equal(after.context.items.cupLocation, 'store-counter');
  assert.equal(after.context.items.drinkPlace, null);
  assert.equal(after.context.needs.water, 'received');
  assert.equal(after.context.needs.utensils, 'not-needed');
  assert.equal(after.minuteOfDay - s.minuteOfDay, choice.durationMinutes);
  assert.equal(finish(after).scene, 'end');
});

test('saved v3 takeaway choice IDs still replay every prefix and the home fallback', () => {
  for (const scenarioId of ['doors', 'cafe']) {
    const lead = scenarioId === 'doors' ? ['S02-ask', 'S03-coordinate'] : ['S05-staff', 'S06-ask'];
    for (const activity of ['R03-radio', 'R03-puzzle', 'R03-snack']) for (const home of ['HOME-4-arrange', 'HOME-4-read-traces', 'HOME-4-quiet']) {
      const ids = ['R01-check', ...lead, 'R02-food', 'S09-takeout', activity, home, 'R04-project', 'R05-later', 'REFLECT-note', 'R06-rest', 'R07-near'];
      const input = { scenarioVersion: '3', scenarioId, conditions: conditions[0] };
      for (let length = 0; length <= ids.length; length++) {
        const replayed = E.replay({ ...input, choiceIds: ids.slice(0, length) });
        assert.equal(replayed.choiceIds.length, length);
        if (length >= 5) assert.equal(replayed.context.items.cupLocation, 'store-counter');
        if (length === 6) assert.equal(E.getNode(replayed).sceneId, 'HOME-4');
        if (length === 12) assert.equal(replayed.scene, 'end');
      }
    }
  }
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

test('new environment keys are optional and do not alter old three-key saved conditions', () => {
  const old = { doorMode: 'manual', helpStyle: 'takeover', phonePayment: false };
  assert.deepEqual(E.normalizeStart({}).conditions, old);
  assert.deepEqual(E.normalizeStart({ conditions: old }).conditions, old);
  assert.deepEqual(Object.keys(E.freshState().initialConditions).sort(), Object.keys(old).sort());
  const expanded = { ...old, doorMode: 'revolving', verticalRoute: 'escalator', orderMode: 'kiosk' };
  assert.deepEqual(E.normalizeStart({ conditions: expanded }).conditions, expanded);
  for (const conditions of [{ verticalRoute: 'lift' }, { orderMode: 'app' }, { doorMode: 'random' }]) assert.throws(() => E.normalizeStart({ conditions }));
  assert.throws(() => E.forVersion('2').normalizeStart({ conditions: expanded }));
});

test('environment variants are deterministic and complete without any runtime random draw', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('Story runtime must not randomize'); };
  try {
    for (const scenario of E.SCENARIOS) for (const doorMode of ['manual', 'automatic', 'revolving']) for (const verticalRoute of ['stairs', 'escalator']) for (const orderMode of ['counter', 'kiosk']) for (const phonePayment of [false, true]) {
      for (let option = 0; option < 4; option++) {
        const start = { scenarioId: scenario.id, conditions: { doorMode, verticalRoute, orderMode, phonePayment } };
        const end = finish(E.freshState(start), node => option % node.choices.length);
        assert.equal(end.choiceIds.length, 12);
        assert.equal(end.minuteOfDay, 612 + end.history.reduce((sum, entry) => sum + entry.durationMinutes, 0));
        assert.ok(end.history.every(entry => Number.isInteger(entry.durationMinutes) && entry.durationMinutes > 0));
        assert.deepEqual(E.replay({ ...start, choiceIds: end.choiceIds }), end);
      }
    }
  } finally { Math.random = random; }
});

test('manual and automatic doors retain old choices but describe different physical pressures', () => {
  const manual = until(E.freshState({ scenarioId: 'doors', conditions: { doorMode: 'manual' } }), 'S02');
  const automatic = until(E.freshState({ scenarioId: 'doors', conditions: { doorMode: 'automatic' } }), 'S02');
  assert.deepEqual(E.getNode(manual).choiceIds, ['S02-ask', 'S02-wait', 'S02-side']);
  assert.deepEqual(E.getNode(automatic).choiceIds, ['S02-auto-enter', 'S02-auto-pause', 'S02-auto-side']);
  assert.match(E.getNode(manual).lines.join(' '), /문을 밀 손과 몸을 지탱할 손/);
  assert.match(E.getNode(automatic).lines.join(' '), /문짝을 밀 필요는 없지만.*닫히기 전에/);
  const before = JSON.stringify(automatic);
  E.getNode(automatic); E.getNode(automatic);
  assert.equal(JSON.stringify(automatic), before);
  assert.equal(E.getNode(automatic).encounter.doorType, 'automatic');
});

test('revolving door never becomes a straight-through passage and side distance is counted once', () => {
  const start = until(E.freshState({ scenarioId: 'doors', conditions: { doorMode: 'revolving' } }), 'S02');
  for (const first of E.getNode(start).choices) {
    const atDoor = E.choose(start, first.id);
    assert.equal(atDoor.context.entrance.passed, false);
    assert.equal(atDoor.context.location, 'entrance');
    assert.deepEqual(E.getNode(atDoor).encounter, { kind: 'door', doorType: 'manual', phase: 'waiting' });
    assert.equal(atDoor.motion.encounter.doorType, first.id === 'S02-revolving-side' ? 'manual' : 'revolving');
    assert.match(atDoor.reaction.lines.join(' '), /회전문|옆문|일반 출입구/);
    for (const nextId of ['S03-coordinate', 'S03-notify-wait']) {
      const inside = E.choose(atDoor, nextId);
      assert.equal(inside.context.entrance.selected, 'verified-side');
      assert.equal(inside.context.entrance.actualMode, 'manual');
      assert.equal(inside.context.entrance.passed, true);
      assert.equal(inside.context.environment.spaceCleared, true);
      assert.equal(inside.context.plan.detourMeters, 30);
      assert.ok(inside.context.social.requests.some(request => /옆문|일반문/.test(request.forWhat)));
      assert.deepEqual(inside.motion.encounter, { kind: 'door', doorType: 'manual', phase: 'passed' });
    }
    const home = E.choose(atDoor, 'S03-leave');
    assert.equal(home.context.location, 'home');
    assert.equal(home.context.entrance.passed, false);
    assert.equal(home.motion.encounter, undefined);
  }
});

test('cafe revolving entrance is bypassed only through a verified ordinary door', () => {
  const s = until(E.freshState({ scenarioId: 'cafe', conditions: { doorMode: 'revolving' } }), 'S05');
  assert.equal(E.getNode(s).encounter.doorType, 'revolving');
  for (const id of ['S05-staff', 'S05-another']) {
    const next = E.choose(s, id);
    assert.equal(next.context.entrance.actualMode, 'manual');
    assert.match(next.reaction.lines.join(' '), /회전문이 아닌 출입구.*잡아 달라고 부탁/);
    assert.equal(next.motion.encounter.doorType, 'manual');
  }
  assert.equal(E.choose(s, 'S05-home').motion.encounter, undefined);
});

test('kiosk branches record explicit assistance, selected menu, payment and retained card', () => {
  for (const phonePayment of [false, true]) {
    const s = until(E.freshState({ scenarioId: 'cafe', conditions: { orderMode: 'kiosk', phonePayment } }), 'S06');
    const node = E.getNode(s);
    assert.equal(node.encounter.kind, 'kiosk');
    assert.equal(node.choices.length, phonePayment ? 4 : 3);
    assert.equal(s.context.items.cardLocation, 'wallet');
    assert.match(node.lines.join(' '), /위쪽 확인 버튼은 멀고 카드 단말기는 화면 아래 옆쪽/);
    for (const choice of node.choices) {
      const next = E.choose(s, choice.id);
      assert.equal(next.context.order.status, 'paid');
      assert.equal(next.context.order.menuConfirmed, true);
      assert.equal(next.context.items.cardLocation, 'wallet');
      assert.ok(next.context.social.requests.length > s.context.social.requests.length);
      assert.match(next.reaction.lines.join(' '), /결제|계산/);
      const preview = E.getNode(next);
      assert.equal(preview.sceneId, 'R02');
      assert.equal(preview.encounter.kind, 'kiosk');
      const checked = E.choose(next, 'R02-food');
      assert.equal(checked.context.order.method, next.context.order.method);
      assert.match(checked.reaction.lines.join(' '), /추가.*선택하지|추가로 주문하지|추가 메뉴/);
    }
  }
});

test('door-focused kiosk preview does not order and does not appear at home or on the street', () => {
  let s = until(E.freshState({ scenarioId: 'doors', conditions: { orderMode: 'kiosk' } }), 'R02');
  assert.equal(E.getNode(s).encounter.kind, 'kiosk');
  s = E.choose(s, 'R02-food');
  assert.equal(s.context.order.status, 'not-ordered');
  assert.match(s.reaction.lines.join(' '), /주문이나 결제 버튼은 누르지 않는다/);
  s = until(s, 'S10');
  const ordered = E.choose(s, 'S10-all');
  assert.equal(ordered.context.order.status, 'paid');
  assert.equal(ordered.context.order.method, 'staff-from-seat');
  assert.equal(ordered.context.needs.water, 'received');
  const home = until(E.freshState({ scenarioId: 'home', conditions: { orderMode: 'kiosk' } }), 'R02');
  assert.equal(E.getNode(home).encounter, undefined);
  const street = until(E.freshState({ scenarioId: 'company', conditions: { orderMode: 'kiosk' } }), 'R02');
  assert.equal(street.context.location, 'street');
  assert.equal(E.getNode(street).encounter, undefined);
});

test('escalator encounter offers only verified fixed routes or return, with no forced boarding', () => {
  for (const scenarioId of ['company', 'planning']) {
    const s = until(E.freshState({ scenarioId, conditions: { verticalRoute: 'escalator' } }), 'S12');
    const node = E.getNode(s);
    assert.equal(node.encounter.kind, 'escalator');
    assert.match(node.lines.join(' '), /움직이는 손잡이.*발판에 올라타지 않고/);
    assert.deepEqual(node.choiceIds, ['S12-escalator-elevator', 'S12-escalator-confirm', 'S12-escalator-home']);
    for (const ch of node.choices) {
      const next = E.choose(s, ch.id);
      assert.equal(next.context.vertical.used, false);
      assert.equal(next.context.vertical.encountered, true);
      assert.equal(next.context.location, ch.id.endsWith('home') ? 'home' : 'elevator-lobby');
      assert.equal(next.motion.encounter, undefined);
      assert.ok(next.history.at(-1).durationMinutes >= ch.durationMinutes);
    }
  }
});

test('classic optional escalator and kiosk retain explicit helpers and do not claim stair climbing', () => {
  const s = until(E.freshState({ conditions: { doorMode: 'revolving', verticalRoute: 'escalator', orderMode: 'kiosk' } }), 'outing_lunch');
  assert.equal(E.getNode(s).encounter.kind, 'escalator');
  assert.ok(!E.getNode(s).choiceIds.includes('outing-stairs'));
  const elevator = E.choose(s, 'outing-escalator-check');
  assert.equal(elevator.context.vertical.used, false);
  assert.equal(elevator.flags.includes('stairs_taken'), false);
  assert.equal(elevator.flags.includes('elevator_used'), true);
  const food = E.choose(s, 'outing-pickup');
  assert.equal(food.context.order.status, 'paid');
  assert.match(food.reaction.lines.join(' '), /직원에게.*부탁.*친구에게.*옮겨 달라고 부탁/);
});

test('a paid kiosk order stays paid while waiting for a seat or asking staff for one', () => {
  const paid = until(E.freshState({ scenarioId: 'cafe', conditions: { orderMode: 'kiosk' } }), 'S06');
  const seated = until(E.choose(paid, 'S06-kiosk-partial'), 'S09');
  for (const id of ['S09-wait', 'S09-ask']) {
    const next = E.choose(seated, id);
    assert.equal(next.context.order.status, 'paid');
    assert.match(next.reaction.lines.join(' '), /이미 주문/);
    assert.doesNotMatch(next.reaction.lines.join(' '), /메뉴를 고르는 일을 잠깐 뒤로|메뉴를 다시 펼쳐/);
  }
});

test('classic automatic door narration and reaction motion show the same entrance', () => {
  const start = until(E.freshState({ conditions: { doorMode: 'automatic' } }), 'outside');
  const entered = E.choose(start, 'outside-ride');
  assert.equal(entered.context.entrance.heldBy, null);
  assert.equal(entered.motion.location, 'hall');
  assert.equal(entered.motion.destinationPose, 'sit');
  assert.deepEqual(entered.motion.encounter, { kind: 'door', doorType: 'automatic', phase: 'passed' });
  assert.match(entered.motion.caption, /자동문/);
  assert.doesNotMatch(entered.motion.caption, /친구가 잡아준/);
});
