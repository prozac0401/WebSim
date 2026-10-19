'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const paints=require('./vehicle-paints.js');
test('F87 launch palette excludes later-generation colors and retains official finish/code pairs',()=>{
 assert.deepEqual(paints.get('bmw_m2').map(p=>[p.code,p.finish]),[['C16','metallic'],['300','solid'],['475','metallic'],['B39','metallic']]);
 assert.match(paints.provenance.bmw_m2.generation,/F87/);
 assert.ok(paints.provenance.bmw_m2.sourceUrls.every(u=>/^https:\/\/(www\.press\.bmwgroup\.com|www\.bmw\.ie)\//.test(u)));
});
test('early ZN8 palette includes pearl white and all seven ordinary Toyota color codes',()=>{
 assert.deepEqual(new Set(paints.get('gr86').map(p=>p.code)),new Set(['DCK','D4S','K1X','DAR','G1U','P8Y','WCH']));
 assert.equal(paints.get('gr86').find(p=>p.code==='K1X').finish,'pearl');
 assert.match(paints.provenance.gr86.modelYears,/2023/);
});
test('paint selection is deterministic, immutable and labels approximations honestly',()=>{
 for(const id of Object.keys(paints.lists))for(const p of paints.get(id)){
  assert.match(p.hex,/^#[0-9a-f]{6}$/i);assert.equal(p.rgbStatus,'estimated-display-color');
  assert.equal(p.surfaceStatus,'render-approximation');assert.ok(p.roughness>0&&p.roughness<1);assert.ok(p.clearcoat>0&&p.clearcoat<=1);
  assert.ok(Object.isFrozen(p));assert.ok(p.sourceUrl.startsWith('https://'));
 }
 assert.equal(paints.choose('bmw_m2',4),paints.choose('bmw_m2',0));
 assert.equal(paints.choose('bmw_m2',-1),paints.get('bmw_m2').at(-1));
 assert.equal(paints.choose('missing',0),null);assert.deepEqual(paints.get('missing'),[]);
 assert.throws(()=>{paints.get('gr86')[0].hex='#000000';},TypeError);
});
