import { describe, expect, test } from 'vitest';
import { NeighborMode, biasedStep, mulberry32 } from '../src/dla';

describe('bias', () => {
  test('zero bias has ~0 average displacement', () => {
    const rng = mulberry32(1);
    let sx = 0;
    let sy = 0;
    const steps = 10000;
    for (let i = 0; i < steps; i++) {
      const [dx, dy] = biasedStep(rng, 0, 0, NeighborMode.Four);
      sx += dx;
      sy += dy;
    }
    expect(Math.abs(sx / steps)).toBeLessThan(0.1);
    expect(Math.abs(sy / steps)).toBeLessThan(0.1);
  });
});
