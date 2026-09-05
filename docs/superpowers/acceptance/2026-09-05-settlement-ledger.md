# Settlement clarity acceptance — 2026-09-05

Status: automated technical acceptance and independent final review passed; human playtest remains pending.

## Scope and preserved boundaries

Per-spin receipts, versioned persistence, staged payout/bankroll display, Fruit Salad line evidence, ledger access, idle-grid continuity, compact upgrade decisions, and amount-bearing shift/run reports. No changes to seeded gameplay probabilities, protected local paytable, three paid spins per shift, five normal shifts, or the ¥200 checkout target.

The implementation worktree remains `codex/slot-machine-prototype`. Unrelated Task 13 edits and untracked balance/playtest artifacts remain outside this feature's commits. No push or merge is part of this delivery.

## Implementation rulings

1. Keep the ledger trigger beside the balance in cabinet scenes and use the same drawer component in upgrade/report scenes. Receipts stay accessible after the third spin; changing scenes may close the open drawer.
2. Store durable acceptance here rather than in ignored SDD scratch. The cost is a document-location deviation only.
3. Verify closed native strategy details by visibility rather than DOM absence. The browser retains hidden text in the DOM; disclosure behavior remains native and accessible.
4. Say Martyr Coin costs money **when enabled**, not when acquired: `启用时立即失去向上取整的 10% 余额`. The warning is slightly longer but avoids implying an acquisition fee.
5. Include the newly observed ledger layering repair in the active UI implementation. Only its overlay is portaled to `document.body`; this adds two narrowly scoped ledger files to the card/report task and preserves the trigger location.
6. Begin the read-only integrated production review while the final E2E-only task runs, but defer final approval until its supplemental diff/evidence is reviewed. This shortens serial waiting; any later production change must be included in the supplement.
7. Let the independent final reviewer issue the Task 7 spec-compliance and quality verdicts alongside the branch review instead of dispatching a redundant second reader for the E2E-only diff. The final-fix and scoped re-review gates remain in force.
8. Use the authoritative current protected paytable result for the required real-command Fruit Salad fixture. The plan's ¥10 cherry / ¥25 total was stale: the preserved Task 13 baseline has `cherry: 0.6`, so the unchanged commands resolve ¥6 cherry then ¥15 Fruit Salad, with staged balances ¥70 → ¥76 → ¥91 and receipt net +¥11. No paytable, buff, or receipt event was altered to force the stale number.
9. Keep the repository Playwright configuration on port 4173. An unrelated Codex worktree already owned that port during acceptance, so scoped runs used a temporary 4174 substitution that was restored before staging.
10. Include one final production fix wave discovered by review and browser acceptance: Node-loaded core commands now default to strict receipt construction when Vite's `import.meta.env` object is absent, while browser production retains its fallback; ledger display normalizes only the derived decimal net before formatting. Stored receipt amounts and formula operands are unchanged.

## Visual finding and verification

An in-app-browser screenshot after Task 5 reproduced a real layering defect: the cabinet's isolated stacking context allowed the later decision tray to cover the fixed ledger sheet. A live screenshot after the Task 6 overlay portal change confirms the full sheet, heading, close control, and empty-state text paint above the dimmed decision tray. Escape closes the sheet and returns focus to the ledger trigger.

The internal mobile loop then verified 320×568, 390×844, and 430×932. At every width, document scroll width stayed within the viewport, every visible button/select measured at least 44×44px, the ledger measured no more than 72dvh, its close control was the topmost clickable element at its center point, and computed ledger money used tabular numerals. Native strategy details remained present but hidden until expanded. The screenshots show the compact cards and amount-bearing shift ticket without visible horizontal clipping, plus the portaled ledger above the dimmed upgrade tray. The controller independently inspected all three ledger images and the 320px compact-upgrade image and found no visual clipping or overflow.

Representative screenshots:

- `test-results/mobile-flow-the-current-de-1840a-l-supported-portrait-widths/portrait-320-ledger-upgrade.png`
- `test-results/mobile-flow-the-current-de-1840a-l-supported-portrait-widths/portrait-390-ledger-upgrade.png`
- `test-results/mobile-flow-the-current-de-1840a-l-supported-portrait-widths/portrait-430-ledger-upgrade.png`
- Matching `portrait-{width}-compact-upgrades.png` full-page captures are in the same directory.
- Reduced-motion evidence: `/private/tmp/slot-task7-reduced/game-feel-reduced-motion-k-56e17-moving-coins-shake-and-blur/reduced-motion-static.png` (static ledger total, no coin particles, no shake, no blur).

