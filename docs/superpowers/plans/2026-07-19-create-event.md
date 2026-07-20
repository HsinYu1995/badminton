# Create Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `(tabs)/create.tsx` screen with a working organizer flow for creating an event (title, description, venue, headcount, fee, date/time, skill range), including the venue-selection/venue-creation flow it depends on.

**Architecture:** A new `events` migration adds `description`/`fee` columns. A standalone `VenuePicker` component lists existing venues and lets the organizer add a new one (name + address + current-GPS pin via `expo-location`, no interactive map). The `create.tsx` screen composes `VenuePicker` with plain `TextInput`s, `@expo/ui`'s bundled `DateTimePicker`/`Picker` (already an installed dependency - no new package needed for date/time/band selection), validates client-side, inserts into `events`, and navigates to the Discover tab on success.

**Tech Stack:** Supabase Postgres migration + RLS (existing policies, no changes needed), `expo-location` (new dependency), `@expo/ui/community/datetime-picker` and `@expo/ui/community/picker` (already installed via `@expo/ui`), `expo-router`'s `useRouter`.

## Global Constraints

- Venue location is captured via `expo-location`'s current-GPS position only - no interactive map picker, no manual lat/lng entry, no address geocoding fallback. If location permission is denied, venue creation is blocked with an inline error and a retry action.
- Venue selection is a plain list + an "Add new venue" row - no search/filter box.
- Skill range is chosen as two of the 7 named bands (novice, beginner, early_intermediate, intermediate, intermediate_advanced, advanced, professional), converted to numeric `skill_min`/`skill_max` for storage. The band-to-range mapping in `src/lib/skill-bands.ts` must stay in sync with `public.skill_band()`'s SQL `case` statement in `supabase/migrations/20260716084150_init_schema.sql`.
- Date/start-time/duration (in minutes) are used instead of separate start/end time pickers - `end_time` is always computed, so an organizer can never enter an end time before the start time.
- Fee is a plain non-negative whole number (0 = free), labeled "NT$" in the UI, no currency picker - `events.fee` is an `integer` column (Task 1), so client validation must reject non-integer input, not just negative input.
- After a successful create, navigate to the Discover tab (`/`) - no event-detail screen exists yet.
- Testing philosophy: end-to-end tests against the real local Supabase stack (real Postgres, real RLS) for anything that doesn't require a device sensor or a rendered UI. The location-permission flow and the actual on-device form walkthrough are manual verification steps, not automated tests - there is no component-test/render harness in this repo.
- No em dashes in any generated docs, comments, or UI copy - use plain dashes.
- Full design rationale: `docs/superpowers/specs/2026-07-19-create-event-design.md`.

---

## File Structure

```
badminton/
  supabase/
    migrations/
      <timestamp>_event_description_fee.sql   # Create: description/fee columns on events
  tests/
    create-event.test.mjs                     # Create: e2e test for description/fee + RLS
    skill-bands.test.mjs                       # Create: SKILL_BANDS vs public.skill_band() consistency check
  src/
    lib/
      skill-bands.ts                           # Create: SKILL_BANDS band-to-numeric-range mapping
    components/
      venue-picker.tsx                         # Create: venue select/create UI + expo-location
    app/
      (tabs)/
        create.tsx                             # Modify: full create-event form (replaces placeholder)
  app.json                                      # Modify: add expo-location plugin
  package.json                                  # Modify: add expo-location dep, test:create-event/test:skill-bands scripts
```

---

### Task 1: `events.description`/`events.fee` columns

**Files:**
- Create: `supabase/migrations/<timestamp>_event_description_fee.sql`
- Create: `tests/create-event.test.mjs`
- Modify: `package.json` (add `test:create-event` script)

**Interfaces:**
- Consumes: local Supabase stack (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, from prior plans), existing `public.events`/`public.venues` tables and their RLS policies (`supabase/migrations/20260716201044_rls_policies.sql`).
- Produces: `public.events.description text` (nullable) and `public.events.fee integer not null default 0 check (fee >= 0)`, available to every later task and to `tests/create-event.test.mjs`.

- [ ] **Step 1: Write the failing test**

