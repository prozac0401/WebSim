(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d'), flow = window.InkFlow;
  const palettes = {classic:['#d76563','#21654f','#4587b6','#8769aa'],lagoon:['#1f7084','#4d9b8a','#91ab93','#6478a5'],sunset:['#c46a56','#d9a563','#914f78','#575b91']};
  const views = {
    cylinder: {label:'원통형',unit:'바퀴',area:'고리',description:'안쪽 원통을 돌려 잉크를 길게 감습니다. 안쪽과 바깥쪽의 움직임을 비교하세요.',cycle:'1바퀴는 안쪽 원통의 한 번 회전입니다.',explanation:'바깥 원통은 고정하고 안쪽 원통을 돌리는 층류 모형입니다. 경계에서 잉크의 무작위 이동은 반사됩니다.',boundary:'바깥 원통은 고정 · 안쪽 원통은 회전'},
    square: {label:'사각 캔버스형',unit:'주기',area:'사각 캔버스',description:'가로와 세로 흐름이 번갈아 그림을 늘립니다. 가장자리를 넘으면 반대편으로 이어집니다.',cycle:'1주기 = 가로 흐름 ½주기 + 세로 흐름 ½주기',explanation:'가로·세로 사인 모양 흐름을 번갈아 주는 이상화 모형입니다. 좌우와 위아래가 이어져 있어 잉크가 가장자리에서 반대편으로 넘어갑니다. 실제 벽으로 막힌 수조는 아닙니다.',boundary:'좌우 · 위아래가 이어지는 캔버스'},
    vortices: {label:'두 소용돌이형',unit:'주기',area:'수조',description:'왼쪽과 오른쪽 소용돌이가 번갈아 잉크를 감습니다. 두 흐름이 겹치는 곳을 살펴보세요.',cycle:'1주기 = 왼쪽 소용돌이 ½주기 + 오른쪽 소용돌이 ½주기',explanation:'두 곳에서 반대 방향으로 도는 흐름을 번갈아 주는 이상화 모형입니다. 소용돌이 가장자리로 갈수록 흐름이 약해집니다. 수조 경계에서 무작위 이동은 반사됩니다.',boundary:'두 흐름이 겹치는 곳에서 더 복잡하게 섞입니다'},
    plates: {label:'평행판형',unit:'주기',area:'두 판 사이',description:'위아래 판이 반대 방향으로 움직입니다. 층마다 다른 속도로 잉크가 길게 늘어납니다.',cycle:'1주기는 위아래 판이 각각 모형 거리 2만큼 반대 방향으로 이동하는 양입니다.',explanation:'두 평행판 사이의 선형 전단 흐름을 나타냅니다. 위아래에서 무작위 이동은 반사되고, 좌우는 이어집니다. 길게 이어지는 통로의 일부를 보는 모형입니다.',boundary:'좌우는 이어지는 통로 · 위아래는 움직이는 판'}
  };
  const INNER = .32, R = 244, CX = 400, CY = 300, DT = 1/60, LIMIT = 9000;
  const requestedMode = new URLSearchParams(location.search).get('flow');
  let mode = Object.hasOwn(views, requestedMode) ? requestedMode : 'cylinder';
  let particles = [], turns = 0, time = 0, target = null, running = false, color = 0, rng = 73, initialRng = 73;
  let colors = palettes.classic, drawing = false, strokes = [], manual = false, last = null, accumulator = 0, pointer = null, activePointer = null;
  const drawings = new Map();
  const random = () => { rng = (Math.imul(rng,1664525)+1013904223)>>>0; return (rng+.5)/4294967296; };
  const normal = () => Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
  const unit = () => views[mode].unit;
  const direction = () => target === null ? 1 : Math.sign(target-turns) || 1;
  function message(text) { $('message').textContent = text; }
  function stopPointer() {
    if(activePointer !== null && canvas.hasPointerCapture(activePointer)) canvas.releasePointerCapture(activePointer);
    activePointer = null; pointer = null;
  }
  function resetClock() { stopPointer(); turns=0; time=0; target=null; running=false; accumulator=0; last=null; }
  function add(x,y,c) { if(flow.contains(mode,x,y,.012) && particles.length<LIMIT) particles.push({x,y,x0:x,y0:y,c}); }
  function dot(x,y,c,size=.025,count=35) {
    for(let i=0;i<count;i++) { const a=random()*Math.PI*2,r=Math.sqrt(random())*size; add(x+Math.cos(a)*r,y+Math.sin(a)*r,c); }
  }
  function preset(kind) {
    resetClock(); strokes=[]; drawing=kind==='blank'; particles=[]; rng=73;
    const ring = mode==='cylinder';
    if(kind==='heart') {
      for(let i=0;i<4800;i++) {
        const x=(random()*2-1)*1.15,y=(random()*2-1)*1.15;
        if((x*x+y*y-1)**3-x*x*y**3<=0) add((ring?.59:0)+x*(ring?.19:.40),-y*(ring?.19:.40),0);
      }
    }
    if(kind==='drops') for(let c=0;c<3;c++) { const a=c*2*Math.PI/3-.25; dot(.62*Math.cos(a),.62*Math.sin(a),c,ring?.085:.11,1100); }
    if(kind==='stripes') for(let c=0;c<4;c++) for(let i=0;i<850;i++) add(ring?.4+random()*.43:-.85+random()*1.7,(c-1.5)*(ring?.09:.18)+(random()-.5)*.045,c);
    if(kind==='rosette') for(let i=0;i<480;i++) { const a=i/480*Math.PI*2,r=(ring?.67:.43)+(ring?.18:.16)*Math.cos(6*a); dot(r*Math.cos(a),r*Math.sin(a),Math.floor(i/80)%4,.012,10); }
    if(kind==='galaxy') for(let arm=0;arm<4;arm++) for(let i=0;i<250;i++) { const t=i/249,a=arm*Math.PI/2+t*Math.PI*1.6,r=(ring?.38:.035)+(ring?.53:.60)*t; dot(r*Math.cos(a),r*Math.sin(a),arm,.008+.012*t,5); }
    if(kind==='sunburst') for(let ray=0;ray<24;ray++) for(let i=0;i<30;i++) { const a=ray*Math.PI/12+.035*Math.sin(i/29*Math.PI),r=(ring?.4:.065)+i/29*(ray%2?.4:.54); dot(r*Math.cos(a),r*Math.sin(a),ray%4,.009,5); }
    initialRng=rng;
    message(kind==='blank'?`${views[mode].area} 안을 클릭하거나 끌어 잉크를 그려 주세요.`:`그림이 준비됐습니다. 3${unit()} 섞은 뒤 반대로 되돌려 보세요.`);
    render();
  }
  function setMode(next) {
    if(next===mode || !Object.hasOwn(views,next)) return;
    drawings.set(mode,{particles:particles.map(p=>({...p,x:p.x0,y:p.y0})),rng:initialRng,preset:$('preset').value,drawing});
    mode=next; syncMode();
    const saved=drawings.get(mode);
    if(saved) {
      resetClock(); strokes=[]; particles=saved.particles.map(p=>({...p})); rng=initialRng=saved.rng;
      drawing=saved.drawing; $('preset').value=saved.preset;
    } else preset($('preset').value);
    message(`${views[mode].label}의 처음 그림입니다. ${views[mode].description}`);
    render();
  }
  function syncMode() {
    const view=views[mode], cylindrical=mode==='cylinder';
    $('flow').value=mode;
    $('flow-description').textContent=view.description;
    $('mix').textContent=`3${unit()} 섞기`;
    $('left').textContent=`← ¼${unit()}`; $('right').textContent=`¼${unit()} →`;
    $('amount-label').textContent=cylindrical?'원통 누적 회전':'누적 흐름';
    $('speed-label').textContent=cylindrical?'회전 속도':'진행 속도';
    $('speed-value').textContent=Number($('speed').value).toFixed(2)+` ${unit()}/t`;
    $('cycle-help').textContent=view.cycle;
    $('flow-explanation').textContent=view.explanation;
    $('error-explanation').textContent=cylindrical?'오차는 각 입자와 처음 위치 사이 거리의 제곱평균제곱근을 바깥 반지름으로 나눈 값입니다.':'오차는 각 입자와 처음 위치 사이 거리의 제곱평균제곱근을 화면 가로 반폭으로 나눈 값입니다. 이어진 방향에서는 가장 짧은 거리를 씁니다.';
    $('draw-hint').textContent=`그리기를 켜고 ${view.area}에 그립니다 · ← → ¼${unit()} · Space 멈춤`;
    $('preset').querySelector('[value=blank]').textContent=(cylindrical?'빈 고리':'빈 화면')+' · 직접 그리기';
    canvas.setAttribute('aria-label',`${view.label}의 잉크. 섞기 전에 클릭하거나 드래그해 그립니다. 방향키로 ¼${unit()}씩 움직입니다.`);
  }
  function move(delta,dt) {
    const diffusion=Number($('diffusion').value)*.00012, noise=Math.sqrt(2*diffusion*dt);
    for(const p of particles) {
      flow.advect(mode,p,turns,turns+delta);
      if(noise) flow.diffuse(mode,p,normal()*noise,normal()*noise);
    }
    turns+=delta; time+=dt;
  }
  function update(dt) {
    if(!running || target===null) return;
    const speed=Number($('speed').value),remaining=target-turns;
    const delta=Math.sign(remaining)*Math.min(Math.abs(remaining),speed*dt);
    move(delta,Math.abs(delta)/speed);
    if(Math.abs(target-turns)<1e-8) {
      turns=target; running=false; target=null;
      message(Math.abs(turns)<1e-8?'되돌리기 완료! 처음 그림과 복원 오차를 확인해 보세요. 확산으로 퍼진 잉크는 그대로 남습니다.':'섞기가 끝났습니다. 이제 반대로 되돌리기를 눌러 보세요.');
    }
  }
  function moveTo(value) {
    if(!particles.length) { message(`먼저 ${views[mode].area}에 잉크를 그려 주세요.`); return; }
    stopPointer(); target=Math.abs(value-turns)>1e-8?value:null; running=target!==null; accumulator=0; last=null;
    message(value===0?'흐름의 순서와 방향을 거꾸로 따라가는 중입니다.':views[mode].description); render();
  }
  function pause() {
    if(target===null) return;
    running=!running; last=null; accumulator=0;
    message(running?'이어서 움직입니다.':'잠시 멈췄습니다. 확산이나 속도를 바꿔도 됩니다.'); render();
  }
  function error() {
    return particles.length?Math.sqrt(particles.reduce((sum,p)=>sum+flow.displacementSquared(mode,p),0)/particles.length)/flow.modes[mode].halfWidth*100:0;
  }
  function pathDomain() {
    ctx.beginPath();
    if(mode==='cylinder') { ctx.arc(CX,CY,R,0,Math.PI*2); ctx.moveTo(CX+R*INNER,CY); ctx.arc(CX,CY,R*INNER,0,Math.PI*2,true); }
    else { const d=flow.modes[mode]; ctx.rect(CX-R*d.halfWidth,CY-R*d.halfHeight,2*R*d.halfWidth,2*R*d.halfHeight); }
  }
  function arrow(x,y,dx,dy,alpha=1) {
    ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle='#21654f'; ctx.lineWidth=2.5; ctx.lineCap='round';
    const angle=Math.atan2(dy,dx),ex=x+dx,ey=y+dy;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(ex,ey); ctx.moveTo(ex-8*Math.cos(angle-.55),ey-8*Math.sin(angle-.55)); ctx.lineTo(ex,ey); ctx.lineTo(ex-8*Math.cos(angle+.55),ey-8*Math.sin(angle+.55)); ctx.stroke(); ctx.restore();
  }
  function drawField() {
    ctx.fillStyle='#f5f6f1'; ctx.fillRect(0,0,800,600);
    pathDomain(); const liquid=ctx.createLinearGradient(80,65,680,530); liquid.addColorStop(0,'#fafcf6'); liquid.addColorStop(1,'#e4eee5'); ctx.fillStyle=liquid; ctx.fill('evenodd'); ctx.strokeStyle='#bdcebc'; ctx.lineWidth=2; ctx.stroke();
    ctx.save(); pathDomain(); ctx.clip('evenodd'); ctx.strokeStyle='#d7e3d3'; ctx.lineWidth=1; ctx.setLineDash([3,7]);
    if(mode==='cylinder') {
      for(const rr of [.48,.66,.84]) { ctx.beginPath(); ctx.arc(CX,CY,R*rr,0,Math.PI*2); ctx.stroke(); }
    } else {
      const d=flow.modes[mode];
      for(let x=-1.25;x<d.halfWidth;x+=.25) { ctx.beginPath(); ctx.moveTo(CX+x*R,CY-d.halfHeight*R); ctx.lineTo(CX+x*R,CY+d.halfHeight*R); ctx.stroke(); }
      for(let y=-.75;y<d.halfHeight;y+=.25) { ctx.beginPath(); ctx.moveTo(CX-d.halfWidth*R,CY+y*R); ctx.lineTo(CX+d.halfWidth*R,CY+y*R); ctx.stroke(); }
    }
    ctx.setLineDash([]);
    if(mode==='vortices') {
      const active=flow.phase(mode,turns,direction());
      for(let i=0;i<2;i++) {
        const x=CX+(i===0?-.42:.42)*R; ctx.beginPath(); ctx.arc(x,CY,R*.8,0,Math.PI*2);
        ctx.strokeStyle=i===active?'#a7c6af':'#c8d9c9'; ctx.setLineDash([5,7]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }
  function drawInk() {
    ctx.save(); pathDomain(); ctx.clip('evenodd'); ctx.globalAlpha=.66;
    ctx.shadowBlur=window.WebSimAmbient?.enabled?2.5:0; ctx.shadowColor='#6b8b7770';
    for(let c=0;c<4;c++) {
      ctx.fillStyle=colors[c]; ctx.beginPath();
      for(const p of particles) if(p.c===c) { const x=CX+p.x*R,y=CY+p.y*R; ctx.moveTo(x+1.4,y); ctx.arc(x,y,1.4,0,Math.PI*2); }
      ctx.fill();
    }
    ctx.restore();
  }
  function drawGuides() {
    ctx.fillStyle='#62706a'; ctx.font='18px sans-serif'; ctx.textAlign='center';
    if(mode==='cylinder') {
      ctx.beginPath(); ctx.arc(CX,CY,R*INNER,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#b8cbb3'; ctx.lineWidth=2; ctx.stroke();
      const a=turns*2*Math.PI-Math.PI/2; arrow(CX,CY,Math.cos(a)*R*INNER*.72,Math.sin(a)*R*INNER*.72);
      ctx.beginPath(); ctx.arc(CX,CY,7,0,Math.PI*2); ctx.fillStyle='#21654f'; ctx.fill();
      ctx.fillStyle='#62706a'; ctx.fillText('회전 원통',CX,CY+48);
    } else if(mode==='square') {
      const active=flow.phase(mode,turns,direction()), sign=direction();
      if(active===0) for(const y of [-.5,.5]) arrow(115,CY+y*R,sign*Math.sign(y)*35,0,.6);
      else for(const x of [-.5,.5]) arrow(CX+x*R,95,0,sign*Math.sign(x)*28,.45);
    } else if(mode==='vortices') {
      const active=flow.phase(mode,turns,direction());
      for(let i=0;i<2;i++) {
        const x=CX+(i===0?-.42:.42)*R,sign=(i===0?1:-1)*direction();
        ctx.save(); ctx.globalAlpha=i===active?.8:.25; ctx.strokeStyle='#21654f'; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.arc(x,CY,18,-Math.PI*.7,Math.PI*.7); ctx.stroke();
        ctx.beginPath(); ctx.arc(x,CY,3,0,Math.PI*2); ctx.fillStyle='#21654f'; ctx.fill(); ctx.restore();
        arrow(x+18,CY,0,sign*10,i===active?.8:.25);
      }
    } else if(mode==='plates') {
      const d=flow.modes[mode],left=CX-d.halfWidth*R,width=2*d.halfWidth*R;
      for(const sign of [-1,1]) {
        const edge=CY+sign*d.halfHeight*R,y=sign<0?edge-19:edge;
        ctx.fillStyle='#c4d7c6'; ctx.fillRect(left,y,width,19);
        ctx.save(); ctx.beginPath(); ctx.rect(left,y,width,19); ctx.clip(); ctx.strokeStyle='#91b59e'; ctx.lineWidth=2;
        const offset=((sign*turns*R*2)%32+32)%32;
        for(let x=left-32+offset;x<left+width+32;x+=32) { ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+13,y+19); ctx.stroke(); }
        ctx.restore(); arrow(CX-40*sign*direction(),edge+sign*39,80*sign*direction(),0,.7);
      }
    }
    const active=flow.phase(mode,turns,direction());
    let label=views[mode].label;
    if(mode==='square') label+=' · '+(active===0?'가로 흐름':'세로 흐름');
    if(mode==='vortices') label+=' · '+(active===0?'왼쪽 작동':'오른쪽 작동');
    if(target===0) label+=' · 되돌리는 중';
    ctx.fillStyle='#365b49'; ctx.font='600 21px sans-serif'; ctx.fillText(label,CX,29);
    ctx.fillStyle='#62706a'; ctx.font='18px sans-serif'; ctx.fillText(views[mode].boundary,CX,578);
    if(!particles.length) { ctx.font='20px sans-serif'; ctx.fillText('그리기를 켜고 나만의 잉크를 놓아 보세요',CX,mode==='cylinder'?125:CY-65); }
  }
  function render() {
    drawField(); drawInk(); drawGuides();
    $('turns-stat').textContent=turns.toFixed(2)+` ${unit()}`; $('error-stat').textContent=error().toFixed(2)+'%'; $('time-stat').textContent=time.toFixed(1)+' t';
    const editable=time===0 && target===null;
    $('mode-chip').textContent=running?(target===0?'되돌리는 중':'섞는 중'):target!==null?'일시정지':editable?'그릴 수 있어요':'관찰 중';
    $('pause').disabled=target===null; $('pause').textContent=running||target===null?'일시정지':'계속 진행';
    $('reverse').disabled=Math.abs(turns)<1e-8; $('mix').disabled=!particles.length;
    canvas.style.cursor=editable&&drawing?'crosshair':'default'; canvas.style.touchAction=editable&&drawing?'none':'pan-y';
    $('draw-mode').disabled=!editable; $('draw-mode').setAttribute('aria-pressed',String(drawing&&editable)); $('draw-mode').textContent=drawing&&editable?'그리기 종료':'잉크 그리기';
    $('undo-stroke').disabled=!editable||!strokes.length;
  }
  $('flow').onchange=e=>setMode(e.target.value);
  $('mix').onclick=()=>moveTo(turns+3); $('reverse').onclick=()=>moveTo(0); $('pause').onclick=pause;
  $('left').onclick=()=>moveTo(turns-.25); $('right').onclick=()=>moveTo(turns+.25);
  $('restore').onclick=()=>{resetClock(); for(const p of particles) {p.x=p.x0;p.y=p.y0;} rng=initialRng; message('처음 그림을 다시 불러왔습니다. 그림을 더 그리거나 조건을 바꿔 실험하세요.');render();};
  $('clear').onclick=()=>{ $('preset').value='blank'; preset('blank'); }; $('preset').onchange=e=>preset(e.target.value);
  $('diffusion').oninput=e=>{$('diffusion-value').textContent=e.target.value==='0'?'없음':e.target.value+' / 10';};
  $('speed').oninput=e=>{ $('speed-value').textContent=Number(e.target.value).toFixed(2)+` ${unit()}/t`; accumulator=0; last=null; };
  $('draw-mode').onclick=()=>{stopPointer(); drawing=!drawing; render();};
  $('undo-stroke').onclick=()=>{if(time!==0||target!==null)return;const prior=strokes.pop();if(!prior)return;particles=prior.particles;rng=initialRng=prior.rng;message('마지막 한 획과 대칭으로 그린 잉크를 함께 되돌렸습니다.');render();};
  $('palette').onchange=()=>{colors=palettes[$('palette').value];document.querySelectorAll('[data-color]').forEach((b,i)=>{b.querySelector('.swatch').style.setProperty('--swatch',colors[i]);b.setAttribute('aria-label',`팔레트 ${i+1}번 색 잉크`);});render();};
  window.addEventListener('websim:ambient-change',render);
  $('brush').oninput=e=>{$('brush-value').textContent=e.target.value;};
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{color=Number(b.dataset.color);document.querySelectorAll('[data-color]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  function position(e) {
    const rect=canvas.getBoundingClientRect();
    return {x:((e.clientX-rect.left)*800/rect.width-CX)/R,y:((e.clientY-rect.top)*600/rect.height-CY)/R};
  }
  function paint(e) {
    if(time!==0||target!==null||!drawing)return;
    const {x,y}=position(e); if(!flow.contains(mode,x,y,.012)){pointer=null;return;}
    const copies=Number($('symmetry').value), stamp=(sx,sy,count)=>{
      for(let k=0;k<copies;k++){const a=k*Math.PI*2/copies;dot(sx*Math.cos(a)-sy*Math.sin(a),sx*Math.sin(a)+sy*Math.cos(a),color,Number($('brush').value)/R,count);}
    };
    if(pointer){const d=Math.hypot(x-pointer.x,y-pointer.y),n=Math.ceil(d/.015);for(let i=1;i<n;i++)stamp(pointer.x+(x-pointer.x)*i/n,pointer.y+(y-pointer.y)*i/n,8);}
    stamp(x,y,30);pointer={x,y};initialRng=rng;
    if(particles.length>=LIMIT)message('잉크가 가득 찼습니다. 이제 섞어 보세요.');render();
  }
  canvas.onpointerdown=e=>{
    if(e.button!==0||!drawing||time!==0||target!==null||activePointer!==null)return;
    const p=position(e);if(!flow.contains(mode,p.x,p.y,.012))return;
    strokes.push({particles:particles.map(p=>({...p})),rng});if(strokes.length>16)strokes.shift();
    activePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});pointer=null;paint(e);
  };
  canvas.onpointermove=e=>{if(e.pointerId===activePointer)paint(e);};
  canvas.onpointerup=canvas.onpointercancel=e=>{if(e.pointerId===activePointer)stopPointer();};
  canvas.onlostpointercapture=e=>{if(e.pointerId===activePointer){activePointer=null;pointer=null;}};
  const fullscreen=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen?.();}else if(typeof $('stage').requestFullscreen==='function'){await $('stage').requestFullscreen();}else{message('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}}catch{message('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}};
  $('fullscreen').onclick=fullscreen;
  canvas.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveTo(turns+(e.key==='ArrowLeft'?-.25:.25));}if(e.code==='Space'){e.preventDefault();pause();}if(e.key.toLowerCase()==='f')fullscreen();};
  $('save').onclick=()=>{const a=document.createElement('a');a.download=`websim-ink-${mode}.png`;a.href=canvas.toDataURL('image/png');a.click();message('현재 잉크 그림을 PNG로 저장했습니다.');};
  window.render_game_to_text=()=>JSON.stringify({coordinateSystem:`center (0,0), x right, y down; ${mode==='cylinder'?'inner radius .32, outer radius 1':`halfWidth ${flow.modes[mode].halfWidth}, halfHeight ${flow.modes[mode].halfHeight}`}`,flow:mode,flowLabel:views[mode].label,phase:flow.phase(mode,turns,direction()),boundary:{periodicX:flow.modes[mode].periodicX,periodicY:flow.modes[mode].periodicY},unit:unit(),preset:$('preset').value,mode:running?'running':target===null?'ready':'paused',drawing:drawing&&time===0&&target===null,undo:strokes.length,symmetry:Number($('symmetry').value),palette:$('palette').value,turns,time,diffusion:Number($('diffusion').value),particles:particles.length,errorPercent:error(),target,sample:particles.slice(0,3)});
  window.advanceTime=ms=>{manual=true;for(let t=0;t<ms/1000-1e-9;t+=DT)update(Math.min(DT,ms/1000-t));render();};
  function frame(now){if(!manual&&last!==null&&running){accumulator+=Math.min((now-last)/1000,.1);while(accumulator>=DT){update(DT);accumulator-=DT;}render();}last=now;requestAnimationFrame(frame);}
  syncMode();preset('heart');requestAnimationFrame(frame);
})();
