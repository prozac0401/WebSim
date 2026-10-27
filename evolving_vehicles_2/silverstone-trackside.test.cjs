'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const id='silverstone',data=require('./data/environment/overseas/silverstone-features.json'),bundled=require('./track-environment-data.js'),pitData=require('./data/pits/silverstone.json');
for(const name of ['pit-facility-data','pit-facilities','circuit-terrain','road-edge-style','road-markings','trackside-boards','track-environment'])require('./'+name+'.js');
const Race=require('./race-engine.js'),Renderer=require('./circuit-renderer.js'),circuits=require('./circuits.js');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const physical=c=>Object.fromEntries(Object.entries(c).filter(([,v])=>typeof v==='number'||Array.isArray(v)));
// Independently captured from 7a3cd13 before the Silverstone appearance changes.
// These constants do not depend on ignored QA files or a second installed checkout.
const baseline={physical:'d5e9fc22a1a1de9e78af0f2d4363ca6d0adbc8be68bb7bc8f05675f2f105efe4',pitFeatures:'6f0a20c8677639b3686f1b33829d40811a779e1d4731c1ee8d8ff31634918158',roadEdges:'fd73229a6dc74add09c9b453d859d94b81879f00c4c78f493dcf859cfbae87f4',supports:'8db86d45f56a26223ae75b73a3db2de1b9b7b431926d11a70e2c3f8b2fb2bec6',terrain:'b37de78e3b186c39bfb523abb9cba97f19328a86dda8a703c375de27a4d88a09'};
const originalWalls=[
 {id:'silverstone-wing-pit-wall',width:.35,coordinates:[[-1.02363406,52.06777251],[-1.02266276,52.06855149],[-1.02150946,52.06947611],[-1.02035707,52.07039938]]},
 {id:'silverstone-national-wall',width:.3,coordinates:[[-1.01736172,52.07854135],[-1.01532968,52.07865605],[-1.01344169,52.0787571],[-1.01219759,52.07878541]]}
];
const originalFootprints={
 'hamilton-left-grass-verge':'52670f0a499685874501cde8d45246e1eca9641a400fb4cdfc9de9c7c6669b72',
 'hamilton-left-grass-approach':'15fd4b4750c716bd515343cc927cbdd615eb4552980d48d8ac48e4c0699c0272',
 'hamilton-left-gravel-apron':'4e74dcb821f84775dbf33611e4e6ad52fd6f401df4529a7695f702ed5dc32e05',
 'hamilton-pit-separation-grass':'0d4cf12f6701c491bd32db675f50d1f46d0834023819607bf0a1a79a448ab5b6'
};
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area=vs=>Math.abs(vs.reduce((s,p,i)=>{const q=vs[(i+1)%vs.length];return s+p.x*q.y-p.y*q.x;},0))/2;
const centroid=f=>f.vertices.reduce((a,p)=>({x:a.x+p.x/f.vertices.length,y:a.y+p.y/f.vertices.length,z:a.z+p.z/f.vertices.length}),{x:0,y:0,z:0});
function onTriangle(p,f){const[a,b,c]=f.vertices,d=cross(a,b,c);if(Math.abs(d)<1e-10)return false;const u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;return Math.min(u,v,w)>=-1e-7&&Math.abs(p.z-(u*a.z+v*b.z+w*c.z))<1e-7;}
function contains(p,f){for(let i=1;i<f.vertices.length-1;i++){const a=f.vertices[0],b=f.vertices[i],c=f.vertices[i+1],d=cross(a,b,c);if(Math.abs(d)<1e-10)continue;const u=cross(b,c,p)/d,v=cross(c,a,p)/d;if(Math.min(u,v,1-u-v)>=-1e-8)return true;}return false;}
function gridForFaces(faces,cell=32){const grid=new Map();for(const f of faces){const xs=f.vertices.map(p=>p.x),ys=f.vertices.map(p=>p.y);for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let y=Math.floor(Math.min(...ys)/cell);y<=Math.floor(Math.max(...ys)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(f);}}return p=>grid.get(Math.floor(p.x/cell)+','+Math.floor(p.y/cell))||[];}
function pointSegmentDistance2(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;}
function segmentDistance2(a,b,c,d){if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;return Math.min(pointSegmentDistance2(a,c,d),pointSegmentDistance2(b,c,d),pointSegmentDistance2(c,a,b),pointSegmentDistance2(d,a,b));}
function project(p,projection){return{x:((p[0]-projection.origin[0])*projection.metresPerDegree*Math.cos(projection.latitudeRad)-projection.offset.x)*projection.scale,y:(-(p[1]-projection.origin[1])*projection.metresPerDegree-projection.offset.y)*projection.scale};}
function localCoordinates(feature,projection,system=data.coordinateSystem){return(feature.geometry.type==='Polygon'?feature.geometry.coordinates[0]:feature.geometry.coordinates).map(p=>system==='wgs84'?project(p,projection):{x:p[0],y:p[1]});}
const eligible=f=>['context-ground','terrain-bank'].includes(f.kind);
let cached;
function scene(){if(cached)return cached;
 const circuit=circuits.find(c=>c.id===id),race=new Race({circuit,vehicleIds:['supra'],racingLine:true}),before={circuit:JSON.stringify(circuit),data:JSON.stringify(data),bundle:JSON.stringify(bundled[id]),pits:JSON.stringify(pitData),race:JSON.stringify(race)};
 const r=new Renderer({style:{},getContext:()=>({}),addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:900,height:565})});r.setRace(race);
 const saved=globalThis.TrackEnvironmentData;let oldRoad;try{globalThis.TrackEnvironmentData={...saved,[id]:{...data,metadata:undefined}};oldRoad=Object.create(Renderer.prototype);oldRoad.race=race;oldRoad.displayTrack=r.roadSourceTrack;oldRoad._makeRoad();}finally{globalThis.TrackEnvironmentData=saved;}
 return cached={r,race,circuit,oldRoad,before};
}

