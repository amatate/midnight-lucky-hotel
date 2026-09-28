# Display localization

One game supports `?lang=zh` and `?lang=en`. Explicit URL overrides saved language,
then browser language (Chinese → Chinese, otherwise English). Switching changes
only the preference and URL, not the run.

## Boundary

`src/i18n/jsx-runtime.ts` and `jsx-dev-runtime.ts` wrap React's JSX factories.
Only host-element text and accessibility descriptions are translated before
React renders. No DOM mutation observer, network translation, HTML injection or
second engine. Component props, keys, callbacks, form values and IDs stay intact.
Implicit option values are preserved before translating their labels.

App subscribes to language changes without remounting the game. Language storage
is separate from saves and excluded from the rules fingerprint. Readable English
logs do not rewrite persisted Chinese events. Raw debug JSON and player-authored
archive names deliberately keep their original text. Artwork is shared; any
decorative lettering baked into images remains unchanged.

## Maintenance

Run `node scripts/extract-messages.mjs` after adding Chinese display text. It uses
the Babel parser bundled with the Vite toolchain, locally, and appends stable
source-hashed IDs to `messages.json`. Add reviewed English strings to `en.json`.
Preserve template arguments `{0}`, `{1}`, etc.; English may reorder them. Tests
check catalog coverage and argument parity.

Exact messages and templates take priority. Legacy concatenated log sentences
use longest-known-fragment matching. Prefer complete strings or templates in new
copy. Search and readable log diffs explicitly call `translate()`. Feedback
drafts have dedicated English text. `translate="no"` protects player-authored
text; `pre` and `code` preserve raw data by default.

Never import localization into core, content or persistence. Language cannot
change commands, amounts, rules, events or RNG draws. Test with
`npx vitest run tests/app/language.test.tsx`, then check mobile layout and a real
spin/upgrade flow. Catalog coverage alone does not prove fluent composed text or
an unclipped layout.
