'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Race=require('./race-engine.js'),circuits=require('./circuits.js'),Pits=require('./pit-facilities.js'),Environment=require('./track-environment.js');
const track={width:10,points:[{x:0,y:0,z:4},{x:100,y:0,z:4},{x:100,y:100,z:4},{x:0,y:100,z:4}],bounds:{minX:0,maxX:100,minY:0,maxY:100,width:100,height:100}};
const collection=features=>({coordinateSystem:'local-metres',sources:[{id:'photo',url:'https://example.com/reference.jpg'}],features});
const feature=(kind,type,coordinates,properties={})=>({type:'Feature',id:kind,geometry:{type,coordinates},properties:{kind,sourceId:'photo',evidence:'test observed geometry',...properties}});
const area=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];

test('pit mesh preserves source coordinates and physical track while making finite architecture and connected lane ribbons',()=>{
  const data=collection([
    feature('pit-lane','LineString',[[5,0],[12,20],[80,20],[95,0]],{width:5,edgeMarkings:true}),
    feature('pit-building','Polygon',[area(20,30,40,12)],{height:8,garageCount:8,garageEdge:0,windowBand:true,roofStyle:'pitched',roofRise:2,canopyDepth:2}),
    feature('pit-apron','Polygon',[area(15,22,50,8)]),
    feature('pit-wall','LineString',[[20,8],[80,8]],{height:1.2}),
    feature('pit-box-row','LineString',[[20,29],[60,29]],{bayCount:8,depth:5,side:'left'})
  ]),before=JSON.stringify({track,data});
  const model=Pits.build(track,data);assert.equal(model.stats.buildings,1);assert.equal(model.stats.lanes,1);assert.equal(model.stats.boxes,8);assert.equal(model.stats.rejected,0);
  assert(model.faces.length>100);for(const f of model.faces)for(const p of f.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));
  assert.equal(JSON.stringify({track,data}),before);assert.deepEqual(Pits.build(track,data).faces,model.faces);
  const lane=model.faces.filter(f=>f.kind==='pit-lane');assert(lane.some(f=>f.vertices.some(p=>Math.hypot(p.x-5,p.y)<3)));assert(lane.some(f=>f.vertices.some(p=>Math.hypot(p.x-95,p.y)<3)));
  assert(model.query(40,30,30).length>0);assert.equal(model.query(10000,10000,10).length,0);assert(model.focus.distance>=70);
});

test('box row left/right follows the east/south map convention and cannot invent facilities without evidence',()=>{
  for(const side of ['left','right']){const model=Pits.build(track,collection([feature('pit-box-row','LineString',[[20,30],[60,30]],{bayCount:4,depth:6,side})]));const ys=model.faces.flatMap(f=>f.vertices.map(p=>p.y));assert.equal(model.stats.boxes,4);assert(side==='left'?Math.min(...ys)<25&&Math.max(...ys)<30.2:Math.max(...ys)>35&&Math.min(...ys)>29.8);}
  const model=Pits.build(track,collection([{geometry:{type:'Polygon',coordinates:[area(20,30,30,10)]},properties:{kind:'pit-building',height:10}}]));assert.equal(model.stats.rejected,1);assert.equal(model.faces.length,0);assert.equal(model.focus,null);
});

test('service footprints exclude illustrative trees from pit garages and access lanes',()=>{
  const model=Pits.build(track,collection([feature('pit-building','Polygon',[area(30,30,30,15)],{height:6})]));
  assert(model.contains(40,35));assert(model.contains(29,36,2));assert(!model.contains(75,60,2));
  const env={coordinateSystem:'local-metres',features:[{id:'tree',geometry:{type:'Point',coordinates:[40,35]},properties:{kind:'tree',sourceId:'photo',height:8}}]};
  assert.equal(Environment.build(track,'test',env,{backgroundVegetation:false}).stats.trees,1);assert.equal(Environment.build(track,'test',env,{backgroundVegetation:false,excludeTree:model.contains}).stats.trees,0);
});

