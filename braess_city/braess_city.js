(() => {
  'use strict';
  const E = window.BraessTraffic, N = window.RoadNetwork, $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d'), stage = $('stage');
  const colors = ['#21654f','#548bab','#b9763c','#8c72a0','#a05e6b','#69844a','#417e87','#8a7649','#5872ac'];
  const presets = { paradox: { demand:4000,open:true,brief:'모두 지름길로 몰려 출근에 80분. 가운데 도로를 닫으면 얼마나 달라질까요?' }, quiet: { demand:1000,open:false,brief:'차가 적은 도시입니다. 지름길을 열고 경로 재선택을 끝까지 지켜보세요. 닫는 것이 항상 답일까요?' }, busy: { demand:10000,open:true,brief:'열린 지름길에 차가 없다면? 닫아 보고 왜 시간이 그대로인지 경로 비용을 비교하세요.' }, free: { demand:4000,open:true,brief:'수요와 도로 시간을 조절하고, 같은 조건의 열기·닫기 비교로 도로가 도움이 되는 경계를 찾아보세요.' } };
  let c, flows, names, running=false, elapsed=0, previous=null, selected=-1, selectedEdge=null, compared=false, changed=false, W=900,H=540,nodes,completed=new Set(),lastFrame=0,pointerStart=null;
  let playbackRate=1,manualClock=false,steps=0,comparisonKey='',comparisonResults=[];
  const classic=()=>c.mapId==='classic', map=()=>N.getMap(c.mapId), engine=(config=c)=>config.mapId==='classic'?E:N;
  const ambientEnabled=()=>window.WebSimAmbient?.enabled===true, appearanceTime=()=>window.WebSimAmbient?.now?.()||0;
  const fmt=n=>Math.round(n).toLocaleString('ko-KR'), minutes=n=>`${n.toFixed(1)}분`;
  const cloneConfig=config=>({...config,...(config.closed?{closed:[...config.closed]}:{})});
  const current=()=>({...engine().costs(c,flows),...(classic()?{available:c.open?[0,1,2]:[0,1]}:{})}), equilibrium=()=>engine().equilibrium(c);
  const oldCosts=()=>engine(previous.c).costs(previous.c,previous.flows);
  const controlEdges=()=>map().edges.filter(e=>e.controlled);
  function playback(value){running=value;elapsed=0;lastFrame=performance.now();}
  function snapshot(){return {c:cloneConfig(c),flows:flows.slice(),compared,mission:$('mission').value};}
  function remember(){previous=snapshot();}
  function syncControls(){for(const k of ['demand','fixed','shortcut'])$(k).value=c[k];}
  function reset(){
    const id=$('city-map').value,preset=presets[$('mission').value];
    c=id==='classic'?{...E.config({...preset,fixed:45,shortcut:0}),mapId:id}:N.config({mapId:id});
    flows=equilibrium().flows.slice();previous=null;playback(false);steps=0;compared=false;changed=false;selected=-1;selectedEdge=null;comparisonKey='';
    names=classic()?['위쪽 길','아래쪽 길','지름길 경유']:map().routes.map((r,i)=>`경로 ${i+1}`);
    buildRoutes();syncControls();$('message').textContent=classic()?preset.brief:map().description;resize();update();
  }
  function buildRoutes(){
    const list=document.querySelector('.route-list');list.replaceChildren();
    names.forEach((name,i)=>{const button=document.createElement('button');button.dataset.route=i;button.setAttribute('aria-pressed','false');
      const title=document.createElement('span'),dot=document.createElement('i');dot.className='route-dot';dot.style.background=colors[i];title.append(dot,classic()?name:`${name} · ${map().routes[i].label}`);
      const value=document.createElement('strong');value.id=`route-${i}`;button.append(title,value);button.onclick=()=>{selected=selected===i?-1:i;update();};list.append(button);
    });
    $('network-controls').replaceChildren();
    if(!classic())controlEdges().forEach((e,i)=>{const button=document.createElement('button');button.dataset.road=e.id;button.className='sim-primary';button.onclick=()=>toggle(e.id);button.dataset.letter='AB'[i];$('network-controls').append(button);});
  }
  function toggle(edgeId){
    if(classic()){
      remember();c.open=!c.open;if(!c.open){flows[0]+=flows[2]/2;flows[1]+=flows[2]/2;flows[2]=0;}compared=true;
    }else{
      const next=N.toggle(c,flows,edgeId);if(!next.ok){$('message').textContent=next.reason;return;}remember();c=next.config;flows=next.flows;selectedEdge=edgeId;
    }
    changed=true;playback(current().gap>=.015);
    $('message').textContent=running?'도로 배치가 바뀌었습니다. 운전자들이 더 빠른 경로로 옮기는 과정을 지켜보세요.':'도로 배치가 바뀌었습니다. 현재 경로 선택이 완료되었습니다. 같은 조건 비교로 개폐의 효과를 살펴보세요.';
    update();
  }
  function step(){
    const result=engine().step(c,flows);flows=result.flows;steps++;
    if(result.gap<.015){flows=equilibrium().flows.slice();playback(false);$('message').textContent='경로 선택 완료. 더 빠른 경로로 옮길 이득이 없어졌습니다. 다른 도로 배치와 비교해 보세요.';}
    else $('message').textContent=`${names[result.from]}에서 ${names[result.to]}로 약 ${fmt(result.moved)}대가 옮겼습니다. 경로를 옮길 이득이 없어질 때까지 이어집니다.`;
    update();
  }
  function comparisons(){const key=JSON.stringify(c);if(key!==comparisonKey){comparisonKey=key;comparisonResults=N.comparisons(c);}return comparisonResults;}
  function updateComparison(){
    $('comparison-panel').hidden=classic()||!compared;if(classic()||!compared)return;
    const rows=$('comparison-rows');rows.replaceChildren();const results=comparisons(),best=Math.min(...results.filter(r=>r.available).map(r=>r.average));
    results.forEach((r,i)=>{const row=document.createElement('div');row.className='comparison-row';
      const title=document.createElement('span');title.textContent=`A ${i&1?'닫힘':'열림'} · B ${i&2?'닫힘':'열림'}`;
      const value=document.createElement('strong');value.textContent=r.available?minutes(r.average):'경로 없음';if(r.available&&Math.abs(r.average-best)<.01)value.className='best-result';
      const button=document.createElement('button'),same=JSON.stringify(r.closed)===JSON.stringify(c.closed);button.textContent=same?'현재 배치':'적용';button.disabled=!r.available||same;
      button.onclick=()=>{remember();c=N.config({...c,closed:r.closed});flows=r.flows.slice();playback(false);steps=0;changed=true;$('message').textContent='비교한 도로 배치의 경로 선택 완료 상태를 적용했습니다. 변경 전 복원으로 돌아갈 수 있습니다.';update();};row.append(title,value,button);rows.append(row);
    });
  }
  function update(){
    const result=current(),settled=result.gap<.015,isClassic=classic();
    $('toggle-road').hidden=!isClassic;$('network-controls').hidden=isClassic;$('toggle-road').textContent=c.open?'지름길 닫기':'지름길 열기';$('toggle-road').setAttribute('aria-pressed',String(!c.open));
    document.querySelectorAll('[data-road]').forEach(button=>{const edge=map().edges.find(e=>e.id===button.dataset.road),closed=c.closed.includes(edge.id);button.textContent=`${button.dataset.letter} · ${edge.label} ${closed?'열기':'닫기'}`;button.setAttribute('aria-pressed',String(closed));});
    $('play').textContent=running?'일시정지':settled?'자동 재생 · 완료':'자동 재생';$('play').disabled=settled;$('step').disabled=settled;$('play').setAttribute('aria-pressed',String(running));
    $('status-chip').textContent=settled?'경로 선택 완료':`경로 조정 중 · 차이 ${result.gap.toFixed(1)}분`;
    $('time-stat').textContent=minutes(result.average);$('usage-label').textContent=isClassic?'지름길 이용':'이용 중인 경로';$('shortcut-stat').textContent=isClassic?`${Math.round(flows[2]/c.demand*100)}%`:`${flows.filter(f=>f>.1).length} / ${result.available.length}`;
    const delta=previous?result.average-oldCosts().average:null;$('delta-stat').textContent=delta==null?'—':Math.abs(delta)<.05?'변화 없음':`${Math.abs(delta).toFixed(1)}분 ${delta<0?'↓':'↑'}`;
    $('demand-value').textContent=`${fmt(c.demand)}대`;$('fixed-value').textContent=isClassic?`${c.fixed}분`:`${(c.fixed/45).toFixed(2)}×`;$('shortcut-value').textContent=`${c.shortcut}분`;
    $('fixed-label').textContent=isClassic?'바깥 도로의 시간':'기본 주행 시간 배율';$('fixed-hint').textContent=isClassic?'회색 도로는 통행량과 관계없이 이 시간이 걸립니다.':'각 도로의 기본 시간만 바뀝니다. 혼잡에 따라 늘어나는 시간은 그대로입니다.';
    $('shortcut-label').textContent=isClassic?'지름길 자체의 시간':'A·B 도로의 추가 시간';$('shortcut-hint').textContent=isClassic?'초록 혼잡 도로는 차량 100대당 1분씩 느려집니다.':'조절 가능한 두 도로 각각에 더해집니다. 도로별 계산은 아래에서 볼 수 있습니다.';
    $('mission-control').hidden=!isClassic;$('mission-count').hidden=!isClassic;$('mission-brief').textContent=isClassic?presets[$('mission').value].brief:map().description;
    $('map-description').textContent=isClassic?'집–회사 사이 세 경로. 도로를 닫으면 빨라지는 역설의 출발점입니다.':`${map().nodes.length}개 교차점 · ${map().edges.length}개 도로 · ${map().routes.length}개 경로. 주황색 A·B 도로를 눌러 바꿔 보세요.`;
    $('canvas-help').firstElementChild.textContent=isClassic?'가운데 도로 클릭 · Space 재생 · → 한 단계 · F 전체화면':'A·B 도로 클릭 · 다른 도로는 시간 확인 · Space 재생';
    canvas.setAttribute('aria-label',isClassic?'집에서 회사로 가는 도로망. 중앙 지름길을 누르면 열거나 닫습니다.':`${map().name}. A·B 도로는 지도 위 또는 위쪽 도로 버튼으로 열고 닫을 수 있습니다.`);
    $('compare').textContent=isClassic?'같은 조건으로 열기·닫기 비교':'A·B의 네 가지 배치 비교';$('restore').disabled=!previous;$('edge-changes').hidden=!previous;
    if(previous){const before=oldCosts(),labels=isClassic?['집 → 위','위 → 회사','집 → 아래','아래 → 회사','지름길']:map().edges.map(e=>e.label);
      const differences=labels.map((name,i)=>({name,i})).filter(({i})=>Math.abs(result.edgeTimes[i]-before.edgeTimes[i])>.05).sort((a,b)=>Math.abs(result.edgeTimes[b.i]-before.edgeTimes[b.i])-Math.abs(result.edgeTimes[a.i]-before.edgeTimes[a.i]));
      $('edge-changes').textContent=differences.length?'이전 상태와 비교 · 시간이 크게 바뀐 도로\n'+differences.slice(0,3).map(({name,i})=>`${name}: ${fmt(before.edges[i])} → ${fmt(result.edges[i])}대 · ${before.edgeTimes[i].toFixed(1)} → ${result.edgeTimes[i].toFixed(1)}분`).join('\n'):'각 도로의 시간은 이전 상태와 같습니다. 열림·닫힘과 이용 경로도 함께 확인하세요.';
    }
    names.forEach((_,i)=>{$('route-'+i).textContent=result.available.includes(i)?`${fmt(flows[i])}대 · ${minutes(result.times[i])}`:'닫힌 도로 포함';document.querySelector(`[data-route="${i}"]`).setAttribute('aria-pressed',String(selected===i));});
    $('route-note').textContent=selected<0?'경로를 누르면 지도에서 이동 경로를 확인할 수 있습니다.':!result.available.includes(selected)?'닫힌 도로가 포함되어 이 경로로 이동할 수 없습니다.':`${names[selected]}: ${isClassic?'':`집 → ${map().routes[selected].label} → 회사. `}지금 ${fmt(flows[selected])}대가 이용하며 ${minutes(result.times[selected])}이 걸립니다.`;
    if(isClassic){const mission=$('mission').value,preset=presets[mission],matches=c.demand===preset.demand&&c.fixed===45&&c.shortcut===0;
      if(changed&&settled&&matches&&mission!=='free'&&c.open!==preset.open){completed.add(mission);$('message').textContent=mission==='paradox'?'발견! 지름길을 닫자 80분 → 65분. 각자 빠른 길을 고르는 결과와 모두에게 빠른 결과는 다를 수 있습니다.':mission==='quiet'?'이번에는 지름길이 이득입니다. 50분 → 20분. 도로의 효과는 수요에 따라 달라집니다.':'시간이 그대로입니다. 이미 쓰이지 않던 지름길을 닫았기 때문입니다.';}
    }
    $('mission-count').textContent=`${completed.size} / 3`;$('road-details').hidden=isClassic;
    if(!isClassic){$('road-detail-rows').replaceChildren();map().edges.forEach((e,i)=>{const p=document.createElement('p');p.className='road-detail';p.textContent=`${e.label} · ${c.closed.includes(e.id)?'닫힘':`${fmt(result.edges[i])}대 / ${minutes(result.edgeTimes[i])}`}\n기본 ${(e.b*c.fixed/45).toFixed(1)}분 + 100대당 ${(e.a*100).toFixed(2)}분${e.controlled?` + 추가 ${c.shortcut}분`:''}`;$('road-detail-rows').append(p);});}
    updateComparison();draw();
  }
  function resize(){const mobile=stage.clientWidth<550;W=mobile?360:900;H=classic()?(mobile?480:540):(mobile?540:570);const dpr=Math.min(devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.aspectRatio=`${W}/${H}`;ctx.setTransform(dpr,0,0,dpr,0,0);
    nodes=mobile?[{x:35,y:222},{x:180,y:110},{x:180,y:333},{x:325,y:222}]:[{x:110,y:245},{x:450,y:105},{x:450,y:385},{x:790,y:245}];draw();
  }
  function draw(){if(!c)return;classic()?drawClassic():drawNetwork();}

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
  function drawClassic() {
    if (!nodes || !c) return; const mobile = W < 550, r = current(), [s,a,b,t] = nodes, links = [[s,a],[a,t],[s,b],[b,t],[a,b]], active = selected < 0 ? null : E.routes[selected], before=previous?E.costs(previous.c,previous.flows):null;
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#f5f6f1';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#e7eee1'; for (const [x,y,rad] of mobile ? [[70,135,24],[295,340,29]] : [[235,175,40],[665,340,53],[190,352,21]]) {ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fill();}
    ctx.font=`600 ${mobile?14:17}px system-ui,sans-serif`;ctx.textAlign='left';ctx.fillStyle='#192d29';ctx.fillText(`${fmt(c.demand)}대가 같은 출근길을 고릅니다`,mobile?18:26, mobile?28:35);
    ctx.font=`${mobile?13:13}px system-ui,sans-serif`;ctx.fillStyle='#62706a';ctx.fillText('초록: 혼잡에 따라 증가   회색: 일정한 시간',mobile?18:26,mobile?49:58);
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
  function networkPoints(){return Object.fromEntries(map().nodes.map(n=>[n.id,{x:22+n.x*(W-44),y:80+n.y*(H-170)}]));}
  function drawNetwork(){
    const mobile=W<550,m=map(),points=networkPoints(),r=current(),controls=controlEdges(),active=selected<0?null:m.routes[selected].edgeIds;
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#f5f6f1';ctx.fillRect(0,0,W,H);
    if(c.mapId==='river'){
      ctx.fillStyle='#dcebed';ctx.beginPath();ctx.moveTo(W*.43,70);ctx.bezierCurveTo(W*.6,180,W*.34,310,W*.55,H-65);ctx.lineTo(W*.67,H-65);ctx.bezierCurveTo(W*.46,300,W*.7,170,W*.55,70);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#bdd8dc';ctx.lineWidth=1;for(let j=0;j<8;j++){ctx.beginPath();ctx.moveTo(W*.49,90+j*48);ctx.quadraticCurveTo(W*.56,98+j*48,W*.59,88+j*48);ctx.stroke();}
    }else if(c.mapId==='grid'){
      for(const x of [.28,.72])for(const y of [.32,.68]){const p={x:22+x*(W-44),y:80+y*(H-170)};ctx.fillStyle='#e5eadf';ctx.beginPath();ctx.roundRect(p.x-(mobile?27:62),p.y-34,mobile?54:124,68,12);ctx.fill();}
    }else{
      const centers=c.mapId==='ring'?[{x:W*.5,y:H*.48}]:[{x:W*.23,y:H*.5},{x:W*.77,y:H*.5}];
      centers.forEach(p=>{ctx.fillStyle='#e5ecdf';ctx.beginPath();ctx.ellipse(p.x,p.y,mobile?42:90,mobile?70:94,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d8e1d1';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x,p.y,mobile?30:73,mobile?57:78,0,0,Math.PI*2);ctx.stroke();});
    }
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#192d29';ctx.font=`600 ${mobile?14:18}px system-ui,sans-serif`;ctx.fillText(`${m.name} · ${fmt(c.demand)}대`,20,29);
    ctx.fillStyle='#62706a';ctx.font=`${mobile?13:13}px system-ui,sans-serif`;ctx.fillText('주황 A·B: 열고 닫기   화살표: 진행 방향',20,52);
    m.edges.forEach((e,i)=>{
      const a=points[e.from],b=points[e.to],closed=c.closed.includes(e.id),color=e.controlled?'#c59160':e.a?'#91b8a0':'#c6cfc9';
      if((active?.includes(e.id)||selectedEdge===e.id)&&!closed)line(a,b,active?.includes(e.id)?colors[selected]:'#60796c',mobile?17:23);
      line(a,b,closed?'#cbd1c5':color,mobile?9:13,closed?[5,7]:[]);if(!closed)line(a,b,'#fff9',1,[3,7]);
      if(!closed){const t=.70,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,angle=Math.atan2(b.y-a.y,b.x-a.x);ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(1,0);ctx.lineTo(-5,4);ctx.strokeStyle=e.controlled?'#956239':'#577568';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
    });
    m.routes.forEach((route,i)=>{if(r.available.includes(i)){const path=[points[m.source],...route.edgeIds.map(id=>points[m.edges.find(e=>e.id===id).to])];drawRouteFlow(path,i,appearanceTime(),mobile);}});
    m.edges.forEach((e,i)=>{const a=points[e.from],b=points[e.to],x=(a.x+b.x)/2,y=(a.y+b.y)/2;
      if(e.controlled){const letter='AB'[controls.indexOf(e)],closed=c.closed.includes(e.id);label(`${letter} ${closed?'닫힘':r.edgeTimes[i].toFixed(0)+'분'}`,x,y,closed?'#737a70':'#9d6230',mobile?15:14);}
      else if(!mobile||selectedEdge===e.id){const horizontal=Math.abs(b.y-a.y)<20;label(`${r.edgeTimes[i].toFixed(0)}분`,x+(horizontal?0:10),y+(horizontal?-14:-10),'#557568',mobile?15:13);}
    });
    m.nodes.forEach(n=>{const p=points[n.id],endpoint=n.id===m.source||n.id===m.sink;ctx.fillStyle=endpoint?'#21654f':'#fff';ctx.strokeStyle='#92aa9a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,mobile?21:23,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=endpoint?'#fff':'#21654f';ctx.font=`700 ${mobile?15:13}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(mobile?n.label.replace(" 위","↑").replace(" 아래","↓"):n.label,p.x,p.y);});
    const inspected=selectedEdge?m.edges.find(e=>e.id===selectedEdge):null;
    ctx.fillStyle='#ffffffdd';ctx.beginPath();ctx.roundRect(14,H-64,W-28,49,8);ctx.fill();ctx.fillStyle='#62706a';ctx.textAlign='left';ctx.font=`${mobile?13:13}px system-ui,sans-serif`;
    if(inspected){const i=m.edges.indexOf(inspected);ctx.fillText(`${inspected.label} · ${c.closed.includes(inspected.id)?'닫힘':`${fmt(r.edges[i])}대 · ${minutes(r.edgeTimes[i])}`}`,26,H-43);ctx.font=`${mobile?12:12}px system-ui,sans-serif`;ctx.fillText('다른 도로를 누르면 그 도로의 시간이 표시됩니다',26,H-25);}
    else{ctx.fillText(`이동 가능한 경로 ${r.available.length}개 / 전체 ${m.routes.length}개`,26,H-43);ctx.font=`${mobile?12:12}px system-ui,sans-serif`;ctx.fillText('도로를 눌러 시간 확인 · 아래 경로 목록으로 추적',26,H-25);}
  }
  function advance(ms){if(running){elapsed+=Math.max(0,ms)*playbackRate;while(elapsed+1e-7>=500&&running){elapsed-=500;step();}}if(ambientEnabled()||running)draw();}
  function restore(){if(!previous)return;const back=previous;previous=snapshot();c=cloneConfig(back.c);flows=back.flows.slice();compared=back.compared;$('mission').value=back.mission;playback(false);steps=0;changed=false;syncControls();$('message').textContent='저장된 도로와 차량 배치를 복원하고 재생을 멈췄습니다. 다시 누르면 두 상태를 오갈 수 있습니다.';update();}
  async function fullscreen(){if(document.fullscreenElement){await document.exitFullscreen();return;}if(stage.classList.contains('expanded')){stage.classList.remove('expanded');$('exit-fullscreen').hidden=true;resize();return;}try{await stage.requestFullscreen();}catch{stage.classList.add('expanded');}$('exit-fullscreen').hidden=false;resize();}
  $('toggle-road').onclick=()=>toggle();$('play').onclick=()=>{if(current().gap<.015)return;playback(!running);update();};$('step').onclick=()=>{playback(false);if(current().gap>=.015)step();};$('reset').onclick=reset;$('mission').onchange=reset;$('city-map').onchange=reset;$('restore').onclick=restore;
  $('playback-speed').onchange=()=>{playbackRate=Number($('playback-speed').value);playback(running);update();};
  $('compare').onclick=()=>{if(classic()&&!previous)remember();compared=true;playback(false);if(classic()){flows=equilibrium().flows.slice();$('message').textContent='수요와 도로 시간을 고정하고 지름길 개폐만 바꾼 결과입니다. 두 숫자는 경로 선택이 끝난 뒤의 통근 시간입니다.';}else $('message').textContent='A·B 도로의 네 배치를 같은 수요로 계산했습니다. 현재 차량 배치는 유지되며, 적용을 누르면 비교한 상태로 바뀝니다.';update();if(!classic()){$('comparison-panel').focus({preventScroll:true});$('comparison-panel').scrollIntoView({block:'nearest',behavior:'instant'});}};
  for(const k of ['demand','fixed','shortcut']){$(k).addEventListener('focus',remember);$(k).addEventListener('pointerdown',remember);$(k).oninput=()=>{const oldDemand=c.demand;c[k]=Number($(k).value);if(k==='demand')flows=flows.map(f=>f*c.demand/oldDemand);changed=false;playback(current().gap>=.015);if(classic())$('mission').value='free';$('message').textContent=running?'조건이 바뀌어 경로를 다시 고르고 있습니다.':'조건이 바뀌었습니다. 다른 배치와 비교해 보세요.';update();};}
  canvas.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0)pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};});
  canvas.addEventListener('pointermove',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>10)pointerStart.moved=true;});
  canvas.addEventListener('pointercancel',()=>{pointerStart=null;});
  canvas.addEventListener('pointerup',event=>{const start=pointerStart;pointerStart=null;if(!start||start.id!==event.pointerId||start.moved||Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)return;const box=canvas.getBoundingClientRect(),x=(event.clientX-box.left)*W/box.width,y=(event.clientY-box.top)*H/box.height;
    if(classic()){if(Math.abs(x-nodes[1].x)<38&&y>nodes[1].y+24&&y<nodes[2].y-24)toggle();return;}
    const points=networkPoints(),hits=map().edges.map(e=>{const a=points[e.from],b=points[e.to],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(.18,Math.min(.82,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));return{e,d:Math.hypot(x-a.x-t*dx,y-a.y-t*dy)};}).sort((a,b)=>a.d-b.d);
    if(hits[0].d<23){selectedEdge=hits[0].e.id;if(hits[0].e.controlled)toggle(selectedEdge);else update();}
  });
  window.addEventListener('websim:ambient-change',draw);$('fullscreen').onclick=fullscreen;$('exit-fullscreen').onclick=fullscreen;document.addEventListener('fullscreenchange',()=>{$('exit-fullscreen').hidden=!document.fullscreenElement&&!stage.classList.contains('expanded');resize();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&stage.classList.contains('expanded')){fullscreen();return;}if(/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName))return;if(event.key.toLowerCase()==='f'){event.preventDefault();fullscreen();}else if(event.code==='Space'&&event.target.tagName!=='BUTTON'){event.preventDefault();$('play').click();}else if(event.key==='ArrowRight'){event.preventDefault();$('step').click();}});
  window.render_game_to_text=()=>JSON.stringify({coordinates:'origin top-left, x right, y down',mapId:c.mapId,mapName:classic()?'원형 실험':map().name,mission:$('mission').value,config:c,flows:flows.map(Math.round),preciseFlows:flows,...current(),running,playbackRate,stepIntervalMs:500/playbackRate,steps,compared,comparisons:!classic()&&compared?comparisons():[],previous:previous?{config:previous.c,average:oldCosts().average}:null,selectedRoute:selected,selectedEdge,effectsEnabled:ambientEnabled(),roadChanges:previous?$('edge-changes').textContent:null,completed:[...completed],message:$('message').textContent,...(!classic()?{roads:map().edges.map(e=>({...e,closed:c.closed.includes(e.id)})),nodes:networkPoints(),canvasSize:{width:W,height:H}}:{})});
  window.advanceTime=ms=>{manualClock=true;advance(Number(ms)||0);};reset();new ResizeObserver(resize).observe(stage);requestAnimationFrame(function frame(t){const dt=lastFrame?Math.min(100,t-lastFrame):0;lastFrame=t;if(!manualClock)advance(dt);requestAnimationFrame(frame);});
})();
