/* Circuit-only additions. The original simulator's specifications
 * retain their original object identities. See ADDITIONAL-VEHICLES.md for
 * model years, factory evidence, visual differences and estimated dynamics. */
(function (root) {
  'use strict';
  const shared = root.VehicleSpecs || (typeof require === 'function' ? require('../evolving_vehicles/vehicle-specs.js') : null);
  if (!shared) throw new Error('Load vehicle-specs.js before circuit-vehicle-specs.js.');
  const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const g70Source = 'https://www.auto-brochures.com/makes/genesis/G70/Genesis_int%20G70_2019.pdf';
  const supraSource = 'https://toyota.jp/pages/contents/carlineup/archive/supra/2019-05/pdf/supra_main_s_201905.pdf';
  const avanteNSource = 'https://www.hyundai.com/contents/repn-car/catalog/avante-n-price.pdf';
  const gr86Source = 'https://toyota.jp/pages/contents/carlineup/archive/gr86/2022-05/pdf/gr86_main_s_202205.pdf';
  // Nominal unloaded radii calculated from tyre markings, not rolling radii.
  const g70 = {
    variant: '2019 국내 2.0T RWD · 8AT · 18인치', modelYear: 2019, market: 'KR',
    lengthMm: 4685, widthMm: 1850, heightMm: 1400, wheelbaseMm: 2835,
    curbMassKg: 1595, powerPs: 252, torqueNm: 353.039, displacementCc: 1998,
    engine: '직렬 4기통 가솔린 터보', factoryDrive: 'rwd', powertrainType: 'gasoline', electric: false,
    frontTire: '225/45R18', rearTire: '225/45R18', frontTireRadiusMm: 329.85, rearTireRadiusMm: 329.85,
    transmissionType: 'AT', gearCount: 8, sourceUrl: g70Source,
    sourcePage: 'https://newsroom.genesis.com/genesis-g70-resets-expectations-of-customer-focused-performance-and-luxury/',
    sourceNote: '전기형 국내 2019 카탈로그 · 제조사 발행본의 보관 사본. 외형은 비공식 전기형 모델을 공용합니다.',
    driveVariants: { rwd: {}, awd: { variant: '2019 국내 2.0T AWD · 8AT · 18인치', curbMassKg: 1665 } },
    driveVerificationDate: '2026-10-15'
  };
  const supra = {
    variant: 'GR Supra 3.0T 8AT · 19인치', modelYear: 2019, market: 'JP',
    lengthMm: 4380, widthMm: 1865, heightMm: 1290, wheelbaseMm: 2470,
    curbMassKg: 1520, powerPs: 340, torqueNm: 500, displacementCc: 2997,
    engine: '직렬 6기통 가솔린 트윈스크롤 터보', factoryDrive: 'rwd', powertrainType: 'gasoline', electric: false,
    frontTire: '255/35ZR19', rearTire: '275/35ZR19', frontTireRadiusMm: 330.55, rearTireRadiusMm: 337.55,
    transmissionType: 'AT', gearCount: 8, sourceUrl: supraSource,
    sourcePage: 'https://toyotagazooracing.com/release/2019/other/0114-01/',
    factoryZeroTo100S: 4.3,
    sourceNote: '2019 일본 RZ 순정 주행 제원 · 비공식 A90 외형으로 모델 연식·휠 세부는 다를 수 있습니다.',
    driveVariants: { rwd: {} }, driveVerificationDate: '2026-10-15'
  };
  const bmw_m2 = {
    variant: '2016 독일 F87 3.0T RWD · 7DCT · 19인치', modelYear: 2016, market: 'DE',
    lengthMm: 4468, widthMm: 1854, heightMm: 1410, wheelbaseMm: 2693,
    curbMassKg: 1520, massStandard: 'DIN', powerPs: 370, torqueNm: 465, displacementCc: 2979,
    engine: '직렬 6기통 가솔린 트윈스크롤 터보', engineFamily: 'N55',
    factoryDrive: 'rwd', powertrainType: 'gasoline', electric: false,
    frontTire: '245/35ZR19', rearTire: '265/35ZR19', frontTireRadiusMm: 327.05, rearTireRadiusMm: 334.05,
    frontTrackMm: 1579, rearTrackMm: 1601, dragCoefficient: .35, frontalAreaM2: 2.21,
    transmissionType: 'DCT', gearCount: 7, differential: 'Active M Differential',
    sourceUrl: 'https://www.press.bmwgroup.com/bulgaria/article/attachment/T0238670BG/332713',
    sourcePage: 'https://www.press.bmwgroup.com/united-kingdom/article/detail/T0238509EN_GB/the-new-bmw-m2',
    factoryZeroTo100S: 4.3, factoryTopSpeedKph: 250,
    sourceNote: '2016 전기형 F87 · BMW 10/2015 ACEA·독일 제원 · DIN 질량(운전자 제외), 일반 토크 465 Nm. EU 질량·일시 오버부스트·Competition 사양을 혼합하지 않습니다.',
    driveVariants: { rwd: {} }, driveVerificationDate: '2026-10-19'
  };
  const avante_n = {
    variant: '2021 국내 2.0T FWD · 8DCT · 19인치', modelYear: 2021, market: 'KR',
    lengthMm: 4675, widthMm: 1825, heightMm: 1415, wheelbaseMm: 2720,
    curbMassKg: 1485, powerPs: 280, torqueNm: 392.266, displacementCc: 1998,
    engine: '직렬 4기통 가솔린 터보', factoryDrive: 'fwd', powertrainType: 'gasoline', electric: false,
    differential: 'eLSD', frontTire: '245/35ZR19', rearTire: '245/35ZR19',
    frontTireRadiusMm: 327.05, rearTireRadiusMm: 327.05,
    transmissionType: 'DCT', gearCount: 8, sourceUrl: avanteNSource,
    sourcePage: 'https://www.hyundai.com/kr/ko/brand/brandstory/model/avante-history/2021-avante-n',
    sourceNote: '2021 국내 CN7 아반떼 N 출시 사양 · 기본 280 PS, NGS 일시 출력 증대는 적용하지 않습니다. eLSD 제어·변속 지연은 별도로 모사하지 않습니다.',
    driveVariants: { fwd: {} }, driveVerificationDate: '2026-10-19'
  };
  const gr86 = {
    variant: '2022 일본 RZ 2.4 RWD · 6MT · 18인치', modelYear: 2022, market: 'JP',
    lengthMm: 4265, widthMm: 1775, heightMm: 1310, roofHeightMm: 1280, wheelbaseMm: 2575,
    curbMassKg: 1270, powerPs: 235, torqueNm: 250, displacementCc: 2387,
    engine: '수평대향 4기통 가솔린 자연흡기', engineFamily: 'FA24',
    factoryDrive: 'rwd', powertrainType: 'gasoline', electric: false, differential: 'Torsen LSD',
    frontTire: '215/40R18', rearTire: '215/40R18', frontTireRadiusMm: 314.6, rearTireRadiusMm: 314.6,
    frontTrackMm: 1520, rearTrackMm: 1550, transmissionType: 'MT', gearCount: 6,
    sourceUrl: gr86Source, sourcePage: 'https://toyota.jp/carlineup/archive/gr86/',
    sourceNote: '2022년 5월 일본 RZ 제원 · 235 PS·250 Nm, 6MT 1270 kg/6AT 1290 kg. 국내 231 PS·MT 전용 사양과 혼합하지 않습니다. Torsen 차동제어·클러치 조작·변속 지연은 별도로 모사하지 않습니다.',
    driveVariants: { rwd: {} }, driveVerificationDate: '2026-10-19'
  };
  root.CircuitVehicleSpecs = freeze({ ...shared, g70, supra, bmw_m2, avante_n, gr86 });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CircuitVehicleSpecs;
})(typeof window !== 'undefined' ? window : globalThis);
