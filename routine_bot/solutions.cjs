'use strict';
// Maintainer reference programs only. This file is never loaded by the game.
let serial = 0;
const n = type => ({ id: 'ref-' + (++serial), type });
const f = () => n('forward'), l = () => n('left'), r = () => n('right');
const repeat = (count, body) => ({ ...n('repeat'), count, body });
const iff = (condition, yes, no = []) => ({ ...n('if'), condition, then: yes, else: no });
const call = target => ({ ...n('call'), target });
const program = (main, F1 = [], F2 = []) => ({ main, F1, F2 });
const guide = () => iff('blocked', [r()], [iff('mark', [l()]), f()]);
module.exports = {
  1: program([f(), f(), f()]),
  2: program([f(), f(), r(), f(), f()]),
  3: program([f(), l(), f(), f(), r(), f()]),
  4: program([repeat(5, [f()])]),
  5: program([repeat(3, [f(), r(), f(), l()])]),
  6: program([repeat(3, [repeat(3, [f()]), r(), repeat(2, [f()]), l()])]),
  7: program([repeat(12, [iff('blocked', [r()], [f()])])]),
  8: program([repeat(6, [iff('mark', [r()]), f()])]),
  9: program([repeat(12, [guide()])]),
  10: program([repeat(2, [call('F1')]), f(), f(), l(), repeat(2, [call('F1')])], [f(), r(), f(), l()]),
  11: program([call('F2'), f(), call('F2')], [repeat(2, [f()])], [call('F1'), r(), call('F1'), l()]),
  12: program([call('F2')], [iff('blocked', [r()], [f()])], [repeat(12, [call('F1')])]),
  13: program([call('F2'), call('F2')], [guide()], [repeat(12, [call('F1')])]),
  14: program([repeat(6, [iff('mark', [call('F1')], [call('F2')])])], [f(), r(), f(), l()], [f(), f()]),
  15: program([repeat(12, [repeat(2, [call('F2')])])], [f()], [iff('blocked', [r()], [iff('mark', [l()]), call('F1')])])
};
