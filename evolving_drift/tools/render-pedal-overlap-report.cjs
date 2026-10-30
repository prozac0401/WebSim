'use strict';
// Publication is deliberately separate from the ongoing benchmark. A partial
// comparison must never overwrite the completed public report.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..'),directory=path.join(repo,'evolving_drift/test-results');
const input=path.join(repo,'output/drift-qa/pedal-overlap/comparison.json'),stem='pedal-overlap-20261030';
const track='kr-kic-t21-kdl-2016-r2';
const representativeIds=['porter-lpg-mt','bmw-m2-3.0t-mt','supra-3.0t-rz','gr86-2.4-rz-mt'];
const fortyIds=['g80-2.5t-rwd','g80-3.5t-rwd','ioniq5-standard','ioniq5-long-rwd'];
const labels={
 'porter-lpg-mt':'포터 LPG 6MT','porter-lpg-at':'포터 LPG 5AT','porter-diesel-mt':'포터 디젤 6MT','porter-diesel-at':'포터 디젤 5AT',
 'g80-2.5t-rwd':'G80 2.5T 8AT','g80-3.5t-rwd':'G80 3.5T 8AT','g70-2.0t-rwd':'G70 2.0T 8AT','g70-3.3t-rwd':'G70 3.3T 8AT','g70-2.2d-rwd':'G70 2.2D 8AT',
 'supra-3.0t-rz':'A90 수프라 3.0T 8AT','bmw-m2-3.0t-dct':'M2 3.0T 7DCT','bmw-m2-3.0t-mt':'M2 3.0T 6MT','gr86-2.4-rz-mt':'GR86 2.4 6MT','gr86-2.4-rz-at':'GR86 2.4 6AT',
 'ioniq5-standard':'아이오닉 5 Standard','ioniq5-long-rwd':'아이오닉 5 Long Range'};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const escaped=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(n,d=0)=>Number(n).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fraction=(n,total)=>total?100*n/total:0;
