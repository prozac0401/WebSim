import { describe, expect, test } from 'vitest';
import { outOfKillRadius } from '../src/dla';

describe('kill radius', () => {
  test('particle removed beyond kill radius', () => {
    const clusterRadius = 10;
    const killMargin = 5;
    const center = 0;
    expect(outOfKillRadius(16, 0, clusterRadius, killMargin, center)).toBe(true);
    expect(outOfKillRadius(14, 0, clusterRadius, killMargin, center)).toBe(false);
  });
});
