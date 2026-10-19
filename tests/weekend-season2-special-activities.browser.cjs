// Chromium coverage for explicitly chosen expensive activities and incident costs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let playwright;
try {playwright=require('playwright');}
catch {playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8774').replace(/\/$/,'');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-special-activities');
const ids=['motorbike_tour','domestic_trip','golf_round','circuit_drive'],checks=[],errors=[],evidence={};
fs.mkdirSync(output,{recursive:true});
const state=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
const stored=page=>page.evaluate(()=>S2Storage.load().state);
const pass=label=>{checks.push(label);console.log('PASS',label);};
async function makePage(browser,mobile=false) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  await page.addInitScript(()=>{const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-17T12:00:00+09:00']));}static now(){return new NativeDate('2026-10-17T12:00:00+09:00').getTime();}};window.crypto.getRandomValues=values=>{values[0]=45;return values;};});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+'/weekend_season2/index.html');await page.waitForFunction(()=>typeof render_game_to_text==='function');return page;
}
async function reveal(page,target){const indices=await target.evaluate(element=>[...document.querySelectorAll('details')].map((details,index)=>({details,index})).filter(({details})=>details.contains(element)&&!details.open&&!details.querySelector(':scope > summary')?.contains(element)).map(({index})=>index));for(const index of indices)await page.locator('details').nth(index).locator(':scope > summary').click();}
async function click(page,selector){const target=page.locator(selector);await reveal(page,target);await target.click();}
async function shot(page,name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
async function load(page,poor=false){
  const result=await page.evaluate(poor=>{const config={...S2Data.PRESETS[0].config,year:2026,age:35,children:0,childProfiles:[],childAge:'none',salary:0,externalAllowance:0,fixedCosts:0,startCash:poor?0:10000000,personalBudget:poor?0:10000000,seed:444,preferences:[]};return S2Storage.save(S2Engine.create(config,'worker'));},poor);
  assert.equal(result.ok,true,result.reason);await page.reload();await page.locator('#resume-game').click();
}

(async()=>{
  const browser=await playwright.chromium.launch({headless:true});
  try {
    const page=await makePage(browser);await load(page);
    const catalog=await page.evaluate(ids=>ids.map(id=>S2Data.ACTIVITY_MAP[id]),ids);
    for(const activity of catalog) {
      assert.ok(activity);assert.equal(activity.requiresPreference,true);assert.ok(activity.cost>0);
      assert.equal(await page.locator(`[data-auto-preference="${activity.id}"]`).isDisabled(),false);
      assert.equal(await page.locator(`[data-activity="${activity.id}"]`).isDisabled(),false);
      assert.equal(await page.locator(`#quick-activity option[value="${activity.id}"]`).evaluate(option=>option.disabled),false);
      await reveal(page,page.locator('#quick-activity'));await page.locator('#quick-activity').selectOption(activity.id);
      assert.ok((await page.locator(`[data-special-outing="${activity.id}"]`).allTextContents()).some(text=>/자동.*계획/.test(text)));
      await reveal(page,page.locator(`[data-activity="${activity.id}"]`));const card=await page.locator(`[data-activity="${activity.id}"]`).innerText();assert.ok(card.includes(activity.name));assert.ok(card.includes(String(activity.minutes)+'분'));assert.match(card,/선택.*자동/);
      const price=await page.evaluate(id=>S2Data.formatMoney(S2Data.activityPrice(S2Storage.load().state.config,id).amount),activity.id);assert.ok(card.includes(price));
      if(activity.risk){const text=(await page.locator(`[data-activity-risk="${activity.id}"]`).allTextContents()).join('\n');assert.ok(text.includes(String(activity.risk.chance*100)+'%'));assert.match(text,/수리/);assert.match(text,/병원|치료/);assert.match(text,/가정|게임/);}
    }
    await shot(page,'special-activity-details-desktop');
    pass('all four expensive activities expose their price, duration and explicit-preference automatic status; bike/circuit risk details identify game assumptions and separate repair and medical costs');

    for(const id of ids){
      const before=(await state(page)).plan;await page.locator('#quick-activity').selectOption(id);await click(page,'#quick-add');
      const added=(await state(page)).plan.filter(item=>!before.some(old=>old.id===item.id));assert.equal(added.length,1,id+' can be deliberately planned');assert.equal(added[0].activityId,id);assert.ok(!added[0].automatic);
      await click(page,`.slot[data-date="${added[0].date}"][data-slot="${added[0].slot}"]`);
    }
    const neverAuto=await page.evaluate(ids=>{
      const config={...S2Storage.load().state.config,preferences:[]};const s=S2Engine.create(config,'worker');
      for(let i=0;i<5;i++){const result=S2Engine.advanceAutomatic(s,{maxDays:7,decisions:'auto'});if(result.ok===false)throw Error(result.reason);}
      return {plan:s.plan.filter(item=>ids.includes(item.activityId)),logs:s.log.filter(item=>item.type==='activity'&&ids.includes(item.activityId))};
    },ids);
    assert.deepEqual(neverAuto,{plan:[],logs:[]},'unselected costly activities must never appear in automatic fallback');
    await load(page,true);
    const poor=await stored(page);
    for(const id of ids){await reveal(page,page.locator('#quick-activity'));await page.locator('#quick-activity').selectOption(id);await click(page,'#quick-add');assert.equal((await state(page)).plan.length,0);assert.deepEqual((await stored(page)).finance,poor.finance);assert.match(await page.locator('#notice').innerText(),/돈|예산|현금|잔액|부족/);}
    pass('all four activities can be added manually, remain absent from automatic fallback when unselected, and are rejected without spending money when the budget cannot afford them');

    // Search a bounded deterministic seed sequence using real engine execution;
    // do not inject incident logs or charge money directly from the test.
    const incidents=await page.evaluate(ids=>{
      const result={};
      for(const id of ids) {
        for(let i=1;i<=80;i++){
          const seed=Math.imul(i,2654435761)>>>0,config={...S2Data.PRESETS[0].config,year:2026,age:35,children:0,childProfiles:[],childAge:'none',salary:0,externalAllowance:0,fixedCosts:0,startCash:10000000,personalBudget:10000000,preferences:[],seed};
          const s=S2Engine.create(config,'worker'),added=S2Engine.addPlan(s,{date:'2026-01-01',slot:'morning',activityId:id,payment:'cash'});if(!added.ok)throw Error(added.reason);
          for(let turn=0;turn<8&&!s.log.some(row=>row.type==='activity'&&row.activityId===id);turn++){const step=S2Engine.advanceAutomatic(s,{maxDays:1,decisions:'auto'});if(!step.ok)break;}
          const incident=s.log.find(row=>row.type==='incident'&&row.activityId===id);
          if(incident){result[id]={seed,state:s,incident};break;}
        }
        if(!result[id])throw Error('No completed incident fixture for '+id);
      }
      return result;
    },['motorbike_tour','circuit_drive']);
    for(const [id,fixture] of Object.entries(incidents)){
      const incident=fixture.incident;assert.ok(fixture.state.log.some(row=>row.type==='activity'&&row.activityId===id));assert.ok(incident.repairCost>0);assert.ok(incident.medicalCost>0);assert.equal(incident.total,incident.repairCost+incident.medicalCost);assert.equal(incident.paid+incident.unpaid,incident.total);assert.equal(incident.unpaid,0);assert.match(incident.reference,/^activity-incident:/);
      evidence[id]={seed:fixture.seed,incident};
    }
    const rich=incidents.motorbike_tour.state;
    const valid=await page.evaluate(s=>S2Storage.save(s),rich);assert.equal(valid.ok,true,valid.reason);
    await page.reload();await page.locator('#resume-game').click();assert.deepEqual(await stored(page),rich);
    await click(page,'#state-details > summary');
    const details=await page.locator('#state-details').innerText();assert.match(details,/수리/);assert.match(details,/병원|치료/);
    await shot(page,'recorded-incident-desktop');
    pass('deterministic completed bike and circuit activities produce real repair/medical incident logs with balanced totals, and the recorded costs survive desktop save/restore');

    const unpaid=await page.evaluate(seed=>{
      const id='motorbike_tour',cost=S2Data.ACTIVITY_MAP[id].cost,config={...S2Data.PRESETS[0].config,year:2026,age:35,children:0,childProfiles:[],childAge:'none',salary:0,externalAllowance:0,fixedCosts:0,startCash:cost+10000,personalBudget:10000000,preferences:[],seed};
      const s=S2Engine.create(config,'worker'),added=S2Engine.addPlan(s,{date:'2026-01-01',slot:'morning',activityId:id,payment:'cash'});if(!added.ok)throw Error(added.reason);
      for(let turn=0;turn<8&&!s.log.some(row=>row.type==='activity'&&row.activityId===id);turn++){const step=S2Engine.advanceAutomatic(s,{maxDays:1,decisions:'auto'});if(!step.ok)throw Error(step.reason);}
      return {state:s,incident:s.log.find(row=>row.type==='incident'&&row.activityId===id),serialized:S2Storage.serialize(s)};
    },incidents.motorbike_tour.seed);
    assert.ok(unpaid.incident);assert.ok(unpaid.incident.unpaid>0);assert.equal(unpaid.incident.total,unpaid.incident.paid+unpaid.incident.unpaid);assert.ok(unpaid.state.finance.cash>=0);
    evidence.unpaid=unpaid.incident;
    const mobile=await makePage(browser,true);
    const filePromise=mobile.waitForEvent('filechooser');await mobile.locator('#import-save').click();const file=await filePromise;await file.setFiles({name:'recorded-incident.json',mimeType:'application/json',buffer:Buffer.from(unpaid.serialized)});
    await mobile.waitForFunction(()=>JSON.parse(render_game_to_text()).mode!=='setup');assert.deepEqual(await stored(mobile),unpaid.state);
    await click(mobile,'#state-details > summary');const mobileDetails=await mobile.locator('#state-details').innerText();assert.match(mobileDetails,/수리/);assert.match(mobileDetails,/병원|치료/);assert.match(mobileDetails,/미납|미지급|남은/);
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(mobile,'unpaid-incident-mobile');
    await mobile.reload();await mobile.locator('#resume-game').click();assert.deepEqual(await stored(mobile),unpaid.state);
    assert.deepEqual(errors,[]);
    pass('an affordable outing followed by an unaffordable incident records paid and unpaid costs without negative cash, imports on mobile, and restores the exact history without overflow or browser errors');
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,evidence,errors},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
