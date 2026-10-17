// Real Chromium checks for deliberate cosmetic plans, strict intervals and recovery.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
let playwright;try {playwright=require('playwright');}catch {playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8774').replace(/\/$/,''),output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-cosmetic');
const ids=['mole_removal','laser_hair_removal','ultherapy','botox','fraxel','eyelid_surgery'],checks=[],errors=[],evidence={};fs.mkdirSync(output,{recursive:true});
const state=page=>page.evaluate(()=>JSON.parse(render_game_to_text())),stored=page=>page.evaluate(()=>S2Storage.load().state),pass=label=>{checks.push(label);console.log('PASS',label);};
async function pageFor(browser,mobile=false){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
 await page.addInitScript(()=>{window.crypto.getRandomValues=values=>{values[0]=45;return values;};});
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto(base+'/weekend_season2/index.html');await page.waitForFunction(()=>typeof render_game_to_text==='function');return page;
}
async function reveal(page,target){const indices=await target.evaluate(element=>[...document.querySelectorAll('details')].map((details,index)=>({details,index})).filter(({details})=>details.contains(element)&&!details.open&&!details.querySelector(':scope > summary')?.contains(element)).map(({index})=>index));for(const index of indices)await page.locator('details').nth(index).locator(':scope > summary').click();}
async function click(page,selector){const target=page.locator(selector);await reveal(page,target);await target.click();}
async function quick(page,id){await reveal(page,page.locator('#quick-activity'));await page.locator('#quick-activity').selectOption(id);}
async function install(page,value){const result=await page.evaluate(value=>S2Storage.save(value),value);assert.ok(result.ok,result.reason);await page.reload();await page.locator('#resume-game').click();}
async function fresh(page){const value=await page.evaluate(()=>S2Engine.create({...S2Data.DEFAULT_CONFIG,year:2026,age:35,children:0,childProfiles:[],childAge:'none',salary:0,externalAllowance:0,fixedCosts:0,startCash:20000000,personalBudget:20000000,preferences:[],seed:0},'worker'));await install(page,value);return value;}
async function shot(page,name){await page.waitForFunction(()=>!document.querySelector('#notice')?.classList.contains('visible'),{},{timeout:15000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});await page.locator('[data-cosmetic-recovery]').screenshot({path:path.join(output,name+'-notice.png')});const detail=page.locator('#quick-plan-tools [data-procedure]');if(await detail.count())await detail.screenshot({path:path.join(output,name+'-details.png')});}
async function manualSlot(page,id,date,slot){await click(page,`[data-activity="${id}"]`);await click(page,`.slot[data-date="${date}"][data-slot="${slot}"]`);}