test('all eleven layouts have traceable photo-reviewed facility data and usable scene geometry',()=>{
  for(const circuit of circuits){const file=path.join(__dirname,'data/pits',circuit.id+'.json');assert(fs.existsSync(file),circuit.id+' collection');const data=JSON.parse(fs.readFileSync(file,'utf8')),ids=new Set(data.sources.map(s=>s.id));assert.equal(data.circuitId,circuit.id);assert(data.sources.some(s=>s.imageUrl||s.localEvidenceFile),circuit.id+' photographic evidence');
    for(const f of data.features){assert(ids.has(f.properties.sourceId),circuit.id+' feature source');assert(f.properties.evidence,circuit.id+' interpreted observation');}
    const race=new Race({circuit,vehicleIds:['g80'],racingLine:true}),before=JSON.stringify(race.pathPoints),model=Pits.build(race.track,data);assert.equal(model.stats.rejected,0,circuit.id+' supported features');assert(model.stats.features>0,circuit.id+' confirmed facilities');assert(model.stats.buildings>0||model.stats.lanes>0,circuit.id+' visible facilities');assert(model.focus);assert.equal(JSON.stringify(race.pathPoints),before);for(const f of model.faces)for(const p of f.vertices)assert([p.x,p.y,p.z].every(Number.isFinite),circuit.id+' finite mesh');
  }
});

test('the facility camera remains pannable, zoomable and resets safely across races',()=>{
  const Renderer=require('./circuit-renderer.js'),race=new Race({circuit:circuits[0],vehicleIds:['g80']});
  const r=new Renderer({style:{},getContext:()=>({}),addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:900,height:565})});
  r.race=race;r.pits=Pits.build(track,collection([feature('pit-building','Polygon',[area(20,30,40,10)],{height:8})]));r.setView('pits');assert.equal(r.mode,'pits');const start=r._camera(race.cars[0]);r.pan(40,-12,{x:450,y:300});assert.notDeepEqual(r.panOffset,{x:0,y:0,z:0});r.recenter();assert.deepEqual(r.panOffset,{x:0,y:0,z:0});r.orbit(20,10);r.zoom(1.5);r.setView('pits');assert.deepEqual(r._camera(race.cars[0]),start);r.pits=Pits.build(track,collection([]));r.setView('pits');assert.equal(r.mode,'overview');
});

test('pit focus shows the chosen facade and nearby buildings instead of fitting distant compounds',()=>{
  const data=collection([feature('pit-building','Polygon',[area(20,30,80,20)],{height:8,garageEdge:0}),{...feature('pit-building','Polygon',[area(2000,2000,100,30)],{height:8}),id:'secondary'}]);data.metadata={focusFeatureId:'pit-building'};
  const model=Pits.build(track,data);assert(model.focus.bounds.maxX<150);assert(model.focus.distance<150);assert(Math.cos(model.focus.yaw)<0,'camera looks at the north-facing garage front');
});

