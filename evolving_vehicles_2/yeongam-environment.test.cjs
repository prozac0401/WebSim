'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ids=['yeongam','yeongam-permanent'];
const data=Object.fromEntries(ids.map(id=>[id,require('./data/environment/korea/'+id+'-features.json')]));
const bundled=require('./track-environment-data.js');
for(const name of ['pit-facility-data','pit-facilities','circuit-terrain','road-edge-style','road-markings','trackside-boards','track-environment'])require('./'+name+'.js');
const Race=require('./race-engine.js'),Renderer=require('./circuit-renderer.js'),circuits=require('./circuits.js');
const originalCircuitHashes={yeongam:'0890e35973e40ab6bb1fd077a195618b59f35d26c47cd82ed4c603841c8fe574','yeongam-permanent':'107b8ccaecace36f4ab8834afd6d22c6a1a44158c37236752452634e03aade72'};
const baseIds=[56,60,61,62,63,64,65,66,67,68,69,70,71,72,73].map(n=>'fia-2013-vector-'+n);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area=vertices=>Math.abs(vertices.reduce((sum,p,i)=>{const q=vertices[(i+1)%vertices.length];return sum+p.x*q.y-p.y*q.x;},0))/2;
const flatten=coords=>typeof coords[0]==='number'?[coords]:coords.flatMap(flatten);
const point=a=>({x:a[0],y:a[1]});
function inRing(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])hit=!hit;
}return hit;}
const inPolygon=(p,f)=>inRing(p,f.geometry.coordinates[0])&&!f.geometry.coordinates.slice(1).some(r=>inRing(p,r));
function faceContains(p,vertices){for(let i=1;i<vertices.length-1;i++){
 const a=vertices[0],b=vertices[i],c=vertices[i+1],d=cross(a,b,c);if(Math.abs(d)<1e-10)continue;
 const u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;if(Math.min(u,v,w)>=-1e-8)return true;
}return false;}
const cache=new Map();
function scene(id){
 if(cache.has(id))return cache.get(id);
 const circuit=circuits.find(c=>c.id===id);assert.equal(hash(circuit),originalCircuitHashes[id],'source course and its elevation samples stay unchanged');
 const race=new Race({circuit,vehicleIds:['supra'],racingLine:true}),sourceBefore=JSON.stringify(data[id]),raceBefore=JSON.stringify(race);
 const renderer=new Renderer({style:{},getContext:()=>({}),addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:900,height:565})});
 renderer.setRace(race);
 const saved=globalThis.TrackEnvironmentData;let baseline;
 try{globalThis.TrackEnvironmentData={...saved,[id]:{...data[id],metadata:undefined}};baseline=Object.create(Renderer.prototype);baseline.race=race;baseline.displayTrack=renderer.roadSourceTrack;baseline._makeRoad();}
 finally{globalThis.TrackEnvironmentData=saved;}
 const value={race,renderer,baseline,sourceBefore,raceBefore};cache.set(id,value);return value;
}
function geographic(p,projection){return{lon:projection.origin[0]+(p[0]/projection.scale+projection.offset.x)/(projection.metresPerDegree*Math.cos(projection.latitudeRad)),lat:projection.origin[1]-(p[1]/projection.scale+projection.offset.y)/projection.metresPerDegree};}
function groundColors(r,p){return new Set(r.contextGround.filter(f=>f.kind!=='terrain-underlay'&&f.kind!=='terrain-base'&&faceContains(p,f.vertices)).map(f=>f.fill));}

