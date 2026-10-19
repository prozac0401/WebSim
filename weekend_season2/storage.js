(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./data.js'):root.S2Data,node?require('./calendar.js'):root.S2Calendar,node?require('./recurrence.js'):root.S2Recurrence,node?require('./events.js'):root.S2Events,node?require('./engine.js'):root.S2Engine,node?require('./finance.js'):root.S2Finance);if(node)module.exports=api;else root.S2Storage=api;})(typeof globalThis!=='undefined'?globalThis:this,function(D,C,R,E,Engine,F){
  'use strict';
  // Keep the browser key stable so v1 players are offered their existing year.
  const KEY='websim-weekend-season2-v1',FORMAT='websim-weekend-season2';
  // Published v2/v3 text signatures permit a wording update without trusting
  // replacement actions in an imported pending event. Past logs stay untouched.
  const LEGACY_EVENTS={care_appointment:'ea889989',care_followup:'81385061',household_repair:'6d254a0a',weather:'684a7431',friend_invitation:'84f296de',transport_delay:'deeef49f',relationship_boundary:'c68e3c17',study_checkpoint:'9b459102',exam_june:'c2314009',exam_nov:'433ad44b',exam_followup:'17c24a39',overtime_boundary:'fbaede74',work_review:'c885f7ef',thesis_presentation:'48c31333',thesis_deadline:'d94a017c',thesis_recovery:'69c4a1e6',job_interview:'63545657',job_offer:'32cc9667',hobby_gathering:'1e5f8a57',hobby_exhibition:'7f17ef47',money_recovery:'43c880d5',fatigue_reset:'7003166d',autumn_reflection:'37c51ac6',partner_weekend:'a4b6dd4f',partner_care:'f6669b1e',partner_followup:'70fe5343',single_weekend:'6e106cd8',single_care:'bbfe2fce',single_followup:'fb31adf4'};
  const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const money=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000000000;
  function checksum(text){let n=2166136261;for(let i=0;i<text.length;i++){n^=text.charCodeAt(i);n=Math.imul(n,16777619);}return(n>>>0).toString(16).padStart(8,'0');}
  function validate(s){
    const errors=[],bad=message=>errors.push(message);
    if(!object(s))return ['저장 상태가 없습니다.'];
    let nodes=0;function walk(x,depth){if(++nodes>150000||depth>24)throw new Error('저장 구조가 너무 큽니다.');if(typeof x==='number'&&!Number.isFinite(x))throw new Error('유한하지 않은 수치가 있습니다.');if(typeof x==='string'&&x.length>4000)throw new Error('문자열이 너무 깁니다.');if(x&&typeof x==='object')for(const key of Object.keys(x)){if(['__proto__','prototype','constructor'].includes(key))throw new Error('허용되지 않는 구조입니다.');walk(x[key],depth+1);}}
    try{walk(s,0);}catch(e){return[e.message];}
    if(s.version!==D.VERSION)bad('지원하지 않는 저장 버전입니다.');
    errors.push(...Engine.validateConfig(s.config));if(errors.length)return errors;
    const inYear=d=>C.validDate(d)&&d.slice(0,4)===String(s.config.year);
    if(!inYear(s.date)||!inYear(s.weekStart)||s.weekStart>s.date)bad('진행 날짜가 올바르지 않습니다.');
    if(!['planning','event','review','finished'].includes(s.phase))bad('진행 단계가 올바르지 않습니다.');
    if(!Number.isSafeInteger(s.sequence)||s.sequence<0||s.sequence>1000000||!Number.isInteger(s.weekNumber)||s.weekNumber<1||s.weekNumber>54)bad('진행 번호가 올바르지 않습니다.');
    if(!object(s.stats)||['health','happiness','knowledge','mood','relationship','family','fatigue','preparation','research','work'].some(k=>typeof s.stats[k]!=='number'||!Number.isFinite(s.stats[k])||s.stats[k]<0||s.stats[k]>100))bad('생활 상태 수치를 확인하세요.');
    if(!object(s.household)||!Number.isFinite(s.household.cleanliness)||s.household.cleanliness<0||s.household.cleanliness>100||(s.household.lastCleaned!==null&&(!inYear(s.household.lastCleaned)||s.household.lastCleaned>s.date)))bad('집안일 기록을 읽을 수 없습니다.');
    if(s.healthEpisode!==null){
      const illness=s.healthEpisode,child=object(illness)&&Number.isInteger(illness.childIndex)?D.getChildren(s.config)[illness.childIndex]:null;
      if(!object(illness)||!['influenza','pneumonia','hfmd'].includes(illness.kind)||!['self','child'].includes(illness.subject)||!['rest','share'].includes(illness.approach)||!inYear(illness.started)||illness.started>s.date||!C.validDate(illness.recoveryDue)||illness.recoveryDue<illness.started||illness.recoveryDue>C.addDays(illness.started,60)||(illness.subject==='self'?illness.childIndex!==null:!child)||(illness.kind==='hfmd'&&(illness.subject!=='child'||!child||child.age>2)))bad('아팠던 날의 기록을 읽을 수 없습니다.');
    }
    if(!object(s.rng)||['external','followup'].some(k=>!Number.isInteger(s.rng[k])||s.rng[k]<0||s.rng[k]>4294967295))bad('난수 상태가 올바르지 않습니다.');
    for(const key of ['plan','rules','log','artifacts','queue'])if(!Array.isArray(s[key])||s[key].length>(key==='log'?20000:key==='queue'?100:2000))bad(key+' 목록을 확인하세요.');
    if(errors.length)return errors;
    const unique=(items,key)=>new Set(items.map(x=>x[key])).size===items.length;
    if(!unique(s.plan,'id')||!unique(s.rules,'id')||!unique(s.log,'id')||!unique(s.artifacts,'id'))bad('중복된 기록 ID가 있습니다.');
    const occupied=new Set();
    for(const p of s.plan){const key=p.date+':'+p.slot;if(!object(p)||typeof p.id!=='string'||!D.ACTIVITY_MAP[p.activityId]||!inYear(p.date)||p.date<s.date||!Engine.SLOT_IDS.includes(p.slot)||!['cash','card','debit'].includes(p.payment)||!C.validDate(p.originalDate)||occupied.has(key))bad('활동 배치가 손상되었습니다.');occupied.add(key);if(p.ruleId&&!s.rules.some(r=>r.id===p.ruleId))bad('반복 배치의 원래 규칙이 없습니다.');}
    for(const p of s.plan)if(p.activityMinutes!==undefined){
      const activity=D.ACTIVITY_MAP[p.activityId];
      if(!activity?.education||!Number.isInteger(p.activityMinutes)||p.activityMinutes<1||p.activityMinutes>1440||p.activityMinutes+activity.prep>240)bad('계획한 자녀 교육 시간을 확인하세요.');
    }
    for(const rule of s.rules){try{R.createRule(rule);if(typeof rule.active!=='boolean'||!D.ACTIVITY_MAP[rule.activityId])throw Error();for(const field of ['completed','skipped','postponed']){if(!object(rule[field]))throw Error();for(const [date,value]of Object.entries(rule[field]))if(!C.validDate(date)||(field==='skipped'?value!==true:!C.validDate(value)))throw Error();}if(!C.validDate(rule.nextOriginal)||(rule.lastCompleted!==null&&!C.validDate(rule.lastCompleted)))throw Error();}catch(e){bad('반복 일정이 손상되었습니다.');}}
    const dayDates=new Set();
    for(const entry of s.log){if(!object(entry)||typeof entry.id!=='string'||typeof entry.type!=='string'||typeof entry.title!=='string'||!inYear(entry.date)||entry.date>s.date)bad('기록 날짜나 내용이 손상되었습니다.');if(entry.type==='daily'){if(dayDates.has(entry.date)||!object(entry.stats)||Object.values(entry.stats).some(v=>!Number.isFinite(v)||v<0||v>100))bad('하루 요약이 중복되거나 손상되었습니다.');dayDates.add(entry.date);}if(entry.activityId&&!D.ACTIVITY_MAP[entry.activityId])bad('알 수 없는 활동 기록입니다.');}
    for(const entry of s.log)if(entry.careOverlapMinutes!==undefined){
      const activity=D.ACTIVITY_MAP[entry.activityId],careSlot=C.validDate(entry.date)?C.isOff(entry.date)?'morning':'evening':null;
      const recordedCare=s.log.filter(item=>item.type==='care'&&item.date===entry.date).reduce((sum,item)=>sum+(Number.isFinite(item.minutes)?Math.max(0,item.minutes):0),0);
      const duration=entry.activityMinutes??activity?.minutes??0;
      if(entry.type!=='activity'||!activity?.careOverlap||!Number.isInteger(entry.careOverlapMinutes)||entry.careOverlapMinutes<0||entry.careOverlapMinutes>Math.min(duration,180,recordedCare)||entry.slot!==careSlot&&entry.careOverlapMinutes!==0||!Number.isFinite(entry.minutes)||entry.careOverlapMinutes>entry.minutes)bad('활동과 기본 돌봄이 겹친 시간을 확인하세요.');
    }
    for(const entry of s.log)if(entry.activityMinutes!==undefined){
      const activity=D.ACTIVITY_MAP[entry.activityId],minutes=entry.activityMinutes;
      // A later family agreement can change care after the day's care record.
      // Keep overlap upper bounds above; do not infer an exact past care basis.
      if(entry.type!=='activity'||!activity?.education||!Number.isInteger(minutes)||minutes<1||minutes>1440||!Engine.SLOT_IDS.includes(entry.slot)||!Number.isInteger(entry.minutes)||entry.minutes>240||entry.minutes<(activity?.prep||0)+minutes||!Number.isInteger(entry.careOverlapMinutes)||entry.effects?.family!==(activity?.effects.family||0)*Math.min(minutes,activity?.education?.familyCapMinutes||60)/(activity?.education?.familyCapMinutes||60))bad('실제로 마친 자녀 교육 시간·돌봄·가족관계 효과가 일치하지 않습니다.');
    }
    for(const artifact of s.artifacts)if(!object(artifact)||!D.ACTIVITY_MAP[artifact.activityId]||!inYear(artifact.date)||artifact.date>s.date||typeof artifact.name!=='string'||!s.log.some(l=>l.type==='artifact'&&l.artifactId===artifact.id))bad('결과물과 로그가 일치하지 않습니다.');
    if(s.log.filter(l=>l.type==='artifact').length!==s.artifacts.length||s.log.some(l=>l.type==='artifact'&&!s.artifacts.some(a=>a.id===l.artifactId)))bad('결과물 목록과 로그가 일치하지 않습니다.');
    for(const item of s.queue)if(!object(item)||!E.MAP[item.catalogId]||!inYear(item.date)||!object(item.context)||!E.eligible(s,item.catalogId))bad('대기 사건이 손상되었습니다.');
    for(const field of ['skills','activityCounts','flags','eventHistory'])if(!object(s[field]))bad(field+' 상태가 없습니다.');
    if(object(s.flags)){
      if(s.flags.autoDecisions!==undefined&&!['auto','important'].includes(s.flags.autoDecisions))bad('자동 선택 방식을 확인하세요.');
      for(const name of ['sideprojectActive','sideprojectCompleted','sideprojectExtended','sidejobOfferSeen'])if(s.flags[name]!==undefined&&typeof s.flags[name]!=='boolean')bad('부업 진행 상태를 확인하세요.');
      if(s.flags.sideprojectProgress!==undefined&&(!Number.isInteger(s.flags.sideprojectProgress)||s.flags.sideprojectProgress<0||s.flags.sideprojectProgress>4))bad('프로젝트 진척을 확인하세요.');
      if(s.flags.sideprojectSerial!==undefined&&(!Number.isInteger(s.flags.sideprojectSerial)||s.flags.sideprojectSerial<1||s.flags.sideprojectSerial>100))bad('프로젝트 번호를 확인하세요.');
      if(s.flags.sideprojectSerial!==undefined){
        const progress=s.log.filter(l=>l.type==='work'&&l.activityId==='sideproject'&&l.project===s.flags.sideprojectSerial&&l.category==='completed'&&l.progress!==undefined);
        if(progress.length!==(s.flags.sideprojectProgress||0)||progress.some((l,i)=>l.progress!==i+1))bad('프로젝트 진척과 실제 작업 기록이 맞지 않습니다.');
      }
      if(s.flags.sideprojectActive){
        const due=s.flags.sideprojectDue,serial=s.flags.sideprojectSerial;
        const agreement=s.log.some(l=>l.type==='goal'&&l.eventId==='sideproject_offer'&&l.project===serial);
        const followup=s.queue.filter(q=>q.catalogId==='sideproject_deadline');
        const pending=s.pendingEvent?.catalogId==='sideproject_deadline';
        if(!C.validDate(due)||!agreement||!Number.isInteger(s.flags.sideprojectProgress)||s.flags.sideprojectProgress>=4||!(due>s.config.year+'-12-31'?followup.length===0&&!pending:pending?followup.length===0&&s.date>=due:followup.length===1&&followup[0].date===due))bad('프로젝트의 약속과 마감이 이어지지 않습니다.');
      }else if(s.flags.sideprojectDue!==undefined)bad('마감이 남은 프로젝트의 진행 상태를 확인하세요.');
      if(s.flags.sidejobBonusRemaining!==undefined){
        const accepted=s.log.findLastIndex(l=>l.type==='event'&&l.eventId==='sidejob_offer'&&l.choiceId==='accept');
        const used=accepted<0?[]:s.log.slice(accepted+1).filter(l=>l.type==='work'&&['delivery','parttime'].includes(l.activityId)&&l.amount===D.SIDE_JOBS[l.activityId].reward+10000);
        if(!Number.isInteger(s.flags.sidejobBonusRemaining)||s.flags.sidejobBonusRemaining<0||s.flags.sidejobBonusRemaining>2||!C.validDate(s.flags.sidejobBonusUntil)||accepted<0||s.flags.sidejobBonusUntil!==C.addDays(s.log[accepted].date,28)||s.flags.sidejobBonusRemaining!==2-used.length)bad('추가 부업 약속과 완료 기록을 확인하세요.');
      }
      if(s.flags.illnessLast!==undefined&&(!inYear(s.flags.illnessLast)||s.flags.illnessLast>s.date))bad('아팠던 날짜가 올바르지 않습니다.');
      if(s.flags.militaryChildIndex!==undefined){const child=D.getChildren(s.config)[s.flags.militaryChildIndex];if(!Number.isInteger(s.flags.militaryChildIndex)||!child||child.militaryStatus!=='serving')bad('자녀의 휴가 기록을 읽을 수 없습니다.');}
      if(s.flags.militaryLeaveUntil!==undefined&&(!C.validDate(s.flags.militaryLeaveUntil)||!Number.isInteger(s.flags.militaryChildIndex)))bad('휴가 날짜가 올바르지 않습니다.');
      // An active episode includes its beginning, due date and one future scene.
      // A valid checksum alone cannot make a disconnected imported story valid.
      const followupMatches=(id,due,context)=>{
        const queued=s.queue.filter(item=>item.catalogId===id),pending=s.pendingEvent?.catalogId===id?s.pendingEvent:null;
        if(due>s.config.year+'-12-31')return queued.length===0&&!pending;
        const sameContext=value=>Object.entries(context).every(([key,val])=>value?.[key]===val);
        return pending?queued.length===0&&s.date>=due&&sameContext(pending.context):queued.length===1&&queued[0].date===due&&sameContext(queued[0].context);
      };
      const recoveryKeys=['recoveryStarted','recoveryUntil','recoveryCause'];
      if(s.flags.conditionLast!==undefined&&(!inYear(s.flags.conditionLast)||s.flags.conditionLast>s.date))bad('몸 상태를 돌아본 날짜를 확인하세요.');
      if(recoveryKeys.some(key=>s.flags[key]!==undefined)){
        const started=s.flags.recoveryStarted,due=s.flags.recoveryUntil,cause=s.flags.recoveryCause;
        const causes=['traffic_minor','low_condition_week','sleep_disruption','weekday_overload'];
        let expected=inYear(started)?C.addDays(started,cause==='sleep_disruption'?3:7):null;
        if(cause==='weekday_overload'&&inYear(started)){expected=started;while(C.day(expected)!==6)expected=C.addDays(expected,1);}
        const beginning=s.log.some(l=>l.type==='health'&&l.eventId===cause&&l.cause===cause&&l.started===started&&l.date===started&&l.recoveryDue===due);
        if(!causes.includes(cause)||!inYear(started)||started>s.date||!C.validDate(due)||due!==expected||s.flags.conditionLast!==started||!beginning||!followupMatches('condition_recovery',C.validDate(due)?C.addDays(due,1):'',{cause,started,recoveryDue:due})||(cause==='weekday_overload'?s.flags.overloadSaturday!==due:s.flags.overloadSaturday!==undefined))bad('쉬어 가는 기간과 다음 약속이 이어지지 않습니다.');
      }else if(s.flags.overloadSaturday!==undefined)bad('토요일 휴식의 시작 기록이 없습니다.');
      if(s.flags.vaccineDate!==undefined||s.flags.vaccineProtectionFrom!==undefined){
        const date=s.flags.vaccineDate,due=s.flags.vaccineProtectionFrom;
        const start=s.log.some(l=>l.type==='health'&&l.eventId==='flu_vaccination'&&l.vaccinated===true&&l.date===date&&l.protectionFrom===due);
        const reviewed=s.log.some(l=>l.type==='health'&&l.eventId==='vaccine_followup'&&l.vaccineDate===date&&l.protectionFrom===due&&l.date>=due);
        const connected=reviewed?!s.queue.some(q=>q.catalogId==='vaccine_followup')&&s.pendingEvent?.catalogId!=='vaccine_followup':followupMatches('vaccine_followup',due,{});
        if(!inYear(date)||date>s.date||!C.validDate(due)||due!==(inYear(date)?C.addDays(date,14):null)||!start||!connected)bad('예방접종 날짜와 돌아보기 기록이 이어지지 않습니다.');
      }
      if(object(s.healthEpisode)){
        const illness=s.healthEpisode;
        const beginning=s.log.find(l=>l.type==='health'&&!l.recovered&&l.date===illness.started&&l.kind===illness.kind&&l.subject===illness.subject&&l.childIndex===illness.childIndex&&l.approach===illness.approach&&l.recoveryDue===illness.recoveryDue);
        if(!beginning||s.flags.illnessLast!==illness.started||!C.validDate(illness.started)||illness.recoveryDue!==C.addDays(illness.started,illness.kind==='pneumonia'?14:7)||!followupMatches('illness_recovery',illness.recoveryDue,{kind:illness.kind,subject:illness.subject,childIndex:illness.childIndex}))bad('아팠던 날과 다음 약속이 이어지지 않습니다.');
      }
      const leaveUntil=s.flags.militaryLeaveUntil,index=s.flags.militaryChildIndex;
      if(leaveUntil!==undefined||index!==undefined){
        const beginning=s.log.find(l=>l.type==='relationship'&&l.eventId==='military_leave'&&l.childIndex===index&&C.validDate(l.date)&&C.addDays(l.date,7)===leaveUntil);
        if(!beginning||!C.validDate(leaveUntil)||!followupMatches('military_return',leaveUntil,{childIndex:index}))bad('휴가와 복귀 약속이 이어지지 않습니다.');
      }
    }
    if(object(s.skills))for(const [id,value]of Object.entries(s.skills))if(!D.ACTIVITY_MAP[id]||!Number.isFinite(value)||value<0||value>100)bad('숙련 기록이 손상되었습니다.');
    if(object(s.activityCounts))for(const [id,value]of Object.entries(s.activityCounts))if(!D.ACTIVITY_MAP[id]||!Number.isInteger(value)||value!==s.log.filter(l=>l.type==='activity'&&l.activityId===id).length)bad('활동 횟수와 로그가 일치하지 않습니다.');
    if(object(s.activityCounts))for(const a of D.ACTIVITIES)if((s.activityCounts[a.id]||0)!==s.log.filter(l=>l.type==='activity'&&l.activityId===a.id).length)bad('활동 횟수가 로그에서 누락되었습니다.');
    const procedures=s.log.filter(entry=>entry.type==='activity'&&D.ACTIVITY_MAP[entry.activityId]?.procedure);
    for(const entry of s.log)if(entry.procedureRecoveryUntil!==undefined||entry.type==='activity'&&D.ACTIVITY_MAP[entry.activityId]?.procedure){
      const procedure=D.ACTIVITY_MAP[entry.activityId]?.procedure;
      if(entry.type!=='activity'||!procedure||!C.validDate(entry.date)||!Engine.SLOT_IDS.includes(entry.slot)||entry.procedureRecoveryUntil!==C.addDays(entry.date,procedure.recoveryDays))bad('미용 시술의 완료일과 회복 기간이 일치하지 않습니다.');
    }
    for(const a of D.ACTIVITIES.filter(activity=>activity.procedure)){
      const dates=procedures.filter(entry=>entry.activityId===a.id&&C.validDate(entry.date)).map(entry=>entry.date).sort();
      if(a.procedure.oncePerLife&&dates.length>1)bad('한 번만 가능한 시술의 완료 기록이 중복되었습니다.');
      if(a.procedure.minIntervalDays&&dates.some((date,index)=>index&&date<C.addDays(dates[index-1],a.procedure.minIntervalDays)))bad('레이저 제모 완료 기록은 최소 4주 간격이어야 합니다.');
    }
    for(const rule of s.rules)if(rule.stoppedReason!==undefined||rule.stoppedOn!==undefined){
      const completed=procedures.filter(entry=>entry.activityId===rule.activityId&&entry.date===rule.stoppedOn);
      const ended=s.log.filter(entry=>entry.type==='rule-stopped'&&entry.ruleId===rule.id&&entry.activityId===rule.activityId&&entry.reason==='completed-once'&&entry.date===rule.stoppedOn);
      if(!D.ACTIVITY_MAP[rule.activityId]?.procedure?.oncePerLife||rule.active||rule.stoppedReason!=='completed-once'||!inYear(rule.stoppedOn)||completed.length!==1||ended.length!==1||s.log.indexOf(ended[0])<=s.log.indexOf(completed[0]))bad('한 번만 하는 활동의 예약 종료와 실제 완료 기록이 일치하지 않습니다.');
    }
    for(const entry of s.log.filter(entry=>entry.type==='rule-stopped'&&entry.reason==='completed-once'))if(!s.rules.some(rule=>rule.id===entry.ruleId&&rule.activityId===entry.activityId&&rule.stoppedReason==='completed-once'&&rule.stoppedOn===entry.date&&!rule.active))bad('자동 종료한 예약의 규칙이 없습니다.');
    if(object(s.flags)){
      const latest=procedures.filter(entry=>C.validDate(entry.procedureRecoveryUntil)).reduce((longest,entry)=>!longest||entry.procedureRecoveryUntil>=longest.procedureRecoveryUntil?entry:longest,null);
      const keys=['cosmeticRecoveryUntil','cosmeticRecoveryActivity','cosmeticRecoveryStarted'];
      if(latest? s.flags.cosmeticRecoveryUntil!==latest.procedureRecoveryUntil||s.flags.cosmeticRecoveryActivity!==latest.activityId||s.flags.cosmeticRecoveryStarted!==latest.date:keys.some(key=>s.flags[key]!==undefined))bad('미용 시술 회복 상태와 실제 완료 기록이 일치하지 않습니다.');
    }
    if(!Number.isInteger(s.friendPostponements)||s.friendPostponements<0)bad('약속 기록이 손상되었습니다.');
    if(s.lastExternal!==null&&!inYear(s.lastExternal))bad('외부 사건 날짜가 올바르지 않습니다.');
    if(s.phase==='event'&&!s.pendingEvent||s.phase!=='event'&&s.pendingEvent!==null)bad('사건 진행 단계가 일치하지 않습니다.');
    if(s.pendingEvent){const e=s.pendingEvent;if(!object(e)||e.date!==s.date||!Array.isArray(e.choices)||!object(e.context))bad('현재 사건이 손상되었습니다.');else if(e.catalogId==='constraint'){if(!s.plan.some(p=>p.id===e.context.planId)||e.choices.map(c=>c.id).join(',')!=='reschedule,free,skip')bad('재배치 선택이 손상되었습니다.');}else{const original=E.MAP[e.catalogId];if(!original||!E.eligible(s,e.catalogId)||JSON.stringify(original.choices)!==JSON.stringify(e.choices)||e.title!==original.title||e.source!==original.source)bad('사건 선택지가 원본과 일치하지 않습니다.');}}
    if(s.dayState!==null){const d=s.dayState;if(!object(d)||d.date!==s.date||!Array.isArray(d.done)||!object(d.blocks)||typeof d.begun!=='boolean'||typeof d.baseDone!=='boolean'||typeof d.eventHandled!=='boolean'||typeof d.skipWork!=='boolean')bad('처리 중인 날짜 상태가 손상되었습니다.');else{for(const [slot,value]of Object.entries(d.blocks))if(!Engine.SLOT_IDS.includes(slot)||!Number.isInteger(value)||value<0||value>240)bad('사용한 시간이 올바르지 않습니다.');if(!Number.isInteger(d.extraTravel)||d.extraTravel<0||d.extraTravel>30)bad('이동 시간이 올바르지 않습니다.');}}
    const f=s.finance;
    if(!object(f)||!['cash','cardPending','arrears','fixedArrears','pendingPay','monthSpent'].every(k=>money(f[k]))||!Array.isArray(f.ledger)||f.ledger.length>20000||!Array.isArray(f.pendingRewards)||!object(f.processed)){bad('금융 상태가 손상되었습니다.');return errors;}
    if(f.incidentArrears!==undefined&&!money(f.incidentArrears))bad('사고 비용 미납액을 확인하세요.');
    if(f.currentDate!==null&&(!inYear(f.currentDate)||f.currentDate>s.date))bad('장부 날짜를 확인하세요.');
    if(f.monthKey!==(f.currentDate?f.currentDate.slice(0,7):null))bad('월별 장부 기준이 일치하지 않습니다.');
    if(s.phase==='event'&&(!s.dayState||!s.dayState.begun||f.currentDate!==s.date||!f.processed['begin:'+s.date]||f.processed['end:'+s.date]))bad('사건 날짜의 정산 단계가 일치하지 않습니다.');
    if(s.phase==='review'&&(!dayDates.has(s.date)||!f.processed['end:'+s.date]))bad('주간 기록의 마지막 날짜가 정산되지 않았습니다.');
    if(f.currentDate&&!f.processed['end:'+f.currentDate]&&(!s.dayState||s.dayState.date!==f.currentDate||!s.dayState.begun))bad('진행 중인 날짜 상태가 없습니다.');
    const types=['purchase','fixed-arrears-payment','arrears-payment','salary','allowance','extra-pay','fixed-cost','fixed-unpaid','card-payment','card-unpaid','pending-pay','incident-cost','incident-unpaid','incident-arrears-payment'];
    for(let i=0;i<f.ledger.length;i++){const t=f.ledger[i];if(!object(t)||t.id!=='tx-'+(i+1)||!inYear(t.date)||t.date>s.date||!types.includes(t.type)||!['amount','income','consumption','paid'].every(k=>money(t[k]))||typeof t.label!=='string')bad('거래 장부가 손상되었습니다.');if(t.income!==(['salary','allowance','extra-pay'].includes(t.type)?t.amount:0)||t.consumption!==(['purchase','fixed-cost','incident-cost'].includes(t.type)?t.amount:0)||t.paid>t.amount)bad('거래별 수입·소비·결제가 일치하지 않습니다.');}
    const incidents=f.ledger.filter(item=>item.type==='incident-cost'),incidentUnpaid=f.ledger.filter(item=>item.type==='incident-unpaid'),incidentLogs=s.log.filter(item=>item.type==='incident');
    if(!unique(incidents,'reference')||!unique(incidentUnpaid,'reference')||!unique(incidentLogs,'reference'))bad('사고 비용이 중복되어 있습니다.');
    for(const item of incidents){
      const activity=D.ACTIVITY_MAP[item.activityId],risk=activity?.risk;
      const history=incidentLogs.filter(entry=>entry.reference===item.reference);
      const completed=s.log.filter(entry=>entry.type==='activity'&&entry.activityId===item.activityId&&entry.date===item.date&&typeof entry.planId==='string'&&item.reference==='activity-incident:'+entry.planId);
      if(!risk||typeof item.reference!=='string'||!/^activity-incident:plan-\d+$/.test(item.reference)||item.reference.length>160||!money(item.repairCost)||!money(item.medicalCost)||item.repairCost<(risk?.repairMin||0)||item.repairCost>(risk?.repairMax||0)||item.medicalCost<(risk?.medicalMin||0)||item.medicalCost>(risk?.medicalMax||0)||item.amount!==item.repairCost+item.medicalCost||!money(item.unpaid)||item.paid+item.unpaid!==item.amount||item.method!=='cash'||item.cause!=='incident'||completed.length!==1||history.length!==1)bad('사고 활동과 수리비·병원비 장부가 일치하지 않습니다.');
      const historyItem=history[0];
      if(historyItem&&(historyItem.date!==item.date||historyItem.activityId!==item.activityId||historyItem.repairCost!==item.repairCost||historyItem.medicalCost!==item.medicalCost||historyItem.total!==item.amount||historyItem.paid!==item.paid||historyItem.unpaid!==item.unpaid||s.log.indexOf(historyItem)<=s.log.indexOf(completed[0])))bad('사고 기록의 비용과 결제 내역이 다릅니다.');
      const unpaid=incidentUnpaid.filter(entry=>entry.reference===item.reference);
      if(unpaid.length!==(item.unpaid>0?1:0)||unpaid.some(entry=>entry.date!==item.date||entry.activityId!==item.activityId||entry.amount!==item.unpaid||entry.paid!==0||entry.cause!=='incident'))bad('사고 비용의 미납 기록이 일치하지 않습니다.');
    }
    for(const item of [...incidentLogs,...incidentUnpaid])if(incidents.filter(entry=>entry.reference===item.reference).length!==1)bad('원래 사고 비용 장부가 없습니다.');
    for(const item of f.ledger.filter(entry=>entry.type==='incident-arrears-payment'))if(item.amount<=0||item.paid!==item.amount||item.method!=='cash'||item.cause!=='incident')bad('사고 비용 미납의 납부 내역을 확인하세요.');
    // Housing terms stay fixed for this one-year game. The monthly breakdown
    // must agree with the contract and may occur only once per opened month.
    // Published saves have no breakdown; their existing inclusive fixed cost
    // remains intact and is never reclassified as invented rent or interest.
    const monthly=F.monthlyCosts(s.config),housing=F.housingCosts(s.config);
    const fixed=f.ledger.filter(t=>t.type==='fixed-cost');
    if(!unique(fixed,'date'))bad('같은 달의 생활비가 두 번 기록되어 있습니다.');
    for(const t of fixed){
      if(t.date.slice(8)!=='01'||!f.processed['fixed:'+t.date.slice(0,7)]||t.amount!==monthly.total||!money(t.unpaid)||t.paid+t.unpaid!==t.amount)bad('매달 생활비와 주거비가 계약 내용과 맞지 않습니다.');
      const details=['livingCosts','rent','loanInterest','housingMaintenance','housingTenure','loanPrincipal','housingLoanRateBps'];
      if(s.config.housingTenure!=='unspecified'||details.some(key=>t[key]!==undefined)){
        if(t.livingCosts!==monthly.living||t.rent!==housing.rent||t.loanInterest!==housing.interest||(t.housingMaintenance??0)!==housing.maintenance||t.housingTenure!==housing.tenure||t.loanPrincipal!==housing.loanPrincipal||t.housingLoanRateBps!==housing.rateBps)bad('월세와 대출이자·관리비 내역을 확인하세요.');
      }
    }
    for(const key of Object.keys(f.processed).filter(key=>key.startsWith('fixed:')))if(fixed.filter(t=>t.date===key.slice(6)+'-01').length!==1)bad('월 생활비 납부 기록이 빠져 있습니다.');
    if(f.monthSpent!==f.ledger.filter(t=>['purchase','incident-cost'].includes(t.type)&&t.date.slice(0,7)===f.monthKey).reduce((n,t)=>n+t.amount,0))bad('이번 달 소비와 지출 예산이 일치하지 않습니다.');
    const sum=(field,type)=>f.ledger.reduce((n,t)=>n+(!type||t.type===type?(t[field]||0):0),0);
    if(s.config.startCash+sum('income')-sum('paid')!==f.cash)bad('현금과 거래 장부가 일치하지 않습니다.');
    if(sum('amount','pending-pay')-sum('amount','extra-pay')!==f.pendingPay||f.pendingRewards.some(r=>!money(r.amount)||!inYear(r.earnedDate))||f.pendingRewards.reduce((n,r)=>n+r.amount,0)!==f.pendingPay)bad('지급 예정액과 장부가 일치하지 않습니다.');
    const sidejobs=f.ledger.filter(t=>t.kind==='sidejob');
    const earnedJobs=sidejobs.filter(t=>t.type==='pending-pay'),paidJobs=sidejobs.filter(t=>t.type==='extra-pay');
    const pendingJobs=f.pendingRewards.filter(r=>r.kind==='sidejob');
    const validJob=item=>typeof item.reference==='string'&&item.reference.length>0&&item.reference.length<=200&&inYear(item.earnedDate)&&item.earnedDate<=s.date&&C.validDate(item.dueDate)&&item.dueDate===C.addDays(item.earnedDate,1);
    const sameJob=(a,b)=>a.reference===b.reference&&a.amount===b.amount&&a.label===b.label&&a.earnedDate===b.earnedDate&&a.dueDate===b.dueDate;
    if(!unique(earnedJobs,'reference')||!unique(paidJobs,'reference')||!unique(pendingJobs,'reference'))bad('부업 보상이 중복되어 있습니다.');
    for(const item of sidejobs){
      if(!validJob(item)||!['pending-pay','extra-pay'].includes(item.type)||(item.type==='pending-pay'?item.date!==item.earnedDate:item.date!==item.dueDate))bad('부업의 일한 날과 입금일이 맞지 않습니다.');
    }
    for(const reward of pendingJobs){
      if(!validJob(reward)||reward.dueDate<=f.currentDate||earnedJobs.filter(item=>sameJob(item,reward)).length!==1||paidJobs.some(item=>item.reference===reward.reference))bad('아직 받을 부업 보상이 장부와 맞지 않습니다.');
    }
    for(const paid of paidJobs)if(earnedJobs.filter(item=>sameJob(item,paid)).length!==1)bad('부업 입금의 원래 활동 기록이 없습니다.');
    for(const earned of earnedJobs)if(paidJobs.filter(item=>sameJob(item,earned)).length+pendingJobs.filter(item=>sameJob(item,earned)).length!==1)bad('부업 보상의 지급 상태가 이어지지 않습니다.');
    if(f.pendingRewards.some(r=>r.kind!==undefined&&r.kind!=='sidejob'||r.kind!=='sidejob'&&(r.reference!==undefined||r.dueDate!==undefined)))bad('부업 보상의 종류를 확인하세요.');
    if(f.ledger.filter(t=>t.type==='purchase'&&t.method==='card').reduce((n,t)=>n+t.amount,0)-sum('amount','card-payment')!==f.cardPending)bad('카드 청구액과 장부가 일치하지 않습니다.');
    if(sum('amount','card-unpaid')-sum('amount','arrears-payment')!==f.arrears||sum('amount','fixed-unpaid')-sum('amount','fixed-arrears-payment')!==f.fixedArrears)bad('미납액과 장부가 일치하지 않습니다.');
    if(sum('amount','incident-unpaid')-sum('amount','incident-arrears-payment')!==(f.incidentArrears||0))bad('사고 비용 미납액과 장부가 일치하지 않습니다.');
    for(const [key,value]of Object.entries(f.processed))if(value!==true||!(/^(begin|end):\d{4}-\d{2}-\d{2}$/.test(key)&&inYear(key.slice(key.indexOf(':')+1))||/^fixed:\d{4}-\d{2}$/.test(key)))bad('정산 처리 기록이 손상되었습니다.');
    for(const date of C.dates(s.config.year)){
      if(f.currentDate&&date<=f.currentDate&&!f.processed['begin:'+date])bad('수입·고정비 처리 날짜가 누락되었습니다.');
      if(f.currentDate&&date<f.currentDate&&!f.processed['end:'+date])bad('완료된 날짜 정산이 누락되었습니다.');
      if(!!f.processed['end:'+date]!==dayDates.has(date))bad('날짜 정산과 하루 기록이 일치하지 않습니다.');
      if(f.processed['begin:'+date]&&(!f.currentDate||date>f.currentDate))bad('미래 날짜가 처리되어 있습니다.');
      if(date.slice(8)==='01'&&f.currentDate&&date<=f.currentDate&&!f.processed['fixed:'+date.slice(0,7)])bad('월 고정비 처리 기록이 없습니다.');
    }
    if(s.phase==='finished'&&(s.date!==s.config.year+'-12-31'||dayDates.size!==C.dates(s.config.year).length))bad('연말 기록에 빠진 날짜가 있습니다.');
    return errors;
  }
  function migrate(state,version){
    if(version===D.VERSION)return state;
    if(![1,2,3,4,5].includes(version)||!object(state)||state.version!==version||!object(state.config))throw new Error('이전 저장 버전을 읽을 수 없습니다.');
    const migrated=JSON.parse(JSON.stringify(state));
    migrated.version=D.VERSION;
    // A v1 player did not choose a marital status. Do not invent a spouse or
    // rewrite any past event, financial transaction or random-generator state.
    migrated.config={maritalStatus:'unspecified',personaName:'',lifeIntro:'',generationSeed:null,province:'unspecified',residenceOrigin:null,appearance:null,homeStyle:null,generationModel:null,incomeOrigin:null,childProfiles:null,housingTenure:'unspecified',monthlyRent:0,housingLoanPrincipal:0,housingLoanRateBps:0,housingMaintenance:0,housingOrigin:null,economicProfile:null,...migrated.config};
    // The earlier generator labeled every unmarried parent as single. Update
    // today's description as requested, without changing past scenes, money,
    // care sharing, family members or any random-generator state.
    if(version<5&&migrated.config.maritalStatus==='single'&&migrated.config.children>0){
      migrated.config.maritalStatus='divorced';
      migrated.config.lifeIntro=migrated.config.lifeIntro.replace(/미혼이에요\./g,'이혼 후 자녀와 지내고 있어요.').replace(/미혼/g,'이혼');
    }
    migrated.stats={health:70,happiness:60,knowledge:35,family:60,...migrated.stats};
    if(migrated.household===undefined)migrated.household={cleanliness:70,lastCleaned:null};
    if(migrated.healthEpisode===undefined)migrated.healthEpisode=null;
    if(version<4&&migrated.pendingEvent&&migrated.pendingEvent.catalogId!=='constraint'){
      const event=migrated.pendingEvent,original=E.MAP[event.catalogId];
      if(!original||!LEGACY_EVENTS[event.catalogId]||(version===1&&['partner_weekend','partner_care','partner_followup','single_weekend','single_care','single_followup'].includes(event.catalogId)))throw new Error('이전 저장의 사건 종류가 올바르지 않습니다.');
      const previous=JSON.parse(JSON.stringify(event));
      const oldLabels={household_repair:{repair:'수리비 35,000원 지출'},exam_june:{take:'시험 응시 · 20,000원'},exam_nov:{take:'시험 응시 · 20,000원'},hobby_gathering:{join:'모임에 참여 · 10,000원'}};
      const publishedLabels={household_repair:{repair:'수리비 3.5만원 지출'},exam_june:{take:'시험 응시 · 2만원'},exam_nov:{take:'시험 응시 · 2만원'},hobby_gathering:{join:'모임에 참여 · 1만원'}};
      if(version===1&&Array.isArray(previous.choices))for(const choice of previous.choices)if(oldLabels[event.catalogId]?.[choice.id]===choice.label)choice.label=publishedLabels[event.catalogId][choice.id];
      const signature=value=>checksum(JSON.stringify({title:value.title,source:value.source,choices:value.choices}));
      if(signature(previous)!==LEGACY_EVENTS[event.catalogId]&&signature(previous)!==signature(original))throw new Error('이전 저장의 선택 내용을 확인할 수 없습니다.');
      event.choices=JSON.parse(JSON.stringify(original.choices));
      event.title=original.title;event.description=original.description;event.source=original.source;
    }
    return migrated;
  }
  function serialize(state){const errors=validate(state);if(errors.length)throw new Error(errors[0]);const payload=JSON.stringify(state);return JSON.stringify({format:FORMAT,version:D.VERSION,savedAt:new Date().toISOString(),checksum:checksum(payload),state},null,2);}
  function parse(text){try{if(typeof text!=='string'||text.length>5000000)throw Error('저장 파일은 5MB 이하 JSON이어야 합니다.');const envelope=JSON.parse(text);if(!object(envelope)||envelope.format!==FORMAT||![1,2,3,4,5,D.VERSION].includes(envelope.version)||!object(envelope.state)||envelope.state.version!==envelope.version)throw Error('시즌2에서 저장한 파일인지 확인해 주세요.');if(checksum(JSON.stringify(envelope.state))!==envelope.checksum)throw Error('저장 파일이 손상되거나 변경되었습니다. 다른 저장 파일을 선택해 주세요.');const state=migrate(envelope.state,envelope.version),errors=validate(state);if(errors.length)throw Error(errors[0]);return {ok:true,state,migrated:envelope.version!==D.VERSION,reason:envelope.version!==D.VERSION?'지난 기록과 살림 그대로 이어가요. 새 소득·주거비 기준은 새로 만나는 삶부터 적용돼요.':''};}catch(e){return {ok:false,reason:e.message};}}
  function save(state,storage){try{(storage||localStorage).setItem(KEY,serialize(state));return {ok:true,reason:''};}catch(e){return {ok:false,reason:'브라우저 저장 실패: '+e.message};}}
  function load(storage){try{const value=(storage||localStorage).getItem(KEY);return value?parse(value):{ok:false,reason:'저장된 게임이 없습니다.'};}catch(e){return {ok:false,reason:'브라우저 저장을 읽지 못했습니다: '+e.message};}}
  function clear(storage){try{(storage||localStorage).removeItem(KEY);return {ok:true};}catch(e){return {ok:false,reason:e.message};}}
  return {KEY,FORMAT,validate,serialize,parse,save,load,clear,exportJSON:serialize,importJSON:parse};
});
