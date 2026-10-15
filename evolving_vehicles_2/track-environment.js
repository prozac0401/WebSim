/* Cited scenery footprints plus explicitly illustrative background vegetation.
 * Off-road elevation, individual trees and wall heights are estimates.
 * Background trees never replace an observed surface or a mapped pit facility. */
(function (root) {
  'use strict';
  const CELL = 96, ROAD_CELL = 64, EPS = 1e-7;
  const COLORS = { grass: '#6c8050', forest: '#526749', gravel: '#b5a98b', sand: '#c8b384', asphalt: '#686c68', 'painted-runoff': '#327960' };
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const point = (x,y,z=0) => ({x,y,z});
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  function seeded(seed) { let s=2166136261; for(const c of String(seed)) s=Math.imul(s^c.charCodeAt(0),16777619); return () => {s=(s+0x6D2B79F5)|0; let t=Math.imul(s^s>>>15,1|s); t^=t+Math.imul(t^t>>>7,61|t); return ((t^t>>>14)>>>0)/4294967296;}; }
  function nearestOn(a,b,p) { const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1); return {x:a.x+t*dx,y:a.y+t*dy,z:a.z+t*(b.z-a.z),distance:Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}; }
  function inside(p,ring) { let v=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++) {const a=ring[i],b=ring[j]; if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)v=!v;} return v; }
  function inTriangle(p,a,b,c) { const d=[cross(a,b,p),cross(b,c,p),cross(c,a,p)]; return d.every(n=>n>=-EPS)||d.every(n=>n<=EPS); }
  function intersects(a,b,c,d) { const v=[cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b)]; return v[0]*v[1]<=0&&v[2]*v[3]<=0&&Math.max(a.x,b.x)+EPS>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)+EPS>=Math.min(a.x,b.x)&&Math.max(a.y,b.y)+EPS>=Math.min(c.y,d.y)&&Math.max(c.y,d.y)+EPS>=Math.min(a.y,b.y); }
  function segmentDistance(a,b,c,d) { if(intersects(a,b,c,d))return 0; return Math.min(nearestOn(a,b,c).distance,nearestOn(a,b,d).distance,nearestOn(c,d,a).distance,nearestOn(c,d,b).distance); }
  function bounds(points) {return points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});}
  function triangulate(ring) {
    const pts=ring.slice(); if(pts.length>2&&distance(pts[0],pts[pts.length-1])<EPS)pts.pop();
    if(pts.length<3)return [];
    const area=pts.reduce((s,p,i)=>s+p.x*pts[(i+1)%pts.length].y-pts[(i+1)%pts.length].x*p.y,0); if(area<0)pts.reverse();
    const ids=pts.map((_,i)=>i),out=[]; let guard=ids.length*ids.length;
    while(ids.length>3&&guard-->0) {let cut=false; for(let i=0;i<ids.length;i++) {const a=pts[ids[(i+ids.length-1)%ids.length]],b=pts[ids[i]],c=pts[ids[(i+1)%ids.length]]; if(cross(a,b,c)<=EPS)continue; if(ids.some((id,j)=>j!==i&&j!==(i+1)%ids.length&&j!==(i+ids.length-1)%ids.length&&inTriangle(pts[id],a,b,c)))continue; out.push([a,b,c]);ids.splice(i,1);cut=true;break;} if(!cut)break; }
    if(ids.length===3)out.push(ids.map(i=>pts[i])); return out;
  }
  // Longest-edge refinement creates hanging nodes: a coarse edge A--B can
  // border A--M--B. Sampling an undulating height at M then opens an actual
  // 3D crack even though both faces cover the same XY region. Collect every
  // boundary sample first, insert it in BOTH incident edges, and only then
  // triangulate each resulting convex boundary around an interior point.
  // No edge height is flattened, and the original XY footprints are kept.
  function conformTerrain(triangles, heightAt) {
    const GRID = 16, TOLERANCE = 1e-5, vertices = [], byPosition = new Map(), grid = new Map();
    const positionKey = p => Math.round(p.x * 1e6) + ',' + Math.round(p.y * 1e6);
    const cellKey = (x, y) => x + ',' + y;
    function vertex(p) {
      const key = positionKey(p);
      if (byPosition.has(key)) return byPosition.get(key);
      const id = vertices.length, v = point(p.x, p.y, heightAt(p.x, p.y));
      vertices.push(v); byPosition.set(key, id);
      const cell = cellKey(Math.floor(v.x / GRID), Math.floor(v.y / GRID));
      if (!grid.has(cell)) grid.set(cell, []);
      grid.get(cell).push(id);
      return id;
    }
    const indexed = triangles.map(t => ({ ...t, ids: t.vertices.map(vertex) }));
    const edgeCache = new Map();
    function edge(aId, bId) {
      const lo = Math.min(aId, bId), hi = Math.max(aId, bId), key = lo + ':' + hi;
      if (!edgeCache.has(key)) {
        const a = vertices[lo], b = vertices[hi], dx = b.x - a.x, dy = b.y - a.y;
        const length2 = dx * dx + dy * dy, length = Math.sqrt(length2), interior = [];
        const minX = Math.floor((Math.min(a.x, b.x) - TOLERANCE) / GRID);
        const maxX = Math.floor((Math.max(a.x, b.x) + TOLERANCE) / GRID);
        const minY = Math.floor((Math.min(a.y, b.y) - TOLERANCE) / GRID);
        const maxY = Math.floor((Math.max(a.y, b.y) + TOLERANCE) / GRID);
        for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
          for (const id of grid.get(cellKey(x, y)) || []) {
            if (id === lo || id === hi) continue;
            const p = vertices[id], t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2;
            if (t * length <= TOLERANCE || (1 - t) * length <= TOLERANCE) continue;
            if (Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) <= TOLERANCE * length)
              interior.push({ id, t });
          }
        }
        interior.sort((a, b) => a.t - b.t || a.id - b.id);
        edgeCache.set(key, [lo, ...interior.map(p => p.id), hi]);
      }
      const list = edgeCache.get(key);
      return aId === lo ? list : list.slice().reverse();
    }
    const faces = [];
    let insertedBoundaryVertices = 0;
    for (const t of indexed) {
      const boundary = [];
      for (let i = 0; i < 3; i++) boundary.push(...edge(t.ids[i], t.ids[(i + 1) % 3]).slice(0, -1));
      const metadata = { fill: t.fill, kind: t.kind, featureId: t.featureId, priority: t.priority };
      if (boundary.length === 3) {
        faces.push({ ...metadata, vertices: boundary.map(id => vertices[id]) });
        continue;
      }
      insertedBoundaryVertices += boundary.length - 3;
      const original = t.ids.map(id => vertices[id]);
      const x = original.reduce((s, p) => s + p.x / 3, 0), y = original.reduce((s, p) => s + p.y / 3, 0);
      const center = point(x, y, heightAt(x, y));
      for (let i = 0; i < boundary.length; i++)
        faces.push({ ...metadata, vertices: [vertices[boundary[i]], vertices[boundary[(i + 1) % boundary.length]], center] });
    }
    return { faces, sourceTriangles: triangles.length, insertedBoundaryVertices, sharedVertices: vertices.length };
  }
  function build(track,circuitOrId,data,options={}) {
    if(!track||!Array.isArray(track.points)||track.points.length<3)throw new TypeError('TrackEnvironment requires a built track.');
    const id=typeof circuitOrId==='string'?circuitOrId:circuitOrId&&circuitOrId.id||track.id;
    data=data||(root.TrackEnvironmentData||{})[id]||{features:[],sources:[]};
    const projection=track.projection, geographic=(data.coordinateSystem||'wgs84')==='wgs84';
    if(geographic&&data.features&&data.features.length&&!projection)throw new TypeError('Geographic environment data requires track.projection.');
    const project=c=>{ if(!Array.isArray(c)||!Number.isFinite(c[0])||!Number.isFinite(c[1]))throw new TypeError('Invalid environment coordinate.'); return geographic?point(((c[0]-projection.origin[0])*projection.metresPerDegree*Math.cos(projection.latitudeRad)-projection.offset.x)*projection.scale,(-(c[1]-projection.origin[1])*projection.metresPerDegree-projection.offset.y)*projection.scale):point(c[0],c[1]); };
    const segments=track.points.map((a,i)=>({a,b:track.points[(i+1)%track.points.length]})),roadGrid=new Map();
    const key=(x,y)=>x+','+y;
    segments.forEach((s,i)=>{const b=bounds([s.a,s.b]);for(let x=Math.floor(b.minX/ROAD_CELL);x<=Math.floor(b.maxX/ROAD_CELL);x++)for(let y=Math.floor(b.minY/ROAD_CELL);y<=Math.floor(b.maxY/ROAD_CELL);y++){const k=key(x,y);if(!roadGrid.has(k))roadGrid.set(k,[]);roadGrid.get(k).push(i);}});
    function candidates(b,margin=0) {const out=new Set();for(let x=Math.floor((b.minX-margin)/ROAD_CELL);x<=Math.floor((b.maxX+margin)/ROAD_CELL);x++)for(let y=Math.floor((b.minY-margin)/ROAD_CELL);y<=Math.floor((b.maxY+margin)/ROAD_CELL);y++)for(const i of roadGrid.get(key(x,y))||[])out.add(i);return [...out].map(i=>segments[i]);}
    function nearest(x,y) {const p=point(x,y),b={minX:x,maxX:x,minY:y,maxY:y};let best=null; for(let r=64;r<=4096;r*=2) {for(const s of candidates(b,r)){const q=nearestOn(s.a,s.b,p);if(!best||q.distance<best.distance)best=q;}if(best&&best.distance<=r)return best;}for(const s of segments){const q=nearestOn(s.a,s.b,p);if(!best||q.distance<best.distance)best=q;}return best;}
    const groundHeight=(x,y)=>nearest(x,y).z-.07;
    const clearance=track.width*.5+Math.min(1.1,track.width*.065)+.35;
    function clearTriangle(t) { for(const s of candidates(bounds(t),clearance)){if(inTriangle(s.a,...t)||inTriangle(s.b,...t))return false;for(let i=0;i<3;i++)if(segmentDistance(t[i],t[(i+1)%3],s.a,s.b)<clearance)return false;}return true; }
    // Reserve every cited polygon before placing trees, including polygons that
    // appear later in the input. A crown must not overlap a paved/gravel surface;
    // illustrative vegetation additionally stays outside all observed areas.
    const observedRegions=[],regionGrid=new Map();
    for(const f of data.features||[])if(f.properties?.sourceId&&f.geometry?.type==='Polygon'){
      const rings=f.geometry.coordinates.map(r=>r.map(project));if(!rings[0]?.length)continue;
      const region={kind:f.properties.kind,outer:rings[0],holes:rings.slice(1),bounds:bounds(rings[0])},i=observedRegions.push(region)-1,b=region.bounds;
      for(let x=Math.floor(b.minX/CELL);x<=Math.floor(b.maxX/CELL);x++)for(let y=Math.floor(b.minY/CELL);y<=Math.floor(b.maxY/CELL);y++){const k=key(x,y);if(!regionGrid.has(k))regionGrid.set(k,[]);regionGrid.get(k).push(i);}
    }
    function reservedSurface(p,r,allObserved=false){
      const ids=new Set();for(let x=Math.floor((p.x-r)/CELL);x<=Math.floor((p.x+r)/CELL);x++)for(let y=Math.floor((p.y-r)/CELL);y<=Math.floor((p.y+r)/CELL);y++)for(const i of regionGrid.get(key(x,y))||[])ids.add(i);
      const touches=ring=>ring.some((a,i)=>nearestOn(a,ring[(i+1)%ring.length],p).distance<=r);
      for(const i of ids){const region=observedRegions[i];if(!allObserved&&['grass','forest'].includes(region.kind))continue;
        if(inside(p,region.outer)){const hole=region.holes.find(ring=>inside(p,ring));if(!hole||touches(hole))return true;}
        else if(touches(region.outer))return true;
      }return false;
    }
    const groupsMap=new Map(),faces=[],objects=[],terrain=[],stats={features:0,rejected:0,faces:0,trees:0,sourceTrees:0,backgroundTrees:0,backgroundPlacementCandidates:0,illustrativeVegetation:false,kinds:{},approximateVerticalGeometry:true};
    const tint=(hex,f)=>'#'+[1,3,5].map(i=>clamp(Math.round(parseInt(hex.slice(i,i+2),16)*f),0,255).toString(16).padStart(2,'0')).join('');
    function addFace(vertices,fill,kind,featureId,extra={}) {
      if(faces.length>=50000&&!Object.hasOwn(COLORS,kind))return; const center=vertices.reduce((p,v)=>point(p.x+v.x/vertices.length,p.y+v.y/vertices.length,p.z+v.z/vertices.length),point(0,0));
      const k=key(Math.floor(center.x/CELL),Math.floor(center.y/CELL));if(!groupsMap.has(k))groupsMap.set(k,{id:k,faces:[],objects:[],bounds:{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}});
      const g=groupsMap.get(k),f={vertices,fill,kind,featureId,...extra};g.faces.push(f);faces.push(f);
      for(const v of vertices){g.bounds.minX=Math.min(g.bounds.minX,v.x);g.bounds.maxX=Math.max(g.bounds.maxX,v.x);g.bounds.minY=Math.min(g.bounds.minY,v.y);g.bounds.maxY=Math.max(g.bounds.maxY,v.y);}stats.kinds[kind]=(stats.kinds[kind]||0)+1;
    }
    function tree(p,properties,featureId,rng) {
      const h=clamp(properties.height||9+rng()*8,3,32),r=clamp(properties.crownRadius||h*.24,1.3,6);
      const illustrative=properties.illustrativeVegetation===true;
      if(nearest(p.x,p.y).distance<clearance+r+3||reservedSurface(p,r+1,illustrative)||options.excludeTree?.(p.x,p.y,r+1))return false;
      const z=groundHeight(p.x,p.y),o={kind:'tree',x:p.x,y:p.y,z,height:h,radius:r,featureId,individualPositionEstimated:properties.kind==='forest'||illustrative,illustrativeVegetation:illustrative};objects.push(o);stats.trees++;
      if(illustrative){stats.backgroundTrees++;stats.illustrativeVegetation=true;}else stats.sourceTrees++;
      const n=6,ring=Array.from({length:n},(_,i)=>{const a=i*Math.PI*2/n;return point(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r,z+h*.61);}),tip=point(p.x+.12*r,p.y-.08*r,z+h),bottom=point(p.x,p.y,z+h*.35);
      const shadow=ring.map(q=>point(q.x+h*.20,q.y+h*.13,z+.025));
      if(shadow.slice(1,-1).every((q,i)=>clearTriangle([shadow[0],q,shadow[i+2]])))addFace(shadow,'rgba(26,42,22,.20)','tree-shadow',featureId,{detail:1});
      if(illustrative){
        // Two irregular crown rings produce broad, rounded silhouettes instead
        // of repeating the same pointed conifer on a regular planting grid.
        const phase=rng()*Math.PI*2,upperRadius=properties.crownShape==='spreading'?.80:.62,color=properties.crownColor||'#5b7546';
        const lower=Array.from({length:n},(_,i)=>{const a=phase+i*Math.PI*2/n,rr=r*(.82+rng()*.18);return point(p.x+Math.cos(a)*rr,p.y+Math.sin(a)*rr,z+h*(.53+rng()*.06));});
        const upper=lower.map((q,i)=>point(p.x+(q.x-p.x)*upperRadius+.08*r,p.y+(q.y-p.y)*upperRadius,z+h*(.81+(i%2)*.04)));
        for(let i=0;i<n;i++){const j=(i+1)%n;addFace([lower[i],lower[j],upper[j],upper[i]],tint(color,.82+i*.035),'tree',featureId,{illustrativeVegetation:true});addFace([upper[i],upper[j],tip],tint(color,.94+i*.025),'tree',featureId,{illustrativeVegetation:true});addFace([lower[j],lower[i],bottom],tint(color,.72+i*.025),'tree',featureId,{detail:1,illustrativeVegetation:true});}
      }else for(let i=0;i<n;i++){addFace([ring[i],ring[(i+1)%n],tip],tint('#496642',.81+i*.055),'tree',featureId);addFace([ring[(i+1)%n],ring[i],bottom],tint('#3f5738',.82+i*.035),'tree',featureId,{detail:1});}
      const tr=h*.019;for(let i=0;i<4;i++){const a=i*Math.PI/2,b=(i+1)*Math.PI/2;addFace([point(p.x+Math.cos(a)*tr,p.y+Math.sin(a)*tr,z),point(p.x+Math.cos(b)*tr,p.y+Math.sin(b)*tr,z),point(p.x+Math.cos(b)*tr,p.y+Math.sin(b)*tr,z+h*.58),point(p.x+Math.cos(a)*tr,p.y+Math.sin(a)*tr,z+h*.58)],tint('#665947',.8+i*.08),'tree-trunk',featureId,{detail:1});}
      const group=groupsMap.get(key(Math.floor(p.x/CELL),Math.floor(p.y/CELL)));if(group)group.objects.push(o);
      return true;
    }
    for(const feature of data.features||[]) {
      const p=feature.properties||{},g=feature.geometry,featureId=feature.id||'feature-'+stats.features;
      if(!g||!p.sourceId||!p.kind){stats.rejected++;continue;}stats.features++;
      const rng=seeded(id+':'+featureId),kind=p.kind;
      if(g.type==='Point'&&kind==='tree'){tree(project(g.coordinates),p,featureId,rng);continue;}
      if(g.type==='Polygon'&&Object.hasOwn(COLORS,kind)) {
        const rings=g.coordinates.map(r=>r.map(project)),outer=rings[0],holes=rings.slice(1),b=bounds(outer);
        function renderTriangle(t,depth=0) {
          const edges=[distance(t[0],t[1]),distance(t[1],t[2]),distance(t[2],t[0])],long=Math.max(...edges),center=point((t[0].x+t[1].x+t[2].x)/3,(t[0].y+t[1].y+t[2].y)/3),clear=clearTriangle(t);
          const holeHit=holes.some(r=>t.some(q=>inside(q,r))||r.some(q=>inTriangle(q,...t))||t.some((a,i)=>r.some((c,j)=>intersects(a,t[(i+1)%3],c,r[(j+1)%r.length]))));
          if((!clear||holeHit||long>(kind==='forest'?42:25))&&long>2&&depth<18){const i=edges.indexOf(long),a=t[i],b=t[(i+1)%3],c=t[(i+2)%3],m=point((a.x+b.x)/2,(a.y+b.y)/2);renderTriangle([a,m,c],depth+1);renderTriangle([m,b,c],depth+1);return;}
          if(!clear||holeHit||Math.abs(cross(...t))<.04)return;
          const color=/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:COLORS[kind];
          // A forest or meadow is one material, not a visible patchwork of
          // triangulation cells. Keep tiny variation only for loose gravel.
          const grain=kind==='painted-runoff'?1:.965+rng()*.07;
          terrain.push({vertices:t,fill:tint(color,kind==='gravel'?grain:1),kind,featureId,priority:-2});
        }
        for(const t of triangulate(outer))renderTriangle(t);
        if(kind==='forest') {
          const spacing=clamp(p.treeSpacing||19,12,35);let count=0;
          for(let x=b.minX+spacing*.5;x<b.maxX&&count<650;x+=spacing)for(let y=b.minY+spacing*.5;y<b.maxY&&count<650;y+=spacing){const q=point(x+(rng()-.5)*spacing*.65,y+(rng()-.5)*spacing*.65);if(inside(q,outer)&&!holes.some(r=>inside(q,r))){tree(q,p,featureId,rng);count++;}}
        }
      } else if(g.type==='LineString'&&['retaining-wall','guardrail'].includes(kind)) {
        const line=g.coordinates.map(project),height=clamp(p.height||(kind==='guardrail'?.8:2.1),.3,8),width=kind==='guardrail'?.18:.55;
        for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],length=distance(a,b),n=Math.ceil(length/9);if(length<EPS)continue;for(let j=0;j<n;j++){const u=point(a.x+(b.x-a.x)*j/n,a.y+(b.y-a.y)*j/n),v=point(a.x+(b.x-a.x)*(j+1)/n,a.y+(b.y-a.y)*(j+1)/n);if(candidates(bounds([u,v]),clearance+width).some(s=>segmentDistance(u,v,s.a,s.b)<clearance+width))continue;const nx=-(b.y-a.y)/length*width*.5,ny=(b.x-a.x)/length*width*.5;const verts=[point(u.x+nx,u.y+ny,groundHeight(u.x,u.y)),point(v.x+nx,v.y+ny,groundHeight(v.x,v.y)),point(v.x-nx,v.y-ny,groundHeight(v.x,v.y)),point(u.x-nx,u.y-ny,groundHeight(u.x,u.y))],top=verts.map(q=>point(q.x,q.y,q.z+height));for(let k=0;k<4;k++)addFace([verts[k],verts[(k+1)%4],top[(k+1)%4],top[k]],kind==='guardrail'?'#9caaa9':k%2?'#77796c':'#939285',kind,featureId);addFace(top,kind==='guardrail'?'#b4c0bd':'#aba99b',kind,featureId);}}
      }
    }
    if(options.backgroundVegetation!==false){
      const requested=Number.isFinite(options.backgroundTreeLimit)?options.backgroundTreeLimit:400;
      const length=track.centerlineLength||segments.reduce((s,q)=>s+distance(q.a,q.b),0),budget=Math.floor(clamp(Math.min(requested,Math.max(260,length/10)),0,400));
      const rng=seeded(id+':illustrative-background-v1'),treeGrid=new Map(),TREE_CELL=16;
      function indexTree(o){const k=key(Math.floor(o.x/TREE_CELL),Math.floor(o.y/TREE_CELL));if(!treeGrid.has(k))treeGrid.set(k,[]);treeGrid.get(k).push(o);}
      objects.forEach(indexTree);
      function occupied(p,r){const reach=r+8;for(let x=Math.floor((p.x-reach)/TREE_CELL);x<=Math.floor((p.x+reach)/TREE_CELL);x++)for(let y=Math.floor((p.y-reach)/TREE_CELL);y<=Math.floor((p.y+reach)/TREE_CELL);y++)for(const o of treeGrid.get(key(x,y))||[])if(Math.hypot(p.x-o.x,p.y-o.y)<r+o.radius+2)return true;return false;}
      // Seed small elliptical clusters beside random road locations. Every
      // candidate is checked against ALL road legs, not only its seed segment.
      // Fixed attempt/geometry caps also bound work on densely reserved venues.
      for(let cluster=0;cluster<budget*3&&stats.backgroundTrees<budget;cluster++){
        const s=segments[Math.floor(rng()*segments.length)],d=distance(s.a,s.b);if(d<EPS)continue;
        const t=rng(),side=rng()<.5?-1:1,offset=60+rng()*90;
        const center=point(s.a.x+(s.b.x-s.a.x)*t+(s.b.y-s.a.y)/d*offset*side,s.a.y+(s.b.y-s.a.y)*t-(s.b.x-s.a.x)/d*offset*side);
        const rotation=rng()*Math.PI*2,major=14+rng()*20,minor=8+rng()*12,count=5+Math.floor(rng()*8);
        for(let j=0;j<count&&stats.backgroundTrees<budget;j++){
          stats.backgroundPlacementCandidates++;
          const a=rng()*Math.PI*2,rad=Math.sqrt(rng()),u=Math.cos(a)*major*rad,v=Math.sin(a)*minor*rad;
          const p=point(center.x+u*Math.cos(rotation)-v*Math.sin(rotation),center.y+u*Math.sin(rotation)+v*Math.cos(rotation));
          const r=1.9+rng()*2.2,road=nearest(p.x,p.y).distance;
          if(road<45+r||road>180-r||occupied(p,r)||reservedSurface(p,r+1,true)||options.excludeTree?.(p.x,p.y,r+1))continue;
          const spreading=rng()<.42,properties={illustrativeVegetation:true,height:(spreading?5.5:7)+rng()*6,crownRadius:r,crownShape:spreading?'spreading':'rounded',crownColor:['#607b49','#536e44','#6e8350','#587547'][Math.floor(rng()*4)]};
          if(tree(p,properties,'illustrative-background-'+id+'-'+cluster,rng))indexTree(objects.at(-1));
        }
      }
    }
    const conforming=conformTerrain(terrain,groundHeight);
    stats.terrain={sourceTriangles:conforming.sourceTriangles,conformingTriangles:conforming.faces.length,insertedBoundaryVertices:conforming.insertedBoundaryVertices,sharedVertices:conforming.sharedVertices};
    for(const f of conforming.faces)addFace(f.vertices,f.fill,f.kind,f.featureId,{priority:f.priority});
    const groups=[...groupsMap.values()];for(const g of groups){g.center=point((g.bounds.minX+g.bounds.maxX)/2,(g.bounds.minY+g.bounds.maxY)/2);g.radius=Math.hypot(g.bounds.maxX-g.bounds.minX,g.bounds.maxY-g.bounds.minY)/2;}
    stats.faces=faces.length;
    const worldBounds=faces.length?bounds(faces.flatMap(f=>f.vertices)):{...track.bounds};
    function query(x,y,radius=320) { if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(radius)||radius<0)return [];return groups.filter(g=>Math.hypot(Math.max(g.bounds.minX-x,0,x-g.bounds.maxX),Math.max(g.bounds.minY-y,0,y-g.bounds.maxY))<=radius); }
    return {id,groups,faces,objects,bounds:worldBounds,stats,sources:data.sources||[],source:data.metadata||null,query,groundHeight,roadDistance:(x,y)=>nearest(x,y).distance,clearanceM:clearance,illustrativeVegetation:{enabled:options.backgroundVegetation!==false,trees:stats.backgroundTrees,classification:'illustrative vegetation in unclassified areas; not photo-confirmed trees',roadDistanceRangeM:[45,180],maximumTrees:400},verticalGeometry:'estimated from adjacent track elevations; individual trees and unclassified background vegetation are illustrative'};
  }
  const api={build,conformTerrain};root.TrackEnvironment=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
