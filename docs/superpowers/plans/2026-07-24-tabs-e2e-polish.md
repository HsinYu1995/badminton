# Tabs E2E Test Coverage + UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining test-coverage gaps on the three tab screens (search, join, remove-outdated) and add three small, targeted UI affordance touches to the existing "court card" design system, without redesigning it.

**Architecture:** Each new test lives in `__tests__/` alongside the three that already exist, reusing the exact `expo-router/testing-library` + `jest.mock('@/lib/auth-context', ...)` + `jest.mock('@/lib/supabase', ...)` pattern, with a **stable, module-level `session` object** (see the fix already committed in `54d56dc` - an inline `session: {...}` object literal returned fresh on every `useAuth()` call breaks any screen whose effects depend on `[session]`). UI polish touches are additive changes to `SearchBar`, `EventCard`, and the two empty-state blocks in `index.tsx`/`profile.tsx` - no prop-shape breaking changes.

**Tech Stack:** Jest + jest-expo + `@testing-library/react-native` + `expo-router/testing-library` (already configured). No new dependencies.

## Global Constraints

- Every mock of `@/lib/auth-context` must return a `session` object from a **module-level constant**, never an inline literal in the factory function - see `docs/superpowers/specs/2026-07-24-tabs-e2e-polish-design.md`'s "Test additions" section and the fix in commit `54d56dc`.
- No em dashes in any generated docs, comments, or UI copy - use plain dashes.
- `npm test` (the full Jest suite) is run after every single change, not just at task boundaries. Any regression is fixed before moving on.
- No new backend queries/columns, no redesign of `src/app/(auth)/login.tsx`, no animated loading states - see the spec's "Deferred items".
- Full design rationale: `docs/superpowers/specs/2026-07-24-tabs-e2e-polish-design.md`.

---

## File Structure

```
badminton/
  __tests__/
    discover-search-test.tsx   # Create: search-filter e2e test
    discover-join-test.tsx     # Create: join-flow e2e test
    profile-remove-test.tsx    # Create: remove-outdated-event e2e test
  src/
    components/
      search-bar.tsx           # Modify: add persistent search icon
      event-card.tsx           # Modify: add skill-range gauge bar
    app/
      (tabs)/
        index.tsx               # Modify: icon-forward empty state
        profile.tsx             # Modify: icon-forward empty state
  docs/superpowers/plans/2026-07-24-tabs-e2e-polish.md   # Modify: progress ledger (this file)
```

---

### Task 1: Discover search-filter test

**Files:**
- Create: `__tests__/discover-search-test.tsx`

**Interfaces:**
- Consumes: `DiscoverScreen` (`src/app/(tabs)/index.tsx`) via `renderRouter`; no new exports.

- [ ] **Step 1: Write the test**

```tsx
// __tests__/discover-search-test.tsx
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const mockEvents = [
  {
    id: 'event-1',
    title: 'Sunday Doubles Mixer',
    start_time: '2026-08-01T10:00:00.000Z',
    headcount_max: 8,
    skill_min: 1,
    skill_max: 18,
    fee: 0,
    venues: { name: 'Riverside Court' },
  },
  {
    id: 'event-2',
    title: 'Advanced Singles Ladder',
    start_time: '2026-08-02T14:00:00.000Z',
    headcount_max: 4,
    skill_min: 13,
    skill_max: 18,
    fee: 150,
    venues: { name: 'Hilltop Gym' },
  },
];

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_SESSION,
    isLoading: false,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'events') {
        return { select: () => ({ order: () => Promise.resolve({ data: mockEvents, error: null }) }) };
      }
      if (table === 'event_participants') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'filters the Discover list by search query, matching title or venue',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    await screen.findByText(mockEvents[0].title);
    expect(screen.getByText(mockEvents[1].title)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Search events'), 'Riverside');

    expect(screen.getByText(mockEvents[0].title)).toBeTruthy();
    expect(screen.queryByText(mockEvents[1].title)).toBeNull();
  },
  15000
);
```

- [ ] **Step 2: Run it**