test('Silverstone sources distinguish the requested 2025 lap from older venue observations',()=>{
 assert.deepEqual(bundled[id],data);const sources=new Map(data.sources.map(s=>[s.id,s]));assert.equal(sources.size,data.sources.length);assert.equal(new Set(data.features.map(f=>f.id)).size,data.features.length);
 const video=data.sources.find(s=>JSON.stringify(s).includes('ooeujTa2-k8'));assert(video,'the requested real qualifying lap is cited');assert.match(JSON.stringify(video),/2025/,'the video/event year is explicit');
 assert(sources.has('silverstone-2023-maintenance'),'the documented 2023 partial gravel removal remains available');assert.match(JSON.stringify(sources.get('silverstone-2023-maintenance')),/partial|부분/i);
 assert.match(JSON.stringify(data.metadata),/approx|estimated|추정|측량|uncertain/i,'video-relative placement is not represented as a survey');
 for(const f of data.features){assert(sources.has(f.properties.sourceId),f.id+' source resolves');assert(f.properties.evidence?.trim(),f.id+' observation is recorded');for(const source of f.properties.sourceIds||[])assert(sources.has(source));if(f.geometry.type==='Polygon'){assert.deepEqual(f.geometry.coordinates[0][0],f.geometry.coordinates[0].at(-1));}}
 for(const rule of [...(data.metadata.roadEdges||[]),...(data.metadata.roadMarkings||[])]){assert(sources.has(rule.sourceId));assert(rule.evidence);}
 assert.equal(hash(physical(circuits.find(c=>c.id===id))),baseline.physical);
});

