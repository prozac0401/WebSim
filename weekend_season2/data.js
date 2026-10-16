(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./demographics.js') : root.S2Demographics, node ? require('./income-data.js') : root.S2IncomeData, node ? require('./prices.js') : root.S2Prices);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Data = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Demographics, Income, Prices) {
  'use strict';
  const ROLES = { worker: '직장인', seeker: '구직자', graduate: '대학원생', caregiver: '돌봄 중심' };
  const MARITAL_STATUSES = {single:'미혼',married:'기혼',unspecified:'이전 저장 · 설정하지 않음'};
  const APPEARANCE_OPTIONS = {faceShape:['round','oval','square','heart','long'],hairStyle:['long-soft','short-swept','side-wave','rounded-crop','curly','bob','ponytail','buzz','bun','braids'],hairColor:['espresso','chestnut','honey','slate','silver'],skinTone:['ivory','warm','tan','deep'],outfitPalette:['moss','terracotta','indigo','rose','mustard','teal']};
  const HOME_OPTIONS = {palette:['oat','sage','rose','sky','clay','lavender'],layout:['window-left','window-right','wide-window'],decor:['plants','books','art','music'],windowView:['skyline','hills','garden','river']};
  const base = { year: 2026, age: 32, gender: 'unspecified', maritalStatus:'single', personaName:'', lifeIntro:'', generationSeed:null, role: 'worker', children: 0, childAge: 'none', careShare: 50,
    province:'unspecified',residenceOrigin:null,appearance:null,homeStyle:null,generationModel:null,incomeOrigin:null,childProfiles:null,
    housing: 'studio', region: 'city', transport: 'transit', salary: 2800000, externalAllowance: 0,
    personalBudget: 500000, fixedCosts: 1500000, startCash: 2000000, payDay: 1, cardLimit: 1500000,
    preferences: ['walk', 'photo'], seed: 2026 };
  const PRESETS = [
    { id: 'worker', name: '직장인 · 작은 집의 새해', description: '출근과 자격증, 주말의 약속 사이에서 생활을 조율합니다.', config: { ...base } },
    { id: 'seeker', name: '구직자 · 다음 문을 준비하며', description: '외부 용돈과 모아 둔 현금으로 공부와 면접을 준비합니다.', config: { ...base, age: 26, role: 'seeker', salary: 0, externalAllowance: 850000, fixedCosts: 650000, startCash: 2500000, personalBudget: 220000, housing: 'shared', preferences: ['read', 'run'] } },
    { id: 'graduate', name: '대학원생 · 연구와 생활', description: '연구 지원금 성격의 외부 용돈, 발표와 논문 마감이 있는 한 해입니다.', config: { ...base, age: 29, role: 'graduate', salary: 0, externalAllowance: 1450000, fixedCosts: 1050000, personalBudget: 300000, startCash: 1800000, preferences: ['music', 'cook'] } },
    { id: 'caregiver', name: '돌봄 중심 · 함께 짓는 주말', description: '가구에서 받는 외부 생활비와 돌봄 분담을 설정합니다. 분담은 성별과 무관합니다.', config: { ...base, age: 38, role: 'caregiver', maritalStatus:'married', children: 1, childAge: 'preschool', careShare: 60, housing: 'apartment', region: 'town', transport: 'car', salary: 0, externalAllowance: 2200000, fixedCosts: 1400000, personalBudget: 420000, startCash: 1800000, preferences: ['garden', 'draw'] } }
  ];
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
    ['haircut','기본 커트','✂️',25000,60,10,'local','together','익숙한 미용실에서 머리를 다듬고 돌아옵니다.',{fatigue:0,mood:5},null,0],
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
    ['garden','작은 화분 가꾸기','🪴',9000,60,10,'home','alone','주거 형태에 맞춘 창가 또는 베란다의 화분.',{fatigue:1,mood:6},'자란 화분',3]
  ];
  const ACTIVITIES = rows.map(([id,name,icon,cost,minutes,prep,location,mode,description,effects,artifact,every]) => ({id,name,icon,cost,minutes,prep,location,mode,description,effects,artifact,every,skillGain:id==='pt'?10:6,roles:id==='overtime'?['worker']:id==='research'?['graduate']:id==='jobstudy'?['seeker']:null}));
  const ACTIVITY_MAP = Object.assign(Object.create(null),Object.fromEntries(ACTIVITIES.map(a => [a.id,a])));
  function formatMoney(won){
    if(!Number.isSafeInteger(won))throw new TypeError('금액은 원화 정수여야 합니다.');
    const rounded=Math.round(Math.abs(won)/1000)/10;
    return (won<0&&rounded>0?'-':'')+rounded.toLocaleString('ko-KR',{maximumFractionDigits:1})+'만원';
  }
  function activityPrice(config,id){
    const activity=ACTIVITY_MAP[id];
    if(!activity)throw new RangeError('활동을 확인하세요.');
    return Prices.quote(config,id,activity.cost);
  }
  function getChildren(config){
    if(Array.isArray(config.childProfiles))return config.childProfiles.map(child=>({...child}));
    const age={toddler:1,preschool:4,school:9,teen:16,adult:24}[config.childAge]??4;
    return Array.from({length:config.children||0},()=>({age,gender:'unspecified',militaryStatus:'none'}));
  }
  function childStage(age){return age<=2?'toddler':age<=6?'preschool':age<=12?'school':age<=17?'teen':'adult';}
  // Each aspect has its own deterministic stream; adding an illustration never
  // changes residence, earnings, or either of the simulation's event streams.
  function randomStream(seed,tag){
    let value=(seed^2166136261)>>>0;
    for(const letter of tag){value^=letter.charCodeAt(0);value=Math.imul(value,16777619)>>>0;}
    return ()=>{value=(value+0x6d2b79f5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
  }
  function weightedPick(rows,weight,random){
    const total=rows.reduce((n,row)=>n+weight(row),0),draw=random();
    if(!Number.isFinite(total)||total<=0||!Number.isFinite(draw)||draw<0||draw>=1||rows.some(row=>!Number.isFinite(weight(row))||weight(row)<0))throw new RangeError('추첨 분포를 확인하세요.');
    let cursor=draw*total;
    for(const row of rows){cursor-=weight(row);if(cursor<0)return row;}
    return rows.at(-1);
  }
  function provinceLabel(id){const found=Demographics.regions.find(r=>r.id===id);return found?(found.capital?'수도권 · ':'')+found.label:'지역 미설정';}
  function sampleProvince(seed,capitalOnly=false){return weightedPick(Demographics.regions.filter(r=>!capitalOnly||r.capital),r=>r.population,randomStream(seed,'residence')).id;}
  function sampleOptions(options,random){return Object.fromEntries(Object.entries(options).map(([key,values])=>[key,values[Math.floor(random()*values.length)]]));}
  function assignRegionalIncome(config){
    if(config.province==='unspecified')return config;
    const sampled=Income.sample(config.province,randomStream(config.generationSeed??config.seed,'income:'+config.province));
    const supportShare={seeker:.3,graduate:.5,caregiver:.65}[config.role]||1;
    config.salary=config.role==='worker'?sampled.amount:0;
    config.externalAllowance=config.role==='worker'?0:Math.round(sampled.amount*supportShare);
    config.incomeOrigin={kind:config.role==='worker'?'wage':'support-model',sourceId:sampled.sourceId,bandId:sampled.bandId,provinceId:config.province,sampledMonthly:sampled.amount,assignedMonthly:config.salary+config.externalAllowance,supportShare};
    return config;
  }
  function generateLife(seed){
    if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw new RangeError('새 인생의 시드는 0~4294967295 정수여야 합니다.');
    // A private generator constructs a fictional person. It never touches the
    // external-event or followup streams owned by an active simulation.
    const next=randomStream(seed,'fictional-household');
    const pick=values=>values[Math.floor(next()*values.length)];
    // Sixteen balanced combinations cover every role × marital status × child
    // presence. Marital status never sets income, abilities or care share.
    const profile=seed%16,preset=PRESETS[profile%4],config=JSON.parse(JSON.stringify(preset.config));
    config.seed=seed;config.generationSeed=seed;
    config.maritalStatus=Math.floor(profile/4)%2?'married':'single';
    config.children=Math.floor(profile/8)?pick([1,1,2]):0;
    config.age=pick([22,26,29,32,35,38,41,45,49,52,56,59,62,65,69]);
    // These ages and household combinations are narrative choices, not sampled
    // age-specific census or military-service probabilities.
    const childRandom=randomStream(seed,'children-age-and-life'),childPick=values=>values[Math.floor(childRandom()*values.length)];
    const oldest=config.age-18,possible=[0,1,2,4,6,9,12,15,17,19,21,23,26,29,32,36,40,45,49].filter(age=>age<=oldest);
    const preferredAges=config.age>=50?possible.filter(age=>age>=17):possible;
    const firstAge=config.children?childPick(preferredAges):0;
    config.childProfiles=Array.from({length:config.children},(_,index)=>{
      const age=Math.max(0,firstAge-index*childPick([1,2,3]));
      const gender=childPick(['man','woman']);
      return {age,gender,militaryStatus:gender==='man'&&age>=18&&age<=28&&childRandom()<.35?'serving':'none'};
    });
    config.childAge=config.children?childStage(Math.min(...config.childProfiles.map(child=>child.age))):'none';
    config.gender=pick(['woman','man','nonbinary','unspecified']);
    config.careShare=pick([30,45,60,75]);
    config.housing=pick(['studio','apartment','shared']);config.region=pick(['city','town','rural']);config.transport=pick(['walk','transit','car']);
    config.generationModel='kr-life-2026-v2';config.province=sampleProvince(seed);config.residenceOrigin='population';
    config.appearance=sampleOptions(APPEARANCE_OPTIONS,randomStream(seed,'appearance'));
    config.homeStyle=sampleOptions(HOME_OPTIONS,randomStream(seed,'home'));
    assignRegionalIncome(config);
    // Housing costs, starting savings and support shares are explicit game
    // assumptions, not statistics inferred from a person's name or appearance.
    const moneyRandom=randomStream(seed,'living-budget'),income=config.salary+config.externalAllowance;
    config.fixedCosts=Math.round(income*(.45+.25*moneyRandom()));
    config.personalBudget=Math.round((income-config.fixedCosts)*.55);
    config.startCash=Math.round(income*(.4+1.4*moneyRandom()));
    config.cardLimit=Math.max(100000,Math.min(5000000,Math.round(income*.5)));
    const interests=['walk','run','photo','cook','pottery','draw','music','read','garden','study','culture','cinema'];
    config.preferences=[pick(interests)];config.preferences.push(pick(interests.filter(id=>id!==config.preferences[0])));
    const givenName=Demographics.names[Math.floor(randomStream(seed,'name')()*Demographics.names.length)].name;
    const surname=weightedPick(Demographics.surnames,r=>r.population,randomStream(seed,'surname')).name;
    const name=surname+givenName;config.personaName=name;
    const region=provinceLabel(config.province);
    const role={worker:'일하며',seeker:'새로운 일자리를 찾으며',graduate:'대학원에서 공부하며',caregiver:'가까운 사람들을 돌보며'}[config.role];
    const family=config.maritalStatus==='married'?'배우자와 함께 살고 있어요.':'미혼이에요. 혼자만의 시간도, 가까운 사람들과의 시간도 소중해요.';
    const children=config.children?' 자녀는 '+config.childProfiles.map(child=>child.age+'세 '+(child.gender==='man'?'아들':'딸')+(child.militaryStatus==='serving'?'(군 복무 중)':'')).join(', ')+'입니다.':'';
    const intro=name+', '+config.age+'세. '+region+'에서 '+role+' 지냅니다. '+family+children+' 요즘은 '+config.preferences.map(id=>ACTIVITY_MAP[id].name).join(' · ')+'에 관심이 있어요.';
    config.lifeIntro=intro;
    return {presetId:preset.id,config,name,intro};
  }
  const SIDE_JOBS={delivery:{reward:18000,payDelayDays:1},parttime:{reward:32000,payDelayDays:1},sideproject:{milestones:[{sessions:2,reward:40000},{sessions:4,reward:80000}],deadlineDays:56,payDelayDays:1},note:'부업의 보수·소요시간·기회는 게임용 가정이며 실제 임금이나 수입을 보장하지 않습니다.'};
  return { VERSION: 4, PRESETS, ACTIVITIES, ACTIVITY_MAP, ROLES, MARITAL_STATUSES, DEFAULT_CONFIG: base,generateLife,formatMoney,activityPrice,getChildren,childStage,APPEARANCE_OPTIONS,HOME_OPTIONS,DEMOGRAPHICS:Demographics,INCOME:Income,PRICES:Prices,SIDE_JOBS,randomStream,weightedPick,sampleProvince,provinceLabel,assignRegionalIncome,
    DISCLAIMER: '가상 생활 시뮬레이션입니다. 사건 확률·감정·성과 변화는 게임용 가정이며 현실의 삶이나 능력을 예측하지 않습니다. 성별은 능력·급여·돌봄 의무에 영향을 주지 않습니다.' };
});
