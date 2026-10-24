// Fresh disposable browser contexts only. Serve repository before running this file.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let playwright; try { playwright=require('playwright'); } catch { playwright=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright'); }
const engine=require('../stopped_saturday/story-engine.js');
const legacyEngine=require('../stopped_saturday/legacy/story-engine-v2.js');
const storeAPI=require('../stopped_saturday/saturday-store.js');
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8766/').replace(/\/?$/,'/');
const url=base+'stopped_saturday/stopped_saturday.html';
const out=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/saturday-journal');
const checks=[],errors=[],external=[];
const pass=name=>{checks.push(name);console.log('PASS',name);};
const state=page=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const envelope=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storeAPI.STORAGE_KEY);
async function ready(page){await page.goto(url);await page.waitForFunction(()=>typeof window.render_game_to_text==='function');}
async function start(page,scenario='home',conditions={}){
  if((await state(page)).mode!=='cover') await page.locator('#home-button').click();
  await page.locator('#scenario-select').selectOption(scenario);
  if(!await page.locator('.day-setup details').evaluate(el=>el.open)) await page.locator('.day-setup summary').click();
  await page.locator('#help-style').selectOption(conditions.helpStyle||'takeover');
  await page.locator('#phone-payment').setChecked(Boolean(conditions.phonePayment));
  await page.locator('#start-button').click(); assert.equal((await state(page)).mode,'game');
}
async function choose(page,index=0){await page.locator('#choices button').nth(index).click();assert.equal((await state(page)).mode,'reaction');await page.locator('#continue-button').click();}
async function finish(page,index=0){
  let guard=0;
  while((await state(page)).mode!=='result'){
    const current=await state(page);assert.ok(++guard<=current.maxSteps*2+2,'day must finish within its version limit');
    if(current.mode==='reaction')await page.locator('#continue-button').click();else await choose(page,index);
  }
  const done=await state(page);assert.equal(done.step,done.maxSteps);return done;
}
async function reachScene(page,target,extraChoices={}){
  for(let guard=0;guard<30;guard++){
    const current=await state(page);if(current.mode==='game'&&current.sceneId===target)return current;
    assert.equal(current.mode,'game');
    assert.match(current.sceneId,/^R0[1-7]$/,`expected only added day stages before ${target}, found ${current.sceneId}`);
    if(extraChoices[current.sceneId])await chooseId(page,extraChoices[current.sceneId]);else await choose(page,0);
  }
  throw Error('Core scene not reached: '+target);
}
async function chooseId(page,id){const current=await state(page),index=current.choiceIds.indexOf(id);assert.ok(index>=0,`missing choice ${id}`);await choose(page,index);}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'horizontal overflow');}
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
async function journalLayout(page,selector,count){
  const list=page.locator(selector);
  assert.equal(await list.evaluate(el=>getComputedStyle(el).listStyleType),'none','only the explicit selection badges number the list');
  assert.deepEqual(await list.locator('.journal-entry-number').allTextContents(),Array.from({length:count},(_,i)=>String(i+1)));
  for(const entry of await list.locator(':scope > .journal-entry').all()){
    assert.equal(await entry.locator('.journal-entry-prose > p').count(),3,'consequence paragraphs stay separate');
    assert.equal(await entry.locator('.journal-entry-body').count(),1,'body response has its own readable block');
  }
}
async function tabTo(page,selector){for(let i=0;i<90;i++){if(await page.locator(selector).evaluate(el=>el===document.activeElement))return;await page.keyboard.press('Tab');}throw Error('Keyboard target not reached: '+selector);}
function observe(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});}
(async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=await playwright.chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage();observe(page);await ready(page);
    assert.equal(await page.locator('#scenario-select option').count(),6);await screenshot(page,'01-cover');
    await start(page);const firstState=await state(page);assert.equal(firstState.scenarioVersion,'3');assert.equal(firstState.maxSteps,12);assert.equal(firstState.minuteOfDay,612);assert.ok(firstState.choiceDurations[0]>0);assert.match(await page.locator('#scene-clock').innerText(),/오전/);
    await page.locator('#choices button').first().evaluate(b=>{b.click();b.click();});
    const committed=await state(page);assert.equal(committed.step,1);assert.equal(committed.minuteOfDay,firstState.minuteOfDay+firstState.choiceDurations[0]);assert.equal(committed.elapsedMinutes,firstState.choiceDurations[0]);const saved=await envelope(page);assert.equal(saved.current.choiceIds.length,1);
    await page.reload();await page.waitForFunction(()=>window.render_game_to_text);let restored=await state(page);assert.equal(restored.mode,'reaction');assert.equal(restored.step,1);assert.deepEqual(restored.context,committed.context);assert.equal(restored.energy,committed.energy);assert.equal(restored.minuteOfDay,committed.minuteOfDay);assert.equal(restored.elapsedMinutes,committed.elapsedMinutes);
    pass('F01 choice commit is atomic, duplicate click ignored, refresh restores reaction and state');
    await page.locator('#continue-button').click();const next=await state(page);await page.goto(base+'stopped_saturday/stopped_saturday_doc.html');await page.goBack();await page.waitForFunction(()=>window.render_game_to_text);assert.equal((await state(page)).sceneId,next.sceneId);assert.equal((await state(page)).step,1);
    await page.goForward();assert.ok(page.url().includes('_doc.html'));await page.goBack();await page.waitForFunction(()=>window.render_game_to_text);assert.equal((await state(page)).step,1);
    const reopened=await context.newPage();observe(reopened);await ready(reopened);assert.equal((await state(reopened)).step,1);assert.equal((await state(reopened)).mode,'game');await reopened.close();
    pass('F01 backward/forward navigation and a reopened tab retain the last confirmed scene');
    await finish(page);const original=await envelope(page);const originalId=original.completed[0].id;assert.equal(original.completed.length,1);
    await page.reload();await page.waitForFunction(()=>window.render_game_to_text);assert.equal((await envelope(page)).completed.length,1);
    await start(page,'cafe',{phonePayment:true});await finish(page);assert.equal((await envelope(page)).completed.length,2);
    await page.reload();await page.waitForFunction(()=>window.render_game_to_text);assert.equal((await envelope(page)).completed.length,2);
    pass('F02 two completed days survive new-day start and refresh without duplicate endings');
    await page.locator('#library-button').click();assert.equal(await page.locator('.record-card').count(),2);await page.locator('.record-card button').first().click();await journalLayout(page,'#record-scenes',original.completed[0].choiceIds.length);await screenshot(page,'02-journal');
    pass('Journal numbers appear once and version-length entries separate story paragraphs from body responses');
    const firstCoreIndex=original.completed[0].choiceIds.findIndex(id=>id.startsWith('S01-'));assert.ok(firstCoreIndex>0,'new preparation precedes the original first core choice');
    await page.locator('#record-scenes li').nth(firstCoreIndex).locator('button').click();let branch=await envelope(page);assert.equal(branch.current.parentId,originalId);assert.equal(branch.current.branchIndex,firstCoreIndex);assert.deepEqual(branch.current.choiceIds,original.completed[0].choiceIds.slice(0,firstCoreIndex));assert.equal((await state(page)).sceneId,'S01');
    assert.deepEqual(branch.completed[0],original.completed[0]);await choose(page,2);await finish(page);branch=await envelope(page);assert.equal(branch.replays.length,1);assert.deepEqual(branch.completed[0],original.completed[0]);
    await page.locator('#open-completed').click();assert.match(await page.locator('#comparison').innerText(),/같은 이야기와 조건/);await journalLayout(page,'.compare-day:first-child ol',branch.replays[0].choiceIds.length);await journalLayout(page,'.compare-day:last-child ol',original.completed[0].choiceIds.length);await screenshot(page,'03-branch-comparison');
    pass('F03 changing a choice creates a separate parent-linked day and preserves the original');
    await start(page,'doors');await reachScene(page,'S02');await page.evaluate(()=>window.advanceTime(60000));assert.equal((await state(page)).motion.location,'hall');assert.equal((await state(page)).motion.poseKind,'stand');assert.equal((await state(page)).motion.moving,false);assert.equal((await state(page)).motion.contextVisual.doorMode,'manual');await screenshot(page,'04-manual-door');await finish(page);const manual=(await envelope(page)).completed.at(-1);await page.locator('#open-completed').click();assert.equal(await page.locator('#door-contrast').isVisible(),true);assert.match(await page.locator('#door-description').innerText(),/처음의 에너지/);
    await page.locator('#door-contrast').click();let automatic=await envelope(page);assert.equal(automatic.current.conditions.doorMode,'automatic');assert.equal(automatic.current.parentId,manual.id);assert.deepEqual({...automatic.current.conditions,doorMode:'manual'},manual.conditions);
    assert.equal((await state(page)).sceneId,'S02');assert.equal((await state(page)).motion.contextVisual.doorMode,'automatic');assert.doesNotMatch(await page.locator('#choices').innerText(),/문을 잡아 달라|문을 잡아달/);await screenshot(page,'04-automatic-door');await finish(page);
    await page.locator('#open-completed').click();assert.match(await page.locator('#comparison').innerText(),/미는 문을 자동문/);assert.deepEqual((await envelope(page)).completed.find(r=>r.id===manual.id),manual);
    pass('F04 automatic-door replay changes only door conditions, removes holding request and preserves manual day');
    await page.locator('#export-open').click();assert.equal(await page.locator('#export-dialog').isVisible(),true);const exchange=await page.locator('#export-text').inputValue();const payload=JSON.parse(exchange);
    assert.deepEqual(Object.keys(payload).sort(),['schemaVersion','scenarioVersion','scenarioId','conditions','choiceIds'].sort());assert.equal(payload.choiceIds.length,(await state(page)).maxSteps);assert.equal(payload.scenarioVersion,'3');assert.match(await page.locator('#export-feedback').innerText(),/아직/);
    await page.locator('#export-copy').click();assert.deepEqual(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())),payload);assert.match(await page.locator('#export-feedback').innerText(),/복사했습니다/);
    const dlPromise=page.waitForEvent('download');await page.locator('#export-download').click();const dl=await dlPromise;await dl.saveAs(path.join(out,'friend-record.json'));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,'friend-record.json'),'utf8')),payload);await page.locator('#export-close').click();
    pass('F05 minimal preview precedes explicit real clipboard copy and JSON download');
    const beforeImport=(await envelope(page)).imported.length;await page.locator('#import-open').click();await page.locator('#import-text').fill(exchange);await page.locator('#import-preview').click();assert.equal(await page.locator('#import-confirm').isEnabled(),true);assert.equal((await envelope(page)).imported.length,beforeImport);await screenshot(page,'05-import-preview');
    await page.locator('#import-confirm').click();let imp=(await envelope(page)).imported.at(-1);assert.equal((await envelope(page)).imported.length,beforeImport+1);await page.locator('#compare-select').selectOption(automatic.current.id);assert.match(await page.locator('#comparison').innerText(),/같은 이야기와 조건/);
    pass('F05 validated import requires confirmation; equal-condition records compare without ranking');
    await page.locator('#compare-select').selectOption(originalId);assert.match(await page.locator('#comparison').innerText(),/시작 조건이 달라/);
    await page.locator('#import-open').click();
    for(const malicious of [JSON.stringify({...payload,name:'<img src=x onerror=alert(1)>'}),JSON.stringify({...payload,schemaVersion:999}),JSON.stringify({...payload,choiceIds:payload.choiceIds.map((id,index)=>index===0?'forged':id)}),'x'.repeat(16385)]){
      await page.locator('#import-text').fill(malicious);await page.locator('#import-preview').click();assert.equal(await page.locator('#import-confirm').isDisabled(),true);assert.match(await page.locator('#import-feedback').innerText(),/가져올 수 없습니다/);
    }
    await page.locator('#import-text').fill(exchange);await page.locator('#import-preview').click();await page.locator('#import-text').fill(exchange+' ');assert.equal(await page.locator('#import-confirm').isDisabled(),true);await page.locator('#import-close').click();
    pass('F05 mismatched conditions are explained; extra HTML fields, wrong versions, forged IDs and oversized data are rejected');
    page.once('dialog',d=>d.dismiss());await page.locator('#delete-record').click();assert.equal((await envelope(page)).imported.length,beforeImport+1);
    page.once('dialog',d=>d.accept());await page.locator('#delete-record').click();assert.equal((await envelope(page)).imported.length,beforeImport);assert.ok((await envelope(page)).completed.some(r=>r.id===originalId));
    await start(page,'company');await choose(page,0);const countBeforeReset=(await state(page)).storage.completed;
    page.once('dialog',d=>d.accept());await page.locator('#reset-current').click();assert.equal((await envelope(page)).current,null);assert.equal((await state(page)).storage.completed,countBeforeReset);
    await start(page,'planning');await choose(page,0);await page.locator('#library-button').click();page.once('dialog',d=>d.accept());await page.locator('#clear-journals').click();const cleared=await envelope(page);assert.equal(cleared.current.choiceIds.length,1);assert.equal(cleared.completed.length+cleared.replays.length+cleared.imported.length,0);
    pass('F02 explicit delete confirmation, imported-only deletion, current reset and all-journal deletion obey their stated scope');
    await context.close();
    for(const scenario of engine.SCENARIOS.filter(s=>s.id!=='classic')){
      const c=await browser.newContext();const p=await c.newPage();observe(p);await ready(p);await start(p,scenario.id,{helpStyle:'ask',phonePayment:true});if(scenario.id==='home'){await reachScene(p,'S01');await chooseId(p,'S01-help');assert.equal((await state(p)).sceneId,'S07');assert.match(await p.locator('#story-text').innerText(),/다른 것도 해줄까/);}const completed=await finish(p);assert.equal(completed.step,completed.maxSteps);await c.close();
    }
    pass('All five new scenario packs complete through rendered controls, including asked-help and phone-payment conditions');
    for(const [index,label] of [[0,'bottle'],[2,'table']]){
      const c=await browser.newContext();const p=await c.newPage();observe(p);await ready(p);await start(p);await reachScene(p,'S01');await p.locator('#choices button').nth(index).click();await p.evaluate(()=>window.advanceTime(60000));const s=await state(p);assert.equal(s.motion.contextVisual.items.cupLocation,s.context.items.cupLocation);assert.equal(s.motion.contextVisual.items.phoneLocation,s.context.items.phoneLocation);assert.equal(s.motion.contextVisual.items.container,s.context.items.container);await screenshot(p,'10-items-'+label);await c.close();
    }
    pass('S01 cup, bottle and phone drawing matches the chosen container and recorded positions');
    const needsContext=await browser.newContext();const needsPage=await needsContext.newPage();observe(needsPage);await ready(needsPage);await start(needsPage,'doors');await reachScene(needsPage,'S02');await chooseId(needsPage,'S02-ask');await reachScene(needsPage,'S03');await chooseId(needsPage,'S03-coordinate');await reachScene(needsPage,'S09');await chooseId(needsPage,'S09-wait');await reachScene(needsPage,'S10');await chooseId(needsPage,'S10-defer');assert.equal((await state(needsPage)).context.needs.water,'pending');await reachScene(needsPage,'REFLECT',{R05:'R05-later'});assert.equal((await state(needsPage)).context.needs.water,'pending');await chooseId(needsPage,'REFLECT-request');assert.equal((await state(needsPage)).context.needs.water,'received');await finish(needsPage);await needsPage.locator('#open-completed').click();assert.match(await needsPage.locator('#record-scenes').innerText(),/미수령|아직 테이블에 없다/);await screenshot(needsPage,'11-later-request');await needsContext.close();
    pass('S10 deferred water remains pending until a later explicit request receives it and journals both states');
    for(const [name,raw] of [['damaged','{broken'],['old-version',JSON.stringify({schemaVersion:999,scenarioVersion:'1',kept:'기존 기록'})]]){
      const c=await browser.newContext();await c.addInitScript(({key,raw})=>{if(!sessionStorage.getItem('fixture-set')){localStorage.setItem(key,raw);sessionStorage.setItem('fixture-set','1');}},{key:storeAPI.STORAGE_KEY,raw});const p=await c.newPage();observe(p);await ready(p);assert.equal((await state(p)).storage.persistence,'read-only');await start(p);await choose(p);assert.equal(await p.evaluate(key=>localStorage.getItem(key),storeAPI.STORAGE_KEY),raw);await p.locator('#library-button').click();assert.equal(await p.locator('#legacy-text').inputValue(),raw);await p.locator('#backup-button').click();assert.match(await p.locator('#export-text').inputValue(),/preservedStorage/);await screenshot(p,'06-'+name);await c.close();
    }
    pass('F01 damaged and unsupported-version storage remain unchanged with read-only raw view and backup');
    const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError');}});});const bp=await blocked.newPage();observe(bp);await ready(bp);await start(bp);await choose(bp);assert.equal((await state(bp)).storage.persistence,'memory');assert.match(await bp.locator('#save-status').innerText(),/백업/);await finish(bp);await bp.locator('#backup-button').click();assert.ok((await bp.locator('#export-text').inputValue()).includes('choiceIds'));await blocked.close();
    pass('F01 blocked storage keeps a playable memory session with visible backup guidance');
    const denied=await browser.newContext();await denied.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied');}},configurable:true});document.execCommand=()=>false;});const dp=await denied.newPage();observe(dp);await ready(dp);await start(dp);await finish(dp);await dp.locator('#open-completed').click();await dp.locator('#export-open').click();await dp.locator('#export-copy').click();assert.match(await dp.locator('#export-feedback').innerText(),/직접 복사/);assert.equal(await dp.evaluate(()=>document.activeElement.id),'export-text');await denied.close();
    pass('F05 denied copy keeps selected preview text and file alternative without false success');
    let legacyRaw=null;
    const fixtureStore=storeAPI.create({engine:legacyEngine,storage:{getItem:()=>legacyRaw,setItem:(key,value)=>{legacyRaw=value;}}});
    fixtureStore.start({scenarioId:'doors'});fixtureStore.commit(0);fixtureStore.continue();const fixtureRaw=legacyRaw;
    const lc=await browser.newContext();await lc.addInitScript(({key,raw})=>{if(!sessionStorage.getItem('legacy-fixture-set')){localStorage.setItem(key,raw);sessionStorage.setItem('legacy-fixture-set','1');}},{key:storeAPI.STORAGE_KEY,raw:fixtureRaw});
    const lp=await lc.newPage();observe(lp);await ready(lp);const oldStart=await state(lp);assert.equal(oldStart.scenarioVersion,'2');assert.equal(oldStart.maxSteps,5);assert.equal(oldStart.step,1);assert.equal(oldStart.sceneId,'S03');assert.equal(await lp.evaluate(key=>localStorage.getItem(key),storeAPI.STORAGE_KEY),fixtureRaw,'opening a known v2 envelope must not write to disk');
    await finish(lp);let mixed=await envelope(lp);const oldComplete=mixed.completed[0];assert.equal(mixed.scenarioVersion,'3');assert.equal(oldComplete.scenarioVersion,'2');assert.equal(oldComplete.choiceIds.length,5);
    await lp.locator('#open-completed').click();await journalLayout(lp,'#record-scenes',5);await lp.locator('#export-open').click();const oldExchange=await lp.locator('#export-text').inputValue();assert.equal(JSON.parse(oldExchange).scenarioVersion,'2');assert.equal(JSON.parse(oldExchange).choiceIds.length,5);await lp.locator('#export-close').click();
    await lp.locator('#record-scenes li').first().locator('button').click();assert.equal((await state(lp)).scenarioVersion,'2');assert.equal((await state(lp)).maxSteps,5);await choose(lp,2);await finish(lp);mixed=await envelope(lp);assert.equal(mixed.replays.at(-1).scenarioVersion,'2');assert.deepEqual(mixed.completed[0],oldComplete);
    await lp.locator('#open-completed').click();await lp.locator('#import-open').click();await lp.locator('#import-text').fill(oldExchange);await lp.locator('#import-preview').click();assert.equal(await lp.locator('#import-confirm').isEnabled(),true);await lp.locator('#import-confirm').click();assert.equal((await envelope(lp)).imported.at(-1).scenarioVersion,'2');
    await start(lp,'doors');assert.equal((await state(lp)).scenarioVersion,'3');await finish(lp);await lp.locator('#open-completed').click();await lp.locator('#compare-select').selectOption(oldComplete.id);assert.match(await lp.locator('#comparison').innerText(),/이야기 버전/);assert.deepEqual((await envelope(lp)).completed.find(r=>r.id===oldComplete.id),oldComplete);await screenshot(lp,'12-version-mixed');await lc.close();
    pass('Known v2 save loads without writing, finishes and branches in five choices, exports/imports unchanged and compares explicitly with v3');
    for(const width of [320,390]){
      const c=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:true,hasTouch:true});const p=await c.newPage();observe(p);await ready(p);await noOverflow(p);await start(p,'doors');await noOverflow(p);await p.locator('#choices button').first().tap();await noOverflow(p);await p.locator('#continue-button').tap();await finish(p);await p.locator('#open-completed').tap();await noOverflow(p);await screenshot(p,`07-mobile-${width}-journal`);await p.locator('#export-open').tap();await noOverflow(p);await screenshot(p,`08-mobile-${width}-export`);await p.locator('#export-close').tap();await c.close();
    }
    pass('320×568 and 390×844 touch layouts keep story, journal and exchange dialogs within the viewport');
    const kc=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});const kp=await kc.newPage();observe(kp);await ready(kp);await tabTo(kp,'#start-button');await kp.keyboard.press('Enter');
    while((await state(kp)).mode!=='result'){await kp.keyboard.press('1');assert.equal((await state(kp)).mode,'reaction');await tabTo(kp,'#continue-button');await kp.keyboard.press('Enter');}
    await tabTo(kp,'#open-completed');await kp.keyboard.press('Enter');await tabTo(kp,'#export-open');await kp.keyboard.press('Enter');await tabTo(kp,'#export-copy');await kp.keyboard.press('Enter');await kp.keyboard.press('Escape');await tabTo(kp,'#record-scenes li:first-child button');await kp.keyboard.press('Enter');assert.equal((await state(kp)).step,0);assert.equal((await state(kp)).reducedMotion,true);assert.equal((await state(kp)).motion.moving,false);
    await kp.evaluate(()=>{document.documentElement.style.zoom='2';});await noOverflow(kp);await screenshot(kp,'09-keyboard-zoom-reduced');await kc.close();
    pass('Keyboard-only start, version-length day, ending, journal, copy dialog and branch; reduced motion and 200% zoom');
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);pass('No automatic external requests, JavaScript exceptions or console errors');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,external},null,2));
  }finally{await browser.close();}
})().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,checks,errors,external},null,2));console.error(error);process.exitCode=1;});
