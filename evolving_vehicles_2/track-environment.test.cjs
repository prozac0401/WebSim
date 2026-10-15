'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Environment=require('./track-environment.js'),Race=require('./race-engine.js'),circuits=require('./circuits.js');
const fs=require('node:fs'),path=require('node:path'),Pits=require('./pit-facilities.js');
const observed=(track,id,data)=>Environment.build(track,id,data,{backgroundVegetation:false});
const polygon=(id,kind,ring)=>({type:'Feature',id,properties:{kind,sourceId:'fixture-observation'},geometry:{type:'Polygon',coordinates:[ring]}});
const features={coordinateSystem:'local-metres',sources:[{id:'fixture-observation',note:'Synthetic geometry for clearance tests, not venue evidence.'}],features:[
  polygon('grass','grass',[[25,-40],[100,-40],[100,40],[25,40],[25,-40]]),
  polygon('gravel','gravel',[[120,-40],[160,-40],[160,40],[120,40],[120,-40]]),
  polygon('sand','sand',[[180,-40],[220,-40],[220,40],[180,40],[180,-40]]),
  polygon('forest','forest',[[240,-40],[300,-40],[300,40],[240,40],[240,-40]]),
  {id:'wall',properties:{kind:'retaining-wall',sourceId:'fixture-observation'},geometry:{type:'LineString',coordinates:[[320,-30],[320,30]]}}
]};
const track={id:'fixture',width:12,points:[{x:0,y:-100,z:10},{x:0,y:100,z:20},{x:-100,y:100,z:20},{x:-100,y:-100,z:10}],bounds:{minX:-100,maxX:0,minY:-100,maxY:100}};
test('source-backed types generate deterministic finite geometry and spatial groups',()=>{
 const a=observed(track,'fixture',features),b=observed(track,'fixture',features);
 assert.deepEqual(a.faces,b.faces);assert.deepEqual(a.objects,b.objects);
 for(const kind of ['grass','gravel','sand','tree','retaining-wall'])assert.ok(a.stats.kinds[kind]>0,kind);
 assert.ok(a.stats.faces>20);assert.ok(a.stats.faces<10000);
 for(const f of a.faces)for(const p of f.vertices)for(const n of [p.x,p.y,p.z])assert.ok(Number.isFinite(n));
 assert.equal(a.query(10000,10000,50).length,0);assert.ok(a.query(260,0,40).length>0);assert.ok(a.query(0,0,20).length<a.groups.length);
});
test('disabling illustrative vegetation leaves missing source evidence empty',()=>{
 assert.equal(observed(track,'unknown',{coordinateSystem:'local-metres',features:[]}).faces.length,0);
 assert.equal(observed(track,'unknown',{coordinateSystem:'local-metres',features:[polygon('bad','grass',[[20,0],[30,0],[30,10]])].map(f=>({...f,properties:{kind:'grass'}}))}).faces.length,0);
});
test('all circuit road legs stay clear even when a supplied polygon crosses the road',()=>{
 for(const circuit of circuits){const t=Race.buildTrack(circuit),p=t.points[Math.floor(t.points.length*.25)],r=34;
  const data={coordinateSystem:'local-metres',features:[polygon('cross-road','gravel',[[p.x-r,p.y-r],[p.x+r,p.y-r],[p.x+r,p.y+r],[p.x-r,p.y+r],[p.x-r,p.y-r]])]};
  const env=observed(t,circuit.id,data);assert.ok(env.faces.length,circuit.id);
  for(const f of env.faces){const checks=[...f.vertices,{x:f.vertices.reduce((s,v)=>s+v.x/3,0),y:f.vertices.reduce((s,v)=>s+v.y/3,0)}];for(const q of checks)assert.ok(env.roadDistance(q.x,q.y)>=env.clearanceM-1e-6,circuit.id+' road clearance');}
 }
});
test('WGS84 projection matches track origin transform',()=>{
 const circuit=circuits[0],t=Race.buildTrack(circuit),c=circuit.coordinates[0],p=t.projection;
 const lon=c[0]+.003,lat=c[1]+.003,x=((lon-p.origin[0])*p.metresPerDegree*Math.cos(p.latitudeRad)-p.offset.x)*p.scale,y=(-(lat-p.origin[1])*p.metresPerDegree-p.offset.y)*p.scale;
 const env=observed(t,circuit,{coordinateSystem:'wgs84',features:[{id:'tree',properties:{kind:'tree',sourceId:'fixture'},geometry:{type:'Point',coordinates:[lon,lat]}}]});
 assert.equal(env.objects.length,1);assert.ok(Math.abs(env.objects[0].x-x)<1e-8);assert.ok(Math.abs(env.objects[0].y-y)<1e-8);
});
test('curated overseas observations retain source links, finite geometry and whole-road clearance',()=>{
 for(const id of ['spa','monza','silverstone']){
  const data=require('./data/environment/overseas/'+id+'-features.json'),circuit=circuits.find(c=>c.id===id),sourceIds=new Set(data.sources.map(s=>s.id));
  assert.ok(data.features.length>0);for(const f of data.features){assert.ok(sourceIds.has(f.properties.sourceId),f.id);assert.ok(f.properties.evidence.includes('approximate'));}
  const env=observed(Race.buildTrack(circuit),circuit,data);assert.ok(env.faces.length>0);assert.equal(env.stats.rejected,0);assert.ok(env.faces.length<15000);
  for(const f of env.faces)for(const q of f.vertices){assert.ok(Number.isFinite(q.z));assert.ok(env.roadDistance(q.x,q.y)>env.clearanceM-1e-5,id+' '+f.kind);}
  for(const tree of env.objects)assert.ok(env.roadDistance(tree.x,tree.y)>env.clearanceM+tree.radius,id+' canopy');
 }
});
test('undulating Spa and Everland terrain has shared 3D vertices and no hanging edge nodes',()=>{
 const kinds=new Set(['grass','forest','sand','gravel','asphalt','painted-runoff']);
 for(const [id,folder] of [['spa','overseas'],['everland','korea']]){
  const circuit=circuits.find(c=>c.id===id),track=Race.buildTrack(circuit),data=require('./data/environment/'+folder+'/'+id+'-features.json');
  const env=observed(track,circuit,data),faces=env.faces.filter(f=>kinds.has(f.kind));
  if(id==='everland')assert.ok(env.stats.terrain.insertedBoundaryVertices>0,'fixture must exercise unequal adjacent edge refinement');
  const vertexMap=new Map(),grid=new Map(),edges=new Map(),cell=16,tolerance=1e-5;
  const position=p=>Math.round(p.x*1e6)+','+Math.round(p.y*1e6);
  for(const f of faces)for(const p of f.vertices){
   const key=position(p),old=vertexMap.get(key);
   if(old)assert.ok(Math.abs(old.z-p.z)<1e-8,id+' shared XY must have exactly the same height');
   else{vertexMap.set(key,p);const k=Math.floor(p.x/cell)+','+Math.floor(p.y/cell);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);}
  }
  for(const f of faces)for(let i=0;i<3;i++){
   const a=f.vertices[i],b=f.vertices[(i+1)%3],key=[position(a),position(b)].sort().join(':');if(edges.has(key))continue;edges.set(key,true);
   const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
   for(let x=Math.floor((Math.min(a.x,b.x)-tolerance)/cell);x<=Math.floor((Math.max(a.x,b.x)+tolerance)/cell);x++)for(let y=Math.floor((Math.min(a.y,b.y)-tolerance)/cell);y<=Math.floor((Math.max(a.y,b.y)+tolerance)/cell);y++)for(const p of grid.get(x+','+y)||[]){
    const along=((p.x-a.x)*dx+(p.y-a.y)*dy)/len;
    if(along<=tolerance||len-along<=tolerance)continue;
    assert.ok(Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))/len>tolerance,id+' hanging node on terrain edge');
   }
  }
  const heights=[...vertexMap.values()].map(p=>p.z);assert.ok(Math.max(...heights)-Math.min(...heights)>10,id+' elevation must remain nonplanar');
 }
});

