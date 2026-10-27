'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Skids=require('./road-skidmarks.js'),Markings=require('./road-markings.js');
const Race=require('./race-engine.js'),Road=require('./circuit-road.js'),circuits=require('./circuits.js');
const Surface=require('./terrain-surfaces.js'),Renderer=require('./circuit-renderer.js');
const EPS=1e-6;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area=vertices=>Math.abs(vertices.reduce((sum,p,i)=>{const q=vertices[(i+1)%vertices.length];return sum+p.x*q.y-p.y*q.x;},0))/2;
const triangles=face=>Array.from({length:face.vertices.length-2},(_,i)=>[face.vertices[0],face.vertices[i+1],face.vertices[i+2]]);
function weights(triangle,p){const [a,b,c]=triangle,d=cross(a,b,c);return [cross(b,c,p)/d,cross(c,a,p)/d,cross(a,b,p)/d];}
function inside(triangle,p){return weights(triangle,p).every(v=>v>=-EPS&&v<=1+EPS);}
function triangleHeight(triangle,p){return weights(triangle,p).reduce((z,w,i)=>z+w*triangle[i].z,0);}
function polygonIntersectionArea(a,b){
 let out=a.map(p=>({...p}));const sign=Math.sign(cross(b[0],b[1],b[2]));
 for(let j=0;j<b.length&&out.length;j++){
  const from=b[j],to=b[(j+1)%b.length],next=[];
  for(let i=0;i<out.length;i++){
   const p=out[i],q=out[(i+1)%out.length],u=sign*cross(from,to,p),v=sign*cross(from,to,q);
   if(u>=0)next.push(p);
   if((u>=0)!==(v>=0)){const t=u/(u-v);next.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}
  }
  out=next;
 }
 return out.length<3?0:area(out);
}
function ellipseFixture(a=70,b=30){
 const length=2*Math.PI*Math.sqrt((a*a+b*b)/2),width=10,count=240;
 const sample=s=>{const t=((s%length)+length)%length/length*2*Math.PI;return{x:a*Math.cos(t),y:b*Math.sin(t),z:12+3*Math.sin(t),angle:Math.atan2(b*Math.cos(t),-a*Math.sin(t))};};
 const edges=Array.from({length:count},(_,i)=>{const s=i*length/count,p=sample(s),at=offset=>({x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,z:p.z});return{s,p,left:at(-width/2),right:at(width/2),outerLeft:at(-width/2-1),outerRight:at(width/2+1)};});
 const faces=edges.map((a,i)=>{const b=edges[(i+1)%count];return{vertices:[a.left,b.left,b.right,a.right],road:true,kind:'road-asphalt',fill:'#465250'};});
 const curb=edges.map((a,i)=>{const b=edges[(i+1)%count];return{vertices:[a.right,b.right,b.outerRight,a.outerRight],road:true,kind:'road-curb',fill:'#bc5151'};});
 return{road:{sample,edges},faces,curb,length,width,id:'graded-hairpin-fixture'};
}
function build(fixture,options={}){return Skids.build(fixture.faces,fixture.road,{length:fixture.length,width:fixture.width,id:fixture.id,...options});}
function assertDraped(result,sources){
 assert.ok(result.faces.length>0,'fixture must generate visible tyre traces');
 for(const face of result.faces){
  const source=sources[face.sourceFace];assert.ok(source?.road&&source.kind==='road-asphalt','only actual asphalt supports a trace');
  assert.equal(face.kind,'road-skidmark');assert.equal(face.road,true);assert.equal(face.estimated,true);
  assert.ok(area(face.vertices)>1e-7);
  // The preserved Pocheon legacy ribbon contains folded quads: both original
  // fan triangles can overlap in XY at different heights. Match one complete
  // 3-D source plane instead of accidentally choosing the first XY overlap.
  const candidates=triangles(source).filter(t=>face.vertices.every(p=>inside(t,p)));
  assert.ok(candidates.length,'the whole fragment remains within one original asphalt triangle');
  const plane=candidates.find(t=>face.vertices.every(p=>Math.abs(p.z-triangleHeight(t,p)-.008)<EPS));
  assert.ok(plane,'all fragment heights follow the same original asphalt triangle');
  for(const p of face.vertices){
   assert.ok([p.x,p.y,p.z].every(Number.isFinite));
   assert.ok(Math.abs(p.z-triangleHeight(plane,p)-.008)<EPS,'8 mm display lift is applied exactly once to the actual triangle plane');
  }
  const alpha=/^rgba\(0,0,0,([.\d]+)\)$/.exec(face.fill);assert.ok(alpha,'black-only decal batching contract');
  assert.ok(Number(alpha[1])>=.009&&Number(alpha[1])<=.09,'old tyre traces remain faint');
 }
}

