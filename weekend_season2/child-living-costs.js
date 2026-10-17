(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./subregion-income-data.js'):root.S2SubregionIncomeData);if(node)module.exports=api;else root.S2ChildLivingCosts=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Subregions){
'use strict';
const SOURCE={id:'private-education-2025',label:'2025 초중고 사교육비조사 · 시도·학교급·자녀 수',publisher:'국가데이터처·교육부',year:2025,published:'2026-03-12',
 url:'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=105597&lev=0&m=020402',
 reportUrl:'https://www.kostat.go.kr/boardDownload.es?bid=245&list_no=443953&seq=1',table:'본문 표13·16, 통계표10',unit:'전체학생 1인당 월 원',
 note:'사교육에 참여하지 않은 학생도 포함한 평균입니다. 시도×학교급과 자녀 수는 별도 집계이며 이를 결합한 게임 금액은 실제 교차통계가 아닙니다. 영유아 양육비나 시군구 생활물가 자료가 아닙니다.'};
// Exact 2025 source cells, converted from 10,000 KRW to KRW.
// Columns: all students, primary, middle, high school (including non-participants).
const ROWS={
 unspecified:[458000,433000,461000,499000],seoul:[663000,601000,664000,767000],busan:[456000,453000,474000,440000],
 daegu:[447000,408000,474000,490000],incheon:[438000,398000,446000,505000],gwangju:[372000,346000,378000,413000],
 daejeon:[443000,422000,438000,486000],ulsan:[398000,371000,439000,403000],sejong:[458000,439000,484000,472000],
 gyeonggi:[499000,470000,482000,573000],gangwon:[333000,335000,352000,310000],chungbuk:[339000,341000,353000,321000],
 chungnam:[345000,342000,356000,340000],jeonbuk:[332000,298000,374000,344000],jeonnam:[309000,307000,336000,285000],
 gyeongbuk:[329000,339000,343000,298000],gyeongnam:[353000,351000,359000,351000],jeju:[369000,366000,370000,376000]
};
const CHILD_COUNT_MEANS=[0,518000,474000,358000];
const MODEL={id:'regional-child-living-2026-v1',
 note:'기본 살림에 자녀별 양육·교육 예산을 더하는 게임 추정입니다. 0~2세 월15만원, 3~6세 월20만원은 게임 가정이며 해당 시도 사교육비의 전국 대비 비율 제곱근을 0.85~1.2배로 제한해 지역 차이를 연결합니다. 7~12세·13~15세·16~18세는 각각 초·중·고 전체학생 평균에 자녀 수별 평균/전국 평균을 곱합니다. 나이로 학교급을 나누는 것은 게임의 단순화입니다. 서울·경기는 구·시군 근로소득의 시도 대비 비율 제곱근을 0.85~1.2배로 제한해 추가 반영합니다. 이 계수는 실제 생활물가가 아닙니다. 19세 이상·복무 중 자녀는 별도 양육·교육비 없이 가구 기본생활비에 포함합니다. 금액은 미래 시즌에도 같은 자료 시점으로 유지합니다.'};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function childrenOf(config){
 const fallback={toddler:1,preschool:4,school:9,teen:16,adult:24}[config.childAge]??4;
 return (Array.isArray(config.childProfiles)?config.childProfiles:Array.from({length:config.children||0},()=>({age:fallback}))).map(c=>({age:c.age,militaryStatus:c.militaryStatus==='serving'?'serving':'none'}));
}
function calculate(config,baseMonthly,minimumLiving){
 const provinceId=Object.hasOwn(ROWS,config.province)?config.province:'unspecified',row=ROWS[provinceId],children=childrenOf(config);
 const municipal=Subregions?.byId(config.subregionId),subregionId=municipal?.provinceId===provinceId?municipal.id:'';
 const municipalFactor=subregionId?clamp(Math.sqrt(Subregions.relativeFactor(subregionId,provinceId)),.85,1.2):1;
 const preschoolFactor=clamp(Math.sqrt(row[0]/ROWS.unspecified[0]),.85,1.2);
 const countFactor=children.length?CHILD_COUNT_MEANS[Math.min(3,children.length)]/ROWS.unspecified[0]:0;
 const amounts=children.map(child=>{
  if(child.age>18||child.militaryStatus==='serving')return 0;
  const base=child.age<=2?150000*preschoolFactor:child.age<=6?200000*preschoolFactor:row[child.age<=12?1:child.age<=15?2:3]*countFactor;
  return Math.round(base*municipalFactor);
 });
 const coreLiving=Math.max(minimumLiving,Math.min(minimumLiving*2,Math.round(baseMonthly*.38))),childLiving=amounts.reduce((a,b)=>a+b,0);
 return {modelId:MODEL.id,sourceId:SOURCE.id,provinceId,subregionId,children,municipalFactor,preschoolFactor,countFactor,amounts,coreLiving,childLiving,total:coreLiving+childLiving};
}
function validate(record,baseMonthly,minimumLiving,household,config){
 if(!record||typeof record!=='object'||!Array.isArray(record.children)||record.children.length>6||record.children.some(c=>!c||!Number.isInteger(c.age)||c.age<0||c.age>49||!['none','serving'].includes(c.militaryStatus)||c.militaryStatus==='serving'&&(c.age<18||c.age>35)))return ['자녀 생활비의 생성 기록을 확인하세요.'];
 const expected=calculate({province:record.provinceId,subregionId:record.subregionId,childProfiles:record.children},baseMonthly,minimumLiving);
 if(Object.keys(expected).some(k=>JSON.stringify(record[k])!==JSON.stringify(expected[k]))||record.children.length!==household.dependentChildren+household.adultChildren||record.children.filter(c=>c.age<18).length!==household.dependentChildren||record.children.filter(c=>c.militaryStatus==='serving').length!==household.awayChildren)return ['자녀 수·지역별 생활비 계산을 확인하세요.'];
 if(config&&(record.provinceId!==config.province||record.subregionId!==(config.subregionId||'')||JSON.stringify(record.children)!==JSON.stringify(childrenOf(config))))return ['현재 자녀·지역과 생활비의 생성 근거가 다릅니다.'];
 return [];
}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
return freeze({SOURCE,MODEL,ROWS,CHILD_COUNT_MEANS,calculate,validate});
});
