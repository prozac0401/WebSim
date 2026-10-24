const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./story-engine.js').forVersion('2');

const BODY_KEYS = ['ankle', 'shoulder', 'back', 'underarm', 'palm', 'goodLeg'];
const ENDING_NAMES = ['취미에 푹 빠진 토요일', '누군가에게 말을 건 토요일', '외출 방법을 알아본 토요일', '쉬면서 보낸 토요일', '주변을 둘러본 토요일', '새로운 일을 시작한 토요일'];
function play(path) { return path.reduce((s, i) => E.choose(s, i), E.freshState()); }
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function allPaths(visitor, state = E.freshState(), path = []) {
  visitor(state, path);
  if (state.scene !== 'end') E.getNode(state).choices.forEach((_, i) => allPaths(visitor, E.choose(state, i), [...path, i]));
}

test('fresh game preserves 10:12 and four original intents with a concrete description', () => {
  const s = E.freshState();
  const node = E.getNode(s);
  assert.equal(s.energy, 6);
  assert.equal(s.mood, 4);
  assert.equal(s.step, 1);
  assert.match(node.time, /10:12/);
  assert.deepEqual(node.choices.map(c => c.title), [
    '밖으로 나가고 싶다', '집에서 게임이나 새로운 일을 해본다', '누군가에게 연락하고 싶다', '창밖부터 바라본다'
  ]);
  assert.ok(node.lines.includes('시간은 많은데, 발목이 불편해서 할 수 있는 일은 줄었다.'));
});

test('all 1024 paths finish after exactly five choices and keep every status in bounds', () => {
  let complete = 0;
  const distribution = {};
  allPaths((s, path) => {
    assert.equal(s.decisions.length, path.length);
    assert.equal(s.history.length, path.length);
    assert.equal(s.traces.length, path.length);
    assert.equal(s.step, Math.min(5, path.length + 1));
    for (const value of [s.energy, s.mood, ...Object.values(s.body)]) assert.ok(Number.isInteger(value) && value >= 0 && value <= 10);
    assert.ok(s.body.ankle >= 2, 'the story does not heal the injury in one day');
    assert.equal(new Set(s.flags).size, s.flags.length);
    if (s.scene === 'end') {
      complete++;
      assert.equal(path.length, 5);
      assert.equal(E.getNode(s), null);
      const ending = E.determineEnding(s);
      assert.ok(ENDING_NAMES.includes(ending.name));
      distribution[ending.id] = (distribution[ending.id] || 0) + 1;
    } else {
      assert.ok(path.length < 5);
      assert.equal(E.getNode(s).choices.length, 4);
    }
  });
  assert.equal(complete, 1024);
  assert.equal(Object.keys(distribution).length, 6);
  for (const count of Object.values(distribution)) {
    assert.ok(count >= 40, 'every ending has multiple meaningful paths');
    assert.ok(count < 1024 * 0.4, 'no one ending dominates all other routes');
  }
});

test('six named endings have stable reachable representative paths', () => {
  const paths = {
    outing: [0, 0, 0, 0, 0], shared: [0, 0, 1, 1, 3],
    rest: [0, 0, 1, 2, 2], create: [0, 0, 1, 3, 1],
    flow: [0, 2, 0, 0, 0], observe: [0, 2, 1, 0, 0]
  };
  for (const [id, path] of Object.entries(paths)) assert.equal(E.determineEnding(play(path)).id, id);
  assert.deepEqual(new Set(Object.values(E.ENDINGS).map(e => e.name)), new Set(ENDING_NAMES));
});

test('one flow choice no longer overrides an otherwise focused outing', () => {
  const s = play([0, 0, 0, 0, 0]);
  assert.ok(s.flags.includes('flow'));
  assert.equal(E.determineEnding(s).id, 'outing');
});

test('repeated rest changes a contact day instead of locking its initial route', () => {
  const s = play([2, 0, 2, 2, 2]);
  assert.equal(s.route, 'contact');
  assert.equal(E.determineEnding(s).id, 'rest');
});

test('every choice has unique authored consequence paragraphs and a bodily response', () => {
  const ids = new Set();
  for (const node of Object.values(E.NODES)) for (const ch of node.choices) {
    assert.ok(!ids.has(ch.id));
    ids.add(ch.id);
  }
  assert.equal(ids.size, 36);
  allPaths(s => {
    if (!s.history.length) return;
    assert.equal(s.reaction.lines.length, 3);
    assert.ok(s.reaction.title.length > 0);
    assert.ok(s.reaction.lines.every(line => typeof line === 'string' && line.length > 30));
    assert.match(s.reaction.lines[2], /^몸의 반응 · /);
    assert.ok(['walk', 'stairs', 'sit', 'desk', 'phone', 'rest', 'observe'].includes(s.motion.kind));
    assert.ok(['room', 'hall', 'street', 'stairs'].includes(s.motion.location));
  });
});

test('choosing is pure and keeps prior reactions and history intact', () => {
  const start = freeze(E.freshState());
  const first = E.choose(start, 0);
  const firstSnapshot = JSON.stringify(first);
  freeze(first);
  const second = E.choose(first, 0);
  assert.equal(JSON.stringify(first), firstSnapshot);
  assert.equal(start.decisions.length, 0);
  assert.equal(second.history[0].reaction.title, first.reaction.title);
  assert.notEqual(second.body, first.body);
  assert.notEqual(second.flags, first.flags);
  assert.notEqual(second.affinity, first.affinity);
  assert.notEqual(second.history, first.history);
});

