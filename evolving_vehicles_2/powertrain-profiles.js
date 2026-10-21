/* Manufacturer-checked transmission families and sourced ratios.
 * Sources distinguish exact-market specifications from reference-market ratios.
 * Physical gear selection and the HUD share these profiles. Shift duration and
 * retained drive torque are separate simulation assumptions, not specifications
 * verified by the ratio sources. WOT scheduling and radius corrections are also
 * estimates; the display reads the resulting physical transmission state. */
(function(root){
  'use strict';
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const reviewedAt='2026-10-15';
  const SOURCES=freeze({
    'toyota-gr86-jp-2022':{title:'Toyota Japan GR86 May 2022 RZ specifications',url:'https://toyota.jp/pages/contents/carlineup/archive/gr86/2022-05/pdf/gr86_main_s_202205.pdf',observation:'PDF 5쪽 RZ 215/40R18·Torsen LSD, 10쪽 FA24 235 PS/7000 rpm·250 Nm/3700 rpm·6MT 1270 kg/6AT 1290 kg, 11쪽 각 변속기의 기어비와 종감속비. 일본 RZ 조합으로 통일하며 국내 231 PS 모델과 구분한다.'},
    'toyota-gr86-eu-2022-engine':{title:'Toyota Europe: All-New Toyota GR86, June 2022',url:'https://newsroom.toyota.eu/all-new-toyota-gr86/',observation:'같은 2.4L FA24 세대 엔진의 최대 회전수 7500 rpm을 명시한다. 일본 사양의 변속 맵이나 7000 rpm WOT 변속 시점을 검증한 자료는 아니다.'},
    'hyundai-avante-n-2021':{title:'현대 2021 아반떼 N 국내 가격·제원',url:'https://www.hyundai.com/contents/repn-car/catalog/avante-n-price.pdf',observation:'2021년 7월 14일 출시 CN7 N. 2.0 터보 280 PS, FWD eLSD, 6MT 1450 kg 또는 습식 8DCT 1485 kg. NGS 일시 출력 증대는 모형에 적용하지 않는다.'},
    'hyundai-avante-n-au-2021-ratios':{title:'Hyundai Australia i30 Sedan N November 2021 specifications',url:'https://www.hyundai.com/content/dam/hyundai/au/en/models/i30-sedan-n/spec-sheet/i30-Sedan-N_Spec-Table_Nov_2021.pdf',observation:'PDF 1쪽: 6MT 및 8DCT의 단별 기어비와 종감속 배정, 최고출력 5500–6000 rpm. ratedPowerRPM은 이 범위 상단 6000을 사용한다. 국내 동일성은 미확인인 해외 참고값이며, 6500 rpm 변속 및 7000 rpm 표시 상한은 추정이다.'},
    'bmw-m2-2016-de':{title:'BMW M2 10/2015 ACEA technical specifications',url:'https://www.press.bmwgroup.com/bulgaria/article/attachment/T0238670BG/332713',observation:'2016 전기형 F87 일반 M2. 1쪽 DIN 질량 MT 1495/DCT 1520 kg, 370 PS·465 Nm·최고출력 6500rpm. 2쪽 6MT/7DCT 단별 기어비와 공통 종감속 3.462. 독일·ACEA 기준을 그대로 수록하며 Competition 및 미국 bhp 사양을 혼합하지 않는다.'},
    'bmw-m2-2016-uk-engine':{title:'BMW UK: The new BMW M2, April 2016',url:'https://www.press.bmwgroup.com/united-kingdom/article/detail/T0238509EN_GB/the-new-bmw-m2',observation:'같은 전기형 370 hp 엔진의 최대 7000rpm을 명시. 일반 465 Nm와 일시 오버부스트 500 Nm를 구분하며 고정 토크에는 일반값만 적용. 이 본문은 WOT 변속 시점을 제공하지 않는다.'},
    'kia-ray':{title:'기아 레이 정부 신고 연비·변속기',url:'https://www.kia.com/kr/vehicles/ray/specification',observation:'1.0 가솔린 14/15인치: 자동 4단.'},
    'kia-ray-ev':{title:'기아 레이 EV 제원',url:'https://www.kia.com/kr/vehicles/ray-ev/specification',observation:'전기 구동 모델. 내연기관 회전계와 변속 단수 HUD를 표시하지 않는다.'},
    'kia-morning':{title:'기아 모닝 가격·기본 품목',url:'https://www.kia.com/kr/vehicles/morning/price',observation:'스마트스트림 G1.0, 4단 자동변속기.'},
    'hyundai-avante':{title:'현대 2027 아반떼 제원표',url:'https://www.hyundai.com/contents/repn-car/catalog/spec/avante-27fc-spec.pdf',observation:'2.0 가솔린: 스마트스트림 IVT. 별도의 1.6 HEV 6DCT를 현재 가솔린 사양에 적용하지 않는다.'},
    'kia-k5':{title:'기아 K5 정부 신고 연비·변속기',url:'https://www.kia.com/kr/vehicles/k5/specification',observation:'1.6 가솔린 터보: 자동 8단. 2.0 가솔린/LPG 및 2.0 HEV: 자동 6단. K5에 1.6 HEV를 혼용하지 않는다.'},
    'kia-k5-gt-us-2026':{title:'Kia America 2026 K5 GT specifications',url:'https://www.kiamedia.com/us/es/models/k5/2026/specifications',observation:'미국 2.5T GT FWD 습식 8DCT: 290 SAE hp/5800 rpm, 단별 기어비와 두 종감속 4.077/2.944. 각 단의 종감속 배정은 표에 없으므로 1/2/5/6단=4.077, 3/4/7/8단=2.944는 추정으로 별도 표시한다. 일반 2.5 자연흡기 8AT와 구분한다.'},
    'kia-k5-hev-az':{title:'Kia Azerbaijan K5 facelift HEV specifications',url:'https://www.kia.com/az/showroom/k5-pe/specification.html',observation:'2.0 HEV 시스템 195 PS/6000 rpm·367 Nm/1770 rpm·6AT. 국내 엔진 152 PS·모터 38.6 kW와 별도인 해외 시스템 성능 참고값이며 국내 일치 및 단별 기어비는 미확인.'},
    'kia-carnival':{title:'기아 카니발 정부 신고 연비·변속기',url:'https://www.kia.com/kr/vehicles/carnival/specification',observation:'3.5 가솔린 9인승 18인치: 자동 8단. 1.6 터보 HEV 9인승 18인치: 자동 6단.'},
    'genesis-g80':{title:'제네시스 G80 국내 제원·연비',url:'https://www.genesis.com/kr/ko/models/luxury-sedan-genesis/g80/specs.html',observation:'G80 2.5T/3.5T, 2WD/AWD: 자동 8단. 같은 페이지의 다른 차종 표와 구분한다.'},
    'hyundai-ioniq5':{title:'현대 2027 아이오닉 5 제원표',url:'https://www.hyundai.com/contents/repn-car/catalog/spec/ioniq5-27my-spec.pdf',observation:'Standard/Long Range 전기 구동 모델. 내연기관 HUD를 표시하지 않는다.'},
    'hyundai-ioniq5-au-2026-reduction':{title:'Hyundai Australia MY2026 IONIQ 5 specification sheet',url:'https://www.hyundai.com/content/dam/hyundai/au/en/models/ioniq5/docs/2026-IONIQ-5-Specification-Sheet.pdf',observation:'PDF 1–2쪽: 84 kWh RWD 및 AWD. 후륜 감속기 2.263, AWD 전륜도 2.263, 종감속 4.706으로 각 구동축 총 감속비 10.649678. 국내 Long Range에 참고 적용하며 국내 일치는 미확인. 63 kWh Standard와 고성능 N은 포함하지 않는다.'},
    'hyundai-grandeur':{title:'현대 2027 그랜저 제원표',url:'https://www.hyundai.com/contents/repn-car/catalog/spec/grandeur-27fl-spec.pdf',observation:'가솔린 2.5 2WD, 가솔린 3.5 2WD/AWD: 자동 8단.'},
    'hyundai-santafe':{title:'현대 싼타페 가격·파워트레인',url:'https://www.hyundai.com/kr/ko/e/vehicles/santafe/price',observation:'국내 2.5 터보: 스마트스트림 습식 8단 DCT. 하이브리드 6AT와 구분한다.'},
    'hyundai-santafe-hev':{title:'현대 싼타페 하이브리드 국내 제원',url:'https://www.hyundai.com/kr/ko/e/vehicles/santafe-hybrid/intro',observation:'1.6T HEV FWD/AWD: 시스템 235 PS, 엔진 180 PS·모터 47.7 kW, 자동 6단. 5인승 18인치 235/60R18 FWD 1865 kg/AWD 1930 kg. 엔진·모터 토크 최고값을 단순 합산하지 않는다.'},
    'hyundai-santafe-hev-au-ratios':{title:'Hyundai Australia Santa Fe Hybrid specifications',url:'https://www.hyundai.com/au/en/cars/suvs/santa-fe-hybrid/specifications',observation:'현행 48 kW 모터 모델의 시스템 172 kW·367 Nm, FWD/AWD 6AT 단별 기어비와 종감속 3.510. 국내 235 PS/47.7 kW 모델에 토크·기어비를 참고 적용하며 국내 일치는 미확인. 이전 44.2 kW 모터 PDF와 구분한다.'},
    'hyundai-transys-hev-at':{title:'현대트랜시스 하이브리드 자동변속기 구조',url:'https://blog.hyundai-transys.com/544?category=385696',observation:'엔진과 변속기 사이 토크컨버터를 모터로 대체한 하이브리드 자동변속기 구조. HEV 6AT를 일반 토크컨버터 AT와 구분하는 구조 근거이며 변속 시간·유지 토크율을 검증한 자료는 아니다.'},
    'hyundai-staria':{title:'현대 더 뉴 스타리아 라운지 가격',url:'https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/price',observation:'스마트스트림 LPG 3.5: 8단 자동변속기.'},
    'kgm-musso-ev':{title:'KGM 무쏘 EV 2026년 3월 가격·제원',url:'https://www.kg-mobility.com/attached/contents/display/file/200000200010012/20260228234258004_JNYcqu.pdf',observation:'2WD/AWD 전기 구동 모델. 내연기관 HUD를 표시하지 않는다.'},
    'kgm-torres':{title:'KGM 뉴 토레스 공식 출시 설명',url:'https://allways.kg-mobility.com/kgm-%EB%89%B4-%ED%86%A0%EB%A0%88%EC%8A%A4-%EC%B6%9C%EC%8B%9C-%ED%8C%8C%EC%9B%8C%ED%8A%B8%EB%A0%88%EC%9D%B8-%EC%97%85%EA%B7%B8%EB%A0%88%EC%9D%B4%EB%93%9C-%EC%A0%95%ED%86%B5-suv-%EA%B0%90%EC%84%B1/',observation:'2026년 5월 출시 가솔린 1.5 T-GDI: 아이신 8단 자동변속기. 이전 6AT 및 HEV e-DHT와 구분한다.'},
    'hyundai-porter':{title:'현대 포터 II 공식 카탈로그',url:'https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf',observation:'PDF 5/11쪽: LPG 초장축 슈퍼캡 6단 수동 또는 5단 자동. 최고출력 회전수 3800rpm은 레드라인이 아니다.'},
    'hyundai-porter-diesel-2020':{title:'현대 2020.03 포터 II 디젤 공식 카탈로그',url:'https://www.hyundai.com/content/dam/hyundai/kr/ko/data/vehicles/catalog/porter2-catalog.pdf',observation:'PDF 5/11쪽: D4CB 2497 cc 133 PS/3600 rpm·26.5 kgf·m, 초장축 슈퍼캡 6MT 1820 kg/5AT 1845 kg. 두 변속기의 엔진 성능은 공통이다. 단별·종감속비는 미확인; 3600 rpm은 최고출력 회전수이며 레드라인이 아니다.'},
    'hyundai-porter-diesel-2020-price':{title:'현대 2020.03 포터 II 가격표',url:'https://www.hyundai.com/content/dam/hyundai/kr/ko/data/vehicles/price/porter2-price.pdf',observation:'2WD 초장축 슈퍼캡 2.5 CRDi·6MT/5AT, 앞 195/70R15·뒤 145R13. 뒤 타이어의 미표기 단면비와 실제 구름 반지름은 확인하지 못했다.'},
    'hyundai-porter-a2-2020':{title:'현대 2020.03 포터 II 특장차 기본차 가격표',url:'https://www.hyundai.com/content/dam/hyundai/kr/ko/data/vehicles/price/porter2-special-vehicle-price.pdf',observation:'기본차 파워트레인 A-2 2.5 CRDi 계열 명칭 확인에만 사용. 특장차 질량을 일반 초장축 슈퍼캡에 적용하지 않는다.'},
    'genesis-g70-diesel-2019':{title:'제네시스 2019 국내 G70 디젤 제조사 카탈로그 보관본',url:'https://www.auto-brochures.com/makes/genesis/G70/Genesis_int%20G70_2019.pdf',observation:'PDF 16/22/26쪽: 2199 cc 202 PS/3800 rpm·45 kgf·m, 8AT 17인치 RWD 1690 kg/AWD 1765 kg, 225/50R17. 가솔린 8AT의 단별·종감속비를 디젤에 전용하지 않는다.'},
    'genesis-g70-r-family':{title:'Genesis G70 Korean-market launch specifications',url:'https://newsroom.genesis.com/genesis-g70-resets-expectations-of-customer-focused-performance-and-luxury/',observation:'국내 사양 R-FR 2.2 VGT 디젤 계열과 202 PS·45 kgf·m, RWD/AWD를 확인한다. 엔진 세부 코드와 WOT 변속 맵은 이 자료로 확인하지 않는다.'},
    'hyundai-staria-diesel-2021':{title:'현대 2021 스타리아 라운지 모델 역사·제원',url:'https://www.hyundai.com/kr/ko/brand/brandstory/model/staria-history/2021-staria-lounge',observation:'2021.04 디젤 VGT 2.2 2199 cc·177 PS/3800 rpm·44 kgf·m·8AT·235/55R18. 국내 전륜구동 2WD 2320 kg.'},
    'hyundai-staria-diesel-2021-catalog':{title:'현대 2021 국내 스타리아 라운지 카탈로그 보관본',url:'https://autocatalogarchive.com/wp-content/uploads/2021/05/Hyundai-Staria-Lounge-2021-KR.pdf',observation:'제조사 책자의 정부 신고 연비 표: 라운지 7인승 18인치 8AT FWD 2320 kg/AWD 2390 kg. 현재 검색 색인에서 표 확인; 직접 PDF 요청은 403. 9인승·리무진 질량과 구분한다.'},
    'hyundai-staria-r-family-au':{title:'Hyundai Australia Staria February 2023 specification sheet',url:'https://www.hyundai.com/content/dam/hyundai/au/en/models/staria/2021/docs/STARIA_Spec-Table_Feb_2023_v1.pdf',observation:'동일 2199 cc 디젤의 R series 2.2 VGT 계열 명칭 참고. 호주 D4HB 코드·AWD 기어비를 국내 코드·기어비 확인값으로 표시하지 않는다.'},
    'kia-carnival-diesel-2024':{title:'기아 2024.04 국내 카니발 카탈로그',url:'https://rental.kia.com/rentfile/carseries/carseries_1713417958657.pdf',observation:'PDF 14/16쪽: 2151 cc 디젤 194 PS/3800 rpm·45 kgf·m, 9인승 18인치 8AT 2115 kg·235/60R18. 스마트스트림 D2.2이며 구형 2199 cc R2.2와 구분한다. 가솔린 8AT의 단별·종감속비를 전용하지 않는다.'},
    'kia-carnival-smartstream-family':{title:'기아 2023.08 카니발 국내 가격표',url:'https://www.kia.com/content/dam/kwp/kr/ko/vehicles/pdf/price/price_4thcarnival.pdf',observation:'같은 KA4 2151 cc 디젤의 스마트스트림 D2.2 계열 명칭 확인. 출력·질량·외형은 별도 2024 페이스리프트 자료를 사용한다.'},
    'genesis-g70-2019':{title:'전기형 G70 2019 제조사 카탈로그 보관본',url:'https://www.auto-brochures.com/makes/genesis/G70/Genesis_int%20G70_2019.pdf',observation:'국내 2.0T/3.3T, RWD/AWD: 8단 자동. 현행 2.5T 또는 북미 6MT 사양을 혼합하지 않는다.'},
    'toyota-supra-2019':{title:'토요타 2019 일본 수프라 공식 제원표',url:'https://toyota.jp/pages/contents/carlineup/archive/supra/2019-05/pdf/supra_main_s_201905.pdf',observation:'RZ 3.0: 8단 스포츠 AT, 1~8단 기어비 및 종감속 3.154. 최고출력 5000rpm은 레드라인이 아니다.'},
    'toyota-supra-eu-2019-transmission':{title:'Toyota Europe May 2019 GR Supra press kit',url:'https://newsroom.toyota.eu/download/708620/2019-gr-supra-dpl-en-972889.pdf',observation:'PDF 32쪽 3.0 340 DIN hp: 8HP51 8단 스포츠 자동, 일본과 같은 단별 기어비. 변속기 계열 참고 근거이며 이 표의 종감속 3.150은 일본 사양에 적용하지 않는다.'},
    'toyota-supra-us-2020-crosscheck':{title:'Toyota USA 2020 Supra product information',url:'https://pressroom.toyota.com/2020-supra-product-supra/',observation:'2019년 발표한 미국 MY2020 3.0 8AT 표도 일본과 동일한 8개 기어비 및 종감속 3.154. 일본 원본 수치의 교차 확인에만 사용.'},
    'genesis-g80-au-2026-ratios':{title:'Genesis Australia MY2026 G80 specification sheet',url:'https://www.genesis.com/content/dam/genesis/au/en/bto-assets/admin/donwloader-center-management/g80/model-thumbnail/desktop/2026_Genesis_G80_Specification_Sheet.pdf',observation:'호주 2.5T RWD/3.5T AWD 1~8단 기어비, 종감속 3.909/3.727, 최고출력 5800rpm. 국내 전 구동 조합의 기어비 일치 및 레드라인은 미확인. 유럽판 6단 .832와도 구분한다.'},
    'genesis-g70-us-2019-ratios':{title:'Genesis Motor America: 2019 G70 Equipped To Compete',url:'https://www.prnewswire.com/news-releases/2019-genesis-g70-equipped-to-compete-300679294.html',observation:'제조사의 2019 미국 전기형 발표. 2.0T/3.3T 8AT 단별 기어비와 종감속 3.727/3.538, 최고출력 6200/6000rpm. 국내 기어비 일치는 미확인. 6MT 열을 사용하지 않고 국내 PS·질량은 변경하지 않는다.'},
    'kia-k5-us-2024-ratios':{title:'Kia America 2024 K5 specifications',url:'https://www.kiamedia.com/us/en/models/k5/2024/specifications',observation:'1.6T FWD 8AT의 단별 기어비와 종감속 3.367. AWD의 3.510 및 2.5T DCT와 구분. 국내 일치는 미확인.'},
    'kia-carnival-us-2025-ratios':{title:'Kia America 2025 Carnival specifications',url:'https://www.kiamedia.com/us/en/models/carnival/2025/specifications',observation:'3.5 가솔린 FWD 8AT의 단별 기어비와 종감속 3.510. 국내 일치는 미확인.'},
    'kia-carnival-hev-us-2025-ratios':{title:'Kia America 2025 Carnival HEV specifications',url:'https://www.kiamedia.com/us/en/models/carnival-hev/2025/specifications',observation:'1.6T HEV FWD 6AT의 단별 기어비와 종감속 3.648. 국내 일치는 미확인.'},
    'hyundai-santafe-au-mx5-ratios':{title:'Hyundai Australia Santa Fe MX5 specifications',url:'https://www.hyundai.com/content/dam/hyundai/au/en/models/santa-fe-ice/docs/Santa-Fe-MX5-Specification-Sheet.pdf',observation:'PDF 1–2쪽: G4KP 2.5T FWD/AWD 8DCT 단별 기어비, 두 종감속비 4.846/3.316. 국내 일치 및 이 표에 없는 단별 종감속 배정은 미확인.'},
    'hyundai-santafe-au-my21-final-drives':{title:'Hyundai Australia MY21 Santa Fe 8DCT final-drive assignments',url:'https://www.hyundai.com/content/dam/hyundai/au/en/models/santa-fe/docs/Hyundai_Santa-Fe_MY21_Specifications_Sheet_2021.pdf',observation:'2.2 디젤 8DCT 표: 동일 단별 비율에서 1/2/5/6단은 4.846, 3/4/7/8단은 3.316. MX5 2.5T의 배정에 참고 적용하며 동일 변속기 제어/국내 사양 검증을 뜻하지 않는다.'}
  });
  const ESTIMATED=freeze(['idleRPM','shiftRPM','maxRPM','total1stReduction','ratioStep']);
  // Warm, running-engine reference floors, not cold-start/accessory-load maps.
  // R2.2 uses the user's 830 rpm calibration. Other families remain estimates;
  // the HEV value applies while its engine is on, not to an EV-only stop.
  const idleModel=(rpm,status,condition)=>({rpm,status,condition,reviewedAt:'2026-10-21'});
  const IDLE_MODELS=freeze({
    gasoline:idleModel(750,'estimated','warm-engine-on'),
    lpg:idleModel(750,'estimated','warm-engine-on'),
    diesel:idleModel(800,'estimated','warm-engine-on'),
    r22:idleModel(830,'user-calibrated','warm-engine-on'),
    hybrid:idleModel(1000,'estimated','engine-on-reference'),
    electric:idleModel(0,'not-applicable','no-combustion-engine')
  });
  const R22_VARIANTS=new Set(['g70-2.2d-rwd','g70-2.2d-awd','staria-2.2d-fwd','staria-2.2d-awd']);
  const idleFor=(type,id)=>R22_VARIANTS.has(id)?IDLE_MODELS.r22:IDLE_MODELS[type]||IDLE_MODELS.gasoline;
  // User-supplied calibration ranges: MT .35–.55 s / zero drive torque;
  // DCT .08–.15 s / .70–.95 retained torque. The selected values, including
  // automatic-transmission values, are model assumptions, not measurements.
  const shiftAssumption=(family,upshiftDurationS,torqueRetention,calibration)=>({
    family,upshiftDurationS,torqueRetention,calibration,assumed:true,status:'estimated',reviewedAt:'2026-10-19'
  });
  const SHIFT_MODELS=freeze({
    manual:shiftAssumption('manual',.45,0,'manual'),
    dct:shiftAssumption('dual-clutch',.12,.85,'dual-clutch'),
    automatic:shiftAssumption('torque-converter',.25,.65,'general-automatic'),
    zf8hp51:shiftAssumption('torque-converter',.16,.80,'zf-8hp51'),
    hybrid:shiftAssumption('hybrid-step',.25,.65,'hybrid-automatic'),
    ivt:{family:'continuous',upshiftDurationS:0,torqueRetention:1,assumed:false,status:'not-applicable'},
    electric:{family:'single-speed',upshiftDurationS:0,torqueRetention:1,assumed:false,status:'not-applicable'},
    unknown:{family:'unknown',upshiftDurationS:0,torqueRetention:1,assumed:false,status:'unavailable'}
  });
  const profiles={};
  function add(vehicleId,variantIds,powertrainType,transmissionType,gearCount,sourceId,overrides={}){
    const electric=powertrainType==='electric';
    const label=transmissionType==='IVT'?'IVT':transmissionType==='EV'?'전기 구동':gearCount+transmissionType;
    for(const variantId of variantIds)profiles[variantId]={vehicleId,variantId,powertrainType,visible:!electric,transmissionType,gearCount,transmissionLabel:label,
      idleRPM:idleFor(powertrainType,variantId).rpm,idleModel:idleFor(powertrainType,variantId),shiftRPM:electric?0:6000,maxRPM:electric?0:7000,total1stReduction:electric?0:13.5,
      ratioStep:electric?null:({4:.66,5:.71,6:.75,8:.81}[gearCount]??null),
      ratioStatus:electric?'not-applicable':'estimated',gearRatios:null,finalDriveRatio:null,finalDriveRatios:null,rollingRadiusScale:1,
      estimatedFields:electric?[]:ESTIMATED,sourceIds:[sourceId],reviewedAt,verifiedFields:['powertrainType','transmissionType',...(gearCount===null?[]:['gearCount'])],...overrides};
  }
  add('ray',['ray-1.0-14','ray-1.0-15'],'gasoline','AT',4,'kia-ray');
  add('ray',['ray-ev'],'electric','EV',null,'kia-ray-ev');
  add('morning',['morning-1.0-14','morning-1.0-16'],'gasoline','AT',4,'kia-morning');
  add('avante',['avante-2.0-16','avante-2.0-18'],'gasoline','IVT',null,'hyundai-avante');
  add('avante_n',['avante-n-2.0t-dct'],'gasoline','DCT',8,'hyundai-avante-n-2021',{reviewedAt:'2026-10-19'});
  add('avante_n',['avante-n-2.0t-mt'],'gasoline','MT',6,'hyundai-avante-n-2021',{reviewedAt:'2026-10-19'});
  add('k5',['k5-2.0'],'gasoline','AT',6,'kia-k5');
  add('k5',['k5-1.6t'],'gasoline','AT',8,'kia-k5');
  add('k5',['k5-2.0lpg'],'lpg','AT',6,'kia-k5');
  add('k5',['k5-2.5t-gt'],'gasoline','DCT',8,'kia-k5-gt-us-2026',{reviewedAt:'2026-10-19'});
  add('k5',['k5-2.0hev'],'hybrid','AT',6,'kia-k5',{reviewedAt:'2026-10-19',drivenAxle:'front',sourceIds:['kia-k5','kia-k5-hev-az','hyundai-transys-hev-at']});
  add('carnival',['carnival-3.5'],'gasoline','AT',8,'kia-carnival');
  add('carnival',['carnival-1.6heV'],'hybrid','AT',6,'kia-carnival');
  add('g80',['g80-2.5t-rwd','g80-2.5t-awd','g80-3.5t-rwd','g80-3.5t-awd'],'gasoline','AT',8,'genesis-g80');
  add('ioniq5',['ioniq5-standard','ioniq5-long-rwd','ioniq5-long-awd'],'electric','EV',null,'hyundai-ioniq5');
  add('grandeur',['grandeur-2.5','grandeur-3.5-fwd','grandeur-3.5-awd'],'gasoline','AT',8,'hyundai-grandeur');
  add('santafe',['santafe-2.5t-fwd','santafe-2.5t-awd'],'gasoline','DCT',8,'hyundai-santafe');
  add('santafe',['santafe-1.6hev-fwd','santafe-1.6hev-awd'],'hybrid','AT',6,'hyundai-santafe-hev',{reviewedAt:'2026-10-19',sourceIds:['hyundai-santafe-hev','hyundai-transys-hev-at']});
  add('staria',['staria-lpg'],'lpg','AT',8,'hyundai-staria');
  add('musso_ev',['musso-ev-fwd','musso-ev-awd'],'electric','EV',null,'kgm-musso-ev');
  add('torres',['torres-1.5t-fwd','torres-1.5t-awd'],'gasoline','AT',8,'kgm-torres');
  add('porter2',['porter-lpg-mt'],'lpg','MT',6,'hyundai-porter',{shiftRPM:4000,maxRPM:5000});
  add('porter2',['porter-lpg-at'],'lpg','AT',5,'hyundai-porter',{shiftRPM:4000,maxRPM:5000});
  add('g70',['g70-2.0t-rwd','g70-2.0t-awd','g70-3.3t-rwd','g70-3.3t-awd'],'gasoline','AT',8,'genesis-g70-2019');
  add('supra',['supra-3.0t-rz'],'gasoline','AT',8,'toyota-supra-2019');
  add('bmw_m2',['bmw-m2-3.0t-dct'],'gasoline','DCT',7,'bmw-m2-2016-de',{reviewedAt:'2026-10-19'});
  add('bmw_m2',['bmw-m2-3.0t-mt'],'gasoline','MT',6,'bmw-m2-2016-de',{reviewedAt:'2026-10-19'});
  add('gr86',['gr86-2.4-rz-mt'],'gasoline','MT',6,'toyota-gr86-jp-2022',{reviewedAt:'2026-10-19'});
  add('gr86',['gr86-2.4-rz-at'],'gasoline','AT',6,'toyota-gr86-jp-2022',{reviewedAt:'2026-10-19'});
  // Archived diesel outputs/gear counts are sourced. These lower RPM schedules
  // and ratio progressions remain explicit simulation estimates, not petrol
  // ratios or claimed manufacturer shift/redline maps.
  const dieselOverrides=(ratedPowerRPM,extra={})=>({shiftRPM:4200,maxRPM:4800,ratioStep:.78,ratedPowerRPM,
    reviewedAt:'2026-10-19',verifiedFields:['powertrainType','transmissionType','gearCount','ratedPowerRPM'],...extra});
  add('porter2',['porter-diesel-mt'],'diesel','MT',6,'hyundai-porter-diesel-2020',dieselOverrides(3600,{shiftRPM:3800,maxRPM:4500,ratioStep:.75,drivenAxle:'rear',sourceIds:['hyundai-porter-diesel-2020','hyundai-porter-diesel-2020-price','hyundai-porter-a2-2020']}));
  add('porter2',['porter-diesel-at'],'diesel','AT',5,'hyundai-porter-diesel-2020',dieselOverrides(3600,{shiftRPM:3800,maxRPM:4500,ratioStep:.71,drivenAxle:'rear',sourceIds:['hyundai-porter-diesel-2020','hyundai-porter-diesel-2020-price','hyundai-porter-a2-2020']}));
  add('g70',['g70-2.2d-rwd','g70-2.2d-awd'],'diesel','AT',8,'genesis-g70-diesel-2019',dieselOverrides(3800,{drivenAxle:'rear',sourceIds:['genesis-g70-diesel-2019','genesis-g70-r-family']}));
  add('staria',['staria-2.2d-fwd','staria-2.2d-awd'],'diesel','AT',8,'hyundai-staria-diesel-2021',dieselOverrides(3800,{drivenAxle:'front',sourceIds:['hyundai-staria-diesel-2021','hyundai-staria-diesel-2021-catalog','hyundai-staria-r-family-au']}));
  add('carnival',['carnival-2.2d'],'diesel','AT',8,'kia-carnival-diesel-2024',dieselOverrides(3800,{drivenAxle:'front',sourceIds:['kia-carnival-diesel-2024','kia-carnival-smartstream-family']}));
  function applyRatios(ids, ratios, finalDrive, sourceId, status, ratedPowerRPM, shiftRPM, market, drivenAxle = 'rear') {
    const finalDriveRatios = Array.isArray(finalDrive) ? finalDrive : null;
    const finalDriveRatio = finalDriveRatios ? null : finalDrive;
    const ratioFields = ['gearRatios', finalDriveRatios ? 'finalDriveRatios' : 'finalDriveRatio', ...(ratedPowerRPM ? ['ratedPowerRPM'] : [])];
    for (const id of ids) {
      const p = profiles[id];
      Object.assign(p, { gearRatios: ratios, finalDriveRatio, finalDriveRatios, ratioStatus: status,
        ratioSourceId: sourceId, ratioMarket: market,
        ratedPowerRPM, shiftRPM, drivenAxle, rollingRadiusScale: .985,
        total1stReduction: ratios[0] * (finalDriveRatios?.[0] ?? finalDriveRatio), ratioStep: null,
        sourceIds: [...new Set([...p.sourceIds, sourceId])],
        verifiedFields: [...p.verifiedFields, ...(status === 'verified-exact-market' ? ratioFields : [])],
        referenceFields: status === 'reference-market' ? ratioFields : [],
        estimatedFields: ['idleRPM', 'shiftRPM', 'maxRPM', 'rollingRadiusScale', 'tunedFinalDriveScale', ...(status === 'reference-market' ? ['domesticRatioMatch'] : [])] });
    }
  }
  applyRatios(['g80-2.5t-rwd','g80-2.5t-awd'], [3.665,2.396,1.610,1.190,1,.826,.643,.556], 3.909, 'genesis-g80-au-2026-ratios', 'reference-market', 5800, 6200, 'AU');
  applyRatios(['g80-3.5t-rwd','g80-3.5t-awd'], [3.665,2.396,1.610,1.190,1,.826,.643,.556], 3.727, 'genesis-g80-au-2026-ratios', 'reference-market', 5800, 6200, 'AU');
  applyRatios(['g70-2.0t-rwd','g70-2.0t-awd'], [3.964,2.468,1.610,1.176,1,.832,.652,.565], 3.727, 'genesis-g70-us-2019-ratios', 'reference-market', 6200, 6500, 'US');
  applyRatios(['g70-3.3t-rwd','g70-3.3t-awd'], [3.665,2.396,1.610,1.190,1,.826,.643,.556], 3.538, 'genesis-g70-us-2019-ratios', 'reference-market', 6000, 6500, 'US');
  applyRatios(['supra-3.0t-rz'], [5.250,3.360,2.172,1.720,1.316,1,.822,.640], 3.154, 'toyota-supra-2019', 'verified-exact-market', 5000, 6500, 'JP');
  applyRatios(['bmw-m2-3.0t-dct'], [4.806,2.593,1.701,1.277,1,.844,.671], 3.462, 'bmw-m2-2016-de', 'verified-exact-market', 6500, 6500, 'DE');
  applyRatios(['bmw-m2-3.0t-mt'], [4.110,2.315,1.542,1.179,1,.846], 3.462, 'bmw-m2-2016-de', 'verified-exact-market', 6500, 6500, 'DE');
  applyRatios(['gr86-2.4-rz-mt'], [3.626,2.188,1.541,1.213,1,.767], 4.1, 'toyota-gr86-jp-2022', 'verified-exact-market', 7000, 7000, 'JP');
  applyRatios(['gr86-2.4-rz-at'], [3.538,2.060,1.404,1,.713,.582], 3.909, 'toyota-gr86-jp-2022', 'verified-exact-market', 7000, 7000, 'JP');
  for (const id of ['gr86-2.4-rz-mt','gr86-2.4-rz-at']) {
    profiles[id].maxRPM = 7500;
    profiles[id].maxRPMSourceId = 'toyota-gr86-eu-2022-engine';
    profiles[id].sourceIds.push('toyota-gr86-eu-2022-engine');
    profiles[id].referenceFields.push('maxRPM');
    profiles[id].estimatedFields = profiles[id].estimatedFields.filter(field => field !== 'maxRPM');
  }
  for (const id of ['bmw-m2-3.0t-dct','bmw-m2-3.0t-mt']) {
    // Same N55 engine's rev limit is published; the 6500 RPM shift schedule is not.
    profiles[id].sourceIds.push('bmw-m2-2016-uk-engine');
    profiles[id].maxRPMSourceId = 'bmw-m2-2016-uk-engine';
    profiles[id].referenceFields.push('maxRPM');
    profiles[id].estimatedFields = profiles[id].estimatedFields.filter(field => field !== 'maxRPM');
  }
  Object.assign(profiles['supra-3.0t-rz'], {
    transmissionFamily: 'ZF 8HP51', transmissionFamilySourceId: 'toyota-supra-eu-2019-transmission',
    referenceFields: ['transmissionFamily'],
    sourceIds: ['toyota-supra-2019', 'toyota-supra-eu-2019-transmission', 'toyota-supra-us-2020-crosscheck']
  });
  applyRatios(['k5-1.6t'], [4.717,2.906,1.864,1.423,1.224,1,.790,.635], 3.367, 'kia-k5-us-2024-ratios', 'reference-market', 5500, 6000, 'US', 'front');
  // The factory publishes both final drives but not the gear-to-shaft map.
  // This assignment produces descending total reductions; that is a modeling
  // assumption, not enough evidence to label the complete reduction verified.
  applyRatios(['k5-2.5t-gt'], [3.643,2.304,2.217,1.621,.884,.703,.791,.660], [4.077,4.077,2.944,2.944,4.077,4.077,2.944,2.944], 'kia-k5-gt-us-2026', 'estimated', 5800, 6200, 'US', 'front');
  Object.assign(profiles['k5-2.5t-gt'], {
    gearRatiosStatus: 'verified-exact-market', finalDriveValues: [4.077,2.944], finalDriveAssignmentStatus: 'estimated',
    verifiedFields: [...profiles['k5-2.5t-gt'].verifiedFields,'gearRatios','finalDriveValues','ratedPowerRPM'],
    estimatedFields: [...profiles['k5-2.5t-gt'].estimatedFields,'finalDriveRatios','finalDriveGearAssignment']
  });
  applyRatios(['carnival-3.5'], [4.808,2.901,1.864,1.424,1.219,1,.799,.648], 3.510, 'kia-carnival-us-2025-ratios', 'reference-market', 6400, 6500, 'US', 'front');
  applyRatios(['carnival-1.6heV'], [4.639,2.826,1.841,1.386,1,.772], 3.648, 'kia-carnival-hev-us-2025-ratios', 'reference-market', null, 6000, 'US', 'front');
  applyRatios(['santafe-2.5t-fwd','santafe-2.5t-awd'], [3.429,2.217,2.217,1.621,.860,.673,.791,.653], [4.846,4.846,3.316,3.316,4.846,4.846,3.316,3.316], 'hyundai-santafe-au-mx5-ratios', 'reference-market', 5800, 6000, 'AU', 'front');
  for (const id of ['santafe-2.5t-fwd','santafe-2.5t-awd']) {
    profiles[id].sourceIds.push('hyundai-santafe-au-my21-final-drives');
    profiles[id].estimatedFields.push('finalDriveGearAssignment');
  }
  applyRatios(['santafe-1.6hev-fwd','santafe-1.6hev-awd'], [4.639,2.826,1.841,1.386,1,.772], 3.510, 'hyundai-santafe-hev-au-ratios', 'reference-market', 5500, 6000, 'AU', 'front');
  applyRatios(['avante-n-2.0t-dct'], [3.714,2.261,2.174,1.621,.927,.767,.878,.698], [3.8,3.8,2.714,2.714,3.8,3.8,2.714,2.714], 'hyundai-avante-n-au-2021-ratios', 'reference-market', 6000, 6500, 'AU', 'front');
  applyRatios(['avante-n-2.0t-mt'], [3.083,1.931,1.696,1.276,1.027,.854], [4.154,4.154,3.176,3.176,3.176,3.176], 'hyundai-avante-n-au-2021-ratios', 'reference-market', 6000, 6500, 'AU', 'front');
  // A fixed motor-to-wheel reduction is separate from the hidden engine-gear
  // HUD contract. Both AWD motors have this same reduction, so the race can
  // retain the existing combined motor torque without multiplying it twice.
  for (const id of ['ioniq5-long-rwd','ioniq5-long-awd']) {
    Object.assign(profiles[id], {
      singleSpeedReduction: 2.263 * 4.706,
      reductionStatus: 'reference-market',
      reductionSourceId: 'hyundai-ioniq5-au-2026-reduction', reductionMarket: 'AU',
      sourceIds: [...profiles[id].sourceIds, 'hyundai-ioniq5-au-2026-reduction'],
      referenceFields: ['singleSpeedReduction'], estimatedFields: ['domesticReductionMatch']
    });
  }
  for(const p of Object.values(profiles)){
    const key=p.transmissionType==='MT'?'manual':p.transmissionType==='DCT'?'dct':
      p.transmissionType==='IVT'?'ivt':p.transmissionType==='EV'?'electric':
      p.transmissionType==='AT'?(p.powertrainType==='hybrid'?'hybrid':p.transmissionFamily==='ZF 8HP51'?'zf8hp51':'automatic'):'unknown';
    p.shiftModel=SHIFT_MODELS[key];
    if(p.shiftModel.assumed)p.estimatedFields=[...p.estimatedFields,'shiftModel'];
  }
  const PROFILES=freeze(profiles);
  // These are the exact baseline configurations in vehicle-specs.js, not the
  // first randomized variant. In particular its Carnival baseline is hybrid.
  const FALLBACKS=freeze({ray:'ray-1.0-15',morning:'morning-1.0-16',avante:'avante-2.0-18',k5:'k5-2.0',carnival:'carnival-1.6heV',
    g80:'g80-2.5t-rwd',ioniq5:'ioniq5-long-rwd',grandeur:'grandeur-2.5',santafe:'santafe-2.5t-fwd',staria:'staria-lpg',musso_ev:'musso-ev-fwd',torres:'torres-1.5t-fwd',porter2:'porter-lpg-at',g70:'g70-2.0t-rwd',supra:'supra-3.0t-rz',bmw_m2:'bmw-m2-3.0t-dct',avante_n:'avante-n-2.0t-dct',gr86:'gr86-2.4-rz-mt'});
  function unknown(vehicleId,variantId,spec){
    const electric=spec.electric===true||spec.powertrainType==='electric',type=electric?'electric':['hybrid','lpg','gasoline','diesel'].includes(spec.powertrainType)?spec.powertrainType:'gasoline';
    return freeze({vehicleId,variantId:variantId||null,powertrainType:type,visible:!electric,transmissionType:electric?'EV':'unknown',gearCount:null,transmissionLabel:electric?'전기 구동':'미확인',
      idleRPM:idleFor(type,null).rpm,idleModel:idleFor(type,null),shiftRPM:electric?0:6000,maxRPM:electric?0:7000,total1stReduction:electric?0:13.5,ratioStep:null,
      shiftModel:electric?SHIFT_MODELS.electric:SHIFT_MODELS.unknown,
      estimatedFields:electric?[]:ESTIMATED,sourceIds:[],reviewedAt:null,verifiedFields:[],match:'unknown'});
  }
  function resolve(car={}){
    if(typeof car==='string')car={vehicleId:car};
    const entrant=car.entrant||null,spec=entrant?.factorySpec||entrant?.spec||car.factorySpec||car.spec||{},vehicleId=entrant?.vehicleId||car.vehicleId||spec.id||null;
    const variantId=entrant?.variantId||car.variantId||null;
    if(variantId){const p=PROFILES[variantId];return p&&p.vehicleId===vehicleId?p:unknown(vehicleId,variantId,spec);}
    // An entrant without its identity is not a baseline car: its inherited
    // spec.variant text may describe another engine/gearbox. Do not guess it.
    if(entrant)return unknown(vehicleId,null,spec);
    if(spec.electric===true||spec.powertrainType==='electric'){
      const electricId=vehicleId==='ray'?'ray-ev':FALLBACKS[vehicleId],p=PROFILES[electricId];
      return p?.powertrainType==='electric'?p:unknown(vehicleId,null,spec);
    }
    return PROFILES[FALLBACKS[vehicleId]]||unknown(vehicleId,null,spec);
  }
  const api=freeze({resolve,PROFILES,FALLBACKS,SOURCES,SHIFT_MODELS,IDLE_MODELS,reviewedAt});
  root.PowertrainProfiles=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
