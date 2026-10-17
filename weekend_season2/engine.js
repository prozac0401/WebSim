(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./data.js') : root.S2Data, node ? require('./calendar.js') : root.S2Calendar,
    node ? require('./recurrence.js') : root.S2Recurrence, node ? require('./finance.js') : root.S2Finance, node ? require('./events.js') : root.S2Events);
  if (node) module.exports = api; else root.S2Engine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, C, R, F, E) {
  'use strict';
  const SLOT_IDS = ['morning','afternoon','evening'], SLOT_LABELS = ['오전','오후','저녁'];
  const PUBLIC_STATS = ['health','happiness','knowledge','mood','relationship','family'];
  const AUTO_DIRECTIONS = ['balanced','hobby','rest','selfdev','social','family','home','health'];
  const clone = x => JSON.parse(JSON.stringify(x));
  const clamp = n => Math.round(Math.max(0,Math.min(100,n))*100)/100;
  const slotId = s => Number.isInteger(s) ? SLOT_IDS[s] : s;
  const count = (s,id) => s.activityCounts[id] || 0;
  function validateConfig(c) {
    const errors = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['시작 설정이 없습니다.'];
    const nums = {year:[2020,2100],age:[18,100],children:[0,6],careShare:[0,100],salary:[0,100000000],externalAllowance:[0,100000000],personalBudget:[0,100000000],fixedCosts:[0,100000000],monthlyRent:[0,100000000],housingLoanPrincipal:[0,10000000000],housingLoanRateBps:[0,3000],housingMaintenance:[0,100000000],startCash:[0,1000000000],payDay:[1,31],cardLimit:[0,100000000],seed:[0,4294967295]};
    for (const [key,[min,max]] of Object.entries(nums)) if (!Number.isSafeInteger(c[key]) || c[key]<min || c[key]>max) errors.push(key+' 설정 범위를 확인하세요.');
    const enums = {gender:['unspecified','woman','man','nonbinary','female','male','other'],maritalStatus:Object.keys(D.MARITAL_STATUSES),role:Object.keys(D.ROLES),childAge:['none','toddler','preschool','school','teen','adult'],housing:['studio','apartment','shared'],housingTenure:['own','rent','jeonse','unspecified'],region:['city','town','rural'],transport:['walk','transit','car']};
    if(c.ageHealthModel!=null&&c.ageHealthModel!==D.AGE_HEALTH.MODEL.id)errors.push('건강 설정의 버전을 확인하세요.');
    for (const [key,values] of Object.entries(enums)) if (!values.includes(c[key])) errors.push(key+' 설정을 확인하세요.');
    if(c.housingTenure!=='rent'&&c.monthlyRent!==0)errors.push('월세는 월세 계약에서만 설정할 수 있습니다.');
    if(c.housingTenure==='unspecified'&&(c.housingLoanPrincipal!==0||c.housingLoanRateBps!==0||c.housingMaintenance!==0))errors.push('주거비를 설정하려면 자가·월세·전세 중 주거 계약을 선택하세요.');
    if (!Array.isArray(c.preferences) || c.preferences.length>D.ACTIVITIES.length || c.preferences.some(id=>!D.ACTIVITY_MAP[id]) || new Set(c.preferences).size!==c.preferences.length) errors.push('활동 선호를 확인하세요.');
    if (c.children>0 && c.childAge==='none') errors.push('자녀가 있으면 연령대를 선택하세요.');
    if(c.childProfiles!==null&&c.childProfiles!==undefined){
      if(!Array.isArray(c.childProfiles)||c.childProfiles.length!==c.children||c.childProfiles.some(child=>!child||typeof child!=='object'||Array.isArray(child)||!Number.isInteger(child.age)||child.age<0||child.age>49||child.age>=c.age||!['man','woman','unspecified'].includes(child.gender)||!['none','serving'].includes(child.militaryStatus)||(child.militaryStatus==='serving'&&(child.gender!=='man'||child.age<18||child.age>35))))errors.push('자녀별 나이·성별·복무 설정을 확인하세요.');
    }
    if(typeof c.personaName!=='string'||c.personaName.length>40||typeof c.lifeIntro!=='string'||c.lifeIntro.length>600)errors.push('가상 인물 소개를 확인하세요.');
    if(c.generationSeed!==null&&(!Number.isInteger(c.generationSeed)||c.generationSeed<0||c.generationSeed>4294967295))errors.push('인생 배정 시드를 확인하세요.');
    if(c.province!=='unspecified'&&!D.DEMOGRAPHICS.regions.some(r=>r.id===c.province))errors.push('거주 시·도를 확인하세요.');
    if(c.subregionId!=null&&c.subregionId!==''&&D.SUBREGIONS.byId(c.subregionId)?.provinceId!==c.province)errors.push('거주 구·시·군과 시·도가 일치하는지 확인하세요.');
    if(![null,'population','custom'].includes(c.residenceOrigin))errors.push('거주지 배정 근거를 확인하세요.');
    for(const [key,options] of [['appearance',D.APPEARANCE_OPTIONS],['homeStyle',D.HOME_OPTIONS]]){
      const value=c[key];if(value===null)continue;
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==Object.keys(options).length||Object.entries(options).some(([field,choices])=>!choices.includes(value[field])))errors.push('삽화 설정을 확인하세요.');
    }
    if(c.generationModel!==null&&!['kr-life-2026-v1','kr-life-2026-v2','kr-life-2026-v3'].includes(c.generationModel))errors.push('인생 배정 자료 버전을 확인하세요.');
    if(c.incomeOrigin?.modelId===D.LIFECYCLE.MODEL.id){
      errors.push(...D.LIFECYCLE.validateOrigin(c.incomeOrigin));
    }else if(c.incomeOrigin!==null){
      const origin=c.incomeOrigin,band=D.INCOME.BANDS.find(b=>b.id===origin?.bandId);
      if(!origin||typeof origin!=='object'||Array.isArray(origin)||!['wage','support-model','custom'].includes(origin.kind)||origin.sourceId!==D.INCOME.SOURCE.id||!band||!D.DEMOGRAPHICS.regions.some(r=>r.id===origin.provinceId)||![1,.3,.5,.65].includes(origin.supportShare)||!Number.isSafeInteger(origin.sampledMonthly)||!Number.isSafeInteger(origin.assignedMonthly)||origin.assignedMonthly!==Math.round(origin.sampledMonthly*origin.supportShare)||origin.sampledMonthly<0||origin.sampledMonthly>100000000||(origin.kind==='wage'&&origin.supportShare!==1)||(origin.kind==='support-model'&&origin.supportShare===1))errors.push('수입 배정 근거를 확인하세요.');
      else if(band.max===null?origin.sampledMonthly!==D.INCOME.MODEL.topMonthlyAmount:origin.sampledMonthly<band.monthlyMin||origin.sampledMonthly>band.monthlyMax)errors.push('수입 구간과 배정액이 일치하지 않습니다.');
    }
    if(c.economicProfile!==null&&c.economicProfile!==undefined)errors.push(...D.LIFECYCLE.validateProfile(c.economicProfile,c));
    if(c.housingOrigin!==null&&c.housingOrigin!==undefined)errors.push(...D.HOUSING.validateOrigin(c.housingOrigin));
    if(c.generationModel==='kr-life-2026-v3'&&(!c.economicProfile||!c.housingOrigin||c.incomeOrigin?.modelId!==D.LIFECYCLE.MODEL.id))errors.push('새 삶의 수입·주거 생성 기록이 빠져 있습니다.');
    if(c.economicProfile?.active&&c.housingOrigin){
      const h=c.housingOrigin, pairs={provinceId:c.province,householdSize:D.LIFECYCLE.household(c).size,housingType:c.housing,housingTenure:c.housingTenure,monthlyRent:c.monthlyRent,loanPrincipal:c.housingLoanPrincipal,rateBps:c.housingLoanRateBps,housingMaintenance:c.housingMaintenance};
      if(Object.entries(pairs).some(([key,value])=>h[key]!==value))errors.push('현재 집과 주거비의 참고 자료가 다릅니다.');
    }
    return errors;
  }
  function create(config,presetId) {
    const merged = {...clone(D.DEFAULT_CONFIG),...clone(config||{})};
    const errors = validateConfig(merged); if (errors.length) throw new Error(errors.join(' '));
    const date = merged.year+'-01-01';
    return {version:D.VERSION,config:merged,presetId:presetId||merged.role,date,weekStart:date,phase:'planning',
      stats:{health:D.ageHealthProfile(merged).initialHealth,happiness:60,knowledge:35,mood:60,relationship:60,family:60,fatigue:25,preparation:0,research:0,work:0},household:{cleanliness:70,lastCleaned:null},healthEpisode:null,finance:F.create(merged),plan:[],rules:[],log:[],artifacts:[],
      pendingEvent:null,queue:[],dayState:null,skills:{},activityCounts:{},flags:{},eventHistory:{},sequence:0,weekNumber:1,
      rng:{external:(merged.seed^0x9e3779b9)>>>0,followup:(merged.seed^0x85ebca6b)>>>0},friendPostponements:0,lastExternal:null,review:null};
  }
  function log(s,type,title,extra) { const entry={id:'log-'+(++s.sequence),date:s.date,type,title,...(extra||{})};s.log.push(entry);return entry; }
  function effect(s,values) {
    for(const [key,val] of Object.entries(values||{})) if(Object.prototype.hasOwnProperty.call(s.stats,key)) {
      let delta=val;
      if((key==='health'&&val>0)||(key==='fatigue'&&val<0))delta*=D.ageHealthProfile(s.config).recoveryRate;
      // High well-being has diminishing returns; ordinary rest cannot erase all
      // fatigue forever. Progress toward actual exams stays a separate measure.
      if(PUBLIC_STATS.includes(key)&&val>0&&s.stats[key]>75)delta*=Math.max(.05,(100-s.stats[key])/25);
      if(key==='fatigue')delta*=val<0?.2+s.stats.fatigue/100:1-s.stats.fatigue/160;
      s.stats[key]=clamp(s.stats[key]+delta);
    }
  }
  function children(s) {
    if(typeof D.getChildren==='function')return D.getChildren(s.config);
    return Array.from({length:s.config.children},()=>({age:{toddler:1,preschool:4,school:9,teen:16,adult:24}[s.config.childAge]||0,gender:'unspecified',militaryStatus:'none'}));
  }
  function activityCost(s,id) {return typeof D.activityPrice==='function'?D.activityPrice(s.config,id).amount:D.ACTIVITY_MAP[id].cost;}
  function cadenceCheck(s,id,date,ignorePlanId) {
    const cadence=D.ACTIVITY_MAP[id]?.cadence;
    if(!cadence)return {allowed:true,nextDate:null,label:''};
    if(!C.validDate(date))throw new RangeError('활동 날짜를 확인하세요.');
    const due=from=>cadence.unit==='weeks'?C.addDays(from,cadence.interval*7):C.addMonths(from,cadence.interval);
    const sameGroup=activityId=>D.ACTIVITY_MAP[activityId]?.cadence?.group===cadence.group;
    const dates=[...new Set([...s.log.filter(item=>item.type==='activity'&&sameGroup(item.activityId)).map(item=>item.date),...s.plan.filter(item=>item.id!==ignorePlanId&&sameGroup(item.activityId)).map(item=>item.date)].filter(C.validDate))].sort();
    let nextDate=date;
    // Respect both the last completed visit and future explicit appointments.
    // A candidate before an appointment must leave its own full interval, too.
    for(const occupied of dates){
      if(nextDate>=occupied?nextDate<due(occupied):due(nextDate)>occupied)nextDate=due(occupied);
    }
    return {allowed:nextDate===date,nextDate,label:cadence.label};
  }
  function activityCadence(s,id,date=s.date) {return cadenceCheck(s,id,date,null);}
  function procedureRecords(s,ignorePlanId,includePlans=true){
    const actual=s.log.filter(item=>item.type==='activity'&&D.ACTIVITY_MAP[item.activityId]?.procedure);
    const planned=includePlans?s.plan.filter(item=>item.id!==ignorePlanId&&D.ACTIVITY_MAP[item.activityId]?.procedure):[];
    return [...actual,...planned].filter(item=>C.validDate(item.date));
  }
  function afterProcedure(date,slot,record){return date>record.date||date===record.date&&SLOT_IDS.indexOf(slot)>=SLOT_IDS.indexOf(record.slot||'morning');}
  function availability(s,id,date,slot,ignoreId,includePlans){
    const a=D.ACTIVITY_MAP[id];
    if(!a||!C.validDate(date)||!SLOT_IDS.includes(slotId(slot)))return {allowed:false,reason:'활동과 날짜·시간을 확인하세요.',cause:'invalid',nextDate:null};
    if(!a.procedure&&!a.outdoor)return {allowed:true,reason:'',cause:null,nextDate:null};
    const records=procedureRecords(s,ignoreId,includePlans),same=records.filter(record=>record.activityId===id);
    if(a.procedure?.oncePerLife&&(same.length||count(s,id)>0))return {allowed:false,reason:a.name+'은 한 삶에서 한 번만 선택할 수 있어요. 이미 마쳤거나 잡아 둔 일정이 있어요.',cause:'procedure-once',nextDate:null};
    if(a.procedure?.minIntervalDays){
      const interval=a.procedure.minIntervalDays;let nextDate=date;
      for(const occupied of [...new Set(same.map(record=>record.date))].sort())if(nextDate>=occupied?nextDate<C.addDays(occupied,interval):C.addDays(nextDate,interval)>occupied)nextDate=C.addDays(occupied,interval);
      if(nextDate!==date)return {allowed:false,reason:a.name+'는 최소 4주(28일) 간격으로 선택해요. 다음 가능한 날짜는 '+nextDate+'입니다.',cause:'procedure-interval',nextDate};
    }
    if(a.outdoor){
      const conflicts=records.filter(record=>afterProcedure(date,slotId(slot),record)&&date<=C.addDays(record.date,D.ACTIVITY_MAP[record.activityId].procedure.recoveryDays));
      if(conflicts.length){
        const end=conflicts.map(record=>({record,until:C.addDays(record.date,D.ACTIVITY_MAP[record.activityId].procedure.recoveryDays)})).sort((x,y)=>y.until.localeCompare(x.until))[0];
        return {allowed:false,reason:D.ACTIVITY_MAP[end.record.activityId].name+' 뒤 '+end.until+'까지 야외 활동을 쉬어요. '+C.addDays(end.until,1)+'부터 다시 고를 수 있어요.',cause:'procedure-recovery',nextDate:C.addDays(end.until,1),recoveryUntil:end.until};
      }
    }
    return {allowed:true,reason:'',cause:null,nextDate:null};
  }
  function activityAvailability(s,id,date=s.date,slot='morning',ignoreId=null){return availability(s,id,date,slot,ignoreId,true);}
  function random(s,stream) { let x=s.rng[stream]>>>0;x=(Math.imul(1664525,x)+1013904223)>>>0;s.rng[stream]=x;return x/4294967296; }
  function travelMinutes(s,a) {
    if (a.location==='home') return 0;
    const table = {city:{walk:35,transit:30,car:25},town:{walk:60,transit:50,car:30},rural:{walk:110,transit:85,car:45}};
    return table[s.config.region][s.config.transport]*(a.location==='local'?1:2);
  }
  function careMinutes(s,date,slot) {
    if (!s.config.children || !s.config.careShare) return 0;
    if (slot !== (C.isOff(date)?'morning':'evening')) return 0;
    const total = children(s).reduce((minutes,child)=>minutes+(child.age<=2?130:child.age<=6?100:child.age<=12?70:child.age<18?40:0),0);
    const share = s.flags.careSharedUntil && date<=s.flags.careSharedUntil ? .5 : 1;
    const baseline=Math.min(180,Math.round(total*s.config.careShare/100*share));
    // New household agreements halve the actual capped time. Keep the legacy
    // careSharedUntil formula intact so a v1 saved year replays unchanged.
    return s.flags.householdCareSharedUntil&&date<=s.flags.householdCareSharedUntil?Math.round(baseline*.5):baseline;
  }
  function currentWeek(s) {
    if(s.phase==='finished')return [];
    return C.weekDates(s.date).map(date=>({date,holiday:C.holiday(date),isOff:C.isOff(date),slots:SLOT_IDS.map((id,index)=>({
      id,label:SLOT_LABELS[index],available:(C.isOff(date)||id==='evening')&&!(s.dayState&&s.dayState.date===date&&s.dayState.done.includes('slot-'+id)),reason:s.dayState&&s.dayState.date===date&&s.dayState.done.includes('slot-'+id)?'이미 지난 시간':C.isOff(date)||id==='evening'?'':'기본 평일 일정',
      capacity:240,careMinutes:careMinutes(s,date,id),reservedMinutes:(s.dayState&&s.dayState.date===date?(s.dayState.blocks[id]||0):0)+(!(s.dayState&&s.dayState.date===date&&s.dayState.baseDone)?conditionMinutes(s,date,id):0)
    }))}));
  }
  function activityTime(s,activityId,date,slot) {
    const a=D.ACTIVITY_MAP[activityId];if(!a)return 0;
    const care=a.id==='care'?0:careMinutes(s,date,slotId(slot));
    return a.prep+travelMinutes(s,a)+(a.careOverlap?Math.max(a.minutes,care):a.minutes+care);
  }
  function conditionMinutes(s,date,slot) {
    if(!s.flags.recoveryUntil||date<s.flags.recoveryStarted||date>s.flags.recoveryUntil)return 0;
    if(s.flags.recoveryCause==='weekday_overload')return date===s.flags.overloadSaturday&&['morning','afternoon'].includes(slot)?Math.max(0,240-careMinutes(s,date,slot)):0;
    if(slot!==(C.isOff(date)?'afternoon':'evening'))return 0;
    return Math.min(s.flags.recoveryCause==='traffic_minor'?90:s.flags.recoveryCause==='sleep_disruption'?45:60,Math.max(0,240-careMinutes(s,date,slot)));
  }
  function influenzaWeight(s,date) {return s.flags.vaccineProtectionFrom&&date>=s.flags.vaccineProtectionFrom?0.5:1;}
  function projection(s,date,slot,ignoreId) {
    const finance=clone(s.finance);
    let cursor=finance.currentDate||s.date;
    while(cursor<=date){
      F.beginDay(finance,cursor,s.config);
      const prior=s.plan.filter(p=>p.id!==ignoreId&&p.date===cursor&&(cursor<date||SLOT_IDS.indexOf(p.slot)<SLOT_IDS.indexOf(slot)));
      for(const p of prior){const a=D.ACTIVITY_MAP[p.activityId];F.spend(finance,cursor,activityCost(s,a.id),p.payment,a.name,s.config);}
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
    if(!C.isOff(p.date)&&p.slot!=='evening')return {ok:false,reason:'평일 낮에는 일과가 있어요. 저녁이나 쉬는 날에 시간을 내 볼까요?'};
    const unavailable=D.activityReason(s.config,a.id);if(unavailable)return {ok:false,reason:unavailable+'이에요. 다른 활동을 골라 주세요.',cause:a.parenting?'care':'role'};
    const permitted=activityAvailability(s,a.id,p.date,p.slot,ignoreId);if(!permitted.allowed)return {ok:false,...permitted};
    if(a.procedure&&!ignoreId){
      const until=C.addDays(p.date,a.procedure.recoveryDays),conflict=s.plan.find(item=>D.ACTIVITY_MAP[item.activityId]?.outdoor&&afterProcedure(item.date,item.slot,p)&&item.date<=until);
      if(conflict)return {ok:false,reason:until+'까지 회복 시간을 남겨야 해요. '+conflict.date+'의 '+D.ACTIVITY_MAP[conflict.activityId].name+' 일정을 먼저 옮기거나 취소해 주세요.',cause:'procedure-recovery',nextDate:C.addDays(until,1),recoveryUntil:until};
    }
    if(s.plan.some(x=>x.id!==ignoreId&&x.date===p.date&&x.slot===p.slot))return {ok:false,reason:'같은 시간대에 이미 활동이 있습니다.'};
    const blocked=(s.dayState&&s.dayState.date===p.date?(s.dayState.blocks[p.slot]||0):0)+(!(s.dayState&&s.dayState.date===p.date&&s.dayState.baseDone)?conditionMinutes(s,p.date,p.slot):0);
    const minutes=activityTime(s,a.id,p.date,p.slot)+blocked+(a.location!=='home'&&s.dayState&&s.dayState.date===p.date?s.dayState.extraTravel:0);
    if(minutes>240)return {ok:false,reason:'이동하고 돌봄까지 챙기면 '+a.name+'을 마칠 시간이 부족해요. 다른 시간대를 골라 볼까요?',cause:'time',details:{requiredMinutes:minutes,availableMinutes:240}};
    const money=F.canSpend(projection(s,p.date,p.slot,ignoreId),activityCost(s,a.id),p.payment,s.config);
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
    if(!AUTO_DIRECTIONS.includes(direction))return {ok:false,added:[],issues:[],reason:'이번 주에 더 챙기고 싶은 일을 골라 주세요.'};
    if(s.phase!=='planning')return {ok:false,added:[],issues:[],reason:'계획 단계에서 자동 주간 준비를 시작하세요.'};
    const pending=reservations(s);
    if(pending.length)return {ok:false,added:[],issues:pending,reason:'반복 예약의 날짜를 확인하고 확정하거나 건너뛴 뒤 자동 진행을 계속하세요.'};
    // Resuming after an event must reach advance(), which turns its new time or
    // resource conflict into an explicit reschedule/free/skip choice. Preparation
    // must not strand an already prepared week on a hidden planning error.
    if(s.flags.autoPreparedWeek===s.weekStart)return {ok:true,added:[],issues:[],notes:[],alreadyPrepared:true,reason:''};
    const issues=s.plan.map(p=>({...p,...planCheck(s,p,p.id)})).filter(p=>!p.ok);
    if(issues.length)return {ok:false,added:[],issues,reason:'이번 주에 잡아 둔 일 중 지금은 하기 어려운 일이 있어요. 시간과 비용을 다시 살펴봐 주세요.'};
    const draft=clone(s),added=[],notes=[],eligiblePreferences=s.config.preferences.filter(id=>!D.activityReason(s.config,id)&&!D.ACTIVITY_MAP[id].manualOnly);
    const offset=eligiblePreferences.length?((s.weekNumber-1)*2)%eligiblePreferences.length:0;
    const preferences=[...eligiblePreferences.slice(offset),...eligiblePreferences.slice(0,offset)];
    const preferred=preferences[0]||'read',second=preferences[1]||'walk';
    const goal={worker:'study',seeker:'jobstudy',graduate:'research',caregiver:'study'}[s.config.role];
    const optionsByDirection={balanced:[preferred,second,'rest'],hobby:[preferred,second,'culture'],rest:['rest','walk','read'],selfdev:[goal,'read','culture'],social:['friends','volunteer','culture'],family:['family_time','cook','care'],home:['cleaning','chores','garden'],health:['run','walk','rest']};
    let desired=optionsByDirection[direction].map(id=>D.ACTIVITY_MAP[id]?id:'read');
    const parenting=D.ACTIVITIES.filter(a=>a.parenting&&!D.activityReason(s.config,a.id));
    const groups=[...new Set(parenting.map(a=>a.parenting.group))],rotation=Math.max(0,s.weekNumber-1);
    const group=groups[rotation%groups.length],choices=parenting.filter(a=>a.parenting.group===group);
    const parentTask=choices.length?choices[Math.floor(rotation/groups.length)%choices.length].id:null;
    if(parentTask&&direction==='balanced')desired=[preferred,parentTask,'rest'];
    if(parentTask&&direction==='family')desired=[parentTask,'family_time','cook'];
    if(direction==='balanced'&&s.stats.fatigue>=65)desired=['rest',parentTask||preferred,'walk'];
    if(s.household.cleanliness<38&&!['home'].includes(direction))desired[2]=D.ACTIVITY_MAP.cleaning?'cleaning':'chores';
    if(s.healthEpisode&&s.healthEpisode.subject==='self')desired=['rest','read',s.household.cleanliness<38?'chores':'garden'];
    const occupiedActivities=new Set(draft.plan.map(p=>p.activityId)),needed=Math.max(0,3-draft.plan.length);
    for(let index=0;index<needed;index++){
      const first=desired[index],pool=[first,...preferences,'read','walk','rest'].filter((id,i,list)=>list.indexOf(id)===i&&!occupiedActivities.has(id));
      let selected=null;
      for(const activityId of pool){
        const days=currentWeek(draft),candidates=days.flatMap(day=>day.slots.filter(slot=>slot.available).map(slot=>({date:day.date,slot:slot.id,off:day.isOff})));
        const slots=['afternoon','morning','evening'];
        candidates.sort((a,b)=>Number(b.off)-Number(a.off)||draft.plan.filter(p=>p.date===a.date).length-draft.plan.filter(p=>p.date===b.date).length||a.date.localeCompare(b.date)||slots.indexOf(a.slot)-slots.indexOf(b.slot));
        for(const candidate of candidates){
          if(!activityCadence(draft,activityId,candidate.date).allowed)continue;
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
      if(!selected){notes.push('이번 주는 더 담기보다 여유를 남기는 편이 좋겠어요.');break;}
      occupiedActivities.add(selected.activityId);added.push(selected);
    }
    s.plan=draft.plan;s.sequence=draft.sequence;s.flags.autoPreparedWeek=s.weekStart;s.flags.autoDirection=direction;
    return {ok:true,added,issues:[],notes,alreadyPrepared:false,reason:''};
  }
  function replaceAutoWeek(s,options) {
    if(s.phase!=='planning')return {ok:false,added:[],issues:[],reason:'지금의 이야기를 마친 뒤 이번 주 계획을 바꿀 수 있어요.'};
    const draft=clone(s),removed=draft.plan.filter(p=>p.automatic&&!p.ruleId);
    if(options&&options.preferences!==undefined){draft.config.preferences=clone(options.preferences);const errors=validateConfig(draft.config);if(errors.length)return {ok:false,added:[],issues:[],reason:errors[0]};const unavailable=draft.config.preferences.find(id=>(D.activityReason(draft.config,id)||D.ACTIVITY_MAP[id].manualOnly)&&!s.config.preferences.includes(id));if(unavailable)return {ok:false,added:[],issues:[],reason:D.ACTIVITY_MAP[unavailable].name+'는 '+(D.activityReason(draft.config,unavailable)||'직접 계획하거나 반복 예약으로 고르는 활동')+'이에요. 다른 활동을 골라 주세요.'};}
    draft.plan=draft.plan.filter(p=>!p.automatic||p.ruleId);delete draft.flags.autoPreparedWeek;
    const result=prepareAutoWeek(draft,options);
    if(!result.ok)return result;
    s.config.preferences=draft.config.preferences;s.plan=draft.plan;s.sequence=draft.sequence;s.flags.autoPreparedWeek=draft.flags.autoPreparedWeek;s.flags.autoDirection=draft.flags.autoDirection;
    return {...result,replaced:removed.length};
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
      const activity=D.ACTIVITY_MAP[options.activityId],procedure=activity.procedure;
      if(activity.parenting)return {ok:false,reason:'자녀 나이에 맞춘 육아는 이번 주에 직접 담거나 가족 중심 자동 계획으로 챙겨요. 반복 예약에서는 제외합니다.',cause:'parenting'};
      if(procedure?.oncePerLife&&s.rules.some(rule=>rule.activityId===activity.id&&rule.active))return {ok:false,reason:activity.name+' 예약이 이미 있어요. 기존 예약을 중단한 뒤 새로 정할 수 있어요.',cause:'procedure-once'};
      if(procedure?.minIntervalDays&&(options.kind||'weeks')==='weeks'&&(options.interval||1)*7<procedure.minIntervalDays)return {ok:false,reason:'레이저 제모는 최소 4주(28일) 간격으로 예약해 주세요.',cause:'procedure-interval'};
      const unavailable=D.activityReason(s.config,options.activityId);if(unavailable)return {ok:false,reason:unavailable+'이에요. 다른 반복 활동을 골라 주세요.'};
      const permitted=activityAvailability(s,options.activityId,options.anchor,slotId(options.slot===undefined?'morning':options.slot));if(!permitted.allowed)return {ok:false,...permitted};
      const rule=R.createRule({...options,id:'rule-'+(s.sequence+1),slot:SLOT_IDS.indexOf(slotId(options.slot===undefined?'morning':options.slot))});
      if(rule.anchor<s.date||rule.anchor>s.config.year+'-12-31')return {ok:false,reason:'올해의 남은 날짜에서 시작하세요.'};
      s.sequence++;s.rules.push(rule);return {ok:true,rule};
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
  function finishOnceRules(s,activity,plan) {
    if(!activity.procedure?.oncePerLife)return;
    for(const rule of s.rules.filter(rule=>rule.activityId===activity.id&&rule.active)){
      R.stop(rule);rule.stoppedReason='completed-once';rule.stoppedOn=s.date;
      log(s,'rule-stopped',activity.name+'을 마쳐 예약을 자동 종료했습니다.',{activityId:activity.id,ruleId:rule.id,reason:'completed-once',category:'completed'});
    }
    // A previously saved or manually confirmed duplicate must not keep asking
    // for a second performance of an activity that has now been completed.
    for(const pending of s.plan.filter(item=>item.id!==plan.id&&item.activityId===activity.id))removePlan(s,pending.id,'procedure-once');
  }
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
    const vaccineDate=s.config.year+'-'+(s.config.year===2026&&s.config.age>=65?(s.config.age>=75?'10-06':s.config.age>=70?'10-12':'10-15'):'10-01');
    if(s.date===vaccineDate&&!s.flags.vaccineDate){if(id==='autumn_reflection')queue(s,'autumn_reflection',C.addDays(s.date,1));id='flu_vaccine_season';}
    if(suffix==='07-25'&&E.eligible(s,'military_leave'))id='military_leave';
    if(suffix==='02-07'&&s.config.maritalStatus==='married')id=children(s).some(child=>child.age<18)?'partner_care':'partner_weekend';
    if(suffix==='02-07'&&['single','divorced','widowed'].includes(s.config.maritalStatus))id=children(s).some(child=>child.age<18)?'single_care':'single_weekend';
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
      if(children(s).some(child=>child.age<18)&&s.config.careShare>0)candidates.push('care_appointment');
      if(s.config.transport!=='walk')candidates.push('transport_delay');
      if(E.eligible(s,'illness_influenza')){
        candidates.push('illness_influenza','illness_pneumonia');
        if(E.eligible(s,'child_hfmd'))candidates.push('child_hfmd');
      }
      if(E.eligible(s,'low_condition_week')){
        candidates.push('low_condition_week','sleep_disruption','weekday_overload');
        if(s.config.transport!=='walk')candidates.push('traffic_minor');
      }
      const weight=id=>id==='illness_influenza'?influenzaWeight(s,s.date):1;
      let draw=pick*candidates.reduce((sum,id)=>sum+weight(id),0),selected=candidates[candidates.length-1];
      for(const id of candidates){draw-=weight(id);if(draw<0){selected=id;break;}}
      s.lastExternal=s.date;queue(s,selected,s.date,{scheduledDate:s.date});
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
    s.phase='event';s.pendingEvent={id:'constraint-'+(++s.sequence),catalogId:'constraint',title:cause==='time'?'오늘은 시간이 조금 모자라요':'오늘 계획을 조금 바꿔 볼까요',description:reason,date:s.date,source:'constraint',context:{planId:p.id,cause},choices:[
      {id:'reschedule',label:'다른 시간으로 옮길게요',description:'이번 주 남은 시간에서 약속을 지킬 수 있는 때를 찾아봅니다.'},
      {id:'free',label:'오늘은 집에서 쉴래요',description:'돈을 쓰지 않고, 지금 남아 있는 시간만큼 쉽니다.'},
      {id:'skip',label:'이번에는 쉬어 갈게요',description:'이번 약속은 건너뛰고 다음 일정을 이어갑니다.'}
    ]};return {ok:false,event:s.pendingEvent,reason};
  }
  function performActivity(s,p) {
    const a=D.ACTIVITY_MAP[p.activityId];
    const unavailable=D.activityReason(s.config,a.id);if(unavailable)return specialEvent(s,p,unavailable+'이어서 이 활동을 다시 조정해야 합니다.',a.parenting?'care':'role');
    const permitted=availability(s,a.id,p.date,p.slot,p.id,false);if(!permitted.allowed)return specialEvent(s,p,permitted.reason,permitted.cause);
    if(p.automatic&&!p.ruleId&&a.manualOnly)return specialEvent(s,p,a.name+'는 직접 계획하거나 반복 예약으로 고르는 활동이에요.','manual');
    if(p.automatic&&!p.ruleId&&!cadenceCheck(s,a.id,p.date,p.id).allowed)return specialEvent(s,p,a.name+'은 '+a.cadence.label+' 자동으로 챙겨요. 이미 마친 일과 잡아 둔 약속 사이에 간격을 두어요.','cadence');
    const blocked=s.dayState.blocks[p.slot]||0;
    const time=activityTime(s,a.id,p.date,p.slot)+blocked+(a.location!=='home'?s.dayState.extraTravel:0);
    if(time>240){const result=specialEvent(s,p,'돌봄과 이동까지 챙기면 '+a.name+'을 마칠 시간이 부족해요. 다른 때로 옮기거나 오늘은 쉬어 갈 수 있습니다.','time');s.pendingEvent.context.details={requiredMinutes:time,availableMinutes:240};return result;}
    const cost=activityCost(s,a.id),paid=F.spend(s.finance,s.date,cost,p.payment,a.name,s.config);
    if(!paid.ok)return specialEvent(s,p,paid.reason,paid.cause||'money');
    if(a.location!=='home')s.dayState.extraTravel=0;
    const values=activityEffects(s,a);
    const tired=s.stats.fatigue>=70;
    if(tired){if(values.preparation)values.preparation=Math.ceil(values.preparation*.55);if(values.research)values.research=Math.ceil(values.research*.55);if(values.work)values.work=Math.ceil(values.work*.55);if(values.mood>0)values.mood=Math.ceil(values.mood*.5);}
    if(s.config.preferences.includes(a.id)){values.mood=(values.mood||0)+1.5;values.happiness=(values.happiness||0)+1;}
    if(F.available(s.finance,s.config)<50000&&cost>0)values.mood=(values.mood||0)-2;
    if((a.id==='study'&&['06','11'].includes(s.date.slice(5,7)))||(a.id==='research'&&['09','11'].includes(s.date.slice(5,7)))){values.mood=(values.mood||0)+2;values.fatigue=(values.fatigue||0)+2;}
    if(['chores','cleaning'].includes(a.id)){
      s.household.cleanliness=clamp(s.household.cleanliness+(a.id==='cleaning'?38:25));s.household.lastCleaned=s.date;s.flags.tidyUntil=C.addDays(s.date,7);
      log(s,'household',a.id==='cleaning'?'묵은 먼지를 걷어 내고 집을 청소했습니다.':'집안일을 하며 생활공간을 정돈했습니다.',{activityId:a.id,cleanliness:s.household.cleanliness});
    }
    effect(s,values);s.activityCounts[a.id]=count(s,a.id)+1;s.skills[a.id]=clamp((s.skills[a.id]||0)+(tired?Math.ceil(a.skillGain*.6):a.skillGain));
    log(s,'activity',a.name+' · '+SLOT_LABELS[SLOT_IDS.indexOf(p.slot)],{activityId:a.id,slot:p.slot,minutes:time,...(a.careOverlap?{careOverlapMinutes:Math.min(a.minutes,careMinutes(s,p.date,p.slot))}:{}),...(a.risk?{planId:p.id}:{}),...(a.procedure?{procedureRecoveryUntil:C.addDays(s.date,a.procedure.recoveryDays)}:{}),cost,payment:p.payment,effects:values,moodAfter:s.stats.mood,ruleId:p.ruleId||null,category:'completed'});
    if(a.procedure){const until=C.addDays(s.date,a.procedure.recoveryDays);if(!s.flags.cosmeticRecoveryUntil||until>=s.flags.cosmeticRecoveryUntil){s.flags.cosmeticRecoveryUntil=until;s.flags.cosmeticRecoveryActivity=a.id;s.flags.cosmeticRecoveryStarted=s.date;}}
    if(a.risk)completeRiskActivity(s,p,a);
    if(a.artifact&&count(s,a.id)%a.every===0){const artifact={id:'artifact-'+(++s.sequence),date:s.date,activityId:a.id,name:a.artifact,icon:a.icon,number:Math.floor(count(s,a.id)/a.every),skill:s.skills[a.id],season:season(s.date)};s.artifacts.push(artifact);log(s,'artifact',artifact.name+' #'+artifact.number,{artifactId:artifact.id,activityId:a.id});}
    if(p.ruleId){const rule=s.rules.find(r=>r.id===p.ruleId);if(rule)R.complete(rule,s.date,p.originalDate);}
    finishOnceRules(s,a,p);
    if(['delivery','parttime','sideproject'].includes(a.id))completeSideWork(s,p,a);
    if(a.id==='overtime'){F.addPendingPay(s.finance,s.date,90000,'추가근무 보상');if(count(s,'overtime')%3===0)queue(s,'overtime_boundary',C.addDays(s.date,1));}
    if(a.id==='study'&&count(s,'study')===4)queue(s,'study_checkpoint',C.addDays(s.date,1));
    if(a.id==='jobstudy'&&count(s,'jobstudy')%4===0&&s.config.role==='seeker'){let date=C.addDays(s.date,2+Math.floor(random(s,'followup')*4));while(C.isOff(date))date=C.addDays(date,1);queue(s,'job_interview',date);}
    if(a.id!=='sideproject'&&a.artifact&&s.skills[a.id]>=24&&!s.flags['gather-'+a.id]){s.flags['gather-'+a.id]=true;queue(s,'hobby_gathering',C.addDays(s.date,2+Math.floor(random(s,'followup')*4)),{activityId:a.id});}
    if(a.id!=='sideproject'&&a.artifact&&s.skills[a.id]>=66&&!s.flags['show-'+a.id]){s.flags['show-'+a.id]=true;queue(s,'hobby_exhibition',C.addDays(s.date,3),{activityId:a.id});}
    if(s.stats.fatigue>=82&&(!s.flags.fatigueLast||C.addDays(s.flags.fatigueLast,28)<s.date)){s.flags.fatigueLast=s.date;queue(s,'fatigue_reset',C.addDays(s.date,1));}
    s.dayState.done.push(p.id,'slot-'+p.slot);s.plan=s.plan.filter(x=>x.id!==p.id);return {ok:true};
  }
  function earnedSidePay(s,amount,label,reference,activityId) {
    const result=F.addEarnedPay(s.finance,s.date,amount,label,{reference});
    if(!result.ok)throw new Error(result.reason);
    if(!result.duplicate)log(s,'work',label+' · '+D.formatMoney(amount)+'은 다음 날 들어옵니다.',{activityId,amount,dueDate:C.addDays(s.date,1),reference,category:'completed'});
  }
  function completeSideWork(s,p,a) {
    if(a.id==='delivery'||a.id==='parttime'){
      let amount=D.SIDE_JOBS[a.id].reward;
      if(s.flags.sidejobBonusRemaining>0&&s.date<=s.flags.sidejobBonusUntil){amount+=10000;s.flags.sidejobBonusRemaining--;}
      earnedSidePay(s,amount,a.name+' 보상','sidejob:'+p.id,a.id);
      const total=count(s,'delivery')+count(s,'parttime');
      if(total%3===0)queue(s,'sidejob_pace',C.addDays(s.date,1));
      if(total>=4&&!s.flags.sidejobOfferSeen){s.flags.sidejobOfferSeen=true;queue(s,'sidejob_offer',C.addDays(s.date,2));}
      return;
    }
    if(!s.flags.sideprojectActive){if(count(s,'sideproject')===2)queue(s,'sideproject_offer',C.addDays(s.date,1));return;}
    if(s.stats.fatigue>=75){log(s,'work','많이 피곤해서 오늘은 작업을 정리하는 데 그쳤습니다. 다음에는 쉬고 이어가기로 합니다.',{activityId:a.id,project:s.flags.sideprojectSerial,progress:s.flags.sideprojectProgress,category:'cannot',reason:'fatigue'});return;}
    s.flags.sideprojectProgress=Math.min(4,(s.flags.sideprojectProgress||0)+1);
    log(s,'work','작은 의뢰를 한 걸음 더 진행했습니다.',{activityId:a.id,project:s.flags.sideprojectSerial,progress:s.flags.sideprojectProgress,category:'completed'});
    const milestone=D.SIDE_JOBS.sideproject.milestones.find(item=>item.sessions===s.flags.sideprojectProgress);
    if(milestone)earnedSidePay(s,milestone.reward,s.flags.sideprojectProgress===4?'개인 프로젝트 완성 보상':'개인 프로젝트 중간 보상','project:'+s.flags.sideprojectSerial+':'+milestone.sessions,a.id);
    if(s.flags.sideprojectProgress===4){
      s.flags.sideprojectActive=false;s.flags.sideprojectCompleted=true;
      s.queue=s.queue.filter(item=>item.catalogId!=='sideproject_deadline');delete s.flags.sideprojectDue;
      const artifact={id:'artifact-'+(++s.sequence),date:s.date,activityId:a.id,name:'완성한 작은 프로젝트',icon:a.icon,number:s.flags.sideprojectSerial,skill:s.skills[a.id],season:season(s.date)};
      s.artifacts.push(artifact);log(s,'artifact',artifact.name+' #'+artifact.number,{artifactId:artifact.id,activityId:a.id});
      log(s,'achievement','작은 개인 프로젝트를 완성했습니다.',{eventId:'sideproject_result',activityId:a.id,completed:true,project:s.flags.sideprojectSerial});
      queue(s,'sideproject_result',C.addDays(s.date,1));
    }
  }
  function completeRiskActivity(s,p,a) {
    const reference='activity-incident:'+p.id;
    if(s.finance.ledger.some(item=>item.type==='incident-cost'&&item.reference===reference))return;
    // Risk is rolled only after this paid activity actually finishes. Planning,
    // rejected attempts and cancelled plans never consume this RNG stream.
    if(random(s,'followup')>=a.risk.chance)return;
    const cost=(min,max)=>min+1000*Math.floor(random(s,'followup')*((max-min)/1000+1));
    const repairCost=cost(a.risk.repairMin,a.risk.repairMax),medicalCost=cost(a.risk.medicalMin,a.risk.medicalMax);
    const charged=F.chargeIncident(s.finance,s.date,{repairCost,medicalCost,activityId:a.id,reference,label:a.name+' 사고 수리비·병원비'});
    if(!charged.ok)throw new Error(charged.reason);
    if(charged.duplicate)return;
    const effects={health:-8,fatigue:12,mood:-10};effect(s,effects);
    log(s,'incident',a.name+' 중 사고 · 수리비 '+D.formatMoney(repairCost)+' · 병원비 '+D.formatMoney(medicalCost),{activityId:a.id,reference,repairCost,medicalCost,total:charged.total,paid:charged.paid,unpaid:charged.unpaid,effects,category:'incident'});
  }
  function activityEffects(s,a) {
    const health={walk:2.2,run:4,pt:4,cook:1.5,rest:2,chores:.4,cleaning:.7,garden:1,care:.2,overtime:-2};
    const knowledge={read:3,study:5,research:5,jobstudy:4,culture:4,cook:1,music:1,photo:1,pottery:1,draw:1,garden:.6};
    const family={care:4,cook:2,family_time:8};
    const values={...a.effects};
    if(['delivery','parttime','sideproject'].includes(a.id)&&s.stats.fatigue>=65){values.happiness=(values.happiness||0)-4;values.mood=(values.mood||0)-4;values.health=(values.health||0)-1;}
    for(const [key,map]of Object.entries({health,knowledge,family}))if(values[key]===undefined&&map[a.id]!==undefined)values[key]=map[a.id];
    if(values.happiness===undefined)values.happiness=a.id==='overtime'?-.8:['photo','pottery','music','draw','friends'].includes(a.id)?2.5:a.id==='study'||a.id==='research'?1.2:1.5;
    values.mood=(values.mood||0)*.65;
    if(s.healthEpisode&&s.healthEpisode.subject==='self'&&['run','pt','overtime'].includes(a.id)){values.fatigue=(values.fatigue||0)+4;values.health=(values.health||0)-2;}
    return values;
  }
  function dailyBalance(s) {
    const before=s.household.cleanliness;
    s.household.cleanliness=clamp(before-1.25);
    if(before>=35&&s.household.cleanliness<35)log(s,'household','미뤄 둔 청소가 눈에 띄기 시작했습니다. 집을 정돈할 시간이 필요해요.',{cleanliness:s.household.cleanliness});
    const dirt=Math.max(0,(35-s.household.cleanliness)/35),debt=s.finance.arrears+s.finance.fixedArrears+(s.finance.incidentArrears||0)>0;
    const profile=D.ageHealthProfile(s.config);
    const ease=(key,target,rate)=>{const recovery=(key==='health'&&target>s.stats[key])||(key==='fatigue'&&target<s.stats[key]);s.stats[key]=clamp(s.stats[key]+(target-s.stats[key])*rate*(recovery?profile.recoveryRate:1));};
    // These bounded rhythms are game assumptions, not psychological or medical
    // scales. A quiet day does not produce unlimited happiness or full recovery.
    ease('fatigue',28,.10);
    ease('health',profile.initialHealth-2-15*dirt-Math.max(0,s.stats.fatigue-55)*.18-(s.healthEpisode?.subject==='self'?8:0),.022);
    ease('happiness',58+(s.stats.health-65)*.12+(s.stats.family-60)*.10+(s.stats.relationship-60)*.10-8*dirt-(debt?5:0),.04);
    ease('mood',58+(s.stats.happiness-60)*.2-Math.max(0,s.stats.fatigue-45)*.15-5*dirt-(debt?3:0),.12);
    ease('knowledge',32,.012);
    ease('relationship',58,.018);
    ease('family',58,.018);
    if(careMinutes(s,s.date,C.isOff(s.date)?'morning':'evening'))effect(s,{family:.12});
    for(const key of ['preparation','research','work'])s.stats[key]=clamp(s.stats[key]*.998);
  }
  function processDay(s) {
    ensureDay(s);const d=s.dayState;
    if(!d.begun){F.beginDay(s.finance,s.date,s.config);d.begun=true;}
    const event=maybeEvent(s);if(event)return event;
    if(!d.baseDone){
      for(const slot of SLOT_IDS){const minutes=conditionMinutes(s,s.date,slot);if(minutes){block(s,minutes,s.flags.recoveryCause==='weekday_overload'?'평일의 피로가 남아 토요일에 쉬기로 한 시간':'몸 상태를 살피며 쉬어 가는 시간',slot);if(s.flags.recoveryCause==='weekday_overload')effect(s,{fatigue:-8});}}
      if(s.healthEpisode&&s.date<=s.healthEpisode.recoveryDue){
        if(s.healthEpisode.subject==='self')d.skipWork=true;
        block(s,s.healthEpisode.approach==='share'?30:75,s.healthEpisode.subject==='child'?'아이가 쉬는 동안 곁을 지킨 시간':'진료 후 몸을 돌보고 쉬는 시간',C.isOff(s.date)?'afternoon':'evening');
      }
      if(!C.isOff(s.date)&&!d.skipWork){const fatigue={worker:4,seeker:3,graduate:4,caregiver:3}[s.config.role];effect(s,{fatigue});log(s,'weekday',{worker:'일하며 평일 하루를 보냈어요.',seeker:'일자리를 알아보며 하루를 보냈어요.',graduate:'공부와 연구로 하루를 보냈어요.',caregiver:'가까운 사람들을 돌보며 하루를 보냈어요.'}[s.config.role],{role:s.config.role,fatigue});}
      const care=careMinutes(s,s.date,C.isOff(s.date)?'morning':'evening');if(care){effect(s,{fatigue:care/70});log(s,'care','기본 돌봄 시간',{minutes:care,share:s.config.careShare});}
      d.baseDone=true;
    }
    for(const slot of SLOT_IDS){
      if(d.done.includes('slot-'+slot))continue;
      const p=s.plan.find(x=>x.date===s.date&&x.slot===slot);
      if(p){const result=performActivity(s,p);if(!result.ok)return result;}
      else if(C.isOff(s.date)||slot==='evening'){effect(s,{fatigue:-1});d.done.push('slot-'+slot);}
    }
    dailyBalance(s);
    F.endDay(s.finance,s.date,s.config);
    log(s,'daily','하루의 기록',{stats:clone(s.stats),household:clone(s.household),holiday:C.holiday(s.date),isOff:C.isOff(s.date)});
    if((s.finance.arrears+s.finance.fixedArrears+(s.finance.incidentArrears||0))>0&&(!s.flags.debtLast||C.addDays(s.flags.debtLast,30)<s.date)){s.flags.debtLast=s.date;queue(s,'money_recovery',C.addDays(s.date,1));}
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
        const confirmed=confirmReservations(s);if(!confirmed.ok)return {ok:false,reason:'이번 예약은 시간이나 비용을 조금 조정해야 해요. 날짜를 살펴보고 다시 이어가요.',issues:confirmed.issues};
      }else{s.date=C.addDays(s.date,1);s.dayState=null;}
    }
    return {ok:false,reason:'진행 한도에 도달했습니다. 저장 후 다시 진행하세요.'};
  }
  function finishReview(s) {
    if(s.phase!=='review')return {ok:false,reason:'주간 기록 단계가 아닙니다.'};
    s.date=C.addDays(s.date,1);s.weekStart=s.date;s.weekNumber++;s.dayState=null;s.phase='planning';return {ok:true};
  }
  const AUTOMATIC_MAJOR=new Set(['care_appointment','exam_june','exam_nov','exam_followup','work_review','thesis_presentation','thesis_deadline','thesis_recovery','job_interview','job_offer','partner_weekend','partner_care','partner_followup','single_weekend','single_care','single_followup','illness_influenza','illness_pneumonia','child_hfmd','military_leave','military_return','sidejob_offer','sideproject_offer','sideproject_deadline','sideproject_result','traffic_minor','flu_vaccine_season']);
  function automaticNote(s,title,extra) {return log(s,'automation',title,{automatic:true,...extra}).title;}
  function conservativeCash(s,amount) {
    if(s.finance.arrears||s.finance.fixedArrears||s.finance.incidentArrears)return false;
    const promised=s.plan.reduce((sum,p)=>sum+activityCost(s,p.activityId),0);
    return F.canSpend(s.finance,amount,'cash',s.config).ok&&s.finance.cash>=amount+promised&&F.available(s.finance,s.config)>=amount+promised;
  }
  function automaticPolicy(s) {
    const id=s.pendingEvent.catalogId,prefs=s.config.preferences,tired=s.stats.fatigue>=65;
    const social=prefs.some(a=>['friends','volunteer','culture'].includes(a)),family=prefs.includes('family_time');
    const options={
      constraint:['reschedule','free','skip'],care_appointment:['share'],care_followup:[s.flags.careSharedUntil?'continue':'return'],
      household_repair:conservativeCash(s,35000)?['repair','wait']:['wait'],weather:['inside'],transport_delay:['home'],friend_invitation:['call'],relationship_boundary:['reach','space'],
      study_checkpoint:['pace'],exam_june:s.stats.preparation>=60&&!tired&&conservativeCash(s,20000)?['take','defer']:['defer'],exam_nov:s.stats.preparation>=60&&!tired&&conservativeCash(s,20000)?['take','defer']:['defer'],
      exam_followup:[tired?'rest':prefs.includes('study')?'retry':'new'],overtime_boundary:['rest'],work_review:['balance'],
      thesis_presentation:[s.stats.research>=42&&!tired?'present':'small'],thesis_deadline:[s.stats.research>=70&&!tired?'submit':'extend'],thesis_recovery:[tired?'pause':'revise'],
      job_interview:[s.stats.fatigue<80?'attend':'decline'],job_offer:['accept'],
      hobby_gathering:!tired&&prefs.includes(s.pendingEvent.context.activityId)&&conservativeCash(s,10000)?['join','solo']:['solo'],hobby_exhibition:!tired&&prefs.includes(s.pendingEvent.context.activityId)?['share','private']:['private'],
      money_recovery:['reduce'],fatigue_reset:['rest'],autumn_reflection:['keep'],
      partner_weekend:[family?'together':'individual'],partner_care:[tired?'swap':'keep'],partner_followup:['continue'],single_weekend:[social?'connect':'own'],single_care:[tired?'ask':'own'],single_followup:['continue'],
      illness_influenza:['rest'],illness_pneumonia:['rest'],child_hfmd:['share'],illness_recovery:['slow'],military_leave:[family?'together':'space'],military_return:['call'],
      sidejob_pace:['rest'],sidejob_offer:[!tired&&(prefs.some(a=>['delivery','parttime'].includes(a))||s.finance.fixedArrears>0)?'accept':'later'],
      sideproject_offer:[!tired&&prefs.includes('sideproject')?'accept':'decline'],sideproject_deadline:[!tired&&prefs.includes('sideproject')&&s.flags.sideprojectProgress>=2&&!s.flags.sideprojectExtended?'extend':'close'],sideproject_result:['rest'],
      traffic_minor:['rest'],low_condition_week:['rest'],weekday_overload:['rest'],sleep_disruption:['rest'],condition_recovery:['gentle'],flu_vaccine_season:['vaccinate','later'],vaccine_followup:['continue']
    };
    return options[id]||null;
  }
  function resolveAutomatic(s,options) {
    if(s.phase!=='event')return {ok:true,handled:false,notes:[]};
    const decisions=options?.manualMinorChoices?'all':options?.decisions||'auto';
    if(!['auto','important','all'].includes(decisions))return {ok:false,handled:false,notes:[],reason:'자동 선택 방식을 확인해 주세요.',stopped:'blocked'};
    if(decisions==='all'||decisions==='important'&&AUTOMATIC_MAJOR.has(s.pendingEvent.catalogId))return {ok:true,handled:false,notes:[],stopped:'major-decision',event:s.pendingEvent};
    const event=s.pendingEvent,ids=automaticPolicy(s);
    if(!ids)return {ok:true,handled:false,notes:[],stopped:'major-decision',event};
    // Only explicitly listed, resource-aware choices are attempted. No catalog
    // order fallback may accept an unknown commitment or spend on the user's behalf.
    let reason='';
    for(const id of ids){const choice=event.choices.find(item=>item.id===id);if(!choice)continue;const firstLog=s.log.length,result=choose(s,id);for(const item of s.log.slice(firstLog))item.automatic=true;if(result.ok){const title=automaticNote(s,event.title+' · '+choice.label,{eventId:event.catalogId,choiceId:id,policy:'conservative-v1'});return {ok:true,handled:true,notes:[title]};}reason=result.reason;}
    return {ok:false,handled:false,notes:[],reason:reason||'이번 선택은 직접 살펴봐 주세요.',stopped:'blocked',event:s.pendingEvent};
  }
  function automaticReservations(s) {
    const notes=[];
    for(const reservation of reservations(s)){
      // Automatic living uses cash already available by the appointment date.
      // It never creates new card debt in order to keep a recurring appointment.
      const item={...reservation,payment:'cash'};
      let result=addPlan(s,item),moved=false;
      if(!result.ok){
        for(const date of C.weekDates(s.date))for(const slot of SLOT_IDS){
          if(result.ok||date<item.date||date===item.date&&SLOT_IDS.indexOf(slot)<SLOT_IDS.indexOf(item.slot))continue;
          result=addPlan(s,{...item,date,slot});if(result.ok)moved=true;
        }
      }
      if(result.ok){
        const p=result.plan;
        notes.push(automaticNote(s,D.ACTIVITY_MAP[p.activityId].name+' 예약을 '+p.date+' '+SLOT_LABELS[SLOT_IDS.indexOf(p.slot)]+'에 챙겼습니다.',{activityId:p.activityId,ruleId:p.ruleId,originalDate:p.originalDate,plannedDate:p.date,slot:p.slot,moved:moved||reservation.moved,payment:'cash'}));
      }else{
        skipReservation(s,item,result.cause||'time');
        notes.push(automaticNote(s,D.ACTIVITY_MAP[item.activityId].name+' 예약은 이번에 쉬어 가고 다음 회차를 기다립니다.',{activityId:item.activityId,ruleId:item.ruleId,originalDate:item.originalDate,category:'cannot',reason:result.cause||'time'}));
      }
    }
    return notes;
  }
  function automaticPlans(s) {
    const notes=[];
    const checkPlan=p=>{const result=planCheck(s,p,p.id);if(result.ok&&p.automatic&&!p.ruleId){if(D.ACTIVITY_MAP[p.activityId].manualOnly)return {ok:false,cause:'manual',reason:'직접 고르는 활동이에요.'};if(!cadenceCheck(s,p.activityId,p.date,p.id).allowed)return {ok:false,cause:'cadence',reason:'자동 활동 간격을 기다려요.'};}return result;};
    for(const p of [...s.plan]){
      if(p.payment==='card'){
        p.payment='cash';notes.push(automaticNote(s,D.ACTIVITY_MAP[p.activityId].name+'은 카드 청구를 늘리지 않고 가진 돈 안에서 챙깁니다.',{activityId:p.activityId,planId:p.id,payment:'cash'}));
      }
      const check=checkPlan(p);if(check.ok)continue;
      let target=null;
      for(const date of C.weekDates(s.date))for(const slot of SLOT_IDS){if(target||date<p.date||date===p.date&&SLOT_IDS.indexOf(slot)<=SLOT_IDS.indexOf(p.slot))continue;if(checkPlan({...p,date,slot}).ok)target={date,slot};}
      if(target){log(s,'postponed',D.ACTIVITY_MAP[p.activityId].name+'을 여유 있는 시간으로 옮겼습니다.',{activityId:p.activityId,from:p.date,fromSlot:p.slot,to:target.date,toSlot:target.slot,category:'cannot',reason:check.cause||'time',automatic:true});p.date=target.date;p.slot=target.slot;notes.push(automaticNote(s,D.ACTIVITY_MAP[p.activityId].name+'을 '+p.date+'에 이어가기로 했습니다.',{activityId:p.activityId}));}
      else{removePlan(s,p.id,check.cause||'time');notes.push(automaticNote(s,D.ACTIVITY_MAP[p.activityId].name+'은 이번 주에 무리하지 않고 쉬어 갑니다.',{activityId:p.activityId,category:'cannot',reason:check.cause||'time'}));}
    }
    return notes;
  }
  function advanceAutomatic(s,options) {
    const settings=options||{},maxDays=Math.max(1,Math.min(31,Math.floor(settings.maxDays||7))),notes=[];
    let daysAdvanced=0,choicesHandled=0;
    for(let guard=0;guard<500;guard++){
      if(s.phase==='finished')return {ok:true,stopped:'finished',finished:true,notes,daysAdvanced,choicesHandled};
      if(s.phase==='event'){
        const result=resolveAutomatic(s,settings);notes.push(...result.notes);
        if(!result.handled)return {...result,notes,daysAdvanced,choicesHandled};
        choicesHandled++;continue;
      }
      if(s.phase==='review'){if(daysAdvanced)return {ok:true,stopped:'review',notes,daysAdvanced,choicesHandled};finishReview(s);}
      notes.push(...automaticReservations(s),...automaticPlans(s));
      const prepared=prepareAutoWeek(s,{direction:settings.direction||s.flags.autoDirection||'balanced'});
      if(!prepared.ok)return {ok:false,stopped:'blocked',reason:prepared.reason,issues:prepared.issues,notes,daysAdvanced,choicesHandled};
      notes.push(...(prepared.notes||[]));
      const result=processDay(s);
      if(s.phase==='event')continue;
      if(!result.ok)return {...result,stopped:'blocked',notes,daysAdvanced,choicesHandled};
      daysAdvanced++;
      if(s.date===s.config.year+'-12-31'){s.phase='finished';s.dayState=null;log(s,'year-end','한 해의 마지막 정산을 마쳤습니다.');return {ok:true,stopped:'finished',finished:true,notes,daysAdvanced,choicesHandled};}
      if(C.day(s.date)===0){s.review={from:s.weekStart,to:s.date,logs:s.log.filter(item=>item.date>=s.weekStart&&item.date<=s.date)};s.phase='review';return {ok:true,stopped:'review',notes,daysAdvanced,choicesHandled};}
      s.date=C.addDays(s.date,1);s.dayState=null;
      if(daysAdvanced>=maxDays)return {ok:true,stopped:null,notes,daysAdvanced,choicesHandled};
    }
    return {ok:false,stopped:'blocked',reason:'아직 마치지 못한 일정을 살펴봐 주세요.',notes,daysAdvanced,choicesHandled};
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
        if(!target)return {ok:false,reason:'이번 주에는 옮길 만한 여유가 없네요. 오늘은 쉬거나 이번 약속을 건너뛸 수 있어요.'};
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
    const strictMinutes={care_accompany:150,exam_take:150,hobby_join:120,hobby_show:120,vaccine_take:60}[action];
    const strictSlot=action==='care_accompany'?'afternoon':C.isOff(s.date)?'afternoon':'evening';
    if(strictMinutes&&strictMinutes+careMinutes(s,s.date,strictSlot)+(s.dayState.blocks[strictSlot]||0)+(!s.dayState.baseDone?conditionMinutes(s,s.date,strictSlot):0)>240){log(s,'blocked-choice',choice.label+'에 필요한 시간이 부족했습니다.',{eventId:event.catalogId,category:'cannot',reason:careMinutes(s,s.date,strictSlot)?'care':'time'});return {ok:false,reason:'지금 맡은 돌봄과 이 일을 함께하기에는 시간이 부족해요. 도움을 나누거나 다음 기회를 기다릴 수 있습니다.'};}
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
      case 'condition_rest':case 'condition_help':{
        const cause=event.catalogId;let until=C.addDays(s.date,cause==='sleep_disruption'?3:7),saturday;
        if(cause==='weekday_overload'){saturday=s.date;while(C.day(saturday)!==6)saturday=C.addDays(saturday,1);until=saturday;s.flags.overloadSaturday=saturday;}
        s.flags.recoveryStarted=s.date;s.flags.recoveryUntil=until;s.flags.recoveryCause=cause;s.flags.conditionLast=s.date;
        log(s,'health','몸 상태를 살피며 당분간 일정을 줄이기로 했습니다.',{eventId:cause,cause,started:s.date,recoveryDue:until,...(saturday?{overloadSaturday:saturday}:{})});
        queue(s,'condition_recovery',C.addDays(until,1),{cause,started:s.date,recoveryDue:until});break;
      }
      case 'condition_finish':case 'condition_finish_slow':{
        const cause=s.flags.recoveryCause,started=s.flags.recoveryStarted,recoveryDue=s.flags.recoveryUntil;
        if(action==='condition_finish_slow')block(s,60,'몸 상태를 살피며 더 쉬어 간 시간');
        log(s,'health','쉬어 간 날을 돌아보고 일상을 천천히 이어갑니다.',{eventId:'condition_recovery',cause,started,recoveryDue,recovered:true});
        delete s.flags.recoveryStarted;delete s.flags.recoveryUntil;delete s.flags.recoveryCause;delete s.flags.overloadSaturday;break;
      }
      case 'vaccine_take':
        block(s,60,'의료기관 안내를 확인하고 상담·접종에 쓴 시간');s.flags.vaccineDate=s.date;s.flags.vaccineProtectionFrom=C.addDays(s.date,14);
        log(s,'health','독감 예방접종을 받고 달력에 날짜를 남겼습니다.',{eventId:'flu_vaccination',vaccinated:true,protectionFrom:s.flags.vaccineProtectionFrom,minutes:60,cost:0});
        queue(s,'vaccine_followup',s.flags.vaccineProtectionFrom);break;
      case 'vaccine_later':log(s,'goal','이번에는 독감 예방접종 일정을 더 살펴보기로 했습니다.',{eventId:'flu_vaccine_season',category:'choice'});break;
      case 'vaccine_note_rest':block(s,60,'오늘 여유를 남겨 쉬어 간 시간');
      case 'vaccine_note':log(s,'health','달력에 남긴 접종 기록을 다시 확인했습니다.',{eventId:'vaccine_followup',vaccineDate:s.flags.vaccineDate,protectionFrom:s.flags.vaccineProtectionFrom});break;
      case 'sidejob_light':block(s,60,'부업 뒤 쉬며 일정을 정리한 시간');break;
      case 'sidejob_accept':s.flags.sidejobBonusRemaining=2;s.flags.sidejobBonusUntil=C.addDays(s.date,28);log(s,'goal','앞으로 네 주 안에 해낼 수 있는 두 번의 추가 부탁을 받았습니다.',{eventId:event.catalogId,category:'choice'});break;
      case 'sidejob_decline':log(s,'goal','추가 부탁보다 현재의 생활 리듬을 지키기로 했습니다.',{eventId:event.catalogId,category:'choice'});break;
      case 'sideproject_accept':
        s.flags.sideprojectActive=true;s.flags.sideprojectCompleted=false;s.flags.sideprojectExtended=false;s.flags.sideprojectProgress=0;s.flags.sideprojectSerial=(s.flags.sideprojectSerial||0)+1;s.flags.sideprojectDue=C.addDays(s.date,D.SIDE_JOBS.sideproject.deadlineDays);
        log(s,'goal','작은 의뢰를 맡고 여덟 주 동안 조금씩 작업하기로 했습니다.',{eventId:event.catalogId,project:s.flags.sideprojectSerial,dueDate:s.flags.sideprojectDue,category:'choice'});queue(s,'sideproject_deadline',s.flags.sideprojectDue);break;
      case 'sideproject_decline':log(s,'goal','이번 작업은 의뢰 없이 나만의 속도로 이어가기로 했습니다.',{eventId:event.catalogId,category:'choice'});break;
      case 'sideproject_extend':s.flags.sideprojectExtended=true;s.flags.sideprojectDue=C.addDays(s.date,14);log(s,'goal','개인 프로젝트에 두 주의 시간을 더 남겼습니다.',{eventId:event.catalogId,dueDate:s.flags.sideprojectDue,category:'choice'});break;
      case 'sideproject_close':s.flags.sideprojectActive=false;delete s.flags.sideprojectDue;outcome('개인 프로젝트를 지금 만든 범위에서 정리했습니다.',{activityId:'sideproject',completed:false,progress:s.flags.sideprojectProgress||0});break;
      case 'sideproject_again':s.flags.sideprojectCompleted=false;log(s,'goal','새 의뢰는 두 주 뒤 다시 살펴보기로 했습니다.',{eventId:event.catalogId,category:'choice'});queue(s,'sideproject_offer',C.addDays(s.date,14));break;
      case 'illness_rest':case 'illness_share':{
        const kind=event.catalogId==='child_hfmd'?'hfmd':event.catalogId==='illness_pneumonia'?'pneumonia':'influenza';
        const childIndex=kind==='hfmd'?children(s).findIndex(child=>child.age<=2):null;
        const recoveryDue=C.addDays(s.date,kind==='pneumonia'?14:7);
        s.healthEpisode={kind,subject:kind==='hfmd'?'child':'self',childIndex,started:s.date,recoveryDue,approach:action==='illness_share'?'share':'rest'};
        s.flags.illnessLast=s.date;if(kind!=='hfmd')s.dayState.skipWork=true;
        // Every choice keeps treatment in the story and has no mandatory fee.
        // The player is arranging everyday help, not deciding medical treatment.
        log(s,'health',kind==='hfmd'?'어린 자녀의 수족구병으로 돌봄 일정을 다시 나눴습니다.':(kind==='pneumonia'?'폐렴':'독감')+' 진료 후 쉬어 갈 시간을 정했습니다.',{eventId:event.catalogId,subject:s.healthEpisode.subject,childIndex,kind,approach:s.healthEpisode.approach,recoveryDue});
        queue(s,'illness_recovery',recoveryDue,{kind,subject:s.healthEpisode.subject,childIndex});break;
      }
      case 'illness_recover_slow':case 'illness_recover_return':{
        const episode=clone(s.healthEpisode);
        block(s,action==='illness_recover_slow'?90:30,'몸을 돌보며 일상으로 돌아갈 시간을 정했습니다.');
        effect(s,episode.subject==='self'?{health:5}:{family:3});
        log(s,'health',episode.subject==='child'?'아이가 쉬던 한 주를 돌아보고 일상을 천천히 다시 시작합니다.':'쉬어 간 날들을 돌아보고 무리하지 않는 속도로 일상을 다시 시작합니다.',{eventId:event.catalogId,...episode,recovered:true});
        s.healthEpisode=null;break;
      }
      case 'military_together':case 'military_space':{
        const index=children(s).findIndex(child=>child.age>=18&&child.gender==='man'&&child.militaryStatus==='serving');
        s.flags.militaryChildIndex=index;s.flags.militaryLeaveUntil=C.addDays(s.date,7);
        block(s,action==='military_together'?90:30,'휴가 나온 아들과 나눈 시간');
        log(s,'relationship',action==='military_together'?'휴가 나온 아들과 식사하며 이야기를 나눴습니다.':'휴가 나온 아들과 안부를 나누고 각자 쉬는 시간을 존중했습니다.',{eventId:event.catalogId,childIndex:index});
        queue(s,'military_return',s.flags.militaryLeaveUntil,{childIndex:index});break;
      }
      case 'military_send':case 'military_call':{
        block(s,action==='military_send'?60:20,'아들의 복귀 전에 안부를 나눈 시간');
        log(s,'relationship',action==='military_send'?'복귀하는 아들을 배웅하며 다음 연락을 약속했습니다.':'복귀하는 아들에게 전화로 마음을 전했습니다.',{eventId:event.catalogId,childIndex:s.flags.militaryChildIndex});
        delete s.flags.militaryLeaveUntil;delete s.flags.militaryChildIndex;break;
      }
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
      case 'job_accept':{
        const income=s.config.economicProfile?D.LIFECYCLE.employmentIncome(s.config,2400000):{salary:2400000,externalAllowance:0};
        s.config.salary=income.salary;s.config.externalAllowance=income.externalAllowance;s.config.role='worker';
        if(s.config.economicProfile)s.config.economicProfile.active=false;
        if(s.config.incomeOrigin)s.config.incomeOrigin.kind='custom';
        s.queue=s.queue.filter(item=>!['job_interview','job_offer'].includes(item.catalogId));outcome('근무 제안을 수락했습니다. 다음 급여일부터 새 수입이 적용됩니다.',{salary:2400000});break;
      }
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
        for(const p of s.plan.filter(p=>activityCost(s,p.activityId)>0)){const original=p.activityId;removePlan(s,p.id,event.catalogId==='money_recovery'?'money':'choice');const remaining=planCheck(s,{...p,activityId:'rest',ruleId:null});if(remaining.ok)s.plan.push({...p,activityId:'rest',payment:'cash',ruleId:null});log(s,'changed',D.ACTIVITY_MAP[original].name+' 대신 여유를 남겼습니다.',{category:event.catalogId==='money_recovery'?'cannot':'choice',reason:event.catalogId==='money_recovery'?'money':'choice'});}break;
    }
    log(s,'event',event.title+' · '+choice.label,{eventId:event.catalogId,source:event.source,choiceId:id,description:choice.description,category:'choice'});
    s.pendingEvent=null;s.phase='planning';if(action==='sideproject_extend')queue(s,'sideproject_deadline',s.flags.sideprojectDue);return {ok:true};
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
    return {year:s.config.year,activityCounts:clone(s.activityCounts),calendar,monthly,artifacts:clone(s.artifacts),achievements:s.log.filter(l=>l.type==='achievement'),relationshipScenes:s.log.filter(l=>l.type==='relationship'),finance:F.summary(s.finance,s.config),happiestMonth:ranked.length?ranked[0]:null,kept:s.log.filter(l=>l.type==='activity'&&l.ruleId).length,postponed:s.log.filter(l=>['postponed','skipped'].includes(l.type)),cannot:s.log.filter(l=>l.category==='cannot'),choices:s.log.filter(l=>l.category==='choice'),log:s.log.slice(),daysPlayed:s.log.filter(l=>l.type==='daily').length};
  }
  return {create,validateConfig,currentWeek,addPlan,prepareAutoWeek,replaceAutoWeek,replanAutoWeek:replaceAutoWeek,removePlan,addRule,reservations,confirmReservations,skipReservation,postponeReservation,stopRule,advance,advanceAutomatic,resolveAutomatic,choose,finishReview,getSummary,activityTime,activityCadence,activityAvailability,travelMinutes,careMinutes,conditionMinutes,influenzaWeight,season,SLOT_IDS,SLOT_LABELS,PUBLIC_STATS,AUTO_DIRECTIONS,AUTOMATIC_MAJOR:[...AUTOMATIC_MAJOR]};
});
