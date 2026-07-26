# Organizer Accept/Decline, Accepted-Only Player Count

## Overview

A follow-up to `2026-07-25-cancel-and-roster-design.md`, which explicitly
deferred this: "an accept/decline action for the organizer... the request
was to *view* participants, not to manage them." That pass also chose to
count pending + accepted requests specifically *because* no accept/decline
UI existed yet ("an accepted-only count would read as permanently zero").
Both of those conditions change together here: the organizer gets a real
accept/decline action, and the player count switches to accepted-only,
since accepted no longer means "nothing" once the action exists to produce
it.

As with the two prior passes in this area, this lands without any schema
migration. `participants_update_by_organizer` (organizer can update any
participant row on their own event) and `participants_update_self_withdraw`
(a requester can only move their own row to `'declined'`, never
`'accepted'` - self-approval is blocked) already exist, together with a
comment on the `'declined'` status noting it was "left in... for a possible
future organizer-reject flow." This pass is that flow - purely app-layer
work on top of backend capability that's been sitting there since
`20260716201044_rls_policies.sql`.

## Player count: accepted-only

`ACTIVE_PARTICIPANT_STATUSES` (`src/lib/events.ts`) changes from
`['pending', 'accepted']` to `['accepted']`. `computePlayerCounts` itself is
unchanged - it already just counts whatever rows it's handed - so this is a
one-line change plus fixing every place that assumed a request counts
immediately on join:

- **Discover** (`src/app/(tabs)/index.tsx`): `handleJoin`'s optimistic
  `participantCounts` bump is removed - a new request is `'pending'`, which
  no longer counts. `handleCancelRequest`'s optimistic decrement only fires
  when the row being removed was `'accepted'` ("Leave event"); cancelling a
  still-`'pending'` request ("Cancel request") no longer touches the count,
  since it was never counted.
- **Profile → "My events"**: no local optimistic count logic lives here
  today (counts come from `loadProfileSummary`'s one-shot fetch), but this
  is where the new increment happens - see below.
- `CONTEXT.md`'s **Player count** definition updates from "the organizer...
  plus every participant with a pending or accepted request" to "...plus
  every **accepted** participant," and the Relationships bullet drops
  "pending/accepted" for "accepted."
- `EventCard`'s `participantCount` prop comment ("pending + accepted") and
  the `ACTIVE_PARTICIPANT_STATUSES` comment in `events.ts` (which currently
  explains *why* pending counts - that reason goes away) both get corrected.

## Organizer accept/decline

`AttendeeRoster` (`src/app/(tabs)/profile.tsx`, organizer-only, already
renders a Pending/Accepted pill per row) gets Accept/Decline actions on rows
where `status === 'pending'`:

- **Accept** → `event_participants.update({ status: 'accepted' })` matched
  on `event_id` + `user_id`, relying on `participants_update_by_organizer`.
  On success: the row's local status flips to `'accepted'` (pill updates,
  buttons disappear), and a new `onAccept(eventId)` callback bumps that
  event's entry in `ProfileScreen`'s `participantCounts` by 1 - the one
  moment a request starts counting.
- **Decline** → same update with `status: 'declined'`. No count change (it
  was never counted). The row stays visible with a "Declined" pill -
  `AttendeeRoster` has no delete grant to remove it, matching the schema:
  only the requester can delete their own row
  (`participants_self_delete.sql`), if they choose to.
- Per-row `decidingUserId` / `decisionError` state, same shape as the
  existing `removingEventId`/`leavingEventId` handlers already on this
  screen.
- `PersonRow` gains a `decision` slot (buttons) alongside its existing
  `rating` slot, and its `statusLabel`/`statusTone` logic gains a
  `'declined'` case (currently only branches accepted-vs-not, which would
  mislabel a declined row as "Pending").

**Requester-side copy fix.** In `index.tsx`, a requester whose request was
declined currently renders a disabled **"Withdrawn"** button. That copy
dates from when self-cancel meant "move to `'declined'`"; self-cancel now
deletes the row outright (`2026-07-25-cancel-and-roster-design.md`), so
`'declined'` is only reachable via organizer decline from this point on.
Renamed to **"Declined"** to match what actually happened.

## Testing approach

- **Real Postgres e2e** (`tests/participant-decision.test.mjs`, new): two
  signed-in users plus a real event, following the existing alice/bob
  pattern in `tests/participant-lifecycle.test.mjs`. Specifically covers
  what was asked for - accept, then *both* sides can see it, then the count
  reflects it:
  - Organizer accepts a pending request → row's `status` becomes
    `'accepted'`.
  - **The organizer's own client** re-reads the roster (`event_participants`
    joined to `profiles`) and sees the participant's info with
    `status: 'accepted'`.
  - **The participant's own client** independently re-reads their request
    and sees `status: 'accepted'` plus the event/organizer info they'd now
    have access to.
  - The player count - queried the same way the app does,
    `event_participants` filtered to `status in ('accepted')` plus the
    implicit organizer - goes from 1 (pending, not counted) to 2 once
    accepted.
  - Decline path: status becomes `'declined'`, count stays at 1, the
    requester can still delete/re-request their own row.
  - RLS boundary checks: the requester cannot self-accept
    (`participants_update_self_withdraw` only permits self -> `'declined'`);
    a *different* organizer cannot decide on someone else's event.
- **Mocked-logged-in UI** (`__tests__/`, existing convention): extend
  `profile-events-test.tsx` with an Accept press on the existing pending
  roster row, asserting the `update` call, the pill flipping to "Accepted,"
  the Accept/Decline buttons disappearing, and the organized event's count
  moving from "1/8" to "2/8" in place. Update the three tests whose fixtures
  currently assume pending counts (`discover-join-test.tsx`:
  join no longer bumps 2/8, stays 1/8; `discover-test.tsx`: fixture's mixed
  pending/accepted rows reduced to only what a real accepted-only filter
  would return, count assertion corrected; `profile-events-test.tsx`'s
  existing count assertion split - the organized event with only a pending
  row now shows "1/8," the attending event with an accepted row stays
  "2/8"). `profile-data-test.ts`'s player-count fixture/comment updated the
  same way.
- **Manual, on-device**: drive the actual Accept button in the running
  emulator against the local Supabase stack and confirm the roster pill and
  the event card's count both update without a manual refresh.

## Deferred / explicitly not done

- Any notification to the requester that their request was decided
  (accepted or declined) - Discover already reflects the new status on next
  focus via its existing `useFocusEffect` reload; no push/toast was asked
  for.
- Undo/re-open a declined request from the organizer's side - only the
  requester can act on a declined row (delete it), matching the existing
  delete-grant boundary; not asked for here.
