'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js');

test('the marital reference preserves divorce-only population stocks and exact official age cells',()=>{
 const m=D.MARITAL_MODEL;
 assert.equal(m.source.year,2020);assert.equal(m.source.published,'2021-09-27');assert.match(m.source.locator,/62/);
 assert.match(m.source.denominator,/전체 인구/);assert.match(m.source.measure,/연간 이혼 건수나 혼인 대비 이혼 비율이 아님/);
 assert.match(m.note,/교차분포가 아닙니다/);assert.match(m.note,/기존 저장은 바꾸지 않습니다/);
 assert.equal(m.ageBands.length,15);assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.source)&&Object.isFrozen(m.ageBands));
 assert.deepEqual(m.ageBands.find(b=>b.minAge===20),{minAge:20,maxAge:24,total:3193316,divorced:3833});
 assert.deepEqual(m.ageBands.find(b=>b.minAge===50),{minAge:50,maxAge:54,total:4245683,divorced:478830});
 assert.equal(m.ageBands.reduce((sum,b)=>sum+b.total,0),43957547);
 assert.equal(m.ageBands.reduce((sum,b)=>sum+b.divorced,0),2545407);
 const generatedBands=m.ageBands.filter(b=>b.minAge>=20&&b.minAge<=65);
 assert.equal(generatedBands.reduce((sum,b)=>sum+b.total,0),36015810);
 assert.equal(generatedBands.reduce((sum,b)=>sum+b.divorced,0),2348973);
 for(const b of m.ageBands)assert.ok(Object.isFrozen(b));
});

test('all age boundaries sample the source stock share, independently of children and the fallback household',()=>{
 for(const age of [18,19,20,24,25,29,30,34,35,39,40,44,45,49,50,54,55,59,60,64,65,69,70,74,75,79,80,84,85,100]){
  const band=D.MARITAL_MODEL.ageBands.find(b=>age>=b.minAge&&(b.maxAge===null||age<=b.maxAge)),p=band.divorced/band.total;
  assert.equal(D.divorcedShare(age),p);
  for(const children of [0,1,6])for(const original of ['single','married']){
   assert.equal(D.sampleMaritalStatus(age,children,original,()=>p-Number.EPSILON),'divorced');
   assert.equal(D.sampleMaritalStatus(age,children,original,()=>p),children?'married':original);
   let calls=0;D.sampleMaritalStatus(age,children,original,()=>{calls++;return .5;});assert.equal(calls,1);
  }
 }
 assert.ok(D.divorcedShare(22)<.002);assert.ok(D.divorcedShare(29)<.006);assert.ok(D.divorcedShare(52)>.11);
 for(const age of [17,101,38.5,NaN])assert.throws(()=>D.divorcedShare(age));
 for(const children of [-1,7,.5,NaN])assert.throws(()=>D.sampleMaritalStatus(38,children,'single',()=>.5));
 assert.throws(()=>D.sampleMaritalStatus(38,1,'divorced',()=>.5));
 for(const r of [-.1,1,NaN,Infinity])assert.throws(()=>D.sampleMaritalStatus(38,1,'single',()=>r));
});

test('generated divorce frequency follows each age reference rather than the former forced parent quarter',()=>{
 const counts=new Map(),families=new Set(),n=32768;let divorced=0,parents=0,expected=0,variance=0;
 for(let seed=0;seed<n;seed++){
  const c=D.generateLife(seed).config,b=D.MARITAL_MODEL.ageBands.find(b=>c.age>=b.minAge&&(b.maxAge===null||c.age<=b.maxAge)),p=b.divorced/b.total;
  const row=counts.get(b.minAge)||{n:0,divorced:0,p};row.n++;if(c.maritalStatus==='divorced'){row.divorced++;divorced++;}counts.set(b.minAge,row);
  if(c.children){parents++;assert.notEqual(c.maritalStatus,'single');}
  families.add(c.maritalStatus+':'+!!c.children);expected+=p;variance+=p*(1-p);
 }
 assert.equal(parents,n/2,'child-presence generation stays unchanged');
 assert.deepEqual([...families].sort(),['divorced:false','divorced:true','married:false','married:true','single:false']);
 assert.ok(divorced/n>.04&&divorced/n<.10,'overall divorce stays near the age-weighted reference, not25percent');
 assert.ok(Math.abs(divorced-expected)<4*Math.sqrt(variance));
 for(const [age,row]of counts)assert.ok(Math.abs(row.divorced-row.n*row.p)<Math.max(3,5*Math.sqrt(row.n*row.p*(1-row.p))),`age${age}: ${row.divorced}/${row.n}`);
});

test('independent marital draws preserve prior ages, children, roles, identities and appearance streams',()=>{
 // Captured from512 seeds immediately before the marital-only generator change.
 // Housing/economy and family wording legitimately respond to partner presence.
 const keys=['generationSeed','age','role','children','childProfiles','childAge','gender','careShare','region','transport','province','subregionId','appearance','homeStyle','preferences','personaName'];
 const rows=Array.from({length:512},(_,seed)=>{const c=D.generateLife(seed).config;return Object.fromEntries(keys.map(k=>[k,c[k]]));});
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),'55e7a89a222d61d1edace164c5c8538b914d283bad5afd6ed8c5ba1d4dafeeef');
 for(const seed of [9,23,331,4294967295])assert.deepEqual(D.generateLife(seed),D.generateLife(seed));
});

test('manual marital statuses and saved divorced lives retain their exact state and random streams',()=>{
 for(const maritalStatus of ['single','married','divorced','widowed'])for(const children of [0,2]){
  const state=E.create({...D.PRESETS[0].config,maritalStatus,children,childAge:children?'school':'none'});
  E.advance(state);const before=structuredClone(state);
  for(let seed=0;seed<32;seed++)D.generateLife(seed);
  const restored=S.parse(S.serialize(state));assert.ok(restored.ok,restored.reason);assert.deepEqual(restored.state,before);assert.deepEqual(state,before);
 }
});
