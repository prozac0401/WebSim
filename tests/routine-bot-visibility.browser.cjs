'use strict';
// Playwright's own page session enables perpetual focus emulation. A second CDP
// session cannot undo that session's setting. Use a fresh Chromium process and
// raw CDP instead: actual target activation changes document.hidden, while input
// still goes through browser mouse events and all game state reads are read-only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createRequire} = require('node:module');
const {chromium} = createRequire(path.join(process.env.USERPROFILE || process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright');
const base=(process.env.WEBSIM_URL||'http://127.0.0.1:8123/WebSim/').replace(/\/?$/,'/');
const output=path.resolve(process.env.WEBSIM_EVIDENCE||'output/playwright/routine-bot/cooperation/visibility-raw-cdp');
fs.mkdirSync(output,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=10000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await check())return;await delay(50);}
  throw new Error('Timed out: '+label);
}
async function connect(url,report){
  const socket=new WebSocket(url),pending=new Map();let sequence=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(new Error(JSON.stringify(message.error))):request.resolve(message.result);}
    else if(message.method==='Runtime.exceptionThrown')report.errors.push(message.params.exceptionDetails);
  });
  function send(method,params={},sessionId){
    return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  }
  return {send,close:()=>socket.close()};
}
(async()=>{
  const report={started:new Date().toISOString(),base,status:'NOT RUN',viewport:{width:1440,height:900},
    classification:'Real Chromium target activation via raw CDP; browser mouse input authors every block; no focus/visibility/clock/game-state injection',
    environment:'desktop Chromium headless rendering; real tab lifecycle, not mobile hardware',errors:[],observations:[]};
  const profile=fs.mkdtempSync(path.join(output,'chromium-profile-'));
  const child=spawn(chromium.executablePath(),['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,
    '--window-size=1440,900','--no-first-run','--no-default-browser-check','--disable-background-networking','about:blank'],
    {windowsHide:true,stdio:['ignore','ignore','pipe']});
  let stderr='',cdp;
  child.stderr.on('data',data=>{stderr+=data.toString();});
  try{
    const portFile=path.join(profile,'DevToolsActivePort');
    await until(()=>fs.existsSync(portFile),'Chromium debugging endpoint');
    const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);
    cdp=await connect(`ws://127.0.0.1:${port}${endpoint}`,report);
    report.browser=(await cdp.send('Browser.getVersion')).product;
    const {targetId}=await cdp.send('Target.createTarget',{url:base+'routine_bot/routine_bot.html'});
    const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
    await cdp.send('Runtime.enable',{},sessionId);await cdp.send('Page.enable',{},sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
    const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
    const state=()=>evaluate('JSON.parse(window.render_game_to_text())');
    const visibility=()=>evaluate('({hidden:document.hidden,state:document.visibilityState})');
    const click=async selector=>{
      // Read the actual visible control and dispatch a browser pointer sequence;
      // no element.click(), injected program, or game transition function.
      const point=await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw new Error('Missing control');element.scrollIntoView({block:'center'});const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,disabled:!!element.disabled};})()`);
      assert.ok(point.width&&point.height&&!point.disabled,'visible enabled UI control '+selector);
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y},sessionId);
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1},sessionId);
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1},sessionId);
      await delay(50);
    };
    await until(()=>evaluate('typeof window.render_game_to_text==="function"'),'game initialization');
    const {targetId:otherTarget}=await cdp.send('Target.createTarget',{url:'about:blank',background:true});
    const show=()=>cdp.send('Target.activateTarget',{targetId});
    const hide=()=>cdp.send('Target.activateTarget',{targetId:otherTarget});
    await show();await until(async()=>!(await visibility()).hidden,'visible game tab');
    report.observations.push({phase:'initial visible',...await visibility()});
    await click('#challenge-start');await delay(300);
    report.before=(await state()).challenge.elapsedMs;
    await hide();await until(async()=>(await visibility()).hidden,'actual hidden game tab');
    const hidden=(await state()).challenge.elapsedMs;
    report.observations.push({phase:'other tab activated',...await visibility(),elapsedMs:hidden});
    await delay(1200);
    assert.equal((await state()).challenge.elapsedMs,hidden,'a genuinely hidden tab excludes elapsed time');
    await show();await until(async()=>!(await visibility()).hidden,'visible game tab restored');
    await delay(300);const resumed=(await state()).challenge.elapsedMs;
    assert.ok(resumed>=hidden+250,'a visible tab resumes active time');
    report.observations.push({phase:'visible resumed',...await visibility(),elapsedMs:resumed});
    await click('#tutorial-open');const help=(await state()).challenge.elapsedMs;
    await hide();await until(async()=>(await visibility()).hidden,'hidden while help open');
    await delay(300);await show();await until(async()=>!(await visibility()).hidden,'visible with help still open');
    await delay(300);assert.equal((await state()).challenge.elapsedMs,help,'help remains excluded after hidden reason clears');
    report.observations.push({phase:'help remains open after visible return',...await visibility(),elapsedMs:help});
    await click('#help-close');
    for(let index=0;index<3;index++)await click('[data-add="forward"]');
    assert.equal((await state()).stored,3,'three browser clicks authored the successful program');
    await click('#run');await until(async()=>(await state()).status==='success','UI-authored level success');
    const success=await state();assert.equal(success.challenge.hintUsed,true);
    assert.equal(success.challenge.finished,true);assert.equal(success.challenge.attempts,1);
    await evaluate('window.scrollTo(0,0)');
    const screenshot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);
    fs.writeFileSync(path.join(output,'visible-return-success.png'),Buffer.from(screenshot.data,'base64'));
    assert.equal(report.errors.length,0);
    report.status='PASS';report.checks=['real hidden-tab exclusion for 1200ms','visible-tab resume','help + hidden overlap','UI authored success with assisted record'];report.hidden=hidden;report.success=success.challenge;
    console.log('PASS actual document.hidden transitions, hidden-time exclusion, visible resume, help overlap and UI success');
  }catch(error){report.status='FAIL';report.error=String(error);process.exitCode=1;console.error(error);}
  finally{
    fs.writeFileSync(path.join(output,'visibility-report.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(output,'chromium-stderr.txt'),stderr);
    if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.close();}
    if(child.exitCode===null)child.kill();
  }
})();
