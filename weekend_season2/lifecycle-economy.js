(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./subregion-income-data.js'):root.S2SubregionIncomeData,node?require('./child-living-costs.js'):root.S2ChildLivingCosts);if(node)module.exports=api;else root.S2LifecycleEconomy=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Subregions,ChildLiving){
'use strict';
// Published marginal tables are preserved below. The combination is a game model, not an observed joint distribution.
const RAW_INCOME_ROWS=[
  {
    "group": "all",
    "label": "전국",
    "percentages": [
      0.3,
      10.1,
      9.7,
      11.5,
      11.4,
      7.9,
      9.7,
      13.8,
      4.7,
      9.1,
      10.3
    ],
    "unknownPercentage": 1.6,
    "meanManwon": 386.8
  },
  {
    "group": "행정구역",
    "label": "서울",
    "percentages": [
      0.4,
      8.5,
      8.3,
      10.4,
      12.8,
      8.1,
      10.2,
      13.8,
      3.3,
      9.4,
      13.6
    ],
    "unknownPercentage": 1.2,
    "meanManwon": 412.2
  },
  {
    "group": "행정구역",
    "label": "부산",
    "percentages": [
      0.4,
      12.5,
      13.3,
      12.8,
      9.7,
      7.7,
      9.6,
      13.1,
      5.3,
      7.6,
      7.2
    ],
    "unknownPercentage": 0.8,
    "meanManwon": 351.9
  },
  {
    "group": "행정구역",
    "label": "대구",
    "percentages": [
      0,
      13.5,
      13.3,
      14.4,
      12.1,
      8.1,
      10.3,
      14,
      3.4,
      5.7,
      5
    ],
    "unknownPercentage": 0.2,
    "meanManwon": 326.4
  },
  {
    "group": "행정구역",
    "label": "인천",
    "percentages": [
      0.1,
      6.9,
      6.8,
      11.2,
      13.3,
      9.8,
      9.6,
      13.6,
      4.9,
      9.9,
      10
    ],
    "unknownPercentage": 3.8,
    "meanManwon": 403.1
  },
  {
    "group": "행정구역",
    "label": "광주",
    "percentages": [
      0.2,
      10.6,
      10,
      12.1,
      12.1,
      8.2,
      10.4,
      17,
      4.1,
      6.6,
      8.2
    ],
    "unknownPercentage": 0.6,
    "meanManwon": 367.7
  },
  {
    "group": "행정구역",
    "label": "대전",
    "percentages": [
      0.4,
      9.6,
      8.3,
      11.2,
      12.5,
      6.7,
      9.1,
      13.5,
      5.3,
      10,
      9.9
    ],
    "unknownPercentage": 3.6,
    "meanManwon": 387.8
  },
  {
    "group": "행정구역",
    "label": "울산",
    "percentages": [
      0.2,
      9.1,
      10.1,
      8.6,
      8.5,
      8.6,
      9.6,
      14,
      4.4,
      10.1,
      14
    ],
    "unknownPercentage": 2.8,
    "meanManwon": 424.1
  },
  {
    "group": "행정구역",
    "label": "세종",
    "percentages": [
      0.8,
      9.1,
      4.4,
      9.1,
      8.8,
      5.4,
      9.3,
      13.3,
      5.9,
      10.7,
      23
    ],
    "unknownPercentage": 0.2,
    "meanManwon": 480.2
  },
  {
    "group": "행정구역",
    "label": "경기",
    "percentages": [
      0.3,
      5.7,
      6.9,
      10.2,
      10.7,
      7.6,
      10.4,
      14.9,
      6.3,
      11.6,
      13.2
    ],
    "unknownPercentage": 2.1,
    "meanManwon": 434.4
  },
  {
    "group": "행정구역",
    "label": "강원",
    "percentages": [
      0.9,
      14.1,
      10.3,
      15.6,
      11.1,
      8.5,
      9.2,
      12.1,
      3.8,
      7.5,
      4.8
    ],
    "unknownPercentage": 2.1,
    "meanManwon": 327.7
  },
  {
    "group": "행정구역",
    "label": "충북",
    "percentages": [
      0.4,
      14.5,
      11.1,
      11,
      11.1,
      7.5,
      9.1,
      13.8,
      3.2,
      8.5,
      9.8
    ],
    "unknownPercentage": 0,
    "meanManwon": 362.3
  },
  {
    "group": "행정구역",
    "label": "충남",
    "percentages": [
      0.2,
      11.9,
      10.3,
      11,
      11.2,
      8.4,
      7.7,
      13.8,
      6.1,
      8.8,
      7.6
    ],
    "unknownPercentage": 3,
    "meanManwon": 365.8
  },
  {
    "group": "행정구역",
    "label": "전북",
    "percentages": [
      0.5,
      14.1,
      12.4,
      13.9,
      11.5,
      6.7,
      8.2,
      10.6,
      3.6,
      7.2,
      9.8
    ],
    "unknownPercentage": 1.3,
    "meanManwon": 356.7
  },
  {
    "group": "행정구역",
    "label": "전남",
    "percentages": [
      0.1,
      16.2,
      15.3,
      14.2,
      9.8,
      6.9,
      7.5,
      11.3,
      3.9,
      7.9,
      5.7
    ],
    "unknownPercentage": 0.9,
    "meanManwon": 322
  },
  {
    "group": "행정구역",
    "label": "경북",
    "percentages": [
      0.2,
      15.4,
      14.8,
      13.9,
      12.2,
      7.6,
      8.5,
      12.5,
      3.2,
      6.5,
      5.1
    ],
    "unknownPercentage": 0.1,
    "meanManwon": 316.9
  },
  {
    "group": "행정구역",
    "label": "경남",
    "percentages": [
      0.5,
      15,
      11.1,
      11.8,
      9.7,
      8.1,
      10.1,
      13.6,
      3.9,
      6.9,
      7.6
    ],
    "unknownPercentage": 1.7,
    "meanManwon": 346.6
  },
  {
    "group": "행정구역",
    "label": "제주",
    "percentages": [
      0.3,
      8.4,
      7.9,
      12.7,
      14.2,
      6.7,
      7.8,
      13.6,
      7.3,
      11.1,
      9.9
    ],
    "unknownPercentage": 0,
    "meanManwon": 393.2
  },
  {
    "group": "가구주 연령",
    "label": "20세 미만",
    "percentages": [
      1.7,
      48.3,
      29.3,
      9.3,
      4.3,
      1.8,
      0.5,
      0.8,
      null,
      null,
      null
    ],
    "unknownPercentage": 4,
    "meanManwon": 131.4
  },
  {
    "group": "가구주 연령",
    "label": "20~29세",
    "percentages": [
      0.9,
      16.9,
      14.3,
      24.4,
      22.4,
      7,
      4.8,
      4.3,
      0.9,
      1.4,
      1.1
    ],
    "unknownPercentage": 1.7,
    "meanManwon": 244.3
  },
  {
    "group": "가구주 연령",
    "label": "30~39세",
    "percentages": [
      0.2,
      1.3,
      1.4,
      9,
      16.5,
      13.1,
      13.1,
      16,
      7.1,
      11.2,
      9.6
    ],
    "unknownPercentage": 1.4,
    "meanManwon": 435.6
  },
  {
    "group": "가구주 연령",
    "label": "40~49세",
    "percentages": [
      0.3,
      1.4,
      1.8,
      6.4,
      8.8,
      8,
      13.4,
      20.5,
      7.8,
      15.6,
      14.3
    ],
    "unknownPercentage": 1.7,
    "meanManwon": 488.8
  },
  {
    "group": "가구주 연령",
    "label": "50~59세",
    "percentages": [
      0.4,
      3.3,
      4,
      10.2,
      9.4,
      6.9,
      10.5,
      19,
      4.7,
      12.7,
      17.1
    ],
    "unknownPercentage": 1.6,
    "meanManwon": 476.7
  },
  {
    "group": "가구주 연령",
    "label": "60~69세",
    "percentages": [
      0.3,
      8.8,
      11.9,
      14.4,
      11.8,
      8.2,
      9.3,
      12.5,
      4,
      6.8,
      10.5
    ],
    "unknownPercentage": 1.6,
    "meanManwon": 375.6
  },
  {
    "group": "가구주 연령",
    "label": "70~79세",
    "percentages": [
      0.1,
      25.4,
      27,
      13.6,
      8.5,
      6.1,
      5.3,
      4.7,
      2.2,
      2.8,
      2.8
    ],
    "unknownPercentage": 1.4,
    "meanManwon": 230.2
  },
  {
    "group": "가구주 연령",
    "label": "80세 이상",
    "percentages": [
      0.3,
      47.5,
      28.8,
      8.4,
      4,
      2.4,
      2.8,
      2.1,
      0.9,
      0.7,
      0.8
    ],
    "unknownPercentage": 1.3,
    "meanManwon": 149.1
  },
  {
    "group": "가구원수",
    "label": "1인",
    "percentages": [
      0.8,
      23.9,
      15.6,
      19.9,
      17.3,
      8.7,
      6,
      4.2,
      0.5,
      0.8,
      0.8
    ],
    "unknownPercentage": 1.6,
    "meanManwon": 225.4
  },
  {
    "group": "가구원수",
    "label": "2인",
    "percentages": [
      0.2,
      5.2,
      13,
      12.3,
      12.6,
      9.8,
      11.2,
      15,
      4.6,
      7.8,
      6.6
    ],
    "unknownPercentage": 1.5,
    "meanManwon": 369.9
  },
  {
    "group": "가구원수",
    "label": "3인",
    "percentages": [
      null,
      0.6,
      1.7,
      3.7,
      5.9,
      6.7,
      13.2,
      22.1,
      8.7,
      17.4,
      18.4
    ],
    "unknownPercentage": 1.6,
    "meanManwon": 527
  },
  {
    "group": "가구원수",
    "label": "4인",
    "percentages": [
      null,
      0.1,
      0.4,
      1.2,
      3.2,
      4.2,
      11.4,
      22.4,
      8.7,
      19.6,
      27.1
    ],
    "unknownPercentage": 1.6,
    "meanManwon": 593.5
  },
  {
    "group": "가구원수",
    "label": "5인",
    "percentages": [
      null,
      0.1,
      0.3,
      1.8,
      2.5,
      3.3,
      8.2,
      24,
      9.4,
      19,
      29.3
    ],
    "unknownPercentage": 2,
    "meanManwon": 612.5
  },
  {
    "group": "가구원수",
    "label": "6인 이상",
    "percentages": [
      null,
      null,
      1.3,
      1.5,
      2.2,
      3.9,
      8.1,
      12.1,
      15.5,
      18.9,
      36.1
    ],
    "unknownPercentage": 0.4,
    "meanManwon": 646.6
  }
];
const AGE_WAGES={
  "source": {
    "url": "https://mods.go.kr/boardDownload.es?bid=11113&list_no=443648&seq=1",
    "title": "2024년 임금근로일자리 소득(보수) 결과",
    "published": "2026-02-23",
    "table": "7. 연령별 소득",
    "printedPage": 23,
    "pdfPage": 29,
    "unit": "월 만원 / 비중 %",
    "population": "2024년12월 하루 이상 일한 임금근로일자리 근로자. 개인 복수기업 근무는 일자리별 관측. 세전, 실비변상 비과세소득 제외. 연령12월31일.",
    "caveat": "지역×가구형태×역할 교차분포 아님. 시간제 포함. 상위 열린 구간은 분포·상한 미확인."
  },
  "boundsManwon": [
    0,
    85,
    150,
    250,
    350,
    450,
    550,
    650,
    800,
    1000,
    null
  ],
  "rows": {
    "all": {
      "weights": [
        12.2,
        8.4,
        20.9,
        20.1,
        11.7,
        7.8,
        5.3,
        5.6,
        3.7,
        4.3
      ],
      "meanManwon": 375,
      "medianManwon": 288
    },
    "under20": {
      "weights": [
        61.2,
        17.2,
        14,
        5.7,
        1.2,
        0.4,
        0.2,
        0.1,
        0,
        0
      ],
      "meanManwon": 95,
      "medianManwon": 62
    },
    "20_24": {
      "weights": [
        25.2,
        12,
        29.4,
        23.9,
        6.2,
        1.7,
        0.8,
        0.5,
        0.1,
        0.1
      ],
      "meanManwon": 200,
      "medianManwon": 210
    },
    "25_29": {
      "weights": [
        7.4,
        4.9,
        24.2,
        34.8,
        16.2,
        6.1,
        3,
        2.4,
        0.8,
        0.3
      ],
      "meanManwon": 304,
      "medianManwon": 284
    },
    "30_34": {
      "weights": [
        5.4,
        4,
        16.4,
        29,
        20.9,
        11.1,
        5.1,
        4.2,
        2.5,
        1.3
      ],
      "meanManwon": 368,
      "medianManwon": 333
    },
    "35_39": {
      "weights": [
        5.7,
        4.7,
        14.6,
        20.9,
        17.9,
        13.5,
        7.8,
        6.3,
        4.5,
        4.1
      ],
      "meanManwon": 430,
      "medianManwon": 372
    },
    "40_44": {
      "weights": [
        6.5,
        5.7,
        15.7,
        16.6,
        13.4,
        12.4,
        10,
        8.1,
        5.4,
        6.3
      ],
      "meanManwon": 464,
      "medianManwon": 389
    },
    "45_49": {
      "weights": [
        7.4,
        6.8,
        17.9,
        15.8,
        10.7,
        9.3,
        8.9,
        9.9,
        5.6,
        7.7
      ],
      "meanManwon": 474,
      "medianManwon": 368
    },
    "50_54": {
      "weights": [
        8.6,
        8,
        20.2,
        16.7,
        9.4,
        7.3,
        6.3,
        9.3,
        5.8,
        8.4
      ],
      "meanManwon": 464,
      "medianManwon": 324
    },
    "55_59": {
      "weights": [
        10.6,
        9.9,
        21.9,
        17.6,
        8.8,
        6.4,
        4.5,
        6.9,
        6.1,
        7.2
      ],
      "meanManwon": 424,
      "medianManwon": 287
    },
    "60_64": {
      "weights": [
        13.9,
        14.3,
        28,
        18.3,
        7.8,
        5.1,
        3.2,
        3.3,
        2.9,
        3.3
      ],
      "meanManwon": 319,
      "medianManwon": 230
    },
    "65_69": {
      "weights": [
        19.8,
        17.2,
        31.7,
        16,
        5.5,
        3,
        1.8,
        1.9,
        1.1,
        2
      ],
      "meanManwon": 253,
      "medianManwon": 200
    },
    "70plus": {
      "weights": [
        48.6,
        14.5,
        22.7,
        7.2,
        2.1,
        1.3,
        0.7,
        0.8,
        0.6,
        1.5
      ],
      "meanManwon": 165,
      "medianManwon": 90
    }
  }
};
const SINGLE_PARENT={
  "source": {
    "url": "https://clik.nanet.go.kr/clikr-collection/policyinfo/203/1016/2025/CLIKC2222284649985253_attach_1.pdf",
    "officialRelease": "https://www.mogef.go.kr/nw/enw/nw_enw_s001d.do?bbtSn=712551&mid=mda700",
    "title": "2024년 한부모가족 실태조사",
    "researcher": "한국여성정책연구원 / 여성가족부 위탁",
    "reportDate": "2024-12",
    "releaseDate": "2025-03-31",
    "table": "Ⅱ-3-1",
    "printedPages": [
      138,
      140,
      141
    ],
    "pdfPages": [
      209,
      211,
      212
    ],
    "sample": 3315,
    "population": "만18세이하 자녀를 양육하는 전국 한부모가족 가구주; 표는 사후가중치 적용.",
    "incomeDefinition": "지난1년 월평균, 동거 모든가구원 소득 합계; 세금·사회보험료 제외.",
    "caveat": "지역 교차표 없음. 실제 관측 가구형태는 성별별도이나 게임에서 성별 급여 차등에 쓰지 않음. 평균은 구간내 균등분포를 뜻하지 않음."
  },
  "boundsWon": [
    0,
    1000000,
    2000000,
    3000000,
    null
  ],
  "rows": {
    "all": {
      "weights": [
        0.7,
        18.7,
        36.5,
        44.1
      ],
      "meanWon": 2946000
    },
    "under40": {
      "weights": [
        0.6,
        20.7,
        33.3,
        45.3
      ],
      "meanWon": 3017000
    },
    "40_49": {
      "weights": [
        0.5,
        16.4,
        37.9,
        45.2
      ],
      "meanWon": 2965000
    },
    "50plus": {
      "weights": [
        1.6,
        23.1,
        36.7,
        38.6
      ],
      "meanWon": 2778000
    },
    "notEmployed": {
      "weights": [
        4,
        58.9,
        28.7,
        8.3
      ],
      "meanWon": 1881000
    }
  }
};
const MODEL={id:'kr-lifecycle-household-2026-v1',year:2026,leisureFloor:150000,reserveFloor:100000,topHouseholdMonthly:12000000,
  minimumWageHourly:10320,fullTimeMonthlyReference:2156880,workerMonthlyFloor:1900000,graduateSupportMin:800000,graduateSupportMax:2200000,
  note:'지역·가구원수·연령별 주변분포를 조합한 게임용 추정입니다. 실제 교차분포나 실제 개인의 수입을 예측하지 않습니다. 구간 안은 균등 추첨하며 최상위 가구소득 구간은 월 1,200만원에서 제한합니다. 대학원생 지원·가족의 분담과 역할별 상한은 게임 가정입니다. 비근로자의 가족분담은 배우자 월400만원·복무하지 않는 성인자녀 월150만원씩, 합계650만원 이내로 제한합니다. 미성년 자녀나 룸메이트의 수입은 만들지 않습니다.',
  supportNote:'생활안정지원은 이 게임이 기본 생활과 여가를 위해 보충하는 가상 수입입니다. 실제 생계급여·한부모지원·장학금의 수급 자격이나 지급액이 아닙니다.',
  workerNote:'매주 기본 출근을 하는 직장인의 개인 월수입은 게임에서 최소190만원으로 정합니다. 2026최저임금 수준을 참고한 게임 하한이며 세후 최저임금 계산이나 실제 고용계약의 보장액이 아닙니다. 원래 추첨한 가구소득과 보정액은 따로 남깁니다.',
  householdNote:'본인·배우자·모든 자녀가 생활비를 함께 쓰는 가구로 가정합니다. 복무 중인 자녀도 귀가할 생활 기반에 포함합니다. 함께 사는 다른 사람의 수입은 더하지 않습니다.',
  synthesis:'가구원수 비중 × sqrt(지역 비중/전국 비중) × sqrt(가구주 연령 비중/전국 비중). 비율은 0.25~4로 제한하고 무응답은 제외한 뒤 정규화. 한부모는 전용 연령/비취업 분포를 같은 구간으로 환산하고 지역 비율만 결합.',
  budgetNote:'2026 생계급여 선정기준을 비주거 기본생활비의 참고 하한으로 사용합니다. 실제 최저생활비 측정값이 아닙니다. 월세·이자·관리비, 개인 활동 예산과 비상 여유는 별도로 계산하며 지원금은 부족분만 보충합니다. 미래 시즌도 같은 2026년 기준의 게임 금액을 사용합니다.'};
const SOURCES=[
 {id:'molit-household-income-2024',label:'2024 주거실태조사 · 가구 월경상소득',url:'https://stat.molit.go.kr/portal/cate/statMetaView.do?hRsId=327&hFormId=5405',publisher:'국토교통부',surveyYear:2024,incomeYear:2023,table:'통계보고서 표4-11, 인쇄325~328쪽',unit:'가구/월 원, 원표 비중 %',definition:'2023년 가구 전체의 세금 등을 제외한 월평균 실수령 경상소득. 근로·사업·재산·사회보험·정부보조·사적이전 포함.',note:'2026-01-07 정정본. 지역/연령/가구원수는 별도 주변분포이며 실제 공동분포가 아닙니다.'},
 {id:'single-parent-income-2024',label:'2024 한부모가족 실태조사 · 가구소득',url:SINGLE_PARENT.source.officialRelease,reportUrl:SINGLE_PARENT.source.url,publisher:'여성가족부·한국여성정책연구원',surveyYear:2024,unit:'가구/월 원, 비중 %',definition:SINGLE_PARENT.source.incomeDefinition,note:'만18세 이하 자녀 양육 가구주 3,315명. 가중치 적용. 지역별 소득 교차표는 확보되지 않아 주거실태조사의 지역 차이를 게임 추정으로 연결합니다.'},
 {id:'wage-age-2024',label:'2024 임금근로일자리 소득 · 연령별 참고',url:AGE_WAGES.source.url,publisher:'국가데이터처',year:2024,published:'2026-02-23',unit:'세전 개인 일자리/월 원',definition:AGE_WAGES.source.population,note:'가구 실수령소득과 다른 모집단입니다. 연령별 참고값을 보존하며 이를 대학원생 지원금으로 곱하지 않습니다.'},
 {id:'minimum-wage-2026',label:'2026 최저임금 참고',url:'https://www.moel.go.kr/news/enews/report/enewsView.do?news_seq=18144',publisher:'고용노동부',year:2026,unit:'시급 원',note:'시간급10,320원. 월2,156,880원은 주40시간·유급주휴 포함209시간 환산 세전액입니다. 모든 가구수입·장학금에 적용되는 하한이 아닙니다.'},
 {id:'graduate-stipend-2026',label:'2026 이공계 연구생활장려금 참고',url:'https://www.msit.go.kr/bbs/view.do?sCode=user&mId=307&mPid=208&pageIndex=1&bbsSeqNo=94&nttSeqNo=3186672&searchOpt=ALL&searchTxt=',reportUrl:'https://www.hknu.ac.kr/bbs/sanhak/352/106366/download.do',publisher:'과학기술정보통신부',year:2026,unit:'참여 학생/월 원',note:'참여대학 이공계 연구학생의 기존 지원 합계가 석사80만원·박사110만원에 못 미치는 부족분을 보충하는 제도입니다. 모든 대학원생의 보편수입이 아닙니다. 게임 범위80~220만원은 별도 가정입니다.'},
 {id:'livelihood-standard-2026',label:'2026 생계급여 선정·지급기준 참고',url:'https://www.mohw.go.kr/menu.es?mid=a10708010300',publisher:'보건복지부',year:2026,unit:'가구/월 원',note:'기준중위소득32%의 선정기준입니다. 실제 급여는 소득인정액·재산·기타 자격을 확인해 산정합니다. 이 게임은 수급 심사를 하지 않습니다.'}
];
if(Subregions)SOURCES.push({id:Subregions.SOURCE.id,label:'2023 주소지별 시군구 근로소득 · 지역 격차 참고',url:Subregions.SOURCE.url,publisher:Subregions.SOURCE.publisher,year:Subregions.SOURCE.year,unit:'세전 개인/연 원, 원표 금액 백만원',definition:Subregions.SOURCE.scope,note:Subregions.MODEL.note+' '+Subregions.MODEL.formula});
const SOURCE_IDS=SOURCES.map(x=>x.id),PROVINCES=['seoul','busan','daegu','incheon','gwangju','daejeon','ulsan','sejong','gyeonggi','gangwon','chungbuk','chungnam','jeonbuk','jeonnam','gyeongbuk','gyeongnam','jeju'];
const NATIONAL=RAW_INCOME_ROWS.find(r=>r.group==='all'),REGIONS=Object.fromEntries(RAW_INCOME_ROWS.filter(r=>r.group==='행정구역').map((r,i)=>[PROVINCES[i],r]));
const AGES=RAW_INCOME_ROWS.filter(r=>r.group==='가구주 연령'),SIZES=RAW_INCOME_ROWS.filter(r=>r.group==='가구원수');
const UPPERS=[0,1000000,1890000,2500000,3000000,3500000,4100000,5000000,5600000,6980000,MODEL.topHouseholdMonthly];
const BANDS=UPPERS.map((max,i)=>({id:'household-'+i,min:i===0?0:UPPERS[i-1]+1,max,sourceOpenEnded:i===10,label:i===0?'수입 없음':i===10?'698만원 초과':(i===1?'0':UPPERS[i-1]/10000)+'~'+max/10000+'만원'}));
const LIVING=[0,820556,1343773,1714892,2078316,2418150,2737905,3044848,3351791];
const ROLES=['worker','seeker','graduate','caregiver'],TYPES=['single','couple','couple-children','single-parent','adult-family'];
const integer=(v,min=0,max=100000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
function draw(random){const r=random();if(!Number.isFinite(r)||r<0||r>=1)throw new RangeError('수입 추첨값을 확인하세요.');return r;}
function normalize(values){const sum=values.reduce((n,v)=>n+(v||0),0);if(!(sum>0))throw new RangeError('수입 분포를 확인하세요.');return values.map(v=>(v||0)/sum);}
function household(config){
 const fallback={toddler:1,preschool:4,school:9,teen:16,adult:24}[config.childAge]??4;
 const children=Array.isArray(config.childProfiles)?config.childProfiles:Array.from({length:config.children||0},()=>({age:fallback,militaryStatus:'none'}));
 const partnerAdults=config.maritalStatus==='married'?1:0,dependentChildren=children.filter(c=>c.age<18).length,adultChildren=children.length-dependentChildren,awayChildren=children.filter(c=>c.militaryStatus==='serving').length;
 return {size:1+partnerAdults+children.length,type:partnerAdults?(children.length?'couple-children':'couple'):dependentChildren?'single-parent':adultChildren?'adult-family':'single',dependentChildren,adultChildren,awayChildren,partnerAdults};
}
function ageRow(age){return AGES[age<20?0:Math.min(7,Math.floor(age/10)-1)];}
function minimumLiving(size){return size<=8?LIVING[size]:LIVING[8]+(size-8)*306943;}
function contributionCap(h){return Math.min(6500000,h.partnerAdults*4000000+Math.max(0,h.adultChildren-h.awayChildren)*1500000);}
function parentWeights(config){
 const key=config.role!=='worker'?'notEmployed':config.age<40?'under40':config.age<50?'40_49':'50plus',w=SINGLE_PARENT.rows[key].weights;
 const tail=normalize(NATIONAL.percentages.slice(5));
 // Split 100~200 and 200~300 by interval length; distribute the open 300+
 // group using the national household tail. Both are explicit game assumptions.
 return {key,weights:[0,w[0],w[1]*.89,w[1]*.11+w[2]*.5,w[2]*.5,...tail.map(v=>v*w[3])]};
}
function distribution(config){
 const h=household(config),region=REGIONS[config.province]||NATIONAL,age=ageRow(config.age),size=SIZES[Math.min(6,h.size)-1],nat=normalize(NATIONAL.percentages),reg=normalize(region.percentages),ageP=normalize(age.percentages);
 const single=h.type==='single-parent',parent=single?parentWeights(config):null,base=normalize(parent?parent.weights:size.percentages);
 const weights=normalize(base.map((v,i)=>v*Math.sqrt(clamp(reg[i]/nat[i],.25,4))*(single?1:Math.sqrt(clamp(ageP[i]/nat[i],.25,4)))));
 return {weights,household:h,regionLabel:region.label,ageBand:age.label,householdBand:size.label,parentBand:parent?.key||null};
}
function subregionReference(config){
 if(config.subregionId===undefined||config.subregionId==='')return null;
 const row=Subregions?.byId(config.subregionId);
 if(!row||row.provinceId!==config.province)throw new RangeError('시도와 시군구의 소득 기준을 확인하세요.');
 return row;
}
function municipalAdjustment(row,sampleHouseholdMonthly){
 if(!row)return null;
 const factor=Subregions.relativeFactor(row.id,row.provinceId);
 return {modelId:Subregions.MODEL.id,sourceId:Subregions.SOURCE.id,year:Subregions.SOURCE.year,subregionId:row.id,provinceId:row.provinceId,factor,baseHouseholdMonthly:sampleHouseholdMonthly,adjustedHouseholdMonthly:Math.round(sampleHouseholdMonthly*factor)};
}
function sameSubregion(config,origin){return (config.subregionId??'')===(origin.subregionIncome?.subregionId??'');}
function sampleIncome(config,random){
 if(!ROLES.includes(config.role)||!integer(config.age,18,100))throw new RangeError('역할과 나이를 확인하세요.');
 const subregion=subregionReference(config);
 const dist=distribution(config),h=dist.household,r=draw(random);let cumulative=0,index=10;
 for(let i=0;i<dist.weights.length;i++){cumulative+=dist.weights[i];if(r<cumulative){index=i;break;}}
 const band=BANDS[index],sampleHouseholdMonthly=band.min+Math.floor(draw(random)*(band.max-band.min+1)),variation=draw(random);
 // Preserve the household survey draw and use the separately recorded wage-gap
 // adjustment only as the input to the unchanged role allocation rules.
 const subregionIncome=municipalAdjustment(subregion,sampleHouseholdMonthly),roleInputMonthly=subregionIncome?.adjustedHouseholdMonthly??sampleHouseholdMonthly;
 let personalEarnedMonthly=0,studySupportMonthly=0,personalSupportMonthly=0,householdContributionMonthly=0,baseMonthly=roleInputMonthly;
 const adjustments=[];
 if(config.role==='worker'){
  // The source includes zero income and partial employment. Daily default
  // attendance is a different game role; retain the draw and record its floor.
  const originalPersonal=Math.round(baseMonthly*(h.partnerAdults?.55+.25*variation:h.adultChildren>h.awayChildren?.65+.2*variation:1));
  householdContributionMonthly=baseMonthly-originalPersonal;
  personalEarnedMonthly=Math.max(MODEL.workerMonthlyFloor,originalPersonal);
  baseMonthly=personalEarnedMonthly+householdContributionMonthly;
  if(baseMonthly!==roleInputMonthly)adjustments.push('worker-attendance-income-floor');
 }else if(config.role==='graduate'){
  studySupportMonthly=Math.round((MODEL.graduateSupportMin+(MODEL.graduateSupportMax-MODEL.graduateSupportMin)*variation)/1000)*1000;
  householdContributionMonthly=clamp(baseMonthly-studySupportMonthly,0,contributionCap(h));
  baseMonthly=studySupportMonthly+householdContributionMonthly;
  if(baseMonthly!==roleInputMonthly)adjustments.push('graduate-support-and-household-cap');
 }else{
  const cap=h.size===1?(config.role==='seeker'?1800000:2200000):MODEL.topHouseholdMonthly;
  baseMonthly=Math.min(baseMonthly,cap);
  personalSupportMonthly=h.size===1?baseMonthly:Math.min(baseMonthly,config.role==='seeker'?1200000:1600000);
  householdContributionMonthly=Math.min(baseMonthly-personalSupportMonthly,contributionCap(h));
  baseMonthly=personalSupportMonthly+householdContributionMonthly;
  if(baseMonthly!==roleInputMonthly)adjustments.push('nonworker-support-and-contribution-cap');
 }
 const sourceIds=['molit-household-income-2024'];if(dist.parentBand)sourceIds.push('single-parent-income-2024');if(config.role==='graduate')sourceIds.push('graduate-stipend-2026');
 if(subregionIncome)sourceIds.push(Subregions.SOURCE.id);
 const origin={kind:'lifecycle',modelId:MODEL.id,sourceIds,provinceId:config.province||'unspecified',age:config.age,role:config.role,household:h,ageBand:dist.ageBand,householdBand:dist.householdBand,parentBand:dist.parentBand,bandId:band.id,weights:dist.weights,sampleHouseholdMonthly,personalEarnedMonthly,studySupportMonthly,personalSupportMonthly,householdContributionMonthly,baseMonthly,adjustments};
 if(subregionIncome)origin.subregionIncome=subregionIncome;
 return {salary:personalEarnedMonthly,externalAllowance:studySupportMonthly+personalSupportMonthly+householdContributionMonthly,origin};
}
function housingTotal(config){return (config.housingTenure==='rent'?config.monthlyRent||0:0)+Math.round((config.housingLoanPrincipal||0)*(config.housingLoanRateBps||0)/120000)+(config.housingMaintenance||0);}
function completeBudget(config,incomeSample,random){
 const originErrors=validateOrigin(incomeSample.origin);if(originErrors.length)throw new RangeError(originErrors.join(' '));
 if(incomeSample.salary!==incomeSample.origin.personalEarnedMonthly||incomeSample.salary+incomeSample.externalAllowance!==incomeSample.origin.baseMonthly||!same(household(config),incomeSample.origin.household)||config.role!==incomeSample.origin.role||config.age!==incomeSample.origin.age||config.province!==incomeSample.origin.provinceId||!sameSubregion(config,incomeSample.origin))throw new RangeError('가구와 수입의 생성 근거를 확인하세요.');
 const h=household(config),baseMonthly=incomeSample.salary+incomeSample.externalAllowance,min=minimumLiving(h.size),housing=housingTotal(config);
 const livingCosts=ChildLiving.calculate(config,baseMonthly,min),fixedCosts=livingCosts.total,personalBudget=Math.max(MODEL.leisureFloor,Math.min(800000,Math.round(baseMonthly*.1))),monthlyReserve=Math.max(MODEL.reserveFloor,Math.min(500000,Math.round(baseMonthly*.05)));
 const needed=fixedCosts+housing+personalBudget+monthlyReserve,gameSupport=Math.max(0,needed-baseMonthly),totalMonthly=baseMonthly+gameSupport;
 const startCash=Math.round(totalMonthly*(.8+.6*draw(random))),cardLimit=clamp(Math.round(personalBudget*2),300000,3000000),externalAllowance=incomeSample.externalAllowance+gameSupport;
 const economicProfile={modelId:MODEL.id,active:true,household:h,minimumLiving:min,leisureFloor:MODEL.leisureFloor,monthlyReserve,baseMonthly,baseSalary:incomeSample.salary,baseExternalAllowance:incomeSample.externalAllowance,gameSupport,totalMonthly,fixedCosts,personalBudget,housingTotal:housing,startCash,cardLimit,floorSourceId:'livelihood-standard-2026',housingSnapshot:{tenure:config.housingTenure||'unspecified',rent:config.monthlyRent||0,principal:config.housingLoanPrincipal||0,rateBps:config.housingLoanRateBps||0,maintenance:config.housingMaintenance||0}};
 economicProfile.livingCosts=livingCosts;
 return {fixedCosts,personalBudget,startCash,cardLimit,externalAllowance,economicProfile};
}
function validHousehold(h){return h&&integer(h.size,1,8)&&TYPES.includes(h.type)&&['dependentChildren','adultChildren','awayChildren'].every(k=>integer(h[k],0,6))&&integer(h.partnerAdults,0,1)&&h.size===1+h.partnerAdults+h.dependentChildren+h.adultChildren&&h.awayChildren<=h.adultChildren;}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function validateOrigin(origin){
 const errors=[];if(!origin||typeof origin!=='object'||Array.isArray(origin))return ['수입의 생성 근거를 확인하세요.'];
 if(!['lifecycle','custom'].includes(origin.kind)||origin.modelId!==MODEL.id||!ROLES.includes(origin.role)||!integer(origin.age,18,100)||!validHousehold(origin.household)||!['unspecified',...PROVINCES].includes(origin.provinceId))return ['수입의 생애 정보가 올바르지 않습니다.'];
 const band=BANDS.find(b=>b.id===origin.bandId);if(!band||!integer(origin.sampleHouseholdMonthly,band?.min||0,band?.max||0))errors.push('수입의 추첨 구간을 확인하세요.');
 let roleInputMonthly=origin.sampleHouseholdMonthly;
 if(origin.subregionIncome!==undefined){
  const meta=origin.subregionIncome,row=Subregions?.byId(meta?.subregionId),expected=row?municipalAdjustment(row,origin.sampleHouseholdMonthly):null;
  if(!meta||typeof meta!=='object'||Array.isArray(meta)||!expected||row.provinceId!==origin.provinceId||Object.keys(meta).length!==Object.keys(expected).length||Object.keys(expected).some(k=>meta[k]!==expected[k]))errors.push('시군구 소득의 출처와 보정액을 확인하세요.');
  else roleInputMonthly=expected.adjustedHouseholdMonthly;
 }
 const maxMonthly=Math.max(MODEL.topHouseholdMonthly,roleInputMonthly);
 if(!['personalEarnedMonthly','studySupportMonthly','personalSupportMonthly','householdContributionMonthly','baseMonthly'].every(k=>integer(origin[k],0,maxMonthly))||origin.baseMonthly!==origin.personalEarnedMonthly+origin.studySupportMonthly+origin.personalSupportMonthly+origin.householdContributionMonthly)errors.push('수입 구성의 합계가 맞지 않습니다.');
 const expectedSources=['molit-household-income-2024'];if(origin.household.type==='single-parent')expectedSources.push('single-parent-income-2024');if(origin.role==='graduate')expectedSources.push('graduate-stipend-2026');
 if(origin.subregionIncome!==undefined&&Subregions)expectedSources.push(Subregions.SOURCE.id);
 if(!same(origin.sourceIds,expectedSources))errors.push('수입 출처를 확인하세요.');
 if(!Array.isArray(origin.weights)||origin.weights.length!==11||origin.weights.some(v=>!Number.isFinite(v)||v<0||v>1)||Math.abs(origin.weights.reduce((n,v)=>n+v,0)-1)>1e-9)errors.push('수입 분포를 확인하세요.');
 const sampleConfig={age:origin.age,role:origin.role,province:origin.provinceId,maritalStatus:origin.household.partnerAdults?'married':'single',childProfiles:[...Array.from({length:origin.household.dependentChildren},()=>({age:9})),...Array.from({length:origin.household.adultChildren},(_,i)=>({age:24,militaryStatus:i<origin.household.awayChildren?'serving':'none'}))]};
 const expected=distribution(sampleConfig);
 if(!same(expected.household,origin.household)||expected.ageBand!==origin.ageBand||expected.householdBand!==origin.householdBand||expected.parentBand!==origin.parentBand||!Array.isArray(origin.weights)||expected.weights.some((v,i)=>Math.abs(v-origin.weights[i])>1e-12))errors.push('생애 정보와 합성 분포가 맞지 않습니다.');
 if(!Array.isArray(origin.adjustments)||origin.adjustments.length>1||origin.adjustments.some(a=>!['worker-attendance-income-floor','graduate-support-and-household-cap','nonworker-support-and-contribution-cap'].includes(a)))errors.push('역할별 수입 조정을 확인하세요.');
 if(origin.role==='graduate'&&(origin.personalEarnedMonthly!==0||origin.studySupportMonthly<MODEL.graduateSupportMin||origin.studySupportMonthly>MODEL.graduateSupportMax))errors.push('대학원생 지원 범위를 확인하세요.');
 if(origin.role!=='graduate'&&origin.studySupportMonthly!==0||origin.role!=='worker'&&origin.personalEarnedMonthly!==0)errors.push('역할과 수입 구성이 맞지 않습니다.');
 if(['worker','graduate'].includes(origin.role)&&origin.personalSupportMonthly!==0)errors.push('개인 생활지원의 구성을 확인하세요.');
 if(origin.role==='graduate'){
  const cap=contributionCap(origin.household);
  if(origin.householdContributionMonthly!==clamp(roleInputMonthly-origin.studySupportMonthly,0,cap))errors.push('대학원생의 가구 분담액을 확인하세요.');
 }
 if(['seeker','caregiver'].includes(origin.role)){
  const cap=origin.household.size===1?(origin.role==='seeker'?1800000:2200000):MODEL.topHouseholdMonthly;
  const original=Math.min(roleInputMonthly,cap),personal=origin.household.size===1?original:Math.min(original,origin.role==='seeker'?1200000:1600000);
  if(origin.personalSupportMonthly!==personal||origin.householdContributionMonthly!==Math.min(original-personal,contributionCap(origin.household)))errors.push('개인 지원과 가족 분담의 합계를 확인하세요.');
 }
 if(origin.role==='worker'){
  const h=origin.household,shareMin=h.partnerAdults?.55:h.adultChildren>h.awayChildren?.65:1,shareMax=h.partnerAdults?.8:h.adultChildren>h.awayChildren?.85:1,originalPersonal=roleInputMonthly-origin.householdContributionMonthly;
  if(originalPersonal<Math.round(roleInputMonthly*shareMin)||originalPersonal>Math.round(roleInputMonthly*shareMax)||origin.personalEarnedMonthly!==Math.max(MODEL.workerMonthlyFloor,originalPersonal))errors.push('근로 가구의 개인수입과 분담을 확인하세요.');
 }
 const adjustment=origin.baseMonthly===roleInputMonthly?[]:[origin.role==='worker'?'worker-attendance-income-floor':origin.role==='graduate'?'graduate-support-and-household-cap':'nonworker-support-and-contribution-cap'];
 if(!same(origin.adjustments,adjustment))errors.push('원래 추첨액과 역할 조정 기록이 맞지 않습니다.');
 return errors;
}
function employmentIncome(config,newSalary){
 if(!integer(newSalary))throw new RangeError('새 월급을 확인하세요.');
 if(config.incomeOrigin?.modelId!==MODEL.id)return {salary:newSalary,externalAllowance:0};
 // A custom household has explicitly set its current allowance. Its original
 // generated family/support components are historical evidence, not money that
 // can be revived when a job is accepted.
 if(config.economicProfile?.active!==true||config.incomeOrigin.kind==='custom')return {salary:newSalary,externalAllowance:config.externalAllowance};
 const householdContributionMonthly=config.incomeOrigin.householdContributionMonthly||0;
 const reserve=config.economicProfile?.monthlyReserve??MODEL.reserveFloor;
 const gameSupport=Math.max(0,(config.fixedCosts||0)+housingTotal(config)+(config.personalBudget||0)+reserve-newSalary-householdContributionMonthly);
 return {salary:newSalary,externalAllowance:householdContributionMonthly+gameSupport,householdContributionMonthly,gameSupport};
}
function validateProfile(profile,config){
 if(!profile||typeof profile!=='object'||Array.isArray(profile)||profile.modelId!==MODEL.id||typeof profile.active!=='boolean'||!validHousehold(profile.household))return ['생활 예산의 생성 기록을 확인하세요.'];
 const errors=[],keys=['minimumLiving','leisureFloor','monthlyReserve','baseMonthly','baseSalary','baseExternalAllowance','gameSupport','totalMonthly','fixedCosts','personalBudget','housingTotal','startCash','cardLimit'];
 if(!keys.every(k=>integer(profile[k],0,200000000)))return ['생활 예산 금액을 확인하세요.'];
 const h=profile.housingSnapshot;
 if(!h||!['own','rent','jeonse','unspecified'].includes(h.tenure)||!integer(h.rent)||!integer(h.principal,0,10000000000)||!integer(h.rateBps,0,3000)||!integer(h.maintenance)||h.tenure!=='rent'&&h.rent!==0)return ['생성 당시의 주거 예산을 확인하세요.'];
 const housing=(h.tenure==='rent'?h.rent:0)+Math.round(h.principal*h.rateBps/120000)+h.maintenance;
 if(profile.housingTotal!==housing||profile.minimumLiving!==minimumLiving(profile.household.size)||profile.leisureFloor!==MODEL.leisureFloor||profile.fixedCosts<profile.minimumLiving||profile.personalBudget<MODEL.leisureFloor||profile.monthlyReserve<MODEL.reserveFloor||profile.floorSourceId!=='livelihood-standard-2026')errors.push('최소 생활 예산과 출처를 확인하세요.');
 // No snapshot means the previously published budget: never reprice an old save.
 const expectedLiving=profile.livingCosts===undefined?Math.max(profile.minimumLiving,Math.min(profile.minimumLiving*2,Math.round(profile.baseMonthly*.38))):profile.livingCosts?.total;
 if(profile.livingCosts!==undefined)errors.push(...ChildLiving.validate(profile.livingCosts,profile.baseMonthly,profile.minimumLiving,profile.household,profile.active?config:null));
 if(profile.fixedCosts!==expectedLiving||profile.personalBudget!==Math.max(MODEL.leisureFloor,Math.min(800000,Math.round(profile.baseMonthly*.1)))||profile.monthlyReserve!==Math.max(MODEL.reserveFloor,Math.min(500000,Math.round(profile.baseMonthly*.05)))||profile.cardLimit!==clamp(Math.round(profile.personalBudget*2),300000,3000000)||profile.startCash<Math.round(profile.totalMonthly*.8)||profile.startCash>Math.round(profile.totalMonthly*1.4))errors.push('생성 당시의 예산 계산을 확인하세요.');
 if(profile.baseMonthly!==profile.baseSalary+profile.baseExternalAllowance||profile.gameSupport!==Math.max(0,profile.fixedCosts+profile.housingTotal+profile.personalBudget+profile.monthlyReserve-profile.baseMonthly)||profile.totalMonthly!==profile.baseMonthly+profile.gameSupport)errors.push('생활안정지원 합계가 맞지 않습니다.');
 if(config?.incomeOrigin?.modelId===MODEL.id&&profile.baseMonthly!==config.incomeOrigin.baseMonthly)errors.push('수입 근거와 생활 예산의 원수입이 다릅니다.');
 if(profile.active&&config){
  if(config.housingOrigin&&(config.housingOrigin.subregionId??'')!==(config.subregionId??''))errors.push('현재 시군구와 주거의 생성 근거가 다릅니다.');
  if(!same(profile.household,household(config))||profile.housingTotal!==housingTotal(config))errors.push('현재 가구·주거와 자동 예산이 다릅니다.');
  if(config.incomeOrigin?.kind!=='lifecycle'||config.incomeOrigin?.age!==config.age||config.incomeOrigin?.role!==config.role||config.incomeOrigin?.provinceId!==config.province||!sameSubregion(config,config.incomeOrigin))errors.push('현재 환경과 수입의 생성 근거가 다릅니다.');
  if(config.salary!==profile.baseSalary||config.externalAllowance!==profile.baseExternalAllowance+profile.gameSupport||['fixedCosts','personalBudget','startCash','cardLimit'].some(k=>config[k]!==profile[k]))errors.push('직접 바꾼 금액을 자동 예산으로 표시할 수 없습니다.');
 }
 return errors;
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
return freeze({MODEL,SOURCES,CHILD_LIVING:ChildLiving,RAW_INCOME_ROWS,AGE_WAGES,SINGLE_PARENT,BANDS,LIVING,PROVINCES,household,distribution,sampleIncome,completeBudget,employmentIncome,validateOrigin,validateProfile,minimumLiving});
});
