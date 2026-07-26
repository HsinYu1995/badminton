# Organizer Accept/Decline, Accepted-Only Player Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pending join request no longer counts toward an event's displayed player count, and an organizer can accept or decline a pending request from the app (previously only possible via the RLS layer directly).

**Architecture:** No schema/RLS changes - `participants_update_by_organizer` and `participants_update_self_withdraw` already exist and already support exactly this. The `ACTIVE_PARTICIPANT_STATUSES` constant that both Discover and Profile use to compute player counts drops `'pending'`, and `AttendeeRoster` (the organizer's per-event roster on the Profile screen) gains Accept/Decline buttons on pending rows that call `event_participants.update({status})`.

**Tech Stack:** Expo Router / React Native, Supabase (Postgres + PostgREST + RLS), Jest + `@testing-library/react-native` (`expo-router/testing-library`) for mocked-UI tests, plain Node + `@supabase/supabase-js` against the local Supabase stack for real-Postgres e2e tests (`tests/*.test.mjs`, run via `node --env-file=.env.local tests/<file>.test.mjs`).

## Global Constraints

- No new tables, columns, or RLS policies - this plan is app-layer only.
- Button labels: **"Accept"**, **"Decline"** (organizer's pending-row actions), **"Declined"** (replaces the old "Withdrawn" label on the requester's side).
- `ACTIVE_PARTICIPANT_STATUSES` becomes `['accepted']` only - pending requests never count.
- Follow the existing e2e-first testing convention in this repo: real-Postgres tests live in `tests/*.test.mjs` (two independently signed-in `@supabase/supabase-js` clients, `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` from `.env.local`); mocked-UI tests live in `__tests__/*-test.tsx` using `expo-router/testing-library`.
- Spec: `docs/superpowers/specs/2026-07-25-organizer-decision-design.md`.

---

## Task 1: Accepted-only player count

**Files:**
- Modify: `src/lib/events.ts:1-5`
- Modify: `src/app/(tabs)/index.tsx:119-135` (`handleJoin`), `:137-163` (`handleCancelRequest`)
- Modify: `src/components/event-card.tsx:36`
- Modify: `CONTEXT.md:16`, `CONTEXT.md:28`
- Modify (test fixtures/assertions): `__tests__/discover-join-test.tsx:84`, `__tests__/discover-test.tsx:68-99`, `__tests__/profile-events-test.tsx:92-101,139-140`, `__tests__/profile-data-test.ts:33,52-53`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ACTIVE_PARTICIPANT_STATUSES = ['accepted']` (was `['pending', 'accepted']`) - Task 3's `AttendeeRoster` changes read this indirectly (it flows into `loadProfileSummary`'s player-count query, unchanged by this task).

- [ ] **Step 1: Update the four existing test files to their new expected values (red)**

`__tests__/discover-join-test.tsx` - joining no longer bumps the count (only line 84 changes):

```tsx
    expect(await screen.findByText('Cancel request')).toBeTruthy();
    expect(screen.queryByText('Join')).toBeNull();
    expect(screen.getByText('1/8 players')).toBeTruthy();
```

`__tests__/discover-test.tsx` - a real accepted-only query would never return the pending rows this fixture used to include, so trim the fixture to what the server would actually hand back, and correct the assertion and its comment:

```tsx
            in: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ event_id: 'event-1', status: 'accepted' }],
                  error: null,
                }),
            }),
```

```tsx
    // event-1 has 1 accepted participant row in the mock (a real
    // accepted-only query would never return a pending row), plus the
    // organizer who has no event_participants row of their own; event-2 has
    // none, so it shows just the organizer.
    expect(screen.getByText('2/8 players')).toBeTruthy();
    expect(screen.getByText('1/4 players')).toBeTruthy();
```

`__tests__/profile-events-test.tsx` - same fixture-trim, plus splitting the single "both show 2/8" assertion since the organized event's only participant is still pending (not yet counted):

```tsx
            in: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ event_id: attendingEvent.id, status: 'accepted' }],
                  error: null,
                }),
            }),
```

```tsx
    // organizedEvent's only participant is still pending (not counted yet):
    // organizer (1) + 0 accepted = 1. attendingEvent's participant is
    // accepted: organizer (1) + 1 accepted = 2.
    expect(screen.getByText('1/8 players')).toBeTruthy();
    expect(screen.getByText('2/8 players')).toBeTruthy();
