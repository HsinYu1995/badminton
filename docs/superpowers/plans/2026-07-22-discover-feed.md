# Discover Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `(tabs)/index.tsx` screen with a real Discover feed listing upcoming, joinable events, with an adjustable max-distance filter.

**Architecture:** A single new Postgres function, `discover_events(lat, lng, radius_meters)`, is the one place that excludes past/cancelled/full events and optionally applies a distance filter - both the location-available and no-location code paths call it (with or without coordinates), so that filtering logic never gets duplicated. The Discover screen checks location permission on mount (without prompting), calls `discover_events` accordingly, and renders a list of `EventListItem` rows plus (when location is available) a `@expo/ui` `Picker` for the 5/10/20/50 km radius.

**Tech Stack:** Supabase Postgres function + existing RLS policies (no changes needed), `expo-location` (already a dependency, same pattern as `venue-picker.tsx`), `@expo/ui/community/picker` (already a dependency, same pattern as `create.tsx`'s skill-range pickers).

## Global Constraints

- `discover_events` is the single source of truth for "not yet started" (`start_time > now()`), "not cancelled/completed" (`status = 'open'`), and "not full" (accepted-participant count < `headcount_max`) - both the location-filtered and unfiltered code paths call this same function; never duplicate this filtering logic in a second query.
- `execute` on `discover_events` is granted to `authenticated` only, not `anon` - `anon` has no underlying select grant on `events`/`venues`, so granting `anon` execute would be the same dead/misleading grant the create-event plan's final review flagged on `nearby_venues`.
- Distance options are fixed at 5/10/20/50 km via `@expo/ui`'s `Picker`, defaulting to 50 km once location is available. The picker is hidden entirely (not shown disabled) until location is granted - a distance value with no location to measure from has no meaning.
- A denied or failed location fetch never blocks the list - Discover always falls back to the unfiltered `discover_events()` call (all three params omitted) and stays usable.
- List rows are non-interactive - no event-detail screen exists yet, same constraint the create-event plan hit.
- No pull-to-refresh or pagination in this pass.
- Testing philosophy: end-to-end tests against the real local Supabase stack for `discover_events` itself. The location-permission UI flow and the full on-device list behavior are manual verification steps - there is no React Native render/component-test harness in this repo.
- No em dashes in any generated docs, comments, or UI copy - use plain dashes.
- Full design rationale: `docs/superpowers/specs/2026-07-22-discover-feed-design.md`.

---

## File Structure

```
badminton/
  supabase/
    migrations/
      <timestamp>_discover_events.sql   # Create: discover_events() Postgres function
  tests/
    discover-events.test.mjs            # Create: e2e test for time/status/full/distance filters
  src/
    lib/
      skill-bands.ts                     # Modify: add skillBandForLevel() helper
    components/
      event-list-item.tsx                # Create: presentational event row
    app/
      (tabs)/
        index.tsx                        # Modify: full Discover feed (replaces placeholder)
  package.json                            # Modify: add test:discover-events script
```

---

### Task 1: `discover_events` Postgres function

**Files:**
- Create: `supabase/migrations/<timestamp>_discover_events.sql`
- Create: `tests/discover-events.test.mjs`
- Modify: `package.json` (add `test:discover-events` script)

**Interfaces:**
- Consumes: local Supabase stack (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, from prior plans), existing `public.events`/`public.venues`/`public.event_participants` tables and their RLS policies (`events_select_authenticated`, `venues_select_authenticated`, both `using (true)`).
- Produces: `public.discover_events(lat double precision default null, lng double precision default null, radius_meters double precision default null) returns table (id uuid, title text, description text, fee int, start_time timestamptz, end_time timestamptz, headcount_max int, skill_min smallint, skill_max smallint, venue_id uuid, venue_name text, venue_address text, distance_meters double precision)`, callable via `supabase.rpc('discover_events', { lat, lng, radius_meters })` or `supabase.rpc('discover_events', {})`. Task 4's Discover screen consumes this directly.

- [ ] **Step 1: Write the failing test**

```js
// tests/discover-events.test.mjs
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && serviceKey, 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');

const supabase = createClient(url, serviceKey);

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function main() {
  const { data: organizer, error: organizerErr } = await supabase.auth.admin.createUser({
    email: `discover-organizer-${Date.now()}@example.com`,
    password: 'password123',
    email_confirm: true,
  });
  assert(!organizerErr, `createUser (organizer) failed: ${organizerErr?.message}`);

  const { data: participant, error: participantErr } = await supabase.auth.admin.createUser({
    email: `discover-participant-${Date.now()}@example.com`,
    password: 'password123',
    email_confirm: true,
  });
  assert(!participantErr, `createUser (participant) failed: ${participantErr?.message}`);

  const { data: nearVenue, error: nearVenueErr } = await supabase
    .from('venues')
    .insert({
      name: 'Taipei Main Station Courts',
      address: '3 Zhongxiao W Rd, Taipei',
      location: 'SRID=4326;POINT(121.5170 25.0478)',
      created_by: organizer.user.id,
    })
    .select()
    .single();
  assert(!nearVenueErr, `insert near venue failed: ${nearVenueErr?.message}`);

  const { data: farVenue, error: farVenueErr } = await supabase
    .from('venues')
    .insert({
      name: 'Tamsui Courts',
      address: 'Tamsui District, New Taipei',
      location: 'SRID=4326;POINT(121.4488 25.1700)',
      created_by: organizer.user.id,
    })
    .select()
    .single();
  assert(!farVenueErr, `insert far venue failed: ${farVenueErr?.message}`);

  async function insertEvent(overrides) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        organizer_id: organizer.user.id,
        venue_id: nearVenue.id,
        title: 'Discover test event',
        start_time: minutesFromNow(60),
        end_time: minutesFromNow(120),
        headcount_max: 8,
        skill_min: 1,
        skill_max: 18,
        ...overrides,
      })
      .select()
      .single();
    assert(!error, `insert event failed: ${error?.message}`);
    return data;
  }

  const eventNearOpen = await insertEvent({
    title: 'Near, open, future',
    start_time: minutesFromNow(60),
    end_time: minutesFromNow(150),
  });
  const eventNotFullBoundary = await insertEvent({
    title: 'Near, open, future, one spot left',
    start_time: minutesFromNow(80),
    end_time: minutesFromNow(170),
    headcount_max: 2,
  });
  const eventFarOpen = await insertEvent({
    title: 'Far, open, future',
    venue_id: farVenue.id,
    start_time: minutesFromNow(100),
    end_time: minutesFromNow(190),
  });
  const eventFull = await insertEvent({
    title: 'Near, open, future, full',
    start_time: minutesFromNow(120),
    end_time: minutesFromNow(210),
    headcount_max: 1,
  });
  const eventCancelled = await insertEvent({
    title: 'Near, cancelled, future',
    start_time: minutesFromNow(140),
    end_time: minutesFromNow(230),
    status: 'cancelled',
  });
  const eventPast = await insertEvent({
    title: 'Near, open, past',
    start_time: minutesFromNow(-120),
    end_time: minutesFromNow(-60),
  });

  const { error: participant1Err } = await supabase.from('event_participants').insert({
    event_id: eventNotFullBoundary.id,
    user_id: participant.user.id,
    status: 'accepted',
  });
  assert(!participant1Err, `insert accepted participant (not-full event) failed: ${participant1Err?.message}`);

  const { error: participant2Err } = await supabase.from('event_participants').insert({
    event_id: eventFull.id,
    user_id: participant.user.id,
    status: 'accepted',
  });
  assert(!participant2Err, `insert accepted participant (full event) failed: ${participant2Err?.message}`);

  const { data: withRadius, error: withRadiusErr } = await supabase.rpc('discover_events', {
    lat: 25.0478,
    lng: 121.5170,
    radius_meters: 5000,
  });
  assert(!withRadiusErr, `discover_events (with radius) failed: ${withRadiusErr?.message}`);

  const withRadiusIds = withRadius.map((e) => e.id);
  assert(withRadiusIds.includes(eventNearOpen.id), 'expected near open future event within radius');
  assert(withRadiusIds.includes(eventNotFullBoundary.id), 'expected near event with one spot left within radius');
  assert(!withRadiusIds.includes(eventFarOpen.id), 'expected far event excluded by radius');
  assert(!withRadiusIds.includes(eventFull.id), 'expected full event excluded');
  assert(!withRadiusIds.includes(eventCancelled.id), 'expected cancelled event excluded');
  assert(!withRadiusIds.includes(eventPast.id), 'expected past event excluded');

  const nearIndex = withRadiusIds.indexOf(eventNearOpen.id);
  const notFullIndex = withRadiusIds.indexOf(eventNotFullBoundary.id);
  assert(nearIndex < notFullIndex, 'expected results ordered by start_time ascending');

  const nearRow = withRadius.find((e) => e.id === eventNearOpen.id);
  assert(nearRow.distance_meters < 50, `expected near event distance close to 0, got ${nearRow.distance_meters}`);

  const { data: withoutRadius, error: withoutRadiusErr } = await supabase.rpc('discover_events', {});
  assert(!withoutRadiusErr, `discover_events (without radius) failed: ${withoutRadiusErr?.message}`);

  const withoutRadiusIds = withoutRadius.map((e) => e.id);
  assert(withoutRadiusIds.includes(eventNearOpen.id), 'expected near event included without a radius filter');
  assert(withoutRadiusIds.includes(eventNotFullBoundary.id), 'expected not-full event included without a radius filter');
  assert(withoutRadiusIds.includes(eventFarOpen.id), 'expected far event included without a radius filter');
  assert(!withoutRadiusIds.includes(eventFull.id), 'expected full event still excluded without a radius filter');
  assert(!withoutRadiusIds.includes(eventCancelled.id), 'expected cancelled event still excluded without a radius filter');
  assert(!withoutRadiusIds.includes(eventPast.id), 'expected past event still excluded without a radius filter');

  const allDistancesNull = withoutRadius.every((e) => e.distance_meters === null);
  assert(allDistancesNull, 'expected distance_meters to be null when no location is provided');

  console.log('PASS: discover_events excludes past/cancelled/full events, applies the radius filter when given one, and is unfiltered/null-distance when not');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
```

Add to `package.json` scripts:

```json
"test:discover-events": "node --env-file=.env.local tests/discover-events.test.mjs"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:discover-events
```

Expected: FAIL - `discover_events` doesn't exist yet (PostgREST error like `Could not find the function public.discover_events`).

- [ ] **Step 3: Write the migration**

```bash
npx supabase migration new discover_events
```

This creates `supabase/migrations/<timestamp>_discover_events.sql`. Fill it with:

```sql
create or replace function public.discover_events(
  lat double precision default null,
  lng double precision default null,
  radius_meters double precision default null
)
returns table (
  id uuid,
  title text,
  description text,
  fee int,
  start_time timestamptz,
  end_time timestamptz,
  headcount_max int,
  skill_min smallint,
  skill_max smallint,
  venue_id uuid,
  venue_name text,
  venue_address text,
  distance_meters double precision
)
language sql
stable
as $$
  select
    e.id, e.title, e.description, e.fee, e.start_time, e.end_time,
    e.headcount_max, e.skill_min, e.skill_max,
    v.id, v.name, v.address,
    case
      when lat is not null and lng is not null
        then st_distance(v.location, st_setsrid(st_point(lng, lat), 4326)::geography)
      else null
    end as distance_meters
  from public.events e
  join public.venues v on v.id = e.venue_id
  where e.start_time > now()
    and e.status = 'open'
    and (
      select count(*) from public.event_participants p
      where p.event_id = e.id and p.status = 'accepted'
    ) < e.headcount_max
    and (
      lat is null or lng is null or radius_meters is null
      or st_dwithin(v.location, st_setsrid(st_point(lng, lat), 4326)::geography, radius_meters)
    )
  order by e.start_time asc;
$$;

grant execute on function public.discover_events(double precision, double precision, double precision)
  to authenticated;
```

- [ ] **Step 4: Apply the migration**

```bash
npx supabase db reset
```

Expected: output ends with all migrations applying cleanly (no SQL errors).

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:discover-events
```

Expected: `PASS: discover_events excludes past/cancelled/full events, applies the radius filter when given one, and is unfiltered/null-distance when not`

Also re-run the pre-existing suites to confirm nothing regressed:

```bash
npm run test:schema
npm run test:rls
npm run test:create-event
npm run test:skill-bands
```

Expected: all four still `PASS`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/discover-events.test.mjs package.json
git commit -m "feat: add discover_events function for the Discover feed"
```

---

### Task 2: `skillBandForLevel` helper

**Files:**
- Modify: `src/lib/skill-bands.ts`
- Modify: `tests/skill-bands.test.mjs`

**Interfaces:**
- Consumes: `SKILL_BANDS` (already defined in `src/lib/skill-bands.ts`).
- Produces: `export function skillBandForLevel(level: number): SkillBand` - throws if `level` falls outside every band's `[min, max]` range (i.e. outside 1-18). Task 3's `EventListItem` imports this to turn `skill_min`/`skill_max` back into band labels.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `tests/skill-bands.test.mjs` with:

```js
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';
import { SKILL_BANDS, skillBandForLevel } from '../src/lib/skill-bands.ts';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && serviceKey, 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');

const supabase = createClient(url, serviceKey);

async function main() {
  assert.strictEqual(SKILL_BANDS[0].min, 1, 'bands should start at skill level 1');
  assert.strictEqual(SKILL_BANDS[SKILL_BANDS.length - 1].max, 18, 'bands should end at skill level 18');

  for (let i = 0; i < SKILL_BANDS.length - 1; i++) {
    assert.strictEqual(
      SKILL_BANDS[i].max + 1,
      SKILL_BANDS[i + 1].min,
      `bands must be contiguous with no gaps/overlaps: ${SKILL_BANDS[i].id} -> ${SKILL_BANDS[i + 1].id}`
    );
  }

  for (const band of SKILL_BANDS) {
    for (let level = band.min; level <= band.max; level++) {
      const { data, error } = await supabase.rpc('skill_band', { level });
      assert(!error, `skill_band(${level}) rpc failed: ${error?.message}`);
      assert.strictEqual(
        data,
        band.id,
        `level ${level} should map to '${band.id}' per public.skill_band(), got '${data}'`
      );
      assert.strictEqual(
        skillBandForLevel(level).id,
        band.id,
        `skillBandForLevel(${level}) should return the '${band.id}' band`
      );
    }
  }

  assert.throws(() => skillBandForLevel(0), /no skill band/i, 'expected skillBandForLevel to throw for level below 1');
  assert.throws(() => skillBandForLevel(19), /no skill band/i, 'expected skillBandForLevel to throw for level above 18');

  console.log('PASS: SKILL_BANDS is contiguous 1-18, matches public.skill_band() for every level, and skillBandForLevel agrees with SKILL_BANDS');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:skill-bands
```

Expected: FAIL - `skillBandForLevel is not a function` (not exported yet).

- [ ] **Step 3: Write the implementation**

Append to `src/lib/skill-bands.ts`:

```ts
export function skillBandForLevel(level: number): SkillBand {
  const band = SKILL_BANDS.find((b) => level >= b.min && level <= b.max);
  if (!band) {
    throw new Error(`No skill band found for level ${level}`);
  }
  return band;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:skill-bands
```

Expected: `PASS: SKILL_BANDS is contiguous 1-18, matches public.skill_band() for every level, and skillBandForLevel agrees with SKILL_BANDS`

- [ ] **Step 5: Commit**

```bash
git add src/lib/skill-bands.ts tests/skill-bands.test.mjs
git commit -m "feat: add skillBandForLevel helper"
```

---

### Task 3: `EventListItem` component

**Files:**
- Create: `src/components/event-list-item.tsx`

**Interfaces:**
- Consumes: `skillBandForLevel` (Task 2, `@/lib/skill-bands`).
- Produces: `export type DiscoverEvent = { id: string; title: string; venue_name: string; distance_meters: number | null; start_time: string; fee: number; skill_min: number; skill_max: number }` and `export function EventListItem({ event }: { event: DiscoverEvent }): JSX.Element` from `src/components/event-list-item.tsx`. Task 4's Discover screen imports both.

- [ ] **Step 1: Write the component**

```tsx
// src/components/event-list-item.tsx
import { View, Text, StyleSheet } from 'react-native';
import { skillBandForLevel } from '@/lib/skill-bands';

export type DiscoverEvent = {
  id: string;
  title: string;
  venue_name: string;
  distance_meters: number | null;
  start_time: string;
  fee: number;
  skill_min: number;
  skill_max: number;
};

function formatStartTime(startTime: string): string {
  return new Date(startTime).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFee(fee: number): string {
  return fee === 0 ? 'Free' : `NT$ ${fee}`;
}

function formatSkillRange(skillMin: number, skillMax: number): string {
  return `${skillBandForLevel(skillMin).label}-${skillBandForLevel(skillMax).label}`;
}

export function EventListItem({ event }: { event: DiscoverEvent }) {
  const venueLine =
    event.distance_meters === null
      ? event.venue_name
      : `${event.venue_name} - ${(event.distance_meters / 1000).toFixed(1)} km`;

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.venue}>{venueLine}</Text>
      <Text style={styles.meta}>
        {formatStartTime(event.start_time)} - {formatFee(event.fee)}
      </Text>
      <Text style={styles.skill}>Skill: {formatSkillRange(event.skill_min, event.skill_max)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', gap: 2, marginBottom: 8 },
  title: { fontWeight: '600', fontSize: 16 },
  venue: { color: '#333' },
  meta: { color: '#666' },
  skill: { color: '#666' },
});
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

There is no automated test for this component: it is a pure presentational render, and this repo has no React Native render/component-test harness (same as `venue-picker.tsx`). It is exercised manually as part of Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/event-list-item.tsx
git commit -m "feat: add EventListItem component"
```

---

### Task 4: Discover screen

**Files:**
- Modify: `src/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `discover_events` RPC (Task 1); `EventListItem`, `type DiscoverEvent` (Task 3, `@/components/event-list-item`); `supabase` (`src/lib/supabase.ts`); `expo-location` (already installed, same import pattern as `src/components/venue-picker.tsx`); `Picker` (`@expo/ui/community/picker`, options via its static `Picker.Item` property, same pattern as `src/app/(tabs)/create.tsx`).
- Produces: the finished Discover screen. Nothing later in this plan consumes its output directly - Task 5 exercises it manually.

- [ ] **Step 1: Build the screen**

```tsx
// src/app/(tabs)/index.tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { Picker } from '@expo/ui/community/picker';
import { supabase } from '@/lib/supabase';
import { EventListItem, type DiscoverEvent } from '@/components/event-list-item';

const RADIUS_OPTIONS_KM = [5, 10, 20, 50] as const;
const DEFAULT_RADIUS_KM = 50;

export default function DiscoverScreen() {
  const [events, setEvents] = useState<DiscoverEvent[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [enablingLocation, setEnablingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  async function fetchWithLocation(km: number) {
    setEvents(null);
    setFetchError(null);
    try {
      const position = await Location.getCurrentPositionAsync();
      const { data, error } = await supabase.rpc('discover_events', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        radius_meters: km * 1000,
      });
      if (error) throw error;
      setEvents(data ?? []);
      setLocationEnabled(true);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Could not load events.');
    }
  }

  async function fetchWithoutLocation() {
    setEvents(null);
    setFetchError(null);
    const { data, error } = await supabase.rpc('discover_events', {});
    if (error) setFetchError(error.message);
    else setEvents(data ?? []);
  }

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((permission) => {
      if (permission.granted) fetchWithLocation(DEFAULT_RADIUS_KM);
      else fetchWithoutLocation();
    });
  }, []);

  async function handleEnableLocation() {
    setLocationError(null);
    setEnablingLocation(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError('Location permission is required to filter by distance.');
        return;
      }
      await fetchWithLocation(radiusKm);
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not get current location.');
    } finally {
      setEnablingLocation(false);
    }
  }

  function handleRadiusChange(value: string) {
    const km = Number(value);
    setRadiusKm(km);
    fetchWithLocation(km);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Discover</Text>

      {!locationEnabled && (
        <View style={styles.locationBanner}>
          <Text style={styles.locationBannerText}>Enable location to filter by distance</Text>
          <Pressable style={styles.enableButton} onPress={handleEnableLocation} disabled={enablingLocation}>
            <Text style={styles.enableButtonText}>{enablingLocation ? 'Enabling...' : 'Enable'}</Text>
          </Pressable>
          {locationError && (
            <View>
              <Text style={styles.error}>{locationError}</Text>
              <Pressable onPress={handleEnableLocation}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {locationEnabled && (
        <View style={styles.distanceFilter}>
          <Text style={styles.label}>Max distance</Text>
          <Picker selectedValue={String(radiusKm)} onValueChange={handleRadiusChange}>
            {RADIUS_OPTIONS_KM.map((km) => (
              <Picker.Item key={km} label={`${km} km`} value={String(km)} />
            ))}
          </Picker>
        </View>
      )}

      {events === null && !fetchError && <ActivityIndicator style={styles.spinner} />}
      {fetchError && <Text style={styles.error}>{fetchError}</Text>}
      {events !== null && events.length === 0 && <Text style={styles.emptyText}>No upcoming events</Text>}
      {events !== null && events.map((event) => <EventListItem key={event.id} event={event} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 12 },
  label: { fontWeight: '600' },
  locationBanner: { backgroundColor: '#eaf4ff', borderRadius: 8, padding: 12, gap: 8, marginBottom: 12 },
  locationBannerText: { color: '#333' },
  enableButton: { backgroundColor: '#208AEF', padding: 10, borderRadius: 8, alignItems: 'center' },
  enableButtonText: { color: '#fff', fontWeight: '600' },
  distanceFilter: { marginBottom: 12 },
  spinner: { marginTop: 24 },
  emptyText: { color: '#666', marginTop: 24, textAlign: 'center' },
  error: { color: 'red', marginTop: 8 },
  retryText: { color: '#208AEF' },
});
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/index.tsx"
git commit -m "feat: build Discover feed with distance filter"
```

---

### Task 5: Manual on-device verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the fully assembled Discover feed from Tasks 1-4.
- Produces: nothing for later tasks - this is the last task in the plan.

This step needs a human with the app running on a device/emulator, already signed in - it can't be scripted (see Global Constraints).

- [ ] **Step 1: Start the stack**

```bash
npx supabase status
npm run android:emulator
```

- [ ] **Step 2: Walk through the no-location path**

On first opening the Discover tab (before granting location permission), confirm:
1. The "Enable location to filter by distance" banner shows, with an Enable button.
2. No distance picker is shown.
3. The list shows all of your upcoming, open, not-full events (including any created via the create-event flow), unfiltered by distance.

- [ ] **Step 3: Walk through granting location**

1. Tap Enable. Grant the location permission prompt when it appears.
2. Confirm the banner disappears and a "Max distance" picker (5/10/20/50 km, defaulted to 50 km) appears.
3. Confirm each list row now also shows a distance (e.g. "Da-An Park Courts - 2.1 km").
4. Change the distance picker to a smaller value (e.g. 5 km) and confirm the list narrows to only nearby events; change it back to 50 km and confirm it widens again.

- [ ] **Step 4: Walk through the permission-denied path**

1. Revoke location permission for the app in device Settings.
2. Reopen the app (or navigate away from and back to Discover).
3. Confirm the Enable banner reappears and the list still shows (unfiltered), rather than blocking or erroring.

- [ ] **Step 5: Confirm full/cancelled/past events never appear**

Using Supabase Studio (URL from `npx supabase status`):
1. Pick one of your upcoming events and insert `event_participants` rows with `status = 'accepted'` until the count reaches that event's `headcount_max`.
2. Refresh Discover and confirm that event no longer appears.
3. Set another upcoming event's `status` to `cancelled` directly in Studio, refresh Discover, and confirm it no longer appears.
4. Confirm any event with a `start_time` in the past never appears (this should already hold for pre-existing seed data from earlier manual testing).

- [ ] **Step 6: Note any findings**

If anything above doesn't match, fix it in the relevant task's files, re-run that task's automated checks, and re-verify here before considering the plan complete.

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers "Backend: a single `discover_events` function" in full, including the not-full aggregate, the status/time filters, and the nullable-distance behavior. Task 2 covers the `skillBandForLevel` helper called out in "List item". Task 3 covers the `EventListItem` row contents (title, venue+distance, date/time, fee, skill range) from the design's "List item" section. Task 4 covers "Discover screen behavior" in full: the mount-time permission check, both fetch paths, the Enable flow, and the distance picker. Task 5 covers the design's manual-verification expectations for the location flow and the full/cancelled/past exclusions. No design section is without a task.
- **Placeholder scan:** all SQL, TypeScript, and test code above is complete and runnable as written; no TBD/TODO markers.
- **Type consistency:** `DiscoverEvent` is defined once in Task 3 and consumed with that exact shape (`id`, `title`, `venue_name`, `distance_meters`, `start_time`, `fee`, `skill_min`, `skill_max`) in Task 4's `events.map((event) => <EventListItem key={event.id} event={event} />)`. These field names match `discover_events`'s `returns table` column names exactly (Task 1), so the RPC's response rows satisfy `DiscoverEvent` without any client-side renaming. `skillBandForLevel` is defined once in Task 2 (`src/lib/skill-bands.ts`) and imported with that exact name in Task 3.