test('both authored bundles keep source epochs distinct and resolve the fifteen FIA envelopes and photo observations',()=>{
 for(const id of ids){const d=data[id];assert.deepEqual(bundled[id],d);
  const sources=new Map(d.sources.map(s=>[s.id,s]));assert.equal(sources.size,d.sources.length);assert.equal(new Set(d.features.map(f=>f.id)).size,d.features.length);
  const video=sources.get('user-video-caVSBA3tmrw');assert.equal(video.authorStatedYear,2013);assert.equal(video.uploadDate,'2022-01-05');assert.equal(video.rights.redistributed,false);
  assert.equal(sources.get('kmg-2025-aerial').publicationYear,2025);assert.equal(sources.get('kmg-2025-aerial').captureDate,null);
  assert.equal(sources.get('fia-2013-map').publicationDate,'2013-10-02');assert.match(sources.get('fia-2013-map').url,/fia\.com/);
  assert.deepEqual(d.features.filter(f=>baseIds.includes(f.id)).map(f=>f.id).sort(),baseIds.slice().sort());
  assert.equal(d.features.filter(f=>f.properties.kind==='gravel').length,1);assert.equal(d.features.find(f=>f.id===baseIds[0]).properties.kind,'gravel');
  assert.equal(d.features.filter(f=>f.properties.kind==='asphalt').length,14);
  for(const f of d.features){assert(sources.has(f.properties.sourceId),f.id+' source exists');assert(f.properties.evidence,f.id+' evidence');for(const source of f.properties.sourceIds||[])assert(sources.has(source));
   if(f.geometry.type==='Polygon'){const ring=f.geometry.coordinates[0];assert.deepEqual(ring[0],ring.at(-1));assert(area(ring.map(point))>.2,f.id+' remains a nondegenerate surface after simplification');}
  }
  for(const rule of [...d.metadata.roadEdges,...(d.metadata.roadMarkings||[])]){assert(sources.has(rule.sourceId));assert(rule.evidence);}
  assert.match(d.metadata.limitations.join(' '),/not a complete lap/);assert.match(d.metadata.limitations.join(' '),/not a survey/);assert.match(d.metadata.limitations.join(' '),/unfilled white.*not asserted/i);
  const green=d.features.filter(f=>f.properties.color==='#5c9b84');assert(green.length>0,'the source-visible green S-complex margin must survive clipping');
  assert(green.every(f=>f.properties.kind==='colored-surface'&&f.properties.drapeOnTerrain&&f.properties.sourceId==='user-video-caVSBA3tmrw'));
 }
});

test('GP and permanent share physical surfaces and barriers through geographic reprojection, not copied local XY',()=>{
 const gp=scene('yeongam'),p=scene('yeongam-permanent');let count=0,maxError=0;
 assert.notEqual(gp.race.track.projection.scale,p.race.track.projection.scale);
 for(const f of data['yeongam-permanent'].features){const g=data.yeongam.features.find(x=>x.id===f.id);assert(g,f.id+' is a shared physical feature');const A=flatten(f.geometry.coordinates),B=flatten(g.geometry.coordinates);assert.equal(A.length,B.length);
  for(let i=0;i<A.length;i++){const a=geographic(A[i],p.race.track.projection),b=geographic(B[i],gp.race.track.projection),lat=(a.lat+b.lat)*Math.PI/360;
   const error=Math.hypot((a.lon-b.lon)*111195.08*Math.cos(lat),(a.lat-b.lat)*111195.08);maxError=Math.max(maxError,error);assert(error<.002,f.id+' physical position');count++;
  }
 }
 assert.equal(count,data['yeongam-permanent'].features.reduce((n,f)=>n+flatten(f.geometry.coordinates).length,0),'every shared source vertex is checked');assert(count>0);assert(maxError<.002);
});

test('painted runoff retains blue/white/red bars and actual unpainted asphalt gaps in both rendered layouts',t=>{
 for(const id of ids){const d=data[id],{renderer:r}=scene(id),stripes=d.features.filter(f=>f.id.startsWith('kic-stripe-'));
  assert.deepEqual(new Set(stripes.map(f=>f.properties.color)),new Set(['#168ebd','#edf0e8','#c4424c']));
  for(const f of stripes){assert.equal(f.properties.paintPitchM,7);assert.equal(f.properties.paintWidthM,4.5);assert(f.properties.paintWidthM<f.properties.paintPitchM);assert(baseIds.includes(f.properties.parentId));}
  let bars=0,gaps=0;const parent=d.features.find(f=>f.id==='fia-2013-vector-72'),ring=parent.geometry.coordinates[0],related=stripes.filter(f=>f.properties.parentId===parent.id),green=d.features.filter(f=>f.properties.color==='#5c9b84');
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
  for(let x=Math.min(...xs)+1;x<Math.max(...xs);x+=3.1)for(let y=Math.min(...ys)+1;y<Math.max(...ys);y+=3.7){
   const p={x,y};if(!inPolygon(p,parent)||green.some(f=>inPolygon(p,f))||r.environment.roadDistance(x,y)<r.environment.clearanceM+1)continue;
   const stripe=related.find(f=>inPolygon(p,f)),colors=groundColors(r,p);if(!colors.size)continue;
   if(stripe&&bars<5){assert.deepEqual(colors,new Set([stripe.properties.color]),'bar paints the existing ground');bars++;}
   if(!stripe&&gaps<5){assert.deepEqual(colors,new Set([parent.properties.color]),'gap exposes actual parent asphalt, not default grass or white paint');gaps++;}
   if(bars>=5&&gaps>=5)break;
  }
  assert(bars>=5&&gaps>=5,id+' has spatially sampled bars and dark gaps');t.diagnostic(id+': sampled '+bars+' bars and '+gaps+' asphalt gaps');
 }
});

