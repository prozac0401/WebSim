/* Visual-only vehicle markings inspired by Korean road vehicles. */
(function (root) {
  'use strict';
  root.VehicleLiveries = Object.freeze([
    { id: 'none', label: '순정 · 데칼 없음', styles: null },
    { id: 'seoul_taxi', label: '서울 해치택시', styles: ['k5'], roof: true },
    { id: 'tow_service', label: '긴급 견인', styles: ['rexton_tow', 'starex_tow'] },
    { id: 'personal_taxi', label: '개인택시', styles: ['avante', 'k5', 'grandeur', 'ioniq5'], roof: true },
    { id: 'premium_taxi', label: '모범택시', styles: ['grandeur', 'g80'], roof: true },
    { id: 'ev_taxi', label: '전기택시', styles: ['ioniq5'], roof: true },
    { id: 'van_taxi', label: '대형택시', styles: ['staria', 'carnival'], roof: true },
    { id: 'kakao_taxi', label: '카카오 T 택시', styles: ['avante', 'k5', 'grandeur', 'ioniq5', 'staria', 'carnival'], roof: true },
    { id: 'delivery', label: '배송 · 용달', styles: ['ray', 'morning', 'porter2'] },
    { id: 'camping', label: '주말 캠핑', styles: ['musso_ev', 'santafe', 'torres'] }
  ]);
  // Coordinates are fractions of the right-facing, visible photographic bounds.
  // Door panels intentionally stay below the glass and between the wheel arches.
  root.VehicleLiveryGeometry = Object.freeze({
    ray: { panel: [.28, .49, .43, .22], roof: [.52, .035] },
    avante: { panel: [.34, .50, .36, .21], roof: [.51, .035], spoiler: [.025, .28] },
    staria: { panel: [.30, .47, .43, .24], roof: [.54, .055] },
    musso_ev: { panel: [.42, .46, .31, .23], roof: [.58, .025] },
    ioniq5: { panel: [.30, .48, .41, .24], roof: [.52, .06], spoiler: [.095, .095], roofSpoiler: true },
    santafe: { panel: [.33, .47, .36, .23], roof: [.52, .035] },
    morning: { panel: [.29, .50, .38, .22], roof: [.52, .025], spoiler: [.105, .085], roofSpoiler: true },
    k5: { panel: [.34, .49, .36, .22], roof: [.51, .035], kakaoRoof: [.42, .035], spoiler: [.028, .265] },
    grandeur: { panel: [.32, .49, .37, .20], roof: [.51, .035], spoiler: [.05, .35] },
    carnival: { panel: [.32, .45, .40, .23], roof: [.54, .045] },
    g80: { panel: [.30, .49, .37, .21], roof: [.51, .03], spoiler: [.025, .32] },
    torres: { panel: [.33, .46, .36, .23], roof: [.52, .03] },
    rexton_tow: { panel: [.37, .43, .30, .25], roof: [.44, .025] },
    starex_tow: { panel: [.34, .46, .35, .23], roof: [.46, .025] },
    porter2: { panel: [.04, .49, .37, .17], roof: [.77, .015] }
  });
})(typeof window !== 'undefined' ? window : globalThis);
