/* Estimated circuit thermal / wear model, not manufacturer calibration.
 * Mechanical wheel work is supplied by the race engine after force limits.
 * Friction brakes receive friction work only; tyres carry all wheel forces,
 * including regenerative braking. Battery round-trip efficiency is < 1.
 * The heat capacities, cooling, thresholds, HEV capacities and wear constants
 * below are gameplay assumptions. Factory specifications are never mutated. */
(function(root){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const finite=(x,fallback=0)=>Number.isFinite(x)?x:fallback;
  const positive=x=>Math.max(0,finite(x));
  const G=9.81,PS_W=735.49875;
  const MODEL=Object.freeze({
    version:'estimated-v1',ambientC:20,initialTireC:45,initialBrakeC:70,
    initialEngineC:90,initialMotorC:45,initialBatteryC:25,
    dischargeEfficiency:.92,regenEfficiency:.78,engineChargeEfficiency:.80,hybridChargeTargetSoc:.60,hybridGeneratorMaxW:8000,
    tireHeatCapacityJK:6500,tireWearRate:.000045,
    brakeFrontCapacityJK:10000,brakeRearCapacityJK:8000,
    frictionEnergyForFullWearJ:2e9,
    motorHeatCapacityJK:40000,batteryHeatCapacityPerKwhJK:6000,
    engineHeatCapacityJK:110000,
    engineFadeStartC:115,engineFadeEndC:140,
    motorFadeStartC:100,motorFadeEndC:145,
    batteryFadeStartC:45,batteryFadeEndC:60,
    estimatedHybridCapacityKwh:1.5
  });
  const heatFactor=(temperature,start,end,min=.45)=>1-clamp((temperature-start)/(end-start),0,1)*(1-min);
  function specFor(car){return car.spec||car.entrant?.spec||car;}
  function create(car,options={}){
    const spec=specFor(car),kind=spec.electric||spec.powertrainType==='electric'?'electric':spec.powertrainType==='hybrid'?'hybrid':'combustion';
    const ambientC=finite(options.ambientC,MODEL.ambientC),levels=car.entrant?.levels||car.levels||{};
    const massKg=positive(car.massKg||spec.massKg||spec.curbMassKg)||1500;
    const batteryCapacityKwh=kind==='electric'?positive(spec.batteryKwh)||60:kind==='hybrid'?positive(spec.batteryKwh)||MODEL.estimatedHybridCapacityKwh:null;
    const ratedW=positive(car.powerPs||spec.powerPs)*PS_W;
    const factory=car.entrant?.factorySpec||spec;
    const systemScale=positive(factory.powerPs)?ratedW/(factory.powerPs*PS_W):1;
    const engineShare=kind==='hybrid'?clamp(positive(factory.enginePowerPs)?factory.enginePowerPs/Math.max(1,factory.powerPs):.75,.35,.95):kind==='combustion'?1:0;
    const motorRatedW=kind==='electric'?ratedW:kind==='hybrid'?positive(factory.motorPowerKw)*1000*systemScale||ratedW*.25:0;
    const axle=(temperatureC)=>({temperatureC,wear:0});
    return {
      model:MODEL.version,kind,ambientC,elapsedSeconds:0,massKg,
      levels:{grip:clamp(finite(levels.grip),0,8),brakes:clamp(finite(levels.brakes),0,8)},
      tireCapacityJK:MODEL.tireHeatCapacityJK,
      ratedW,motorRatedW,engineShare,batteryCapacityKwh,
      soc:kind==='combustion'?null:clamp(finite(options.initialSoc,kind==='hybrid'?.6:.8),0,1),
      tires:{front:axle(finite(options.initialTireC,MODEL.initialTireC)),rear:axle(finite(options.initialTireC,MODEL.initialTireC))},
      brakes:{front:axle(finite(options.initialBrakeC,MODEL.initialBrakeC)),rear:axle(finite(options.initialBrakeC,MODEL.initialBrakeC))},
      engineTemperatureC:kind==='electric'?null:finite(options.initialEngineC,MODEL.initialEngineC),
      motorTemperatureC:kind==='combustion'?null:finite(options.initialMotorC,MODEL.initialMotorC),
      batteryTemperatureC:kind==='combustion'?null:finite(options.initialBatteryC,MODEL.initialBatteryC),
      power:{driveW:0,regenW:0,frictionBrakeW:0,batteryDischargeW:0,batteryChargeW:0,engineMechanicalW:0,engineGeneratorW:0,engineChargeW:0},
      energy:{driveJ:0,regenMechanicalJ:0,frictionBrakeJ:0,batteryDischargeJ:0,batteryChargeJ:0,engineMechanicalJ:0,engineGeneratorJ:0,engineChargeJ:0}
    };
  }
  function tireFactor(axle){
    // Initially warm tyres are neutral. Cold and overheated states are separate
    // from irreversible tread wear; cooling never repairs wear.
    const cold=.94+.06*clamp((axle.temperatureC-10)/30,0,1);
    const hot=heatFactor(axle.temperatureC,95,145,.65);
    const worn=1-.30*clamp(axle.wear,0,1);
    return cold*hot*worn;
  }
  function limits(car,state){
    if(!state)return {gripFrontFactor:1,gripRearFactor:1,brakeFactor:1,powerFactor:1,regenPowerW:0,batteryAssistPowerW:0};
    const brakeTemp=Math.max(state.brakes.front.temperatureC,state.brakes.rear.temperatureC);
    const brakeWear=Math.max(state.brakes.front.wear,state.brakes.rear.wear);
    const brakeFactor=heatFactor(brakeTemp,500+state.levels.brakes*12,850+state.levels.brakes*12,.42)*(1-.15*brakeWear);
    const engine=state.kind==='electric'?0:heatFactor(state.engineTemperatureC,MODEL.engineFadeStartC,MODEL.engineFadeEndC,.6);
    const motor=state.kind==='combustion'?0:heatFactor(state.motorTemperatureC,MODEL.motorFadeStartC,MODEL.motorFadeEndC,.4);
    const hot=state.kind==='combustion'?0:heatFactor(state.batteryTemperatureC,MODEL.batteryFadeStartC,MODEL.batteryFadeEndC,.3);
    const cold=state.kind==='combustion'?0:clamp((state.batteryTemperatureC+10)/25,.15,1);
    const discharge=state.kind==='combustion'?0:clamp((state.soc-.03)/.12,0,1);
    const electricFactor=Math.min(motor,hot*cold,discharge);
    const powerFactor=state.kind==='electric'?electricFactor:state.kind==='hybrid'?state.engineShare*engine+(1-state.engineShare)*electricFactor:engine;
    const chargeSoc=state.kind==='combustion'?0:clamp((.98-state.soc)/.12,0,1);
    const chargeCold=state.kind==='combustion'?0:clamp((state.batteryTemperatureC+5)/25,0,1);
    // Regen is bounded by motor and battery charge power, before efficiency.
    // No warm-up or cold-start SOC promise is inferred from these estimates.
    const chargeC=state.kind==='hybrid'?12:1.4;
    const regenPowerW=state.kind==='combustion'?0:Math.min(state.motorRatedW*.55,state.batteryCapacityKwh*1000*chargeC)*Math.min(motor,hot)*chargeSoc*chargeCold;
    return {gripFrontFactor:tireFactor(state.tires.front),gripRearFactor:tireFactor(state.tires.rear),brakeFactor,powerFactor:clamp(powerFactor,0,1),regenPowerW,batteryAssistPowerW:state.motorRatedW*electricFactor};
  }
  function cooledTemperature(old,heatW,conductanceWPerK,capacityJK,ambientC,dt){
    // Exact linear cooling integration gives dt-batching-independent cooling.
    const decay=Math.exp(-conductanceWPerK*dt/capacityJK);
    const equilibrium=ambientC+heatW/conductanceWPerK;
    return Math.max(ambientC,equilibrium+(old-equilibrium)*decay);
  }
  function update(car,state,dt,input={}){
    if(!state||!Number.isFinite(dt)||dt<0)throw new RangeError('condition dt must be finite and nonnegative');
    if(dt===0)return state.power;
    const spec=specFor(car),speed=positive(input.speedMps),mass=state.massKg;
    const driveW=positive(input.drivePowerW),requestedRegenW=positive(input.regenPowerW),frictionW=positive(input.frictionBrakePowerW);
    const before=limits(car,state);
    const remainingJ=state.batteryCapacityKwh?Math.max(0,(1-state.soc)*state.batteryCapacityKwh*3.6e6):0;
    const storedJ=state.batteryCapacityKwh?Math.max(0,state.soc*state.batteryCapacityKwh*3.6e6):0;
    const regenW=Math.min(requestedRegenW,before.regenPowerW,remainingJ/(dt*MODEL.regenEfficiency));
    const electricShare=state.kind==='electric'?1:state.kind==='hybrid'?1-state.engineShare:0;
    const engineAvailableW=state.kind==='electric'?0:state.ratedW*state.engineShare*heatFactor(state.engineTemperatureC,MODEL.engineFadeStartC,MODEL.engineFadeEndC,.6);
    // A simple estimated HEV supervisory policy. At low load the engine can
    // provide wheel work plus bounded generator work. It never charges from
    // unaccounted energy, during wheel braking, or while already at high load.
    const engineChargeMode=state.kind==='hybrid'&&state.soc<=MODEL.hybridChargeTargetSoc&&driveW<engineAvailableW*.60&&regenW===0&&frictionW===0;
    const batteryMechanicalW=engineChargeMode?0:Math.min(driveW*electricShare,before.batteryAssistPowerW,storedJ*MODEL.dischargeEfficiency/dt);
    const engineWheelW=state.kind==='electric'?0:Math.max(0,driveW-batteryMechanicalW);
    const chargeTaper=state.kind==='hybrid'?clamp((MODEL.hybridChargeTargetSoc-state.soc)/.10,0,1):0;
    const generatorW=engineChargeMode?Math.min(MODEL.hybridGeneratorMaxW,state.ratedW*.045,Math.max(0,engineAvailableW-engineWheelW),remainingJ/(dt*MODEL.engineChargeEfficiency))*chargeTaper:0;
    const engineChargeW=generatorW*MODEL.engineChargeEfficiency;
    const dischargeW=batteryMechanicalW/MODEL.dischargeEfficiency,regenChargeW=regenW*MODEL.regenEfficiency,chargeW=regenChargeW+engineChargeW;
    if(state.batteryCapacityKwh)state.soc=clamp(state.soc+(chargeW-dischargeW)*dt/(state.batteryCapacityKwh*3.6e6),0,1);
    state.power={driveW,regenW,frictionBrakeW:frictionW,batteryDischargeW:dischargeW,batteryChargeW:chargeW,engineMechanicalW:engineWheelW+generatorW,engineGeneratorW:generatorW,engineChargeW};
    state.energy.driveJ+=driveW*dt;state.energy.regenMechanicalJ+=regenW*dt;state.energy.frictionBrakeJ+=frictionW*dt;
    state.energy.batteryDischargeJ+=dischargeW*dt;state.energy.batteryChargeJ+=chargeW*dt;
    state.energy.engineMechanicalJ+=(engineWheelW+generatorW)*dt;state.energy.engineGeneratorJ+=generatorW*dt;state.energy.engineChargeJ+=engineChargeW*dt;
    const frontFraction=clamp(finite(car.frontWeightFraction,spec.frontWeightFraction??.55),.2,.8);
    const lateralForce=mass*Math.abs(finite(input.lateralAcceleration));
    const grip=Math.max(.3,finite(spec.gripG,1)),mu=grip;
    const upgradeDurability=1+.13*state.levels.grip;
    for(const [name,share] of [['front',frontFraction],['rear',1-frontFraction]]){
      const tire=state.tires[name],suppliedLoad=input[name+'NormalLoad'];
      const normal=Number.isFinite(suppliedLoad)?Math.max(0,suppliedLoad):mass*G*share;
      const longitudinal=normal>0?Math.abs(finite(input[name+'LongitudinalForceN'])):0;
      const lateral=normal>0?lateralForce*share:0;
      const utilization=Math.min(2,Math.hypot(longitudinal,lateral)/Math.max(100,normal*mu));
      const marking=String(spec[name==='front'?'frontTire':'rearTire']||'215/50R17');
      const width=Math.max(135,Number(marking.match(/^([0-9]+)/)?.[1])||215);
      const tyresPerAxle=clamp(Math.round(finite(spec.tireFitment?.[name]?.tiresPerAxle,2)),1,8);
      const contactScale=tyresPerAxle/2;
      const loadRatio=normal/(tyresPerAxle*4500*(width/215));
      const slip=clamp(positive(input[name+'SlipRatio']),0,2);
      const scrubW=speed*(longitudinal*.018+lateral*.022)*utilization*utilization+speed*normal*.0015+slip*longitudinal*speed*.06;
      tire.temperatureC=cooledTemperature(tire.temperatureC,scrubW,(10+1.2*speed)*contactScale,state.tireCapacityJK*(width/215)*contactScale,state.ambientC,dt);
      const heatWear=1+Math.max(0,tire.temperatureC-95)/35;
      tire.wear=clamp(tire.wear+MODEL.tireWearRate*dt*Math.pow(utilization,2.5)*Math.max(.3,loadRatio)*heatWear*(1+slip*2)/upgradeDurability,0,1);
    }
    const brakeUpgrade=1+.12*state.levels.brakes;
    const brakeFront=clamp(finite(input.brakeFrontFraction,.65),0,1);
    for(const [name,share,capacity] of [['front',brakeFront,MODEL.brakeFrontCapacityJK],['rear',1-brakeFront,MODEL.brakeRearCapacityJK]]){
      const axle=state.brakes[name];
      axle.temperatureC=cooledTemperature(axle.temperatureC,frictionW*share,(12+1.3*speed)*(1+.09*state.levels.brakes),capacity*brakeUpgrade,state.ambientC,dt);
      axle.wear=clamp(axle.wear+frictionW*share*dt/(MODEL.frictionEnergyForFullWearJ*(1+.15*state.levels.brakes)),0,1);
    }
    if(state.kind!=='combustion'){
      // Regen also heats the electrical path; it does not move friction-brake
      // heat into tyre wear. Cooling power is a bounded model estimate.
      const electricalLossW=Math.max(0,dischargeW-batteryMechanicalW)+Math.max(0,regenW-regenChargeW)+Math.max(0,generatorW-engineChargeW);
      // The same conversion loss must not be counted as heat in both paths.
      // The split is estimated; motor/inverter + battery heat equals the
      // battery-to-wheel / wheel-to-battery energy lost in this step.
      const motorHeatW=electricalLossW*.65;
      state.motorTemperatureC=cooledTemperature(state.motorTemperatureC,motorHeatW,65+2*speed,MODEL.motorHeatCapacityJK,state.ambientC,dt);
      const capacity=state.batteryCapacityKwh;
      const batteryHeatW=electricalLossW*.35;
      const cooling=state.kind==='hybrid'?18+speed*.35:75+speed*.6;
      state.batteryTemperatureC=cooledTemperature(state.batteryTemperatureC,batteryHeatW,cooling,Math.max(15000,capacity*MODEL.batteryHeatCapacityPerKwhJK),state.ambientC,dt);
    }
    if(state.kind!=='electric'){
      const engineWorkW=engineWheelW+generatorW;
      state.engineTemperatureC=cooledTemperature(state.engineTemperatureC,engineWorkW*.35,100+10*speed,MODEL.engineHeatCapacityJK,state.ambientC,dt);
    }
    state.elapsedSeconds+=dt;
    return state.power;
  }
  function stop(state){
    if(state)state.power={driveW:0,regenW:0,frictionBrakeW:0,batteryDischargeW:0,batteryChargeW:0,engineMechanicalW:0,engineGeneratorW:0,engineChargeW:0};
    return state;
  }
  function snapshot(state){
    if(!state)return null;
    const fake={spec:{},massKg:state.massKg},l=limits(fake,state);
    const axle=(a,factor)=>({temperatureC:a.temperatureC,wear:a.wear,remaining:1-a.wear,...(factor===undefined?{}:{gripFactor:factor})});
    const reasons=[];
    if(l.gripFrontFactor<.95||l.gripRearFactor<.95)reasons.push('타이어 온도·마모로 접지 제한');
    if(l.brakeFactor<.98)reasons.push('브레이크 과열·마모로 제동력 제한');
    if(l.powerFactor<.98)reasons.push(state.soc!==null&&state.soc<.15?'배터리 잔량으로 출력 제한':'구동계 온도로 출력 제한');
    if(state.kind!=='combustion'&&state.soc>.9)reasons.push('배터리 충전 여유로 회생 제한');
    return {model:state.model,kind:state.kind,elapsedSeconds:state.elapsedSeconds,
      tires:{front:axle(state.tires.front,l.gripFrontFactor),rear:axle(state.tires.rear,l.gripRearFactor)},
      brakes:{front:axle(state.brakes.front),rear:axle(state.brakes.rear),factor:l.brakeFactor},
      powertrain:{engineTemperatureC:state.engineTemperatureC,motorTemperatureC:state.motorTemperatureC,batteryTemperatureC:state.batteryTemperatureC,soc:state.soc,batteryCapacityKwh:state.batteryCapacityKwh,powerFactor:l.powerFactor,regenLimitW:l.regenPowerW,batteryAssistLimitW:l.batteryAssistPowerW},
      power:{...state.power},energy:{...state.energy},limitations:reasons};
  }
  const api=Object.freeze({MODEL,create,limits,update,stop,snapshot});root.VehicleCondition=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