test('graded and reversed-winding asphalt clips each tyre fragment to its original plane without altering the source',()=>{
 const f=ellipseFixture();f.faces=f.faces.map((face,i)=>i%2?{...face,vertices:face.vertices.slice().reverse()}:face);
 const before=JSON.stringify({faces:f.faces,edges:f.road.edges}),result=build(f);
 assertDraped(result,f.faces);assert.equal(JSON.stringify({faces:f.faces,edges:f.road.edges}),before);
 assert.equal(result.stats.faces,result.faces.length);assert.equal(result.stats.tracks,result.stats.passes*2);
 assert.ok(new Set(result.faces.map(face=>face.fill)).size>5,'fading and variable wear produce multiple weak densities');
 assert.ok(result.zones.every(zone=>zone.passes>=1),'all selected bends receive history before extra passes');
});

test('existing painted fragments and curbs remain completely outside skid coverage',()=>{
 const f=ellipseFixture(),painted=Markings.apply([...f.faces,...f.curb],{...f.road,length:f.length},{roadMarkings:[{type:'cross-line',atM:0,width:7,color:'#ededdf',sourceId:'fixture-paint',evidence:'Synthetic start stripe used to protect original road paint.'}]},f.width);
 const protectedFaces=painted.faces.filter(face=>face.kind!=='road-asphalt'),before=JSON.stringify(painted.faces);
 assert.ok(painted.faces.some(face=>face.kind==='road-marking'),'a real protected stripe intersects the seam hairpin');
 const result=Skids.build(painted.faces,f.road,{length:f.length,width:f.width,id:f.id});
 assertDraped(result,painted.faces);assert.equal(JSON.stringify(painted.faces),before);
 let probes=0;
 for(const face of result.faces)for(const p of protectedFaces){
  const c=face.vertices.reduce((v,q)=>({x:v.x+q.x/face.vertices.length,y:v.y+q.y/face.vertices.length}),{x:0,y:0});
  if(Math.abs(c.x-p.vertices[0].x)>15||Math.abs(c.y-p.vertices[0].y)>15)continue;
  for(const t of triangles(p)){assert.ok(polygonIntersectionArea(face.vertices,t)<EPS,'no positive-area trace on an authored marking or curb');probes++;}
 }
 assert.ok(probes>100,'check nearby protected surfaces, not only distant geometry');
});

test('optional protected paint masks cut holes in traces without splitting or mutating the source asphalt',()=>{
 const f=ellipseFixture(),a=f.road.sample(-3),b=f.road.sample(3);
 const at=(p,d)=>({x:p.x-Math.sin(p.angle)*d,y:p.y+Math.cos(p.angle)*d,z:999});
 const mask={vertices:[at(a,-6),at(b,-6),at(b,6),at(a,6)],kind:'road-marking',road:true,fill:'#eeeeee'};
 const before=JSON.stringify({faces:f.faces,mask}),plain=build(f),result=build(f,{protectedFaces:[mask]});
 assert.ok(plain.faces.reduce((n,face)=>n+triangles(mask).reduce((s,t)=>s+polygonIntersectionArea(face.vertices,t),0),0)>1,'mask crosses existing traces');
 assertDraped(result,f.faces);
 for(const face of result.faces)for(const t of triangles(mask))assert.ok(polygonIntersectionArea(face.vertices,t)<EPS,'paint mask cannot acquire tyre history');
 assert.equal(JSON.stringify({faces:f.faces,mask}),before);
});

test('straight roads and uniform circles do not invent local braking or hairpin peaks from numerical noise',()=>{
 const straight={faces:[],road:{edges:[{}],sample:s=>({x:s,y:0,z:0,angle:0})},length:400,width:10,id:'straight'};
 const line=build(straight);assert.equal(line.zones.length,0);assert.equal(line.faces.length,0);
 const circle=ellipseFixture(50,50),round=build(circle);assert.equal(round.zones.length,0,'constant curvature has no local demanding-bend peak');assert.equal(round.faces.length,0);
 for(const f of [ellipseFixture(70,30),ellipseFixture(80,25)])assert.ok(build(f).zones.length>0,'nonuniform hairpins still qualify');
});

