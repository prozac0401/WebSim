/* Photo-referenced pit architecture and service areas. Footprints are curated;
 * heights and details are estimates, and do not change race simulation routes. */
(function(root){
  'use strict';
  const terrainMesh=root.TrackEnvironment||(typeof require==='function'?require('./track-environment.js'):null);
  const EPS=1e-7,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const point=(x,y,z=0)=>({x,y,z}),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value||'')?value:fallback;
  const bounds=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  function closest(a,b,p){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return{x:a.x+t*dx,y:a.y+t*dy,z:(a.z||0)+t*((b.z||0)-(a.z||0)),distance:Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)};}
  function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
  function triangulate(ring){
    const p=ring.slice();if(p.reduce((s,a,i)=>s+a.x*p[(i+1)%p.length].y-p[(i+1)%p.length].x*a.y,0)<0)p.reverse();
    const ids=p.map((_,i)=>i),out=[];let guard=p.length*p.length;
    while(ids.length>3&&guard-->0){let found=false;for(let i=0;i<ids.length;i++){const a=p[ids[(i+ids.length-1)%ids.length]],b=p[ids[i]],c=p[ids[(i+1)%ids.length]];if(cross(a,b,c)<=EPS)continue;
      if(ids.some((id,j)=>j!==i&&j!==(i+1)%ids.length&&j!==(i+ids.length-1)%ids.length&&cross(a,b,p[id])>=-EPS&&cross(b,c,p[id])>=-EPS&&cross(c,a,p[id])>=-EPS))continue;
      out.push([a,b,c]);ids.splice(i,1);found=true;break;}if(!found)break;}
    if(ids.length===3)out.push(ids.map(i=>p[i]));return out;
  }
  function refine(triangles,size,height){const out=[];function split(t,depth=0){const lengths=t.map((a,i)=>distance(a,t[(i+1)%3])),longest=Math.max(...lengths);if(longest>size&&depth<15){const i=lengths.indexOf(longest),a=t[i],b=t[(i+1)%3],c=t[(i+2)%3],m=point((a.x+b.x)/2,(a.y+b.y)/2);split([a,m,c],depth+1);split([m,b,c],depth+1);}else out.push({vertices:t});}triangles.forEach(t=>split(t));return terrainMesh.conformTerrain(out,height).faces.map(f=>f.vertices);}
  function lineInfo(line){const cumulative=[0];for(let i=1;i<line.length;i++)cumulative.push(cumulative.at(-1)+distance(line[i-1],line[i]));return{length:cumulative.at(-1),at(s){s=clamp(s,0,cumulative.at(-1));let i=1;while(i<line.length-1&&cumulative[i]<s)i++;const a=line[i-1],b=line[i],d=cumulative[i]-cumulative[i-1],t=d>EPS?(s-cumulative[i-1])/d:0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,dx:(b.x-a.x)/(d||1),dy:(b.y-a.y)/(d||1)};}};}
  function build(track,data){
    data=data||{features:[],sources:[]};const projection=track.projection,geographic=(data.coordinateSystem||'wgs84')==='wgs84';
    const project=c=>{if(!Array.isArray(c)||!Number.isFinite(c[0])||!Number.isFinite(c[1]))throw Error('Invalid pit coordinate');if(!geographic)return point(c[0],c[1]);if(!projection)throw Error('Pit data needs geographic projection');return point(((c[0]-projection.origin[0])*projection.metresPerDegree*Math.cos(projection.latitudeRad)-projection.offset.x)*projection.scale,(-(c[1]-projection.origin[1])*projection.metresPerDegree-projection.offset.y)*projection.scale);};
    const faces=[],groups=new Map(),occupied=[],focusPoints=[],buildings=[],laneLines=[],heightCache=new Map();
    const stats={features:0,buildings:0,garages:0,lanes:0,boxes:0,faces:0,rejected:0,estimatedHeights:true},sourceIds=new Set((data.sources||[]).map(s=>s.id));
    const heightAt=(x,y)=>{const key=x.toFixed(5)+','+y.toFixed(5);if(heightCache.has(key))return heightCache.get(key);let nearest=null;const p=point(x,y);for(let i=0;i<track.points.length;i++){const q=closest(track.points[i],track.points[(i+1)%track.points.length],p);if(!nearest||q.distance<nearest.distance)nearest=q;}heightCache.set(key,nearest.z);return nearest.z;};
    function face(vertices,fill,kind,id){if(vertices.length<3||vertices.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw Error('Non-finite pit mesh');const center=vertices.reduce((c,p)=>point(c.x+p.x/vertices.length,c.y+p.y/vertices.length,c.z+p.z/vertices.length),point(0,0));const key=Math.floor(center.x/96)+','+Math.floor(center.y/96);if(!groups.has(key))groups.set(key,{faces:[],bounds:{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}});const group=groups.get(key),item={vertices,fill,kind,featureId:id};group.faces.push(item);faces.push(item);for(const p of vertices){const b=group.bounds;b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);}}
    function ribbon(line,width,fill,kind,id,lift=.035){
      const expanded=[line[0]];for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],steps=Math.max(1,Math.ceil(distance(a,b)/6));for(let j=1;j<=steps;j++)expanded.push(point(a.x+(b.x-a.x)*j/steps,a.y+(b.y-a.y)*j/steps));}
      const pairs=expanded.map((p,i)=>{const a=expanded[Math.max(0,i-1)],b=expanded[Math.min(expanded.length-1,i+1)],d=distance(a,b)||1,nx=-(b.y-a.y)/d*width/2,ny=(b.x-a.x)/d*width/2;return[point(p.x+nx,p.y+ny,heightAt(p.x+nx,p.y+ny)+lift),point(p.x-nx,p.y-ny,heightAt(p.x-nx,p.y-ny)+lift)];});
      for(let i=1;i<pairs.length;i++)face([pairs[i-1][0],pairs[i][0],pairs[i][1],pairs[i-1][1]],fill,kind,id);return pairs;
    }
    function outline(ring,fill,id,lift=.075,width=.16){for(let i=0;i<ring.length;i++)ribbon([ring[i],ring[(i+1)%ring.length]],width,fill,'pit-marking',id,lift);}
    function surface(ring,fill,kind,id){for(const t of refine(triangulate(ring),15,(x,y)=>heightAt(x,y)+.025))face(t,fill,kind,id);}
    function building(ring,p,id){
      const h=clamp(Number(p.height)||7,2.5,36),base=Math.max(...ring.map(q=>heightAt(q.x,q.y))),roof=base+h,wall=color(p.wallColor,'#d3d1c5'),roofColor=color(p.roofColor,'#8c969b');
      const edge=clamp(Math.round(Number(p.garageEdge)||0),0,ring.length-1),a=ring[edge],b=ring[(edge+1)%ring.length],length=distance(a,b)||1,ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
      const center=ring.reduce((c,q)=>point(c.x+q.x/ring.length,c.y+q.y/ring.length),point(0,0));let nx=-uy,ny=ux;if((center.x-a.x)*nx+(center.y-a.y)*ny>0){nx=-nx;ny=-ny;}
      const extents=ring.map(q=>({u:(q.x-a.x)*ux+(q.y-a.y)*uy,v:-(q.x-a.x)*nx-(q.y-a.y)*ny})),umin=Math.min(...extents.map(q=>q.u)),umax=Math.max(...extents.map(q=>q.u)),vmin=Math.min(...extents.map(q=>q.v)),vmax=Math.max(...extents.map(q=>q.v));
      const rise=clamp(Number(p.roofRise)||0,0,12),style=p.roofStyle||'flat';
      function roofHeight(x,y){const u=clamp(((x-a.x)*ux+(y-a.y)*uy-umin)/Math.max(1,umax-umin),0,1),v=clamp((-(x-a.x)*nx-(y-a.y)*ny-vmin)/Math.max(1,vmax-vmin),0,1);let factor=0;if(style==='pitched')factor=1-Math.abs(v*2-1);else if(style==='sawtooth'||style==='wing'){const t=u*Math.max(1,Math.min(8,Number(p.roofSections)||3)),wave=1-Math.abs((t-Math.floor(t))*2-1);factor=style==='wing'?(.25+.75*wave)*(1-v*.45):wave;}return roof+rise*factor;}
      for(let i=0;i<ring.length;i++){if(i===edge)continue;const q=ring[i],r=ring[(i+1)%ring.length],steps=Math.max(1,Math.ceil(distance(q,r)/8));for(let j=0;j<steps;j++){const v=point(q.x+(r.x-q.x)*j/steps,q.y+(r.y-q.y)*j/steps),w=point(q.x+(r.x-q.x)*(j+1)/steps,q.y+(r.y-q.y)*(j+1)/steps);face([point(v.x,v.y,heightAt(v.x,v.y)),point(w.x,w.y,heightAt(w.x,w.y)),point(w.x,w.y,roofHeight(w.x,w.y)),point(v.x,v.y,roofHeight(v.x,v.y))],color(p.sideColor,wall),'pit-building',id);}}
      for(const t of refine(triangulate(ring),style==='flat'?24:6,roofHeight))face(t,roofColor,'pit-roof',id);
      const onFront=(u,z,offset=0)=>point(a.x+ux*u+nx*offset,a.y+uy*u+ny*offset,z),openings=[];
      const bays=Math.min(80,Math.max(0,Math.round(Number(p.garageCount)||0))),doorHeight=Math.min(4,h*.62);
      for(let i=0;i<bays;i++){const left=length*(i+.12)/bays,right=length*(i+.88)/bays,front=onFront((left+right)/2,0),bottom=heightAt(front.x,front.y)+.10;openings.push({left,right,bottom,top:bottom+doorHeight,fill:color(p.doorColor,'#46545b'),kind:'pit-garage'},{left,right,bottom:bottom+doorHeight,top:bottom+doorHeight+.12,fill:'#e7e8df',kind:'pit-garage-trim'});}
      const panels=Math.max(1,Math.ceil(length/6));
      if(p.windowBand){const bottom=base+Math.max(doorHeight+.45,h*.45),top=base+h*.88;for(let i=0;i<panels;i++){const left=Math.max(.4,length*i/panels+.07),right=Math.min(length-.4,length*(i+1)/panels-.07);if(right>left&&top>bottom)openings.push({left,right,bottom,top,fill:color(p.glassColor,'#567c91'),kind:'pit-window'});}}
      // Partition the facade around its openings instead of layering glass and
      // doors over a long coplanar wall, which a painter's depth sort can hide.
      const cuts=[...new Set([0,length,...Array.from({length:panels+1},(_,i)=>length*i/panels),...openings.flatMap(o=>[o.left,o.right])])].sort((x,y)=>x-y);
      for(let i=1;i<cuts.length;i++){const left=cuts[i-1],right=cuts[i];if(right-left<EPS)continue;const l=onFront(left,0),r=onFront(right,0),low=[heightAt(l.x,l.y),heightAt(r.x,r.y)],high=[roofHeight(l.x,l.y),roofHeight(r.x,r.y)];let bottom=low;
        const panel=(from,to,fill,kind)=>{if(to.some((z,j)=>z>from[j]+EPS))face([onFront(left,from[0]),onFront(right,from[1]),onFront(right,to[1]),onFront(left,to[0])],fill,kind,id);};
        for(const o of openings.filter(o=>o.left<=(left+right)/2&&o.right>=(left+right)/2).sort((x,y)=>x.bottom-y.bottom)){const lo=bottom.map((z,j)=>clamp(o.bottom,z,high[j])),hi=lo.map((z,j)=>clamp(o.top,z,high[j]));panel(bottom,lo,wall,'pit-building');panel(lo,hi,o.fill,o.kind);bottom=hi;}
        panel(bottom,high,wall,'pit-building');
      }
      const canopy=clamp(Number(p.canopyDepth)||0,0,12);if(canopy>0){const z=base+Math.min(h*.64,5);for(let i=0;i<panels;i++){const left=length*i/panels,right=length*(i+1)/panels;face([onFront(left,z,0),onFront(right,z,0),onFront(right,z,canopy),onFront(left,z,canopy)],roofColor,'pit-canopy',id);}}
      stats.buildings++;stats.garages+=bays;focusPoints.push(...ring);occupied.push({ring});
      buildings.push({id,ring,normal:point(nx,ny),height:h,area:Math.abs(ring.reduce((sum,q,i)=>sum+q.x*ring[(i+1)%ring.length].y-q.y*ring[(i+1)%ring.length].x,0))/2});
    }
    for(const f of data.features||[]){
      const p=f.properties||{},g=f.geometry,id=f.id||'pit-'+stats.features;if(!g||!p.kind||!p.sourceId||!sourceIds.has(p.sourceId)||!p.evidence){stats.rejected++;continue;}
      let coords;try{coords=(g.type==='Polygon'?g.coordinates[0]:g.coordinates).map(project);}catch(_){stats.rejected++;continue;}
      if(g.type==='Polygon'&&coords.length>1&&distance(coords[0],coords.at(-1))<EPS)coords.pop();
      if(coords.length<(g.type==='Polygon'?3:2)){stats.rejected++;continue;}stats.features++;
      if(p.kind==='pit-building'&&g.type==='Polygon')building(coords,p,id);
      else if(p.kind==='pit-apron'&&g.type==='Polygon'){surface(coords,color(p.color,'#6d746f'),p.kind,id);occupied.push({ring:coords});focusPoints.push(...coords);}
      else if(p.kind==='pit-lane'&&g.type==='LineString'){
        const width=clamp(Number(p.width)||6,2,24),pairs=ribbon(coords,width,color(p.color,'#68726f'),p.kind,id);if(p.edgeMarkings)for(const side of [0,1])ribbon(pairs.map(pair=>pair[side]),.13,color(p.markingColor,'#f1eee2'),'pit-marking',id,.065);
        occupied.push({line:coords,radius:width/2});laneLines.push(coords);stats.lanes++;
      }else if(p.kind==='pit-wall'&&g.type==='LineString'){
        const h=clamp(Number(p.height)||1.1,.25,5),width=clamp(Number(p.width)||.35,.1,1),pairs=ribbon(coords,width,color(p.color,'#e0ddcf'),'pit-wall-base',id,.03);
        for(let i=1;i<pairs.length;i++){const ring=[pairs[i-1][0],pairs[i][0],pairs[i][1],pairs[i-1][1]],top=ring.map(q=>point(q.x,q.y,q.z+h));for(let k=0;k<4;k++)face([ring[k],ring[(k+1)%4],top[(k+1)%4],top[k]],color(p.color,'#d6d5cb'),'pit-wall',id);face(top,color(p.capColor,'#eeeade'),'pit-wall',id);}
      }else if(p.kind==='pit-box'&&g.type==='Polygon'){outline(coords,color(p.color,'#f3d56f'),id);stats.boxes++;focusPoints.push(...coords);}
      else if(p.kind==='pit-box-row'&&g.type==='LineString'){
        const info=lineInfo(coords),n=Math.max(1,Math.min(100,Math.round(Number(p.bayCount)||1))),depth=clamp(Number(p.depth)||5,2,18),side=p.side==='left'?-1:1;
        for(let i=0;i<n;i++){const a=info.at(info.length*i/n),b=info.at(info.length*(i+1)/n),nx=-(a.dy+b.dy)*.5*side,ny=(a.dx+b.dx)*.5*side,norm=Math.hypot(nx,ny)||1,ring=[a,b,point(b.x+nx/norm*depth,b.y+ny/norm*depth),point(a.x+nx/norm*depth,a.y+ny/norm*depth)];outline(ring,color(p.color,'#f3d56f'),id);stats.boxes++;focusPoints.push(...ring);}
      }else {stats.features--;stats.rejected++;}
    }
    const allGroups=[...groups.values()],allPoints=faces.flatMap(f=>f.vertices),worldBounds=allPoints.length?bounds(allPoints):null;
    // Separate complexes (e.g. Wing/National) should not shrink both into a
    // whole-circuit view. Start at the main photographed facade and its neighbours.
    const primary=buildings.find(b=>b.id===data.metadata?.focusFeatureId)||[...buildings].sort((a,b)=>b.area-a.area)[0],cluster=primary?[primary]:[];
    if(primary){let changed=true;while(changed){changed=false;for(const b of buildings){if(cluster.includes(b))continue;if(cluster.some(other=>b.ring.some(p=>other.ring.some((q,i)=>closest(q,other.ring[(i+1)%other.ring.length],p).distance<45)))){cluster.push(b);changed=true;}}}}
    const focusBounds=cluster.length?bounds(cluster.flatMap(b=>b.ring)):focusPoints.length?bounds(focusPoints):worldBounds;let focus=null;
    if(focusBounds){const x=(focusBounds.minX+focusBounds.maxX)/2,y=(focusBounds.minY+focusBounds.maxY)/2;const line=laneLines[0],heading=line?Math.atan2(line.at(-1).y-line[0].y,line.at(-1).x-line[0].x):0;focus={target:point(x,y,heightAt(x,y)+3),distance:Math.max(80,Math.hypot(focusBounds.maxX-focusBounds.minX,focusBounds.maxY-focusBounds.minY)*1.05),heading,yaw:primary?Math.atan2(-primary.normal.x,primary.normal.y)+.25:heading+Math.PI/2,bounds:focusBounds};}
    function contains(x,y,margin=0){const p=point(x,y);return occupied.some(area=>area.ring?(inside(p,area.ring)||area.ring.some((a,i)=>closest(a,area.ring[(i+1)%area.ring.length],p).distance<margin)):area.line.some((b,i)=>i>0&&closest(area.line[i-1],b,p).distance<area.radius+margin));}
    stats.faces=faces.length;return{data,stats,faces,groups:allGroups,bounds:worldBounds,focus,contains,groundHeight:heightAt,query:(x,y,radius=440)=>allGroups.filter(g=>Math.hypot(Math.max(g.bounds.minX-x,0,x-g.bounds.maxX),Math.max(g.bounds.minY-y,0,y-g.bounds.maxY))<=radius)};
  }
  const api={build};root.PitFacilities=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