test('invalid and late choices do not mutate or advance the game', () => {
  const s = freeze(E.freshState());
  for (const index of [-1, 4, 1.5, NaN, '1', undefined]) assert.equal(E.choose(s, index), s);
  const end = freeze(play([0, 1, 2, 3, 0]));
  assert.equal(E.choose(end, 0), end);
});

test('moving distributes effort across shoulder, hands, back and supporting leg', () => {
  const before = E.choose(E.freshState(), 0);
  const after = E.choose(before, 0);
  for (const key of BODY_KEYS) assert.ok(after.body[key] > before.body[key], `${key} responds to the outing`);
  assert.ok(after.energy < before.energy);
  assert.equal(after.motion.kind, 'walk');
  assert.equal(after.motion.location, 'street');
  assert.match(after.reaction.lines[2], /손바닥/);
});

test('rest gives partial relief while preserving an ankle symptom and accumulated history', () => {
  const before = play([0, 0, 0]);
  const after = E.choose(before, 2);
  assert.ok(after.energy > before.energy);
  for (const key of BODY_KEYS) assert.ok(after.body[key] <= before.body[key]);
  assert.ok(after.body.ankle > 0);
  assert.ok(after.body.shoulder > 0);
  assert.equal(after.history.length, 4);
  assert.equal(after.motion.kind, 'rest');
  assert.match(after.reaction.lines[2], /발목은 묵직.*아직 뻐근하다/);
});

test('desk work can tire the back while hands and supporting leg recover', () => {
  const before = play([1]);
  const after = E.choose(before, 1);
  assert.ok(after.body.back > before.body.back);
  assert.ok(after.body.palm < before.body.palm);
  assert.ok(after.body.goodLeg < before.body.goodLeg);
  assert.equal(after.body.ankle, before.body.ankle);
});

test('low energy is not a failure and never removes the next choices', () => {
  const s = E.freshState();
  s.energy = 0;
  const next = E.choose(s, 0);
  assert.equal(next.energy, 0);
  assert.equal(E.getNode(next).choices.length, 4);
  assert.equal(next.scene, 'outside');
});

test('shared scenes and reactions retain specific earlier events', () => {
  const outing = play([0, 0]);
  const inside = play([1, 0]);
  const helped = play([2, 1]);
  assert.equal(outing.scene, 'outing_lunch');
  assert.match(E.getNode(outing).lines[0], /1층과 2층/);
  assert.match(E.getNode(inside).lines[0], /화면에서 눈을 떼자/);
  assert.match(E.getNode(helped).lines[0], /부탁한 물건/);
  assert.match(E.choose(helped, 0).reaction.lines[0], /부탁했던 목록/);
  assert.notEqual(E.choose(inside, 0).reaction.lines[0], E.choose(helped, 0).reaction.lines[0]);
  const puzzleAfternoon = play([1, 0, 0]);
  const letterAfternoon = play([2, 3, 0]);
  assert.match(E.choose(puzzleAfternoon, 0).reaction.lines[0], /아침에 막혔던 퍼즐/);
  assert.match(E.choose(letterAfternoon, 0).reaction.lines[0], /저장한 문장/);
});

test('body descriptions expose all six regions, their current values and readable sensation', () => {
  const s = play([0, 0, 1]);
  const descriptions = E.bodyDescription(s);
  assert.deepEqual(descriptions.map(d => d.key), BODY_KEYS);
  for (const d of descriptions) {
    assert.equal(d.value, s.body[d.key]);
    assert.ok(d.label.length >= 2);
    assert.ok(d.text.length >= 5);
  }
});

test('photo sharing requires an actual photo choice rather than any observation', () => {
  const observedRoute = play([3, 3, 0, 1]);
  assert.ok(observedRoute.flags.includes('observe'));
  assert.ok(!observedRoute.flags.includes('photos'));
  assert.doesNotMatch(observedRoute.reaction.lines[0], /양말|사진을 고르다/);
  assert.match(observedRoute.reaction.lines[0], /문턱/);
  const tookPhotos = play([3, 0, 0, 1]);
  assert.ok(tookPhotos.flags.includes('photos'));
  assert.match(tookPhotos.reaction.lines[0], /양말/);
});

test('a parcel handoff does not invent a scheduled visitor', () => {
  const parcel = play([0, 3]);
  assert.ok(parcel.flags.includes('help'));
  assert.ok(!parcel.flags.includes('scheduled_help'));
  assert.doesNotMatch(E.getNode(parcel).lines[0], /사람이 올 때/);
  assert.doesNotMatch(E.choose(parcel, 0).reaction.lines[0], /오후에 들른 사람/);
  const scheduled = play([2, 1]);
  assert.ok(scheduled.flags.includes('scheduled_help'));
  assert.match(E.choose(scheduled, 0).reaction.lines[0], /오후에 들른 사람/);
});

