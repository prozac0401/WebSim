---
name: game-playtest
description: Play WebSim Routine Bot through rendered browser controls to evaluate onboarding, failure recovery, editing, progression, and mobile touch usability. Use for early three-level feedback and full-game acceptance, separately from reference-solution verification.
---

# Routine Bot rendered playtest

Use the actual game at `http://127.0.0.1:8123/WebSim/routine_bot/routine_bot.html` after starting `node tests/routine-bot-server.cjs`. Read `routine_bot/README.md` for controls and test setup. This project skill can be invoked as `$game-playtest` after project skill discovery; if unavailable in the current session, explicitly read this file, execute its procedure, and disclose manual application.

Do not read `solutions.cjs`, `LEVELS.md`, or solution-based tests before exploratory play. Ask an independent agent, when available, to discover levels 1–3 and a representative late level from the rendered map. Keep its observations distinct from the implementation author's and from automated reference-solution playback. Never count injecting programs, internal state, or engine function calls as a player solving a level. Observational state reads are allowed. Progress fixtures used to open a late level must be disclosed and do not count as progression coverage.

## Reproducible session

1. First run when levels 1–3 are playable; repeat after all 15 levels exist. Run `node tests/routine-bot.browser.cjs early` or `node tests/routine-bot.browser.cjs final` for reproducible control coverage, then perform exploratory rendered play for the observations below. Browser evidence goes in `output/playwright/routine-bot/<phase>/`; record exact viewport, touch setting, reduced-motion setting, browser version, screenshots, console/page errors, and actions in a JSON or text report.
2. Use desktop at 1440×900, narrow portrait at 320×740, and ordinary mobile portrait at 390×844 with touch emulation. Insert blocks with clicks/taps, select and move/delete them, undo, enter/leave repeat and condition branches, change function scope, and execute using visible buttons. Test keyboard controls on desktop. Scroll as a player would; inspect whether the map, active instruction, and core execution controls remain understandable on narrow screens. A responsive screenshot alone is not a touch playtest.
3. On a fresh save, determine the goal and first action without reading a long help panel. Solve 1–3. Intentionally hit a wall, identify the highlighted location and command, edit the program without losing it, and retry. Use pause, step, reset, speed, and a next-level transition. Reopen the game and verify that progress and programs survive.
4. In final phase, play a repetition level, a condition level with both outcomes, and a function level. Observe whether the concept reduces repeated editing, the current nested scope is clear, and function entry/return connects to the active block and robot. Solve the multiple-map challenge using the same program. Verify the final clear screen and application levels 13–15 unlock after level 12; distinguish a seeded late-level session from an end-to-end progression session.
5. For each issue, record **observation → problem → concrete change → repeat the same scene** in `routine_bot/PLAYTEST.md`. Name the level, viewport, input actions, and before/after evidence paths. Preserve unresolved issues and mark blocked coverage FAIL or NOT RUN. Re-run the automated suite when the fix affects controls or cancellation.

When editing the inline command tree, run `node tests/routine-bot-tree.browser.cjs` for focused rendered regression evidence in `output/playwright/routine-bot/tree/`. Then inspect the resulting desktop and portrait captures: surrounding commands should remain readable while repeat/condition descendants are expanded. Collapse an ancestor while its descendant is the insertion target, then add a block and verify it lands visibly in the parent. Confirm fold/unfold and choosing a branch are separate actions, each condition branch can fold independently, repeat counts remain editable after a rejected operation, and keyboard focus survives those actions. This fixture-assisted replay is separate from blind exploration and actual human feedback.

## What to judge

Watch for unclear direction/goal, unexplained collision, invisible active instruction, nested editing without a way back, controls obscured by scrolling, tiny tap targets, unexplained difficulty jumps, repetitive insertion, slow retries, excessive explanation, weak success response, and effects that ignore reduced motion. Identify concrete scenes rather than giving a blanket “fun” score.

Report desktop and touch emulation separately. Mark real Android hardware **NOT RUN** unless an actual Android device was used. Automated and agent exploratory sessions provide observed interaction evidence and design judgments; actual human enjoyment, comprehension, and satisfaction remain unverified without a real user study. Do not turn scripted browser success into a claim of human usability validation.
