/* Prepared vehicle x track references. Decoding never runs vehicle physics. */
(function(root){
  'use strict';
  const Genome=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null);
  if(!Genome)throw Error('Load DriftGenome before DriftPreparedGrips.');
  const SCHEMA=3,KNOTS=Genome.KNOTS,STRIDE=Genome.STRIDE,GENOME_VERSION=Genome.VERSION,records=new Map(),pending=new Map();
  const fields=['time','x','y','z','grade','bank','yaw','vx','vy','r','s','speed','beta','steer','throttle','brake','gear','rpm','torque','rearTorque','ax','ay',
    'targetSlip','lineOffset','counterLead','driveSlipTarget','requestedGear','driverSteerCorrection','driverThrottleCorrection','targetYawRate','pathError','predictedSlip','gearShiftVeto'];
  function stable(value){
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>typeof value[k]!=='undefined').map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  // Cache identity only, not a security or authenticity signature.
  function hash(value){const text=typeof value==='string'?value:stable(value);let a=2166136261,b=5381;for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);a=Math.imul(a^n,16777619);b=Math.imul(b,33)^n;}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
  function key(vehicle,track){return track.id+'/'+vehicle.id;}
  // Engines can differ by one ULP in trigonometric geometry. Normalize only
  // identity inputs; stored controls, results and replay doubles stay exact.
  function identity(value){if(typeof value==='number')return Number(value.toPrecision(12));if(Array.isArray(value))return value.map(identity);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,identity(v)]));return value;}
  function fingerprint(vehicle,track){
    const physics=root.DriftPhysics||(typeof require==='function'?require('./physics.js'):null);
    return hash(identity({schema:SCHEMA,genomeVersion:GENOME_VERSION,stride:STRIDE,knots:KNOTS,vehicleId:vehicle.id,physics:vehicle.physics||vehicle,
      genome:Genome.signature(),model:physics.signature(),track:{id:track.id,length:track.length,width:track.width,judgedStart:track.judgedStart,judgedEnd:track.judgedEnd,
        points:track.points,obstacles:track.obstacles||[],zones:track.zones||[],boundaries:track.boundaries||null,boundaryPolygons:track.boundaryPolygons||[],excludedPolygons:track.excludedPolygons||[],surfaceData:track.surfaceData||null,geometryVersion:track.geometryVersion||null,dataVersion:track.dataVersion||null,geometrySignature:track.geometrySignature||null,
        sample:String(track.sample).replace(/\r\n/g,'\n'),project:String(track.project).replace(/\r\n/g,'\n'),surface:String(track.surface||'').replace(/\r\n/g,'\n'),contains:String(track.contains||'').replace(/\r\n/g,'\n')}}));
  }
  function format(value){return value?.genomeVersion===GENOME_VERSION&&value?.stride===STRIDE&&value?.knots===KNOTS;}
  function register(record){if(!record||record.schema!==SCHEMA||!format(record))throw Error('Unsupported prepared grip record/genome');records.set(record.key,record);}
  function decodeReplay(data,result,vehicle){
    const raw=typeof Buffer!=='undefined'?Uint8Array.from(Buffer.from(data.values,'base64')):Uint8Array.from(atob(data.values),c=>c.charCodeAt(0));
    const stride=fields.length+12;
    if(data.encoding!=='float64-le'||data.stride!==stride||raw.byteLength!==data.count*stride*8||data.count<2)throw Error('Invalid prepared replay');
    const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),p=vehicle.physics||vehicle,L=p.wheelbaseM,front=p.frontWeightFraction||.52,half=(p.trackWidthM||p.widthM*.84)/2;
    let offset=0;const next=()=>{const n=view.getFloat64(offset,true);offset+=8;if(!Number.isFinite(n))throw Error('Invalid prepared replay value');return n;};
    return Array.from({length:data.count},(_,index)=>{
      const frame={};for(const name of fields)frame[name]=next();
      frame.wheelOmega=Array.from({length:4},next);frame.wheelSlip=Array.from({length:4},next);
      frame.wheelForces=Array.from({length:4},(_,i)=>({alpha:next(),x:i<2?L*(1-front):-L*front,y:i%2===0?half:-half}));
      frame.status=index===data.count-1?result.status:'running';frame.reason=index===data.count-1?result.reason:null;return frame;
    });
  }
  function get(vehicle,track){
    const record=records.get(key(vehicle,track));
    if(!record)throw Error('이 차량·트랙의 사전 그립 기록이 없습니다. 오프라인 빌드가 필요합니다.');
    if(record.fingerprint!==fingerprint(vehicle,track))throw Error('사전 그립 기록이 현재 차량·트랙·물리와 다릅니다. 오프라인 재빌드가 필요합니다.');
    if(record.payloadHash!==hash({baseline:record.baseline,replay:record.replay}))throw Error('사전 그립 기록이 손상되었습니다. 오프라인 재빌드가 필요합니다.');
    const source=record.baseline;
    if(!format(source)||!Array.isArray(source.gene)||source.gene.length!==Genome.LENGTH||source.gene.some(n=>!Number.isFinite(n))||source.result?.valid!==true||source.result.status!=='finished')throw Error('Invalid prepared grip baseline');
    const result={...source.result},frames=decodeReplay(record.replay,result,vehicle);result.frames=frames;
    return {...source,gene:Float64Array.from(source.gene),record:frames,result,prepared:true,fingerprint:record.fingerprint};
  }
  function manifest(){return root.DriftPreparedGripsManifest||(typeof require==='function'?require('./prepared-grips-manifest.js'):null);}
  async function load(vehicle,track){
    const id=key(vehicle,track);if(records.has(id))return get(vehicle,track);
    const index=manifest(),entry=index?.entries?.[id];if(!entry)throw Error('이 차량·트랙의 사전 그립 기록이 없습니다. 오프라인 빌드가 필요합니다.');
    if(index.schema!==SCHEMA||!format(index))throw Error('사전 그립 기록 형식이 오래되었습니다. 오프라인 재빌드가 필요합니다.');
    if(entry.fingerprint!==fingerprint(vehicle,track))throw Error('사전 그립 기록이 오래되었습니다. 오프라인 재빌드가 필요합니다.');
    if(!pending.has(id)){
      const task=(async()=>{
        if(typeof module!=='undefined'&&module.exports)register(require('./'+entry.path));
        else if(typeof importScripts==='function')importScripts(entry.path);
        else await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL(entry.path,base).href;script.onload=()=>{script.remove();resolve();};script.onerror=()=>{script.remove();reject(Error('사전 그립 기록 파일을 읽지 못했습니다.'));};document.head.append(script);});
      })();pending.set(id,task);task.catch(()=>pending.delete(id));
    }
    await pending.get(id);return get(vehicle,track);
  }
  const base=root.document?.currentScript?.src||root.location?.href;
  const api={SCHEMA,GENOME_VERSION,STRIDE,KNOTS,fields,key,fingerprint,hash,register,get,load};root.DriftPreparedGrips=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
