'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const id='spa',data=require('./data/environment/overseas/spa-features.json'),bundled=require('./track-environment-data.js'),pitData=require('./data/pits/spa.json');
for(const name of ['pit-facility-data','pit-facilities','circuit-terrain','road-edge-style','road-markings','trackside-boards','track-environment'])require('./'+name+'.js');
const Race=require('./race-engine.js'),Renderer=require('./circuit-renderer.js'),Profile=require('./spa-elevation-profile.js'),circuits=require('./circuits.js');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const physical=c=>Object.fromEntries(Object.entries(c).filter(([,v])=>typeof v==='number'||Array.isArray(v)));
// Captured independently from a0a2ac5 before this scenery update. No ignored QA
// artifacts or another checkout are needed to run these regression contracts.
const baseline={
 physical:'d0f6d3fbf0ec4e2c0f885fb72a071d85b92abba9e5a5cef4756ec807aab3b97c',points:'b4bdcac66e330b9900aeccfa141b4fdb0bce4267f5f11f48786c53312d347ef2',
 dem:'e3b1ec5cc731c38100ba16c58a94e800196aabd4b4921a747cffa93453d7f487',official:'457c66cc34920540465ad9ef3a234cc715208e81cc7522be1ef93bb1a92761cd',
 pitFeatures:'60abdfda912d5724dac6f089a3fb2ca9562b09deb57a12ef90367296b42f455c',pitFaces:'01d9af280ccc667eb94a0226fd83ee0dca1b8bf24318e21f8c01e8573c8a68d0',
 roadEdges:'e63f3c5b930c9d3806fb0f8338ac916801a0b622965edcd4f6dc319de718d29d',supports:'fe365d332610b68eb761ed04b404b0ae06108d38f88a0a0d4cf716ad29cab8d3',
 terrain:'73d5829c0d309e8dc05abe68f2d0048ac814d642dc9d78147bcec0cbfa524732',forestPlanar:'58b31f431273c18005c856a580273ff625170bb5c09861da6391b15d907dcaca'
};
const official=[[0,418],[220,424],[310,419],[690,403],[890,391],[1130,415],[1490,446],[2200,463],[2470,470],[2870,455],[3110,438],[3600,402],[4280,377],[4740,375],[5100,373],[5700,388],[6000,398],[6540,408],[7004,418]];
const originalWalls=[
 {id:'spa-f1-pit-wall',width:.35,coordinates:[[5.9668294,50.44243883],[5.96598889,50.44336642],[5.96515419,50.44429984],[5.96414213,50.44542635]]},
 {id:'spa-endurance-pit-wall',width:.3,coordinates:[[5.96555096,50.44548664],[5.96625128,50.4452274],[5.96697678,50.44480177],[5.96768465,50.44436821],[5.96830449,50.44392664],[5.96893885,50.44346358],[5.96948141,50.4429984]]}
];
const wallIds=new Set(originalWalls.map(f=>f.id));
const originalFootprints={
 'raidillon-right-grass-bank':'0ff939da8b07d628dba0fbf043d1a947ae0b442dd15ad8015d0592607d35219e',
 'raidillon-right-service-road':'8de9122afd2946e17bde98a93f5764fbf6c3a2fd7d002bd974901ee97ecd37ac',
 'raidillon-east-forest':'0671394101ac95c736005b9b4be136f0ad23899be71789a80e64ac5ea44dae5e',
 'raidillon-west-forest':'cb2d92d62887d0fa64ab723ef562b73a447c2de0156031a91ce07e5ab7566a3d',
 'raidillon-lower-forest':'5f487eabf707670285e04be31b15a2f74598144a9f0b37ac35ceeefe2f0167ab',
 'raidillon-left-paved-apron':'a843261ba0e030e20ba382a1005c1d8496aff13b695a2fac401abc2dd82228d3',
 'raidillon-left-painted-0':'e34992ca16089fb47a4fb3192af1cd28345e7357e77a6802cdfe2e09ce589d83',
 'raidillon-left-painted-1':'9e1164129beb6b2a7e1ac91b50f990b84eb59f2ae8c11a91d3c8ce937a86601d',
 'raidillon-left-painted-2':'518d634004ab9405e24d0ae11841af75ca8a7f423b1d96cc371ed44e62e34618',
 'raidillon-left-painted-3':'9f68b4cc5b0c05c7575deaf8f6a0077b1ec672399d60b2e70c2c98b084567771',
 'raidillon-left-painted-4':'d4a044032e18cf513cc75674c4c37a2b2389856d75a21a20bbccdd1a66147e55',
 'raidillon-left-painted-5':'eb8ea6f008b3879ae0844e83066528e6d2310597a9fd30f3e51b466ef2c87e4e',
 'raidillon-left-painted-6':'4fcd1c103e379fced3113a75afed8e6150aaee131c0e5c70bb13338fde22d53e',
 'raidillon-upper-green-runoff':'5068e41d3a3eff4e83c09c6c161a70eaffb03e314d13ceec6a0282e30388eea3',
 'raidillon-upper-right-painted':'aaef836c016426ab4e65db6da3bf0b8aa85d7abc8cb07f136884581d05158fc2'
};
const originalForestIds=new Set(['raidillon-east-forest','raidillon-west-forest','raidillon-lower-forest']);
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

