#!/usr/bin/env node
'use strict';
const path=require('node:path'),{execFileSync}=require('node:child_process');
const builders=Object.freeze([
  'build-course-kic.cjs',
  'build-course-inje-sdc.cjs',
  'build-course-kic-sdc.cjs',
  'build-course-ebisu.cjs',
  'build-course-tsukuba.cjs'
]);
function build({check=false}={}){
  for(const builder of builders)execFileSync(process.execPath,[path.join(__dirname,builder),...(check?['--check']:[])],{stdio:'inherit',windowsHide:true});
}
module.exports={builders,build};
if(require.main===module)build({check:process.argv.includes('--check')});