test('both evening moods are reachable and choosing rest need not manufacture happiness', () => {
  const quiet = play([0, 2, 2, 2]);
  const curious = play([1, 0, 1, 0]);
  assert.equal(quiet.scene, 'evening');
  assert.equal(curious.scene, 'evening');
  assert.ok(quiet.mood < 8);
  assert.ok(curious.mood >= 8);
  assert.match(E.getNode(quiet).lines[1], /아쉽고 심심한/);
  assert.match(E.getNode(curious).lines[1], /재미있게 한 일.*기분이 괜찮다/);
  const beforeRest = play([0, 2]);
  const afterRest = E.choose(beforeRest, 2);
  assert.equal(beforeRest.mood, afterRest.mood);
  assert.ok(afterRest.energy > beforeRest.energy);
  assert.equal(E.determineEnding(E.choose(quiet, 2)).id, 'rest');
  let low = 0, high = 0;
  allPaths(s => { if (s.scene === 'evening') s.mood < 8 ? low++ : high++; });
  assert.ok(low > 0 && high > 0);
});

test('fresh states reset all histories and sensations without sharing arrays or objects', () => {
  const played = play([0, 0, 0, 0, 0]);
  const reset = E.freshState();
  const second = E.freshState();
  assert.equal(reset.scene, 'morning');
  assert.equal(reset.route, null);
  assert.equal(reset.reaction, null);
  for (const name of ['flags', 'traces', 'decisions', 'history']) assert.deepEqual(reset[name], []);
  assert.deepEqual(reset.body, second.body);
  assert.notEqual(reset.body, second.body);
  assert.notEqual(reset.affinity, second.affinity);
  assert.notDeepEqual(played.body, reset.body);
});

test('the stair encounter belongs only to an actual outside visit and offers four distinct routes', () => {
  const lobby = play([0, 0]);
  assert.equal(lobby.scene, 'outing_lunch');
  assert.equal(lobby.motion.location, 'street');
  assert.match(lobby.reaction.lines.join(' '), /1층 로비/);
  assert.doesNotMatch(lobby.reaction.lines.join(' '), /2층에 닿아|커피 향/);
  assert.deepEqual(E.getNode(lobby).choices.map(ch => ch.id), ['outing-stairs', 'outing-elevator', 'outing-pickup', 'outing-delivery']);
  for (const first of [1, 2, 3]) for (let second = 0; second < 4; second++) {
    const indoors = play([first, second]);
    assert.equal(indoors.scene, 'lunch');
    assert.ok(E.getNode(indoors).choices.every(ch => ch.motion.kind !== 'stairs'));
  }
});

test('choosing the stairs really reaches the second floor, costs effort and preserves a return trip', () => {
  const lobby = play([0, 0]);
  const upstairs = E.choose(lobby, 0);
  assert.equal(upstairs.scene, 'afternoon');
  assert.equal(upstairs.decisions.length, 3);
  assert.equal(upstairs.motion.kind, 'stairs');
  assert.equal(upstairs.motion.location, 'stairs');
  assert.equal(upstairs.motion.destinationPose, 'sit');
  assert.ok(upstairs.flags.includes('stairs_taken'));
  assert.match(upstairs.reaction.lines[1], /2층에 닿아 의자에 앉는다/);
  assert.match(upstairs.reaction.lines[0], /계단참.*쉰다/);
  assert.match(upstairs.reaction.lines[1], /내려갈 때도 힘이 필요/);
  assert.match(E.getNode(upstairs).lines[0], /내려와 집에 돌아왔다/);
  for (const key of BODY_KEYS) assert.ok(upstairs.body[key] > lobby.body[key]);
  assert.equal(upstairs.energy, Math.max(0, lobby.energy - 2));
  assert.equal(E.getNode(upstairs).choices.length, 4);
  assert.equal(play([0, 0, 0, 2, 2]).scene, 'end');
});

test('elevator, ground floor pickup and delivery do not claim a stair ascent or cafe receipt', () => {
  for (const index of [1, 2, 3]) {
    const state = play([0, 0, index]);
    assert.ok(!state.flags.includes('stairs_taken'));
    assert.notEqual(state.motion.kind, 'stairs');
    assert.doesNotMatch(E.getNode(state).lines[0], /카페.*영수증|계단.*올라/);
  }
  assert.match(E.getNode(play([0, 0, 1])).lines[0], /엘리베이터로 내려와 귀가/);
  assert.match(E.getNode(play([0, 0, 2])).lines[0], /1층.*집에 돌아왔다/);
  assert.match(E.getNode(play([0, 0, 3])).lines[0], /배달받은 점심/);
  assert.ok(play([0, 0, 3]).flags.includes('returned_home'));
});

test('food decisions compare separate services without turning an indoor player into a pickup traveller', () => {
  const indoors = play([1, 0]);
  const node = E.getNode(indoors);
  assert.match(node.lines.join(' '), /버거킹 앱의 등급/);
  assert.match(node.lines.join(' '), /배민.*따로 비교/);
  const delivery = E.choose(indoors, 0);
  const pickup = E.choose(indoors, 3);
  assert.ok(delivery.flags.includes('delivery'));
  assert.ok(pickup.flags.includes('pickup_help'));
  for (const state of [delivery, pickup]) {
    assert.equal(state.motion.location, 'room');
    assert.ok(!state.flags.includes('outing'));
    assert.ok(!state.flags.includes('stairs_taken'));
  }
  assert.match(pickup.reaction.lines[0], /상대가 들를 수 있다고/);
  assert.match(delivery.reaction.lines[0], /배민.*배달 혜택과 총액/);
});

