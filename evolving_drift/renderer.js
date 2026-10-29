/* Drift scene renderer. Metres, x/y on the ground, z up. Vehicle yaw is supplied
 * by physics; the camera alone follows travel direction. EV2 model files are
 * read in place, including full geometry, UVs, normals and factory finishes.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const point = (x, y, z = 0) => ({ x, y, z });
  const identity = () => [1,0,0,0,1,0,0,0,1];
  const applyBasis = (m,p) => point(m[0]*p.x+m[3]*p.y+m[6]*p.z,m[1]*p.x+m[4]*p.y+m[7]*p.z,m[2]*p.x+m[5]*p.y+m[8]*p.z);
  const multiplyBasis = (a,b) => [0,1,2].flatMap(i => {const p=applyBasis(a,point(b[i*3],b[i*3+1],b[i*3+2]));return [p.x,p.y,p.z];});
  const yawBasis = a => [Math.cos(a),Math.sin(a),0,-Math.sin(a),Math.cos(a),0,0,0,1];
  const pitchBasis = a => [Math.cos(a),0,Math.sin(a),0,1,0,-Math.sin(a),0,Math.cos(a)];
  const rollBasis = a => [1,0,0,0,Math.cos(a),Math.sin(a),0,-Math.sin(a),Math.cos(a)];
  const color = hex => {
    if (Array.isArray(hex)) return hex.map(c => clamp(c, 0, 1) * 255);
    if (/^rgba?\(/.test(String(hex))) return String(hex).match(/[\d.]+/g).slice(0,3).map(Number);
    let s = String(hex || '#92a8af').replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [146, 168, 175];
  };
  const shade = (rgb, light) => 'rgb(' + rgb.map(c => Math.round(clamp(c * light, 0, 255))).join(',') + ')';
  // VehicleSurfaces accepts hex colours when buffering generic face meshes.
  const hexColor = fill => '#' + color(fill).map(c => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('');
  const framesOf = record => Array.isArray(record) ? record : record?.frames || record?.trajectory || record?.samples || [];
  const frameTime = f => finite(f?.time, finite(f?.t));
  const SCORE_COLOR='#36bdcc',INACTIVE_COLOR='#a9b1b6';
  // Display eligibility, not earned points: tyre propulsion, angle, continuity
  // and a valid completed run are still evaluated exclusively by Fitness.
  function scoringRanges(track) {
    const fitness=root.DriftFitness||(typeof require==='function'?require('./fitness.js'):null),length=finite(track.length);
    const intervals=[{start:track.judgedStart,end:track.judgedEnd},...(fitness?.exitZones(track)||[]).map(z=>({start:z.exit,end:z.end}))]
      .filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)).map(r=>({start:clamp(r.start,0,length),end:clamp(r.end,0,length)}))
      .filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start||a.end-b.end),merged=[];
    for(const range of intervals){const last=merged.at(-1);if(last&&range.start<=last.end)last.end=Math.max(last.end,range.end);else merged.push({...range});}
    return merged;
  }
  function scoringTrace(record,timeline,time) {
    const frames=framesOf(record),segments=[];
    if(!Array.isArray(timeline)||timeline.length!==frames.length)return segments;
    for(let i=1;i<frames.length;i++){
      const a=frames[i-1],b=frames[i],start=frameTime(a),end=frameTime(b);
      if(start>=time)break;
      if(!(end>start)||Math.abs(finite(timeline[i]?.time,-Infinity)-end)>1e-6)return [];
      const u=clamp((time-start)/(end-start),0,1);
      // A partial interval has not reached the next scoring sample yet.
      // Keep it neutral until the same sample is visible in the score panel.
      segments.push({a:{x:a.x,y:a.y},b:{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u},earning:end<=time+1e-8&&timeline[i]?.earning===true});
      if(end>=time)break;
    }
    return segments;
  }
  function sampleFrames(record, time) {
    const frames = framesOf(record);
    if (!frames.length) return null;
    if (time <= frameTime(frames[0])) return frames[0];
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (frameTime(frames[mid]) <= time) lo = mid; else hi = mid - 1;
    }
    const a = frames[lo], b = frames[Math.min(lo + 1, frames.length - 1)];
    if (a === b) return a;
    const u = clamp((time - frameTime(a)) / Math.max(1e-6, frameTime(b) - frameTime(a)), 0, 1);
    const result = { ...a };
    for (const key of ['x', 'y', 'z', 'elevation', 'grade', 'bank', 'pitch', 'roll', 'vx', 'vy', 's', 'speed', 'beta', 'steer', 'time']) if(Number.isFinite(a[key]) || Number.isFinite(b[key])) result[key] = finite(a[key],finite(b[key])) + (finite(b[key],finite(a[key])) - finite(a[key],finite(b[key]))) * u;
    result.yaw = finite(a.yaw) + wrap(finite(b.yaw) - finite(a.yaw)) * u;
    return result;
  }
  // Physics order is FL(+y), FR(-y), RL(+y), RR(-y).
  function wheelIndex(v) { return (v.x >= 0 ? 0 : 2) + (v.y >= 0 ? 0 : 1); }
  function fallbackMesh(spec, paint) {
    const length = finite(spec.lengthMm, 4700) / 1000, width = finite(spec.widthMm, 1850) / 1000, height = finite(spec.heightMm, 1450) / 1000;
    const faces = [], quad = (vertices, fill) => faces.push({ vertices, fill, material: 'paint' });
    function box(x0, x1, y0, y1, z0, z1, fill) {
      const a = point(x0, y0, z0), b = point(x1, y0, z0), c = point(x1, y1, z0), d = point(x0, y1, z0);
      const A = point(x0, y0, z1), B = point(x1, y0, z1), C = point(x1, y1, z1), D = point(x0, y1, z1);
      for (const vs of [[a,b,B,A],[b,c,C,B],[c,d,D,C],[d,a,A,D],[A,B,C,D]]) quad(vs, fill);
    }
    box(-length / 2, length / 2, -width / 2, width / 2, .24, height * .55, paint);
    box(-length * .28, length * .13, -width * .38, width * .38, height * .55, height, '#263e4c');
    return { faces, length, width, height, metadata: { modeling: 'schematic', label: '차체 도식 · 외형 모델 로딩 중' } };
  }

  class DriftRenderer {
    constructor(canvas) {
      if (!canvas?.getContext) throw new TypeError('A canvas is required.');
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.meshes = new Map(); this.loading = new Set(); this.trackCache = new WeakMap();
      this.follow = null; this.lastTime = null; this.lastRecord = null; this.lastMode = null;
      this.wheelAngles = [0, 0, 0, 0]; this.liveFrames = []; this.lastLiveTime = -1;
      this.modelSource = null; this.effects = { marks: 0, smoke: 0 };
      this.surfaceRenderer = null;
      if (typeof root.VehicleSurfaces === 'function') {
        try { this.surfaceRenderer = new root.VehicleSurfaces(); this._surfaceAdapter(); }
        catch (error) { this.surfaceFailure = String(error); }
      }
      this.resize();
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect?.() || {};
      this.width = Math.max(320, rect.width || this.canvas.clientWidth || 960);
      this.height = Math.max(240, rect.height || this.canvas.clientHeight || 620);
      this.dpr = Math.min(2, finite(root.devicePixelRatio, 1));
      const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    }
    _sample(track, s) {
      if (typeof track.sample === 'function') return track.sample(clamp(s, 0, track.length));
      const points = track.points || [];
      if (!points.length) return point(0, 0);
      const index = clamp(Math.round(s / Math.max(1, track.length) * (points.length - 1)), 0, points.length - 1);
      return points[index];
    }
    _surface(track,x,y,hint) {
      const supplied=typeof track?.surface==='function'?track.surface(x,y,hint):null;
      if(supplied&&Number.isFinite(supplied.z))return supplied;
      const p=this._sample(track,finite(hint)),heading=finite(p.heading),grade=finite(p.grade),bank=Math.tan(finite(p.bank)),dx=x-p.x,dy=y-p.y;
      const gradientX=grade*Math.cos(heading)-bank*Math.sin(heading),gradientY=grade*Math.sin(heading)+bank*Math.cos(heading);
      return {z:finite(p.z)+dx*gradientX+dy*gradientY,gradientX,gradientY,normalZ:1/Math.hypot(1,gradientX,gradientY),muScale:1};
    }
    _atSurface(track,p,lift=0,hint) { return point(p.x,p.y,finite(p.z,this._surface(track,p.x,p.y,hint).z)+lift); }
    _pose(track,frame) {
      const surface=this._surface(track,frame.x,frame.y,frame.s),yaw=finite(frame.yaw),ca=Math.cos(yaw),sa=Math.sin(yaw);
      const gradientKnown=Number.isFinite(surface.gradientX)&&Number.isFinite(surface.gradientY),along=gradientKnown?surface.gradientX*ca+surface.gradientY*sa:finite(frame.grade),across=gradientKnown?-surface.gradientX*sa+surface.gradientY*ca:Math.tan(finite(frame.bank));
      // Recorded grade/bank describe the course axes. A drifting body can point
      // across them, so only explicit body pitch/roll override the world normal.
      const pitch=finite(frame.pitch,Math.atan(along)),roll=finite(frame.roll,Math.atan(across/Math.hypot(1,along)));
      return {x:frame.x,y:frame.y,z:finite(frame.z,finite(frame.elevation,surface.z)),yaw,pitch,roll,basis:multiplyBasis(yawBasis(yaw),multiplyBasis(pitchBasis(pitch),rollBasis(roll)))};
    }
    _track(track) {
      if (this.trackCache.has(track)) return this.trackCache.get(track);
      const pts = track.points || [], width = finite(track.width, finite(track.widthM, 14));
      const edges = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const heading = finite(p.heading, Math.atan2(b.y - a.y, b.x - a.x));
        const normal = point(-Math.sin(heading), Math.cos(heading));
        const sample=this._sample(track,p.s),leftWidth=finite(p.widthLeft,finite(sample.widthLeft,width/2)),rightWidth=finite(p.widthRight,finite(sample.widthRight,width/2));
        const offset = d => {const x=p.x+normal.x*d,y=p.y+normal.y*d;return point(x,y,this._surface(track,x,y,p.s).z+.012);};
        return { ...p, z:finite(p.z,this._surface(track,p.x,p.y,p.s).z), heading, leftWidth,rightWidth,left: offset(leftWidth), right: offset(-rightWidth), leftOut: offset(leftWidth+2.5), rightOut: offset(-rightWidth-2.5), normal };
      });
      const geometry=this._environmentGeometry(track),fitPoints=edges.flatMap(p=>[p.leftOut,p.rightOut]),ranges=scoringRanges(track),scoreBands=[];
      let previous=0;for(const r of ranges){if(r.start>previous)scoreBands.push({start:previous,end:r.start,eligible:false});scoreBands.push({...r,eligible:true});previous=r.end;}
      if(previous<track.length)scoreBands.push({start:previous,end:track.length,eligible:false});
      for(const band of scoreBands){
        const samples=[band.start];for(let s=band.start+2;s<band.end;s+=2)samples.push(s);samples.push(band.end);
        band.path=samples.map(s=>({...this._sample(track,s),s}));band.color=band.eligible?SCORE_COLOR:INACTIVE_COLOR;
        for(const side of [-1,1]){
          const strip=band.path.map(p=>{const halfWidth=side>0?finite(p.widthLeft,width/2):finite(p.widthRight,width/2),offset=side*Math.max(.2,halfWidth-1.35),normal=point(-Math.sin(finite(p.heading)),Math.cos(finite(p.heading)));
            return [-.1,.1].map(extra=>{const x=p.x+normal.x*(offset+extra),y=p.y+normal.y*(offset+extra);return point(x,y,this._surface(track,x,y,p.s).z+.036);});});
          for(let i=0;i<strip.length-1;i++)geometry.decals.push({vertices:[strip[i][0],strip[i+1][0],strip[i+1][1],strip[i][1]],fill:band.color,material:'rubber',flat:true,scoreOverlay:true});
        }
      }
      // Frame the driving area, not the full DEM grid or distant woodland.
      // Environment geometry still uses its own bounds for depth clipping.
      for(const polygon of track.boundaryPolygons||[])for(const p of polygon)fitPoints.push(this._atSurface(track,p));
      if(!fitPoints.length)fitPoints.push(point(-50,-50),point(50,50));
      const measure=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y),minZ:Math.min(b.minZ,p.z),maxZ:Math.max(b.maxZ,p.z)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity});
      const bounds=measure(fitPoints),sceneBounds=measure([...fitPoints,...[...geometry.ground,...geometry.decals,...geometry.objects].flatMap(face=>face.vertices)]);
      const roadFaces=[];for(let i=0;i<edges.length-1;i++){const a=edges[i],b=edges[i+1];roadFaces.push({vertices:[a.left,b.left,b.right,a.right],fill:track.environment?.roadColor||track.roadColor||'#656b6d',material:'rubber'});if(!track.environment)for(const vertices of [[a.leftOut,b.leftOut,b.left,a.left],[a.right,b.right,b.rightOut,a.rightOut]])roadFaces.push({vertices,fill:'#c3c2a7',material:'rubber'});}
      const dimensions={length:sceneBounds.maxX-sceneBounds.minX,width:sceneBounds.maxY-sceneBounds.minY,height:sceneBounds.maxZ-sceneBounds.minZ,bounds:sceneBounds},groundMesh={faces:[...geometry.ground,...roadFaces,...geometry.decals],...dimensions},occluders={faces:[...groundMesh.faces,...geometry.objects],...dimensions};
      const result = { edges, width, bounds, fitPoints, geometry,groundMesh,occluders,scoringRanges:ranges,scoreBands,center: point((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2,(bounds.minZ+bounds.maxZ)/2), span: Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + width * 3 };
      this.trackCache.set(track, result); return result;
    }
    _environmentGeometry(track) {
      const env=track.environment||{},ground=[],decals=[],objects=[];
      const add=(target,vertices,fill)=>{if(vertices.length>=3)target.push({vertices,fill:hexColor(fill||'#92998b'),material:'rubber',flat:true});};
      const polygon=(target,vertices,fill)=>{
        if(vertices.length>3&&vertices[0].x===vertices.at(-1).x&&vertices[0].y===vertices.at(-1).y)vertices=vertices.slice(0,-1);
        if(vertices.length<3)return;
        const ring=vertices.map((_,i)=>i),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
        const area=vertices.reduce((sum,a,i)=>{const b=vertices[(i+1)%vertices.length];return sum+a.x*b.y-b.x*a.y;},0),sign=area>=0?1:-1;
        let guard=vertices.length*vertices.length;
        while(ring.length>3&&guard-->0){let cut=false;for(let j=0;j<ring.length;j++){
          const ia=ring[(j+ring.length-1)%ring.length],ib=ring[j],ic=ring[(j+1)%ring.length],a=vertices[ia],b=vertices[ib],c=vertices[ic];
          if(sign*cross(a,b,c)<=1e-9)continue;
          if(ring.some(k=>k!==ia&&k!==ib&&k!==ic&&sign*cross(a,b,vertices[k])>=-1e-9&&sign*cross(b,c,vertices[k])>=-1e-9&&sign*cross(c,a,vertices[k])>=-1e-9))continue;
          add(target,[a,b,c],fill);ring.splice(j,1);cut=true;break;
        }if(!cut)break;}
        if(ring.length===3)add(target,ring.map(i=>vertices[i]),fill);
      };
      const terrain=env.terrain||track.terrain;
      if(terrain){
        if(Array.isArray(terrain))for(const triangle of terrain)add(ground,(triangle.points||triangle.vertices||triangle).map(p=>Array.isArray(p)?point(...p):this._atSurface(track,p)),triangle.color||env.terrainColor);
        const vertices=terrain.vertices||terrain.points||[],at=i=>{const p=vertices[i];return Array.isArray(p)?point(p[0],p[1],finite(p[2])):this._atSurface(track,p);};
        for(const face of terrain.faces||[]){const vs=face.vertices||face.points||face;add(ground,vs.map(p=>typeof p==='number'?at(p):Array.isArray(p)?point(...p):this._atSurface(track,p)),face.color||terrain.color);}
        const indices=terrain.indices||terrain.triangles||[];
        if(Array.isArray(indices[0]))for(const tri of indices)add(ground,tri.map(i=>typeof i==='number'?at(i):Array.isArray(i)?point(...i):this._atSurface(track,i)),terrain.color);
        else for(let i=0;i+2<indices.length;i+=3)add(ground,[at(indices[i]),at(indices[i+1]),at(indices[i+2])],terrain.color);
        if(!ground.length&&terrain.bounds){
          const b=terrain.bounds,columns=clamp(Math.round(finite(terrain.columns,32)),2,160),rows=clamp(Math.round(finite(terrain.rows,32)),2,160),grid=[];
          for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const px=b.minX+(b.maxX-b.minX)*x/(columns-1),py=b.minY+(b.maxY-b.minY)*y/(rows-1),height=terrain.heights?.[y*columns+x];grid.push(point(px,py,finite(height,this._surface(track,px,py).z)));}
          for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++){const i=y*columns+x;add(ground,[grid[i],grid[i+1],grid[i+columns+1]],terrain.color);add(ground,[grid[i],grid[i+columns+1],grid[i+columns]],terrain.color);}
        }
      }
      for(const surface of env.surfaces||[])polygon(ground,(surface.points||[]).map(p=>this._atSurface(track,p,.006)),surface.color);
      for(const line of env.lines||[]){const pts=line.points||[],half=Math.max(.005,finite(line.width,.12)/2);for(let i=0;i<pts.length-1;i++){
        const a=pts[i],b=pts[i+1],length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)continue;const nx=-(b.y-a.y)/length*half,ny=(b.x-a.x)/length*half;
        const corners=[[a,nx,ny],[b,nx,ny],[b,-nx,-ny],[a,-nx,-ny]].map(([p,x,y])=>this._atSurface(track,{x:p.x+x,y:p.y+y,z:p.z},.028));polygon(decals,corners,line.color||'#eeeade');
      }}
      const extrude=(pts,height,fill)=>{
        if(pts.length<3||height<=0)return;const base=pts.map(p=>this._atSurface(track,p)),top=base.map(p=>point(p.x,p.y,p.z+height));
        polygon(objects,top,fill);for(let i=0;i<base.length;i++){const j=(i+1)%base.length;add(objects,[base[i],base[j],top[j],top[i]],shade(color(fill),i%2?.78:.9));}
      };
      for(const structure of env.structures||[])extrude(structure.points||[],finite(structure.height),structure.color||'#a5aaa6');
      for(const barrier of env.barriers||[]){const pts=barrier.points||[],half=Math.max(.025,finite(barrier.width,.3)/2);for(let i=0;i<pts.length-1;i++){
        const a=pts[i],b=pts[i+1],length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)continue;const nx=-(b.y-a.y)/length*half,ny=(b.x-a.x)/length*half;
        extrude([{x:a.x+nx,y:a.y+ny,z:a.z},{x:b.x+nx,y:b.y+ny,z:b.z},{x:b.x-nx,y:b.y-ny,z:b.z},{x:a.x-nx,y:a.y-ny,z:a.z}],finite(barrier.height,.7),barrier.color||'#b5b9b6');
      }}
      for(const tree of env.trees||[]){
        const height=finite(tree.height),radius=finite(tree.crownRadius);if(height<=0||radius<=0)continue;
        const base=this._atSurface(track,tree),trunk=Math.min(radius*.14,height*.035),n=8;
        extrude(Array.from({length:n},(_,j)=>point(base.x+Math.cos(j/n*TAU)*trunk,base.y+Math.sin(j/n*TAU)*trunk,base.z)),height*.65,tree.trunkColor||'#76695a');
        const fill=tree.color||'#5e7654';
        if(tree.kind==='conifer'){
          for(let level=0;level<3;level++){const z=base.z+height*(.24+level*.18),r=radius*(1-level*.23),apex=point(base.x,base.y,base.z+height*(.68+level*.16));
            for(let j=0;j<n;j++)add(objects,[point(base.x+Math.cos(j/n*TAU)*r,base.y+Math.sin(j/n*TAU)*r,z),point(base.x+Math.cos((j+1)/n*TAU)*r,base.y+Math.sin((j+1)/n*TAU)*r,z),apex],shade(color(fill),.8+.16*j/n));
          }
        }else{
          const rings=5,crownHeight=height*.64,cz=base.z+height-crownHeight/2;
          const vertex=(k,j)=>{const latitude=-Math.PI/2+k/rings*Math.PI;return point(base.x+Math.cos(j/n*TAU)*radius*Math.cos(latitude),base.y+Math.sin(j/n*TAU)*radius*Math.cos(latitude),cz+Math.sin(latitude)*crownHeight/2);};
          for(let k=0;k<rings;k++)for(let j=0;j<n;j++)add(objects,[vertex(k,j),vertex(k,j+1),vertex(k+1,j+1),vertex(k+1,j)],shade(color(fill),.78+.2*k/rings));
        }
      }
      return {ground,decals,objects};
    }
    _vehicle(vehicle, car) {
      vehicle = vehicle || car.vehicle || {};
      const id = vehicle.vehicleId || vehicle.id || car.vehicleId || car.spec?.id || 'g70';
      const spec = vehicle.spec || car.spec || root.CircuitVehicleSpecs?.[id] || root.VehicleSpecs?.[id] || vehicle;
      const source = root.ManufacturerModels?.get?.(id);
      const loadState = root.ManufacturerModels?.getLoadState?.(id);
      const loadingInfo = loadState?.status === 'error'
        ? {kind:'model-error',label:'차량 외형 로딩 실패 · 새 실험으로 다시 시도'}
        : {kind:'schematic',label:'차체 도식 · EV2 원본 외형 로딩 중'};
      const finish = vehicle.paintFinish || root.VehiclePaints?.choose(id, 0, spec) || source?.paintReference || null;
      const paint = vehicle.color || car.color || finish?.hex || '#d9dcdb';
      const key = [id, paint, finish?.id, spec.variantId, spec.lengthMm, spec.heightMm, spec.widthMm, spec.wheelbaseMm, spec.frontTireRadiusMm, spec.rearTireRadiusMm, spec.wheelInches].join('|');
      const cached = this.meshes.get(key);
      if (cached && cached.sourceAsset === source) { if (!source) cached.sourceInfo = loadingInfo; return cached; }
      if (!source && loadState?.status !== 'error' && root.ManufacturerModels?.canLoad?.(id) && !this.loading.has(id)) {
        this.loading.add(id); root.ManufacturerModels.load(id).then(() => { this.loading.delete(id); });
      }
      // Keep the original imported buffers. Expanding the fallback triangles
      // into generic faces loses textures, smooth normals and model detail.
      const mesh = source?.primitives?.length ? root.ManufacturerModels.create(id, spec, paint) : fallbackMesh(spec, paint);
      mesh.paintFinish = finish;
      const params = vehicle.physics || vehicle;
      const wb = finite(params.wheelbase, finite(params.wheelbaseM, finite(spec.wheelbaseMm, 2800) / 1000));
      const front = finite(params.lf, finite(params.frontAxle, wb * (1-finite(params.frontWeightFraction,.5))));
      const rear = finite(params.lr, wb - front);
      const width = finite(params.trackWidth, finite(params.trackWidthM, finite(params.widthM,mesh.width) * .84));
      const radius = finite(params.wheelRadius, finite(params.tireRadius, finite(spec.frontTireRadiusMm, 335) / 1000));
      const wheels = [point(front, width / 2, radius), point(front, -width / 2, radius), point(-rear, width / 2, radius), point(-rear, -width / 2, radius)];
      // EV2's wheel metadata already accounts for original model axes. The
      // local conversion also handles models whose lateral scale is negative.
      for (const primitive of mesh.manufacturer?.primitives || []) {
        const wheel = root.VehicleWheels?.localWheel(mesh, primitive.wheel);
        if (wheel) wheels[(wheel.axle === 'front' ? 0 : 2) + (wheel.side > 0 ? 0 : 1)] = point(...wheel.center);
      }
      const sourceInfo = source?.source || loadingInfo;
      // Avoid invoking the lazy Canvas fallback when preparing the WebGL model.
      const prepared = Object.assign(Object.create(mesh), { wheels, radius, sourceInfo, id, spec, sourceAsset: source });
      let softwareFaces;
      Object.defineProperty(prepared, 'faces', { get() {
        if (!softwareFaces) softwareFaces = mesh.faces.filter(f => f.fill).map(f => {
          const wheel = root.VehicleWheels?.localWheel(mesh, f.wheel);
          return { ...f, wheel: wheel ? (wheel.axle === 'front' ? 0 : 2) + (wheel.side > 0 ? 0 : 1) : f.part === 'wheels' ? wheelIndex(f.vertices[0]) : -1 };
        });
        return softwareFaces;
      }});
      this.meshes.set(key, prepared); return prepared;
    }
    retryVehicle(id) {
      if (root.ManufacturerModels?.getLoadState?.(id)?.status !== 'error') return;
      for (const [key,mesh] of this.meshes) if (mesh.id === id) this.meshes.delete(key);
      this.loading.add(id);
      return root.ManufacturerModels.load(id).finally(() => this.loading.delete(id));
    }
    _camera(track, car, mode, fov, time, record) {
      const layout = this._track(track), f = this.height * .5 / Math.tan(clamp(fov, 30, 90) * Math.PI / 360);
      let target, yaw, pitch, distance;
      const reset = !this.follow || mode !== this.lastMode || record !== this.lastRecord || time < finite(this.lastTime, time) - .01 || Math.abs(time - finite(this.lastTime, time)) > 1;
      if (mode === 'follow') {
        const heading = Math.hypot(finite(car.vx), finite(car.vy)) > 2 ? Math.atan2(car.vy, car.vx) : finite(car.yaw);
        const pose=this._pose(track,car),desired = { x: car.x + Math.cos(heading) * 3.8, y: car.y + Math.sin(heading) * 3.8,z:pose.z+.45, heading };
        if (reset) this.follow = desired;
        else {
          const dt = clamp(time - finite(this.lastTime, time), 0, .12), alpha = 1 - Math.exp(-dt * 5.5);
          this.follow.x += (desired.x - this.follow.x) * alpha; this.follow.y += (desired.y - this.follow.y) * alpha;
          this.follow.z = finite(this.follow.z,desired.z)+(desired.z-finite(this.follow.z,desired.z))*alpha;
          this.follow.heading += wrap(heading - this.follow.heading) * (1 - Math.exp(-dt * 3.8));
        }
        target = point(this.follow.x, this.follow.y, this.follow.z);
        yaw = this.follow.heading + Math.PI / 2 + .32; pitch = .57; distance = 25;
      } else {
        target = layout.center; yaw = -.62; pitch = mode === 'top' ? Math.PI / 2 - .001 : .88;
        const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),margin=32;
        const availableX=Math.max(1,this.width*.5-margin),availableY=Math.max(1,Math.min(this.height*.53,this.height*.47)-margin);
        distance=25;
        // Fit the rotated road boundary in perspective, including the offset
        // screen centre. World-axis spans can crop a diagonal start or finish.
        for(const p of layout.fitPoints){
          const x=p.x-target.x,y=p.y-target.y,z=finite(p.z)-finite(target.z);
          const right=x*cy+y*sy,h=-x*sy+y*cy,vertical=h*sp-z*cp;
          distance=Math.max(distance,h*cp+z*sp+Math.max(Math.abs(right)*f/availableX,Math.abs(vertical)*f/availableY,.61));
        }
      }
      this.lastMode = mode; this.lastTime = time; this.lastRecord = record;
      return { target, yaw, pitch, distance, f, cx: this.width * .5, cy: this.height * (mode === 'follow' ? .57 : .53), sinYaw: Math.sin(yaw), cosYaw: Math.cos(yaw), sinPitch: Math.sin(pitch), cosPitch: Math.cos(pitch) };
    }
    _project(p, camera) {
      const x = p.x - camera.target.x, y = p.y - camera.target.y, z = finite(p.z) - finite(camera.target.z);
      const h = -x * camera.sinYaw + y * camera.cosYaw;
      const depth = camera.distance - h * camera.cosPitch - z * camera.sinPitch;
      if (depth < .6) return null;
      const scale = camera.f / depth;
      return { x: camera.cx + (x * camera.cosYaw + y * camera.sinYaw) * scale, y: camera.cy + (h * camera.sinPitch - z * camera.cosPitch) * scale, depth, scale };
    }
    _depth(p,camera){const x=p.x-camera.target.x,y=p.y-camera.target.y,z=finite(p.z)-finite(camera.target.z);return camera.distance-(-x*camera.sinYaw+y*camera.cosYaw)*camera.cosPitch-z*camera.sinPitch;}
    _polygon(vertices, fill, camera, queue, stroke, lineWidth = .5) {
      const clipped=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],da=this._depth(a,camera),db=this._depth(b,camera);if(da>=.601)clipped.push(a);if((da>=.601)!==(db>=.601)){const u=(.601-da)/(db-da);clipped.push(point(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u,finite(a.z)+(finite(b.z)-finite(a.z))*u));}}
      if(clipped.length<3)return;const projected = clipped.map(p => this._project(p, camera));
      if (projected.every(p => p.x < -80) || projected.every(p => p.x > this.width + 80) || projected.every(p => p.y < -80) || projected.every(p => p.y > this.height + 80)) return;
      queue.push({ projected, depth: projected.reduce((s,p) => s+p.depth,0)/projected.length, fill, stroke, lineWidth });
    }
    _paint(queue) {
      const ctx = this.ctx;
      queue.sort((a,b) => b.depth - a.depth);
      for (const f of queue) {
        ctx.beginPath(); f.projected.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath();
        ctx.fillStyle = f.fill; ctx.fill();
        if (f.stroke) { ctx.strokeStyle = f.stroke; ctx.lineWidth = f.lineWidth; ctx.stroke(); }
      }
    }
    _line(vertices, fill, width, camera, dash) {
      const ctx = this.ctx; ctx.beginPath(); let drawing = false;
      for (const v of vertices) { const p = this._project(v,camera); if (!p) { drawing=false; continue; } if (drawing) ctx.lineTo(p.x,p.y); else {ctx.moveTo(p.x,p.y);drawing=true;} }
      ctx.strokeStyle=fill; ctx.lineWidth=width; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    }
    _ground(track, camera) {
      const ctx = this.ctx, queue = [], layout = this._track(track), edges = layout.edges;
      ctx.fillStyle=track.environment?.backgroundColor||(track.environment?'#aeb2a5':'#a8b58b');ctx.fillRect(0,0,this.width,this.height);
      const horizon=clamp(camera.cy-camera.f*Math.tan(camera.pitch),0,this.height);
      if(horizon>0){const gradient=ctx.createLinearGradient(0,0,0,horizon);gradient.addColorStop(0,'#74bce8');gradient.addColorStop(1,'#e4f0f4');ctx.fillStyle=gradient;ctx.fillRect(0,0,this.width,horizon);}
      let layer=null;if(this.surfaceRenderer?.available&&this.surfacePoseAdapter){try{layer=this._surfaceLayer([{mesh:layout.groundMesh,position:point(0,0,0),basis:identity()}],camera);}catch(error){this.surfaceFailure=String(error);this.surfaceRenderer.available=false;}}
      if(layer)ctx.drawImage(layer,0,0,this.width,this.height);
      else{
        for(const face of layout.geometry.ground)this._polygon(face.vertices,face.fill,camera,queue,face.fill,.5);this._paint(queue);queue.length=0;
        for(let i=0;i<edges.length-1;i++){
          const a=edges[i],b=edges[i+1];
          // The generic demo shoulder is absent whenever source environment data exist.
          if(!track.environment){this._polygon([a.leftOut,b.leftOut,b.left,a.left],'#c3c2a7',camera,queue,'#c3c2a7',.6);this._polygon([a.right,b.right,b.rightOut,a.rightOut],'#c3c2a7',camera,queue,'#c3c2a7',.6);}
          const fill=track.environment?.roadColor||track.roadColor||'#656b6d';this._polygon([a.left,b.left,b.right,a.right],fill,camera,queue,fill,.6);
        }
        this._paint(queue);queue.length=0;for(const face of layout.geometry.decals)this._polygon(face.vertices,face.fill,camera,queue,face.fill,.25);this._paint(queue);
      }
      if(!track.environment){this._line(edges.map(p=>({...p.left,z:p.left.z+.013})),'#e9e6d7',1.2,camera);this._line(edges.map(p=>({...p.right,z:p.right.z+.013})),'#e9e6d7',1.2,camera);}
      const zones=[];
      for(const zone of track.zones||[]){
        const s=finite(zone.s,finite(zone.startS,finite(zone.start))),length=finite(zone.length,finite(zone.endS,s+13)-s),side=zone.side==='left'?1:zone.side==='right'?-1:finite(zone.side,1);
        const strip=[];for(let k=0;k<=6;k++){const p=this._sample(track,s+length*k/6),h=finite(p.heading),width=side>0?finite(p.widthLeft,layout.width/2):finite(p.widthRight,layout.width/2),x=p.x-Math.sin(h)*(width-.65)*side,y=p.y+Math.cos(h)*(width-.65)*side;strip.push(point(x,y,this._surface(track,x,y,p.s).z+.04));}
        this._line(strip,'#e9b744',7,camera);
        const p=this._project(strip[3],camera);if(p&&p.depth<camera.distance+150)zones.push({x:p.x,y:p.y,text:zone.label||'ZONE'});
      }
      const scoringEnd=layout.scoringRanges.at(-1)?.end;
      const markers=[[track.judgedStart,'채점 시작',SCORE_COLOR],[scoringEnd,'득점 구간 끝',SCORE_COLOR]];
      if(track.judgedStart>12)markers.unshift([Math.min(12,track.judgedStart/2),'PREP · 준비',INACTIVE_COLOR]);
      for(const [s,label,fill] of markers)if(Number.isFinite(s)){
        const p=this._sample(track,s),h=finite(p.heading),n=point(-Math.sin(h),Math.cos(h));
        const left=finite(p.widthLeft,layout.width/2),right=finite(p.widthRight,layout.width/2),at=d=>{const x=p.x+n.x*d,y=p.y+n.y*d;return point(x,y,this._surface(track,x,y,p.s).z+.045);};
        this._line([at(-right),at(left)],fill,3,camera);
        const tag=this._project({...at(left+2),z:at(left+2).z+.25},camera);if(tag)zones.push({x:tag.x,y:tag.y,text:label});
      }
      ctx.font='600 9px system-ui';ctx.textAlign='center';
      for(const tag of zones){const width=Math.max(48,ctx.measureText(tag.text).width+12);ctx.fillStyle='rgba(31,44,45,.75)';ctx.fillRect(tag.x-width/2,tag.y-14,width,15);ctx.fillStyle='#fff6d7';ctx.fillText(tag.text,tag.x,tag.y-3);}
    }
    _worldWheel(frame, mesh, index,track) {
      const explicit=frame.wheels?.[index];
      if(Number.isFinite(explicit?.x)&&Number.isFinite(explicit?.y))return point(explicit.x,explicit.y,finite(explicit.z,track?this._surface(track,explicit.x,explicit.y,frame.s).z:finite(frame.z))+.04);
      const force=frame.wheelForces?.[index];
      const w=Number.isFinite(force?.x)&&Number.isFinite(force?.y)?force:mesh.wheels[index],c=Math.cos(finite(frame.yaw)),s=Math.sin(finite(frame.yaw));
      const x=frame.x+w.x*c-w.y*s,y=frame.y+w.x*s+w.y*c;return point(x,y,(track?this._surface(track,x,y,frame.s).z:finite(frame.z))+.04);
    }
    _slip(frame,index){
      const value=frame.wheelSlip?.[index]??frame.slips?.[index]??frame.wheels?.[index]?.slip;
      if(typeof value==='number')return Math.hypot(value, Math.tan(clamp(finite(frame.wheelForces?.[index]?.alpha),-.9,.9)));
      if(value&&typeof value==='object')return Math.hypot(finite(value.longitudinal,finite(value.kappa)),finite(value.lateral,finite(value.alpha)));
      return 0;
    }
    _history(record,car,time){
      const frames=framesOf(record);
      if(frames.length)return frames;
      if(time<this.lastLiveTime-.01){this.liveFrames=[];this.wheelAngles=[0,0,0,0];}
      if(time>this.lastLiveTime+.025){this.liveFrames.push({...car,time,wheelSlip:car.wheelSlip?.slice(),wheelOmega:car.wheelOmega?.slice()});if(this.liveFrames.length>2400)this.liveFrames.shift();this.lastLiveTime=time;}
      return this.liveFrames;
    }
    _effects(history,time,mesh,camera,showMarks,showSmoke,track){
      const ctx=this.ctx;this.effects={marks:0,smoke:0};let last=null;
      for(let i=0;i<history.length;i++){
        const frame=history[i],t=frameTime(frame);if(t>time+.002)break;
        if(!last){last=frame;continue;}
        if(t-frameTime(last)<.035&&i<history.length-1)continue;
        const age=time-t;
        for(let wheel=0;wheel<4;wheel++){
          const slip=this._slip(frame,wheel),speed=finite(frame.speed,Math.hypot(finite(frame.vx),finite(frame.vy)));
          if(slip<.07||speed<2)continue;
          const p=this._worldWheel(frame,mesh,wheel,track);
          if(showMarks){const q=this._worldWheel(last,mesh,wheel,track),a=this._project(p,camera),b=this._project(q,camera);if(a&&b&&Math.hypot(p.x-q.x,p.y-q.y)<8){ctx.strokeStyle='rgba(24,30,31,'+clamp(.10+slip*.19,.1,.48)+')';ctx.lineWidth=clamp(a.scale*.18,1,8);ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(a.x,a.y);ctx.stroke();this.effects.marks++;}}
          if(showSmoke&&wheel>=2&&age<2.8&&slip>.13&&i%2===0){
            const strength=clamp((slip-.1)*.65,0,.65),phase=i*1.71+wheel*2.3;
            const world=point(p.x+age*.9+Math.sin(phase)*age*.2,p.y+age*.3+Math.cos(phase)*age*.2,p.z+.16+age*.6);
            const projected=this._project(world,camera);if(!projected)continue;
            const radius=clamp((.25+age*.65)*projected.scale,1,95),alpha=strength*(1-age/2.8)*.21;
            const gradient=ctx.createRadialGradient(projected.x,projected.y,0,projected.x,projected.y,radius);gradient.addColorStop(0,'rgba(239,242,242,'+alpha+')');gradient.addColorStop(1,'rgba(239,242,242,0)');ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(projected.x,projected.y,radius,0,TAU);ctx.fill();this.effects.smoke++;
          }
        }
        last=frame;
      }
    }
    _spin(history,time){
      const angles=[0,0,0,0];for(let i=1;i<history.length;i++){const a=history[i-1],b=history[i],start=frameTime(a),end=Math.min(time,frameTime(b));if(end<=start)break;const dt=end-start;for(let j=0;j<4;j++)angles[j]+=(finite(a.wheelOmega?.[j])+finite(b.wheelOmega?.[j]))*.5*dt;if(frameTime(b)>=time)break;}return angles;
    }
    _surfaceAdapter(){
      const renderer=this.surfaceRenderer;if(!renderer?.available)return;const gl=renderer.gl,old=renderer.program,shaders=gl.getAttachedShaders(old),vertex=shaders.find(s=>gl.getShaderParameter(s,gl.SHADER_TYPE)===gl.VERTEX_SHADER),fragment=shaders.find(s=>gl.getShaderParameter(s,gl.SHADER_TYPE)===gl.FRAGMENT_SHADER);
      // Adapt this renderer instance only. The shared EV2 module and its other
      // instances retain their original API. A full basis supports roll plus
      // steer/spin, which cannot be represented by its yaw/pitch pair alone.
      const original=gl.getShaderSource(vertex),source=original.replace('uniform vec3 uCar;','uniform mat3 uBasis;uniform vec3 uCar;').replace(/vec3 rotateCar\(vec3 p\)\{[^\n]*\}/,'vec3 rotateCar(vec3 p){return uBasis*p;}');
      if(source===original)throw new Error('Vehicle surface pose adapter is incompatible.');
      const adapted=gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(adapted,source);gl.compileShader(adapted);if(!gl.getShaderParameter(adapted,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(adapted));
      const program=gl.createProgram();gl.attachShader(program,adapted);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      renderer.program=program;renderer.attributes=Object.fromEntries(Object.keys(renderer.attributes).map(name=>[name,gl.getAttribLocation(program,name)]));renderer.uniforms=Object.fromEntries([...Object.keys(renderer.uniforms),'uBasis'].map(name=>[name,gl.getUniformLocation(program,name)]));
      gl.deleteProgram(old);gl.deleteShader(vertex);gl.deleteShader(adapted);gl.deleteShader(fragment);this.surfacePoseAdapter=true;
    }
    _surfaceLayer(entries,camera,occluders){
      const renderer=this.surfaceRenderer;if(!renderer?.available||!this.surfacePoseAdapter)return null;const gl=renderer.gl,U=renderer.uniforms,A=renderer.attributes,w=Math.round(this.width*this.dpr),h=Math.round(this.height*this.dpr);
      if(renderer.canvas.width!==w||renderer.canvas.height!==h){renderer.canvas.width=w;renderer.canvas.height=h;}
      gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);gl.useProgram(renderer.program);
      gl.uniform3f(U.uTarget,camera.target.x,camera.target.y,camera.target.z);gl.uniform4f(U.uCamera,camera.yaw,camera.pitch,camera.distance,camera.f);gl.uniform4f(U.uViewport,this.width,this.height,camera.cx,camera.cy);
      const eye=point(camera.target.x-Math.sin(camera.yaw)*Math.cos(camera.pitch)*camera.distance,camera.target.y+Math.cos(camera.yaw)*Math.cos(camera.pitch)*camera.distance,camera.target.z+Math.sin(camera.pitch)*camera.distance);
      gl.uniform3f(U.uEye,eye.x,eye.y,eye.z);
      const all=occluders?[{mesh:occluders,position:point(0,0,0),basis:identity(),depthOnly:true},...entries]:entries;
      let far=Math.max(100,camera.distance*2);for(const entry of all){const bounds=entry.mesh.bounds;if(bounds){for(const x of [bounds.minX,bounds.maxX])for(const y of [bounds.minY,bounds.maxY])for(const z of [bounds.minZ,bounds.maxZ]){const q=applyBasis(entry.basis||identity(),point(x,y,z));far=Math.max(far,this._depth(point(entry.position.x+q.x,entry.position.y+q.y,entry.position.z+q.z),camera)+10);}}else far=Math.max(far,this._depth(entry.position,camera)+Math.hypot(entry.mesh.length||5,entry.mesh.width||2,entry.mesh.height||2)+10);}gl.uniform2f(U.uClip,.6,far);
      for(const entry of all){const p=entry.position;gl.colorMask(!entry.depthOnly,!entry.depthOnly,!entry.depthOnly,!entry.depthOnly);gl.uniform3f(U.uCar,p.x,p.y,p.z);gl.uniformMatrix3fv(U.uBasis,false,entry.basis||identity());
        if(entry.mesh.manufacturer){
          renderer._drawAsset(entry.mesh,p,camera,false,entry.car);
          continue;
        }
        // Asset drawing changes textures, finishes and wheel transforms. Reset
        // every material state before terrain or other generic geometry.
        gl.uniform1f(U.uBrake,0);gl.uniform1f(U.uBrakeBoost,0);gl.uniform3f(U.uBrakeTint,1,.18,.06);
        gl.uniform4f(U.uWheel,0,0,0,0);gl.uniform1f(U.uWheelSteer,0);renderer._bindPaint?.(null);
        gl.uniform1i(U.uPhotoMode,0);gl.uniform3f(U.uModelScale,1,1,1);gl.uniform3f(U.uModelOffset,0,0,0);gl.uniform1f(U.uOpacity,1);gl.uniform1i(U.uHasTexture,0);gl.uniform1i(U.uOpaqueTexture,0);
        if(A.aUV>=0){gl.disableVertexAttribArray(A.aUV);gl.vertexAttrib2f(A.aUV,0,0);}
        const buffer=renderer._buffer(entry.mesh);gl.bindBuffer(gl.ARRAY_BUFFER,buffer.buffer);
        for(const [name,size,offset]of [['aPosition',3,0],['aNormal',3,12],['aColor',3,24],['aMaterial',1,36]])if(A[name]>=0){gl.enableVertexAttribArray(A[name]);gl.vertexAttribPointer(A[name],size,gl.FLOAT,false,40,offset);}gl.drawArrays(gl.TRIANGLES,0,buffer.count);
      }
      gl.colorMask(true,true,true,true);return renderer.canvas;
    }
    _surfaceEntries(frame,mesh,spin,track){
      const pose=this._pose(track,frame),position={...point(pose.x,pose.y,pose.z+.055),angle:finite(frame.yaw)};
      if(mesh.manufacturer)return [{mesh,position,basis:pose.basis,car:{spec:mesh.spec,wheelAngles:spin,steer:finite(frame.steer),brakeLightState:{intensity:clamp(finite(frame.brake),0,1)}}}];
      if(!mesh.surfaceParts){
        const part=faces=>({faces,length:mesh.length,width:mesh.width,height:mesh.height});
        const body=[],wheels=[[],[],[],[]];
        for(const face of mesh.faces){
          const fill=hexColor(face.fill),index=face.wheel;
          if(index>=0&&index<4){
            const center=mesh.wheels[index];
            wheels[index].push({...face,fill,wheel:undefined,part:'drift-wheel',vertices:face.vertices.map(p=>point(p.x-center.x,p.y-center.y,p.z-center.z))});
          }else body.push({...face,fill,wheel:undefined});
        }
        mesh.surfaceParts={body:part(body),wheels:wheels.map(part)};
      }
      const entries=[{mesh:mesh.surfaceParts.body,position,basis:pose.basis}];
      mesh.surfaceParts.wheels.forEach((wheel,index)=>{
        if(!wheel.faces.length)return;const center=applyBasis(pose.basis,mesh.wheels[index]);
        entries.push({mesh:wheel,position:point(position.x+center.x,position.y+center.y,position.z+center.z),basis:multiplyBasis(pose.basis,multiplyBasis(yawBasis(index<2?finite(frame.steer):0),pitchBasis(-finite(spin[index]))))});
      });
      // No selected flag: all five parts must share a single depth buffer.
      return entries;
    }
    _car(frame,mesh,camera,spin,ghost,track){
      const queue=[],ctx=this.ctx,pose=this._pose(track,frame);
      const transform=p=>{const q=applyBasis(pose.basis,p);return point(frame.x+q.x,frame.y+q.y,pose.z+q.z+.055);};
      const shadow=Array.from({length:18},(_,i)=>{const q=transform(point(Math.cos(i/18*TAU)*mesh.length*.53+.25,Math.sin(i/18*TAU)*mesh.width*.57+.15,0));q.z=this._surface(track,q.x,q.y,frame.s).z+.022;return q;});
      this._polygon(shadow,'rgba(26,34,34,.22)',camera,queue);this._paint(queue);queue.length=0;
      if(this.surfaceRenderer?.available){
        let layer;
        try { layer=this._surfaceLayer(this._surfaceEntries(frame,mesh,spin,track),camera,this._track(track).occluders); }
        catch(error){this.surfaceFailure=String(error);this.surfaceRenderer.available=false;}
        if(layer){ctx.save();if(ghost)ctx.globalAlpha=.25;ctx.drawImage(layer,0,0,this.width,this.height);ctx.restore();return;}
      }
      // Software fallback keeps supplied walls/trees in the painter order with
      // the vehicle. The WebGL path above uses their actual depth pre-pass.
      for(const face of this._track(track).geometry.objects)this._polygon(face.vertices,face.fill,camera,queue,face.fill,.3);
      for(const face of mesh.faces){
        let vertices=face.vertices;
        if(face.wheel>=0){const center=mesh.wheels[face.wheel],angle=spin[face.wheel]||0,steer=face.wheel<2?finite(frame.steer):0,cs=Math.cos(angle),sn=Math.sin(angle),ct=Math.cos(steer),st=Math.sin(steer);vertices=vertices.map(p=>{const x=p.x-center.x,y=p.y-center.y,z=p.z-center.z,rx=x*cs+z*sn,rz=-x*sn+z*cs;return point(center.x+rx*ct-y*st,center.y+rx*st+y*ct,center.z+rz);});}
        const world=vertices.map(transform);let fill=face.fill;
        if(face.material==='paint'||face.material==='chrome'){
          const [a,b,c]=world;if(c){const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z,n=point(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx),norm=Math.hypot(n.x,n.y,n.z)||1;
            const light=.66+.34*Math.abs((-.3*n.x-.45*n.y+.84*n.z)/norm);fill=shade(color(fill),light);}
        }
        this._polygon(world,fill,camera,queue,fill,.25);
      }
      ctx.save();if(ghost)ctx.globalAlpha=.25;this._paint(queue);ctx.restore();
    }
    _obstacles(track,camera){
      const queue=[];
      for(const face of this._track(track).geometry.objects)this._polygon(face.vertices,face.fill,camera,queue,face.fill,.35);
      for(const o of track.obstacles||[]){const r=finite(o.r,1),height=finite(o.height,.65),n=12,z=finite(o.z,this._surface(track,o.x,o.y,o.s).z),fill=o.color||'#566063';
        for(let j=0;j<n;j++){const a=j/n*TAU,b=(j+1)/n*TAU;this._polygon([point(o.x+Math.cos(a)*r,o.y+Math.sin(a)*r,z),point(o.x+Math.cos(b)*r,o.y+Math.sin(b)*r,z),point(o.x+Math.cos(b)*r,o.y+Math.sin(b)*r,z+height),point(o.x+Math.cos(a)*r,o.y+Math.sin(a)*r,z+height)],shade(color(fill),j%2?.8:1),camera,queue);}
        this._polygon(Array.from({length:n},(_,j)=>point(o.x+Math.cos(j/n*TAU)*r,o.y+Math.sin(j/n*TAU)*r,z+height)),fill,camera,queue);
      }
      this._paint(queue);
    }
    _map(track,car,reference,record,time,scoreTimeline){
      const trace=scoringTrace(record,scoreTimeline,time),hasTimeline=Array.isArray(scoreTimeline)&&scoreTimeline.length===framesOf(record).length&&scoreTimeline.length>0;
      const ctx=this.ctx,layout=this._track(track),b=layout.bounds,w=Math.min(194,Math.max(148,this.width*.24),this.width-36),h=hasTimeline?173:157,x=this.width-w-18,y=18,pad=17;
      ctx.save();ctx.fillStyle='rgba(246,249,247,.92)';ctx.strokeStyle='rgba(96,117,111,.20)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect?.(x,y,w,h,9);if(!ctx.roundRect)ctx.rect(x,y,w,h);ctx.fill();ctx.stroke();
      const mapHeight=87,scale=Math.min((w-2*pad)/Math.max(1,b.maxX-b.minX),mapHeight/Math.max(1,b.maxY-b.minY));
      const project=p=>({x:x+w/2+(p.x-layout.center.x)*scale,y:y+25+mapHeight/2+(p.y-layout.center.y)*scale});
      for(let i=0;i<layout.edges.length-1;i++){const a=layout.edges[i],b=layout.edges[i+1];ctx.beginPath();[a.left,b.left,b.right,a.right].forEach((p,j)=>{const q=project(p);j?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fillStyle='#cbd1d4';ctx.fill();}
      for(const band of layout.scoreBands){ctx.beginPath();band.path.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.strokeStyle=band.color;ctx.lineWidth=3;ctx.stroke();}
      let drawing=false,earning=null;ctx.lineWidth=2;
      for(const segment of trace){const a=project(segment.a),b=project(segment.b);if(!drawing||earning!==segment.earning){if(drawing)ctx.stroke();ctx.beginPath();ctx.moveTo(a.x,a.y);earning=segment.earning;ctx.strokeStyle=earning?'#167449':INACTIVE_COLOR;drawing=true;}ctx.lineTo(b.x,b.y);}if(drawing)ctx.stroke();
      const marker=(frame,fill)=>{if(!frame)return;const q=project(frame);ctx.fillStyle=fill;ctx.beginPath();ctx.arc(q.x,q.y,3.5,0,TAU);ctx.fill();};marker(reference,'#d39148');marker(car,'#152d37');
      ctx.fillStyle='#405b50';ctx.font='600 10px system-ui';ctx.textAlign='left';ctx.fillText('COURSE',x+12,y+17);ctx.font='10px system-ui';
      const legend=hasTimeline?[[46,SCORE_COLOR,'득점 가능 구간'],[30,'#167449','현재 주행 득점'],[14,INACTIVE_COLOR,'준비·미득점']]:[[30,SCORE_COLOR,'득점 가능'],[14,INACTIVE_COLOR,'준비·비채점']];
      for(const [offset,fill,label] of legend){ctx.fillStyle=fill;ctx.fillRect(x+12,y+h-offset-6,14,3);ctx.fillStyle='#405b50';ctx.fillText(label,x+31,y+h-offset,w-43);}ctx.restore();
    }
    render(options={}){
      const {track,car}=options;if(!track||!car)return;
      this.resize();const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
      const time=finite(options.time,frameTime(car)),mode=options.mode||'follow',mesh=this._vehicle(options.vehicle,car);
      this.scoringRegions=this._track(track).scoringRanges;this.scoringPhase=this.scoringRegions.some(r=>car.s>=r.start&&car.s<=r.end)?'eligible':car.s<(this.scoringRegions[0]?.start??0)?'preparation':'unscored';
      this.modelSource=mesh.sourceInfo;
      this.modelDetail=mesh.manufacturer?{mode:'ev2-full-asset',triangles:mesh.manufacturer.triangles,primitives:mesh.manufacturer.primitives.length,paint:mesh.paint,finish:mesh.paintFinish?.id}: {mode:'loading-placeholder'};
      const camera=this._camera(track,car,mode,finite(options.fov,55),time,options.record);
      const history=this._history(options.record,car,time),reference=options.ghost===false?null:sampleFrames(options.reference,time);
      this._ground(track,camera);
      this._effects(history,time,mesh,camera,options.marks!==false,false,track);
      this._obstacles(track,camera);
      if(reference)this._car(reference,mesh,camera,this._spin(framesOf(options.reference),time),true,track);
      this._car(car,mesh,camera,this._spin(history,time),false,track);
      const marks=this.effects.marks;this._effects(history,time,mesh,camera,false,options.smoke!==false,track);this.effects.marks=marks;
      this._map(track,car,reference,options.record,time,options.scoreTimeline);
      if(!mesh.manufacturer){ctx.fillStyle='rgba(38,55,59,.75)';ctx.fillRect(16,this.height-35,Math.min(310,this.width-32),23);ctx.fillStyle='#f1f5f3';ctx.font='11px system-ui';ctx.textAlign='left';ctx.fillText(mesh.sourceInfo.label,25,this.height-19,this.width-50);}
      this.camera=camera;this.mode=mode;this.currentVehicle=mesh.id;this.fov=finite(options.fov,55);
    }
    getState(){return {renderer:this.surfaceRenderer?.available&&this.surfacePoseAdapter?'perspective-webgl-depth':'perspective-canvas-mesh',threeDimensional:true,terrainElevation:true,vehicleRoll:true,mode:this.mode||'follow',verticalFov:this.fov||55,vehicle:this.currentVehicle,modelSource:this.modelSource,modelDetail:this.modelDetail,surfaceFailure:this.surfaceFailure||null,scoring:{phase:this.scoringPhase||null,meaning:'eligible region; not guaranteed points',ranges:(this.scoringRegions||[]).map(r=>({...r}))},effects:{...this.effects},camera:this.camera?{distance:this.camera.distance,pitch:this.camera.pitch,yaw:this.camera.yaw,target:{...this.camera.target}}:null};}
    destroy(){this.surfaceRenderer?.dispose();this.meshes.clear();this.liveFrames=[];}
  }
  DriftRenderer.sampleFrames=sampleFrames;
  DriftRenderer.scoringRanges=scoringRanges;
  DriftRenderer.scoringTrace=scoringTrace;
  root.DriftRenderer=DriftRenderer;
  if(typeof module!=='undefined'&&module.exports)module.exports=DriftRenderer;
})(typeof window!=='undefined'?window:globalThis);
