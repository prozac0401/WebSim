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
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}
async function legacy(page) {
  await page.goto(base + 'weekend_recovery_simulator/weekend_recovery_simulator.html');
  await page.locator('#wrs-sample').click();
  const before = await textState(page);
  await page.locator('#wrs-remember').click();
  await page.locator('#wrs-clear').click();
  const cleared = await textState(page);
  assert.notDeepEqual(before, cleared);
  await page.locator('#wrs-restore').click();
  const restored = await textState(page);
  assert.ok(before.events.length > 0);
  assert.equal(cleared.events.length, 0);
  assert.deepEqual(restored.events, before.events);
  assert.equal(restored.score, before.score);
  await page.locator('.lab-switcher summary').click();
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
  for(const role of ['worker','seeker','graduate','caregiver']) {
    await page.locator(`[data-preset="${role}"]`).click();
    assert.equal(await page.locator('[name="role"]').inputValue(),role);
  }
  await page.locator('[data-preset="worker"]').click();
  await page.locator('[name="age"]').fill('35');
  await page.locator('#start-btn').focus(); await page.keyboard.press('Enter');
  assert.equal((await textState(page)).mode,'planning');
  assert.equal((await textState(page)).date,'2026-01-01');
  record('4개 프리셋·환경 수정·키보드 새해 시작');
  async function place(id,date,slot,method='cash') {
    await page.locator(`[data-activity="${id}"]`).click();
    await page.locator('#payment').selectOption(method);
    await page.locator(`.slot[data-date="${date}"][data-slot="${slot}"]`).click();
    assert.ok((await textState(page)).plan.some(p=>p.date===date&&p.slot===slot&&p.activityId===id));
  }
  await place('read','2026-01-01','morning');
  await place('study','2026-01-03','morning');
  await place('photo','2026-01-03','afternoon','card');
  await place('overtime','2026-01-04','afternoon');
  await shot(page,'planning-desktop');
  await page.locator('.tab[data-tab="routines"]').click();
  async function rule(id) {
    await page.locator('#rule-form [name="activityId"]').selectOption(id);
    await page.locator('#rule-form [name="anchor"]').fill('2026-01-02');
    await page.locator('#rule-form [name="slot"]').selectOption('evening');
    await page.locator('#rule-form button[type="submit"]').click();
  }
  await rule('read');
  let reservation=(await textState(page)).reservations[0];
  assert.equal(reservation.originalDate,'2026-01-02'); assert.equal(reservation.date,'2026-01-03');
  await page.locator('#confirm-reservations').click();
  await rule('garden');
  await page.locator('#confirm-reservations').click();
  assert.ok((await textState(page)).reservations.some(r=>r.activityId==='garden'));
  reservation=(await textState(page)).reservations.find(r=>r.activityId==='garden');
  await page.locator(`[data-reserve-postpone="${reservation.id}"]`).click();
  await page.locator('.inline-form [name="date"]').fill('2026-01-04');
  await page.locator('.inline-form button[type="submit"]').click();
  assert.equal((await textState(page)).reservations.find(r=>r.activityId==='garden').date,'2026-01-04');
  await page.locator(`[data-reserve-skip="${reservation.id}"]`).click();
  await page.locator(`[data-rule-stop="${reservation.ruleId}"]`).click();
  assert.ok(!(await textState(page)).reservations.some(r=>r.activityId==='garden'));
  assert.equal(await page.evaluate(()=>S2Storage.load().ok),true,'routine decisions remain valid saves');
  record('평일 반복 이동 확인·일괄 확정·충돌·미루기·건너뛰기·중단');
  await shot(page,'routines-desktop');
  await page.locator('.tab[data-tab="planner"]').click();
  await page.locator('#advance-week').click();
  async function eventChoice() {
    const before=await textState(page);
    for(const choice of before.pendingEvent.choices) {
      await page.locator(`[data-choice="${choice.id}"]`).click();
      if((await textState(page)).mode!=='event')return;
    }
    throw Error(`No usable UI event choice: ${JSON.stringify(before.pendingEvent)}`);
  }
  async function finishWeek() {
    for(let i=0;i<30;i++) {
      const s=await textState(page);
      if(s.mode==='review'||s.mode==='finished')return;
      if(s.mode==='event')await eventChoice();
      else await page.locator('#advance-week').click();
    }
    throw Error('UI week did not finish');
  }
  await finishWeek();
  assert.equal((await textState(page)).date,'2026-01-04');
  assert.equal((await textState(page)).finance.pending,12000);
  assert.equal((await textState(page)).finance.pendingPay,90000);
  assert.ok((await textState(page)).stats.preparation>0);
  assert.ok((await textState(page)).artifactCount>0);
  await page.locator('#replay-next').click();
  assert.ok((await page.locator('.review-list').innerText()).includes('다른 선택을 위해 스스로 조정한 일정입니다.'));
  await shot(page,'week-scenes-desktop');
  await page.locator('#continue-week').click();
  await page.locator('.tab[data-tab="routines"]').click(); await page.locator('#confirm-reservations').click();
  await page.locator('.tab[data-tab="planner"]').click();
  await place('photo','2026-01-10','afternoon');
  await page.locator('#advance-week').click();await finishWeek();
  assert.equal((await textState(page)).date,'2026-01-11');
  assert.ok((await textState(page)).artifactCount>=2);
  record('첫 두 주: 공부·추가근무·카드 사진·취미 결과물·장면 재생·주중 진행');
  const saved=await textState(page);
  await page.locator('#save-game').click();await page.reload();await page.locator('#resume-game').click();
  const restored=await textState(page);
  for(const key of ['mode','date','stats','finance','plan','artifactCount','logCount'])assert.deepEqual(restored[key],saved[key],key);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-save').click();
  const download=await downloadPromise, savePath=path.join(output,'ui-save.json');await download.saveAs(savePath);
  const imported=JSON.parse(fs.readFileSync(savePath,'utf8'));assert.equal(imported.version,1);
  await page.locator('#continue-week').click();
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
    else if(s.mode==='review')await page.locator('#continue-week').click();
    else {
      if(s.reservations.length) {
        await page.locator('.tab[data-tab="routines"]').click();
        await page.locator('#confirm-reservations').click();
        const pending=(await textState(page)).reservations;
        for(const r of pending)await page.locator(`[data-reserve-skip="${r.id}"]`).click();
        await page.locator('.tab[data-tab="planner"]').click();
      }
      await page.locator('#advance-choice').click();
    }
  }
  assert.equal((await textState(page)).mode,'finished');
  const full=await page.evaluate(()=>{const s=S2Storage.load();return {ok:s.ok,reason:s.reason,summary:s.ok?S2Engine.getSummary(s.state):null};});
  assert.equal(full.ok,true,full.reason); assert.equal(full.summary.daysPlayed,365);
  assert.equal(full.summary.finance.consumption,full.summary.log.filter(x=>x.type==='activity').reduce((n,l)=>n+l.cost,0)+18000000+full.summary.log.filter(x=>x.type==='event'&&['repair','take','join'].includes(x.choiceId)).reduce((n,l)=>n+({repair:35000,take:20000,join:10000}[l.choiceId]),0));
  fs.writeFileSync(path.join(output,'ui-year-summary.json'),JSON.stringify(full.summary,null,2));
  await shot(page,'yearbook-desktop');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(output,'yearbook-overview.png')});
  record('실제 브라우저에서 1월1일~12월31일 완주·365일 회고·장부와 활동 합계 일치');

  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const mobile=await context.newPage();observe(mobile);
  await mobile.goto(base+'weekend_season2/index.html');
  await mobile.locator('[data-preset="caregiver"]').tap();await shot(mobile,'setup-mobile');
  await mobile.locator('#start-btn').tap();
  await mobile.locator('[data-activity="read"]').tap();
  await mobile.locator('.slot[data-date="2026-01-01"][data-slot="afternoon"]').tap();
  assert.ok((await textState(mobile)).plan.some(p=>p.activityId==='read'));
  assert.equal((await textState(mobile)).scene.reducedMotion,true);
  const dimensions=await mobile.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));
  const canvasBefore=await mobile.locator('canvas').screenshot();
  await mobile.evaluate(()=>advanceTime(1000));
  assert.deepEqual(await mobile.locator('canvas').screenshot(),canvasBefore,'reduced motion freezes decorative canvas');
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
(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); observe(page);
    await legacy(page);
    if (!process.argv.includes('--legacy-only')) await season(page, browser);
    assert.deepEqual(errors, []);
    record('브라우저 pageerror 및 console.error 없음');
    fs.rmSync(path.join(output,'failure.json'),{force:true});
    fs.writeFileSync(path.join(output, process.argv.includes('--legacy-only') ? 'legacy-result.json' : 'result.json'), JSON.stringify({ status:'PASS', checks, errors }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({status:'FAIL',checks,errors,error:error.stack}, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