```bash
npm test -- discover-search-test
```

Expected: PASS. `DiscoverScreen`'s existing `query`/`visibleEvents` filtering (`src/app/(tabs)/index.tsx:81-87`) already implements this - this test locks in existing behavior as a regression guard, matching the spec's note that this is a characterization test.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: all 4 suites PASS.

- [ ] **Step 4: Commit**

```bash
git add __tests__/discover-search-test.tsx
git commit -m "test(discover): cover search-filtering the event list"
```

- [ ] **Step 5: Log progress**

Append a line to this file's "Progress Ledger" section (bottom) noting the task, date, and test result.

---

### Task 2: Discover join-flow test

**Files:**
- Create: `__tests__/discover-join-test.tsx`

**Interfaces:**
- Consumes: `DiscoverScreen` (`src/app/(tabs)/index.tsx`), specifically its `handleJoin` insert shape (`event_id`, `user_id`, `status: 'pending'`, `src/app/(tabs)/index.tsx:67-69`) and its `ActionButton` label states ("Join" -> disabled "Requested").

- [ ] **Step 1: Write the test**

```tsx
// __tests__/discover-join-test.tsx
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const mockEvent = {
  id: 'event-1',
  organizer_id: 'someone-else',
  title: 'Sunday Doubles Mixer',
  start_time: '2026-08-01T10:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Riverside Court' },
};

const FAKE_SESSION = { user: { id: 'fake-user-id' } };
const mockParticipantInsert = jest.fn(() => Promise.resolve({ error: null }));

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_SESSION,
    isLoading: false,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'events') {
        return { select: () => ({ order: () => Promise.resolve({ data: [mockEvent], error: null }) }) };
      }
      if (table === 'event_participants') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
          insert: mockParticipantInsert,
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'joins an event and shows a disabled "Requested" state',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    await screen.findByText(mockEvent.title);
    await fireEvent.press(screen.getByText('Join'));

    await waitFor(() => expect(mockParticipantInsert).toHaveBeenCalledTimes(1));
    expect(mockParticipantInsert).toHaveBeenCalledWith({
      event_id: mockEvent.id,
      user_id: FAKE_SESSION.user.id,
      status: 'pending',
    });

    expect(await screen.findByText('Requested')).toBeTruthy();
    expect(screen.queryByText('Join')).toBeNull();
  },
  15000
);
```

- [ ] **Step 2: Run it**

```bash
npm test -- discover-join-test
```

Expected: PASS.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: all 5 suites PASS.

- [ ] **Step 4: Commit**

```bash
git add __tests__/discover-join-test.tsx
git commit -m "test(discover): cover joining an event"
```

- [ ] **Step 5: Log progress** (as in Task 1, Step 5)

---

### Task 3: Profile remove-outdated-event test

**Files:**
- Create: `__tests__/profile-remove-test.tsx`

**Interfaces:**
- Consumes: `ProfileScreen` (`src/app/(tabs)/profile.tsx`), specifically its past/upcoming branch (`isPastEvent`, `src/app/(tabs)/profile.tsx:107-117`) and `handleRemoveOutdated`'s delete shape (`.from('events').delete().eq('id', event.id)`, `src/app/(tabs)/profile.tsx:68`).

- [ ] **Step 1: Write the test**

```tsx
// __tests__/profile-remove-test.tsx
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const pastEvent = {
  id: 'event-past',
  organizer_id: 'fake-user-id',
  title: 'Last Month Mixer',
  start_time: '2026-06-01T10:00:00.000Z',
  end_time: '2026-06-01T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Riverside Court' },
};

const upcomingEvent = {
  id: 'event-future',
  organizer_id: 'fake-user-id',
  title: 'Next Month Mixer',
  start_time: '2027-06-01T10:00:00.000Z',
  end_time: '2027-06-01T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Riverside Court' },
};

const FAKE_SESSION = { user: { id: 'fake-user-id' } };
const mockEventsDeleteEq = jest.fn(() => Promise.resolve({ error: null }));

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_SESSION,
    isLoading: false,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { display_name: 'Fake Player', skill_level: 9 }, error: null }),
            }),
          }),
        };
      }
      if (table === 'events') {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [pastEvent, upcomingEvent], error: null }) }) }),
          delete: () => ({ eq: mockEventsDeleteEq }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'only offers to remove the past event, and removes it on press',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(pastEvent.title);
    expect(screen.getByText(upcomingEvent.title)).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();

    await fireEvent.press(screen.getByText('Remove outdated event'));

    await waitFor(() => expect(mockEventsDeleteEq).toHaveBeenCalledWith('id', pastEvent.id));
    expect(screen.queryByText(pastEvent.title)).toBeNull();
    expect(screen.getByText(upcomingEvent.title)).toBeTruthy();
  },
  15000
);
```

