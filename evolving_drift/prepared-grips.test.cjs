'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Catalog=require('./catalog.js'),Tracks=require('./track.js'),Genome=require('./genome.js'),Driver=require('./driver.js'),Physics=require('./physics.js'),Evolution=require('./evolution.js'),Prepared=require('./prepared-grips.js'),Build=require('./build-grips.cjs');
const manifest=require('./prepared-grips-manifest.js');
const vehicles=Catalog.list(),tracks=Tracks.list({includeDevelopment:true});
const entriesFor=pairs=>Object.fromEntries(pairs.map(p=>[p.key,{fingerprint:p.fingerprint,builder:p.builder}]));
const format={genomeVersion:Genome.VERSION,stride:Genome.STRIDE,knots:Genome.KNOTS};

test('the matrix covers all sixteen vehicles for every public course and explicit fixture',()=>{
  assert.ok(tracks.some(t=>t.id==='kr-kic-t21-kdl-2016-r2'));assert.ok(tracks.some(t=>t.id===Tracks.DEVELOPMENT_ID));assert.equal(vehicles.length,16);
  const publicTracks=Tracks.list(),plan=Build.plan(vehicles,publicTracks,{},'test');
  assert.ok(publicTracks.every(t=>t.verifiedCompetition===true));assert.equal(plan.length,vehicles.length*publicTracks.length);
  assert.equal(Build.plan(vehicles,tracks,{},'test').length,vehicles.length*tracks.length);
  assert.ok(publicTracks.every(t=>t.kind!=='development'));
  assert.ok(plan.every(p=>p.track.kind!=='development'));
});

test('height-field logic, boundary geometry and version changes invalidate prepared records',()=>{
  const vehicle=vehicles[0],track=tracks[0],original=Prepared.fingerprint(vehicle,track);
  for(const patch of [{geometrySignature:track.geometrySignature+' changed helper'}, {dataVersion:track.dataVersion+1}, {boundaryPolygons:[[{x:0,y:0},{x:1,y:0},{x:0,y:1}]]}, {excludedPolygons:[[{x:0,y:0},{x:1,y:0},{x:0,y:1}]]}, {surface:()=>({z:1,gradientX:0,gradientY:0,normalZ:1,muScale:1})}, {contains:()=>false}])assert.notEqual(Prepared.fingerprint(vehicle,{...track,...patch}),original);
});