test('a hairpin crossing canonical zero has continuous local fragments on both sides of the timing seam',()=>{
 const f=ellipseFixture(),result=build(f),zone=result.zones.findIndex(z=>z.startM<0&&z.endM>0);
 assert.ok(zone>=0,'fixture apex is at the canonical seam');
 const marks=result.faces.filter(face=>face.zoneId===zone);
 assert.ok(marks.some(face=>face.sourceFace<4));assert.ok(marks.some(face=>face.sourceFace>=f.faces.length-4));
 for(const face of marks)for(let i=0;i<face.vertices.length;i++){
  const a=face.vertices[i],b=face.vertices[(i+1)%face.vertices.length];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<12,'no chord shortcuts across the closed course');
 }
 assertDraped(result,f.faces);
});

test('history is deterministic per circuit and independent of car, weather, current lap or paused time',()=>{
 const f=ellipseFixture(),a=build(f),b=build(f,{car:{speed:0,gear:1},weather:'rain',lap:24,time:900}),c=build(f,{id:'another-history'});
 assert.deepEqual(b,a);assert.notEqual(JSON.stringify(a.faces),JSON.stringify(c.faces),'different circuit seeds vary traces');
 const group=new Map();for(const face of a.faces){if(!group.has(face.trackId))group.set(face.trackId,[]);group.get(face.trackId).push(face.vertices);}
 assert.ok(group.size>=8,'several paired traces are present');
 assert.equal(new Set(Array.from(group.values(),v=>JSON.stringify(v))).size,group.size,'passes are not duplicated curves');
});

test('actual Taebaek, Spa and legacy Pocheon roads retain their geometry and physics while capped paired histories cover selected bends',()=>{
 for(const id of ['taebaek','spa','pocheon']){
  const circuit=circuits.find(c=>c.id===id),sourceBefore=JSON.stringify(circuit),track=Race.buildTrack(circuit),trackBefore=JSON.stringify(track),road=Road.build(track);
  const faces=road.edges.map((a,i)=>{const b=road.edges[(i+1)%road.edges.length];return{vertices:[a.left,b.left,b.right,a.right],fill:'#465250',road:true,kind:'road-asphalt'};});
  const before=JSON.stringify(faces),result=Skids.build(faces,road,{length:track.centerlineLength||track.length,width:track.width,id});
  assertDraped(result,faces);assert.ok(result.faces.length<=6000,id+' fixed decal geometry budget');assert.ok(result.zones.length<=8);
  assert.ok(result.zones.every(z=>z.passes>=1),id+' round-robin does not leave distant selected bends bare');
  const pairs=new Map();for(const face of result.faces){const [zone,pass,side]=face.trackId.split(':');const key=zone+':'+pass;if(!pairs.has(key))pairs.set(key,new Set());pairs.get(key).add(side);}
  assert.ok(Array.from(pairs.values()).every(sides=>sides.has('-1')&&sides.has('1')),id+' cap keeps whole paired passes');
  assert.equal(JSON.stringify(faces),before);assert.equal(JSON.stringify(track),trackBefore);assert.equal(JSON.stringify(circuit),sourceBefore);
  assert.deepEqual(Race.buildTrack(circuit),track,id+' race path, curvature, grade and lap distances remain unchanged');
 }
});

test('missing inputs fail closed and the standalone browser export shares the CPU contract',()=>{
 for(const args of [[null,null,{}],[[],{},{}],[[],{edges:[{}],sample:()=>({})},{length:NaN,width:10}]])assert.equal(Skids.build(...args).faces.length,0);
 const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('./road-skidmarks.js'),'utf8'),context);
 assert.equal(typeof context.window.RoadSkidmarks.build,'function');
 const f=ellipseFixture(),actual=context.window.RoadSkidmarks.build(f.faces,f.road,{length:f.length,width:f.width,id:f.id});
 assert.equal(JSON.stringify(actual),JSON.stringify(build(f)));
});