- [ ] **Step 2: Run it**

```bash
npm test -- profile-remove-test
```

Expected: PASS. If `.from('events').select().eq().order()` doesn't match `profile.tsx`'s actual call chain, adjust the mock shape to match `src/app/(tabs)/profile.tsx`'s `loadProfile` query exactly (re-read the file first).

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: all 6 suites PASS.

- [ ] **Step 4: Commit**

```bash
git add __tests__/profile-remove-test.tsx
git commit -m "test(profile): cover removing an outdated event"
```

- [ ] **Step 5: Log progress** (as in Task 1, Step 5)

---

### Task 4: SearchBar search icon

**Files:**
- Modify: `src/components/search-bar.tsx`

**Interfaces:**
- Produces: same `SearchBarProps` as today (`{ value, onChangeText, placeholder? }`) - purely visual, no consumer changes needed in `index.tsx`.

- [ ] **Step 1: Add the icon**

Modify `src/components/search-bar.tsx` to wrap the `TextInput` in a row with a leading 🔍 glyph:

```tsx
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Court, Radius, Space } from '@/constants/badminton-theme';

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChangeText, placeholder }: SearchBarProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? 'Search events or venues'}
        placeholderTextColor={Court.inkSecondary}
        accessibilityLabel="Search events"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Court.shuttle,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Court.line,
    paddingLeft: Space.md,
    paddingRight: Space.lg,
  },
  icon: {
    fontSize: 15,
    marginRight: Space.xs,
    opacity: 0.7,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: Court.ink,
  },
});
```

- [ ] **Step 2: Run the full suite**

```bash
npm test
```

Expected: all suites still PASS (no test queries the search bar by exact structure, only by `accessibilityLabel="Search events"`, which is unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/components/search-bar.tsx
git commit -m "feat(ui): add a persistent search icon to SearchBar"
```

- [ ] **Step 4: Log progress** (as in Task 1, Step 5)

---

### Task 5: EventCard skill-range gauge

**Files:**
- Modify: `src/components/event-card.tsx`

**Interfaces:**
- Consumes: `SkillBandAccents` (`src/constants/badminton-theme.ts`), `SKILL_BANDS`/`bandForLevel` (`src/lib/skill-bands.ts`) - the gauge highlights the `[event.skill_min, event.skill_max]` sub-range of the full 1-18 scale.
- Produces: same `EventCardProps` as today - purely visual, no consumer changes needed.

- [ ] **Step 1: Add the gauge**

Modify `src/components/event-card.tsx`: insert a `SkillGauge` sub-component rendered next to the existing skill pill (inside `pillRow`'s parent, as its own row above `pillRow`):

```tsx
import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Court, Radius, Shadow, Space, SkillBandAccents } from '@/constants/badminton-theme';
import { bandForLevel } from '@/lib/skill-bands';
import { formatFee, formatStartTime, isPastEvent, type EventListItem } from '@/lib/events';
import { Pill } from '@/components/pill';

const SKILL_SCALE_MIN = 1;
const SKILL_SCALE_MAX = 18;

