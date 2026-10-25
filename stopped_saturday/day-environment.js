(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaturdayEnvironment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Sample only when starting a new day. Replays use the stored conditions.
  function sample(random = Math.random) {
    const pick = values => {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random sample must be within [0, 1).');
      return values[Math.floor(value * values.length)];
    };
    return {
      doorMode: pick(['manual', 'automatic', 'revolving']),
      verticalRoute: pick(['stairs', 'escalator']),
      orderMode: pick(['counter', 'kiosk']),
      appearance: {
        gender: pick(['male', 'female']),
        hairStyle: pick(['crop', 'side-part', 'wavy', 'bob', 'ponytail', 'bun'])
      },
      roomLayout: pick(['window-left', 'window-right', 'wide-living', 'compact-studio'])
    };
  }
  return { sample };
});
