(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Prices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Offline observations, checked 2026-10-17. These are not live quotations.
  // A survey observation, a single local menu, and a game estimate are distinct.
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const VERIFIED_ON = '2026-10-17';
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
      url: 'https://xn--2q1bn0k35as8o33eetb.kr/menu', observedAt: '2026-09', verifiedOn: VERIFIED_ON,
      services: {perm: '스타일펌', dye: '밀본 염색'},
      note: '업체가 2026년 9월 네이버 플레이스 기준으로 게시한 한 매장의 메뉴 사례입니다. 부산 평균이 아닙니다. 길이·숱·손상 정도에 따라 실제 가격이 달라지며, 전체 염색의 길이별 메뉴도 따로 있습니다.'
    },
    {
      id: 'seoul-hyundai-evening-2026q4', label: '서울 현대백화점 천호점 저녁 강좌 사례',
      publisher: '현대백화점 문화센터 천호점', basis: 'local-example', provinceId: 'seoul',
      url: 'https://www.ehyundai.com/newCulture/CT/CT010100_V.do?crsCd=37476&crsSqNo=41023&ctGubn=&proCustNo=P03644202&sqCd=132&stCd=260',
      observedAt: '2026-10-21/2026-11-25', verifiedOn: VERIFIED_ON,
      service: 'SNPE 바디리셋 클래스 20시', schedule: '수요일 20:00–20:50',
      conversion: {tuitionTotal: 120000, materialsTotal: 0, materialsEstimated: false, equipmentRentalTotal: 24000, rentalOptional: true, sessions: 6, total: 144000, rounding: 'nearest-won'},
      note: '6회 수강료 120,000원, 표기 재료비 0원. 필수 도구는 지참 또는 대여이며, 게임은 선택 대여비 24,000원까지 포함한 144,000원을 6회로 나눈 24,000원을 사용합니다. 개인 도구가 있으면 실제 대여비는 들지 않습니다. 서울 평균이나 실제 1회 등록 가격이 아닙니다.'
    },
    {
      id: 'busan-evening-sewing-2026q4', label: '부산광역시 여성회관 야간 봉제기초 사례',
      publisher: '부산광역시 여성회관', basis: 'local-example', provinceId: 'busan',
      url: 'https://reserve.busan.go.kr/lctre/view?resveGroupSn=86&progrmSn=25330',
      observedAt: '2026-10-06/2026-12-15', verifiedOn: VERIFIED_ON,
      service: '야간 봉제기초', schedule: '화요일 19:00–21:00', eligibility: '18세 이상 부산 시민',
      conversion: {tuitionTotal: 19250, materialsTotal: 30000, materialsEstimated: true, equipmentRentalTotal: 0, rentalOptional: false, sessions: 11, total: 49250, rounding: 'nearest-won'},
      note: '강의계획서상 11회·22시간. 수강료 19,250원과 직접 구매하는 예상 재료비 30,000원을 합해 11회로 나누고 원 단위 반올림하여 4,477원을 사용합니다. 실제 재료비는 달라질 수 있고, 부산 평균이나 실제 1회 등록 가격이 아닙니다. 전체 과정 합계와 회당 반올림 합계는 3원 차이가 납니다.'
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
    {provinceId:'busan',activityId:'dye',amount:45000,sourceId:'busan-hobak-hair-2026-09',service:'밀본 염색'},
    {provinceId:'seoul',activityId:'culture',amount:24000,sourceId:'seoul-hyundai-evening-2026q4',service:'저녁 운동 강좌 · 도구 대여 포함'},
    {provinceId:'busan',activityId:'culture',amount:4477,sourceId:'busan-evening-sewing-2026q4',service:'야간 봉제기초 · 예상 재료비 포함'}
  ]);
  const COVERAGE = freeze({
    verifiedOn: VERIFIED_ON, cutObservedAt: '2026-09', cutRegionCount: 16,
    cutRegions: CUT_ROWS.map(row => row.provinceId), cutMissing: ['sejong'],
    localExamples: {perm:['busan'],dye:['busan'],culture:['seoul','busan']},
    legacyHaircut: 'game-estimate', usesRegionalMultipliers: false, usesGender: false,
    note: '확인된 항목과 지역에만 자료를 사용합니다. 그 밖은 활동별 게임 기본값이며 지역 배율이나 추정 평균을 만들지 않습니다. 특정 업체·서로 다른 강좌의 사례 차이를 지역 물가 차이로 해석할 수 없습니다. 자료 시점의 값을 게임의 모든 날짜에 고정 적용하며 실제 운영 요일·예약·일괄 결제 조건을 재현하지 않습니다. 활동 시간과 능력·기분 효과는 별도의 게임 가정입니다.'
  });
  function quote(config, activityId, fallbackCost) {
    if (!Number.isSafeInteger(fallbackCost) || fallbackCost < 0) throw new RangeError('기본 비용은 0 이상의 안전한 원화 정수여야 합니다.');
    const provinceId = config && REGION_IDS.includes(config.province) ? config.province : 'unspecified';
    const cut = CUT_ROWS.find(row => row.provinceId === provinceId);
    if (cut && (activityId === 'haircut_men' || activityId === 'haircut_women')) {
      const source = SOURCES[0];
      return {amount:cut[activityId],sourceId:source.id,label:source.label,basis:'regional-survey',provinceId,
        observedAt:source.observedAt,service:source.services[activityId],sourceLabel:cut.sourceLabel,
        note:source.note + ' 메뉴는 플레이어가 선택하며 인물의 성별로 자동 결정하지 않습니다.'};
    }
    const local = LOCAL_ROWS.find(row => row.provinceId === provinceId && row.activityId === activityId);
    if (local) {
      const source = SOURCES.find(item => item.id === local.sourceId);
      return {amount:local.amount,sourceId:source.id,label:source.label,basis:'local-example',provinceId,
        observedAt:source.observedAt,service:local.service,note:source.note + ' 게임에서는 자료 시점의 비용을 모든 날짜에 고정 적용합니다.',
        ...(source.conversion ? {conversion:source.conversion} : {})};
    }
    const note = activityId === 'haircut' ? '이전 기본 커트는 구체적인 서비스 종류를 선택하지 않은 게임 기본값입니다. 성별로 남성·여성 커트를 자동 선택하지 않습니다.' :
      provinceId === 'sejong' && (activityId === 'haircut_men' || activityId === 'haircut_women') ? '2026년 9월 참가격 조회에서 세종의 해당 자료가 확인되지 않아 활동의 게임 기본값을 사용합니다.' :
      '이 지역·활동의 확인된 가격 자료가 없어 활동의 게임 기본값을 사용합니다. 실제 지역 평균이나 업체 견적이 아닙니다.';
    return {amount:fallbackCost,sourceId:null,label:'게임 기본값 · 해당 지역 실측 아님',basis:'game-estimate',provinceId,observedAt:null,service:null,note};
  }
  return freeze({VERSION:1, VERIFIED_ON, SOURCES, CUT_ROWS, LOCAL_ROWS, COVERAGE, quote});
});
