# EV2 condition-model calibration matrix · 2026-10-30

This is a deterministic consistency and gameplay-calibration check of EV2's estimated thermal, tyre-wear, braking and energy model. It is **not measured vehicle validation** and does not prove the tested tuning allocations are globally optimal.

Run from the repository root with Node.js:

```sh
node --test evolving_vehicles_2/vehicle-condition.test.cjs
node evolving_vehicles_2/qa/condition-20261030/calibrate.cjs
```

`CONDITION_WORKERS=1`, `2`, `3`, or `4` chooses up to four independent worker threads. Every individual race retains the same 120 Hz integration and independent ghost vehicles. Each race groups three setups of the same factory variant; no collision, drafting or traffic interaction is added.

The matrix contains four variants (Avante 2.0 16-inch, Supra RZ, Ioniq 5 Long Range AWD, K5 2.0 HEV), two circuits (Inje and Monza), and evaluation distances of 1, 3 and 5 laps. These are **24 race conditions / 72 entrant evaluations**. All run on dry surfaces with the same default initial tyre/brake/powertrain temperatures, ambient temperature and SOC as the public simulator.

The three setups are:

| Setup | Budget | Acceleration / top speed / brakes / grip |
| --- | ---: | --- |
| Stock | 0 | 0 / 0 / 0 / 0 |
| Acceleration | 30 | 3 / 0 / 0 / 3 |
| Balanced | 30 | 2 / 1 / 1 / 3 |

No prices, factory mass, factory power, gearing, variant compensation or category caps are changed by this script. The script uses the actual entrant builder and actual racing engine. The public condition-aware physics must remain enabled; this does not compare a shadow simplified physics model.

`summary.json` records every endpoint, lap times, per-lap brake/power factors, mechanical and stored energy totals, SOC and axle tyre wear. Full per-lap snapshots are also written to ignored `output/condition-calibration-final/raw.json`. The source hashes in the summary identify the exact working-source bytes used. The script checks those hashes again at completion and fails if the source changed during evaluation.

The test aims are:

- Warm initial conditions are reproducible, but do not guarantee a fade-free first lap. The final Supra/Inje acceleration setup already reaches a brake factor around 0.69 after one lap; later laps can amplify heat and wear. These are gameplay estimates, not measured Supra brake temperatures.
- Friction brake heat reflects friction work only. Regeneration and natural hill/drag deceleration do not create friction-brake wear.
- Tyre contact forces include regenerative braking; EV/HEV tyres do not receive a categorical wear penalty.
- A depleted HEV retains its factory combustion share. Low-load engine charging uses modeled engine headroom and lossy generation; it is neither free energy nor labelled as recovered braking.
- High-load electric driving can reach motor/inverter derating while a cooler circuit can remain unrestricted. The model does not force degradation just because a given lap number has been reached.
- The allocations can have different trade-offs by circuit and evaluation distance. This is not a requirement that balanced tuning wins every case.

All heat capacities, cooling coefficients, fade thresholds, tyre wear rates, default starting temperatures and HEV battery capacity (1.5 kWh when unavailable) are **model estimates**. The simplified HEV supervisory strategy uses low-load engine priority and a generator mechanical-power cap of 8 kW (also bounded by 4.5% of modeled system power and available engine headroom), 80% generation-to-storage efficiency and a 60% SOC target. It does not claim to replicate a manufacturer's energy-management software. Battery conversion-loss heat is split between motor/inverter and battery; the same conversion loss is not counted twice.

Only these four variants/two circuits/dry surfaces are covered by this matrix. Automated engine checks do not establish real-road safety, real thermal temperatures, mobile usability or human enjoyment.

Factory dual-tyre fitments are honored: tyre count scales per-tyre supported load, thermal mass and cooling surface. Actual front/rear friction-brake work allocation from the engine determines which axle receives heat; no artificial minimum front-brake share is imposed.

An initial calibration attempt was discarded by the source-hash guard because a relevant source file changed during evaluation. That attempt is not counted as a successful matrix and did not produce the committed summary. The final matrix must complete with unchanged source hashes.
