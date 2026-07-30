# Mandarin Venue Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a Mandarin court/venue address to `zh-TW` viewers in the venue-picker list — an organizer-authored `address_zh` when one exists, else an automatic on-device reverse-geocoding fallback derived from the venue's stored coordinates, else the original English/free-text address.

**Architecture:** A new nullable `address_zh` column plus two generated `latitude`/`longitude` columns on `venues` (migration only, no RLS change). A new pure function `composeZhAddress` in a new `src/lib/venues.ts` composes a Mandarin address string from `expo-location`'s `reverseGeocodeAsync` result. `src/components/venue-picker.tsx`'s venue-loading effect resolves each venue's `displayAddress` once, up front (before `setVenues`), skipping geocoding entirely for `en-US` viewers or venues that already have `address_zh`.

**Tech Stack:** React Native / Expo SDK 57, Supabase (Postgres + PostGIS), `expo-location` (already a dependency), Jest (`jest-expo` preset).

## Global Constraints

- `address_zh` is nullable, no default, no backfill for existing venues.
- No RLS policy changes — existing `venues_select_authenticated`/`venues_insert_authenticated` policies already permit the new columns (Postgres RLS is row-level, not column-level).
- Never call `reverseGeocodeAsync` for an `en-US` viewer, and never call it when `venue.address_zh` is already set — an organizer-authored value always wins over a computed one.
- No caching layer for reverse-geocode results (YAGNI, explicitly out of scope per the design spec).
- `reverseGeocodeAsync` is unavailable on web and must degrade to `venue.address` there, and on any geocoding failure (thrown error, empty result array, or `composeZhAddress` returning `null`).
- Every existing test must keep passing unchanged — none of them exercise the new `zh-TW` venue-address code path today.
- Full plan is done when `npx jest` passes with zero failures and `npx tsc --noEmit` reports zero errors.

---

### Task 1: Database migration — `address_zh`, `latitude`, `longitude`

**Files:**
- Create: `supabase/migrations/20260728140000_venue_mandarin_address.sql`

**Interfaces:**
- Produces: `venues.address_zh text` (nullable), `venues.latitude double precision` (generated, stored), `venues.longitude double precision` (generated, stored).

- [ ] **Step 1: Read the existing venues table definition**

Read `supabase/migrations/20260716084150_init_schema.sql` lines 50-59 (confirmed current):
```sql
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  location geography(point, 4326) not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index venues_location_idx on public.venues using gist (location);
```

- [ ] **Step 2: Write the migration**

```sql
-- File: supabase/migrations/20260728140000_venue_mandarin_address.sql

-- Optional organizer-authored Mandarin address (see docs/superpowers/specs/
-- 2026-07-28-mandarin-venue-address-design.md). NULL means "not yet
-- translated" - the display-side fallback in venue-picker.tsx reverse-
-- geocodes the venue's own coordinates for a zh-TW viewer in that case.
alter table public.venues add column address_zh text;

-- Exposes venues.location's coordinates as plain doubles for the client -
-- there is no existing precedent in this codebase for reading raw lat/lng
-- off a geography column (the one existing consumer, discover_events,
-- computes st_distance entirely server-side and never returns
-- coordinates - confirmed by grep, no ST_Y/ST_X/latitude/longitude
-- anywhere in that migration). Generated + stored so they're computed once
-- from the existing `location` value with no application code needed to
-- keep them in sync.
alter table public.venues
  add column latitude double precision generated always as (st_y(location::geometry)) stored,
  add column longitude double precision generated always as (st_x(location::geometry)) stored;
```

- [ ] **Step 3: Apply the migration to the local Supabase instance**

Run: `npx supabase migration up` (check `npx supabase status` first to confirm the local stack is running; if not, `npx supabase start`).

- [ ] **Step 4: Verify the new columns exist and compute correctly**

Run:
```bash
docker exec supabase_db_badminton psql -U postgres -d postgres -c "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='venues' and column_name in ('address_zh','latitude','longitude');"
```
Expected: three rows — `address_zh` (`text`), `latitude` (`double precision`), `longitude` (`double precision`).

