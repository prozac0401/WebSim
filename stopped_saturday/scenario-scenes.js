(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaturdayScenes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCENARIO_VERSION = '3';
  const SCENARIOS = [
    { id: 'classic', title: '처음의 토요일', description: '네 갈래로 시작하는 원래의 하루. 2층 계단과 점심의 동선도 함께.', scenes: [], conditions: [] },
    { id: 'home', title: '창가에서 커피 한 잔', description: '창가에서 커피를 마시고, 도움과 식사·쉬는 시간을 정하는 하루.', scenes: ['S01', 'S07', 'HOME', 'S13', 'REFLECT'], conditions: ['helpStyle'] },
    { id: 'doors', title: '문 너머의 자리', description: '문 앞에서 도움을 청하고, 앉을 자리와 물 한 잔을 찾는다.', scenes: ['S02', 'S03', 'S09', 'S10', 'REFLECT'], conditions: ['doorMode'] },
    { id: 'cafe', title: '도착한 뒤의 일들', description: '지도의 도착 알림 이후. 문턱, 결제, 자리와 물 한 잔.', scenes: ['S05', 'S06', 'S09', 'S10', 'REFLECT'], conditions: ['phonePayment'] },
    { id: 'company', title: '같이 걷는 하루', description: '친구들과 걸으며 대화하고, 돌아올 길도 정하는 하루.', scenes: ['S08', 'S11', 'S12', 'S04', 'REFLECT'], conditions: [] },
    { id: 'planning', title: '메뉴보다 먼저', description: '외출 전에 화장실과 쉬어 갈 곳을 찾아보고, 갈 곳을 고른다.', scenes: ['S13', 'S08', 'S12', 'S04', 'REFLECT'], conditions: [] }
  ];
  const ALLOWED = { doorMode: ['manual', 'automatic'], helpStyle: ['takeover', 'ask'], phonePayment: [false, true] };
  const DEFAULTS = { doorMode: 'manual', helpStyle: 'takeover', phonePayment: false };
  const clone = value => JSON.parse(JSON.stringify(value));
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function normalizeStart(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('시작 조건은 객체여야 합니다.');
    for (const key of Object.keys(input)) if (!['scenarioId', 'conditions'].includes(key)) throw new Error(`허용하지 않는 시작 항목: ${key}`);
    const scenarioId = input.scenarioId === undefined ? 'classic' : input.scenarioId;
    if (!SCENARIOS.some(s => s.id === scenarioId)) throw new Error('알 수 없는 시나리오입니다.');
    const supplied = input.conditions === undefined ? {} : input.conditions;
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('허구의 장면 조건을 확인해 주세요.');
    const conditions = { ...DEFAULTS };
    for (const key of Object.keys(supplied)) {
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
      environment: { layout: start.conditions.doorMode === 'automatic' ? 'sliding-door' : 'swing-door', hazardObserved: false, spaceCleared: false, responsibleActors: [], action: '아직 확인하지 않음' },
      seat: { visibleEmpty: 'unknown', usable: null, mode: 'none', waitedMinutes: 0 },
      items: { container: 'favorite-cup', cupLocation: 'kitchen', phoneLocation: 'kitchen', carryTrips: 0, drinkPlace: null, cardLocation: 'wallet' },
      needs: { water: 'not-requested', utensils: 'not-requested' },
      help: { requested: false, scope: 'none', offeredStyle: start.conditions.helpStyle, delegated: [], ownTasks: [] },
      social: { requests: [], unspoken: [], conversations: [], missedWords: false, together: false },
      plan: { destination: '아직 고르지 않은 장소', outboundMeters: 0, returnMeters: 0, detourMeters: 0, timeMinutes: 0, returnConsidered: false },
      access: { toilet: 'unknown', threshold: 'unknown', distance: 'unknown', rest: 'unknown' }, accessSource: null,
      facts: [], actions: [], skipped: [], day: { seated: !outside, ate: false }
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
    '커피는 준비됐다. 좋아하는 컵에 담아 햇빛 드는 창가에서 마시고 싶다.',
    '컵을 들려면 휴대전화부터 내려놓아야 한다. 양손으로 목발도 짚어야 한다. 몇 걸음 안 되지만, 물건을 어디에 둘지부터 정해야 한다.'
  ], () => [
    act('S01-bottle', '뚜껑 있는 물병을 고른다', '좋아하는 컵은 부엌에 두기', { items: { container: 'bottle', cupLocation: 'kitchen', phoneLocation: 'window', carryTrips: 1, drinkPlace: 'window' }, facts: ['물병으로 창가에서 마셨다', '좋아하는 컵은 부엌에 남았다'] }, ['좋아하는 컵을 내려놓고 뚜껑 있는 물병을 고른다. 옮길 물건이 정리된 뒤 창가에 앉는다.', '창가에 앉아 물병으로 한 모금 마신다. 팔에 햇빛이 닿는다. 늘 쓰던 컵은 부엌에 두고 왔다.'], '창가 · 물병 / 컵은 부엌 / 전화는 창가 / 이동 1번', { energy: -1, motion: mm('walk', 'room', '물병을 고른 뒤 창가에 앉는다.', 'observe') }),
    act('S01-split', '물건을 나누어 옮긴다', '안정된 곳에 두고 여러 번 준비하기', { items: { container: 'favorite-cup', cupLocation: 'window', phoneLocation: 'window', carryTrips: 3, drinkPlace: 'window' }, facts: ['물건을 나누어 준비해 창가에서 마셨다', '창가에 앉을 때 햇빛이 조금 옮겨 갔다'] }, ['한 번에 다 옮기려던 물건을 나눈다. 중간에 놓을 자리를 정리하고 몇 번에 나누어 옮긴다. 서두르지 않고 천천히 옮긴다.', '좋아하는 컵과 휴대전화를 창가에 다 옮겼을 때, 햇빛은 조금 옆으로 옮겨 가 있었다. 시간이 좀 걸렸지만 손에 쥔 컵은 익숙하다.'], '창가 · 좋아하는 컵 / 전화도 창가 / 준비와 이동 3번', { energy: -2, effect: 'transfer', motion: mm('walk', 'room', '나누어 준비한 뒤 창가에서 컵을 든다.', 'observe') }),
    act('S01-table', '오늘은 식탁에서 마신다', '창가 대신 가까운 자리', { items: { container: 'favorite-cup', cupLocation: 'table', phoneLocation: 'kitchen', carryTrips: 0, drinkPlace: 'table' }, facts: ['식탁에서 좋아하는 컵으로 마셨다', '창가 자리에는 가지 않았다'] }, ['창가 대신 식탁에 앉는다. 휴대전화는 부엌에 두고, 우선 커피부터 마시기로 한다.', '여기까지 햇빛이 들지는 않지만, 커피가 따뜻할 때 한 모금 마신다. 컵을 식탁에 내려놓고 잠시 앉아 있는다.'], '식탁 · 좋아하는 컵 / 전화는 부엌 / 추가 이동 없음', { energy: 1, effect: 'rest', focus: 'rest' }),
    act('S01-help', '컵을 창가로 옮겨 달라고 부탁한다', '부탁을 꺼내고 함께 사는 사람 기다리기', { items: { container: 'favorite-cup', cupLocation: 'window', phoneLocation: 'window', carryTrips: 1, drinkPlace: 'window' }, help: { requested: true, scope: 'cup', delegated: ['컵 옮기기'], ownTasks: ['마실 자리 고르기'] }, requests: [request('컵을 창가로 옮겨 달라고 부탁')], addMinutes: 4, facts: ['부탁 뒤 컵을 건네받아 창가에서 마셨다'] }, ['“컵을 창가에 놓아 줄 수 있어?” 부탁하고, 상대가 하던 일을 마칠 때까지 기다린다.', '건네받은 컵을 햇빛 드는 곳에 놓는다. 부탁할 때는 잠깐 망설였지만, 원하던 자리에 앉으니 마음이 놓인다. 휴대전화와 컵이 모두 창가에 있다.'], '창가 · 건네받은 컵 / 전화도 창가 / 기다림 4분', { energy: -1, focus: 'shared', motion: mm('walk', 'room', '컵을 건네받고 창가에 앉는다.', 'observe') })
  ]);
  scene('S02', '문 너머에 빈자리가 보인다', { location: ['entrance'], outing: true }, s => s.initialConditions.doorMode === 'automatic' ? [
    '문 너머 카페에 빈자리가 보인다. 안으로 들어가 앉고 싶다. 입구에는 옆으로 열리는 자동문이 있다.',
    '다가가자 문이 옆으로 열린다. 문짝을 잡아 달라고 말할 필요는 없다. 안쪽의 대기선과 카트, 좌석 사정은 그대로다.'
  ] : [
    '문 너머 빈자리에 앉고 싶다. 앞사람이 손을 놓자 미는 문이 닫힌다. 내 쪽으로 오던 사람은 복도 끝에서 방향을 바꾼다.',
    '그 사람이 어디로 가는지는 모른다. 문을 잡을 손이 비는지 살피고, 도움을 부탁할지 다른 입구로 갈지 생각한다.'
  ], s => s.initialConditions.doorMode === 'automatic' ? [
    act('S02-auto-enter', '열린 자동문을 지나 안쪽을 살핀다', '문 잡기 요청 없이 대기 공간 확인', { entrance: { passed: true, selected: 'front', heldBy: null }, facts: ['자동문을 잡아 달라는 요청 없이 현관 안쪽에 섰다'] }, ['문이 옆으로 열리자 내 속도로 안으로 들어간다. 이번에는 문을 잡아 달라고 부탁할 말을 고르지 않아도 된다.', '바로 안쪽은 카트와 대기선 때문에 좁다. 문은 지났지만, 앉을 자리까지 가려면 이 통로도 지나야 한다.'], '자동문 · 문 잡기 요청 없음 / 안쪽 공간 확인', { energy: -1, motion: mm('walk', 'hall', '자동문을 통과한 뒤 안쪽 대기 공간을 확인한다.') }),
    act('S02-auto-pause', '열린 공간을 확인하고 천천히 들어간다', '드나드는 사람들이 지나가기를 기다리기', { entrance: { passed: true, waitMinutes: 2, heldBy: null }, addMinutes: 2, facts: ['자동문 앞에서 흐름을 살핀 뒤 들어갔다'] }, ['자동문 앞에서 잠깐 주변을 살핀다. 문을 잡고 있는 사람이 없어 그 사람에게 맞추어 속도를 낼 필요는 없다.', '문이 열리면 천천히 안으로 들어간다. 기다리는 동안에도 안쪽 통로는 여전히 좁다.'], '자동문 · 확인 2분 / 문 잡기 요청 없음', { energy: -1, motion: mm('walk', 'hall', '주변을 확인한 뒤 자동문 안쪽으로 이동한다.') }),
    act('S02-auto-side', '옆 출입구도 확인한다', '자동문과 별개로 덜 붐비는 입구 찾기', { entrance: { selected: 'side', passed: true, heldBy: null }, addMinutes: 4, detourMeters: 30, facts: ['옆 자동문으로 이동해 안쪽을 확인했다'] }, ['안쪽 대기선이 보여 옆 출입구를 확인한다. 이곳도 자동문이어서 문짝을 붙드는 손은 필요하지 않다.', '옆문까지 돌아오는 데 시간이 좀 걸렸다. 문을 지나 안쪽 통로를 살핀다.'], '옆 자동문 · 우회 30m / 확인 4분', { energy: -1, motion: mm('walk', 'hall', '옆 자동문으로 우회한다.') })
  ] : [
    act('S02-ask', '문을 잡아 달라고 말한다', '문이 열리면 안쪽 통로도 살피기', { entrance: { heldBy: '지나가던 사람', waitMinutes: 1 }, requests: [request('문을 잡아 달라고 부탁')], addMinutes: 1, facts: ['요청을 들은 사람이 문을 잡았다'] }, ['“문을 잠깐 잡아 주시겠어요?” 상대가 돌아와 문을 잡는다. 말을 시작하기 전의 망설임이 요청보다 길었다.', '문 너머가 보이자 조금 안도한다. 아직 통과하지는 않았다. 안쪽 대기 공간까지 확인해야 한다.'], '미는 문 · 문 잡기 요청 1회 / 대기 1분', { energy: -1, focus: 'shared', motion: mm('stand', 'hall', '문을 잡아 달라고 말하고 통과할 공간을 살핀다.') }),
    act('S02-wait', '눈이 마주칠 때까지 기다린다', '아직 말하지 않은 부탁, 상대가 알아챘을까', { entrance: { waitMinutes: 4 }, unspoken: ['문을 잡아 달라는 말을 아직 꺼내지 못했다'], addMinutes: 4, facts: ['문 앞에서 기다렸지만 진입은 아직 정해지지 않았다'] }, ['몇 분 동안 문 앞에 머문다. 눈이 마주친 것 같기도 하지만 상대가 이쪽 상황을 알았는지는 확인할 수 없다.', '말을 꺼내지 못한 채 몇 분이 흘렀다. 문 주변 상황은 여전히 달라진 게 없다.'], '미는 문 · 대기 4분 / 문 요청은 아직 말하지 않음', { energy: -1, motion: mm('stand', 'hall', '문 앞에서 기다린 뒤 주변 공간을 다시 본다.') }),
    act('S02-side', '다른 출입구를 확인한다', '입구를 바꾸는 대신 탐색과 거리 추가', { entrance: { selected: 'side', waitMinutes: 0 }, addMinutes: 5, detourMeters: 30, facts: ['옆 출입구를 확인했다', '옆문도 미는 문이었다'] }, ['옆 입구 표지를 따라간다. 여기도 미는 문이지만 앞쪽과 대기 공간의 모양은 다르다.', '조금 더 돌아왔다. 이 문으로 들어갈 수 있을지 주변을 살핀다. 도와주는 사람이 있었는지와 별개로, 문과 통로가 어떤지도 봐야 한다.'], '옆 미는 문 · 우회 30m / 탐색 5분', { energy: -1, motion: mm('walk', 'hall', '옆 출입구를 확인하러 우회한다.') })
  ], s => ({ kind: 'door-environment', value: s.initialConditions.doorMode, changes: ['문 구조'], unchanged: ['인물', '목적', '시작 에너지', '안쪽 카트', '좌석과 셀프서비스'] }));
  scene('S03', '문 앞 통로가 좁다', { location: ['entrance'], outing: true }, s => [
    s.initialConditions.doorMode === 'automatic' ? '자동문은 옆으로 열려 문짝이 대기 자리를 쓸고 가지 않는다. 다만 안쪽 카트와 대기선이 겹쳐 지나갈 공간은 좁다.' : '문이 예상보다 크게 열리며 대기 자리 바로 옆을 스친다. 반대편 사람도 멈춘다. “이쪽에 기다리는 사람이 있는지 못 봤어요.” 안쪽 카트와 대기선도 겹쳐 있다.',
    '카트 때문에 통로가 더 좁아졌다. 문 반대편에서는 내가 잘 보이지 않는다. 직원에게 이쪽 상황을 알려야 할 것 같다.'
  ], () => [
    act('S03-coordinate', '직원에게 통행을 정리해 달라고 요청한다', '양쪽 확인과 공간 확보가 끝난 뒤 이동', { location: 'cafe', entrance: { passed: true }, environment: { hazardObserved: true, spaceCleared: true, responsibleActors: ['직원', '반대편 이용자'], action: '직원이 양쪽 통행을 확인하고 카트를 옮겼다' }, requests: [request('문 주변 양쪽 통행과 대기 공간 정리 요청')], addMinutes: 3, facts: ['직원이 통행을 확인하고 공간을 확보한 뒤 들어갔다'] }, ['직원이 반대편에도 상황을 알리고 카트를 옮긴다. 지나갈 공간이 확보됐다는 말을 들은 뒤 안으로 간다.', '직원이 카트를 옮기는 동안 반대편 사람도 기다려 주었다. 통로가 넓어진 것을 보고 나서야 발을 옮긴다.'], '개인 행동: 통행 정리 요청 / 환경: 양쪽 확인·카트 이동 완료', { energy: -1, focus: 'shared', motion: mm('walk', 'hall', '다른 사람들의 통행 확인과 공간 확보 후 들어간다.') }),
    act('S03-leave', '이 입구 이용을 중단하고 돌아간다', '계획과 귀가 동선을 바꾸기', { location: 'home', outing: false, returned: true, returnReason: '문 주변 공간을 피하기로 함', environment: { hazardObserved: true, spaceCleared: false, action: '이용을 중단해 해당 공간을 통과하지 않았다' }, facts: ['위험 신호를 본 뒤 이 입구를 이용하지 않고 귀가했다'] }, ['입구 이용을 중단하고 돌아갈 길을 정한다. 공간이 정리됐다고 확인하지 않은 채 통과하지는 않는다.', '집에 와서 앉는다. 카페의 빈자리가 생각나 아쉽다. 잠깐 쉰 뒤 남은 오후에 무엇을 할지 생각해 본다.'], '개인 행동: 이용 중단·귀가 / 환경: 미해결 입구를 통과하지 않음', { energy: -1, focus: 'rest', motion: mm('walk', 'room', '해당 입구를 이용하지 않고 귀가해 앉는다.', 'sit') }),
    act('S03-notify-wait', '상황을 알리고 공간이 정리되기를 기다린다', '기다림 뒤 실제 안내와 확보를 확인', { location: 'cafe', entrance: { passed: true }, environment: { hazardObserved: true, spaceCleared: true, responsibleActors: ['직원', '대기 이용자'], action: '직원이 통행을 안내하고 대기선을 비웠다' }, requests: [request('이쪽 대기 상황을 알림')], addMinutes: 6, facts: ['상황을 알린 후 직원의 통행 안내와 공간 확보를 확인했다'] }, ['이쪽에 기다리는 사람이 있다고 알리고 잠깐 멈춘다. 직원이 통행을 안내하고 대기선의 빈 공간을 확인해 준다.', '지나가도 된다는 안내를 듣고 들어간다. 기다리는 사이 직원과 다른 이용자들이 길을 비워 주었다.'], '개인 행동: 상황 알림·대기 6분 / 환경: 안내·공간 확보 완료', { energy: -1, motion: mm('walk', 'hall', '안내와 공간 확보를 확인한 뒤 통과한다.') })
  ], s => ({ kind: 'door-environment', value: s.initialConditions.doorMode, changes: ['문짝이 대기 공간을 쓸고 가는 조건'], unchanged: ['안쪽 카트와 대기선', '공간 관리 책임'] }));
  scene('S04', '열린 엘리베이터 앞에서', { location: ['elevator-lobby'], outing: true }, () => [
    '엘리베이터에 타서 목적 층으로 가고 싶다. 문을 잡은 사람이 “천천히 오세요”라고 말한다.',
    '고맙지만, 기다리는 사람들이 신경 쓰여 마음이 급해진다. 지금 타러 갈지, 다음 엘리베이터를 기다릴지 잠깐 생각한다.'
  ], () => [
    act('S04-thanks', '고맙다고 말하고 평소 속도로 간다', '도움은 받고 걸음은 그대로', { location: 'cafe', entrance: { passed: true }, conversations: ['고맙다고 말했다. 상대는 문을 열어 두고 기다렸다.'], facts: ['엘리베이터를 자기 속도로 탔다'] }, ['고맙다고 말하고 평소 속도로 간다. 상대는 문을 열어 둔 채 재촉하지 않고 기다려 준다.', '목적 층에 도착한다. 기다려 줘서 고맙다. 조금 긴장했던 마음도 아직 남아 있다.'], '엘리베이터 · 고맙다고 말함 / 자기 속도 유지', { energy: -1, motion: mm('walk', 'hall', '자기 속도로 엘리베이터에 타고 목적 층으로 간다.') }),
    act('S04-say-slow', '천천히 가겠다고 알린다', '기다릴 수 있는지 말로 확인', { location: 'cafe', entrance: { passed: true }, requests: [request('천천히 이동할 동안 기다릴 수 있는지 확인')], conversations: ['“조금 천천히 갈게요.” “네, 기다릴게요.”'], facts: ['상대의 대답을 확인하고 천천히 엘리베이터에 탔다'] }, ['“조금 천천히 갈게요. 기다려 주실 수 있을까요?” 상대가 괜찮다고 답한다. 천천히 간다고 미리 말하니 조금 마음이 놓인다.', '서두르지 않고 타서 목적 층으로 간다. 조급함이 완전히 없어지지는 않아도 서로 무엇을 기다리는지는 알게 됐다.'], '엘리베이터 · 천천히 간다고 알림 / 기다림 확인', { energy: -1, motion: mm('walk', 'hall', '기다릴 수 있다는 대답을 듣고 천천히 탄다.') }),
    act('S04-next', '다음 엘리베이터를 기다린다', '먼저 가시라고 말하고 다음 편 기다리기', { location: 'cafe', entrance: { passed: true }, addMinutes: 5, conversations: ['“먼저 가세요. 다음 것을 탈게요.”'], facts: ['다음 엘리베이터를 기다려 목적 층으로 갔다'] }, ['먼저 가시라고 말하고 다음 편을 기다린다. 문을 잡았던 사람은 손을 놓고 올라간다.', '몇 분 뒤 온 엘리베이터를 타고 목적 층에 도착한다. 조금 늦어졌지만 마음은 덜 급하다.'], '엘리베이터 · 다음 편 대기 5분 / 목적 층 도착', { energy: -1, addMinutes: 5, motion: mm('walk', 'hall', '다음 엘리베이터를 기다려 목적 층으로 간다.') })
  ]);
  scene('S05', '도착했는데 입구에 턱이 있다', { location: ['entrance'], outing: true }, () => [
    '지도에서 도착했다는 알림이 뜬다. 유리 너머 빈자리에 앉고 싶다. 문 앞에는 지도에서 확인하지 못한 마지막 단차가 있다.',
    '여기까지 오는 데 걸린 시간도, 창가 사진을 보며 기대했던 마음도 떠오른다. 이 입구로 들어갈 수 있는지는 직원에게 물어봐야 알겠다.'
  ], () => [
    act('S05-staff', '직원에게 문 앞으로 와 달라고 한다', '출입 가능 여부와 실제 대안 확인', { location: 'cafe', entrance: { passed: true, selected: 'verified-side' }, requests: [request('문 앞에서 이용 가능한 출입 대안 확인')], access: { threshold: 'confirmed-fiction-side-entry' }, addMinutes: 5, facts: ['직원이 확인한 옆 출입구로 가게에 들어갔다'] }, ['직원이 문 앞에 와서 단차를 함께 본다. 옆 출입구로는 들어갈 수 있다고 안내해 주어, 그쪽으로 돌아간다.', '눈여겨봤던 창가 자리는 안쪽에 있다. 처음만큼 들뜨지는 않는다. 커피 향을 맡으며 계산대로 간다.'], '마지막 단차 · 직원 확인 5분 / 확인된 옆문으로 입장', { energy: -1, motion: mm('walk', 'hall', '직원이 확인한 옆 출입구로 입장한다.') }),
    act('S05-another', '다른 장소를 고른다', '들어갈 수 있는 다른 가게 찾기', { location: 'cafe', entrance: { passed: true, selected: 'another-verified-place' }, access: { threshold: 'confirmed-fiction-new-place' }, detourMeters: 120, addMinutes: 12, facts: ['근처 다른 가게에 연락해 출입 조건을 확인한 뒤 옮겼다'] }, ['근처 다른 가게에 연락해 입구 조건을 확인하고 옮긴다. 원래 창가 사진과는 다른 장소다.', '다른 가게까지 걸어오느라 조금 지쳤다. 유리컵 부딪히는 소리를 들으며 메뉴를 본다. 여기에도 마셔 보고 싶은 음료가 있다.'], '대체 장소 · 확인 후 120m 이동 / 계획 12분 변경', { energy: -2, mood: 1, motion: mm('walk', 'street', '조건을 확인한 다른 가게로 이동한다.') }),
    act('S05-home', '집으로 돌아간다', '가게에 들어가지 않고 귀가하기', { location: 'home', outing: false, returned: true, returnReason: '도착한 입구의 단차 뒤에 귀가를 선택함', plan: { returnConsidered: true }, facts: ['원래 가게에 들어가지 않고 귀가했다'] }, ['원래 가게에 들어가지 않고 돌아선다. 유리 너머로 봤던 창가 자리가 계속 생각난다.', '집에 와서 앉으니 손바닥에 실렸던 힘이 풀린다. 가게 안에 들어가지 못한 건 아쉽다. 잠깐 쉬고 나면 집에서 마실 것을 골라 봐야겠다.'], '입장하지 않음 · 귀가 / 원래 가게의 좌석은 이용하지 않음', { energy: -1, focus: 'rest', motion: mm('walk', 'room', '원래 가게를 이용하지 않고 집에 돌아와 앉는다.', 'sit') })
  ]);
  scene('S06', '계산대 아래의 카드', { location: ['cafe'], outing: true }, () => [
    '결제를 끝내고 앉을 자리로 가고 싶다. 카드가 계산대 아래로 떨어진다. 뒤에서 신발 끄는 소리가 난다.',
    '줄에 선 사람들이 무슨 생각을 하는지는 모른다. 카드를 어디에 떨어뜨렸는지 살피면서도 “한 번 더 부탁해도 될까” 하는 생각부터 든다.'
  ], s => {
    const choices = [
      act('S06-ask', '카드를 주워 달라고 부탁한다', '짧은 요청 뒤 손 닿는 곳에서 받기', { items: { cardLocation: 'wallet' }, requests: [request('떨어진 카드 회수 부탁')], facts: ['직원이 카드를 주워 손 닿는 곳에 놓았다', '카드를 지갑에 넣고 결제를 마쳤다'] }, ['“카드 좀 주워 주시겠어요?” 직원이 카드를 주워 손 닿는 곳에 놓는다. 길게 설명할 필요는 없었다.', '직원이 카드를 건넨 뒤 계산을 이어간다. 카드를 지갑에 넣으니 마음이 놓인다. 뒤에서 줄이 움직이는 소리가 들린다.'], '카드 회수 확인 · 지갑에 보관 / 결제 완료', { focus: 'shared' }),
      act('S06-pause', '직원에게 상황을 설명하고 잠깐 기다린다', '거래를 멈춘 뒤 카드와 결제 정리', { items: { cardLocation: 'wallet' }, requests: [request('거래를 잠시 멈추고 카드 회수 상황 설명')], addMinutes: 3, facts: ['직원이 거래를 잠시 멈추고 카드를 회수해 건넸다', '카드를 지갑에 넣고 결제를 마쳤다'] }, ['직원이 거래를 잠깐 멈추고 카드를 회수해 건넨다. 기다리는 동안 뒤쪽의 줄 소리가 다시 들린다.', '카드를 지갑에 넣은 것을 확인하고 결제를 마친다. 뒤에 선 사람들의 표정은 알 수 없다. 지금은 카드를 찾고 계산을 마친 것만 생각한다.'], '거래 잠시 멈춤 3분 / 카드 회수·결제 완료')
    ];
    if (s.initialConditions.phonePayment) choices.push(act('S06-phone', '준비된 휴대전화 결제로 이어 간다', '결제와 별도로 카드 회수도 확인', { items: { cardLocation: 'wallet' }, requests: [request('휴대전화 결제 뒤 떨어진 카드 회수 확인')], facts: ['미리 준비해 둔 휴대전화로 결제했다', '직원이 회수한 카드를 지갑에 넣었다'] }, ['미리 준비해 둔 휴대전화로 결제한다. 계산을 마쳐도 바닥에 떨어진 카드는 찾아야 한다.', '직원이 회수한 카드를 건네받고 지갑에 넣은 것까지 확인한다. 결제와 회수를 따로 끝낸 뒤 자리로 간다.'], '휴대전화 결제 / 카드 회수 확인·지갑 보관'));
    for (const choice of choices) choice.motion = mm('stand', 'hall', '결제대에서 회수한 카드를 확인하고 다음 동선을 고른다.');
    return choices;
  });
  scene('S07', '컵만 부탁했는데', { location: ['home'], helpRequested: true }, s => s.initialConditions.helpStyle === 'ask' ? [
    '창가에 옮겨 받은 컵을 본다. 상대가 “다른 것도 해줄까?” 하고 먼저 묻는다.',
    '필요한 도움을 받고, 나머지는 어떻게 할지 직접 정할 수 있다. 어디까지 도와 달라고 할지 생각한다.'
  ] : [
    '컵만 옮겨 달라고 부탁했는데 상대가 “앉아 있어, 내가 다 할게”라고 말한다.',
    '다 해주면 몸은 편하겠지만, 물건 정리까지 맡기고 싶었던 건 아니다. 상대가 대답을 기다린다. 어디까지 부탁할지 생각한다.'
  ], s => [
    act('S07-all', '이번에는 남은 준비도 맡긴다', '마실 시간과 쉬는 자리 확보', { help: { scope: 'all', delegated: ['컵 옮기기', '물건 정리', '남은 준비'], ownTasks: ['마실 자리에서 시간 보내기'] }, conversations: [s.initialConditions.helpStyle === 'ask' ? '다른 것도 도와줄지 물었고 이번에는 맡기겠다고 답했다.' : '다 해주겠다는 제안을 이번에는 받아들였다.'], facts: ['동의한 범위의 남은 준비를 상대가 맡았다'] }, ['이번에는 남은 준비도 부탁한다고 말한다. 상대가 물건을 정리하는 동안 나는 컵 옆에 앉아 쉰다.', '물건을 정리하는 모습을 보다가 등을 기댄다. 직접 하려던 일도 이번에는 맡기고 쉬기로 한다.'], '도움 범위: 남은 준비 수락 / 맡긴 일과 내 시간 구분', { energy: 1, effect: 'rest', focus: 'rest' }),
    act('S07-cup', '컵만 옮겨 달라고 말한다', '나머지 물건 정리는 내가 하기', { help: { scope: 'cup', delegated: ['컵 옮기기'], ownTasks: ['물건 정리', '남은 준비'] }, requests: [request('컵만 부탁한다고 도움 범위 설명')], facts: ['컵 옮기기만 맡기고 나머지 준비는 직접 정했다'] }, ['“컵만 부탁할게. 나머지는 내가 정리하고 싶어.” 한 문장을 더 말한다. 상대가 알겠다고 답한다.', '컵은 이미 창가에 있으니, 나머지 물건을 어디에 둘지는 내가 정한다. 한마디 더 해야 해서 부담스러웠지만, 원하는 대로 할 수 있어 마음이 놓인다.'], '도움 범위: 컵만 / 나머지 준비는 직접 결정', { focus: 'create' }),
    act('S07-decline', '지금은 더 돕지 않아도 된다고 말한다', '받은 컵은 그대로, 남은 계획은 다시 조정', { help: { scope: 'none-further', delegated: ['이미 끝난 컵 옮기기'], ownTasks: ['남은 계획 다시 정하기'] }, conversations: ['지금은 더 돕지 않아도 된다고 말했고 상대가 멈췄다.'], facts: ['이미 받은 컵은 두고 추가 도움을 멈췄다'] }, ['“고마워. 지금은 이 정도면 될 것 같아.” 상대가 알겠다고 하고 정리를 멈춘다. 컵은 창가에 그대로 있다.', '남은 일은 조금 줄이기로 한다. 커피를 마저 마시고 나서 필요한 것부터 정리해야겠다.'], '추가 도움 중단 / 이미 받은 컵 유지 / 남은 계획 재조정')
  ], s => ({ kind: 'help-consent', value: s.initialConditions.helpStyle, changes: ['상대가 먼저 범위를 물었는지'], unchanged: ['주인공이 정할 도움의 범위', '수락·거절 가능'] }));
  scene('S08', '갈 길과 돌아올 길', { location: ['home'] }, () => [
    '카페에 가서 잠깐 머물고 돌아오고 싶다. 지도에서 가는 길을 본 다음 돌아오는 길을 한 번 더 본다.',
    '카페에서 쉬고 나올 때는 지금보다 지쳐 있을 수도 있다. 가는 거리만 보고 정하려다 돌아오는 길도 다시 확인한다.'
  ], s => [
    act('S08-planned', '계획한 장소로 간다', '머무는 시간과 돌아올 길도 생각하기', { location: 'street', outing: true, plan: { destination: '계획한 카페', outboundMeters: 300, returnMeters: 300, returnConsidered: true }, accessSource: 'planned-cafe', access: s.context.accessSource === 'planned-cafe' ? { ...s.context.access } : { toilet: 'unknown', threshold: 'unknown', distance: 'map-estimate', rest: 'unknown' }, facts: ['계획한 장소로 출발하기 전에 돌아올 거리 300m도 확인했다', '접근 정보는 선택한 장소의 확인 근거만 유지했다'] }, ['보고 싶던 장소를 향해 출발한다. 얼마나 머물지, 어떻게 돌아올지도 생각한다. 다른 가게에서 확인한 정보만으로 이곳도 같을 거라고 생각하지는 않는다.', '카페에 가면 무엇부터 마실지 생각하며 걷는다. 돌아오는 길도 300미터다. 얼마나 쉬었다 나올지도 생각해 둔다.'], '계획 장소 출발 · 편도 300m / 귀가 300m도 고려', { energy: -1, focus: 'outing', motion: mm('walk', 'street', '돌아올 길도 확인하고 계획한 장소로 출발한다.') }),
    act('S08-near', '더 가까운 곳으로 바꾼다', '원래 장소보다 왕복 거리 줄이기', { location: 'street', outing: true, plan: { destination: '가까운 카페', outboundMeters: 100, returnMeters: 100, returnConsidered: true }, accessSource: 'nearby-cafe', access: s.context.accessSource === 'nearby-cafe' ? { ...s.context.access } : { toilet: 'unknown', threshold: 'unknown', distance: 'map-estimate', rest: 'unknown' }, facts: ['가까운 장소로 바꿔 편도 100m와 귀가 100m를 계획했다', '접근 정보는 선택한 장소의 확인 근거만 유지했다'] }, ['가까운 곳으로 목적지를 바꾼다. 사진으로 봤던 창가는 오늘 가지 않기로 한다. 입구와 쉴 자리도 가게마다 다를 수 있다.', '돌아오는 길이 짧아진 대신 메뉴도 바뀐다. 새 가게에서 궁금한 음료 하나를 골라 둔다.'], '가까운 장소로 변경 · 편도 100m / 귀가 100m', { energy: -1, mood: 1, focus: 'outing', motion: mm('walk', 'street', '가까운 장소로 목적지를 바꿔 출발한다.') }),
    act('S08-later', '외출은 오늘 미룬다', '집에서 보낼 시간으로 다시 고르기', { location: 'home', outing: false, returnReason: '출발 전에 외출을 미룸', plan: { destination: '오늘은 집', outboundMeters: 0, returnMeters: 0, returnConsidered: true }, facts: ['외출을 출발 전에 미루고 집에 머물렀다'] }, ['오늘의 외출을 미루고 지도 앱을 닫는다. 신발을 꺼내려다 그만두고 집에 머무르기로 한다.', '집에서 듣고 싶던 음악을 하나 고른다. 외출을 미뤄 아쉽지만, 집에서 음악을 들을 시간은 생겼다. 남은 시간은 집에서 보내기로 한다.'], '외출 미룸 · 출발하지 않음 / 집에서 남은 시간', { energy: 1, effect: 'rest', focus: 'rest' })
  ]);
  scene('S09', '빈자리와 앉을 자리', { location: ['cafe'], outing: true }, () => [
    '음료를 두고 편히 머물고 싶다. 빈자리는 있다. 다만 모두 높은 바 의자다. 낮은 테이블에서는 아직 이야기가 한창이다.',
    '높은 의자를 올려다본다. 오늘은 낮은 의자에 앉고 싶다. 자리가 나기를 기다릴지, 직원에게 물어볼지 생각한다.'
  ], () => [
    act('S09-wait', '낮은 자리가 날 때까지 기다린다', '기다린 뒤 실제로 빈 자리 확인', { seat: { visibleEmpty: 'high-and-low', usable: 'low-chair', mode: 'seated', waitedMinutes: 7 }, addMinutes: 7, facts: ['손님이 떠난 뒤 비게 된 낮은 자리에 앉았다'] }, ['메뉴를 고르는 일을 잠깐 뒤로 미루고 기다린다. 몇 분 뒤 다른 손님이 식사를 마치고 자리를 떠난다.', '손님이 떠난 낮은 자리에 앉는다. 조금 기다렸지만, 이제 컵을 편하게 내려놓을 수 있다.'], '높은 빈자리와 구별 · 낮은 자리 대기 7분 후 착석', { energy: -1, motion: mm('sit', 'room', '실제로 비게 된 낮은 자리에 앉는다.') }),
    act('S09-ask', '직원에게 이용 가능한 자리를 묻는다', '안쪽에 낮은 의자가 있는지 물어보기', { seat: { visibleEmpty: 'high-and-low', usable: 'low-chair', mode: 'seated', waitedMinutes: 3 }, requests: [request('이용 가능한 낮은 자리 확인')], addMinutes: 3, facts: ['직원이 안쪽의 사용하지 않던 낮은 자리를 확인해 안내했다'] }, ['직원이 안쪽을 확인하고 사용하지 않던 낮은 자리를 안내한다. 앉아 있던 손님을 이동시키지는 않는다.', '바깥 풍경은 잘 안 보이지만 편하게 앉을 수 있다. 이제 메뉴를 다시 펼쳐 본다.'], '직원 확인 · 안쪽 낮은 자리 / 다른 손님 이동 없음', { focus: 'shared' }),
    act('S09-takeout', '포장해서 집에서 마신다', '마시고 싶은 음료를 포장해 가기', { location: 'home', outing: false, returned: true, returnReason: '이용할 좌석 대신 포장 후 귀가', seat: { visibleEmpty: 'high-only', usable: null, mode: 'takeout' }, items: { container: 'takeout-cup', cupLocation: 'table', drinkPlace: 'table' }, facts: ['가게에는 앉지 않고 포장한 음료를 집에서 마셨다'] }, ['가게에 머무는 대신 포장해 돌아간다. 높은 빈자리는 끝내 이용하지 않았다.', '집 식탁에 앉아 포장해 온 음료를 마신다. 가게에서 쉬지는 못했지만, 궁금했던 맛은 볼 수 있었다. 돌아오느라 지친 다리도 좀 쉬게 한다.'], '높은 자리 이용 안 함 · 포장·귀가 / 집 식탁에서 마심', { energy: -1, focus: 'rest', motion: mm('walk', 'room', '포장한 음료와 함께 귀가해 식탁에 앉는다.', 'sit') })
  ]);
  scene('S10', '앉고 나서 보이는 셀프 코너', { location: ['cafe'], outing: true, seated: true }, () => [
    '자리에 앉아 편하게 먹고 싶다. 그제야 물과 식기가 셀프 코너에 있다는 안내를 본다.',
    '다시 움직일지, 한 번 더 부탁할지 잠깐 망설인다. 물과 식기는 아직 가져오지 못했다.'
  ], () => [
    act('S10-all', '물과 필요한 식기를 한 번에 부탁한다', '필요한 것을 정리해 말하기', { needs: { water: 'received', utensils: 'received' }, requests: [request('물과 식기를 함께 요청')], facts: ['부탁한 물과 식기를 실제로 받았다'] }, ['필요한 것을 한 번에 정리해 부탁한다. 잠깐 뒤 물과 식기가 테이블에 놓인다.', '물과 식기가 놓이니 음식 맛에 조금 더 집중할 수 있다. 부탁할 말을 고르기는 쉽지 않았지만, 이제 앉아서 편하게 먹는다.'], '요청 1회 · 물 수령 / 식기 수령', { focus: 'shared' }),
    act('S10-separate', '필요할 때마다 요청한다', '식사 중 두 번 말을 꺼내기', { needs: { water: 'received', utensils: 'received' }, requests: [request('물 요청'), request('식기 요청')], facts: ['물과 식기를 각각 부탁해 받았다'] }, ['먼저 물을 부탁해 받고, 먹으려다 필요한 식기도 따로 요청한다. 짧은 문장을 두 번 꺼낸다.', '물과 식기가 모두 놓이고 나서야 먹는 데 집중한다. 두 번이나 말을 걸기가 망설여졌지만, 음식은 맛있다.'], '요청 2회 · 물과 식기를 각각 수령'),
    act('S10-defer', '지금은 미루고 주문을 간단히 바꾼다', '아직 받지 않은 물과 식기는 나중에 부탁하기', { needs: { water: 'pending', utensils: 'pending' }, unspoken: ['물과 식기는 지금 요청하지 않았다'], facts: ['물과 식기를 받지 않은 상태로 요청을 미뤘다'] }, ['한 번 더 부탁할 말을 고르다가 우선 주문부터 간단히 바꾼다. 물과 식기는 아직 테이블에 없다.', '잠깐 앉아서 무엇이 필요한지 다시 생각한다. 물과 식기는 아직 받지 않았지만, 필요하면 다시 부탁할 수 있다.'], '물 미수령·식기 미수령 / 물과 식기는 아직 부탁하지 않음')
  ]);
  scene('S11', '친구들 말이 잘 안 들린다', { location: ['street'], outing: true, companion: 'friends' }, () => [
    '친구들과 나란히 걸으며 이야기를 듣고 싶다. 친구들은 웃으며 조금씩 앞서 간다. 방금 말이 끝나기도 전에 다음 이야기가 시작된다.',
    '앞쪽에서 웃음이 들리지만 마지막 말은 잘 들리지 않는다. 어느새 친구들과 거리가 벌어졌다.'
  ], () => [
    act('S11-slower', '다시 조금만 천천히 가자고 한다', '같은 부탁을 반복하고 나란히 걷기', { socialPatch: { missedWords: true, together: true }, requests: [request('다시 조금만 천천히 걷자고 요청')], conversations: ['친구가 돌아보고 속도를 맞췄다. 놓친 말의 끝을 다시 들었다.'], facts: ['속도를 다시 말한 뒤 친구와 나란히 걸었다'] }, ['다시 조금만 천천히 가자고 말한다. 친구가 돌아보고 간격을 줄인다. 놓친 말의 끝을 한 번 더 들려준다.', '놓친 이야기를 다시 듣는다. 같은 부탁을 또 꺼내기가 편했던 건 아니다.'], '요청 반복 1회 / 놓친 말 다시 들음 / 나란히 이동', { energy: -1, motion: mm('walk', 'street', '친구가 속도를 맞춘 뒤 나란히 걷는다.') }),
    act('S11-stop', '잠깐 멈춰 함께 이야기하자고 한다', '이동 일정은 늦추고 대화는 이어 가기', { socialPatch: { missedWords: true, together: true }, requests: [request('잠깐 멈춰 함께 이야기하자고 요청')], conversations: ['친구들과 멈춰 서서 이야기를 이어 갔다.'], addMinutes: 5, facts: ['이동을 잠깐 멈추고 친구들과 이야기했다'] }, ['여기서 잠깐 이야기하자고 말한다. 친구들이 멈춰 돌아선다. 목적지에 닿는 시간은 조금 늦어진다.', '서서 이야기하니 무슨 말인지 끝까지 잘 들린다. 대신 목적지에는 조금 늦게 도착하겠다.'], '잠깐 멈춤 5분 / 대화 참여 / 이동 계획 조정', { focus: 'shared', motion: mm('stand', 'street', '이동을 잠깐 멈추고 친구들의 이야기를 듣는다.') }),
    act('S11-own', '뒤에서 자기 속도로 간다', '추가 요청은 줄지만 말 일부는 놓치기', { socialPatch: { missedWords: true, together: false }, unspoken: ['이번에는 속도를 맞춰 달라는 말을 하지 않았다'], conversations: ['친구가 한 번 돌아봤지만 앞쪽 대화 일부는 듣지 못했다.'], facts: ['자기 속도로 걸으며 앞쪽 대화 일부를 놓쳤다'] }, ['추가로 말을 꺼내지 않고 자기 속도로 간다. 친구가 한 번 돌아보지만 앞에서 끝난 이야기의 일부는 들리지 않는다.', '내 속도로 걸었지만 놓친 이야기가 아쉽다. 더 부탁하지 않았다고 마음까지 편한 건 아니다.'], '추가 요청 없음 / 자기 속도 / 대화 일부 놓침', { energy: -1, motion: mm('walk', 'street', '자기 속도로 걸으며 앞쪽 대화 일부를 놓친다.') })
  ]);
  scene('S12', '가까운 계단, 먼 엘리베이터', { location: ['street'], outing: true }, () => [
    '목적지로 들어가는 가까운 길에 계단 다섯 칸이 있다. 난간이 중간에 끊겨 있고 기다릴 자리도 좁다. 지금 이 계단은 이용할 수 없다.',
    '계단 앞에서 주변을 살핀다. 중간에 쉬거나 잠깐 비켜설 곳도 마땅치 않다.',
    '엘리베이터 표지는 반대쪽 복도 끝을 가리킨다. 가까워 보여도 내가 갈 수 있는 길은 따로 있다.'
  ], () => [
    act('S12-elevator', '엘리베이터 경로를 택한다', '추가 거리와 시간, 귀가 길도 반영', { location: 'elevator-lobby', plan: { returnConsidered: true }, detourMeters: 180, addMinutes: 8, facts: ['가까운 계단 대신 180m 돌아 엘리베이터 앞에 왔다'] }, ['계단 대신 엘리베이터 표지를 따라간다. 가까운 길보다 180미터를 더 돌아 문 앞에 도착한다.', '시간과 이동이 추가됐다. 같은 목적지라도 돌아갈 때 다시 쓸 길까지 생각해야 한다. 아직 엘리베이터를 타지는 않았다.'], '계단 이용 안 함 · 엘리베이터까지 우회 180m / 8분', { energy: -2, focus: 'outing', motion: mm('walk', 'hall', '추가 거리를 돌아 엘리베이터 앞에 도착한다.') }),
    act('S12-confirm', '다른 접근 경로를 확인한다', '안내받은 연결 통로를 실제 확인', { location: 'elevator-lobby', access: { threshold: 'confirmed-fiction-connecting-passage' }, requests: [request('이용 가능한 다른 연결 통로 확인')], detourMeters: 120, addMinutes: 10, facts: ['직원이 확인한 연결 통로로 엘리베이터 앞에 왔다'] }, ['직원에게 다른 길이 있는지 묻는다. 안내해 준 연결 통로를 지나 엘리베이터 앞까지 간다.', '길을 묻고 찾아오느라 시간이 걸렸고, 120미터를 더 걸었다. 엘리베이터 앞에서 손잡이를 다시 고쳐 쥔다.'], '문의·확인 10분 / 확인된 연결 통로 120m 추가', { energy: -1, motion: mm('walk', 'hall', '확인된 연결 통로를 따라 엘리베이터 앞에 간다.') }),
    act('S12-home', '목적지를 바꾸어 집으로 돌아간다', '다른 길로 더 돌아가는 대신 귀가하기', { location: 'home', outing: false, returned: true, returnReason: '이용할 경로를 다시 고른 뒤 귀가', plan: { returnConsidered: true }, facts: ['그 계단과 엘리베이터를 이용하지 않고 귀가했다'] }, ['원래 목적지 대신 집으로 돌아갈 길을 고른다. 다섯 칸뿐이어도 오늘 이용할 수 있는 길은 아니었다.', '집 의자에 앉는다. 가려던 곳에 못 간 것은 아쉽지만, 지금은 다리와 팔을 좀 쉬게 하고 싶다.'], '목적지 변경·귀가 / 해당 계단·엘리베이터 이용 안 함', { energy: -1, focus: 'rest', motion: mm('walk', 'room', '목적지를 바꾸어 집으로 돌아온다.', 'sit') })
  ]);
  scene('S13', '메뉴보다 먼저 확인하는 지도', { location: ['home'] }, () => [
    '가 보고 싶은 카페를 찾아본다. 사진 속 창가가 좋아 메뉴를 열려다가 화장실 위치부터 찾는다.',
    '화장실, 문턱, 이동 거리, 쉬어 갈 곳. 정보는 비어 있거나 오래됐을 수 있다. 지도는 같아도 오늘 먼저 보고 싶은 항목은 달라졌다.',
    '사진에 입구가 잘 나오지 않아 문턱이 있는지 알 수 없다. 화장실 안내도 찾아봐야겠다.'
  ], () => [
    act('S13-check', '필요한 접근 정보를 먼저 확인한다', '확인한 것과 모르는 것을 따로 남기기', { accessSource: 'planned-cafe', access: { toilet: 'unknown', threshold: 'confirmed-fiction-phone', distance: 'map-estimate', rest: 'confirmed-fiction-phone' }, addMinutes: 8, facts: ['전화로 입구와 쉬는 곳을 확인했다', '화장실은 미확인, 거리는 지도 추정으로 남겼다'] }, ['전화로 입구와 잠깐 앉을 곳을 확인한다. 화장실 정보는 답을 얻지 못해 “미확인”으로 남긴다. 거리 역시 지도 추정치다.', '준비에 시간이 더 들었지만 입구와 쉴 곳은 알게 됐다. 화장실은 아직 확인하지 못했고, 거리는 지도에 나온 예상치다.'], '문턱·휴식: 확인 / 화장실: 미확인 / 거리: 지도 추정', { focus: 'observe' }),
    act('S13-known', '조건을 확인한 가까운 곳을 고른다', '선택 폭은 줄지만 계획은 구체적으로', { accessSource: 'nearby-cafe', access: { toilet: 'confirmed-fiction-phone', threshold: 'confirmed-fiction-phone', distance: 'known-fiction-route', rest: 'confirmed-fiction-phone' }, plan: { destination: '조건을 확인한 가까운 곳' }, facts: ['가까운 곳의 화장실·문턱·거리·쉴 곳을 확인한 내용을 적었다'] }, ['가까운 곳의 화장실 위치와 문턱, 쉴 곳을 문의하고 적어 둔다. 거리는 알고 있는 길을 기준으로 확인한다.', '사진으로 봤던 가게는 이번에 가지 않기로 한다. 가까운 곳은 입구와 쉴 자리까지 알게 돼 준비하기가 조금 수월하다.'], '가까운 곳 / 화장실·문턱·거리·쉴 곳 확인', { focus: 'outing' }),
    act('S13-onsite', '가 보고 현장에서 판단하기로 한다', '기대는 유지하고 변경 가능성도 남기기', { accessSource: 'planned-cafe', access: { toilet: 'unknown', threshold: 'unknown', distance: 'map-estimate', rest: 'unknown' }, facts: ['현장 판단을 계획하고 접근 정보의 미확인 상태를 유지했다'] }, ['사진 속 장소를 후보에 둔다. 화장실과 문턱, 쉴 곳은 아직 모른다고 표시하고 현장에서 계획을 바꿀 수도 있다고 적는다.', '사진 속 풍경은 여전히 가 보고 싶다. 아직 출발 전이다. 확인하지 못한 곳은 현장에서 살펴보고, 필요하면 계획을 바꾸기로 한다.'], '현장 판단 계획 / 화장실·문턱·휴식 미확인 / 거리 추정', { focus: 'create' })
  ]);

  function eligible(def, context) {
    const needs = def.eligibility;
    if (needs.location && !needs.location.includes(context.location)) return `위치 조건 불일치: ${context.location}`;
    if (needs.outing && !context.outing) return '실제 외출 이력이 현재 동선에 없음';
    if (needs.companion && needs.companion !== context.companion) return '해당 동행이 함께 있지 않음';
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
        act(`${id}-message`, '친구에게 별일 없는 안부를 보낸다', '답장은 나중에 확인하기', { conversations: ['집에서 친구에게 별일 없는 안부를 보냈다. 답장은 아직 모른다.'], facts: ['친구에게 안부를 보낸 뒤 휴대전화를 내려놓았다'] }, ['“점심 뭐 먹어?” 안부를 보낸다. 답장은 아직 오지 않았다.', '휴대전화를 내려놓고 내 점심도 생각한다. 답장은 나중에 확인하기로 한다.'], '집 · 짧은 안부 전송 / 답장은 아직 미정', { effect: 'phone', focus: 'shared', motion: mm('phone', 'room', '짧은 안부를 보내고 휴대전화를 내려놓는다.') }),
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
      act('REFLECT-request', '미뤘던 물과 식기를 지금 부탁한다', '물을 마시고 기록 마치기', { needs: { water: 'received', utensils: 'received' }, requests: [request('미뤘던 물과 식기를 다시 요청')], facts: ['미뤘던 물과 식기를 마지막에 요청해 실제로 받았다'] }, ['미뤘던 물과 식기를 다시 부탁한다. 잠시 뒤 테이블에 물과 식기가 놓인다.', '물을 한 모금 마시고 오늘의 기록을 마무리한다. 부탁을 미뤘던 시간도 함께 떠오른다.'], '재요청 뒤 물·식기 실제 수령', { focus: 'shared' }),
      act('REFLECT-change-order', '물을 부탁하고 남은 음식은 포장한다', '식기는 필요 없는 방식으로 변경', { needs: { water: 'received', utensils: 'not-needed' }, requests: [request('물과 남은 음식 포장 요청')], facts: ['물은 받고 남은 음식은 포장했다', '식기는 포장 방식으로 필요 없어졌다'] }, ['물은 부탁해 받고 남은 음식은 포장한다. 남은 음식은 집에서 먹기로 했다. 여기서는 식기를 더 쓸 일이 없다.', '물을 한 모금 마시고 포장된 음식을 챙긴다. 이제 집으로 갈 길을 확인한다.'], '물 수령 / 음식 포장 / 식기는 미수령·불필요로 변경', { focus: 'create' }),
      act('REFLECT-unresolved', '더 부탁하지 않고 식사를 마친다', '물과 식기는 받지 못한 채로 두기', { facts: ['물을 받지 않은 미해결 요청을 그대로 기록했다'] }, ['더 부탁하지 않고 식사를 마친다. 물과 식기는 받지 못했다. 말을 꺼내려다 망설였던 일이 생각난다.', '물을 받지 못했다고 메모한다. 부탁하지 않아 편했던 것만은 아니다. 다음에는 어떻게 말할지 잠깐 생각한다.'], '물·식기 미수령 상태로 기록 / 해결했다고 쓰지 않음')
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
    node.choiceIds = node.choices.map(ch => ch.id);
    node.choices = node.choices.map(ch => ({ ...ch, followUpText: [...ch.followUpText], journalTrace: ch.journalTrace, contrastVariant: node.contrastVariant }));
    return node;
  }
  function prepare(s) {
    const node = getNode(s);
    if (!node) { s.scene = 'end'; return s; }
    s.scene = node.sceneId;
    if (node.sceneId === 'S06') s.context.items.cardLocation = 'floor';
    if (node.sceneId === 'S09') s.context.seat.visibleEmpty = 'high-only';
    if (node.sceneId === 'S10') { s.context.needs.water = 'pending'; s.context.needs.utensils = 'pending'; }
    if (!node.eligibility.matched) s.context.skipped.push({ sceneId: node.eligibility.requestedSceneId, reason: node.eligibility.reason });
    return s;
  }
  function applyEffects(context, effects) {
    const c = clone(context);
    for (const key of ['location', 'outing', 'returned', 'returnReason', 'accessSource', 'companion']) if (hasOwn(effects, key)) c[key] = effects[key];
    for (const key of ['entrance', 'environment', 'seat', 'items', 'needs', 'help', 'plan', 'access', 'day']) if (effects[key]) c[key] = { ...c[key], ...clone(effects[key]) };
    if (effects.socialPatch) c.social = { ...c.social, ...effects.socialPatch };
    for (const key of ['requests', 'unspoken', 'conversations']) if (effects[key]) c.social[key].push(...clone(effects[key]));
    if (effects.facts) c.facts.push(...effects.facts);
    if (effects.addMinutes) c.plan.timeMinutes += effects.addMinutes;
    if (effects.detourMeters) c.plan.detourMeters += effects.detourMeters;
    return c;
  }
  return { SCENARIOS, SCENARIO_VERSION, normalizeStart, freshContext, getNode, prepare, applyEffects, definitions };
});
