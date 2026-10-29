'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const Catalog=require('./catalog.js'),Physics=require('./physics.js'),Wheels=require('../evolving_vehicles_2/vehicle-wheels.js');
globalThis.VehicleWheels=Wheels;require('../evolving_vehicles_2/kgm-refined.js');require('../evolving_vehicles_2/hyundai-refined.js');globalThis.VehicleMeshes=require('../evolving_vehicles_2/vehicle-meshes.js');require('../evolving_vehicles_2/manufacturer-models.js');
const Renderer=require('./renderer.js'),Models=globalThis.ManufacturerModels;
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-9,`${label}: ${a} != ${b}`);
const basis=(m,p)=>({x:m[0]*p.x+m[3]*p.y+m[6]*p.z,y:m[1]*p.x+m[4]*p.y+m[7]*p.z,z:m[2]*p.x+m[5]*p.y+m[8]*p.z});
const world=(entry,p)=>{const v=basis(entry.basis,p);return{x:entry.position.x+v.x,y:entry.position.y+v.y,z:entry.position.z+v.z};};
function load(id){
  if(Models.has(id))return;
  let packed;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../evolving_vehicles_2/assets/models',id+'-runtime.js'),'utf8'),{ManufacturerModels:{registerCompressed:data=>{packed=JSON.parse(zlib.gunzipSync(Buffer.from(data,'base64')));}}});
  Models.register(packed);
}
function renderer(){const r=Object.create(Renderer.prototype);r.meshes=new Map();r.loading=new Set();return r;}
function surface(gx,gy){return{length:500,sample:s=>({s,x:s,y:0,z:gx*s,heading:0,grade:gx,bank:Math.atan(gy)}),surface:(x,y)=>({z:gx*x+gy*y,gradientX:gx,gradientY:gy})};}
function wheelIndex(w){return(w.axle==='front'?0:2)+(w.side>0?0:1);}

test('all 16 released variants align actual asset wheel groups to immutable physical contact centres',()=>{
  const cars=Catalog.list(),ids=new Set();assert.equal(cars.length,16);
  for(const vehicle of cars){
    load(vehicle.vehicleId);ids.add(vehicle.vehicleId);
    const r=renderer(),before=JSON.stringify(vehicle),source=Models.get(vehicle.vehicleId),mesh=r._vehicle(vehicle,{}),p=vehicle.physics;
    const front=p.wheelbaseM*(1-(p.frontWeightFraction||.52)),rear=p.wheelbaseM*(p.frontWeightFraction||.52),half=(p.trackWidthM||p.widthM*.84)/2;
    assert.equal(mesh.manufacturerParts.length,5);assert.ok(mesh.manufacturerParts.every(Boolean),vehicle.id);
    const parts=mesh.manufacturerParts.flatMap(p=>p.manufacturer.primitives);
    assert.equal(parts.length,source.primitives.length);assert.ok(parts.every(p=>source.primitives.includes(p)),'original buffers, normals, textures and UVs are reused');
    const bodyPart=mesh.manufacturerParts[0];near((bodyPart.modelOffset[0]-mesh.modelOffset[0])*mesh.modelScale[0],p.bodyCenterOffsetM,'body and collision origin use the same calibration');
    for(const axis of [1,2])near(bodyPart.modelOffset[axis],mesh.modelOffset[axis],'body translation never changes shape');
    near(mesh.wheelAlignment.residualOffsets.reduce((sum,d)=>sum+d.x,0)/4,0,'common axle-origin shift belongs to the whole body');
    assert.ok(mesh.wheelAlignment.residualOffsets.every(d=>Math.abs(d.x)<.02),vehicle.id+' wheel arches retain their original longitudinal relationship within 20mm');
    for(let i=0;i<4;i++){
      near(mesh.wheels[i].x,i<2?front:-rear,vehicle.id+' axle');near(mesh.wheels[i].y,(i%2?-1:1)*half,vehicle.id+' track');
      const part=mesh.manufacturerParts[i+1];
      for(const primitive of part.manufacturer.primitives){const local=Wheels.localWheel(part,primitive.wheel);assert.equal(wheelIndex(local),i);near(local.center[0],mesh.wheels[i].x,'actual GL pivot x');near(local.center[1],mesh.wheels[i].y,'actual GL pivot y');}
      const bottom=Math.min(...part.manufacturer.primitives.map(p=>(p.bounds.min[2]+part.modelOffset[2])*part.modelScale[2]));near(bottom,0,'actual tyre bottom');
    }
    assert.equal(JSON.stringify(vehicle),before,'stock physics/specification cannot be altered by rendering');
    assert.equal(r._vehicle(vehicle,{}),mesh,'the aligned groups are reused on subsequent frames');
  }
  assert.equal(ids.size,7);
});