If any existing venue rows are present in the local dev database, also run:
```bash
docker exec supabase_db_badminton psql -U postgres -d postgres -c "select id, st_y(location::geometry) as lat, latitude, st_x(location::geometry) as lng, longitude from public.venues limit 1;"
```
Expected: `lat = latitude` and `lng = longitude` for that row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260728140000_venue_mandarin_address.sql
git commit -m "feat(venues): add address_zh and generated latitude/longitude columns"
```

---

### Task 2: `composeZhAddress` pure function

**Files:**
- Create: `src/lib/venues.ts`
- Test: `tests/unit/compose-zh-address-test.ts`

**Interfaces:**
- Produces: `type ReverseGeocodedAddress = { region: string | null; city: string | null; district: string | null; street: string | null; streetNumber: string | null }`; `composeZhAddress(parts: ReverseGeocodedAddress): string | null`.
- Consumed by: Task 6 (`venue-picker.tsx`'s display/fallback resolution).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/compose-zh-address-test.ts
import { composeZhAddress } from '@/lib/venues';

describe('composeZhAddress', () => {
  it('concatenates every part, largest-to-smallest administrative unit', () => {
    expect(
      composeZhAddress({
        region: '台北市',
        city: '大安區',
        district: '文山里',
        street: '和平東路二段',
        streetNumber: '106號',
      })
    ).toBe('台北市大安區文山里和平東路二段106號');
  });

  it('skips null parts without leaving gaps', () => {
    expect(
      composeZhAddress({
        region: '台北市',
        city: null,
        district: null,
        street: '和平東路二段',
        streetNumber: '106號',
      })
    ).toBe('台北市和平東路二段106號');
  });

  it('returns null when every part is null', () => {
    expect(
      composeZhAddress({ region: null, city: null, district: null, street: null, streetNumber: null })
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/compose-zh-address-test.ts`
Expected: FAIL — `Cannot find module '@/lib/venues'`

- [ ] **Step 3: Write `src/lib/venues.ts`**

```ts
// src/lib/venues.ts

export type ReverseGeocodedAddress = {
  region: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  streetNumber: string | null;
};

// Concatenates the non-null parts in largest-to-smallest administrative
// order (region, city, district, street, streetNumber) - the Taiwanese
// address convention, opposite of Western smallest-to-largest order.
// Returns null when every part is null (nothing to show).
export function composeZhAddress(parts: ReverseGeocodedAddress): string | null {
  const ordered = [parts.region, parts.city, parts.district, parts.street, parts.streetNumber];
  const present = ordered.filter((part): part is string => part != null);
  if (present.length === 0) return null;
  return present.join('');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/compose-zh-address-test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/venues.ts tests/unit/compose-zh-address-test.ts
git commit -m "feat(venues): add composeZhAddress pure function"
```

---

### Task 3: `expo-location` Jest mock

**Files:**
- Create: `__mocks__/expo-location.js`

**Interfaces:**
- Produces: a default-resolved `reverseGeocodeAsync` mock, parallel to the existing `__mocks__/expo-localization.js` (confirmed current: `getLocales`/`useLocales` both returning a single `en-US` locale object). Individual tests override with their own `jest.mock('expo-location', ...)` exactly like the `*-zh-test.tsx` files already do for `expo-localization`.

- [ ] **Step 1: Read `venue-picker.tsx`'s existing `expo-location` usage to match the real API shape**

Confirmed current (`src/components/venue-picker.tsx:3,51,56`): `import * as Location from 'expo-location';`, then `Location.requestForegroundPermissionsAsync()` and `Location.getCurrentPositionAsync()`. The new call this plan adds (Task 6) is `Location.reverseGeocodeAsync({ latitude, longitude })`, which resolves to an array of address objects (SDK 57's `LocationGeocodedAddress[]`, fields including `region`, `city`, `district`, `street`, `streetNumber`, all `string | null`).

- [ ] **Step 2: Write `__mocks__/expo-location.js`**

```js
// __mocks__/expo-location.js
function requestForegroundPermissionsAsync() {
  return Promise.resolve({ granted: true });
}

function getCurrentPositionAsync() {
  return Promise.resolve({ coords: { latitude: 25.033, longitude: 121.5654 } });
}

function reverseGeocodeAsync() {
  return Promise.resolve([
    { region: '台北市', city: '大安區', district: null, street: '和平東路二段', streetNumber: '106號' },
  ]);
}

module.exports = {
  requestForegroundPermissionsAsync,
  getCurrentPositionAsync,
  reverseGeocodeAsync,
};
```

- [ ] **Step 3: Run the full suite to confirm nothing broke**

Run: `npx jest`
Expected: PASS, same suite/test counts as before this task — this manual mock is now auto-applied to every `expo-location` import, replacing the real native module in every test, including any existing test that exercises `venue-picker.tsx`'s "Use current location" button (search `tests/unit/` for `useCurrentLocation`/`locationCaptured` to find them and confirm each still passes with this mock's `requestForegroundPermissionsAsync`/`getCurrentPositionAsync` behavior standing in for whatever they relied on before).

