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
const fence=(coordinates,properties={})=>({coordinateSystem:'local-metres',sources:[{id:'fixture-observation'}],features:[
 {id:'catch-fence',properties:{kind:'catch-fence',sourceId:'fixture-observation',height:3.5,postSpacing:6,lean:.45,...properties},geometry:{type:'LineString',coordinates}}
]});
test('a 320 m catch fence has bounded, open, deterministic geometry and leaves its source unchanged',()=>{
 const data=fence([[20,-160],[20,0],[20,160]],{color:'#657783'}),before=JSON.stringify({track,data});
 const a=observed(track,'fence',data),b=observed(track,'fence',data);
 assert.deepEqual(a.faces,b.faces);assert.equal(JSON.stringify({track,data}),before);
 assert.ok(a.faces.length>500&&a.faces.length<=2000,'posts and sparse mesh stay within the 320 m scene budget');
 const dense=observed(track,'dense-fence',fence(Array.from({length:321},(_,i)=>[20,i-160])));
 assert.equal(dense.faces.length,a.faces.length,'1 m source vertices do not multiply the post or wire budget');
 assert.deepEqual(new Set(a.faces.map(f=>f.fencePart)),new Set(['post','arm','wire','mesh']));
 assert.ok(a.faces.every(f=>f.kind==='catch-fence'&&f.fill==='#657783'));
 for(const f of a.faces)for(const p of f.vertices)assert.ok([p.x,p.y,p.z].every(Number.isFinite));
 const sideArea=a.faces.reduce((sum,f)=>sum+Math.abs(f.vertices.reduce((s,p,i)=>{const q=f.vertices[(i+1)%f.vertices.length];return s+p.y*q.z-p.z*q.y;},0))/2,0);
 assert.ok(sideArea<320*3.5*.12,'thin rails and mesh occupy under 12% of the side elevation, with no solid sheet');
 assert.equal(a.groups.reduce((sum,g)=>sum+g.faces.length,0),a.faces.length,'every face belongs to one spatial group');
 assert.ok(a.query(20,0,30).length>0);assert.equal(a.query(10000,10000,20).length,0);
 delete data.features[0].properties.sourceId;
 assert.equal(observed(track,'fence',data).faces.length,0,'uncited fence geometry is not generated');
});

test('catch fences reject road crossings and leaning arms that would enter any road clearance envelope',()=>{
 const crossing=observed(track,'fence-crossing',fence([[-30,0],[30,0]]));
 assert.ok(crossing.faces.length,'safe portions on both sides remain');
 for(const f of crossing.faces){
  const center={x:f.vertices.reduce((s,p)=>s+p.x/f.vertices.length,0),y:f.vertices.reduce((s,p)=>s+p.y/f.vertices.length,0)};
  for(const p of [...f.vertices,center])assert.ok(crossing.roadDistance(p.x,p.y)>=crossing.clearanceM-1e-8,'post, arm and wire remain off every road leg');
 }
 const near=observed(track,'fence-lean',fence([[7.4,-50],[7.4,50]],{side:'right'}));
 assert.ok(near.roadDistance(7.4,0)>near.clearanceM,'the centerline alone would appear safe');
 assert.equal(near.faces.length,0,'the inward arm plus wire thickness is included in clearance');
});

test('catch fence upper arms follow explicit left/right and keep physical height on already scaled ground',()=>{
 const flat={...track,points:track.points.map(p=>({...p,z:70}))},line=[[20,-50],[20,50]];
 const right=observed(flat,'right',fence(line,{side:'right'})),left=observed(flat,'left',fence(line,{side:'left'}));
 const averageArmX=env=>{const points=env.faces.filter(f=>f.fencePart==='arm').flatMap(f=>f.vertices);return points.reduce((s,p)=>s+p.x/points.length,0);};
 assert.ok(averageArmX(right)<19.9&&averageArmX(left)>20.1,'north-to-south line leans west on the right and east on the left');
 const straight=observed(flat,'vertical',fence(line,{lean:0}));
 assert.equal(straight.faces.some(f=>f.fencePart==='arm'),false);
 const z=straight.faces.flatMap(f=>f.vertices.map(p=>p.z)),ground=straight.groundHeight(20,0);
 assert.ok(Math.abs(Math.max(...z)-ground-3.5)<.01,'3.5 m fence height is not multiplied by display terrain gain');
 assert.ok(Math.abs(Math.min(...z)-ground)<1e-8,'posts touch their own supplied terrain height');
 const duplicate=observed(flat,'duplicates',fence([[20,-50],[20,-50],[20,50]]));
 assert.deepEqual(duplicate.faces,right.faces,'duplicate line nodes create no zero-length rods or repeated posts');
});

