const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Boards = require('./trackside-boards.js');

const source = { sourceId: 'user-video-2023', evidence: 'Video145s: readable50 braking board' };
const straight = { length: 1000, sample: s => ({ x: s, y: 0, z: 12, angle: 0 }) };
const options = { roadDistance: (x,y) => Math.abs(y), roadClearance: 6.5 };
const datum = (label='50', extra={}) => ({ atM: 100, offset: 10, label, ...source, ...extra });
function freeze(value) { if(value && typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function normal(face) {
  const [a,b,c]=face.vertices,u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
  return {x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
}

test('distance boards preserve each3x5 numeral, face approaching traffic and stay below100faces each', () => {
  for(const angle of [0,.7,Math.PI,-Math.PI/2]) for(const [label,count] of [['50',23],['100',32],['150',31]]) {
    const road={length:1000,sample:s=>({x:s*Math.cos(angle),y:s*Math.sin(angle),z:12,angle})};
    const result=Boards.build(road,{distanceBoards:[datum(label)]},{roadDistance:()=>20,roadClearance:6.5});
    assert.equal(result.stats.boards,1);assert.equal(result.stats.digitCells,count);
    assert.equal(result.faces.length,count+12);assert.ok(result.faces.length<100);
    assert.equal(result.faces.filter(f=>f.boardPart==='front').length,1);
    assert.equal(result.faces.filter(f=>f.boardPart==='back').length,1);
    assert.equal(result.faces.filter(f=>f.boardPart==='post').length,6);
    const t={x:Math.cos(angle),y:Math.sin(angle)},right={x:-t.y,y:t.x};
    for(const face of result.faces.filter(f=>['front','digit'].includes(f.boardPart))) {
      const n=normal(face);assert.ok(n.x*t.x+n.y*t.y<0,'front winding faces upstream');
    }
    const glyphs=result.faces.filter(f=>f.boardPart==='digit');
    for(let digit=1;digit<label.length;digit++) {
      const center=i=>{const a=glyphs.filter(f=>f.digit===i).flatMap(f=>f.vertices);return a.reduce((s,p)=>s+p.x*right.x+p.y*right.y,0)/a.length;};
      assert.ok(center(digit)>center(digit-1),'digits advance toward approaching viewer right');
    }
    for(const glyph of glyphs) assert.equal(glyph.fill,'#111416');
    assert.ok(result.faces.every(f=>f.kind==='distance-board' && !('emission' in f) && !('emissive' in f)));
  }
});

test('board offset uses right normal, heights follow terrain and input geometry remains immutable', () => {
  const pose=freeze({x:20,y:30,z:15,angle:Math.PI/2});
  const road=freeze({length:1000,sample:()=>pose});
  const data=freeze({distanceBoards:[datum('150',{atM:-10,offset:12,width:1,height:1.2})]});
  const before=JSON.stringify({pose,data});
  const result=Boards.build(road,data,{roadDistance:()=>50,roadClearance:6.5,groundHeight:(x,y)=>x*.1+y*.01});
  const p=result.stats.placements[0];
  assert.equal(p.atM,990);assert.ok(Math.abs(p.x-8)<1e-9);assert.ok(Math.abs(p.y-30)<1e-9);
  assert.ok(Math.abs(p.ground-1.1)<1e-9);
  const zs=result.faces.flatMap(f=>f.vertices.map(v=>v.z));
  assert.ok(Math.abs(Math.min(...zs)-1.1)<1e-9);assert.ok(Math.abs(Math.max(...zs)-2.3)<1e-9);
  assert.equal(JSON.stringify({pose,data}),before);
  const fallback=Boards.build(road,data,{roadDistance:()=>50,roadClearance:6.5});
  assert.equal(fallback.stats.placements[0].ground,15);
});

test('boards require evidence, supported labels and finite placement data', () => {
  const data={distanceBoards:[datum('50'),datum('50',{sourceId:''}),datum('50',{evidence:[]}),datum('200'),
    datum('50',{atM:NaN}),datum('50',{offset:Infinity}),datum('50',{width:0}),datum('50',{height:-1})]};
  const r=Boards.build(straight,data,options);
  assert.equal(r.stats.boards,1);assert.equal(r.stats.rejectedUnsourced,2);assert.equal(r.stats.rejectedInvalid,5);
  assert.equal(Boards.build(straight,{distanceBoards:[datum()]},{}).stats.rejectedMissingClearance,1);
  assert.equal(Boards.build(straight,{}).faces.length,0);
  assert.throws(()=>Boards.build({length:0,sample:()=>({})},{}),/canonical road/);
});

test('whole board and post footprint cannot intrude into its road or a different parallel leg', () => {
  const atEdge=Boards.build(straight,{distanceBoards:[datum('50',{offset:6.9})]},options);
  assert.equal(atEdge.stats.boards,0,'outer corner would cross6.5m clearance');
  assert.equal(atEdge.stats.rejectedClearance,1);
  // Centre and four corners alone pass. A parallel lane at y10.25 crosses
  // the panel interior, which the bounded cell checks must still reject.
  const parallel={roadDistance:(x,y)=>Math.min(Math.abs(y),Math.abs(y-10.25)),roadClearance:.2};
  const crossed=Boards.build(straight,{distanceBoards:[datum()]},parallel);
  assert.equal(crossed.stats.boards,0);assert.equal(crossed.stats.rejectedClearance,1);
  assert.equal(Boards.build(straight,{distanceBoards:[datum()]},{...options,roadDistance:()=>NaN}).stats.boards,0);
  const safe=Boards.build(straight,{distanceBoards:[datum('50',{offset:7.2})]},options);
  assert.equal(safe.stats.boards,1);
  for(const f of safe.faces) for(const p of f.vertices) assert.ok(options.roadDistance(p.x,p.y)>=6.5);
});

test('browser global exports same build API and output is deterministic', () => {
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('./trackside-boards.js'),'utf8'),sandbox);
  assert.equal(typeof sandbox.window.TracksideBoards.build,'function');
  const data={distanceBoards:[datum('100',{evidence:['video95s','official2024photo']})]};
  assert.equal(JSON.stringify(sandbox.window.TracksideBoards.build(straight,data,options)),JSON.stringify(Boards.build(straight,data,options)));
});