- [ ] **Step 4: Commit**

```bash
git add __mocks__/expo-location.js
git commit -m "test(venues): add expo-location Jest manual mock"
```

---

### Task 4: i18n dictionary keys

**Files:**
- Modify: `src/lib/i18n.tsx:146` (en dictionary, after `venuePicker.addressPlaceholder`)
- Modify: `src/lib/i18n.tsx:292` (zhTW dictionary, after `venuePicker.addressPlaceholder`)

**Interfaces:**
- Produces: `'venuePicker.addressZhLabel'` and `'venuePicker.addressZhPlaceholder'` keys in both `Translations` dictionaries.
- Consumed by: Task 5 (the new optional `TextInput` in `venue-picker.tsx`).

- [ ] **Step 1: Confirm the current baseline**

Run: `npx jest tests/unit/i18n-test.ts`
Expected: PASS (the dictionary-parity test — this is a baseline check before any edits, not a failing test yet, since parity only breaks once one dictionary gets a new key the other lacks).

- [ ] **Step 2: Add the English key**

In `src/lib/i18n.tsx`, immediately after line 146 (`'venuePicker.addressPlaceholder': 'Address',`):
```ts
  'venuePicker.addressZhLabel': 'Mandarin address (optional)',
  'venuePicker.addressZhPlaceholder': 'Address in Mandarin, for Taiwan-based players',
```

- [ ] **Step 3: Run the parity test to confirm it now fails**

Run: `npx jest tests/unit/i18n-test.ts`
Expected: FAIL — `zhTWKeys` no longer matches `enKeys` (two extra keys only in `en`)

- [ ] **Step 4: Add the Mandarin key**

In `src/lib/i18n.tsx`, immediately after the (now shifted by +2) `'venuePicker.addressPlaceholder': '地址',` line:
```ts
  'venuePicker.addressZhLabel': '中文地址（選填）',
  'venuePicker.addressZhPlaceholder': '中文地址，方便台灣球友辨識',
```

- [ ] **Step 5: Run the parity test to confirm it passes again**

Run: `npx jest tests/unit/i18n-test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat(i18n): add venuePicker.addressZh translation keys"
```

---

### Task 5: `venue-picker.tsx` — schema, capture flow, query updates

