// Actual browser checks for divorced parents, low incomes and published v4 saves.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let playwright;
try{playwright=require('playwright');}catch{playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8766').replace(/\/$/,'');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-divorced');
const fixturePath=path.resolve('weekend_season2/fixtures/v4-low-income-parent.json');
fs.mkdirSync(output,{recursive:true});

(async()=>{
  const browser=await playwright.chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
  // Fix the documented life-generation seed while exercising the normal UI.
  await page.addInitScript(()=>{window.crypto.getRandomValues=array=>{array[0]=169;return array;};});
  const errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
  const saved=()=>page.evaluate(()=>S2Storage.load());
  const pass=message=>{checks.push(message);console.log('PASS',message);};
  try{
    await page.goto(base+'/weekend_season2/index.html');
    assert.match(await page.locator('.life-byline').innerText(),/이혼 · 자녀 1명/);
    assert.match(await page.locator('.life-intro').innerText(),/이혼/);
    assert.doesNotMatch(await page.locator('.life-intro').innerText(),/미혼/);
    let current=await state();
    assert.equal(current.maritalStatus,'divorced');
    assert.equal(current.scene.family.maritalStatus,'divorced');
    assert.equal(current.scene.family.spouse,null);
    assert.equal(current.scene.family.childCount,1);
    const start=await page.locator('#start-btn').boundingBox();
    assert.ok(start.y+start.height<=844);
    await page.screenshot({path:path.join(output,'generated-low-income-parent.png'),fullPage:true});
    await page.locator('#start-btn').click();
    let record=await saved();assert.equal(record.ok,true,record.reason);
    assert.deepEqual(Object.fromEntries(['salary','externalAllowance','fixedCosts','personalBudget','startCash','monthlyRent','housingLoanPrincipal','housingLoanRateBps'].map(k=>[k,record.state.config[k]])),
      {salary:0,externalAllowance:14587,fixedCosts:2459,personalBudget:3937,startCash:13630,monthlyRent:3502,housingLoanPrincipal:320000,housingLoanRateBps:550});
    await page.locator('#state-details>summary').click();
    assert.match(await page.locator('.family-context').innerText(),/이혼 · 자녀 1명/);
    pass('generated parent is described as divorced with no spouse while the same low income, expenses and debt are preserved');

    await page.evaluate(()=>S2Storage.clear());await page.reload();
    await page.locator('#advanced-settings>summary').click();
    await page.locator('[data-preset=worker]').click();
    await page.locator('[name=children]').fill('2');
    await page.locator('[name=childAge]').selectOption('school');
    await page.locator('[name=maritalStatus]').selectOption('divorced');
    assert.match(await page.locator('.life-byline').innerText(),/이혼 · 자녀 2명/);
    assert.match(await page.locator('.life-intro').innerText(),/이혼 후 자녀 2명과 함께/);
    current=await state();assert.equal(current.scene.family.spouse,null);assert.equal(current.scene.family.childCount,2);
    await page.locator('[name=maritalStatus]').selectOption('married');
    assert.ok((await state()).scene.family.spouse);
    await page.locator('[name=maritalStatus]').selectOption('single');
    assert.match(await page.locator('.life-byline').innerText(),/미혼 · 자녀 2명/);
    assert.equal((await state()).scene.family.spouse,null,'a deliberately chosen unmarried parent remains available');
    const status=page.locator('[name=maritalStatus]');await status.focus();await status.press('ArrowDown');await status.press('ArrowDown');
    assert.equal(await status.inputValue(),'divorced','keyboard can select divorced');
    await page.locator('#custom-start-btn').click();
    record=await saved();assert.equal(record.ok,true,record.reason);assert.equal(record.state.config.maritalStatus,'divorced');assert.equal(record.state.config.children,2);
    assert.equal((await state()).scene.family.spouse,null);
    await page.screenshot({path:path.join(output,'manual-divorced-family.png'),fullPage:true});
    pass('manual divorced choice updates the introduction and family, keyboard selection works and deliberate single-parent settings remain possible');

    const original=JSON.parse(fs.readFileSync(fixturePath,'utf8')).state;
    assert.equal(original.config.maritalStatus,'single');assert.equal(original.config.children,1);
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#import-file').setInputFiles(fixturePath);
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).mode==='event');
    record=await saved();assert.equal(record.ok,true,record.reason);
    assert.equal(record.state.config.maritalStatus,'divorced');
    assert.equal(record.state.config.externalAllowance,65230);assert.equal(record.state.config.fixedCosts,42563);
    assert.deepEqual(record.state.config.childProfiles,original.config.childProfiles);
    assert.deepEqual(record.state.finance,original.finance);
    assert.deepEqual(record.state.log,original.log);
    assert.deepEqual(record.state.pendingEvent,original.pendingEvent);
    assert.deepEqual(record.state.rng,original.rng);
    assert.match(record.state.config.lifeIntro,/이혼/);
    assert.doesNotMatch(record.state.config.lifeIntro,/미혼/);
    current=await state();assert.equal(current.scene.family.maritalStatus,'divorced');assert.equal(current.scene.family.spouse,null);assert.equal(current.scene.family.childCount,1);
    await page.locator('#state-details>summary').click();
    assert.match(await page.locator('.family-context').innerText(),/이혼 · 자녀 1명/);
    await page.locator('#state-details>summary').click();
    await page.screenshot({path:path.join(output,'published-v4-parent-restored.png'),fullPage:true});
    await page.reload();await page.locator('#resume-game').click();
    assert.equal((await state()).maritalStatus,'divorced');assert.equal((await state()).scene.family.spouse,null);
    assert.deepEqual((await saved()).state.finance,original.finance);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    assert.equal((await state()).scene.reducedMotion,true);
    pass('published v4 parent imports and resumes as divorced, preserving the child, low household amounts, pending decision and every past record');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