test('grandstand tiers rise away from the chosen front, reserve trees and leave the pit camera unchanged',()=>{
  const pit=feature('pit-building','Polygon',[area(20,30,40,12)],{height:8,garageEdge:0});
  const stand=feature('grandstand','Polygon',[area(150,30,220,24)],{frontEdge:0,height:20,seatingHeight:11,rows:14,canopyDepth:22,pressBoxHeight:2});
  const data=collection([pit,stand]),before=JSON.stringify({track,data}),model=Pits.build(track,data),baseline=Pits.build(track,collection([pit]));
  assert.equal(model.stats.grandstands,1);assert.equal(model.stats.buildings,1);assert.equal(model.stats.garages,0);
  assert.deepEqual(model.focus,baseline.focus,'large grandstand cannot take over the pit camera');
  assert(model.contains(250,40));assert(model.contains(149,40,2));assert(!model.contains(400,40));
  const seats=kind=>model.faces.filter(f=>f.kind===kind).flatMap(f=>f.vertices);
  const blue=seats('grandstand-seat-lower'),green=seats('grandstand-seat-upper'),roof=seats('grandstand-canopy');
  assert(blue.length&&green.length&&roof.length);
  assert(Math.max(...blue.map(p=>p.y))<Math.min(...green.map(p=>p.y)),'concourse separates the two tiers');
  assert(Math.max(...blue.map(p=>p.z))<Math.min(...green.map(p=>p.z)));
  assert(Math.min(...roof.map(p=>p.z))>Math.max(...green.map(p=>p.z))+2);
  for(const kind of ['grandstand-slab','grandstand-concourse','grandstand-column','grandstand-truss','grandstand-press-box','grandstand-press-glass'])assert(model.faces.some(f=>f.kind===kind),kind);
  const env={coordinateSystem:'local-metres',features:[{id:'blocked-tree',geometry:{type:'Point',coordinates:[250,40]},properties:{kind:'tree',sourceId:'photo',height:8}}]};
  assert.equal(Environment.build(track,'test',env,{backgroundVegetation:false,excludeTree:model.contains}).stats.trees,0);
  assert.equal(JSON.stringify({track,data}),before);assert.deepEqual(Pits.build(track,data).faces,model.faces);
});

test('separate Inje-shaped lower and upper tiers keep roof extent local and fit a bounded landmark face budget',t=>{
  const lower=[[-232.544,488.656],[-232.013,625.183],[-216.428,625.349],[-208.032,99.395],[-225.668,98.766],[-228.989,246.357]];
  const upper=[[-249.059,246.423],[-253.683,488.359],[-232.544,488.656],[-228.989,246.357]];
  const features=[
    {...feature('grandstand','Polygon',[[...lower,lower[0]]],{frontEdge:2,canopy:false,height:6,rows:9,seatingHeight:5.5,lowerSeatColor:'#2f6ca7',upperSeatColor:'#2f6ca7'}),id:'lower'},
    {...feature('grandstand','Polygon',[[...upper,upper[0]]],{frontEdge:2,rows:8,height:22,seatingBaseHeight:6,seatingHeight:12,canopyDepth:22,lowerSeatColor:'#4b9371',upperSeatColor:'#4b9371',pressBoxHeight:2}),id:'upper'},
    feature('timing-gantry','LineString',[[50,-20],[50,20]],{clearanceHeight:7.5,lapText:'--',timeText:'--:--'}),
    feature('pit-building','Polygon',[area(20,30,40,12)],{height:8,rooftopEquipment:[{u:.5,v:.5,width:4,depth:2,height:.7}]})
  ];
  const model=Pits.build(track,collection(features));assert.equal(model.stats.rejected,0);assert.equal(model.stats.grandstands,2);assert.equal(model.stats.gantries,1);assert.equal(model.stats.rooftopEquipment,1);
  assert(model.faces.length<1800,`bounded strip geometry: ${model.faces.length} faces`);
  t.diagnostic(`${model.faces.length} faces for two separated grandstands, gantry and equipped building`);
  assert(!model.faces.some(f=>f.featureId==='lower'&&/canopy|truss|column|press/.test(f.kind)));
  const lowerSeats=model.faces.filter(f=>f.featureId==='lower'&&f.kind.startsWith('grandstand-seat')).flatMap(f=>f.vertices);
  assert(Math.abs(Math.max(...lowerSeats.map(p=>p.z))-(4+5.5+.3+.2))<1e-8,'uncovered tiers retain their requested 5.5m seating height without roof clearance');
  const roofs=model.faces.filter(f=>f.kind==='grandstand-canopy').flatMap(f=>f.vertices);
  assert(roofs.every(p=>p.y>240&&p.y<495),'roof covers the short upper grandstand, not the entire lower stand');
  const upperSeats=model.faces.filter(f=>f.featureId==='upper'&&f.kind.startsWith('grandstand-seat')).flatMap(f=>f.vertices);
  assert(Math.min(...upperSeats.map(p=>p.z))>4+6);assert(Math.max(...upperSeats.map(p=>p.z))<4+12.6);
  for(const face of model.faces)for(const p of face.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));
  assert(model.query(-240,360,10).some(g=>g.faces.some(f=>f.featureId==='upper')));
});

