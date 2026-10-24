const test = require('node:test');
const assert = require('node:assert/strict');
const { sample } = require('./day-environment.js');

test('all twelve environment combinations can be drawn with three independent samples', () => {
  const seen = new Set();
  for (const door of [0, .34, .67]) for (const route of [0, .5]) for (const order of [0, .5]) {
    const values = [door, route, order]; let calls = 0;
    const environment = sample(() => values[calls++]);
    assert.equal(calls, 3);
    seen.add(JSON.stringify(environment));
  }
  assert.equal(seen.size, 12);
});

test('door interval boundaries and independent equipment choices are stable', () => {
  const draw = values => sample(() => values.shift());
  assert.deepEqual(draw([0, 0, 0]), { doorMode: 'manual', verticalRoute: 'stairs', orderMode: 'counter' });
  assert.deepEqual(draw([1 / 3, .5, .5]), { doorMode: 'automatic', verticalRoute: 'escalator', orderMode: 'kiosk' });
  assert.deepEqual(draw([2 / 3, .499, .999]), { doorMode: 'revolving', verticalRoute: 'stairs', orderMode: 'kiosk' });
  for (const value of [-.1, 1, NaN, Infinity]) assert.throws(() => sample(() => value), RangeError);
});
