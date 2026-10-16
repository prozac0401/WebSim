'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const D=require('./data.js'),E=require('./engine.js'),Events=require('./events.js');
const state=(maritalStatus,children=0,extra={})=>({config:{...D.DEFAULT_CONFIG,maritalStatus,children,childAge:children?'school':'none',...extra},date:'2026-01-01',flags:{},healthEpisode:null});

test('spouse-free household scenes support single and divorced families at every income',()=>{
  for(const maritalStatus of ['single','divorced'])for(const children of [0,1,6])for(const salary of [0,100000,100000000]){
    const s=state(maritalStatus,children,{salary,externalAllowance:0,fixedCosts:0}),id=children?'single_care':'single_weekend';
    for(const candidate of ['single_care','single_weekend','partner_care','partner_weekend'])assert.equal(Events.eligible(s,candidate),candidate===id);
    assert.equal(Events.eligible(s,'single_followup'),false);
    s.flags.singlePlan='help';assert.equal(Events.eligible(s,'single_followup'),true);
    s.flags.partnerPlan='help';assert.equal(Events.eligible(s,'partner_followup'),false);
  }
});

test('married household scenes still require a spouse and unspecified status invents no household story',()=>{
  for(const maritalStatus of ['married','unspecified'])for(const children of [0,2]){
    const s=state(maritalStatus,children);s.flags.singlePlan='own';s.flags.partnerPlan='own';
    for(const id of ['single_weekend','single_care','single_followup'])assert.equal(Events.eligible(s,id),false);
    assert.equal(Events.eligible(s,children?'partner_care':'partner_weekend'),maritalStatus==='married');
    assert.equal(Events.eligible(s,'partner_followup'),maritalStatus==='married');
  }
});

test('published single household definitions and pending choice signatures remain unchanged',()=>{
  const signatures={single_weekend:'cea9f4569b63394641f73fad470ddb6eca9e041a3052111b47711b9d1e077e0d',single_care:'a6ca93a42b54da69ab8301277ee0d5192d1e8c667423958ba082ccfa51379de4',single_followup:'aeadf401bc2e64fe485a066ceff9e3517bdfcfea7a0c75cd597a1eb0798e89c5'};
  for(const [id,signature]of Object.entries(signatures)){
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(Events.MAP[id])).digest('hex'),signature);
    const pending=Events.make(id,'2026-02-07',1,{}),s=state('divorced',1);s.flags.singlePlan='help';
    assert.deepEqual(pending.choices,Events.MAP[id].choices);assert.equal(pending.requires.maritalStatus,'single');
    if(id!=='single_weekend')assert.ok(Events.eligible(s,id));
  }
});

test('a divorced parent can choose care sharing and reach its original followup without extra costs',()=>{
  const s=E.create({...D.DEFAULT_CONFIG,maritalStatus:'divorced',children:2,childAge:'school',salary:0,externalAllowance:0,fixedCosts:0,careShare:80});
  s.queue.unshift({catalogId:'single_care',date:s.date,context:{}});E.advance(s);assert.equal(s.pendingEvent.catalogId,'single_care');
  const before=JSON.stringify(s.finance),care=E.careMinutes(s,'2026-01-03','morning');
  assert.ok(E.choose(s,'ask').ok);assert.equal(JSON.stringify(s.finance),before);
  assert.equal(E.careMinutes(s,'2026-01-03','morning'),care/2);
  assert.ok(s.queue.some(q=>q.catalogId==='single_followup'&&q.date==='2026-01-22'));
  for(let i=0;i<10&&s.date<'2026-01-25';i++){const result=E.advanceAutomatic(s);assert.ok(result.ok,result.reason);}
  assert.ok(s.log.some(l=>l.type==='event'&&l.eventId==='single_followup'));
  assert.ok(!s.log.some(l=>l.type==='event'&&l.eventId.startsWith('partner_')));
});
