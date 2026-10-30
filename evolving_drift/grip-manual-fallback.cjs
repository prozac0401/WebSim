/* Offline fallback only: repair measured rear-wheel brake locking through
 * earlier throttle lift and gentler brake release. Stock physics, tyre limits,
 * course boundaries and grip acceptance are unchanged. Never runs at startup. */
'use strict';
const P=require('./physics.js'),G=require('./genome.js');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ramp=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
function lockingWindow(record){
  const candidates=record.filter(f=>f.speed>4&&f.wheelSlip?.length===4&&Math.min(...f.wheelSlip.slice(2))<-.28);
  if(!candidates.length)return null;
  const worst=candidates.reduce((a,b)=>Math.min(...a.wheelSlip.slice(2))<Math.min(...b.wheelSlip.slice(2))?a:b);
  const approach=record.filter(f=>f.s>=worst.s-90&&f.s<=worst.s),approachSpeed=Math.max(worst.speed,...approach.map(f=>f.speed));
  const lead=clamp(approachSpeed*4.5,35,90),radius=clamp(worst.speed*2.7,14,28);
  return {sourceS:worst.s,sourceTime:worst.time,sourceRearSlip:Math.min(...worst.wheelSlip.slice(2)),approachSpeed,
    liftStart:Math.max(0,worst.s-lead),liftEnd:worst.s-2,liftRampIn:lead*.30,liftRampOut:lead*.225,
    brakeStart:Math.max(0,worst.s-radius),brakeEnd:worst.s+radius*.9,brakeRamp:radius*.6};
}
function controls(gene,track,window,brakeScale,liftScale){
  const result=G.clone(gene),ds=track.length/(G.KNOTS-1),C=G.CHANNELS;
  for(let i=0;i<G.KNOTS;i++){
    const s=i*ds,j=i*G.STRIDE,b=ramp((s-window.brakeStart)/window.brakeRamp)*ramp((window.brakeEnd-s)/window.brakeRamp),lift=ramp((s-window.liftStart)/window.liftRampIn)*ramp((window.liftEnd-s)/window.liftRampOut);
    result[j+C.brake]*=1-(1-brakeScale)*b;result[j+C.throttle]*=1-(1-liftScale)*lift;
    // Prepared grip must not acquire an intentional clutch kick.
    result[j+C.clutchKick]=0;result[j+C.disengageSec]=.12;result[j+C.reengageSec]=.08;
  }
  return result;
}
function repairGrip(vehicle,track,candidates,{maxEvaluations=24}={}){
  const p=vehicle.physics||vehicle;if(p.transmissionType!=='MT')return null;
  const seeds=candidates.filter(c=>c?.result?.valid&&c.result.status==='finished'&&c.result.maxAngle<7&&Array.isArray(c.result.frames)&&c.gene?.length===G.LENGTH)
    .sort((a,b)=>a.result.maxAngle-b.result.maxAngle||a.result.time-b.result.time).slice(0,4);
  const attempts=[];let best=null,evaluated=0;
  for(const seed of seeds){
    const window=lockingWindow(seed.result.frames);if(!window)continue;
    for(const brakeScale of [.85,.70,.50])for(const liftScale of [.80,.60]){
      if(evaluated>=maxEvaluations)break;
      const gene=controls(seed.gene,track,window,brakeScale,liftScale),result=P.evaluateGene(vehicle,track,gene);evaluated++;
      const grip=result.valid&&result.status==='finished'&&result.maxAngle<7&&result.peakWheelSlip<.32;
      const metadata={...seed.metadata,method:'measured-rear-lock-pedal-repair',stage:'fallback-genome-replay',brakeScale,liftScale,window,
        status:result.status,time:result.time,maxAngle:result.maxAngle,peakWheelSlip:result.peakWheelSlip,grip};attempts.push(metadata);
      if(grip&&(!best||result.time<best.result.time))best={genomeVersion:G.VERSION,stride:G.STRIDE,knots:G.KNOTS,gene,record:result.frames,result,
        lineId:seed.metadata?.lineId||'inherited-reference',line:{id:seed.metadata?.lineId||'inherited-reference',pathLength:seed.metadata?.pathLength||track.length,closed:false},
        aggression:seed.metadata?.aggression??null,brakingScale:seed.metadata?.brakingScale??null,feedforwardFit:seed.metadata?.feedforwardFit||'inherited',
        fallback:{method:metadata.method,seedTime:seed.result.time,seedMaxAngle:seed.result.maxAngle,seedPeakWheelSlip:seed.result.peakWheelSlip,brakeScale,liftScale,window,
          changes:['throttle','brake'],physicsUnchanged:true,gripCriteriaUnchanged:true},
        description:'기존 오프라인 그립 후보의 실제 후륜 잠김을 측정해 이른 가속 해제·완만한 제동으로 수정한 유효 재생 중 최단 기록 · 제한된 탐색 근사'};
    }
    if(best||evaluated>=maxEvaluations)break;
  }
  if(best)best.attempts=attempts;
  return best;
}
module.exports={repairGrip,lockingWindow,controls};
