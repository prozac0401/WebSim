'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const id='hmg-taean',data=require('./data/environment/korea/hmg-taean-features.json'),bundled=require('./track-environment-data.js');
for(const name of ['pit-facility-data','pit-facilities','circuit-terrain','road-edge-style','road-markings','trackside-boards','track-environment'])require('./'+name+'.js');
const Race=require('./race-engine.js'),Renderer=require('./circuit-renderer.js'),circuits=require('./circuits.js');
const sourceCircuitHash='de6266f87e5c27bfc96b5d86dec0f3d65bde0d44fc54fc96c3b9e4dc242d1ba8';
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area=points=>Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.y-p.y*q.x;},0))/2;
function contains(p,vertices){for(let i=1;i<vertices.length-1;i++){
 const a=vertices[0],b=vertices[i],c=vertices[i+1],d=cross(a,b,c);if(Math.abs(d)<1e-10)continue;
 const u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;if(Math.min(u,v,w)>=-1e-8)return true;
}return false;}
function pointSegmentDistance2(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;}
function segmentDistance2(a,b,c,d){
 if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;
 return Math.min(pointSegmentDistance2(a,c,d),pointSegmentDistance2(b,c,d),pointSegmentDistance2(c,a,b),pointSegmentDistance2(d,a,b));
}
let cached;
function scene(){
 if(cached)return cached;
 const circuit=circuits.find(c=>c.id===id);assert.equal(hash(circuit),sourceCircuitHash,'the dry-handling course and its original elevations stay unchanged');
 const race=new Race({circuit,vehicleIds:['supra'],racingLine:true}),sourceBefore=JSON.stringify(data),bundleBefore=JSON.stringify(bundled[id]),raceBefore=JSON.stringify(race);
 const r=new Renderer({style:{},getContext:()=>({}),addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:900,height:565})});r.setRace(race);
 const saved=globalThis.TrackEnvironmentData;let baseline;
 try{globalThis.TrackEnvironmentData={...saved,[id]:{...data,metadata:undefined}};baseline=Object.create(Renderer.prototype);baseline.race=race;baseline.displayTrack=r.roadSourceTrack;baseline._makeRoad();}
 finally{globalThis.TrackEnvironmentData=saved;}
 cached={r,race,baseline,sourceBefore,bundleBefore,raceBefore};return cached;
}
function stripSample(r,s,side,lateralM=.4){
 const i=r.roadEdges.findIndex((e,j)=>e.s<=s&&(j===r.roadEdges.length-1||r.roadEdges[j+1].s>s));assert(i>=0);
 const a=r.roadEdges[i],b=r.roadEdges[(i+1)%r.roadEdges.length],end=i+1<r.roadEdges.length?b.s:r.roadSourceTrack.centerlineLength;
 const inner=side==='left'?'left':'right',outer=side==='left'?'outerLeft':'outerRight',t=(s-a.s)/(end-a.s);
 const at=e=>{const d=Math.hypot(e[outer].x-e[inner].x,e[outer].y-e[inner].y),q=lateralM/d;return{x:e[inner].x+(e[outer].x-e[inner].x)*q,y:e[inner].y+(e[outer].y-e[inner].y)*q};};
 const p=at(a),q=at(b),position={x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};
 return new Set(r.roadFaces.filter(f=>contains(position,f.vertices)).map(f=>f.fill));
}

test('HMG bundle resolves the onboard observations without conflating the 2022 lap with brochure publication dates',()=>{
 assert.deepEqual(bundled[id],data);const sources=new Map(data.sources.map(s=>[s.id,s]));assert.equal(sources.size,data.sources.length);
 assert.equal(new Set(data.features.map(f=>f.id)).size,data.features.length);
 const video=data.sources.find(s=>String(s.url||'').includes('kg9MqltDL5U'));assert(video,'the user-supplied onboard is cited');assert.equal(video.uploadDate,'2022-11-26');assert.equal(video.rights.redistributed,false);
 const brochure=sources.get('hmg-official-brochure-2025');assert.equal(brochure.publicationYear,2025);assert.equal(brochure.captureYear,null,'publication date does not certify image capture date');
 for(const feature of data.features){assert(sources.has(feature.properties.sourceId),feature.id+' source resolves');assert(feature.properties.evidence,feature.id+' observation is recorded');for(const source of feature.properties.sourceIds||[])assert(sources.has(source));}
 for(const rule of [...(data.metadata.roadEdges||[]),...(data.metadata.roadMarkings||[])]){assert(sources.has(rule.sourceId));assert(rule.evidence);}
});

