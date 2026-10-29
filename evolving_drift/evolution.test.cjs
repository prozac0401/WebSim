'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./genome.js'),E=require('./evolution.js'),C=G.CHANNELS;
const Strategies=require('./evolution-strategies.js');
function controls(){const gene=G.create();for(let i=0;i<G.KNOTS;i++){gene[i*G.STRIDE]=Math.sin(i/G.KNOTS*Math.PI*2)*.08;gene[i*G.STRIDE+1]=.4;gene[i*G.STRIDE+2]=.15;}return gene;}
function score(gene){let sum=0;for(let i=0;i<G.KNOTS;i++)sum+=gene[i*G.STRIDE+1]-gene[i*G.STRIDE+2]+Math.abs(gene[i*G.STRIDE+C.targetSlip])*5+gene[i*G.STRIDE+C.driveSlip]*6;return 10+sum/G.KNOTS;}
const complete=gene=>({status:'finished',valid:true,score:score(gene),time:30,progress:600,maxAngle:.2,driftDistance:20,frames:[]});
const factory={id:'fixed-rwd',massKg:1400,powerPs:300,physics:{maxSteer:.52,gearRatios:[3,2,1.4,1,.8,.7]},tire:{grip:1.1}};
const curve=sign=>({id:'curve-'+sign,length:600,sample:s=>({curvature:s>=200&&s<=340?sign*.02:0})});
const track=curve(1);
function fixture(evaluateGene=(_v,_t,gene)=>complete(gene),extra={}){
  const gene=controls(),baseline={genomeVersion:2,gene,result:complete(gene),record:[{x:0,y:0}]};
  const physics={evaluateGene,buildGripBaseline(){throw Error('Runtime cannot build baselines.');}};
  return{baseline,physics,engine:new E.Engine(factory,track,{seed:37,populationSize:20,baseline,physics,rankResult:(_vehicle,_track,result)=>result,...extra})};
}

test('v2 has eight bounded channels and leaves the source untouched',()=>{
  assert.equal(G.VERSION,2);assert.equal(G.KNOTS,128);assert.equal(G.STRIDE,8);assert.equal(G.LENGTH,1024);
  const gene=G.create();assert.equal(gene[C.counterLead],.25);assert.equal(gene[C.lineOffset],0);
  for(let i=0;i<G.LENGTH;i++)gene[i]=i<G.STRIDE?2000:-2000;
  const before=gene.slice(),normalized=G.normalize(gene,{maxSteerRad:.4,gearCount:6});
  assert.deepEqual(gene,before);
  assert.deepEqual(Array.from(normalized.slice(0,8)),[.4,1,1,1000,55*Math.PI/180,.8,1.5,6]);
  assert.deepEqual(Array.from(normalized.slice(8,16)),[-.4,0,0,-1000,-55*Math.PI/180,.05,0,0]);
  assert.equal(G.normalize(G.create().fill(2.7),{gearCount:6})[C.gearHold],3);
  assert.throws(()=>G.clone(new Float64Array(384)),/v2.*1024.*offline/);
  assert.throws(()=>G.normalize(G.create().fill(NaN)),/finite/);
  assert.equal(G.signature(),G.signature());
});

function strategyFixture(sign=1){
  const vehicle={physics:{massKg:1500,wheelbaseM:2.6,lengthM:4.5,widthM:1.8,maxSteer:.6,gearRatios:[4,2.7,1.8,1.3,1,.8],finalDrive:3.5,tireRadius:.34,shiftRPM:6500}};
  const track={length:220,width:30,judgedStart:60,judgedEnd:180,sample:s=>{
    const arc=clampTest(s-80,0,40),h=sign*.02*arc,after=Math.max(0,s-120);
    return {s,x:s<80?s:80+Math.sin(.02*arc)/.02+after*Math.cos(h),y:s<80?0:sign*(1-Math.cos(.02*arc))/.02+after*Math.sin(h),heading:h,curvature:s>=80&&s<=120?sign*.02:0};
  }};
  const record=Array.from({length:45},(_,i)=>{const p=track.sample(i*5);return {...p,time:i/3,speed:15,vx:15*Math.cos(p.heading),vy:15*Math.sin(p.heading),yaw:p.heading,beta:0};});
  const gene=G.create();for(let i=0;i<128;i++){gene[i*8+C.throttle]=.4;gene[i*8+C.brake]=.3;}
  return {vehicle,track,record,gene};
}
const clampTest=(v,a,b)=>Math.max(a,Math.min(b,v));

