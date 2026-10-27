'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const id='monza',data=require('./data/environment/overseas/monza-features.json'),bundled=require('./track-environment-data.js'),pitData=require('./data/pits/monza.json');
for(const name of ['pit-facility-data','pit-facilities','circuit-terrain','road-edge-style','road-markings','trackside-boards','track-environment'])require('./'+name+'.js');
const Race=require('./race-engine.js'),Renderer=require('./circuit-renderer.js'),circuits=require('./circuits.js');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const physical=c=>Object.fromEntries(Object.entries(c).filter(([,v])=>typeof v==='number'||Array.isArray(v)));
// Captured independently from cd6e800 before the Monza environment changes.
const sourcePhysicalHash='8dcf38dce13cd6f25280bfb00038bbeb65194ba675327b4daa2b5a2066f68613';
const retainedPitHash='db51f2b7c52c63615b9da08205280d9f26d7f4a73cccc0d7e5bd6c1a388f4fb4';
const originalWall=[[9.28137581,45.61896455],[9.28148524,45.61986035],[9.28161576,45.62093373],[9.28170821,45.62169403]];
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area=vertices=>Math.abs(vertices.reduce((s,p,i)=>{const q=vertices[(i+1)%vertices.length];return s+p.x*q.y-p.y*q.x;},0))/2;
const centroid=f=>f.vertices.reduce((a,p)=>({x:a.x+p.x/f.vertices.length,y:a.y+p.y/f.vertices.length,z:a.z+p.z/f.vertices.length}),{x:0,y:0,z:0});
function onTriangle(p,f){const[a,b,c]=f.vertices,d=cross(a,b,c);if(Math.abs(d)<1e-10)return false;const u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;return Math.min(u,v,w)>=-1e-7&&Math.abs(p.z-(u*a.z+v*b.z+w*c.z))<1e-7;}
function contains(p,f){for(let i=1;i<f.vertices.length-1;i++){const a=f.vertices[0],b=f.vertices[i],c=f.vertices[i+1],d=cross(a,b,c);if(Math.abs(d)<1e-10)continue;const u=cross(b,c,p)/d,v=cross(c,a,p)/d;if(Math.min(u,v,1-u-v)>=-1e-8)return true;}return false;}
function gridForFaces(faces,cell=32){const grid=new Map();for(const f of faces){const xs=f.vertices.map(p=>p.x),ys=f.vertices.map(p=>p.y);for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let y=Math.floor(Math.min(...ys)/cell);y<=Math.floor(Math.max(...ys)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(f);}}return grid;}
function pointSegmentDistance2(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;}
function segmentDistance2(a,b,c,d){if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;return Math.min(pointSegmentDistance2(a,c,d),pointSegmentDistance2(b,c,d),pointSegmentDistance2(c,a,b),pointSegmentDistance2(d,a,b));}
function project(p,projection){return{x:((p[0]-projection.origin[0])*projection.metresPerDegree*Math.cos(projection.latitudeRad)-projection.offset.x)*projection.scale,y:(-(p[1]-projection.origin[1])*projection.metresPerDegree-projection.offset.y)*projection.scale};}
let cached;
function scene(){if(cached)return cached;
 const race=new Race({circuit:circuits.find(c=>c.id===id),vehicleIds:['supra'],racingLine:true}),before={data:JSON.stringify(data),bundle:JSON.stringify(bundled[id]),pits:JSON.stringify(pitData),race:JSON.stringify(race)};
 const r=new Renderer({style:{},getContext:()=>({}),addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:900,height:565})});r.setRace(race);
 const saved=globalThis.TrackEnvironmentData;let baseline;try{globalThis.TrackEnvironmentData={...saved,[id]:{...data,metadata:undefined}};baseline=Object.create(Renderer.prototype);baseline.race=race;baseline.displayTrack=r.roadSourceTrack;baseline._makeRoad();}finally{globalThis.TrackEnvironmentData=saved;}
 return cached={r,race,baseline,before};
}

