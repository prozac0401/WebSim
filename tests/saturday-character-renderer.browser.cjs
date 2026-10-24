// Direct Canvas tests: no game state, server, network or random draws are needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME,'.codex/skills/develop-web-game/package.json'))('playwright'); }
const out = path.resolve(process.env.WEBSIM_EVIDENCE || 'output/playwright/saturday-character-renderer');
const errors = [], checks = [];
const pass = name => { checks.push(name); console.log('PASS',name); };
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser = await playwright.chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.setContent('<style>body{margin:0;background:#f6eddb;color:#253e42;font:15px sans-serif}#lineup{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:18px}.card{background:#eee6d5;border:1px solid #c4c4b2;border-radius:10px;padding:10px;text-align:center}.card canvas{width:200px;height:267px;display:block;margin:6px auto}#source{display:block;width:960px;height:500px}</style><div id="lineup"></div><canvas id="source"></canvas>');
    await page.addScriptTag({path:path.resolve('stopped_saturday/movement-scene.js')});
    const appearances = await page.evaluate(()=>{
      Math.random=()=>{throw new Error('Renderer must not draw random values');};
      window.renderer=SaturdayScene.create(document.querySelector('#source'));
      const styles=['crop','side-part','wavy','bob','ponytail','bun'],results=[];
      for(const gender of ['male','female'])for(const hairStyle of styles){
        const input={kind:'stand',location:'hall',minuteOfDay:612,appearance:{gender,hairStyle},body:{shoulder:4},step:1};
        const original=JSON.stringify(input);renderer.setScene(input);renderer.finish();
        const source=document.querySelector('#source'),snapshot=renderer.snapshot();
        const head=[...source.getContext('2d').getImageData(360,145,86,78).data];
        const shirt=[...source.getContext('2d').getImageData(405,270,1,1).data];
        const image=source.toDataURL();
        renderer.setScene({...input,step:8});renderer.finish();
        const stable=image===source.toDataURL();
        const card=document.createElement('div');card.className='card';
        const label=document.createElement('strong');label.textContent=`${gender} · ${hairStyle}`;
        const preview=document.createElement('canvas');preview.width=210;preview.height=280;
        preview.getContext('2d').drawImage(source,320,126,210,280,0,0,210,280);
        card.append(label,preview);document.querySelector('#lineup').append(card);
        results.push({gender,hairStyle,appearance:snapshot.appearance,head,shirt,stable,inputUnchanged:original===JSON.stringify(input)});
      }
      renderer.setScene({kind:'stand',appearance:{gender:'invalid',hairStyle:'invalid'}});renderer.finish();
      return {results,fallback:renderer.snapshot().appearance};
    });
    assert.deepEqual(appearances.fallback,{gender:'male',hairStyle:'crop'});
    for(const a of appearances.results){assert.deepEqual(a.appearance,{gender:a.gender,hairStyle:a.hairStyle});assert.equal(a.stable,true,'clothes and appearance must not change with step');assert.equal(a.inputUnchanged,true);}
    for(const gender of ['male','female'])assert.equal(new Set(appearances.results.filter(a=>a.gender===gender).map(a=>JSON.stringify(a.head))).size,6,'all six hair silhouettes render differently');
    for(let i=0;i<6;i++){
      const male=appearances.results[i],female=appearances.results[i+6];
      assert.notDeepEqual(male.head,female.head,'face drawing differs for gender with identical hair');
      assert.deepEqual(male.shirt,female.shirt,'gender does not select clothing colors');
    }
    await page.locator('#lineup').screenshot({path:path.join(out,'twelve-appearances.png')});
    pass('All twelve independent gender/hair combinations render visibly, with stable clothes and legacy fallback');
    const activities=await page.evaluate(()=>{
      const source=document.querySelector('#source');
      const list=[];
      for(const kind of ['sit','phone','desk','rest','observe','stand'])for(const step of [1,2,3]){
        const input={kind,step,location:kind==='stand'?'hall':'room',minuteOfDay:612,appearance:{gender:'female',hairStyle:'ponytail'},body:{shoulder:7,back:5,goodLeg:6}};
        const original=JSON.stringify(input);renderer.setReducedMotion(false);renderer.setScene(input);
        let unsupported=0;
        const frames=[];
        for(let time=0;time<=3000;time+=10){
          if(time)renderer.advance(10);
          const s=renderer.snapshot();
          if(!s.contacts.leftFoot&&!s.contacts.crutches&&!s.contacts.seat)unsupported++;
          if([0,650,1400,1900,2400,3000].includes(time))frames.push({time,snapshot:s,image:source.toDataURL()});
        }
        const end=renderer.snapshot();renderer.advance(60000);
        const stable=JSON.stringify(end)===JSON.stringify(renderer.snapshot());
        renderer.setScene(input);renderer.advance(2999);const beforeEnd=renderer.snapshot();renderer.advance(1);const exactEnd=renderer.snapshot();
        renderer.setScene(input);renderer.setReducedMotion(true);const reduced=renderer.snapshot();renderer.advance(60000);const reducedStable=JSON.stringify(reduced)===JSON.stringify(renderer.snapshot());
        renderer.finish();renderer.setReducedMotion(false);const noReplay=!renderer.snapshot().moving;
        list.push({kind,step,name:end.activity.name,variation:end.activity.variation,frames,unsupported,stable,reducedStable,noReplay,beforeEnd:beforeEnd.moving,exactEnd:exactEnd.moving,inputUnchanged:original===JSON.stringify(input)});
      }
      return list;
    });
    for(const a of activities){
      assert.equal(a.unsupported,0);assert.equal(a.stable,true);assert.equal(a.reducedStable,true);assert.equal(a.noReplay,true);assert.equal(a.inputUnchanged,true);
      assert.equal(a.beforeEnd,true);assert.equal(a.exactEnd,false);
      assert.equal(a.frames[0].snapshot.durationMs,3000);
      assert.notEqual(a.frames[2].image,a.frames[3].image,`${a.kind} visibly changes after sitting down`);
      assert.notEqual(a.frames[3].image,a.frames[4].image,`${a.kind} continues its small action`);
    }
    for(const kind of ['sit','phone','desk','rest','observe','stand'])assert.equal(new Set(activities.filter(a=>a.kind===kind).map(a=>a.name)).size,3);
    pass('Six short poses have visible deterministic small actions and three variations, finish at exactly 3000ms, and stay still under reduced motion');
    await page.evaluate(()=>{document.querySelector('#lineup').replaceChildren();});
    for(const kind of ['sit','phone','desk','rest','observe','stand']){
      const entry=activities.find(a=>a.kind===kind&&a.step===1);
      await page.evaluate(({kind,images})=>{
        const card=document.createElement('div');card.className='card';card.style.gridColumn='span 2';
        const label=document.createElement('strong');label.textContent=kind+' · 1400 / 1900 / 2400 ms';card.append(label);
        const strip=document.createElement('div');strip.style.display='flex';
        for(const src of images){const img=document.createElement('img');img.src=src;img.style.width='33.333%';strip.append(img);}
        card.append(strip);document.querySelector('#lineup').append(card);
      },{kind,images:entry.frames.slice(2,5).map(f=>f.image)});
    }
    await page.locator('#lineup').screenshot({path:path.join(out,'activity-frames.png')});
    const supports=await page.evaluate(()=>{
      const rows=[];
      for(const kind of ['walk','stairs'])for(const fatigue of [0,5,10]){
        let reference=null;
        for(const appearance of [{gender:'male',hairStyle:'crop'},{gender:'female',hairStyle:'bun'}]){
          renderer.setReducedMotion(false);renderer.setScene({kind,location:kind==='stairs'?'stairs':'hall',destinationPose:'sit',appearance,body:{shoulder:fatigue,goodLeg:fatigue,back:fatigue},energyBefore:6,energyAfter:3});
          let frames=0,unsupported=0,penetrations=0,maxJump=0,previous=renderer.snapshot();const trace=[];
          const floor=x=>430-Math.max(0,Math.min(4,Math.floor((x-360)/74)+1))*25;
          while(renderer.snapshot().moving){
            renderer.advance(5);const s=renderer.snapshot();frames++;
            if(!s.contacts.leftFoot&&!s.contacts.crutches&&!s.contacts.seat)unsupported++;
            maxJump=Math.max(maxJump,Math.hypot(s.x-previous.x,s.y-previous.y));
            if(kind==='stairs'){
              for(const foot of [s.leftFoot,s.rightFoot])if(foot[1]+7>floor(foot[0]+23)+.1)penetrations++;
              if(s.stairs.crutchTip[1]>floor(s.stairs.crutchTip[0])+.1)penetrations++;
            }
            trace.push([s.x,s.y,s.leftFoot,s.rightFoot,s.contacts]);previous=s;
          }
          const sameGeometry=reference===null||reference===JSON.stringify(trace);reference=JSON.stringify(trace);
          rows.push({kind,fatigue,appearance,frames,unsupported,penetrations,maxJump,sameGeometry,final:renderer.snapshot()});
        }
      }
      return rows;
    });
    for(const s of supports){assert.equal(s.unsupported,0);assert.equal(s.penetrations,0);assert.equal(s.sameGeometry,true);assert.ok(s.maxJump<2);assert.equal(s.final.support,'seat');assert.equal(s.final.effort.displayEnergy,3);}
    pass('Walking and stair support stay continuous at every 5ms sample; appearance changes no foot/crutch geometry');
    await page.evaluate(()=>document.querySelector('#lineup').remove());
    for(const [name,kind,appearance] of [['phone','phone',{gender:'female',hairStyle:'side-part'}],['desk','desk',{gender:'male',hairStyle:'bob'}],['walk','walk',{gender:'female',hairStyle:'crop'}],['stairs','stairs',{gender:'male',hairStyle:'ponytail'}]]){
      await page.evaluate(({kind,appearance})=>{renderer.setReducedMotion(false);renderer.setScene({kind,location:kind==='stairs'?'stairs':'room',destinationPose:kind==='stairs'?'sit':null,appearance,body:{shoulder:5,back:4},minuteOfDay:612});renderer.advance(kind==='stairs'?4200:1900);},{kind,appearance});
      await page.locator('#source').screenshot({path:path.join(out,name+'.png')});
    }
    await page.setViewportSize({width:320,height:400});
    await page.evaluate(()=>{document.querySelector('#source').style.width='320px';document.querySelector('#source').style.height='auto';renderer.setScene({kind:'phone',location:'room',appearance:{gender:'female',hairStyle:'bun'},minuteOfDay:612});renderer.advance(1900);});
    await page.locator('#source').screenshot({path:path.join(out,'phone-320.png')});
    assert.deepEqual(errors,[]);pass('Normal and 320px Canvas screenshots render without browser errors');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,appearances:appearances.results.map(({head,...a})=>a),activities:activities.map(({frames,...a})=>({...a,frames:frames.map(({image,...f})=>f)})),supports},null,2));
  }finally{await browser.close();}
})().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,error:error.stack},null,2));console.error(error);process.exitCode=1;});
