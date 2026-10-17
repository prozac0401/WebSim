// Chromium integration for Seoul districts and Gyeonggi municipalities.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const MunicipalIncome=require('../weekend_season2/subregion-income-data.js');
let playwright;try {playwright=require('playwright');}catch {playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8774').replace(/\/$/,''),output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-subregions');
const checks=[],errors=[],evidence={};fs.mkdirSync(output,{recursive:true});
const state=page=>page.evaluate(()=>JSON.parse(render_game_to_text())),stored=page=>page.evaluate(()=>S2Storage.load().state),pass=label=>{checks.push(label);console.log('PASS',label);};
async function makePage(browser,mobile=false){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  await page.addInitScript(()=>{window.crypto.getRandomValues=values=>{values[0]=45;return values;};});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+'/weekend_season2/index.html');await page.waitForFunction(()=>typeof render_game_to_text==='function');return page;
}
async function reveal(page,target){const indices=await target.evaluate(element=>[...document.querySelectorAll('details')].map((details,index)=>({details,index})).filter(({details})=>details.contains(element)&&!details.open&&!details.querySelector(':scope > summary')?.contains(element)).map(({index})=>index));for(const index of indices)await page.locator('details').nth(index).locator(':scope > summary').click();}
async function click(page,selector){const target=page.locator(selector);await reveal(page,target);await target.click();}
const wonInputs=page=>page.locator('input[data-money-won]').evaluateAll(inputs=>Object.fromEntries(inputs.map(input=>[input.name,{won:Number(input.dataset.moneyWon),display:input.value}])));
async function municipality(page,province,id){if(await page.locator('[name="province"]').inputValue()!==province)await page.locator('[name="province"]').selectOption(province);await page.locator('[name="subregionId"]').selectOption(id);return state(page);}
async function snapshot(page){const s=await state(page),fields=await wonInputs(page);return {generation:s.generation,housing:s.housing,fields};}
async function shot(page,name){await page.waitForFunction(()=>!document.querySelector('#notice')?.classList.contains('visible'));await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
function incomeComparison(high,low){
 const a=high.generation.incomeOrigin.subregionIncome,b=low.generation.incomeOrigin.subregionIncome;
 assert.equal(a.baseHouseholdMonthly,b.baseHouseholdMonthly,'municipal selection preserves the original household survey draw');
 assert.ok(a.factor>b.factor);assert.ok(a.adjustedHouseholdMonthly>b.adjustedHouseholdMonthly,'local wage adjustment is visible before role floors and game support');
 for(const m of [a,b]){assert.equal(m.year,2023);assert.equal(m.adjustedHouseholdMonthly,Math.round(m.baseHouseholdMonthly*m.factor));}
}

(async()=>{
 const browser=await playwright.chromium.launch({headless:true});
 try{
  const page=await makePage(browser);await click(page,'[data-preset="worker"]');
  for(const [province,count]of [['seoul',25],['gyeonggi',31]]){
   await page.locator('[name="province"]').selectOption(province);
   const options=await page.locator('[name="subregionId"] option').evaluateAll(options=>options.filter(option=>option.value).map(option=>({id:option.value,label:option.textContent.trim()})));
   assert.equal(options.length,count);assert.equal(new Set(options.map(option=>option.id)).size,count);assert.ok(options.every(option=>/^\d{5}$/.test(option.id)));
   assert.deepEqual(options,MunicipalIncome.forProvince(province).map(row=>({id:row.id,label:row.name})));
   assert.equal(await page.locator('[data-subregion-field]').isVisible(),true);assert.equal(await page.locator('[name="subregionId"]').isDisabled(),false);
   assert.equal(await page.locator('[name="subregionId"]').evaluate(select=>select.required),true);
   evidence[province+'Options']=options;
  }
  await municipality(page,'seoul','11680');await page.locator('[name="province"]').selectOption('busan');
  assert.equal(await page.locator('[data-subregion-field]').isVisible(),false);assert.equal(await page.locator('[name="subregionId"]').isDisabled(),true);assert.equal((await state(page)).generation.subregionId,'');
  assert.doesNotMatch(await page.locator('.life-location').innerText(),/강남/);
  pass('Seoul exposes 25 districts and Gyeonggi 31 municipalities with standard codes; moving to another province hides and clears the previous subregion');

  await municipality(page,'seoul','11320');await page.locator('[name="housingTenure"]').selectOption('own');await page.locator('#rebalance-economy').click();
  const dobong=await snapshot(page);assert.equal(dobong.generation.economicProfile.active,true);
  await municipality(page,'seoul','11680');const gangnam=await snapshot(page);
  incomeComparison(gangnam,dobong);
  assert.ok(gangnam.generation.economicProfile.totalMonthly>dobong.generation.economicProfile.totalMonthly,'same-person income reflects the stronger local wage ratio');
  assert.ok(gangnam.generation.housingOrigin.propertyValue>dobong.generation.housingOrigin.propertyValue,'same-size home reflects local sale prices');
  assert.equal(gangnam.generation.housingOrigin.subregionId,'11680');assert.match(await page.locator('.life-location').innerText(),/강남구/);assert.match(await page.locator('.life-intro').innerText(),/강남구/);
  await municipality(page,'gyeonggi','41800');const yeoncheon=await snapshot(page);await municipality(page,'gyeonggi','41290');const gwacheon=await snapshot(page);
  incomeComparison(gwacheon,yeoncheon);
  assert.ok(gwacheon.generation.economicProfile.totalMonthly>yeoncheon.generation.economicProfile.totalMonthly);assert.ok(gwacheon.generation.housingOrigin.propertyValue>yeoncheon.generation.housingOrigin.propertyValue);
  assert.match(await page.locator('.life-location').innerText(),/과천시/);assert.match(await page.locator('.life-intro').innerText(),/과천시/);
  await page.locator('[name="housingTenure"]').selectOption('rent');const rent=await snapshot(page);
  assert.equal(rent.generation.housingOrigin.municipalModel.rentBasis,'provincial-rent-jeonse-ratio-proxy');assert.equal(rent.generation.housingOrigin.municipalModel.sourcePeriod,'2026-Q2');
  assert.equal(rent.generation.housingOrigin.marketReference.rentPer3_3M2Won,Math.round(54000*3939/1631));assert.ok(rent.generation.housingOrigin.monthlyRent>0);
  await page.locator('[name="housingTenure"]').selectOption('own');
  evidence.comparison={dobong,gangnam,yeoncheon,gwacheon};
  await reveal(page,page.locator('[data-subregion-basis]'));assert.match(await page.locator('[data-subregion-basis]').innerText(),/2023/);assert.match(await page.locator('[data-subregion-basis]').innerText(),/게임|모형/);
  await reveal(page,page.locator('[data-subregion-housing-basis]'));assert.match(await page.locator('[data-subregion-housing-basis]').innerText(),/2026/);assert.match(await page.locator('[data-subregion-housing-basis]').innerText(),/추정/);
  await shot(page,'municipal-comparison-desktop');
  pass('active budgets and housing change between Gangnam/Dobong and Gwacheon/Yeoncheon while location text and dated model assumptions identify the chosen place');

  await page.locator('[name="salary"]').fill('123.4567');await page.locator('[name="salary"]').press('Tab');
  await page.locator('[name="housingLoanRateBps"]').fill('4.37');await page.locator('[name="housingLoanRateBps"]').press('Tab');
  const manual=await wonInputs(page);assert.equal((await state(page)).generation.economicProfile.active,false);
  await municipality(page,'gyeonggi','41800');assert.deepEqual(await wonInputs(page),manual);assert.equal(await page.locator('[name="housingLoanRateBps"]').inputValue(),'4.37');
  await municipality(page,'seoul','11680');assert.deepEqual(await wonInputs(page),manual);assert.match(await page.locator('.life-location').innerText(),/강남구/);
  await page.locator('#rebalance-economy').focus();await page.keyboard.press('Enter');
  assert.equal((await state(page)).generation.economicProfile.active,true);assert.equal((await state(page)).generation.housingOrigin.subregionId,'11680');assert.notDeepEqual(await wonInputs(page),manual);
  await page.locator('#custom-start-btn').click();assert.equal((await state(page)).mode,'planning');
  const saved=await stored(page);assert.equal(saved.config.subregionId,'11680');
  await page.reload();await page.locator('#resume-game').click();assert.deepEqual(await stored(page),saved);
  evidence.saved={subregionId:saved.config.subregionId,housingOrigin:saved.config.housingOrigin,incomeOrigin:saved.config.incomeOrigin};
  pass('manual money and APR survive municipal and provincial changes until explicit rebalance; the selected district and exact rebuilt financial record survive save/resume');

  const mobile=await makePage(browser,true);await click(mobile,'[data-preset="worker"]');await mobile.locator('[name="province"]').selectOption('gyeonggi');
  const select=mobile.locator('[name="subregionId"]');await select.focus();await mobile.keyboard.press('End');
  const chosen=await select.inputValue();assert.match(chosen,/^\d{5}$/);assert.equal(await mobile.evaluate(()=>document.activeElement.name),'subregionId');
  assert.equal((await state(mobile)).generation.subregionId,chosen);assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await shot(mobile,'municipal-picker-mobile');await mobile.locator('#custom-start-btn').click();assert.equal((await stored(mobile)).config.subregionId,chosen);
  pass('the municipal picker works by keyboard on 390px mobile, keeps focus and starts with the selected standard code without overflow');

  const fixture=path.resolve('weekend_season2/fixtures/v5-high-graduate.json'),original=JSON.parse(fs.readFileSync(fixture,'utf8')).state;
  mobile.once('dialog',dialog=>dialog.accept());await mobile.locator('#import-file').setInputFiles(fixture);
  await mobile.waitForFunction(()=>S2Storage.load().state?.config.economicProfile===null);const imported=await stored(mobile);
  assert.ok(!imported.config.subregionId);
  for(const key of ['finance','log','rng','plan','pendingEvent'])assert.deepEqual(imported[key],original[key]);
  for(const key of ['salary','externalAllowance','fixedCosts','startCash','monthlyRent','housingLoanPrincipal','housingLoanRateBps'])assert.equal(imported.config[key],original.config[key]);
  await mobile.reload();await mobile.locator('#resume-game').click();assert.deepEqual(await stored(mobile),imported);
  assert.deepEqual(errors,[]);
  pass('an older save without a municipality imports and resumes without assigning a new district or changing money, history, pending events or random streams');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,evidence,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