(async()=>{
 const browser=await playwright.chromium.launch({headless:true});
 try{
  const page=await pageFor(browser);await fresh(page);
  const original=await stored(page);
  for(const id of ids){
   await quick(page,id);const detail=await page.locator(`#quick-plan-tools [data-procedure="${id}"]`).innerText();
   const a=await page.evaluate(id=>S2Data.ACTIVITY_MAP[id],id);
   assert.match(detail,/게임용 설정/);assert.match(detail,/실제 시술 결과나 의학적 회복 기간이 아니/);assert.ok(detail.includes('관계 +'+a.effects.relationship));assert.ok(detail.includes(a.procedure.recoveryDays+'일'));assert.ok(detail.includes(await page.evaluate(id=>S2Data.formatMoney(S2Data.ACTIVITY_MAP[id].cost),id)));
   assert.equal(await page.locator(`[data-auto-preference="${id}"]`).isDisabled(),true);
   await click(page,'#quick-add');const added=(await state(page)).plan.at(-1);assert.equal(added.activityId,id);assert.ok(!added.automatic);
   await click(page,`.slot[data-date="${added.date}"][data-slot="${added.slot}"]`);assert.equal((await state(page)).plan.length,0);
  }
  const planned=await stored(page);assert.deepEqual(planned.finance,original.finance);assert.deepEqual(planned.rng,original.rng);assert.deepEqual(planned.stats,original.stats);
  await click(page,'.tab[data-tab="routines"]');
  await page.locator('#rule-form [name="activityId"]').selectOption('laser_hair_removal');assert.equal(await page.locator('#rule-form [name="kind"]').inputValue(),'weeks');assert.equal(await page.locator('#rule-form [name="interval"]').inputValue(),'4');
  await page.locator('#rule-form [name="activityId"]').selectOption('eyelid_surgery');assert.equal(await page.locator('#rule-form [type="submit"]').isDisabled(),false);assert.match(await page.locator('#rule-form').innerText(),/한 번/);assert.match(await page.locator('#rule-form').innerText(),/실제로 마치면.*자동 종료/);
  pass('all six procedures display costs, relationship effects and game-only recovery assumptions, can be deliberately added/cancelled without spending, remain unavailable for automatic preferences, and show correct repeat-rule limits');

  await fresh(page);await quick(page,'mole_removal');await click(page,'#quick-add');await click(page,'#step-week');
  assert.equal((await state(page)).mode,'review');let completed=await stored(page);
  const actual=completed.log.find(row=>row.type==='activity'&&row.activityId==='mole_removal');assert.ok(actual);assert.equal(actual.cost,50000);assert.equal(actual.effects.relationship,14);assert.equal(completed.finance.cash,19950000);assert.equal(completed.flags.cosmeticRecoveryUntil,'2026-01-08');
  assert.match(await page.locator('[data-cosmetic-recovery]').innerText(),/1월 8일/);assert.match(await page.locator('[data-cosmetic-recovery]').innerText(),/야외활동 제한/);
  await click(page,'#step-week');assert.equal((await state(page)).date,'2026-01-05');
  const beforeOutdoor=await stored(page);await manualSlot(page,'walk','2026-01-06','evening');assert.deepEqual(await stored(page),beforeOutdoor);assert.match(await page.locator('#notice').innerText(),/2026-01-08/);
  await manualSlot(page,'read','2026-01-06','evening');assert.equal((await state(page)).plan.find(plan=>plan.date==='2026-01-06').activityId,'read');
  completed=await stored(page);evidence.mole={activity:actual,recovery:completed.flags};
  await shot(page,'recovery-and-indoor-plan-desktop');await page.reload();await page.locator('#resume-game').click();assert.deepEqual(await stored(page),completed);
  pass('an actual completed procedure charges the advertised amount and relationship effect; its dated recovery notice blocks a chosen outdoor slot while allowing reading, and the exact state restores');

  const laser=await page.evaluate(()=>{
   const s=S2Engine.create({...S2Data.DEFAULT_CONFIG,year:2026,age:35,children:0,childProfiles:[],childAge:'none',salary:0,externalAllowance:0,fixedCosts:0,startCash:20000000,personalBudget:20000000,preferences:[],seed:0},'worker');
   const added=S2Engine.addPlan(s,{activityId:'laser_hair_removal',date:'2026-01-01',slot:'morning'});if(!added.ok)throw Error(added.reason);
   for(let i=0;i<80&&s.date<'2026-01-26';i++){if(s.phase==='review'){S2Engine.finishReview(s);continue;}const step=S2Engine.advanceAutomatic(s,{direction:'rest',maxDays:1,decisions:'auto'});if(!step.ok)throw Error(step.reason);}
   return s;
  });
  assert.equal(laser.activityCounts.laser_hair_removal,1);assert.equal(laser.date,'2026-01-26');await install(page,laser);
  const occupiedEarly=(await state(page)).plan.find(plan=>plan.date==='2026-01-28'&&plan.slot==='evening');if(occupiedEarly)await click(page,'.slot[data-date="2026-01-28"][data-slot="evening"]');
  const beforeLaser=await stored(page);await manualSlot(page,'laser_hair_removal','2026-01-28','evening');assert.deepEqual(await stored(page),beforeLaser);assert.match(await page.locator('#notice').innerText(),/2026-01-29/);
  // Any automatic rest occupying the chosen valid date can be removed normally.
  const occupied=(await state(page)).plan.find(plan=>plan.date==='2026-01-29'&&plan.slot==='evening');if(occupied)await click(page,'.slot[data-date="2026-01-29"][data-slot="evening"]');
  await manualSlot(page,'laser_hair_removal','2026-01-29','evening');assert.ok((await state(page)).plan.some(plan=>plan.activityId==='laser_hair_removal'&&plan.date==='2026-01-29'));
  evidence.laser={first:laser.log.find(row=>row.type==='activity'&&row.activityId==='laser_hair_removal'),next:(await state(page)).plan.find(plan=>plan.activityId==='laser_hair_removal')};
  pass('a genuinely recorded January 1 laser visit rejects January 28 in the calendar and permits January 29, enforcing the exact 28-day manual scheduling boundary');

  const eyelid=await page.evaluate(()=>{
   const s=S2Engine.create({...S2Data.DEFAULT_CONFIG,year:2026,age:35,children:0,childProfiles:[],childAge:'none',salary:0,externalAllowance:0,fixedCosts:0,startCash:20000000,personalBudget:20000000,preferences:[],seed:0},'worker');
   const added=S2Engine.addPlan(s,{activityId:'eyelid_surgery',date:'2026-01-01',slot:'morning'});if(!added.ok)throw Error(added.reason);
   S2Engine.advance(s);if(s.phase!=='review')throw Error('Expected a completed first week');S2Engine.finishReview(s);return s;
  });
  assert.equal(eyelid.activityCounts.eyelid_surgery,1);await install(page,eyelid);await quick(page,'eyelid_surgery');
  assert.match(await page.locator('#quick-plan-tools [data-procedure="eyelid_surgery"]').innerText(),/이미 마쳤거나/);
  const beforeRepeat=await stored(page);await click(page,'#quick-add');assert.deepEqual(await stored(page),beforeRepeat);assert.match(await page.locator('#notice').innerText(),/한 삶에서 한 번/);
  pass('a completed eyelid surgery remains unavailable for a second manual appointment after save/resume');

  const mobile=await pageFor(browser,true),serialized=await page.evaluate(s=>S2Storage.serialize(s),completed);
  const chooserPromise=mobile.waitForEvent('filechooser');await mobile.locator('#import-save').click();const chooser=await chooserPromise;await chooser.setFiles({name:'procedure-recovery.json',mimeType:'application/json',buffer:Buffer.from(serialized)});
  await mobile.waitForFunction(()=>JSON.parse(render_game_to_text()).mode==='planning');assert.deepEqual(await stored(mobile),completed);assert.match(await mobile.locator('[data-cosmetic-recovery]').innerText(),/1월 8일/);
  await manualSlot(mobile,'run','2026-01-07','evening');assert.deepEqual(await stored(mobile),completed);
  await quick(mobile,'mole_removal');assert.match(await mobile.locator('#quick-plan-tools [data-procedure="mole_removal"]').innerText(),/게임용 설정/);assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await shot(mobile,'procedure-recovery-mobile');await mobile.reload();await mobile.locator('#resume-game').focus();await mobile.keyboard.press('Enter');assert.deepEqual(await stored(mobile),completed);
  assert.deepEqual(errors,[]);pass('mobile import and keyboard resume preserve the real recovery interval and blocked outdoor plans with readable procedure details, no overflow and no browser errors');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,evidence,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
