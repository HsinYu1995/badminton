# Themed Splash Screen, Paginated/Sorted Discover, Clickable Profile Events, Peer Credit System

## Overview

Four requests bundled together (matching the app's own precedent of bundling
unrelated small-to-medium requests into one pass, e.g.
`2026-07-25-request-lifecycle-and-identity-design.md`):

1. A splash screen with a badminton-related image and a loading bar.
2. Discover fetches only the top 10 events (sorted by start time, then by
   distance from the viewer) and loads more as the user scrolls.
3. Tapping an event card in Profile navigates to a detail screen.
4. A peer credit system: any accepted participant (or the organizer) of an
   event can optionally score another accepted participant/the organizer
   0-5 stars; a Profile's Credit is the average of received scores, and is
   surfaced wherever a name already appears (roster rows, organizer card).

## Splash screen

**No new binary image asset.** The current `assets/images/splash-icon.png`
is a leftover from the unmodified Expo template (nearly invisible - a white
mark on white) and `icon.png` is the default blue "A" logomark - neither is
badminton-related, and there's no image-generation tool available in this
session to produce a new PNG. Rather than ship a fake/placeholder asset,
the "related image" is built the same way the rest of the app already
builds its iconography - the 🏸 emoji glyph, already used for the tab icon,
both screen titles, and every empty state - rendered large inside a
`Court.greenDeep` circle badge, which also lets the loading bar live in the
same composition instead of only a static native image.

- `app.json`'s `expo-splash-screen` plugin `backgroundColor` changes from
  the generic Expo blue `#208AEF` to `Court.greenDeep` (`#083D2C`), so the
  native splash (shown before any JS runs) is at least on-brand and hands
  off to the JS splash with no color flash.
- New `AppSplashScreen` component, rendered by `RootLayout` in place of
  `RootNavigator` for the (typically sub-second) window while fonts are
  loading or the auth session is still resolving: `Court.greenDeep`
  background, the 🏸 badge, "Badminton" in `Font.displayBlack`, and a
  determinate progress bar - not an ambient/looping animation, consistent
  with the scoreboard-redesign pass's "spend boldness in one place, no
  ambient animation" precedent. Progress is real, not fake: 50% once fonts
  are loaded, 100% once auth has resolved (`computeSplashProgress` in
  `src/lib/splash-progress.ts`, pure and unit-tested).
- `SplashScreen.hide()` (native) is called as soon as fonts are loaded
  (matches current behavior's `preventAutoHideAsync`/`hide` pair - both are
  current SDK 57 APIs per `docs.expo.dev/versions/v57.0.0/sdk/splash-screen`),
  immediately handing off to `AppSplashScreen`, which itself then yields to
  `RootNavigator` once auth resolves too.

## Discover: top 10, sorted by time then distance, infinite scroll

**New RPC, not a plain `.select().order()`**: distance from the viewer's
live coordinates has to be computed against `venues.location`
(`geography(point)`), which a plain PostgREST query can't express - so this
follows the same pattern as `nearby_venues`, a `stable` SQL function.
`public.discover_events(lat, lng, page_limit, page_offset)` joins
`events`/`venues`, filters to `status = 'open' and end_time > now()`
(Discover has never shown past events; this just moves that filter
server-side instead of fetching everything and filtering client-side),
and orders by `start_time asc, distance_meters asc nulls last, id asc` -
the `id` tiebreaker keeps pagination stable across pages when several
events share a start time. `lat`/`lng` are nullable: a viewer who declines
location permission (or is on web) still gets a fully-functional,
time-sorted list with `distance_meters = null` for every row, never an
error.

- Discover requests foreground location permission once per mount (same
  `Location.requestForegroundPermissionsAsync` /
  `getCurrentPositionAsync` pattern already used in `VenuePicker`) and
  passes the coordinates (or `null`/`null`) into every `discover_events`
  call.
- The `ScrollView` becomes a `FlatList` (`EventCard` as `renderItem`); the
  header (title, search bar) becomes `ListHeaderComponent`. `onEndReached`
  fetches the next page (`offset = events.length`, same `limit = 10`) and
  appends; a page shorter than 10 rows sets `hasMore = false` and further
  `onEndReached` calls become no-ops. A small `EventCard` extension shows
  `distance_meters` as a `"{km} km away"` Pill when present (formatted by
  a new pure `formatDistance` in `src/lib/events.ts`).
- **Search stays client-side over whatever's currently loaded**, exactly
  as before - typing a query doesn't trigger a fresh server search or
  auto-load further pages to find a match further down the list. This is a
  known, deliberate limitation (a user searching for an event past the
  first page(s) needs to scroll to load it first), flagged here rather than
  building a second server-side search path that wasn't asked for.

## Profile: clickable events

Every `EventCard` in both of Profile's lists ("Games I'm playing", "My
events") is wrapped in a `Pressable` that navigates to a new
`/event/[id]` route (`src/app/event/[id].tsx`, registered as a plain
`Stack.Screen` alongside `(tabs)` inside the root layout's
`Stack.Protected guard={!!session}` block, so it's reachable from either
tab but still requires auth). The detail screen shows the event's full
information (title, description, venue, start/end time, fee, skill range,
player count) via a new `getEventDetail(supabase, eventId)` - deliberately
just the event's own info, not a re-hosting of the roster/organizer-card/
rating UI that already lives inline on Profile (see below); duplicating
that content on a second screen wasn't asked for and would just be two
places to keep in sync. Discover's cards are **not** made clickable here -
only Profile's, matching what was actually requested.

