(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
  const lab=new EvolutionLab({seed:42,terrain:'rolling',mutation:.2,population:8});
  let running=false,auto=false,watch=-1,overview=false,editing=false,drawPoints=[],pointer=null,camera=0,manual=false,last=null,accumulator=0,strokes=[];
  const message=text=>{$('message').textContent=text;};
  const distance=v=>Math.max(0,v).toFixed(0)+' u';
  function validSeed(){const value=Number($('seed').value);if(!Number.isInteger(value)||value<1||value>999999){message('시드는 1부터 999999 사이의 정수로 입력해 주세요.');$('seed').focus();return null;}return value;}
  function reset(config={}){const seed=validSeed();if(seed===null)return;running=false;watch=-1;overview=false;editing=false;camera=0;lab.reset({seed,terrain:$('terrain').value,...config});lab.setMutation(Number($('mutation').value)/100);last=null;accumulator=0;message('새 실험을 준비했습니다. 경주 시작을 눌러 첫 세대를 관찰하세요.');render();}
  function next(){if(lab.nextGeneration()){watch=-1;camera=0;running=true;message(lab.generation+'세대 출발! 1번 차량은 이전 세대의 최고 개체입니다.');render();}}
  function update(dt){if(!running||editing)return;lab.step(dt);if(lab.complete){running=false;message(lab.generation+'세대 완료. '+lab.best.id+'번이 '+distance(lab.best.score)+'까지 갔습니다. 다음 세대로 이어가 보세요.');if(auto)next();}}
  function transform(){if(editing)return{sx:960/(lab.finishX+100),sy:1,tx:0,ty:0};if(overview){const z=960/(lab.finishX+240);return{sx:z,sy:z,tx:40,ty:290-360*z};}const vehicle=watch<0?lab.best:lab.vehicles[watch],zoom=Math.max(1,Math.min(2.8,760/Math.max(280,canvas.clientWidth))),x=vehicle?.body.position.x||lab.startX;camera=Math.max(-30,Math.min(lab.finishX-720/zoom,x-290/zoom));return{sx:zoom,sy:zoom,tx:-camera*zoom,ty:zoom>1?360-lab.groundAt(x)*zoom:0};}
  function render(){
    const view=transform(),X=x=>x*view.sx+view.tx,Y=y=>y*view.sy+view.ty;
    const sky=ctx.createLinearGradient(0,0,0,500);sky.addColorStop(0,'#eaf1ed');sky.addColorStop(1,'#faf5e9');ctx.fillStyle=sky;ctx.fillRect(0,0,960,500);
    ctx.strokeStyle='#e5eadf';ctx.lineWidth=1;
    for(let x=0;x<=lab.finishX;x+=200){const px=X(x);if(px<0||px>960)continue;ctx.beginPath();ctx.moveTo(px,40);ctx.lineTo(px,470);ctx.stroke();ctx.fillStyle='#7e8c7d';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(x+' u',px,478);}
    const terrain=editing?drawPoints:lab.terrainPoints;
    ctx.beginPath();ctx.moveTo(X(terrain[0].x),500);for(const p of terrain)ctx.lineTo(X(p.x),Y(p.y));ctx.lineTo(X(terrain[terrain.length-1].x),500);ctx.closePath();ctx.fillStyle='#e4ecdd';ctx.fill();
    ctx.beginPath();terrain.forEach((p,i)=>i?ctx.lineTo(X(p.x),Y(p.y)):ctx.moveTo(X(p.x),Y(p.y)));ctx.strokeStyle='#7d9a70';ctx.lineWidth=3;ctx.lineJoin='round';ctx.stroke();
    if(editing){ctx.fillStyle='#21654f';for(const p of drawPoints)if(p.x>=320){ctx.beginPath();ctx.arc(X(p.x),Y(p.y),2,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#62706a';ctx.textAlign='left';ctx.font='13px sans-serif';ctx.fillText('언덕을 그려 보세요 · 세로를 확대해서 보는 편집 화면',22,35);}
    else {
      const focused=watch<0?lab.best?.id:watch+1;
      const sorted=[...lab.vehicles].sort((a,b)=>(a.id===focused?1:0)-(b.id===focused?1:0));
      for(const vehicle of sorted){if(X(vehicle.body.position.x)<-150||X(vehicle.body.position.x)>1110)continue;ctx.globalAlpha=vehicle.id===focused?1:.24;

        for(const wheel of vehicle.wheels){const x=X(wheel.position.x),y=Y(wheel.position.y),r=wheel.circleRadius*view.sx;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle='#34453d';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,2*view.sx);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(wheel.angle)*r*.75,y+Math.sin(wheel.angle)*r*.75);ctx.strokeStyle='#c8d5c1';ctx.stroke();ctx.beginPath();ctx.arc(x,y,3*view.sx,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();}
        ctx.beginPath();vehicle.body.vertices.forEach((v,i)=>i?ctx.lineTo(X(v.x),Y(v.y)):ctx.moveTo(X(v.x),Y(v.y)));ctx.closePath();ctx.fillStyle=vehicle.color;ctx.fill();ctx.strokeStyle='#192d29';ctx.lineWidth=1.5;ctx.stroke();
        ctx.globalAlpha=1;if(vehicle.id===focused){const x=X(vehicle.body.position.x),y=Y(Math.min(...vehicle.body.vertices.map(v=>v.y)))-22;ctx.fillStyle=vehicle.color;ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(vehicle.id+'번 · '+distance(vehicle.score),x,y);}
      }
      const finish=X(lab.finishX);if(finish>=0&&finish<=960){const y=Y(lab.groundAt(lab.finishX));ctx.strokeStyle='#62706a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(finish,y);ctx.lineTo(finish,y-70);ctx.stroke();ctx.fillStyle='#21654f';ctx.fillRect(finish,y-70,28,17);ctx.font='12px sans-serif';ctx.fillText('도착',finish,y-82);}
      if(lab.time===0){ctx.fillStyle='#62706a';ctx.font='14px sans-serif';ctx.textAlign='left';ctx.fillText('같은 출발선의 8대 · 경주를 시작해 차이를 발견하세요',22,35);}
    }
    $('generation-stat').textContent=lab.generation+'세대';$('distance-stat').textContent=distance(lab.best?.score||0);$('time-stat').textContent=lab.time.toFixed(1)+' / '+lab.duration+' t';$('race-progress').value=lab.time;
    $('start').textContent=running?'일시정지':lab.complete?'경주 완료':lab.time>0?'계속 달리기':'경주 시작';$('start').disabled=editing||lab.complete;$('next').disabled=editing||!lab.complete;$('replay').disabled=editing;$('race-chip').textContent=editing?'코스 편집':lab.complete?'세대 평가 완료':running?'경주 중':lab.time>0?'일시정지':'경주 준비';
    $('leader').setAttribute('aria-pressed',String(watch<0&&!overview));$('overview').setAttribute('aria-pressed',String(overview));$('auto').setAttribute('aria-pressed',String(auto));$('auto').textContent='세대 자동 진행 '+(auto?'켜짐':'꺼짐');
    $('draw').hidden=editing;$('apply').hidden=$('cancel').hidden=$('undo-course').hidden=$('course-point-controls').hidden=!editing;$('edit-note').hidden=!editing;
    canvas.style.touchAction=editing?'none':'pan-y';$('undo-course').disabled=!strokes.length;
    const specimen=watch<0?lab.best:lab.vehicles[watch],gene=specimen.genome;
    $('genome-note').textContent=specimen.id+'번 설계 · 몸체 '+gene.width.toFixed(0)+' × '+gene.height.toFixed(0)+' u · 뒤/앞 바퀴 반지름 '+gene.rearRadius.toFixed(1)+' / '+gene.frontRadius.toFixed(1)+' u · 바퀴 간격 '+(gene.width*gene.wheelBase).toFixed(1)+' u';
    $('view-caption').textContent=editing?'코스를 그린 뒤 적용하세요 · 취소하면 경주로 돌아갑니다.':overview?'전체 코스 보기 · 차량 번호를 눌러 가까이 보기':watch<0?'선두 따라가기 · 아래 번호로 개별 차량 관찰':(watch+1)+'번 따라가기 · 선두 따라가기로 돌아갈 수 있어요';
    lab.vehicles.forEach((v,i)=>{const b=$('fleet').children[i];b.setAttribute('aria-pressed',String(watch===i&&!overview));b.querySelector('small').textContent=distance(v.score)+(v.finished?' · 도착':!v.alive?' · 멈춤':'');});
    const html=lab.history.length?lab.history.slice(-5).reverse().map(h=>'<li><span>'+h.generation+'세대</span><strong>'+distance(h.best)+'</strong></li>').join(''):'<li>첫 경주가 끝나면 기록됩니다.</li>';if($('history').innerHTML!==html)$('history').innerHTML=html;
  }
  for(let i=0;i<lab.population;i++){const b=document.createElement('button');b.innerHTML='<span>'+(i+1)+'번</span><small>0 u</small>';b.style.borderBottomColor=lab.vehicles[i].color;b.style.borderBottomWidth='3px';b.onclick=()=>{watch=i;overview=false;render();};$('fleet').append(b);}
  $('start').onclick=()=>{running=!running;last=null;message(running?'같은 시간 동안 달리며 가장 멀리 도달한 거리를 기록합니다.':'경주를 멈췄습니다. 번호를 눌러 각 차량의 모양을 살펴보세요.');render();};$('next').onclick=next;
  $('replay').onclick=()=>{lab.restartTrial();running=false;camera=0;message('같은 개체와 코스로 경주를 다시 준비했습니다. 경주 시작을 눌러 보세요.');render();};$('reset').onclick=()=>reset();$('terrain').onchange=()=>reset();$('new-seed').onclick=()=>reset();
  $('mutation').oninput=e=>{lab.setMutation(Number(e.target.value)/100);$('mutation-value').textContent=e.target.value+'%';};$('auto').onclick=()=>{auto=!auto;if(auto&&lab.complete&&!editing)next();else render();};$('leader').onclick=()=>{watch=-1;overview=false;render();};$('overview').onclick=()=>{overview=true;render();};
  $('draw').onclick=()=>{running=false;editing=true;pointer=null;strokes=[];drawPoints=[];for(let x=0;x<=lab.finishX;x+=40)drawPoints.push({x,y:lab.groundAt(x)});message('코스 위를 끌어 높낮이를 그리세요. 아래 위치와 높이로 한 점씩 바꿀 수도 있습니다.');render();};
  $('course-height').oninput=()=>{$('course-height-value').textContent=$('course-height').value+' u';};
  $('undo-course').onclick=()=>{if(strokes.length){drawPoints=strokes.pop();render();}};
  $('set-course-point').onclick=()=>{if(!editing)return;strokes.push(drawPoints.map(p=>({...p})));if(strokes.length>20)strokes.shift();const index=Math.round(Number($('course-x').value)/40);drawPoints[index].y=440-Number($('course-height').value);render();};
  $('cancel').onclick=()=>{editing=false;pointer=null;message('코스 편집을 취소했습니다. 이전 경주를 계속할 수 있습니다.');render();};
  $('apply').onclick=()=>{if(validSeed()===null)return;$('terrain').querySelector('[value="custom"]').disabled=false;$('terrain').value='custom';reset({terrain:'custom',points:drawPoints});};
  function paint(e){if(!editing)return;const rect=canvas.getBoundingClientRect(),p={x:(e.clientX-rect.left)/rect.width*(lab.finishX+100),y:Math.max(230,Math.min(440,(e.clientY-rect.top)/rect.height*500))};if(p.x<320)return;
    if(pointer){const low=Math.min(pointer.x,p.x),high=Math.max(pointer.x,p.x);for(const point of drawPoints)if(point.x>=320&&point.x>=low-20&&point.x<=high+20){const f=p.x===pointer.x?1:Math.max(0,Math.min(1,(point.x-pointer.x)/(p.x-pointer.x)));point.y=pointer.y+(p.y-pointer.y)*f;}}else {const index=Math.min(drawPoints.length-1,Math.round(p.x/40));drawPoints[index].y=p.y;}pointer=p;render();}
  canvas.onpointerdown=e=>{if(e.button!==0)return;canvas.focus({preventScroll:true});if(editing){strokes.push(drawPoints.map(p=>({...p})));if(strokes.length>20)strokes.shift();canvas.setPointerCapture(e.pointerId);pointer=null;paint(e);}};canvas.onpointermove=e=>{if(canvas.hasPointerCapture(e.pointerId))paint(e);};canvas.onpointerup=canvas.onpointercancel=e=>{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);pointer=null;};
  const fullscreen=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen?.();}else if(typeof $('stage').requestFullscreen==='function'){await $('stage').requestFullscreen();}else{message('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}}catch{message('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}};$('fullscreen').onclick=fullscreen;
  canvas.onkeydown=e=>{if(e.code==='Space'&&!editing){e.preventDefault();if(!$('start').disabled)$('start').click();}if(e.key.toLowerCase()==='f')fullscreen();};
  window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'world units u; origin at left, x right, y down; start x140, finish x2600',generation:lab.generation,time:lab.time,duration:lab.duration,complete:lab.complete,running,auto,terrain:lab.terrain,seed:lab.seed,mutation:lab.mutation,editing,undo:strokes.length,watch,overview,history:lab.history.slice(-5),vehicles:lab.vehicles.map(v=>({id:v.id,x:v.body.position.x,y:v.body.position.y,score:v.score,alive:v.alive,finished:v.finished,genome:v.genome})),terrainPoints:editing?drawPoints:undefined});
  window.advanceTime=ms=>{manual=true;const ticks=Math.round(ms/1000*120*Number($('speed').value));for(let i=0;i<ticks;i++)update(1/120);render();};
  function frame(now){if(!manual&&last!==null){accumulator+=Math.min(.1,(now-last)/1000)*Number($('speed').value);while(accumulator>=1/120){update(1/120);accumulator-=1/120;}render();}last=now;requestAnimationFrame(frame);}render();requestAnimationFrame(frame);
})();
