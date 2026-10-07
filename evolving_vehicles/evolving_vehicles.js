(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
  const lab=new EvolutionLab({seed:42,terrain:'rolling',mutation:.2,population:8});
  let running=false,auto=false,watch=-1,overview=false,editing=false,drawPoints=[],pointer=null,camera=0,manual=false,last=null,accumulator=0,strokes=[];
  const message=text=>{$('message').textContent=text;};
  const distance=v=>Math.max(0,v).toFixed(0)+' u';
  const experimentHelp={evolution:'차체·바퀴·동력장치·구동방식이 서로 다른 8대로 시작합니다.',power:'같은 사륜구동 차체에서 1→8번 순으로 모터가 강하고 무거워집니다. 다음 세대부터 모든 설계 특성이 진화합니다.',balance:'같은 사륜구동·출력·질량으로 1→8번 순서대로 동력장치를 뒤에서 앞으로 옮깁니다. 다음 세대부터 모든 특성이 진화합니다.',drive:'같은 차체·출력·질량·무게배분으로 전륜·후륜·사륜을 비교합니다. 전체 토크와 출력은 같으며 다음 세대부터 모든 특성이 진화합니다.'};
  function trace(target,points){target.beginPath();points.forEach((p,i)=>i?target.lineTo(p.x,p.y):target.moveTo(p.x,p.y));target.closePath();}
  function paintCar(target,vehicle,live=false,mark=false){
    const d=vehicle.design,g=vehicle.genome,style=typeof d.style==='number'?d.style:['buggy','coupe','van','pickup','racer','rover'].indexOf(d.style);
    const xs=d.outline.map(p=>p.x),ys=d.outline.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),w=right-left,h=bottom-top;
    const c=Math.cos(vehicle.body.angle),s=Math.sin(vehicle.body.angle);
    const local=p=>{const x=p.x-vehicle.body.position.x,y=p.y-vehicle.body.position.y;return{x:c*x+s*y,y:-s*x+c*y};};
    const wheels=vehicle.wheels.map((wheel,i)=>({p:live?local(wheel.position):(i?d.frontAxle:d.rearAxle),r:i?g.frontRadius:g.rearRadius,angle:live?wheel.angle-vehicle.body.angle:0,driven:d.driveShares[i]>0}));
    function tire(wheel){
      const {p,r,angle}=wheel;target.save();target.translate(p.x,p.y);target.rotate(angle);
      target.beginPath();target.arc(0,0,r,0,Math.PI*2);target.fillStyle='#293a35';target.fill();target.strokeStyle='#192c27';target.lineWidth=1.4;target.stroke();
      target.beginPath();target.arc(0,0,r*.71,0,Math.PI*2);target.fillStyle=style===4?'#8a938c':'#d1d8c6';target.fill();
      if(wheel.driven){target.beginPath();target.arc(0,0,r*.66,0,Math.PI*2);target.strokeStyle='#e5a738';target.lineWidth=Math.max(2,r*.12);target.stroke();}
      target.strokeStyle='#50635a';target.lineWidth=1.8;
      for(let i=0;i<6;i++){const a=i*Math.PI/3;target.beginPath();target.moveTo(Math.cos(a)*r*.18,Math.sin(a)*r*.18);target.lineTo(Math.cos(a)*r*.60,Math.sin(a)*r*.60);target.stroke();}
      target.strokeStyle='#748277';target.lineWidth=1.1;
      for(let i=0;i<12;i++){const a=i*Math.PI/6;target.beginPath();target.moveTo(Math.cos(a)*r*.86,Math.sin(a)*r*.86);target.lineTo(Math.cos(a+.06)*r*.97,Math.sin(a+.06)*r*.97);target.stroke();}
      target.beginPath();target.arc(0,0,Math.max(2.2,r*.17),0,Math.PI*2);target.fillStyle=vehicle.color;target.fill();target.restore();
    }
    wheels.forEach(tire);
    // The paint and windows stay inside the engine's actual collision outline.
    trace(target,d.outline);target.fillStyle=vehicle.color;target.fill();
    target.save();target.clip();
    const finish=target.createLinearGradient(0,top,0,bottom);finish.addColorStop(0,'#ffffff42');finish.addColorStop(.55,'#ffffff00');finish.addColorStop(1,'#132f3048');target.fillStyle=finish;target.fillRect(left,top,w,h);
    // Detail coordinates follow the same roof genes and frame as the physical outline.
    const P=(x,y)=>({x:d.frame.x+g.width*(x+(y<-.4?(x<0?g.roofLeft:g.roofRight)*.35:0)),y:d.frame.y+g.height*y});
    const panel=(points,fill,stroke='#344b45',width=.8)=>{trace(target,points.map(p=>P(...p)));if(fill){target.fillStyle=fill;target.fill();}if(stroke){target.strokeStyle=stroke;target.lineWidth=width;target.stroke();}};
    const line=(points,color='#334840',width=.9)=>{target.beginPath();points.forEach((p,i)=>{const q=P(...p);i?target.lineTo(q.x,q.y):target.moveTo(q.x,q.y);});target.strokeStyle=color;target.lineWidth=width;target.stroke();};
    const glass=points=>{panel(points,'#29484d','#d2e2df',.8);const a=P(...points[0]),b=P(...points[1]);target.beginPath();target.moveTo(a.x+1.2,a.y+2);target.lineTo(b.x-1.2,b.y+2);target.strokeStyle='#a9cbd0';target.lineWidth=.7;target.stroke();};
    const lamp=(x,y,rx,ry,color)=>{const p=P(x,y);target.beginPath();target.ellipse(p.x,p.y,g.width*rx,g.height*ry,0,0,Math.PI*2);target.fillStyle=color;target.fill();target.strokeStyle='#52645b';target.lineWidth=.65;target.stroke();};
    if(style===0){
      // Wrangler: upright hardtop, two squared windows, exposed hinges and flat hood.
      panel([[-.49,-.52],[-.41,-.69],[.095,-.69],[.22,-.22],[-.49,-.22]],'#293b35',null);
      glass([[-.43,-.57],[-.21,-.60],[-.21,-.28],[-.43,-.28]]);
      glass([[-.15,-.60],[.07,-.60],[.17,-.28],[-.15,-.28]]);
      panel([[-.16,-.22],[.18,-.22],[.18,.29],[-.16,.29]],null);
      line([[.22,-.13],[.45,-.10]],'#d6dec4',1.4);
      line([[-.13,-.05],[-.08,-.05]],'#e1e4cf',1.4);line([[-.13,.19],[-.08,.19]],'#e1e4cf',1.4);
      line([[.10,-.11],[.15,-.11]],'#293b35',1.4);
      for(let i=0;i<4;i++)line([[.29+i*.027,-.08],[.29+i*.027,.045]],'#263c35',.8);
      lamp(.463,.025,.028,.075,'#f1e7b3');
    }else if(style===1){
      // 911: sloping flyline, rear quarter window, low bonnet and rear engine grille.
      glass([[-.30,-.29],[-.15,-.61],[-.055,-.63],[-.055,-.22],[-.265,-.22]]);
      glass([[-.015,-.64],[.025,-.64],[.205,-.31],[.23,-.22],[-.015,-.22]]);
      panel([[-.08,-.16],[.23,-.16],[.29,.19],[-.13,.19]],null,'#3b5146',.75);
      line([[-.08,-.07],[-.015,-.07]],'#e0e6d5',1.2);
      line([[.25,-.12],[.43,-.045]],'#e4e7d9',1.2);
      for(let i=0;i<5;i++)line([[-.45+i*.021,-.07],[-.425+i*.021,.015]],'#253b35',.7);
      lamp(.449,-.012,.030,.095,'#faf0c6');
      line([[-.495,.10],[-.40,.10]],'#c76d62',1.8);
    }else if(style===2){
      // Type 2 T1: tall forward-control body, long row of windows and two-tone belt.
      panel([[-.51,-.9],[.51,-.9],[.51,-.16],[-.51,-.16]],'#e9e9d8',null);
      for(const x of [-.43,-.225,-.02])glass([[x,-.61],[x+.17,-.61],[x+.17,-.24],[x,-.24]]);
      glass([[.20,-.62],[.34,-.61],[.425,-.42],[.445,-.24],[.20,-.24]]);
      for(const x of [-.34,-.13,.08])panel([[x,-.75],[x+.13,-.75],[x+.13,-.68],[x,-.68]],'#365359',null);
      line([[-.49,-.13],[.49,-.13]],'#d8ddcd',1.2);
      panel([[-.01,-.13],[.18,-.13],[.18,.29],[-.01,.29]],null,'#527067',.65);
      panel([[.19,-.13],[.44,-.13],[.44,.29],[.19,.29]],null,'#527067',.65);
      line([[.21,-.02],[.265,-.02]],'#e4e8d7',1.2);lamp(.471,.015,.029,.074,'#f5e6ac');
    }else if(style===3){
      // Cybertruck: one angular roof peak, uninterrupted dark glazing and faceted panels.
      panel([[-.55,-1],[.55,-1],[.55,.36],[-.55,.36]],'#aebbbb',null);
      panel([[-.50,-.03],[-.14,-.47],[.02,-.74],[.38,-.10]],'#d5dedb',null);
      glass([[-.095,-.46],[.023,-.70],[.305,-.19],[-.13,-.19]]);
      line([[.065,-.61],[.065,-.19]],'#243b40',1.25);
      panel([[-.13,-.15],[.065,-.15],[.065,.28],[-.13,.28]],null,'#607274',.8);
      panel([[.075,-.15],[.325,-.15],[.38,.28],[.075,.28]],null,'#607274',.8);
      line([[-.48,.05],[.48,.05]],'#eef2ea',1.2);
      line([[-.49,-.015],[-.16,-.13]],'#2a3e3d',1.6);
      line([[.392,-.06],[.49,-.018]],'#fcf8db',2);
      line([[-.5,.07],[-.46,.07]],'#e89b82',1.8);
    }else if(style===4){
      // Countach: wedge nose, trapezoid glazing, angular side intake and rear louvers.
      glass([[-.215,-.48],[-.17,-.52],[.005,-.54],[.20,-.11],[-.24,-.11]]);
      line([[-.16,-.45],[-.14,-.13]],'#1e353a',1.2);
      panel([[-.28,-.035],[-.05,-.035],[-.14,.19],[-.36,.19]],'#203c38','#b1c4b5',.6);
      panel([[-.08,-.05],[.23,-.05],[.30,.22],[-.12,.22]],null,'#334b3d',.8);
      line([[.13,-.025],[.19,-.025]],'#e6ecd3',1.2);
      for(let i=0;i<5;i++)line([[-.465+i*.033,-.12],[-.435+i*.033,-.035]],'#233a31',1);
      panel([[.31,.08],[.41,.12],[.43,.18],[.33,.15]],'#dce5ce','#304c3d',.65);
      line([[-.49,.25],[.49,.25]],'#1d332e',2.1);
    }else{
      // Defender: contrasting roof, alpine lights, upright cabin and broad box panels.
      panel([[-.51,-.86],[.16,-.86],[.18,-.65],[-.51,-.65]],'#e8e6d2',null);
      for(const x of [-.36,-.19])panel([[x,-.67],[x+.115,-.67],[x+.115,-.59],[x,-.59]],'#2c4c4e','#dce0cf',.6);
      glass([[-.43,-.49],[-.18,-.49],[-.18,-.18],[-.43,-.18]]);
      glass([[-.12,-.52],[.085,-.53],[.19,-.18],[-.12,-.18]]);
      panel([[-.14,-.12],[.205,-.12],[.205,.29],[-.14,.29]],null,'#31463c',.9);
      line([[.09,-.04],[.16,-.04]],'#dfdfc9',1.3);
      panel([[.25,-.15],[.455,-.10],[.47,-.04],[.25,-.075]],'#667c69',null);
      for(let i=0;i<3;i++)line([[.28+i*.038,-.115],[.295+i*.038,-.055]],'#263e34',.85);
      lamp(.463,.037,.027,.079,'#f6e9b3');
    }
    // The arches follow the evolved axle positions rather than a fixed decorative wheelbase.
    for(const wheel of wheels){target.beginPath();target.arc(wheel.p.x,wheel.p.y,wheel.r+2.4,Math.PI,Math.PI*2);target.strokeStyle=style===1?'#476154':'#243d34';target.lineWidth=style===1?1.3:3;target.stroke();}
    const unit=d.powerUnit;target.fillStyle='#bc8b48';target.strokeStyle='#594b35';target.lineWidth=.9;target.fillRect(unit.x-unit.width/2,unit.y-unit.height/2,unit.width,unit.height);target.strokeRect(unit.x-unit.width/2,unit.y-unit.height/2,unit.width,unit.height);
    target.strokeStyle='#ead6a4';target.lineWidth=.8;for(let i=1;i<5;i++){const x=unit.x-unit.width/2+unit.width*i/5;target.beginPath();target.moveTo(x,unit.y-unit.height*.32);target.lineTo(x,unit.y+unit.height*.32);target.stroke();}
    target.fillStyle='#cc7866';target.fillRect(left,top+h*.69,Math.max(1.2,w*.022),h*.1);
    target.restore();trace(target,d.outline);target.strokeStyle='#254138';target.lineWidth=1.25;target.stroke();
    if(mark){const com=d.centerOfMass;target.beginPath();target.arc(com.x,com.y,3.8,0,Math.PI*2);target.fillStyle='#fff6ca';target.fill();target.strokeStyle='#283e36';target.lineWidth=1;target.stroke();target.beginPath();target.moveTo(com.x-5.4,com.y);target.lineTo(com.x+5.4,com.y);target.moveTo(com.x,com.y-5.4);target.lineTo(com.x,com.y+5.4);target.stroke();}
  }
  function drawThumbnail(target,vehicle){
    const d=vehicle.design,g=vehicle.genome,points=[...d.outline,{x:d.rearAxle.x-g.rearRadius,y:d.rearAxle.y-g.rearRadius},{x:d.rearAxle.x+g.rearRadius,y:d.rearAxle.y+g.rearRadius},{x:d.frontAxle.x-g.frontRadius,y:d.frontAxle.y-g.frontRadius},{x:d.frontAxle.x+g.frontRadius,y:d.frontAxle.y+g.frontRadius}];
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const scale=Math.min(174/(maxX-minX),78/(maxY-minY));target.clearRect(0,0,200,96);target.save();target.translate(100-(minX+maxX)/2*scale,47-(minY+maxY)/2*scale);target.scale(scale,scale);paintCar(target,vehicle,false,true);target.restore();
  }
  function validSeed(){const value=Number($('seed').value);if(!Number.isInteger(value)||value<1||value>999999){message('시드는 1부터 999999 사이의 정수로 입력해 주세요.');$('seed').focus();return null;}return value;}
  function reset(config={}){const seed=validSeed();if(seed===null)return;running=false;watch=-1;overview=false;editing=false;camera=0;lab.reset({seed,terrain:$('terrain').value,initialExperiment:$('initial-experiment').value,...config});lab.setMutation(Number($('mutation').value)/100);last=null;accumulator=0;const clues={valley:'골짜기에서 얻은 속도로 긴 오르막을 넘을 수 있을까요?',dunes:'세 언덕에서 큰 바퀴와 낮은 몸체의 장단점을 비교하세요.',ripple:'작은 요철이 반복됩니다. 바퀴 크기와 차체의 흔들림을 관찰하세요.'};message((lab.initialExperiment==='evolution'?(clues[lab.terrain]||'새 실험을 준비했습니다.'):experimentHelp[lab.initialExperiment])+' 경주 시작을 눌러 첫 세대를 관찰하세요.');render();}
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

        ctx.save();ctx.translate(X(vehicle.body.position.x),Y(vehicle.body.position.y));ctx.scale(view.sx,view.sy);ctx.rotate(vehicle.body.angle);paintCar(ctx,vehicle,true,vehicle.id===focused);ctx.restore();
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
    $('view-caption').textContent=editing?'코스를 그린 뒤 적용하세요 · 취소하면 경주로 돌아갑니다.':overview?'전체 코스 보기 · 차량 번호를 눌러 가까이 보기':watch<0?'선두 따라가기 · 아래 번호로 개별 차량 관찰':(watch+1)+'번 따라가기 · 선두 따라가기로 돌아갈 수 있어요';
    lab.vehicles.forEach((v,i)=>{const b=$('fleet').children[i];b.setAttribute('aria-pressed',String(watch===i&&!overview));b.setAttribute('aria-label',v.id+'번 '+v.design.styleLabel+' '+v.design.driveLabel+' 관찰');b.querySelector('.fleet-name').textContent=v.id+'번 · '+v.design.styleLabel;b.querySelector('.fleet-drive').textContent=v.design.driveLabel;b.querySelector('.fleet-spec').textContent='출력 '+(v.design.peakPower*10000).toFixed(0)+' · 질량 '+v.design.totalMass.toFixed(1);b.querySelector('.fleet-distance').textContent=distance(v.score)+(v.finished?' · 도착':!v.alive?' · 멈춤':'');const signature=JSON.stringify(v.genome);if(b.dataset.design!==signature){drawThumbnail(b.querySelector('canvas').getContext('2d'),v);b.dataset.design=signature;}});
    const html=lab.history.length?lab.history.slice(-5).reverse().map(h=>'<li><span>'+h.generation+'세대</span><strong>'+distance(h.best)+'</strong></li>').join(''):'<li>첫 경주가 끝나면 기록됩니다.</li>';if($('history').innerHTML!==html)$('history').innerHTML=html;
  }
  for(let i=0;i<lab.population;i++){const b=document.createElement('button');b.innerHTML='<canvas width="200" height="96" aria-hidden="true"></canvas><span class="fleet-name">'+(i+1)+'번</span><small class="fleet-drive"></small><small class="fleet-spec"></small><small class="fleet-distance">0 u</small>';b.style.borderBottomColor=lab.vehicles[i].color;b.style.borderBottomWidth='3px';b.onclick=()=>{watch=i;overview=false;render();};$('fleet').append(b);}
  $('start').onclick=()=>{running=!running;last=null;message(running?'같은 시간 동안 달리며 가장 멀리 도달한 거리를 기록합니다.':'경주를 멈췄습니다. 번호를 눌러 각 차량의 모양을 살펴보세요.');render();};$('next').onclick=next;
  $('replay').onclick=()=>{lab.restartTrial();running=false;camera=0;message('같은 개체와 코스로 경주를 다시 준비했습니다. 경주 시작을 눌러 보세요.');render();};$('reset').onclick=()=>reset();$('terrain').onchange=()=>reset();$('new-seed').onclick=()=>reset();
  $('mutation').oninput=e=>{lab.setMutation(Number(e.target.value)/100);$('mutation-value').textContent=e.target.value+'%';};$('auto').onclick=()=>{auto=!auto;if(auto&&lab.complete&&!editing)next();else render();};$('leader').onclick=()=>{watch=-1;overview=false;render();};$('overview').onclick=()=>{overview=true;render();};
  $('initial-experiment').onchange=()=>reset();
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
  window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'world units u; origin at left, x right, y down; chassis COM positions; score uses chassis frame origin, start x140, finish x2600; two drawn wheels represent rear and front axles',generation:lab.generation,time:lab.time,duration:lab.duration,complete:lab.complete,running,auto,terrain:lab.terrain,seed:lab.seed,mutation:lab.mutation,initialExperiment:lab.initialExperiment,editing,undo:strokes.length,watch,overview,history:lab.history.slice(-5),vehicles:lab.vehicles.map(v=>({id:v.id,x:v.body.position.x,y:v.body.position.y,score:v.score,alive:v.alive,finished:v.finished,genome:v.genome,design:{style:v.design.styleLabel,driveType:v.design.driveType,driveLabel:v.design.driveLabel,driveShares:v.design.driveShares,mass:v.design.totalMass,powertrainMass:v.design.powertrainMass,powerIndex:v.design.peakPower*10000,powerPerMass:v.design.powerToWeight*10000,frontLoad:v.design.frontLoad,rearLoad:v.design.rearLoad,centerOfMass:v.design.centerOfMass}})),terrainPoints:editing?drawPoints:undefined});
  window.advanceTime=ms=>{manual=true;const ticks=Math.round(ms/1000*120*Number($('speed').value));for(let i=0;i<ticks;i++)update(1/120);render();};
  function frame(now){if(!manual&&last!==null){accumulator+=Math.min(.1,(now-last)/1000)*Number($('speed').value);while(accumulator>=1/120){update(1/120);accumulator-=1/120;}render();}last=now;requestAnimationFrame(frame);}render();requestAnimationFrame(frame);
})();
