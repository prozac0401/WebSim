(async () => {
'use strict';
const DEFAULT_VEHICLE='supra',DEFAULT_CIRCUIT='inje';
await window.ManufacturerModels?.load(DEFAULT_VEHICLE);
const $=id=>document.getElementById(id),E=window.TuningEvolution,vehicles=TrackRace.VEHICLES,circuits=[...RaceCircuits].sort((a,b)=>Number(b.id===DEFAULT_CIRCUIT)-Number(a.id===DEFAULT_CIRCUIT)),canvas=$('canvas');
let population=[],race,session,generation=1,history=[],watch=0,camera='follow',running=false,manual=false,fast=false,recorded=false,lastFrame=null,lastUI=-1,imageId='',inspectorKey='';
let paidPopulationSize=Number($('population-size').value),autoEvolution=true,autoStockRepeat=true,stockRun=1;
const palette=['#2e8eaa','#df8245','#8a70b5','#c94e63','#5d9d55','#d2ad38','#576eb7','#b57045','#48a89b','#b76192','#748b48','#697c8e'];
const renderer=new CircuitRenderer(canvas,{onSelect:id=>selectCar(id),onChange:state=>{camera=state.mode;['overview','follow','top','eau-rouge','pits'].forEach(id=>$(id).setAttribute('aria-pressed',String(id===camera)));$('orbit-mode').setAttribute('aria-pressed',String(state.interactionMode!=='pan'));$('pan-mode').setAttribute('aria-pressed',String(state.interactionMode==='pan'));draw();}});
const currentCircuit=()=>circuits.find(c=>c.id===$('circuit').value)||circuits[0];
const stockMode=()=>Number($('budget').value)===0;
const watching=()=>race.cars.find(c=>c.id===watch)||race.cars[0];
const tell=text=>{$('message').textContent=text;};
const fTime=value=>{if(!Number.isFinite(value)||value<=0)return '—';const ms=Math.round(value*1000);return String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');};
const seedValue=()=>{const v=Math.round(Number($('seed').value));return Number.isFinite(v)?Math.max(1,Math.min(2147483646,v)):31415;};
$('vehicle-source').before(document.querySelector('.slope-readout'));
for(const [label,list] of [
 ['국내 · 자동차 경주장',circuits.filter(c=>c.countryCode==='KR'&&c.category!=='드라이빙 체험'&&c.category!=='운영 확인 필요')],
 ['국내 · 드라이빙 체험',circuits.filter(c=>c.countryCode==='KR'&&c.category==='드라이빙 체험')],
 ['국내 · 운영 확인 필요',circuits.filter(c=>c.countryCode==='KR'&&c.category==='운영 확인 필요')],
 ['해외 · 그랑프리 서킷',circuits.filter(c=>c.countryCode!=='KR')]
]){const group=document.createElement('optgroup');group.label=label;list.forEach(c=>group.append(new Option(c.name+' · '+(c.lengthM/1000).toFixed(3)+' km',c.id)));if(list.length)$('circuit').append(group);}
$('circuit').value=DEFAULT_CIRCUIT;
$('circuit-quick').replaceChildren(...[...$('circuit').children].map(g=>g.cloneNode(true)));
vehicles.forEach(v=>$('vehicle-model').append(new Option(v.name,v.id)));$('vehicle-model').value=DEFAULT_VEHICLE;
function experiment(note){
 generation=1;stockRun=1;history=[];$('seed').value=seedValue();
 population=E.createPopulation({vehicleId:$('vehicle-model').value,count:paidPopulationSize,seed:seedValue(),budget:Number($('budget').value)});
 updateModeControls();
 prepareRace(note||(stockMode()?'세부 트림별 한 대씩, 튜닝 없이 출고 상태를 비교합니다. 자동 반복 주행을 켜 두면 같은 구성으로 다시 달립니다.':'한 차종의 출고 사양과 튜닝을 추첨했습니다. 레이스 또는 빠른 평가로 첫 세대를 비교하세요.'));
}
function updateModeControls(){
 const stock=stockMode(),count=$('population-size');
 count.querySelector('[data-stock-count]')?.remove();
 if(stock){const option=new Option(population.length+'대 · 트림별 1대','stock');option.dataset.stockCount='';count.append(option);count.value='stock';}
 else count.value=String(paidPopulationSize);
 count.disabled=stock;$('population-label').textContent=stock?'출고 비교 차량':'세대당 차량';
 $('auto-evolve').checked=stock?autoStockRepeat:autoEvolution;
 $('auto-evolve-label').textContent=stock?'자동 반복 주행':'자동 세대 진행';
 $('seed').disabled=stock;$('reroll').disabled=stock;
 $('roster-note').textContent=stock?'등록된 실제 세부 트림별로 한 대씩 모두 참가합니다. 차량 수와 사양은 자동으로 정해집니다.':'같은 차종의 실제 엔진·구동 조합을 추첨합니다. 낮은 출고 성능에 항목별 추가 예산과 더 많은 튜닝 단계가 주어집니다.';
}
function prepareRace(note,keepWatch=false,continuation=false){
 if(!continuation){
  running=false;fast=false;lastFrame=null;
  population=population.map((p,i)=>({...p,color:palette[i%palette.length]}));
  session=new ContinuousRace({circuit:currentCircuit(),entrants:population,seed:seedValue(),generation,stockRun,laps:Number($('laps').value),surface:$('surface').value});
 }
 recorded=false;lastUI=-1;race=session.race;
 if(!keepWatch||!race.cars.some(c=>c.id===watch))watch=race.cars[0].id;
 inspectorKey='';imageId='';renderer.setRace(race,{preserveCamera:continuation});if(!continuation)renderer.setView(camera);camera=renderer.mode;
 if(continuation)renderer.advanceCamera(0,{watch,snap:true});
 const c=currentCircuit();$('circuit-quick').value=c.id;$('circuit-title').textContent=c.name;
 $('eau-rouge').hidden=c.id!=='spa';['overview','follow','top','eau-rouge','pits'].forEach(id=>$(id).setAttribute('aria-pressed',String(id===camera)));
 const env=window.TrackEnvironmentData?.[c.id];
 $('environment-note').replaceChildren(document.createTextNode(env?.features?.length?'주변 환경: 사진·공식 지도에서 확인한 구역과 기본 잔디·추정 배경 수목을 함께 표시합니다. 사진 밖의 식생 배치와 지형 높이는 시각적 추정입니다. ':'주변 환경: 기본 잔디와 추정 배경 수목을 표시합니다. 실제 식생 위치와 지형 높이를 측량한 자료는 아닙니다. '));
 const sourceLink=document.createElement('a');sourceLink.href='data/environment/README.md';sourceLink.textContent='사진 출처·재현 범위 ↗';$('environment-note').append(sourceLink);
 $('pits').hidden=!renderer.pits?.focus;
 $('pit-note').replaceChildren(document.createTextNode(renderer.pits?.stats.features?'피트·서비스 시설: 실제 사진과 배치도를 참고한 근사 재구성입니다. 건물 높이와 세부 형태는 추정이며, 드라이빙센터의 대기·정비 구역은 레이스 피트와 구분합니다. ':'피트·서비스 시설: 위치가 확인된 자료가 충분하지 않아 시설을 임의로 배치하지 않았습니다. '));
 const pitLink=document.createElement('a');pitLink.href='data/pits/README.md';pitLink.textContent='피트 사진·시설별 출처 ↗';$('pit-note').append(pitLink);
 $('circuit-subtitle').textContent=c.country+' / '+c.nameEn+' / 지도 '+(c.lengthM/1000).toFixed(3)+' km';
 $('circuit-description').textContent=[c.description,c.sourceNote].filter(Boolean).join(' ');
 $('map-source').href=c.sourceUrl;$('map-source').textContent=c.attribution||c.source;
 $('map-license').href=c.licenseUrl||(c.countryCode==='KR'?'data/LICENSE.ODbL-1.0.txt':'data/LICENSE.f1-circuits.txt');
 $('map-license').textContent=c.license||(c.countryCode==='KR'?'ODbL 1.0':'MIT');
 $('standings').replaceChildren();
 for(const car of race.cars){
  const row=document.createElement('tr');row.dataset.car=car.id;
  const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.dataset.watch=car.id;
  button.innerHTML='<span class="rank"></span><span class="car-dot"></span><span class="driver-name"></span><span class="car-race-number"></span>';
  button.querySelector('.car-dot').style.background=car.color;button.querySelector('.driver-name').textContent=car.entrant.variantLabel;
  button.querySelector('.car-race-number').textContent='#'+String(car.index+1).padStart(2,'0');
  button.setAttribute('aria-label',String(car.index+1)+'번 '+car.entrant.variantLabel+' 관찰');
  button.addEventListener('click',()=>selectCar(car.id));td.append(button);row.append(td);
  for(let i=0;i<4;i++)row.append(document.createElement('td'));$('standings').append(row);
 }
 updateElevation();updateUI();draw();if(note)tell(note);
 const modelId=race.cars[0]?.vehicleId,currentRace=race;
 if(!ManufacturerModels.has(modelId)&&ManufacturerModels.canLoad(modelId)){
  ManufacturerModels.load(modelId).then(loaded=>{if(race===currentRace){if(loaded)renderer.clearVehicleModels();draw();}});draw();
 }
}
function selectCar(id){watch=id;inspectorKey='';updateElevation();updateUI();draw();}
function draw(){if(race){renderer.render({watch,mode:camera,showLine:$('show-line').checked});const source=renderer.getModelInfo(),key=source.kind+'|'+source.label;if($('exterior-source').dataset.source!==key){const node=$('exterior-source');node.dataset.source=key;node.replaceChildren(document.createTextNode(source.label));if(source.kind==='community-mesh'){const link=document.createElement('a');link.href='MODEL-SOURCES.md';link.target='_blank';link.rel='noopener';link.textContent=' · 제작자·CC BY 4.0·변경 내역 ↗';node.append(link);}}}}
function setCamera(mode){renderer.setView(mode);camera=renderer.mode;['overview','follow','top','eau-rouge','pits'].forEach(id=>$(id).setAttribute('aria-pressed',String(id===camera)));draw();}
function updateElevation(){
 const t=race.track,car=watching(),points=car.pathPoints||t.racingLine?.points||t.points;$('elevation-plot').hidden=!t.hasElevation;
 if(!t.hasElevation){$('elevation-range').textContent='고도 데이터 없음';return;}
 const low=t.elevationMin,high=t.elevationMax,range=Math.max(2,high-low);
 const coords=[...points,points[0]].map((p,i)=>(i/points.length*1000).toFixed(2)+','+(82-(p.z-low)/range*74).toFixed(2)),line='M'+coords.join(' L');
 $('elevation-line').setAttribute('d',line);$('elevation-area').setAttribute('d',line+' L1000,90 L0,90 Z');
 $('elevation-range').textContent=low.toFixed(0)+'–'+high.toFixed(0)+' m';$('elevation-gain').textContent='누적 상승 '+t.elevationGainM.toFixed(0)+' m';
 $('elevation-distance').textContent='선택 차량 주행선 '+(car.trackLength/1000).toFixed(3)+' km';
 if(t.elevationProfile){
  const link=document.createElement('a');link.href=t.elevationProfile.sourceUrl;link.target='_blank';link.rel='noopener';link.textContent='Spa 2026 공식 지도 · 거리별 고도';
  $('elevation-note').replaceChildren(link,document.createTextNode(' · 18개 측점 사이를 보간했습니다. 오 루주 391 m → 라디용 415 m. 측점 사이 경사·노면 캠버는 추정입니다.'));
 }else $('elevation-note').innerHTML='<a href="https://open-meteo.com/en/docs/elevation-api" target="_blank" rel="noopener">Copernicus DEM · Open-Meteo · 90 m 해상도</a> · 거리 기준 평활화. 실제 노면·교량 높이와 다를 수 있습니다.';
 $('elevation-note').append(document.createTextNode(' 3D 고저차 '+CircuitRenderer.ELEVATION_EXAGGERATION+'배 · 고도·경사 수치와 주행 계산은 원래 고도 기준입니다.'));
}
function updateTuning(car){
 const p=car.entrant,spec=car.spec,key=p.uid+':'+generation+':'+JSON.stringify(p.levels);if(inspectorKey===key)return;inspectorKey=key;
 const q=E.quote({vehicleId:p.vehicleId,variantId:p.variantId,levels:p.levels,budget:p.budget}),stock=p.budget===0;
 $('tuning-generation').textContent=stock?'출고 상태':generation+'세대';$('budget-used').textContent=stock?'예산 없음':q.cost+' / '+p.budget+' 크레딧';
 $('credit-summary').textContent=stock?'사양 보정 예산도 적용하지 않습니다. 모든 튜닝은 0단계입니다.':'사양 보정 전용 예산 · '+E.CATEGORIES.map(c=>c.label+' '+(q.credits[c.id]||0)).join(' / ');
 $('tuning-note').textContent=stock?'출고 상태 비교 중에는 튜닝을 변경할 수 없습니다. 튜닝 예산을 선택하면 다시 조정할 수 있습니다.':'P는 가상 튜닝 크레딧입니다. 단계별 비용은 누적됩니다. 전용 보정 예산을 먼저 사용하며, 직접 변경하면 새 실험으로 평가합니다.';
 $('tuning-controls').replaceChildren();
 E.CATEGORIES.forEach(category=>{
  const id=category.id,row=document.createElement('div');row.className='tune-row';
  const label=document.createElement('label');label.className='tune-label';label.htmlFor='tune-'+id;
  const title=document.createElement('span');title.textContent=category.label;const select=document.createElement('select');select.id='tune-'+id;
  for(let level=0;level<=q.maxLevels[id];level++){
   const n=E.quote({vehicleId:p.vehicleId,variantId:p.variantId,levels:{...p.levels,[id]:level},budget:p.budget});
   const option=new Option(stock?'출고 상태 · 0단계':level+'단계 · '+n.costByCategory[id]+' P',String(level));option.disabled=!n.valid;select.append(option);
  }
  select.value=p.levels[id];select.disabled=stock;select.addEventListener('change',()=>editTuning(car.id,id,Number(select.value)));
  label.append(title,select);row.append(label);const meter=document.createElement('div');meter.className='tune-meter';
  for(let i=0;i<q.maxLevels[id];i++){const pip=document.createElement('i');if(i<p.levels[id])pip.className='active';meter.append(pip);}if(!stock)row.append(meter);
  const note=document.createElement('small');note.textContent=stock?'출고 사양 유지':'비용 '+q.costByCategory[id]+' · 보정 사용 '+(q.creditUsed[id]||0)+' / '+(q.credits[id]||0)+' · 최대 '+q.maxLevels[id]+'단계';row.append(note);$('tuning-controls').append(row);
 });
 const factory=p.factorySpec||p.baseSpec||{},dist=spec.frontWeightFraction??.5;
 const traits=[['엔진 / 모터',spec.engine||p.engine||p.variantLabel],['배기량',spec.displacementCc?spec.displacementCc.toLocaleString('ko-KR')+' cc':'전기 모터'],['앞 : 뒤 무게배분',Math.round(dist*100)+' : '+Math.round((1-dist)*100)+' (모형)'],['무게중심 높이',((spec.cgHeightM??.55)*100).toFixed(0)+' cm (모형)'],['출고 → 현재 출력',Math.round(factory.powerPs||p.factoryPowerPs||spec.powerPs)+' → '+Math.round(car.powerPs)+' PS'],['최고속도 한계',(car.theoreticalTopSpeed*3.6).toFixed(0)+' km/h (모형)'],['튜닝 단계',E.CATEGORIES.map(c=>p.levels[c.id]).join(' / ')],['보존 / 변이',({initial:'초기 추첨',elite:'최고 세팅 보존',offspring:'교배 · 돌연변이',immigrant:'새 사양 유입'}[p.lineage?.kind] || '직접 튜닝')]];
 $('vehicle-traits').replaceChildren();traits.forEach(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;$('vehicle-traits').append(dt,dd);});
}
function editTuning(carId,id,level){
 if(stockMode())return;
 const index=race.cars.findIndex(c=>c.id===carId),old=population[index],levels={...old.levels,[id]:level};
 const q=E.quote({vehicleId:old.vehicleId,variantId:old.variantId,levels,budget:old.budget});
 if(!q.valid){inspectorKey='';updateUI();tell('예산 또는 이 사양의 최대 단계를 넘습니다.');return;}
 population[index]=E.createEntrant({...old,levels,generation:1,lineage:{kind:'manual',parents:[]}});generation=1;history=[];
 prepareRace('선택 차량의 튜닝을 적용했습니다. 현재 구성을 기준으로 새 진화 실험을 시작합니다.',true);
}
function historyUI(){
 const stock=stockMode();$('evolution-title').textContent=stock?'출고 상태 비교':'원메이크 튜닝 진화';
 $('generation-label').textContent=stock?'반복 주행':'현재 세대';$('generation-stat').textContent=stock?stockRun+'회차':generation;$('make-summary').textContent=vehicles.find(v=>v.id===$('vehicle-model').value).name+' · '+population.length+'대';
 const valid=history.filter(h=>Number.isFinite(h.best)),champion=valid.reduce((a,b)=>!a||b.best<a.best?b:a,null);
 $('champion-time').textContent=champion?fTime(champion.best):'—';
 $('improvement-stat').textContent=!stock&&champion&&valid[0]?((valid[0].best-champion.best)/valid[0].best*100).toFixed(2)+'%':'—';
 document.querySelector('.history-chart').classList.toggle('has-history',!stock&&valid.length>0);
 if(stock){$('history-path').setAttribute('d','');$('history-caption').textContent=champion?'출고 상태 최고 기록 · '+champion.variantLabel+' · '+fTime(champion.best):'세부 트림별 한 대씩 비교합니다. 자동 반복 주행을 끄면 완주 후 멈춥니다.';return;}
 if(valid.length){
  const min=Math.min(...valid.map(h=>h.best)),max=Math.max(...valid.map(h=>h.best)),range=Math.max(.5,max-min);
  const coords=valid.map((h,i)=>(10+i/Math.max(1,valid.length-1)*780).toFixed(2)+','+(8+(h.best-min)/range*48).toFixed(2));
  $('history-path').setAttribute('d','M'+coords.join(' L')+(valid.length===1?' l12,0':''));
  $('history-caption').textContent='1–'+history.at(-1).generation+'세대 · 동일한 정지 출발 조건 평가 · 최고 '+champion.generation+'세대 / '+champion.variantLabel+' / 단계 '+E.CATEGORIES.map(c=>champion.levels[c.id]).join('·');
 }else{$('history-path').setAttribute('d','');$('history-caption').textContent=history.length?'완주 기록이 없습니다. 다음 세대에서 세팅을 다시 탐색합니다.':'첫 세대를 평가하면 기록 변화가 나타납니다.';}
}
function recordEvaluation(results,completedGeneration=generation){
 const best=results.find(c=>c.finished),record={generation:completedGeneration,best:best?.finishTime??null,variantLabel:best?.entrant.variantLabel||'',levels:{...best?.entrant.levels},uid:best?.entrant.uid,finishers:results.filter(c=>c.finished).length};
 const index=history.findIndex(h=>h.generation===completedGeneration);if(index<0)history.push(record);else history[index]=record;
 return best;
}
function finishGeneration(){
 if(recorded||!race.finished)return;recorded=true;fast=false;running=false;
 const best=recordEvaluation(session.completeEvaluation());
 if(stockMode()){tell(best?'출고 상태 비교 완료 · '+best.entrant.variantLabel+' · '+fTime(best.finishTime):'출고 상태 비교에서 완주 차량이 없습니다.');return;}
 tell(best?generation+'세대 평가 완료 · #'+(best.index+1)+' '+best.entrant.variantLabel+' · '+fTime(best.finishTime)+' — 우수 세팅을 보존하고 다음 세대를 만들 수 있습니다.':'이번 세대는 완주 차량이 없습니다. 주행 거리를 기준으로 다음 세대를 선발합니다.');
}
function nextGeneration(auto=false){
 if(stockMode())return;
 if(!race.finished)return;finishGeneration();
 const next=E.breed(population,session.completeEvaluation(),{seed:(seedValue()+Math.imul(generation+1,104729))>>>0,generation:generation+1});generation++;population=next;
 prepareRace(generation+'세대 · 우수 세팅 보존 + 교배·돌연변이로 새 튜닝을 만들었습니다.');
 if(auto){running=true;updateUI();}
}
function updateUI(){
 if(!race)return;const order=race.standings(),car=watching(),leader=order[0],spec=car.spec,p=car.entrant,stock=stockMode();
 updatePowertrainHUD(car);
 $('start').textContent=race.finished?(stock?'↺ 같은 구성 재주행':'↺ 같은 세대 재주행'):running?'Ⅱ 일시정지':race.time>0?'▶ 계속 달리기':'▶ 레이스 시작';
 $('reset').textContent=stock?'↻ 같은 구성 재주행':'↻ 같은 세대 재주행';
 $('start').setAttribute('aria-pressed',String(running));$('step').disabled=race.finished;$('evaluate').disabled=race.finished||fast;$('evaluate').textContent=fast?'평가 중…':stock?'출고 성능 빠른 평가':'이번 세대 빠른 평가';
 $('next-generation').disabled=stock||!race.finished;$('race-status').textContent=race.finished?(stock?'출고 비교 완료':'세대 평가 완료'):fast?'빠른 평가 중':running?'● 레이스 진행 중':race.time>0?'일시정지':'출발 준비';
 $('time-stat').textContent=race.time>0?fTime(race.time):'00:00.000';$('lap-stat').textContent=Math.min(race.laps,leader.lap+1)+' / '+race.laps;
 $('best-stat').textContent=fTime(Math.min(...race.cars.map(c=>c.bestLap||Infinity)));$('finish-stat').textContent=race.cars.filter(c=>c.finished).length+' / '+race.cars.length;
 const focus=$('standings').contains(document.activeElement)?document.activeElement:null;
 order.forEach((c,i)=>{const row=$('standings').querySelector('[data-car="'+c.id+'"]');row.classList.toggle('selected',c.id===car.id);row.querySelector('button').setAttribute('aria-pressed',String(c.id===car.id));row.querySelector('.rank').textContent=i+1;row.children[1].textContent=(c.speed*3.6).toFixed(0)+' km/h';row.children[2].textContent=c.dnf?'중단':c.finished?'완주':Math.min(race.laps,c.lap+1)+' / '+race.laps;row.children[3].textContent=fTime(c.bestLap);row.children[4].textContent=c.dnf?c.distance.toFixed(0)+' m':c.finished?fTime(c.finishTime):i===0?'LEADER':'+'+Math.max(0,(leader.distance/leader.trackLength-c.distance/c.trackLength)*race.track.centerlineLength).toFixed(0)+' m';if($('standings').children[i]!==row)$('standings').insertBefore(row,$('standings').children[i]||null);});
 if(focus&&document.activeElement!==focus)focus.focus({preventScroll:true});
 $('watch-number').textContent=String(car.index+1).padStart(2,'0');$('watch-name').textContent=vehicles.find(v=>v.id===car.vehicleId).name;$('drive-stat').textContent={fwd:'전륜',rwd:'후륜',awd:'사륜'}[spec.factoryDrive]||spec.factoryDrive;
 $('trim-stat').textContent=p.variantLabel;$('velocity-stat').textContent=(car.speed*3.6).toFixed(0);
 const phase=car.dnf?'dnf':car.finished?'finished':race.time===0?'ready':car.phase;
 $('phase-stat').textContent={ready:'출발 준비',finished:'완주',dnf:'주행 중단',accelerating:'가속 중',braking:'감속 중',cornering:'코너링',cruising:'속도 유지'}[phase]||'주행 중';$('phase-stat').dataset.phase=phase;
 $('car-progress').style.width=(car.finished?100:(car.distance%car.trackLength)/car.trackLength*100)+'%';$('power-stat').textContent=Math.round(car.powerPs)+' PS';$('mass-stat').textContent=Math.round(car.massKg).toLocaleString('ko-KR')+' kg';$('torque-stat').textContent=Math.round(car.torqueNm)+' Nm';$('last-lap-stat').textContent=fTime(car.lapTimes.at(-1));
 const pos=race.sampleForCar(car,car.distance);$('elevation-stat').textContent=pos.elevation==null?'—':pos.elevation.toFixed(1)+' m';$('grade-stat').textContent=race.track.hasElevation?(pos.grade>=0?'+':'−')+Math.abs(pos.grade*100).toFixed(1)+'%':'—';
 const cursor=car.finished?1000:(car.distance%car.trackLength)/car.trackLength*1000;$('elevation-cursor').setAttribute('x1',cursor);$('elevation-cursor').setAttribute('x2',cursor);
 $('vehicle-source').href=spec.sourceUrl||(window.CircuitVehicleSpecs||VehicleSpecs)[car.vehicleId].sourceUrl;$('vehicle-source').textContent='출고 사양 출처 ↗';
 if(imageId!==car.vehicleId){imageId=car.vehicleId;const art=VehicleArtwork[imageId];
  if(art){const [x,y,w,h]=art.bounds;$('car-image').innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[x-15,y-15,w+30,h+30].join(' ')+'"><image href="../evolving_vehicles/'+art.file+'" width="'+art.width+'" height="'+art.height+'"/></svg>';}
  else if(ManufacturerModels.requiresAsset(imageId)){const image=document.createElement('img');image.src='assets/reference/'+imageId+'-model-preview.png';image.alt='';image.style.cssText='width:100%;height:100%;object-fit:contain';$('car-image').replaceChildren(image);}
  else $('car-image').replaceChildren();
 }
 updateTuning(car);historyUI();
}
function updatePowertrainHUD(car){
 const t=car.telemetry,hud=$('powertrain-hud');hud.hidden=!t||t.kind==='electric';
 if(hud.hidden)return;
 $('powertrain-car').textContent='#'+String(car.index+1).padStart(2,'0')+' '+(vehicles.find(v=>v.id===car.vehicleId)?.name||car.name);
 hud.dataset.kind=t.kind;const stopped=car.finished||car.dnf,gear=stopped?'—':t.gearLabel;
 $('gear-value').textContent=gear;$('gear-value').dataset.wide=String(gear.length>1);
 const lamps=stopped?0:t.shiftLights,cue=!stopped&&t.shiftCue,rpm=stopped?0:Math.round(t.rpmNormalized*100);
 [...$('shift-lights').children].forEach((lamp,i)=>lamp.classList.toggle('lit',i<lamps));
 $('shift-lights').setAttribute('aria-valuenow',rpm);$('shift-lights').setAttribute('aria-valuetext',stopped?'주행 종료':cue?'변속 시점':lamps+'개 신호등 점등');
 $('shift-cue').textContent=cue?'변속':t.gear===null?'회전 신호':'변속 신호';$('shift-cue').classList.toggle('shift-ready',cue);
 $('hybrid-flow').hidden=t.kind!=='hybrid';
 const flow=stopped?0:Math.max(-1,Math.min(1,t.battery?.flow||0)),mode=flow<0?'charging':flow>0?'using':'idle',label={charging:'충전 중',using:'사용 중',idle:'대기'}[mode];
 $('hybrid-flow').dataset.mode=mode;$('battery-mode').textContent=label;
 $('charge-fill').style.width=(Math.max(0,-flow)*100).toFixed(1)+'%';$('use-fill').style.width=(Math.max(0,flow)*100).toFixed(1)+'%';
 $('battery-flow').setAttribute('aria-valuenow',Math.round(flow*100));$('battery-flow').setAttribute('aria-valuetext',label);
}
function simulate(seconds){
 const transitions=session.step(seconds,{watchId:watch,auto:$('auto-evolve').checked&&(running||fast)});
 if(transitions.length){
  if(fast){fast=false;running=true;}
  for(const t of transitions)recordEvaluation(t.results,t.completedGeneration);
  generation=session.generation;stockRun=session.stockRun;population=session.population;
  prepareRace(stockMode()?'출고 상태 '+stockRun+'회차 · 출발선에서 0 km/h로 다음 측정을 시작합니다.':generation+'세대 · 출발선에서 0 km/h로 다음 측정을 시작합니다.',true,true);
 }
 if(race.finished)finishGeneration();
}
function toggle(){fast=false;if(race.finished)prepareRace(stockMode()?'같은 출고 사양으로 다시 달립니다.':'같은 세대와 같은 튜닝으로 다시 달립니다.',true);running=!running;lastFrame=null;updateUI();}
function frame(timestamp){
 const before=race.time;
 const delta=lastFrame===null?0:Math.min((timestamp-lastFrame)/1000,.1);lastFrame=timestamp;
 if(!manual){if(fast)simulate(12);else if(running)simulate(delta*Number($('speed').value));}
 if(Math.abs(lastUI-race.time)>.12||race.finished&&lastUI!==race.time){updateUI();lastUI=race.time;}
 const cameraMoved=renderer.advanceCamera(delta,{watch,snap:fast||manual});
 if(running||fast||before!==race.time||cameraMoved)draw();requestAnimationFrame(frame);
}
async function fullscreen(){
 try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage').classList.contains('fullscreen-fallback'))$('stage').classList.remove('fullscreen-fallback');else if($('stage').requestFullscreen)await $('stage').requestFullscreen();else $('stage').classList.add('fullscreen-fallback');}catch(_){$('stage').classList.toggle('fullscreen-fallback');}renderer.resize();draw();
}
$('start').addEventListener('click',toggle);
$('step').addEventListener('click',()=>{running=false;fast=false;simulate(1);renderer.advanceCamera(0,{watch,snap:true});updateUI();draw();});
$('reset').addEventListener('click',()=>prepareRace(stockMode()?'같은 출고 사양으로 다시 배치했습니다.':'같은 세대의 출고 사양과 튜닝으로 다시 배치했습니다.',true));
$('evaluate').addEventListener('click',()=>{if(race.finished)return;running=false;fast=true;lastFrame=null;updateUI();});
$('next-generation').addEventListener('click',()=>nextGeneration(false));$('auto-evolve').addEventListener('change',()=>{const enabled=$('auto-evolve').checked;if(stockMode())autoStockRepeat=enabled;else autoEvolution=enabled;});
$('population-size').addEventListener('change',()=>{if(!stockMode()){paidPopulationSize=Number($('population-size').value);experiment();}});
for(const id of ['vehicle-model','budget','seed','circuit','laps','surface'])$(id).addEventListener('change',()=>experiment());
$('circuit-quick').addEventListener('change',()=>{$('circuit').value=$('circuit-quick').value;experiment('서킷을 바꾸어 새 실험을 시작합니다.');});
$('reroll').addEventListener('click',()=>{$('seed').value=(seedValue()+104729)%2147483646||1;experiment('새 시드로 출고 사양과 튜닝 조합을 추첨했습니다.');});
$('speed').addEventListener('change',()=>{lastFrame=null;});
['overview','follow','top','eau-rouge','pits'].forEach(id=>$(id).addEventListener('click',()=>setCamera(id)));
$('zoom-in').addEventListener('click',()=>{renderer.zoom(1.4);draw();});$('zoom-out').addEventListener('click',()=>{renderer.zoom(1/1.4);draw();});
$('orbit-mode').addEventListener('click',()=>renderer.setInteractionMode('orbit'));
$('pan-mode').addEventListener('click',()=>renderer.setInteractionMode('pan'));
$('recenter').addEventListener('click',()=>renderer.recenter());
$('show-line').addEventListener('change',draw);$('fullscreen').addEventListener('click',fullscreen);
function setViewMenu(open,restoreFocus=false){$('map-controls').classList.toggle('is-open',open);$('view-menu-toggle').setAttribute('aria-expanded',String(open));if(restoreFocus)$('view-menu-toggle').focus();}
$('view-menu-toggle').addEventListener('click',()=>setViewMenu($('view-menu-toggle').getAttribute('aria-expanded')!=='true'));
$('map-controls').addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!['zoom-in','zoom-out'].includes(button.id))setViewMenu(false,true);});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#map-controls,#view-menu-toggle'))setViewMenu(false);});

