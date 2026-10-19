'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// Isolate browser globals while exercising the production render, ghost batch,
// shadows and label selection; projection alone is fixed to keep all cars in view.
const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./circuit-renderer.js'),'utf8'),context);
const Renderer=context.CircuitRenderer;
function fixture(cars,mode='follow',watch=2){
 const calls={gpu:[],shadows:[]},ctx={setTransform(){},clearRect(){},save(){},restore(){},drawImage(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},roundRect(){},fill(){},fillText(){},measureText:t=>({width:t.length*6})};
 const document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
 const race={cars:cars.map((c,i)=>({speed:20,color:'#456789',finished:false,finishTime:null,dnf:false,trackLength:1000,...c,screenPosition:c.screenPosition||{x:i*30,y:0}})),track:{length:1000,bounds:{width:100,height:100}},
  sampleForCar(c){return {...c.screenPosition,z:0,elevation:0,angle:0,grade:0};},
  standings(){return this.cars.slice().sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime||a.id-b.id:a.finished?-1:b.finished?1:a.dnf!==b.dnf?a.dnf?1:-1:b.distance/b.trackLength-a.distance/a.trackLength||a.id-b.id);}};
 const r=Object.assign(Object.create(Renderer.prototype),{race,mode,watch,width:800,height:600,dpr:1,ctx,canvas:{ownerDocument:document},markerPositions:[],contextGround:[],roadFaces:[],
  _camera:()=>({target:{x:0,y:0,z:0},distance:20}),_background(){},_queueWorldFaces(){},_startLine(){},_paintWorld(){},_inset(){},_compass(){},_caption(){},
  _displayPose:p=>p,_project:p=>({x:100+p.x,y:200+p.y,scale:10}),_mesh:()=>({length:4.5,width:1.8,height:1.4}),
  _queue(face,_camera,queue){queue.push(face);},_paint(queue){calls.shadows.push(...queue.filter(f=>String(f.fill).startsWith('rgba(18,29,34,')));},
  surfaceRenderer:{render(entries){calls.gpu.push(...entries.map(e=>({id:e.car.id,selected:e.selected})));return {};}}});
 return {r,race,calls,draw(){calls.gpu.length=0;calls.shadows.length=0;r.render();return calls.gpu.map(e=>e.id).sort((a,b)=>a-b);}};
}
const pack=()=>[{id:0,distance:600,trackLength:1200},{id:1,distance:550,trackLength:1200},{id:2,distance:500},{id:3,distance:520},{id:4,distance:90}];
for(const mode of ['follow','follow-classic']){
 test(`${mode} hides trailing and tied runs from bodies, shadows, labels and hit markers using normalized progress`,()=>{
  const f=fixture(pack(),mode),before=JSON.stringify(f.race.cars);
  assert.deepEqual(f.draw(),[2,3]);
  assert.deepEqual(Array.from(f.r.markerPositions,p=>p.id).sort(),[2,3]);
  assert.deepEqual(Array.from(f.r.markerPositions.filter(p=>p.labelVisible),p=>p.id).sort(),[2],'the existing immediate-predecessor label rule does not skip a tied standings row');
  assert.equal(f.calls.shadows.length,4,'only two shadow layers per displayed car');
  for(const face of f.calls.shadows){const x=face.vertices.reduce((s,p)=>s+p.x,0)/face.vertices.length;assert(Math.abs(x-60)<1e-8||Math.abs(x-90)<1e-8,'no shadow remains at a hidden car');}
  assert.equal(f.calls.gpu.find(e=>e.id===2).selected,true);assert.equal(JSON.stringify(f.race.cars),before,'visibility must not mutate physics, retirement or progress');
 });
 test(`${mode} counts complete laps instead of comparing wrapped positions or raw metres`,()=>{
  const f=fixture([{id:1,distance:1090,screenPosition:{x:180,y:0}},{id:2,distance:1100},{id:3,distance:1050,trackLength:900},{id:4,distance:250,screenPosition:{x:210,y:0}}],mode);
  assert.deepEqual(f.draw(),[2,3]);
  assert.deepEqual(Array.from(f.r.markerPositions,p=>p.id).sort(),[2,3]);
  assert.deepEqual(Array.from(f.r.markerPositions.filter(p=>p.labelVisible),p=>p.id).sort(),[2,3]);
 });
 test(`${mode} shows the watched launch alone and applies the existing finish-time precedence`,()=>{
  const start=fixture([{id:0,distance:0},{id:2,distance:0},{id:3,distance:0}],mode);assert.deepEqual(start.draw(),[2]);assert.equal(start.r.markerPositions.length,1);
  const finish=fixture([{id:0,distance:900,trackLength:900,finished:true,finishTime:90},{id:1,distance:1000,finished:true,finishTime:110},{id:2,distance:1000,finished:true,finishTime:100},{id:3,distance:999},{id:4,distance:1000,finished:true,finishTime:100}],mode);
  assert.deepEqual(finish.draw(),[0,2]);assert.deepEqual(Array.from(finish.r.markerPositions.filter(p=>p.labelVisible),p=>p.id).sort(),[0,2]);
 });
}
test('overview, top and scenic views retain the existing visibility of every on-screen run',()=>{
 for(const mode of ['overview','top','pits','eau-rouge']){const f=fixture(pack(),mode);assert.deepEqual(f.draw(),[0,1,2,3,4]);assert.equal(f.r.markerPositions.length,5);assert.equal(f.calls.shadows.length,10);}
});
test('changing watched run or leaving a rear-follow view rebuilds markers without stale hidden cars',()=>{
 const f=fixture(pack());assert.deepEqual(f.draw(),[2,3]);f.r.watch=3;assert.deepEqual(f.draw(),[3]);assert.deepEqual(Array.from(f.r.markerPositions,p=>p.id),[3]);
 f.r.mode='overview';assert.deepEqual(f.draw(),[0,1,2,3,4]);assert.equal(f.r.markerPositions.length,5);
 f.r.mode='follow-classic';assert.deepEqual(f.draw(),[3]);assert.equal(f.r.markerPositions.length,1);
});
