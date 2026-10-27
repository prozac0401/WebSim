'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const data=require('./data/environment/korea/taebaek-features.json');
const bundled=require('./track-environment-data.js');
for(const name of ['pit-facility-data','pit-facilities','circuit-terrain','road-edge-style','road-markings','trackside-boards','track-environment'])require('./'+name+'.js');
const Race=require('./race-engine.js'),Renderer=require('./circuit-renderer.js'),circuits=require('./circuits.js');
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area=vertices=>Math.abs(vertices.reduce((sum,p,i)=>{const q=vertices[(i+1)%vertices.length];return sum+p.x*q.y-p.y*q.x;},0))/2;
let cached;
function scene(){
 if(cached)return cached;
 const circuit=circuits.find(c=>c.id==='taebaek'),circuitBefore=JSON.stringify(circuit);
 const race=new Race({circuit,vehicleIds:['supra'],racingLine:true}),sourceBefore=JSON.stringify(data),raceBefore=JSON.stringify(race);
 const renderer=new Renderer({style:{},getContext:()=>({}),addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:900,height:565})});
 renderer.setRace(race);
 const saved=globalThis.TrackEnvironmentData;
 let baseline;
 try{
  globalThis.TrackEnvironmentData={...saved,taebaek:{...data,metadata:undefined}};
  baseline=Object.create(Renderer.prototype);baseline.race=race;baseline.displayTrack=renderer.roadSourceTrack;baseline._makeRoad();
 }finally{globalThis.TrackEnvironmentData=saved;}
 cached={race,renderer,baseline,sourceBefore,raceBefore,circuitBefore};return cached;
}
function contains(p,vertices){
 for(let i=1;i<vertices.length-1;i++){
  const a=vertices[0],b=vertices[i],c=vertices[i+1],d=cross(a,b,c);if(Math.abs(d)<1e-10)continue;
  const u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;if(Math.min(u,v,w)>=-1e-8)return true;
 }
 return false;
}
function stripSample(r,s,side,lateralM){
 let i=r.roadEdges.findIndex((a,index)=>a.s<=s&&(index===r.roadEdges.length-1||r.roadEdges[index+1].s>s));
 assert.ok(i>=0,'sample must use canonical centreline station');
 const a=r.roadEdges[i],b=r.roadEdges[(i+1)%r.roadEdges.length],inner=side==='left'?'left':'right',outer=side==='left'?'outerLeft':'outerRight';
 const fraction=lateralM/Math.hypot(a[outer].x-a[inner].x,a[outer].y-a[inner].y);
 const at=edge=>({x:edge[inner].x+(edge[outer].x-edge[inner].x)*fraction,y:edge[inner].y+(edge[outer].y-edge[inner].y)*fraction});
 const p=at(a),q=at(b),point={x:(p.x+q.x)/2,y:(p.y+q.y)/2};
 return {point,s0:a.s,s1:i+1<r.roadEdges.length?b.s:r.roadSourceTrack.centerlineLength,colors:new Set(r.roadFaces.filter(f=>contains(point,f.vertices)).map(f=>f.fill))};
}

test('Taebaek bundle retains the exact authored data and every new observation resolves to its cited source',()=>{
 assert.deepEqual(bundled.taebaek,data);
 const sources=new Set(data.sources.map(s=>s.id));assert.equal(sources.size,data.sources.length);
 assert.ok(data.sources.some(s=>String(s.url||'').includes('Ji6CW56nQz0')),'public onboard evidence is recorded explicitly');
 assert.equal(data.metadata.defaultRoadEdge,'white-line');assert.equal(data.metadata.roadEdges.length,7);
 assert.equal(data.features.length,37);
 for(const rule of [...data.metadata.roadEdges,...(data.metadata.roadMarkings||[]),...(data.metadata.distanceBoards||[])]){
  assert.ok(sources.has(rule.sourceId),'road rule resolves source '+rule.sourceId);assert.ok(rule.evidence);
 }
 assert.ok(data.features.length>0,'the cited roadside protection is present');
 for(const f of data.features){assert.ok(sources.has(f.properties.sourceId),f.id+' source resolves');assert.ok(f.properties.evidence||f.properties.evidenceFiles?.length,f.id+' carries evidence');}
});

test('actual straight edges are white while seven observed bends keep their authored curb side and white outer edge',()=>{
 const {renderer:r}=scene(),styles=r.roadEdgeStyle,roadFill=styles.roadSurfaceColor||'#465250';
 for(const s of [100,300,430,2110,2250])for(const side of ['left','right']){
  assert.equal(styles.styleAt(s,side),'white-line',s+' '+side+' straight edge');
  assert.deepEqual(stripSample(r,s,side,.06).colors,new Set(['#edf0e5']),'12 cm white border is actually rendered');
  assert.deepEqual(stripSample(r,s,side,.4).colors,new Set([roadFill]),'plain shoulder outside the line does not retain a curb block');
 }
 for(const [s,side] of [[550,'right'],[750,'left'],[890,'right'],[1100,'left'],[1260,'right'],[1450,'left'],[1700,'right'],[2000,'right']]){
  const opposite=side==='left'?'right':'left';
  assert.equal(styles.styleAt(s,side),'curb',s+' observed '+side+' curb');assert.equal(styles.styleAt(s,opposite),'white-line');
  const sample=stripSample(r,s,side,.4),colors=styles.curbColors||['#ba6759','#f0ecdf'];
  assert.ok(sample.colors.size>0&&[...sample.colors].every(fill=>colors.includes(fill)),'actual curb faces use the authored palette');
  assert.deepEqual(stripSample(r,s,opposite,.4).colors,new Set([roadFill]),'opposite edge is plain asphalt beyond its white line');
 }
});

