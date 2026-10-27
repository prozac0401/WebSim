'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Environment=require('./track-environment.js'),Terrain=require('./circuit-terrain.js');
const track={id:'mask-fixture',width:12,points:[{x:0,y:-100,z:10},{x:0,y:100,z:20},{x:-100,y:100,z:20},{x:-100,y:-100,z:10}],bounds:{minX:-100,maxX:0,minY:-100,maxY:100}};
const rectangle=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const feature=(id,ring,props={})=>({type:'Feature',id,properties:{kind:'asphalt',sourceId:'fixture',evidence:'Synthetic paint contract, not venue evidence.',drapeOnTerrain:true,terrainPaintOnly:true,color:'#606870',...props},geometry:{type:'Polygon',coordinates:[ring]}});
const collection=features=>({coordinateSystem:'local-metres',features});
const build=(data,options={})=>Environment.build(track,'mask-fixture',data,{backgroundVegetation:false,...options});
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area=faces=>faces.reduce((sum,f)=>sum+Math.abs(f.vertices.reduce((s,p,i)=>{const q=f.vertices[(i+1)%f.vertices.length];return s+p.x*q.y-p.y*q.x;},0))/2,0);
function height(face,x,y){const[a,b,c]=face.vertices,d=cross(a,b,c);if(Math.abs(d)<1e-10)return null;const p={x,y},u=cross(b,c,p)/d,v=cross(c,a,p)/d,w=1-u-v;return Math.min(u,v,w)>=-1e-8?u*a.z+v*b.z+w*c.z:null;}
const plane=(x,y)=>10+.2*x+.1*y;
const ground=[[[10,-40],[100,-40],[100,40]],[[10,-40],[100,40],[10,40]]].map(v=>({vertices:v.map(([x,y])=>({x,y,z:plane(x,y)})),fill:'#829569',kind:'context-ground'}));

test('opt-in terrain masks use original XY triangles without independently sampled scene faces',()=>{
 const data=collection([feature('crossing-road',rectangle(-10,-40,100,80))]),before=JSON.stringify({data,track});let samples=0;
 const env=build(data,{groundHeight:()=>{samples++;return 99;}});
 assert.equal(env.stats.features,1);assert.equal(env.stats.terrainPaintMasks,2);assert.equal(env.stats.terrain.sourceTriangles,0);assert.equal(samples,0);
 assert.equal(env.faces.length,0);assert.equal(env.groups.length,0);assert.equal(env.query(30,0,500).length,0);
 assert.equal(env.terrainOverlays.length,2);assert(env.terrainOverlays.every(f=>f.terrainDrape&&f.kind==='asphalt'&&f.featureId==='crossing-road'&&f.priority===-2));
 assert.equal(area(env.terrainOverlays),8000);assert.equal(JSON.stringify({data,track}),before);
 const painted=Terrain.paintSurface(ground,env.terrainOverlays);assert(Math.abs(area(painted)-area(ground))<1e-8);
 for(const f of painted)for(const p of f.vertices)assert(Math.abs(p.z-plane(p.x,p.y))<1e-9,'only the original terrain supplies Z');
});

test('mixed raw and legacy regions preserve feature order and later-paint priority even with repeated IDs',()=>{
 const ring=rectangle(20,-20,60,40),legacy=color=>feature('repeated-id',ring,{color,terrainPaintOnly:false});
 const raw=feature('middle-mask',ring,{color:'#aabbcc'}),data=collection([legacy('#334455'),raw,legacy('#778899')]);
 const env=build(data);assert.deepEqual([...new Set(env.terrainOverlays.map(f=>f.fill))],['#334455','#aabbcc','#778899']);
 const painted=Terrain.paintSurface(ground,env.terrainOverlays);assert(painted.filter(f=>height(f,51,3)!==null).every(f=>f.fill==='#778899'));
 const reordered=build(collection([data.features[0],data.features[2],raw]));
 assert(Terrain.paintSurface(ground,reordered.terrainOverlays).filter(f=>height(f,51,3)!==null).every(f=>f.fill==='#aabbcc'));
 assert(env.faces.every(f=>f.featureId!=='middle-mask'),'raw masks never reappear as floating scene geometry');
});

