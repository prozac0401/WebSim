'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Model=require('./course-model.js'),Renderer=require('./renderer.js'),Physics=require('./physics.js'),Genome=require('./genome.js'),Catalog=require('./catalog.js');
const data=require('./kic-t21.js'),track=Model.build(data),car=Catalog.get();
const previous=()=>Model.build({...data,boundaryPolygons:[...data.boundaryPolygons,data.environment.terrain.sourcePolygon]});
const pointAt=(s,offset)=>{const p=track.sample(s);return {x:p.x-Math.sin(p.heading)*offset,y:p.y+Math.cos(p.heading)*offset,yaw:p.heading,s};};

test('KIC competition polygon follows the rendered 14m strip rather than the surrounding asphalt',()=>{
  assert.equal(track.boundaryPolygons.length,1);assert.equal(data.competitionBoundary.sceneryApronDrivable,false);
  assert.equal(data.environment.terrain.drivable,false);assert.equal(data.environment.terrain.role,'off-course-asphalt');
  const renderer=Object.create(Renderer.prototype);renderer.trackCache=new WeakMap();
  const edges=renderer._track(track).edges,polygon=track.boundaryPolygons[0],left=polygon.slice(0,edges.length+2),right=polygon.slice(edges.length+2).reverse();
  assert.equal(polygon.length,(edges.length+2)*2);
  for(let i=0;i<edges.length;i++)for(const [rendered,boundary]of [[edges[i].left,left[i+1]],[edges[i].right,right[i+1]]]){
    assert.ok(Math.hypot(rendered.x-boundary.x,rendered.y-boundary.y)<1e-10,'every rendered road-edge vertex is a race-boundary vertex');
  }
  assert.ok(data.environment.terrain.triangles.length>100,'the surrounding asphalt remains visible scenery');
  const white=data.environment.lines.filter(l=>l.color==='#dddeda');assert.equal(white.length,2);
  assert.equal(data.competitionBoundary.whiteLineInsetM-white[0].width/2,.24,'paint is inside the road edge, not the race boundary');
});

test('the reported outward drift path is now invalid despite remaining on visible asphalt',()=>{
  // Physical front-contact samples from the saved valid g6-6 diagnostic replay.
  const points=[{x:16.4047,y:86.6447,s:263.5032},{x:26.238,y:52.9269,s:296.397},{x:20.3538,y:5.2811,s:342},{x:-7.8618,y:-10.7142,s:359.4112}];
  const old=previous();
  for(const q of points){
    assert.equal(Model.inPolygon(q.x,q.y,data.environment.terrain.sourcePolygon),true);
    assert.equal(old.contains(q.x,q.y,q.s),true);assert.equal(track.contains(q.x,q.y,q.s),false);
    const yaw=track.sample(q.s).heading,offset=Physics.frontContacts(car,{x:0,y:0,yaw})[0],state={x:q.x-offset.x,y:q.y-offset.y,yaw,s:q.s};
    assert.equal(Physics.failure(car,old,state),null);assert.equal(Physics.failure(car,track,state),'offtrack');
  }
});

test('swept front contacts cannot rotate out across the road edge and return within a step',()=>{
  const before=pointAt(296,5.9),after={...before,yaw:before.yaw+Math.PI};
  assert.equal(Physics.failure(car,track,before),null);assert.equal(Physics.failure(car,track,after),null);
  assert.equal(Physics.failure(car,track,after,before),'offtrack');
  assert.equal(Physics.failure(car,previous(),after,before),null,'background asphalt previously masked this excursion');
});

test('genetic target-line limits are derived from the same restricted competition polygon',()=>{
  const bounds=Genome.corridorBounds(car,track),old=Genome.corridorBounds(car,previous());
  const index=Math.round(296/track.length*(Genome.KNOTS-1));
  assert.ok(bounds[index].max<old[index].max-5,'the former wide apron is no longer a mutation target');
  for(let i=0;i<Genome.KNOTS;i++)for(const offset of [bounds[i].min,bounds[i].max]){
    const p=pointAt(i/(Genome.KNOTS-1)*track.length,offset);assert.equal(Physics.failure(car,track,p),null);
  }
});