test('the observed left strip around 685–820 m is preserved instead of inferred from instantaneous curve direction',()=>{
 const {renderer:r}=scene();
 for(const s of [700,750,800]){
  assert.equal(r.roadEdgeStyle.styleAt(s,'left'),'curb');assert.equal(r.roadEdgeStyle.styleAt(s,'right'),'white-line');
 }
 assert.ok(r.roadGeometry.sample(800).curvature>1e-4,'this sample bends toward the right, so an automatic inner-only rule would choose the wrong side');
 assert.equal(r.roadEdgeStyle.styleAt(650,'left'),'white-line');assert.equal(r.roadEdgeStyle.styleAt(835,'left'),'white-line');
});

test('actual renderer edge correction leaves the road geometry, elevations, terrain seam and race state unchanged',()=>{
 const {race,renderer:r,baseline,sourceBefore,raceBefore,circuitBefore}=scene();
 assert.equal(JSON.stringify(data),sourceBefore);assert.equal(JSON.stringify(race),raceBefore);assert.equal(JSON.stringify(race.circuit),circuitBefore);
 assert.ok(race.track.centerlineLength-race.cars[0].trackLength>20,'road chainage differs from the shorter tuned racing line');
 assert.equal(r.roadSourceTrack.centerlineLength,race.track.centerlineLength);
 assert.deepEqual(r.roadEdges,baseline.roadEdges,'all inner/outer XYZ edges stay exactly unchanged');assert.deepEqual(r.supports,baseline.supports);
 assert.ok(Math.abs(r.roadFaces.reduce((sum,f)=>sum+area(f.vertices),0)-baseline.roadFaces.reduce((sum,f)=>sum+area(f.vertices),0))<1e-6,'material partitions preserve total road coverage');
 assert.ok(r.roadFaces.every(f=>f.road===true));
 for(let i=0;i<race.track.points.length;i++){
  const original=race.track.points[i],display=r.roadSourceTrack.points[i],datum=race.track.elevationMin||0;
  assert.equal(display.x,original.x);assert.equal(display.y,original.y);
  assert.ok(Math.abs(display.z-(datum+(original.z-datum)*1.75))<1e-8,'existing display elevation gain is applied once');
 }
 assert.equal(r.environment.stats.rejected,0);
 assert.equal(data.metadata.staticWorldGeometry,true);assert.ok(r._staticWorldScene.faces.length>0);
 const staticFaces=new Set(r._staticWorldScene.faces);
 for(const f of [...r.contextGround,...r.roadFaces,...r._sceneryFollowFaces])assert.ok(staticFaces.has(f),'static GPU scene retains corrected road and source scenery');
 for(const f of [...r.roadFaces,...r.contextGround,...r.environment.faces,...(r.tracksideBoards?.faces||[])]){
  assert.ok(f.vertices.length>=3);for(const p of f.vertices)assert.ok([p.x,p.y,p.z].every(Number.isFinite));
 }
});

function pointSegmentDistance2(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;}
function segmentDistance2(a,b,c,d){
 if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;
 return Math.min(pointSegmentDistance2(a,c,d),pointSegmentDistance2(b,c,d),pointSegmentDistance2(c,a,b),pointSegmentDistance2(d,a,b));
}
test('all generated protection clears every actual road leg, including the nearby return section',()=>{
 const {renderer:r}=scene(),margin=r.environment.clearanceM,cell=64,grid=new Map(),pts=r.displayTrack.points;
 for(let i=0;i<pts.length;i++){
  const a=pts[i],b=pts[(i+1)%pts.length],segment={a,b};
  for(let x=Math.floor((Math.min(a.x,b.x)-margin)/cell);x<=Math.floor((Math.max(a.x,b.x)+margin)/cell);x++)for(let y=Math.floor((Math.min(a.y,b.y)-margin)/cell);y<=Math.floor((Math.max(a.y,b.y)+margin)/cell);y++){
   const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(segment);
  }
 }
 const kinds=['guardrail','safety-wall','catch-fence','retaining-wall'];
 const faces=r.environment.faces.filter(f=>kinds.includes(f.kind));assert.ok(faces.length>0);
 const authored=data.features.filter(f=>kinds.includes(f.properties.kind));
 assert.equal(authored.filter(f=>f.properties.kind!=='catch-fence').length,12);assert.equal(authored.filter(f=>f.properties.kind==='catch-fence').length,2);
 const emitted=new Map();for(const f of faces){if(!emitted.has(f.featureId))emitted.set(f.featureId,[]);emitted.get(f.featureId).push(f);}
 for(const feature of authored){
  const generated=emitted.get(feature.id);assert.ok(generated?.length>0,feature.id+' must produce actual visible geometry');
  if(feature.properties.kind==='safety-wall')assert.ok(generated.every(f=>f.barrierMaterial===feature.properties.material),'covered protection must not be reclassified as a confirmed concrete/tire core');
 }
 const checked=new Set(),limit=(margin-1e-6)**2;
 for(const f of faces)for(let i=0;i<f.vertices.length;i++){
  const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],key=[a,b].map(p=>p.x.toFixed(6)+','+p.y.toFixed(6)).sort().join('|');if(checked.has(key))continue;checked.add(key);
  const nearby=new Set();
  for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++)for(const s of grid.get(x+','+y)||[])nearby.add(s);
  for(const s of nearby)assert.ok(segmentDistance2(a,b,s.a,s.b)>=limit,f.featureId+' full geometry clears every nearby leg');
 }
 assert.ok(checked.size>50,'actual authored barrier geometry is exercised');
});

