(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./demographics.js') : root.S2Demographics, node ? require('./income-data.js') : root.S2IncomeData, node ? require('./prices.js') : root.S2Prices, node ? require('./lifecycle-economy.js') : root.S2LifecycleEconomy, node ? require('./housing-data.js') : root.S2HousingData, node ? require('./age-health.js') : root.S2AgeHealth, node ? require('./name-cohorts.js') : root.S2NameCohorts, node ? require('./activities.js') : root.S2Activities, node ? require('./subregion-income-data.js') : root.S2SubregionIncomeData);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Data = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Demographics, Income, Prices, Lifecycle, Housing, AgeHealth, Names, Activities, Subregions) {
  'use strict';
  const ROLES = { worker: '직장인', seeker: '구직자', graduate: '대학원생', caregiver: '돌봄 중심' };
  const ROLE_MODEL = Object.freeze({id:'fictional-roles-2026-v1',graduateMaxAge:46,graduateEligibleProbability:.02,
    sources:[{id:'kedi-graduate-2026',url:'https://www.kedi.re.kr/khome/main/announce/selectBroadAnnounceForm.do?article_sq_no=36467&board_sq_no=3&selectTp=0',count:363330},{id:'kosis-population-22-69-2026',url:'https://kosis.kr/visual/populationKorea/PopulationPyramidDetail.do?year=2026',count:36200944}],
    note:'2026년 대학원 재적학생과 22~69세 추계인구의 단순 비율 약 1%를 참고한 게임용 추첨입니다. 46세 이하의 대학원생 선택 확률은 2%이며, 나머지 세 역할은 같은 상대 가중치입니다. 46세 상한은 새 삶을 위한 설정으로 실제 입학 제한이 아니며, 기존 저장의 나이·역할은 바꾸지 않습니다.'});
  const MARITAL_STATUSES = {single:'미혼',married:'기혼',divorced:'이혼',widowed:'사별',unspecified:'이전 저장 · 설정하지 않음'};
  const MARITAL_MODEL = Object.freeze({id:'fictional-marital-stock-2020-v1',
    source:Object.freeze({id:'census-marital-stock-2020',publisher:'통계청',year:2020,published:'2021-09-27',
      title:'2020 인구주택총조사 표본집계 결과 · 성, 연령 및 혼인상태별 인구(15세 이상, 내국인)',
      url:'https://www.kostat.go.kr/boardDownload.es?bid=203&list_no=403144&seq=9',locator:'PDF62쪽 / 인쇄50쪽 통계표2, 전국 계',
      denominator:'해당 연령 구간의 내국인 전체 인구',measure:'현재 혼인상태가 이혼인 인구. 연간 이혼 건수나 혼인 대비 이혼 비율이 아님.'}),
    ageBands:Object.freeze([
      [15,19,2422002,66],[20,24,3193316,3833],[25,29,3423231,18863],
      [30,34,3032832,44446],[35,39,3594213,114484],[40,44,3758298,207477],
      [45,49,4195327,374605],[50,54,4245683,478830],[55,59,4091920,472687],
      [60,64,3795217,401412],[65,69,2685773,232336],[70,74,2009542,113414],
      [75,79,1593192,54307],[80,84,1115804,20487],[85,null,801197,8160]
    ].map(([minAge,maxAge,total,divorced])=>Object.freeze({minAge,maxAge,total,divorced}))),
    note:'2020 인구총조사에서 같은 연령대의 전체 내국인 중 현재 이혼 상태인 인구 비중으로 새 삶의 이혼 여부를 추첨합니다. 자녀 유무와 독립된 게임 추첨이며 실제 연령·자녀별 교차분포가 아닙니다. 이혼을 뽑지 않은 유자녀 가구는 기혼, 무자녀 가구는 기존 미혼·기혼 조합을 유지합니다. 나머지 혼인상태와 자녀 구성 전체가 실제 인구 비율은 아니며, 직접 설정과 기존 저장은 바꾸지 않습니다.'});
  const HOUSING_TENURES = {own:'자가',rent:'월세',jeonse:'전세',unspecified:'이전 저장 · 설정하지 않음'};
  const HOUSING_MODEL = Housing.MODEL;
  const FAMILY_MODEL = Object.freeze({id:'fictional-family-ages-v1',minimumParentAgeGap:25,preferredParentAgeGaps:[28,35],maximumParentAgeGap:45,note:'새 인생의 부모·자녀 나이는 최소 25세 차이, 첫 자녀와는 28~35세 차이에 무게를 둔 창작 규칙입니다. 실제 출산·혼인 연령 분포나 결혼 시점을 뜻하지 않으며, 직접 설정과 저장한 나이는 바꾸지 않습니다.'});
  const APPEARANCE_OPTIONS = {faceShape:['round','oval','square','heart','long'],hairStyle:['long-soft','short-swept','side-wave','rounded-crop','curly','bob','ponytail','buzz','bun','braids'],hairColor:['espresso','chestnut','honey','slate','silver'],skinTone:['ivory','warm','tan','deep'],outfitPalette:['moss','terracotta','indigo','rose','mustard','teal']};
  const GENDER_HAIR_STYLES = {man:['short-swept','side-wave','rounded-crop','curly','buzz'],woman:['long-soft','bob','ponytail','bun','braids']};
  const HOME_OPTIONS = {palette:['oat','sage','rose','sky','clay','lavender'],layout:['window-left','window-right','wide-window'],decor:['plants','books','art','music'],windowView:['skyline','hills','garden','river']};
  const base = { year: 2026, age: 32, gender: 'woman', maritalStatus:'single', personaName:'', lifeIntro:'', generationSeed:null, role: 'worker', children: 0, childAge: 'none', careShare: 50,
    province:'unspecified',residenceOrigin:null,appearance:null,homeStyle:null,generationModel:null,incomeOrigin:null,childProfiles:null,economicProfile:null,housingOrigin:null,ageHealthModel:AgeHealth.MODEL.id,
    housing: 'studio', housingTenure:'own',monthlyRent:0,housingLoanPrincipal:0,housingLoanRateBps:0,housingMaintenance:0,region: 'city', transport: 'transit', salary: 2800000, externalAllowance: 0,
    personalBudget: 500000, fixedCosts: 1500000, startCash: 2000000, payDay: 1, cardLimit: 1500000,
    preferences: ['walk', 'photo'], seed: 2026 };
  const PRESETS = [
    { id: 'worker', name: '직장인 · 작은 집의 새해', description: '출근과 자격증, 주말의 약속 사이에서 생활을 조율합니다.', config: { ...base } },
    { id: 'seeker', name: '구직자 · 다음 문을 준비하며', description: '외부 용돈과 모아 둔 현금으로 공부와 면접을 준비합니다.', config: { ...base, age: 26, role: 'seeker', salary: 0, externalAllowance: 850000, fixedCosts: 650000, startCash: 2500000, personalBudget: 220000, housing: 'shared', preferences: ['read', 'run'] } },
    { id: 'graduate', name: '대학원생 · 연구와 생활', description: '연구 지원금 성격의 외부 용돈, 발표와 논문 마감이 있는 한 해입니다.', config: { ...base, age: 29, role: 'graduate', salary: 0, externalAllowance: 1450000, fixedCosts: 1050000, personalBudget: 300000, startCash: 1800000, preferences: ['music', 'cook'] } },
    { id: 'caregiver', name: '돌봄 중심 · 함께 짓는 주말', description: '가구에서 받는 외부 생활비와 돌봄 분담을 설정합니다. 분담은 성별과 무관합니다.', config: { ...base, age: 38, role: 'caregiver', maritalStatus:'married', children: 1, childAge: 'preschool', careShare: 60, housing: 'apartment', region: 'town', transport: 'car', salary: 0, externalAllowance: 2200000, fixedCosts: 1400000, personalBudget: 420000, startCash: 1800000, preferences: ['garden', 'draw'] } }
  ];
  const { ACTIVITIES, ACTIVITY_MAP } = Activities;
  function canonicalActivityId(id){return ACTIVITY_MAP[id]?.canonicalId||id;}
  function preferenceActivityIds(config){return [...new Set((config?.preferences||[]).map(canonicalActivityId))];}
  function activityMinutes(config,id,override){
    const activity=ACTIVITY_MAP[id];if(!activity)throw new RangeError('활동을 확인하세요.');
    if(!activity.education)return activity.minutes;
    const minutes=override!==undefined?override:config?.educationMinutes?.[id]??activity.minutes;
    if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new RangeError('자녀 교육 시간은 1~1440분 사이의 정수로 입력하세요.');
    return minutes;
  }
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
  function activityReason(config,id){
    const activity=ACTIVITY_MAP[id];
    if(!activity)return '활동을 선택하세요.';
    if(activity.minAge&&config.age<activity.minAge)return activity.minAge+'세 이상이 선택하는 활동';
    if(activity.roles&&!activity.roles.includes(config.role))return activity.roles.map(role=>ROLES[role]).join(' · ')+'의 활동';
    const age=activity.parenting;
    if(age&&!getChildren(config).some(child=>child.militaryStatus!=='serving'&&child.age>=age.minAge&&child.age<=age.maxAge))return age.label+'와 함께하는 활동';
    return '';
  }
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
  function roleAvailableForNewLife(role,age){
    return Object.prototype.hasOwnProperty.call(ROLES,role)&&Number.isInteger(age)&&age>=18&&age<=100&&(role!=='graduate'||age<=ROLE_MODEL.graduateMaxAge);
  }
  function sampleRole(age,random){
    if(!Number.isInteger(age)||age<18||age>100)throw new RangeError('새 삶의 나이를 확인하세요.');
    const graduate=roleAvailableForNewLife('graduate',age)?ROLE_MODEL.graduateEligibleProbability:0;
    return weightedPick(Object.keys(ROLES),role=>role==='graduate'?graduate:(1-graduate)/3,random);
  }
  function divorcedShare(age){
    if(!Number.isInteger(age)||age<18||age>100)throw new RangeError('새 삶의 나이를 확인하세요.');
    const band=MARITAL_MODEL.ageBands.find(row=>age>=row.minAge&&(row.maxAge===null||age<=row.maxAge));
    return band.divorced/band.total;
  }
  function sampleMaritalStatus(age,children,originalStatus,random){
    const share=divorcedShare(age);
    if(!Number.isInteger(children)||children<0||children>6||!['single','married'].includes(originalStatus))throw new RangeError('새 삶의 가구 구성을 확인하세요.');
    const draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1)throw new RangeError('혼인상태 추첨값을 확인하세요.');
    return draw<share?'divorced':children>0?'married':originalStatus;
  }
  function assignPersonaName(config){
    const seed=config.generationSeed??config.seed;
    const surname=weightedPick(Demographics.surnames,row=>row.population,randomStream(seed,'surname')).name;
    config.personaName=surname+Names.sample(config,randomStream(seed,'name')).name;
    return config;
  }
  function provinceLabel(id){const found=Demographics.regions.find(r=>r.id===id);return found?(found.capital?'수도권 · ':'')+found.label:'지역 미설정';}
  function residenceLabel(config){const row=Subregions.byId(config.subregionId);return provinceLabel(config.province)+(row&&row.provinceId===config.province?' '+row.name:'');}
  function sampleSubregion(seed,province){const rows=Subregions.forProvince(province);return rows.length?weightedPick(rows,row=>row.count,randomStream(seed,'subregion:'+province)).id:'';}
  function sampleProvince(seed,capitalOnly=false){return weightedPick(Demographics.regions.filter(r=>!capitalOnly||r.capital),r=>r.population,randomStream(seed,'residence')).id;}
  function sampleOptions(options,random){return Object.fromEntries(Object.entries(options).map(([key,values])=>[key,values[Math.floor(random()*values.length)]]));}
  function assignRegionalIncome(config){
    if(config.generationModel==='kr-life-2026-v3')return assignLifeEconomy(config,{preserveTenure:true});
    if(config.province==='unspecified')return config;
    const sampled=Income.sample(config.province,randomStream(config.generationSeed??config.seed,'income:'+config.province));
    const supportShare={seeker:.3,graduate:.5,caregiver:.65}[config.role]||1;
    config.salary=config.role==='worker'?sampled.amount:0;
    config.externalAllowance=config.role==='worker'?0:Math.round(sampled.amount*supportShare);
    config.incomeOrigin={kind:config.role==='worker'?'wage':'support-model',sourceId:sampled.sourceId,bandId:sampled.bandId,provinceId:config.province,sampledMonthly:sampled.amount,assignedMonthly:config.salary+config.externalAllowance,supportShare};
    return config;
  }
  function assignLifeEconomy(config,options={}){
    const seed=config.generationSeed??config.seed;
    const sample=Lifecycle.sampleIncome(config,randomStream(seed,'lifecycle-income:'+config.province));
    config.salary=sample.salary;config.externalAllowance=sample.externalAllowance;config.incomeOrigin=sample.origin;
    Object.assign(config,Housing.sample(config,Lifecycle.household(config),randomStream(seed,'lifecycle-housing:'+config.province),options));
    Object.assign(config,Lifecycle.completeBudget(config,sample,randomStream(seed,'lifecycle-budget')));
    config.generationModel='kr-life-2026-v3';
    return config;
  }
  function generateLife(seed){
    if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw new RangeError('새 인생의 시드는 0~4294967295 정수여야 합니다.');
    // A private generator constructs a fictional person. It never touches the
    // external-event or followup streams owned by an active simulation.
    const next=randomStream(seed,'fictional-household');
    const pick=values=>values[Math.floor(next()*values.length)];
    // Keep the original household draws independent of both role and marital
    // status. Child presence alone must not imply that the parent is divorced.
    const profile=seed%16,config=JSON.parse(JSON.stringify(base));
    config.seed=seed;config.generationSeed=seed;
    config.maritalStatus=Math.floor(profile/4)%2?'married':'single';
    config.children=Math.floor(profile/8)?pick([1,1,2]):0;
    const parentAges=[22,26,29,32,35,38,41,45,49,52,56,59,62,65,69];
    config.age=pick(parentAges.filter(age=>!config.children||age>=FAMILY_MODEL.minimumParentAgeGap+config.children-1));
    config.role=sampleRole(config.age,randomStream(seed,'life-role'));
    config.maritalStatus=sampleMaritalStatus(config.age,config.children,config.maritalStatus,randomStream(seed,'marital-status'));
    const preset=PRESETS.find(item=>item.id===config.role);
    // These ages and household combinations are narrative choices, not sampled
    // age-specific census or military-service probabilities.
    const childRandom=randomStream(seed,'children-age-and-life'),childPick=values=>values[Math.floor(childRandom()*values.length)];
    const maximumGap=Math.min(FAMILY_MODEL.maximumParentAgeGap,config.age-config.children+1);
    const gaps=Array.from({length:Math.max(0,maximumGap-FAMILY_MODEL.minimumParentAgeGap+1)},(_,i)=>FAMILY_MODEL.minimumParentAgeGap+i);
    const firstAge=config.children?config.age-weightedPick(gaps,gap=>gap>=28&&gap<=35?6:gap<28?2:gap<=40?1:.5,childRandom):0;
    let previousAge=firstAge;
    config.childProfiles=Array.from({length:config.children},(_,index)=>{
      const gap=childPick([1,2,3]);
      const age=index===0?firstAge:previousAge-Math.min(gap,previousAge-(config.children-index-1));
      previousAge=age;
      const gender=childPick(['man','woman']);
      return {age,gender,militaryStatus:gender==='man'&&age>=18&&age<=28&&childRandom()<.35?'serving':'none'};
    });
    config.childAge=config.children?childStage(Math.min(...config.childProfiles.map(child=>child.age))):'none';
    config.gender=pick(['woman','man']);
    config.careShare=pick([30,45,60,75]);
    const householdSize=1+(config.maritalStatus==='married'?1:0)+config.children;
    config.housing=pick(householdSize>2?['apartment','shared']:['studio','apartment','shared']);config.region=pick(['city','town','rural']);config.transport=pick(['walk','transit','car']);
    config.generationModel='kr-life-2026-v3';config.province=sampleProvince(seed);config.subregionId=sampleSubregion(seed,config.province);config.residenceOrigin='population';
    // Keep the appearance stream's property order and number of draws unchanged.
    config.appearance=sampleOptions({...APPEARANCE_OPTIONS,hairStyle:GENDER_HAIR_STYLES[config.gender]},randomStream(seed,'appearance'));
    config.homeStyle=sampleOptions(HOME_OPTIONS,randomStream(seed,'home'));
    // Income, an actual-sized home and essential living costs are generated
    // together. Source distributions and gameplay support remain distinguishable.
    assignLifeEconomy(config);
    const interests=['walk','run','photo','cook','pottery','draw','music','read','garden','study','culture','cinema'].filter(id=>!ACTIVITY_MAP[id].manualOnly&&!ACTIVITY_MAP[id].requiresPreference&&!ACTIVITY_MAP[id].legacyOnly);
    config.preferences=[pick(interests)];config.preferences.push(pick(interests.filter(id=>id!==config.preferences[0])));
    assignPersonaName(config);
    const name=config.personaName;
    const region=residenceLabel(config);
    const role={worker:'일하며',seeker:'새로운 일자리를 찾으며',graduate:'대학원에서 공부하며',caregiver:'가까운 사람들을 돌보며'}[config.role];
    const family=config.maritalStatus==='married'?'배우자와 함께 살고 있어요.':config.maritalStatus==='divorced'?'이혼 후 나와 가족의 일상을 꾸려 가고 있어요.':'미혼이에요. 혼자만의 시간도, 가까운 사람들과의 시간도 소중해요.';
    const children=config.children?' 자녀는 '+config.childProfiles.map(child=>child.age+'세 '+(child.gender==='man'?'아들':'딸')+(child.militaryStatus==='serving'?'(군 복무 중)':'')).join(', ')+'입니다.':'';
    const intro=name+', '+config.age+'세. '+region+'에서 '+role+' 지냅니다. '+family+children+' 요즘은 '+config.preferences.map(id=>ACTIVITY_MAP[id].name).join(' · ')+'에 관심이 있어요.';
    config.lifeIntro=intro;
    return {presetId:preset.id,config,name,intro};
  }
  const SIDE_JOBS={delivery:{reward:18000,payDelayDays:1},parttime:{reward:32000,payDelayDays:1},sideproject:{milestones:[{sessions:2,reward:40000},{sessions:4,reward:80000}],deadlineDays:56,payDelayDays:1},note:'부업의 보수·소요시간·기회는 게임용 가정이며 실제 임금이나 수입을 보장하지 않습니다.'};
  return { VERSION: 6, PRESETS, ACTIVITIES, ACTIVITY_MAP, canonicalActivityId,preferenceActivityIds, ACTIVITY_GROUPS:Activities.ACTIVITY_GROUPS, ACTIVITY_CATEGORIES:Activities.ACTIVITY_CATEGORIES, ROLES, ROLE_MODEL,roleAvailableForNewLife,sampleRole, MARITAL_STATUSES,MARITAL_MODEL,divorcedShare,sampleMaritalStatus, HOUSING_TENURES, HOUSING_MODEL, FAMILY_MODEL, DEFAULT_CONFIG: base,generateLife,formatMoney,activityPrice,activityReason,getChildren,childStage,APPEARANCE_OPTIONS,GENDER_HAIR_STYLES,HOME_OPTIONS,DEMOGRAPHICS:Demographics,INCOME:Income,PRICES:Prices,LIFECYCLE:Lifecycle,HOUSING:Housing,SIDE_JOBS,randomStream,weightedPick,sampleProvince,provinceLabel,residenceLabel,sampleSubregion,SUBREGIONS:Subregions,assignRegionalIncome,assignLifeEconomy,
    activityMinutes,NAME_COHORTS:Names,assignPersonaName,AGE_HEALTH:AgeHealth,ageHealthProfile:AgeHealth.profile,
    DISCLAIMER: '가상 생활 시뮬레이션입니다. 사건 확률·감정·성과 변화는 게임용 가정이며 현실의 삶이나 능력을 예측하지 않습니다. 성별은 능력·급여·돌봄 의무에 영향을 주지 않습니다.' };
});
