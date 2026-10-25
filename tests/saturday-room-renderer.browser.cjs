const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let playwright;try{playwright=require('playwright');}catch{playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const out=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/saturday-rooms');
const layouts=['window-left','window-right','wide-living','compact-studio'];
const checks=[],errors=[];const pass=name=>{checks.push(name);console.log('PASS',name);};
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await playwright.chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:960,height:500},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setContent('<style>body{margin:0}canvas{display:block;width:960px;height:500px}</style><canvas id="room"></canvas>');
  await page.addScriptTag({path:path.resolve('stopped_saturday/movement-scene.js')});
  await page.evaluate(()=>{Math.random=()=>{throw Error('No frame randomness');};window.renderer=SaturdayScene.create(document.querySelector('canvas'));});
  const rooms=[];
  for(const roomLayout of layouts){
   const result=await page.evaluate(roomLayout=>{
    const scene={kind:'rest',location:'room',roomLayout,appearance:{gender:'female',hairStyle:'bob'},minuteOfDay:612,body:{shoulder:5}};
    renderer.setScene(scene);renderer.finish();return{snapshot:renderer.snapshot(),image:document.querySelector('canvas').toDataURL()};
   },roomLayout);rooms.push(result);
   assert.equal(result.snapshot.roomLayout,roomLayout);assert.equal(result.snapshot.roomLayoutApplied,true);
   const {sofa,castCushion}=result.snapshot.roomAnchors;
   assert.equal(result.snapshot.x,sofa.seatX);assert.equal(result.snapshot.y,sofa.seatY);
   assert.ok(result.snapshot.rightFoot[0]>=castCushion.x&&result.snapshot.rightFoot[0]+23<=castCushion.x+castCushion.width);
   assert.equal(result.snapshot.rightFoot[1]+7,castCushion.y,'cast rests on the cushion');
   await page.screenshot({path:path.join(out,roomLayout+'-rest.png')});
  }
  assert.equal(new Set(rooms.map(r=>r.image)).size,4);
  assert.equal(new Set(rooms.map(r=>JSON.stringify(r.snapshot.roomAnchors.window))).size,4);
  assert.equal(new Set(rooms.map(r=>JSON.stringify(r.snapshot.roomAnchors.door))).size,4);
  assert.equal(rooms[0].snapshot.roomAnchors.seats.sofa,281);assert.equal(rooms[0].snapshot.roomAnchors.seats.desk,698);
  pass('Four room plans draw different furniture arrangements; default seats and each cast cushion remain aligned');
  const items=[];
  for(const roomLayout of layouts)for(const place of ['kitchen','window','table']){
   const r=await page.evaluate(({roomLayout,place})=>{
    renderer.setScene({kind:place==='table'?'sit':'observe',location:'room',roomLayout,scenarioId:'home',context:{location:'home',actions:[{choiceId:place==='table'?'S01-table':'S01-bottle'}],items:{container:'bottle',cupLocation:place,phoneLocation:place,drinkPlace:place,carryTrips:1}},minuteOfDay:612});renderer.finish();return renderer.snapshot();
   },{roomLayout,place});
   const p=r.contextVisual.itemPositions,surface=r.roomAnchors.items.surfaces[place];
   assert.equal(p.cup[1]+17,surface);assert.equal(p.phone[1]+9,surface);assert.equal(p.bottle[1]+27,surface);
   if(place==='table')assert.equal(r.x,r.roomAnchors.seats.desk,'the table choice sits on the chair by that table');
   else assert.equal(r.x,r.roomAnchors.seats.window,'window observation uses its supporting chair/sofa');
   items.push({roomLayout,place,positions:p,surface});
   if(place==='window')await page.screenshot({path:path.join(out,roomLayout+'-window-items.png')});
  }
  pass('Kitchen/window/table objects sit on their own surfaces, and the table/window choices use matching seats');
  const contactRows=await page.evaluate(layouts=>{
   const rows=[];
   for(const roomLayout of layouts)for(const fatigue of [0,8])for(const destinationPose of ['sit','desk','observe']){
    const input={kind:'walk',location:'room',roomLayout,destinationPose,appearance:{gender:'male',hairStyle:'ponytail'},minuteOfDay:612,body:{shoulder:fatigue,goodLeg:fatigue},energyBefore:6,energyAfter:3};
    const raw=JSON.stringify(input);renderer.setReducedMotion(false);renderer.setScene(input);
    let frames=0,unsupported=0,outside=0,maxJump=0,previous=renderer.snapshot();
    while(renderer.snapshot().moving){renderer.advance(10);const s=renderer.snapshot();frames++;
     if(!s.contacts.leftFoot&&!s.contacts.crutches&&!s.contacts.seat)unsupported++;
     if(s.x<40||s.rightFoot[0]+23>960)outside++;
     maxJump=Math.max(maxJump,Math.hypot(s.x-previous.x,s.y-previous.y));previous=s;
    }
    const end=renderer.snapshot();renderer.advance(60000);const stable=JSON.stringify(end)===JSON.stringify(renderer.snapshot());
    renderer.setScene(input);renderer.setReducedMotion(true);const reduced=renderer.snapshot();renderer.advance(60000);const reducedStable=JSON.stringify(reduced)===JSON.stringify(renderer.snapshot());renderer.setReducedMotion(false);
    rows.push({roomLayout,fatigue,destinationPose,frames,unsupported,outside,maxJump,stable,reducedStable,inputUnchanged:JSON.stringify(input)===raw,end});
   }return rows;
  },layouts);
  for(const r of contactRows){
   assert.equal(r.unsupported,0);assert.equal(r.outside,0);assert.ok(r.maxJump<2);assert.equal(r.end.support,'seat');assert.equal(r.stable,true);assert.equal(r.reducedStable,true);assert.equal(r.inputUnchanged,true);
   const expected=r.destinationPose==='desk'?r.end.roomAnchors.seats.desk:r.destinationPose==='observe'?r.end.roomAnchors.seats.window:r.end.roomAnchors.seats.sofa;
   assert.equal(r.end.x,expected);assert.equal(r.end.y,327);
   if(r.destinationPose==='desk'){assert.equal(r.end.joints.rightHand[0],r.end.roomAnchors.workSurface.x);assert.equal(r.end.joints.rightHand[1],r.end.roomAnchors.workSurface.y);}
  }
  pass('Walking reaches each anchored seat/desk with continuous support, no teleport and unchanged reduced-motion behavior');
  const invariant=await page.evaluate(layouts=>{
   const rows=[];
   for(const input of [{kind:'walk',location:'hall'},{kind:'walk',location:'street'},{kind:'stairs',location:'stairs',destinationPose:'sit'},{kind:'sit',location:'room',scenarioId:'doors',context:{location:'cafe',items:{cupLocation:'kitchen'}}},{kind:'stand',location:'hall',encounter:{kind:'kiosk'}}]){
    const variants=layouts.map(roomLayout=>{renderer.setScene({...input,roomLayout,appearance:{gender:'female',hairStyle:'crop'},minuteOfDay:612});renderer.advance(1900);const s=renderer.snapshot();return{roomLayout,applied:s.roomLayoutApplied,anchors:s.roomAnchors,image:document.querySelector('canvas').toDataURL(),geometry:[s.x,s.y,s.leftFoot,s.rightFoot,s.joints,s.contacts]};});
    rows.push({input,identical:variants.every(v=>v.image===variants[0].image&&JSON.stringify(v.geometry)===JSON.stringify(variants[0].geometry)),inactive:variants.every(v=>!v.applied&&v.anchors===null)});
   }renderer.setScene({kind:'sit',location:'room',roomLayout:'invalid'});return{rows,fallback:renderer.snapshot().roomLayout};
  },layouts);
  for(const r of invariant.rows){assert.equal(r.identical,true);assert.equal(r.inactive,true);}assert.equal(invariant.fallback,'window-left');
  pass('Hall, street, stairs, cafe and kiosk rendering/geometry are identical for all stored room values');
  for(const roomLayout of layouts){
   await page.evaluate(roomLayout=>{renderer.setScene({kind:'desk',location:'room',roomLayout,appearance:{gender:'male',hairStyle:'wavy'},minuteOfDay:612});renderer.advance(1900);},roomLayout);
   await page.screenshot({path:path.join(out,roomLayout+'-desk.png')});
  }
  await page.setViewportSize({width:320,height:200});
  await page.evaluate(()=>{const c=document.querySelector('canvas');c.style.width='320px';c.style.height='auto';});
  for(const roomLayout of layouts){await page.evaluate(roomLayout=>{renderer.setScene({kind:'observe',location:'room',roomLayout,minuteOfDay:612,appearance:{gender:'female',hairStyle:'bun'}});renderer.finish();},roomLayout);await page.locator('canvas').screenshot({path:path.join(out,roomLayout+'-320.png')});}
  assert.deepEqual(errors,[]);pass('Four 320px room captures and desk activity captures render without browser errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,rooms:rooms.map(({image,...r})=>r),items,contactRows,invariant},null,2));
 }finally{await browser.close();}
})().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,error:error.stack},null,2));console.error(error);process.exitCode=1;});
