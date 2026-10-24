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

  function create(canvas, options) {
    if (!canvas || !canvas.getContext) throw new TypeError('A canvas is required.');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable.');
    let reduced = Boolean(options && options.reducedMotion), dead = false;
    let scene = { kind: 'rest', location: 'room', body: {}, step: 1, energyBefore: 6, energyAfter: 6 };
    let elapsed = 0, duration = 1250, gaitDuration = 1600, stairDuration = 2050;
    let pose = {};
    const stairGeometry = { startX: 360, baseY: 430, tread: 74, rise: 25, count: 4 };
    const stairSurface = x => stairGeometry.baseY - clamp(Math.floor((x - stairGeometry.startX) / stairGeometry.tread) + 1, 0, stairGeometry.count) * stairGeometry.rise;
    const railHeight = x => x < 640 ? 313 - (x - 300) * 103 / 340 : 210;

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
    function cityWindow(x, y, w, h) {
      const evening = scene.step >= 5;
      box(x - 10, y - 10, w + 20, h + 22, 4, '#e4d8c1');
      const gradient = ctx.createLinearGradient(0, y, 0, y + h);
      gradient.addColorStop(0, evening ? '#778d99' : '#b5d2ca');
      gradient.addColorStop(1, evening ? '#cbb8a1' : '#e8dfbd');
      box(x, y, w, h, 1, gradient);
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
      line([[x + 10, y + 22], [x + 4, 391]], '#806b54', 8);
      line([[x + w - 10, y + 22], [x + w - 3, 391]], '#806b54', 8);
      box(x - 3, y - 78, 18, 92, 7, colors.teal);
      box(x, y, w, 20, 7, colors.teal);
    }
    function room() {
      ctx.fillStyle = colors.wall; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = colors.floor; ctx.fillRect(0, 391, W, 109);
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
      box(745, 296, 25, 7, 2, '#e3c69a'); cup(885, 286);
      plant(865, 213, .65); box(809, 236, 104, 8, 2, '#b28b62');
      plant(55, 354, .9);
      // Small clock and framed print.
      ellipse(518, 82, 26, 26, '#dfd0b6'); ellipse(518, 82, 22, 22, colors.cream);
      const hour = scene.step >= 5 ? 8 : scene.step >= 4 ? 4 : scene.step >= 3 ? 1 : 10;
      line([[518, 82], [518 + Math.sin(hour * Math.PI / 6) * 11, 82 - Math.cos(hour * Math.PI / 6) * 11]], colors.ink, 2.5);
      line([[518, 82], [532, 88]], colors.ink, 2);
      box(620, 63, 88, 102, 3, '#c2ab8b'); box(627, 70, 74, 88, 0, '#efe2c9');
      ellipse(667, 98, 15, 15, '#d4a76d'); poly([[634, 146], [657, 113], [676, 137], [695, 121], [695, 150]], '#91a18a');
      // A water bottle sits within reach rather than being carried while on crutches.
      box(402, 339, 60, 9, 4, '#af8660'); line([[415, 349], [413, 391]], '#917355', 5); line([[450, 349], [452, 391]], '#917355', 5);
      box(425, 311, 13, 27, 4, '#94b9ae'); box(428, 306, 7, 7, 2, colors.cream);
    }
    function hall() {
      ctx.fillStyle = '#e9dfcb'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#d6c7ae'; ctx.fillRect(0, 391, W, 109);
      box(0, 379, W, 13, 0, '#bcae95');
      // A door held open onto the same level; a low sill remains visible.
      box(83, 48, 244, 345, 7, '#b49c7b'); box(96, 59, 217, 333, 2, '#b6c8bd');
      poly([[96, 59], [173, 91], [173, 385], [96, 392]], '#c5ac86');
      line([[157, 222], [157, 248]], colors.ink, 4);
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
    function street() {
      const evening = scene.step >= 5;
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

    function getPose() {
      const time = reduced ? duration : Math.min(elapsed, duration);
      const active = !reduced && elapsed < duration;
      const fatigue = Math.max(scene.body.shoulder || 0, scene.body.goodLeg || 0, scene.body.back || 0);
      if (scene.kind === 'stairs') return stairPose(time, active, fatigue);
      const destination = scene.destinationPose;
      const seatedKinds = ['sit', 'desk', 'phone', 'rest', 'observe'];
      const seatX = kind => scene.location !== 'room' ? 779 : kind === 'desk' ? 698 : 281;
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
          shoulderX: x + 5 + Math.sin(Math.PI * transfer) * 5,
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
      const onBench = scene.location !== 'room' && seated;
      const x = seated ? seatX(kind) : scene.location === 'street' ? 530 : 405;
      const lower = seated ? t : 0;
      const breathe = active ? Math.sin(seatTime / 530) * .8 * lower : 0;
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

    function crutch(tipX, tipY, lean, alpha) {
      const topX = tipX - lean;
      ctx.save(); ctx.globalAlpha = alpha;
      line([[topX - 8, 244], [topX + 1, 292], [tipX, tipY - 6]], colors.metal, 4);
      line([[topX + 8, 244], [topX + 9, 292], [tipX, tipY - 6]], colors.metal, 4);
      line([[topX - 10, 242], [topX + 11, 242]], colors.rubber, 8);
      line([[topX - 2, 281], [topX + 11, 281]], colors.rubber, 5);
      line([[tipX - 3, tipY - 2], [tipX + 3, tipY - 2]], colors.rubber, 7);
      ctx.restore();
      return [topX + 5, 279];
    }
    function leg(hip, knee, ankle, front, braced) {
      line([hip, knee, ankle], front ? colors.trouser : '#4a6066', front ? 20 : 17);
      const footX = ankle[0], footY = ankle[1];
      ctx.save(); ctx.translate(footX, footY); ctx.rotate(braced ? -.05 : .02);
      box(-9, -4, 33, 12, 5, colors.shoe);
      line([[-7, 7], [23, 7]], '#b8aa90', 3);
      if (braced) {
        box(-9, -23, 19, 24, 3, '#cbd6ce', colors.ink, 1.4);
        line([[-9, -16], [10, -16]], colors.ink, 4);
        line([[-8, -6], [12, -6]], colors.ink, 4);
        box(6, -20, 4, 20, 1, '#6c8581');
      }
      ctx.restore();
    }
    function head(x, y, tilt) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
      line([[0, 5], [0, 19]], colors.skin, 13);
      ellipse(0, -12, 21, 26, colors.skinLight);
      // Simple profile with visible nose and quiet expression.
      poly([[15, -15], [24, -6], [16, -3]], colors.skinLight);
      ellipse(-2, -29, 21, 15, colors.hair);
      box(-23, -29, 12, 29, 6, colors.hair);
      ellipse(-13, -7, 5, 7, colors.skin);
      line([[9, -15], [13, -15]], colors.ink, 2);
      line([[13, 1], [18, 0]], '#875d4d', 1.7);
      ctx.restore();
    }
    function stairCharacter(p) {
      const hip = [p.x, p.y], shoulder = [p.shoulderX, p.shoulderY];
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
      poly([[shoulder[0] - 18, shoulder[1] + 3], [shoulder[0] + 20, shoulder[1] + 4],
        [hip[0] + 19, hip[1] - 5], [hip[0] - 17, hip[1] - 4]], colors.teal);
      line([[hip[0] - 14, hip[1] - 6], [hip[0] + 15, hip[1] - 6]], colors.darkTeal, 5);
      const railElbow = [mix(shoulder[0] - 10, p.railHand[0], .35), shoulder[1] + 41];
      line([[shoulder[0] - 10, shoulder[1] + 8], railElbow], colors.darkTeal, 14);
      line([railElbow, p.railHand], colors.skin, 10);
      ellipse(p.railHand[0], p.railHand[1] - 1, 7, 5, colors.skin);
      head(shoulder[0] + 1, shoulder[1] - 20, .055 + p.lean * .08 + p.fatigue * .003);
      line([[shoulder[0] - 5, shoulder[1] + 2], [shoulder[0] + 7, shoulder[1] + 4]], '#c2ccac', 3);
      const elbow = [mix(shoulder[0] + 21, grip[0] - 12, .45), mix(shoulder[1] + 40, grip[1] - 13, .5)];
      line([[shoulder[0] + 14, shoulder[1] + 10], elbow], colors.teal, 16);
      line([elbow, grip], colors.skinLight, 11);
      ellipse(grip[0], grip[1], 7, 5, colors.skinLight);
    }
    function character(p) {
      if (p.kind === 'stairs') { stairCharacter(p); return; }
      const x = p.x, hip = [x, p.y], shoulder = [p.shoulderX, p.shoulderY];
      const sit = p.seated, rest = p.kind === 'rest' && scene.location === 'room';
      ellipse(x + 24, 399, sit > .6 ? 78 : 68, 11, 'rgba(73,74,60,.14)');
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
      const torso = [[shoulder[0] - 18, shoulder[1] + 3], [shoulder[0] + 20, shoulder[1] + 4],
        [hip[0] + 19, hip[1] - 5], [hip[0] - 17, hip[1] - 4]];
      poly(torso, colors.teal);
      line([[hip[0] - 14, hip[1] - 6], [hip[0] + 15, hip[1] - 6]], colors.darkTeal, 5);
      const rearElbow = [mix(rearHand[0] - 14, x + 5, release), mix(rearHand[1] - 15, p.y - 10, release)];
      const rearGrip = [mix(rearHand[0], x + 23, release), mix(rearHand[1], p.y + 1, release)];
      line([[shoulder[0] - 10, shoulder[1] + 8], rearElbow], colors.darkTeal, 14);
      line([rearElbow, rearGrip], colors.skin, 10);
      head(shoulder[0] + 1, shoulder[1] - 20, rest ? -.08 * sit : .025 + p.fatigue * .003);
      line([[shoulder[0] - 5, shoulder[1] + 2], [shoulder[0] + 7, shoulder[1] + 4]], '#c2ccac', 3);
      const finalElbow = p.kind === 'phone' ? [shoulder[0] + 38, shoulder[1] + 38]
        : p.kind === 'desk' ? [x + 38, 297] : [x + 30, p.y - 18];
      const finalHand = p.kind === 'phone' ? [shoulder[0] + 30, shoulder[1] - 25]
        : p.kind === 'desk' ? [x + 79, 299] : [x + 48, p.y + 2];
      const elbow = [mix(mix(shoulder[0] + 25, frontHand[0] - 18, .45), finalElbow[0], release), mix(262, finalElbow[1], release)];
      const hand = [mix(frontHand[0], finalHand[0], release), mix(frontHand[1], finalHand[1], release)];
      line([[shoulder[0] + 14, shoulder[1] + 10], elbow], colors.teal, 16);
      line([elbow, hand], colors.skinLight, 11);
      if (p.kind === 'phone' && sit > .9) box(hand[0] - 4, hand[1] - 16, 13, 29, 3, colors.ink);
      ellipse(hand[0], hand[1], 7, 5, colors.skinLight, -.1);
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
      if (scene.location === 'stairs' || scene.kind === 'stairs') stairs(); else if (scene.location === 'street') street(); else if (scene.location === 'hall') hall(); else room();
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
      scene.energyBefore = Number.isFinite(Number(scene.energyBefore)) ? clamp(Number(scene.energyBefore), 0, 10) : 6;
      scene.energyAfter = Number.isFinite(Number(scene.energyAfter)) ? clamp(Number(scene.energyAfter), 0, 10) : scene.energyBefore;
      if (!['sit', 'desk', 'phone', 'rest', 'observe'].includes(scene.destinationPose)) scene.destinationPose = null;
      const fatigue = Math.max(scene.body.shoulder || 0, scene.body.goodLeg || 0, scene.body.back || 0);
      gaitDuration = 1480 + clamp(fatigue, 0, 10) * 76;
      stairDuration = 2050 + clamp(fatigue, 0, 10) * 85;
      duration = scene.kind === 'stairs' ? stairDuration * 4 + (scene.destinationPose ? 1700 : 1100) : scene.kind === 'walk' ? gaitDuration * 3 + (scene.destinationPose ? 1250 : 0) : 1250;
      elapsed = 0; draw();
    }
    function advance(ms) {
      if (dead) return;
      const delta = Number(ms);
      if (Number.isFinite(delta) && delta > 0 && !reduced) elapsed = Math.min(duration, elapsed + delta);
      draw();
    }
    function snapshot() {
      return {
        coordinateSystem: '960x500; origin top-left; +x right, +y down',
        kind: scene.kind, poseKind: pose.kind === 'stairs' && pose.seated >= 1 ? 'sit' : pose.kind, destinationPose: scene.destinationPose || null, location: scene.location, step: scene.step,
        x: Math.round(pose.x * 100) / 100, y: Math.round(pose.y * 100) / 100,
        phase: pose.phase, support: pose.support, moving: Boolean(pose.moving),
        bracedLeg: 'right', elapsedMs: Math.round(elapsed), durationMs: duration,
        reducedMotion: reduced, fatigue: pose.fatigue,
        effort: effortState(),
        stairs: scene.kind === 'stairs' ? {
          step: pose.movementStep, totalSteps: 4, rise: Number(pose.rise.toFixed(2)),
          landing: pose.landing, railHand: [...pose.railHand], crutchTip: [...pose.crutchTip],
          geometry: { ...stairGeometry, landingX: 582, landingY: 330 }
        } : null,
        leftFoot: pose.leftFoot && pose.leftFoot.map(n => Math.round(n * 100) / 100),
        rightFoot: pose.rightFoot && pose.rightFoot.map(n => Math.round(n * 100) / 100),
        joints: {
          hip: [pose.x, pose.y], shoulder: [pose.shoulderX, pose.shoulderY],
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
      setReducedMotion(value) { reduced = Boolean(value); draw(); },
      destroy() { dead = true; if (observer) observer.disconnect(); }
    };
  }
  return { create };
});
