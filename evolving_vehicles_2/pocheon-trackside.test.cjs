'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const id='pocheon',data=require('./data/environment/korea/pocheon-features.json'),bundled=require('./track-environment-data.js'),pitData=require('./data/pits/pocheon.json');
for(const name of ['pit-facility-data','pit-facilities','circuit-terrain','road-edge-style','road-markings','trackside-boards','track-environment'])require('./'+name+'.js');
const Race=require('./race-engine.js'),Renderer=require('./circuit-renderer.js'),circuits=require('./circuits.js');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const physical=c=>Object.fromEntries(Object.entries(c).filter(([,v])=>typeof v==='number'||Array.isArray(v)));
// Independently captured from release b555364. Status prose may change, but
// original coordinates/order, lengths and every supplied elevation may not.
const sourcePhysicalHash='7717ac60ce73dc3d15a75d1ecb6258dcd6412ef291c94c968a3f556049f3df1e';
const retainedPitHash='9ec3a38320d73448fa08134eca4d41070ac6a1aeea2700f3db61d7b41529faed';
const oldWall=[[-46.68,-101.03],[-19.4,-47.02],[15.65,3.79],[47.43,49.9],[63.88,73.7]];
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area=vertices=>Math.abs(vertices.reduce((s,p,i)=>{const q=vertices[(i+1)%vertices.length];return s+p.x*q.y-p.y*q.x;},0))/2;
const centroid=f=>f.vertices.reduce((a,p)=>({x:a.x+p.x/f.vertices.length,y:a.y+p.y/f.vertices.length,z:a.z+p.z/f.vertices.length}),{x:0,y:0,z:0});
function onTriangle(p,f){const[a,b,c]=f.vertices,d=cross(a,b,c);if(Math.abs(d)<1e-10)return false;const u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;return Math.min(u,v,w)>=-1e-7&&Math.abs(p.z-(u*a.z+v*b.z+w*c.z))<1e-7;}
function gridForFaces(faces,cell=32){const grid=new Map();for(const f of faces){const xs=f.vertices.map(p=>p.x),ys=f.vertices.map(p=>p.y);for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let y=Math.floor(Math.min(...ys)/cell);y<=Math.floor(Math.max(...ys)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(f);}}return grid;}
function pointSegmentDistance2(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;}
function segmentDistance2(a,b,c,d){if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;return Math.min(pointSegmentDistance2(a,c,d),pointSegmentDistance2(b,c,d),pointSegmentDistance2(c,a,b),pointSegmentDistance2(d,a,b));}
function metreSamples(line){const parts=[];let length=0;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],span=Math.hypot(b[0]-a[0],b[1]-a[1]);if(span){parts.push({a,b,span,start:length});length+=span;}}const out=[];let index=0;for(let s=0;s<=length;s++){while(index<parts.length-1&&s>parts[index].start+parts[index].span)index++;const p=parts[index],u=(s-p.start)/p.span;out.push({x:p.a[0]+(p.b[0]-p.a[0])*u,y:p.a[1]+(p.b[1]-p.a[1])*u});}return out;}
let cached;
function scene(){
 if(cached)return cached;
 const circuit=circuits.find(c=>c.id===id),race=new Race({circuit,vehicleIds:['supra'],racingLine:true});
 const before={data:JSON.stringify(data),bundle:JSON.stringify(bundled[id]),pits:JSON.stringify(pitData),race:JSON.stringify(race)};
 const r=new Renderer({style:{},getContext:()=>({}),addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:900,height:565})});
 // Capture the renderer's real, ungraded first-pass height input. This permits
 // a physical road-slope reference without copying terrain field equations.
 const terrain=globalThis.CircuitTerrain,buildTerrain=terrain.build;let terrainInput;
 try{terrain.build=(track,edges,options)=>{terrainInput={track,edges,options};return buildTerrain(track,edges,options);};r.setRace(race);}
 finally{terrain.build=buildTerrain;}
 const saved=globalThis.TrackEnvironmentData;let baseline;
 try{globalThis.TrackEnvironmentData={...saved,[id]:{...data,metadata:undefined}};baseline=Object.create(Renderer.prototype);baseline.race=race;baseline.displayTrack=r.roadSourceTrack;baseline._makeRoad();}
 finally{globalThis.TrackEnvironmentData=saved;}
 return cached={r,race,baseline,before,terrainInput};
}

