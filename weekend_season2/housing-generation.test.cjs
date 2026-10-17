const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./data.js');
const E = require('./engine.js');
const F = require('./finance.js');

function finish(state) {
  for (let turns = 0; state.phase !== 'finished' && turns < 100; turns++) {
    const result = E.advanceAutomatic(state, { decisions: 'auto' });
    assert.equal(result.ok, true, result.reason);
    assert.notEqual(result.stopped, 'blocked', result.reason);
  }
  assert.equal(state.phase, 'finished');
  return E.getSummary(state);
}

test('manual presets keep previous living costs and have no invented housing loan', () => {
  assert.equal(D.VERSION, 6);
  assert.deepEqual(D.PRESETS.map(p => p.config.fixedCosts), [1500000,650000,1050000,1400000]);
  for (const {config} of D.PRESETS) {
    assert.equal(config.housingTenure, 'own');
    assert.equal(config.monthlyRent, 0);
    assert.equal(config.housingLoanPrincipal, 0);
    assert.equal(config.housingLoanRateBps, 0);
    assert.deepEqual(E.validateConfig(config), []);
    assert.equal(E.create(config).finance.cash, config.startCash);
  }
  assert.ok(D.HOUSING.SOURCES.some(s=>s.url.includes('kocer')));
});

test('housing validation enforces integer bounds and prevents hidden rent or debt', () => {
  const config = {...D.DEFAULT_CONFIG};
  for (const [key, values] of Object.entries({
    housingTenure:['mortgage','constructor',null],
    monthlyRent:[-1,0.5,100000001,NaN],
    housingLoanPrincipal:[-1,0.5,10000000001,Infinity],
    housingLoanRateBps:[-1,0.5,3001,NaN]
  })) for (const value of values) {
    assert.ok(E.validateConfig({...config,housingTenure:'rent',[key]:value}).length, key + ' ' + value);
  }
  for (const tenure of ['own','jeonse','unspecified']) {
    assert.ok(E.validateConfig({...config,housingTenure:tenure,monthlyRent:1}).length);
  }
  assert.ok(E.validateConfig({...config,housingTenure:'unspecified',housingLoanPrincipal:1}).length);
  assert.ok(E.validateConfig({...config,housingTenure:'unspecified',housingLoanRateBps:1}).length);
  assert.deepEqual(E.validateConfig({...config,housingTenure:'rent',monthlyRent:100000000,housingLoanPrincipal:10000000000,housingLoanRateBps:3000}), []);
  assert.deepEqual(E.validateConfig({...config,housingTenure:'jeonse',housingLoanPrincipal:100000000,housingLoanRateBps:0}), []);
});

test('generation reserves household living costs and realistic housing before personal spending', () => {
  for (let seed = 0; seed < 2048; seed++) {
    const {config} = D.generateLife(seed);
    const income = config.salary + config.externalAllowance;
    const housing = F.housingCosts(config);
    assert.equal(housing.total % 100000,0,'10만원 단위 '+seed);
    assert.ok(config.housingTenure!=='rent'||config.monthlyRent>=300000);
    assert.ok(config.fixedCosts>=D.LIFECYCLE.minimumLiving(D.LIFECYCLE.household(config).size));
    assert.ok(config.personalBudget>=150000);
    assert.ok(income-config.fixedCosts-housing.total-config.personalBudget>=100000);
    assert.equal(E.create(config).finance.cash,config.startCash,'loan is not deposited');
    assert.ok(Number.isSafeInteger(config.fixedCosts) && config.fixedCosts >= 0);
    assert.ok(config.housingTenure === 'rent' || config.monthlyRent === 0);
    assert.deepEqual(E.validateConfig(config), [], 'valid seed ' + seed);
  }
});

test('every household profile can receive every tenure with and without a loan', () => {
  const profiles = Array.from({length:16}, () => new Set());
  for (let seed = 0; seed < 2048; seed++) {
    const config = D.generateLife(seed).config;
    profiles[seed % 16].add(config.housingTenure + ':' + (config.housingLoanPrincipal > 0));
  }
  const expected = ['own:false','own:true','rent:false','rent:true','jeonse:false','jeonse:true'].sort();
  for (let i = 0; i < profiles.length; i++) assert.deepEqual([...profiles[i]].sort(), expected, 'role/marriage/child profile ' + i);
});

test('the housing stream is deterministic and does not consume simulation randomness', () => {
  for (const seed of [0,7,2026,808080,4294967295]) {
    assert.deepEqual(D.generateLife(seed), D.generateLife(seed));
    const generated = E.create(D.generateLife(seed).config);
    const plain = E.create({...generated.config,economicProfile:{...generated.config.economicProfile,active:false},incomeOrigin:{...generated.config.incomeOrigin,kind:'custom'},housingTenure:'own',monthlyRent:0,housingLoanPrincipal:0,housingLoanRateBps:0});
    assert.deepEqual(generated.rng, plain.rng);
    assert.equal(generated.finance.cash, plain.finance.cash);
  }
});

test('planned activity affordability reserves rent and loan interest before spending', () => {
  const plain = {...D.DEFAULT_CONFIG,salary:0,externalAllowance:0,startCash:600000,fixedCosts:500000,personalBudget:500000};
  const plan = {date:'2026-01-01',slot:'afternoon',activityId:'pottery',payment:'cash'};
  assert.equal(E.addPlan(E.create(plain), plan).ok, true);
  const renter = E.create({...plain,housingTenure:'rent',monthlyRent:90000});
  assert.equal(E.addPlan(renter, plan).ok, false);
  assert.equal(F.available(renter.finance, renter.config), 10000);
  const borrower = E.create({...plain,housingTenure:'jeonse',housingLoanPrincipal:24000000,housingLoanRateBps:450});
  assert.equal(F.housingCosts(borrower.config).interest, 90000);
  assert.equal(E.addPlan(borrower, plan).ok, false);
});

test('automatic years charge generated housing exactly and retain original principal', () => {
  const samples = new Map();
  for (let seed = 0; samples.size < 3 && seed < 256; seed++) {
    const config = D.generateLife(seed).config;
    if (config.housingLoanPrincipal > 0 && !samples.has(config.housingTenure)) samples.set(config.housingTenure, config);
  }
  assert.equal(samples.size, 3);
  for (const [tenure, config] of samples) {
    const state = E.create(config), originalCash = state.finance.cash;
    assert.equal(originalCash, config.startCash, tenure);
    const costs = F.housingCosts(config), summary = finish(state);
    assert.equal(summary.daysPlayed, 365);
    assert.equal(summary.finance.housingRent, costs.rent * 12, tenure);
    assert.equal(summary.finance.housingInterest, costs.interest * 12, tenure);
    assert.equal(summary.finance.housingMaintenance, costs.maintenance * 12, tenure);
    assert.equal(summary.finance.housingCosts, costs.total * 12, tenure);
    assert.equal(summary.finance.housingLoanPrincipal, config.housingLoanPrincipal, tenure);
    assert.equal(summary.finance.debt, summary.finance.unpaidDebt + config.housingLoanPrincipal, tenure);
    assert.equal(state.config.housingLoanPrincipal, config.housingLoanPrincipal);
    assert.equal(state.finance.arrears, 0, 'no automatic card borrowing');
  }
});