const readJSON=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const {runtimeEquivalent}=require('./audit-pedal-runtime-release.cjs');
const expectedBudget=(seed,id)=>seed===91?40:representativeIds.includes(id)?100:fortyIds.includes(id)?40:20;
function validateComparison(comparison){
 assert.equal(comparison.completion?.complete,true,'미완료 비교는 공개할 수 없습니다.');
 assert.equal(comparison.matchedPairs?.length,20,'완료된 비교 20쌍이 필요합니다.');
 assert.equal(comparison.evaluations,1760,'같은 예산으로 수행한 1,760회 평가가 필요합니다.');
 assert.deepEqual(comparison.unmatched,[],'짝이 없는 실행은 공개 전에 해결해야 합니다.');
 for(const key of ['matchedPairs','expectedPairs'])assert.equal(comparison.completion[key],20);
 for(const key of ['matchedEvaluations','expectedMatchedEvaluations'])assert.equal(comparison.completion[key],1760);
 assert.equal(comparison.completion.unmatchedPairs,0);
 const ids=require('../catalog.js').list().map(v=>v.id),seen=new Set();assert.equal(ids.length,16);
 for(const pair of comparison.matchedPairs){
  const key=pair.seed+'/'+pair.vehicle;assert.ok(!seen.has(key),'중복 비교: '+key);seen.add(key);
  assert.equal(pair.track,track);assert.ok(ids.includes(pair.vehicle));
  assert.ok(pair.seed===37||pair.seed===91&&representativeIds.includes(pair.vehicle),'예상하지 않은 시드/차량: '+key);
  assert.equal(pair.budget,expectedBudget(pair.seed,pair.vehicle),'차량별 예정 예산 불일치: '+key);
  assert.ok(Number.isFinite(pair.baseline.score)&&Number.isFinite(pair.candidate.score));
  assert.ok(Math.abs(pair.scoreDifference-(pair.candidate.score-pair.baseline.score))<1e-9);
  for(const arm of ['baseline','candidate']){
   const o=pair[arm].observations;assert.equal(o.evaluations,pair.budget);assert.equal(o.valid+o.failed,pair.budget);
   assert.ok(Number.isFinite(o.validEligibleOverlapSeconds)&&o.validEligibleOverlapSeconds>=0);
   assert.ok(o.validEligibleOverlapSeconds<=o.eligibleOverlapSeconds+1e-9);
  }
 }
 for(const id of ids)assert.ok(seen.has('37/'+id),'시드 37 누락: '+id);
 for(const id of representativeIds)assert.ok(seen.has('91/'+id),'시드 91 누락: '+id);
 for(const arm of ['baseline','candidate'])assert.equal(comparison.aggregate[arm].evaluations,880);
 assert.equal(comparison.matchedPairs.reduce((sum,p)=>sum+2*p.budget,0),1760);
 const cohorts=comparison.mutationExposureCohorts;
 assert.equal(cohorts?.initialGenerationOnly.pairCount,8);assert.equal(cohorts?.beyondInitialGeneration.pairCount,12);
 for(const arm of ['baseline','candidate']){assert.equal(cohorts.initialGenerationOnly[arm].evaluations,160);assert.equal(cohorts.beyondInitialGeneration[arm].evaluations,720);}
 for(const pair of comparison.matchedPairs){
  assert.equal(pair.mutationExposure.first20GenomeAndResultParity,true,'첫 세대가 달라진 비교가 있습니다.');
  if(pair.budget===20){assert.equal(pair.mutationExposure.cohort,'initial-generation-regression-only');assert.equal(pair.mutationExposure.dedicatedCandidates,0);}
 }
 const accounting=comparison.physicalEvaluationAccounting;
 assert.equal(accounting?.selectedCompletedEvaluations,1760);assert.equal(accounting.excludedCompletedEvaluations,600);assert.equal(accounting.pilotEvaluations,20);assert.equal(accounting.allCompletedEvaluationsIncludingPilot,2380);
 return ids;
}
function auditCopy(run,relative,raw){
 if(!run.postRunAudit)return null;
 const audit=run.postRunAudit,originalFile=path.resolve(repo,audit.originalFile),allowed=path.join(repo,'output/drift-qa')+path.sep;
 assert.ok(originalFile.startsWith(allowed));const originalBytes=fs.readFileSync(originalFile),original=JSON.parse(originalBytes);
 assert.equal(sha(originalBytes),audit.originalSha256);assert.equal(original.stopped,'error');
 assert.ok(original.error.startsWith('Error: Source changed during benchmark: evolving_drift/runtime.js\n'));
 assert.equal(audit.originalError,original.error);assert.equal(audit.originalStopped,original.stopped);
 assert.equal(audit.additionalSimulations,0);assert.equal(audit.remainingReservations,0);assert.deepEqual(audit.changedSources,['evolving_drift/runtime.js']);
 for(const key of ['evaluated','rows','completedEvaluations','reservedEvaluations'])assert.equal(audit[key],run.evaluated);
 assert.equal(original.completionOrder.length,run.evaluated);assert.equal(new Set(original.completionOrder).size,run.evaluated);
 assert.equal(original.reservations.reduce((n,r)=>n+r.evaluated,0),run.evaluated);assert.equal(original.remainingReservations,0);
 const verifiedRuntime=runtimeEquivalent(original.sourceHashes['evolving_drift/runtime.js'],audit.runtime.after.sha256);
 assert.deepEqual(audit.runtime,verifiedRuntime,'RELEASE/개행 이외의 runtime 차이는 허용하지 않습니다.');
 assert.deepEqual(run,{...original,stopped:'budget-exhausted',error:null,postRunAudit:audit,files:{...original.files,report:relative}},'감사 복사본의 평가 내용이 원본과 달라졌습니다.');
 const manifestFile=path.resolve(repo,relative).replace(/\.json$/,'-manifest.json'),manifestBytes=fs.readFileSync(manifestFile),manifest=JSON.parse(manifestBytes);
 assert.deepEqual(manifest,{...audit,auditedFile:relative,auditedSha256:sha(raw)});
 return {...audit,manifest:{path:path.relative(repo,manifestFile).replaceAll(path.sep,'/'),sha256:sha(manifestBytes)}};
}
function loadRun(relative,pair,arm){
 const file=path.resolve(repo,relative),allowed=path.join(repo,'output/drift-qa')+path.sep;
 assert.ok(file.startsWith(allowed),'측정 보고서 경로가 실험 폴더 밖입니다.');
 const raw=fs.readFileSync(file),run=JSON.parse(raw);
 assert.equal(run.stopped,'budget-exhausted');assert.equal(run.error,null);assert.equal(run.config.arm,arm);
 for(const field of ['seed','vehicle','track'])assert.equal(run.config[field],pair[field]);
 assert.equal(run.config.budget,pair.budget);assert.equal(run.evaluated,pair.budget);assert.equal(run.rows.length,pair.budget);
 assert.equal(run.startupEvaluations,0);assert.ok(Object.values(run.startupCalls).every(n=>n===0));assert.equal(run.failureScoreViolations,0);
 assert.equal(run.best.valid,true);assert.equal(run.best.status,'finished');assert.equal(run.best.score,pair[arm].score);
 for(const row of run.rows)if(!row.accepted||!row.valid||row.status!=='finished')assert.equal(row.score,0,'실패 점수는 무효여야 합니다.');
 assert.deepEqual(require('./summarize-pedal-overlap-study.cjs').observations(run.rows),pair[arm].observations);
 const postRunAudit=auditCopy(run,relative,raw);assert.deepEqual(run.postRunAudit||null,pair[arm].postRunAudit||null);
 return {run,evidence:{path:relative,sha256:sha(raw),reproductionHash:run.reproductionHash,postRunAudit}};
}
function browserEvidence(qa){
 const relative=qa.browserEvidence,file=path.resolve(repo,relative),e=readJSON(file);assert.equal(e.release,qa.release);
 assert.deepEqual(e.errors,[]);assert.equal(e.found.autostart,true);assert.equal(e.atClutchHidden,true);
 const overlapVerified=e.overlapVerified===true;
 if(overlapVerified){
  assert.equal(e.found.mutation.family,'pedal-overlap');
  assert.ok(e.inputs.s>=e.found.mutation.start&&e.inputs.s<=e.found.mutation.end,'UI 입력은 실제 변이 구간에서 확인해야 합니다.');
  for(const key of ['throttle','brake','clutch']){
   assert.ok(Math.abs(e.inputs.actual[key]-e.inputs.expected[key])<1e-12);
   assert.equal(Number(e.inputs.gauges[key].aria),Math.round(e.inputs.actual[key]*100));
  }
  assert.ok(e.inputs.actual.throttle>.15&&e.inputs.actual.brake>.03);
 }else{
  assert.equal(e.overlapVerified,false);assert.ok(typeof e.limitation==='string'&&e.limitation.length>0,'미확인 UI 입력에는 확인하지 못한 범위가 필요합니다.');
 }
 for(const width of [320,390,1280])assert.ok(e.layouts.some(l=>l.width===width&&l.scrollWidth<=width));
 const clientRelative=qa.clientEvidence,clientFile=path.resolve(repo,clientRelative),client=readJSON(clientFile);assert.equal(client.release,qa.release);
 assert.equal(client.evolving,true);assert.equal(client.preparedBaseline,true);assert.equal(client.replay.autoFollow,true);
 return {release:e.release,autoStart:true,highestRecordAutoReplay:true,atClutchHidden:true,viewportWidths:e.layouts.map(l=>l.width),horizontalOverflow:false,
  overlapVerified,limitation:e.limitation||null,mutationFamily:e.found.mutation?.family||null,replayId:e.inputs?.replay?.id||null,progressM:e.inputs?.s??null,actualInputs:e.inputs?.actual||null,gauges:e.inputs?.gauges||null,consoleErrors:e.errors,
  source:{path:relative,sha256:sha(fs.readFileSync(file))},clientSource:{path:clientRelative,sha256:sha(fs.readFileSync(clientFile))},note:'로컬 UI 증거의 선택 필드입니다. 경로는 출처 식별용이며 공개 다운로드 링크가 아닙니다.'};
}
function rejectedResults(comparison,pairs){
 const outcome={evaluations:0,pairs:0,higher:0,lower:0,equal:0,baselineLowSpeedSeconds:0,candidateLowSpeedSeconds:0,runs:[]};
 for(const row of comparison.physicalEvaluationAccounting.excludedRuns){
  const file=path.resolve(repo,row.report);assert.ok(file.startsWith(path.join(repo,'output/drift-qa')+path.sep));
  const bytes=fs.readFileSync(file),run=JSON.parse(bytes),pair=pairs.find(p=>p.seed===run.config.seed&&p.vehicle===run.config.vehicle&&p.budget===run.evaluated);
  assert.ok(pair);assert.equal(run.config.arm,'candidate');assert.equal(run.stopped,'budget-exhausted');assert.equal(run.error,null);assert.equal(run.evaluated,run.rows.length);assert.equal(run.best.valid,true);
  assert.equal(run.config.sourceRef,null);assert.equal(run.genesisGeneHash,pair.genesisGeneHash);assert.equal(run.preparedFingerprint,pair.preparedFingerprint);
  assert.equal(run.signatures.physics,pair.physicsSignature);assert.equal(run.signatures.fitness,pair.fitnessSignature);
  const delta=run.best.score-pair.baseline.score,lowSpeed=run.rows.reduce((n,r)=>n+r.overlap.lowSpeedSeconds,0);
  outcome.evaluations+=run.evaluated;outcome.pairs++;outcome[delta>1e-9?'higher':delta< -1e-9?'lower':'equal']++;
  outcome.baselineLowSpeedSeconds+=pair.baseline.observations.lowSpeedSeconds;outcome.candidateLowSpeedSeconds+=lowSpeed;
  outcome.runs.push({vehicle:run.config.vehicle,seed:run.config.seed,budget:run.evaluated,baselineScore:pair.baseline.score,rejectedScore:run.best.score,delta,lowSpeedSeconds:lowSpeed,report:row.report,sha256:sha(bytes)});
 }
 assert.equal(outcome.evaluations,600);assert.equal(outcome.pairs,14);assert.equal(outcome.higher,2);assert.equal(outcome.lower,12);assert.equal(outcome.equal,0);
 assert.ok(outcome.candidateLowSpeedSeconds>outcome.baselineLowSpeedSeconds);
 return outcome;
}
function build(comparison,inputBytes,source=input){
 const ids=validateComparison(comparison),firstPair=comparison.matchedPairs[0];
 const qa=comparison.publication?.qa;
 assert.equal(qa?.complete,true,'최종 QA가 완료되지 않아 공개하지 않습니다.');
 assert.equal(qa.tests.failed,0);assert.equal(qa.tests.passed,146);assert.equal(qa.tests.groups.reduce((n,g)=>n+g.passed,0),146);
 assert.deepEqual(qa.tests.groups.map(g=>g.passed).sort((a,b)=>a-b),[3,5,37,38,63]);
 assert.equal(qa.prepared.ready,96);assert.equal(qa.prepared.generated,0);assert.equal(qa.prepared.exactReplays,0);assert.equal(qa.release,'pedal-overlap-20261030-2');
 const modules=['evolving_drift/evolution.js','evolving_drift/evolution-strategies.js'];
 const baselineCommit=firstPair.baselineSources[modules[0]].commit,candidateHashes={...firstPair.candidateSources};
 // Captured hashes identify the measured implementation, including rejected
 // iterations. Never substitute the current working tree for archived code.
 assert.match(baselineCommit,/^[a-f0-9]{40}$/);assert.deepEqual(Object.keys(candidateHashes).sort(),modules.slice().sort());
 for(const hash of Object.values(candidateHashes))assert.match(hash,/^[a-f0-9]{64}$/);
 const candidateCommit=comparison.publication?.candidateRevision||null;
 if(candidateCommit!==null)assert.match(candidateCommit,/^[a-f0-9]{7,40}$/);
 const allRows={baseline:[],candidate:[]},cohortRows={initialGenerationOnly:{baseline:[],candidate:[]},beyondInitialGeneration:{baseline:[],candidate:[]}},pairs=comparison.matchedPairs.map(pair=>{
  const b=loadRun(pair.baseline.report,pair,'baseline'),c=loadRun(pair.candidate.report,pair,'candidate');
  assert.deepEqual(b.run.signatures,c.run.signatures);assert.equal(b.run.preparedFingerprint,c.run.preparedFingerprint);assert.equal(b.run.genesisGeneHash,c.run.genesisGeneHash);
  for(const key of ['workers','populationSize','noLearning','noTrajectory','noCache','stopOnSuccess'])assert.equal(b.run.config[key],c.run.config[key]);
  assert.ok(b.run.config.sourceRef);assert.ok(!c.run.config.sourceRef);assert.deepEqual(c.run.frozenSources,{});
  assert.deepEqual(Object.keys(b.run.frozenSources).sort(),modules.slice().sort());
  for(const file of modules){assert.equal(b.run.frozenSources[file].commit,baselineCommit);assert.equal(c.run.sourceHashes[file],candidateHashes[file]);assert.equal(pair.candidateSources[file],candidateHashes[file]);}
  const releaseAudits=[];
  for(const [file,hash]of Object.entries(b.run.sourceHashes))if(c.run.sourceHashes[file]!==hash){
   assert.equal(file,'evolving_drift/runtime.js','공통 소스 불일치: '+file);
   releaseAudits.push({file,...runtimeEquivalent(hash,c.run.sourceHashes[file])});
  }
  assert.deepEqual(pair.releaseAudits,releaseAudits);
  const parity=b.run.rows.slice(0,20).every((row,i)=>['id','parentId','kind','geneHash','status','valid'].every(key=>row[key]===c.run.rows[i][key])&&Math.abs(row.score-c.run.rows[i].score)<1e-9);
  assert.equal(parity,true);assert.equal(pair.mutationExposure.dedicatedCandidates,c.run.rows.filter(r=>r.mutation?.family==='pedal-overlap').length);
  allRows.baseline.push(...b.run.rows);allRows.candidate.push(...c.run.rows);
  const cohort=pair.budget===20?'initialGenerationOnly':'beyondInitialGeneration';cohortRows[cohort].baseline.push(...b.run.rows);cohortRows[cohort].candidate.push(...c.run.rows);
  return {...pair,label:labels[pair.vehicle]||pair.vehicle,baseline:{...pair.baseline,connections:b.run.connections,evidence:b.evidence},candidate:{...pair.candidate,connections:c.run.connections,evidence:c.evidence}};
 }).sort((a,b)=>a.seed-b.seed||ids.indexOf(a.vehicle)-ids.indexOf(b.vehicle));
 const observations=require('./summarize-pedal-overlap-study.cjs').observations;
 for(const arm of ['baseline','candidate'])assert.deepEqual(observations(allRows[arm]),comparison.aggregate[arm]);
 for(const cohort of Object.keys(cohortRows))for(const arm of ['baseline','candidate'])assert.deepEqual(observations(cohortRows[cohort][arm]),comparison.mutationExposureCohorts[cohort][arm]);
 const audits=pairs.flatMap(p=>['baseline','candidate'].map(arm=>p[arm].evidence.postRunAudit).filter(Boolean));
 assert.equal(audits.length,2);assert.equal(audits.reduce((n,a)=>n+a.evaluated,0),80);
 const epsilon=1e-9,scoreOutcomes={higher:0,lower:0,equal:0,tolerance:epsilon};
 for(const p of pairs)scoreOutcomes[p.scoreDifference>epsilon?'higher':p.scoreDifference< -epsilon?'lower':'equal']++;
 const searchScoreOutcomes={higher:0,lower:0,equal:0,tolerance:epsilon};
 for(const p of pairs.filter(p=>p.budget>20))searchScoreOutcomes[p.scoreDifference>epsilon?'higher':p.scoreDifference< -epsilon?'lower':'equal']++;
 return {...comparison,schema:2,status:'completed',publishedAt:new Date().toISOString(),title:'악셀·브레이크 동시 입력 변이 비교',courseLabel:'영암 KIC T21',matchedPairs:pairs,scoreOutcomes,
  revisions:{baseline:baselineCommit,candidate:candidateCommit,candidateSources:candidateHashes,candidateRevisionNote:'선택적 커밋 표기는 후속 publication 설정이며 실제 비교 코드 식별자는 실행 중 기록한 sourceHashes입니다.'},sourceComparison:{path:path.relative(repo,source).replaceAll(path.sep,'/'),sha256:sha(inputBytes)},
  searchScoreOutcomes,rejectedComparison:rejectedResults(comparison,pairs),verifiedAuditEvaluations:80,
  verification:{automated:{...qa.tests,evidenceKind:'개발 중 실행 결과 요약; 전체 원시 로그 파일은 별도 보존하지 않음',commandPrefix:'node --test evolving_drift/'},
   prepared:{...qa.prepared,command:'node evolving_drift/build-grips.cjs --check --development',evidenceKind:'개발 중 실행 결과 요약',scope:'사전 계산 기록 호환성 검사이며 96개 전체를 다시 물리 재생한 검사는 아님'},browser:browserEvidence(qa)},
  interpretation:{primaryMetric:'유효 완주한 후보에서 실제 악셀·브레이크 입력이 동시에 발생했고 실시간 채점이 득점 중이었던 시간',
   noCausalClaim:'동시 입력 탐색·실행이 가능해진 사실과 대표 점수·완주율 개선의 인과관계는 별개입니다.',
   connectionProgress:'최대 코너/직선 coverage는 유효 완주 후보의 진단 최댓값이며 서로 다른 후보에서 나올 수 있습니다. 100% coverage만으로 완전 연결 성공은 아닙니다.',
   earlySubset:'시드 37 첫 20회는 본 평가의 부분집합입니다. 총 1,760회에 다시 합산하지 않습니다.',
   limitations:['단일 코스·두 시드·차량별 20~100회의 제한된 비교로 장기 수렴이나 실차 성능을 일반화할 수 없습니다.','같은 시드라도 새 변이가 난수를 소비하면서 이후 탐색 경로가 달라집니다. 동일 후보의 일대일 대조가 아닙니다.','한 실행의 후보들은 공통 부모를 가지므로 독립 표본이 아닙니다. 차량별 평가 예산도 서로 다릅니다.','물리·채점·순정 사양·준비된 시작값은 같지만 비교 대상은 전용 변이와 기존 입력 보존을 함께 적용한 변경입니다.','실패 주행의 잠정 득점 시간은 진단용으로만 보존했습니다. 확정 점수와 유효 성과에는 넣지 않았습니다.']}};
}
function render(report,outputName=stem){
 const cohort=report.mutationExposureCohorts.beyondInitialGeneration,b=cohort.baseline,c=cohort.candidate,w=report.searchScoreOutcomes,ui=report.verification.browser;
 const arrow=(left,right,places=0)=>`${number(left,places)} <span class="arrow" aria-label="변경 후">→</span> ${number(right,places)}`;
 const metric=(label,left,right,places=0,suffix='')=>`<div class="card"><span>${escaped(label)}</span><strong>${arrow(left,right,places)}${escaped(suffix)}</strong></div>`;
 const row=p=>{
  const a=p.baseline,o=p.candidate,A=a.observations,O=o.observations,ac=a.connections,oc=o.connections;
  return `<tr><th scope="row">${escaped(p.label)}<small>각 ${number(p.budget)}회 평가</small><small>${p.budget===20?'초기 세대 회귀 확인':'전용 변이 '+number(p.mutationExposure.dedicatedCandidates)+'개'}</small></th><td data-label="대표 점수"><div class="cell-value">${arrow(a.score,o.score,2)}</div></td><td data-label="유효 완주율"><div class="cell-value">${arrow(fraction(A.valid,p.budget),fraction(O.valid,p.budget),1)}%<small>실패 ${arrow(A.failed,O.failed)}건</small></div></td><td data-label="유효 득점 중 동시 입력"><div class="cell-value">${arrow(A.validEligibleOverlapSeconds,O.validEligibleOverlapSeconds,2)}초<small>해당 후보 ${arrow(A.validEligibleOverlapCandidates,O.validEligibleOverlapCandidates)}개</small></div></td><td data-label="연결 진척"><div class="cell-value">코너 ${arrow(ac.maximumCornerCoverage*100,oc.maximumCornerCoverage*100,1)}%<small>직선 ${arrow(ac.maximumLinkCoverage*100,oc.maximumLinkCoverage*100,1)}%</small><small>전체 연결 ${arrow(A.validCompleteRuns,O.validCompleteRuns)}개</small></div></td></tr>`;
 };
 const table=(pairs,caption)=>`<div class="table-scroll"><table><caption>${escaped(caption)}</caption><thead><tr><th scope="col">차량 · 군별 예산</th><th scope="col">대표 점수</th><th scope="col">유효 완주율</th><th scope="col">유효 득점 중 동시 입력</th><th scope="col">연결 진척</th></tr></thead><tbody>${pairs.map(row).join('')}</tbody></table></div>`;
 const f=c.families['pedal-overlap']||{},early=report.seed37First20;
 const rejected=report.rejectedComparison,uiNote=ui.overlapVerified?`실제 변이 구간의 악셀 ${number(ui.actualInputs.throttle*100)}%·브레이크 ${number(ui.actualInputs.brake*100)}%가 계기판과 일치했습니다.`:`이번 UI 확인에서는 자연 발생한 유효 동시 입력 후보의 계기판 검증을 완료하지 못했습니다. ${escaped(ui.limitation)}`;
 const connectionNote=b.validCompleteRuns===0&&c.validCompleteRuns===0?'두 군 모두 코너와 직선을 전부 연결한 유효 후보는 0개였습니다. 완전 연결이나 장기 수렴 개선을 입증한 결과는 아닙니다.':`전체 연결 유효 후보는 기존 ${number(b.validCompleteRuns)}개, 변경 후 ${number(c.validCompleteRuns)}개였습니다. 이 제한된 실행만으로 일반적인 연결 성공률을 단정하지 않습니다.`;
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>동시 페달 입력 변이 비교 — 2026-10-30</title><style>
 :root{font-family:system-ui,sans-serif;color:#172b2b;background:#f3f6f4;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:36px 22px 56px}h1{font-size:clamp(1.9rem,4vw,2.7rem);line-height:1.25;letter-spacing:-.04em}h2{font-size:1.3rem;margin:34px 0 12px}h3{font-size:1.05rem}p,li{line-height:1.75}.eyebrow,small,footer{color:#52655e}small{display:block;font-size:.82rem;line-height:1.6}.note{border-left:4px solid #ad741d;background:#fff7e4;padding:14px 18px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}.card{background:white;border:1px solid #d3ded8;border-radius:10px;padding:17px}.card strong{display:block;font-size:clamp(1.15rem,2.5vw,1.6rem);margin-top:8px}.card>span{color:#52655e;font-size:.9rem}.arrow{color:#6a7973;padding:0 .2em}.table-scroll{overflow:auto;background:white;border:1px solid #d3ded8;border-radius:10px}table{width:100%;border-collapse:collapse;font-size:.9rem}caption{text-align:left;padding:13px;color:#52655e;font-size:.85rem}th,td{padding:13px;text-align:left;vertical-align:top;border-bottom:1px solid #e3eae6}thead th{background:#e9f0eb}tbody th{min-width:150px;font-weight:600}a{color:#066750}details{margin:24px 0}summary{font-weight:650;cursor:pointer}code{overflow-wrap:anywhere}footer{margin-top:36px;border-top:1px solid #ccd7d0;padding-top:16px;font-size:.85rem}ul{padding-left:1.3rem}.definition{font-size:.9rem;color:#52655e}
 @media(max-width:650px){main{padding:24px 14px 40px}.cards{gap:8px}.card{padding:12px}.card strong{font-size:1.1rem}.table-scroll{overflow:visible}table,tbody{display:block}thead{display:none}caption{display:block}tr{display:grid;grid-template-columns:1fr;border-top:1px solid #d3ded8;padding:8px 12px}tbody th{display:block;background:#e9f0eb;margin:0 -12px 6px;padding:10px 12px;border:0}td{display:grid;grid-template-columns:minmax(95px,.9fr) 1.2fr;column-gap:8px;padding:7px 0;border:0}td::before{content:attr(data-label);color:#52655e;font-size:.82rem}td small{grid-column:2}td>span:not(.arrow){grid-column:2}td .arrow{padding:0}.card .arrow{padding:0 .1em}}
 </style></head><body><main><p class="eyebrow">EVOLVING DRIFT · 검증 결과 · 2026-10-30 · 영암 KIC T21</p><h1>악셀·브레이크 동시 입력,<br>변이를 넓힌 뒤 비교했습니다.</h1><p>16개 순정 후륜 사양의 20개 조합에서 같은 예산으로 비교했습니다. 첫 세대만 확인한 8개 조합은 초기 탐색의 회귀 검사입니다. 40~100회까지 진행한 나머지 12개 조합에서 대표 점수 상승 ${w.higher}개·하락 ${w.lower}개·동률 ${w.equal}개였으며, 아래 핵심 지표도 이 12개 조합을 기준으로 봅니다.</p><p class="note">${connectionNote}</p>
 <div class="cards"><div class="card"><span>비교에 포함한 실제 평가</span><strong>1,760회</strong><small>기존 880회 + 변경 후 880회</small></div>${metric('유효 득점 중 동시 입력',b.validEligibleOverlapSeconds,c.validEligibleOverlapSeconds,2,'초')}${metric('유효 완주율',fraction(b.valid,b.evaluations),fraction(c.valid,c.evaluations),1,'%')}${metric('코스 이탈 후보',b.offtrack,c.offtrack,0,'개')}</div>
 <p class="definition">카드의 득점 중 동시 입력·완주율·코스 이탈은 두 번째 세대까지 평가한 12개 조합, 군별 720회 기준입니다. 첫 세대만 평가한 8사양·군별 160회는 포함하지 않습니다. 모든 비교의 첫 20개 유전자와 결과는 기존과 동일했습니다. 이 동률은 새 변이의 성능 개선을 뜻하지 않습니다.</p><p class="note">전체 군별 880회 기준으로 제한시간 초과는 ${arrow(report.aggregate.baseline.timeout,report.aggregate.candidate.timeout)}개, 저속 구간이 있었던 후보는 ${arrow(report.aggregate.baseline.lowSpeedCandidates,report.aggregate.candidate.lowSpeedCandidates)}개로 늘었습니다. 저속은 코스 80m 이후 28.8km/h 미만입니다. 코스 이탈이 줄어도 시간 초과와 저속 문제가 함께 개선된 것은 아닙니다.</p><h2>어떤 입력을 측정했나요?</h2><p>이 보고서의 동시 입력은 실제 주행 기록에서 <strong>악셀 15% 초과·브레이크 3% 초과</strong>인 순간입니다. 핵심 시간 지표는 그중 <strong>유효 완주한 후보가 실제로 득점하던 시간</strong>만 합산합니다. 유전자에 겹치는 페달 값을 넣은 것과 차량에서 실행된 것은 따로 셉니다.</p><p>변경 후 전용 변이 후보 ${number(f.count||0)}개 중 실제 동시 입력을 실행한 후보는 ${number(f.executedCandidates||0)}개, 유효 완주하며 동시 입력 중 득점한 후보는 ${number(f.validEligibleCandidates||0)}개였습니다. 이 후보들의 해당 시간은 ${number(f.validEligibleOverlapSeconds||0,2)}초입니다. 입력 실행이 늘어도 점수·완주율 개선의 원인이 그 입력이라고 단정할 수는 없습니다.</p>
 <h2>시드 37 · 전체 16사양</h2><p>모든 값은 <strong>기존 → 변경 후</strong> 순서입니다. 각 군에서 대표 4사양은 100회, G80·아이오닉 5의 4사양은 40회, 나머지 8사양은 20회입니다. 20회 행에는 새 전용 변이가 없으므로 초기 탐색이 유지되는지만 확인합니다. 같은 차량의 두 군은 동일한 횟수로 비교했습니다.</p>${table(report.matchedPairs.filter(p=>p.seed===37),'대표 점수는 각 실행의 최고 유효 완주 기록입니다. 시간은 유효 후보 전체의 합계입니다.')}
 <h2>시드 91 · 대표 4사양</h2><p>다른 시드에서 각 군 40회씩 비교했습니다. 시드 37의 후보를 시작값으로 재사용하지 않았습니다.</p>${table(report.matchedPairs.filter(p=>p.seed===91),'차량마다 기존 40회와 변경 후 40회를 비교했습니다.')}
 <p class="definition">연결 진척은 유효 완주 후보에서 측정한 코너·직선 연결률의 최댓값입니다. 두 값이 같은 후보의 기록일 필요는 없고, 연결률 100%만으로 속도·궤적·연속 조건을 모두 만족했다는 뜻은 아닙니다. ‘전체 연결’은 실제 완전 연결 조건을 만족한 후보 수입니다.</p>
 <details><summary>첫 20회만 같은 길이로 보면</summary><p>시드 37의 16사양에서 각 실행의 첫 20회, 군별 320회를 잘라 본 진단입니다. 위 1,760회에 이미 포함되어 있으므로 다시 더하지 않습니다.</p><p>유효 완주율 ${arrow(fraction(early.baseline.valid,early.baseline.evaluations),fraction(early.candidate.valid,early.candidate.evaluations),1)}%, 유효 득점 중 동시 입력 시간 ${arrow(early.baseline.validEligibleOverlapSeconds,early.candidate.validEligibleOverlapSeconds,2)}초였습니다.</p></details>
 <h2>첫 구현을 수정한 이유</h2><p>채택하지 않은 첫 구현도 ${number(rejected.evaluations)}회 결과를 보존했습니다. 14개 같은 예산 비교에서 대표 점수는 ${rejected.higher}개 상승·${rejected.lower}개 하락했고, 80m 이후 저속(28.8km/h 미만) 시간은 ${arrow(rejected.baselineLowSpeedSeconds,rejected.candidateLowSpeedSeconds,1)}초로 늘었습니다. 그립 주행만 하던 부모에 페달 변이 예산을 쓰고 그립 중 동시 입력까지 보존한 문제가 보여, 실제 득점 드리프트가 4m·0.15초 이상 이어진 부모·구간으로 적용 대상을 좁혔습니다.</p><h2>검증과 해석 범위</h2><ul><li>선택한 자동 검사 ${number(report.verification.automated.passed)}개가 통과했습니다. 실제 물리 입력·클러치 보존·캐시와 전체 재생 일치·기존 감속 복구 회귀를 포함합니다.</li><li>사전 계산된 시작 기록 96개의 호환성을 확인했습니다. 생성 0건이며, 이 검사에서 96개 전부를 다시 물리 재생하지는 않았습니다.</li><li>UI에서 ${uiNote} 자동 차량의 클러치 게이지 숨김을 확인했습니다. 320·390·1,280px에서 가로 넘침과 콘솔 오류가 없었습니다.</li><li>한 코스·두 시드·차량별 20~100회입니다. 후보들은 공통 부모를 가지며 독립 표본이 아닙니다. 장기 수렴이나 실차 성능 향상을 일반화하지 않습니다.</li><li>두 군의 물리·채점·유전자 형식·그립 시작값은 같습니다. 새 변이는 난수 소비를 바꾸므로 이후 후보 경로는 달라집니다. 전용 변이와 기존 입력 보존을 묶어 비교했기 때문에 각 기능의 효과를 따로 입증하지는 못합니다.</li><li>실패 주행의 잠정 득점은 확정 점수나 유효 성과에 넣지 않았습니다. 별도 파일럿과 채택하지 않은 이전 구현의 실행은 최종 비교 예산에 합산하지 않고 JSON에 따로 남겼습니다. 실제 완료된 전체 평가는 ${number(report.physicalEvaluationAccounting?.allCompletedEvaluationsIncludingPilot||1760)}회이며, 그중 이전 구현 등 비교 제외 실행은 ${number(report.physicalEvaluationAccounting?.excludedCompletedEvaluations||0)}회, 파일럿은 ${number(report.physicalEvaluationAccounting?.pilotEvaluations||0)}회입니다. 비교에 선택된 각 실행은 정해진 예산을 모두 마쳤습니다.</li></ul>
 <details><summary>완료 후 배포 표식 변경을 감사한 80회</summary><p>시드 91의 포터 LPG 6MT·M2 6MT 기준군은 각각 40회를 모두 마친 뒤, 최종 파일 검사에서 배포 버전 표식 변경이 발견됐습니다. 원본 오류 보고서를 보존하고 실제 바이트를 대조해 RELEASE 문자열과 CRLF/LF 이외의 실행 로직은 동일함을 확인했습니다. 원본·감사 복사본의 해시와 감사 내용을 JSON에 남겼고 추가 시뮬레이션은 0회입니다. 이 80회는 최종 1,760회에 한 번만 포함했습니다.</p></details><p><a href="${outputName}.json" download>측정·검증 요약 JSON 다운로드</a> · <a href="../evolving_drift_doc.html">설명과 자료</a></p><details><summary>비교 소스와 재현 기준</summary><p>기존 <code>${escaped(report.revisions.baseline)}</code><br>변경 후 <code>${escaped(report.revisions.candidate||'실행 기록의 sourceHashes 참조')}</code></p><p>기준군은 이전 <code>evolution.js</code>와 <code>evolution-strategies.js</code>를 별도로 고정했습니다. 매 실행은 준비된 그립에서 시작하고 20개 후보를 예약한 순서로 평가 결과를 수락합니다. 물리·채점 서명과 준비된 시작값의 해시가 일치하는 쌍만 공개했습니다.</p><p>JSON에는 원본 보고서 SHA-256, 시드·예산·유효성·서명, UI 증거 요약을 남겼습니다. 로컬 원본 경로는 출처 식별자이며 공개 링크가 아닙니다. 자동 검사와 96개 기록 확인은 실행 결과 요약이며 전체 원시 로그를 별도 보존하지 않았습니다.</p></details><footer>공개 보고서 생성 ${escaped(report.publishedAt)} · 결과가 모두 완료된 20쌍·1,760회일 때만 생성합니다.</footer></main></body></html>`;
}
function main(){
 const args=process.argv.slice(2),options={input,name:stem};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--input'&&args[i+1])options.input=path.resolve(repo,args[++i]);
  else if(args[i]==='--name'&&args[i+1])options.name=args[++i];
  else if(args[i]==='--metadata'&&args[i+1])options.metadata=path.resolve(repo,args[++i]);
  else throw Error('Usage: node render-pedal-overlap-report.cjs [--input comparison.json] [--name public-output-name] [--metadata qa-publication.json]');
 }
 assert.match(options.name,/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
 const bytes=fs.readFileSync(options.input),comparison=JSON.parse(bytes);
 if(options.metadata){const metadataBytes=fs.readFileSync(options.metadata);comparison.publication=JSON.parse(metadataBytes);comparison.publicationSource={path:path.relative(repo,options.metadata).replaceAll(path.sep,'/'),sha256:sha(metadataBytes)};}
 const report=build(comparison,bytes,options.input),html=render(report,options.name);
 fs.mkdirSync(directory,{recursive:true});
 const jsonFile=path.join(directory,options.name+'.json'),htmlFile=path.join(directory,options.name+'.html');
 // Validation and rendering both finish before either public output is touched.
 fs.writeFileSync(jsonFile+'.tmp',JSON.stringify(report,(_,v)=>typeof v==='string'?v.replaceAll(repo,'.'):v,2));fs.writeFileSync(htmlFile+'.tmp',html);
 fs.renameSync(jsonFile+'.tmp',jsonFile);fs.renameSync(htmlFile+'.tmp',htmlFile);
 console.log(JSON.stringify({status:report.status,pairs:report.matchedPairs.length,evaluations:report.evaluations,scoreOutcomes:report.scoreOutcomes,files:[jsonFile,htmlFile].map(p=>path.relative(repo,p))}));
}
if(require.main===module)try{main();}catch(error){console.error('공개 보고서 생성 거부: '+(error.stack||String(error)));process.exitCode=1;}
module.exports={validateComparison,build,render};
