'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js'),Scene=require('./scene.js');

test('published v6 parent and adult child keep exact ages, money and history when illustrations change',()=>{
 const text=fs.readFileSync(path.join(__dirname,'fixtures/v6-young-parent.json'),'utf8'),before=JSON.parse(text).state,r=S.parse(text);
 assert.ok(r.ok,r.reason);assert.equal(r.migrated,false);assert.deepEqual(r.state,before);
 assert.equal(r.state.config.age,38);assert.equal(r.state.config.childProfiles[0].age,19);
 const copy=structuredClone(r.state);Scene.familyLayout(r.state.config,'rest',r.state);assert.deepEqual(r.state,copy);
 for(let turns=0;r.state.phase!=='finished'&&turns<80;turns++){assert.ok(E.advanceAutomatic(r.state,{decisions:'auto'}).ok);const loaded=S.parse(S.serialize(r.state));assert.ok(loaded.ok,loaded.reason);assert.deepEqual(loaded.state,r.state);}
 assert.equal(E.getSummary(r.state).daysPlayed,365);assert.equal(r.state.config.childProfiles[0].age,19);
 for(const field of ['salary','externalAllowance','fixedCosts','personalBudget','monthlyRent','housingMaintenance','housingLoanPrincipal','housingLoanRateBps'])assert.equal(r.state.config[field],before.config[field],field);
});

test('manual family ages remain explicit choices rather than being silently re-generated',()=>{
 const c={...D.DEFAULT_CONFIG,age:38,children:1,childAge:'adult',childProfiles:[{age:19,gender:'woman',militaryStatus:'none'}],maritalStatus:'divorced'};
 const s=E.create(c);assert.deepEqual(s.config.childProfiles,c.childProfiles);assert.equal(s.config.age,38);
 assert.deepEqual(S.parse(S.serialize(s)).state.config,s.config);
});