test('entry strategies mirror outside line and slip intent, and sanitize short exits before generation',()=>{
  const right=strategyFixture(-1),left=strategyFixture(1),before=right.gene.slice();
  const zone=sign=>[{start:100,exit:118,end:156,sign,turn:sign*.36}];
  for(let seed=1;seed<=12;seed++){
    const a=Strategies.entry(right.vehicle,right.track,{gene:right.gene,record:right.record},E.createRng(seed),0,null,{zones:zone(-1)});
    const b=Strategies.entry(left.vehicle,left.track,{gene:left.gene,record:left.record},E.createRng(seed),0,null,{zones:zone(1)});
    assert.ok(a.params.onset<=110,'initiation precedes the end of an 18m corner');
    assert.ok(a.params.length<=33&&a.params.length>=25,'38m exits cannot generate a hold longer than available space');
    assert.equal(a.params.onset,b.params.onset);
    for(let i=0;i<128;i++){
      assert.ok(Math.abs(a.gene[i*8+C.lineOffset]+b.gene[i*8+C.lineOffset])<1e-12);
      assert.ok(Math.abs(a.gene[i*8+C.targetSlip]+b.gene[i*8+C.targetSlip])<1e-12);
      assert.ok(Math.abs(a.gene[i*8+C.steer]+b.gene[i*8+C.steer])<1e-12,'steering residuals reflect with the turn');
    }
  }
  assert.deepEqual(right.gene,before);
});

test('feedforward coupling preserves identity and supplies the changed path demand to the actual driver',()=>{
  const {vehicle}=strategyFixture(),track={length:220,sample:s=>({s,x:s,y:0,heading:0,curvature:0})},gene=G.create();
  const record=[{s:0,speed:15},{s:220,speed:15}];
  assert.deepEqual(Strategies.couple(vehicle,track,gene,gene,record),gene);
  const changed=G.clone(gene);for(let i=0;i<128;i++)changed[i*8+C.lineOffset]=.5*Math.sin(i/127*Math.PI);
  const coupled=Strategies.couple(vehicle,track,gene,changed,record),s=75,look=12.2;
  const point=x=>({x,y:G.sample(coupled,x,track.length).lineOffset}),here=point(s),ahead=point(s+look),before=point(s-1),after=point(s+1);
  const tangent=Math.atan2(after.y-before.y,after.x-before.x),distance=Math.hypot(ahead.x-here.x,ahead.y-here.y),curvature=2*Math.sin(Math.atan2(ahead.y-here.y,ahead.x-here.x)-tangent)/distance;
  const command=require('./driver.js').command(vehicle,track,{...here,s,yaw:tangent,vx:15*Math.cos(tangent),vy:15*Math.sin(tangent),r:15*curvature,ax:0,ay:0},coupled);
  assert.ok(Math.abs(command.steer-G.sample(coupled,s,track.length).steer)<1e-12,'on the new path the driver preserves its corrected feedforward');
  assert.ok(Math.abs(command.steer)>1e-5,'a curved line requires steering even on a straight road');
  assert.ok(gene.every((v,i)=>v===(i%8===C.counterLead ? .25 : 0)));
});

test('clipped EV gear mutations still produce a different bounded candidate',()=>{
  const f=strategyFixture(),p=f.vehicle.physics;p.electric=true;p.gearRatios=[8];p.shiftRPM=0;
  for(let i=0;i<128;i++)f.gene[i*8+C.gearHold]=1;
  const z=Strategies.zones(f.track)[0],parent={gene:f.gene,result:{frames:f.record},metric:{bestExit:{zoneExit:z.exit,end:z.exit+10}}};
  let calls=0;const rng=()=>++calls===3?(Strategies.FAMILIES.indexOf('gear')+.5)/Strategies.FAMILIES.length:.5;
  const proposal=Strategies.adaptive(f.vehicle,f.track,parent,rng);
  assert.equal(proposal.change.family,'fine-fallback');assert.notDeepEqual(proposal.gene,f.gene);
  assert.deepEqual(G.normalize(proposal.gene,{maxSteerRad:p.maxSteer,gearCount:1}),proposal.gene);
  assert.equal(Strategies.supports(f.vehicle,f.track,f.record),true);
  assert.equal(Strategies.supports(f.vehicle,f.track,f.record.map(({vx,...rest})=>rest)),false);
});