test('white edges dominate the real road while only cited intervals receive yellow and grey curb paint',t=>{
 const {r}=scene(),m=data.metadata,style=r.roadEdgeStyle,roadFill=style.roadSurfaceColor||'#465250';
 assert.equal(m.defaultRoadEdge,'white-line');assert.equal(style.curbColors.length,2);assert.equal(style.curbBlockLengthM,.8);
 const rgb=style.curbColors.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)));
 assert(rgb.some(([red,green,blue])=>red>150&&green>100&&blue<Math.min(red,green)*.65),'the observed island paint is yellow');
 assert(rgb.some(c=>Math.max(...c)-Math.min(...c)<45),'alternate curb paint remains neutral grey');
 let curb=0,white=0,other=0;const examples={white:[],curb:[],asphalt:[]};
 for(let i=0;i<r.roadEdges.length;i++){
  const a=r.roadEdges[i],end=i+1<r.roadEdges.length?r.roadEdges[i+1].s:r.roadSourceTrack.centerlineLength,s=(a.s+end)/2;
  for(const side of ['left','right']){const kind=style.styleAt(a.s,side);if(kind==='curb')curb+=end-a.s;else if(kind==='white-line')white+=end-a.s;else other+=end-a.s;
   const key=kind==='white-line'?'white':kind;if(examples[key]&&examples[key].length<5)examples[key].push({s,side});
  }
 }
 assert(curb>0&&curb<white,'observed islands do not turn into both full-course curb strips');assert(white>r.roadSourceTrack.centerlineLength);
 for(const {s,side} of examples.white){assert.deepEqual(stripSample(r,s,side,.06),new Set(['#edf0e5']));assert.deepEqual(stripSample(r,s,side,.4),new Set([roadFill]));}
 for(const {s,side} of examples.curb){const colors=stripSample(r,s,side);assert(colors.size&&[...colors].every(c=>style.curbColors.includes(c)));}
 for(const {s,side} of examples.asphalt)assert.deepEqual(stripSample(r,s,side),new Set([roadFill]));
 for(const [s,side] of [[900,'left'],[1620,'left'],[2000,'right'],[2470,'left'],[2620,'left'],[375,'right'],[620,'left']]){
  const opposite=side==='left'?'right':'left';assert.equal(style.styleAt(s,side),'curb',s+' source-observed yellow strip');assert.equal(style.styleAt(s,opposite),'white-line',s+' does not infer a second curb');
  const colors=stripSample(r,s,side);assert(colors.size&&[...colors].every(c=>style.curbColors.includes(c)));assert.deepEqual(stripSample(r,s,opposite),new Set([roadFill]));
 }
 assert(!r.roadFaces.some(f=>f.fill==='#ba6759'||f.fill==='#f0ecdf'),'legacy red/white perimeter paint is removed');
 t.diagnostic(`both-edge totals: ${white.toFixed(1)} m white / ${curb.toFixed(1)} m yellow-grey / ${other.toFixed(1)} m other`);
});

