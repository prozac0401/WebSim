/* Optional developer watcher. All work runs offline in a fresh Node process. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const development=process.argv.includes('--development');
let child=null,dirty=false,timer=null,closing=false;
function build(){if(closing)return;if(child){dirty=true;return;}dirty=false;child=spawn(process.execPath,[path.join(__dirname,'build-grips.cjs'),...(development?['--development']:[])],{stdio:'inherit',windowsHide:true});child.on('exit',code=>{child=null;if(code===2)console.error('Production courses are not ready; waiting for verified event layouts.');else if(code)console.error('Grip build failed; fix the input and save again.');if(dirty)build();});}
function changed(_,file){if(!file)return;const name=String(file).replace(/\\/g,'/');if(!/\.(?:js|cjs|json)$/.test(name)||name.startsWith('grip-records/')||name==='prepared-grips-manifest.js'||name.endsWith('.test.cjs'))return;clearTimeout(timer);timer=setTimeout(build,250);}
const watchers=['.','../evolving_vehicles','../evolving_vehicles_2'].map(dir=>fs.watch(path.resolve(__dirname,dir),{recursive:true},changed));
function close(){closing=true;clearTimeout(timer);watchers.forEach(w=>w.close());child?.kill();}
process.on('SIGINT',close);process.on('SIGTERM',close);console.log('Watching vehicle, track and physics sources for '+(development?'explicit development':'production')+' offline grip builds.');build();
