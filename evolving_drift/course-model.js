/* Open event-course geometry. Source coordinates are in metres; z is never exaggerated. */
(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  function inPolygon(x,y,points){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[j],b=points[i],dx=b.x-a.x,dy=b.y-a.y;
      if(x>=Math.min(a.x,b.x)-1e-6&&x<=Math.max(a.x,b.x)+1e-6&&y>=Math.min(a.y,b.y)-1e-6&&y<=Math.max(a.y,b.y)+1e-6){
        const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
        if(Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<1e-6)return true;
      }
      if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }
  function build(data){
    if(!data||!Array.isArray(data.centerline)||data.centerline.length<3)throw Error('Event course requires a source-backed open centreline.');
    const anchors=data.centerline.map(p=>({...p,z:p.z||0,widthLeft:p.widthLeft??data.width/2,widthRight:p.widthRight??data.width/2,bank:p.bank||0}));
    const dense=[];
    // Cubic Hermite interpolation passes through every digitized anchor. Tangents
    // are chord-weighted and bounded to prevent overshoot near a short segment.
    for(let i=0;i<anchors.length-1;i++){
      const a=anchors[i],b=anchors[i+1],prev=anchors[Math.max(0,i-1)],next=anchors[Math.min(anchors.length-1,i+2)],d=Math.hypot(b.x-a.x,b.y-a.y),count=Math.max(2,Math.ceil(d/.65));
      const tangent=(from,to)=>{const n=Math.hypot(to.x-from.x,to.y-from.y)||1;return {x:(to.x-from.x)/n*d,y:(to.y-from.y)/n*d};};
      const ta=tangent(prev,b),tb=tangent(a,next);
      for(let j=0;j<count;j++){
        const t=j/count,h00=2*t*t*t-3*t*t+1,h10=t*t*t-2*t*t+t,h01=-2*t*t*t+3*t*t,h11=t*t*t-t*t;
        dense.push({x:h00*a.x+h10*ta.x+h01*b.x+h11*tb.x,y:h00*a.y+h10*ta.y+h01*b.y+h11*tb.y,z:mix(a.z,b.z,t),widthLeft:mix(a.widthLeft,b.widthLeft,t),widthRight:mix(a.widthRight,b.widthRight,t),bank:mix(a.bank,b.bank,t)});
      }
    }
    dense.push({...anchors.at(-1)});
    let distance=0;for(let i=0;i<dense.length;i++){if(i)distance+=Math.hypot(dense[i].x-dense[i-1].x,dense[i].y-dense[i-1].y);dense[i].s=distance;}
    const length=distance,step=.75,points=[];let cursor=0;
    function rawAt(s){while(cursor<dense.length-2&&dense[cursor+1].s<s)cursor++;const a=dense[cursor],b=dense[cursor+1],t=clamp((s-a.s)/(b.s-a.s||1),0,1);return {x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t),widthLeft:mix(a.widthLeft,b.widthLeft,t),widthRight:mix(a.widthRight,b.widthRight,t),bank:mix(a.bank,b.bank,t),s};}
    for(let s=0;s<length;s+=step)points.push(rawAt(s));points.push(rawAt(length));
    for(let i=0;i<points.length;i++){
      const a=points[Math.max(0,i-4)],p=points[i],b=points[Math.min(points.length-1,i+4)];
      p.heading=Math.atan2(b.y-a.y,b.x-a.x);p.grade=(b.z-a.z)/(Math.hypot(b.x-a.x,b.y-a.y)||1);
      const den=Math.hypot(p.x-a.x,p.y-a.y)*Math.hypot(b.x-p.x,b.y-p.y)*Math.hypot(b.x-a.x,b.y-a.y);
      p.curvature=den>1e-9?2*((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))/den:0;
    }
    function sample(s){s=clamp(s,0,length);const i=Math.min(points.length-2,Math.floor(s/step)),a=points[i],b=points[i+1],t=(s-a.s)/(b.s-a.s);const p={s};for(const k of ['x','y','z','grade','bank','curvature','widthLeft','widthRight'])p[k]=mix(a[k],b[k],t);p.heading=a.heading+wrap(b.heading-a.heading)*t;return p;}
    function project(x,y,hint){
      let first=0,last=points.length-2;
      if(Number.isFinite(hint)){const i=Math.floor(hint/step);first=Math.max(0,i-35);last=Math.min(last,i+60);}
      let best={distance:Infinity,s:0,error:0,index:0},best2=Infinity;
      for(let i=first;i<=last;i++){
        const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
        const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(l2||1),i===0?-12/step:0,i===points.length-2?1+12/step:1),px=a.x+t*dx,py=a.y+t*dy,d2=(x-px)**2+(y-py)**2;
        if(d2<best2){best2=d2;best={s:mix(a.s,b.s,t),index:i,x:px,y:py,dx,dy,l2};}
      }
      best.distance=Math.sqrt(best2);best.error=((x-best.x)*-best.dy+(y-best.y)*best.dx)/Math.sqrt(best.l2);best.heading=Math.atan2(best.dy,best.dx);delete best.dx;delete best.dy;delete best.l2;
      return best;
    }
    const frozenPolygon=points=>Object.freeze(points.map(p=>Object.freeze({...p})));
    const boundaryPolygons=Object.freeze((data.boundaryPolygons||[]).map(frozenPolygon));
    const excludedPolygons=Object.freeze((data.excludedPolygons||[]).map(frozenPolygon));
    const obstacles=Object.freeze((data.obstacles||[]).map(o=>Object.freeze(o.type==='polygon'?{...o,points:frozenPolygon(o.points)}:{...o})));
    function contains(x,y,hint){
      const q=project(x,y,hint);if(q.s< -10||q.s>length+10)return false;
      if(excludedPolygons.some(p=>inPolygon(x,y,p)))return false;
      if(boundaryPolygons.length)return boundaryPolygons.some(p=>inPolygon(x,y,p));
      const p=sample(q.s);return q.error>=-p.widthRight-1e-6&&q.error<=p.widthLeft+1e-6;
    }
    function surface(x,y,hint){
      const q=project(x,y,hint),p=sample(q.s),cross=Math.tan(p.bank),c=Math.cos(p.heading),sn=Math.sin(p.heading);
      const gradientX=p.grade*c-cross*sn,gradientY=p.grade*sn+cross*c;
      return {z:p.z+cross*q.error,gradientX,gradientY,normalZ:1/Math.sqrt(1+gradientX*gradientX+gradientY*gradientY),muScale:1};
    }
    const judgedStart=data.judgedStart,judgedEnd=data.judgedEnd;
    if(!(judgedStart>=0&&judgedEnd>judgedStart&&judgedEnd<=length))throw Error('Invalid scoring interval.');
    const signature=[clamp,mix,wrap,inPolygon,build].map(String).join('\n').replace(/\r\n/g,'\n');
    return {...data,length,points,sample,project,contains,surface,geometrySignature:signature,boundaryPolygons,excludedPolygons,
      width:data.width||Math.min(...points.map(p=>p.widthLeft+p.widthRight)),zones:data.zones||[],obstacles,environment:data.environment||{},dataVersion:data.version||1};
  }
  const api={build,inPolygon};root.DriftCourseModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