test('unclassified background has deterministic organic clusters and an explicit estimate label',()=>{
 const data={coordinateSystem:'local-metres',sources:[],features:[]};
 const a=Environment.build(track,'empty-venue',data),b=Environment.build(track,'empty-venue',data);
 assert.deepEqual(a.objects,b.objects);assert.deepEqual(a.faces,b.faces);
 assert.equal(a.stats.features,0);assert.equal(a.stats.sourceTrees,0);assert.equal(a.sources.length,0);
 assert.equal(a.stats.illustrativeVegetation,true);assert.equal(a.stats.backgroundTrees,a.objects.length);
 assert.ok(a.objects.length>=200&&a.objects.length<=400);
 assert.match(a.illustrativeVegetation.classification,/not photo-confirmed/);
 assert.ok(a.objects.every(t=>t.illustrativeVegetation&&t.individualPositionEstimated));
 assert.equal(new Set(a.objects.map(t=>t.x.toFixed(4))).size,a.objects.length,'no repeated planted-grid columns');
 assert.ok(new Set(a.faces.filter(f=>f.kind==='tree').map(f=>f.fill)).size>12,'varied crown palette');
 const neighbours=a.objects.map((t,i)=>Math.min(...a.objects.filter((_,j)=>i!==j).map(q=>Math.hypot(t.x-q.x,t.y-q.y)))).sort((x,y)=>x-y);
 assert.ok(neighbours[Math.floor(neighbours.length/2)]<18,'small groups rather than solitary distant trees');
 assert.ok(neighbours.every(d=>d>5.8),'crowns have breathing room');
 const limited=Environment.build(track,'empty-venue',data,{backgroundTreeLimit:24});
 assert.equal(limited.stats.backgroundTrees,24);assert.ok(limited.faces.length<=24*23);
 assert.equal(Environment.build(track,'empty-venue',data,{backgroundTreeLimit:0}).objects.length,0);
});

