'use strict';
// Test/offline-only conversion. Preserve the archived v2 bytes and hash checks;
// explicitly add disabled clutch events before testing current automatic cars.
// Runtime loading never imports this utility or silently upgrades an old run.
const G=require('../genome.js');
module.exports=function upgradeControls(source){
  if(source.length!==128*8)throw new TypeError('Expected archived v2 controls');
  const gene=G.create();
  for(let knot=0;knot<G.KNOTS;knot++)for(let channel=0;channel<8;channel++)
    gene[knot*G.STRIDE+channel]=source[knot*8+channel];
  return gene;
};
