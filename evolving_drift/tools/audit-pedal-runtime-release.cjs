'use strict';
// Recover a fully completed benchmark whose final source guard noticed only a
// deployment RELEASE literal change. Originals are immutable; copies declare
// the original error and every audited hash. No simulation is repeated here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),runtimeFile='evolving_drift/runtime.js';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const normalized=text=>text.replace(/\r\n/g,'\n');
const evidenceCache=new Map();
function canonicalRuntime(text){
 const matches=text.match(/const RELEASE='[^']+';/g);if(matches?.length!==1)throw Error('Unexpected runtime RELEASE declaration');
 return normalized(text).replace(/const RELEASE='[^']+';/,"const RELEASE='<release>'; ".trimEnd());
}
function runtimeEvidence(hash,reference='4ed64c3'){
 const key=reference+'/'+hash;if(evidenceCache.has(key))return evidenceCache.get(key);
 const sources=[{origin:'working-tree',text:fs.readFileSync(path.join(repo,runtimeFile),'utf8')},{origin:reference,text:execFileSync('git',['show',reference+':'+runtimeFile],{cwd:repo,encoding:'utf8',windowsHide:true})}];
 for(const source of sources)for(const text of [source.text,normalized(source.text),normalized(source.text).replace(/\n/g,'\r\n')])if(sha(text)===hash){const evidence={sha256:hash,origin:source.origin,release:/const RELEASE='([^']+)';/.exec(text)?.[1],canonicalSha256:sha(canonicalRuntime(text))};evidenceCache.set(key,evidence);return evidence;}
 throw Error('Cannot establish exact runtime bytes for source hash '+hash);
}
function runtimeEquivalent(beforeHash,afterHash,reference='4ed64c3'){
 const before=runtimeEvidence(beforeHash,reference),after=runtimeEvidence(afterHash,reference);
 if(before.canonicalSha256!==after.canonicalSha256)throw Error('Runtime changed beyond RELEASE/line endings');
 return {before,after,allowedDifference:'The RELEASE string and CRLF/LF only; all executable runtime logic is identical.'};
}
function auditReport(original,reference='4ed64c3'){
 const originalFile=path.resolve(repo,original),bytes=fs.readFileSync(originalFile),report=JSON.parse(bytes),currentRuntimeHash=sha(fs.readFileSync(path.join(repo,runtimeFile)));
 if(report.stopped!=='error'||!report.error?.startsWith('Error: Source changed during benchmark: '+runtimeFile+'\n'))throw Error('Only the runtime final-guard error may be recovered');
 if(report.evaluated!==report.config.budget||report.rows.length!==report.evaluated||report.completionOrder.length!==report.evaluated||new Set(report.completionOrder).size!==report.evaluated||report.reservations.reduce((n,r)=>n+r.evaluated,0)!==report.evaluated||report.remainingReservations!==0||report.startupEvaluations!==0)throw Error('The complete budget was not evaluated and preserved');
 if(!report.best.valid||report.best.status!=='finished'||report.rows.some(row=>!row.valid&&row.score!==0))throw Error('Invalid score/representative invariant');
 const changed=[];for(const [file,hash]of Object.entries(report.sourceHashes)){if(sha(fs.readFileSync(path.join(repo,file)))!==hash)changed.push(file);}
 if(changed.length!==1||changed[0]!==runtimeFile)throw Error('Shared source changes beyond runtime: '+changed.join(', '));
 const runtime=runtimeEquivalent(report.sourceHashes[runtimeFile],currentRuntimeHash,reference);
 const copyFile=originalFile.replace(/\.json$/,'-audited.json');if(fs.existsSync(copyFile))throw Error('Audited evidence already exists: '+copyFile);
 const audit={originalFile:path.relative(repo,originalFile).replaceAll(path.sep,'/'),originalSha256:sha(bytes),originalStopped:report.stopped,originalError:report.error,verifiedAt:new Date().toISOString(),evaluated:report.evaluated,rows:report.rows.length,completedEvaluations:report.completionOrder.length,reservedEvaluations:report.reservations.reduce((n,r)=>n+r.evaluated,0),remainingReservations:report.remainingReservations,changedSources:changed,runtime,additionalSimulations:0,explanation:'Every reserved evaluation completed before the final disk-source guard failed. Coordinator/workers had already loaded and cached the original runtime module. Physics, scoring, genome and prepared identities remain unchanged. This copy explicitly accepts only the verified deployment RELEASE change.'};
 const copy={...report,stopped:'budget-exhausted',error:null,postRunAudit:audit,files:{...report.files,report:path.relative(repo,copyFile).replaceAll(path.sep,'/')}};
 fs.writeFileSync(copyFile,JSON.stringify(copy,null,2));
 const manifest={...audit,auditedFile:copy.files.report,auditedSha256:sha(fs.readFileSync(copyFile))};fs.writeFileSync(copyFile.replace(/\.json$/,'-manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}
if(require.main===module){try{for(const file of process.argv.slice(2))console.log(JSON.stringify(auditReport(file)));}catch(error){console.error(error.stack||String(error));process.exitCode=1;}}
module.exports={canonicalRuntime,runtimeEvidence,runtimeEquivalent,auditReport};