```js
// tests/create-event.test.mjs
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local');

const admin = createClient(url, serviceKey);

async function createSignedInUser(email) {
  const password = 'password123';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!error, `createUser failed: ${error?.message}`);
  const client = createClient(url, anonKey);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  assert(!signInErr, `signIn failed: ${signInErr?.message}`);
  return { client, userId: data.user.id };
}

async function main() {
  const alice = await createSignedInUser(`alice-${Date.now()}@example.com`);
  const bob = await createSignedInUser(`bob-${Date.now()}@example.com`);

  const { data: venue, error: venueErr } = await alice.client
    .from('venues')
    .insert({
      name: 'Da-An Park Courts',
      address: '1 Xinsheng S Rd, Taipei',
      location: 'SRID=4326;POINT(121.535 25.026)',
      created_by: alice.userId,
    })
    .select()
    .single();
  assert(!venueErr, `venue insert failed: ${venueErr?.message}`);

  const { data: eventWithFee, error: feeErr } = await alice.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Casual Doubles',
      description: 'All levels welcome, bring your own racket.',
      fee: 150,
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!feeErr, `event insert with description/fee failed: ${feeErr?.message}`);
  assert.strictEqual(eventWithFee.description, 'All levels welcome, bring your own racket.', 'description should round-trip');
  assert.strictEqual(Number(eventWithFee.fee), 150, 'fee should round-trip');

  const { data: freeEvent, error: freeErr } = await alice.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Free Pickup Session',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!freeErr, `event insert without fee failed: ${freeErr?.message}`);
  assert.strictEqual(Number(freeEvent.fee), 0, 'fee should default to 0 when omitted');
  assert.strictEqual(freeEvent.description, null, 'description should default to null when omitted');

  const { error: negativeFeeErr } = await alice.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Invalid Fee Event',
      fee: -10,
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    });
  assert(negativeFeeErr, 'negative fee should be rejected by the fee >= 0 check constraint');

  const { error: forgedOrganizerErr } = await bob.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Forged Event',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    });
  assert(forgedOrganizerErr, 'RLS should block Bob from creating an event with organizer_id set to Alice');

  console.log('PASS: events.description/fee round-trip, default to null/0, fee check constraint, and organizer RLS all hold');
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
"test:create-event": "node --env-file=.env.local tests/create-event.test.mjs"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:create-event
```

Expected: FAIL - `description`/`fee` don't exist yet (PostgREST error like `Could not find the 'description' column of 'events' in the schema cache`).

- [ ] **Step 3: Write the migration**

```bash
npx supabase migration new event_description_fee
```

This creates `supabase/migrations/<timestamp>_event_description_fee.sql`. Fill it with:

```sql
alter table public.events
  add column description text,
  add column fee integer not null default 0 check (fee >= 0);
```

- [ ] **Step 4: Apply the migration**

```bash
npx supabase db reset
```

Expected: output ends with all migrations applying cleanly (no SQL errors).

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:create-event
```

Expected: `PASS: events.description/fee round-trip, default to null/0, fee check constraint, and organizer RLS all hold`

Also re-run the pre-existing suites to confirm nothing regressed:

```bash
npm run test:schema
npm run test:rls
```

Expected: both still `PASS`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/create-event.test.mjs package.json
git commit -m "feat: add description and fee columns to events"
```

---

### Task 2: Skill band constants

**Files:**
- Create: `src/lib/skill-bands.ts`
- Create: `tests/skill-bands.test.mjs`
- Modify: `package.json` (add `test:skill-bands` script)

**Interfaces:**
- Consumes: `public.skill_band(level smallint) returns text` (existing RPC from `supabase/migrations/20260716084150_init_schema.sql`), used only by the test to catch drift.
- Produces: `SKILL_BANDS: SkillBand[]` and `type SkillBandId` from `src/lib/skill-bands.ts`, where `SkillBand = { id: SkillBandId; label: string; min: number; max: number }`. Task 4 (`create.tsx`) imports both.

- [ ] **Step 1: Write the failing test**

