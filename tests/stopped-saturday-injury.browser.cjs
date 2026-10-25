const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.join(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');
const {storyViewport,animationViewport}=require('./saturday-story-viewport.cjs');
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8766/').replace(/\/?$/,'/');
const out=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/saturday-injury');
const checks=[],errors=[],bodyViews={},measurements=[];
const state=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
const advance=(p,ms)=>p.evaluate(ms=>advanceTime(ms),ms);
const canonical=s=>({step:s.step,conditions:s.conditions,energy:s.energy,mood:s.mood,body:s.body,minuteOfDay:s.minuteOfDay,context:s.context});
const pass=name=>{checks.push(name);console.log('PASS',name);};
async function checkSide(p,side){
 const s=await state(p),other=side==='left'?'right':'left',korean=side==='left'?'왼':'오른',support=side==='left'?'오른':'왼';
 assert.equal(s.conditions.injuredSide,side);assert.equal(s.motion.bracedLeg,side);assert.equal(s.motion.supportingLeg,other);
 assert.equal(s.motion.contacts[side+'Foot'],false,'the cast foot never bears weight on the floor');
 assert.match(await p.locator('#day-canvas').getAttribute('aria-label'),new RegExp(korean+'쪽 다리에 깁스'));
 assert.equal(await p.locator('#body-list .body-item').first().locator('strong').textContent(),korean+'쪽 발목');
 assert.equal(await p.locator('#body-list .body-item').last().locator('strong').textContent(),'몸을 받치는 '+support+'쪽 다리');
 assert.equal(await p.locator('#body-overview').isVisible(),false,'the body map stays hidden as requested');
 assert.equal(await p.locator('.sbs-card[data-body-key="ankle"] strong').textContent(),korean+'발목');
 assert.equal(await p.locator('.sbs-card[data-body-key="goodLeg"] strong').textContent(),support+'쪽 다리');
 assert.equal(await p.locator('.sbs-anatomy').getAttribute('data-injured-side'),side);
 const marker=p.locator('.sbs-zone[data-body-key="ankle"]');
 assert.equal(await marker.getAttribute('data-side'),side);
 assert.equal(Number(await marker.locator('circle').getAttribute('cx')),side==='left'?185:55);
 assert.equal(await marker.locator('text').getAttribute('transform'),null,'diagram digits are not mirrored');
 return s;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  for(const width of [320,390])for(const side of ['right','left']){
   const context=await browser.newContext({viewport:{width,height:700},isMobile:true,hasTouch:true});
   await context.addInitScript(values=>{window.injuryDraws=0;Math.random=()=>values[window.injuryDraws++]??0;},[0,0,0,.8,.6,.3,side==='left'?.9:0]);
   const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await p.goto(base+'stopped_saturday/stopped_saturday.html');await advance(p,0);
   const intro=await p.locator('#opening-story').innerText();assert.match(intro,/한쪽 다리/);assert.doesNotMatch(intro,/오른쪽 다리|왼쪽 다리/);assert.equal(await p.evaluate(()=>injuryDraws),0);
   await p.locator('#scenario-select').selectOption('classic');await p.locator('#start-button').tap();
   await checkSide(p,side);assert.equal(await p.evaluate(()=>injuryDraws),7);
   assert.match(await p.locator('#story-text').innerText(),new RegExp('깁스를 한 '+(side==='left'?'왼':'오른')+'다리'));
   measurements.push(await storyViewport(p,`${width}/${side}: start`));
   bodyViews[side]=await p.evaluate(()=>{const s=JSON.parse(render_game_to_text());return SaturdayStory.bodyDescription({scenarioVersion:s.scenarioVersion,initialConditions:s.conditions,body:s.body});});
   let walked=false,stairs=false;
   for(let i=0;i<12;i++){
    const before=await state(p);assert.equal(before.mode,'game');assert.doesNotMatch(await p.locator('#story-text').innerText(),/\[\[/);
    await p.locator('#choices button').first().tap();const chosen=await checkSide(p,side);assert.equal(chosen.mode,'animation');assert.equal(chosen.minuteOfDay,before.minuteOfDay+before.choiceDurations[0]);
    if(i===0){await advance(p,1500);await p.reload();await advance(p,0);assert.equal((await state(p)).mode,'reaction');assert.equal(await p.evaluate(()=>injuryDraws),0);}
    else{
     if((chosen.motion.kind==='walk'&&!walked)||(chosen.motion.kind==='stairs'&&!stairs)){
      await advance(p,1800);await checkSide(p,side);measurements.push(await animationViewport(p,`${width}/${side}: ${chosen.motion.kind}`));
      await p.screenshot({path:path.join(out,`${width}-${side}-${chosen.motion.kind}.png`)});
      if(chosen.motion.kind==='walk')walked=true;else stairs=true;
     }
     await p.locator('#skip-animation').tap();
    }
    assert.deepEqual(canonical(await state(p)),canonical(chosen));await checkSide(p,side);
    assert.doesNotMatch(await p.locator('#reaction-text').innerText(),/\[\[/);measurements.push(await storyViewport(p,`${width}/${side}: reaction ${i+1}`));
    await p.locator('#continue-button').tap();
   }
   const done=await checkSide(p,side);assert.equal(done.mode,'result');assert.equal(done.step,12);assert.equal(walked,true);assert.equal(stairs,true);
   await p.reload();await advance(p,0);await checkSide(p,side);assert.equal((await state(p)).mode,'result');assert.equal(await p.evaluate(()=>injuryDraws),0);
   await p.locator('#open-completed').tap();assert.match(await p.locator('#record-conditions').innerText(),new RegExp((side==='left'?'왼':'오른')+'쪽 발 부상'));
   assert.doesNotMatch(await p.locator('#record-scenes').innerText(),/\[\[/);
   await context.close();pass(`${width}px ${side}: matching cast, support leg, prose, status and journal persist across twelve choices and reload`);
  }
  const anatomy=await browser.newPage({viewport:{width:1100,height:800}});anatomy.on('pageerror',e=>errors.push(e.message));
  await anatomy.setContent('<style>body{display:grid;grid-template-columns:1fr 1fr;gap:20px;background:#f5f2e8;font-family:sans-serif}</style><div id="right"></div><div id="left"></div>');
  await anatomy.addStyleTag({path:path.resolve('stopped_saturday/body-status.css')});await anatomy.addScriptTag({path:path.resolve('stopped_saturday/body-status.js')});
  await anatomy.evaluate(views=>{for(const side of ['right','left'])SaturdayBodyStatus.render(document.getElementById(side),views[side]);},bodyViews);
  await anatomy.screenshot({path:path.join(out,'anatomy-both-sides.png'),fullPage:true});await anatomy.close();
  pass('Front-view anatomy changes cast and marker sides while all numbers remain upright');
  assert.deepEqual(errors,[]);pass('No JavaScript or console errors');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,measurements},null,2));
 }finally{await browser.close();}
})().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,measurements,error:error.stack},null,2));console.error(error);process.exitCode=1;});
