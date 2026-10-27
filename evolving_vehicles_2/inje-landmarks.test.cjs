'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Race=require('./race-engine.js'),Road=require('./circuit-road.js'),Pits=require('./pit-facilities.js'),circuits=require('./circuits.js');
const data=JSON.parse(fs.readFileSync(__dirname+'/data/pits/inje.json','utf8'));
const raw=Race.buildTrack(circuits.find(c=>c.id==='inje')),datum=raw.elevationMin;
const source={...raw,points:raw.points.map(p=>({...p,z:datum+(p.z-datum)*1.75}))},road=Road.build(source),track={...source,points:road.points};
const near=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p[0]-a.x)*dx+(p[1]-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a.x-t*dx,p[1]-a.y-t*dy);};
const roadDistance=p=>Math.min(...track.points.map((a,i)=>near(p,a,track.points[(i+1)%track.points.length])));
function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}

test('Inje structures are authored away from every road leg and preserve the racing surface',()=>{
  const before=JSON.stringify({track,data}),model=Pits.build(track,data);
  assert.equal(model.stats.rejected,0);assert.equal(model.stats.grandstands,2);assert.equal(model.stats.gantries,1);assert.equal(model.stats.rooftopEquipment,3);
  assert(model.faces.length<9000,'bounded facility geometry for mobile');
  assert(model.focus.bounds.maxX<0,'pit camera stays at the photographed pit compound');
  for(const feature of data.features.filter(f=>f.properties.kind==='pit-building'||f.properties.kind==='grandstand')){
    const ring=feature.geometry.coordinates[0];
    for(const p of track.points)assert(!inside(p,ring),feature.id+' cannot enclose the road');
    for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4));
      for(let k=0;k<=n;k++){const p=[a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n];assert(roadDistance(p)>track.width/2+1.1,feature.id+' footprint clears asphalt and kerbs');}
    }
  }
  const piers=model.faces.filter(f=>f.kind==='timing-gantry-pier');
  for(const face of piers)for(const p of face.vertices)assert(roadDistance([p.x,p.y])>track.width/2+1.1,'gantry piers clear the full road');
  assert.equal(JSON.stringify({track,data}),before);
});

test('offline Inje bundles preserve source evidence and mapped two-tier and lodging geometry',()=>{
  const bundled=require('./pit-facility-data.js').inje,environment=JSON.parse(fs.readFileSync(__dirname+'/data/environment/korea/inje-features.json','utf8'));
  assert.deepEqual(bundled,data);assert.deepEqual(require('./track-environment-data.js').inje,environment);
  const lower=data.features.find(f=>f.id==='inje-lower-grandstand'),upper=data.features.find(f=>f.id==='inje-covered-grandstand');
  assert.equal(lower.properties.canopy,false);assert(upper.properties.seatingBaseHeight>lower.properties.seatingHeight);
  assert(data.features.some(f=>f.id.startsWith('inje-hotel-')));assert(data.features.some(f=>f.id.startsWith('inje-condo-')));
  assert.equal(data.metadata.focusFeatureId,'inje-garages');
  assert(data.metadata.limitations.some(s=>s.includes('±40')),'estimated gantry position is disclosed');
  assert(environment.features.filter(f=>f.properties.kind==='catch-fence').length>=2);
  for(const f of data.features){assert(data.sources.some(s=>s.id===f.properties.sourceId));assert(f.properties.evidence);}
});

test('the photographed east-side paddock stays paved while the displayed woodland is west of the grandstand',()=>{
  const envData=require('./track-environment-data.js').inje,Environment=require('./track-environment.js');
  const paddock=envData.features.find(f=>f.id==='inje-paved-paddock'),median=envData.features.find(f=>f.id==='inje-paddock-grass-median'),wood=envData.features.find(f=>f.id==='inje-central-wooded-hill');
  assert.equal(paddock.properties.kind,'asphalt');assert.equal(paddock.geometry.coordinates.length,2);
  assert.deepEqual(paddock.geometry.coordinates[1],median.geometry.coordinates[0]);
  assert(wood.geometry.coordinates[0].every(p=>p[0]<-300),'the previous forest inside the paddock cannot return');
  const pits=Pits.build(track,data),env=Environment.build(track,'inje',envData,{excludeTree:(x,y,r)=>pits.contains(x,y,r)});
  assert(env.faces.some(f=>f.featureId===paddock.id&&f.kind==='asphalt'));
  assert(env.terrainOverlays.length>0);assert(env.terrainOverlays.every(f=>f.terrainDrape&&[paddock.id,median.id].includes(f.featureId)));
  for(const tree of env.objects)assert(!inside(tree,paddock.geometry.coordinates[0]),'paved paddock and narrow median remain clear of forest/background trees');
  assert.equal(envData.metadata.license,'ODbL-1.0');
});

test('the real Inje paddock paints the existing ground height without intersecting grass sheets',()=>{
  const Terrain=require('./circuit-terrain.js'),Environment=require('./track-environment.js'),envData=require('./track-environment-data.js').inje;
  const pits=Pits.build(track,data),env=Environment.build(track,'inje',envData,{backgroundVegetation:false});
  const b={minX:Math.min(track.bounds.minX,pits.bounds.minX),maxX:Math.max(track.bounds.maxX,pits.bounds.maxX),minY:Math.min(track.bounds.minY,pits.bounds.minY),maxY:Math.max(track.bounds.maxY,pits.bounds.maxY)};
  const terrain=Terrain.build(track,road.edges,{bounds:b,groundHeight:env.groundHeight}),painted=Terrain.paintSurface(terrain.faces,env.terrainOverlays);
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  function height(f,p){const [a,b,c]=f.vertices,d=cross(a,b,c);if(Math.abs(d)<1e-9)return null;const u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;return Math.min(u,v,w)<-1e-7?null:u*a.z+v*b.z+w*c.z;}
  for(const [x,y] of [[-100,300],[-100,400],[-100,500],[-80,500],[-20,400]]){
    const samples=painted.map(f=>({f,z:height(f,{x,y})})).filter(s=>s.z!==null).sort((a,b)=>b.z-a.z),top=samples[0];
    assert(top,'paddock remains covered');assert(Math.abs(top.z-terrain.sampleHeight(x,y))<1e-6,'paint cannot change or float above the ground height');
    assert.equal(top.f.featureId,'inje-paved-paddock','the top surface is paved, with no stray grass triangle');
  }
  assert(painted.length<terrain.faces.length+env.terrainOverlays.length*8,'bounded material subdivision');
});
