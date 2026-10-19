'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const photos=require('./vehicle-paint-photos.js'),paints=require('./vehicle-paints.js');
test('every Torres paint uses its own complete official photograph sequence or the original Latte sequence',()=>{
 const variants=photos.torres.paintVariants;
 assert.deepEqual(Object.keys(variants).sort(),paints.get('torres').map(p=>p.code).filter(c=>c!=='EBL').sort());
 const source=JSON.parse(fs.readFileSync(path.join(__dirname,'assets/models/torres-paints/sources.json'),'utf8'));
 assert.equal(source.assets.length,180);
 for(const [code,variant] of Object.entries(variants)){
  assert.equal(variant.textures.length,36);assert.equal(new Set(variant.textures).size,36);
  for(let i=0;i<36;i++){
   const item=source.assets.find(a=>a.code===code&&a.frame===i+1);
   assert.ok(item);assert.equal('evolving_vehicles_2/'+variant.textures[i],item.path);
   assert.match(item.description,new RegExp('_'+code+' ONE TONE '+String(i).padStart(3,'0')+'$'));
   const data=fs.readFileSync(path.join(__dirname,variant.textures[i]));
   assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256);
  }
 }
});
