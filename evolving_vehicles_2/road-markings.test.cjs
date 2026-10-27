'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Markings=require('./road-markings.js'),Terrain=require('./circuit-terrain.js');
const Race=require('./race-engine.js'),Road=require('./circuit-road.js'),circuits=require('./circuits.js');
const paint=(type,fields={})=>({type,sourceId:'fixture-observation',evidence:'Synthetic observed-paint fixture, not a real venue claim.',...fields});
const area=faces=>faces.reduce((sum,f)=>sum+Math.abs(f.vertices.reduce((n,p,i)=>{const q=f.vertices[(i+1)%f.vertices.length];return n+p.x*q.y-p.y*q.x;},0))/2,0);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function height(face,x,y){
 for(let i=1;i<face.vertices.length-1;i++){
  const [a,b,c]=[face.vertices[0],face.vertices[i],face.vertices[i+1]],d=cross(a,b,c);if(Math.abs(d)<1e-10)continue;
  const p={x,y},u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;
  if(Math.min(u,v,w)>=-1e-8)return u*a.z+v*b.z+w*c.z;
 }
 return null;
}
function sampleMaterial(faces,x,y){return faces.filter(f=>height(f,x,y)!==null).map(f=>f.fill);}
function straightFixture(){
 const faces=[];
 for(let x=0;x<60;x+=5){
  const p=(u,y)=>({x:u,y,z:10+u*.07+y*.03+Math.sin(u*.19)*y*.08});
  faces.push({vertices:[p(x,-6),p(x+5,-6),p(x+5,6),p(x,6)],fill:'#465250',stroke:'#465250',width:.55,kind:'road-asphalt',road:true,panelIndex:faces.length});
 }
 const protectedFaces=[{vertices:[{x:0,y:6,z:0},{x:60,y:6,z:0},{x:60,y:7,z:0},{x:0,y:7,z:0}],fill:'#aa2222',road:true},
  {vertices:[{x:0,y:7,z:0},{x:60,y:7,z:0},{x:60,y:10,z:0},{x:0,y:10,z:0}],kind:'context-ground',fill:'#66aa44'}];
 return {faces:[...faces,...protectedFaces],protectedFaces,road:{length:1000,sample:s=>({x:s,y:0,z:999,angle:0})}};
}

test('paint partitions graded asphalt on its original planes and preserves three-sided grid/checker geometry',()=>{
 const fixture=straightFixture(),metadata={roadMarkings:[
  paint('cross-line',{atM:8,width:.3}),
  paint('grid-box',{atM:18,offset:-2,width:1.8,length:4.5,stroke:.12}),
  paint('checker',{atM:35,depth:1,cellSize:.5}),
  paint('line',{startM:40,endM:55,offset:2,width:.2,dashLength:2,gapLength:1})
 ]},before=JSON.stringify({faces:fixture.faces,metadata});
 const a=Markings.apply(fixture.faces,fixture.road,metadata,12),b=Markings.apply(fixture.faces,fixture.road,metadata,12);
 assert.deepEqual(a,b);assert.equal(JSON.stringify({faces:fixture.faces,metadata}),before);
 assert.equal(a.stats.features,4);assert.equal(a.stats.rejected,0);assert.ok(a.stats.paintedFaces>20);
 assert.deepEqual(a.stats.byType,{'cross-line':1,'grid-box':1,checker:1,line:1});
 assert.ok(Math.abs(area(a.faces)-area(fixture.faces))<1e-7,'paint replaces area rather than adding a lifted layer');
 for(const original of fixture.protectedFaces)assert.ok(a.faces.includes(original),'curb and non-road ground retain identity');
 for(const f of a.faces.filter(f=>f.road)){
  if(f.panelIndex===undefined)continue;
  assert.equal(f.road,true);assert.equal(f.stroke,f.fill,'white paint is not outlined in the original dark asphalt');
  for(const p of f.vertices){const z=height(fixture.faces[f.panelIndex],p.x,p.y);assert.notEqual(z,null);assert.ok(Math.abs(z-p.z)<1e-8);}
 }
 const painted=a.faces.filter(f=>f.kind==='road-marking'),byType=type=>painted.filter(f=>f.markingType===type);
 assert.ok(Math.abs(area(byType('cross-line'))-3.6)<1e-7);
 assert.ok(Math.abs(area(byType('grid-box'))-(1.8*.12+2*.12*(4.5-.12)))<1e-7);
 assert.ok(Math.abs(area(byType('checker'))-12)<1e-7);
 for(const color of ['#e9e9df','#303637'])assert.ok(Math.abs(area(byType('checker').filter(f=>f.fill===color))-6)<1e-7);
 assert.ok(Math.abs(area(byType('line'))-2)<1e-7);
 assert.deepEqual(sampleMaterial(a.faces,22.45,-2),['#465250'],'grid front stays open');
 assert.ok(sampleMaterial(a.faces,18.05,-2).every(fill=>fill==='#e9e9df'),'grid rear bar is painted');
 const gap=sampleMaterial(a.faces,42.5,2);assert.ok(gap.length&&gap.every(fill=>fill==='#465250'),'dash gap stays asphalt across shared triangle edges');
 assert.ok(painted.every(f=>f.sourceId==='fixture-observation'&&f.evidence&&f.markingId));
});