const growthData=(properties={})=>({coordinateSystem:'local-metres',features:[{
 id:'source-tree',properties:{kind:'tree',sourceId:'fixture-observation',height:15,crownRadius:2.2,...properties},geometry:{type:'Point',coordinates:[40,0]}
}]});
const flatTrack={...track,points:track.points.map(p=>({...p,z:70}))};
test('opt-in growth forms have distinct bounded crowns, exposed trunks and no species claim',()=>{
 const budgets={rounded:23,tufted:35,columnar:25,conical:17};
 for(const [growthForm,budget] of Object.entries(budgets)){
  const data=growthData({growthForm,crownColor:'#736757'}),before=JSON.stringify(data);
  const a=observed(flatTrack,'growth',data),b=observed(flatTrack,'growth',data),tree=a.objects[0];
  assert.deepEqual(a.faces,b.faces);assert.equal(JSON.stringify(data),before);
  assert.equal(a.faces.length,budget,growthForm+' bounded face count including shadow');
  assert.equal(tree.growthForm,growthForm);assert.equal(tree.growthFormEstimated,true);
  assert.equal(tree.illustrativeVegetation,false,'source-backed area is not relabelled as background');
  assert.equal(tree.species,undefined);
  for(const f of a.faces.filter(f=>f.kind!=='tree-shadow'))for(const p of f.vertices){
   assert.ok([p.x,p.y,p.z].every(Number.isFinite));
   assert.ok(Math.hypot(p.x-tree.x,p.y-tree.y)<=tree.radius+1e-8,'declared crown radius bounds the clearance envelope');
   assert.ok(p.z>=tree.z-1e-8&&p.z<=tree.z+tree.height+1e-8);
  }
  const foliage=a.faces.filter(f=>f.kind==='tree');
  if(growthForm==='tufted'){
   assert.equal(foliage.length,24);assert.ok(foliage.every(f=>f.vertices.length>=4),'flattened foliage lobes have no triangular Christmas-tree tips');
   assert.ok(Math.min(...foliage.flatMap(f=>f.vertices.map(p=>p.z)))-tree.z>tree.height*.5,'long exposed trunk');
   assert.equal(new Set(foliage.filter(f=>f.vertices.length===6).map(f=>f.vertices[0].z)).size,6,'three separate flattened crowns');
  }
  if(growthForm==='columnar'){
   assert.equal(foliage.length,20);
   assert.ok(Math.min(...foliage.flatMap(f=>f.vertices.map(p=>p.z)))-tree.z>tree.height*.4);
   assert.ok(foliage.every(f=>f.vertices.length>=4),'layered narrow crown, not a single pointed cone');
  }
 }
 const legacy=observed(flatTrack,'growth',growthData());
 assert.deepEqual(observed(flatTrack,'growth',growthData({growthForm:'conical'})).faces,legacy.faces,'explicit legacy conical form preserves original geometry');
 assert.deepEqual(observed(flatTrack,'growth',growthData({growthForm:'unknown',growthForms:[{form:'rounded',weight:-1}]})).faces,legacy.faces,'invalid opt-ins leave legacy geometry unchanged');
});

