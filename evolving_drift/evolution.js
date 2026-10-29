/* Inherited driver intent only. A completed physical run is mandatory for every
 * parent; neither the genome nor selection can move the vehicle onto a path. */
(function(root) {
  'use strict';
  const G=root.DriftGenome||(typeof require==='function'?require('./genome.js'):null);
  const Fitness=root.DriftFitness||(typeof require==='function'?require('./fitness.js'):null);
  const Strategies=root.DriftEvolutionStrategies||(typeof require==='function'?require('./evolution-strategies.js'):null);
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
  function bump(gene,channel,center,radius,amount){
    for(let i=Math.max(0,Math.ceil(center-radius));i<=Math.min(G.KNOTS-1,Math.floor(center+radius));i++){
      const u=(i-center)/radius;gene[i*G.STRIDE+channel]+=amount*(.5+.5*Math.cos(Math.PI*u));
    }
  }
  function coordinated(child,regions,rng,scale,gearCount,track,lineBounds){
    const weights=regions.map(a=>Math.sqrt(a.peak)*(a.end-a.start)),total=weights.reduce((a,b)=>a+b,0);
    let choice=rng()*total,index=0;while(index<weights.length-1&&choice>weights[index])choice-=weights[index++];
    const arc=regions[index],span=arc.end-arc.start,preRadius=clamp(span*.3,3,8);
    const preparation=arc.start-preRadius*.7,initiation=arc.start+Math.min(3,span*.2),hold=(arc.start+arc.end)/2;
    const radius=Math.max(3,span*.65),side=arc.sign;
    // An outside feint precedes the turn. Targets and torque demand then rise
    // together while the brakes release; actual actuator limits remain physical.
    const at=lineBounds?.[Math.round(clamp(preparation,0,G.KNOTS-1))],outside=at?(side>0?-at.min:at.max):3;
    bump(child,C.lineOffset,preparation,preRadius,-side*Math.max(.6,outside*(.15+rng()*.20))*scale);
    bump(child,C.lineOffset,initiation,Math.max(3,span*.32),side*(.10+rng()*.20)*scale);
    bump(child,C.targetSlip,hold,radius,-side*(8+rng()*12)*DEG*scale);
    bump(child,C.driveSlip,hold,radius,(.025+rng()*.07)*scale);
    bump(child,C.throttle,hold,radius,(.025+rng()*.075)*scale);
    bump(child,C.brake,initiation,Math.max(4,span*.7),-(.04+rng()*.12)*scale);
    bump(child,C.counterLead,hold,radius,(rng()-.35)*.16*scale);
    // A corner is a seed for an entry/exit sequence, not an isolated window.
    // The extra targets taper into its adjacent straights over a limited
    // distance; the open-course endpoints bound this continuation attempt.
    const ds=track.length/(G.KNOTS-1),extension=(8+rng()*16)/ds;
    for(const [center,amount] of [[arc.start-extension*.35,.28],[arc.end+extension*.35,.48]]){
      const continuationRadius=Math.max(2,extension*.8);
      bump(child,C.targetSlip,center,continuationRadius,-side*(8+rng()*10)*DEG*scale*amount);
      bump(child,C.driveSlip,center,continuationRadius,.05*scale*amount);
      bump(child,C.throttle,center,continuationRadius,.08*scale*amount);
      bump(child,C.brake,center,continuationRadius,-.10*scale*amount);
      bump(child,C.counterLead,center,continuationRadius,.04*scale*amount);
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
  function localMutation(child,rng,scale,maxSteerRad,gearCount,fine){
    const count=1+Math.floor(rng()*(fine?2:3));
    const amplitude=[Math.min(.025,maxSteerRad*.06),.075,.045,.45,8*DEG,.08,.035,1];
    for(let k=0;k<count;k++){
      const channel=Math.floor(rng()*G.STRIDE),center=Math.floor(rng()*G.KNOTS),radius=2+Math.floor(rng()*(fine?4:10));
      if(channel===C.gearHold){
        if(fine||gearCount<=1)continue;
        const gear=rng()<.35?0:1+Math.floor(rng()*gearCount);
        for(let i=Math.max(0,center-radius);i<=Math.min(G.KNOTS-1,center+radius);i++)child[i*G.STRIDE+channel]=gear;
      }else bump(child,channel,center,radius,(rng()*2-1)*amplitude[channel]*scale*(fine?.28:1));
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
    else if(strategy==='coordinated'&&regions.length)coordinated(child,regions,rng,scale,gearCount,options.track,lineBounds);
    else localMutation(child,rng,scale,maxSteerRad,gearCount,strategy==='fine');
    let normalized=normalizeGene(child,limits);
    // A clipped pedal change or an unchanged gear is not another experiment.
    if(normalized.every((v,i)=>v===gene[i])){
      const center=2+Math.floor(rng()*(G.KNOTS-4)),steer=normalized[center*G.STRIDE+C.steer];
      bump(normalized,C.steer,center,2,(steer?-Math.sign(steer):rng()<.5?-1:1)*Math.min(.002,maxSteerRad*.01)*scale);
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
      this._rankResult=options.rankResult||Fitness?.rank;
      if(typeof this._rankResult!=='function')throw new TypeError('Load DriftFitness before creating an evolution engine.');
      this._strategyRequested=options.strategies!==false;this._strategyZones=[];this._nicheArchives=[];this._nicheCache=new WeakMap();this._entryCounts=[];this._baselineEntry=null;
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
      }
      this.history.push({generation:0,bestScore:entry.result.score,validCount:1,failureCount:0,evaluated:1,mutationScale:this.mutationScale,plateauGenerations:0});return this.snapshot();
    }
    _regional(entry,arc){
      let cached=this._nicheCache.get(entry);if(!cached){cached=[];this._nicheCache.set(entry,cached);}
      if(!cached[arc])cached[arc]=Strategies.niche(this.vehicle,this.track,entry.result,entry.record,this._strategyZones[arc]);
      return cached[arc];
    }
    _intentCandidate(){
      const arc=Math.floor(this._rng()*this._strategyZones.length),pool=this._nicheArchives[arc];
      const parent=this._rng()<.6?pool[0]:pool[Math.floor(this._rng()*pool.length)],metric=this._regional(parent,arc);
      const options={lineBounds:this.lineBounds,zones:this._strategyZones,zone:this._strategyZones[arc],scale:this.mutationScale};
      this._entryCounts[arc]++;
      if(this._rng()<.12){
        const strategy=this._rng()<.7?'fine':'local',limits={maxSteerRad:this.maxSteerRad,gearCount:this.gearCount,lineBounds:this.lineBounds};
        const raw=mutateGene(parent.gene,{...limits,rng:this._rng,scale:this.mutationScale,track:this.track,vehicle:this.vehicle,strategy});
        const gene=normalizeGene(Strategies.couple(this.vehicle,this.track,parent.gene,raw,parent.record),limits);
        return {parentId:parent.id,gene,kind:'global-'+strategy,arcIndex:arc};
      }
      if(this._entryCounts[arc]>8&&metric.bestArc?.distance>5&&this._rng()<.8){
        const view={...parent,metric,result:{...parent.result,frames:parent.record}},proposal=Strategies.adaptive(this.vehicle,this.track,view,this._rng,options);
        return {parentId:parent.id,gene:proposal.gene,kind:'arc-'+proposal.change.family,arcIndex:arc,mutation:Object.freeze({...proposal.change})};
      }
      const previous=parent.params?.arc===arc&&this._rng()<.82?parent.params:null;
      const proposal=Strategies.entry(this.vehicle,this.track,this._baselineEntry,this._rng,arc,previous,options);
      // Every entry macro starts with the prepared genome. Parameter ancestry
      // is separate from the actual input genome, including on a restart.
      return {parentId:this._baselineEntry.id,parameterParentId:previous?parent.id:null,gene:proposal.gene,params:proposal.params,kind:'immigrant',arcIndex:arc};
    }
    _retainNiche(entries,arc){
      const unique=new Map(entries.filter(e=>e.accepted&&isValidResult(e.result)).map(e=>[e.id,e]));
      const ranked=[...unique.values()].sort((a,b)=>this._regional(b,arc).score-this._regional(a,arc).score||a.sequence-b.sequence);
      const chosen=[],keys=new Set();
      for(const entry of ranked){const run=this._regional(entry,arc).bestArc,s=run?.end??this._strategyZones[arc].exit;
        const key=[Math.floor((run?.distance||0)/3),Math.floor((run?.distanceWeightedAngle||0)/5),Math.floor((run?.speedRetention||0)*10),Math.floor(G.sample(entry.gene,s,this.track.length).lineOffset/1.5),entry.params?'entry':'adaptive'].join('/');
        if(keys.has(key))continue;keys.add(key);chosen.push(entry);if(chosen.length>=16)break;
      }
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
      // Failed runs never enter ranking or parent selection, but replaying
      // their valid prefix still needs the same fixed approach-speed floor.
      const referenceSpeeds=this._baselineEntry.result.drift?.referenceSpeeds;
      const ranked=complete?this._rankResult(this.vehicle,this.track,result,record,{reference:this._baselineEntry.record}):
        result&&referenceSpeeds?{...result,drift:{...result.drift,referenceSpeeds:{...referenceSpeeds}}}:result;
      const accepted=complete&&isValidResult(ranked),entry={...planned,result:ranked,record,accepted};
      this._candidates.push(entry);this._lastCandidate=entry;this.totalEvaluated++;this.stats.evaluated++;
      if(accepted){this.stats.validCount++;if(ranked.score>this._best.result.score){if(ranked.score-this._best.result.score>=this._threshold())this.stats.improvedCount++;this._best=entry;}}else this.stats.failureCount++;
      if(this._candidates.length===this.populationSize)this._finishGeneration();return this.snapshot();
    }
    _evaluateCandidate(){
      if(this._planned.length)throw new Error('Accept planned candidates before using sequential step.');
      if(!this._physics)this._physics=root.DriftPhysics||(typeof require==='function'?require('./physics.js'):null);
      if(typeof this._physics?.evaluateGene!=='function')throw new TypeError('DriftPhysics.evaluateGene is required to evaluate offspring.');
      const job=this.planCandidate();if(!job)return;const result=this._physics.evaluateGene(this.vehicle,this.track,cloneGene(job.gene),{record:true});this.acceptCandidate(job,result);
    }
    _finishGeneration(){
      const valid=this._candidates.filter(e=>e.accepted),improvement=this._best.result.score-this._generationStartScore,meaningful=improvement>=this._threshold();
      this.plateauGenerations=meaningful?0:this.plateauGenerations+1;
      if(valid.length)this._parents=selectDiverseParents([this._best,...this._parents,...valid],this._best,Math.min(DEFAULTS.parentLimit,this.populationSize),this.lineBounds);
      // Reservations in a generation all see these same archives. New replay
      // results only become parents when the complete generation is accepted.
      for(let arc=0;arc<this._strategyZones.length;arc++)this._nicheArchives[arc]=this._retainNiche([...this._nicheArchives[arc],...valid],arc);
      const rate=valid.length/this.populationSize,usedScale=this.mutationScale,multiplier=!valid.length?.5:rate<.2?.7:meaningful?.94:this.plateauGenerations>=3&&rate>.35?1.12:1;
      this.mutationScale=clamp(usedScale*multiplier,this.minMutationScale,this.maxMutationScale);this.generation++;
      const diversity=this._parents.length>1?this._parents.slice(1).reduce((s,p)=>s+geneDistance(p.gene,this._parents[0].gene,this.lineBounds),0)/(this._parents.length-1):0;
      this.history.push({generation:this.generation,bestScore:this._best.result.score,...this.stats,mutationScale:usedScale,nextMutationScale:this.mutationScale,retainedParents:!valid.length,meaningfulImprovement:meaningful,improvement,improvementThreshold:this._threshold(),plateauGenerations:this.plateauGenerations,parentDiversity:diversity});
      this._candidates=[];this._generationStartScore=this._best.result.score;this.stats={validCount:0,failureCount:0,improvedCount:0,evaluated:0};
    }
    step(count=1){if(!Number.isInteger(count)||count<1||count>10000)throw new RangeError('step count must be between 1 and 10000.');if(!this.initialized)this.initialize();if(this.ready)for(let i=0;i<count;i++)this._evaluateCandidate();return this.snapshot();}
    batch(count=1){return this.step(count);}runGeneration(){if(!this.initialized)this.initialize();return this.ready?this.step(this.populationSize-this._candidates.length):this.snapshot();}
    snapshot(){return{initialized:this.initialized,ready:this.ready,blockedReason:this.blockedReason,generation:this.generation,knots:this.knots,stride:G.STRIDE,genomeVersion:G.VERSION,lineRange:{...this.lineRange},populationSize:this.populationSize,totalEvaluated:this.totalEvaluated,evaluated:this._candidates.length,reserved:this._planned.length,remaining:this.populationSize-this._candidates.length-this._planned.length,mutationScale:this.mutationScale,plateauGenerations:this.plateauGenerations,bestScore:this._best?.result.score??null,best:this.best,lastCandidate:this.lastCandidate,parentCount:this._parents.length,nicheParentCount:new Set(this._nicheArchives.flat().map(e=>e.id)).size,apexRegions:this._strategyZones.length,poweredExitRegions:this._strategyZones.length,stats:{...this.stats},history:this.history.map(e=>({...e}))};}
  }
  const api=Object.freeze({DEFAULTS,createRng,cloneGene,normalizeGene,mutateGene,cornerRegions,driftRegions,geneDistance,selectDiverseParents,isValidResult,Engine});root.DriftEvolution=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
