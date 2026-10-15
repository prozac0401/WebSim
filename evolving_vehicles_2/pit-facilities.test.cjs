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
