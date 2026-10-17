const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Activities=require('./activities.js'),Data=require('./data.js');

test('standalone browser catalog exposes the same complete activity definitions as the game',()=>{
  const sandbox={};
  vm.runInNewContext(fs.readFileSync(require.resolve('./activities.js'),'utf8'),sandbox);
  assert.equal(new Set(Activities.ACTIVITIES.map(activity=>activity.id)).size,Activities.ACTIVITIES.length);
  assert.ok(Activities.ACTIVITIES.some(activity=>activity.id==='circuit_drive'));
  assert.equal(JSON.stringify(sandbox.S2Activities.ACTIVITIES),JSON.stringify(Data.ACTIVITIES));
  assert.equal(Data.ACTIVITIES,Activities.ACTIVITIES);
  assert.equal(Data.ACTIVITY_MAP,Activities.ACTIVITY_MAP);
  for(const activity of Activities.ACTIVITIES)assert.equal(Activities.ACTIVITY_MAP[activity.id],activity);
});

test('season2 page loads its catalog dependency before constructing game data',()=>{
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const scripts=[...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g)].map(match=>match[1]);
  const dataIndex=scripts.indexOf('data.js');
  assert.ok(dataIndex>=0);
  const sandbox={};
  for(const script of scripts.slice(0,dataIndex+1))vm.runInNewContext(fs.readFileSync(path.join(__dirname,script),'utf8'),sandbox,{filename:script});
  assert.equal(JSON.stringify(sandbox.S2Data.ACTIVITIES),JSON.stringify(Data.ACTIVITIES));
  assert.equal(sandbox.S2Data.ACTIVITIES,sandbox.S2Activities.ACTIVITIES);
  assert.equal(sandbox.S2Data.ACTIVITY_MAP,sandbox.S2Activities.ACTIVITY_MAP);
});