test('mutation scale changes inherited entry parameters and adaptive control amplitudes',()=>{
  const f=strategyFixture(-1),zones=Strategies.zones(f.track),prepared={gene:f.gene,record:f.record};
  const original=Strategies.entry(f.vehicle,f.track,prepared,E.createRng(3),0,null,{zones}).params;
  let strictlySmaller=false;
  for(let seed=1;seed<=12;seed++){
    const large=Strategies.entry(f.vehicle,f.track,prepared,E.createRng(seed),0,original,{zones,scale:1}).params;
    const small=Strategies.entry(f.vehicle,f.track,prepared,E.createRng(seed),0,original,{zones,scale:.1}).params;
    for(const key of Object.keys(original).filter(k=>!['arc','gear'].includes(k))){
      const a=Math.abs(large[key]-original[key]),b=Math.abs(small[key]-original[key]);
      assert.ok(b<=a+1e-12,key);if(b<a-1e-8)strictlySmaller=true;
    }
  }
  assert.ok(strictlySmaller,'continuous entry parameters use the adaptive mutation scale');
  const parent={gene:f.gene,result:{frames:f.record},metric:{bestExit:{zoneExit:zones[0].exit,end:zones[0].exit+10}}};
  const random=()=>{let calls=0;return()=>++calls===3?(Strategies.FAMILIES.indexOf('steer')+.5)/Strategies.FAMILIES.length:.75;};
  const a=Strategies.adaptive(f.vehicle,f.track,parent,random(),{scale:1}),b=Strategies.adaptive(f.vehicle,f.track,parent,random(),{scale:.2});
  assert.equal(a.change.family,'steer');assert.equal(b.change.family,'steer');
  const distance=x=>Math.max(...x.gene.map((v,i)=>Math.abs(v-f.gene[i])));
  assert.ok(distance(a)>0);assert.ok(Math.abs(distance(b)-distance(a)*.2)<1e-12);
});

test('trajectory and power macros scale target deltas before their steering recoupling',()=>{
  const f=strategyFixture(-1),z=Strategies.zones(f.track)[0],parent={gene:f.gene,result:{frames:f.record},metric:{bestExit:{zoneExit:z.exit,end:z.exit+15}}};
  for(const family of ['trajectory','gearPower']){
    const random=()=>{let calls=0;return()=>++calls===3?(Strategies.FAMILIES.indexOf(family)+.5)/Strategies.FAMILIES.length:.5;};
    const full=Strategies.adaptive(f.vehicle,f.track,parent,random(),{scale:1}),small=Strategies.adaptive(f.vehicle,f.track,parent,random(),{scale:.2});
    assert.equal(full.change.family,family);assert.equal(small.change.family,family);let moved=false;
    for(let i=0;i<128;i++)for(const channel of [C.throttle,C.brake,C.lineOffset,C.targetSlip,C.counterLead,C.driveSlip]){
      const j=i*8+channel,a=full.gene[j]-f.gene[j],b=small.gene[j]-f.gene[j];
      assert.ok(Math.abs(b-.2*a)<1e-12,'continuous intents scale around their actual parent');if(Math.abs(a)>1e-8)moved=true;
    }
    assert.ok(moved);
    for(let i=0;i<128;i++){
      const s=i/127*f.track.length,base=f.gene[i*8+C.steer]-Strategies.feedforward(f.vehicle,f.track,f.gene,s,15);
      const a=full.gene[i*8+C.steer]-Strategies.feedforward(f.vehicle,f.track,full.gene,s,15),b=small.gene[i*8+C.steer]-Strategies.feedforward(f.vehicle,f.track,small.gene,s,15);
      assert.ok(Math.abs((b-base)-.2*(a-base))<1e-12,'FF follows the actual blended path while the driving residual scales');
    }
  }
});

test('approach mutations preserve every exit control including interpolated pedals',()=>{
  const f=strategyFixture(-1),z=Strategies.zones(f.track)[0],parent={gene:f.gene,result:{frames:f.record},metric:{bestExit:{zoneExit:z.exit,end:z.exit+20}}};
  let calls=0;const rng=()=>++calls===3?(Strategies.FAMILIES.indexOf('approach')+.5)/Strategies.FAMILIES.length:.5;
  const proposal=Strategies.adaptive(f.vehicle,f.track,parent,rng);
  assert.equal(proposal.change.family,'approach');assert.notDeepEqual(proposal.gene,parent.gene);
  for(let s=z.exit-8;s<=f.track.length;s+=.25)assert.deepEqual(G.sample(proposal.gene,s,f.track.length),G.sample(parent.gene,s,f.track.length));
});