test('positive offsets paint the right side, later markings win and outside paint cannot recolor a curb',()=>{
 const {faces,road,protectedFaces}=straightFixture(),metadata={roadMarkings:[
  paint('line',{startM:10,endM:20,offset:6.2,width:1,color:'#eeeeee'}),
  paint('cross-line',{atM:15,width:.4,leftOffset:5.7,rightOffset:7,color:'#303637'})
 ]};
 const a=Markings.apply(faces,road,metadata,12),marked=a.faces.filter(f=>f.kind==='road-marking');
 assert.ok(Math.abs(area(marked)-3)<1e-7,'only the 0.3 m-wide asphalt overlap is paintable');
 assert.ok(marked.every(f=>f.vertices.every(p=>p.y>=5.7-1e-8&&p.y<=6+1e-8)));
 assert.ok(sampleMaterial(a.faces,15.03,5.8).every(fill=>fill==='#303637'));
 assert.ok(sampleMaterial(a.faces,12.03,5.8).every(fill=>fill==='#eeeeee'));
 protectedFaces.forEach(f=>assert.ok(a.faces.includes(f)));
 assert.deepEqual(sampleMaterial(a.faces,15.03,6.5),['#aa2222']);
 assert.deepEqual(sampleMaterial(a.faces,15.03,-5.8),['#465250']);
});

function circleFixture(){
 const radius=30,length=2*Math.PI*radius,width=6;
 const road={canonicalLength:length,sample:s=>({x:radius*Math.cos(s/radius),y:radius*Math.sin(s/radius),z:5*Math.sin(s/radius),angle:s/radius+Math.PI/2})};
 const at=(s,offset)=>{const p=road.sample(s);return {x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,z:p.z};};
 const faces=Array.from({length:120},(_,i)=>{const a=length*i/120,b=length*(i+1)/120;return {vertices:[at(a,-3),at(b,-3),at(b,3),at(a,3)],kind:'road-asphalt',fill:'#465250',road:true,panelIndex:i};});
 return {road,faces,width,at};
}
test('canonical intervals and grid boxes wrap the timing seam without long chords or duplicate coverage',()=>{
 const {road,faces,width,at}=circleFixture(),length=road.canonicalLength;
 const a=Markings.apply(faces,road,{roadMarkings:[paint('line',{startM:length-3,endM:3,offset:1,width:.2})]},width);
 assert.ok(a.stats.paintedFaces>0);assert.ok(Math.abs(area(a.faces)-area(faces))<1e-7);
 for(const s of [1.25,length-1.25]){const p=at(s,1);assert.ok(sampleMaterial(a.faces,p.x,p.y).every(fill=>fill==='#e9e9df'));}
 const far=at(length/2,1);assert.ok(sampleMaterial(a.faces,far.x,far.y).every(fill=>fill==='#465250'));
 const box=Markings.apply(faces,road,{roadMarkings:[paint('grid-box',{atM:length-2,offset:0,length:4})]},width);
 assert.ok(box.stats.paintedFaces>0);assert.ok(Math.abs(area(box.faces)-area(faces))<1e-7);
 for(const f of box.faces.filter(f=>f.kind==='road-marking'))for(const p of f.vertices){assert.ok(Math.abs(p.z-height(faces[f.panelIndex],p.x,p.y))<1e-8);}
});

