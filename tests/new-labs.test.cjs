const test = require('node:test');
const assert = require('node:assert/strict');
const WaveField = require('../sound_maze/wave-engine.js');
const EvolutionLab = require('../evolving_vehicles/evolution-engine.js');

test('equal-distance wave sources reinforce, cancel, and match the single-source baseline', () => {
  const field = new WaveField();
  field.reset({wavelength:24,phase:0}).step(1800);
  assert.ok(field.sample().settled);
  assert.ok(Math.abs(field.sample().ratio-2)<.1);
  field.reset({wavelength:24,phase:180}).step(1800);
  assert.ok(field.sample().settled);
  assert.ok(field.sample().ratio<.1);
  field.reset({wavelength:24,enabledB:false}).step(1800);
  assert.equal(field.sample().ratio,1);
});

test('a sealed target has no baseline and cannot falsely complete a silence mission', () => {
  const walls = new Uint8Array(120*80);
  for(let y=0;y<80;y++) walls[y*120+60]=1;
  const field=new WaveField();field.reset({walls,phase:180}).step(1800);
  assert.equal(field.sample().settled,false);
  assert.ok(Number.isFinite(field.sample().ratio));
});

test('wave stepping is independent of rendering batch size', () => {
  const first=new WaveField(), second=new WaveField();
  first.step(720);for(let i=0;i<60;i++) second.step(12);
  assert.deepEqual(first.a,second.a);assert.deepEqual(first.sample(),second.sample());
});

function finish(lab,dt=1/120){for(let i=0;i<Math.ceil(lab.duration/dt)+1&&!lab.complete;i++)lab.step(dt);assert.ok(lab.complete);}
test('vehicles physically advance and elite genomes survive exactly', () => {
  const lab=new EvolutionLab({seed:42,terrain:'rolling'});
  assert.equal(lab.nextGeneration(),false);finish(lab);
  const genome=JSON.parse(JSON.stringify(lab.best.genome)),score=lab.best.score;
  assert.ok(score>500&&score<=2460);
  assert.ok(lab.vehicles.every(v=>Number.isFinite(v.body.position.x)&&Number.isFinite(v.body.position.y)));
  assert.ok(lab.nextGeneration());assert.equal(lab.generation,2);
  assert.deepEqual(lab.vehicles[0].genome,genome);finish(lab);
  assert.ok(Math.abs(lab.vehicles[0].score-score)<1e-6);
});

test('same seed and fixed time steps reproduce a race; changing terrain clears history', () => {
  const lab=new EvolutionLab({seed:99,terrain:'steps'});finish(lab,1/60);
  const scores=lab.vehicles.map(v=>v.score);lab.reset({seed:99,terrain:'steps'});finish(lab);
  assert.deepEqual(lab.vehicles.map(v=>v.score),scores);
  lab.reset({terrain:'flat'});assert.equal(lab.generation,1);assert.equal(lab.history.length,0);assert.equal(lab.time,0);
});
