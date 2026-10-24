(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaturdayScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const W = 960, H = 500;
  const colors = {
    ink: '#253e42', teal: '#397b76', darkTeal: '#285853', cream: '#f6eddb',
    wall: '#f0e5d1', floor: '#decbb1', coral: '#ca7258', skin: '#c98d6a',
    skinLight: '#dfa681', hair: '#403b36', trouser: '#384e59', shoe: '#f2e5cf',
    metal: '#9aa9a5', rubber: '#40575a', green: '#668168', muted: '#b7b1a0'
  };
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const hairStyles = ['crop', 'side-part', 'wavy', 'bob', 'ponytail', 'bun'];
  const outfits = [
    ['#245b56', '#4c8980', '#285d58', '#397b76', '#285853'],
    ['#3d5465', '#718d99', '#415b6c', '#5c7e8b', '#3f5767'],
    ['#806039', '#b48c52', '#86683e', '#a88049', '#765835'],
    ['#5c5368', '#918093', '#5d5267', '#827287', '#574c61'],
    ['#865745', '#bd8363', '#875945', '#a86e54', '#775140'],
    ['#596546', '#8f9970', '#586346', '#79875c', '#505b3f']
  ];
  const appearanceFor = value => ({
    gender: value && value.gender === 'female' ? 'female' : 'male',
    hairStyle: value && hairStyles.includes(value.hairStyle) ? value.hairStyle : 'crop'
  });

  function create(canvas, options) {
    if (!canvas || !canvas.getContext) throw new TypeError('A canvas is required.');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    let reduced = Boolean(options && options.reducedMotion), dead = false;
    let scene = { kind: 'rest', location: 'room', body: {}, step: 1, energyBefore: 6, energyAfter: 6, appearance: appearanceFor() };
    let elapsed = 0, duration = 3000, motionDuration = 3000, environmentDuration = 0, gaitDuration = 1600, stairDuration = 2050;
    let pose = {};
    const stairGeometry = { startX: 360, baseY: 430, tread: 74, rise: 25, count: 4 };
    const stairSurface = x => stairGeometry.baseY - clamp(Math.floor((x - stairGeometry.startX) / stairGeometry.tread) + 1, 0, stairGeometry.count) * stairGeometry.rise;
    const railHeight = x => x < 640 ? 313 - (x - 300) * 103 / 340 : 210;
    const outfit = () => outfits[hairStyles.indexOf(scene.appearance.hairStyle)];

    function line(points, color, width) {
      ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
    function box(x, y, w, h, radius, fill, stroke, width) {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 2; ctx.stroke(); }
    }
    function ellipse(x, y, rx, ry, fill, rotation) {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation || 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    }
    function poly(points, fill) {
      ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
      points.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    function gradient(x1, y1, x2, y2, stops) {
      const fill = ctx.createLinearGradient(x1, y1, x2, y2);
      stops.forEach(([at, color]) => fill.addColorStop(at, color));
      return fill;
    }
    function environmentState() {
      if (!scene.encounter) return null;
      const time = reduced ? environmentDuration : Math.min(elapsed, environmentDuration);
      const encounter = scene.encounter;
      const active = !reduced && time < environmentDuration;
      return {
        ...encounter, active, elapsedMs: Math.round(time), durationMs: environmentDuration,
        doorOpenFraction: encounter.kind === 'door' && encounter.doorType === 'automatic'
          ? encounter.phase === 'passed' ? 1 : smooth(time / 1600) : null,
        rotationRadians: encounter.kind === 'door' && encounter.doorType === 'revolving' ? .35 + time / 4800 * Math.PI * 1.2 : null,
        stepOffset: encounter.kind === 'escalator' ? time / 850 % 1 : null,
        boarding: false
      };
    }
    function leaf(x, y, angle, scale) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ellipse(0, -12 * scale, 7 * scale, 18 * scale, colors.green); ctx.restore();
    }
    function plant(x, y, size) {
      line([[x, y], [x - 1 * size, y - 70 * size]], colors.darkTeal, 3 * size);
      [-1, 1, -1, 1].forEach((side, i) => {
        const yy = y - (30 + i * 13) * size;
        line([[x, yy], [x + side * 16 * size, yy - 10 * size]], colors.darkTeal, 2 * size);
        leaf(x + side * 14 * size, yy - 7 * size, side * .7, size);
      });
      box(x - 19 * size, y - 6 * size, 38 * size, 40 * size, 5 * size, colors.coral);
      box(x - 22 * size, y - 9 * size, 44 * size, 9 * size, 3 * size, '#d88668');
    }
    function cup(x, y) {
      ctx.beginPath(); ctx.arc(x + 14, y + 7, 6, -.5 * Math.PI, .5 * Math.PI); ctx.lineWidth = 3; ctx.strokeStyle = colors.cream; ctx.stroke();
      box(x, y, 15, 17, 3, colors.cream); ellipse(x + 7.5, y + 1, 6, 2, '#705e4b');
    }
    function hasContext() { return Boolean(scene.scenarioId && scene.scenarioId !== 'classic' && scene.context); }
    function hasHomeItems() { return hasContext() && scene.context.location === 'home'; }
    function bottle(x, y) {
      box(x, y, 13, 27, 4, '#94b9ae'); box(x + 3, y - 5, 7, 7, 2, colors.cream);
    }
    function phone(x, y) {
      box(x, y, 24, 9, 3, colors.ink); box(x + 4, y + 2, 15, 4, 1, '#b9cec2');
    }
    function roomItems() {
      const items = scene.context.items || {};
      const spots = { kitchen: [885, 286], window: [304, 220], table: [420, 322] };
      const cupSpot = spots[items.cupLocation];
      if (cupSpot) {
        cup(...cupSpot);
        if (items.container === 'takeout-cup') box(cupSpot[0] - 2, cupSpot[1] - 3, 19, 4, 2, '#c9ad83');
      }
      if (items.container === 'bottle' && spots[items.drinkPlace]) {
        const spot = spots[items.drinkPlace]; bottle(spot[0] - 28, spot[1] - 10);
      }
      if (items.phoneLocation === 'window') phone(258, 228);
      else if (items.phoneLocation === 'kitchen') phone(848, 294);
      // A small location key makes the fictional arrangement readable at a glance.
      // The same positions are announced as text by the main UI.
      const names = { window: '창가', table: '식탁', kitchen: '부엌' };
      ['window', 'table', 'kitchen'].forEach((place, index) => {
        const x = 147 + index * 224;
        box(x, 451, 205, 34, 9, '#efe5d1', items.drinkPlace === place ? '#638f7c' : '#c1b498', 1.5);
        ctx.fillStyle = colors.ink; ctx.font = '600 15px sans-serif'; ctx.fillText(names[place], x + 12, 473);
        let iconX = x + 80;
        if (items.cupLocation === place) { cup(iconX, 459); iconX += 30; }
        if (items.container === 'bottle' && items.drinkPlace === place) { bottle(iconX, 457); iconX += 29; }
        if (items.phoneLocation === place) phone(iconX, 464);
      });
    }
    function cityWindow(x, y, w, h) {
      const evening = Number.isFinite(scene.minuteOfDay) ? scene.minuteOfDay % 1440 >= 1080 || scene.minuteOfDay % 1440 < 360 : scene.step >= 5;
      box(x - 10, y - 10, w + 20, h + 22, 4, '#e4d8c1');
      const gradient = ctx.createLinearGradient(0, y, 0, y + h);
      gradient.addColorStop(0, evening ? '#778d99' : '#b5d2ca');
      gradient.addColorStop(1, evening ? '#cbb8a1' : '#e8dfbd');
      box(x, y, w, h, 1, gradient);
      poly([[x + 6, y + 5], [x + w * .24, y + 5], [x + w * .72, y + h - 5], [x + w * .53, y + h - 5]], 'rgba(255,251,224,.13)');
      ellipse(x + w * .76, y + h * .25, 21, 21, evening ? '#f2ddbc' : '#f8ecc8');
      [0, 1, 2, 3, 4].forEach(i => {
        const bh = [51, 82, 64, 39, 70][i], bx = x + i * w / 5;
        box(bx, y + h - bh, w / 5 - 5, bh, 0, i % 2 ? '#8caaa0' : '#94b5a9');
        for (let r = 0; r < 3; r++) box(bx + 9, y + h - bh + 12 + r * 16, 9, 5, 1, evening ? '#e1cf9f' : '#bed0ba');
      });
      line([[x + w / 2, y], [x + w / 2, y + h]], colors.cream, 7);
      line([[x, y + h * .6], [x + w, y + h * .6]], colors.cream, 6);
      box(x - 14, y + h, w + 28, 11, 3, colors.cream);
    }
    function chair(x, y, wide) {
      const w = wide || 75;
      ellipse(x + w / 2, 395, w * .63, 6, 'rgba(68,75,57,.12)');
      line([[x + 10, y + 22], [x + 4, 391]], '#806b54', 8);
      line([[x + w - 10, y + 22], [x + w - 3, 391]], '#806b54', 8);
      box(x - 3, y - 78, 18, 92, 7, colors.teal);
      box(x, y, w, 20, 7, colors.teal);
    }
    function room() {
      ctx.fillStyle = gradient(0, 0, W, 380, [[0, '#f4ebd8'], [.65, '#eadeca'], [1, '#dfcfb6']]); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = gradient(0, 391, 0, H, [[0, '#cbb79b'], [1, '#e1cfb2']]); ctx.fillRect(0, 391, W, 109);
      box(0, 378, W, 15, 0, '#cdbb9f');
      poly([[120, 230], [330, 230], [610, 391], [275, 391]], 'rgba(255,246,214,.35)');
      cityWindow(72, 55, 270, 183);
      // Curtains sit outside the window, leaving the changing light visible.
      box(48, 43, 26, 210, 6, '#d7c6aa'); box(343, 43, 25, 210, 6, '#d7c6aa');
      line([[45, 43], [372, 43]], '#9b8c76', 4);
      ellipse(441, 436, 278, 36, '#c7bb9f');
      ellipse(441, 436, 249, 27, '#d9ceb4');
      // Low sofa with enough space for the braced leg to rest on a cushion.
      box(122, 269, 240, 77, 17, '#b7bd9e');
      box(138, 282, 94, 58, 13, '#c9cbb0'); box(238, 282, 105, 58, 13, '#c5c8aa');
      box(119, 328, 249, 35, 12, '#9fae90');
      box(109, 303, 25, 68, 10, '#aeb899'); box(350, 303, 25, 68, 10, '#aeb899');
      line([[137, 367], [133, 389]], '#786b51', 7); line([[348, 367], [354, 389]], '#786b51', 7);
      // Desk, journal and a modest laptop; no external image assets.
      chair(659, 330, 77);
      box(725, 303, 198, 13, 5, '#a77e58');
      line([[744, 317], [736, 391]], '#8b7055', 8); line([[902, 317], [909, 391]], '#8b7055', 8);
      box(789, 257, 74, 44, 5, colors.ink); box(795, 263, 62, 32, 2, '#b7cdc1');
      line([[801, 274], [835, 274]], '#749b90', 3); line([[801, 282], [846, 282]], '#90b0a0', 3);
      box(779, 299, 96, 5, 2, '#6d7c76');
      box(745, 296, 25, 7, 2, '#e3c69a'); if (!hasHomeItems()) cup(885, 286);
      plant(865, 213, .65); box(809, 236, 104, 8, 2, '#b28b62');
      plant(55, 354, .9);
      // Small clock and framed print.
      ellipse(518, 82, 26, 26, '#dfd0b6'); ellipse(518, 82, 22, 22, colors.cream);
      const minutes = Number.isFinite(scene.minuteOfDay) ? scene.minuteOfDay % 1440 : (scene.step >= 5 ? 20*60+16 : scene.step >= 4 ? 16*60+24 : scene.step >= 3 ? 13*60+16 : 612);
      const hour = minutes / 60 % 12;
      line([[518, 82], [518 + Math.sin(hour * Math.PI / 6) * 11, 82 - Math.cos(hour * Math.PI / 6) * 11]], colors.ink, 2.5);
      line([[518, 82], [518 + Math.sin(minutes % 60 * Math.PI / 30) * 17, 82 - Math.cos(minutes % 60 * Math.PI / 30) * 17]], colors.ink, 2);
      box(620, 63, 88, 102, 3, '#c2ab8b'); box(627, 70, 74, 88, 0, '#efe2c9');
      ellipse(667, 98, 15, 15, '#d4a76d'); poly([[634, 146], [657, 113], [676, 137], [695, 121], [695, 150]], '#91a18a');
      // A water bottle sits within reach rather than being carried while on crutches.
      box(402, 339, 60, 9, 4, '#af8660'); line([[415, 349], [413, 391]], '#917355', 5); line([[450, 349], [452, 391]], '#917355', 5);
      if (hasHomeItems()) roomItems(); else bottle(425, 311);
    }
    function hall() {
      ctx.fillStyle = '#e9dfcb'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#d6c7ae'; ctx.fillRect(0, 391, W, 109);
      box(0, 379, W, 13, 0, '#bcae95');
      // A door held open onto the same level; a low sill remains visible.
      box(83, 48, 244, 345, 7, '#b49c7b'); box(96, 59, 217, 333, 2, '#b6c8bd');
      const entrance = hasContext() ? scene.context.entrance : null;
      if (entrance && entrance.mode === 'automatic') {
        box(96, 59, 67, 329, 2, '#a0bbb1'); box(246, 59, 67, 329, 2, '#a0bbb1');
        box(104, 75, 51, 283, 1, '#c1d7c6'); box(254, 75, 51, 283, 1, '#c1d7c6');
        box(188, 64, 33, 8, 4, colors.ink);
        line([[145, 232], [119, 232], [127, 225]], colors.teal, 3); line([[119, 232], [127, 239]], colors.teal, 3);
        line([[264, 232], [290, 232], [282, 225]], colors.teal, 3); line([[290, 232], [282, 239]], colors.teal, 3);
      } else if (entrance && !entrance.passed && !entrance.heldBy) {
        box(96, 59, 217, 329, 2, '#c5ac86'); box(112, 81, 184, 112, 2, '#b4cabd');
        line([[285, 221], [285, 249]], colors.ink, 5);
      } else {
        poly([[96, 59], [173, 91], [173, 385], [96, 392]], '#c5ac86');
        line([[157, 222], [157, 248]], colors.ink, 4);
      }
      if (entrance) {
        ctx.fillStyle = colors.ink; ctx.font = '600 17px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(entrance.mode === 'automatic' ? '자동문' : '미는 문', 205, 37); ctx.textAlign = 'left';
      }
      box(96, 387, 222, 6, 1, '#8e8c7b');
      box(433, 111, 130, 80, 6, '#d8ccb4');
      box(445, 122, 106, 58, 3, '#eee5d4');
      // Arrow sign is a landmark rather than an instructional overlay.
      line([[472, 151], [524, 151], [512, 140]], colors.teal, 5); line([[524, 151], [512, 162]], colors.teal, 5);
      box(724, 294, 166, 50, 10, '#a1b399'); box(711, 337, 192, 21, 7, '#8ca58b');
      line([[732, 357], [726, 391]], '#727b66', 7); line([[883, 357], [889, 391]], '#727b66', 7);
      plant(647, 351, 1);
      line([[376, 61], [376, 374]], '#d1c3aa', 2);
      ellipse(459, 434, 224, 28, 'rgba(149,128,98,.12)');
    }

    function publicInterior() {
      // A shared ground plane and converging joints anchor the person and fixtures.
      ctx.fillStyle = gradient(0, 0, 0, 391, [[0, '#e6e0d4'], [.65, '#f1e9d8'], [1, '#d5c9b5']]);
      ctx.fillRect(0, 0, W, 391);
      poly([[0, 0], [355, 32], [355, 391], [0, 391]], '#ded7c8');
      line([[355, 32], [355, 391]], '#c2b8a8', 3);
      ctx.fillStyle = gradient(0, 391, 0, 500, [[0, '#bfbba9'], [1, '#ded4be']]); ctx.fillRect(0, 391, W, 109);
      line([[0, 391], [960, 391]], '#a8a793', 3);
      [40, 250, 480, 710, 930].forEach(x => line([[mix(500, x, .5), 391], [x, 500]], 'rgba(114,111,94,.22)', 1));
      [416, 450, 490].forEach(y => line([[0, y], [960, y]], 'rgba(114,111,94,.18)', 1));
      box(49, 62, 267, 167, 3, '#728982', '#b1afa1', 7);
      box(59, 72, 247, 147, 1, gradient(59, 72, 306, 219, [[0, '#b9cdc5'], [.5, '#d8e1d1'], [1, '#98aea4']]));
      poly([[61, 76], [127, 76], [253, 219], [192, 219]], 'rgba(255,252,230,.22)');
      line([[182, 71], [182, 219]], '#8a9a90', 5); line([[60, 175], [305, 175]], '#a4b0a1', 3);
      // The seat stays away from the entrance/steps; the existing seated pose uses it.
      ellipse(194, 399, 104, 10, 'rgba(52,65,57,.16)');
      box(105, 291, 183, 47, 8, gradient(105, 291, 105, 338, [[0, '#a6b19a'], [1, '#7a8d76']]));
      box(96, 335, 200, 20, 5, gradient(96, 335, 96, 355, [[0, '#b3bca4'], [1, '#6f826c']]));
      line([[114, 356], [109, 391]], '#68756a', 7); line([[280, 356], [285, 391]], '#68756a', 7);
      plant(45, 353, .68);
      const encounter = environmentState();
      if (encounter.kind === 'door') entranceDoor(encounter);
      else if (encounter.kind === 'escalator') escalator(encounter);
      else kiosk();
    }
    function entranceDoor(encounter) {
      const left = 581, right = 835, top = 83, floor = 391, center = 708;
      ellipse(center + 7, 399, 143, 15, 'rgba(53,65,60,.18)');
      box(left - 11, top - 14, right - left + 24, floor - top + 14, 4,
        gradient(left, 0, right, 0, [[0, '#687d76'], [.1, '#c6cdc0'], [.92, '#8c9e94'], [1, '#4e6862']]));
      box(left + 1, top, right - left - 2, floor - top, 0, gradient(left, top, right, floor, [[0, '#809d91'], [.65, '#b4c5b4'], [1, '#d6d1bb']]));
      line([[left + 22, 326], [right - 22, 326]], '#a1b2a0', 2);
      line([[left + 62, 83], [left + 62, 326]], '#a1b2a0', 2);
      if (encounter.doorType === 'revolving') {
        // Radial glass panes rotate in a cylinder, while the character stays outside.
        ellipse(center, 386, 125, 24, '#a4b0a0');
        ellipse(center, 103, 125, 24, gradient(left, 103, right, 103, [[0, '#577770'], [.48, '#d4ddd0'], [1, '#577770']]));
        const panes = Array.from({ length: 3 }, (_, i) => {
          const angle = encounter.rotationRadians + i * Math.PI * 2 / 3;
          return { x: center + Math.cos(angle) * 117, z: Math.sin(angle) * 21 };
        }).sort((a, b) => a.z - b.z);
        for (const pane of panes) {
          poly([[center, 106], [pane.x, 106 + pane.z], [pane.x, 386 + pane.z], [center, 386]],
            gradient(center, 106, pane.x, 386, [[0, 'rgba(218,235,221,.56)'], [.5, 'rgba(133,171,162,.27)'], [1, 'rgba(221,235,224,.6)']]));
          line([[center, 106], [pane.x, 106 + pane.z], [pane.x, 386 + pane.z], [center, 386]], '#5c8078', 3);
          line([[pane.x, 106 + pane.z], [pane.x, 386 + pane.z]], '#c9d6cb', 1);
          line([[mix(center, pane.x, .2), 252 + pane.z * .2], [mix(center, pane.x, .78), 252 + pane.z * .78]], '#53766f', 5);
        }
        line([[center, 94], [center, 393]], '#587b71', 8);
        line([[center - 2, 98], [center - 2, 390]], '#c1d1c2', 2);
        [left + 2, right - 2].forEach(x => line([[x, 103], [x, 386]], '#718e81', 8));
        ctx.beginPath(); ctx.ellipse(center, 386, 125, 24, 0, 0, Math.PI); ctx.strokeStyle = '#68877a'; ctx.lineWidth = 6; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(center, 106, 125, 24, 0, 0, Math.PI * 2); ctx.strokeStyle = '#afc1b2'; ctx.lineWidth = 5; ctx.stroke();
        // A curved floor marker makes the round route legible in a still frame.
        ctx.beginPath(); ctx.ellipse(center, 423, 100, 18, 0, .15, 2.7); ctx.strokeStyle = '#7c8a70'; ctx.lineWidth = 3; ctx.stroke();
        poly([[619, 430], [629, 426], [628, 436]], '#7c8a70');
      } else if (encounter.doorType === 'automatic') {
        const opening = encounter.doorOpenFraction;
        ctx.save(); ctx.beginPath(); ctx.rect(left + 1, top, right - left - 2, floor - top); ctx.clip();
        for (const side of [-1, 1]) {
          const x = center + (side < 0 ? -124 : 0) + side * opening * 100;
          box(x, top + 4, 124, 299, 0, gradient(x, top, x + 124, floor, [[0, '#aec9bd'], [.52, '#d2e0ce'], [1, '#8eada1']]), '#66877c', 4);
          poly([[x + 8, top + 12], [x + 30, top + 12], [x + 112, 299], [x + 90, 299]], 'rgba(255,255,244,.24)');
          line([[x + 11, 257], [x + 112, 257]], '#86a494', 5);
        }
        ctx.restore();
        box(center - 20, top - 7, 40, 10, 4, '#3d5653'); ellipse(center, top - 2, 3, 2, '#b5cf96');
        for (const side of [-1, 1]) {
          const x = center + side * 93;
          line([[x - side * 14, 239], [x + side * 12, 239], [x + side * 5, 232]], colors.cream, 3);
          line([[x + side * 12, 239], [x + side * 5, 246]], colors.cream, 3);
        }
      } else {
        const open = encounter.phase === 'passed' || encounter.phase === 'passing' || scene.context?.entrance?.heldBy ? .92 : .02;
        const edge = left + 244 * Math.cos(open), inset = Math.sin(open) * 29;
        const panel = [[left + 3, top + 3], [edge, top + 3 + inset], [edge, floor - 5], [left + 3, floor - 5]];
        poly(panel, gradient(left, 0, edge, 0, [[0, '#a6825f'], [.2, '#bc9b74'], [.72, '#aa8058'], [1, '#75573f']]));
        line([...panel, panel[0]], '#725d48', 5);
        poly([[left + 20, top + 24], [edge - 19, top + 24 + inset], [edge - 19, 213], [left + 20, 213]],
          gradient(left, top, edge, 213, [[0, '#a4bdb0'], [1, '#d3ded0']]));
        line([[left + 27, top + 31], [edge - 28, 205]], 'rgba(245,248,229,.45)', 3);
        poly([[left + 17, 327], [edge - 15, 327], [edge - 15, 375], [left + 17, 375]], '#9da797');
        [132, 246, 348].forEach(y => box(left - 2, y, 10, 20, 2, '#6e7e74'));
        line([[edge - 31, 244], [edge - 31, 278]], '#405e59', 7);
        line([[edge - 33, 245], [edge - 33, 277]], '#bcc6b6', 2);
        box(left + 20, top + 6, 64, 14, 3, '#657c72');
        line([[left + 54, top + 17], [left + 112, top + 36], [edge - 48, top + 16 + inset]], '#566e65', 5);
      }
      box(left - 6, 387, right - left + 12, 7, 1, '#849286');
      box(left + 50, 37, 154, 29, 5, '#e9e6d8', '#b6bca9', 1);
      ctx.fillStyle = '#3e5b50'; ctx.font = '600 19px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(encounter.doorType === 'automatic' ? '자동문' : encounter.doorType === 'revolving' ? '회전문' : '무거운 미는 문', center, 58); ctx.textAlign = 'left';
    }
    function escalator(encounter) {
      const metal = gradient(530, 150, 905, 405, [[0, '#9caea3'], [.25, '#d3d9c8'], [.62, '#8e9f95'], [1, '#62796f']]);
      ellipse(721, 414, 200, 20, 'rgba(58,74,66,.14)');
      poly([[520, 390], [588, 390], [838, 174], [927, 174], [927, 227], [858, 227], [625, 435], [520, 435]], metal);
      box(523, 382, 83, 11, 1, '#6c7b70');
      for (let x = 530; x < 601; x += 7) line([[x, 383], [x, 391]], '#cad0b8', 1);
      ctx.save(); ctx.beginPath(); ctx.moveTo(586, 391); ctx.lineTo(839, 171); ctx.lineTo(902, 171); ctx.lineTo(648, 391); ctx.closePath(); ctx.clip();
      ctx.fillStyle = '#667b72'; ctx.fillRect(575, 165, 337, 230);
      for (let index = -2; index < 15; index++) {
        const x = 590 + (index + encounter.stepOffset) * 24;
        const y = 390 - (index + encounter.stepOffset) * 21;
        box(x - 1, y - 2, 62, 19, 0, gradient(0, y, 0, y + 19, [[0, '#aeb8a5'], [1, '#60776e']]));
        line([[x, y], [x + 61, y]], '#e0d9ab', 3);
        for (let offset = 8; offset < 57; offset += 8) line([[x + offset, y + 3], [x + offset, y + 15]], '#7d9183', 1);
      }
      ctx.restore();
      // Guard panels and rails remain separate from the floor where the person waits.
      poly([[522, 341], [581, 341], [823, 130], [922, 130], [922, 175], [839, 175], [594, 390], [522, 390]], 'rgba(180,204,188,.57)');
      line([[521, 341], [581, 341], [823, 130], [925, 130]], '#3d5b52', 10);
      line([[522, 338], [581, 338], [823, 127], [925, 127]], '#8ca797', 2);
      line([[544, 372], [608, 372], [847, 163], [925, 163]], '#cbd4c1', 4);
      line([[524, 414], [623, 414], [863, 201], [925, 201]], '#4e6e62', 10);
      line([[525, 411], [623, 411], [863, 198], [925, 198]], '#96ac9b', 2);
      line([[494, 389], [494, 430]], '#bd9d5e', 4);
      box(839, 55, 76, 40, 5, colors.teal); ctx.fillStyle = colors.cream; ctx.font = '700 25px sans-serif'; ctx.fillText('2F ↑', 849, 83);
      box(548, 71, 169, 30, 5, '#e9e6d8', '#b6bca9', 1); ctx.fillStyle = '#3e5b50'; ctx.font = '600 19px sans-serif'; ctx.fillText('에스컬레이터', 562, 93);
    }
    function kiosk() {
      // The upper controls are above the character's shoulder; the reader is off to one side.
      ellipse(712, 400, 116, 14, 'rgba(50,64,57,.22)');
      poly([[774, 107], [797, 93], [797, 366], [774, 383]], '#607c71');
      box(620, 92, 154, 283, 10, gradient(620, 0, 774, 0, [[0, '#aebdb0'], [.13, '#e2e5d7'], [.83, '#b1c0b3'], [1, '#7d9888']]), '#6c8679', 2);
      box(632, 105, 130, 150, 6, '#263f3e'); box(638, 111, 118, 138, 3, '#eeeede');
      box(638, 111, 118, 25, 3, '#3e7767'); ctx.fillStyle = '#f5f0dc'; ctx.font = '600 15px sans-serif'; ctx.fillText('메뉴 선택', 648, 129);
      for (const [x, y] of [[648, 147], [704, 147], [648, 192], [704, 192]]) {
        box(x, y, 43, 35, 3, '#dce3cf', '#bbc6ae', 1);
        ellipse(x + 21, y + 13, 12, 6, '#c99d5b'); line([[x + 10, y + 17], [x + 32, y + 17]], '#7a9c6c', 3);
        line([[x + 12, y + 26], [x + 30, y + 26]], '#9a9d80', 2);
      }
      poly([[641, 112], [652, 112], [738, 246], [727, 246]], 'rgba(255,255,244,.22)');
      box(731, 267, 43, 47, 5, '#365b51'); box(738, 274, 29, 13, 2, '#9fbaa5');
      line([[739, 299], [764, 299]], '#d5dfc8', 3); line([[741, 292], [762, 292]], '#243e39', 2);
      box(645, 276, 61, 8, 2, '#688375'); box(654, 282, 43, 51, 1, '#f1ecdc');
      [294, 302, 310].forEach(y => line([[661, y], [690, y]], '#bdc4ae', 2));
      box(647, 341, 103, 19, 3, '#a4b5a4'); box(606, 375, 190, 17, 5, '#6d877a');
      box(815, 278, 145, 16, 3, '#ad9471'); box(825, 294, 135, 97, 0, '#b6baa3');
      cup(856, 260); box(839, 232, 66, 24, 4, '#758f7b');
      box(635, 44, 131, 29, 5, '#e9e6d8', '#b6bca9', 1); ctx.fillStyle = '#3e5b50'; ctx.font = '600 19px sans-serif'; ctx.fillText('주문 키오스크', 644, 65);
    }
    function street() {
      const evening = Number.isFinite(scene.minuteOfDay) ? scene.minuteOfDay % 1440 >= 1080 || scene.minuteOfDay % 1440 < 360 : scene.step >= 5;
      ctx.fillStyle = evening ? '#a5b8b3' : '#c3d8cd'; ctx.fillRect(0, 0, W, H);
      ellipse(806, 70, 29, 29, evening ? '#f3ddb7' : '#f4e6b9');
      box(0, 164, W, 225, 0, '#c5ccb8');
      box(36, 66, 330, 324, 0, '#ded5be');
      box(66, 151, 117, 189, 3, '#8daba1'); box(202, 151, 131, 189, 3, '#8daba1');
      [81, 217].forEach(x => { box(x, 164, 90, 89, 2, '#bdd1ba'); line([[x + 43, 164], [x + 43, 253]], '#e9dfc6', 5); });
      box(51, 113, 299, 34, 3, colors.teal);
      [0, 1, 2, 3, 4, 5].forEach(i => box(51 + i * 50, 140, 50, 18, 5, i % 2 ? '#dce2c5' : '#4e8a7c'));
      box(43, 341, 319, 51, 0, '#b6b6a0');
      // Gentle ramp and level walking surface, kept free of steps.
      poly([[256, 390], [366, 355], [366, 390]], '#aea994');
      line([[274, 337], [367, 309], [400, 309]], '#6f8c80', 5);
      line([[290, 335], [290, 377]], '#6f8c80', 4); line([[365, 310], [365, 356]], '#6f8c80', 4);
      box(0, 391, W, 109, 0, '#d8d0b9');
      line([[0, 457], [960, 457]], '#c3baa5', 2);
      [110, 320, 530, 740].forEach(x => line([[x, 391], [x - 25, 500]], '#c7bfaa', 1.5));
      // Bench and shade near the route.
      box(720, 291, 174, 43, 5, '#b2916d'); box(709, 337, 197, 15, 4, '#a47e59');
      [300, 314].forEach(y => line([[726, y], [889, y]], '#9e7f5d', 2));
      line([[732, 354], [727, 391]], colors.ink, 6); line([[885, 354], [891, 391]], colors.ink, 6);
      line([[817, 259], [817, 86]], '#87927a', 16);
      ellipse(818, 104, 76, 61, '#93ad8d'); ellipse(770, 128, 49, 44, '#a7bc95'); ellipse(865, 138, 55, 46, '#9bb48e');
      plant(645, 354, 1);
      ellipse(504, 431, 128, 19, 'rgba(118,121,96,.12)');
    }

    function stairs() {
      ctx.fillStyle = '#e9dfcb'; ctx.fillRect(0, 0, W, H);
      cityWindow(63, 55, 183, 157);
      box(744, 62, 175, 268, 5, '#bca98c'); box(755, 73, 153, 257, 2, '#d0c7ac');
      box(771, 93, 120, 106, 3, '#c0d1bc');
      line([[832, 94], [832, 198]], '#e9dfc6', 5);
      line([[883, 238], [883, 260]], colors.ink, 4);
      box(651, 65, 68, 49, 7, colors.teal);
      ctx.fillStyle = colors.cream; ctx.font = '700 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('2F', 685, 99); ctx.textAlign = 'left';
      // Four visible rises compress the journey to the second-floor landing.
      // The drawing conveys effort, not a prescribed stair-climbing technique.
      const profile = [[0, 430], [360, 430]];
      for (let i = 0; i < 4; i++) {
        const x = 360 + i * 74, y = 405 - i * 25;
        profile.push([x, y], [i === 3 ? 960 : x + 74, y]);
      }
      profile.push([960, 500], [0, 500]); poly(profile, '#c9b799');
      for (let i = 0; i < 4; i++) {
        const x = 360 + i * 74, y = 405 - i * 25;
        box(x, y, i === 3 ? 378 : 74, 8, 0, '#e3d4b9');
        line([[x + 1, y + 10], [x + 1, y + 25]], '#a89476', 2);
      }
      line([[0, 431], [356, 431]], '#e3d4b9', 6);
      // The hand follows this exact rail curve throughout the illustrated ascent.
      [306, 380, 454, 528, 602, 800].forEach(x => line([[x, railHeight(x)], [x, stairSurface(x)]], '#8b9987', 6));
      line([[278, railHeight(278)], [640, 210], [915, 210]], colors.teal, 10);
      line([[278, railHeight(278) - 3], [640, 207], [915, 207]], '#5f9380', 3);
      if (scene.destinationPose) {
        box(602, 220, 123, 45, 7, '#a6b399');
        box(592, 269, 145, 15, 5, '#8f9f84');
        line([[608, 284], [602, 330]], '#6d7f6a', 6); line([[724, 284], [730, 330]], '#6d7f6a', 6);
      }
      plant(76, 393, .85);
      box(137, 290, 99, 65, 5, '#d9cbb1');
      box(148, 301, 77, 42, 3, '#eee4ce');
      line([[165, 321], [205, 321], [196, 313]], colors.teal, 4); line([[205, 321], [196, 329]], colors.teal, 4);
    }

    function liftedPath(from, to, progress, clearance) {
      const p = clamp(progress, 0, 1), raised = Math.min(from[1], to[1]) - clearance;
      if (p < .25) return [from[0], mix(from[1], raised, smooth(p / .25))];
      if (p < .75) return [mix(from[0], to[0], smooth((p - .25) / .5)), raised];
      return [to[0], mix(raised, to[1], smooth((p - .75) / .25))];
    }
    function bentKnee(hip, foot, length) {
      const dx = foot[0] - hip[0], dy = foot[1] - hip[1], distance = Math.max(1, Math.hypot(dx, dy));
      const bend = Math.sqrt(Math.max(0, length * length - distance * distance / 4));
      return [(hip[0] + foot[0]) / 2 + dy / distance * bend, (hip[1] + foot[1]) / 2 - dx / distance * bend];
    }
    function stairPose(time, active, fatigue) {
      const total = stairDuration * 4;
      const progress = Math.min(4, time / stairDuration);
      const index = Math.min(3, Math.floor(progress));
      const phase = progress >= 4 ? 1 : progress - index;
      const oldX = 332 + index * 74, oldFloor = 430 - index * 25;
      const transfer = smooth((phase - .43) / .37);
      const recovering = time >= total;
      const lower = recovering && scene.destinationPose ? smooth((time - total) / 1100) : 0;
      const x = oldX + 8 + 74 * transfer, y = oldFloor - 96 - 25 * transfer + 32 * lower;
      const footProgress = clamp((phase - .32) / .30, 0, 1);
      const supportProgress = clamp((phase - .08) / .20, 0, 1);
      const leftFoot = liftedPath([oldX, oldFloor - 7], [oldX + 74, oldFloor - 32], footProgress, 12);
      leftFoot[0] = mix(leftFoot[0], x + 58, lower);
      const tip = liftedPath([oldX - 20, oldFloor], [oldX + 54, oldFloor - 25], supportProgress, 17);
      const rightFoot = [mix(x - 16, x + 83, lower), mix(oldFloor - 32 - 25 * transfer, 315, lower)];
      const strain = Math.sin(Math.PI * transfer);
      const recovery = recovering ? smooth((time - total) / 1100) : 0;
      const shoulderX = x + 7 + 10 * strain - 7 * lower;
      const breath = lower >= 1 ? Math.sin(Math.PI * clamp((time - total - 1100) / 600, 0, 1)) * .9 : 0;
      const shoulderY = y - 78 - fatigue * .35 + recovery * 2 + breath;
      const release = smooth((lower - .75) / .25);
      const railHand = [mix(x + 29, x + 23, release), mix(railHeight(x + 29), y + 1, release)];
      const onFoot = Math.abs(leftFoot[1] + 7 - stairSurface(leftFoot[0])) < .02;
      const onCrutch = Math.abs(tip[1] - stairSurface(tip[0])) < .02;
      return { x, y, shoulderX, shoulderY, leftFoot, rightFoot,
        leftKnee: bentKnee([x - 7, y], leftFoot, 50), rightKnee: bentKnee([x + 6, y - 1], rightFoot, 45),
        railHand, crutchTip: tip, crutchTipX: tip[0], crutchLift: onCrutch ? 0 : 1,
        phase: !active ? 'settled' : recovering ? scene.destinationPose && lower < 1 ? 'settling-into-seat' : 'landing-recovery' : phase < .08 || phase >= .8 ? 'pause' : phase < .30 ? 'placing-support' : 'step-transfer',
        support: lower > .8 ? 'seat' : recovering ? 'landing-and-handrail' : onFoot ? 'foot-and-handrail' : 'crutch-and-handrail',
        contacts: { leftFoot: onFoot, crutches: onCrutch, seat: lower > .8, handrail: release < .001 },
        moving: active, seated: lower, lean: strain, fatigue, kind: 'stairs',
        movementStep: Math.min(4, index + 1), movementProgress: (index + transfer) / 4,
        rise: 25 * (index + transfer), landing: recovering };
    }

    function basePose() {
      const time = reduced ? motionDuration : Math.min(elapsed, motionDuration);
      const active = !reduced && elapsed < motionDuration;
      const fatigue = Math.max(scene.body.shoulder || 0, scene.body.goodLeg || 0, scene.body.back || 0);
      if (scene.kind === 'stairs') return stairPose(time, active, fatigue);
      const destination = scene.destinationPose;
      const seatedKinds = ['sit', 'desk', 'phone', 'rest', 'observe'];
      const seatX = kind => scene.encounter ? 205 : scene.location !== 'room' ? 779 : kind === 'desk' ? 698 : 281;
      const gaitTime = gaitDuration * 3;
      if (scene.kind === 'walk' && (!destination || time < gaitTime)) {
        const cycleCount = 3, stride = 55;
        const progress = Math.min(cycleCount, time / gaitDuration);
        const cycle = Math.min(cycleCount - 1, Math.floor(progress));
        const phase = progress >= cycleCount ? 1 : progress - cycle;
        const transfer = smooth((phase - .34) / .47);
        const base = (destination ? seatX(destination) - cycleCount * stride : 390) + cycle * stride;
        const x = base + stride * transfer;
        const crutchAdvance = smooth(phase / .30);
        const footAdvance = smooth((phase - .40) / .45);
        const footLift = Math.sin(Math.PI * footAdvance) * 12;
        const isSettled = !active || phase > .85;
        return { x, y: 296 - Math.sin(Math.PI * transfer) * 3,
          shoulderX: x + 5 + Math.sin(Math.PI * transfer) * 8,
          shoulderY: 218 - fatigue * .35,
          leftFoot: [base - 8 + stride * footAdvance, 385 - footLift],
          rightFoot: [x + 29, 368 - Math.sin(Math.PI * transfer) * 3],
          crutchTipX: base + 21 + stride * crutchAdvance,
          crutchLift: Math.sin(Math.PI * crutchAdvance) * 7,
          phase: !active ? 'settled' : phase < .32 ? 'crutches-forward' : phase < .83 ? 'hand-supported-transfer' : 'pause',
          support: phase >= .34 && phase < .85 && active ? 'both-crutches' : 'left-foot-and-crutches',
          moving: active, seated: 0, lean: isSettled ? .035 : .07, fatigue, kind: scene.kind,
          movementStep: Math.min(3, cycle + 1), movementProgress: (cycle + transfer) / 3 };
      }
      const kind = scene.kind === 'walk' ? destination : scene.kind;
      const seatTime = scene.kind === 'walk' ? time - gaitTime : time;
      const seated = seatedKinds.includes(kind);
      const t = smooth(seatTime / 1100);
      const onBench = (scene.location !== 'room' || scene.encounter) && seated;
      const x = seated ? seatX(kind) : scene.location === 'street' ? 530 : 405;
      const lower = seated ? t : 0;
      const breathe = scene.kind === 'walk' && active ? Math.sin(seatTime / 530) * .8 * lower : 0;
      const rest = kind === 'rest' && !onBench;
      const hipY = mix(296, 327, lower);
      const shoulderX = x + mix(5, rest ? -23 : kind === 'desk' ? 11 : 0, lower);
      return { x, y: hipY, shoulderX, shoulderY: hipY - 78 - breathe - mix(fatigue * .35, fatigue * .2, lower),
        leftFoot: [mix(x - 8, x + 58, lower), 385],
        rightFoot: [mix(x + 29, rest ? x + 119 : x + 83, lower), mix(368, rest ? 354 : 377, lower)],
        crutchTipX: x + 21, crutchLift: 0,
        phase: active ? (seated ? 'settling-into-seat' : 'looking-out') : 'settled',
        support: seated && lower > .8 ? 'seat' : 'left-foot-and-crutches',
        moving: active, seated: lower, lean: rest ? -.2 : .035, fatigue, kind,
        movementStep: scene.kind === 'walk' ? 3 : null, movementProgress: scene.kind === 'walk' ? 1 : 0 };
    }

    function activityFor(p) {
      const time = reduced ? motionDuration : Math.min(elapsed, motionDuration);
      const progress = clamp(time / motionDuration, 0, 1);
      const variation = (Math.max(1, Math.floor(Number(scene.step) || 1)) - 1 + ['sit', 'phone', 'desk', 'rest', 'observe', 'stand'].indexOf(p.kind) + 6) % 3;
      const names = {
        sit: ['release-grip', 'settle-shoulders', 'rest-palms'],
        phone: ['read-and-scroll', 'tap-and-read', 'check-and-lower'],
        desk: ['type-and-pause', 'read-and-type', 'small-edit'],
        rest: ['slow-exhale', 'rest-open-hands', 'relax-shoulders'],
        observe: ['look-toward-window', 'look-around', 'quiet-observation'],
        stand: ['check-space-ahead', 'look-and-wait', 'release-shoulder-tension']
      };
      const expressive = scene.kind !== 'walk' && scene.kind !== 'stairs';
      // The hands leave the crutches only after the seated pose has support.
      const gesture = expressive && p.moving ? Math.sin(Math.PI * clamp((time - 1050) / 1950, 0, 1)) : 0;
      const pulse = expressive && p.moving ? Math.sin((time - 1200) / (190 + variation * 35)) * gesture : 0;
      const breath = expressive && p.moving ? Math.sin(Math.PI * progress) * (1.6 + p.fatigue * .08) : 0;
      const headTurn = gesture * (p.kind === 'observe' ? [-.16, .13, -.09][variation] : p.kind === 'phone' ? .10 : p.kind === 'desk' ? .085 : p.kind === 'stand' ? [-.08, .075, -.045][variation] : -.07);
      const handMotion = p.seated > .85 ? pulse : 0;
      return {
        name: names[p.kind] ? names[p.kind][variation] : p.kind === 'stairs' ? 'supported-ascent' : 'careful-walk',
        variation, progress, active: expressive && p.moving,
        phase: !p.moving ? 'settled' : !expressive ? p.phase : time < 1100 ? p.kind === 'stand' ? 'looking-ahead' : 'settling-into-seat' : time < 2500 ? 'small-action' : 'relaxing',
        headTurn, breath, gesture, handMotion,
        blink: expressive && p.moving && progress > .60 + variation * .025 && progress < .65 + variation * .025,
        gaze: headTurn < 0 ? -1 : headTurn > .02 ? 1 : 0
      };
    }
    function getPose() {
      const p = basePose();
      p.activity = activityFor(p);
      if (scene.kind !== 'walk' && scene.kind !== 'stairs') {
        p.shoulderY -= p.activity.breath;
        p.shoulderX += p.activity.gesture * (p.kind === 'rest' ? -2.5 : p.kind === 'desk' ? 2 : 0);
        p.phase = p.activity.phase;
      }
      return p;
    }

    function crutch(tipX, tipY, lean, alpha) {
      const topX = tipX - lean;
      ctx.save(); ctx.globalAlpha = alpha;
      ellipse(tipX + 1, 393, tipY >= 390 ? 7 : 10, 2, tipY >= 390 ? 'rgba(45,67,59,.20)' : 'rgba(45,67,59,.06)');
      line([[topX - 8, 244], [topX + 1, 292], [tipX, tipY - 6]], colors.metal, 4);
      line([[topX + 8, 244], [topX + 9, 292], [tipX, tipY - 6]], colors.metal, 4);
      line([[topX - 9, 246], [topX, 292], [tipX - 1, tipY - 8]], '#d4ded1', 1);
      line([[topX + 9, 246], [topX + 10, 292], [tipX + 1, tipY - 8]], '#6e8880', 1);
      line([[topX - 10, 242], [topX + 11, 242]], colors.rubber, 8);
      line([[topX - 2, 281], [topX + 11, 281]], colors.rubber, 5);
      line([[tipX - 3, tipY - 2], [tipX + 3, tipY - 2]], colors.rubber, 7);
      ctx.restore();
      return [topX + 5, 279];
    }
    function leg(hip, knee, ankle, front, braced) {
      line([hip, knee, ankle], front ? colors.trouser : '#4a6066', front ? 20 : 17);
      line([hip, knee, ankle].map(([x, y]) => [x - 4, y]), front ? '#526872' : '#617477', 3);
      const footX = ankle[0], footY = ankle[1];
      ctx.save(); ctx.translate(footX, footY); ctx.rotate(braced ? -.05 : .02);
      box(-9, -4, 33, 12, 5, colors.shoe);
      line([[-7, 7], [23, 7]], '#b8aa90', 3);
      if (braced) {
        // A pale plaster cast, with soft wrap lines instead of brace straps.
        const plaster = gradient(-10, 0, 17, 0, [[0, '#d2d3c8'], [.3, '#faf7ea'], [.68, '#f0ecdf'], [1, '#bfc4b7']]);
        box(-10, -28, 21, 31, 4, plaster, '#a6aa9e', 1.2);
        box(-7, -7, 29, 15, 5, plaster, '#a6aa9e', 1.2);
        for (const y of [-22,-15,-8]) line([[-8,y],[9,y+2]], '#d0d1c4', 1.4);
        line([[-3,0],[18,2]], '#d0d1c4', 1.4);
      }
      ctx.restore();
    }
    function head(x, y, tilt, activity) {
      const feminine = scene.appearance.gender === 'female', style = scene.appearance.hairStyle;
      const a = activity || { headTurn: 0, blink: false, gaze: 0 };
      ctx.save(); ctx.translate(x, y); ctx.rotate(tilt + a.headTurn); ctx.scale(.9, .94);
      const hair = gradient(-27, -42, 19, 8, [[0, '#605248'], [.5, '#403b36'], [1, '#302f2b']]);
      // Hair silhouette is independent of gender; all six styles use the same face anchor.
      if (style === 'ponytail') {
        ctx.beginPath(); ctx.moveTo(-19, -29); ctx.bezierCurveTo(-47, -36, -48, -12, -38, 15);
        ctx.bezierCurveTo(-31, 23, -29, 16, -32, 8); ctx.bezierCurveTo(-25, -8, -21, -15, -19, -29); ctx.fillStyle = hair; ctx.fill();
        line([[-26, -24], [-31, -18]], '#b69b72', 4);
      } else if (style === 'bun') {
        ellipse(-25, -34, 13, 12, hair); ellipse(-29, -37, 9, 7, '#53473d');
        line([[-33, -33], [-27, -29], [-20, -32]], '#7d6652', 1.8);
      } else if (style === 'bob') {
        ctx.beginPath(); ctx.moveTo(-21, -36); ctx.bezierCurveTo(-34, -20, -29, 0, -28, 13);
        ctx.quadraticCurveTo(-4, 19, 17, 8); ctx.lineTo(19, -26); ctx.closePath(); ctx.fillStyle = hair; ctx.fill();
      } else if (style === 'wavy') {
        [[-18,-28,12,13],[-10,-37,12,10],[4,-39,12,10],[16,-31,12,12],[-23,-13,8,13],[-19,0,8,8]].forEach(v=>ellipse(...v,hair));
      }
      line([[0, 5], [0, 19]], colors.skin, feminine ? 11 : 13);
      ellipse(0, -12, feminine ? 19 : 21, feminine ? 25 : 26, gradient(-20, -20, 21, 0, [[0, '#ad7658'], [.5, '#dba17b'], [1, '#e8b38c']]));
      poly([[feminine ? 14 : 15, -15], [feminine ? 22 : 24, -6], [16, -3]], colors.skinLight);
      if (style === 'crop') {
        ellipse(-2, -29, 21, 15, hair); box(-23, -29, 12, 29, 6, hair);
        line([[-16,-31],[-10,-36],[0,-37]], '#776255', 1.5);
      } else if (style === 'side-part') {
        ctx.beginPath(); ctx.moveTo(-23, -8); ctx.lineTo(-25, -25); ctx.bezierCurveTo(-27,-44,6,-50,22,-32);
        ctx.quadraticCurveTo(14,-21,-5,-23); ctx.lineTo(-11,-7); ctx.closePath(); ctx.fillStyle=hair; ctx.fill();
        line([[-10,-38],[-3,-31],[15,-27]], '#9b7e65', 1.8);
      } else if (style === 'wavy') {
        [[-17,-25,9,10],[-9,-31,10,9],[1,-32,10,8],[11,-29,9,8],[18,-23,6,7]].forEach(v=>ellipse(...v,hair));
        line([[-17,-31],[-11,-35],[-5,-31],[2,-35],[9,-32]], '#8c705b', 1.7);
      } else if (style === 'bob') {
        ctx.beginPath(); ctx.moveTo(-25,6); ctx.lineTo(-26,-24); ctx.bezierCurveTo(-25,-46,10,-48,22,-28);
        ctx.lineTo(14,-18); ctx.quadraticCurveTo(4,-30,-8,-24); ctx.lineTo(-10,9); ctx.closePath(); ctx.fillStyle=hair;ctx.fill();
        line([[-20,-25],[-20,-1]], '#7c6654', 1.6);
      } else {
        ctx.beginPath(); ctx.moveTo(-23,-5); ctx.lineTo(-24,-24); ctx.bezierCurveTo(-22,-47,10,-46,21,-28);
        ctx.quadraticCurveTo(6,-26,-9,-21); ctx.lineTo(-11,-3); ctx.closePath(); ctx.fillStyle=hair;ctx.fill();
        line([[-19,-29],[-9,-35],[7,-34]], '#7d6855', 1.6);
      }
      if(style !== 'bob') ellipse(-13,-7,4.5,6.5,colors.skin);
      if(a.blink) line([[8,-13],[14,-13]],colors.ink,1.5);
      else {
        line([[8,-16],[13,-16]],colors.ink,feminine ? 1.5 : 2);
        ellipse(12 + a.gaze*.8,-12,1.4,1.6,colors.ink);
      }
      line([[12, 1], [17, 0]], '#875d4d', 1.5);
      if(!feminine) line([[5,8],[12,7]],'rgba(115,76,58,.32)',1);
      ctx.restore();
    }
    function stairCharacter(p) {
      const hip = [p.x, p.y], shoulder = [p.shoulderX, p.shoulderY];
      const cloth = outfit(), shoulderWidth = scene.appearance.gender === 'female' ? 16 : 19;
      const tip = p.crutchTip, padX = tip[0] + 4, padY = tip[1] - 149;
      const release = smooth((p.seated - .75) / .25);
      const grip = [mix(padX + 5, p.x + 48, release), mix(padY + 37, p.y + 2, release)];
      // A rail and a hand-held support remain visible. This is a compressed
      // narrative illustration, deliberately without numbered gait instructions.
      ellipse(p.leftFoot[0] + 7, stairSurface(p.leftFoot[0]) + 3, 23, 4, 'rgba(73,74,60,.12)');
      line([[padX - 8, padY + 2], [padX + 1, padY + 50], [tip[0], tip[1] - 4]], colors.metal, 4);
      line([[padX + 8, padY + 2], [padX + 9, padY + 50], [tip[0], tip[1] - 4]], colors.metal, 4);
      line([[padX - 10, padY], [padX + 11, padY]], colors.rubber, 8);
      line([[padX - 2, padY + 39], [padX + 11, padY + 39]], colors.rubber, 5);
      line([[tip[0] - 3, tip[1] - 3], [tip[0] + 3, tip[1] - 3]], colors.rubber, 6);
      leg([hip[0] - 7, hip[1]], p.leftKnee, p.leftFoot, false, false);
      leg([hip[0] + 6, hip[1] - 1], p.rightKnee, p.rightFoot, true, true);
      poly([[shoulder[0] - shoulderWidth + 1, shoulder[1] + 3], [shoulder[0] + shoulderWidth + 1, shoulder[1] + 4],
        [hip[0] + 19, hip[1] - 5], [hip[0] - 17, hip[1] - 4]], gradient(shoulder[0] - 18, shoulder[1], hip[0] + 19, hip[1], [[0, cloth[0]], [.45, cloth[1]], [1, cloth[2]]]));
      line([[hip[0] - 14, hip[1] - 6], [hip[0] + 15, hip[1] - 6]], cloth[4], 5);
      const railElbow = [mix(shoulder[0] - 10, p.railHand[0], .35), shoulder[1] + 41];
      line([[shoulder[0] - 10, shoulder[1] + 8], railElbow], cloth[4], 14);
      line([railElbow, p.railHand], colors.skin, 10);
      ellipse(p.railHand[0], p.railHand[1] - 1, 7, 5, colors.skin);
      head(shoulder[0] + 1, shoulder[1] - 20, .055 + p.lean * .08 + p.fatigue * .003, p.activity);
      line([[shoulder[0] - 5, shoulder[1] + 2], [shoulder[0] + 7, shoulder[1] + 4]], '#c2ccac', 3);
      const elbow = [mix(shoulder[0] + 21, grip[0] - 12, .45), mix(shoulder[1] + 40, grip[1] - 13, .5)];
      line([[shoulder[0] + 14, shoulder[1] + 10], elbow], cloth[3], 16);
      line([elbow, grip], colors.skinLight, 11);
      ellipse(grip[0], grip[1], 7, 5, colors.skinLight);
      p.leftHand = [...p.railHand]; p.rightHand = grip;
    }
    function character(p) {
      if (p.kind === 'stairs') { stairCharacter(p); return; }
      const x = p.x, hip = [x, p.y], shoulder = [p.shoulderX, p.shoulderY];
      const a = p.activity, cloth = outfit(), shoulderWidth = scene.appearance.gender === 'female' ? 16 : 19;
      const sit = p.seated, rest = p.kind === 'rest' && scene.location === 'room' && !scene.encounter;
      ellipse(x + 24, 399, sit > .6 ? 78 : 68, 11, 'rgba(73,74,60,.14)');
      const planted = p.leftFoot[1] >= 384.99;
      ellipse(p.leftFoot[0] + 8, 393, planted ? 20 : 24, planted ? 3 : 5, planted ? 'rgba(42,61,53,.23)' : 'rgba(42,61,53,.06)');
      ellipse(p.rightFoot[0] + 9, 394, 24, 5, 'rgba(42,61,53,.06)');
      if (rest && sit > .7) {
        box(x + 80, 361, 64, 17, 7, '#e8d4ab');
        box(x + 86, 377, 50, 7, 4, '#ab8960');
        line([[x + 92, 384], [x + 91, 393]], '#8e7557', 4);
        line([[x + 129, 384], [x + 130, 393]], '#8e7557', 4);
      }
      // Once seated, move the equipment beside the chair continuously.
      // Both feet and the seat remain supported throughout this transition.
      const release = smooth((sit - .45) / .55);
      const park = smooth((sit - .65) / .35);
      const parkedX = p.kind === 'desk' ? x - 75 : x - 99;
      const lean = mix(27 + Math.max(0, p.crutchTipX - x - 20) * .2, 24, park);
      const rearHand = crutch(mix(p.crutchTipX - 28, parkedX, park), 391 - p.crutchLift, lean, .64);
      const frontTipX = mix(p.crutchTipX + 17, parkedX + 17, park);
      // Drawing the parked equipment behind the seated body keeps hands legible.
      const frontHand = crutch(frontTipX, 391 - p.crutchLift, lean, 1);
      const rearKnee = [mix(x - 7, x + 40, sit), mix(p.y + 43, p.y + 6, sit)];
      leg([hip[0] - 7, hip[1]], rearKnee, p.leftFoot, false, false);
      const frontKnee = [mix(x + 23, x + 51, sit), mix(p.y + 39, p.y + 7, sit)];
      leg([hip[0] + 6, hip[1] - 1], frontKnee, p.rightFoot, true, true);
      // Torso follows shoulder and pelvis rather than moving as a rigid sprite.
      const torso = [[shoulder[0] - shoulderWidth + 1, shoulder[1] + 3], [shoulder[0] + shoulderWidth + 1, shoulder[1] + 4],
        [hip[0] + 19, hip[1] - 5], [hip[0] - 17, hip[1] - 4]];
      poly(torso, gradient(shoulder[0] - 18, shoulder[1], hip[0] + 19, hip[1], [[0, cloth[0]], [.45, cloth[1]], [1, cloth[2]]]));
      line([[shoulder[0] - 6, shoulder[1] + 20], [hip[0] - 4, hip[1] - 10]], 'rgba(187,212,181,.22)', 2);
      line([[hip[0] - 14, hip[1] - 6], [hip[0] + 15, hip[1] - 6]], cloth[4], 5);
      const rearElbow = [mix(rearHand[0] - 14, x + 5, release), mix(rearHand[1] - 15, p.y - 10, release)];
      const rearGrip = [mix(rearHand[0], x + 23, release), mix(rearHand[1], p.y + 1, release)];
      if(sit > .85 && p.kind === 'phone') {
        rearElbow[0] = mix(rearElbow[0],shoulder[0]+22,a.gesture);
        rearElbow[1] = mix(rearElbow[1],shoulder[1]+30,a.gesture);
        rearGrip[0] = mix(rearGrip[0],shoulder[0]+37+a.handMotion*3,a.gesture);
        rearGrip[1] = mix(rearGrip[1],shoulder[1]-25+a.handMotion*4,a.gesture);
      } else if(sit > .85 && p.kind === 'desk') {
        rearElbow[0] = mix(rearElbow[0],x+33,a.gesture);
        rearElbow[1] = mix(rearElbow[1],302,a.gesture);
        rearGrip[0] = mix(rearGrip[0],x+65,a.gesture);
        rearGrip[1] = mix(rearGrip[1],299+a.handMotion*4,a.gesture);
      }
      line([[shoulder[0] - 10, shoulder[1] + 8], rearElbow], cloth[4], 14);
      line([rearElbow, rearGrip], colors.skin, 10);
      ellipse(rearGrip[0],rearGrip[1],6,4.5,colors.skin);
      head(shoulder[0] + 1, shoulder[1] - 20, rest ? -.08 * sit : .025 + p.fatigue * .003, a);
      line([[shoulder[0] - 5, shoulder[1] + 2], [shoulder[0] + 7, shoulder[1] + 4]], '#c2ccac', 3);
      const finalElbow = p.kind === 'phone' ? [shoulder[0] + 38, shoulder[1] + 38]
        : p.kind === 'desk' ? [x + 38, 297] : [x + 30, p.y - 18];
      const finalHand = p.kind === 'phone' ? [shoulder[0] + 30, shoulder[1] - 25]
        : p.kind === 'desk' ? [x + 79, 299] : [x + 48, p.y + 2];
      if(sit > .85) {
        if(p.kind === 'desk') { finalHand[0] += a.handMotion*6; finalHand[1] -= Math.abs(a.handMotion)*4; }
        else if(p.kind === 'phone') { finalHand[0] += a.gesture*2; finalHand[1] += a.handMotion*2; }
        else { finalHand[0] += a.gesture*7; finalHand[1] -= a.gesture*4; }
      }
      const elbow = [mix(mix(shoulder[0] + 25, frontHand[0] - 18, .45), finalElbow[0], release), mix(262, finalElbow[1], release)];
      const hand = [mix(frontHand[0], finalHand[0], release), mix(frontHand[1], finalHand[1], release)];
      line([[shoulder[0] + 14, shoulder[1] + 10], elbow], cloth[3], 16);
      line([elbow, hand], colors.skinLight, 11);
      line([[elbow[0] - 2, elbow[1] + 1], [hand[0] - 2, hand[1]]], '#e8b18a', 2);
      if (p.kind === 'phone' && sit > .9) {
        box(hand[0] - 4, hand[1] - 16, 15, 29, 3, colors.ink);
        box(hand[0]-1,hand[1]-12,9,18,1,'#c3d4bc');
        line([[hand[0]+1,hand[1]-6+a.handMotion*2],[hand[0]+6,hand[1]-6+a.handMotion*2]],'#628d80',1.5);
      }
      ellipse(hand[0], hand[1], 7, 5, colors.skinLight, -.1);
      if (sit < .45) for (const offset of [-2, 1, 4]) line([[hand[0] + offset, hand[1] - 2], [hand[0] + offset + 1, hand[1] + 3]], '#a56e51', 1);
      else if(a.gesture > .1 && ['sit','rest','observe'].includes(p.kind)) for(const offset of [-2,1,4])
        line([[hand[0]+offset,hand[1]],[hand[0]+offset+2+a.gesture*3,hand[1]+4]],'#b67a59',1.2);
      p.leftHand = rearGrip; p.rightHand = hand;
    }

    function effortState() {
      const visible = scene.kind === 'walk' || scene.kind === 'stairs';
      const startEnergy = scene.energyBefore, endEnergy = scene.energyAfter;
      const progress = visible ? clamp(pose.movementProgress || 0, 0, 1) : 1;
      return {
        displayEnergy: Number(mix(startEnergy, endEnergy, progress).toFixed(2)),
        startEnergy, endEnergy, step: visible ? pose.movementStep : null,
        totalSteps: scene.kind === 'stairs' ? 4 : scene.kind === 'walk' ? 3 : 0,
        active: visible && Boolean(pose.moving), visible, progress: Number(progress.toFixed(4))
      };
    }
    function imaginedBattery() {
      const effort = effortState();
      if (!effort.visible) return;
      const x = clamp(pose.x - 150, 14, 818), y = clamp(pose.shoulderY - 49, 18, 404);
      box(x, y, 119, 38, 12, 'rgba(249,244,228,.93)', 'rgba(70,105,92,.25)', 1);
      box(x + 12, y + 10, 92, 18, 4, '#e8e3d1', '#77968a', 1);
      box(x + 104, y + 15, 4, 8, 1, '#77968a');
      for (let i = 0; i < 10; i++) {
        const fill = clamp(effort.displayEnergy - i, 0, 1);
        box(x + 17 + i * 8, y + 14, 5, 10, 1, '#cbd2bd');
        if (fill > 0) box(x + 17 + i * 8, y + 14 + (1 - fill) * 10, 5, fill * 10, 1, colors.teal);
      }
      ellipse(x + 125, y + 34, 3, 3, 'rgba(249,244,228,.86)');
      ellipse(x + 132, y + 40, 2, 2, 'rgba(249,244,228,.7)');
    }

    function draw() {
      if (dead) return;
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (scene.encounter) publicInterior();
      else if (scene.location === 'stairs' || scene.kind === 'stairs') stairs(); else if (scene.location === 'street') street(); else if (scene.location === 'hall') hall(); else room();
      pose = getPose(); character(pose); imaginedBattery();
      // A restrained paper-like border keeps the illustration legible on light backgrounds.
      ctx.strokeStyle = 'rgba(85,78,59,.08)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
    }
    function resize() {
      if (dead) return;
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: W };
      const ratio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const width = Math.max(1, Math.round((rect.width || W) * ratio));
      const height = Math.round(width * H / W);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      draw();
    }
    function setScene(next) {
      scene = { kind: 'rest', location: 'room', body: {}, step: 1, ...next };
      scene.body = { ...(next && next.body || {}) };
      scene.appearance = appearanceFor(next && next.appearance);
      scene.context = next && next.context ? JSON.parse(JSON.stringify(next.context)) : null;
      const encounter = next && next.encounter;
      scene.encounter = encounter && ['door', 'escalator', 'kiosk'].includes(encounter.kind) ? {
        kind: encounter.kind,
        ...(encounter.kind === 'door' ? { doorType: ['manual', 'automatic', 'revolving'].includes(encounter.doorType)
          ? encounter.doorType : ['manual', 'automatic', 'revolving'].includes(scene.context?.entrance?.mode) ? scene.context.entrance.mode : 'manual' } : {}),
        phase: ['waiting', 'passing', 'passed'].includes(encounter.phase) ? encounter.phase : scene.context?.entrance?.passed && encounter.kind === 'door' ? 'passed' : 'waiting'
      } : null;
      // No gait is demonstrated on moving stairs or inside a revolving enclosure.
      if (scene.encounter && (scene.encounter.kind === 'escalator' || scene.encounter.doorType === 'revolving')) {
        scene.kind = 'stand'; scene.location = 'hall'; scene.destinationPose = null;
      }
      scene.energyBefore = Number.isFinite(Number(scene.energyBefore)) ? clamp(Number(scene.energyBefore), 0, 10) : 6;
      scene.energyAfter = Number.isFinite(Number(scene.energyAfter)) ? clamp(Number(scene.energyAfter), 0, 10) : scene.energyBefore;
      if (!['sit', 'desk', 'phone', 'rest', 'observe'].includes(scene.destinationPose)) scene.destinationPose = null;
      const fatigue = Math.max(scene.body.shoulder || 0, scene.body.goodLeg || 0, scene.body.back || 0);
      gaitDuration = 1480 + clamp(fatigue, 0, 10) * 76;
      stairDuration = 2050 + clamp(fatigue, 0, 10) * 85;
      motionDuration = scene.kind === 'stairs' ? stairDuration * 4 + (scene.destinationPose ? 1700 : 1100) : scene.kind === 'walk' ? gaitDuration * 3 + (scene.destinationPose ? 1250 : 0) : 3000;
      environmentDuration = scene.encounter?.kind === 'escalator' || scene.encounter?.doorType === 'revolving' ? 4800
        : scene.encounter?.doorType === 'automatic' && scene.encounter.phase !== 'passed' ? 3200 : 0;
      duration = Math.max(motionDuration, environmentDuration);
      elapsed = 0; draw();
    }
    function advance(ms) {
      if (dead) return;
      const delta = Number(ms);
      if (Number.isFinite(delta) && delta > 0 && !reduced) elapsed = Math.min(duration, elapsed + delta);
      draw();
    }
    function snapshot() {
      const encounter = environmentState();
      return {
        coordinateSystem: '960x500; origin top-left; +x right, +y down',
        kind: scene.kind, poseKind: pose.kind === 'stairs' && pose.seated >= 1 ? 'sit' : pose.kind, destinationPose: scene.destinationPose || null, location: scene.location, step: scene.step, minuteOfDay: scene.minuteOfDay ?? null,
        x: Math.round(pose.x * 100) / 100, y: Math.round(pose.y * 100) / 100,
        phase: pose.phase, support: pose.support, moving: Boolean(pose.moving),
        characterMoving: Boolean(pose.moving), environmentMoving: Boolean(encounter && encounter.active), encounter,
        bracedLeg: 'right', elapsedMs: Math.round(Math.min(elapsed, motionDuration)), durationMs: motionDuration,
        reducedMotion: reduced, fatigue: pose.fatigue,
        appearance: { ...scene.appearance },
        activity: { ...pose.activity },
        effort: effortState(),
        contextVisual: hasContext() ? {
          doorMode: scene.context.entrance ? scene.context.entrance.mode : null,
          itemsVisible: !scene.encounter && scene.location === 'room' && hasHomeItems(),
          items: scene.context.items ? { container: scene.context.items.container, cupLocation: scene.context.items.cupLocation,
            phoneLocation: scene.context.items.phoneLocation, drinkPlace: scene.context.items.drinkPlace, carryTrips: scene.context.items.carryTrips } : null
        } : null,
        stairs: scene.kind === 'stairs' ? {
          step: pose.movementStep, totalSteps: 4, rise: Number(pose.rise.toFixed(2)),
          landing: pose.landing, railHand: [...pose.railHand], crutchTip: [...pose.crutchTip],
          geometry: { ...stairGeometry, landingX: 582, landingY: 330 }
        } : null,
        leftFoot: pose.leftFoot && pose.leftFoot.map(n => Math.round(n * 100) / 100),
        rightFoot: pose.rightFoot && pose.rightFoot.map(n => Math.round(n * 100) / 100),
        joints: {
          hip: [pose.x, pose.y], shoulder: [pose.shoulderX, pose.shoulderY],
          leftHand: pose.leftHand && [...pose.leftHand], rightHand: pose.rightHand && [...pose.rightHand],
          leftKnee: pose.leftKnee || [mix(pose.x - 7, pose.x + 40, pose.seated), mix(pose.y + 43, pose.y + 6, pose.seated)],
          rightKnee: pose.rightKnee || [mix(pose.x + 23, pose.x + 51, pose.seated), mix(pose.y + 39, pose.y + 7, pose.seated)]
        },
        contacts: pose.contacts || {
          leftFoot: Boolean(pose.leftFoot && pose.leftFoot[1] >= 384.99),
          crutches: pose.seated >= .65 || pose.crutchLift <= .01,
          seat: pose.seated >= .8
        }
      };
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    resize();
    return {
      setScene, advance, snapshot,
      finish() { elapsed = duration; draw(); },
      setReducedMotion(value) { reduced = Boolean(value); draw(); },
      destroy() { dead = true; if (observer) observer.disconnect(); }
    };
  }
  return { create };
});