test('Spa observations retain source epochs and separate the supplied footage from the 2026 elevation map',()=>{
 assert.deepEqual(bundled[id],data);const sources=new Map(data.sources.map(s=>[s.id,s]));assert.equal(sources.size,data.sources.length);assert.equal(new Set(data.features.map(f=>f.id)).size,data.features.length);
 assert(data.sources.some(s=>JSON.stringify(s).includes('8_0iCbtBJGw')),'the requested footage is cited');assert(sources.has('spa-2022-raidillon'));assert(sources.has('spa-map-2026'));assert.match(JSON.stringify(data.metadata),/approx|estimated|추정|측량|uncertain/i);
 for(const f of data.features){assert(sources.has(f.properties.sourceId),f.id+' source resolves');assert(f.properties.evidence?.trim(),f.id+' observation is recorded');for(const source of f.properties.sourceIds||[])assert(sources.has(source));if(f.geometry.type==='Polygon')assert.deepEqual(f.geometry.coordinates[0][0],f.geometry.coordinates[0].at(-1));}
 for(const rule of [...(data.metadata.roadEdges||[]),...(data.metadata.roadMarkings||[])]){assert(sources.has(rule.sourceId));assert(rule.evidence);}
});

test('all official Spa altitude anchors and the unchanged calibrated simulation profile survive the scenery update',()=>{
 assert.deepEqual(Profile.stations,official);assert.equal(Profile.metadata.sourcePage,3);for(const[s,z]of official)assert.equal(Profile.sample(s).elevation,z);assert.deepEqual(Profile.sample(0),Profile.sample(7004));assert.equal(Profile.sample(1130).elevation-Profile.sample(890).elevation,24);
 assert.equal(hash(require('./data/elevation/spa.json')),baseline.dem);assert.equal(hash(require('./data/elevation/spa-official-profile-2026.json')),baseline.official);
 const {race,circuit}=scene();assert.equal(hash(physical(circuit)),baseline.physical);assert.equal(hash(race.track.points),baseline.points);assert.equal(race.track.elevationSmoothingMethod,'periodic-monotone-cubic');assert.equal(race.track.elevationSmoothingSigmaM,0);
 for(const p of race.track.points){assert.equal(p.z,Profile.sample(p.s).elevation);assert(Number.isFinite(p.rawZ)&&Number.isFinite(p.demZ),'both original and smoothed DEM samples remain available');}
});

test('Spa retains its two pit complexes and original walls exactly once without changing the F1 camera or buildings',()=>{
 const retained=pitData.features.filter(f=>!wallIds.has(f.id));assert.equal(retained.length,37);assert.equal(hash(retained),baseline.pitFeatures);assert.equal(pitData.metadata.focusFeatureId,'spa-f1-building');
 const {r}=scene();assert.equal(r.pits.stats.buildings,31);assert.equal(r.pits.stats.garages,88);assert.equal(r.pits.stats.lanes,2);assert.equal(hash(r.pits.faces.filter(f=>!wallIds.has(f.featureId))),baseline.pitFaces);
 for(const original of originalWalls){const same=f=>f.geometry.type==='LineString'&&JSON.stringify(f.geometry.coordinates)===JSON.stringify(original.coordinates),old=pitData.features.filter(same),moved=data.features.filter(same);assert.equal(old.length+moved.length,1,original.id+' has one unchanged footprint, optionally migrated for lettering');const wall=(old[0]||moved[0]);assert.equal(wall.properties.width,original.width);if(old.length){assert.equal(wall.properties.kind,'pit-wall');assert(r.pits.faces.some(f=>f.featureId===wall.id));}else{assert.equal(wall.properties.kind,'safety-wall');assert(!r.pits.faces.some(f=>f.featureId===original.id));assert(r.environment.faces.some(f=>f.featureId===wall.id&&f.kind==='safety-wall'));}}
 const expected={x:47.451515544739216,y:1.6893667911778394,z:453.6941208613282};for(const k of['x','y','z'])assert(Math.abs(r.pits.focus.target[k]-expected[k])<1e-9);assert(Math.abs(r.pits.focus.distance-316.9701632016926)<1e-9);
});

