'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const Environment=require('./track-environment.js');
const Renderer=require('./circuit-renderer.js');
const projector=Object.create(Renderer.prototype);
const track={id:'ad-fixture',width:12,points:[{x:0,y:-200,z:70},{x:0,y:200,z:70},{x:-100,y:200,z:70},{x:-100,y:-200,z:70}],bounds:{minX:-100,maxX:0,minY:-200,maxY:200}};
const wall=(coordinates,properties={})=>({id:'wall',properties:{kind:'safety-wall',sourceId:'synthetic',evidence:'Synthetic wall fixture',color:'#456789',material:'concrete',...properties},geometry:{type:'LineString',coordinates}});
const ad=(text='PIRELLI',side=1,extra={})=>({text,color:'#fff4db',side,...extra});
const build=(features,options={})=>Environment.build(track,'ad-fixture',{coordinateSystem:'local-metres',features},{backgroundVegetation:false,...options});
const letters=e=>e.faces.filter(f=>f.kind==='wall-advertisement');
const plain=e=>e.faces.filter(f=>f.kind!=='wall-advertisement');
const digest=e=>createHash('sha256').update(JSON.stringify({faces:e.faces,objects:e.objects,stats:e.stats})).digest('hex');
const normal=f=>{const[a,b,c]=f.vertices,u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};return{x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};};
const center=f=>f.vertices.reduce((s,p)=>({x:s.x+p.x/f.vertices.length,y:s.y+p.y/f.vertices.length,z:s.z+p.z/f.vertices.length}),{x:0,y:0,z:0});

test('unmodified concrete, PVC, tires and striped walls retain the released geometry and statistics hashes',()=>{
 const hashes={concrete:'a5508cb40e9dcd6320f4a56d0a4c8299fcf2d0dfecb55861d1b9d3473f33a05d','pvc-corrugated':'5224783646208da6c793d104de2dfbc867d3948a4a48650ec469a5d63519ee96','tire-stack':'300dc8856df510c86a5b1a0d207ac5669a6116bf51448bbc9f40e5d1784e9084',hazard:'2e4c88ded2daf48a98c9ac31c48e341257bd68e6330f33b86b6dfac3a609c46c'};
 // Independently captured from cd6e800 before adding advertisements.
 for(const[material,expected]of Object.entries(hashes)){
  const props=material==='hazard'?{material:'concrete',hazardStripes:true}:{material},env=build([wall([[20,-30],[20,33]],props)]);
  assert.equal(digest(env),expected);assert.equal(env.stats.advertisements,undefined);
 }
});

test('generic lettering merges horizontal pixel runs without altering its bitmap area or wall body',()=>{
 const f=wall([[20,20],[32,20]],{height:1.2,sectionLength:12,advertisement:ad('E',1)}),before=JSON.stringify({f,track});
 const env=build([f]),base=build([wall(f.geometry.coordinates,{height:1.2,sectionLength:12})]),glyphs=letters(env);
 assert.deepEqual(plain(env),base.faces);assert.equal(JSON.stringify({f,track}),before);assert.equal(glyphs.length,7,'E has one horizontal run per row, instead of18 individual squares');
 const cell=1.2*.65/7,totalArea=glyphs.reduce((sum,f)=>{const[a,b,d]=f.vertices;return sum+Math.hypot(b.x-a.x,b.y-a.y)*(d.z-b.z);},0);
 assert(Math.abs(Math.abs(totalArea)-18*cell*cell)<1e-9);
 assert.equal(env.stats.advertisements.repeats,1);assert.equal(env.stats.advertisements.faces,7);
 assert(glyphs.every(f=>f.wordmarkApproximation&&f.font==='generic-5x7'&&f.sourceId==='synthetic'&&f.advertisementText==='E'&&f.fill==='#fff4db'));
 assert(glyphs.every(f=>!f.texture&&!f.emissive&&!f.image));
 assert.deepEqual(build([f]).faces,env.faces,'creation is deterministic');
});

