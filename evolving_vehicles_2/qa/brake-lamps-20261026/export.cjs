const fs=require('fs'),vm=require('vm'),zlib=require('zlib'),path=require('path');
const root=path.resolve(__dirname,'../../..');
const generated=path.join(root,'output/brake-public-qa');
const output=process.env.BRAKE_BASELINE?path.join(generated,'baseline'):path.join(generated,'candidate');fs.mkdirSync(output,{recursive:true});
const mods=['vehicle-wheels','vehicle-drl','vehicle-paint-materials','vehicle-brake-lights'].map(n=>{if(process.env.BRAKE_BASELINE&&n==='vehicle-brake-lights'){const m={exports:{}};vm.runInNewContext(require('child_process').execFileSync('git',['show','3b3e29473d9ea2c8cdb4e3b39823f3c536d1c7e9:evolving_vehicles_2/'+n+'.js'],{cwd:root,encoding:'utf8'}),{module:m});return m.exports;}return require(root+'/evolving_vehicles_2/'+n+'.js');});
for(const id of process.argv.slice(2)){
 let d;vm.runInNewContext(fs.readFileSync(root+'/evolving_vehicles_2/assets/models/'+id+'-runtime.js','utf8'),{ManufacturerModels:{registerCompressed:s=>d=JSON.parse(zlib.gunzipSync(Buffer.from(s,'base64')))}});
 const unpack=p=>{const v=Buffer.from(p.vertices,'base64'),i=Buffer.from(p.indices,'base64'),I=p.indexType===2?Uint16Array:Uint32Array;return {...p,texture:p.texture??d.textures?.[p.textureIndex],vertices:new Float32Array(v.buffer,v.byteOffset,v.length/4),indices:new I(i.buffer,i.byteOffset,i.length/I.BYTES_PER_ELEMENT)};};
 d.primitives=d.primitives.map(unpack); if(d.fallbackPrimitives)d.fallbackPrimitives=d.fallbackPrimitives.map(unpack);
 for(const m of mods)d=m.prepare(d);
 const report=d.primitives.filter(p=>/light|lamp|glass|red|REFRACT|CheckerWhite/i.test(p.name+' '+p.materialName)&&!p.wheel).map(p=>{let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];for(const i of p.indices)for(let j=0;j<3;j++){mn[j]=Math.min(mn[j],p.vertices[8*i+j]);mx[j]=Math.max(mx[j],p.vertices[8*i+j]);}return {name:p.name,material:p.materialName,alpha:p.alpha,color:p.color,texture:!!p.texture,tag:p.brakeLight,mn,mx,tri:p.indices.length/3};});
 fs.writeFileSync(output+'/'+id+'-parts.json',JSON.stringify(report,null,2));
 const pack=p=>({...p,vertices:Buffer.from(p.vertices.buffer,p.vertices.byteOffset,p.vertices.byteLength).toString('base64'),indices:Buffer.from(p.indices.buffer,p.indices.byteOffset,p.indices.byteLength).toString('base64')});
 d.primitives=d.primitives.map(pack);delete d.fallbackPrimitives;delete d.wheelVariants;fs.writeFileSync(output+'/'+id+'.json',JSON.stringify(d));
}
