'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Styles=require('./road-edge-style.js'),Race=require('./race-engine.js'),Renderer=require('./circuit-renderer.js'),circuits=require('./circuits.js');
const rule=(startM,endM,side,style)=>({startM,endM,side,style,sourceId:'observed-photo',evidence:'Synthetic interval for material-only regression.'});
const area=vertices=>Math.abs(vertices.reduce((sum,p,i)=>{const q=vertices[(i+1)%vertices.length];return sum+p.x*q.y-p.y*q.x;},0)/2);
function makeRoad(track,metadata){
  const saved=globalThis.TrackEnvironmentData;
  try{globalThis.TrackEnvironmentData={[track.id]:{metadata}};const renderer=Object.create(Renderer.prototype);renderer.race={track};renderer.displayTrack=track;renderer._makeRoad();return renderer;}
  finally{globalThis.TrackEnvironmentData=saved;}
}
test('road edge intervals use half-open canonical metres, wrap the seam and resolve each side independently',()=>{
  const metadata={defaultRoadEdge:'white-line',roadEdges:[rule(100,200,'left','curb'),rule(950,50,'both','grass'),rule(150,175,'left','asphalt')]};
  const before=JSON.stringify(metadata),styles=Styles.compile(metadata,1000);
  assert.equal(styles.styleAt(100,'left'),'curb');assert.equal(styles.styleAt(100,'right'),'white-line');
  assert.equal(styles.styleAt(149.999,'left'),'curb');assert.equal(styles.styleAt(150,'left'),'asphalt');
  assert.equal(styles.styleAt(175,'left'),'curb');assert.equal(styles.styleAt(200,'left'),'white-line');
  for(const s of [-25,0,49.999,950,1025])for(const side of ['left','right'])assert.equal(styles.styleAt(s,side),'grass');
  assert.equal(styles.styleAt(50,'right'),'white-line');assert.equal(styles.styleAt(1950,'left'),'grass');
  assert.equal(JSON.stringify(metadata),before,'source interval data is immutable');
  const full=Styles.compile({roadEdges:[rule(0,1000,'both','asphalt')]},1000);
  assert.equal(full.styleAt(999.9,'right'),'asphalt');assert.equal(full.styleAt(0,'left'),'asphalt');
});
test('uncited or malformed intervals and palettes cannot replace the legacy material contract',()=>{
  const rows=[{...rule(0,100,'left','grass'),sourceId:''},{...rule(0,100,'left','grass'),evidence:''},rule(0,100,'up','grass'),rule(0,0,'both','grass'),rule(NaN,100,'both','grass'),rule(0,100,'both','unknown')];
  const styles=Styles.compile({defaultRoadEdge:'unknown',roadEdges:rows,roadCurbColors:['red','#ffffff']},1000);
  assert.equal(styles.styleAt(50,'left'),'curb');assert.equal(styles.curbColors,null);
  for(const block of [.7,8.1,NaN,'1.8'])assert.equal(Styles.compile({roadCurbBlockLengthM:block},1000).splitCurbBlocks,false);
  for(const block of [.8,1.8,8])assert.equal(Styles.compile({roadCurbBlockLengthM:block},1000).curbBlockLengthM,block);
  const invalid=Styles.compile({roadSurfaceColor:'red',defaultGroundColor:'#fff'},1000);assert.equal(invalid.roadSurfaceColor,null);assert.equal(invalid.defaultGroundColor,null);
  assert.equal(Styles.compile(null,1000).styleAt(0,'right'),'curb');
  assert.equal(Styles.compile({roadEdges:[rule(0,10,'both','grass')]},NaN).styleAt(0,'right'),'curb');
  const colors=['#2d82b3','#edf0e5'],valid=Styles.compile({roadCurbColors:colors},1000);colors[0]='#000000';
  assert.deepEqual(valid.curbColors,['#2d82b3','#edf0e5']);assert.ok(Object.isFrozen(valid.curbColors));
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('./road-edge-style.js'),'utf8'),sandbox);
  assert.equal(sandbox.window.RoadEdgeStyle.compile({defaultRoadEdge:'white-line'},100).styleAt(20,'left'),'white-line');
});
test('unconfigured Inje and Spa retain the exact legacy asphalt and alternating curb faces',()=>{
  for(const id of ['inje','spa']){
    const track=Race.buildTrack(circuits.find(c=>c.id===id)),r=makeRoad(track,undefined),edges=r.roadEdges;
    assert.equal(r.roadFaces.length,edges.length*3);
    for(let i=0;i<edges.length;i++){
      const a=edges[i],b=edges[(i+1)%edges.length],road=r.roadFaces[i*3],left=r.roadFaces[i*3+1],right=r.roadFaces[i*3+2];
      assert.deepEqual(road,{vertices:[a.left,b.left,b.right,a.right],fill:'#465250',stroke:'#465250',width:.55,road:true});
      const fill=Math.floor(a.s/8)%2?(id==='spa'?'#dec847':'#f0ecdf'):'#ba6759';
      assert.deepEqual(left,{vertices:[a.outerLeft,b.outerLeft,b.left,a.left],fill,road:true});
      assert.deepEqual(right,{vertices:[a.right,b.right,b.outerRight,a.outerRight],fill,road:true});
    }
  }
});
test('Everland edge paint preserves road heights, outer boundaries, area and source geometry on the canonical centreline',()=>{
  const built=Race.buildTrack(circuits.find(c=>c.id==='everland'));
  // A live race replaces track.length with its shorter racing-line length.
  const track={...built,length:built.racingLine.length},before=JSON.stringify(track);
  const metadata={defaultRoadEdge:'white-line',roadCurbColors:['#2d82b3','#edf0e5'],roadEdges:[rule(4300,40,'left','curb'),rule(100,200,'right','grass'),rule(220,300,'both','asphalt')]};
  const r=makeRoad(track,metadata),legacy=makeRoad(track,undefined),styles=Styles.compile(metadata,built.centerlineLength);
  assert.equal(JSON.stringify(track),before);assert.deepEqual(r.roadEdges,legacy.roadEdges);assert.deepEqual(r.supports,legacy.supports);
  assert.ok(r.roadFaces.length>legacy.roadFaces.length);assert.ok(r.roadFaces.every(f=>f.road===true));
  let cursor=0,white=0,blue=0,grass=0;
  for(let i=0;i<r.roadEdges.length;i++){
    const a=r.roadEdges[i],b=r.roadEdges[(i+1)%r.roadEdges.length];
    assert.deepEqual(r.roadFaces[cursor++],legacy.roadFaces[i*3],'asphalt road surface remains unchanged');
    for(const [side,index] of [['left',1],['right',2]]){
      const style=styles.styleAt(a.s,side),count=style==='white-line'?2:1,faces=r.roadFaces.slice(cursor,cursor+count);cursor+=count;
      assert.ok(Math.abs(faces.reduce((s,f)=>s+area(f.vertices),0)-area(legacy.roadFaces[i*3+index].vertices))<1e-8,'partition preserves original strip coverage without overlaps');
      const inner=side==='left'?a.left:a.right,outer=side==='left'?a.outerLeft:a.outerRight;
      assert.ok(faces.some(f=>f.vertices.includes(inner)));assert.ok(faces.some(f=>f.vertices.includes(outer)));
      if(style==='white-line'){
        white++;assert.equal(faces[0].fill,'#edf0e5');assert.equal(faces[1].fill,'#465250');
        const mid=side==='left'?faces[0].vertices[0]:faces[0].vertices[3];
        assert.ok(Math.abs(Math.hypot(mid.x-inner.x,mid.y-inner.y)-.12)<1e-8,'white line is 12 cm within the original strip');
        assert.ok(Math.abs(mid.z-inner.z)<1e-10,'paint is on the road surface, not a floating overlay');
      }else if(style==='grass'){grass++;assert.equal(faces[0].fill,'#829569');}
      else if(style==='asphalt')assert.equal(faces[0].fill,'#465250');
      else{const fill=metadata.roadCurbColors[Math.floor(a.s/8)%2?1:0];assert.equal(faces[0].fill,fill);if(fill==='#2d82b3')blue++;}
    }
  }
  assert.equal(cursor,r.roadFaces.length);assert.ok(white>0&&blue>0&&grass>0,'all configured edge treatments are exercised');
});
test('short optional curb blocks subdivide only existing strips, preserving sloped edge lines and asphalt geometry',()=>{
  const track=Race.buildTrack(circuits.find(c=>c.id==='everland')),metadata={roadSurfaceColor:'#737978',roadCurbColors:['#2d82b3','#edf0e5'],roadCurbBlockLengthM:1.8};
  const r=makeRoad(track,metadata),baseline=makeRoad(track,undefined),before=JSON.stringify(track);
  assert.deepEqual(r.roadEdges,baseline.roadEdges);assert.equal(JSON.stringify(track),before);
  const groups=[];for(const face of r.roadFaces){if(face.stroke)groups.push({asphalt:face,strips:[]});else groups.at(-1).strips.push(face);}
  assert.equal(groups.length,r.roadEdges.length);
  let sawSplit=false;
  for(let i=0;i<groups.length;i++){
    const group=groups[i],a=r.roadEdges[i],b=r.roadEdges[(i+1)%groups.length],endS=i+1<groups.length?b.s:track.centerlineLength;
    assert.deepEqual(group.asphalt.vertices,baseline.roadFaces[i*3].vertices);assert.equal(group.asphalt.fill,'#737978');assert.equal(group.asphalt.stroke,'#737978');
    const onLine=(p,A,B)=>{const dx=B.x-A.x,dy=B.y-A.y,dz=B.z-A.z,t=((p.x-A.x)*dx+(p.y-A.y)*dy+(p.z-A.z)*dz)/(dx*dx+dy*dy+dz*dz);return {t,error:Math.hypot(p.x-A.x-t*dx,p.y-A.y-t*dy,p.z-A.z-t*dz)};};
    const left=group.strips.filter(f=>onLine(f.vertices[0],a.outerLeft,b.outerLeft).error<1e-8),right=group.strips.filter(f=>!left.includes(f));
    for(const [faces,side,index] of [[left,'left',1],[right,'right',2]]){
      assert.ok(faces.length>=1);if(faces.length>1)sawSplit=true;
      assert.ok(Math.abs(faces.reduce((s,f)=>s+area(f.vertices),0)-area(baseline.roadFaces[i*3+index].vertices))<2e-8,'all block pieces cover exactly the previous strip');
      const IA=side==='left'?a.left:a.right,IB=side==='left'?b.left:b.right,OA=side==='left'?a.outerLeft:a.outerRight,OB=side==='left'?b.outerLeft:b.outerRight;
      for(const f of faces){
        for(const p of f.vertices){const matches=[onLine(p,IA,IB),onLine(p,OA,OB)];assert.ok(matches.some(q=>q.error<1e-9&&q.t>=-1e-9&&q.t<=1+1e-9),'every added vertex lies in XYZ on an original longitudinal boundary');}
        const start=onLine(f.vertices[0],side==='left'?OA:IA,side==='left'?OB:IB).t,end=onLine(f.vertices[1],side==='left'?OA:IA,side==='left'?OB:IB).t;
        const s0=a.s+start*(endS-a.s),s1=a.s+end*(endS-a.s);
        assert.ok(s1-s0<=1.8+1e-8,'no curb face crosses a 1.8 m paint block');
        assert.equal(f.fill,metadata.roadCurbColors[Math.floor(((s0+s1)/2)/1.8)%2]);
      }
      assert.ok(faces.some(f=>f.vertices.includes(IA)));assert.ok(faces.some(f=>f.vertices.includes(IB)));assert.ok(faces.some(f=>f.vertices.includes(OA)));assert.ok(faces.some(f=>f.vertices.includes(OB)));
      for(let j=1;j<faces.length;j++)assert.ok(faces[j-1].vertices.filter(p=>faces[j].vertices.includes(p)).length===2,'neighbouring blocks share the exact same boundary objects');
    }
  }
  assert.ok(sawSplit);
  const white=makeRoad(track,{defaultRoadEdge:'white-line',roadSurfaceColor:'#737978'});
  assert.ok(white.roadFaces.every(f=>['#737978','#edf0e5'].includes(f.fill)),'white-line strip uses the configured asphalt tone');
});
test('optional ground color changes only top ground materials before a draped overlay, with identical geometry and heights',()=>{
  const Terrain=require('./circuit-terrain.js'),saved=globalThis.CircuitTerrain;globalThis.CircuitTerrain=Terrain;
  try{
    const n=32,radius=60,length=2*Math.PI*radius,points=Array.from({length:n},(_,i)=>{const angle=i/n*Math.PI*2;return{x:radius*Math.cos(angle),y:radius*Math.sin(angle),z:5+2*Math.sin(angle),s:i*length/n};});
    const track={id:'ground-paint-fixture',points,length,centerlineLength:length,spacing:length/n,centerlineSpacing:length/n,width:11,elevationMin:3,elevationMax:7,bounds:{minX:-60,maxX:60,minY:-60,maxY:60,width:120,height:120}};
    const overlay={vertices:[{x:90,y:0},{x:110,y:0},{x:100,y:20}],fill:'#606060',kind:'asphalt',featureId:'paddock'};
    const build=metadata=>{const r=makeRoad(track,metadata);r.environment={groundHeight:(x,y)=>5+x*.01+y*.02,terrainOverlays:[overlay]};r._makeContextGround();return r;};
    const base=build(undefined),painted=build({defaultGroundColor:'#b3a981'});
    assert.deepEqual(painted.terrainGeometry.faces,base.terrainGeometry.faces,'ground builder and original material objects remain untouched');
    assert.equal(painted.contextGround.length,base.contextGround.length);
    let recolored=0,overlays=0,protectedFaces=0;
    for(let i=0;i<base.contextGround.length;i++){
      const a=base.contextGround[i],b=painted.contextGround[i];assert.deepEqual(b.vertices,a.vertices,'all original and clipped XYZ coverage is identical');
      if(['context-ground','terrain-bank'].includes(b.kind)){assert.equal(b.fill,'#b3a981');recolored++;}
      else{assert.equal(b.fill,a.fill);protectedFaces++;if(b.featureId==='paddock'){assert.equal(b.fill,'#606060');overlays++;}}
    }
    assert.ok(recolored>0&&overlays>0&&protectedFaces>overlays);
    for(const [x,y] of [[0,0],[50,10],[100,10]])assert.equal(painted.terrainGeometry.sampleHeight(x,y),base.terrainGeometry.sampleHeight(x,y));
  }finally{globalThis.CircuitTerrain=saved;}
});