test('scene construction preserves source physics and exact road/terrain boundaries while changing only surface partitions',t=>{
 for(const id of ids){const {race,renderer:r,baseline,sourceBefore,raceBefore}=scene(id);
  assert.equal(JSON.stringify(data[id]),sourceBefore);assert.equal(JSON.stringify(race),raceBefore);assert.equal(hash(race.circuit),originalCircuitHashes[id]);
  assert.equal(r.roadSourceTrack.centerlineLength,race.track.centerlineLength);assert(Math.abs(race.track.centerlineLength-race.cars[0].trackLength)>1);
  assert.deepEqual(r.roadEdges,baseline.roadEdges);assert.deepEqual(r.supports,baseline.supports);
  const current=r.roadFaces.reduce((n,f)=>n+area(f.vertices),0),old=baseline.roadFaces.reduce((n,f)=>n+area(f.vertices),0);assert(Math.abs(current-old)<1e-5,'curb/checker partitions do not add or remove road coverage');
  assert(r.roadFaces.every(f=>f.road===true));const datum=race.track.elevationMin||0;
  for(let i=0;i<race.track.points.length;i++){const a=race.track.points[i],b=r.roadSourceTrack.points[i];assert.equal(a.x,b.x);assert.equal(a.y,b.y);assert(Math.abs(b.z-(datum+(a.z-datum)*1.75))<1e-8);}
  assert.equal(data[id].metadata.backgroundTreeLimit,0);assert.equal(r.environment.stats.backgroundTrees,0);assert.equal(data[id].metadata.staticWorldGeometry,true);
  const staticFaces=new Set(r._staticWorldScene.faces);for(const f of [...r.contextGround,...r.roadFaces,...r._sceneryFollowFaces])assert(staticFaces.has(f));
  assert(r.contextGround.length<200000&&r.environment.faces.length<50000&&r.roadFaces.length<35000,'source detail has a bounded static scene');
  for(const f of [...r.contextGround,...r.roadFaces,...r.environment.faces]){assert(f.vertices.length>=3);for(const p of f.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));}
  t.diagnostic(id+': ground '+r.contextGround.length+', road '+r.roadFaces.length+', environment '+r.environment.faces.length);
 }
});

test('runoff and green paint lie on the original terrain planes with no independent floating sheets',()=>{
 for(const id of ids){const {renderer:r}=scene(id),terrain=r.terrainGeometry;
  assert(r.environment.terrainOverlays.length>0);assert(r.environment.terrainOverlays.every(f=>f.terrainDrape));
  assert.equal(r._sceneryFollowFaces.some(f=>f.terrainDrape),false,'the original terrain overlays are not drawn a second time');
  const painted=r.contextGround.filter(f=>f.featureId&&data[id].features.some(s=>s.id===f.featureId&&s.properties.drapeOnTerrain));assert(painted.length>0);
  const present=new Set(painted.map(f=>f.featureId));for(const key of ['fia-2013-vector-60','fia-2013-vector-72','fia-2013-vector-73'])assert(present.has(key),key+' is painted in '+id);
  // At a bank/grid seam sampleHeight deliberately chooses the upper of two
  // original triangles. Painting must retain each actual source plane, so test
  // the source triangles directly instead of requiring the maximum-height API.
  const cell=32,planes=new Map();for(const f of terrain.faces.filter(f=>['context-ground','terrain-bank'].includes(f.kind))){
   const xs=f.vertices.map(p=>p.x),ys=f.vertices.map(p=>p.y);
   for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let y=Math.floor(Math.min(...ys)/cell);y<=Math.floor(Math.max(...ys)/cell);y++){const key=x+','+y;if(!planes.has(key))planes.set(key,[]);planes.get(key).push(f);}
  }
  const onPlane=(p,f)=>{const[a,b,c]=f.vertices,d=cross(a,b,c);if(Math.abs(d)<1e-10)return false;const u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;return Math.min(u,v,w)>-1e-7&&Math.abs(p.z-(u*a.z+v*b.z+w*c.z))<1e-7;};
  const stride=Math.max(1,Math.floor(painted.length/1200));let checked=0;
  for(let i=0;i<painted.length;i+=stride){const fragment=painted[i],c=fragment.vertices.reduce((a,p)=>({x:a.x+p.x/fragment.vertices.length,y:a.y+p.y/fragment.vertices.length}),{x:0,y:0});
   const candidates=planes.get(Math.floor(c.x/cell)+','+Math.floor(c.y/cell))||[];
   assert(candidates.some(f=>fragment.vertices.every(p=>onPlane(p,f))),id+' '+fragment.featureId+' stays inside and on one original terrain triangle');checked+=fragment.vertices.length;
  }
  assert(checked>1000);
  const eligible=f=>!['terrain-base','terrain-boundary','terrain-underlay'].includes(f.kind);
  const before=terrain.faces.filter(eligible).reduce((n,f)=>n+area(f.vertices),0),after=r.contextGround.filter(eligible).reduce((n,f)=>n+area(f.vertices),0);
  assert(Math.abs(before-after)<1e-4,'paint does not make holes or overlapping ground coverage');
  for(const f of data[id].features.filter(f=>f.properties.color==='#5c9b84'))assert(present.has(f.id),f.id+' creates actual green paint');
 }
});

