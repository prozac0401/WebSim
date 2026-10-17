const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
let pw;try{pw=require('playwright');}catch{pw=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8766').replace(/\/$/,''),out=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-lifecycle');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await pw.chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'}),checks=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.crypto.getRandomValues=a=>{a[0]=5117;return a;};});
 const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));const saved=()=>page.evaluate(()=>S2Storage.load());const pass=label=>{checks.push(label);console.log('PASS',label);};
 async function fresh(){if(page.url()!=='about:blank')await page.evaluate(()=>S2Storage.clear());await page.goto(base+'/weekend_season2/index.html');}
 async function openAdvanced(){await page.locator('#advanced-settings>summary').click();}
 async function wonInputs(){return page.locator('input[data-money-won]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.name,{won:Number(n.dataset.moneyWon),display:n.value,step:n.step}])));}
 try{
  await fresh();let current=await state(),g=current.generation;
  assert.equal(g.model,'kr-life-2026-v3');assert.equal(g.incomeOrigin.age,26);assert.equal(g.province,'gyeongbuk');assert.equal(g.incomeOrigin.role,'graduate');
  assert.ok(g.incomeOrigin.studySupportMonthly>=800000&&g.incomeOrigin.studySupportMonthly<=2200000);assert.ok(g.economicProfile.totalMonthly<12000000);assert.equal(g.housingOrigin.monthlyRent%100000,0);assert.equal(g.housingOrigin.total%100000,0);
  assert.equal(await page.locator('#setup-economy').getAttribute('open'),null);let box=await page.locator('#start-btn').boundingBox();assert.ok(box.y+box.height<=844);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'mobile-lifecycle-start.png'),fullPage:true});
  await page.locator('#setup-economy>summary').focus();await page.locator('#setup-economy>summary').press('Enter');assert.notEqual(await page.locator('#setup-economy').getAttribute('open'),null);
  assert.match(await page.locator('#economy-breakdown').innerText(),/내 근로 수입[\s\S]*가족이 보태는 돈[\s\S]*장학·연구 생활 지원[\s\S]*개인 생활 지원[\s\S]*게임 속 생활 보충/);
  await page.locator('#setup-economy').screenshot({path:path.join(out,'income-breakdown.png')});
  await page.setViewportSize({width:1440,height:1000});await page.locator('#setup-economy>summary').click();await page.screenshot({path:path.join(out,'desktop-lifecycle-start.png'),fullPage:true});
  pass('26-year-old Gyeongbuk graduate has bounded personal study support and explicit household income, compact mobile/desktop start and keyboard disclosure');

  await page.setViewportSize({width:390,height:844});await openAdvanced();
  await page.locator('[name=age]').fill('30');await page.locator('[name=role]').selectOption('caregiver');await page.locator('[name=maritalStatus]').selectOption('divorced');await page.locator('[name=children]').fill('2');await page.locator('[name=childAge]').selectOption('school');await page.locator('[name=housing]').selectOption('studio');await page.locator('[name=housingTenure]').selectOption('rent');
  current=await state();g=current.generation;assert.equal(g.incomeOrigin.age,30);assert.equal(g.economicProfile.household.size,3);assert.equal(g.economicProfile.household.type,'single-parent');assert.ok(g.economicProfile.fixedCosts>=g.economicProfile.minimumLiving);assert.ok(g.economicProfile.personalBudget>=150000);assert.ok(g.economicProfile.totalMonthly>=g.economicProfile.fixedCosts+g.economicProfile.housingTotal+g.economicProfile.personalBudget);
  assert.equal(await page.locator('[name=housing]').inputValue(),'apartment');assert.equal(g.housingOrigin.housingType,'apartment');assert.match(await page.locator('.life-byline').innerText(),/30세.*이혼.*자녀 2명/);
  const fields=await wonInputs();for(const key of ['fixedCosts','personalBudget','startCash','cardLimit'])assert.equal(fields[key].won,g.economicProfile[key],key);assert.equal(fields.housingMaintenance.won,g.housingOrigin.housingMaintenance);
  for(const f of Object.values(fields)){assert.equal(f.step,'0.1');assert.match(f.display,/^\d+(?:\.\d)?$/);}
  await page.locator('[name=maritalStatus]').selectOption('widowed');assert.match(await page.locator('.life-byline').innerText(),/사별/);assert.equal((await state()).scene.family.spouse,null);
  await page.locator('#housing-settings').screenshot({path:path.join(out,'family-housing-settings.png')});
  pass('30-year-old parent of two gets a three-person budget and family-sized home; widow choice, maintenance and all precise backing inputs stay synchronized');

  await page.locator('[name=externalAllowance]').fill('1.5');await page.locator('[name=externalAllowance]').press('Tab');
  await page.locator('[name=monthlyRent]').fill('75.1234');await page.locator('[name=monthlyRent]').press('Tab');
  await page.locator('[name=housingMaintenance]').fill('12.3456');await page.locator('[name=housingMaintenance]').press('Tab');
  await page.locator('[name=housingLoanRateBps]').fill('4.37');await page.locator('[name=housingLoanRateBps]').press('Tab');
  const manual=await wonInputs();await page.locator('[name=province]').selectOption('seoul');await page.locator('[name=role]').selectOption('worker');await page.locator('[name=age]').fill('31');
  current=await state();assert.equal(current.generation.economicProfile.active,false);assert.equal(current.generation.incomeOrigin.kind,'custom');assert.deepEqual(await wonInputs(),manual);assert.equal(await page.locator('[name=housingLoanRateBps]').inputValue(),'4.37');assert.equal(manual.externalAllowance.won,15000);assert.equal(manual.monthlyRent.won,751000);assert.equal(manual.housingMaintenance.won,123000);
  await page.locator('#rebalance-economy').focus();await page.locator('#rebalance-economy').press('Enter');current=await state();assert.equal(current.generation.economicProfile.active,true);assert.equal(current.generation.incomeOrigin.kind,'lifecycle');assert.equal(current.generation.incomeOrigin.age,31);assert.equal(current.generation.province,'seoul');assert.notEqual((await wonInputs()).externalAllowance.won,15000);
  await page.locator('#custom-start-btn').click();let record=await saved();assert.equal(record.ok,true,record.reason);assert.equal(record.state.config.economicProfile.active,true);assert.equal((await state()).mode,'planning');
  await page.locator('#step-week').click();record=await saved();assert.ok(record.ok,record.reason);const bill=record.state.finance.ledger.find(t=>t.type==='fixed-cost');assert.ok(bill);assert.equal(bill.housingMaintenance,record.state.config.housingMaintenance);assert.equal(bill.amount,bill.livingCosts+bill.rent+bill.loanInterest+bill.housingMaintenance);
  await page.locator('#state-details>summary').click();assert.match(await page.locator('#finance-card').innerText(),/관리·유지비/);await page.locator('#finance-card').screenshot({path:path.join(out,'monthly-lifecycle-finance.png')});
  pass('editing money opts out; later region/role/age edits preserve manual one-decimal money and APR, explicit keyboard rebalance restores model and actual monthly bill includes maintenance once');

  await fresh();await openAdvanced();await page.locator('[data-preset=graduate]').click();
  const preset=await wonInputs();assert.equal((await state()).generation.economicProfile,null);await page.locator('[name=age]').fill('30');await page.locator('[name=province]').selectOption('gyeongbuk');assert.deepEqual(await wonInputs(),preset);
  await page.locator('#rebalance-economy').click();assert.equal((await state()).generation.economicProfile.active,true);assert.equal((await state()).generation.incomeOrigin.role,'graduate');
  await page.locator('[name=housingMaintenance]').fill('-0.00001');await page.locator('[name=housingMaintenance]').press('Tab');await page.locator('#start-year').selectOption('2027');await page.locator('#start-btn').click();assert.equal((await state()).mode,'setup');assert.ok(await page.locator('[name=housingMaintenance]').evaluate(n=>n.validity.rangeUnderflow));
  await page.locator('[name=housingMaintenance]').fill('');await page.locator('#start-btn').click();assert.equal((await state()).mode,'setup');assert.ok(await page.locator('[name=housingMaintenance]').evaluate(n=>n.validity.valueMissing));
  await page.locator('[name=housingMaintenance]').fill('8.7654');await page.locator('[name=housingMaintenance]').press('Enter');assert.equal((await state()).mode,'planning');record=await saved();assert.equal(record.state.config.housingMaintenance,88000);
  pass('manual presets remain unchanged until explicit rebalance; invalid maintenance stays invalid through redraw and Enter normalizes real edits');

  for(const fixture of ['v4-low-income-parent.json','v5-low-parent.json','v5-high-graduate.json']){
    const file=path.resolve('weekend_season2/fixtures',fixture),original=JSON.parse(fs.readFileSync(file,'utf8')).state;
    page.once('dialog',d=>d.accept());await page.locator('#import-file').setInputFiles(file);await page.waitForFunction(()=>{const s=S2Storage.load();return s.ok&&s.state.config.economicProfile===null;});record=await saved();assert.equal(record.ok,true,record.reason);
    for(const key of ['salary','externalAllowance','fixedCosts','startCash','monthlyRent','housingLoanPrincipal','housingLoanRateBps'])if(original.config[key]!==undefined)assert.equal(record.state.config[key],original.config[key],fixture+' '+key);
    for(const key of ['finance','log','rng','plan','pendingEvent'])assert.deepEqual(record.state[key],original[key],fixture+' '+key);assert.equal(record.state.config.housingMaintenance,0);assert.equal(record.state.config.economicProfile,null);
    await page.reload();await page.locator('#resume-game').click();assert.equal((await state()).automatic.active,false);assert.equal((await saved()).state.config.externalAllowance,original.config.externalAllowance);
  }
  await page.locator('#state-details>summary').click();await page.locator('#finance-card').screenshot({path:path.join(out,'legacy-finance-preserved.png')});
  pass('published v4/v5 low-income and high-graduate saves keep exact money, ledger, random state and pending event; resume does not regenerate economy');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors},null,2));
 }catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,failure:e.message},null,2));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
