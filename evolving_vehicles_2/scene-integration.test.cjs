/* Scene integration without a browser or real GPU. These tests exercise the
 * production renderer against actual circuits and the browser script order. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Race = require('./race-engine.js');
const circuits = require('./circuits.js');
const Pose = require('./driving-pose.js');
const Renderer = require('./circuit-renderer.js');
const Profile = require('./spa-elevation-profile.js');
const close = (a,b,label,tolerance=1e-8) => assert.ok(Math.abs(a-b)<=tolerance, `${label}: ${a} != ${b}`);
const races = new Map(circuits.map(c => [c.id,new Race({circuit:c,vehicleIds:['g80'],racingLine:true})]));

function renderer(race=races.get('spa'),width=980,height=615) {
  const ctx={setTransform(){},beginPath(){},roundRect(){},fill(){},fillText(){}};
  const canvas={style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},
    getBoundingClientRect:()=>({left:0,top:0,width,height})};
  const r=new Renderer(canvas);r.setRace(race);return r;
}
function projectGeo(track,lon,lat) {
  const p=track.projection;
  return {x:((lon-p.origin[0])*p.metresPerDegree*Math.cos(p.latitudeRad)-p.offset.x)*p.scale,
    y:(-(lat-p.origin[1])*p.metresPerDegree-p.offset.y)*p.scale};
}
function pointAtDepth(camera,right,vertical,depth) {
  const along=camera.distance-depth,h=vertical*camera.sinPitch+along*camera.cosPitch;
  const dz=-vertical*camera.cosPitch+along*camera.sinPitch;
  return {x:camera.target.x+right*camera.cosYaw-h*camera.sinYaw,
    y:camera.target.y+right*camera.sinYaw+h*camera.cosYaw,z:camera.target.z+dz};
}
function surfaceFixture() {
  const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'vehicle-surfaces.js'),'utf8'),context);
  const uniforms=new Map(),gl={};
  for(const method of ['viewport','clearColor','clear','enable','depthFunc','disable','useProgram'])gl[method]=()=>{};
  for(const method of ['uniform2f','uniform3f','uniform4f'])gl[method]=(name,...values)=>uniforms.set(name,values);
  const r=Object.assign(Object.create(context.VehicleSurfaces.prototype),{available:true,canvas:{},gl,_drawAsset(){},
    uniforms:Object.fromEntries(['uTarget','uCamera','uViewport','uClip','uEye','uCar','uPose'].map(k=>[k,k]))});
  return {renderer:r,uniforms};
}

test('watched vehicle keeps full geometry while ghosts share a cached source-derived LOD',()=>{
  const r=surfaceFixture().renderer,draws=[];
  const camera={target:{x:0,y:0,z:0},distance:20,yaw:0,pitch:.3,f:400,cx:400,cy:300,sinYaw:0,cosYaw:1,sinPitch:Math.sin(.3),cosPitch:Math.cos(.3)};
  const source={primitives:[{name:'full'}],fallbackPrimitives:[{name:'reduced'}]},mesh={manufacturer:source,length:4.7,width:1.85,height:1.4,modelScale:[1,1,1],modelOffset:[0,0,0]};
  r._drawAsset=(mesh,p,c,low)=>draws.push(low);
  r.render([{mesh,position:{x:0,y:0},selected:true},{mesh,position:{x:5,y:0},selected:false}],camera,800,600);
  assert.deepEqual(draws,[true,false]);
  delete r._drawAsset;r.attributes={};r.lodCache=new WeakMap();
  for(const name of ['uniform3fv','disableVertexAttribArray','depthMask'])r.gl[name]=()=>{};
  const sources=[];r._assetBuffers=model=>{sources.push(model);return[]};
  r._drawAsset(mesh,{},camera,false);r._drawAsset(mesh,{},camera,true);r._drawAsset(mesh,{},camera,true);
  assert.equal(sources[0],source);assert.equal(sources[1].primitives,source.fallbackPrimitives);assert.equal(sources[1],sources[2]);
});

test('browser HTML order installs the official profile before TrackRace and shared poses before the renderer',()=>{
  const html=fs.readFileSync(path.join(__dirname,'evolving_vehicles_2.html'),'utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].map(m=>m[1].split('?')[0]);
  const index=name=>scripts.indexOf(name);
  assert.ok(index('spa-elevation-profile.js')>=0&&index('spa-elevation-profile.js')<index('race-engine.js'));
  assert.ok(index('../evolving_vehicles/vehicle-specs.js')<index('circuit-vehicle-specs.js')&&index('circuit-vehicle-specs.js')<index('race-engine.js'));
  assert.ok(index('driving-pose.js')<index('circuit-renderer.js'));
  assert.ok(index('track-environment-data.js')<index('track-environment.js'));
  assert.ok(index('track-environment.js')<index('circuit-renderer.js'));
  assert.ok(index('pit-facility-data.js')>=0&&index('pit-facilities.js')<index('circuit-renderer.js'));
  const context=vm.createContext({});vm.runInContext('window=globalThis',context);
  const needed=new Set(['../evolving_vehicles/vehicle-specs.js','circuit-vehicle-specs.js','spa-elevation-profile.js','circuits.js','race-engine.js','driving-pose.js']);
  for(const file of scripts)if(needed.has(file))vm.runInContext(fs.readFileSync(path.resolve(__dirname,file),'utf8'),context,{filename:file});
  const race=vm.runInContext("new TrackRace({circuit:RaceCircuits.find(c=>c.id==='spa'),vehicleIds:['g80'],racingLine:true})",context);
  assert.equal(context.TrackRace.VEHICLES.length,15);
  assert.equal(race.track.elevationProfile.id,Profile.metadata.id);
  close(race.track.points[0].z,418,'browser start elevation');
  const point=context.DrivingPose.sample(race,1050);assert.ok(point.grade>.09,'browser and Node both apply the real climb');
});

test('published profile keeps the start line and geographic projection aligned at the scenic landmarks',()=>{
  const race=races.get('spa'),track=race.track,r=renderer(race);r.setView('eau-rouge');
  const original=circuits.find(c=>c.id==='spa').coordinates[0],origin=projectGeo(track,...original);
  // The existing smoothed centreline's first point differs by only 2 mm from
  // the raw geographic origin; preserve that registration rather than round it.
  close(origin.x,track.points[0].x,'start x',.005);close(origin.y,track.points[0].y,'start y',.005);
  close(track.points[0].z,418,'official start height');
  const a=projectGeo(track,5.970788,50.442385),b=projectGeo(track,5.972132,50.440815);
  assert.ok(Math.hypot(r.landmark.low.x-a.x,r.landmark.low.y-a.y)<4);
  assert.ok(Math.hypot(r.landmark.high.x-b.x,r.landmark.high.y-b.y)<4);
  assert.ok(r.landmark.high.centerS>r.landmark.low.centerS,'camera looks up the actual driving direction');
  assert.ok(r.landmark.low.centerS>890&&r.landmark.low.centerS<960);
  assert.ok(r.landmark.high.centerS>1130&&r.landmark.high.centerS<1180);
  for(const p of [r.landmark.low,r.landmark.high])close(p.z,Profile.sample(p.centerS).elevation,'centreline chainage height',.02);
  close(r.landmark.target.z,(r.landmark.low.z+r.landmark.high.z)/2,'unexaggerated target height');
  assert.equal(r.getState().elevationExaggeration,1);assert.equal(r.getState().metresPerUnit,1);
});

test('scenic desktop/mobile dragging, cursor zoom and repeated view reset preserve the world anchor',()=>{
  for(const [width,height] of [[980,615],[346,347]]) {
    const r=renderer(races.get('spa'),width,height);r.setView('eau-rouge');
    const base=r._interactionCamera(),anchor={x:width*.57,y:height*.65};
    const ground=r._groundPoint(anchor.x,anchor.y,base);assert.ok(ground);
    r.pan(31,-12,anchor);let p=r._project(ground,r._interactionCamera());
    close(p.x,anchor.x+31,'panned x');close(p.y,anchor.y-12,'panned y');
    const zoomAnchor={x:width*.65,y:height*.60},fixed=r._groundPoint(zoomAnchor.x,zoomAnchor.y,r._interactionCamera());
    r.zoom(1.7,zoomAnchor);p=r._project(fixed,r._interactionCamera());
    close(p.x,zoomAnchor.x,'zoom x');close(p.y,zoomAnchor.y,'zoom y');
    const zoom=r.zoomLevel;r.recenter();assert.deepEqual(r.panOffset,{x:0,y:0,z:0});close(r.zoomLevel,zoom,'centre preserves zoom');
    r.orbit(29,11);r.setView('eau-rouge');
    const reset=r._interactionCamera();for(const key of ['distance','yaw','pitch','f','cx','cy'])close(reset[key],base[key],key);
    assert.deepEqual(reset.target,base.target);assert.equal(r.zoomLevel,1);
  }
});

test('switching from Spa scenic view to another circuit falls back to that race without stale targets',()=>{
  const r=renderer();r.setView('eau-rouge');r.pan(120,30);r.zoom(2.4);
  const mode=r.mode;r.setRace(races.get('everland'));r.setView(mode);
  assert.equal(r.mode,'follow');assert.equal(r.landmark,null);assert.equal(r.zoomLevel,1);
  assert.deepEqual(r.panOffset,{x:0,y:0,z:0});
  const car=r.race.cars[0],pose=Pose.sample(r.race,car.distance),target=r._interactionCamera().target;
  close(target.x,pose.x,'new circuit x');close(target.y,pose.y,'new circuit y');close(target.z,pose.z+.8,'new circuit height');
  r.setRace(races.get('spa'));r.setView('eau-rouge');assert.ok(r.landmark);assert.equal(r.getState().mode,'eau-rouge');
});

test('all real circuits share continuous car, camera and line coordinates without sinking below source path heights',()=>{
  for(const [id,race]of races) {
    const r=renderer(race);r.setView('follow');let vehicles,line;
    r._background=r._paint=r._startLine=r._labels=r._compass=r._caption=()=>{};
    r._queue=()=>{};r._mesh=()=>({length:5,width:1.9,height:1.5,faces:[]});
    r._drawVehicles=entries=>{vehicles=entries;};r._line=points=>{line=points;};
    for(const fraction of [0,.137,.503,.923]) {
      const car=race.cars[0];car.distance=race.track.length*fraction;r.advanceCamera(0,{snap:true});r.render({showLine:true});
      const expected=Pose.sample(race,car.distance),entry=vehicles.find(e=>e.car===car);assert.ok(entry,id+' watched car visible');
      assert.deepEqual(entry.position,expected,id+' render pose');
      for(const key of ['x','y'])close(r._lastCamera.target[key],expected[key],id+' camera '+key);
      close(r._lastCamera.target.z,expected.z+.8,id+' camera height');
      assert.equal(line.length,86);assert.notDeepEqual(line[0],line.at(-1),'close view does not join a whole-lap line over nearby grass');
      for(const index of [0,10,45,85]) {
        const sample=Pose.sample(race,car.distance-20+index*2);
        close(line[index].x,sample.x,id+' local line x');close(line[index].y,sample.y,id+' local line y');
        close(line[index].z,sample.z+.075,id+' line surface clearance');
      }
    }
    // The vehicle render floor has a 55 mm clearance. Verify the display-only
    // spline does not lower the centre of the body through its original path
    // height. This does not assert exact contact with every wide road polygon.
    for(let s=0;s<race.track.length;s+=2) {
      const p=Pose.sample(race,s),road=race.sample(s).elevation;
      assert.ok(p.z+.055>=road-1e-6,id+' centre floor below original road at '+s);
      assert.ok(p.z+.055-road<.10,id+' excessive floor gap at '+s);
    }
  }
});

test('near-plane clipping retains visible fragments and rejects wholly hidden faces at any camera orientation',()=>{
  const r=renderer();
  for(const yaw of [-2,0,1.3])for(const pitch of [.18,.7,1.56]) {
    const camera=r._createCamera({x:343,y:-271,z:401},8,yaw,pitch,550,490,300),queue=[];
    const p=(right,vertical,depth)=>pointAtDepth(camera,right,vertical,depth);
    const face={vertices:[p(-.13,-.1,.1),p(.13,-.1,.6),p(0,.1,.6)],fill:'#fff'};
    r._queue(face,camera,queue);assert.equal(queue.length,1,'partly visible face survives');
    assert.equal(queue[0].points.length,4,'triangle cut by near plane becomes quadrilateral');
    for(const q of queue[0].points)assert.ok(q.depth>=.301-1e-9&&Number.isFinite(q.x)&&Number.isFinite(q.y));
    assert.equal(queue[0].points.filter(q=>Math.abs(q.depth-.301)<1e-8).length,2);
    r._queue({vertices:[p(-.1,-.1,-1),p(.1,-.1,.1),p(0,.1,.2)],fill:'#fff'},camera,queue);
    assert.equal(queue.length,1,'hidden face removed');
    for(const v of face.vertices)assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z),'input untouched');
  }
});

test('Canvas road and WebGL vehicle surfaces use the same near plane and projection convention',()=>{
  const r=renderer(),surface=surfaceFixture();
  for(const distance of [1.5,8,35,230])for(const yaw of [-2,.3])for(const pitch of [.24,1.1]) {
    const camera=r._createCamera({x:389,y:211,z:408},distance,yaw,pitch,554,490,393.6);
    surface.renderer.render([],camera,980,615);
    const [near,far]=surface.uniforms.get('uClip');
    close(near,Math.max(.3,distance*.018),'shared near plane');assert.ok(far>near);
    assert.equal(r._project(pointAtDepth(camera,0,0,near-.001),camera),null,'CPU rejects GPU-clipped depth');
    const sample=pointAtDepth(camera,.11,-.09,near+.02),screen=r._project(sample,camera);
    const [cyaw,cpitch,cd,cf]=surface.uniforms.get('uCamera'),[width,height,cx,cy]=surface.uniforms.get('uViewport');
    const target=surface.uniforms.get('uTarget'),dx=sample.x-target[0],dy=sample.y-target[1],dz=sample.z-target[2];
    const h=-dx*Math.sin(cyaw)+dy*Math.cos(cyaw),depth=cd-h*Math.cos(cpitch)-dz*Math.sin(cpitch);
    const right=dx*Math.cos(cyaw)+dy*Math.sin(cyaw),vertical=h*Math.sin(cpitch)-dz*Math.cos(cpitch);
    const clipX=2*cf/width*right+(2*cx/width-1)*depth;
    const clipY=-2*cf/height*vertical+(1-2*cy/height)*depth;
    const clipZ=(far+near)/(far-near)*depth-2*far*near/(far-near);
    close((clipX/depth+1)*width/2,screen.x,'GPU/CPU screen x');
    close((1-clipY/depth)*height/2,screen.y,'GPU/CPU screen y');
    assert.ok(clipZ>=-depth&&clipZ<=depth,'same point survives GPU clipping');
  }
});

test('scenic altitude annotation stays clear of the bottom camera controls on mobile and desktop',()=>{
  for(const [width,height] of [[980,615],[346,347]]) {
    const r=renderer(races.get('spa'),width,height),texts=[];r.setView('eau-rouge');
    r.ctx.fillText=(text,x,y)=>texts.push({text,x,y});r._caption();
    const label=texts.find(t=>t.text.includes('RAIDILLON'));assert.ok(label);
    assert.ok(label.y<height-70,'landmark caption not covered by bottom controls');
    assert.ok(label.y>48,'landmark caption below top controls');
  }
});

test('distant detailed vehicles stay inside the GPU far plane until they reach the small Canvas LOD',()=>{
  const r=renderer(),surface=surfaceFixture();
  const camera=r._createCamera({x:389,y:211,z:408},9,.73,.24,554,490,393.6);
  const mesh={length:5,width:1.9,height:1.6,manufacturer:{}};
  const entries=[140,220,300].map(depth=>{
    const p=pointAtDepth(camera,0,0,depth),projected=r._project(p,camera);
    assert.ok(mesh.length*projected.scale>=9,'renderer still chooses detailed WebGL mesh');
    return {mesh,position:{...p,elevation:p.z,angle:.2,grade:.1}};
  });
  surface.renderer.render(entries,camera,980,615);
  const [near,far]=surface.uniforms.get('uClip');close(near,.3,'near depth');
  assert.ok(far>=300+Math.hypot(mesh.length,mesh.width,mesh.height),'farthest whole body is visible');
  assert.ok(far<330,'nearby vehicle layer keeps a tight, adequate depth range');
});

test('ghost bodies are composited once at 32 percent, with the selected body opaque and coincident duplicates removed',()=>{
  const r=renderer(),batches=[],composites=[],ghostContext={setTransform(){},clearRect(){}};
  r.canvas.ownerDocument={createElement:()=>({getContext:()=>ghostContext})};
  r.ctx.globalAlpha=1;r.ctx.save=()=>{};r.ctx.restore=()=>{r.ctx.globalAlpha=1;};r.ctx.drawImage=()=>composites.push(r.ctx.globalAlpha);
  const main=r.ctx;r._drawVehicleBatch=function(entries){batches.push({ids:entries.map(e=>e.car.id),ghost:this.ctx===ghostContext,alpha:this.ctx.globalAlpha});};
  const entry=(id,x,selected)=>({car:{id},position:{x,y:0,angle:0},selected});
  r._drawVehicles([entry(0,0,true),entry(1,0,false),entry(2,8,false)],{});
  assert.deepEqual(composites,[.32]);assert.deepEqual(batches.map(b=>b.ids),[[2],[0]]);assert(batches[0].ghost);assert(!batches[1].ghost);assert.equal(batches[1].alpha,1);assert.equal(r.ctx,main);
  batches.length=0;composites.length=0;r._drawVehicles([entry(0,0,false),entry(1,8,true)],{});
  assert.deepEqual(batches.map(b=>b.ids),[[0],[1]]);assert.deepEqual(composites,[.32]);
});