```js
// tests/skill-bands.test.mjs
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';
import { SKILL_BANDS } from '../src/lib/skill-bands.ts';

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
    }
  }

  console.log('PASS: SKILL_BANDS is contiguous 1-18 and matches public.skill_band() for every level');
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
"test:skill-bands": "node --env-file=.env.local tests/skill-bands.test.mjs"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:skill-bands
```

Expected: FAIL - `Cannot find module '../src/lib/skill-bands.ts'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/skill-bands.ts
export type SkillBandId =
  | 'novice'
  | 'beginner'
  | 'early_intermediate'
  | 'intermediate'
  | 'intermediate_advanced'
  | 'advanced'
  | 'professional';

export type SkillBand = {
  id: SkillBandId;
  label: string;
  min: number;
  max: number;
};

// Mirrors public.skill_band()'s case statement in
// supabase/migrations/20260716084150_init_schema.sql - keep both in sync if
// the level-to-band boundaries ever change.
export const SKILL_BANDS: SkillBand[] = [
  { id: 'novice', label: 'Novice', min: 1, max: 3 },
  { id: 'beginner', label: 'Beginner', min: 4, max: 5 },
  { id: 'early_intermediate', label: 'Early Intermediate', min: 6, max: 7 },
  { id: 'intermediate', label: 'Intermediate', min: 8, max: 9 },
  { id: 'intermediate_advanced', label: 'Intermediate-Advanced', min: 10, max: 12 },
  { id: 'advanced', label: 'Advanced', min: 13, max: 15 },
  { id: 'professional', label: 'Professional', min: 16, max: 18 },
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:skill-bands
```

Expected: `PASS: SKILL_BANDS is contiguous 1-18 and matches public.skill_band() for every level` (a `MODULE_TYPELESS_PACKAGE_JSON` warning may print above it since `tests/*.mjs` imports a plain `.ts` file - this is harmless; Node 24's built-in TypeScript support handles the import either way).

- [ ] **Step 5: Commit**

```bash
git add src/lib/skill-bands.ts tests/skill-bands.test.mjs package.json
git commit -m "feat: add skill band constants for event creation"
```

---

### Task 3: Venue picker component

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npx expo install expo-location`)
- Modify: `app.json` (add `expo-location` plugin)
- Create: `src/components/venue-picker.tsx`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabase.ts`), `useAuth()` (`src/lib/auth-context.tsx`, specifically `session.user.id`), `public.venues` table and its RLS policies (`venues_select_authenticated`, `venues_insert_authenticated`).
- Produces: `export type Venue = { id: string; name: string; address: string }` and `export function VenuePicker({ selectedVenueId: string | null; onSelect: (venue: Venue) => void }): JSX.Element` from `src/components/venue-picker.tsx`. Task 4 (`create.tsx`) imports both.

- [ ] **Step 1: Install expo-location**

```bash
npx expo install expo-location
```

Expected: `package.json`/`package-lock.json` gain `expo-location` at the version this Expo SDK 57 project expects.

- [ ] **Step 2: Configure the location permission plugin**

Modify `app.json` - add `"expo-location"` to the existing `plugins` array (after `expo-splash-screen`):

```json
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#208AEF",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 76
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "Allow $(PRODUCT_NAME) to use your location to set a new venue's pin."
        }
      ]
    ],
```

- [ ] **Step 3: Write the component**

