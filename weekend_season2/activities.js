(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Activities = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Effects and thresholds are gameplay assumptions. Named price observations
  // are resolved separately; all other costs are explicitly game estimates.
  const rows = [
    ['walk','동네 산책','🚶',0,60,5,'local','alone','가까운 길을 천천히 걷습니다.',{fatigue:-5,mood:5},'걸음 지도',3],
    ['run','러닝','🏃',0,70,15,'local','alone','체력을 쓰며 거리 기록을 남깁니다.',{fatigue:8,mood:8},'러닝 기록',2],
    ['pt','PT 수업','🏋️',55000,60,20,'studio','together','트레이너와 자세를 익히며 나에게 맞는 운동을 찾습니다.',{fatigue:12,mood:7},'운동 루틴 카드',3],
    ['photo','사진 산책','📷',12000,120,15,'local','alone','계절과 동네를 모아 작은 앨범을 만듭니다.',{fatigue:5,mood:9},'계절 사진 앨범',2],
    ['cook','새 요리 만들기','🍲',18000,110,20,'home','together','재료를 준비해 함께 먹을 한 끼를 만듭니다.',{fatigue:3,mood:7,relationship:2},'나의 레시피',2],
    ['pottery','도예 공방','🏺',45000,100,15,'studio','together','손으로 만든 그릇이 생활공간에 남습니다.',{fatigue:6,mood:9},'손으로 빚은 그릇',3],
    ['draw','그림 그리기','🎨',6000,100,10,'home','alone','집에서 한 장씩 완성하는 계절 그림.',{fatigue:1,mood:7},'계절 스케치',2],
    ['music','악기 연습','🎵',5000,90,10,'home','alone','반복 연습을 쌓으면 작은 연주에 참여할 수 있습니다.',{fatigue:3,mood:7},'연주 녹음 기록',3],
    ['read','독서','📚',0,90,5,'home','alone','무료로 빌린 책과 함께 읽기 노트를 남깁니다.',{fatigue:-3,mood:6},'독서 노트',2],
    ['friends','친구와 만나기','☕',28000,110,10,'local','together','오래 미뤘던 이야기를 나눕니다.',{fatigue:4,mood:9,relationship:7},null,0],
    ['haircut','커트','✂️',25000,60,10,'local','together','익숙한 미용실에서 머리를 다듬고 돌아옵니다.',{fatigue:0,mood:5},null,0],
    ['haircut_men','남성 커트','✂️',20000,40,10,'local','together','짧게 다듬을까, 조금 더 길러 볼까. 거울 앞에서 새 모습을 골라 봅니다.',{fatigue:0,mood:6,happiness:3},null,0],
    ['haircut_women','여성 커트','💇',25000,50,10,'local','together','머리를 가볍게 정리하고 산뜻한 기분으로 집에 돌아옵니다.',{fatigue:0,mood:6,happiness:3},null,0],
    ['perm','펌','〰️',70000,140,10,'local','together','평소 눈여겨본 머리에 도전해 봅니다. 오늘은 미용실에서 조금 오래 쉬어 가요.',{fatigue:4,mood:10,happiness:5},'새로운 머리의 사진',1],
    ['dye','염색','🎨',60000,100,10,'local','together','마음에 드는 색을 골라 작은 변화를 줍니다.',{fatigue:3,mood:9,happiness:4},'염색한 날의 사진',1],
    ['rest','아무것도 안 하는 휴식','🛋️',0,120,0,'home','alone','여유를 남겨 다음 날 피로를 낮춥니다.',{fatigue:-17,mood:4},null,0],
    ['chores','집안일','🧺',3000,90,10,'home','alone','주거 공간을 정리해 다음 주 부담을 줄입니다.',{fatigue:5,mood:2},null,0],
    ['cleaning','밀린 청소','🧹',2000,75,5,'home','alone','바닥과 욕실을 청소합니다. 청결이 회복되고 다음 주의 생활 부담이 줄어듭니다.',{fatigue:6,mood:3,health:2,happiness:2},null,0],
    ['care','돌봄 시간','🤝',5000,120,10,'home','together','바쁜 일은 잠시 내려놓고 곁에 있는 사람을 챙깁니다.',{fatigue:7,mood:4,relationship:3},null,0],
    ['study','자격증 준비','📝',8000,130,10,'home','alone','6월과 11월 시험을 바라보며 오늘 공부할 분량을 펼칩니다.',{fatigue:11,mood:0,preparation:8},'공부 노트',4],
    ['culture','문화센터 강좌','🏫',10000,90,10,'local','together','일과를 마친 저녁, 새로 배우는 즐거움을 만나러 갑니다.',{fatigue:5,mood:7,knowledge:5,relationship:3,happiness:3},'강좌 실습 기록',3],
    ['cinema','영화 보러 가기','🎬',15000,130,10,'local','alone','보고 싶었던 영화 한 편. 불이 꺼지면 잠시 다른 이야기에 빠져듭니다.',{fatigue:2,mood:9,happiness:4,knowledge:1},'영화 감상 카드',1],
    ['family_time','가족과 대화','💌',0,60,0,'home','together','함께 살거나 떨어져 있는 가족과 통화하고 이야기를 나눕니다.',{fatigue:-2,mood:4,family:7,happiness:2},null,0],
    ['overtime','주말 추가근무','💼',0,150,15,'work','alone','보상 9만원은 다음 급여일에 지급됩니다.',{fatigue:18,mood:-5,work:9},null,0],
    ['delivery','짧은 배달 일','🛵',0,100,15,'local','alone','동네에서 배달 일을 마치면 다음 날 1.8만원을 받습니다. 이동하며 몸을 쓰는 만큼 쉬는 시간도 필요해요. 보수는 게임에서 정한 금액입니다.',{fatigue:16,mood:-1,happiness:1},null,0],
    ['parttime','시간제 일','🧑‍🍳',0,150,10,'local','together','가게의 바쁜 시간을 돕고 다음 날 3.2만원을 받습니다. 짧은 근무에도 피로는 남아요. 보수는 게임에서 정한 금액입니다.',{fatigue:19,mood:-2,happiness:1,relationship:1},null,0],
    ['sideproject','작은 개인 프로젝트','💻',0,130,10,'home','alone','아이디어를 조금씩 만들어요. 두 번 작업하면 작은 의뢰를 만나고, 수락한 뒤에는 중간·완성 단계의 보상을 받을 수 있습니다.',{fatigue:12,mood:3,happiness:2,knowledge:4},'프로젝트 작업 기록',2],
    ['research','논문 조사','🔬',5000,140,10,'home','alone','9월 발표와 11월 마감을 위한 자료를 쌓습니다.',{fatigue:11,mood:1,research:8},'연구 메모',4],
    ['jobstudy','취업·면접 스터디','💬',6000,100,10,'local','together','구직 준비와 모의 면접을 함께 연습합니다.',{fatigue:8,mood:3,preparation:9,relationship:1},'면접 준비 노트',3],
    ['volunteer','동네 봉사','🌱',0,110,10,'local','together','함께 돌보는 장소와 작은 인연이 남습니다.',{fatigue:9,mood:6,relationship:4},'동네 활동 기록',3],
    ['garden','작은 화분 가꾸기','🪴',9000,60,10,'home','alone','주거 형태에 맞춘 창가 또는 베란다의 화분.',{fatigue:1,mood:6},'자란 화분',3],
    ['baby_feed','수유·이유식 챙기기','🥣',0,45,5,'home','together','0~2세 자녀의 먹는 시간을 함께 챙깁니다. 기본 돌봄과 겹치는 시간은 한 번만 계산해요.',{fatigue:2,mood:2,family:3,happiness:1},null,0],
    ['baby_change','기저귀·갈아입히기','🧷',0,30,5,'home','together','0~2세 자녀의 기저귀와 옷을 갈아 주며 일상을 돌봅니다.',{fatigue:2,mood:1,family:3,happiness:1},null,0],
    ['baby_sleep','낮잠 전 함께 쉬기','🌙',0,45,5,'home','together','0~2세 자녀와 조용한 시간을 보내며 낮잠 준비를 함께합니다.',{fatigue:1,mood:3,family:3,happiness:1},null,0],
    ['preschool_hygiene','씻기·양치 함께하기','🫧',0,30,5,'home','together','3~6세 자녀가 씻고 양치하는 일상을 곁에서 돕습니다.',{fatigue:1,mood:2,family:3,happiness:1},null,0],
    ['preschool_play','그림책·놀이 함께하기','🧩',0,60,5,'home','together','3~6세 자녀가 고른 그림책과 놀이를 함께 즐깁니다.',{fatigue:2,mood:4,family:4,happiness:2},null,0],
    ['preschool_ready','등원 준비물·옷 정리','🎒',0,30,5,'home','together','3~6세 자녀와 다음 일상에 쓸 준비물과 옷을 정리합니다.',{fatigue:1,mood:2,family:3,happiness:1},null,0],
    ['school_homework','숙제·준비물 살피기','✏️',0,45,5,'home','together','7~12세 자녀와 필요한 도움을 이야기하고 숙제와 준비물을 살펴봅니다.',{fatigue:2,mood:2,family:3,happiness:1},null,0],
    ['school_reading','책 읽고 이야기 나누기','📖',0,45,5,'home','together','7~12세 자녀와 책을 읽고 서로 떠오른 이야기를 나눕니다.',{fatigue:1,mood:3,family:4,happiness:2},null,0],
    ['school_tidy','책상·방 함께 정리','🧸',0,45,5,'home','together','7~12세 자녀와 책상과 방에서 정리할 것을 함께 고릅니다.',{fatigue:2,mood:2,family:3,happiness:1},null,0],
    ['motorbike_tour','모터바이크 체험','🏍️',180000,150,30,'local','alone','가까운 코스를 반나절 체험합니다. 직접 고르는 유료 활동이며 게임 속 사고가 나면 수리비와 병원비가 따로 생겨요.',{fatigue:14,mood:9,happiness:4},null,0],
    ['domestic_trip','반나절 국내여행','🧳',150000,180,15,'local','together','가까운 국내 여행지를 반나절 둘러봅니다. 숙박이나 종일 여행이 아닌 짧은 일정이며 이동 시간도 필요해요.',{fatigue:9,mood:10,happiness:5,relationship:2},null,0],
    ['golf_round','골프 9홀','⛳',250000,180,15,'local','together','가까운 코스에서 9홀을 즐깁니다. 직접 고르는 유료 활동이며 긴 이동까지 있으면 다른 시간을 골라야 해요.',{fatigue:12,mood:8,happiness:4,relationship:2},null,0],
    ['circuit_drive','서킷 주행 체험','🏁',450000,150,30,'local','alone','안내에 따라 서킷에서 반나절 주행을 체험합니다. 직접 고르는 유료 활동이며 게임 속 사고가 나면 수리비와 병원비가 따로 생겨요.',{fatigue:15,mood:10,happiness:5},null,0],
    ['mole_removal','점 제거','✨',50000,45,15,'local','alone','직접 선택한 미용 시술 뒤 실내에서 여유를 보냅니다. 비용·회복 기간·관계 변화는 게임 설정입니다.',{fatigue:3,mood:8,happiness:4,relationship:14},null,0],
    ['laser_hair_removal','레이저 제모','💡',100000,60,15,'local','alone','최소 4주 간격을 두고 직접 예약합니다. 게임에서는 시술 뒤 잠시 야외 활동을 쉬어요.',{fatigue:3,mood:8,happiness:4,relationship:14},null,0],
    ['ultherapy','울세라','🌿',1500000,90,15,'local','alone','직접 비용과 회복 일정을 살펴보고 고르는 미용 시술입니다. 효과와 관계 수치는 실제 결과를 예측하지 않습니다.',{fatigue:5,mood:10,happiness:5,relationship:18},null,0],
    ['botox','보톡스','💧',100000,45,15,'local','alone','미용 시술을 직접 선택하고 오늘은 실내에서 쉬어 갑니다. 비용·회복 기간·관계 변화는 게임 설정입니다.',{fatigue:2,mood:8,happiness:4,relationship:14},null,0],
    ['fraxel','프락셀','🪞',250000,90,15,'local','alone','직접 고른 시술 뒤 회복할 시간을 남깁니다. 게임의 야외 활동 제한은 실제 의료 지침이 아닙니다.',{fatigue:5,mood:9,happiness:5,relationship:16},null,0],
    ['eyelid_surgery','쌍꺼풀 수술','🌸',2500000,150,30,'local','alone','이 삶에서 한 번만 직접 선택할 수 있는 수술입니다. 비용·회복 기간·관계 변화는 게임 설정이며 실제 결과를 보장하지 않습니다.',{fatigue:12,mood:12,happiness:6,relationship:25},null,0]
  ];
  const ACTIVITY_GROUPS=Object.freeze([
    {id:'want',label:'하고 싶은 일'},
    {id:'need',label:'해야 하는 일'}
  ].map(Object.freeze));
  // These are navigation categories, not extra obligations or automatic plans.
  const ACTIVITY_CATEGORIES=Object.freeze([
    {id:'exercise',groupId:'want',label:'운동',activityIds:['walk','run','pt']},
    {id:'creative',groupId:'want',label:'취미·문화',activityIds:['photo','cook','pottery','draw','music','read','garden','culture','cinema']},
    {id:'social',groupId:'want',label:'사람과 관계',activityIds:['friends','family_time','volunteer']},
    {id:'outings',groupId:'want',label:'여행·체험',activityIds:['motorbike_tour','domestic_trip','golf_round','circuit_drive']},
    {id:'recovery',groupId:'want',label:'휴식',activityIds:['rest']},
    {id:'household',groupId:'need',label:'집안일',activityIds:['chores','cleaning']},
    {id:'parenting',groupId:'need',label:'돌봄·육아',activityIds:['care','baby_feed','baby_change','baby_sleep','preschool_hygiene','preschool_play','preschool_ready','school_homework','school_reading','school_tidy']},
    {id:'study',groupId:'need',label:'공부·준비',activityIds:['study','research','jobstudy']},
    {id:'work',groupId:'need',label:'일·부업',activityIds:['overtime','delivery','parttime','sideproject']},
    {id:'personal',groupId:'need',label:'미용·관리',activityIds:['haircut','haircut_men','haircut_women','perm','dye','mole_removal','laser_hair_removal','ultherapy','botox','fraxel','eyelid_surgery']}
  ].map(category=>Object.freeze({...category,activityIds:Object.freeze(category.activityIds)})));
  const categoryByActivity=new Map(ACTIVITY_CATEGORIES.flatMap(category=>category.activityIds.map(id=>[id,category])));
  function activityCategory(id){return categoryByActivity.get(id)||null;}
  function categoriesForGroup(id){return ACTIVITY_CATEGORIES.filter(category=>category.groupId===id);}
  const parentingGroups={baby:{minAge:0,maxAge:2,group:'baby',label:'0~2세 자녀'},preschool:{minAge:3,maxAge:6,group:'preschool',label:'3~6세 자녀'},school:{minAge:7,maxAge:12,group:'school',label:'7~12세 자녀'}};
  const cadences={haircut:{unit:'weeks',interval:3,group:'haircut',label:'3주에 한 번'},perm:{unit:'months',interval:2,group:'perm',label:'2개월에 한 번'},dye:{unit:'months',interval:3,group:'dye',label:'3개월에 한 번'}};
  const preferenceActivities={motorbike_tour:{minAge:18,risk:{chance:.06,repairMin:40000,repairMax:320000,medicalMin:20000,medicalMax:200000}},domestic_trip:{},golf_round:{},circuit_drive:{minAge:18,risk:{chance:.04,repairMin:300000,repairMax:1800000,medicalMin:50000,medicalMax:400000}}};
  // Published plans, logs and preferences retain these IDs and their old timing
  // and effects. New menus and automatic choices use the canonical activity.
  const legacyAliases={haircut_men:'haircut',haircut_women:'haircut'};
  const educationActivities=new Set(['preschool_play','school_homework','school_reading']);
  const procedures={mole_removal:{recoveryDays:7},laser_hair_removal:{recoveryDays:2,minIntervalDays:28},ultherapy:{recoveryDays:1},botox:{recoveryDays:1},fraxel:{recoveryDays:7},eyelid_surgery:{recoveryDays:7,oncePerLife:true}};
  const outdoors=new Set(['walk','run','photo','garden','volunteer','motorbike_tour','domestic_trip','golf_round','circuit_drive','delivery']);
  const ACTIVITIES = rows.map(([id,name,icon,cost,minutes,prep,location,mode,description,effects,artifact,every]) => {
    const parenting=parentingGroups[id.split('_')[0]],cadence=cadences[id.startsWith('haircut')?'haircut':id];
    return {id,name,icon,cost,minutes,prep,location,mode,description,effects,artifact,every,skillGain:parenting||procedures[id]?0:id==='pt'?10:6,roles:id==='overtime'?['worker']:id==='research'?['graduate']:id==='jobstudy'?['seeker']:null,...(parenting?{parenting:{...parenting},careOverlap:true}:{}),...(educationActivities.has(id)?{education:{familyCapMinutes:60}}:{}),...(cadence?{cadence:{...cadence}}:{}),...(preferenceActivities[id]?{requiresPreference:true,...preferenceActivities[id]}:{}),...(legacyAliases[id]?{legacyOnly:true,canonicalId:legacyAliases[id]}:{}),...(procedures[id]?{manualOnly:true,procedure:{...procedures[id]}}:{}),categoryId:activityCategory(id)?.id,outdoor:outdoors.has(id)};
  });
  const ACTIVITY_MAP = Object.assign(Object.create(null),Object.fromEntries(ACTIVITIES.map(a => [a.id,a])));
  return { ACTIVITIES, ACTIVITY_MAP, ACTIVITY_GROUPS, ACTIVITY_CATEGORIES, activityCategory, categoriesForGroup };
});
