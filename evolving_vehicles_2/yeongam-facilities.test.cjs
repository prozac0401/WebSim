'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Race=require('./race-engine.js'),Road=require('./circuit-road.js'),Pits=require('./pit-facilities.js'),circuits=require('./circuits.js');
const bundled=require('./pit-facility-data.js');
const data={yeongam:require('./data/pits/yeongam.json'),'yeongam-permanent':require('./data/pits/yeongam-permanent.json')};
const originalIds={yeongam:['kic-gp-pit-lane','kic-gp-garages','kic-gp-control','kic-gp-work-apron','kic-gp-pit-wall','kic-gp-observed-work-box'],
  'yeongam-permanent':['kic-permanent-pit-lane','kic-permanent-garages','kic-permanent-work-apron','kic-permanent-pit-wall']};
const originalHashes={yeongam:'567371424eee65d56f8bd065a05711631805156add144825ca50cb3d20554501','yeongam-permanent':'f49898c5156856e65d7f4bd6db40ce227b3398ad1fdb7d4668c7360c6a768404'};
const cache=new Map(),point=p=>({x:p[0],y:p[1]}),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function scene(id){
  if(cache.has(id))return cache.get(id);
  const circuit=circuits.find(c=>c.id===id),sourceBefore=JSON.stringify(circuit),track=Race.buildTrack(circuit),physicalBefore=JSON.stringify(track),datum=track.elevationMin||0;
  const display={...track,points:track.points.map(p=>({...p,z:datum+((p.z||0)-datum)*1.75}))};
  const road=Road.build(display);display.points=road.points;
  const displayBefore=JSON.stringify(display),dataBefore=JSON.stringify(data[id]),model=Pits.build(display,data[id]);
  const original=Pits.build(display,{...data[id],features:originalIds[id].map(key=>data[id].features.find(f=>f.id===key))});
  const value={track,display,road,model,original,physicalBefore,sourceBefore,displayBefore,dataBefore,circuit};cache.set(id,value);return value;
}
function distance(a,b,p){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function gap(a,b,c,d){
  if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y)))return 0;
  return Math.min(distance(a,b,c),distance(a,b,d),distance(c,d,a),distance(c,d,b));
}
function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
const flatten=coords=>typeof coords[0]==='number'?[coords]:coords.flatMap(flatten);
const world=(p,projection)=>({x:(p[0]/projection.scale+projection.offset.x)/Math.cos(projection.latitudeRad),y:p[1]/projection.scale+projection.offset.y});

test('both facility bundles resolve every cited source and preserve the original GP and permanent coordinates',()=>{
  for(const id of Object.keys(data)){
    const d=data[id];assert.deepEqual(bundled[id],d);assert.equal(d.features.length,id==='yeongam'?21:13);
    const sources=new Set(d.sources.map(s=>s.id));assert.equal(new Set(d.features.map(f=>f.id)).size,d.features.length);
    for(const f of d.features){assert(sources.has(f.properties.sourceId),f.id+' primary source');assert(f.properties.evidence);
      for(const source of f.properties.sourceIds||[])assert(sources.has(source),f.id+' supporting source '+source);
    }
    const preserved=originalIds[id].map(key=>{const f=d.features.find(f=>f.id===key);assert(f,key);return{id:f.id,geometry:f.geometry};});
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(preserved)).digest('hex'),originalHashes[id],id+' original facility geometry is unchanged');
  }
});

test('actual display-track builds contain every stand and the GP-only bridge without changing race/source data or pit focus',t=>{
  for(const id of Object.keys(data)){
    const s=scene(id),m=s.model;
    assert.equal(m.stats.rejected,0);assert.equal(m.stats.features,data[id].features.length);
    assert.equal(m.stats.grandstands,id==='yeongam'?10:9);assert.equal(m.stats.roofedBridges,id==='yeongam'?1:undefined);
    assert(m.faces.length<(id==='yeongam'?12000:6500),'facility detail stays bounded');
    for(const f of data[id].features)assert(m.faces.some(face=>face.featureId===f.id),'actual geometry exists for '+f.id);
    for(const face of m.faces)for(const p of face.vertices)assert(Number.isFinite(p.x+p.y+p.z));
    assert.deepEqual(m.focus,s.original.focus,'each pit camera retains its active garage compound');
    assert.equal(data[id].metadata.focusFeatureId,id==='yeongam'?'kic-gp-garages':'kic-permanent-garages');
    assert.equal(JSON.stringify(s.track),s.physicalBefore);assert.equal(JSON.stringify(s.circuit),s.sourceBefore);
    assert.equal(JSON.stringify(s.display),s.displayBefore);assert.equal(JSON.stringify(data[id]),s.dataBefore);
    t.diagnostic(`${id}: ${m.stats.features} features / ${m.faces.length} faces / rejected 0`);
  }
});

