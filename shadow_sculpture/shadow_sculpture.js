(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d'),lab=new ShadowSculpture('gate'),N=lab.n;
  let selected={x:4,y:0,z:5},tool='remove',yaw=-.65,pitch=.48,hintPoint=null,drag=null,layout=null,W=800,H=660,dpr=1;
  const message=text=>{$('message').textContent=text;};
  function statusMessage(){
    if(lab.mission==='free')return '자유 조각입니다. 블록을 더하고 두 방향의 그림자가 어떻게 달라지는지 보세요.';
    if(lab.solved)return '완성! 두 그림자를 그대로 남기고 최소 '+lab.minimum+'개 블록으로 조각했습니다.';
    if(!lab.matches)return '목표에서 빠진 그림자 '+lab.missing+'칸, 목표 밖 그림자 '+lab.extra+'칸입니다. 되돌리거나 블록을 더해 복구해 보세요.';
    return '두 그림자가 그대로입니다. 최소 목표까지 '+(lab.count-lab.minimum)+'개를 더 덜어 낼 수 있어요.';
  }
  function sync(){
    $('layer').value=selected.y+1;$('layer-value').textContent=(selected.y+1)+' / '+N;$('cell-x').value=selected.x+1;$('cell-z').value=selected.z+1;
    $('layer-down').disabled=$('mobile-down').disabled=selected.y===0;$('layer-up').disabled=$('mobile-up').disabled=selected.y===N-1;$('mobile-layer').textContent=(selected.y+1)+'층';
    const occupied=!!lab.get(selected.x,selected.y,selected.z),safe=lab.safeRemove(selected.x,selected.y,selected.z);
    $('selection-info').textContent='x '+(selected.x+1)+' · z '+(selected.z+1)+' · '+(selected.y+1)+'층 — '+(occupied?(lab.mission==='free'?'블록이 있어요':safe?'빼도 목표 그림자가 남아요':'빼면 그림자가 달라져요'):'빈 칸');
    $('remove').disabled=!occupied;$('add').disabled=occupied;$('undo').disabled=!lab.undoStack.length;$('hint').disabled=lab.mission==='free'||lab.solved;$('mobile-hint').disabled=$('hint').disabled;$('mobile-undo').disabled=$('undo').disabled;
    $('match-stat').textContent=lab.mission==='free'?'자유 조각':lab.accuracy.toFixed(0)+'%';$('match-detail').textContent=lab.mission==='free'?'두 투영을 자유롭게 만들기':lab.matches?'두 방향 모두 일치':'빠짐 '+lab.missing+' · 초과 '+lab.extra;
    $('blocks-stat').textContent=lab.count+'개';$('removed-stat').textContent=lab.mission==='free'?'현재 입체에 있는 블록':Math.max(0,lab.initialCount-lab.count)+'개 덜어 냄';$('goal-stat').textContent=lab.mission==='free'?'제한 없음':lab.minimum+'개';
    $('state-chip').textContent=lab.mission==='free'?'자유 조각':lab.solved?'최소 조각 완성':lab.matches?'그림자 유지 중':'그림자 복구하기';
    document.querySelectorAll('[data-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tool===tool)));
  }
  function setLayer(value){selected.y=Math.max(0,Math.min(N-1,value));hintPoint=null;render();}
  function change(value){if(lab.set(selected.x,selected.y,selected.z,value)){hintPoint=null;message(statusMessage());}render();}
  function applyTool(){if(tool!=='select')change(tool==='add');else render();}
  function load(){lab.load($('mission').value);selected=lab.hint(0)||{x:5,y:0,z:5};tool=lab.mission==='free'?'add':'remove';hintPoint=null;drag=null;message(lab.mission==='free'?statusMessage():'그림자는 이미 맞습니다. 안전한 블록을 찾아, 두 모습은 유지하며 조각을 가볍게 만들어 보세요.');render();}
  function resize(){
    W=Math.max(260,$('stage').clientWidth);const compact=W<600;
    if(compact){const s=(W-58)/2,g=W-64;layout={scene:{x:12,y:36,w:W-24,h:238},front:{x:20,y:319,s},side:{x:W/2+9,y:319,s},grid:{x:32,y:319+s+68,s:g}};H=layout.grid.y+g+40;}
    else{const g=Math.min(280,W*.35),s=Math.min(168,W*.25);layout={scene:{x:16,y:36,w:W*.57,h:346},grid:{x:W-g-24,y:67,s:g},front:{x:W*.27-s/2,y:446,s},side:{x:W*.75-s/2,y:446,s}};H=650;}
    dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);canvas.style.height=H+'px';render();
  }
  function text(value,x,y,size=12,color='#62706a',align='left'){ctx.font=size+'px '+getComputedStyle(document.body).fontFamily;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(value,x,y);}
  function drawVolume(){
    const r=layout.scene;ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();
    const scale=Math.min(r.w/(N*1.42),r.h/(N*1.2));let maxY=4;
    for(let i=0;i<lab.voxels.length;i++)if(lab.voxels[i])maxY=Math.max(maxY,lab.coordinates(i).y+1);
    const cy=maxY/2,co=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const project=point=>{const x=point[0]-N/2,y=point[1]-cy,z=point[2]-N/2,rx=x*co+z*si,rz=-x*si+z*co;return{x:r.x+r.w/2+rx*scale,y:r.y+r.h*.55-(y*cp-rz*sp)*scale,depth:y*sp+rz*cp};};
    ctx.strokeStyle='#dce4d7';ctx.lineWidth=1;for(let c=0;c<=N;c++){for(const line of [[[c,0,0],[c,0,N]],[[0,0,c],[N,0,c]]]){const a=project(line[0]),b=project(line[1]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
    const specs=[
      {normal:[1,0,0],delta:[1,0,0],points:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],color:'#63977a'},
      {normal:[-1,0,0],delta:[-1,0,0],points:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],color:'#53896c'},
      {normal:[0,1,0],delta:[0,1,0],points:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]],color:'#aac99b'},
      {normal:[0,-1,0],delta:[0,-1,0],points:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]],color:'#3c7358'},
      {normal:[0,0,1],delta:[0,0,1],points:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],color:'#39795b'},
      {normal:[0,0,-1],delta:[0,0,-1],points:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],color:'#4b8668'}
    ],faces=[];
    for(let i=0;i<lab.voxels.length;i++)if(lab.voxels[i]){const p=lab.coordinates(i);for(const f of specs){const [a,b,c]=f.normal;if(-a*si*cp+b*sp+c*co*cp<=0)continue;if(lab.get(p.x+f.delta[0],p.y+f.delta[1],p.z+f.delta[2]))continue;const points=f.points.map(v=>project([p.x+v[0],p.y+v[1],p.z+v[2]]));faces.push({points,depth:points.reduce((sum,q)=>sum+q.depth,0)/4,color:p.x===selected.x&&p.y===selected.y&&p.z===selected.z?'#c29259':f.color});}}
    faces.sort((a,b)=>a.depth-b.depth);for(const f of faces){ctx.beginPath();f.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=f.color;ctx.fill();ctx.strokeStyle='#24583c66';ctx.lineWidth=.65;ctx.stroke();}
    const corners=[];for(let y=0;y<2;y++)for(let z=0;z<2;z++)for(let x=0;x<2;x++)corners.push(project([selected.x+x,selected.y+y,selected.z+z]));
    ctx.strokeStyle='#b87b37';ctx.lineWidth=1.8;ctx.setLineDash([3,3]);for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit)){ctx.beginPath();ctx.moveTo(corners[i].x,corners[i].y);ctx.lineTo(corners[i|bit].x,corners[i|bit].y);ctx.stroke();}ctx.setLineDash([]);
    if(!lab.count)text('편집판에서 첫 블록을 놓아 보세요',r.x+r.w/2,r.y+r.h*.5,12,'#62706a','center');
    ctx.restore();text('하나의 입체 · 끌어서 둘러보기',r.x,23,12,'#192d29');
    text('노란 테두리: 선택한 블록 위치',r.x,r.y+r.h+15,11);
  }
  function drawShadow(panel,actual,target,title){
    const cell=panel.s/N;text(title,panel.x,panel.y-15,12,'#192d29');
    for(let screenY=0;screenY<N;screenY++)for(let c=0;c<N;c++){const index=(N-1-screenY)*N+c,on=actual[index]>0,wanted=target?.[index],x=panel.x+c*cell,y=panel.y+screenY*cell;
      ctx.fillStyle=on?(target&&!wanted?'#c76b64':'#397e61'):wanted?'#fff0d4':'#fff';ctx.fillRect(x,y,cell,cell);ctx.strokeStyle=wanted&&!on?'#bb8242':'#e1e7dc';ctx.lineWidth=wanted&&!on?1.5:.6;ctx.strokeRect(x+.2,y+.2,cell-.4,cell-.4);
    }
    text(target?'초록을 유지 · 빈 목표는 주황색':'현재 조각에서 계산한 그림자',panel.x,panel.y+panel.s+20,10);
  }
  function drawGrid(){
    const g=layout.grid,cell=g.s/N;text((selected.y+1)+'층 편집 · 위에서 본 모습',g.x,g.y-20,12,'#192d29');
    for(let z=0;z<N;z++)for(let x=0;x<N;x++){const px=g.x+x*cell,py=g.y+z*cell,on=lab.get(x,selected.y,z),allowed=!lab.targetFront||(lab.targetFront[selected.y*N+x]&&lab.targetSide[selected.y*N+z]);ctx.fillStyle=on?'#5d9475':'#fff';ctx.fillRect(px,py,cell,cell);ctx.strokeStyle='#dbe4d6';ctx.lineWidth=.6;ctx.strokeRect(px,py,cell,cell);if(!on&&allowed){ctx.beginPath();ctx.arc(px+cell/2,py+cell/2,1.4,0,Math.PI*2);ctx.fillStyle='#aebfa7';ctx.fill();}}
    ctx.strokeStyle='#b77730';ctx.lineWidth=2.5;ctx.strokeRect(g.x+selected.x*cell+1,g.y+selected.z*cell+1,cell-2,cell-2);
    if(hintPoint){ctx.beginPath();ctx.arc(g.x+(hintPoint.x+.5)*cell,g.y+(hintPoint.z+.5)*cell,3.2,0,Math.PI*2);ctx.fillStyle='#fff1bf';ctx.fill();}
    text('x →',g.x+g.s-26,g.y+g.s+20,11);text('z ↓',g.x-27,g.y+12,11);text('선택: x '+(selected.x+1)+' · z '+(selected.z+1),g.x,g.y+g.s+20,11);
  }
  function render(){if(!layout)return;sync();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#f5f6f1';ctx.fillRect(0,0,W,H);drawVolume();drawShadow(layout.front,lab.front,lab.targetFront,'정면 그림자 · 깊이 방향');drawShadow(layout.side,lab.side,lab.targetSide,'옆면 그림자 · 가로 방향');drawGrid();}
  function local(event){const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)*W/r.width,y:(event.clientY-r.top)*H/r.height};}
  function inRect(p,r){return p.x>=r.x&&p.y>=r.y&&p.x<r.x+(r.w||r.s)&&p.y<r.y+(r.h||r.s);}
  function gridAction(p){const g=layout.grid,x=Math.floor((p.x-g.x)/g.s*N),z=Math.floor((p.y-g.y)/g.s*N);if(x<0||z<0||x>=N||z>=N)return;if(drag&&drag.cell===x+','+z)return;selected.x=x;selected.z=z;if(drag)drag.cell=x+','+z;hintPoint=null;applyTool();}
  canvas.onpointerdown=event=>{if(event.button!==0)return;const p=local(event);canvas.focus();if(inRect(p,layout.grid)){drag={kind:'grid',cell:null};canvas.setPointerCapture(event.pointerId);gridAction(p);}else if(inRect(p,layout.scene)){drag={kind:'orbit',x:p.x,y:p.y};canvas.setPointerCapture(event.pointerId);}};
  canvas.onpointermove=event=>{if(!drag||!canvas.hasPointerCapture(event.pointerId))return;const p=local(event);if(drag.kind==='grid'){if(inRect(p,layout.grid))gridAction(p);}else{yaw+=(p.x-drag.x)*.012;pitch=Math.max(.15,Math.min(1.15,pitch-(p.y-drag.y)*.007));drag.x=p.x;drag.y=p.y;render();}};
  canvas.onpointerup=canvas.onpointercancel=event=>{if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);drag=null;};
  canvas.onkeydown=event=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(delta){event.preventDefault();selected.x=Math.max(0,Math.min(N-1,selected.x+delta[0]));selected.z=Math.max(0,Math.min(N-1,selected.z+delta[1]));hintPoint=null;render();}if(event.code==='Space'||event.key==='Enter'){event.preventDefault();applyTool();}if(event.key==='PageUp'||event.key==='PageDown'){event.preventDefault();setLayer(selected.y+(event.key==='PageUp'?1:-1));}if(event.key.toLowerCase()==='f')fullscreen();};
  $('mission').onchange=load;$('reset').onclick=load;$('undo').onclick=()=>{if(lab.undo()){hintPoint=null;message('마지막 블록 편집을 되돌렸습니다. '+statusMessage());render();}};
  $('hint').onclick=()=>{const found=lab.hint(selected.y);if(found){selected={...found};hintPoint={...found};tool='remove';message((found.y+1)+'층의 x '+(found.x+1)+', z '+(found.z+1)+' 블록입니다. ‘선택 블록 빼기’를 누르면 그림자가 유지됩니다.');}else message(lab.matches?'바로 뺄 블록이 없습니다. 다른 위치에 블록을 먼저 더한 뒤 겹치는 블록을 줄여 보세요. 되돌리기나 처음 조각으로 다시 도전해도 좋아요.':'먼저 빠진 그림자를 복구해 보세요. 되돌리기 또는 블록 더하기를 사용할 수 있습니다.');render();};
  for(const [mobile,original] of [['mobile-down','layer-down'],['mobile-up','layer-up'],['mobile-undo','undo'],['mobile-hint','hint']])$(mobile).onclick=()=>$(original).click();
  $('layer').oninput=event=>setLayer(Number(event.target.value)-1);$('layer-down').onclick=()=>setLayer(selected.y-1);$('layer-up').onclick=()=>setLayer(selected.y+1);
  for(const axis of ['x','z'])$('cell-'+axis).onchange=event=>{const value=Number(event.target.value);if(!Number.isInteger(value)||value<1||value>N){message('좌표는 1부터 12까지의 정수로 입력해 주세요.');sync();return;}selected[axis]=value-1;hintPoint=null;render();};
  $('remove').onclick=()=>change(false);$('add').onclick=()=>change(true);document.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>{tool=button.dataset.tool;render();});
  $('orbit-left').onclick=()=>{yaw-=Math.PI/6;render();};$('orbit-right').onclick=()=>{yaw+=Math.PI/6;render();};$('view-reset').onclick=()=>{yaw=-.65;pitch=.48;render();};
  async function fullscreen(){try{if(document.fullscreenElement){await document.exitFullscreen();}else if(typeof $('stage').requestFullscreen==='function'){await $('stage').requestFullscreen();}else message('이 브라우저는 전체화면을 지원하지 않습니다. 화면의 확대 기능을 사용해 주세요.');}catch{message('전체화면을 열지 못했습니다. 현재 화면에서 계속 조각할 수 있어요.');}}
  $('fullscreen').onclick=fullscreen;$('shadow-exit').onclick=fullscreen;document.addEventListener('fullscreenchange',()=>{$('shadow-exit').hidden=document.fullscreenElement!==$('stage');});$('save').onclick=()=>{const a=document.createElement('a');a.download='websim-shadow-sculpture.png';a.href=canvas.toDataURL('image/png');a.click();message('현재 조각과 두 그림자를 PNG로 저장했습니다.');};
  window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'12³ grid; x right, y up from bottom layer0, z depth; front OR over z, side OR over x; UI coordinates1..12',mission:lab.mission,blocks:lab.count,minimum:lab.minimum,initial:lab.initialCount,matches:lab.matches,solved:lab.solved,missing:lab.missing,extra:lab.extra,accuracy:lab.accuracy,selected:{...selected,occupied:!!lab.get(selected.x,selected.y,selected.z),safeToRemove:lab.safeRemove(selected.x,selected.y,selected.z)},tool,undo:lab.undoStack.length,yaw,pitch,front:Array.from(lab.front,v=>v?1:0),side:Array.from(lab.side,v=>v?1:0),layer:Array.from({length:N},(_,z)=>Array.from({length:N},(_,x)=>lab.get(x,selected.y,z)).join('')),layout});
  window.advanceTime=()=>render();new ResizeObserver(resize).observe($('stage'));resize();message('안전한 블록 찾기를 누르고 표시된 블록을 빼 보세요. 두 그림자는 남기고 '+lab.minimum+'개까지 줄이는 도전입니다.');
})();
