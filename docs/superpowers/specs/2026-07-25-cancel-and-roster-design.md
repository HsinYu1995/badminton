# Cancel-Back-To-Join, Attendee Visibility, Organizer Headcount

## Overview

A follow-up correction and extension to the previous pass
(2026-07-25-request-lifecycle-and-identity-design.md): that pass made
cancelling a request permanent (`status = 'declined'`, no way back). That
turned out not to be what's wanted - cancelling should just return the
event to a plain "Join" state. This pass also adds real attendee
visibility in both directions (a player sees who's organizing a game
they're in; an organizer sees who's in their game) and fixes the headcount
to always account for the organizer, who is never a participant row but is
always a player.

## Cancel/leave goes back to Join, not "Withdrawn"

The previous design used the existing `participants_update_self_withdraw`
RLS policy (move to `'declined'`), which is permanent - no policy allows
moving a row back to `'pending'`, and the unique constraint blocks
re-inserting over an existing declined row. A new migration
(`20260725064939_participants_self_delete.sql`) adds a `delete` grant and
an `auth.uid() = user_id` RLS policy, so cancelling/leaving now deletes the
row outright. Re-requesting the same event afterward is a plain `insert`
again, exactly like the first time - no special-cased "declined" UI state
needed anymore. Verified end-to-end in `tests/participant-lifecycle.test.mjs`
(cancel, confirm the row is gone, re-insert succeeds, and a second user
can't delete someone else's row).

## Headcount always includes the organizer

An event's organizer has no `event_participants` row for their own event
(never required to formally join it), so the pending+accepted count from
the previous pass under-counted by exactly one - a brand new event with
zero requests showed "Up to N players" (or would have shown "0/N", which
is worse) when in reality the organizer is already there. The displayed
count is now always `1 + (pending + accepted)`, computed identically in
Discover and both of Profile's event lists. Since this count is now always
computable (the organizer is always known from `event.organizer_id`), the
"omit if not fetched" fallback in `EventCard` is effectively unused in
practice now, but left in place as a harmless default for any future caller
that doesn't fetch counts.

## "Games I'm playing" - organizer visibility for attendees

A new Profile section lists events where the signed-in user has an
`accepted` `event_participants` row, each showing the organizer's display
name, skill band, and contact info (fetched via `profiles`, whose
`profiles_select_authenticated` policy already permits reading any
profile - no new grant needed) and a "Leave event" action using the same
delete as Discover's cancel/leave. Leaving here is reflected on Discover
the next time that screen gains focus, via its existing
`useFocusEffect`-driven reload - no cross-screen sync code needed.

## Attendee roster - participant visibility for organizers

Each event in "My events" now shows who's requested/joined it: name,
pending/accepted status, skill band, and contact info per row, fetched via
`event_participants`'s existing `participants_select_authenticated` policy
(`using (true)` - already granted to every authenticated user) joined
against `profiles`. Implemented as a small self-fetching `AttendeeRoster`
component per event card rather than folding it into `ProfileScreen`'s main
load cycle, since each event's roster is independent of everything else the
screen loads and there's no other consumer for this data.

**Deliberately not built here**: an accept/decline action for the
organizer. The request was to *view* participants with their information,
not to manage them - `participants_update_by_organizer` already exists at
the RLS layer for whenever that's wanted.

## Testing approach

- **Real Postgres e2e**: `tests/participant-lifecycle.test.mjs` updated for
  delete-based cancel (was update-to-declined) - cancel removes the row,
  re-insertion after cancelling succeeds, and cross-user deletion is
  blocked.
- **Mocked-logged-in UI**: `discover-join-test.tsx` updated so cancelling
  asserts a `delete` call and a return to "Join" (not "Withdrawn"), with
  headcount assertions reflecting the organizer-inclusive count throughout
  the flow (1 -> 2 -> 1). `discover-test.tsx`'s count assertions updated
  the same way. New `profile-events-test.tsx` covers organizer info display
  on an accepted game, roster display on an organized game, the
  organizer-inclusive count on both, and leaving a game end-to-end
  (delete call + removal from the list).
- **Manual, on-device**: confirmed the organizer-inclusive headcount
  against real data left over from earlier e2e test runs ("Game A"/"Game B"
  correctly showing "2/8 players" - one active participant plus the
  organizer). Profile's new sections were confirmed to render their
  structure correctly (titles, dividers, empty states, no crash) but
  couldn't be shown fully populated in this pass's screenshot - running
  `supabase db reset` to apply the new migration invalidated the
  emulator's cached auth session (the signed-in user no longer existed in
  the freshly reset `profiles` table), which isn't something ADB-driven
  input can fix (it needs an interactive Google OAuth re-login). The
  resulting `"Cannot coerce the result to a single JSON object"` error is
  the expected PostgREST error for exactly this situation, not a defect in
  the new code - the automated coverage above independently verifies the
  actual feature logic against both real Postgres and a correctly
  logged-in mocked session.

## Deferred / explicitly not done

- Organizer accept/decline UI (see above).
- Any restriction on how many times a user can cancel-then-rejoin the same
  event - none was asked for, and the schema doesn't need one (each
  cancel fully clears the row).
