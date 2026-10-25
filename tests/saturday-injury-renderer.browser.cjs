// Anatomical side and physical support tests, independent of game-state randomness.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let playwright;try{playwright=require('playwright');}catch{playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const out=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/saturday-injury-renderer');
const checks=[],errors=[];const pass=name=>{checks.push(name);console.log('PASS',name);};
const layouts=['window-left','window-right','wide-living','compact-studio'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await playwright.chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setContent('<style>body{margin:0;background:#f6eddb;font:16px sans-serif;color:#253e42}#source{display:block;width:960px;height:500px}#pairs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:12px}article{background:#eee6d5;padding:8px}article img{width:100%;display:block}h3{margin:4px}</style><div id="pairs"></div><canvas id="source"></canvas>');
  await page.addScriptTag({path:path.resolve('stopped_saturday/movement-scene.js')});
  await page.evaluate(()=>{Math.random=()=>{throw Error('No frame randomness');};window.renderer=SaturdayScene.create(document.querySelector('#source'));});
  const fallback=await page.evaluate(()=>{
   const rows=[];for(const injuredSide of [undefined,'invalid','right']){renderer.setScene({kind:'stand',location:'hall',injuredSide,minuteOfDay:612});renderer.finish();rows.push({snapshot:renderer.snapshot(),image:document.querySelector('#source').toDataURL()});}return rows;
  });
  for(const row of fallback){assert.equal(row.snapshot.bracedLeg,'right');assert.equal(row.snapshot.supportingLeg,'left');assert.deepEqual(row.snapshot.cast.ankle,row.snapshot.rightFoot);assert.equal(row.image,fallback[0].image);assert.deepEqual(row.snapshot,fallback[0].snapshot);}
  assert.deepEqual(fallback[0].snapshot.leftFoot,[397,385]);assert.deepEqual(fallback[0].snapshot.rightFoot,[434,368]);
  pass('Missing/invalid injury uses the unchanged right-injury standing geometry and image');
  const samples=await page.evaluate(layouts=>{
   const rows=[];
   const inputs=[];
   for(const roomLayout of layouts){
    for(const kind of ['stand','sit','desk','phone','rest','observe'])inputs.push({kind,location:'room',roomLayout});
    for(const destinationPose of [null,'sit','desk','observe','rest'])inputs.push({kind:'walk',location:'room',roomLayout,destinationPose});
   }
   for(const location of ['hall','street'])for(const destinationPose of [null,'sit'])inputs.push({kind:'walk',location,destinationPose});
   for(const destinationPose of [null,'sit'])inputs.push({kind:'stairs',location:'stairs',destinationPose});
   for(const injuredSide of ['right','left'])for(const fatigue of [0,8])for(const input of inputs){
    const source={...input,injuredSide,appearance:{gender:'female',hairStyle:'bun'},minuteOfDay:612,body:{ankle:6,shoulder:fatigue,back:fatigue,goodLeg:fatigue},energyBefore:6,energyAfter:3};
    const original=JSON.stringify(source);renderer.setReducedMotion(false);renderer.setScene(source);
    let frames=0,unsupported=0,injuredContacts=0,penetrations=0,outside=0,sideMismatches=0,supportMismatches=0,maxJump=0,maxAnkleJump=0;
    let previous=renderer.snapshot();const floor=x=>input.kind==='stairs'?430-Math.max(0,Math.min(4,Math.floor((x-360)/74)+1))*25:392;
    do{
     const s=renderer.snapshot(),injured=s[injuredSide+'Foot'],healthy=s[(injuredSide==='left'?'right':'left')+'Foot'];frames++;
     if(!s.contacts.leftFoot&&!s.contacts.rightFoot&&!s.contacts.crutches&&!s.contacts.seat&&!s.contacts.handrail)unsupported++;
     if(s.contacts[injuredSide+'Foot'])injuredContacts++;
     if(injured[1]+7>=floor(injured[0]+23)-.1)penetrations++;
     if(healthy[1]+7>floor(healthy[0]+23)+.1)penetrations++;
     if(input.kind==='stairs'&&s.stairs.crutchTip[1]>floor(s.stairs.crutchTip[0])+.1)penetrations++;
     if(injured[0]-11<0||injured[0]+27>960||healthy[0]-11<0||healthy[0]+27>960)outside++;
     if(s.bracedLeg!==injuredSide||s.supportingLeg===injuredSide||JSON.stringify(s.cast.ankle)!==JSON.stringify(injured))sideMismatches++;
     if(s.support.startsWith(injuredSide+'-foot'))supportMismatches++;
     maxJump=Math.max(maxJump,Math.hypot(s.x-previous.x,s.y-previous.y));
     maxAnkleJump=Math.max(maxAnkleJump,Math.hypot(injured[0]-previous[injuredSide+'Foot'][0],injured[1]-previous[injuredSide+'Foot'][1]));
     previous=s;if(!s.moving)break;renderer.advance(5);
    }while(frames<10000);
    const end=renderer.snapshot();renderer.advance(60000);const stable=JSON.stringify(end)===JSON.stringify(renderer.snapshot());
    renderer.setScene(source);renderer.setReducedMotion(true);const reduced=renderer.snapshot();renderer.advance(60000);const reducedStable=JSON.stringify(reduced)===JSON.stringify(renderer.snapshot());
    renderer.finish();renderer.setReducedMotion(false);const finished=renderer.snapshot();
    rows.push({input,injuredSide,fatigue,frames,unsupported,injuredContacts,penetrations,outside,sideMismatches,supportMismatches,maxJump,maxAnkleJump,stable,reducedStable,noReplay:!finished.moving,inputUnchanged:original===JSON.stringify(source),end,reduced});
   }return rows;
  },layouts);
  fs.writeFileSync(path.join(out,'samples.json'),JSON.stringify(samples,null,2));
  for(const r of samples){
   const tag=JSON.stringify({input:r.input,side:r.injuredSide,fatigue:r.fatigue});
   for(const key of ['unsupported','injuredContacts','penetrations','outside','sideMismatches','supportMismatches'])assert.equal(r[key],0,key+' '+tag);
   assert.ok(r.maxJump<2,'hip jump '+tag);assert.ok(r.maxAnkleJump<4,'ankle jump '+tag);
   assert.equal(r.stable,true);assert.equal(r.reducedStable,true);assert.equal(r.noReplay,true);assert.equal(r.inputUnchanged,true);
   const foot=r.end[r.injuredSide+'Foot'];
   if(r.input.kind==='rest'||r.input.destinationPose==='rest'){
    const c=r.end.roomAnchors.castCushion;assert.equal(r.end.contacts.cushion,true);assert.equal(foot[1]+7,c.y);assert.ok(foot[0]>=c.x&&foot[0]+23<=c.x+c.width);
   }
   assert.deepEqual(r.reduced.leftFoot,r.end.leftFoot);assert.deepEqual(r.reduced.rightFoot,r.end.rightFoot);assert.deepEqual(r.reduced.joints,r.end.joints);
  }
  pass('Both injury sides remain nonweightbearing through all rooms/short actions/walks/stairs; opposite leg, crutches, handrail or seat supports every 5ms frame');
  pass('All reduced-motion and finish paths settle at the same anatomical pose, with cast cushions aligned and no replay/input mutation');
  const visual=await page.evaluate(()=>{
   const source=document.querySelector('#source'),ctx=source.getContext('2d'),rows=[];
   const configs=[{name:'stand',kind:'stand',location:'hall',time:1900},{name:'walk',kind:'walk',location:'room',time:2100},{name:'rest',kind:'rest',location:'room',time:3000},{name:'desk',kind:'desk',location:'room',time:1900},{name:'stairs',kind:'stairs',location:'stairs',time:4200},{name:'landing',kind:'stairs',location:'stairs',destinationPose:'sit',time:60000}];
   for(const config of configs){const pair=[];
    for(const injuredSide of ['right','left']){
     renderer.setReducedMotion(false);renderer.setScene({...config,injuredSide,appearance:{gender:'female',hairStyle:'ponytail'},minuteOfDay:612,body:{shoulder:5,back:5,goodLeg:5}});renderer.advance(config.time);const s=renderer.snapshot();
     const image=source.toDataURL(),foot=s[injuredSide+'Foot'];
     const crop=ctx.getImageData(Math.round(foot[0]-9),Math.round(foot[1]-18),39,25).data;let plasterPixels=0;for(let i=0;i<crop.length;i+=4)if(crop[i]>185&&crop[i+1]>178&&crop[i+2]>160&&Math.max(crop[i],crop[i+1],crop[i+2])-Math.min(crop[i],crop[i+1],crop[i+2])<40)plasterPixels++;
     const card=document.createElement('article'),heading=document.createElement('h3');heading.textContent=config.name+' · '+injuredSide+' injury';const img=document.createElement('img');img.src=image;card.append(heading,img);document.querySelector('#pairs').append(card);
     pair.push({injuredSide,snapshot:s,background:[...ctx.getImageData(0,0,960,130).data],head:[...ctx.getImageData(Math.round(s.x-32),Math.round(s.y-155),90,65).data],image,plasterPixels});
    }
    rows.push({name:config.name,backgroundEqual:JSON.stringify(pair[0].background)===JSON.stringify(pair[1].background),headEqual:JSON.stringify(pair[0].head)===JSON.stringify(pair[1].head),imageDifferent:pair[0].image!==pair[1].image,pair:pair.map(({background,head,image,...p})=>p)});
   }return rows;
  });
  for(const r of visual){assert.equal(r.backgroundEqual,true,'room and signs do not mirror');assert.equal(r.headEqual,true,'face and travel direction unchanged');assert.equal(r.imageDifferent,true);for(const p of r.pair)assert.ok(p.plasterPixels>80,`${r.name} ${p.injuredSide} cast visible`);}
  await page.locator('#pairs').screenshot({path:path.join(out,'both-injury-sides.png')});
  pass('Cast stays visible on the selected anatomical leg in six paired poses; backgrounds, lettering and facing direction remain unchanged');
  await page.evaluate(()=>document.querySelector('#pairs').remove());
  for(const injuredSide of ['right','left'])for(const roomLayout of layouts){
   await page.evaluate(({injuredSide,roomLayout})=>{renderer.setScene({kind:'rest',location:'room',roomLayout,injuredSide,minuteOfDay:612,appearance:{gender:'male',hairStyle:'bob'}});renderer.finish();},{injuredSide,roomLayout});
   await page.locator('#source').screenshot({path:path.join(out,roomLayout+'-'+injuredSide+'-rest.png')});
  }
  await page.setViewportSize({width:320,height:200});await page.evaluate(()=>{document.querySelector('#source').style.width='320px';document.querySelector('#source').style.height='auto';});
  for(const injuredSide of ['right','left']){
   await page.evaluate(injuredSide=>{renderer.setScene({kind:'walk',location:'room',roomLayout:'compact-studio',injuredSide,appearance:{gender:'female',hairStyle:'bun'},minuteOfDay:612});renderer.advance(1900);},injuredSide);
   await page.locator('#source').screenshot({path:path.join(out,injuredSide+'-320.png')});
  }
  assert.deepEqual(errors,[]);pass('Four room cast-rest pairs and both 320px walking scenes render without browser errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,totalFrames:samples.reduce((a,r)=>a+r.frames,0),cases:samples.length,visual},null,2));
 }finally{await browser.close();}
})().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,error:error.stack},null,2));console.error(error);process.exitCode=1;});
