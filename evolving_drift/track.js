/* Synthetic development course. Metres, x east, y north, positive yaw CCW. */
(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function create(){
    const ds=.75,length=500,points=[];let x=0,y=0,heading=0;
    for(let s=0;s<=length+ds;s+=ds){
      s=Math.min(s,length);
      const curvature=s>120&&s<420?.028*Math.sin(3*Math.PI*(s-120)/300):0;
      if(points.length){const step=s-points[points.length-1].s,h=heading+curvature*step/2;x+=Math.cos(h)*step;y+=Math.sin(h)*step;heading+=curvature*step;}
      points.push({x,y,s,heading,curvature});if(s===length)break;
    }
    function sample(s){s=clamp(s,0,length);let i=Math.min(points.length-2,Math.floor(s/ds));const a=points[i],b=points[i+1],u=(s-a.s)/(b.s-a.s);return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,s,heading:a.heading+(b.heading-a.heading)*u,curvature:a.curvature+(b.curvature-a.curvature)*u};}
    function project(x,y,hint){
      let first=0,last=points.length-2;
      if(Number.isFinite(hint)){const i=Math.floor(hint/ds);first=Math.max(0,i-28);last=Math.min(last,i+45);}
      let best={distance:Infinity,s:0,error:0,index:0};
      for(let i=first;i<=last;i++){
        const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
        const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/l2,i===0?-12/ds:0,i===points.length-2?1+12/ds:1);
        const px=a.x+t*dx,py=a.y+t*dy,d=Math.hypot(x-px,y-py);
        if(d<best.distance)best={distance:d,s:a.s+t*(b.s-a.s),error:((x-px)*(-dy)+(y-py)*dx)/Math.sqrt(l2),index:i,x:px,y:py,heading:Math.atan2(dy,dx)};
      }return best;
    }
    const zones=[{s:170,side:-1},{s:270,side:1},{s:370,side:-1}];
    const obstacles=[205,305].map((s,i)=>{const p=sample(s),side=i?1:-1;return {x:p.x-Math.sin(p.heading)*6.7*side,y:p.y+Math.cos(p.heading)*6.7*side,r:.4,s};});
    return {id:'development-s500',name:'S500 · 가상 개발 코스',description:'가상 코스 · 진입 120m / 채점 300m / 감속 80m',kind:'development',verifiedCompetition:false,length,width:14,points,zones,obstacles,judgedStart:120,judgedEnd:420,sample,project,source:'직접 설계한 가상 코스. 실제 KDS/KDGP 배치가 아닙니다.'};
  }
  // Only event layouts with reviewed evidence belong in the public registry.
  // create() intentionally remains a deterministic fixture for physics tests.
  const model=root.DriftCourseModel||(typeof require==='function'?require('./course-model.js'):null);
  const kic=root.DriftKicT21||(typeof require==='function'?require('./kic-t21.js'):null);
  const inje=root.DriftInjeSdc||(typeof require==='function'?require('./inje-sdc.js'):null);
  const permanent=root.DriftKicSdc||(typeof require==='function'?require('./kic-sdc.js'):null);
  const ebisu=root.DriftEbisuWest||(typeof require==='function'?require('./ebisu-west.js'):null);
  const tsukuba=root.DriftTsukubaD1||(typeof require==='function'?require('./tsukuba-d1.js'):null);
  const factories=Object.freeze({
    'kr-kic-t21-kdl-2016-r2':()=>model.build(kic),
    'kr-inje-b-sdc-2018-r1':()=>model.build(inje),
    'kr-kic-permanent-sdc-2017-r2':()=>model.build(permanent),
    'jp-ebisu-west-d1gp-2025':()=>model.build(ebisu),
    'jp-tsukuba-d1gp-2025':()=>model.build(tsukuba)
  }),developmentFactories=Object.freeze({'development-s500':create});
  const DEFAULT_ID=Object.keys(factories)[0]||null,DEVELOPMENT_ID='development-s500';
  function list({includeDevelopment=false}={}){return Object.values(includeDevelopment===true?{...factories,...developmentFactories}:factories).map(factory=>factory());}
  function get(id=DEFAULT_ID,{includeDevelopment=false}={}){
    if(!id)throw new Error('검증된 실전 코스가 없습니다. 국내 대회 코스를 고증하고 있습니다.');
    const factory=factories[id]||(includeDevelopment===true?developmentFactories[id]:null);
    if(!factory)throw new Error('검증된 실전 코스가 아니거나 등록되지 않은 코스입니다: '+id);
    return factory();
  }
  root.DriftTrack={create,list,get,DEFAULT_ID,DEVELOPMENT_ID};if(typeof module!=='undefined')module.exports=root.DriftTrack;
})(typeof window==='undefined'?globalThis:window);