**Files:**
- Modify: `src/components/venue-picker.tsx`
- Test: `tests/unit/create-submit-test.tsx` (existing — verify it still passes unchanged; its `mockVenue = { id: 'venue-1', name: 'Fake Court', address: '123 Fake Rd' }` at line 3 doesn't include the new columns, which is fine under the default `en-US` locale mock since that branch never reads `address_zh`/`latitude`/`longitude`)

**Interfaces:**
- Consumes: `venuePicker.addressZhLabel`/`venuePicker.addressZhPlaceholder` (Task 4).
- Produces: `Venue` type gains `address_zh: string | null`, `latitude: number`, `longitude: number`. `handleSaveVenue` inserts `address_zh`.
- Consumed by: Task 6 (display/fallback resolution reads `venue.address_zh`/`venue.latitude`/`venue.longitude`).

- [ ] **Step 1: Update the `Venue` type and the venues-loading select**

```ts
// Before (venue-picker.tsx:8-12):
export type Venue = {
  id: string;
  name: string;
  address: string;
};

// After:
export type Venue = {
  id: string;
  name: string;
  address: string;
  address_zh: string | null;
  latitude: number;
  longitude: number;
};
```

```ts
// Before (venue-picker.tsx:38):
      .select('id, name, address')
// After:
      .select('id, name, address, address_zh, latitude, longitude')
```

- [ ] **Step 2: Add the new optional `TextInput` to the "add new venue" form**

```ts
// Add new state, alongside the existing newVenueName/newVenueAddress state (venue-picker.tsx:27-28):
  const [newVenueAddressZh, setNewVenueAddressZh] = useState('');
```

```tsx
// In the JSX, immediately after the existing address TextInput (after venue-picker.tsx:129's closing `/>`):
          <TextInput
            style={styles.input}
            placeholder={t('venuePicker.addressZhPlaceholder')}
            value={newVenueAddressZh}
            onChangeText={setNewVenueAddressZh}
          />
```

(No label `Text` element is used elsewhere in this form for the existing name/address inputs either — placeholders alone match the existing pattern; this render site intentionally doesn't use `venuePicker.addressZhLabel` for the same reason. Keep the key defined in the dictionary regardless — dropping it would break Task 4's parity test.)

- [ ] **Step 3: Update `handleSaveVenue`'s insert**

```ts
// Before (venue-picker.tsx:70-79):
      const { data, error } = await supabase
        .from('venues')
        .insert({
          name: newVenueName.trim(),
          address: newVenueAddress.trim(),
          location: `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`,
          created_by: session.user.id,
        })
        .select('id, name, address')
        .single();

// After:
      const { data, error } = await supabase
        .from('venues')
        .insert({
          name: newVenueName.trim(),
          address: newVenueAddress.trim(),
          address_zh: newVenueAddressZh.trim() || null,
          location: `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`,
          created_by: session.user.id,
        })
        .select('id, name, address, address_zh, latitude, longitude')
        .single();
```

- [ ] **Step 4: Reset the new field on successful save**

```ts
// Before (venue-picker.tsx:82-86, inside the try block after onSelect(data)):
      setShowNewVenueForm(false);
      setNewVenueName('');
      setNewVenueAddress('');
      setCoords(null);

// After:
      setShowNewVenueForm(false);
      setNewVenueName('');
      setNewVenueAddress('');
      setNewVenueAddressZh('');
      setCoords(null);
```

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npx jest`
Expected: PASS, all suites — `create-submit-test.tsx`'s `mockVenue` still satisfies what's rendered under the default `en-US` mock since Jest doesn't type-check test fixtures at runtime, and no test currently asserts on venue-list address text for this file.

- [ ] **Step 6: Run the TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: zero errors. If `create-submit-test.tsx`'s `mockVenue` literal is checked against the `Venue` type anywhere and this surfaces a missing-properties error, add `address_zh: null, latitude: 25.0, longitude: 121.5` to that file's `mockVenue` object (test-only fixture change, not a behavior change) and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/components/venue-picker.tsx tests/unit/create-submit-test.tsx
git commit -m "feat(venues): capture optional Mandarin address, extend venue queries"
```

---

### Task 6: Display / fallback resolution

**Files:**
- Modify: `src/components/venue-picker.tsx`

**Interfaces:**
- Consumes: `composeZhAddress` (Task 2), `useI18n()`'s `locale` (already imported in this file for `t`), `Location.reverseGeocodeAsync` (Task 3's mock in tests).
- Produces: `Venue` type gains `displayAddress: string` (client-only, not persisted); the rendered venue list reads `venue.displayAddress` instead of `venue.address`.

- [ ] **Step 1: Add the `displayAddress` field and the resolution helper**

```ts
// Add import at the top of venue-picker.tsx:
import { composeZhAddress } from '@/lib/venues';
```

```ts
// Extend the Venue type again (from Task 5's version):
export type Venue = {
  id: string;
  name: string;
  address: string;
  address_zh: string | null;
  latitude: number;
  longitude: number;
  displayAddress: string;
};
```

```ts
// New helper function, placed above the VenuePicker component:
async function resolveDisplayAddress(venue: Omit<Venue, 'displayAddress'>, locale: 'en-US' | 'zh-TW'): Promise<string> {
  if (locale !== 'zh-TW') return venue.address;
  if (venue.address_zh) return venue.address_zh;
  if (Platform.OS === 'web') return venue.address;
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: venue.latitude, longitude: venue.longitude });
    const composed = results[0] ? composeZhAddress(results[0]) : null;
    return composed ?? venue.address;
  } catch {
    return venue.address;
  }
}
```

