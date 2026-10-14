import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
for(const [id,category,color,trim] of [['torres','200000100010001',6,0],['musso_ev','200000100030003',2,0]]){
 const api=`https://web.kg-mobility.com/app/display/getCarDetailContents.do?dispCatNo=${category}`;
 const response=await fetch(api);if(!response.ok)throw Error(`${response.status} ${api}`);
 const metadata=await response.json(),list=metadata.body.exterior.color.img360[color].fillerList[trim].imgList;
 const folder=path.join(root,'assets/reference/turntable',id);await fs.mkdir(folder,{recursive:true});
 const manifest={retrievedAt:new Date().toISOString(),id,sourcePage:`https://www.kg-mobility.com/pr/model/show-room/${category}`,sourceData:api,frames:list.length,frameStepDegrees:360/list.length,assets:[]};
 let next=0;await Promise.all(Array.from({length:6},async()=>{
  while(next<list.length){const i=next++,asset=list[i],r=await fetch(asset.imgUrl);if(!r.ok)throw Error(`${r.status} ${asset.imgUrl}`);const b=Buffer.from(await r.arrayBuffer());await fs.writeFile(path.join(folder,`${i+1}.png`),b);manifest.assets[i]={frame:i+1,url:asset.imgUrl,description:asset.sbstTxt,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};}
 }));
 await fs.writeFile(path.join(folder,'sources.json'),JSON.stringify(manifest,null,2)+'\n');console.log(id,list.length,'public turntable PNG frames downloaded');
}
