const {test} = require('node:test');
const assert = require('node:assert/strict');
const E = require('./shutter-engine.js');
test('each row starts at its own physical time, and scan reversal exchanges endpoints', () => {
  const p={...E.DEFAULTS,readout:120};
  assert.equal(E.rowStart(0,101,p),0);assert.equal(E.rowStart(100,101,p),.12);assert.equal(E.rowStart(50,101,p),.06);
  assert.equal(E.rowStart(0,101,{...p,direction:'up'}),.12);assert.equal(E.rowStart(100,101,{...p,direction:'up'}),0);
});
test('zero readout equals global exposure, including finite exposure blur',()=>{
  const p={...E.DEFAULTS,readout:0,exposure:24};
  assert.deepEqual(E.render(p,96).pixels,E.render(p,96,96,'global').pixels);
});
test('a stationary rotor is invariant under shutter timings and scan direction',()=>{
  const a=E.render({...E.DEFAULTS,speed:0},96);
  const b=E.render({...E.DEFAULTS,speed:0,readout:180,exposure:30,direction:'up'},96);
  assert.deepEqual(a.pixels,b.pixels);
});
test('an individual rolling row matches an instant taken at that row time',()=>{
  const p={...E.DEFAULTS,readout:180,exposure:0},n=81,row=19;
  const rolling=E.render(p,n),instant=E.render(p,n,n,'instant',E.rowStart(row,n,p));
  assert.deepEqual(rolling.pixels.slice(row*n*4,(row+1)*n*4),instant.pixels.slice(row*n*4,(row+1)*n*4));
});
test('nonzero readout deforms moving scene independently of exposure blur',()=>{
  const p={...E.DEFAULTS,readout:120,exposure:0};
  assert.ok(E.similarity(E.render(p,96),E.render(p,96,96,'global'))<60);
  assert.ok(E.similarity(E.render(p,96),E.render({...p,exposure:30},96))<85);
});
test('all missions are reachable, start unsolved and expose exactly their unknowns',()=>{
  for(const m of E.MISSIONS){
    const a=E.render(m.target,128),b=E.render(m.initial,128);
    assert.equal(E.similarity(a,E.render(m.target,128)),100,m.id);
    assert.ok(E.similarity(a,b)<96,m.id+' must start unsolved');
    for(const field of Object.keys(E.DEFAULTS))if(!m.editable.includes(field))assert.equal(m.target[field],m.initial[field],m.id+': fixed '+field);
  }
});
test('background does not inflate image similarity and empty images are handled',()=>{
  const blank={width:20,height:20,pixels:new Uint8ClampedArray(20*20*4)};
  for(let i=0;i<blank.pixels.length;i+=4){blank.pixels.set(E.BACKGROUND,i);blank.pixels[i+3]=255;}
  const foreground=E.render(E.DEFAULTS,20);
  assert.equal(E.similarity(blank,foreground),0);assert.equal(E.similarity(blank,blank),100);
});
test('global exposure center aligns with the center row exposure',()=>{
  const p={...E.DEFAULTS,exposure:17},n=91,row=45;
  assert.deepEqual(E.render(p,n).pixels.slice(row*n*4,(row+1)*n*4),E.render(p,n,n,'global').pixels.slice(row*n*4,(row+1)*n*4));
});
