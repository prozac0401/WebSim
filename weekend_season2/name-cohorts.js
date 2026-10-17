(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2NameCohorts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODEL = {
    id: 'kr-birth-name-cohorts-v1', firstYear: 1940, lastYear: 2021,
    sampling: '해당 출생 세대의 수록 이름 안에서 균등 추첨',
    representsPopulationFrequency: false,
    note: '시즌 연도에서 나이를 뺀 출생연도로 이름 후보군을 고릅니다. 공개 연구의 시대별 출생신고 상위 이름 목록을 참고하되, 목록 안의 균등 추첨은 게임 가정입니다. 실제 전체 인구의 이름 빈도나 개인의 성별·성격·능력을 예측하지 않습니다.',
    genderNote: '남성·여성을 선택하면 자료의 해당 이름 목록을 참고합니다. 그 외·미설정은 두 목록의 중복을 없앤 합집합을 사용합니다. 이름으로 성별이나 역할을 정하지 않습니다.',
    extrapolationNote: '1940년 이전은 가장 이른 확인 코호트, 2021년 이후는 가장 최근 확인한 2020~2021년 코호트를 사용합니다. 자료 밖 출생연도의 실제 이름 분포나 미래 유행을 예측한 값이 아닙니다.',
    preservationNote: '새 이름을 배정할 때만 사용하는 모듈입니다. 저장한 이름이나 직접 정한 이름을 변경하지 않습니다.'
  };
  const SOURCES = [
    {
      id: 'kim-go-birth-names-2022',
      label: '김종미·고우리(2022) · 시대별 출생신고 이름',
      title: 'Historical evidence of phonological changes in Korean names, 1940–2021',
      authors: ['Jong-mi Kim', 'U-ri Go'], publisher: '한국음운론학회 · 음성음운형태론연구 28(3)',
      url: 'https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART002912535',
      dataUrl: 'https://www.researchgate.net/publication/383095210_Historical_evidence_of_phonological_changes_in_Korean_names_1940-2021',
      doi: '10.17959/sppm.2022.28.3.417', published: '2022-12-31', verifiedOn: '2026-10-17',
      primaryResearch: true, governmentPublication: false,
      locator: '부록 표5 · 인쇄 436~438쪽 · 출생명 남자/여자 열만 사용, 개명 열 제외',
      period: '1940~2019년의 10년 단위 코호트 및 2020~2021년',
      unit: '각 코호트·자료상 성별별 상위 이름 20개, 순위 목록',
      scope: '연구자가 대법원 정보공개 청구와 공개 통계로 확보한 출생신고 이름 집계의 부록 목록. 지역별 이름 분포를 추정하거나 개인 프로필·주소를 사용하지 않습니다.',
      note: '각 목록의 이름은 공개 원표에서 확인했습니다. 신고 건수·전체 모집단 분모는 이 부록에 없어 실제 확률 가중치를 만들지 않습니다. 출생명 목록이며 개명 후의 현재 성인 전체 이름 분포는 아닙니다.'
    },
    {
      id: 'scourt-birth-name-definition', label: '대법원 · 상위 출생신고 이름 통계 안내',
      publisher: '대법원 전자가족관계등록시스템',
      url: 'https://stfamily.scourt.go.kr/st/StFrrStatcsView.do?pgmId=090000000025',
      verifiedOn: '2026-10-17', governmentPublication: true,
      scope: '현재 공개 서비스는 2008년 이후 가족관계등록부에 기록된 출생사건의 등록일 기준 이름 순위 잠정치라고 안내합니다.',
      note: '이 링크는 통계 정의를 확인한 자료입니다. 1940~2007년 목록을 현재 서비스에서 직접 조회했다는 뜻이 아니며, 역사적 목록의 근거는 위 연구자의 공개 부록입니다.'
    }
  ];

  // Exact birth-name columns of Table 5. The adjacent changed-name columns
  // are intentionally excluded. Rank order is retained for source auditing,
  // but sample() does not turn ranks into invented probability weights.
  const rows = [
    [1940, 1949,
      '영수 영호 영식 영길 정웅 정수 영철 종수 영일 영환 광수 정길 정호 정남 정식 영기 동수 종철 창수 정일',
      '영자 정자 순자 춘자 정순 경자 옥자 정숙 숙자 영순 영숙 명자 옥순 화자 금자 정희 복순 영희 금순 순옥'],
    [1950, 1959,
      '영수 영철 영호 영식 성수 성호 종수 정호 영환 상철 정수 광수 종철 상호 철수 종호 명수 경수 창수 영길',
      '영숙 정숙 순자 영희 영자 영순 명숙 정희 경숙 순옥 정순 경자 정자 명자 숙자 순희 인숙 현숙 옥자 옥순'],
    [1960, 1969,
      '영수 성호 영호 영철 정호 성수 영식 상호 영진 상철 진호 경수 재호 병철 경호 정수 종호 종수 재영 종철',
      '미숙 미경 영숙 경숙 정숙 경희 현숙 명숙 영희 정희 영미 은숙 인숙 미자 명희 미영 선희 경자 영순 순옥'],
    [1970, 1979,
      '정훈 성호 성훈 성진 상훈 정호 준호 영진 성민 상현 진호 영민 지훈 영수 민수 영호 재훈 재영 현수 재현',
      '은주 은정 미경 은영 미영 현주 은경 지영 미정 현정 은희 경희 영미 정희 선희 미숙 선영 현숙 희정 은숙'],
    [1980, 1989,
      '지훈 정훈 성민 성훈 준호 현우 동현 상현 성진 상훈 민수 준영 승현 진우 영민 성호 진호 정민 재현 재훈',
      '지혜 지영 혜진 은정 수진 지은 지연 현정 민정 은영 지현 선영 유진 현주 은경 은주 정은 소영 수정 선미'],
    [1990, 1999,
      '지훈 동현 현우 성민 민수 준영 준호 재현 승현 성현 준혁 민규 진우 정훈 민석 현준 상현 정현 현수 민우',
      '유진 민지 지은 지혜 지현 은지 수진 지영 지원 혜진 지수 수빈 민정 소연 지연 수연 소영 현지 수정 현정'],
    [2000, 2009,
      '민준 현우 지훈 동현 민재 준혁 준서 준영 현준 성민 승민 민규 건우 민성 도현 민석 우진 승현 재민 진우',
      '유진 서연 수빈 민지 지원 민서 예진 수민 서현 지민 예은 서영 수연 예원 민주 지현 지윤 은서 윤서 지우'],
    [2010, 2019,
      '민준 서준 도윤 예준 주원 시우 지호 지후 하준 준우 건우 준서 도현 우진 현우 지훈 선우 서진 현준 유준',
      '서윤 서연 지우 서현 하은 하윤 민서 지유 채원 윤서 다은 소율 지아 지윤 지민 수아 은서 지안 예원 하린'],
    [2020, 2021,
      '서준 이준 도윤 하준 시우 지호 은우 이안 예준 유준 수호 주원 선우 준우 건우 우진 서진 연우 도현 민준',
      '서아 하윤 지안 서윤 아린 지아 하린 하은 아윤 지우 시아 지유 수아 나은 서연 유나 서우 이서 예나 서하']
  ];
  const COHORTS = rows.map(([from, to, men, women]) => ({
    id: 'birth-' + from + '-' + to, from, to, referenceYear: from,
    label: from === 2020 ? '2020~2021년 출생신고 이름' : from + '년대 출생신고 이름',
    men: men.split(' '), women: women.split(' '), sourceIds: ['kim-go-birth-names-2022']
  }));
  const COVERAGE = {
    cohorts: COHORTS.length,
    tableEntries: COHORTS.reduce((n, c) => n + c.men.length + c.women.length, 0),
    distinctNames: new Set(COHORTS.flatMap(c => [...c.men, ...c.women])).size,
    fullPopulationDenominator: null, registrationCounts: null,
    representsPopulationFrequency: false
  };
  function selection(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        !Number.isInteger(config.year) || config.year < 1900 || config.year > 9999 ||
        !Number.isInteger(config.age) || config.age < 0 || config.age > 120) {
      throw new RangeError('이름을 정할 시즌 연도와 나이를 확인하세요.');
    }
    const birthYear = config.year - config.age;
    const reference = Math.max(MODEL.firstYear, Math.min(MODEL.lastYear, birthYear));
    const cohort = COHORTS.find(c => reference >= c.from && reference <= c.to);
    const gender = ['man', 'male'].includes(config.gender) ? 'men' : ['woman', 'female'].includes(config.gender) ? 'women' : 'all';
    const names = gender === 'all' ? [...new Set([...cohort.men, ...cohort.women])] : cohort[gender];
    return {birthYear, cohort, gender, names, extrapolated: reference !== birthYear};
  }
  function sample(config, random) {
    const selected = selection(config);
    if (typeof random !== 'function') throw new TypeError('재현 가능한 이름 추첨 함수가 필요합니다.');
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('이름 추첨값은 0 이상 1 미만이어야 합니다.');
    return {
      name: selected.names[Math.floor(value * selected.names.length)],
      cohortId: selected.cohort.id, birthYear: selected.birthYear,
      // This is the start of a verified period, not an observed annual count.
      referenceYear: selected.cohort.referenceYear,
      referencePeriod: [selected.cohort.from, selected.cohort.to],
      sourceIds: selected.cohort.sourceIds.slice(), extrapolated: selected.extrapolated
    };
  }
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  }
  return freeze({MODEL, SOURCES, COHORTS, COVERAGE, sample});
});
