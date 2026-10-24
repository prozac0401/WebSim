(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaturdayStory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // These are authored sensations for one fictional day, not clinical pain scores.
  const BODY_KEYS = ['ankle', 'shoulder', 'back', 'underarm', 'palm', 'goodLeg'];
  const ENDING_KEYS = ['flow', 'shared', 'outing', 'rest', 'observe', 'create'];
  const clamp = n => Math.max(0, Math.min(10, n));
  const freshState = () => ({
    scene: 'morning', step: 1, energy: 6, mood: 4, route: null,
    flags: [], traces: [], decisions: [], history: [], moment: '',
    body: { ankle: 3, shoulder: 1, back: 1, underarm: 0, palm: 0, goodLeg: 1 },
    affinity: Object.fromEntries(ENDING_KEYS.map(key => [key, 0])), focus: 'observe',
    reaction: null, motion: { kind: 'sit', location: 'room', caption: '오전 10시 12분. 소파에서 시작하는 토요일.', energyBefore: 6, energyAfter: 6 }
  });
  const motion = (kind, location, caption, destinationPose) => ({ kind, location, caption, ...(destinationPose ? { destinationPose } : {}) });
  const bodyEffects = {
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
        '오늘은 오른쪽 발목에 보조기가 있다. 일어나려다 먼저 발의 위치를 본다. 왼발에 힘을 모으자 허벅지가 단단해지고, 어깨도 덩달아 올라간다.',
        '목발은 소파 옆에 있다. 손은 두 개인데, 옮기고 싶은 것은 휴대폰과 물컵과 나. 벌써 하나가 남는다. 발걸음을 옮길 때마다 머릿속에 에너지 모니터가 그려진다.',
        '시간은 남아돈다. 발목은 남아돌지 않는다.'
      ],
      choices: [
        choice('morning-outside', '밖으로 나가고 싶다', '목적지보다 먼저 이동 방법부터', 'outside', 'transfer', 'outing', '현관까지의 첫 동선', '일단 현관까지', [
          '열쇠를 집으려다 다시 내려놓는다. 오늘은 직접 운전하지 않기로 했다. 택시든 동승이든, 차에 닿기 전의 길부터 확인해야 한다.',
          '손잡이를 짚고 몸을 옮긴다. 목발 끝, 왼발, 잠깐의 멈춤. 머릿속 에너지 막대가 한 칸씩 닳는 느낌이다. 현관까지의 힘만 쓰면 안 된다. 돌아와 다시 앉을 몫도 남겨 둔다.'
        ], motion('walk', 'hall', '오른발을 보호하며 짧게 이동하고, 현관 앞에서 멈춘다.'), { route: 'outside', energy: -1, mood: 0, weight: 2 }),
        choice('morning-inside', '집에서 새로운 세계에 빠져본다', '책상까지도 오늘은 작은 이동', 'inside', 'transfer', 'create', '책상에 도착한 아침', '책상은 가까운데', [
          '노트북까지의 거리는 짧다. 의자에 닿기 전 방향을 바꾸는 일이 더 오래 걸린다. 발목을 따라 몸 전체가 한 박자 늦어진다.',
          '앉고 나니 손바닥에 손잡이를 쥐었던 감각이 남는다. 머릿속 에너지 모니터에서 책상까지의 몇 걸음이 빠진다. 파일명은 아직 “새 문서”. 이 부분은 평소와 같다.'
        ], motion('walk', 'room', '소파에서 책상으로 이동한 뒤 조심스럽게 앉는다.', 'desk'), { route: 'inside', energy: -1, weight: 2 }),
        choice('morning-contact', '누군가와 연결되고 싶다', '안부 하나를 보내기 전의 망설임', 'contact', 'phone', 'shared', '연락처를 연 아침', '메시지의 첫 줄', [
          '“뭐 해?”를 썼다가 지운다. 할 말이 너무 없어서인지, 너무 많아서인지 모르겠다. 결국 연락처부터 천천히 내려본다.',
          '휴대폰을 들고 있던 팔을 쿠션에 내려놓는다. 발목을 다쳤는데 어깨의 자리를 먼저 찾게 된다.'
        ], motion('phone', 'room', '앉은 자리에서 휴대폰을 보고 팔을 내려놓는다.'), { route: 'contact', mood: 0, weight: 2 }),
        choice('morning-window', '창밖부터 바라본다', '아무것도 정하지 않은 채 창가로', 'window', 'transfer', 'observe', '창가에 놓은 의자', '창가 자리 예약', [
          '가까운 의자에 앉아 창밖을 본다. 유리까지 더 다가가고 싶지만 오늘의 자리는 여기로 정한다.',
          '밖에서는 누군가 신호를 놓치고 뛴다. 내 쪽에서는 목발 하나가 벽에 기대는 소리가 난다. 머릿속 에너지 모니터에 짧은 이동이 찍힌다. 토요일의 효과음이 달라졌다.'
        ], motion('walk', 'room', '창가 가까운 의자로 천천히 이동한다.', 'observe'), { route: 'window', energy: -1, mood: 0, weight: 2 })
      ]
    },
    outside: {
      time: '11:03 · 현관 앞', step: 2, title: '지도에 없는 거리',
      lines: () => [
        '네이버지도를 연다. 이야기 속 목적지까지 300미터, 화면에는 4분. 현관에서 신발을 정리하는 데 이미 그만큼 쓴 것 같다. 그 숫자는 오늘의 내 손바닥까지 설명하지는 못한다.',
        '자동문인지, 문턱이 있는지, 기다리며 앉을 곳이 있는지. 평소에는 메뉴 뒤에 있던 정보들이 오늘은 메뉴보다 앞에 온다.',
        '목발 손잡이를 쥐고 있으면 양손이 바쁘다. 무거운 문을 여는 일과 몸을 지탱하는 일을 동시에 할 수는 없다. 지도에는 갈 길을 띄우고, 머릿속에는 돌아올 에너지를 따로 남겨 둔다.'
      ],
      choices: [
        choice('outside-ride', '동승이나 택시로 잠깐 나가본다', '동행과 문 앞 승하차, 앉을 자리 확인', 'outing_lunch', 'walk', 'outing', '상가 로비까지의 짧은 외출', '가까운 곳의 긴 입장', [
          '동행이 문을 잡아준다. 차 문과 좌석 사이에서 잠깐 멈춰 다리의 자리를 잡는다. 출발도 전에 “잠깐만”을 두 번 말했다.',
          '확인해 둔 상가 출입구로 들어가 1층 로비 의자에 앉는다. 가려던 카페는 2층이다. 간판보다 먼저 계단과 엘리베이터 표지를 본다. 입구까지 왔다고 오늘의 이동이 끝난 것은 아니다.'
        ], motion('walk', 'street', '동행이 잡아준 상가 출입구를 지나 1층 로비 의자까지 이동한다.', 'sit'), { energy: -2, mood: 1, flags: ['outing', 'at_lobby'], weight: 4 }),
        choice('outside-access', '출입구와 쉬는 곳부터 확인한다', '가까운 곳의 조건을 찾는 시간', 'lunch', 'phone', 'outing', '처음 저장한 출입구 사진', '사진에서 빠진 한 칸', [
          '네이버지도의 업체 사진은 디저트를 아주 잘 보여준다. 바닥은 거의 보이지 않는다. 거리뷰와 출입구 사진을 번갈아 보고, 전화로 문턱과 좌석을 묻자 상대도 입구를 다시 보러 간다.',
          '계단 없는 길을 저장한다. 오늘 나가지 않아도 이 검색은 끝난 일이다. 휴대폰을 내려놓을 때 목 뒤가 조금 뻣뻣하다.'
        ], motion('phone', 'hall', '현관 의자에 앉아 출입구와 휴식 공간을 확인한다.'), { mood: 0, flags: ['access'], weight: 4 }),
        choice('outside-reroute', '계획을 바꾸고 집에서 여행을 만든다', '지도에 저장해 두고 몸은 집 안에', 'lunch', 'settle', 'create', '지도 위에 만든 가상 여행', '여행의 다른 탭', [
          '외출 준비물을 다시 풀고, 네이버지도에 저장한 골목 하나를 연다. 문을 통과하는 일보다 탭을 바꾸는 일이 오늘은 훨씬 간단하다.',
          '“언젠가” 목록에 작은 빵집을 넣는다. 여행 계획은 남고, 오늘의 외출은 접힌다. 아쉬움까지 함께 접히지는 않는다.'
        ], motion('sit', 'room', '외출 계획을 접고 의자에 앉아 지도를 펼친다.'), { energy: 1, mood: -1, flags: ['reroute'], weight: 4 }),
        choice('outside-door', '문 앞에서 돌아와 쉬기로 한다', '택배는 안쪽에 놓아 달라고 부탁', 'lunch', 'rest', 'rest', '문 앞에서 바꾼 오늘의 계획', '택배보다 먼저 나를', [
          '문 앞의 작은 상자를 보고 잠깐 계산한다. 손이 모자란다. 상자를 들고 이동하는 대신 안쪽에 놓아 달라고 부탁한다.',
          '의자로 돌아와 길게 숨을 내쉰다. 상자에는 특별한 것이 없었다. 어제 주문한 양말. 양말 하나가 꽤 큰 동선을 만들었다.'
        ], motion('rest', 'hall', '문 앞 이동을 멈추고 가까운 의자에서 쉰다.'), { energy: 2, mood: 0, flags: ['rest', 'help'], weight: 4 })
      ]
    },
    inside: {
      time: '11:08 · 책상 앞', step: 2, title: '집 안에 열린 입구',
      lines: () => [
        '화면에는 어디로든 갈 수 있는 버튼이 가득하다. 의자에는 편한 자세가 딱 하나도 없는 것 같다.',
        '오른발을 피해서 앉다 보니 몸통이 살짝 비틀려 있다. 허리 뒤에 빈 공간이 느껴져 쿠션을 옮긴다. 노트북도 같이 옮긴다. 이제 충전선이 짧다.',
        '자리 잡기 프로젝트는 여기까지. 오늘은 완성할 필요 없는 무언가를 하나 고른다.'
      ],
      choices: [
        choice('inside-puzzle', '낯선 퍼즐 게임에 들어간다', '자세를 바꾸며 한 문제씩', 'lunch', 'desk', 'flow', '새로운 퍼즐의 첫 해답', '정답보다 이상한 다음 문제', [
          '첫 문제를 풀자 더 이상한 문제가 나온다. 숫자 하나를 옮기고, 되돌리고, 또 옮긴다. 검색창보다 이 작은 판이 넓다.',
          '막힌 곳에서 화면을 멈춘다. 의자에 등을 기대니 그동안 앞으로 기울어 있었음을 알겠다. 문제는 기다려준다.'
        ], motion('desk', 'room', '책상에서 퍼즐을 풀다가 손을 놓고 자세를 바꾼다.'), { energy: -1, mood: 2, flags: ['flow'], weight: 4 }),
        choice('inside-write', '엉뚱한 게임의 첫 장면을 써본다', '주인공에게도 물컵은 먼 곳에', 'lunch', 'desk', 'create', '토요일 게임의 첫 문장', '파일명: 최종_아님', [
          '“주인공은 물을 마시고 싶었다.” 써 놓고 웃는다. 오늘이라면 충분히 큰 사건이다. 버튼 이름도 하나 적는다. “일단 앉기”.',
          '완성 대신 저장을 누른다. 손가락은 더 쓸 수 있는데 등은 다른 자세를 요구한다. 문장 중간에 빈 줄을 남긴다.'
        ], motion('desk', 'room', '짧은 이야기를 쓰고 등받이에 몸을 맡긴다.'), { energy: -1, mood: 2, flags: ['create'], weight: 4 }),
        choice('inside-video', '전혀 모르는 분야의 영상을 틀어본다', '추천 영상 대신 궁금한 단어 하나', 'lunch', 'observe', 'observe', '뜻밖에 알게 된 낯선 단어', '문어는 오늘도 바쁘다', [
          '문어가 항아리를 여는 영상을 본다. 팔이 여덟 개다. 물컵과 휴대폰과 목발을 떠올리니 아주 실용적인 숫자로 보인다.',
          '다음 영상 대신 모르는 단어 하나를 적는다. 팔을 내려놓자 어깨가 조금 낮아진다. 궁금증은 남겨 둔다.'
        ], motion('observe', 'room', '화면을 바라보다 팔을 내려놓고 기대어 앉는다.'), { mood: 1, flags: ['discovery'], weight: 4 }),
        choice('inside-listen', '화면을 닫고 소리만 들어본다', '좋아하는 앨범 한 면, 편한 자리에서', 'lunch', 'rest', 'rest', '화면 없이 들은 한 곡', '노트북의 쉬는 시간', [
          '몇 번이나 자세를 고친 뒤 결국 화면을 닫는다. 스피커에서 익숙한 전주가 나온다. 오늘은 재생 버튼만 눌러도 된다.',
          '잘 듣던 노래에서 작은 기타 소리가 들린다. 새 발견이라고 적기엔 귀찮다. 기록하지 않고 그대로 듣는다.'
        ], motion('rest', 'room', '화면을 닫고 다리를 받친 채 음악을 듣는다.'), { energy: 2, mood: 0, flags: ['rest'], weight: 4 })
      ]
    },
    contact: {
      time: '11:06 · 연락처', step: 2, title: '가장 가까운 먼 곳',
      lines: () => [
        '같은 동네에 살아도 한동안 못 본 사람들이 있다. 만나자는 말을 쓰다가, 오늘은 어떤 방식이 가능한지 먼저 생각한다.',
        '“발목만 다쳤는데 왜 온몸이 바쁘냐.” 혼잣말을 하고 보니 그대로 보내도 될 것 같다.',
        '상대도 자기 토요일을 보내는 중이다. 답이 빨리 와야만 성립하는 안부로 만들지는 않기로 한다.'
      ],
      choices: [
        choice('contact-message', '뜬금없이 안부 하나를 보낸다', '“뭐 해? 그냥 생각나서.”', 'lunch', 'phone', 'shared', '보낸 안부 한 줄', '읽지 않음도 한 장면', [
          '메시지를 보내고 화면을 엎어 둔다. 다시 들었다가, 또 내려놓는다. 작은 숫자 하나를 관찰하는 취미가 생길 뻔했다.',
          '답장은 아직 오지 않는다. 상대의 토요일도 진행 중일 것이다. 안부를 보낸 일과 기다리는 기분이 같은 속도로 움직이지는 않는다.'
        ], motion('phone', 'room', '짧은 안부를 보내고 화면을 내려놓는다.'), { mood: 0, flags: ['connection'], weight: 4 }),
        choice('contact-help', '필요한 도움을 구체적으로 부탁한다', '“물병을 책상까지 옮겨 줄 수 있어?”', 'lunch', 'settle', 'shared', '구체적으로 부탁한 물병 하나', '괜찮냐는 말의 다음', [
          '“괜찮아” 대신 필요한 것을 말한다. 물병과 간식을 손 닿는 곳에 옮겨 달라고 부탁한다. 설명하고 나니 부탁의 크기가 보인다.',
          '상대는 오후에 들를 수 있다고 한다. 당장 모든 것이 해결되진 않지만, 오늘의 왕복 몇 번은 줄어들겠다.'
        ], motion('phone', 'room', '앉아서 필요한 도움과 가능한 시간을 이야기한다.'), { energy: 1, flags: ['help', 'scheduled_help'], weight: 4 }),
        choice('contact-call', '오랜만에 목소리를 들어본다', '편히 기대어 별일 없는 통화', 'lunch', 'phone', 'shared', '낯익은 목소리와 점심 메뉴', '대화의 절반은 메뉴', [
          '통화의 절반은 점심 메뉴 이야기다. 상대는 국수를 먹겠다더니 끝날 때는 김밥으로 바꿨다. 계획 변경 전문가가 여기에도 있었다.',
          '휴대폰을 받쳐 두고 어깨에 들어간 힘을 푼다. 웃고 난 뒤 발목은 여전히 묵직하다. 재미와 불편함은 같은 자리에 있을 수 있다.'
        ], motion('phone', 'room', '통화하며 팔을 받치고 어깨의 힘을 푼다.'), { energy: -1, mood: 2, flags: ['connection'], weight: 4 }),
        choice('contact-draft', '보내지 않을 편지를 써본다', '누군가를 설득하지 않는 이야기', 'lunch', 'desk', 'create', '전송하지 않은 긴 안부', '전송 버튼 없는 대화', [
          '“사실 좀 짜증 나.” 첫 줄이 짧다. 다음 줄에는 아침부터 몇 번을 앉았다 일어났는지 쓴다. 세다가 잊어서 “여러 번”으로 고친다.',
          '상대의 대답을 상상하는 대신 저장한다. 보내지 않아도 글은 남는다. 무조건 괜찮다고 마무리하지 않은 것이 마음에 든다.'
        ], motion('desk', 'room', '앉은 자리에서 편지를 쓰고 저장한다.'), { mood: 0, flags: ['create'], weight: 4 })
      ]
    },
    window: {
      time: '11:14 · 창가', step: 2, title: '창문을 통한 원정',
      lines: () => [
        '버스가 지나가고, 가게 문이 열리고, 배달원이 같은 현관을 두 번 들여다본다. 창밖도 의외로 시행착오가 많다.',
        '오른발을 계속 의식하니 왼쪽 엉덩이에 체중이 몰린다. 앉아 있는데도 자리를 조금씩 다시 잡게 된다.',
        '오늘을 증명하는 사진은 필요 없다. 그래도 눈에 들어오는 것을 하나쯤 남겨 볼까.'
      ],
      choices: [
        choice('window-photos', '같은 풍경을 세 장의 사진으로 남긴다', '일어나지 않고 빛과 구도만 바꾸기', 'lunch', 'observe', 'observe', '창밖 사진 세 장', '움직인 것은 구도', [
          '의자에서 휴대폰의 방향만 바꾼다. 첫 장은 하늘, 두 번째는 전선, 세 번째는 유리에 비친 내 양말이다.',
          '양말 사진이 제일 낫다. 사진 실력인지 피사체의 협조인지 모르겠다. 팔을 내리자 겨드랑이 옆의 당김이 덜 느껴진다.'
        ], motion('observe', 'room', '의자에 앉아 창밖을 세 구도로 담고 팔을 내린다.'), { mood: 1, flags: ['observe', 'photos'], weight: 4 }),
        choice('window-story', '지나가는 사람들의 목적지를 상상한다', '갈색 가방에서 시작하는 짧은 이야기', 'lunch', 'observe', 'create', '길 위의 짧은 이야기', '갈색 가방의 비밀', [
          '갈색 가방을 든 사람은 면접에 가는 걸까, 빵을 사러 가는 걸까. 가방에서 대파가 보인다. 이야기는 장르를 바꾼다.',
          '메모에 등장인물 하나를 적는다. 창밖의 사람은 아무 일 없이 모퉁이를 돈다. 내 이야기와 실제 목적지는 따로 간다.'
        ], motion('observe', 'room', '창가에 앉아 짧은 이야기를 적는다.'), { mood: 2, flags: ['create'], weight: 4 }),
        choice('window-rest', '20분 동안 아무것도 하지 않는다', '빈 시간을 채우지 않고 두어 보기', 'lunch', 'rest', 'rest', '아무것도 하지 않은 20분', '심심함의 해상도', [
          '처음 몇 분은 휴대폰을 찾는다. 그다음에는 냉장고 소리와 먼 차 소리가 들린다. 특별히 평온해지지는 않는다. 그냥 조금 덜 바쁘다.',
          '받쳐 둔 다리의 위치를 다시 잡는다. 어깨가 내려가도 발목 안쪽의 둔한 박동은 남는다. 쉬는 장면에도 몸은 있다.'
        ], motion('rest', 'room', '창가에서 등을 기대고 다리를 받친 채 쉰다.'), { energy: 2, mood: 0, flags: ['rest'], weight: 4 }),
        choice('window-route', '창밖의 문턱과 길을 눈으로 따라간다', '경사로가 어디로 이어지는지', 'lunch', 'observe', 'outing', '창밖에서 찾은 끊긴 동선', '경사로의 끝', [
          '건너편 경사로를 따라 시선을 옮기니 끝에 주차된 자전거가 있다. 경사로가 있다는 사실과 지나갈 수 있다는 사실이 다르다.',
          '가까운 길의 다른 입구를 지도에 표시한다. 내일 가겠다는 약속은 하지 않는다. 우선 오늘 보인 것을 남긴다.'
        ], motion('observe', 'room', '창가에서 출입구와 길의 연결을 관찰한다.'), { mood: 0, flags: ['access', 'observe'], weight: 4 })
      ]
    },
    outing_lunch: {
      time: '13:16 · 상가 1층 로비', step: 3, title: '2층이라는 아주 구체적인 거리',
      lines: () => [
        '네이버지도에서는 같은 점 안에 있던 1층과 2층이 눈앞에서 갈라진다. 계단은 올라갈 수 있다. 다만 오늘은 한 층에도 몸 전체가 참가해야 한다.',
        '계단참과 난간, 동행이 기다릴 자리부터 본다. 머릿속 에너지 모니터에는 올라가는 몫과 내려오는 몫이 따로 그려진다. 평범한 계단이 곡예 동선처럼 복잡해 보이는 날이다.',
        '버거킹 앱의 등급과 쿠폰함도 열어 본다. 오늘 눈에 띈 매장 행사는 딜리버리 제외다. 별도로 뜨는 배달 혜택도 살펴본다. 오래 쓴 앱인데, 지금 끌리는 할인과 지금 가능한 주문이 어긋난다.',
        '이 상가에는 뒤편 엘리베이터와 1층에서 해결할 점심도 있다. 어떤 이동을 할지는 여기서 다시 고를 수 있다.'
      ],
      choices: [
        choice('outing-stairs', '중간에 쉬어 가며 2층에 올라간다', '동행과 함께, 올라간 뒤 앉을 자리까지', 'afternoon', 'stairs', 'outing', '계단참에서 쉬어 간 2층', '한 층에 온몸이 참가한다', [
          '서두르지 않고 계단을 오른다. 한 칸을 옮긴 뒤 몸을 다시 정돈하는 시간이 붙는다. 누가 보면 한 층인데, 내 머릿속에서는 에너지 모니터가 여러 번 갱신된다. 계단참에서 동행과 잠깐 쉰다.',
          '2층에 닿아 의자에 앉는다. 숨이 가라앉는 동안 어깨 앞과 겨드랑이 옆은 뻐근하고, 등은 비스듬히 버티던 자세를 기억한다. 왼쪽 허벅지가 뒤늦게 떨린다. 못 가는 곳은 아니었다. 그렇다고 아무 일 없는 한 층도 아니었다. 내려갈 몫을 남겨 두고 더 쉰다.'
        ], motion('stairs', 'stairs', '계단참에서 멈춰 쉬며 실제로 2층까지 올라가, 도착한 뒤 앉아 숨을 돌린다.', 'sit'), { energy: -2, mood: 0, flags: ['stairs_taken'], weight: 2 }),
        choice('outing-elevator', '뒤편 엘리베이터를 확인해 2층으로 간다', '조금 돌아가되 오르내리는 힘을 줄이기', 'afternoon', 'walk', 'observe', '뒤편에서 찾은 엘리베이터', '같은 층으로 가는 다른 길', [
          '동행이 안내를 확인하고 뒤편 문을 잡아 준다. 건물을 조금 돌아 엘리베이터에 탄다. 층수 표시가 바뀌는 동안 목발 손잡이를 쥔 힘을 잠깐 늦춘다.',
          '2층 의자에 앉는다. 동선은 더 길어졌지만 계단에 쓸 힘은 남았다. 편한 길이 반드시 가장 짧은 선은 아니었다. 네이버지도 저장 메모에 “뒤편 출입”을 덧붙인다.'
        ], motion('walk', 'hall', '뒤편 엘리베이터를 이용해 2층으로 간 뒤 가까운 의자에 앉는다.', 'sit'), { energy: -1, mood: 1, flags: ['elevator_used', 'access_note'], weight: 3 }),
        choice('outing-pickup', '1층에서 버거킹 픽업으로 점심을 바꾼다', '사용 가능한 혜택과 수령 조건을 확인', 'afternoon', 'settle', 'shared', '동행과 나눠 든 점심', '할인보다 먼저 봉투의 손잡이', [
          '내 주문에 적용되는 픽업 혜택을 확인하고 1층에서 점심을 해결한다. 회원 등급이 모든 주문 방식을 같게 만들어 주지는 않는다. 오늘 화면에 뜬 혜택 안에서 고른다.',
          '봉투를 받는 순간 양손이 목발에 있다는 사실이 다시 나타난다. 동행이 음식과 음료를 옮겨 준다. 할인액만 비교하던 계산에 “운반할 손”이 추가된다. 먹을 자리에 앉으니 그 항목이 제일 컸다.'
        ], motion('sit', 'street', '1층에서 동행과 점심을 받아 앉고, 봉투 운반을 나눈다.'), { energy: 0, mood: 1, flags: ['pickup_help', 'connection'], weight: 3 }),
        choice('outing-delivery', '돌아가서 배민 배달로 점심을 정한다', '돌아갈 힘을 먼저 남기고 주문 비교', 'afternoon', 'settle', 'rest', '귀가에 남겨 둔 에너지', '할인과 왕복 사이', [
          '로비에서 더 올라가지 않고 동행과 귀가한다. 아까 버거킹 앱에서 본 매장 행사는 접어 둔다. “아, 이건 못 쓰네.” 배민을 새로 열어 이 주문의 배달과 픽업 조건을 따로 확인한다. 놓친 할인의 아쉬움도 실제다.',
          '별도의 배달 혜택과 총 주문 금액을 확인하고 배달을 고른다. 오늘은 할인 하나보다 추가 왕복을 줄이는 쪽에 마음이 간다. 도착한 봉투를 옮길 자리도 가까이 비워 둔다. 편해졌다고 공짜가 된 선택은 아니다.'
        ], motion('sit', 'room', '동행과 귀가한 뒤 배달 조건을 비교하고 앉아서 점심을 기다린다.'), { energy: 0, mood: 0, flags: ['delivery', 'returned_home'], weight: 3 })
      ]
    },
    lunch: {
      time: '13:16 · 오후의 시작', step: 3, title: '물 한 컵의 동선',
      lines: s => [
        has(s, 'scheduled_help') ? '부탁한 물건을 옮겨 줄 사람이 올 때까지, 지금 손 닿는 곳에 무엇이 있는지 살펴본다.'
          : s.route === 'inside' ? '화면에서 눈을 떼자 목이 마르다. 물은 부엌에 있고 나는 의자에 있다. 아주 오래된 퍼즐의 새 버전이다.'
          : s.route === 'contact' ? '휴대폰을 잠깐 내려놓자 집 안이 조용하다. 물 한 잔을 가지러 가려다, 컵을 든 채 돌아올 방법부터 생각한다.'
          : '창가 그림자가 길어졌다. 물 한 잔이 생각나는데 컵은 여전히 부엌에 있다.',
        '점심을 고르려고 버거킹 앱의 등급 표시와 쿠폰함을 연다. 오늘 눈에 띈 매장 행사는 딜리버리 제외다. 버거킹의 배달 혜택도 별도로 살핀 뒤, 배민을 열어 그쪽 주문의 할인과 총액을 따로 비교한다. 익숙한 할인과 지금 쓸 수 있는 할인이 다르니 조금 아쉽다.',
        '네이버지도로 픽업 동선을 보다가 물컵을 본다. 음식값 옆에 머릿속 에너지 모니터를 띄운다. 일어나기, 문 열기, 받아 오기, 다시 앉기. 오늘은 왕복이 전부 동작 하나씩이다.',
        '“가기 싫다”와 “가기 어렵다”는 다른 말이었다. 지금의 계획은 어떻게 바꿔 볼까?'
      ],
      choices: [
        choice('lunch-reroute', '배민으로 주문하고 동선을 줄인다', '배달 조건을 확인하고 물병도 가까이', 'afternoon', 'settle', 'outing', '배달과 물병으로 줄인 왕복', '컵보다 물병, 할인보다 동선', s => [
          has(s, 'scheduled_help') ? '배민에서 오늘 주문에 적용되는 배달 혜택과 총액을 확인한다. 오후에 들른 사람이 봉투와 물병을 옮겨 준다. 부탁했던 목록에 충전기 하나를 보탠다.' : '배민에서 오늘 주문에 적용되는 배달 혜택과 총액을 확인한다. 아까 본 매장 할인은 못 쓰지만 픽업 왕복은 줄어든다. 도착한 봉투를 둘 자리와 뚜껑 있는 물병도 가까이 정한다.',
          '쿠폰 하나가 아까워 앱을 한 번 더 열었다가 닫는다. 방의 크기는 그대로인데 필요한 거리는 줄었다. 마음속 에너지 예산에 오후에 쓸 여지가 조금 생긴다.'
        ], motion('sit', 'room', '배달 조건을 비교하고 물병과 음식을 손 닿는 자리에 둔다.'), { energy: 1, mood: 0, flags: ['reroute', 'delivery'], weight: 2 }),
        choice('lunch-note', '지금 느낀 것을 짧게 기록한다', '문턱 높이보다 양손이 비는지', 'afternoon', 'desk', 'observe', '문턱과 양손에 관한 메모', '지도에 적지 않는 것', [
          '메모에 “입구 낮음”을 적다가 “문은 무거움”을 덧붙인다. 높이 하나만으로는 오늘의 길을 설명할 수 없다.',
          '“가까운 거리도 누구에게나 가깝지는 않다.” 적어 놓고, 그 아래에 더 구체적인 말도 쓴다. “컵을 들 손이 없었음.”'
        ], motion('desk', 'room', '이동 중 발견한 문턱과 문의 조건을 앉아서 기록한다.'), { energy: -1, mood: 1, flags: ['access_note'], weight: 3 }),
        choice('lunch-rest', '오늘은 속도를 낮추기로 한다', '숨을 돌리고 몸이 편한 자리 찾기', 'afternoon', 'rest', 'rest', '스스로 정한 느린 속도', '잠깐이 길어져도', [
          '다음 일을 뒤로 미루고 의자에 깊이 앉는다. 목발에서 손을 떼자 손바닥의 눌린 감각이 더 또렷해진다. 쓰는 동안에는 몰랐다.',
          '휴대폰 알림을 한 번 끈다. 쉬는 동안에도 심심하고, 약간 짜증이 난다. 휴식에 알맞은 기분을 따로 준비할 필요는 없다.'
        ], motion('rest', 'room', '손잡이를 놓고 등을 기대며 다리를 받친다.'), { energy: 2, mood: 0, flags: ['rest'], weight: 3 }),
        choice('lunch-ask', '버거킹 픽업을 부탁하고 함께 먹는다', '상대의 동선과 수령 조건부터 확인', 'afternoon', 'settle', 'shared', '같이 고른 버거와 픽업 부탁', '누가 들고 오는지도 주문의 일부', [
          '가게 근처에 있는 사람에게 가능한지 먼저 묻는다. 상대가 들를 수 있다고 해, 주문과 수령 조건에 맞는 방식으로 메뉴를 정한다. 내 등급 표시를 보는 일보다 실제로 적용되는 혜택을 확인하는 일이 먼저다.',
          '음식과 음료가 책상에 도착한다. “아무거나” 대신 먹고 싶은 것과 필요한 도움을 말한 점심이다. 쿠폰을 쓸 수 있는 기쁨과 누군가 대신 움직여 준 시간이 함께 봉투에 담겼다.'
        ], motion('phone', 'room', '상대의 동선과 픽업 조건을 확인하고, 가져온 점심을 함께 먹는다.'), { energy: 1, mood: 1, flags: ['help', 'connection', 'pickup_help'], weight: 3 })
      ]
    },
    afternoon: {
      time: '16:24 · 오후의 빈칸', step: 4, title: '생각보다 남은 하루',
      lines: s => [
        has(s, 'stairs_taken') ? '2층에서 충분히 앉아 있다가 동행과 내려와 집에 돌아왔다. 올라갈 때만 생각했으면 곤란했겠다. 내려올 때에도 남겨 둔 힘을 썼고, 지금은 왼쪽 허벅지와 어깨에 한 층의 여운이 남아 있다.'
          : has(s, 'elevator_used') ? '2층에서 쉬었다가 엘리베이터로 내려와 귀가했다. 네이버지도에 저장한 “뒤편 출입” 메모가 오늘의 가장 실용적인 기록이다.'
          : has(s, 'pickup_help') ? (has(s, 'outing') ? '1층에서 점심을 먹은 뒤 동행과 집에 돌아왔다. 봉투를 옮겨 준 손과 돌아올 몫으로 남긴 힘이 함께 떠오른다. 평범한 한 끼에 필요한 역할이 오늘은 보였다.' : '점심 봉투가 비어 있다. 메뉴를 고른 사람, 주문을 확인한 사람, 봉투를 옮긴 사람. 평범한 한 끼에 필요한 역할이 오늘은 보였다.')
          : has(s, 'delivery') ? '배달받은 점심을 정리하고 앱을 닫는다. 놓친 매장 할인은 여전히 조금 아깝고, 추가 왕복을 하지 않은 몸은 조금 덜 지쳤다. 두 생각은 함께 있어도 된다.'
          : has(s, 'outing') ? '상가 로비에서 쉬던 순간이 떠오른다. 걸어간 거리보다 앉을 자리를 찾던 순간이 더 선명하다.'
          : has(s, 'create') ? '저장해 둔 문장을 다시 읽는다. 조금 어색하고, 조금 더 써 보고 싶다. 삭제 버튼은 아직 누르지 않는다.'
          : has(s, 'connection') || has(s, 'help') ? '대화의 일부가 남아 있다. 답장이 짧았던 사람도, 물건을 옮겨 준 사람도 각자의 오후로 돌아갔다.'
          : has(s, 'rest') ? '쉰 시간이 달력에 표시되지는 않는다. 그래도 방금 전보다 덜 힘주고 앉아 있는 것은 알겠다.'
          : '같은 창문과 같은 화면인데 아침과 빛이 다르다. 아무것도 바뀌지 않은 오후는 아니었다.',
        bodyContext(s),
        '아직 오후 4시 24분. 남은 시간에 하나만 더 해 본다면?'
      ],
      choices: [
        choice('afternoon-flow', '호기심 하나를 붙잡고 한 시간 빠져든다', '중간에 자세를 바꾸어도 이어지는 몰입', 'evening', 'desk', 'flow', '정신없이 빠져든 한 시간', '시간 도둑의 흔적', s => [
          has(s, 'flow') ? '아침에 막혔던 퍼즐을 다시 연다. 해결한 순간보다 다음 문제가 보였을 때 더 오래 웃는다. 타이머는 잠깐 멈추고 자리부터 고친다.' : has(s, 'create') ? '저장한 문장에서 다음 장면을 이어 간다. 주인공의 이름은 아직 없는데 물컵의 위치는 정확하다. 중간에 손을 놓았다가 다시 쓴다.' : '아까 눈에 걸린 궁금증 하나를 따라간다. 탭을 세 개 열었다가 두 개 닫는다. 하나를 오래 보는 동안 시계가 조금 잊힌다.',
          '시계를 보니 한 시간이 지났다. 몸이 불편한 줄 몰랐던 것은 아니다. 멈추고 자세를 바꾼 시간까지 그 한 시간 안에 있었다.'
        ], motion('desk', 'room', '책상에서 몰입하다가 중간중간 등과 팔의 자리를 바꾼다.'), { energy: -2, mood: 2, flags: ['flow'], weight: 4 }),
        choice('afternoon-share', '오늘 발견한 장면을 누군가에게 보낸다', '사진 한 장 또는 짧은 문장', 'evening', 'phone', 'shared', '누군가와 나눈 오늘의 장면', '설명은 두 줄이면', s => [
          has(s, 'photos') ? '사진을 고르다 양말이 비친 한 장을 보낸다. “오늘의 원정.” 설명은 짧게 썼다. 상대가 웃는 표시를 남긴다.' : has(s, 'access') || has(s, 'access_note') ? '문턱보다 문을 열 손이 문제였다는 이야기를 보낸다. 상대가 “그러네”라고 답한다. 바로 대단한 토론이 되지는 않는다.' : '오늘 남긴 흔적 하나를 보낸다. 특별한 소식처럼 포장하지 않는다. “이런 토요일도 있네.” 문장을 보내고 화면을 내려놓는다.',
          '반응이 더 오기를 기다리다가 다른 일을 본다. 보낸 이야기는 내 것이면서 이제 누군가의 화면에도 있다.'
        ], motion('phone', 'room', '짧은 사진이나 문장을 보내고 팔을 내려놓는다.'), { energy: -1, mood: 1, flags: ['share'], weight: 4 }),
        choice('afternoon-rest', '쉬면서 다음에 보고 싶은 풍경을 고른다', '날짜를 정하지 않는 다음 여행', 'evening', 'rest', 'rest', '다음 여행의 작은 단서', '언젠가 폴더', [
          '가 보고 싶은 곳을 하나 저장하고 화면을 끈다. 일정표는 만들지 않는다. 예약하지 않은 풍경도 사라지지는 않는다.',
          '등을 받치고 앉아 창문 쪽을 본다. 어깨의 뻐근함은 조금 누그러지지만 발목은 여전히 자기 차례를 주장한다. 다 나은 오후는 아니다.'
        ], motion('rest', 'room', '다리를 받치고 다음에 보고 싶은 풍경을 고른 뒤 쉰다.'), { energy: 2, mood: 0, flags: ['rest'], weight: 4 }),
        choice('afternoon-create', '오늘의 엉뚱한 장면으로 작은 것을 만든다', '짧은 만화든, 제목 하나든', 'evening', 'desk', 'create', '물컵 원정대의 작은 초안', '물컵 원정대', [
          '“물컵 원정대”라고 제목을 적는다. 지도에는 소파와 부엌만 있다. 최종 보스는 무거운 문이고 보물은 미지근한 물이다.',
          '스스로 웃고 저장한다. 아직 작품이라고 부르기엔 작다. 그렇다고 없던 일이 되지는 않는다. 나머지는 빈칸으로 둔다.'
        ], motion('desk', 'room', '책상에서 작은 초안을 만들고 손을 내려놓는다.'), { energy: -1, mood: 2, flags: ['create'], weight: 4 })
      ]
    },
    evening: {
      time: '20:16 · 토요일 저녁', step: 5, title: '오늘을 뭐라고 부를까?',
      lines: s => [
        '창밖이 어두워졌다. 아침에 멀게 느껴졌던 저녁이 별다른 안내 없이 도착했다.',
        s.mood >= 8 ? '좋았던 장면이 몇 개 남았다. 그렇다고 불편했던 순간까지 좋은 일이 되지는 않는다.' : '대단한 일은 없었다. 오늘을 아쉬워하는 마음까지 지울 필요는 없겠다.',
        s.body.shoulder >= 5 || s.body.back >= 5 ? '발목만 떠올렸던 아침과 달리 어깨와 등도 하루에 참여했다. 마지막으로 앉을 자리를 고친다.' : '몸의 불편함은 남아 있다. 오늘의 끝이 회복의 끝을 뜻하지는 않는다.',
        '마지막 한 번의 선택. 오늘을 설명해도, 설명하지 않아도 된다.'
      ],
      choices: [
        choice('evening-reflect', '의외로 남은 순간을 한 줄 적는다', '좋았던 것과 불편했던 것을 함께', 'end', 'settle', 'observe', '오늘의 마지막 한 줄', '한 줄에 들어간 하루', s => [
          `“${s.traces[s.traces.length - 1] || '창밖의 빛'}.” 흔적 하나를 적고, 오늘 불편했던 일도 옆에 쓴다. 어느 쪽도 지우지 않는다.`,
          '일기는 보고서보다 짧다. 다행이다. 토요일까지 제출 기한이 있으면 곤란하다.'
        ], motion('sit', 'room', '저녁의 빛 속에서 오늘의 한 줄을 남긴다.'), { mood: 0, flags: ['reflect'], weight: 2 }),
        choice('evening-future', '내일의 나에게 작은 선택 하나를 남긴다', '실행하지 않아도 되는 다음 장면', 'end', 'settle', 'create', '내일을 위한 실마리', '할 일 말고 하고 싶은 일', [
          '해야 할 일 목록 대신 궁금한 것 하나를 적는다. 내일 취소해도 된다는 문장도 붙인다. 약관이 짧은 약속이다.',
          '휴대폰을 손 닿는 곳에 두고 하루를 정리한다. 무엇을 완성했는지 세어 보지는 않는다.'
        ], motion('sit', 'room', '내일의 작은 선택을 적고 편히 앉는다.'), { flags: ['future'], weight: 2 }),
        choice('evening-close', '오늘은 이대로 닫는다', '설명하거나 증명하지 않고', 'end', 'rest', 'rest', '스스로 닫은 하루', '오늘은 여기까지', [
          '알림을 끄고 화면을 내려놓는다. 괜찮았다고 결론 내릴 필요도, 망쳤다고 이름 붙일 필요도 없다.',
          '가까운 곳에 필요한 것들을 둔다. 몸에 남은 피로와 함께 저녁을 보낸다. 내일의 이야기는 내일의 자리로 둔다.'
        ], motion('rest', 'room', '화면을 끄고 다리를 받친 채 저녁을 맞는다.'), { energy: 1, mood: 0, flags: ['accept'], weight: 2 }),
        choice('evening-voice', '오늘을 짧은 음성 메시지로 남긴다', '“별일은 없었는데 말이야.”', 'end', 'phone', 'shared', '토요일 끝의 짧은 목소리', '별일의 길이', [
          '“별일은 없었는데 말이야.”로 시작해서 생각보다 길게 말한다. 물컵 이야기에서 한 번 웃고, 힘들었다는 말도 그대로 둔다.',
          '전송하고 답장을 기다리지 않기로 한다. 내 토요일은 이 목소리만큼은 바깥으로 나갔다.'
        ], motion('phone', 'room', '앉은 자리에서 짧은 음성 메시지를 녹음한다.'), { flags: ['share'], weight: 2 })
      ]
    }
  };
  const ENDINGS = {
    flow: { id: 'flow', name: '시간 도둑을 만난 토요일', quote: '“시간이 멈춘 줄 알았는데, 어느 순간 시간이 사라져 있었다.”', body: '퍼즐이든 문장이든 다음 장면이 궁금한 순간이 있었다. 자세를 고치느라 멈춘 시간도 그 안에 포함된다. 불편함이 사라진 것은 아니지만 호기심도 자리를 잃지는 않았다.', takeaway: '오늘 남은 것 · 시계를 덜 보았던 한때.' },
    shared: { id: 'shared', name: '누군가에게 닿은 토요일', quote: '“몸은 제자리에 있었는데, 이야기는 멀리 갔다.”', body: '안부 하나를 보내거나, 구체적인 부탁을 건네거나, 별일 없는 대화를 나눈 순간이 있었다. 답장이 어땠든 오늘의 모든 불편이 해결된 것은 아니다. 그래도 혼자 계획하던 하루에 누군가를 향한 작은 자리가 생겼다.', takeaway: '오늘 남은 것 · 누군가를 향한 짧은 안부.' },
    outing: { id: 'outing', name: '300미터의 대모험', quote: '“지도에 없던 거리가 오늘 처음 보였다.”', body: '실제로 나갔든 길의 조건을 알아봤든, 300미터에 들어 있는 문과 의자와 기다림을 보았다. 거리는 그대로인데 필요한 시간과 손의 수가 달랐다. 오늘은 그 차이를 조금 더 구체적으로 말할 수 있다.', takeaway: '오늘 남은 것 · 지도에 표시되지 않는 동선.' },
    rest: { id: 'rest', name: '제대로 멈춘 토요일', quote: '“멈춰야 했던 하루에, 멈추기로 한 순간도 있었다.”', body: '쉬기로 해도 심심함이나 아쉬움이 곧장 없어지지는 않았다. 그래도 오늘의 계획 몇 개를 내려놓고, 몸이 머물 자리를 골랐다. 아무것도 증명하지 않은 시간 역시 토요일의 일부로 남았다.', takeaway: '오늘 남은 것 · 잠깐 낮춘 속도.' },
    observe: { id: 'observe', name: '창가의 탐험가', quote: '“멀리 가지 않았는데, 전에는 보이지 않던 게 보였다.”', body: '빛의 방향과 문턱, 양손으로 해야 하는 일과 가까운 의자가 눈에 들어왔다. 관찰이 불편함을 보상해 주지는 않는다. 다만 익숙한 방과 거리에서 전에는 말하지 못했던 장면을 몇 개 찾았다.', takeaway: '오늘 남은 것 · 익숙한 풍경의 작은 차이.' },
    create: { id: 'create', name: '아직 끝나지 않은 토요일', quote: '“완성한 것은 없지만, 다음 장면이 궁금해졌다.”', body: '몇 줄의 문장과 덜 그린 그림, 아직 이름이 없는 계획을 남겼다. 끝내지 못한 것을 실패로 정리하지는 않았다. 내일 다시 열 수도 있고 한동안 두어도 되는 파일이 하나 생겼다.', takeaway: '오늘 남은 것 · 닫지 않은 다음 장면.' }
  };
  function bodyContext(s) {
    if (s.body.shoulder >= 5 && s.body.palm >= 3) return '오전의 짧은 이동이 어깨와 손바닥에 남아 있다. 앉은 뒤에야 손잡이를 얼마나 꼭 쥐었는지 느껴진다.';
    if (s.body.back >= 5) return '오래 앉아 있던 등이 뻣뻣하다. 아픈 발을 피하며 비스듬히 앉는 동안, 다른 곳도 힘을 쓰고 있었다.';
    if (s.body.goodLeg >= 3) return '주로 버텨 준 왼쪽 허벅지가 묵직하다. 멀쩡한 쪽이라는 이름이 피곤하지 않은 쪽이라는 뜻은 아니었다.';
    return '발목의 둔한 불편함은 계속 있다. 자세를 고칠 때마다 오늘 몸이 쓰는 자리가 조금씩 달라진다.';
  }
  function sensation(s, effect) {
    if (effect === 'stairs') return '몸의 반응 · 손잡이를 지탱하던 손바닥이 얼얼하고, 어깨 앞과 등 옆이 팽팽하다. 겨드랑이 옆은 천이 닿을 때 예민하다. 발목을 보호하는 동안 주로 버틴 왼쪽 다리도 묵직해져, 2층 의자에서 힘을 풀고 쉰다.';
    if (effect === 'rest') return '몸의 반응 · 손과 어깨에 실렸던 힘은 조금 줄었다. 발목의 묵직함과 오래 버틴 근육의 여운은 한 번의 휴식으로 모두 없어지지 않는다.';
    if (effect === 'walk' || effect === 'transfer') {
      const text = s.body.shoulder >= 5 ? '목발 손잡이를 누를 때 어깨 앞쪽이 뻐근하고, 손바닥에는 눌린 자리가 남는다.' : '짧게 몸을 옮기는 동안 손바닥과 왼쪽 다리가 번갈아 힘을 쓴다. 어깨가 저절로 올라가 잠깐 멈춘다.';
      return `몸의 반응 · ${text}${s.body.underarm > 0 ? ' 겨드랑이 옆에 닿던 천이 쓸리는 느낌도 있어 팔의 긴장을 풀고 쉰다.' : ' 오른발목은 움직임이 끝나도 둔하게 욱신거린다.'}`;
    }
    if (effect === 'desk') return `몸의 반응 · ${s.body.back >= 5 ? '오른발을 피해서 앉은 자세가 등에 남아, 등을 펴려 할 때 견갑골 아래가 당긴다.' : '화면 쪽으로 숙였던 목과 등이 뻣뻣해진다. 발을 조심하는 동안 상체의 자세는 뒤늦게 알아챈다.'} 손을 놓고 자리부터 다시 잡는다.`;
    if (effect === 'phone') return '몸의 반응 · 휴대폰을 들고 있던 어깨가 묵직하다. 팔을 받쳐 내려놓자 조금 편해지지만 발목의 욱신거림은 별개로 남아 있다.';
    if (effect === 'settle') return '몸의 반응 · 왕복을 줄이자 손바닥과 버티던 왼쪽 다리가 한숨 돌린다. 의자에 앉은 뒤에도 발목은 둔하게 존재를 알린다.';
    return '몸의 반응 · 같은 자리에 오래 앉자 등 한쪽이 당긴다. 몸의 방향을 조금 바꾸고 팔을 내려놓는다. 움직이지 않는 일에도 자세가 필요하다.';
  }
  function getNode(s) {
    const node = NODES[s.scene];
    if (!node) return null;
    return { time: node.time, title: node.title, step: node.step, lines: node.lines(s), choices: node.choices.map(c => ({ ...c })) };
  }
  function choose(s, index) {
    const node = NODES[s.scene];
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
      decisions: [...s.decisions, ch.title], affinity: { ...s.affinity, [ch.focus]: s.affinity[ch.focus] + ch.weight },
      focus: ch.focus, motion: { ...ch.motion, energyBefore: s.energy, energyAfter: clamp(s.energy + ch.energy) }, history: [...s.history]
    };
    const lines = typeof ch.lines === 'function' ? ch.lines(s, next) : [...ch.lines];
    next.reaction = { title: ch.reactionTitle, lines: [...lines, sensation(next, ch.effect)] };
    next.moment = next.reaction.lines[0];
    next.history.push({ id: ch.id, title: ch.title, time: node.time, reaction: { title: next.reaction.title, lines: [...next.reaction.lines] }, body: { ...nextBody }, motion: { ...next.motion } });
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
    if (winners.includes(s.focus)) return ENDINGS[s.focus];
    for (let i = s.history.length - 1; i >= 0; i--) {
      const entry = s.history[i];
      const ch = Object.values(NODES).flatMap(node => node.choices).find(c => c.id === entry.id);
      if (ch && winners.includes(ch.focus)) return ENDINGS[ch.focus];
    }
    return ENDINGS[winners[0] || 'observe'];
  }
  const BODY_LABELS = { ankle: '오른쪽 발목', shoulder: '어깨', back: '등·허리', underarm: '겨드랑이 옆', palm: '손바닥', goodLeg: '버티는 왼쪽 다리' };
  const BODY_WORDS = {
    ankle: ['신경이 쓰이는 묵직함', '움직인 뒤 남는 욱신거림', '자리를 고를 때마다 느껴지는 통증'],
    shoulder: ['팔을 들 때 느껴지는 긴장', '손잡이를 누르던 근육의 뻐근함', '팔을 내려놓고 싶은 묵직함'],
    back: ['한 자세가 조금 불편함', '등 한쪽과 허리의 뻣뻣함', '자세를 바꿀 때 견갑골 아래가 당김'],
    underarm: ['아직 두드러지지 않는 감각', '옷과 목발 주변이 닿던 자리의 쓸림', '팔을 붙일 때 느껴지는 예민함'],
    palm: ['아직 두드러지지 않는 감각', '손잡이를 쥔 자리의 압박감', '쥐었다 놓은 뒤에도 남는 얼얼함'],
    goodLeg: ['주로 버티던 쪽의 가벼운 긴장', '허벅지와 종아리에 남는 묵직함', '다시 일어서기 전 쉬고 싶은 피로']
  };
  function bodyDescription(s) {
    return BODY_KEYS.map(key => ({ key, label: BODY_LABELS[key], value: s.body[key], text: s.body[key] === 0 ? '지금은 두드러지지 않음' : BODY_WORDS[key][s.body[key] >= 7 ? 2 : s.body[key] >= 3 ? 1 : 0] }));
  }
  return { freshState, NODES, ENDINGS, getNode, choose, determineEnding, bodyDescription, bodyContext };
});