test('material correction preserves exact road XYZ, terrain seams and the separate dry-course race physics',()=>{
 const {r,race,baseline,sourceBefore,bundleBefore,raceBefore}=scene();
 assert.equal(JSON.stringify(data),sourceBefore);assert.equal(JSON.stringify(bundled[id]),bundleBefore);assert.equal(JSON.stringify(race),raceBefore);assert.equal(hash(race.circuit),sourceCircuitHash);
 assert.equal(race.track.centerlineLength,3400);assert(race.cars[0].trackLength<race.track.centerlineLength-50,'canonical road stations differ from the racing line');
 assert.deepEqual(r.roadEdges,baseline.roadEdges);assert.deepEqual(r.supports,baseline.supports);
 assert(Math.abs(r.roadFaces.reduce((s,f)=>s+area(f.vertices),0)-baseline.roadFaces.reduce((s,f)=>s+area(f.vertices),0))<1e-5,'paint partitions preserve complete road coverage');
 assert(r.roadFaces.every(f=>f.road===true));const datum=race.track.elevationMin||0;
 for(let i=0;i<race.track.points.length;i++){const p=race.track.points[i],q=r.roadSourceTrack.points[i];assert.equal(p.x,q.x);assert.equal(p.y,q.y);assert(Math.abs(q.z-(datum+(p.z-datum)*1.75))<1e-8);}
 assert.equal(r.environment.stats.rejected,0);assert.equal(r.pits.stats.rejected,0);
});

test('the cited broken white divider is painted on the road with real asphalt gaps around the full lap',()=>{
 const {r}=scene(),rules=data.metadata.roadMarkings,rule=rules.find(x=>x.id==='hmg-video-dashed-centre');assert(rule);
 assert.equal(rule.type,'line');assert.equal(rule.startM,0);assert.equal(rule.endM,3400);assert.equal(rule.offset,0);assert.equal(rule.width,.13);
 assert.equal(rule.dashLength,3);assert.equal(rule.gapLength,6);assert.equal(r.roadMarkingStats.rejected,0);assert(r.roadMarkingStats.paintedFaces>0);
 const fills=s=>{const p=r.roadGeometry.sample(s);return new Set(r.roadFaces.filter(f=>contains(p,f.vertices)).map(f=>f.fill));};
 for(const base of [0,180,900,1800,2700,3375]){
  assert.deepEqual(fills(base+1.5),new Set([rule.color]),base+' painted dash');
  assert.deepEqual(fills(base+5),new Set([r.roadEdgeStyle.roadSurfaceColor]),base+' actual unpainted asphalt gap');
 }
 assert(r.roadFaces.filter(f=>f.kind==='road-marking').every(f=>f.road===true&&f.sourceId===rule.sourceId),'the divider remains sourced road material, not a floating surface');
});

