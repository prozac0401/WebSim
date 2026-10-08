(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
  const lab=new EvolutionLab({seed:42,terrain:'rolling',mutation:.2,population:8});
  let running=false,auto=false,watch=-1,overview=false,editing=false,drawPoints=[],pointer=null,camera=0,manual=false,last=null,accumulator=0,strokes=[];
  const message=text=>{$('message').textContent=text;};
  const distance=v=>Math.max(0,v).toFixed(0)+' u';
  const experimentHelp={evolution:'차체·바퀴·동력장치·구동방식이 서로 다른 8대로 시작합니다.',power:'같은 사륜구동 차체에서 1→8번 순으로 모터가 강하고 무거워집니다. 다음 세대부터 모든 설계 특성이 진화합니다.',balance:'같은 사륜구동·출력·질량으로 1→8번 순서대로 동력장치를 뒤에서 앞으로 옮깁니다. 다음 세대부터 모든 특성이 진화합니다.',drive:'같은 차체·출력·질량·무게배분으로 전륜·후륜·사륜을 비교합니다. 전체 토크와 출력은 같으며 다음 세대부터 모든 특성이 진화합니다.'};
  let engineering=false;
  function paintCar(target,vehicle,live=false){VehicleRenderer.drawVehicle(target,vehicle,{live,engineering});}
  function drawThumbnail(target,vehicle){VehicleRenderer.drawThumbnail(target,vehicle,{width:200,height:96});}
  const surfaceNames={asphalt:'포장도로',snow:'눈길',gravel:'자갈길',sand:'모래길',mixed:'복합 노면'};
  const surfaceHints={asphalt:'높은 접지력과 작은 주행 저항. 기본 성능을 비교하기 좋습니다.',snow:'접지력이 낮아 구동 바퀴가 쉽게 헛돕니다. 하중과 구동방식을 비교하세요.',gravel:'느슨한 자갈은 접지력을 낮추고 주행 저항을 키웁니다.',sand:'모래는 접지력이 낮고 주행 저항이 큽니다. 모터 출력과 무게의 균형을 살펴보세요.',mixed:'포장 → 자갈 → 눈 → 모래. 각 구간에서 속도와 바퀴 헛돎을 관찰하세요.'};
  const roadPaint={asphalt:{top:'#414a50',base:'#d6d0c3',edge:'#87939b',grain:'#aeb8ba'},snow:{top:'#eff8fa',base:'#d7e5e8',edge:'#9bbecb',grain:'#b4d3de'},gravel:{top:'#888b82',base:'#d8d7cb',edge:'#5e675d',grain:'#d9d8c9'},sand:{top:'#dfbf83',base:'#eddbb5',edge:'#b99354',grain:'#b28d53'}};
  function materialAt(x){return lab.surfaceAt?lab.surfaceAt(x).id:(lab.surface||'asphalt');}
  function drawRoad(terrain,X,Y,view){
    // Material boundaries stay at the same coordinates used by the tire solver.
    const cuts=(lab.surfaceSegments||[]).slice(1).map(segment=>segment.start);
    if(cuts.length)terrain=terrain.flatMap((a,i)=>{const b=terrain[i+1];return b?[a,...cuts.filter(x=>x>a.x&&x<b.x).map(x=>({x,y:a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x)}))]:[a];});
    ctx.beginPath();ctx.moveTo(X(terrain[0].x),500);for(const p of terrain)ctx.lineTo(X(p.x),Y(p.y));ctx.lineTo(X(terrain[terrain.length-1].x),500);ctx.closePath();ctx.save();ctx.clip();
    for(let i=1;i<terrain.length;i++){
      const a=terrain[i-1],b=terrain[i],id=materialAt((a.x+b.x)/2),paint=roadPaint[id],left=X(a.x),right=X(b.x);
      if(right<0||left>960)continue;
      ctx.fillStyle=paint.base;ctx.fillRect(left-1,0,right-left+2,500);
      const band=ctx.createLinearGradient(0,Math.min(Y(a.y),Y(b.y)),0,500);band.addColorStop(0,'#ffffff00');band.addColorStop(1,'#5f503c18');ctx.fillStyle=band;ctx.fillRect(left-1,0,right-left+2,500);
    }
    // Paint the complete ground first so adjoining fills cannot cut seams into the road.
    for(let i=1;i<terrain.length;i++){
      const a=terrain[i-1],b=terrain[i],id=materialAt((a.x+b.x)/2),paint=roadPaint[id],left=X(a.x),right=X(b.x);
      if(right<0||left>960)continue;
      ctx.beginPath();ctx.moveTo(left-.6,Y(a.y));ctx.lineTo(right+.6,Y(b.y));ctx.lineTo(right+.6,Y(b.y)+Math.max(12,view.sy*9));ctx.lineTo(left-.6,Y(a.y)+Math.max(12,view.sy*9));ctx.closePath();ctx.fillStyle=paint.top;ctx.fill();
      ctx.beginPath();ctx.moveTo(left,Y(a.y)+1);ctx.lineTo(right,Y(b.y)+1);ctx.strokeStyle=paint.edge;ctx.lineWidth=id==='snow'?2.5:1.3;ctx.stroke();
      for(let x=Math.ceil(a.x/7)*7;x<b.x;x+=7){
        const f=(x-a.x)/(b.x-a.x),y=a.y+(b.y-a.y)*f,hash=Math.abs(Math.sin(x*19.31)*4337)%1,px=X(x),py=Y(y)+3+hash*6*view.sy;
        ctx.fillStyle=paint.grain;
        if(id==='gravel'){ctx.beginPath();ctx.ellipse(px,py,(1+hash)*Math.max(.65,view.sx),(.65+hash*.5)*Math.max(.65,view.sy),hash*2,0,Math.PI*2);ctx.fill();}
        else if(id==='sand'){ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+view.sx*3,py+.5);ctx.strokeStyle=paint.grain;ctx.lineWidth=.7;ctx.stroke();}
        else {ctx.globalAlpha=id==='snow'?.7:.45;ctx.fillRect(px,py,Math.max(.6,view.sx*.55),Math.max(.6,view.sy*.55));ctx.globalAlpha=1;}
      }
    }
    ctx.restore();
    if(!editing){
      ctx.fillStyle='#7b827b';ctx.font='11px sans-serif';ctx.textAlign='left';
      if(lab.surface==='mixed'){for(const seg of lab.surfaceSegments||[]){const start=seg.start??seg.from??seg.x??0,px=X(start);if(px>10&&px<850)ctx.fillText(surfaceNames[seg.surface?.id||seg.surface||seg.id]||'',px+8,Y(lab.groundAt(start))+34);}}
      else ctx.fillText(surfaceNames[lab.surface||'asphalt'],24,443);
    }
  }
  function validSeed(){const value=Number($('seed').value);if(!Number.isInteger(value)||value<1||value>999999){message('시드는 1부터 999999 사이의 정수로 입력해 주세요.');$('seed').focus();return null;}return value;}
  function reset(config={}){const seed=validSeed();if(seed===null)return;running=false;watch=-1;overview=false;editing=false;camera=0;lab.reset({seed,terrain:$('terrain').value,surface:$('surface').value,initialExperiment:$('initial-experiment').value,...config});lab.setMutation(Number($('mutation').value)/100);last=null;accumulator=0;const clues={valley:'골짜기에서 얻은 속도로 긴 오르막을 넘을 수 있을까요?',dunes:'세 언덕에서 바퀴 크기와 차체 높이의 장단점을 비교하세요.',ripple:'작은 요철이 반복됩니다. 바퀴 크기와 차체의 흔들림을 관찰하세요.'};message((lab.initialExperiment==='evolution'?(clues[lab.terrain]||'새 실험을 준비했습니다.'):experimentHelp[lab.initialExperiment])+' 경주 시작을 눌러 첫 세대를 관찰하세요.');render();}
  function next(){if(lab.nextGeneration()){watch=-1;camera=0;running=true;message(lab.generation+'세대 출발! 1번 차량은 이전 세대의 최고 개체입니다.');render();}}
  function update(dt){if(!running||editing)return;lab.step(dt);if(lab.complete){running=false;const count=lab.vehicles.filter(v=>v.finished).length;message(lab.generation+'세대 완료 · '+count+'/'+lab.population+'대 완주. '+(count?lab.best.id+'번이 '+lab.best.finishTime.toFixed(2)+' t로 가장 먼저 도착했습니다.':lab.best.id+'번이 '+distance(lab.best.score)+'까지 갔습니다.')+' 다음 세대로 이어가 보세요.');if(auto)next();}}
  function transform(){if(editing)return{sx:960/(lab.finishX+100),sy:1,tx:0,ty:0};if(overview){const z=960/(lab.finishX+240);return{sx:z,sy:z,tx:40,ty:290-360*z};}const vehicle=watch<0?lab.best:lab.vehicles[watch],zoom=Math.max(1.85,Math.min(2.8,900/Math.max(280,canvas.clientWidth))),x=vehicle?.body.position.x||lab.startX;camera=Math.max(-30,Math.min(lab.finishX-720/zoom,x-290/zoom));return{sx:zoom,sy:zoom,tx:-camera*zoom,ty:zoom>1?360-lab.groundAt(x)*zoom:0};}
  function render(){
    const view=transform(),X=x=>x*view.sx+view.tx,Y=y=>y*view.sy+view.ty;
    const sky=ctx.createLinearGradient(0,0,0,500);sky.addColorStop(0,'#eaf1ed');sky.addColorStop(1,'#faf5e9');ctx.fillStyle=sky;ctx.fillRect(0,0,960,500);
    ctx.strokeStyle='#e5eadf';ctx.lineWidth=1;
    for(let x=0;x<=lab.finishX;x+=200){const px=X(x);if(px<0||px>960)continue;ctx.beginPath();ctx.moveTo(px,40);ctx.lineTo(px,470);ctx.stroke();ctx.fillStyle='#7e8c7d';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(x+' u',px,478);}
    const terrain=editing?drawPoints:lab.terrainPoints;
    drawRoad(terrain,X,Y,view);
    if(editing){ctx.fillStyle='#21654f';for(const p of drawPoints)if(p.x>=320){ctx.beginPath();ctx.arc(X(p.x),Y(p.y),2,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#62706a';ctx.textAlign='left';ctx.font='13px sans-serif';ctx.fillText('언덕을 그려 보세요 · 세로를 확대해서 보는 편집 화면',22,35);}
    else {
      const focused=watch<0?lab.best?.id:watch+1;
      const sorted=[...lab.vehicles].sort((a,b)=>(a.id===focused?1:0)-(b.id===focused?1:0));
      for(const vehicle of sorted){if(lab.time===0&&vehicle.id!==focused)continue;if(X(vehicle.body.position.x)<-150||X(vehicle.body.position.x)>1110)continue;ctx.globalAlpha=vehicle.id===focused?1:.24;

        ctx.save();ctx.translate(X(vehicle.body.position.x),Y(vehicle.body.position.y));ctx.scale(view.sx,view.sy);ctx.rotate(vehicle.body.angle);paintCar(ctx,vehicle,true,vehicle.id===focused);ctx.restore();
        ctx.globalAlpha=1;if(vehicle.id===focused){const x=X(vehicle.body.position.x),y=Y(Math.min(...vehicle.body.vertices.map(v=>v.y)))-22;ctx.fillStyle=vehicle.color;ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(vehicle.id+'번 · '+distance(vehicle.score),x,y);}
      }
      const finish=X(lab.finishX);if(finish>=0&&finish<=960){const y=Y(lab.groundAt(lab.finishX));ctx.strokeStyle='#62706a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(finish,y);ctx.lineTo(finish,y-70);ctx.stroke();ctx.fillStyle='#21654f';ctx.fillRect(finish,y-70,28,17);ctx.font='12px sans-serif';ctx.fillText('도착',finish,y-82);}
      if(lab.time===0){ctx.fillStyle='#62706a';ctx.font='14px sans-serif';ctx.textAlign='left';ctx.fillText('같은 출발선의 8대 · 경주를 시작해 차이를 발견하세요',22,35);}
    }
    $('generation-stat').textContent=lab.generation+'세대';$('distance-stat').textContent=distance(lab.best?.score||0);$('time-stat').textContent=lab.time.toFixed(1)+' / '+lab.duration+' t';$('race-progress').value=lab.time;$('race-progress').max=lab.duration;$('duration-help').textContent='최대 '+lab.duration+' t · 완주 후에는 도착 시간으로 순위를 정합니다.';
    $('start').textContent=running?'일시정지':lab.complete?'경주 완료':lab.time>0?'계속 달리기':'경주 시작';$('start').disabled=editing||lab.complete;$('next').disabled=editing||!lab.complete;$('replay').disabled=editing;$('race-chip').textContent=editing?'코스 편집':lab.complete?'세대 평가 완료':running?'경주 중':lab.time>0?'일시정지':'경주 준비';
    $('leader').setAttribute('aria-pressed',String(watch<0&&!overview));$('overview').setAttribute('aria-pressed',String(overview));$('auto').setAttribute('aria-pressed',String(auto));$('auto').textContent='세대 자동 진행 '+(auto?'켜짐':'꺼짐');
    $('draw').hidden=editing;$('apply').hidden=$('cancel').hidden=$('undo-course').hidden=$('course-point-controls').hidden=!editing;$('edit-note').hidden=!editing;
    canvas.style.touchAction=editing?'none':'pan-y';$('undo-course').disabled=!strokes.length;
    const specimen=watch<0?lab.best:lab.vehicles[watch],gene=specimen.genome,design=specimen.design;
    $('genome-note').textContent=specimen.id+'번 '+design.styleLabel+' · '+design.driveLabel+' · 몸체 '+gene.width.toFixed(0)+' × '+gene.height.toFixed(0)+' u · 뒤/앞 바퀴 '+gene.rearRadius.toFixed(1)+' / '+gene.frontRadius.toFixed(1)+' u';
    $('design-title').textContent=specimen.id+'번 설계';$('design-style').textContent=design.styleLabel;
    $('power-stat').textContent=(design.peakPower*10000).toFixed(1);$('mass-stat').textContent=design.totalMass.toFixed(1);
    $('specific-power-stat').textContent=(design.powerToWeight*10000).toFixed(1);$('engine-mass-stat').textContent=design.powertrainMass.toFixed(1);
    $('drive-stat').textContent=design.driveLabel;const [rearShare,frontShare]=design.driveShares;
    $('drive-help').textContent='토크 배분 · 앞 '+Math.round(frontShare*100)+'% / 뒤 '+Math.round(rearShare*100)+'%';
    const tipped=design.frontLoad<0||design.rearLoad<0;
    $('balance-stat').textContent=tipped?(design.frontLoad<0?'뒤쪽':'앞쪽')+'으로 기울어짐':'앞 '+Math.round(design.frontLoad*100)+'% / 뒤 '+Math.round(design.rearLoad*100)+'%';
    $('rear-load-bar').style.width=Math.max(0,Math.min(1,design.rearLoad))*100+'%';$('front-load-bar').style.width=Math.max(0,Math.min(1,design.frontLoad))*100+'%';
    $('balance-help').textContent=tipped?'무게중심이 차축 바깥입니다. 수평으로 정지하기 어려운 설계입니다. 수치는 모형의 상대 단위입니다.':'수치는 모형의 상대 단위이며, 무게배분은 수평 정지 상태의 기준입니다. 강한 모터는 더 무겁고, 장치 위치는 앞뒤 균형을 바꿉니다.';
    $('experiment-help').textContent=experimentHelp[lab.initialExperiment];
    const telemetry=specimen.telemetry||{},slip=telemetry.slip||[0,0],contact=telemetry.contact||[false,false],loads=telemetry.load||[0,0];
    $('velocity-stat').textContent=(telemetry.speed||0).toFixed(1)+' u/t';
    $('slip-stat').textContent='앞 '+Math.round(Math.abs(slip[1]||0)*100)+'% · 뒤 '+Math.round(Math.abs(slip[0]||0)*100)+'%';
    $('surface-stat').textContent=surfaceNames[typeof telemetry.surface==='string'?telemetry.surface:telemetry.surface?.id]||surfaceNames[materialAt(specimen.body.position.x)];
    $('contact-stat').textContent=specimen.finished?'완주':lab.time===0?'출발 준비':contact.every(Boolean)?'앞뒤 접지':contact[0]?'뒤 바퀴 접지':contact[1]?'앞 바퀴 접지':'공중';
    const totalLoad=loads.reduce((sum,v)=>sum+v,0);
    $('dynamic-balance-stat').textContent=lab.time===0?'출발하면 접지 상태와 추정 앞뒤 하중을 보여 줍니다.':totalLoad>0?'추정 접지 하중 · 앞 '+Math.round(loads[1]/totalLoad*100)+'% / 뒤 '+Math.round(loads[0]/totalLoad*100)+'% · 가속과 경사에 따라 달라집니다.':'접지 하중 없음 · 바퀴가 지면에서 떨어져 있습니다.';
    $('surface-help').textContent=surfaceHints[lab.surface||'asphalt'];
    const ids=lab.surface==='mixed'?['asphalt','gravel','snow','sand']:[lab.surface||'asphalt'];
    const legend=ids.map(id=>'<span><i style="background:'+roadPaint[id].top+';border-color:'+roadPaint[id].edge+'"></i>'+surfaceNames[id]+'</span>').join('<b aria-hidden="true">→</b>');
    if($('road-legend').innerHTML!==legend)$('road-legend').innerHTML=legend;
    $('engineering').setAttribute('aria-pressed',String(engineering));$('engineering').textContent='물리 표시 '+(engineering?'켜짐':'꺼짐');
    const previewKey=JSON.stringify(specimen.genome)+engineering;
    if($('design-preview').dataset.design!==previewKey){VehicleRenderer.drawThumbnail($('design-preview').getContext('2d'),specimen,{width:640,height:230,engineering});$('design-preview').dataset.design=previewKey;}
    $('race-results').hidden=!lab.complete;$('finished-stat').textContent=lab.vehicles.filter(v=>v.finished).length+' / '+lab.population+'대 완주';
    if(lab.complete){
      const ranked=[...lab.vehicles].sort((a,b)=>Number(b.finished)-Number(a.finished)||(a.finished?a.finishTime-b.finishTime:b.score-a.score));
      const rows=ranked.map((v,i)=>'<tr><th scope="row">'+(i+1)+'. '+v.id+'번 '+v.design.styleLabel+'</th><td>'+v.design.driveLabel+'</td><td>'+Math.round(v.design.frontLoad*100)+'%</td><td>'+(v.finished?'<strong>'+v.finishTime.toFixed(2)+' t</strong>':distance(v.score)+'<small>'+({stalled:'정체',overturned:'전복',timeout:'시간 종료',invalid:'주행 불가'}[v.stopReason]||'미완주')+'</small>')+'</td></tr>').join('');
      if($('results-body').innerHTML!==rows)$('results-body').innerHTML=rows;
    }
    $('view-caption').textContent=editing?'코스를 그린 뒤 적용하세요 · 취소하면 경주로 돌아갑니다.':overview?'전체 코스 보기 · 차량 번호를 눌러 가까이 보기':watch<0?'선두 따라가기 · 아래 번호로 개별 차량 관찰':(watch+1)+'번 따라가기 · 선두 따라가기로 돌아갈 수 있어요';
    lab.vehicles.forEach((v,i)=>{const b=$('fleet').children[i];b.setAttribute('aria-pressed',String(watch===i&&!overview));b.setAttribute('aria-label',v.id+'번 '+v.design.styleLabel+' '+v.design.driveLabel+' 관찰');b.querySelector('.fleet-name').textContent=v.id+'번 · '+v.design.styleLabel;b.querySelector('.fleet-drive').textContent=v.design.driveLabel;b.querySelector('.fleet-spec').textContent='출력 '+(v.design.peakPower*10000).toFixed(0)+' · 질량 '+v.design.totalMass.toFixed(1);b.querySelector('.fleet-distance').textContent=distance(v.score)+(v.finished?' · '+v.finishTime.toFixed(2)+' t':!v.alive?' · 멈춤':'');const signature=JSON.stringify(v.genome);if(b.dataset.design!==signature){drawThumbnail(b.querySelector('canvas').getContext('2d'),v);b.dataset.design=signature;}});
    const html=lab.history.length?lab.history.slice(-5).reverse().map(h=>'<li><span>'+h.generation+'세대</span><strong>'+(h.finishers?h.bestTime.toFixed(2)+' t · '+h.finishers+'대 완주':distance(h.best))+'</strong></li>').join(''):'<li>첫 경주가 끝나면 기록됩니다.</li>';if($('history').innerHTML!==html)$('history').innerHTML=html;
  }
  for(let i=0;i<lab.population;i++){const b=document.createElement('button');b.innerHTML='<canvas width="200" height="96" aria-hidden="true"></canvas><span class="fleet-name">'+(i+1)+'번</span><small class="fleet-drive"></small><small class="fleet-spec"></small><small class="fleet-distance">0 u</small>';b.style.borderBottomColor=lab.vehicles[i].color;b.style.borderBottomWidth='3px';b.onclick=()=>{watch=i;overview=false;render();};$('fleet').append(b);}
  $('start').onclick=()=>{running=!running;last=null;message(running?'같은 코스와 노면에서 완주 시간과 최장 거리를 기록합니다.':'경주를 멈췄습니다. 번호를 눌러 각 차량의 모양을 살펴보세요.');render();};$('next').onclick=next;
  $('replay').onclick=()=>{lab.restartTrial();running=false;camera=0;message('같은 개체와 코스로 경주를 다시 준비했습니다. 경주 시작을 눌러 보세요.');render();};$('reset').onclick=()=>reset();$('terrain').onchange=()=>reset();$('surface').onchange=()=>reset();$('new-seed').onclick=()=>reset();
  $('mutation').oninput=e=>{lab.setMutation(Number(e.target.value)/100);$('mutation-value').textContent=e.target.value+'%';};$('auto').onclick=()=>{auto=!auto;if(auto&&lab.complete&&!editing)next();else render();};$('leader').onclick=()=>{watch=-1;overview=false;render();};$('overview').onclick=()=>{overview=true;render();};
  $('initial-experiment').onchange=()=>reset();
  $('engineering').onclick=()=>{engineering=!engineering;render();};
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
  window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'world units u; origin at left, x right, y down; chassis COM positions; score uses chassis frame origin, start x140, finish x2600; two drawn wheels represent rear and front axles',generation:lab.generation,time:lab.time,duration:lab.duration,complete:lab.complete,running,auto,terrain:lab.terrain,surface:lab.surface,engineering,seed:lab.seed,mutation:lab.mutation,initialExperiment:lab.initialExperiment,editing,undo:strokes.length,watch,overview,history:lab.history.slice(-5),vehicles:lab.vehicles.map(v=>({id:v.id,x:v.body.position.x,y:v.body.position.y,score:v.score,alive:v.alive,finished:v.finished,finishTime:v.finishTime,stopReason:v.stopReason,telemetry:v.telemetry,genome:v.genome,design:{style:v.design.styleLabel,driveType:v.design.driveType,driveLabel:v.design.driveLabel,driveShares:v.design.driveShares,mass:v.design.totalMass,powertrainMass:v.design.powertrainMass,powerIndex:v.design.peakPower*10000,powerPerMass:v.design.powerToWeight*10000,frontLoad:v.design.frontLoad,rearLoad:v.design.rearLoad,centerOfMass:v.design.centerOfMass}})),terrainPoints:editing?drawPoints:undefined});
  window.advanceTime=ms=>{manual=true;const ticks=Math.round(ms/1000*120*Number($('speed').value));for(let i=0;i<ticks;i++)update(1/120);render();};
  function frame(now){if(!manual&&last!==null){accumulator+=Math.min(.1,(now-last)/1000)*Number($('speed').value);while(accumulator>=1/120){update(1/120);accumulator-=1/120;}render();}last=now;requestAnimationFrame(frame);}render();requestAnimationFrame(frame);
})();
