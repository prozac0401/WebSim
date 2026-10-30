# EV2 condition integration verification — 2026-10-30

Base: `8f6723fa3a9c0ba5fc52e5f46f5d1b6fb589a17f`.

## Delivered behavior

Axle friction ellipses share lateral/longitudinal contact capacity with dynamic load transfer. The controller refreshes conservative first/flying-lap envelopes from current tyre and brake capability. This remains a path-following ghost model, not integrated yaw, wheelspin or measured understeer.

Tyres have reversible temperatures and irreversible wear. Friction brakes heat from their actual wheel work only. Regeneration and friction braking share one wheel-force demand. EV/HEV battery charge, motor/battery heat and ICE heat constrain actual power/torque. HEV engine charging consumes bounded spare engine mechanical work and has conversion loss. Fresh measurements reset state; laps retain it. Stock specification and tuning prices are unchanged.

The visible state panel, HEV flow, lap state table and arrow forecast observe this same condition state. Full manufacturer-specific thermal/tire calibration, true steering/yaw dynamics, real Android/iOS and human enjoyment studies remain NOT RUN.

## Automated evidence

| Check | Result | Evidence / command |
| --- | --- | --- |
| Final condition module + independent engine acceptance | 30/30 PASS | `node --test evolving_vehicles_2/vehicle-condition.test.cjs evolving_vehicles_2/condition-physics.test.cjs`; `output/ev2-condition/final-focused.txt` |
| Guidance and brake signal integration | 27/27 PASS | `node --test evolving_vehicles_2/racing-guidance.test.cjs evolving_vehicles_2/race-brake-signal.test.cjs`; `output/ev2-condition/final-guidance-brakes.txt` |
| Broad EV2 snapshot suite | 734 PASS / 737, three existing baseline failures | `node --test evolving_vehicles_2/*.test.cjs`; `output/ev2-condition/ev2-all-tests.txt` |
| Final calibration matrix | 24 conditions / 72 evaluations, all finish and finite | `calibrate.cjs`, `summary.json`; all 14 recorded source SHA-256 values match final source |
| Separate drift regression | 394 PASS / 397, three existing baseline failures | `node --test evolving_drift/*.test.cjs`; `output/ev2-condition/drift-regression.txt` |

The broad snapshot completed before the final dual-rear-tyre count / brake heat axle-allocation refinements. The final 30 focused tests, 27 guidance/brake tests, source-pinned 72-run matrix and runtime-pinned UI test cover the final relevant sources; do not relabel the snapshot as a completely green final whole-repository run.

Independent engine acceptance includes real Inje/Monza/Pocheon axis-capacity audits for Avante, Supra and Ioniq5 AWD, a separate Supra Pocheon five-lap run, initial-hot-tire recovery, grade/regen/friction accounting, EV torque and power derating, HEV engine fallback, fixed-step batching, lap persistence/fresh-measurement independence and unchanged factory/cost data.

The source-informed rendered test is `tests/ev2-condition.browser.cjs`; its pinned result is `browser-report.json`. Desktop and 320/390px touch emulation use visible controls without program/state injection or `advanceTime`. Screenshots and failure-history evidence are local QA output under `output/playwright/ev2-condition*`, not a human usability study.

## Existing failures, retained unchanged

These EV2 failures reproduce with the exact base `race-engine.js` loaded in place of the modified engine:

- `legacy-pitch.test.cjs`: legacy Pocheon finite-wheelbase approximate-contact bound.
- `silverstone-trackside.test.cjs`: historical road-edge geometry hash.
- `spa-trackside.test.cjs`: historical road-edge geometry hash.

The drift baseline failures likewise reproduce without the new engine:

- `catalog.test.cjs`: pre-existing generated body-origin metadata mismatch.
- `connection-mutation.test.cjs`: connection specialist selection assertion.
- `prepared-grips.test.cjs`: exact score comparison differs by approximately 3e-16.

No thresholds, hash expectations or prepared drift records were changed to hide these failures. Baseline rerun transcripts are `output/ev2-condition/baseline-existing.txt` and `drift-baseline-existing.txt`.

Baseline reproduction: compile `git show 8f6723f:evolving_vehicles_2/race-engine.js` through Node's `Module` loader under the original engine filename and put it in `require.cache` before loading those test files. All their other imports are unchanged. The old and new engines produce the same reported existing failures.

## Limitations and tuning policy

All heat capacities, cooling conductances, fade thresholds and wear coefficients are model assumptions. Warm initial temperatures do not guarantee negligible first-lap fade: the matrix explicitly includes noticeable Supra first-lap fade. There are no hardcoded lap-count penalties. The matrix demonstrates behavior and selected tradeoffs, not global tuning optimality or real-car prediction.

The earlier acceleration-cost recommendation is suspended while assessing this new physics. No price, compensation or category-cap change is included here.
