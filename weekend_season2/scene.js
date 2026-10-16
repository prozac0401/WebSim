/* An entirely local, vector-drawn room. Animation never advances the simulation. */
(function (root) {
  'use strict';
  let canvas, context, state, active = 'rest', elapsed = 0, lastFrame = 0, frame;
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
  const colors = { ink: '#394c43', wood: '#b98a5f', woodLight: '#d8b587', leaf: '#71885b', wall: '#ece8d7' };
  // These are illustration choices only. Family appearance never changes game state.
  const avatarStyles = {
    woman: { hair: 'long-soft', top: '#b57879', trim: '#e7ccae' },
    man: { hair: 'short-swept', top: '#bd8059', trim: '#edd9b3' },
    other: { hair: 'side-wave', top: '#668f89', trim: '#e1c39a' },
    unspecified: { hair: 'rounded-crop', top: '#8d9776', trim: '#efdfbd' }
  };
  const childScales = { preschool: .34, school: .44, teen: .53 };
  function genderKey(value) { return value === 'female' ? 'woman' : value === 'male' ? 'man' : value === 'nonbinary' ? 'other' : Object.hasOwn(avatarStyles, value) ? value : 'unspecified'; }
  function appearance(config) { const gender = genderKey(config?.gender); return { gender, ...avatarStyles[gender], hairColor: Number(config?.age || 32) >= 55 ? '#8a8c7e' : '#574a3b' }; }
  function bounds(person) { return { left: person.x - 48 * person.scale, top: person.y - 74 * person.scale, right: person.x + (person.activity === 'draw' ? 72 : 48) * person.scale, bottom: person.y + 112 * person.scale }; }
  function familyLayout(config = {}, activity = 'rest') {
    const number = Number(config.children), children = Number.isFinite(number) ? Math.max(0, Math.min(6, Math.floor(number))) : 0;
    const maritalStatus = config.maritalStatus === 'married' ? 'married' : 'single';
    const ageStage = Object.hasOwn(childScales, config.childAge) ? config.childAge : 'preschool';
    const player = { id: 'player', kind: 'player', name: config.personaName || '나', x: activity === 'rest' ? 165 : 397, y: activity === 'rest' ? 326 : children ? 329 : 360, scale: 1, activity, appearance: appearance(config) };
    player.bounds = bounds(player);
    const spouse = maritalStatus === 'married' ? { id: 'spouse', kind: 'spouse', name: '배우자', x: activity === 'rest' ? 327 : 306, y: children ? 329 : 350, scale: .82, activity: 'companion', appearance: { gender: 'unspecified', hair: 'side-wave', hairColor: Number(config.age || 32) >= 55 ? '#85897c' : '#645546', top: '#7c927d', trim: '#dfc89f' } } : null;
    if (spouse) spouse.bounds = bounds(spouse);
    const palette = ['#d0a15f', '#8fa8a3', '#bc8582', '#a0ad7f', '#b796b1', '#84a3b5'];
    const childFigures = Array.from({ length: children }, (_, index) => {
      const scale = childScales[ageStage];
      const child = { id: 'child-' + (index + 1), kind: 'child', name: '자녀 ' + (index + 1), ageStage, x: 397 + (index - (children - 1) / 2) * 74, y: 542 - 112 * scale, scale,
        activity: activity === 'care' || ageStage !== 'preschool' ? 'child-book' : 'child-play',
        appearance: { gender: 'unspecified', hair: index % 2 ? 'side-wave' : 'rounded-crop', hairColor: index % 2 ? '#695342' : '#55483c', top: palette[index], trim: '#f1ddba' } };
      child.bounds = bounds(child); return child;
    });
    return { player, spouse, children: childFigures, maritalStatus, childAge: children ? ageStage : 'none', childCount: children, personCount: 1 + children + (spouse ? 1 : 0) };
  }
  function shape(x, y, w, h, color, radius = 0) { const c = context; c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill(); }
  function ellipse(x, y, rx, ry, color, rotation = 0) { context.fillStyle = color; context.beginPath(); context.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); context.fill(); }
  function line(points, color, width = 2) { context.strokeStyle = color; context.lineWidth = width; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath(); points.forEach((p, i) => i ? context.lineTo(...p) : context.moveTo(...p)); context.stroke(); }
  function text(value, x, y, size = 14, color = colors.ink, font = 'sans-serif') { context.fillStyle = color; context.font = `${size}px ${font}`; context.fillText(value, x, y); }
  function plant(x, y, size = 1) { const c = context; c.save(); c.translate(x, y); c.scale(size, size); line([[0, 0], [-3, -88]], '#71805a', 3); for (let i = 0; i < 5; i++) { const py = -23 - i * 15; ellipse(-16, py, 20, 8, i % 2 ? '#8d9e6c' : '#6c845b', .55); ellipse(10, py - 6, 18, 8, '#829763', -.65); } shape(-21, -5, 42, 40, '#b87551', 5); shape(-24, -8, 48, 9, '#ca9169', 2); c.restore(); }
  function books(x, y, count = 5) { const palette = ['#be7961', '#68877a', '#dbbf81', '#8e9b86', '#c8ab90']; for (let i = 0; i < count; i++) { const h = 22 + i % 3 * 8; shape(x + i * 12, y - h, 9, h, palette[i % palette.length], 1); line([[x + 2 + i * 12, y - 7], [x + 7 + i * 12, y - 7]], '#eee4ca', 1); } }
  function pottery(x, y, size = 1) { const c = context; c.save(); c.translate(x, y); c.scale(size, size); shape(-12, -15, 24, 24, '#ac7355', 9); ellipse(0, -13, 11, 4, '#d6a680'); ellipse(0, -14, 7, 2, '#8e5d48'); c.restore(); }
  function picture(x, y, w, h, i = 0) { shape(x, y, w, h, '#fff9e8', 2); shape(x + 5, y + 5, w - 10, h - 14, i % 2 ? '#c7d7ce' : '#d2dcc0'); ellipse(x + w - 16, y + 15, 5, 5, '#e5be6c'); context.fillStyle = '#7f9573'; context.beginPath(); context.moveTo(x + 5, y + h - 9); context.lineTo(x + w * .4, y + 16); context.lineTo(x + w * .75, y + h - 9); context.fill(); }
  function windowView(month) { const summer = month >= 6 && month <= 8, autumn = month >= 9 && month <= 11, winter = month <= 2 || month === 12; const c = context;
    shape(78, 65, 222, 213, '#cfbc98', 5); shape(87, 74, 204, 194, winter ? '#cbdad7' : summer ? '#c8ded1' : '#dde6cc');
    ellipse(245, 113, 23, 23, winter ? '#f5efd5' : '#f5d88e'); ellipse(135, 124, 39, 11, '#f3f1e4'); ellipse(171, 113, 29, 13, '#f4f3e9');
    c.save(); c.beginPath(); c.rect(87,74,204,194); c.clip();
    if (state?.config?.region === 'rural') { ellipse(155, 260, 90, 65, '#acbe97'); ellipse(249, 269, 80, 87, '#94ad88'); shape(130, 235, 29, 31, '#e7dec2'); context.fillStyle='#a88660';context.beginPath();context.moveTo(125,235);context.lineTo(145,217);context.lineTo(165,235);context.fill(); }
    else if (state?.config?.region === 'town') { shape(99, 226, 54, 42, '#b5bfa7'); shape(164, 214, 41, 54, '#c6ceb7'); ellipse(227, 258, 35, 38, '#9faf8b'); }
    else { shape(94, 210, 55, 58, '#abbdb0'); shape(156, 188, 41, 80, '#bec9b8'); shape(202, 223, 72, 45, '#9eafa0'); for (let i = 0; i < 3; i++) line([[106 + i * 14, 226], [106 + i * 14, 236]], '#e1e5d4', 5); }
    line([[260, 268], [248, 158], [223, 138]], '#8a8866', 5); line([[250, 196], [278, 164]], '#8a8866', 3);
    if (!winter) { ['#b6c298', autumn ? '#d5a165' : '#8fa97f', autumn ? '#c5875b' : '#9fb58b'].forEach((color, i) => ellipse(235 + i * 18, 151 + i * 6, 28, 33, color)); }
    if (winter) for (let i = 0; i < 11; i++) ellipse(102 + i * 17, 95 + ((i * 41 + (reduced.matches ? 0 : elapsed * .008)) % 135), 2, 2, '#fcfbef');
    c.restore();
    shape(185, 73, 8, 195, '#ede4cf'); shape(87, 164, 204, 8, '#ede4cf'); shape(71, 276, 236, 12, '#bba57c', 2);
    shape(60, 52, 260, 8, '#9d8b69', 3); shape(65, 61, 32, 202, '#c6cfb7', 3); shape(283, 61, 32, 202, '#c6cfb7', 3);
    [70, 80, 292, 303].forEach(x => line([[x, 64], [x + 2, 257]], '#b8c4a8', 2));
  }
  function hair(style, color, behind) {
    const c = context; c.fillStyle = color;
    if (behind) { if (style === 'long-soft') { shape(-32, -57, 64, 64, color, 25); ellipse(-28, -10, 10, 25, color, -.12); ellipse(28, -10, 10, 25, color, .12); } return; }
    c.beginPath();
    if (style === 'short-swept') { c.moveTo(-27,-31);c.quadraticCurveTo(-36,-71,3,-69);c.quadraticCurveTo(34,-67,27,-28);c.lineTo(17,-46);c.quadraticCurveTo(0,-35,-19,-49); }
    else if (style === 'long-soft') { c.moveTo(-28,-27);c.quadraticCurveTo(-37,-72,0,-71);c.quadraticCurveTo(36,-71,28,-27);c.lineTo(21,-48);c.quadraticCurveTo(7,-48,1,-61);c.quadraticCurveTo(-8,-44,-24,-44); }
    else if (style === 'side-wave') { c.moveTo(-28,-28);c.quadraticCurveTo(-36,-56,-22,-62);c.quadraticCurveTo(-15,-77,5,-69);c.quadraticCurveTo(32,-72,30,-48);c.lineTo(23,-27);c.lineTo(18,-48);c.quadraticCurveTo(-2,-31,-20,-43); }
    else { c.moveTo(-28,-27);c.quadraticCurveTo(-33,-72,0,-69);c.quadraticCurveTo(34,-68,28,-26);c.lineTo(19,-45);c.quadraticCurveTo(0,-38,-20,-45); }
    c.closePath();c.fill();
  }
  function character(activity, person) { const c = context; const resting = activity === 'rest'; const walk = ['walk', 'run', 'pt', 'garden'].includes(activity); const wave = reduced.matches || person.kind !== 'player' ? 0 : Math.sin(elapsed / 470); const style = person.appearance; c.save(); c.translate(person.x, person.y + (walk ? wave * 2 : wave * .5)); c.scale(person.scale, person.scale);
    ellipse(0, 102, 42, 9, '#9f9d7b35');
    line(resting ? [[-10,54],[-26,68],[-25,95],[-35,97]] : [[-10, 54], [-13 + (walk ? wave * 8 : 0), 92], [-28 + (walk ? wave * 8 : 0), 94]], '#54645b', 14);
    line(resting ? [[12,54],[30,68],[31,95],[41,97]] : [[12, 54], [20 - (walk ? wave * 8 : 0), 91], [32 - (walk ? wave * 8 : 0), 93]], '#54645b', 14);
    hair(style.hair, style.hairColor, true);
    shape(-25, -5, 50, 69, style.top, 18);
    if (style.gender === 'woman') { line([[-14, 1], [0, 12], [14, 1]], style.trim, 4); shape(-20,43,40,5,style.trim,2); }
    else if (style.gender === 'other') { line([[-15, 0], [-8, 51]], style.trim, 5); shape(10,19,9,13,style.trim,2); }
    else if (style.gender === 'unspecified') { line([[0, 3], [0, 58]], style.trim, 3); ellipse(6,20,2,2,style.trim);ellipse(6,32,2,2,style.trim); }
    else { line([[-13, 0], [0, 8], [13, 0]], style.trim, 3); shape(9,18,10,10,style.trim,2); }
    shape(-9, -19, 18, 24, '#d8ac7e', 7); ellipse(0, -34, 27, 31, '#e4ba8e');
    hair(style.hair, style.hairColor, false);
    ellipse(-9, -31, 1.6, 2, '#574a3b'); ellipse(9, -31, 1.6, 2, '#574a3b'); line([[-4, -18], [1, -16], [6, -19]], '#a16c50', 1.5); ellipse(-17, -24, 4, 2, '#d89476'); ellipse(17, -24, 4, 2, '#d89476');
    if (['read', 'study', 'research', 'jobstudy', 'child-book'].includes(activity)) { line([[-24, 11], [-30, 40], [-9, 44]], '#dba77e', 11); line([[24, 11], [31, 39], [11, 44]], '#dba77e', 11); shape(-25, 27, 50, 30, '#f2dfaa', 2); line([[0, 29], [0, 55]], '#b7a06f', 2); }
    else if (activity === 'child-play') { line([[-24,11],[-30,35],[-13,43]],'#dba77e',11);line([[24,11],[30,35],[13,43]],'#dba77e',11);ellipse(0,40,19,18,'#d3b264');line([[-14,34],[13,45]],'#f1dca3',3); }
    else if (activity === 'photo') { line([[-22, 10], [-32, -8], [-13, -13]], '#dba77e', 11); line([[23, 10], [31, -7], [14, -13]], '#dba77e', 11); shape(-19, -20, 38, 25, '#536157', 4); ellipse(0, -8, 10, 10, '#273d39'); ellipse(0, -8, 5, 5, '#8fafa3'); }
    else if (activity === 'music') { line([[-23, 12], [-35, 40], [-10, 43]], '#dba77e', 11); line([[23, 12], [30, 35], [14, 40]], '#dba77e', 11); ellipse(-3, 46, 20, 24, '#d6ac6e', -.3); shape(8, 3, 9, 53, '#9e7d53', 3); ellipse(-1, 41, 7, 7, '#705f40'); }
    else if (activity === 'draw') { line([[-23, 12], [-30, 44]], '#dba77e', 11); line([[23, 12], [42, 18], [58, 4 + wave * 3]], '#dba77e', 11); line([[57, 5], [67, -16 + wave * 3]], '#6c7455', 3); }
    else if (['pottery','cook','garden'].includes(activity)) { line([[-23,12],[-31,37],[-12,43]],'#dba77e',11);line([[23,12],[31,37],[12,43]],'#dba77e',11);if(activity==='garden')plant(0,36,.35);else { ellipse(0,43,20,14,activity==='cook'?'#e1c792':'#ad7855');ellipse(0,36,20,5,activity==='cook'?'#82965b':'#cc9f79'); if(activity==='cook')line([[10,34],[23,5+wave*3]],'#84684b',4); } }
    else if (activity === 'care') { line([[-23,12],[-29,38],[-8,45]],'#dba77e',11);line([[23,12],[28,35],[8,45]],'#dba77e',11);shape(-23,27,46,29,'#d5c49a',3);line([[0,30],[0,53]],'#9f946f',2);line([[-16,36],[-6,36]],'#f1e2bd',3);line([[6,41],[16,41]],'#f1e2bd',3); }
    else { line([[-24, 10], [-33 + wave * 2, 42]], '#dba77e', 11); line([[24, 10], [34 - wave * 2, 42]], '#dba77e', 11); }
    c.restore();
  }
  function draw() { if (!canvas || !context) return; const c = context, dpr = Math.min(root.devicePixelRatio || 1, 2), width = canvas.clientWidth || 760, height = canvas.clientHeight || 550;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    c.setTransform(dpr * width / 760, 0, 0, dpr * height / 550, 0, 0); c.clearRect(0, 0, 760, 550);
    const month = Number((state?.date || '2026-01-01').slice(5, 7)), housing = state?.config?.housing || 'studio';
    shape(0, 0, 760, 550, housing === 'shared' ? '#e5e7d7' : colors.wall); shape(0, 340, 760, 210, '#d4c49f'); shape(0, 338, 760, 12, '#c0b38e');
    for (let i = 0; i < 8; i++) line([[0, 377 + i * 30], [760, 377 + i * 30]], '#c7b790', 1);
    [[140, 350, 152, 377], [370, 377, 394, 407], [625, 407, 662, 437], [230, 437, 267, 467], [490, 467, 540, 497]].forEach(p => line([[p[0], p[1]], [p[2], p[3]]], '#c7b790', 1));
    windowView(month);
    // Sunlight, soft rug, and the same room gradually filling with memories.
    c.fillStyle = '#f4e9bf35'; c.beginPath(); c.moveTo(85, 285); c.lineTo(275, 285); c.lineTo(520, 510); c.lineTo(160, 510); c.fill();
    ellipse(380, 460, 230, 60, '#b8c0a1'); ellipse(380, 460, 209, 47, '#c7cbb0');
    shape(75, 345, 182, 76, '#a4b39a', 14); shape(65, 330, 196, 67, '#b7c2a7', 19); shape(64, 346, 25, 73, '#9eae93', 11); shape(243, 346, 24, 73, '#9eae93', 11); shape(89, 349, 74, 45, '#c8d0b3', 10); shape(168, 350, 71, 44, '#c3cbaa', 10); shape(93, 350, 36, 29, '#deb786', 7); line([[85, 419], [82, 439]], '#8f7954', 7); line([[245, 418], [248, 435]], '#8f7954', 7);
    shape(536, 109, 148, 7, '#b69970', 2); shape(539, 201, 145, 7, '#b69970', 2); shape(538, 294, 147, 8, '#b69970', 2); line([[548, 118], [548, 130]], '#9d8c64', 3); line([[671, 118], [671, 130]], '#9d8c64', 3); books(548, 109, 5); pottery(651, 98, 1.1); picture(550, 148, 40, 52); plant(654, 180, .45); books(552, 294, 3); pottery(622, 282, 1.2);
    const artifacts = state?.artifacts || []; artifacts.slice(-7).forEach((a, i) => { const kind = a.activityId || a.activity || a.type || ''; if (kind === 'pottery') pottery(595 + i % 3 * 29, 281 - Math.floor(i / 3) * 92, .85); else if (kind === 'photo' || kind === 'draw') picture(328 + i % 3 * 48, 127 + Math.floor(i / 3) * 56, 37, 45, i); else books(603 + i % 3 * 18, 201, 1); });
    if (housing === 'apartment') { shape(680, 331, 73, 67, '#c4cbb4', 7); shape(681, 331, 72, 8, '#a9b99e', 2); line([[700, 345], [700, 385]], '#b0bba0', 1); }
    if (housing === 'shared') { picture(339, 93, 43, 51, 1); text('HOME', 341, 164, 11, '#a79371', 'Georgia'); }
    if (Number(state?.config?.children) > 0) { shape(99, 454, 21, 21, '#b57b5b', 2); shape(120, 458, 17, 17, '#7e9980', 2); shape(112, 437, 17, 17, '#d5b678', 2); }
    if (state?.config?.transport === 'walk') { shape(674, 459, 28, 12, '#af805d', 5); shape(704, 459, 28, 12, '#af805d', 5); line([[680,461],[689,461]],'#e9d7b4',2); line([[710,461],[719,461]],'#e9d7b4',2); }
    else if (state?.config?.transport === 'car') { line([[606,325],[622,325]],'#9a8b69',3); ellipse(604,325,5,5,'#9a8b69'); shape(620,322,6,9,'#9a8b69',1); }
    else { shape(605,317,21,13,'#718f80',2); line([[609,321],[622,321]],'#e4e5cf',2); }
    plant(705, 382, 1.08); shape(503, 373, 151, 13, '#bb9366', 6); line([[517, 384], [509, 439]], '#9c815c', 7); line([[639, 383], [647, 437]], '#9c815c', 7); shape(544, 356, 50, 14, '#e5d6b2', 3); line([[548, 360], [589, 360]], '#b2a185', 1); shape(605, 348, 16, 23, '#f5efdb', 4); c.strokeStyle = '#f5efdb'; c.lineWidth = 4; c.beginPath(); c.arc(621, 358, 6, -1.5, 1.5); c.stroke();
    if (active === 'draw') { line([[454, 350], [477, 282], [501, 351]], '#a78959', 4); picture(453, 275, 48, 57, 1); }
    if (['study', 'overtime', 'research', 'jobstudy'].includes(active)) { shape(553, 327, 43, 32, '#708575', 3); shape(557, 331, 35, 24, '#c7d4bc', 2); shape(549, 359, 52, 4, '#657c6f', 2); }
    const family = familyLayout(state?.config, active);
    if (family.spouse) character(family.spouse.activity, family.spouse);
    character(active, family.player);
    family.children.forEach(child => character(child.activity, child));
    // Small, hand-drawn room details anchor the scene without depending on images.
    line([[323, 83], [371, 83]], '#b4a383', 2); shape(332, 60, 31, 29, '#fff6df', 1); text(String(month).padStart(2, '0'), 336, 81, 17, '#9f7954', 'Georgia');
    shape(12, 516, 736, 18, '#f8f3df1a');
  }
  function loop(timestamp) { if (!canvas?.isConnected) return; if (!reduced.matches) elapsed += Math.min(80, timestamp - (lastFrame || timestamp)); lastFrame = timestamp; draw(); frame = requestAnimationFrame(loop); }
  const api = { attach(element, nextState, activity) { if (frame) cancelAnimationFrame(frame); canvas = element; if (!canvas) return; context = canvas.getContext('2d'); state = nextState; active = activity || 'rest'; lastFrame = 0; draw(); frame = requestAnimationFrame(loop); }, update(nextState, activity) { state = nextState; active = activity || active; draw(); }, advance(ms) { elapsed += Number(ms) || 0; draw(); }, describe() { const family = familyLayout(state?.config, active); return { coordinateSystem: 'room canvas, origin top-left, x right, y down; logical 760 × 550', character: { ...family.player, gender: family.player.appearance.gender }, family: { maritalStatus: family.maritalStatus, spouse: family.spouse, children: family.children, childCount: family.childCount, childAge: family.childAge, personCount: family.personCount }, seasonMonth: Number((state?.date || '2026-01-01').slice(5, 7)), artifacts: state?.artifacts?.length || 0, reducedMotion: reduced.matches }; }, familyLayout };
  root.S2Scene = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
