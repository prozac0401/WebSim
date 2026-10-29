/* Evidence changes where/how we search. Only completed, valid genomes may
 * supply controls; a failure contributes observations, never inheritance. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const REPAIR_FAMILIES=Object.freeze(['entry-speed','timing','lead','steer','line','power','angle','combined']);
class Policy {
 constructor(zones,{enabled=true,scale=1}={}){
  this.enabled=enabled;this.baseScale=scale;this.generation=0;this.observations=0;this.failuresAnalyzed=0;this.guidedProposals=0;this.explorationProposals=0;this.focusProposals=0;
  this.zones=zones.map(()=>({trials:0,valid:0,improved:0,scale:1,families:{},hints:[]}));
 }
 choose(rng,families,{weakestArcs=[]}={}){
  if(!this.enabled||!this.zones.length)return null;
  // A fixed exploration share prevents noisy early diagnoses from taking over.
  const explore=rng()<.25;
  let arc=Math.floor(rng()*this.zones.length),repair=null,focus=false;
  const weakest=[...new Set(weakestArcs)].filter(i=>Number.isInteger(i)&&this.zones[i]);
  if(explore)this.explorationProposals++;
  else if(weakest.length&&rng()<.35){arc=weakest[Math.floor(rng()*weakest.length)];focus=true;this.focusProposals++;}
  else {
   const hinted=this.zones.map((z,i)=>({z,i})).filter(x=>x.z.hints.length);
   if(hinted.length&&rng()<.55){
    const selected=hinted[Math.floor(rng()*hinted.length)];arc=selected.i;
    repair=selected.z.hints[Math.floor(rng()*selected.z.hints.length)];this.guidedProposals++;
   }
  }
  const zone=this.zones[arc];
  const scale=clamp(this.baseScale*(explore?1:zone.scale),.03,1.5);
  if(repair){
   const allowed=repair.recommendedFamilies.filter(f=>REPAIR_FAMILIES.includes(f));
   const candidates=allowed.length?allowed:['lead','line','timing'];
   return {arc,scale,explore,focus,repair,family:this._family(zone,candidates,rng)};
  }
  return {arc,scale,explore,focus,repair:null,family:explore?undefined:this._family(zone,families,rng)};
 }
 _family(zone,families,rng){
  const weights=families.map(f=>{
   const cell=zone.families[f];if(!cell)return 1;
   // Smoothed valid-run/improvement reward; a floor keeps every family viable.
   return .2+2*(cell.reward+1)/(cell.trials+2)+.4/Math.sqrt(cell.trials+1);
  });
  let roll=rng()*weights.reduce((a,b)=>a+b,0);
  for(let i=0;i<weights.length;i++){roll-=weights[i];if(roll<=0)return families[i];}
  return families.at(-1);
 }
 observe(entry,{improved=false}={}){
  if(!this.enabled)return;this.observations++;
  const zone=this.zones[entry.arcIndex];
  if(zone){
   const valid=entry.accepted===true&&entry.result?.valid===true&&entry.result?.status==='finished';
   zone.trials++;if(valid)zone.valid++;if(valid&&improved)zone.improved++;
   const family=entry.mutation?.family||entry.kind||'unknown',cell=zone.families[family]||(zone.families[family]={trials:0,reward:0});
   cell.trials++;cell.reward+=valid?(improved?1:.2):0;
  }
  const diagnosis=entry.result?.failureAnalysis,index=diagnosis?.precedingZoneIndex??diagnosis?.origin?.zoneIndex,target=this.zones[index];
  if(entry.accepted||!target||!diagnosis?.window||!Number.isFinite(diagnosis.origin?.s)||diagnosis.kind==='unknown')return;
  this.failuresAnalyzed++;
  const hint={candidateId:entry.id,generation:this.generation,kind:diagnosis.kind,origin:{...diagnosis.origin},precedingZoneIndex:diagnosis.precedingZoneIndex,window:{...diagnosis.window},speedPreparation:diagnosis.speedPreparation?{...diagnosis.speedPreparation}:undefined,recommendedFamilies:[...(diagnosis.recommendedFamilies||[])]};
  // Do not let thousands of copies of one late failure drown out earlier hints.
  const previous=target.hints.findIndex(h=>h.kind===hint.kind&&Math.abs(h.origin.s-hint.origin.s)<8);
  if(previous>=0)target.hints.splice(previous,1);
  target.hints.push(hint);if(target.hints.length>4)target.hints.shift();
 }
 finishGeneration(entries){
  if(!this.enabled)return;
  this.generation++;for(const zone of this.zones)zone.hints=zone.hints.filter(h=>this.generation-h.generation<=6);
  for(let arc=0;arc<this.zones.length;arc++){
   const trials=entries.filter(e=>e.arcIndex===arc);if(!trials.length)continue;
   const rate=trials.filter(e=>e.accepted).length/trials.length,zone=this.zones[arc];
   zone.scale=clamp(zone.scale*(rate===0?.65:rate<.25?.8:rate>.6?1.06:1),.12,1.5);
  }
 }
 snapshot(){return {enabled:this.enabled,observations:this.observations,failuresAnalyzed:this.failuresAnalyzed,guidedProposals:this.guidedProposals,explorationProposals:this.explorationProposals,focusProposals:this.focusProposals,zones:this.zones.map((z,zoneIndex)=>({zoneIndex,trials:z.trials,valid:z.valid,improved:z.improved,scale:clamp(z.scale*this.baseScale,.03,1.5),lastOriginS:z.hints.at(-1)?.origin.s??null}))};}
}
const api=Object.freeze({VERSION:1,REPAIR_FAMILIES,Policy});root.DriftEvolutionLearning=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis==='undefined'?window:globalThis);