test('entry tail acceleration preserves a later real corner and only resumes on the terminal straight',()=>{
  const vehicle=require('./catalog.js').get(),track=require('./track.js').get('jp-tsukuba-d1gp-2025'),zones=Strategies.zones(track),zone=zones.at(-1),gene=G.create();
  for(let i=0;i<128;i++){gene[i*8+C.throttle]=.4;gene[i*8+C.brake]=.3;}
  const record=Array.from({length:128},(_,i)=>{const p=track.sample(i/127*track.length);return {...p,speed:15,vx:15*Math.cos(p.heading),vy:15*Math.sin(p.heading),yaw:p.heading};});
  const proposal=Strategies.entry(vehicle,track,{gene,record},E.createRng(18),zones.length-1,null,{zones});
  const holdEnd=zone.exit+proposal.params.length+proposal.params.recovery;
  const corner=record.findIndex(p=>p.s>Math.max(holdEnd,zone.end+20)&&Math.abs(p.curvature)>.01);
  assert.ok(corner>=0,'the fixture has an actual later corner beyond the mutation window');
  assert.equal(proposal.gene[corner*8+C.brake],.3,'the later grip braking command is preserved');
  assert.ok(Strategies.trailingStraightStart(track)>record[corner].s);
  assert.ok(proposal.gene[127*8+C.brake]<.3,'the terminal straight can still use its changed arrival speed');
});

test('adaptive generation plans see only previously completed niche parents',()=>{
  // Selection-only synthetic replay, not a claim of physically achieved drift.
  const f=strategyFixture(-1),record=Array.from({length:441},(_,i)=>{
    const p=f.track.sample(i*.5),beta=p.s>=85&&p.s<=200?.3:0;
    return {...p,time:i/30,speed:15,vx:15*Math.cos(p.heading),vy:15*Math.sin(p.heading),yaw:p.heading-beta,beta,ax:0,ay:0,r:p.curvature*15,throttle:.8,brake:0,rearTorque:1000,wheelForces:[{fx:0},{fx:0},{fx:1500},{fx:1500}],wheelSlip:[0,0,.4,.4]};
  });
  const valid={valid:true,status:'finished',score:1,frames:record},baseline={genomeVersion:2,gene:f.gene,result:valid,record};
  const engine=new E.Engine(f.vehicle,f.track,{baseline,seed:723,populationSize:6});engine.initialize();
  const completed=new Set(['baseline']),failed=new Set();let adaptiveCount=0,index=0;
  for(let generation=0;generation<6;generation++){
    const oldArchive=engine._nicheArchives.flat().map(p=>p.id),jobs=Array.from({length:6},()=>engine.planCandidate());
    for(const job of jobs){assert.ok(completed.has(job.parentId));if(job.kind.startsWith('exit-'))adaptiveCount++;}
    for(let i=0;i<jobs.length;i++){
      const result=++index%4===0?{...valid,valid:false,status:'offtrack',score:1e9}:valid;
      engine.acceptCandidate(jobs[i],result);if(result.valid)completed.add(jobs[i].id);else failed.add(jobs[i].id);
      if(i<jobs.length-1)assert.deepEqual(engine._nicheArchives.flat().map(p=>p.id),oldArchive,'partial results do not become same-generation parents');
    }
    assert.ok(engine._nicheArchives.flat().every(parent=>!failed.has(parent.id)));
  }
  assert.ok(adaptiveCount>0,'the replay-adaptive branch was exercised');
});

test('powered strategies initialize without simulation and keep generation reservations deterministic',async()=>{
  const vehicle=require('./catalog.js').get(),track=require('./track.js').get(),baseline=await require('./prepared-grips.js').load(vehicle,track);
  const before=baseline.gene.slice();let calls=0;
  const evaluate=(_v,_t,_g)=>{calls++;return calls%3===0?{valid:false,status:'offtrack',score:1e9,frames:baseline.record}:{...baseline.result,frames:baseline.record};};
  const make=()=>new E.Engine(vehicle,track,{seed:511,populationSize:6,baseline,physics:{evaluateGene:evaluate,buildGripBaseline(){throw Error('No runtime baseline search');}}});
  const sequential=make();sequential.initialize();assert.equal(calls,0);assert.equal(sequential.snapshot().poweredExitRegions,2);
  const seen=[];for(let i=0;i<12;i++){sequential.step();seen.push(Array.from(sequential.lastCandidate.gene));}
  calls=0;const planned=make();planned.initialize();const plannedGenes=[],accepted=new Set(['baseline']);
  for(let generation=0;generation<2;generation++){
    const jobs=Array.from({length:6},()=>planned.planCandidate());assert.equal(calls,generation*6,'planning never simulates');
    for(const job of jobs){assert.ok(job.kind==='immigrant'||job.kind.startsWith('global-'));if(job.kind==='immigrant')assert.equal(job.parentId,'baseline');else assert.ok(accepted.has(job.parentId));if(job.parameterParentId)assert.ok(accepted.has(job.parameterParentId));plannedGenes.push(Array.from(job.gene));const result=evaluate(vehicle,track,job.gene);planned.acceptCandidate(job,result);if(result.valid)accepted.add(job.id);}
    assert.ok(planned._nicheArchives.flat().every(parent=>accepted.has(parent.id)),'failed candidates never enter a corner archive');
  }
  assert.deepEqual(plannedGenes,seen);assert.deepEqual(baseline.gene,before);
});