test('weighted growth changes preserve source forest positions, heights, terrain and background placement',()=>{
 const data={coordinateSystem:'local-metres',features:[polygon('forest','forest',[[35,-80],[220,-80],[220,80],[35,80],[35,-80]])]};
 const initial=JSON.stringify(data),base=Environment.build(track,'forest-shape',data,{backgroundTreeLimit:32});
 const changed=structuredClone(data);changed.features[0].properties.growthForms=[{form:'rounded',weight:2},{form:'tufted',weight:1},{form:'columnar',weight:1},{form:'conical',weight:1}];
 const a=Environment.build(track,'forest-shape',changed,{backgroundTreeLimit:32}),b=Environment.build(track,'forest-shape',changed,{backgroundTreeLimit:32});
 const placement=env=>env.objects.map(({growthForm,growthFormEstimated,...o})=>o);
 assert.deepEqual(placement(a),placement(base),'new crown random draws cannot move later source or background trees');
 assert.deepEqual(a.faces,b.faces);assert.equal(JSON.stringify(data),initial);
 assert.deepEqual(a.faces.filter(f=>f.kind==='forest'),base.faces.filter(f=>f.kind==='forest'));
 assert.equal(new Set(a.objects.filter(o=>!o.illustrativeVegetation).map(o=>o.growthForm)).size,4);
 const mixed=[{form:'tufted',weight:1},{form:'rounded',weight:1}];
 const bg=Environment.build(track,'forest-shape',data,{backgroundTreeLimit:32,backgroundGrowthForms:mixed});
 assert.deepEqual(placement(bg),placement(base),'background opt-in keeps the historical placement RNG cadence');
 assert.ok(bg.faces.filter(f=>f.featureId.startsWith('illustrative-background-')).length<=32*35);
 const viaMetadata=Environment.build(track,'forest-shape',{...data,metadata:{backgroundGrowthForms:mixed}},{backgroundTreeLimit:32});
 assert.deepEqual(viaMetadata.faces,bg.faces,'JSON metadata and explicit option share the same shape contract');
 const precedence=observed(flatTrack,'growth',growthData({growthForm:'columnar',growthForms:[{form:'tufted',weight:1}]}));
 assert.equal(precedence.objects[0].growthForm,'columnar');
});

const rail=(coordinates,properties={})=>({coordinateSystem:'local-metres',features:[{
 id:'armco',properties:{kind:'guardrail',sourceId:'fixture-observation',profile:'armco',...properties},geometry:{type:'LineString',coordinates}
}]});
test('opt-in Armco has corrugated beams, discrete grounded posts and real open space under each rail',()=>{
 const data=rail([[20,-160],[20,160]]),before=JSON.stringify({flatTrack,data});
 for(const rails of [1,2,3]){
  const config={...data,features:data.features.map(f=>({...f,properties:{...f.properties,rails}}))};
  const a=observed(flatTrack,'armco',config),b=observed(flatTrack,'armco',config);
  assert.deepEqual(a.faces,b.faces);assert.ok(a.faces.length<=2000,'320 m / '+rails+' beams stays below 2,000 faces');
  assert.equal(a.faces.length,108*5+107*4*rails,'fixed 3 m posts and four folds per W profile');
  assert.ok(a.faces.every(f=>f.kind==='guardrail'&&f.railProfile==='armco'));
  const beams=a.faces.filter(f=>f.barrierPart==='beam'),posts=a.faces.filter(f=>f.barrierPart==='post'),ground=a.groundHeight(20,0);
  assert.deepEqual(new Set(beams.map(f=>f.railIndex)),new Set(Array.from({length:rails},(_,i)=>i)));
  assert.ok(Math.min(...beams.flatMap(f=>f.vertices.map(p=>p.z)))-ground>=.12-1e-8,'no backing wall reaches the ground');
  assert.ok(Math.abs(Math.max(...beams.flatMap(f=>f.vertices.map(p=>p.z)))-ground-.8)<1e-8);
  assert.equal(new Set(beams.flatMap(f=>f.vertices.map(p=>p.x.toFixed(6)))).size,3,'W profile contains two crests and an inward valley');
  assert.ok(Math.abs(Math.min(...posts.flatMap(f=>f.vertices.map(p=>p.z)))-ground)<1e-8,'post bottoms contact the supplied ground');
  const centers=new Set(posts.map(f=>(f.vertices.reduce((s,p)=>s+p.y/f.vertices.length,0)/3).toFixed(2)));
  assert.ok(centers.size<400,'posts are discrete instead of a continuous slab');
  const dense=observed(flatTrack,'armco',rail(Array.from({length:321},(_,i)=>[20,i-160]),{rails}));
  assert.equal(dense.faces.length,a.faces.length,'dense collinear source points do not add posts');
  for(let i=0;i<a.faces.length;i++)for(let j=0;j<a.faces[i].vertices.length;j++)for(const axis of ['x','y','z'])assert.ok(Math.abs(a.faces[i].vertices[j][axis]-dense.faces[i].vertices[j][axis])<1e-8);
  assert.equal(a.groups.reduce((sum,g)=>sum+g.faces.length,0),a.faces.length);
 }
 assert.equal(JSON.stringify({flatTrack,data}),before);
 const legacy=structuredClone(data);delete legacy.features[0].properties.profile;
 assert.ok(observed(flatTrack,'legacy-rail',legacy).faces.every(f=>!f.railProfile),'unmodified courses retain their original guardrail geometry');
});

