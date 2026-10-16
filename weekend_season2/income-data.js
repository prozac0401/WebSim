(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2IncomeData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Local aggregate snapshot, read from the official rendered KOSIS table.
  // Counts are observed; the amount assigned within a bracket is a game model.
  const SOURCE = {
    id: 'nts-wage-address-2024', primary: true, publisher: '국세청 / KOSIS',
    title: '4.2.11 주소지별·과세대상 근로소득 규모별 연말정산 신고 현황[2007~]',
    url: 'https://kosis.kr/statHtml/statHtml.do?orgId=133&tblId=DT_133N_427',
    tableId: 'DT_133N_427', itemId: '16133T2008_0135', year: 2024,
    updated: '2026-02-20', verifiedOn: '2026-10-17',
    geography: '지급명세서의 주소지별 17개 시도. 사업장 소재지가 아님.',
    population: '2024년 귀속 근로소득 연말정산 지급명세서 신고실적(과세미달자 포함)',
    measure: '연간 과세대상 근로소득(총급여), 세전 원',
    countUnit: '명', nationalTotal: 21078535, includedTotal: 21073526, excludedOther: 5009,
    scope: '주소지별 연말정산 신고자의 연간 총급여 구간별 인원. 전체 인구나 가구소득의 분포가 아니다.',
    notes: [
      '신규입사·중도퇴사·이중근로가 포함되어 실제 재직한 달의 월급 수준을 나타내지 않는다. 월환산은 연간 금액을 12로 나눈 게임 참고값이다.',
      '여러 근무지의 소득을 주(현)사업장에서 합산 신고하지 않은 경우 인원이 중복 집계될 수 있다.',
      '내국인의 총급여는 비과세소득을 제외한다. 외국인 단일세율 적용자는 비과세소득을 합산하는 공식 표의 예외가 있다.',
      '주소지가 불분명한 외국인 등 기타 5,009명은 17개 시도 추출에서 제외하며 검산용 원자료에는 보존한다.',
      '성별·나이·혼인·직업별 조건부 분포가 아니다. 가구별 실제 소득, 실수령액, 2026년 소득 또는 구직자·학생·돌봄 역할의 용돈을 관측한 자료가 아니다.'
    ]
  };
  const MODEL = {
    id: 'annual-bracket-monthly-uniform-v1',
    distribution: '각 주소지의 공개 구간별 인원수 / 해당 주소지 신고인원수',
    withinBand: '닫힌 연간 구간을 12개월로 환산한 정수 원 범위에서 균등 추출한다. 구간 안의 분포는 관측되지 않아 게임 가정이다.',
    openBand: '연 10억원 초과 구간의 관측 상한은 없다. 게임에서는 월 1억원을 대표값으로 고정하며 실제 평균이나 최댓값으로 해석하지 않는다.',
    topMonthlyAmount: 100000000,
    nonWorker: '직장인 외 역할의 외부 생활비는 별도의 게임 모형이며 이 표에 관측된 소득으로 표시할 수 없다.'
  };

  // Only brackets containing 2024 data are retained. Earlier-year categories
  // offered by the table (e.g. 800만원 이하) have no 2024 observations.
  // The original labels mean mutually exclusive bands, not cumulative counts.
  const bandSpec = [
    ['15133GSD02', '1천만 이하', 10000000], ['15133GSD03_1', '1.5천만 이하', 15000000],
    ['15133GSD05', '2천만 이하', 20000000], ['15133GSD06', '3천만 이하', 30000000],
    ['15133GSD07', '4천만 이하', 40000000], ['15133GSD07_1', '4.5천만 이하', 45000000],
    ['15133GSD08', '5천만 이하', 50000000], ['15133GSD09', '6천만 이하', 60000000],
    ['15133GSD0B', '8천만 이하', 80000000], ['15133GSD0D', '1억 이하', 100000000],
    ['15133GSD0E', '2억 이하', 200000000], ['15133GSD0F', '3억 이하', 300000000],
    ['15133GSD0G', '5억 이하', 500000000], ['15133GSD0H', '10억 이하', 1000000000],
    ['15133GSD0I', '10억 초과', null]
  ];
  const BANDS = bandSpec.map(([id, label, max], index) => {
    const min = index === 0 ? 0 : bandSpec[index - 1][2];
    return { id, label, min, max, unit: 'annual-won', minInclusive: index === 0, maxInclusive: max !== null,
      monthlyMin: index === 0 ? 0 : Math.floor(min / 12) + 1,
      monthlyMax: max === null ? null : Math.floor(max / 12) };
  });

  // Source rows, with the exact 15 count cells in BANDS order. National and
  // unknown-address rows are verification controls, never selectable regions.
  const RAW_COUNTS = {
    national: [2866710,1251958,1238358,3801019,3330978,1236897,1022235,1566584,2007263,1210808,1347016,124652,51381,17435,5241],
    seoul: [552919,246258,233397,675949,603558,220031,182612,287049,395279,254382,363679,50752,23964,9632,3419],
    incheon: [182545,77198,77451,243297,223423,83655,69101,101460,117642,64158,58036,4347,1610,418,97],
    gyeonggi: [775753,346798,339064,1056086,976308,363531,299982,463582,588789,351516,417559,38305,12898,3990,961],
    gangwon: [80461,33936,34107,112352,93895,33029,26820,41312,53556,30107,18096,1081,508,92,19],
    daejeon: [86103,36363,36327,109894,91510,32701,27055,42228,57243,35075,35732,2352,885,205,51],
    chungbuk: [83860,36257,37541,121500,113353,44814,37742,55433,64655,36869,31832,1361,578,150,32],
    chungnam: [113416,47432,48008,150376,133211,52329,44918,69108,87805,50757,56111,2991,717,175,45],
    sejong: [19398,8536,7560,23878,22588,9451,8877,16050,26260,17185,16449,664,222,47,13],
    gwangju: [80492,33938,33580,117242,89507,32200,25595,38665,49425,29442,29809,2226,910,189,52],
    jeonbuk: [95648,39474,40054,130894,96961,35429,29322,43631,54074,33395,25518,1380,597,122,17],
    jeonnam: [83629,36939,37977,124817,94797,34782,28360,43692,57475,33734,32915,1432,555,127,20],
    daegu: [127098,57228,59101,177594,139757,49707,41484,63717,81385,46785,36735,3712,1702,464,111],
    gyeongbuk: [121962,54632,56407,170066,137894,51899,43733,65038,83411,52659,44378,1934,810,218,36],
    busan: [195763,82365,82997,236180,196689,70359,57461,87589,110293,62879,54423,5673,2943,859,231],
    ulsan: [57909,23793,23585,68145,65846,26378,21688,34277,47290,32856,55369,2827,732,236,45],
    gyeongnam: [171247,73257,74070,228674,209509,82488,66346,96932,113927,68790,61968,2916,1412,431,67],
    jeju: [34488,17339,16962,53771,41992,14088,11118,16805,18731,10214,8389,692,337,77,24],
    other: [4019,215,170,304,180,26,21,16,23,5,18,7,1,3,1]
  };
  const regionSpec = [
    ['seoul','서울','15133JSJ01',4102880], ['busan','부산','15133JSJ0D',1246704],
    ['daegu','대구','15133JSJ0B',886580], ['incheon','인천','15133JSJ02',1304438],
    ['gwangju','광주','15133JSJ08',563272], ['daejeon','대전','15133JSJ05',593724],
    ['ulsan','울산','15133JSJ0E',460976], ['sejong','세종','15133JSJ0701',177178],
    ['gyeonggi','경기','15133JSJ03',6035122], ['gangwon','강원','15133JSJ04',559371],
    ['chungbuk','충북','15133JSJ06',665977], ['chungnam','충남','15133JSJ07',857399],
    ['jeonbuk','전북','15133JSJ09',626516], ['jeonnam','전남','15133JSJ0A',611251],
    ['gyeongbuk','경북','15133JSJ0C',885077], ['gyeongnam','경남','15133JSJ0F',1252034],
    ['jeju','제주','15133JSJ0G',245027]
  ];
  const ROWS = regionSpec.map(([id, name, sourceRegionId, total]) => ({ id, name, sourceRegionId, total,
    counts: RAW_COUNTS[id], bands: BANDS.map((band, i) => ({ ...band, count: RAW_COUNTS[id][i], weight: RAW_COUNTS[id][i] / total })) }));
  const BY_REGION = Object.fromEntries(ROWS.map(row => [row.id, row]));

  function unitRandom(randomFn) {
    const value = randomFn();
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('난수는 0 이상 1 미만이어야 합니다.');
    return value;
  }
  function sample(provinceId, randomFn) {
    if (!Object.prototype.hasOwnProperty.call(BY_REGION, provinceId)) throw new RangeError('자료가 없는 시도입니다.');
    if (typeof randomFn !== 'function') throw new TypeError('시드가 있는 난수 함수를 전달하세요.');
    const row = BY_REGION[provinceId];
    const point = unitRandom(randomFn) * row.total;
    // Consume two draws even for the open bracket, keeping replay consistent.
    const within = unitRandom(randomFn);
    let end = 0;
    const index = row.counts.findIndex(count => (end += count) > point);
    const band = BANDS[index];
    const amount = band.max === null ? MODEL.topMonthlyAmount : band.monthlyMin + Math.floor(within * (band.monthlyMax - band.monthlyMin + 1));
    return { amount, provinceId, bandId: band.id, sourceId: SOURCE.id, year: SOURCE.year,
      kind: 'wage', basis: 'annual-gross-divided-by-12', modelId: MODEL.id,
      openBandRepresentative: band.max === null };
  }
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  }
  return freeze({ SOURCE, MODEL, BANDS, ROWS, BY_REGION, RAW_COUNTS, sample });
});