```tsx
// src/components/venue-picker.tsx
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export type Venue = {
  id: string;
  name: string;
  address: string;
};

type VenuePickerProps = {
  selectedVenueId: string | null;
  onSelect: (venue: Venue) => void;
};

export function VenuePicker({ selectedVenueId, onSelect }: VenuePickerProps) {
  const { session } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showNewVenueForm, setShowNewVenueForm] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAddress, setNewVenueAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locatingInProgress, setLocatingInProgress] = useState(false);
  const [savingVenue, setSavingVenue] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('venues')
      .select('id, name, address')
      .order('name')
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else setVenues(data ?? []);
        setLoading(false);
      });
  }, []);

  async function handleUseCurrentLocation() {
    setLocationError(null);
    setLocatingInProgress(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError('Location permission is required to add a venue.');
        return;
      }
      const position = await Location.getCurrentPositionAsync();
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not get current location.');
    } finally {
      setLocatingInProgress(false);
    }
  }

  async function handleSaveVenue() {
    if (!session || !coords || !newVenueName.trim() || !newVenueAddress.trim()) return;
    setSavingVenue(true);
    setSaveError(null);
    try {
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
      if (error) throw error;
      setVenues((prev) => [...prev, data]);
      onSelect(data);
      setShowNewVenueForm(false);
      setNewVenueName('');
      setNewVenueAddress('');
      setCoords(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save venue.');
    } finally {
      setSavingVenue(false);
    }
  }

  if (loading) return <ActivityIndicator />;
  if (loadError) return <Text style={styles.error}>Could not load venues: {loadError}</Text>;

  return (
    <View style={styles.container}>
      {venues.map((venue) => (
        <Pressable
          key={venue.id}
          style={[styles.venueRow, selectedVenueId === venue.id && styles.venueRowSelected]}
          onPress={() => onSelect(venue)}
        >
          <Text style={styles.venueName}>{venue.name}</Text>
          <Text style={styles.venueAddress}>{venue.address}</Text>
        </Pressable>
      ))}

      {!showNewVenueForm && (
        <Pressable style={styles.addVenueRow} onPress={() => setShowNewVenueForm(true)}>
          <Text style={styles.addVenueText}>+ Add new venue</Text>
        </Pressable>
      )}

      {showNewVenueForm && (
        <View style={styles.newVenueForm}>
          <TextInput
            style={styles.input}
            placeholder="Venue name"
            value={newVenueName}
            onChangeText={setNewVenueName}
          />
          <TextInput
            style={styles.input}
            placeholder="Address"
            value={newVenueAddress}
            onChangeText={setNewVenueAddress}
          />
          <Pressable style={styles.locationButton} onPress={handleUseCurrentLocation} disabled={locatingInProgress}>
            <Text style={styles.locationButtonText}>
              {locatingInProgress ? 'Getting location...' : coords ? 'Location captured' : 'Use current location'}
            </Text>
          </Pressable>
          {locationError && (
            <View>
              <Text style={styles.error}>{locationError}</Text>
              <Pressable onPress={handleUseCurrentLocation}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}
          <Pressable
            style={styles.saveButton}
            disabled={!coords || !newVenueName.trim() || !newVenueAddress.trim() || savingVenue}
            onPress={handleSaveVenue}
          >
            <Text style={styles.saveButtonText}>{savingVenue ? 'Saving...' : 'Save venue'}</Text>
          </Pressable>
          {saveError && <Text style={styles.error}>{saveError}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  venueRow: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  venueRowSelected: { borderColor: '#208AEF', backgroundColor: '#eaf4ff' },
  venueName: { fontWeight: '600' },
  venueAddress: { color: '#666' },
  addVenueRow: { padding: 12 },
  addVenueText: { color: '#208AEF', fontWeight: '600' },
  newVenueForm: { gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8 },
  locationButton: { backgroundColor: '#208AEF', padding: 10, borderRadius: 8, alignItems: 'center' },
  locationButtonText: { color: '#fff', fontWeight: '600' },
  saveButton: { backgroundColor: '#22c55e', padding: 10, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: 'red' },
  retryText: { color: '#208AEF' },
});
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

There is no automated test for this component: it needs a device's location sensor and a rendered UI, and this repo has no React Native render/component-test harness. The underlying `venues` insert path is already covered end-to-end by `tests/schema.test.mjs`/`tests/rls.test.mjs`/`tests/create-event.test.mjs` (Task 1) - what's new here (the location-permission UI flow) is verified manually in Task 5.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json src/components/venue-picker.tsx
git commit -m "feat: add venue picker with current-location venue creation"
```

---

### Task 4: Create-event form

**Files:**
- Modify: `src/app/(tabs)/create.tsx`

**Interfaces:**
- Consumes: `VenuePicker`, `type Venue` (Task 3, `src/components/venue-picker.tsx`); `SKILL_BANDS`, `type SkillBandId` (Task 2, `src/lib/skill-bands.ts`); `useAuth()` -> `session.user.id` (`src/lib/auth-context.tsx`); `supabase` (`src/lib/supabase.ts`); `useRouter` (`expo-router`); `DateTimePicker` (`@expo/ui/community/datetime-picker`); `Picker` (`@expo/ui/community/picker`, options rendered via its static `Picker.Item` property - the package has no separate `PickerItem` named export).
- Produces: the finished, human-usable Create Event screen. Nothing later in this plan consumes this task's output directly - Task 5 exercises it manually.

