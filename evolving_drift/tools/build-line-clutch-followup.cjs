'use strict';
// Analyze frozen benchmark outputs only. This tool never evaluates a candidate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(path.join(repo,p)));
const initialPath='evolving_drift/test-results/line-clutch-20261030-initial.json';
const initial=read(initialPath);
assert.equal(initial.status,'completed');assert.equal(initial.scheduledCandidateInstances,2240);
const summaries=[
 process.argv[2]||'output/drift-qa/line-clutch-corrected-s37-all-summary.json',
 process.argv[3]||'output/drift-qa/line-clutch-heldout-s91-paired-summary.json'
];
const Catalog=require('../catalog.js'),sourceHashes=new Map();
const candidateKeys=['id','parentId','geneHash','parentGeneHash','score','status','valid','accepted','kind'];
const unique=new Set(),failureStatuses={},clutch={enabledCandidates:0,executedCandidates:0,validExecutedCandidates:0};
let instances=0;
function compact(r,job,seed){
 const manual=Catalog.get(r.config.vehicle).physics.transmissionType==='MT';
 for(const row of r.rows){
  instances++;unique.add(r.config.vehicle+'|'+row.geneHash);
  if(!row.accepted){assert.equal(row.score,0);failureStatuses[row.status]=(failureStatuses[row.status]||0)+1;}
  if(!manual){assert.equal(row.clutch.enabledEvents,0);assert.equal(row.clutch.executedEvents,0);}
  if(row.clutch.enabledEvents)clutch.enabledCandidates++;
  if(row.clutch.executedEvents)clutch.executedCandidates++;
  if(row.accepted&&row.clutch.executedEvents)clutch.validExecutedCandidates++;
 }
 const t=r.best.trajectory,s=r.trajectorySearch;
 const cornerSpeeds=(r.best.drift?.arcs||[]).map(a=>({zoneId:a.zoneId,entryKmh:a.entrySpeed*3.6,
  minimumKmh:a.minSpeed*3.6,exitKmh:a.exitSpeed*3.6,speedRetention:a.speedRetention,
  speedScope:a.speedScope,referenceScope:a.referenceScope,referenceSource:a.referenceSource}));
 let windowSpeed=null;
 if(job.phase==='paired'&&t.states?.length){
  const bestReplay=read(r.files.best),start=t.states[0].s,end=t.states.at(-1).s;
  assert.equal(bestReplay.geneHash,r.best.geneHash);assert.equal(bestReplay.result.score,r.best.score);
  assert.deepEqual(bestReplay.sourceHashes,r.sourceHashes);
  const speeds=bestReplay.frames.filter(f=>f.s>=start&&f.s<=end&&Number.isFinite(f.speed)).map(f=>f.speed*3.6);
  if(speeds.length)windowSpeed={startS:start,endS:end,recordedFrames:speeds.length,
   minimumKmh:Math.min(...speeds),maximumKmh:Math.max(...speeds),meanKmh:speeds.reduce((a,b)=>a+b,0)/speeds.length,
   scope:'Recorded replay samples in observed corner/connection window, including drift interruptions; not an all-physics-frame minimum.',
   replaySha256:sha(fs.readFileSync(path.join(repo,r.files.best)))};
 }
 return {vehicle:r.config.vehicle,label:Catalog.get(r.config.vehicle).label,manual,seed,phase:job.phase,
  trajectoryEnabled:!r.config.noTrajectory,evaluated:r.evaluated,valid:r.valid,failed:r.failed,score:r.best.score,
  representative:r.best.id,connections:r.connections,clutch:r.clutch,bestClutch:r.best.clutch,cornerSpeeds,windowSpeed,
  actualTrajectory:{observed:t.observed,merit:t.merit,progress:t.progress,completed:t.completed,
   eligibleDriftDistanceM:t.eligibleDistance,windowDistanceM:t.windowDistance,driftCoverage:t.driftCoverage,
   geometryCredit:t.geometryCredit,maxCornerProgress:t.maxCornerProgress,angleDistanceCredit:t.angle,
   velocitySamples:t.velocitySamples,meanVelocityHeadingErrorDeg:t.velocitySamples?t.headingError*180/Math.PI:null,
   meanOutwardVelocityMps:t.velocitySamples?t.outward:null,sampledMinimumFrontMarginM:t.minimumMargin,feasible:t.feasible},
  lineSearch:{enabled:s.enabled,phase:s.phase,families:s.families,parents:s.parents,feasibleParents:s.feasibleParents,
   coarseProposals:s.coarseProposals,fineProposals:s.fineProposals,duplicateAvoided:s.duplicateAvoided,retry:s.retry},
  provenance:{report:job.report,reportSha256:sha(fs.readFileSync(path.join(repo,job.report))),
   reproductionHash:r.reproductionHash,preparedFingerprint:r.preparedFingerprint,genesisGeneHash:r.genesisGeneHash}};
}
const studies=summaries.map((file,index)=>{
 const summary=read(file),seed=index?91:37;
 assert.equal(summary.status,'completed');assert.equal(summary.config.seed,seed);
 assert.equal(summary.results.length,index?8:24);assert.deepEqual(summary.errors,[]);
 const rows=summary.results.map(job=>{
  const r=read(job.report);assert.equal(r.evaluated,job.budget);assert.equal(r.rows.length,job.budget);
  assert.equal(r.valid+r.failed,job.budget);assert.equal(r.config.seed,seed);assert.equal(r.config.budget,job.budget);
  assert.equal(r.config.populationSize,20);assert.equal(r.config.workers,2);assert.equal(r.stopped,'budget-exhausted');
  assert.equal(r.error,null);assert.equal(r.startupEvaluations,0);assert(Object.values(r.startupCalls).every(x=>x===0));
  assert.deepEqual(r.signatures,initial.signatures,'Physics, fitness and genome must remain fixed across hierarchy correction');
  for(const [p,h]of Object.entries(r.sourceHashes)){if(sourceHashes.has(p))assert.equal(sourceHashes.get(p),h,'Different final source: '+p);sourceHashes.set(p,h);}
  return compact(r,job,seed);
 });
 assert.equal(rows.reduce((n,r)=>n+r.evaluated,0),index?1600:2240);
 return {seed,startedAt:summary.startedAt,completedAt:summary.completedAt,settings:summary.config,
  sourceSummary:{path:file,sha256:sha(fs.readFileSync(path.join(repo,file)))},rows};
});
assert.equal(instances,3840);
const finalRows=studies.flatMap(s=>s.rows),pairs=[],offParity=[],prefixParity=[];
for(const seed of [37,91])for(const vehicle of ['porter-lpg-mt','gr86-2.4-rz-mt','supra-3.0t-rz','ioniq5-standard']){
 const on=finalRows.find(r=>r.seed===seed&&r.phase==='paired'&&r.vehicle===vehicle&&r.trajectoryEnabled);
 const off=finalRows.find(r=>r.seed===seed&&r.phase==='paired'&&r.vehicle===vehicle&&!r.trajectoryEnabled);
 assert.equal(on.evaluated,200);assert.equal(off.evaluated,200);
 for(const key of ['preparedFingerprint','genesisGeneHash'])assert.equal(on.provenance[key],off.provenance[key]);
 const before=initial.paired.find(r=>r.vehicle===vehicle);
 for(const key of ['preparedFingerprint','genesisGeneHash'])assert.equal(on.provenance[key],before.on.source[key]);
 pairs.push({seed,vehicle,on,off});
 if(seed===37){
  const old=read(before.off.source.report),now=read(off.provenance.report);
  for(let i=0;i<200;i++)for(const key of candidateKeys)assert.deepEqual(now.rows[i][key],old.rows[i][key],vehicle+' OFF candidate '+i+' '+key);
  const representativeKeys=['id','parentId','kind','geneHash','score','status','drift','power','clutch'];
  for(const key of representativeKeys)assert.deepEqual(now.best[key],old.best[key],vehicle+' OFF representative '+key);
  offParity.push({vehicle,candidates:200,keys:candidateKeys,representativeKeys,passed:true,
   note:'Trajectory search diagnostics are remeasured by the corrected module and intentionally excluded from identity parity.'});
  const smoke=finalRows.find(r=>r.seed===37&&r.phase==='smoke'&&r.vehicle===vehicle),smokeRaw=read(smoke.provenance.report),onRaw=read(on.provenance.report);
  for(let i=0;i<40;i++)for(const key of candidateKeys)assert.deepEqual(smokeRaw.rows[i][key],onRaw.rows[i][key],vehicle+' smoke prefix '+i+' '+key);
  prefixParity.push({vehicle,candidates:40,passed:true});
 }
}
// Count all 6080 actual evaluation instances, but distinguish duplicate genomes.
const aggregateUnique=new Set(unique);
for(const r of [...initial.smoke,...initial.paired.flatMap(p=>[p.on,p.off])])for(const row of read(r.source.report).rows)aggregateUnique.add(r.vehicle+'|'+row.geneHash);
const identities=[...sourceHashes].sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>{
 const raw=fs.readFileSync(path.join(repo,p));assert.equal(sha(raw),h,'Source changed after final study: '+p);
 return {path:p,sha256:h,lfSha256:sha(raw.toString('utf8').replace(/\r\n/g,'\n'))};
});
const sourceAnchor=process.argv[4]||null;
if(sourceAnchor)assert(/^[a-f0-9]{40}$/.test(sourceAnchor),'Pass a full verified source commit hash');
const result={schema:2,implementationVersion:'corrected-v2',generatedAt:new Date().toISOString(),sourceCommit:sourceAnchor,
 method:'Initial v1 evidence kept separate. One generic hierarchy correction, then all16 x40 and four matched ON/OFF x200 at seed37, followed by untouched heldout seed91 four matched ON/OFF x200. Physics, scoring, genome, clutch support and prepared starting genes remain fixed.',
 initialEvidence:{path:initialPath,sha256:sha(fs.readFileSync(path.join(repo,initialPath))),sourceCommit:initial.implementationCommit,evaluated:2240},
 evaluated:instances,valid:finalRows.reduce((n,r)=>n+r.valid,0),distinctVehicleGenePairs:unique.size,repeatedInstances:instances-unique.size,
 aggregateEvaluated:6080,aggregateDistinctVehicleGenePairs:aggregateUnique.size,aggregateRepeatedInstances:6080-aggregateUnique.size,
 failures:failureStatuses,clutch,signatures:initial.signatures,sourceIdentities:identities,studies:studies.map(({rows,...rest})=>rest),
 smoke:finalRows.filter(r=>r.phase==='smoke'),pairs,offParity,prefixParity,
 validation:{sameSourceAcrossFinalAndHeldout:true,noStartupPhysics:true,nonManualEventsIgnored:true,failedScoresZero:true,
  offCandidateParityCount:800,smokePrefixParityCount:160},
 limitations:['Two seeds, one circuit, 200 evaluations per arm; not a statistical proof or a long-run convergence test.',
  'Heldout seed91 was not used to tune the correction. A fixed seed and repeated prefixes create correlated candidates.',
  'ON/OFF share random seeds, but schedule branching consumes random numbers differently; their later mutations are not identical counterfactual pairs.',
  'Heading and outward-velocity metrics describe the highest-score completed representative. Maximum corner/link coverage describes any valid completed candidate, which may be different.',
  'Full corner completion requires all criteria; coverage 100% alone is insufficient. Sampled front margin is not the all-frame minimum or a safety proof.',
  'Velocity-heading error is relative to the sampled road tangent; outward velocity is a proxy, not a complete aesthetic or ideal-path score. Legitimate wide/apex paths can differ. Interpret both with drift distance, speed and completion.',
  'Clutch inertia/capacity remain model estimates; physical kick availability does not prove a causal improvement in connected drift.'],
 reproduction:{commands:[
  'node evolving_drift/tools/run-line-clutch-study.cjs --run --scope all --seed 37 --parallel 2 --workers 2 --prefix line-clutch-corrected',
  'node evolving_drift/tools/run-line-clutch-study.cjs --run --scope paired --seed 91 --pair-budget 200 --parallel 2 --workers 2 --prefix line-clutch-heldout'],
  hashNote:'sha256 hashes exact checkout bytes; lfSha256 normalizes CRLF to LF. Use the prepared fingerprints and runtime signatures as well.'}};
