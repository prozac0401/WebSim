/* Inherited driver intent only. A completed physical run is mandatory for every
 * parent; neither the genome nor selection can move the vehicle onto a path. */
(function(root) {
  'use strict';
  const G=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null);
  const Shape=root.DriftMutationShape||(typeof require==='function'?require('./mutation-shape.js'):null);
  const Fitness=root.DriftFitness||(typeof require==='function'?require('./fitness.js'):null);
  const Strategies=root.DriftEvolutionStrategies||(typeof require==='function'?require('./evolution-strategies.js'):null);
  const Learning=root.DriftEvolutionLearning||(typeof require==='function'?require('./evolution-learning.js'):null);
  const FailureAnalysis=root.DriftFailureAnalysis||(typeof require==='function'?require('./failure-analysis.js'):null);
  const EvaluationCache=root.DriftEvaluationCache||(typeof require==='function'?require('./evaluation-cache.js'):null);
  if(!G)throw new Error('Load DriftGenome before DriftEvolution.');
  const C=G.CHANNELS,DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const DEFAULTS=Object.freeze({knots:G.KNOTS,populationSize:20,maxSteerRad:.52,
    mutationScale:1,minMutationScale:.03,maxMutationScale:1.5,
    improvementAbsolute:.05,improvementRelative:.0025,parentLimit:5});
  function createRng(seed=1){let state=Number(seed)>>>0;return()=>{state=(state+0x6D2B79F5)>>>0;let v=state;v=Math.imul(v^v>>>15,v|1);v^=v+Math.imul(v^v>>>7,v|61);return((v^v>>>14)>>>0)/4294967296;};}
  const cloneGene=G.clone;
  function normalizeGene(gene,options={}){return G.normalize(gene,typeof options==='number'?{maxSteerRad:options}:options);}
  const routeCache=new WeakMap();
  function cornerRegions(track){
    if(!track||!Number.isFinite(track.length)||track.length<=0)return [];
    if(routeCache.has(track))return routeCache.get(track);
    const regions=[];let arc=null;
    for(let i=0;i<G.KNOTS;i++){
      const s=i/(G.KNOTS-1)*track.length;
      const p=typeof track.sample==='function'?track.sample(s):track.points?.[Math.round(i/(G.KNOTS-1)*(track.points.length-1))];
      const curvature=Number.isFinite(p?.curvature)?p.curvature:0,sign=Math.abs(curvature)>.001?Math.sign(curvature):0;
      if(arc&&sign!==arc.sign){if(arc.end-arc.start>=2)regions.push(arc);arc=null;}
      if(sign){if(!arc)arc={start:i,end:i,sign,peak:Math.abs(curvature)};else{arc.end=i;arc.peak=Math.max(arc.peak,Math.abs(curvature));}}
    }
    if(arc&&arc.end-arc.start>=2)regions.push(arc);
    const usable=regions.map(a=>({...a,start:Math.max(3,a.start)})).filter(a=>a.end-a.start>=2&&a.start<G.KNOTS-5);
    routeCache.set(track,usable);return usable;
  }
  function bump(gene,channel,center,radius,amount,limits={}){return Shape.bump(gene,channel,center,radius,amount,limits);}
  function coordinated(child,regions,rng,scale,gearCount,track,lineBounds,limits){
    const add=(channel,center,radius,amount)=>bump(child,channel,center,radius,amount,limits);
    const weights=regions.map(a=>Math.sqrt(a.peak)*(a.end-a.start)),total=weights.reduce((a,b)=>a+b,0);
    let choice=rng()*total,index=0;while(index<weights.length-1&&choice>weights[index])choice-=weights[index++];
    const arc=regions[index],span=arc.end-arc.start,preRadius=clamp(span*.3,3,8);
    const preparation=arc.start-preRadius*.7,initiation=arc.start+Math.min(3,span*.2),hold=(arc.start+arc.end)/2;
    const radius=Math.max(3,span*.65),side=arc.sign;
    // An outside feint precedes the turn. Targets and torque demand then rise
    // together while the brakes release; actual actuator limits remain physical.
    const at=lineBounds?.[Math.round(clamp(preparation,0,G.KNOTS-1))],outside=at?(side>0?-at.min:at.max):3;
    add(C.lineOffset,preparation,preRadius,-side*Math.max(.6,outside*(.15+rng()*.20))*scale);
    add(C.lineOffset,initiation,Math.max(3,span*.32),side*(.10+rng()*.20)*scale);
    add(C.targetSlip,hold,radius,-side*(8+rng()*12)*DEG*scale);
    add(C.driveSlip,hold,radius,(.025+rng()*.07)*scale);
    add(C.throttle,hold,radius,(.025+rng()*.075)*scale);
    add(C.brake,initiation,Math.max(4,span*.7),-(.04+rng()*.12)*scale);
    add(C.counterLead,hold,radius,(rng()-.35)*.16*scale);
    // A corner is a seed for an entry/exit sequence, not an isolated window.
    // The extra targets taper into its adjacent straights over a limited
    // distance; the open-course endpoints bound this continuation attempt.
    const ds=track.length/(G.KNOTS-1),extension=(8+rng()*16)/ds;
    for(const [center,amount] of [[arc.start-extension*.35,.28],[arc.end+extension*.35,.48]]){
      const continuationRadius=Math.max(2,extension*.8);
      add(C.targetSlip,center,continuationRadius,-side*(8+rng()*10)*DEG*scale*amount);
      add(C.driveSlip,center,continuationRadius,.05*scale*amount);
      add(C.throttle,center,continuationRadius,.08*scale*amount);
      add(C.brake,center,continuationRadius,-.10*scale*amount);
      add(C.counterLead,center,continuationRadius,.04*scale*amount);
    }
    if(gearCount>1&&rng()<.20){const gear=Math.min(gearCount,2+Math.floor(rng()*2));for(let i=Math.ceil(initiation);i<=Math.min(G.KNOTS-1,Math.floor(arc.end));i++)child[i*G.STRIDE+C.gearHold]=gear;}
  }
  function driftRegions(record,result){
    if(!isValidResult(result)||!Array.isArray(record))return [];
    const regions=[];let run=null;
    for(const f of record){
      const angle=Math.abs(f.beta||0),eligible=Number.isFinite(f.s)&&f.speed>=6&&angle>=10*DEG&&angle<=70*DEG;
      if(!eligible||run&&(Math.sign(f.beta)!==run.sign||f.s-run.end>3)){
        if(run&&run.end-run.start>=5)regions.push(run);run=null;
      }
      if(eligible){if(!run)run={start:f.s,end:f.s,sign:Math.sign(f.beta),peakSlip:angle,speedSum:0,count:0};run.end=f.s;run.peakSlip=Math.max(run.peakSlip,angle);run.speedSum+=f.speed;run.count++;}
    }
    if(run&&run.end-run.start>=5)regions.push(run);
    return regions.map(r=>({...r,meanSpeed:r.speedSum/r.count}));
  }
  function extendDrift(child,regions,track,rng,scale,gearCount){
    const run=regions[Math.floor(rng()*regions.length)],ds=track.length/(G.KNOTS-1);
    const first=clamp(Math.floor(run.start/ds),2,G.KNOTS-4),last=clamp(Math.ceil(run.end/ds),first+1,G.KNOTS-3),anchor=Math.round((first+last)/2)*G.STRIDE;
    const source=Array.from(child.slice(anchor,anchor+G.STRIDE)),side=-run.sign;
    const targetSlip=Math.abs(source[C.targetSlip])>=8*DEG?source[C.targetSlip]:run.sign*clamp(run.peakSlip,10*DEG,28*DEG);
    const distance=(10+rng()*24)*Math.min(1,scale),count=Math.max(2,Math.ceil(distance/ds));
    const before=rng()<.5?count:Math.max(1,Math.ceil(count*.4)),after=before===count?Math.max(1,Math.ceil(count*.4)):count;
    const strength=clamp(.45+.4*scale,.25,.9);
    for(const [boundary,direction,reach] of [[first,-1,before],[last,1,after]])for(let n=1;n<=reach;n++){
      const i=boundary+direction*n;if(i<2||i>G.KNOTS-3)break;
      const curvature=track.sample(i*ds).curvature||0;
      if(Math.abs(curvature)>.003&&Math.sign(curvature)!==side)break;
      const weight=strength*(.5+.5*Math.cos(Math.PI*n/(reach+1))),j=i*G.STRIDE;
      for(const [channel,target] of [[C.targetSlip,targetSlip],[C.driveSlip,Math.max(source[C.driveSlip],.04)],[C.counterLead,source[C.counterLead]],[C.lineOffset,source[C.lineOffset]]])child[j+channel]+=(target-child[j+channel])*weight;
      child[j+C.throttle]+=(Math.max(child[j+C.throttle],source[C.throttle])-child[j+C.throttle])*weight;
      child[j+C.brake]*=1-weight;
      if(source[C.gearHold]>0&&source[C.gearHold]<=gearCount&&weight>.5)child[j+C.gearHold]=source[C.gearHold];
    }
  }
  function localMutation(child,rng,scale,maxSteerRad,gearCount,fine,limits){
    const count=1+Math.floor(rng()*(fine?2:3));
    const amplitude=[Math.min(.025,maxSteerRad*.06),.075,.045,.45,8*DEG,.08,.035,1];
    for(let k=0;k<count;k++){
      const channel=Math.floor(rng()*G.STRIDE),center=Math.floor(rng()*G.KNOTS),radius=3+Math.floor(rng()*(fine?3:8));
      if(channel===C.gearHold){
        if(fine||gearCount<=1)continue;
        const gear=rng()<.35?0:1+Math.floor(rng()*gearCount);
        for(let i=Math.max(0,center-radius);i<=Math.min(G.KNOTS-1,center+radius);i++)child[i*G.STRIDE+channel]=gear;
      }else{
        // Ordinary exploration changes a related control sequence together;
        // fine polishing may still adjust one channel across the same window.
        const channels=fine?[channel]:[C.throttle,C.brake,C.driveSlip].includes(channel)?[C.throttle,C.brake,C.driveSlip]:channel===C.lineOffset?[C.lineOffset,C.steer,C.counterLead]:[C.steer,C.targetSlip,C.counterLead];
        const span=Shape.window(center,radius);
        for(const selected of channels){
          const amount=(rng()*2-1)*amplitude[selected]*scale*(fine?.28:1),values=[0,.35+.65*rng(),1,.35+.65*rng(),0];
          const changed=Shape.add(child,selected,{...span,values,amount},limits);
          if(!changed.changed)Shape.add(child,selected,{...span,values,amount:-amount},limits);
        }
      }
    }
  }
  function mutateGene(gene,options={}){
    const maxSteerRad=options.maxSteerRad??DEFAULTS.maxSteerRad,gearCount=options.gearCount??8;
    const lineBounds=options.lineBounds||(options.track?G.corridorBounds(options.vehicle,options.track):null),limits={maxSteerRad,gearCount,lineBounds};
    const child=normalizeGene(gene,limits),rng=options.rng||createRng(options.seed??1),scale=options.scale??1;
    if(!Number.isFinite(scale)||scale<=0)throw new RangeError('Mutation scale must be positive.');
    const regions=cornerRegions(options.track),strategy=options.strategy||(regions.length&&rng()<.5?'coordinated':'local');
    const drifts=strategy==='extend'?driftRegions(options.parentRecord,options.parentResult):[];
    if(strategy==='extend'&&drifts.length)extendDrift(child,drifts,options.track,rng,scale,gearCount);
    else if(strategy==='coordinated'&&regions.length)coordinated(child,regions,rng,scale,gearCount,options.track,lineBounds,limits);
    else localMutation(child,rng,scale,maxSteerRad,gearCount,strategy==='fine',limits);
    let normalized=normalizeGene(child,limits);
    // A clipped pedal change or an unchanged gear is not another experiment.
    if(normalized.every((v,i)=>v===gene[i])){
      const center=2+Math.floor(rng()*(G.KNOTS-4)),steer=normalized[center*G.STRIDE+C.steer];
      const amount=(steer?-Math.sign(steer):rng()<.5?-1:1)*Math.min(.002,maxSteerRad*.01)*scale;
      if(!bump(normalized,C.steer,center,3,amount,limits).changed)bump(normalized,C.steer,center,3,-amount,limits);
      normalized=normalizeGene(normalized,limits);
    }
    return normalized;
  }
  function copyFixed(value){if(Array.isArray(value))return Object.freeze(value.map(copyFixed));if(value&&typeof value==='object'){const copy={};for(const[key,item]of Object.entries(value))copy[key]=copyFixed(item);return Object.freeze(copy);}return value;}
  function isValidResult(result){return!!result&&result.valid===true&&result.status==='finished'&&Number.isFinite(result.score);}
  function compareEntries(a,b){return b.result.score-a.result.score||(b.result.driftDistance||0)-(a.result.driftDistance||0)||a.sequence-b.sequence;}
  function publicEntry(entry){return entry?{...entry,gene:cloneGene(entry.gene)}:null;}
  function geneDistance(a,b,lineBounds=null){let sum=0;for(let i=0;i<G.LENGTH;i++){const d=G.DESCRIPTORS[i%G.STRIDE],bound=lineBounds?.[Math.floor(i/G.STRIDE)],range=d.key==='lineOffset'?Math.max(1,bound?bound.max-bound.min:8):d.max-d.min;sum+=((a[i]-b[i])/range)**2;}return Math.sqrt(sum/G.LENGTH);}
  function selectDiverseParents(entries,champion,limit,lineBounds=null){
    if(!champion||!isValidResult(champion.result))throw new TypeError('A valid completed champion is required for parent selection.');
    const unique=new Map(entries.filter(e=>isValidResult(e.result)).map(e=>[e.id,e]));
    const ranked=[...unique.values()].sort(compareEntries),selected=[champion];
    const tolerance=Math.max(2,Math.abs(champion.result.score)*.2);
    const pool=ranked.filter(e=>e.id!==champion.id&&e.result.score>=champion.result.score-tolerance);
    while(selected.length<limit&&pool.length){
      let best=-1,value=-Infinity;
      for(let i=0;i<pool.length;i++){
        const distance=Math.min(...selected.map(p=>geneDistance(p.gene,pool[i].gene,lineBounds)));if(distance<1e-7)continue;
        const quality=clamp(1-(champion.result.score-pool[i].result.score)/tolerance,0,1),merit=distance*(.75+.25*quality);
        if(merit>value){best=i;value=merit;}
      }
      if(best<0)break;selected.push(pool.splice(best,1)[0]);
    }
    return selected;
  }
  // Regional profiles retain diverse parents and guide weak-region searches.
  // The representative is selected solely by its valid displayed total.
  function selectionProfile(result){
    const drift=result?.drift;if(!Array.isArray(drift?.arcs)||!drift.arcs.length)return null;
    const regions=[...drift.arcs.map(a=>({id:a.zoneId,value:clamp((a.score||0)/100,0,1),complete:!!a.complete})),
      ...(drift.links||[]).map(l=>({id:l.id,value:clamp((l.score||0)/45,0,1),complete:!!l.complete}))];
    return regions;
  }
  function paretoEntries(entries){
    const profiles=new Map(entries.map(e=>[e,selectionProfile(e.result)]));
    return entries.filter(entry=>!entries.some(other=>{
      if(other===entry)return false;const a=profiles.get(other),b=profiles.get(entry);if(!a||!b)return false;
      const values=new Map(a.map(r=>[r.id,r]));let better=false;
      for(const r of b){const q=values.get(r.id);if(!q||r.complete&&!q.complete||q.value+1e-8<r.value)return false;if(q.complete&&!r.complete||q.value>r.value+1e-8)better=true;}
      return better;
    }));
  }
  function localGeneDistance(a,b,zone,trackLength,lineBounds=null){
    const lo=Math.max(0,Math.floor((zone.referenceStart??zone.start)/trackLength*(G.KNOTS-1))-1),hi=Math.min(G.KNOTS-1,Math.ceil(zone.end/trackLength*(G.KNOTS-1))+1);
    let sum=0,count=0;for(let knot=lo;knot<=hi;knot++)for(let channel=0;channel<G.STRIDE;channel++){
      const d=G.DESCRIPTORS[channel],bound=lineBounds?.[knot],range=d.key==='lineOffset'?Math.max(1,bound?bound.max-bound.min:8):d.max-d.min;
      sum+=((a[knot*G.STRIDE+channel]-b[knot*G.STRIDE+channel])/range)**2;count++;
    }return Math.sqrt(sum/Math.max(1,count));
  }
  function weakestArcs(entry,zones){
    const d=entry?.result?.drift;if(!d?.arcs?.length)return zones.map((_,i)=>i);
    const scores=zones.map(z=>{
      const a=d.arcs.find(a=>a.zoneId===z.id),links=(d.links||[]).filter(l=>l.fromZoneId===z.id||l.toZoneId===z.id);
      const arc=clamp((a?.score||0)/100,0,1),linked=links.length?links.reduce((n,l)=>n+clamp((l.score||0)/45,0,1),0)/links.length:arc;
      return .7*arc+.3*linked;
    }),low=Math.min(...scores);
    return scores.map((value,i)=>value<=low+1e-6?i:-1).filter(i=>i>=0);
  }
  class Engine {
    constructor(vehicle,track,options={}){
      if(!vehicle||!track)throw new TypeError('A fixed vehicle and a track are required.');
      this.vehicle=copyFixed(vehicle);this.track=track;this.seed=options.seed??1234;this.knots=options.knots??G.KNOTS;
      if(this.knots!==G.KNOTS)throw new RangeError('Genome v2 requires exactly 128 knots.');
      this.populationSize=options.populationSize??DEFAULTS.populationSize;
      if(!Number.isInteger(this.populationSize)||this.populationSize<2||this.populationSize>128)throw new RangeError('populationSize must be between 2 and 128.');
      this.maxSteerRad=options.maxSteerRad??vehicle.physics?.maxSteer??vehicle.maxSteer??DEFAULTS.maxSteerRad;
      this.gearCount=options.gearCount??vehicle.physics?.gearRatios?.length??vehicle.gearRatios?.length??vehicle.spec?.gearCount??8;
      this.lineBounds=G.corridorBounds(this.vehicle,track);
      this.lineRange=Object.freeze({min:Math.min(...this.lineBounds.map(b=>b.min)),max:Math.max(...this.lineBounds.map(b=>b.max))});
      G.normalize(G.create(),{maxSteerRad:this.maxSteerRad,gearCount:this.gearCount});
      this.mutationScale=options.mutationScale??DEFAULTS.mutationScale;this.minMutationScale=options.minMutationScale??DEFAULTS.minMutationScale;this.maxMutationScale=options.maxMutationScale??DEFAULTS.maxMutationScale;
      if(!(Number.isFinite(this.minMutationScale)&&this.minMutationScale>0&&Number.isFinite(this.maxMutationScale)&&this.maxMutationScale>=this.minMutationScale&&Number.isFinite(this.mutationScale)&&this.mutationScale>0))throw new RangeError('Invalid mutation scale limits.');
      this.mutationScale=clamp(this.mutationScale,this.minMutationScale,this.maxMutationScale);
      this._physics=options.physics||null;this._baseline=options.baseline||null;this._rng=createRng(this.seed);
      this._evaluator=null;this._reuse=options.reuse!==false&&!options.physics;this._evaluationStats={simulatedTicks:0,reusedTicks:0,totalTicks:0,cacheHits:0,evaluations:0};
      this._rankResult=options.rankResult||Fitness?.rank;
      if(typeof this._rankResult!=='function')throw new TypeError('Load DriftFitness before creating an evolution engine.');
      this._strategyRequested=options.strategies!==false;this._strategyZones=[];this._nicheArchives=[];this._nicheCache=new WeakMap();this._entryCounts=[];this._baselineEntry=null;
      this._learningEnabled=options.learning!==false;this._learning=null;
      this._weakestArcIndices=[];this._selectionStats={promotions:0,paretoParents:0};
      this._parents=[];this._best=null;this._lastCandidate=null;this._candidates=[];this._planned=[];this._sequence=0;this._generationStartScore=null;
      this.initialized=false;this.ready=false;this.blockedReason=null;this.generation=0;this.totalEvaluated=0;this.history=[];this.plateauGenerations=0;
      this.stats={validCount:0,failureCount:0,improvedCount:0,evaluated:0};
    }
    get best(){return publicEntry(this._best);}get parents(){return this._parents.map(publicEntry);}get lastCandidate(){return publicEntry(this._lastCandidate);}getBest(){return this.best;}
    _threshold(){return Math.max(DEFAULTS.improvementAbsolute,Math.abs(this._generationStartScore||0)*DEFAULTS.improvementRelative);}
    initialize(){
      if(this.initialized)return this.snapshot();this.initialized=true;
      const baseline=this._baseline,required='이 차량·트랙 조합의 유효한 사전 계산 그립 기록이 필요합니다.';
      if(!baseline?.gene||!isValidResult(baseline.result)||!Array.isArray(baseline.record)||!baseline.record.length){this.blockedReason=required;return this.snapshot();}
      let gene;
      try{
        if(baseline.genomeVersion!==undefined&&baseline.genomeVersion!==G.VERSION)throw new TypeError('Unsupported genome version; rebuild the baseline offline.');
        gene=cloneGene(baseline.gene);const normalized=normalizeGene(gene,{maxSteerRad:this.maxSteerRad,gearCount:this.gearCount,lineBounds:this.lineBounds});
        if(normalized.some((v,i)=>v!==gene[i]))throw new TypeError('Prepared genome values are outside v2 bounds.');
      }catch(error){this.blockedReason=required+' '+error.message;return this.snapshot();}
      const ranked=this._rankResult(this.vehicle,this.track,baseline.result,baseline.record,{reference:baseline.record});
      if(!isValidResult(ranked)){this.blockedReason=required+' 사전 기록의 평가 결과가 유효하지 않습니다.';return this.snapshot();}
      const entry={id:'baseline',sequence:this._sequence++,generation:0,parentId:null,kind:'baseline',genomeVersion:G.VERSION,gene,result:ranked,record:baseline.record,accepted:true};
      this._best=entry;this._parents=[entry];this.ready=true;this._generationStartScore=entry.result.score;
      this._baselineEntry=entry;
      if(this._strategyRequested&&Strategies?.supports(this.vehicle,this.track,entry.record)){
        this._strategyZones=Strategies.zones(this.track);this._nicheArchives=this._strategyZones.map(()=>[entry]);this._entryCounts=this._strategyZones.map(()=>0);
        this._weakestArcIndices=weakestArcs(entry,this._strategyZones);
        this._learning=new Learning.Policy(this._strategyZones,{enabled:this._learningEnabled,scale:this.mutationScale});
      }
      this.history.push({generation:0,bestScore:entry.result.score,validCount:1,failureCount:0,evaluated:1,mutationScale:this.mutationScale,plateauGenerations:0});return this.snapshot();
    }
    _regional(entry,arc){
      let cached=this._nicheCache.get(entry);if(!cached){cached=[];this._nicheCache.set(entry,cached);}
      if(!cached[arc])cached[arc]=Strategies.niche(this.vehicle,this.track,entry.result,entry.record,this._strategyZones[arc]);
      return cached[arc];
    }
    _intentCandidate(){
      const learned=this._learning?.choose(this._rng,Strategies.FAMILIES,{weakestArcs:this._weakestArcIndices});
      const arc=learned?.arc??Math.floor(this._rng()*this._strategyZones.length),pool=this._nicheArchives[arc];
      const exploit=this._rng()<.6&&this._regional(pool[0],arc).score>1e-8;
      const parent=exploit?pool[0]:pool[Math.floor(this._rng()*pool.length)],metric=this._regional(parent,arc);
      const options={lineBounds:this.lineBounds,zones:this._strategyZones,zone:this._strategyZones[arc],referenceRecord:this._baselineEntry.record,referenceGene:this._baselineEntry.gene,scale:clamp(learned?.scale??this.mutationScale,this.minMutationScale,this.maxMutationScale)};
      this._entryCounts[arc]++;
      if(learned?.repair){
        const proposal=Strategies.repair(this.vehicle,this.track,parent,this._rng,{...options,family:learned.family,diagnosis:learned.repair});
        return {parentId:parent.id,gene:proposal.gene,kind:'repair-'+proposal.change.family,arcIndex:arc,mutation:Object.freeze({...proposal.change})};
      }
      if(this._rng()<.12){
        const strategy=this._rng()<.7?'fine':'local',limits={maxSteerRad:this.maxSteerRad,gearCount:this.gearCount,lineBounds:this.lineBounds};
        const raw=mutateGene(parent.gene,{...limits,rng:this._rng,scale:options.scale,track:this.track,vehicle:this.vehicle,strategy});
        const gene=normalizeGene(Strategies.couple(this.vehicle,this.track,parent.gene,raw,parent.record),limits);
        return {parentId:parent.id,gene,kind:'global-'+strategy,arcIndex:arc};
      }
      const warmParent=parent.id!=='baseline'&&metric.score<=1e-8&&this._entryCounts[arc]>8&&this._rng()<.5;
      if(this._entryCounts[arc]>8&&(metric.bestArc?.distance>5||warmParent)&&this._rng()<.8){
        const run=metric.bestArc,zone=this._strategyZones[arc];
        const missingConnection=!!run&&((run.connectionCoverage??0)<1||run.start>(zone.cornerStart??zone.start)+.5||run.end<zone.exit-.5);
        const missingLink=metric.links?.some(link=>!link.complete);
        const family=missingLink&&this._rng()<.4?'link':missingConnection&&this._rng()<.45?'bridge':learned?.family;
        const view={...parent,metric,result:{...parent.result,frames:parent.record}},proposal=Strategies.adaptive(this.vehicle,this.track,view,this._rng,{...options,family});
        return {parentId:parent.id,gene:proposal.gene,kind:'arc-'+proposal.change.family,arcIndex:arc,mutation:Object.freeze({...proposal.change})};
      }
      const previous=parent.params?.arc===arc&&this._rng()<.82?parent.params:null;
      const proposal=Strategies.entry(this.vehicle,this.track,this._baselineEntry,this._rng,arc,previous,options);
      // Every entry macro starts with the prepared genome. Parameter ancestry
      // is separate from the actual input genome, including on a restart.
      return {parentId:this._baselineEntry.id,parameterParentId:previous?parent.id:null,gene:proposal.gene,params:proposal.params,kind:'immigrant',arcIndex:arc,mutation:proposal.change?Object.freeze({...proposal.change}):undefined};
    }
    _retainNiche(entries,arc){
      const unique=new Map(entries.filter(e=>e.accepted&&isValidResult(e.result)).map(e=>[e.id,e]));
      const ranked=[...unique.values()].sort((a,b)=>this._regional(b,arc).score-this._regional(a,arc).score||a.sequence-b.sequence);
      const chosen=[],zone=this._strategyZones[arc],distance=(a,b)=>localGeneDistance(a.gene,b.gene,zone,this.track.length,this.lineBounds);
      const add=entry=>{if(entry&&!chosen.some(p=>p.id===entry.id)&&(!chosen.length||Math.min(...chosen.map(p=>distance(p,entry)))>1e-7))chosen.push(entry);};
      add(ranked[0]);add(this._baselineEntry);
      const behavior=entry=>{const m=this._regional(entry,arc),r=m.bestArc,l=m.bestLink;return [clamp((r?.distance||0)/Math.max(1,zone.end-zone.start),0,1),clamp((r?.distanceWeightedAngle||0)/70,0,1),clamp(r?.speedRetention||0,0,1),r?.connectionCoverage||0,l?.coverage||0];};
      const vectors=new Map(ranked.map(e=>[e,behavior(e)]));
      const spread=(pool,limit)=>{
        const rest=pool.filter(e=>!chosen.some(p=>p.id===e.id));
        while(chosen.length<limit&&rest.length){let index=-1,merit=-1;
          for(let i=0;i<rest.length;i++){
            const entry=rest[i],local=Math.min(...chosen.map(p=>distance(p,entry)));if(local<=1e-7)continue;
            const vector=vectors.get(entry),novelty=Math.min(...chosen.map(p=>{const v=vectors.get(p)||behavior(p);return Math.sqrt(vector.reduce((n,x,k)=>n+(x-v[k])**2,0)/vector.length);}));
            const quality=clamp(this._regional(entry,arc).score/100,0,1),value=(local+novelty*.25)*(.8+.2*quality);
            if(value>merit){merit=value;index=i;}
          }
          if(index<0)break;chosen.push(rest.splice(index,1)[0]);
        }
      };
      // Pareto specialists are real proposal parents, including candidates
      // whose global score is lower. Remaining slots preserve locally novel
      // zero-score preparation so the grip baseline cannot win every tie.
      spread(paretoEntries(ranked),6);spread(ranked,16);
      return chosen.length?chosen:[this._baselineEntry];
    }
    planCandidate(){
      if(!this.initialized)this.initialize();if(!this.ready||this._candidates.length+this._planned.length>=this.populationSize)return null;
      if(this._strategyZones.length){
        const proposal=this._intentCandidate(),job={...proposal,id:'g'+(this.generation+1)+'-'+(this._candidates.length+this._planned.length+1),sequence:this._sequence++,generation:this.generation+1,genomeVersion:G.VERSION};
        this._planned.push(job);return {...job,gene:cloneGene(job.gene)};
      }
      const choose=()=>Math.floor(this._rng()*this._parents.length),parent=this._parents[this._rng()<.35?choose():Math.min(choose(),choose())];
      const roll=this._rng(),hasCorners=cornerRegions(this.track).length>0;
      const canExtend=driftRegions(parent.record,parent.result).length>0;
      const kind=canExtend&&roll<.35?'extend':hasCorners&&roll<(this.plateauGenerations>=3?.70:.55)?'coordinated':roll<.9?'fine':'local';
      const gene=mutateGene(parent.gene,{rng:this._rng,scale:this.mutationScale,track:this.track,vehicle:this.vehicle,lineBounds:this.lineBounds,parentRecord:parent.record,parentResult:parent.result,strategy:kind,maxSteerRad:this.maxSteerRad,gearCount:this.gearCount});
      const job={id:'g'+(this.generation+1)+'-'+(this._candidates.length+this._planned.length+1),sequence:this._sequence++,generation:this.generation+1,parentId:parent.id,gene,kind,genomeVersion:G.VERSION};
      this._planned.push(job);return{...job,gene:cloneGene(gene)};
    }
    acceptCandidate(job,result){
      const planned=this._planned[0];if(!planned||planned.id!==job?.id||planned.sequence!==job?.sequence||planned.generation!==job?.generation)throw new Error('Candidate results must be accepted in reservation order.');
      this._planned.shift();const complete=isValidResult(result),record=result?.frames||[];
      if(!complete&&result&&FailureAnalysis)result={...result,failureAnalysis:FailureAnalysis.analyze(this.vehicle,this.track,result,{zones:this._strategyZones})};
      // Failed runs never enter ranking or parent selection, but replaying
      // their valid prefix still needs the same prepared regional pace floor.
      const baselineDrift=this._baselineEntry.result.drift,referenceSpeeds=baselineDrift?.referenceSpeeds,referencePace=baselineDrift?.referencePace;
      const ranked=complete?this._rankResult(this.vehicle,this.track,result,record,{reference:this._baselineEntry.record}):
        result&&(referenceSpeeds||referencePace)?{...result,drift:{...result.drift,referenceSpeeds:referenceSpeeds?{...referenceSpeeds}:undefined,referencePace}}:result;
      const accepted=complete&&isValidResult(ranked),entry={...planned,result:ranked,record,accepted};
      if(result?.evaluation){for(const key of ['simulatedTicks','reusedTicks','totalTicks'])this._evaluationStats[key]+=result.evaluation[key]||0;if(result.evaluation.cacheHit)this._evaluationStats.cacheHits++;this._evaluationStats.evaluations++;}
      this._candidates.push(entry);this._lastCandidate=entry;this.totalEvaluated++;this.stats.evaluated++;
      if(accepted){this.stats.validCount++;if(ranked.score>this._best.result.score){
        if(ranked.score-this._best.result.score>=this._threshold())this.stats.improvedCount++;
        this._best=entry;this._selectionStats.promotions++;
      }}else this.stats.failureCount++;
      if(this._candidates.length===this.populationSize)this._finishGeneration();return this.snapshot();
    }
    _evaluateCandidate(){
      if(this._planned.length)throw new Error('Accept planned candidates before using sequential step.');
      if(!this._physics)this._physics=root.DriftPhysics||(typeof require==='function'?require('./physics.js'):null);
      if(typeof this._physics?.evaluateGene!=='function')throw new TypeError('DriftPhysics.evaluateGene is required to evaluate offspring.');
      const job=this.planCandidate();if(!job)return;
      if(this._reuse&&!this._evaluator)this._evaluator=new EvaluationCache.Evaluator(this.vehicle,this.track);
      const result=this._evaluator?this._evaluator.evaluate(job.gene,{id:job.id,parentId:job.parentId}):this._physics.evaluateGene(this.vehicle,this.track,cloneGene(job.gene),{record:true});
      this.acceptCandidate(job,result);
    }
    _finishGeneration(){
      const valid=this._candidates.filter(e=>e.accepted),improvement=this._best.result.score-this._generationStartScore,meaningful=improvement>=this._threshold();
      // Update evidence only at the generation barrier, so sequential and
      // parallel reservation see identical policies and valid parent archives.
      if(this._learning){
        for(const entry of this._candidates){
          const arc=entry.arcIndex,parent=this._nicheArchives[arc]?.find(p=>p.id===entry.parentId)||this._baselineEntry;
          const regionalImprovement=entry.accepted&&Number.isInteger(arc)&&this._regional(entry,arc).score>this._regional(parent,arc).score+.01;
          this._learning.observe(entry,{improved:regionalImprovement});
        }
        this._learning.finishGeneration(this._candidates);
      }
      this.plateauGenerations=meaningful?0:this.plateauGenerations+1;
      if(valid.length)this._parents=selectDiverseParents([this._best,...this._parents,...valid],this._best,Math.min(DEFAULTS.parentLimit,this.populationSize),this.lineBounds);
      // Reservations in a generation all see these same archives. New replay
      // results only become parents when the complete generation is accepted.
      for(let arc=0;arc<this._strategyZones.length;arc++)this._nicheArchives[arc]=this._retainNiche([...this._nicheArchives[arc],...valid],arc);
      this._weakestArcIndices=weakestArcs(this._best,this._strategyZones);
      this._selectionStats.paretoParents=paretoEntries([...new Map(this._nicheArchives.flat().map(e=>[e.id,e])).values()]).length;
      const rate=valid.length/this.populationSize,usedScale=this.mutationScale,multiplier=!valid.length?.5:rate<.2?.7:meaningful?.94:this.plateauGenerations>=3&&rate>.35?1.12:1;
      const localScales=this._learning?.enabled?this._learning.snapshot().zones.map(z=>z.scale):[];
      this.mutationScale=clamp(localScales.length?localScales.reduce((a,b)=>a+b,0)/localScales.length:usedScale*multiplier,this.minMutationScale,this.maxMutationScale);this.generation++;
      const diversity=this._parents.length>1?this._parents.slice(1).reduce((s,p)=>s+geneDistance(p.gene,this._parents[0].gene,this.lineBounds),0)/(this._parents.length-1):0;
      this.history.push({generation:this.generation,bestScore:this._best.result.score,...this.stats,mutationScale:usedScale,nextMutationScale:this.mutationScale,retainedParents:!valid.length,meaningfulImprovement:meaningful,improvement,improvementThreshold:this._threshold(),plateauGenerations:this.plateauGenerations,parentDiversity:diversity});
      this._candidates=[];this._generationStartScore=this._best.result.score;this.stats={validCount:0,failureCount:0,improvedCount:0,evaluated:0};
    }
    step(count=1){if(!Number.isInteger(count)||count<1||count>10000)throw new RangeError('step count must be between 1 and 10000.');if(!this.initialized)this.initialize();if(this.ready)for(let i=0;i<count;i++)this._evaluateCandidate();return this.snapshot();}
    batch(count=1){return this.step(count);}runGeneration(){if(!this.initialized)this.initialize();return this.ready?this.step(this.populationSize-this._candidates.length):this.snapshot();}
    snapshot(){return{initialized:this.initialized,ready:this.ready,blockedReason:this.blockedReason,generation:this.generation,knots:this.knots,stride:G.STRIDE,genomeVersion:G.VERSION,lineRange:{...this.lineRange},populationSize:this.populationSize,totalEvaluated:this.totalEvaluated,evaluated:this._candidates.length,reserved:this._planned.length,remaining:this.populationSize-this._candidates.length-this._planned.length,mutationScale:this.mutationScale,plateauGenerations:this.plateauGenerations,bestScore:this._best?.result.score??null,best:this.best,lastCandidate:this.lastCandidate,parentCount:this._parents.length,nicheParentCount:new Set(this._nicheArchives.flat().map(e=>e.id)).size,apexRegions:this._strategyZones.length,poweredExitRegions:this._strategyZones.length,learningStats:this._learning?.snapshot()||null,selectionStats:{...this._selectionStats,weakestArcs:[...this._weakestArcIndices]},evaluationStats:{...this._evaluationStats},stats:{...this.stats},history:this.history.map(e=>({...e}))};}
  }
  const api=Object.freeze({DEFAULTS,createRng,cloneGene,normalizeGene,mutateGene,cornerRegions,driftRegions,geneDistance,selectDiverseParents,selectionProfile,paretoEntries,localGeneDistance,weakestArcs,isValidResult,Engine});root.DriftEvolution=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
