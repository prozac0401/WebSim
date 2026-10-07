const assert = require('node:assert/strict');
const E = require('./cascade-engine.js');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS', name); }
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a-b) < e, `${a} != ${b}`);
check('two independent agreeing choices start a cascade; repetition adds no evidence', () => { const e = E.run([1,1,-1,-1,-1,-1], .7); near(e[1].after, 2 * E.logit(.7)); assert.ok(e.slice(2).every(x => x.action === 1 && x.ignoresSignal)); e.slice(2).forEach(x => near(x.after, e[1].after)); });
check('a tie uses the private signal; disagreement cancels earlier information', () => { const e = E.run([1,-1], .7); assert.equal(e[1].action, -1); near(e[1].after, 0); });
check('public hints accumulate evidence rather than repeat choices', () => { const e = E.run([1,1,-1,-1,-1,-1], .7, 'hints'); near(e.at(-1).after, -2 * E.logit(.7)); assert.equal(e.at(-1).action, -1); });
check('independent decisions depend only on their own signals', () => { const s = [1,1,-1,-1,-1]; assert.deepEqual(E.run(s, .7, 'independent').map(e=>e.action), s); });
check('same seed is reproducible; reordering preserves every clue and the player clue', () => { const a = E.generate(731, .7); assert.deepEqual(a, E.generate(731, .7)); for (const mode of ['reverse','shuffle']) { const b = E.orderSignals(a.signals, mode, 14); assert.deepEqual([...b].sort(), [...a.signals].sort()); assert.equal(b.at(-1), a.signals.at(-1)); } });
check('enumerated action likelihood matches the exact conditional Bayesian update', () => {
  const q = .7, groups = new Map();
  // Enumerate all private signal histories and their actual probability under each state.
  for (let mask=0; mask<256; mask++) { const s=Array.from({length:8},(_,i)=>mask>>i&1?1:-1), events=E.run(s,q); let pa=1,pb=1,key=''; for(let i=0;i<8;i++){pa*=s[i]===1?q:1-q;pb*=s[i]===1?1-q:q;key+=events[i].action===1?'A':'B';const id=i+':'+key,g=groups.get(id)||{a:0,b:0,log:events[i].after};g.a+=pa;g.b+=pb;groups.set(id,g);} }
  // Each prefix is repeated equally often by suffix enumeration, so the ratio is unchanged.
  for(const g of groups.values()) near(g.log, Math.log(g.a/g.b), 1e-8);
});
console.log(`${checks} cascade checks passed`);