test('Pocheon source registry distinguishes historical geometry from documented later use and leaves physical inputs untouched',()=>{
 assert.deepEqual(bundled[id],data);const sources=new Map(data.sources.map(s=>[s.id,s]));assert.equal(sources.size,data.sources.length);
 assert.equal(new Set(data.features.map(f=>f.id)).size,data.features.length);
 const video=data.sources.find(s=>String(s.url||'').includes('s0QiK0GTXl4'));assert(video);assert.equal(video.publishedAt,'2018-10-29');assert.equal(video.captureDate,null);
 const circuit=circuits.find(c=>c.id===id);assert.equal(circuit.category,'자동차 경주장');assert.equal(circuit.statusNote,'주행·시승 행사 활용 코스');assert(circuit.statusSourceUrl);
 const status=data.sources.find(s=>s.url===circuit.statusSourceUrl);assert(status,'status resolves to a separate evidence record');assert.equal(status.eventDate,'2023-01-17');
 assert(!circuit.statusSourceUrl.includes('s0QiK0GTXl4'),'2018 footage alone does not establish later operation');
 assert.equal(hash(physical(circuit)),sourcePhysicalHash);
 for(const f of data.features){assert(sources.has(f.properties.sourceId),f.id+' source resolves');assert(f.properties.evidence,f.id+' observation is explicit');for(const source of f.properties.sourceIds||[])assert(sources.has(source));}
 for(const rule of [...(data.metadata.roadEdges||[]),...(data.metadata.roadMarkings||[])]){assert(sources.has(rule.sourceId));assert(rule.evidence);}
});

test('the original pit wall moves once to scenery while all other authored pit facilities stay unchanged',()=>{
 assert.equal(hash(pitData.features),retainedPitHash,'only the old wall is removed from pit data');
 assert(!pitData.features.some(f=>f.id==='pocheon-wall'||f.properties.kind==='pit-wall'));
 const walls=data.features.filter(f=>f.id==='pocheon-concrete-pit-wall');
 assert.equal(walls.length,1,'the source-reviewed wall trace is reused once, not offset into a parallel wall');
 assert.equal(walls[0].properties.material,'concrete-safety-wall');
 // The old trace is sampled more densely and clipped to leave the service
 // entrance open. Every retained point must still lie on that original trace.
 const oldSegments=oldWall.slice(1).map((b,i)=>({a:{x:oldWall[i][0],y:oldWall[i][1]},b:{x:b[0],y:b[1]}}));
 for(const[x,y]of walls[0].geometry.coordinates)assert(Math.min(...oldSegments.map(s=>pointSegmentDistance2({x,y},s.a,s.b)))<.001**2,'retained wall points are not shifted into a new parallel barrier');
 const {r}=scene();assert(r.environment.faces.some(f=>f.featureId===walls[0].id&&f.barrierMaterial==='concrete-safety-wall'));
 assert(!r.pits.faces.some(f=>f.featureId==='pocheon-wall'));
 const fence=data.features.filter(f=>f.properties.kind==='catch-fence'&&JSON.stringify(f.geometry.coordinates)===JSON.stringify(walls[0].geometry.coordinates));assert.equal(fence.length,1,'one fence follows the relocated pit wall');
});

test('blue-white short curbs use reverse-video sides without replacing the legacy hairpin geometry or its heights',()=>{
 const {r,race,baseline,before}=scene();assert.equal(r.roadGeometry.stats.method,'legacy-offset-fallback');
 assert.equal(r.roadSourceTrack.centerlineLength,3159);assert.equal(data.metadata.defaultRoadEdge,'white-line');
 assert.deepEqual(r.roadEdges,baseline.roadEdges);assert.deepEqual(r.supports,baseline.supports);
 assert(Math.abs(r.roadFaces.reduce((s,f)=>s+area(f.vertices),0)-baseline.roadFaces.reduce((s,f)=>s+area(f.vertices),0))<1e-5);
 assert(r.roadFaces.every(f=>f.road===true));const colors=r.roadEdgeStyle.curbColors;
 assert(colors.some(c=>{const rgb=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));return rgb[2]>rgb[0]+50&&rgb[1]>rgb[0]+40;}),'observed cyan-blue, not the former red perimeter');
 assert(colors.some(c=>[1,3,5].every(i=>parseInt(c.slice(i,i+2),16)>210)),'white blocks remain white');
 for(const[s,side]of[[2970,'right'],[2900,'left'],[2300,'left'],[1700,'right'],[1560,'right'],[150,'right']])assert.equal(r.roadEdgeStyle.styleAt(s,side),'curb',s+' side is already converted from reverse video');
 for(const s of[650,750,1030,1100])for(const side of['left','right'])assert.equal(r.roadEdgeStyle.styleAt(s,side),'white-line','straight and mismatched northern extension receive no invented curbs');
 const datum=race.track.elevationMin||0;for(let i=0;i<race.track.points.length;i++){const p=race.track.points[i],q=r.roadSourceTrack.points[i];assert.equal(p.x,q.x);assert.equal(p.y,q.y);assert(Math.abs(q.z-(datum+(p.z-datum)*1.75))<1e-8);}
 assert.equal(JSON.stringify(data),before.data);assert.equal(JSON.stringify(bundled[id]),before.bundle);assert.equal(JSON.stringify(pitData),before.pits);assert.equal(JSON.stringify(race),before.race);
});

