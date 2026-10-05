# Diffusion-Limited Aggregation Simulator

This project visualizes diffusion-limited aggregation (DLA) directly in the browser using Canvas 2D and Vite + TypeScript.  A background Web Worker performs the random walk simulation while the main thread renders the growing cluster at up to 60 fps.

## Features

- Central seed with radial spawn/kill boundaries
- Labeled native controls with a responsive experiment/settings layout
- Optional 4/8 movement and contact neighbors
- Directional bias with controllable angle/strength
- Statistics for attached particles, total attempts, cluster radius and processing throughput
- Fixed batch settings; compare models at the same total attempt count
- Start/Pause, 100-attempt step, Reset and PNG export
- Deterministic runs via seeded RNG (mulberry32)

## Parameters

| Name | Description |
| --- | --- |
| `stickProb` | Probability that a walker sticks when adjacent to the cluster |
| `spawnMargin` | Distance from cluster radius to spawn new walkers |
| `killMargin` | Distance from cluster radius to remove wandering walkers |
| `neighborMode` | Use 4 or 8 movement directions and contact neighbors |
| `biasAngle` | Direction in degrees of movement bias |
| `biasStrength` | 0..1 strength of movement bias |
| `particleBatch` | Walkers processed per batch; affects throughput and response latency |
| `seed` | RNG seed for reproducible results |

## Development

```bash
npm ci
npm run dev
# or
npm run build
npm test
```

### Single-file build

Running `npm run build` produces `dist/index.html` with the simulation, styles and worker bundled inline. Copy that file to `standalone.html` to update the public entry point. Shared WebSim navigation loads from `../assets/simulator.js`; keep that repository asset available when serving the page.

## Limitations / Future Work

- Currently uses a fixed 600x600 grid.
- Bias model is simple cosine weighting; other distributions could be explored.
- Spawn/kill boundaries and a maximum of 20,000 walk steps are finite-domain approximations.
- The worker handles controls between batches. Very large batches can delay pause or parameter changes.

## Performance Notes

The main cost comes from random walks and neighbor checks. A Web Worker keeps these computations off the UI thread. Adjusting `particleBatch` controls message overhead and response latency without silently changing model parameters. The kill radius always exceeds the spawn radius by at least one cell. Identical seeds, model parameters and total attempt counts reproduce the same cluster, regardless of screen FPS.

See the [usage and theoretical basis](dla_simulator_doc.html) for the Witten–Sander model, observables and implementation assumptions.
