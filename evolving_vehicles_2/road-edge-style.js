/* Display materials only. Distances use the canonical road centreline, never
 * a car's shorter racing-line distance. Missing metadata retains legacy curbs. */
(function(root){
  'use strict';
  const STYLES=new Set(['curb','asphalt','white-line','grass']);
  const mod=(v,n)=>((v%n)+n)%n;
  function compile(metadata,length){
    const validLength=Number.isFinite(length)&&length>0;
    const fallback=STYLES.has(metadata?.defaultRoadEdge)?metadata.defaultRoadEdge:'curb';
    const colors=metadata?.roadCurbColors;
    const curbColors=Array.isArray(colors)&&colors.length===2&&colors.every(c=>/^#[0-9a-f]{6}$/i.test(c))?Object.freeze(colors.slice()):null;
    const color=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:null;
    const roadSurfaceColor=color(metadata?.roadSurfaceColor),defaultGroundColor=color(metadata?.defaultGroundColor);
    const block=metadata?.roadCurbBlockLengthM,splitCurbBlocks=Number.isFinite(block)&&block>=.8&&block<=8;
    const curbBlockLengthM=splitCurbBlocks?block:8;
    const intervals=[];
    if(validLength)for(const rule of Array.isArray(metadata?.roadEdges)?metadata.roadEdges:[]){
      // An observed interval must identify its evidence. Invalid/uncited rows
      // cannot replace existing road paint. Later valid rows take precedence.
      if(!rule||!Number.isFinite(rule.startM)||!Number.isFinite(rule.endM)||rule.startM===rule.endM||
        !['left','right','both'].includes(rule.side)||!STYLES.has(rule.style)||
        typeof rule.sourceId!=='string'||!rule.sourceId.trim()||typeof rule.evidence!=='string'||!rule.evidence.trim())continue;
      intervals.push({start:mod(rule.startM,length),end:mod(rule.endM,length),full:Math.abs(rule.endM-rule.startM)>=length,side:rule.side,style:rule.style});
    }
    return Object.freeze({curbColors,roadSurfaceColor,defaultGroundColor,curbBlockLengthM,splitCurbBlocks,styleAt(s,side){
      if(!validLength||!Number.isFinite(s)||!['left','right'].includes(side))return fallback;
      const position=mod(s,length);
      for(let i=intervals.length-1;i>=0;i--){const r=intervals[i];if(r.side!==side&&r.side!=='both')continue;
        if(r.full||(r.start<r.end?position>=r.start&&position<r.end:position>=r.start||position<r.end))return r.style;
      }
      return fallback;
    }});
  }
  const api={compile};root.RoadEdgeStyle=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