test('the fifteen original Spa footprints and all 153 sourced forest tree placements are preserved',()=>{
 for(const[id,geometryHash]of Object.entries(originalFootprints)){const f=data.features.find(f=>f.id===id);assert(f,id+' retained');assert.equal(hash(f.geometry),geometryHash);if(originalForestIds.has(id))assert.equal(f.properties.kind,'forest','photographed woodland is not reclassified as runoff');}
 const {r}=scene(),trees=r.environment.objects.filter(o=>originalForestIds.has(o.featureId));assert.equal(trees.length,153);assert.deepEqual(trees.reduce((m,o)=>(m[o.featureId]=(m[o.featureId]||0)+1,m),{}),{'raidillon-east-forest':68,'raidillon-west-forest':76,'raidillon-lower-forest':9});
 assert.equal(hash(trees.map(({x,y,height,radius,featureId})=>({x,y,height,radius,featureId}))),baseline.forestPlanar,'grounding may alter z, never the retained tree placement or size');
});

test('Spa road edges, supports, base terrain planes and all physical state remain unchanged',()=>{
 const {r,race,circuit,oldRoad,before}=scene();assert.equal(r.roadSourceTrack.centerlineLength,7004);assert.equal(hash(r.roadEdges),baseline.roadEdges);assert.equal(hash(r.supports),baseline.supports);assert.equal(hash(r.terrainGeometry.faces),baseline.terrain);
 assert(Math.abs(r.roadFaces.reduce((s,f)=>s+area(f.vertices),0)-oldRoad.roadFaces.reduce((s,f)=>s+area(f.vertices),0))<1e-5);assert(r.roadFaces.every(f=>f.road===true));
 const datum=race.track.elevationMin||0;for(let i=0;i<race.track.points.length;i++){const p=race.track.points[i],q=r.roadSourceTrack.points[i];assert.equal(p.x,q.x);assert.equal(p.y,q.y);assert(Math.abs(q.z-(datum+(p.z-datum)*1.75))<1e-8,'existing display exaggeration is applied once');}
 assert.equal(JSON.stringify(circuit),before.circuit);assert.equal(JSON.stringify(data),before.data);assert.equal(JSON.stringify(bundled[id]),before.bundle);assert.equal(JSON.stringify(pitData),before.pits);assert.equal(JSON.stringify(race),before.race);
});