test('holes, forests, absent draping and missing painters fall back to unchanged legacy geometry',()=>{
 const base=feature('surface',rectangle(15,-40,80,80)),hole=structuredClone(base);hole.geometry.coordinates.push(rectangle(35,-10,20,20));
 const cases=[hole,feature('woodland',rectangle(20,-40,80,80),{kind:'forest',trees:false}),feature('not-draped',rectangle(20,-40,80,80),{drapeOnTerrain:false})];
 for(const f of cases){const plain=structuredClone(f);delete plain.properties.terrainPaintOnly;const a=build(collection([f])),b=build(collection([plain]));assert.deepEqual(a.faces,b.faces);assert.deepEqual(a.terrainOverlays,b.terrainOverlays);assert.deepEqual(a.stats,b.stats);}
 const plain=structuredClone(base);delete plain.properties.terrainPaintOnly;const expected=build(collection([plain])),saved=globalThis.CircuitTerrain;
 try{delete globalThis.CircuitTerrain;const fallback=build(collection([base]));assert.deepEqual(fallback.faces,expected.faces);assert.deepEqual(fallback.terrainOverlays,expected.terrainOverlays);assert.deepEqual(fallback.stats,expected.stats);}
 finally{globalThis.CircuitTerrain=saved;}
 const uncited=structuredClone(base);delete uncited.properties.sourceId;assert.equal(build(collection([uncited])).terrainOverlays.length,0);
});

test('a road-crossing raw mask cannot fill road cutouts or repaint support and closure layers',()=>{
 const t={width:12,bounds:{minX:0,maxX:120,minY:0,maxY:30},points:[{x:0,y:0,z:0},{x:40,y:0,z:0},{x:80,y:0,z:0},{x:120,y:0,z:0},{x:120,y:30,z:30},{x:80,y:30,z:30},{x:40,y:30,z:30},{x:0,y:30,z:30}]};
 const edges=t.points.map((p,i)=>{const a=t.points[(i+t.points.length-1)%t.points.length],b=t.points[(i+1)%t.points.length],d=Math.hypot(b.x-a.x,b.y-a.y),at=v=>({x:p.x-(b.y-a.y)/d*v,y:p.y+(b.x-a.x)/d*v,z:p.z});return{left:at(-6),right:at(6),outerLeft:at(-6.78),outerRight:at(6.78)};});
 const terrain=Terrain.build(t,edges,{groundHeight:(x,y)=>y<15?-.07:29.93}),before=JSON.stringify(terrain.faces);
 const mask=build(collection([feature('cross-both-legs',rectangle(-10,-10,140,50))])).terrainOverlays;
 const painted=Terrain.paintSurface(terrain.faces,mask);assert(painted.some(f=>f.featureId==='cross-both-legs'));assert(Math.abs(area(painted)-area(terrain.faces))<1e-6);
 for(const f of terrain.faces.filter(f=>['terrain-underlay','terrain-boundary','terrain-base'].includes(f.kind)))assert(painted.includes(f));
 for(const f of painted.filter(f=>f.featureId==='cross-both-legs')){const c=f.vertices.reduce((s,p)=>({x:s.x+p.x/3,y:s.y+p.y/3,z:s.z+p.z/3}),{x:0,y:0,z:0});assert.equal(terrain.roadHeight(c.x,c.y),null);assert(Math.abs(terrain.sampleHeight(c.x,c.y)-c.z)<1e-7);}
 assert.equal(JSON.stringify(terrain.faces),before);
});

test('raw concave paint masks retain their footprint and still reserve it from illustrative vegetation',()=>{
 const ring=[[25,-60],[150,-60],[150,60],[100,60],[100,0],[25,0],[25,-60]],data=collection([feature('concave-apron',ring)]);
 const env=build(data,{backgroundVegetation:true,backgroundTreeLimit:24});assert.equal(env.terrainOverlays.length,4);assert.equal(area(env.terrainOverlays),10500);
 for(const t of env.objects)assert(!env.terrainOverlays.some(f=>height(f,t.x,t.y)!==null),'mapped apron still excludes random tree roots');
 assert(env.stats.backgroundTrees>0);assert(env.faces.every(f=>f.featureId!=='concave-apron'));
});

test('omitted and explicit-disabled mask options retain the frozen default geometry',()=>{
 const f=feature('legacy-asphalt',rectangle(15,-30,70,60));delete f.properties.terrainPaintOnly;const data=collection([f]),a=build(data);
 const changed=structuredClone(data);changed.features[0].properties.terrainPaintOnly=false;const b=build(changed);
 assert.deepEqual(a.faces,b.faces);assert.deepEqual(a.terrainOverlays,b.terrainOverlays);assert.deepEqual(a.stats,b.stats);
 const digest=crypto.createHash('sha256').update(JSON.stringify({faces:a.faces,objects:a.objects,stats:a.stats})).digest('hex');
 // Independently captured from the released c6a0e27 implementation.
 assert.equal(digest,'60704566aab7f1368ff23bc9b1d836a4b66983171f020ac42fd90da05a84309e');
});