const auditPath='output/drift-qa/line-clutch/corrected37-lineage-audit.json';
if(fs.existsSync(path.join(repo,auditPath))){
 const audit=read(auditPath);assert.equal(audit.seed,37);assert(Object.values(audit.guardedPhysicalCalls).every(n=>n===0));
 for(const v of audit.vehicles)for(const arm of ['on','off']){
  const input=v.sources[arm];assert.equal(input.evaluated,200);assert.equal(input.stopped,'budget-exhausted');
  const measured=pairs.find(p=>p.seed===37&&p.vehicle===v.vehicle)[arm].provenance;
  assert.equal(input.path,measured.report);assert.equal(input.sha256,measured.reportSha256);
 }
 result.mechanismAudit={method:audit.method,sourceArtifactSha256:sha(fs.readFileSync(path.join(repo,auditPath))),
  qualification:audit.qualification,limitations:audit.limitations,guardedPhysicalCalls:audit.guardedPhysicalCalls,
  vehicles:audit.vehicles.map(v=>({vehicle:v.vehicle,sources:v.sources,
   firstActualAnchorOrdinal:v.firstActualAnchorOrdinal,firstFineOrdinal:v.firstFineOrdinal,
   finalArchiveParents:v.finalArchive.length,finalArchiveFamilies:new Set(v.finalArchive.map(x=>x.family)).size,
   finalArchiveWithoutMovingDrift:v.finalArchive.filter(x=>x.eligibleDistance<=1e-9).length,
   operatorYields:v.operatorYields,winnerAncestry:v.winnerAncestry}))};
}
const out=path.join(repo,'evolving_drift/test-results/line-clutch-20261030.json');fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=2)=>Number.isFinite(v)?v.toFixed(n):'—',pct=v=>Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
const short={ 'porter-lpg-mt':'포터 LPG 6MT','gr86-2.4-rz-mt':'GR86 6MT','supra-3.0t-rz':'A90 수프라 8AT','ioniq5-standard':'아이오닉 5 Standard' };
const row=a=>'<tr>'+a.map(x=>'<td>'+x+'</td>').join('')+'</tr>';
const table=(h,b)=>'<div class="table-scroll"><table><thead><tr>'+h.map(x=>'<th scope="col">'+x+'</th>').join('')+'</tr></thead><tbody>'+b+'</tbody></table></div>';
const pairedTable=table(['시드 · 차량','점수 OFF → ON','유효 완주 OFF → ON','코너 완료 후보','직선 연결 후보'],pairs.map(p=>row([p.seed+' · '+short[p.vehicle],num(p.off.score)+' → '+num(p.on.score),p.off.valid+' → '+p.on.valid,p.off.connections.completedCornerRuns+' → '+p.on.connections.completedCornerRuns,p.off.connections.completedLinkRuns+' → '+p.on.connections.completedLinkRuns])).join(''));
const lineTable=table(['시드 · 차량','평가창 드리프트 m','평가창 최저 km/h*','속도 방향 오차 °','바깥 속도 m/s','앞바퀴 여유 m*','최대 코너 진행','최대 직선 진행'],pairs.map(p=>row([p.seed+' · '+short[p.vehicle],num(p.off.actualTrajectory.eligibleDriftDistanceM,1)+' → '+num(p.on.actualTrajectory.eligibleDriftDistanceM,1),num(p.off.windowSpeed?.minimumKmh,1)+' → '+num(p.on.windowSpeed?.minimumKmh,1),num(p.off.actualTrajectory.meanVelocityHeadingErrorDeg)+' → '+num(p.on.actualTrajectory.meanVelocityHeadingErrorDeg),num(p.off.actualTrajectory.meanOutwardVelocityMps)+' → '+num(p.on.actualTrajectory.meanOutwardVelocityMps),num(p.off.actualTrajectory.sampledMinimumFrontMarginM)+' → '+num(p.on.actualTrajectory.sampledMinimumFrontMarginM),pct(p.off.connections.maximumCornerCoverage)+' → '+pct(p.on.connections.maximumCornerCoverage),pct(p.off.connections.maximumLinkCoverage)+' → '+pct(p.on.connections.maximumLinkCoverage)])).join(''));
const initialTable=table(['차량 · 시드37 ON','초기 → 수정 점수','초기 → 수정 유효 완주','초기 → 수정 바깥 속도'],pairs.filter(p=>p.seed===37).map(p=>{const old=initial.paired.find(x=>x.vehicle===p.vehicle).on;return row([short[p.vehicle],num(old.score)+' → '+num(p.on.score),old.valid+' → '+p.on.valid,num(old.actualTrajectory.meanOutwardVelocityMps)+' → '+num(p.on.actualTrajectory.meanOutwardVelocityMps)]);}).join(''));
const smokeTable=table(['차량 사양 · 각40회','유효 완주','대표 점수','킥 실행 후보'],result.smoke.map(r=>row([esc(r.label),r.valid+' / 40',num(r.score),r.clutch.candidatesWithExecutedEvents])).join(''));
let mechanismHtml='';
if(result.mechanismAudit){
 const m=result.mechanismAudit;
 const anchors=table(['시드37 ON · 차량','첫 세부 조정 가능 후보','첫 세부 변이 후보','마지막 라인 종류','드리프트 없는 보관 부모'],m.vehicles.map(v=>row([short[v.vehicle],v.firstActualAnchorOrdinal??'없음',v.firstFineOrdinal??'없음',v.finalArchiveFamilies,v.finalArchiveWithoutMovingDrift])).join(''));
 const ion=m.vehicles.find(v=>v.vehicle==='ioniq5-standard');
 const ancestry=table(['아이오닉5 대표의 조상 후보','변이 종류','점수','평가창 드리프트 m','최대 코너 진행'],ion.winnerAncestry.map(v=>row([v.ordinal+' · '+esc(v.id),esc(v.kind),num(v.score),num(v.trajectory.eligibleDistance,1),pct(v.trajectory.maxCornerProgress)])).join(''));
 mechanismHtml='<h2>큰 라인과 세부 조정이 실제로 이어졌는가</h2><p>저장된 실제 궤적과 부모 이력으로 세대별 보관 부모를 재구성했습니다. 추가 물리 시뮬레이션은0회이며 최종 부모 수·라인 종류 수가 실행 결과와 일치합니다. 아래 순번은 평가된 후보 순서입니다. 부분 코너 진행·실제 드리프트 거리·진행 방향 조건을 충족한 부모가 있어야 세부 변이를 제안합니다.</p>'+anchors+'<p>포터는200회 안에 이 조건을 충족한 부모가 없어 세부 단계에 들어가지 않았습니다. GR86은138번째 후보 이후에야 시작 조건을 얻어143번째부터 세부 변이를 시도했습니다. 조용한 그립 주행만 보관하는 문제는 줄었지만, 이것만으로 연결 성공을 보장하지 않습니다.</p><details><summary>아이오닉5의 혼합 변이 계보 확인</summary>'+ancestry+'<p>133번째 조상을 큰 라인·속도 변이로 바꾼160번째 후보에서 점수17.08, 코너 진행73.9%를 얻고,193번째 조향 세부 변이에서17.36으로 높아졌습니다. 중간 점수가 조금 낮아도 유효한 라인을 보관하고 다시 큰 변이를 적용한 사례입니다. 이 사례에도 완전한 코너·직선 연결은 없었습니다. 다른 차종에도 같은 이득이 난다는 증거는 아닙니다.</p></details>';
}
const full=finalRows.reduce((n,r)=>n+r.connections.fullyConnectedRuns,0);
const headline=full?'전체 연결 성공 후보 '+full+'회를 관찰했습니다. 제한된 두 시드 결과이며, 모든 차종의 재현성을 뜻하지 않습니다.':'이번 추가 3,840회에서도 코너와 직선을 모두 연결한 후보는 없었습니다. 전체 연결 성공과 수렴 속도 향상을 입증했다고 말할 수 없습니다.';
const wins=pairs.filter(p=>p.on.score>p.off.score).length;
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>전체 라인 · 클러치 킥 검증 — 2026-10-30</title>
<style>:root{font-family:system-ui,sans-serif;color:#172b2b;background:#f3f6f4;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:36px 22px 60px}h1{font-size:clamp(1.8rem,4vw,2.5rem);line-height:1.3}h2{font-size:1.3rem;margin:34px 0 12px}p,li{line-height:1.75}.eyebrow,small,figcaption{color:#52655e}.note{border-left:4px solid #ad741d;background:#fff7e4;padding:14px 18px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.card{background:white;border:1px solid #d3ded8;border-radius:10px;padding:17px}.card strong{display:block;font-size:1.7rem}.card span{color:#52655e}.table-scroll{overflow-x:auto;background:white;border:1px solid #d3ded8;border-radius:10px}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{padding:13px;text-align:left;vertical-align:top;border-bottom:1px solid #e3eae6}th{background:#e9f0eb}td:first-child{min-width:175px}a{color:#066750}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#e9f0eb;padding:16px;border-radius:8px}details{margin:22px 0}summary{font-weight:650;cursor:pointer}figure{margin:20px 0}img{width:100%;height:auto}figcaption{font-size:.88rem;line-height:1.6}footer{margin-top:36px;border-top:1px solid #ccd7d0;padding-top:16px;font-size:.85rem;color:#52655e}@media(max-width:600px){main{padding:24px 14px 40px}.cards{grid-template-columns:1fr 1fr;gap:8px}.card{padding:12px}.card strong{font-size:1.5rem}th,td{padding:11px}}</style>
<main><p class="eyebrow">EVOLVING DRIFT · 검증 결과 · 2026-10-30 · 영암 KIC T21</p><h1>라인 탐색과 클러치 킥,<br>구현 후 비교한 결과</h1><p>초기 2,240회 실험에서 네 비교 사양 모두 바깥 방향 속도가 악화되어 탐색 배분을 한 번 수정했습니다. 같은 물리·채점·초기값으로 다시 2,240회를 평가하고, 조정에 쓰지 않은 시드91에서 1,600회를 추가했습니다.</p><p class="note">${esc(headline)}</p>
<div class="cards"><div class="card"><strong>6,080</strong><span>초기+수정 실제 평가</span></div><div class="card"><strong>3,840</strong><span>수정 후 평가</span></div><div class="card"><strong>${result.valid}</strong><span>수정 후 유효 완주</span></div><div class="card"><strong>${full}</strong><span>수정 후 전체 연결</span></div></div>
<h2>동일 예산과 새 시드 비교</h2><p>각 행은 OFF 200회와 ON 200회의 비교입니다. 전체 라인 탐색만 켜고 껐으며, 클러치·실패 재시도·채점·시작값은 동일합니다. 두 시드의 8개 조합 중 ON의 대표 점수가 더 높은 조합은 ${wins}개입니다. 점수만으로 라인 품질이나 연결 성공을 판정하지 않습니다.</p>${pairedTable}
<h2>차체 방향과 실제 이동 방향</h2><p>아래도 OFF → ON 순서입니다. 드리프트 거리·속도·방향 오차·바깥 속도·앞바퀴 여유는 최고 점수 대표 주행의 값입니다. 방향 오차는 샘플 지점의 도로 접선과 실제 속도 방향의 차이입니다. 바깥 속도는 진단용 대리 지표이며 이상적인 드리프트 라인이나 미관 전체를 평가하지 않습니다. 넓게 쓰는 라인과 apex 경로는 정당하게 다른 값을 가질 수 있습니다. 평가창 드리프트 거리는 코너 평가창에서 8m/s 이상, 슬립각 10~70°로 새로 전진한 노면 거리입니다. 라인이 차분해져도 드리프트 자체가 줄었다면 품질 개선으로 단정하지 않습니다. 진행률은 유효 완주 후보 전체의 최댓값이므로 같은 후보가 아닐 수 있습니다. 진행률100%만으로는 속도·apex·연결 유지 조건을 만족한 코너 완료가 아닙니다.</p>${lineTable}<p><small>* 평가창 최저 속도는 재생 프레임에 기록된 값이며 드리프트가 끊긴 순간도 포함합니다. 앞바퀴 여유는 축소 샘플의 최솟값이며 전체 프레임의 안전 보증이 아닙니다. 이탈·충돌 여부는 물리 판정을 유지합니다. 속도 방향 지표는8m/s 이상 전진하며 스핀하지 않는 샘플만 사용하고, 샘플이 없으면 — 로 표시합니다.</small></p>
<details><summary>실제 최고 기록 궤적 보기 — 시드37·91</summary><figure><img src="line-clutch-20261030-paths.png" alt="시드37의 최고 기록 실제 궤적 비교"><figcaption>시드37 · 회색은 시뮬레이터 주행 노면, 주황은 OFF, 청록은 ON입니다. 원본 재생 프레임의 차량 중심 위치이며 궤적을 미화하지 않았습니다.</figcaption></figure><figure><img src="line-clutch-20261030-heldout-paths.png" alt="조정에 쓰지 않은 시드91의 최고 기록 실제 궤적 비교"><figcaption>시드91 · 이 그림만으로 슬립각이나 연결 성공을 판단할 수 없습니다.</figcaption></figure></details>
<h2>초기 구현에서 달라진 결과</h2><p>시드37의 ON 200회를 같은 예산끼리 비교합니다. OFF는 초기와 수정 후 4사양×200회, 총800개 후보의 부모·유전자·점수·상태가 모두 일치했습니다. 따라서 물리나 채점 변경이 비교 결과에 섞이지 않았습니다.</p>${initialTable}<p><a href="line-clutch-20261030-initial.html">초기 구현 비교 전체</a> · <a href="line-clutch-20261030-initial.json">초기 측정 JSON</a></p>
${mechanismHtml}<h2>모든16개 사양과 수동 클러치</h2><p>모든 사양에 각40회의 짧은 검사를 다시 수행했습니다. 수동4사양만 킥 유전자를 실행하며, 비수동12사양에서는 실행되지 않음을 검사했습니다. 클러치의 별도 물리 실험과 실제 모바일 재생 확인은 초기 보고서에 보관했습니다. 킥 실행은 입력 가능성을 증명하며 드리프트 연결 개선의 인과 증거는 아닙니다.</p>${smokeTable}
<h2>검증 범위와 재현</h2><ul><li>6080회는 실제 실행 횟수입니다. 고유 차량·유전자 조합은 ${aggregateUnique.size}개이며 동일한 후보의 재실행과 같은 시드의 상관관계를 포함합니다.</li><li>수정 후 전체 실험과 시드91 실험은 동일한 소스로 수행했습니다. 시드91 결과를 보고 다시 조정하지 않았습니다. ON/OFF는 같은 시드를 쓰지만 탐색 분기 이후 난수 소비가 달라 후속 변이 자체가 일대일로 같지는 않습니다.</li><li>모든 실행은 사전 계산된 그립 시작값을 읽었습니다. 시작 시 물리 평가·그립 탐색 호출은0회입니다.</li><li>단일 코스·두 시드·각200회이므로 장기 수렴이나 실차 성능을 일반화할 수 없습니다. 클러치 관성·용량은 추정치이고 동적 롤·열·마모는 포함하지 않습니다.</li></ul>
<p><a href="line-clutch-20261030.json" download>전체 측정·설정·소스 식별자 JSON 다운로드</a> · <a href="../evolving_drift_doc.html">설명과 자료</a></p><details><summary>재현 명령과 소스 식별</summary><pre>${esc(result.reproduction.commands.join('\n\n'))}</pre><p>원본 보고서의 SHA-256, 초기값 식별자, 물리·채점·유전자 서명을 JSON에 남겼습니다. 소스 raw SHA-256은 측정 체크아웃 바이트, lfSha256은 CRLF를 LF로 정규화한 값입니다. 그립 기록은 실행 전에 오프라인 생성해야 합니다.</p></details><footer>생성 ${esc(result.generatedAt)} · 한 번의 일반 탐색 수정 후 고정한 비교 실험입니다.</footer></main></html>`;
fs.writeFileSync(out.replace(/\.json$/,'.html'),html+'\n');
console.log(JSON.stringify({out,evaluated:instances,valid:result.valid,aggregate:6080,fullyConnected:full,offParity:800,pairs:pairs.map(p=>({seed:p.seed,vehicle:p.vehicle,score:[p.off.score,p.on.score],valid:[p.off.valid,p.on.valid],outward:[p.off.actualTrajectory.meanOutwardVelocityMps,p.on.actualTrajectory.meanOutwardVelocityMps]}))}));
