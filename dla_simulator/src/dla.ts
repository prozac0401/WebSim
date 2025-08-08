export const NeighborMode = {
  Four: 4,
  Eight: 8,
} as const;
export type NeighborMode = (typeof NeighborMode)[keyof typeof NeighborMode];

export interface Params {
  stickProb: number;
  spawnMargin: number;
  killMargin: number;
  neighborMode: NeighborMode;
  biasAngle: number; // degrees
  biasStrength: number; // 0..1
  particleBatch: number;
  seed: number;
}

export function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hasNeighbor(
  grid: Uint8Array,
  width: number,
  x: number,
  y: number,
  mode: NeighborMode,
): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (mode === NeighborMode.Four && Math.abs(dx) + Math.abs(dy) === 2) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= width) continue;
      if (grid[ny * width + nx]) return true;
    }
  }
  return false;
}

export function outOfKillRadius(
  x: number,
  y: number,
  clusterRadius: number,
  killMargin: number,
  center: number,
): boolean {
  const dx = x - center;
  const dy = y - center;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist > clusterRadius + killMargin;
}

const dirs4 = [
  { dx: 1, dy: 0, ang: 0 },
  { dx: -1, dy: 0, ang: Math.PI },
  { dx: 0, dy: 1, ang: Math.PI / 2 },
  { dx: 0, dy: -1, ang: -Math.PI / 2 },
];

const dirs8 = [
  ...dirs4,
  { dx: 1, dy: 1, ang: Math.PI / 4 },
  { dx: -1, dy: 1, ang: (3 * Math.PI) / 4 },
  { dx: -1, dy: -1, ang: (-3 * Math.PI) / 4 },
  { dx: 1, dy: -1, ang: -Math.PI / 4 },
];

export function biasedStep(
  rng: () => number,
  biasAngle: number,
  biasStrength: number,
  mode: NeighborMode,
): [number, number] {
  const angleRad = (biasAngle * Math.PI) / 180;
  const dirs = mode === NeighborMode.Four ? dirs4 : dirs8;
  const weights = dirs.map((d) => 1 + biasStrength * Math.cos(d.ang - angleRad));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < dirs.length; i++) {
    r -= weights[i];
    if (r <= 0) return [dirs[i].dx, dirs[i].dy];
  }
  return [dirs[0].dx, dirs[0].dy];
}
