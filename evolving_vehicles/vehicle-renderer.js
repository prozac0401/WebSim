/* Side-profile vehicle artwork. Geometry follows the physical chassis frame and axles.
 * Drawing is presentation-only; no random values or physical state are changed. */
(function (root) {
  'use strict';
  const STYLE_IDS = ['ray', 'avante', 'staria', 'musso_ev', 'ioniq5', 'santafe', 'morning', 'k5', 'grandeur', 'carnival', 'g80', 'torres'];
  const TAU = Math.PI * 2;
  function trace(ctx, points) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
  }
  function blend(hex, to, amount) {
    const from = hex.replace('#', '');
    return '#' + [0, 2, 4].map(i => {
      const value = parseInt(from.slice(i, i + 2), 16);
      return Math.round(value + (to - value) * amount).toString(16).padStart(2, '0');
    }).join('');
  }
  function drawVehicle(ctx, vehicle, options = {}) {
    const d = vehicle.design, g = vehicle.genome;
    const live = options.live !== false, engineering = options.engineering === true;
    const style = typeof d.style === 'number' ? d.style : STYLE_IDS.indexOf(d.style);
    const rugged = style === 3 || style === 5 || style === 11, metallic = style === 4;
    const base = vehicle.color;
    const w = g.width, h = g.height;
    const P = (x, y) => ({ x: d.frame.x + w * (x + (y < -.4 ? (x < 0 ? g.roofLeft : g.roofRight) * .35 : 0)), y: d.frame.y + h * y });
    const c = Math.cos(vehicle.body.angle), s = Math.sin(vehicle.body.angle);
    const wheels = vehicle.wheels.map((wheel, i) => {
      const dx = wheel.position.x - vehicle.body.position.x, dy = wheel.position.y - vehicle.body.position.y;
      return { p: live ? {x: c * dx + s * dy, y: -s * dx + c * dy} : (i ? d.frontAxle : d.rearAxle),
        axle: i ? d.frontAxle : d.rearAxle, r: i ? g.frontRadius : g.rearRadius,
        angle: live ? wheel.angle - vehicle.body.angle : 0, driven: d.driveShares[i] > 0 };
    });
    const xs = d.outline.map(p => p.x), ys = d.outline.map(p => p.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const poly = (points, fill, stroke, width = .45) => {
      trace(ctx, points.map(p => P(...p)));
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    };
    const line = (points, color, width = .45) => {
      ctx.beginPath();
      points.forEach((p, i) => { const q = P(...p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    const glass = points => {
      const pts = points.map(p => P(...p));
      trace(ctx, pts);
      const glassPaint = ctx.createLinearGradient(0, top, w * .16, bottom);
      glassPaint.addColorStop(0, '#b5c9cf'); glassPaint.addColorStop(.40, '#415865'); glassPaint.addColorStop(1, '#16232d');
      ctx.fillStyle = glassPaint; ctx.fill(); ctx.strokeStyle = '#283238'; ctx.lineWidth = .8; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#bcd5dd31'; ctx.beginPath(); ctx.moveTo(left - w * .05, top);
      ctx.lineTo(left + w * .25, top); ctx.lineTo(right, bottom); ctx.lineTo(right - w * .15, bottom); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d4e6e961'; ctx.lineWidth = .55;
      ctx.beginPath(); ctx.moveTo(pts[0].x + 1, pts[0].y + 1); ctx.lineTo(pts[1].x - 1, pts[1].y + 1); ctx.stroke();
      ctx.restore();
    };
    const handle = (x, y, length = .049, chrome = true) => {
      line([[x,y],[x+length,y]], '#15232b', 1.1);
      if (chrome) line([[x+.004,y-.009],[x+length-.004,y-.009]], '#dee2dd', .45);
    };
    const lamp = (points, color) => {
      poly(points, '#283239', '#19252b', .25);
      const inset = points.map(([x,y])=>[x,y]);
      poly(inset, color);
      const a = P(...points[0]), b = P(...points[1]);
      ctx.strokeStyle = '#ffffff90'; ctx.lineWidth = .35; ctx.beginPath(); ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    };
    // The underbody and wheel wells are shaded separately from painted metal.
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    line([[-.34,.32],[.34,.32]], '#172027', 1.4);
    for (const wheel of wheels) {
      ctx.beginPath();ctx.arc(wheel.axle.x,wheel.axle.y,wheel.r+1.15,0,TAU);
      ctx.fillStyle='#11191e';ctx.fill();
    }
    // Subtract actual axle openings: the tires never look pasted onto a slab.
    trace(ctx, d.outline);
    for (const wheel of wheels) {
      ctx.moveTo(wheel.axle.x+wheel.r+.6,wheel.axle.y);
      ctx.arc(wheel.axle.x,wheel.axle.y,wheel.r+.6,0,TAU);
    }
    ctx.save();ctx.clip('evenodd');trace(ctx,d.outline);ctx.clip();
    const paint = ctx.createLinearGradient(0,top,0,bottom);
    paint.addColorStop(0,blend(base,255,.50));paint.addColorStop(.22,blend(base,255,.21));
    paint.addColorStop(.48,base);paint.addColorStop(.53,blend(base,255,.28));
    paint.addColorStop(.66,blend(base,0,.06));paint.addColorStop(1,blend(base,0,.39));
    ctx.fillStyle=paint;ctx.fillRect(left-2,top-2,right-left+4,bottom-top+4);
    const bright = blend(base,255,.57), seam = blend(base,0,.56);
    line([[-.48,.14],[.48,.14]], '#ffffff22', .45);
    line([[-.49,.30],[.49,.30]], '#101b2670', .8);
    if (style === 0) {
      // Kia Ray: tall city-car cabin, short bonnet, and adjacent sliding-door handles.
      poly([[-.48,-.715],[.165,-.715],[.31,-.20],[-.47,-.15]],'#202d33');
      glass([[-.443,-.663],[-.348,-.667],[-.348,-.193],[-.446,-.184]]);
      glass([[-.320,-.671],[-.032,-.669],[-.032,-.190],[-.319,-.19]]);
      glass([[.006,-.669],[.146,-.662],[.277,-.199],[.006,-.19]]);
      line([[-.335,-.727],[-.335,-.15],[-.324,.03],[-.278,.287],[-.018,.287],[-.018,-.713]],seam,.50);
      line([[.286,-.19],[.306,.281],[-.018,.281]],seam,.48);
      line([[-.476,-.05],[-.333,-.05]],'#243940',.95);
      line([[-.474,-.044],[-.333,-.044]],bright,.3);
      handle(-.086,-.077,.052); handle(.005,-.077,.052);
      poly([[-.253,.19],[.222,.19],[.246,.26],[-.244,.26]],blend(base,255,.12));
      line([[-.253,.263],[.247,.263]],bright,.5);
      line([[.324,-.223],[.47,-.202]],bright,.7);
      lamp([[.454,-.203],[.49,-.179],[.493,.052],[.468,.048],[.456,-.015]],'#344149');
      line([[.469,-.168],[.485,-.156],[.486,.026],[.472,.026]],'#e8f3ee',.7);
      lamp([[-.494,-.398],[-.48,-.395],[-.48,.037],[-.496,.037]],'#b63839');
      line([[-.487,-.351],[-.487,-.105]],'#f38377',.38);
      poly([[.465,.188],[.507,.18],[.507,.299],[.452,.299]],'#25343b');
      poly([[-.505,.251],[-.452,.251],[-.452,.303],[-.505,.303]],'#324046');
    } else if (style === 1) {
      // Eighth-generation Avante: a three-box sedan, long bonnet and upright H-edge tail.
      glass([[-.315,-.338],[-.203,-.641],[-.179,-.635],[-.214,-.341]]);
      glass([[-.177,-.682],[-.104,-.728],[-.020,-.725],[-.025,-.321],[-.193,-.321]]);
      glass([[.007,-.724],[.074,-.715],[.115,-.666],[.23,-.314],[.003,-.314]]);
      line([[-.021,-.753],[-.029,-.30]],'#202d35',1.0);
      line([[-.192,-.30],[-.218,.236],[-.049,.274],[-.04,-.29]],seam,.45);
      line([[-.04,.274],[.214,.274],[.244,-.268]],seam,.45);
      // The sculpted lower faces are metal reflections, rather than racing air intakes.
      poly([[-.216,-.048],[-.038,.152],[.202,-.078],[.178,.237],[-.16,.237]],blend(base,255,.17));
      line([[-.388,-.153],[-.22,-.163],[-.04,.105],[.214,-.14],[.44,-.169]],bright,.55);
      line([[-.207,.253],[.204,.253]],'#1a2b3560',.55);
      handle(-.160,-.200,.054,false);handle(.01,-.20,.054,false);
      line([[-.48,-.284],[-.355,-.287]],bright,.60);
      line([[.284,-.259],[.458,-.214]],bright,.65);
      lamp([[.44,-.224],[.491,-.096],[.482,-.053],[.448,-.134]],'#d9e8e5');
      line([[.443,-.19],[.470,-.12]],'#fbfff0',.5);
      lamp([[-.498,-.249],[-.475,-.248],[-.475,.031],[-.497,.051]],'#953b40');
      line([[-.488,-.223],[-.488,.018]],'#f1736c',.7);
      poly([[.448,.061],[.503,.046],[.503,.19],[.445,.14]],'#1f3039');
      line([[-.497,.201],[-.443,.214]],'#c94948',.65);
      line([[-.209,.297],[.235,.297]],'#a4b6bb',.45);
    } else if (style === 2) {
      // Staria Lounge: one smooth roof-to-nose arc and exceptionally deep panoramic glass.
      poly([[-.465,-.724],[.074,-.72],[.178,-.655],[.28,-.474],[.363,-.207],[.379,-.107],[-.472,-.104]],'#182731');
      glass([[-.438,-.677],[-.259,-.683],[-.26,-.165],[-.44,-.162]]);
      glass([[-.230,-.687],[.051,-.679],[.055,-.163],[-.23,-.163]]);
      glass([[.086,-.66],[.161,-.61],[.25,-.438],[.344,-.16],[.086,-.16]]);
      // Slim ventilation window inset within the second-row glazing.
      line([[-.173,-.605],[.002,-.604],[.002,-.248],[-.174,-.248],[-.173,-.605]],'#809aa16b',.35);
      line([[-.25,-.752],[-.255,.285],[.061,.285],[.066,-.73]],seam,.45);
      line([[.086,-.145],[.324,-.139],[.39,.28],[.086,.28],[.086,-.145]],seam,.45);
      handle(.005,-.063,.039,false);handle(.088,-.063,.044,false);
      line([[-.474,-.057],[-.272,-.057]],'#172a33',.6);
      line([[-.442,.179],[.357,.179]],bright,.42);
      line([[-.253,.297],[.322,.297]],'#a4b4b6',.8);
      lamp([[.414,-.187],[.469,-.056],[.469,-.033],[.414,-.162]],'#eff9ef');
      poly([[.465,.018],[.496,.054],[.504,.25],[.467,.249]],'#172a36');
      for(let i=0;i<4;i++)line([[.470,.04+i*.047],[.496,.065+i*.044]],'#b7c6c8',.65);
      lamp([[-.498,-.524],[-.479,-.519],[-.479,.197],[-.498,.197]],'#953a43');
      for(let i=0;i<9;i++)line([[-.495,-.45+i*.066],[-.482,-.45+i*.066]],'#f08078',.45);
      line([[-.452,-.756],[.031,-.777]],bright,.5);
    } else if (style === 3) {
      // Musso EV: a separate open cargo bed, upright four-door cab and broad cladding.
      poly([[-.505,-.382],[-.19,-.382],[-.19,-.304],[-.505,-.304]],'#25383e');
      line([[-.491,-.338],[-.197,-.338]],'#6a7b7c',.55);
      poly([[-.193,-.75],[-.158,-.75],[-.156,-.279],[-.193,-.279]],'#293c42');
      poly([[-.190,-.726],[-.178,-.727],[-.176,-.327],[-.188,-.34]],'#b4bfc0');
      glass([[-.142,-.691],[.001,-.702],[.001,-.302],[-.151,-.302]]);
      glass([[.034,-.702],[.087,-.697],[.119,-.659],[.208,-.309],[.034,-.303]]);
      line([[.017,-.729],[.017,-.291]],'#253039',1.3);
      line([[-.157,-.283],[-.159,.281],[.017,.281],[.017,-.278]],seam,.5);
      line([[.017,.281],[.231,.281],[.245,-.256]],seam,.5);
      handle(-.124,-.201,.045,false);handle(.055,-.201,.047,false);
      line([[-.187,-.145],[-.187,.301]],seam,.65);
      line([[-.477,-.269],[-.206,-.269]],bright,.45);
      poly([[-.176,.204],[.24,.204],[.24,.334],[-.176,.334]],'#2a3a41');
      line([[-.162,.252],[.218,.252]],'#a6b1b1',.6);
      line([[.266,-.246],[.453,-.218]],bright,.55);
      lamp([[.431,-.225],[.486,-.149],[.486,-.09],[.431,-.171]],'#dae7e4');
      for(let i=0;i<3;i++)line([[.438+i*.017,-.194+i*.022],[.44+i*.017,-.155+i*.021]],'#fafff4',.45);
      poly([[.461,-.002],[.503,.001],[.504,.288],[.452,.255]],'#25343c');
      lamp([[-.5,-.285],[-.478,-.285],[-.478,.138],[-.5,.14]],'#bd453f');
      line([[-.490,-.25],[-.49,.104]],'#ff967c',.6);
      poly([[-.508,.243],[-.447,.243],[-.447,.313],[-.508,.313]],'#28373e');
    } else if (style === 4) {
      // Ioniq 5: long wheelbase, angular hatch, pixel lamps and diagonal door surfacing.
      poly([[-.448,-.34],[-.327,-.743],[-.278,-.751],[.096,-.737],[.257,-.289]],'#22343e');
      glass([[-.408,-.341],[-.313,-.682],[-.256,-.683],[-.244,-.331]]);
      glass([[-.228,-.691],[-.052,-.694],[-.052,-.321],[-.214,-.323]]);
      glass([[-.023,-.695],[.082,-.687],[.225,-.306],[-.023,-.316]]);
      line([[-.039,-.72],[-.039,-.305]],'#1e2c34',1.1);
      line([[-.232,-.298],[-.26,.263],[-.046,.263],[-.038,-.293]],seam,.5);
      line([[-.046,.263],[.233,.263],[.25,-.286]],seam,.45);
      poly([[-.246,-.073],[.047,.214],[.238,-.10],[.236,.277],[-.248,.277]],blend(base,255,.24));
      line([[-.246,-.081],[.044,.222],[.242,-.129]],bright,.8);
      line([[-.462,-.204],[-.262,-.238]],bright,.6);
      handle(-.196,-.206,.055,false);handle(.006,-.21,.055,false);
      poly([[-.5,-.20],[-.427,-.20],[-.427,-.067],[-.5,-.064]],'#25343b');
      poly([[.438,-.211],[.5,-.105],[.5,-.018],[.438,-.124]],'#293a42');
      for(let i=0;i<3;i++){
        poly([[-.490+i*.018,-.18],[-.478+i*.018,-.18],[-.478+i*.018,-.096],[-.490+i*.018,-.096]],'#f18874');
        poly([[.447+i*.016,-.17+i*.025],[.458+i*.016,-.15+i*.025],[.458+i*.016,-.099+i*.025],[.447+i*.016,-.119+i*.025]],'#e8fff3');
      }
      poly([[-.234,.267],[.234,.267],[.255,.331],[-.26,.331]],'#a8b5b6');
      for(let i=0;i<8;i++)line([[-.197+i*.05,.281],[-.181+i*.05,.314]],'#60767d',.35);
      poly([[.441,.188],[.503,.188],[.503,.316],[.436,.271]],'#233640');
      line([[-.344,-.754],[-.449,-.292]],'#24363e',.7);
    } else if (style === 5) {
      // Santa Fe: square extended roof, large quarter glass and horizontal H lighting.
      poly([[-.474,-.72],[.115,-.72],[.244,-.262],[-.479,-.262]],'#23333b');
      glass([[-.445,-.669],[-.254,-.672],[-.254,-.301],[-.452,-.301]]);
      glass([[-.223,-.676],[-.05,-.676],[-.05,-.301],[-.223,-.301]]);
      glass([[-.016,-.676],[.092,-.672],[.201,-.307],[-.016,-.301]]);
      line([[-.239,-.735],[-.239,-.269]],'#1c2d35',1.1);
      line([[-.034,-.731],[-.034,-.275]],'#1c2d35',1.1);
      line([[-.221,-.271],[-.227,.273],[-.034,.273],[-.034,-.271]],seam,.5);
      line([[-.034,.273],[.223,.273],[.237,-.263]],seam,.5);
      handle(-.187,-.185,.049,false);handle(.004,-.185,.049,false);
      poly([[-.481,.20],[.482,.20],[.482,.343],[-.481,.343]],'#293a41');
      line([[-.235,.276],[.23,.276]],'#94a2a6',.6);
      line([[-.463,-.228],[.454,-.228]],bright,.50);
      // Roof rails and the square rear quarter distinguish the long SUV from the pickup.
      line([[-.417,-.759],[.075,-.759]],'#26363d',1.1);
      line([[-.398,-.76],[-.398,-.711]],'#26363d',.7);
      line([[.053,-.76],[.053,-.712]],'#26363d',.7);
      poly([[.422,-.238],[.497,-.121],[.497,-.019],[.422,-.129]],'#22353d');
      line([[.432,-.205],[.432,-.14],[.481,-.064],[.481,-.129]],'#e9f4e9',.8);
      line([[.432,-.174],[.481,-.097]],'#e9f4e9',.7);
      poly([[.454,.025],[.503,.025],[.504,.20],[.454,.178]],'#22323a');
      lamp([[-.499,.011],[-.476,.011],[-.476,.141],[-.499,.141]],'#af393d');
      line([[-.491,.035],[-.491,.118]],'#f07670',.6);
      line([[.277,-.266],[.463,-.231]],bright,.55);
    }
    else if (style === 6) {
      // Morning: a compact rounded five-door hatch, high rear lamp and a sloping bonnet.
      glass([[-.400,-.337],[-.321,-.658],[-.305,-.666],[-.288,-.331]]);
      glass([[-.274,-.698],[-.05,-.747],[-.013,-.738],[-.013,-.311],[-.263,-.325]]);
      glass([[.018,-.737],[.078,-.696],[.239,-.306],[.017,-.31]]);
      line([[-.005,-.771],[-.008,-.292]],'#26363b',1.0);
      line([[-.218,-.302],[-.261,-.059],[-.198,.269],[-.021,.269],[-.013,-.292]],seam,.45);
      line([[-.021,.269],[.254,.269],[.267,-.268]],seam,.45);
      handle(-.176,-.187,.059);handle(.027,-.196,.059);
      line([[-.286,.191],[-.15,.247],[.244,.237]],bright,.55);
      line([[-.404,-.248],[.239,-.22]],bright,.35);
      poly([[.393,-.18],[.483,-.036],[.477,.075],[.433,.03]],'#273a42');
      line([[.402,-.162],[.473,-.058],[.471,.036]],'#e7f8f0',.7);
      lamp([[-.495,-.234],[-.437,-.265],[-.447,-.043],[-.496,.026]],'#a03644');
      line([[-.485,-.194],[-.479,-.034]],'#f28578',.55);
      poly([[.451,.163],[.502,.16],[.496,.258],[.456,.247]],'#29383e');
      poly([[-.44,.219],[-.38,.258],[-.39,.30],[-.465,.263]],'#2d3c43');
      line([[.29,-.235],[.442,-.15]],bright,.6);
    } else if (style === 7) {
      // K5: flowing fastback glass, a chrome roof arc and angular Star Map lamps.
      glass([[-.358,-.319],[-.24,-.593],[-.199,-.636],[-.176,-.318]]);
      glass([[-.171,-.673],[-.105,-.736],[-.039,-.738],[-.023,-.305],[-.151,-.305]]);
      glass([[-.011,-.74],[.048,-.712],[.105,-.631],[.21,-.312],[.007,-.305]]);
      line([[-.025,-.755],[-.01,-.296]],'#213039',.95);
      line([[-.363,-.323],[-.25,-.613],[-.115,-.78],[.006,-.775],[.108,-.66],[.222,-.294]],'#c0cecf',.68);
      line([[-.186,-.277],[-.224,.249],[-.023,.258],[-.014,-.276]],seam,.42);
      line([[-.023,.258],[.219,.258],[.23,-.262]],seam,.42);
      handle(-.137,-.18,.047);handle(.023,-.185,.051);
      line([[-.414,-.155],[-.202,-.183],[.241,-.193],[.433,-.183]],bright,.47);
      poly([[-.21,.138],[.21,.107],[.23,.25],[-.231,.25]],blend(base,0,.09));
      line([[-.207,.247],[.219,.247]],'#b2c3c4',.65);
      poly([[.421,-.238],[.492,-.092],[.488,.012],[.457,-.036],[.448,-.118]],'#233740');
      line([[.427,-.202],[.473,-.119],[.46,-.042],[.485,-.005]],'#ecfff2',.7);
      lamp([[-.499,-.174],[-.436,-.208],[-.431,-.148],[-.477,-.116],[-.447,.026],[-.47,.04]],'#b64243');
      line([[-.486,-.163],[-.447,-.182],[-.471,-.12],[-.453,.01]],'#f99181',.5);
      line([[-.497,.197],[-.449,.22]],'#adbfbe',.85);
      line([[.437,.172],[.49,.12]],'#1f313a',1.05);
    } else if (style === 8) {
      // Current Grandeur facelift: a formal three-box cabin, quarter-light and flush trim.
      glass([[-.286,-.342],[-.212,-.632],[-.18,-.663],[-.182,-.342]]);
      glass([[-.153,-.691],[-.1,-.724],[-.023,-.737],[-.023,-.326],[-.149,-.326]]);
      glass([[.009,-.739],[.068,-.727],[.125,-.626],[.21,-.324],[.008,-.324]]);
      line([[-.3,-.336],[-.222,-.645],[-.112,-.765],[.067,-.765],[.142,-.647],[.224,-.307]],'#c5d3d2',.6);
      line([[-.168,-.692],[-.168,-.322]],'#1e3038',.95);
      line([[-.009,-.75],[-.009,-.302]],'#1f3038',1.0);
      line([[-.169,-.293],[-.19,.258],[-.007,.275],[-.001,-.291]],seam,.4);
      line([[-.007,.275],[.218,.269],[.232,-.278]],seam,.4);
      handle(-.132,-.177,.052);handle(.03,-.178,.052);
      line([[-.455,-.181],[-.219,-.203],[.235,-.213],[.454,-.192]],bright,.55);
      poly([[-.202,.163],[.196,.164],[.223,.266],[-.214,.266]],blend(base,255,.10));
      line([[-.218,.286],[.227,.286]],'#c4d1cd',.78);
      // Thin horizon lamp above the low hidden headlamp array, rather than tall old lamps.
      lamp([[.427,-.233],[.494,-.104],[.493,-.079],[.427,-.207]],'#ebf8ec');
      poly([[.445,-.061],[.501,.012],[.501,.15],[.444,.083]],'#25363d');
      for(let i=0;i<4;i++)line([[.452+i*.011,-.036+i*.015],[.459+i*.011,-.025+i*.015]],'#eef9f0',.45);
      lamp([[-.499,-.17],[-.435,-.187],[-.435,-.15],[-.499,-.124]],'#c0504d');
      line([[-.492,-.158],[-.439,-.177]],'#ef9890',.4);
      line([[-.488,.167],[-.442,.19]],'#bac8c5',.6);
      line([[.203,-.159],[.257,-.159]],'#b4c8c8',.55);
    } else if (style === 9) {
      // Carnival: a long family MPV, sliding-door rail and the bright fin-shaped C-pillar.
      poly([[-.478,-.529],[-.404,-.74],[.027,-.749],[.255,-.285],[-.472,-.268]],'#20343d');
      glass([[-.451,-.5],[-.394,-.679],[-.267,-.7],[-.281,-.316],[-.453,-.313]]);
      glass([[-.241,-.702],[-.034,-.708],[-.034,-.3],[-.244,-.3]]);
      glass([[-.004,-.708],[.061,-.648],[.217,-.303],[-.004,-.3]]);
      poly([[-.279,-.72],[-.243,-.72],[-.219,-.278],[-.297,-.278]],'#b8c6c6');
      for(let i=0;i<5;i++)line([[-.271+i*.006,-.635],[-.247+i*.006,-.322]],'#778e94',.27);
      line([[-.256,-.275],[-.275,.278],[-.027,.278],[-.023,-.28]],seam,.47);
      line([[-.023,.278],[.227,.277],[.25,-.268]],seam,.43);
      handle(-.079,-.18,.046);handle(.006,-.18,.05);
      line([[-.48,-.116],[-.292,-.115]],'#1a2d36',.8);
      line([[-.477,-.104],[-.292,-.104]],'#8eaaad',.3);
      line([[-.476,-.224],[.427,-.223]],bright,.42);
      poly([[-.261,.203],[.235,.203],[.245,.315],[-.264,.315]],blend(base,0,.22));
      line([[-.249,.283],[.226,.283]],'#c1cfcd',.95);
      poly([[.428,-.253],[.493,-.132],[.493,.069],[.464,.04],[.458,-.128]],'#233640');
      line([[.435,-.22],[.479,-.133],[.48,.043]],'#ecfff2',.8);
      lamp([[-.498,-.281],[-.455,-.306],[-.455,-.263],[-.482,-.244],[-.482,-.01],[-.499,-.004]],'#c04648');
      line([[-.49,-.257],[-.49,-.035]],'#f59080',.5);
      line([[-.409,-.758],[.006,-.765]],'#778e94',.72);
      poly([[.459,.16],[.503,.173],[.493,.272],[.451,.247]],'#263a42');
    } else if (style === 10) {
      // G80: a long bonnet, sweeping parabolic shoulder and the signature twin light bars.
      glass([[-.356,-.348],[-.254,-.564],[-.194,-.638],[-.172,-.338]]);
      glass([[-.17,-.674],[-.084,-.744],[-.014,-.749],[-.01,-.324],[-.147,-.324]]);
      glass([[.017,-.747],[.078,-.711],[.122,-.644],[.217,-.317],[.017,-.324]]);
      line([[-.366,-.333],[-.255,-.586],[-.1,-.786],[.02,-.785],[.118,-.665],[.232,-.305]],'#bdcece',.67);
      line([[-.002,-.767],[.004,-.305]],'#273942',.95);
      line([[-.17,-.292],[-.211,.259],[-.014,.271],[-.004,-.29]],seam,.41);
      line([[-.014,.271],[.231,.26],[.243,-.281]],seam,.41);
      handle(-.132,-.162,.051);handle(.03,-.17,.052);
      line([[-.462,-.092],[-.304,-.155],[-.091,-.202],[.192,-.226],[.434,-.17]],bright,.58);
      line([[-.221,.261],[.217,.218]],'#b5c8c8',.74);
      poly([[-.218,.176],[.215,.139],[.228,.215],[-.221,.255]],blend(base,255,.13));
      for(const y of [-.172,-.04]){
        lamp([[.415,y],[.485,y+.10],[.488,y+.137],[.416,y+.038]],'#e9f8ee');
        lamp([[-.497,y+.035],[-.433,y+.018],[-.428,y+.053],[-.497,y+.078]],'#c55150');
      }
      // Fender repeat of the two-line lighting motif, behind the front wheel.
      line([[.181,-.17],[.267,-.17]],'#c0d0cf',.7);
      line([[.187,-.074],[.266,-.074]],'#b5c9c9',.6);
      poly([[.458,.153],[.502,.112],[.5,.221],[.458,.247]],'#273a43');
      line([[-.484,.198],[-.433,.228]],'#c2d0cb',.8);
    } else if (style === 11) {
      // Torres: compact rugged SUV, thick angled C-pillar and stepped protective cladding.
      poly([[-.475,-.357],[-.354,-.73],[.103,-.724],[.253,-.31],[-.47,-.293]],'#21353e');
      glass([[-.440,-.362],[-.352,-.671],[-.307,-.676],[-.323,-.32]]);
      glass([[-.271,-.684],[-.049,-.682],[-.049,-.308],[-.266,-.311]]);
      glass([[-.015,-.682],[.076,-.675],[.213,-.32],[-.015,-.309]]);
      poly([[-.325,-.735],[-.272,-.739],[-.235,-.28],[-.308,-.285]],blend(base,255,.25));
      line([[-.299,-.656],[-.279,-.36]],'#c0cdca',.7);
      line([[-.027,-.73],[-.027,-.292]],'#23373e',1.15);
      line([[-.249,-.282],[-.265,.217],[-.204,.29],[-.028,.29],[-.027,-.281]],seam,.49);
      line([[-.028,.29],[.234,.28],[.25,-.278]],seam,.49);
      handle(-.193,-.194,.052,false);handle(.009,-.193,.053,false);
      poly([[-.493,.11],[-.399,.103],[-.259,.227],[.237,.227],[.397,.099],[.5,.114],[.5,.347],[-.5,.347]],'#2a3c43');
      line([[-.229,.278],[.232,.278]],'#b2c1bf',.66);
      line([[-.459,-.253],[.433,-.252]],bright,.5);
      line([[-.329,-.748],[.069,-.748]],'#263940',1.1);
      line([[-.31,-.743],[-.31,-.691]],'#43555a',.75);
      line([[.051,-.744],[.051,-.695]],'#43555a',.75);
      lamp([[.426,-.271],[.492,-.139],[.49,-.064],[.426,-.203]],'#dcece5');
      for(let i=0;i<3;i++)line([[.435+i*.016,-.232+i*.027],[.444+i*.016,-.215+i*.027]],'#fbfff4',.65);
      poly([[.463,.008],[.503,.008],[.504,.167],[.462,.151]],'#20333c');
      lamp([[-.499,-.237],[-.481,-.237],[-.481,.062],[-.5,.085]],'#ad3e43');
      line([[-.49,-.204],[-.49,.021]],'#f68f7f',.7);
      line([[.293,-.287],[.444,-.255]],bright,.62);
    }
    ctx.restore();
    // Fine contour and the high point of each metal fender catch the sky light.
    trace(ctx,d.outline);ctx.strokeStyle=blend(base,0,.58);ctx.lineWidth=.5;ctx.stroke();
    for (const wheel of wheels) {
      const a=wheel.axle;
      ctx.beginPath();
      if(rugged){const r=wheel.r;ctx.moveTo(a.x-r*1.1,a.y+r*.05);ctx.lineTo(a.x-r*1.1,a.y-r*.55);ctx.lineTo(a.x-r*.59,a.y-r*1.12);ctx.lineTo(a.x+r*.57,a.y-r*1.12);ctx.lineTo(a.x+r*1.1,a.y-r*.54);ctx.lineTo(a.x+r*1.1,a.y+r*.05);}
      else ctx.arc(a.x,a.y,wheel.r+.82,Math.PI+0.05,TAU-.05);
      ctx.strokeStyle=rugged||metallic?'#263238':blend(base,0,.4);ctx.lineWidth=rugged?1.10:.55;ctx.stroke();
      if(!rugged&&!metallic){ctx.beginPath();ctx.arc(a.x,a.y,wheel.r+1.55,Math.PI+.14,TAU-.14);ctx.strokeStyle=bright;ctx.lineWidth=.35;ctx.stroke();}
    }
    // Mirror and its stalk remain a small, functional detail.
    const mirrorX = [ .237, .192, .286, .178, .19, .17, .211, .186, .183, .183, .19, .188 ][style];
    line([[mirrorX,-.285],[mirrorX+.027,-.256]],'#24323a',.65);
    poly([[mirrorX+.018,-.32],[mirrorX+.062,-.313],[mirrorX+.067,-.251],[mirrorX+.023,-.251]],metallic?'#293740':blend(base,0,.18),'#1c2c34',.35);
    for (const wheel of wheels) drawWheel(ctx,wheel,style);
    if (engineering) {
      ctx.save();ctx.setLineDash([1.8,1.4]);ctx.lineWidth=.65;ctx.strokeStyle='#ce8738';
      for(const wheel of wheels) if(wheel.driven){ctx.beginPath();ctx.arc(wheel.p.x,wheel.p.y,wheel.r+2.3,0,TAU);ctx.stroke();}
      ctx.setLineDash([]);const unit=d.powerUnit;ctx.fillStyle='#e4b254aa';ctx.strokeStyle='#624819';
      ctx.fillRect(unit.x-unit.width/2,unit.y-unit.height/2,unit.width,unit.height);ctx.strokeRect(unit.x-unit.width/2,unit.y-unit.height/2,unit.width,unit.height);
      const com=d.centerOfMass;ctx.beginPath();ctx.arc(com.x,com.y,2,0,TAU);ctx.fillStyle='#fff7ca';ctx.fill();ctx.strokeStyle='#39433d';ctx.stroke();
      ctx.beginPath();ctx.moveTo(com.x-3.5,com.y);ctx.lineTo(com.x+3.5,com.y);ctx.moveTo(com.x,com.y-3.5);ctx.lineTo(com.x,com.y+3.5);ctx.stroke();ctx.restore();
    }
    ctx.restore();
  }
  function drawWheel(ctx,wheel,style) {
    const {p,r,angle}=wheel, rugged=style===3||style===5||style===11;
    ctx.save();ctx.translate(p.x,p.y);
    const rubber=ctx.createLinearGradient(-r,-r,r,r);rubber.addColorStop(0,'#41484c');rubber.addColorStop(.36,'#1a2025');rubber.addColorStop(1,'#0e141a');
    ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fillStyle=rubber;ctx.fill();ctx.strokeStyle='#11181e';ctx.lineWidth=.5;ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,r*.88,0,TAU);ctx.strokeStyle='#4d555a';ctx.lineWidth=.26;ctx.stroke();
    ctx.save();ctx.rotate(angle);
    ctx.strokeStyle='#60676b';ctx.lineWidth=.26;
    for(let i=0;i<40;i++){const a=i*TAU/40;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.957,Math.sin(a)*r*.957);ctx.lineTo(Math.cos(a+.020)*r*.993,Math.sin(a+.020)*r*.993);ctx.stroke();}
    const rr=r*[.68,.77,.72,.73,.78,.77,.73,.76,.76,.73,.77,.73][style];
    const rim=ctx.createLinearGradient(-rr,-rr,rr,rr);rim.addColorStop(0,'#edf0ef');rim.addColorStop(.35,'#aebbc1');rim.addColorStop(.6,'#596976');rim.addColorStop(1,'#d8dedd');
    ctx.beginPath();ctx.arc(0,0,rr,0,TAU);ctx.fillStyle=rim;ctx.fill();ctx.strokeStyle='#080f17';ctx.lineWidth=.4;ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,rr*.88,0,TAU);ctx.fillStyle='#202d37';ctx.fill();
    ctx.beginPath();ctx.arc(0,0,rr*.66,0,TAU);ctx.fillStyle='#5b6770';ctx.fill();ctx.strokeStyle='#a2abad';ctx.lineWidth=.2;ctx.stroke();
    const count=[8,5,6,5,5,12,4,5,10,4,5,5][style];
    for(let i=0;i<count;i++){
      ctx.save();ctx.rotate(i*TAU/count);
      if(style===4){
        // Ioniq 5's graphic aero wheel uses angular, swept silver edges.
        ctx.beginPath();ctx.moveTo(-rr*.08,-rr*.16);ctx.lineTo(-rr*.33,-rr*.88);ctx.lineTo(rr*.16,-rr*.84);ctx.lineTo(rr*.32,-rr*.52);ctx.lineTo(rr*.13,-rr*.16);ctx.closePath();
        ctx.fillStyle='#293841';ctx.fill();ctx.strokeStyle='#c3cecf';ctx.lineWidth=.42;ctx.stroke();
        ctx.beginPath();ctx.moveTo(-rr*.30,-rr*.85);ctx.lineTo(-rr*.01,-rr*.31);ctx.strokeStyle='#ecf1ee';ctx.lineWidth=.35;ctx.stroke();
      }else if(style===3||style===6||style===9){
        ctx.beginPath();ctx.moveTo(-rr*.12,-rr*.14);ctx.lineTo(-rr*.23,-rr*.89);ctx.lineTo(rr*.25,-rr*.81);ctx.lineTo(rr*.11,-rr*.10);ctx.closePath();
        ctx.fillStyle=rim;ctx.fill();ctx.beginPath();ctx.moveTo(-rr*.02,-rr*.34);ctx.lineTo(-rr*.035,-rr*.72);ctx.strokeStyle='#354751';ctx.lineWidth=rr*.075;ctx.stroke();
      }else{
        const split=[1,5,7,8,10,11].includes(style), branches=split?[-1,1]:[0];
        for(const branch of branches){
          const top=branch*(style===5||style===8?.082:.14)*rr;
          ctx.beginPath();ctx.moveTo(branch*rr*.03-rr*.045,-rr*.14);ctx.lineTo(top-rr*.046,-rr*.90);ctx.lineTo(top+rr*.052,-rr*.90);ctx.lineTo(branch*rr*.04+rr*.06,-rr*.13);ctx.closePath();
          ctx.fillStyle=rim;ctx.fill();ctx.strokeStyle='#d9e0df';ctx.lineWidth=.13;ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.beginPath();ctx.arc(0,0,rr*.22,0,TAU);ctx.fillStyle='#617681';ctx.fill();ctx.strokeStyle='#d6dddd';ctx.lineWidth=.3;ctx.stroke();
    for(let i=0;i<5;i++){const a=i*TAU/5;ctx.beginPath();ctx.arc(Math.cos(a)*rr*.12,Math.sin(a)*rr*.12,Math.max(.15,r*.018),0,TAU);ctx.fillStyle='#d5dedf';ctx.fill();}
    ctx.restore();ctx.restore();
  }
  function drawThumbnail(ctx,vehicle,options={}) {
    const width=options.width||ctx.canvas.width||200,height=options.height||ctx.canvas.height||96;
    const d=vehicle.design,g=vehicle.genome;
    const points=[...d.outline,{x:d.rearAxle.x-g.rearRadius,y:d.rearAxle.y-g.rearRadius},{x:d.rearAxle.x+g.rearRadius,y:d.rearAxle.y+g.rearRadius},{x:d.frontAxle.x-g.frontRadius,y:d.frontAxle.y-g.frontRadius},{x:d.frontAxle.x+g.frontRadius,y:d.frontAxle.y+g.frontRadius}];
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const scale=Math.min((width-22)/(maxX-minX),(height-20)/(maxY-minY));
    ctx.clearRect(0,0,width,height);ctx.save();
    ctx.translate(width/2-(minX+maxX)/2*scale,height/2-(minY+maxY)/2*scale-2);ctx.scale(scale,scale);
    ctx.beginPath();ctx.ellipse((minX+maxX)/2,maxY+1,(maxX-minX)*.44,1.6,0,0,TAU);ctx.fillStyle='#26353e16';ctx.fill();
    drawVehicle(ctx,vehicle,{live:false,engineering:options.engineering===true});ctx.restore();
  }
  root.VehicleRenderer={drawVehicle,drawThumbnail};
})(typeof window!=='undefined'?window:globalThis);
