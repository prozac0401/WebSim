/* Manufacturer-checked transmission families for the display-only HUD.
 * RPM and reduction values below are illustration parameters, not ECU data,
 * measured gear ratios, engine redlines, or inputs to the race physics. */
(function(root){
  'use strict';
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const reviewedAt='2026-10-15';
  const SOURCES=freeze({
    'kia-ray':{title:'기아 레이 정부 신고 연비·변속기',url:'https://www.kia.com/kr/vehicles/ray/specification',observation:'1.0 가솔린 14/15인치: 자동 4단.'},
    'kia-ray-ev':{title:'기아 레이 EV 제원',url:'https://www.kia.com/kr/vehicles/ray-ev/specification',observation:'전기 구동 모델. 내연기관 회전계와 변속 단수 HUD를 표시하지 않는다.'},
    'kia-morning':{title:'기아 모닝 가격·기본 품목',url:'https://www.kia.com/kr/vehicles/morning/price',observation:'스마트스트림 G1.0, 4단 자동변속기.'},
    'hyundai-avante':{title:'현대 2027 아반떼 제원표',url:'https://www.hyundai.com/contents/repn-car/catalog/spec/avante-27fc-spec.pdf',observation:'2.0 가솔린: 스마트스트림 IVT. 별도의 1.6 HEV 6DCT를 현재 가솔린 사양에 적용하지 않는다.'},
    'kia-k5':{title:'기아 K5 정부 신고 연비·변속기',url:'https://www.kia.com/kr/vehicles/k5/specification',observation:'1.6 가솔린 터보: 자동 8단. 2.0 가솔린/LPG: 자동 6단.'},
    'kia-carnival':{title:'기아 카니발 정부 신고 연비·변속기',url:'https://www.kia.com/kr/vehicles/carnival/specification',observation:'3.5 가솔린 9인승 18인치: 자동 8단. 1.6 터보 HEV 9인승 18인치: 자동 6단.'},
    'genesis-g80':{title:'제네시스 G80 국내 제원·연비',url:'https://www.genesis.com/kr/ko/models/luxury-sedan-genesis/g80/specs.html',observation:'G80 2.5T/3.5T, 2WD/AWD: 자동 8단. 같은 페이지의 다른 차종 표와 구분한다.'},
    'hyundai-ioniq5':{title:'현대 2027 아이오닉 5 제원표',url:'https://www.hyundai.com/contents/repn-car/catalog/spec/ioniq5-27my-spec.pdf',observation:'Standard/Long Range 전기 구동 모델. 내연기관 HUD를 표시하지 않는다.'},
    'hyundai-grandeur':{title:'현대 2027 그랜저 제원표',url:'https://www.hyundai.com/contents/repn-car/catalog/spec/grandeur-27fl-spec.pdf',observation:'가솔린 2.5 2WD, 가솔린 3.5 2WD/AWD: 자동 8단.'},
    'hyundai-santafe':{title:'현대 싼타페 가격·파워트레인',url:'https://www.hyundai.com/kr/ko/e/vehicles/santafe/price',observation:'국내 2.5 터보: 스마트스트림 습식 8단 DCT. 하이브리드 6AT와 구분한다.'},
    'hyundai-staria':{title:'현대 더 뉴 스타리아 라운지 가격',url:'https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/price',observation:'스마트스트림 LPG 3.5: 8단 자동변속기.'},
    'kgm-musso-ev':{title:'KGM 무쏘 EV 2026년 3월 가격·제원',url:'https://www.kg-mobility.com/attached/contents/display/file/200000200010012/20260228234258004_JNYcqu.pdf',observation:'2WD/AWD 전기 구동 모델. 내연기관 HUD를 표시하지 않는다.'},
    'kgm-torres':{title:'KGM 뉴 토레스 공식 출시 설명',url:'https://allways.kg-mobility.com/kgm-%EB%89%B4-%ED%86%A0%EB%A0%88%EC%8A%A4-%EC%B6%9C%EC%8B%9C-%ED%8C%8C%EC%9B%8C%ED%8A%B8%EB%A0%88%EC%9D%B8-%EC%97%85%EA%B7%B8%EB%A0%88%EC%9D%B4%EB%93%9C-%EC%A0%95%ED%86%B5-suv-%EA%B0%90%EC%84%B1/',observation:'2026년 5월 출시 가솔린 1.5 T-GDI: 아이신 8단 자동변속기. 이전 6AT 및 HEV e-DHT와 구분한다.'},
    'hyundai-porter':{title:'현대 포터 II 공식 카탈로그',url:'https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf',observation:'PDF 5/11쪽: LPG 초장축 슈퍼캡 6단 수동 또는 5단 자동. 최고출력 회전수 3800rpm은 레드라인이 아니다.'}
  });
  const ESTIMATED=freeze(['idleRPM','shiftRPM','maxRPM','total1stReduction','ratioStep']);
  const profiles={};
  function add(vehicleId,variantIds,powertrainType,transmissionType,gearCount,sourceId,overrides={}){
    const electric=powertrainType==='electric';
    const label=transmissionType==='IVT'?'IVT':transmissionType==='EV'?'전기 구동':gearCount+transmissionType;
    for(const variantId of variantIds)profiles[variantId]={vehicleId,variantId,powertrainType,visible:!electric,transmissionType,gearCount,transmissionLabel:label,
      idleRPM:electric?0:900,shiftRPM:electric?0:6000,maxRPM:electric?0:7000,total1stReduction:electric?0:13.5,
      ratioStep:electric?null:({4:.66,5:.71,6:.75,8:.81}[gearCount]??null),
      estimatedFields:electric?[]:ESTIMATED,sourceIds:[sourceId],reviewedAt,verifiedFields:['powertrainType','transmissionType',...(gearCount===null?[]:['gearCount'])],...overrides};
  }
  add('ray',['ray-1.0-14','ray-1.0-15'],'gasoline','AT',4,'kia-ray');
  add('ray',['ray-ev'],'electric','EV',null,'kia-ray-ev');
  add('morning',['morning-1.0-14','morning-1.0-16'],'gasoline','AT',4,'kia-morning');
  add('avante',['avante-2.0-16','avante-2.0-18'],'gasoline','IVT',null,'hyundai-avante');
  add('k5',['k5-2.0'],'gasoline','AT',6,'kia-k5');
  add('k5',['k5-1.6t'],'gasoline','AT',8,'kia-k5');
  add('k5',['k5-2.0lpg'],'lpg','AT',6,'kia-k5');
  add('carnival',['carnival-3.5'],'gasoline','AT',8,'kia-carnival');
  add('carnival',['carnival-1.6heV'],'hybrid','AT',6,'kia-carnival');
  add('g80',['g80-2.5t-rwd','g80-2.5t-awd','g80-3.5t-rwd','g80-3.5t-awd'],'gasoline','AT',8,'genesis-g80');
  add('ioniq5',['ioniq5-standard','ioniq5-long-rwd','ioniq5-long-awd'],'electric','EV',null,'hyundai-ioniq5');
  add('grandeur',['grandeur-2.5','grandeur-3.5-fwd','grandeur-3.5-awd'],'gasoline','AT',8,'hyundai-grandeur');
  add('santafe',['santafe-2.5t-fwd','santafe-2.5t-awd'],'gasoline','DCT',8,'hyundai-santafe');
  add('staria',['staria-lpg'],'lpg','AT',8,'hyundai-staria');
  add('musso_ev',['musso-ev-fwd','musso-ev-awd'],'electric','EV',null,'kgm-musso-ev');
  add('torres',['torres-1.5t-fwd','torres-1.5t-awd'],'gasoline','AT',8,'kgm-torres');
  add('porter2',['porter-lpg-mt'],'lpg','MT',6,'hyundai-porter',{shiftRPM:4000,maxRPM:5000});
  add('porter2',['porter-lpg-at'],'lpg','AT',5,'hyundai-porter',{shiftRPM:4000,maxRPM:5000});
  const PROFILES=freeze(profiles);
  // These are the exact baseline configurations in vehicle-specs.js, not the
  // first randomized variant. In particular its Carnival baseline is hybrid.
  const FALLBACKS=freeze({ray:'ray-1.0-15',morning:'morning-1.0-16',avante:'avante-2.0-18',k5:'k5-2.0',carnival:'carnival-1.6heV',
    g80:'g80-2.5t-rwd',ioniq5:'ioniq5-long-rwd',grandeur:'grandeur-2.5',santafe:'santafe-2.5t-fwd',staria:'staria-lpg',musso_ev:'musso-ev-fwd',torres:'torres-1.5t-fwd',porter2:'porter-lpg-at'});
  function unknown(vehicleId,variantId,spec){
    const electric=spec.electric===true||spec.powertrainType==='electric',type=electric?'electric':['hybrid','lpg','gasoline'].includes(spec.powertrainType)?spec.powertrainType:'gasoline';
    return freeze({vehicleId,variantId:variantId||null,powertrainType:type,visible:!electric,transmissionType:electric?'EV':'unknown',gearCount:null,transmissionLabel:electric?'전기 구동':'미확인',
      idleRPM:electric?0:900,shiftRPM:electric?0:6000,maxRPM:electric?0:7000,total1stReduction:electric?0:13.5,ratioStep:null,
      estimatedFields:electric?[]:ESTIMATED,sourceIds:[],reviewedAt:null,verifiedFields:[],match:'unknown'});
  }
  function resolve(car={}){
    if(typeof car==='string')car={vehicleId:car};
    const entrant=car.entrant||null,spec=entrant?.factorySpec||entrant?.spec||car.factorySpec||car.spec||{},vehicleId=entrant?.vehicleId||car.vehicleId||spec.id||null;
    const variantId=entrant?.variantId||car.variantId||null;
    if(variantId){const p=PROFILES[variantId];return p&&p.vehicleId===vehicleId?p:unknown(vehicleId,variantId,spec);}
    // An entrant without its identity is not a baseline car: its inherited
    // spec.variant text may describe another engine/gearbox. Do not guess it.
    if(entrant)return unknown(vehicleId,null,spec);
    if(spec.electric===true||spec.powertrainType==='electric'){
      const electricId=vehicleId==='ray'?'ray-ev':FALLBACKS[vehicleId],p=PROFILES[electricId];
      return p?.powertrainType==='electric'?p:unknown(vehicleId,null,spec);
    }
    return PROFILES[FALLBACKS[vehicleId]]||unknown(vehicleId,null,spec);
  }
  const api=freeze({resolve,PROFILES,FALLBACKS,SOURCES,reviewedAt});
  root.PowertrainProfiles=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
