/* Spa's published 2026 distance/altitude markers, page 3 of the circuit's
 * official access plan. Only the bundled, correctly aligned 7004 m layout is
 * eligible. Values between markers are a monotone cubic estimate, not a road
 * survey, and the published 17% local maximum is deliberately not imposed.
 */
(function (root) {
  'use strict';
  const LENGTH = 7004;
  const stations = Object.freeze([
    [0, 418], [220, 424], [310, 419], [690, 403], [890, 391], [1130, 415],
    [1490, 446], [2200, 463], [2470, 470], [2870, 455], [3110, 438],
    [3600, 402], [4280, 377], [4740, 375], [5100, 373], [5700, 388],
    [6000, 398], [6540, 408], [7004, 418]
  ].map(Object.freeze));
  const metadata = Object.freeze({
    id: 'spa-official-access-plan-2026', method: 'periodic-monotone-cubic', stationCount: 18,
    source: 'Circuit de Spa-Francorchamps · 2026 공식 거리·고도 표기',
    sourceUrl: 'https://www.spa-francorchamps.be/assets/e70cff50-ae5d-4aaa-896b-54c8a953a357/all-plan-acces.pdf',
    sourcePage: 3, retrievedOn: '2026-10-15', distanceOrigin: 'official-start-line',
    note: '공식 지도 18개 측점과 종점의 고도를 보존한 보간입니다. 측점 사이의 노면 경사·캠버는 추정이며 최대 17% 경사를 강제하지 않습니다.'
  });
  const count = stations.length - 1;
  const slopes = Array.from({ length: count }, (_, i) => {
    const previous = (i + count - 1) % count, next = (i + 1) % count;
    const h0 = i ? stations[i][0] - stations[previous][0] : LENGTH - stations[previous][0];
    const h1 = next ? stations[next][0] - stations[i][0] : LENGTH - stations[i][0];
    const d0 = (stations[i][1] - stations[previous][1]) / h0;
    const d1 = (stations[next][1] - stations[i][1]) / h1;
    if (d0 * d1 <= 0) return 0;
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / d0 + w1 / d1);
  });
  function sample(distance) {
    if (!Number.isFinite(distance)) throw new TypeError('distance must be finite.');
    const s = ((distance % LENGTH) + LENGTH) % LENGTH;
    let i = 0;
    while (i + 1 < count && s > stations[i + 1][0]) i++;
    const a = stations[i], b = stations[i + 1], h = b[0] - a[0], t = (s - a[0]) / h, t2 = t * t, t3 = t2 * t;
    const m0 = slopes[i], m1 = slopes[(i + 1) % count];
    const elevation = (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * h * m1;
    const grade = ((6 * t2 - 6 * t) * a[1] + (-6 * t2 + 6 * t) * b[1]) / h + (3 * t2 - 4 * t + 1) * m0 + (3 * t2 - 2 * t) * m1;
    return { elevation, grade, s };
  }
  function forCircuit(circuit) {
    // Prevent a user-imported circuit with the same name/id from receiving a
    // profile whose origin and direction belong to a different geometry.
    if (circuit?.id !== 'spa' || circuit.sourceProfile !== 'f1-circuits' || circuit.lengthM !== LENGTH ||
        circuit.sourceRevision !== '394d8fbe70ef2c0b0c8d23ff7bee61fa09606055' ||
        circuit.coordinates?.[0]?.[0] !== 5.96502 || circuit.coordinates?.[0]?.[1] !== 50.444251 ||
        !(circuit.coordinates?.[1]?.[0] < 5.96502 && circuit.coordinates?.[1]?.[1] > 50.444251)) return null;
    return { sample, metadata };
  }
  const api = { stations, sample, metadata, forCircuit };
  root.SpaElevationProfile = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
