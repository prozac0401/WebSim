(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.S2SubregionHousingData=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SOURCE={id:'kocer-market-202607',publisher:'한국도시연구소 / 국토교통부 실거래가 자료',primaryAnalysis:true,
 title:'전국 실거래가 분석 보고서(2006년~2026년 7월)',url:'https://www.kocer.re.kr/26/?idx=174571139&bmode=view',published:'2026-09-21',verifiedOn:'2026-10-17',period:'2026-Q2',unit:'만원/3.3㎡',
 locator:'2026년 2분기 열: 서울 매매 PDF58/인쇄44쪽 표Ⅱ-29, 경기 매매 PDF71/인쇄57쪽 표Ⅱ-37, 서울 전세 PDF124/인쇄110쪽 표Ⅲ-73, 경기 전세 PDF136/인쇄122쪽 표Ⅲ-81. 시도 소계도 같은 표·같은 분기.',
 scope:'서울 25개 구와 경기 31개 시군의 아파트 매매·전세 평균 면적단가. 7월만 포함한 3분기 대신 가장 최근 완결된 2분기를 사용한다. 지역별 월세나 비아파트 단가를 관측한 자료가 아니다.'};
const MODEL={id:'kr-municipal-housing-2026q2-v1',
 note:'아파트 매매·전세는 2026년 2분기 시군구 실거래 평균 면적단가를 사용합니다. 원룸·공동주거는 기존 시도 전체주택 단가에 같은 분기 아파트 시군구÷시도 비율을 적용합니다. 월세는 기존 시도 월세에 아파트 전세의 같은 지역비율을 적용한 게임 추정이며, 관측된 시군구 월세가 아닙니다. 면적·상태·대출 등 기존 게임 가정은 그대로이며 미래 시세 예측이 아닙니다.'};
const PROVINCE_REFERENCE={seoul:{salePer3_3M2Manwon:5403,jeonsePer3_3M2Manwon:2801},gyeonggi:{salePer3_3M2Manwon:2685,jeonsePer3_3M2Manwon:1631}};
// Exact Q2 cells: legal municipal id, province, name, apartment sale, apartment jeonse.
const RAW=[
 ['11680','seoul','강남구',11324,3695],['11740','seoul','강동구',6435,2782],['11305','seoul','강북구',3182,2130],['11500','seoul','강서구',4448,2378],['11620','seoul','관악구',4073,2344],
 ['11215','seoul','광진구',6442,3089],['11530','seoul','구로구',3717,1848],['11545','seoul','금천구',3063,1960],['11350','seoul','노원구',3566,1790],['11320','seoul','도봉구',2876,1622],
 ['11230','seoul','동대문구',4584,2684],['11590','seoul','동작구',6278,2954],['11440','seoul','마포구',6747,3117],['11410','seoul','서대문구',4629,2680],['11650','seoul','서초구',10411,4215],
 ['11200','seoul','성동구',7916,3338],['11290','seoul','성북구',4162,2525],['11710','seoul','송파구',8952,3345],['11470','seoul','양천구',5350,2588],['11560','seoul','영등포구',5753,2870],
 ['11170','seoul','용산구',8236,3338],['11380','seoul','은평구',3992,2260],['11110','seoul','종로구',4999,2975],['11140','seoul','중구',5718,3153],['11260','seoul','중랑구',3218,2022],
 ['41820','gyeonggi','가평군',995,867],['41280','gyeonggi','고양시',2251,1525],['41290','gyeonggi','과천시',9463,3939],['41210','gyeonggi','광명시',4069,2155],['41610','gyeonggi','광주시',1957,1357],
 ['41310','gyeonggi','구리시',3402,1926],['41410','gyeonggi','군포시',2356,1581],['41570','gyeonggi','김포시',1879,1335],['41360','gyeonggi','남양주시',2265,1465],['41250','gyeonggi','동두천시',806,700],
 ['41190','gyeonggi','부천시',2419,1579],['41130','gyeonggi','성남시',6076,2680],['41110','gyeonggi','수원시',2768,1729],['41390','gyeonggi','시흥시',1835,1256],['41270','gyeonggi','안산시',2166,1304],
 ['41550','gyeonggi','안성시',927,811],['41170','gyeonggi','안양시',3578,2080],['41630','gyeonggi','양주시',1374,987],['41830','gyeonggi','양평군',1544,1108],['41670','gyeonggi','여주시',979,878],
 ['41800','gyeonggi','연천군',734,634],['41370','gyeonggi','오산시',1544,1159],['41460','gyeonggi','용인시',2777,1761],['41430','gyeonggi','의왕시',3274,1904],['41150','gyeonggi','의정부시',1734,1272],
 ['41500','gyeonggi','이천시',1015,868],['41480','gyeonggi','파주시',1673,1182],['41220','gyeonggi','평택시',1409,954],['41650','gyeonggi','포천시',872,755],['41450','gyeonggi','하남시',4471,2441],['41590','gyeonggi','화성시',2880,1475]
];
const ROWS=RAW.map(([id,provinceId,name,salePer3_3M2Manwon,jeonsePer3_3M2Manwon])=>({id,provinceId,name,salePer3_3M2Manwon,jeonsePer3_3M2Manwon}));
const byId=id=>ROWS.find(row=>row.id===id)||null;
function model(provinceId,subregionId,scope){
 if(subregionId===undefined||subregionId===null||subregionId==='')return null;
 const row=byId(subregionId),province=PROVINCE_REFERENCE[provinceId];
 if(!row||row.provinceId!==provinceId||!province)throw new RangeError('주거 시군구와 시도가 일치하지 않습니다.');
 if(!['apartment','all'].includes(scope))throw new RangeError('주거 참고 유형을 확인하세요.');
 return {modelId:MODEL.id,sourceId:SOURCE.id,sourcePeriod:SOURCE.period,provinceId,subregionId,name:row.name,
  apartmentSalePer3_3M2Manwon:row.salePer3_3M2Manwon,apartmentJeonsePer3_3M2Manwon:row.jeonsePer3_3M2Manwon,
  provinceApartmentSalePer3_3M2Manwon:province.salePer3_3M2Manwon,provinceApartmentJeonsePer3_3M2Manwon:province.jeonsePer3_3M2Manwon,
  saleRatio:row.salePer3_3M2Manwon/province.salePer3_3M2Manwon,jeonseRatio:row.jeonsePer3_3M2Manwon/province.jeonsePer3_3M2Manwon,
  saleBasis:scope==='apartment'?'observed-apartment':'provincial-all-home-apartment-ratio-proxy',
  jeonseBasis:scope==='apartment'?'observed-apartment':'provincial-all-home-apartment-ratio-proxy',rentBasis:'provincial-rent-jeonse-ratio-proxy'};
}
function adjust(provinceId,subregionId,base){
 const municipalModel=model(provinceId,subregionId,base.scope);if(!municipalModel)return {...base};
 const m=municipalModel;
 return {...base,rentPerHomeWon:Math.round(base.rentPerHomeWon*m.jeonseRatio),rentPer3_3M2Won:Math.round(base.rentPer3_3M2Won*m.jeonseRatio),
  salePer3_3M2Won:base.scope==='apartment'?m.apartmentSalePer3_3M2Manwon*10000:Math.round(base.salePer3_3M2Won*m.saleRatio),
  jeonsePer3_3M2Won:base.scope==='apartment'?m.apartmentJeonsePer3_3M2Manwon*10000:Math.round(base.jeonsePer3_3M2Won*m.jeonseRatio)};
}
function validateModel(value,provinceId,subregionId,scope){
 try{const expected=model(provinceId,subregionId,scope);if(!expected||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==Object.keys(expected).length||Object.keys(expected).some(key=>value[key]!==expected[key]))return ['시군구 주거 근거 또는 추정 방식이 일치하지 않습니다.'];return [];}catch(error){return [error.message];}
}
return {SOURCE,MODEL,PROVINCE_REFERENCE,RAW,ROWS,byId,forProvince:provinceId=>ROWS.filter(row=>row.provinceId===provinceId),model,adjust,validateModel};
});