test('both wall sides retain readable character order, outward normals and a10mm gap at arbitrary headings',()=>{
 for(const angle of[0,.7,Math.PI,-Math.PI/2])for(const side of[-1,1]){
  const t={x:Math.cos(angle),y:Math.sin(angle)},n={x:-t.y,y:t.x},line=[[60,0],[60+t.x*12,t.y*12]];
  const env=build([wall(line,{height:1.2,sectionLength:12,advertisement:ad('A.Z 01',side)})]),glyphs=letters(env);assert(glyphs.length>0);
  const centers=new Map();for(const f of glyphs){const c=center(f),list=centers.get(f.characterIndex)||[];list.push(c);centers.set(f.characterIndex,list);const normalValue=normal(f);assert(normalValue.x*n.x*side+normalValue.y*n.y*side>0,'each face is wound toward its intended viewer');}
  // Place the real renderer camera outside the chosen wall face. Comparing
  // screen X, rather than a second hand-written world basis, catches the
  // +Y-south handedness that made the original GPU output read backwards.
  const target={x:60+t.x*6,y:t.y*6,z:70.53},eyeDelta={x:n.x*side*15,y:n.y*side*15};
  const camera=projector._createCamera(target,15,Math.atan2(-eyeDelta.x,eyeDelta.y),0,600,400,300);
  const actualEye={x:target.x-camera.sinYaw*camera.distance,y:target.y+camera.cosYaw*camera.distance};
  assert((actualEye.x-target.x)*n.x*side+(actualEye.y-target.y)*n.y*side>14.99);
  const average=index=>{const list=centers.get(index);return list.reduce((s,p)=>s+projector._project(p,camera).x/list.length,0);};
  for(const[a,b]of[[0,1],[1,2],[2,4],[4,5]])assert(average(b)>average(a),'actual renderer screen X increases in reading order');
  for(const f of glyphs)for(const p of f.vertices){assert(Math.abs(((p.x-60)*n.x+p.y*n.y)*side-.235)<1e-8);assert(p.z>69.93&&p.z<69.93+1.2);assert([p.x,p.y,p.z].every(Number.isFinite));}
 }
});

test('the actual camera projection shows an asymmetric E bitmap rather than a mirrored glyph on either side',()=>{
 const bitmap=['11111','10000','10000','11110','10000','10000','11111'];
 const inPolygon=(p,poly)=>{let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;};
 for(const angle of[0,.7,Math.PI,-Math.PI/2])for(const side of[-1,1]){
  const t={x:Math.cos(angle),y:Math.sin(angle)},n={x:-t.y,y:t.x},line=[[60,0],[60+t.x*12,t.y*12]];
  const env=build([wall(line,{height:1.2,sectionLength:12,advertisement:ad('E',side)})]),target={x:60+t.x*6,y:t.y*6,z:70.53};
  const camera=projector._createCamera(target,15,Math.atan2(-n.x*side,n.y*side),0,600,400,300);
  const polygons=letters(env).map(f=>f.vertices.map(p=>projector._project(p,camera))),points=polygons.flat();
  assert(points.every(p=>p&&Number.isFinite(p.x+p.y)));
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
  for(let row=0;row<7;row++)for(let column=0;column<5;column++){
   const p={x:left+(column+.5)*(right-left)/5,y:top+(row+.5)*(bottom-top)/7};
   assert.equal(polygons.some(poly=>inPolygon(p,poly)),bitmap[row][column]==='1',`camera-rendered E at angle${angle}, side${side}, row${row}, column${column}`);
  }
 }
});

test('all supported letters and numerals produce visible complete glyphs while spaces remain empty',()=>{
 for(const text of['ABCDEFGHIJKLM','NOPQRSTUVWXYZ','0123456789.']){
  const env=build([wall([[20,20],[60,20]],{height:1.4,sectionLength:12,advertisement:ad(text,1,{repeatLength:40})})]);
  assert.equal(env.stats.advertisements.repeats,1);assert.deepEqual([...new Set(letters(env).map(f=>f.characterIndex))],Array.from({length:text.length},(_,i)=>i));
 }
 const env=build([wall([[20,20],[44,20]],{advertisement:ad('Pirelli F1 24.',-1,{repeatLength:24})})]);
 assert.equal(env.stats.advertisements.repeats,1);assert(letters(env).every(f=>f.advertisementText==='PIRELLI F1 24.'));
 for(const i of[7,10])assert(!letters(env).some(f=>f.characterIndex===i),'space is not a fallback glyph');
});

test('letters clip to each real sloped wall section through bends and retain the full-road clearance',()=>{
 const line=[[20,-40],[20,-15],[27,0],[24,20],[35,38]],height=1.3,groundHeight=(x,y)=>70+.03*x+.08*y+.08*Math.sin(y/7);
 const base=build([wall(line,{height})],{groundHeight}),env=build([wall(line,{height,advertisement:ad('QATAR AIRWAYS',1,{repeatLength:18})})],{groundHeight});
 assert.deepEqual(plain(env),base.faces);assert(env.stats.advertisements.repeats>=4);
 for(const f of letters(env)){
  const body=base.faces.filter(f0=>f0.sectionIndex===f.sectionIndex)[0],[a,b]=body.vertices,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
  for(const p of f.vertices){const u=((p.x-a.x)*dx+(p.y-a.y)*dy)/(len*len),z=a.z+(b.z-a.z)*u;assert(u>=-1e-8&&u<=1+1e-8,'a clipped run stays within its own section');assert(Math.abs((p.x-a.x)*nx+(p.y-a.y)*ny-.01)<1e-8,'all lettering is on the actual wall plane, not the road tangent approximation');assert(p.z>z&&p.z<z+height);assert(env.roadDistance(p.x,p.y)>=env.clearanceM-1e-8);}
 }
 const crossing=build([wall([[-140,0],[40,0]],{advertisement:ad('ABC',1,{repeatLength:20})})]);assert(crossing.stats.advertisements.rejectedClearance>0);assert(letters(crossing).length>0);
 for(const f of letters(crossing))for(const p of [...f.vertices,center(f)])assert(crossing.roadDistance(p.x,p.y)>=crossing.clearanceM-1e-8,'every road leg, not only the attached one, remains clear');
 for(const repeat of new Set(letters(crossing).map(f=>f.repeatIndex)))assert.deepEqual([...new Set(letters(crossing).filter(f=>f.repeatIndex===repeat).map(f=>f.characterIndex))],[0,1,2],'cross-road gaps skip the entire repeated word');
});

