(() => {
  'use strict';
  const E = window.BraessTraffic, $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d'), stage = $('stage');
  const names = ['위쪽 길', '아래쪽 길', '지름길 경유'], colors = ['#21654f', '#548bab', '#b9763c'];
  const presets = { paradox: { demand: 4000, open: true, brief: '모두 지름길로 몰려 출근에 80분. 가운데 도로를 닫으면 얼마나 달라질까요?' }, quiet: { demand: 1000, open: false, brief: '차가 적은 도시입니다. 지름길을 열고 경로 재선택을 끝까지 지켜보세요. 닫는 것이 항상 답일까요?' }, busy: { demand: 10000, open: true, brief: '차가 아주 많습니다. 열린 지름길에 차가 없다면? 닫아 보고 왜 시간이 그대로인지 경로 비용을 비교하세요.' }, free: { demand: 4000, open: true, brief: '수요와 도로 시간을 조절하세요. 같은 조건의 열기·닫기 비교로, 지름길이 도움이 되는 경계를 찾아보세요.' } };
  let c, flows, running = false, elapsed = 0, previous = null, selected = -1, compared = false, changed = false, W = 900, H = 540, nodes, completed = new Set(), lastFrame = 0, pointerStart = null;
  let playbackRate = 1, manualClock = false, steps = 0;
  function playback(value) { running = value; elapsed = 0; lastFrame = performance.now(); }
  const ambientEnabled = () => window.WebSimAmbient?.enabled === true;
  const appearanceTime = () => window.WebSimAmbient?.now?.() || 0;
  const fmt = n => Math.round(n).toLocaleString('ko-KR'), minutes = n => `${n.toFixed(1)}분`;
  function snapshot() { return { c: { ...c }, flows: flows.slice(), compared }; }
  function remember() { previous = snapshot(); $('restore').disabled = false; }
  function equilibrium() { return E.equilibrium(c); }
  function current() { return E.costs(c, flows); }
  function syncControls() { for (const k of ['demand', 'fixed', 'shortcut']) $(k).value = c[k]; }
  function reset() { const preset = presets[$('mission').value]; c = E.config({ ...preset, fixed: 45, shortcut: 0 }); flows = equilibrium().flows; previous = null; playback(false); steps = 0; compared = false; changed = false; selected = -1; elapsed = 0; $('mission-brief').textContent = preset.brief; syncControls(); $('message').textContent = preset.brief; update(); }
  function toggle() {
    remember(); c.open = !c.open; changed = true; compared = true;
    if (!c.open) { flows[0] += flows[2] / 2; flows[1] += flows[2] / 2; flows[2] = 0; }
    playback(current().gap >= .015);
    $('message').textContent = running ? '새 도로가 열렸습니다. 운전자들이 더 빠른 경로로 옮기는 과정을 지켜보세요.' : '갈 수 있는 경로가 바뀌었습니다. 같은 수요에서 통근 시간이 어떻게 달라졌는지 비교하세요.';
    update();
  }
  function step() { const result = E.step(c, flows); flows = result.flows; steps++; if (result.gap < .015) { flows = equilibrium().flows; playback(false); } else $('message').textContent = `${names[result.from]}에서 ${names[result.to]}로 약 ${fmt(result.moved)}대가 옮겼습니다. 경로를 옮길 이득이 없어질 때까지 이어집니다.`; update(); }
  function update() {
    const result = current(), settled = result.gap < .015;
    $('toggle-road').textContent = c.open ? '지름길 닫기' : '지름길 열기'; $('toggle-road').setAttribute('aria-pressed', String(!c.open)); $('play').textContent = running ? '일시정지' : settled ? '자동 재생 · 완료' : '자동 재생'; $('play').disabled = settled; $('step').disabled = settled; $('play').setAttribute('aria-pressed', String(running));
    $('status-chip').textContent = settled ? '경로 선택 완료' : `경로 조정 중 · 차이 ${result.gap.toFixed(1)}분`;
    $('time-stat').textContent = minutes(result.average); $('shortcut-stat').textContent = `${Math.round(flows[2] / c.demand * 100)}%`;
    const delta = previous ? result.average - E.costs(previous.c, previous.flows).average : null;
    $('delta-stat').textContent = delta == null ? '—' : Math.abs(delta) < .05 ? '변화 없음' : `${Math.abs(delta).toFixed(1)}분 ${delta < 0 ? '↓' : '↑'}`;
    $('demand-value').textContent = `${fmt(c.demand)}대`; $('fixed-value').textContent = `${c.fixed}분`; $('shortcut-value').textContent = `${c.shortcut}분`;
    $('restore').disabled = !previous;
    $('edge-changes').hidden = !previous;
    if (previous) {
      const before = E.costs(previous.c, previous.flows), edgeNames = ['집 → 위', '위 → 회사', '집 → 아래', '아래 → 회사'];
      const changedEdges = edgeNames.map((name,i) => ({name,i})).filter(({i}) => Math.abs(result.edgeTimes[i]-before.edgeTimes[i])>.05);
      $('edge-changes').textContent = changedEdges.length ? '이전 상태와 비교한 도로의 변화\n' + changedEdges.map(({name,i}) => `${name}: ${fmt(before.edges[i])} → ${fmt(result.edges[i])}대 · ${before.edgeTimes[i].toFixed(1)} → ${result.edgeTimes[i].toFixed(1)}분`).join('\n') : '바깥 네 도로의 시간은 이전 상태와 같습니다. 지름길의 개폐와 실제 이용량도 함께 확인하세요.';
    }
    names.forEach((_, i) => { $('route-' + i).textContent = i === 2 && !c.open ? '닫힘' : `${fmt(flows[i])}대 · ${minutes(result.times[i])}`; document.querySelector(`[data-route="${i}"]`).setAttribute('aria-pressed', String(selected === i)); });
    if (selected >= 0) $('route-note').textContent = selected === 2 && !c.open ? '지름길이 닫혀 이 경로로 이동할 수 없습니다.' : `${names[selected]}: 지금 차량 ${fmt(flows[selected])}대가 이용합니다. 이때 혼자 이 경로를 택하면 약 ${minutes(result.times[selected])}이 걸립니다.`;
    const mission = $('mission').value, preset = presets[mission], matches = c.demand === preset.demand && c.fixed === 45 && c.shortcut === 0;
    if (changed && settled && matches && mission !== 'free' && c.open !== preset.open) {
      completed.add(mission);
      $('message').textContent = mission === 'paradox' ? '발견! 지름길을 닫자 80분 → 65분. 각자 빠른 길을 고르는 결과와 모두에게 빠른 결과는 다를 수 있습니다.' : mission === 'quiet' ? '이번에는 지름길이 이득입니다. 50분 → 20분. 도로의 효과는 수요에 따라 달라집니다.' : '시간이 그대로입니다. 이미 쓰이지 않던 지름길을 닫았기 때문입니다. 도로 수보다 실제 경로 선택이 중요합니다.';
    }
    $('mission-count').textContent = `${completed.size} / 3`; draw();
  }
  function resize() { const mobile = stage.clientWidth < 550; W = mobile ? 360 : 900; H = mobile ? 480 : 540; const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.aspectRatio = `${W}/${H}`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); nodes = mobile ? [{x:35,y:222},{x:180,y:110},{x:180,y:333},{x:325,y:222}] : [{x:110,y:245},{x:450,y:105},{x:450,y:385},{x:790,y:245}]; draw(); }
  function line(a, b, color, width, dash = []) { ctx.beginPath(); ctx.setLineDash(dash); ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();ctx.setLineDash([]); }
  function label(text, x, y, color = '#192d29', size = 14) { ctx.font = `600 ${size}px system-ui,sans-serif`; const width = ctx.measureText(text).width + 14; ctx.fillStyle = '#ffffffed'; ctx.beginPath();ctx.roundRect(x-width/2,y-size/2-5,width,size+10,6);ctx.fill();ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y); }
  function pointOnPath(points, distance) {
    for(let i=1;i<points.length;i++) {const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(distance<=length||i===points.length-1){const t=Math.max(0,Math.min(1,distance/length));return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}distance-=length;}
    return points.at(-1);
  }
  function drawRouteFlow(points, route, time, mobile) {
    if(flows[route]<.1)return;const total=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0),count=Math.max(1,Math.round(flows[route]/c.demand*22)),moving=ambientEnabled(),duration=15000+current().times[route]*90;
    ctx.save();ctx.globalAlpha=selected<0||selected===route?1:.32;
    for(let k=0;k<count;k++) {
      const distance=((k/count+(moving?time/duration:0))%1)*total,head=pointOnPath(points,distance);
      if(moving){const tail=pointOnPath(points,Math.max(0,distance-(mobile?18:34))),gradient=ctx.createLinearGradient(tail.x,tail.y,head.x+.001,head.y+.001);gradient.addColorStop(0,colors[route]+'00');gradient.addColorStop(1,colors[route]+'b8');ctx.beginPath();for(let n=0;n<=8;n++){const p=pointOnPath(points,Math.max(0,distance-(mobile?18:34)*(1-n/8)));if(n===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.strokeStyle=gradient;ctx.lineWidth=mobile?3:4;ctx.lineCap='round';ctx.stroke();ctx.shadowColor=colors[route];ctx.shadowBlur=mobile?4:7;}
      ctx.fillStyle=colors[route];ctx.beginPath();ctx.arc(head.x,head.y,mobile?2.1:2.8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    ctx.restore();
  }
  function draw() {
    if (!nodes || !c) return; const mobile = W < 550, r = current(), [s,a,b,t] = nodes, links = [[s,a],[a,t],[s,b],[b,t],[a,b]], active = selected < 0 ? null : E.routes[selected], before=previous?E.costs(previous.c,previous.flows):null;
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#f5f6f1';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#e7eee1'; for (const [x,y,rad] of mobile ? [[70,135,24],[295,340,29]] : [[235,175,40],[665,340,53],[190,352,21]]) {ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fill();}
    ctx.font=`600 ${mobile?14:17}px system-ui,sans-serif`;ctx.textAlign='left';ctx.fillStyle='#192d29';ctx.fillText(`${fmt(c.demand)}대가 같은 출근길을 고릅니다`,mobile?18:26, mobile?28:35);
    ctx.font=`${mobile?11:13}px system-ui,sans-serif`;ctx.fillStyle='#62706a';ctx.fillText('초록: 혼잡에 따라 증가   회색: 일정한 시간',mobile?18:26,mobile?49:58);
    links.forEach(([p,q],i) => {
      const closed = i === 4 && !c.open, roadColor = i===4?'#c59160':i===0||i===3?'#91b8a0':'#c6cfc9';
      if(before&&i<4&&Math.abs(r.edgeTimes[i]-before.edgeTimes[i])>.05){ctx.save();ctx.globalAlpha=.23;line(p,q,r.edgeTimes[i]<before.edgeTimes[i]?'#3e947b':'#c88652',mobile?20:26);ctx.restore();}
      if (active && active[i] && !closed) line(p,q,colors[selected],mobile?20:24);
      line(p,q,closed?'#d0d5cb':roadColor,mobile?12:16,closed?[6,8]:[]);
      if(!closed) line(p,q,'#fff9',1,[4,8]);
    });
    [[s,a,t],[s,b,t],[s,a,b,t]].forEach((points,i)=>{if(i!==2||c.open)drawRouteFlow(points,i,appearanceTime(),mobile);});
    const spots=mobile?[[79,144],[281,144],[79,303],[281,303]]:[[268,143],[632,143],[268,344],[632,344]];
    for(let i=0;i<4;i++){const delta=before?r.edgeTimes[i]-before.edgeTimes[i]:0;label(`${Math.abs(delta)>.05?before.edgeTimes[i].toFixed(0)+' → ':''}${r.edgeTimes[i].toFixed(0)}분`,spots[i][0],spots[i][1],Math.abs(delta)>.05?(delta<0?'#21654f':'#a96534'):i===0||i===3?'#21654f':'#62706a',mobile?13:17);}
    label(c.open?`지름길 ${c.shortcut}분`:'지름길 닫힘',a.x,mobile?214:234,c.open?'#9d6230':'#62706a',mobile?13:16);
    label(c.open?'눌러서 닫기':'눌러서 열기',a.x,mobile?242:264,'#62706a',mobile?10:12);
    [s,a,b,t].forEach((p,i)=>{ctx.fillStyle=i===0||i===3?'#21654f':'#fff';ctx.strokeStyle='#92aa9a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,mobile?19:24,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=i===0||i===3?'#fff':'#21654f';ctx.font=`700 ${mobile?12:15}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(['집','위','아래','회사'][i],p.x,p.y);});
    const top = mobile ? 388 : 442, pad = mobile ? 14 : 25, boxW = (W-pad*3)/2;
    for(let i=0;i<2;i++) {const open=i===1, eq=E.equilibrium({...c,open}),x=pad+i*(boxW+pad);ctx.fillStyle=open===c.open?'#e7f0e5':'#fff';ctx.beginPath();ctx.roundRect(x,top,boxW,mobile?74:76,9);ctx.fill();ctx.textAlign='left';ctx.fillStyle='#62706a';ctx.font=`${mobile?11:12}px system-ui,sans-serif`;ctx.fillText(open?'지름길 열기 · 선택 완료':'지름길 닫기 · 선택 완료',x+12,top+19);ctx.fillStyle='#21654f';ctx.font=`700 ${mobile?20:25}px system-ui,sans-serif`;ctx.fillText(compared?minutes(eq.average):'직접 바꿔 보기',x+12,top+47);}
  }
  function advance(ms) { if(running){elapsed+=Math.max(0,ms)*playbackRate;while(elapsed+1e-7>=500&&running){elapsed-=500;step();}} if(ambientEnabled()||running)draw(); }
  function restore(){ if(!previous)return;const back=previous;previous=snapshot();c={...back.c};flows=back.flows.slice();compared=back.compared;playback(false);steps=0;changed=false;syncControls();$('message').textContent='변경 전 도로와 차량 배치를 복원했습니다.';update(); }
  async function fullscreen() { if(document.fullscreenElement){await document.exitFullscreen();return;} if(stage.classList.contains('expanded')){stage.classList.remove('expanded');$('exit-fullscreen').hidden=true;resize();return;}try{await stage.requestFullscreen();}catch{stage.classList.add('expanded');} $('exit-fullscreen').hidden=false;resize(); }
  $('toggle-road').onclick=toggle;$('play').onclick=()=>{if(current().gap<.015)return;playback(!running);update();};$('step').onclick=()=>{playback(false);if(current().gap>=.015)step();};$('reset').onclick=reset;$('mission').onchange=reset;$('restore').onclick=restore;
  $('playback-speed').onchange=()=>{playbackRate=Number($('playback-speed').value);playback(running);update();};
  $('compare').onclick=()=>{if(!previous)remember();compared=true;flows=equilibrium().flows;playback(false);$('message').textContent='수요와 모든 도로 시간을 고정하고, 지름길 개폐만 바꾼 두 결과입니다. 두 숫자는 각 경우의 경로 선택이 끝난 뒤의 통근 시간입니다.';update();};
  for(const k of ['demand','fixed','shortcut']) {$(k).addEventListener('focus',()=>remember());$(k).addEventListener('pointerdown',()=>remember());$(k).oninput=()=>{const oldDemand=c.demand;c[k]=Number($(k).value);if(k==='demand')flows=flows.map(f=>f*c.demand/oldDemand);changed=false;playback(current().gap>=.015);$('mission').value='free';$('mission-brief').textContent=presets.free.brief;update();};}
  document.querySelectorAll('[data-route]').forEach(button=>button.onclick=()=>{selected=selected===+button.dataset.route?-1:+button.dataset.route;update();});
  canvas.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0)pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};});
  canvas.addEventListener('pointermove',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>10)pointerStart.moved=true;});
  canvas.addEventListener('pointercancel',()=>{pointerStart=null;});
  canvas.addEventListener('pointerup',event=>{const start=pointerStart;pointerStart=null;if(!start||start.id!==event.pointerId||start.moved||Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)return;const box=canvas.getBoundingClientRect(),x=(event.clientX-box.left)*W/box.width,y=(event.clientY-box.top)*H/box.height;if(Math.abs(x-nodes[1].x)<38&&y>nodes[1].y+24&&y<nodes[2].y-24)toggle();});
  window.addEventListener('websim:ambient-change',draw);
  $('fullscreen').onclick=fullscreen;$('exit-fullscreen').onclick=fullscreen;document.addEventListener('fullscreenchange',()=>{$('exit-fullscreen').hidden=!document.fullscreenElement&&!stage.classList.contains('expanded');resize();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&stage.classList.contains('expanded')){fullscreen();return;}if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;if(event.key.toLowerCase()==='f'){event.preventDefault();fullscreen();}else if(event.code==='Space'&&event.target.tagName!=='BUTTON'){event.preventDefault();$('play').click();}else if(event.key==='ArrowRight'){event.preventDefault();$('step').click();}});
  window.render_game_to_text=()=>JSON.stringify({coordinates:'origin top-left, x right, y down',mission:$('mission').value,config:c,flows:flows.map(Math.round),...current(),running,playbackRate,stepIntervalMs:500/playbackRate,steps,compared,previous:previous?{config:previous.c,average:E.costs(previous.c,previous.flows).average}:null,selectedRoute:selected,effectsEnabled:ambientEnabled(),roadChanges:previous?$('edge-changes').textContent:null,completed:[...completed],message:$('message').textContent});
  window.advanceTime=ms=>{manualClock=true;advance(Number(ms)||0);};new ResizeObserver(resize).observe(stage);reset();resize();requestAnimationFrame(function frame(t){const dt=lastFrame?Math.min(100,t-lastFrame):0;lastFrame=t;if(!manualClock)advance(dt);requestAnimationFrame(frame);});
})();