test('later paved polygons block source trees and background crowns avoid all observed surfaces',()=>{
 const data={coordinateSystem:'local-metres',sources:[{id:'fixture-observation'}],features:[
  polygon('known-forest','forest',[[45,-80],[90,-80],[90,80],[45,80],[45,-80]]),
  polygon('known-grass','grass',[[95,-80],[140,-80],[140,80],[95,80],[95,-80]]),
  polygon('later-asphalt','asphalt',[[43,-82],[92,-82],[92,82],[43,82],[43,-82]]),
  polygon('known-gravel','gravel',[[145,-80],[178,-80],[178,80],[145,80],[145,-80]])
 ]};
 const env=Environment.build(track,'reserved-fixture',data);
 assert.equal(env.stats.sourceTrees,0,'forest trees cannot be planted into a later paved observation');
 assert.ok(env.stats.backgroundTrees>0);
 for(const t of env.objects)for(const f of data.features){
  const ring=f.geometry.coordinates[0],xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
  const d=Math.hypot(Math.max(Math.min(...xs)-t.x,0,t.x-Math.max(...xs)),Math.max(Math.min(...ys)-t.y,0,t.y-Math.max(...ys)));
  assert.ok(d>t.radius+1,f.id+' crown exclusion');
 }
 const allBlocked=Environment.build(track,'blocked-fixture',data,{excludeTree:()=>true});
 assert.equal(allBlocked.stats.trees,0);assert.ok(allBlocked.stats.backgroundPlacementCandidates<=400*3*12,'bounded failed placement work');
});

test('all eleven real courses keep background crowns off every road leg and real pit facilities',()=>{
 const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
 const segmentDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],v=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a[0]-v*dx,p.y-a[1]-v*dy);};
 const rows=[];
 for(const circuit of circuits){
  const t=Race.buildTrack(circuit),folder=['spa','monza','silverstone'].includes(circuit.id)?'overseas':'korea';
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,'data/environment',folder,circuit.id+'-features.json'),'utf8'));
  const pits=Pits.build(t,JSON.parse(fs.readFileSync(path.join(__dirname,'data/pits',circuit.id+'.json'),'utf8')));
  const before=JSON.stringify(t.points),env=Environment.build(t,circuit,data,{excludeTree:(x,y,r)=>pits.contains(x,y,r)});
  assert.equal(JSON.stringify(t.points),before,'vegetation never alters race geometry');
  assert.equal(env.stats.sourceTrees+env.stats.backgroundTrees,env.stats.trees);
  assert.ok(env.stats.backgroundTrees>=100,circuit.id+' visible background, even without mapped environmental features');
  assert.ok(env.stats.backgroundTrees<=400,circuit.id+' object budget');
  assert.ok(env.stats.backgroundPlacementCandidates<=400*3*12,circuit.id+' placement work budget');
  const background=env.objects.filter(o=>o.illustrativeVegetation),backgroundFaces=env.faces.filter(f=>f.featureId.startsWith('illustrative-background-'));
  assert.equal(background.length,env.stats.backgroundTrees);assert.ok(backgroundFaces.length<=400*23,circuit.id+' added face budget');
  const project=c=>data.coordinateSystem==='local-metres'?c:[((c[0]-t.projection.origin[0])*t.projection.metresPerDegree*Math.cos(t.projection.latitudeRad)-t.projection.offset.x)*t.projection.scale,(-(c[1]-t.projection.origin[1])*t.projection.metresPerDegree-t.projection.offset.y)*t.projection.scale];
  const regions=data.features.filter(f=>f.geometry.type==='Polygon').map(f=>f.geometry.coordinates.map(r=>r.map(project)));
  for(const tree of env.objects){
   assert.ok(!pits.contains(tree.x,tree.y,tree.radius+1),circuit.id+' pit crown exclusion');
   assert.ok(env.roadDistance(tree.x,tree.y)>env.clearanceM+tree.radius,circuit.id+' whole road clearance');
  }
  for(const tree of background){
   const d=env.roadDistance(tree.x,tree.y);assert.ok(d>=45+tree.radius-1e-6&&d<=180-tree.radius+1e-6,circuit.id+' 45–180 m corridor');
   for(const [outer,...holes] of regions){
    assert.ok(!inside(tree,outer)||holes.some(r=>inside(tree,r)),circuit.id+' outside observed surface');
    for(const ring of [outer,...holes])assert.ok(ring.every((a,i)=>segmentDistance(tree,a,ring[(i+1)%ring.length])>tree.radius+1-1e-6),circuit.id+' observed boundary crown margin');
   }
  }
  rows.push({id:circuit.id,backgroundTrees:env.stats.backgroundTrees,candidates:env.stats.backgroundPlacementCandidates,addedFaces:backgroundFaces.length});
 }
 assert.equal(rows.length,11);
});