test('an outside intention followed by home planning and pickup help does not invent an outing', () => {
  const stayedHome = play([0, 1, 3]);
  assert.equal(stayedHome.route, 'outside');
  assert.ok(stayedHome.flags.includes('access'));
  assert.ok(stayedHome.flags.includes('pickup_help'));
  assert.ok(!stayedHome.flags.includes('outing'));
  assert.doesNotMatch(E.getNode(stayedHome).lines[0], /1층에서|집에 돌아왔다|돌아올 몫/);
  assert.match(E.getNode(stayedHome).lines[0], /점심 봉투/);
  const visited = play([0, 0, 2]);
  assert.ok(visited.flags.includes('outing'));
  assert.match(E.getNode(visited).lines[0], /1층에서.*집에 돌아왔다/);
});

test('motion energy is a snapshot of the single semantic choice, including clamps', () => {
  allPaths(state => {
    const previousEnergy = state.history.length > 1 ? state.history.at(-2).motion.energyAfter : 6;
    assert.equal(state.motion.energyBefore, previousEnergy);
    assert.equal(state.motion.energyAfter, state.energy);
    assert.equal(state.motion.energyBefore >= 0 && state.motion.energyBefore <= 10, true);
    if (state.history.length) assert.deepEqual(state.history.at(-1).motion, state.motion);
    const snapshot = JSON.stringify(state);
    E.getNode(state); E.bodyDescription(state); E.determineEnding(state);
    assert.equal(JSON.stringify(state), snapshot, 'rendering, inspection and ending lookup must not consume energy');
  });
  const lobby = play([0, 0]);
  lobby.energy = 1;
  const stairs = E.choose(lobby, 0);
  assert.equal(stairs.motion.energyBefore, 1);
  assert.equal(stairs.motion.energyAfter, 0);
  assert.equal(stairs.energy, 0);
  assert.equal(E.getNode(stairs).choices.length, 4);
});

function scenarioPlay(scenarioId, choiceIds, conditions = {}) {
  return E.replay({ scenarioId, conditions, choiceIds });
}
function walkScenario(state, visitor) {
  visitor(state);
  const node = E.getNode(state);
  if (node) for (const ch of node.choices) walkScenario(E.choose(state, ch.id), visitor);
}
const scenarioConditions = [];
for (const doorMode of ['manual', 'automatic']) for (const helpStyle of ['takeover', 'ask']) for (const phonePayment of [false, true]) scenarioConditions.push({ doorMode, helpStyle, phonePayment });

test('version 2 normalizes only fictional conditions and preserves the classic default', () => {
  assert.equal(E.SCENARIO_VERSION, '2');
  assert.deepEqual(E.SCENARIOS.map(p => p.id), ['classic', 'home', 'doors', 'cafe', 'company', 'planning']);
  assert.deepEqual(E.normalizeStart(), { scenarioId: 'classic', scenarioVersion: '2', conditions: { doorMode: 'manual', helpStyle: 'takeover', phonePayment: false } });
  assert.equal(E.freshState().scene, 'morning');
  for (const input of [null, [], { name: 'a' }, { scenarioId: 'unknown' }, { conditions: { health: 'a' } }, { conditions: { doorMode: 'broken' } }, { conditions: { phonePayment: 1 } }, { conditions: { helpStyle: 'always' } }]) assert.throws(() => E.normalizeStart(input));
  assert.equal(E.freshState({ scenarioId: 'doors' }).motion.location, 'hall');
  assert.equal(E.freshState({ scenarioId: 'cafe' }).motion.location, 'hall');
  assert.equal(E.freshState({ scenarioId: 'home' }).motion.location, 'room');
});

