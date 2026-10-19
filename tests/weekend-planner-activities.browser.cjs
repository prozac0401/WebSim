// Actual Chromium checks for all Season 2 activities in the original planner.
// Serve the repository first and set WEBSIM_URL for a different port.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const activities = require('../weekend_season2/data.js').ACTIVITIES.filter(activity=>!activity.legacyOnly);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright'); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8766').replace(/\/$/,'');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/weekend-planner-activities');
const planner = '/weekend_recovery_simulator/weekend_recovery_simulator.html';
const basics = ['sleep_in','brunch','family_dining','long_travel','driving','solo_cafe','chores','grocery','walk','deep_rest','late_screen','early_sleep'];
const errors = [], checks = [];
fs.mkdirSync(output,{recursive:true});
const state = page => page.evaluate(()=>JSON.parse(render_game_to_text()));
const chip = (page,type) => page.locator(`#wrs-palette .chip[data-template="${type}"]`);
const slot = (page,day,start) => page.locator(`.slots[data-day="${day}"] .slot`).nth(start);
const group = (page,name) => page.locator(`#wrs-palette-group [data-palette-group="${name}"]`);
const shot = async (page,name) => { await page.evaluate(()=>window.scrollTo(0,0));return page.screenshot({path:path.join(output,name+'.png'),fullPage:true}); };
const pass = label => {checks.push(label);console.log('PASS',label);};
async function newPage(browser,mobile=false) {
  const page = await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>{window.crypto.getRandomValues=array=>{array[0]=45;return array;};});
  return page;
}
async function add(page,type,day='sat',start=2) {
  await chip(page,type).click();
  await slot(page,day,start).click();
  return (await state(page)).events.at(-1);
}

