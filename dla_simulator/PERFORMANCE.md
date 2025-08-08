# Performance Notes

- **Bottlenecks:** Random walk simulation and neighbor checking dominate CPU time.
- **Optimizations:**
  - Simulation runs inside a Web Worker to avoid blocking rendering.
  - Walkers are processed in batches; the batch size is reduced automatically when FPS drops below ~55.
  - Spawn and kill radii track the cluster radius to reduce wasted walks far from the aggregate.
