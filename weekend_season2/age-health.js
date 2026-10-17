(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.S2AgeHealth=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SOURCES=Object.freeze([{id:'who-ageing-2025',title:'WHO · Ageing and health',url:'https://www.who.int/news-room/fact-sheets/detail/ageing-and-health',published:'2025-10-01',accessed:'2026-10-17',scope:'나이만으로 개인의 건강을 예측할 수 없다는 배경 설명. 아래 점수와 배율의 통계 근거가 아닙니다.'}]);
  const MODEL=Object.freeze({id:'age-health-v1',note:'시작 건강과 회복 비율은 생활의 속도 차이를 표현한 게임 설정입니다. 실제 건강·질병 회복 기간을 예측하지 않으며, 나이와 관계없이 생활 선택에 따라 상태가 달라집니다.'});
  const BANDS=Object.freeze([
    {id:'18-29',min:18,max:29,label:'18~29세',initialHealth:74,recoveryRate:1.10},
    {id:'30-39',min:30,max:39,label:'30대',initialHealth:72,recoveryRate:1},
    {id:'40-49',min:40,max:49,label:'40대',initialHealth:70,recoveryRate:.95},
    {id:'50-59',min:50,max:59,label:'50대',initialHealth:68,recoveryRate:.90},
    {id:'60-69',min:60,max:69,label:'60대',initialHealth:66,recoveryRate:.85},
    {id:'70-100',min:70,max:100,label:'70세 이상',initialHealth:64,recoveryRate:.80}
  ].map(Object.freeze));
  function profile(config){
    if(config.ageHealthModel==null)return {modelId:null,legacy:true,ageBand:'legacy',label:'이전 저장의 기준',initialHealth:70,recoveryRate:1,sourceIds:[]};
    if(config.ageHealthModel!==MODEL.id)throw new RangeError('건강 설정의 버전을 확인해 주세요.');
    const band=BANDS.find(row=>Number.isInteger(config.age)&&config.age>=row.min&&config.age<=row.max);
    if(!band)throw new RangeError('건강 설정에 사용할 나이를 확인해 주세요.');
    return {modelId:MODEL.id,legacy:false,ageBand:band.id,label:band.label,initialHealth:band.initialHealth,recoveryRate:band.recoveryRate,sourceIds:SOURCES.map(source=>source.id)};
  }
  return {SOURCES,MODEL,BANDS,profile};
});
