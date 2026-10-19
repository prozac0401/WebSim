'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Race=require('./race-engine.js'),Evolution=require('./tuning-evolution.js'),circuits=require('./circuits.js');
const Pose=require('./driving-pose.js'),Renderer=require('./circuit-renderer.js');
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,message+': '+a+' != '+b);
function fixture(circuit){
  const ctx={drawImage(){}},canvas={style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:980,height:615})};
  const r=new Renderer(canvas);
  if(circuit){const race=new Race({circuit:circuits.find(c=>c.id===circuit),entrants:Evolution.createPopulation({vehicleId:'gr86',budget:30,seed:31415}),laps:1});r.setRace(race);}
  r._project=()=>({scale:100});r._paint=()=>{};
  return r;
}
function shadows(r,p,mesh={length:4.265,width:1.775}){
  const faces=[],drawn=[];r._queue=face=>faces.push(face);r.surfaceRenderer={render(entries){drawn.push(...entries);return{};},dispose(){}};
  r._drawVehicleBatch([{car:r.race?.cars[0]||{id:0,vehicleId:'gr86'},mesh,position:p,selected:true}],{});
  assert.equal(faces.length,2);assert.equal(drawn.length,1);assert.equal(drawn[0].position,p,'shadow sampling must not move the model');
  return faces;
}
test('actual Spa 240 m GR86 shadows stay on the road instead of a level plane far above and below it',t=>{
  const r=fixture('spa'),car=r.race.cars[0];car.distance=240;car.standingStartDistance=null;
  const p=r._displayPose(Pose.sampleCar(r.race,car),car),before=JSON.stringify(p),faces=shadows(r,p);
  let oldMaximumError=0,lowest=Infinity,highest=-Infinity;
  for(const [f,face]of faces.entries()){
    assert.equal(face.vertices.length,24);assert.equal(face.fill,'rgba(18,29,34,'+[.07,.12][f]+')');
    for(const [i,q]of face.vertices.entries()){
      const angle=i/24*Math.PI*2,scale=[1.08,.94][f],x=Math.cos(angle)*4.265*.51*scale,y=Math.sin(angle)*1.775*.62*scale;
      close(q.x,p.x+x*Math.cos(p.angle)-y*Math.sin(p.angle),'original ellipse x');
      close(q.y,p.y+x*Math.sin(p.angle)+y*Math.cos(p.angle),'original ellipse y');
      const support=Pose.surfaceAt(r.roadGeometry,{...q,angle:p.angle});assert.ok(support);
      close(q.z,support.z+.025,'every shadow point is 25 mm above the shared road');
      oldMaximumError=Math.max(oldMaximumError,Math.abs(p.z-support.z));lowest=Math.min(lowest,q.z);highest=Math.max(highest,q.z);
    }
  }
  assert.ok(oldMaximumError>.3,'the fixture reproduces the reported large false gap');assert.ok(highest-lowest>.6,'shadow visibly follows the downhill road');
  assert.equal(JSON.stringify(p),before);t.diagnostic(JSON.stringify({oldMaximumErrorM:oldMaximumError,shadowHeightRangeM:highest-lowest}));r.destroy();
});
test('missing road geometry falls back to the body pitch plane while preserving the footprint',()=>{
  const r=fixture(),p={x:12,y:-7,z:20,elevation:20,angle:.73,grade:-.3};
  for(const face of shadows(r,p))for(const q of face.vertices){const along=(q.x-p.x)*Math.cos(p.angle)+(q.y-p.y)*Math.sin(p.angle);close(q.z,p.z+along*p.grade+.025,'sloped fallback');}
  r.destroy();
});
test('isolated preview stays flat even when its origin overlaps an unrelated world road',()=>{
  const r=fixture(),p={x:0,y:0,elevation:0,angle:0,grade:0};
  // Production surface sampling would accept this nearby elevated ribbon if
  // the preview were incorrectly treated as a world pose.
  const edges=[0,1,2,3].map(i=>({s:i,p:{x:i,y:0,z:2},left:{x:i,y:-6},right:{x:i,y:6},outerLeft:{x:i,y:-7},outerRight:{x:i,y:7}}));
  r.roadGeometry={edges,stats:{method:'adaptive-c2-centreline'},sample:s=>({x:s,y:0,z:2,angle:0,grade:0,curvature:0,s})};
  for(const face of shadows(r,p))for(const q of face.vertices)close(q.z,.025,'preview shadow height');r.destroy();
});
