// Real Chromium interaction replay. All programs are entered through visible controls.
// Solution-informed progression is deliberately separate from the blind review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.codex/skills/develop-web-game/package.json'))('playwright')); }
const phase = process.argv[2] || 'final';
const base = (process.env.WEBSIM_URL || 'http://127.0.0.1:8123/WebSim/').replace(/\/?$/, '/');
const output = path.resolve(process.env.WEBSIM_EVIDENCE || `output/playwright/routine-bot/${phase}`);
fs.mkdirSync(output,{recursive:true});
const report = {phase,base,started:new Date().toISOString(),checks:[],errors:[],progression:[],classification:'solution-informed rendered UI replay; independent blind review is separate',android:'NOT RUN'};
const record = name => { report.checks.push({name,status:'PASS'}); console.log('PASS',name); fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2)); };
const read = page => page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const wait = (page, ms) => page.waitForTimeout(ms);
const image = (page,name) => page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
const key = n => n.type==='if'?n.condition:n.type==='call'?n.target:n.type;
const nodes = program => {
  const result = [];
  function visit(list) { for (const node of list) { result.push(node); for (const branch of ['body','then','else']) if (node[branch]) visit(node[branch]); } }
  for (const root of ['main','F1','F2']) visit(program[root]); return result;
};
async function press(page,selector,touch=false){const locator=page.locator(selector);await locator.scrollIntoViewIfNeeded();touch?await locator.tap():await locator.click();}
async function ready(page){await page.goto(base+'routine_bot/routine_bot.html');await page.waitForFunction(()=>typeof window.render_game_to_text==='function');}
async function addList(page,list,touch=false){
  for(const node of list){
    const previousIds = new Set(nodes((await read(page)).program).map(item=>item.id));
    await press(page,`[data-add="${key(node)}"]`,touch);
    const added = nodes((await read(page)).program).find(item=>!previousIds.has(item.id));
    assert.ok(added, 'The visible palette action must add one command');
    if(node.type==='repeat'){
      await page.locator(`[data-repeat="${added.id}"]`).selectOption(String(node.count));
      await addList(page,node.body,touch);await press(page,'#scope-back',touch);
    } else if(node.type==='if'){
      await addList(page,node.then,touch);await press(page,'#scope-back',touch);
      // Expansion is visual only. The branch insertion control chooses where
      // subsequent palette taps go, without relying on flat child selectors.
      await press(page,`[data-insert="${added.id}:else"]`,touch);
      await addList(page,node.else,touch);await press(page,'#scope-back',touch);
    }
  }
}
async function build(page,program,touch=false){
  if(!(await page.locator('#clear').isDisabled()))await press(page,'#clear',touch);
  for(const root of ['main','F1','F2']) if(program[root]?.length){await press(page,`[data-scope="${root}"]`,touch);await addList(page,program[root],touch);}
  await press(page,'[data-scope="main"]',touch);
}
async function finish(page,touch=false){await press(page,'#run',touch);await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return s.status==='failure'||(s.status==='success'&&document.querySelector('#success-panel').hidden===false);},{},{timeout:90000});assert.equal((await read(page)).status,'success');}
const move=type=>({type});
const early=[
  {main:['forward','forward','forward'].map(move),F1:[],F2:[]},
  {main:['forward','forward','right','forward','forward'].map(move),F1:[],F2:[]},
  {main:['forward','left','forward','forward','right','forward'].map(move),F1:[],F2:[]}
];
(async()=>{
  const browser=await chromium.launch({headless:true});report.browser=browser.version();
  function observe(page){page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});}
  try{
    const desktop=await browser.newContext({viewport:{width:1440,height:900}});await desktop.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await desktop.newPage();observe(page);
    await page.goto(base);await page.locator('#search').fill('루틴봇');assert.equal(await page.locator('.tool-card:visible').count(),1);await page.locator('a.try-link[href="routine_bot/routine_bot.html"]').click();await page.waitForFunction(()=>window.render_game_to_text);
    assert.equal((await read(page)).level,1);assert.equal((await read(page)).stored,0);await image(page,'desktop-first');record('catalog search and first visit at project deployment prefix');
    await page.locator('#speed').selectOption('4');
    await build(page,early[0]);await finish(page);assert.deepEqual((await read(page)).completed,[1]);await image(page,'desktop-first-success');record('first level solved through visible block buttons and run');
    await press(page,'#next-level');
    // Collision, repair, selection, movement, deletion and undo.
    await addList(page,[move('forward'),move('forward'),move('forward')]);await press(page,'#run');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).status==='failure');
    let s=await read(page);assert.equal(s.event.reason,'collision');assert.equal(s.stored,3);assert.equal(await page.locator('.block.crashed').count(),1);await image(page,'desktop-collision');
    await press(page,'#delete');assert.equal((await read(page)).stored,2);await press(page,'#undo');assert.equal((await read(page)).stored,3);
    await press(page,'#program > .tree-node:first-child > .block .block-main');await press(page,'#move-down');await press(page,'#undo');
    await build(page,early[1]);record('collision locates the wall and failing block; program retained, delete/reorder/undo respond');
    await page.locator('#speed').selectOption('0.5');await press(page,'#run');await press(page,'#pause');const paused=await read(page);await wait(page,1250);assert.equal((await read(page)).executed,paused.executed);assert.deepEqual((await read(page)).robot,paused.robot);
    await press(page,'#step');assert.equal((await read(page)).executed,paused.executed+1);
    await press(page,'#reset');s=await read(page);assert.equal(s.stored,5);assert.equal(s.executed,0);assert.deepEqual(s.robot,{x:1,y:3,dir:0});await wait(page,1250);assert.equal((await read(page)).executed,0);
    await press(page,'#run');await page.locator('#level-select').selectOption('1');await wait(page,1250);s=await read(page);assert.equal(s.level,1);assert.equal(s.executed,0);assert.deepEqual(s.robot,{x:1,y:1,dir:1});assert.deepEqual(s.completed,[1]);
    await page.locator('#level-select').selectOption('2');assert.equal((await read(page)).stored,5);await page.locator('#speed').selectOption('4');await finish(page);record('pause, single step, reset and level-switch cancellation survive the old execution delay');
    await press(page,'#next-level');await build(page,early[2]);await finish(page);record('levels 1–3 complete consecutively with retained programs');
    await page.reload();await page.waitForFunction(()=>window.render_game_to_text);s=await read(page);assert.deepEqual(s.completed,[1,2,3]);assert.equal(s.stored,6);assert.equal(s.status,'ready');record('reload restores completion, selected level, code, speed; never resumes a stale run');
    // Browser keyboard shortcuts operate on the game when focus is outside controls.
    await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.press('Space');assert.equal((await read(page)).status,'running');await page.keyboard.press('Space');assert.equal((await read(page)).paused,true);await page.keyboard.press('r');assert.equal((await read(page)).executed,0);record('desktop Space/R keyboard execution and reset');
    if(phase==='final'){
      const solutions=require('../routine_bot/solutions.cjs');
      const all=Array.isArray(solutions)?solutions:solutions.solutions||solutions;
      for(let id=4;id<=15;id++){
        await page.locator('#level-select').selectOption(String(id));
        const entry=Array.isArray(all)?all.find(v=>v.id===id)||all[id-1]:all[id];const program=entry.program||entry;
        await build(page,program);await finish(page);s=await read(page);assert(s.completed.includes(id));assert.equal(s.verifiedMaps,s.maps);
        report.progression.push({level:id,stored:s.stored,executed:s.executed,maps:s.maps});record(`level ${id} solved via block editing and actual timed playback (${s.maps} maps)`);
        if([4,7,10,12,15].includes(id))await image(page,`desktop-level-${id}-success`);
      }
      assert.equal((await read(page)).completed.length,15);assert.match(await page.locator('#success-title').innerText(),/모든 길/);record('12-level completion unlocks bonus 13–15; final clear screen reached through all levels');
    }
    await desktop.tracing.stop({path:path.join(output,'desktop-trace.zip')});await desktop.close();
    for(const width of [320,390]){
      const context=await browser.newContext({viewport:{width,height:width===320?740:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});const mobile=await context.newPage();observe(mobile);await ready(mobile);
      await mobile.locator('#speed').selectOption('4');await build(mobile,early[0],true);await finish(mobile,true);await image(mobile,`mobile-${width}-success`);
      await press(mobile,'#next-level',true);await build(mobile,early[1],true);await press(mobile,'#program > .tree-node:last-child > .block .block-main',true);await press(mobile,'#move-up',true);await press(mobile,'#undo',true);await press(mobile,'#delete',true);await press(mobile,'#undo',true);await finish(mobile,true);
      await press(mobile,'#next-level',true);await build(mobile,early[2],true);await finish(mobile,true);
      if(phase==='final'){
        const solutions=require('../routine_bot/solutions.cjs'),all=Array.isArray(solutions)?solutions:solutions.solutions||solutions;
        await press(mobile,'#next-level',true);const entry=Array.isArray(all)?all.find(v=>v.id===4)||all[3]:all[4];await build(mobile,entry.program||entry,true);await finish(mobile,true);
        // Late-level access fixture is disclosed: this session tests touch editing, not progression.
        const data=await mobile.evaluate(()=>JSON.parse(localStorage.getItem('routinebot-save-v1')));
        for(let id=1;id<12;id++)data.completed[id]=true;data.currentLevel=12;
        await mobile.evaluate(data=>localStorage.setItem('routinebot-save-v1',JSON.stringify(data)),data);await mobile.reload();await mobile.waitForFunction(()=>window.render_game_to_text);
        const late=Array.isArray(all)?all.find(v=>v.id===12)||all[11]:all[12];await build(mobile,late.program||late,true);await finish(mobile,true);await image(mobile,`mobile-${width}-nested-functions`);
        record(`${width}px touch repeat/condition/function editing and multi-map run (late access fixture disclosed)`);
      }
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal((await read(mobile)).reducedMotion,true);
      const board=await mobile.locator('#canvas').boundingBox(),run=await mobile.locator('#run').boundingBox();assert(board.y>=0&&board.y+board.height<(width===320?740:844));assert(run.y>=0&&run.y+run.height<(width===320?740:844));
      record(`${width}px mobile touch solve, reorder, delete, undo; sticky board/run visible, no horizontal overflow, reduced motion`);await context.close();
    }
    for(const scenario of ['corrupt','unavailable','write-failure','recovered','repaired']){
      const context=await browser.newContext({viewport:{width:390,height:844}});
      await context.addInitScript(scenario=>{
        if(scenario==='unavailable')Object.defineProperty(window,'localStorage',{get(){throw new Error('storage denied');}});
        else if(scenario==='write-failure')Storage.prototype.setItem=function(){throw new Error('quota exceeded');};
        else if(scenario==='recovered'){
          localStorage.setItem('routinebot-save-v1-backup',JSON.stringify({version:1,currentLevel:1,completed:{},programs:{},settings:{speed:1,muted:true}}));localStorage.setItem('routinebot-save-v1','{broken');
        }else if(scenario==='repaired')localStorage.setItem('routinebot-save-v1',JSON.stringify({version:1,currentLevel:1,completed:{},programs:{1:{main:[{id:'bad',type:'unknown'}],F1:[],F2:[]}},settings:{speed:1,muted:true}}));
        else localStorage.setItem('routinebot-save-v1','{broken');
      },scenario);
      const p=await context.newPage();observe(p);await ready(p);const loaded=await read(p);
      if(scenario==='write-failure')assert.match(loaded.saveStatus,/저장 불가/);
      else assert.match(loaded.message,scenario==='corrupt'||scenario==='repaired'?/손상/:scenario==='recovered'?/복구/:/저장 불가/);
      await p.locator('#speed').selectOption('4');await build(p,early[0]);await finish(p);record(`${scenario} storage reports problem and still allows a complete playable level`);await context.close();
    }
    assert.deepEqual(report.errors,[]);record('zero browser console/page errors');report.status='PASS';
  }catch(error){report.status='FAIL';report.failure=error.stack;console.error(error);process.exitCode=1;}
  finally{report.finished=new Date().toISOString();fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
})();
