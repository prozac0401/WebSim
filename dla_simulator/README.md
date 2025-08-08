# Diffusion-Limited Aggregation Simulator

This project visualizes diffusion-limited aggregation (DLA) directly in the browser using Canvas 2D and Vite + TypeScript.  A background Web Worker performs the random walk simulation while the main thread renders the growing cluster at up to 60 fps.

## Features

- Central seed with radial spawn/kill boundaries
- Adjustable parameters via Tweakpane
- Optional 4/8 neighbor detection
- Directional bias with controllable angle/strength
- HUD showing FPS, particles/second and cluster radius
- Automatic particle batch reduction to maintain 60 fps
- Start/Pause, Reset and PNG export
- Deterministic runs via seeded RNG (mulberry32)

## Parameters

| Name | Description |
| --- | --- |
| `stickProb` | Probability that a walker sticks when adjacent to the cluster |
| `spawnMargin` | Distance from cluster radius to spawn new walkers |
| `killMargin` | Distance from cluster radius to remove wandering walkers |
| `neighborMode` | Use 4- or 8-neighbor connectivity |
| `biasAngle` | Direction in degrees of movement bias |
| `biasStrength` | 0..1 strength of movement bias |
| `particleBatch` | Walkers processed per batch (auto-reduced on frame drops) |
| `seed` | RNG seed for reproducible results |

## Development

```bash
npm install
npm run dev
# or
npm run build
npm test
```

### Single-file build

Running `npm run build` produces a `standalone.html` file containing all scripts, styles and the worker bundled into a single document for easy distribution.

## Limitations / Future Work

- Currently uses a fixed 600x600 grid.
- Bias model is simple cosine weighting; other distributions could be explored.
- No progressive batch increase when fps is high.

## Performance Notes

The main cost comes from random walks and neighbor checks.  A Web Worker keeps these computations off the UI thread.  Adjusting `particleBatch` controls throughput; large margins for spawn/kill radii reduce wasted walks.
