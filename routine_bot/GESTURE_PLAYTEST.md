# Swipe and drag: independent rendered review

2026-10-19, branch `feat/routinebot-swipe-delete`. Final sampled result: **PASS after fixes and repeated scenes**.

## Method

- Applied `.agents/skills/game-playtest/SKILL.md`. No production source, reference solutions, `LEVELS.md`, or solution-based tests were read. This is independent interaction exploration, separate from the implementation agent's scripted regression cases.
- Chromium **145.0.7632.6**: desktop **1440×900**; touch emulation **390×844** and **320×740**. Reduced motion enabled throughout.
- Access-only v1 save completed legacy IDs 1–15 with empty programs. Used the visible selector to open current catalog entry 23 (legacy ID 15), which provides enough command capacity. No claim of fresh progression or puzzle completion.
- Every test program was built/edited with visible palette, branch, scope, count, move and undo controls. Read-only `render_game_to_text` observations checked resulting order, nesting, count and IDs.
- Touch gestures were actual CDP `Input.dispatchTouchEvent` start/move/end streams through Playwright, not DOM event dispatch. Desktop used actual Playwright mouse down/move/up. Taps used Playwright's touch input. No internal game functions or program state injection.
- Evidence directory: `output/playwright/routine-bot/gestures/blind/`. `actions.json` includes input coordinates; `observations.jsonl` includes UI text/geometry and observed program state; `session.cjs` is the local harness. Screenshots are referenced by their numeric prefixes below.

## Coverage

| Scene | Result | Evidence |
|---|---|---|
| Desktop left and right horizontal body swipes | PASS | 06–08: each removed exactly the intended left-turn block, with deletion/undo feedback. Both button undo and Ctrl+Z restored the program. |
| 390 touch left and right swipes | PASS after fix | 17–19: 5 stored blocks became 4, with the intended block removed; undo restored the same block/ID. |
| 390 vertical scrolling over a block | PASS | 20: movement of 12 px horizontally / 100 px vertically left all five blocks unchanged. |
| Desktop drag to repeat's visible branch-add target | PASS | 12: block appended to repeat body. 13: dragging its grip to `시작` moved it back to the main program. |
| Expanded repeat header drop | PASS after fix | 21 at 390 touch and 33 at desktop: grip dropped onto the center of the repeat header; block became a child instead of a sibling. |
| Folded repeat header drop | PASS after fix | 23 at 390, 32 at 320, 34 at desktop: drop appended the block and expanded the repeat so the result was visible. |
| 320 genuinely nested repeat editing | PASS | 24–25: added an inner repeat with wait, then dragged a sibling left turn into that inner repeat. The resulting seven-block tree retained all IDs. |
| 320 nested child swipe left | PASS | 26: seven blocks became six; only the left-turn child was removed. Undo restored it. |
| 320 nested repeat swipe right | PASS | 27: seven blocks became four; repeat plus its two descendants were removed together. Feedback explicitly mentioned inside commands. Undo restored the full subtree and IDs. |
| 320 mostly vertical gesture | PASS | 28: 8 px horizontally / 95 px vertically did not delete or move the seven-block program. |
| Normal taps, count and folding | PASS | 29: changed inner repeat from 3 to 4 and selected it normally; ordinary controls remained usable. 23/32/34 include fold controls before drag. |
| 320 drag out to main program | PASS | 30b–31: scrolled so both grip and `시작` tab were visible, then dragged child out. The same child could then be dropped back into the folded repeat (32). |
| Reload continuity | PASS | Observation preceding 30: the seven-block nested program, IDs and changed repeat count 4 survived reload. |
| Console/page errors | PASS | None observed. Harness errors were stale exact labels after intended moves, a selected-branch label suffix, and refusing an offscreen drag endpoint before scrolling it into view. |
| Actual Android / iPhone / iPad hardware | NOT RUN | Browser touch emulation only. |
| Long edge-autoscroll drag across offscreen sections | NOT RUN | Tested drops with source and destination visibly positioned; no claim about a continuous long drag across multiple screens. |
| Full game, puzzle solutions, human enjoyment study | NOT RUN | Out of scope for this gesture review. Agent exploration is not a human usability/fun study. |

## Findings and repeated scenes

1. **Mobile map covered the scrolled editor.** At 390 px the sticky stage occupied roughly the top 464 px, obscuring the repeat and its children (02). The initial left swipe did not delete its intended block (03); those early touch results were not treated as successful coverage. The implementation owner removed mobile stage stickiness and also corrected a touch-capture cancellation issue found in parallel. **Repeat PASS**: 17 shows the uncovered editor, 18–20 show successful swipes and safe vertical scrolling. This review verifies the combined corrected behavior, not an isolated attribution between the two fixes.

2. **Dropping on the repeat header unexpectedly made a sibling.** On desktop, dragging a left-turn grip onto the center of an expanded repeat header placed it before the repeat (09), as did a folded-header drop (15). The explicit `＋ 반복에 추가` region did nest it (12), so the mismatch was confusing. The owner corrected drag indicators that shifted the layout after pointer-down. **Same-scene repeat PASS**: expanded/folded center drops now nest correctly on desktop (33/34) and both touch widths (21/23/25/32).

No unresolved blocker remained in the sampled workflows. At 320 px, moving a child back to the main tab required scrolling the source and destination into the same viewport first. The grip, body swipe and normal tap actions remained distinct; the inline instructions and deletion message made undo discoverable. Actual finger precision and platform-specific Safari/Android behavior remain unverified without hardware testing.
