/* Versioned driver genome. Values express driver intent, never a vehicle pose.
 * Legacy three-channel records can be converted only by the offline builder. */
(function(root) {
  'use strict';
  const VERSION=3,STRIDE=11,KNOTS=128,LENGTH=STRIDE*KNOTS,DEG=Math.PI/180;
  const CHANNELS=Object.freeze({steer:0,throttle:1,brake:2,lineOffset:3,targetSlip:4,counterLead:5,driveSlip:6,gearHold:7,clutchKick:8,disengageSec:9,reengageSec:10});
  const DESCRIPTORS=Object.freeze([
    ['steer','기본 조향','rad',-.61,.61,0,false],
    ['throttle','가속','ratio',0,1,0,false],
    ['brake','제동','ratio',0,1,0,false],
    // Serialization guard only; actual experiments use corridorBounds below.
    ['lineOffset','목표 횡위치','m',-1000,1000,0,false],
    ['targetSlip','목표 슬립각','rad',-55*DEG,55*DEG,0,false],
    ['counterLead','역조향 선행시간','s',.05,.8,.25,false],
    ['driveSlip','목표 구동 슬립','ratio',0,1.5,0,false],
    ['gearHold','유지 기어','gear',0,8,0,true],
    // An enabled knot is a distance-triggered event. Its two durations run
    // on elapsed simulation time, so a stopped car cannot hold it open forever.
    ['clutchKick','클러치 킥 시작','event',0,1,0,true],
    ['disengageSec','클러치 분리 시간','s',.04,.45,.12,false],
    ['reengageSec','클러치 재결합 시간','s',.03,.30,.08,false]
  ].map(([key,label,unit,min,max,defaultValue,discrete],index)=>Object.freeze({key,index,label,unit,min,max,defaultValue,discrete})));
  const schemaError=()=>new TypeError('Drift genome v3 requires 128 × 11 = 1408 values; older records must be rebuilt offline.');
  function shape(gene){if(!gene||gene.length!==LENGTH)throw schemaError();}
  function clone(gene){shape(gene);const copy=Float64Array.from(gene);if(!copy.every(Number.isFinite))throw new TypeError('Genome v3 values must be finite.');return copy;}
  function create(){const gene=new Float64Array(LENGTH);for(let i=0;i<KNOTS;i++)for(const d of DESCRIPTORS)gene[i*STRIDE+d.index]=d.defaultValue;return gene;}
  function corridorBounds(vehicle,track){
    const raw=vehicle?.physics||vehicle||{},lengthM=raw.lengthM||4.5,widthM=raw.widthM||1.8,clearance=.15;
    const shapeVehicle={physics:{...raw,lengthM:lengthM+2*clearance,widthM:widthM+2*clearance}};
    const physics=root.DriftPhysics||(typeof require==='function'?require('./physics.js'):null);
    const bounds=[];
    for(let i=0;i<KNOTS;i++){
      const s=i/(KNOTS-1)*track.length,q=track.sample(s),left=q.widthLeft??(track.width||14)/2,right=q.widthRight??(track.width||14)/2;
      if(![q.x,q.y,q.heading].every(Number.isFinite)||typeof track.project!=='function'||!physics?.failure){
        bounds.push(Object.freeze({min:-Math.max(0,right-widthM/2-clearance),max:Math.max(0,left-widthM/2-clearance)}));continue;
      }
      const nx=-Math.sin(q.heading),ny=Math.cos(q.heading),pose=offset=>({x:q.x+nx*offset,y:q.y+ny*offset,yaw:q.heading,s});
      const origin=pose(0);
      if(physics.failure(shapeVehicle,track,origin)){bounds.push(Object.freeze({min:0,max:0}));continue;}
      let low=-right,high=left;
      if(track.boundaryPolygons?.length){
        // Polygon aprons can be wider than the representative road width.
        // Searching stops at the FIRST invalid swept footprint, so islands
        // and disconnected paved areas cannot be crossed by an offset jump.
        const lateral=track.boundaryPolygons.flat().map(p=>(p.x-q.x)*nx+(p.y-q.y)*ny);
        low=Math.min(0,...lateral);high=Math.max(0,...lateral);
      }
      function edge(sign,limit){
        let valid=0;const maximum=Math.min(1000,Math.max(0,limit));
        while(valid<maximum){
          const next=Math.min(maximum,valid+.5);
          if(physics.failure(shapeVehicle,track,pose(sign*next),pose(sign*valid))){
            let a=valid,b=next;for(let j=0;j<10;j++){const mid=(a+b)/2;if(physics.failure(shapeVehicle,track,pose(sign*mid),pose(sign*valid)))b=mid;else a=mid;}
            return sign*a;
          }
          valid=next;
        }
        return sign*valid;
      }
      bounds.push(Object.freeze({min:edge(-1,-low),max:edge(1,high)}));
    }
    return Object.freeze(bounds);
  }
  function normalize(gene,{maxSteerRad=.61,gearCount=8,lineBounds=null,manualClutch=true}={}){
    if(!Number.isFinite(maxSteerRad)||maxSteerRad<=0)throw new RangeError('maxSteerRad must be positive.');
    if(!Number.isInteger(gearCount)||gearCount<1)throw new RangeError('gearCount must be a positive integer.');
    if(lineBounds&&(!Array.isArray(lineBounds)||lineBounds.length!==KNOTS||lineBounds.some(b=>!Number.isFinite(b?.min)||!Number.isFinite(b?.max)||b.min>b.max)))throw new RangeError('lineBounds must contain 128 finite min/max corridors.');
    const copy=clone(gene);
    for(let i=0;i<LENGTH;i++){
      const d=DESCRIPTORS[i%STRIDE],line=d.key==='lineOffset'&&lineBounds?lineBounds[Math.floor(i/STRIDE)]:null;
      const min=d.key==='steer'?-maxSteerRad:line?Math.max(d.min,line.min):d.min,max=d.key==='steer'?maxSteerRad:d.key==='gearHold'?gearCount:line?Math.min(d.max,line.max):d.max;
      const value=Math.max(min,Math.min(max,copy[i]));copy[i]=!manualClutch&&d.index>=CHANNELS.clutchKick?d.defaultValue:d.discrete?Math.round(value):value;
    }
    return copy;
  }
  function sample(gene,s,length){
    shape(gene);
    if(!Number.isFinite(s)||!Number.isFinite(length)||length<=0)throw new RangeError('Genome sampling needs finite progress and positive course length.');
    const t=Math.max(0,Math.min(KNOTS-1,s/length*(KNOTS-1))),a=Math.floor(t),b=Math.min(KNOTS-1,a+1),u=t-a,result={};
    for(const d of DESCRIPTORS){
      const value=d.discrete?Math.round(gene[Math.round(t)*STRIDE+d.index]):gene[a*STRIDE+d.index]+(gene[b*STRIDE+d.index]-gene[a*STRIDE+d.index])*u;
      if(!Number.isFinite(value))throw new TypeError('Genome v3 values must be finite.');result[d.key]=value;
    }
    return result;
  }
  function fromLegacy(legacy,options={}){
    if(!legacy||legacy.length<6||legacy.length%3||!Array.from(legacy).every(Number.isFinite))throw new TypeError('Offline conversion requires finite [steer, throttle, brake] knots.');
    const gene=create(),n=legacy.length/3;
    for(let i=0;i<KNOTS;i++){const t=i/(KNOTS-1)*(n-1),a=Math.floor(t),b=Math.min(n-1,a+1),u=t-a;for(let c=0;c<3;c++)gene[i*STRIDE+c]=legacy[a*3+c]+(legacy[b*3+c]-legacy[a*3+c])*u;}
    return normalize(gene,options);
  }
  // Stored-reference identity includes sampling and normalization semantics,
  // so a code change cannot silently reuse an incompatible offline trajectory.
  function signature(){return JSON.stringify({version:VERSION,stride:STRIDE,knots:KNOTS,channels:DESCRIPTORS.map(({key,min,max,defaultValue,discrete})=>({key,min,max,defaultValue,discrete})),functions:[shape,clone,create,corridorBounds,normalize,sample].map(fn=>String(fn).replace(/\r\n/g,'\n'))});}
  const api=Object.freeze({VERSION,STRIDE,KNOTS,LENGTH,CHANNELS,DESCRIPTORS,descriptors:DESCRIPTORS,create,clone,corridorBounds,normalize,sample,fromLegacy,signature});
  root.DriftGenome=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
