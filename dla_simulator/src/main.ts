import './style.css';
import { Pane } from 'tweakpane';
import { NeighborMode } from './dla';
import type { Params } from './dla';
import workerCode from './worker?raw';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const worker = new Worker(
  URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })),
  { type: 'module' }
);

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

const pane = new Pane() as any;
pane.addInput(params, 'stickProb', { min: 0, max: 1, step: 0.01 }).on('change', () => sendParams());
pane.addInput(params, 'spawnMargin', { min: 1, max: 50, step: 1 }).on('change', () => sendParams());
pane.addInput(params, 'killMargin', { min: 1, max: 100, step: 1 }).on('change', () => sendParams());
pane
  .addInput(params, 'neighborMode', { options: { four: NeighborMode.Four, eight: NeighborMode.Eight } })
  .on('change', () => sendParams());
pane.addInput(params, 'biasAngle', { min: 0, max: 360, step: 1 }).on('change', () => sendParams());
pane.addInput(params, 'biasStrength', { min: 0, max: 1, step: 0.01 }).on('change', () => sendParams());
const batchInput = pane.addInput(params, 'particleBatch', { min: 1, max: 1000, step: 1 });
batchInput.on('change', () => sendParams());
pane.addInput(params, 'seed', { min: 0, max: 2 ** 32 - 1, step: 1 }).on('change', () => sendParams());

const btnStart = pane.addButton({ title: 'Start/Pause' });
const btnReset = pane.addButton({ title: 'Reset' });
const btnSave = pane.addButton({ title: 'Save PNG' });

let running = false;
let stickCount = 0;
let clusterRadius = 0;
let processedPerSec = 0;

btnStart.on('click', () => {
  running = !running;
  worker.postMessage({ type: running ? 'start' : 'pause' });
});

btnReset.on('click', () => {
  worker.postMessage({ type: 'reset' });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  stickCount = 0;
  clusterRadius = 0;
});

btnSave.on('click', () => {
  const link = document.createElement('a');
  link.download = 'dla.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

function sendParams() {
  worker.postMessage({ type: 'params', params });
}

worker.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (data.type === 'batch') {
    processedPerSec += data.processed;
    data.particles.forEach((p: { x: number; y: number }) => {
      ctx.fillStyle = `hsl(${(stickCount % 360)},100%,50%)`;
      ctx.fillRect(p.x, p.y, 1, 1);
      stickCount++;
    });
    clusterRadius = data.clusterRadius;
  }
};

sendParams();

const hud = document.getElementById('hud')!;
let lastFrame = performance.now();
let lastSec = performance.now();
let fps = 0;

function frame() {
  const now = performance.now();
  fps = 1000 / (now - lastFrame);
  lastFrame = now;
  if (now - lastSec >= 1000) {
    hud.textContent = `FPS: ${fps.toFixed(1)} | Particles/s: ${processedPerSec.toFixed(0)} | Radius: ${clusterRadius.toFixed(1)}`;
    processedPerSec = 0;
    lastSec = now;
    if (fps < 55 && params.particleBatch > 1) {
      params.particleBatch--;
      batchInput.refresh();
      worker.postMessage({ type: 'setBatch', batch: params.particleBatch });
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
