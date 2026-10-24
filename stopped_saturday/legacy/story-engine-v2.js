(function (root, factory) {
  'use strict';
  const scenes = typeof module === 'object' && module.exports ? require('./scenario-scenes-v2.js') : root.SaturdayScenesV2;
  const api = factory(scenes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaturdayStoryV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (scenes) {
  'use strict';
  // These are authored sensations for one fictional day, not clinical pain scores.
  const BODY_KEYS = ['ankle', 'shoulder', 'back', 'underarm', 'palm', 'goodLeg'];
  const ENDING_KEYS = ['flow', 'shared', 'outing', 'rest', 'observe', 'create'];
  const clamp = n => Math.max(0, Math.min(10, n));
  const baseState = () => ({
    scene: 'morning', step: 1, energy: 6, mood: 4, route: null,
    flags: [], traces: [], decisions: [], history: [], moment: '',
    body: { ankle: 3, shoulder: 1, back: 1, underarm: 0, palm: 0, goodLeg: 1 },
    affinity: Object.fromEntries(ENDING_KEYS.map(key => [key, 0])), focus: 'observe',
    reaction: null, motion: { kind: 'sit', location: 'room', caption: '오전 10시 12분. 소파에서 시작하는 토요일.', energyBefore: 6, energyAfter: 6 }
  });
  function freshState(options = {}) {
    const start = scenes.normalizeStart(options);
    const state = { ...baseState(), scenarioId: start.scenarioId, scenarioVersion: scenes.SCENARIO_VERSION, initialConditions: { ...start.conditions }, choiceIds: [], context: scenes.freshContext(start) };
    if (start.scenarioId !== 'classic') {
      state.route = ['home'].includes(start.scenarioId) ? 'inside' : 'outside';
      state.motion = { ...state.motion, kind: state.context.location === 'entrance' ? 'stand' : 'sit', location: state.context.location === 'entrance' ? 'hall' : 'room', caption: state.context.location === 'entrance' ? `${state.context.entrance.mode === 'automatic' ? '자동문' : '출입구'} 앞에서 들어갈 공간을 살핀다.` : '집에서 오늘 하고 싶은 일을 고른다.' };
      scenes.prepare(state);
    }
    return state;
  }
  const motion = (kind, location, caption, destinationPose) => ({ kind, location, caption, ...(destinationPose ? { destinationPose } : {}) });
  const bodyEffects = {
    neutral: {},
    transfer: { ankle: 1, shoulder: 1, back: 1, palm: 1, goodLeg: 1 },
    walk: { ankle: 1, shoulder: 2, back: 1, underarm: 1, palm: 2, goodLeg: 2 },
    stairs: { ankle: 1, shoulder: 3, back: 2, underarm: 2, palm: 2, goodLeg: 3 },
    desk: { ankle: 0, shoulder: 1, back: 2, underarm: 0, palm: -1, goodLeg: -1 },
    phone: { ankle: 0, shoulder: 1, back: 1, underarm: 0, palm: -1, goodLeg: -1 },
    rest: { ankle: -1, shoulder: -2, back: -1, underarm: -1, palm: -2, goodLeg: -2 },
    settle: { ankle: -1, shoulder: -1, back: 0, underarm: -1, palm: -1, goodLeg: -1 },
    observe: { ankle: 0, shoulder: 0, back: 1, underarm: -1, palm: -1, goodLeg: -1 }
  };
  const has = (s, flag) => s.flags.includes(flag);
  const choice = (id, title, note, next, effect, focus, trace, reactionTitle, lines, movement, extra = {}) => ({
    id, title, note, next, effect, focus, trace,
    reactionTitle, lines, motion: movement, energy: 0, mood: 1, weight: 3, ...extra
  });
  const NODES = {
    morning: {
      time: '10:12 · 토요일 오전', step: 1, title: '주말이 이렇게 길었나?',
      lines: () => [
        '휴대폰을 내려놓는다. 아직 10시 12분. 평소라면 차 키를 찾거나 새로운 프로젝트의 파일명을 고민했을 시간이다.',
        '오른다리에 깁스를 한 채 앉아 있다. 일어나려다 먼저 발의 위치를 본다. 왼발에 힘을 모으자 허벅지가 단단해지고, 어깨도 덩달아 올라간다.',
        '목발은 소파 옆에 있다. 목발을 짚으면 컵과 휴대폰을 들 손이 없다. 몇 걸음 옮길 때마다 얼마나 더 움직일 수 있을지 생각하게 된다.',
        '시간은 많은데, 발목이 불편해서 할 수 있는 일은 줄었다.'
      ],
      choices: [
        choice('morning-outside', '밖으로 나가고 싶다', '어떻게 갈지 먼저 알아보기', 'outside', 'transfer', 'outing', '목발로 현관까지 이동', '일단 현관까지', [
          '열쇠를 집으려다 다시 내려놓는다. 오늘은 직접 운전하지 않기로 했다. 택시를 타건, 누군가 날 픽업하러 오건, 차에 타러 가는 길부터 확인해야 한다.',
          '목발을 짚고 현관으로 간다. 몇 걸음 걷고 잠깐 쉰다. 현관까지 가는 것뿐 아니라 돌아와 다시 앉을 때 쓸 힘도 생각해 둔다.'
        ], motion('walk', 'hall', '오른발을 보호하며 짧게 이동하고, 현관 앞에서 멈춘다.'), { route: 'outside', energy: -1, mood: 0, weight: 2 }),
        choice('morning-inside', '집에서 게임이나 새로운 일을 해본다', '책상까지 천천히 가서 앉기', 'inside', 'transfer', 'create', '책상으로 이동해 앉음', '책상은 가까운데', [
          '노트북은 바로 앞인데, 의자에 앉으려고 몸을 돌리는 데 더 오래 걸린다. 발목을 조심하다 보니 움직임이 한 박자씩 늦어진다.',
          '앉고 나니 손바닥이 눌린 듯 얼얼하다. 책상까지 오는 데도 꽤 힘을 썼다. 파일명은 아직 “새 문서”. 이 부분은 평소와 같다.'
        ], motion('walk', 'room', '소파에서 책상으로 이동한 뒤 조심스럽게 앉는다.', 'desk'), { route: 'inside', energy: -1, weight: 2 }),
        choice('morning-contact', '누군가에게 연락하고 싶다', '누구에게 먼저 말을 걸까', 'contact', 'phone', 'shared', '연락처를 찾아봄', '메시지를 썼다가 지웠다', [
          '“뭐 해?”를 썼다가 지운다. 할 말이 너무 없어서인지, 너무 많아서인지 모르겠다. 결국 연락처부터 천천히 내려본다.',
          '휴대폰을 들고 있던 팔을 쿠션에 내려놓는다. 발목을 다쳤는데 어깨부터 편하게 받칠 곳을 찾는다.'
        ], motion('phone', 'room', '앉은 자리에서 휴대폰을 보고 팔을 내려놓는다.'), { route: 'contact', mood: 0, weight: 2 }),
        choice('morning-window', '창밖부터 바라본다', '우선 창가에 앉아 보기', 'window', 'transfer', 'observe', '창가 의자에 앉음', '창가에 앉아서', [
          '가까운 의자에 앉아 창밖을 본다. 유리까지 더 다가가고 싶지만 오늘의 자리는 여기로 정한다.',
          '밖에서는 누군가 신호를 놓치고 뛴다. 나는 목발을 벽에 기대고 앉는다. 창가까지 왔을 뿐인데 잠깐 쉬고 싶다.'
        ], motion('walk', 'room', '창가 가까운 의자로 천천히 이동한다.', 'observe'), { route: 'window', energy: -1, mood: 0, weight: 2 })
      ]
    },
    outside: {
      time: '11:03 · 현관 앞', step: 2, title: '가까운 카페에 갈 수 있을까?',
      lines: () => [
        '네이버지도를 연다. 이야기 속 목적지까지 300미터, 화면에는 4분. 현관에서 신발을 정리하는 데 이미 그만큼 쓴 것 같다. 오늘은 지도에 나온 시간보다 오래 걸리겠다.',
        '자동문인지, 문턱이 있는지, 기다리며 앉을 곳이 있는지 확인한다. 평소라면 메뉴부터 봤을 텐데 오늘은 입구 사진을 먼저 찾는다.',
        '목발을 짚고 있으면 양손이 바쁘다. 무거운 문을 열면서 몸을 지탱하기는 어렵다. 갔다가 돌아오는 길까지 움직일 수 있을지 생각해 본다.'
      ],
      choices: [
        choice('outside-ride', '친구가 픽업하러 오거나 택시를 타고 나간다', '친구와 문 앞 승하차, 앉을 자리 확인', 'outing_lunch', 'walk', 'outing', '친구와 상가 로비에 도착', '로비에 도착했다', [
          '친구가 문을 잡아준다. 차 문과 좌석 사이에서 잠깐 멈춰 다리의 자리를 잡는다. 출발도 전에 “잠깐만”을 두 번 말했다.',
          '확인해 둔 상가 출입구로 들어가 1층 로비 의자에 앉는다. 가려던 카페는 2층이다. 간판보다 먼저 계단과 엘리베이터 표지를 본다. 입구까지 왔다고 오늘의 이동이 끝난 것은 아니다.'
        ], motion('walk', 'street', '친구가 잡아준 상가 출입구를 지나 1층 로비 의자까지 이동한다.', 'sit'), { energy: -2, mood: 1, flags: ['outing', 'at_lobby'], weight: 4 }),
        choice('outside-access', '출입구와 쉬는 곳부터 확인한다', '사진을 보고 가게에 문의하기', 'lunch', 'phone', 'outing', '출입구 사진과 쉬는 곳 확인', '입구 사진은 어디 있지?', [
          '네이버지도의 업체 사진은 디저트를 아주 잘 보여준다. 바닥은 거의 보이지 않는다. 거리뷰와 출입구 사진을 번갈아 보고, 전화로 문턱과 좌석을 묻자 상대도 입구를 다시 보러 간다.',
          '계단 없는 길을 저장한다. 오늘 갈지는 조금 더 생각해 보기로 한다. 휴대폰을 내려놓을 때 목 뒤가 뻣뻣하다.'
        ], motion('phone', 'hall', '현관 의자에 앉아 출입구와 휴식 공간을 확인한다.'), { mood: 0, flags: ['access'], weight: 4 }),
        choice('outside-reroute', '외출을 미루고 지도에서 구경한다', '가 보고 싶은 곳을 저장해 두기', 'lunch', 'settle', 'create', '지도에서 가 보고 싶은 곳 저장', '집에서 지도를 보다가', [
          '외출 준비물을 다시 내려놓고 네이버지도에 저장한 골목을 찾아본다. 오늘은 집에서 사진을 구경하기로 한다.',
          '작은 빵집을 가 보고 싶은 곳 목록에 넣는다. 밖에 못 나가는 건 여전히 아쉽다. 저장해 둔 곳은 나중에 다시 보기로 한다.'
        ], motion('sit', 'room', '외출을 미루고 의자에 앉아 지도를 본다.'), { energy: 1, mood: -1, flags: ['reroute'], weight: 4 }),
        choice('outside-door', '문 앞에서 돌아와 쉬기로 한다', '택배는 안쪽에 놓아 달라고 부탁', 'lunch', 'rest', 'rest', '택배를 옮겨 달라고 부탁하고 쉼', '택배 상자를 옮길 손이 없다', [
          '문 앞의 작은 상자를 보고 잠깐 계산한다. 손이 모자란다. 상자를 들고 이동하는 대신 안쪽에 놓아 달라고 부탁한다.',
          '의자로 돌아와 길게 숨을 내쉰다. 상자에는 어제 주문한 양말이 들어 있다. 양말 하나 받는 데도 생각보다 손이 많이 간다.'
        ], motion('rest', 'hall', '문 앞 이동을 멈추고 가까운 의자에서 쉰다.'), { energy: 2, mood: 0, flags: ['rest', 'help'], weight: 4 })
      ]
    },
    inside: {
      time: '11:08 · 책상 앞', step: 2, title: '집에서 무엇을 해볼까?',
      lines: () => [
        '노트북을 켠다. 게임도 있고 영상도 볼 수 있다. 그런데 의자에는 어떻게 앉아도 편하지가 않다.',
        '오른발을 피해서 앉다 보니 몸통이 살짝 비틀려 있다. 허리 뒤에 빈 공간이 느껴져 쿠션을 옮긴다. 노트북도 같이 옮긴다. 이제 충전선이 짧다.',
        '일단 앉을 준비는 됐다. 이제 하고 싶은 것을 하나 골라 본다.'
      ],
      choices: [
        choice('inside-puzzle', '처음 보는 퍼즐 게임을 해본다', '자세를 바꾸며 한 문제씩', 'lunch', 'desk', 'flow', '퍼즐 첫 문제를 풀었음', '다음 문제도 풀어볼까?', [
          '첫 문제를 풀자 더 어려운 문제가 나온다. 숫자 하나를 옮기고, 되돌리고, 또 옮긴다. 계속 풀어 보고 싶다.',
          '풀이가 막혀 잠깐 게임을 멈춘다. 등에 기대니 그동안 앞으로 숙여 앉았다는 걸 알겠다. 자세를 고친 뒤 다시 풀면 된다.'
        ], motion('desk', 'room', '책상에서 퍼즐을 풀다가 손을 놓고 자세를 바꾼다.'), { energy: -1, mood: 2, flags: ['flow'], weight: 4 }),
        choice('inside-write', '짧은 게임 아이디어를 써본다', '물 한 잔 가지러 가는 게임은 어떨까?', 'lunch', 'desk', 'create', '토요일을 소재로 게임 아이디어 작성', '파일명: 최종_아님', [
          '“주인공은 물을 마시고 싶었다.” 써 놓고 웃는다. 오늘이라면 충분히 큰 사건이다. 버튼 이름도 하나 적는다. “일단 앉기”.',
          '여기까지 쓰고 저장을 누른다. 더 쓸 수 있을 것 같지만 등이 뻐근하다. 나머지는 나중에 쓰기로 한다.'
        ], motion('desk', 'room', '짧은 이야기를 쓰고 등받이에 몸을 맡긴다.'), { energy: -1, mood: 2, flags: ['create'], weight: 4 }),
        choice('inside-video', '전혀 모르는 분야의 영상을 틀어본다', '추천 영상 대신 궁금한 단어 하나', 'lunch', 'observe', 'observe', '뜻밖에 알게 된 낯선 단어', '문어는 오늘도 바쁘다', [
          '문어가 항아리를 여는 영상을 본다. 팔이 여덟 개다. 물컵과 휴대폰과 목발을 떠올리니 아주 실용적인 숫자로 보인다.',
          '모르는 단어 하나를 적고 다음 영상은 재생하지 않는다. 팔을 내려놓자 어깨가 조금 편해진다. 적은 단어는 나중에 찾아봐야겠다.'
        ], motion('observe', 'room', '화면을 바라보다 팔을 내려놓고 기대어 앉는다.'), { mood: 1, flags: ['discovery'], weight: 4 }),
        choice('inside-listen', '화면을 끄고 음악을 듣는다', '좋아하는 앨범을 편한 자리에서', 'lunch', 'rest', 'rest', '화면을 끄고 음악을 들었음', '음악을 들으며 쉬기', [
          '몇 번이나 자세를 고친 뒤 결국 화면을 끈다. 스피커에서 익숙한 전주가 나온다. 다른 일은 하지 않고 듣는다.',
          '자주 듣던 노래에서 작게 깔린 기타 소리가 들린다. 평소에는 잘 못 들었던 부분이다. 한 곡 더 듣고 싶어진다.'
        ], motion('rest', 'room', '화면을 닫고 다리를 받친 채 음악을 듣는다.'), { energy: 2, mood: 0, flags: ['rest'], weight: 4 })
      ]
    },
    contact: {
      time: '11:06 · 연락처', step: 2, title: '누구에게 연락할까?',
      lines: () => [
        '같은 동네에 살아도 한동안 못 본 사람들이 있다. 만나자는 말을 쓰다가, 오늘은 어떤 방식이 가능한지 먼저 생각한다.',
        '“발목을 다쳤는데 왜 어깨까지 아프냐.” 혼잣말을 하고 보니 친구에게 그대로 보내도 될 것 같다.',
        '상대도 자기 토요일을 보내는 중이다. 답장이 늦어도 괜찮다. 그냥 안부만 전해 보기로 한다.'
      ],
      choices: [
        choice('contact-message', '오랜만에 안부를 보낸다', '“뭐 해? 그냥 생각나서.”', 'lunch', 'phone', 'shared', '안부 메시지를 보냄', '답장을 기다리다가', [
          '메시지를 보내고 화면을 엎어 둔다. 잠시 뒤 다시 들어 읽음 표시를 확인한다.',
          '답장은 아직 오지 않는다. 상대도 자기 주말을 보내고 있을 것이다. 안부만 전하려던 건데, 자꾸 답장이 왔는지 보게 된다.'
        ], motion('phone', 'room', '짧은 안부를 보내고 화면을 내려놓는다.'), { mood: 0, flags: ['connection'], weight: 4 }),
        choice('contact-help', '물병과 간식을 옮겨 달라고 부탁한다', '“물병을 책상까지 옮겨 줄 수 있어?”', 'lunch', 'settle', 'shared', '물병과 간식 옮기기를 부탁함', '물병 좀 옮겨 줄래?', [
          '“괜찮아” 대신 필요한 것을 말한다. 물병과 간식을 손 닿는 곳에 옮겨 달라고 부탁한다. 막상 말하고 보니 필요한 도움은 그 두 가지였다.',
          '상대는 오후에 들를 수 있다고 한다. 당장 모든 것이 해결되진 않지만, 오늘의 왕복 몇 번은 줄어들겠다.'
        ], motion('phone', 'room', '앉아서 필요한 도움과 가능한 시간을 이야기한다.'), { energy: 1, flags: ['help', 'scheduled_help'], weight: 4 }),
        choice('contact-call', '오랜만에 전화를 걸어본다', '편히 기대어 근황 이야기하기', 'lunch', 'phone', 'shared', '전화로 근황과 점심 메뉴를 이야기함', '대화의 절반은 메뉴', [
          '통화의 절반은 점심 메뉴 이야기다. 상대는 국수를 먹겠다더니 통화가 끝날 때는 김밥으로 바꿨다.',
          '휴대폰을 받쳐 두고 어깨에 들어간 힘을 푼다. 통화는 즐거웠지만, 웃고 난 뒤에도 발목은 여전히 묵직하다.'
        ], motion('phone', 'room', '통화하며 팔을 받치고 어깨의 힘을 푼다.'), { energy: -1, mood: 2, flags: ['connection'], weight: 4 }),
        choice('contact-draft', '보내지 않을 편지를 써본다', '지금 답답한 일을 솔직하게 적기', 'lunch', 'desk', 'create', '편지를 쓰고 보내지는 않았음', '보내지 않을 글', [
          '“사실 좀 짜증 나.” 첫 줄이 짧다. 다음 줄에는 아침부터 몇 번을 앉았다 일어났는지 쓴다. 세다가 잊어서 “여러 번”으로 고친다.',
          '다 쓴 글을 저장하고 보내지는 않는다. 읽어 보니 생각보다 불편한 일이 많았다. 굳이 끝에 “그래도 괜찮아”를 덧붙이지 않는다.'
        ], motion('desk', 'room', '앉은 자리에서 편지를 쓰고 저장한다.'), { mood: 0, flags: ['create'], weight: 4 })
      ]
    },
    window: {
      time: '11:14 · 창가', step: 2, title: '창밖을 보다 보니',
      lines: () => [
        '버스가 지나가고 가게 문이 열린다. 배달원 한 명이 같은 현관을 두 번 들여다본다.',
        '오른발을 계속 의식하니 왼쪽 엉덩이에 체중이 몰린다. 앉아 있는데도 자리를 조금씩 다시 잡게 된다.',
        '가만히 보고 있으니 사진도 찍고 싶고, 지나가는 사람들은 어디로 가는지도 궁금하다.'
      ],
      choices: [
        choice('window-photos', '같은 풍경을 세 장 찍는다', '일어나지 않고 휴대폰 방향만 바꾸기', 'lunch', 'observe', 'observe', '창밖 사진 세 장 촬영', '창밖 사진 세 장', [
          '의자에서 휴대폰의 방향만 바꾼다. 첫 장은 하늘, 두 번째는 전선, 세 번째는 유리에 비친 내 양말이다.',
          '세 장 중에서는 양말 사진이 제일 마음에 든다. 팔을 내리자 겨드랑이 옆이 덜 당긴다.'
        ], motion('observe', 'room', '의자에 앉아 창밖을 세 구도로 담고 팔을 내린다.'), { mood: 1, flags: ['observe', 'photos'], weight: 4 }),
        choice('window-story', '지나가는 사람들을 보고 이야기를 상상한다', '갈색 가방을 든 사람은 어디로 갈까?', 'lunch', 'observe', 'create', '지나가는 사람을 소재로 짧은 글 작성', '가방에서 대파가 보인다', [
          '갈색 가방을 든 사람은 면접에 가는 걸까, 빵을 사러 가는 걸까. 자세히 보니 가방에서 대파가 삐져나와 있다. 장을 보고 오는 길일지도 모르겠다.',
          '그 사람을 보고 떠오른 이야기를 메모한다. 실제로 어디에 가는지는 모른다. 창밖의 사람은 잠시 뒤 모퉁이를 돌아 사라진다.'
        ], motion('observe', 'room', '창가에 앉아 짧은 이야기를 적는다.'), { mood: 2, flags: ['create'], weight: 4 }),
        choice('window-rest', '20분 동안 그냥 쉬어 본다', '휴대폰도 보지 않고 앉아 있기', 'lunch', 'rest', 'rest', '창가에서 20분 쉬었음', '잠깐 아무것도 하지 않기', [
          '처음 몇 분은 휴대폰을 찾는다. 그다음에는 냉장고 소리와 먼 차 소리가 들린다. 특별히 평온해지지는 않는다. 그냥 조금 덜 바쁘다.',
          '받쳐 둔 다리의 위치를 다시 잡는다. 어깨에 힘이 풀려도 발목 안쪽은 여전히 욱신거린다. 쉬고 있어도 불편한 곳은 계속 느껴진다.'
        ], motion('rest', 'room', '창가에서 등을 기대고 다리를 받친 채 쉰다.'), { energy: 2, mood: 0, flags: ['rest'], weight: 4 }),
        choice('window-route', '창밖의 출입구와 경사로를 살펴본다', '경사로 끝까지 지나갈 수 있을까?', 'lunch', 'observe', 'outing', '경사로를 막고 있는 자전거 확인', '경사로 끝에 자전거가 있다', [
          '건너편 경사로를 따라 시선을 옮기니 끝에 주차된 자전거가 있다. 경사로가 있다는 사실과 지나갈 수 있다는 사실이 다르다.',
          '근처에 다른 입구가 있는지 지도에서 찾아 표시한다. 다음에 나갈 때 다시 확인해 봐야겠다.'
        ], motion('observe', 'room', '창가에서 출입구와 길의 연결을 관찰한다.'), { mood: 0, flags: ['access', 'observe'], weight: 4 })
      ]
    },
    outing_lunch: {
      time: '13:16 · 상가 1층 로비', step: 3, title: '카페가 2층에 있다',
      lines: () => [
        '네이버지도에서는 한 점으로 보이던 1층과 2층 사이에 계단이 있다. 올라갈 수는 있다. 다만 오늘은 한 층을 오르는 데도 온몸에 힘이 들어간다.',
        '계단참과 난간, 친구가 기다릴 자리부터 본다. 한 층을 올라가는 데 얼마나 힘이 들지, 내려올 때도 버틸 수 있을지 생각한다.',
        '버거킹 앱의 등급과 쿠폰함도 열어 본다. 오늘 눈에 띈 매장 행사는 딜리버리 제외다. 별도로 뜨는 배달 혜택도 살펴본다. 오래 쓴 앱인데, 지금 끌리는 할인과 지금 가능한 주문이 어긋난다.',
        '이 상가에는 뒤편 엘리베이터와 1층에서 해결할 점심도 있다. 어떤 이동을 할지는 여기서 다시 고를 수 있다.'
      ],
      choices: [
        choice('outing-stairs', '중간에 쉬어 가며 2층에 올라간다', '친구와 함께, 올라간 뒤 앉을 자리까지', 'afternoon', 'stairs', 'outing', '계단참에서 쉬며 2층에 올라감', '2층에 올라와 앉았다', [
          '서두르지 않고 계단을 오른다. 한 칸 오를 때마다 몸을 다시 가누느라 시간이 걸린다. 한 층을 오르는 동안 머릿속 에너지 막대는 자꾸 줄어든다. 계단참에서 친구와 잠깐 쉰다.',
          '2층에 닿아 의자에 앉는다. 어깨 앞과 겨드랑이 옆이 뻐근하고, 비스듬히 힘을 주었던 등도 당긴다. 왼쪽 허벅지는 뒤늦게 떨린다. 올라올 수는 있었지만 꽤 힘들었다. 내려갈 때도 힘이 필요해서 조금 더 쉰다.'
        ], motion('stairs', 'stairs', '계단참에서 멈춰 쉬며 실제로 2층까지 올라가, 도착한 뒤 앉아 숨을 돌린다.', 'sit'), { energy: -2, mood: 0, flags: ['stairs_taken'], weight: 2 }),
        choice('outing-elevator', '뒤편 엘리베이터를 확인해 2층으로 간다', '조금 돌아가되 오르내리는 힘을 줄이기', 'afternoon', 'walk', 'observe', '뒤편에서 찾은 엘리베이터', '같은 층으로 가는 다른 길', [
          '친구가 안내를 확인하고 뒤편 문을 잡아 준다. 건물을 조금 돌아 엘리베이터에 탄다. 층수 표시가 바뀌는 동안 목발 손잡이를 쥔 손의 힘을 잠깐 푼다.',
          '2층 의자에 앉는다. 조금 돌아왔지만 계단을 오르지 않아 덜 힘들다. 다음에도 찾을 수 있도록 네이버지도 메모에 “뒤편 출입”을 적는다.'
        ], motion('walk', 'hall', '뒤편 엘리베이터를 이용해 2층으로 간 뒤 가까운 의자에 앉는다.', 'sit'), { energy: -1, mood: 1, flags: ['elevator_used', 'access_note'], weight: 3 }),
        choice('outing-pickup', '1층에서 버거킹 픽업으로 점심을 바꾼다', '사용 가능한 혜택과 수령 조건을 확인', 'afternoon', 'settle', 'shared', '친구가 옮겨 준 점심을 함께 먹음', '음식 봉투도 옮겨야 한다', [
          '내 주문에 적용되는 픽업 혜택을 확인하고 1층에서 점심을 해결한다. 회원 등급이 모든 주문 방식을 같게 만들어 주지는 않는다. 오늘 화면에 뜬 혜택 안에서 고른다.',
          '봉투를 받으려는데 양손으로 목발을 짚고 있다. 친구가 음식과 음료를 옮겨 준다. 할인액만 생각했는데, 누가 들고 갈지도 정해야 했다. 자리에 앉고 나니 그 도움이 가장 크게 느껴진다.'
        ], motion('sit', 'street', '1층에서 친구와 점심을 받아 앉고, 봉투 운반을 나눈다.'), { energy: 0, mood: 1, flags: ['pickup_help', 'connection'], weight: 3 }),
        choice('outing-delivery', '돌아가서 배민 배달로 점심을 정한다', '돌아갈 힘을 생각하고 주문 비교', 'afternoon', 'settle', 'rest', '집에 돌아와 배민으로 점심 주문', '집에서 배달을 기다리기로 했다', [
          '로비에서 더 올라가지 않고 친구와 귀가한다. 아까 버거킹 앱에서 본 매장 할인은 이번에 못 쓴다. “아, 아깝다.” 배민을 열어 이 주문의 배달과 픽업 조건을 따로 확인한다.',
          '배달 혜택과 총 주문 금액을 확인한 뒤 배달을 고른다. 할인이 아깝지만 오늘은 한 번 덜 다녀오고 싶다. 음식이 오면 가까이 내려놓을 수 있도록 자리를 비워 둔다.'
        ], motion('sit', 'room', '친구와 귀가한 뒤 배달 조건을 비교하고 앉아서 점심을 기다린다.'), { energy: 0, mood: 0, flags: ['delivery', 'returned_home'], weight: 3 })
      ]
    },
    lunch: {
      time: '13:16 · 점심 무렵', step: 3, title: '점심은 어떻게 먹을까?',
      lines: s => [
        has(s, 'scheduled_help') ? '부탁한 물건을 옮겨 줄 사람이 올 때까지, 지금 손 닿는 곳에 무엇이 있는지 살펴본다.'
          : s.route === 'inside' ? '화면에서 눈을 떼자 목이 마르다. 물은 부엌에 있고 나는 의자에 있다. 가지러 가야 하는데 조금 귀찮고, 들고 오는 것도 걱정된다.'
          : s.route === 'contact' ? '휴대폰을 잠깐 내려놓자 집 안이 조용하다. 물 한 잔을 가지러 가려다, 컵을 든 채 돌아올 방법부터 생각한다.'
          : '창가 그림자가 길어졌다. 물 한 잔이 생각나는데 컵은 여전히 부엌에 있다.',
        '점심을 고르려고 버거킹 앱의 등급 표시와 쿠폰함을 연다. 오늘 눈에 띈 매장 행사는 딜리버리 제외다. 버거킹의 배달 혜택도 별도로 살핀 뒤, 배민을 열어 그쪽 주문의 할인과 총액을 따로 비교한다. 익숙한 할인과 지금 쓸 수 있는 할인이 다르니 조금 아쉽다.',
        '네이버지도로 픽업 동선을 보다가 물컵을 본다. 음식값에 오가는 데 쓸 힘까지 따져 본다. 일어나고, 문을 열고, 받아 와서 다시 앉기까지. 오늘은 그 하나하나가 일이다.',
        '물도 마셔야 하고 점심도 먹어야 한다. 어떻게 할까?'
      ],
      choices: [
        choice('lunch-reroute', '배민으로 주문하고 물병을 가까이 둔다', '배달 조건을 확인하고 오가는 일 줄이기', 'afternoon', 'settle', 'outing', '배달 주문 후 물병을 가까이 둠', '오늘은 배달로 먹기로 했다', s => [
          has(s, 'scheduled_help') ? '배민에서 오늘 주문에 적용되는 배달 혜택과 총액을 확인한다. 오후에 들른 사람이 봉투와 물병을 옮겨 준다. 부탁했던 목록에 충전기 하나를 보탠다.' : '배민에서 오늘 주문에 적용되는 배달 혜택과 총액을 확인한다. 아까 본 매장 할인은 못 쓰지만 픽업 왕복은 줄어든다. 도착한 봉투를 둘 자리와 뚜껑 있는 물병도 가까이 정한다.',
          '쿠폰 하나가 아까워 앱을 한 번 더 열었다가 닫는다. 방은 그대로인데 오갈 일이 줄었다. 오후에 쓸 힘이 조금 남을 것 같다.'
        ], motion('sit', 'room', '배달 조건을 비교하고 물병과 음식을 손 닿는 자리에 둔다.'), { energy: 1, mood: 0, flags: ['reroute', 'delivery'], weight: 2 }),
        choice('lunch-note', '오늘 불편했던 일을 짧게 적는다', '컵을 옮기기 어려웠던 일을 메모', 'afternoon', 'desk', 'observe', '컵 운반과 예전 출입구에 관한 메모', '컵 하나도 들기 어렵다', s => [
          has(s, 'outing') ? '오늘 상가 입구에서 친구가 문을 잡아 준 일을 적는다. 혼자였다면 문을 열고 들어가기가 어려웠겠다.' : '집 안에서 컵을 옮기기 어려웠던 일을 적는다. 예전에 만난 무거운 문도 생각난다. 오늘 다녀온 곳과 헷갈리지 않도록 “예전 일”이라고 덧붙인다.',
          '“목발을 짚으면 컵을 들 손이 없다.” 길게 쓰려다가 이 한 줄로 줄인다. 다음에 필요한 물건을 준비할 때 다시 읽어 봐야겠다.'
        ], motion('desk', 'room', '오늘 컵을 옮기려던 일과 예전에 만난 문을 구분해서 적는다.'), { energy: -1, mood: 1, flags: ['access_note'], weight: 3 }),
        choice('lunch-rest', '하던 일을 미루고 잠깐 쉰다', '등을 기대고 편하게 앉기', 'afternoon', 'rest', 'rest', '하던 일을 미루고 의자에서 쉼', '좀 쉬었다 해야겠다', [
          '다음 일을 뒤로 미루고 의자에 깊이 앉는다. 목발에서 손을 떼자 손바닥의 눌린 감각이 더 또렷해진다. 쓰는 동안에는 몰랐다.',
          '휴대폰 알림을 끈다. 쉬고 있어도 심심하고 약간 짜증이 난다. 그래도 지금은 몸을 움직이는 것보다 앉아 있는 편이 낫다.'
        ], motion('rest', 'room', '손잡이를 놓고 등을 기대며 다리를 받친다.'), { energy: 2, mood: 0, flags: ['rest'], weight: 3 }),
        choice('lunch-ask', '버거킹 픽업을 부탁하고 함께 먹는다', '상대의 동선과 수령 조건부터 확인', 'afternoon', 'settle', 'shared', '픽업을 부탁해 버거를 함께 먹음', '오는 길에 들러 줄 수 있어?', [
          '가게 근처에 있는 사람에게 가능한지 먼저 묻는다. 상대가 들를 수 있다고 해, 주문과 수령 조건에 맞는 방식으로 메뉴를 정한다. 내 등급 표시를 보는 일보다 실제로 적용되는 혜택을 확인하는 일이 먼저다.',
          '음식과 음료가 책상에 도착한다. 부탁한 메뉴가 맞는지 보고 함께 먹는다. 쿠폰도 쓸 수 있었고, 내가 음식을 들고 오지 않아도 됐다. 가져다준 사람에게 고맙다고 말한다.'
        ], motion('phone', 'room', '상대의 동선과 픽업 조건을 확인하고, 가져온 점심을 함께 먹는다.'), { energy: 1, mood: 1, flags: ['help', 'connection', 'pickup_help'], weight: 3 })
      ]
    },
    afternoon: {
      time: '16:24 · 토요일 오후', step: 4, title: '오후에는 뭘 해볼까?',
      lines: s => [
        has(s, 'stairs_taken') ? '2층에서 충분히 앉아 있다가 친구와 내려와 집에 돌아왔다. 내려오는 데도 생각보다 힘이 들었다. 지금은 왼쪽 허벅지와 어깨가 묵직하다.'
          : has(s, 'elevator_used') ? '2층에서 쉬었다가 엘리베이터로 내려와 귀가했다. 네이버지도에 저장한 “뒤편 출입” 메모가 오늘의 가장 실용적인 기록이다.'
          : has(s, 'pickup_help') ? (has(s, 'outing') ? '1층에서 점심을 먹은 뒤 친구와 집에 돌아왔다. 목발을 짚느라 음식 봉투를 들 수 없었는데, 친구가 옮겨 줘서 편하게 먹었다.' : '점심 봉투가 비어 있다. 가게에 들러 음식을 가져다준 덕분에 집에서 편하게 먹었다.')
          : has(s, 'delivery') ? '배달받은 점심을 정리하고 앱을 닫는다. 못 쓴 매장 할인은 여전히 조금 아깝다. 그래도 직접 가지러 다녀오지 않은 건 편했다.'
          : has(s, 'outing') ? '상가 로비에서 쉬던 순간이 떠오른다. 걸어간 거리보다 앉을 자리를 찾던 순간이 더 선명하다.'
          : has(s, 'create') ? '저장해 둔 문장을 다시 읽는다. 조금 어색하고, 조금 더 써 보고 싶다. 삭제 버튼은 아직 누르지 않는다.'
          : has(s, 'connection') || has(s, 'help') ? '아까 누군가에게 말을 건넸던 순간이 떠오른다. 상대도 자기 오후를 보내고 있을 것이다.'
          : has(s, 'rest') ? '한동안 쉬고 나니 어깨와 팔이 조금 편하다. 아직 발목은 아프지만 앉아 있기는 전보다 낫다.'
          : '창밖을 다시 본다. 햇빛이 아침보다 옆으로 기울어 있다.',
        bodyContext(s),
        '아직 오후 4시 24분. 남은 시간에 하나만 더 해 본다면?'
      ],
      choices: [
        choice('afternoon-flow', '재미있던 일을 한 시간쯤 더 해본다', '중간중간 자세를 바꾸며 계속하기', 'evening', 'desk', 'flow', '재미있던 일을 한 시간 더 했음', '벌써 한 시간이 지났다', s => [
          has(s, 'flow') ? '아침에 막혔던 퍼즐을 다시 연다. 한 문제를 풀고 다음 문제도 시작한다. 타이머는 잠깐 멈추고 자세부터 고친다.' : has(s, 'create') ? '저장한 문장을 이어서 쓴다. 주인공의 이름은 아직 없는데 물컵의 위치는 정확하다. 중간에 손을 쉬었다가 다시 쓴다.' : '아까 궁금했던 것을 찾아본다. 탭을 세 개 열었다가 두 개 닫는다. 하나를 자세히 읽다 보니 시간이 꽤 지났다.',
          '시계를 보니 한 시간이 지났다. 중간중간 몸이 불편해서 자세를 바꿨지만, 하던 일이 재미있어서 다시 하게 됐다.'
        ], motion('desk', 'room', '책상에서 몰입하다가 중간중간 등과 팔의 자리를 바꾼다.'), { energy: -2, mood: 2, flags: ['flow'], weight: 4 }),
        choice('afternoon-share', '오늘 찍은 사진이나 메모를 보내본다', '사진 한 장 또는 짧은 문장', 'evening', 'phone', 'shared', '사진이나 메모를 다른 사람에게 보냄', '이 사진 좀 봐', s => [
          has(s, 'photos') ? '양말이 비친 사진 한 장을 보낸다. “밖을 찍었는데 양말이 더 잘 나왔어.” 상대가 웃는 표시를 보낸다.' : has(s, 'access') || has(s, 'access_note') ? (has(s, 'outing') ? '오늘 지나온 문턱과 입구에서 도움받은 이야기를 보낸다. 상대가 “그러네”라고 답한다.' : '집에서 컵을 옮기기 어렵다는 메모를 보낸다. 문턱과 무거운 문에 관한 부분은 예전에 겪은 일이라고 덧붙인다. 상대가 “그러네”라고 답한다.') : '오늘 한 일을 짧게 써서 보낸다. “오늘은 이렇게 보냈어.” 전송한 뒤 휴대폰을 내려놓는다.',
          '답장이 더 오는지 한 번 확인한 뒤 다른 일을 본다. 길게 이야기하지는 않았지만 오늘 뭘 했는지는 전했다.'
        ], motion('phone', 'room', '짧은 사진이나 문장을 보내고 팔을 내려놓는다.'), { energy: -1, mood: 1, flags: ['share'], weight: 4 }),
        choice('afternoon-rest', '쉬면서 나중에 가 보고 싶은 곳을 찾는다', '날짜는 정하지 않고 장소만 저장', 'evening', 'rest', 'rest', '나중에 가 보고 싶은 곳을 저장함', '다음에는 여기 가볼까?', [
          '가 보고 싶은 곳을 하나 저장하고 화면을 끈다. 날짜까지 정하지는 않는다. 언제 갈지는 나중에 생각해도 된다.',
          '등을 받치고 앉아 창문 쪽을 본다. 어깨는 조금 덜 뻐근하지만 발목은 여전히 욱신거린다. 아직 다 나은 건 아니다.'
        ], motion('rest', 'room', '다리를 받치고 다음에 보고 싶은 풍경을 고른 뒤 쉰다.'), { energy: 2, mood: 0, flags: ['rest'], weight: 4 }),
        choice('afternoon-create', '오늘 일을 소재로 게임 아이디어를 적는다', '짧은 만화나 제목부터 써 보기', 'evening', 'desk', 'create', '물컵을 소재로 게임 아이디어 작성', '물컵 가지러 가는 게임', [
          '“물컵 원정대”라고 제목을 적는다. 상상 속 게임 지도에는 소파와 부엌만 있다. 실제 오늘의 사건과는 별개로 무거운 문을 최종 보스로, 미지근한 물을 보물로 정한다.',
          '읽어 보고 혼자 웃는다. 아직 제목과 간단한 설정뿐이다. 저장해 두고 나머지는 나중에 생각하기로 한다.'
        ], motion('desk', 'room', '책상에서 작은 초안을 만들고 손을 내려놓는다.'), { energy: -1, mood: 2, flags: ['create'], weight: 4 })
      ]
    },
    evening: {
      time: '20:16 · 토요일 저녁', step: 5, title: '이제 저녁이다',
      lines: s => [
        '창밖이 어두워졌다. 아침에는 멀게만 느껴졌던 저녁이 어느새 됐다.',
        s.mood >= 8 ? '불편한 일도 있었지만 재미있게 한 일도 있었다. 아침보다는 기분이 괜찮다.' : '하고 싶었던 일을 많이 하지는 못했다. 조금 아쉽고 심심한 토요일이었다.',
        s.body.shoulder >= 5 || s.body.back >= 5 ? '아침에는 발목만 신경 썼는데, 어느새 어깨와 등도 뻐근하다. 편히 앉도록 자세를 다시 잡는다.' : '발목은 여전히 불편하다. 저녁에는 편하게 앉아 있고 싶다.',
        '일기를 짧게 쓰거나 누군가에게 연락할까? 그냥 쉬어도 좋겠다.'
      ],
      choices: [
        choice('evening-reflect', '오늘 한 일을 짧게 적는다', '재미있던 일과 불편했던 일 메모', 'end', 'settle', 'observe', '오늘 한 일을 일기에 적음', '짧게 일기를 썼다', s => [
          `“${s.traces[s.traces.length - 1] || '창밖을 봤다'}.” 오늘 한 일을 하나 적고, 불편했던 일도 덧붙인다.`,
          '몇 줄 쓰고 저장한다. 길게 쓰지는 않았지만 오늘 뭘 했는지는 나중에도 알 수 있겠다.'
        ], motion('sit', 'room', '앉아서 오늘 한 일을 짧게 적는다.'), { mood: 0, flags: ['reflect'], weight: 2 }),
        choice('evening-future', '내일 하고 싶은 일을 하나 적는다', '몸 상태를 보고 할 수 있는 일로', 'end', 'settle', 'create', '내일 하고 싶은 일 메모', '내일은 뭘 해볼까?', [
          '내일 해보고 싶은 것을 하나 적는다. 실제로 할지는 내일 몸 상태를 보고 정하기로 한다.',
          '메모를 저장하고 휴대폰을 손 닿는 곳에 둔다. 이제 편하게 앉아 쉬고 싶다.'
        ], motion('sit', 'room', '내일 하고 싶은 일을 적고 편히 앉는다.'), { flags: ['future'], weight: 2 }),
        choice('evening-close', '이제부턴 휴식을 취한다', '편하게 앉아 몸을 쉬게 하기', 'end', 'rest', 'rest', '편하게 앉아 저녁에 휴식을 취함', '편히 앉아 쉬기로 했다', [
          '알림을 끄고 휴대폰을 내려놓는다. 편하게 앉아서 쉬고 싶다.',
          '필요한 물건을 손 닿는 곳에 두고 다리를 받친다. 아직 몸이 피곤해서 편하게 쉬며 저녁을 보낸다.'
        ], motion('rest', 'room', '휴대폰을 내려놓고 다리를 받친 채 쉰다.'), { energy: 1, mood: 0, flags: ['accept'], weight: 2 }),
        choice('evening-voice', '오늘 있었던 일을 음성 메시지로 보낸다', '“별일은 없었는데 말이야.”', 'end', 'phone', 'shared', '오늘 있었던 일을 음성 메시지로 보냄', '말하다 보니 길어졌다', [
          '“별일은 없었는데 말이야.”로 시작해서 생각보다 길게 말한다. 물컵 이야기에서 한 번 웃고, 힘들었던 일도 이야기한다.',
          '녹음한 내용을 보내고 휴대폰을 내려놓는다. 답장이 오면 나중에 확인하기로 한다.'
        ], motion('phone', 'room', '앉은 자리에서 짧은 음성 메시지를 녹음한다.'), { flags: ['share'], weight: 2 })
      ]
    }
  };
  const ENDINGS = {
    flow: { id: 'flow', name: '취미에 푹 빠진 토요일', quote: '“재미있어서 생각보다 오래 하게 됐다.”', body: '재미있는 일을 찾아 한동안 계속했다. 몸이 불편할 때는 쉬거나 자세를 고쳤다. 그러고도 하던 일이 궁금해서 다시 하게 됐다.', takeaway: '오늘 한 일 · 재미있는 일에 집중하기' },
    shared: { id: 'shared', name: '누군가에게 말을 건 토요일', quote: '“먼저 연락하거나 필요한 부탁을 해봤다.”', body: '안부를 보내거나 필요한 도움을 부탁했다. 연락하거나 부탁한 내용은 아래 기록에서 다시 볼 수 있다.', takeaway: '오늘 한 일 · 연락하거나 도움을 부탁하기' },
    outing: { id: 'outing', name: '외출 방법을 알아본 토요일', quote: '“가까운 곳도 입구와 돌아올 길부터 확인하게 됐다.”', body: '가까운 곳에 가는 방법부터 살펴봤다. 계단과 문, 앉을 곳, 돌아오는 길까지 알아볼 것이 많았다. 확인한 내용은 다음에 외출할 때도 필요하겠다.', takeaway: '오늘 한 일 · 출입구와 이동 방법 알아보기' },
    rest: { id: 'rest', name: '쉬면서 보낸 토요일', quote: '“하던 일을 몇 가지 미루고 편히 앉아 쉬었다.”', body: '하려던 일을 미루고 쉬는 시간을 가졌다. 몸이 조금 편해져도 심심하거나 아쉬울 수 있었다. 발목은 여전히 불편해서 자세를 바꾸어 가며 저녁을 보냈다.', takeaway: '오늘 한 일 · 하던 일을 미루고 쉬기' },
    observe: { id: 'observe', name: '주변을 둘러본 토요일', quote: '“평소에는 그냥 지나쳤던 것을 자세히 봤다.”', body: '주변을 살펴보거나 오늘 있었던 일을 생각해 봤다. 익숙한 곳에서도 전에는 몰랐던 점이 보였다.', takeaway: '오늘 한 일 · 주변을 살펴보기' },
    create: { id: 'create', name: '새로운 일을 시작한 토요일', quote: '“글이나 아이디어를 조금 써봤다.”', body: '짧은 글을 쓰거나 새로운 아이디어와 계획을 생각해 봤다. 한 번에 다 끝내지는 않았다. 더 해보고 싶은 부분은 나중에 이어 할 수 있도록 적어 두었다.', takeaway: '오늘 한 일 · 글이나 아이디어 써 보기' }
  };
  function bodyContext(s) {
    if (s.body.shoulder >= 5 && s.body.palm >= 3) return '어깨가 뻐근하고 손바닥이 얼얼하다. 앉은 뒤에야 목발 손잡이를 얼마나 꼭 쥐었는지 알겠다.';
    if (s.body.back >= 5) return '오래 앉아 있었더니 등이 뻣뻣하다. 아픈 발을 조심하느라 비스듬히 앉았는데, 그동안 다른 곳에도 힘이 들어갔다.';
    if (s.body.goodLeg >= 3) return '몸을 주로 받쳐 준 왼쪽 허벅지가 묵직하다. 다치지 않은 다리도 계속 힘을 쓰니 피곤하다.';
    return '발목은 여전히 묵직하고 불편하다. 자세를 바꿀 때마다 힘이 들어가는 곳도 조금씩 달라진다.';
  }
  function sensation(s, effect) {
    if (effect === 'neutral') return '몸의 반응 · 발목은 여전히 묵직하다.';
    if (effect === 'stairs') return '몸의 반응 · 손잡이를 누르던 손바닥이 얼얼하고, 어깨 앞쪽과 등 옆이 당긴다. 겨드랑이 옆은 옷이 닿을 때 유독 신경 쓰인다. 몸을 받치던 왼쪽 다리도 묵직해져 2층 의자에 앉아 쉰다.';
    if (effect === 'rest') return '몸의 반응 · 손과 어깨가 조금 편해졌다. 그래도 발목은 묵직하고, 오래 힘을 준 근육도 아직 뻐근하다.';
    if (effect === 'walk' || effect === 'transfer') {
      const text = s.body.shoulder >= 5 ? '목발 손잡이를 누를 때 어깨 앞쪽이 뻐근하고, 손바닥에는 눌린 자리가 남는다.' : '짧게 몸을 옮기는 동안 손바닥과 왼쪽 다리가 번갈아 힘을 쓴다. 어깨가 저절로 올라가 잠깐 멈춘다.';
      return `몸의 반응 · ${text}${s.body.underarm > 0 ? ' 겨드랑이 옆에 닿던 천이 쓸리는 느낌도 있어 팔의 긴장을 풀고 쉰다.' : ' 오른발목은 움직임이 끝나도 둔하게 욱신거린다.'}`;
    }
    if (effect === 'desk') return `몸의 반응 · ${s.body.back >= 5 ? '오른발을 피하려고 비스듬히 앉아 있었더니 등을 펴려 할 때 날개뼈 아래가 당긴다.' : '화면 쪽으로 숙였던 목과 등이 뻣뻣하다. 발을 조심하느라 상체가 기운 줄은 몰랐다.'} 손을 쉬고 자세부터 다시 고친다.`;
    if (effect === 'phone') return '몸의 반응 · 휴대폰을 들고 있던 어깨가 묵직하다. 팔을 받쳐 내려놓자 조금 편해지지만 발목의 욱신거림은 별개로 남아 있다.';
    if (effect === 'settle') return '몸의 반응 · 앉아서 손을 쉬게 하니 손바닥과 왼쪽 다리의 피로가 조금 가라앉는다. 발목은 여전히 묵직하게 욱신거린다.';
    return '몸의 반응 · 같은 자세로 오래 앉아 있으니 등 한쪽이 당긴다. 몸의 방향을 조금 바꾸고 팔을 내려놓는다.';
  }
  function getNode(s) {
    if (s.scenarioId && s.scenarioId !== 'classic') return scenes.getNode(s);
    const node = NODES[s.scene];
    if (!node) return null;
    return { sceneId: s.scene, time: node.time, title: node.title, step: node.step, lines: node.lines(s), eligibility: { eligible: true, matched: true, requestedSceneId: s.scene }, choiceIds: node.choices.map(c => c.id), contrastVariant: null, choices: node.choices.map(c => ({ ...c, effects: { energy: c.energy, mood: c.mood, body: { ...bodyEffects[c.effect] } }, followUpText: typeof c.lines === 'function' ? c.lines(s) : [...c.lines], journalTrace: c.trace, contrastVariant: null })) };
  }
  function chooseScenario(s, index) {
    const node = scenes.getNode(s);
    if (!node) return s;
    const resolved = typeof index === 'string' ? node.choices.findIndex(c => c.id === index) : index;
    if (!Number.isInteger(resolved) || resolved < 0 || resolved >= node.choices.length || s.decisions.length >= 5) return s;
    const ch = node.choices[resolved];
    const body = { ...s.body };
    const changes = bodyEffects[ch.effect];
    if (!changes) throw new Error(`알 수 없는 장면의 신체 반응: ${ch.effect}`);
    for (const key of BODY_KEYS) body[key] = Math.max(key === 'ankle' ? 2 : (s.body[key] >= 4 && (changes[key] || 0) < 0 ? 1 : 0), clamp(s.body[key] + (changes[key] || 0)));
    const next = {
      ...s, step: Math.min(5, s.decisions.length + 2), energy: clamp(s.energy + ch.energy), mood: clamp(s.mood + ch.mood), body,
      flags: [...s.flags], traces: [...s.traces, ch.journalTrace], decisions: [...s.decisions, ch.title], choiceIds: [...s.choiceIds, ch.id],
      history: [...s.history], context: scenes.applyEffects(s.context, ch.effects), focus: ch.focus,
      affinity: { ...s.affinity, [ch.focus]: s.affinity[ch.focus] + ch.weight },
      motion: { ...ch.motion, energyBefore: s.energy, energyAfter: clamp(s.energy + ch.energy) }
    };
    next.reaction = { title: node.title, lines: [...ch.followUpText, sensation(next, ch.effect)] };
    next.moment = next.reaction.lines[0];
    const action = { sceneId: node.sceneId, choiceId: ch.id, requests: (ch.effects.requests || []).map(r => ({ ...r })), environmentAction: ch.effects.environment ? ch.effects.environment.action : null };
    next.context.actions.push(action);
    next.history.push({ id: ch.id, choiceId: ch.id, sceneId: node.sceneId, title: ch.title, time: node.time, trace: ch.journalTrace, journalTrace: ch.journalTrace, reaction: { title: next.reaction.title, lines: [...next.reaction.lines] }, body: { ...body }, motion: { ...next.motion }, facts: [...(ch.effects.facts || [])], actions: action, focus: ch.focus, eligibility: { ...node.eligibility } });
    return scenes.prepare(next);
  }
  function choose(s, index) {
    if (s.scenarioId && s.scenarioId !== 'classic') return chooseScenario(s, index);
    const node = NODES[s.scene];
    if (node && typeof index === 'string') index = node.choices.findIndex(c => c.id === index);
    if (!node || !Number.isInteger(index) || index < 0 || index >= node.choices.length || s.decisions.length >= 5) return s;
    const ch = node.choices[index];
    const nextBody = { ...s.body };
    const effects = bodyEffects[ch.effect];
    for (const key of BODY_KEYS) {
      // A moment's relief does not cure the injury; accumulated soreness can linger.
      const floor = key === 'ankle' ? 2 : (s.body[key] >= 4 && (effects[key] || 0) < 0 ? 1 : 0);
      nextBody[key] = Math.max(floor, clamp(s.body[key] + (effects[key] || 0)));
    }
    const next = {
      ...s, scene: ch.next, step: Math.min(5, s.decisions.length + 2), route: ch.route || s.route,
      energy: clamp(s.energy + ch.energy), mood: clamp(s.mood + ch.mood), body: nextBody,
      flags: [...new Set([...s.flags, ...(ch.flags || [])])], traces: [...s.traces, ch.trace],
      decisions: [...s.decisions, ch.title], choiceIds: [...(s.choiceIds || []), ch.id], affinity: { ...s.affinity, [ch.focus]: s.affinity[ch.focus] + ch.weight },
      focus: ch.focus, motion: { ...ch.motion, energyBefore: s.energy, energyAfter: clamp(s.energy + ch.energy) }, history: [...s.history]
    };
    const lines = typeof ch.lines === 'function' ? ch.lines(s, next) : [...ch.lines];
    next.reaction = { title: ch.reactionTitle, lines: [...lines, sensation(next, ch.effect)] };
    next.moment = next.reaction.lines[0];
    next.history.push({ id: ch.id, choiceId: ch.id, sceneId: s.scene, title: ch.title, time: node.time, trace: ch.trace, journalTrace: ch.trace, reaction: { title: next.reaction.title, lines: [...next.reaction.lines] }, body: { ...nextBody }, motion: { ...next.motion }, facts: [ch.trace], focus: ch.focus });
    return next;
  }
  function determineEnding(s) {
    // Every decision contributes. Ties use the latest related choice, not a fixed winning route.
    let best = -1;
    let winners = [];
    for (const key of ENDING_KEYS) {
      const score = s.affinity[key];
      if (score > best) { best = score; winners = [key]; }
      else if (score === best) winners.push(key);
    }
    const withContext = ending => {
      if (!s.scenarioId || s.scenarioId === 'classic') return ending;
      const lastFacts = s.context.facts.slice(-3);
      const pending = s.context.needs.water === 'pending' || s.context.needs.utensils === 'pending';
      return { ...ending, body: `${lastFacts.map(fact => /[.!?]$/.test(fact) ? fact : `${fact}.`).join(' ')}${pending ? ' 물과 식기는 아직 받지 않았다.' : ''}`, takeaway: `오늘 한 일 · ${s.traces.slice(-2).join(' / ')}` };
    };
    if (winners.includes(s.focus)) return withContext(ENDINGS[s.focus]);
    for (let i = s.history.length - 1; i >= 0; i--) {
      const entry = s.history[i];
      const ch = entry.focus ? entry : Object.values(NODES).flatMap(node => node.choices).find(c => c.id === entry.id);
      if (ch && winners.includes(ch.focus)) return withContext(ENDINGS[ch.focus]);
    }
    return withContext(ENDINGS[winners[0] || 'observe']);
  }
  function replay(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('재현할 기록을 확인해 주세요.');
    for (const key of Object.keys(input)) if (!['scenarioId', 'conditions', 'choiceIds'].includes(key)) throw new Error(`허용하지 않는 재현 항목: ${key}`);
    if (!Array.isArray(input.choiceIds) || input.choiceIds.length > 5 || input.choiceIds.some(id => typeof id !== 'string' || id.length > 80)) throw new Error('선택 ID는 다섯 개 이내의 문자열 목록이어야 합니다.');
    let state = freshState({ scenarioId: input.scenarioId, conditions: input.conditions });
    for (const choiceId of input.choiceIds) {
      const next = choose(state, choiceId);
      if (next === state) throw new Error(`현재 장면에서 할 수 없는 선택: ${choiceId}`);
      state = next;
    }
    return state;
  }
  const BODY_LABELS = { ankle: '오른쪽 발목', shoulder: '어깨', back: '등·허리', underarm: '겨드랑이 옆', palm: '손바닥', goodLeg: '몸을 받치는 왼쪽 다리' };
  const BODY_WORDS = {
    ankle: ['발목이 묵직함', '움직인 뒤 욱신거림', '자세를 바꿀 때마다 아픔'],
    shoulder: ['팔을 들면 어깨가 당김', '목발을 짚은 뒤 어깨가 뻐근함', '팔을 내려놓고 쉬고 싶을 만큼 뻐근함'],
    back: ['한 자세로 오래 있으면 조금 불편함', '등 한쪽과 허리가 뻣뻣함', '자세를 바꿀 때 날개뼈 아래가 당김'],
    underarm: ['지금은 크게 신경 쓰이지 않음', '옷과 목발이 닿던 부분이 쓸림', '팔을 몸에 붙이면 따끔거림'],
    palm: ['지금은 크게 신경 쓰이지 않음', '손잡이를 쥔 곳이 눌린 듯함', '손잡이를 놓아도 얼얼함'],
    goodLeg: ['몸을 받친 다리가 조금 당김', '허벅지와 종아리가 묵직함', '다시 일어서기 전에 쉬고 싶을 만큼 피곤함']
  };
  function bodyDescription(s) {
    return BODY_KEYS.map(key => ({ key, label: BODY_LABELS[key], value: s.body[key], text: s.body[key] === 0 ? '지금은 크게 불편하지 않음' : BODY_WORDS[key][s.body[key] >= 7 ? 2 : s.body[key] >= 3 ? 1 : 0] }));
  }
  return { freshState, NODES, ENDINGS, getNode, choose, determineEnding, bodyDescription, bodyContext, SCENARIOS: scenes.SCENARIOS, SCENARIO_VERSION: scenes.SCENARIO_VERSION, normalizeStart: scenes.normalizeStart, replay };
});