```

`__tests__/profile-data-test.ts` - the fixture's row must be a status a real accepted-only query could actually return:

```ts
        in: () => ({
          in: () => Promise.resolve({ data: [{ event_id: organizedEvent.id, status: 'accepted' }], error: null }),
        }),
```

```ts
  // organized event: organizer (1) + 1 accepted = 2. attending event: organizer (1) + 0 accepted = 1.
  expect(summary.playerCounts).toEqual({ 'event-organized': 2, 'event-attending': 1 });
```

- [ ] **Step 2: Run the affected tests and confirm they fail against current code**

Run: `npx jest discover-join-test discover-test profile-events-test profile-data-test`
Expected: FAIL - `discover-join-test` shows `2/8 players` (not `1/8`) after Join; `discover-test` and `profile-events-test` still see 4 rows worth of pending participants counted; `profile-data-test`'s `playerCounts` assertion still matches (since `computePlayerCounts` doesn't care about status), so that one may already pass - that's fine, its point is the fixture/comment honesty, not a new assertion.

- [ ] **Step 3: Change `ACTIVE_PARTICIPANT_STATUSES` to accepted-only**

Replace `src/lib/events.ts:1-5`:

```ts
// A game's "current number of people" counts accepted requests only - a
// pending request doesn't occupy a spot until the organizer accepts it (see
// AttendeeRoster's Accept/Decline actions in src/app/(tabs)/profile.tsx).
// Declined requests are excluded the same as before.
export const ACTIVE_PARTICIPANT_STATUSES = ['accepted'] as const;
```

- [ ] **Step 4: Stop incrementing the count on join, in `src/app/(tabs)/index.tsx`**

Replace the `handleJoin` function (currently `:119-135`):

```tsx
  async function handleJoin(event: EventListItem) {
    if (!session) return;
    setJoinError(null);
    setJoiningEventId(event.id);
    try {
      const { error: joinErr } = await supabase
        .from('event_participants')
        .insert({ event_id: event.id, user_id: session.user.id, status: 'pending' });
      if (joinErr) throw joinErr;
      // A pending request doesn't occupy a spot until the organizer accepts
      // it - see ACTIVE_PARTICIPANT_STATUSES - so the player count doesn't
      // move here.
      setMyRequests((prev) => ({ ...prev, [event.id]: 'pending' }));
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join event.');
    } finally {
      setJoiningEventId(null);
    }
  }
