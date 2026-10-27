'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Environment=require('./track-environment.js');
const track={id:'reed-fixture',width:12,points:[{x:0,y:-200,z:70},{x:0,y:200,z:70},{x:-100,y:200,z:70},{x:-100,y:-200,z:70}],bounds:{minX:-100,maxX:0,minY:-200,maxY:200}};
const rectangle=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const polygon=(id,ring,props={})=>({id,properties:{kind:'tall-grass',sourceId:'synthetic-observation',evidence:'Synthetic geometry test, not venue evidence.',growthForm:'reed-like',height:2.2,clumpRadius:1.2,clumpSpacing:3,maxClumps:40,...props},geometry:{type:'Polygon',coordinates:[ring]}});
const wall=(coordinates,properties={})=>({id:'wall',properties:{kind:'safety-wall',sourceId:'synthetic-observation',...properties},geometry:{type:'LineString',coordinates}});
const collection=features=>({coordinateSystem:'local-metres',features});
const build=(features,options={},course=track)=>Environment.build(course,'reed-fixture',collection(features),{backgroundVegetation:false,...options});
const ground=(x,y)=>70+.013*x+.03*y+.05*Math.sin(y/8);
const finite=env=>{for(const f of env.faces)for(const p of f.vertices)assert([p.x,p.y,p.z].every(Number.isFinite));};
const inside=(p,ring)=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};

test('cited reed-like clumps are deterministic bounded 3D stalks with actual ground contact',()=>{
 const feature=polygon('reed-field',rectangle(12,-160,55,320)),before=JSON.stringify({feature,track});
 const a=build([feature],{groundHeight:ground}),b=build([feature],{groundHeight:ground});
 assert.deepEqual(a.faces,b.faces);assert.deepEqual(a.objects,b.objects);assert.equal(JSON.stringify({feature,track}),before);finite(a);
 assert.equal(a.stats.tallGrassClumps,40);assert.equal(a.faces.length,40*39);assert.equal(a.stats.trees,0);
 assert.deepEqual(new Set(a.faces.map(f=>f.vegetationPart)),new Set(['stem','plume','leaf']));
 assert(a.faces.every(f=>f.kind==='tall-grass'&&f.growthForm==='reed-like'&&!f.texture&&!f.photoProjection));
 assert.equal(a.faces.filter(f=>f.kind.includes('shadow')).length,0);
 for(let i=0;i<a.objects.length;i++){
  const o=a.objects[i],faces=a.faces.slice(i*39,(i+1)*39);assert.equal(o.species,undefined);assert.equal(o.growthFormEstimated,true);assert.equal(o.z,ground(o.x,o.y));
  for(const f of faces)for(const p of f.vertices){assert(Math.hypot(p.x-o.x,p.y-o.y)<o.radius);assert(inside(p,feature.geometry.coordinates[0]));}
  const stems=faces.filter(f=>f.vegetationPart==='stem');assert.equal(stems.length,9);
  for(const f of stems)for(const p of f.vertices.slice(0,2))assert(Math.abs(p.z-ground(p.x,p.y))<1e-10,'each stem bottom contacts the actual terrain, without a height multiplier');
  assert.equal(faces.filter(f=>f.vegetationPart==='plume').length,24);assert.equal(faces.filter(f=>f.vegetationPart==='leaf').length,6);
 }
 assert.equal(a.groups.reduce((sum,g)=>sum+g.faces.length,0),a.faces.length);assert(a.query(30,0,100).length);assert.equal(a.query(10000,10000,10).length,0);
 const recolored=structuredClone(feature);recolored.properties.plumeColor='#998855';assert.deepEqual(build([recolored],{groundHeight:ground}).objects,a.objects,'material changes do not re-randomize positions');
});

