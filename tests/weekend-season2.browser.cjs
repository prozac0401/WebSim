// Real Chromium integration checks. Serve the repository on WEBSIM_URL first.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright'); }
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8766/').replace(/\/?$/, '/');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/weekend-season2');
const checks = [], errors = [];
fs.mkdirSync(output, { recursive: true });
const record = label => { checks.push(label); console.log('PASS', label); };
const shot = (page, name) => page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
const textState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function reveal(page, target) {
  const closed = await target.evaluate(element => [...document.querySelectorAll('details')].map((details,index)=>({details,index})).filter(({details})=>details.contains(element)&&!details.open&&!details.querySelector(':scope > summary')?.contains(element)).map(({index})=>index));
  for (const index of closed) await page.locator('details').nth(index).locator(':scope > summary').click();
}
async function click(page, selector) { const target=page.locator(selector); await reveal(page,target); await target.click(); }
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}
async function legacy(page) {
  await page.goto(base + 'weekend_recovery_simulator/weekend_recovery_simulator.html');
  await click(page,'#wrs-sample');
  const before = await textState(page);
  await click(page,'#wrs-remember');
  await click(page,'#wrs-clear');
  const cleared = await textState(page);
  assert.notDeepEqual(before, cleared);
  await click(page,'#wrs-restore');
  const restored = await textState(page);
  assert.ok(before.events.length > 0);
  assert.equal(cleared.events.length, 0);
  assert.deepEqual(restored.events, before.events);
  assert.equal(restored.score, before.score);
  await click(page,'.lab-switcher summary');
  assert.ok(await page.locator('.lab-switcher a[href$="weekend_season2/index.html"]').count());
  record('기존 플래너 샘플·기억·비우기·복원 및 시즌2 탐색 링크');
  await page.goto(base);
  assert.equal(await page.locator('.tool-card').count(), 29);
  await page.locator('#search').fill('시즌2');
  assert.equal(await page.locator('.tool-card:visible').count(), 1);
  assert.equal(await page.locator('.tool-card:visible h3').innerText(), '주말 계획표 시즌2');
  record('홈 29개 도구·검색·기존 플래너와 별도 진입점');
  await page.goto(base + 'weekend_season2/weekend_season2_doc.html');
  assert.ok(await page.locator('.doc-toc').count());
  await shot(page, 'guide');
  record('사용법·자료 페이지와 목차 렌더링');
}
async function season(page, browser) {
  const requests=[];
  page.on('request',request=>requests.push(request.url()));
  await page.goto(base+'weekend_season2/index.html');
  await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  await shot(page,'setup-desktop');
  assert.equal(await page.locator('#advanced-settings').getAttribute('open'),null);
  assert.equal(await page.locator('#setup-form input:visible').count(),0);
  await click(page,'#reroll-life');
  assert.equal((await textState(page)).mode,'setup');
  record('자동 배정된 가상 인생·다른 삶 만나기·기본 설정 입력 숨김');
  await reveal(page,page.locator('[data-preset="worker"]'));
  for(const role of ['worker','seeker','graduate','caregiver']) {
    await click(page,`[data-preset="${role}"]`);
    assert.equal(await page.locator('[name="role"]').inputValue(),role);
  }
  await click(page,'[data-preset="worker"]');
  await page.locator('[name="age"]').fill('35');
  await page.locator('#start-btn').focus(); await page.keyboard.press('Enter');
  assert.equal((await textState(page)).mode,'planning');
  assert.equal((await textState(page)).date,'2026-01-01');
  record('4개 프리셋·환경 수정·키보드 새해 시작');
  async function place(id,date,slot,method='cash') {
    await reveal(page,page.locator(`[data-activity="${id}"]`));
    await click(page,`[data-activity="${id}"]`);
    await page.locator('#payment').selectOption(method);
    await click(page,`.slot[data-date="${date}"][data-slot="${slot}"]`);
    assert.ok((await textState(page)).plan.some(p=>p.date===date&&p.slot===slot&&p.activityId===id));
  }
  await place('read','2026-01-01','morning');
  await place('study','2026-01-03','morning');
  await place('photo','2026-01-03','afternoon','card');
  await place('overtime','2026-01-04','afternoon');
  await shot(page,'planning-desktop');
  await click(page,'.tab[data-tab="routines"]');
  async function rule(id) {
    await page.locator('#rule-form [name="activityId"]').selectOption(id);
    await page.locator('#rule-form [name="anchor"]').fill('2026-01-02');
    await page.locator('#rule-form [name="slot"]').selectOption('evening');
    await click(page,'#rule-form button[type="submit"]');
  }
  await rule('read');
  let reservation=(await textState(page)).reservations[0];
  assert.equal(reservation.originalDate,'2026-01-02'); assert.equal(reservation.date,'2026-01-03');
  await click(page,'#confirm-reservations');
  await rule('garden');
  await click(page,'#confirm-reservations');
  assert.ok((await textState(page)).reservations.some(r=>r.activityId==='garden'));
  reservation=(await textState(page)).reservations.find(r=>r.activityId==='garden');
  await click(page,`[data-reserve-postpone="${reservation.id}"]`);
  await page.locator('.inline-form [name="date"]').fill('2026-01-04');
  await click(page,'.inline-form button[type="submit"]');
  assert.equal((await textState(page)).reservations.find(r=>r.activityId==='garden').date,'2026-01-04');
  await click(page,`[data-reserve-skip="${reservation.id}"]`);
  await click(page,`[data-rule-stop="${reservation.ruleId}"]`);
  assert.ok(!(await textState(page)).reservations.some(r=>r.activityId==='garden'));
  assert.equal(await page.evaluate(()=>S2Storage.load().ok),true,'routine decisions remain valid saves');
  record('평일 반복 이동 확인·일괄 확정·충돌·미루기·건너뛰기·중단');
  await shot(page,'routines-desktop');
  await click(page,'.tab[data-tab="planner"]');
  await click(page,'#advance-week');
  async function eventChoice() {
    const before=await textState(page);
    for(const choice of before.pendingEvent.choices) {
      await click(page,`[data-choice="${choice.id}"]`);
      if((await textState(page)).mode!=='event')return;
    }
    throw Error(`No usable UI event choice: ${JSON.stringify(before.pendingEvent)}`);
  }
  async function finishWeek() {
    for(let i=0;i<30;i++) {
      const s=await textState(page);
      if(s.mode==='review'||s.mode==='finished')return;
      if(s.mode==='event')await eventChoice();
      else await click(page,'#advance-week');
    }
    throw Error('UI week did not finish');
  }
  await finishWeek();
  assert.equal((await textState(page)).date,'2026-01-04');
  assert.equal((await textState(page)).finance.pending,12000);
  assert.equal((await textState(page)).finance.pendingPay,90000);
  assert.ok((await textState(page)).stats.preparation>0);
  assert.ok((await textState(page)).artifactCount>0);
  await click(page,'#replay-next');
  await reveal(page,page.locator('.review-records .review-list'));
  assert.ok((await page.locator('.review-records .review-list').innerText()).includes('다른 선택을 위해 스스로 조정한 일정입니다.'));
  await shot(page,'week-scenes-desktop');
  await click(page,'#continue-week');
  await click(page,'.tab[data-tab="routines"]'); await click(page,'#confirm-reservations');
  await click(page,'.tab[data-tab="planner"]');
  await place('photo','2026-01-10','afternoon');
  await click(page,'#advance-week');await finishWeek();
  assert.equal((await textState(page)).date,'2026-01-11');
  assert.ok((await textState(page)).artifactCount>=2);
  record('첫 두 주: 공부·추가근무·카드 사진·취미 결과물·장면 재생·주중 진행');
  const saved=await textState(page);
  await click(page,'#save-game');await page.reload();await click(page,'#resume-game');
  const restored=await textState(page);
  for(const key of ['mode','date','stats','finance','plan','artifactCount','logCount'])assert.deepEqual(restored[key],saved[key],key);
  const downloadPromise=page.waitForEvent('download');await click(page,'#export-save');
  const download=await downloadPromise, savePath=path.join(output,'ui-save.json');await download.saveAs(savePath);
  const imported=JSON.parse(fs.readFileSync(savePath,'utf8'));assert.equal(imported.version,2);
  await click(page,'#continue-week');
  const current=await textState(page), rawBefore=await page.evaluate(()=>localStorage.getItem(S2Storage.KEY));
  await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":999}')});
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('지원'));
  assert.equal(await page.evaluate(()=>localStorage.getItem(S2Storage.KEY)),rawBefore);
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#import-file').setInputFiles(savePath);
  await page.waitForTimeout(80);assert.equal((await textState(page)).date,current.date);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#import-file').setInputFiles(savePath);
  await page.waitForFunction(date=>JSON.parse(render_game_to_text()).date===date,saved.date);
  assert.equal((await textState(page)).mode,saved.mode);
  record('브라우저 저장 복원·JSON 다운로드·손상 파일 거절·덮어쓰기 취소 및 승인');
  // Continue the actual UI game to the end; each event is answered through buttons.
  let loops=0,eventShot=false;
  while((await textState(page)).mode!=='finished'&&loops++<500) {
    const s=await textState(page);
    if(s.mode==='event') { if(!eventShot){await shot(page,'event-desktop');eventShot=true;} await eventChoice(); }
    else if(s.mode==='review')await click(page,'#continue-week');
    else {
      if(s.reservations.length) {
        await click(page,'.tab[data-tab="routines"]');
        await click(page,'#confirm-reservations');
        const pending=(await textState(page)).reservations;
        for(const r of pending)await click(page,`[data-reserve-skip="${r.id}"]`);
        await click(page,'.tab[data-tab="planner"]');
      }
      await click(page,'#advance-choice');
    }
  }
  assert.equal((await textState(page)).mode,'finished');
  const full=await page.evaluate(()=>{const s=S2Storage.load();return {ok:s.ok,reason:s.reason,summary:s.ok?S2Engine.getSummary(s.state):null,ledgerConsumption:s.ok?s.state.finance.ledger.reduce((sum,row)=>sum+row.consumption,0):null};});
  assert.equal(full.ok,true,full.reason); assert.equal(full.summary.daysPlayed,365);
  assert.equal(full.summary.finance.consumption,full.ledgerConsumption);
  fs.writeFileSync(path.join(output,'ui-year-summary.json'),JSON.stringify(full.summary,null,2));
  await shot(page,'yearbook-desktop');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(output,'yearbook-overview.png')});
  record('실제 브라우저에서 1월1일~12월31일 완주·365일 회고·장부와 활동 합계 일치');

  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const mobile=await context.newPage();observe(mobile);
  await mobile.goto(base+'weekend_season2/index.html');
  await reveal(mobile,mobile.locator('[data-preset="caregiver"]'));
  await mobile.locator('[data-preset="caregiver"]').tap();
  await mobile.locator('#advanced-settings > summary').tap();
  await shot(mobile,'setup-mobile');
  await mobile.locator('#start-btn').tap();
  await reveal(mobile,mobile.locator('[data-activity="read"]'));
  await mobile.locator('[data-activity="read"]').tap();
  await mobile.locator('.slot[data-date="2026-01-01"][data-slot="afternoon"]').tap();
  assert.ok((await textState(mobile)).plan.some(p=>p.activityId==='read'));
  assert.equal((await textState(mobile)).scene.reducedMotion,true);
  const dimensions=await mobile.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));
  const canvasBefore=await mobile.locator('canvas').screenshot();
  await mobile.evaluate(()=>advanceTime(1000));
  assert.deepEqual(await mobile.locator('canvas').screenshot(),canvasBefore,'reduced motion freezes decorative canvas');
  await reveal(mobile,mobile.locator('#save-game'));
  await mobile.locator('#save-game').focus();await mobile.keyboard.press('Tab');
  assert.equal(await mobile.evaluate(()=>document.activeElement.id),'export-save');
  await shot(mobile,'planning-mobile');
  await mobile.locator('#advance-week').tap();
  assert.ok(['review','event'].includes((await textState(mobile)).mode));
  await shot(mobile,'review-mobile');
  record('390px 모바일 터치·가로 넘침 없음·키보드 이동·동작 줄이기 정지 화면');
  assert.ok(requests.every(url=>url.startsWith(base)), 'game loads only local resources');
  record('게임 실행 중 외부 요청·분석 SDK 없음');
  await context.close();
}
async function compactLife(browser) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();observe(page);
  await page.goto(base+'weekend_season2/index.html');
  await page.waitForFunction(()=>typeof render_game_to_text==='function');
  const setupSize=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,view:innerWidth}));
  assert.ok(setupSize.height<=1350,`default setup is too long: ${setupSize.height}px`);
  assert.ok(setupSize.width<=setupSize.view+1);
  const startBox=await page.locator('#start-btn').boundingBox();
  assert.ok(startBox.y>=0&&startBox.y+startBox.height<=844,'start button is in first mobile viewport');
  assert.equal(await page.locator('#setup-form input:visible').count(),0);
  await shot(page,'compact-default-mobile');
  await click(page,'[data-preset="caregiver"]');
  const gender=page.locator('[name="gender"]');await reveal(page,gender);
  await gender.selectOption('man');
  const male=await page.locator('canvas').screenshot();
  await gender.selectOption('woman');
  const female=await page.locator('canvas').screenshot();
  assert.notDeepEqual(female,male,'gender selection updates the rendered character');
  await reveal(page,page.locator('[name="children"]'));
  await page.locator('[name="children"]').fill('0');
  const noChildren=await page.locator('canvas').screenshot();
  await page.locator('[name="children"]').fill('2');
  await page.locator('[name="childAge"]').selectOption('school');
  const withChildren=await page.locator('canvas').screenshot();
  assert.notDeepEqual(noChildren,withChildren,'children appear in the family illustration');
  await page.locator('[name="maritalStatus"]').selectOption('single');
  const single=await page.locator('canvas').screenshot();
  await page.locator('[name="maritalStatus"]').selectOption('married');
  assert.notDeepEqual(single,await page.locator('canvas').screenshot(),'married household adds partner');
  await reveal(page,page.locator('[name="startCash"]'));
  assert.equal(await page.locator('[name="startCash"]').inputValue(),'180');
  await page.locator('[name="startCash"]').fill('180.05');
  await page.locator('#advanced-settings > summary').click();
  await shot(page,'family-woman-children-mobile');
  await click(page,'#start-btn');
  assert.equal((await textState(page)).finance.cash,1800500,'만원 input preserves integer won');
  const auto=page.locator('#auto-play');
  await page.evaluate(()=>scrollTo(0,0));
  const autoBox=await auto.boundingBox();
  assert.ok(autoBox.y>=0&&autoBox.y+autoBox.height<=844,'automatic play is visible without scrolling');
  assert.equal(await page.locator('.slot:visible').count(),0,'full planner starts collapsed');
  assert.equal(await page.locator('.activity-card:visible').count(),0,'catalogue starts collapsed');
  const gameSize=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,view:innerWidth}));
  assert.ok(gameSize.height<=1450,`default play screen is too long: ${gameSize.height}px`);
  assert.ok(gameSize.width<=gameSize.view+1);
  const body=await page.locator('body').innerText();assert.ok(body.includes('180.05만원'));
  await shot(page,'compact-play-mobile');
  await auto.tap();
  assert.equal(await auto.getAttribute('data-playing'),'true');
  await auto.tap();
  assert.equal(await auto.getAttribute('data-playing'),'false');
  const paused=await textState(page);await page.waitForTimeout(1200);
  assert.equal((await textState(page)).date,paused.date,'pause prevents date changes');
  record('짧은 모바일 시작·플레이 화면, 첫 화면 자동진행·일시정지, 여성·배우자·자녀 삽화, 만원 소수 입력');
  let turns=0,eventCount=0;
  while((await textState(page)).mode!=='finished'&&turns++<200) {
    const state=await textState(page);
    if(state.mode==='event') {
      assert.equal(await auto.getAttribute('data-playing'),'false','autoplay stops for a human choice');
      eventCount++;
      let handled=false;
      for(const choice of state.pendingEvent.choices) {
        await click(page,`[data-choice="${choice.id}"]`);
        if((await textState(page)).mode!=='event'){handled=true;break;}
      }
      assert.ok(handled,'event has an affordable usable response');
    } else {
      assert.equal(state.reservations.length,0);
      await auto.tap();
      await page.waitForFunction(()=>document.querySelector('#auto-play')?.dataset.playing!=='true',null,{timeout:45000});
      const after=await textState(page);
      assert.ok(after.mode==='event'||after.mode==='finished',`automatic life stopped at ${after.date} / ${after.mode}: ${await page.locator('.auto-note').allTextContents()}`);
    }
  }
  assert.equal((await textState(page)).mode,'finished');assert.ok(eventCount>0);
  const saved=await page.evaluate(()=>{const r=S2Storage.load();return {ok:r.ok,summary:r.ok?S2Engine.getSummary(r.state):null,config:r.state?.config};});
  assert.equal(saved.ok,true);assert.equal(saved.summary.daysPlayed,365);
  assert.ok(Object.values(saved.summary.activityCounts).reduce((a,b)=>a+b,0)>30,'autoplay supplies actual activities throughout the year');
  assert.equal(saved.config.maritalStatus,'married');assert.equal(saved.config.children,2);
  await shot(page,'automatic-year-mobile');
  fs.writeFileSync(path.join(output,'automatic-year-summary.json'),JSON.stringify(saved.summary,null,2));
  record('자동일정·주간 재생으로 365일 완주, 사건에서 멈춤, 기혼·자녀 설정과 실제 활동 기록 유지');
  await context.close();
}
(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); observe(page);
    if(!process.argv.includes('--compact-only')) await legacy(page);
    if (!process.argv.includes('--legacy-only')) { if(!process.argv.includes('--compact-only'))await season(page, browser); await compactLife(browser); }
    assert.deepEqual(errors, []);
    record('브라우저 pageerror 및 console.error 없음');
    fs.rmSync(path.join(output,'failure.json'),{force:true});
    fs.writeFileSync(path.join(output, process.argv.includes('--legacy-only') ? 'legacy-result.json' : 'result.json'), JSON.stringify({ status:'PASS', checks, errors }, null, 2));
  } catch (error) {
    const lastPage=browser.contexts().flatMap(context=>context.pages()).at(-1);
    let state=null;
    try {if(lastPage){state=await textState(lastPage);await shot(lastPage,'failure-screen');}}catch(_){}
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({status:'FAIL',checks,errors,state,error:error.stack}, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
