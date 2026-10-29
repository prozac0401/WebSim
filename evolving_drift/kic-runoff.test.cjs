'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Model=require('./course-model.js'),Renderer=require('./renderer.js'),Physics=require('./physics.js'),Catalog=require('./catalog.js');
const data=require('./kic-t21.js'),track=Model.build(data),red='#875657';
const painted=()=>data.environment.surfaces.filter(s=>s.role==='non-drivable-runoff');
const area=polygon=>Math.abs(polygon.reduce((n,a,i)=>{const b=polygon[(i+1)%polygon.length];return n+a.x*b.y-b.x*a.y;},0))/2;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function triangleIntersection(subject,triangle){
  let polygon=subject.map(p=>({...p}));const sign=Math.sign(cross(...triangle));
  for(let i=0;i<3;i++){
    const a=triangle[i],b=triangle[(i+1)%3],next=[];
    for(let j=0;j<polygon.length;j++){
      const p=polygon[j],q=polygon[(j+1)%polygon.length],dp=sign*cross(a,b,p),dq=sign*cross(a,b,q);
      if(dp>=-1e-10)next.push(p);
      if((dp>=0)!==(dq>=0)){const u=dp/(dp-dq);next.push({x:p.x+(q.x-p.x)*u,y:p.y+(q.y-p.y)*u});}
    }
    polygon=next;if(!polygon.length)break;
  }
  return polygon;
}
function heightAt(q,vertices){const [a,b,c]=vertices,den=cross(a,b,c),wa=cross(q,b,c)/den,wb=cross(a,q,c)/den;return wa*a.z+wb*b.z+(1-wa-wb)*c.z;}

test('KIC red runoff rejects the reported front-contact point that the asphalt apron formerly allowed',()=>{
  const q={x:-21.2251,y:-13.3267,s:369.355},exclusions=new Set(painted().map(s=>s.exclusionIndex));
  const previous=Model.build({...data,excludedPolygons:data.excludedPolygons.filter((_,i)=>!exclusions.has(i))});
  assert.equal(previous.contains(q.x,q.y,q.s),true,'the original apron accepted this red-strip point');
  assert.equal(track.contains(q.x,q.y,q.s),false,'the painted runoff must be outside the permitted road');
  const car=Catalog.get(),yaw=track.sample(q.s).heading,offset=Physics.frontContacts(car,{x:0,y:0,yaw})[0];
  assert.equal(Physics.failure(car,track,{x:q.x-offset.x,y:q.y-offset.y,yaw,s:q.s}),'offtrack');
  const road=track.sample(q.s);assert.equal(track.contains(road.x,road.y,q.s),true);
});

test('KIC runoff paint and exclusion footprints match over their complete width',()=>{
  const surfaces=painted(),groups=new Map();assert.ok(surfaces.length>6);
  assert.equal(data.environment.lines.some(line=>line.color===red),false,'a separate centred stripe must not redraw a different footprint');
  for(const surface of surfaces){
    assert.equal(surface.drivable,false);assert.equal(surface.color,red);assert.equal(surface.points.length,3);
    const footprint=data.excludedPolygons[surface.exclusionIndex];assert.ok(footprint);
    for(const p of surface.points)assert.equal(Model.inPolygon(p.x,p.y,footprint),true);
    const centre={x:surface.points.reduce((n,p)=>n+p.x,0)/3,y:surface.points.reduce((n,p)=>n+p.y,0)/3};
    assert.equal(track.contains(centre.x,centre.y),false,'every painted triangle is excluded');
    groups.set(surface.exclusionIndex,(groups.get(surface.exclusionIndex)||0)+area(surface.points));
  }
  assert.equal(groups.size,6);
  for(const [index,paintedArea]of groups)assert.ok(Math.abs(paintedArea-area(data.excludedPolygons[index]))<1e-6,'paint covers the whole excluded strip segment');
  // At the long edge beside the reported point, both road-side red paint and
  // grass-side red paint are excluded; ordinary apron beyond the paint remains.
  const footprint=data.excludedPolygons[[...groups.keys()][4]],a=footprint[0],b=footprint[1],c=footprint[2],d=footprint[3];
  const start={x:(a.x+d.x)/2,y:(a.y+d.y)/2},end={x:(b.x+c.x)/2,y:(b.y+c.y)/2},length=Math.hypot(end.x-start.x,end.y-start.y);
  const mid={x:(start.x+end.x)/2,y:(start.y+end.y)/2},normal={x:-(end.y-start.y)/length,y:(end.x-start.x)/length};
  for(const offset of [-1.74,0,1.74])assert.equal(track.contains(mid.x+normal.x*offset,mid.y+normal.y*offset),false);
  assert.ok([-1.76,1.76].some(offset=>track.contains(mid.x+normal.x*offset,mid.y+normal.y*offset)),'asphalt side beyond the 3.5m strip remains permitted');
});

test('KIC runoff rendering follows the existing height field and clears overlapping grass',()=>{
  const renderer=Object.create(Renderer.prototype),ground=renderer._environmentGeometry(track).ground,faces=ground.filter(f=>f.fill===red),grass=ground.filter(f=>f.fill==='#849565');
  assert.equal(faces.length,painted().length);assert.ok(faces.length>6);
  let min=Infinity,max=-Infinity;
  for(const face of faces){
    for(const p of face.vertices){const expected=track.surface(p.x,p.y).z+.04;assert.ok(Math.abs(p.z-expected)<1e-10);min=Math.min(min,p.z);max=Math.max(max,p.z);}
    const q={x:face.vertices.reduce((n,p)=>n+p.x,0)/3,y:face.vertices.reduce((n,p)=>n+p.y,0)/3};
    const z=face.vertices.reduce((n,p)=>n+p.z,0)/3;
    assert.ok(Math.abs(z-track.surface(q.x,q.y).z-.04)<.004,'paint is resampled rather than flattened over terrain');
  }
  assert.ok(max-min>.02,'paint retains the local elevation changes');
  let checked=0;
  // Height difference is linear on each overlap polygon, so its vertices
  // bound the full area, including thin fragments missed by point sampling.
  for(const paint of faces)for(const under of grass){
    if(Math.abs(cross(...under.vertices))<1e-10)continue;
    for(const p of triangleIntersection(paint.vertices,under.vertices)){
      assert.ok(heightAt(p,paint.vertices)-heightAt(p,under.vertices)>.007,'grass must not hide the visible runoff boundary');checked++;
    }
  }
  assert.ok(checked>100);
});
