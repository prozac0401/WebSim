/* Four-wheel 2.5D prototype, fixed 120 Hz. Horizontal motion follows a supplied
 * height field; slope gravity and quasi-static normal loads are approximated.
 * No suspension, vertical acceleration, airborne motion or position snapping. */
(function(root){
  'use strict';
  const DT=1/120,G=9.81,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const Genome=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null);
  const Driver=root.DriftDriver||(typeof require==='function'?require('./driver.js'):null);
  const Clutch=root.DriftManualClutch||(typeof require==='function'?require('./manual-clutch.js'):null);
  const cfg=v=>v.physics||v;
  function torqueAt(v,rpm){const p=cfg(v),c=p.torqueCurve;let torque=p.peakTorque;if(c&&c.length){let i=0;while(i<c.length-2&&rpm>c[i+1].rpm)i++;const a=c[i],b=c[i+1];torque=a.torqueNm+(b.torqueNm-a.torqueNm)*clamp((rpm-a.rpm)/(b.rpm-a.rpm),0,1);}return Math.max(0,Math.min(torque,p.peakTorque,p.peakPowerW/Math.max(rpm*Math.PI/30,1)));}
  function roadSurface(track,x,y,hint){
    const section=track.sample(clamp(hint,0,track.length));
    const raw=typeof track.surface==='function'?track.surface(x,y,hint):{z:section.z??0,gradientX:0,gradientY:0,normalZ:1,muScale:1};
    const {z,gradientX:gx,gradientY:gy}=raw,normalZ=raw.normalZ??1/Math.hypot(1,gx,gy),muScale=raw.muScale??1;
    if(![z,gx,gy,normalZ,muScale].every(Number.isFinite)||normalZ<=0||normalZ>1||muScale<0)throw new RangeError('Invalid road surface');
    const heading=section.heading,c=Math.cos(heading),s=Math.sin(heading);
    return {z,gradientX:gx,gradientY:gy,normalZ,muScale,grade:section.grade??gx*c+gy*s,bank:section.bank??Math.atan(-gx*s+gy*c)};
  }
  function initialState(v,track){const p=cfg(v),a=track.sample(2.5),road=roadSurface(track,a.x,a.y,2.5);return {x:a.x,y:a.y,z:road.z,grade:road.grade,bank:road.bank,yaw:a.heading,vx:0,vy:0,r:0,s:2.5,time:0,speed:0,beta:0,steer:0,throttle:0,brake:0,gear:1,rpm:p.electric?0:(p.idleRPM||800),torque:0,rearTorque:0,wheelOmega:[0,0,0,0],wheelSlip:[0,0,0,0],wheelForces:[],ax:0,ay:0,status:'running',reason:null,maxAngle:0,driftDistance:0,scoreIntegral:0,judgedDistance:0,peakWheelSlip:0,shiftTimer:0,stalled:0,targetSlip:0,lineOffset:0,counterLead:.25,driveSlipTarget:0,requestedGear:0,driverSteerCorrection:0,driverThrottleCorrection:0,targetYawRate:0,pathError:0,predictedSlip:0,gearShiftVeto:0,...Clutch.initialState(v),...(Driver.initialClutchState?.()||{}),vehicle:v};}
  // Explicit legacy utility for offline conversion only. Runtime evaluateGene
  // requires the version-2 genome and state-feedback driver.
  function commandAt(gene,s,length){const n=gene.length/3,t=clamp(s/length*(n-1),0,n-1),i=Math.min(n-2,Math.floor(t)),f=t-i;return {steer:gene[i*3]+(gene[i*3+3]-gene[i*3])*f,throttle:gene[i*3+1]+(gene[i*3+4]-gene[i*3+1])*f,brake:gene[i*3+2]+(gene[i*3+5]-gene[i*3+2])*f};}
  function bodyCenter(v,a){const offset=cfg(v).bodyCenterOffsetM||0;return {x:a.x+offset*Math.cos(a.yaw),y:a.y+offset*Math.sin(a.yaw)};}
  function footprint(v,a){const p=cfg(v),l=p.lengthM/2,w=p.widthM/2,c=Math.cos(a.yaw),s=Math.sin(a.yaw),center=bodyCenter(v,a);return [[l,w],[l,-w],[-l,-w],[-l,w]].map(([x,y])=>({x:center.x+x*c-y*s,y:center.y+x*s+y*c}));}
  function frontContacts(v,a){const p=cfg(v),lf=p.wheelbaseM*(1-(p.frontWeightFraction||.52)),halfTrack=(p.trackWidthM||p.widthM*.84)/2,c=Math.cos(a.yaw),s=Math.sin(a.yaw);return [halfTrack,-halfTrack].map(y=>({x:a.x+lf*c-y*s,y:a.y+lf*s+y*c}));}
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  // Immutable course polygons can share metadata across ticks. Mutable geometry
  // is cached only within one failure() call, so later edits never go stale.
  const frozenPolygonCache=new WeakMap();
  function bounds(points){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}return {minX,minY,maxX,maxY};}
  function boundsOverlap(a,b){return !(a.maxX<b.minX-1e-9||b.maxX<a.minX-1e-9||a.maxY<b.minY-1e-9||b.maxY<a.minY-1e-9);}
  function polygonGeometry(points,cache){
    let data=cache.get(points)||frozenPolygonCache.get(points);if(data)return data;
    const edges=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[j],b=points[i];edges.push({a,b,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)});}
    data={bounds:bounds(points),edges};cache.set(points,data);
    if(Object.isFrozen(points)&&points.every(Object.isFrozen))frozenPolygonCache.set(points,data);
    return data;
  }
  function onSegment(a,b,p){return Math.abs(cross(a,b,p))<1e-9&&p.x>=Math.min(a.x,b.x)-1e-9&&p.x<=Math.max(a.x,b.x)+1e-9&&p.y>=Math.min(a.y,b.y)-1e-9&&p.y<=Math.max(a.y,b.y)+1e-9;}
  function segmentsIntersect(a,b,c,d){const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);return ((abC>0&&abD<0||abC<0&&abD>0)&&(cdA>0&&cdB<0||cdA<0&&cdB>0))||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
  function pointInPolygon(p,polygon,cache){
    const data=polygonGeometry(polygon,cache),box=data.bounds;
    if(p.x<box.minX-1e-9||p.x>box.maxX+1e-9||p.y<box.minY-1e-9||p.y>box.maxY+1e-9)return false;
    let inside=false;for(const edge of data.edges){
      if(p.y<edge.minY-1e-9||p.y>edge.maxY+1e-9)continue;
      const {a,b}=edge;if(p.x>=edge.minX-1e-9&&p.x<=edge.maxX+1e-9&&onSegment(a,b,p))return true;
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }return inside;
  }
  function polygonsIntersect(a,b,cache){
    const aa=polygonGeometry(a,cache),bb=polygonGeometry(b,cache);if(!boundsOverlap(aa.bounds,bb.bounds))return false;
    if(a.some(p=>pointInPolygon(p,b,cache))||b.some(p=>pointInPolygon(p,a,cache)))return true;
    for(const ae of aa.edges)for(const be of bb.edges)if(boundsOverlap(ae,be)&&segmentsIntersect(ae.a,ae.b,be.a,be.b))return true;
    return false;
  }
  function convexHull(points){const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),lower=[],upper=[];for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of sorted.slice().reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}return lower.slice(0,-1).concat(upper.slice(0,-1));}
  function segmentInsideUnion(a,b,polygons,cache){
    const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy,cuts=[0,1],box=bounds([a,b]),inside=p=>polygons.some(poly=>pointInPolygon(p,poly,cache));
    if(!inside(a)||!inside(b))return false;
    for(const polygon of polygons)for(const edge of polygonGeometry(polygon,cache).edges){
      if(!boundsOverlap(box,edge))continue;
      const p=edge.a,q=edge.b,ex=q.x-p.x,ey=q.y-p.y,den=dx*ey-dy*ex;
      if(Math.abs(den)>1e-10){const t=((p.x-a.x)*ey-(p.y-a.y)*ex)/den,u=((p.x-a.x)*dy-(p.y-a.y)*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1)cuts.push(t);}
      else if(Math.abs(cross(a,b,p))<1e-9)for(const end of [p,q]){const t=((end.x-a.x)*dx+(end.y-a.y)*dy)/(l2||1);if(t>0&&t<1)cuts.push(t);}
    }
    cuts.sort((x,y)=>x-y);for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2;if(!inside({x:a.x+dx*t,y:a.y+dy*t}))return false;}return true;
  }
  function pointInInterior(p,polygon,cache){return pointInPolygon(p,polygon,cache)&&!polygonGeometry(polygon,cache).edges.some(e=>onSegment(e.a,e.b,p));}
  function segmentOutsideInterior(a,b,polygon,cache){
    if(pointInInterior(a,polygon,cache)||pointInInterior(b,polygon,cache))return false;
    const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy,cuts=[0,1],box=bounds([a,b]);
    for(const edge of polygonGeometry(polygon,cache).edges){
      if(!boundsOverlap(box,edge))continue;
      const p=edge.a,q=edge.b,ex=q.x-p.x,ey=q.y-p.y,den=dx*ey-dy*ex;
      if(Math.abs(den)>1e-10){const t=((p.x-a.x)*ey-(p.y-a.y)*ex)/den,u=((p.x-a.x)*dy-(p.y-a.y)*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1)cuts.push(t);}
      else if(Math.abs(cross(a,b,p))<1e-9)for(const end of [p,q]){const t=((end.x-a.x)*dx+(end.y-a.y)*dy)/(l2||1);if(t>0&&t<1)cuts.push(t);}
    }
    cuts.sort((x,y)=>x-y);for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2;if(pointInInterior({x:a.x+dx*t,y:a.y+dy*t},polygon,cache))return false;}return true;
  }
  function contactOnRoad(track,point,hint,cache){
    if(track.excludedPolygons?.some(poly=>pointInInterior(point,poly,cache)))return false;
    if(track.boundaryPolygons?.length)return track.boundaryPolygons.some(poly=>pointInPolygon(point,poly,cache));
    if(typeof track.contains==='function')return track.contains(point.x,point.y,hint);
    const q=track.project(point.x,point.y,hint),section=track.sample(clamp(q.s,0,track.length)),halfWidth=q.error>=0?(section.widthLeft??track.width/2):(section.widthRight??track.width/2);
    return q.distance<=halfWidth+1e-6&&q.s>=-10&&q.s<=track.length+10;
  }
  function contactSegmentOnRoad(track,a,b,hint,cache){
    if(!contactOnRoad(track,a,hint,cache)||!contactOnRoad(track,b,hint,cache))return false;
    if(track.excludedPolygons?.some(poly=>!segmentOutsideInterior(a,b,poly,cache)))return false;
    if(track.boundaryPolygons?.length)return segmentInsideUnion(a,b,track.boundaryPolygons,cache);
    // Black-box contains/width APIs lack polygon intersections; sample the
    // contact path at <=10 cm, including both endpoints.
    const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.1));
    for(let i=1;i<count;i++){const u=i/count;if(!contactOnRoad(track,{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u},hint,cache))return false;}return true;
  }
  function frontContactSweep(v,track,a,old,cache){
    const current=frontContacts(v,a);if(current.some(point=>!contactOnRoad(track,point,a.s,cache)))return false;
    if(!old)return true;
    const yaw=old.yaw??a.yaw,angle=wrap(a.yaw-yaw),p=cfg(v),radius=Math.hypot(p.wheelbaseM*(1-(p.frontWeightFraction||.52)),(p.trackWidthM||p.widthM*.84)/2);
    const at=t=>frontContacts(v,{x:old.x+(a.x-old.x)*t,y:old.y+(a.y-old.y)*t,yaw:yaw+angle*t});
    const previous=at(0),visit=(wheel,t0,t1,left,right,depth)=>{
      const mid=(t0+t1)/2,hint=(old.s??a.s)+(a.s-(old.s??a.s))*mid,point=at(mid)[wheel];
      if(!contactOnRoad(track,point,hint,cache))return false;
      const padding=radius*(angle*(t1-t0))**2/8;
      if(padding<=1e-7||depth>=18)return contactSegmentOnRoad(track,left,point,hint,cache)&&contactSegmentOnRoad(track,point,right,hint,cache);
      // A rotating contact follows an arc, not its endpoint chord. Certify
      // the chord's sagitta envelope; if it touches a boundary, subdivide the
      // actual path instead of rejecting a tyre that merely reaches an edge.
      const envelope=convexHull([left,right].flatMap(q=>[{x:q.x-padding,y:q.y-padding},{x:q.x-padding,y:q.y+padding},{x:q.x+padding,y:q.y-padding},{x:q.x+padding,y:q.y+padding}]));
      const clearHoles=!(track.excludedPolygons||[]).some(poly=>polygonsIntersect(envelope,poly,cache));
      // A union can have an implicit interior hole even when its envelope
      // perimeter is on-road. Only one simple polygon can certify the whole
      // envelope; seam crossings and opaque corridor APIs must subdivide.
      const inOnePolygon=track.boundaryPolygons?.some(poly=>envelope.every((q,i)=>segmentInsideUnion(q,envelope[(i+1)%envelope.length],[poly],cache)));
      if(clearHoles&&inOnePolygon)return true;
      return visit(wheel,t0,mid,left,point,depth+1)&&visit(wheel,mid,t1,point,right,depth+1);
    };
    return previous.every((point,i)=>contactOnRoad(track,point,old.s??a.s,cache)&&visit(i,0,1,point,current[i],0));
  }
  function failure(v,track,a,old){
    const p=cfg(v),c=Math.cos(a.yaw),s=Math.sin(a.yaw),center=bodyCenter(v,a),body=footprint(v,a),cache=new WeakMap(),bodyBounds=bounds(body);
    let swept=null,sweptBounds=null,previous=null;
    for(const o of track.obstacles||[]){
      const polygon=o.polygon?.points||(o.type==='polygon'?o.points:null);
      if(polygon){
        const obstacleBounds=polygonGeometry(polygon,cache).bounds;
        if(boundsOverlap(bodyBounds,obstacleBounds)&&polygonsIntersect(body,polygon,cache))return 'collision';
        // Swept rectangles also catch thin barriers between 120 Hz samples.
        if(old){
          if(!previous){previous=footprint(v,{...old,yaw:old.yaw??a.yaw});sweptBounds=bounds([...previous,...body]);}
          if(boundsOverlap(sweptBounds,obstacleBounds)){if(!swept)swept=convexHull([...previous,...body]);if(polygonsIntersect(swept,polygon,cache))return 'collision';}
        }
        continue;
      }
      const dx=o.x-center.x,dy=o.y-center.y,lx=dx*c+dy*s,ly=-dx*s+dy*c;
      if(Math.hypot(Math.max(0,Math.abs(lx)-p.lengthM/2),Math.max(0,Math.abs(ly)-p.widthM/2))<=o.r)return 'collision';
      // Conservative swept centres prevent skipping a narrow obstacle at speed.
      if(old){const before=bodyCenter(v,{...old,yaw:old.yaw??a.yaw}),dx2=center.x-before.x,dy2=center.y-before.y,l2=dx2*dx2+dy2*dy2;const t=clamp(((o.x-before.x)*dx2+(o.y-before.y)*dy2)/(l2||1),0,1),padding=Math.abs(p.bodyCenterOffsetM||0)*wrap(a.yaw-(old.yaw??a.yaw))**2/8;if(Math.hypot(o.x-before.x-t*dx2,o.y-before.y-t*dy2)<o.r+p.widthM*.48+padding)return 'collision';}
    }
    // The chosen course rule requires both front contact centres to remain
    // on the road. Rear tyres and body overhang may cross the road boundary;
    // the full-body obstacle checks above remain unchanged.
    if(!frontContactSweep(v,track,a,old,cache))return 'offtrack';
    return null;
  }
  // Rear wheel response used inside the manual clutch constraint. Newton steps
  // stay bracketed; tyre derivatives are nonnegative, including saturation.
  function manualWheelResponse(d,drive,dt){
    const {omega:oldOmega,Vx,R,load,capacity,cy,braking,resistance}=d,inertia=1.5,den=Math.max(Math.abs(Vx),3),slope=load*10*R/den;
    const forces=omega=>{const slip=(omega*R-Vx)/den,cx=load*10*slip,q=Math.hypot(cx,cy),t=capacity>0?Math.tanh(q/capacity):0,k=capacity<=0?0:q>1e-8?capacity*t/q:1;
      const share=q>1e-8?cx*cx/(q*q):0,derivative=capacity<=0?0:slope*(k*(1-share)+(1-t*t)*share);return {fx:cx*k,fy:cy*k,slip,derivative};};
    const unbraked=drive-resistance,holdTorque=unbraked-R*forces(0).fx+inertia*oldOmega/dt;
    const sticks=braking>0&&Math.abs(holdTorque)<=braking,appliedBrake=braking>0?(sticks?holdTorque:braking*Math.sign(holdTorque)):0,torque=unbraked-appliedBrake;
    if(sticks)return {omega:0,f:forces(0),appliedBrake,torque};
    let lo=Math.min(oldOmega,Vx/R)-Math.abs(torque)*dt/inertia-capacity*R*dt/inertia-2;
    let hi=Math.max(oldOmega,Vx/R)+Math.abs(torque)*dt/inertia+capacity*R*dt/inertia+2,omega=clamp(oldOmega,lo,hi),f;
    for(let j=0;j<24;j++){
      f=forces(omega);const res=omega-oldOmega-dt*(torque-R*f.fx)/inertia;
      if(Math.abs(res)<1e-10)break;
      if(res>0)hi=omega;else lo=omega;
      const next=omega-res/(1+dt*R*f.derivative/inertia);
      omega=next>lo&&next<hi?next:(lo+hi)/2;
    }
    return {omega,f:forces(omega),appliedBrake,torque};
  }
  function step(v,track,a,input,dt=DT){
    if(a.status!=='running')return a;
    const road=roadSurface(track,a.x,a.y,a.s);
    const p=cfg(v),mass=p.massKg,L=p.wheelbaseM,frontFraction=p.frontWeightFraction||.52,lf=L*(1-frontFraction),lr=L*frontFraction,halfTrack=(p.trackWidthM||p.widthM*.84)/2,R=p.tireRadius,mu=(p.gripCoefficient||1)*road.muScale,old={x:a.x,y:a.y,yaw:a.yaw,s:a.s};
    a.steer+=clamp(clamp(input.steer,-p.maxSteer,p.maxSteer)-a.steer,-p.steerRate*dt,p.steerRate*dt);
    a.throttle=clamp(input.throttle,0,1);a.brake=clamp(input.brake,0,1);
    for(const key of Driver.TELEMETRY)if(Number.isFinite(input[key]))a[key]=input[key];
    const c=Math.cos(a.yaw),sn=Math.sin(a.yaw),u=a.vx*c+a.vy*sn,w=-a.vx*sn+a.vy*c;
    const gravityScale=G/(1+road.gradientX**2+road.gradientY**2),gravityX=-gravityScale*road.gradientX,gravityY=-gravityScale*road.gradientY;
    const gravityLong=gravityX*c+gravityY*sn,gravitySide=-gravityX*sn+gravityY*c,normalLoad=mass*G*road.normalZ;
    const manual=Clutch.isManual(v),clutchModel=manual?Clutch.parameters(v):null;
    const ratios=p.gearRatios,finalFor=gear=>p.finalDriveRatios?.[gear-1]??p.finalDrive,ratio=ratios[a.gear-1]*finalFor(a.gear);
    const shaft=Math.max(0,(a.wheelOmega[2]+a.wheelOmega[3])/2),rawRPM=shaft*ratio*30/Math.PI;
    a.rpm=manual?a.engineOmega*30/Math.PI:p.electric?rawRPM:Math.max(p.idleRPM||800,rawRPM);
    a.shiftTimer=Math.max(0,a.shiftTimer-dt);
    const requestedGear=p.electric?1:clamp(Math.round(input.gearHold||0),0,ratios.length);
    a.requestedGear=requestedGear;a.gearShiftVeto=0;
    if(p.electric)a.gear=1;
    else if(a.shiftTimer===0){
      if(requestedGear>0&&requestedGear!==a.gear){
        const projectedRPM=shaft*ratios[requestedGear-1]*finalFor(requestedGear)*30/Math.PI;
        if(projectedRPM<=(p.maxRPM||7000)){a.gear=requestedGear;a.shiftTimer=manual?(p.manualShiftDurationS||.45):.22;}
        else a.gearShiftVeto=1;
      }else if(requestedGear===0&&(!manual||!(input.clutch>0||input.clutchKickActive))){
        if(a.rpm>(p.shiftRPM||6000)&&a.gear<ratios.length){a.gear++;a.shiftTimer=manual?(p.manualShiftDurationS||.45):.22;}
        else if(a.rpm<1500&&a.gear>1&&a.throttle>.1){a.gear--;a.shiftTimer=manual?(p.manualShiftDurationS||.45):.22;}
      }
    }
    const gearRatio=ratios[a.gear-1]*finalFor(a.gear);
    a.rpm=manual?a.engineOmega*30/Math.PI:p.electric?shaft*gearRatio*30/Math.PI:Math.max(p.idleRPM||800,shaft*gearRatio*30/Math.PI);
    let requested=torqueAt(v,a.rpm)*Math.pow(a.throttle,1.15);
    if(!p.electric&&a.throttle<.03&&(manual?a.rpm>(p.idleRPM||800):u>2))requested=-p.peakTorque*.07;
    if(a.rpm>(p.maxRPM||7000))requested=Math.min(requested,0);
    if(a.shiftTimer>0)requested*=manual?0:.25;
    const response=p.electric?.06:.16;a.torque+=(requested-a.torque)*(1-Math.exp(-dt/response));
    a.torque=Math.min(a.torque,torqueAt(v,a.rpm));if(a.rpm>(p.maxRPM||7000))a.torque=Math.min(a.torque,0);
    if(manual){
      const idleOmega=(p.idleRPM||800)*Math.PI/30,limitOmega=(p.maxRPM||7000)*Math.PI/30,J=clutchModel.engineInertiaKgM2;
      // Bounded idle governor supplies ordinary engine torque, never resets RPM.
      if(a.engineOmega<idleOmega)a.torque=Math.max(a.torque,Math.min(torqueAt(v,p.idleRPM||800),(idleOmega-a.engineOmega)*J/.08));
      a.torque=Math.min(a.torque,Math.max(0,(limitOmega-a.engineOmega)*J/dt));
    }
    a.rearTorque=a.torque*gearRatio*(p.efficiency||.9);
    const loadTransfer=mass*clamp(a.ax-gravityLong,-7,5)*(p.cgHeightM||.5)/L;
    const frontLoad=clamp(normalLoad*frontFraction-loadTransfer,normalLoad*.16,normalLoad*.84),rearLoad=normalLoad-frontLoad;
    const lateralTransfer=mass*clamp(a.ay-gravitySide,-9,9)*(p.cgHeightM||.5)/(halfTrack*2);
    const frontLeft=clamp(frontLoad/2-lateralTransfer*frontFraction,frontLoad*.02,frontLoad*.98),rearLeft=clamp(rearLoad/2-lateralTransfer*(1-frontFraction),rearLoad*.02,rearLoad*.98);
    const loads=[frontLeft,frontLoad-frontLeft,rearLeft,rearLoad-rearLeft];
    let manualSolution=null;
    if(manual){
      const pedal=clamp(Number.isFinite(input.clutch)?input.clutch:0,0,1),shiftRelease=Math.min(.15,(p.manualShiftDurationS||.45)/3);
      const engagement=(1-pedal)*(a.shiftTimer>0?clamp(1-a.shiftTimer/shiftRelease,0,1):1);
      const idleOmega=(p.idleRPM||800)*Math.PI/30,shaftOmega=(a.wheelOmega[2]+a.wheelOmega[3])/2;
      let capacity=clutchModel.clutchCapacityNm*engagement;
      // The driver handles launch/anti-stall clutch pressure below idle shaft
      // speed. Stored flywheel energy above idle is still available on release.
      const launch=shaftOmega*gearRatio<idleOmega*1.05;
      if(launch)capacity=Math.min(capacity,Math.max(0,a.torque+(a.engineOmega-idleOmega)*clutchModel.engineInertiaKgM2/dt));
      const descriptors=[2,3].map(i=>{const wy=(i%2===0?1:-1)*halfTrack,Vx=u-a.r*wy,Vy=w-a.r*lr;
        return {omega:a.wheelOmega[i],Vx,R,load:loads[i],capacity:mu*loads[i],cy:-loads[i]*7.8*Math.atan2(Vy,Math.max(Math.abs(Vx),2)),braking:a.brake*mass*(p.brakeAcceleration||9.8)*R*.19,resistance:Vx>0?.012*loads[i]*R:0};});
      const response=torque=>{const total=Clutch.wheelTorque(torque,gearRatio,p.efficiency||.9),locking=p.diffType==='open'?0:clamp((a.wheelOmega[2]-a.wheelOmega[3])*22,-Math.abs(total)*.38,Math.abs(total)*.38),drives=[total/2-locking,total/2+locking];
        const responses=descriptors.map((d,i)=>manualWheelResponse(d,drives[i],dt));return {shaftOmega:(responses[0].omega+responses[1].omega)/2,responses,drives};};
      const solve=()=>Clutch.solve({engineOmega:a.engineOmega,engineTorque:a.torque,engineInertiaKgM2:clutchModel.engineInertiaKgM2,capacityNm:capacity,gearRatio,dt,wheelResponse:response});
      manualSolution=solve();
      // Free-rev acceleration changes RPM within this step. Bound combustion
      // power at the solved speed too; flywheel transfer remains a separate
      // clutch torque and can exceed engine torque only by spending inertia.
      if(a.torque>0){
        const ceiling=manualSolution.engineOmega>(p.maxRPM||7000)*Math.PI/30+1e-8?0:p.peakPowerW/Math.max(manualSolution.engineOmega,1);
        if(a.torque>ceiling){a.torque=ceiling;manualSolution=solve();}
      }
      const beforeSlip=a.engineOmega-shaftOmega*gearRatio;
      a.clutchSlipEnergyJ+=Math.abs(manualSolution.torque)*(Math.abs(beforeSlip)+Math.abs(manualSolution.slip))*.5*dt;
      a.engineOmega=manualSolution.engineOmega;a.rpm=a.engineOmega*30/Math.PI;
      a.clutchPedal=pedal;a.clutchEngagement=engagement;a.clutchTorque=manualSolution.torque;a.clutchSlipRPM=manualSolution.slip*30/Math.PI;
      a.clutchLocked=manualSolution.locked?1:0;a.clutchCapacityNm=capacity;a.clutchLaunchAssist=launch&&engagement>0?1:0;
      a.rearTorque=Clutch.wheelTorque(manualSolution.torque,gearRatio,p.efficiency||.9);
    }else{a.engineOmega=a.rpm*Math.PI/30;a.clutchPedal=0;a.clutchEngagement=0;a.clutchTorque=0;a.clutchSlipRPM=0;a.clutchLocked=0;a.clutchCapacityNm=0;a.clutchLaunchAssist=0;}
    let rearDrive=[a.rearTorque/2,a.rearTorque/2];
    if(p.diffType!=='open'){const locking=clamp((a.wheelOmega[2]-a.wheelOmega[3])*22,-Math.abs(a.rearTorque)*.38,Math.abs(a.rearTorque)*.38);rearDrive=[rearDrive[0]-locking,rearDrive[1]+locking];}
    let fx=0,fy=0,moment=0;const wheelForces=[];
    for(let i=0;i<4;i++){
      const front=i<2,wx=front?lf:-lr,wy=(i%2===0?1:-1)*halfTrack,delta=front?a.steer:0,dc=Math.cos(delta),ds=Math.sin(delta);
      const vx=u-a.r*wy,vy=w+a.r*wx,Vx=vx*dc+vy*ds,Vy=-vx*ds+vy*dc;
      const capacity=mu*loads[i],alpha=Math.atan2(Vy,Math.max(Math.abs(Vx),2));
      const stiffness=loads[i]*7.8,cy=-stiffness*alpha;
      const drive=front?0:rearDrive[i-2];
      const braking=a.brake*mass*G*(p.brakeAcceleration||9.8)/G*R*(front?.31:.19);
      const resistance=Vx>0?.012*loads[i]*R:0;
      const inertia=1.5,den=Math.max(Math.abs(Vx),3);
      const forces=omega=>{const slip=(omega*R-Vx)/den,cx=loads[i]*10*slip,q=Math.hypot(cx,cy),k=capacity<=0?0:q>1e-8?capacity*Math.tanh(q/capacity)/q:1;return {fx:cx*k,fy:cy*k,slip};};
      const unbraked=drive-resistance;
      // Implicit dry brake friction includes the sticking solution at zero.
      // Using the OLD rotation sign can push a locked wheel through zero and
      // make it reverse every tick during forward braking.
      const holdTorque=unbraked-R*forces(0).fx+inertia*a.wheelOmega[i]/dt;
      const sticks=braking>0&&Math.abs(holdTorque)<=braking;
      let appliedBrake=braking>0?(sticks?holdTorque:braking*Math.sign(holdTorque)):0;
      let torque=unbraked-appliedBrake;
      // Implicit wheel angular integration avoids stiff low-speed slip oscillation.
      let lo=Math.min(a.wheelOmega[i],Vx/R)-Math.abs(torque)*dt/inertia-capacity*R*dt/inertia-2;
      let hi=Math.max(a.wheelOmega[i],Vx/R)+Math.abs(torque)*dt/inertia+capacity*R*dt/inertia+2;
      if(manualSolution&&!front){const solved=manualSolution.wheels.responses[i-2];a.wheelOmega[i]=solved.omega;appliedBrake=solved.appliedBrake;torque=solved.torque;}
      else{for(let j=0;j<13;j++){const mid=(lo+hi)/2,f=forces(mid),res=mid-a.wheelOmega[i]-dt*(torque-R*f.fx)/inertia;if(res>0)hi=mid;else lo=mid;}a.wheelOmega[i]=sticks?0:(lo+hi)/2;}
      const f=forces(a.wheelOmega[i]);a.wheelSlip[i]=f.slip;
      const bx=f.fx*dc-f.fy*ds,by=f.fx*ds+f.fy*dc;fx+=bx;fy+=by;moment+=wx*by-wy*bx;
      wheelForces.push({fx:f.fx,fy:f.fy,load:loads[i],slip:f.slip,alpha,x:wx,y:wy,driveTorque:drive,brakeTorque:braking,appliedBrakeTorque:appliedBrake,netWheelTorque:torque});
    }
    const drag=.5*1.225*(p.dragArea||.65)*u*Math.abs(u);fx-=drag;
    a.ax=fx/mass+gravityLong;a.ay=fy/mass+gravitySide;
    a.vx+=((fx*c-fy*sn)/mass+gravityX)*dt;a.vy+=((fx*sn+fy*c)/mass+gravityY)*dt;
    const inertiaYaw=mass*(L*L+p.widthM*p.widthM)/12*1.35;
    a.r+=moment/inertiaYaw*dt;a.yaw=wrap(a.yaw+a.r*dt);
    a.x+=a.vx*dt;a.y+=a.vy*dt;a.time+=dt;a.speed=Math.hypot(a.vx,a.vy);
    a.beta=a.speed>1?wrap(Math.atan2(a.vy,a.vx)-a.yaw):0;a.wheelForces=wheelForces;
    const projection=track.project(a.x,a.y,a.s),advance=clamp(projection.s-a.s,0,a.speed*dt*1.5+.01);
    a.s=Math.max(a.s,projection.s);
    const nextRoad=roadSurface(track,a.x,a.y,a.s);a.z=nextRoad.z;a.grade=nextRoad.grade;a.bank=nextRoad.bank;
    if(a.s>=track.judgedStart&&a.s<=track.judgedEnd){
      const angle=Math.abs(a.beta)*180/Math.PI;a.maxAngle=Math.max(a.maxAngle,angle);a.judgedDistance+=advance;
      // The physical footprint/failure checks define road validity. Using the
      // road edges is not penalized by distance from an arbitrary centreline,
      // and a driver's self-authored target line earns no matching bonus.
      const quality=clamp((angle-2)/28,0,1)*clamp((85-angle)/30,0,1),moving=a.speed/Math.hypot(a.speed,12);
      a.scoreIntegral+=advance*quality*moving;
      if(angle>=10&&angle<=70&&a.speed>=4)a.driftDistance+=advance;
      if(a.speed>4)a.peakWheelSlip=Math.max(a.peakWheelSlip,...a.wheelSlip.slice(2).map(Math.abs));
    }
    a.stalled=a.speed<.5?a.stalled+dt:0;
    const bad=failure(v,track,a,old);
    if(bad){a.status=bad;a.reason=bad==='collision'?'방호물 충돌':'앞바퀴 접지점이 주행 경계 이탈';}
    else if(![a.x,a.y,a.speed,a.yaw].every(Number.isFinite)){a.status='invalid';a.reason='수치 오류';}
    // Sideslip remains recorded telemetry. A spin breaks scoring continuity;
    // the same forces keep integrating so an on-road driver can recover.
    else if(a.s>=track.length){a.status='finished';}
    else if(a.stalled>8||a.time>90){a.status='timeout';a.reason=a.stalled>8?'주행 정지':'제한 시간 초과';}
    return a;
  }
  function frame(a){const {vehicle,...rest}=a;return {...rest,wheelOmega:[...a.wheelOmega],wheelSlip:[...a.wheelSlip],wheelForces:a.wheelForces.map(f=>({...f}))};}
  function result(a,frames,track){const valid=a.status==='finished',judgedLength=track.judgedEnd-track.judgedStart;return {status:a.status,valid,score:valid&&judgedLength>0?a.scoreIntegral/judgedLength*100:0,time:a.time,progress:a.s,maxAngle:a.maxAngle,driftDistance:a.driftDistance,peakWheelSlip:a.peakWheelSlip,frames,reason:a.reason,finishSpeed:a.speed};}
  function evaluateGene(v,track,gene,{record=true}={}){
    if(!Genome||!Driver)throw new Error('Load DriftGenome and DriftDriver before DriftPhysics.');
    gene=Genome.clone(gene);
    const a=initialState(v,track),frames=record?[frame(a)]:[];let ticks=0;
    while(a.status==='running'){step(v,track,a,Driver.command(v,track,a,gene));if(record&&(++ticks%2===0||a.status!=='running'))frames.push(frame(a));}
    return result(a,frames,track);
  }
  function signature(){return [DT,G,Driver.signature(),Clutch.signature(),Genome.signature?Genome.signature():String(Genome.sample),...[clamp,wrap,cfg,torqueAt,roadSurface,initialState,commandAt,bodyCenter,footprint,frontContacts,cross,bounds,boundsOverlap,polygonGeometry,onSegment,segmentsIntersect,pointInPolygon,polygonsIntersect,convexHull,segmentInsideUnion,pointInInterior,segmentOutsideInterior,contactOnRoad,contactSegmentOnRoad,frontContactSweep,failure,manualWheelResponse,step,frame,result,evaluateGene].map(String)].join('\n').replace(/\r\n/g,'\n');}
  const api={DT,torqueAt,initialState,commandAt,bodyCenter,footprint,frontContacts,failure,step,evaluateGene,frame,result,signature};
  // Compatibility for offline Node tooling; the browser has no grip-search API.
  if(typeof module!=='undefined'&&module.exports){api.buildGripBaseline=(...args)=>require('./grip-baseline-builder.cjs').buildGripBaseline(...args);module.exports=api;}
  root.DriftPhysics=api;
})(typeof window==='undefined'?globalThis:window);
