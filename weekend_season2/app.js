(function () {
  'use strict';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const displayText = value => String(value ?? '').replace(/(-?\d[\d,]*(?:\.\d+)?)\s*원/g, (_, n) => S2Data.formatMoney ? S2Data.formatMoney(Math.round(Number(n.replace(/,/g,'')))) : `${Number(n.replace(/,/g,''))/10000}만원`).replace(/(\d+(?:\.\d+)?)\s*만\s*원/g,'$1만원');
  const escape = value => displayText(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = value => S2Data.formatMoney ? S2Data.formatMoney(Math.round(Number(value) || 0)) : `${Math.round(Number(value) || 0) / 10000}만원`;
  const moneyFields = ['salary','externalAllowance','personalBudget','fixedCosts','startCash','cardLimit','monthlyRent','housingLoanPrincipal','housingMaintenance'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const icons = { walk: '🌿', run: '👟', pt: '🏋', photo: '📷', cook: '🍳', pottery: '🏺', draw: '🎨', music: '🎸', read: '📖', friends: '☕', haircut: '✂', rest: '🛋', chores: '🧺', care: '🧸', study: '✍', overtime: '💼', research: '🔬', jobstudy: '📋', volunteer: '🤝', garden: '🌱', cleaning:'🧹',culture:'🎭',cinema:'🎬',family_time:'🏡',haircut_men:'✂',haircut_women:'✂',perm:'〰',dye:'🎨',delivery:'🚲',parttime:'🛍',sideproject:'💡' };
  const presetIcons = { worker: '💼', seeker: '🌱', graduate: '📚', caregiver: '🏡' };
  const labels = { morning: '오전', afternoon: '오후', evening: '저녁' };
  const publicStats = [['health','건강'],['happiness','행복'],['knowledge','지식'],['mood','기분'],['relationship','대인관계'],['family','가족관계']];
  const directions = [['balanced','🌿','균형','할 일과 좋아하는 일, 휴식을 나눠 담아요.'],['hobby','🎨','취미','좋아하는 취미에 시간을 내요.'],['rest','☁','휴식','잠시 속도를 늦추고 쉬어 가요.'],['selfdev','📖','자기계발','생활 역할에 맞춰 공부와 목표를 이어가요.'],['social','☕','친구','사람을 만나고 이야기를 나눠요.'],['family','🏡','가족','가족과 함께할 시간을 마련해요.'],['home','🧺','집안일','집을 돌보고 일상을 정돈해요.'],['health','👟','건강','가볍게 몸을 움직이고 회복해요.']];
  const directionIds = directions.map(item=>item[0]);
  const maritalLabels = {single:'미혼',married:'기혼',divorced:'이혼',widowed:'사별',unspecified:'혼인 미설정'};
  const setupGender = value => value==='man'||value==='male'?'man':'woman';
  const genderLabel = value => setupGender(value)==='man'?'남성':'여성';
  const familyText = c => `${maritalLabels[c.maritalStatus]||'혼인 미설정'} · ${c.children?`자녀 ${c.children}명`:'자녀 없음'}`;
  const roleLabels = { worker: '직장인', seeker: '구직자', graduate: '대학원생', caregiver: '돌봄 중심' };
  const provinceLabel = id => S2Data.provinceLabel(id);
  const residenceLabel = c => S2Data.residenceLabel(c);
  const incomeLabel = c => c.economicProfile?'한 달 가계 수입':c.incomeOrigin?.kind==='wage'?'월 환산 급여':c.incomeOrigin?.kind==='support-model'?'월 생활비':'월 수입';
  const housingLabels = { studio: '작은 원룸', apartment: '아파트', shared: '함께 사는 집' };
  const tenureLabels = {own:'자가',rent:'월세',jeonse:'전세',unspecified:'이전 주거 설정'};
  function housingCosts(c) { try{return S2Finance.housingCosts(c);}catch(error){if(!(error instanceof RangeError))throw error;return {tenure:c.housingTenure,rent:0,interest:0,maintenance:0,total:0,loanPrincipal:0,rateBps:0,invalid:true};} }
  function monthlyCosts(c) { try{return S2Finance.monthlyCosts(c);}catch(error){if(!(error instanceof RangeError))throw error;return {living:0,housing:0,rent:0,interest:0,maintenance:0,total:0,invalid:true};} }
  const livingCostLabel = c => c.housingTenure==='unspecified'?'기존 고정비 · 주거비 포함':'주거비를 뺀 생활비';
  const housingLoanName = c => ({own:'은행 주택담보대출',jeonse:'은행 전세자금대출',rent:'은행 보증금대출'}[c.housingTenure]||'은행 주거대출');
  function housingLine(c) {
    const h=housingCosts(c);if(h.invalid)return '주거비 입력값을 확인해 주세요.';
    if(h.tenure==='unspecified')return '이전 주거 설정 · 주거비는 기존 고정비에 포함';
    const parts=[...(h.tenure==='rent'?[`월세 ${money(h.rent)}`]:[]),...(h.loanPrincipal>0?[`은행대출 이자 ${money(h.interest)}`]:[]),`관리비 ${money(h.maintenance||0)}`];
    return `${tenureLabels[h.tenure]} · 월 주거비 ${money(h.total)}\n${h.loanPrincipal===0&&h.tenure!=='rent'?'대출 없이 ':''}${parts.join(' + ')}`;
  }
  function housingLoanNote(c) {
    const h=housingCosts(c);if(h.invalid)return '대출 금액과 연이율을 확인해 주세요.';
    if(h.tenure==='unspecified')return '이전 저장에는 별도의 은행 대출이 설정되어 있지 않아요.';
    if(h.loanPrincipal===0)return '은행 대출은 없어요. 대출 이자는 나가지 않아요.';
    return `${housingLoanName(c)} 잔액 ${money(h.loanPrincipal)} · 연 ${(h.rateBps/100).toFixed(2)}%. 원금은 그대로 남고 매달 이자 ${money(h.interest)}를 내요.`;
  }
  function housingCaption(c) { return (housingLabels[c.housing]||'나의 작은 집')+(c.housingTenure&&c.housingTenure!=='unspecified'?' · '+tenureLabels[c.housingTenure]:''); }
  const activities = S2Data.ACTIVITIES;
  const presets = S2Data.PRESETS;
  let state = null, presetId = presets[0].id, config = clone(presets[0].config), selected = 'walk', payment = 'cash', tab = 'planner', filter = 'all', noticeTimer, lastPhase = 'setup', replayIndex = 0, replayEntries = [];
  // New visits use the current Korean year within the selectable season range.
  let saveAvailable = false, chosenYear = Math.min(2100,Math.max(2026,Number(plannerToday().slice(0,4))));
  let life = null, autoPlaying = false, autoWaiting = false, autoNarration = [], autoTimer = null, autoBusy = false, direction = 'balanced', autoNote = '', sceneActivity = 'rest';
  const openPanels = new Set();
  let autoCategory='all',setupCategory='all';
  function refreshSetupName() {
    if(!S2Data.assignPersonaName||!Number.isInteger(config.age)||config.age<18||config.age>100)return;
    const previous=config.personaName;S2Data.assignPersonaName(config);
    if(previous&&config.lifeIntro?.startsWith(previous+','))config.lifeIntro=config.personaName+config.lifeIntro.slice(previous.length);
  }
  function normalizeSetupGenders() {
    // This is a new editable setup, never a loaded life's historical state.
    config.gender=setupGender(config.gender);
    config.childProfiles=S2Data.getChildren(config).map(child=>({...child,gender:setupGender(child.gender)}));
  }
  function freshLife() {
    const values = new Uint32Array(1);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(values); else values[0] = Date.now() >>> 0;
    life = S2Data.generateLife ? S2Data.generateLife(values[0]) : {presetId:presets[0].id,config:{...clone(presets[0].config),personaName:'서윤',maritalStatus:'single'},name:'서윤',intro:'작은 취미와 일 사이에서 새로운 일 년을 시작합니다.'};
    presetId = life.presetId; config = clone(life.config);config.year=chosenYear;normalizeSetupGenders();
    config.personaName = config.personaName || life.name;
    config.lifeIntro = config.lifeIntro || life.intro;
    refreshSetupName();
  }
  freshLife();
  try { const saved = S2Storage.load(); if (saved.ok && saved.state) saveAvailable = true; } catch (_) { /* An unavailable browser store does not prevent play. */ }
  function activity(id) { return activities.find(a => a.id === id); }
  function roleReason(id,c=state?.config||config) { return S2Data.activityReason(c,id); }
  function price(id) { return S2Data.activityPrice ? S2Data.activityPrice(state?.config||config,id) : {amount:activity(id)?.cost||0,basis:'게임 설정',label:'게임용 비용',note:''}; }
  function autoReason(id,c=state?.config||config) { return activity(id)?.manualOnly?'직접 추가하는 활동이에요. 자동 계획에서는 고르지 않아요.':roleReason(id,c); }
  function activityMeta(a) { return [a?.parenting?`${a.parenting.minAge}~${a.parenting.maxAge}세 자녀`:null,a?.cadence?.label,a?.manualOnly?'직접 추가':null,a?.procedure?.minIntervalDays?'최소 '+a.procedure.minIntervalDays+'일 간격':null,a?.procedure?.oncePerLife?'한 삶에 한 번':null,a?.procedure?'회복 '+a.procedure.recoveryDays+'일':null].filter(Boolean).join(' · '); }
  function visibleActivities(c=state?.config||config) {return activities.filter(a=>!a.parenting||!roleReason(a.id,c));}
  function categoryLabel(category,c=state?.config||config) {return category.id==='parenting'&&!visibleActivities(c).some(a=>a.parenting)?'가족·지인 돌봄':category.label;}
  function categoryMatches(category,value) {return value==='all'||category.id===value||category.groupId===value;}
  function categorySelectHTML(id,value,c=state?.config||config) {
    const available=visibleActivities(c);
    if(!['all',...S2Data.ACTIVITY_GROUPS.map(group=>group.id),...S2Data.ACTIVITY_CATEGORIES.filter(category=>available.some(a=>a.categoryId===category.id)).map(category=>category.id)].includes(value))value='all';
    return `<label class="field category-picker">범주로 찾아보기<select id="${id}"><option value="all"${value==='all'?' selected':''}>모두 보기</option>${S2Data.ACTIVITY_GROUPS.map(group=>`<optgroup label="${group.label}"><option value="${group.id}"${value===group.id?' selected':''}>${group.label} 모두</option>${S2Data.ACTIVITY_CATEGORIES.filter(category=>category.groupId===group.id&&available.some(a=>a.categoryId===category.id)).map(category=>`<option value="${category.id}"${value===category.id?' selected':''}>${escape(categoryLabel(category,c))}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
  }
  function groupedActivitiesHTML(renderer,c,chosen,value,gridClass) {
    const available=visibleActivities(c);
    return S2Data.ACTIVITY_GROUPS.map(group=>{
      const categories=S2Data.ACTIVITY_CATEGORIES.filter(category=>category.groupId===group.id&&available.some(a=>a.categoryId===category.id));
      return `<section class="activity-kind" data-activity-group="${group.id}"${categories.some(category=>categoryMatches(category,value))?'':' hidden'}><h3>${group.label}</h3>${categories.map(category=>{const items=available.filter(a=>a.categoryId===category.id);return `<section class="activity-category" data-activity-category="${category.id}"${categoryMatches(category,value)?'':' hidden'}><div class="category-heading"><h4>${escape(categoryLabel(category,c))}</h4><span>${items.filter(a=>chosen.includes(a.id)).length}개 선택</span></div><div class="${gridClass}">${items.map(renderer).join('')}</div></section>`;}).join('')}</section>`;
    }).join('');
  }
  function applyCategoryFilter(container,value) {
    if(!container)return;
    $$('[data-activity-category]',container).forEach(section=>{const category=S2Data.ACTIVITY_CATEGORIES.find(item=>item.id===section.dataset.activityCategory);section.hidden=!categoryMatches(category,value);});
    $$('[data-activity-group]',container).forEach(section=>{section.hidden=!$$('[data-activity-category]',section).some(category=>!category.hidden);});
  }
  function setupPreferencesHTML() {
    return groupedActivitiesHTML(a=>`<label class="preference"><input type="checkbox" name="preferences" value="${escape(a.id)}"${(config.preferences||[]).includes(a.id)?' checked':''}${autoReason(a.id,config)&&!(config.preferences||[]).includes(a.id)?' disabled':''}>${icon(a.id)} ${escape(a.name)}${activityMeta(a)?` <small>${escape(activityMeta(a))}</small>`:''}</label>`,config,config.preferences||[],setupCategory,'preferences');
  }
  function activityOptionsHTML(chosen=selected,recurring=false) {
    const available=visibleActivities().filter(a=>!recurring||!a.parenting);
    return S2Data.ACTIVITY_CATEGORIES.map(category=>{const items=available.filter(a=>a.categoryId===category.id),group=S2Data.ACTIVITY_GROUPS.find(item=>item.id===category.groupId);return items.length?`<optgroup label="${group.label} · ${escape(categoryLabel(category))}">${items.map(a=>`<option value="${a.id}"${a.id===chosen?' selected':''}${roleReason(a.id)?' disabled':''}>${icon(a.id)} ${escape(a.name)}${activityMeta(a)?' · '+escape(activityMeta(a)):''} · ${roleReason(a.id)?escape(roleReason(a.id)):money(price(a.id).amount)}</option>`).join('')}</optgroup>`:'';}).join('');
  }
  function cadenceHTML(id) {
    const a=activity(id);if(!a?.cadence)return '';
    const status=state?S2Engine.activityCadence(state,id):null;
    return `<p class="activity-cadence" data-cadence="${escape(id)}"><strong>미용실 주기 · ${escape(a.cadence.label)}</strong>${status&&!status.allowed&&status.nextDate?`<br>다음 자동 추천은 ${dateText(status.nextDate,true)}부터예요.`:'<br>자동 생활은 이 간격보다 자주 추천하지 않아요.'}<span>커트 종류는 같은 주기를 공유해요. 직접 정한 일정은 따로 조정할 수 있어요.</span></p>`;
  }
  function specialOutingHTML(id) {
    const a=activity(id);if(!a?.manualOnly||a.procedure)return '';
    const r=a.risk;
    return `<p class="activity-cadence" data-manual-only="${escape(id)}"><strong>이번 주에 직접 추가하는 특별 일정</strong><br>활동 ${a.minutes}분 + 준비 ${a.prep}분 + 왕복 이동시간이 필요해요. 자동 생활은 임의로 넣지 않아요.</p>${r?`<div class="activity-risk" data-activity-risk="${escape(id)}"><strong>사고가 나면 수리비·병원비가 추가돼요</strong><p>1회 사고 확률 ${Math.round(r.chance*100)}% · 수리비 ${money(r.repairMin)}~${money(r.repairMax)} · 병원비 ${money(r.medicalMin)}~${money(r.medicalMax)}</p><p>활동비와 별도로 현금에서 내며, 부족한 금액은 미납으로 남아 다음 수입에서 갚아요. 몸 상태와 피로에도 영향이 있어요.</p><small>비용·시간·사고 확률은 게임용 가정입니다.</small></div>`:''}`;
  }
  function procedureHTML(id) {
    const a=activity(id),p=a?.procedure;if(!p)return '';
    const availability=state&&S2Engine.activityAvailability?S2Engine.activityAvailability(state,id):null;
    return `<div class="activity-procedure" data-procedure="${id}"><strong>${escape(a.name)} · 직접 고르는 미용 일정</strong><p>비용 ${money(price(id).amount)} · 시술 ${a.minutes}분 + 준비 ${a.prep}분 + 이동<br>게임 내 관계 +${a.effects.relationship} · 시술 당일과 이후 ${p.recoveryDays}일 동안 야외활동 제한</p><p>${p.minIntervalDays?'최소 4주(28일) 간격으로 다시 받을 수 있어요. ':''}${p.oncePerLife?'이 삶에서는 한 번만 받을 수 있어요. ':''}회복 중에는 산책·달리기·야외 촬영·원예·봉사·배달·여행·골프·서킷 등의 야외 일정을 잡을 수 없어요. 실내 활동과 휴식은 가능해요.</p>${availability&&!availability.allowed?`<p class="procedure-availability">${escape(availability.reason)}</p>`:''}<small>비용·회복 기간·관계 효과는 게임용 설정이며 실제 시술 결과나 의학적 회복 기간이 아니에요.</small></div>`;
  }
  function cosmeticRecoveryHTML() {
    if(!state?.flags?.cosmeticRecoveryUntil||state.flags.cosmeticRecoveryUntil<state.date)return '';
    return `<p class="health-period" data-cosmetic-recovery>${escape(activity(state.flags.cosmeticRecoveryActivity)?.name||'시술')} 후 회복 중 · ${dateText(state.flags.cosmeticRecoveryUntil,true)}까지 야외활동 제한<br>집안일·독서·실내 활동·휴식으로 일정을 채워 보세요.</p>`;
  }
  function incidentNoticeHTML() {
    const incident=state.log.filter(l=>l.type==='incident'&&l.date>=S2Calendar.addDays(state.date,-6)).at(-1);
    return incident?`<aside class="incident-note" role="status"><strong>${dateText(incident.date)} · ${escape(logTitle(incident))}</strong><p>${escape(logDetail(incident))}</p></aside>`:'';
  }
  function parentingTasksHTML() {
    const available=activities.filter(a=>a.parenting&&!roleReason(a.id));if(!available.length)return '';
    const children=S2Data.getChildren(state.config),groups=[...new Set(available.map(a=>a.parenting.group))];
    return `<details id="parenting-tasks" class="parenting-tasks"${openPanels.has('parenting-tasks')?' open':''}><summary>아이와 챙길 일 <span>자녀 나이에 맞춘 육아</span></summary><p class="small-note">함께 사는 자녀의 나이에 맞는 할 일이에요. 기본 돌봄과 겹치는 시간은 한 번만 계산해요. 누르면 이번 주 빈 시간에 담아요.</p>${groups.map(group=>{const items=available.filter(a=>a.parenting.group===group),range=items[0].parenting,n=children.filter(child=>child.militaryStatus!=='serving'&&child.age>=range.minAge&&child.age<=range.maxAge).length;return `<section class="parenting-group" data-parenting-group="${escape(group)}"><h3>${range.minAge}~${range.maxAge}세 · 자녀 ${n}명</h3><div class="parenting-grid">${items.map(a=>`<button type="button" data-parenting-add="${escape(a.id)}"><span aria-hidden="true">${icon(a.id)}</span><strong>${escape(a.name)}</strong><small>${a.minutes}분 · 이번 주에 담기 ＋</small></button>`).join('')}</div></section>`;}).join('')}</details>`;
  }
  function syncSetupActivityChoices() {
    const eligible=visibleActivities(config).map(a=>a.id);
    config.preferences=(config.preferences||[]).filter(id=>eligible.includes(id));
    const picker=$('#setup-category');
    if(picker){
      const holder=document.createElement('div');holder.innerHTML=categorySelectHTML('setup-category',picker.value,config);
      const updated=$('select',holder);setupCategory=updated.value;
      if(picker.innerHTML!==updated.innerHTML)picker.innerHTML=updated.innerHTML;
      picker.value=setupCategory;
    }
    const container=$('#setup-activity-groups');
    if(container&&$$('[name=preferences]',container).map(field=>field.value).join('|')!==eligible.slice().sort((a,b)=>S2Data.ACTIVITY_CATEGORIES.findIndex(category=>category.id===activity(a).categoryId)-S2Data.ACTIVITY_CATEGORIES.findIndex(category=>category.id===activity(b).categoryId)).join('|'))container.innerHTML=setupPreferencesHTML();
    if(container){
      $$('[data-activity-category]',container).forEach(section=>{const count=$('.category-heading span',section);if(count)count.textContent=$$('[name=preferences]:checked',section).length+'개 선택';});
      applyCategoryFilter(container,setupCategory);
    }
    $$('#setup-form [name="preferences"]').forEach(field=>{const reason=autoReason(field.value,config);field.disabled=!!reason&&!field.checked;field.parentElement.title=reason||activity(field.value).description;});
  }
  function priceDetails(id) { const quote=price(id),basisLabel={'regional-survey':'지역 조사값','local-example':'한 매장의 요금 사례','game-estimate':'게임에서 정한 비용','game-assumption':'게임에서 정한 비용','official-price':'공식 안내 가격'}[quote.basis]||'게임에서 정한 비용';return cadenceHTML(id)+specialOutingHTML(id)+procedureHTML(id)+`<details class="price-details"><summary>이 활동의 비용은 어떻게 정했나요?</summary><p>${escape(quote.label||'활동 비용')} · ${money(quote.amount)}<br>${escape(quote.note||'게임 속 생활비이며 실제 예약 가격과 다를 수 있어요.')}</p><p class="small-note">${basisLabel}${quote.observedAt?' · '+escape(quote.observedAt)+' 기준':''}</p><a href="weekend_season2_doc.html#activity-prices">가격 자료와 가정 보기 ↗</a></details>`; }
  function childProfilesHTML() { const children=S2Data.getChildren(config);return `<details id="child-profiles" class="settings-details"${openPanels.has('child-profiles')?' open':''}><summary>자녀를 한 명씩 살펴보기 · ${children.length}명</summary><p class="small-note">나이와 성별, 군 복무 여부를 직접 바꿀 수 있어요. 군 복무는 게임에서 18~35세 남성 자녀에게 선택할 수 있어요. 성별만으로 정하지 않으며 직접 바꿀 수 있어요.</p><div id="child-profile-fields">${children.length?children.map((child,i)=>`<fieldset class="child-profile" data-child-index="${i}"><legend>자녀 ${i+1}</legend><div class="form-grid"><label class="field">나이<input type="number" name="child-age-${i}" value="${child.age}" min="0" max="49" required></label><label class="field">성별<select name="child-gender-${i}">${[['woman','여성'],['man','남성']].map(([value,label])=>`<option value="${value}"${setupGender(child.gender)===value?' selected':''}>${label}</option>`).join('')}</select></label><label class="field">현재 생활<select name="child-military-${i}"${child.age<18||child.age>35||child.gender!=='man'?' disabled':''}><option value="none"${child.militaryStatus!=='serving'?' selected':''}>집에서 생활</option><option value="serving"${child.militaryStatus==='serving'?' selected':''}>군 복무 중</option></select></label></div></fieldset>`).join(''):'<p class="small-note">위에서 자녀 수를 고르면 개별 설정이 나타나요.</p>'}</div></details>`; }
  function icon(id) { return icons[id] || activity(id)?.icon || '✦'; }
  function dateText(date, includeYear = false) { if (!date) return ''; const [y, m, d] = date.split('-').map(Number); return `${includeYear ? y + '년 ' : ''}${m}월 ${d}일`; }
  function weekday(date) { return ['일', '월', '화', '수', '목', '금', '토'][new Date(`${date}T12:00:00Z`).getUTCDay()]; }
  function season(date) { const m = Number((date || '2026-01-01').slice(5, 7)); return m >= 3 && m <= 5 ? '봄 · 새로 자라는 마음' : m >= 6 && m <= 8 ? '여름 · 조금 길어진 하루' : m >= 9 && m <= 11 ? '가을 · 차곡차곡 익는 시간' : '겨울 · 천천히 시작하는 날'; }
  function holidayName(holiday) { return typeof holiday === 'string' ? holiday : Array.isArray(holiday) ? holiday.map(h => h.name || h).join(' · ') : holiday?.name || ''; }
  function householdSize(c) {
    const household=S2Data.LIFECYCLE?.household(c)||c.economicProfile?.household||c.incomeOrigin?.household;
    return typeof household==='number'?household:household?.size??household?.householdSize??(1+(c.maritalStatus==='married'?1:0)+(c.children||0));
  }
  function economyFactsHTML(c) {
    const total=Number(c.salary)+Number(c.externalAllowance),costs=monthlyCosts(c),remaining=total-costs.total;
    return `<span class="life-location">${escape(c.province==='unspecified'?housingLabels[c.housing]:residenceLabel(c))}</span><span>${incomeLabel(c)} ${money(total)}</span><span>${costs.invalid?'금액 확인 중':remaining<0?'생활비 부족 '+money(-remaining):'생활비 후 남음 '+money(remaining)}</span>`;
  }
  function livingCostsHTML(c) {
    const total=Number(c.salary)+Number(c.externalAllowance),costs=monthlyCosts(c),p=c.economicProfile,l=p?.livingCosts;
    if(costs.invalid)return '';
    const current=l&&c.fixedCosts===p.fixedCosts,share=total>0?`${(costs.total/total*100).toFixed(1)}%`:'수입 없음';
    return `<div data-living-costs><div class="money-row"><span>월수입 중 생활비·주거비</span><strong data-living-share>${share}</strong></div>${current?`<div class="money-row"><span>가구 기본 살림</span><strong>${money(l.coreLiving)}</strong></div><div class="money-row"><span>자녀 양육·교육비 · ${l.children.length}명</span><strong data-child-living>${money(l.childLiving)}</strong></div><div class="money-row"><span>주거비</span><strong>${money(costs.housing)}</strong></div><p class="small-note" data-child-living-basis>${escape(residenceLabel({province:l.provinceId,subregionId:l.subregionId}))} · ${p.active?'자녀별 나이와 인원을 반영한 게임 예산이에요.':'처음 배정한 자녀 조건으로 정한 생활비를 유지하고 있어요.'} 양육·교육비는 위 기본 생활비에 포함되어 매달 한 번만 나가요.${l.subregionId?' 구·시군 차이는 지역 근로소득을 연결한 추정입니다.':''} <a href="weekend_season2_doc.html#child-living-costs">계산 기준 보기 ↗</a></p>`:''}</div>`;
  }
  function economyBreakdownHTML(c) {
    const origin=c.incomeOrigin,profile=c.economicProfile,total=Number(c.salary)+Number(c.externalAllowance),costs=monthlyCosts(c),remaining=total-costs.total;
    const original=profile&&origin?.kind==='lifecycle'&&c.salary===origin.personalEarnedMonthly&&c.externalAllowance===origin.studySupportMonthly+(origin.personalSupportMonthly||0)+origin.householdContributionMonthly+profile.gameSupport;
    const rows=original?[['내 근로 수입',c.salary],['가족이 보태는 돈',origin.householdContributionMonthly],['장학·연구 생활 지원',origin.studySupportMonthly],['개인 생활 지원',origin.personalSupportMonthly||0],['게임 속 생활 보충',profile.gameSupport]]:[['내 근로 수입',c.salary],['외부 생활 지원·분담금',c.externalAllowance]];
    return `<div class="economy-breakdown" data-economy-breakdown><p class="small-note">${profile?`생활비를 함께 쓰는 ${householdSize(c)}명의 살림이에요. `:''}가계 수입에는 내 급여와 생활에 보태는 돈이 함께 들어 있어요.</p>${rows.map(([label,amount])=>`<div class="money-row"><span>${label}</span><strong>${money(amount)}</strong></div>`).join('')}<div class="money-row economy-total"><span>한 달 들어오는 돈</span><strong>${money(total)}</strong></div><div class="money-row"><span>기본 생활비·주거비</span><strong>${costs.invalid?'입력 확인':money(costs.total)}</strong></div>${livingCostsHTML(c)}<div class="money-row economy-total"><span>${remaining<0?'생활비가 모자라는 금액':'생활비를 내고 남는 돈'}</span><strong>${costs.invalid?'입력 확인':money(Math.abs(remaining))}</strong></div><div class="money-row"><span>활동에 정한 월 예산</span><strong>${money(c.personalBudget)}</strong></div><div class="money-row"><span>시작 현금</span><strong>${money(c.startCash)}</strong></div><p class="small-note">활동 예산은 수입을 한 번 더 받는 돈이 아니에요.${original&&profile.gameSupport?' 게임 속 생활 보충은 이 삶을 이어갈 수 있도록 더한 가상 금액이며 실제 복지 수급액이 아니에요.':''}${profile?' 복무 중인 자녀도 돌아올 생활 기반에 포함해요.':''}${profile&&!original?' 직접 조정하거나 생활 중 달라진 현재 금액이에요. 처음 배정한 지원 내역을 다시 더하지 않아요.':''}</p></div>`;
  }
  function setupEconomyHTML(c) {return `<details id="setup-economy" class="disclosure"${openPanels.has('setup-economy')?' open':''}><summary>한 달 살림을 펼쳐 보면 <span>수입 · 생활비</span></summary><div class="disclosure-body" id="economy-breakdown">${economyBreakdownHTML(c)}</div></details>`;}
  function housingBasisHTML(c) {
    const origin=c.housingOrigin;if(!origin)return '<p class="small-note">이전 저장 또는 직접 정한 집의 비용을 그대로 사용해요.</p>';
    return `<p class="small-note">처음 배정한 집의 참고 조건 · ${escape(origin.period)}<br>${escape(residenceLabel({province:origin.provinceId,subregionId:origin.subregionId}))} · ${origin.areaM2}㎡${origin.householdSize?' · '+origin.householdSize+'명':''}<br>${origin.housingTenure==='own'?'참고 집값':'참고 보증금'} ${money(origin.housingTenure==='own'?origin.propertyValue:origin.deposit)}. 계약을 이미 마친 상태이며 이 금액을 시작 현금에 더하거나 다시 빼지 않아요.</p><p class="small-note">지역의 공개 자료를 참고해 집 크기와 함께 사는 인원에 맞춘 게임 속 비용이에요. 특정 집의 견적이나 이 가구의 실제 계약을 뜻하지 않아요.</p>${origin.subregionId?'<p class="small-note" data-subregion-housing-basis>구·시군별 2026년 2분기 아파트 매매·전세 가격을 반영했어요. 원룸·공동 주거와 월세는 지역의 아파트 가격 차이를 연결한 게임 추정값이에요.</p>':''}<a href="weekend_season2_doc.html#housing-sources">주거 자료와 계산 가정 보기 ↗</a>`;
  }
  function economyModeText(c) {return c.economicProfile?.active?'환경을 바꾸면 이 조건에 맞게 살림도 함께 다시 정해요. 금액을 직접 바꾸면 그 값을 유지해요.':'직접 정한 금액을 유지하고 있어요. 아래 버튼을 누를 때만 현재 환경에 맞춰 다시 정해요.';}
  function economySourcesHTML(c) {
    if(!c.economicProfile&&!c.housingOrigin)return '';
    const sources=[...(S2Data.LIFECYCLE?.SOURCES||[]),...(S2Data.HOUSING?.SOURCES||[]),S2Data.LIFECYCLE.CHILD_LIVING.SOURCE];
    return `<details class="settings-details economy-sources"><summary>수입·주거 자료와 가정 더 보기</summary><p>${escape(S2Data.LIFECYCLE.MODEL.note)}</p><p>${escape(S2Data.LIFECYCLE.MODEL.householdNote)}</p><p>${escape(S2Data.LIFECYCLE.MODEL.workerNote)}</p><p>${escape(S2Data.LIFECYCLE.MODEL.supportNote)}</p><p>${escape(S2Data.LIFECYCLE.MODEL.budgetNote)}</p><p>${escape(S2Data.LIFECYCLE.CHILD_LIVING.MODEL.note)}</p>${sources.map(source=>`<p><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label||source.title||source.id)} ↗</a><br>${escape(source.note||'공개 집계 자료를 참고한 게임 설정입니다.')}</p>`).join('')}</details>`;
  }
  function nameSourcesHTML() {
    const names=window.S2NameCohorts;if(!names)return '';
    return `<details class="settings-details name-sources"><summary>출생 세대별 이름 자료</summary><p>${escape(names.MODEL.note)}</p><p>${escape(names.MODEL.genderNote)}</p><p>${escape(names.MODEL.extrapolationNote)}</p>${names.SOURCES.map(source=>`<p><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label||source.title)} ↗</a><br>${escape(source.note)}</p>`).join('')}</details>`;
  }
  function syncRoleAgeLimit() {
    const field=$('#setup-form [name=age]');if(!field)return;
    const graduate=config.role==='graduate';
    field.max=String(graduate?S2Data.ROLE_MODEL.graduateMaxAge:100);
    field.setAttribute('aria-describedby','role-age-note');
    const note=$('[data-role-age-note]');if(note)note.textContent=graduate?'새로 시작하는 대학원생은 18~46세로 설정해 주세요.':'대학원생으로 새 삶을 시작할 수 있는 나이는 46세까지예요.';
  }
  function generationBasisBody(c){
    const population=S2Data.DEMOGRAPHICS.population,region=S2Data.DEMOGRAPHICS.regions.find(r=>r.id===c.province),origin=c.incomeOrigin;
    const location=region?`${c.residenceOrigin==='custom'?'직접 선택한 ':''}${provinceLabel(region.id)} · 기준 인구 ${region.population.toLocaleString('ko-KR')}명. 전국 ${population.total.toLocaleString('ko-KR')}명 중 ${(region.population/population.total*100).toFixed(2)}%이며 새 인생을 배정할 때 쓰는 비중입니다.`:'이전 저장 또는 직접 만든 환경으로, 통계에서 거주지를 새로 배정하지 않았습니다.';
    const income=!origin?'수입은 직접 수정 가능한 가상 프리셋 값입니다.':origin.kind==='custom'?'거주지·역할·수입을 직접 조정한 환경입니다. 현재 금액을 통계 추첨값으로 해석하지 않습니다.':origin.kind==='lifecycle'?'나이·생활 역할·가구 구성·지역을 함께 고려해 시작 살림을 정했어요. 개인 급여, 가족 분담, 학업 지원을 나누며 부족한 생활비는 게임 속 보충으로 표시해요. 공개 통계의 여러 분포를 조합한 게임 모델이며 실제 동일 조건 가구의 관측값은 아니에요.':origin.kind==='wage'?`${provinceLabel(origin.provinceId)}의 임금 구간 인원 비중으로 뽑았던 시작 월 수입입니다. 구간 안의 금액, 연간 자료의 월 환산 및 세금 생략은 게임의 단순화입니다.`:`시작 당시 ${provinceLabel(origin.provinceId)}의 임금 분포에서 뽑은 기준액 ${money(origin.sampledMonthly)}의 ${Math.round(origin.supportShare*100)}%를 최초 외부 생활비로 정했습니다. 이 비율은 게임 가정이며 구직자·학생·돌봄 가구의 실제 소득 분포가 아닙니다.`;
    const district=S2Data.SUBREGIONS.byId(c.subregionId);
    const municipal=district?`<p data-subregion-basis>${escape(residenceLabel(c))}. 구·시·군은 주소지 기준 근로소득 신고인원을 가중치로 삼아 뽑는 게임 설정이며 전체 거주 인구의 비율은 아니에요. 직접 선택할 수도 있어요. 수입은 2023년 같은 시·도 대비 근로소득 차이를 가구 수입 모형에 연결하며, 실제 이 가구의 수입을 뜻하지 않아요. <a href="weekend_season2_doc.html#subregion-sources">세부 지역 자료와 계산 보기 ↗</a></p>`:'';
    return `<p>${escape(location)}</p>${municipal}<p data-marital-basis>새 인생의 이혼 여부는 2020 인구총조사의 연령별 현재 이혼 인구 비율을 참고해 뽑아요. 자녀가 있다는 이유만으로 이혼으로 정하지 않아요. 다른 혼인 상태와 가족 구성은 게임 설정이며, 실제 전체 혼인 분포를 재현하지는 않아요.</p><p data-role-basis>새 인생의 대학원생은 46세까지 배정하며, 해당 나이에서는 2% 확률로 뽑아요. 전체 새 인생에서는 약 1% 수준입니다. 교육통계의 대학원 재적학생 규모를 참고한 게임 가정이며 실제 연령별 재학률은 아니에요. 이전에 저장한 삶에는 새 추첨 기준을 적용하지 않아요.</p><p>${escape(income)}${origin&&origin.kind!=='custom'&&origin.kind!=='lifecycle'&&origin.assignedMonthly!==c.salary+c.externalAllowance?' 이후 선택과 사건으로 현재 수입이 달라졌습니다.':''}</p><p>인구 기준일 ${escape(population.asOf)}. 새 이름은 출생연도에 맞는 시대별 이름 목록과 상위 ${S2Data.DEMOGRAPHICS.surnames.length}개 성씨를 조합해 정합니다. 각 이름 후보 안의 추첨은 게임 가정이며 실제 전체 성명 빈도를 재현하지 않습니다. 저장한 이름은 그대로 유지합니다. 역할·나이·가족·생활권·외형·실내·생활비 지출은 창작 설정이며, 이 조합 전체가 한국 인구를 대표하지는 않습니다.</p><a href="weekend_season2_doc.html#life-sources">자료의 기준·출처와 추첨 방식 보기 ↗</a>${nameSourcesHTML()}${economySourcesHTML(c)}`;
  }
  function generationBasisHTML(c){return `<details id="life-basis" class="disclosure"${openPanels.has('life-basis')?' open':''}><summary>이 삶은 어떻게 뽑혔나요? <span>자료와 설정</span></summary><div class="disclosure-body">${generationBasisBody(c)}</div></details>`;}
  function previewAgeHealth(c) {
    if(!Number.isInteger(c.age)||c.age<18||c.age>100)return null;
    return S2Data.ageHealthProfile?.(c)||null;
  }
  function ageHealthBody(c) {
    const profile=previewAgeHealth(c);if(!profile)return '<p class="small-note">나이를 18~100세로 입력하면 건강과 회복 기준을 보여 드려요.</p>';
    return `<p class="small-note">${escape(profile.label)} · 시작 건강 ${profile.initialHealth}/100<br>휴식 회복은 기본의 ${Math.round(profile.recoveryRate*100)}%로 계산해요.</p><p class="small-note">${profile.legacy?'이전 저장의 건강과 회복 기준을 그대로 유지해요.':'나이대에 따라 조금 다르게 정한 게임 설정이에요.'} 실제 개인의 건강이나 회복 능력을 예측하지 않아요. 현재 건강은 생활과 선택에 따라 달라져요.</p><a href="weekend_season2_doc.html#age-health-sources">건강 장면의 자료와 가정 보기 ↗</a>`;
  }
  function ageHealthHTML(c,id) {return S2Data.ageHealthProfile?`<details id="${id}" class="settings-details age-health-details"><summary>이 삶의 건강과 회복</summary><div data-age-health-body>${ageHealthBody(c)}</div></details>`:'';}
  function healthSourcesHTML() {
    return `<details id="health-sources" class="disclosure"${openPanels.has('health-sources')?' open':''}><summary>몸이 아픈 날의 이야기 <span>자료와 게임 설정</span></summary><div class="disclosure-body"><p>${escape(S2Events.HEALTH_MODEL_NOTE||'질병 사건과 수치 변화는 게임용 가정입니다.')}</p>${(S2Events.HEALTH_SOURCES||[]).map(source=>`<p><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a><br>${escape(source.application)}</p>`).join('')}</div></details>`;
  }
  function logTitle(log) { return log.title || log.label || log.message || (log.activityId ? activity(log.activityId)?.name : '') || log.type || '기억'; }
  function logDetail(log) { if(log.type==='incident')return `수리비 ${money(log.repairCost)} · 병원비 ${money(log.medicalCost)} · 현금 납부 ${money(log.paid)}${log.unpaid?' · 미납 '+money(log.unpaid):''}. 게임 속 사고 비용으로 장부에 반영했어요.`; const reasons = { choice: log.automatic ? '자동 생활이 다른 일을 챙기기로 정한 일정이에요.' : '다른 일을 챙기려고 직접 바꾼 일정이에요.', money: '사용할 수 있는 돈이 부족해 조정한 일정입니다.', care: '돌봄에 필요한 시간 때문에 조정한 일정입니다.', event: '새로 생긴 사건에 대응하며 조정한 일정입니다.', time: '필요한 시간을 확보할 수 없어 조정한 일정입니다.', budget: '이달의 지출 예산 때문에 조정한 일정입니다.', cash: '바로 지불할 현금이 부족해 조정한 일정입니다.', arrears: '남은 미납금 때문에 카드 사용을 줄인 일정입니다.', 'card-limit': '카드 한도를 넘어서 조정한 일정입니다.' }; return log.description || log.detail || log.text || reasons[log.reason] || log.reason || ''; }
  function announce(message, error = false) { const box = $('#notice'); clearTimeout(noticeTimer); box.textContent = message; box.className = `notice visible${error ? ' error' : ''}`; noticeTimer = setTimeout(() => box.classList.remove('visible'), error ? 11000 : 5500); }
  function save(silent = true) { if (!state) return; try { const result = S2Storage.save(state); if (result?.ok === false) announce(result.reason || '브라우저 저장 공간을 사용할 수 없어요. JSON으로 내보내 주세요.', true); else { saveAvailable = true; if (!silent) announce('이 브라우저에 지금까지의 한 해를 저장했어요.'); } } catch (_) { announce('브라우저 저장 공간을 사용할 수 없어요. JSON으로 내보내 주세요.', true); } }
  function changed(message) { save(); render(); if (message) announce(message); }
  function handleResult(result, success) { if (result?.ok === false) { save(); announce(result.reason || (result.issues || []).map(i => typeof i === 'string' ? i : i.reason || i.message).join(' · ') || '일정을 확인해 주세요.', true); render(); return false; } changed(success); return true; }
  const moneyInputDisplay = won => String(Math.round(won/1000)/10);
  function setMoneyInput(field,won) {
    if(!field)return;
    const display=moneyInputDisplay(won);
    field.value=display;field.dataset.moneyWon=String(won);field.dataset.moneyDisplay=display;delete field.dataset.moneyDirty;
  }
  function readMoneyInput(field) {
    const raw=field.value,value=Number(raw);
    if(raw.trim()===''||field.validity.badInput||!Number.isFinite(value))return NaN;
    // Merely displaying or focusing a rounded amount must not erase its won.
    // A real input event, including typing the same displayed zero, is a new amount.
    if(field.dataset.moneyDirty!=='true'&&raw===field.dataset.moneyDisplay)return Number(field.dataset.moneyWon);
    if(value<0||field.validity.rangeOverflow||field.validity.rangeUnderflow)return value*10000;
    return Math.round(value*10)*1000;
  }
  function normalizeMoneyInput(field) {
    if(!field||field.disabled||!moneyFields.includes(field.name))return false;
    const raw=field.value,value=Number(raw);
    if(raw.trim()===''||!Number.isFinite(value)||field.validity.badInput||value<0||field.validity.rangeOverflow||field.validity.rangeUnderflow)return false;
    const won=readMoneyInput(field),changed=field.dataset.moneyDirty==='true'||raw!==moneyInputDisplay(won);
    setMoneyInput(field,won);return changed;
  }
  function input(name, label, type = 'number', extra = '') {
    let value = config[name] ?? '',metadata='';
    if (moneyFields.includes(name)) {
      const won=Number(value),maximum=Number(extra.match(/max="(\d+)"/)?.[1]??Infinity);
      // Keep invalid drafts invalid if another setting causes a redraw.
      value=!Number.isFinite(won)?'':won<0||won>maximum?String(won/10000):moneyInputDisplay(won);
      metadata=` data-money-won="${escape(won)}" data-money-display="${escape(value)}"`;
      label=label.replace('(원)','(만원)');extra=extra.replace(/max="(\d+)"/g,(_,n)=>`max="${Number(n)/10000}"`).replace(/step="[^"]*"/g,'step="0.1"');
    }
    if(name==='housingLoanRateBps')value=Number(value)/100;
    return `<label class="field">${label}<input name="${name}" type="${type}" value="${escape(value)}"${metadata} ${extra}></label>`;
  }
  function select(name, label, options) { return `<label class="field">${label}<select name="${name}">${options.map(([value, text]) => `<option value="${value}"${String(config[name]) === String(value) ? ' selected' : ''}>${text}</option>`).join('')}</select></label>`; }
  function subregionOptionsHTML() {
    const rows=S2Data.SUBREGIONS.forProvince(config.province);
    return `<option value="">${config.province==='seoul'?'구를':'시·군을'} 선택해 주세요</option>`+rows.map(row=>`<option value="${row.id}"${config.subregionId===row.id?' selected':''}>${escape(row.name)}</option>`).join('');
  }
  function subregionFieldHTML() {
    const available=S2Data.SUBREGIONS.forProvince(config.province).length>0;
    return `<label class="field" data-subregion-field${available?'':' hidden'}><span data-subregion-label>${config.province==='seoul'?'거주 구':'거주 시·군'}</span><select name="subregionId"${available?' required':' disabled'}>${subregionOptionsHTML()}</select></label>`;
  }
  function syncSubregionField() {
    const field=$('[data-subregion-field]');if(!field)return;
    const available=S2Data.SUBREGIONS.forProvince(config.province).length>0,select=$('select',field);
    field.hidden=!available;select.disabled=!available;select.required=available;
    $('[data-subregion-label]',field).textContent=config.province==='seoul'?'거주 구':'거주 시·군';
    select.innerHTML=subregionOptionsHTML();
  }
  function sceneHTML(setup = false) { return `<div class="scene-wrap"><div class="scene-stamp">MY LITTLE YEAR · ${setup ? config.year : escape(state.date.slice(0, 4))}</div><canvas id="life-scene" width="760" height="550" role="img" aria-label="계절이 바뀌는 창과 생활공간. 캐릭터의 활동과 쌓인 취미 결과물을 보여 줍니다."></canvas><div class="scene-caption"><strong>${escape(housingCaption(setup ? config : state.config))}</strong><span>${escape(season(setup ? `${config.year}-01-01` : state.date))}</span></div></div>`; }
  function housingSettingsHTML() {
    const legacy=config.housingTenure==='unspecified';
    return `<fieldset id="housing-settings" class="housing-settings"><legend>이 집에서 사는 비용</legend><div class="form-grid">${select('housingTenure','거주 방식',[...(legacy?[['unspecified','이전 설정 · 고정비에 주거비 포함']]:[]),['own','자가'],['rent','월세'],['jeonse','전세']])}<div data-housing-rent${config.housingTenure!=='rent'?' hidden':''}>${input('monthlyRent','매달 내는 월세 (원)','number','min="0" max="100000000" step="1" required')}</div>${input('housingMaintenance','관리·유지비 (원)','number','min="0" max="100000000" step="1" required'+(legacy?' disabled':''))}${input('housingLoanPrincipal','은행대출 잔액 (원)','number','min="0" max="10000000000" step="1" required'+(legacy?' disabled':''))}${input('housingLoanRateBps','은행대출 연이율 (%)','number','min="0" max="30" step="0.01" required'+(legacy?' disabled':''))}</div><p id="housing-preview" class="housing-preview">${housingPreviewHTML(config)}</p><p id="housing-loan-note" class="small-note">${housingLoanNote(config)}</p><p class="small-note">월세·이자·관리비는 매월 1일에 나가요. 시작 현금은 집 계약을 마친 뒤 남은 돈이에요.</p><details class="settings-details"><summary>집과 대출은 어떻게 계산하나요?</summary><p class="small-note">자가는 은행 주택담보대출, 전세는 은행 전세자금대출, 월세는 은행 보증금대출을 설정할 수 있어요.<br>집값·보증금 자체는 계산하지 않아요. 원금을 새로 빌리거나 갚는 과정도 없으며, 남은 원금은 연말에도 빚으로 남아요. 매달 이자와 관리·유지비를 계산합니다.<br>금리는 직접 바꿀 수 있는 게임 가정이며 실제 시장금리를 뜻하지 않아요. 이전 저장은 주거비가 기존 고정비에 포함되어 있어 추가로 청구하지 않아요.</p><div id="housing-basis">${housingBasisHTML(config)}</div></details></fieldset>`;
  }
  function housingPreviewHTML(c) { const h=housingCosts(c),m=monthlyCosts(c);if(h.invalid||m.invalid)return '금액은 0 이상, 연이율은 0~30%로 입력해 주세요.';return h.tenure==='unspecified'?`기존 고정비 ${money(m.total)}에 주거비가 포함되어 있어요. 추가 주거비는 없어요.`:`${[...(h.tenure==='rent'?[`<span>월세 ${money(h.rent)}</span>`]:[]),...(h.loanPrincipal>0?[`<span>은행대출 이자 ${money(h.interest)}</span>`]:[]),`<span>관리비 ${money(h.maintenance||0)}</span>`].join(' + ')}<br>생활비까지 매달 ${money(m.total)}`; }
  function setupHTML() {
    const family = familyText(config);
    return `<section class="life-meeting"><div class="meeting-intro"><div class="meeting-topline"><span class="eyebrow">ANOTHER LIFE, ONE LITTLE YEAR</span><label class="season-picker">살아볼 해<select id="start-year">${Array.from({length:75},(_,i)=>2026+i).map(year=>`<option value="${year}"${config.year===year?' selected':''}>${year}년</option>`).join('')}</select></label></div><h1>올해는, <strong>${escape(config.personaName || life.name)}</strong>의 삶.</h1><p class="life-byline">${config.age}세 · ${genderLabel(config.gender)} · ${escape(roleLabels[config.role])} · ${family}</p><p class="life-intro">${escape(config.lifeIntro || life.intro)}</p><div class="life-facts">${economyFactsHTML(config)}</div><p class="life-housing">${housingLine(config)}</p></div><div class="meeting-scene">${sceneHTML(true)}</div><div class="meeting-actions">${!S2Calendar.holidayStatus(config.year).verified?`<p class="setup-year-note">${escape(S2Calendar.holidayStatus(config.year).label)}</p>`:''}<button id="start-btn" class="primary start-life">이 삶으로 시작 →</button><button id="reroll-life" class="reroll-life">↻ 다른 삶 만나기</button><p class="meeting-note">가상의 누군가가 되어, 한 해를 살아 보세요.<br>환경을 모두 고르지 않아도 괜찮아요.</p></div></section><div class="setup-bottom"><div class="resume-actions">${saveAvailable ? '<button id="resume-game" class="secondary">저장한 삶 이어하기</button>' : ''}<button id="import-save" class="ghost">저장 파일 불러오기</button></div>${setupEconomyHTML(config)}${generationBasisHTML(config)}<details id="advanced-settings" class="disclosure"${openPanels.has('advanced-settings')?' open':''}><summary>환경을 직접 고르고 싶다면 <span>고급 설정</span></summary><div class="disclosure-body"><p class="subtle">네 가지 가상 환경과 세부 조건을 직접 조정할 수도 있어요.</p><div class="preset-grid">${presets.map(p => `<button type="button" class="preset${p.id===presetId?' active':''}" data-preset="${escape(p.id)}" aria-pressed="${p.id===presetId}"><span class="preset-icon" aria-hidden="true">${presetIcons[p.config.role]||'🌿'}</span><strong>${escape(p.name)}</strong><small>${escape(p.description)}</small></button>`).join('')}</div><form id="setup-form" novalidate><div class="form-grid">${input('age','나이','number','min="18" max="100" required')}${select('gender','성별',[['woman','여성'],['man','남성']])}${select('maritalStatus','혼인 상태',[['single','미혼'],['married','기혼'],['divorced','이혼'],['widowed','사별'],['unspecified','정하지 않음']])}${select('role','생활 역할',Object.entries(roleLabels))}<p id="role-age-note" data-role-age-note class="small-note"></p>${select('housing','집 모양',[['studio','원룸'],['apartment','아파트'],['shared','공동 주거']])}${select('province','거주 시·도',[['unspecified','직접 설정하지 않음'],...S2Data.DEMOGRAPHICS.regions.map(r=>[r.id,provinceLabel(r.id)])])}${subregionFieldHTML()}${select('region','생활권 유형',[['city','도시'],['town','중소도시'],['rural','읍·면 지역']])}${select('transport','이동수단',[['walk','도보'],['transit','대중교통'],['car','자동차']])}${input('salary','내 근로 수입 (원)','number','min="0" max="100000000" step="1" required')}${input('externalAllowance','생활 지원·분담금 (원)','number','min="0" max="100000000" step="1" required')}${input('fixedCosts',livingCostLabel(config)+' (원)','number','min="0" max="100000000" step="1" required')}${input('startCash','시작 현금 (원)','number','min="0" max="1000000000" step="1" required')}${input('personalBudget','월 개인 지출 예산 (원)','number','min="0" max="100000000" step="1" required')}${input('payDay','급여일 (매월 며칠)','number','min="1" max="31" required')}${input('cardLimit','게임 내 카드 한도 (원)','number','min="0" max="100000000" step="1" required')}${input('children','자녀 수','number','min="0" max="6" required')}${select('childAge','자녀 연령대',[['none','해당 없음'],['toddler','영아 · 0~2세'],['preschool','미취학'],['school','초등학생'],['teen','청소년'],['adult','성인 자녀']])}${input('careShare','내 돌봄 분담 (%)','number','min="0" max="100" required')}</div>${housingSettingsHTML()}${childProfilesHTML()}${ageHealthHTML(config,'setup-age-health')}<div class="economy-adjust"><p id="economy-mode-note" class="small-note">${economyModeText(config)}</p><button type="button" id="rebalance-economy" class="secondary">이 조건에 맞춰 살림 다시 정하기</button></div><p class="small-note">금액은 만원 단위 소수 한 자리까지 입력해요. 바꾸지 않은 금액과 장부는 1원까지 유지해요. 개인 지출 예산은 받은 수입에서 쓰는 한도입니다. 외부 용돈처럼 수입으로 다시 더하지 않아요.</p><details class="settings-details"><summary>좋아하는 활동과 재현 시드</summary>${categorySelectHTML('setup-category',setupCategory,config)}<div id="setup-activity-groups">${setupPreferencesHTML()}</div>${input('seed','같은 삶과 선택을 다시 따라갈 시드','number','min="0" max="4294967295" required')}</details><button type="submit" id="custom-start-btn" class="primary">이 설정으로 시작</button></form></div></details><p class="privacy-note">모든 인물은 가상입니다. 성별·혼인으로 능력이나 의무를 정하지 않아요.<br>기록은 이 브라우저에만 저장됩니다. <a href="weekend_season2_doc.html">게임의 가정과 사용법</a></p></div>`;
  }
  function financeSummary() { const f = state.finance; return { ...S2Finance.summary(f,state.config), cash: f.cash || 0, pending: f.cardPending || 0, arrears: (f.arrears || 0) + (f.fixedArrears || 0) + (f.incidentArrears || 0), pendingPay: Array.isArray(f.pendingPay) ? f.pendingPay.reduce((sum, p) => sum + (p.amount || 0), 0) : f.pendingPay || 0 }; }
  function metricsHTML() {
    const progress=[['fatigue','피로'],['preparation','시험 준비'],['research','연구 진척'],['work','업무 기여']];
    return `<section class="panel sidebar-card"><div class="section-title"><h3>생활과 목표</h3><span class="pill light">${escape(roleLabels[state.config.role])}</span></div><p class="small-note">행복은 지난 생활의 만족, 기분은 오늘의 느낌이에요. 어느 한 수치로 한 해를 평가하지 않아요.</p><div class="metric-grid">${progress.map(([key,name])=>`<div class="metric"><label>${name}</label><strong>${Math.round(state.stats[key]||0)}<small> / 100</small></strong><div class="meter" role="meter" aria-label="${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(state.stats[key]||0)}"><i style="width:${state.stats[key]||0}%"></i></div></div>`).join('')}</div><p class="small-note family-context">${escape(familyText(state.config))}</p><p class="small-note">집안 정돈 ${Math.round(state.household?.cleanliness??70)} / 100${state.household?.lastCleaned?' · 마지막 청소 '+dateText(state.household.lastCleaned):''}</p>${ageHealthHTML(state.config,'life-age-health')}</section>`;
  }
  function financeHTML() {
    const f=financeSummary(),h=housingCosts(state.config),m=monthlyCosts(state.config),available=S2Finance.available(state.finance,state.config);
    const rows=[[livingCostLabel(state.config),m.living],...(h.tenure==='unspecified'?[]:[...(h.tenure==='rent'?[['월세',h.rent]]:[]),...(h.loanPrincipal>0?[[housingLoanName(state.config)+' 이자',h.interest]]:[]),['관리·유지비',h.maintenance||0]]),['매달 나가는 생활비 합계',m.total]];
    return `<section id="finance-card" class="panel sidebar-card"><div class="section-title"><h3>생활비 봉투</h3><span class="pill light">${Number(state.date.slice(5,7))}월</span></div><div class="money-row money-main"><span>지금 가진 현금</span><strong>${money(f.cash)}</strong></div><div class="money-row due"><span>월말 카드 청구 예정</span><strong>${money(f.pending)}</strong></div><div class="money-row due"><span>남은 미납금</span><strong class="${f.arrears?'negative':''}">${money(f.arrears)}</strong></div><div class="money-row due"><span>아직 받지 않은 보상</span><strong>${money(f.pendingPay)}</strong></div><div class="money-row due"><span>이달 남은 지출 예산</span><strong>${money(available)}</strong></div>${f.incidentCosts?`<div class="incident-finance"><h4>활동 중 사고 비용</h4><div class="money-row"><span>누적 수리비</span><strong>${money(f.incidentRepair)}</strong></div><div class="money-row"><span>누적 병원비</span><strong>${money(f.incidentMedical)}</strong></div><div class="money-row"><span>그중 아직 못 낸 금액</span><strong>${money(f.incidentArrears)}</strong></div></div>`:''}<div class="housing-cost-rows"><h4>${tenureLabels[h.tenure]||'내 집'} · 매월 1일</h4>${rows.map(([label,amount])=>`<div class="money-row"><span>${escape(label)}</span><strong>${money(amount)}</strong></div>`).join('')}${h.tenure!=='unspecified'?`${h.loanPrincipal>0?`<div class="money-row"><span>남은 ${housingLoanName(state.config)} 원금</span><strong>${money(h.loanPrincipal)}</strong></div>`:''}<p class="small-note">${housingLoanNote(state.config)}</p>`:'<p class="small-note">이전 저장의 주거비는 기존 고정비에 포함되어 있어요. 추가 주거비는 청구하지 않아요.</p>'}</div><details class="finance-income"><summary>매달 들어오고 남는 돈</summary>${economyBreakdownHTML(state.config)}${housingBasisHTML(state.config)}</details><div class="budget-note">수입 → 생활비·주거비 → 미납 납부 → 활동 → 카드 정산<br>카드값은 월말에 현금으로 결제돼요.${f.arrears?'<br><strong>미납 중 새 카드 사용이 제한됩니다.</strong>':''}</div></section>`;
  }
  function artifactHTML(a) { const id = a.activityId || a.activity || a.type; return `<div class="artifact" title="${escape(a.date ? dateText(a.date) : '')}"><span aria-hidden="true">${icon(id)}</span>${escape(a.name || a.title || activity(id)?.name || '나의 결과물')}</div>`; }
  function collectionHTML() { return `<section class="panel sidebar-card collection-panel"><div class="section-title"><h3>차곡차곡, 내 취미</h3><span class="pill light">${state.artifacts.length}개</span></div>${state.artifacts.length ? `<div class="artifact-list">${state.artifacts.slice(-6).map(artifactHTML).join('')}</div>` : '<p class="collection-empty">사진 한 장, 처음 만든 그릇.<br>취미를 이어 가면 이 공간에 결과물이 남아요.</p>'}</section>`; }
  function reservations() { try { return S2Engine.reservations(state) || []; } catch (_) { return []; } }
  function plannerHTML() { const days = S2Engine.currentWeek(state), a = activity(selected), pending = reservations().filter(r => r.status === 'reserved' || !r.status); return `<section class="panel planner-panel"><div class="week-heading"><div><span class="eyebrow">A LITTLE ROOM FOR LIFE</span><h2>${dateText(days[0]?.date || state.date)}${days.length > 1 ? ` — ${dateText(days.at(-1).date)}` : ''}</h2><p>활동을 고르고 빈 시간에 놓아 보세요. 비운 시간은 여유로 남아요.</p></div><span class="pill">${days.length}일의 계획</span></div>${pending.length ? `<div class="pending-warning">확인이 필요한 반복 예약 ${pending.length}개가 있어요. <button class="ghost" data-tab="routines">반복 일정 확인 →</button></div>` : ''}<div class="calendar" style="--week-days:${days.length};--mobile-days:${Math.min(4,days.length)}" aria-label="이번 주 활동 계획">${days.map(day => `<div class="day${day.isOff ? ' off' : ''}${day.date === state.date ? ' today' : ''}"><div class="day-head"><span>${weekday(day.date)}요일</span><strong>${Number(day.date.slice(8,10))}</strong>${day.holiday ? `<em title="${escape(holidayName(day.holiday))}">${escape(holidayName(day.holiday))}</em>` : ''}</div>${day.slots.map(slot => { const sid = typeof slot === 'string' ? slot : slot.id, plan = state.plan.find(p => p.date === day.date && p.slot === sid), act = plan && activity(plan.activityId); const available = slot.available !== false; return `<button class="slot${plan ? ' filled' : ''}${!available && !plan ? ' unavailable' : ''}" data-date="${day.date}" data-slot="${sid}"${plan ? ` data-plan-id="${escape(plan.id)}"` : ''} ${!available && !plan ? 'disabled' : ''} aria-label="${dateText(day.date)} ${labels[sid] || sid}: ${plan ? `${escape(act?.name || plan.activityId)}, 선택하면 취소` : available ? `${escape(a?.name || '')} 배치` : escape(slot.reason || '기본 일과')}" title="${escape(plan ? (act?.description || '') : slot.reason || '선택한 활동 배치')}"><span class="slot-time">${labels[sid] || escape(slot.label || sid)}</span><span class="slot-icon" aria-hidden="true">${plan ? icon(plan.activityId) : available ? '＋' : '·'}</span><span>${plan ? escape(act?.name || plan.activityId) : available ? '비워 둔 시간' : escape(slot.reason || '기본 일과')}</span>${plan ? '<span class="remove-hint">선택하여 취소</span>' : ''}</button>`; }).join('')}</div>`).join('')}</div><div class="selection-bar"><span>선택한 활동 <strong>${icon(selected)} ${escape(a?.name || '')}</strong> · 준비와 오가는 시간도 함께 잡아요</span><label class="payment-select">결제 방식 <select id="payment"><option value="cash"${payment==='cash'?' selected':''}>현금·체크</option><option value="card"${payment==='card'?' selected':''}>카드 · 월말 정산</option></select></label></div></section>${activityCatalog()}<div class="advance-bar"><p><strong>계획이 완벽하지 않아도 괜찮아요.</strong>새로운 일이 생기거나 무리한 일정이면 잠깐 멈춰요.</p><div class="actions"><button id="advance-choice">다음 중요한 선택까지</button><button id="advance-week" class="primary">이번 주 살아보기 →</button></div></div>`; }
  function catalogContent() { const match=a=>categoryMatches(S2Data.ACTIVITY_CATEGORIES.find(category=>category.id===a.categoryId),filter); const a = activity(selected); return `<section class="activity-panel"><div class="section-title"><h3>이 시간에 할 일 하나 고르기</h3><span class="small-note">활동 하나 → 달력의 빈 시간</span></div>${categorySelectHTML('catalog-category',filter)}<div class="activity-grid">${visibleActivities().filter(match).map(a => `<button class="activity-card${selected===a.id?' active':''}" data-activity="${escape(a.id)}" aria-pressed="${selected===a.id}"${roleReason(a.id)?' disabled':''} title="${escape(roleReason(a.id)||a.description)}"><span class="activity-icon" aria-hidden="true">${icon(a.id)}</span><strong>${escape(a.name)}</strong><small>${price(a.id).amount ? money(price(a.id).amount) : '무료'} · ${a.minutes || a.duration || 60}분</small><small>${a.mode === 'together' || a.mode === 'group' ? '함께하는 시간' : a.mode === 'either' ? '혼자 또는 함께' : '나의 시간'}</small>${activityMeta(a)?`<small>${escape(activityMeta(a))}</small>`:''}${roleReason(a.id)?`<small>${escape(roleReason(a.id))}</small>`:''}</button>`).join('')}</div><p class="activity-description"><strong>${icon(selected)} ${escape(a?.name)}</strong> ${escape(a?.description || '')} <span>준비 ${a?.prep || 0}분 · ${a?.location === 'home' ? '집에서' : '지역·교통에 따라 왕복 이동 추가'}${state.skills?.[selected] !== undefined ? ` · 숙련 ${Math.round(state.skills[selected])}` : ''}</span></p>${priceDetails(selected)}</section>`; }
  function activityCatalog() { return `<details id="activity-catalog" class="disclosure activity-drawer"${openPanels.has('activity-catalog')?' open':''}><summary>활동 직접 고르기 <span>${activities.length}가지 활동</span></summary><div class="disclosure-body">${catalogContent()}</div></details>`; }
  function completedOnceRulesHTML() {
    const rules=state.rules.filter(rule=>rule.stoppedReason==='completed-once');
    return rules.length?`<div class="reservation-list">${rules.map(rule=>`<div class="reservation" data-completed-once-rule="${escape(rule.id)}"><div><h3>${icon(rule.activityId)} ${escape(activity(rule.activityId)?.name||'')}</h3><p>${dateText(rule.stoppedOn)} 완료 · 한 번만 하는 활동이라 예약을 자동 종료했어요.</p></div><span class="pill light">완료 후 종료</span></div>`).join('')}</div>`:'';
  }
  function routineHTML() { const list = reservations(), activeRules = state.rules.filter(r => !r.stopped && r.active !== false); return `<section class="panel"><div class="section-title"><div><span class="eyebrow">A RHYTHM OF YOUR OWN</span><h2>자주 하고 싶은 일</h2></div><span class="pill">${activeRules.length}개 반복 중</span></div><p class="subtle">직접 진행할 때는 예약 날짜를 살펴보고 확정해요. 자동 생활은 가능한 일정을 알아서 챙겨요.<br>놓친 회차는 쌓아 두지 않고, 이번 회차만 미루거나 건너뛸 수 있어요. 자녀 나이에 맞춘 육아를 제외한 활동을 예약할 수 있고, 생활 역할·시술 간격·회복 제한은 그대로 적용해요.</p><div class="reservation-list">${list.length ? list.map(r => `<div class="reservation"><div><h3>${icon(r.activityId)} ${escape(activity(r.activityId)?.name || r.activityId)}</h3><p>${dateText(r.date)} ${labels[r.slot] || ''}${r.moved || r.originalDate !== r.date ? ` · ${dateText(r.originalDate)}에서 이동` : ''} · ${r.status === 'confirmed' ? '확정됨' : '확인 대기'}</p></div><div class="row">${r.status !== 'confirmed' ? `<button data-reserve-confirm="${escape(r.id)}">확정</button><button data-reserve-postpone="${escape(r.id)}">미루기</button><button data-reserve-skip="${escape(r.id)}">이번 회차 건너뛰기</button>` : '<span class="pill">확정</span>'}</div></div>`).join('') : '<div class="empty-state">이번 주 예약이 없어요.<br>아래에서 나만의 반복 리듬을 만들어 보세요.</div>'}</div>${list.some(r => r.status !== 'confirmed') ? '<button id="confirm-reservations" class="secondary">이동 날짜를 확인했어요 · 예약 일괄 확정</button>' : ''}${activeRules.length ? `<details class="settings-details" open><summary>현재 반복 규칙 ${activeRules.length}개</summary><div class="reservation-list">${activeRules.map(r => `<div class="reservation"><div><h3>${icon(r.activityId)} ${escape(activity(r.activityId)?.name || '')}</h3><p>${r.kind === 'weeks' ? `${r.interval || 1}주마다` : r.kind === 'nth' ? `${r.interval || 1}개월마다 ${r.nth || 2}번째 ${['일','월','화','수','목','금','토'][r.weekday ?? 6]}요일` : `${r.interval || 1}개월마다 · ${r.dayOfMonth || Number(r.anchor?.slice(8,10)) || 1}일`} · ${r.basis === 'completed' ? '마지막 완료일 기준' : '예정일 기준'}<br>평일이면 ${r.move === 'keep' ? '그대로 유지' : r.move === 'previous-off' ? '이전 쉬는 날로' : '다음 쉬는 날로'} · ${labels[r.slot] || S2Engine.SLOT_LABELS[r.slot] || ''}</p></div><button data-rule-stop="${escape(r.id)}" class="ghost danger">중단</button></div>`).join('')}</div></details>` : ''}${completedOnceRulesHTML()}${eveningRuleHTML()}<form id="rule-form" class="rule-form"><h3>새로운 반복 일정</h3><div class="form-grid"><label class="field">활동<select name="activityId">${activityOptionsHTML(selected,true)}</select></label><label class="field">시작 예정일<input name="anchor" type="date" value="${state.date}" min="${state.date}" max="${state.date.slice(0,4)}-12-31" required></label><label class="field">규칙<select name="kind"><option value="weeks">매 N주</option><option value="months">매 N개월</option><option value="nth">매달 N번째 요일</option></select></label><label class="field">주·월 간격 N<input name="interval" type="number" value="1" min="1" max="12" required></label><label class="field">월간 반복 날짜<input name="dayOfMonth" type="number" value="${Number(state.date.slice(8,10))}" min="1" max="31" required></label><label class="field">몇 번째 주<select name="nth"><option value="1">첫째</option><option value="2" selected>둘째</option><option value="3">셋째</option><option value="4">넷째</option><option value="5">다섯째 · 없으면 마지막</option></select></label><label class="field">월간 반복 요일<select name="weekday">${['일','월','화','수','목','금','토'].map((d,i)=>`<option value="${i}"${i===6?' selected':''}>${d}요일</option>`).join('')}</select></label><label class="field">반복 기준<select name="basis"><option value="scheduled">예정일 기준</option><option value="completed">마지막 완료일 기준</option></select></label><label class="field">평일 이동 규칙<select name="move"><option value="next-off">다음 쉬는 날</option><option value="previous-off">이전 쉬는 날</option><option value="keep">그대로 유지</option></select></label><label class="field">시간<select name="slot">${Object.entries(labels).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label class="field">결제<select name="payment"><option value="cash">현금·체크</option><option value="card">카드</option></select></label></div><p class="small-note" style="margin-top:12px">31일처럼 없는 날짜는 그 달의 마지막 날로 보정해요. 평일 유지 예약은 기본 일과와 충돌할 수 있어요. 이동·시간·예산 충돌은 확정할 때 안내합니다.</p><button class="primary" type="submit">반복 일정 만들기 ＋</button></form></section>`; }
  function eventHTML() {
    const event=state.pendingEvent;if(!event)return '<section class="panel"><p>다음 이야기를 준비하고 있어요.</p></section>';
    const constraint=event.catalogId==='constraint'||event.id==='constraint', symbols={external:'✉',followup:'🌱',scheduled:'📅'};
    const label=constraint?'일정이 겹쳤어요':event.source==='external'?'뜻밖의 하루':event.source==='followup'?'이어지는 이야기':'다가온 약속';
    const choices={reschedule:['다른 날로 옮길게요','이번 주에 여유 있는 시간을 찾아봐요.'],free:['오늘은 집에서 쉴래요','나가려던 마음은 잠시 접어 두고 쉬어요.'],skip:['이번에는 쉬어 갈게요','이 일정은 보내고 다음 기회를 기다려요.']};
    return `<section class="event-card" aria-labelledby="phase-title"><div class="event-illustration" aria-hidden="true"><span class="event-symbol">${constraint?'☁':symbols[event.source]||'✉'}</span></div><div class="event-content"><span class="pill light">${dateText(event.date||state.date)} · ${label}</span><h2 id="phase-title" tabindex="-1">${constraint?'오늘은 여유가 조금 모자라요.':escape(event.title)}</h2><p class="event-description">${constraint?'하려던 일을 모두 담기 어려운 날이에요. 지금의 나에게 맞게 계획을 조금 바꿔 볼까요?':escape(event.description)}</p>${autoWaiting?'<p class="auto-resume-hint">이번 선택을 마치면 생활이 자동으로 이어져요.</p>':''}<div class="choice-list">${event.choices.map(choice=>`<button class="choice-button" data-choice="${escape(choice.id)}"><span>${escape(constraint&&choices[choice.id]?choices[choice.id][0]:choice.label)}${(constraint?choices[choice.id]?.[1]:choice.description)?`<small>${escape(constraint?choices[choice.id]?.[1]:choice.description)}</small>`:''}</span><span aria-hidden="true">↗</span></button>`).join('')}</div>${constraint?`<details class="event-details"><summary>무엇이 겹쳤는지 자세히 보기</summary><p>${escape(event.description)}</p>${Number.isInteger(event.context?.details?.requiredMinutes)&&Number.isInteger(event.context?.details?.availableMinutes)?`<p>필요한 시간 ${event.context.details.requiredMinutes}분 · 이 시간대에 쓸 수 있는 시간 ${event.context.details.availableMinutes}분</p>`:''}${event.choices.map(c=>`<p><strong>${escape(c.label)}</strong> ${escape(c.description||'')}</p>`).join('')}</details>`:''}</div></section>`;
  }
  function visibleReviewLogs() { const markers = state.log.filter(l => l.type === 'week-summary' || l.type === 'week_summary'); const from = state.review?.from || state.weekStart || state.lastWeekStart || markers.at(-1)?.start; return from ? state.log.filter(l => l.date >= from) : state.log.slice(-28); }
  function logsHTML(logs, limit = 40) { return `<ol class="review-list">${logs.slice(-limit).map(log => `<li><time>${escape(log.date ? dateText(log.date) : '')}${log.automatic?' · 자동':''}</time><strong>${escape(logTitle(log))}</strong>${logDetail(log) ? `<p>${escape(logDetail(log))}</p>` : ''}${log.amount ? `<p>${money(log.amount)}</p>` : ''}</li>`).join('')}</ol>`; }
  function reviewHTML() {
    const logs = visibleReviewLogs(); replayEntries = logs.filter(l => l.type === 'activity');
    const chosen = replayEntries[Math.min(replayIndex,replayEntries.length-1)];
    return `<section class="week-story"><span class="eyebrow">A WEEK, LIVED</span><h2 id="phase-title" tabindex="-1">${replayEntries.length ? '이번 주에는 이런 날들이 있었어요.' : '조용히 지나간 한 주.'}</h2><p class="story-copy">${chosen ? `${dateText(chosen.date)}, ${escape(logTitle(chosen))}.` : '기본 일과를 보내며 다음 주를 맞을 준비를 했어요.'}</p>${replayEntries.length?`<button id="replay-next" class="scene-replay">${icon(chosen?.activityId)} 다음 장면 보기 ▷ (${Math.min(replayIndex+1,replayEntries.length)}/${replayEntries.length})</button>`:''}<div class="week-vignettes">${logs.filter(l=>['activity','artifact','achievement','event','incident'].includes(l.type)).slice(-3).map(l=>`<p>${icon(l.activityId)} ${escape(logTitle(l))}</p>`).join('')}</div><details class="review-records"><summary>이번 주 기록 자세히</summary>${logsHTML(logs)}</details><button id="continue-week" class="ghost manual-step">다음 주 직접 펼치기 →</button></section>`;
  }
  function monthHTML(summary) { const year = state.config.year || Number(state.date.slice(0,4)); return `<div class="memory-months">${Array.from({length:12},(_,i) => { const month = i+1, prefix = `${year}-${String(month).padStart(2,'0')}`, logs = state.log.filter(l => l.date?.startsWith(prefix)), actLogs = logs.filter(l => l.activityId && (l.type === 'activity' || l.type === 'activity-complete' || l.type === 'activity_completed' || l.type === 'activity_complete')), noteworthy = logs.filter(l => l.type === 'choice' || l.type === 'achievement' || l.type === 'event' || l.type === 'artifact' || l.type === 'incident'), days = new Date(Date.UTC(year,month,0)).getUTCDate(), currentMonth=Number(state.date.slice(5,7)); const memories = noteworthy.length ? noteworthy : actLogs; return `<article class="month-card${month>currentMonth && state.phase!=='finished'?' future':''}"><h3>${String(month).padStart(2,'0')} <small>월</small></h3><div class="month-dots" aria-label="${month}월 활동 달력">${Array.from({length:days},(_,d) => {const date=`${prefix}-${String(d+1).padStart(2,'0')}`, actions=actLogs.filter(l=>l.date===date), events=noteworthy.filter(l=>l.date===date);return `<i class="${events.length?'event':actions.length?'done':''}" title="${month}월 ${d+1}일: ${escape(actions.length ? actions.map(logTitle).join(', ') : events.length ? events.map(logTitle).join(', ') : '활동 기록 없음')}"></i>`;}).join('')}</div><p>${actLogs.length ? `기록한 활동 ${actLogs.length}회` : month>currentMonth && state.phase!=='finished' ? '아직 펼치지 않은 달' : '기록된 활동 없음'}</p>${memories.slice(-2).map(l=>`<p>· ${escape(logTitle(l))}</p>`).join('')}${actLogs.length||noteworthy.length?`<details class="month-records"><summary>날짜별 기록</summary><ul>${logs.filter(l=>l.type==='activity'||l.type==='event'||l.type==='achievement'||l.type==='artifact'||l.type==='incident').map(l=>`<li><strong>${Number(l.date.slice(8,10))}일</strong> ${escape(logTitle(l))}</li>`).join('')}</ul></details>`:''}</article>`; }).join('')}</div>`; }
  function memoriesHTML() { return `<section class="panel"><div class="section-title"><div><span class="eyebrow">LITTLE THINGS, LONG MEMORIES</span><h2>월별 기억의 서랍</h2></div><span class="pill">실제 기록</span></div><p class="subtle">초록은 활동한 날, 황토색은 사건이나 성취가 기록된 날이에요.<br>달력의 작은 칸에 마우스를 올리면 그날의 기록을 볼 수 있어요.</p>${monthHTML()}<div class="summary-block"><h3>내 손에 남은 것들</h3>${state.artifacts.length ? `<div class="artifact-list">${state.artifacts.map(artifactHTML).join('')}</div>` : '<p>아직 완성된 결과물이 없어요. 다음 주에는 작은 취미를 시작해 볼까요?</p>'}</div><details class="log-details"><summary>전체 기록 펼치기 · ${state.log.length}개</summary>${logsHTML(state.log,state.log.length)}</details></section>`; }
  function fullSummaryHTML() { const summary = S2Engine.getSummary(state), f = summary.finance || {}, counts = summary.activityCounts || {}, total = Object.values(counts).reduce((a,b)=>a+Number(b||0),0), cannot=summary.cannot || [], choices=(summary.postponed || []).filter(item=>item.category==='choice'); return `<section class="panel"><div class="journal-heading"><div><span class="eyebrow">YOUR YEAR, IN YOUR OWN WORDS</span><h2 id="phase-title" tabindex="-1">나의 ${summary.year || state.date.slice(0,4)}년, 마지막 페이지</h2></div><span class="pill rust">연말 결산</span></div><p class="summary-intro">잘한 날도, 쉬어 간 날도.<br>모두 나의 일 년이었어요.</p><p class="subtle">한 가지 점수로 평가하지 않고, 실제로 지나온 장면을 모았습니다.<br>미납금과 아직 받지 못한 보상도 이 기록에 그대로 남아요.</p><div class="summary-stats"><div class="summary-stat"><span>완료한 활동</span><strong>${total}회</strong></div><div class="summary-stat"><span>만든 결과물</span><strong>${state.artifacts.length}개</strong></div><div class="summary-stat"><span>지킨 반복 일정</span><strong>${typeof summary.kept==='number'?summary.kept:Array.isArray(summary.kept)?summary.kept.length:0}회</strong></div></div><div class="summary-block"><h3>가장 자주 한 활동</h3><div class="artifact-list">${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([id,count])=>`<div class="artifact"><span>${icon(id)}</span>${escape(activity(id)?.name || id)}<br><strong>${count}회</strong></div>`).join('') || '<p>기록된 활동이 없어요.</p>'}</div></div>${monthHTML(summary)}<div class="summary-block"><h3>손에 남은 취미 결과물</h3>${state.artifacts.length?`<div class="artifact-list">${state.artifacts.map(artifactHTML).join('')}</div>`:'<p>이번 해에는 완성된 취미 결과물이 없었어요.</p>'}</div><div class="summary-block"><h3>시험 · 연구 · 일의 결과</h3>${(summary.achievements || []).length?logsHTML(summary.achievements,100):'<p>이번 해에는 시험이나 연구 결과가 따로 남지 않았어요.</p>'}</div><div class="summary-block"><h3>관계에 남은 장면</h3>${(summary.relationshipScenes || []).length?logsHTML(summary.relationshipScenes,20):'<p>별도로 기록된 관계의 장면은 없어요.</p>'}</div><div class="summary-block"><h3>생활비 장부</h3><table class="financial-table"><tbody>${[['받은 수입',f.income],['생활비와 소비 · 미납 포함',f.consumption],['그중 월세',f.housingRent],['그중 '+housingLoanName(state.config)+' 이자',f.housingInterest],['그중 관리·유지비',f.housingMaintenance],...(f.incidentCosts?[["그중 사고 수리비",f.incidentRepair],["그중 사고 병원비",f.incidentMedical],["남은 사고 비용 미납",f.incidentArrears]]:[]),['마지막 현금',f.cash ?? state.finance.cash],['남은 '+housingLoanName(state.config)+' 원금',f.housingLoanPrincipal],['미납·카드 청구 예정',f.unpaidDebt],['남은 빚 합계',f.debt],['아직 받지 않은 보상',f.pendingPay]].map(([label,n])=>`<tr><th scope="row">${label}</th><td>${money(n)}</td></tr>`).join('')}</tbody></table></div><div class="summary-block"><h3>가장 즐거웠던 시기</h3><p>${summary.happiestMonth ? `${typeof summary.happiestMonth==='object' ? summary.happiestMonth.month : summary.happiestMonth}월은 기록한 기분의 평균이 가장 높았어요. 전체 삶의 평가가 아닌, 이 게임에서 남긴 상태 기록입니다.` : '비교할 기분 기록이 충분하지 않아요.'}</p></div><div class="summary-block"><h3>하고 싶었지만 어려웠던 일 · ${cannot.length}건</h3><p>돈·돌봄·사건·시간 충돌로 진행하지 못한 기록입니다.</p>${cannot.length?logsHTML(cannot,30):'<p>그런 날은 따로 기록되지 않았어요.</p>'}</div><div class="summary-block"><h3>직접·자동으로 바꾼 일정 · ${choices.length}건</h3><p>다른 일을 챙기려고 취소하거나 미룬 일정이에요. 자동 생활이 정한 기록에는 자동 표시를 남겨요.</p>${choices.length?logsHTML(choices,30):'<p>그런 날은 따로 기록되지 않았어요.</p>'}</div><div class="row"><button id="export-summary" class="secondary">한 해의 기록 JSON 내보내기</button><button id="new-game-summary" class="primary">다른 일 년 시작하기 ↗</button></div><details class="log-details"><summary>사건과 생활 기록 펼치기 · ${state.log.length}개</summary>${logsHTML(state.log,state.log.length)}</details></section>`; }
  function summaryHTML() {
    const summary=S2Engine.getSummary(state), memories=state.log.filter(l=>['achievement','artifact','relationship'].includes(l.type)).slice(-3);
    return `<section class="panel compact-yearbook"><span class="eyebrow">THE LIFE YOU JUST LIVED</span><h2 id="phase-title" tabindex="-1">${escape(state.config.personaName||'나')}의 한 해에 남은 것</h2><p class="subtle">잘한 날도, 쉬어 간 날도. 실제 기록에 남은 장면들이에요.</p><div class="year-highlights">${memories.length?memories.map(l=>`<p><span>${icon(l.activityId)}</span><strong>${escape(logTitle(l))}</strong><small>${dateText(l.date)}</small></p>`).join(''):'<p>바쁜 일과와 조용한 휴식이 쌓여 한 해가 되었어요.</p>'}</div><div class="compact-year-money"><span>마지막 현금 <strong>${money(summary.finance.cash)}</strong></span><span>남은 빚 · 주거대출 포함 <strong>${money(summary.finance.debt)}</strong></span></div><details id="year-details" class="disclosure"${openPanels.has('year-details')?' open':''}><summary>한 해의 기록 모두 보기 <span>달력 · 성과 · 장부</span></summary><div class="disclosure-body">${fullSummaryHTML().replace('id="phase-title"','id="year-detail-title"')}</div></details></section>`;
  }
  function compactStatusHTML() {
    const recovery=state.flags.recoveryUntil>=state.date?state.flags.recoveryCause:null,recoveryLabels={traffic_minor:'작은 교통사고 뒤',low_condition_week:'컨디션이 떨어져',sleep_disruption:'잠을 설친 뒤',weekday_overload:'바쁜 평일을 보낸 뒤'};
    const episode=state.healthEpisode,illness={influenza:'독감',pneumonia:'폐렴',hfmd:'수족구'};
    return `<div class="compact-status six-stats" aria-label="현재 생활 상태">${publicStats.map(([key,name])=>`<div data-stat="${key}"><span>${name}</span><strong>${Math.round(state.stats[key]??(key==='health'?70:60))}<small>/100</small></strong><div class="mini-meter" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,state.stats[key]??60))}%"></i></div></div>`).join('')}</div><div class="cash-and-home"><span>가진 돈 <strong>${money(state.finance.cash)}</strong></span><span class="fatigue-status">피로 ${Math.round(state.stats.fatigue)}</span>${state.household?`<span title="집안 정돈 ${Math.round(state.household.cleanliness)}/100">${state.household.cleanliness<45?'🧺 집을 정리할 때':state.household.cleanliness>=80?'🌿 말끔한 집':'🏡 생활의 흔적'}</span>`:''}</div>${incidentNoticeHTML()}${cosmeticRecoveryHTML()}${episode?`<div class="health-note">${episode.subject==='child'?'자녀 '+(episode.childIndex+1)+'의':'나의'} ${illness[episode.kind]||'몸 상태'} 회복을 기다리는 중이에요.<details><summary>상황 자세히</summary><p>일정을 줄이고 쉬거나 돌봄을 나눌 수 있어요. 게임의 가상 상황이며 건강을 예측하지 않습니다.${episode.kind==='hfmd'?' 이 게임에서는 0~2세 자녀에게만 발생하는 설정이에요.':''}</p></details></div>`:''}${recovery?`<p class="health-period">${recoveryLabels[recovery]||'몸을 돌보며'} 쉬어 가는 중 · ${dateText(state.flags.recoveryUntil)}까지</p>`:''}${state.flags.overloadSaturday===state.date?'<p class="health-period">이번 토요일은 피로를 풀며 보내요.</p>':''}${state.flags.vaccineDate?`<p class="vaccination-note">예방접종 기록 · ${dateText(state.flags.vaccineDate)}</p>`:''}`;
  }
  function directionsHTML() {
    return `<div class="life-directions" aria-label="자동으로 보낼 생활 방향">${directions.map(([id,emoji,label])=>`<button data-direction="${id}" aria-pressed="${direction===id}"><span aria-hidden="true">${emoji}</span>${label}</button>`).join('')}</div>`;
  }
  function autoPreferencesHTML() {
    const preferences=(state.config.preferences||[]).filter(id=>visibleActivities().some(a=>a.id===id));
    const cards=groupedActivitiesHTML(a=>{const reason=autoReason(a.id),chosen=preferences.includes(a.id);return `<button type="button" data-auto-preference="${a.id}" aria-pressed="${chosen}"${reason?` class="role-unavailable" title="${escape(reason)}${chosen?' · 눌러서 해제':''}"${!chosen?' disabled':''}`:''}><span aria-hidden="true">${icon(a.id)}</span><strong>${escape(a.name)}</strong><small>${reason?escape(reason)+(chosen?' · 선택 해제':''):price(a.id).amount?money(price(a.id).amount):'무료'}</small>${activityMeta(a)?`<small class="activity-meta">${escape(activityMeta(a))}</small>`:''}</button>`;},state.config,preferences,autoCategory,'auto-preference-grid');
    return `<details id="auto-preferences" class="auto-preferences"${openPanels.has('auto-preferences')?' open':''}><summary><strong>하고 싶은 일 · 해야 하는 일</strong><span>${preferences.length}개 선택 · 여러 개 골라도 좋아요</span></summary>${categorySelectHTML('auto-category',autoCategory)}<div id="auto-activity-groups">${cards}</div><p class="small-note">여행·체험과 시술은 아래 ‘이번 주 조금 더 챙기기’에서 직접 추가해요.</p></details><p class="preference-preview">${preferences.length?preferences.slice(0,4).map(id=>`${icon(id)} ${escape(activity(id)?.name||id)}${autoReason(id)?' (지금은 쉬어 두기)':''}`).join(' · ')+(preferences.length>4?` 외 ${preferences.length-4}개`:''):'아직 고른 일이 없어요. 우선 휴식과 기본 생활을 이어가요.'}</p><p class="small-note auto-preference-note">선택한 활동과 생활에 필요한 일을 함께 챙겨요. 언제든 멈추고 바꿀 수 있어요.</p>`;
  }
  function quickPlanHTML() {
    return `<details id="quick-plan-tools" class="quick-tools"${openPanels.has('quick-plan-tools')?' open':''}><summary>이번 주 조금 더 챙기기 <span>${activities.some(a=>a.parenting&&!roleReason(a.id))?'육아 · 활동 · 생활 방향':'활동 한 번 · 생활 방향'}</span></summary><div>${parentingTasksHTML()}<div class="quick-activity-row"><label class="field">이번 주에 한 번 추가할 일<select id="quick-activity">${activityOptionsHTML()}</select></label><button id="quick-add" class="secondary"${roleReason(selected)?' disabled':''}>빈 시간에 담기 ＋</button></div><p class="small-note">${roleReason(selected)?escape(roleReason(selected))+' 다른 일을 골라 보세요. ':''}${escape(activity(selected)?.description)} ${activity(selected)?.minutes||60}분 · ${money(price(selected).amount)}${['cinema','culture','friends','family_time'].includes(selected)?' · 생활비에 여유가 있다면 즐거움에 조금 써도 좋아요.':''}</p>${priceDetails(selected)}<p class="small-note">고른 일과 함께, 어떤 생활을 더 챙길까요?</p>${directionsHTML()}<p class="direction-note">${escape(directions.find(d=>d[0]===direction)?.[3]||'')}</p><button id="replan-auto" class="ghost">이번 주 자동 계획 다시 짜기 ↻</button><p class="small-note">직접 넣은 활동과 확정한 약속은 그대로 두어요.</p></div></details>`;
  }
  function eveningRuleHTML() {
    return `<form id="evening-rule-form" class="evening-rule-form"><h3>평일 저녁, 나만의 수업</h3><p class="small-note">한 주에 한 번, 퇴근이나 일과 뒤에 좋아하는 것을 배워요.</p><div class="form-grid"><label class="field">수업<select name="activityId">${['culture','draw','music','pottery','cook','study'].filter(id=>activity(id)).map(id=>`<option value="${id}">${escape(activity(id).name)}</option>`).join('')}</select></label><label class="field">요일<select name="weekday">${['월','화','수','목','금'].map((d,i)=>`<option value="${i+1}">${d}요일 저녁</option>`).join('')}</select></label></div><button type="submit" class="secondary">매주 저녁 예약하기 ＋</button><p class="small-note">평일 저녁을 그대로 예약해요. 직접 확정하거나, 자동 생활에 맡길 수 있어요.</p></form>`;
  }
  function planningStoryHTML() {
    const upcoming=state.plan.filter(p=>p.date>=state.date).slice(0,3);
    return `<section class="week-story"><h2>하고 싶은 일과 해야 하는 일을 골라 볼까요?</h2>${autoPreferencesHTML()}${upcoming.length?`<div class="upcoming-line" aria-label="이번 주 예정 활동">${upcoming.map(p=>`<span>${icon(p.activityId)} ${escape(activity(p.activityId)?.name)}</span>`).join('')}</div>`:''}${quickPlanHTML()}${autoNote?`<p class="auto-note" role="status">${escape(autoNote)}</p>`:''}</section>`;
  }
  function automaticNarrationHTML() {
    if(!autoNarration.length)return '';
    return `<div class="automatic-narration" aria-label="자동 생활이 남긴 최근 이야기"><span>방금 지나온 하루들</span><p>${escape(autoNarration.at(-1))}</p>${autoNarration.length>1?`<details><summary>조금 더 보기</summary>${autoNarration.slice(-3).map(note=>`<p>${escape(note)}</p>`).join('')}</details>`:''}</div>`;
  }
  function autoControlsHTML() {
    const waiting=autoPlaying&&autoWaiting, important=state.flags.autoDecisions==='important';
    return `${automaticNarrationHTML()}<label class="automatic-policy"><input id="important-decisions" type="checkbox"${important?' checked':''}><span>중요한 선택은 직접 할게요</span><small>${important?'선택한 뒤에는 자동으로 이어져요.':'일정과 사건을 알아서 선택해요.'}</small></label><div class="autoplay-controls"><div class="auto-control-copy"><strong>${waiting?'이번 이야기는 당신의 선택을 기다려요':autoPlaying?'생활이 이어지고 있어요':'작은 선택이 쌓이는 일 년'}</strong><span>${waiting?'답한 뒤에는 자동으로 이어집니다.':autoPlaying?'언제든 멈춰서 직접 계획할 수 있어요.':'좋아하는 일을 고르고, 흐르는 일상을 지켜보세요.'}</span></div><button id="auto-play" class="primary" data-playing="${autoPlaying}" data-awaiting-decision="${waiting}" aria-pressed="${autoPlaying}">${autoPlaying?'Ⅱ 일시정지':'▶ 자동으로 살아보기'}</button>${state.phase!=='event'?'<button id="step-week" class="ghost" title="자동 일정을 추가하지 않고 현재 계획으로 한 주 진행">한 주씩 직접 →</button>':''}</div>`;
  }
  function plannerToday() {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('-');
  }
  function plannerTransferHTML() {
    if(!state)return '';
    const completion=S2PlannerBridge.completionStatus(state);
    if(!completion.ok)return `<aside class="planner-transfer planner-transfer-locked" aria-labelledby="planner-transfer-title"><div><span class="eyebrow">AFTER ONE WHOLE YEAR</span><h2 id="planner-transfer-title">한 해를 산 뒤, 내 주말 계획표로</h2><p id="planner-transfer-locked">1월 1일부터 12월 31일까지 모두 살아야 초안을 만들 수 있어요. <strong>마친 하루 ${completion.completedDays} / ${completion.totalDays}일</strong></p></div><div class="planner-transfer-action"><button id="open-weekend-draft" class="planner-transfer-link" type="button" disabled aria-describedby="planner-transfer-locked">한 해를 마치면 초안 열기</button></div></aside>`;
    const weekend=S2PlannerBridge.weekendFor(plannerToday());
    return `<aside class="planner-transfer" aria-labelledby="planner-transfer-title"><div><span class="eyebrow">FROM THIS LIFE TO YOUR WEEKEND</span><h2 id="planner-transfer-title">이 삶에서, 내 주말 계획표로</h2><p><strong>${dateText(weekend.saturday)} 토요일 — ${dateText(weekend.sunday)} 일요일</strong> · 한국 날짜 기준</p><details id="planner-transfer-info"${openPanels.has('planner-transfer-info')?' open':''}><summary>초안을 만드는 기준</summary><p>한 해를 끝까지 산 삶의 기록으로 작성해요. 같은 해의 해당 주말은 주인공이 경험한 기록을 옮기고, 다른 해라면 완주한 해의 토요일·일요일 기록을 각각 평균내어 참고해요.</p><p>기존 주말 회복 플래너에서 자유롭게 고칠 수 있어요. 게임의 시간과 돈은 바뀌지 않아요.</p></details></div><div class="planner-transfer-action"><a id="open-weekend-draft" class="planner-transfer-link" href="../weekend_recovery_simulator/weekend_recovery_simulator.html">주말 계획표 초안 열기 <span aria-hidden="true">↗</span></a></div></aside>`;
  }
  function openWeekendDraft(event) {
    event.preventDefault();
    const completion=S2PlannerBridge.completionStatus(state);
    if(!completion.ok){announce(completion.reason,true);return;}
    stopAutomatic();
    try {
      const draft=S2PlannerBridge.createDraft(state,{today:plannerToday()});
      const valid=S2PlannerBridge.validateDraft(draft);
      if(!valid.ok){render();announce(valid.reason||'계획표 초안을 만들지 못했어요.',true);return;}
      const id=window.crypto.randomUUID();
      sessionStorage.setItem('websim-season2-draft:'+id,JSON.stringify(draft));
      save();
      window.location.assign('../weekend_recovery_simulator/weekend_recovery_simulator.html?season2Draft='+encodeURIComponent(id));
    } catch(error) {render();announce('초안을 작성하거나 전달하지 못했어요. 다시 시도하고, 계속되면 브라우저의 사이트 저장 허용 상태를 확인해 주세요.',true);}
  }
  function render() {
    if(!visibleActivities().some(a=>a.id===selected))selected='rest';
    const focused=document.activeElement;
    const preferenceScroll=$('.auto-preference-grid')?.scrollTop||0;
    const focusKey=focused?.dataset?.parentingAdd?`[data-parenting-add="${focused.dataset.parentingAdd}"]`:focused?.dataset?.autoPreference?`[data-auto-preference="${focused.dataset.autoPreference}"]`:focused?.dataset?.date&&focused?.dataset?.slot?`[data-date="${focused.dataset.date}"][data-slot="${focused.dataset.slot}"]`:focused?.dataset?.tab?`.tab[data-tab="${focused.dataset.tab}"]`:focused?.dataset?.activity?`[data-activity="${focused.dataset.activity}"]`:focused?.dataset?.direction?`[data-direction="${focused.dataset.direction}"]`:focused?.id?`#${focused.id}`:focused?.tagName==='SUMMARY'&&focused.parentElement.id?`#${focused.parentElement.id} > summary`:null;
    const app=$('#app');
    if(!state) app.innerHTML=setupHTML();
    else {
      const year=Number(state.date.slice(0,4)),day=Math.round((Date.parse(state.date)-Date.parse(`${year}-01-01`))/86400000)+1,total=(Date.parse(`${year+1}-01-01`)-Date.parse(`${year}-01-01`))/86400000;
      const finished=state.phase==='finished';
      const story=state.phase==='event'?eventHTML():state.phase==='review'?reviewHTML():planningStoryHTML();
      app.innerHTML=`<div class="play-heading"><div><span class="eyebrow">ONE LITTLE YEAR</span><h1>${escape(state.config.personaName||'나')}의 ${year}년</h1><p>${dateText(state.date)} ${weekday(state.date)}요일 <span>· ${Math.min(day,total)} / ${total}일</span></p></div><details id="save-tools" class="save-menu"${openPanels.has('save-tools')?' open':''}><summary>기록과 저장 ⋯</summary><div class="save-menu-body"><button id="save-game">지금 저장</button><button id="export-save">JSON 내보내기</button><button id="import-save">파일 불러오기</button><button id="new-game">다른 삶 시작</button></div></details></div>${!S2Calendar.holidayStatus(year).verified?`<p class="holiday-warning">${escape(S2Calendar.holidayStatus(year).label)}</p>`:''}<div class="year-progress story-progress" role="progressbar" aria-label="올해 진행" aria-valuenow="${Math.min(day,total)}" aria-valuemin="0" aria-valuemax="${total}"><i style="width:${Math.min(100,day/total*100)}%"></i></div><div class="play-stage phase-${state.phase}"><div class="stage-scene">${sceneHTML()}${compactStatusHTML()}</div>${finished?'<div class="year-complete-note"><span class="eyebrow">THE LAST PAGE</span><h2>어느새, 다시 새해 앞에서.</h2><p>지나온 날들에 남은 장면을 모았어요.</p></div>':`<div class="stage-story">${story}</div>`}</div>${finished?plannerTransferHTML()+summaryHTML():autoControlsHTML()+plannerTransferHTML()}<div class="play-drawers">${state.phase==='planning'?`<details id="manual-tools" class="disclosure"${openPanels.has('manual-tools')?' open':''}><summary>날짜를 직접 정하고 싶다면 <span>이번 주 · 반복 일정</span></summary><div class="disclosure-body"><nav class="tabs" aria-label="직접 계획 도구">${[['planner','이번 주 계획'],['routines','반복 일정'],['memories','기억의 서랍']].map(([id,label])=>`<button class="tab" data-tab="${id}" aria-pressed="${tab===id}">${label}</button>`).join('')}</nav>${tab==='routines'?routineHTML():tab==='memories'?memoriesHTML():plannerHTML()}</div></details>`:''}<details id="state-details" class="disclosure"${openPanels.has('state-details')?' open':''}><summary>생활의 자세한 모습 <span>상태 · 돈 · 취미</span></summary><div class="disclosure-body state-details-grid">${metricsHTML()}${financeHTML()}${collectionHTML()}${generationBasisHTML(state.config)}${healthSourcesHTML()}</div></details>${!finished?`<details id="memories-drawer" class="disclosure"${openPanels.has('memories-drawer')?' open':''}><summary>지나온 장면들 <span>월별 기억</span></summary><div class="disclosure-body">${memoriesHTML()}</div></details>`:''}</div>`;
    }
    bind();
    if($('.auto-preference-grid'))$('.auto-preference-grid').scrollTop=preferenceScroll;
    const shownActivity=state?.phase==='review'&&replayEntries.length?replayEntries[Math.min(replayIndex,replayEntries.length-1)]?.activityId:state?sceneActivity:'rest';
    S2Scene.attach($('#life-scene'),state||{config,date:`${config.year}-01-01`,artifacts:[]},shownActivity);
    if(state&&state.phase!==lastPhase&&['event','finished'].includes(state.phase))$('#phase-title')?.focus({preventScroll:true});
    else if(focusKey&&(!autoPlaying||autoWaiting||['auto-play','important-decisions'].includes(focused?.id)||focused?.tagName==='SUMMARY'))$(focusKey)?.focus({preventScroll:true});
    lastPhase=state?.phase||'setup';
  }
  function stopAutomatic(note='') {
    clearTimeout(autoTimer); autoTimer=null; autoPlaying=false;autoWaiting=false;
    if(note)autoNote=note;
  }
  function scheduleAutomatic() { clearTimeout(autoTimer);autoTimer=null;if(autoPlaying&&!autoWaiting)autoTimer=setTimeout(tickAutomatic,850); }
  function tickAutomatic() {
    if(!autoPlaying||autoWaiting||!state||autoBusy)return;
    autoBusy=true;
    try {
      const before=state.log.length;
      const result=S2Engine.advanceAutomatic(state,{direction,maxDays:7,decisions:state.flags.autoDecisions||'auto'});
      replayIndex=0;
      const notes=(result.notes||[]).filter(note=>typeof note==='string'&&note);
      const played=state.log.slice(before).filter(log=>log.type==='activity').at(-1);
      if(played){sceneActivity=played.activityId;if(!notes.length)notes.push(`${dateText(played.date)}, ${logTitle(played)}.`);}
      const incident=state.log.slice(before).findLast(log=>log.type==='incident');
      if(incident)notes.push(`${dateText(incident.date)}, ${logTitle(incident)}. ${logDetail(incident)}`);
      autoNarration=[...autoNarration,...notes].slice(-3);
      if(result.stopped==='major-decision'||result.stopped==='decision'){autoWaiting=true;autoNote='';}
      else if(result.ok===false||['blocked','reservation'].includes(result.stopped)){
        stopAutomatic(result.reason||result.issues?.[0]?.reason||'이 일정은 직접 살펴봐야겠어요. 잠시 멈춰 두었어요.');
        if(state.phase==='planning'){openPanels.add('manual-tools');tab=reservations().length?'routines':'planner';}
      }
      if(state.phase==='finished')stopAutomatic();
      save();render();
    } catch(err) { stopAutomatic('진행을 잠시 멈췄어요. '+err.message);console.error(err);render();announce(autoNote,true); }
    finally { autoBusy=false;scheduleAutomatic(); }
  }
  function toggleAutomatic() {
    if(autoPlaying){stopAutomatic('잠시 멈췄어요. 원하는 때 다시 이어갈 수 있어요.');render();return;}
    if(!state||state.phase==='finished')return;
    autoNote='';autoWaiting=false;openPanels.delete('manual-tools');openPanels.delete('save-tools');autoPlaying=true;render();scheduleAutomatic();
  }
  function startLife() {
    stopAutomatic(); const form=$('#setup-form');
    if(form)$$('[data-money-won]',form).forEach(normalizeMoneyInput);
    config=readConfig();syncRoleAgeLimit();
    if(!Number.isInteger(config.age)||config.age<18||config.age>100){
      openPanels.add('advanced-settings');$('#advanced-settings').open=true;
      announce('새 삶은 18~100세로 시작할 수 있어요. 연도 또는 나이를 조정해 주세요.',true);
      $('#setup-form [name=age]')?.focus();return;
    }
    if(config.role==='graduate'&&!S2Data.roleAvailableForNewLife(config.role,config.age)){
      openPanels.add('advanced-settings');$('#advanced-settings').open=true;
      announce('대학원생은 46세까지 새로 시작할 수 있어요. 나이 또는 생활 역할을 조정해 주세요.',true);
      $('#setup-form [name=age]')?.focus();return;
    }
    if(form&&!form.checkValidity()){openPanels.add('advanced-settings');$('#advanced-settings').open=true;form.reportValidity();return;}
    config=readConfig();const errors=S2Engine.validateConfig(config)||[];
    if(errors.length){announce(errors.join(' · '),true);return;}
    if(saveAvailable&&!confirm('저장되어 있는 삶을 새 게임으로 바꿀까요? 필요한 기록은 먼저 JSON으로 내보내 주세요.'))return;
    try {state=S2Engine.create(config,presetId);direction='balanced';tab='planner';autoNote='';autoNarration=[];sceneActivity='rest';openPanels.clear();changed();window.scrollTo({top:0,behavior:'instant'});}
    catch(err){announce(err.message,true);}
  }
  function readConfig() {
    const form = $('#setup-form'); if (!form) return config;
    const data = new FormData(form), next = {...config};
    for (const [key, value] of data) if (key !== 'preferences' && !key.startsWith('child-')) next[key] = moneyFields.includes(key) ? readMoneyInput(form.elements.namedItem(key)) : key==='housingLoanRateBps'?Math.round(Number(value)*100):['age','children','careShare','payDay','seed'].includes(key) ? Number(value) : value;
    next.gender=setupGender(next.gender);
    next.preferences = data.getAll('preferences'); return next;
  }
  function syncEconomyInputs() {
    const form=$('#setup-form');if(!form)return;
    for(const key of moneyFields)setMoneyInput(form.elements.namedItem(key),config[key]??0);
    for(const key of ['housing','housingTenure'])if(form.elements.namedItem(key))form.elements.namedItem(key).value=config[key];
    if(form.elements.namedItem('housingLoanRateBps'))form.elements.namedItem('housingLoanRateBps').value=config.housingLoanRateBps/100;
  }
  function readyForEconomy(c) {
    if(!Number.isInteger(c.age)||c.age<18||c.age>100||!Number.isInteger(c.children)||c.children<0||c.children>6||c.children&&c.childAge==='none')return false;
    return S2Data.getChildren(c).every(child=>Number.isInteger(child.age)&&child.age>=0&&child.age<c.age&&child.age<=49);
  }
  function customizeEconomy() {
    if(config.economicProfile)config.economicProfile.active=false;
    if(config.incomeOrigin)config.incomeOrigin.kind='custom';
  }
  function exportSave(summaryOnly = false) { if (!state) return; const content = summaryOnly ? JSON.stringify({kind:'weekend-season2-yearbook',version:S2Data.VERSION,summary:S2Engine.getSummary(state)},null,2) : S2Storage.serialize(state); const blob = new Blob([typeof content==='string'?content:JSON.stringify(content,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=`weekend-season2-${summaryOnly?'yearbook-':''}${state.date}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); announce('기록을 JSON 파일로 내보냈어요.'); }
  function click(selector, handler) { $$(selector).forEach(el => el.addEventListener('click', event => { try { const wasAuto=autoPlaying&&!el.matches('#auto-play,[data-choice]');if(wasAuto)stopAutomatic('직접 선택하기 위해 잠시 멈췄어요.');handler(event,el);if(wasAuto)render(); } catch (err) { console.error(err); announce(`진행 중 문제가 생겼어요: ${err.message}`,true); } })); }
  function bind() {
    syncRoleAgeLimit();
    $('#auto-category')?.addEventListener('change',event=>{autoCategory=event.target.value;applyCategoryFilter($('#auto-activity-groups'),autoCategory);});
    $('#setup-category')?.addEventListener('change',event=>{setupCategory=event.target.value;applyCategoryFilter($('#setup-activity-groups'),setupCategory);});
    $('#catalog-category')?.addEventListener('change',event=>{filter=event.target.value;render();});
    $$('details[id]').forEach(details=>{
      const summary=details.querySelector(':scope > summary');
      summary?.addEventListener('click',event=>{event.preventDefault();details.open=!details.open;if(details.open)openPanels.add(details.id);else openPanels.delete(details.id);if(autoPlaying&&['manual-tools','quick-plan-tools','parenting-tasks','auto-preferences','save-tools','planner-transfer-info'].includes(details.id)){stopAutomatic('직접 고르는 동안 잠시 멈췄어요.');render();}});
    });
    click('[data-preset]',(_,el)=>{const p=presets.find(p=>p.id===el.dataset.preset);config=clone(p.config);config.year=chosenYear;normalizeSetupGenders();presetId=p.id;config.personaName=config.personaName||({worker:'서윤',seeker:'지후',graduate:'하린',caregiver:'도윤'}[config.role]);config.lifeIntro=config.lifeIntro||p.description;refreshSetupName();openPanels.add('advanced-settings');render();});
    click('#reroll-life',()=>{stopAutomatic();freshLife();render();announce('새로운 가상의 삶을 만났어요.');});
    click('#start-btn',startLife);
    $('#start-year')?.addEventListener('change',event=>{
      config=readConfig();
      const nextYear=Number(event.target.value),delta=nextYear-config.year;
      // A year change keeps this person's birth year. Rerolls and presets start
      // a new person at the chosen year; manual age edits establish a new anchor.
      config.age+=delta;config.year=chosenYear=nextYear;
      const age=$('#setup-form [name=age]');if(age)age.value=String(config.age);
      updateSetupPreview({target:{name:'year'}});render();
    });
    const updateSetupPreview=event=>{
      const oldChildren=config.children,oldChildAge=config.childAge,oldMoney=Object.fromEntries([...moneyFields,'housingLoanRateBps'].map(key=>[key,config[key]]));
      config=readConfig();const changed=event?.target?.name;syncRoleAgeLimit();
      const isMoney=[...moneyFields,'housingLoanRateBps'].includes(changed);
      if(isMoney&&(event?.type==='input'||oldMoney[changed]!==config[changed]))customizeEconomy();
      if(['children','childAge'].includes(changed)&&(oldChildren!==config.children||oldChildAge!==config.childAge)){
        config.childProfiles=null;normalizeSetupGenders();
        const panel=$('#child-profiles');if(panel?.open)openPanels.add('child-profiles');if(panel)panel.outerHTML=childProfilesHTML();
      } else if(changed?.startsWith('child-')) {
        const form=$('#setup-form'), children=S2Data.getChildren(config);
        config.childProfiles=children.map((child,i)=>{const age=Number($(`[name="child-age-${i}"]`,form)?.value??child.age),gender=$(`[name="child-gender-${i}"]`,form)?.value||child.gender,military=$(`[name="child-military-${i}"]`,form);if(military){military.disabled=age<18||age>35||gender!=='man';if(military.disabled)military.value='none';}return {age,gender,militaryStatus:age<18||age>35||gender!=='man'?'none':military?.value||child.militaryStatus};});
        if(config.childProfiles.length)config.childAge=S2Data.childStage(Math.min(...config.childProfiles.map(child=>child.age)));
        $('[name="childAge"]',form).value=config.childAge;
      }
      if(changed==='province'){
        config.residenceOrigin='custom';
        if(S2Data.SUBREGIONS.byId(config.subregionId)?.provinceId!==config.province)config.subregionId=S2Data.sampleSubregion(config.generationSeed??config.seed,config.province);
        syncSubregionField();
      }
      if(changed==='subregionId')config.residenceOrigin='custom';
      const conditions=['year','age','role','children','childAge','maritalStatus','province','subregionId','housing','housingTenure'];
      if(config.economicProfile?.active&&(conditions.includes(changed)||changed?.startsWith('child-'))&&readyForEconomy(config)){
        const beforeHousing=config.housing;
        S2Data.assignLifeEconomy(config,{preserveTenure:true});syncEconomyInputs();
        if(beforeHousing!==config.housing)announce('가족이 함께 지낼 공간으로 집 크기를 맞췄어요.');
      }else if(!config.economicProfile&&['province','subregionId','role'].includes(changed)&&config.generationModel&&config.incomeOrigin?.kind!=='custom'&&config.province!=='unspecified'){
        S2Data.assignRegionalIncome(config);syncEconomyInputs();
      }
      if(changed==='housingTenure'&&config.housingTenure!=='rent'){config.monthlyRent=0;setMoneyInput($('#setup-form [name=monthlyRent]'),0);}
      const rentField=$('[data-housing-rent]');if(rentField){rentField.hidden=config.housingTenure!=='rent';$('input',rentField).disabled=config.housingTenure!=='rent';}
      for(const key of ['housingLoanPrincipal','housingLoanRateBps','housingMaintenance']){const field=$('#setup-form [name='+key+']');if(field)field.disabled=config.housingTenure==='unspecified';}
      const costLabel=$('#setup-form [name=fixedCosts]')?.parentElement?.firstChild;if(costLabel)costLabel.textContent=livingCostLabel(config)+' (만원)';
      const ageHealthBodyEl=$('#setup-age-health [data-age-health-body]');if(ageHealthBodyEl)ageHealthBodyEl.innerHTML=ageHealthBody(config);
      const housingPreview=$('#housing-preview');if(housingPreview)housingPreview.innerHTML=housingPreviewHTML(config);
      const loanNote=$('#housing-loan-note');if(loanNote)loanNote.textContent=housingLoanNote(config);
      const housingFact=$('.life-housing');if(housingFact)housingFact.textContent=housingLine(config);
      const housingBasis=$('#housing-basis');if(housingBasis)housingBasis.innerHTML=housingBasisHTML(config);
      const budget=$('#economy-breakdown');if(budget)budget.innerHTML=economyBreakdownHTML(config);
      const modeNote=$('#economy-mode-note');if(modeNote)modeNote.textContent=economyModeText(config);
      if(['year','age','gender'].includes(changed))refreshSetupName();
      const nameHeading=$('.meeting-intro h1 strong');if(nameHeading)nameHeading.textContent=config.personaName;
      const family=familyText(config);
      const favorites=(config.preferences||[]).slice(0,2).map(id=>activity(id)?.name).filter(Boolean).join(', ');
      if(changed==='year')config.lifeIntro=config.lifeIntro.replace(/^([^,]+), -?\d+세\./,(_,name)=>`${name}, ${config.age}세.`);
      else config.lifeIntro=`${config.province==='unspecified'?'':residenceLabel(config)+' · '}${housingLabels[config.housing]}에서 ${roleLabels[config.role]}의 일과를 보내고 있습니다. ${config.children?`${config.maritalStatus==='divorced'?'이혼 후 ':config.maritalStatus==='widowed'?'사별 후 ':''}자녀 ${config.children}명과 함께 생활하며 돌봄을 ${config.careShare}% 분담합니다.`:config.maritalStatus==='divorced'?'이혼 후 나만의 생활 리듬을 만들어 갑니다.':config.maritalStatus==='widowed'?'사별 후 나만의 생활 리듬을 만들어 갑니다.':'일상 사이에 나를 위한 시간을 찾아갑니다.'}${favorites?` ${favorites} 같은 작은 즐거움을 이어가고 싶습니다.`:''}`;
      syncSetupActivityChoices();
      S2Scene.update({config,date:`${config.year}-01-01`,artifacts:[]},'rest');
      const caption=$('.scene-caption strong');if(caption)caption.textContent=housingCaption(config);
      const byline=$('.life-byline');if(byline)byline.textContent=`${config.age}세 · ${genderLabel(config.gender)} · ${roleLabels[config.role]} · ${family}`;
      const intro=$('.life-intro');if(intro)intro.textContent=config.lifeIntro;
      const basis=$('#life-basis .disclosure-body');if(basis)basis.innerHTML=generationBasisBody(config);
      const facts=$('.life-facts');if(facts)facts.innerHTML=economyFactsHTML(config);
    };
    click('#rebalance-economy',()=>{
      config=readConfig();
      if(!readyForEconomy(config)){announce('나이와 자녀 설정을 먼저 확인해 주세요.',true);return;}
      if(config.province==='unspecified'){announce('살림을 다시 정하려면 거주 시·도를 먼저 골라 주세요.',true);$('#setup-form [name=province]')?.focus();return;}
      const beforeHousing=config.housing;
      S2Data.assignLifeEconomy(config,{preserveTenure:config.housingTenure!=='unspecified'});syncEconomyInputs();updateSetupPreview();
      announce(beforeHousing!==config.housing?'가족이 함께 지낼 공간과 살림을 다시 맞췄어요.':'현재 환경에 맞춰 수입과 생활비를 다시 정했어요.');
    });
    $('#setup-form')?.addEventListener('input',event=>{if(moneyFields.includes(event.target.name))event.target.dataset.moneyDirty='true';updateSetupPreview(event);});
    $('#setup-form')?.addEventListener('change',event=>{normalizeMoneyInput(event.target);updateSetupPreview(event);});
    $('#setup-form')?.addEventListener('focusout',event=>{if(normalizeMoneyInput(event.target))updateSetupPreview(event);});
    $('#setup-form')?.addEventListener('submit',event=>{event.preventDefault();startLife();});
    click('#resume-game',()=>{stopAutomatic();autoNarration=[];const loaded=S2Storage.load();if(loaded.ok&&loaded.state){state=loaded.state;direction=directionIds.includes(state.flags?.autoDirection)?state.flags.autoDirection:'balanced';openPanels.clear();sceneActivity=state.log.filter(l=>l.type==='activity').at(-1)?.activityId||'rest';render();announce('저장한 날짜에서 이어갑니다.');}else announce(loaded.reason||'저장 기록을 읽을 수 없어요.',true);});
    click('#auto-play',toggleAutomatic);
    click('#open-weekend-draft',openWeekendDraft);
    $('#important-decisions')?.addEventListener('change',event=>{state.flags.autoDecisions=event.target.checked?'important':'auto';if(autoPlaying&&autoWaiting&&!event.target.checked)autoWaiting=false;save();render();scheduleAutomatic();});
    click('[data-direction]',(_,el)=>{const next=el.dataset.direction,result=S2Engine.replaceAutoWeek(state,{direction:next});if(result.ok){direction=next;state.flags.autoDirection=direction;autoNote='';}handleResult(result);});
    click('[data-auto-preference]',(_,el)=>{const id=el.dataset.autoPreference,previous=state.config.preferences||[],preferences=previous.includes(id)?previous.filter(item=>item!==id):[...previous,id];const result=S2Engine.replaceAutoWeek(state,{preferences,direction});if(result.ok)autoNote='';handleResult(result,result.ok?'선택한 일을 바꿨어요. 이번 주 자동 계획에도 반영했어요.':undefined);});
    $('#quick-activity')?.addEventListener('change',event=>{stopAutomatic();selected=event.target.value;sceneActivity=selected;render();});
    const addQuickActivity=id=>{
      selected=id;
      let result={ok:false,reason:'이번 주에 비어 있는 시간이 없어요. 직접 계획에서 다른 활동을 비우거나 다음 주에 담아 보세요.'};
      for(const day of S2Engine.currentWeek(state)){for(const slot of day.slots){if(slot.available===false||state.plan.some(p=>p.date===day.date&&p.slot===slot.id))continue;result=S2Engine.addPlan(state,{date:day.date,slot:slot.id,activityId:selected,payment});if(result.ok){sceneActivity=selected;handleResult(result,`${activity(selected).name}, ${dateText(day.date)} ${labels[slot.id]}에 담았어요.`);return;}}}
      handleResult(result);
    };
    click('#quick-add',()=>addQuickActivity(selected));
    click('[data-parenting-add]',(_,el)=>addQuickActivity(el.dataset.parentingAdd));
    click('#replan-auto',()=>{handleResult(S2Engine.replaceAutoWeek(state,{direction}),'이번 주를 다시 살펴보고 일정을 마련했어요.');});
    click('#step-week',()=>{replayIndex=0;if(state.phase==='review')handleResult(S2Engine.finishReview(state));else handleResult(S2Engine.advance(state));});
    click('#save-game',()=>{save(false);render();});click('#export-save',()=>exportSave());click('#export-summary',()=>exportSave(true));click('#import-save',()=>$('#import-file').click());
    click('#new-game, #new-game-summary',()=>{if(!confirm('이 삶의 화면을 닫고 다른 삶을 만나 볼까요? 새 삶을 시작하기 전까지 기존 저장은 유지돼요.'))return;stopAutomatic();state=null;openPanels.clear();freshLife();render();window.scrollTo({top:0,behavior:'instant'});});
    click('[data-tab]',(_,el)=>{tab=el.dataset.tab;openPanels.add('manual-tools');render();});click('[data-filter]',(_,el)=>{filter=el.dataset.filter;render();});click('[data-activity]',(_,el)=>{selected=el.dataset.activity;sceneActivity=selected;render();});
    $('#payment')?.addEventListener('change',event=>{payment=event.target.value;});
    click('.slot[data-date]',(_,el)=>{if(el.dataset.planId){handleResult(S2Engine.removePlan(state,el.dataset.planId,'choice'),'다른 시간을 위해 이 활동을 비웠어요.');}else handleResult(S2Engine.addPlan(state,{date:el.dataset.date,slot:el.dataset.slot,activityId:selected,payment}),`${activity(selected).name}을 계획에 담았어요.`);});
    click('#advance-week',()=>{replayIndex=0;handleResult(S2Engine.advance(state));}); click('#advance-choice',()=>{replayIndex=0;handleResult(S2Engine.advance(state,{untilChoice:true}));});
    click('[data-choice]',(_,el)=>{replayIndex=0;const result=S2Engine.choose(state,el.dataset.choice);if(result.ok){autoNote='';autoWaiting=false;}handleResult(result);if(result.ok&&autoPlaying)scheduleAutomatic();});
    click('#continue-week',()=>{replayIndex=0;tab='planner';handleResult(S2Engine.finishReview(state));});
    click('#replay-next',()=>{replayIndex=(replayIndex+1)%Math.max(1,replayEntries.length);render();});
    const ruleForm=$('#rule-form');
    const applyRuleCadence=()=>{
      if(!ruleForm)return;
      const item=activity(ruleForm.elements.activityId.value),cadence=item?.cadence,procedure=item?.procedure;
      if(cadence){ruleForm.elements.kind.value=cadence.unit;ruleForm.elements.interval.value=cadence.interval;}
      let note=$('[data-rule-cadence]',ruleForm);
      if(!note){note=document.createElement('p');note.className='small-note';note.dataset.ruleCadence='';ruleForm.querySelector('h3').after(note);}
      note.textContent='';
      if(cadence)note.textContent=`미용실 기본 주기 · ${cadence.label}. 필요하면 간격을 직접 바꿀 수 있어요.`;
      if(procedure?.minIntervalDays){ruleForm.elements.kind.value='weeks';ruleForm.elements.interval.value=4;note.textContent='레이저 제모는 최소 4주(28일) 간격이에요. 회복 기간에는 야외 일정을 잡을 수 없어요.';}
      if(procedure?.oncePerLife)note.textContent='한 삶에서 한 번만 마칠 수 있어요. 건너뛰면 다음 회차에 다시 예약하고, 실제로 마치면 이 활동의 예약은 자동 종료됩니다.';
      note.hidden=!cadence&&!procedure?.minIntervalDays&&!procedure?.oncePerLife;
    };
    ruleForm?.elements.activityId.addEventListener('change',applyRuleCadence);applyRuleCadence();
    $('#rule-form')?.addEventListener('submit',event=>{
      event.preventDefault();const data=Object.fromEntries(new FormData(event.target));for(const key of ['interval','dayOfMonth','nth','weekday'])data[key]=Number(data[key]);
      try{
        const result=S2Engine.addRule(state,data);
        // A rejected registration is pure. Keep the activity and every entered
        // date/interval visible so correcting one field cannot book another task.
        if(!result.ok){announce(result.reason||'반복 일정 조건을 확인해 주세요.',true);return;}
        handleResult(result,'반복 규칙을 만들었어요. 이번 주 예약 날짜를 확인해 주세요.');
      }catch(err){announce(err.message,true);}
    });
    $('#evening-rule-form')?.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.target),chosen=Number(data.get('weekday'));let anchor=state.date;while(new Date(anchor+'T12:00:00Z').getUTCDay()!==chosen)anchor=S2Calendar.addDays(anchor,1);if(anchor.slice(0,4)!==state.date.slice(0,4)){announce('올해는 이 요일이 남아 있지 않아요. 다른 요일을 골라 보세요.',true);return;}handleResult(S2Engine.addRule(state,{activityId:data.get('activityId'),anchor,kind:'weeks',interval:1,basis:'scheduled',move:'keep',slot:'evening',payment:'cash'}),'매주 저녁을 예약했어요. 이번 주 날짜를 보고 확정해 주세요.');});
    click('#confirm-reservations',()=>handleResult(S2Engine.confirmReservations(state),'예약을 확인했어요. 확정된 일정은 이번 주 계획에서 볼 수 있어요.'));
    click('[data-reserve-confirm]',(_,el)=>{const r=reservations().find(r=>r.id===el.dataset.reserveConfirm);if(!r)return;handleResult(S2Engine.addPlan(state,{date:r.date,slot:r.slot,activityId:r.activityId,payment:r.payment,ruleId:r.ruleId,originalDate:r.originalDate}),'예약을 확정했어요.');});
    click('[data-reserve-skip]',(_,el)=>{const r=reservations().find(r=>r.id===el.dataset.reserveSkip);if(!r)return;handleResult(S2Engine.skipReservation(state,r,'choice'),'이번 회차를 건너뛰었어요. 다음 회차의 예약은 유지됩니다.');});
    click('[data-reserve-postpone]',(_,el)=>{const r=reservations().find(r=>r.id===el.dataset.reservePostpone);if(!r)return;const nextDate=S2Calendar.addDays(r.date,1);if(nextDate>state.date.slice(0,4)+'-12-31'){announce('올해 안에 더 미룰 날짜가 없어요. 이번 회차를 건너뛸 수 있습니다.',true);return;}const row=el.closest('.reservation'); if($('.inline-form',row))return; const form=document.createElement('form');form.className='inline-form';form.innerHTML=`<label class="small-note">새 날짜 <input type="date" name="date" value="${nextDate}" min="${nextDate}" max="${state.date.slice(0,4)}-12-31" required></label><button type="submit">날짜 변경</button>`;row.append(form);form.addEventListener('submit',event=>{event.preventDefault();const date=new FormData(form).get('date');const rule=state.rules.find(rule=>rule.id===r.ruleId);try{handleResult(S2Engine.postponeReservation(state,r,date),`${dateText(date)}로 미뤘어요. 이동한 예약은 다시 확인해 주세요.`);}catch(err){announce(err.message,true);}});$('input',form).focus();});
    click('[data-rule-stop]',(_,el)=>{handleResult(S2Engine.stopRule(state,el.dataset.ruleStop),'반복 예약을 중단했어요. 이미 확정한 활동은 이번 주 계획에서 취소할 수 있어요.');});
  }
  $('#import-file').addEventListener('change',async event=>{const wasRunning=autoPlaying;stopAutomatic();if(wasRunning)render();const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>5*1024*1024){announce('5MB 이하의 저장 JSON 파일을 선택해 주세요.',true);return;}try{const parsed=S2Storage.parse(await file.text());if(!parsed.ok||!parsed.state){announce(parsed.reason||'유효한 시즌2 저장 파일이 아니에요. 현재 기록은 유지됩니다.',true);return;}if((state||saveAvailable)&&!confirm(`${dateText(parsed.state.date,true)}의 저장 파일로 현재 게임과 브라우저 저장을 덮어쓸까요?`))return;state=parsed.state;autoNarration=[];direction=directionIds.includes(state.flags?.autoDirection)?state.flags.autoDirection:'balanced';tab='planner';replayIndex=0;openPanels.clear();sceneActivity=state.log.filter(l=>l.type==='activity').at(-1)?.activityId||'rest';changed('파일을 검증하고 저장 기록을 불러왔어요.');window.scrollTo({top:0,behavior:'instant'});}catch(err){announce(`파일을 불러오지 못했어요. 현재 기록은 유지됩니다. ${err.message}`,true);}});
  document.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='f'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){event.preventDefault();if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});}});
  window.addEventListener('pagehide',()=>stopAutomatic());
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&autoPlaying){stopAutomatic('다시 돌아왔을 때 이어갈 수 있도록 멈췄어요.');render();}});
  window.render_game_to_text=()=>JSON.stringify({generation:((c)=>({model:c.generationModel,province:c.province,subregionId:c.subregionId||'',residenceLabel:residenceLabel(c),residenceOrigin:c.residenceOrigin,incomeOrigin:c.incomeOrigin,economicProfile:c.economicProfile,housingOrigin:c.housingOrigin,appearance:c.appearance,homeStyle:c.homeStyle}))(state?.config||config),autoPlaying,automatic:{active:autoPlaying,running:autoPlaying&&!autoWaiting,awaitingDecision:autoWaiting,decisions:state?.flags?.autoDecisions||'auto',recentNarration:autoNarration},direction,persona:state?.config?.personaName||config.personaName,gender:state?.config?.gender||config.gender,maritalStatus:state?.config?.maritalStatus||config.maritalStatus,mode:state?.phase||'setup',age:(state?.config||config).age,birthYear:(state?.config||config).year-(state?.config||config).age,draftAvailability:S2PlannerBridge.completionStatus(state),year:state?.config?.year||config.year,date:state?.date,presetId,tab,selectedActivity:selected,payment,stats:state?.stats,ageHealth:previewAgeHealth(state?.config||config),preferences:state?.config?.preferences||config.preferences,household:state?.household,healthEpisode:state?.healthEpisode,cosmeticRecovery:state?.flags?.cosmeticRecoveryUntil?{until:state.flags.cosmeticRecoveryUntil,activityId:state.flags.cosmeticRecoveryActivity,active:state.flags.cosmeticRecoveryUntil>=state.date}:null,finance:state?financeSummary():null,housing:{...housingCosts(state?.config||config),monthly:monthlyCosts(state?.config||config)},plan:state?.plan,pendingEvent:state?.pendingEvent?{title:state.pendingEvent.title,date:state.pendingEvent.date,choices:state.pendingEvent.choices.map(c=>({id:c.id,label:c.label}))}:null,reservations:state?reservations():[],artifactCount:state?.artifacts.length||0,logCount:state?.log.length||0,scene:S2Scene.describe()});
  window.advanceTime=ms=>S2Scene.advance(ms);
  render();
})();
