'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const data=require('./data/environment/korea/everland-features.json');
const bundled=require('./track-environment-data.js');
for(const name of ['pit-facility-data','pit-facilities','circuit-terrain','road-edge-style','road-markings','trackside-boards'])require('./'+name+'.js');
const Environment=require('./track-environment.js'),Race=require('./race-engine.js');
const Renderer=require('./circuit-renderer.js'),circuits=require('./circuits.js');
const feature=id=>data.features.find(f=>f.id===id);
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
}return yes;}
function inPolygon(p,f){const rings=f.geometry.coordinates;return inside(p,rings[0])&&!rings.slice(1).some(r=>inside(p,r));}
let cached;
function scene(){
 if(cached)return cached;
 const race=new Race({circuit:circuits.find(c=>c.id==='everland'),vehicleIds:['supra'],racingLine:true});
 const sourceBefore=JSON.stringify(data),raceBefore=JSON.stringify(race);
 const renderer=new Renderer({style:{},getContext:()=>({}),addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:900,height:565})});
 renderer.setRace(race);
 cached={race,renderer,sourceBefore,raceBefore};return cached;
}
function at(renderer,s,offset){const p=renderer.roadGeometry.sample(s);return{x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset};}
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function contains(p,v){for(let i=1;i<v.length-1;i++){
 const a=v[0],b=v[i],c=v[i+1],d=cross(a,b,c);if(Math.abs(d)<1e-10)continue;
 const u=cross(b,c,p)/d,w=cross(a,b,p)/d,vv=1-u-w;if(Math.min(u,vv,w)>=-1e-8)return true;
}return false;}
function groundColors(renderer,p){return new Set(renderer.contextGround.filter(f=>['context-ground','terrain-bank','asphalt','colored-surface','forest'].includes(f.kind)&&contains(p,f.vertices)).map(f=>f.fill));}

test('Everland bundle preserves cited, explicitly approximate surface and roadside observations',()=>{
 assert.deepEqual(bundled.everland,data);
 const sources=new Set(data.sources.map(s=>s.id));assert.equal(sources.size,data.sources.length);
 assert.equal(data.features.length,114);assert.equal(data.metadata.roadEdges.length,10);assert.equal(data.metadata.roadMarkings.length,38);
 for(const f of data.features){assert.ok(sources.has(f.properties.sourceId),f.id+' resolves to an actual source');assert.ok(f.properties.evidence||f.properties.evidenceFiles?.length,f.id+' has observation evidence');}
 for(const rule of [...data.metadata.roadEdges,...data.metadata.roadMarkings,...data.metadata.distanceBoards]){assert.ok(sources.has(rule.sourceId));assert.ok(rule.evidence);}
 for(const f of data.features.filter(f=>f.properties.profile))assert.equal(f.properties.profile,'armco');
 assert.equal(data.features.some(f=>['sand','gravel'].includes(f.properties.kind)),false,'pale grass is not relabelled gravel');
 assert.equal(feature('everland-east-exit-right-green-strip').properties.kind,'colored-surface');
 assert.equal(feature('everland-pond-vegetation-reserve').properties.kind,'vegetation-exclusion');
 assert.match(data.metadata.limitations.join(' '),/substrate.*unverified/i);
 assert.match(data.metadata.limitations.join(' '),/not a surveyed/i);
});

test('actual setRace uses canonical positions without changing physics and stays within scene budgets',()=>{
 const {race,renderer:r,sourceBefore,raceBefore}=scene();
 assert.equal(JSON.stringify(data),sourceBefore);assert.equal(JSON.stringify(race),raceBefore);
 assert.equal(r.roadSourceTrack.centerlineLength,race.track.centerlineLength);
 assert.ok(Math.abs(race.track.centerlineLength-race.cars[0].trackLength)>20,'fixture distinguishes road chainage from the racing line');
 assert.equal(data.metadata.paintReferenceLineM,1582);assert.equal(data.metadata.replaceSimulationStartPaint,true);
 assert.ok(r.roadEdges.at(-1).s>race.track.centerlineLength-8&&r.roadEdges.at(-1).s<race.track.centerlineLength);
 assert.equal(r.roadMarkingStats.rejected,0);assert.equal(r.roadMarkingStats.features,38);assert.equal(r.roadMarkingStats.byType['grid-box'],18);
 assert.equal(r.environment.stats.rejected,0);assert.ok(r.environment.faces.length<55000);
 assert.ok(r.contextGround.length<120000);assert.ok(r.roadFaces.length<35000);
 assert.equal(r.tracksideBoards.stats.boards,3);assert.equal(r.tracksideBoards.stats.rejectedClearance,0);
 assert.deepEqual(r.tracksideBoards.stats.placements.map(p=>p.label),['50','150','100']);
 for(const f of [...r.environment.faces,...r.contextGround,...r.roadFaces,...r.tracksideBoards.faces]){
  assert.ok(f.vertices.length>=3);for(const p of f.vertices)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z),'actual generated XYZ is finite');
 }
});