test('pitched and rolled wheel assemblies keep world contact XY on the physics and skid-mark points',()=>{
  for(const vehicle of Catalog.list()){
    load(vehicle.vehicleId);const r=renderer(),mesh=r._vehicle(vehicle,{}),p=vehicle.physics;
    for(const [gx,gy,yaw,steer] of [[0,0,0,0],[.12,-.08,.72,.35],[-.15,.1,-2.3,-.4]]){
      const track=surface(gx,gy),frame={x:20,y:5,s:20,yaw,steer,brake:.2},spin=[.8,-.2,1.1,.5];
      frame.wheelForces=mesh.wheels.map(w=>({x:w.x,y:w.y}));
      const entries=r._surfaceEntries(frame,mesh,spin,track),front=Physics.frontContacts(vehicle,frame);
      for(let i=0;i<4;i++){
        const entry=entries[i+1],contact=world(entry,{x:mesh.wheels[i].x,y:mesh.wheels[i].y,z:0}),skid=r._worldWheel(frame,mesh,i,track);
        near(contact.x,skid.x,'skid/contact x');near(contact.y,skid.y,'skid/contact y');near(contact.z,track.surface(contact.x,contact.y).z+.012,'rendered road surface contact');
        if(i<2){near(contact.x,front[i].x,vehicle.id+' front contact x');near(contact.y,front[i].y,vehicle.id+' front contact y');}
        assert.equal(entry.car.steer,steer);assert.equal(entry.car.wheelAngles,spin);
      }
      const centre=Physics.bodyCenter(vehicle,frame),bodyCentre=world(entries[0],{x:mesh.bodyOffset,y:0,z:0});
      near(bodyCentre.x,centre.x,'body/collision centre x');near(bodyCentre.y,centre.y,'body/collision centre y');
    }
  }
});

test('variants reuse source draw-group buffer identities while keeping independent wheel placement',()=>{
  const r=renderer(),assets=new Map();
  for(const vehicle of Catalog.list()){
    load(vehicle.vehicleId);const mesh=r._vehicle(vehicle,{}),groups=mesh.manufacturerParts.map(part=>part.manufacturer);
    if(assets.has(vehicle.vehicleId))groups.forEach((group,index)=>assert.equal(group,assets.get(vehicle.vehicleId)[index],'variants share each GPU asset cache key'));
    else assets.set(vehicle.vehicleId,groups);
  }
  const source=Catalog.get(),a=r._vehicle(source,{}),before=a.manufacturerParts.map(part=>part.modelOffset.slice());
  const alternate={...source,spec:{...source.spec,variantId:'render-placement-regression'},physics:{...source.physics,frontWeightFraction:.55}},b=r._vehicle(alternate,{});
  assert.notEqual(a,b);assert.notDeepEqual(a.manufacturerParts[1].modelOffset,b.manufacturerParts[1].modelOffset);
  a.manufacturerParts.forEach((part,index)=>{assert.equal(part.manufacturer,b.manufacturerParts[index].manufacturer);assert.deepEqual(part.modelOffset,before[index],'placing another CG cannot move an existing render model');});
});

test('Canvas uses the same translated assemblies, steering, spin and slope placement as the GL source transform',()=>{
  // Independently authored EV2 fallback silhouettes remain schematic. This
  // checks contact/origin transforms, not identical high-detail wheel arches.
  const ids=[...new Map(Catalog.list().map(v=>[v.vehicleId,v.id])).values()];
  for(const id of ids){
    const vehicle=Catalog.get(id);load(vehicle.vehicleId);const r=renderer(),mesh=r._vehicle(vehicle,{}),original=Models.create(vehicle.vehicleId,vehicle.spec,mesh.paint),track=surface(.13,-.09),frame={x:20,y:5,s:20,yaw:.65,steer:.3},spin=[.9,-.4,.8,.2],drawn=[];
    r.surfaceRenderer=null;r.ctx={save(){},restore(){}};r._track=()=>({geometry:{objects:[]}});r._paint=()=>{};r._polygon=vertices=>drawn.push(vertices);
    r._car(frame,mesh,{},spin,track);
    const sourceMesh={faces:original.faces.filter(f=>f.fill).map(f=>({...f}))};Wheels.prepareFaces(sourceMesh);
    const source=sourceMesh.faces,entries=r._surfaceEntries(frame,mesh,spin,track),seen=new Set();
    for(let i=0;i<mesh.faces.length;i++){
      const face=mesh.faces[i],index=face.wheel;if(index<0||seen.has(index))continue;seen.add(index);
      const local=Wheels.localWheel(original,source[i].wheel),center=local.center,delta=mesh.softwareWheelAlignment.offsets[index],sx=face.wheelScale[0],sz=face.wheelScale[2];
      source[i].vertices.forEach((v,k)=>{
        const x=(v.x-center[0])/sx,y=v.y-center[1],z=(v.z-center[2])/sz,c=Math.cos(spin[index]),s=Math.sin(spin[index]),rx=(x*c+z*s)*sx,rz=(-x*s+z*c)*sz,angle=index<2?frame.steer:0,ct=Math.cos(angle),st=Math.sin(angle);
        const actual=drawn[i+1][k],expected=world(entries[index+1],{x:center[0]+delta.x+rx*ct-y*st,y:center[1]+delta.y+rx*st+y*ct,z:center[2]+delta.z+rz});
        for(const key of ['x','y','z'])near(actual[key],expected[key],id+' Canvas/GL '+key);
      });
    }
    assert.equal(seen.size,4,id+' has all four Canvas wheel assemblies');
    const bodyIndex=mesh.faces.findIndex(face=>face.wheel<0);
    source[bodyIndex].vertices.forEach((v,k)=>{const expected=world(entries[0],{x:v.x+vehicle.physics.bodyCenterOffsetM,y:v.y,z:v.z});for(const key of ['x','y','z'])near(drawn[bodyIndex+1][k][key],expected[key],id+' Canvas body/collision '+key);});
  }
});

