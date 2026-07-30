# Discover Feed Design

## Overview

Replace the placeholder `(tabs)/index.tsx` screen (currently just a raw event
count) with a real Discover feed: a list of upcoming, joinable events, with
an adjustable max-distance filter.

**Scope**: the Discover list, its distance filter, and the single backend
function (`discover_events`) that both power. No new screens beyond the
existing Discover tab.

**Explicitly deferred** (not in this plan):
- Event detail screen (tapping a row does nothing - none exists yet, same
  constraint the create-event plan hit).
- Join requests (accepting/requesting to join an event from this list).
- Any filter besides distance (e.g. by skill band, by date range, by fee).
- Pull-to-refresh / pagination - the event volume at this stage doesn't
  warrant either; a plain re-fetch on mount and on filter change is enough.

## What counts as "discoverable"

An event appears in Discover only if **all** of the following hold:

- `start_time` is in the future (`start_time > now()`).
- `status = 'open'` (`cancelled`/`completed` events never show).
- It is **not full**: the count of its `event_participants` rows with
  `status = 'accepted'` is less than `headcount_max`.
- (When a location is available) it is within the selected radius of the
  user's current position, measured from the event's venue.

An organizer's own upcoming events show up in their own feed like anyone
else's - no special-casing.

## Backend: a single `discover_events` function

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

One function serves both the with-location and without-location cases so
"not yet started", "not full", and "not cancelled" logic exists in exactly
one place - not duplicated between an RPC and a separate plain-PostgREST
fallback query (which couldn't express the not-full aggregate filter anyway;
PostgREST has no HAVING-style syntax for embedded-resource row counts).

Runs with the caller's privileges (no `security definer`), so it stays
subject to the existing `events_select_authenticated` and
`venues_select_authenticated` RLS policies (both `using (true)` for any
authenticated user) - this function doesn't widen what any user can already
read via those tables directly, it only adds filtering. `execute` is granted
to `authenticated` only, not `anon` - mirroring the lesson from the
create-event plan's final review, which flagged `nearby_venues`'s grant to
`anon` as dead/misleading since `anon` has no underlying table grant to read
`venues` in the first place.

## Discover screen behavior

**On mount:**
1. Check location permission status via
   `Location.getForegroundPermissionsAsync()` - a status check, this never
   itself prompts the user.
2. If already granted: fetch the current position via
   `Location.getCurrentPositionAsync()` (same call `venue-picker.tsx` already
   uses - no new location-fetching pattern), call
   `discover_events(lat, lng, radiusMeters)` with the selected radius
   (default 50 km = `50000`), render the list with distance shown and the
   distance picker visible.
3. If not granted: call `discover_events()` with no arguments (all three
   params `null` - no distance filtering), render the list with **no**
   distance column and **no** distance picker, and show an inline banner:
   "Enable location to filter by distance" with an **Enable** button.

**Enabling location:** tapping Enable calls
`Location.requestForegroundPermissionsAsync()` (same flow as venue
creation's "Use current location"). On grant, fetch position and re-fetch
via `discover_events` with the radius filter now applied; the distance
picker appears. On denial, the banner stays, with an inline error and Retry
- consistent with the venue-creation permission-denied pattern - but the
list itself stays visible and unfiltered throughout; a denied/failed
location fetch never blocks the list.

**Distance picker:** a `@expo/ui` `Picker` (same component the create-event
form already uses for skill-range selection) with four options - 5 km,
10 km, 20 km, 50 km - defaulting to 50 km once location is available.
Changing it re-calls `discover_events` with the new radius. The picker is
hidden entirely (not shown disabled) until location is available, since a
distance value without a location to measure from has no meaning.

**List item** (`src/components/event-list-item.tsx`, new): each row shows
- Title
- Venue name, plus distance when available (e.g. "Da-An Park Courts - 2.1 km";
  formatted as `(distance_meters / 1000).toFixed(1)` + " km")
- Formatted date/time (e.g. "Jul 22, 11:50 PM")
- Fee: "Free" when `fee === 0`, else "NT$ {fee}"
- Skill range as band labels (e.g. "Novice-Professional"), via a new
  `skillBandForLevel(level: number): SkillBand` helper added to
  `src/lib/skill-bands.ts` - looks up which `SKILL_BANDS` entry contains a
  given numeric level, used once for `skill_min` and once for `skill_max`.

Rows are not tappable (no event-detail screen exists to navigate to).

**Empty state:** when the fetch succeeds with zero rows, show "No upcoming
events" - distinct from the loading spinner and from the connection-error
text, so an empty result never reads as broken.

## Data flow summary

```
mount / filter change
  -> check permission (no prompt)
  -> [granted]    get position -> discover_events(lat,lng,radius) -> render (with distance + picker)
  -> [not granted]                discover_events()               -> render (no distance, Enable banner)

tap Enable
  -> request permission
  -> [granted] get position -> discover_events(lat,lng,radius) -> render (with distance + picker)
  -> [denied]  inline error + Retry, list stays as-is
```

## Testing approach

Following this repo's established pattern (`tests/schema.test.mjs` already
covers `nearby_venues` this same way) and this repo's global preference for
end-to-end over unit tests:

- **Automated**: a new `tests/discover-events.test.mjs` running against the
  real local Supabase stack. Sets up venues at known near/far coordinates
  and events covering every exclusion axis - future vs. past `start_time`,
  `open` vs. `cancelled` status, full vs. not-full headcount (via
  `event_participants` rows with `status = 'accepted'`) - and asserts
  `discover_events` includes/excludes each correctly, both with a radius
  (near included, far excluded) and without one (both near and far
  included, `distance_meters` is `null`). Also asserts `distance_meters`
  values are sane (within a small tolerance of the known coordinate
  distance) and that results are ordered by `start_time` ascending.
- **Manual, on-device**: granting/denying location, confirming the Enable
  banner and distance picker appear/disappear correctly, changing the
  distance picker and confirming the list narrows, and eyeballing that a
  full or cancelled or past event a tester seeds never appears. Same
  human-verification pattern as the create-event plan's Task 5 - this repo
  has no React Native render/component-test harness.

## Deferred items (not in this plan)

- Event detail screen / tapping a row.
- Join requests from this list.
- Filtering by anything other than distance (skill band, date range, fee).
- Pull-to-refresh or pagination.
