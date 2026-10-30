'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8123/WebSim/').replace(/\/?$/,'/');
const evidence=process.env.WEBSIM_EVIDENCE||'output/playwright/ev2-condition';
fs.mkdirSync(evidence,{recursive:true});
const results=[],errors=[],responses=[],sourceReads=[],runtimeSources={};
const runtimeNames=new Set(['evolving_vehicles_2.html','evolving_vehicles_2.css','evolving_vehicles_2.js','vehicle-condition.js','race-engine.js','racing-guidance.js']);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sourceRef=process.env.WEBSIM_SOURCE_REF;
const expectedSources=Object.fromEntries([...runtimeNames].map(name=>[name,hash(sourceRef?execFileSync('git',['show',sourceRef+':evolving_vehicles_2/'+name]):fs.readFileSync(path.join('evolving_vehicles_2',name)))]));
const state=page=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const check=async(name,fn)=>{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);};
async function ready(page){
 await page.goto(base+'evolving_vehicles_2/evolving_vehicles_2.html',{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>window.render_game_to_text&&document.querySelector('#start')&&!document.querySelector('#start').disabled,null,{timeout:120000});
}
async function developmentOnly(page){
 assert.equal(await page.locator('#condition-panel, #condition-laps, .condition-card').count(),0,'thermal diagnostics must not be rendered in the public page');
 assert.doesNotMatch(await page.locator('body').innerText(),/관찰 차량 상태|브레이크 · 앞 \/ 뒤|사용 가능 출력|랩별 기록과 상태/);
 const s=await state(page);
 assert(s.watchCondition,'read-only development telemetry remains available');
 assert(Array.isArray(s.watchLapConditions));
 return s;
}
function observe(page){
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{
  if(r.status()>=400)responses.push({url:r.url(),status:r.status()});
  const name=new URL(r.url()).pathname.split('/').at(-1);
  if(r.status()===200&&runtimeNames.has(name))sourceReads.push(r.body().then(bytes=>{(runtimeSources[name]||=new Set()).add(hash(bytes));}));
 });
}
async function shot(page,name){
 await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});
 await page.locator('#stage').screenshot({path:path.join(evidence,name+'-stage.png')});
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();observe(page);
 try{
  await ready(page);
  await check('desktop keeps thermal diagnostics in development telemetry only',async()=>{
   const s=await developmentOnly(page);
   assert.equal(s.watchCondition.elapsedSeconds,0);assert.equal(s.watchCondition.kind,'combustion');
   assert.equal(await page.locator('#powertrain-hud').isVisible(),true);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1));
   await shot(page,'desktop-initial');
  });
  await page.locator('#auto-evolve').setChecked(false);
  await check('visible start pause step preserves paused development state',async()=>{
   await page.locator('#start').click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).time>.3);
   await page.locator('#start').click();const a=await state(page);assert.equal(a.mode,'paused');
   await page.waitForTimeout(350);const b=await state(page);assert.equal(b.watchCondition.elapsedSeconds,a.watchCondition.elapsedSeconds);
   await page.locator('#step').click();const c=await developmentOnly(page);
   assert(Math.abs(c.watchCondition.elapsedSeconds-a.watchCondition.elapsedSeconds-1)<1e-6);
  });
  await check('visible 64x playback updates thermal physics without a public panel',async()=>{
   await page.locator('#speed').selectOption('64');const before=(await state(page)).time;
   await page.locator('#start').click();await page.waitForFunction(t=>JSON.parse(window.render_game_to_text()).time>t+8,before);
   await page.locator('#start').click();assert((await developmentOnly(page)).watchCondition.elapsedSeconds>8);
  });
  await check('watch control selects independent development vehicle state',async()=>{
   const s=await state(page),other=s.cars.find(c=>c.id!==s.watch);assert(other);
   await page.locator('#standings [data-car="'+other.id+'"] button').click();const after=await developmentOnly(page);
   assert.equal(after.watch,other.id);assert.deepEqual(after.watchCondition,after.cars.find(c=>c.id===other.id).condition);
  });
  await check('visible fast evaluation finishes with thermal and wear accumulation',async()=>{
   await page.locator('#evaluate').click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='finished',null,{timeout:120000});
   const done=await developmentOnly(page);assert(done.watchCondition.elapsedSeconds>0);assert(done.watchCondition.tires.front.wear>0);
  });
  await check('completed lap remains in development telemetry and reset clears the state',async()=>{
   const done=await developmentOnly(page);assert.equal(done.watchLapConditions.length,1);await shot(page,'desktop-finished');
   await page.locator('#reset').click();const reset=await developmentOnly(page);
   assert.equal(reset.watchCondition.elapsedSeconds,0);assert.equal(reset.watchCondition.tires.front.wear,0);assert.equal(reset.watchLapConditions.length,0);
  });
  await check('stock electric selection keeps SOC in telemetry and retains hidden engine HUD',async()=>{
   await page.locator('#vehicle-model').selectOption('ioniq5');await page.waitForFunction(()=>!document.querySelector('#start').disabled);
   await page.locator('#budget').selectOption('0');await page.locator('#laps').selectOption('3');await page.locator('#auto-evolve').setChecked(false);
   const s=await developmentOnly(page);assert.equal(s.watchCondition.kind,'electric');assert.equal(s.laps,3);assert.equal(s.stockComparison,true);
   assert.equal(await page.locator('#powertrain-hud').isVisible(),false);assert.equal(s.watchCondition.powertrain.soc,.8);
   await page.locator('#step').click();assert((await state(page)).watchCondition.energy.batteryDischargeJ>0);
  });
  await check('electric three-lap evaluation retains development snapshots without adding a public table',async()=>{
   await page.locator('#evaluate').click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='finished',null,{timeout:120000});
   const done=await developmentOnly(page);assert.equal(done.watchLapConditions.length,3);await shot(page,'desktop-electric');
  });
  await check('hybrid selection preserves its existing powertrain and battery-flow HUD',async()=>{
   await page.locator('#vehicle-model').selectOption('k5');await page.waitForFunction(()=>!document.querySelector('#start').disabled);
   const before=await state(page),hev=before.cars.find(c=>c.condition?.kind==='hybrid');assert(hev);
   await page.locator('#standings [data-car="'+hev.id+'"] button').click();const s=await developmentOnly(page);
   assert.equal(s.watchCondition.kind,'hybrid');assert.equal(await page.locator('#powertrain-hud').isVisible(),true);assert.equal(await page.locator('#hybrid-flow').isVisible(),true);
   await page.locator('#step').click();const current=(await state(page)).watchCondition;
   assert(current.energy.engineMechanicalJ>0,'low-load HEV uses engine work');assert(Number.isFinite(current.power.engineChargeW));
   assert(['충전 중','사용 중','대기'].includes(await page.locator('#battery-mode').innerText()));
   assert(Number.isFinite(Number(await page.locator('#battery-flow').getAttribute('aria-valuenow'))));
   await shot(page,'desktop-hybrid');
  });
  await check('return to tuned one-lap conditions starts a fresh development measurement',async()=>{
   await page.locator('#budget').selectOption('30');await page.locator('#laps').selectOption('1');const s=await developmentOnly(page);
   assert.equal(s.stockComparison,false);assert.equal(s.laps,1);assert.equal(s.watchCondition.elapsedSeconds,0);
  });
  await context.close();
  for(const width of [320,390]){
   const ctx=await browser.newContext({viewport:{width,height:width===320?740:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}),p=await ctx.newPage();observe(p);await ready(p);
   await check('mobile '+width+' retains touch controls and omits thermal diagnostics',async()=>{
    await p.locator('#auto-evolve').setChecked(false);await p.locator('#step').tap();const s=await developmentOnly(p);assert(s.watchCondition.elapsedSeconds>.9);
    const b=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,stageWidth:document.querySelector('#stage').clientWidth}));
    assert(b.overflow<=1);assert(b.stageWidth>250);assert.equal(await p.locator('#powertrain-hud').isVisible(),true);await shot(p,'mobile-'+width+'-driving');
    await p.locator('#reset').tap();assert.equal((await developmentOnly(p)).watchCondition.elapsedSeconds,0);
    await p.locator('#vehicle-model').selectOption('ioniq5');await p.waitForFunction(()=>!document.querySelector('#start').disabled);
    assert.equal((await developmentOnly(p)).watchCondition.kind,'electric');assert.equal(await p.locator('#powertrain-hud').isVisible(),false);await shot(p,'mobile-'+width+'-electric');
   });
   await ctx.close();
  }
  assert.deepEqual(errors,[],'page/console errors');assert.deepEqual(responses,[],'HTTP errors');await Promise.all(sourceReads);
  for(const name of runtimeNames)assert.deepEqual([...(runtimeSources[name]||[])],[expectedSources[name]],'served final runtime identity '+name);
  const report={status:'PASS',checks:results.length,results,pageErrors:errors,httpErrors:responses,classification:'Source-informed automated UI regression using visible controls and read-only development telemetry. Public thermal diagnostics are absent. No state mutation or advanceTime fixture. Not blind gameplay or human enjoyment evidence.',browser:browser.version(),runtimeSha256:Object.fromEntries(Object.entries(runtimeSources).map(([name,values])=>[name,[...values][0]])),viewports:['1440x1000 desktop','320x740 touch emulation','390x844 touch emulation'],realAndroid:'NOT RUN',realIOS:'NOT RUN'};
  fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify({status:'FAIL',results,error:String(error),pageErrors:errors,httpErrors:responses},null,2));throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
