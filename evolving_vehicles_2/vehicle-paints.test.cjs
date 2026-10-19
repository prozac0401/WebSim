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
  assert.equal(p.surfaceStatus,'render-approximation');assert.ok(p.roughness>0&&p.roughness<1);assert.ok(p.clearcoat>=0&&p.clearcoat<=1);
  assert.ok(Object.isFrozen(p));assert.ok(p.sourceUrl.startsWith('https://'));
 }
 assert.equal(paints.choose('bmw_m2',4),paints.choose('bmw_m2',0));
 assert.equal(paints.choose('bmw_m2',-1),paints.get('bmw_m2').at(-1));
 assert.equal(paints.choose('missing',0),null);assert.deepEqual(paints.get('missing'),[]);
 assert.throws(()=>{paints.get('gr86')[0].hex='#000000';},TypeError);
});
test('every selectable exterior has a sourced palette and hidden exteriors stay untouched',()=>{
 const active=['g80','ioniq5','santafe','staria','carnival','morning','k5','torres','g70','supra','bmw_m2','avante_n','gr86'];
 assert.deepEqual(Object.keys(paints.lists).sort(),active.sort());
 for(const id of active){
  assert.ok(paints.get(id).length>=4,id);assert.ok(paints.provenance[id].generation,id);
  assert.equal(new Set(paints.get(id).map(p=>p.id)).size,paints.get(id).length,id+' unique IDs');
  assert.ok(paints.get(id).every(p=>p.sourceUrl&&p.name&&['solid','pearl','metallic','matte'].includes(p.finish)),id);
 }
 for(const id of ['grandeur','avante','ray','musso_ev','porter2'])assert.deepEqual(paints.get(id),[]);
});
test('only factory matte paints disable the gloss coat; GR86 and F87 remain glossy',()=>{
 for(const colors of Object.values(paints.lists))for(const p of colors){
  if(p.finish==='matte'){assert.equal(p.clearcoat,0);assert.ok(p.roughness>=.6);}
  else{assert.ok(p.clearcoat>=.95);assert.ok(p.roughness<=.2);}
 }
 assert.ok([...paints.get('gr86'),...paints.get('bmw_m2')].every(p=>p.finish!=='matte'));
 assert.equal(paints.get('santafe').find(p=>p.code==='WW2').finish,'pearl');
 assert.equal(paints.get('santafe').find(p=>p.code==='WWM').finish,'matte');
});
test('K5 availability follows the watched powertrain, including US GT color names',()=>{
 for(const id of ['k5-2.0','k5-2.0lpg','k5-2.0hev']){
  assert.deepEqual(paints.get('k5',{variantId:id}).map(p=>p.code),['SWP','C7S','AGT','ABP']);
 }
 assert.deepEqual(paints.get('k5','k5-1.6t').map(p=>p.code),['SWP','C7S','AGT','ABP','DU3','KLM']);
 const gt=paints.get('k5','k5-2.5t-gt');
 assert.ok(gt.some(p=>p.id==='steel-matte-grey'));assert.ok(gt.some(p=>p.id==='runway-red'));
 assert.ok(!gt.some(p=>p.id==='moonscape-matte-grey'));
 assert.equal(paints.choose('k5',6,{variantId:'k5-1.6t'}),paints.get('k5','k5-1.6t')[0]);
 assert.ok(Object.isFrozen(gt));
});