test('all source reed clumps and retained trees use the actual rendered ground without partial or arbitrarily truncated vegetation',t=>{
 const {r}=scene();assert.equal(data.metadata.groundSceneryOnTerrain,true);assert.equal(data.metadata.backgroundTreeLimit,0);assert.equal(r.environment.stats.backgroundTrees,0);
 const fields=data.features.filter(f=>f.properties.kind==='tall-grass');assert.equal(fields.length,3);const authoredCap=fields.reduce((n,f)=>n+f.properties.maxClumps,0);assert(authoredCap>400&&authoredCap<=800,'dense source fields remain within the runtime vegetation limit');
 const reeds=r.environment.objects.filter(o=>o.kind==='tall-grass'),trees=r.environment.objects.filter(o=>o.kind==='tree');
 assert(reeds.length>400&&reeds.length<=authoredCap);assert.equal(trees.length,98,'the existing mapped woodland remains intact');assert(!r.environment.stats.tallGrassLimitReached,'the global cap cannot truncate the last source field');
 for(const field of fields){const count=reeds.filter(o=>o.featureId===field.id).length;assert(count>0&&count<=field.properties.maxClumps,field.id+' is represented within its authored cap');assert.equal(r.environment.faces.filter(f=>f.featureId===field.id&&f.kind==='tall-grass').length,count*39,'complete three-stalk clumps survive');}
 for(const o of [...reeds,...trees]){const z=r.terrainGeometry.sampleHeight(o.x,o.y);assert(Number.isFinite(z));assert(Math.abs(o.z-z)<1e-8,o.featureId+' root is on the same triangle surface');assert(Math.abs(r.environment.groundHeight(o.x,o.y)-z)<1e-8);assert(!r.pits.contains(o.x,o.y,o.radius+.1),'vegetation cannot block the live pit lane or paddock');}
 for(const f of r.environment.faces.filter(f=>f.kind==='tall-grass'&&f.vegetationPart==='stem'))for(const p of f.vertices.slice(0,2))assert(Math.abs(p.z-r.terrainGeometry.sampleHeight(p.x,p.y))<1e-8,'every stalk foot follows the actual ground, not one distant clump-centre height');
 for(const o of reeds)assert(r.environment.roadDistance(o.x,o.y)>=r.environment.clearanceM+o.radius+.1-1e-7,'full reed envelope clears every main-road leg');
 t.diagnostic(`${reeds.length} complete reed clumps + ${trees.length} retained source trees`);
});

test('complete PVC ribs, concrete stripes and fences clear every nearby road leg and the unchanged pit access',t=>{
 const {r,terrainInput}=scene(),kinds=['safety-wall','catch-fence','guardrail','retaining-wall'],features=data.features.filter(f=>kinds.includes(f.properties.kind)),faces=r.environment.faces.filter(f=>kinds.includes(f.kind));assert(features.length>0&&faces.length>0);
 for(const feature of features){const emitted=faces.filter(f=>f.featureId===feature.id);assert(emitted.length>0,feature.id+' produces real protection');if(feature.properties.kind==='safety-wall')assert(emitted.every(f=>f.barrierMaterial===feature.properties.material),feature.id+' keeps the source material classification');}
 assert(faces.some(f=>f.barrierMaterial==='pvc-corrugated'&&f.barrierPart==='corrugation'));assert(faces.some(f=>f.barrierMaterial==='concrete-safety-wall'&&f.barrierPart==='hazard-stripe'));
 const pts=r.displayTrack.points,margin=r.environment.clearanceM,cell=64,grid=new Map();
 for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],s={a,b};for(let x=Math.floor((Math.min(a.x,b.x)-margin)/cell);x<=Math.floor((Math.max(a.x,b.x)+margin)/cell);x++)for(let y=Math.floor((Math.min(a.y,b.y)-margin)/cell);y<=Math.floor((Math.max(a.y,b.y)+margin)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(s);}}
 const lanes=pitData.features.filter(f=>f.properties.kind==='pit-lane').flatMap(f=>f.geometry.coordinates.slice(1).map((b,i)=>({a:{x:f.geometry.coordinates[i][0],y:f.geometry.coordinates[i][1]},b:{x:b[0],y:b[1]},margin:(f.properties.width||6)/2})));
 const checked=new Set();let minimumPitGap=Infinity;
 for(const f of faces)for(let i=0;i<f.vertices.length;i++){const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],key=[a,b].map(p=>p.x.toFixed(6)+','+p.y.toFixed(6)).sort().join('|');if(checked.has(key))continue;checked.add(key);const nearby=new Set();for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++)for(const s of grid.get(x+','+y)||[])nearby.add(s);for(const s of nearby)assert(segmentDistance2(a,b,s.a,s.b)>=(margin-1e-6)**2,f.featureId+' full profile clears all road legs');for(const s of lanes){const gap=Math.sqrt(segmentDistance2(a,b,s.a,s.b))-s.margin;minimumPitGap=Math.min(minimumPitGap,gap);assert(gap>=-1e-6,f.featureId+' cannot block the pit lane');}}
 // Compare changes over a 3 m barrier bay, subtracting the actual road-height
 // input so legitimate uphill/downhill grade is not mistaken for zigzag.
 // A coarse terrain cell must not add a visible 15 cm rise within that bay.
 let maximumExtraRise=0;
 for(const feature of features.filter(f=>f.properties.material==='pvc-corrugated')){
  const rows=metreSamples(feature.geometry.coordinates).map(p=>({...p,z:r.terrainGeometry.sampleHeight(p.x,p.y),reference:terrainInput.options.groundHeight(p.x,p.y)}));
  for(let i=3;i<rows.length;i++){const a=rows[i-3],b=rows[i],extra=Math.abs((b.z-a.z)-(b.reference-a.reference));maximumExtraRise=Math.max(maximumExtraRise,extra);assert(extra<.15,feature.id+' avoids a terrain-induced three-metre zigzag: '+extra.toFixed(4)+' m');}
 }
 assert(checked.size>100);t.diagnostic(`${checked.size} unique protection edges; minimum pit-lane edge gap ${minimumPitGap.toFixed(3)} m; extra PVC rise ${maximumExtraRise.toFixed(4)} m per 3 m`);
});

