'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Surface=require('./terrain-surfaces.js'),Renderer=require('./circuit-renderer.js');
const camera=()=>Renderer.prototype._createCamera({x:0,y:0,z:0},10,0,0,16,16,16);
const worldFace=(y,fill='#667755',extra={})=>({vertices:[{x:-2,y,z:-2},{x:2,y,z:-2},{x:0,y,z:2}],fill,...extra});
const dynamicFace=(depth,fill='rgba(0,255,0,.5)')=>({points:[{x:12,y:12,depth},{x:20,y:12,depth},{x:16,y:20,depth}],fill,depth,priority:0});
function mockGL(){
 let id=0,currentBuffer=null,currentProgram=null,error=0,depthMask=true;
 const enabled=new Set(),attributes=new Map(),buffers=new Map(),uniforms=new Map(),log={uploads:[],draws:[],deleted:[],clears:0,viewports:[],shaderSources:[]};
 const gl={log,buffers,enabled,attributes};
 for(const [i,key] of ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','STATIC_DRAW','DYNAMIC_DRAW','TRIANGLES','FLOAT','DEPTH_TEST','LEQUAL','CULL_FACE','BLEND','SRC_ALPHA','ONE_MINUS_SRC_ALPHA','ONE','COLOR_BUFFER_BIT','DEPTH_BUFFER_BIT'].entries())gl[key]=i+1;
 gl.NO_ERROR=0;
 Object.assign(gl,{
  createShader:()=>({id:++id}),shaderSource:(s,source)=>log.shaderSources.push(source),compileShader:()=>{},getShaderParameter:()=>true,getShaderInfoLog:()=>'',deleteShader:()=>{},
  createProgram:()=>({id:++id}),attachShader:()=>{},linkProgram:()=>{},getProgramParameter:()=>true,getProgramInfoLog:()=>'',deleteProgram:()=>{},
  getAttribLocation:(_p,name)=>({aPoint:0,aColor:1,aPlane:2}[name]),getUniformLocation:(p,name)=>p.id+':'+name,
  createBuffer:()=>{if(gl.failAllocation)return null;const b={id:++id};buffers.set(b,{data:null,deleted:false});return b;},
  bindBuffer:(_target,b)=>{currentBuffer=b;},
  bufferData:(_target,data,usage)=>{assert.ok(currentBuffer);buffers.get(currentBuffer).data=new Float32Array(data);log.uploads.push({buffer:currentBuffer,usage,length:data.length});if(gl.failStaticUpload&&usage===gl.STATIC_DRAW)error=1285;},
  getError:()=>{const e=error;error=0;return e;},
  deleteBuffer:b=>{if(!b)return;buffers.get(b).deleted=true;log.deleted.push(b);},
  enableVertexAttribArray:i=>enabled.add(i),disableVertexAttribArray:i=>enabled.delete(i),
  vertexAttribPointer:(i,size,_type,_normalized,stride,offset)=>attributes.set(i,{buffer:currentBuffer,size,stride,offset}),
  useProgram:p=>{currentProgram=p;},uniform4f:(location,...values)=>uniforms.set(location,values),uniformMatrix4fv:(location,_transpose,values)=>uniforms.set(location,Array.from(values)),
  viewport:(...values)=>log.viewports.push(values),clearColor:()=>{},clear:()=>{log.clears++;},enable:()=>{},disable:()=>{},depthFunc:()=>{},depthMask:v=>{depthMask=v;},blendFuncSeparate:()=>{},
  drawArrays:(_kind,start,count)=>{
   for(const i of enabled){const a=attributes.get(i);assert.ok(a&&!buffers.get(a.buffer).deleted,'no enabled attribute retains a deleted static buffer');}
   log.draws.push({program:currentProgram,buffer:currentBuffer,start,count,depthMask,uniforms:new Map(uniforms)});
  }
 });
 return gl;
}
function harness(run){
 const old=global.document,gl=mockGL(),canvases=[];
 global.document={createElement:()=>{
  const handlers={},canvas={width:0,height:0,handlers,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  canvas.getContext=kind=>kind==='webgl'?gl:{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{canvas.image=image;}};
  canvases.push(canvas);return canvas;
 }};
 try{const surface=new Surface();assert.equal(surface.available,true);return run(surface,gl,canvases);}finally{global.document=old;}
}

test('world matrix matches renderer projection, exact near clipping and conservative scene depth bounds',()=>{
 const r=Object.assign(Object.create(Renderer.prototype),{width:640,height:360});
 for(const [yaw,pitch,cx,cy] of [[0,0,320,180],[Math.PI/2,.45,260,230],[-2.1,-.15,410,120],[1.3,1.4,320,180]]){
  const c=r._createCamera({x:1150,y:-780,z:93},80,yaw,pitch,450,cx,cy);
  const vertices=Array.from({length:25},(_,i)=>({x:1130+(i%5)*10,y:-800+Math.floor(i/5)*10,z:70+i*1.7}));
  const cache=Surface.prepareScene({faces:[{vertices,fill:'#668855'}]}),range=Surface.sceneRange(cache,c,[dynamicFace(1000)]),matrix=Surface.cameraMatrix(c,640,360,range.near,range.far);
  assert.equal(range.near,Math.max(.3,c.distance*.018)+.001);assert.ok(range.far>=1001);
  for(const p of vertices){
   const q=[p.x-c.target.x,p.y-c.target.y,p.z-c.target.z,1],clip=Array.from({length:4},(_,row)=>q.reduce((s,v,column)=>s+matrix[column*4+row]*v,0));
   const projected=r._project(p,c);if(!projected)continue;
   assert.ok(Math.abs((clip[0]/clip[3]+1)*320-projected.x)<.0001);
   assert.ok(Math.abs((1-clip[1]/clip[3])*180-projected.y)<.0001);
   assert.ok(clip[3]<range.far);assert.ok(Math.abs(clip[3]-projected.depth)<.00002);
  }
 }
 const c=camera(),range={near:.301,far:30},matrix=Surface.cameraMatrix(c,32,32,range.near,range.far);
 for(const [depth,inside] of [[.300,false],[.302,true],[29,true],[31,false]]){
  const q=[0,c.distance-depth,0,1],z=q.reduce((s,v,i)=>s+matrix[i*4+2]*v,0),w=q.reduce((s,v,i)=>s+matrix[i*4+3]*v,0);
  assert.equal(z>=-w&&z<=w,inside,'GPU homogeneous clip volume matches the renderer near plane and full-scene far plane');
 }
});

test('CPU fallback projection matches near-clipped queues and whole-face top-plane visibility for either winding',()=>{
 const r=Object.assign(Object.create(Renderer.prototype),{width:100,height:80});
 const flat=[{x:-4,y:-4,z:0},{x:4,y:-4,z:0},{x:4,y:4,z:0},{x:-4,y:4,z:3}];
 for(const reverse of [false,true])for(const road of [false,true])for(const pitch of [-.5,.5]){
  const face={vertices:reverse?flat.slice().reverse():flat,fill:'#778899',road},c=r._createCamera({x:0,y:0,z:0},20,.4,pitch,50,50,40),queue=[];
  r._queue(face,c,queue);const actual=Surface.projectFace(face,c,100,80);
  assert.equal(!!actual,queue.length>0);
  if(actual)for(let i=0;i<actual.points.length;i++)for(const key of ['x','y','depth'])assert.ok(Math.abs(actual.points[i][key]-queue[0].points[i][key])<1e-8);
  const prepared=Surface.prepareScene({faces:[face]}),plane=Array.from(prepared.data.slice(7,11));
  for(let i=0;i<prepared.vertices;i++)assert.deepEqual(Array.from(prepared.data.slice(i*11+7,i*11+11)),plane,'all fan triangles share the original first-three-vertex plane');
 }
 const c=camera(),face={vertices:[{x:-1,y:9.8,z:0},{x:2,y:6,z:-1},{x:0,y:6,z:2}],fill:'#abcdef'};
 r.width=32;r.height=32;const queue=[];r._queue(face,c,queue);const projected=Surface.projectFace(face,c,32,32);
 assert.equal(projected.points.length,4,'eye-plane crossing is clipped, not dropped');assert.equal(projected.points.length,queue[0].points.length);
 assert.ok(projected.points.every(p=>p.depth>=.301-1e-8));
 assert.equal(Surface.projectFace(worldFace(20),c,32,32),null,'entirely behind-camera world geometry stays hidden');
});

test('static vertices upload once across camera/viewport/DPR changes and opaque order stays intact',()=>harness((surface,gl)=>{
 const scene={faces:[worldFace(0,'#ff0000'),worldFace(1,'#00ff00',{road:true}),worldFace(2,'#0000ff')]},before=JSON.stringify(scene);
 const first=surface.renderScene(scene,camera(),[],32,32,1),uploads=()=>gl.log.uploads.filter(u=>u.usage===gl.STATIC_DRAW);
 assert.equal(first,surface.canvas);assert.equal(uploads().length,1);assert.equal(gl.log.draws.length,1);
 const data=gl.buffers.get(uploads()[0].buffer).data;
 assert.deepEqual([data[3],data[4],data[5]],[1,0,0]);assert.deepEqual([data[36],data[37],data[38]],[0,1,0]);assert.deepEqual([data[69],data[70],data[71]],[0,0,1]);
 const next=camera();next.target.x+=.5;
 surface.renderScene(scene,next,[dynamicFace(5,'#ffffff')],80,60,2);
 assert.equal(uploads().length,1);assert.deepEqual(gl.log.viewports.at(-1),[0,0,160,120]);assert.equal(surface.sceneStats.staticUploads,1);assert.equal(surface.sceneStats.cpuProjectedFaces,0);
 assert.equal(JSON.stringify(scene),before);assert.equal(gl.log.clears,2,'one depth clear per entire frame');
 const draw=gl.log.draws.at(-1),view=draw.uniforms.get(surface.view);
 assert.deepEqual(view,[80,60,surface.sceneStats.near,surface.sceneStats.far],'projected dynamic faces use the exact static near/far range');
 assert.equal(gl.enabled.has(2),false,'world plane attribute disabled for the legacy screen shader');
}));

test('transparent world faces interleave with dynamic guidance in depth order without clearing opaque depth',()=>harness((surface,gl)=>{
 const scene={faces:[worldFace(-2,'#556677'),worldFace(0,'rgba(0,0,0,.2)',{kind:'tree-shadow'}),worldFace(6,'rgba(255,0,0,.4)')]};
 surface.renderScene(scene,camera(),[dynamicFace(7)],32,32);
 const draws=gl.log.draws,world=surface._worldProgram.program;
 assert.equal(gl.log.clears,1);assert.deepEqual(draws.map(d=>d.depthMask),[true,false,false,false]);
 assert.deepEqual(draws.map(d=>d.program===world),[true,true,false,true],'far shadow, middle screen arrow and near world alpha share one sorted stream');
 assert.deepEqual(draws.filter(d=>d.program===world).map(d=>d.start),[0,3,6]);
 const previousUploads=gl.log.uploads.filter(u=>u.usage===gl.STATIC_DRAW).length;gl.log.draws.length=0;
 surface.renderScene(scene,camera(),[dynamicFace(7)],32,32,1,{showShadows:false});
 assert.deepEqual(gl.log.draws.map(d=>d.program===world),[true,false,true]);
 assert.equal(surface.sceneStats.cpuProjectedFaces,1);assert.equal(gl.log.uploads.filter(u=>u.usage===gl.STATIC_DRAW).length,previousUploads);
}));

test('scene switches, legacy rendering and disposal free static buffers without stale enabled attributes',()=>harness((surface,gl)=>{
 const a={faces:[worldFace(0)]},b={faces:[worldFace(1)]};
 surface.renderScene(a,camera(),[],32,32);const first=surface._sceneCache.buffer;
 surface.renderScene(b,camera(),[],32,32);assert.ok(gl.buffers.get(first).deleted);const second=surface._sceneCache.buffer;
 surface.render([dynamicFace(5,'#ffffff')],32,32);
 assert.equal(surface._sceneCache,null);assert.equal(surface.sceneStats,null);assert.ok(gl.buffers.get(second).deleted);assert.equal(gl.enabled.has(2),false);
 surface.renderScene(a,camera(),[],32,32);const third=surface._sceneCache.buffer;
 surface.dispose();assert.ok(gl.buffers.get(third).deleted);assert.ok(gl.buffers.get(surface.buffer).deleted);assert.equal(surface.available,false);
}));

test('context loss and static allocation/upload failures return the complete software world plus dynamic layer',()=>{
 for(const failure of ['loss','allocation','upload'])harness((surface,gl,canvases)=>{
  const scene={faces:[worldFace(-2,'#556677')]},guide=dynamicFace(5);
  if(failure==='loss'){surface.renderScene(scene,camera(),[],32,32);canvases[0].handlers.webglcontextlost({preventDefault(){}});}
  if(failure==='allocation')gl.failAllocation=true;
  if(failure==='upload')gl.failStaticUpload=true;
  const result=surface.renderScene(scene,camera(),[guide],32,32);
  assert.equal(surface.available,false);assert.equal(surface.kind,'software-depth');assert.ok(result.image);
  const projected=Surface.projectFace(scene.faces[0],camera(),32,32),expected=Surface.rasterize([projected,guide],32,32);
  assert.deepEqual(result.image.data,expected.pixels,'failure cannot return a missing static world or missing guidance');
  assert.equal(surface._sceneCache,null);assert.equal(surface.sceneStats.software,true);
  surface.dispose();
 });
});