test('Armco checks its entire width against every road leg and respects side, slope and degenerate sources',()=>{
 const crossing=observed(track,'crossing-rail',rail([[-140,0],[40,0]],{rails:3}));
 assert.ok(crossing.faces.length);
 for(const f of crossing.faces){
  const center=f.vertices.reduce((s,p)=>({x:s.x+p.x/f.vertices.length,y:s.y+p.y/f.vertices.length}),{x:0,y:0});
  for(const p of [...f.vertices,center])assert.ok(crossing.roadDistance(p.x,p.y)>=crossing.clearanceM-1e-8,'every W fold and post clears both returning road legs');
 }
 const near=observed(track,'near-rail',rail([[7.25,-50],[7.25,50]]));
 assert.ok(near.roadDistance(7.25,0)>near.clearanceM);assert.equal(near.faces.length,0,'beam and post width included in the clearance test');
 const right=observed(track,'slope',rail([[20,-70],[20,70]],{height:1.1})),left=observed(track,'slope',rail([[20,-70],[20,70]],{height:1.1,side:'left'}));
 const postX=env=>{const vertices=env.faces.filter(f=>f.barrierPart==='post').flatMap(f=>f.vertices);return vertices.reduce((s,p)=>s+p.x/vertices.length,0);};
 assert.ok(postX(right)>20&&postX(left)<20,'posts sit behind the explicitly oriented W face');
 const low=right.faces.filter(f=>f.barrierPart==='post').flatMap(f=>f.vertices),minimum=low.reduce((a,b)=>a.z<b.z?a:b);
 assert.ok(Math.abs(minimum.z-right.groundHeight(20,minimum.y))<1e-8,'physical rail height follows longitudinal terrain without applying display height gain twice');
 const duplicate=observed(track,'slope',rail([[20,-70],[20,-70],[20,70]],{height:1.1}));
 assert.deepEqual(duplicate.faces,right.faces);
 assert.equal(observed(track,'zero-rail',rail([[20,0],[20,0]])).faces.length,0);
 const uncited=rail([[20,-50],[20,50]]);delete uncited.features[0].properties.sourceId;
 assert.equal(observed(track,'uncited-rail',uncited).faces.length,0);
});

const wall=(coordinates,properties={})=>({coordinateSystem:'local-metres',features:[{
 id:'low-wall',properties:{kind:'safety-wall',sourceId:'fixture-observation',...properties},geometry:{type:'LineString',coordinates}
}]});
test('safety walls alternate by physical distance, retain solid low geometry and distinguish estimated tire envelopes',()=>{
 const data=wall([[20,-160],[20,160]],{colors:['#3f80a7','#e5e8dc']}),before=JSON.stringify(data);
 const a=observed(flatTrack,'wall',data),dense=observed(flatTrack,'wall',wall(Array.from({length:321},(_,i)=>[20,i-160]),{colors:['#3f80a7','#e5e8dc']}));
 assert.deepEqual(a.faces,dense.faces,'dense source vertices do not reset color sections or multiply the wall');
 assert.equal(a.faces.length,64*5);assert.equal(JSON.stringify(data),before);
 assert.ok(a.faces.every(f=>f.kind==='safety-wall'&&f.barrierMaterial==='concrete'));
 for(let section=0;section<64;section++){
  const faces=a.faces.filter(f=>f.sectionIndex===section),vertices=faces.flatMap(f=>f.vertices),ground=a.groundHeight(20,0);
  assert.equal(faces.length,5);assert.equal(faces[0].fill,section%2?'#e5e8dc':'#3f80a7');
  assert.ok(Math.abs(Math.max(...vertices.map(p=>p.y))-Math.min(...vertices.map(p=>p.y))-5)<1e-8);
  assert.ok(Math.abs(Math.min(...vertices.map(p=>p.z))-ground)<1e-8);
  assert.ok(Math.abs(Math.max(...vertices.map(p=>p.z))-ground-1)<1e-8);
 }
 const remainder=observed(flatTrack,'wall',wall([[20,0],[20,13]],{color:'#abcdef'}));
 assert.equal(remainder.faces.length,15);assert.equal(remainder.faces[0].fill,'#abcdef');
 assert.equal(Math.max(...remainder.faces.filter(f=>f.sectionIndex===2).flatMap(f=>f.vertices.map(p=>p.y))),13,'last section is shortened, earlier 5 m sections stay fixed');
 const tire=observed(flatTrack,'tires',wall([[20,0],[20,10]],{material:'tire-stack',height:.7,width:.6}));
 assert.ok(tire.faces.every(f=>f.barrierMaterial==='tire-stack'&&f.geometryApproximation==='three-layer-hexagonal-tires'),'material is distinguished without claiming individual scanned tires');
 assert.ok(tire.faces.some(f=>f.barrierPart==='tire-cavity'&&f.fill==='#171c1a'));
});