const worldTriangle=(z,fill,extra={})=>({vertices:[{x:-4,y:-4,z},{x:4,y:-4,z},{x:0,y:4,z}],fill,...extra});
test('static scene compilation batches only translucent black road skidmarks and preserves all other alpha categories',()=>{
 const opaque=worldTriangle(0,'#667755',{road:true}),a=worldTriangle(.008,'rgba(0,0,0,.05)',{kind:'road-skidmark',road:true}),b={...a,fill:'rgba(0,0,0,.09)',vertices:[...a.vertices,{x:-5,y:0,z:.008}]};
 const ordinary=[worldTriangle(.02,'rgba(0,0,0,.05)',{kind:'tree-shadow',road:true}),worldTriangle(.03,'rgba(0,0,0,.05)',{kind:'road-skidmark',road:false}),worldTriangle(.04,'rgba(1,0,0,.05)',{kind:'road-skidmark',road:true})];
 const solidBlack=worldTriangle(.05,'rgba(0,0,0,1)',{kind:'road-skidmark',road:true}),invisible=worldTriangle(.06,'rgba(0,0,0,0)',{kind:'road-skidmark',road:true});
 const scene={faces:[ordinary[0],a,opaque,ordinary[1],b,solidBlack,ordinary[2],invisible]},before=JSON.stringify(scene),cache=Surface.prepareScene(scene);
 assert.equal(cache.decalFaces,2);assert.equal(cache.decalCount,9,'triangle and quad use 3 + 6 batched vertices');assert.equal(cache.opaqueCount,6);
 assert.deepEqual(cache.transparent.map(r=>r.face),[...ordinary,invisible]);
 assert.equal(cache.vertices,27);assert.equal(cache.data.length,27*11);
 for(let i=cache.opaqueCount;i<cache.opaqueCount+cache.decalCount;i++){
  assert.deepEqual(Array.from(cache.data.slice(i*11+3,i*11+6)),[0,0,0]);
  assert.ok(cache.data[i*11+6]>.04&&cache.data[i*11+6]<.1);
  assert.ok(cache.data[i*11+9]>0,'batched marks retain the upward road visibility plane');
 }
 assert.ok(cache.transparent.every(r=>r.start>=cache.opaqueCount+cache.decalCount));assert.equal(JSON.stringify(scene),before);
});

