'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Fitness=require('./fitness.js'),Tracks=require('./track.js'),Renderer=require('./renderer.js');

test('rendered eligible ranges match base scoring and powered exits on every course',()=>{
  for(const track of Tracks.list({includeDevelopment:true})){
    const ranges=Renderer.scoringRanges(track),exits=Fitness.exitZones(track);
    for(let s=0;s<=track.length;s+=.5){
      const scored=s>=track.judgedStart&&s<=track.judgedEnd||exits.some(z=>s>=z.exit&&s<=z.end);
      assert.equal(ranges.some(r=>s>=r.start&&s<=r.end),scored,track.id+' at '+s);
    }
    for(let i=1;i<ranges.length;i++)assert.ok(ranges[i].start>ranges[i-1].end);
    assert.ok(ranges.every(r=>r.start>=0&&r.end<=track.length));
  }
});

test('range union preserves gaps and clips invalid or out-of-course intervals',()=>{
  const original=globalThis.DriftFitness;
  try{
    globalThis.DriftFitness={exitZones:()=>[{exit:35,end:60},{exit:55,end:75},{exit:90,end:120},{exit:NaN,end:80},{exit:80,end:70}]};
    assert.deepEqual(Renderer.scoringRanges({length:100,judgedStart:20,judgedEnd:40}),[{start:20,end:75},{start:90,end:100}]);
  }finally{globalThis.DriftFitness=original;}
});

test('actual earning trace uses recorded positions, exact timeline alignment and no future path',()=>{
  const frames=[{time:0,x:0,y:1},{time:1,x:10,y:3},{time:2,x:20,y:7}],timeline=[{time:0,earning:false},{time:1,earning:true},{time:2,earning:false}];
  assert.deepEqual(Renderer.scoringTrace(frames,timeline,0),[]);
  assert.equal(Renderer.scoringTrace(frames,timeline,.5)[0].earning,false,'partial interval cannot reveal the next score sample');
  assert.equal(Renderer.scoringTrace(frames,timeline,1)[0].earning,true,'completed interval agrees with the score panel');
  assert.deepEqual(Renderer.scoringTrace(frames,timeline,1.5),[
    {a:{x:0,y:1},b:{x:10,y:3},earning:true},{a:{x:10,y:3},b:{x:15,y:5},earning:false}
  ]);
  assert.equal(Renderer.scoringTrace({frames},timeline,4).length,2);
  assert.deepEqual(Renderer.scoringTrace(frames,undefined,2),[]);
  assert.deepEqual(Renderer.scoringTrace(frames,timeline.slice(1),2),[]);
  assert.deepEqual(Renderer.scoringTrace(frames,[timeline[0],{time:3,earning:true},timeline[2]],2),[]);
});

test('scoring ribbons share the depth decal path, follow elevation and leave source geometry intact',()=>{
  const renderer=new Renderer({getContext:()=>({}),width:960,height:620}),track=Tracks.get(),original=JSON.stringify(track.points),layout=renderer._track(track);
  assert.equal(renderer._track(track),layout,'track decorations are cached');
  assert.equal(JSON.stringify(track.points),original,'source points are read-only');
  assert.equal(layout.scoreBands[0].eligible,false);assert.equal(layout.scoreBands.at(-1).eligible,false);
  assert.equal(layout.scoreBands[0].start,0);assert.equal(layout.scoreBands.at(-1).end,track.length);
  for(let i=1;i<layout.scoreBands.length;i++)assert.equal(layout.scoreBands[i-1].end,layout.scoreBands[i].start);
  const overlays=layout.geometry.decals.filter(face=>face.scoreOverlay);assert.ok(overlays.length>100);
  for(const face of overlays){
    assert.ok(layout.groundMesh.faces.includes(face));assert.ok(layout.occluders.faces.includes(face));
    for(const p of face.vertices){assert.ok(Number.isFinite(p.z));assert.ok(Math.abs(p.z-track.surface(p.x,p.y).z-.036)<1e-6);}
  }
  assert.ok(new Set(overlays.map(f=>f.fill)).size===2);
});
