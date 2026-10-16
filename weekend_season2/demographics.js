(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Demographics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Frozen, local snapshots. No requests, individual records, addresses or
  // real-person profiles are used when generating a fictional life.
  const verifiedOn = '2026-10-17';
  const sources = [
    {
      id: 'mois-population-2024', primary: true, publisher: '행정안전부',
      title: '2025 행정안전통계연보 · 4-1-2-1 지역별 주민등록인구',
      url: 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000013&nttId=120079',
      dataUrl: 'https://www.mois.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_00138511EvCPqJj&fileSn=0',
      definitionUrl: 'https://data.seoul.go.kr/dataList/DT201004A010016/S/2/datasetView.do',
      published: '2025-08-27', asOf: '2024-12-31', verifiedOn,
      locator: '인쇄 105쪽 / PDF 151쪽, 단위 명',
      scope: '전국 17개 시도 주민등록인구 51,217,221명. 모든 연령의 거주자·거주불명자·재외국민 포함, 외국인 제외.',
      limitations: '2024년 말 주민등록상 지역 분포이며 실제 상주인구, 2026년 현재 인구나 성인만의 분포가 아니다. 지역별 소득·역할·성격을 추론하는 자료로 사용하지 않는다.'
    },
    {
      id: 'names-birth-2008', primary: false, publisher: '아기이름 baby-name.kr',
      title: '2008년 연도별 남자 여자 이름 순위 · 각 상위 50위',
      url: 'https://baby-name.kr/annalRanking/2008/',
      asOf: '2008', verifiedOn,
      scope: '공개된 2008년 출생신고 이름 순위 표의 남자·여자 각 50위까지에 실제 등장하는 이름. 두 표의 중복 이름은 하나로 합친다.',
      limitations: '민간의 2차 집계이며 이 작업에서 법원 원자료의 개별 수치는 대조하지 못했다. 이름의 존재를 확인하는 목록으로만 사용하고 신고 건수·순위를 추출 확률로 사용하지 않는다. 특정 출생신고 연도이므로 현재 성인 전체를 대표하지 않는다.'
    },
    {
      id: 'names-historical-2007', primary: false, publisher: '동아일보 · 대법원 집계 인용',
      title: '1945→1975→2006 시대별 흔한 이름',
      url: 'https://www.donga.com/news/article/all/20070320/8420508/9',
      published: '2007-03-20', asOf: '1945, 1975, 2006', verifiedOn,
      scope: '보도에 실린 대법원 집계의 세 출생연도별 남자·여자 상위 5개 이름, 총 30개 표 항목.',
      limitations: '성인 출생 세대의 이름을 포함하기 위한 역사적 표이다. 각 세대 전체 이름 목록이나 현재 생존 성인의 빈도는 아니다. 원문과 수치가 다른 타 보도도 있어 인원수를 가중치로 옮기지 않는다.'
    },
    {
      id: 'names-historical-2016', primary: false, publisher: '연합뉴스 · 대법원 집계 인용',
      title: '시기별 선호이름 · 1940년대 이후 집계',
      url: 'https://v.daum.net/v/20160509061604382',
      published: '2016-05-09', asOf: '1940년대~2015년', verifiedOn,
      scope: '기사에서 대법원 집계 결과로 명시한 일반 이름·외자 이름·한글 이름. 개인의 인적 사항은 수집하지 않는다.',
      limitations: '보도에서 확인한 이름의 합집합이며 시대·성별·현재 인구의 빈도표가 아니다. 이름으로 게임 인물의 성별·역할·능력을 결정하지 않는다.'
    },
    {
      id: 'kostat-surnames-2015', primary: true, publisher: '통계청',
      title: '2015 인구주택총조사 전수집계결과 · 성씨별 인구',
      url: 'https://www.kostat.go.kr/boardDownload.es?bid=203&list_no=356061&seq=8',
      landingUrl: 'https://www.census.go.kr/sub/ehpp/fe/ehppfe100m02?bbsId=Hg7SIYjltpxRtEvIfhlf&pstId=PST_0000000000010672',
      published: '2016-09-07', asOf: '2015-11-01', verifiedOn,
      locator: '인쇄 34쪽 표21 순위 및 인쇄104~107쪽/PDF110~113쪽 부록의 명 단위 수치',
      scope: '내국인 49,705,663명에 대한 성씨(한자 구분) 집계 중 인구 순 상위 20개 항목.',
      limitations: '전체 성씨 목록이 아니다. 예를 들어 정(鄭)은 정(丁), 조(趙)는 조(曺), 강(姜)은 강(康)을 합친 값이 아니다. 추출한다면 수록된 20개 항목 안에서만 정규화하며 전국 전체 성씨 확률로 표시하지 않는다.'
    }
  ];

  const regions = [
    ['seoul', '서울특별시', 9331828, true],
    ['busan', '부산광역시', 3266598, false],
    ['daegu', '대구광역시', 2363629, false],
    ['incheon', '인천광역시', 3021010, true],
    ['gwangju', '광주광역시', 1408422, false],
    ['daejeon', '대전광역시', 1439157, false],
    ['ulsan', '울산광역시', 1098049, false],
    ['sejong', '세종특별자치시', 390685, false],
    ['gyeonggi', '경기도', 13694685, true],
    ['gangwon', '강원특별자치도', 1517766, false],
    ['chungbuk', '충청북도', 1591177, false],
    ['chungnam', '충청남도', 2136574, false],
    ['jeonbuk', '전북특별자치도', 1738690, false],
    ['jeonnam', '전라남도', 1788819, false],
    ['gyeongbuk', '경상북도', 2531384, false],
    ['gyeongnam', '경상남도', 3228380, false],
    ['jeju', '제주특별자치도', 670368, false]
  ].map(([id, label, population, capital]) => ({id, label, population, capital}));
  const population = {
    asOf: '2024-12-31', total: 51217221, capitalTotal: 26047523,
    capitalShare: 26047523 / 51217221, sourceId: 'mois-population-2024',
    scope: '모든 연령의 주민등록인구 · 외국인 제외',
    sampling: '17개 시도의 population / total. 수도권은 서울·인천·경기의 합이며 별도 중복 추출 항목이 아니다.'
  };

  // Each list is directly traceable to a public aggregate above. Keep names
  // intact: do not synthesize syllables or attach a real individual's profile.
  const nameLists = [
    {
      sourceId: 'names-birth-2008',
      names: ('민준 지훈 현우 준서 우진 건우 예준 현준 동현 도현 준혁 민재 승현 민성 승민 서준 준영 지호 성현 시우 ' +
        '민규 지환 정우 준우 성민 서진 지원 진우 지민 은찬 지후 한결 재민 승우 현서 민혁 재원 민석 민서 재현 정민 도윤 준호 민우 정현 유찬 태현 현수 민찬 승준 ' +
        '서연 민서 지민 서현 서윤 예은 하은 수빈 지우 유진 은서 민지 윤서 예진 지윤 지원 서영 예원 수민 가은 ' +
        '수연 채원 다은 채은 수아 예린 현서 유빈 민주 지현 소연 서진 지은 소윤 수현 시은 은채 나영 윤지 다연 예빈 윤아 나연 현지 혜원 지수 예지 민경 나경 은지').split(' ')
    },
    {
      sourceId: 'names-historical-2007',
      names: ('영수 영호 영식 정웅 영길 정훈 성호 성훈 성진 정호 민준 민재 지훈 현우 준서 ' +
        '영자 정자 순자 춘자 경자 미영 은정 은주 은영 현주 서연 민서 수빈 서현 민지').split(' ')
    },
    {
      sourceId: 'names-historical-2016',
      names: ('영수 영호 영식 영철 성호 영자 영숙 정자 순자 미숙 미경 정훈 지훈 동현 은주 은정 지혜 지영 민지 ' +
        '민준 현우 서준 예준 주원 유진 서연 수빈 서윤 서현 성민 정숙 정희 ' +
        '준 진 현 숙 훈 솔 건 철 미 한결 사랑 요한 아름 한솔 슬기 하늘 봄 지원 도현 수연').split(' ')
    }
  ];
  const nameMap = new Map();
  for (const list of nameLists) for (const name of list.names) {
    if (!nameMap.has(name)) nameMap.set(name, {name, sourceIds: []});
    const entry = nameMap.get(name);
    if (!entry.sourceIds.includes(list.sourceId)) entry.sourceIds.push(list.sourceId);
  }
  const names = [...nameMap.values()];
  const nameCoverage = {
    count: names.length, sampling: '수록 이름의 중복을 제거한 뒤 목록 안에서 균등 추출',
    representsPopulationFrequency: false,
    includesHistoricalAdultCohorts: true,
    limitations: '출생신고 연도별 일부 순위와 역사적 보도의 이름 합집합이다. 모든 실존 이름·현재 성인·지역별·성별 이름 분포를 대표하지 않으며 인구 빈도 가중치가 없다.'
  };

  const surnames = [
    ['김', '金', 10689959], ['이', '李', 7306828], ['박', '朴', 4192074], ['최', '崔', 2333927],
    ['정', '鄭', 2151879], ['강', '姜', 1176847], ['조', '趙', 1055567], ['윤', '尹', 1020547],
    ['장', '張', 992721], ['임', '林', 823921], ['한', '韓', 773404], ['오', '吳', 763281],
    ['서', '徐', 751704], ['신', '申', 741081], ['권', '權', 705941], ['황', '黃', 697171],
    ['안', '安', 685639], ['송', '宋', 683494], ['전', '全', 559110], ['홍', '洪', 558853]
  ].map(([name, hanja, population]) => ({name, hanja, population, weight: population, sourceId: 'kostat-surnames-2015'}));
  const surnameCoverage = {
    asOf: '2015-11-01', populationTotal: 49705663,
    selectedPopulation: surnames.reduce((sum, surname) => sum + surname.population, 0),
    sampling: '한자별 상위 20개 성씨 항목의 인구를 이 목록의 합계로 나눠 추출',
    limitations: '같은 한글 표기의 다른 한자 성씨와 나머지 성씨는 포함하지 않는다. 성씨와 이름의 조합은 가상이며 실존 개인을 뜻하지 않는다.'
  };
  surnameCoverage.shareOfPopulation = surnameCoverage.selectedPopulation / surnameCoverage.populationTotal;

  const regionMap = Object.assign(Object.create(null), Object.fromEntries(regions.map(region => [region.id, region])));
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const item of Object.values(value)) freeze(item);
      Object.freeze(value);
    }
    return value;
  }
  return freeze({VERSION: 1, regions, regionMap, population, names, nameLists, nameCoverage, surnames, surnameCoverage, sources});
});