test('brown verges and existing mapped surfaces paint existing terrain planes with unchanged coverage',t=>{
 const {r,terrainInput}=scene(),terrain=r.terrainGeometry,eligible=f=>['context-ground','terrain-bank'].includes(f.kind),grid=gridForFaces(terrain.faces.filter(eligible));
 assert.equal(data.metadata.gradedShoulder,true);assert.equal(terrainInput.options.gradedShoulder,true);assert.equal(terrainInput.options.relief,undefined,'a graded verge must not invent a DEM relief field');
 const grading=terrain.stats.gradedShoulder;assert(grading&&grading.refinedCells>0);assert.equal(terrain.stats.relief,undefined);assert.equal(grading.shoulderM,8);assert(grading.shoulderCellM<=6);assert.equal(grading.minDeltaM,0);assert.equal(grading.maxDeltaM,0);
 const overlays=r.environment.terrainOverlays;assert(overlays.length>0);const ids=new Set(overlays.map(f=>f.featureId)),painted=r.contextGround.filter(f=>ids.has(f.featureId));assert(painted.length>0);
 assert(!r._sceneryFollowFaces.some(f=>f.terrainDrape),'no independently sampled floating surface is queued on top of ground');
 assert(Math.abs(r.contextGround.reduce((s,f)=>s+area(f.vertices),0)-terrain.faces.reduce((s,f)=>s+area(f.vertices),0))<1e-4,'material partitions preserve the exact terrain footprint');
 const stride=Math.max(1,Math.floor(painted.length/1000)),seen=new Set();let checked=0;
 for(let i=0;i<painted.length;i++){const f=painted[i];if(i%stride&&seen.has(f.featureId))continue;seen.add(f.featureId);const c=centroid(f),original=grid.get(Math.floor(c.x/32)+','+Math.floor(c.y/32))||[];assert(original.some(g=>f.vertices.every(p=>onTriangle(p,g))),f.featureId+' stays inside one original terrain triangle and on its original plane');checked++;}
 assert(checked>50);t.diagnostic(`${painted.length} painted fragments; ${checked} original triangle-plane checks`);
});

test('Pocheon retains every finite detailed scene component within the opt-in static-world budget',t=>{
 const {r}=scene();assert.equal(data.metadata.staticWorldGeometry,true);assert.equal(data.metadata.conservativeSceneryVisibility,true);assert.equal(r.environment.stats.rejected,0);assert.equal(r.pits.stats.rejected,0);
 const faces=r._staticWorldScene.faces,set=new Set(faces);assert.equal(set.size,faces.length);for(const f of [...r.contextGround,...r.roadFaces,...r._sceneryFollowFaces,...r.pits.faces])assert(set.has(f));
 t.diagnostic(`${faces.length} static / ${r.contextGround.length} ground / ${r.environment.faces.length} scenery / ${r.roadFaces.length} road faces`);
 assert(faces.length<=180000);assert(r.contextGround.length<=130000);assert(r.environment.faces.length<=50000);
 for(const f of faces){assert(f.vertices.length>=3);for(const p of f.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));}
});
