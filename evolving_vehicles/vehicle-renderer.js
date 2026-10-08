/* Side-profile vehicle artwork. Geometry follows the physical chassis frame and axles.
 * Drawing is presentation-only; no random values or physical state are changed. */
(function (root) {
  'use strict';
  const STYLE_IDS = ['buggy', 'coupe', 'van', 'pickup', 'racer', 'rover'];
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
    const rugged = style === 0 || style === 5, metallic = style === 3;
    const base = metallic ? '#a3afb5' : vehicle.color;
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
    line([[-.44,.32],[.44,.32]], '#172027', 1.4);
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
      // Upright short-wheelbase utility: separate hardtop, flat hood and exposed hinges.
      poly([[-.51,-.82],[.13,-.82],[.225,-.28],[-.51,-.28]], '#353c40');
      poly([[-.49,-.74],[.095,-.74],[.205,-.30],[-.49,-.30]], '#42494b');
      glass([[-.438,-.66],[-.18,-.66],[-.18,-.31],[-.443,-.31]]);
      glass([[-.133,-.66],[.069,-.66],[.163,-.31],[-.133,-.31]]);
      line([[-.162,-.73],[-.162,.28]],seam,.65);
      line([[.185,-.26],[.195,.28],[-.16,.28]],seam,.60);
      handle(-.103,-.13,.059);
      for (const y of [-.13,.15]) poly([[.161,y],[.191,y],[.191,y+.05],[.161,y+.05]],bright,seam,.25);
      poly([[.238,-.245],[.452,-.215],[.478,-.16],[.236,-.18]],blend(base,255,.35),seam,.35);
      line([[.243,-.125],[.452,-.105]],bright,.40);
      poly([[.21,-.14],[.245,-.14],[.245,-.095],[.21,-.095]],'#202b30');
      lamp([[.464,-.09],[.497,-.07],[.497,.045],[.464,.025]],'#e8e3cd');
      lamp([[-.497,-.05],[-.478,-.05],[-.478,.11],[-.497,.11]],'#b6413e');
      poly([[-.52,.19],[-.43,.19],[-.43,.29],[-.52,.29]],'#263139');
      poly([[.435,.18],[.52,.18],[.52,.28],[.435,.28]],'#273138');
      line([[-.16,.28],[.19,.28]],'#a2a8a7',.75);
    } else if (style === 1) {
      // Rear-engine fastback: continuous roof arc, teardrop glazing and rounded fenders.
      glass([[-.314,-.445],[-.237,-.626],[-.148,-.711],[-.079,-.728],[-.087,-.322],[-.29,-.322]]);
      glass([[-.054,-.73],[.019,-.688],[.102,-.56],[.205,-.317],[-.053,-.317]]);
      line([[-.065,-.733],[-.066,-.31]],'#242b2e',1.15);
      line([[-.06,-.275],[-.07,.21],[.205,.21],[.23,-.25]],seam,.4);
      handle(-.025,-.17,.047);
      line([[.21,-.267],[.377,-.205],[.465,-.15]],bright,.6);
      line([[-.46,-.18],[-.365,-.294]],bright,.7);
      for(let i=0;i<6;i++) line([[-.441+i*.014,-.218-i*.016],[-.423+i*.014,-.168-i*.017]],seam,.43);
      lamp([[.42,-.19],[.472,-.16],[.488,-.077],[.45,-.10]],'#e8eee9');
      lamp([[-.495,-.065],[-.458,-.08],[-.453,-.028],[-.497,-.016]],'#bc363d');
      line([[-.492,.15],[-.411,.145]],'#19232d',1.0);
      line([[.423,.14],[.494,.17]],'#1d2a32',1.05);
      line([[-.21,.265],[.207,.265]],bright,.4);
    } else if (style === 2) {
      // Forward-control classic bus: pale roof, five windows and a restrained chrome belt.
      poly([[-.52,-.9],[.52,-.9],[.52,-.14],[-.52,-.14]],'#e7e6da');
      line([[-.48,-.72],[.35,-.73]],'#fffef0',.75);
      for (const x of [-.43,-.23,-.03]) glass([[x,-.61],[x+.159,-.61],[x+.159,-.25],[x,-.25]]);
      glass([[.185,-.614],[.306,-.614],[.389,-.49],[.43,-.25],[.185,-.25]]);
      line([[.15,-.69],[.15,.29]],'#676f70',.55);
      line([[-.054,-.19],[-.054,.27],[.142,.27]],seam,.4);
      line([[.168,-.16],[.442,-.14],[.45,.28],[.168,.28]],seam,.45);
      line([[-.495,-.15],[.492,-.15]],'#f4f4e8',.8);
      line([[-.495,-.125],[.492,-.125]],'#75817e',.3);
      handle(.185,-.046,.047);handle(-.028,-.039,.040);
      for(let i=0;i<5;i++) line([[-.474+i*.025,.01],[-.462+i*.025,.01]],'#405b5b',.5);
      lamp([[.472,-.02],[.499,-.006],[.499,.085],[.472,.075]],'#ecead5');
      lamp([[-.499,.015],[-.482,.015],[-.482,.13],[-.499,.13]],'#b84235');
      poly([[-.516,.235],[-.431,.235],[-.431,.29],[-.516,.29]],'#d4d8d2','#798486',.35);
      poly([[.443,.233],[.516,.233],[.516,.29],[.443,.29]],'#d4d8d2','#798486',.35);
    } else if (style === 3) {
      // Folded stainless pickup: a single roof peak, dark continuous glass, long bed.
      poly([[-.5,-.23],[-.29,-.44],[-.07,-.81],[.4,-.13],[-.14,-.13]],'#bec8cc');
      poly([[-.5,-.20],[-.28,-.398],[-.18,-.205],[-.16,.02],[-.5,.06]],'#7b8b92');
      glass([[-.238,-.395],[-.069,-.737],[.30,-.20],[-.187,-.20]]);
      line([[.054,-.554],[.054,-.203]],'#1c2931',.85);
      line([[-.178,-.17],[-.192,.28],[.048,.28],[.048,-.17]],'#5d6f79',.46);
      line([[.067,-.17],[.067,.28],[.305,.28],[.31,-.17]],'#5d6f79',.46);
      handle(-.155,-.081,.041,false);handle(.096,-.081,.044,false);
      poly([[-.5,.07],[.5,.07],[.5,.11],[-.5,.11]],'#e0e4e2');
      line([[-.485,.285],[.475,.285]],'#1c2b32',1.05);
      lamp([[.417,-.103],[.501,-.066],[.501,-.034],[.417,-.07]],'#f7f4e4');
      lamp([[-.501,-.19],[-.484,-.191],[-.484,-.087],[-.501,-.087]],'#c84537');
      line([[.429,.196],[.495,.2]],'#1c292f',1.2);
    } else if (style === 4) {
      // Low mid-engine wedge: angular glass, deep side intake and five-hole alloy wheels.
      glass([[-.229,-.31],[-.161,-.569],[.02,-.582],[.185,-.226],[-.208,-.226]]);
      line([[-.143,-.52],[-.116,-.23]],'#242f33',.8);
      line([[-.177,-.211],[.183,-.211],[.22,.19],[-.134,.19],[-.177,-.211]],seam,.5);
      poly([[-.31,-.047],[-.132,-.047],[-.185,.173],[-.386,.173]],'#15242c',bright,.35);
      poly([[-.274,-.017],[-.173,-.017],[-.211,.126],[-.334,.126]],'#334752');
      line([[-.4,.23],[.473,.23]],'#111e26',1.4);
      handle(.053,-.124,.047);
      for(let i=0;i<6;i++) line([[-.467+i*.027,-.205],[-.443+i*.027,-.088]],'#23313b',.65);
      poly([[.295,-.038],[.386,.054],[.388,.102],[.304,.033]],blend(base,255,.28),seam,.35);
      lamp([[.442,.12],[.498,.17],[.498,.205],[.442,.159]],'#e7ebdc');
      lamp([[-.499,-.061],[-.472,-.061],[-.472,.036],[-.499,.036]],'#b43c38');
      line([[.247,-.081],[.459,.122]],bright,.7);
    } else {
      // Long utility wagon: white roof cap, alpine lights and clear upright door seams.
      poly([[-.52,-.83],[.14,-.83],[.173,-.62],[-.52,-.62]],'#e2e2d6');
      for(const x of [-.405,-.225]) poly([[x,-.714],[x+.128,-.714],[x+.128,-.653],[x,-.653]],'#344b56','#adbcb8',.25);
      glass([[-.436,-.531],[-.197,-.531],[-.197,-.254],[-.436,-.254]]);
      glass([[-.153,-.531],[.092,-.531],[.161,-.254],[-.153,-.254]]);
      line([[-.177,-.60],[-.177,.283]],seam,.65);
      line([[.188,-.214],[.20,.28],[-.174,.28]],seam,.55);
      handle(-.126,-.119,.05);
      for(const y of [-.16,.14])poly([[.167,y],[.195,y],[.195,y+.045],[.167,y+.045]],blend(base,255,.16),seam,.3);
      poly([[.251,-.245],[.46,-.19],[.477,-.13],[.251,-.178]],blend(base,255,.32),seam,.35);
      for(let i=0;i<4;i++)line([[.277+i*.020,-.19],[.277+i*.020,-.134]],seam,.4);
      line([[-.466,-.19],[.462,-.19]],bright,.55);
      lamp([[.465,-.065],[.499,-.055],[.499,.044],[.465,.04]],'#e9e6d2');
      lamp([[-.498,-.008],[-.478,-.008],[-.478,.099],[-.498,.099]],'#b53c3b');
      poly([[.44,.19],[.52,.19],[.52,.28],[.44,.28]],'#263339');
      line([[-.15,.294],[.196,.294]],'#b0b6b4',.9);
    }
    ctx.restore();
    // Fine contour and the high point of each metal fender catch the sky light.
    trace(ctx,d.outline);ctx.strokeStyle=blend(base,0,.58);ctx.lineWidth=.5;ctx.stroke();
    for (const wheel of wheels) {
      const a=wheel.axle;
      ctx.beginPath();ctx.arc(a.x,a.y,wheel.r+.82,Math.PI+0.05,TAU-.05);
      ctx.strokeStyle=rugged||metallic?'#263238':blend(base,0,.4);ctx.lineWidth=rugged?1.25:.55;ctx.stroke();
      if(!rugged&&!metallic){ctx.beginPath();ctx.arc(a.x,a.y,wheel.r+1.55,Math.PI+.14,TAU-.14);ctx.strokeStyle=bright;ctx.lineWidth=.35;ctx.stroke();}
    }
    // Mirror and its stalk remain a small, functional detail.
    const mirrorX = style===2?.391:style===3?.215:style===4?.165:style===1?.16:.163;
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
    const {p,r,angle}=wheel, rugged=style===0||style===5;
    ctx.save();ctx.translate(p.x,p.y);
    const rubber=ctx.createLinearGradient(-r,-r,r,r);rubber.addColorStop(0,'#41484c');rubber.addColorStop(.36,'#1a2025');rubber.addColorStop(1,'#0e141a');
    ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fillStyle=rubber;ctx.fill();ctx.strokeStyle='#11181e';ctx.lineWidth=.5;ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,r*.86,0,TAU);ctx.strokeStyle='#4d555a';ctx.lineWidth=.32;ctx.stroke();
    ctx.save();ctx.rotate(angle);
    ctx.strokeStyle='#60676b';ctx.lineWidth=.3;
    for(let i=0;i<(rugged?32:40);i++){const a=i*TAU/(rugged?32:40);ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.945,Math.sin(a)*r*.945);ctx.lineTo(Math.cos(a+.025)*r*.993,Math.sin(a+.025)*r*.993);ctx.stroke();}
    const rr=r*(rugged?.63:style===2?.59:.70);
    const rim=ctx.createLinearGradient(-rr,-rr,rr,rr);rim.addColorStop(0,'#edf0ef');rim.addColorStop(.35,'#aebbc1');rim.addColorStop(.6,'#596976');rim.addColorStop(1,'#d8dedd');
    ctx.beginPath();ctx.arc(0,0,rr,0,TAU);ctx.fillStyle=rim;ctx.fill();ctx.strokeStyle='#080f17';ctx.lineWidth=.5;ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,rr*.82,0,TAU);ctx.fillStyle='#28333e';ctx.fill();
    ctx.beginPath();ctx.arc(0,0,rr*.68,0,TAU);ctx.fillStyle='#677078';ctx.fill();ctx.strokeStyle='#a2abad';ctx.lineWidth=.25;ctx.stroke();
    if(style===2){
      ctx.beginPath();ctx.arc(0,0,rr*.72,0,TAU);ctx.fillStyle='#e8e8dc';ctx.fill();
      const hub=ctx.createRadialGradient(-rr*.15,-rr*.20,0,0,0,rr*.45);hub.addColorStop(0,'#f4f8f5');hub.addColorStop(.6,'#a9b5ba');hub.addColorStop(1,'#3f515e');
      ctx.beginPath();ctx.arc(0,0,rr*.46,0,TAU);ctx.fillStyle=hub;ctx.fill();
    } else if(style===4){
      ctx.beginPath();ctx.arc(0,0,rr*.86,0,TAU);ctx.fillStyle=rim;ctx.fill();
      for(let i=0;i<5;i++){const a=i*TAU/5;ctx.beginPath();ctx.arc(Math.cos(a)*rr*.57,Math.sin(a)*rr*.57,rr*.20,0,TAU);ctx.fillStyle='#182632';ctx.fill();}
    } else {
      const spokes=style===3?6:rugged?5:10;
      for(let i=0;i<spokes;i++){
        const a=i*TAU/spokes;ctx.save();ctx.rotate(a);ctx.beginPath();
        ctx.moveTo(-rr*.1,-rr*.15);ctx.lineTo(-rr*(style===3?.20:.115),-rr*.88);ctx.lineTo(rr*.1,-rr*.86);ctx.lineTo(rr*.13,-rr*.1);ctx.closePath();
        ctx.fillStyle=rim;ctx.fill();ctx.strokeStyle='#d9e0df';ctx.lineWidth=.16;ctx.stroke();ctx.restore();
      }
    }
    ctx.beginPath();ctx.arc(0,0,rr*.24,0,TAU);ctx.fillStyle='#71828b';ctx.fill();ctx.strokeStyle='#d6dddd';ctx.lineWidth=.35;ctx.stroke();
    for(let i=0;i<5;i++){const a=i*TAU/5;ctx.beginPath();ctx.arc(Math.cos(a)*rr*.13,Math.sin(a)*rr*.13,Math.max(.18,r*.022),0,TAU);ctx.fillStyle='#d5dedf';ctx.fill();}
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
