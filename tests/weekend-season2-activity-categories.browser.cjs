// Chromium regression for category navigation, multi-selection and child eligibility.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
let playwright;try{playwright=require('playwright');}catch{playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8774').replace(/\/$/,''),output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-activity-categories');
const checks=[],errors=[];fs.mkdirSync(output,{recursive:true});
const pass=label=>{checks.push(label);console.log('PASS',label);};
const state=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
async function pageFor(browser,mobile=false){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
 await page.addInitScript(()=>{window.crypto.getRandomValues=values=>{values[0]=45;return values;};});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base+'/weekend_season2/index.html');await page.waitForFunction(()=>typeof render_game_to_text==='function');return page;
}
async function reveal(page,target){
 const closed=await target.evaluate(el=>[...document.querySelectorAll('details')].map((details,index)=>({details,index})).filter(({details})=>details.contains(el)&&!details.open&&!details.querySelector(':scope > summary')?.contains(el)).map(({index})=>index));
 for(const index of closed)await page.locator('details').nth(index).locator(':scope > summary').click();
}
async function click(page,selector){const target=page.locator(selector);await reveal(page,target);await target.click();}
async function choose(page,selector,value){const target=page.locator(selector);await reveal(page,target);await target.selectOption(value);}
async function fixture(page,ages=[1,5,10]){
 const saved=await page.evaluate(ages=>{
  const config={...S2Data.PRESETS[0].config,year:2026,age:40,gender:'man',maritalStatus:'married',children:ages.length,childAge:ages.length?S2Data.childStage(Math.min(...ages)):'none',childProfiles:ages.map(age=>({age,gender:'woman',militaryStatus:'none'})),careShare:20,startCash:20000000,personalBudget:10000000,salary:4000000,preferences:[],seed:444};
  return S2Storage.save(S2Engine.create(config,'worker'));
 },ages);assert.equal(saved.ok,true,saved.reason);await page.reload();await page.locator('#resume-game').click();
}
async function ids(page,selector,attribute){return (await page.locator(selector).evaluateAll((els,attr)=>els.map(el=>el.getAttribute(attr)),attribute)).sort();}
async function allCatalog(page){return page.evaluate(()=>({activities:S2Data.ACTIVITIES.filter(a=>!a.legacyOnly).map(({id,categoryId,groupId,parenting,manualOnly})=>({id,categoryId,groupId,parenting,manualOnly})),categories:S2Data.ACTIVITY_CATEGORIES,groups:S2Data.ACTIVITY_GROUPS}));}
async function shot(page,name,target){await (target?page.locator(target):page).screenshot({path:path.join(output,name+'.png'),...(target?{}:{fullPage:true})});}