test('source-backed asphalt and grass paint retain the actual terrain planes and never draw a second floating sheet',t=>{
 const {r}=scene(),terrain=r.terrainGeometry,surfaces=data.features.filter(f=>['grass','asphalt','colored-surface'].includes(f.properties.kind));assert(surfaces.some(f=>f.properties.kind==='asphalt'));
 for(const f of surfaces)assert(f.properties.drapeOnTerrain===true||f.properties.baseMaterial===true,f.id+' uses one ground surface');
 const eligible=f=>['context-ground','terrain-bank'].includes(f.kind),cell=32,grid=new Map();
 for(const f of terrain.faces.filter(eligible)){const xs=f.vertices.map(p=>p.x),ys=f.vertices.map(p=>p.y);for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let y=Math.floor(Math.min(...ys)/cell);y<=Math.floor(Math.max(...ys)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(f);}}
 const actualMasks=surfaces.filter(f=>f.properties.drapeOnTerrain&&!f.properties.baseMaterial),maskIds=new Set(actualMasks.map(f=>f.id));
 const painted=r.contextGround.filter(f=>maskIds.has(f.featureId));assert(painted.length>0);
 assert(r.environment.terrainOverlays.length>0&&r.environment.terrainOverlays.length<1500,'raw source masks avoid redundant road-conforming tessellation');
 for(const feature of actualMasks){
  assert.equal(feature.properties.terrainPaintOnly,true);const masks=r.environment.terrainOverlays.filter(f=>f.featureId===feature.id);assert(masks.length>0,feature.id+' emits actual raw masks');
  for(const mask of masks){assert(area(mask.vertices)>1e-9);for(const p of mask.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));}
  assert(!r.environment.faces.some(f=>f.featureId===feature.id),'paint masks never appear in the independent scenery queue');
 }
 for(const feature of surfaces.filter(f=>f.properties.baseMaterial)){assert.equal(feature.properties.kind,'grass');assert(!r.environment.terrainOverlays.some(f=>f.featureId===feature.id),'base-material grass reserves need no second sheet');assert(!r.environment.faces.some(f=>f.featureId===feature.id));}
 const onPlane=(p,f)=>{const[a,b,c]=f.vertices,d=cross(a,b,c);if(Math.abs(d)<1e-10)return false;const u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;return Math.min(u,v,w)>=-1e-7&&Math.abs(p.z-(u*a.z+v*b.z+w*c.z))<1e-7;};
 const stride=Math.max(1,Math.floor(painted.length/1600)),checkedIds=new Set();let checked=0;
 for(let i=0;i<painted.length;i++){
  const f=painted[i];if(i%stride&&checkedIds.has(f.featureId))continue;checkedIds.add(f.featureId);
  const c=f.vertices.reduce((s,p)=>({x:s.x+p.x/f.vertices.length,y:s.y+p.y/f.vertices.length}),{x:0,y:0});
  assert((grid.get(Math.floor(c.x/cell)+','+Math.floor(c.y/cell))||[]).some(base=>f.vertices.every(p=>onPlane(p,base))),f.featureId+' remains inside one original triangle and on its plane');checked++;
 }
 assert(checked>100);assert.equal(r._sceneryFollowFaces.some(f=>f.terrainDrape),false,'old independently sampled surface sheets are not drawn');
 const areaBefore=terrain.faces.reduce((s,f)=>s+area(f.vertices),0),areaAfter=r.contextGround.reduce((s,f)=>s+area(f.vertices),0);assert(Math.abs(areaAfter-areaBefore)<1e-4,'paint changes no coverage or overlapping area');
 // A later apron can completely cover an earlier shoulder, legitimately
 // replacing its feature ID. Inspect actual material priority at every raw
 // triangle instead of requiring each ID to survive in final fragments.
 const index=faces=>{const cells=new Map();for(const f of faces){const xs=f.vertices.map(p=>p.x),ys=f.vertices.map(p=>p.y);for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let y=Math.floor(Math.min(...ys)/cell);y<=Math.floor(Math.max(...ys)/cell);y++){const key=x+','+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(f);}}return cells;};
 const finalGrid=index(r.contextGround.filter(f=>eligible(f)||maskIds.has(f.featureId))),maskGrid=index(r.environment.terrainOverlays);
 const hits=(cells,p)=>(cells.get(Math.floor(p.x/cell)+','+Math.floor(p.y/cell))||[]).filter(f=>contains(p,f.vertices));
 let visibleSamples=0,overpaintedSamples=0;
 for(const mask of r.environment.terrainOverlays)for(const weights of [[.211,.337,.452],[.617,.241,.142],[.173,.691,.136]]){
  const p=mask.vertices.reduce((s,v,i)=>({x:s.x+v.x*weights[i],y:s.y+v.y*weights[i]}),{x:0,y:0});
  if(!hits(grid,p).length)continue; // Actual road cutouts/outside terrain are unpaintable.
  const expected=hits(maskGrid,p).at(-1),actual=hits(finalGrid,p);assert(expected);assert(actual.length>0,'source ground coverage survives overlapping masks');
  assert(actual.every(f=>f.fill===expected.fill),mask.featureId+' shows the final applicable material');visibleSamples++;if(expected.featureId!==mask.featureId)overpaintedSamples++;
 }
 assert(visibleSamples>500);assert(overpaintedSamples>0,'fixture covers later apron/shoulder priority, not only disjoint masks');
 t.diagnostic(`${painted.length} painted fragments / ${checked} original-plane checks / ${visibleSamples} visible material samples (${overpaintedSamples} later-mask overlaps)`);
});