test('western and eastern runoffs retain a grass separator, distinct paving and observed curb absences',()=>{
 const {race,renderer:r}=scene(),outer=race.track.width/2+Math.min(1.1,race.track.width*.065);
 for(const [s,side,grassId,pavingId,gap,pavedOffset] of [
  [1950,-1,'everland-western-outer-left-grass-separator','everland-western-outer-left-paved-runoff',1,6],
  [3500,1,'everland-east-outer-right-grass-separator','everland-east-outer-right-paved-runoff',.75,8]
 ]){
  const grass=feature(grassId),paving=feature(pavingId),g=at(r,s,side*(outer+gap)),p=at(r,s,side*(outer+pavedOffset));
  assert.ok(inPolygon(g,grass));assert.equal(inPolygon(g,paving),false,'grass gap is outside the asphalt polygon');assert.ok(inPolygon(p,paving));
  assert.deepEqual(groundColors(r,g),new Set([data.metadata.defaultGroundColor]),'separator uses the matching base-ground material');
  assert.deepEqual(groundColors(r,p),new Set([paving.properties.color]),'runoff paints the actual ground surface');
  assert.ok(paving.properties.roadsideInterval.insideOffsetM>0);assert.ok(paving.properties.roadsideInterval.outsideOffsetM>pavedOffset);
 }
 assert.equal(r.roadEdgeStyle.styleAt(2800,'left'),'white-line');assert.equal(r.roadEdgeStyle.styleAt(2800,'right'),'white-line');
 assert.equal(r.roadEdgeStyle.styleAt(3500,'left'),'curb');assert.equal(r.roadEdgeStyle.styleAt(3500,'right'),'white-line');
 assert.equal(r.roadEdgeStyle.styleAt(4050,'right'),'curb');
 assert.deepEqual(r.roadEdgeStyle.curbColors,['#2f80b2','#e9ece1']);assert.equal(r.roadEdgeStyle.curbBlockLengthM,1.8);
 assert.equal(r.roadEdgeStyle.roadSurfaceColor,data.metadata.roadSurfaceColor);
 assert.ok(r.roadFaces.some(f=>f.kind==='road-asphalt'&&f.fill===data.metadata.roadSurfaceColor));
});

test('draped forest ground retains its trees while grass reserves create no floating grass sheets',()=>{
 const {renderer:r}=scene(),env=r.environment;
 assert.ok(env.terrainOverlays.length>0);assert.ok(env.terrainOverlays.every(f=>f.terrainDrape&&!['tree','tree-trunk','tree-shadow'].includes(f.kind)));
 for(const id of ['everland-north-woodland','everland-south-woodland']){
  const original=env.faces.filter(f=>f.featureId===id&&['tree','tree-trunk'].includes(f.kind));assert.ok(original.length>0,id+' actually has trees');
  assert.ok(original.every(f=>!f.terrainDrape));
  const kept=r._sceneryFollowFaces.filter(f=>f.featureId===id&&['tree','tree-trunk'].includes(f.kind));assert.equal(kept.length,original.length);
 }
 assert.equal(r._sceneryFollowFaces.length,env.faces.filter(f=>!f.terrainDrape).length);
 assert.equal(r._sceneryOverviewFaces.length,r._sceneryFollowFaces.filter(f=>f.kind!=='tree-shadow').length);
 const grass=data.features.filter(f=>f.properties.kind==='grass');assert.ok(grass.every(f=>f.properties.baseMaterial===true&&f.properties.color===data.metadata.defaultGroundColor));
 assert.equal(env.faces.some(f=>f.kind==='grass'),false,'grass is the existing ground rather than a second coplanar surface');
 assert.ok(env.stats.backgroundTrees>0);
 for(const tree of env.objects.filter(t=>t.illustrativeVegetation))for(const reserve of grass)assert.equal(inPolygon(tree,reserve),false,'illustrative tree stays outside '+reserve.id);
 assert.equal(env.faces.some(f=>f.featureId==='everland-pond-vegetation-reserve'),false,'pond exclusion does not invent a water or grass overlay');
});

