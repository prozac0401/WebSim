// Real Chromium coverage for the two-option gender controls and saved avatar repair.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright'); }
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8774').replace(/\/$/,'');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/weekend-season2-gender');
const game='/weekend_season2/index.html', key='websim-weekend-season2-v1';
const checks=[],errors=[],cases=[];
fs.mkdirSync(output,{recursive:true});
const textState=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
const save=page=>page.evaluate(key=>localStorage.getItem(key),key);
const pass=label=>{checks.push(label);console.log('PASS',label);};
const hairs={man:['short-swept','side-wave','rounded-crop','curly','buzz'],woman:['long-soft','bob','ponytail','bun','braids']};
function look(appearance,gender) {
  assert.equal(appearance.gender,gender);
  assert.ok(hairs[gender].includes(appearance.hair),`${gender} illustration uses ${appearance.hair}`);
  if(appearance.options) {
    assert.equal(appearance.hairStyle,appearance.hair);
    assert.equal(appearance.options.hairStyle,appearance.hair);
  }
}
async function pageFor(browser,mobile=false) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  await page.addInitScript(()=>{let seed=45;window.crypto.getRandomValues=array=>{array[0]=seed++;return array;};});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+game);
  await page.waitForFunction(()=>typeof render_game_to_text==='function');
  return page;
}
async function reveal(page,locator) {
  const indices=await locator.evaluate(element=>[...document.querySelectorAll('details')].map((details,index)=>({details,index})).filter(({details})=>details.contains(element)&&!details.open&&!details.querySelector(':scope > summary')?.contains(element)).map(({index})=>index));
  for(const index of indices)await page.locator('details').nth(index).locator(':scope > summary').click();
}
async function options(page,selector) {
  const values=await page.locator(selector+' option').evaluateAll(items=>items.map(item=>({value:item.value,label:item.textContent.trim()})));
  assert.deepEqual(values.map(item=>item.value).sort(),['man','woman']);
  assert.deepEqual(values.map(item=>item.label).sort(),['남성','여성']);
}
async function stableSetup(page) {
  return page.evaluate(key=>{
    const s=JSON.parse(render_game_to_text()),{appearance,...generation}=s.generation;
    return {
      fields:[...document.querySelectorAll('#setup-form input,#setup-form select')].filter(el=>el.name&&!el.name.includes('gender')).map(el=>({name:el.name,value:el.value,...(el.type==='checkbox'?{checked:el.checked}:{})})),
      generation,housing:s.housing,ageHealth:s.ageHealth,preferences:s.preferences,finance:s.finance,stats:s.stats,plan:s.plan,logCount:s.logCount,date:s.date,
      save:localStorage.getItem(key)
    };
  },key);
}
async function shot(page,name) {
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
  await page.locator('#life-scene').screenshot({path:path.join(output,name+'-canvas.png')});
}
async function selectGender(page,value,selector='[name="gender"]',keyboard=false) {
  const field=page.locator(selector);await reveal(page,field);
  if(keyboard) {
    const values=await field.locator('option').evaluateAll(items=>items.map(item=>item.value));
    await field.focus();await page.keyboard.press(values.indexOf(value)===0?'Home':'End');await page.keyboard.press('Tab');
  } else await field.selectOption(value);
  assert.equal(await field.inputValue(),value);
}