test('all new scenarios and all eight condition combinations end in five choices with every S01-S13 choice covered', () => {
  let complete = 0;
  const sceneChoices = new Map();
  const helpVariants = new Map();
  for (const pack of E.SCENARIOS.filter(p => p.id !== 'classic')) for (const conditions of scenarioConditions) {
    walkScenario(E.freshState({ scenarioId: pack.id, conditions }), s => {
      assert.equal(s.history.length, s.decisions.length);
      assert.equal(s.choiceIds.length, s.decisions.length);
      assert.deepEqual(s.choiceIds, s.history.map(h => h.choiceId));
      assert.ok([s.energy, s.mood, ...Object.values(s.body)].every(v => Number.isInteger(v) && v >= 0 && v <= 10));
      assert.ok(s.body.ankle >= 2);
      if (s.scene === 'end') {
        complete++;
        assert.equal(s.decisions.length, 5);
        assert.ok(ENDING_NAMES.includes(E.determineEnding(s).name));
        assert.notEqual(s.context.items.cardLocation, 'floor');
        assert.equal(E.choose(s, 0), s);
        assert.doesNotMatch(E.determineEnding(s).body, /。/);
        return;
      }
      const node = E.getNode(s);
      assert.equal(node.sceneId, s.scene);
      assert.equal(node.step, s.decisions.length + 1);
      assert.ok(node.eligibility.eligible);
      assert.deepEqual(node.choiceIds, node.choices.map(c => c.id));
      assert.equal(new Set(node.choiceIds).size, node.choiceIds.length);
      for (const ch of node.choices) {
        assert.ok(ch.effects && typeof ch.effects === 'object');
        assert.ok(Array.isArray(ch.followUpText) && ch.followUpText.length >= 2);
        assert.ok(typeof ch.journalTrace === 'string' && ch.journalTrace.length > 0);
        if (/^S\d\d$/.test(node.sceneId)) {
          if (!sceneChoices.has(node.sceneId)) sceneChoices.set(node.sceneId, new Set());
          sceneChoices.get(node.sceneId).add(ch.id);
        }
        if (node.sceneId === 'S07') {
          const variant = node.contrastVariant.value;
          if (!helpVariants.has(variant)) helpVariants.set(variant, new Set());
          helpVariants.get(variant).add(ch.id);
        }
      }
    });
  }
  assert.equal(complete, 10152);
  assert.deepEqual([...sceneChoices.keys()].sort(), Array.from({ length: 13 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`));
  for (const [id, choices] of sceneChoices) assert.equal(choices.size, id === 'S01' ? 4 : id === 'S02' ? 6 : 3, id);
  assert.deepEqual([...helpVariants.keys()].sort(), ['ask', 'takeover']);
  for (const choices of helpVariants.values()) assert.equal(choices.size, 3);
});

test('canonical replay reproduces conditions and choice prefixes without mutation or stale choices', () => {
  for (const pack of E.SCENARIOS) {
    const conditions = { doorMode: 'automatic', helpStyle: 'ask', phonePayment: true };
    let state = E.freshState({ scenarioId: pack.id, conditions });
    for (let step = 0; step < 5; step++) {
      const before = JSON.stringify(state);
      freeze(state);
      const node = E.getNode(state);
      const chosen = node.choices[Math.min(1, node.choices.length - 1)].id;
      const next = E.choose(state, chosen);
      assert.equal(JSON.stringify(state), before);
      assert.deepEqual(E.replay({ scenarioId: pack.id, conditions, choiceIds: next.choiceIds }), next);
      state = next;
    }
  }
  assert.throws(() => scenarioPlay('doors', ['S02-ask'], { doorMode: 'automatic' }), /현재 장면/);
  assert.throws(() => scenarioPlay('cafe', ['S05-home', 'S06-ask']), /현재 장면/);
  assert.throws(() => E.replay({ scenarioId: 'home', conditions: {}, choiceIds: ['S01-bottle'], body: {} }), /허용하지/);
  assert.throws(() => E.replay({ scenarioId: 'home', conditions: {}, choiceIds: new Array(6).fill('S01-help') }), /다섯/);
  assert.throws(() => E.replay({ scenarioId: 'home', conditions: {}, choiceIds: [null] }), /문자열/);
});

test('S01 leaves four distinct item arrangements, places and trip counts', () => {
  const start = E.freshState({ scenarioId: 'home' });
  const results = E.getNode(start).choices.map(ch => E.choose(start, ch.id));
  assert.equal(new Set(results.map(s => JSON.stringify(s.context.items))).size, 4);
  assert.deepEqual(results.map(s => s.context.items.container), ['bottle', 'favorite-cup', 'favorite-cup', 'favorite-cup']);
  assert.deepEqual(results.map(s => s.context.items.carryTrips), [1, 3, 0, 1]);
  assert.deepEqual(results.map(s => s.context.items.drinkPlace), ['window', 'window', 'table', 'window']);
  assert.equal(results[2].context.items.phoneLocation, 'kitchen');
  assert.equal(results[3].context.help.requested, true);
  assert.equal(results[0].context.help.requested, false);
});

test('S02 distinguishes asking, uncertain waiting and detour from S03 shared safety', () => {
  const asked = scenarioPlay('doors', ['S02-ask']);
  const waited = scenarioPlay('doors', ['S02-wait']);
  const detour = scenarioPlay('doors', ['S02-side']);
  assert.equal(asked.context.entrance.heldBy, '지나가던 사람');
  assert.equal(asked.context.entrance.passed, false);
  assert.equal(waited.context.entrance.waitMinutes, 4);
  assert.equal(waited.context.environment.spaceCleared, false);
  assert.equal(waited.context.social.requests.length, 0);
  assert.ok(waited.context.social.unspoken.length > 0);
  assert.equal(detour.context.entrance.selected, 'side');
  assert.equal(detour.context.plan.detourMeters, 30);
  for (const state of [asked, waited, detour]) {
    assert.equal(state.scene, 'S03');
    assert.match(E.getNode(state).lines.join(' '), /스친다/);
    assert.equal(state.context.environment.spaceCleared, false);
  }
});

test('S03 waiting progresses only after actual staff action and withdrawal retains unresolved environment facts', () => {
  const before = scenarioPlay('doors', ['S02-wait']);
  for (const id of ['S03-coordinate', 'S03-notify-wait']) {
    const next = E.choose(before, id);
    assert.equal(next.context.location, 'cafe');
    assert.equal(next.context.environment.spaceCleared, true);
    assert.ok(next.context.environment.responsibleActors.includes('직원'));
    assert.match(next.context.environment.action, /옮겼다|비웠다/);
    assert.equal(next.history.at(-1).actions.requests.length, 1);
    assert.ok(next.history.at(-1).actions.environmentAction);
  }
  const leave = E.choose(before, 'S03-leave');
  assert.equal(leave.context.location, 'home');
  assert.equal(leave.context.environment.spaceCleared, false);
  assert.equal(leave.context.entrance.passed, false);
  assert.equal(E.getNode(leave).eligibility.requestedSceneId, 'S09');
  assert.equal(E.getNode(leave).eligibility.matched, false);
});

test('F04 changes only the starting door environment and removes door-holding requests without fixing other barriers', () => {
  const manual = E.freshState({ scenarioId: 'doors', conditions: { doorMode: 'manual' } });
  const auto = E.freshState({ scenarioId: 'doors', conditions: { doorMode: 'automatic' } });
  assert.equal(manual.energy, auto.energy);
  assert.equal(manual.mood, auto.mood);
  assert.deepEqual(manual.body, auto.body);
  assert.equal(manual.context.goal, auto.context.goal);
  assert.equal(manual.context.companion, auto.context.companion);
  assert.deepEqual(manual.context.seat, auto.context.seat);
  assert.ok(E.getNode(manual).choiceIds.includes('S02-ask'));
  assert.ok(!E.getNode(auto).choiceIds.includes('S02-ask'));
  for (const choice of E.getNode(auto).choices) assert.ok(!(choice.effects.requests || []).some(r => /문.*잡/.test(r.forWhat)));
  const original = scenarioPlay('doors', ['S02-ask', 'S03-coordinate']);
  const changed = scenarioPlay('doors', ['S02-auto-enter', 'S03-coordinate'], { doorMode: 'automatic' });
  assert.equal(original.context.social.requests.length - changed.context.social.requests.length, 1);
  assert.equal(original.scene, 'S09');
  assert.equal(changed.scene, 'S09');
  assert.deepEqual(E.getNode(original).choiceIds, E.getNode(changed).choiceIds);
  assert.equal(changed.context.seat.visibleEmpty, 'high-only');
});

test('S05 returning home uses explicit fallback scenes and does not invent payment, seats or self-service', () => {
  let state = scenarioPlay('cafe', ['S05-home']);
  const skipped = [];
  for (let i = 0; i < 3; i++) {
    const node = E.getNode(state);
    skipped.push(node.eligibility.requestedSceneId);
    assert.ok(node.eligibility.reason);
    assert.equal(node.eligibility.matched, false);
    assert.match(node.sceneId, /^HOME-/);
    state = E.choose(state, 0);
  }
  assert.deepEqual(skipped, ['S06', 'S09', 'S10']);
  assert.deepEqual(state.history.map(h => h.sceneId), ['S05', 'HOME-2', 'HOME-3', 'HOME-4']);
  assert.equal(state.context.items.cardLocation, 'wallet');
  assert.equal(state.context.seat.usable, null);
  assert.equal(state.context.needs.water, 'not-requested');
});

test('S06 alternate payment is conditional and every option returns the dropped card to the wallet', () => {
  const without = scenarioPlay('cafe', ['S05-staff']);
  const withPhone = scenarioPlay('cafe', ['S05-staff'], { phonePayment: true });
  assert.equal(without.context.items.cardLocation, 'floor');
  assert.equal(E.getNode(without).choices.length, 2);
  assert.equal(E.getNode(withPhone).choices.length, 3);
  assert.ok(!E.getNode(without).choiceIds.includes('S06-phone'));
  for (const ch of E.getNode(withPhone).choices) {
    const after = E.choose(withPhone, ch.id);
    assert.equal(after.context.items.cardLocation, 'wallet');
    assert.match(after.reaction.lines.join(' '), /카드.*지갑|지갑.*카드/);
  }
});

test('S07 takeover and asking variants both preserve consent and assigned task scope', () => {
  for (const helpStyle of ['takeover', 'ask']) {
    const state = scenarioPlay('home', ['S01-help'], { helpStyle });
    assert.equal(state.scene, 'S07');
    assert.equal(E.getNode(state).contrastVariant.value, helpStyle);
    const all = E.choose(state, 'S07-all');
    const cup = E.choose(state, 'S07-cup');
    const noMore = E.choose(state, 'S07-decline');
    assert.ok(all.context.help.delegated.includes('남은 준비'));
    assert.deepEqual(cup.context.help.delegated, ['컵 옮기기']);
    assert.ok(cup.context.help.ownTasks.includes('남은 준비'));
    assert.equal(noMore.context.help.scope, 'none-further');
    assert.equal(noMore.context.items.cupLocation, 'window');
    assert.equal(cup.mood, noMore.mood);
  }
  const noRequest = scenarioPlay('home', ['S01-table']);
  assert.equal(E.getNode(noRequest).eligibility.requestedSceneId, 'S07');
  assert.match(E.getNode(noRequest).eligibility.reason, /요청하지/);
});

test('S08 route distance and S12 detours survive into the actual final return and home deferral skips outings', () => {
  const planned = scenarioPlay('company', ['S08-planned', 'S11-slower', 'S12-elevator', 'S04-thanks']);
  const near = scenarioPlay('company', ['S08-near', 'S11-stop', 'S12-confirm', 'S04-next']);
  assert.match(E.getNode(planned).lines.join(' '), /300m.*180m/);
  assert.match(E.getNode(near).lines.join(' '), /100m.*120m/);
  for (const s of [planned, near]) {
    const end = E.choose(s, 'REFLECT-note');
    assert.equal(end.context.location, 'home');
    assert.equal(end.context.returned, true);
    assert.equal(end.context.outing, false);
    assert.match(end.history.at(-1).reaction.lines.join(' '), /귀가 길로 집에 돌아온다.*기본 거리.*우회/);
  }
  let home = scenarioPlay('company', ['S08-later']);
  for (const requested of ['S11', 'S12', 'S04']) {
    assert.equal(E.getNode(home).eligibility.requestedSceneId, requested);
    assert.equal(E.getNode(home).eligibility.matched, false);
    home = E.choose(home, 0);
  }
  assert.equal(home.context.outing, false);
  assert.equal(home.context.returned, false);
  assert.equal(home.context.plan.returnMeters, 0);
});

test('S09 distinguishes visible high seats from a usable seat and takeout skips S10', () => {
  const state = scenarioPlay('cafe', ['S05-staff', 'S06-ask']);
  assert.equal(state.context.seat.visibleEmpty, 'high-only');
  assert.equal(state.context.seat.usable, null);
  for (const id of ['S09-wait', 'S09-ask']) {
    const after = E.choose(state, id);
    assert.equal(after.context.seat.usable, 'low-chair');
    assert.equal(after.context.seat.mode, 'seated');
    assert.equal(after.scene, 'S10');
  }
  const takeout = E.choose(state, 'S09-takeout');
  assert.equal(takeout.context.seat.usable, null);
  assert.equal(takeout.context.location, 'home');
  assert.equal(E.getNode(takeout).eligibility.requestedSceneId, 'S10');
  assert.equal(E.getNode(takeout).eligibility.matched, false);
});

test('S10 deferred water stays unresolved until an explicit later request and is never silently credited', () => {
  const before = scenarioPlay('cafe', ['S05-staff', 'S06-ask', 'S09-wait']);
  assert.equal(before.context.needs.water, 'pending');
  assert.equal(before.context.needs.utensils, 'pending');
  const all = E.choose(before, 'S10-all');
  const separate = E.choose(before, 'S10-separate');
  const deferred = E.choose(before, 'S10-defer');
  assert.equal(all.context.needs.water, 'received');
  assert.equal(separate.context.social.requests.length - before.context.social.requests.length, 2);
  assert.equal(deferred.context.needs.water, 'pending');
  assert.equal(deferred.context.needs.utensils, 'pending');
  assert.ok(E.getNode(deferred).choiceIds.includes('REFLECT-request'));
  const received = E.choose(deferred, 'REFLECT-request');
  const changed = E.choose(deferred, 'REFLECT-change-order');
  const unresolved = E.choose(deferred, 'REFLECT-unresolved');
  assert.equal(received.context.needs.water, 'received');
  assert.equal(received.context.needs.utensils, 'received');
  assert.equal(changed.context.needs.water, 'received');
  assert.equal(changed.context.needs.utensils, 'not-needed');
  assert.equal(unresolved.context.needs.water, 'pending');
  assert.equal(unresolved.context.needs.utensils, 'pending');
  assert.match(E.determineEnding(unresolved).body, /미해결/);
  assert.equal(unresolved.mood, received.mood);
});

test('S11 changes conversation participation rather than judging friends or rewarding silence', () => {
  const start = scenarioPlay('company', ['S08-planned']);
  const rejoin = E.choose(start, 'S11-slower');
  const pause = E.choose(start, 'S11-stop');
  const own = E.choose(start, 'S11-own');
  assert.equal(rejoin.context.social.together, true);
  assert.equal(pause.context.social.together, true);
  assert.equal(own.context.social.together, false);
  assert.equal(own.context.social.missedWords, true);
  assert.equal(own.context.social.requests.length, 0);
  assert.equal(rejoin.mood, own.mood);
  const later = scenarioPlay('company', ['S08-planned', 'S11-own', 'S12-elevator', 'S04-thanks']);
  assert.match(E.getNode(later).lines.join(' '), /이야기는 일부 놓쳤다.*아직 궁금하다/);
});

test('S12 excludes only its specifically unsuitable stairs and actual detours increase physical effort', () => {
  const before = scenarioPlay('company', ['S08-planned', 'S11-stop']);
  const node = E.getNode(before);
  assert.match(node.lines.join(' '), /난간이 중간에 끊겨 있고 기다릴 자리도 좁다/);
  assert.ok(node.choices.every(ch => ch.motion.kind !== 'stairs'));
  const after = E.choose(before, 'S12-elevator');
  assert.equal(after.context.location, 'elevator-lobby');
  assert.equal(after.context.plan.detourMeters, 180);
  assert.ok(after.body.shoulder > before.body.shoulder);
  assert.doesNotMatch(after.reaction.lines.at(-1), /왕복을 줄이자/);
  assert.equal(play([0, 0, 0]).motion.kind, 'stairs', 'classic second-floor ascent remains available');
});

test('S13 keeps all four access fields with provenance and changing the destination invalidates unrelated confirmations', () => {
  const checked = scenarioPlay('planning', ['S13-check']);
  const known = scenarioPlay('planning', ['S13-known']);
  const onsite = scenarioPlay('planning', ['S13-onsite']);
  for (const state of [checked, known, onsite]) assert.deepEqual(Object.keys(state.context.access).sort(), ['distance', 'rest', 'threshold', 'toilet']);
  assert.equal(checked.context.access.toilet, 'unknown');
  assert.equal(checked.context.access.threshold, 'confirmed-fiction-phone');
  assert.ok(Object.values(known.context.access).every(v => v !== 'unknown'));
  assert.equal(onsite.context.access.toilet, 'unknown');
  assert.equal(onsite.context.access.threshold, 'unknown');
  assert.equal(onsite.context.access.rest, 'unknown');
  assert.equal(E.choose(known, 'S08-planned').context.access.toilet, 'unknown');
  assert.equal(E.choose(known, 'S08-near').context.access.toilet, 'confirmed-fiction-phone');
  assert.equal(E.choose(checked, 'S08-planned').context.access.threshold, 'confirmed-fiction-phone');
  assert.equal(E.choose(checked, 'S08-near').context.access.threshold, 'unknown');
});

test('home and recovery scenes offer distinct purposes instead of repeating one filler scene', () => {
  const first = scenarioPlay('home', ['S01-table']);
  const second = E.choose(first, 'HOME-2-listen');
  assert.notEqual(E.getNode(first).title, E.getNode(second).title);
  assert.deepEqual(E.getNode(second).choiceIds, ['HOME-3-message', 'HOME-3-photo', 'HOME-3-playlist']);
  const playlist = E.choose(second, 'HOME-3-playlist');
  assert.match(playlist.reaction.lines[0], /방금 들은 곡/);
  const recovered = scenarioPlay('cafe', ['S05-home', 'HOME-2-listen', 'HOME-3-message']);
  assert.deepEqual(E.getNode(recovered).choiceIds, ['HOME-4-arrange', 'HOME-4-read-traces', 'HOME-4-quiet']);
});

test('classic indoor notes distinguish present cup difficulty, remembered doors and imagined game events', () => {
  for (const path of [[3, 0, 1], [1, 1, 1]]) {
    const state = play(path);
    assert.ok(!state.flags.includes('outing'));
    assert.match(state.reaction.lines[0], /예전에 만난 무거운 문/);
    assert.match(state.reaction.lines[0], /오늘 다녀온 곳과 헷갈리지 않도록 “예전 일”/);
    const shared = E.choose(state, 1);
    if (!state.flags.includes('photos')) assert.match(shared.reaction.lines[0], /예전에 겪은 일이라고 덧붙인다/);
    const imagined = E.choose(state, 3);
    assert.match(imagined.reaction.lines[0], /상상 속.*실제 오늘의 사건과는 별개/);
  }
});

test('door and payment scenes remain standing until a seat is actually obtained', () => {
  for (const scenarioId of ['doors', 'cafe']) assert.equal(E.freshState({ scenarioId }).motion.kind, 'stand');
  for (const id of ['S02-ask', 'S02-wait']) assert.equal(scenarioPlay('doors', [id]).motion.kind, 'stand');
  const auto = scenarioPlay('doors', ['S02-auto-enter'], { doorMode: 'automatic' });
  assert.equal(auto.motion.kind, 'walk');
  assert.equal(auto.motion.destinationPose, undefined);
  const paid = scenarioPlay('cafe', ['S05-staff', 'S06-ask']);
  assert.equal(paid.motion.kind, 'stand');
  assert.equal(paid.context.seat.usable, null);
  assert.equal(E.choose(paid, 'S09-wait').motion.kind, 'sit');
  const elevator = scenarioPlay('company', ['S08-planned', 'S11-stop', 'S12-elevator']);
  assert.equal(elevator.motion.destinationPose, undefined);
  assert.equal(scenarioPlay('company', ['S08-planned', 'S11-stop']).motion.kind, 'stand');
  assert.equal(scenarioPlay('home', ['S01-bottle']).motion.destinationPose, 'observe');
});

test('completed canonical journals retain chosen facts, separate requests and environment actions', () => {
  const state = scenarioPlay('doors', ['S02-ask', 'S03-coordinate', 'S09-ask', 'S10-defer', 'REFLECT-request']);
  assert.deepEqual(state.history.map(h => h.sceneId), ['S02', 'S03', 'S09', 'S10', 'REFLECT']);
  assert.equal(state.history[1].actions.requests[0].forWhat, '문 주변 양쪽 통행과 대기 공간 정리 요청');
  assert.match(state.history[1].actions.environmentAction, /직원/);
  assert.ok(state.history[3].facts.includes('물과 식기를 받지 않은 상태로 요청을 미뤘다'));
  assert.ok(state.history[4].facts.includes('미뤘던 물과 식기를 마지막에 요청해 실제로 받았다'));
  assert.equal(state.context.needs.water, 'received');
  assert.equal(state.context.location, 'home');
  assert.deepEqual(scenarioPlay('doors', state.choiceIds, state.initialConditions), state);
  assert.ok(!Object.hasOwn(state.context, 'moralScore'));
  assert.ok(!Object.hasOwn(state.context.social, 'score'));
  assert.ok(!Object.hasOwn(state.context.environment, 'score'));
});