test('the two original Silverstone walls move once while thirteen facilities and the Wing camera remain unchanged',()=>{
 assert.equal(pitData.features.length,13);assert.equal(hash(pitData.features),baseline.pitFeatures);assert.equal(pitData.metadata.focusFeatureId,'silverstone-wing-hall-2');
 const {r}=scene();assert.equal(r.pits.stats.features,13);assert.equal(r.pits.stats.buildings,6);assert.equal(r.pits.stats.garages,76);assert.equal(r.pits.stats.lanes,2);
 for(const original of originalWalls){
  const matches=data.features.filter(f=>f.geometry.type==='LineString'&&JSON.stringify(f.geometry.coordinates)===JSON.stringify(original.coordinates));assert.equal(matches.length,1,original.id+' has exactly one unchanged source trace');const wall=matches[0];
  assert.equal(wall.properties.kind,'safety-wall');assert.equal(wall.properties.width,original.width);assert(wall.properties.advertisement,'the existing wall receives lettering');assert(!r.pits.faces.some(f=>f.featureId===original.id));assert(r.environment.faces.some(f=>f.featureId===wall.id&&f.kind==='safety-wall'));assert(r.environment.faces.some(f=>f.featureId===wall.id&&f.kind==='wall-advertisement'));
 }
 const expected={x:-422.7935848861092,y:1105.1989388909647,z:150.95560624313444};for(const k of['x','y','z'])assert(Math.abs(r.pits.focus.target[k]-expected[k])<1e-9,'focus '+k+' remains on the International Wing');assert(Math.abs(r.pits.focus.distance-421.1592155986946)<1e-9);
});

test('the four older Silverstone footprints retain their geometry and become raw terrain material masks',()=>{
 const {r}=scene();for(const[id,geometryHash]of Object.entries(originalFootprints)){const f=data.features.find(f=>f.id===id);assert(f,id+' retained');assert.equal(hash(f.geometry),geometryHash);assert.equal(f.properties.drapeOnTerrain,true);assert.equal(f.properties.terrainPaintOnly,true);const masks=r.environment.terrainOverlays.filter(q=>q.featureId===id);assert(masks.length>0,id+' produces actual masks');assert(!r.environment.faces.some(q=>q.featureId===id),'raw material has no independently floating sheet');}
 const originalGravel=data.features.find(f=>f.id==='hamilton-left-gravel-apron');assert.deepEqual(originalGravel.properties.trace.centerlineDistanceM,[2940,3160]);assert.deepEqual(originalGravel.properties.trace.lateralOffsetM,[-16,-38]);
});

test('Silverstone appearance preserves measured road coordinates, elevation, physics and the original terrain lattice',()=>{
 const {r,race,circuit,oldRoad,before}=scene();assert.equal(r.roadSourceTrack.centerlineLength,5891);assert.equal(hash(r.roadEdges),baseline.roadEdges);assert.equal(hash(r.supports),baseline.supports);assert.equal(hash(r.terrainGeometry.faces),baseline.terrain,'paint splits original terrain without rebuilding its heights');
 assert(Math.abs(r.roadFaces.reduce((s,f)=>s+area(f.vertices),0)-oldRoad.roadFaces.reduce((s,f)=>s+area(f.vertices),0))<1e-5);assert(r.roadFaces.every(f=>f.road===true));
 const colors=r.roadEdgeStyle.curbColors;assert.equal(colors?.length,2,'the authored white/black palette is active');const brightness=colors.map(c=>[1,3,5].reduce((s,i)=>s+parseInt(c.slice(i,i+2),16),0)/3).sort((a,b)=>a-b);assert(brightness[0]<80&&brightness[1]>190,'curb blocks are black and white rather than inherited red');for(const c of colors)assert(r.roadFaces.some(f=>f.fill===c),'both curb colors reach actual road faces');
 const datum=race.track.elevationMin||0;for(let i=0;i<race.track.points.length;i++){const p=race.track.points[i],q=r.roadSourceTrack.points[i];assert.equal(p.x,q.x);assert.equal(p.y,q.y);assert(Math.abs(q.z-(datum+(p.z-datum)*1.75))<1e-8);}
 assert.equal(JSON.stringify(circuit),before.circuit);assert.equal(JSON.stringify(data),before.data);assert.equal(JSON.stringify(bundled[id]),before.bundle);assert.equal(JSON.stringify(pitData),before.pits);assert.equal(JSON.stringify(race),before.race);
});

