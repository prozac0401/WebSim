const test = require('node:test');
const assert = require('node:assert/strict');
const { sample } = require('./day-environment.js');

test('environment and all twelve appearances use five independent samples', () => {
  const seen = new Set();
  for (const door of [0, .34, .67]) for (const route of [0, .5]) for (const order of [0, .5])
    for (const gender of [0, .5]) for (const hair of [0, 1, 2, 3, 4, 5].map(index => (index + .5) / 6)) {
    const values = [door, route, order, gender, hair]; let calls = 0;
    const environment = sample(() => values[calls++]);
    assert.equal(calls, 5);
    seen.add(JSON.stringify(environment));
  }
  assert.equal(seen.size, 144);
});

test('door interval boundaries and independent equipment choices are stable', () => {
  const draw = values => sample(() => values.shift());
  assert.deepEqual(draw([0, 0, 0, 0, 0]), { doorMode: 'manual', verticalRoute: 'stairs', orderMode: 'counter', appearance: { gender: 'male', hairStyle: 'crop' } });
  assert.deepEqual(draw([1 / 3, .5, .5, .5, 1 / 6]), { doorMode: 'automatic', verticalRoute: 'escalator', orderMode: 'kiosk', appearance: { gender: 'female', hairStyle: 'side-part' } });
  assert.deepEqual(draw([2 / 3, .499, .999, .499, .999]), { doorMode: 'revolving', verticalRoute: 'stairs', orderMode: 'kiosk', appearance: { gender: 'male', hairStyle: 'bun' } });
  for (const value of [-.1, 1, NaN, Infinity, undefined, '0.5']) for (let invalidIndex = 0; invalidIndex < 5; invalidIndex++) {
    const values = [0, 0, 0, 0, 0]; values[invalidIndex] = value;
    assert.throws(() => draw(values), RangeError);
  }
});

test('each hair interval applies to either gender without coupled styling', () => {
  const hairStyles = ['crop', 'side-part', 'wavy', 'bob', 'ponytail', 'bun'];
  for (const gender of [0, .5]) for (let index = 0; index < hairStyles.length; index++) {
    const values = [0, 0, 0, gender, index / 6];
    assert.deepEqual(sample(() => values.shift()).appearance, { gender: gender ? 'female' : 'male', hairStyle: hairStyles[index] });
  }
});
