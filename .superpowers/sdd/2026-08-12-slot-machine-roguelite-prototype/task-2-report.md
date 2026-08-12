# Task 2 Report: Deterministic Reel and Payline Kernel

## Implementation

- Added serializable, readonly kernel types in `src/core/types.ts`.
- Added the specified unsigned 32-bit Mulberry32 transition and bounded integer validation in `src/core/random.ts`.
- Added deterministic three-draw reel sampling, wrapping three-symbol windows, and RNG-free reel advancement in `src/core/reels.ts`.
- Added the ordered top, middle, bottom, diagonal-down, and diagonal-up paylines with base-symbol wild substitution only in `src/core/paylines.ts`.
- Added the exact provided base strips and paytable in `src/content/base-machine.ts`.
- Added 14 focused tests covering the requested contracts.

## TDD Evidence

### RED

After writing the focused kernel tests before production modules, ran:

```text
npm test -- tests/core/random.test.ts tests/core/reels.test.ts tests/core/paylines.test.ts
```

Result: failed as expected with three Vite import-resolution errors for the missing `@/core/random`, `@/core/reels`, and `@/content/base-machine` modules. No tests executed because the required exports did not exist.

### GREEN

After the minimal kernel implementation, ran:

```text
npm test -- tests/core/random.test.ts tests/core/reels.test.ts tests/core/paylines.test.ts
npm run typecheck
```

Result: `3` test files passed, `14` tests passed; strict TypeScript check passed.

## Final Verification

Ran the required full command once before commit:

```text
npm run verify
```

Result: exit code `0`.

- `npm run typecheck`: passed.
- `npm test`: `4` test files and `15` tests passed.
- `npm run build`: Vite production build passed.
- `git diff --check`: passed with no whitespace errors.

## Files

- `src/core/types.ts`
- `src/core/random.ts`
- `src/core/reels.ts`
- `src/core/paylines.ts`
- `src/content/base-machine.ts`
- `tests/core/random.test.ts`
- `tests/core/reels.test.ts`
- `tests/core/paylines.test.ts`

## Self-review

- RNG state uses unsigned 32-bit arithmetic and does not mutate its input.
- `drawReels` calls `nextInt` exactly three times, once per reel.
- Window extraction wraps at the end of each source strip.
- Advancement preserves the RNG and leaves non-selected columns unchanged; negative steps are normalized modulo the visible three-cell reel window.
- Payline coordinates are typed tuples and the five fixed lines are evaluated in their declared order.
- Wild resolves to a base pay symbol only when every other symbol on the line is that same symbol; all-wild pays wild; `food` and `crack` cannot be substituted.
- The supplied reel ordering and paytable values are covered by a literal regression test.

## Concern

`ReelDraw` is specified as only `stops`, `grid`, and `rng`, while `advanceReel` is also specified without a `ReelSet` argument. Therefore a serialized draw cannot recover a source strip's full length or its unseen symbols. This implementation advances the self-contained visible three-cell window and normalizes stops against that length. If later work requires an advance across arbitrary full strips, the public data contract needs a serializable reel-length/strip reference or an explicit `ReelSet` parameter; neither was added because this task requires the supplied interface exactly.

## Fix Round 1

### Root cause and resolution

The prior `advanceReel` used `draw.grid[reelIndex].length`, which is always three, as the modulo base and rotated only the visible tuple. It could never reveal a fourth (or preceding) symbol from a physical reel strip.

Resolution A adds `readonly strips: ReelSet` to the serializable `ReelDraw`. `drawReels` retains the exact input `ReelSet`; `advanceReel` now uses `draw.strips[reelIndex].length`, rebuilds the advanced three-cell window from that full source strip, preserves the other reels and the exact strips/RNG references, and supports normalized negative steps.

### Regression RED

Updated `tests/core/reels.test.ts` with a four-symbol strip and ran:

```text
npm test -- tests/core/reels.test.ts
```

Result: `1` test file failed with `3` failed / `1` passed tests. The failures showed exactly the defect: missing retained `draw.strips`, an advance from `[cherry, lemon, bell]` producing `[lemon, bell, cherry]` instead of `[lemon, bell, seven]`, and a negative step yielding stop `2` instead of physical-strip stop `3`.

### Regression GREEN

Ran:

```text
npm test -- tests/core/random.test.ts tests/core/reels.test.ts tests/core/paylines.test.ts
npm run typecheck
```

Result: `3` focused test files and `14` tests passed; strict typecheck passed.

### Fix-round verification

`npm run verify` was run before the fix-round commit; its exit code was `0`, with typecheck, all Vitest tests, and the production Vite build passing.
