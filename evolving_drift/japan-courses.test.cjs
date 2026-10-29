'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Model=require('./course-model.js'),Renderer=require('./renderer.js'),Physics=require('./physics.js'),Catalog=require('./catalog.js');
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
for(const [file,minLength,maxLength,rounds]of [['ebisu-west',540,580,[5,6]],['tsukuba-d1',860,920,[3,4]]]){
  const data=require('./'+file+'.js'),source=require('./data/'+file+'-source.json'),track=Model.build(data);
  test(file+': identifies the actual 2025 D1 event and marks unsurveyed dimensions',()=>{
    assert.equal(track.event.series,'D1GP');assert.equal(track.event.year,2025);assert.deepEqual(track.event.rounds,rounds);
    assert.equal(track.verifiedCompetition,true);assert.equal(track.officialLayout,false);assert.equal(track.reconstruction.fullCircuitIncluded,false);
    for(const key of ['officialStartFinish','officialClips','boundarySurveyed'])assert.equal(track.reconstruction[key],false);
    assert.equal(source.evidence.officialClipSurvey,false);assert.match(track.provenance.visualInspection,/스토리보드/);
    assert.match(track.provenance.visualInspection,/전체 연속 재생/);
    for(const field of ['geometry','elevation','environment'])assert.ok(track.presentation[field]);
    assert.equal(track.mapAttribution.license,'ODbL-1.0');assert.ok(track.sources.some(s=>new URL(s.url).hostname==='d1gp.co.jp'));
    assert.match(track.elevation.attribution.credit,/Copernicus WorldDEM-90/);assert.match(track.elevation.attribution.licenseUrl,/creativecommons/);
    assert.equal(track.elevation.resolutionM,90);assert.equal(track.elevation.surveyed,false);assert.equal(track.provenance.visualHeightScale,1);
  });
  test(file+': open event geometry is continuous, physically bounded and finite',()=>{
    assert.ok(track.length>minLength&&track.length<maxLength);assert.ok(track.judgedStart>0&&track.judgedEnd<track.length);
    assert.ok(Math.hypot(track.points[0].x-track.points.at(-1).x,track.points[0].y-track.points.at(-1).y)>70);
    assert.ok(track.zones.every(z=>z.s>track.judgedStart&&z.s<track.judgedEnd&&[-1,1].includes(z.side)));
    for(let s=0;s<track.length;s+=2.5){const p=track.sample(s),q=track.project(p.x,p.y,s),surface=track.surface(p.x,p.y,s);
      assert.ok(Math.abs(q.s-s)<1e-6);assert.ok(track.contains(p.x,p.y,s));assert.ok(Math.abs(p.grade)<.05);assert.equal(p.bank,0);
      for(const field of ['x','y','z','curvature','heading','widthLeft','widthRight'])assert.ok(Number.isFinite(p[field]));
      assert.ok(Number.isFinite(surface.z)&&surface.normalZ>0&&surface.muScale===1);
    }
    const p=track.sample(120),outside={x:p.x-Math.sin(p.heading)*9,y:p.y+Math.cos(p.heading)*9};
    assert.equal(track.contains(outside.x,outside.y,120),false);
    assert.equal(Physics.failure(Catalog.get(),track,Physics.initialState(Catalog.get(),track)),null);
    assert.ok(track.obstacles.length>0);assert.ok(track.environment.structures.length>0);assert.ok(track.environment.trees.length>0);
  });
  test(file+': terrain and mapped ground faces stay below the road at sampled sections',()=>{
    const renderer=Object.create(Renderer.prototype),triangles=renderer._environmentGeometry(track).ground;
    let inspected=0,maxError=-Infinity;
    // Check actual renderer triangulation as well as DEM terrain; a large flat
    // apron/grass polygon can otherwise cover road paint despite valid vertices.
    for(let s=0;s<=track.length;s+=5)for(const offset of [-5.8,0,5.8]){const p=track.sample(s),q={x:p.x-Math.sin(p.heading)*offset,y:p.y+Math.cos(p.heading)*offset};
      for(const {vertices:[a,b,c]}of triangles){const den=cross(a,b,c);if(Math.abs(den)<1e-10)continue;
        const wa=cross(q,b,c)/den,wb=cross(a,q,c)/den,wc=1-wa-wb;if(Math.min(wa,wb,wc)<-1e-8)continue;
        maxError=Math.max(maxError,wa*a.z+wb*b.z+wc*c.z-p.z);inspected++;
      }
    }
    assert.ok(inspected>=Math.floor(track.length/5)*3);assert.ok(maxError<0,'ground covers road by '+maxError+'m');
  });
}
test('visual curb styles distinguish Ebisu painted edges and Tsukuba red/white curbs',()=>{
  const ebisu=require('./ebisu-west.js'),tsukuba=require('./tsukuba-d1.js');
  assert.equal(ebisu.environment.lines.some(line=>line.color==='#ad4945'),false);
  assert.ok(tsukuba.environment.lines.some(line=>line.color==='#ad4945'));
  assert.ok(tsukuba.environment.lines.some(line=>line.color==='#e4dfd1'));
});
