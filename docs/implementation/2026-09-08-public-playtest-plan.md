# 公开试玩与可视化构筑 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Sites requires the owning agent to edit and publish this checkout; no delegated source edits.

**Goal:** Publish the existing game and make upgrade changes and first part discoveries understandable without changing game rules.

**Architecture:** Add read-only React presentation beside existing upgrade and settlement components. Derive previews through the real command reducer without committing the result. Keep UI preferences outside run archives; publish static Vite output through Sites.

**Tech Stack:** Existing React, TypeScript, Vite/PWA, Vitest; no new dependencies.

**Spec:** User-approved items 1 and 2 in this conversation: public play URL, README screenshot, opt-in feedback, safe updates, visual reel modifications, timed consequences, first-trigger explanations.

## Global Constraints

- Do not modify `src/core`, `src/content`, base paytable, room targets, RNG, or rules fingerprint.
- No automatic log upload, cloud saves, account creation, license selection, or community posting.
- Exact probabilities remain gated by calculator level 1; RTP by level 2.
- Preserve existing local archives and do not touch the user's Chrome profile.
- Reuse ink #0B0908, brass #B8893E, enamel #F2E3C0, red #A92F36, gold #FFD45A and verdigris #347568; Smiley Sans titles, existing body font, Barlow numbers.
- Signature: a before/after physical reel strip on the maintenance ticket, with removed cells crossed out and added cells outlined. Do not redesign the cabinet.

## Task 1: Visual upgrade ticket and first discovery

Files: new `src/app/reel-preview.ts`, `components/ReelUpgradePreview.tsx`, `components/UpgradeConsequences.tsx`, `components/PartDiscovery.tsx`, `app/playtest.css`; integrate in UpgradePicker/GameScreen/PartsBar. Tests: `tests/app/playtest-clarity.test.tsx`.

Interfaces: `previewReelChanges(state: RunState, choice: UpgradeChoice): readonly ReelChange[]`; each change contains reel index plus before/after cells with symbol and added/removed/unchanged marker. `PartDiscovery({state, presentedThroughSequence, observedEvents})` reads events only through the presentation cursor; post-presentation controller events cover fuse rescue. Retain queued dismissible notes outside automatic progression; persist only explanations actually shown.

- [x] Write failing tests using real UpgradePicker: select lemon-crate, expect two added lemon cells on each chosen reel, no percent before calculator, and unchanged source state. Test replacement/removal; invalid choices retain the reducer's existing rejection behavior.
- [x] Write failing discovery tests: unseen part trigger produces a note, no future payout appears before its event, dismiss persists without modifying run, later same-part trigger does not reopen it.
- [x] Implement pure preview via `dispatchCommand(state, {type: 'CHOOSE_UPGRADE', choice})`; never call controller send from preview. Render semantic before/after lists using existing SymbolFace.
- [x] Render explicit consequence timing, including triple blessing's temporary blank and permanent reel mods. Show discovered part reason from existing player copy and only attributed observed awards, never total base payout as its contribution.
- [x] Run targeted preview/discovery tests and the existing UpgradePicker/PartsBar tests in the full suite.

## Task 2: Feedback, safe update and public delivery

Files: new `src/app/components/FeedbackButton.tsx`, `src/app/feedback.ts`, `src/app/components/UpdateNotice.tsx`, `src/app/update-policy.ts`; integrate App/FrontDesk/GameScreen and Vite config; README, hosting metadata, screenshot under docs. Tests: `tests/app/playtest-delivery.test.tsx`.

Interfaces: `feedbackIssueUrl(seed: number | null): string` builds a GitHub Issue draft containing only build version, rules version and seed. `createUpdateController(reload)` gates activation and reload to explicit approval in the lobby; no automatic refresh while playing. Player manually exports any desired log.

- [x] Write failing tests for generated URL origin/body, absence of bankroll/history, and update disabled in play but allowed at front desk.
- [x] Implement feedback as a help dialog with disclosure before external GitHub navigation. Keep existing explicit export action for optional attachments.
- [x] Switch PWA from automatic update/reload to explicit prompt, defer activation to front desk, and tell players to export before switching site origins. Keep dependencies and lockfile intact.
- [x] Run targeted tests, full suite and production build. Capture one real game screenshot for the README using an isolated browser context, not player storage.
- [x] Commit validated source, push existing GitHub repository and Sites source, package `dist`, save and deploy the exact version with public access requested by user. Verify terminal deployment success and HTTP response; update README with actual public URL.

## Delivery gates

- Local rules fingerprint remains `rules-54eb1749df08ea12`.
- Build and tests pass; exact hosted URL is verified rather than inferred.
- No claim that automated tests prove first-time-player comprehension. Invite the user to test one upgrade and one first-trigger note.

## Implementation verification

- 2026-09-08: 62 files / 705 tests passed. After removing an unsupported test-query option caught by TypeScript, all 8 discovery tests and the production build passed again.
- `git diff --check` passed; `src/core` and `src/content` unchanged. Rules fingerprint remains `rules-54eb1749df08ea12`; dependencies and archive schemas unchanged.
- Read-only review exposed fuse rescue attribution, queued-but-unseen teaching state, and spring intervention discovery. Regression tests now cover each through the appropriate UI/event path.
- README image is a real seeded first-spin capture from an isolated Playwright context. No player profile or saved game was read or changed. Physical-phone feel and real multi-tab update behavior still need player acceptance.
- Published source: `bc97050cdc8da12f18cf30f9dc8a67d43a3b8f4d`, saved Site version 1. Deployment succeeded; an unauthenticated HTTP request returned the game HTML with status 200 at https://midnight-lucky-hotel.teddyding.chatgpt.site/.
- The final deployment origin differed from the pre-publication expected URL. This documentation-only follow-up updates GitHub's play link and records delivery; it does not change the published game build. Community draft remains unpublished.