test('real graded Everland and Taebaek paint keeps the exact source plane, road boundary and physics inputs',()=>{
 for(const id of ['everland','taebaek']){
  const track=Race.buildTrack(circuits.find(c=>c.id===id)),originalTrack=JSON.stringify(track),road=Road.build(track);
  const faces=road.edges.map((a,i)=>{const b=road.edges[(i+1)%road.edges.length];return {vertices:[a.left,b.left,b.right,a.right],fill:'#465250',road:true,kind:'road-asphalt',panelIndex:i};});
  const before=JSON.stringify(faces),atM=id==='taebaek'?530:150;
  const result=Markings.apply(faces,{...road,length:track.centerlineLength||track.length},{roadMarkings:[
   paint('grid-box',{atM,offset:-2}),paint('checker',{atM:atM+12,depth:1})
  ]},track.width);
  assert.equal(result.stats.features,2);assert.ok(result.stats.paintedFaces>10,id+' visible paint fragments');
  assert.equal(JSON.stringify(faces),before);assert.equal(JSON.stringify(track),originalTrack);
  assert.ok(Math.abs(area(faces)-area(result.faces))<1e-6,id+' exact XY coverage');
  for(const f of result.faces)for(const p of f.vertices){
   const z=height(faces[f.panelIndex],p.x,p.y);assert.notEqual(z,null,id+' never outside the source asphalt panel');
   assert.ok(Math.abs(p.z-z)<1e-7,id+' no vertical lift or alternate interpolated slope');
  }
 }
});

test('uncited or malformed rules are rejected, absent metadata returns original arrays, and work is bounded',()=>{
 const {faces,road}=straightFixture();
 assert.equal(Markings.apply(faces,road,undefined,12).faces,faces);
 const bad=[{type:'line',startM:1,endM:2},paint('line',{startM:0,endM:4,width:NaN}),paint('checker',{atM:0,cellSize:0}),paint('unknown')];
 const invalid=Markings.apply(faces,road,{roadMarkings:bad},12);assert.equal(invalid.faces,faces);assert.equal(invalid.stats.rejected,4);
 const outside=Markings.apply(faces,road,{roadMarkings:[paint('line',{startM:100,endM:110,width:.2})]},12);
 assert.equal(outside.faces,faces);assert.equal(outside.stats.paintedFaces,0);
 let calls=0;const huge={length:100000,sample:s=>{calls++;return {x:s,y:0,angle:0};}};
 const bounded=Markings.apply(faces,huge,{roadMarkings:[paint('line',{startM:0,endM:100000})]},12);
 assert.equal(bounded.faces,faces);assert.equal(bounded.stats.limitReached,true);assert.equal(calls,0,'oversized patch rejected before sampling');
 const limited=Markings.apply([],road,{roadMarkings:Array.from({length:501},()=>paint('cross-line',{atM:10}))},12);
 assert.equal(limited.stats.features,500);assert.equal(limited.stats.rejected,1);assert.equal(limited.stats.limitReached,true);assert.ok(limited.stats.overlayFaces<=20000);
});

test('browser export uses the same paint helper and leaves non-markable surfaces untouched',()=>{
 const context={window:{CircuitTerrain:Terrain}};vm.runInNewContext(fs.readFileSync(require.resolve('./road-markings.js'),'utf8'),context);
 assert.equal(typeof context.window.RoadMarkings.apply,'function');
 const {faces,road}=straightFixture(),protectedOnly=faces.filter(f=>f.kind!=='road-asphalt');
 const result=context.window.RoadMarkings.apply(protectedOnly,road,{roadMarkings:[paint('cross-line',{atM:10})]},12);
 assert.equal(result.faces,protectedOnly);assert.equal(result.stats.paintedFaces,0);
});
