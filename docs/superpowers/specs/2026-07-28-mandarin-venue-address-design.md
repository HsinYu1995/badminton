# Mandarin Venue Address

## Overview

Court/venue addresses are free-text, organizer-authored strings stored on
`venues.address` and shown to every viewer regardless of locale. Unlike the
rest of this app's localization work (static UI strings translated via
`src/lib/i18n.tsx`), an address is arbitrary user-submitted content — there
is no fixed dictionary key to translate. This adds an optional
organizer-authored Mandarin address, with an automatic on-device
reverse-geocoding fallback for venues that don't have one, so a `zh-TW`
viewer sees a Mandarin address for every venue where either is available.

Scope check confirmed before designing this: `venue.address` is rendered
in exactly one place in the app today — the venue list inside
`src/components/venue-picker.tsx` (shown when creating an event). Neither
`event-card.tsx` nor the event detail screen (`src/app/event/[id].tsx`)
render an address at all; `event-card.tsx` only shows `venue.name`. This
change is scoped to that one render site.

## Why not machine translation or a paid geocoding API

Two alternatives were considered and rejected for this pass:

- **Server-side geocoding/translation** (e.g. Google Maps Geocoding API
  with `language=zh-TW`) is fully automatic and deterministic regardless of
  the viewer's own device, but requires new infrastructure this app
  doesn't have: an API key, billing, and either an edge function or a
  backfill job. Rejected for now as disproportionate to a small app with a
  handful of venues.
- **Machine-translating the free-text `address` string itself** would
  preserve nothing of value — generic MT is unreliable on proper nouns and
  street/place names specifically, which is most of what an address is.

Checked the exact SDK 57 docs for `expo-location` (per this repo's
AGENTS.md) before designing the fallback: `reverseGeocodeAsync` and
`geocodeAsync` take no language/locale parameter — both defer entirely to
the native OS geocoder's own locale behavior, which cannot be forced
independently of the device's own settings. In practice this is fine here:
the native geocoder honoring device locale is the same signal this app's
whole i18n system already keys off (`useLocales()`'s `languageCode`/
`regionCode`), so a `zh-TW`-bucketed device's OS geocoder should also
return Mandarin text.

## Data model

Add a nullable `address_zh text` column to `venues` via a new migration:
```sql
alter table public.venues add column address_zh text;
```
No default, no backfill — `NULL` means "no organizer-authored Mandarin
address yet," which the display-side fallback (below) handles. No RLS
policy changes needed (Supabase RLS is row-level; the existing venues
policies already permit reading/inserting the whole row for
authenticated users, per `supabase/migrations/20260716201044_rls_policies.sql`).

