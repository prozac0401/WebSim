/* KGM-specific authored surfaces. Measured proportions and fittings follow the
 * official J100 Torres and O100 Musso EV photographs, not diesel Musso / EVX.
 * This module is a photo-reference model; no manufacturer mesh is claimed. */
(function(root){
 'use strict';
 const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function append(c){
  if(!['torres','musso_ev'].includes(c.id))return;
  const {id,L,W,H,R,Rr,frontAxle,rearAxle,sill,faces,paint,P,face,bodySide,sidePoint,surfacePoint,top,roofWidth,roofZ,bodyWidth,shoulder,endSurface,tint}=c;
  const model=c.m||root.VehicleMeshes.MODELS[id];
  const ev=id==='musso_ev',charcoal='#292e30',black='#161b1e',silver='#a6afb3';
  function emit(v,fill,material='paint',part='kgm-detail',flat=false){
   face(v,fill,null,.4,material);const f=faces.at(-1);f.part=part;f.flat=flat;
  }
  function sculpt(p){
   const q={...p},x=p.x/L,side=Math.sign(p.y),u=Math.abs(p.y)/(W*.5),z=p.z/H;
   // The doors are deeply stamped between the shoulder and sill, not an
   // extruded flat side wall. Arches blend into broad shoulder volumes.
   if(u>.77&&z>.23&&z<.68&&x>rearAxle/L+.11&&x<frontAxle/L-.10){
    const blend=Math.sin(Math.PI*clamp((x-(rearAxle/L+.11))/((frontAxle-rearAxle)/L-.21),0,1));
    const inset=(ev?.061:.047)*Math.exp(-Math.pow((z-.445)/.115,4));
    const lower=.014*Math.exp(-Math.pow((z-.315)/.028,2));q.y+=side*(-inset+lower)*blend;
   }
   if(u>.72&&z>.40&&z<.73){
    const wheel=Math.max(Math.exp(-Math.pow((p.x-frontAxle)/.57,4)),Math.exp(-Math.pow((p.x-rearAxle)/.61,4)));
    q.y+=side*(ev?.030:.023)*wheel*Math.sin(Math.PI*clamp((z-.40)/.33,0,1));
   }
   // Two raised shoulder ridges and the recessed centre of the clamshell hood.
   if(x>.255&&x<.49&&z>.64){const fade=Math.sin(Math.PI*(x-.255)/.235);q.z+=fade*(.035*Math.exp(-Math.pow((u-.68)/.12,2))+.014*Math.exp(-Math.pow(u/.36,4)));}
   // The real fascia has a recessed belt between the upper lighting plane and
   // the projecting skid/bumper, with fuller outer cheeks beside the lamps.
   if(x>.36&&z<.72){const fade=Math.pow(clamp((x-.36)/.14,0,1),2);q.x+=fade*((ev?-.064:-.078)*Math.exp(-Math.pow((z-.49)/.105,2))+.027*Math.exp(-Math.pow((z-.285)/.075,2))+.026*Math.exp(-Math.pow((u-.82)/.12,2))*Math.exp(-Math.pow((z-.56)/.11,2)));}
   return q;
  }
  // All affected paint vertices share the same deformation, preserving seams.
  for(const f of faces)if(f.part!=='wheels'&&f.part!=='cargo-bed')f.vertices=f.vertices.map(sculpt);
  for(let i=faces.length-1;i>=0;i--)if(faces[i].part==='wheel-arches'||ev&&faces[i].part==='cargo-bed')faces.splice(i,1);
  const sideAt=(x,z,s,offset=0)=>sculpt(z*H<=shoulder(x)?bodySide(x,z*H,s,offset):sidePoint(x,z,s,offset));
  function subdivide(shape,mapper,fill,material,part,depth=2){
   const tri=(a,b,d,n)=>{if(!n){emit([mapper(a),mapper(b),mapper(d)],fill,material,part);return;}const ab=a.map((v,j)=>(v+b[j])/2),bd=b.map((v,j)=>(v+d[j])/2),da=d.map((v,j)=>(v+a[j])/2);tri(a,ab,da,n-1);tri(ab,b,bd,n-1);tri(da,bd,d,n-1);tri(ab,bd,da,n-1);};
   for(let j=1;j<shape.length-1;j++)tri(shape[0],shape[j],shape[j+1],depth);
  }
  function sidePanel(shape,s,fill=paint,material='paint',offset=.012,part='kgm-side-panel'){
   subdivide(shape,([x,z])=>sideAt(x,z,s,offset),fill,material,part,3);
  }
  function sideRibbon(path,s,width,fill,material='plastic',offset=.020,part='kgm-edge'){
   for(let j=0;j<path.length-1;j++){const a=path[j],b=path[j+1],dx=(b[0]-a[0])*L,dz=(b[1]-a[1])*H,len=Math.hypot(dx,dz)||1,ox=-dz/len*width/L/2,oz=dx/len*width/H/2;sidePanel([[a[0]+ox,a[1]+oz],[b[0]+ox,b[1]+oz],[b[0]-ox,b[1]-oz],[a[0]-ox,a[1]-oz]],s,fill,material,offset,part);}
  }
  function solidRing(outline,inner,mapper,fill=charcoal,part='kgm-cladding',depth=.025){
   const material=part==='kgm-painted-flare'?'paint':'plastic';
   for(let j=0;j<outline.length;j++){const k=(j+1)%outline.length;
    subdivide([[...outline[j],0],[...outline[k],0],[...inner[k],.010],[...inner[j],.010]],p=>mapper(p,p[2]),fill,material,part,2);
    subdivide([[...outline[j],-depth],[...outline[k],-depth],[...outline[k],0],[...outline[j],0]],p=>mapper(p,p[2]),material==='paint'?tint(fill,-.08):'#373e41',material,part,1);
    subdivide([[...inner[j],.010],[...inner[k],.010],[...inner[k],-depth],[...inner[j],-depth]],p=>mapper(p,p[2]),black,'rubber',part,1);
   }
  }
  // Broad squared arch mouldings have a real outer lip, flat top, beveled
  // shoulders and a dark wheel-well return. The previous thin arch line is gone.
  const shape=[[-1,-.32],[-1,0],[-.91,.68],[-.69,.96],[-.40,1.04],[.40,1.04],[.69,.96],[.91,.68],[1,0],[1,-.32]];
  const contains=(poly,x,z)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
  for(const[cx,r]of[[frontAxle,R],[rearAxle,Rr]])for(const s of[-1,1]){
   const inside=shape.map(([x,z])=>[cx+x*r*1.085,r+z*r*1.085]),outside=shape.map(([x,z])=>[cx+x*r*(ev?1.36:1.32),r+z*r*(ev?1.32:1.28)]);
   // Dark inner liners prevent daylight showing through the wheel clearance.
   emit(inside.map(([x,z])=>P(x,s*W*.415,z)),black,'rubber','kgm-wheel-well-liner');
   for(const f of faces)if(f.part==='body'&&f.vertices.every(p=>p.y*s>W*.32)){
    const x=f.vertices.reduce((v,p)=>v+p.x/f.vertices.length,0),z=f.vertices.reduce((v,p)=>v+p.z/f.vertices.length,0);
    if(contains(outside,x,z)){f.fill=charcoal;f.material='plastic';}
   }
   const mapper=([x,z],depth)=>{const p=sideAt(x/L,z/H,s,.025+depth);p.y+=s*.012;return p;};
   solidRing(outside,inside,mapper,charcoal,'kgm-fender-moulding',.043);
   // A body-coloured rolled flare surrounds the moulding rather than a black
   // outline drawn directly onto an otherwise straight slab.
   const lip=outside.map(([x,z])=>[cx+(x-cx)*1.045,r+(z-r)*1.055]);
   solidRing(lip,outside,([x,z],depth)=>sideAt(x/L,z/H,s,.010+depth),paint,'kgm-painted-flare',.008);
   if(ev){const x=cx+.01,z=r+r*1.29;const base=[[x-.035,z-.017],[x+.040,z-.017],[x+.048,z+.105],[x+.025,z+.155],[x-.025,z+.155]];
    subdivide(base,([xx,zz])=>sideAt(xx/L,zz/H,s,.066),'#545e63','plastic','musso-arch-tab',1);
    subdivide([[x-.014,z-.005],[x+.018,z-.005],[x+.026,z+.127],[x-.009,z+.127]],([xx,zz])=>sideAt(xx/L,zz/H,s,.075),silver,'chrome','musso-arch-tab-insert',1);
   }
  }
  // Continuous lower cladding ties the arch extensions into the rockers.
  const rearX=(rearAxle+Rr*1.28)/L,frontX=(frontAxle-R*1.28)/L;
  for(const s of[-1,1]){
   sidePanel([[rearX-.013,.19],[frontX+.012,.19],[frontX+.012,.295],[frontX-.045,.306],[frontX-.072,.33],[rearX+.12,.33],[rearX+.073,.297],[rearX-.013,.30]],s,charcoal,'plastic',.026,'kgm-rocker-cladding');
   sideRibbon([[rearX,.208],[frontX,.208]],s,.025,'#3c4448','plastic',.038,'kgm-rocker-step');
   // Shoulder shut line and lower concave stamped-door border.
   const doorEnd=ev?-.17:-.24;
   sideRibbon([[doorEnd,.672],[-.04,.673],[.19,.668],[.245,.676]],s,.006,tint(paint,-.30),'paint',.010,'kgm-belt-crease');
   sideRibbon([[doorEnd+.02,.325],[-.08,.329],[.15,.326],[.21,.354]],s,.006,tint(paint,.10),'paint',.014,'kgm-lower-door-crease');
   // Distinct, thick satin-black window frames. Thin bright universal frames
   // were making these rugged cars resemble a generic passenger sedan.
   for(const shape of model.glass)sideRibbon([...shape,shape[0]],s,.016,'#252b2e','plastic',.026,'kgm-window-surround');
   if(!ev){
    sidePanel([[-.355,.714],[-.287,.966],[-.205,.965],[-.240,.696]],s,'#242b2e','plastic',.032,'torres-wide-c-pillar');
    sidePanel([[-.461,.717],[-.391,.907],[-.348,.913],[-.399,.713]],s,'#17252c','glass',.038,'torres-quarter-glass');
    // Visible fuel flap above the rear fender, with gently rounded shoulders.
    sideRibbon([[-.322,.618],[-.321,.695],[-.308,.709],[-.279,.709],[-.269,.697],[-.269,.624],[-.279,.612],[-.311,.612],[-.322,.618]],s,.004,tint(paint,-.34),'paint',.012,'torres-fuel-flap');
   }else{
    sidePanel([[-.202,.672],[-.181,.965],[-.151,.965],[-.155,.733],[-.125,.698]],s,paint,'paint',.027,'musso-c-pillar');
    // The sports-bar fin is a thick, open framed part, not a painted triangle.
    const outer=[[-.230,.664],[-.214,.741],[-.214,.918],[-.192,.976],[-.161,.979],[-.171,.687]],inner=[[-.209,.729],[-.195,.758],[-.193,.897],[-.183,.930],[-.178,.928],[-.184,.738]];
    solidRing(outer,inner,([x,z],d)=>sideAt(x,z,s,.050+d),'#444c50','musso-sports-bar',.065);
    sideRibbon([...inner,inner[0]],s,.014,silver,'chrome',.078,'musso-sports-bar-trim');
    for(let j=0;j<8;j++)sideRibbon([[-.205+.001*j,.757+j*.017],[-.185+.001*j,.757+j*.017]],s,.009,'#252b2e','plastic',.066,'musso-sports-bar-louvre');
    // The charging door sits on the front fender; only the left side has it.
    if(s===-1)sideRibbon([[.298,.593],[.298,.653],[.287,.667],[.252,.667],[.242,.655],[.242,.602],[.253,.589],[.287,.589],[.298,.593]],s,.004,tint(paint,-.34),'paint',.016,'musso-charge-door');
   }
  }
  // Raised hood tie-down loops are prominent from the requested overhead view.
  for(const s of[-1,1]){
   const x=.283,y=s*W*.345,base=surfacePoint(x,y/roofWidth(x)),verts=[[-.07,0],[-.045,.035],[.045,.035],[.07,0]];
   for(let j=0;j<verts.length-1;j++){const [a,z]=verts[j],[b,zz]=verts[j+1];emit([P(base.x+a,y-.018,base.z+z+.009),P(base.x+b,y-.018,base.z+zz+.009),P(base.x+b,y+.018,base.z+zz+.009),P(base.x+a,y+.018,base.z+z+.009)],silver,'chrome','kgm-hood-tie-down');}
   // Raised longitudinal roof rails with separate feet, following roof crown.
   const ra=ev?-.153:-.315,rb=ev?.078:.055,ry=s*W*.355;
   for(let j=0;j<18;j++){const a=ra+(rb-ra)*j/18,b=ra+(rb-ra)*(j+1)/18,za=top(a)+.043,zb=top(b)+.043;emit([P(a*L,ry-.020,za),P(b*L,ry-.020,zb),P(b*L,ry+.020,zb),P(a*L,ry+.020,za)],'#353c40','plastic','kgm-roof-rail');emit([P(a*L,ry+s*.02,za-.025),P(b*L,ry+s*.02,zb-.025),P(b*L,ry+s*.02,zb),P(a*L,ry+s*.02,za)],'#242b2f','plastic','kgm-roof-rail');}
   for(const x of[ra,rb]){const z=top(x);emit([P(x*L-.055,ry-.026,z-.004),P(x*L+.055,ry-.026,z-.004),P(x*L+.030,ry-.019,z+.043),P(x*L-.030,ry-.019,z+.043)],'#363e42','plastic','kgm-rail-foot');}
  }
  // Realistic diamond-cut wheel faces, dish, brake discs, five lug bolts and
  // separate machined faces. The Musso EV uses the closed aerodynamic design.
  for(const[cx,r]of[[frontAxle,R],[rearAxle,Rr]])for(const s of[-1,1]){
   const y=s*(W*.48+.019),outer=r*.747,inner=r*.185;
   const wp=(a,rr,d=0)=>P(cx+Math.cos(a)*rr,y+s*d,r+Math.sin(a)*rr);
   for(let j=0;j<40;j++){const a=j*TAU/40,b=(j+1)*TAU/40;emit([wp(a,outer,-.008),wp(b,outer,-.008),wp(b,outer*.96,.004),wp(a,outer*.96,.004)],'#8e999f','chrome','kgm-machined-rim');}
   for(let j=0;j<5;j++){const a=j*TAU/5;
    if(ev){emit([wp(a-.07,inner,.007),wp(a+.38,inner,.007),wp(a+.51,outer*.94,.009),wp(a-.10,outer*.94,.009)],'#a6aeb2','chrome','musso-aero-wheel');emit([wp(a+.04,inner*1.8,.014),wp(a+.24,inner*1.8,.014),wp(a+.31,outer*.89,.014),wp(a+.08,outer*.89,.014)],'#252d31','plastic','musso-aero-wheel-pocket');}
    else for(const off of[-.13,.13]){const t=a+off;emit([wp(a-.045,inner,.003),wp(a+.045,inner,.003),wp(t+.047,outer*.95,.007),wp(t-.047,outer*.95,.007)],'#c0c9ce','chrome','torres-diamond-spoke');emit([wp(t-.05,outer*.82,-.012),wp(t-.05,outer*.95,.007),wp(t+.05,outer*.95,.007),wp(t+.05,outer*.82,-.012)],'#687780','chrome','torres-spoke-bevel');}
    const hub=wp(a,inner*.62,.022);for(let k=0;k<8;k++){const q=k*TAU/8,rr=.012;emit([hub,P(hub.x+Math.cos(q)*rr,hub.y,hub.z+Math.sin(q)*rr),P(hub.x+Math.cos(q+TAU/8)*rr,hub.y,hub.z+Math.sin(q+TAU/8)*rr)],'#a5afb4','chrome','kgm-wheel-bolt');}
   }
  }
  if(ev){
   // An actual low load floor, inner liners, rounded wheel tubs and separately
   // capped upper rails give the pickup the correct open cargo volume.
   const back=-L*.486,front=-L*.205,floor=H*.430,wall=H*.671;
   emit([P(back,-W*.435,floor),P(front,-W*.435,floor),P(front,W*.435,floor),P(back,W*.435,floor)],'#343b3f','plastic','musso-load-floor');
   for(const s of[-1,1]){
    const y=s*W*.443;emit([P(back,y,floor),P(front,y,floor),P(front,y,wall),P(back,y,wall)],'#333a3e','plastic','musso-bed-liner');
    emit([P(back,s*W*.431,wall),P(front,s*W*.431,wall),P(front,s*W*.487,wall+.012),P(back,s*W*.487,wall+.012)],'#272f33','plastic','musso-bed-cap');
    // Wheel tubs follow the rear axle and are clearly visible from overhead.
    for(let j=0;j<20;j++){const a=j*Math.PI/20,b=(j+1)*Math.PI/20;emit([P(rearAxle+Math.cos(a)*Rr*1.18,s*W*.44,floor+Math.sin(a)*Rr*.65),P(rearAxle+Math.cos(b)*Rr*1.18,s*W*.44,floor+Math.sin(b)*Rr*.65),P(rearAxle+Math.cos(b)*Rr*1.18,s*W*.32,floor+Math.sin(b)*Rr*.65),P(rearAxle+Math.cos(a)*Rr*1.18,s*W*.32,floor+Math.sin(a)*Rr*.65)],'#30383d','plastic','musso-inner-wheel-tub');}
   }
   for(let j=-7;j<=7;j++){const y=j*W*.055;emit([P(back+.06,y-.009,floor+.004),P(front-.04,y-.009,floor+.004),P(front-.04,y+.009,floor+.004),P(back+.06,y+.009,floor+.004)],'#525c62','plastic','musso-bed-rib');}
   emit([P(back,-W*.44,floor),P(back,W*.44,floor),P(back,W*.44,wall),P(back,-W*.44,wall)],'#343d42','plastic','musso-tailgate-liner');
   // Rear cab window is mounted on the nearly vertical cab wall, above the bed.
   const cabX=-L*.201;subdivide([[-.70,.727],[.70,.727],[.64,.918],[-.64,.918]],([u,z])=>P(cabX-.011,u*W*.5,z*H),'#17242b','glass','musso-cab-rear-glass',3);
   emit([P(cabX-.015,-W*.13,H*.945),P(cabX-.015,W*.13,H*.945),P(cabX-.015,W*.13,H*.959),P(cabX-.015,-W*.13,H*.959)],'#a91b23','light','musso-high-brake-lamp');
  }else{
   // Wide roof spoiler and inset black underside above the tail glass.
   const back=-L*.465,front=-L*.360,zBack=H*.913,zFront=H*.957,y=W*.412;
   const p=(x,y,z)=>P(x,y,z-.040*Math.pow(Math.abs(y)/(W*.412),4));
   for(let j=0;j<32;j++){const a=-y+2*y*j/32,b=-y+2*y*(j+1)/32;
    emit([p(back,a,zBack),p(front,a,zFront),p(front,b,zFront),p(back,b,zBack)],paint,'paint','torres-roof-spoiler');
    emit([p(back,a,zBack-.028),p(front,a,zFront-.020),p(front,b,zFront-.020),p(back,b,zBack-.028)],black,'plastic','torres-spoiler-underside');
    emit([p(back,a,zBack-.028),p(back,b,zBack-.028),p(back,b,zBack),p(back,a,zBack)],paint,'paint','torres-spoiler-trailing-edge');
   }
   for(const s of[-1,1])emit([p(back,s*y,zBack-.028),p(front,s*y,zFront-.020),p(front,s*y,zFront),p(back,s*y,zBack)],paint,'paint','torres-spoiler-end');
   emit([P(back-.004,-W*.15,zBack-.019),P(back-.004,W*.15,zBack-.019),P(back-.004,W*.15,zBack-.006),P(back-.004,-W*.15,zBack-.006)],'#b31d25','light','torres-high-brake-lamp');
  }
 }
 root.KgmRefined=Object.freeze({append});
 if(typeof module!=='undefined'&&module.exports)module.exports=root.KgmRefined;
})(typeof window!=='undefined'?window:globalThis);
