/* Porter II super-cab geometry authored from Hyundai's official dimension
 * drawing and the unmodified M575 exterior photograph. Units are metres.
 * 1,240 / 2,640 / 1,275 mm overhang / wheelbase / overhang; cargo compartment
 * 2,860 x 1,630 x 355 mm. This is an authored mesh, not manufacturer CAD.
 */
(function(root){
 'use strict';
 function append(c){
  if(c.id!=='porter2')return;
  const {faces,face,P,L,W,H,paint,tint}=c;
  faces.length=0;
  const sx=L/5.155,sy=W/1.74,sz=H/1.970;
  const at=(x,y,z)=>P(x*sx,y*sy,z*sz),dark='#22282b',silver='#a5afb1',glass='#1b2931';
  function emit(points,col,mat='paint',part='porter-cab'){
   face(points.map(p=>at(...p)),col,null,.4,mat);faces[faces.length-1].part=part;
  }
  function quad(a,b,d,e,col,mat='paint',part){emit([a,b,d,e],col,mat,part);}
  function box(x0,x1,y0,y1,z0,z1,col,mat='paint',part='porter-frame'){
   const a=[x0,y0,z0],b=[x1,y0,z0],d=[x1,y1,z0],e=[x0,y1,z0],A=[x0,y0,z1],B=[x1,y0,z1],D=[x1,y1,z1],E=[x0,y1,z1];
   quad(a,b,B,A,col,mat,part);quad(b,d,D,B,col,mat,part);quad(d,e,E,D,col,mat,part);quad(e,a,A,E,col,mat,part);quad(A,B,D,E,col,mat,part);quad(e,d,b,a,col,mat,part);
  }
  function tube(a,b,r,col=dark,mat='rubber',part='porter-trim',segments=10){
   let u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],len=Math.hypot(...u);u=u.map(v=>v/len);let t=Math.abs(u[2])<.8?[0,0,1]:[0,1,0],v=[u[1]*t[2]-u[2]*t[1],u[2]*t[0]-u[0]*t[2],u[0]*t[1]-u[1]*t[0]],vl=Math.hypot(...v);v=v.map(x=>x/vl);const w=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
   const p=(q,j)=>q.map((x,k)=>x+r*(Math.cos(j/segments*Math.PI*2)*v[k]+Math.sin(j/segments*Math.PI*2)*w[k]));
   for(let j=0;j<segments;j++)quad(p(a,j),p(a,j+1),p(b,j+1),p(b,j),col,mat,part);
  }
  function ribbon(path,width,col=dark,mat='rubber',part='porter-shutline'){
   for(let i=1;i<path.length;i++)tube(path[i-1],path[i],width/2,col,mat,part,6);
  }
  function interp(stations,x,col=1){let i=0;while(i<stations.length-2&&stations[i+1][0]<x)i++;const a=stations[i],b=stations[i+1],t=Math.max(0,Math.min(1,(x-a[0])/(b[0]-a[0]))),before=stations[Math.max(0,i-1)],after=stations[Math.min(stations.length-1,i+2)],m0=(b[col]-before[col])/(b[0]-before[0]),m1=(after[col]-a[col])/(after[0]-a[0]),v=(2*t*t*t-3*t*t+1)*a[col]+(t*t*t-2*t*t+t)*(b[0]-a[0])*m0+(-2*t*t*t+3*t*t)*b[col]+(t*t*t-t*t)*(b[0]-a[0])*m1;return Math.max(Math.min(a[col],b[col]),Math.min(Math.max(a[col],b[col]),v));}
  // The cabin is a continuous height-section loft measured against Hyundai's
  // front and side dimension photographs. The front corners turn into the
  // door skin; a planar face attached to a rectangular box cannot do this.
  const axleF=1.3375,axleR=-1.3025,rF=.327,rR=.2813;
  const section=[
   [.315,2.455,.445,.795],[.38,2.505,.430,.824],[.53,2.555,.425,.842],
   [.70,2.520,.425,.850],[.77,2.470,.425,.855],[.94,2.450,.425,.852],
   [1.10,2.405,.430,.846],[1.20,2.350,.435,.839],[1.28,2.275,.440,.830],
   [1.40,2.145,.445,.817],[1.55,1.965,.450,.800],[1.70,1.785,.460,.783],
   [1.82,1.620,.475,.770],[1.90,1.475,.495,.754],[1.935,1.380,.535,.740]
  ];
  const frontX=z=>interp(section,z,1),rearX=z=>interp(section,z,2),halfW=z=>interp(section,z,3);
  const corner=z=>.135+.065*Math.exp(-Math.pow((z-1.10)/.46,2));
  const frontPoint=(u,z,off=0)=>[frontX(z)-corner(z)*Math.pow(Math.abs(u),3.5)+off,u*halfW(z),z];
  const sidePoint=(x,z,side,off=0)=>{
   const lo=rearX(z),hi=frontX(z)-corner(z),t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));
   const doorSwell=.034*Math.sin(Math.PI*t)*Math.exp(-Math.pow((z-.94)/.34,2));
   const pressed=.012*Math.sin(Math.PI*t)*Math.exp(-Math.pow((z-1.17)/.045,2));
   const fender=.040*Math.exp(-Math.pow((Math.hypot(x-axleF,z-rF)-.405)/.08,2));
   return[x,side*(halfW(z)+doorSwell-pressed+fender+off),z];
  };
  function closePath(poly,steps=5){
   const out=[];
   for(let i=0;i<poly.length;i++){
    const a=poly[(i+poly.length-1)%poly.length],b=poly[i],d=poly[(i+1)%poly.length];
    const q=[b[0]+(a[0]-b[0])*.10,b[1]+(a[1]-b[1])*.10],r=[b[0]+(d[0]-b[0])*.10,b[1]+(d[1]-b[1])*.10];
    for(let j=0;j<=steps;j++){const t=j/steps;out.push([(1-t)*(1-t)*q[0]+2*t*(1-t)*b[0]+t*t*r[0],(1-t)*(1-t)*q[1]+2*t*(1-t)*b[1]+t*t*r[1]]);}
   }return out;
  }
  function mappedPanel(poly,map,col,mat,part,outline=0){
   const path=closePath(poly),center=path.reduce((a,p)=>[a[0]+p[0]/path.length,a[1]+p[1]/path.length],[0,0]);
   for(let i=0;i<path.length;i++)emit([map(...center),map(...path[i]),map(...path[(i+1)%path.length])],col,mat,part);
   if(outline)ribbon([...path,path[0]].map(p=>map(...p)),outline,dark,'rubber',part+'-seal');
  }
  const zRows=[...new Set([...section.map(p=>p[0]),...Array.from({length:72},(_,i)=>.315+(1.935-.315)*i/71)])].sort((a,b)=>a-b);
  for(let i=1;i<zRows.length;i++){
   const z=zRows[i-1],Z=zRows[i];
   for(let j=0;j<64;j++){
    const u=-1+j/32,v=u+1/32;
    quad(frontPoint(u,z),frontPoint(v,z),frontPoint(v,Z),frontPoint(u,Z),paint,'paint','porter-front-cab');
   }
   for(const side of[-1,1])for(let j=0;j<84;j++){
    const t=j/84,T=(j+1)/84,xa=rearX(z)+(frontX(z)-corner(z)-rearX(z))*t,xb=rearX(z)+(frontX(z)-corner(z)-rearX(z))*T;
    const Xa=rearX(Z)+(frontX(Z)-corner(Z)-rearX(Z))*t,Xb=rearX(Z)+(frontX(Z)-corner(Z)-rearX(Z))*T;
    const midX=(xa+xb+Xa+Xb)/4,midZ=(z+Z)/2;
    if(Math.hypot(midX-axleF,midZ-rF)<rF+.044)continue;
    const points=[sidePoint(xa,z,side),sidePoint(xb,z,side),sidePoint(Xb,Z,side),sidePoint(Xa,Z,side)];
    if(side>0)points.reverse();emit(points,paint,'paint','porter-cab-side');
   }
   for(let j=0;j<40;j++){
    const u=-1+j/20,v=u+.05,back=(a,b)=>[rearX(b)+.035*Math.pow(Math.abs(a),4),a*halfW(b),b];
    quad(back(v,z),back(u,z),back(u,Z),back(v,Z),paint,'paint','porter-rear-bulkhead');
   }
  }
  // A gently domed roof closes the loft; the roof edge is rounded in plan.
  const roof=(t,u)=>[.535+(1.380-.535)*t-.135*t*Math.pow(Math.abs(u),3.5)+.035*(1-t)*Math.pow(Math.abs(u),4),u*.740,1.935+.035*Math.sin(Math.PI*t)*(1-Math.pow(u,4))];
  for(let i=0;i<32;i++)for(let j=0;j<40;j++)quad(roof(i/32,-1+j/20),roof((i+1)/32,-1+j/20),roof((i+1)/32,-1+(j+1)/20),roof(i/32,-1+(j+1)/20),paint,'paint','porter-roof');
  // The windscreen is curved both horizontally and vertically and has the
  // rounded trapezoid outline seen in the front drawing, not a flat quad.
  const windLower=1.285,windUpper=1.885;
  const windU=z=>.925-.075*Math.pow((z-1.39)/.51,2);
  for(let i=0;i<30;i++)for(let j=0;j<48;j++){
   const z=windLower+(windUpper-windLower)*i/30,Z=windLower+(windUpper-windLower)*(i+1)/30,u=-1+j/24,v=u+1/24;
   quad(frontPoint(u*windU(z),z,.008),frontPoint(v*windU(z),z,.008),frontPoint(v*windU(Z),Z,.008),frontPoint(u*windU(Z),Z,.008),glass,'glass','porter-windscreen');
  }
  for(const side of[-1,1])ribbon(Array.from({length:40},(_,i)=>{const z=windLower+(windUpper-windLower)*i/39;return frontPoint(side*windU(z),z,.012);}),.016,'#1b2326','rubber','porter-windscreen-seal');
  for(const z of[windLower,windUpper])ribbon(Array.from({length:41},(_,j)=>frontPoint((-1+j/20)*windU(z),z,.012)),.018,'#1b2326','rubber','porter-windscreen-seal');
  // Main door panes and curved super-cab quarter panes, traced from the side.
  const mainGlass=[[.875,1.285],[.865,1.83],[.940,1.880],[1.30,1.878],[1.44,1.82],[1.64,1.665],[1.88,1.445],[2.055,1.275],[1.82,1.255]];
  const quarterGlass=[[.505,1.370],[.510,1.810],[.560,1.860],[.725,1.860],[.765,1.79],[.765,1.400],[.660,1.330]];
  for(const side of[-1,1]){
   mappedPanel(mainGlass,(x,z)=>sidePoint(x,z,side,.010),glass,'glass','porter-side-glass',.015);
   mappedPanel(quarterGlass,(x,z)=>sidePoint(x,z,side,.010),glass,'glass','porter-quarter-glass',.015);
   const door=[[.835,1.885],[.826,1.23],[.80,.92],[.69,.77],[.59,.67],[.535,.535],[.535,.37],[.86,.365],[1.00,.54]];
   ribbon(door.map(([x,z])=>sidePoint(x,z,side,.008)),.006,tint(paint,-.46),'rubber','porter-door-seam');
   ribbon([[.83,1.18],[1.1,1.17],[1.7,1.18],[2.18,1.20]].map(([x,z])=>sidePoint(x,z,side,.009)),.012,tint(paint,-.25),'paint','porter-door-press');
   mappedPanel([[.79,1.10],[.755,1.13],[.755,1.205],[.790,1.245],[.835,1.218],[.844,1.14]],(x,z)=>sidePoint(x,z,side,.017),dark,'rubber','porter-door-handle',.006);
   // The real fender lip has width and rounded section, covering the edge of
   // the wheel opening and blending into the substantial commercial door.
   for(let j=0;j<48;j++)for(let k=0;k<8;k++){
    const p=(a,b)=>{const t=a/48*Math.PI,rr=rF+.047+.026*Math.sin(b/8*Math.PI);return sidePoint(axleF+Math.cos(t)*rr,rF+Math.sin(t)*rr,side,.020*Math.sin(b/8*Math.PI));};
    quad(p(j,k),p(j+1,k),p(j+1,k+1),p(j,k+1),paint,'paint','porter-fender-lip');
   }
   box(.45,.93,side*.80-.03,side*.80+.03,.285,.365,dark,'rubber','porter-cab-step');
   for(let j=0;j<5;j++)box(.49+j*.083,.54+j*.083,side*.805-.04,side*.805+.04,.340,.368,'#394247','rubber','porter-step-tread');
   for(let j=0;j<4;j++)ribbon([[.50+j*.031,.45],[.485+j*.031,.56]].map(([x,z])=>sidePoint(x,z,side,.010)),.010,'#42494c','rubber','porter-cab-vent');
   // Short arm and tall teardrop mirror with inset glass and indicator strip.
   tube([1.94,side*.82,1.31],[1.90,side*.975,1.35],.022,dark);
   const mx=1.915,my=side*.98,mz=1.42;
   for(let i=0;i<28;i++)for(let j=0;j<16;j++){
    const p=(a,b)=>{const u=a/28*Math.PI*2,v=-Math.PI/2+b/16*Math.PI,sp=(t,p)=>Math.sign(t)*Math.pow(Math.abs(t),p);return[mx+sp(Math.cos(u),.55)*Math.pow(Math.cos(v),.5)*.075,my+sp(Math.sin(u),.55)*Math.pow(Math.cos(v),.5)*.063,mz+sp(Math.sin(v),.55)*.145];};
    quad(p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1),paint,'paint','porter-mirror-housing');
   }
   emit(Array.from({length:32},(_,j)=>[mx-.073,my+Math.cos(j/16*Math.PI)*.052,mz+Math.sin(j/16*Math.PI)*.125]),'#789098','glass','porter-mirror-glass');
   ribbon([[mx+.053,my-side*.025,mz-.08],[mx+.063,my+side*.027,mz-.075]],.015,'#d8e5e2','light','porter-mirror-indicator');
  }
  mappedPanel([[-.67,1.40],[.67,1.40],[.67,1.78],[-.67,1.78]],(u,z)=>[rearX(z)-.009,u*halfW(z),z],glass,'glass','porter-rear-glass',.014);
  for(const side of[-1,1]){
   const a=frontPoint(side*.12,1.30,.025),b=frontPoint(side*.72,1.325,.025);
   tube(a,b,.009,'#1c2225','rubber','porter-wipers');tube(frontPoint(side*.09,1.267,.018),frontPoint(side*.32,1.32,.025),.012,'#242b2f','rubber','porter-wipers');
  }
  // Pressed service cover bows outward centrally. Lamp outlines curve around
  // it and taper inward at their lower ends, matching the clear-type lamps.
  const nose=(u,z,off=0)=>frontPoint(u,z,off);
  const nosePanel=(poly,col,mat='paint',off=.010,part='porter-front-detail')=>mappedPanel(poly,(u,z)=>nose(u,z,off),col,mat,part);
  const service=[[-.66,.705],[.66,.705],[.75,.965],[.70,1.065],[-.70,1.065],[-.75,.965]];
  nosePanel(service,paint,'paint',.018,'porter-service-cover');ribbon([...closePath(service),closePath(service)[0]].map(p=>nose(...p,.024)),.007,tint(paint,-.35),'rubber','porter-service-seam');
  for(const side of[-1,1]){
   const lamp=[[.61,.715],[.965,.715],[.958,1.075],[.895,1.122],[.78,1.102],[.713,1.025]].map(([u,z])=>[u*side,z]);
   nosePanel(lamp,'#131d20','rubber',.024,'porter-lamp-surround');
   const lens=lamp.map(([u,z])=>[side*.80+(u-side*.80)*.925,.91+(z-.91)*.945]);nosePanel(lens,'#b6c2c4','chrome',.030,'porter-headlamp');
   for(const [z,hh,w]of[[.787,.045,.25],[.925,.070,.235],[1.061,.035,.175]]){
    const center=.80*side;
    nosePanel([[center-side*w/2,z-hh],[center+side*w/2,z-hh],[center+side*w/2,z+hh],[center-side*w/2,z+hh]],'#455860','glass',.037,'porter-reflector');
    for(let j=0;j<8;j++)ribbon([[center-side*w*.43+side*w*.86*j/7,z-hh*.8],[center-side*w*.43+side*w*.86*j/7,z+hh*.8]].map(p=>nose(...p,.040)),.004,'#dce6e6','chrome','porter-reflector-flute');
   }
   nosePanel([[side*.78,.741],[side*.92,.741],[side*.92,.805],[side*.78,.805]],'#b18f70','light',.041,'porter-indicator');
   const fog=[[side*.64,.408],[side*.92,.408],[side*.94,.590],[side*.71,.575]];nosePanel(fog,'#1e292d','rubber',.032,'porter-fog-surround');
   nosePanel(fog.map(([u,z])=>[side*.80+(u-side*.80)*.70,.49+(z-.49)*.62]),'#b6c8cb','light',.039,'porter-fog-lamp');
  }
  nosePanel([[-.47,.345],[.47,.345],[.59,.602],[-.59,.602]],'#151c20','rubber',.025,'porter-lower-grille');
  for(const z of[.395,.445,.495,.545])ribbon([[-.44,z],[.44,z]].map(p=>nose(...p,.035)),.015,'#3c464b','rubber','porter-grille-slat');
  nosePanel([[-.34,.57],[.34,.57],[.34,.685],[-.34,.685]],'#d7ded9','paint',.059,'porter-license');
  for(const side of[-1,1])ribbon([[side*.48,.365],[side*.59,.61],[side*.90,.65]].map(p=>nose(...p,.055)),.048,tint(paint,.06),'paint','porter-bumper-guard');
  const logo=Array.from({length:49},(_,j)=>nose(Math.cos(j/24*Math.PI)*.106,.885+Math.sin(j/24*Math.PI)*.043,.049));ribbon(logo,.010,silver,'chrome','porter-hyundai-logo');ribbon([nose(-.05,.855,.052),nose(.05,.915,.052)],.014,silver,'chrome','porter-hyundai-logo');
  // Open cargo bed: official inner dimensions and a full exposed ladder frame.
  const bedBack=-2.54,bedFront=.36,floor=.78,wall=1.135;
  box(bedBack,bedFront,-.815,.815,floor-.045,floor,'#53616a','rubber','porter-bed-floor');
  for(const s of[-1,1]){
   box(bedBack,bedFront,s*.835-.018,s*.835+.018,floor,wall,paint,'paint','porter-bed-side');
   for(const z of[.805,.945,1.105])box(bedBack+.02,bedFront-.02,s*.857-.007,s*.857+.007,z-.012,z+.012,tint(paint,-.12),'paint','porter-bed-rib');
   ribbon([[bedBack,s*.84,wall],[bedFront,s*.84,wall]],.025,tint(paint,.15),'paint','porter-bed-rail');
   for(const x of[bedBack+.07,-1.06,bedFront-.09]){tube([x,s*.862,.81],[x,s*.862,1.12],.015,silver,'chrome','porter-bed-latch');box(x-.035,x+.035,s*.87-.012,s*.87+.012,.77,.83,dark,'rubber');}
   box(-2.47,1.49,s*.43-.042,s*.43+.042,.39,.575,dark,'rubber','porter-chassis');
   box(-.47,.14,s*.62-.09,s*.62+.09,.37,.65,'#252c2e','rubber','porter-fuel-tool-tank');
   // Commercial rear wheel splash shields, separate from the painted bed.
   for(let j=0;j<24;j++){const a=j/24*Math.PI,b=(j+1)/24*Math.PI;quad([axleR+Math.cos(a)*.345,s*.54,rR+Math.sin(a)*.345],[axleR+Math.cos(b)*.345,s*.54,rR+Math.sin(b)*.345],[axleR+Math.cos(b)*.345,s*.87,rR+Math.sin(b)*.345],[axleR+Math.cos(a)*.345,s*.87,rR+Math.sin(a)*.345],dark,'rubber','porter-rear-mudguard');}
   box(axleR-.34,axleR-.31,s*.70-.17,s*.70+.17,.15,.48,'#1c2224','rubber','porter-mudflap');
   tube([.38,s*.765,.80],[.38,s*.765,1.94],.025,paint,'paint','porter-headboard');
  }
  tube([.38,-.765,1.94],[.38,.765,1.94],.025,paint,'paint','porter-headboard');tube([.38,-.765,1.77],[.38,.765,1.77],.018,paint,'paint','porter-headboard');
  box(bedBack,bedBack+.035,-.835,.835,floor,wall,paint,'paint','porter-tailgate');box(bedFront-.035,bedFront,-.835,.835,floor,wall,paint,'paint','porter-headboard-panel');
  for(let j=-8;j<=8;j++)box(bedBack+.04,bedFront-.04,j*.093-.010,j*.093+.010,floor,floor+.008,'#607079','rubber','porter-bed-corrugation');
  for(const x of[-2.35,-1.35,-.28,.29])box(x-.035,x+.035,-.77,.77,.57,.635,dark,'rubber','porter-crossmember');
  tube([axleR,-.71,rR],[axleR,.71,rR],.058,'#22282b','rubber','porter-rear-axle',16);
  tube([axleR+.03,0,rR+.025],[1.05,0,.37],.037,'#30383b','rubber','porter-driveshaft',12);
  for(let i=0;i<24;i++)for(let j=0;j<12;j++){
   const p=(a,b)=>{const u=a/24*Math.PI*2,v=-Math.PI/2+b/12*Math.PI;return[axleR+Math.cos(u)*Math.cos(v)*.145,Math.sin(u)*Math.cos(v)*.18,rR+Math.sin(v)*.13];};
   quad(p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1),'#293033','rubber','porter-differential');
  }
  for(const side of[-1,1])for(let k=0;k<3;k++)for(let j=0;j<16;j++){
   const a=-.44+j*.055,b=a+.055,z=t=>.36+k*.014+.07*Math.pow(t/.44,2);
   quad([axleR+a,side*.45-.035,z(a)],[axleR+b,side*.45-.035,z(b)],[axleR+b,side*.45+.035,z(b)],[axleR+a,side*.45+.035,z(a)],'#3a4245','rubber','porter-leaf-spring');
  }
  for(const s of[-1,1]){box(-2.55,-2.49,s*.64-.16,s*.64+.16,.56,.72,'#3b2524','rubber','porter-tail-lamp');box(-2.559,-2.551,s*.64-.15,s*.64+.15,.57,.71,'#9e2429','light','porter-tail-lamp');}
  box(-2.55,-2.50,-.25,.25,.57,.69,'#cfd3c8','paint','porter-rear-license');
  // Physically separate front tyres and smaller dual rear tyres.
  function wheel(cx,cy,r,tw,cover=true){
   const ring=[[-tw/2,.91],[-tw*.44,.98],[-tw*.30,1],[tw*.30,1],[tw*.44,.98],[tw/2,.91]];
   const p=(j,k)=>[cx+Math.cos(j/40*Math.PI*2)*r*ring[k][1],cy+ring[k][0],r+Math.sin(j/40*Math.PI*2)*r*ring[k][1]];
   for(let j=0;j<40;j++)for(let k=0;k<5;k++)quad(p(j,k),p(j+1,k),p(j+1,k+1),p(j,k+1),'#1f2528','rubber','wheels');
   for(const side of[-1,1]){const y=cy+side*(tw/2+.002),circle=radius=>Array.from({length:40},(_,j)=>[cx+Math.cos(j/40*Math.PI*2)*radius,y,r+Math.sin(j/40*Math.PI*2)*radius]);emit(circle(r*.91),'#181e21','rubber','wheels');emit(circle(r*.72),silver,'chrome','wheels');emit(circle(r*.61),'#5c666b','rubber','wheels');
    for(let j=0;j<6;j++){const a=j/6*Math.PI*2,pt=(angle,rr)=>[cx+Math.cos(angle)*r*rr,y+side*.005,r+Math.sin(angle)*r*rr];quad(pt(a-.14,.20),pt(a+.14,.20),pt(a+.20,.68),pt(a-.20,.68),'#c0c8c9','chrome','wheels');}
    emit(circle(r*.20),'#b1babb','chrome','wheels');
   }
  }
  for(const s of[-1,1]){wheel(axleF,s*.7425,rF,.195);wheel(axleR,s*.588,rR,.145);wheel(axleR,s*.747,rR,.145);}
 }
 root.HyundaiRefined=Object.freeze({append});
})(typeof window!=='undefined'?window:globalThis);