```

- [ ] **Step 5: Only decrement on cancelling an already-accepted request**

Replace the `handleCancelRequest` function (currently `:137-163`):

```tsx
  async function handleCancelRequest(event: EventListItem) {
    if (!session) return;
    setCancelError(null);
    setCancelingEventId(event.id);
    const wasAccepted = myRequests[event.id] === 'accepted';
    try {
      const { error: cancelErr } = await supabase
        .from('event_participants')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', session.user.id);
      if (cancelErr) throw cancelErr;
      // Removing the row entirely (not marking it 'declined') lets the
      // organizer see "Join" again immediately, so a cancelled request can
      // be sent again later.
      setMyRequests((prev) => {
        const next = { ...prev };
        delete next[event.id];
        return next;
      });
      // A still-pending request was never counted, so cancelling it doesn't
      // change the count. Only losing an accepted spot frees one up - floor
      // at 1, not 0, since the organizer is always still there.
      if (wasAccepted) {
        setParticipantCounts((prev) => ({ ...prev, [event.id]: Math.max((prev[event.id] ?? 1) - 1, 1) }));
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Could not cancel request.');
    } finally {
      setCancelingEventId(null);
    }
  }
```

- [ ] **Step 6: Update the stale comment on `EventCard`'s `participantCount` prop**

In `src/components/event-card.tsx:36`, replace:

```tsx
  // Count of pending + accepted event_participants rows for this event.
```

with:

```tsx
  // Count of accepted event_participants rows for this event (the
  // organizer is added separately - see computePlayerCounts).
```

- [ ] **Step 7: Update `CONTEXT.md`'s Player count definition**

Replace `CONTEXT.md:16`:

```markdown
The number of people currently in an Event: the organizer (always exactly one - organizers have no `event_participants` row of their own) plus every **accepted** participant. Computed for display, never stored. Distinct from an Event's `headcount_max`, which is its capacity limit, not who's actually in it.
```

Replace `CONTEXT.md:28`:

```markdown
- An **Event**'s **Player count** is a pure function of its organizer (implicit, always 1) and its accepted **event_participants** rows - never persisted, and never exceeds `headcount_max` in a well-formed **Event** (not currently enforced at signup time).
```

- [ ] **Step 8: Run the full test suite and confirm everything passes**

Run: `npx jest`
Expected: PASS - all suites green, including the four files touched in Step 1.

- [ ] **Step 9: Commit**

```bash
git add src/lib/events.ts src/app/\(tabs\)/index.tsx src/components/event-card.tsx CONTEXT.md __tests__/discover-join-test.tsx __tests__/discover-test.tsx __tests__/profile-events-test.tsx __tests__/profile-data-test.ts
git commit -m "feat: player count only reflects accepted requests, not pending"
```

---

## Task 2: Real-Postgres e2e test for organizer accept/decline

This task adds no application code - `participants_update_by_organizer` and `participants_update_self_withdraw` already exist (see `supabase/migrations/20260716201044_rls_policies.sql`). This test proves the backend already does what Task 3's UI is about to call, from both the organizer's and the participant's own authenticated sessions, and confirms the player-count transition the app will display.

**Files:**
- Create: `tests/participant-decision.test.mjs`
- Modify: `package.json` (add a `test:participant-decision` script, following the existing `test:participant-lifecycle` pattern)

**Interfaces:**
- Consumes: local Supabase stack (`npx supabase start`), `.env.local`'s `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.
- Produces: nothing consumed by later tasks - this is a standalone verification artifact.

- [ ] **Step 1: Write the test**

Create `tests/participant-decision.test.mjs`:

```js
// tests/participant-decision.test.mjs
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

async function createEvent(organizerClient, organizerId, venueId, title) {
  const { data, error } = await organizerClient
    .from('events')
    .insert({
      organizer_id: organizerId,
      venue_id: venueId,
      title,
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!error, `event insert failed: ${error?.message}`);
  return data;
}

// Mirrors how the app computes an event's Player count: the organizer
// (always 1, no row of their own) plus every 'accepted' event_participants
// row - see src/lib/events.ts's ACTIVE_PARTICIPANT_STATUSES.
async function playerCount(eventId) {
  const { data, error } = await admin
    .from('event_participants')
    .select('event_id')
    .eq('event_id', eventId)
    .eq('status', 'accepted');
  assert(!error, `player count query failed: ${error?.message}`);
  return 1 + data.length;
}

async function main() {
  const organizer = await createSignedInUser(`organizer-${Date.now()}@example.com`);
  const otherOrganizer = await createSignedInUser(`other-organizer-${Date.now()}@example.com`);
  const participant = await createSignedInUser(`participant-${Date.now()}@example.com`);

  const { data: venue, error: venueErr } = await organizer.client
    .from('venues')
    .insert({
      name: 'Decision Test Court',
      address: '1 Test St',
      location: 'SRID=4326;POINT(121.5 25.0)',
      created_by: organizer.userId,
    })
    .select()
    .single();
  assert(!venueErr, `venue insert failed: ${venueErr?.message}`);

  const event = await createEvent(organizer.client, organizer.userId, venue.id, 'Decision Test Game');

  const { error: joinErr } = await participant.client
    .from('event_participants')
    .insert({ event_id: event.id, user_id: participant.userId, status: 'pending' });
  assert(!joinErr, `participant join failed: ${joinErr?.message}`);

  assert.strictEqual(await playerCount(event.id), 1, 'a pending request must not occupy a spot yet');

  // The requester cannot accept their own request.
  const { error: selfAcceptErr } = await participant.client
    .from('event_participants')
    .update({ status: 'accepted' })
    .eq('event_id', event.id)
    .eq('user_id', participant.userId);
  const { data: afterSelfAcceptAttempt } = await admin
    .from('event_participants')
    .select('status')
    .eq('event_id', event.id)
    .eq('user_id', participant.userId)
    .single();
  assert(
    selfAcceptErr || afterSelfAcceptAttempt.status === 'pending',
    'RLS should block a requester from accepting their own request'
  );

  // A different organizer cannot decide on this request.
  const { error: wrongOrganizerErr } = await otherOrganizer.client
    .from('event_participants')
    .update({ status: 'accepted' })
    .eq('event_id', event.id)
    .eq('user_id', participant.userId);
  const { data: afterWrongOrganizerAttempt } = await admin
    .from('event_participants')
    .select('status')
    .eq('event_id', event.id)
    .eq('user_id', participant.userId)
    .single();
  assert(
    wrongOrganizerErr || afterWrongOrganizerAttempt.status === 'pending',
    "RLS should block an organizer from deciding on another organizer's event"
  );

  // The actual organizer accepts.
  const { error: acceptErr } = await organizer.client
    .from('event_participants')
    .update({ status: 'accepted' })
    .eq('event_id', event.id)
    .eq('user_id', participant.userId);
  assert(!acceptErr, `organizer accept failed: ${acceptErr?.message}`);

  // Both sides can now see the accepted request, each through their own
  // authenticated client (not the admin/service-role client).
  const { data: seenByOrganizer, error: organizerReadErr } = await organizer.client
    .from('event_participants')
    .select('user_id, status, profiles(display_name)')
    .eq('event_id', event.id)
    .eq('user_id', participant.userId)
    .single();
  assert(!organizerReadErr, `organizer roster read failed: ${organizerReadErr?.message}`);
  assert.strictEqual(seenByOrganizer.status, 'accepted', "organizer's roster should show the accepted status");

  const { data: seenByParticipant, error: participantReadErr } = await participant.client
    .from('event_participants')
    .select('status, events(title, organizer_id)')
    .eq('event_id', event.id)
    .eq('user_id', participant.userId)
    .single();
  assert(!participantReadErr, `participant read-back failed: ${participantReadErr?.message}`);
  assert.strictEqual(
    seenByParticipant.status,
    'accepted',
    "the participant's own view should show the accepted status"
  );
  assert.strictEqual(seenByParticipant.events.title, 'Decision Test Game');

  assert.strictEqual(await playerCount(event.id), 2, 'an accepted request must occupy a spot');

  // Second request on the same event, this time declined.
  const declinedParticipant = await createSignedInUser(`declined-${Date.now()}@example.com`);
  const { error: joinBErr } = await declinedParticipant.client
    .from('event_participants')
    .insert({ event_id: event.id, user_id: declinedParticipant.userId, status: 'pending' });
  assert(!joinBErr, `second participant join failed: ${joinBErr?.message}`);

  const { error: declineErr } = await organizer.client
    .from('event_participants')
    .update({ status: 'declined' })
    .eq('event_id', event.id)
    .eq('user_id', declinedParticipant.userId);
  assert(!declineErr, `organizer decline failed: ${declineErr?.message}`);

  assert.strictEqual(await playerCount(event.id), 2, 'a declined request must not occupy a spot');

  const { data: declinedRow } = await admin
    .from('event_participants')
    .select('status')
    .eq('event_id', event.id)
    .eq('user_id', declinedParticipant.userId)
    .single();
  assert.strictEqual(declinedRow.status, 'declined');

  // The declined requester can still remove their own row (and could re-request).
  const { error: selfDeleteErr } = await declinedParticipant.client
    .from('event_participants')
    .delete()
    .eq('event_id', event.id)
    .eq('user_id', declinedParticipant.userId);
  assert(!selfDeleteErr, `declined requester should be able to delete their own row: ${selfDeleteErr?.message}`);

  console.log(
    'PASS: organizer accept/decline updates status, both organizer and participant can independently see the accepted result, the player count only reflects accepted requests, and RLS blocks self-accept and cross-organizer decisions'
  );
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

- [ ] **Step 2: Add the npm script**

In `package.json`, insert this line immediately after `"test:participant-lifecycle": "node --env-file=.env.local tests/participant-lifecycle.test.mjs",`:

```json
    "test:participant-decision": "node --env-file=.env.local tests/participant-decision.test.mjs",
```

- [ ] **Step 3: Ensure the local Supabase stack is running, then run the test**

Run: `npx supabase status` - if `API_URL`/`DB_URL` aren't listed as running, run `npx supabase start` first.
Run: `npm run test:participant-decision`
Expected: PASS, printing the `PASS: organizer accept/decline updates status...` line. If it fails, the RLS policies described in the spec are not what this plan assumes - stop and re-check `supabase/migrations/20260716201044_rls_policies.sql` and `supabase/migrations/20260725064939_participants_self_delete.sql` before proceeding to Task 3.

- [ ] **Step 4: Commit**

```bash
git add tests/participant-decision.test.mjs package.json
git commit -m "test: e2e coverage for organizer accept/decline against real Postgres"
```

---

## Task 3: Organizer accept/decline UI

**Files:**
- Modify: `src/app/(tabs)/profile.tsx` (`PersonRow` at `:315-344`, `AttendeeRoster` at `:471-537`, `ProfileScreen`'s call site at `:303` and its handlers, `styles` at `:539-605`)
- Modify: `src/app/(tabs)/index.tsx` (the "Withdrawn" label, currently `:238-239`)
- Modify (test): `__tests__/profile-events-test.tsx`

**Interfaces:**
- Consumes: `ACTIVE_PARTICIPANT_STATUSES` / `computePlayerCounts` from Task 1 (unchanged signatures); `Attendee` type from `src/lib/profile-data.ts` (`status: 'pending' | 'accepted' | 'declined'`, already supports this - no change needed there).
- Produces: `PersonRow`'s new `decision?: { onAccept: () => void; onDecline: () => void; loading?: boolean }` prop; `AttendeeRoster`'s new required `onAccept: (eventId: string) => void` prop; `ProfileScreen`'s new `handleParticipantAccepted(eventId: string)` handler.

- [ ] **Step 1: Extend the Jest UI test with the Accept flow (red)**

In `__tests__/profile-events-test.tsx`, add a mock for the update call near the existing `mockLeaveEq` declaration (around line 51):

```tsx
const mockLeaveEq = jest.fn(() => Promise.resolve({ error: null }));
const mockAcceptEq2 = jest.fn(() => Promise.resolve({ error: null }));
const mockParticipantUpdate = jest.fn(() => ({
  eq: () => ({ eq: mockAcceptEq2 }),
}));
```

Then wire it into the `event_participants` mock branch (the block from Task 1 Step 1 that returns `select`/`delete` - add `update` alongside them):

```tsx
      if (table === 'event_participants') {
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              if (column === 'user_id') {
                return { eq: () => Promise.resolve({ data: [{ event_id: attendingEvent.id }], error: null }) };
              }
              // column === 'event_id' - AttendeeRoster fetching a specific organized event's roster
              return Promise.resolve({ data: value === organizedEvent.id ? rosterRows : [], error: null });
            },
            in: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ event_id: attendingEvent.id, status: 'accepted' }],
                  error: null,
                }),
            }),
          }),
          update: mockParticipantUpdate,
          delete: () => ({ eq: () => ({ eq: mockLeaveEq }) }),
        };
      }
