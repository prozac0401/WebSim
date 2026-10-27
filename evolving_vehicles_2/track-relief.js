/* Optional, source-backed off-road elevation grid. The physics track is never
 * changed. CircuitTerrain protects every road footprint before applying delta. */
(function(root){
 'use strict';
 function compile(data,displayHeight=value=>value,track){
  const grid=data?.metadata?.terrainReliefGrid,sources=new Set((data?.sources||[]).map(s=>s.id));
  if(!grid)return null;
  const {minX,minY,spacingM,columns,rows,heightsAMSL}=grid;
  if(!sources.has(grid.sourceId)||!grid.evidence||typeof displayHeight!=='function'||
    !Number.isFinite(minX+minY+spacingM)||spacingM<10||spacingM>200||
    !Number.isInteger(columns)||!Number.isInteger(rows)||columns<3||rows<3||columns*rows>10000||
    !Array.isArray(heightsAMSL)||heightsAMSL.length!==columns*rows||
    !heightsAMSL.every(v=>Number.isFinite(v)&&v>=-500&&v<=10000))return null;
  const values=heightsAMSL.map(displayHeight);if(!values.every(Number.isFinite))return null;
  const bounds={minX,minY,maxX:minX+(columns-1)*spacingM,maxY:minY+(rows-1)*spacingM};
  bounds.width=bounds.maxX-minX;bounds.height=bounds.maxY-minY;
  const loop=Array.isArray(track?.points)?track.points:[];
  function inside(x,y){let yes=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){
   const a=loop[i],b=loop[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes;
  }return yes;}
  function sample(x,y){
   if(!Number.isFinite(x+y))return null;
   // Clamp only the far render envelope; the source grid remains unmodified.
   const u=Math.max(0,Math.min(columns-1,(x-minX)/spacingM)),v=Math.max(0,Math.min(rows-1,(y-minY)/spacingM));
   const i=Math.min(columns-2,Math.floor(u)),j=Math.min(rows-2,Math.floor(v)),a=u-i,b=v-j;
   return values[j*columns+i]*(1-a)*(1-b)+values[j*columns+i+1]*a*(1-b)+values[(j+1)*columns+i]*(1-a)*b+values[(j+1)*columns+i+1]*a*b;
  }
  return {bounds,grid,sourceId:grid.sourceId,sample,delta(x,y,baseZ){
   if(!Number.isFinite(baseZ))throw new TypeError('Relief base height must be finite.');
   if(grid.outsideTrackOnly&&loop.length>=3&&inside(x,y))return 0;
   const z=sample(x,y);return z===null?0:z-baseZ;
  }};
 }
 const api={compile};root.TrackRelief=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