test('road corridors use the full connected width, body clearance and swept boundaries',()=>{
  const Course=require('./course-model.js'),body={physics:{lengthM:4,widthM:2}};
  const rectangle=(x0,x1,y0,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  const outer=rectangle(-10,110,-9,15),island=rectangle(45,55,4,4.02),far=rectangle(-10,110,18,25);
  const course={length:100,width:14,boundaryPolygons:[outer,far],excludedPolygons:[island],obstacles:[],
    sample:s=>({s,x:s,y:0,heading:0,curvature:0,widthLeft:7,widthRight:7}),project:(x,y)=>({s:x,x,y:0,error:y}),
    contains:(x,y)=>(Course.inPolygon(x,y,outer)||Course.inPolygon(x,y,far))&&!Course.inPolygon(x,y,island)};
  const bounds=G.corridorBounds(body,course),open=bounds[20],blocked=bounds[64];
  assert.ok(open.max>13.8&&open.max<13.9,'mapped apron is wider than nominal 7 m half-width');
  assert.ok(open.min< -7.8&&open.min> -7.9);
  assert.ok(open.max<18,'cannot jump to a disconnected outer road');
  assert.ok(blocked.max<2.86&&blocked.max>2.8,'a 2 cm grass island cannot be skipped by the scan');
  const wider=G.corridorBounds({physics:{lengthM:4,widthM:4}},course);
  assert.ok(wider[20].max<open.max-.99,'body width reduces available centre offset');
  const gene=G.create();for(let i=0;i<G.KNOTS;i++)gene[i*G.STRIDE+C.lineOffset]=20;
  const normalized=G.normalize(gene,{lineBounds:bounds});
  assert.equal(normalized[20*G.STRIDE+C.lineOffset],open.max);assert.equal(normalized[64*G.STRIDE+C.lineOffset],blocked.max);
  assert.deepEqual(G.normalize(G.create(),{lineBounds:bounds}),G.create());
});

test('line diversity uses actual corridor width rather than the serialization guard',()=>{
  const a=G.create(),b=G.create();b[C.lineOffset]=2;
  const narrow=Array.from({length:128},()=>({min:-4,max:4})),wide=Array.from({length:128},()=>({min:-8,max:8}));
  assert.equal(E.geneDistance(a,b,narrow),2*E.geneDistance(a,b,wide));
  assert.equal(E.geneDistance(a,b),E.geneDistance(a,b,narrow));
});

test('completed moving drift profiles grow into adjacent straights without admitting failed parents',()=>{
  const route={length:600,width:24,sample:s=>({curvature:s>=200&&s<=280?.02:0})},parent=G.create();
  for(let i=0;i<128;i++){const j=i*8,s=i/127*600;parent[j+C.throttle]=.5;parent[j+C.brake]=.2;if(s>=240&&s<=280){parent[j+C.targetSlip]=-.3;parent[j+C.driveSlip]=.12;parent[j+C.counterLead]=.4;}}
  const record=Array.from({length:31},(_,i)=>({s:250+i,speed:12,beta:-.25})),result={valid:true,status:'finished',score:20};
  const options={seed:5,strategy:'extend',track:route,parentRecord:record,parentResult:result};
  const child=E.mutateGene(parent,options),grown=[];
  for(let i=0;i<128;i++){const s=i/127*600,j=i*8;if(s>280&&child[j+C.targetSlip]<-.01){grown.push(s);assert.ok(child[j+C.driveSlip]>0);assert.ok(child[j+C.brake]<parent[j+C.brake]);assert.equal(child[j+C.steer],parent[j+C.steer]);}}
  assert.ok(grown.length>0&&Math.max(...grown)<320,'bounded growth, no whole-course mutation');
  assert.deepEqual(child,E.mutateGene(parent,options));
  assert.deepEqual(E.driftRegions(record,{...result,status:'offtrack'}),[]);
  assert.deepEqual(E.driftRegions(record.map(f=>({...f,speed:3})),result),[],'slow sliding does not seed straight continuation');
});

test('sampling interpolates continuous targets but chooses a discrete nearest gear',()=>{
  const gene=G.create();gene[C.lineOffset]=-2;gene[G.STRIDE+C.lineOffset]=2;
  gene[C.gearHold]=2;gene[G.STRIDE+C.gearHold]=6;
  assert.equal(G.sample(gene,.25,127).lineOffset,-1);
  assert.equal(G.sample(gene,.49,127).gearHold,2);assert.equal(G.sample(gene,.51,127).gearHold,6);
  assert.equal(G.sample(gene,-10,127).lineOffset,-2);
  assert.equal(G.sample(gene,1000,127).counterLead,.25);
  assert.throws(()=>G.sample(new Float64Array(384),1,600),/v2/);
});

test('offline legacy conversion supplies neutral factors, never silent runtime migration',()=>{
  const gene=G.fromLegacy([-.1,.2,.3,.1,.8,0],{gearCount:6});
  assert.equal(gene.length,G.LENGTH);assert.equal(gene[0],-.1);assert.equal(gene.at(-8),.1);
  for(let i=0;i<G.KNOTS;i++)assert.deepEqual(Array.from(gene.slice(i*8+3,i*8+8)),[0,0,.25,0,0]);
  const {engine}=fixture(undefined,{baseline:{gene:new Float64Array(384),result:complete(controls()),record:[{}]}});
  assert.equal(engine.initialize().ready,false);assert.match(engine.blockedReason,/v2.*1024.*offline/);
});

test('route-aware mutation joins outside preparation, initiation, power and brake release',()=>{
  const parent=controls(),before=parent.slice(),options={seed:71,strategy:'coordinated',gearCount:6};
  const left=E.mutateGene(parent,{...options,track}),right=E.mutateGene(parent,{...options,track:curve(-1)});
  assert.deepEqual(parent,before);assert.deepEqual(left,E.mutateGene(parent,{...options,track}));
  const offsets=[];let joined=0,leadChanged=false;
  for(let i=0;i<G.KNOTS;i++){
    const j=i*8,s=i/127*600;
    if(s<200&&left[j+C.lineOffset]<-.01)offsets.push(s);
    assert.ok(Math.abs(left[j+C.targetSlip]+right[j+C.targetSlip])<1e-12);
    assert.ok(Math.abs(left[j+C.lineOffset]+right[j+C.lineOffset])<1e-12);
    if(left[j+C.targetSlip]<-.05&&left[j+C.driveSlip]>.01&&left[j+C.throttle]>parent[j+C.throttle]&&left[j+C.brake]<parent[j+C.brake])joined++;
    leadChanged||=left[j+C.counterLead]!==.25;
    assert.equal(left[j+C.steer],parent[j+C.steer],'feedback targets must not rewrite the base trajectory or vehicle pose');
  }
  assert.ok(offsets.length>0&&joined>3&&leadChanged);
  assert.deepEqual(left.slice(0,8),parent.slice(0,8));
});

test('fine mutation remains local, smooth, bounded and deterministic',()=>{
  const parent=controls(),a=E.mutateGene(parent,{seed:71,strategy:'fine',gearCount:6}),b=E.mutateGene(parent,{seed:71,strategy:'fine',gearCount:6});
  assert.deepEqual(a,b);assert.deepEqual(a,G.normalize(a,{maxSteerRad:.52,gearCount:6}));
  let changed=0;for(let i=0;i<G.KNOTS;i++){if(a.slice(i*8,i*8+8).some((v,c)=>v!==parent[i*8+c]))changed++;if(i)for(let c=0;c<7;c++)assert.ok(Math.abs((a[i*8+c]-parent[i*8+c])-(a[(i-1)*8+c]-parent[(i-1)*8+c]))<.12);}
  assert.ok(changed>0&&changed<30);
});

test('fixed stock configuration and prepared baseline remain immutable',()=>{
  const original=JSON.stringify(factory);let evaluations=0;
  const {engine,baseline}=fixture((v,t,gene)=>{evaluations++;assert.deepEqual(v,factory);assert.ok(Object.isFrozen(v.physics));assert.equal(t,track);return complete(gene);});
  const before=baseline.gene.slice();assert.equal(engine.initialize().ready,true);assert.equal(evaluations,0);
  assert.deepEqual(engine.snapshot().lineRange,{min:Math.min(...engine.lineBounds.map(b=>b.min)),max:Math.max(...engine.lineBounds.map(b=>b.max))});
  engine.runGeneration();assert.equal(evaluations,20);assert.deepEqual(baseline.gene,before);assert.equal(JSON.stringify(factory),original);
});

test('failed partial runs never enter parents even with enormous reported scores',()=>{
  let n=0;const {engine,baseline}=fixture(()=>({status:['offtrack','collision','timeout','spin'][n++%4],valid:false,score:1e9,driftDistance:1e5}));
  engine.initialize();const before=engine.parents,scale=engine.mutationScale;
  engine.runGeneration();assert.deepEqual(engine.parents,before);assert.equal(engine.best.result.score,baseline.result.score);
  assert.equal(engine.history[1].failureCount,20);assert.equal(engine.history[1].retainedParents,true);assert.ok(engine.mutationScale<scale);
  for(let i=0;i<10;i++)engine.runGeneration();assert.ok(engine.mutationScale>=engine.minMutationScale);
});

test('invalid flags, unfinished statuses and non-finite scores cannot be selected',()=>{
  const bad=[{status:'finished',valid:false,score:1e6},{status:'offtrack',valid:true,score:1e6},{status:'finished',valid:true,score:NaN},{status:'finished',valid:true,score:Infinity}];
  let n=0;const {engine}=fixture(()=>bad[n++%bad.length]);engine.runGeneration();assert.equal(engine.parents.length,1);assert.equal(engine.best.id,'baseline');
});

test('missing, incomplete and wrong-version baselines never touch the physics API',()=>{
  let accessed=0;const physics=new Proxy({},{get(){accessed++;throw Error('Unexpected runtime planning');}}),gene=controls(),result=complete(gene),record=[{}];
  for(const baseline of [undefined,{}, {gene},{gene,result},{gene,record},{result,record},{gene,result,record:[]},{gene,result,record,genomeVersion:1},{gene,result:{...result,valid:false},record}]){
    const engine=new E.Engine(factory,track,{physics,baseline});assert.equal(engine.step(20).ready,false);assert.equal(engine.best,null);assert.equal(engine.planCandidate(),null);
  }
  assert.equal(accessed,0);
});

test('valid diversity is retained alongside the champion without rewarding failures',()=>{
  const make=(id,value,score,status='finished')=>{const gene=controls();for(let i=35;i<65;i++)gene[i*8+C.lineOffset]=value;return{id,sequence:Number(id.slice(1)),gene,result:{valid:status==='finished',status,score,driftDistance:20}};};
  const champion=make('p0',0,10),duplicate=make('p1',0,9.99),different=make('p2',.6,9.9),failed=make('p3',3,100,'offtrack');
  const selected=E.selectDiverseParents([champion,duplicate,different,failed],champion,3);
  assert.deepEqual(selected.map(e=>e.id),['p0','p2']);
});

test('tiny numeric gains count as a plateau, while the best score is still preserved',()=>{
  const base=score(controls());let n=0;const {engine}=fixture(g=>({status:'finished',valid:true,score:base+(++n)*1e-7}));
  for(let i=0;i<4;i++)engine.runGeneration();assert.equal(engine.plateauGenerations,4);assert.ok(engine.best.result.score>base);
  assert.ok(engine.history.slice(1).every(h=>!h.meaningfulImprovement&&h.improvementThreshold>=.05));
  assert.ok(engine.mutationScale>1,'valid plateau widens exploration instead of treating float noise as progress');
});

test('score champion survives later valid regressions',()=>{
  let regress=false;const {engine}=fixture((_v,_t,gene)=>({...complete(gene),...(regress?{score:-100}:{})}));
  for(let i=0;i<4;i++)engine.runGeneration();const best=engine.best;assert.ok(best.result.score>engine.history[0].bestScore);
  regress=true;engine.runGeneration();assert.equal(engine.best.id,best.id);assert.ok(engine.parents.every(p=>E.isValidResult(p.result)));
});

test('same seed reproduces chunked, sequential and planned parallel evaluations',()=>{
  const a=fixture().engine,b=fixture().engine,pool=fixture().engine;
  a.step(7);a.step(13);a.step(40);b.step(60);
  for(let g=0;g<3;g++){
    const jobs=[];let job;while((job=pool.planCandidate()))jobs.push(job);
    assert.equal(jobs.length,20);assert.equal(new Set(jobs.map(j=>j.id)).size,20);assert.equal(pool.snapshot().reserved,20);
    assert.throws(()=>pool.acceptCandidate(jobs[1],complete(jobs[1].gene)),/reservation order/);
    for(const planned of jobs)pool.acceptCandidate(planned,complete(planned.gene));
  }
  assert.deepEqual(a.history,b.history);assert.deepEqual(a.history,pool.history);assert.deepEqual(a.best.gene,pool.best.gene);
  assert.deepEqual(a.parents.map(p=>p.gene),pool.parents.map(p=>p.gene));assert.equal(a.best.result.score,score(a.best.gene));
  const other=fixture(undefined,{seed:999}).engine;other.step(60);assert.notDeepEqual(a.best.gene,other.best.gene);
});

test('evaluation, public snapshots and reserved jobs cannot edit stored genes',()=>{
  const {engine,baseline}=fixture((_v,_t,gene)=>{const result=complete(gene);gene.fill(999);return result;});
  engine.initialize();const original=baseline.gene.slice();engine.best.gene.fill(-999);engine.runGeneration();assert.deepEqual(baseline.gene,original);
  assert.ok(engine.parents.every(p=>G.normalize(p.gene,{maxSteerRad:.52,gearCount:6}).every((v,i)=>v===p.gene[i])));
  const job=engine.planCandidate(),saved=job.gene.slice(),result=complete(job.gene);job.gene.fill(999);engine.acceptCandidate(job,result);assert.deepEqual(engine.lastCandidate.gene,saved);
  assert.throws(()=>engine.acceptCandidate(job,result),/reservation order/);
});

test('baseline and candidate ranking use their actual records without evaluating physics again',()=>{
  const calls=[];let evaluations=0;
  const rankResult=(v,t,result,record)=>{calls.push({v,t,result,record});return {...result,styleScore:result.score,score:result.score+7};};
  const {engine,baseline}=fixture((_v,_t,gene)=>{evaluations++;return {...complete(gene),frames:[{time:0},{time:1}]};},{rankResult});
  const rawScore=baseline.result.score;engine.initialize();assert.equal(evaluations,0);assert.equal(calls.length,1);
  assert.equal(calls[0].record,baseline.record);assert.equal(engine.best.result.score,rawScore+7);assert.equal(baseline.result.score,rawScore);
  engine.step();assert.equal(evaluations,1);assert.equal(calls.length,2);assert.equal(calls[1].record,engine.lastCandidate.record);
  assert.equal(engine.lastCandidate.result.score,engine.lastCandidate.result.styleScore+7);
  const job=engine.planCandidate();engine.acceptCandidate(job,{valid:true,status:'finished',score:Infinity,frames:[]});
  assert.equal(calls.length,2,'non-finite raw results cannot be rescued by ranking');assert.equal(engine.lastCandidate.accepted,false);
});

test('real physics replays every selected parent to the same complete result',()=>{
  const Physics=require('./physics.js'),vehicle=require('./catalog.js').get();
  const course={id:'straight-test',length:80,width:40,judgedStart:20,judgedEnd:60,obstacles:[],zones:[],
    sample:s=>({s,x:s,y:0,z:0,heading:0,grade:0,bank:0,curvature:0,widthLeft:20,widthRight:20}),
    project:(x,y)=>({s:x,error:y,distance:Math.abs(y),x,y:0,heading:0})};
  const gene=G.create();for(let i=0;i<G.KNOTS;i++)gene[i*8+C.throttle]=.35;
  const result=Physics.evaluateGene(vehicle,course,gene,{record:true});assert.equal(result.valid,true);
  const baseline={gene,genomeVersion:2,result,record:result.frames},engine=new E.Engine(vehicle,course,{baseline,physics:Physics,populationSize:2,seed:37});
  engine.initialize();assert.equal(engine.best.result.styleScore,result.score,'default ranking preserves original angle score');
  engine.runGeneration();for(const parent of engine.parents){const raw=Physics.evaluateGene(vehicle,course,parent.gene,{record:true}),replay=require('./fitness.js').rank(vehicle,course,raw);assert.equal(replay.valid,true);assert.equal(replay.status,'finished');assert.equal(replay.score,parent.result.score);assert.equal(replay.time,parent.result.time);}
});
