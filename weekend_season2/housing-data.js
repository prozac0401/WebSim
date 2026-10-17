(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2HousingData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MODEL = {
    id: 'kr-housing-market-2026-v1', unit: 'KRW', period: '2026-01~2026-07',
    note: '지역별 실거래 집계와 가구규모·연령별 주거조사를 참고한 게임용 합성입니다. 관측된 지역×연령×가구규모 공동분포가 아닙니다. 면적·계약 선택·대출비율·금리·관리유지비·공동주거 분담은 게임 가정이며 소득이 낮다는 이유로 시장 월세를 낮추지 않습니다. 미래 연도에도 같은 자료를 사용하며 시세 예측이 아닙니다.'
  };
  const SOURCES = [
    { id: 'kocer-market-202607', publisher: '한국도시연구소', primaryAnalysis: true,
      title: '전국 실거래가 분석 보고서(2006년~2026년 7월)',
      url: 'https://www.kocer.re.kr/26/?idx=174571139&bmode=view',
      published: '2026-09-21', verifiedOn: '2026-10-17', period: MODEL.period,
      dataRetrievedByAuthor: '2026-09-01',
      scope: '국토교통부 실거래가 공개자료의 단독·다가구, 아파트, 연립·다세대 계약. 오피스텔은 포함하지 않음. 2026년 값은 1~7월 계약의 평균.',
      rentalFilter: '보증금÷월세 26.7배 이하인 계약만 분석. 순월세와 준월세 일부이며 준전세 제외. 보증금을 월세로 환산하거나 합산하지 않음.',
      locator: '분석방법 PDF17/인쇄3쪽; 월세 선별 PDF146/132쪽. 전체/아파트 월세 호당 PDF151/163쪽, 3.3㎡당 PDF156/168쪽. 전체/아파트 매매 3.3㎡당 PDF29/43쪽, 전세 3.3㎡당 PDF97/112쪽.',
      limitations: '전체 임대가구의 평균·중위값, 특정 면적대의 가격, 개별 주택 견적이 아니다. 면적단가로 특정 크기의 집을 계산하는 것은 게임 근사다. 지역 내부·건물상태·층수의 차이와 최근 신고의 추가·정정이 반영되지 않는다.' },
    { id: 'molit-housing-2024', publisher: '국토교통부·국토연구원', primaryAnalysis: true,
      title: '2024년도 주거실태조사 통계보고서(2026-01-07 정정본)',
      url: 'https://stat.molit.go.kr/portal/cate/statMetaView.do?hRsId=327&hFormId=5405',
      published: '2025-11-16', corrected: '2026-01-07', verifiedOn: '2026-10-17',
      scope: '대한민국 일반가구 표본조사. 기존 계약·공공임대 포함. 지역, 가구주 연령, 가구원수별 별도 조건분포.',
      locator: '현재주택 점유형태 표4 PDF37~38/인쇄23~24쪽. 주택사용면적 표40 PDF115~116/인쇄101~102쪽.',
      limitations: '자가·임차·무상만 사용. 2021년 이후 전세·월세 각각의 점유율은 정확한 추정에 한계가 있다고 보고서가 명시한다. 지역×연령×가구규모 교차분포는 제공되지 않으며 성별 수치는 생성에 사용하지 않는다.' }
  ];
  // Exact 2026 January–July columns, original units: ten thousand KRW.
  // id, label, whole-home rent, rent/3.3m², apartment rent,
  // apartment rent/3.3m², whole-home sale/3.3m², apartment sale/3.3m²,
  // whole-home jeonse/3.3m², apartment jeonse/3.3m².
  const RAW_MARKET = [
    ['seoul','서울',79.8,8.5,176.8,12.5,4521,5211,2393,2751],
    ['busan','부산',53.3,5.2,80.1,5.1,1742,1805,1129,1178],
    ['daegu','대구',56.5,3.7,82.2,3.8,1538,1597,997,1082],
    ['incheon','인천',68.3,4.6,101.8,5.3,1576,1853,1129,1268],
    ['gwangju','광주',47.6,4.4,58.7,4.1,1241,1269,960,997],
    ['daejeon','대전',46.4,5,57.6,5.2,1473,1564,1039,1157],
    ['ulsan','울산',53.3,4.2,76.8,4.2,1422,1485,1117,1200],
    ['sejong','세종',65,5.5,78.9,5.6,2145,2227,1063,1081],
    ['gyeonggi','경기',63.3,5.4,91.5,5.7,2415,2624,1472,1625],
    ['gangwon','강원',50.1,4,62.1,3.6,901,984,743,782],
    ['chungbuk','충북',51.4,4.5,62.9,4.1,978,1080,832,915],
    ['chungnam','충남',51.3,4.3,61.2,4.2,897,985,795,858],
    ['jeonbuk','전북',42.1,3.5,50.4,3.3,905,992,806,872],
    ['jeonnam','전남',48.3,3.8,55.6,3.7,753,858,643,651],
    ['gyeongbuk','경북',45.6,3.3,63.5,3.2,749,835,676,708],
    ['gyeongnam','경남',45.9,3.4,61.2,3.2,1067,1153,863,905],
    ['jeju','제주',76.9,4.6,80.3,5.3,1249,1518,979,1094],
    ['national','전국',61.5,5.5,88.1,5.6,2170,2283,1533,1616]
  ];
  const MARKET_COLUMNS = ['id','label','allRentManwon','allRentPer3_3M2Manwon','apartmentRentManwon','apartmentRentPer3_3M2Manwon','allSalePer3_3M2Manwon','apartmentSalePer3_3M2Manwon','allJeonsePer3_3M2Manwon','apartmentJeonsePer3_3M2Manwon'];
  const MARKET = Object.fromEntries(RAW_MARKET.map(row => [row[0], Object.fromEntries(MARKET_COLUMNS.map((k,i) => [k,row[i]]))]));
  // [owner %, tenant %, free %], exact survey marginal distributions.
  const TENURE_REGION = {
    seoul:[44.1,53.4,2.5],busan:[60.8,36.1,3.1],daegu:[60.2,36.6,3.3],incheon:[61.5,35.3,3.2],
    gwangju:[62.5,34.4,3.1],daejeon:[53.1,43.8,3.1],ulsan:[64.1,32.2,3.7],sejong:[58.4,38.9,2.8],
    gyeonggi:[57.2,39.8,3],gangwon:[63.2,30.1,6.7],chungbuk:[62.8,32.4,4.7],chungnam:[64.2,30.2,5.7],
    jeonbuk:[67.4,28,4.6],jeonnam:[72.1,22.2,5.7],gyeongbuk:[69.5,25.4,5.1],gyeongnam:[66.8,29,4.2],
    jeju:[58.5,34.4,7],national:[58.4,38,3.6]
  };
  const TENURE_AGE = { '20s':[5.3,90,4.7], '30s':[32.3,63,4.7], '40s':[59.2,38.1,2.7], '50s':[66.2,31.2,2.6], '60s':[74.4,23.2,2.4], '70s':[76.9,19.1,4], '80plus':[75.7,15.3,9] };
  const TENURE_SIZE = [[32,61.8,6.2],[72,25.9,2.1],[70.7,27.3,2],[76.9,21.2,1.9],[77,17.9,5.1],[76.2,14.8,9]];
  const AREA_SIZE = [46.8,74.9,80.3,86.3,91.2,96.2];
  const AREA_AGE = { '20s':32.9,'30s':59.2,'40s':73,'50s':74,'60s':74.2,'70s':73.1,'80plus':71.1 };
  const has = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const rounded = (n,step) => Math.round(n/step)*step;
  const ageBandFor = age => age < 30 ? '20s' : age < 40 ? '30s' : age < 50 ? '40s' : age < 60 ? '50s' : age < 70 ? '60s' : age < 80 ? '70s' : '80plus';
  function reference(regionId,scope) {
    const row=MARKET[regionId], apt=scope==='apartment';
    return {scope,rentPerHomeWon:Math.round(row[apt?'apartmentRentManwon':'allRentManwon']*10000),
      rentPer3_3M2Won:Math.round(row[apt?'apartmentRentPer3_3M2Manwon':'allRentPer3_3M2Manwon']*10000),
      salePer3_3M2Won:row[apt?'apartmentSalePer3_3M2Manwon':'allSalePer3_3M2Manwon']*10000,
      jeonsePer3_3M2Won:row[apt?'apartmentJeonsePer3_3M2Manwon':'allJeonsePer3_3M2Manwon']*10000,
      maxDepositRentRatio:26.7};
  }
  function sample(config,household,random,options={}) {
    if (!config || !household || typeof random!=='function') throw new TypeError('주거 생성 입력이 필요합니다.');
    if (!Number.isInteger(household.size) || household.size<1 || household.size>12) throw new RangeError('가구원수는 1~12명이어야 합니다.');
    if (!Number.isInteger(config.age) || config.age<18 || config.age>110) throw new RangeError('성인 연령을 확인하세요.');
    // Fixed draw count; gender, salary, welfare, cash and role never affect this stream.
    const draws=Array.from({length:8},()=>random());
    if (draws.some(n=>!Number.isFinite(n)||n<0||n>=1)) throw new RangeError('난수는 0 이상 1 미만이어야 합니다.');
    const [tenureDraw,areaDraw,qualityDraw,depositDraw,loanDraw,ratioDraw,rateDraw,maintenanceDraw]=draws;
    const provinceId=typeof config.province==='string'?config.province:typeof config.provinceId==='string'?config.provinceId:'unspecified';
    const referenceRegionId=has(MARKET,provinceId)&&provinceId!=='national'?provinceId:'national';
    const ageBand=ageBandFor(config.age), size=household.size, sizeIndex=Math.min(6,size)-1;
    let housingType=['studio','apartment','shared'].includes(config.housing)?config.housing:'apartment';
    const housingAdjustment=housingType==='studio'&&size>2?'3인 이상 가구의 원룸 설정을 가족용 아파트로 조정':null;
    if (housingAdjustment) housingType='apartment';
    const marketReference=reference(referenceRegionId,housingType==='apartment'?'apartment':'all');
    const odds=row=>row[0]/row[1], nationalOdds=odds(TENURE_REGION.national);
    // Synthetic odds combination, not an observed joint distribution. Free tenure
    // is outside the three supported generated contracts; rental subtype split is a game choice.
    const ownershipOdds=odds(TENURE_AGE[ageBand])*Math.sqrt(odds(TENURE_REGION[referenceRegionId])/nationalOdds)*Math.sqrt(odds(TENURE_SIZE[sizeIndex])/nationalOdds);
    const ownerChance=ownershipOdds/(1+ownershipOdds);
    let housingTenure=tenureDraw<ownerChance?'own':(tenureDraw-ownerChance)/(1-ownerChance)<(config.age<30?.30:.40)?'jeonse':'rent';
    if (options.preserveTenure && ['own','rent','jeonse'].includes(config.housingTenure)) housingTenure=config.housingTenure;
    const share=housingType==='shared'?.65:1;
    let targetArea=AREA_SIZE[sizeIndex]+Math.max(0,size-6)*8;
    if (size===1 && config.age<30) targetArea=AREA_AGE['20s'];
    let minArea=size===1?22:size===2?40:50+(size-3)*8;
    let maxArea=size===1?59:size===2?90:105+(size-3)*10;
    if (housingType==='studio') {minArea=size===1?22:32;maxArea=size===1?38:49;targetArea=Math.min(targetArea,maxArea);}
    if (housingType==='shared') {targetArea+=15;minArea+=15;maxArea+=15;}
    const areaM2=rounded(clamp(targetArea*(.85+.30*areaDraw),minArea,maxArea),1);
    const variation=.85+.30*qualityDraw; // unexplained local/condition diversity is explicitly a game assumption.
    const units=areaM2/3.3;
    const fullRent=Math.max(marketReference.rentPerHomeWon*.65,marketReference.rentPer3_3M2Won*units)*variation;
    const monthlyRent=housingTenure==='rent'?Math.max(300000,rounded(fullRent*share,100000)):0;
    const propertyValue=housingTenure==='own'?Math.max(1000000,rounded(marketReference.salePer3_3M2Won*units*variation*share,1000000)):0;
    // A coherent low-deposit synthetic contract, inside the source cohort's ratio.
    // These are not paired observations from an actual apartment.
    const deposit=housingTenure==='rent'?Math.floor(monthlyRent*(12+12*depositDraw)/1000000)*1000000:
      housingTenure==='jeonse'?Math.max(1000000,rounded(marketReference.jeonsePer3_3M2Won*units*variation*share,1000000)):0;
    const loanBase=housingTenure==='own'?propertyValue:deposit;
    const noLoanChance=config.age<30?.15:config.age<50?.25:config.age<65?.40:.60;
    const ratioRange=config.age<30?[.55,.80]:config.age<50?[.35,.70]:config.age<65?[.20,.55]:[.10,.40];
    const loanRatio=loanDraw<noLoanChance?0:Math.round((ratioRange[0]+ratioDraw*(ratioRange[1]-ratioRange[0]))*100)/100;
    const housingLoanPrincipal=Math.min(10000000000,Math.floor(loanBase*loanRatio/10000)*10000);
    const housingLoanRateBps=housingLoanPrincipal?[350,400,450,500][Math.floor(rateDraw*4)]:0;
    const interest=Math.round(housingLoanPrincipal*housingLoanRateBps/120000);
    const maintenanceBase=rounded((50000+areaM2*1000+maintenanceDraw*50000)*share,1000);
    let total=rounded(monthlyRent+interest+Math.max(50000,maintenanceBase),100000);
    if (total-monthlyRent-interest<50000) total+=100000;
    const housingMaintenance=total-monthlyRent-interest;
    const housingOrigin={model:MODEL.id,kind:'statistical-game-model',provinceId,referenceRegionId,period:MODEL.period,
      housingTenure,housingType,householdSize:size,ageBand,areaM2,deposit,propertyValue,loanRatio,share,marketReference,
      sourceIds:SOURCES.map(s=>s.id),monthlyRent,loanPrincipal:housingLoanPrincipal,rateBps:housingLoanRateBps,interest,housingMaintenance,total,
      housingAdjustment,
      note:'시작 당시 자료 참고 게임 계약. 월세는 저보증금 계약 평균 면적단가로 근사하고 10만원 단위로 설정(게임 하한 30만원). 보증금은 월세 12~24개월분을 백만원 단위로 내린 게임 계약 조건이며 실거래 한 쌍이 아님. 주택·전세금·대출은 이미 존재하는 시작 자산과 채무로 현금에 입금하지 않음. 금리 3.5~5%와 연령별 자산·대출비율은 게임 가정. 관리·유지비는 최소 5만원의 게임예산이며 월 주거비 합계를 10만원 단위로 맞춘 잔차 포함.'+(share<1?' 공동주거 비용의 65%를 이 가구가 분담하는 게임 가정. 동거인의 소득을 추가하지 않음.':'')};
    return {housing:housingType,housingTenure,monthlyRent,housingLoanPrincipal,housingLoanRateBps,housingMaintenance,housingOrigin};
  }
  function validateOrigin(origin) {
    const errors=[];
    if (!origin || typeof origin!=='object'||Array.isArray(origin)) return ['주거 근거 형식이 잘못되었습니다.'];
    if (origin.model!==MODEL.id || origin.kind!=='statistical-game-model'||origin.period!==MODEL.period) errors.push('주거 모델 또는 기준기간이 잘못되었습니다.');
    if (!['own','rent','jeonse'].includes(origin.housingTenure)||!['studio','apartment','shared'].includes(origin.housingType)) errors.push('주거 계약 유형이 잘못되었습니다.');
    if (typeof origin.provinceId!=='string'||!['unspecified',...Object.keys(MARKET).filter(k=>k!=='national')].includes(origin.provinceId)) errors.push('주거 지역이 잘못되었습니다.');
    const expectedRegion=has(MARKET,origin.provinceId)&&origin.provinceId!=='national'?origin.provinceId:'national';
    if (origin.referenceRegionId!==expectedRegion) errors.push('주거 참고 지역이 일치하지 않습니다.');
    if (!Number.isInteger(origin.householdSize)||origin.householdSize<1||origin.householdSize>12||!has(TENURE_AGE,origin.ageBand)) errors.push('주거 가구 특성이 잘못되었습니다.');
    if (!Number.isInteger(origin.areaM2)||origin.areaM2<22||origin.areaM2>250) errors.push('주거 면적이 잘못되었습니다.');
    for (const key of ['deposit','propertyValue','monthlyRent','loanPrincipal','interest','housingMaintenance','total']) if (!Number.isSafeInteger(origin[key])||origin[key]<0||origin[key]>10000000000) errors.push('주거 금액이 잘못되었습니다: '+key);
    if (!Number.isInteger(origin.rateBps)||![0,350,400,450,500].includes(origin.rateBps)||!Number.isFinite(origin.loanRatio)||origin.loanRatio<0||origin.loanRatio>.8) errors.push('주거 대출 조건이 잘못되었습니다.');
    if (origin.share!==(origin.housingType==='shared'?.65:1)) errors.push('공동주거 분담이 일치하지 않습니다.');
    const expected=reference(expectedRegion,origin.housingType==='apartment'?'apartment':'all');
    if (!origin.marketReference||Object.keys(expected).some(k=>origin.marketReference[k]!==expected[k])) errors.push('원자료 주거 참고값이 일치하지 않습니다.');
    if (!Array.isArray(origin.sourceIds)||origin.sourceIds.length!==SOURCES.length||SOURCES.some(s=>!origin.sourceIds.includes(s.id))) errors.push('주거 출처가 잘못되었습니다.');
    if (typeof origin.note!=='string'||origin.note.length>2000 || !(origin.housingAdjustment===null||typeof origin.housingAdjustment==='string'&&origin.housingAdjustment.length<100)) errors.push('주거 설명이 잘못되었습니다.');
    if (origin.monthlyRent%100000!==0||origin.total%100000!==0||origin.housingMaintenance<50000||origin.interest!==Math.round(origin.loanPrincipal*origin.rateBps/120000)||origin.total!==origin.monthlyRent+origin.interest+origin.housingMaintenance) errors.push('주거 월 비용 계산이 일치하지 않습니다.');
    if ((origin.loanPrincipal===0)!==(origin.rateBps===0)) errors.push('주거 원금과 금리가 일치하지 않습니다.');
    const base=origin.housingTenure==='own'?origin.propertyValue:origin.deposit;
    if (origin.loanPrincipal!==Math.min(10000000000,Math.floor(base*origin.loanRatio/10000)*10000)) errors.push('주거 대출 비율이 일치하지 않습니다.');
    if (origin.housingTenure==='rent'&&(origin.monthlyRent<300000||origin.propertyValue!==0||origin.deposit/origin.monthlyRent>26.7)) errors.push('월세 계약과 보증금이 일치하지 않습니다.');
    if (origin.housingTenure!=='rent'&&origin.monthlyRent!==0 || origin.housingTenure==='own'&&(origin.deposit!==0||origin.propertyValue<1000000) || origin.housingTenure==='jeonse'&&(origin.propertyValue!==0||origin.deposit<1000000)) errors.push('주거 점유형태와 자산이 일치하지 않습니다.');
    return errors;
  }
  return {MODEL,SOURCES,MARKET,RAW_MARKET,MARKET_COLUMNS,TENURE_REGION,TENURE_AGE,TENURE_SIZE,AREA_SIZE,AREA_AGE,sample,validateOrigin};
});
