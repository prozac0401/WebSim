// Display rounded 만원 inputs while preserving untouched original integer won.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let playwright;
try{playwright=require('playwright');}catch{playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');}
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8766').replace(/\/$/,'');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-money');
const fixturePath=path.resolve('weekend_season2/fixtures/v4-low-income-parent.json');
const amounts={salary:0,externalAllowance:65230,fixedCosts:42563,startCash:10,personalBudget:1877,cardLimit:80001,monthlyRent:3502,housingLoanPrincipal:320001,housingMaintenance:0};
fs.mkdirSync(output,{recursive:true});

(async()=>{
  const browser=await playwright.chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
  await page.addInitScript(()=>{window.crypto.getRandomValues=array=>{array[0]=41;return array;};});
  const errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
  const saved=()=>page.evaluate(()=>S2Storage.load());
  const pass=message=>{checks.push(message);console.log('PASS',message);};
  async function fresh(precise=true){
    if(page.url()!=='about:blank')await page.evaluate(()=>S2Storage.clear());
    await page.goto(base+'/weekend_season2/index.html');
    await page.locator('#advanced-settings>summary').click();
    if(precise){
      // A valid, known preset fixture exercises every untouched sub-1000-won
      // remainder; no simulation state is edited to make an assertion pass.
      await page.evaluate(values=>Object.assign(S2Data.PRESETS[1].config,{...values,housingTenure:'rent',housingLoanRateBps:550}),amounts);
      await page.locator('[data-preset=seeker]').click();
    }
  }
  async function checkDisplays(){
    const fields=await page.locator('input[data-money-won]').evaluateAll(inputs=>inputs.map(i=>({name:i.name,value:i.value,step:i.step,won:i.dataset.moneyWon,display:i.dataset.moneyDisplay})));
    assert.equal(fields.length,Object.keys(amounts).length);
    for(const field of fields){assert.match(field.value,/^\d+(?:\.\d)?$/,field.name);assert.equal(field.step,'0.1');assert.equal(field.value,field.display);}
    assert.equal(await page.locator('[name=housingLoanRateBps]').getAttribute('step'),'0.01');
  }
  try{
    await fresh();await checkDisplays();
    assert.equal(await page.locator('[name=externalAllowance]').inputValue(),'6.5');
    assert.equal(await page.locator('[name=fixedCosts]').inputValue(),'4.3');
    assert.equal(await page.locator('[name=startCash]').inputValue(),'0');
    await page.locator('[name=startCash]').focus();await page.locator('[name=startCash]').press('Tab');
    await page.locator('[name=age]').fill('65');
    await page.locator('#start-year').selectOption('2027');
    await checkDisplays();
    await page.locator('#housing-settings').screenshot({path:path.join(output,'one-decimal-housing-inputs.png')});
    await page.locator('#custom-start-btn').click();
    let record=await saved();assert.equal(record.ok,true,record.reason);
    for(const [key,value]of Object.entries(amounts))assert.equal(record.state.config[key],value,key);
    assert.equal(record.state.finance.cash,10);
    pass('one-decimal fields preserve every untouched original won, including 65230, 42563 and a 10-won amount displayed as zero');

    await fresh();
    await page.locator('[name=startCash]').fill('0');await page.locator('[name=startCash]').press('Tab');
    assert.equal(await page.locator('[name=startCash]').getAttribute('data-money-won'),'0');
    await page.locator('[name=externalAllowance]').fill('6.5');await page.locator('[name=externalAllowance]').press('Tab');
    assert.equal(await page.locator('[name=externalAllowance]').getAttribute('data-money-won'),'65000');
    await page.locator('[name=monthlyRent]').fill('75.1234');await page.locator('[name=monthlyRent]').press('Tab');
    assert.equal(await page.locator('[name=monthlyRent]').inputValue(),'75.1');
    await page.locator('[name=housingLoanPrincipal]').fill('10000.0001');await page.locator('[name=housingLoanPrincipal]').press('Tab');
    assert.equal(await page.locator('[name=housingLoanPrincipal]').inputValue(),'10000');
    await page.locator('[name=housingLoanRateBps]').fill('4.37');
    await page.locator('[name=salary]').fill('77.7777');
    assert.equal(await page.locator('[name=salary]').evaluate(i=>i.validity.stepMismatch),true);
    await page.locator('[name=salary]').press('Enter');
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).mode==='planning');
    record=await saved();assert.equal(record.ok,true,record.reason);
    assert.equal(record.state.config.salary,778000);assert.equal(record.state.config.externalAllowance,65000);
    assert.equal(record.state.config.monthlyRent,751000);assert.equal(record.state.config.housingLoanPrincipal,100000000);
    assert.equal(record.state.config.housingLoanRateBps,437);assert.equal(record.state.config.startCash,0);
    assert.equal(record.state.config.fixedCosts,42563,'an unrelated untouched field stays precise');
    await page.locator('#state-details>summary').click();
    await page.locator('#finance-card').screenshot({path:path.join(output,'rounded-edits-finance.png')});
    pass('real edits round to 1000 won, explicitly typing the displayed zero means zero, and Enter normalizes before validation while APR retains 0.01%');

    await fresh();
    for(const item of [{value:'',year:'2027',validity:'valueMissing'},{value:'-0.00001',year:'2028',validity:'rangeUnderflow'},
      {value:'100000.0000001',year:'2029',validity:'rangeOverflow'}]){
      await page.locator('[name=startCash]').fill(item.value);await page.locator('[name=startCash]').press('Tab');
      await page.locator('#start-year').selectOption(item.year);
      assert.equal(await page.locator('[name=startCash]').evaluate((input,flag)=>input.validity[flag],item.validity),true,item.value);
      await page.locator('#start-btn').click();
      assert.equal((await state()).mode,'setup');assert.equal((await saved()).ok,false);
    }
    await page.locator('[name=startCash]').fill('');await page.locator('[name=startCash]').press('e');
    assert.equal(await page.locator('[name=startCash]').evaluate(i=>i.validity.badInput||i.validity.valueMissing),true);
    await page.locator('#start-btn').click();assert.equal((await state()).mode,'setup');
    await page.locator('[name=startCash]').fill('2.34');await page.locator('[name=startCash]').press('Tab');
    assert.equal(await page.locator('[name=startCash]').inputValue(),'2.3');
    assert.equal(await page.locator('[name=startCash]').evaluate(i=>i.validity.valid),true);
    pass('empty, nonnumeric, tiny negative and tiny over-limit drafts remain invalid through blur and a full redraw, then recover with a valid edit');

    await fresh(false);
    await page.locator('[name=province]').selectOption('seoul');
    await page.locator('[name=role]').selectOption('worker');
    const expected=await page.evaluate(()=>{const c=S2Data.generateLife(41).config;c.province='seoul';c.role='worker';S2Data.assignLifeEconomy(c,{preserveTenure:true});return {salary:c.salary,externalAllowance:c.externalAllowance};});
    for(const key of ['salary','externalAllowance']){
      assert.equal(await page.locator(`[name=${key}]`).getAttribute('data-money-won'),String(expected[key]));
      assert.equal(await page.locator(`[name=${key}]`).inputValue(),String(Math.round(expected[key]/1000)/10));
    }
    await page.locator('[name=age]').fill('65');
    const ageExpected=await page.evaluate(()=>{const c=S2Data.generateLife(41).config;c.province='seoul';c.role='worker';c.age=65;S2Data.assignLifeEconomy(c,{preserveTenure:true});return {salary:c.salary,externalAllowance:c.externalAllowance};});
    for(const key of ['salary','externalAllowance']){assert.equal(await page.locator(`[name=${key}]`).getAttribute('data-money-won'),String(ageExpected[key]));assert.equal(await page.locator(`[name=${key}]`).inputValue(),String(Math.round(ageExpected[key]/1000)/10));}
    await page.locator('#custom-start-btn').click();record=await saved();assert.equal(record.ok,true,record.reason);
    assert.equal(record.state.config.salary,ageExpected.salary);assert.equal(record.state.config.externalAllowance,ageExpected.externalAllowance);
    pass('automatic region, role and age reassignment synchronizes displayed values and precise backing data before start');

    const old=JSON.parse(fs.readFileSync(fixturePath,'utf8')).state;
    page.once('dialog',d=>d.accept());await page.locator('#import-file').setInputFiles(fixturePath);
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).mode==='event');
    record=await saved();assert.equal(record.ok,true,record.reason);
    assert.equal(record.state.config.externalAllowance,65230);assert.equal(record.state.config.fixedCosts,42563);
    assert.deepEqual(record.state.finance,old.finance);
    await page.reload();await page.locator('#resume-game').click();
    record=await saved();assert.equal(record.state.config.externalAllowance,65230);assert.equal(record.state.config.fixedCosts,42563);
    await page.locator('#state-details>summary').click();
    const labels=await page.locator('#finance-card strong').allTextContents();
    for(const label of labels)assert.doesNotMatch(label,/\d+\.\d{2,}만원/);
    await page.locator('#finance-card').screenshot({path:path.join(output,'original-save-money-preserved.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    pass('published v4 save import and browser resume keep original low amounts and the ledger while monetary labels use at most one decimal');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