test('timing gantry leaves a real road opening above seven metres and rejects piers in the carriageway',()=>{
  const hilly={...track,points:[{x:0,y:0,z:4},{x:50,y:0,z:12},{x:100,y:0,z:4},...track.points.slice(2)]};
  const source=feature('timing-gantry','LineString',[[50,-20],[50,20]],{clearanceHeight:2,beamHeight:1.4,lapText:'12',timeText:'01:23.4'});
  const model=Pits.build(hilly,collection([source]));assert.equal(model.stats.gantries,1);assert.equal(model.stats.rejected,0);
  const beam=model.faces.filter(f=>f.kind==='timing-gantry-beam');assert(beam.length>0);
  assert(Math.min(...beam.flatMap(f=>f.vertices.map(p=>p.z)))>=12+7,'clearance clamps to seven metres above the highest crossed road');
  const piers=model.faces.filter(f=>f.kind==='timing-gantry-pier');assert(piers.length>0);
  assert(piers.every(f=>f.vertices.every(p=>Math.abs(p.y)>track.width/2+1.1)),'piers remain outside the road');
  assert(!model.contains(50,0,1),'gantry span does not reserve an occupied wall across the road');
  assert(model.contains(50,20,1));
  for(const kind of ['timing-gantry-board','timing-gantry-lettering','timing-gantry-display'])assert(model.faces.some(f=>f.kind===kind),kind);
  const board=model.faces.filter(f=>f.kind==='timing-gantry-board').flatMap(f=>f.vertices),glyphs=model.faces.filter(f=>f.kind==='timing-gantry-lettering').flatMap(f=>f.vertices);
  assert(Math.max(...glyphs.map(p=>Math.abs(p.x-50)))>Math.max(...board.map(p=>Math.abs(p.x-50))),'glyphs stand clear of the black board plane');
  for(const bad of [feature('timing-gantry','LineString',[[50,-2],[50,20]]),{...source,properties:{...source.properties,sourceId:'missing'}}]){
    const rejected=Pits.build(hilly,collection([bad]));assert.equal(rejected.stats.rejected,1);assert.equal(rejected.faces.length,0);
  }
});

test('optional roof equipment stays on its own roof and repeated hotel window bands preserve the default facade',()=>{
  const base=feature('pit-building','Polygon',[area(20,30,40,12)],{height:20,windowBand:true,roofStyle:'pitched',roofRise:2});
  const original=Pits.build(track,collection([base]));
  const explicit=Pits.build(track,collection([{...base,properties:{...base.properties,windowRows:1}}]));
  assert.deepEqual(explicit.faces,original.faces);
  const detailed=Pits.build(track,collection([{...base,properties:{...base.properties,windowRows:6,rooftopEquipment:[
    {u:.5,v:.5,width:4,depth:2,height:.7},{u:0,v:0,width:4,depth:2,height:.7}
  ]}}]));
  assert.equal(detailed.stats.rooftopEquipment,1,'equipment crossing the building edge is skipped');
  const levels=new Set(detailed.faces.filter(f=>f.kind==='pit-window').map(f=>Math.min(...f.vertices.map(p=>p.z))));assert.equal(levels.size,6);
  const equipment=detailed.faces.filter(f=>f.kind==='pit-rooftop-equipment');assert(equipment.length>0);
  for(const f of equipment)for(const p of f.vertices){
    assert(p.x>=20&&p.x<=60&&p.y>=30&&p.y<=42);
    const roof=4+20+2*(1-Math.abs(((p.y-30)/12)*2-1));assert(p.z>=roof+.019,'bottom follows the local roof');
  }
  assert.equal(detailed.stats.buildings,1);assert.equal(detailed.stats.garages,0);
});