test('Spa raw material masks preserve footprint coverage and the original terrain planes and priority',t=>{
 const {r}=scene(),original=r.terrainGeometry.faces,overlays=r.environment.terrainOverlays,ground=r.contextGround,source=gridForFaces(original.filter(eligible)),painted=gridForFaces(ground),maskGrid=gridForFaces(overlays),ids=new Set(overlays.map(f=>f.featureId));assert(overlays.length>0);assert(!r._sceneryFollowFaces.some(f=>f.terrainDrape));
 assert(Math.abs(ground.reduce((s,f)=>s+area(f.vertices),0)-original.reduce((s,f)=>s+area(f.vertices),0))<1e-4);for(const f of original.filter(f=>!eligible(f)))assert(ground.includes(f),'protected underlay/base surfaces are not painted');
 for(const f of data.features.filter(f=>f.properties.terrainPaintOnly===true&&!f.properties.baseMaterial)){const masks=overlays.filter(q=>q.featureId===f.id);assert(masks.length>0,f.id+' produces raw masks');assert(!r.environment.faces.some(q=>q.featureId===f.id),'raw paint creates no floating sheet');for(const m of masks)assert(m.vertices.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));const expected=area(localCoordinates(f,r.race.track.projection));assert(Math.abs(masks.reduce((s,m)=>s+area(m.vertices),0)-expected)<Math.max(1e-5,expected*1e-9));}
 let planeChecks=0,priorityChecks=0;const seen=new Set(),fragments=ground.filter(f=>ids.has(f.featureId)),stride=Math.max(1,Math.floor(fragments.length/1200));assert(fragments.length>0);
 for(let i=0;i<fragments.length;i++){const f=fragments[i];if(i%stride&&seen.has(f.featureId))continue;seen.add(f.featureId);const p=centroid(f);assert(source(p).some(g=>f.vertices.every(q=>onTriangle(q,g))),f.featureId+' lies on its original terrain triangle');planeChecks++;}
 for(const mask of overlays){const p=centroid(mask);if(!source(p).some(f=>contains(p,f)))continue;const last=maskGrid(p).filter(f=>contains(p,f)).at(-1);if(!last)continue;assert(painted(p).some(f=>ids.has(f.featureId)&&contains(p,f)&&f.fill===last.fill),'last visible material wins even when an earlier feature is completely covered');priorityChecks++;}
 const materials=new Map(data.features.map(f=>[f.id,f.properties.kind]));
 // Independently selected interior probes protect the observed distinction:
 // near pavement/paint is not replaced by the farther gravel envelope.
 for(const[s,offset,kind,prefix,color]of[
  [3700,12,'asphalt','spa-2023-pouhon-first-right-paving','#565b58'],
  [3700,25,'gravel','spa-2023-pouhon-first-right-gravel','#c8b99e'],
  [3900,16,'asphalt','spa-2023-pouhon-second-right-paving','#565b58'],
  [3900,31,'gravel','spa-2023-pouhon-second-right-far-gravel','#c8b99e'],
  [6100,12.7,'asphalt','spa-2023-blanchimont-right-paved','#565b58'],
  [6100,17.5,'gravel','spa-2023-blanchimont-right-far-gravel','#c8b99e'],
  [6100,9.5,'colored-surface','spa-2023-blanchimont-right-green','#48a688']
 ]){const q=r.roadGeometry.sample(s),p={x:q.x-Math.sin(q.angle)*offset,y:q.y+Math.cos(q.angle)*offset};assert(painted(p).some(f=>contains(p,f)&&materials.get(f.featureId)===kind&&f.featureId.startsWith(prefix)&&f.fill===color),`${s}m/right${offset}m actual ground keeps ${kind} from ${prefix}`);}
 assert(planeChecks>100);assert(priorityChecks>10);t.diagnostic(`${planeChecks} original-plane / ${priorityChecks} visible material-priority samples`);
});

test('Spa retained forests and newly authored protection contact the actual displayed terrain',t=>{
 const {r}=scene();assert.equal(data.metadata.groundSceneryOnTerrain,true);const ground=(x,y)=>r.terrainGeometry.sampleHeight(x,y);let checks=0;
 for(const tree of r.environment.objects.filter(o=>o.kind==='tree')){const z=ground(tree.x,tree.y);assert(Number.isFinite(z));assert(Math.abs(tree.z-z)<1e-8,tree.featureId+' root is on the actual ground');checks++;}
 for(const f of r.environment.faces.filter(f=>f.kind==='tree-trunk'))for(const p of f.vertices.slice(0,2)){assert(Math.abs(p.z-ground(p.x,p.y))<1e-8,f.featureId+' trunk corners are grounded');checks++;}
 // Tire rims/recesses are elevated details with their own smaller radii, not
 // support footprints. The bottom pair of each first-layer side is the actual
 // ground-contact ring; solid wall/post footprints use the lowest shared XY.
 const feet=new Map();for(const f of r.environment.faces.filter(f=>f.kind==='safety-wall'||f.kind==='guardrail'&&f.barrierPart==='post')){
  const tire=f.barrierMaterial==='tire-stack';if(tire&&(f.barrierPart!=='tire-side'||f.layerIndex!==0))continue;
  for(const p of tire?f.vertices.slice(0,2):f.vertices){const key=f.featureId+':'+p.x.toFixed(9)+','+p.y.toFixed(9),old=feet.get(key);if(!old||p.z<old.z)feet.set(key,{...p,id:f.featureId});}
 }
 for(const p of feet.values()){assert(Math.abs(p.z-ground(p.x,p.y))<1e-7,p.id+' support base touches terrain');checks++;}assert(checks>153);t.diagnostic(`${checks} root/trunk/wall/post contact samples`);
});