test('actual Silverstone terrain has the sourced asphalt and gravel rather than a complete historic Abbey trap',()=>{
 const {r}=scene(),materials=new Map(data.features.map(f=>[f.id,f.properties.kind])),ground=gridForFaces(r.contextGround);
 const at=(s,offset)=>{const q=r.roadGeometry.sample(s),p={x:q.x-Math.sin(q.angle)*offset,y:q.y+Math.cos(q.angle)*offset};return new Set(ground(p).filter(f=>contains(p,f)).map(f=>materials.get(f.featureId)||f.kind));};
 for(const[s,offset,kind]of[[430,-18,'asphalt'],[5400,-20,'gravel'],[3100,-25,'gravel']])assert(at(s,offset).has(kind),`${s}m / ${offset}m is ${kind} on actual ground`);
 for(const s of[3310,3335,3360])assert(!at(s,-25).has('gravel'),'the altered Abbey approach is not restored as one whole historic gravel trap');
});

test('raw Silverstone masks preserve material priority, original triangle planes, area and road cutouts',t=>{
 const {r}=scene(),original=r.terrainGeometry.faces,overlays=r.environment.terrainOverlays,ground=r.contextGround,source=gridForFaces(original.filter(eligible)),painted=gridForFaces(ground),maskGrid=gridForFaces(overlays),ids=new Set(overlays.map(f=>f.featureId));assert(overlays.length>0);
 assert(!r._sceneryFollowFaces.some(f=>f.terrainDrape));assert(Math.abs(ground.reduce((s,f)=>s+area(f.vertices),0)-original.reduce((s,f)=>s+area(f.vertices),0))<1e-4,'painting cannot add or remove ground coverage');
 for(const f of original.filter(f=>!eligible(f)))assert(ground.includes(f),'underlays, terrain base and other protected surfaces retain identity');
 const raw=data.features.filter(f=>f.properties.terrainPaintOnly===true&&!f.properties.baseMaterial);for(const f of raw){const masks=overlays.filter(q=>q.featureId===f.id);assert(masks.length>0,f.id+' has nonempty raw masks');for(const m of masks)assert(m.vertices.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));const expected=area(localCoordinates(f,r.race.track.projection));assert(Math.abs(masks.reduce((s,m)=>s+area(m.vertices),0)-expected)<Math.max(1e-5,expected*1e-9),f.id+' raw masks cover its source footprint');}
 let planeChecks=0,priorityChecks=0;const seen=new Set(),fragments=ground.filter(f=>ids.has(f.featureId)),stride=Math.max(1,Math.floor(fragments.length/1200));assert(fragments.length>0);
 for(let i=0;i<fragments.length;i++){const f=fragments[i];if(i%stride&&seen.has(f.featureId))continue;seen.add(f.featureId);const p=centroid(f);assert(source(p).some(g=>f.vertices.every(q=>onTriangle(q,g))),f.featureId+' stays on one original triangle plane');planeChecks++;}
 // A later overlapping apron may fully cover an earlier source feature. Test
 // its final material at visible mask samples instead of requiring every ID
 // to survive in final fragments.
 for(const mask of overlays){const p=centroid(mask);if(!source(p).some(f=>contains(p,f)))continue;const last=maskGrid(p).filter(f=>contains(p,f)).at(-1);if(!last)continue;assert(painted(p).some(f=>ids.has(f.featureId)&&contains(p,f)&&f.fill===last.fill),'last applicable material wins at a visible terrain sample');priorityChecks++;}
 assert(planeChecks>100);assert(priorityChecks>10);t.diagnostic(`${planeChecks} original-plane / ${priorityChecks} visible material-priority samples`);
});