test('schema 4 preserves behavioral genome and driver telemetry and rejects legacy records',()=>{
  const vehicle={...vehicles[0],id:'replay-schema-test'},track=tracks[0];
  const a=Physics.frame(Physics.initialState(vehicle,track)),b={...a,time:1,z:123.5,grade:.08,bank:-.04};
  for(const [i,key] of Driver.TELEMETRY.entries())b[key]=(i+1)/10;b.gearShiftVeto=1;
  const gene=Genome.create();gene[Genome.CHANNELS.lineOffset]=1.2;gene[Genome.CHANNELS.gearHold]=2;
  const baseline={...format,gene:Array.from(gene),result:{status:'finished',valid:true,time:1,score:0}},replay=Build.encodeReplay([a,b]);
  const record={schema:Prepared.SCHEMA,...format,key:Prepared.key(vehicle,track),fingerprint:Prepared.fingerprint(vehicle,track),baseline,replay};
  record.payloadHash=Prepared.hash({baseline,replay});Prepared.register(record);
  const decoded=Prepared.get(vehicle,track);assert.equal(Prepared.SCHEMA,4);assert.equal(replay.stride,Prepared.fields.length+12);assert.equal(replay.stride,60);
  assert.deepEqual(decoded.gene,gene);assert.equal(decoded.genomeVersion,3);assert.equal(decoded.stride,11);
  for(const key of ['z','grade','bank',...Driver.TELEMETRY,'gearShiftVeto'])assert.equal(decoded.record[1][key],b[key],key);
  for(const patch of [{schema:1},{schema:2},{genomeVersion:1},{stride:3},{knots:64}])assert.throws(()=>Prepared.register({...record,...patch}),/Unsupported/);
  for(const patch of [{gene:Array(384).fill(0)},{genomeVersion:1},{stride:3}]){
    const bad={...record,baseline:{...baseline,...patch}};bad.payloadHash=Prepared.hash({baseline:bad.baseline,replay});Prepared.register(bad);
    assert.throws(()=>Prepared.get(vehicle,track),/Invalid prepared grip baseline/);
  }
  Prepared.register(record);
});
test('adding a vehicle or track schedules the complete new row or column only',()=>{
  const existing=entriesFor(Build.plan(vehicles,tracks,{},'builder-v1'));
  assert.equal(Build.plan(vehicles,tracks,existing,'builder-v1').filter(p=>p.stale).length,0);
  const extraVehicle={...vehicles[0],id:'additional-rwd'},extraTrack={...tracks[0],id:'additional-track'};
  const row=Build.plan([...vehicles,extraVehicle],tracks,existing,'builder-v1').filter(p=>p.stale);
  assert.equal(row.length,tracks.length);assert.ok(row.every(p=>p.vehicle.id===extraVehicle.id));
  const column=Build.plan(vehicles,[...tracks,extraTrack],existing,'builder-v1').filter(p=>p.stale);
  assert.equal(column.length,vehicles.length);assert.ok(column.every(p=>p.track.id===extraTrack.id));
  const both=Build.plan([...vehicles,extraVehicle],[...tracks,extraTrack],existing,'builder-v1').filter(p=>p.stale);
  assert.equal(both.length,vehicles.length+tracks.length+1);
});
test('a changed vehicle, track, search algorithm, or physics invalidates affected references',()=>{
  const courses=[...tracks,{...tracks[0],id:'test-track-2'}],existing=entriesFor(Build.plan(vehicles,courses,{},'v1'));
  const changed=[{...vehicles[0],physics:{...vehicles[0].physics,massKg:vehicles[0].physics.massKg+1}},...vehicles.slice(1)];
  assert.equal(Build.plan(changed,courses,existing,'v1').filter(p=>p.stale).length,courses.length);
  assert.equal(Build.plan(vehicles,[{...courses[0],width:courses[0].width+.1},...courses.slice(1)],existing,'v1').filter(p=>p.stale).length,vehicles.length);
  assert.equal(Build.plan(vehicles,courses,existing,'v2').filter(p=>p.stale).length,vehicles.length*courses.length);
  const original=Physics.signature;try{Physics.signature=()=>original()+' changed';assert.ok(Build.plan(vehicles,courses,existing,'v1').every(p=>p.stale));}finally{Physics.signature=original;}
  const driverSignature=Driver.signature;try{Driver.signature=()=>driverSignature()+' changed';assert.ok(Build.plan(vehicles,courses,existing,'v1').every(p=>p.stale));}finally{Driver.signature=driverSignature;}
});
test('every public and explicit development vehicle/track pair has a fresh checked-in baseline',()=>{
  const plan=Build.plan(vehicles,tracks,manifest.entries);
  assert.equal(manifest.schema,Prepared.SCHEMA);for(const [key,value] of Object.entries(format))assert.equal(manifest[key],value);
  assert.equal(plan.length,vehicles.length*tracks.length);assert.ok(plan.every(p=>!p.stale));
  assert.deepEqual(Object.keys(manifest.entries).sort(),plan.map(p=>p.key).sort());
  for(const entry of Object.values(manifest.entries))assert.ok(fs.existsSync(require('node:path').join(__dirname,entry.path)));
});
test('harmless cross-engine trigonometric rounding does not invalidate a reference',()=>{
  const t=tracks[0],points=t.points.map(p=>({...p,curvature:p.curvature*(1+Number.EPSILON)}));
  assert.equal(Prepared.fingerprint(vehicles[0],t),Prepared.fingerprint(vehicles[0],{...t,points}));
  assert.notEqual(Prepared.fingerprint(vehicles[0],t),Prepared.fingerprint(vehicles[0],{...t,width:t.width+.001}));
});
test('loading and resetting all prepared records perform no simulation or grip search',async()=>{
  const original={step:Physics.step,evaluateGene:Physics.evaluateGene,buildGripBaseline:Physics.buildGripBaseline};
  for(const key of Object.keys(original))Physics[key]=()=>{throw Error('Unexpected runtime simulation: '+key);};
  try{for(const t of tracks)for(const v of vehicles){
    const a=await Prepared.load(v,t),b=await Prepared.load(v,t);
    const engine=new Evolution.Engine(v,t,{baseline:a,physics:Physics});
    assert.equal(engine.initialize().ready,true,v.id+' '+t.id+': '+engine.blockedReason);
    assert.deepEqual(engine.best.gene,a.gene,'initialization preserves the prepared controls');
    assert.equal(engine.best.result.styleScore,a.result.score,'startup ranking preserves the saved physical style score');
    assert.equal(engine.best.result.power.success,false,'a neutral grip reference is not a completed powered-exit objective');
    if(t.verifiedCompetition)assert.ok(engine.snapshot().poweredExitRegions>0,v.id+' / '+t.id+' enables the same powered-exit evolution strategy');
    assert.equal(a.prepared,true);assert.equal(a.result.valid,true);assert.equal(a.gene.length,Genome.LENGTH);
    for(const [key,value] of Object.entries(format))assert.equal(a[key],value);
    for(let i=0;i<Genome.KNOTS;i++){
      for(const name of ['targetSlip','driveSlip','gearHold'])assert.equal(a.gene[i*Genome.STRIDE+Genome.CHANNELS[name]],0);
      assert.equal(a.gene[i*Genome.STRIDE+Genome.CHANNELS.counterLead],.25);
    }
    assert.equal(a.record.length,a.result.frames.length);assert.ok(a.record.length>100);
    assert.equal(a.record.at(-1).time,a.result.time);assert.equal(a.record.at(-1).status,'finished');
    assert.ok(a.record.every(frame=>Prepared.fields.every(k=>Number.isFinite(frame[k]))));
    assert.deepEqual(a.gene,b.gene);assert.notEqual(a.gene,b.gene);assert.notEqual(a.record,b.record);
    a.gene[0]+=1;a.record[0].x+=100;assert.notEqual(a.gene[0],b.gene[0]);assert.notEqual(a.record[0].x,b.record[0].x);
  }}finally{Object.assign(Physics,original);}
});
test('prepared controls reproduce their saved results with current physics',async()=>{
  for(const t of tracks)for(const v of vehicles){const baseline=await Prepared.load(v,t),run=Physics.evaluateGene(v,t,baseline.gene,{record:false});
    assert.equal(run.status,'finished');assert.ok(run.maxAngle<7);assert.ok(run.peakWheelSlip<.32);
    for(const key of ['time','score','maxAngle','driftDistance','peakWheelSlip'])assert.equal(run[key],baseline.result[key],v.id+' '+key);
  }
});
test('missing, stale, and corrupted records fail rather than calculating a replacement',async()=>{
  const v=vehicles[0],t=tracks[0];await Prepared.load(v,t);
  await assert.rejects(Prepared.load({...v,id:'missing-rwd'},t),/사전 그립 기록이 없습니다/);
  assert.throws(()=>Prepared.get({...v,physics:{...v.physics,massKg:v.physics.massKg+1}},t),/현재 차량/);
  const saved=require('./'+manifest.entries[Prepared.key(v,t)].path),bad=JSON.parse(JSON.stringify(saved));bad.baseline.gene[0]+=.1;
  try{Prepared.register(bad);assert.throws(()=>Prepared.get(v,t),/손상/);}finally{Prepared.register(saved);}
});
test('the browser physics API has no baseline search entry point',()=>{
  const context=vm.createContext({});context.window=context;
  for(const file of ['genome.js','driver.js','manual-clutch.js','physics.js'])vm.runInContext(fs.readFileSync(require.resolve('./'+file),'utf8'),context);
  assert.equal(typeof context.window.DriftPhysics.buildGripBaseline,'undefined');
  assert.equal(context.window.DriftPhysics.signature(),Physics.signature());
});