## Automated acceptance

At HEAD `1f1d938`, the controller ran `npm run verify` once, exit code 0:

- TypeScript typecheck: passed.
- Vitest: 50 test files, 629 tests passed, 0 failed; 8.10 seconds.
- Production build: passed; Vite transformed 76 modules and generated the PWA service worker.

The existing dirty Task 13 baseline was present during this check. Per the verification-budget ruling, the full unit/type/build suite was not rerun solely for E2E edits.

Task 7 browser evidence:

- Initial sandbox run of `npm run e2e -- e2e/game-feel.spec.ts e2e/mobile-flow.spec.ts e2e/settlement-ledger.spec.ts`: exit 1 before tests because preview bind returned `EPERM` on 127.0.0.1:4173.
- Escalated retry on 4173: exit 1 before tests because that port was already owned by an unrelated worktree.
- Exact scoped command with temporary port 4174: 14 tests discovered; exit 1 with 2 passed and 12 failed from one shared Node-loader defect, `import.meta.env` being undefined at `ACCEPT_OUTCOME`.
- `npm test -- tests/app/LedgerDrawer.test.tsx` RED: exit 1, 4 passed / 1 failed; it displayed `1.1099999999999994` for 11.11 − 10. GREEN after the derived-net fix: exit 0, 5 passed.
- `npm run typecheck`: first exit 1 on an over-narrow test fixture formula type; after spelling the award union member explicitly, exit 0.
- Targeted post-fix browser runs covered all earlier failures without repeating the two unaffected mobile cases. Final evidence by file is 7/7 game-feel cases passed, 4/4 settlement-ledger cases passed, and 3/3 mobile-flow cases passed (14/14 cumulatively). The last reruns were reduced motion 1/1, corrected current-paytable settlement cases 2/2, and the 320/390/430 viewport loop 1/1, all exit 0.

The settlement flow proves the resolving snapshot is schema v2, uses exported v1/v2 storage keys, creates the receipt through real `SPIN` → `REELS_STOPPED` → `ACCEPT_OUTCOME` commands, stages ¥6 then ¥15 without exposing the final ¥91 early, persists and reloads exactly one ordinal-1 receipt, keeps the resolved nine-cell grid across shift transition, and clears both storage generations for a genuinely fresh run. Paid receipt UI labels use shift/spin text rather than the free-spin-only literal `小票 #1`; the test proves ordinal 1 from state and exactly one rendered ledger receipt.

The controller compared the pre-existing dirty diffs for the protected paytable, package metadata, and seven relevant Task 13 content/core/simulation test paths before and after Tasks 5–6: byte-for-byte unchanged. `RunSummary.tsx`'s explicitly in-scope local RTP experiment was replaced by the approved report. Task 7 likewise did not edit or execute `e2e/complete-run.spec.ts`, did not edit `src/content/base-machine.ts`, and left `package.json`, artifacts, balance scripts, validation fixtures, and all unrelated dirty tests unstaged.

## Final independent review

The independent reviewer approved the integrated production range and Task 7 supplement at `d6189e7` for local technical delivery. Task 7 spec compliance and code quality both passed. Both final findings (missing Node/Vite environment guard and decimal-net formatting) were confirmed addressed, with no new Critical/Important breakage and no outstanding actionable findings.

Evidence remains the 629-test/type/build run at `1f1d938`, followed by the focused 5-test ledger run, fresh typecheck, and 14 browser cases passing cumulatively. It is not a claim of one final all-green full-suite rerun. Reduced-motion browser evidence proves durable final receipt information, not every transient highlight frame. This is acceptance of the preserved local baseline, not clean-checkout reproducibility from feature commits alone.

## Human acceptance gate

Automated checks verify arithmetic, persistence, layout constraints, and deterministic behavior.
They do not prove that the count-up feels exciting or that the shorter cards are easier to learn.
Final acceptance still requires the user to play one normal shift and one Fruit Salad trigger on a phone-sized viewport.