test('reed envelopes exclude holes, paved areas, source forests, every road leg and pit reservations',()=>{
 const field=polygon('field',rectangle(-120,-180,190,360),{maxClumps:400,maxRoadDistance:30});field.geometry.coordinates.push(rectangle(-65,-20,25,40));
 const forest=polygon('woodland',rectangle(20,-80,35,40),{kind:'forest',trees:false,baseMaterial:true});
 const paved=polygon('apron',rectangle(20,50,45,40),{kind:'asphalt',terrainPaintOnly:true,drapeOnTerrain:true});
 const excludeTree=(x,y,r)=>Math.hypot(x+50,y-75)<20+r;
 const env=build([field,forest,paved],{groundHeight:ground,excludeTree}),objects=env.objects.filter(o=>o.kind==='tall-grass');assert(objects.length>100);
 assert(objects.some(o=>o.x>0)&&objects.some(o=>o.x<-100),'both road legs are tested, not just one seed leg');
 for(const o of objects){assert(env.roadDistance(o.x,o.y)<=30);assert(!excludeTree(o.x,o.y,o.radius+.1));}
 for(const f of env.faces.filter(f=>f.kind==='tall-grass'))for(const p of f.vertices){
  assert(inside(p,field.geometry.coordinates[0]));assert(!inside(p,field.geometry.coordinates[1]));assert(!inside(p,forest.geometry.coordinates[0]));assert(!inside(p,paved.geometry.coordinates[0]));
  assert(env.roadDistance(p.x,p.y)>=env.clearanceM+.09,'the whole radial clump stays outside all road corridors');
 }
});

test('reed caps sample the whole field, bound candidate work and reject unsubstantiated geometry',()=>{
 const field=polygon('whole-field',rectangle(10,-190,55,380),{maxClumps:50});const a=build([field]);
 for(const [lo,hi] of [[-190,-95],[-95,0],[0,95],[95,190]])assert(a.objects.filter(o=>o.y>=lo&&o.y<hi).length>=5,'capped field fills every longitudinal quarter');
 const huge=polygon('huge',rectangle(-2000,-2000,4000,4000),{clumpSpacing:2,maxClumps:400});const sparse=build([huge]);assert(sparse.stats.tallGrassCandidates<=12000);
 const long={...track,points:track.points.map(p=>({...p,y:p.y*10})),bounds:{...track.bounds,minY:-2000,maxY:2000}};
 const repeated=build(Array.from({length:3},(_,i)=>polygon('large-'+i,rectangle(10,-1900,55,3800),{clumpSpacing:2,maxClumps:1000})),{},long);
 assert.equal(repeated.stats.tallGrassClumps,800);assert.equal(repeated.faces.length,800*39);assert(repeated.stats.tallGrassCandidates<=24000);
 for(const change of [{sourceId:null},{evidence:''},{growthForm:'unknown'}]){const f=structuredClone(field);Object.assign(f.properties,change);const rejected=build([f]);assert.equal(rejected.faces.length,0);assert.equal(rejected.stats.rejected,1);}
 assert.equal(build([polygon('disabled',rectangle(10,-100,55,200),{maxClumps:0})]).faces.length,0);
});

test('opting in reeds preserves existing source tree placement and geometry',()=>{
 const forest=polygon('preserved-woodland',rectangle(20,-150,45,300),{kind:'forest',baseMaterial:true,treeSpacing:20});
 const before=build([forest]),after=build([polygon('overlapping-reeds',rectangle(12,-160,55,320)),forest]);
 assert.deepEqual(after.faces.filter(f=>f.featureId===forest.id),before.faces);assert.deepEqual(after.objects.filter(o=>o.kind==='tree'),before.objects);
 assert(before.stats.sourceTrees>0);assert.equal(after.stats.sourceTrees,before.stats.sourceTrees);
 assert(!Object.hasOwn(before.stats,'tallGrassClumps'),'other courses retain their old statistics shape');
});