test('Spa complete wall, Armco and fence profiles clear every road leg and newly authored pit boundaries',t=>{
 const {r}=scene(),faces=r.environment.faces.filter(f=>['safety-wall','wall-advertisement','guardrail','catch-fence'].includes(f.kind));assert(faces.length>0);
 const migrated=new Set(originalWalls.flatMap(o=>data.features.filter(f=>f.geometry.type==='LineString'&&JSON.stringify(f.geometry.coordinates)===JSON.stringify(o.coordinates)).map(f=>f.id)));
 const margin=r.environment.clearanceM,cell=64,grid=new Map(),pts=r.displayTrack.points;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],s={a,b};for(let x=Math.floor((Math.min(a.x,b.x)-margin)/cell);x<=Math.floor((Math.max(a.x,b.x)+margin)/cell);x++)for(let y=Math.floor((Math.min(a.y,b.y)-margin)/cell);y<=Math.floor((Math.max(a.y,b.y)+margin)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(s);}}
 const lanes=pitData.features.filter(f=>f.properties.kind==='pit-lane').flatMap(f=>{const ps=localCoordinates(f,r.race.track.projection,pitData.coordinateSystem);return ps.slice(1).map((b,i)=>({a:ps[i],b,margin:f.properties.width/2}));});
 let minimumNewPitGap=Infinity;const seen=new Set();for(const f of faces)for(let i=0;i<f.vertices.length;i++){const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],key=[f.featureId,...[a,b].map(p=>p.x.toFixed(6)+','+p.y.toFixed(6)).sort()].join('|');if(seen.has(key))continue;seen.add(key);const nearby=new Set();for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++)for(const s of grid.get(x+','+y)||[])nearby.add(s);for(const s of nearby)assert(segmentDistance2(a,b,s.a,s.b)>=(margin-1e-6)**2,f.featureId+' complete profile clears all road legs');
  for(const lane of lanes){const gap=Math.sqrt(segmentDistance2(a,b,lane.a,lane.b))-lane.margin;assert(gap>=-1e-6,f.featureId+' stays outside either pit fast lane');if(!migrated.has(f.featureId))minimumNewPitGap=Math.min(minimumNewPitGap,gap);}
  if(migrated.has(f.featureId))continue;const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));for(let j=0;j<=n;j++)assert(!r.pits.contains(a.x+(b.x-a.x)*j/n,a.y+(b.y-a.y)*j/n),f.featureId+' avoids existing pit buildings/aprons');
 }
 assert(seen.size>500);assert(Number.isFinite(minimumNewPitGap));for(const f of data.features.filter(f=>['safety-wall','guardrail','catch-fence'].includes(f.properties.kind)))assert(faces.some(q=>q.featureId===f.id),f.id+' is not silently lost');t.diagnostic(`${seen.size} complete protection edges / new pit gap ${minimumNewPitGap.toFixed(3)}m`);
});

test('Spa uses the observed local curb palette and does not import unrelated F1 sponsorship',()=>{
 const {r}=scene();assert.equal(data.features.filter(f=>f.properties.advertisement).length,0,'the 2023 GT3 Cup footage has no sourced sponsor-wall reconstruction');assert.equal(r.environment.faces.filter(f=>f.kind==='wall-advertisement').length,0);assert.equal(r.environment.stats.advertisements,undefined);assert.match(data.metadata.omitted,/sponsor|advertis/i);
 assert.equal(data.metadata.defaultRoadEdge,'white-line');assert.deepEqual(r.roadEdgeStyle.curbColors,['#c84136','#e0be38']);for(const color of r.roadEdgeStyle.curbColors)assert(r.roadFaces.some(f=>f.fill===color));
 for(const[s,side]of[[240,'right'],[900,'left'],[1010,'right'],[1130,'left'],[3650,'left'],[6600,'right']])assert.equal(r.roadEdgeStyle.styleAt(s,side),'curb',`${s}m ${side} observed red-yellow edge`);
 for(const s of[1650,2000,5500])for(const side of['left','right'])assert.equal(r.roadEdgeStyle.styleAt(s,side),'white-line','unobserved straight edges do not become continuous curbs');
});

test('all Spa detail stays finite and within the unchanged scenery and static-world budgets',t=>{
 const {r}=scene();assert.equal(data.metadata.staticWorldGeometry,true);assert.equal(data.metadata.conservativeSceneryVisibility,true);assert.equal(r.environment.stats.rejected,0);assert.equal(r.pits.stats.rejected,0);
 const faces=r._staticWorldScene.faces,set=new Set(faces);assert.equal(set.size,faces.length);for(const f of[...r.contextGround,...r.roadFaces,...r._sceneryFollowFaces,...r.pits.faces])assert(set.has(f));assert(faces.length<=180000);assert(r.contextGround.length<=130000);assert(r.environment.faces.length<=50000);for(const f of faces){assert(f.vertices.length>=3);for(const p of f.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));}
 assert(r.environment.stats.backgroundTrees<=400);t.diagnostic(`${faces.length} static / ${r.contextGround.length} ground / ${r.environment.faces.length} scenery / ${r.roadFaces.length} road faces`);
});
