/* Perspective renderer. Display terrain uses a 1.75x elevation gain while
 * source elevations and race physics retain real metres AMSL. Off-road heights and
 * individual tree shapes remain estimates. Vehicle assets carry their sources. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const ELEVATION_EXAGGERATION = 1.75;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MODELS = {
    ray: { width: 1.595, type: 'box', roof: [-.43, .24], cabin: [-.47, .36], lamps: 'vertical', grille: 'small' },
    morning: { width: 1.595, type: 'hatch', roof: [-.24, .16], cabin: [-.40, .33], lamps: 'tiger', grille: 'small' },
    avante: { width: 1.825, type: 'sedan', roof: [-.18, .10], cabin: [-.34, .28], lamps: 'angular', grille: 'wide' },
    k5: { width: 1.860, type: 'sedan', roof: [-.22, .08], cabin: [-.37, .27], lamps: 'zigzag', grille: 'wide' },
    g80: { width: 1.925, type: 'sedan', roof: [-.22, .07], cabin: [-.35, .25], lamps: 'dual', grille: 'shield' },
    grandeur: { width: 1.880, type: 'sedan', roof: [-.22, .07], cabin: [-.35, .27], lamps: 'bar', grille: 'wide' },
    ioniq5: { width: 1.890, type: 'hatch', roof: [-.28, .15], cabin: [-.43, .31], lamps: 'pixels', grille: 'closed' },
    santafe: { width: 1.900, type: 'suv', roof: [-.40, .16], cabin: [-.45, .29], lamps: 'h', grille: 'wide', rails: true },
    torres: { width: 1.890, type: 'suv', roof: [-.37, .14], cabin: [-.44, .28], lamps: 'short', grille: 'slots', rails: true },
    carnival: { width: 1.995, type: 'van', roof: [-.40, .20], cabin: [-.46, .33], lamps: 'vertical', grille: 'wide', rails: true },
    staria: { width: 1.995, type: 'van', roof: [-.43, .32], cabin: [-.47, .44], lamps: 'bar', grille: 'wide' },
    musso_ev: { width: 1.920, type: 'pickup', roof: [-.07, .17], cabin: [-.16, .30], lamps: 'pixels', grille: 'closed', rails: true },
    porter2: { width: 1.740, type: 'truck', roof: [.15, .38], cabin: [.10, .46], lamps: 'vertical', grille: 'small' }
  };
  function tint(hex, amount) {
    let c = String(hex || '#79a7bd').replace('#', '');
    if (c.length === 3) c = c.split('').map(s => s + s).join('');
    if (!/^[0-9a-f]{6}$/i.test(c)) c = '79a7bd';
    const n = parseInt(c, 16), t = amount > 0 ? 255 : 0, a = Math.abs(amount);
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (t - v) * a).toString(16).padStart(2, '0')).join('');
  }
  const point = (x, y, z) => ({ x, y, z });
  function vehicleMesh(id, spec, color) {
    const m = MODELS[id] || MODELS.g80;
    const L = (spec.lengthMm || 4800) / 1000, W = (spec.widthMm || m.width * 1000) / 1000;
    const H = (spec.heightMm || 1500) / 1000, WB = (spec.wheelbaseMm || L * .6 * 1000) / 1000;
    const radius = (spec.frontTireRadiusMm || 335) / 1000;
    const faces = [], paint = color || '#8eb0b4', dark = tint(paint, -.26), light = tint(paint, .23);
    const glass = '#233e48', rubber = '#172126', chrome = '#c6d3d5';
    function face(vertices, fill, stroke, width) { faces.push({ vertices, fill, stroke, width: width || .45 }); }
    function quad(a, b, c, d, fill, stroke) { face([a, b, c, d], fill, stroke); }
    function box(x0, x1, y0, y1, z0, z1, fill, edge) {
      const a = point(x0, y0, z0), b = point(x1, y0, z0), c = point(x1, y1, z0), d = point(x0, y1, z0);
      const A = point(x0, y0, z1), B = point(x1, y0, z1), C = point(x1, y1, z1), D = point(x0, y1, z1);
      quad(a,b,B,A,tint(fill,-.18),edge); quad(b,c,C,B,tint(fill,-.06),edge);
      quad(c,d,D,C,tint(fill,-.30),edge); quad(d,a,A,D,tint(fill,-.16),edge); quad(A,B,C,D,tint(fill,.08),edge);
    }
    // Actual wheelbase positions and radii; visible cylindrical tyres and rims.
    for (const axle of [-1, 1]) for (const side of [-1, 1]) {
      const x = axle * WB / 2 + (m.type === 'truck' ? .26 : 0), y = side * W * .465;
      const r = axle < 0 ? (spec.rearTireRadiusMm || radius * 1000) / 1000 : radius;
      const tw = m.type === 'truck' && axle < 0 ? .30 : .21;
      const ring = [], ring2 = [];
      for (let j = 0; j < 12; j++) {
        const a = TAU * j / 12;
        ring.push(point(x + Math.cos(a) * r, y - tw / 2, r + Math.sin(a) * r));
        ring2.push(point(x + Math.cos(a) * r, y + tw / 2, r + Math.sin(a) * r));
      }
      for (let j = 0; j < 12; j++) quad(ring[j], ring[(j + 1) % 12], ring2[(j + 1) % 12], ring2[j], j > 5 ? '#10191c' : '#293338');
      face(ring, rubber); face(ring2, rubber);
      const outer = y + side * (tw / 2 + .005);
      face(Array.from({ length: 12 }, (_, j) => point(x + Math.cos(TAU * j / 12) * r * .65, outer, r + Math.sin(TAU * j / 12) * r * .65)), '#a7b6bd', '#4c5c64');
      for (let j = 0; j < 5; j++) {
        const a = TAU * j / 5;
        face([point(x,outer+side*.005,r), point(x+Math.cos(a)*r*.56,outer+side*.005,r+Math.sin(a)*r*.56), point(x+Math.cos(a+.27)*r*.56,outer+side*.005,r+Math.sin(a+.27)*r*.56)], '#42535b');
      }
    }
    const truck = m.type === 'truck', pickup = m.type === 'pickup';
    const shoulder = truck ? H * .49 : H * (m.type === 'box' ? .48 : .57);
    const bottom = Math.max(.22, radius * .72);
    const stations = [-.50,-.43,-.27,0,.27,.43,.50];
    const breadth = m.type === 'suv' || m.type === 'van' || truck || pickup ? [.91,1,1,1,1,.98,.91] : [.76,.96,1,1,.98,.89,.73];
    const topHeight = [shoulder*.87,shoulder*.97,shoulder,shoulder,shoulder,shoulder*.92,shoulder*.82];
    for (let i = 0; i < stations.length - 1; i++) {
      const x0=stations[i]*L,x1=stations[i+1]*L,y0=W*.5*breadth[i],y1=W*.5*breadth[i+1];
      for (const side of [-1,1]) quad(point(x0,side*y0,bottom),point(x1,side*y1,bottom),point(x1,side*y1,topHeight[i+1]),point(x0,side*y0,topHeight[i]),side<0?dark:paint,'#26373b');
      quad(point(x0,-y0,topHeight[i]),point(x1,-y1,topHeight[i+1]),point(x1,y1,topHeight[i+1]),point(x0,y0,topHeight[i]),light);
    }
    quad(point(-.5*L,-W*.455,bottom),point(-.5*L,W*.455,bottom),point(-.5*L,W*.455,topHeight[0]),point(-.5*L,-W*.455,topHeight[0]),dark);
    quad(point(.5*L,-W*.455,bottom),point(.5*L,W*.455,bottom),point(.5*L,W*.455,topHeight[6]),point(.5*L,-W*.455,topHeight[6]),paint);
    // Roof / windscreen shape defines sedan, box, hatch, van and cab-over bodies.
    const [c0,c1]=m.cabin.map(v=>v*L),[r0,r1]=m.roof.map(v=>v*L);
    const cw=W*.445,rw=W*(m.type==='sedan'?.34:m.type==='hatch'?.37:.405),rz=H*.985;
    const A=point(c0,-cw,shoulder+.015),B=point(c1,-cw,shoulder+.015),C=point(c1,cw,shoulder+.015),D=point(c0,cw,shoulder+.015);
    const a=point(r0,-rw,rz),b=point(r1,-rw,rz),c=point(r1,rw,rz),d=point(r0,rw,rz);
    quad(B,C,c,b,glass,chrome); quad(D,A,a,d,glass,chrome);
    quad(A,B,b,a,glass,chrome); quad(C,D,d,c,glass,chrome);
    // Rounded roof shoulders distinguish the smooth van from the squared SUV;
    // a cross-section mesh gives the sheet metal volume in an orbiting view.
    const roofRows=[0,.055,.22,.78,.945,1],roofColumns=[-1,-.86,0,.86,1];
    const softRoof=id==='staria'||id==='carnival'||m.type==='sedan';
    const roofVertex=(f,t)=>{
      const end=Math.min(f,1-f),bevel=clamp(end/.055,0,1),side=Math.abs(t);
      return point(r0+(r1-r0)*f,t*rw*(.93+.07*bevel),rz+(1-side)*.028-(1-bevel)*(softRoof?.055:.022)-(side>.86?(side-.86)/.14*(softRoof?.055:.018):0));
    };
    for(let i=0;i<roofRows.length-1;i++)for(let j=0;j<roofColumns.length-1;j++){
      const t=(roofColumns[j]+roofColumns[j+1])/2;
      const panoramic=(m.type==='sedan'||id==='ioniq5')&&i>0&&i<4&&j>0&&j<3;
      quad(roofVertex(roofRows[i],roofColumns[j]),roofVertex(roofRows[i+1],roofColumns[j]),roofVertex(roofRows[i+1],roofColumns[j+1]),roofVertex(roofRows[i],roofColumns[j+1]),panoramic?'#20363e':tint(paint,t<-.8?-.08:t>.8?.10:.23));
    }
    // Reflection strips live on the glass surfaces, not a flat photograph.
    quad(point(c1*.83+r1*.17,-cw*.80,shoulder+(rz-shoulder)*.17),point(c1*.72+r1*.28,-cw*.80,shoulder+(rz-shoulder)*.28),point(c1*.72+r1*.28,cw*.70,shoulder+(rz-shoulder)*.28),point(c1*.83+r1*.17,cw*.70,shoulder+(rz-shoulder)*.17),'#57767c');
    const pillars=m.type==='van'?3:truck?0:1;
    for(const side of [-1,1])for(let j=0;j<=pillars;j++){
      const f0=j/(pillars+1)+.025,f1=(j+1)/(pillars+1)-.025;
      const xb0=c0+(c1-c0)*f0,xb1=c0+(c1-c0)*f1,xt0=r0+(r1-r0)*f0,xt1=r0+(r1-r0)*f1;
      quad(point(xb0,side*(cw+.007),shoulder+.045),point(xb1,side*(cw+.007),shoulder+.045),point(xt1,side*(rw+.007),rz-.045),point(xt0,side*(rw+.007),rz-.045),j%2?'#29434b':'#34515a','#182d35');
      // Narrow diagonal glass reflection; B-pillars stay visible between panes.
      face([point(xb0,side*(cw+.010),shoulder+.05),point(xb0+(xb1-xb0)*.22,side*(cw+.010),shoulder+.05),point(xt0+(xt1-xt0)*.35,side*(rw+.010),rz-.05),point(xt0,side*(rw+.010),rz-.05)],'#4b6770');
    }
    for(let j=1;j<=pillars;j++) {
      const f=j/(pillars+1),xb=c0+(c1-c0)*f,xt=r0+(r1-r0)*f;
      for(const side of [-1,1])quad(point(xb-.045,side*(cw+.005),shoulder),point(xb+.045,side*(cw+.005),shoulder),point(xt+.045,side*(rw+.005),rz-.05),point(xt-.045,side*(rw+.005),rz-.05),'#1c3037');
    }
    if(m.rails) for(const side of [-1,1])box(r0+.08,r1-.06,side*rw-.025,side*rw+.025,rz+.025,rz+.07,'#677b82');
    // Door seams, handles, mirrors and hood crease lines.
    for(const side of [-1,1]) {
      if(!truck) {
        const mid=(c0+c1)*.5;
        face([point(mid,side*W*.501,bottom+.03),point(mid,side*W*.501,shoulder-.05)],null,tint(paint,-.4));
        for(const x of [c0+.14*L,(c0+c1)*.5+.09*L])box(x-.09,x+.05,side*W*.502-.008,side*W*.502+.008,shoulder-.11,shoulder-.075,chrome);
      }
      box(c1-.14,c1+.10,side*(cw+.11)-.09,side*(cw+.11)+.09,shoulder+.14,shoulder+.23,paint,'#253940');
      face([point(c1+.06,side*W*.27,shoulder+.012),point(L*.43,side*W*.31,shoulder*.925+.013)],null,tint(paint,-.25));
    }
    if(truck||pickup) {
      const rear=-L*.475,front=truck?L*.08:-L*.185,bedZ=shoulder+.02,wallZ=truck?H*.48:shoulder+.18;
      box(rear,front,-W*.44,W*.44,bedZ,bedZ+.025,'#374c53');
      for(const side of [-1,1])box(rear,front,side*W*.46-.045,side*W*.46+.045,bedZ,wallZ,paint,'#30474d');
      box(rear,rear+.07,-W*.46,W*.46,bedZ,wallZ,paint);
      for(let i=-3;i<=3;i++)face([point(rear+.08,i*W*.105,bedZ+.03),point(front-.06,i*W*.105,bedZ+.03)],null,'#708087',.7);
      if(truck)for(const x of [rear+.15,(rear+front)*.5,front-.15])for(const side of [-1,1])box(x-.025,x+.025,side*W*.505-.009,side*W*.505+.009,bottom+.08,wallZ-.03,chrome);
    }
    // Front fascia: model-specific shield, closed EV mask, grille bars or slots.
    const fx=L*.501,noseZ=topHeight[6],frontY=W*.37;
    if(m.grille==='shield')face([point(fx,-frontY*.53,noseZ-.03),point(fx,frontY*.53,noseZ-.03),point(fx,frontY*.43,bottom+.16),point(fx,0,bottom+.05),point(fx,-frontY*.43,bottom+.16)],'#1d2a30',chrome);
    else box(fx,fx+.008,-frontY*(m.grille==='small'?.55:.90),frontY*(m.grille==='small'?.55:.90),bottom+.10,noseZ-.10,m.grille==='closed'?dark:'#1c2c32');
    if(m.grille==='slots')for(let i=-3;i<=3;i++)box(fx+.01,fx+.018,i*W*.075-.025,i*W*.075+.025,bottom+.15,noseZ-.13,'#b0bbbd');
    else if(m.grille!=='closed')for(let j=0;j<3;j++)face([point(fx+.02,-frontY*.75,bottom+.17+j*.11),point(fx+.02,frontY*.75,bottom+.17+j*.11)],null,'#6d7b80',.6);
    function lamp(x,y0,y1,z0,z1,fill) { quad(point(x,y0,z0),point(x,y1,z0),point(x,y1,z1),point(x,y0,z1),fill); }
    if(m.lamps==='bar') {
      lamp(fx+.024,-W*.43,W*.43,noseZ-.015,noseZ+.035,'#f3fbeb');
      for(const s of [-1,1])lamp(fx+.025,s*W*.34-.08,s*W*.34+.08,bottom+.22,bottom+.42,'#d6e3df');
    } else for(const side of [-1,1]) {
      const y=side*W*.32;
      if(m.lamps==='dual')for(const dz of [0,.085])lamp(fx+.024,y-W*.12,y+W*.12,noseZ-.11+dz,noseZ-.08+dz,'#f1f7e2');
      else if(m.lamps==='pixels')for(let i=-1;i<=1;i++)lamp(fx+.024,y+i*.105-.04,y+i*.105+.04,noseZ-.13,noseZ-.045,'#f2f8d8');
      else if(m.lamps==='h') {
        lamp(fx+.024,y-.15,y-.105,noseZ-.20,noseZ+.02,'#f3f7df');lamp(fx+.024,y+.105,y+.15,noseZ-.20,noseZ+.02,'#f3f7df');lamp(fx+.025,y-.15,y+.15,noseZ-.105,noseZ-.065,'#f3f7df');
      } else if(m.lamps==='vertical'||m.lamps==='tiger')lamp(fx+.024,y-.055,y+.055,noseZ-.24,noseZ+.01,'#f2f7df');
      else lamp(fx+.024,y-.16,y+.16,noseZ-.07,noseZ+.005,'#f4f8e7');
      // The upper light surface is visible from straight overhead.
      quad(point(fx-.13,y-.15,noseZ+.025),point(fx-.025,y-.15,noseZ+.025),point(fx-.025,y+.15,noseZ+.025),point(fx-.13,y+.15,noseZ+.025),'#f2f7e0');
      const rearX=-L*.501;
      for(let j=0;j<(m.lamps==='dual'?2:1);j++)lamp(rearX,side*W*.33-.13,side*W*.33+.13,topHeight[0]-.13+j*.075,topHeight[0]-.085+j*.075,'#df5953');
      quad(point(-L*.49,side*W*.32-.14,topHeight[0]+.012),point(-L*.40,side*W*.32-.14,topHeight[1]+.012),point(-L*.40,side*W*.32+.14,topHeight[1]+.012),point(-L*.49,side*W*.32+.14,topHeight[0]+.012),'#d75c50');
    }
    if(['grandeur','ioniq5','avante','k5'].includes(id))lamp(-L*.502,-W*.38,W*.38,topHeight[0]-.08,topHeight[0]-.04,'#d4524d');
    return { faces, length:L,width:W,height:H,wheelbase:WB,type:m.type };
  }

  class CircuitRenderer {
    constructor(canvas, options={}) {
      if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('CircuitRenderer requires a canvas.');
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.options=options;
      this.width=900;this.height=565;this.dpr=1;this.mode='overview';this.yaw=-.42;this.pitch=.90;this.zoomLevel=1;
      this.followYaw=0;this.watch=0;this._followState=null;this.markerPositions=[];this.meshCache=new Map();this.pointers=new Map();this.listeners=[];
      this.panOffset={x:0,y:0,z:0};this.interactionMode='orbit';
      this.canvas.style.touchAction='none';this.canvas.style.cursor='grab';
      this._bind();this.resize();
    }
    _listen(type,fn,options) {this.canvas.addEventListener(type,fn,options);this.listeners.push([type,fn,options]);}
    _bind() {
      this._listen('pointerdown',e=>{
        if(e.pointerType==='mouse'&&![0,1,2].includes(e.button))return;
        e.preventDefault();
        if(!this.pointers.size)this.drag={x:e.clientX,y:e.clientY,moved:false,id:e.pointerId,button:e.button,
          operation:e.button===1||e.button===2||e.shiftKey||this.interactionMode==='pan'?'pan':'orbit'};
        this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(this.pointers.size>1&&this.drag)this.drag.moved=true;
        try{this.canvas.setPointerCapture(e.pointerId);}catch(_e){}
        if(e.pointerType==='mouse')this.canvas.focus({preventScroll:true});
        this.canvas.style.cursor='grabbing';
      });
      this._listen('pointermove',e=>{
        if(!this.pointers.has(e.pointerId))return;
        e.preventDefault();
        const previous=this.pointers.get(e.pointerId),oldPoints=[...this.pointers.values()];
        this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        const rect=this.canvas.getBoundingClientRect();
        if(this.pointers.size>1){
          const p=[...this.pointers.values()],oldMid={x:(oldPoints[0].x+oldPoints[1].x)/2-rect.left,y:(oldPoints[0].y+oldPoints[1].y)/2-rect.top},
            mid={x:(p[0].x+p[1].x)/2-rect.left,y:(p[0].y+p[1].y)/2-rect.top},
            oldDistance=Math.hypot(oldPoints[0].x-oldPoints[1].x,oldPoints[0].y-oldPoints[1].y),distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
          this.pan(mid.x-oldMid.x,mid.y-oldMid.y,oldMid);
          if(oldDistance>1&&distance>1)this.zoom(distance/oldDistance,mid);
          if(this.drag)this.drag.moved=true;
          return;
        }
        if(!this.drag)return;
        if(Math.hypot(e.clientX-this.drag.x,e.clientY-this.drag.y)>4)this.drag.moved=true;
        if(this.drag.moved){
          const dx=e.clientX-previous.x,dy=e.clientY-previous.y;
          if(this.drag.operation==='pan'||e.shiftKey)this.pan(dx,dy,{x:previous.x-rect.left,y:previous.y-rect.top});
          else this.orbit(dx,dy);
        }
      });
      const release=e=>{
        if(!this.pointers.has(e.pointerId))return;
        const wasPinch=this.pointers.size>1;this.pointers.delete(e.pointerId);
        if(this.drag&&!this.drag.moved&&!wasPinch&&this.drag.button===0&&e.type==='pointerup'){
          const rect=this.canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
          const distance=p=>Math.min(Math.hypot(p.x-x,p.y-y),Math.hypot(p.anchorX-x,p.anchorY-y));
          const hit=this.markerPositions.filter(p=>!p.hidden&&(Math.hypot(p.x-x,p.y-y)<Math.max(16,p.radius||0)||Math.hypot(p.anchorX-x,p.anchorY-y)<Math.max(12,p.length*.42))).sort((a,b)=>distance(a)-distance(b))[0];
          if(hit&&this.options.onSelect)this.options.onSelect(hit.id);
        }
        try{if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);}catch(_e){}
        if(this.pointers.size){
          const [id,p]=this.pointers.entries().next().value;
          this.drag={id,x:p.x,y:p.y,moved:true,button:0,operation:this.interactionMode};
        }else{this.drag=null;this.canvas.style.cursor=this.interactionMode==='pan'?'move':'grab';}
      };
      this._listen('pointerup',release);this._listen('pointercancel',release);this._listen('lostpointercapture',release);
      this._listen('contextmenu',e=>e.preventDefault());
      this._listen('wheel',e=>{
        e.preventDefault();const rect=this.canvas.getBoundingClientRect(),pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.height:1);
        this.zoom(Math.exp(-clamp(pixels,-120,120)*.0025),{x:e.clientX-rect.left,y:e.clientY-rect.top});
      },{passive:false});
    }
    _changed(){if(this.options.onChange)this.options.onChange(this.getState());}
    resize(){
      const rect=this.canvas.getBoundingClientRect();this.width=Math.max(1,rect.width||900);this.height=Math.max(1,rect.height||565);
      this.dpr=clamp(root.devicePixelRatio||1,1,2);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);
    }
    clearVehicleModels(){this.meshCache.clear();this.surfaceRenderer?.clearGeometry();}
    _displayHeight(z){const datum=this.race?.track.elevationMin||0;return datum+(z-datum)*ELEVATION_EXAGGERATION;}
    _displayPose(p){
      const z=this._displayHeight(p.elevation??p.z??0);
      return {...p,z,elevation:p.elevation==null?null:z,grade:(p.grade||0)*ELEVATION_EXAGGERATION};
    }
    setRace(race,{preserveCamera=false}={}){
      if(preserveCamera&&this.race?.circuit===race.circuit){
        const oldCar=this.race.cars.find(c=>c.id===this.watch)||this.race.cars[0];
        if(this._followState&&oldCar)this._followState.distance-=oldCar.totalDistance??this.race.totalDistance;
        this.race=race;return;
      }
      if(this.race?.cars[0]?.vehicleId!==race.cars[0]?.vehicleId)this.clearVehicleModels();
      this.race=race;
      // Scale only ground elevation. Scenery is rebuilt on this display track,
      // so cars, trees and buildings retain their original physical dimensions.
      this.displayTrack={...race.track,points:race.track.points.map(p=>({...p,z:this._displayHeight(p.z||0)})),
        elevationMin:this._displayHeight(race.track.elevationMin||0),elevationMax:this._displayHeight(race.track.elevationMax||0)};
      this._makeRoad();
      this.pits=root.PitFacilities?.build(this.displayTrack,root.PitFacilityData?.[race.track.id])||null;
      this.environment=root.TrackEnvironment?.build(this.displayTrack,race.track.id,undefined,{excludeTree:(x,y,r)=>this.pits?.contains(x,y,r)})||null;
      this._makeContextGround();this.markerPositions=[];this._lastCamera=null;this._followState=null;this.landmark=null;
    }
    setView(mode){
      if(!['overview','follow','top','eau-rouge','pits'].includes(mode))return;
      if(mode==='eau-rouge'&&this.race?.track.id!=='spa')mode='follow';
      if(mode==='pits'&&!this.pits?.focus)mode='overview';
      this.mode=mode;this.zoomLevel=1;this.panOffset={x:0,y:0,z:0};this._lastCamera=null;this._followState=null;
      if(mode==='top'){this.pitch=Math.PI/2-.008;this.yaw=0;}
      else if(mode==='overview'){this.pitch=.90;this.yaw=-.42;}
      else if(mode==='pits'){this.pitch=.48;this.yaw=this.pits.focus.yaw;}
      else if(mode==='eau-rouge'){
        const projection=this.race.track.projection;
        const xy=(lon,lat)=>({x:((lon-projection.origin[0])*projection.metresPerDegree*Math.cos(projection.latitudeRad)-projection.offset.x)*projection.scale,y:(-(lat-projection.origin[1])*projection.metresPerDegree-projection.offset.y)*projection.scale});
        const nearest=geo=>this.race.pathPoints.reduce((best,p)=>Math.hypot(p.x-geo.x,p.y-geo.y)<Math.hypot(best.x-geo.x,best.y-geo.y)?p:best);
        const low=this._displayPose(nearest(xy(5.970788,50.442385))),high=this._displayPose(nearest(xy(5.972132,50.440815)));
        this.landmark={target:point((low.x+high.x)/2,(low.y+high.y)/2,(low.z+high.z)/2),distance:Math.max(230,Math.hypot(high.x-low.x,high.y-low.y)*1.28),low,high};
        this.pitch=.25;this.yaw=Math.atan2(high.y-low.y,high.x-low.x)+Math.PI/2-.42;
      }else {this.pitch=.24;this.followYaw=0;}
    }
    orbit(dx,dy){
      const delta=dx*.007;
      if(this.mode==='follow')this.followYaw+=delta;else this.yaw+=delta;
      this.pitch=clamp(this.pitch+dy*.005,.18,Math.PI/2-.008);this._changed();
    }
    setInteractionMode(mode){
      if(!['orbit','pan'].includes(mode))return;
      this.interactionMode=mode;if(!this.pointers.size)this.canvas.style.cursor=mode==='pan'?'move':'grab';this._changed();
    }
    _interactionCamera(){
      const car=this.race?.cars.find(c=>c.id===this.watch)||this.race?.cars[0];
      return car?this._camera(car):null;
    }
    // Intersect a screen ray with the horizontal plane through the target.
    // This makes a grabbed road point follow the pointer even after orbiting.
    _groundPoint(x,y,camera){
      const u=(x-camera.cx)/camera.f,v=(y-camera.cy)/camera.f,den=camera.sinPitch+v*camera.cosPitch;
      if(den<.10)return null; // The sky / near-horizon rays have no useful map intersection.
      const right=camera.distance*camera.sinPitch*u/den,forward=camera.distance*v/den;
      return {x:camera.target.x+right*camera.cosYaw-forward*camera.sinYaw,
        y:camera.target.y+right*camera.sinYaw+forward*camera.cosYaw,z:camera.target.z};
    }
    pan(dx,dy,anchor){
      if(!Number.isFinite(dx)||!Number.isFinite(dy)||(!dx&&!dy))return;
      const camera=this._interactionCamera();if(!camera)return;
      const start=anchor||{x:camera.cx,y:camera.cy},a=this._groundPoint(start.x,start.y,camera),b=this._groundPoint(start.x+dx,start.y+dy,camera);
      if(a&&b){this.panOffset.x+=a.x-b.x;this.panOffset.y+=a.y-b.y;}
      else{
        // Above the horizon, use the finite tangent at the target instead.
        const right=-dx*camera.distance/camera.f,forward=-dy*camera.distance/(camera.f*camera.sinPitch);
        this.panOffset.x+=right*camera.cosYaw-forward*camera.sinYaw;
        this.panOffset.y+=right*camera.sinYaw+forward*camera.cosYaw;
      }
      this._changed();
    }
    recenter(){this.panOffset={x:0,y:0,z:0};this._lastCamera=null;this._changed();}
    resetPan(){this.recenter();}
    _followGoal(car){
      const sample=distance=>root.DrivingPose?.sampleCar?.(this.race,car,distance)||root.DrivingPose?.sample(this.race,distance)||this.race.sampleForCar?.(car,distance)||this.race.sample(distance);
      const p=this._displayPose(sample(car.distance)),speed=Math.max(0,Number(car.speed)||0),desired=clamp(8+speed*.25,8,20);
      const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
      // Estimate bend size from chords, not the instantaneous spline curvature.
      // The neighbouring chords also see a tight bend before a wide filter
      // could accidentally average across its return leg.
      const probes=[sample(car.distance-2*desired),sample(car.distance-desired),p,sample(car.distance+desired),sample(car.distance+2*desired)];
      const directions=probes.slice(1).map((q,i)=>Math.atan2(q.y-probes[i].y,q.x-probes[i].x));
      // A smooth norm avoids a kink when a different chord becomes dominant.
      const curvature=Math.pow(directions.slice(1).reduce((sum,angle,i)=>sum+Math.pow(wrap(angle-directions[i]),4),0),.25)/desired;
      const sigma=desired/Math.sqrt(1+(desired*curvature/.55)**2),anticipation=Math.min(4,speed*.1)/Math.sqrt(1+(18*curvature)**2);
      // A Gaussian derivative of positions averages the whole local road
      // direction. Retaining any raw tangent here reintroduces the short
      // straight/turn pulses even when the position curve itself is C2.
      // The window is centred near the car, with at most four metres of lead;
      // it smooths gentle bends without looking far around a hairpin.
      let dx=0,dy=0;
      // Fixed quadrature keeps the direction continuous as the window narrows.
      const samples=24;
      for(let i=1;i<=samples;i++){
        const u=3*i/samples,weight=u*Math.exp(-.5*u*u),offset=u*sigma;
        const a=sample(car.distance+anticipation-offset),b=sample(car.distance+anticipation+offset);
        dx+=(b.x-a.x)*weight;dy+=(b.y-a.y)*weight;
      }
      const tangent=Number.isFinite(p.angle)?p.angle:directions[1];
      // Degenerate loops must never put the chase camera in front of the car.
      const filteredHeading=Math.hypot(dx,dy)>.001&&dx*Math.cos(tangent)+dy*Math.sin(tangent)>0?Math.atan2(dy,dx):tangent;
      const heading=tangent+wrap(filteredHeading-tangent)*(root.DrivingPose?.startBlend?.(car)??1);
      return {id:car.id,x:p.x,y:p.y,z:(p.elevation??p.z??0)+.8,heading,distance:car.distance};
    }
    _followPose(car){
      if(!this._followState||this._followState.id!==car.id){const goal=this._followGoal(car);this._followState={...goal,goalHeading:goal.heading,headingVelocity:0};}
      return this._followState;
    }
    advanceCamera(seconds,{watch=this.watch,snap=false}={}){
      if(this.mode!=='follow'||!this.race)return false;
      const car=this.race.cars.find(c=>c.id===watch)||this.race.cars[0];if(!car)return false;
      const goal=this._followGoal(car);
      if(!this._followState||this._followState.id!==car.id){this._followState={...goal,goalHeading:goal.heading,headingVelocity:0};return true;}
      const previous=this._followState;
      if(snap){
        const angle=Math.atan2(Math.sin(goal.heading-previous.heading),Math.cos(goal.heading-previous.heading));
        const changed=['x','y','z'].some(key=>Math.abs(goal[key]-previous[key])>1e-10)||Math.abs(angle)>1e-10||Math.abs(previous.headingVelocity)>1e-10;
        if(changed)this._followState={...goal,goalHeading:goal.heading,headingVelocity:0};return changed;
      }
      const dt=Number.isFinite(seconds)?clamp(seconds,0,.25):0;if(!dt)return false;
      const pose=this._followState,before={...pose};
      // Follow the shared car anchor exactly: independent XY/height filters
      // make the car slide across the frame and can cut across hairpins.
      pose.x=goal.x;pose.y=goal.y;pose.z=goal.z;
      const travel=Math.abs(goal.distance-pose.distance)/dt,physicalSpeed=Math.max(0,Number(car.speed)||0);
      const playback=physicalSpeed>.5?travel/physicalSpeed:1,omega=9.5*Math.sqrt(clamp(playback,1,16));
      const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
      const moving=physicalSpeed>.5&&travel>1e-8;
      const targetStep=moving?wrap(goal.heading-(pose.goalHeading??pose.heading)):0,targetRate=targetStep/dt;
      const error=wrap(pose.heading-(goal.heading-targetStep))+2*targetRate/omega;
      const velocity=(pose.headingVelocity||0)-targetRate,j=velocity+omega*error,decay=Math.exp(-omega*dt);
      // Exact critically damped spring with a linearly moving angular target.
      // Treating each new target as an instantaneous step creates a visible
      // velocity pulse when frame durations vary, even on a perfect circle.
      pose.heading=pose.heading-error+targetStep+(error+j*dt)*decay;
      pose.headingVelocity=targetRate+(velocity-omega*j*dt)*decay;pose.distance=goal.distance;pose.goalHeading=goal.heading;
      const remaining=Math.atan2(Math.sin(goal.heading-pose.heading),Math.cos(goal.heading-pose.heading));
      if(Math.abs(remaining)<1e-6&&Math.abs(pose.headingVelocity)<1e-5){pose.heading+=remaining;pose.headingVelocity=0;}
      return ['x','y','z','heading','headingVelocity'].some(key=>Math.abs(pose[key]-before[key])>1e-10);
    }
    zoom(factor,anchor){
      if(!Number.isFinite(factor)||factor<=0)return;
      const before=anchor&&this._interactionCamera(),fixed=before&&this._groundPoint(anchor.x,anchor.y,before);
      this.zoomLevel=clamp(this.zoomLevel*factor,.20,this.mode==='follow'?6:120);
      if(fixed){
        const after=this._interactionCamera(),moved=this._groundPoint(anchor.x,anchor.y,after);
        if(moved){this.panOffset.x+=fixed.x-moved.x;this.panOffset.y+=fixed.y-moved.y;}
      }
      this._changed();
    }
    getModelInfo(){
      const car=this.race?.cars.find(c=>c.id===this.watch)||this.race?.cars[0],asset=car&&root.ManufacturerModels?.get(car.vehicleId);
      if(car&&root.ManufacturerModels?.isLoading(car.vehicleId))return {kind:'loading',label:'정밀 3D 외형 불러오는 중…'};
      if(asset&&(this.surfaceRenderer?.available||asset.fallbackPrimitives))return {kind:asset.source.kind,label:asset.source.label+(this.surfaceRenderer?.available?'':' · 저해상도 외형'),triangles:this.surfaceRenderer?.available?asset.triangles:asset.fallbackPrimitives.reduce((n,p)=>n+p.indices.length/3,0),url:asset.source.url,license:asset.source.license,licenseUrl:asset.source.licenseUrl};
      if(car&&root.ManufacturerModels?.requiresAsset(car.vehicleId))return {kind:'unavailable',label:'3D 외형을 불러오지 못했습니다. 페이지를 새로고침해 주세요.'};
      return {kind:'photo-reference',label:'제조사 사진·제원 기반 외형'};
    }
    getState(){const source=this.getModelInfo(),appearance={'manufacturer-mesh':'manufacturer-geometry','dealer-mesh':'dealer-geometry','community-mesh':'community-geometry','photo-reconstruction':'photo-reconstructed-geometry',loading:'loading',unavailable:'unavailable'}[source.kind]||'manufacturer-reference-meshes';return {renderer:'perspective-mesh',surfaceRenderer:this.surfaceRenderer?.available?'webgl-smooth':'canvas2d',terrainRenderer:this.terrainRenderer?.kind||'canvas-painter',terrain:this.terrainGeometry?.stats||null,threeDimensional:true,mode:this.mode,interactionMode:this.interactionMode,pan:{...this.panOffset},yaw:this.mode==='follow'?this.followYaw:this.yaw,pitch:this.pitch,zoom:this.zoomLevel,metresPerUnit:1,elevationExaggeration:ELEVATION_EXAGGERATION,carModels:root.TrackRace?.VEHICLES?.length||Object.keys(MODELS).length,carAppearance:appearance,modelSource:source,markerPositions:this.markerPositions.map(p=>({id:p.id,x:Math.round(p.x),y:Math.round(p.y),labelVisible:!!p.labelVisible}))};}
    destroy(){for(const [type,fn,opts]of this.listeners)this.canvas.removeEventListener(type,fn,opts);this.listeners=[];this.pointers.clear();this.meshCache.clear();this.surfaceRenderer?.dispose();this.terrainRenderer?.dispose();}
    _makeRoad(){
      this.roadFaces=[];this.supports=[];if(!this.race)return;
      const track=this.displayTrack,pts=track.points,n=pts.length,step=n>1300?2:1,edges=[];
      const half=track.width/2,curb=Math.min(1.1,track.width*.065),datum=(track.elevationMin||0)-4;
      for(let i=0;i<n;i+=step){
        const a=pts[(i-1+n)%n],b=pts[(i+1)%n],p=pts[i],l=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/l,ny=(b.x-a.x)/l;
        const at=(d,z=0)=>point(p.x+nx*d,p.y+ny*d,(p.z||0)+z);
        edges.push({left:at(-half),right:at(half),outerLeft:at(-half-curb),outerRight:at(half+curb),p,index:i});
        if(i%Math.max(step,Math.round(120/(track.centerlineSpacing||track.spacing)/step)*step)===0)this.supports.push([point(p.x,p.y,datum),point(p.x,p.y,p.z||0)]);
      }
      for(let i=0;i<edges.length;i++){
        const a=edges[i],b=edges[(i+1)%edges.length],stripe=Math.floor(i*step*(track.centerlineSpacing||track.spacing)/8)%2;
        this.roadFaces.push({vertices:[a.left,b.left,b.right,a.right],fill:'#465250',stroke:'#465250',width:.55,road:true});
        const curbFill=stripe?(track.id==='spa'?'#dec847':'#f0ecdf'):'#ba6759';
        this.roadFaces.push({vertices:[a.outerLeft,b.outerLeft,b.left,a.left],fill:curbFill,road:true});
        this.roadFaces.push({vertices:[a.right,b.right,b.outerRight,a.outerRight],fill:curbFill,road:true});
      }
      this.roadEdges=edges;this.datum=datum;
    }
    _makeContextGround(){
      this.contextGround=[];this.terrainGeometry=null;if(!this.race||!this.environment&&!this.pits)return;
      // User-requested default grass fills unclassified ground. Its height and
      // material are illustrative; photographed land cover is drawn above it.
      const road=this.race.track.bounds,pit=this.pits?.bounds,b={minX:Math.min(road.minX,pit?.minX??road.minX),maxX:Math.max(road.maxX,pit?.maxX??road.maxX),minY:Math.min(road.minY,pit?.minY??road.minY),maxY:Math.max(road.maxY,pit?.maxY??road.maxY)};b.width=b.maxX-b.minX;b.height=b.maxY-b.minY;
      if(root.CircuitTerrain){
        this.terrainGeometry=root.CircuitTerrain.build(this.displayTrack,this.roadEdges,{bounds:b,groundHeight:this.environment?.groundHeight||this.pits.groundHeight});
        this.contextGround=this.terrainGeometry.faces;return;
      }
      const cell=clamp(Math.max(b.width,b.height)/64,24,55),margin=180,ground=this.environment?.groundHeight||this.pits.groundHeight;
      const nx=Math.ceil((b.width+2*margin)/cell),ny=Math.ceil((b.height+2*margin)/cell),vertices=[];
      for(let j=0;j<=ny;j++){const row=[];for(let i=0;i<=nx;i++){const x=b.minX-margin+i*cell,y=b.minY-margin+j*cell;row.push(point(x,y,ground(x,y)-.22));}vertices.push(row);}
      for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
        const a=vertices[j][i],b=vertices[j][i+1],c=vertices[j+1][i+1],d=vertices[j+1][i];
        for(const points of [[a,b,c],[a,c,d]])this.contextGround.push({vertices:points,fill:'#829569',stroke:'#829569',width:.7,center:{x:(a.x+c.x)/2,y:(a.y+c.y)/2}});
      }
    }
    _camera(watch){
      const track=this.displayTrack||this.race.track,b=track.bounds,f=this.mode==='follow'?this.height/(2*Math.tan(29*Math.PI/180)):this.height*1.15;
      let target={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2,z:((track.elevationMin||0)+(track.elevationMax||0))/2};
      let distance=Math.max(b.width*f/(this.width*.67),b.height*f/(this.height*.63),Math.hypot(b.width,b.height)*.70)+(track.elevationMax-track.elevationMin||0)*.7;
      let yaw=this.yaw;
      if(this.mode==='follow'){
        const p=this._followPose(watch);target={x:p.x,y:p.y,z:p.z};
        distance=Math.max(6.6,((watch.spec?.lengthMm||4800)/1000)*1.72,((watch.spec?.widthMm||1850)/1000)*f/Math.max(105,Math.min(190,this.width*.36)));yaw=p.heading+Math.PI/2+this.followYaw;
      }
      if(this.mode==='eau-rouge'&&this.landmark){target={...this.landmark.target};distance=this.landmark.distance;}
      if(this.mode==='pits'&&this.pits?.focus){target={...this.pits.focus.target};distance=this.pits.focus.distance*Math.max(1,this.height/this.width*1.25);}
      target.x+=this.panOffset.x;target.y+=this.panOffset.y;target.z+=this.panOffset.z;
      return this._createCamera(target,distance/this.zoomLevel,yaw,this.pitch,f,this.width/2,this.height*(this.mode==='follow'?.64:.49));
    }
    _createCamera(target,distance,yaw,pitch,f,cx,cy){return {target,distance,yaw,pitch,f,cx,cy,cosYaw:Math.cos(yaw),sinYaw:Math.sin(yaw),cosPitch:Math.cos(pitch),sinPitch:Math.sin(pitch)};}
    _project(p,camera){
      const dx=p.x-camera.target.x,dy=p.y-camera.target.y,dz=p.z-camera.target.z;
      const horizontal=-dx*camera.sinYaw+dy*camera.cosYaw,depth=camera.distance-horizontal*camera.cosPitch-dz*camera.sinPitch;
      if(depth<Math.max(.3,camera.distance*.018))return null;
      return {x:camera.cx+(dx*camera.cosYaw+dy*camera.sinYaw)*camera.f/depth,y:camera.cy+(horizontal*camera.sinPitch-dz*camera.cosPitch)*camera.f/depth,depth,scale:camera.f/depth};
    }
    _queue(face,camera,queue){
      // Asphalt/curbs are top surfaces, not a two-sided ribbon. Their underside
      // is concealed by the conforming earth beneath them, never painted road.
      if(face.road||face.topSurface){
        const [a,b,c]=face.vertices,u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
        let nx=u.y*v.z-u.z*v.y,ny=u.z*v.x-u.x*v.z,nz=u.x*v.y-u.y*v.x;
        if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
        const eye={x:camera.target.x-camera.sinYaw*camera.cosPitch*camera.distance,y:camera.target.y+camera.cosYaw*camera.cosPitch*camera.distance,z:camera.target.z+camera.sinPitch*camera.distance};
        if(nx*(eye.x-a.x)+ny*(eye.y-a.y)+nz*(eye.z-a.z)<=0)return;
      }
      // Clip at the eye plane instead of discarding an entire roadside polygon
      // as one of its corners passes behind the camera.
      const near=Math.max(.3,camera.distance*.018)+.001;
      const depth=v=>camera.distance-(-(v.x-camera.target.x)*camera.sinYaw+(v.y-camera.target.y)*camera.cosYaw)*camera.cosPitch-(v.z-camera.target.z)*camera.sinPitch;
      let vertices=face.vertices,clipped=[];
      for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],da=depth(a),db=depth(b);if(da>=near)clipped.push(a);if((da>=near)!==(db>=near)){const t=(near-da)/(db-da);clipped.push(point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t));}}
      if(clipped.length<3)return;
      const p=clipped.map(v=>this._project(v,camera));if(p.some(v=>!v))return;
      if(p.every(v=>v.x<-20)||p.every(v=>v.x>this.width+20)||p.every(v=>v.y<-20)||p.every(v=>v.y>this.height+20))return;
      queue.push({points:p,depth:p.reduce((s,v)=>s+v.depth,0)/p.length,fill:face.fill,stroke:face.stroke,width:face.width||.5,priority:face.priority||0});
    }
    _paint(queue){
      const ctx=this.ctx;queue.sort((a,b)=>b.depth-a.depth||a.priority-b.priority);
      for(const face of queue){ctx.beginPath();face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(face.points.length>2)ctx.closePath();
        if(face.fill){ctx.fillStyle=face.fill;ctx.fill();}
        if(face.stroke){ctx.strokeStyle=face.stroke;ctx.lineWidth=face.width;ctx.stroke();}
      }
    }
    _paintWorld(queue){
      if(!this.terrainRenderer&&root.TerrainSurfaces)this.terrainRenderer=new root.TerrainSurfaces();
      if(this.terrainRenderer){const layer=this.terrainRenderer.render(queue,this.width,this.height,this.dpr);this.ctx.drawImage(layer,0,0,this.width,this.height);}
      else this._paint(queue);
    }
    _line(vertices,camera,color,width,dashed){
      const ctx=this.ctx;ctx.beginPath();let drawing=false;
      for(const v of vertices){const p=this._project(v,camera);if(!p){drawing=false;continue;}if(!drawing){ctx.moveTo(p.x,p.y);drawing=true;}else ctx.lineTo(p.x,p.y);}
      ctx.strokeStyle=color;ctx.lineWidth=width;if(dashed)ctx.setLineDash(dashed);ctx.stroke();ctx.setLineDash([]);
    }
    _mesh(car){
      const finishes=['#d9dcdb','#526573','#8c979e','#303a46','#776a63','#8a3f43','#6b7770','#b3b0a7'];
      const id=car.vehicleId||car.spec?.id||'g80',spec=car.spec||root.CircuitVehicleSpecs?.[id]||root.VehicleSpecs?.[id]||{},paint=finishes[(car.index??car.id??0)%finishes.length],key=[id,paint,spec.lengthMm,spec.heightMm,spec.widthMm,spec.wheelbaseMm].join('|');
      if(!this.meshCache.has(key))this.meshCache.set(key,root.ManufacturerModels?.create(id,spec,paint)||(root.ManufacturerModels?.requiresAsset(id)?{length:spec.lengthMm/1000,width:spec.widthMm/1000,height:spec.heightMm/1000,faces:[],metadata:{id}}:root.VehicleMeshes?root.VehicleMeshes.create(id,spec,paint):vehicleMesh(id,spec,paint)));return this.meshCache.get(key);
    }
    getPatrolInfo(){return (this.race?.cars||[]).filter(c=>c.vehicleId==='g70').map(car=>{const mesh=this._mesh(car),state=root.G70PatrolLights?.sample(this.race,car,mesh);return {id:car.id,paint:mesh.paint,active:!!state,red:!!state?.red,blue:!!state?.blue};});}
    _drawVehicles(entries,camera){
      // Coincident ghost runs share one body outline. Keep the watched entrant
      // visible without drawing identical geometry eight times at the start.
      const distinct=[];
      for(const entry of [...entries].sort((a,b)=>Number(!!b.selected)-Number(!!a.selected))){
        if(!distinct.some(other=>Math.hypot(other.position.x-entry.position.x,other.position.y-entry.position.y)<.06&&Math.abs((other.position.angle||0)-(entry.position.angle||0))<.01))distinct.push(entry);
      }
      const ghosts=distinct.filter(entry=>!entry.selected),watched=distinct.filter(entry=>entry.selected);
      if(ghosts.length){
        // Composite the whole depth-tested ghost layer once. Per-triangle alpha
        // would make overlapping body panels nearly opaque and reveal interiors.
        if(!this.ghostCanvas)this.ghostCanvas=(this.canvas.ownerDocument||root.document).createElement('canvas');
        const layer=this.ghostCanvas,w=Math.round(this.width*this.dpr),h=Math.round(this.height*this.dpr);
        if(layer.width!==w||layer.height!==h){layer.width=w;layer.height=h;}
        const context=layer.getContext('2d'),main=this.ctx;
        context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,w,h);context.setTransform(this.dpr,0,0,this.dpr,0,0);
        this.ctx=context;try{this._drawVehicleBatch(ghosts,camera);}finally{this.ctx=main;}
        main.save();main.globalAlpha=.32;main.drawImage(layer,0,0,this.width,this.height);main.restore();
      }
      this._drawVehicleBatch(watched,camera);
    }
    _drawVehicleBatch(entries,camera){
      const tiny=[],detailed=[];
      for(const entry of entries){
        const p=entry.position,projected=this._project(point(p.x,p.y,p.elevation||0),camera);
        if(projected&&entry.mesh.length*projected.scale<9)this._carFaces(entry.car,p,camera,tiny,entry.selected);
        else detailed.push(entry);
      }
      this._paint(tiny);entries=detailed.map(entry=>({...entry,effect:root.G70PatrolLights?.create(this.race,entry.car,entry.mesh)}));if(!entries.length)return;
      if(!this.surfaceRenderer&&root.VehicleSurfaces)this.surfaceRenderer=new root.VehicleSurfaces(()=>this._changed());
      const layer=this.surfaceRenderer?.render(entries,camera,this.width,this.height,this.dpr);
      if(layer){
        const shadows=[];
        for(const {mesh,position:p}of entries){const ca=Math.cos(p.angle||0),sa=Math.sin(p.angle||0),v=(x,y)=>point(p.x+x*ca-y*sa,p.y+x*sa+y*ca,(p.elevation||0)+.025);
          for(const [scale,alpha]of [[1.08,.07],[.94,.12]]){
            const vertices=Array.from({length:24},(_,i)=>{const a=i/24*TAU;return v(Math.cos(a)*mesh.length*.51*scale,Math.sin(a)*mesh.width*.62*scale);});
            this._queue({vertices,fill:'rgba(18,29,34,'+alpha+')'},camera,shadows);
          }}
        this._paint(shadows);this.ctx.drawImage(layer,0,0,this.width,this.height);return;
      }
      const queue=[],watched=[];
      for(const {car,position,selected}of entries)this._carFaces(car,position,camera,selected?watched:queue,selected);
      this._paint(queue);this._paint(watched);
    }
    _carFaces(car,position,camera,queue,selected=false){
      const mesh=this._mesh(car),angle=position.angle||0,c=Math.cos(angle),s=Math.sin(angle),grade=Math.atan(position.grade||0),cg=Math.cos(grade),sg=Math.sin(grade);
      const transform=v=>{const x=v.x*cg-v.z*sg;return point(position.x+x*c-v.y*s,position.y+x*s+v.y*c,(position.elevation||0)+v.x*sg+v.z*cg+.05);};
      const shadow=[point(-mesh.length*.5,-mesh.width*.53,.016),point(mesh.length*.5,-mesh.width*.53,.016),point(mesh.length*.5,mesh.width*.53,.016),point(-mesh.length*.5,mesh.width*.53,.016)];
      this._queue({vertices:shadow.map(transform),fill:'rgba(14,30,30,.28)'},camera,queue);
      const apparent=this._project(point(position.x,position.y,position.elevation||0),camera);
      if(apparent&&mesh.length*apparent.scale<9){
        this._queue({vertices:[point(-mesh.length*.5,-mesh.width*.40,.5),point(mesh.length*.45,-mesh.width*.42,.5),point(mesh.length*.5,0,.5),point(mesh.length*.45,mesh.width*.42,.5),point(-mesh.length*.5,mesh.width*.40,.5)].map(transform),fill:car.color||'#aacbb9'},camera,queue);
        return mesh;
      }
      const effect=root.G70PatrolLights?.create(this.race,car,mesh);
      for(const face of effect?[...mesh.faces,...effect.faces]:mesh.faces){
        const vertices=face.vertices.map(transform);let fill=face.fill;
        // Reference meshes include physical trim ribbons. Skip their duplicate
        // stroke-only representation, and seal antialiased polygon seams below.
        if(root.VehicleMeshes&&!fill)continue;
        if(fill&&face.material==='paint'&&vertices.length>=3){
          const [a,b,c]=vertices,u=point(b.x-a.x,b.y-a.y,b.z-a.z),v=point(c.x-a.x,c.y-a.y,c.z-a.z);
          const n=point(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x),len=Math.hypot(n.x,n.y,n.z)||1;
          const shade=.52+.38*Math.max(0,(-.35*n.x-.5*n.y+.85*n.z)/len)+.22*Math.max(0,(.2*n.x+.8*n.y+.5*n.z)/len);
          fill=tint(fill,clamp(shade-1,-.48,.12));
        }
        this._queue({...face,fill,vertices,stroke:face.stroke||(fill?fill:undefined),width:face.stroke?face.width:.6,priority:selected?1:0},camera,queue);
      }
      return mesh;
    }
    _background(camera){
      const ctx=this.ctx,w=this.width,h=this.height;
      ctx.fillStyle='#829569';ctx.fillRect(0,0,w,h);
      // Keep the blue sky above the camera's actual horizon when orbiting.
      const horizon=clamp(camera.cy-camera.f*Math.tan(camera.pitch),0,h);
      if(horizon>0){const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,'#5ea9e8');sky.addColorStop(.55,'#8ac6f0');sky.addColorStop(1,'#d9ecfa');ctx.fillStyle=sky;ctx.fillRect(0,0,w,horizon);}
      if(this.contextGround?.length)return;
      const b=this.race.track.bounds,span=Math.max(b.width,b.height)*1.1,center=camera.target;
      const grid=this.mode==='follow'?10:Math.pow(10,Math.floor(Math.log10(Math.max(b.width,b.height)/7)));
      const range=this.mode==='follow'?Math.min(span,camera.distance*2):span;
      const gridZ=this.mode==='follow'?camera.target.z-this.panOffset.z-2.8:this.datum;
      const x0=Math.floor((center.x-range)/grid)*grid,x1=Math.ceil((center.x+range)/grid)*grid,y0=Math.floor((center.y-range)/grid)*grid,y1=Math.ceil((center.y+range)/grid)*grid;
      for(let x=x0;x<=x1;x+=grid)this._line([point(x,y0,gridZ),point(x,y1,gridZ)],camera,'rgba(103,130,94,.13)',.7);
      for(let y=y0;y<=y1;y+=grid)this._line([point(x0,y,gridZ),point(x1,y,gridZ)],camera,'rgba(103,130,94,.13)',.7);
      if(this.mode!=='follow')for(const support of this.supports)this._line(support,camera,'rgba(100,123,90,.15)',.75);
    }
    _startLine(camera,queue){
      const line=this.displayTrack.points[0],next=this.displayTrack.points[1];
      const angle=Math.atan2(next.y-line.y,next.x-line.x),dx=Math.cos(angle),dy=Math.sin(angle),width=this.race.track.width;
      for(let j=0;j<2;j++)for(let i=0;i<8;i++){
        const a=-width/2+i*width/8,b=a+width/8,x=j*.65;
        const v=(s,l)=>point(line.x+dx*s-dy*l,line.y+dy*s+dx*l,line.z+.06);
        this._queue({vertices:[v(x,a),v(x+.65,a),v(x+.65,b),v(x,b)],fill:(i+j)%2?'#eef3eb':'#263632',topSurface:true},camera,queue);
      }
    }
    _racingGuidanceTriangle(car,distance){
      const pose=s=>root.DrivingPose?.sampleCar?.(this.race,car,s)||root.DrivingPose?.sample(this.race,s)||this.race.sampleForCar?.(car,s)||this.race.sample(s);
      // Both the tip and base follow the same curve as the watched car. The
      // world-space width fits inside the path's existing road-edge allowance.
      const rear=pose(distance-2),tip=pose(distance+2.6),halfWidth=Math.min(.72,this.race.track.width*.08);
      const nx=-Math.sin(rear.angle)*halfWidth,ny=Math.cos(rear.angle)*halfWidth;
      const z=this._displayHeight(rear.elevation??rear.z??0)+.11;
      return [point(tip.x,tip.y,this._displayHeight(tip.elevation??tip.z??0)+.11),point(rear.x+nx,rear.y+ny,z),point(rear.x-nx,rear.y-ny,z)];
    }
    _queueRacingGuidance(car,camera,queue){
      if(!root.RacingGuidance)return;
      const length=car.trackLength||this.race.track.length,count=Math.ceil(length/7.5),step=length/count;
      // Keep fifteen road-fixed arrows ahead of the watched car in every view.
      // Absolute distance preserves the flying path at later lap boundaries;
      // spacing stays uniform as the trailing arrow is replaced at the front.
      const first=Math.ceil((car.distance+5)/step),distances=Array.from({length:15},(_,i)=>(first+i)*step);
      const preview=root.RacingGuidance.displayPreview(this.race,car,distances);
      this.guidanceArrows=preview.map((p,i)=>p?{distance:distances[i],fill:p.fill,forecastAcceleration:p.forecastAcceleration,
        yellowWeight:p.displayYellowWeight,phase:p.displayPhase,transitionBands:p.displayTransitionBands}:null);
      for(let index=0;index<distances.length;index++){
        const distance=distances[index],guidance=preview[index];if(!guidance)continue;
        this._queue({vertices:this._racingGuidanceTriangle(car,distance),fill:guidance.fill,stroke:guidance.fill,width:.45,priority:2,topSurface:true},camera,queue);
      }
    }
    render({watch=this.watch,mode=this.mode,showLine=false}={}){
      this.guidanceArrows=[];
      if(!this.race)return;
      if(mode!==this.mode)this.setView(mode);this.watch=watch;
      const car=this.race.cars.find(c=>c.id===watch)||this.race.cars[0];if(!car)return;
      const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);const camera=this._camera(car);this._lastCamera=camera;
      this._background(camera);const queue=[];
      // The complete ground and road share one depth buffer, including distant
      // return legs. Drawing background grass first exposed roads behind hills.
      for(const face of this.contextGround||[])this._queue(face,camera,queue);
      const scenery=this.environment?.query(camera.target.x,camera.target.y,this.mode==='follow'?Math.max(440,camera.distance*6):Math.max(this.race.track.bounds.width,this.race.track.bounds.height)*2)||[];
      for(const group of scenery)for(const face of group.faces){if(this.mode!=='follow'&&face.kind==='tree-shadow')continue;this._queue({...face,stroke:face.fill,width:1},camera,queue);}
      for(const face of this.roadFaces)this._queue(face,camera,queue);
      const facilities=this.pits?.query(camera.target.x,camera.target.y,this.mode==='follow'?Math.max(440,camera.distance*6):Infinity)||[];
      for(const group of facilities)for(const face of group.faces)this._queue({...face,stroke:face.fill,width:.55},camera,queue);
      this._startLine(camera,queue);
      this.markerPositions=[];
      for(const c of this.race.cars){
        const p=this._displayPose(root.DrivingPose?.sampleCar?.(this.race,c)||root.DrivingPose?.sample(this.race,c.distance)||this.race.sampleForCar?.(c,c.distance)||this.race.sample(c.distance)),projected=this._project(point(p.x,p.y,(p.elevation??p.z)+.7),camera);
        if(!projected)continue;
        const mesh=this._mesh(c);
        if(projected.x>-60&&projected.x<this.width+60&&projected.y>-60&&projected.y<this.height+60)this.markerPositions.push({id:c.id,x:projected.x,y:projected.y,anchorX:projected.x,anchorY:projected.y,color:c.color,length:mesh.length*projected.scale,radius:Math.max(12,mesh.width*projected.scale*.6)});
      }
      if(showLine&&this.mode!=='pits')this._queueRacingGuidance(car,camera,queue);
      this._paintWorld(queue);
      // Cars are redrawn after the trajectory so the line never cuts across a roof.
      const visibleCars=[];
      for(const c of this.race.cars){const p=this._displayPose(root.DrivingPose?.sampleCar?.(this.race,c)||root.DrivingPose?.sample(this.race,c.distance)||this.race.sampleForCar?.(c,c.distance)||this.race.sample(c.distance)),v=this._project(point(p.x,p.y,(p.elevation??p.z)+.7),camera);if(v&&v.x>-120&&v.x<this.width+120&&v.y>-120&&v.y<this.height+120)visibleCars.push({car:c,mesh:this._mesh(c),position:p,selected:c.id===car.id});}
      this._drawVehicles(visibleCars,camera);this._labels(car);
      if(this.mode!=='follow'&&this.mode!=='eau-rouge'&&this.mode!=='pits')this._inset(car);
      this._compass(camera);this._caption();
    }
    _labels(selected){
      const ctx=this.ctx,placed=[];ctx.font='600 10px system-ui,sans-serif';
      const standings=this.race.standings(),rank=standings.findIndex(c=>c.id===selected.id);
      const progress=car=>car.distance/(car.trackLength||this.race.track.length);
      // Use race progress, including completed laps and individual path lengths.
      // Equal launch positions are not an ahead car; an offscreen predecessor
      // must not be replaced by a different, merely visible competitor.
      const preceding=standings[rank-1];
      const ahead=preceding&&(progress(preceding)>progress(selected)+1e-9||
        preceding.finished&&(!selected.finished||preceding.finishTime<selected.finishTime))?preceding:null;
      for(const p of this.markerPositions)p.labelVisible=p.id===selected.id||p.id===ahead?.id;
      const ordered=this.markerPositions.filter(p=>p.labelVisible).sort((a,b)=>(b.id===selected.id)-(a.id===selected.id));
      for(const p of ordered){
        const selectedCar=p.id===selected.id,car=this.race.cars.find(c=>c.id===p.id);
        const label=(car.speed*3.6).toFixed(0)+' km/h',bw=Math.max(48,Math.ceil(ctx.measureText(label).width)+14),bh=20,margin=bw/2+4;
        let x=p.anchorX,y=p.anchorY-Math.max(14,p.length*.55);
        x=clamp(x,margin,this.width-margin);y=clamp(y,29,this.height-75);
        for(let j=0;j<55&&placed.some(q=>Math.abs(q.x-x)<(bw+q.width)/2+5&&Math.abs(q.y-y)<24);j++){
          const radius=24+Math.sqrt(j)*16;
          x=clamp(p.anchorX+Math.cos(j*2.399)*radius,margin,this.width-margin);
          y=clamp(p.anchorY-20+Math.sin(j*2.399)*radius,29,this.height-75);
        }
        placed.push({x,y,width:bw});
        ctx.strokeStyle=selectedCar?'#355b45':'rgba(52,79,56,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.anchorX,p.anchorY);ctx.lineTo(x,y+7);ctx.stroke();
        ctx.fillStyle=selectedCar?'#254d3d':'#f8fbf1';ctx.beginPath();ctx.roundRect(x-bw/2,y-bh/2,bw,bh,5);ctx.fill();
        ctx.strokeStyle=p.color||'#81b57a';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=selectedCar?'#fff':'#294936';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y+.5);
        p.x=x;p.y=y;p.radius=Math.max(18,bw/2);
      }
      ctx.textAlign='left';ctx.textBaseline='alphabetic';
    }
    _inset(car){
      const ctx=this.ctx,w=this.width<450?127:159,h=this.width<450?101:121,x=this.width-w-13,y=13;
      ctx.save();ctx.fillStyle='rgba(250,252,246,.93)';ctx.strokeStyle='rgba(112,138,99,.23)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,w,h,10);ctx.fill();ctx.stroke();ctx.clip();
      ctx.fillStyle='#597052';ctx.font='600 9px system-ui,sans-serif';ctx.textAlign='left';ctx.fillText('관찰 차량 · 3D 외형',x+11,y+17);
      const mesh=this._mesh(car),camera=this._createCamera(point(0,0,mesh.height*.4),mesh.length*2.8,-.69,1.08,w*1.65,x+w*.50,y+h*.55),queue=[];
      this._drawVehicles([{car,mesh,selected:true,position:{x:0,y:0,elevation:0,angle:0,grade:0}}],camera);
      const exteriorKind=this.getModelInfo().kind;
      const exteriorLabel={'manufacturer-mesh':'제조사 3D 모델','dealer-mesh':'딜러 제공 3D 모델','community-mesh':'커뮤니티 3D 모델 · CC BY 4.0','photo-reconstruction':'공식 사진 기반 3D 재구성',loading:'3D 외형 불러오는 중…',unavailable:'3D 외형을 불러오지 못했습니다'}[exteriorKind]||'제조사 사진 · 제원 기반';
      ctx.fillStyle='#73806c';ctx.font='8px system-ui,sans-serif';ctx.fillText(exteriorLabel,x+11,y+h-9);ctx.restore();
    }
    _compass(camera){
      const ctx=this.ctx,x=29,y=37,dx=-Math.sin(camera.yaw),dy=-Math.cos(camera.yaw)*Math.sin(camera.pitch),length=Math.hypot(dx,dy)||1;
      ctx.strokeStyle='#55794b';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(x-dx/length*8,y-dy/length*8);ctx.lineTo(x+dx/length*12,y+dy/length*12);ctx.stroke();
      ctx.fillStyle='#355d43';ctx.font='700 10px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('N',x+dx/length*21,y+dy/length*21+3);ctx.textAlign='left';
    }
    _caption(){
      const ctx=this.ctx;
      // Narrow layouts already show gestures below the canvas; keep the lower HUD clear.
      if(this.width>600){ctx.fillStyle='rgba(245,249,237,.91)';ctx.beginPath();ctx.roundRect(11,this.height-61,310,16,4);ctx.fill();ctx.fillStyle='#5e7554';ctx.font='9px system-ui,sans-serif';
      ctx.fillText(this.width<450?(this.interactionMode==='pan'?'드래그 이동 · 두 손가락 이동/확대':'드래그 회전 · 두 손가락 이동/확대'):(this.interactionMode==='pan'?'드래그 이동 · 휠 확대 · 중앙 버튼으로 복귀':'드래그 회전 · 우클릭/Shift+드래그 이동 · 휠 확대'),18,this.height-(this.width<450?82:50));
      }
      if(this.mode==='eau-rouge'&&this.landmark){ctx.fillStyle='#294936';ctx.font='600 11px system-ui,sans-serif';ctx.fillText('EAU ROUGE → RAIDILLON · 고저차 '+ELEVATION_EXAGGERATION+'배',18,76);}
      if(this.mode==='pits'){ctx.fillStyle='#294936';ctx.font='600 11px system-ui,sans-serif';ctx.fillText('피트·서비스 구역 · 사진 참고 재구성',18,76);}
    }
  }
  CircuitRenderer.MODELS=Object.freeze(MODELS);
  CircuitRenderer.ELEVATION_EXAGGERATION=ELEVATION_EXAGGERATION;
  root.CircuitRenderer=CircuitRenderer;
  if(typeof module!=='undefined'&&module.exports)module.exports=CircuitRenderer;
})(typeof window!=='undefined'?window:globalThis);