test('replay draws only the selected vehicle and its map marker while retaining camera and effects',()=>{
  const r=renderer(),car={x:4,y:2,s:4,time:1},record=[car],track={length:10,judgedStart:2,judgedEnd:8};
  const mesh={sourceInfo:{label:'EV2'},manufacturer:{triangles:0,primitives:[]}},camera={mode:'follow'},spin=[1,2,3,4];
  const drawn=[],markers=[],effects=[],passes=[];
  r.ctx=new Proxy({arc(...args){markers.push(args);}},{get:(ctx,key)=>key in ctx?ctx[key]:()=>{}});
  r.width=800;r.height=600;r.dpr=1;r.effects={marks:0};r.resize=()=>{};r._vehicle=()=>mesh;
  r._camera=(givenTrack,givenCar,mode,fov)=>{assert.equal(givenTrack,track);assert.equal(givenCar,car);assert.equal(mode,'follow');assert.equal(fov,55);return camera;};
  r._history=(frames,frame,time)=>{assert.equal(frames,record);assert.equal(frame,car);assert.equal(time,1);return frames;};
  r._spin=frames=>{assert.equal(frames,record);return spin;};
  r._ground=()=>passes.push('ground');r._obstacles=()=>passes.push('obstacles');
  r._effects=(frames,time,givenMesh,givenCamera,marks,smoke)=>{assert.equal(frames,record);effects.push({marks,smoke});};
  r._car=(...args)=>drawn.push(args);
  r._track=()=>({bounds:{minX:0,maxX:10,minY:0,maxY:10},center:{x:5,y:5},edges:[
    {s:2,x:2,y:0,left:{x:2,y:-1},right:{x:2,y:1}},
    {s:8,x:8,y:0,left:{x:8,y:-1},right:{x:8,y:1}}
  ]});
  const options={track,car,record,time:1,mode:'follow',fov:55,marks:true,smoke:true};
  // Old callers cannot re-enable a second vehicle through obsolete options.
  Object.defineProperties(options,{reference:{get(){throw Error('obsolete reference was read');}},ghost:{get(){throw Error('obsolete ghost was read');}}});
  r.render(options);
  assert.deepEqual(drawn,[[car,mesh,camera,spin,track]]);
  assert.equal(markers.length,1,'the minimap contains only the selected vehicle marker');
  assert.deepEqual(passes,['ground','obstacles']);assert.deepEqual(effects,[{marks:true,smoke:false},{marks:false,smoke:true}]);
  assert.equal(r.camera,camera);assert.equal(r.mode,'follow');assert.equal(r.fov,55);
});

function cameraScene(){
  const r=renderer(),track={...surface(0,0),judgedEnd:420};
  r.ctx=new Proxy({},{get:()=>()=>{}});r.width=800;r.height=600;r.dpr=1;r.effects={marks:0};r.resize=()=>{};
  r._vehicle=()=>({sourceInfo:{label:'EV2'},manufacturer:{triangles:0,primitives:[]}});
  r._track=()=>({center:{x:250,y:0,z:0},fitPoints:[{x:0,y:0,z:0},{x:500,y:0,z:0}]});
  r._history=frames=>frames;r._spin=()=>[0,0,0,0];
  for(const method of ['_ground','_obstacles','_effects','_car','_map'])r[method]=()=>{};
  const frame=(x,time,status='running')=>({x,y:0,s:x,time,status,vx:20,vy:0,yaw:0,z:0});
  return {r,track,frame};
}
const cameraPose=c=>({target:{...c.target},yaw:c.yaw,pitch:c.pitch,distance:c.distance});