function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
test('authored narrow safety shoulders reserve space instead of acquiring illustrative trees',()=>{
 const {renderer:r}=scene(),reserves=data.features.filter(f=>f.geometry.type==='Polygon'&&(f.properties.kind==='vegetation-exclusion'||f.properties.kind==='grass'&&f.properties.baseMaterial));
 assert.equal(reserves.length,12,'all authored barrier-to-road gaps retain their narrow safety reserves');
 for(const reserve of reserves)for(const tree of r.environment.objects){
  if(!tree.illustrativeVegetation&&reserve.properties.kind!=='vegetation-exclusion')continue;
  const [outer,...holes]=reserve.geometry.coordinates;
  assert.ok(!inside(tree,outer)||holes.some(ring=>inside(tree,ring)),reserve.id+' stays free of generated trees');
  for(const ring of [outer,...holes])for(let i=0;i<ring.length;i++){
   const a={x:ring[i][0],y:ring[i][1]},b={x:ring[(i+1)%ring.length][0],y:ring[(i+1)%ring.length][1]};
   assert.ok(pointSegmentDistance2(tree,a,b)>(tree.radius+1-1e-6)**2,reserve.id+' reserves the entire crown radius');
  }
 }
});

test('surrounding DEM grid raises wooded slopes while the shared rendered ground keeps shoulders and scenery attached',()=>{
 const {renderer:r}=scene(),g=data.metadata.terrainReliefGrid;
 assert.equal(g.columns,23);assert.equal(g.rows,17);assert.equal(g.spacingM,75);assert.equal(g.heightsAMSL.length,391);
 assert.equal(Math.min(...g.heightsAMSL),575);assert.equal(Math.max(...g.heightsAMSL),896);
 assert.equal(r.reliefField.sourceId,'taebaek-surrounding-dem-2026');
 assert.ok(r.terrainGeometry.sampleHeight(-700,-350)>950,'the mapped northwest mountain is substantially higher than the old nearest-road plain');
 assert.equal(r.environment.groundHeight(-700,-350),r.terrainGeometry.sampleHeight(-700,-350));
 // Expanding the mountain envelope must not shift the former grid underneath
 // this existing control-tower footing and bury its lower storey by 3.3 m.
 assert.ok(r.terrainGeometry.sampleHeight(-11.77,-45.68)<652.7628664200968+.2,'the control-tower footing stays clear after terrain expansion');
 assert.ok(r.contextGround.some(f=>f.kind==='forest'&&f.fill==='#466449'),'distant woodland paints the actual mountain surface');
 assert.ok(r.contextGround.some(f=>f.kind==='rock'),'exposed rock is a distinct slope material');
 assert.equal(r.environment.stats.backgroundTrees,0);assert.ok(r.environment.stats.sourceTrees>800,'mapped wooded slopes carry a dense, bounded local canopy');
 assert.ok(r.environment.faces.filter(f=>!['forest','rock'].includes(f.kind)).length<50000,'geometry budget cannot truncate late tree crowns or trunks');
 for(const tree of r.environment.objects)assert.ok(Math.abs(tree.z-r.terrainGeometry.sampleHeight(tree.x,tree.y))<1e-8,'each tree root uses the actual rendered triangle');
 let previous=null;
 for(let s=620;s<=1010;s+=3){
  const p=r.roadGeometry.sample(s),x=p.x+Math.sin(p.angle)*11,y=p.y-Math.cos(p.angle)*11;
  const relative=r.terrainGeometry.sampleHeight(x,y)-p.z;
  if(previous!==null)assert.ok(Math.abs(relative-previous)<.5,'a near-road barrier must not bounce several metres between adjacent posts');
  previous=relative;
 }
});