test('Monza source registry keeps game appearance, actual 2024 changes and unmeasured boundaries distinct',()=>{
 assert.deepEqual(bundled[id],data);const sources=new Map(data.sources.map(s=>[s.id,s]));assert.equal(sources.size,data.sources.length);assert.equal(new Set(data.features.map(f=>f.id)).size,data.features.length);
 const video=data.sources.find(s=>String(s.url||'').includes('ca5pPA1_Vks'));assert(video,'the requested F1 24 guide is cited');assert.match(JSON.stringify(video),/F1\s?24/i);assert.equal(video.uploadDate.replaceAll('-',''),'20250212');
 const real=data.sources.filter(s=>/fia\.com|formula1\.com/.test(s.url||''));assert(real.length>=2,'real event changes and photograph have primary source records');
 assert.match(JSON.stringify(data.metadata),/approx|추정|uncertain|측량/i,'game perspective and source shapes are not a georeferenced survey');
 const projection=Race.buildTrack(circuits.find(c=>c.id===id)).projection;
 for(const f of data.features){assert(sources.has(f.properties.sourceId),f.id+' source resolves');assert(f.properties.evidence,f.id+' observation is recorded');for(const source of f.properties.sourceIds||[])assert(sources.has(source));if(f.geometry.type==='Polygon'){const ring=f.geometry.coordinates[0];assert.deepEqual(ring[0],ring.at(-1));const local=ring.map(p=>data.coordinateSystem==='wgs84'?project(p,projection):{x:p[0],y:p[1]});assert(area(local)>.2,f.id+' remains a useful physical area, measured in square metres rather than degrees');}}
 for(const rule of [...(data.metadata.roadEdges||[]),...(data.metadata.roadMarkings||[])]){assert(sources.has(rule.sourceId));assert(rule.evidence);}
 assert.equal(hash(physical(circuits.find(c=>c.id===id))),sourcePhysicalHash);
});

test('one original Monza pit-wall trace receives lettering while all five other pit facilities remain unchanged',()=>{
 assert.equal(hash(pitData.features),retainedPitHash);assert(!pitData.features.some(f=>f.id==='monza-pit-wall'||f.properties.kind==='pit-wall'));
 const {r}=scene(),old=originalWall.map(p=>project(p,r.race.track.projection)),matches=data.features.filter(f=>f.properties.kind==='safety-wall'&&f.id.includes('pit-wall'));
 assert.equal(matches.length,1,'the migrated wall has exactly one source feature');const wall=matches[0],line=wall.geometry.coordinates.map(p=>data.coordinateSystem==='wgs84'?project(p,r.race.track.projection):{x:p[0],y:p[1]});
 for(const p of line)assert(Math.min(...old.slice(1).map((b,i)=>pointSegmentDistance2(p,old[i],b)))<.001**2,'no parallel shifted replacement trace');
 for(const p of old)assert(line.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<.001),'all four original source vertices remain');
 assert.equal(wall.properties.height,1.15);assert.equal(wall.properties.width,.4);assert.equal(wall.properties.advertisement.text.toUpperCase(),'PIRELLI');
 assert(!r.pits.faces.some(f=>f.featureId==='monza-pit-wall'));assert(r.environment.faces.some(f=>f.featureId===wall.id&&f.kind==='safety-wall'));assert(r.environment.faces.some(f=>f.featureId===wall.id&&f.kind==='wall-advertisement'));
});

test('source-backed short curbs leave the canonical road, supports, coverage, elevation and race state untouched',()=>{
 const {r,race,baseline,before}=scene();assert.equal(r.roadSourceTrack.centerlineLength,5793);assert.equal(data.metadata.defaultRoadEdge,'white-line');assert.deepEqual(r.roadEdges,baseline.roadEdges);assert.deepEqual(r.supports,baseline.supports);
 assert(Math.abs(r.roadFaces.reduce((s,f)=>s+area(f.vertices),0)-baseline.roadFaces.reduce((s,f)=>s+area(f.vertices),0))<1e-5);assert(r.roadFaces.every(f=>f.road===true));
 for(const s of[300,1500,3150,4400])for(const side of['left','right'])assert.equal(r.roadEdgeStyle.styleAt(s,side),'white-line','unobserved straights do not acquire inferred continuous curbs');
 for(const[s,side]of[[625,'right'],[665,'left'],[1880,'right'],[2285,'right'],[2575,'right'],[3645,'left'],[3725,'right'],[3840,'left'],[4930,'right']])assert.equal(r.roadEdgeStyle.styleAt(s,side),'curb',s+' '+side+' is supported by the inspected corner frame');
 const datum=race.track.elevationMin||0;for(let i=0;i<race.track.points.length;i++){const p=race.track.points[i],q=r.roadSourceTrack.points[i];assert.equal(p.x,q.x);assert.equal(p.y,q.y);assert(Math.abs(q.z-(datum+(p.z-datum)*1.75))<1e-8);}
 assert.equal(JSON.stringify(data),before.data);assert.equal(JSON.stringify(bundled[id]),before.bundle);assert.equal(JSON.stringify(pitData),before.pits);assert.equal(JSON.stringify(race),before.race);
});

