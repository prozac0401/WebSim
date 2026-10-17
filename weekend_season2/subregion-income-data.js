(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.S2SubregionIncomeData=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SOURCE={
 id:'nts-wage-subregion-address-2023',publisher:'국세청 / KOSIS',primary:true,
 title:'4.2.15 시·군·구별 근로소득 연말정산 신고현황(주소지)[2016~]',
 url:'https://kosis.kr/statHtml/statHtml.do?orgId=133&tblId=DT_133001N_4215',
 tableId:'DT_133001N_4215',year:2023,updated:'2026-02-20',verifiedOn:'2026-10-17',
 countUnit:'명',amountUnit:'백만원',measure:'과세대상근로소득(총급여)의 인원과 금액',
 geography:'지급명세서 주소지 기준 서울25개 자치구·경기31개 시군. 사업장 원천징수지 기준이 아니다.',
 scope:'2023년 귀속 연말정산 신고자의 세전 연간 과세대상 총급여. 전체 주민·가구의 소득이나 월 실수령액이 아니다.',
 notes:[
  '급여총계 열 대신 과세대상근로소득(총급여) 열의 인원과 금액을 함께 사용한다. 평균은 백만원 금액에1,000,000을 곱해 해당 인원으로 나눈다.',
  '시군구 상대계수는 같은2023년 시군구 평균÷같은2023년 시도 평균이다. 2024·2026년 시군구 소득 관측치로 표시하지 않는다.',
  '금액은 백만원 단위로 공표되어 시군구 금액 합과 시도 소계 사이에 반올림 차이가 있다. 원표 소계를 그대로 보존한다.',
  '여러 근무지의 소득을 합산 신고하지 않은 경우 인원이 중복 집계될 수 있고 연중 입퇴사자도 포함한다.',
  '신규 거주 시군구 추첨에서 이 인원수를 가중치로 사용하는 것은 게임 가정이며 전체 주민의 시군구별 인구 분포가 아니다.'
 ]
};
const MODEL={id:'municipal-wage-ratio-to-household-v1',
 note:'공식 근로소득의 지역 평균 격차를 기존 가구소득 추첨액에 연결한 게임용 합성입니다. 시군구×연령×가구형태의 실제 소득 분포가 아니며 개별 가구의 수입을 예측하지 않습니다.',
 formula:'원래 시도·연령·가구형태 가구소득 추첨액 × (2023시군구 과세대상 총급여 평균÷2023시도 과세대상 총급여 평균), 원 단위 반올림. 이후 기존 역할별 하한·지원·분담 상한을 적용.'};
const PROVINCE_TOTALS={"seoul":{"count":4074222,"grossMillionWon":206154609},"gyeonggi":{"count":5951066,"grossMillionWon":263042560}};
// Exact source cells: standard municipal id, parent province, name,
// taxable-gross recipients, taxable-gross amount in million KRW.
const ROWS=[
 {"id":"11680","provinceId":"seoul","name":"강남구","count":238504,"grossMillionWon":20320151},
 {"id":"11740","provinceId":"seoul","name":"강동구","count":202336,"grossMillionWon":9636540},
 {"id":"11305","provinceId":"seoul","name":"강북구","count":105168,"grossMillionWon":3552047},
 {"id":"11500","provinceId":"seoul","name":"강서구","count":254704,"grossMillionWon":11115420},
 {"id":"11620","provinceId":"seoul","name":"관악구","count":230093,"grossMillionWon":8453248},
 {"id":"11215","provinceId":"seoul","name":"광진구","count":153095,"grossMillionWon":6787398},
 {"id":"11530","provinceId":"seoul","name":"구로구","count":179213,"grossMillionWon":7289485},
 {"id":"11545","provinceId":"seoul","name":"금천구","count":106095,"grossMillionWon":3763785},
 {"id":"11350","provinceId":"seoul","name":"노원구","count":197526,"grossMillionWon":8435368},
 {"id":"11320","provinceId":"seoul","name":"도봉구","count":118976,"grossMillionWon":4316725},
 {"id":"11230","provinceId":"seoul","name":"동대문구","count":137923,"grossMillionWon":5793908},
 {"id":"11590","provinceId":"seoul","name":"동작구","count":171523,"grossMillionWon":8172022},
 {"id":"11440","provinceId":"seoul","name":"마포구","count":165864,"grossMillionWon":9142659},
 {"id":"11410","provinceId":"seoul","name":"서대문구","count":129409,"grossMillionWon":6234739},
 {"id":"11650","provinceId":"seoul","name":"서초구","count":177147,"grossMillionWon":15231642},
 {"id":"11200","provinceId":"seoul","name":"성동구","count":120927,"grossMillionWon":6791990},
 {"id":"11290","provinceId":"seoul","name":"성북구","count":166259,"grossMillionWon":7535577},
 {"id":"11710","provinceId":"seoul","name":"송파구","count":298078,"grossMillionWon":17607778},
 {"id":"11470","provinceId":"seoul","name":"양천구","count":180868,"grossMillionWon":9564714},
 {"id":"11560","provinceId":"seoul","name":"영등포구","count":188468,"grossMillionWon":9710997},
 {"id":"11170","provinceId":"seoul","name":"용산구","count":93602,"grossMillionWon":7313435},
 {"id":"11380","provinceId":"seoul","name":"은평구","count":195639,"grossMillionWon":7859384},
 {"id":"11110","provinceId":"seoul","name":"종로구","count":55994,"grossMillionWon":3106092},
 {"id":"11140","provinceId":"seoul","name":"중구","count":53157,"grossMillionWon":2926665},
 {"id":"11260","provinceId":"seoul","name":"중랑구","count":153654,"grossMillionWon":5492839},
 {"id":"41820","provinceId":"gyeonggi","name":"가평군","count":21337,"grossMillionWon":742852},
 {"id":"41280","provinceId":"gyeonggi","name":"고양시","count":448302,"grossMillionWon":19765677},
 {"id":"41290","provinceId":"gyeonggi","name":"과천시","count":37802,"grossMillionWon":2535300},
 {"id":"41210","provinceId":"gyeonggi","name":"광명시","count":120523,"grossMillionWon":5498780},
 {"id":"41610","provinceId":"gyeonggi","name":"광주시","count":172200,"grossMillionWon":6457002},
 {"id":"41310","provinceId":"gyeonggi","name":"구리시","count":75279,"grossMillionWon":3069136},
 {"id":"41410","provinceId":"gyeonggi","name":"군포시","count":115933,"grossMillionWon":4972800},
 {"id":"41570","provinceId":"gyeonggi","name":"김포시","count":211909,"grossMillionWon":8735291},
 {"id":"41360","provinceId":"gyeonggi","name":"남양주시","count":279523,"grossMillionWon":10777736},
 {"id":"41250","provinceId":"gyeonggi","name":"동두천시","count":32537,"grossMillionWon":1001605},
 {"id":"41190","provinceId":"gyeonggi","name":"부천시","count":329632,"grossMillionWon":12522787},
 {"id":"41130","provinceId":"gyeonggi","name":"성남시","count":410012,"grossMillionWon":23656755},
 {"id":"41110","provinceId":"gyeonggi","name":"수원시","count":546280,"grossMillionWon":26449446},
 {"id":"41390","provinceId":"gyeonggi","name":"시흥시","count":242620,"grossMillionWon":9153782},
 {"id":"41270","provinceId":"gyeonggi","name":"안산시","count":278262,"grossMillionWon":10206754},
 {"id":"41550","provinceId":"gyeonggi","name":"안성시","count":85849,"grossMillionWon":3147415},
 {"id":"41170","provinceId":"gyeonggi","name":"안양시","count":247565,"grossMillionWon":11572863},
 {"id":"41630","provinceId":"gyeonggi","name":"양주시","count":117031,"grossMillionWon":4026271},
 {"id":"41830","provinceId":"gyeonggi","name":"양평군","count":39562,"grossMillionWon":1575054},
 {"id":"41670","provinceId":"gyeonggi","name":"여주시","count":42608,"grossMillionWon":1531932},
 {"id":"41800","provinceId":"gyeonggi","name":"연천군","count":14547,"grossMillionWon":503805},
 {"id":"41370","provinceId":"gyeonggi","name":"오산시","count":111561,"grossMillionWon":4477847},
 {"id":"41460","provinceId":"gyeonggi","name":"용인시","count":464866,"grossMillionWon":24650381},
 {"id":"41430","provinceId":"gyeonggi","name":"의왕시","count":68478,"grossMillionWon":3232787},
 {"id":"41150","provinceId":"gyeonggi","name":"의정부시","count":180539,"grossMillionWon":6273003},
 {"id":"41500","provinceId":"gyeonggi","name":"이천시","count":100352,"grossMillionWon":4550948},
 {"id":"41480","provinceId":"gyeonggi","name":"파주시","count":215868,"grossMillionWon":8430039},
 {"id":"41220","provinceId":"gyeonggi","name":"평택시","count":264662,"grossMillionWon":11171624},
 {"id":"41650","provinceId":"gyeonggi","name":"포천시","count":61353,"grossMillionWon":1955636},
 {"id":"41450","provinceId":"gyeonggi","name":"하남시","count":143491,"grossMillionWon":6823809},
 {"id":"41590","provinceId":"gyeonggi","name":"화성시","count":470583,"grossMillionWon":23573444}
];
function byId(id){return typeof id==='string'?ROWS.find(row=>row.id===id)||null:null;}
function forProvince(provinceId){return ROWS.filter(row=>row.provinceId===provinceId);}
function meanAnnual(id){const row=byId(id);return row?row.grossMillionWon*1000000/row.count:null;}
function relativeFactor(id,provinceId){const row=byId(id);if(!row||row.provinceId!==provinceId)return null;const total=PROVINCE_TOTALS[provinceId];return (row.grossMillionWon/row.count)/(total.grossMillionWon/total.count);}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
return freeze({SOURCE,MODEL,PROVINCE_TOTALS,ROWS,byId,forProvince,meanAnnual,relativeFactor});
});
