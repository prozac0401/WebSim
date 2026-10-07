const test=require('node:test'),assert=require('node:assert/strict');
const EvolutionLab=require('../evolving_vehicles/evolution-engine.js');
const Auxetic=require('../auxetic_workshop/auxetic-engine.js');

test('new courses preserve the same seeded vehicles and produce finite, reproducible races',()=>{
  const baseline=new EvolutionLab({seed:42,terrain:'flat'});
  for(const terrain of ['valley','dunes','ripple']){
    const a=new EvolutionLab({seed:42,terrain}),b=new EvolutionLab({seed:42,terrain});
    assert.deepEqual(a.genomes,baseline.genomes,'only terrain changes');
    assert.deepEqual(a.terrainPoints,b.terrainPoints);
    assert.equal(a.groundAt(a.startX),360,'safe level starting platform');
    assert.ok(a.terrainPoints.every((p,i,all)=>Number.isFinite(p.x+p.y)&&p.y>=230&&p.y<=440&&(!i||p.x>all[i-1].x)));
    assert.notDeepEqual(a.terrainPoints,baseline.terrainPoints);
    for(let i=0;i<240;i++){a.step(1/120);b.step(1/120);}
    assert.deepEqual(a.vehicles.map(v=>[v.body.position.x,v.body.position.y,v.score]),b.vehicles.map(v=>[v.body.position.x,v.body.position.y,v.score]));
    assert.ok(a.vehicles.every(v=>Number.isFinite(v.body.position.x+v.body.position.y+v.score)));
  }
});

test('decorative auxetic presets remain feasible hinged structures and reset without stale locks',()=>{
  for(const preset of ['diamond','ribbon']){
    const state=Auxetic.createState();state.locked=['h-1-2'];Auxetic.loadPreset(state,preset);
    assert.deepEqual(state.locked,[]);assert.ok(state.extension<=Auxetic.maxExtension(state.aspect));
    const g=Auxetic.geometry(state);assert.ok(Number.isFinite(g.width+g.height));
    for(const h of g.hinges){const a=g.cells[h.cell].vertices[h.vertex],b=g.cells[h.otherCell].vertices[h.otherVertex];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-9);}
    Auxetic.setExtension(state,state.extension-2);assert.ok(Auxetic.geometry(state).width<g.width);
    Auxetic.loadPreset(state,preset);assert.deepEqual(Auxetic.geometry(state),g);
  }
});
