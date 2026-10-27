/* Old, illustrative tyre traces, not live telemetry or a measured rubber map.
 * Deterministic road-centreline curves overlap near demanding bends. Each
 * fragment is clipped to unpainted asphalt and follows its actual triangle. */
(function(root){
  'use strict';
  const MAX_FACES=6000,MAX_ZONES=8,LIFT=.008,CELL=16,EPS=1e-8;
  const mod=(s,l)=>((s%l)+l)%l,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const turn=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const area=v=>v.reduce((n,p,i)=>n+p.x*v[(i+1)%v.length].y-p.y*v[(i+1)%v.length].x,0)/2;
  const bounds=v=>({minX:Math.min(...v.map(p=>p.x)),minY:Math.min(...v.map(p=>p.y)),maxX:Math.max(...v.map(p=>p.x)),maxY:Math.max(...v.map(p=>p.y))});
  function random(seed){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return(h>>>0)/4294967296;};}
  function clip(poly,triangle){
    let out=poly;
    for(let j=0;j<3&&out.length;j++){
      const a=triangle[j],b=triangle[(j+1)%3],next=[];
      for(let i=0;i<out.length;i++){
        const p=out[i],q=out[(i+1)%out.length],u=cross(a,b,p),v=cross(a,b,q);
        if(u>=-EPS)next.push(p);
        if(u>EPS&&v<-EPS||u<-EPS&&v>EPS){const t=u/(u-v);next.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}
      }
      out=next;
    }
    return out.length>=3&&Math.abs(area(out))>1e-7?out:[];
  }
  function subtract(poly,triangle){
    const outside=[];let inside=poly;
    for(let j=0;j<3&&inside.length;j++){
      const a=triangle[j],b=triangle[(j+1)%3],keep=[],rest=[];
      for(let i=0;i<inside.length;i++){
        const p=inside[i],q=inside[(i+1)%inside.length],u=cross(a,b,p),v=cross(a,b,q);
        if(u>=-EPS)keep.push(p);if(u<=EPS)rest.push(p);
        if(u>EPS&&v<-EPS||u<-EPS&&v>EPS){const t=u/(u-v),cut={x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};keep.push(cut);rest.push(cut);}
      }
      if(rest.length>=3&&Math.abs(area(rest))>1e-7)outside.push(rest);inside=keep;
    }
    return outside;
  }
  // Fixed-metre chords also work on the legacy offset ribbon, whose sample
  // has no analytic curvature. No car, weather, tuned line or lap state enters.
  function zones(road,length){
    const count=Math.ceil(length/8),step=length/count,samples=[];
    for(let i=0;i<count;i++){
      const s=i*step,a=road.sample(s-12),p=road.sample(s),b=road.sample(s+12);
      samples.push({s,k:turn(Math.atan2(b.y-p.y,b.x-p.x)-Math.atan2(p.y-a.y,p.x-a.x))/12});
    }
    const candidates=[];
    for(let i=0;i<count;i++){
      const p=samples[i],k=Math.abs(p.k);
      const previous=Math.abs(samples[mod(i-1,count)].k),next=Math.abs(samples[(i+1)%count].k);
      if(k<.009||k<previous-1e-6||k<next-1e-6||k-Math.min(previous,next)<1e-6)continue;
      let a=i,b=i;
      while(i-a<14){const q=samples[mod(a-1,count)];if(q.k*p.k<=0||Math.abs(q.k)<Math.max(.0035,k*.22))break;a--;}
      while(b-i<14){const q=samples[mod(b+1,count)];if(q.k*p.k<=0||Math.abs(q.k)<Math.max(.0035,k*.22))break;b++;}
      // Integrate wrapped samples, including a bend at the timing seam.
      let rotation=0;for(let j=a;j<=b;j++)rotation+=Math.abs(samples[mod(j,count)].k)*step;
      if(rotation<.32)continue;
      candidates.push({stationM:p.s,startM:Math.max(a*step-22,p.s-62),endM:Math.min(b*step+16,p.s+48),sign:Math.sign(p.k),curvature:k,rotationRad:rotation,
        strength:clamp((k-.006)/.025,.25,1),kind:rotation>1.8?'hairpin':'corner',score:k*Math.sqrt(rotation)});
    }
    const picked=[];
    for(const c of candidates.sort((a,b)=>b.score-a.score||a.stationM-b.stationM)){
      if(picked.some(p=>{
        const distance=Math.abs(turn((c.stationM-p.stationM)/length*Math.PI*2))*length/(Math.PI*2);
        // Keep both opposite turns of a close chicane; reject multiple peaks
        // inside one broad same-direction bend rather than spending marks twice.
        return distance<(p.sign===c.sign?Math.max(65,Math.min(p.endM-p.startM,c.endM-c.startM)*.72):25);
      }))continue;
      picked.push(c);if(picked.length===MAX_ZONES)break;
    }
    picked.sort((a,b)=>a.stationM-b.stationM);
    for(const p of picked)if(picked.some(q=>q!==p&&q.sign!==p.sign&&Math.min(mod(q.stationM-p.stationM,length),mod(p.stationM-q.stationM,length))<190))p.kind='chicane';
    return picked;
  }
  function build(asphalt,road,{length,width,id='circuit',protectedFaces=[]}={}){
    const stats={classification:'illustrative pre-existing tyre traces',zones:0,passes:0,tracks:0,faces:0,maximumFaces:MAX_FACES,liftM:LIFT,limitReached:false};
    if(!Array.isArray(asphalt)||!road?.edges?.length||typeof road.sample!=='function'||!Number.isFinite(length)||length<20||!Number.isFinite(width)||width<3)return{faces:[],zones:[],stats};
    const selected=zones(road,length),faces=[],cells=new Map(),paintCells=new Map();
    const visit=(b,fn)=>{for(let x=Math.floor(b.minX/CELL);x<=Math.floor(b.maxX/CELL);x++)for(let y=Math.floor(b.minY/CELL);y<=Math.floor(b.maxY/CELL);y++)fn(x+','+y);};
    for(let sourceFace=0;sourceFace<asphalt.length;sourceFace++){
      const face=asphalt[sourceFace];if(!face.road||face.kind!=='road-asphalt')continue;
      for(let i=1;i<face.vertices.length-1;i++){
        let vertices=[face.vertices[0],face.vertices[i],face.vertices[i+1]];const d=cross(...vertices);if(Math.abs(d)<EPS)continue;
        if(d<0)vertices=[vertices[0],vertices[2],vertices[1]];
        const t={vertices,sourceFace,denominator:Math.abs(d)},b=bounds(vertices);
        visit(b,key=>{if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);});
      }
    }
    for(const face of protectedFaces)for(let i=1;i<face.vertices.length-1;i++){
      let v=[face.vertices[0],face.vertices[i],face.vertices[i+1]];const d=cross(...v);if(Math.abs(d)<EPS)continue;if(d<0)v=[v[0],v[2],v[1]];
      visit(bounds(v),key=>{if(!paintCells.has(key))paintCells.set(key,[]);paintCells.get(key).push(v);});
    }
    function drape(vertices,fill,zoneId,trackId){
      const found=new Set(),paint=new Set();visit(bounds(vertices),key=>{for(const t of cells.get(key)||[])found.add(t);for(const t of paintCells.get(key)||[])paint.add(t);});
      const out=[];
      for(const t of found){
        const polygon=clip(vertices,t.vertices);if(!polygon.length)continue;
        const [a,b,c]=t.vertices;
        let pieces=[polygon];for(const mask of paint)pieces=pieces.flatMap(p=>clip(p,mask).length?subtract(p,mask):[p]);
        for(const piece of pieces)out.push({vertices:piece.map(p=>{const u=cross(b,c,p)/t.denominator,v=cross(c,a,p)/t.denominator;return{x:p.x,y:p.y,z:u*a.z+v*b.z+(1-u-v)*c.z+LIFT};}),
          fill,road:true,kind:'road-skidmark',zoneId,trackId,sourceFace:t.sourceFace,estimated:true});
      }
      return out;
    }
    // Round-robin passes give every selected bend some history before extra
    // traces are added. A pair is atomic when the fixed geometry cap is met.
    for(let pass=0;pass<7;pass++)for(let zoneId=0;zoneId<selected.length;zoneId++){
      const zone=selected[zoneId],rng=random(id+':'+zoneId+':'+pass),target=zone.kind==='hairpin'||zone.kind==='chicane'?7:5;
      if(pass>=target)continue;
      const start=zone.startM+(rng()-.5)*22,end=zone.endM+(rng()-.5)*18,span=end-start;
      const safe=Math.max(.2,width/2-1.35),outside=-zone.sign*safe*(.24+rng()*.48),inside=zone.sign*safe*(.20+rng()*.48),exit=-zone.sign*safe*(.08+rng()*.48);
      const phase=(rng()-.5)*.26,wandering=(rng()-.5)*1.05,tire=.18+rng()*.13,gauge=1.36+rng()*.24,opacity=(.045+rng()*.045)*(.65+.35*zone.strength),pending=[];
      const n=Math.ceil(span/5),path=(t,side)=>{
        const s=start+span*t,p=road.sample(s),apex=clamp((zone.stationM-start)/span+phase,.25,.75),u=t<apex?t/apex:(1-t)/(1-apex);
        const blend=.5-.5*Math.cos(Math.PI*clamp(u,0,1)),base=outside+(exit-outside)*t,offset=clamp(base+(inside-base)*blend+wandering*Math.sin(Math.PI*2*t)*Math.sin(Math.PI*t)+side*gauge/2,-width/2+.42,width/2-.42);
        return{x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,s};
      };
      for(const side of [-1,1]){
        const points=Array.from({length:n+1},(_,i)=>path(i/n,side)),left=[],right=[];
        for(let i=0;i<=n;i++){
          const a=points[Math.max(0,i-1)],b=points[Math.min(n,i+1)],run=Math.hypot(b.x-a.x,b.y-a.y)||1;
          const fade=Math.min(1,i/3,(n-i)/3),w=tire*(.35+.65*fade)/2;
          left.push({x:points[i].x-(b.y-a.y)/run*w,y:points[i].y+(b.x-a.x)/run*w});
          right.push({x:points[i].x+(b.y-a.y)/run*w,y:points[i].y-(b.x-a.x)/run*w});
        }
        for(let i=0;i<n;i++){
          const t=(i+.5)/n,fade=Math.min(1,t/.16,(1-t)/.20),wear=.78+.22*Math.sin((t*3+pass*.31)*Math.PI)**2;
          const alpha=opacity*fade*wear;if(alpha<.009)continue;
          pending.push(...drape([left[i],left[i+1],right[i+1],right[i]],'rgba(0,0,0,'+alpha.toFixed(3)+')',zoneId,zoneId+':'+pass+':'+side));
        }
      }
      if(faces.length+pending.length>MAX_FACES){stats.limitReached=true;continue;}
      if(pending.length){faces.push(...pending);stats.passes++;stats.tracks+=2;zone.passes=(zone.passes||0)+1;}
    }
    stats.zones=selected.filter(z=>z.passes).length;stats.faces=faces.length;
    return{faces,zones:selected,stats};
  }
  const api={build};root.RoadSkidmarks=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