test('all authored stand footprints clear every road leg and reserve their complete footprint from trees',t=>{
  for(const id of Object.keys(data)){
    const {display,model}=scene(id);let minimum=Infinity;
    for(const f of data[id].features.filter(f=>f.properties.kind==='grandstand')){
      const ring=f.geometry.coordinates[0].map(point),center=ring.slice(0,-1).reduce((sum,p)=>({x:sum.x+p.x/(ring.length-1),y:sum.y+p.y/(ring.length-1)}),{x:0,y:0});
      assert(model.contains(center.x,center.y,.1),f.id+' occupied footprint');
      let clearance=Infinity;
      for(let i=0;i<display.points.length;i++){
        const a=display.points[i],b=display.points[(i+1)%display.points.length];assert(!inside(a,ring),'a road cannot run wholly inside '+f.id);
        for(let j=1;j<ring.length;j++)clearance=Math.min(clearance,gap(ring[j-1],ring[j],a,b)-display.width/2);
      }
      assert(clearance>10,f.id+' leaves meaningful asphalt clearance');minimum=Math.min(minimum,clearance);
      const faces=model.faces.filter(face=>face.featureId===f.id);
      assert(faces.some(face=>face.kind==='grandstand-seat-lower')&&faces.some(face=>face.kind==='grandstand-seat-upper'));
      assert.equal(faces.some(face=>face.kind==='grandstand-canopy'),f.properties.canopy!==false,'historical roofless stands do not inherit an invented roof');
    }
    t.diagnostic(`${id}: minimum stand-to-asphalt clearance ${minimum.toFixed(3)} m`);
  }
});

test('shared historical stands and GP-background northern pits retain the same physical location across layout projections',()=>{
  const gp=scene('yeongam'),permanent=scene('yeongam-permanent');
  const pairs=data['yeongam-permanent'].features.map(f=>[f,data.yeongam.features.find(g=>g.id===(f.properties.kind==='grandstand'?f.id:'gp-background-'+f.id))]);
  assert.equal(pairs.filter(([f])=>f.properties.kind==='grandstand').length,9);
  for(const [a,b] of pairs){assert(b,a.id+' appears in the shared world');const A=flatten(a.geometry.coordinates),B=flatten(b.geometry.coordinates);assert.equal(A.length,B.length);
    for(let i=0;i<A.length;i++){const p=world(A[i],permanent.track.projection),q=world(B[i],gp.track.projection);assert(Math.hypot(p.x-q.x,p.y-q.y)<.002,a.id+' layout-origin/scale conversion');}
  }
  assert.notEqual(gp.track.projection.scale,permanent.track.projection.scale,'the test covers distinct projections, not copied XY');
});

test('actual GP bridge has grounded clear piers and an unobstructed overhead opening',()=>{
  const {display,model}=scene('yeongam'),f=data.yeongam.features.find(f=>f.properties.kind==='roofed-bridge'),line=f.geometry.coordinates.map(point);
  const faces=model.faces.filter(face=>face.featureId===f.id),feet=new Map();
  for(const face of faces.filter(face=>face.kind==='roofed-bridge-pier'))for(const p of face.vertices){const key=p.x+','+p.y;feet.set(key,Math.min(feet.get(key)??Infinity,p.z));}
  assert.equal(feet.size,8);
  for(const [key,z] of feet){const[x,y]=key.split(',').map(Number),p={x,y};assert(Math.abs(z-model.groundHeight(x,y))<1e-9);
    for(let i=0;i<display.points.length;i++)assert(distance(display.points[i],display.points[(i+1)%display.points.length],p)>display.width/2+1,'all support corners clear every road leg');
  }
  let highestCrossedRoad=-Infinity;
  for(let i=0;i<display.points.length;i++){const a=display.points[i],b=display.points[(i+1)%display.points.length];
    if(gap(line[0],line[1],a,b)<display.width/2+(f.properties.deckWidth||5)/2)highestCrossedRoad=Math.max(highestCrossedRoad,a.z,b.z);
  }
  assert(Number.isFinite(highestCrossedRoad));
  for(const face of faces.filter(face=>face.kind!=='roofed-bridge-pier'))for(const p of face.vertices)assert(p.z>=highestCrossedRoad+7,'even the arched web leaves seven metres of clear road');
  const mid={x:(line[0].x+line[1].x)/2,y:(line[0].y+line[1].y)/2};assert(!model.contains(mid.x,mid.y,1),'the deck is not a ground-level occupied wall');
});

test('all authored Yeongam stands extend foundations two metres while preserving the front-edge datum',t=>{
  let maximumAbove=0,maximumBelow=0,checked=0;
  for(const id of Object.keys(data)){
    const {model}=scene(id);
    const depths=new Map(data[id].features.filter(f=>f.properties.kind==='grandstand').map(f=>[f.id,f.properties.foundationDepth]));
    for(const depth of depths.values())assert.equal(depth,2);
    for(const face of model.faces.filter(f=>['grandstand-riser','grandstand-slab','grandstand-concourse'].includes(f.kind)))for(const p of face.vertices){
      // Only an actual vertical foundation edge, not an interior row's top.
      if(!face.vertices.some(q=>q!==p&&Math.hypot(q.x-p.x,q.y-p.y)<1e-6&&q.z>p.z+.01))continue;
      const error=p.z+depths.get(face.featureId)-model.groundHeight(p.x,p.y);maximumAbove=Math.max(maximumAbove,error);maximumBelow=Math.min(maximumBelow,error);checked++;
    }
  }
  assert(checked>3000);
  // Existing stand cross-sections follow the front-ground datum rather than a
  // surveyed footing. Undo only the requested foundation extension to protect
  // the unchanged datum; its original extrema are +.279/-.164m.
  assert(maximumAbove<.35&&maximumBelow>-.35);
  t.diagnostic(`${checked} foundation edge samples; above ${maximumAbove.toFixed(3)} m / below ${maximumBelow.toFixed(3)} m`);
});