(async()=>{
  const browser = await playwright.chromium.launch({headless:true});
  try {
    const page = await newPage(browser);
    await page.goto(base+planner);
    assert.equal((await state(page)).events.length,0);
    assert.equal(await group(page,'basic').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#wrs-palette .chip').count(),12);
    for(const type of basics) {
      await page.locator('#wrs-clear').click();
      const start = type==='late_screen'?28:type==='early_sleep'?24:2;
      const event = await add(page,type,'sat',start);
      assert.equal(event.type,type);
      assert.equal(event.start_slot,start);
      assert.equal(event.sourceKind,undefined);
    }
    await page.locator('#wrs-clear').click();
    await group(page,'season2').click();
    assert.equal(new Set(activities.map(activity=>activity.id)).size,activities.length);
    assert.equal(await page.locator('#wrs-palette .chip').count(),activities.length);
    assert.equal(await page.evaluate(()=>typeof S2Data),'undefined','standalone planner must not need a running life');
    for(const activity of activities) {
      await page.locator('#wrs-clear').click();
      const event = await add(page,'s2_'+activity.id);
      const travel = activity.location==='home'?0:activity.location==='local'?30:60;
      assert.equal(event.type,'s2_'+activity.id);
      assert.equal(event.activity_id,activity.id);
      assert.equal(event.label,activity.name);
      assert.equal(event.duration_slots,Math.ceil((activity.minutes+activity.prep+travel)/30));
      assert.equal(event.travel_minutes,travel);
      assert.equal(event.sourceKind,undefined,'new activity must not claim to be a recorded life event');
      assert.equal((await state(page)).events.length,1);
      assert.equal(await chip(page,'s2_'+activity.id).getAttribute('aria-pressed'),'true');
    }
    await page.locator('#wrs-palette').evaluate(element=>{element.scrollTop=0;});
    await shot(page,'all-season2-desktop');
    pass(`direct entry retains all 12 original blocks and places every one of ${activities.length} Season 2 activities with its original name and editable defaults`);

    await page.locator('#wrs-clear').click();
    const research = await add(page,'s2_research');
    assert.equal(research.label,'논문 조사','role-limited game activities remain available without a game role');
    await page.locator('#ins-dur').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
    await page.locator('#ins-tr').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
    await page.locator('#ins-c').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
    let edited=(await state(page)).events[0];
    assert.equal(edited.duration_slots,2);assert.equal(edited.travel_minutes,5);assert.equal(edited.social_strain,2);
    await page.locator('#ins-tr').scrollIntoViewIfNeeded();
    const track=await page.locator('#ins-tr').boundingBox();
    await page.mouse.move(track.x+track.width*.25,track.y+track.height/2);await page.mouse.down();
    const dragStart=Number(await page.locator('#ins-tr').inputValue());
    await page.mouse.move(track.x+track.width*.75,track.y+track.height/2,{steps:6});await page.mouse.up();
    assert.ok(Number(await page.locator('#ins-tr').inputValue())>dragStart+30,'continuous pointer dragging must keep the live range input');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'ins-tr');
    await page.locator('#ins-copy').click();
    const copy=(await state(page)).events.find(event=>event.id!==edited.id);
    assert.ok(copy);assert.equal(copy.activity_id,'research');assert.equal(copy.label,'논문 조사');
    await page.locator(`.ev[data-id="${copy.id}"]`).dragTo(slot(page,'sun',12));
    const moved=(await state(page)).events.find(event=>event.id===copy.id);
    assert.equal(moved.day,'sun');assert.equal(moved.start_slot,12);
    const remembered=(await state(page)).events;
    await page.locator('#wrs-remember').click();
    await page.locator(`.ev[data-id="${copy.id}"]`).click();await page.locator('#ins-del').click();
    assert.equal((await state(page)).events.length,1);
    await page.locator('#wrs-restore').click();
    assert.deepEqual((await state(page)).events,remembered);
    await shot(page,'edited-and-moved-desktop');
    pass('Season 2 blocks support keyboard and continuous slider edits, copy, drag between days, delete, remember and restore');

    await page.goto(base+'/weekend_season2/index.html');
    await page.locator('#start-btn').click();
    const completed=await page.evaluate(()=>{
      const s=S2Storage.load().state;let loops=0;
      while(s.phase!=='finished'&&loops++<700){const result=S2Engine.advanceAutomatic(s,{maxDays:7,decisions:'auto'});if(result.ok===false)throw Error(result.reason);}
      return {phase:s.phase,days:s.log.filter(item=>item.type==='daily').length,save:S2Storage.save(s)};
    });
    assert.equal(completed.phase,'finished');assert.equal(completed.days,365);assert.equal(completed.save.ok,true);
    await page.reload();await page.locator('#resume-game').click();
    const sourceBefore=await page.evaluate(()=>localStorage.getItem(S2Storage.KEY));
    await page.locator('#open-weekend-draft').click();
    await page.waitForURL(/weekend_recovery_simulator\.html\?season2Draft=/);
    const imported=await state(page);
    assert.ok(imported.season2Draft);
    assert.equal(imported.season2Draft.source.completed,true);
    assert.equal(await group(page,'season2').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#wrs-palette .chip').count(),activities.length);
    const freeStart=Array.from({length:30},(_,start)=>start).find(start=>!imported.events.some(event=>event.day==='sun'&&start<event.start_slot+event.duration_slots&&event.start_slot<start+4));
    assert.notEqual(freeStart,undefined,'the imported draft leaves room for a manual activity');
    await chip(page,'s2_haircut').click();
    await slot(page,'sun',freeStart).click();
    const withNew=(await state(page)).events;
    for(const original of imported.events)assert.deepEqual(withNew.find(event=>event.id===original.id),original,'adding to an imported draft preserves the imported labels and source metadata');
    const newEvent=withNew.find(event=>!imported.events.some(original=>original.id===event.id));
    assert.ok(newEvent);assert.equal(newEvent.label,'커트');assert.equal(newEvent.activity_id,'haircut');
    assert.equal(newEvent.sourceKind,undefined);assert.equal(newEvent.sourceDate,undefined);
    assert.equal((await state(page)).events.length,imported.events.length+1);
    // The source page saves on transfer; compare its state before and after editing,
    // allowing the envelope save timestamp to reflect the navigation itself.
    const sourceAfter=await page.evaluate(()=>localStorage.getItem('websim-weekend-season2-v1'));
    const stripTimestamp=value=>{const parsed=JSON.parse(value);delete parsed.savedAt;return parsed;};
    assert.deepEqual(stripTimestamp(sourceAfter),stripTimestamp(sourceBefore));
    await page.locator('#wrs-remember').click();await page.locator('#wrs-clear').click();await page.locator('#wrs-restore').click();
    assert.deepEqual((await state(page)).events,withNew);
    assert.deepEqual((await state(page)).season2Draft,imported.season2Draft);
    await shot(page,'imported-with-added-activity');
    pass('an imported draft accepts new Season 2 activities while preserving original records, provenance and source game storage');

    const mobile=await newPage(browser,true);
    await mobile.goto(base+planner);
    await group(mobile,'season2').focus();await mobile.keyboard.press('Enter');
    await mobile.locator('#wrs-activity-search').fill('논문');
    assert.equal(await mobile.locator('#wrs-palette .chip').count(),1);
    await chip(mobile,'s2_research').focus();await mobile.keyboard.press('Enter');
    assert.equal(await mobile.evaluate(()=>document.activeElement?.dataset.template),'s2_research','rerender must retain keyboard focus on the selected activity');
    await slot(mobile,'sat',2).focus();await mobile.keyboard.press('Enter');
    assert.equal((await state(mobile)).events[0].label,'논문 조사');
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
    await mobile.locator('#wrs-activity-search').fill('없는 활동 검색어');
    assert.equal(await mobile.locator('#wrs-palette .chip').count(),0);
    await mobile.locator('#wrs-activity-search').fill('');
    assert.equal(await mobile.locator('#wrs-palette .chip').count(),activities.length);
    await shot(mobile,'catalog-mobile');
    await group(mobile,'basic').focus();await mobile.keyboard.press('Enter');
    assert.equal(await mobile.locator('#wrs-palette .chip').count(),12);
    assert.equal((await state(mobile)).events[0].label,'논문 조사','switching the palette never changes placed activities');
    await mobile.locator('#wrs-sample').click();
    assert.equal((await state(mobile)).events.length,9);
    assert.deepEqual(errors,[]);
    pass('390px mobile supports category/search/selection/grid keyboard flow, keeps focus, and retains legacy sample behavior without overflow or errors');
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,errors,season2Activities:activities.length,originalActivities:basics.length},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
