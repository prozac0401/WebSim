/* Exact simulation-prefix reuse for one fixed vehicle/course/runtime. Only
 * completed runs evaluated here can supply state; prepared replay is not state. */
(function(root){
 'use strict';
 const G=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null);
 const D=root.DriftDriver||(typeof require==='function'?require('./driver.js'):null);
 const P=root.DriftPhysics||(typeof require==='function'?require('./physics.js'):null);
 const VERSION=1,MAX_LOOK=16;
 function firstInfluence(parent,child,length){
  const ds=length/(G.KNOTS-1);let first=Infinity;
  for(let i=0;i<G.LENGTH;i++){
   if(Object.is(parent[i],child[i]))continue;
   const knot=Math.floor(i/G.STRIDE),channel=i%G.STRIDE;
   // Continuous values start changing in the preceding interpolation span.
   // Gear selection uses the nearest knot. Driver.reference also reads the
   // line at s +/- 1 and s + clamp(5 + speed*.48, 6, 16).
   const start=(knot-(channel===G.CHANNELS.gearHold ? .5 : 1))*ds-(channel===G.CHANNELS.lineOffset?MAX_LOOK:0);
   first=Math.min(first,start);
  }
  return first===Infinity?first:first-Math.max(1,length)*Number.EPSILON*16;
 }
 const copyFrames=frames=>frames.map(frame=>P.frame(frame));
 function metadata(simulatedTicks,reusedTicks){return {simulatedTicks,reusedTicks,totalTicks:simulatedTicks+reusedTicks,cacheHit:reusedTicks>0};}
 class Evaluator{
  #entries=[];
  #frameCount=0;
  constructor(vehicle,track,{identity=null,maxEntries=4,maxFrames=10000,enabled=true}={}){
   if(!vehicle||!track||!Number.isFinite(track.length)||track.length<=0)throw new TypeError('A fixed vehicle and course are required.');
   if(!Number.isInteger(maxEntries)||maxEntries<0||!Number.isInteger(maxFrames)||maxFrames<0)throw new RangeError('Cache limits must be nonnegative integers.');
   this.vehicle=vehicle;this.track=track;this.identity=identity;this.maxEntries=maxEntries;this.maxFrames=maxFrames;this.enabled=enabled;
  }
  cachedIds(){return this.#entries.map(entry=>entry.id).filter(id=>typeof id==='string');}
  #remember(id,gene,result,totalTicks){
   if(!this.enabled||!this.maxEntries||result.valid!==true||result.status!=='finished'||result.frames.length>this.maxFrames)return;
   const duplicate=this.#entries.findIndex(entry=>firstInfluence(entry.gene,gene,this.track.length)===Infinity);
   if(duplicate>=0){const [old]=this.#entries.splice(duplicate,1);this.#frameCount-=old.result.frames.length;}
   const stored={...result,frames:copyFrames(result.frames)};delete stored.evaluation;
   this.#entries.push({id,gene:G.clone(gene),result:stored,totalTicks});this.#frameCount+=stored.frames.length;
   while(this.#entries.length>this.maxEntries||this.#frameCount>this.maxFrames)this.#frameCount-=this.#entries.shift().result.frames.length;
  }
  evaluate(gene,{id=null,parentId=null}={}){
   // Compare the actual final gene: normalization and steering/line coupling
   // can alter knots earlier than a mutation's nominal target window.
   gene=G.clone(gene);let chosen=null,reusedTicks=0,index=0;
   if(this.enabled)for(const entry of this.#entries){
    const limit=firstInfluence(entry.gene,gene,this.track.length),frames=entry.result.frames;
    if(limit===Infinity){chosen=entry;reusedTicks=entry.totalTicks;index=frames.length-1;break;}
    let low=0,high=frames.length-1;
    while(low<high){const mid=Math.ceil((low+high)/2);if(frames[mid].status==='running'&&frames[mid].s<limit)low=mid;else high=mid-1;}
    const ticks=frames[low].status==='running'&&frames[low].s<limit?low*2:0;
    if(ticks>reusedTicks||ticks>0&&ticks===reusedTicks&&entry.id===parentId){chosen=entry;reusedTicks=ticks;index=low;}
   }
   let result;
   if(chosen&&index===chosen.result.frames.length-1&&chosen.result.status==='finished'){
    result={...chosen.result,frames:copyFrames(chosen.result.frames),evaluation:metadata(0,reusedTicks)};
   }else{
    const a=chosen?{...P.frame(chosen.result.frames[index]),vehicle:this.vehicle}:P.initialState(this.vehicle,this.track);
    const frames=chosen?copyFrames(chosen.result.frames.slice(0,index+1)):[P.frame(a)];let ticks=reusedTicks;
    while(a.status==='running'){
     P.step(this.vehicle,this.track,a,D.command(this.vehicle,this.track,a,gene));
     if(++ticks%2===0||a.status!=='running')frames.push(P.frame(a));
    }
    result={...P.result(a,frames,this.track),evaluation:metadata(ticks-reusedTicks,reusedTicks)};
   }
   // Never retain failed trajectories, even if their earlier states were valid.
   this.#remember(id,gene,result,result.evaluation.totalTicks);return result;
  }
 }
 const api=Object.freeze({VERSION,MAX_LOOK,firstInfluence,Evaluator});root.DriftEvaluationCache=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
