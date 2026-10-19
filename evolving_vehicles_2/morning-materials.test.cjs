'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),{createHash}=require('node:crypto');
let data;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/models/morning-runtime.js'),'utf8'),{ManufacturerModels:{registerCompressed:s=>data=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')))}});
const sum=parts=>parts.reduce((n,p)=>n+p.triangles,0);

test('Morning paints only the four complete door window frames and B pillars from the selected plastic components',()=>{
 const frames=data.primitives.filter(p=>p.windowFrame);
 assert.equal(frames.length,4);assert.equal(sum(frames),2674);
 assert.deepEqual(frames.map(p=>p.sourcePrimitive).sort(),['Mesh221_2','Mesh222_2','Mesh223_2','Mesh224_2']);
 for(const p of frames){assert.equal(p.finishPart,'doorFrame');assert.equal(p.paint,true);assert.equal(p.material,0);assert.equal(p.textureIndex,undefined);assert.equal(p.texture,null);assert.ok(p.bounds.min[0]<-.3&&p.bounds.max[2]>1.35);}
 assert.deepEqual(data.source.windowFrameFinish.parts,{doorFrame:2674,rearDivider:260,mirrorDelta:8088,mirrorHousing:1185});
});

test('Morning rear glass dividers and both mirror housings and delta plastics are independently black',()=>{
 for(const role of ['rearDivider','mirrorDelta','mirrorHousing']){
  const parts=data.primitives.filter(p=>p.finishPart===role);assert.equal(parts.length,2,role);
  assert.deepEqual(parts.map(p=>Math.sign(p.bounds.min[1])).sort(),[-1,1],role+' exists on both sides');
  for(const p of parts){assert.equal(p.paint,false);assert.equal(p.material,2);assert.equal(p.windowFrame,undefined);assert.ok(p.color.every(c=>c<.2));assert.equal(p.textureIndex,undefined);}
 }
 for(const p of data.primitives.filter(p=>p.finishPart==='rearDivider')){
  assert.equal(p.triangles,130);assert.ok(p.bounds.min[0]>-1.03&&p.bounds.max[0]<-.97);assert.ok(p.bounds.max[2]-p.bounds.min[2]>.3,'the full divider remains black up to the frame');
 }
 assert.ok(data.primitives.filter(p=>/Glass|Mirror/i.test(p.materialName||'')).every(p=>!p.paint),'glazing and reflective mirror surfaces retain their original material');
});

test('Morning material splitting preserves every original position, normal, UV, triangle winding and body bounds',()=>{
 // Hash the ordered corners of each triangle, then sort triangles to ignore
 // primitive/index reordering. Baseline: unmodified source runtime at 6edbb59.
 const expected={Mesh221:'a912a75ca16a13a8f9e22ad378886a77096622dbc64470ab6aa6ec24f0b01860',Mesh221_2:'9da47200f07a5aab4dcf52802d0e1b1c7339d551640d9039cc1fde92afa84913',Mesh222:'ddb408478d1dbc103a3f38b6137ab8d86c04eeb8ebe72efc78dfff5737393cfd',Mesh222_2:'cc9e1d3f4f5582768e3a55a3135f0d96215d9ace9d0fd7eaceb555a46e6f326b',Mesh223_2:'600d4e735387091e8699dd19ac201674dc1d73c5b6ee9c2596c30d6edd0bcead',Mesh224_2:'ba4fd6d90e141faae031c3d797fab139a74d05f08641d75d49f13d313a545b19'};
 for(const [name,hash] of Object.entries(expected)){
  const triangles=[];for(const p of data.primitives.filter(p=>p.sourcePrimitive===name)){
   const v=Buffer.from(p.vertices,'base64'),ib=Buffer.from(p.indices,'base64'),I=p.indexType===2?Uint16Array:Uint32Array,ix=new I(ib.buffer,ib.byteOffset,ib.length/I.BYTES_PER_ELEMENT);
   for(let i=0;i<ix.length;i+=3)triangles.push(Buffer.concat(Array.from(ix.subarray(i,i+3),n=>v.subarray(n*32,n*32+32))).toString('hex'));
  }
  assert.equal(createHash('sha256').update(triangles.sort().join('')).digest('hex'),hash,name);
 }
 assert.equal(sum(data.primitives),262394);assert.equal(data.triangles,262394);
 assert.deepEqual(data.bounds,{min:[-1.7988417148590088,-.9511741399765015,0],max:[1.7988417148590088,.9507062435150146,1.503981590270996]});
});