test('real protection clears every main-road leg, the live service access and the separate mapped oval centreline',t=>{
 const {r,race}=scene(),barriers=data.features.filter(f=>['guardrail','safety-wall','catch-fence'].includes(f.properties.kind));assert(barriers.length>0);
 const faces=r.environment.faces.filter(f=>barriers.some(b=>b.id===f.featureId));for(const f of barriers)assert(faces.some(g=>g.featureId===f.id),f.id+' produces visible protection');
 const access=r.pits.data.features.filter(f=>f.properties.kind==='pit-lane').flatMap(f=>f.geometry.coordinates.slice(1).map((b,i)=>({a:{x:f.geometry.coordinates[i][0],y:f.geometry.coordinates[i][1]},b:{x:b[0],y:b[1]},margin:(f.properties.width||6)/2})));
 const projection=race.track.projection,oval=require('./data/kr-osm/korea-raceways.raw.json').elements.find(e=>e.id===1104429543).geometry.map(p=>({x:((p.lon-projection.origin[0])*projection.metresPerDegree*Math.cos(projection.latitudeRad)-projection.offset.x)*projection.scale,y:(-(p.lat-projection.origin[1])*projection.metresPerDegree-projection.offset.y)*projection.scale}));
 const segments=r.displayTrack.points.map((a,i)=>({a,b:r.displayTrack.points[(i+1)%r.displayTrack.points.length],margin:r.environment.clearanceM})),cell=64,grid=new Map();
 for(const s of segments)for(let x=Math.floor((Math.min(s.a.x,s.b.x)-s.margin)/cell);x<=Math.floor((Math.max(s.a.x,s.b.x)+s.margin)/cell);x++)for(let y=Math.floor((Math.min(s.a.y,s.b.y)-s.margin)/cell);y<=Math.floor((Math.max(s.a.y,s.b.y)+s.margin)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(s);}
 const seen=new Set();let checked=0,minOval=Infinity,minAccess=Infinity;
 for(const f of faces)for(let i=0;i<f.vertices.length;i++){
  const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],key=[a,b].map(p=>p.x.toFixed(6)+','+p.y.toFixed(6)).sort().join('|');if(seen.has(key))continue;seen.add(key);checked++;
  const candidates=new Set();for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++)for(const s of grid.get(x+','+y)||[])candidates.add(s);
  for(const s of candidates)assert(segmentDistance2(a,b,s.a,s.b)>=(s.margin-1e-6)**2,f.featureId+' full rail profile clears every main-road leg');
  for(const s of access){const gap=Math.sqrt(segmentDistance2(a,b,s.a,s.b))-s.margin;minAccess=Math.min(minAccess,gap);assert(gap>0,f.featureId+' does not block the existing service access');}
  assert(!r.pits.contains(a.x,a.y,0),f.featureId+' stays outside occupied pit facilities');
  for(let j=1;j<oval.length;j++)minOval=Math.min(minOval,Math.sqrt(segmentDistance2(a,b,oval[j-1],oval[j])));
 }
 // The source supplies the oval centreline, not surveyed banking or width.
 // This assertion prevents an actual crossing; it does not certify a setback.
 assert(minOval>1,'a roadside rail cannot cross the separate mapped high-speed loop');assert(checked>100);
 t.diagnostic(`${checked} unique rail edges; service-road edge gap ${minAccess.toFixed(2)} m / mapped oval centreline gap ${minOval.toFixed(2)} m`);
});

test('HMG removes unobserved trees and keeps its complete corrected scene within a finite static-geometry budget',t=>{
 const {r}=scene();assert.equal(data.metadata.backgroundTreeLimit,0);assert.equal(r.environment.stats.backgroundTrees,0);assert.equal(r.environment.stats.trees,0,'the evidence does not add roadside woodland inside the separate oval');
 assert.equal(data.metadata.staticWorldGeometry,true);assert.equal(data.metadata.conservativeSceneryVisibility,true);
 const faces=r._staticWorldScene.faces,unique=new Set(faces);assert.equal(faces.length,unique.size);for(const f of [...r.contextGround,...r.roadFaces,...r._sceneryFollowFaces,...r.pits.faces])assert(unique.has(f));
 t.diagnostic(`${faces.length} static faces; ground ${r.contextGround.length}, road ${r.roadFaces.length}, scenery ${r.environment.faces.length}`);
 assert(faces.length<180000&&r.environment.faces.length<50000&&r.contextGround.length<130000,'bounded detailed static scene without per-frame CPU projection');
 for(const f of faces){assert(f.vertices.length>=3);for(const p of f.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));}
});
