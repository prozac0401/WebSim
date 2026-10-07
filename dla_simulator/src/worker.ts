import { NeighborMode, biasedStep, hasNeighbor, mulberry32, outOfKillRadius } from './dla';
import type { Params } from './dla';

let width = 600;
let height = 600;
let grid = new Uint8Array(width * height);
let center = Math.floor(width / 2);
let clusterRadius = 0;
let rng = mulberry32(1);
let params: Params = {
  stickProb: 1,
  spawnMargin: 5,
  killMargin: 10,
  neighborMode: NeighborMode.Four,
  biasAngle: 0,
  biasStrength: 0,
  particleBatch: 100,
  seed: 1,
};
let running = false;
let playbackDelay = 100;
let loopTimer: ReturnType<typeof setTimeout> | null = null;

function resetCluster() {
  grid.fill(0);
  grid[center * width + center] = 1;
  clusterRadius = 0;
  rng = mulberry32(params.seed);
}
resetCluster();

function spawnParticle() {
  const angle = rng() * Math.PI * 2;
  const radius = clusterRadius + params.spawnMargin;
  const x = Math.round(center + radius * Math.cos(angle));
  const y = Math.round(center + radius * Math.sin(angle));
  return { x, y };
}

function walkParticle() {
  if (params.stickProb === 0) return null;
  let { x, y } = spawnParticle();
  // Bound each walk so pause/reset messages remain responsive even at probability 0.
  for (let steps = 0; steps < 20000; steps++) {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    if (outOfKillRadius(x, y, clusterRadius, Math.max(params.killMargin, params.spawnMargin + 1), center)) return null;
    if (hasNeighbor(grid, width, x, y, params.neighborMode)) {
      if (rng() < params.stickProb) {
        grid[y * width + x] = 1;
        const dx0 = x - center;
        const dy0 = y - center;
        const dist = Math.sqrt(dx0 * dx0 + dy0 * dy0);
        clusterRadius = Math.max(clusterRadius, dist);
        return { x, y };
      }
    }
    const [dx, dy] = biasedStep(rng, params.biasAngle, params.biasStrength, params.neighborMode);
    const nx = x + dx, ny = y + dy;
    // Failed sticking never lets the walker tunnel through an occupied cluster.
    if (nx >= 0 && ny >= 0 && nx < width && ny < height && grid[ny * width + nx]) continue;
    x = nx; y = ny;
  }
  return null;
}

function calculateBatch(limit: number, timed: boolean) {
  const particles: { x: number; y: number }[] = [];
  let processed = 0;
  const start = performance.now();
  while (processed < limit && (!timed || performance.now() - start < 12)) {
    if (clusterRadius + params.spawnMargin >= center - 2) {
      running = false;
      (postMessage as any)({ type: 'boundary' });
      break;
    }
    const p = walkParticle();
    if (p) particles.push(p);
    processed++;
  }
  (postMessage as any)({ type: 'batch', particles, processed, clusterRadius });
}
function loop() {
  loopTimer = null;
  if (!running) return;
  calculateBatch(params.particleBatch, true);
  if (running) loopTimer = setTimeout(loop, playbackDelay);
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (data.type === 'start') {
    if (running) return;
    running = true;
    loop();
  } else if (data.type === 'pause') {
    running = false;
    if (loopTimer !== null) { clearTimeout(loopTimer); loopTimer = null; }
  } else if (data.type === 'params') {
    const seedChanged = data.params.seed !== params.seed;
    params = { ...params, ...data.params };
    if (seedChanged) rng = mulberry32(params.seed);
  } else if (data.type === 'step') {
    running = false;
    if (loopTimer !== null) { clearTimeout(loopTimer); loopTimer = null; }
    calculateBatch(100, false);
  } else if (data.type === 'reset') {
    running = false;
    if (loopTimer !== null) { clearTimeout(loopTimer); loopTimer = null; }
    resetCluster();
    (postMessage as any)({ type: 'reset' });
  } else if (data.type === 'playbackDelay') {
    playbackDelay = Math.max(0, Math.min(1000, Number(data.ms) || 0));
    if (running && loopTimer !== null) { clearTimeout(loopTimer); loopTimer = setTimeout(loop, playbackDelay); }
  } else if (data.type === 'setBatch') {
    params.particleBatch = data.batch;
  }
};
