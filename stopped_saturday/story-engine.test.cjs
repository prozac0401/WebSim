const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./story-engine.js');

const BODY_KEYS = ['ankle', 'shoulder', 'back', 'underarm', 'palm', 'goodLeg'];
const ENDING_NAMES = ['시간 도둑을 만난 토요일', '누군가에게 닿은 토요일', '300미터의 대모험', '제대로 멈춘 토요일', '창가의 탐험가', '아직 끝나지 않은 토요일'];
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

test('fresh game preserves 10:12, four original intents and identity sentence', () => {
  const s = E.freshState();
  const node = E.getNode(s);
  assert.equal(s.energy, 6);
  assert.equal(s.mood, 4);
  assert.equal(s.step, 1);
  assert.match(node.time, /10:12/);
  assert.deepEqual(node.choices.map(c => c.title), [
    '밖으로 나가고 싶다', '집에서 새로운 세계에 빠져본다', '누군가와 연결되고 싶다', '창밖부터 바라본다'
  ]);
  assert.ok(node.lines.includes('시간은 남아돈다. 발목은 남아돌지 않는다.'));
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
  assert.match(after.reaction.lines[2], /모두 없어지지 않는다/);
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
  assert.match(E.getNode(quiet).lines[1], /아쉬워하는 마음/);
  assert.match(E.getNode(curious).lines[1], /좋았던 장면/);
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
  assert.match(upstairs.reaction.lines[1], /내려갈 몫/);
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
