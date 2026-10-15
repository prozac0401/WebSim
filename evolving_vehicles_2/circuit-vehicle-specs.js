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
  root.CircuitVehicleSpecs = freeze({ ...shared, g70, supra });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CircuitVehicleSpecs;
})(typeof window !== 'undefined' ? window : globalThis);