function withMockSurface(run){
 let id=0,buffer=null,program=null,writeDepth=true;const enabled=new Set(),buffers=new Map(),log={uploads:[],draws:[],deleted:[],clears:0};
 const gl={log,NO_ERROR:0};
 for(const [i,name] of ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','STATIC_DRAW','DYNAMIC_DRAW','TRIANGLES','FLOAT','DEPTH_TEST','LEQUAL','CULL_FACE','BLEND','SRC_ALPHA','ONE_MINUS_SRC_ALPHA','ONE','COLOR_BUFFER_BIT','DEPTH_BUFFER_BIT'].entries())gl[name]=i+1;
 Object.assign(gl,{
  createShader:()=>({id:++id}),shaderSource:()=>{},compileShader:()=>{},getShaderParameter:()=>true,getShaderInfoLog:()=>'',deleteShader:()=>{},
  createProgram:()=>({id:++id}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,getProgramInfoLog:()=>'',deleteProgram:()=>{},
  getAttribLocation:(_p,name)=>({aPoint:0,aColor:1,aPlane:2}[name]),getUniformLocation:(_p,name)=>name,
  createBuffer:()=>{const b={id:++id};buffers.set(b,null);return b;},bindBuffer:(_target,b)=>{buffer=b;},
  bufferData:(_target,data,usage)=>{buffers.set(buffer,new Float32Array(data));log.uploads.push({buffer,usage,length:data.length});},getError:()=>0,
  deleteBuffer:b=>{buffers.delete(b);log.deleted.push(b);},enableVertexAttribArray:()=>{},disableVertexAttribArray:()=>{},vertexAttribPointer:()=>{},
  useProgram:p=>{program=p;},uniform4f:()=>{},uniformMatrix4fv:()=>{},viewport:()=>{},clearColor:()=>{},clear:()=>{log.clears++;},
  enable:state=>enabled.add(state),disable:state=>enabled.delete(state),depthFunc:()=>{},depthMask:v=>{writeDepth=v;},blendFuncSeparate:()=>{},
  drawArrays:(_kind,start,count)=>{assert.ok(buffers.has(buffer),'draw uses a live uploaded buffer');log.draws.push({buffer,program,start,count,writeDepth,blend:enabled.has(gl.BLEND),depthTest:enabled.has(gl.DEPTH_TEST)});}
 });
 const old=global.document;global.document={createElement:()=>({width:0,height:0,addEventListener:()=>{},getContext:kind=>kind==='webgl'?gl:null})};
 try{const surface=new Surface();assert.equal(surface.available,true);run(surface,gl);surface.dispose();}finally{global.document=old;}
}
test('renderScene draws all black ground decals once with opaque depth, without per-face projection or camera-mode reuploads',()=>withMockSurface((surface,gl)=>{
 const marks=Array.from({length:25},(_,i)=>worldTriangle(.008,'rgba(0,0,0,'+(.02+i*.002).toFixed(3)+')',{kind:'road-skidmark',road:true}));
 const shadow=worldTriangle(.009,'rgba(0,0,0,.1)',{kind:'tree-shadow'}),colored=worldTriangle(.02,'rgba(0,255,0,.2)',{kind:'road-skidmark',road:true});
 const scene={faces:[worldTriangle(0,'#667755',{road:true}),...marks,shadow,colored]},before=JSON.stringify(scene);
 for(const [view,yaw,pitch,width,height,dpr,showShadows] of [['follow',0,.5,64,48,1,true],['overview',1.3,1.2,96,64,2,false]]){
  const camera=Renderer.prototype._createCamera({x:0,y:0,z:0},20,yaw,pitch,40,width/2,height/2),start=gl.log.draws.length;
  surface.renderScene(scene,camera,[],width,height,dpr,{showShadows});
  assert.equal(surface.available,true,surface.failure);const draws=gl.log.draws.slice(start);
  assert.equal(draws[0].writeDepth,true);assert.equal(draws[0].blend,false);
  assert.equal(draws[1].start,3);assert.equal(draws[1].count,75,view+' all 25 triangles share one decal draw');
  assert.equal(draws[1].writeDepth,false);assert.equal(draws[1].blend,true);assert.equal(draws[1].depthTest,true);
  assert.equal(draws.filter(d=>d.start===3&&d.count===75).length,1);
  assert.equal(surface.sceneStats.groundDecalFaces,25);assert.equal(surface.sceneStats.groundDecalDraws,1);
  assert.equal(surface.sceneStats.cpuProjectedFaces,showShadows?2:1,'only ordinary shadow/colored transparency is CPU projected');
  assert.equal(surface.sceneStats.staticUploads,1,'view, shadows and DPR retain the immutable scene');
 }
 assert.equal(gl.log.uploads.filter(u=>u.usage===gl.STATIC_DRAW).length,1);assert.equal(gl.log.clears,2,'opaque and decals share one depth buffer per frame');
 assert.equal(JSON.stringify(scene),before);
 const previous=surface._sceneCache.buffer,camera=Renderer.prototype._createCamera({x:0,y:0,z:0},20,0,.5,40,32,24);
 surface.renderScene({faces:scene.faces},camera,[],64,48);
 assert.ok(gl.log.deleted.includes(previous),'a new scene releases its previous static GPU copy');assert.equal(surface.sceneStats.staticUploads,2);
}));

test('CPU fallback black alpha overlaps darken cumulatively without ordering artifacts or bleeding through nearer terrain',()=>{
 const projected=(fill,depth)=>({fill,depth,points:[{x:0,y:0,depth},{x:16,y:0,depth},{x:0,y:16,depth}]});
 const road=projected('#8090a0',10),a=projected('rgba(0,0,0,.05)',9.99),b=projected('rgba(0,0,0,.09)',9.99),bank=projected('#829569',5);
 const first=Surface.rasterize([road,a,b],16,16),reverse=Surface.rasterize([road,b,a],16,16),pixel=image=>Array.from(image.pixels.slice((2*image.width+2)*4,(2*image.width+2)*4+4));
 const expected=[128,144,160].map(v=>v*.95*.91),actual=pixel(first),other=pixel(reverse);
 for(let i=0;i<3;i++){assert.ok(Math.abs(actual[i]-expected[i])<=1);assert.ok(Math.abs(actual[i]-other[i])<=1,'8-bit rounding is the only permitted order difference');}
 assert.equal(actual[3],255);assert.deepEqual(pixel(Surface.rasterize([road,a,b,bank],16,16)),[130,149,105,255]);
 assert.ok(actual[0]<pixel(Surface.rasterize([road,a],16,16))[0],'two pale traces visibly accumulate');
});