test('unsupported, uncited and malformed advertising fails closed while the original wall is retained',()=>{
 const line=[[20,-20],[20,20]],base=build([wall(line)]);
 for(const value of[null,[],{},ad('A/B'),ad('MONZÁ'),ad('ß'),ad(''),ad('.'),ad('A'.repeat(25)),ad('ABC',0),ad('ABC',2),ad('ABC',1,{color:'white'}),ad('ABC',1,{repeatLength:Infinity}),ad('ABC',1,{repeatLength:1})]){
  const env=build([wall(line,{advertisement:value})]);assert.deepEqual(env.faces,base.faces);assert.equal(env.stats.advertisements.rejectedInvalid,1);assert.equal(env.stats.advertisements.faces,0);
 }
 const uncited=build([wall(line,{evidence:'',advertisement:ad()})]);assert.deepEqual(uncited.faces,base.faces);assert.equal(uncited.stats.advertisements.rejectedUnsourced,1);
 const missing=build([wall(line,{sourceId:undefined,advertisement:ad()})]);assert.equal(missing.faces.length,0);
 for(const material of['pvc-corrugated','tire-stack']){const env=build([wall(line,{material,advertisement:ad()})]);assert.deepEqual(env.faces,build([wall(line,{material})]).faces);assert.equal(env.stats.advertisements.rejectedInvalid,1);}
});

test('repeat spacing follows physical chainage and does not depend on extra source vertices',()=>{
 const props={height:1.1,advertisement:ad('PIRELLI',-1,{repeatLength:17})},line=[[20,-100],[20,100]],a=build([wall(line,props)]),dense=build([wall(Array.from({length:201},(_,i)=>[20,i-100]),props)]);
 assert.equal(a.faces.length,dense.faces.length);
 for(let i=0;i<a.faces.length;i++){
  const {vertices,...style}=a.faces[i],{vertices:other,...otherStyle}=dense.faces[i];assert.deepEqual(style,otherStyle);assert.equal(vertices.length,other.length);
  // The unchanged line sampler can differ by ~1e-14m when a long original
  // segment is replaced by integer-spaced nodes; phase and topology still agree.
  for(let j=0;j<vertices.length;j++)for(const axis of['x','y','z'])assert(Math.abs(vertices[j][axis]-other[j][axis])<1e-9);
 }
 assert.deepEqual(a.stats,dense.stats);assert.equal(a.stats.advertisements.repeats,12);
 const duplicate=build([wall([[20,-100],[20,-100],[20,100]],props)]);assert.deepEqual(duplicate.faces,a.faces);
 assert.equal(build([wall([[20,0],[20,0]],props)]).stats.advertisements.repeats,0);
});

test('global repetition and glyph face budgets stop on complete words rather than truncated labels',()=>{
 const repeat=build([wall([[20,20],[420,20]],{advertisement:ad('I',1,{repeatLength:2})})],{groundHeight:()=>70});
 assert.equal(repeat.stats.advertisements.repeatAttempts,128);assert.equal(repeat.stats.advertisements.repeats,128);assert.equal(repeat.stats.advertisements.truncatedRepeats,72);
 const text='M'.repeat(24),limited=build([wall([[20,20],[4020,20]],{advertisement:ad(text,1,{repeatLength:20})})],{groundHeight:()=>70});
 const stats=limited.stats.advertisements;assert(stats.faces<=12000&&stats.faces>11000);assert(stats.truncatedRepeats>0);assert(stats.repeats<128);assert.equal(letters(limited).length,stats.faces);
 for(const index of new Set(letters(limited).map(f=>f.repeatIndex)))assert.equal(new Set(letters(limited).filter(f=>f.repeatIndex===index).map(f=>f.characterIndex)).size,24);
 const two=build([wall([[20,20],[420,20]],{advertisement:ad('I',1,{repeatLength:2})}),{...wall([[20,40],[420,40]],{advertisement:ad('I',1,{repeatLength:2})}),id:'wall-two'}],{groundHeight:()=>70});
 assert.equal(two.stats.advertisements.repeats,128,'budget is shared by all wall features');assert.equal(letters(two).some(f=>f.featureId==='wall-two'),false);
});