## Peer credit system

**Reuses the existing `ratings` table as-is** (`score smallint check
(between 1 and 5)`, `unique(event_id, rater_id, ratee_id)`, insert already
gated by "ratee must be an accepted participant of the event; rater must
be that event's organizer or another accepted participant" - see
`20260716201044_rls_policies.sql`). That insert policy already matches
"give the host / participants in the same event a score" exactly: an
organizer or accepted participant can rate the organizer or any accepted
participant (never themselves, since inserting `rater_id = ratee_id` would
still need `ratee_id` to be an accepted participant, and nothing stops
self-rating at the DB layer - so the UI simply never renders a
rate-yourself control, which is the actual enforcement point here).

**"Optional" is modeled by absence, not a nullable score.** Not rating
someone is just never inserting a row - there's no all-zero/unrated sentinel
value stored. The star control itself starts unselected (no stars filled)
until the user taps one, matching "starting from 0" as the picker's initial
state, but a submitted rating is always 1-5 per the existing check
constraint - changing that constraint to allow a stored 0 would make "0
stars" ambiguous with "not yet rated," which is exactly the ambiguity the
existing schema already avoids.

**"Can be updated later"** is new: the `ratings` table had no update
policy (insert-only). New migration adds `ratings_update_own` (same
eligibility check as the insert policy, `auth.uid() = rater_id`) plus
`grant update`. The client submits via `supabase.from('ratings').upsert(...,
{ onConflict: 'event_id,rater_id,ratee_id' })`, so re-rating the same
person on the same event overwrites the row instead of erroring on the
unique constraint.

**Credit** (new CONTEXT.md term): the average of a Profile's received
`ratings.score`, computed on read - never stored, exactly like
`public.skill_band()`. Implemented as a view,
`public.profile_credit(profile_id, credit, ratings_count)`, `security_invoker
= true` (PG17 supports this; the underlying `ratings_select_authenticated`
policy is already `using (true)` so this is belt-and-suspenders, not a
functional change). **A Profile with zero ratings has no row in this view**
- absent, not zero - so the UI can render "Unrated" instead of a
misleadingly bad "0.0 ★". `src/lib/ratings.ts` exposes
`getCredits(supabase, userIds)` returning a `Record<userId, {credit,
count} | undefined>`.

### Where rating happens

Gated to **past events only** (`isPastEvent`), matching `PLAN.md`'s
original "Post-event ratings" framing - rating someone before a game has
even happened doesn't make sense, and the schema doesn't otherwise block
it, so the UI is the enforcement point.

- **"Games I'm playing"**: the existing organizer card gets a `CreditPill`
  next to the organizer's skill-band pill, plus a `StarRating` control to
  rate the host (past events only). This section is also extended with a
  **new fellow-participants list** - the event's other *accepted*
  participants (excluding self), each with name, skill band, `CreditPill`,
  and a `StarRating` to rate them. This didn't exist before: a non-organizer
  participant had no visibility into who else was in their game at all.
  Only accepted rows are shown here (not pending) - a regular participant
  doesn't need the organizer's pending-request triage view, just the
  people they actually played with.
- **"My events" attendee roster**: every row (any status, matching "the
  host should be able to see ALL the users") gets a `CreditPill`, satisfying
  "see the user name, score and skill level" for a pending requester. Only
  *accepted* rows additionally get a `StarRating` (rating a pending
  requester isn't possible - the RLS check requires the ratee to be
  accepted).

### Explicitly not built here

- **Organizer accept/decline UI.** The prior two passes
  (`2026-07-25-request-lifecycle-and-identity-design.md`,
  `2026-07-25-cancel-and-roster-design.md`) both deliberately deferred
  this, and this pass's request was specifically to *see* a pending
  requester's name/score/skill level, not to add a new accept/decline
  action - `participants_update_by_organizer` remains unused at the RLS
  layer, exactly as before.
- Auto-accept-if-in-skill-range (`PLAN.md`'s originally planned behavior,
  never implemented - `handleJoin` always inserts `status: 'pending'`) -
  unrelated to this pass, not touched.
- A written/text review alongside the star score - the schema's `ratings.
  comment` column exists but nothing surfaces it; only the numeric score is
  wired up, since only "a score... 0-5 stars" was asked for.

## Testing approach

- **Unit** (pure functions, no I/O): `computeSplashProgress`,
  `formatDistance`, `getEventDetail`/`getCredits`/rating-submit logic
  against a fake Supabase client (mirrors `profile-data-test.ts`'s
  pattern) in `__tests__/*-test.ts`.
- **Mocked-logged-in UI** (`renderRouter`, mocked `@/lib/supabase` and
  `@/lib/auth-context`, mocked `expo-location`): splash progress
  transition, Discover's initial-10-then-infinite-scroll behavior and
  distance display, Profile's navigation-on-tap, the fellow-participant
  roster and rating controls, credit pills rendering "Unrated" vs a real
  average.
- **Real Postgres e2e** (`tests/*.test.mjs`, the only things that
  genuinely need real Postgres): the `ratings_update_own` policy
  (including that it can't be used to bypass the accepted-participant
  check), the `profile_credit` view's aggregation and absence-when-unrated,
  and `discover_events`'s ordering/pagination/status-filter behavior.
- **Manual, on-device**: best-effort, following the same caveat prior
  passes noted about `supabase db reset` invalidating the emulator's
  cached auth session - confirmed what doesn't require a fresh login
  (splash screen, Discover's list/scroll/distance rendering).