test('the first finished render computes its camera before latching and repeated renders cannot settle or drift',()=>{
  const {r,track,frame}=cameraScene(),before=frame(499,9.98),finish=frame(500,10,'finished'),record=[before,finish];
  const draw=(car,time=car.time)=>r.render({track,car,time,record,mode:'follow'});
  draw(before);const approach=cameraPose(r.camera);assert.equal(r.getState().camera.finishLocked,false);
  draw(finish);const latched=cameraPose(r.camera),follow={...r.follow};
  assert.notDeepEqual(latched,approach,'the pre-finish camera is not latched');
  assert.equal(r.getState().camera.finishLocked,true);
  for(const time of [10,10,10.1,11]){draw(finish,time);assert.deepEqual(cameraPose(r.camera),latched);assert.deepEqual(r.follow,follow);}
  const crossing=frame(421,8.4);draw(crossing);
  assert.equal(r.getState().camera.finishLocked,false,'rewinding into the recorded run resumes following');
  assert.equal(r.camera.target.x,crossing.x+3.8);
  const failed=frame(500,10,'offtrack');r.render({track,car:failed,time:10,record:[failed],mode:'follow'});
  assert.equal(r.getState().camera.finishLocked,false,'a failed run is not a completed finish');
});

test('seeking directly to the finish uses that pose and replay, record, track and view changes remain functional',()=>{
  const {r,track,frame}=cameraScene(),start=frame(5,0),finish=frame(500,10,'finished'),record=[start,finish];
  const draw=(car,extra={})=>r.render({track,car,time:car.time,record,mode:'follow',fov:55,...extra});
  draw(start);draw(finish);
  assert.equal(r.camera.target.x,finish.x+3.8,'a large seek calculates from the finish pose');
  const latched=cameraPose(r.camera),f=r.camera.f;
  draw(finish,{fov:75});assert.deepEqual(cameraPose(r.camera),latched);assert.notEqual(r.camera.f,f);
  r.width=1000;r.height=700;draw(finish,{fov:75});assert.deepEqual(cameraPose(r.camera),latched);assert.equal(r.camera.cx,500);
  draw(finish,{mode:'top'});assert.notDeepEqual(cameraPose(r.camera),latched);assert.equal(r.getState().camera.finishLocked,true);
  draw(finish,{mode:'follow'});assert.deepEqual(cameraPose(r.camera),latched);
  draw(start);assert.equal(r.getState().camera.finishLocked,false);assert.equal(r.camera.target.x,start.x+3.8);
  const other={...finish,y:12};draw(other,{record:[start,other]});assert.equal(r.camera.target.y,12,'another record gets its own finished camera');
  draw(finish,{track:{...track}});assert.equal(r.camera.target.y,0,'another track cannot inherit a finished camera');
  r.destroy();assert.equal(r.finishCamera,null);
});

test('visible start and finish follow the physical course while zone paint and the map geometry stay in place',()=>{
  const r=renderer(),track={...surface(0,0),judgedStart:120,judgedEnd:420,zones:[{s:200,side:1,length:12}]},before=JSON.stringify(track);
  const lines=[],labels=[],layout={width:14,bounds:{minX:0,maxX:500,minY:-7,maxY:7},center:{x:250,y:0,z:0},geometry:{ground:[],decals:[],objects:[]},edges:[]};
  r.width=800;r.height=600;r.ctx=new Proxy({fillText:text=>labels.push(text),createLinearGradient:()=>({addColorStop(){}})},{get:(ctx,key)=>key in ctx?ctx[key]:()=>{}});
  r._track=()=>layout;r._paint=()=>{};r._line=(vertices,fill)=>lines.push({vertices,fill});r._project=()=>({x:0,y:0,depth:0});
  r._ground(track,{cy:300,f:400,pitch:.57,distance:25});
  const start=lines.find(line=>line.fill==='#edf0e3'),finish=lines.find(line=>line.fill==='#e6c77e'),zone=lines.find(line=>line.fill==='#e9b744');
  assert.ok(start.vertices.every(p=>p.x===2.5));assert.ok(finish.vertices.every(p=>p.x===500));
  assert.equal(zone.vertices[0].x,200);assert.equal(zone.vertices.at(-1).x,212);
  assert.ok(labels.includes('START')&&labels.includes('FINISH'));
  r._map(track,{x:500,y:0});assert.ok(labels.includes('500 m · ZONE ×2'));assert.equal(JSON.stringify(track),before,'visual labels never mutate prepared course data');
});
