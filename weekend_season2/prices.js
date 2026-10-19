(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Prices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Offline observations. Each source has its own verification date; no live quotations.
  // A survey observation, a single local menu, and a game estimate are distinct.
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const VERIFIED_ON = '2026-10-19';
  const REGION_IDS = ['seoul','busan','daegu','incheon','gwangju','daejeon','ulsan','sejong','gyeonggi','gangwon','chungbuk','chungnam','jeonbuk','jeonnam','gyeongbuk','gyeongnam','jeju'];
  const SOURCES = freeze([
    {
      id: 'kca-personal-2026-09', label: '참가격 개인서비스요금 · 2026년 9월',
      publisher: '한국소비자원 참가격 · 행정안전부 제공 자료', basis: 'regional-survey',
      url: 'https://www.price.go.kr/tprice/portal/servicepriceinfo/serviceindustryprice/serviceIndustryPriceList.do?searchYear=2026&searchMonth=09&searchArea=',
      definitionUrl: 'https://www.price.go.kr/tprice/portal/pricetrend/personalservicetrend/getPersonalServiceTrend.do',
      observedAt: '2026-09', verifiedOn: VERIFIED_ON, unit: '원 / 성인 커트 1회',
      services: {haircut_men: '이용료 · 남자 성인 커트 1회', haircut_women: '미용료 · 여자 성인 커트 1회'},
      coverage: '조회된 16개 지역. 세종은 같은 월 조회 결과가 없어 미확인.',
      sampleSize: null,
      note: '잠정 조사값이며 조사 업소와 서비스 품질이 지역마다 같지 않아 단순 비교에 주의해야 합니다. 페이지에 표본 수와 산식은 제시되지 않았습니다. 모든 업소의 가격 또는 개인별 견적을 뜻하지 않습니다.'
    },
    {
      id: 'busan-hobak-hair-2026-09', label: '부산 명장동 호박넝쿨헤어 공개 가격표',
      publisher: '호박넝쿨헤어 명장점', basis: 'local-example', provinceId: 'busan',
      url: 'https://xn--2q1bn0k35as8o33eetb.kr/menu', observedAt: '2026-09', verifiedOn: '2026-10-17',
      services: {perm: '스타일펌', dye: '밀본 염색'},
      note: '업체가 2026년 9월 네이버 플레이스 기준으로 게시한 한 매장의 메뉴 사례입니다. 부산 평균이 아닙니다. 길이·숱·손상 정도에 따라 실제 가격이 달라지며, 전체 염색의 길이별 메뉴도 따로 있습니다.'
    },
    {
      id: 'seoul-hyundai-evening-2026q4', label: '서울 현대백화점 천호점 저녁 강좌 사례',
      publisher: '현대백화점 문화센터 천호점', basis: 'local-example', provinceId: 'seoul',
      url: 'https://www.ehyundai.com/newCulture/CT/CT010100_V.do?crsCd=37476&crsSqNo=41023&ctGubn=&proCustNo=P03644202&sqCd=132&stCd=260',
      observedAt: '2026-10-21/2026-11-25', verifiedOn: '2026-10-17', referenceOnly: true,
      service: 'SNPE 바디리셋 클래스 20시', schedule: '수요일 20:00–20:50',
      conversion: {tuitionTotal: 120000, materialsTotal: 0, materialsEstimated: false, equipmentRentalTotal: 24000, rentalOptional: true, sessions: 6, total: 144000, rounding: 'nearest-won'},
      note: '6회 수강료 120,000원, 표기 재료비 0원. 선택 도구 대여비 24,000원을 포함하면 회당 환산액은 24,000원입니다. 이전 버전에서 사용한 개별 강좌 참고 자료이며 현재 문화 활동 요금에는 적용하지 않습니다. 개인 도구가 있으면 실제 대여비는 들지 않습니다. 서울 평균이나 실제 1회 등록 가격이 아닙니다.'
    },
    {
      id: 'busan-evening-sewing-2026q4', label: '부산광역시 여성회관 야간 봉제기초 사례',
      publisher: '부산광역시 여성회관', basis: 'local-example', provinceId: 'busan',
      url: 'https://reserve.busan.go.kr/lctre/view?resveGroupSn=86&progrmSn=25330',
      observedAt: '2026-10-06/2026-12-15', verifiedOn: '2026-10-17', referenceOnly: true,
      service: '야간 봉제기초', schedule: '화요일 19:00–21:00', eligibility: '18세 이상 부산 시민',
      conversion: {tuitionTotal: 19250, materialsTotal: 30000, materialsEstimated: true, equipmentRentalTotal: 0, rentalOptional: false, sessions: 11, total: 49250, rounding: 'nearest-won'},
      note: '강의계획서상 11회·22시간. 수강료 19,250원과 예상 재료비 30,000원을 합해 11회로 나누면 회당 반올림액은 4,477원입니다. 이전 버전에서 사용한 개별 강좌 참고 자료이며 현재 문화 활동 요금에는 적용하지 않습니다. 실제 재료비는 달라질 수 있고, 부산 평균이나 실제 1회 등록 가격이 아닙니다. 전체 과정 합계와 회당 반올림 합계는 3원 차이가 납니다.'
    },
    {
      id:'kca-dining-2026-09',label:'참가격 외식비 8개 품목 · 2026년 9월',
      publisher:'한국소비자원 참가격 · 행정안전부 제공 자료',basis:'regional-survey',
      url:'https://www.price.go.kr/tprice/portal/servicepriceinfo/dineoutprice/dineOutPriceList.do?searchYear=2026&searchMonth=09&searchArea=',
      definitionUrl:'https://hamoni.mois.go.kr/portal/lcpr/indvSrcvEatoutCstList.do',
      observedAt:'2026-09',verifiedOn:VERIFIED_ON,unit:'원 / 품목별 표준 단위',
      coverage:'같은 달의 8개 품목이 모두 있는 16개 시도 행. 세종은 별도 행이 없어 게임 전국 기준값을 사용합니다.',
      sampleSize:null,
      note:'원자료는 잠정치입니다. 동일 시점에도 지역별 조사 업소와 상품 품질이 달라 직접 가격 비교에 한계가 있습니다. 세종은 행정안전부 원문에서 충남에 포함되지만 별도 가격을 알 수 없어 세종값으로 대체하지 않습니다. 품목별 16개 관측 지역의 단순평균은 인구·지출 가중 전국 평균이 아니며, 문화 서비스 가격이나 소비자물가지수도 아닙니다.'
    }
  ]);
  // Source labels are retained: the source separates 광주 and 전남 observations.
  const CUT_ROWS = freeze([
    {provinceId:'seoul',sourceLabel:'서울',haircut_men:13308,haircut_women:24462},
    {provinceId:'busan',sourceLabel:'부산',haircut_men:11286,haircut_women:19614},
    {provinceId:'daegu',sourceLabel:'대구',haircut_men:12833,haircut_women:22333},
    {provinceId:'incheon',sourceLabel:'인천',haircut_men:13833,haircut_women:25667},
    {provinceId:'gwangju',sourceLabel:'전남광주(광주)',haircut_men:15200,haircut_women:17800},
    {provinceId:'daejeon',sourceLabel:'대전',haircut_men:15600,haircut_women:17800},
    {provinceId:'ulsan',sourceLabel:'울산',haircut_men:13600,haircut_women:18000},
    {provinceId:'gyeonggi',sourceLabel:'경기',haircut_men:14483,haircut_women:19724},
    {provinceId:'gangwon',sourceLabel:'강원',haircut_men:16444,haircut_women:20667},
    {provinceId:'chungbuk',sourceLabel:'충북',haircut_men:13857,haircut_women:20143},
    {provinceId:'chungnam',sourceLabel:'충남',haircut_men:15000,haircut_women:18400},
    {provinceId:'jeonbuk',sourceLabel:'전북',haircut_men:13600,haircut_women:15300},
    {provinceId:'jeonnam',sourceLabel:'전남광주(전남)',haircut_men:15556,haircut_women:20667},
    {provinceId:'gyeongbuk',sourceLabel:'경북',haircut_men:14077,haircut_women:18692},
    {provinceId:'gyeongnam',sourceLabel:'경남',haircut_men:14385,haircut_women:20077},
    {provinceId:'jeju',sourceLabel:'제주',haircut_men:13000,haircut_women:24375}
  ]);
  const LOCAL_ROWS = freeze([
    {provinceId:'busan',activityId:'perm',amount:60000,sourceId:'busan-hobak-hair-2026-09',service:'스타일펌'},
    {provinceId:'busan',activityId:'dye',amount:45000,sourceId:'busan-hobak-hair-2026-09',service:'밀본 염색'}
  ]);
  // Source order: cold noodles, bibimbap, kimchi meal, pork standardized to 200g,
  // jajangmyeon, samgyetang, kalguksu, gimbap (one roll). Never mix raw pork portions.
  const DINING_ROWS=freeze([
    ['seoul','서울',[12692,12000,8846,21321,7808,18269,10038,3923]],
    ['busan','부산',[12000,9686,8429,18175,7000,17429,8071,3571]],
    ['daegu','대구',[11750,10467,8583,18470,7167,17167,7583,3250]],
    ['incheon','인천',[11917,9167,8667,17685,7083,17000,9000,3667]],
    ['gwangju','전남광주(광주)',[10600,10800,9100,16533,7400,16800,9400,3860]],
    ['daejeon','대전',[11000,10700,10600,18600,7600,16800,8800,3300]],
    ['ulsan','울산',[10800,11200,9000,17677,7000,15800,9500,3700]],
    ['gyeonggi','경기',[10931,9945,8841,18166,7586,17690,9810,3786]],
    ['gangwon','강원',[10556,10444,9000,15963,7167,16556,9389,3389]],
    ['chungbuk','충북',[9714,9429,9714,15305,6857,15714,8857,3286]],
    ['chungnam','충남',[10500,10150,9500,17742,7100,16200,9200,3280]],
    ['jeonbuk','전북',[10500,12100,9550,16300,7200,17600,9350,3400]],
    ['jeonnam','전남광주(전남)',[9778,9556,8278,19235,7167,16667,9222,2944]],
    ['gyeongbuk','경북',[10346,9908,8923,17306,6846,16077,8462,3462]],
    ['gyeongnam','경남',[10808,9231,8808,20067,7000,17231,8077,3731]],
    ['jeju','제주',[9750,10500,9625,17944,7750,17000,10375,3625]]
  ].map(([provinceId,sourceLabel,prices])=>({provinceId,sourceLabel,prices})));
  const REGIONAL_MODEL=freeze({id:'dining-basket-leisure-v1',sourceId:'kca-dining-2026-09',minFactor:.85,maxFactor:1.15,
    activityIds:['walk','run','pt','photo','cook','pottery','draw','music','read','garden','culture','cinema','friends','family_time','volunteer','rest','motorbike_tour','domestic_trip','golf_round','circuit_drive'],
    items:[['cold_noodles','냉면','보통 1인분'],['bibimbap','비빔밥','보통 1인분'],['kimchi_meal','김치찌개 백반','보통 1인분'],['pork_200g','삼겹살','200g 환산'],['jajangmyeon','자장면','보통 1인분'],['samgyetang','삼계탕','보통 1인분'],['kalguksu','칼국수','보통 1인분'],['gimbap','김밥','1줄']].map(([id,label,unit])=>({id,label,unit})),
    referenceMeans:Array.from({length:8},(_,i)=>DINING_ROWS.reduce((sum,row)=>sum+row.prices[i],0)/DINING_ROWS.length),
    referenceMethod:'각 품목의 관측 16개 지역 단순평균. 지역·품목 모두 동일 가중치이며 전국 인구·지출 가중 평균이 아님.',
    note:'8개 외식 품목마다 지역 가격/관측 16개 지역 단순평균의 비율을 구하고, 그 8개 비율의 평균에 제곱근을 취해 0.85~1.15배로 제한한 게임 계수입니다. 모든 유료 여가 활동의 게임 기본값에 같은 계수를 곱하고 원 단위 반올림합니다. 문화·운동·재료·여행 비용의 지역별 실측 평균이나 소비자물가지수가 아니며, 품질이 다른 업소를 조사한 원자료의 비교 한계가 있습니다. 구·시·군은 소속 시도 계수를 공유합니다. 세종과 지역 미설정은 전국 공통 게임 기본값 1배로 대체하고, 무료 활동은 0원입니다. 자료 시점의 가격은 게임의 모든 날짜에 고정 적용하며 이미 결제한 기록은 다시 계산하지 않습니다.'});
  function regionalFactor(provinceId){
    const row=DINING_ROWS.find(item=>item.provinceId===provinceId);if(!row)return 1;
    const ratio=row.prices.reduce((sum,price,i)=>sum+price/REGIONAL_MODEL.referenceMeans[i],0)/REGIONAL_MODEL.items.length;
    return Math.max(REGIONAL_MODEL.minFactor,Math.min(REGIONAL_MODEL.maxFactor,Math.sqrt(ratio)));
  }
  const COVERAGE = freeze({
    verifiedOn: VERIFIED_ON, cutObservedAt: '2026-09', cutRegionCount: 16,
    cutRegions: CUT_ROWS.map(row => row.provinceId), cutMissing: ['sejong'],
    localExamples: {perm:['busan'],dye:['busan']},cultureReferences:['seoul-hyundai-evening-2026q4','busan-evening-sewing-2026q4'],
    diningObservedAt:'2026-09',diningRegionCount:DINING_ROWS.length,diningMissing:['sejong'],
    legacyHaircut:'unspecified-gender-game-estimate',usesRegionalMultipliers:true,usesGender:true,
    note:'커트는 성별에 맞는 성인 커트 조사값, 펌·염색은 확인된 부산 한 업체 사례를 사용합니다. 유료 여가 활동은 외식비 자료를 연결한 지역 게임 계수이며 실제 문화 비용 실측값이 아닙니다. 서로 다른 서울·부산 강좌는 참고 자료로만 남기고 지역 물가 차이로 해석하지 않습니다. 자료가 없는 지역은 전국 공통 게임 기본값입니다. 모든 날짜에 자료 시점 값을 고정 적용하며 실제 운영 요일·예약·일괄 결제 조건은 재현하지 않습니다. 활동 시간과 효과는 별도의 게임 가정입니다.'
  });
  function quote(config, activityId, fallbackCost) {
    if (!Number.isSafeInteger(fallbackCost) || fallbackCost < 0) throw new RangeError('기본 비용은 0 이상의 안전한 원화 정수여야 합니다.');
    const provinceId = config && REGION_IDS.includes(config.province) ? config.province : 'unspecified';
    const cut = CUT_ROWS.find(row => row.provinceId === provinceId);
    const gender=config?.gender,cutId=activityId==='haircut'?['man','male'].includes(gender)?'haircut_men':['woman','female'].includes(gender)?'haircut_women':null:activityId;
    if (cut && (cutId === 'haircut_men' || cutId === 'haircut_women')) {
      const source = SOURCES[0];
      return {amount:cut[cutId],sourceId:source.id,label:source.label,basis:'regional-survey',provinceId,
        observedAt:source.observedAt,service:source.services[cutId],sourceLabel:cut.sourceLabel,
        note:source.note + (activityId==='haircut'?' 설정한 성별에 해당하는 성인 커트 항목을 사용합니다.':' 이전 저장의 선택한 커트 종류와 요금을 유지합니다.')};
    }
    const local = LOCAL_ROWS.find(row => row.provinceId === provinceId && row.activityId === activityId);
    if (local) {
      const source = SOURCES.find(item => item.id === local.sourceId);
      return {amount:local.amount,sourceId:source.id,label:source.label,basis:'local-example',provinceId,
        observedAt:source.observedAt,service:local.service,note:source.note + ' 게임에서는 자료 시점의 비용을 모든 날짜에 고정 적용합니다.',
        ...(source.conversion ? {conversion:source.conversion} : {})};
    }
    if(activityId==='haircut'&&cutId){
      return {amount:cutId==='haircut_men'?20000:25000,sourceId:null,label:'성별 커트 게임 기본값 · 지역 자료 없음',basis:'game-estimate',provinceId,
        observedAt:null,service:cutId==='haircut_men'?'남성 커트 게임 기본값':'여성 커트 게임 기본값',
        note:'이 지역의 해당 커트 조사값이 없어 남성 20,000원·여성 25,000원의 게임 기본값을 사용합니다. 지역 실측 평균이나 업체 견적이 아닙니다.'};
    }
    if(REGIONAL_MODEL.activityIds.includes(activityId)&&fallbackCost>0){
      const regional=DINING_ROWS.find(row=>row.provinceId===provinceId),factor=regionalFactor(provinceId),amount=Math.round(fallbackCost*factor);
      if(!Number.isSafeInteger(amount))throw new RangeError('지역 비용 계산이 안전한 원화 정수 범위를 벗어났습니다.');
      const source=SOURCES.find(item=>item.id===REGIONAL_MODEL.sourceId);
      return {amount,sourceId:regional?source.id:null,label:regional?'지역 물가를 연결한 게임 추정':'전국 공통 게임 기본값 · 지역 자료 없음',basis:regional?'regional-game-estimate':'game-estimate',provinceId,
        observedAt:regional?source.observedAt:null,service:null,baseAmount:fallbackCost,regionalFactor:factor,regionalModelId:REGIONAL_MODEL.id,
        note:(regional?source.note:provinceId==='sejong'?'세종의 독립된 같은 달 가격 행이 없어 전국 공통 게임 기본값을 사용합니다.':'거주 시도 자료가 없어 전국 공통 게임 기본값을 사용합니다.')+' '+REGIONAL_MODEL.note};
    }
    const note = activityId === 'haircut' && !cutId ? '성별이 지정되지 않은 이전 기본 커트는 성인 서비스 종류를 추정하지 않고 기존 게임 기본값을 유지합니다.' :
      provinceId === 'sejong' && (activityId === 'haircut_men' || activityId === 'haircut_women') ? '2026년 9월 참가격 조회에서 세종의 해당 자료가 확인되지 않아 활동의 게임 기본값을 사용합니다.' :
      '이 지역·활동의 확인된 가격 자료가 없어 활동의 게임 기본값을 사용합니다. 실제 지역 평균이나 업체 견적이 아닙니다.';
    return {amount:fallbackCost,sourceId:null,label:'게임 기본값 · 해당 지역 실측 아님',basis:'game-estimate',provinceId,observedAt:null,service:null,note};
  }
  return freeze({VERSION:2, VERIFIED_ON, SOURCES, CUT_ROWS, LOCAL_ROWS, DINING_ROWS,REGIONAL_MODEL,regionalFactor,COVERAGE, quote});
});
