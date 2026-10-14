const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sources=JSON.parse(fs.readFileSync('evolving_vehicles_2/assets/reference/SOURCES.json'));
(async()=>{for(const id of process.argv.slice(2)){
 const refs=sources.assets.filter(a=>a.id===id),template=refs.find(a=>a.frame===1);if(!template)continue;
 const target=`evolving_vehicles_2/assets/reference/turntable/${id}`;fs.mkdirSync(target,{recursive:true});
 const records=[];
 for(let frame=1;frame<=72;frame+=3){
  const url=template.url.replace(/_01\.png$/,`_${String(frame).padStart(2,'0')}.png`).replace(/\/001\.png$/,`/${String(frame).padStart(3,'0')}.png`),file=path.join(target,`${frame}.png`);
  if(!fs.existsSync(file)){const r=await fetch(url);if(!r.ok)throw Error(`${r.status} ${url}`);fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));}
  const bytes=fs.readFileSync(file);records.push({frame,url,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 }
 fs.writeFileSync(path.join(target,'SOURCES.json'),JSON.stringify({id,sourcePage:template.sourcePage,records},null,2));console.log(id,records.length);
}})().catch(e=>{console.error(e);process.exit(1)});