```

Then add a new test at the end of the file:

```tsx
it(
  'lets the organizer accept a pending request, updating the roster and the player count',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(organizedEvent.title);
    expect(await screen.findByText('👥 Players (1)')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('1/8 players')).toBeTruthy();

    await fireEvent.press(screen.getByText('Accept'));

    await waitFor(() => expect(mockParticipantUpdate).toHaveBeenCalledTimes(1));
    expect(mockParticipantUpdate).toHaveBeenCalledWith({ status: 'accepted' });
    await waitFor(() => expect(mockAcceptEq2).toHaveBeenCalledTimes(1));

    expect(await screen.findByText('Accepted')).toBeTruthy();
    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
    expect(screen.getByText('2/8 players')).toBeTruthy();
  },
  15000
);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest profile-events-test`
Expected: FAIL - there is no "Accept" text in the tree yet (`PersonRow` doesn't render decision buttons).

- [ ] **Step 3: Give `PersonRow` a decision slot and a `'declined'` status case**

Replace `PersonRow` (currently `src/app/(tabs)/profile.tsx:315-344`):

```tsx
function PersonRow({
  name,
  skillLevel,
  contact,
  credit,
  statusLabel,
  statusTone,
  decision,
  rating,
}: {
  name: string;
  skillLevel: number | null;
  contact?: string | null;
  credit: Credit | undefined;
  statusLabel?: string;
  statusTone?: 'green' | 'neutral' | 'danger';
  decision?: { onAccept: () => void; onDecline: () => void; loading?: boolean };
  rating?: { value: number; onChange: (score: number) => void; disabled?: boolean };
}) {
  return (
    <View style={styles.rosterRow}>
      <Text style={styles.rosterName}>{name}</Text>
      <View style={styles.pillRowSmall}>
        {statusLabel && <Pill label={statusLabel} tone={statusTone ?? 'neutral'} />}
        {skillLevel != null && <Pill label={bandForLevel(skillLevel).label} tone="feather" />}
        <CreditPill credit={credit} />
        {contact && <Pill label={contact} tone="neutral" />}
      </View>
      {decision && (
        <View style={styles.decisionRow}>
          <ActionButton label="Accept" onPress={decision.onAccept} loading={decision.loading} />
          <ActionButton label="Decline" onPress={decision.onDecline} variant="danger" loading={decision.loading} />
        </View>
      )}
      {rating && <StarRating value={rating.value} onChange={rating.onChange} disabled={rating.disabled} />}
    </View>
  );
}
```

- [ ] **Step 4: Add the `decisionRow` style**

In `src/app/(tabs)/profile.tsx`'s `styles` object, add this line immediately after `rosterName:` (currently line 604):

```tsx
  decisionRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.xs },
