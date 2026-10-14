/* Manufacturer-supplied transparent side views. Original pixels are bundled
 * unchanged. Body artwork keeps its aspect ratio; photo wheel crops follow the
 * simulated axles and their rims rotate with the actual wheel angle. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const artwork = root.VehicleArtwork || {};
  const baseURL = new URL('.', document.currentScript.src);
  const images = new Map(), failures = (root.EvolutionLab?.STYLES || []).filter(style => !artwork[style.id]).map(style => style.id);
  let revision = 0;
  const ready = Promise.all(Object.entries(artwork).map(([id, reference]) => new Promise(resolve => {
    const image = new Image();
    image.onload = () => { images.set(id, image); revision++; resolve(); };
    image.onerror = () => { failures.push(id); revision++; resolve(); };
    image.src = new URL(reference.file, baseURL).href;
  })));
  function layout(vehicle) {
    const reference = artwork[vehicle.design.style];
    if (!reference) return null;
    const { rearAxle, frontAxle } = vehicle.design;
    const sx = (frontAxle.x - rearAxle.x) / (reference.front.x - reference.rear.x);
    const sy = Math.abs(sx);
    const tx = rearAxle.x - reference.rear.x * sx;
    const ty = (rearAxle.y + frontAxle.y) / 2 - (reference.rear.y + reference.front.y) / 2 * sy;
    return { reference, image: images.get(vehicle.design.style), sx, sy, tx, ty };
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
    const com = d.centerOfMass;
    ctx.beginPath(); ctx.arc(com.x, com.y, 2, 0, TAU); ctx.fillStyle = '#fff7ca'; ctx.fill(); ctx.strokeStyle = '#39433d'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(com.x - 3.5, com.y); ctx.lineTo(com.x + 3.5, com.y); ctx.moveTo(com.x, com.y - 3.5); ctx.lineTo(com.x, com.y + 3.5); ctx.stroke();
    ctx.restore();
  }
  function drawVehicle(ctx, vehicle, options = {}) {
    const view = layout(vehicle), wheels = wheelsFor(vehicle, options.live !== false);
    if (!view?.image) return;
    const { reference, image, sx, sy, tx, ty } = view;
    const sourceWheels = [reference.rear, reference.front];
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // Dark wheel wells remain behind the moving axles when suspension flexes.
    for (const [i, wheel] of wheels.entries()) {
      ctx.beginPath(); ctx.arc(wheel.axle.x, wheel.axle.y, Math.max(wheel.r, sourceWheels[i].r * sy) * 1.025, 0, TAU);
      ctx.fillStyle = '#12181c'; ctx.fill();
    }
    for (const [i, wheel] of wheels.entries()) drawPhotoWheel(ctx, image, sourceWheels[i], wheel, Math.sign(sx));
    ctx.save(); ctx.translate(tx, ty); ctx.scale(sx, sy);
    const [x, y, width] = reference.bounds;
    const height = reference.bodyBottom - y;
    // Exclude the source image's studio floor shadow and its stationary tires.
    // This is a rendering mask only; the bundled original is never altered.
    ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.beginPath(); ctx.rect(x, y, width, height);
    for (const wheel of sourceWheels) { ctx.moveTo(wheel.x + wheel.r * 1.005, wheel.y); ctx.arc(wheel.x, wheel.y, wheel.r * 1.005, 0, TAU); }
    ctx.clip('evenodd'); ctx.drawImage(image, 0, 0); ctx.restore();
    if (options.engineering === true) drawEngineering(ctx, vehicle, wheels);
    ctx.restore();
  }
  function drawThumbnail(ctx, vehicle, options = {}) {
    const width = options.width || ctx.canvas.width || 200, height = options.height || ctx.canvas.height || 96;
    ctx.clearRect(0, 0, width, height);
    const view = layout(vehicle);
    if (!view?.image) {
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#62706a'; ctx.font = '12px sans-serif';
      ctx.fillText(failures.includes(vehicle.design.style) ? '차량 이미지 로딩 실패' : '실차 이미지 불러오는 중', width / 2, height / 2); ctx.restore(); return;
    }
    const { reference, sx, sy, tx, ty } = view;
    const [x, y, w, h] = reference.bounds;
    const wheels = wheelsFor(vehicle, false);
    const minX = Math.min(tx + x * sx, tx + (x + w) * sx, ...wheels.map(wheel => wheel.p.x - wheel.r));
    const maxX = Math.max(tx + x * sx, tx + (x + w) * sx, ...wheels.map(wheel => wheel.p.x + wheel.r));
    const minY = Math.min(ty + y * sy, ...wheels.map(wheel => wheel.p.y - wheel.r));
    const maxY = Math.max(ty + (y + h) * sy, ...wheels.map(wheel => wheel.p.y + wheel.r));
    const scale = Math.min((width - 22) / (maxX - minX), (height - 20) / (maxY - minY));
    ctx.save(); ctx.translate(width / 2 - (minX + maxX) / 2 * scale, height / 2 - (minY + maxY) / 2 * scale - 2); ctx.scale(scale, scale);
    ctx.beginPath(); ctx.ellipse((minX + maxX) / 2, maxY + 1, (maxX - minX) * .43, 1.35, 0, 0, TAU); ctx.fillStyle = '#26353e13'; ctx.fill();
    drawVehicle(ctx, vehicle, { live: false, engineering: options.engineering === true }); ctx.restore();
  }
  root.VehicleRenderer = { drawVehicle, drawThumbnail, ready, mode: 'manufacturer-image',
    get revision() { return revision; }, get loadedCount() { return images.size; }, get failures() { return [...failures]; } };
})(typeof window !== 'undefined' ? window : globalThis);