document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&$('view-menu-toggle').getAttribute('aria-expanded')==='true'){event.preventDefault();setViewMenu(false,true);return;}
 if(event.key==='Escape'&&document.fullscreenElement){event.preventDefault();document.exitFullscreen().catch(()=>{});}
 if(event.key==='Escape'&&$('stage').classList.contains('fullscreen-fallback')){$('stage').classList.remove('fullscreen-fallback');renderer.resize();draw();}
 if(event.target.closest('input,select,textarea,button,a,summary,[contenteditable]')||event.ctrlKey||event.metaKey||event.altKey)return;
 if(event.code==='Space'){event.preventDefault();toggle();}if(event.key.toLowerCase()==='f'){event.preventDefault();fullscreen();}
 if(document.activeElement===canvas&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const dx=event.key==='ArrowLeft'?-25:event.key==='ArrowRight'?25:0,dy=event.key==='ArrowUp'?-18:event.key==='ArrowDown'?18:0;if(event.shiftKey||renderer.getState().interactionMode==='pan')renderer.pan(dx,dy);else renderer.orbit(dx,dy);draw();}
});
document.addEventListener('fullscreenchange',()=>{renderer.resize();draw();});document.addEventListener('visibilitychange',()=>{lastFrame=null;});new ResizeObserver(()=>{renderer.resize();draw();}).observe($('stage'));
new ResizeObserver(entries=>{for(const entry of entries)$('stage').style.setProperty('--powertrain-hud-height',entry.target.getBoundingClientRect().height+'px');}).observe($('powertrain-hud'));
window.advanceTime=milliseconds=>{
 manual=true;let seconds=Math.max(0,Math.min(Number(milliseconds)||0,3600000))/1000;
 while(seconds>1e-7){const chunk=Math.min(seconds,.25);if(fast||running)simulate(chunk*(fast?256:Number($('speed').value)));else break;seconds-=chunk;}
 renderer.advanceCamera(0,{watch,snap:true});updateUI();draw();
};
window.render_game_to_text=()=>JSON.stringify({
 mode:race.finished?'finished':fast?'evaluating':running?'racing':race.time>0?'paused':'ready',
 watchTelemetry:watching().telemetry,
 patrolLights:renderer.getPatrolInfo?.()||[],
 coordinateSystem:'3D local metres: x east, y south, elevation AMSL. Performance-dependent per-car racing paths. Independent ghosts. Centre-aligned standing starts.',
 evaluation:{start:'standing',complete:session.evaluationRace.finished,automaticBlocked:session.automaticBlocked},
 guidance:window.RacingGuidance?.preview(race,watching(),[watching().distance])[0],
 guidanceArrows:renderer.guidanceArrows||[],
 visualPath:DrivingPose.info(race,watching()),environment:renderer.environment?.stats||null,pitFacilities:renderer.pits?.stats||null,elevationProfile:race.track.elevationProfile||null,
 circuit:currentCircuit().id,vehicleId:$('vehicle-model').value,generation,seed:seedValue(),budget:Number($('budget').value),stockComparison:stockMode(),stockRun,lengthM:race.track.length,centerlineLengthM:race.track.centerlineLength||currentCircuit().lengthM,time:+race.time.toFixed(3),laps:race.laps,surface:race.surface,playback:Number($('speed').value),autoEvolve:!stockMode()&&$('auto-evolve').checked,autoRepeat:stockMode()&&$('auto-evolve').checked,watch,camera:renderer.getState(),showLine:$('show-line').checked,history:history.slice(-30),elevation:{available:race.track.hasElevation,minM:race.track.elevationMin,maxM:race.track.elevationMax},
 cars:race.standings().map((c,i)=>{const p=race.sampleForCar(c,c.distance),v=DrivingPose.sampleCar(race,c),e=c.entrant;return{id:c.id,uid:e.uid,vehicleId:c.vehicleId,variantId:e.variantId,variantLabel:e.variantLabel,position:i+1,levels:e.levels,credits:e.credits,cost:e.cost,budget:e.budget,maxLevels:e.maxLevels,massKg:c.massKg,powerPs:c.powerPs,drive:c.spec.factoryDrive,frontWeightFraction:c.spec.frontWeightFraction,x:+p.x.toFixed(2),y:+p.y.toFixed(2),elevationM:p.elevation,grade:p.grade,distanceM:+c.distance.toFixed(2),trackLengthM:c.trackLength,lineModel:c.racingLine?.method,linePerformance:c.racingLine?.performance,visual:{x:v.x,y:v.y,angle:v.angle},standingStart:c.standingStartDistance!==null,speedKmh:+(c.speed*3.6).toFixed(1),bestLap:c.bestLap,finished:c.finished,finishTime:c.finishTime,dnf:c.dnf};})
});
experiment();renderer.resize();draw();requestAnimationFrame(frame);
})();
