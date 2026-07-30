# US/Taiwan Localization

## Overview

The app translates to Mandarin for Taiwan-region users and stays English
everywhere else, driven entirely by device locale - no in-app language
switcher for this pass. Two locale buckets only: `'en-US'` (default/fallback)
and `'zh-TW'`. This also touches distance units, date/time formatting, and
fee currency, which the app currently hardcodes English-language,
kilometer, and NT$ display regardless of device (`formatFee` in
`src/lib/events.ts` literally always renders `NT$${fee}` today).

No schema migration. No user-facing settings UI. No new runtime
dependency - locale detection uses `expo-localization` (already installable,
not yet a dependency); translation is a hand-rolled dictionary module, not
`react-i18next`/`react-intl` - the app is ~20 files with two locales and at
most trivial pluralization (English "spot"/"spots" vs. Mandarin's single
invariant form), which doesn't justify the extra dependency and test-harness
setup a full i18n library needs.

## Locale detection

`expo-localization`'s `useLocales()` (SDK 57) returns a non-empty array of
device locale objects. Bucketing uses `regionCode` only:

- `regionCode === 'TW'` -> `'zh-TW'`
- anything else, including `null`/unresolvable (happens on some web
  browsers, where SDK 57's native `measurementSystem`/`currencyCode` fields
  are documented as always `null`) -> `'en-US'`

The native `measurementSystem`/`currencyCode`/`currencySymbol` fields are
**not** used for unit/currency decisions, since they're unreliable on web -
all unit/currency behavior for a bucket is defined by this app, not read
from the OS.

Android can change locale without an app restart; `useLocales()` already
rerenders for that per the SDK docs, so no extra `AppState` handling is
needed. iOS and web are static per session.

## Architecture

New `src/lib/i18n.tsx`:

- `en` and `zhTW`: flat, namespaced dictionaries (`'create.title'`,
  `'profile.credit'`, `'errors.titleRequired'`, `'skillBands.novice'`, ...)
- `type Translations = typeof en; const zhTW: Translations = { ... }` - a
  missing or extra key in `zhTW` is a **compile error** via TypeScript's
  excess-property and structural checks on the literal assignment. This is
  the primary correctness guarantee for translation completeness.
- `I18nProvider`: computes the locale bucket once via `useLocales()`, wraps
  the root layout (`src/app/_layout.tsx`)
- `useI18n()`: returns `{ locale, t }` where `t(key, params?)` does simple
  `{placeholder}` interpolation (matching the handful of dynamic strings,
  e.g. "3 spots filled") - no ICU, no nesting beyond one level
- `pluralize(count, singular, plural, locale)`: a standalone helper (not a
  dictionary entry) for the one existing plural case, "spot"/"spots" in
  `src/app/(tabs)/index.tsx`. `'en-US'` returns `singular` when
  `count === 1`, else `plural`; `'zh-TW'` always returns `singular` (Mandarin
  has no plural form - the caller passes the single Mandarin word as
  `singular`). Keeps the translation *dictionary* free of plural-variant
  keys, so the compile-time key-parity check in section "Architecture"
  stays simple (one key per concept, not one per grammatical form)

## Non-component strings: key-based refactor

Two places return literal English strings from plain (non-component)
functions, both already unit-tested against the exact English prose:

- **`validateEventDraft`** (`src/lib/event-draft.ts`): `ValidateEventDraftResult`'s
  failure case changes from `{ ok: false, error: string }` to
  `{ ok: false, errorKey: ValidationErrorKey }`, a typed union
  (`'titleRequired' | 'venueRequired' | 'headcountInvalid' | 'feeInvalid' |
  'durationInvalid' | 'skillRangeInvalid' | 'startTimeFormatInvalid' |
  'startTimeMustBeFuture' | ...` - one per existing `return { ok: false,
  error: '...' }` site). The Create screen renders `t(\`errors.${errorKey}\`)`.
  `tests/unit/validate-event-draft-test.ts` and
  `tests/unit/create-validation-test.tsx` assert on `errorKey`, not message
  text - a side benefit: those tests stop being coupled to copy.
- **`SKILL_BANDS`** (`src/lib/skill-bands.ts`): the existing `id` field
  (`'novice'`, `'beginner'`, ...) is already a stable key. Components read
  `t(\`skillBands.${band.id}\`)` instead of `band.label`; the `label` field
  is dropped from `SkillBand`.

**Out of scope**: raw Supabase/Postgres error messages surfaced verbatim
(one call site, `venue-picker.tsx:39`, `setLoadError(error.message)`) stay
untranslated English - mapping arbitrary backend errors is unbounded scope
and not what "translate the app's words" asks for.

## Locale-aware formatting

`formatStartTime`, `formatFee` (`src/lib/events.ts`), and `formatCredit`
(`src/lib/ratings.ts`) each take a `locale: 'en-US' | 'zh-TW'` parameter
(defaulting to `'en-US'` so any not-yet-migrated call site still compiles);
every real call site passes the value from `useI18n()`.

- **`formatStartTime(startTime, locale)`**: replaces the current no-arg
  `date.toLocaleDateString()` / `toLocaleTimeString()` (which follows
  whatever the *device's* default locale happens to be, independent of the
  app's chosen language) with
  `new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })`.
  Locale-correct date order and 12h/24h convention come from `Intl` itself.
- **`formatDistance(meters, locale)`**: `'zh-TW'` keeps the existing
  m/km behavior unchanged. `'en-US'` converts to feet (rounded, under
  ~0.1mi) or miles (one decimal), mirroring the existing "Google Maps-style"
  threshold already documented on this function.
- **`formatFee(fee, locale)`**: `'zh-TW'` keeps `NT$${fee}` / `免費`
  unchanged. `'en-US'` converts via a fixed `NTD_TO_USD_RATE = 31.5`
  constant (documented inline as an approximate, hardcoded rate with no
  live FX source - display only, not a real conversion), rendering
  `~$${(fee / NTD_TO_USD_RATE).toFixed(2)} USD` / `Free`.
- **`formatCredit`**: `'Unrated'` becomes `t('ratings.unrated')`; the
  `★ X.X (N)` shape is locale-agnostic and unchanged.

## Testing

- **Dictionary parity**: `tests/unit/i18n-test.ts` asserts
  `Object.keys(en)` and `Object.keys(zhTW)` match - a runtime backstop
  documenting the compile-time guarantee in the test suite itself.
- **Formatting functions**: `tests/unit/format-distance-test.ts` and the
  `events`/`ratings` test files gain `'en-US'` and `'zh-TW'` cases (distance
  in mi vs. km, fee in USD vs. NT$, date strings for both locales).
- **Validation**: `create-validation-test.tsx` and
  `validate-event-draft-test.ts` updated to assert `errorKey`.
- **Screens**: every existing `tests/unit/*-test.tsx` keeps rendering with
  the default `'en-US'` bucket and must stay green unchanged. One new test
  per screen category (Discover, Create, Profile, Event-detail) mounts with
  a mocked `'zh-TW'` locale and asserts representative Mandarin strings
  render, to catch missed `t()` call sites without duplicating the whole
  suite.
- **Full-suite gate**: `npm test` must pass with zero failures before this
  work is considered done - confirms no existing feature regressed.
