# Custom Display Name, Request Cancellation, Live Headcounts

## Overview

Four related requests, all landing without any schema migration - the RLS
design already anticipated a request-withdraw flow (`participants_update_
self_withdraw`, with a comment explicitly describing it) and already grants
`select` on `event_participants` to every authenticated user, so counting
and cancelling were both just missing app-layer code, not missing backend
capability.

1. A custom display name, shown in the Profile screen's top-right corner in
   place of the Google-derived default once set.
2. Cancelling a join request.
3. Showing the current number of people signed up for each game.
4. Confirming a user can hold requests on multiple different games at once.

## Display name

`profiles.display_name` was already the field rendered in the corner - it
just had no edit UI. Added a "Display name" field at the top of Profile's
"My profile" section, required (the column is `not null`), saved together
with bio/contact/skill level through the existing single "Save profile"
action. On success, local `profile` state updates immediately
(`setProfile(prev => ({...prev, display_name: trimmedName}))`), so the
corner reflects the new name without waiting for a refetch.

## Cancelling a join request

The RLS policy `participants_update_self_withdraw` (`using (auth.uid() =
user_id)` / `with check (auth.uid() = user_id and status = 'declined')`)
was already in place with a comment explaining the intended design:
requesters may withdraw their own request by moving it to `'declined'`,
never accept it themselves. Discover's Join button becomes "Cancel request"
(pending) or "Leave event" (accepted) - both call the same handler, which
updates `status` to `'declined'`. There is no delete grant on
`event_participants`, confirming withdrawal-via-status-change (not
row deletion) is the schema's intended mechanism.

**Withdrawn is permanent in this pass.** `unique(event_id, user_id)` means
a second `insert` after withdrawing collides with the existing declined
row, and no RLS policy permits moving a row from `'declined'` back to
`'pending'` (self-withdraw only permits the reverse direction, and the
organizer-update policy has no such carve-out either). So a withdrawn
request renders as a disabled "Withdrawn" state rather than falling back to
an active "Join" button that would just fail. Re-requesting the same event
after withdrawing isn't possible through the app as it stands - flagged
here as a real, deliberate limitation rather than an oversight, verified in
`tests/participant-lifecycle.test.mjs`.

## Live participant counts

`EventCard` accepts an optional `participantCount` prop and shows
`"{count}/{max} players"` when present, falling back to the existing
`"Up to {max} players"` when absent (never a fabricated `"0/{max}"` for an
event whose count genuinely wasn't fetched). Both Discover and Profile's
"My events" fetch counts the same way - one `event_participants` query
filtered to the visible events' ids and `status in (pending, accepted)`,
aggregated client-side into a `Record<event_id, count>`
(`ACTIVE_PARTICIPANT_STATUSES`, now shared from `src/lib/events.ts` instead
of duplicated per screen).

**Pending + accepted, not accepted-only.** The app has no organizer
accept/decline UI yet (`participants_update_by_organizer` exists at the RLS
layer but nothing in the UI calls it), so an accepted-only count would read
as permanently zero for every event regardless of real signups. Counting
pending + accepted gives an honest, currently-useful number; revisit this
definition if/when an accept flow ships.

## Multiple simultaneous requests

Already fully supported - `unique(event_id, user_id)` scopes uniqueness per
event, not per user, so nothing needed to change in the schema or the app
to allow it. Verified (not built) via
`tests/participant-lifecycle.test.mjs`: a user can hold independent pending
requests on two different events at once, and withdrawing from one doesn't
touch the other.

## Testing approach

- **Real Postgres e2e**: `tests/participant-lifecycle.test.mjs` - multi-
  event join, independent withdrawal, and the withdraw-then-cannot-
  reinsert constraint.
- **Mocked-logged-in UI**: `discover-join-test.tsx` extended to press
  Cancel after Join and assert the resulting "Withdrawn" state;
  `discover-test.tsx` extended with a realistic 3-row participant mock to
  exercise the actual fetched-count path (not just the optimistic bump);
  `profile-edit-test.tsx` extended to actually change the display name
  (not just round-trip the existing value) and assert the corner updates,
  plus a new case blocking save on an empty name.
- **Manual, on-device**: confirmed against the real local Supabase stack
  and real prior e2e-test data - "Friendly Doubles" showing "2/8 players"
  with a live "Cancel request" button, "Game A" correctly falling back to
  "Up to 8 players" with an active "Join" button, and the Display name
  field correctly prefilled with the signed-in Google account's current
  name.

## Deferred / explicitly not done

- An organizer accept/decline UI - `participants_update_by_organizer`
  exists at the RLS layer, unused by the app; the participant count
  definition above is chosen specifically to stay useful without it.
- Allowing a withdrawn request to be re-submitted for the same event - the
  schema doesn't currently permit it (see above); would need either a new
  RLS policy allowing self-directed `'declined' -> 'pending'`, or switching
  withdrawal to a delete (which would need a new grant), neither of which
  was asked for here.