function SkillGauge({ skillMin, skillMax, color }: { skillMin: number; skillMax: number; color: string }) {
  const scaleSpan = SKILL_SCALE_MAX - SKILL_SCALE_MIN;
  const leftPct = ((skillMin - SKILL_SCALE_MIN) / scaleSpan) * 100;
  const widthPct = ((skillMax - skillMin) / scaleSpan) * 100;
  return (
    <View style={styles.gaugeTrack} accessibilityLabel={`Skill range ${skillMin} to ${skillMax} out of ${SKILL_SCALE_MAX}`}>
      <View style={[styles.gaugeFill, { left: `${leftPct}%`, width: `${Math.max(widthPct, 4)}%`, backgroundColor: color }]} />
    </View>
  );
}

type EventCardProps = {
  event: EventListItem;
  action?: ReactNode;
};

export function EventCard({ event, action }: EventCardProps) {
  const band = bandForLevel(event.skill_min);
  const accent = SkillBandAccents[band.id] ?? Court.green;
  const past = isPastEvent(event);

  return (
    <View style={[styles.card, Shadow.card]}>
      <View style={[styles.accentStripe, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
          {past && <Pill label="Past" tone="danger" />}
        </View>

        <Text style={styles.meta}>📍 {event.venues?.name ?? 'Venue TBD'}</Text>
        <Text style={styles.meta}>🕒 {formatStartTime(event.start_time)}</Text>

        <SkillGauge skillMin={event.skill_min} skillMax={event.skill_max} color={accent} />

        <View style={styles.pillRow}>
          <Pill label={`${band.label} · Lv ${event.skill_min}-${event.skill_max}`} tone="green" />
          <Pill label={formatFee(event.fee)} tone="feather" />
          <Pill label={`Up to ${event.headcount_max} players`} tone="neutral" />
        </View>

        {action && <View style={styles.actionRow}>{action}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Court.shuttle,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.md,
  },
  accentStripe: {
    width: 6,
  },
  body: {
    flex: 1,
    padding: Space.lg,
    gap: Space.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: Court.ink,
  },
  meta: {
    color: Court.inkSecondary,
    fontSize: 13,
  },
  gaugeTrack: {
    height: 5,
    borderRadius: Radius.pill,
    backgroundColor: Court.line,
    marginTop: Space.sm,
    overflow: 'hidden',
  },
  gaugeFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: Radius.pill,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  actionRow: {
    marginTop: Space.md,
    alignItems: 'flex-end',
  },
});
```

- [ ] **Step 2: Run the full suite**

```bash
npm test
```

Expected: all suites still PASS (no test asserts on `EventCard`'s internal layout beyond visible text, which is unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/components/event-card.tsx
git commit -m "feat(ui): add a skill-range gauge bar to EventCard"
```

- [ ] **Step 4: Log progress** (as in Task 1, Step 5)

---

### Task 6: Friendlier empty states

**Files:**
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/(tabs)/profile.tsx`

**Interfaces:** none beyond the existing screens - purely visual.

- [ ] **Step 1: Discover empty state**

In `src/app/(tabs)/index.tsx`, replace the single-line empty-state `Text` (around line 102-106) with an icon-forward block:

```tsx
{visibleEvents.length === 0 && (
  <View style={styles.emptyState}>
    <Text style={styles.emptyEmoji}>{query ? '🔍' : '🏸'}</Text>
    <Text style={styles.emptyTitle}>{query ? 'No matches' : 'No games yet'}</Text>
    <Text style={styles.emptySubtext}>
      {query ? 'Try a different title or venue.' : 'Be the first to host a pickup game today.'}
    </Text>
  </View>
)}
```

Add to `styles` (`StyleSheet.create` at the bottom):

```tsx
emptyState: { alignItems: 'center', marginTop: Space.xl, gap: 4 },
emptyEmoji: { fontSize: 40, marginBottom: Space.xs },
emptyTitle: { fontSize: 16, fontWeight: '700', color: Court.ink },
emptySubtext: { color: Court.inkSecondary, textAlign: 'center' },
```

Remove the now-unused `empty: { color: Court.inkSecondary, textAlign: 'center', marginTop: Space.xl }` style entry.

- [ ] **Step 2: Profile empty state**

In `src/app/(tabs)/profile.tsx`, replace the single-line empty-state `Text` (around line 96-98) with the same pattern:

```tsx
{!loading && !loadError && myEvents.length === 0 && (
  <View style={styles.emptyState}>
    <Text style={styles.emptyEmoji}>🏸</Text>
    <Text style={styles.emptyTitle}>No games organized yet</Text>
    <Text style={styles.emptySubtext}>Head to Create to host your first pickup game.</Text>
  </View>
)}
```

Add the same `emptyState`/`emptyEmoji`/`emptyTitle`/`emptySubtext` style entries to `profile.tsx`'s `StyleSheet.create`, and remove the now-unused `empty: { color: Court.inkSecondary }` entry.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: all suites still PASS (no test asserts on the exact former empty-state copy).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(tabs)/index.tsx" "src/app/(tabs)/profile.tsx"
git commit -m "feat(ui): icon-forward empty states for Discover and Profile"
```

- [ ] **Step 5: Log progress** (as in Task 1, Step 5)

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite one more time**

```bash
npm test
```

Expected: 6 suites, all PASS.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Final ledger entry**

Append a closing entry to this file's Progress Ledger summarizing total suites/tests passing and confirming the spec's requirements are all met.

---

## Progress Ledger

(Appended to as each task completes - see each task's final step.)

- **2026-07-24, baseline fix (pre-Task 1, commit `54d56dc`):** Discovered and fixed a real bug before starting: every existing test's mocked `useAuth()` returned a fresh `session` object literal per call, which broke `DiscoverScreen`'s `loadEvents` `useCallback([session])` -> `useFocusEffect` chain into an infinite render loop, hanging any test that mounted the Discover tab for the full per-test timeout. Fixed by using a module-level `FAKE_SESSION` constant in all three existing test mocks, plus fixed `discover-test.tsx`'s missing `event_participants.eq()` mock and a stale exact-text assertion against the venue name. Full suite: 3/3 passed.
- **2026-07-24, Task 1 (`discover-search-test.tsx`):** Added the search-filter test. First attempt failed because `fireEvent.changeText` wasn't awaited, so the assertion ran before the filtered re-render committed - fixed by awaiting it (matching the pattern already used elsewhere in this test suite). Full suite: 4/4 passed.
- **2026-07-24, Task 2 (`discover-join-test.tsx`):** Added the join-flow test. Passed on the first run. Full suite: 5/5 passed.
- **2026-07-24, Task 3 (`profile-remove-test.tsx`):** Added the remove-outdated-event test. Passed on the first run. Full suite: 6/6 passed.
- **2026-07-24, Task 4 (SearchBar icon):** Added a persistent 🔍 glyph inside SearchBar. Full suite: 6/6 passed, no regressions.
- **2026-07-24, Task 5 (EventCard skill gauge):** Added a 1-18 scale gauge bar highlighting each event's skill range. Full suite: 6/6 passed; `tsc --noEmit` clean.
- **2026-07-24, Task 6 (empty states):** Replaced the plain-text empty states in Discover and Profile with icon-forward blocks (emoji + heading + subtext). Full suite: 6/6 passed; `tsc --noEmit` clean.

---

## Self-Review Notes

- **Spec coverage:** Tasks 1-3 cover the spec's three test gaps (search, join, remove-outdated) exactly as described. Tasks 4-6 cover the spec's three UI polish items (search icon, skill gauge, empty states) exactly as described. Task 7 is final verification. No spec section lacks a task.
- **Baseline fix:** not a task in this plan because it was already diagnosed and committed (`54d56dc`) before this plan was written - documented here so later readers understand why every test mock uses a module-level `FAKE_SESSION` constant instead of an inline object literal.
- **Placeholder scan:** all test and component code above is complete and runnable as written; no TBD/TODO markers.
- **Type consistency:** `EventCardProps`, `SearchBarProps`, and the mock `session`/`supabase` shapes match exactly what each consuming screen already expects (verified against `src/app/(tabs)/index.tsx`, `src/app/(tabs)/profile.tsx`, `src/app/(tabs)/create.tsx` as read during brainstorming).