(async()=>{
 const browser=await playwright.chromium.launch({headless:true});
 try{
  const page=await pageFor(browser),catalog=await allCatalog(page),allIds=catalog.activities.map(a=>a.id).sort();
  await fixture(page);
  assert.deepEqual(await ids(page,'[data-auto-preference]','data-auto-preference'),allIds);
  assert.deepEqual(await ids(page,'#quick-activity option','value'),allIds);
  assert.deepEqual(await ids(page,'[data-activity]','data-activity'),allIds);
  assert.equal(await page.locator('#auto-activity-groups [data-activity-group]').count(),2);
  assert.equal(await page.locator('#auto-activity-groups [data-activity-category]').count(),catalog.categories.length);
  assert.equal(await page.locator('#quick-activity optgroup').count(),catalog.categories.length);
  for(const item of catalog.activities.filter(a=>a.manualOnly)){
   assert.equal(await page.locator(`[data-auto-preference="${item.id}"]`).isDisabled(),true);
   assert.equal(await page.locator(`#quick-activity option[value="${item.id}"]`).isDisabled(),false);
  }
  await click(page,'.tab[data-tab="routines"]');
  assert.deepEqual(await ids(page,'#rule-form [name="activityId"] option','value'),catalog.activities.filter(a=>!a.parenting).map(a=>a.id).sort());
  assert.equal(await page.locator('#rule-form [name="activityId"] optgroup').count(),catalog.categories.length);
  await click(page,'.tab[data-tab="planner"]');
  pass(`all ${allIds.length} canonical activities occur once in eligible manual selectors; recurrence excludes the nine age-specific parenting tasks and preserves other grouped choices`);

  await choose(page,'#auto-category','creative');await click(page,'[data-auto-preference="read"]');
  await choose(page,'#auto-category','household');await click(page,'[data-auto-preference="cleaning"]');
  assert.deepEqual((await state(page)).preferences.slice().sort(),['cleaning','read']);
  for(const value of ['want','need',...catalog.categories.map(c=>c.id),'all']){
   await choose(page,'#auto-category',value);
   const expected=catalog.activities.filter(a=>value==='all'||a.categoryId===value||catalog.categories.find(c=>c.id===a.categoryId).groupId===value).map(a=>a.id).sort();
   assert.deepEqual(await ids(page,'[data-auto-preference]:visible','data-auto-preference'),expected,value+' auto filter');
   assert.deepEqual((await state(page)).preferences.slice().sort(),['cleaning','read']);
  }
  assert.equal(await page.locator('[data-auto-preference="read"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-auto-preference="cleaning"]').getAttribute('aria-pressed'),'true');
  const beforePlan=(await state(page)).plan;
  for(const value of ['want','need',...catalog.categories.map(c=>c.id),'all']){
   await choose(page,'#catalog-category',value);
   const expected=catalog.activities.filter(a=>value==='all'||a.categoryId===value||catalog.categories.find(c=>c.id===a.categoryId).groupId===value).map(a=>a.id).sort();
   assert.deepEqual(await ids(page,'[data-activity]','data-activity'),expected,value+' catalog filter');
   assert.deepEqual((await state(page)).plan,beforePlan,'filtering never adds or replaces plans');
  }
  await choose(page,'#auto-category','household');await shot(page,'desktop-category-selections','#auto-preferences');
  pass('want/need and every individual category filter preserve multiple selections and leave existing plans unchanged');

  const setup=await pageFor(browser);await click(setup,'[data-preset="worker"]');
  await reveal(setup,setup.locator('#setup-category'));
  assert.equal(await setup.locator('#setup-category option[value="parenting"]').innerText(),'가족·지인 돌봄');
  while(await setup.locator('[name="preferences"]:checked').count())await setup.locator('[name="preferences"]:checked').first().uncheck();
  await choose(setup,'#setup-category','creative');await setup.locator('[name="preferences"][value="read"]').check();
  assert.equal(await setup.locator('#setup-activity-groups [data-activity-category="creative"] .category-heading span').innerText(),'1개 선택');
  await choose(setup,'#setup-category','household');await setup.locator('[name="preferences"][value="cleaning"]').check();
  await setup.locator('[name="children"]').fill('1');await setup.locator('[name="childAge"]').selectOption('toddler');
  assert.equal(await setup.locator('#setup-category option[value="parenting"]').innerText(),'돌봄·육아');
  await choose(setup,'#setup-category','parenting');await setup.locator('[name="preferences"][value="baby_feed"]').check();
  await reveal(setup,setup.locator('[name="child-age-0"]'));await setup.locator('[name="child-age-0"]').fill('6');
  assert.equal(await setup.locator('[name="preferences"][value="baby_feed"]').count(),0);
  assert.equal(await setup.locator('[name="preferences"][value="preschool_play"]').count(),1);
  assert.equal(await setup.locator('[name="preferences"][value="read"]').isChecked(),true);
  assert.equal(await setup.locator('[name="preferences"][value="cleaning"]').isChecked(),true);
  await setup.locator('[name="child-age-0"]').fill('13');
  assert.equal(await setup.locator('#setup-category option[value="parenting"]').innerText(),'가족·지인 돌봄');
  assert.deepEqual(await ids(setup,'#setup-activity-groups [data-activity-category="parenting"] [name="preferences"]','value'),['care']);
  await choose(setup,'#setup-category','exercise');
  assert.equal(await setup.locator('[name="preferences"][value="read"]').isVisible(),false);
  await click(setup,'#custom-start-btn');
  assert.equal((await state(setup)).mode,'planning');assert.deepEqual((await state(setup)).preferences.slice().sort(),['cleaning','read']);
  pass('setup preserves checked preferences in hidden categories, refreshes counts and labels, removes obsolete child tasks, and starts with all retained choices');

  for(const ages of [[],[13],[0],[5],[10]]){
   await fixture(page,ages);
   const available=catalog.activities.filter(a=>!a.parenting||ages.some(age=>age>=a.parenting.minAge&&age<=a.parenting.maxAge)).map(a=>a.id).sort();
   assert.deepEqual(await ids(page,'[data-auto-preference]','data-auto-preference'),available);
   assert.deepEqual(await ids(page,'#quick-activity option','value'),available);
   assert.deepEqual(await ids(page,'[data-activity]','data-activity'),available);
   assert.ok(available.includes('care'));
   if(!ages.length||ages[0]===13)assert.equal(await page.locator('#auto-category option[value="parenting"]').textContent(),'가족·지인 돌봄');
   await click(page,'.tab[data-tab="routines"]');assert.deepEqual(await ids(page,'#rule-form [name="activityId"] option','value'),catalog.activities.filter(a=>!a.parenting).map(a=>a.id).sort());
  }
  pass('manual and automatic selectors hide parenting for no child or the wrong age, recurrence omits all age-specific parenting, and generic care remains available');

  const mobile=await pageFor(browser,true);await fixture(mobile,[]);
  await choose(mobile,'#auto-category','creative');await mobile.locator('[data-auto-preference="read"]').focus();await mobile.keyboard.press('Enter');
  await choose(mobile,'#auto-category','household');await mobile.locator('[data-auto-preference="cleaning"]').focus();await mobile.keyboard.press('Enter');
  assert.deepEqual((await state(mobile)).preferences.slice().sort(),['cleaning','read']);
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await shot(mobile,'mobile-category-selections','#auto-preferences');
  assert.deepEqual(errors,[]);pass('390px mobile preserves cross-category keyboard selections without horizontal overflow or browser errors');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,activityCount:allIds.length,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
