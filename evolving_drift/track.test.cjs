'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Track=require('./track.js'),Lines=require('./grip-line.js'),Catalog=require('./catalog.js');
const PUBLIC_ID='kr-kic-t21-kdl-2016-r2';
const PUBLIC_IDS=[PUBLIC_ID,'kr-inje-b-sdc-2018-r1','kr-kic-permanent-sdc-2017-r2','jp-ebisu-west-d1gp-2025','jp-tsukuba-d1gp-2025'];
test('public registry excludes synthetic fixtures unless development is explicitly requested',()=>{
  assert.deepEqual(Track.list().map(t=>t.id),PUBLIC_IDS);assert.equal(Track.DEFAULT_ID,PUBLIC_ID);
  assert.equal(Track.get().id,PUBLIC_ID);
  assert.throws(()=>Track.get('development-s500'),/검증된 실전 코스/);
  assert.throws(()=>Track.get('development-s500',{includeDevelopment:'true'}),/검증된 실전 코스/);
  assert.deepEqual(Track.list({includeDevelopment:'true'}).map(t=>t.id),PUBLIC_IDS);
  const fixtures=Track.list({includeDevelopment:true});assert.deepEqual(fixtures.map(t=>t.id),[...PUBLIC_IDS,Track.DEVELOPMENT_ID]);
  const t=Track.get(Track.DEVELOPMENT_ID,{includeDevelopment:true});
  assert.equal(t.kind,'development');assert.equal(t.verifiedCompetition,false);assert.match(t.name,/가상/);
});
test('the public course records its specific event and the limits of its reconstruction',()=>{
  const t=Track.get();
  assert.equal(t.kind,'event-reconstruction');assert.equal(t.verifiedCompetition,true);assert.equal(t.officialLayout,false);
  assert.equal(t.event.series,'KDL');assert.equal(t.event.year,2016);assert.equal(t.event.round,2);
  assert.match(t.event.direction,/T2.*T1/);assert.equal(t.reconstruction.officialStartFinish,false);assert.equal(t.reconstruction.officialClips,false);
  assert.ok(t.sources.some(s=>new URL(s.url).hostname==='www.fia.com'));
  assert.ok(t.sources.some(s=>new URL(s.url).hostname==='www.youtube.com'));
  assert.ok(t.sources.every(s=>s.title&&/^https:\/\//.test(s.url)));
  assert.equal(t.elevation.surveyed,false);assert.equal(t.elevation.resolutionM,90);assert.equal(t.provenance.visualHeightScale,1);
  assert.match(t.provenance.geometry,/OSM/);assert.match(t.provenance.boundary,/estimated/);assert.match(t.provenance.crossfall,/unknown/);
  assert.match(t.reconstruction.sourceSha256,/^[a-f0-9]{64}$/);assert.match(t.reconstruction.elevationSha256,/^[a-f0-9]{64}$/);
  assert.equal(t.mapAttribution.license,'ODbL-1.0');
});
test('the public event has open measured geometry, terrain and polygon limits',()=>{
  const t=Track.get();assert.ok(t.length>500&&t.length<700);assert.ok(t.judgedStart>0&&t.judgedEnd<t.length);
  assert.ok(t.boundaryPolygons.length>=2);assert.ok(t.obstacles.some(o=>o.type==='polygon'));
  assert.ok(t.excludedPolygons.length>0);assert.ok(t.excludedPolygons.every(p=>Object.isFrozen(p)&&p.every(Object.isFrozen)));
  assert.ok(t.geometrySignature.length>100);assert.ok(t.dataVersion>=1);
  assert.ok(Math.hypot(t.points.at(-1).x-t.points[0].x,t.points.at(-1).y-t.points[0].y)>100);
  assert.ok(Math.max(...t.points.map(p=>p.z))-Math.min(...t.points.map(p=>p.z))>.1);
  for(let s=0;s<t.length;s+=2.5){
    const p=t.sample(s),q=t.project(p.x,p.y,s),road=t.surface(p.x,p.y,s);
    assert.ok(Math.abs(q.s-s)<1e-6);assert.ok(q.distance<1e-6);assert.ok(t.contains(p.x,p.y,s));
    assert.ok(['x','y','z','grade','bank','widthLeft','widthRight'].every(key=>Number.isFinite(p[key])));
    assert.ok(p.widthLeft>0&&p.widthRight>0);assert.ok(['z','gradientX','gradientY','normalZ','muScale'].every(key=>Number.isFinite(road[key])));
  }
});
test('excluded islands reject either front contact and swept crossing while body-only overlap is permitted',()=>{
  const Physics=require('./physics.js'),car=Catalog.get(),rectangle=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  const track={...Track.create(),obstacles:[],contains:()=>true,boundaryPolygons:[rectangle(-100,-100,100,100)]};
  const state={x:20,y:0,yaw:0,s:20},contacts=Physics.frontContacts(car,state);
  for(const polygon of [...contacts.map(p=>rectangle(p.x-.1,p.y-.1,p.x+.1,p.y+.1)),rectangle(15,-5,25,5)]){
    track.excludedPolygons=[polygon];assert.equal(Physics.failure(car,track,state),'offtrack');
  }
  track.excludedPolygons=[rectangle(19.9,-.1,20.1,.1)];assert.equal(Physics.failure(car,track,state),null,'only body overlap with excluded ground is permitted');
  track.excludedPolygons=[rectangle(14.99,-2,15.01,2)];assert.equal(Physics.failure(car,track,state),null);
  assert.equal(Physics.failure(car,track,state,{x:10,y:0,yaw:0}),'offtrack');
  track.obstacles=[{type:'polygon',points:rectangle(19.9,-.1,20.1,.1)}];assert.equal(Physics.failure(car,track,state),'collision','wall collision keeps its original failure classification');
});
test('polygon acceleration never retains stale mutable geometry between calls',()=>{
  const Physics=require('./physics.js'),car=Catalog.get(),rectangle=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  const state={x:20,y:0,yaw:0,s:20},contact=Physics.frontContacts(car,state)[0];
  const boundary=rectangle(0,-5,40,5),obstacle=rectangle(100,-1,101,1),excluded=rectangle(contact.x+59.9,contact.y-.1,contact.x+60.1,contact.y+.1);
  const track={...Track.create(),contains:()=>true,boundaryPolygons:[boundary],obstacles:[{type:'polygon',points:obstacle}],excludedPolygons:[excluded]};
  assert.equal(Physics.failure(car,track,state),null);
  obstacle.forEach(p=>p.x-=80);assert.equal(Physics.failure(car,track,state),'collision');
  obstacle.forEach(p=>p.x+=80);assert.equal(Physics.failure(car,track,state),null);
  excluded.forEach(p=>p.x-=60);assert.equal(Physics.failure(car,track,state),'offtrack');
  excluded.forEach(p=>p.x+=60);assert.equal(Physics.failure(car,track,state),null);
  boundary[1].x=10;boundary[2].x=10;assert.equal(Physics.failure(car,track,state),'offtrack');
});
test('worker initializes the public default course from prepared records',async()=>{
  const messages=[],loaded=[];
  class Engine{constructor(){this.ready=true;this.best={id:'baseline'};}initialize(){}snapshot(){return {generation:0};}}
  const context=vm.createContext({onmessage:null,URLSearchParams,DriftRuntime:{...require('./runtime.js'),identity:()=> 'test-runtime'},importScripts(){},postMessage:m=>messages.push(m),clearTimeout,setTimeout,
    DriftCatalog:Catalog,DriftTrack:Track,DriftPreparedGrips:{async load(vehicle,track){loaded.push(track.id);return {}; }},DriftEvolution:{Engine}});
  vm.runInContext(fs.readFileSync(require.resolve('./worker.js'),'utf8'),context);
  await context.onmessage({data:{type:'init',variantId:Catalog.DEFAULT_ID,seed:37,runtimeIdentity:'test-runtime'}});
  assert.deepEqual(loaded,[PUBLIC_ID]);assert.equal(messages[0].type,'ready');
});
test('worker rejects a development fixture before loading records unless explicitly enabled',async()=>{
  for(const includeDevelopment of [undefined,false,'true',true]){
    const messages=[];let loads=0;
    class Engine{constructor(){this.ready=true;this.best={id:'baseline'};}initialize(){}snapshot(){return {generation:0};}}
    const context=vm.createContext({onmessage:null,URLSearchParams,DriftRuntime:{...require('./runtime.js'),identity:()=> 'test-runtime'},importScripts(){},postMessage:m=>messages.push(m),clearTimeout,setTimeout,
      DriftCatalog:Catalog,DriftTrack:Track,DriftPreparedGrips:{async load(){loads++;return {}; }},DriftEvolution:{Engine}});
    vm.runInContext(fs.readFileSync(require.resolve('./worker.js'),'utf8'),context);
    await context.onmessage({data:{type:'init',variantId:Catalog.DEFAULT_ID,trackId:Track.DEVELOPMENT_ID,includeDevelopment,seed:37,runtimeIdentity:'test-runtime'}});
    assert.equal(loads,includeDevelopment===true?1:0);assert.equal(messages[0].type,includeDevelopment===true?'ready':'error');
  }
});
test('S500 is an open 500 metre course with a consistent progress coordinate',()=>{
  const t=Track.create(),length=t.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-t.points[i].x,p.y-t.points[i].y),0);
  assert.ok(Math.abs(length-500)<1e-8);
  assert.ok(Math.hypot(t.points.at(-1).x-t.points[0].x,t.points.at(-1).y-t.points[0].y)>100);
  for(let s=0;s<=500;s+=2.5){const p=t.sample(s),q=t.project(p.x,p.y,s);assert.ok(Math.abs(q.s-s)<1e-7);assert.ok(q.distance<1e-7);}
});
test('grip candidate paths preserve the open start and finish and remain inside the safety margin',()=>{
  const t=Track.create(),v=Catalog.get(),lines=Lines.candidates(t,v),margin=t.width/2-v.physics.widthM/2-1.5;
  assert.equal(lines.length,3);assert.equal(lines[0].id,'center');
  for(const line of lines){
    assert.equal(line.closed,false);assert.ok(line.maxOffset<=Math.min(3.8,margin)+1e-8);
    for(const s of [0,500]){const a=line.sample(s),b=t.sample(s);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8);}
    for(const p of line.points){assert.ok([p.x,p.y,p.curvature,p.heading].every(Number.isFinite));assert.ok(t.project(p.x,p.y,p.s).distance<margin+1e-6);}
  }
  assert.ok(lines[2].bendingEnergy<lines[0].bendingEnergy);assert.ok(lines[2].pathLength<lines[0].pathLength);
});
