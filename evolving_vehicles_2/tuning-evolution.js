/* One-make, cost-constrained tuning search. Factory combinations are selected
 * as whole, sourced presets; engines, driven wheels and masses are never mixed.
 * Costs, compensation, aero, grip, balance and tuning gains are model rules,
 * not manufacturer tuning products or validated real lap-time predictions.
 * See VARIANTS.md for provenance and the exact accounting model. */
(function (root) {
  'use strict';
  const SHARED = root.CircuitVehicleSpecs || (typeof require === 'function' ? require('./circuit-vehicle-specs.js') : root.VehicleSpecs);
  if (!SHARED) throw new Error('Load vehicle-specs.js before tuning-evolution.js.');
  const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = value => Math.round(value * 1000) / 1000;
  const nm = value => round(value * 9.80665);
  const STAGE_COSTS = [3, 5, 7, 10, 14, 18];
  const CATEGORIES = freeze([
    { id: 'acceleration', label: '가속력', stageCosts: [...STAGE_COSTS], description: '출력·토크와 저속 감속비 향상' },
    { id: 'topSpeed', label: '최고속도', stageCosts: [...STAGE_COSTS], description: '고속 출력·기어비와 공기저항 개선' },
    { id: 'brakes', label: '브레이크', stageCosts: [...STAGE_COSTS], description: '제동계 용량 향상 · 접지 한계 적용' },
    { id: 'grip', label: '다운포스·그립', stageCosts: [...STAGE_COSTS], description: '타이어·차고·공력 개선 · 항력·무게 증가' }
  ]);
  const KEYS = CATEGORIES.map(category => category.id);
  // name, drag area, grip g, brake g, estimated front fraction, CG m, width mm,
  // estimated track width m, modeled gearing speed cap km/h.
  const MODEL_ROWS = {
    ray: ['기아 레이', .91, .76, .82, .62, .67, 1595, 1.41, 150],
    avante: ['현대 아반떼', .64, .92, .94, .60, .51, 1855, 1.63, 205],
    staria: ['현대 스타리아', 1.12, .76, .85, .60, .80, 1995, 1.73, 195],
    musso_ev: ['KGM 무쏘 EV', 1.02, .80, .88, .53, .60, 1920, 1.64, 175],
    ioniq5: ['현대 아이오닉 5', .76, .93, .95, .48, .48, 1890, 1.64, 185],
    santafe: ['현대 싼타페', .96, .85, .91, .59, .68, 1900, 1.65, 210],
    morning: ['기아 모닝', .69, .85, .88, .63, .53, 1595, 1.40, 160],
    k5: ['기아 K5', .66, .94, .96, .60, .52, 1860, 1.62, 210],
    grandeur: ['현대 그랜저', .70, .92, .95, .60, .53, 1880, 1.63, 225],
    carnival: ['기아 카니발', 1.04, .79, .86, .61, .72, 1995, 1.74, 205],
    g80: ['제네시스 G80', .72, .98, 1.00, .52, .53, 1925, 1.63, 240],
    torres: ['KGM 토레스', .97, .83, .89, .60, .69, 1890, 1.61, 190],
    porter2: ['현대 포터 II', 1.14, .68, .76, .65, .79, 1740, 1.40, 150],
    g70: ['제네시스 G70 (전기형)', .66, 1.00, 1.05, .52, .49, 1850, 1.61, 240],
    supra: ['토요타 GR 수프라 A90', .62, 1.04, 1.12, .50, .45, 1865, 1.60, 250]
  };
  const SOURCE = {
    ray: 'https://www.kia.com/kr/vehicles/ray/specification',
    morning: 'https://www.kia.com/kr/vehicles/morning/specification',
    k5: 'https://www.kia.com/kr/vehicles/k5/specification',
    carnival: 'https://www.kia.com/kr/vehicles/carnival/specification',
    g80: 'https://www.genesis.com/kr/en/models/luxury-sedan-genesis/g80/specs.html',
    avante: 'https://www.hyundai.com/contents/repn-car/catalog/spec/avante-27fc-spec.pdf',
    ioniq5: 'https://www.hyundai.com/contents/repn-car/catalog/spec/ioniq5-27my-spec.pdf',
    grandeur: 'https://www.hyundai.com/contents/repn-car/catalog/spec/grandeur-27fl-spec.pdf',
    staria: 'https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/intro',
    santafe: 'https://www.hyundai.com/kr/ko/e/vehicles/santafe/intro',
    musso_ev: 'https://www.kg-mobility.com/pr/model/show-room/200000100030003',
    torres: 'https://www.kg-mobility.com/pr/model/show-room/200000100010001',
    porter2: 'https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf',
    g70: SHARED.g70.sourceUrl,
    supra: SHARED.supra.sourceUrl
  };
  function preset(vehicleId, id, label, cc, engine, drive, powerPs, torqueNm, massKg, overrides = {}) {
    const [name, dragArea, gripG, brakeG, front, cg, widthMm, trackWidthM, capKph] = MODEL_ROWS[vehicleId];
    const shared = SHARED[vehicleId];
    const electric = cc === null;
    const frontWeightFraction = overrides.frontWeightFraction ?? (drive === 'awd' ? front - .015 : front);
    const spec = {
      ...shared, name, label: name, id: vehicleId, variant: label, engine, displacementCc: cc,
      factoryDrive: drive, powerPs, torqueNm, massKg, curbMassKg: massKg, electric,
      powertrainType: electric ? 'electric' : engine.includes('하이브리드') ? 'hybrid' : engine.includes('LPG') ? 'lpg' : 'gasoline',
      dragArea, gripG, brakeG, frontWeightFraction, weightFront: frontWeightFraction,
      cgHeightM: cg, widthMm, trackWidthM, wheelbaseM: shared.wheelbaseMm / 1000,
      downforceArea: 0, topSpeedMps: capKph / 3.6, reduction: electric ? 9 : 13.5,
      sourceUrl: SOURCE[vehicleId], sourceNote: '국내 출고 조합 · 질량배분·무게중심·접지·공력·속도상한은 모형 추정값',
      modeledFields: ['frontWeightFraction', 'weightFront', 'cgHeightM', 'trackWidthM', 'gripG', 'brakeG', 'dragArea', 'downforceArea', 'topSpeedMps', 'reduction'],
      ...overrides
    };
    spec.weightFront = spec.frontWeightFraction;
    spec.wheelbaseM = spec.wheelbaseMm / 1000;
    return { id, vehicleId, label, sourceUrl: spec.sourceUrl, verifiedAt: shared.driveVerificationDate || '2026-10-14', spec };
  }
  const VARIANTS = freeze({
    ray: [
      preset('ray', 'ray-1.0-14', '1.0 가솔린 FWD · 14인치', 998, '직렬 3기통 가솔린', 'fwd', 76, nm(9.7), 1085),
      preset('ray', 'ray-1.0-15', '1.0 가솔린 FWD · 15인치', 998, '직렬 3기통 가솔린', 'fwd', 76, nm(9.7), 1090),
      preset('ray', 'ray-ev', 'EV FWD · 35.2 kWh', null, '전륜 단일 전기모터', 'fwd', round(64.3 / .73549875), 147, 1295, { sourceUrl: 'https://www.kia.com/kr/vehicles/ray-ev/specification', heightMm: 1710, batteryKwh: 35.2, frontWeightFraction: .56, cgHeightM: .55 })
    ],
    morning: [
      preset('morning', 'morning-1.0-14', '1.0 가솔린 FWD · 14인치', 998, '직렬 3기통 가솔린', 'fwd', 76, nm(9.7), 975),
      preset('morning', 'morning-1.0-16', '1.0 가솔린 FWD · 16인치', 998, '직렬 3기통 가솔린', 'fwd', 76, nm(9.7), 1010)
    ],
    avante: [
      preset('avante', 'avante-2.0-16', '2.0 가솔린 FWD · 16인치', 1999, '직렬 4기통 가솔린', 'fwd', 149, nm(18.3), 1350),
      preset('avante', 'avante-2.0-18', '2.0 가솔린 FWD · 18인치', 1999, '직렬 4기통 가솔린', 'fwd', 149, nm(18.3), 1400)
    ],
    k5: [
      preset('k5', 'k5-2.0', '2.0 가솔린 FWD · 16인치', 1999, '직렬 4기통 가솔린', 'fwd', 160, nm(20), 1425),
      preset('k5', 'k5-1.6t', '1.6 터보 FWD · 17인치', 1598, '직렬 4기통 가솔린 터보', 'fwd', 180, nm(27), 1450, { topSpeedMps: 220 / 3.6 }),
      preset('k5', 'k5-2.0lpg', '2.0 LPG FWD · 16인치', 1999, '직렬 4기통 LPG', 'fwd', 146, nm(19.5), 1445)
    ],
    carnival: [
      preset('carnival', 'carnival-3.5', '3.5 가솔린 FWD · 9인승 18인치', 3470, 'V6 가솔린', 'fwd', 294, nm(36.2), 2080, { heightMm: 1775 }),
      preset('carnival', 'carnival-1.6heV', '1.6 터보 HEV FWD · 9인승 18인치', 1598, '직렬 4기통 터보 하이브리드', 'fwd', 245, nm(37.4), 2155, { heightMm: 1785, frontWeightFraction: .59, cgHeightM: .69, sourceNote: '출력·토크는 공식 시스템 합산값 · 동역학 계수는 모형 추정값' })
    ],
    g80: [
      preset('g80', 'g80-2.5t-rwd', '2.5T RWD · 20인치', 2497, '직렬 4기통 가솔린 터보', 'rwd', 304, nm(43), 1850),
      preset('g80', 'g80-2.5t-awd', '2.5T AWD · 20인치', 2497, '직렬 4기통 가솔린 터보', 'awd', 304, nm(43), 1920),
      preset('g80', 'g80-3.5t-rwd', '3.5T RWD · 20인치', 3470, 'V6 가솔린 트윈터보', 'rwd', 380, nm(54), 1935, { frontWeightFraction: .54, brakeG: 1.05, topSpeedMps: 250 / 3.6 }),
      preset('g80', 'g80-3.5t-awd', '3.5T AWD · 20인치', 3470, 'V6 가솔린 트윈터보', 'awd', 380, nm(54), 2005, { frontWeightFraction: .525, brakeG: 1.05, topSpeedMps: 250 / 3.6 })
    ],
    ioniq5: [
      preset('ioniq5', 'ioniq5-standard', 'Standard RWD · 63 kWh · 19인치', null, '후륜 단일 전기모터', 'rwd', 170, 350, 1890, { batteryKwh: 63 }),
      preset('ioniq5', 'ioniq5-long-rwd', 'Long Range RWD · 84 kWh · 20인치', null, '후륜 단일 전기모터', 'rwd', 229, 350, 2025, { batteryKwh: 84 }),
      preset('ioniq5', 'ioniq5-long-awd', 'Long Range AWD · 84 kWh · 20인치', null, '전후륜 듀얼 전기모터', 'awd', 325, 605, 2130, { batteryKwh: 84, frontWeightFraction: .50 })
    ],
    grandeur: [
      preset('grandeur', 'grandeur-2.5', '2.5 가솔린 FWD · 20인치', 2497, '직렬 4기통 가솔린', 'fwd', 198, nm(25.3), 1650),
      preset('grandeur', 'grandeur-3.5-fwd', '3.5 가솔린 FWD · 20인치', 3470, 'V6 가솔린', 'fwd', 300, nm(36.6), 1725, { frontWeightFraction: .62, topSpeedMps: 240 / 3.6 }),
      preset('grandeur', 'grandeur-3.5-awd', '3.5 가솔린 AWD · 20인치', 3470, 'V6 가솔린', 'awd', 300, nm(36.6), 1795, { frontWeightFraction: .60, topSpeedMps: 240 / 3.6 })
    ],
    santafe: [
      preset('santafe', 'santafe-2.5t-fwd', '2.5 터보 FWD · 5인승 21인치', 2497, '직렬 4기통 가솔린 터보', 'fwd', 281, nm(43), 1865),
      preset('santafe', 'santafe-2.5t-awd', '2.5 터보 AWD · 5인승 21인치', 2497, '직렬 4기통 가솔린 터보', 'awd', 281, nm(43), 1930)
    ],
    staria: [preset('staria', 'staria-lpg', '라운지 3.5 LPG FWD · 7인승', 3470, 'V6 LPG', 'fwd', 240, nm(32), 2295)],
    musso_ev: [
      preset('musso_ev', 'musso-ev-fwd', 'EV FWD · 80.6 kWh · 17인치', null, '전륜 단일 전기모터', 'fwd', 207, nm(34.7), 2155, { batteryKwh: 80.6 }),
      preset('musso_ev', 'musso-ev-awd', 'EV AWD · 80.6 kWh · 17인치', null, '전후륜 듀얼 전기모터', 'awd', 414, nm(69.2), 2275, { batteryKwh: 80.6, frontWeightFraction: .51 })
    ],
    torres: [
      preset('torres', 'torres-1.5t-fwd', '1.5 터보 FWD · 8AT', 1497, '직렬 4기통 가솔린 터보', 'fwd', 170, nm(30.6), 1520),
      preset('torres', 'torres-1.5t-awd', '1.5 터보 AWD · 8AT', 1497, '직렬 4기통 가솔린 터보', 'awd', 170, nm(30.6), 1610)
    ],
    porter2: [
      preset('porter2', 'porter-lpg-mt', '2.5 LPG 터보 RWD · 슈퍼캡 6MT', 2469, '직렬 4기통 LPG 터보', 'rwd', 138, nm(26), 1675),
      preset('porter2', 'porter-lpg-at', '2.5 LPG 터보 RWD · 슈퍼캡 5AT', 2469, '직렬 4기통 LPG 터보', 'rwd', 159, nm(30), 1705)
    ],
    g70: [
      preset('g70', 'g70-2.0t-rwd', '2019 국내 2.0T RWD · 8AT · 18인치', 1998, '직렬 4기통 가솔린 터보', 'rwd', 252, nm(36), 1595, { sourceNote: SHARED.g70.sourceNote, frontWeightFraction: .52 }),
      preset('g70', 'g70-2.0t-awd', '2019 국내 2.0T AWD · 8AT · 18인치', 1998, '직렬 4기통 가솔린 터보', 'awd', 252, nm(36), 1665, { sourceNote: SHARED.g70.sourceNote, frontWeightFraction: .53 }),
      preset('g70', 'g70-3.3t-rwd', '2019 국내 3.3T Sport RWD · 8AT · 19인치', 3342, 'V6 가솔린 트윈터보', 'rwd', 370, nm(52), 1705, { sourceNote: SHARED.g70.sourceNote, frontWeightFraction: .53, cgHeightM: .50, brakeG: 1.10, topSpeedMps: 270 / 3.6, frontTire: '225/40R19', rearTire: '255/35R19', frontTireRadiusMm: 331.3, rearTireRadiusMm: 330.55 }),
      preset('g70', 'g70-3.3t-awd', '2019 국내 3.3T Sport AWD · 8AT · 19인치', 3342, 'V6 가솔린 트윈터보', 'awd', 370, nm(52), 1775, { sourceNote: SHARED.g70.sourceNote, frontWeightFraction: .54, cgHeightM: .50, brakeG: 1.10, topSpeedMps: 270 / 3.6, frontTire: '225/40R19', rearTire: '255/35R19', frontTireRadiusMm: 331.3, rearTireRadiusMm: 330.55 })
    ],
    supra: [
      preset('supra', 'supra-3.0t-rz', 'GR Supra 3.0T 8AT · 19인치', 2997, '직렬 6기통 가솔린 트윈스크롤 터보', 'rwd', 340, 500, 1520, { sourceNote: SHARED.supra.sourceNote })
    ]
  });
  const PALETTE = freeze(['#e65454', '#38bdf8', '#fbbf24', '#a78bfa', '#4ade80', '#fb923c', '#f472b6', '#f1f5f9', '#22d3ee', '#a3e635', '#c084fc', '#fda4af']);
  const zeroLevels = () => Object.fromEntries(KEYS.map(key => [key, 0]));
  function getVariant(vehicleId, variantId) {
    const family = VARIANTS[vehicleId];
    if (!family) throw new RangeError('Unknown vehicleId: ' + vehicleId);
    const variant = variantId ? family.find(item => item.id === variantId) : family[0];
    if (!variant) throw new RangeError('Variant does not belong to the selected vehicle: ' + variantId);
    return variant;
  }
  function random(seed = 1234) {
    if (!Number.isSafeInteger(seed)) throw new TypeError('seed must be a safe integer.');
    let state = seed >>> 0;
    return () => { state += 0x6D2B79F5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
  }
  const stageCost = level => STAGE_COSTS.slice(0, level).reduce((sum, value) => sum + value, 0);
  function getRules(vehicleId, variantId) {
    const variant = getVariant(vehicleId, variantId), family = VARIANTS[vehicleId];
    const maxPower = Math.max(...family.map(item => item.spec.powerPs));
    const gap = maxPower / variant.spec.powerPs;
    const accelerationGap = clamp(Math.ceil((gap - 1) / .10 - 1e-8), 0, 3);
    const speedGap = clamp(Math.ceil((Math.cbrt(gap) - 1) / .025 - 1e-8), 0, 3);
    const gripGap = family.some(item => item.spec.factoryDrive === 'awd') && variant.spec.factoryDrive !== 'awd' ? 2 : 0;
    const compensationLevels = { acceleration: accelerationGap, topSpeed: speedGap, brakes: 0, grip: gripGap };
    const credits = Object.fromEntries(KEYS.map(key => [key, stageCost(compensationLevels[key])]));
    const maxLevels = { acceleration: 3 + accelerationGap, topSpeed: 3 + speedGap, brakes: 4, grip: 4 + gripGap };
    return { credits, maxLevels, compensationLevels, referencePowerPs: maxPower };
  }
  function quote({ vehicleId, variantId, levels = {}, budget = 30 } = {}) {
    const { credits, maxLevels, compensationLevels, referencePowerPs } = getRules(vehicleId, variantId);
    let reason = null;
    if (!Number.isInteger(budget) || budget < 0 || budget > 200) reason = '공통 예산은 0–200 정수여야 합니다.';
    const normalized = { ...zeroLevels(), ...levels };
    if (Object.keys(normalized).some(key => !KEYS.includes(key))) reason = '알 수 없는 튜닝 항목입니다.';
    const costByCategory = {}, creditUsed = {}, paidByCategory = {};
    for (const key of KEYS) {
      const value = normalized[key];
      if (!Number.isInteger(value) || value < 0 || value > maxLevels[key]) reason = '해당 출고 사양의 튜닝 단계 범위를 벗어났습니다.';
      costByCategory[key] = stageCost(clamp(Number.isFinite(value) ? Math.floor(value) : 0, 0, 6));
      creditUsed[key] = Math.min(costByCategory[key], credits[key]);
      paidByCategory[key] = costByCategory[key] - creditUsed[key];
    }
    const cost = KEYS.reduce((sum, key) => sum + paidByCategory[key], 0);
    const totalCost = KEYS.reduce((sum, key) => sum + costByCategory[key], 0);
    if (!reason && cost > budget) reason = '공통 튜닝 예산이 부족합니다.';
    return { valid: !reason, reason, budget, cost, totalCost, costByCategory, paidByCategory, credits, creditUsed,
      remainingBudget: budget - cost, maxLevels, compensationLevels, referencePowerPs };
  }
  function createEntrant(options = {}) {
    const { vehicleId, variantId, budget = 30, levels = {}, generation = 1, uid = vehicleId + '-g' + generation + '-1', color = PALETTE[0] } = options;
    const variant = getVariant(vehicleId, variantId), normalized = { ...zeroLevels(), ...levels };
    const account = quote({ vehicleId, variantId: variant.id, budget, levels: normalized });
    if (!account.valid) throw new RangeError(account.reason);
    if (!Number.isInteger(generation) || generation < 1) throw new RangeError('generation must be a positive integer.');
    const a = normalized.acceleration, s = normalized.topSpeed, b = normalized.brakes, g = normalized.grip;
    const base = variant.spec;
    // Four coupled axes: aero costs straight speed/weight; shorter acceleration
    // gearing costs ceiling speed unless top-speed work compensates it.
    const spec = {
      ...base, powerPs: round(base.powerPs * (1 + .10 * a) * (1 + .025 * s)),
      torqueNm: round(base.torqueNm * (1 + .11 * a)),
      massKg: base.massKg + 2 * b + 3 * g, curbMassKg: base.massKg + 2 * b + 3 * g,
      gripG: round(base.gripG * (1 + .065 * g)), brakeG: round(base.brakeG * (1 + .095 * b)),
      cgHeightM: round(Math.max(.3, base.cgHeightM - .012 * g)),
      downforceArea: round(.16 * g), dragArea: round(base.dragArea * (1 - .018 * s) + .012 * g * g),
      reduction: round(base.reduction * (1 + .045 * a) / (1 + .018 * s)),
      topSpeedMps: base.topSpeedMps * (1 + .04 * s) / (1 + .012 * a),
      factoryMassKg: base.massKg, factoryPowerPs: base.powerPs, factoryTorqueNm: base.torqueNm,
      sourceNote: base.sourceNote + ' · 튜닝 효과·비용은 시뮬레이터 규칙'
    };
    return freeze({ uid: String(uid), vehicleId, name: MODEL_ROWS[vehicleId][0], variantId: variant.id, variantLabel: variant.label,
      factorySpec: base, spec, levels: normalized, ...account, generation, color,
      lineage: options.lineage || { kind: 'initial', parents: [] }, estimatedDynamics: true });
  }
  function repairLevels(vehicleId, variantId, levels, budget, rng) {
    const { maxLevels } = getRules(vehicleId, variantId);
    const result = Object.fromEntries(KEYS.map(key => [key, clamp(Math.round(levels[key] || 0), 0, maxLevels[key])]));
    for (let steps = 0; steps < 24; steps++) {
      const account = quote({ vehicleId, variantId, levels: result, budget });
      if (account.valid) return result;
      const candidates = KEYS.filter(key => result[key] > 0 && account.paidByCategory[key] > 0);
      if (!candidates.length) break;
      result[candidates[Math.floor(rng() * candidates.length)]]--;
    }
    return result;
  }
  function randomLevels(vehicleId, variantId, budget, rng) {
    const levels = zeroLevels(), { maxLevels } = getRules(vehicleId, variantId);
    // Spend in a seeded random order. The last few unaffordable increments stop
    // cleanly; unused category credits cannot become common money.
    for (let i = 0; i < 24; i++) {
      const choices = KEYS.filter(key => levels[key] < maxLevels[key] && quote({ vehicleId, variantId, budget, levels: { ...levels, [key]: levels[key] + 1 } }).valid);
      if (!choices.length) break;
      levels[choices[Math.floor(rng() * choices.length)]]++;
    }
    return levels;
  }
  function createPopulation({ vehicleId = 'g80', count = 8, seed = 1234, budget = 30 } = {}) {
    getVariant(vehicleId);
    if (!Number.isInteger(count) || count < 2 || count > 24) throw new RangeError('count must be 2–24.');
    const check = quote({ vehicleId, budget });
    if (!check.valid) throw new RangeError(check.reason);
    const rng = random(seed), order = [...VARIANTS[vehicleId]];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return Array.from({ length: count }, (_, index) => {
      const variant = order[index % order.length];
      return createEntrant({ vehicleId, variantId: variant.id, budget, uid: vehicleId + '-' + (seed >>> 0) + '-g1-' + (index + 1),
        color: PALETTE[index % PALETTE.length], levels: randomLevels(vehicleId, variant.id, budget, rng) });
    });
  }
  function evaluate(population, results) {
    if (!Array.isArray(population) || !population.length || !Array.isArray(results)) throw new TypeError('population and results arrays are required.');
    const lookup = new Map(results.map(result => [result.uid ?? result.entrant?.uid, result]));
    return population.map((entrant, index) => {
      const result = lookup.get(entrant.uid) || results.find(item => item.entrant === entrant) || {};
      const finished = result.finished === true && Number.isFinite(result.finishTime);
      return { entrant, uid: entrant.uid, index, finished, dnf: result.dnf === true,
        finishTime: finished ? result.finishTime : null, bestLap: Number.isFinite(result.bestLap) ? result.bestLap : null,
        distance: Number.isFinite(result.distance) ? result.distance : 0, result };
    }).sort((a, b) => Number(b.finished) - Number(a.finished) || (a.finished ? a.finishTime - b.finishTime : Number(a.dnf) - Number(b.dnf) || b.distance - a.distance) || a.index - b.index)
      .map((entry, index) => ({ ...entry, rank: index + 1, fitness: entry.finished ? entry.finishTime : Infinity }));
  }
  function breed(population, results, { seed = 1234, generation } = {}) {
    if (!Array.isArray(population) || population.length < 2 || population.length > 24) throw new RangeError('A generation needs 2–24 entrants.');
    const vehicleId = population[0].vehicleId, budget = population[0].budget;
    if (population.some(entry => entry.vehicleId !== vehicleId || entry.budget !== budget)) throw new RangeError('Breed one make with one common base budget.');
    if (new Set(population.map(entry => entry.uid)).size !== population.length) throw new RangeError('Entrant uids must be unique.');
    const ranked = evaluate(population, results);
    if (!ranked.some(entry => entry.finished || entry.dnf)) throw new RangeError('Run the race before breeding the next generation.');
    if (ranked.some(entry => !entry.finished && !entry.dnf)) throw new RangeError('Wait until all entrants finish or retire before breeding.');
    const nextGeneration = generation ?? Math.max(...population.map(entry => entry.generation)) + 1;
    const rng = random(seed), parents = ranked.slice(0, Math.max(2, Math.ceil(population.length / 2))).map(entry => entry.entrant);
    const make = (variantId, levels, index, lineage) => createEntrant({ vehicleId, variantId, budget, levels, generation: nextGeneration,
      uid: vehicleId + '-' + (seed >>> 0) + '-g' + nextGeneration + '-' + (index + 1), color: PALETTE[index % PALETTE.length], lineage });
    const winner = ranked[0].entrant;
    const next = [make(winner.variantId, winner.levels, 0, { kind: 'elite', parents: [winner.uid] })];
    for (let index = 1; index < population.length; index++) {
      if (index === population.length - 1 && population.length >= 4) {
        const family = VARIANTS[vehicleId], variant = family[Math.floor(rng() * family.length)];
        next.push(make(variant.id, randomLevels(vehicleId, variant.id, budget, rng), index, { kind: 'immigrant', parents: [] }));
        continue;
      }
      // Tournament selection within the quicker half. Variant belongs to one
      // parent as a whole; crossover applies only to the four tuning genes.
      const select = () => parents[Math.min(Math.floor(rng() * parents.length), Math.floor(rng() * parents.length))];
      const p = select(), q = select();
      const genes = Object.fromEntries(KEYS.map(key => [key, rng() < .5 ? p.levels[key] : q.levels[key]]));
      for (const key of KEYS) if (rng() < .45) genes[key] += rng() < .5 ? -1 : 1;
      const levels = repairLevels(vehicleId, p.variantId, genes, budget, rng);
      next.push(make(p.variantId, levels, index, { kind: 'offspring', parents: [p.uid, q.uid] }));
    }
    return next;
  }
  const api = freeze({ CATEGORIES, VARIANTS, PALETTE, createPopulation, createEntrant, quote, getRules, getVariant, evaluate, breed });
  root.TuningEvolution = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