```ts
// Add Platform to the existing react-native import:
// Before:
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
// After:
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, Platform } from 'react-native';
```

- [ ] **Step 2: Wire the resolution into the venue-loading effect**

```ts
// Before (venue-picker.tsx:21):
  const { t } = useI18n();
// After:
  const { t, locale } = useI18n();
```

```ts
// Before (the existing useEffect, venue-picker.tsx:35-45):
  useEffect(() => {
    supabase
      .from('venues')
      .select('id, name, address, address_zh, latitude, longitude')
      .order('name')
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else setVenues(data ?? []);
        setLoading(false);
      });
  }, []);

// After:
  useEffect(() => {
    supabase
      .from('venues')
      .select('id, name, address, address_zh, latitude, longitude')
      .order('name')
      .then(async ({ data, error }) => {
        if (error) {
          setLoadError(error.message);
          setLoading(false);
          return;
        }
        const rows = data ?? [];
        const withDisplayAddress = await Promise.all(
          rows.map(async (venue) => ({ ...venue, displayAddress: await resolveDisplayAddress(venue, locale) }))
        );
        setVenues(withDisplayAddress);
        setLoading(false);
      });
  }, [locale]);
```

(`locale` in the dependency array: if the device locale bucket changes mid-session — Android can do this without an app restart, per this app's existing i18n design — the venue list re-resolves addresses in the new locale, mirroring how `I18nProvider` itself already re-renders on a live locale change.)

- [ ] **Step 3: Update the render to use `displayAddress`**

```tsx
// Before (venue-picker.tsx:106):
          <Text style={styles.venueAddress}>{venue.address}</Text>
// After:
          <Text style={styles.venueAddress}>{venue.displayAddress}</Text>
```

- [ ] **Step 4: Run the full suite**

Run: `npx jest`
Expected: PASS, all suites. Every existing test either mocks `expo-localization` to `en-US` (the default `resolveDisplayAddress` branch, no geocoding call) or, where it overrides to `zh-TW`, doesn't render `VenuePicker` with any venues in its mock data (`data: []` — confirmed for `create-zh-test.tsx` and `skill-band-selector-test.tsx`), so `Promise.all([])` resolves immediately with no geocoding calls either way.

- [ ] **Step 5: Run the TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/venue-picker.tsx
git commit -m "feat(venues): resolve Mandarin display address with geocoding fallback"
```

---

### Task 7: `venue-picker-zh-test.tsx`

**Files:**
- Create: `tests/unit/venue-picker-zh-address-test.tsx`
- Create: `tests/unit/venue-picker-zh-fallback-test.tsx`
- Create: `tests/unit/venue-picker-zh-error-test.tsx`

**Interfaces:**
- Consumes: the `expo-location` mock override pattern (Task 3), `venue-picker.tsx`'s `displayAddress` resolution (Task 6).

Three separate files, one case each — matching this codebase's established pattern (every other `*-zh-test.tsx` file uses top-level hoisted `jest.mock` calls, one scenario per file) rather than multiple `jest.doMock`/`jest.resetModules` cases crammed into one file, which risks module-cache bleed between cases under `expo-router/testing-library`'s `renderRouter`.

- [ ] **Step 1: Write the organizer-authored-address case**

```tsx
// tests/unit/venue-picker-zh-address-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

const reverseGeocodeAsync = jest.fn();
jest.mock('expo-location', () => ({ reverseGeocodeAsync }));

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [
              {
                id: 'venue-1',
                name: 'Fake Court',
                address: '123 Fake Rd',
                address_zh: '台北市大安區和平東路二段106號',
                latitude: 25.033,
                longitude: 121.5654,
              },
            ],
            error: null,
          }),
      }),
    }),
  },
}));

