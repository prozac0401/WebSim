(() => {
  'use strict';
  const data=DriftTrackResearch,$=id=>document.getElementById(id);
  const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  function timestamp(seconds){const parts=[Math.floor(seconds/60)%60,Math.floor(seconds)%60].map(n=>String(n).padStart(2,'0'));if(seconds>=3600)parts.unshift(String(Math.floor(seconds/3600)));return parts.join(':');}
  function link(sourceId,seconds){const source=data.sources[sourceId],a=el('a',seconds===undefined?source.title:timestamp(seconds)+' ↗'),url=new URL(source.url);if(seconds!==undefined)url.searchParams.set('t',Math.floor(seconds)+'s');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';if(seconds!==undefined)a.setAttribute('aria-label',source.title+' '+timestamp(seconds)+' 장면');return a;}
  const metres=value=>Number(value).toLocaleString('ko-KR',{maximumFractionDigits:1})+'m';
  function fact(label,value){const node=el('div',undefined,'fact');node.append(el('dt',label),el('dd',value));return node;}
  function show(id){
    const c=data.candidates.find(x=>x.id===id)||data.candidates[0],panel=$('candidate');panel.replaceChildren();
    for(const button of $('candidate-tabs').children)button.setAttribute('aria-pressed',String(button.dataset.id===c.id));
    const researchIndex=data.candidates.filter(x=>!x.playable).findIndex(x=>x.id===c.id)+1;
    panel.append(el('p',c.playable?'실행 가능 / 실제 대회 구간 재구성':'추가 조사 '+researchIndex+' / 주행 미등록','eyebrow'),el('h2',c.name),el('p',c.subtitle+' · '+c.event.dates.join(' ~ '),'event-date'),el('p',c.reason,'candidate-reason'));
    if(c.playable){const launch=el('a','이 코스에서 실험하기 →');launch.href='evolving_drift.html?track='+encodeURIComponent(c.id);panel.append(launch);}
    const facts=el('dl',undefined,'facts');facts.append(fact('도면 상태',c.mapStatus));
    if(c.playable){facts.append(fact('재구성 주행 길이',metres(c.courseLengthM)),fact('모형 채점 길이',metres(c.judgedLengthM)),fact('도로 폭 · 추정',metres(c.widthEstimateM)),fact('고도차 · 90m DEM 근사',metres(c.heightRangeM)),fact('공식 경기 거리·채점 좌표','실측값 미확인'));}
    else facts.append(fact('드리프트 구간 길이',c.lengthStatus||'미확정'),fact('드리프트 구간 고저차',c.elevationStatus||'미확정'));
    panel.append(facts,el('p',c.reuse,'reuse'));
    if(c.inspectionMethod)panel.append(el('p',c.inspectionMethod,'caveat'));
    if(c.videoCaveat)panel.append(el('p',c.videoCaveat,'caveat'));
    const wrap=el('div',undefined,'table-wrap'),table=el('table');table.append(el('caption','영상에서 확인한 외형'));
    const head=el('thead'),row=el('tr');for(const title of ['요소','보이는 사실','아직 확인하지 못한 부분','원본 장면']){const th=el('th',title);th.scope='col';row.append(th);}head.append(row);table.append(head);
    const body=el('tbody');for(const item of c.observations){const tr=el('tr'),ref=el('td');for(const second of item.seconds){if(ref.childNodes.length)ref.append(el('br'));ref.append(link(item.source,second));}tr.append(el('td',item.feature),el('td',item.observed),el('td',item.unknown),ref);['요소','보이는 사실','아직 확인하지 못한 부분','원본 장면'].forEach((label,i)=>tr.children[i].dataset.label=label);body.append(tr);}table.append(body);wrap.append(table);panel.append(wrap);
    panel.append(el('h3',c.playable?'복원 범위와 남은 확인 항목':'주행 코스 등록 전에 필요한 자료'));const missing=el('ul',undefined,'missing');for(const text of c.missingEvidence)missing.append(el('li',text));panel.append(missing,el('h3','대회·시설·영상 출처'));
    const refs=el('div',undefined,'source-links');for(const id of c.sources)refs.append(link(id));panel.append(refs);
    if(c.event.roundSource)panel.append(el('p','라운드 번호 근거: '+c.event.roundSource,'asof'));
    history.replaceState(null,'','#'+c.id);
  }
  for(const c of data.candidates){const b=el('button',(c.playable?'실행 · ':'조사 · ')+c.name);b.type='button';b.dataset.id=c.id;b.addEventListener('click',()=>show(c.id));$('candidate-tabs').append(b);}
  $('visual-method').textContent=data.visualMethod;
  $('research-count').textContent='자료 확인 '+data.reviewedAt.replaceAll('-','.')+' · 실행 코스 '+data.candidates.filter(c=>c.playable).length+'개 · 추가 조사 '+data.candidates.filter(c=>!c.playable).length+'개';
  show(location.hash.slice(1));
})();
