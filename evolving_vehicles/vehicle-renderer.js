/* Official photos and disclosed generated conversions share calibrated geometry.
 * Canvas decals and spoilers never change simulated mass, power or grip. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const artwork = root.VehicleArtwork || {};
  const baseURL = new URL('.', document.currentScript.src);
  const images = new Map(), variants = new Map(), pending = new Map();
  const failures = new Set((root.EvolutionLab?.STYLES || []).filter(style => !artwork[style.id]).map(style => style.id));
  const paintFailures = new Set();
  let revision = 0;
  const haechiBadge = new Image();
  const badgeReady = new Promise(resolve => {
    haechiBadge.onload = () => { revision++; resolve(true); };
    haechiBadge.onerror = () => resolve(false);
    haechiBadge.src = new URL('assets/vehicles/decals/seoul-haechi-badge.png', baseURL).href;
  });
  const styleOf = vehicle => typeof vehicle === 'string' ? vehicle : vehicle?.design?.style;
  function getColors(style) {
    const colors = root.VehiclePaints?.[style];
    const list = Array.isArray(colors) ? colors.filter(color => color?.id && color?.file) : [];
    return list.some(color => color.id === 'factory') ? list : [{ id: 'factory', label: '공식 기본 색상', file: artwork[style]?.file }, ...list];
  }
  function getLiveries(style) {
    return (root.VehicleLiveries || [{ id: 'none', label: '순정 · 데칼 없음' }]).filter(livery => !livery.styles || livery.styles.includes(style));
  }
  function getAppearance(vehicle, overrides = {}) {
    const style = styleOf(vehicle), chosen = { ...(vehicle?.appearance || {}), ...overrides };
    const colors = getColors(style), liveries = getLiveries(style);
    const color = colors.find(item => item.id === chosen.color) || colors.find(item => item.id === 'factory') || colors[0];
    const livery = liveries.find(item => item.id === chosen.livery) || liveries[0];
    const key = style + '/' + color.id;
    return { style, color: color.id, livery: livery.id, colorLabel: color.label, liveryLabel: livery.label,
      colors, liveries, performance: chosen.performance === true,
      spoiler: chosen.performance === true && !!root.VehicleLiveryGeometry?.[style]?.spoiler,
      loading: color.id === 'factory' ? !images.has(style) && !failures.has(style) : !variants.has(key) && !paintFailures.has(key),
      failed: color.id === 'factory' ? failures.has(style) : paintFailures.has(key) };
  }
  function loadImage(style, color) {
    const key = style + '/' + color.id;
    const cache = color.id === 'factory' ? images : variants;
    const cacheKey = color.id === 'factory' ? style : key;
    if (cache.has(cacheKey)) return Promise.resolve(true);
    if (pending.has(key)) return pending.get(key);
    if (!color.file) return Promise.resolve(false);
    const promise = new Promise(resolve => {
      const image = new Image();
      image.onload = () => { cache.set(cacheKey, image); revision++; resolve(true); };
      image.onerror = () => { (color.id === 'factory' ? failures : paintFailures).add(color.id === 'factory' ? style : key); revision++; resolve(false); };
      image.src = new URL(color.file, baseURL).href;
    });
    pending.set(key, promise);
    return promise;
  }
  function ensureAppearance(style, color = 'factory') {
    const selected = getColors(style).find(item => item.id === color) || getColors(style)[0];
    return loadImage(style, selected);
  }
  const ready = Promise.all([badgeReady, ...Object.entries(artwork).map(([style, reference]) => loadImage(style, { id: 'factory', file: reference.file }))]);
  function layout(vehicle, overrides = {}) {
    const appearance = getAppearance(vehicle, overrides), base = artwork[appearance.style];
    if (!base) return null;
    const paint = appearance.colors.find(item => item.id === appearance.color);
    if (appearance.color !== 'factory') ensureAppearance(appearance.style, appearance.color);
    const variant = variants.get(appearance.style + '/' + appearance.color);
    const reference = variant && paint.artwork ? { ...base, ...paint.artwork } : base;
    const image = variant || images.get(appearance.style);
    const { rearAxle, frontAxle } = vehicle.design;
    const sx = (frontAxle.x - rearAxle.x) / (reference.front.x - reference.rear.x), sy = Math.abs(sx);
    const tx = rearAxle.x - reference.rear.x * sx;
    const ty = (rearAxle.y + frontAxle.y) / 2 - (reference.rear.y + reference.front.y) / 2 * sy;
    return { reference, image, sx, sy, tx, ty, appearance };
  }
  function wheelsFor(vehicle, live) {
    const d = vehicle.design, g = vehicle.genome;
    const c = Math.cos(vehicle.body.angle), s = Math.sin(vehicle.body.angle);
    return vehicle.wheels.map((wheel, i) => {
      const dx = wheel.position.x - vehicle.body.position.x, dy = wheel.position.y - vehicle.body.position.y;
      return { p: live ? { x: c * dx + s * dy, y: -s * dx + c * dy } : (i ? d.frontAxle : d.rearAxle),
        axle: i ? d.frontAxle : d.rearAxle, r: i ? g.frontRadius : g.rearRadius,
        angle: live ? wheel.angle - vehicle.body.angle : 0, driven: d.driveShares[i] > 0 };
    });
  }
  function drawPhotoWheel(ctx, image, reference, wheel, facing) {
    const zoom = wheel.r / reference.r;
    // The entire tire remains an exact photographic crop, with only the rim
    // rotating so studio highlights on the rubber do not spin with the wheel.
    ctx.save();
    ctx.translate(wheel.p.x, wheel.p.y);
    ctx.beginPath(); ctx.arc(0, 0, wheel.r, 0, TAU); ctx.clip();
    ctx.scale(facing * zoom, zoom);
    ctx.drawImage(image, -reference.x, -reference.y);
    ctx.restore();
    ctx.save();
    ctx.translate(wheel.p.x, wheel.p.y);
    ctx.beginPath(); ctx.arc(0, 0, wheel.r * (reference.rimRatio || .84), 0, TAU); ctx.clip();
    ctx.rotate(wheel.angle);
    ctx.scale(facing * zoom, zoom);
    ctx.drawImage(image, -reference.x, -reference.y);
    ctx.restore();
  }
  function drawEngineering(ctx, vehicle, wheels) {
    const d = vehicle.design;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = .5;
    ctx.strokeStyle = '#f2cf75'; ctx.setLineDash([1.8, 1.4]);
    ctx.beginPath(); d.outline.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = '#e8a847'; ctx.lineWidth = .7;
    for (const wheel of wheels) if (wheel.driven) { ctx.beginPath(); ctx.arc(wheel.p.x, wheel.p.y, wheel.r + 2, 0, TAU); ctx.stroke(); }
    ctx.setLineDash([]);
    const unit = d.powerUnit;
    ctx.fillStyle = '#e4b254c0'; ctx.strokeStyle = '#624819';
    ctx.fillRect(unit.x - unit.width / 2, unit.y - unit.height / 2, unit.width, unit.height);
    ctx.strokeRect(unit.x - unit.width / 2, unit.y - unit.height / 2, unit.width, unit.height);
    if (d.conversionUnit) {
      const equipment = d.conversionUnit;
      ctx.fillStyle = '#985f36a8'; ctx.strokeStyle = '#ffe5bd';
      ctx.fillRect(equipment.x - equipment.width / 2, equipment.y - equipment.height / 2, equipment.width, equipment.height);
      ctx.strokeRect(equipment.x - equipment.width / 2, equipment.y - equipment.height / 2, equipment.width, equipment.height);
      label(ctx, '견인 장비', equipment.x, equipment.y, Math.max(1.8, vehicle.genome.width * .018), '#fff7df', 700);
    }
    const com = d.centerOfMass;
    ctx.beginPath(); ctx.arc(com.x, com.y, 2, 0, TAU); ctx.fillStyle = '#fff7ca'; ctx.fill(); ctx.strokeStyle = '#39433d'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(com.x - 3.5, com.y); ctx.lineTo(com.x + 3.5, com.y); ctx.moveTo(com.x, com.y - 3.5); ctx.lineTo(com.x, com.y + 3.5); ctx.stroke();
    ctx.restore();
  }
  function bodyFrame(view) {
    const [x, y, w, h] = view.reference.bounds;
    return { x: Math.min(view.tx + x * view.sx, view.tx + (x + w) * view.sx), y: view.ty + y * view.sy, w: w * view.sy, h: h * view.sy };
  }
  function decalGeometry(view) {
    const frame = bodyFrame(view), placement = root.VehicleLiveryGeometry?.[view.appearance.style];
    if (!placement) return null;
    const [x, y, w, h] = placement.panel;
    return { ...frame, placement, panel: { x: frame.x + x * frame.w, y: frame.y + y * frame.h, w: w * frame.w, h: h * frame.h } };
  }
  function label(ctx, text, x, y, size, color, weight = 600, align = 'center') {
    ctx.font = weight + ' ' + size + 'px "Malgun Gothic", "Noto Sans KR", Arial, sans-serif';
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }
  function drawRoofSign(ctx, view, geo) {
    const { appearance } = view;
    const livery = appearance.liveries.find(item => item.id === appearance.livery);
    if (!livery?.roof) return;
    const { x, y, w, h, placement } = geo;
    const roof = appearance.livery === 'kakao_taxi' ? (placement.kakaoRoof || placement.roof) : placement.roof;
    const center = x + roof[0] * w, bottom = y + roof[1] * h;
    const premium = appearance.livery === 'premium_taxi', kakao = appearance.livery === 'kakao_taxi', seoul = appearance.livery === 'seoul_taxi';
    if (kakao && ['staria', 'carnival'].includes(appearance.style)) return;
    const sw = w * (kakao ? .122 : .096), sh = w * (kakao ? .030 : .026), top = bottom - sh;
    const accent = seoul ? '#d98123' : premium ? '#d4b979' : kakao ? '#f9dd00' : appearance.livery === 'ev_taxi' ? '#249593' : '#296592';
    ctx.save();
    ctx.fillStyle = '#27343a'; ctx.fillRect(center - sw * .56, bottom - w * .003, sw * 1.12, w * .005);
    const face = ctx.createLinearGradient(0, top, 0, bottom);
    face.addColorStop(0, seoul ? '#414749' : premium ? '#3d4548' : kakao ? '#fff178' : '#ffffff'); face.addColorStop(1, seoul ? '#181d20' : premium ? '#10191d' : kakao ? '#f3cc18' : '#d9e3e8');
    ctx.beginPath(); ctx.moveTo(center - sw * .49, bottom - w * .003); ctx.lineTo(center - sw * .40, top + w * .002);
    ctx.quadraticCurveTo(center, top - w * .004, center + sw * .40, top + w * .002); ctx.lineTo(center + sw * .49, bottom - w * .003); ctx.closePath();
    ctx.fillStyle = face; ctx.fill(); ctx.strokeStyle = premium ? '#c7aa64' : '#87959e'; ctx.lineWidth = w * .0008; ctx.stroke();
    ctx.fillStyle = accent; ctx.fillRect(center - sw * .39, bottom - sh * .22, sw * .78, sh * .105);
    if (kakao) {
      ctx.fillStyle = '#233a57'; ctx.fillRect(center - sw * .42, top + sh * .13, sw * .19, sh * .61);
      label(ctx, 'T', center - sw * .323, top + sh * .44, sh * .43, '#ffe92d', 700);
      label(ctx, 'kakao T', center + sw * .09, top + sh * .47, sh * .43, '#233a57', 500);
    } else label(ctx, 'TAXI', center, top + sh * .48, sh * .50, seoul ? '#f8f1dc' : premium ? '#e4cc91' : '#173d56', 800);
    ctx.restore();
  }
  function drawLivery(ctx, view) {
    const geo = decalGeometry(view), id = view.appearance.livery;
    if (!geo || id === 'none') return;
    const p = id === 'seoul_taxi' ? { x: geo.x + geo.w * .33, y: geo.y + geo.h * .43, w: geo.w * .32, h: geo.h * .31 } : id === 'kakao_taxi' ? { x: geo.x + geo.w * .27, y: geo.y + geo.h * .43, w: geo.w * .45, h: geo.h * .37 } : geo.panel;
    const unit = geo.w, cx = p.x + p.w * .56, cy = p.y + p.h * .40;
    ctx.save(); ctx.globalAlpha *= .95;
    // Every marking is confined to an opaque door/bed panel, below the glazing.
    ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
    ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h);
    for (const wheel of [view.reference.rear, view.reference.front]) { const wx = view.tx + wheel.x * view.sx, wy = view.ty + wheel.y * view.sy, r = wheel.r * view.sy * 1.03; ctx.moveTo(wx + r, wy); ctx.arc(wx, wy, r, 0, TAU); }
    ctx.clip('evenodd');
    if (id === 'seoul_taxi') {
      // Historic white stone-guardian badge; the orange car photo is a separate paint.
      const bh = p.h * .88, bw = bh * .73, bx = p.x + p.w * .04, by = p.y + p.h * .05;
      if (haechiBadge.complete && haechiBadge.naturalWidth) ctx.drawImage(haechiBadge, 106, 174, 822, 1124, bx, by, bw, bh);
      label(ctx, 'HAECHI SEOUL', bx + bw + unit * .061, by + bh * .50, unit * .0085, '#293b41', 600);
    } else if (id === 'tow_service') {
      const tx = p.x + p.w * .53, ty = p.y + p.h * .49;
      label(ctx, 'ROAD ASSISTANCE', tx, ty, unit * .0085, '#435059', 600);
    } else if (id === 'premium_taxi') {
      ctx.fillStyle = '#d7bb76'; ctx.fillRect(p.x, p.y + p.h * .77, p.w, unit * .0035);
      ctx.fillRect(p.x, p.y + p.h * .86, p.w, unit * .0013);
      label(ctx, 'PREMIUM TAXI', cx, cy, unit * .010, '#d6bb80', 600);
    } else if (id === 'kakao_taxi') {
      ctx.fillStyle = '#f7d444';
      for (const offset of [.02, .18]) {
        const stripeX = p.x + p.w * offset;
        ctx.beginPath(); ctx.moveTo(stripeX, p.y); ctx.lineTo(stripeX + unit * .037, p.y); ctx.lineTo(stripeX + unit * .08, p.y + p.h); ctx.lineTo(stripeX + unit * .043, p.y + p.h); ctx.closePath(); ctx.fill();
      }
    } else if (id === 'personal_taxi' || id === 'ev_taxi' || id === 'van_taxi') {
      const ev = id === 'ev_taxi', van = id === 'van_taxi';
      const primary = ev ? '#209994' : van ? '#235a82' : '#df792b';
      ctx.fillStyle = primary; ctx.fillRect(p.x, p.y + p.h * .77, p.w, unit * .009);
      ctx.fillStyle = ev ? '#164b69' : '#265b87'; ctx.fillRect(p.x, p.y + p.h * .77 + unit * .011, p.w, unit * .003);
    } else if (id === 'delivery') {
      ctx.fillStyle = '#e0a946'; ctx.fillRect(p.x, p.y + p.h * .78, p.w, unit * .009);
      const size = unit * .028, bx = p.x + p.w * .13, by = cy - size * .42;
      ctx.fillStyle = '#f7eac9'; ctx.fillRect(bx, by, size, size * .82); ctx.strokeStyle = '#3b5356'; ctx.lineWidth = unit * .0015; ctx.strokeRect(bx, by, size, size * .82);
      ctx.beginPath(); ctx.moveTo(bx + size * .5, by); ctx.lineTo(bx + size * .5, by + size * .35); ctx.stroke();
    } else if (id === 'camping') {
      ctx.strokeStyle = '#dbc7a4'; ctx.lineWidth = unit * .0022;
      ctx.beginPath(); ctx.moveTo(p.x + p.w * .04, cy + unit * .018); ctx.lineTo(p.x + p.w * .12, cy - unit * .023); ctx.lineTo(p.x + p.w * .20, cy + unit * .018);
      ctx.moveTo(p.x + p.w * .16, cy - unit * .008); ctx.lineTo(p.x + p.w * .21, cy - unit * .032); ctx.lineTo(p.x + p.w * .30, cy + unit * .018);
      ctx.strokeStyle = '#34483e'; ctx.lineWidth = unit * .0045; ctx.stroke(); ctx.strokeStyle = '#e3d1ad'; ctx.lineWidth = unit * .002; ctx.stroke();
      label(ctx, 'WEEKEND OUTDOOR', cx + unit * .018, cy, unit * .0095, '#d9c9aa', 500);
    }
    ctx.restore(); drawRoofSign(ctx, view, geo);
  }
  function drawPerformance(ctx, view) {
    if (!view.appearance.performance) return;
    const geo = decalGeometry(view); if (!geo) return;
    const { x, y, w, h, panel, placement } = geo;
    ctx.save();
    // A subtle sill flash differentiates a stronger tune without recoloring paint.
    ctx.strokeStyle = '#f27639'; ctx.lineWidth = w * .0032;
    ctx.beginPath(); ctx.moveTo(panel.x + panel.w * .05, panel.y + panel.h * .98); ctx.lineTo(panel.x + panel.w * .94, panel.y + panel.h * .98); ctx.stroke();
    if (placement.spoiler) {
      const [px, py] = placement.spoiler, left = x + px * w, base = y + py * h;
      const wingWidth = w * (placement.roofSpoiler ? .09 : .082), rise = w * (placement.roofSpoiler ? .009 : .023);
      ctx.fillStyle = '#273036';
      if (!placement.roofSpoiler) { ctx.fillRect(left + wingWidth * .25, base - rise, w * .006, rise); ctx.fillRect(left + wingWidth * .76, base - rise, w * .006, rise); }
      ctx.beginPath(); ctx.moveTo(left - w * .012, base - rise); ctx.lineTo(left + wingWidth, base - rise - w * .0015); ctx.lineTo(left + wingWidth + w * .004, base - rise + w * .005); ctx.lineTo(left - w * .01, base - rise + w * .005); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = '#7e888c'; ctx.lineWidth = w * .0008; ctx.stroke();
      ctx.strokeStyle = '#e26731'; ctx.lineWidth = w * .0013; ctx.beginPath(); ctx.moveTo(left, base - rise + w * .005); ctx.lineTo(left + wingWidth * .94, base - rise + w * .004); ctx.stroke();
    }
    ctx.restore();
  }
  function accessoryTop(view) {
    const geo = decalGeometry(view); if (!geo) return Infinity;
    const livery = view.appearance.liveries.find(item => item.id === view.appearance.livery);
    const hasRoof = livery?.roof && !(view.appearance.livery === 'kakao_taxi' && ['staria', 'carnival'].includes(view.appearance.style));
    const roof = view.appearance.livery === 'kakao_taxi' ? (geo.placement.kakaoRoof || geo.placement.roof) : geo.placement.roof;
    let top = hasRoof ? geo.y + roof[1] * geo.h - geo.w * (view.appearance.livery === 'kakao_taxi' ? .035 : .031) : Infinity;
    if (view.appearance.performance && geo.placement.spoiler) top = Math.min(top, geo.y + geo.placement.spoiler[1] * geo.h - geo.w * (geo.placement.roofSpoiler ? .012 : .026));
    return top;
  }
  function drawVehicle(ctx, vehicle, options = {}) {
    const view = layout(vehicle, options.appearance), wheels = wheelsFor(vehicle, options.live !== false);
    if (!view?.image) return;
    const { reference, image, sx, sy, tx, ty } = view, sourceWheels = [reference.rear, reference.front];
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (const [i, wheel] of wheels.entries()) {
      const radius = reference.physicalWheelMask ? wheel.r : Math.max(wheel.r, sourceWheels[i].r * sy);
      const center = reference.physicalWheelMask ? wheel.p : wheel.axle;
      ctx.beginPath(); ctx.arc(center.x, center.y, radius * 1.025, 0, TAU); ctx.fillStyle = '#12181c'; ctx.fill();
    }
    for (const [i, wheel] of wheels.entries()) drawPhotoWheel(ctx, image, sourceWheels[i], wheel, Math.sign(sx));
    ctx.save(); ctx.translate(tx, ty); ctx.scale(sx, sy);
    const [x, y, width] = reference.bounds, height = reference.bodyBottom - y;
    ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.beginPath(); ctx.rect(x, y, width, height);
    for (const wheel of sourceWheels) { ctx.moveTo(wheel.x + wheel.r * 1.005, wheel.y); ctx.arc(wheel.x, wheel.y, wheel.r * 1.005, 0, TAU); }
    ctx.clip('evenodd');
    if (reference.physicalWheelMask) {
      // The smaller Porter rear tire sits lower than the generated source hub.
      // Separate clips remove the union of source tires and live physical tires.
      ctx.beginPath(); ctx.rect(x, y, width, height);
      for (const wheel of wheels) {
        const cx = (wheel.p.x - tx) / sx, cy = (wheel.p.y - ty) / sy, r = wheel.r / sy;
        ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU);
      }
      ctx.clip('evenodd');
    }
    ctx.drawImage(image, 0, 0); ctx.restore();
    drawLivery(ctx, view); drawPerformance(ctx, view);
    if (options.engineering === true) drawEngineering(ctx, vehicle, wheels);
    ctx.restore();
  }
  function drawThumbnail(ctx, vehicle, options = {}) {
    const width = options.width || ctx.canvas.width || 200, height = options.height || ctx.canvas.height || 96;
    ctx.clearRect(0, 0, width, height);
    const view = layout(vehicle, options.appearance);
    if (!view?.image) {
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#62706a'; ctx.font = '12px sans-serif';
      ctx.fillText(failures.has(vehicle.design.style) ? '차량 이미지 로딩 실패' : '실차 이미지 불러오는 중', width / 2, height / 2); ctx.restore(); return;
    }
    const { reference, sx, sy, tx, ty } = view, [x, y, w, h] = reference.bounds, wheels = wheelsFor(vehicle, false);
    const minX = Math.min(tx + x * sx, tx + (x + w) * sx, ...wheels.map(wheel => wheel.p.x - wheel.r));
    const maxX = Math.max(tx + x * sx, tx + (x + w) * sx, ...wheels.map(wheel => wheel.p.x + wheel.r));
    const minY = Math.min(ty + y * sy, accessoryTop(view), ...wheels.map(wheel => wheel.p.y - wheel.r));
    const maxY = Math.max(ty + (y + h) * sy, ...wheels.map(wheel => wheel.p.y + wheel.r));
    const scale = Math.min((width - 22) / (maxX - minX), (height - 20) / (maxY - minY));
    ctx.save(); ctx.translate(width / 2 - (minX + maxX) / 2 * scale, height / 2 - (minY + maxY) / 2 * scale - 2); ctx.scale(scale, scale);
    ctx.beginPath(); ctx.ellipse((minX + maxX) / 2, maxY + 1, (maxX - minX) * .43, 1.35, 0, 0, TAU); ctx.fillStyle = '#26353e13'; ctx.fill();
    drawVehicle(ctx, vehicle, { live: false, engineering: options.engineering === true, appearance: options.appearance }); ctx.restore();
  }
  root.VehicleRenderer = { drawVehicle, drawThumbnail, ready, mode: 'manufacturer-image', getAppearance, getColors, getLiveries, ensureAppearance,
    get revision() { return revision; }, get loadedCount() { return images.size; }, get loadedAppearanceCount() { return images.size + variants.size; },
    get failures() { return [...failures]; }, get appearanceFailures() { return [...paintFailures]; } };
})(typeof window !== 'undefined' ? window : globalThis);