- [ ] **Step 1: Build the form**

```tsx
// src/app/(tabs)/create.tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Picker } from '@expo/ui/community/picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { VenuePicker, type Venue } from '@/components/venue-picker';

function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

export default function CreateEventScreen() {
  const { session } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState<Venue | null>(null);
  const [headcountText, setHeadcountText] = useState('8');
  const [feeText, setFeeText] = useState('0');
  const [date, setDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [durationMinutesText, setDurationMinutesText] = useState('90');
  const [fromBandId, setFromBandId] = useState<SkillBandId>('novice');
  const [toBandId, setToBandId] = useState<SkillBandId>('professional');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitError(null);

    if (!session) {
      setSubmitError('You must be signed in to create an event.');
      return;
    }
    if (!title.trim()) {
      setSubmitError('Title is required.');
      return;
    }
    if (!venue) {
      setSubmitError('Please select or add a venue.');
      return;
    }
    const headcountMax = parseInt(headcountText, 10);
    if (!Number.isInteger(headcountMax) || headcountMax <= 0) {
      setSubmitError('Number of people must be a positive whole number.');
      return;
    }
    const fee = feeText.trim() === '' ? 0 : Number(feeText);
    if (!Number.isInteger(fee) || fee < 0) {
      setSubmitError('Fee must be zero or a positive whole number.');
      return;
    }
    const durationMinutes = parseInt(durationMinutesText, 10);
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setSubmitError('Duration must be a positive number of minutes.');
      return;
    }
    const fromIndex = SKILL_BANDS.findIndex((band) => band.id === fromBandId);
    const toIndex = SKILL_BANDS.findIndex((band) => band.id === toBandId);
    if (fromIndex > toIndex) {
      setSubmitError('Skill range "from" must not be above "to".');
      return;
    }
    const startDateTime = combineDateAndTime(date, startTime);
    if (startDateTime.getTime() <= Date.now()) {
      setSubmitError('Start time must be in the future.');
      return;
    }
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60_000);

    setSubmitting(true);
    try {
      const { error } = await supabase.from('events').insert({
        organizer_id: session.user.id,
        venue_id: venue.id,
        title: title.trim(),
        description: description.trim() || null,
        fee,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        headcount_max: headcountMax,
        skill_min: SKILL_BANDS[fromIndex].min,
        skill_max: SKILL_BANDS[toIndex].max,
      });
      if (error) throw error;
      router.replace('/');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create event.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create event</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Friendly doubles" />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional details for players"
        multiline
      />

      <Text style={styles.label}>Venue</Text>
      <VenuePicker selectedVenueId={venue?.id ?? null} onSelect={setVenue} />

      <Text style={styles.label}>Number of people</Text>
      <TextInput
        style={styles.input}
        value={headcountText}
        onChangeText={setHeadcountText}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Fee (NT$)</Text>
      <TextInput style={styles.input} value={feeText} onChangeText={setFeeText} keyboardType="number-pad" />

      <Text style={styles.label}>Date</Text>
      <DateTimePicker mode="date" value={date} onValueChange={(_event, newDate) => setDate(newDate)} />

      <Text style={styles.label}>Start time</Text>
      <DateTimePicker mode="time" value={startTime} onValueChange={(_event, newTime) => setStartTime(newTime)} />

      <Text style={styles.label}>Duration (minutes)</Text>
      <TextInput
        style={styles.input}
        value={durationMinutesText}
        onChangeText={setDurationMinutesText}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Skill range: from</Text>
      <Picker selectedValue={fromBandId} onValueChange={(value) => setFromBandId(value as SkillBandId)}>
        {SKILL_BANDS.map((band) => (
          <Picker.Item key={band.id} label={band.label} value={band.id} />
        ))}
      </Picker>

      <Text style={styles.label}>Skill range: to</Text>
      <Picker selectedValue={toBandId} onValueChange={(value) => setToBandId(value as SkillBandId)}>
        {SKILL_BANDS.map((band) => (
          <Picker.Item key={band.id} label={band.label} value={band.id} />
        ))}
      </Picker>

      <Pressable style={styles.submitButton} disabled={submitting} onPress={handleSubmit}>
        <Text style={styles.submitButtonText}>{submitting ? 'Creating...' : 'Create event'}</Text>
      </Pressable>
      {submitError && <Text style={styles.error}>{submitError}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 12 },
  label: { fontWeight: '600', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginTop: 4 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  submitButton: { backgroundColor: '#208AEF', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: 'red', marginTop: 8 },
});
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/create.tsx"
git commit -m "feat: build create-event form"
```

