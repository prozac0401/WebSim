// Real UI coverage for randomized rooms, mobile choreography and saved-day restoration.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');
const {storyViewport,animationViewport}=require('./saturday-story-viewport.cjs');
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8766/').replace(/\/?$/,'/');
const out=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/saturday-rooms');
const layouts=['window-left','window-right','wide-living','compact-studio'];
const names=['왼쪽 창가 거실','오른쪽 창가 거실','넓은 거실','작은 원룸'];
const checks=[],errors=[],measurements=[],pictures=new Set();
const state=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
const advance=(p,ms)=>p.evaluate(ms=>advanceTime(ms),ms);
const canonical=s=>({step:s.step,conditions:s.conditions,energy:s.energy,mood:s.mood,body:s.body,minuteOfDay:s.minuteOfDay,context:s.context});
const pass=name=>{checks.push(name);console.log('PASS',name);};
(async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
  try{
    for(const width of [320,390])for(const [index,roomLayout]of layouts.entries()){
      const context=await browser.newContext({viewport:{width,height:700},isMobile:true,hasTouch:true});
      await context.addInitScript(values=>{window.roomDraws=0;Math.random=()=>values[window.roomDraws++]??0;},[0,0,0,.8,.6,(index+.5)/4,0]);
      const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await p.goto(base+'stopped_saturday/stopped_saturday.html');await advance(p,0);
      assert.equal(await p.evaluate(()=>roomDraws),0);
      await p.locator('#scenario-select').selectOption('home');await p.locator('#start-button').tap();
      const initial=await state(p),appearance={gender:'female',hairStyle:'bob'};
      assert.equal(initial.conditions.roomLayout,roomLayout);assert.equal(initial.motion.roomLayout,roomLayout);
      assert.deepEqual(initial.motion.appearance,appearance);assert.equal(await p.evaluate(()=>roomDraws),7);
      assert.equal(await p.locator('#scene-place').innerText(),names[index]);
      if(width===390)pictures.add(await p.locator('#day-canvas').evaluate(c=>c.toDataURL()));
      measurements.push(await storyViewport(p,`${width}/${roomLayout}: start`));
      // Commit once, look at the new room's animation, then interrupt it with a reload.
      await p.locator('#choices button').first().tap();const committed=await state(p);
      await advance(p,1500);measurements.push(await animationViewport(p,`${width}/${roomLayout}: animation`));
      await p.screenshot({path:path.join(out,`${width}-${roomLayout}-animation.png`)});
      await p.reload();await advance(p,0);
      assert.equal((await state(p)).mode,'reaction');assert.deepEqual(canonical(await state(p)),canonical(committed));
      assert.equal((await state(p)).motion.roomLayout,roomLayout);assert.deepEqual((await state(p)).motion.appearance,appearance);
      assert.equal(await p.evaluate(()=>roomDraws),0,'restoring the room never consumes new random values');
      measurements.push(await storyViewport(p,`${width}/${roomLayout}: restored reaction`));
      await p.locator('#continue-button').tap();let guard=0,walkingShot=false;
      while((await state(p)).mode==='game'){
        assert.ok(++guard<=12);const before=await state(p);await p.locator('#choices button').first().tap();
        const chosen=await state(p);assert.equal(chosen.mode,'animation');assert.equal(chosen.minuteOfDay,before.minuteOfDay+before.choiceDurations[0]);
        assert.equal(chosen.motion.roomLayout,roomLayout);assert.deepEqual(chosen.motion.appearance,appearance);
        if(!walkingShot&&chosen.motion.kind==='walk'&&chosen.motion.location==='room'){
          await advance(p,2000);measurements.push(await animationViewport(p,`${width}/${roomLayout}: walking`));
          await p.screenshot({path:path.join(out,`${width}-${roomLayout}-walking.png`)});walkingShot=true;
        }
        await p.locator('#skip-animation').tap();assert.equal((await state(p)).mode,'reaction');
        assert.deepEqual(canonical(await state(p)),canonical(chosen));
        measurements.push(await storyViewport(p,`${width}/${roomLayout}: reaction ${chosen.step}`));
        await p.locator('#continue-button').tap();
      }
      const result=await state(p);assert.equal(result.mode,'result');assert.equal(result.step,12);assert.equal(result.motion.roomLayout,roomLayout);
      assert.equal(await p.locator('#scene-place').innerText(),names[index]);assert.equal(await p.evaluate(()=>roomDraws),0);
      assert.equal(walkingShot,true,'the room is exercised during an actual walk');
      await p.reload();await advance(p,0);assert.equal((await state(p)).mode,'result');assert.equal((await state(p)).motion.roomLayout,roomLayout);
      measurements.push(await storyViewport(p,`${width}/${roomLayout}: restored result`));await context.close();
      pass(`${width}px ${roomLayout}: room and character persist through real choices, walking, skip, mid-animation reload and final result`);
    }
    const cafeContext=await browser.newContext({viewport:{width:390,height:700}});
    await cafeContext.addInitScript(()=>{const values=[0,0,0,.8,.6,.8,0];let n=0;Math.random=()=>values[n++]??0;});
    const cafe=await cafeContext.newPage();cafe.on('pageerror',e=>errors.push(e.message));cafe.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await cafe.goto(base+'stopped_saturday/stopped_saturday.html');await advance(cafe,0);
    await cafe.locator('#scenario-select').selectOption('doors');await cafe.locator('#start-button').click();let steps=0;
    while((await state(cafe)).sceneId!=='S09'){
      assert.ok(++steps<12);await cafe.locator('#choices button').first().click();await cafe.locator('#skip-animation').click();await cafe.locator('#continue-button').click();
    }
    const waiting=(await state(cafe)).choiceIds.indexOf('S09-wait');assert.ok(waiting>=0);
    await cafe.locator('#choices button').nth(waiting).click();
    assert.equal((await state(cafe)).context.location,'cafe');assert.equal(await cafe.locator('#scene-place').innerText(),'SATURDAY');
    assert.doesNotMatch(await cafe.locator('#day-canvas').getAttribute('aria-label'),/원룸|거실/,'a seated cafe scene is not labelled as home');
    await cafeContext.close();pass('A cafe seat never receives the randomized home name or room description');
    assert.equal(pictures.size,4,'four layouts render four distinct room arrangements');assert.deepEqual(errors,[]);
    pass('All four room pictures differ; no JavaScript or console errors');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,measurements},null,2));
  }finally{await browser.close();}
})().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,measurements,error:error.stack},null,2));console.error(error);process.exitCode=1;});
