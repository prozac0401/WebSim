'use strict';
// I/O-only recovery wrapper. The frozen study, RNG, genes, physics and scoring
// are unchanged. A Windows destination lock retries the same rename operation,
// never an evaluated candidate or search decision.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const tool=path.join(__dirname,'compare-coarse-line-search.cjs');
const expectedToolSha='5adc402a7057eb395aa85e2d28731fd9b1a055a85cce0ecac81f0f249bfc322b';
if(sha(fs.readFileSync(tool))!==expectedToolSha)throw Error('Frozen study source changed.');
const originalRename=fs.renameSync,pause=new Int32Array(new SharedArrayBuffer(4));
const io={scope:'fs.renameSync only; EPERM/EACCES/EBUSY retry of same file replacement; no physical-trial retry',retryCount:0,events:[]};
fs.renameSync=function(from,to){
 for(let attempt=0;;attempt++)try{return originalRename.call(fs,from,to);}catch(error){
  if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=49)throw error;
  io.retryCount++;io.events.push({attempt:attempt+1,code:error.code,destination:String(to)});
  Atomics.wait(pause,0,0,Math.min(250,20*Math.pow(1.5,attempt)));
 }
};
const Study=require(tool),options=Study.args(process.argv.slice(2)),metadataFile=options.out+'.io-recovery.json';
const metadata={schema:1,launcherSha256:sha(fs.readFileSync(__filename)),frozenToolSha256:expectedToolSha,options,startedAt:new Date().toISOString(),io,status:'running'};
fs.mkdirSync(path.dirname(metadataFile),{recursive:true});fs.writeFileSync(metadataFile,JSON.stringify(metadata,null,2));
Study.main(options).then(report=>{
 metadata.finishedAt=new Date().toISOString();metadata.status=report.status;metadata.physicalEvaluations=report.physicalEvaluations;
 metadata.toolVerifiedAtEnd=sha(fs.readFileSync(tool))===expectedToolSha;fs.writeFileSync(metadataFile,JSON.stringify(metadata,null,2));
 console.log(JSON.stringify({ioRecovery:metadataFile,retryCount:io.retryCount,toolVerifiedAtEnd:metadata.toolVerifiedAtEnd}));
 if(report.status!=='completed'||!metadata.toolVerifiedAtEnd)process.exitCode=1;
}).catch(error=>{metadata.status='error';metadata.error=error.stack||String(error);fs.writeFileSync(metadataFile,JSON.stringify(metadata,null,2));console.error(error.stack||error);process.exitCode=1;});