test('segmented hotel bases share one level datum over sloped ground without flattening foundations',()=>{
  const sloped={...track,points:track.points.map(p=>({...p,z:4+p.x*.1}))};
  const parts=[{...feature('pit-building','Polygon',[area(10,30,15,12)],{height:16,windowRows:4}),id:'west'},
    {...feature('pit-building','Polygon',[area(60,30,15,12)],{height:16,windowRows:4}),id:'east'}];
  const ungrouped=Pits.build(sloped,collection(parts)),grouped=Pits.build(sloped,collection(parts.map(f=>({...f,properties:{...f.properties,baseGroup:'hotel',facadeAccentColor:'#bd783f',facadeAccentRows:[2]}}))));
  const heights=(model,id,kind)=>model.faces.filter(f=>f.featureId===id&&f.kind===kind).flatMap(f=>f.vertices.map(p=>p.z));
  assert(Math.min(...heights(ungrouped,'east','pit-roof'))>Math.max(...heights(ungrouped,'west','pit-roof'))+4);
  assert.equal(Math.min(...heights(grouped,'east','pit-roof')),Math.min(...heights(grouped,'west','pit-roof')));
  const bottoms=id=>[...new Set(grouped.faces.filter(f=>f.featureId===id&&f.kind==='pit-window').map(f=>Math.min(...f.vertices.map(p=>p.z))))].sort((a,b)=>a-b);
  assert.deepEqual(bottoms('east'),bottoms('west'));
  assert(Math.min(...heights(grouped,'west','pit-building'))<Math.min(...heights(grouped,'east','pit-building'))-4,'foundations retain local ground heights');
  for(const id of ['west','east'])assert.equal(new Set(grouped.faces.filter(f=>f.featureId===id&&f.kind==='pit-facade-accent').map(f=>Math.min(...f.vertices.map(p=>p.z)))).size,1,'only requested inter-floor accent is generated');
});

test('a long grandstand follows longitudinal road elevation instead of floating at its highest corner',()=>{
  const slope=.07,longTrack={width:10,points:[{x:-100,y:0,z:-3},{x:500,y:0,z:39},{x:500,y:100,z:39},{x:-100,y:100,z:-3}],bounds:{minX:-100,maxX:500,minY:0,maxY:100,width:600,height:100}};
  const source=feature('grandstand','Polygon',[area(20,30,320,20)],{frontEdge:0,height:22,seatingBaseHeight:6,seatingHeight:12,rows:8,canopyDepth:20,pressBoxHeight:2});
  const model=Pits.build(longTrack,collection([source])),ground=x=>4+slope*x;
  const bottomByX=new Map();for(const f of model.faces.filter(f=>f.kind==='grandstand-riser'))for(const p of f.vertices)bottomByX.set(p.x,Math.min(bottomByX.get(p.x)??Infinity,p.z));
  assert(bottomByX.size>6,'longitudinal sections include interior road-height samples');
  for(const [x,z] of bottomByX)assert(Math.abs(z-ground(x))<1e-8,`foundation at x=${x}: ${z} vs ${ground(x)}`);
  const seats=model.faces.filter(f=>f.kind.startsWith('grandstand-seat')).flatMap(f=>f.vertices);
  assert(seats.every(p=>p.z-ground(p.x)>6&&p.z-ground(p.x)<12.6),'seating levels remain relative to the local ground');
  const roof=model.faces.filter(f=>f.kind==='grandstand-canopy').flatMap(f=>f.vertices);
  assert(roof.every(p=>p.z-ground(p.x)>=21.8&&p.z-ground(p.x)<=23.21),'canopy follows the same slope without stretching structural height');
  const press=model.faces.filter(f=>f.kind==='grandstand-press-box').flatMap(f=>f.vertices);
  assert(press.every(p=>p.z-ground(p.x)>=12.59&&p.z-ground(p.x)<=14.61));
  assert(Math.max(...roof.map(p=>p.z))-Math.min(...roof.map(p=>p.z))>20,'roof must not be a single flat maximum-height slab');
});
