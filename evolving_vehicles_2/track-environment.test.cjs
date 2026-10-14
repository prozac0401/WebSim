'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Environment=require('./track-environment.js'),Race=require('./race-engine.js'),circuits=require('./circuits.js');
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
 const a=Environment.build(track,'fixture',features),b=Environment.build(track,'fixture',features);
 assert.deepEqual(a.faces,b.faces);assert.deepEqual(a.objects,b.objects);
 for(const kind of ['grass','gravel','sand','tree','retaining-wall'])assert.ok(a.stats.kinds[kind]>0,kind);
 assert.ok(a.stats.faces>20);assert.ok(a.stats.faces<10000);
 for(const f of a.faces)for(const p of f.vertices)for(const n of [p.x,p.y,p.z])assert.ok(Number.isFinite(n));
 assert.equal(a.query(10000,10000,50).length,0);assert.ok(a.query(260,0,40).length>0);assert.ok(a.query(0,0,20).length<a.groups.length);
});
test('missing evidence produces no invented scenery',()=>{
 assert.equal(Environment.build(track,'unknown',{coordinateSystem:'local-metres',features:[]}).faces.length,0);
 assert.equal(Environment.build(track,'unknown',{coordinateSystem:'local-metres',features:[polygon('bad','grass',[[20,0],[30,0],[30,10]])].map(f=>({...f,properties:{kind:'grass'}}))}).faces.length,0);
});
test('all circuit road legs stay clear even when a supplied polygon crosses the road',()=>{
 for(const circuit of circuits){const t=Race.buildTrack(circuit),p=t.points[Math.floor(t.points.length*.25)],r=34;
  const data={coordinateSystem:'local-metres',features:[polygon('cross-road','gravel',[[p.x-r,p.y-r],[p.x+r,p.y-r],[p.x+r,p.y+r],[p.x-r,p.y+r],[p.x-r,p.y-r]])]};
  const env=Environment.build(t,circuit.id,data);assert.ok(env.faces.length,circuit.id);
  for(const f of env.faces){const checks=[...f.vertices,{x:f.vertices.reduce((s,v)=>s+v.x/3,0),y:f.vertices.reduce((s,v)=>s+v.y/3,0)}];for(const q of checks)assert.ok(env.roadDistance(q.x,q.y)>=env.clearanceM-1e-6,circuit.id+' road clearance');}
 }
});
test('WGS84 projection matches track origin transform',()=>{
 const circuit=circuits[0],t=Race.buildTrack(circuit),c=circuit.coordinates[0],p=t.projection;
 const lon=c[0]+.003,lat=c[1]+.003,x=((lon-p.origin[0])*p.metresPerDegree*Math.cos(p.latitudeRad)-p.offset.x)*p.scale,y=(-(lat-p.origin[1])*p.metresPerDegree-p.offset.y)*p.scale;
 const env=Environment.build(t,circuit,{coordinateSystem:'wgs84',features:[{id:'tree',properties:{kind:'tree',sourceId:'fixture'},geometry:{type:'Point',coordinates:[lon,lat]}}]});
 assert.equal(env.objects.length,1);assert.ok(Math.abs(env.objects[0].x-x)<1e-8);assert.ok(Math.abs(env.objects[0].y-y)<1e-8);
});
test('curated overseas observations retain source links, finite geometry and whole-road clearance',()=>{
 for(const id of ['spa','monza','silverstone']){
  const data=require('./data/environment/overseas/'+id+'-features.json'),circuit=circuits.find(c=>c.id===id),sourceIds=new Set(data.sources.map(s=>s.id));
  assert.ok(data.features.length>0);for(const f of data.features){assert.ok(sourceIds.has(f.properties.sourceId),f.id);assert.ok(f.properties.evidence.includes('approximate'));}
  const env=Environment.build(Race.buildTrack(circuit),circuit,data);assert.ok(env.faces.length>0);assert.equal(env.stats.rejected,0);assert.ok(env.faces.length<15000);
  for(const f of env.faces)for(const q of f.vertices){assert.ok(Number.isFinite(q.z));assert.ok(env.roadDistance(q.x,q.y)>env.clearanceM-1e-5,id+' '+f.kind);}
  for(const tree of env.objects)assert.ok(env.roadDistance(tree.x,tree.y)>env.clearanceM+tree.radius,id+' canopy');
 }
});
test('undulating Spa and Everland terrain has shared 3D vertices and no hanging edge nodes',()=>{
 const kinds=new Set(['grass','forest','sand','gravel','asphalt','painted-runoff']);
 for(const [id,folder] of [['spa','overseas'],['everland','korea']]){
  const circuit=circuits.find(c=>c.id===id),track=Race.buildTrack(circuit),data=require('./data/environment/'+folder+'/'+id+'-features.json');
  const env=Environment.build(track,circuit,data),faces=env.faces.filter(f=>kinds.has(f.kind));
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
