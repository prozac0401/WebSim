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
  const OPTIONS = Object.freeze({
    faceShape:['round','oval','square','heart','long'],
    hairStyle:['long-soft','short-swept','side-wave','rounded-crop','curly','bob','ponytail','buzz','bun','braids'],
    hairColor:['espresso','chestnut','honey','slate','silver'],
    skinTone:['ivory','warm','tan','deep'],
    outfitPalette:['moss','terracotta','indigo','rose','mustard','teal'],
    palette:['oat','sage','rose','sky','clay','lavender'],layout:['window-left','window-right','wide-window'],
    decor:['plants','books','art','music'],windowView:['skyline','hills','garden','river']
  });
  const hairColors={espresso:'#423b34',chestnut:'#79513b',honey:'#b58b4d',slate:'#595f67',silver:'#a4a69d'};
  const skinColors={ivory:{face:'#edc9a6',limb:'#e3b892',blush:'#dba294'},warm:{face:'#dfb184',limb:'#d49f73',blush:'#c8856f'},tan:{face:'#bd895f',limb:'#ab7752',blush:'#a96854'},deep:{face:'#855b43',limb:'#724b38',blush:'#9f6853'}};
  const outfitColors={moss:{top:'#7f916b',trim:'#e5d5ab'},terracotta:{top:'#bc7959',trim:'#f0d6ac'},indigo:{top:'#687995',trim:'#d3d8c3'},rose:{top:'#b67d86',trim:'#f1d4bb'},mustard:{top:'#bb994e',trim:'#f0e2be'},teal:{top:'#5f918b',trim:'#e5d2ab'}};
  const roomPalettes={
    oat:{wall:'#ece8d7',floor:'#d4c49f',floorLine:'#c7b790',trim:'#c0b38e',sofa:'#b7c2a7',sofaDark:'#9eae93',cushion:'#c8d0b3',accent:'#deb786',rug:'#b8c0a1',rugInner:'#c7cbb0',curtain:'#c6cfb7',curtainLine:'#b8c4a8'},
    sage:{wall:'#dde4d6',floor:'#c9bea2',floorLine:'#b9ad91',trim:'#adae91',sofa:'#8da997',sofaDark:'#718d7e',cushion:'#b1c3a9',accent:'#dfc58f',rug:'#b6bc94',rugInner:'#cbd0ab',curtain:'#9db7a0',curtainLine:'#87a58f'},
    rose:{wall:'#eddfd8',floor:'#d5baa1',floorLine:'#c5a98f',trim:'#bca38c',sofa:'#bf999b',sofaDark:'#a87f83',cushion:'#d7b3aa',accent:'#deb56f',rug:'#c6b3a2',rugInner:'#dbc6b2',curtain:'#d5b4ad',curtainLine:'#c69d97'},
    sky:{wall:'#dfe8e9',floor:'#c8bc9f',floorLine:'#b7aa8e',trim:'#acaa94',sofa:'#93afba',sofaDark:'#7b96a3',cushion:'#bdcdd0',accent:'#d9b984',rug:'#a8bcb4',rugInner:'#c1cec1',curtain:'#afc7d0',curtainLine:'#97b2bf'},
    clay:{wall:'#e8d9c8',floor:'#c7a786',floorLine:'#b89776',trim:'#ab8e70',sofa:'#ba9072',sofaDark:'#a0785d',cushion:'#d1ad86',accent:'#91a485',rug:'#b8b68d',rugInner:'#cecca5',curtain:'#c5b590',curtainLine:'#b2a27c'},
    lavender:{wall:'#e4e0e9',floor:'#cec0ad',floorLine:'#beae9a',trim:'#b5a799',sofa:'#aaa0bb',sofaDark:'#91859f',cushion:'#c4b9cf',accent:'#d4bb82',rug:'#b8bba9',rugInner:'#d0d0bd',curtain:'#c5bdd4',curtainLine:'#aea3c0'}
  };
  const childScales = { toddler: .23, preschool: .34, school: .44, teen: .53, adult: .7 };
  const childStage = age => age <= 2 ? 'toddler' : age <= 6 ? 'preschool' : age <= 12 ? 'school' : age <= 17 ? 'teen' : 'adult';
  function genderKey(value) { return value === 'female' ? 'woman' : value === 'male' ? 'man' : value === 'nonbinary' ? 'other' : Object.hasOwn(avatarStyles, value) ? value : 'unspecified'; }
  function normalizedOptions(raw, keys, defaults) { return Object.fromEntries(keys.map(key=>[key,OPTIONS[key].includes(raw?.[key])?raw[key]:defaults[key]])); }
  function appearance(config) {
    const gender=genderKey(config?.gender), legacy={gender,...avatarStyles[gender],hairColor:Number(config?.age||32)>=55?'#8a8c7e':'#574a3b'};
    if(!config?.appearance)return legacy;
    const options=normalizedOptions(config.appearance,['faceShape','hairStyle','hairColor','skinTone','outfitPalette'],{faceShape:'oval',hairStyle:avatarStyles[gender].hair,hairColor:Number(config.age||32)>=55?'silver':'espresso',skinTone:'warm',outfitPalette:'terracotta'});
    return {...legacy,...outfitColors[options.outfitPalette],faceShape:options.faceShape,hairStyle:options.hairStyle,hair:options.hairStyle,hairColor:hairColors[options.hairColor],skinTone:options.skinTone,skin:skinColors[options.skinTone],outfitPalette:options.outfitPalette,options};
  }
  // A separate pure visual hash; never consumes or writes either simulation RNG stream.
  function visualHash(seed,key) { let value=(Number(seed)>>>0)^2166136261;for(const char of key)value=Math.imul(value^char.charCodeAt(0),16777619)>>>0;return value; }
  function memberAppearance(config,id) {
    const seed=config.generationSeed??config.seed??0;
    const raw=Object.fromEntries(['faceShape','hairStyle','hairColor','skinTone','outfitPalette'].map(key=>[key,OPTIONS[key][visualHash(seed,id+':'+key)%OPTIONS[key].length]]));
    return appearance({...config,gender:'unspecified',appearance:raw});
  }
  function homeStyle(config={}) {
    const legacy=!config.homeStyle;
    const values=normalizedOptions(config.homeStyle,['palette','layout','decor','windowView'],{palette:'oat',layout:'window-left',decor:'plants',windowView:config.region==='rural'?'hills':config.region==='town'?'garden':'skyline'});
    const mirrored=values.layout==='window-right';
    const furniture=[{id:'sofa',left:64,top:330,right:267,bottom:439},{id:'table',left:503,top:348,right:654,bottom:443},{id:'plant-or-instrument',left:!legacy&&values.decor==='music'?671:679,top:!legacy&&values.decor==='music'?250:264,right:731,bottom:426},{id:'toys',left:99,top:437,right:137,bottom:475},{id:'shoes',left:674,top:459,right:732,bottom:471}].map(box=>mirrored?{...box,left:760-box.right,right:760-box.left}:box);
    return {legacy,...values,colors:roomPalettes[values.palette],mirrored,furnitureBounds:furniture};
  }
  function bounds(person) { const reach=person.activity==='draw'?72:48, high=person.appearance.options?93:74;return {left:person.x-(person.facing===-1?reach:48)*person.scale,top:person.y-high*person.scale,right:person.x+(person.facing===-1?48:reach)*person.scale,bottom:person.y+112*person.scale}; }
  function familyLayout(config = {}, activity = 'rest', lifeState = {}) {
    const number = Number(config.children), children = Number.isFinite(number) ? Math.max(0, Math.min(6, Math.floor(number))) : 0;
    const maritalStatus = ['single','married','divorced','widowed','unspecified'].includes(config.maritalStatus) ? config.maritalStatus : 'unspecified';
    const ageStage = Object.hasOwn(childScales, config.childAge) ? config.childAge : 'preschool';
    const player = { id: 'player', kind: 'player', name: config.personaName || '나', x: activity === 'rest' ? 165 : 397, y: activity === 'rest' ? 326 : children ? 329 : 360, scale: 1, activity, appearance: appearance(config) };
    player.bounds = bounds(player);
    const spouse = maritalStatus === 'married' ? { id: 'spouse', kind: 'spouse', name: '배우자', x: activity === 'rest' ? 327 : 306, y: children ? 329 : 350, scale: .82, activity: 'companion', appearance: config.appearance ? memberAppearance(config,'spouse') : { gender: 'unspecified', hair: 'side-wave', hairColor: Number(config.age || 32) >= 55 ? '#85897c' : '#645546', top: '#7c927d', trim: '#dfc89f' } } : null;
    if (spouse) spouse.bounds = bounds(spouse);
    const palette = ['#d0a15f', '#8fa8a3', '#bc8582', '#a0ad7f', '#b796b1', '#84a3b5'];
    const profiles = Array.isArray(config.childProfiles) && config.childProfiles.length === children ? config.childProfiles : null;
    const awayChildren = [];
    const childFigures = Array.from({ length: children }, (_, index) => {
      const profile=profiles?.[index],stage=profile?childStage(profile.age):ageStage;
      const modern=!!profile||!!config.appearance||['adult','toddler'].includes(stage);
      const scale = modern ? {toddler:.22,preschool:.32,school:.4,teen:.48,adult:.7}[stage] : childScales[stage];
      const onLeave=profile?.militaryStatus==='serving'&&lifeState.flags?.militaryChildIndex===index&&!!lifeState.flags?.militaryLeaveUntil&&lifeState.flags.militaryLeaveUntil>=(lifeState.date||'2026-01-01');
      const memberStyle=config.appearance?memberAppearance(config,'child-'+(index+1)):{gender:'unspecified',hair:index%2?'side-wave':'rounded-crop',hairColor:index%2?'#695342':'#55483c',top:palette[index],trim:'#f1ddba'};
      if(profile){memberStyle.gender=genderKey(profile.gender);if(!config.appearance)memberStyle.hair=avatarStyles[memberStyle.gender].hair;}
      if(onLeave){memberStyle.top='#71816a';memberStyle.trim='#c6c6a0';}
      const child = { id: 'child-' + (index + 1), kind: 'child', name: '자녀 ' + (index + 1), ageStage:stage, ...(profile?{age:profile.age,gender:profile.gender,militaryStatus:profile.militaryStatus,onLeave}:{}), x: 397 + (index - (children - 1) / 2) * 74, y: (stage==='adult'?546:542) - 112 * scale, scale,
        activity: onLeave?'child-leave':stage==='adult'?'child-adult':stage==='toddler'?'child-toddler':activity === 'care' || stage !== 'preschool' ? 'child-book' : 'child-play',
        appearance:memberStyle };
      if(profile?.militaryStatus==='serving'&&!onLeave){awayChildren.push({id:child.id,name:child.name,age:profile.age,gender:profile.gender,militaryStatus:'serving',reason:'군 복무 중',onLeave:false});return null;}
      child.bounds = bounds(child); return child;
    }).filter(Boolean);
    // Grown children stand in the foreground. Move the parents farther into the room
    // so all silhouettes stay separate, including a household with six adult children.
    if(childFigures.some(child=>child.ageStage==='adult')){player.y=288;player.bounds=bounds(player);if(spouse){spouse.y=288;spouse.bounds=bounds(spouse);}}
    if(lifeState.healthEpisode?.subject==='self')player.ill=true;
    if(lifeState.flags?.recoveryUntil>=(lifeState.date||'2026-01-01'))player.recovering=lifeState.flags.recoveryCause||'low_condition_week';
    if(lifeState.healthEpisode?.subject==='child'){const child=childFigures.find(p=>p.id==='child-'+(lifeState.healthEpisode.childIndex+1));if(child)child.ill=true;}
    if(homeStyle(config).mirrored)for(const person of [player,...(spouse?[spouse]:[]),...childFigures]){person.x=760-person.x;person.facing=-1;person.bounds=bounds(person);}
    return { player, spouse, children: childFigures, awayChildren, maritalStatus, childAge: children ? ageStage : 'none', childCount: children, visibleChildCount:childFigures.length, personCount: 1 + childFigures.length + (spouse ? 1 : 0) };
  }
  function shape(x, y, w, h, color, radius = 0) { const c = context; c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill(); }
  function ellipse(x, y, rx, ry, color, rotation = 0) { context.fillStyle = color; context.beginPath(); context.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); context.fill(); }
  function line(points, color, width = 2) { context.strokeStyle = color; context.lineWidth = width; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath(); points.forEach((p, i) => i ? context.lineTo(...p) : context.moveTo(...p)); context.stroke(); }
  function text(value, x, y, size = 14, color = colors.ink, font = 'sans-serif') { context.fillStyle = color; context.font = `${size}px ${font}`; context.fillText(value, x, y); }
  function plant(x, y, size = 1) { const c = context; c.save(); c.translate(x, y); c.scale(size, size); line([[0, 0], [-3, -88]], '#71805a', 3); for (let i = 0; i < 5; i++) { const py = -23 - i * 15; ellipse(-16, py, 20, 8, i % 2 ? '#8d9e6c' : '#6c845b', .55); ellipse(10, py - 6, 18, 8, '#829763', -.65); } shape(-21, -5, 42, 40, '#b87551', 5); shape(-24, -8, 48, 9, '#ca9169', 2); c.restore(); }
  function books(x, y, count = 5) { const palette = ['#be7961', '#68877a', '#dbbf81', '#8e9b86', '#c8ab90']; for (let i = 0; i < count; i++) { const h = 22 + i % 3 * 8; shape(x + i * 12, y - h, 9, h, palette[i % palette.length], 1); line([[x + 2 + i * 12, y - 7], [x + 7 + i * 12, y - 7]], '#eee4ca', 1); } }
  function pottery(x, y, size = 1) { const c = context; c.save(); c.translate(x, y); c.scale(size, size); shape(-12, -15, 24, 24, '#ac7355', 9); ellipse(0, -13, 11, 4, '#d6a680'); ellipse(0, -14, 7, 2, '#8e5d48'); c.restore(); }
  function picture(x, y, w, h, i = 0) { shape(x, y, w, h, '#fff9e8', 2); shape(x + 5, y + 5, w - 10, h - 14, i % 2 ? '#c7d7ce' : '#d2dcc0'); ellipse(x + w - 16, y + 15, 5, 5, '#e5be6c'); context.fillStyle = '#7f9573'; context.beginPath(); context.moveTo(x + 5, y + h - 9); context.lineTo(x + w * .4, y + 16); context.lineTo(x + w * .75, y + h - 9); context.fill(); }
  function drawWindow(month,room) { const summer = month >= 6 && month <= 8, autumn = month >= 9 && month <= 11, winter = month <= 2 || month === 12; const c = context;
    shape(78, 65, 222, 213, '#cfbc98', 5); shape(87, 74, 204, 194, winter ? '#cbdad7' : summer ? '#c8ded1' : '#dde6cc');
    ellipse(245, 113, 23, 23, winter ? '#f5efd5' : '#f5d88e'); ellipse(135, 124, 39, 11, '#f3f1e4'); ellipse(171, 113, 29, 13, '#f4f3e9');
    c.save(); c.beginPath(); c.rect(87,74,204,194); c.clip();
    const view=room.legacy?(state?.config?.region==='rural'?'hills':state?.config?.region==='town'?'garden':'skyline'):room.windowView;
    if(view==='river'){ellipse(180,270,100,65,'#b9cba6');ellipse(265,260,80,48,'#9db994');shape(87,231,204,37,'#9ec4c1');line([[107,247],[149,247]],'#d2e1d4',3);line([[199,256],[258,256]],'#d2e1d4',3);}
    else if (view === 'hills') { ellipse(155, 260, 90, 65, '#acbe97'); ellipse(249, 269, 80, 87, '#94ad88'); shape(130, 235, 29, 31, '#e7dec2'); context.fillStyle='#a88660';context.beginPath();context.moveTo(125,235);context.lineTo(145,217);context.lineTo(165,235);context.fill(); }
    else if (view === 'garden') { shape(99, 226, 54, 42, '#b5bfa7'); shape(164, 214, 41, 54, '#c6ceb7'); ellipse(227, 258, 35, 38, '#9faf8b'); }
    else { shape(94, 210, 55, 58, '#abbdb0'); shape(156, 188, 41, 80, '#bec9b8'); shape(202, 223, 72, 45, '#9eafa0'); for (let i = 0; i < 3; i++) line([[106 + i * 14, 226], [106 + i * 14, 236]], '#e1e5d4', 5); }
    line([[260, 268], [248, 158], [223, 138]], '#8a8866', 5); line([[250, 196], [278, 164]], '#8a8866', 3);
    if (!winter) { ['#b6c298', autumn ? '#d5a165' : '#8fa97f', autumn ? '#c5875b' : '#9fb58b'].forEach((color, i) => ellipse(235 + i * 18, 151 + i * 6, 28, 33, color)); }
    if (winter) for (let i = 0; i < 11; i++) ellipse(102 + i * 17, 95 + ((i * 41 + (reduced.matches ? 0 : elapsed * .008)) % 135), 2, 2, '#fcfbef');
    c.restore();
    shape(185, 73, 8, 195, '#ede4cf'); shape(87, 164, 204, 8, '#ede4cf'); shape(71, 276, 236, 12, '#bba57c', 2);
    shape(60, 52, 260, 8, '#9d8b69', 3); shape(65,61,32,202,room.colors.curtain,3);shape(283,61,32,202,room.colors.curtain,3);
    [70, 80, 292, 303].forEach(x => line([[x, 64], [x + 2, 257]], room.colors.curtainLine,2));
  }
  function windowView(month,room){
    if(!room.legacy&&room.layout==='wide-window'){context.save();context.translate(-15,10);context.scale(1.65,.9);drawWindow(month,room);context.restore();}
    else drawWindow(month,room);
  }
  function decor(room){
    if(room.legacy)return;
    if(room.decor==='plants'){
      line([[430,20],[430,95]],'#9b8f67',2);plant(430,100,.45);plant(530,280,.4);
    }else if(room.decor==='books'){
      shape(529,67,164,240,'#bda17e',3);shape(536,73,150,226,'#dfcfad',2);
      for(let y=109;y<=294;y+=92){books(548,y,8);shape(534,y,154,7,'#a98a64',2);}books(600,294,6);
    }else if(room.decor==='art'){
      if(room.layout==='wide-window'){picture(541,122,57,67,0);picture(613,220,55,66,1);}
      else {picture(339,170,65,78,0);picture(419,127,62,73,1);}
      shape(584,275,37,17,'#d7b67f',3);ellipse(593,282,3,3,'#a56d62');ellipse(606,281,3,3,'#77916c');
    }else if(room.decor==='music'){
      ellipse(699,376,28,35,'#c19b61',-.18);ellipse(697,352,23,26,'#d1ad73',-.18);shape(700,265,10,97,'#9b7850',3);shape(697,250,16,25,'#a8875d',4);ellipse(699,356,10,10,'#706343');line([[703,267],[701,397]],'#eee1b5',1);
      shape(548,170,66,25,'#69857d',4);ellipse(562,182,6,6,'#d0d4ba');ellipse(600,182,6,6,'#d0d4ba');
    }
  }
  function hair(style, color, behind) {
    const c=context;c.fillStyle=color;
    if(behind){
      if(style==='long-soft'){shape(-32,-57,64,64,color,25);ellipse(-28,-10,10,25,color,-.12);ellipse(28,-10,10,25,color,.12);}
      if(style==='bob')shape(-32,-60,64,65,color,19);
      if(style==='ponytail'){ellipse(31,-34,12,31,color,-.18);ellipse(28,-51,9,8,color);}
      if(style==='bun')ellipse(8,-78,16,13,color,.1);
      if(style==='braids'){for(const x of [-31,31]){ellipse(x,-24,8,36,color,x<0?-.04:.04);for(let y=-43;y<9;y+=13)ellipse(x,y,9,7,color);shape(x-6,5,12,5,'#d9b780',2);}}
      if(style==='curly')for(let i=0;i<7;i++){const angle=Math.PI+i*Math.PI/6;ellipse(Math.cos(angle)*25,-37+Math.sin(angle)*23,12,12,color);}
      return;
    }
    if(style==='curly'){ellipse(0,-57,28,13,color);for(let i=0;i<6;i++)ellipse(-27+i*11,-50-Math.sin(i*Math.PI/5)*13,10,11,color);return;}
    if(style==='buzz'){c.beginPath();c.moveTo(-27,-40);c.lineTo(-27,-53);c.quadraticCurveTo(-27,-66,0,-68);c.quadraticCurveTo(27,-66,27,-53);c.lineTo(27,-40);c.lineTo(22,-49);c.quadraticCurveTo(0,-59,-22,-49);c.closePath();c.fill();return;}
    c.beginPath();
    if(style==='short-swept'||style==='ponytail'){c.moveTo(-27,-31);c.quadraticCurveTo(-36,-71,3,-69);c.quadraticCurveTo(34,-67,27,-28);c.lineTo(17,-46);c.quadraticCurveTo(0,-35,-19,-49);}
    else if(style==='long-soft'){c.moveTo(-28,-27);c.quadraticCurveTo(-37,-72,0,-71);c.quadraticCurveTo(36,-71,28,-27);c.lineTo(21,-48);c.quadraticCurveTo(7,-48,1,-61);c.quadraticCurveTo(-8,-44,-24,-44);}
    else if(style==='side-wave'){c.moveTo(-28,-28);c.quadraticCurveTo(-36,-56,-22,-62);c.quadraticCurveTo(-15,-77,5,-69);c.quadraticCurveTo(32,-72,30,-48);c.lineTo(23,-27);c.lineTo(18,-48);c.quadraticCurveTo(-2,-31,-20,-43);}
    else if(style==='bob'){c.moveTo(-30,-23);c.lineTo(-30,-47);c.quadraticCurveTo(-29,-73,0,-70);c.quadraticCurveTo(30,-70,30,-47);c.lineTo(30,-23);c.lineTo(23,-44);c.lineTo(8,-44);c.lineTo(1,-53);c.lineTo(-4,-44);c.lineTo(-24,-44);}
    else if(style==='braids'){c.moveTo(-28,-29);c.quadraticCurveTo(-34,-69,0,-69);c.quadraticCurveTo(34,-69,28,-29);c.lineTo(23,-45);c.quadraticCurveTo(6,-48,0,-60);c.quadraticCurveTo(-7,-48,-23,-45);}
    else if(style==='bun'){c.moveTo(-28,-31);c.quadraticCurveTo(-32,-70,0,-69);c.quadraticCurveTo(32,-70,28,-31);c.lineTo(23,-47);c.quadraticCurveTo(0,-56,-23,-47);}
    else {c.moveTo(-28,-27);c.quadraticCurveTo(-33,-72,0,-69);c.quadraticCurveTo(34,-68,28,-26);c.lineTo(19,-45);c.quadraticCurveTo(0,-38,-20,-45);}
    c.closePath();c.fill();
  }
  function face(style,skin){
    const c=context,kind=style.faceShape;
    if(!kind){ellipse(0,-34,27,31,skin.face);return;}
    if(kind==='round'){ellipse(0,-33,29,28,skin.face);return;}
    if(kind==='oval'){ellipse(0,-34,25,33,skin.face);return;}
    if(kind==='long'){ellipse(0,-31,22,35,skin.face);return;}
    if(kind==='square'){shape(-27,-63,54,57,skin.face,11);return;}
    c.fillStyle=skin.face;c.beginPath();c.moveTo(0,-65);c.bezierCurveTo(29,-67,35,-46,25,-29);c.quadraticCurveTo(18,-12,0,-3);c.quadraticCurveTo(-18,-12,-25,-29);c.bezierCurveTo(-35,-46,-29,-67,0,-65);c.closePath();c.fill();
  }
  function character(activity, person) { const c = context; const resting = activity === 'rest'; const walk = ['walk', 'run', 'pt', 'garden'].includes(activity); const wave = reduced.matches || person.kind !== 'player' ? 0 : Math.sin(elapsed / 470); const style = person.appearance, skin=style.skin||{face:'#e4ba8e',limb:'#dba77e',neck:'#d8ac7e',blush:'#d89476'}; c.save(); c.translate(person.x, person.y + (walk ? wave * 2 : wave * .5)); c.scale(person.scale*(person.facing||1), person.scale);
    ellipse(0, 102, 42, 9, '#9f9d7b35');
    line(resting ? [[-10,54],[-26,68],[-25,95],[-35,97]] : [[-10, 54], [-13 + (walk ? wave * 8 : 0), 92], [-28 + (walk ? wave * 8 : 0), 94]], '#54645b', 14);
    line(resting ? [[12,54],[30,68],[31,95],[41,97]] : [[12, 54], [20 - (walk ? wave * 8 : 0), 91], [32 - (walk ? wave * 8 : 0), 93]], '#54645b', 14);
    hair(style.hair, style.hairColor, true);
    shape(-25, -5, 50, 69, style.top, 18);
    if (style.gender === 'woman') { line([[-14, 1], [0, 12], [14, 1]], style.trim, 4); shape(-20,43,40,5,style.trim,2); }
    else if (style.gender === 'other') { line([[-15, 0], [-8, 51]], style.trim, 5); shape(10,19,9,13,style.trim,2); }
    else if (style.gender === 'unspecified') { line([[0, 3], [0, 58]], style.trim, 3); ellipse(6,20,2,2,style.trim);ellipse(6,32,2,2,style.trim); }
    else { line([[-13, 0], [0, 8], [13, 0]], style.trim, 3); shape(9,18,10,10,style.trim,2); }
    shape(-9,-19,18,24,skin.neck||skin.limb,7);face(style,skin);
    hair(style.hair, style.hairColor, false);
    ellipse(-9, -31, 1.6, 2, '#574a3b'); ellipse(9, -31, 1.6, 2, '#574a3b'); line([[-4, -18], [1, -16], [6, -19]], '#a16c50', 1.5); ellipse(-17, -24, 4, 2, skin.blush); ellipse(17, -24, 4, 2, skin.blush);
    if (['read', 'study', 'research', 'jobstudy', 'child-book'].includes(activity)) { line([[-24, 11], [-30, 40], [-9, 44]], skin.limb, 11); line([[24, 11], [31, 39], [11, 44]], skin.limb, 11); shape(-25, 27, 50, 30, '#f2dfaa', 2); line([[0, 29], [0, 55]], '#b7a06f', 2); }
    else if (activity === 'child-play') { line([[-24,11],[-30,35],[-13,43]],skin.limb,11);line([[24,11],[30,35],[13,43]],skin.limb,11);ellipse(0,40,19,18,'#d3b264');line([[-14,34],[13,45]],'#f1dca3',3); }
    else if (activity === 'child-toddler') { line([[-24,11],[-31,29],[-16,33]],skin.limb,11);line([[24,11],[31,29],[16,33]],skin.limb,11);ellipse(0,37,20,21,'#d6b379');ellipse(-15,19,8,8,'#d6b379');ellipse(15,19,8,8,'#d6b379');ellipse(-6,32,2,2,'#7e694d');ellipse(6,32,2,2,'#7e694d'); }
    else if (activity === 'child-adult' || activity === 'child-leave') { line([[-24,11],[-30,39],[-7,43]],skin.limb,11);line([[24,11],[30,38],[14,42]],skin.limb,11);shape(-10,25,22,33,'#607f78',3);shape(-6,29,14,23,'#dbe3cb',2);if(activity==='child-leave'){shape(-24,-4,48,8,'#596e59',2);shape(7,14,15,10,'#bec8a0',1);line([[-16,17],[-2,17]],'#4d6350',3);} }
    else if (activity === 'photo') { line([[-22, 10], [-32, -8], [-13, -13]], skin.limb, 11); line([[23, 10], [31, -7], [14, -13]], skin.limb, 11); shape(-19, -20, 38, 25, '#536157', 4); ellipse(0, -8, 10, 10, '#273d39'); ellipse(0, -8, 5, 5, '#8fafa3'); }
    else if (activity === 'music') { line([[-23, 12], [-35, 40], [-10, 43]], skin.limb, 11); line([[23, 12], [30, 35], [14, 40]], skin.limb, 11); ellipse(-3, 46, 20, 24, '#d6ac6e', -.3); shape(8, 3, 9, 53, '#9e7d53', 3); ellipse(-1, 41, 7, 7, '#705f40'); }
    else if (activity === 'draw') { line([[-23, 12], [-30, 44]], skin.limb, 11); line([[23, 12], [42, 18], [58, 4 + wave * 3]], skin.limb, 11); line([[57, 5], [67, -16 + wave * 3]], '#6c7455', 3); }
    else if (['pottery','cook','garden'].includes(activity)) { line([[-23,12],[-31,37],[-12,43]],skin.limb,11);line([[23,12],[31,37],[12,43]],skin.limb,11);if(activity==='garden')plant(0,36,.35);else { ellipse(0,43,20,14,activity==='cook'?'#e1c792':'#ad7855');ellipse(0,36,20,5,activity==='cook'?'#82965b':'#cc9f79'); if(activity==='cook')line([[10,34],[23,5+wave*3]],'#84684b',4); } }
    else if (activity === 'care') { line([[-23,12],[-29,38],[-8,45]],skin.limb,11);line([[23,12],[28,35],[8,45]],skin.limb,11);shape(-23,27,46,29,'#d5c49a',3);line([[0,30],[0,53]],'#9f946f',2);line([[-16,36],[-6,36]],'#f1e2bd',3);line([[6,41],[16,41]],'#f1e2bd',3); }
    else if (activity === 'cleaning' || activity === 'chores' && !!state?.household) { line([[-24,11],[-33,42]],skin.limb,11);line([[24,11],[29,32],[36,40]],skin.limb,11);line([[37,17],[37,90]],'#a48c5d',5);shape(22,86,31,12,'#c8d2b3',3); }
    else if (activity === 'culture' || activity === 'cinema') { line([[-24,11],[-29,37],[-9,43]],skin.limb,11);line([[24,11],[30,37],[11,43]],skin.limb,11);shape(-23,28,46,28,'#e9c27e',3);line([[-11,31],[-11,53]],'#b18a56',2);text('★',-3,49,19,'#927550'); }
    else if (activity === 'delivery') { shape(-23,3,46,54,'#b68953',7);line([[-16,11],[16,11]],'#e9dfad',4);line([[-24,11],[-34,36],[-17,44]],skin.limb,11);line([[24,11],[34,36],[17,44]],skin.limb,11);shape(-24,28,48,34,'#d7ad75',3);line([[0,29],[0,59]],'#f0dbb4',5);line([[-19,35],[-9,35]],'#af875c',2); }
    else if (activity === 'parttime') { shape(-19,10,38,51,'#e0d3ae',4);line([[-15,1],[-13,13],[13,13],[15,1]],'#e0d3ae',4);line([[-24,11],[-31,37],[-13,43]],skin.limb,11);line([[24,11],[31,35],[13,40]],skin.limb,11);shape(-22,30,43,29,'#8ca091',3);line([[-16,35],[15,35]],'#dbe2cd',2);shape(6,21,16,18,'#677e72',3); }
    else if (activity === 'sideproject') { line([[-24,11],[-31,38],[-10,44]],skin.limb,11);line([[24,11],[31,38],[10,44]],skin.limb,11);shape(-27,23,54,34,'#708b86',3);shape(-22,27,44,24,'#d9e2cd',2);shape(-30,55,60,5,'#59766e',2);ellipse(0,36,6,6,'#d8b879');line([[-3,43],[3,43]],'#b2965d',2); }
    else { line([[-24, 10], [-33 + wave * 2, 42]], skin.limb, 11); line([[24, 10], [34 - wave * 2, 42]], skin.limb, 11); }
    if(person.ill){shape(-22,-51,44,10,'#d1ded6',3);line([[-16,-47],[15,-47]],'#edf1e5',2);ellipse(-17,-24,5,3,'#c3826e');ellipse(17,-24,5,3,'#c3826e');}
    if(person.recovering==='traffic_minor'){shape(-36,28,17,12,'#eeead7',3);line([[-32,32],[-23,32]],'#c7c6ae',2);}
    else if(person.recovering){line([[-18,-2],[0,9],[19,-2]],'#d2bc91',8);line([[12,5],[17,29]],'#d2bc91',7);}
    c.restore();
  }
  function draw() { if (!canvas || !context) return; const c = context, dpr = Math.min(root.devicePixelRatio || 1, 2), width = canvas.clientWidth || 760, height = canvas.clientHeight || 550;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    c.setTransform(dpr * width / 760, 0, 0, dpr * height / 550, 0, 0); c.clearRect(0, 0, 760, 550);
    const month=Number((state?.date||'2026-01-01').slice(5,7)),housing=state?.config?.housing||'studio',room=homeStyle(state?.config),theme=room.colors;
    c.save();if(room.mirrored){c.translate(760,0);c.scale(-1,1);}
    shape(0,0,760,550,room.legacy&&housing==='shared'?'#e5e7d7':theme.wall);shape(0,340,760,210,theme.floor);shape(0,338,760,12,theme.trim);
    for (let i = 0; i < 8; i++) line([[0, 377 + i * 30], [760, 377 + i * 30]], theme.floorLine,1);
    [[140, 350, 152, 377], [370, 377, 394, 407], [625, 407, 662, 437], [230, 437, 267, 467], [490, 467, 540, 497]].forEach(p => line([[p[0], p[1]], [p[2], p[3]]], theme.floorLine,1));
    windowView(month,room);
    // Sunlight, soft rug, and the same room gradually filling with memories.
    c.fillStyle = '#f4e9bf35'; c.beginPath(); c.moveTo(85, 285); c.lineTo(275, 285); c.lineTo(520, 510); c.lineTo(160, 510); c.fill();
    ellipse(380,460,230,60,theme.rug);ellipse(380,460,209,47,theme.rugInner);
    shape(75,345,182,76,room.legacy?'#a4b39a':theme.sofaDark,14); shape(65, 330, 196, 67, theme.sofa,19); shape(64, 346, 25, 73, theme.sofaDark,11); shape(243, 346, 24, 73, theme.sofaDark,11); shape(89, 349, 74, 45, theme.cushion,10); shape(168, 350, 71, 44, room.legacy?'#c3cbaa':theme.cushion,10); shape(93, 350, 36, 29, theme.accent,7); line([[85, 419], [82, 439]], '#8f7954', 7); line([[245, 418], [248, 435]], '#8f7954', 7);
    shape(536, 109, 148, 7, '#b69970', 2); shape(539, 201, 145, 7, '#b69970', 2); shape(538, 294, 147, 8, '#b69970', 2); line([[548, 118], [548, 130]], '#9d8c64', 3); line([[671, 118], [671, 130]], '#9d8c64', 3); books(548, 109, 5); pottery(651, 98, 1.1); picture(550, 148, 40, 52); plant(654, 180, .45); books(552, 294, 3); pottery(622, 282, 1.2);
    decor(room);
    const artifacts = state?.artifacts || []; artifacts.slice(-7).forEach((a, i) => { const kind = a.activityId || a.activity || a.type || ''; if (kind === 'pottery') pottery(595 + i % 3 * 29, 281 - Math.floor(i / 3) * 92, .85); else if (kind === 'photo' || kind === 'draw') picture(room.layout==='wide-window'?547+i%3*47:328+i%3*48,room.layout==='wide-window'?148+Math.floor(i/3)*48:127+Math.floor(i/3)*56,37,45,i); else books(603 + i % 3 * 18, 201, 1); });
    if (housing === 'apartment') { shape(680, 331, 73, 67, '#c4cbb4', 7); shape(681, 331, 72, 8, '#a9b99e', 2); line([[700, 345], [700, 385]], '#b0bba0', 1); }
    if(housing==='shared'&&room.legacy){picture(339,93,43,51,1);text('HOME',341,164,11,'#a79371','Georgia');}
    if (Number(state?.config?.children) > 0 && (!Array.isArray(state.config.childProfiles)||state.config.childProfiles.some(p=>p.age<13))) { shape(99, 454, 21, 21, '#b57b5b', 2); shape(120, 458, 17, 17, '#7e9980', 2); shape(112, 437, 17, 17, '#d5b678', 2); }
    if(state?.household?.cleanliness<45){shape(23,478,46,12,'#b6a184',5);shape(35,470,34,12,'#a8b4a0',5);shape(76,491,31,11,'#d5b68b',2);line([[82,494],[99,494]],'#b1946d',2);ellipse(56,513,13,4,'#b39d7c');}
    else if(state?.household?.cleanliness>=80){line([[34,447],[34,463]],'#f4efd5',2);line([[27,455],[41,455]],'#f4efd5',2);line([[691,489],[691,501]],'#f4efd5',2);line([[685,495],[697,495]],'#f4efd5',2);}
    if (state?.config?.transport === 'walk') { shape(674, 459, 28, 12, '#af805d', 5); shape(704, 459, 28, 12, '#af805d', 5); line([[680,461],[689,461]],'#e9d7b4',2); line([[710,461],[719,461]],'#e9d7b4',2); }
    else if (state?.config?.transport === 'car') { line([[606,325],[622,325]],'#9a8b69',3); ellipse(604,325,5,5,'#9a8b69'); shape(620,322,6,9,'#9a8b69',1); }
    else { shape(605,317,21,13,'#718f80',2); line([[609,321],[622,321]],'#e4e5cf',2); }
    if(room.legacy||room.decor!=='music')plant(705,382,1.08); shape(503, 373, 151, 13, '#bb9366', 6); line([[517, 384], [509, 439]], '#9c815c', 7); line([[639, 383], [647, 437]], '#9c815c', 7); shape(544, 356, 50, 14, '#e5d6b2', 3); line([[548, 360], [589, 360]], '#b2a185', 1); shape(605, 348, 16, 23, '#f5efdb', 4); c.strokeStyle = '#f5efdb'; c.lineWidth = 4; c.beginPath(); c.arc(621, 358, 6, -1.5, 1.5); c.stroke();
    if (active === 'draw') { line([[454, 350], [477, 282], [501, 351]], '#a78959', 4); picture(453, 275, 48, 57, 1); }
    if (['study', 'overtime', 'research', 'jobstudy'].includes(active)) { shape(553, 327, 43, 32, '#708575', 3); shape(557, 331, 35, 24, '#c7d4bc', 2); shape(549, 359, 52, 4, '#657c6f', 2); }
    if(!room.legacy&&room.decor==='music')decor(room);
    c.restore();
    const family = familyLayout(state?.config, active, state);
    if (family.spouse) character(family.spouse.activity, family.spouse);
    character(active, family.player);
    family.children.forEach(child => character(child.activity, child));
    // Small, hand-drawn room details anchor the scene without depending on images.
    const calendarX=room.mirrored?760-363:room.layout==='wide-window'?710:332,calendarY=room.layout==='wide-window'?66:60;line([[calendarX-9,calendarY+23],[calendarX+39,calendarY+23]],'#b4a383',2);shape(calendarX,calendarY,31,29,'#fff6df',1);text(String(month).padStart(2,'0'),calendarX+4,calendarY+21,17,'#9f7954','Georgia');
    shape(12, 516, 736, 18, '#f8f3df1a');
  }
  function loop(timestamp) { if (!canvas?.isConnected) return; if (!reduced.matches) elapsed += Math.min(80, timestamp - (lastFrame || timestamp)); lastFrame = timestamp; draw(); frame = requestAnimationFrame(loop); }
  const api = { attach(element, nextState, activity) { if (frame) cancelAnimationFrame(frame); canvas = element; if (!canvas) return; context = canvas.getContext('2d'); state = nextState; active = activity || 'rest'; lastFrame = 0; draw(); frame = requestAnimationFrame(loop); }, update(nextState, activity) { state = nextState; active = activity || active; draw(); }, advance(ms) { elapsed += Number(ms) || 0; draw(); }, describe() { const family = familyLayout(state?.config, active, state); return { date:state?.date||null, coordinateSystem: 'room canvas, origin top-left, x right, y down; logical 760 × 550', character: { ...family.player, gender: family.player.appearance.gender }, home:homeStyle(state?.config), family: { maritalStatus: family.maritalStatus, spouse: family.spouse, children: family.children, childCount: family.childCount, childAge: family.childAge, visibleChildCount:family.visibleChildCount, awayChildren:family.awayChildren, personCount: family.personCount }, household:state?.household?{cleanliness:state.household.cleanliness,appearance:state.household.cleanliness<45?'cluttered':state.household.cleanliness>=80?'tidy':'lived-in'}:null, healthEpisode:state?.healthEpisode?{...state.healthEpisode}:null, recovery:state?.flags?.recoveryUntil?{cause:state.flags.recoveryCause,until:state.flags.recoveryUntil,active:state.flags.recoveryUntil>=state.date}:null,overloadSaturday:state?.flags?.overloadSaturday||null,vaccineDate:state?.flags?.vaccineDate||null, seasonMonth: Number((state?.date || '2026-01-01').slice(5, 7)), artifacts: state?.artifacts?.length || 0, reducedMotion: reduced.matches }; }, familyLayout, appearance, homeStyle, OPTIONS };
  root.S2Scene = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
