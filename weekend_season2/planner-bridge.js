(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./data.js'):root.S2Data,node?require('./engine.js'):root.S2Engine,node?require('./finance.js'):root.S2Finance);
  if(node)module.exports=api;else root.S2PlannerBridge=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(D,E,F){
  'use strict';
  const TYPES=['sleep_in','brunch','family_dining','long_travel','driving','solo_cafe','chores','grocery','walk','deep_rest','late_screen','early_sleep'];
  const SLOT_START={morning:2,afternoon:12,evening:20};
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const weekday=date=>new Date(date+'T12:00:00Z').getUTCDay();
  const addDays=(date,count)=>new Date(Date.parse(date+'T12:00:00Z')+count*86400000).toISOString().slice(0,10);
  const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
  const isWeekend=date=>[0,6].includes(weekday(date));
  function weekendFor(today){
    if(!validDate(today))throw new TypeError('오늘 날짜를 YYYY-MM-DD 형식으로 확인해 주세요.');
    const day=weekday(today),saturday=addDays(today,day===0?-1:day===6?0:6-day);
    return {saturday,sunday:addDays(saturday,1)};
  }
  const daysInYear=year=>year%4===0&&(year%100!==0||year%400===0)?366:365;
  function completionStatus(state){
    const year=state?.config?.year,validYear=Number.isInteger(year)&&year>=2020&&year<=2100;
    const totalDays=validYear?daysInYear(year):0;
    const records=Array.isArray(state?.log)?state.log.filter(log=>log?.type==='daily'):[];
    const dates=new Set(records.filter(log=>validDate(log.date)&&Number(log.date.slice(0,4))===year).map(log=>log.date));
    const completedDays=dates.size;
    const fullRecords=validYear&&records.length===totalDays&&completedDays===totalDays;
    const ok=!!(fullRecords&&state.phase==='finished'&&state.date===year+'-12-31'&&state.pendingEvent==null&&state.dayState==null);
    const reason=ok?'':state?.phase==='finished'?'한 해의 마지막 날짜와 하루 기록을 확인할 수 없어 초안을 만들 수 없어요. 온전한 연말 기록으로 다시 열어 주세요.':'이 삶으로 한 해를 끝까지 살아본 뒤 주말 계획표 초안을 만들 수 있어요.';
    return {ok,reason,year:validYear?year:null,completedDays,totalDays,completedOn:ok?state.date:null};
  }
  function mappedType(id){
    if(['motorbike_tour','circuit_drive'].includes(id))return 'driving';
    if(id==='domestic_trip')return 'long_travel';
    if(id==='golf_round')return 'walk';
    if(['walk','run','pt','photo'].includes(id))return 'walk';
    if(['friends','family_time','volunteer','care','baby_feed','baby_change','baby_sleep','preschool_hygiene','preschool_play','preschool_ready','school_homework','school_reading','school_tidy'].includes(id))return 'family_dining';
    if(['chores','cleaning','cook','overtime','delivery','parttime','study','jobstudy','research','sideproject'].includes(id))return 'chores';
    if(id==='rest')return 'deep_rest';
    return 'solo_cafe';
  }
  function recordedActivityMinutes(record){
    const a=D.ACTIVITY_MAP[record.activityId];
    return a.education&&Number.isInteger(record.activityMinutes)&&record.activityMinutes>0?record.activityMinutes:a.minutes;
  }
  function sourceRows(state,date){
    const logs=state.log.filter(log=>log.date===date),activities=logs.filter(log=>log.type==='activity'&&D.ACTIVITY_MAP[log.activityId]);
    const care=logs.filter(log=>log.type==='care').reduce((sum,log)=>sum+Math.max(0,Number(log.minutes)||0),0);
    const overlapFor=log=>log.slot==='morning'&&D.ACTIVITY_MAP[log.activityId]?.careOverlap?clamp(Number(log.careOverlapMinutes)||0,0,Math.min(care,recordedActivityMinutes(log))):0;
    const overlap=activities.reduce((sum,log)=>sum+overlapFor(log),0),remainingCare=Math.max(0,care-overlap);
    const blocks={morning:0,afternoon:0,evening:0},titles={morning:[],afternoon:[],evening:[]};
    for(const log of logs.filter(log=>log.type==='time'&&SLOT_START[log.slot]!==undefined)){
      blocks[log.slot]+=Math.max(0,Number(log.minutes)||0);titles[log.slot].push(log.title||'생활에 필요한 시간');
    }
    const rows=[];
    if(remainingCare&&!activities.some(log=>log.slot==='morning'&&log.activityId==='care'))rows.push({key:'baseline-care',slot:'morning',type:'family_dining',label:overlap?'남은 기본 돌봄 시간':'기본 돌봄 시간',minutes:remainingCare,travel:0,strain:3,kind:'actual',date,reason:overlap?`이 날짜의 기본 돌봄 ${care}분 중 육아 활동과 겹친 ${overlap}분을 뺀 나머지예요.`:'이 날짜에 실제로 기록된 기본 돌봄 시간이에요.'});
    for(const slot of Object.keys(blocks))if(blocks[slot]){
      const label=titles[slot].join(' · ').slice(0,220),type=/돌봄|아이|자녀|곁/.test(label)?'family_dining':/쉬|몸|피로|휴식|회복|진료/.test(label)?'deep_rest':'chores';
      rows.push({key:'reserved-'+slot,slot,type,label,minutes:blocks[slot],travel:0,strain:type==='family_dining'?3:1,kind:'actual',date,reason:'이 날짜에 사건·몸 상태 때문에 따로 사용한 시간이에요.'});
    }
    for(const log of activities){
      const a=D.ACTIVITY_MAP[log.activityId],slot=SLOT_START[log.slot]===undefined?'afternoon':log.slot;
      const activityMinutes=recordedActivityMinutes(log),recorded=Number.isFinite(log.minutes)?log.minutes:activityMinutes+a.prep;
      const embeddedCare=slot==='morning'&&a.id!=='care'?Math.max(0,care-overlapFor(log)):0;
      // Education records retain the actual learning time. Household help can
      // change after the day's baseline-care log; do not subtract that earlier
      // baseline from the snapshotted home activity a second time.
      const minutes=a.education&&Number.isInteger(log.activityMinutes)?activityMinutes+a.prep:Math.max(1,recorded-embeddedCare-blocks[slot]);
      const travel=Math.max(0,minutes-activityMinutes-a.prep);
      rows.push({key:a.id,slot,type:mappedType(a.id),label:a.name,minutes,travel,strain:a.mode==='together'?3:1,kind:'actual',date,reason:'실제로 마친 활동 기록이에요. 함께 기록된 기본 돌봄·별도 사용 시간은 분리해 한 번만 계산했어요.'+(overlapFor(log)?` 기본 돌봄과 겹치는 ${overlapFor(log)}분은 이 육아 활동에 포함돼요.`:'')});
    }
    return rows;
  }
  function estimatedRows(state,date,existing,budgetState){
    const preferences=D.preferenceActivityIds(state.config);
    const rows=[],hasCare=existing.some(row=>row.key==='baseline-care'||row.slot==='morning'&&(row.key==='care'||D.ACTIVITY_MAP[row.key]?.careOverlap));
    const care=E.careMinutes(state,date,'morning');
    const scheduled=state.plan.filter(plan=>plan.date===date&&!existing.some(row=>row.slot===plan.slot&&D.ACTIVITY_MAP[row.key]));
    const scheduledOverlap=scheduled.filter(plan=>plan.slot==='morning'&&D.ACTIVITY_MAP[plan.activityId]?.careOverlap).reduce((sum,plan)=>sum+Math.min(care,recordedActivityMinutes(plan)),0);
    const remainingCare=Math.max(0,care-scheduledOverlap);
    if(remainingCare&&!hasCare&&!scheduled.some(plan=>plan.slot==='morning'&&plan.activityId==='care'))rows.push({key:'baseline-care',slot:'morning',type:'family_dining',label:scheduledOverlap?'남은 기본 돌봄 시간':'기본 돌봄 시간',minutes:remainingCare,travel:0,strain:3,kind:'estimated',date,reason:scheduledOverlap?'자녀 나이와 돌봄 분담으로 추정한 기본 시간 중 예정한 육아 활동과 겹치지 않는 나머지예요.':'자녀 나이와 현재 돌봄 분담으로 추정한 시간이에요.'});
    const occupied=new Set(existing.filter(row=>D.ACTIVITY_MAP[row.key]).map(row=>row.slot));
    if(state.dayState?.date===date)for(const slot of Object.keys(SLOT_START))if(state.dayState.done?.includes('slot-'+slot))occupied.add(slot);
    for(const plan of scheduled){
      const a=D.ACTIVITY_MAP[plan.activityId];if(!a)continue;
      const travel=E.travelMinutes(state,a);
      rows.push({key:a.id,slot:plan.slot,type:mappedType(a.id),label:a.name,minutes:recordedActivityMinutes(plan)+a.prep+travel,travel,strain:a.mode==='together'?3:1,kind:'scheduled',date,reason:'이 날짜에 잡아 둔 일정이에요. 아직 실행한 기록은 아니에요.'});occupied.add(plan.slot);
    }
    const rate=D.ageHealthProfile(state.config).recoveryRate,tired=state.stats.fatigue>=Math.round(65*rate)||state.stats.health<60||state.healthEpisode?.subject==='self';
    const roleGoal={seeker:'jobstudy',graduate:'research'}[state.config.role];
    const saturday=weekday(date)===6;
    const themes=saturday?{
      morning:['walk','run','photo','garden'],
      afternoon:['pottery','culture','friends','cinema','photo','volunteer'],
      evening:['music','draw','cook','family_time','read']
    }:{
      morning:['cleaning','chores','cook','garden','family_time'],
      afternoon:['read','garden','music','draw','walk','culture'],
      evening:['rest','family_time','read']
    };
    // Use a separate stable hash, never the game's random stream. Opening the
    // same life/weekend again must reproduce the same editable draft.
    const variation=id=>{
      let hash=2166136261;
      for(const char of `${state.config.seed}|${state.config.personaName}|${date}|${id}`)hash=Math.imul(hash^char.charCodeAt(0),16777619);
      return (hash>>>0)%17;
    };
    const used=new Set([...existing,...rows].map(row=>D.canonicalActivityId(row.key)));
    let budget=budgetState.remaining;
    for(const slot of Object.keys(SLOT_START)){
      if(occupied.has(slot)||existing.some(row=>row.slot===slot&&row.key.startsWith('reserved-')))continue;
      const reserved=[...existing,...rows].filter(row=>row.slot===slot).reduce((sum,row)=>sum+row.minutes,0);
      const candidates=[...new Set([...themes[slot],...preferences,...(roleGoal?[roleGoal]:[]),'read','rest','walk','family_time',...(state.household.cleanliness<38?['cleaning']:[])])];
      const eligible=candidates.filter(id=>{
        const a=D.ACTIVITY_MAP[id];if(!a||a.manualOnly||a.legacyOnly||a.requiresPreference&&!preferences.includes(id)||used.has(id)||D.activityReason(state.config,id))return false;
        if(a.cadence&&(budgetState.cadenceUsed.has(a.cadence.group)||!E.activityCadence(state,id,date).allowed))return false;
        if(id==='care'&&slot==='morning'&&care)return false;
        // Shared care and necessary recovery can repeat; optional activities
        // already present anywhere in this weekend leave room for other choices.
        if(budgetState.used.has(id)&&!(id==='rest'&&!saturday&&slot==='evening'))return false;
        if(tired&&((a.effects.fatigue||0)>8||state.healthEpisode?.subject==='self'&&a.location!=='home'))return false;
        const activityMinutes=D.activityMinutes(state.config,id),overlap=a.careOverlap&&slot==='morning'?Math.min(activityMinutes,rows.find(row=>row.key==='baseline-care')?.minutes||0):0;
        return activityMinutes+a.prep+E.travelMinutes(state,a)+reserved-overlap<=240&&D.activityPrice(state.config,id).amount<=Math.max(0,budget);
      });
      const score=id=>{
        let points=variation(id)+(themes[slot].includes(id)?24:0)+(preferences.includes(id)?32:0);
        if(id===roleGoal&&saturday&&slot==='afternoon')points+=85;
        if(id==='cleaning'&&state.household.cleanliness<38)points+=!saturday&&slot==='morning'?80:30;
        if(id==='rest'&&((tired&&saturday&&slot==='morning')||(!saturday&&slot==='evening')))points+=100;
        if(!saturday&&slot==='evening'&&D.ACTIVITY_MAP[id].location!=='home')points-=40;
        return points;
      };
      eligible.sort((a,b)=>score(b)-score(a)||a.localeCompare(b));
      const id=eligible[0];if(!id)continue;
      const a=D.ACTIVITY_MAP[id],travel=E.travelMinutes(state,a),activityMinutes=D.activityMinutes(state.config,id);
      if(a.careOverlap&&slot==='morning'){
        const baseline=rows.find(row=>row.key==='baseline-care');
        if(baseline){baseline.minutes=Math.max(0,baseline.minutes-activityMinutes);baseline.label='남은 기본 돌봄 시간';baseline.reason='추정한 기본 돌봄 중 이 시간에 할 육아 활동과 겹치지 않는 나머지예요.';if(!baseline.minutes)rows.splice(rows.indexOf(baseline),1);}
      }
      const rhythm=saturday?'토요일은 취미·외출에 조금 더 무게를 두고':'일요일은 집에서 할 일과 차분한 마무리에 조금 더 무게를 두고';
      rows.push({key:id,slot,type:mappedType(id),label:a.name,minutes:activityMinutes+a.prep+travel,travel,strain:a.mode==='together'?3:1,kind:'estimated',date,reason:`해당 날짜의 완료 기록이 없어 현재 역할·선호·건강·피로·가용예산으로 만든 모의 일정이에요. ${rhythm}, 주말 전체의 활동 중복을 줄였어요.`});
      budget-=D.activityPrice(state.config,id).amount;used.add(id);budgetState.used.add(id);if(a.cadence)budgetState.cadenceUsed.add(a.cadence.group);
    }
    budgetState.remaining=Math.max(0,budget);
    return rows;
  }
  function averageRows(state,dates,day){
    const samples=dates.filter(date=>(weekday(date)===6?'sat':'sun')===day),groups=new Map();
    for(const date of samples)for(const row of sourceRows(state,date)){
      const key=row.slot+':'+row.key;
      const group=groups.get(key)||{...row,minutes:0,travel:0,count:0};
      group.minutes+=row.minutes;group.travel+=row.travel;group.count++;groups.set(key,group);
    }
    const means=[...groups.values()].map(row=>({...row,minutes:row.minutes/samples.length,travel:row.travel/samples.length,kind:'average',date:null,reason:`기록된 ${day==='sat'?'토':'일'}요일 ${samples.length}일 중 ${row.count}회. 활동이 없던 날도 포함한 하루 평균 ${Math.round(row.minutes/samples.length*10)/10}분이에요.`})).filter(row=>row.minutes>=15);
    const result=[];
    for(const slot of Object.keys(SLOT_START)){
      const rows=means.filter(row=>row.slot===slot).sort((a,b)=>b.minutes-a.minutes||a.key.localeCompare(b.key));
      result.push(...rows.filter(row=>row.key==='baseline-care'||row.key.startsWith('reserved-')),...rows.filter(row=>row.key!=='baseline-care'&&!row.key.startsWith('reserved-')).slice(0,2));
    }
    return result;
  }
  function placeRows(rows,day,events,notes){
    const ordered=[...rows].sort((a,b)=>SLOT_START[a.slot]-SLOT_START[b.slot]||Number(b.key==='baseline-care')-Number(a.key==='baseline-care'));
    for(const row of ordered.slice(0,10)){
      const dur=clamp(Math.round(row.minutes/30),1,32),preferred=SLOT_START[row.slot];
      const starts=[...Array.from({length:32-preferred},(_,i)=>preferred+i),...Array.from({length:preferred},(_,i)=>i)];
      const start=starts.find(start=>start+dur<=32&&!events.some(event=>event.day===day&&start<event.start+event.dur&&event.start<start+dur));
      if(start===undefined){notes.push('30분 칸으로 옮기며 하루에 들어가지 않는 일부 활동은 생략했어요.');continue;}
      events.push({id:'s2-'+(events.length+1),type:row.type,day,start,dur,travel:clamp(Math.round(row.travel),0,180),strain:row.strain,sourceLabel:row.label,sourceReason:row.reason,sourceKind:row.kind,sourceDate:row.date,sourceMinutes:Math.round(row.minutes*100)/100});
    }
    if(ordered.length>10)notes.push('일정이 겹치지 않도록 하루에 최대 10개의 대표 활동을 담았어요.');
  }
  function buildDraft(state,options){
    if(!D||!E||!F||!state?.config||!Array.isArray(state.log))throw new TypeError('주말시즌 계획표2의 삶 기록이 필요해요.');
    const today=options?.today,weekend=weekendFor(today),year=state.config.year;
    const targetDates=[weekend.saturday,weekend.sunday],sameYear=targetDates.some(date=>year===Number(date.slice(0,4)));
    const recordedDates=[...new Set(state.log.filter(log=>(sameYear?['daily','activity','care','time'].includes(log.type):log.type==='daily')&&validDate(log.date)&&log.date.slice(0,4)===String(year)&&log.date<=state.date&&isWeekend(log.date)).map(log=>log.date))].sort();
    const dates=sameYear?recordedDates.filter(date=>targetDates.includes(date)):recordedDates;
    const mode=!sameYear&&dates.length?'year-average':sameYear&&dates.length?'experienced':'life-estimate';
    const notes=['원래 활동 이름을 유지하고 기존 계획표의 비슷한 활동 범주로 옮겼어요. 비교 지수는 두 게임 사이의 효과를 정확히 환산한 값이 아니에요.','게임의 오전·오후·저녁을 각각 09시·14시·18시에 놓고 길이를 가장 가까운 30분으로 반올림했어요. 정확한 시각은 모의 배치예요.','이동·준비·돌봄·별도 사용 시간을 포함한 길이를 사용해요. 활동 요금은 이 계획표의 비교 지수에 포함하지 않아요.'];
    // Reserve all pending appointments before suggesting either day. A Sunday
    // promise must be protected from an earlier Saturday estimate as well.
    const promised=state.plan.filter(plan=>targetDates.includes(plan.date)&&D.ACTIVITY_MAP[plan.activityId]&&!state.log.some(log=>log.date===plan.date&&(log.type==='daily'||log.type==='activity'&&log.slot===plan.slot))).reduce((sum,plan)=>sum+D.activityPrice(state.config,plan.activityId).amount,0);
    const prepared=['sat','sun'].map((day,index)=>{
      const date=targetDates[index];
      const observed=mode==='year-average'&&dates.some(date=>(weekday(date)===6?'sat':'sun')===day);
      const rows=observed?averageRows(state,dates,day):sameYear?sourceRows(state,date):[];
      const completed=observed||sameYear&&state.log.some(log=>log.date===date&&log.type==='daily');
      return {day,date,rows,completed};
    });
    const events=[],budgetState={remaining:Math.max(0,Math.min(state.finance.cash,F.available(state.finance,state.config))-promised),used:new Set(prepared.flatMap(item=>item.rows.map(row=>D.canonicalActivityId(row.key))))};
    for(const plan of state.plan)if(targetDates.includes(plan.date))budgetState.used.add(D.canonicalActivityId(plan.activityId));
    budgetState.cadenceUsed=new Set([...budgetState.used].map(id=>D.ACTIVITY_MAP[id]?.cadence?.group).filter(Boolean));
    for(const item of prepared){
      const {day,date,completed}=item;let rows=item.rows;
      if(!completed){
        let estimates=estimatedRows(state,date,rows,budgetState);
        if(mode==='year-average'){
          const label=day==='sat'?'토':'일';
          estimates=estimates.map(row=>({...row,reason:`${label}요일 평균 표본이 없어 현재 삶의 조건으로 추정했어요. `+row.reason}));
          notes.push(`${label}요일은 마친 하루 기록이 없어 평균을 낼 수 없으므로 그날만 현재 삶의 조건으로 추정했어요. 실제 경험의 평균이 아니에요.`);
        }
        rows=[...rows,...estimates];
      }
      placeRows(rows,day,events,notes);
    }
    if(events.some(event=>event.sourceKind==='estimated'))notes.push('추정 활동은 토·일 전체에서 중복을 줄여 나누고, 토요일은 취미·외출, 일요일은 집에서 할 일·휴식에 조금 더 무게를 두었어요. 실제 기록·예정 일정·관측 평균은 유지하며, 기본 돌봄과 필요한 휴식은 반복될 수 있어요. 조건에 맞는 활동이 부족하면 빈 시간으로 남겨요.');
    const samples=dates.map(date=>state.log.filter(log=>log.date===date&&log.type==='daily').at(-1)).filter(Boolean);
    const mean=(getter,fallback)=>samples.length?samples.reduce((sum,log)=>sum+getter(log),0)/samples.length:fallback;
    const fatigue=mean(log=>log.stats?.fatigue??state.stats.fatigue,state.stats.fatigue),cleanliness=mean(log=>log.household?.cleanliness??state.household.cleanliness,state.household.cleanliness);
    const completion=completionStatus(state);
    const explanation=mode==='year-average'?`${year}년 한 해를 끝까지 산 기록 중 ${dates[0]}~${dates.at(-1)}의 주말 ${dates.length}일을 평균냈어요. 활동이 없던 기록 날짜도 분모에 포함했어요.`:mode==='experienced'?`${year}년 한 해를 마친 기록에서 현실의 이번 주말과 같은 날짜에 실제로 마친 활동·돌봄을 담았어요.${targetDates.some(date=>Number(date.slice(0,4))!==year)?' 연도가 바뀌는 주말에서 다른 연도에 속하는 날짜는 삶의 조건으로 추정하고 따로 표시했어요.':''}`:'한 해를 마친 삶의 조건으로 모의 작성했어요. 해당 날짜의 실제 활동이나 관측 평균이 아닌 추정으로 표시했어요.';
    const source={mode,persona:state.config.personaName||'가상의 인물',year,completed:completion.ok,completedDays:completion.completedDays,totalDays:completion.totalDays,completedOn:completion.completedOn,dates,sampleDays:dates.length,sampleWeekends:new Set(dates.map(date=>weekendFor(date).saturday)).size,recordedFrom:dates[0]||null,recordedTo:dates.at(-1)||null,explanation};
    if(mode==='year-average')notes.push('한 해 동안 하루를 마친 기록이 있는 주말을 평균냈어요. 활동별 총 시간을 기록된 같은 요일 수로 나누고, 평균 15분 미만인 드문 활동은 생략해 각 시간대의 대표 활동을 담았어요.');
    notes.push('수면 7시간과 월요일 불안 3은 기록에서 측정할 수 없어 둔 조정 가능한 기본 가정이에요. 집안일 압박과 목표는 게임 속 정돈·피로를 참고했어요.');
    const draft={version:1,source,weekend,planner:{goal:fatigue>=60?'rest':cleanliness<38?'chores':'mix',baseSleep:7,chores:clamp(Math.round((100-cleanliness)/20),0,5),anxiety:3,gapSlots:0,events,seq:events.length},notes:[...new Set(notes)]};
    const validation=validateModelDraft(draft);if(!validation.ok)throw new Error(validation.reason);
    return draft;
  }
  function createDraft(state,options){
    const status=completionStatus(state);
    if(!status.ok)throw new Error(status.reason);
    const draft=buildDraft(state,options),validation=validateDraft(draft);
    if(!validation.ok)throw new Error(validation.reason);
    return draft;
  }
  function validateDraft(value){
    const validation=validateModelDraft(value);if(!validation.ok)return validation;
    const source=value.source,totalDays=daysInYear(source.year);
    if(source.completed!==true||source.completedDays!==totalDays||source.totalDays!==totalDays||source.completedOn!==source.year+'-12-31')return {ok:false,reason:'한 해를 마친 삶에서 만든 초안만 가져올 수 있어요. 주말시즌 계획표2에서 한 해를 마친 뒤 다시 열어 주세요.'};
    return {ok:true,reason:''};
  }
  function validateModelDraft(value){
    const bad=()=>({ok:false,reason:'삶에서 가져온 계획의 형식이 올바르지 않아요. 주말시즌 계획표2에서 다시 열어 주세요.'});
    const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max,string=(s,max)=>typeof s==='string'&&s.length<=max;
    try{
      if(!object(value)||JSON.stringify(value).length>80000||value.version!==1||!object(value.source)||!object(value.weekend)||!object(value.planner))return bad();
      const s=value.source,w=value.weekend,p=value.planner;
      if(!['experienced','year-average','life-estimate'].includes(s.mode)||!string(s.persona,80)||!integer(s.year,2020,2100)||!string(s.explanation,1200)||!Array.isArray(s.dates)||s.dates.length>110||s.dates.some(date=>!validDate(date)||!isWeekend(date)||Number(date.slice(0,4))!==s.year)||new Set(s.dates).size!==s.dates.length||s.sampleDays!==s.dates.length)return bad();
      if(s.sampleWeekends!==undefined&&(!integer(s.sampleWeekends,0,55)||s.sampleWeekends!==new Set(s.dates.map(date=>weekendFor(date).saturday)).size))return bad();
      for(const key of ['recordedFrom','recordedTo'])if(s[key]!==undefined&&s[key]!==null&&!validDate(s[key]))return bad();
      if(!validDate(w.saturday)||weekday(w.saturday)!==6||w.sunday!==addDays(w.saturday,1))return bad();
      if(!['rest','social','chores','mix'].includes(p.goal)||!Number.isFinite(p.baseSleep)||p.baseSleep<5||p.baseSleep>9||p.baseSleep*2%1||!integer(p.chores,0,5)||!integer(p.anxiety,0,5)||!integer(p.gapSlots,0,4)||!integer(p.seq,0,1000)||!Array.isArray(p.events)||p.events.length>20||p.seq<p.events.length)return bad();
      if(!Array.isArray(value.notes)||value.notes.length>30||value.notes.some(note=>!string(note,600)))return bad();
      const ids=new Set();
      for(const event of p.events){
        if(!object(event)||!string(event.id,64)||!event.id||ids.has(event.id)||!TYPES.includes(event.type)||!['sat','sun'].includes(event.day)||!integer(event.start,0,31)||!integer(event.dur,1,32)||event.start+event.dur>32||!integer(event.travel,0,180)||!integer(event.strain,1,5))return bad();ids.add(event.id);
        if(event.sourceLabel!==undefined&&!string(event.sourceLabel,240)||event.sourceReason!==undefined&&!string(event.sourceReason,600)||event.sourceKind!==undefined&&!['actual','average','estimated','scheduled'].includes(event.sourceKind)||event.sourceDate!=null&&!validDate(event.sourceDate)||event.sourceMinutes!==undefined&&(!Number.isFinite(event.sourceMinutes)||event.sourceMinutes<0||event.sourceMinutes>960))return bad();
        const bounds=event.type==='brunch'?[2,12]:event.type==='late_screen'?[28,32]:event.type==='early_sleep'?[24,32]:[0,32];
        if(event.start<bounds[0]||event.start+event.dur>bounds[1])return bad();
      }
      if(p.events.some((event,i)=>p.events.slice(i+1).some(other=>event.day===other.day&&event.start<other.start+other.dur+p.gapSlots&&other.start<event.start+event.dur+p.gapSlots)))return bad();
      return {ok:true,reason:''};
    }catch(_){return bad();}
  }
  return {createDraft,validateDraft,completionStatus,weekendFor,activityType:mappedType};
});