test('offline reference revalidation requires an actual identical replay and preserves the genome',()=>{
  const pair=Build.plan([vehicles[0]],[tracks[0]],{},'unchanged-search')[0],source=require('./'+manifest.entries[pair.key].path);
  const asset=structuredClone({...source,builder:pair.builder,fingerprint:'previous-physics'});
  const original=Physics.evaluateGene;let calls=0;
  // Decode only: supply the current identity to the runtime loader, then make
  // the mocked evaluator return those saved doubles. This tests the migration
  // gate separately from the real 96-pair replay audit.
  Prepared.register({...asset,fingerprint:pair.fingerprint});const decoded=Prepared.get(pair.vehicle,pair.track);
  try{
    Physics.evaluateGene=(vehicle,track,gene,options)=>{calls++;assert.equal(vehicle,pair.vehicle);assert.equal(track,pair.track);assert.deepEqual(gene,decoded.gene);assert.equal(options.record,true);return structuredClone(decoded.result);};
    const checked=Build.revalidateArtifact(pair,asset);assert.equal(checked.ok,true);assert.equal(calls,1);
    assert.equal(checked.artifact.fingerprint,pair.fingerprint);assert.deepEqual(checked.artifact.baseline.gene,source.baseline.gene);
    assert.deepEqual(checked.artifact.replay,source.replay);assert.deepEqual(checked.artifact.baseline.result,source.baseline.result);
    assert.equal(checked.artifact.baseline.referenceValidation.previousFingerprint,'previous-physics');
    assert.equal(checked.artifact.baseline.referenceValidation.searchRepeated,false);
    assert.equal(checked.artifact.payloadHash,Prepared.hash({baseline:checked.artifact.baseline,replay:checked.artifact.replay}));
    for(const field of ['status','time','maxAngle']){
      Physics.evaluateGene=()=>({...structuredClone(decoded.result),[field]:field==='status'?'offtrack':decoded.result[field]+.01});
      assert.equal(Build.revalidateArtifact(pair,asset).ok,false,field);
    }
    Physics.evaluateGene=()=>{const result=structuredClone(decoded.result);result.frames[1].x+=1e-10;return result;};
    assert.equal(Build.revalidateArtifact(pair,asset).reason,'recorded trajectory or telemetry changed');
    Physics.evaluateGene=()=>{throw Error('Must reject invalid source before evaluating');};
    for(const patch of [{builder:'changed-search'},{key:'wrong-pair'},{schema:2},{payloadHash:'corrupt'}])assert.equal(Build.revalidateArtifact(pair,{...asset,...patch}).ok,false);
    assert.throws(()=>Build.build({check:true,revalidateExisting:true}),/cannot be combined/);
    assert.throws(()=>Build.build({all:true,revalidateExisting:true}),/cannot be combined/);
  }finally{Physics.evaluateGene=original;Prepared.register(source);}
});