---

### Task 5: Manual on-device verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the fully assembled create-event flow from Tasks 1-4.
- Produces: nothing for later tasks - this is the last task in the plan.

This step needs a human with the app running on a device/emulator, already signed in via the existing Google sign-in flow - it can't be scripted (see Global Constraints).

- [ ] **Step 1: Start the stack**

```bash
npx supabase status
npm run android:emulator
```

(Or `npx expo start --android` if not using the Android emulator script.)

- [ ] **Step 2: Walk through venue creation**

In the running app, sign in, then go to the Create tab:
1. Tap "+ Add new venue". Fill in a name and address.
2. Tap "Use current location". Grant the location permission prompt when it appears. Confirm the button label changes to "Location captured".
3. Tap "Save venue". Confirm the sub-form collapses and the new venue appears selected in the list.

- [ ] **Step 3: Walk through event creation**

1. Fill in Title, Description, Number of people, Fee, Date, Start time, Duration, and both skill-range bands.
2. Tap "Create event". Confirm you land on the Discover tab with no error shown.
3. Open Supabase Studio (URL from `npx supabase status`) and confirm the new row in `events` has the exact title/description/fee/venue_id/headcount_max/skill_min/skill_max/start_time/end_time you entered.

- [ ] **Step 4: Walk through the location-permission-denied path**

1. Go back to Create, tap "+ Add new venue" again.
2. Deny the location permission this time (or revoke it in device Settings first, then tap "Use current location").
3. Confirm an inline error appears with a "Retry" action, and that "Save venue" stays disabled since no location was captured.

- [ ] **Step 5: Note any findings**

If anything above doesn't match, fix it in the relevant task's files, re-run that task's automated checks, and re-verify here before considering the plan complete.

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the design's "Data model changes" section (with the `fee integer` refinement noted below). Task 2 covers "Skill range" band-to-numeric-range mapping, including the drift-safety cross-check the design explicitly calls for. Task 3 covers "Venue location" and "Venue selection UI". Task 4 covers "Create-event form fields" and "Submission flow". Task 5 covers the design's "manual, on-device" testing split, including the location-permission-denied path called out in both the design and Global Constraints. No design section is without a task.
- **Type refinement from the design doc:** the design's SQL sketch used `fee numeric`. This plan uses `fee integer` instead - PostgREST's JSON serialization of `numeric` columns is a known footgun (some client/driver combinations round-trip it as a string to avoid float precision loss), and NT$ event fees have no meaningful sub-dollar unit, so `integer` avoids the ambiguity entirely with no loss of the design's intent ("plain non-negative number, 0 = free"). The test still defensively wraps fee assertions in `Number(...)` in case of any future type change.
- **Placeholder scan:** all SQL, TypeScript, and test code above is complete and runnable as written; no TBD/TODO markers.
- **Type consistency:** `Venue = { id: string; name: string; address: string }` is defined once in Task 3 and consumed with that exact shape in Task 4. `SkillBand = { id: SkillBandId; label: string; min: number; max: number }` and `SKILL_BANDS` are defined once in Task 2 and consumed with the same names/shape in Task 4. `VenuePickerProps = { selectedVenueId: string | null; onSelect: (venue: Venue) => void }` matches exactly how Task 4 renders `<VenuePicker selectedVenueId={venue?.id ?? null} onSelect={setVenue} />`.
