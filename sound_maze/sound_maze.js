(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
  const NX=120,NY=80,SCALE=7,field=new WaveField(),raster=document.createElement('canvas');raster.width=NX;raster.height=NY;
  const rctx=raster.getContext('2d'),pixels=rctx.createImageData(NX,NY);
  let objects=[],walls=new Uint8Array(NX*NY),tool='move',selected=0,running=true,enabledB=true,manual=false,last=null,accumulator=0,pointer=null;
  let audio=null,osc=null,gain=null,listening=false,goalState='',audioRatio=1;
  const message=text=>{$('message').textContent=text;};
  const markerScale=()=>Math.max(1,Math.min(2.2,640/Math.max(280,canvas.clientWidth)));
  function rebuild(){if(osc)osc.frequency.setTargetAtTime(660*24/Number($('wavelength').value),audio.currentTime,.1);field.reset({sources:objects.slice(0,2),target:objects[2],phase:Number($('phase').value),wavelength:Number($('wavelength').value),enabledB,walls});goalState='';audioRatio=0;message(running?'새 조건의 파동을 계산하고 있습니다. 측정이 준비되면 상대 진폭을 확인하세요.':'파동이 멈춰 있습니다. 계속 보기를 눌러 새 조건을 측정하세요.');render();}
  function syncPosition(){const p=objects[selected];$('pos-x').value=p.x;$('pos-y').value=p.y;$('x-value').textContent=p.x;$('y-value').textContent=p.y;$('selected').value=selected;}
  function preset(name){
    objects=[{x:25,y:25},{x:25,y:55},{x:91,y:40}];walls.fill(0);enabledB=true;
    $('phase').value=0;$('phase-value').textContent='0°';$('wavelength').value=24;$('wavelength-value').textContent='24칸';
    if(name==='wall')for(let y=7;y<74;y++)if(y<34||y>46)for(let x=57;x<60;x++)walls[y*NX+x]=1;
    if(name==='offset'){objects[0]={x:23,y:18};objects[1]={x:24,y:59};objects[2]={x:94,y:24};}
    selected=0;running=true;setTool('move');syncPosition();rebuild();
    message(name==='offset'?'두 음원과 목표점의 거리가 다릅니다. 위상과 위치를 조금씩 바꿔 25% 이하를 찾아보세요.':name==='wall'?'벽의 틈으로 파동이 퍼집니다. 벽 너머 목표점을 조용하게 만들어 보세요.':'B의 위상을 조절해 목표점 진폭을 A만 켰을 때의 25% 이하로 줄여 보세요.');
  }
  function canPlace(x,y,index){return x>=5&&x<NX-5&&y>=5&&y<NY-5&&!walls[y*NX+x]&&!objects.some((p,i)=>i!==index&&Math.hypot(p.x-x,p.y-y)<4);}
  function place(x,y){x=Math.round(x);y=Math.round(y);if(!canPlace(x,y,selected)){message('벽과 다른 표시를 피해 안쪽의 빈 공간에 놓아 주세요.');syncPosition();return;}objects[selected]={x,y};syncPosition();rebuild();}
  function setTool(value){tool=value;document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===value)));canvas.style.cursor=value==='move'?'grab':'crosshair';}
  function editWall(x,y){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<3||xx>=NX-3||yy<3||yy>=NY-3)continue;if(objects.some(p=>Math.hypot(p.x-xx,p.y-yy)<4))continue;walls[yy*NX+xx]=tool==='wall'?1:0;}}
  function position(e){const rect=canvas.getBoundingClientRect();return{x:Math.round((e.clientX-rect.left)/rect.width*NX),y:Math.round((e.clientY-rect.top)/rect.height*NY)};}
  function paint(e){const p=position(e);if(tool==='move'){place(p.x,p.y);}else{if(pointer){const n=Math.max(Math.abs(p.x-pointer.x),Math.abs(p.y-pointer.y));for(let i=0;i<=n;i++){const t=n?i/n:0;editWall(Math.round(pointer.x+(p.x-pointer.x)*t),Math.round(pointer.y+(p.y-pointer.y)*t));}}else editWall(p.x,p.y);rebuild();}pointer=p;}
  canvas.onpointerdown=e=>{if(e.button!==0)return;canvas.focus();canvas.setPointerCapture(e.pointerId);pointer=null;if(tool==='move'){const p=position(e),hit=objects.findIndex(v=>Math.hypot(v.x-p.x,v.y-p.y)<5*markerScale());if(hit>=0)selected=hit;}paint(e);};
  canvas.onpointermove=e=>{if(canvas.hasPointerCapture(e.pointerId))paint(e);};canvas.onpointerup=canvas.onpointercancel=e=>{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);pointer=null;};
  function render(){
    const a=field.a,b=field.b;
    for(let i=0;i<NX*NY;i++){const j=i*4;if(walls[i]){pixels.data[j]=49;pixels.data[j+1]=70;pixels.data[j+2]=60;}else{const v=Math.tanh((a[i]+b[i])*3.5),t=Math.abs(v),col=v>0?[48,119,94]:[193,114,94];pixels.data[j]=245+(col[0]-245)*t;pixels.data[j+1]=247+(col[1]-247)*t;pixels.data[j+2]=240+(col[2]-240)*t;}pixels.data[j+3]=255;}
    rctx.putImageData(pixels,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(raster,0,0,840,560);
    ctx.strokeStyle='#dce2d766';ctx.lineWidth=1;for(let x=0;x<NX;x+=10){ctx.beginPath();ctx.moveTo(x*SCALE,0);ctx.lineTo(x*SCALE,560);ctx.stroke();}for(let y=0;y<NY;y+=10){ctx.beginPath();ctx.moveTo(0,y*SCALE);ctx.lineTo(840,y*SCALE);ctx.stroke();}
    objects.forEach((p,i)=>{const m=markerScale(),x=p.x*SCALE+3.5,y=p.y*SCALE+3.5;ctx.beginPath();ctx.arc(x,y,18*m,0,Math.PI*2);ctx.fillStyle=i===2?'#fff':i===0?'#21654f':enabledB?'#b06c54':'#89958c';ctx.fill();ctx.strokeStyle=i===2?'#a26739':'#fff';ctx.lineWidth=3;ctx.stroke();if(i===selected){ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(x,y,25*m,0,Math.PI*2);ctx.strokeStyle='#192d29';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);}ctx.font='bold '+16*m+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=i===2?'#a26739':'#fff';ctx.fillText(i===0?'A':i===1?'B':'◎',x,y);ctx.font=12*m+'px sans-serif';ctx.fillStyle='#192d29';ctx.fillText(i===2?'목표점':i===1&&!enabledB?'꺼짐':'음원 '+(i===0?'A':'B'),x,y-34*m);});
    const s=field.sample(),ready=s.settled,ratio=s.ratio;audioRatio=ready?Math.min(3,ratio):0;
    $('ratio-stat').textContent=ready?(ratio*100).toFixed(0)+'%':'측정 중';$('db-stat').textContent=ready?(ratio<=.001?'≤ −60':(20*Math.log10(ratio)).toFixed(1))+' dB':'—';
    const status=!ready?'측정 중':ratio<=.25?'목표 달성':'조절해 보세요';$('goal-chip').textContent=status;$('settle-stat').textContent=ready?(ratio<=.25?'조용한 자리를 찾았어요':'위상이나 위치를 바꿔 보세요'):'파동이 안정되는 중';
    if(status==='목표 달성'&&goalState!==status)message('목표 달성! 목표점의 진폭이 25% 이하입니다. B를 꺼서 A만 있을 때와 비교해 보세요.');goalState=status;
    $('pause').textContent=running?'일시정지':'계속 보기';$('toggle-b').textContent=enabledB?'음원 B 켜짐':'음원 B 꺼짐';$('toggle-b').setAttribute('aria-pressed',String(enabledB));
    if(gain&&audio)gain.gain.setTargetAtTime(listening&&running?audioRatio*.025:0,audio.currentTime,.05);
  }
  function update(){if(running)field.step(12);}
  $('pause').onclick=()=>{running=!running;last=null;render();};$('reset-wave').onclick=()=>{rebuild();message('배치는 유지하고 파동을 처음부터 다시 계산합니다.');};$('reset').onclick=()=>preset($('preset').value);$('preset').onchange=e=>preset(e.target.value);
  function phase(value){$('phase').value=value;$('phase-value').textContent=value+'°';rebuild();} $('phase').oninput=e=>phase(e.target.value);$('phase-zero').onclick=()=>phase(0);$('phase-opposite').onclick=()=>phase(180);
  $('wavelength').oninput=e=>{$('wavelength-value').textContent=e.target.value+'칸';if(osc)osc.frequency.setTargetAtTime(660*24/Number(e.target.value),audio.currentTime,.1);rebuild();};
  $('toggle-b').onclick=()=>{enabledB=!enabledB;rebuild();};$('selected').onchange=e=>{selected=Number(e.target.value);syncPosition();render();};
  $('pos-x').oninput=e=>place(Number(e.target.value),objects[selected].y);$('pos-y').oninput=e=>place(objects[selected].x,Number(e.target.value));
  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const [x,y]=b.dataset.move.split(',').map(Number);place(objects[selected].x+x,objects[selected].y+y);});
  $('clear-walls').onclick=()=>{walls.fill(0);rebuild();message('벽을 모두 지웠습니다. 같은 위치에서 파동의 변화를 비교해 보세요.');};
  const fullscreen=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen?.();}else if(typeof $('stage').requestFullscreen==='function'){await $('stage').requestFullscreen();}else{message('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}}catch{message('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}};$('fullscreen').onclick=fullscreen;
  canvas.onkeydown=e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(delta){e.preventDefault();place(objects[selected].x+delta[0],objects[selected].y+delta[1]);}if(e.code==='Space'){e.preventDefault();$('pause').click();}if(e.key.toLowerCase()==='f')fullscreen();};
  function mute(){listening=false;if(gain)gain.gain.setTargetAtTime(0,audio.currentTime,.02);$('listen').textContent='소리 듣기';$('listen').setAttribute('aria-pressed','false');}
  $('listen').onclick=async()=>{if(listening){mute();return;}try{if(!audio){const AC=window.AudioContext||window.webkitAudioContext;audio=new AC();osc=audio.createOscillator();gain=audio.createGain();gain.gain.value=0;osc.frequency.value=660*24/Number($('wavelength').value);osc.connect(gain).connect(audio.destination);osc.start();}await audio.resume();listening=true;$('listen').textContent='소리 끄기';$('listen').setAttribute('aria-pressed','true');message('목표점 진폭을 소리 크기로 들려줍니다. 음높이는 들을 수 있는 범위로 변환한 보조 음입니다.');render();}catch{mute();message('이 브라우저에서는 소리를 재생할 수 없습니다. 화면의 상대 진폭으로 비교해 주세요.');}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)mute();});addEventListener('pagehide',()=>{mute();audio?.close();});
  window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'120×80 grid; top-left origin, x right, y down',running,objects,selected,tool,phase:Number($('phase').value),wavelength:Number($('wavelength').value),enabledB,wallCells:walls.reduce((s,v)=>s+v,0),ticks:field.ticks,measurement:field.sample(),listening});
  window.advanceTime=ms=>{manual=true;for(let i=0;i<Math.round(ms*60/1000);i++)update();render();};
  function frame(now){if(!manual&&last!==null){accumulator+=Math.min(.1,(now-last)/1000);while(accumulator>=1/60){update();accumulator-=1/60;}render();}last=now;requestAnimationFrame(frame);}preset('center');requestAnimationFrame(frame);
})();
