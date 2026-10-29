/* Spatial perturbations only. The stored parent, runtime genome sampler and
 * vehicle physics are unchanged. C1 anchor curves are sampled at genome knots. */
(function(root){
 'use strict';
 const G=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null);
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 function window(center,radius,{lower=0,upper=G.KNOTS-1}={}){
  lower=clamp(Math.ceil(lower),0,G.KNOTS-1);upper=clamp(Math.floor(upper),lower,G.KNOTS-1);
  const span=Math.min(upper-lower,Math.max(4,Math.ceil(radius*2)));
  const start=clamp(Math.floor(center-span/2),lower,upper-span);
  return {start,end:start+span};
 }
 function valueAt(anchors,x){
  if(x<=anchors[0].at||x>=anchors.at(-1).at)return 0;
  let i=0;while(i<anchors.length-2&&x>anchors[i+1].at)i++;
  const a=anchors[i],b=anchors[i+1],u=smooth((x-a.at)/(b.at-a.at));
  return a.value+(b.value-a.value)*u;
 }
 function limitsAt(channel,knot,{maxSteerRad=.61,gearCount=8,lineBounds=null}={}){
  const d=G.DESCRIPTORS[channel];
  if(!d||d.discrete)throw new TypeError('Smooth mutation requires a continuous genome channel.');
  if(channel===G.CHANNELS.steer)return {min:-maxSteerRad,max:maxSteerRad};
  if(channel===G.CHANNELS.lineOffset&&lineBounds)return {min:Math.max(d.min,lineBounds[knot].min),max:Math.min(d.max,lineBounds[knot].max)};
  return {min:d.min,max:d.max};
 }
 function add(gene,channel,{start,end,values=[0,1,0],amount=1},limits={}){
  if(!(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&values.length>=3&&values.every(Number.isFinite)&&Number.isFinite(amount)))throw new TypeError('A finite mutation interval and at least three delta anchors are required.');
  const anchors=values.map((value,i)=>({at:start+(end-start)*i/(values.length-1),value:i===0||i===values.length-1?0:value*amount}));
  const deltas=[];let scale=1;
  for(let knot=Math.max(0,Math.ceil(start));knot<=Math.min(G.KNOTS-1,Math.floor(end));knot++){
   const delta=valueAt(anchors,knot);if(Math.abs(delta)<1e-15)continue;
   const j=knot*G.STRIDE+channel,bound=limitsAt(channel,knot,limits);
   scale=Math.min(scale,delta>0?(bound.max-gene[j])/delta:(bound.min-gene[j])/delta);
   deltas.push({j,knot,delta});
  }
  scale=clamp(scale,0,1);
  // One common amplitude preserves the interpolated shape under saturation;
  // independently clipping neighbouring values can leave a single-knot spike.
  if(deltas.length<2||scale<=1e-12)return {changed:0,scale:0,start,end,anchors};
  for(const {j,knot,delta}of deltas){const b=limitsAt(channel,knot,limits);gene[j]=clamp(gene[j]+delta*scale,b.min,b.max);}
  return {changed:deltas.length,scale,start,end,anchors};
 }
 function bump(gene,channel,center,radius,amount,limits={},bounds={}){
  return add(gene,channel,{...window(center,radius,bounds),amount},limits);
 }
 function signature(){return [clamp,smooth,window,valueAt,limitsAt,add,bump].map(String).join('\n');}
 const api=Object.freeze({VERSION:1,window,valueAt,add,bump,signature});root.DriftMutationShape=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
