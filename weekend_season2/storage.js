(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./data.js'):root.S2Data,node?require('./calendar.js'):root.S2Calendar,node?require('./recurrence.js'):root.S2Recurrence,node?require('./events.js'):root.S2Events,node?require('./engine.js'):root.S2Engine);if(node)module.exports=api;else root.S2Storage=api;})(typeof globalThis!=='undefined'?globalThis:this,function(D,C,R,E,Engine){
  'use strict';
  // Keep the browser key stable so v1 players are offered their existing year.
  const KEY='websim-weekend-season2-v1',FORMAT='websim-weekend-season2';
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
    if(!object(s.stats)||['fatigue','mood','relationship','preparation','research','work'].some(k=>typeof s.stats[k]!=='number'||!Number.isFinite(s.stats[k])||s.stats[k]<0||s.stats[k]>100))bad('생활 상태 수치를 확인하세요.');
    if(!object(s.rng)||['external','followup'].some(k=>!Number.isInteger(s.rng[k])||s.rng[k]<0||s.rng[k]>4294967295))bad('난수 상태가 올바르지 않습니다.');
    for(const key of ['plan','rules','log','artifacts','queue'])if(!Array.isArray(s[key])||s[key].length>(key==='log'?20000:key==='queue'?100:2000))bad(key+' 목록을 확인하세요.');
    if(errors.length)return errors;
    const unique=(items,key)=>new Set(items.map(x=>x[key])).size===items.length;
    if(!unique(s.plan,'id')||!unique(s.rules,'id')||!unique(s.log,'id')||!unique(s.artifacts,'id'))bad('중복된 기록 ID가 있습니다.');
    const occupied=new Set();
    for(const p of s.plan){const key=p.date+':'+p.slot;if(!object(p)||typeof p.id!=='string'||!D.ACTIVITY_MAP[p.activityId]||!inYear(p.date)||p.date<s.date||!Engine.SLOT_IDS.includes(p.slot)||!['cash','card','debit'].includes(p.payment)||!C.validDate(p.originalDate)||occupied.has(key))bad('활동 배치가 손상되었습니다.');occupied.add(key);if(p.ruleId&&!s.rules.some(r=>r.id===p.ruleId))bad('반복 배치의 원래 규칙이 없습니다.');}
    for(const rule of s.rules){try{R.createRule(rule);if(typeof rule.active!=='boolean'||!D.ACTIVITY_MAP[rule.activityId])throw Error();for(const field of ['completed','skipped','postponed']){if(!object(rule[field]))throw Error();for(const [date,value]of Object.entries(rule[field]))if(!C.validDate(date)||(field==='skipped'?value!==true:!C.validDate(value)))throw Error();}if(!C.validDate(rule.nextOriginal)||(rule.lastCompleted!==null&&!C.validDate(rule.lastCompleted)))throw Error();}catch(e){bad('반복 일정이 손상되었습니다.');}}
    const dayDates=new Set();
    for(const entry of s.log){if(!object(entry)||typeof entry.id!=='string'||typeof entry.type!=='string'||typeof entry.title!=='string'||!inYear(entry.date)||entry.date>s.date)bad('기록 날짜나 내용이 손상되었습니다.');if(entry.type==='daily'){if(dayDates.has(entry.date)||!object(entry.stats)||Object.values(entry.stats).some(v=>!Number.isFinite(v)||v<0||v>100))bad('하루 요약이 중복되거나 손상되었습니다.');dayDates.add(entry.date);}if(entry.activityId&&!D.ACTIVITY_MAP[entry.activityId])bad('알 수 없는 활동 기록입니다.');}
    for(const artifact of s.artifacts)if(!object(artifact)||!D.ACTIVITY_MAP[artifact.activityId]||!inYear(artifact.date)||artifact.date>s.date||typeof artifact.name!=='string'||!s.log.some(l=>l.type==='artifact'&&l.artifactId===artifact.id))bad('결과물과 로그가 일치하지 않습니다.');
    if(s.log.filter(l=>l.type==='artifact').length!==s.artifacts.length||s.log.some(l=>l.type==='artifact'&&!s.artifacts.some(a=>a.id===l.artifactId)))bad('결과물 목록과 로그가 일치하지 않습니다.');
    for(const item of s.queue)if(!object(item)||!E.MAP[item.catalogId]||!inYear(item.date)||!object(item.context)||!E.eligible(s,item.catalogId))bad('대기 사건이 손상되었습니다.');
    for(const field of ['skills','activityCounts','flags','eventHistory'])if(!object(s[field]))bad(field+' 상태가 없습니다.');
    if(object(s.skills))for(const [id,value]of Object.entries(s.skills))if(!D.ACTIVITY_MAP[id]||!Number.isFinite(value)||value<0||value>100)bad('숙련 기록이 손상되었습니다.');
    if(object(s.activityCounts))for(const [id,value]of Object.entries(s.activityCounts))if(!D.ACTIVITY_MAP[id]||!Number.isInteger(value)||value!==s.log.filter(l=>l.type==='activity'&&l.activityId===id).length)bad('활동 횟수와 로그가 일치하지 않습니다.');
    if(object(s.activityCounts))for(const a of D.ACTIVITIES)if((s.activityCounts[a.id]||0)!==s.log.filter(l=>l.type==='activity'&&l.activityId===a.id).length)bad('활동 횟수가 로그에서 누락되었습니다.');
    if(!Number.isInteger(s.friendPostponements)||s.friendPostponements<0)bad('약속 기록이 손상되었습니다.');
    if(s.lastExternal!==null&&!inYear(s.lastExternal))bad('외부 사건 날짜가 올바르지 않습니다.');
    if(s.phase==='event'&&!s.pendingEvent||s.phase!=='event'&&s.pendingEvent!==null)bad('사건 진행 단계가 일치하지 않습니다.');
    if(s.pendingEvent){const e=s.pendingEvent;if(!object(e)||e.date!==s.date||!Array.isArray(e.choices)||!object(e.context))bad('현재 사건이 손상되었습니다.');else if(e.catalogId==='constraint'){if(!s.plan.some(p=>p.id===e.context.planId)||e.choices.map(c=>c.id).join(',')!=='reschedule,free,skip')bad('재배치 선택이 손상되었습니다.');}else{const original=E.MAP[e.catalogId];if(!original||!E.eligible(s,e.catalogId)||JSON.stringify(original.choices)!==JSON.stringify(e.choices)||e.title!==original.title||e.source!==original.source)bad('사건 선택지가 원본과 일치하지 않습니다.');}}
    if(s.dayState!==null){const d=s.dayState;if(!object(d)||d.date!==s.date||!Array.isArray(d.done)||!object(d.blocks)||typeof d.begun!=='boolean'||typeof d.baseDone!=='boolean'||typeof d.eventHandled!=='boolean'||typeof d.skipWork!=='boolean')bad('처리 중인 날짜 상태가 손상되었습니다.');else{for(const [slot,value]of Object.entries(d.blocks))if(!Engine.SLOT_IDS.includes(slot)||!Number.isInteger(value)||value<0||value>240)bad('사용한 시간이 올바르지 않습니다.');if(!Number.isInteger(d.extraTravel)||d.extraTravel<0||d.extraTravel>30)bad('이동 시간이 올바르지 않습니다.');}}
    const f=s.finance;
    if(!object(f)||!['cash','cardPending','arrears','fixedArrears','pendingPay','monthSpent'].every(k=>money(f[k]))||!Array.isArray(f.ledger)||f.ledger.length>20000||!Array.isArray(f.pendingRewards)||!object(f.processed)){bad('금융 상태가 손상되었습니다.');return errors;}
    if(f.currentDate!==null&&(!inYear(f.currentDate)||f.currentDate>s.date))bad('장부 날짜를 확인하세요.');
    if(f.monthKey!==(f.currentDate?f.currentDate.slice(0,7):null))bad('월별 장부 기준이 일치하지 않습니다.');
    if(s.phase==='event'&&(!s.dayState||!s.dayState.begun||f.currentDate!==s.date||!f.processed['begin:'+s.date]||f.processed['end:'+s.date]))bad('사건 날짜의 정산 단계가 일치하지 않습니다.');
    if(s.phase==='review'&&(!dayDates.has(s.date)||!f.processed['end:'+s.date]))bad('주간 기록의 마지막 날짜가 정산되지 않았습니다.');
    if(f.currentDate&&!f.processed['end:'+f.currentDate]&&(!s.dayState||s.dayState.date!==f.currentDate||!s.dayState.begun))bad('진행 중인 날짜 상태가 없습니다.');
    const types=['purchase','fixed-arrears-payment','arrears-payment','salary','allowance','extra-pay','fixed-cost','fixed-unpaid','card-payment','card-unpaid','pending-pay'];
    for(let i=0;i<f.ledger.length;i++){const t=f.ledger[i];if(!object(t)||t.id!=='tx-'+(i+1)||!inYear(t.date)||t.date>s.date||!types.includes(t.type)||!['amount','income','consumption','paid'].every(k=>money(t[k]))||typeof t.label!=='string')bad('거래 장부가 손상되었습니다.');if(t.income!==(['salary','allowance','extra-pay'].includes(t.type)?t.amount:0)||t.consumption!==(['purchase','fixed-cost'].includes(t.type)?t.amount:0)||t.paid>t.amount)bad('거래별 수입·소비·결제가 일치하지 않습니다.');}
    if(f.monthSpent!==f.ledger.filter(t=>t.type==='purchase'&&t.date.slice(0,7)===f.monthKey).reduce((n,t)=>n+t.amount,0))bad('이번 달 소비와 지출 예산이 일치하지 않습니다.');
    const sum=(field,type)=>f.ledger.reduce((n,t)=>n+(!type||t.type===type?(t[field]||0):0),0);
    if(s.config.startCash+sum('income')-sum('paid')!==f.cash)bad('현금과 거래 장부가 일치하지 않습니다.');
    if(sum('amount','pending-pay')-sum('amount','extra-pay')!==f.pendingPay||f.pendingRewards.some(r=>!money(r.amount)||!inYear(r.earnedDate))||f.pendingRewards.reduce((n,r)=>n+r.amount,0)!==f.pendingPay)bad('지급 예정액과 장부가 일치하지 않습니다.');
    if(f.ledger.filter(t=>t.type==='purchase'&&t.method==='card').reduce((n,t)=>n+t.amount,0)-sum('amount','card-payment')!==f.cardPending)bad('카드 청구액과 장부가 일치하지 않습니다.');
    if(sum('amount','card-unpaid')-sum('amount','arrears-payment')!==f.arrears||sum('amount','fixed-unpaid')-sum('amount','fixed-arrears-payment')!==f.fixedArrears)bad('미납액과 장부가 일치하지 않습니다.');
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
    if(![1,2].includes(version)||!object(state)||state.version!==version||!object(state.config))throw new Error('이전 저장 버전을 읽을 수 없습니다.');
    const migrated=JSON.parse(JSON.stringify(state));
    migrated.version=D.VERSION;
    // A v1 player did not choose a marital status. Do not invent a spouse or
    // rewrite any past event, financial transaction or random-generator state.
    migrated.config={maritalStatus:'unspecified',personaName:'',lifeIntro:'',generationSeed:null,province:'unspecified',residenceOrigin:null,appearance:null,homeStyle:null,generationModel:null,incomeOrigin:null,...migrated.config};
    if(version===1&&migrated.pendingEvent&&migrated.pendingEvent.catalogId!=='constraint'){
      const event=migrated.pendingEvent,original=E.MAP[event.catalogId];
      if(!original||original.requires)throw new Error('이전 저장의 사건 종류가 올바르지 않습니다.');
      const oldChoices=JSON.parse(JSON.stringify(original.choices));
      const oldLabels={household_repair:{repair:'수리비 35,000원 지출'},exam_june:{take:'시험 응시 · 20,000원'},exam_nov:{take:'시험 응시 · 20,000원'},hobby_gathering:{join:'모임에 참여 · 10,000원'}};
      for(const choice of oldChoices)if(oldLabels[event.catalogId]&&oldLabels[event.catalogId][choice.id])choice.label=oldLabels[event.catalogId][choice.id];
      if(JSON.stringify(event.choices)!==JSON.stringify(oldChoices))throw new Error('이전 저장의 사건 선택지가 원본과 일치하지 않습니다.');
      event.choices=JSON.parse(JSON.stringify(original.choices));
      if(event.catalogId==='job_offer')event.description=original.description;
    }
    return migrated;
  }
  function serialize(state){const errors=validate(state);if(errors.length)throw new Error(errors[0]);const payload=JSON.stringify(state);return JSON.stringify({format:FORMAT,version:D.VERSION,savedAt:new Date().toISOString(),checksum:checksum(payload),state},null,2);}
  function parse(text){try{if(typeof text!=='string'||text.length>5000000)throw Error('저장 파일은 5MB 이하 JSON이어야 합니다.');const envelope=JSON.parse(text);if(!object(envelope)||envelope.format!==FORMAT||![1,2,D.VERSION].includes(envelope.version)||!object(envelope.state)||envelope.state.version!==envelope.version)throw Error('지원하는 시즌2 저장 파일이 아닙니다.');if(checksum(JSON.stringify(envelope.state))!==envelope.checksum)throw Error('저장 파일의 검사값이 일치하지 않습니다. 파일이 손상되거나 변경되었습니다.');const state=migrate(envelope.state,envelope.version),errors=validate(state);if(errors.length)throw Error(errors[0]);return {ok:true,state,migrated:envelope.version!==D.VERSION,reason:envelope.version!==D.VERSION?'이전 저장을 호환 형식으로 읽었습니다. 과거 기록·수입·삽화를 유지하며 새 통계를 소급 적용하지 않습니다.':''};}catch(e){return {ok:false,reason:e.message};}}
  function save(state,storage){try{(storage||localStorage).setItem(KEY,serialize(state));return {ok:true,reason:''};}catch(e){return {ok:false,reason:'브라우저 저장 실패: '+e.message};}}
  function load(storage){try{const value=(storage||localStorage).getItem(KEY);return value?parse(value):{ok:false,reason:'저장된 게임이 없습니다.'};}catch(e){return {ok:false,reason:'브라우저 저장을 읽지 못했습니다: '+e.message};}}
  function clear(storage){try{(storage||localStorage).removeItem(KEY);return {ok:true};}catch(e){return {ok:false,reason:e.message};}}
  return {KEY,FORMAT,validate,serialize,parse,save,load,clear,exportJSON:serialize,importJSON:parse};
});
