/* One release identity for the page, coordinator and pure evaluators. */
(function(root){
 'use strict';
 const RELEASE='spin-autoplay-20261029-1';
 const updateMessage='실행 파일의 버전이 다릅니다. 페이지를 새로고침한 뒤 새 실험을 시작해 주세요.';
 function mismatch(){return Object.assign(Error(updateMessage),{code:'runtime-mismatch'});}
 function url(path){const [resource,fragment]=path.split('#');return resource+(resource.includes('?')?'&':'?')+'v='+encodeURIComponent(RELEASE)+(fragment?'#'+fragment:'');}
 function assertRelease(value){if(value!==RELEASE)throw mismatch();}
 function identity(vehicle,track){
  const prepared=root.DriftPreparedGrips||(typeof require==='function'?require('./prepared-grips.js'):null);
  const fitness=root.DriftFitness||(typeof require==='function'?require('./fitness.js'):null);
  if(!prepared||!fitness)throw mismatch();
  return prepared.hash({release:RELEASE,model:prepared.fingerprint(vehicle,track),fitness:fitness.signature()});
 }
 function assertIdentity(actual,expected){if(typeof actual!=='string'||!actual||actual!==expected)throw mismatch();}
 const api=Object.freeze({RELEASE,url,identity,assertRelease,assertIdentity});root.DriftRuntime=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
