/** Download unmodified official Hyundai turntable images and rebuild calibrated
 * photo-derived meshes. This is not manufacturer CAD. Run from repository root:
 * node evolving_vehicles_2/assets/models/build-hyundai-additions.mjs --download
 * PYTHONPATH=output/model-python python .../reconstruct-hyundai.py
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const definitions = [
 {id:'avante',code:'FN01',color:'SAW',page:'https://www.hyundai.com/kr/ko/e/vehicles/the-all-new-avante/intro'},
 {id:'grandeur',code:'GN11',color:'WBP',page:'https://www.hyundai.com/kr/ko/e/vehicles/the-new-grandeur/intro'},
 {id:'porter2',code:'M575',color:'ZV',frames:1,page:'https://www.hyundai.com/kr/ko/e/vehicles/porter2/intro'}
];
const sources={retrievedAt:'2026-10-14',purpose:'Unmodified official 60-frame turntable photographs for calibrated silhouette reconstruction. These are copyrighted manufacturer photographs, not manufacturer 3D mesh files. No open redistribution license is claimed.',models:[]};
for(const definition of definitions){
 const folder=path.join(root,definition.id,'turntable');fs.mkdirSync(folder,{recursive:true});
 const assets=[];
 for(let base=1;base<=(definition.frames||60);base+=6){
  await Promise.all(Array.from({length:Math.min(6,(definition.frames||60)+1-base)},async(_,i)=>{
   const frame=base+i,file=String(frame).padStart(3,'0')+'.png',url=`https://www.hyundai.com/contents/vr360/${definition.code}/exterior/${definition.color}/${file}`,target=path.join(folder,file);
   let bytes;
   if(fs.existsSync(target))bytes=fs.readFileSync(target);else{
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`${response.status} ${url}`);
    bytes=Buffer.from(await response.arrayBuffer());if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error(`Not PNG: ${url}`);fs.writeFileSync(target,bytes);
   }
   assets.push({frame,url,file:`${definition.id}/turntable/${file}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }));
 }
 sources.models.push({...definition,assets:assets.sort((a,b)=>a.frame-b.frame)});console.log(definition.id,assets.length,'official PNG frames');
}
fs.writeFileSync(path.join(root,'hyundai-additions-sources.json'),JSON.stringify(sources,null,2)+'\n');