test('short tire impact zones have three round layers, recessed dark tops and a bounded grounded silhouette',()=>{
 const data=wall([[20,-50],[20,50]],{material:'tire-stack',height:.9,diameter:.8,colors:['#3f80a7','#e5e8dc']}),before=JSON.stringify(data);
 const a=observed(track,'tires',data),b=observed(track,'tires',data);
 assert.deepEqual(a.faces,b.faces);assert.equal(JSON.stringify(data),before);
 assert.equal(a.faces.length,125*33,'100 m has 125 low-poly stacks, about 4,000 faces');
 assert.equal(new Set(a.faces.map(f=>f.stackIndex)).size,125);
 assert.deepEqual(new Set(a.faces.filter(f=>f.barrierPart==='tire-side').map(f=>f.layerIndex)),new Set([0,1,2]));
 const first=a.faces.filter(f=>f.stackIndex===0),side=first.filter(f=>f.barrierPart==='tire-side');
 assert.equal(side.length,18);assert.equal(first.filter(f=>f.barrierPart==='tire-rim').length,6);
 const highest=Math.max(...first.flatMap(f=>f.vertices.map(p=>p.z))),cavity=first.find(f=>f.barrierPart==='tire-cavity'&&f.vertices.length===6);
 assert.ok(cavity.vertices.every(p=>Math.abs(highest-p.z-.1)<1e-8),'dark cavity is recessed, not a closed silver cap');
 for(const f of first.filter(f=>f.barrierPart==='tire-side'&&f.layerIndex===0))for(const p of f.vertices.slice(0,2))assert.ok(Math.abs(p.z-a.groundHeight(p.x,p.y))<1e-8,'bottom tire follows the supplied ground');
 const crossing=observed(track,'tire-crossing',wall([[-140,0],[40,0]],{material:'tire-stack'}));
 for(const f of crossing.faces)for(const p of f.vertices)assert.ok(crossing.roadDistance(p.x,p.y)>=crossing.clearanceM-1e-8,'the complete tire radius clears every returning road leg');
});

test('safety wall width clears all road legs and its lower edges follow the supplied sloped ground',()=>{
 const crossing=observed(track,'wall-crossing',wall([[-140,0],[40,0]],{width:1.2}));
 assert.ok(crossing.faces.length);
 for(const f of crossing.faces)for(const p of f.vertices)assert.ok(crossing.roadDistance(p.x,p.y)>=crossing.clearanceM-1e-8);
 assert.equal(observed(track,'wall-near',wall([[7.3,-40],[7.3,40]])).faces.length,0,'centerline clearance alone is insufficient for a solid wall');
 const slope=observed(track,'wall-slope',wall([[20,-70],[20,70]],{height:.9}));
 for(const f of slope.faces)for(const p of f.vertices){
  const height=p.z-slope.groundHeight(p.x,p.y);
  assert.ok(Math.abs(height)<1e-8||Math.abs(height-.9)<1e-8,'wall vertices contact terrain or add exactly the physical wall height');
 }
 const uncited=wall([[20,-50],[20,50]]);delete uncited.features[0].properties.sourceId;
 assert.equal(observed(track,'wall-uncited',uncited).faces.length,0);
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
  const shapeBudget={rounded:23,tufted:35,columnar:25,conical:17};
  assert.equal(background.length,env.stats.backgroundTrees);assert.ok(backgroundFaces.length<=background.reduce((sum,t)=>sum+shapeBudget[t.growthForm||'rounded'],0),circuit.id+' added face budget');
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