function pointSegmentDistance2(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;}
function segmentDistance2(a,b,c,d){
 const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
 if(abC*abD<0&&cdA*cdB<0)return 0;
 return Math.min(pointSegmentDistance2(a,c,d),pointSegmentDistance2(b,c,d),pointSegmentDistance2(c,a,b),pointSegmentDistance2(d,a,b));
}
test('generated barrier and board footprints clear every actual road leg, including distant return legs',()=>{
 const {renderer:r}=scene(),margin=r.environment.clearanceM,limit=(margin-1e-6)**2,pts=r.displayTrack.points;
 const segments=pts.map((a,i)=>{const b=pts[(i+1)%pts.length];return{a,b,minX:Math.min(a.x,b.x)-margin,maxX:Math.max(a.x,b.x)+margin,minY:Math.min(a.y,b.y)-margin,maxY:Math.max(a.y,b.y)+margin};});
 const faces=r.environment.faces.filter(f=>['guardrail','safety-wall','catch-fence'].includes(f.kind)).concat(r.tracksideBoards.faces);
 assert.ok(faces.length>10000,'actual authored protection is present');let checked=0;const seen=new Set();
 for(const face of faces)for(let i=0;i<face.vertices.length;i++){
  const a=face.vertices[i],b=face.vertices[(i+1)%face.vertices.length],keys=[a,b].map(p=>p.x.toFixed(6)+','+p.y.toFixed(6)).sort(),key=keys.join('|');
  if(seen.has(key))continue;seen.add(key);checked++;
  const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);
  for(const s of segments){if(s.minX>maxX||s.maxX<minX||s.minY>maxY||s.maxY<minY)continue;
   assert.ok(segmentDistance2(a,b,s.a,s.b)>=limit,face.featureId+' remains outside every road segment');
  }
 }
 assert.ok(checked>1000);
});

test('edgeContact is opt-in for draped surfaces and cannot bypass clearance from another road leg',()=>{
 const makeTrack=x=>({id:'fixture',width:12,points:[{x:0,y:-50,z:2},{x:0,y:50,z:4},{x,y:50,z:4},{x,y:-50,z:2}],bounds:{minX:0,maxX:x,minY:-50,maxY:50}});
 const makeData=properties=>({coordinateSystem:'local-metres',features:[{id:'close-surface',properties:{kind:'asphalt',sourceId:'synthetic-clearance',...properties},geometry:{type:'Polygon',coordinates:[[[6.85,-4],[7.05,-4],[7.05,4],[6.85,4],[6.85,-4]]]}}]});
 const build=(properties,x=20)=>Environment.build(makeTrack(x),'fixture',makeData(properties),{backgroundVegetation:false});
 const old=build({drapeOnTerrain:true}),explicitOff=build({drapeOnTerrain:true,edgeContact:false}),notDraped=build({edgeContact:true}),contact=build({drapeOnTerrain:true,edgeContact:true});
 assert.equal(old.clearanceM,7.13);assert.deepEqual(old.faces,explicitOff.faces);assert.equal(old.faces.length,0);assert.equal(notDraped.faces.length,0);
 assert.ok(contact.faces.length>0,'opt-in surface can approach the outside curb without changing the road');
 for(const f of contact.faces)for(const p of f.vertices){assert.ok(contact.roadDistance(p.x,p.y)>=6.79-1e-8);assert.ok(contact.roadDistance(p.x,p.y)<old.clearanceM);}
 assert.equal(build({drapeOnTerrain:true,edgeContact:true},13.4).faces.length,0,'the same polygon is rejected against the nearby opposite road leg');
});
