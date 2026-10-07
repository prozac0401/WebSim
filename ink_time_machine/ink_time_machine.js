(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  const palettes = {classic:['#d76563','#21654f','#4587b6','#8769aa'],lagoon:['#1f7084','#4d9b8a','#91ab93','#6478a5'],sunset:['#c46a56','#d9a563','#914f78','#575b91']};
  let colors = palettes.classic, drawing = false, strokes = [];
  const INNER = .32, R = 244, CX = 400, CY = 300, DT = 1/60, LIMIT = 9000;
  let particles = [], turns = 0, time = 0, target = null, running = false, color = 0, rng = 73, manual = false, last = null, accumulator = 0, pointer = null;
  const random = () => { rng = (Math.imul(rng,1664525)+1013904223)>>>0; return (rng+.5)/4294967296; };
  const normal = () => Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
  function message(text) { $('message').textContent = text; }
  function add(x,y,c) { const r=Math.hypot(x,y); if(r>INNER+.012 && r<.985 && particles.length<LIMIT) particles.push({x,y,x0:x,y0:y,c}); }
  function dot(x,y,c,size=.025,count=35) { for(let i=0;i<count;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*size;add(x+Math.cos(a)*r,y+Math.sin(a)*r,c);} }
  function preset(kind) {
    strokes=[]; drawing=kind==='blank';
    particles=[];turns=0;time=0;target=null;running=false;accumulator=0;rng=73;
    if(kind==='heart') { for(let i=0;i<4800;i++){const x=(random()*2-1)*1.15,y=(random()*2-1)*1.15;if((x*x+y*y-1)**3-x*x*y**3<=0)add(.59+x*.19,-y*.19,0);} }
    if(kind==='drops') for(let c=0;c<3;c++) {const a=(c*2*Math.PI/3)-.25;dot(.62*Math.cos(a),.62*Math.sin(a),c,.085,1100);}
    if(kind==='stripes') for(let c=0;c<4;c++)for(let i=0;i<850;i++)add(.4+random()*.43,(c-1.5)*.09+(random()-.5)*.035,c);
    message(kind==='blank'?'고리 안을 클릭하거나 끌어 잉크를 그려 주세요.':'그림이 준비됐습니다. 3바퀴 섞은 뒤 반대로 되돌려 보세요.');render();
  }
  function rotate(delta,dt) {
    const diffusion=Number($('diffusion').value)*.00012, noise=Math.sqrt(2*diffusion*dt);
    for(const p of particles) {
      let r=Math.hypot(p.x,p.y);const a=Math.atan2(p.y,p.x)+delta*2*Math.PI*(1/(r*r)-1)/(1/(INNER*INNER)-1);
      p.x=r*Math.cos(a);p.y=r*Math.sin(a);
      if(noise) {p.x+=normal()*noise;p.y+=normal()*noise;r=Math.hypot(p.x,p.y);let reflected=r;
        while(reflected<INNER || reflected>1)reflected=reflected<INNER?2*INNER-reflected:2-reflected;
        if(r>0){p.x*=reflected/r;p.y*=reflected/r;}
      }
    }
    turns+=delta;time+=dt;
  }
  function update(dt) {
    if(!running || target===null)return;
    const remaining=target-turns, delta=Math.sign(remaining)*Math.min(Math.abs(remaining),Number($('speed').value)*dt);
    rotate(delta, Math.abs(delta)/Number($('speed').value));
    if(Math.abs(target-turns)<1e-8) {turns=target;running=false;target=null;
      message(Math.abs(turns)<1e-8 ? (Number($('diffusion').value)>0?'원통은 처음 각도로 돌아왔습니다. 확산으로 퍼진 잉크와 복원 오차를 확인해 보세요.':'되돌리기 완료! 처음 그림과 복원 오차를 확인해 보세요.'):'섞기가 끝났습니다. 이제 반대로 되돌리기를 눌러 보세요.');
    }
  }
  function moveTo(value) { if(!particles.length){message('먼저 고리 안에 잉크를 그려 주세요.');return;}target=value;running=Math.abs(value-turns)>1e-8;accumulator=0;last=null;message(value===0?'원통을 반대 방향으로 돌리는 중입니다.':'원통이 회전하면서 잉크가 층마다 다르게 움직입니다.');render(); }
  function pause() {if(target===null)return;running=!running;last=null;message(running?'이어서 회전합니다.':'잠시 멈췄습니다. 확산이나 속도를 바꿔도 됩니다.');render();}
  function error() {return particles.length?Math.sqrt(particles.reduce((s,p)=>s+(p.x-p.x0)**2+(p.y-p.y0)**2,0)/particles.length)*100:0;}
  function render() {
    ctx.fillStyle='#f5f6f1';ctx.fillRect(0,0,800,600);
    ctx.beginPath();ctx.arc(CX,CY,R,0,Math.PI*2);const liquid=ctx.createRadialGradient(CX-70,CY-80,25,CX,CY,R);liquid.addColorStop(0,'#fafcf6');liquid.addColorStop(1,'#e4eee5');ctx.fillStyle=liquid;ctx.fill();ctx.strokeStyle='#cbd9c8';ctx.lineWidth=2;ctx.stroke();
    for(const rr of [.48,.66,.84]){ctx.beginPath();ctx.arc(CX,CY,R*rr,0,Math.PI*2);ctx.strokeStyle='#dce6d8';ctx.lineWidth=1;ctx.setLineDash([3,7]);ctx.stroke();}ctx.setLineDash([]);
    ctx.globalAlpha=.66;ctx.shadowBlur=window.WebSimAmbient?.enabled?2.5:0;ctx.shadowColor='#6b8b7770';
    for(let c=0;c<4;c++){ctx.fillStyle=colors[c];ctx.beginPath();for(const p of particles)if(p.c===c){const x=CX+p.x*R,y=CY+p.y*R;ctx.moveTo(x+1.4,y);ctx.arc(x,y,1.4,0,Math.PI*2);}ctx.fill();}ctx.globalAlpha=1;
    ctx.shadowBlur=0;ctx.beginPath();ctx.arc(CX,CY,R*INNER,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#b8cbb3';ctx.lineWidth=2;ctx.stroke();
    const a=turns*2*Math.PI-Math.PI/2;ctx.beginPath();ctx.moveTo(CX,CY);ctx.lineTo(CX+Math.cos(a)*R*INNER*.72,CY+Math.sin(a)*R*INNER*.72);ctx.strokeStyle='#21654f';ctx.lineWidth=5;ctx.lineCap='round';ctx.stroke();
    ctx.beginPath();ctx.arc(CX,CY,7,0,Math.PI*2);ctx.fillStyle='#21654f';ctx.fill();
    ctx.fillStyle='#62706a';ctx.font='13px sans-serif';ctx.textAlign='center';ctx.fillText('고정된 바깥 원통',CX,580);ctx.fillText('회전 원통',CX,CY+48);
    if(!particles.length){ctx.fillText('고리 안에 나만의 잉크를 그려 보세요',CX,105);}
    $('turns-stat').textContent=turns.toFixed(2)+' 바퀴';$('error-stat').textContent=error().toFixed(2)+'%';$('time-stat').textContent=time.toFixed(1)+' t';
    const editable=time===0; $('mode-chip').textContent=running?'회전 중':editable?'그릴 수 있어요':'관찰 중';$('pause').disabled=target===null;$('pause').textContent=running||target===null?'일시정지':'계속 회전';$('reverse').disabled=Math.abs(turns)<1e-8;$('mix').disabled=!particles.length;
    canvas.style.cursor=editable&&drawing?'crosshair':'default';canvas.style.touchAction=editable&&drawing?'none':'pan-y';
    $('draw-mode').disabled=!editable;$('draw-mode').setAttribute('aria-pressed',String(drawing&&editable));$('draw-mode').textContent=drawing&&editable?'그리기 종료':'잉크 그리기';$('undo-stroke').disabled=!editable||!strokes.length;
  }
  $('mix').onclick=()=>moveTo(turns+3);$('reverse').onclick=()=>moveTo(0);$('pause').onclick=pause;
  $('left').onclick=()=>moveTo(turns-.25);$('right').onclick=()=>moveTo(turns+.25);
  $('restore').onclick=()=>{for(const p of particles){p.x=p.x0;p.y=p.y0;}turns=0;time=0;target=null;running=false;message('처음 그림을 다시 불러왔습니다. 그림을 더 그리거나 조건을 바꿔 실험하세요.');render();};
  $('clear').onclick=()=>{ $('preset').value='blank';preset('blank');};$('preset').onchange=e=>preset(e.target.value);
  $('diffusion').oninput=e=>{$('diffusion-value').textContent=e.target.value==='0'?'없음':e.target.value+' / 10';};
  $('speed').oninput=e=>{$('speed-value').textContent=Number(e.target.value).toFixed(2)+' 바퀴/t';};
  $('draw-mode').onclick=()=>{drawing=!drawing;render();};
  $('undo-stroke').onclick=()=>{const prior=strokes.pop();if(!prior||time!==0)return;particles=prior.particles;rng=prior.rng;message('마지막 한 획과 대칭으로 그린 잉크를 함께 되돌렸습니다.');render();};
  $('palette').onchange=()=>{colors=palettes[$('palette').value];document.querySelectorAll('[data-color]').forEach((b,i)=>{b.querySelector('.swatch').style.setProperty('--swatch',colors[i]);b.setAttribute('aria-label',`팔레트 ${i+1}번 색 잉크`);});render();};
  window.addEventListener('websim:ambient-change',render);
  $('brush').oninput=e=>{$('brush-value').textContent=e.target.value;};
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{color=Number(b.dataset.color);document.querySelectorAll('[data-color]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  function paint(e) {
    if(time!==0||!drawing)return;
    const rect=canvas.getBoundingClientRect(),x=((e.clientX-rect.left)*800/rect.width-CX)/R,y=((e.clientY-rect.top)*600/rect.height-CY)/R;
    const r=Math.hypot(x,y);if(r<=INNER || r>=1)return;
    const copies=Number($('symmetry').value), stamp=(sx,sy,count)=>{for(let k=0;k<copies;k++){const a=k*Math.PI*2/copies;dot(sx*Math.cos(a)-sy*Math.sin(a),sx*Math.sin(a)+sy*Math.cos(a),color,Number($('brush').value)/R,count);}};
    if(pointer){const d=Math.hypot(x-pointer.x,y-pointer.y),n=Math.ceil(d/.015);for(let i=1;i<n;i++)stamp(pointer.x+(x-pointer.x)*i/n,pointer.y+(y-pointer.y)*i/n,8);}
    stamp(x,y,30);pointer={x,y};
    if(particles.length>=LIMIT)message('잉크가 가득 찼습니다. 이제 섞어 보세요.');render();
  }
  canvas.onpointerdown=e=>{if(e.button!==0||!drawing||time!==0)return;strokes.push({particles:particles.map(p=>({...p})),rng});if(strokes.length>16)strokes.shift();canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});pointer=null;paint(e);};
  canvas.onpointermove=e=>{if(canvas.hasPointerCapture(e.pointerId))paint(e);};
  canvas.onpointerup=canvas.onpointercancel=e=>{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);pointer=null;};
  const fullscreen=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen?.();}else if(typeof $('stage').requestFullscreen==='function'){await $('stage').requestFullscreen();}else{message('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}}catch{message('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}};$('fullscreen').onclick=fullscreen;
  canvas.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveTo(turns+(e.key==='ArrowLeft'?-.25:.25));}if(e.code==='Space'){e.preventDefault();pause();}if(e.key.toLowerCase()==='f')fullscreen();};
  $('save').onclick=()=>{const a=document.createElement('a');a.download='websim-ink.png';a.href=canvas.toDataURL('image/png');a.click();message('현재 잉크 그림을 PNG로 저장했습니다.');};
  window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'center (0,0), x right, y down; inner radius .32, outer radius 1',mode:running?'running':target===null?'ready':'paused',drawing,undo:strokes.length,symmetry:Number($('symmetry').value),palette:$('palette').value,turns,time,diffusion:Number($('diffusion').value),particles:particles.length,errorPercent:error(),target,sample:particles.slice(0,3)});
  window.advanceTime=ms=>{manual=true;for(let t=0;t<ms/1000-1e-9;t+=DT)update(Math.min(DT,ms/1000-t));render();};
  function frame(now){if(!manual&&last!==null&&running){accumulator+=Math.min((now-last)/1000,.1);while(accumulator>=DT){update(DT);accumulator-=DT;}render();}last=now;requestAnimationFrame(frame);}preset('heart');requestAnimationFrame(frame);
})();
