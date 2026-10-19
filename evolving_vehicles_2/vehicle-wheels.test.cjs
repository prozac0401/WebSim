'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),path=require('node:path'),{createHash}=require('node:crypto');
const Wheels=require('./vehicle-wheels.js'),Renderer=require('./circuit-renderer.js');
function dataFor(id,packed=false){let data;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/models',id+'-runtime.js'),'utf8'),{ManufacturerModels:{registerCompressed:s=>data=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')))}});if(packed)return data;
 const unpack=p=>{const b=Buffer.from(p.vertices,'base64'),i=Buffer.from(p.indices,'base64'),I=p.indexType===2?Uint16Array:Uint32Array;return {...p,vertices:new Float32Array(b.buffer,b.byteOffset,b.length/4),indices:new I(i.buffer,i.byteOffset,i.length/I.BYTES_PER_ELEMENT)};};
 data.primitives=data.primitives.map(unpack);if(data.fallbackPrimitives)data.fallbackPrimitives=data.fallbackPrimitives.map(unpack);return data;
}
const bytes=p=>Buffer.from(p.vertices.buffer,p.vertices.byteOffset,p.vertices.byteLength),digest=parts=>{const hash=createHash('sha256');for(const p of parts){hash.update(bytes(p));hash.update(Buffer.from(p.indices.buffer,p.indices.byteOffset,p.indices.byteLength));}return hash.digest('hex');};
test('distance-driven wheel phase uses the actual front/rear tyre and has no render-time clock',()=>{
 const front={center:[1,.8,.3],radius:.3,axle:'front',side:1},rear={...front,axle:'rear',side:-1},mesh={modelScale:[1.5,1.5,.9]},car={distance:1,speed:20,spec:{frontTireRadiusMm:327,rearTireRadiusMm:281.3}};
 assert.equal(Wheels.angle(mesh,front,car),1/.327);assert.equal(Wheels.angle(mesh,rear,car),1/.2813);
 const phase=Wheels.angle(mesh,front,car);car.speed=0;for(let i=0;i<100;i++)assert.equal(Wheels.angle(mesh,front,car),phase);
 car.distance=0;assert.equal(Wheels.angle(mesh,front,car),0);car.distance=-.2;assert.ok(Wheels.angle(mesh,front,car)<0);
 assert.equal(Wheels.angle(mesh,null,car),0);assert.equal(Wheels.angle(mesh,front,{speed:10}),0);
 const top=Wheels.rotate({x:1,y:.8,z:.6},front,Math.PI/2);assert.ok(Math.abs(top.x-1.3)<1e-12&&Math.abs(top.z-.3)<1e-12,'top of the tyre moves forward for positive distance');
});
test('Canvas wheel rotation equals source rotation before nonuniform model scaling',()=>{
 const mesh={modelScale:[2,2,3],modelOffset:[-.1,.2,-.3]},wheel={center:[1,.8,.4],radius:.3,axle:'front',side:1},v={x:1.1,y:.85,z:.65},phase=.73;
 const scale=p=>({x:(p.x-.1)*2,y:(p.y+.2)*2,z:(p.z-.3)*3}),expected=scale(Wheels.rotate(v,wheel,phase)),actual=Wheels.rotate(scale(v),Wheels.localWheel(mesh,wheel),phase,mesh.modelScale);
 for(const key of ['x','y','z'])assert.ok(Math.abs(actual[key]-expected[key])<1e-12);
});
test('all released assets expose four bounded wheel groups and preserve static body geometry',()=>{
 const ids=fs.readdirSync(path.join(__dirname,'assets/models')).filter(f=>f.endsWith('-runtime.js')).map(f=>f.replace('-runtime.js',''));
 assert.equal(ids.length,18);
 for(const id of ids){const source=dataFor(id),before=digest(source.primitives),result=Wheels.prepare(source),parts=result.primitives,tagged=parts.filter(p=>p.wheel),groups=new Set(tagged.map(p=>p.wheel.axle+':'+p.wheel.side));
  assert.equal(groups.size,4,id+' must have all four wheels');assert.equal(Wheels.prepare(source),result);assert.equal(Wheels.prepare(result),result);
  assert.equal(parts.reduce((n,p)=>n+p.indices.length,0),source.primitives.reduce((n,p)=>n+p.indices.length,0),id+' triangle count preserved');assert.equal(digest(source.primitives),before,id+' source buffers remain immutable');
  for(const p of source.primitives)if(!p.wheel&&(p.paint||/caliper|^58110/i.test(p.name||'')||p.material===1))assert.ok(parts.includes(p),id+' static body/glass/caliper retained: '+p.name);
  for(const p of tagged){const w=p.wheel;assert.ok(w.center.every(Number.isFinite)&&w.radius>0);assert.ok(!/caliper/i.test(p.name||''));
   for(const index of p.indices){const k=index*8;assert.ok(Math.hypot(p.vertices[k]-w.center[0],p.vertices[k+2]-w.center[2])<=w.radius+.012,id+' wheel cannot include its fender');assert.ok(w.side*p.vertices[k+1]>0,id+' opposite wheels must not share a rotating part');}
  }
 }
});
test('Canvas uses the same wheel phase without changing a static adjacent body face',()=>{
 const wheel={center:[1,.8,.3],radius:.3,axle:'front',side:1},rim={vertices:[{x:1,y:.8,z:.6},{x:1.1,y:.8,z:.4},{x:1,y:.8,z:.3}],fill:'#999999',material:'trim',wheel},body={vertices:[{x:0,y:0,z:1},{x:.2,y:0,z:1},{x:0,y:.2,z:1}],fill:'#666666',material:'trim'},mesh={length:4,width:2,faces:[rim,body]},car={distance:.3*Math.PI/2,spec:{frontTireRadiusMm:300}},renderer=Object.create(Renderer.prototype),queue=[];
 renderer._mesh=()=>mesh;renderer._project=()=>({scale:100});renderer._queue=(face,_camera,q)=>q.push(face);
 renderer._carFaces(car,{x:0,y:0,elevation:0,angle:0,grade:0},{},queue);
 assert.ok(Math.abs(queue[1].vertices[0].x-1.3)<1e-12);assert.ok(Math.abs(queue[1].vertices[0].z-.35)<1e-12);
 assert.equal(queue[2].vertices[0].x,0);assert.equal(queue[2].vertices[0].z,1.05);assert.equal(rim.vertices[0].z,.6);
});
test('Santa Fe 21-inch specification selects the separate original ICE wheels with stable source identity',()=>{
 const context=vm.createContext({VehicleWheels:Wheels,atob:s=>Buffer.from(s,'base64').toString('binary')});vm.runInContext(fs.readFileSync(path.join(__dirname,'manufacturer-models.js'),'utf8'),context);
 context.ManufacturerModels.register(dataFor('santafe',true));const source=context.ManufacturerModels.get('santafe'),spec={lengthMm:4830,widthMm:1900,heightMm:1720,frontTire:'245/45R21',frontTireRadiusMm:376.95},mesh=context.ManufacturerModels.create('santafe',spec,'#aabbcc');
 assert.equal(mesh.metadata.wheelVariant,'santafe-21');assert.equal(mesh.sourceAsset,source);assert.notEqual(mesh.manufacturer,source);
 assert.equal(context.ManufacturerModels.create('santafe',{...spec},'#ddeeff').manufacturer,mesh.manufacturer,'variant geometry is cached independently of paint');
 assert.equal(mesh.manufacturer.primitives.some(p=>p.name==='WHEELS_Base2'),false);
 assert.equal(new Set(mesh.manufacturer.primitives.filter(p=>p.wheel).map(p=>p.wheel.axle+':'+p.wheel.side)).size,4);
 for(const p of source.primitives.filter(p=>p.name!=='WHEELS_Base2'))assert.ok(mesh.manufacturer.primitives.includes(p),'body and brake assemblies retain source identity');
 const base=context.ManufacturerModels.create('santafe',{...spec,frontTire:'235/60R18'},'#aabbcc');assert.equal(base.manufacturer,source);assert.equal(base.metadata.wheelVariant,undefined);
 const Evolution=require('./tuning-evolution.js');
 for(const drive of ['fwd','awd']){
  const ice=Evolution.createEntrant({vehicleId:'santafe',variantId:'santafe-2.5t-'+drive,budget:0}),hev=Evolution.createEntrant({vehicleId:'santafe',variantId:'santafe-1.6hev-'+drive,budget:0});
  const iceMesh=context.ManufacturerModels.create('santafe',ice.spec,'#aabbcc'),hevMesh=context.ManufacturerModels.create('santafe',hev.spec,'#aabbcc');
  assert.equal(iceMesh.metadata.wheelVariant,'santafe-21');assert.equal(hevMesh.metadata.wheelVariant,undefined);
  assert.equal(hevMesh.manufacturer,source,'HEV uses original hybrid wheel design, not ICE 21-inch substitute');
  assert.equal(hev.spec.frontTireRadiusMm,369.6);assert.equal(ice.spec.frontTireRadiusMm,376.95);
  const wheel=hevMesh.manufacturer.primitives.find(p=>p.wheel).wheel;
  assert.ok(Math.abs(Wheels.angle(hevMesh,wheel,{distance:1,spec:hev.spec})-1/.3696)<1e-12,'rotation follows 18-inch tyre data even with a shared visual mesh');
 }
});
test('Morning side-window frames use body paint without recoloring glass, mirrors or low door interiors',()=>{
 const data=dataFor('morning'),frames=data.primitives.filter(p=>p.windowFrame);
 assert.equal(frames.length,4);assert.equal(frames.reduce((n,p)=>n+p.indices.length/3,0),2674);assert.equal(data.primitives.reduce((n,p)=>n+p.indices.length/3,0),262394);
 for(const p of frames){assert.equal(p.paint,true);assert.equal(p.material,0);assert.equal(p.textureIndex,undefined);for(const i of p.indices){const k=i*8;assert.ok(p.vertices[k+2]>.89);assert.ok(Math.abs(p.vertices[k+1])>.5&&Math.abs(p.vertices[k+1])<.8);}}
 assert.ok(data.primitives.filter(p=>/Glass|Mirror/i.test(p.materialName||'')).every(p=>!p.paint));
 for(const name of ['Mesh221_2','Mesh222_2','Mesh223_2','Mesh224_2'])assert.equal(data.primitives.find(p=>p.name===name).paint,false);
});
test('Porter photographed wheel sidewalls and spokes rotate with the separate tyre tread',()=>{
 const data=Wheels.prepare(dataFor('porter2')),photographic=data.primitives.filter(p=>p.name==='wheels-photo-side');
 assert.equal(new Set(photographic.filter(p=>p.wheel).map(p=>p.wheel.axle+':'+p.wheel.side)).size,4);
 assert.ok(photographic.every(p=>p.wheel&&p.textureIndex===1),'rim photograph must remain on the rotating original triangles');
 assert.ok(data.primitives.filter(p=>p.name==='official-photo-side').every(p=>!p.wheel),'side glass and cargo panels stay fixed');
});