function pointSegmentDistance2(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;}
function segmentDistance2(a,b,c,d){if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;return Math.min(pointSegmentDistance2(a,c,d),pointSegmentDistance2(b,c,d),pointSegmentDistance2(c,a,b),pointSegmentDistance2(d,a,b));}
test('the four mapped Armco barriers generate open protection outside every road leg and occupied pit footprint',t=>{
 for(const id of ids){const {renderer:r}=scene(id),barriers=data[id].features.filter(f=>f.properties.osmWayId&&f.properties.kind==='guardrail');assert.equal(barriers.length,4);assert(barriers.every(f=>f.properties.profile==='armco'));
  const features=new Set(barriers.map(f=>f.id)),faces=r.environment.faces.filter(f=>features.has(f.featureId));for(const key of features)assert(faces.some(f=>f.featureId===key),key+' survives clearance clipping');
  const margin=r.environment.clearanceM,cell=64,grid=new Map(),road=r.displayTrack.points;
  for(let i=0;i<road.length;i++){const a=road[i],b=road[(i+1)%road.length];for(let x=Math.floor((Math.min(a.x,b.x)-margin)/cell);x<=Math.floor((Math.max(a.x,b.x)+margin)/cell);x++)for(let y=Math.floor((Math.min(a.y,b.y)-margin)/cell);y<=Math.floor((Math.max(a.y,b.y)+margin)/cell);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push({a,b});}}
  let checked=0;const seen=new Set();for(const f of faces)for(let i=0;i<f.vertices.length;i++){
   const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],key=[a,b].map(p=>p.x.toFixed(6)+','+p.y.toFixed(6)).sort().join('|');if(seen.has(key))continue;seen.add(key);checked++;
   assert(!r.pits.contains(a.x,a.y,0),f.featureId+' does not intersect a live pit footprint');
   const candidates=new Set();for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++)for(const s of grid.get(x+','+y)||[])candidates.add(s);
   for(const s of candidates)assert(segmentDistance2(a,b,s.a,s.b)>=(margin-1e-6)**2,f.featureId+' clears every road leg');
  }assert(checked>500);t.diagnostic(id+': '+checked+' unique barrier footprint edges');
 }
});

test('GP uses the sourced finish marker rather than the start arrow while permanent timing paint stays unchanged',()=>{
 const gp=scene('yeongam').renderer,p=scene('yeongam-permanent').renderer,meta=data.yeongam.metadata;
 assert.equal(meta.replaceSimulationStartPaint,true);assert.equal(meta.paintReferenceLineM,1955.3);assert.equal(meta.roadMarkings.length,1);assert.equal(meta.roadMarkings[0].type,'checker');assert.equal(meta.roadMarkings[0].atM,1955.3);
 const finish=gp.roadGeometry.sample(1955.3),start=gp.roadGeometry.sample(2025),marked=gp.roadFaces.filter(f=>f.kind==='road-marking');assert(marked.length>0);assert.equal(gp.roadMarkingStats.rejected,0);
 for(const f of marked){const p=f.vertices.reduce((a,v)=>({x:a.x+v.x/f.vertices.length,y:a.y+v.y/f.vertices.length}),{x:0,y:0});assert(Math.hypot(p.x-finish.x,p.y-finish.y)<gp.race.track.width);assert(Math.hypot(p.x-start.x,p.y-start.y)>50);}
 assert.equal(data['yeongam-permanent'].metadata.replaceSimulationStartPaint,undefined);assert.equal(data['yeongam-permanent'].metadata.paintReferenceLineM,undefined);assert.equal(p.roadMarkingStats.features,0);assert.equal(p.roadMarkingStats.paintedFaces,0);
 for(const [r,s] of [[gp,2100],[gp,4000],[p,1500]])for(const side of ['left','right'])assert.equal(r.roadEdgeStyle.styleAt(s,side),'white-line','unreviewed straights are not inferred curbs');
 for(const r of [gp,p])for(const s of [0,80])for(const side of ['left','right'])assert.equal(r.roadEdgeStyle.styleAt(s,side),'curb','shared observed S-complex seam retains its curb');
});