test('gravel is actually painted at the sourced corners while the later Parabolica exit remains paved',t=>{
 const {r}=scene(),materials=new Map(data.features.map(f=>[f.id,f.properties.kind])),painted=r.contextGround.filter(f=>materials.get(f.featureId)==='gravel');assert(painted.length>0);
 const authored=data.features.filter(f=>f.properties.kind==='gravel'),present=new Set(painted.map(f=>f.featureId));assert(authored.length>=6,'separate corner traps and narrow official additions are authored');for(const f of authored)assert(present.has(f.id),f.id+' produces visible terrain material');
 function kindsAt(s,lateral){const q=r.roadGeometry.sample(s),p={x:q.x-Math.sin(q.angle)*lateral,y:q.y+Math.cos(q.angle)*lateral};return new Set(r.contextGround.filter(f=>contains(p,f)).map(f=>materials.get(f.featureId)||f.kind));}
 assert(kindsAt(4870,-18).has('gravel'),'early/middle outer Parabolica trap is real gravel');const exit=kindsAt(5200,-14);assert(exit.has('asphalt'),'the game exit asphalt is not replaced with an all-corner trap');assert(!exit.has('gravel'));
 const official=authored.filter(f=>/2\.5|2.5/.test(JSON.stringify(f.properties)));assert(official.length>=2,'FIA narrow-strip dimensions remain documented separately from estimated large traps');
 t.diagnostic(`${authored.length} authored gravel regions; ${painted.length} actual painted fragments`);
});

test('gravel, green aprons and asphalt partition existing terrain without floating sheets or footprint holes',t=>{
 const {r}=scene(),terrain=r.terrainGeometry,eligible=f=>['context-ground','terrain-bank'].includes(f.kind),grid=gridForFaces(terrain.faces.filter(eligible)),ids=new Set(r.environment.terrainOverlays.map(f=>f.featureId)),painted=r.contextGround.filter(f=>ids.has(f.featureId));assert(painted.length>0);
 assert(!r._sceneryFollowFaces.some(f=>f.terrainDrape));assert(Math.abs(r.contextGround.reduce((s,f)=>s+area(f.vertices),0)-terrain.faces.reduce((s,f)=>s+area(f.vertices),0))<1e-4,'painting preserves the original terrain area');
 const seen=new Set(),stride=Math.max(1,Math.floor(painted.length/1000));let checked=0;for(let i=0;i<painted.length;i++){const f=painted[i];if(i%stride&&seen.has(f.featureId))continue;seen.add(f.featureId);const c=centroid(f),original=grid.get(Math.floor(c.x/32)+','+Math.floor(c.y/32))||[];assert(original.some(g=>f.vertices.every(p=>onTriangle(p,g))),f.featureId+' stays inside one original triangle on its original plane');checked++;}assert(checked>100);t.diagnostic(`${checked} original terrain-triangle checks`);
});

