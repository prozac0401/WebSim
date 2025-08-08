import { describe, expect, test } from 'vitest';
import { NeighborMode, hasNeighbor } from '../src/dla';

describe('neighbor detection', () => {
  test('4 vs 8', () => {
    const grid = new Uint8Array(9);
    grid[4] = 1; // center occupied
    expect(hasNeighbor(grid, 3, 0, 0, NeighborMode.Four)).toBe(false);
    expect(hasNeighbor(grid, 3, 0, 0, NeighborMode.Eight)).toBe(true);
  });
});
