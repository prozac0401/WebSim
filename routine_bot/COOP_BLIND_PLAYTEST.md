# Cooperative expansion: independent rendered play

2026-10-19. Independent agent exploration, not a human enjoyment or comprehension study.

## Method and limits

- Read only `.agents/skills/game-playtest/SKILL.md` and `routine_bot/README.md` for instructions. Did not read game source, `solutions.cjs`, `LEVELS.md`, reference programs, or solution-based tests.
- Used Chromium **145.0.7632.6** through Playwright. Desktop **1440×900**, touch emulation **390×844** and **320×740**; reduced motion enabled in all contexts. Mobile used actual `tap` actions, including authoring, branches, deletion, undo, robot selection, step/run, help and practice navigation.
- Server: `http://127.0.0.1:8124/WebSim/routine_bot/routine_bot.html`.
- Fresh save used for initial tutorial exploration. For late access only, seeded v1 completed IDs 1–15 with empty programs in a fresh context. This is **not** end-to-end progression coverage. New `coop-gate` and `coop-delivery` were unlocked by actually completing their preceding cooperative stages.
- Every reported solved program was authored through editor controls. No internal game functions, success state, runner state, or program injection. `render_game_to_text` was read only for observations.
- The initial six tutorial demonstrations were read and actuated before challenge exploration. After the tutorial expanded, all ten current demonstrations were actuated on 390 px. Puzzle-specific small hints were not used during independent solutions. One small hint was opened **after** the gate had already been solved, solely to test hint marking and new-record clearing.
- Evidence: `output/playwright/routine-bot/cooperation/blind/`. `actions.json` records actions/errors; `observations.jsonl` records body text, visible control descriptions and read-only rendered state. `session.cjs` is the local UI harness. Some screenshot names retain the old tutorial page number; the rule counter in the image is authoritative.
- Real Android hardware: **NOT RUN**. Real iPhone/iPad hardware: **NOT RUN**. Screen reader study and actual human fun study: **NOT RUN**.

## Observed coverage

| Scene | Result | Evidence / observation |
|---|---|---|
| Initial six tutorial demos, desktop | PASS | 02–08. Successful push, blocked pair, per-robot condition, conflicting destination, path clearing and delivery/home distinction all actuated. |
| Current ten tutorial demos, 390 touch | PASS | 30–37 plus observations. All ten actuated; practice from rule 5 went to actual `coop-gate` with the existing authored program. |
| Tutorial rules 5, 6 and 10, 320 touch | PASS | 41–43. Dialog scrolls; lower controls and skip reachable; map does not cover dialog controls. |
| `function-reuse`, desktop | PASS | 10–12. Independently authored 7 blocks, 8 movement turns: F1 = forward/right/forward; main = F1/left/forward/F1. Successful execution. |
| Function help/pause/timer | PASS | 11 and observation log. Help opened during F1 entry: paused at turn 0, executed 1; elapsed held at 4193 ms through a 2 s help interval. Closing kept execution paused; elapsed rose to 5263 ms during subsequent review. Explicit Ctrl+Enter resumed. |
| `coop-intro`, desktop | PASS | 13–16. Two forwards authored. One step advanced both robots once; B selection and active block visible; second turn completed both homes. |
| `coop-gate`, desktop | PASS | 17–24. First short attempt delivered the box but blocked both robots and failed. Edited the retained branch program to solve: box? then forward/right/right/forward; else four waits and four forwards. 13 stored blocks, 8 turns. A/B select different branches and active commands. |
| Gate completed goals | PASS | 24 and rendered state. B back home, A at its own home, box on target; success only after all three conditions. |
| Rest lock / continuity | PASS | 23, 26 and log. Rest held elapsed at 90011 ms through 1.5 s and reload. Program and challenge attempts persisted; reload resets positions to turn 0. Run/step disabled; attempted palette action could not reach the inert workspace. |
| `coop-delivery`, 390 touch | PASS | 27–29. Authored forward/right/right/forward by taps. After turn 1 both boxes occupied targets but status remained running. Turn 4 completed both home returns and succeeded. |
| `coop-gate`, 320 touch | PASS | 38–44. Recreated failure with taps, deleted/undid/re-edited branches, selected B and reran safe program to success. Map/editor remain separately scrollable without overlap. |
| Actual hint + new record | PASS | 45–47. Post-solution check: small hint set help-used state; new record cleared visible hint and flag while retaining 13-block program. Replay succeeded with one attempt. Its 1160 ms is a replay metric, not first-time puzzle-solving time. |
| Console/page errors | PASS | No browser console errors or page exceptions observed. Harness errors were one inaccurate button label, one intentionally blocked rest action, and an initial stdin setup attempt. |
| Full catalog progression / every new stage solve | NOT RUN | This review sampled the function lesson and cooperative intro/gate/delivery. Wait/condition/finale tutorial demos were actuated; their actual stages were not independently solved here. |

## Findings, fixes and repeats

1. **Tutorial assistance was marked without visible disclosure.** Opening a tutorial set the help-used flag even before a small hint was opened. The implementation now shows `도움/예시 사용` and explicitly states that examples count as assistance. **PASS on repeat**, visible in 30–37, 41–43. The rule is now understandable before a record is completed.

2. **An occupied tutorial goal lost its symbol.** A box/robot could replace the visible goal glyph, although target cell outlines remained. Separate home/target badges were added. **PASS on repeat**: 30 (rule 6), 34 (rule 10), 35 (rule 1), 36 (rule 3), 37 (rule 5), 41–43. At 320 px the badges are small but distinct from the occupants.

3. **Fast exhausted failure replaced useful collision reasons.** The original gate failure at 4× ended with generic program-ended labels, leaving the player to repeat slowly to learn why movement failed (18 versus 20). The implementation now preserves the last action reason. **PASS on same-program repeat at 320 touch**: 38 shows A blocked by a robot occupying the cell at turn start and B blocked by the wall beyond the box, both in robot/status text and the selected command context.

4. **Post-clear tutorial changed the finished challenge's assistance label.** After an unassisted successful gate, opening the tutorial changed the visible finished challenge to `기록 완료 · 도움/예시 사용`, while the saved best remained unassisted `개인 최고` (44). The implementation now keeps a completed record's assistance flag fixed. **PASS on repeat**: reloaded an unassisted completed gate, opened/closed tutorial, and confirmed unchanged finished flag, elapsed time, record and unassisted label (48–50).

5. **Narrow-screen map-text disclosure could share space with the long brief.** The original 320 px gate capture placed `지도 글로 읽기` alongside the wrapping description (44). The implementation moved it into normal layout flow beneath the map. **PASS on repeat**: 48 and 50 show the full long brief above the robot selectors and a separate disclosure below the map; no overlapping text.

## Design observations

- The function lesson made the block limit useful: the eight-action path exposed the repeated three-action segment, and seven stored blocks were sufficient without a hint.
- The cooperative introduction is an easy two-forward bridge. The gate is a marked reasoning increase, but its level text and prior interactive rule explain the two routes. A failed attempt was recoverable without losing the branch structure. No unexplained difficulty blocker remained in the sampled sequence.
- Selecting B follows B's current branch, which was especially useful when A waited and B pushed. At phone widths this scrolls the selected command into the editor; seeing the map again requires scrolling upward. This is a tradeoff of the non-overlapping layout, not a broken control.
- The displayed active time included editing, review and pauses, and excluded help/rest as described. Agent/tool delays are part of these observations; these times are not benchmarks of human puzzle difficulty.
