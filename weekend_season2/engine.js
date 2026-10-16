(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./data.js') : root.S2Data, node ? require('./calendar.js') : root.S2Calendar,
    node ? require('./recurrence.js') : root.S2Recurrence, node ? require('./finance.js') : root.S2Finance, node ? require('./events.js') : root.S2Events);
  if (node) module.exports = api; else root.S2Engine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, C, R, F, E) {
  'use strict';
  const SLOT_IDS = ['morning','afternoon','evening'], SLOT_LABELS = ['오전','오후','저녁'];
  const clone = x => JSON.parse(JSON.stringify(x));
  const clamp = n => Math.max(0,Math.min(100,n));
  const slotId = s => Number.isInteger(s) ? SLOT_IDS[s] : s;
  const count = (s,id) => s.activityCounts[id] || 0;
  function validateConfig(c) {
    const errors = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['시작 설정이 없습니다.'];
    const nums = {year:[2020,2100],age:[18,100],children:[0,6],careShare:[0,100],salary:[0,100000000],externalAllowance:[0,100000000],personalBudget:[0,100000000],fixedCosts:[0,100000000],startCash:[0,1000000000],payDay:[1,31],cardLimit:[0,100000000],seed:[0,4294967295]};
    for (const [key,[min,max]] of Object.entries(nums)) if (!Number.isSafeInteger(c[key]) || c[key]<min || c[key]>max) errors.push(key+' 설정 범위를 확인하세요.');
    const enums = {gender:['unspecified','woman','man','nonbinary','female','male','other'],maritalStatus:['single','married','unspecified'],role:Object.keys(D.ROLES),childAge:['none','preschool','school','teen'],housing:['studio','apartment','shared'],region:['city','town','rural'],transport:['walk','transit','car']};
    for (const [key,values] of Object.entries(enums)) if (!values.includes(c[key])) errors.push(key+' 설정을 확인하세요.');
    if (!Array.isArray(c.preferences) || c.preferences.length>20 || c.preferences.some(id=>!D.ACTIVITY_MAP[id]) || new Set(c.preferences).size!==c.preferences.length) errors.push('활동 선호를 확인하세요.');
    if (c.children>0 && c.childAge==='none') errors.push('자녀가 있으면 연령대를 선택하세요.');
    if(typeof c.personaName!=='string'||c.personaName.length>40||typeof c.lifeIntro!=='string'||c.lifeIntro.length>600)errors.push('가상 인물 소개를 확인하세요.');
    if(c.generationSeed!==null&&(!Number.isInteger(c.generationSeed)||c.generationSeed<0||c.generationSeed>4294967295))errors.push('인생 배정 시드를 확인하세요.');
    return errors;
  }
  function create(config,presetId) {
    const merged = {...clone(D.DEFAULT_CONFIG),...clone(config||{})};
    const errors = validateConfig(merged); if (errors.length) throw new Error(errors.join(' '));
    const date = merged.year+'-01-01';
    return {version:D.VERSION,config:merged,presetId:presetId||merged.role,date,weekStart:date,phase:'planning',
      stats:{fatigue:25,mood:60,relationship:60,preparation:0,research:0,work:0},finance:F.create(merged),plan:[],rules:[],log:[],artifacts:[],
      pendingEvent:null,queue:[],dayState:null,skills:{},activityCounts:{},flags:{},eventHistory:{},sequence:0,weekNumber:1,
      rng:{external:(merged.seed^0x9e3779b9)>>>0,followup:(merged.seed^0x85ebca6b)>>>0},friendPostponements:0,lastExternal:null,review:null};
  }
  function log(s,type,title,extra) { const entry={id:'log-'+(++s.sequence),date:s.date,type,title,...(extra||{})};s.log.push(entry);return entry; }
  function effect(s,values) { for(const [key,val] of Object.entries(values||{})) if(Object.prototype.hasOwnProperty.call(s.stats,key)) s.stats[key]=clamp(s.stats[key]+val); }
  function random(s,stream) { let x=s.rng[stream]>>>0;x=(Math.imul(1664525,x)+1013904223)>>>0;s.rng[stream]=x;return x/4294967296; }
  function travelMinutes(s,a) {
    if (a.location==='home') return 0;
    const table = {city:{walk:35,transit:30,car:25},town:{walk:60,transit:50,car:30},rural:{walk:110,transit:85,car:45}};
    return table[s.config.region][s.config.transport]*(a.location==='local'?1:2);
  }
  function careMinutes(s,date,slot) {
    if (!s.config.children || !s.config.careShare) return 0;
    if (slot !== (C.isOff(date)?'morning':'evening')) return 0;
    const per = {none:0,preschool:100,school:70,teen:40}[s.config.childAge];
    const share = s.flags.careSharedUntil && date<=s.flags.careSharedUntil ? .5 : 1;
    const baseline=Math.min(180,Math.round(per*s.config.children*s.config.careShare/100*share));
    // New household agreements halve the actual capped time. Keep the legacy
    // careSharedUntil formula intact so a v1 saved year replays unchanged.
    return s.flags.householdCareSharedUntil&&date<=s.flags.householdCareSharedUntil?Math.round(baseline*.5):baseline;
  }
  function currentWeek(s) {
    if(s.phase==='finished')return [];
    return C.weekDates(s.date).map(date=>({date,holiday:C.holiday(date),isOff:C.isOff(date),slots:SLOT_IDS.map((id,index)=>({
      id,label:SLOT_LABELS[index],available:(C.isOff(date)||id==='evening')&&!(s.dayState&&s.dayState.date===date&&s.dayState.done.includes('slot-'+id)),reason:s.dayState&&s.dayState.date===date&&s.dayState.done.includes('slot-'+id)?'이미 지난 시간':C.isOff(date)||id==='evening'?'':'기본 평일 일정',
      capacity:240,careMinutes:careMinutes(s,date,id),reservedMinutes:s.dayState&&s.dayState.date===date?(s.dayState.blocks[id]||0):0
    }))}));
  }
  function activityTime(s,activityId,date,slot) {
    const a=D.ACTIVITY_MAP[activityId];if(!a)return 0;
    const care=a.id==='care'?0:careMinutes(s,date,slotId(slot));
    return a.minutes+a.prep+travelMinutes(s,a)+care;
  }
  function projection(s,date,slot,ignoreId) {
    const finance=clone(s.finance);
    let cursor=finance.currentDate||s.date;
    while(cursor<=date){
      F.beginDay(finance,cursor,s.config);
      const prior=s.plan.filter(p=>p.id!==ignoreId&&p.date===cursor&&(cursor<date||SLOT_IDS.indexOf(p.slot)<SLOT_IDS.indexOf(slot)));
      for(const p of prior){const a=D.ACTIVITY_MAP[p.activityId];F.spend(finance,cursor,a.cost,p.payment,a.name,s.config);}
      if(cursor<date)F.endDay(finance,cursor,s.config);
      cursor=C.addDays(cursor,1);
    }
    return finance;
  }
  function planCheck(s,options,ignoreId) {
    const p={...options,slot:slotId(options.slot),payment:options.payment||'cash'},a=D.ACTIVITY_MAP[p.activityId];
    if(s.phase==='finished'||s.phase==='review')return {ok:false,reason:'다음 주를 연 뒤 배치하세요.'};
    if(!a)return {ok:false,reason:'활동을 선택하세요.'};
    if(!C.validDate(p.date)||p.date<s.date||p.date>s.config.year+'-12-31'||!C.weekDates(s.date).includes(p.date))return {ok:false,reason:'이번 주의 남은 날짜를 선택하세요.'};
    if(!SLOT_IDS.includes(p.slot))return {ok:false,reason:'시간대를 선택하세요.'};
    if(s.dayState&&s.dayState.date===p.date&&s.dayState.done.includes('slot-'+p.slot))return {ok:false,reason:'이미 처리한 시간대에는 새 활동을 배치할 수 없습니다.'};
    if(!C.isOff(p.date)&&p.slot!=='evening')return {ok:false,reason:'평일 오전·오후는 기본 일정입니다. 공휴일에는 자유롭게 배치할 수 있습니다.'};
    if(a.roles&&!a.roles.includes(s.config.role))return {ok:false,reason:'현재 생활 역할에 맞지 않는 활동입니다.'};
    if(s.plan.some(x=>x.id!==ignoreId&&x.date===p.date&&x.slot===p.slot))return {ok:false,reason:'같은 시간대에 이미 활동이 있습니다.'};
    const blocked=s.dayState&&s.dayState.date===p.date?(s.dayState.blocks[p.slot]||0):0;
    const minutes=activityTime(s,a.id,p.date,p.slot)+blocked+(a.location!=='home'&&s.dayState&&s.dayState.date===p.date?s.dayState.extraTravel:0);
    if(minutes>240)return {ok:false,reason:'활동·준비·이동·돌봄 '+minutes+'분이 한 구간 240분을 넘습니다.',cause:'time'};
    const money=F.canSpend(projection(s,p.date,p.slot,ignoreId),a.cost,p.payment,s.config);
    return money.ok?{ok:true,reason:'',minutes}:{...money};
  }
  function addPlan(s,options) {
    if(s.phase==='event')return {ok:false,reason:'현재 사건의 선택을 먼저 마치세요.'};
    const check=planCheck(s,options);if(!check.ok)return check;
    const p={id:'plan-'+(++s.sequence),date:options.date,slot:slotId(options.slot),activityId:options.activityId,payment:options.payment||'cash',ruleId:options.ruleId||null,originalDate:options.originalDate||options.date};
    s.plan.push(p);return {ok:true,reason:'',plan:p,minutes:check.minutes};
  }
  function prepareAutoWeek(s,options){
    const direction=options&&options.direction||'balanced';
    if(!['balanced','hobby','rest'].includes(direction))return {ok:false,added:[],issues:[],reason:'생활 방향을 확인하세요.'};
    if(s.phase!=='planning')return {ok:false,added:[],issues:[],reason:'계획 단계에서 자동 주간 준비를 시작하세요.'};
    const pending=reservations(s);
    if(pending.length)return {ok:false,added:[],issues:pending,reason:'반복 예약의 날짜를 확인하고 확정하거나 건너뛴 뒤 자동 진행을 계속하세요.'};
    // Resuming after an event must reach advance(), which turns its new time or
    // resource conflict into an explicit reschedule/free/skip choice. Preparation
    // must not strand an already prepared week on a hidden planning error.
    if(s.flags.autoPreparedWeek===s.weekStart)return {ok:true,added:[],issues:[],notes:[],alreadyPrepared:true,reason:''};
    const issues=s.plan.map(p=>({...p,...planCheck(s,p,p.id)})).filter(p=>!p.ok);
    if(issues.length)return {ok:false,added:[],issues,reason:'기존 계획의 시간·역할·예산 조건이 바뀌었습니다. 먼저 일정을 조정하세요.'};
    const draft=clone(s),added=[],notes=[],preferences=s.config.preferences.filter(id=>!D.ACTIVITY_MAP[id].roles||D.ACTIVITY_MAP[id].roles.includes(s.config.role));
    const preferred=preferences.length?preferences[(s.weekNumber-1)%preferences.length]:'read';
    const second=preferences.find(id=>id!==preferred)||'walk';
    const goal={worker:'study',seeker:'jobstudy',graduate:'research',caregiver:s.config.children?'care':'chores'}[s.config.role];
    const desired=direction==='hobby'?[preferred,second,'friends']:direction==='rest'?['rest','walk','read']:s.stats.fatigue>=65?['rest',preferred,goal]:[goal,preferred,'rest'];
    const occupiedActivities=new Set(draft.plan.map(p=>p.activityId)),needed=Math.max(0,3-draft.plan.length);
    for(let index=0;index<needed;index++){
      const first=desired[index],pool=[first,...preferences,'read','walk','rest'].filter((id,i,list)=>list.indexOf(id)===i&&!occupiedActivities.has(id));
      let selected=null;
      for(const activityId of pool){
        const days=currentWeek(draft),candidates=days.flatMap(day=>day.slots.filter(slot=>slot.available).map(slot=>({date:day.date,slot:slot.id,off:day.isOff})));
        const slots=['afternoon','morning','evening'];
        candidates.sort((a,b)=>Number(b.off)-Number(a.off)||draft.plan.filter(p=>p.date===a.date).length-draft.plan.filter(p=>p.date===b.date).length||a.date.localeCompare(b.date)||slots.indexOf(a.slot)-slots.indexOf(b.slot));
        for(const candidate of candidates){
          const previousSequence=draft.sequence,result=addPlan(draft,{...candidate,activityId,payment:'cash'});
          if(result.ok){
            // A cheap activity early in the week must not consume the budget
            // reserved for a manual appointment later in that same week.
            if(draft.plan.some(p=>!planCheck(draft,p,p.id).ok)){draft.plan=draft.plan.filter(p=>p.id!==result.plan.id);draft.sequence=previousSequence;continue;}
            selected=result.plan;selected.automatic=true;selected.direction=direction;break;
          }
        }
        if(selected){if(activityId!==first)notes.push(D.ACTIVITY_MAP[first].name+' 대신 시간과 예산에 맞는 '+D.ACTIVITY_MAP[activityId].name+'을 준비했습니다.');break;}
      }
      if(!selected){notes.push('활동·돌봄·이동 시간을 함께 확보하기 어려운 구간은 여유로 남겼습니다.');break;}
      occupiedActivities.add(selected.activityId);added.push(selected);
    }
    s.plan=draft.plan;s.sequence=draft.sequence;s.flags.autoPreparedWeek=s.weekStart;s.flags.autoDirection=direction;
    return {ok:true,added,issues:[],notes,alreadyPrepared:false,reason:''};
  }
  function queue(s,id,date,context) {
    if(!E.eligible(s,id))return;
    if(date>s.config.year+'-12-31'||s.queue.some(q=>q.catalogId===id)||s.pendingEvent&&s.pendingEvent.catalogId===id)return;
    s.queue.push({catalogId:id,date,context:context||{}});s.queue.sort((a,b)=>a.date.localeCompare(b.date));
  }
  function postponedFriend(s,reason) {
    if(reason!=='choice')return;
    s.friendPostponements++;
    if(s.friendPostponements%3===0){effect(s,{relationship:-8});log(s,'relationship','약속을 반복해서 미루며 연락이 뜸해졌습니다.',{category:'choice',postponements:s.friendPostponements});queue(s,'relationship_boundary',C.addDays(s.date,1));}
  }
  function removePlan(s,id,reason) {
    const index=s.plan.findIndex(p=>p.id===id);if(index<0)return {ok:false,reason:'일정을 찾을 수 없습니다.'};
    const p=s.plan[index];s.plan.splice(index,1);const why=reason||'choice';
    if(p.ruleId){const rule=s.rules.find(r=>r.id===p.ruleId);if(rule)R.skip(rule,p.originalDate,p.date);}
    log(s,'skipped',D.ACTIVITY_MAP[p.activityId].name+' 일정을 건너뛰었습니다.',{activityId:p.activityId,plannedDate:p.date,category:why==='choice'?'choice':'cannot',reason:why});
    if(p.activityId==='friends')postponedFriend(s,why);return {ok:true};
  }
  function addRule(s,options) {
    try {
      if(!D.ACTIVITY_MAP[options.activityId])return {ok:false,reason:'반복 활동을 선택하세요.'};
      const rule=R.createRule({...options,id:'rule-'+(++s.sequence),slot:SLOT_IDS.indexOf(slotId(options.slot===undefined?'morning':options.slot))});
      if(rule.anchor<s.date||rule.anchor>s.config.year+'-12-31')return {ok:false,reason:'올해의 남은 날짜에서 시작하세요.'};
      s.rules.push(rule);return {ok:true,rule};
    }catch(error){return {ok:false,reason:error.message};}
  }
  function reservations(s) {
    if(s.phase==='finished'||s.phase==='review')return [];
    const dates=C.weekDates(s.date);
    return R.reservations(s.rules,s.date,dates[dates.length-1]).filter(r=>!s.plan.some(p=>p.ruleId===r.ruleId&&p.originalDate===r.originalDate)).map(r=>({...r,slot:slotId(r.slot)}));
  }
  function confirmReservations(s) {
    const issues=[];let confirmed=0;
    for(const item of reservations(s)){const result=addPlan(s,item);if(result.ok)confirmed++;else issues.push({...item,reason:result.reason});}
    return {ok:issues.length===0,issues,confirmed};
  }
  function skipReservation(s,item,reason) {
    const rule=s.rules.find(r=>r.id===item.ruleId);if(!rule)return {ok:false,reason:'반복 일정을 찾지 못했습니다.'};
    R.skip(rule,item.originalDate,item.date);log(s,'skipped',D.ACTIVITY_MAP[item.activityId].name+' 예약을 건너뛰었습니다.',{activityId:item.activityId,plannedDate:item.date,category:reason&&reason!=='choice'?'cannot':'choice',reason:reason||'choice'});
    if(item.activityId==='friends')postponedFriend(s,reason||'choice');return {ok:true};
  }
  function postponeReservation(s,item,date) {
    const rule=s.rules.find(r=>r.id===item.ruleId);if(!rule)return {ok:false,reason:'반복 일정을 찾지 못했습니다.'};
    if(!C.validDate(date)||date<=item.date)return {ok:false,reason:'미룰 날짜는 현재 예약된 날짜보다 이후여야 합니다.'};
    if(date>s.config.year+'-12-31'||date<s.date)return {ok:false,reason:'올해의 남은 날짜로 미뤄 주세요.'};
    try{R.postpone(rule,item.originalDate,date);log(s,'postponed',D.ACTIVITY_MAP[item.activityId].name+' 예약을 미뤘습니다.',{activityId:item.activityId,from:item.date,to:date,category:'choice'});if(item.activityId==='friends')postponedFriend(s,'choice');return {ok:true};}catch(e){return {ok:false,reason:e.message};}
  }
  function stopRule(s,id) {const rule=s.rules.find(r=>r.id===id);if(!rule)return {ok:false,reason:'반복 일정이 없습니다.'};R.stop(rule);log(s,'rule-stopped',D.ACTIVITY_MAP[rule.activityId].name+' 반복을 중단했습니다.',{category:'choice'});return {ok:true};}
  function startEvent(s,id,context) {
    s.pendingEvent=E.make(id,s.date,++s.sequence,context);s.phase='event';s.eventHistory[id]=(s.eventHistory[id]||0)+1;
    if(s.pendingEvent.source==='external')s.flags.externalDelivered=s.date;
    if(s.dayState)s.dayState.eventHandled=true;
    return {ok:true,event:s.pendingEvent};
  }
  function scheduledEvent(s) {
    const suffix=s.date.slice(5);let id=null;
    if(suffix==='06-20'&&!s.flags.certified)id='exam_june';
    if(suffix==='11-14'&&!s.flags.certified)id='exam_nov';
    if(suffix==='09-16'&&s.config.role==='graduate')id='thesis_presentation';
    if(suffix==='11-27'&&s.config.role==='graduate')id='thesis_deadline';
    if(suffix==='12-18'&&s.config.role==='worker')id='work_review';
    if(suffix==='10-01')id='autumn_reflection';
    if(suffix==='02-07'&&s.config.maritalStatus==='married')id=s.config.children?'partner_care':'partner_weekend';
    if(suffix==='02-07'&&s.config.maritalStatus==='single')id=s.config.children?'single_care':'single_weekend';
    return id&&!s.eventHistory[id]&&E.eligible(s,id)?id:null;
  }
  function maybeEvent(s) {
    if(s.dayState.eventHandled)return null;
    const scheduled=scheduledEvent(s);if(scheduled)return startEvent(s,scheduled);
    const due=s.queue.findIndex(q=>q.date<=s.date&&E.eligible(s,q.catalogId)&&!(E.MAP[q.catalogId].source==='external'&&s.flags.externalDelivered&&C.addDays(s.flags.externalDelivered,14)>s.date));if(due>=0){const [item]=s.queue.splice(due,1);return startEvent(s,item.catalogId,item.context);}
    return null;
  }
  function ensureDay(s) {
    if(s.dayState&&s.dayState.date===s.date)return;
    s.dayState={date:s.date,begun:false,eventHandled:false,randomChecked:false,baseDone:false,done:[],blocks:{},extraTravel:0,skipWork:false};
    // Exactly two external draws per date, even on weekdays and when another event
    // is pending. Action-driven followups never shift the future external stream.
    const roll=random(s,'external'),pick=random(s,'external');
    if(C.isOff(s.date)&&roll<0.16&&(!s.lastExternal||C.addDays(s.lastExternal,14)<=s.date)){
      const candidates=['household_repair','weather','friend_invitation'];
      if(s.config.children>0&&s.config.careShare>0)candidates.push('care_appointment');
      if(s.config.transport!=='walk')candidates.push('transport_delay');
      s.lastExternal=s.date;queue(s,candidates[Math.floor(pick*candidates.length)],s.date,{scheduledDate:s.date});
    }
  }
  function block(s,minutes,reason,preferred) {
    const day=s.dayState;let slot=preferred||(C.isOff(s.date)?'afternoon':'evening');
    const used=Math.min(minutes,Math.max(0,240-careMinutes(s,s.date,slot)-(day.blocks[slot]||0)));
    day.blocks[slot]=(day.blocks[slot]||0)+used;
    // A decision consumes real time; conflicts are resolved explicitly on advance.
    log(s,'time',reason+(used<minutes?' · 가능한 시간으로 축소':''),{minutes:used,requestedMinutes:minutes,slot});return used;
  }
  function specialEvent(s,p,reason,cause) {
    s.phase='event';s.pendingEvent={id:'constraint-'+(++s.sequence),catalogId:'constraint',title:'일정을 다시 조정할 때',description:reason,date:s.date,source:'constraint',context:{planId:p.id,cause},choices:[
      {id:'reschedule',label:'이번 주 다른 시간으로 옮기기',description:'남은 시간 중 이동·돌봄·예산 조건을 만족하는 첫 구간으로 옮깁니다.'},
      {id:'free',label:'무료 휴식으로 바꾸기',description:'같은 구간에서 가능한 만큼 쉬고 원래 활동은 제약으로 남깁니다.'},
      {id:'skip',label:'이번 일정 건너뛰기',description:'자원이나 시간 제약 때문에 못 한 일정으로 기록합니다.'}
    ]};return {ok:false,event:s.pendingEvent,reason};
  }
  function performActivity(s,p) {
    const a=D.ACTIVITY_MAP[p.activityId];
    if(a.roles&&!a.roles.includes(s.config.role))return specialEvent(s,p,'생활 역할이 바뀌어 이 활동을 다시 조정해야 합니다.','role');
    const blocked=s.dayState.blocks[p.slot]||0;
    const time=activityTime(s,a.id,p.date,p.slot)+blocked+(a.location!=='home'?s.dayState.extraTravel:0);
    if(time>240)return specialEvent(s,p,'돌봄·사건·이동을 포함하면 '+time+'분입니다. 한 구간 240분을 넘습니다.','time');
    const paid=F.spend(s.finance,s.date,a.cost,p.payment,a.name,s.config);
    if(!paid.ok)return specialEvent(s,p,paid.reason,paid.cause||'money');
    if(a.location!=='home')s.dayState.extraTravel=0;
    const values={...a.effects};
    const tired=s.stats.fatigue>=70;
    if(tired){if(values.preparation)values.preparation=Math.ceil(values.preparation*.55);if(values.research)values.research=Math.ceil(values.research*.55);if(values.work)values.work=Math.ceil(values.work*.55);if(values.mood>0)values.mood=Math.ceil(values.mood*.5);}
    if(s.config.preferences.includes(a.id))values.mood=(values.mood||0)+3;
    if(F.available(s.finance,s.config)<50000&&a.cost>0)values.mood=(values.mood||0)-3;
    if((a.id==='study'&&['06','11'].includes(s.date.slice(5,7)))||(a.id==='research'&&['09','11'].includes(s.date.slice(5,7)))){values.mood=(values.mood||0)+2;values.fatigue=(values.fatigue||0)+2;}
    if(a.id==='chores')s.flags.tidyUntil=C.addDays(s.date,7);
    effect(s,values);s.activityCounts[a.id]=count(s,a.id)+1;s.skills[a.id]=clamp((s.skills[a.id]||0)+(tired?Math.ceil(a.skillGain*.6):a.skillGain));
    log(s,'activity',a.name+' · '+SLOT_LABELS[SLOT_IDS.indexOf(p.slot)],{activityId:a.id,slot:p.slot,minutes:time,cost:a.cost,payment:p.payment,effects:values,moodAfter:s.stats.mood,ruleId:p.ruleId||null,category:'completed'});
    if(a.artifact&&count(s,a.id)%a.every===0){const artifact={id:'artifact-'+(++s.sequence),date:s.date,activityId:a.id,name:a.artifact,icon:a.icon,number:Math.floor(count(s,a.id)/a.every),skill:s.skills[a.id],season:season(s.date)};s.artifacts.push(artifact);log(s,'artifact',artifact.name+' #'+artifact.number,{artifactId:artifact.id,activityId:a.id});}
    if(p.ruleId){const rule=s.rules.find(r=>r.id===p.ruleId);if(rule)R.complete(rule,s.date,p.originalDate);}
    if(a.id==='overtime'){F.addPendingPay(s.finance,s.date,90000,'추가근무 보상');if(count(s,'overtime')%3===0)queue(s,'overtime_boundary',C.addDays(s.date,1));}
    if(a.id==='study'&&count(s,'study')===4)queue(s,'study_checkpoint',C.addDays(s.date,1));
    if(a.id==='jobstudy'&&count(s,'jobstudy')%4===0&&s.config.role==='seeker'){let date=C.addDays(s.date,2+Math.floor(random(s,'followup')*4));while(C.isOff(date))date=C.addDays(date,1);queue(s,'job_interview',date);}
    if(a.artifact&&s.skills[a.id]>=24&&!s.flags['gather-'+a.id]){s.flags['gather-'+a.id]=true;queue(s,'hobby_gathering',C.addDays(s.date,2+Math.floor(random(s,'followup')*4)),{activityId:a.id});}
    if(a.artifact&&s.skills[a.id]>=66&&!s.flags['show-'+a.id]){s.flags['show-'+a.id]=true;queue(s,'hobby_exhibition',C.addDays(s.date,3),{activityId:a.id});}
    if(s.stats.fatigue>=82&&(!s.flags.fatigueLast||C.addDays(s.flags.fatigueLast,28)<s.date)){s.flags.fatigueLast=s.date;queue(s,'fatigue_reset',C.addDays(s.date,1));}
    s.dayState.done.push(p.id,'slot-'+p.slot);s.plan=s.plan.filter(x=>x.id!==p.id);return {ok:true};
  }
  function processDay(s) {
    ensureDay(s);const d=s.dayState;
    if(!d.begun){F.beginDay(s.finance,s.date,s.config);d.begun=true;}
    const event=maybeEvent(s);if(event)return event;
    if(!d.baseDone){
      if(!C.isOff(s.date)&&!d.skipWork){const fatigue={worker:5,seeker:3,graduate:4,caregiver:4}[s.config.role];effect(s,{fatigue:fatigue+(s.flags.tidyUntil&&s.date<=s.flags.tidyUntil?-1:0)});log(s,'weekday',D.ROLES[s.config.role]+'의 평일 기본 일정',{role:s.config.role,fatigue});}
      const care=careMinutes(s,s.date,C.isOff(s.date)?'morning':'evening');if(care){effect(s,{fatigue:Math.round(care/45)});log(s,'care','기본 돌봄 시간',{minutes:care,share:s.config.careShare});}
      d.baseDone=true;
    }
    for(const slot of SLOT_IDS){
      if(d.done.includes('slot-'+slot))continue;
      const p=s.plan.find(x=>x.date===s.date&&x.slot===slot);
      if(p){const result=performActivity(s,p);if(!result.ok)return result;}
      else if(C.isOff(s.date)||slot==='evening'){effect(s,{fatigue:C.isOff(s.date)?-5:-2});d.done.push('slot-'+slot);}
    }
    effect(s,{fatigue:-4});
    F.endDay(s.finance,s.date,s.config);
    log(s,'daily','하루의 기록',{stats:clone(s.stats),holiday:C.holiday(s.date),isOff:C.isOff(s.date)});
    if((s.finance.arrears+s.finance.fixedArrears)>0&&(!s.flags.debtLast||C.addDays(s.flags.debtLast,30)<s.date)){s.flags.debtLast=s.date;queue(s,'money_recovery',C.addDays(s.date,1));}
    return {ok:true,done:true};
  }
  function advance(s,options) {
    if(s.phase==='finished')return {ok:true,finished:true};
    if(s.phase==='event')return {ok:false,reason:'사건의 선택을 먼저 마치세요.',event:s.pendingEvent};
    if(s.phase==='review')return {ok:false,reason:'이번 주 기록을 확인하고 다음 주로 이동하세요.'};
    const untilChoice=!!(options&&options.untilChoice);
    for(let guard=0;guard<800;guard++){
      const reserved=reservations(s);if(reserved.length)return {ok:false,reason:'예약된 반복 일정을 확인·확정하거나 이번 회차를 건너뛰세요.',issues:reserved};
      const result=processDay(s);if(s.phase==='event')return result;
      if(!result.ok)return result;
      if(s.date===s.config.year+'-12-31'){s.phase='finished';s.dayState=null;log(s,'year-end','한 해의 마지막 정산을 마쳤습니다.');return {ok:true,finished:true};}
      if(C.day(s.date)===0){
        s.review={from:s.weekStart,to:s.date,logs:s.log.filter(x=>x.date>=s.weekStart&&x.date<=s.date)};
        s.phase='review';
        if(!untilChoice)return {ok:true,review:s.review};
        finishReview(s);
        const moved=reservations(s).filter(r=>r.moved);if(moved.length)return {ok:false,reason:'평일에서 이동되거나 미뤄진 예약 날짜를 확인하고 확정하세요.',issues:moved};
        const confirmed=confirmReservations(s);if(!confirmed.ok)return {ok:false,reason:'반복 일정에 충돌 또는 자원 부족이 있어 멈췄습니다.',issues:confirmed.issues};
      }else{s.date=C.addDays(s.date,1);s.dayState=null;}
    }
    return {ok:false,reason:'진행 한도에 도달했습니다. 저장 후 다시 진행하세요.'};
  }
  function finishReview(s) {
    if(s.phase!=='review')return {ok:false,reason:'주간 기록 단계가 아닙니다.'};
    s.date=C.addDays(s.date,1);s.weekStart=s.date;s.weekNumber++;s.dayState=null;s.phase='planning';return {ok:true};
  }
  function changeOutside(s) {
    for(const p of s.plan.filter(p=>p.date===s.date&&D.ACTIVITY_MAP[p.activityId].location!=='home')){
      const old=p.activityId;p.activityId='read';p.payment='cash';
      if(p.ruleId){const rule=s.rules.find(r=>r.id===p.ruleId);if(rule)R.skip(rule,p.originalDate,p.date);p.ruleId=null;}
      log(s,'changed',D.ACTIVITY_MAP[old].name+' 대신 독서',{activityId:old,replacement:'read',category:'cannot',reason:'event'});
    }
  }
  function choose(s,id) {
    const event=s.pendingEvent;if(s.phase!=='event'||!event)return {ok:false,reason:'선택할 사건이 없습니다.'};
    if(event.catalogId!=='constraint'&&!E.eligible(s,event.catalogId))return {ok:false,reason:'현재 가구와 이전 선택에 맞지 않는 사건입니다.'};
    const choice=event.choices.find(c=>c.id===id);if(!choice)return {ok:false,reason:'선택지를 확인하세요.'};
    if(event.catalogId==='constraint'){
      const p=s.plan.find(p=>p.id===event.context.planId);
      if(p&&id==='reschedule'){
        let target=null;
        for(const date of C.weekDates(s.date))for(const slot of SLOT_IDS){if(date===s.date&&SLOT_IDS.indexOf(slot)<=SLOT_IDS.indexOf(p.slot))continue;if(!target&&planCheck(s,{...p,date,slot},p.id).ok)target={date,slot};}
        if(!target)return {ok:false,reason:'이번 주에 조건을 만족하는 다른 시간이 없습니다. 무료 휴식이나 건너뛰기를 선택할 수 있습니다.'};
        log(s,'postponed',D.ACTIVITY_MAP[p.activityId].name+' 일정을 가능한 시간으로 옮겼습니다.',{activityId:p.activityId,from:p.date,fromSlot:p.slot,to:target.date,toSlot:target.slot,category:'cannot',reason:event.context.cause});
        s.dayState.done.push('slot-'+p.slot);p.date=target.date;p.slot=target.slot;s.pendingEvent=null;s.phase='planning';return {ok:true};
      }
      if(p){const old=p.activityId;removePlan(s,p.id,event.context.cause||'time');if(id==='free'){
        // A short recovery pause fits whatever time remains; it does not erase a conflict.
        const remaining=Math.max(0,240-(s.dayState.blocks[p.slot]||0)-careMinutes(s,s.date,p.slot));
        effect(s,{fatigue:-Math.min(12,Math.floor(remaining/10))});log(s,'recovery','가능한 여유 시간에 쉬었습니다.',{replacedActivity:old,minutes:remaining,category:'cannot'});
      }s.dayState.done.push('slot-'+p.slot);}
      s.pendingEvent=null;s.phase='planning';return {ok:true};
    }
    const action=choice.action;
    const cost={repair:35000,exam_take:20000,hobby_join:10000}[action]||0;
    const strictMinutes={care_accompany:150,exam_take:150,hobby_join:120,hobby_show:120}[action];
    const strictSlot=action==='care_accompany'?'afternoon':C.isOff(s.date)?'afternoon':'evening';
    if(strictMinutes&&strictMinutes+careMinutes(s,s.date,strictSlot)+(s.dayState.blocks[strictSlot]||0)>240){log(s,'blocked-choice',choice.label+'에 필요한 시간이 부족했습니다.',{eventId:event.catalogId,category:'cannot',reason:careMinutes(s,s.date,strictSlot)?'care':'time'});return {ok:false,reason:'기본 돌봄과 사건 시간을 함께 쓸 수 없습니다. 다른 선택으로 분담하거나 이번 기회를 미룰 수 있습니다.'};}
    if(cost){const check=F.canSpend(s.finance,cost,'cash',s.config);if(!check.ok){log(s,'blocked-choice',choice.label+' 선택에 필요한 예산이 부족했습니다.',{eventId:event.catalogId,category:'cannot',reason:check.cause});return check;}}
    if(cost){const paid=F.spend(s.finance,s.date,cost,'cash',event.title,s.config);if(!paid.ok)return paid;}
    const choiceEffects={...(choice.effects||{})};
    if(action==='event_rest'){
      const restSlot=C.isOff(s.date)?'afternoon':'evening',remaining=Math.max(0,240-careMinutes(s,s.date,restSlot)-(s.dayState.blocks[restSlot]||0));
      if(remaining<120)for(const key of Object.keys(choiceEffects))choiceEffects[key]=Math.round(choiceEffects[key]*remaining/120);
    }
    effect(s,choiceEffects);
    const outcome=(title,extra)=>log(s,'achievement',title,{eventId:event.catalogId,...extra});
    switch(action){
      case 'care_accompany': s.dayState.skipWork=true;block(s,150,'병원 동행에 쓴 시간','afternoon');queue(s,'care_followup',C.addDays(s.date,7));break;
      case 'care_share': s.flags.careSharedUntil=C.addDays(s.date,14);queue(s,'care_followup',C.addDays(s.date,7));block(s,30,'돌봄 분담을 조율한 시간','evening');break;
      case 'care_extend': s.flags.careSharedUntil=C.addDays(s.date,28);break;
      case 'care_return': delete s.flags.careSharedUntil;break;
      case 'repair_wait':block(s,90,'생활 물품을 정리한 시간');break;
      case 'weather_inside':changeOutside(s);break;
      case 'weather_carry':s.dayState.extraTravel=30;break;
      case 'friend_call':block(s,30,'친구와 통화한 시간','evening');s.friendPostponements=Math.max(0,s.friendPostponements-1);log(s,'relationship','친구와 안부를 나눴습니다.',{eventId:event.catalogId});break;
      case 'friend_postpone':postponedFriend(s,'choice');log(s,'postponed','친구의 연락을 다음으로 미뤘습니다.',{category:'choice'});break;
      case 'study_focus':block(s,100,'집중 복습 시간');break;
      case 'work_focus':block(s,90,'업무 정리 시간','evening');break;
      case 'event_rest':block(s,120,'사건 선택으로 확보한 휴식 시간');break;
      case 'exam_take':{
        block(s,150,'시험 응시 시간');const score=s.stats.preparation-s.stats.fatigue*.3+(random(s,'followup')-.5)*12;
        const passed=score>=52;s.flags.certified=passed||!!s.flags.certified;effect(s,{mood:passed?8:-5,fatigue:8});
        outcome(passed?'자격증 시험에 합격했습니다.':'이번 자격증 시험은 통과하지 못했습니다.',{passed,preparation:s.stats.preparation,fatigue:s.stats.fatigue});
        queue(s,'exam_followup',C.addDays(s.date,1),{passed});break;
      }
      case 'exam_defer':log(s,'postponed','자격증 시험 응시를 미뤘습니다.',{category:'choice',eventId:event.catalogId});queue(s,'exam_followup',C.addDays(s.date,1));break;
      case 'exam_retry':log(s,'goal','다음 시험을 준비하기로 했습니다.',{category:'choice'});break;
      case 'exam_new':log(s,'goal','새 취미를 다음 목표로 골랐습니다.',{category:'choice'});break;
      case 'work_review':{
        const positive=s.stats.work>=40&&s.stats.fatigue<70&&s.stats.relationship>=30;
        outcome(positive?'업무 기여를 인정받고 다음 역할을 논의했습니다.':'업무 기여와 지속 가능한 속도를 함께 점검했습니다.',{positive,work:s.stats.work,fatigue:s.stats.fatigue});
        if(positive)F.addPendingPay(s.finance,s.date,180000,'연말 업무 기여 보상');break;
      }
      case 'thesis_present':{s.dayState.skipWork=true;const passed=s.stats.research-s.stats.fatigue*.25>=42;outcome(passed?'연구 발표에서 자료의 연결을 설명했습니다.':'연구 발표에서 보완할 질문을 받았습니다.',{passed,research:s.stats.research});if(!passed)queue(s,'thesis_recovery',C.addDays(s.date,1));break;}
      case 'thesis_small':s.dayState.skipWork=true;outcome('작은 범위의 연구를 공유하고 피드백을 받았습니다.',{partial:true});break;
      case 'thesis_submit':{s.dayState.skipWork=true;const passed=s.stats.research-s.stats.fatigue*.3>=70;outcome(passed?'올해의 연구 초안을 완성했습니다.':'연구 초안에 추가 수정이 필요합니다.',{passed,research:s.stats.research});s.flags.researchComplete=passed;if(!passed)queue(s,'thesis_recovery',C.addDays(s.date,1));break;}
      case 'thesis_extend':log(s,'postponed','연구 목표의 범위를 줄이고 다음 단계로 넘겼습니다.',{category:'choice',research:s.stats.research});queue(s,'thesis_recovery',C.addDays(s.date,1));break;
      case 'job_attend':{s.dayState.skipWork=true;const passed=s.stats.preparation-s.stats.fatigue*.3+(random(s,'followup')-.5)*14>=38;outcome(passed?'면접을 통과했습니다.':'이번 면접에서 다음 기회를 준비하기로 했습니다.',{passed,preparation:s.stats.preparation});effect(s,{fatigue:8,mood:passed?6:-3});if(passed)queue(s,'job_offer',C.addDays(s.date,3));break;}
      case 'job_accept':s.config.role='worker';s.config.salary=2400000;s.config.externalAllowance=0;outcome('근무 제안을 수락했습니다. 다음 급여일부터 새 수입이 적용됩니다.',{salary:2400000});break;
      case 'job_decline':log(s,'postponed','이번 근무·면접 기회를 미뤘습니다.',{category:'choice'});break;
      case 'hobby_join':block(s,120,'취미 모임에 쓴 시간');log(s,'relationship','취미 모임에서 결과물을 나눴습니다.',{activityId:event.context.activityId});break;
      case 'hobby_show':block(s,120,'작은 발표에 쓴 시간');outcome('쌓아 온 취미 결과물을 작은 발표에서 나눴습니다.',{activityId:event.context.activityId});break;
      case 'hobby_private':log(s,'goal','취미 결과물을 개인 기록으로 간직했습니다.',{activityId:event.context.activityId,category:'choice'});break;
      case 'partner_together':case 'partner_individual':case 'partner_swap':case 'partner_care_keep':{
        s.flags.partnerPlan=action;
        if(action==='partner_swap')s.flags.householdCareSharedUntil=C.addDays(s.date,21);
        block(s,action==='partner_together'?90:action==='partner_swap'?30:60,'배우자와 합의한 주말 시간');
        log(s,'relationship',action==='partner_together'?'배우자와 집에서 함께 시간을 보냈습니다.':action==='partner_individual'?'배우자와 각자의 취미 시간을 존중하기로 했습니다.':action==='partner_swap'?'배우자와 돌봄 교대 시간을 합의했습니다.':'배우자와 현재 돌봄 분담 안에서 짧은 여유를 마련했습니다.',{eventId:event.catalogId});
        queue(s,'partner_followup',C.addDays(s.date,21),{plan:action});break;
      }
      case 'partner_continue':case 'partner_adjust':{
        block(s,30,'배우자와 주말 리듬을 돌아본 시간');
        if(s.flags.partnerPlan==='partner_swap'){if(action==='partner_continue')s.flags.householdCareSharedUntil=C.addDays(s.date,28);else delete s.flags.householdCareSharedUntil;}
        log(s,'relationship',action==='partner_continue'?'배우자와 합의한 리듬을 이어가기로 했습니다.':'배우자와 각자의 필요를 다시 이야기하고 주말 경계를 조정했습니다.',{eventId:event.catalogId,previousPlan:s.flags.partnerPlan});break;
      }
      case 'single_connect':case 'single_own':case 'single_support':case 'single_care_keep':{
        s.flags.singlePlan=action;
        if(action==='single_support')s.flags.householdCareSharedUntil=C.addDays(s.date,21);
        block(s,action==='single_own'?90:action==='single_care_keep'?60:30,'내 생활을 위해 정한 시간');
        log(s,action==='single_own'?'goal':'relationship',action==='single_connect'?'가까운 사람과 안부를 나누는 시간을 정했습니다.':action==='single_own'?'개인 취향에 맞는 휴일을 보내기로 했습니다.':action==='single_support'?'친구·친척 등 도움을 나눌 사람과 돌봄 시간을 합의했습니다.':'현재 돌봄 분담 안에서 나를 돌볼 여유를 마련했습니다.',{eventId:event.catalogId,category:'choice'});
        queue(s,'single_followup',C.addDays(s.date,21),{plan:action});break;
      }
      case 'single_continue':case 'single_change':{
        block(s,30,'내 주말 리듬을 돌아본 시간');
        if(s.flags.singlePlan==='single_support'){if(action==='single_continue')s.flags.householdCareSharedUntil=C.addDays(s.date,28);else delete s.flags.householdCareSharedUntil;}
        if(action==='single_continue'&&['single_connect','single_support'].includes(s.flags.singlePlan))effect(s,{relationship:3});
        log(s,'goal',action==='single_continue'?'선택한 연락·개인 시간·돌봄 도움의 리듬을 이어가기로 했습니다.':'내 주말에 필요한 시간을 다시 정했습니다.',{eventId:event.catalogId,previousPlan:s.flags.singlePlan,category:'choice'});break;
      }
      case 'budget_reduce':
        for(const p of s.plan.filter(p=>D.ACTIVITY_MAP[p.activityId].cost>0)){const original=p.activityId;removePlan(s,p.id,event.catalogId==='money_recovery'?'money':'choice');const remaining=planCheck(s,{...p,activityId:'rest',ruleId:null});if(remaining.ok)s.plan.push({...p,activityId:'rest',payment:'cash',ruleId:null});log(s,'changed',D.ACTIVITY_MAP[original].name+' 대신 여유를 남겼습니다.',{category:event.catalogId==='money_recovery'?'cannot':'choice',reason:event.catalogId==='money_recovery'?'money':'choice'});}break;
    }
    log(s,'event',event.title+' · '+choice.label,{eventId:event.catalogId,source:event.source,choiceId:id,description:choice.description,category:'choice'});
    s.pendingEvent=null;s.phase='planning';return {ok:true};
  }
  function season(date){const month=Number(date.slice(5,7));return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';}
  function getSummary(s) {
    const dates=C.dates(s.config.year);
    const calendar=dates.map(date=>({date,activities:s.log.filter(l=>l.date===date&&l.type==='activity'),events:s.log.filter(l=>l.date===date&&['event','achievement'].includes(l.type))}));
    const monthly=Array.from({length:12},(_,i)=>{
      const month=String(i+1).padStart(2,'0'),logs=s.log.filter(l=>l.date.slice(5,7)===month),days=logs.filter(l=>l.type==='daily');
      return {month:Number(month),activities:logs.filter(l=>l.type==='activity').length,memories:logs.filter(l=>['artifact','achievement','relationship','event'].includes(l.type)),meanMood:days.length?Math.round(days.reduce((n,l)=>n+l.stats.mood,0)/days.length):null};
    });
    const ranked=monthly.filter(m=>m.meanMood!==null).sort((a,b)=>b.meanMood-a.meanMood||a.month-b.month);
    return {year:s.config.year,activityCounts:clone(s.activityCounts),calendar,monthly,artifacts:clone(s.artifacts),achievements:s.log.filter(l=>l.type==='achievement'),relationshipScenes:s.log.filter(l=>l.type==='relationship'),finance:F.summary(s.finance),happiestMonth:ranked.length?ranked[0]:null,kept:s.log.filter(l=>l.type==='activity'&&l.ruleId).length,postponed:s.log.filter(l=>['postponed','skipped'].includes(l.type)),cannot:s.log.filter(l=>l.category==='cannot'),choices:s.log.filter(l=>l.category==='choice'),log:s.log.slice(),daysPlayed:s.log.filter(l=>l.type==='daily').length};
  }
  return {create,validateConfig,currentWeek,addPlan,prepareAutoWeek,removePlan,addRule,reservations,confirmReservations,skipReservation,postponeReservation,stopRule,advance,choose,finishReview,getSummary,activityTime,travelMinutes,careMinutes,season,SLOT_IDS,SLOT_LABELS};
});