test('complete advertising walls and their readable glyphs clear every nearby road leg without losing later sponsor regions',t=>{
 const {r}=scene(),features=data.features.filter(f=>f.properties.advertisement),faces=r.environment.faces.filter(f=>['safety-wall','wall-advertisement'].includes(f.kind)),stats=r.environment.stats.advertisements;assert(features.length>=8);assert(stats);assert.equal(stats.rejectedInvalid,0);assert.equal(stats.rejectedUnsourced,0);assert.equal(stats.truncatedRepeats,0,'budget allocation preserves the later regions instead of truncating after the main straight');assert(stats.faces<=12000&&stats.repeats<=128);
 for(const f of features){const letters=faces.filter(q=>q.featureId===f.id&&q.kind==='wall-advertisement');assert(letters.length>0,f.id+' retains visible lettering');assert(letters.every(q=>q.font==='generic-5x7'&&q.wordmarkApproximation===true),'functional vector lettering is not a reproduced sponsor artwork');}
 const margin=r.environment.clearanceM,cell=64,grid=new Map(),pts=r.displayTrack.points;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],s={a,b};for(let x=Math.floor((Math.min(a.x,b.x)-margin)/cell);x<=Math.floor((Math.max(a.x,b.x)+margin)/cell);x++)for(let y=Math.floor((Math.min(a.y,b.y)-margin)/cell);y<=Math.floor((Math.max(a.y,b.y)+margin)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(s);}}
 const lanes=pitData.features.filter(f=>f.properties.kind==='pit-lane').flatMap(f=>{const ps=f.geometry.coordinates.map(p=>project(p,r.race.track.projection));return ps.slice(1).map((b,i)=>({a:ps[i],b,margin:f.properties.width/2}));}),old=originalWall.map(p=>project(p,r.race.track.projection));
 // The original approximate wall/fast-lane outlines already share a boundary.
 // Preserve that exact footprint; new walls must not introduce another overlap.
 let baselinePitGap=Infinity;for(let i=1;i<old.length;i++)for(const lane of lanes)baselinePitGap=Math.min(baselinePitGap,Math.sqrt(segmentDistance2(old[i-1],old[i],lane.a,lane.b))-lane.margin-.2);
 let minimumNewPitGap=Infinity,minimumOriginalPitGap=Infinity;const seen=new Set();for(const f of faces)for(let i=0;i<f.vertices.length;i++){const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],key=[f.featureId,...[a,b].map(p=>p.x.toFixed(6)+','+p.y.toFixed(6)).sort()].join('|');if(seen.has(key))continue;seen.add(key);const nearby=new Set();for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++)for(const s of grid.get(x+','+y)||[])nearby.add(s);for(const s of nearby)assert(segmentDistance2(a,b,s.a,s.b)>=(margin-1e-6)**2,f.featureId+' full profile clears every road leg');
  for(const lane of lanes){const gap=Math.sqrt(segmentDistance2(a,b,lane.a,lane.b))-lane.margin;if(f.featureId.includes('pit-wall')){minimumOriginalPitGap=Math.min(minimumOriginalPitGap,gap);assert(gap>=baselinePitGap-.001,'migrated original wall does not worsen its pre-existing approximate pit boundary');}else{minimumNewPitGap=Math.min(minimumNewPitGap,gap);assert(gap>=-1e-6,f.featureId+' new wall cannot enter the pit fast lane');}}
 }
 assert(seen.size>500);t.diagnostic(`${stats.walls} lettered walls / ${stats.repeats} complete labels / ${stats.faces} glyph quads / ${seen.size} protection edges; pit gaps new ${minimumNewPitGap.toFixed(3)} m, original ${minimumOriginalPitGap.toFixed(3)} m (baseline ${baselinePitGap.toFixed(3)} m)`);
});

test('all finite Monza scenery and material detail fit the opt-in static-world budgets',t=>{
 const {r}=scene();assert.equal(data.metadata.staticWorldGeometry,true);assert.equal(data.metadata.conservativeSceneryVisibility,true);assert.equal(r.environment.stats.rejected,0);assert.equal(r.pits.stats.rejected,0);
 const background=r.environment.objects.filter(o=>o.illustrativeVegetation);assert.equal(background.length,r.environment.stats.backgroundTrees);assert(background.length>0&&background.length<=400,'Monza retains its bounded illustrative woodland background');assert.match(r.environment.illustrativeVegetation.classification,/not photo-confirmed/);
 const faces=r._staticWorldScene.faces,set=new Set(faces);assert.equal(set.size,faces.length);for(const f of [...r.contextGround,...r.roadFaces,...r._sceneryFollowFaces,...r.pits.faces])assert(set.has(f));
 assert(faces.length<=180000);assert(r.contextGround.length<=130000);assert(r.environment.faces.length<=50000);for(const f of faces){assert(f.vertices.length>=3);for(const p of f.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));}
 t.diagnostic(`${faces.length} static / ${r.contextGround.length} ground / ${r.environment.faces.length} scenery / ${r.roadFaces.length} road faces`);
});
