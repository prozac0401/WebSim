/* Stock-only RWD catalogue for the drift experiment.
 * Original EV2 specifications are read, never rewritten or upgraded.
 * Manufacturer values, reference-market ratios and model assumptions remain
 * distinct; see RESOURCES.md. Angles are radians and SI units are used below. */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const STOCK = root.TuningEvolution || (isNode ? require('../evolving_vehicles_2/tuning-evolution.js') : null);
  const POWERTRAIN = root.PowertrainProfiles || (isNode ? require('../evolving_vehicles_2/powertrain-profiles.js') : null);
  if (!STOCK || !POWERTRAIN) throw new Error('Load TuningEvolution and PowertrainProfiles before DriftCatalog.');

  const DEFAULT_ID = 'supra-3.0t-rz';
  const PS_WATTS = 735.49875;
  const DEG = Math.PI / 180;
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const SUPRA_SOURCE = 'https://toyota.jp/pages/contents/carlineup/archive/supra/2019-05/pdf/supra_main_s_201905.pdf';

  function gearing(spec, profile) {
    if (spec.electric) {
      return {
        gearRatios: [1], finalDrive: profile.singleSpeedReduction || spec.reduction || 9,
        finalDriveRatios: null,
        gearingStatus: profile.reductionStatus || 'estimated',
        gearingMarket: profile.reductionMarket || null
      };
    }
    if (profile.gearRatios) {
      return {
        gearRatios: [...profile.gearRatios],
        finalDrive: profile.finalDriveRatio || profile.finalDriveRatios[0],
        finalDriveRatios: profile.finalDriveRatios ? [...profile.finalDriveRatios] : null,
        gearingStatus: profile.ratioStatus, gearingMarket: profile.ratioMarket || null
      };
    }
    // Preserve the existing fallback's TOTAL ratios. A final-drive value of 1
    // is a bookkeeping decomposition, not a claimed factory differential ratio.
    const count = profile.gearCount || 5, first = profile.total1stReduction || spec.reduction || 13.5;
    const step = profile.ratioStep || .71;
    return {
      gearRatios: Array.from({ length: count }, (_, index) => first * step ** index),
      finalDrive: 1, finalDriveRatios: null,
      gearingStatus: 'estimated', gearingMarket: null
    };
  }

  function torquePoints(variant, profile, peakPowerW) {
    const spec = variant.spec, peak = spec.torqueNm;
    const cap = (rpm, requested) => ({
      rpm, torqueNm: Math.max(0, Math.min(peak, requested, rpm > 0 ? peakPowerW * 60 / (2 * Math.PI * rpm) : peak))
    });
    if (spec.electric) {
      const baseRPM = peakPowerW * 60 / (2 * Math.PI * peak);
      return [cap(0, peak), cap(baseRPM, peak), cap(10000, peak), cap(16000, peak)];
    }
    if (variant.id === DEFAULT_ID) {
      // Only the 1600–4500 rpm plateau and 5000 rpm peak-power point are
      // manufacturer anchors. Idle, intermediate and upper-range shape are estimates.
      return [cap(0, 0), cap(900, peak * .42), cap(1600, peak), cap(4500, peak),
        cap(5000, peak), cap(6000, peakPowerW * .96 * 60 / (2 * Math.PI * 6000)),
        cap(7000, peakPowerW * .82 * 60 / (2 * Math.PI * 7000))];
    }
    if (variant.vehicleId === 'bmw_m2') {
      // F87 N55 normal output; the temporary 500 Nm overboost is excluded.
      return [cap(0, 0), cap(profile.idleRPM, peak * .42), cap(1400, peak),
        cap(5560, peak), cap(6500, peak), cap(7000, peakPowerW * .82 * 60 / (2 * Math.PI * 7000))];
    }
    if (variant.vehicleId === 'gr86') {
      // Naturally aspirated FA24: only the peak torque/power RPM are official
      // anchors. Do not give this engine the fallback turbo torque plateau.
      return [cap(0, 0), cap(profile.idleRPM, peak * .42), cap(3700, peak),
        cap(7000, peak), cap(7500, peakPowerW * .82 * 60 / (2 * Math.PI * 7500))];
    }
    const idle = profile.idleRPM || 900;
    const rated = profile.ratedPowerRPM || (variant.vehicleId === 'porter2' ? 3800 : 5800);
    const limit = profile.maxRPM || 7000;
    const plateauStart = variant.vehicleId === 'porter2' ? 1500 : 1800;
    const plateauEnd = Math.min(rated * .72, peakPowerW * 60 / (2 * Math.PI * peak) * .95);
    return [cap(0, 0), cap(idle, peak * .42), cap(plateauStart, peak),
      cap(Math.max(plateauStart + 100, plateauEnd), peak), cap(rated, peak),
      cap(limit, peakPowerW * .82 * 60 / (2 * Math.PI * limit))];
  }

  function make(variant) {
    const spec = variant.spec;
    const profile = POWERTRAIN.resolve({ vehicleId: variant.vehicleId, variantId: variant.id, spec });
    const gears = gearing(spec, profile);
    const electric = spec.electric === true;
    const peakPowerW = spec.powerPs * PS_WATTS;
    const isSupra = variant.id === DEFAULT_ID;
    const isM2 = variant.vehicleId === 'bmw_m2', isGR86 = variant.vehicleId === 'gr86';
    const verifiedDifferential = isSupra || isM2 || isGR86;
    const officialAnchors = isSupra || isM2 || isGR86;
    const limitations = [
      '출력·토크·질량·구동계·타이어 규격은 기존 순정 사양을 그대로 사용하며 성능 보정과 튜닝은 없습니다.',
      '무게배분·무게중심·타이어 힘 특성·회전 관성·조향 한계와 속도는 모델 추정값입니다.',
      '순정 ESC/TCS·자동변속기·차동장치의 실제 제어 맵을 재현한 차량 인증 모형은 아닙니다.'
    ];
    if (gears.gearingStatus === 'reference-market') limitations.push('기어비/감속비는 다른 시장의 공식 참고값이며 선택한 국내 사양과의 동일성은 미확인입니다.');
    if (gears.gearingStatus === 'estimated') limitations.push('이 사양의 기어비/감속비는 미확인으로 기존 모형의 총감속비 추정값을 사용합니다.');
    limitations.push(isSupra
      ? '1600–4500 rpm 최대토크 구간과 5000 rpm 최고출력은 일본 공식값입니다. 나머지 전부하 곡선과 부분부하·응답은 추정입니다.'
      : isM2
        ? '2016 F87의 일반 토크 465 Nm@1400–5560 rpm과 최고출력 6500 rpm을 사용합니다. 500 Nm 일시 오버부스트는 적용하지 않으며 나머지 곡선·응답은 추정입니다.'
        : isGR86
          ? '일본 2022 RZ의 최대토크 250 Nm@3700 rpm과 최고출력 235 PS@7000 rpm을 사용합니다. 국내 231 PS 사양과 구분하며 나머지 곡선·응답은 추정입니다.'
          : '전부하 토크곡선의 형태와 부분부하·응답은 최고출력·최대토크를 넘지 않도록 구성한 추정값입니다.');
    limitations.push(verifiedDifferential
      ? (isGR86 ? 'Torsen LSD' : isM2 ? 'Active M Differential' : '액티브 디퍼렌셜') + ' 장착은 해당 시장 공식 장비표에서 확인했습니다. 모형은 공통 차동제한 근사를 사용하며 실제 토크 배분·잠금 특성·ECU 맵을 재현하지 않습니다.'
      : '정확한 출고 사양의 차동제한 장치와 제어 상태는 미확인입니다. 모델은 오픈 디퍼렌셜을 가정하며 임의의 LSD를 추가하지 않습니다.');
    if (isM2 || isGR86) limitations.push('기존 EV2의 공회전 관측·참고값을 유지합니다. RPM 상한은 같은 세대 해외 제조사 자료의 참고값이고 변속 시점·손실은 추정입니다. 클러치 조작·변속 지연은 이 드리프트 모형에서 별도로 해석하지 않습니다.');
    if (variant.vehicleId === 'porter2') limitations.push('포터 II의 후륜 복륜·서스펜션과 전복 거동은 단순화됩니다. 차종별 실차 드리프트 가능성을 검증한 결과가 아닙니다.');
    if (electric) limitations.push('모터 회전수 상한과 토크-속도 곡선은 추정이며 배터리 충전율·열에 의한 출력 제한은 재현하지 않습니다.');

    const physics = {
      massKg: spec.massKg,
      wheelbaseM: spec.wheelbaseM || spec.wheelbaseMm / 1000,
      lengthM: spec.lengthMm / 1000, widthM: spec.widthMm / 1000,
      frontWeightFraction: spec.frontWeightFraction, cgHeightM: spec.cgHeightM,
      tireRadius: spec.rearTireRadiusMm / 1000,
      peakTorque: spec.torqueNm, peakPowerW,
      ...gears,
      maxSteer: 35 * DEG, steerRate: 120 * DEG,
      diffType: isGR86 ? 'torsen-lsd' : verifiedDifferential ? 'active-lsd' : 'open',
      differentialStatus: verifiedDifferential ? 'verified-hardware-estimated-control' : 'unverified-open-assumption',
      torqueCurve: torquePoints(variant, profile, peakPowerW),
      torqueCurveStatus: officialAnchors ? 'official-anchors-estimated-shape' : 'estimated',
      electric, powertrainType: spec.powertrainType,
      idleRPM: electric ? 0 : profile.idleRPM || 900,
      maxRPM: electric ? 16000 : profile.maxRPM || 7000,
      shiftRPM: electric ? 0 : profile.shiftRPM || 6000,
      gripCoefficient: spec.gripG, brakeAcceleration: spec.brakeG * 9.80665,
      dragArea: spec.dragArea, efficiency: spec.efficiency || (electric ? .91 : .83),
      topSpeedMps: spec.topSpeedMps,
      sourceUrl: variant.sourceUrl || spec.sourceUrl, limitations
    };
    const sources = [
      { title: '기존 순정 제원', url: physics.sourceUrl, status: 'inherited-stock-record', verifiedAt: variant.verifiedAt },
      ...profile.sourceIds.map(id => ({ ...POWERTRAIN.SOURCES[id], id, status: id === profile.ratioSourceId ? profile.ratioStatus : 'reference' }))
    ];
    if (isSupra) sources.push({ title: '2019 일본 RZ 토크 범위·기어비·액티브 디퍼렌셜', url: SUPRA_SOURCE, status: 'verified-exact-market', verifiedAt: '2026-10-28' });
    return freeze({
      id: variant.id, variantId: variant.id, vehicleId: variant.vehicleId,
      label: spec.name + ' · ' + variant.label,
      modelYear: spec.modelYear || null, market: spec.market || 'KR',
      spec, factorySpec: spec, physics, ...physics,
      profile, sources,
      provenance: {
        stock: 'EV2 VARIANTS immutable factory specification',
        derivedFields: ['wheelbaseM', 'lengthM', 'widthM', 'tireRadius', 'peakPowerW'],
        estimatedFields: ['frontWeightFraction', 'cgHeightM', 'maxSteer', 'steerRate', 'torqueCurve', 'idleRPM', 'maxRPM', 'shiftRPM', 'efficiency', 'gripCoefficient', 'brakeAcceleration'],
        nominalTireRadius: true,
        stockVerifiedAt: variant.verifiedAt,
        catalogReviewedAt: '2026-10-28'
      }
    });
  }

  const entries = freeze(Object.values(STOCK.VARIANTS).flat()
    .filter(variant => variant.spec.factoryDrive === 'rwd').map(make));
  const lookup = new Map(entries.map(entry => [entry.id, entry]));
  if (!lookup.has(DEFAULT_ID)) throw new Error('The stock RWD Supra default is missing.');
  function list() { return entries.slice(); }
  function get(id = DEFAULT_ID) {
    const entry = lookup.get(id);
    if (!entry) throw new RangeError('Unknown stock RWD variant: ' + id);
    return entry;
  }
  const api = freeze({ list, get, DEFAULT_ID, PS_WATTS });
  root.DriftCatalog = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