test('PVC barriers retain a closed white body with three shallow ribs and a bounded arc-length budget',()=>{
 const f=wall([[20,-160],[20,160]],{material:'pvc-corrugated'}),before=JSON.stringify(f),env=build([f],{groundHeight:ground});finite(env);
 assert.equal(env.faces.length,64*29);assert.equal(JSON.stringify(f),before);assert(env.faces.every(f=>f.barrierMaterial==='pvc-corrugated'&&f.geometryApproximation==='closed-pvc-corrugated-envelope'));
 assert.deepEqual(new Set(env.faces.filter(f=>f.barrierPart==='corrugation').map(f=>f.corrugationLevel)),new Set([.22,.52,.82]));
 for(let i=0;i<64;i++){
  const faces=env.faces.filter(f=>f.sectionIndex===i),body=faces.filter(f=>!f.barrierPart);assert.equal(body.length,5);assert.equal(faces.length,29);
  for(const f of body.slice(0,4))for(const p of f.vertices.slice(0,2))assert(Math.abs(p.z-ground(p.x,p.y))<1e-9);
  assert.equal(body[0].fill,'#e3e3db');assert.equal(faces.filter(f=>f.barrierPart==='corrugation').length,24);
  for(const f of faces)for(const p of f.vertices)assert(Math.abs(p.x-20)<=.225+.035+1e-9);
 }
 const dense=build([wall(Array.from({length:321},(_,i)=>[20,i-160]),{material:'pvc-corrugated'})],{groundHeight:ground});assert.deepEqual(dense.faces,env.faces);
 assert.deepEqual(build([wall(f.geometry.coordinates,{material:'pvc-corrugated',hazardStripes:true})]).faces,build([f]).faces,'hazard painting is not applied to observed white PVC');
});

test('PVC folds and hazard walls include their full width in all-road clearance',()=>{
 const unsafeX=7.13+.225+.01+.02;
 const concrete=build([wall([[unsafeX,-50],[unsafeX,50]])]);assert(concrete.faces.length,'a plain wall is clear at this location');
 assert.equal(build([wall([[unsafeX,-50],[unsafeX,50]],{material:'pvc-corrugated'})]).faces.length,0,'the extra 35 mm rib is included in rejection');
 for(const props of [{material:'pvc-corrugated'},{hazardStripes:true,color:'#828282'}]){
  const env=build([wall([[-140,0],[40,0]],props)]);assert(env.faces.length);
  for(const f of env.faces)for(const p of f.vertices)assert(env.roadDistance(p.x,p.y)>=env.clearanceM-1e-9);
 }
});

test('hazard stripes partition each sloped side without overlap, lifting, gaps or altered top and ends',()=>{
 const line=[[20,-30],[20,33]],props={material:'concrete',color:'#828282',height:1.1},plain=build([wall(line,props)],{groundHeight:ground});
 const striped=build([wall(line,{...props,hazardStripes:true})],{groundHeight:ground});finite(striped);
 const unpainted=striped.faces.filter(f=>f.barrierPart!=='hazard-stripe');assert.equal(unpainted.length,13*3);
 assert.deepEqual(unpainted,plain.faces.filter((_,i)=>i%5!==0&&i%5!==2),'endcaps and top retain their exact original material and geometry');
 const stripes=striped.faces.filter(f=>f.barrierPart==='hazard-stripe');assert.deepEqual(new Set(stripes.map(f=>f.fill)),new Set(['#d8b337','#2d3030']));
 for(let section=0;section<13;section++)for(const x of [19.775,20.225]){
  const faces=stripes.filter(f=>f.sectionIndex===section&&f.vertices.every(p=>Math.abs(p.x-x)<1e-8));
  const length=section===12?3:5,start=-30+section*5,a=ground(x,start),b=ground(x,start+length);
  const normalized=f=>f.vertices.map(p=>({u:(p.y-start)/length,v:(p.z-a-(b-a)*(p.y-start)/length)/1.1}));
  const polys=faces.map(normalized);let area=0;
  for(const poly of polys){const size=Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p.u*q.v-p.v*q.u;},0))/2;assert(size>1e-9);area+=size;for(const p of poly)assert(p.u>=-1e-8&&p.u<=1+1e-8&&p.v>=-1e-8&&p.v<=1+1e-8);}
  assert(Math.abs(area-1)<1e-9,'the partition covers exactly the original side plane once');
  for(const u of [.123,.333,.679,.891])for(const v of [.137,.421,.777])assert.equal(polys.filter(poly=>inside({x:u,y:v},poly.map(p=>[p.u,p.v]))).length,1,'interior samples belong to exactly one stripe');
 }
 const dense=build([wall(Array.from({length:64},(_,i)=>[20,i-30]),{...props,hazardStripes:true})],{groundHeight:ground});assert.deepEqual(dense.faces,striped.faces,'stripe phase follows physical chainage rather than input nodes');
 assert.deepEqual(build([wall(line,{...props,hazardStripes:false})],{groundHeight:ground}).faces,plain.faces);
});