describe('VenuePicker under zh-TW locale', () => {
  it('shows the organizer-authored address_zh without calling reverseGeocodeAsync', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    await screen.findByText('台北市大安區和平東路二段106號');
    expect(reverseGeocodeAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the geocoding-fallback case**

```tsx
// tests/unit/venue-picker-zh-fallback-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

jest.mock('expo-location', () => ({
  reverseGeocodeAsync: () =>
    Promise.resolve([{ region: '台北市', city: '大安區', district: null, street: '和平東路二段', streetNumber: '106號' }]),
}));

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [{ id: 'venue-1', name: 'Fake Court', address: '123 Fake Rd', address_zh: null, latitude: 25.033, longitude: 121.5654 }],
            error: null,
          }),
      }),
    }),
  },
}));

describe('VenuePicker under zh-TW locale with no address_zh', () => {
  it('falls back to reverse-geocoding', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    await screen.findByText('台北市大安區和平東路二段106號');
  });
});
```

- [ ] **Step 3: Write the geocoding-failure case**

```tsx
// tests/unit/venue-picker-zh-error-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

jest.mock('expo-location', () => ({
  reverseGeocodeAsync: () => Promise.reject(new Error('geocoding unavailable')),
}));

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [{ id: 'venue-1', name: 'Fake Court', address: '123 Fake Rd', address_zh: null, latitude: 25.033, longitude: 121.5654 }],
            error: null,
          }),
      }),
    }),
  },
}));

describe('VenuePicker under zh-TW locale when geocoding fails', () => {
  it('falls back to the original address', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    await screen.findByText('123 Fake Rd');
  });
});
```

- [ ] **Step 4: Run the three new test files**

Run: `npx jest tests/unit/venue-picker-zh-address-test.tsx tests/unit/venue-picker-zh-fallback-test.tsx tests/unit/venue-picker-zh-error-test.tsx`
Expected: PASS (3 tests total, one per file)

- [ ] **Step 5: Run the full suite**

Run: `npx jest`
Expected: PASS, all suites, zero failures.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/venue-picker-zh-address-test.tsx tests/unit/venue-picker-zh-fallback-test.tsx tests/unit/venue-picker-zh-error-test.tsx
git commit -m "test(venues): cover address_zh, geocoding fallback, and error fallback"
```

---

### Task 8: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete unit/component suite**

Run: `npx jest`
Expected: PASS, zero failures, every suite from before this plan plus `compose-zh-address-test.ts`, `venue-picker-zh-address-test.tsx`, `venue-picker-zh-fallback-test.tsx`, and `venue-picker-zh-error-test.tsx`.

- [ ] **Step 2: Run the TypeScript compiler standalone**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Confirm the i18n dictionary-parity test specifically still passes**

Run: `npx jest tests/unit/i18n-test.ts`
Expected: PASS.

- [ ] **Step 4: Manually verify the migration applied cleanly**

Run: `docker exec supabase_db_badminton psql -U postgres -d postgres -c "\d public.venues"` and confirm `address_zh`, `latitude`, `longitude` all appear.

- [ ] **Step 5: Final commit (only if Steps 1-4 required any fixups not already committed)**

```bash
git add -A
git commit -m "chore(venues): final full-suite verification pass"
```

If nothing needed fixing, skip this step — there is nothing to commit.

---

## Self-Review

**Spec coverage:** Data model (Task 1) ✓. "Why not machine translation or a paid geocoding API" — documentation-only rationale already in the spec, no task needed. Capture flow (Task 5) ✓. Display/fallback flow (Tasks 2, 3, 6) ✓. Testing (Task 2's unit test, Task 7's three cases, Task 3's mock) ✓. Out-of-scope items (edit-existing-venue, caching, event-card/detail changes) — correctly not tasked, matching the spec's explicit exclusions.

**Placeholder scan:** No TBD/TODO/"similar to Task N" patterns; every step has real code or an exact command.

**Type consistency:** `Venue` type is introduced in Task 5 (`address_zh`, `latitude`, `longitude`) and extended in Task 6 (`displayAddress`) — both extend the same base type rather than redefining it, and `resolveDisplayAddress`'s parameter type (`Omit<Venue, 'displayAddress'>`) matches exactly what Task 5's select query returns before Task 6's field is added. `composeZhAddress`'s `ReverseGeocodedAddress` type (Task 2) matches the shape returned by Task 3's `reverseGeocodeAsync` mock and consumed in Task 6's `results[0]`. `locale`'s type (`'en-US' | 'zh-TW'`) matches `useI18n()`'s existing return type used throughout the rest of this app.
