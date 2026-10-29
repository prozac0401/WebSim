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
    r._car(frame,mesh,{},spin,false,track);
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
