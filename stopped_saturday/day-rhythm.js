(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaturdayDayRhythm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY_PLAN = ['R01', 'core', 'core', 'R02', 'core', 'R03', 'core', 'R04', 'R05', 'core', 'R06', 'R07'];
  const START_MINUTE = 10 * 60 + 12;
  function formatTime(minute) {
    const day = Math.floor(minute / 1440);
    const clock = ((minute % 1440) + 1440) % 1440;
    const hour = Math.floor(clock / 60);
    return `${day ? '다음 날 ' : ''}${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(clock % 60).padStart(2, '0')}`;
  }
  const durations = {
    'morning-outside': 7, 'morning-inside': 8, 'morning-contact': 5, 'morning-window': 6,
    'outside-ride': 35, 'outside-access': 18, 'outside-reroute': 25, 'outside-door': 15,
    'inside-puzzle': 50, 'inside-write': 40, 'inside-video': 28, 'inside-listen': 45,
    'contact-message': 6, 'contact-help': 12, 'contact-call': 30, 'contact-draft': 25,
    'window-photos': 15, 'window-story': 25, 'window-rest': 20, 'window-route': 18,
    'outing-stairs': 25, 'outing-elevator': 15, 'outing-pickup': 45, 'outing-delivery': 55,
    'lunch-reroute': 50, 'lunch-note': 15, 'lunch-rest': 35, 'lunch-ask': 55,
    'afternoon-flow': 60, 'afternoon-share': 12, 'afternoon-rest': 45, 'afternoon-create': 35,
    'evening-reflect': 12, 'evening-future': 8, 'evening-close': 45, 'evening-voice': 15,
    'S01-bottle': 6, 'S01-split': 14, 'S01-table': 4, 'S01-help': 9,
    'S02-ask': 3, 'S02-wait': 4, 'S02-side': 7, 'S02-auto-enter': 2, 'S02-auto-pause': 4, 'S02-auto-side': 6,
    'S03-coordinate': 6, 'S03-notify-wait': 9, 'S03-leave': 20,
    'S04-thanks': 5, 'S04-say-slow': 6, 'S04-next': 10,
    'S05-staff': 9, 'S05-another': 18, 'S05-home': 20,
    'S06-ask': 4, 'S06-pause': 7, 'S06-phone': 5,
    'S07-all': 20, 'S07-cup': 12, 'S07-decline': 16,
    'S08-planned': 20, 'S08-near': 10, 'S08-later': 12,
    'S09-ask': 8, 'S09-wait': 15, 'S09-takeout': 22,
    'S10-all': 8, 'S10-separate': 12, 'S10-defer': 5,
    'S11-slower': 15, 'S11-stop': 20, 'S11-own': 12,
    'S12-elevator': 12, 'S12-confirm': 15, 'S12-home': 20,
    'S13-check': 18, 'S13-known': 15, 'S13-onsite': 12,
    'REFLECT-note': 12, 'REFLECT-next': 8, 'REFLECT-close': 35,
    'REFLECT-request': 10, 'REFLECT-change-order': 15, 'REFLECT-unresolved': 8
  };
  function durationForChoice(choice) {
    if (Number.isInteger(choice.durationMinutes)) return choice.durationMinutes;
    if (durations[choice.id]) return durations[choice.id];
    if (/^HOME-/.test(choice.id)) return /listen/.test(choice.id) ? 5 : /playlist/.test(choice.id) ? 20 : /quiet/.test(choice.id) ? 40 : 12;
    throw new Error(`소요 시간이 없는 선택: ${choice.id}`);
  }
  const move = (kind, location, caption) => ({ kind, location, caption });
  const act = (id, title, note, durationMinutes, lines, trace, extra = {}) => ({
    id, title, note, durationMinutes, followUpText: lines, journalTrace: trace,
    effects: { facts: [trace] }, effect: 'neutral', energy: 0, mood: 0, focus: 'observe', weight: 1,
    motion: move('sit', 'room', title), ...extra
  });
  function returnMinutes(s) {
    const metres = s.context.plan.returnMeters || (s.context.outing ? 300 : 0);
    return metres ? Math.max(8, Math.ceil((metres + s.context.plan.detourMeters) / 25)) : 0;
  }
  function returnText(s) {
    const metres = s.context.plan.returnMeters || 300;
    const extra = s.context.plan.detourMeters || 0;
    return `집으로 돌아가는 거리는 ${metres}m다. 오늘 길을 돌아가느라 ${extra}m를 더 이동했고, 준비하고 기다리는 데 ${s.context.plan.timeMinutes}분이 걸렸다. ${extra ? '돌아올 때도 확인한 우회로를 이용했다. ' : ''}집에 돌아오는 데는 ${returnMinutes(s)}분이 걸렸다.`;
  }
  function getNode(s) {
    const id = DAY_PLAN[s.decisions.length];
    if (!id || id === 'core') return null;
    const outside = s.context.outing;
    const location = outside ? (s.context.location === 'street' ? 'street' : 'hall') : 'room';
    const seated = !outside || s.context.seat.mode === 'seated' || s.context.day?.seated;
    const pending = s.context.needs.water === 'pending' || s.context.needs.utensils === 'pending';
    const continuingRest = s.choiceIds.includes('evening-close') || s.choiceIds.includes('REFLECT-close');
    let title, lines, choices;
    if (id === 'R01') {
      title = outside ? '입구에서 먼저 확인할 것' : '일어나기 전에 필요한 것';
      lines = outside ? ['가방에 넣어 둔 휴대전화가 생각난다. 꺼내려다 목발 손잡이를 다시 쥔다. 일단 어디에 비켜 설 수 있을지 입구부터 본다.', '여기서 가방까지 열면 손이 더 모자라겠다. 들어가기 전에 무엇부터 해야 할까.'] : ['병원에서 돌아온 뒤 처음 맞는 주말이다. 깁스를 한 오른다리 위치를 고치고 다시 등받이에 기댄다. 앉을 자리만 잡는 데도 몇 분이 지났다.', '휴대전화에 손을 뻗었다가 바닥에 떨어진 충전선 끝을 본다. 저것도 주워야 하는데. 물병과 휴지도 가져다 놓으면 덜 일어나도 되겠다.'];
      choices = outside ? [
        act('R01-check', '입구와 기다릴 공간을 먼저 살핀다', '서 있는 자리에서 안내 표지 확인', 4, ['가방 지퍼에서 손을 떼고 안내 표지를 읽는다. 문을 드나드는 사람들을 보며 내가 비켜 있을 만한 곳을 찾는다.', '안쪽에 앉을 자리가 있는지는 여기서 보이지 않는다. 시선이 다시 문으로 간다. 우선 저 문부터 지나야 한다.'], '입구에서 안내와 대기 공간을 살펴봄', { motion: move('stand', location, '입구 안내와 드나드는 방향을 살핀다.') }),
        act('R01-message', '기다리는 사람에게 도착했다고 알린다', '이동 중에는 답장을 재촉하지 않기', 6, ['벽 옆의 넓은 곳에 멈춰 “도착했어”라고 보낸다. 잠깐 생각하다 “아직 입구 앞이야”를 덧붙인다.', '휴대전화를 넣고 다시 문을 본다. 도착했다고는 알렸는데, 나는 아직도 문 앞이다.'], '입구에 도착했다고 연락함', { effect: 'phone', focus: 'shared', motion: move('stand', location, '입구 옆에서 도착 메시지를 보낸다.') }),
        act('R01-ask-seat', '잠깐 앉을 곳이 있는지 묻는다', '안내받은 바깥 의자에서 손 쉬기', 12, ['직원에게 입구 밖에서 잠깐 앉을 곳이 있는지 묻는다. 안내받은 의자에 앉아 손잡이에서 손을 뗀다.', '손바닥을 펴 보니 눌린 곳이 얼얼하다. 잠깐 쉰 뒤 다시 입구 앞에 선다.'], '안내받은 바깥 의자에서 잠깐 쉼', { effect: 'rest', energy: 1, focus: 'rest', motion: move('stand', location, '바깥 의자에서 쉰 뒤 입구 앞에 선다.') })
      ] : [
        act('R01-check', '손 닿는 곳의 물건부터 정리한다', '몸을 멀리 뻗지 않고 가까운 물건만', 8, ['소파 옆 탁자의 휴대전화와 휴지를 정리한다. 바닥의 충전선은 지금 손을 뻗어 잡지 않고 그대로 둔다.', '다음에 일어날 때 가져올 것을 적는다. 충전선은 바로 발치인데, 손으로 잡으려면 생각보다 멀다.'], '소파 옆 물건을 정리하고 필요한 것을 메모함'),
        act('R01-message', '함께 사는 사람에게 충전선을 부탁한다', '필요한 물건 하나를 구체적으로 말하기', 6, ['바닥의 충전선 끝을 탁자 위에 올려 달라고 부탁한다. 상대가 선을 올려 주고 다른 필요한 것이 있는지 묻는다.', '“우선 이것만.” 선을 꽂고 충전 표시가 뜨는 것을 본다. 다시 등을 기댄다.'], '부탁해서 충전선을 손 닿는 곳에 둠', { focus: 'shared' }),
        act('R01-ask-seat', '쿠션 위치를 고치고 조금 더 앉아 있는다', '새로 움직이기 전에 자세부터', 15, ['쿠션을 가까이 당겨 등을 받친다. 깁스가 의자 가장자리에 걸리지 않도록 앉은 자리를 고친다.', '몇 분 더 앉아 있다 보니 어깨에 들어간 힘이 조금 풀린다. 이제 무엇을 할지 생각해 본다.'], '쿠션과 앉은 자세를 고쳐 쉬었음', { effect: 'rest', energy: 1, focus: 'rest', motion: move('rest', 'room', '쿠션에 기대어 몸을 쉬게 한다.') })
      ];
    } else if (id === 'R02') {
      title = '다음 일을 하기 전에';
      lines = [outside ? '다음으로 갈 곳을 보다가 목발 손잡이를 고쳐 쥔다. 얼마 움직이지 않은 것 같은데 팔과 손이 바쁘다. 출발하기 전에 잠깐 멈춘다.' : '하던 일에서 눈을 떼고 등을 펴 본다. 오전부터 같은 자세였는지 움직임이 뻣뻣하다.', '휴대전화 배터리를 확인하다가 메뉴 앱에서 손이 멈춘다. 지금 먹을까, 조금 쉬었다가 생각할까.'];
      choices = [
        act('R02-food', '메뉴와 주문 방법을 미리 살펴본다', '아직 주문하지 않고 먹을 것 고르기', 15, ['메뉴 사진을 넘기다가 두 가지를 남긴다. 가격과 받는 방법을 보고 하나를 다시 지운다. 처음 끌렸던 것과는 다른 메뉴다.', '주문 버튼은 누르지 않는다. 받아 놓고 들고 갈 수 없으면 곤란하다. 어디에 앉아 먹을지도 봐야겠다.'], '식사 후보와 주문 방법을 살펴봄', { effect: 'phone', focus: 'outing', motion: move(seated ? 'phone' : 'stand', location, '현재 자리에서 메뉴와 주문 방법을 확인한다.') }),
        act('R02-pause', '편하게 앉을 곳을 확인하고 손을 쉰다', '밖에서는 안내받은 휴게 자리 이용', 20, [outside && !seated ? '잠깐 앉을 곳을 물어 안내받은 휴게 의자로 간다. 다음 이동을 하기 전에 손잡이를 놓고 손을 편다.' : '등을 기대고 손을 편다. 무엇을 더 할지 정하기 전에 잠깐 쉬고 싶다.', '휴대전화는 잠시 넣어 둔다. 손이 조금 편해져도 다시 목발을 잡을 때는 눌린 곳이 신경 쓰인다.'], '다음 이동 전에 앉아서 손을 쉬었음', { effects: { day: { seated: true }, facts: ['안내받은 자리에서 손과 팔을 쉬었다'] }, effect: 'rest', energy: 1, focus: 'rest', motion: move('rest', location, '휴게 자리에 앉아 손과 팔을 쉰다.') }),
        act('R02-plan', '앞으로 필요한 이동을 짧게 적는다', '확인한 길과 아직 모르는 곳 구분', 7, ['어디까지 갔다가 어디로 돌아올지 적는다. 아직 확인하지 않은 출입구는 물음표로 남긴다.', '메모를 저장하고 화면을 한 번 더 본다. 아직 물음표가 남아 있다. 지금 확인할 수 있는 곳부터 찾아봐야겠다.'], '다음 이동과 미확인 출입구를 메모함', { effect: 'phone', focus: 'observe', motion: move(seated ? 'phone' : 'stand', location, '현재 자리에서 다음 이동을 메모한다.') })
      ];
    } else if (id === 'R03') {
      title = '잠깐 앉아서 할 일';
      lines = [s.context.day?.ate ? '먹고 나니 당장 일어나고 싶지는 않다. 조금 더 앉아 있으면서 무언가 듣거나 볼까.' : '준비하고 움직이는 일을 몇 번 했더니 자꾸 앉을 곳부터 찾게 된다. 자리를 확인하고 잠깐 시간을 보내기로 한다.', pending ? '물과 식기는 아직 받지 못했다. 빈자리를 한 번 더 보고 휴대전화로 시선을 돌린다. 다시 부탁할 말은 아직 고르지 못했다.' : '이 자리에서도 할 수 있는 일이 있겠지. 휴대전화 화면을 천천히 넘긴다.'];
      const seatText = outside && !seated ? '잠깐 앉아도 되는 자리를 물어 안내받아 앉는다. ' : '';
      choices = [
        act('R03-radio', '라디오 인터뷰 한 편을 듣는다', '중간에 화면을 보지 않아도 되는 이야기', 35, [`${seatText}이어폰으로 라디오 인터뷰를 튼다. 화면에서 손을 떼도 이야기는 계속된다. 팔을 편히 놓고 듣는다.`, '진행자가 마지막 질문을 꺼낸다. 조금 전 답변이 궁금해 끝까지 듣는다. 끝나는 음악이 나온 뒤에도 그 대목을 한 번 더 생각한다.'], '라디오 인터뷰 한 편을 들었음', { effect: 'rest', energy: 1, focus: 'observe', motion: move('rest', location, '앉아서 라디오 인터뷰를 듣는다.') }),
        act('R03-puzzle', '짧은 퍼즐 몇 개를 풀어본다', '작은 화면을 가까이 들지 않기', 40, [`${seatText}휴대전화를 받쳐 두고 퍼즐을 시작한다. 첫 문제는 금방 풀린다. 세 번째에서는 같은 칸을 몇 번이나 눌렀다 되돌린다.`, '힌트를 한 번 보고 마지막 문제를 푼다. 손을 떼고 등을 펴자 뻣뻣하다. 시계를 보니 생각보다 오래 앉아 있었다. 한 문제 더 하고 싶지만 먼저 자세를 고친다.'], '짧은 퍼즐 세 개를 풀었음', { effect: 'desk', energy: -1, mood: 1, focus: 'flow', motion: move('desk', location, '화면을 받쳐 두고 퍼즐을 푼다.') }),
        act('R03-snack', '간단히 먹을 것을 챙겨 먹는다', '한 번에 옮기지 않고 앉은 자리에서 받기', 30, [outside ? `${seatText}직원에게 앉은 자리에서 받을 수 있는 간단한 음식을 주문한다. 가져다준 음식을 먹으며 잠깐 쉰다.` : '집에 있던 음식 중 바로 먹을 수 있는 것을 고른다. 손에 집기 전에 어디에 놓고 먹을지부터 정한다. 가까이에 두고 앉아서 먹는다.', '몇 입 먹고 나니 다른 것도 해보고 싶어진다. 가까운 포장만 접어 모은다. 나머지까지 치우려다 손을 거두고 조금 더 앉아 있는다.'], '앉은 자리에서 간단한 음식을 먹었음', { effects: { day: { ate: true, seated: true }, facts: ['앉은 자리에서 간단한 음식을 먹었다'] }, effect: 'settle', energy: 1, focus: 'rest', motion: move('sit', location, '앉은 자리에서 간단한 음식을 먹는다.') })
      ];
      for (const ch of choices) ch.effects.day = { ...ch.effects.day, seated: true };
      // The classic fourth scene begins at home; this transition now happens explicitly.
      if (s.scenarioId === 'classic' && outside) for (const ch of choices) {
        ch.durationMinutes += returnMinutes(s);
        ch.followUpText.push(`앉아서 하던 일을 마친 뒤 친구와 집으로 돌아온다. ${returnText(s)}`);
        ch.effects = { ...ch.effects, location: 'home', outing: false, returned: true, returnReason: '잠깐 쉬고 친구와 귀가', facts: [...ch.effects.facts, returnText(s)] };
        ch.effect = 'walk';
        ch.energy -= 1;
        ch.motion = move('walk', 'room', '친구와 집에 돌아와 의자에 앉는다.');
      }
    } else if (id === 'R04') {
      title = '조금 오래 해보고 싶은 일';
      lines = [s.flags.includes('flow') || s.choiceIds.includes('R03-puzzle') ? '아까 풀던 문제를 다시 떠올린다. 그 칸을 먼저 옮겼으면 어땠을까. 조금 더 해보고 싶다.' : '무언가 시작했다가 다음 할 일을 생각하느라 자꾸 그만뒀다. 이번에는 한 가지를 좀 오래 해보고 싶다.', pending ? '물과 식기를 부탁할 말이 자꾸 입안에서 맴돈다. 아직 말하지 못한 채 화면을 다시 본다.' : '앉은 자세를 한 번 고친다. 조금 더 해보다가 몸이 불편하면 다시 멈춰야겠다.'];
      const before = outside && !seated ? '직원에게 이용할 수 있는 의자를 물어 안내받아 앉는다. ' : '';
      choices = [
        act('R04-project', '작은 게임이나 글을 한 시간 더 만든다', '완성할 부분을 한 가지로 줄이기', 60, [`${before}문장 한 단락이나 화면 하나만 정해 손을 댄다. 고친 부분을 다시 보다가 다음 줄도 조금 바꾼다. 중간에 손을 쉬고 와도 이어 할 곳이 보인다.`, '저장을 누르고 손을 내려놓는다. 조금 전까지 막히던 부분이 달라져 있다. 아직 남은 곳은 그대로 두고, 다음에 이어 할 위치만 다시 본다.'], '작은 글이나 게임 작업을 한 시간 이어감', { effect: 'desk', energy: -1, mood: 1, focus: 'create', motion: move('desk', location, '작은 작업 하나를 정해 한 시간 동안 이어간다.') }),
        act('R04-show', '보고 싶었던 영화 한 편을 본다', '중간에 자세를 바꾸며 보기', 100, [`${before}미뤄 두었던 영화를 튼다. 시작 화면이 나오는 동안 팔을 둘 자리를 고치고 화면을 받쳐 놓는다.`, '몸이 불편해 중간에 한 번 멈추고 자세를 고친다. 다시 재생하자 금방 이야기에 집중한다. 마지막 장면까지 본 뒤 영화 제목을 다시 확인한다.'], '중간에 자세를 고치며 영화 한 편을 봄', { effect: 'rest', energy: 1, mood: 1, focus: 'flow', motion: move('observe', location, '화면을 받쳐 놓고 영화 한 편을 본다.') }),
        act('R04-talk', '친구와 길게 통화한다', '근황을 듣고 내 이야기도 하기', 45, [`${before}친구에게 요즘 뭐 하며 지내는지 묻는다. 내 발목 이야기를 하다가 친구가 겪은 일로 넘어간다. 궁금해서 다시 묻다 보니 통화가 길어진다.`, '통화를 마치고 이어폰을 빼자 주변 소리가 또렷해진다. 이야기하는 동안 올라가 있던 어깨를 내린다. 재미있었는데 팔은 뻐근하다.'], '친구와 서로의 근황을 길게 이야기함', { effect: 'phone', mood: 1, focus: 'shared', motion: move('phone', location, '팔을 받치고 친구와 길게 통화한다.') })
      ];
      for (const ch of choices) ch.effects.day = { seated: true };
    } else if (id === 'R05') {
      title = s.minuteOfDay >= 17 * 60 ? '저녁은 어떻게 할까?' : '다음 끼니는 어떻게 할까?';
      lines = [s.context.day?.ate ? '아까 먹은 것이 아직 든든한지 가만히 생각한다. 메뉴를 보니 먹고 싶은 것은 있다. 지금 시킬까, 조금 더 있다가 먹을까.' : '아직 제대로 식사하지 못했다. 메뉴를 켜려다가 주변을 본다. 음식이 오면 어디에 놓아야 할까.', pending ? '물과 식기는 아직 받지 못했다. 식사를 시킬 때 함께 말하면 되겠지. 그 말을 또 꺼내려니 잠깐 망설여진다.' : '먹을 생각을 하니 치울 그릇과 포장까지 떠오른다. 일단 먹고, 가까운 것부터 정리하면 되겠다.'];
      choices = [
        act('R05-meal', '식사를 주문하고 필요한 것을 함께 부탁한다', '받는 곳과 물·식기까지 확인', outside ? 45 : 60, [outside ? '직원에게 식사를 주문하며 물과 식기도 함께 부탁한다. 빠뜨린 것이 없는지 한 번 더 생각한다. 잠시 뒤 테이블에 놓인 것을 확인하고 먹는다.' : '배민에서 주문을 마치고 도착할 때까지 쉰다. 집의 물과 식기를 가까이 준비한다. 도착한 음식 뚜껑을 열고 나서야 먹을 준비가 끝난다.', '다 먹고 남은 포장을 손 닿는 쪽으로 모은다. 이것만 치우면 될 줄 알았는데 한 번 더 일어나야 한다. 지금은 가까운 것만 정리한다.'], '식사와 물·식기를 받아 먹었음', { effects: { needs: { water: 'received', utensils: 'received' }, day: { ate: true }, requests: [{ by: '주인공', forWhat: '식사와 물·식기를 함께 요청' }], facts: ['식사와 물·식기를 실제로 받아 먹었다'] }, effect: 'settle', energy: 1, focus: 'shared', motion: move('sit', location, '식사와 물·식기를 받아 앉은 자리에서 먹는다.') }),
        act('R05-simple', outside ? '간단한 포장 음식으로 먹는다' : '집에 있던 음식으로 간단히 먹는다', outside ? '식기를 쓰지 않는 음식과 물 따로 받기' : '집에 있던 음식과 물병 준비하기', 40, [outside ? '손으로 먹을 수 있는 포장 음식을 고른다. 물도 부탁해 받은 뒤 포장을 벌린다. 식기를 따로 들지 않아도 돼 조금 덜 번거롭다.' : '집에 있던 간단한 포장 음식을 꺼내 먹는다. 뚜껑 있는 물병을 옆에 놓고, 한입 먹을 때마다 조금씩 마신다.', '식기를 따로 쓰지 않아 설거지할 것은 없다. 남은 포장을 가까운 봉투에 모으고 다시 등을 기댄다.'], outside ? '물과 간단한 포장 음식으로 식사함' : '집에 있던 음식과 물병으로 간단히 식사함', { effects: { needs: { water: 'received', utensils: 'not-needed' }, day: { ate: true }, facts: [outside ? '물을 받아 마시고 식기가 필요 없는 음식으로 먹었다' : '집에 있던 음식과 물병으로 간단히 식사했다'] }, effect: 'settle', energy: 1, focus: 'outing', motion: move('sit', location, '식기가 필요 없는 음식으로 간단히 먹는다.') }),
        act('R05-later', '지금은 주문하지 않고 더 쉰다', '식사와 필요한 부탁은 아직 미뤄 두기', 35, ['주문 화면을 보다가 잠근다. 지금은 고르는 일도 귀찮다. 자세를 조금 고쳐 더 쉰다.', pending ? '아직 물도 못 마셨다. 여전히 목이 마르다. 조금 있다가 다시 부탁해야겠다.' : '끼니는 아직 못 챙겼다. 조금 더 배가 고파지면 그때 준비해야겠다.'], '식사를 주문하지 않고 더 쉬었음', { effect: 'rest', energy: 1, focus: 'rest', motion: move('rest', location, '주문을 미루고 잠시 더 쉰다.') })
      ];
    } else if (id === 'R06') {
      title = '편하게 머무를 자리';
      lines = [continuingRest ? '이제부터는 쉬기로 했다. 뭔가 더 해야 하나 싶다가도 등받이에 다시 몸을 기댄다. 지금은 편한 자리를 찾고 싶다.' : '몇 가지 해보고 나니 당장은 더 고르고 싶은 일이 없다. 편히 앉아서 조금 느긋하게 있고 싶다.', '발목은 여전히 신경 쓰인다. 팔을 내려놓을 곳을 찾고 등받이에 기대 본다. 다시 일어나지 않아도 될 만큼 물건이 가까이 있는지도 본다.'];
      choices = [
        act('R06-rest', '조용히 기대어 쉬고 싶다', '화면을 보지 않고 자세를 바꾸며 쉬기', 60, ['쿠션에 기대고 눈을 감아 본다. 잠이 오지는 않는다. 발목이 신경 쓰이면 앉은 자세를 조금 고치고 다시 눈을 쉰다.', '한동안 그러고 있었다. 심심해서 눈을 뜨기도 한다. 그래도 손잡이를 쥐지 않고 손을 펴 두니 편하다.'], '화면을 보지 않고 한 시간 쉬었음', { effect: 'rest', energy: 2, focus: 'rest', motion: move('rest', 'room', '쿠션에 기대어 한 시간 동안 쉰다.') }),
        act('R06-album', '편하게 앉아 앨범 한 장을 듣는다', '노래를 고른 뒤에는 손 쉬기', 45, ['좋아하는 앨범을 처음부터 튼다. 익숙한 첫 소절이 나와 화면에서 손을 뗀다. 다음 곡은 고르지 않고 그대로 듣는다.', '마지막 곡이 끝난 뒤 잠깐 조용해진다. 다른 곡을 틀까 하다가 손을 그대로 둔다. 조금 더 이렇게 앉아 있고 싶다.'], '쉬면서 앨범 한 장을 들었음', { effect: 'rest', energy: 1, focus: 'observe', motion: move('rest', 'room', '앉은 자리에서 앨범을 들으며 쉰다.') }),
        act('R06-company', '누군가와 함께 앉아 쉬고 싶다', '전화는 받쳐 두고 편히 이야기하기', 40, ['같이 쉬고 싶어 친구에게 영상 통화를 건다. 휴대전화를 받쳐 놓고 각자 편한 자리에서 이야기한다.', '잠깐 서로 말이 없다. 무슨 이야기를 더 할지 찾다가 그냥 둔다. 통화가 끝난 뒤에도 바로 일어나지 않고 앉아 쉰다.'], '영상 통화로 함께 쉬는 시간을 보냄', { effect: 'rest', energy: 1, focus: 'shared', motion: move('phone', 'room', '전화기를 받쳐 놓고 친구와 함께 쉰다.') })
      ];
    } else {
      title = '다음에 일어날 때를 생각하며';
      lines = ['지금 당장 잠들 필요는 없다. 앉아서 주변을 둘러본다. 다음에 일어날 때 또 이것저것 찾지 않도록 조금 정리해 둘까.', '목발을 다시 잡으려니 손바닥이 아직 얼얼하다. 여기서 닿는 것만 옮겨도 될 것 같은데. 멀리 있는 것은 누군가에게 부탁할까.'];
      choices = [
        act('R07-near', '휴대전화와 물병을 가까이 둔다', '손 닿는 물건만 정리하기', 6, ['휴대전화와 물병을 가까운 탁자 위에 둔다. 충전선이 목발을 세워 둔 쪽으로 늘어지지 않도록 정리한다.', '등을 기대고 물병에 손이 닿는지 한 번 확인한다. 이제 물을 마시려고 다시 일어나지는 않아도 된다.'], '휴대전화와 물병을 가까운 탁자에 정리함', { effect: 'settle', focus: 'rest', motion: move('sit', 'room', '가까운 물건만 정리하고 편히 앉는다.') }),
        act('R07-ask', '멀리 있는 물건 하나를 부탁한다', '무엇을 어디에 놓을지 구체적으로 말하기', 10, ['필요한 담요를 소파 옆에 놓아 달라고 부탁한다. 가져다준 담요를 받아 다치지 않은 쪽 다리부터 덮는다.', '고맙다고 말하고 담요 끝을 고른다. 조금 전부터 가져오고 싶었던 것인데, 이제 가까이에 있다.'], '부탁해서 담요를 받아 가까이 둠', { effect: 'rest', focus: 'shared', motion: move('rest', 'room', '부탁해서 받은 담요를 가까이 두고 쉰다.') }),
        act('R07-leave', '정리는 나중에 하고 그대로 쉰다', '지금 더 움직이지 않기', 20, ['지금 꼭 옮겨야 할 물건은 없다. 정리는 나중에 하기로 하고 편히 기대어 앉는다.', '어깨에 들어간 힘을 빼고 조금 더 앉아 있는다. 불편한 곳은 남아 있지만, 당장은 자세를 다시 바꾸고 싶지 않다.'], '정리를 미루고 앉은 자리에서 더 쉬었음', { effect: 'rest', energy: 1, focus: 'rest', motion: move('rest', 'room', '정리를 미루고 앉은 자리에서 쉰다.') })
      ];
    }
    if (id === 'R05' && !outside) {
      choices[0].effects.requests = [{ by: '주인공', forWhat: '식사 배달 주문' }];
      choices[0].effects.facts = ['배달받은 식사와 집에서 준비한 물·식기로 먹었다'];
      choices[1].effects.facts = ['집에서 물을 마시고 식기가 필요 없는 포장 음식으로 먹었다'];
    }
    if (id === 'R05' && s.context.order) for (const ch of choices.slice(0, 2)) ch.effects.order = { ...s.context.order, status: 'paid', method: outside ? 'staff-later-meal' : 'home-meal', menuConfirmed: true };
    let encounter;
    if (id === 'R02' && outside && ['cafe', 'lobby'].includes(s.context.location) && s.initialConditions.orderMode === 'kiosk') {
      const ordered = s.context.order?.status === 'paid';
      title = ordered ? '주문 내역과 받을 자리' : '키오스크 메뉴를 먼저 보려는데';
      lines = ordered
        ? ['키오스크에서 주문과 결제는 끝냈다. 메뉴를 제대로 골랐는지 조금 마음에 걸린다. 어디에서 받는지도 다시 확인하고 싶다.', '음식이 나올 쪽을 보다가 목발을 쥔 두 손을 내려다본다. 받아서 어디로 가지. 앉을 자리와 옮길 방법을 아직 정하지 못했다.']
        : ['메뉴를 보려고 키오스크 앞에 선다. 작은 글씨가 잘 안 보여 조금 가까이 보려다 멈춘다. 양손은 여전히 목발 손잡이를 잡고 있다.', '위쪽 버튼에 손을 뻗으려다 어깨가 당긴다. 뒤에 사람이 기다리니 읽는 것조차 서두르게 된다. 아직 주문하거나 결제하지는 않았다.'];
      encounter = { kind: 'kiosk' };
      choices[0] = { ...choices[0], title: ordered ? '결제한 주문 내역만 확인한다' : '메뉴를 보여 달라고 부탁하고 먹고 싶은 것만 골라 둔다', note: ordered ? '추가 주문 없이 메뉴와 받을 위치 확인' : '누르기 어려운 화면은 직원에게 보여 달라고 하기', durationMinutes: ordered ? 7 : 12, effect: 'standing', effects: { ...choices[0].effects, requests: [{ by: '주인공', forWhat: ordered ? '결제한 주문 내역과 받을 위치 확인' : '키오스크 메뉴를 확인하기 위한 화면 도움 요청' }], facts: [ordered ? '결제한 주문 내역만 확인하고 추가 주문하지 않았다' : '직원에게 메뉴 화면을 보여 달라고 부탁하고 후보만 골랐다'] }, followUpText: ordered ? ['직원에게 이미 결제한 주문의 메뉴와 받을 위치를 확인한다. 화면에 뜬 추가 메뉴는 선택하지 않는다.', '주문 내용은 맞다. 추가로 주문하지 않고 화면에서 눈을 뗀다. 이제는 앉을 곳과 음식 받을 방법을 확인해야 한다.'] : ['메뉴 화면을 보여 달라고 부탁한다. 직원이 넘겨 주는 화면을 보고 “잠깐만요” 하고 멈춘다. 먹고 싶은 것 두 가지만 기억해 둔다.', '주문 버튼은 아직 누르지 않는다. 메뉴는 골랐는데, 음식이 나오면 어떻게 가져가지. 앉을 자리를 먼저 봐야겠다.'], journalTrace: ordered ? '기존 결제 내역 확인 · 추가 주문 없음' : '키오스크 메뉴 도움 요청 · 후보만 선택·미주문', motion: { ...move('stand', location, ordered ? '이미 결제한 주문 내역만 확인한다.' : '직원에게 메뉴 화면을 보여 달라고 부탁한다.'), encounter } };
      choices[1] = { ...choices[1], followUpText: ['키오스크 앞에서 메뉴 읽기를 잠깐 그만둔다. 앉을 곳을 물어 안내받은 휴게 의자에서 손잡이를 놓고 쉰다.', ordered ? '주문은 이미 끝냈다. 손잡이에서 뗀 손을 펴 본다. 앉아서 음식이 나오기를 기다린다.' : '아직 주문하지 않았다. 조금 전 화면이 떠오르지만 당장은 손을 더 쉬고 싶다. 어떤 방식으로 주문할지는 잠시 뒤 생각한다.'] };
      choices[2] = { ...choices[2], title: '자리와 음식 받는 방법을 먼저 적는다', note: '주문하기 전에 음식 들고 갈 방법부터', followUpText: ['화면에서 한 걸음 물러나 앉을 자리와 음식 받을 곳을 메모한다. “봉투랑 음료는 어떻게 들고 가지?” 메모에 물음표가 하나 더 붙는다.', ordered ? '이미 결제한 주문은 그대로 둔다. 추가로 주문하지 않고 받을 방법을 생각한다.' : '주문은 아직 하지 않았다. 메뉴를 고르는 것과 음식을 옮기는 것은 따로 정해야 한다.'], journalTrace: '음식 받을 방법과 앉을 곳 메모 · 주문 변경 없음', motion: { ...move(seated ? 'phone' : 'stand', location, '키오스크에서 비켜서 음식 받을 방법을 메모한다.'), encounter } };
    }
    return { sceneId: id, title, time: formatTime(s.minuteOfDay), step: s.decisions.length + 1, lines, choices, choiceIds: choices.map(ch => ch.id), eligibility: { eligible: true, matched: true, requestedSceneId: id }, contrastVariant: null, isRhythm: true, ...(encounter ? { encounter } : {}) };
  }
  return { DAY_PLAN, START_MINUTE, DAY_LENGTH: DAY_PLAN.length, formatTime, durationForChoice, returnMinutes, returnText, getNode };
});