(async()=>{
  const browser=await playwright.chromium.launch({headless:true});
  try {
    const desktop=await pageFor(browser);
    await options(desktop,'[name="gender"]');
    const stable=await stableSetup(desktop);
    await selectGender(desktop,'man');
    const male=(await textState(desktop)).scene.character.appearance;look(male,'man');
    assert.match(await desktop.locator('.life-byline').innerText(),/남성/);
    const maleCanvas=await desktop.locator('#life-scene').screenshot();
    assert.deepEqual(await stableSetup(desktop),stable,'changing the protagonist gender must not alter economy, seed, history or saved game');
    await shot(desktop,'setup-man-desktop');
    await selectGender(desktop,'woman');
    const female=(await textState(desktop)).scene.character.appearance;look(female,'woman');
    assert.match(await desktop.locator('.life-byline').innerText(),/여성/);
    assert.notDeepEqual(await desktop.locator('#life-scene').screenshot(),maleCanvas,'the visible canvas must update with the gender control');
    assert.deepEqual(await stableSetup(desktop),stable);
    await shot(desktop,'setup-woman-desktop');
    await selectGender(desktop,'man');
    const startedAppearance=(await textState(desktop)).scene.character.appearance;
    await desktop.locator('#start-btn').click();
    assert.equal((await textState(desktop)).mode,'planning');
    assert.deepEqual((await textState(desktop)).scene.character.appearance,startedAppearance,'starting the life must keep its selected avatar');
    const startedSave=await save(desktop);
    assert.equal(JSON.parse(startedSave).state.config.gender,'man');
    await desktop.reload();await desktop.locator('#resume-game').click();
    assert.deepEqual((await textState(desktop)).scene.character.appearance,startedAppearance,'reloading a new life must keep its selected avatar');
    assert.equal(await save(desktop),startedSave);
    await shot(desktop,'started-man-desktop');
    pass('desktop exposes only women and men, updates the canvas immediately, and retains the selected avatar through start and resume without changing economics or saved history');

    await desktop.reload();
    await desktop.locator('#advanced-settings > summary').click();
    await desktop.locator('[name="children"]').fill('2');
    await desktop.locator('[name="childAge"]').selectOption('school');
    for(const index of [0,1])await options(desktop,`[name="child-gender-${index}"]`);
    const initialChildren=(await textState(desktop)).scene.family.children;
    for(const index of [0,1])look(initialChildren[index].appearance,await desktop.locator(`[name="child-gender-${index}"]`).inputValue());
    const familyStable=await stableSetup(desktop);
    await selectGender(desktop,'man','[name="child-gender-0"]');
    await selectGender(desktop,'woman','[name="child-gender-1"]');
    let children=(await textState(desktop)).scene.family.children;
    assert.equal(children.length,2);look(children[0].appearance,'man');look(children[1].appearance,'woman');
    await selectGender(desktop,'woman','[name="child-gender-0"]');
    await selectGender(desktop,'man','[name="child-gender-1"]');
    children=(await textState(desktop)).scene.family.children;
    look(children[0].appearance,'woman');look(children[1].appearance,'man');
    assert.deepEqual(await stableSetup(desktop),familyStable,'child gender controls preserve the household economy, seed and the active saved life');
    await shot(desktop,'child-options-desktop');
    pass('each child has exactly two options and changing those options updates the child illustration while preserving household economics and the existing save');

    const generated=await desktop.evaluate(()=>Array.from({length:64},(_,seed)=>{
      const config=S2Data.generateLife(seed).config;
      return {seed,gender:config.gender,hair:config.appearance.hairStyle,children:S2Data.getChildren(config).map(child=>child.gender),appearance:S2Scene.appearance(config)};
    }));
    assert.deepEqual([...new Set(generated.map(row=>row.gender))].sort(),['man','woman']);
    assert.ok(generated.some(row=>row.children.length));
    for(const row of generated){look(row.appearance,row.gender);assert.ok(hairs[row.gender].includes(row.hair));assert.ok(row.children.every(gender=>['man','woman'].includes(gender)));}
    for(let i=0;i<8;i++) {
      await desktop.locator('#reroll-life').click();
      await options(desktop,'[name="gender"]');
      const s=await textState(desktop),gender=await desktop.locator('[name="gender"]').inputValue();
      look(s.scene.character.appearance,gender);
      assert.equal(s.generation.appearance.hairStyle,s.scene.character.appearance.hair);
      assert.equal(await save(desktop),startedSave,'meeting another life must not replace the saved game');
    }
    pass('64 generated households and eight UI rerolls use only women and men, with matching generated and rendered hairstyles');

    for(const [gender,hair,expected] of [['man','bun','man'],['woman','buzz','woman'],['male','bun','man'],['female','buzz','woman']]) {
      const fixture=await desktop.evaluate(({gender,hair})=>{
        const appearance={...S2Data.generateLife(45).config.appearance,hairStyle:hair};
        const s=S2Engine.create({...S2Data.PRESETS[0].config,gender,appearance,seed:444,personaName:'이전 저장 인물'},'worker');
        for(let i=0;i<20&&s.log.filter(row=>row.type==='daily').length<7;i++)S2Engine.advanceAutomatic(s,{maxDays:1,decisions:'auto'});
        const result=S2Storage.save(s);if(!result.ok)throw Error(result.reason);
        return {state:s,text:localStorage.getItem(S2Storage.KEY)};
      },{gender,hair});
      assert.ok(fixture.state.log.length>0);
      await desktop.reload();await desktop.locator('#resume-game').click();
      const s=await textState(desktop);look(s.scene.character.appearance,expected);
      assert.notEqual(s.scene.character.appearance.hair,hair,'old opposite-style hair must be corrected in the rendered scene');
      assert.equal(await save(desktop),fixture.text,'repairing the illustration must not rewrite saved configuration, history, money or RNG');
      assert.equal(JSON.parse(await save(desktop)).state.config.appearance.hairStyle,hair,'raw saved appearance remains available for compatibility');
      const before=s.scene.character.appearance;
      await desktop.evaluate(()=>advanceTime(1000));
      assert.equal(await save(desktop),fixture.text);
      assert.deepEqual((await textState(desktop)).scene.character.appearance,before);
      cases.push({savedGender:gender,savedHair:hair,renderedGender:before.gender,renderedHair:before.hair});
      await shot(desktop,'saved-'+gender+'-'+hair);
    }
    pass('canonical and legacy male/female saves render a matching avatar even with old bun/buzz data, without rewriting any saved state');

    const mobile=await pageFor(browser,true);
    await options(mobile,'[name="gender"]');
    await selectGender(mobile,'man','[name="gender"]',true);
    const mobileStable=await stableSetup(mobile),mobileMale=await mobile.locator('#life-scene').screenshot();
    look((await textState(mobile)).scene.character.appearance,'man');
    await selectGender(mobile,'woman','[name="gender"]',true);
    look((await textState(mobile)).scene.character.appearance,'woman');
    assert.deepEqual(await stableSetup(mobile),mobileStable);
    assert.notDeepEqual(await mobile.locator('#life-scene').screenshot(),mobileMale);
    await mobile.locator('[name="children"]').fill('1');
    await mobile.locator('[name="childAge"]').selectOption('school');
    await options(mobile,'[name="child-gender-0"]');
    look((await textState(mobile)).scene.family.children[0].appearance,await mobile.locator('[name="child-gender-0"]').inputValue());
    await selectGender(mobile,'man','[name="child-gender-0"]',true);
    look((await textState(mobile)).scene.family.children[0].appearance,'man');
    await selectGender(mobile,'woman','[name="child-gender-0"]',true);
    look((await textState(mobile)).scene.family.children[0].appearance,'woman');
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await shot(mobile,'options-mobile');
    await mobile.locator('#advanced-settings > summary').click();
    await shot(mobile,'setup-woman-mobile');
    const mobileAppearance=(await textState(mobile)).scene.character.appearance;
    await mobile.locator('#start-btn').focus();await mobile.keyboard.press('Enter');
    assert.equal((await textState(mobile)).mode,'planning');
    assert.deepEqual((await textState(mobile)).scene.character.appearance,mobileAppearance);
    await shot(mobile,'started-woman-mobile');
    assert.deepEqual(errors,[]);
    pass('390px mobile supports both protagonist and child gender choices by keyboard, updates the visible avatars, starts the selected life and has no overflow or browser errors');
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,cases,errors},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