```

- [ ] **Step 5: Give `AttendeeRoster` accept/decline handlers and an `onAccept` callback prop**

Replace the `AttendeeRoster` function (currently `src/app/(tabs)/profile.tsx:471-537`):

```tsx
// A small self-fetching block rather than threading roster data through
// ProfileScreen's own state - each organized event's attendee list is
// independent of the rest of the screen's load/save cycle, and there's no
// other consumer that would benefit from lifting this fetch up.
function AttendeeRoster({
  eventId,
  organizerId,
  canRate,
  onAccept,
}: {
  eventId: string;
  organizerId: string;
  canRate: boolean;
  onAccept: (eventId: string) => void;
}) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingUserId, setDecidingUserId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingRoster(true);
    getEventRoster(supabase, eventId).then(async (rows) => {
      if (cancelled) return;
      setAttendees(rows);
      const ids = rows.map((row) => row.user_id);
      const [creditsById, myRatingsById] = await Promise.all([
        getCredits(supabase, ids),
        canRate && organizerId ? getMyRatings(supabase, eventId, organizerId) : Promise.resolve({}),
      ]);
      if (!cancelled) {
        setCredits(creditsById);
        setMyRatings(myRatingsById);
        setLoadingRoster(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, organizerId, canRate]);

  if (loadingRoster) return null;
  if (attendees.length === 0) return null;

  async function handleRate(rateeId: string, score: number) {
    setError(null);
    const previous = myRatings[rateeId] ?? 0;
    setMyRatings((prev) => ({ ...prev, [rateeId]: score }));
    try {
      await submitRating(supabase, { eventId, raterId: organizerId, rateeId, score });
    } catch (err) {
      setMyRatings((prev) => ({ ...prev, [rateeId]: previous }));
      setError(err instanceof Error ? err.message : 'Could not save rating.');
    }
  }

  async function handleDecide(userId: string, status: 'accepted' | 'declined') {
    setDecisionError(null);
    setDecidingUserId(userId);
    try {
      const { error: decideErr } = await supabase
        .from('event_participants')
        .update({ status })
        .eq('event_id', eventId)
        .eq('user_id', userId);
      if (decideErr) throw decideErr;
      setAttendees((prev) => prev.map((row) => (row.user_id === userId ? { ...row, status } : row)));
      if (status === 'accepted') onAccept(eventId);
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'Could not update request.');
    } finally {
      setDecidingUserId(null);
    }
  }

  return (
    <View style={styles.rosterCard}>
      <Text style={styles.rosterTitle}>👥 Players ({attendees.length})</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {decisionError && <Text style={styles.error}>{decisionError}</Text>}
      {attendees.map((attendee) => (
        <PersonRow
          key={attendee.user_id}
          name={attendee.profiles?.display_name ?? 'Unknown player'}
          skillLevel={attendee.profiles?.skill_level ?? null}
          contact={attendee.profiles?.contact_info}
          credit={credits[attendee.user_id]}
          statusLabel={
            attendee.status === 'accepted' ? 'Accepted' : attendee.status === 'declined' ? 'Declined' : 'Pending'
          }
          statusTone={attendee.status === 'accepted' ? 'green' : attendee.status === 'declined' ? 'danger' : 'neutral'}
          decision={
            attendee.status === 'pending'
              ? {
                  onAccept: () => handleDecide(attendee.user_id, 'accepted'),
                  onDecline: () => handleDecide(attendee.user_id, 'declined'),
                  loading: decidingUserId === attendee.user_id,
                }
              : undefined
          }
          rating={
            canRate && attendee.status === 'accepted'
              ? { value: myRatings[attendee.user_id] ?? 0, onChange: (score) => handleRate(attendee.user_id, score) }
              : undefined
          }
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 6: Wire `ProfileScreen`'s count-bump handler and pass it down**

Add this handler in `ProfileScreen` (e.g. directly after `handleLeaveEvent`, which currently ends around line 146):

```tsx
  // Bumps one event's displayed player count by 1 - called when the
  // organizer accepts a pending request, the one moment a request starts
  // counting (see ACTIVE_PARTICIPANT_STATUSES in src/lib/events.ts).
  function handleParticipantAccepted(eventId: string) {
    setParticipantCounts((prev) => ({ ...prev, [eventId]: (prev[eventId] ?? 1) + 1 }));
  }
```

Replace the `AttendeeRoster` call site (currently `:303`):

```tsx
              <AttendeeRoster
                eventId={event.id}
                organizerId={session?.user.id ?? ''}
                canRate={isPastEvent(event)}
                onAccept={handleParticipantAccepted}
              />
```

- [ ] **Step 7: Run the Jest test and confirm it passes**

Run: `npx jest profile-events-test`
Expected: PASS.

- [ ] **Step 8: Fix the stale "Withdrawn" copy in Discover**

In `src/app/(tabs)/index.tsx`, replace (currently around `:238-239`):

```tsx
                  ) : requestStatus === 'declined' ? (
                    <ActionButton label="Declined" onPress={() => {}} variant="muted" disabled />
```

- [ ] **Step 9: Run the full test suite**

Run: `npx jest`
Expected: PASS - every suite, including `profile-ratings-test.tsx` (its `organizedRoster` fixture includes a `'pending'` row named "Newbie," which now also renders Accept/Decline buttons; confirm this doesn't collide with any of that test's existing text queries - it shouldn't, since "Accept"/"Decline" aren't asserted there).

- [ ] **Step 10: Commit**

```bash
git add "src/app/(tabs)/profile.tsx" "src/app/(tabs)/index.tsx" __tests__/profile-events-test.tsx
git commit -m "feat: organizer can accept or decline a pending join request"
```

---

## Task 4: Manual on-device verification

**Files:** none (verification only).

- [ ] **Step 1: Confirm the local stack is up**

Run: `adb devices` - confirm an emulator is listed as `device`.
Run: `npx supabase status` - confirm it's running (`npx supabase start` if not).
Run: `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:54321 tcp:54321`.
Run (background): `npm run android:emulator`.

- [ ] **Step 2: Best-effort UI confirmation**

If a signed-in session is already present on the emulator (e.g. left over from a prior manual login), navigate to Profile → "My events" on an event with a pending request, screenshot (`adb exec-out screencap -p`), tap "Accept," screenshot again, and confirm the pill changes from "Pending" to "Accepted" and the event card's player count increments by 1.

If no signed-in session is available, this step cannot be completed by an automated agent - Google sign-in requires interactive OAuth that ADB input cannot drive (this exact limitation is already documented in `docs/superpowers/specs/2026-07-25-cancel-and-roster-design.md`'s "Manual, on-device" section). In that case, note this explicitly in the final report rather than skipping it silently - Tasks 1-3's automated coverage (Jest UI test + real-Postgres e2e test) is what actually gates completion.

- [ ] **Step 3: Report**

Summarize what was and wasn't confirmed on-device, and point to the passing `npx jest` run and `npm run test:participant-decision` run as the primary evidence.
