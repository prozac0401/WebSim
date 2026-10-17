const assert=require('node:assert/strict');
const D=require('../data.js'),E=require('../engine.js'),S=require('../storage.js');
const years=new Map();
module.exports=function completedYear(year=2026,changes={},rules=[],{automatic=true}={}){
  const key=JSON.stringify({year,changes,rules,automatic});
  if(!years.has(key)){
    const state=E.create({...D.DEFAULT_CONFIG,year,seed:47,...changes});
    for(const rule of rules){const result=E.addRule(state,rule);assert.ok(result.ok,result.reason);}
    for(let turn=0;state.phase!=='finished'&&turn<400;turn++){
      const result=automatic?E.advanceAutomatic(state):state.phase==='event'?E.resolveAutomatic(state):state.phase==='review'?E.finishReview(state):E.advance(state);
      assert.ok(result.ok,result.reason);
    }
    assert.equal(state.phase,'finished');assert.deepEqual(S.validate(state),[]);
    years.set(key,state);
  }
  return structuredClone(years.get(key));
};