`src/components/venue-picker.tsx`'s `Venue` type gains `address_zh: string
| null`; its `select('id, name, address')` calls become `select('id, name,
address, address_zh')`.

## Capture flow

The "add new venue" form (`showNewVenueForm` block in `venue-picker.tsx`)
gets one more optional `TextInput` for the Mandarin address, placed right
after the existing address input. It's shown unconditionally — regardless
of the organizer's own current device locale, since a bilingual organizer
might be filling this in for future Taiwan-based viewers even while their
own phone is set to `en-US`. Left blank, `handleSaveVenue`'s insert sends
`address_zh: null` (empty string normalized to `null`, matching how every
other optional field in this codebase is handled — trim and treat empty
as absent).

New translation keys (`venuePicker.addressZhLabel`,
`venuePicker.addressZhPlaceholder`) added to both `en`/`zhTW` dictionaries
in `src/lib/i18n.tsx`, following the existing key-parity/compile-time-
enforcement pattern from the rest of this app's i18n work.

## Display / fallback flow

New pure function in `src/lib/venues.ts` (new file — this logic doesn't
belong in `src/lib/events.ts`, which is about events, not venues):

```ts
export type ReverseGeocodedAddress = {
  region: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  streetNumber: string | null;
};

export function composeZhAddress(parts: ReverseGeocodedAddress): string | null {
  // Concatenates region + city + district + street + streetNumber (the
  // parts that are non-null), in that order - matching Taiwanese address
  // convention (largest-to-smallest administrative unit, opposite of
  // Western order). Returns null if every part is null (nothing to show).
}
```

`reverseGeocodeAsync` is async, so this resolves once, up front, not
per-render: the existing `useEffect` that loads venues on mount awaits it
(when applicable) before calling `setVenues`, so there's no separate
loading state per row and no flicker — the list simply doesn't render
until every venue's display address is already resolved, exactly like the
existing behavior where the whole list waits on `loading` today. For each
loaded venue, the address text to store as `displayAddress` (a new
client-only field, not persisted) is resolved once:

1. `locale !== 'zh-TW'` → always `venue.address` (no change from today;
   skip geocoding entirely — never call `reverseGeocodeAsync` for an
   `en-US` viewer).
2. `locale === 'zh-TW' && venue.address_zh` → `venue.address_zh` (skip
   geocoding — an organizer-authored value always wins over a computed
   one).
3. `locale === 'zh-TW' && !venue.address_zh` → on iOS/Android, call
   `Location.reverseGeocodeAsync({ latitude, longitude })`, pass the
   result through `composeZhAddress`, and use that. Any failure
   (geocoding throws, returns an empty array, `composeZhAddress` returns
   `null`, or we're on web where `reverseGeocodeAsync` isn't available at
   all) falls back to `venue.address`. Each venue's geocode call runs
   independently (`Promise.all`, not sequential) and a single venue's
   failure doesn't block the others from resolving.

The rendered `<Text style={styles.venueAddress}>` reads `venue.displayAddress`
instead of `venue.address`.

`venues.location` is a PostGIS `geography(point,4326)` column; there is no
existing precedent in this codebase for exposing raw lat/lng to the client
(the one existing consumer, `discover_events`, computes `st_distance`
entirely server-side and never returns coordinates). The same migration
that adds `address_zh` also adds two generated columns:
```sql
alter table public.venues
  add column latitude double precision generated always as (st_y(location::geometry)) stored,
  add column longitude double precision generated always as (st_x(location::geometry)) stored;
```
computed once from the existing `location` value, needing no application
code change to keep them in sync. `venue-picker.tsx`'s select becomes
`select('id, name, address, address_zh, latitude, longitude')`.

No caching layer for v1 (YAGNI) — this only runs when the Create screen's
venue-picker list renders, for what's expected to be a small, personal-use
list of regular courts. Revisit if it becomes an actual rate-limit or
latency problem.

## Testing

- New `__mocks__/expo-location.js` (parallel to the existing
  `__mocks__/expo-localization.js`), defaulting to a resolved
  `reverseGeocodeAsync` result — every existing test that doesn't care
  about this feature is unaffected.
- `tests/unit/compose-zh-address-test.ts` (new): pure-function unit tests
  for `composeZhAddress` — full parts, partial parts (some null), and
  all-null → `null`.
- `tests/unit/venue-picker-zh-test.tsx` (new): three cases under a mocked
  `zh-TW` locale — `address_zh` present (shown, no geocoding call made);
  `address_zh` null and geocoding succeeds (composed address shown);
  `address_zh` null and geocoding fails (falls back to `venue.address`).
- Every existing test (`en-US` default bucket) keeps passing unchanged —
  none of them exercise this new code path.

## Out of scope

- Editing an existing venue's `address_zh` after creation (no "edit venue"
  flow exists for any field today — this doesn't add one). An organizer
  who wants to add a Mandarin address to an already-existing venue has no
  UI for it yet; only new venues get the manual capture option, with
  every venue (new or old) getting the automatic geocoding fallback.
- A caching layer for reverse-geocode results (see Display / fallback flow
  above).
- Any change to `event-card.tsx` or the event detail screen, since neither
  renders an address today.
