const test = require('node:test');
const assert = require('node:assert/strict');
const { sample } = require('./day-environment.js');

test('environment, appearance and room use six independent samples', () => {
  const seen = new Set();
  for (const door of [0, .34, .67]) for (const route of [0, .5]) for (const order of [0, .5])
    for (const gender of [0, .5]) for (const hair of [0, 1, 2, 3, 4, 5].map(index => (index + .5) / 6))
      for (const room of [0, .25, .5, .75]) {
    const values = [door, route, order, gender, hair, room]; let calls = 0;
    const environment = sample(() => values[calls++]);
    assert.equal(calls, 6);
    seen.add(JSON.stringify(environment));
  }
  assert.equal(seen.size, 576);
});

test('door interval boundaries and independent equipment choices are stable', () => {
  const draw = values => sample(() => values.shift());
  assert.deepEqual(draw([0, 0, 0, 0, 0, 0]), { doorMode: 'manual', verticalRoute: 'stairs', orderMode: 'counter', appearance: { gender: 'male', hairStyle: 'crop' }, roomLayout: 'window-left' });
  assert.deepEqual(draw([1 / 3, .5, .5, .5, 1 / 6, .25]), { doorMode: 'automatic', verticalRoute: 'escalator', orderMode: 'kiosk', appearance: { gender: 'female', hairStyle: 'side-part' }, roomLayout: 'window-right' });
  assert.deepEqual(draw([2 / 3, .499, .999, .499, .999, .999]), { doorMode: 'revolving', verticalRoute: 'stairs', orderMode: 'kiosk', appearance: { gender: 'male', hairStyle: 'bun' }, roomLayout: 'compact-studio' });
  for (const value of [-.1, 1, NaN, Infinity, undefined, '0.5']) for (let invalidIndex = 0; invalidIndex < 6; invalidIndex++) {
    const values = [0, 0, 0, 0, 0, 0]; values[invalidIndex] = value;
    assert.throws(() => draw(values), RangeError);
  }
});

test('each hair interval applies to either gender without coupled styling', () => {
  const hairStyles = ['crop', 'side-part', 'wavy', 'bob', 'ponytail', 'bun'];
  for (const gender of [0, .5]) for (let index = 0; index < hairStyles.length; index++) {
    const values = [0, 0, 0, gender, index / 6, 0];
    assert.deepEqual(sample(() => values.shift()).appearance, { gender: gender ? 'female' : 'male', hairStyle: hairStyles[index] });
  }
});

test('the sixth draw changes only the room and preserves the preceding five draws', () => {
  const roomLayouts = ['window-left', 'window-right', 'wide-living', 'compact-studio'];
  for (let index = 0; index < roomLayouts.length; index++) {
    const values = [.7, .6, .2, .8, .6, index / 4]; let calls = 0;
    assert.deepEqual(sample(() => values[calls++]), {
      doorMode: 'revolving', verticalRoute: 'escalator', orderMode: 'counter',
      appearance: { gender: 'female', hairStyle: 'bob' }, roomLayout: roomLayouts[index]
    });
    assert.equal(calls, 6);
  }
});
