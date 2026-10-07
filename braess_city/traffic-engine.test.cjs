const assert = require('node:assert/strict');
const E = require('./traffic-engine.js');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS', name); }
const near = (a, b, e = 1e-7) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
check('4000 drivers: shortcut creates the paradox, 80 vs 65 minutes', () => { near(E.equilibrium({ demand: 4000 }).average, 80); near(E.equilibrium({ demand: 4000, open: false }).average, 65); });
check('1000 drivers benefit from the shortcut; heavy demand leaves it unused', () => { near(E.equilibrium({ demand: 1000 }).average, 20); near(E.equilibrium({ demand: 1000, open: false }).average, 50); near(E.equilibrium({ demand: 10000 }).flows[2], 0); });
check('a quiet road empties exactly instead of retaining phantom traffic', () => { const c={demand:1000}, first=E.step(c,[500,500,0]), second=E.step(c,first.flows); assert.deepEqual(second.flows,[0,0,1000]); assert.equal(E.step(c,second.flows).settled,true); });
check('analytic equilibria conserve flow and satisfy Wardrop including delayed connectors', () => {
  for (const demand of [100, 1000, 4000, 4500, 7000, 9000, 12000]) for (const fixed of [20, 45, 70]) for (const shortcut of [0, 12, 50]) for (const open of [false, true]) {
    const c = { demand, fixed, shortcut, open }, eq = E.equilibrium(c);
    near(eq.flows.reduce((a, b) => a + b, 0), demand); assert.ok(eq.flows.every(f => f >= 0)); near(eq.gap, 0);
    near(eq.edges[0] + eq.edges[2], demand); near(eq.edges[1] + eq.edges[3], demand);
  }
});
check('visible rerouting conserves demand, lowers potential, and converges', () => {
  for (const demand of [1000, 4000, 7000, 11000]) for (const shortcut of [0, 15, 50]) {
    const c = { demand, shortcut }, target = E.equilibrium(c); let f = [demand * .8, demand * .2, 0];
    for (let i = 0; i < 400; i++) { const next = E.step(c, f); assert.ok(E.potential(c, next.flows) <= E.potential(c, f) + 1e-6); near(next.flows.reduce((a,b)=>a+b,0), demand); f = next.flows; }
    near(E.costs(c, f).average, target.average, .02);
  }
});
console.log(`${checks} traffic checks passed`);
