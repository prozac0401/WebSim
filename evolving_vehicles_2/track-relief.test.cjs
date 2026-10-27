'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Relief=require('./track-relief.js');
function data(extra={}){return{sources:[{id:'dem'}],metadata:{terrainReliefGrid:{sourceId:'dem',evidence:'Independent test grid',minX:0,minY:0,spacingM:50,columns:3,rows:3,heightsAMSL:[100,150,200,200,250,300,300,350,400],...extra}}};}
test('relief grid preserves source samples and applies the display transform exactly once',()=>{
 const d=data(),before=JSON.stringify(d),r=Relief.compile(d,z=>100+(z-100)*1.75);
 assert.equal(r.sample(25,25),231.25);assert.equal(r.sample(50,50),362.5);assert.equal(r.delta(25,25,200),31.25);
 assert.equal(r.sample(-10,25),187.5);assert.equal(r.sample(110,110),625);assert.equal(r.sample(NaN,0),null);assert.equal(JSON.stringify(d),before);
});
test('outside-only relief preserves the whole infield while retaining mountains beyond it',()=>{
 const track={points:[{x:20,y:20},{x:80,y:20},{x:80,y:80},{x:20,y:80}]},r=Relief.compile(data({outsideTrackOnly:true}),z=>z,track);
 assert.equal(r.delta(50,50,100),0);assert.equal(r.delta(90,50,100),190);assert.throws(()=>r.delta(90,50,NaN),/finite/);
});
test('missing, uncited, malformed or unbounded relief cannot change legacy ground',()=>{
 assert.equal(Relief.compile({}),null);for(const p of [{sourceId:'missing'},{evidence:''},{columns:1},{rows:10000},{spacingM:1},{heightsAMSL:[NaN]}, {heightsAMSL:Array(9).fill(10001)}])assert.equal(Relief.compile(data(p)),null);
 assert.equal(Relief.compile(data(),()=>Infinity),null);
});