test('Silverstone wall bodies, glyphs and catch fences clear all road legs and new profiles avoid pit facilities',t=>{
 const {r}=scene(),features=data.features.filter(f=>f.properties.advertisement),faces=r.environment.faces.filter(f=>['safety-wall','wall-advertisement','catch-fence'].includes(f.kind)),stats=r.environment.stats.advertisements;assert(features.length>2);assert(stats);assert.equal(stats.rejectedInvalid,0);assert.equal(stats.rejectedUnsourced,0);assert.equal(stats.truncatedRepeats,0);assert(stats.faces<=12000&&stats.repeats<=128);
 for(const f of data.features.filter(f=>f.properties.kind==='catch-fence'))assert(faces.some(q=>q.featureId===f.id&&q.kind==='catch-fence'),f.id+' produces actual protection mesh');
 for(const f of features){const letters=faces.filter(q=>q.featureId===f.id&&q.kind==='wall-advertisement');assert(letters.length>0,f.id+' retains readable wordmark geometry');assert(letters.every(q=>q.font==='generic-5x7'&&q.wordmarkApproximation===true));}
 const migrated=new Set(originalWalls.map(o=>data.features.find(f=>f.geometry.type==='LineString'&&JSON.stringify(f.geometry.coordinates)===JSON.stringify(o.coordinates)).id));
 const margin=r.environment.clearanceM,cell=64,grid=new Map(),pts=r.displayTrack.points;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],s={a,b};for(let x=Math.floor((Math.min(a.x,b.x)-margin)/cell);x<=Math.floor((Math.max(a.x,b.x)+margin)/cell);x++)for(let y=Math.floor((Math.min(a.y,b.y)-margin)/cell);y<=Math.floor((Math.max(a.y,b.y)+margin)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(s);}}
 const lanes=pitData.features.filter(f=>f.properties.kind==='pit-lane').flatMap(f=>{const ps=localCoordinates(f,r.race.track.projection,pitData.coordinateSystem);return ps.slice(1).map((b,i)=>({a:ps[i],b,margin:f.properties.width/2}));});
 let minimumNewPitGap=Infinity;const seen=new Set();for(const f of faces)for(let i=0;i<f.vertices.length;i++){const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],key=[f.featureId,...[a,b].map(p=>p.x.toFixed(6)+','+p.y.toFixed(6)).sort()].join('|');if(seen.has(key))continue;seen.add(key);const nearby=new Set();for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++)for(const s of grid.get(x+','+y)||[])nearby.add(s);for(const s of nearby)assert(segmentDistance2(a,b,s.a,s.b)>=(margin-1e-6)**2,f.featureId+' full profile clears every road leg');
  // The original approximate Wing wall already overlaps its pit-lane boundary
  // by about 1m. Its exact source trace/width is protected above; do not turn
  // that legacy condition into permission for a newly authored wall to overlap.
  if(migrated.has(f.featureId))continue;
  for(const lane of lanes){const gap=Math.sqrt(segmentDistance2(a,b,lane.a,lane.b))-lane.margin;minimumNewPitGap=Math.min(minimumNewPitGap,gap);assert(gap>=-1e-6,f.featureId+' new profile stays outside the pit fast lane');}
  const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));for(let j=0;j<=n;j++)assert(!r.pits.contains(a.x+(b.x-a.x)*j/n,a.y+(b.y-a.y)*j/n),f.featureId+' new wall avoids occupied pit buildings/aprons');
 }
 assert(seen.size>500);assert(Number.isFinite(minimumNewPitGap));t.diagnostic(`${stats.walls} lettered walls / ${stats.repeats} labels / ${stats.faces} glyph quads / ${seen.size} edges / new pit gap ${minimumNewPitGap.toFixed(3)}m`);
});

test('the complete Silverstone scene remains finite and within bounded static geometry budgets',t=>{
 const {r}=scene();assert.equal(data.metadata.staticWorldGeometry,true);assert.equal(data.metadata.conservativeSceneryVisibility,true);assert.equal(r.environment.stats.rejected,0);assert.equal(r.pits.stats.rejected,0);
 assert.equal(data.metadata.backgroundTreeLimit,0);assert.equal(r.environment.stats.backgroundTrees,0,'the old arbitrary 400-tree background is absent from the observed open fields');assert(!r.environment.objects.some(o=>o.illustrativeVegetation));
 const faces=r._staticWorldScene.faces,set=new Set(faces);assert.equal(set.size,faces.length);for(const f of[...r.contextGround,...r.roadFaces,...r._sceneryFollowFaces,...r.pits.faces])assert(set.has(f));
 assert(faces.length<=180000);assert(r.contextGround.length<=130000);assert(r.environment.faces.length<=50000);for(const f of faces){assert(f.vertices.length>=3);for(const p of f.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));}
 t.diagnostic(`${faces.length} static / ${r.contextGround.length} ground / ${r.environment.faces.length} scenery / ${r.roadFaces.length} road faces`);
});
