(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaturdayScenes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCENARIO_VERSION = '3';
  const SCENARIOS = [
    { id: 'classic', title: '처음의 토요일', description: '네 갈래로 시작하는 첫 번째 이야기. 2층에 올라갈 방법과 점심 메뉴도 골라 본다.', scenes: [], conditions: [] },
    { id: 'home', title: '창가에서 커피 한 잔', description: '창가에서 커피를 마시고, 도움과 식사·쉬는 시간을 정하는 하루.', scenes: ['S01', 'S07', 'HOME', 'S13', 'REFLECT'], conditions: ['helpStyle'] },
    { id: 'doors', title: '문 너머의 자리', description: '문 앞에서 도움을 청하고, 앉을 자리와 물 한 잔을 찾는다.', scenes: ['S02', 'S03', 'S09', 'S10', 'REFLECT'], conditions: ['doorMode'] },
    { id: 'cafe', title: '도착한 뒤의 일들', description: '지도에는 도착했다고 뜨는데. 문턱을 지나 계산을 마치고, 앉아서 물 한 잔 마시기까지.', scenes: ['S05', 'S06', 'S09', 'S10', 'REFLECT'], conditions: ['phonePayment'] },
    { id: 'company', title: '같이 걷는 하루', description: '친구들과 걸으며 대화하고, 돌아올 길도 정하는 하루.', scenes: ['S08', 'S11', 'S12', 'S04', 'REFLECT'], conditions: [] },
    { id: 'planning', title: '메뉴보다 먼저', description: '외출 전에 화장실과 쉬어 갈 곳을 찾아보고, 갈 곳을 고른다.', scenes: ['S13', 'S08', 'S12', 'S04', 'REFLECT'], conditions: [] }
  ];
  const ALLOWED = { doorMode: ['manual', 'automatic', 'revolving'], helpStyle: ['takeover', 'ask'], phonePayment: [false, true], verticalRoute: ['stairs', 'escalator'], orderMode: ['counter', 'kiosk'], roomLayout: ['window-left', 'window-right', 'wide-living', 'compact-studio'], injuredSide: ['right', 'left'] };
  const DEFAULTS = { doorMode: 'manual', helpStyle: 'takeover', phonePayment: false };
  const clone = value => JSON.parse(JSON.stringify(value));
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function normalizeAppearance(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('외형 조건은 객체여야 합니다.');
    if (Object.keys(value).length !== 2 || !hasOwn(value, 'gender') || !hasOwn(value, 'hairStyle')
      || !['male', 'female'].includes(value.gender)
      || !['crop', 'side-part', 'wavy', 'bob', 'ponytail', 'bun'].includes(value.hairStyle)) throw new Error('허용하지 않는 외형 조건입니다.');
    return { gender: value.gender, hairStyle: value.hairStyle };
  }
  function normalizeStart(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('시작 조건은 객체여야 합니다.');
    for (const key of Object.keys(input)) if (!['scenarioId', 'conditions'].includes(key)) throw new Error(`허용하지 않는 시작 항목: ${key}`);
    const scenarioId = input.scenarioId === undefined ? 'classic' : input.scenarioId;
    if (!SCENARIOS.some(s => s.id === scenarioId)) throw new Error('알 수 없는 시나리오입니다.');
    const supplied = input.conditions === undefined ? {} : input.conditions;
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('허구의 장면 조건을 확인해 주세요.');
    const conditions = { ...DEFAULTS };
    for (const key of Object.keys(supplied)) {
      if (key === 'appearance') { conditions.appearance = normalizeAppearance(supplied.appearance); continue; }
      if (!hasOwn(ALLOWED, key) || !ALLOWED[key].includes(supplied[key])) throw new Error(`허용하지 않는 조건: ${key}`);
      conditions[key] = supplied[key];
    }
    return { scenarioId, scenarioVersion: SCENARIO_VERSION, conditions };
  }
  function freshContext(start) {
    const outside = ['doors', 'cafe'].includes(start.scenarioId);
    return {
      location: outside ? 'entrance' : 'home', outing: outside, returned: false, returnReason: null,
      companion: start.scenarioId === 'company' ? 'friends' : start.scenarioId === 'home' ? 'housemate' : 'none',
      goal: start.scenarioId === 'home' ? '햇빛 드는 창가에서 마시기' : '편한 자리에 앉아 시간을 보내고 돌아오기',
      entrance: { mode: start.conditions.doorMode, selected: 'front', passed: false, heldBy: null, waitMinutes: 0 },
      environment: { layout: start.conditions.doorMode === 'automatic' ? 'sliding-door' : start.conditions.doorMode === 'revolving' ? 'revolving-door' : 'swing-door', hazardObserved: false, spaceCleared: false, responsibleActors: [], action: '아직 확인하지 않음' },
      seat: { visibleEmpty: 'unknown', usable: null, mode: 'none', waitedMinutes: 0 },
      items: { container: 'favorite-cup', cupLocation: 'kitchen', phoneLocation: 'kitchen', carryTrips: 0, drinkPlace: null, cardLocation: 'wallet' },
      needs: { water: 'not-requested', utensils: 'not-requested' },
      help: { requested: false, scope: 'none', offeredStyle: start.conditions.helpStyle, delegated: [], ownTasks: [] },
      social: { requests: [], unspoken: [], conversations: [], missedWords: false, together: false },
      plan: { destination: '아직 고르지 않은 장소', outboundMeters: 0, returnMeters: 0, detourMeters: 0, timeMinutes: 0, returnConsidered: false },
      access: { toilet: 'unknown', threshold: 'unknown', distance: 'unknown', rest: 'unknown' }, accessSource: null,
      facts: [], actions: [], skipped: [], day: { seated: !outside, ate: false },
      ...(hasOwn(start.conditions, 'orderMode') ? { order: { mode: start.conditions.orderMode, status: 'not-ordered', method: null } } : {}),
      ...(hasOwn(start.conditions, 'verticalRoute') ? { vertical: { kind: start.conditions.verticalRoute, encountered: false, used: false } } : {})
    };
  }
  const mm = (kind, location, caption, destinationPose) => ({ kind, location, caption, ...(destinationPose ? { destinationPose } : {}) });
  const act = (id, title, note, effects, followUpText, journalTrace, extra = {}) => ({
    id, title, note, effects, followUpText, journalTrace, energy: 0, mood: 0, effect: extra.motion && ['walk', 'desk', 'phone', 'observe'].includes(extra.motion.kind) ? extra.motion.kind : 'neutral', focus: 'observe', weight: 2,
    motion: mm('sit', 'room', '자리에 앉아 있다.'), ...extra
  });
  const request = (forWhat, by = '주인공') => ({ by, forWhat });
  const definitions = {};
  const scene = (sceneId, title, eligibility, lines, choices, contrastVariant = null) => {
    definitions[sceneId] = { sceneId, title, eligibility, lines, choices, contrastVariant };
  };
  scene('S01', '햇빛은 아직 창가에 있다', { location: ['home'] }, () => [
    '커피가 따뜻할 때 창가에 앉고 싶다. 늘 쓰던 컵을 보니 손이 먼저 가다가 멈춘다.',
    '휴대전화를 내려놓아도 양손은 목발을 잡아야 한다. 창가까지 몇 걸음인데, 컵 하나를 어떻게 옮길지부터 생각하게 된다.'
  ], () => [
    act('S01-bottle', '뚜껑 있는 물병을 고른다', '좋아하는 컵은 부엌에 두기', { items: { container: 'bottle', cupLocation: 'kitchen', phoneLocation: 'window', carryTrips: 1, drinkPlace: 'window' }, facts: ['물병으로 창가에서 마셨다', '좋아하는 컵은 부엌에 남았다'] }, ['좋아하는 컵을 내려놓고 뚜껑 있는 물병을 고른다. 옮길 물건이 정리된 뒤 창가에 앉는다.', '창가에 앉아 물병으로 한 모금 마신다. 팔에 햇빛이 닿는다. 늘 쓰던 컵은 부엌에 두고 왔다.'], '창가 · 물병 / 컵은 부엌 / 전화는 창가 / 이동 1번', { energy: -1, motion: mm('walk', 'room', '물병을 고른 뒤 창가에 앉는다.', 'observe') }),
    act('S01-split', '물건을 나누어 옮긴다', '안정된 곳에 두고 여러 번 준비하기', { items: { container: 'favorite-cup', cupLocation: 'window', phoneLocation: 'window', carryTrips: 3, drinkPlace: 'window' }, facts: ['물건을 나누어 준비해 창가에서 마셨다', '창가에 앉을 때 햇빛이 조금 옮겨 갔다'] }, ['중간에 물건을 놓을 자리를 정리하고 몇 번에 나누어 옮긴다. 잠깐 앉으려던 건데 준비가 길어진다.', '좋아하는 컵과 휴대전화를 창가에 다 옮겼을 때, 햇빛은 조금 옆으로 옮겨 가 있었다. 시간이 좀 걸렸지만 손에 쥔 컵은 익숙하다.'], '창가 · 좋아하는 컵 / 전화도 창가 / 준비와 이동 3번', { energy: -2, effect: 'transfer', motion: mm('walk', 'room', '나누어 준비한 뒤 창가에서 컵을 든다.', 'observe') }),
    act('S01-table', '오늘은 식탁에서 마신다', '창가 대신 가까운 자리', { items: { container: 'favorite-cup', cupLocation: 'table', phoneLocation: 'kitchen', carryTrips: 0, drinkPlace: 'table' }, facts: ['식탁에서 좋아하는 컵으로 마셨다', '창가 자리에는 가지 않았다'] }, ['창가 대신 식탁에 앉는다. 휴대전화는 부엌에 두고, 우선 커피부터 마시기로 한다.', '여기까지 햇빛이 들지는 않지만, 커피가 따뜻할 때 한 모금 마신다. 컵을 식탁에 내려놓고 잠시 앉아 있는다.'], '식탁 · 좋아하는 컵 / 전화는 부엌 / 추가 이동 없음', { energy: 1, effect: 'rest', focus: 'rest' }),
    act('S01-help', '컵을 창가로 옮겨 달라고 부탁한다', '부탁을 꺼내고 함께 사는 사람 기다리기', { items: { container: 'favorite-cup', cupLocation: 'window', phoneLocation: 'window', carryTrips: 1, drinkPlace: 'window' }, help: { requested: true, scope: 'cup', delegated: ['컵 옮기기'], ownTasks: ['마실 자리 고르기'] }, requests: [request('컵을 창가로 옮겨 달라고 부탁')], addMinutes: 4, facts: ['부탁 뒤 컵을 건네받아 창가에서 마셨다'] }, ['컵 하나 때문에 불러도 되나 싶어 잠깐 망설인다. “컵을 창가에 놓아 줄 수 있어?” 말하고, 상대가 하던 일을 마칠 때까지 기다린다.', '창가에 앉아 컵을 손에 쥔다. 따뜻한 커피를 한 모금 마신다. 휴대전화도 컵 옆에 있다.'], '창가 · 건네받은 컵 / 전화도 창가 / 기다림 4분', { energy: -1, focus: 'shared', motion: mm('walk', 'room', '컵을 건네받고 창가에 앉는다.', 'observe') })
  ]);
  scene('S02', '문 너머에 빈자리가 보인다', { location: ['entrance'], outing: true }, s => s.initialConditions.doorMode === 'automatic' ? [
    '문 너머 빈 의자가 눈에 들어온다. 저기 앉아 목발에서 손을 떼고 싶다. 가까이 가자 자동문이 옆으로 열린다.',
    '문을 잡아 달라는 말은 하지 않아도 된다. 안쪽에는 줄을 선 사람들과 카트가 보인다. 의자까지 곧장 갈 수 있을지는 더 봐야겠다.'
  ] : [
    '문 너머 빈자리에 앉고 싶다. 앞사람이 손을 놓자 미는 문이 닫힌다. 내 쪽으로 오던 사람은 복도 끝에서 방향을 바꾼다.',
    '지나가는 사람을 부르려다 입을 다문다. 양손은 목발을 쥐고 있다. 다시 불러 볼까, 다른 문을 찾아볼까.'
  ], s => s.initialConditions.doorMode === 'automatic' ? [
    act('S02-auto-enter', '열린 자동문을 지나 안쪽을 살핀다', '문을 지나 안쪽에 기다릴 곳 살피기', { entrance: { passed: true, selected: 'front', heldBy: null }, facts: ['자동문을 잡아 달라는 요청 없이 현관 안쪽에 섰다'] }, ['문이 옆으로 열리자 내 속도로 안으로 들어간다. 이번에는 문을 잡아 달라고 부탁할 말을 고르지 않아도 된다.', '바로 안쪽은 카트와 대기선 때문에 좁다. 문은 지났지만, 앉을 자리까지 가려면 이 통로도 지나야 한다.'], '자동문 · 문 잡기 요청 없음 / 안쪽 공간 확인', { energy: -1, motion: mm('walk', 'hall', '자동문을 통과한 뒤 안쪽 대기 공간을 확인한다.') }),
    act('S02-auto-pause', '열린 공간을 확인하고 천천히 들어간다', '드나드는 사람들이 지나가기를 기다리기', { entrance: { passed: true, waitMinutes: 2, heldBy: null }, addMinutes: 2, facts: ['자동문 앞에서 흐름을 살핀 뒤 들어갔다'] }, ['자동문 앞에서 잠깐 주변을 살핀다. 문을 잡고 있는 사람이 없어 그 사람에게 맞추어 속도를 낼 필요는 없다.', '문이 열리면 천천히 안으로 들어간다. 기다리는 동안에도 안쪽 통로는 여전히 좁다.'], '자동문 · 확인 2분 / 문 잡기 요청 없음', { energy: -1, motion: mm('walk', 'hall', '주변을 확인한 뒤 자동문 안쪽으로 이동한다.') }),
    act('S02-auto-side', '옆 출입구도 확인한다', '자동문과 별개로 덜 붐비는 입구 찾기', { entrance: { selected: 'side', passed: true, heldBy: null }, addMinutes: 4, detourMeters: 30, facts: ['옆 자동문으로 이동해 안쪽을 확인했다'] }, ['안쪽 대기선이 보여 옆 출입구를 확인한다. 여기도 자동문이다. 문을 잡아 줄 사람을 찾을 필요는 없겠다.', '옆문까지 돌아오는 데 시간이 좀 걸렸다. 문을 지나 안쪽 통로를 살핀다.'], '옆 자동문 · 우회 30m / 확인 4분', { energy: -1, motion: mm('walk', 'hall', '옆 자동문으로 우회한다.') })
  ] : [
    act('S02-ask', '문을 잡아 달라고 말한다', '문이 열리면 안쪽 통로도 살피기', { entrance: { heldBy: '지나가던 사람', waitMinutes: 1 }, requests: [request('문을 잡아 달라고 부탁')], addMinutes: 1, facts: ['요청을 들은 사람이 문을 잡았다'] }, ['“저기요, 문을 잠깐 잡아 주시겠어요?” 상대가 돌아와 문을 잡는다. 부탁은 한마디였는데 입을 떼기까지가 오래 걸렸다.', '문 너머가 보이자 조금 안도한다. 아직 통과하지는 않았다. 안쪽 대기 공간까지 확인해야 한다.'], '미는 문 · 문 잡기 요청 1회 / 대기 1분', { energy: -1, focus: 'shared', motion: mm('stand', 'hall', '문을 잡아 달라고 말하고 통과할 공간을 살핀다.') }),
    act('S02-wait', '눈이 마주칠 때까지 기다린다', '아직 말하지 않은 부탁, 상대가 알아챘을까', { entrance: { waitMinutes: 4 }, unspoken: ['문을 잡아 달라는 말을 아직 꺼내지 못했다'], addMinutes: 4, facts: ['문 앞에서 기다렸지만 진입은 아직 정해지지 않았다'] }, ['문 앞에서 몇 분을 기다린다. 눈이 마주친 것 같아 고개를 들었지만, 상대는 그대로 지나간다. 내가 기다리는 이유를 알았는지는 모르겠다.', '말을 꺼내지 못한 채 몇 분이 흘렀다. 문 주변 상황은 여전히 달라진 게 없다.'], '미는 문 · 대기 4분 / 문 요청은 아직 말하지 않음', { energy: -1, motion: mm('stand', 'hall', '문 앞에서 기다린 뒤 주변 공간을 다시 본다.') }),
    act('S02-side', '다른 출입구를 확인한다', '조금 더 걸어서 다른 입구 찾아보기', { entrance: { selected: 'side', waitMinutes: 0 }, addMinutes: 5, detourMeters: 30, facts: ['옆 출입구를 확인했다', '옆문도 미는 문이었다'] }, ['옆 입구 표지를 따라간다. 여기도 미는 문이지만 앞쪽과 대기 공간의 모양은 다르다.', '조금 더 걸었더니 손바닥이 눌린다. 옆문도 미는 문이다. 이번에는 문 안쪽에 목발을 놓을 공간이 있는지 들여다본다.'], '옆 미는 문 · 우회 30m / 탐색 5분', { energy: -1, motion: mm('walk', 'hall', '옆 출입구를 확인하러 우회한다.') })
  ], s => ({ kind: 'door-environment', value: s.initialConditions.doorMode, changes: ['문 구조'], unchanged: ['인물', '목적', '시작 에너지', '안쪽 카트', '좌석과 셀프서비스'] }));
  scene('S03', '문 앞 통로가 좁다', { location: ['entrance'], outing: true }, s => [
    s.initialConditions.doorMode === 'automatic' ? '자동문은 옆으로 열려 문짝이 대기 자리를 쓸고 가지 않는다. 다만 안쪽 카트와 대기선이 겹쳐 지나갈 공간은 좁다.' : '문이 예상보다 크게 열리며 대기 자리 바로 옆을 스친다. 반대편 사람도 멈춘다. “이쪽에 기다리는 사람이 있는지 못 봤어요.” 안쪽 카트와 대기선도 겹쳐 있다.',
    '카트 옆으로 목발을 놓을 자리가 좁다. 문 반대편에서는 내가 잘 보이지 않는 모양이다. 직원 쪽을 보며 어떻게 말을 꺼낼지 생각한다.'
  ], () => [
    act('S03-coordinate', '직원에게 지나갈 자리를 마련해 달라고 한다', '직원이 양쪽을 살피고 카트를 옮긴 뒤 지나가기', { location: 'cafe', entrance: { passed: true }, environment: { hazardObserved: true, spaceCleared: true, responsibleActors: ['직원', '반대편 이용자'], action: '직원이 양쪽 통행을 확인하고 카트를 옮겼다' }, requests: [request('문 주변 양쪽 통행과 대기 공간 정리 요청')], addMinutes: 3, facts: ['직원이 통행을 확인하고 공간을 확보한 뒤 들어갔다'] }, ['“목발을 놓을 자리가 좀 좁아서요.” 직원이 반대편에도 상황을 알리고 카트를 옮긴다. 지나가도 된다는 말을 들은 뒤 안으로 간다.', '직원이 카트를 옮기는 동안 반대편 사람도 기다려 주었다. 통로가 넓어진 것을 보고 나서야 발을 옮긴다.'], '지나갈 자리를 부탁함 / 직원이 양쪽을 살피고 카트를 옮겨 줌', { energy: -1, focus: 'shared', motion: mm('walk', 'hall', '다른 사람들의 통행 확인과 공간 확보 후 들어간다.') }),
    act('S03-leave', '이쪽으로 들어가지 않고 집에 돌아간다', '가게에 들어가는 대신 집으로 돌아가기', { location: 'home', outing: false, returned: true, returnReason: '문 주변 공간을 피하기로 함', environment: { hazardObserved: true, spaceCleared: false, action: '이용을 중단해 해당 공간을 통과하지 않았다' }, facts: ['위험 신호를 본 뒤 이 입구를 이용하지 않고 귀가했다'] }, ['문 앞을 한 번 더 본다. 아직 카트 옆으로 지나가기는 어렵겠다. 안으로 들어가지 않고 돌아갈 길을 정한다.', '집에 와서 앉는다. 카페의 빈자리가 생각나 아쉽다. 잠깐 쉰 뒤 남은 오후에 무엇을 할지 생각해 본다.'], '좁은 입구로 들어가지 않고 귀가 / 카트와 대기 줄은 그대로', { energy: -1, focus: 'rest', motion: mm('walk', 'room', '해당 입구를 이용하지 않고 귀가해 앉는다.', 'sit') }),
    act('S03-notify-wait', '상황을 알리고 공간이 정리되기를 기다린다', '직원이 길을 비워 주면 안내에 따라 지나가기', { location: 'cafe', entrance: { passed: true }, environment: { hazardObserved: true, spaceCleared: true, responsibleActors: ['직원', '대기 이용자'], action: '직원이 통행을 안내하고 대기선을 비웠다' }, requests: [request('이쪽 대기 상황을 알림')], addMinutes: 6, facts: ['상황을 알린 후 직원의 통행 안내와 공간 확보를 확인했다'] }, ['이쪽에 기다리는 사람이 있다고 알리고 잠깐 멈춘다. 직원이 통행을 안내하고 대기선의 빈 공간을 확인해 준다.', '지나가도 된다는 안내를 듣고 들어간다. 기다리는 사이 직원과 다른 이용자들이 길을 비워 주었다.'], '기다리고 있다고 알림 · 대기 6분 / 직원과 다른 손님들이 길을 비워 줌', { energy: -1, motion: mm('walk', 'hall', '안내와 공간 확보를 확인한 뒤 통과한다.') })
  ], s => ({ kind: 'door-environment', value: s.initialConditions.doorMode, changes: ['문짝이 대기 공간을 쓸고 가는 조건'], unchanged: ['안쪽 카트와 대기선', '공간 관리 책임'] }));
  scene('S04', '열린 엘리베이터 앞에서', { location: ['elevator-lobby'], outing: true }, () => [
    '엘리베이터에 타서 목적 층으로 가고 싶다. 문을 잡은 사람이 “천천히 오세요”라고 말한다.',
    '고마운데도 마음은 급해진다. 안에서 기다리는 사람들을 보자 손잡이를 더 꼭 쥔다. 지금 갈까, 다음 것을 탈까.'
  ], () => [
    act('S04-thanks', '고맙다고 말하고 평소 속도로 간다', '도움은 받고 걸음은 그대로', { location: 'cafe', entrance: { passed: true }, conversations: ['고맙다고 말했다. 상대는 문을 열어 두고 기다렸다.'], facts: ['엘리베이터를 자기 속도로 탔다'] }, ['고맙다고 말하고 평소 속도로 간다. 상대는 문을 열어 둔 채 재촉하지 않고 기다려 준다.', '목적 층에 도착해서야 손잡이를 쥔 힘을 조금 푼다. 기다려 줘서 고마운데, 타는 동안 마음이 꽤 급했던 모양이다.'], '엘리베이터 · 고맙다고 말함 / 자기 속도 유지', { energy: -1, motion: mm('walk', 'hall', '자기 속도로 엘리베이터에 타고 목적 층으로 간다.') }),
    act('S04-say-slow', '천천히 가겠다고 알린다', '기다릴 수 있는지 말로 확인', { location: 'cafe', entrance: { passed: true }, requests: [request('천천히 이동할 동안 기다릴 수 있는지 확인')], conversations: ['“조금 천천히 갈게요.” “네, 기다릴게요.”'], facts: ['상대의 대답을 확인하고 천천히 엘리베이터에 탔다'] }, ['“조금 천천히 갈게요. 기다려 주실 수 있을까요?” 상대가 괜찮다고 답한다. 천천히 간다고 미리 말하니 조금 마음이 놓인다.', '천천히 타서 목적 층으로 간다. 기다려도 괜찮다는 대답을 들으니, 적어도 발을 재촉하지는 않아도 됐다.'], '엘리베이터 · 천천히 간다고 알림 / 기다림 확인', { energy: -1, motion: mm('walk', 'hall', '기다릴 수 있다는 대답을 듣고 천천히 탄다.') }),
    act('S04-next', '다음 엘리베이터를 기다린다', '먼저 가시라고 말하고 다음 편 기다리기', { location: 'cafe', entrance: { passed: true }, addMinutes: 5, conversations: ['“먼저 가세요. 다음 것을 탈게요.”'], facts: ['다음 엘리베이터를 기다려 목적 층으로 갔다'] }, ['먼저 가시라고 말하고 다음 편을 기다린다. 문을 잡았던 사람은 손을 놓고 올라간다.', '몇 분 뒤 온 엘리베이터를 타고 목적 층에 도착한다. 조금 늦어졌지만 마음은 덜 급하다.'], '엘리베이터 · 다음 편 대기 5분 / 목적 층 도착', { energy: -1, addMinutes: 5, motion: mm('walk', 'hall', '다음 엘리베이터를 기다려 목적 층으로 간다.') })
  ]);
  scene('S05', '도착했는데 입구에 턱이 있다', { location: ['entrance'], outing: true }, () => [
    '지도에는 도착했다고 뜬다. 유리 너머 의자가 보이는데, 문 앞에는 사진에서 못 본 턱이 있다. 이제 앉을 수 있을 줄 알았는데.',
    '여기까지 오느라 손바닥이 얼얼하다. 돌아가기에는 창가 자리가 아깝고, 그대로 들어갈 수 있을지는 모르겠다. 안쪽의 직원을 찾아본다.'
  ], () => [
    act('S05-staff', '직원에게 문 앞으로 와 달라고 한다', '들어갈 수 있는 다른 입구가 있는지 묻기', { location: 'cafe', entrance: { passed: true, selected: 'verified-side' }, requests: [request('문 앞에서 이용 가능한 출입 대안 확인')], access: { threshold: 'confirmed-fiction-side-entry' }, addMinutes: 5, facts: ['직원이 확인한 옆 출입구로 가게에 들어갔다'] }, ['직원이 문 앞으로 나와 턱이 얼마나 높은지 함께 살핀다. 옆 출입구로는 들어갈 수 있다고 안내해 주어, 그쪽으로 돌아간다.', '눈여겨봤던 창가 자리는 안쪽에 있다. 처음만큼 들뜨지는 않는다. 커피 향을 맡으며 계산대로 간다.'], '마지막 단차 · 직원 확인 5분 / 확인된 옆문으로 입장', { energy: -1, motion: mm('walk', 'hall', '직원이 확인한 옆 출입구로 입장한다.') }),
    act('S05-another', '다른 장소를 고른다', '들어갈 수 있는 다른 가게 찾기', { location: 'cafe', entrance: { passed: true, selected: 'another-verified-place' }, access: { threshold: 'confirmed-fiction-new-place' }, detourMeters: 120, addMinutes: 12, facts: ['근처 다른 가게에 연락해 출입 조건을 확인한 뒤 옮겼다'] }, ['근처 다른 가게에 전화해 들어갈 수 있는지 물어보고 그쪽으로 간다. 사진으로 봤던 창가 자리는 오늘 포기해야겠다.', '다른 가게까지 걸어오느라 조금 지쳤다. 유리컵 부딪히는 소리를 들으며 메뉴를 본다. 여기에도 마셔 보고 싶은 음료가 있다.'], '다른 가게에 확인 후 120m 이동 / 알아보고 옮기는 데 12분', { energy: -2, mood: 1, motion: mm('walk', 'street', '조건을 확인한 다른 가게로 이동한다.') }),
    act('S05-home', '집으로 돌아간다', '가게에 들어가지 않고 귀가하기', { location: 'home', outing: false, returned: true, returnReason: '도착한 입구의 단차 뒤에 귀가를 선택함', plan: { returnConsidered: true }, facts: ['원래 가게에 들어가지 않고 귀가했다'] }, ['원래 가게에 들어가지 않고 돌아선다. 유리 너머로 봤던 창가 자리가 계속 생각난다.', '집에 와서 앉으니 손바닥에 실렸던 힘이 풀린다. 가게 안에 들어가지 못한 건 아쉽다. 잠깐 쉬고 나면 집에서 마실 것을 골라 봐야겠다.'], '입장하지 않음 · 귀가 / 원래 가게의 좌석은 이용하지 않음', { energy: -1, focus: 'rest', motion: mm('walk', 'room', '원래 가게를 이용하지 않고 집에 돌아와 앉는다.', 'sit') })
  ]);
  scene('S06', '계산대 아래의 카드', { location: ['cafe'], outing: true }, () => [
    '결제를 끝내고 앉을 자리로 가고 싶다. 카드가 계산대 아래로 떨어진다. 뒤에서 신발 끄는 소리가 난다.',
    '뒤에서 나를 보고 있을까 신경 쓰인다. 카드는 보이는데 몸을 숙이자니 망설여진다. 한 번 더 부탁해도 될까.'
  ], s => {
    const choices = [
      act('S06-ask', '카드를 주워 달라고 부탁한다', '부탁해서 손 닿는 곳에 카드 받기', { items: { cardLocation: 'wallet' }, requests: [request('떨어진 카드 회수 부탁')], facts: ['직원이 카드를 주워 손 닿는 곳에 놓았다', '카드를 지갑에 넣고 결제를 마쳤다'] }, ['“카드 좀 주워 주시겠어요?” 작게 말하자 직원이 카드를 주워 손 닿는 곳에 놓는다. 그제야 길게 숨을 내쉰다.', '직원이 카드를 건넨 뒤 계산을 이어간다. 카드를 지갑에 넣으니 마음이 놓인다. 뒤에서 기다리던 사람들이 한 걸음씩 다가온다. 발소리에 나도 모르게 몸을 비킨다.'], '카드 회수 확인 · 지갑에 보관 / 결제 완료', { focus: 'shared' }),
      act('S06-pause', '직원에게 상황을 설명하고 잠깐 기다린다', '계산은 잠깐 멈추고 카드부터 받기', { items: { cardLocation: 'wallet' }, requests: [request('거래를 잠시 멈추고 카드 회수 상황 설명')], addMinutes: 3, facts: ['직원이 거래를 잠시 멈추고 카드를 회수해 건넸다', '카드를 지갑에 넣고 결제를 마쳤다'] }, ['직원에게 카드가 떨어졌다고 말한다. 직원이 계산을 잠깐 멈추고 카드를 주워 건넨다. 뒤에서 신발 끄는 소리가 또 난다.', '카드를 지갑에 넣고 결제를 마친다. 뒤쪽을 돌아볼 여유는 없다. 지갑 안에 카드가 있는 것을 한 번 더 확인한다.'], '거래 잠시 멈춤 3분 / 카드 회수·결제 완료')
    ];
    if (s.initialConditions.phonePayment) choices.push(act('S06-phone', '준비된 휴대전화 결제로 이어 간다', '결제와 별도로 카드 회수도 확인', { items: { cardLocation: 'wallet' }, requests: [request('휴대전화 결제 뒤 떨어진 카드 회수 확인')], facts: ['미리 준비해 둔 휴대전화로 결제했다', '직원이 회수한 카드를 지갑에 넣었다'] }, ['미리 준비해 둔 휴대전화로 결제한다. 계산을 마쳐도 바닥에 떨어진 카드는 찾아야 한다.', '직원이 주워 준 카드를 받아 지갑에 넣는다. 계산도 끝났고 카드도 챙겼다. 이제 앉을 자리를 찾으러 간다.'], '휴대전화 결제 / 카드 회수 확인·지갑 보관'));
    for (const choice of choices) choice.motion = mm('stand', 'hall', '계산대에서 카드를 챙기고 앉을 자리를 찾는다.');
    return choices;
  });
  scene('S07', '컵만 부탁했는데', { location: ['home'], helpRequested: true }, s => s.initialConditions.helpStyle === 'ask' ? [
    '창가에 옮겨 받은 컵을 본다. 상대가 “다른 것도 해줄까?” 하고 먼저 묻는다.',
    '컵은 잘 받았다. 손바닥은 아직 얼얼하지만, 나머지 물건은 내가 정리하고 싶기도 하다. 어디까지 부탁할까.'
  ] : [
    '컵만 옮겨 달라고 부탁했는데 상대가 “앉아 있어, 내가 다 할게”라고 말한다.',
    '다 해주면 몸은 편하겠지만, 물건 정리까지 맡기고 싶었던 건 아니다. 상대가 대답을 기다린다. 어디까지 부탁할지 생각한다.'
  ], s => [
    act('S07-all', '이번에는 남은 준비도 맡긴다', '남은 준비는 맡기고 앉아서 커피 마시기', { help: { scope: 'all', delegated: ['컵 옮기기', '물건 정리', '남은 준비'], ownTasks: ['마실 자리에서 시간 보내기'] }, conversations: [s.initialConditions.helpStyle === 'ask' ? '다른 것도 도와줄지 물었고 이번에는 맡기겠다고 답했다.' : '다 해주겠다는 제안을 이번에는 받아들였다.'], facts: ['동의한 범위의 남은 준비를 상대가 맡았다'] }, ['이번에는 남은 준비도 부탁한다고 말한다. 상대가 물건을 정리하는 동안 나는 컵 옆에 앉아 쉰다.', '물건을 정리하는 모습을 보다가 등을 기댄다. 직접 하려던 일도 이번에는 맡기고 쉬기로 한다.'], '남은 준비도 부탁함 / 앉아서 커피를 마시며 쉼', { energy: 1, effect: 'rest', focus: 'rest' }),
    act('S07-cup', '컵만 옮겨 달라고 말한다', '나머지 물건 정리는 내가 하기', { help: { scope: 'cup', delegated: ['컵 옮기기'], ownTasks: ['물건 정리', '남은 준비'] }, requests: [request('컵만 부탁한다고 도움 범위 설명')], facts: ['컵 옮기기만 맡기고 나머지 준비는 직접 정했다'] }, ['“컵만 부탁할게. 나머지는 내가 정리하고 싶어.” 한 문장을 더 말한다. 상대가 알겠다고 답한다.', '컵은 창가에 그대로 둔다. 괜히 고마움을 모르는 말처럼 들렸을까 신경 쓰였는데, 상대가 알겠다고 해 안심한다. 나머지 물건 자리는 내가 정한다.'], '도움 범위: 컵만 / 나머지 준비는 직접 결정', { focus: 'create' }),
    act('S07-decline', '지금은 더 돕지 않아도 된다고 말한다', '받은 컵은 그대로, 남은 계획은 다시 조정', { help: { scope: 'none-further', delegated: ['이미 끝난 컵 옮기기'], ownTasks: ['남은 계획 다시 정하기'] }, conversations: ['지금은 더 돕지 않아도 된다고 말했고 상대가 멈췄다.'], facts: ['이미 받은 컵은 두고 추가 도움을 멈췄다'] }, ['“고마워. 지금은 이 정도면 될 것 같아.” 상대가 알겠다고 하고 정리를 멈춘다. 컵은 창가에 그대로 있다.', '남은 일은 조금 줄이기로 한다. 커피를 마저 마시고 나서 필요한 것부터 정리해야겠다.'], '더 도와주지 않아도 된다고 말함 / 컵은 그대로 두고 남은 일은 줄임')
  ], s => ({ kind: 'help-consent', value: s.initialConditions.helpStyle, changes: ['상대가 먼저 범위를 물었는지'], unchanged: ['주인공이 정할 도움의 범위', '수락·거절 가능'] }));
  scene('S08', '갈 길과 돌아올 길', { location: ['home'] }, () => [
    '카페에서 잠깐 앉아 있고 싶다. 지도에서 가는 길을 따라보다가 집으로 돌아올 길도 다시 짚어 본다.',
    '지금은 갈 만해 보여도, 돌아올 때 손과 다리에 얼마나 힘이 남아 있을지 모르겠다. 가까운 곳으로 바꿀까 잠깐 고민한다.'
  ], s => [
    act('S08-planned', '계획한 장소로 간다', '머무는 시간과 돌아올 길도 생각하기', { location: 'street', outing: true, plan: { destination: '계획한 카페', outboundMeters: 300, returnMeters: 300, returnConsidered: true }, accessSource: 'planned-cafe', access: s.context.accessSource === 'planned-cafe' ? { ...s.context.access } : { toilet: 'unknown', threshold: 'unknown', distance: 'map-estimate', rest: 'unknown' }, facts: ['계획한 장소로 출발하기 전에 돌아올 거리 300m도 확인했다', '접근 정보는 선택한 장소의 확인 근거만 유지했다'] }, ['보고 싶던 장소로 출발한다. 입구와 쉴 자리는 지금 가려는 가게의 정보를 다시 본다. 얼마나 앉아 있다가 돌아올지도 생각해 둔다.', '카페에 가면 무엇부터 마실지 생각하며 걷는다. 돌아오는 길도 300미터다. 얼마나 쉬었다 나올지도 생각해 둔다.'], '계획 장소 출발 · 편도 300m / 귀가 300m도 고려', { energy: -1, focus: 'outing', motion: mm('walk', 'street', '돌아올 길도 확인하고 계획한 장소로 출발한다.') }),
    act('S08-near', '더 가까운 곳으로 바꾼다', '원래 장소보다 왕복 거리 줄이기', { location: 'street', outing: true, plan: { destination: '가까운 카페', outboundMeters: 100, returnMeters: 100, returnConsidered: true }, accessSource: 'nearby-cafe', access: s.context.accessSource === 'nearby-cafe' ? { ...s.context.access } : { toilet: 'unknown', threshold: 'unknown', distance: 'map-estimate', rest: 'unknown' }, facts: ['가까운 장소로 바꿔 편도 100m와 귀가 100m를 계획했다', '접근 정보는 선택한 장소의 확인 근거만 유지했다'] }, ['가까운 곳으로 목적지를 바꾼다. 사진으로 봤던 창가는 오늘 가지 않기로 한다. 입구와 쉴 자리도 가게마다 다를 수 있다.', '돌아오는 길이 짧아진 대신 메뉴도 바뀐다. 새 가게에서 궁금한 음료 하나를 골라 둔다.'], '가까운 장소로 변경 · 편도 100m / 귀가 100m', { energy: -1, mood: 1, focus: 'outing', motion: mm('walk', 'street', '가까운 장소로 목적지를 바꿔 출발한다.') }),
    act('S08-later', '오늘은 외출을 미룬다', '남은 시간에 집에서 할 일 고르기', { location: 'home', outing: false, returnReason: '출발 전에 외출을 미룸', plan: { destination: '오늘은 집', outboundMeters: 0, returnMeters: 0, returnConsidered: true }, facts: ['외출을 출발 전에 미루고 집에 머물렀다'] }, ['오늘의 외출을 미루고 지도 앱을 닫는다. 신발을 꺼내려다 그만두고 집에 머무르기로 한다.', '집에서 듣고 싶던 음악을 하나 고른다. 외출을 미뤄 아쉽지만, 집에서 음악을 들을 시간은 생겼다. 남은 시간은 집에서 보내기로 한다.'], '외출 미룸 · 출발하지 않음 / 집에서 남은 시간', { energy: 1, effect: 'rest', focus: 'rest' })
  ]);
  scene('S09', '빈자리와 앉을 자리', { location: ['cafe'], outing: true }, () => [
    '빈 의자가 보여 반가웠는데 모두 높은 바 의자다. 목발을 놓고 몸을 끌어올릴 생각을 하니 막막하다. 낮은 테이블에서는 아직 이야기가 한창이다.',
    '몸을 받쳐 주는 낮은 의자에 앉고 싶다. 조금 더 기다릴까, 직원에게 다른 자리가 있는지 물어볼까.'
  ], () => [
    act('S09-wait', '낮은 자리가 날 때까지 기다린다', '기다린 뒤 실제로 빈 자리 확인', { seat: { visibleEmpty: 'high-and-low', usable: 'low-chair', mode: 'seated', waitedMinutes: 7 }, addMinutes: 7, facts: ['손님이 떠난 뒤 비게 된 낮은 자리에 앉았다'] }, ['메뉴를 고르는 일을 잠깐 뒤로 미루고 기다린다. 몇 분 뒤 다른 손님이 식사를 마치고 자리를 떠난다.', '손님이 떠난 낮은 자리에 앉는다. 조금 기다렸지만, 이제 컵을 편하게 내려놓을 수 있다.'], '높은 빈자리와 구별 · 낮은 자리 대기 7분 후 착석', { energy: -1, motion: mm('sit', 'room', '실제로 비게 된 낮은 자리에 앉는다.') }),
    act('S09-ask', '직원에게 앉을 만한 자리가 있는지 묻는다', '안쪽에 낮은 의자가 있는지 물어보기', { seat: { visibleEmpty: 'high-and-low', usable: 'low-chair', mode: 'seated', waitedMinutes: 3 }, requests: [request('이용 가능한 낮은 자리 확인')], addMinutes: 3, facts: ['직원이 안쪽의 사용하지 않던 낮은 자리를 확인해 안내했다'] }, ['직원이 안쪽을 둘러보더니 비어 있던 낮은 의자로 안내해 준다. 다른 손님이 자리를 옮길 필요는 없었다.', '바깥 풍경은 잘 안 보이지만 편하게 앉을 수 있다. 이제 메뉴를 다시 펼쳐 본다.'], '직원 확인 · 안쪽 낮은 자리 / 다른 손님 이동 없음', { focus: 'shared' }),
    act('S09-takeout', '포장해서 가져가려 한다', '집에서 먹으려고 포장을 부탁하기', { location: 'home', outing: false, returned: true, returnReason: '목발을 짚느라 포장한 음식물을 가져가지 못하고 빈손으로 귀가', seat: { visibleEmpty: 'high-only', usable: null, mode: 'takeout' }, items: { container: 'takeout-cup', cupLocation: 'store-counter', drinkPlace: null }, facts: ['양손으로 목발을 짚고 있어 포장한 음식물을 집에 가져갈 수 없었다', '포장한 음식물은 가게에 두고 빈손으로 돌아왔다'] }, ['집에서 먹으려고 포장을 부탁한다. 그런데 양손으로 목발을 짚고 있어 포장한 음식을 들고 갈 수가 없다. 봉투를 들면 목발 손잡이를 제대로 잡을 수 없다.', '직원에게 사정을 설명하고 포장한 음식은 가게에 둔다. 먹고 싶었던 것을 가져오지 못한 채 빈손으로 집에 돌아온다. 앉고 나서도 아쉬움이 남는다.'], '목발 때문에 포장 음식 운반 불가 · 음식은 가게에 두고 빈손으로 귀가', { energy: -1, focus: 'rest', motion: mm('walk', 'room', '포장한 음식물은 가게에 두고 빈손으로 집에 돌아와 앉는다.', 'sit') })
  ]);
  scene('S10', '앉고 나서 보이는 셀프 코너', { location: ['cafe'], outing: true, seated: true }, () => [
    '앉고 나니 목발에서 손을 뗄 수 있어 편하다. 그런데 물과 식기는 셀프 코너에 있다고 적혀 있다.',
    '컵을 들고 어떻게 돌아오지. 다시 일어나려다 직원 쪽을 본다. 한 번 더 부탁하기가 망설여진다. 물과 식기는 아직 없다.'
  ], () => [
    act('S10-all', '물과 필요한 식기를 한 번에 부탁한다', '필요한 것을 정리해 말하기', { needs: { water: 'received', utensils: 'received' }, requests: [request('물과 식기를 함께 요청')], facts: ['부탁한 물과 식기를 실제로 받았다'] }, ['직원이 가까이 왔을 때 말을 꺼낸다. “물하고 식기도 부탁드려도 될까요?” 잠깐 뒤 물과 식기가 테이블에 놓인다.', '물과 식기가 놓이니 음식 맛에 조금 더 집중할 수 있다. 부탁할 말을 고르기는 쉽지 않았지만, 이제 앉아서 편하게 먹는다.'], '요청 1회 · 물 수령 / 식기 수령', { focus: 'shared' }),
    act('S10-separate', '필요할 때마다 따로 부탁한다', '식사 중 두 번 말을 꺼내기', { needs: { water: 'received', utensils: 'received' }, requests: [request('물 요청'), request('식기 요청')], facts: ['물과 식기를 각각 부탁해 받았다'] }, ['물을 부탁해 받고 나서야 식기도 없다는 걸 알아차린다. 방금 불렀던 직원을 다시 부르려니 목소리가 작아진다. 그래도 한 번 더 부탁해 식기를 받는다.', '물과 식기가 모두 놓이고 나서야 먹는 데 집중한다. 두 번이나 말을 걸기가 망설여졌지만, 음식은 맛있다.'], '요청 2회 · 물과 식기를 각각 수령'),
    act('S10-defer', '지금은 미루고 주문을 간단히 바꾼다', '아직 받지 않은 물과 식기는 나중에 부탁하기', { needs: { water: 'pending', utensils: 'pending' }, unspoken: ['물과 식기는 지금 요청하지 않았다'], facts: ['물과 식기를 받지 않은 상태로 요청을 미뤘다'] }, ['한 번 더 부탁할 말을 고르다가 우선 주문부터 간단히 바꾼다. 물과 식기는 아직 테이블에 없다.', '잠깐 앉아서 무엇이 필요한지 다시 생각한다. 물과 식기는 아직 받지 않았지만, 필요하면 다시 부탁할 수 있다.'], '물 미수령·식기 미수령 / 물과 식기는 아직 부탁하지 않음')
  ]);
  scene('S11', '친구들 말이 잘 안 들린다', { location: ['street'], outing: true, companion: 'friends' }, () => [
    '친구의 말끝을 듣고 싶은데 목발을 옮기는 사이 거리가 벌어진다. 앞에서는 웃음이 터지고, 벌써 다음 이야기를 하고 있다.',
    '무슨 말에 웃은 걸까. 한 번 더 천천히 가 달라고 할지, 그냥 따라갈지 망설인다.'
  ], () => [
    act('S11-slower', '다시 조금만 천천히 가자고 한다', '같은 부탁을 반복하고 나란히 걷기', { socialPatch: { missedWords: true, together: true }, requests: [request('다시 조금만 천천히 걷자고 요청')], conversations: ['친구가 돌아보고 속도를 맞췄다. 놓친 말의 끝을 다시 들었다.'], facts: ['속도를 다시 말한 뒤 친구와 나란히 걸었다'] }, ['다시 조금만 천천히 가자고 말한다. 친구가 돌아보고 간격을 줄인다. 놓친 말의 끝을 한 번 더 들려준다.', '이야기를 다시 듣고 함께 웃는다. 같은 말을 또 하기가 망설여졌지만, 무슨 얘기였는지는 이제 알겠다.'], '요청 반복 1회 / 놓친 말 다시 들음 / 나란히 이동', { energy: -1, motion: mm('walk', 'street', '친구가 속도를 맞춘 뒤 나란히 걷는다.') }),
    act('S11-stop', '잠깐 멈춰 함께 이야기하자고 한다', '이동 일정은 늦추고 대화는 이어 가기', { socialPatch: { missedWords: true, together: true }, requests: [request('잠깐 멈춰 함께 이야기하자고 요청')], conversations: ['친구들과 멈춰 서서 이야기를 이어 갔다.'], addMinutes: 5, facts: ['이동을 잠깐 멈추고 친구들과 이야기했다'] }, ['여기서 잠깐 이야기하자고 말한다. 친구들이 멈춰 돌아선다. 목적지에 닿는 시간은 조금 늦어진다.', '서서 이야기하니 무슨 말인지 끝까지 잘 들린다. 대신 목적지에는 조금 늦게 도착하겠다.'], '잠깐 멈춤 5분 / 대화 참여 / 이동 계획 조정', { focus: 'shared', motion: mm('stand', 'street', '이동을 잠깐 멈추고 친구들의 이야기를 듣는다.') }),
    act('S11-own', '뒤에서 자기 속도로 간다', '추가 요청은 줄지만 말 일부는 놓치기', { socialPatch: { missedWords: true, together: false }, unspoken: ['이번에는 속도를 맞춰 달라는 말을 하지 않았다'], conversations: ['친구가 한 번 돌아봤지만 앞쪽 대화 일부는 듣지 못했다.'], facts: ['자기 속도로 걸으며 앞쪽 대화 일부를 놓쳤다'] }, ['추가로 말을 꺼내지 않고 자기 속도로 간다. 친구가 한 번 돌아보지만 앞에서 끝난 이야기의 일부는 들리지 않는다.', '앞에서 또 웃음이 난다. 무슨 얘기인지 묻고 싶지만 거리가 있다. 말하지 않고 걸으면서도 자꾸 앞쪽 말소리에 귀를 기울이게 된다.'], '추가 요청 없음 / 자기 속도 / 대화 일부 놓침', { energy: -1, motion: mm('walk', 'street', '자기 속도로 걸으며 앞쪽 대화 일부를 놓친다.') })
  ]);
  scene('S12', '가까운 계단, 먼 엘리베이터', { location: ['street'], outing: true }, () => [
    '목적지로 들어가는 가까운 길에 계단 다섯 칸이 있다. 난간이 중간에 끊겨 있고 기다릴 자리도 좁다. 지금 이 계단은 이용할 수 없다.',
    '계단 앞에서 주변을 살핀다. 중간에 쉬거나 잠깐 비켜설 곳도 마땅치 않다.',
    '엘리베이터 표지는 반대쪽 복도 끝을 가리킨다. 저기까지 다시 돌아가야 하나 싶어 잠깐 서 있다.'
  ], () => [
    act('S12-elevator', '엘리베이터 경로를 택한다', '추가 거리와 시간, 귀가 길도 반영', { location: 'elevator-lobby', plan: { returnConsidered: true }, detourMeters: 180, addMinutes: 8, facts: ['가까운 계단 대신 180m 돌아 엘리베이터 앞에 왔다'] }, ['계단 대신 엘리베이터 표지를 따라간다. 가까운 길보다 180미터를 더 돌아 문 앞에 도착한다.', '도착하니 손바닥과 [[support:thigh]]가 묵직하다. 돌아갈 때도 이 길을 와야겠구나 싶다. 아직 엘리베이터를 타지는 않았다.'], '계단 이용 안 함 · 엘리베이터까지 우회 180m / 8분', { energy: -2, focus: 'outing', motion: mm('walk', 'hall', '추가 거리를 돌아 엘리베이터 앞에 도착한다.') }),
    act('S12-confirm', '다른 접근 경로를 확인한다', '안내받은 연결 통로를 실제 확인', { location: 'elevator-lobby', access: { threshold: 'confirmed-fiction-connecting-passage' }, requests: [request('이용 가능한 다른 연결 통로 확인')], detourMeters: 120, addMinutes: 10, facts: ['직원이 확인한 연결 통로로 엘리베이터 앞에 왔다'] }, ['직원에게 다른 길이 있는지 묻는다. 안내해 준 연결 통로를 지나 엘리베이터 앞까지 간다.', '길을 묻고 찾아오느라 시간이 걸렸고, 120미터를 더 걸었다. 엘리베이터 앞에서 손잡이를 다시 고쳐 쥔다.'], '문의·확인 10분 / 확인된 연결 통로 120m 추가', { energy: -1, motion: mm('walk', 'hall', '확인된 연결 통로를 따라 엘리베이터 앞에 간다.') }),
    act('S12-home', '목적지를 바꾸어 집으로 돌아간다', '다른 길로 더 돌아가는 대신 귀가하기', { location: 'home', outing: false, returned: true, returnReason: '이용할 경로를 다시 고른 뒤 귀가', plan: { returnConsidered: true }, facts: ['그 계단과 엘리베이터를 이용하지 않고 귀가했다'] }, ['원래 목적지 대신 집으로 돌아갈 길을 고른다. 다섯 칸뿐이어도 오늘 이용할 수 있는 길은 아니었다.', '집 의자에 앉는다. 가려던 곳에 못 간 것은 아쉽지만, 지금은 다리와 팔을 좀 쉬게 하고 싶다.'], '목적지 변경·귀가 / 해당 계단·엘리베이터 이용 안 함', { energy: -1, focus: 'rest', motion: mm('walk', 'room', '목적지를 바꾸어 집으로 돌아온다.', 'sit') })
  ]);
  scene('S13', '메뉴보다 먼저 확인하는 지도', { location: ['home'] }, () => [
    '가 보고 싶은 카페를 찾아본다. 사진 속 창가가 좋아 메뉴를 열려다가 화장실 위치부터 찾는다.',
    '한참 사진을 넘겨도 입구 바닥은 잘 보이지 않는다. 화장실까지 멀지는 않을지, 걷다가 잠깐 앉을 곳은 있을지도 궁금하다.',
    '메뉴는 아직 열어 보지도 못했다. 가게에 전화해서 물어볼까.'
  ], () => [
    act('S13-check', '들어갈 길과 쉴 곳부터 알아본다', '확인한 것과 모르는 것을 따로 남기기', { accessSource: 'planned-cafe', access: { toilet: 'unknown', threshold: 'confirmed-fiction-phone', distance: 'map-estimate', rest: 'confirmed-fiction-phone' }, addMinutes: 8, facts: ['전화로 입구와 쉬는 곳을 확인했다', '화장실은 미확인, 거리는 지도 추정으로 남겼다'] }, ['가게에 전화해 입구와 잠깐 앉을 곳을 묻는다. 화장실은 잘 모르겠다는 답이 돌아온다. 거리는 일단 지도에 나온 만큼으로 생각해 둔다.', '전화를 끊고 확인한 내용을 적는다. 입구와 쉴 곳은 알게 됐지만 화장실은 아직 모르겠다. 거리는 지도에 나온 예상치 그대로 둔다.'], '문턱·휴식: 확인 / 화장실: 미확인 / 거리: 지도 추정', { focus: 'observe' }),
    act('S13-known', '들어갈 길을 알아본 가까운 곳을 고른다', '가 보고 싶던 곳 대신 미리 알아본 곳으로', { accessSource: 'nearby-cafe', access: { toilet: 'confirmed-fiction-phone', threshold: 'confirmed-fiction-phone', distance: 'known-fiction-route', rest: 'confirmed-fiction-phone' }, plan: { destination: '조건을 확인한 가까운 곳' }, facts: ['가까운 곳의 화장실·문턱·거리·쉴 곳을 확인한 내용을 적었다'] }, ['가까운 곳의 화장실 위치와 문턱, 쉴 곳을 문의하고 적어 둔다. 거리는 알고 있는 길을 기준으로 확인한다.', '사진으로 봤던 가게는 이번에 가지 않기로 한다. 가까운 곳은 입구와 쉴 자리까지 알게 돼 준비하기가 조금 수월하다.'], '가까운 곳 / 화장실·문턱·거리·쉴 곳 확인', { focus: 'outing' }),
    act('S13-onsite', '가 보고 현장에서 판단하기로 한다', '직접 살펴보고, 어려우면 계획 바꾸기', { accessSource: 'planned-cafe', access: { toilet: 'unknown', threshold: 'unknown', distance: 'map-estimate', rest: 'unknown' }, facts: ['현장 판단을 계획하고 접근 정보의 미확인 상태를 유지했다'] }, ['사진 속 가게에 일단 가 보기로 한다. 화장실과 문턱, 쉴 곳은 아직 모르겠다. 가서 보고, 들어가기 어렵다면 다른 곳으로 가야겠다.', '사진 속 풍경은 여전히 가 보고 싶다. 아직 출발 전이다. 확인하지 못한 곳은 현장에서 살펴보고, 필요하면 계획을 바꾸기로 한다.'], '현장 판단 계획 / 화장실·문턱·휴식 미확인 / 거리 추정', { focus: 'create' })
  ]);

  const doorEncounter = (doorType, phase = 'waiting') => ({ kind: 'door', doorType, phase });
  function decorateNode(node, s) {
    const door = s.initialConditions.doorMode;
    const kiosk = s.initialConditions.orderMode === 'kiosk';
    if (node.sceneId === 'S02') {
      node.encounter = doorEncounter(door);
      if (door === 'manual') node.lines.push('문을 미는 데 생각보다 힘이 든다. 양손은 목발 손잡이를 잡고 있다. 문을 밀 손과 몸을 지탱할 손을 동시에 마련하기 어렵다. 뒤에 사람이 서자 더 빨리 들어가야 할 것 같아 어깨에 힘이 들어간다.');
      else if (door === 'automatic') node.lines.push('문짝을 밀 필요는 없지만, 문이 열리자 뒤에 있던 사람들도 움직인다. 문이 닫히기 전에 지나가야 할 것 같아 마음이 급해진다. 서두르려다 목발 손잡이를 더 세게 쥔 것을 알아차린다.');
      else {
        node.title = '회전문 앞에서 타이밍을 놓친다';
        node.lines = ['유리 칸이 천천히 돌아간다. 다른 사람은 빈 칸에 맞춰 들어가는데, 목발과 발을 둘 자리를 생각하는 사이 다음 칸이 지나간다.', '들어간 뒤에는 곡선을 따라 움직여야 한다. 한쪽 목발만 먼저 돌아가고 몸이 뒤처질 것 같아 발을 떼기 어렵다. 뒤에서 기다리는 사람이 보이자 손바닥에 더 힘이 들어간다.', '회전문 안으로 들어가지는 않았다. 옆에 일반 출입구 표시가 있지만 실제로 열려 있는지는 아직 모른다.'];
        node.choices = [
          act('S02-revolving-watch', '한쪽으로 비켜서 움직임을 살핀다', '회전문에 들어가지 않고 옆 출입구 확인', { entrance: { selected: 'revolving-front', passed: false, waitMinutes: 3 }, environment: { hazardObserved: true, action: '회전문 밖에서 움직임과 옆 출입구 표지를 확인했다' }, addMinutes: 3, facts: ['회전문의 속도와 곡선 이동이 부담스러워 들어가지 않았다'] }, ['통행을 막지 않는 옆 공간으로 비켜선다. 문이 한 바퀴 도는 동안 눈으로 따라가지만, 들어갈 순간을 정하기 어렵다.', '회전문은 이용하지 않기로 한다. 옆 출입구가 실제로 열리는지 확인해야 한다. 기다리는 동안 [[support:leg-spaced]]가 묵직해진다.'], '회전문은 이용하지 않음 · 바깥에서 3분 확인', { durationMinutes: 5, effect: 'standing', energy: -1, motion: mm('stand', 'hall', '회전문 바깥에서 움직임을 살핀다.') }),
          act('S02-revolving-ask', '직원에게 일반 출입구를 물어본다', '옆문을 이용할 수 있는지 말로 확인', { entrance: { selected: 'side-unverified', passed: false }, requests: [request('회전문 대신 이용할 일반 출입구 문의')], addMinutes: 4, facts: ['회전문을 이용하기 어려워 직원에게 옆 출입구를 물었다'] }, ['“목발을 짚고 있어서 회전문으로 들어가기 어려워요. 다른 문을 이용할 수 있을까요?” 직원이 옆문을 확인하러 간다.', '문 밖에서 답을 기다린다. 다른 문이 있으면 좋겠다고 생각하며 손잡이를 고쳐 쥔다. 아직 들어가지는 않았다.'], '회전문은 이용하지 않음 · 일반 출입구 문의', { durationMinutes: 6, effect: 'standing', focus: 'shared', motion: mm('stand', 'hall', '직원에게 일반 출입구를 문의하고 바깥에서 기다린다.') }),
          act('S02-revolving-side', '옆 출입구 표지 쪽으로 돌아간다', '표지만 보고 이용 가능하다고 단정하지 않기', { entrance: { selected: 'side-unverified', sideReached: true, passed: false }, detourMeters: 30, addMinutes: 5, facts: ['회전문에 들어가지 않고 옆 출입구까지 30m 돌아갔다'] }, ['회전문을 따라 돌지 않고 옆 출입구 표지 쪽으로 간다. 유리문에는 직원 확인이 필요하다는 안내가 붙어 있다.', '문 앞에 도착했지만 바로 들어갈 수 있는 것은 아니다. 손잡이를 당기며 버티는 대신 직원에게 확인할 준비를 한다.'], '회전문은 이용하지 않음 · 옆문까지 30m 우회', { durationMinutes: 8, energy: -1, motion: mm('walk', 'hall', '회전문을 피해서 옆 출입구 표지까지 간다.') })
        ];
      }
      for (const ch of node.choices) ch.motion = { ...ch.motion, encounter: doorEncounter(door === 'revolving' && ch.effects.entrance?.sideReached ? 'manual' : door, ch.effects.entrance?.passed ? 'passed' : 'waiting') };
    }
    if (node.sceneId === 'S03') {
      node.encounter = doorEncounter(door === 'revolving' ? 'manual' : door);
      if (door === 'revolving') {
        node.title = '옆문을 이용할 수 있을까?';
        node.lines = ['회전문에는 들어가지 않았다. 옆 일반문은 직원이 열어 주어야 하고, 그 안쪽에는 카트와 대기선이 겹쳐 있다.', '옆문이 열려도 카트 사이로 지나갈 자리가 좁아 보인다. 직원에게 문과 통로를 함께 봐 달라고 말해야겠다.'];
        node.choices = [
          act('S03-coordinate', '옆문과 통로를 함께 확인해 달라고 한다', '직원이 열고 공간을 비운 뒤 이동', { location: 'cafe', entrance: { selected: 'verified-side', actualMode: 'manual', passed: true, heldBy: '직원' }, environment: { layout: 'swing-door', hazardObserved: true, spaceCleared: true, responsibleActors: ['직원'], action: '직원이 옆 일반문을 열고 카트를 옮겨 통로를 확보했다' }, requests: [request('옆 일반문 개방과 통로 확보 요청')], detourMeters: s.context.entrance.sideReached ? 0 : 30, addMinutes: 4, facts: ['직원이 옆 일반문과 통로를 확인한 뒤 그쪽으로 들어갔다', '회전문은 이용하지 않았다'] }, ['직원에게 옆문을 열고 통로도 확인해 달라고 부탁한다. 직원이 카트를 옮긴 뒤 일반문을 잡아 준다.', '직원이 잡아 준 옆문으로 천천히 들어간다. 목발을 짚고 몸을 돌릴 때 등과 어깨가 당긴다. 문 안으로 들어서고서야 길게 숨을 내쉰다.'], '회전문 대신 확인된 옆문 · 직원 요청 후 통로 확보', { durationMinutes: 10, effect: 'walk', energy: -1, focus: 'shared', motion: { ...mm('walk', 'hall', '직원이 확보한 통로와 옆 일반문을 통과한다.'), encounter: doorEncounter('manual', 'passed') } }),
          act('S03-leave', '옆문 확인을 기다리지 않고 돌아간다', '회전문과 미확인 옆문 모두 이용하지 않기', { location: 'home', outing: false, returned: true, returnReason: '회전문과 미확인 옆문을 이용하지 않고 귀가', environment: { hazardObserved: true, spaceCleared: false, action: '확인되지 않은 출입구를 이용하지 않았다' }, facts: ['회전문과 미확인 옆문으로 들어가지 않고 집에 돌아왔다'] }, ['직원에게 이번에는 들어가지 않겠다고 말한다. 회전문이나 아직 확인되지 않은 옆문으로는 가지 않는다.', '빈손으로 집에 돌아와 앉는다. 가게 안에 들어가고 싶었던 마음이 남아 있다. 지금은 팔을 좀 쉬게 하고 싶다.'], '회전문·옆문 이용 안 함 · 귀가', { durationMinutes: 12, effect: 'walk', energy: -1, focus: 'rest', motion: mm('walk', 'room', '입구를 이용하지 않고 집에 돌아와 앉는다.', 'sit') }),
          act('S03-notify-wait', '옆문을 열어 줄 직원을 기다린다', '문 개방과 통로 확보를 확인한 뒤 이동', { location: 'cafe', entrance: { selected: 'verified-side', actualMode: 'manual', passed: true, heldBy: '직원' }, environment: { layout: 'swing-door', hazardObserved: true, spaceCleared: true, responsibleActors: ['직원'], action: '직원이 옆문을 열고 대기선을 비웠다' }, requests: [request('옆문 이용 안내와 개방 요청')], detourMeters: s.context.entrance.sideReached ? 0 : 30, addMinutes: 7, facts: ['기다린 뒤 직원이 연 옆 일반문으로 들어갔다', '회전문은 이용하지 않았다'] }, ['옆문을 이용하고 싶다고 알린 뒤 기다린다. 직원이 와서 문을 열고 안쪽 대기선을 비워 준다.', '문이 열리고 통로도 넓어진 것을 보고 들어간다. 기다리는 동안 버티던 [[support:leg-spaced]]는 조금 뻐근하다. 회전문으로는 들어가지 않았다.'], '옆문 안내 요청 · 7분 대기 후 일반문으로 입장', { durationMinutes: 12, effect: 'walk', energy: -1, motion: { ...mm('walk', 'hall', '직원이 옆문과 통로를 확보한 뒤 들어간다.'), encounter: doorEncounter('manual', 'passed') } })
        ];
      } else for (const ch of node.choices) if (!ch.effects.returned) ch.motion = { ...ch.motion, encounter: doorEncounter(door, 'passed') };
    }
    if (node.sceneId === 'S05') {
      node.encounter = doorEncounter(door);
      const description = door === 'automatic' ? '자동문이 열리자 뒤의 사람도 앞으로 움직인다. 문을 밀 필요는 없어도 턱 앞에서 발과 목발을 둘 곳을 확인할 시간이 필요하다.' : door === 'revolving' ? '입구의 회전문이 계속 돌아간다. 목발과 발을 같은 칸 안에서 옮기고 곡선을 따라 나갈 자신이 없다. 한 번 들어가면 내 속도로 멈출 수 있을지 걱정돼 문 밖에 선다.' : '문은 무겁고 손을 놓으면 다시 닫힌다. 양손은 목발에 있어 문짝을 밀면서 몸을 앞으로 옮기기 어렵다. 문턱도 한 번에 넘을 수 있을지 먼저 봐야 한다.';
      node.lines = [...node.lines, description];
      node.choices = node.choices.map(ch => {
        if (ch.effects.returned) return ch;
        if (door !== 'revolving') return { ...ch, motion: { ...ch.motion, encounter: doorEncounter(door, 'passed') } };
        return { ...ch, durationMinutes: (ch.id === 'S05-staff' ? 12 : 20), effects: { ...ch.effects, entrance: { ...ch.effects.entrance, actualMode: 'manual', heldBy: '직원' }, requests: [...(ch.effects.requests || []), request('회전문이 아닌 출입구 확인과 문 잡기 요청')], facts: [...ch.effects.facts, '회전문을 통과하지 않고 확인된 일반 출입구를 이용했다'] }, followUpText: [ch.followUpText[0], '회전문이 아닌 출입구라는 것을 확인하고, 문을 잠깐 잡아 달라고 부탁한다. 직원이 잡아 준 일반문을 지나 들어간다.'], motion: { ...ch.motion, encounter: doorEncounter('manual', 'passed') } };
      });
    }
    if (node.sceneId === 'S06' && kiosk) {
      node.title = '키오스크 앞에서 한 손이 모자란다';
      node.encounter = { kind: 'kiosk' };
      node.lines = ['메뉴판 대신 키오스크가 먼저 보인다. 주문 시작 버튼은 손이 닿지만, 위쪽 확인 버튼은 멀고 카드 단말기는 화면 아래 옆쪽에 떨어져 있다.', '버튼을 누르려고 한 손을 떼려다 반대쪽 어깨가 뻐근해진다. 화면에서 단말기 쪽으로 팔을 옮길 때도 목발을 쥔 손에 힘이 더 들어간다.', '뒤에서 기다리는 사람의 발소리가 들린다. 아직 메뉴도 다 못 봤는데 빨리 눌러야 할 것 같다. 직원을 불러 볼까.'];
      const paid = method => ({ items: { cardLocation: 'wallet' }, order: { mode: 'kiosk', status: 'paid', method, menuConfirmed: true } });
      const stance = { ...mm('stand', 'hall', '키오스크 앞에서 주문 내용을 확인한다.'), encounter: { kind: 'kiosk' } };
      node.choices = [
        act('S06-kiosk-staff', '메뉴를 말하고 화면 조작을 부탁한다', '내가 고른 메뉴와 금액은 직접 확인', { ...paid('staff-on-kiosk'), requests: [request('목발 때문에 키오스크 화면 조작 도움 요청')], facts: ['고른 메뉴를 말하고 직원에게 화면 조작을 부탁했다', '메뉴와 금액을 확인하고 결제했다'] }, ['직원에게 고른 메뉴를 말하고 화면 조작을 부탁한다. 직원이 누르기 전에 크기와 추가 옵션을 하나씩 확인해 준다.', '메뉴와 금액을 확인하고 결제를 마친다. 카드를 지갑에 넣고 나니 이제 음식을 어떻게 받을지가 걱정이다. 양손은 여전히 목발을 쥐고 있다.'], '키오스크 조작 요청 · 메뉴 확인·결제 완료', { durationMinutes: 9, effect: 'standing', focus: 'shared', motion: stance }),
        act('S06-kiosk-counter', '카운터에서 주문할 수 있는지 묻는다', '가능하다는 답을 듣고 주문 방법 바꾸기', { ...paid('counter'), requests: [request('카운터 주문 가능 여부 문의')], addMinutes: 4, facts: ['직원에게 확인한 뒤 카운터에서 주문하고 결제했다'] }, ['카운터에서 주문할 수 있는지 묻는다. 직원이 가능하다고 해 메뉴를 말하고 주문 내용을 확인한다.', '직원이 결제 단말기를 손 닿는 쪽으로 놓아 준다. 계산을 마치고 카드를 지갑에 넣는다. 잠깐 더 기다렸지만 높은 화면을 계속 누르지는 않아도 됐다.'], '카운터 주문 확인 · 결제 완료', { durationMinutes: 12, effect: 'standing', focus: 'outing', motion: { ...stance, caption: '이용 가능한 카운터 주문과 결제를 확인한다.' } }),
        act('S06-kiosk-partial', '누르기 어려운 버튼만 부탁한다', '가능한 선택은 직접, 높은 확인 버튼은 도움받기', { ...paid('partial-help'), requests: [request('높은 확인 버튼과 결제 단말기 위치 도움 요청')], facts: ['직접 고른 메뉴를 확인한 뒤 높은 버튼 조작만 부탁했다', '결제를 마치고 카드를 지갑에 넣었다'] }, ['손이 닿는 메뉴를 골랐지만 위쪽 확인 버튼은 멀다. 더 뻗으려다 허리가 기울고 어깨가 당겨 팔을 거둔다.', '확인 버튼과 결제 단말기만 도와 달라고 부탁한다. 직원이 선택한 메뉴를 읽어 준 뒤 결제를 돕는다. 카드를 지갑에 넣고 손을 다시 쉬게 한다.'], '메뉴 직접 선택 · 높은 조작부 도움 요청·결제 완료', { durationMinutes: 10, effect: 'reach', energy: -1, focus: 'create', motion: stance })
      ];
      if (s.initialConditions.phonePayment) node.choices.push(act('S06-kiosk-phone', '메뉴를 말하고 휴대전화로 결제한다', '준비된 결제 수단과 직원의 주문 도움 이용', { ...paid('phone-payment'), requests: [request('메뉴 입력과 휴대전화 결제 위치 안내 요청')], facts: ['직원에게 메뉴 입력을 부탁하고 준비된 휴대전화로 결제했다', '카드는 지갑에서 꺼내지 않았다'] }, ['직원에게 메뉴 입력을 부탁한 뒤 준비해 둔 휴대전화 결제를 이용한다. 단말기를 손이 닿는 쪽에 놓아 달라고 말한다.', '결제 완료 표시를 확인하고 휴대전화를 넣는다. 카드는 지갑에 그대로 있다. 음식은 자리를 정한 뒤 어떻게 받을지 따로 생각해야 한다.'], '직원 주문 입력 · 준비된 휴대전화 결제', { durationMinutes: 8, effect: 'standing', focus: 'shared', motion: stance }));
    } else if (node.sceneId === 'S06' && hasOwn(s.initialConditions, 'orderMode')) {
      node.choices = node.choices.map(ch => ({ ...ch, effects: { ...ch.effects, order: { mode: 'counter', status: 'paid', method: 'counter', menuConfirmed: true } } }));
    }
    if (node.sceneId === 'S09' && s.context.order?.status === 'paid') {
      node.choices = node.choices.map(ch => {
        if (ch.id === 'S09-wait') return { ...ch, followUpText: ['이미 주문은 마쳤다. 낮은 자리가 날 때까지 잠깐 기다린다. 몇 분 뒤 다른 손님이 식사를 마치고 자리를 떠난다.', ch.followUpText[1]] };
        if (ch.id === 'S09-ask') return { ...ch, followUpText: [ch.followUpText[0], '바깥 풍경은 잘 안 보이지만 편하게 앉을 수 있다. 이미 주문한 음식을 어디에서 받을지 확인한다.'] };
        return ch;
      });
    }
    if (node.sceneId === 'S10' && kiosk && s.context.order?.status !== 'paid') {
      node.lines = ['앉을 자리는 찾았다. 아까 먹고 싶은 메뉴만 골라 뒀고 주문은 아직이다. 직원에게 앉은 자리에서 주문할 수 있는지 물으니 가능하다고 한다.', ...node.lines];
      const titles = { 'S10-all': '메뉴와 물·식기를 한 번에 부탁한다', 'S10-separate': '메뉴를 주문하고 필요한 것은 따로 부탁한다', 'S10-defer': '간단한 메뉴를 주문하고 추가 부탁은 미룬다' };
      const minutes = { 'S10-all': 14, 'S10-separate': 18, 'S10-defer': 11 };
      node.choices = node.choices.map(ch => ({ ...ch, title: titles[ch.id], durationMinutes: minutes[ch.id], effects: { ...ch.effects, order: { mode: 'kiosk', status: 'paid', method: 'staff-from-seat', menuConfirmed: true }, requests: ch.id === 'S10-all' ? [request('앉은 자리에서 메뉴 주문과 물·식기를 함께 요청')] : [request('앉은 자리에서 메뉴 주문'), ...(ch.effects.requests || [])], facts: ['직원에게 앉은 자리에서 메뉴를 말하고 주문과 결제를 마쳤다', ...ch.effects.facts] }, followUpText: [`메뉴와 금액을 확인하고 앉은 자리에서 주문과 결제를 마친다. ${ch.followUpText[0]}`, ch.followUpText[1]], journalTrace: `메뉴 주문·결제 / ${ch.journalTrace}` }));
    }
    if (node.sceneId === 'S12' && s.initialConditions.verticalRoute === 'escalator') {
      node.title = '움직이는 발판 앞에서';
      node.encounter = { kind: 'escalator' };
      node.lines = ['가까운 길은 에스컬레이터다. 발판이 평평한 바닥에서 갈라져 올라간다. 사람들은 망설임 없이 발을 올리지만, 나는 목발과 발을 옮길 순서를 생각하는 사이 타이밍을 놓친다.', '양손으로 목발을 짚은 채 움직이는 손잡이까지 잡을 수는 없다. 올라탄 뒤 흔들리면 몸을 어떻게 받칠지도 걱정된다. 뒤에 사람이 다가오자 어깨에 힘이 더 들어간다.', '발판에 올라타지 않고 옆의 고정된 바닥으로 비켜선다. 엘리베이터 표시를 찾거나 직원에게 다른 길을 확인할 수 있다.'];
      node.choices = [
        act('S12-escalator-elevator', '에스컬레이터 대신 엘리베이터로 간다', '움직이는 발판에 타지 않고 안내 표지 따라가기', { location: 'elevator-lobby', vertical: { kind: 'escalator', encountered: true, used: false, alternative: 'elevator' }, plan: { returnConsidered: true }, detourMeters: 180, addMinutes: 8, facts: ['에스컬레이터에 타지 않고 180m 돌아 엘리베이터 앞으로 갔다'] }, ['발판에 발이나 목발을 올리지 않고 엘리베이터 표지 쪽으로 간다. 목적지와 반대 방향으로 돌아가는 것 같아 지도를 한 번 더 본다.', '엘리베이터 앞에 도착하니 손바닥과 [[support:thigh]]가 묵직하다. 아직 탑승하지 않았다. 돌아올 때 쓸 길도 확인한다.'], '에스컬레이터는 타지 않음 · 엘리베이터까지 180m 우회', { durationMinutes: 14, effect: 'walk', energy: -2, focus: 'outing', motion: mm('walk', 'hall', '에스컬레이터를 이용하지 않고 엘리베이터 앞으로 간다.') }),
        act('S12-escalator-confirm', '직원에게 에스컬레이터 없이 가는 길을 묻는다', '안내받은 연결 통로를 확인하고 이동', { location: 'elevator-lobby', vertical: { kind: 'escalator', encountered: true, used: false, alternative: 'verified-passage' }, access: { threshold: 'confirmed-fiction-connecting-passage' }, requests: [request('에스컬레이터 없이 이동할 연결 통로 확인')], detourMeters: 120, addMinutes: 10, facts: ['직원에게 확인한 고정된 연결 통로로 엘리베이터 앞에 왔다', '에스컬레이터에는 타지 않았다'] }, ['목발을 짚고 있어 에스컬레이터 대신 갈 길을 찾는다고 말한다. 직원이 연결 통로가 열려 있는지 확인한 뒤 알려 준다.', '안내받은 연결 통로를 지나 엘리베이터 앞에 선다. 길을 묻고 확인하는 데 시간이 들었지만 움직이는 발판에 맞춰 서두르지는 않았다.'], '에스컬레이터는 타지 않음 · 직원 확인 후 연결 통로 120m', { durationMinutes: 17, effect: 'walk', energy: -1, focus: 'shared', motion: mm('walk', 'hall', '직원이 확인한 고정된 통로로 엘리베이터 앞에 간다.') }),
        act('S12-escalator-home', '다른 층에 가지 않고 집으로 돌아간다', '에스컬레이터를 이용하지 않고 귀가', { location: 'home', outing: false, returned: true, returnReason: '에스컬레이터와 다른 층 이동을 포기하고 귀가', vertical: { kind: 'escalator', encountered: true, used: false, alternative: 'home' }, plan: { returnConsidered: true }, facts: ['에스컬레이터에 타지 않고 집으로 돌아왔다'] }, ['다른 층에 가는 계획을 바꾼다. 에스컬레이터를 타지 않고 집으로 돌아갈 길을 확인한다.', '집에 와서 앉는다. 가 보고 싶었던 곳은 못 갔다. 손잡이를 놓고 손을 펴 보니 조금 전까지 얼마나 힘을 주고 있었는지 알겠다.'], '에스컬레이터는 타지 않음 · 다른 층에 가지 않고 귀가', { durationMinutes: 12, effect: 'walk', energy: -1, focus: 'rest', motion: mm('walk', 'room', '에스컬레이터를 이용하지 않고 집으로 돌아온다.', 'sit') })
      ];
    }
    return node;
  }

  function eligible(def, context) {
    const needs = def.eligibility;
    if (needs.location && !needs.location.includes(context.location)) return `위치 조건 불일치: ${context.location}`;
    if (needs.outing && !context.outing) return '실제 외출 이력이 현재 동선에 없음';
    if (needs.companion && needs.companion !== context.companion) return '함께 걷는 친구가 없음';
    if (needs.helpRequested && !context.help.requested) return '컵 도움을 요청하지 않음';
    if (needs.seated && context.seat.mode !== 'seated') return '가게의 이용 가능한 자리에 앉지 않음';
    return null;
  }
  const coreIndex = s => Number.isInteger(s.coreStep) ? s.coreStep : s.decisions.length;
  function homeNode(s, fallbackFor, reason) {
    const id = `HOME-${coreIndex(s) + 1}`;
    const prefix = s.context.returned ? `집으로 돌아와 앉았다.` : '지금 있는 자리에서 할 만한 일을 골라 본다.';
    const node = {
      sceneId: id, title: '지금 있는 자리에서', time: times[coreIndex(s)], step: coreIndex(s) + 1,
      eligibility: { eligible: true, requestedSceneId: fallbackFor || 'HOME', matched: !fallbackFor, reason: reason || '집에서 이어지는 장면' },
      lines: [prefix, s.context.items.drinkPlace ? `${s.context.items.drinkPlace === 'window' ? '창가' : '식탁'}에서 한 잔 마셨다. 이제 앉은 자리에서 할 일을 생각한다.` : '앉을 자리를 고른다. 남은 시간에 하고 싶은 일을 하나 골라 본다.'],
      choices: [
        act(`${id}-listen`, '좋아하는 음악 한 곡을 듣는다', '기록하지 않고 그대로 듣기', { facts: ['집에서 음악 한 곡을 들었다'] }, ['좋아하는 곡을 틀고 끝까지 듣는다. 익숙한 전주를 들으니 다음 가사가 생각난다.', '굳이 감상을 적지는 않는다. 편히 앉아 노래를 끝까지 듣는다.'], '집 · 음악 한 곡', { energy: 1, effect: 'rest', focus: 'rest' }),
        act(`${id}-write`, '오늘 있었던 일을 짧게 쓴다', '기억나는 일 하나부터 적기', { facts: ['오늘 있었던 일로 짧은 글을 썼다'] }, ['오늘 있었던 일 하나를 골라 짧게 쓴다. 직접 보고 겪은 만큼만 적는다.', '몇 줄을 쓰고 저장한다. 뒤에 무슨 내용을 더 쓸지는 나중에 생각해 보기로 한다.'], '집 · 오늘 있었던 일로 쓴 글', { energy: -1, effect: 'desk', focus: 'create', motion: mm('desk', 'room', '오늘 있었던 일을 짧게 쓴다.') }),
        act(`${id}-window`, '앉은 자리에서 빛을 본다', '앉은 채로 창밖 보기', { facts: ['집에서 빛이 바뀌는 모습을 보았다'] }, ['앉은 자리에서 빛이 움직이는 것을 본다. 일부러 다른 곳으로 옮겨 갈 필요는 없다.', '창틀의 그림자가 달라졌다. 아쉬운 마음은 남아 있지만, 달라진 풍경이 눈에 들어온다.'], '집 · 바뀐 빛의 방향', { effect: 'observe', focus: 'observe', motion: mm('observe', 'room', '앉은 자리에서 달라진 빛을 본다.') })
      ], contrastVariant: null
    };
    if (coreIndex(s) === 2) {
      node.title = '내가 하고 싶은 작은 일';
      node.lines = [prefix, '쉬고 나니 앉은 자리에서 뭔가 해보고 싶다. 친구에게 연락하거나 사진을 찍어 볼까. 듣고 싶은 노래를 고르는 것도 괜찮겠다.'];
      node.choices = [
        act(`${id}-message`, '친구에게 별일 없는 안부를 보낸다', '답장은 나중에 확인하기', { conversations: ['집에서 친구에게 별일 없는 안부를 보냈다. 답장은 아직 모른다.'], facts: ['친구에게 안부를 보낸 뒤 휴대전화를 내려놓았다'] }, ['“점심 뭐 먹어?” 안부를 보낸다. 답장은 아직 오지 않았다.', '휴대전화를 내려놓고 내 점심도 생각한다. 답장은 나중에 확인하기로 한다.'], '집 · 짧은 안부를 보냄 / 답장은 아직 오지 않음', { effect: 'phone', focus: 'shared', motion: mm('phone', 'room', '짧은 안부를 보내고 휴대전화를 내려놓는다.') }),
        act(`${id}-photo`, '지금 있는 자리의 사진을 한 장 남긴다', '컵이 있던 곳과 없는 곳도 그대로', { items: { phoneLocation: s.context.items.drinkPlace === 'window' ? 'window' : 'table' }, facts: [`${s.context.items.drinkPlace === 'window' ? '창가' : '앉은 자리'}의 모습을 사진으로 남겼다`] }, [`휴대전화로 ${s.context.items.drinkPlace === 'window' ? '창가에 놓인 물건을' : '지금 앉아 있는 자리를'} 한 장 찍는다. 컵은 옮기지 않고 지금 보이는 그대로 담는다.`, '찍은 사진을 확인한다. 빛이 드는 방향과 물건을 둔 자리가 잘 보인다. 확인한 뒤 휴대전화를 내려놓는다.'], '집 · 지금 앉은 자리에서 찍은 사진 한 장', { effect: 'observe', motion: mm('observe', 'room', '지금 앉은 자리의 모습을 사진으로 찍는다.') }),
        act(`${id}-playlist`, '짧은 재생 목록을 만든다', '이미 들은 곡에서 다음 곡으로', { facts: ['다음에 들을 세 곡의 짧은 재생 목록을 만들었다'] }, [s.history.some(h => /-listen$/.test(h.choiceId)) ? '방금 들은 곡에서 이어질 노래를 고른다. 같은 곡을 다시 틀기보다 다음 세 곡의 순서를 만들어 본다.' : '듣고 싶은 곡 세 개만 골라 순서를 정한다. 전부 들을 계획까지 세우지는 않는다.', '재생 목록에 “오늘 세 곡”이라는 이름을 붙인다. 다음에 음악을 들을 때 틀어 보기로 한다.'], '집 · 다음 세 곡의 재생 목록', { focus: 'create', motion: mm('desk', 'room', '다음에 들을 세 곡의 순서를 정한다.') })
      ];
    } else if (coreIndex(s) === 3) {
      node.title = '남은 시간을 어떻게 보낼까';
      node.lines = [prefix, '이제 어디서 편하게 시간을 보낼지 생각해 본다. 방 안을 둘러보며 필요한 물건을 찾는다.'];
      node.choices = [
        act(`${id}-arrange`, '이따 쓸 물건의 자리를 정한다', '필요한 것과 나중에 둘 것 나누기', { facts: ['이따 쓸 물건의 자리를 정했다'] }, ['이따 쓸 물건을 골라 어디에 둘지 정한다. 아직 옮기지는 않았다.', '물건은 그대로지만 어디에 두면 편할지 감이 잡힌다. 내 손이 닿기 편한 자리를 골라 둔다.'], '집 · 이따 쓸 물건 자리 계획', { focus: 'create' }),
        act(`${id}-read-traces`, '오늘 적어 둔 메모를 읽는다', '아까 무엇을 했는지 다시 보기', { facts: ['오늘 적어 둔 메모를 다시 읽었다'] }, [`“${s.traces[s.traces.length - 1] || '아직 적은 메모 없음'}”이라고 적힌 메모를 읽는다. 아까 무엇을 했는지 떠올린다.`, '편했던 일과 번거로웠던 일을 천천히 읽어 본다. 다시 생각하니 아쉬운 일도 있고, 웃음이 나는 일도 있다.'], '집 · 오늘의 메모 다시 읽기', { focus: 'observe' }),
        act(`${id}-quiet`, '휴대전화를 내려놓고 잠시 쉰다', '더 할 일을 찾지 않고 쉬기', { facts: ['새 일을 더 고르지 않고 잠시 쉬었다'] }, ['할 일을 더 찾지 않고 휴대전화를 내려놓는다. 잠깐 심심해도 그냥 쉬어 본다.', '무엇을 더 할까 생각하다가 그만둔다. 조금 심심하지만 지금은 쉬고 싶다.'], '집 · 잠시 휴식', { energy: 1, effect: 'rest', focus: 'rest', motion: mm('rest', 'room', '휴대전화를 내려놓고 잠시 쉰다.') })
      ];
    }
    return node;
  }
  function reflectionNode(s) {
    const pending = s.context.needs.water === 'pending' || s.context.needs.utensils === 'pending';
    const stillCafe = s.context.location === 'cafe';
    const lines = [
      '하던 일을 잠깐 멈추고 오늘 있었던 일을 돌아본다.',
      s.traces.length ? `오늘 기록에 “${s.traces[s.traces.length - 1]}”이라고 적혀 있다.` : '아직 적어 둔 내용은 없다.',
      pending ? '물과 식기는 아직 받지 못했다. 지금 다시 부탁할지, 더 부탁하지 않고 식사를 마칠지 생각한다.' : s.context.returned ? '집에 돌아온 뒤에 한 일도 하나씩 떠올린다.' : s.context.outing ? '이제 집으로 돌아갈 시간이다. 미리 확인한 길을 다시 살핀다.' : '집에서 무엇을 했는지 생각해 본다.'
    ];
    if (s.context.plan.returnMeters > 0) {
      const metres = s.context.plan.returnMeters + s.context.plan.detourMeters;
      if (s.context.outing) lines.push(`집으로 돌아갈 거리는 ${metres}m다. 오늘의 속도로는 ${Math.max(8, Math.ceil(metres / 25))}분 정도 걸릴 것 같다.`);
      else if (s.context.returned) lines.push([...s.context.facts].reverse().find(fact => fact.includes('집으로 돌아가는 거리는')) || `집에 돌아올 때 확인한 길은 ${metres}m였다.`);
    }
    if (s.history.some(entry => entry.sceneId === 'S11')) lines.push(s.context.social.together ? '친구와 나란히 걷거나 멈춰 서서 이야기를 나눴다. 그때 끝까지 들었던 말이 떠오른다.' : '친구와 같은 곳으로 걸었지만, 앞에서 나누던 이야기는 일부 놓쳤다. 무슨 얘기였는지 아직 궁금하다.');
    const choices = pending && stillCafe ? [
      act('REFLECT-request', '미뤘던 물과 식기를 지금 부탁한다', '물을 마시고 기록 마치기', { needs: { water: 'received', utensils: 'received' }, requests: [request('미뤘던 물과 식기를 다시 요청')], facts: ['미뤘던 물과 식기를 마지막에 요청해 실제로 받았다'] }, ['미뤘던 물과 식기를 다시 부탁한다. 잠시 뒤 테이블에 물과 식기가 놓인다.', '물을 한 모금 마시고 오늘의 기록을 마무리한다. 부탁을 미뤘던 시간도 함께 떠오른다.'], '다시 부탁해 물과 식기를 받음', { focus: 'shared' }),
      act('REFLECT-change-order', '물을 부탁하고 남은 음식은 포장하려 한다', '남은 음식을 집에서 먹으려는 생각', { needs: { water: 'received', utensils: 'not-needed' }, items: { container: 'takeout-cup', cupLocation: 'store-counter', drinkPlace: null }, requests: [request('물과 남은 음식 포장 요청')], facts: ['물은 받아 마셨지만 양손으로 목발을 짚어 포장 음식을 가져갈 수 없었다', '남은 음식은 가게에 두고 빈손으로 돌아왔다'] }, ['물을 부탁해 마시고 남은 음식을 포장한다. 자리에서 일어나 목발을 잡고 나니 봉투를 들 손이 없다. 양손으로 목발을 짚어야 해서 포장한 음식을 집에 가져갈 수 없다.', '직원에게 가져갈 수 없다고 말하고 포장은 가게에 둔다. 남은 음식이 아깝지만 빈손으로 집에 돌아온다.'], '물 수령 / 포장 음식 운반 불가 / 음식은 가게에 두고 빈손으로 귀가', { focus: 'create' }),
      act('REFLECT-unresolved', '더 부탁하지 않고 식사를 마친다', '물과 식기는 받지 못한 채로 두기', { facts: ['물을 받지 않은 미해결 요청을 그대로 기록했다'] }, ['더 부탁하지 않고 식사를 마친다. 물과 식기는 받지 못했다. 말을 꺼내려다 망설였던 일이 생각난다.', '물을 받지 못했다고 메모한다. 부탁하지 않아 편했던 것만은 아니다. 다음에는 어떻게 말할지 잠깐 생각한다.'], '물과 식기는 끝내 받지 못함 / 망설였던 일을 메모')
    ] : [
      act('REFLECT-note', '오늘 기억나는 일을 한 줄 적는다', '했던 일과 못 했던 일 함께', { facts: ['오늘 있었던 일을 한 줄로 적었다'] }, ['오늘 했던 일과 하려다 그만둔 일을 적는다. 길게 설명하지 않고 기억나는 것만 쓴다.', '메모를 저장한다. 나중에 읽으면 오늘 무엇을 했는지 기억날 것 같다.'], '했던 일과 하지 않은 일을 함께 적음'),
      act('REFLECT-next', '다음에 하고 싶은 일을 적는다', '생각나는 일 하나만 메모하기', { facts: ['다음에 하고 싶은 일을 하나 적었다'] }, ['다음에 해 보고 싶은 일을 하나 적는다. 언제 할지는 아직 정하지 않는다.', '오늘 적은 내용 아래에 메모를 덧붙인다. 나중에 하고 싶은 일이 생각나면 다시 읽어 봐야겠다.'], '다음에 하고 싶은 일 메모', { focus: 'create' }),
      act('REFLECT-close', '이제부턴 휴식을 취한다', '편하게 앉아 몸을 쉬게 하기', { facts: ['편하게 앉아 휴식을 취했다'] }, ['휴대전화를 내려놓고 편하게 앉는다. 이제는 좀 쉬고 싶다.', '다리와 팔이 뻐근하다. 자리를 편하게 잡고 잠시 쉰다.'], '편하게 앉아 휴식', { effect: 'rest', focus: 'rest' })
    ];
    if (s.context.outing) {
      const metres = (s.context.plan.returnMeters || 300) + s.context.plan.detourMeters;
      const travelMinutes = Math.max(8, Math.ceil(metres / 25));
      const returnText = `집으로 돌아가는 거리는 ${s.context.plan.returnMeters || 300}m다. 오늘 길을 돌아가느라 ${s.context.plan.detourMeters}m를 더 이동했고, 준비하고 기다리는 데 ${s.context.plan.timeMinutes}분이 걸렸다. ${s.context.plan.detourMeters ? '돌아올 때도 확인한 우회로를 이용했다. ' : ''}집에 돌아오는 데는 ${travelMinutes}분이 걸렸다.`;
      for (const ch of choices) {
        ch.travelMinutes = travelMinutes;
        ch.effects = { ...ch.effects, location: 'home', outing: false, returned: true, returnReason: '일을 마친 뒤 확인한 길로 귀가', facts: [...(ch.effects.facts || []), returnText] };
        ch.followUpText = [ch.followUpText[0], `${ch.followUpText[1]} ${returnText}`];
        ch.journalTrace += s.context.plan.returnMeters > 0 ? ` / 귀가 기본 ${s.context.plan.returnMeters}m·우회 ${s.context.plan.detourMeters}m` : ' / 확인한 동선으로 귀가';
        ch.energy = -1;
        ch.effect = 'walk';
        ch.motion = mm('walk', 'room', '일을 마치고 집으로 돌아와 앉는다.', 'sit');
      }
    }
    return { sceneId: 'REFLECT', title: pending ? '물과 식기를 아직 못 받았다' : '오늘 한 일을 돌아보며', time: times[4], step: 5, eligibility: { eligible: true, requestedSceneId: 'REFLECT', matched: true }, lines, choices, contrastVariant: null };
  }
  const times = ['10:12 · 토요일 오전', '11:18 · 토요일 오전', '13:16 · 점심 무렵', '16:24 · 토요일 오후', '20:16 · 토요일 저녁'];
  function getNode(s) {
    if (coreIndex(s) >= 5 || s.scene === 'end') return null;
    const pack = SCENARIOS.find(p => p.id === s.scenarioId);
    if (!pack || pack.id === 'classic') return null;
    const requested = pack.scenes[coreIndex(s)];
    let node;
    if (requested === 'REFLECT') node = reflectionNode(s);
    else if (requested === 'HOME') node = homeNode(s);
    else {
      const def = definitions[requested];
      const reason = eligible(def, s.context);
      if (reason) node = homeNode(s, requested, reason);
      else node = { sceneId: requested, title: def.title, time: times[coreIndex(s)], step: coreIndex(s) + 1, eligibility: { eligible: true, requestedSceneId: requested, matched: true, requires: clone(def.eligibility) }, lines: def.lines(s), choices: def.choices(s), contrastVariant: typeof def.contrastVariant === 'function' ? def.contrastVariant(s) : def.contrastVariant };
    }
    node = decorateNode(node, s);
    node.choiceIds = node.choices.map(ch => ch.id);
    node.choices = node.choices.map(ch => ({ ...ch, followUpText: [...ch.followUpText], journalTrace: ch.journalTrace, contrastVariant: node.contrastVariant }));
    return node;
  }
  function prepare(s) {
    const node = getNode(s);
    if (!node) { s.scene = 'end'; return s; }
    s.scene = node.sceneId;
    if (node.sceneId === 'S06' && s.initialConditions.orderMode !== 'kiosk') s.context.items.cardLocation = 'floor';
    if (node.sceneId === 'S09') s.context.seat.visibleEmpty = 'high-only';
    if (node.sceneId === 'S10') { s.context.needs.water = 'pending'; s.context.needs.utensils = 'pending'; }
    if (!node.eligibility.matched) s.context.skipped.push({ sceneId: node.eligibility.requestedSceneId, reason: node.eligibility.reason });
    return s;
  }
  function applyEffects(context, effects) {
    const c = clone(context);
    for (const key of ['location', 'outing', 'returned', 'returnReason', 'accessSource', 'companion']) if (hasOwn(effects, key)) c[key] = effects[key];
    for (const key of ['entrance', 'environment', 'seat', 'items', 'needs', 'help', 'plan', 'access', 'day', 'order', 'vertical']) if (effects[key]) c[key] = { ...c[key], ...clone(effects[key]) };
    if (effects.socialPatch) c.social = { ...c.social, ...effects.socialPatch };
    for (const key of ['requests', 'unspoken', 'conversations']) if (effects[key]) c.social[key].push(...clone(effects[key]));
    if (effects.facts) c.facts.push(...effects.facts);
    if (effects.addMinutes) c.plan.timeMinutes += effects.addMinutes;
    if (effects.detourMeters) c.plan.detourMeters += effects.detourMeters;
    return c;
  }
  return { SCENARIOS, SCENARIO_VERSION, normalizeStart, freshContext, getNode, prepare, applyEffects, definitions };
});
