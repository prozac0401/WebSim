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

function spawnParticle() {
  const angle = rng() * Math.PI * 2;
  const radius = clusterRadius + params.spawnMargin;
  const x = Math.round(center + radius * Math.cos(angle));
  const y = Math.round(center + radius * Math.sin(angle));
  return { x, y };
}

function walkParticle() {
  let { x, y } = spawnParticle();
  while (true) {
    const [dx, dy] = biasedStep(rng, params.biasAngle, params.biasStrength, params.neighborMode);
    x += dx;
    y += dy;
    if (outOfKillRadius(x, y, clusterRadius, params.killMargin, center)) return null;
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
  }
}

function loop() {
  if (!running) return;
  const particles: { x: number; y: number }[] = [];
  let processed = 0;
  while (processed < params.particleBatch) {
    const p = walkParticle();
    if (p) particles.push(p);
    processed++;
  }
  (postMessage as any)({ type: 'batch', particles, processed, clusterRadius });
  setTimeout(loop, 0);
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (data.type === 'start') {
    running = true;
    loop();
  } else if (data.type === 'pause') {
    running = false;
  } else if (data.type === 'params') {
    params = { ...params, ...data.params };
    rng = mulberry32(params.seed);
  } else if (data.type === 'reset') {
    grid.fill(0);
    clusterRadius = 0;
  } else if (data.type === 'setBatch') {
    params.particleBatch = data.batch;
  }
};
