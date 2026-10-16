(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Data = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ROLES = { worker: '직장인', seeker: '구직자', graduate: '대학원생', caregiver: '돌봄 중심' };
  const MARITAL_STATUSES = {single:'미혼',married:'기혼',unspecified:'이전 저장 · 설정하지 않음'};
  const base = { year: 2026, age: 32, gender: 'unspecified', maritalStatus:'single', personaName:'', lifeIntro:'', generationSeed:null, role: 'worker', children: 0, childAge: 'none', careShare: 50,
    housing: 'studio', region: 'city', transport: 'transit', salary: 2800000, externalAllowance: 0,
    personalBudget: 500000, fixedCosts: 1500000, startCash: 2000000, payDay: 1, cardLimit: 1500000,
    preferences: ['walk', 'photo'], seed: 2026 };
  const PRESETS = [
    { id: 'worker', name: '직장인 · 작은 집의 새해', description: '출근과 자격증, 주말의 약속 사이에서 생활을 조율합니다.', config: { ...base } },
    { id: 'seeker', name: '구직자 · 다음 문을 준비하며', description: '외부 용돈과 모아 둔 현금으로 공부와 면접을 준비합니다.', config: { ...base, age: 26, role: 'seeker', salary: 0, externalAllowance: 850000, fixedCosts: 650000, startCash: 2500000, personalBudget: 220000, housing: 'shared', preferences: ['read', 'run'] } },
    { id: 'graduate', name: '대학원생 · 연구와 생활', description: '연구 지원금 성격의 외부 용돈, 발표와 논문 마감이 있는 한 해입니다.', config: { ...base, age: 29, role: 'graduate', salary: 0, externalAllowance: 1450000, fixedCosts: 1050000, personalBudget: 300000, startCash: 1800000, preferences: ['music', 'cook'] } },
    { id: 'caregiver', name: '돌봄 중심 · 함께 짓는 주말', description: '가구에서 받는 외부 생활비와 돌봄 분담을 설정합니다. 분담은 성별과 무관합니다.', config: { ...base, age: 38, role: 'caregiver', maritalStatus:'married', children: 1, childAge: 'preschool', careShare: 60, housing: 'apartment', region: 'town', transport: 'car', salary: 0, externalAllowance: 2200000, fixedCosts: 1400000, personalBudget: 420000, startCash: 1800000, preferences: ['garden', 'draw'] } }
  ];
  // Costs, effects and thresholds are deliberately fictional gameplay assumptions.
  const rows = [
    ['walk','동네 산책','🚶',0,60,5,'local','alone','가까운 길을 천천히 걷습니다.',{fatigue:-5,mood:5},'걸음 지도',3],
    ['run','러닝','🏃',0,70,15,'local','alone','체력을 쓰며 거리 기록을 남깁니다.',{fatigue:8,mood:8},'러닝 기록',2],
    ['pt','PT 수업','🏋️',55000,60,20,'studio','together','지도받는 운동. 비용과 이동이 있지만 숙련이 빠릅니다.',{fatigue:12,mood:7},'운동 루틴 카드',3],
    ['photo','사진 산책','📷',12000,120,15,'local','alone','계절과 동네를 모아 작은 앨범을 만듭니다.',{fatigue:5,mood:9},'계절 사진 앨범',2],
    ['cook','새 요리 만들기','🍲',18000,110,20,'home','together','재료를 준비해 함께 먹을 한 끼를 만듭니다.',{fatigue:3,mood:7,relationship:2},'나의 레시피',2],
    ['pottery','도예 공방','🏺',45000,100,15,'studio','together','손으로 만든 그릇이 생활공간에 남습니다.',{fatigue:6,mood:9},'손으로 빚은 그릇',3],
    ['draw','그림 그리기','🎨',6000,100,10,'home','alone','집에서 한 장씩 완성하는 계절 그림.',{fatigue:1,mood:7},'계절 스케치',2],
    ['music','악기 연습','🎵',5000,90,10,'home','alone','반복 연습을 쌓으면 작은 연주에 참여할 수 있습니다.',{fatigue:3,mood:7},'연주 녹음 기록',3],
    ['read','독서','📚',0,90,5,'home','alone','무료로 빌린 책과 함께 읽기 노트를 남깁니다.',{fatigue:-3,mood:6},'독서 노트',2],
    ['friends','친구와 만나기','☕',28000,110,10,'local','together','오래 미뤘던 이야기를 나눕니다.',{fatigue:4,mood:9,relationship:7},null,0],
    ['haircut','미용실','✂️',25000,60,10,'local','together','생활을 정돈하는 정기 일정.',{fatigue:0,mood:5},null,0],
    ['rest','아무것도 안 하는 휴식','🛋️',0,120,0,'home','alone','여유를 남겨 다음 날 피로를 낮춥니다.',{fatigue:-17,mood:4},null,0],
    ['chores','집안일','🧺',3000,90,10,'home','alone','주거 공간을 정리해 다음 주 부담을 줄입니다.',{fatigue:5,mood:2},null,0],
    ['care','돌봄 시간','🤝',5000,120,10,'home','together','같이 보내는 시간을 마련합니다. 기본 돌봄 시간도 포함합니다.',{fatigue:7,mood:4,relationship:3},null,0],
    ['study','자격증 준비','📝',8000,130,10,'home','alone','6월과 11월 시험에 대비합니다. 판정은 시험일에 합니다.',{fatigue:11,mood:0,preparation:8},'공부 노트',4],
    ['overtime','주말 추가근무','💼',0,150,15,'work','alone','보상 9만원은 다음 급여일에 지급됩니다.',{fatigue:18,mood:-5,work:9},null,0],
    ['research','논문 조사','🔬',5000,140,10,'home','alone','9월 발표와 11월 마감을 위한 자료를 쌓습니다.',{fatigue:11,mood:1,research:8},'연구 메모',4],
    ['jobstudy','취업·면접 스터디','💬',6000,100,10,'local','together','구직 준비와 모의 면접을 함께 연습합니다.',{fatigue:8,mood:3,preparation:9,relationship:1},'면접 준비 노트',3],
    ['volunteer','동네 봉사','🌱',0,110,10,'local','together','함께 돌보는 장소와 작은 인연이 남습니다.',{fatigue:9,mood:6,relationship:4},'동네 활동 기록',3],
    ['garden','작은 화분 가꾸기','🪴',9000,60,10,'home','alone','주거 형태에 맞춘 창가 또는 베란다의 화분.',{fatigue:1,mood:6},'자란 화분',3]
  ];
  const ACTIVITIES = rows.map(([id,name,icon,cost,minutes,prep,location,mode,description,effects,artifact,every]) => ({id,name,icon,cost,minutes,prep,location,mode,description,effects,artifact,every,skillGain:id==='pt'?10:6,roles:id==='overtime'?['worker']:id==='research'?['graduate']:id==='jobstudy'?['seeker']:null}));
  const ACTIVITY_MAP = Object.assign(Object.create(null),Object.fromEntries(ACTIVITIES.map(a => [a.id,a])));
  function formatMoney(won){
    if(!Number.isSafeInteger(won))throw new TypeError('금액은 원화 정수여야 합니다.');
    const value=Math.abs(won),whole=Math.floor(value/10000),fraction=String(value%10000).padStart(4,'0').replace(/0+$/,'');
    return (won<0?'-':'')+whole.toLocaleString('ko-KR')+(fraction?'.'+fraction:'')+'만원';
  }
  function generateLife(seed){
    if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw new RangeError('새 인생의 시드는 0~4294967295 정수여야 합니다.');
    // A private generator constructs a fictional person. It never touches the
    // external-event or followup streams owned by an active simulation.
    let randomState=(seed^0xa5b35705)>>>0;
    const next=()=>{randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296;};
    const pick=values=>values[Math.floor(next()*values.length)];
    // Sixteen balanced combinations cover every role × marital status × child
    // presence. Marital status never sets income, abilities or care share.
    const profile=seed%16,preset=PRESETS[profile%4],config=JSON.parse(JSON.stringify(preset.config));
    config.seed=seed;config.generationSeed=seed;
    config.maritalStatus=Math.floor(profile/4)%2?'married':'single';
    config.children=Math.floor(profile/8)?pick([1,1,2]):0;
    config.childAge=config.children?pick(['preschool','school','teen']):'none';
    config.age=pick(config.childAge==='teen'?[39,42,46,49]:[26,29,32,35,38,41]);
    config.gender=pick(['woman','man','nonbinary','unspecified']);
    config.careShare=pick([30,45,60,75]);
    config.housing=pick(['studio','apartment','shared']);config.region=pick(['city','town','rural']);config.transport=pick(['walk','transit','car']);
    const interests=['walk','run','photo','cook','pottery','draw','music','read','garden'];
    config.preferences=[pick(interests)];config.preferences.push(pick(interests.filter(id=>id!==config.preferences[0])));
    const names=['하린','서우','지안','도윤','유진','시온','나루','이든','해온','지율','수현','가온'];
    const name=pick(names);config.personaName=name;
    const region={city:'도시',town:'작은 도시',rural:'근교와 농촌'}[config.region];
    const family=config.maritalStatus==='married'?'배우자와 생활을 조율하며':'미혼으로 자신의 생활을 꾸리며';
    const children=config.children?' 자녀 '+config.children+'명의 돌봄을 주변 사람들과 나눕니다.':' 자녀 돌봄 없이 자신의 시간과 가까운 사람들을 돌봅니다.';
    const intro='가상의 인물 '+name+', '+config.age+'세. '+region+'에서 '+ROLES[config.role]+'의 한 해를 시작합니다. '+family+children+' 관심 있는 일은 '+config.preferences.map(id=>ACTIVITY_MAP[id].name).join(' · ')+'입니다.';
    config.lifeIntro=intro;
    return {presetId:preset.id,config,name,intro};
  }
  return { VERSION: 2, PRESETS, ACTIVITIES, ACTIVITY_MAP, ROLES, MARITAL_STATUSES, DEFAULT_CONFIG: base,generateLife,formatMoney,
    DISCLAIMER: '가상 생활 시뮬레이션입니다. 사건 확률·감정·성과 변화는 게임용 가정이며 현실의 삶이나 능력을 예측하지 않습니다. 성별은 능력·급여·돌봄 의무에 영향을 주지 않습니다.' };
});
