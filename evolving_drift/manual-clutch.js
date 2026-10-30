/* Finite-capacity dry clutch with an independent engine shaft. The engine-side
 * torque is solved against the same implicit rear-wheel response used by the
 * vehicle integrator. No extra engine power or body/yaw impulse is added.
 * Engine inertia and clutch capacity are MODEL ESTIMATES, not factory data.
 * References: MathWorks, How a Clutch Works; Project Chrono ChShaftsClutch. */
(function(root){
  'use strict';
  const VERSION=1,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const INERTIA_ESTIMATES=Object.freeze({porter2:.45,bmw_m2:.30,gr86:.22});
  function isManual(vehicle){const p=vehicle.physics||vehicle;return !p.electric&&(p.transmissionType||vehicle.profile?.transmissionType)==='MT';}
  function parameters(vehicle){
    const p=vehicle.physics||vehicle;
    return {engineInertiaKgM2:p.engineInertiaKgM2??INERTIA_ESTIMATES[vehicle.vehicleId]??.30,
      clutchCapacityNm:p.clutchCapacityNm??p.peakTorque*1.35,status:'model-estimate'};
  }
  function initialState(vehicle){const p=vehicle.physics||vehicle;return {engineOmega:p.electric?0:(p.idleRPM||800)*Math.PI/30,
    clutchPedal:0,clutchEngagement:isManual(vehicle)?1:0,clutchTorque:0,clutchSlipRPM:0,clutchSlipEnergyJ:0,
    clutchLocked:0,clutchCapacityNm:0,clutchLaunchAssist:0};}
  function wheelTorque(torque,ratio,efficiency){const e=clamp(efficiency,.05,1);return torque*ratio*(torque>=0?e:1/e);}
  function solve({engineOmega,engineTorque,engineInertiaKgM2,capacityNm,gearRatio,dt,wheelResponse}){
    if(![engineOmega,engineTorque,engineInertiaKgM2,capacityNm,gearRatio,dt].every(Number.isFinite)||engineInertiaKgM2<=0||capacityNm<0||gearRatio<=0||dt<=0)throw new RangeError('Invalid clutch integration inputs');
    const freeOmega=Math.max(0,engineOmega+dt*engineTorque/engineInertiaKgM2);
    const evaluate=torque=>{const wheels=wheelResponse(torque),omega=Math.max(0,freeOmega-dt*torque/engineInertiaKgM2);return {torque,engineOmega:omega,wheels,slip:omega-wheels.shaftOmega*gearRatio};};
    if(capacityNm===0)return {...evaluate(0),locked:false};
    // Do not extract more forward angular momentum than the engine contains.
    let lo=-capacityNm,hi=Math.min(capacityNm,freeOmega*engineInertiaKgM2/dt),left=evaluate(lo),right=evaluate(hi);
    if(left.slip<=0)return {...left,locked:false};
    if(right.slip>=0)return {...right,locked:false};
    let chosen=null;
    // Bracketed secant: smooth locked cases normally converge in 2–5 passes;
    // bounded fallback handles tyre saturation and brake sticking transitions.
    for(let i=0;i<28;i++){
      const span=hi-lo,secant=(lo*right.slip-hi*left.slip)/(right.slip-left.slip);
      const torque=i%5===4?(lo+hi)/2:clamp(secant,lo+span*.02,hi-span*.02);
      chosen=evaluate(torque);
      if(Math.abs(chosen.slip)<1e-8||span<1e-7)break;
      if(chosen.slip>0){lo=torque;left=chosen;}else{hi=torque;right=chosen;}
    }
    return {...chosen,locked:Math.abs(chosen.slip)<1e-5};
  }
  function signature(){return JSON.stringify({VERSION,INERTIA_ESTIMATES,functions:[clamp,isManual,parameters,initialState,wheelTorque,solve].map(fn=>String(fn).replace(/\r\n/g,'\n'))});}
  const api=Object.freeze({VERSION,isManual,parameters,initialState,wheelTorque,solve,signature});
  root.DriftManualClutch=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
