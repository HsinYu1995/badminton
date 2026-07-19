# Create Event Design

## Overview

Replace the placeholder `(tabs)/create.tsx` screen with a working organizer
flow for creating an event: title, description, venue, headcount, fee,
date/time, and skill range. This is the "next plan" referenced by the
project-scaffold plan's Task 2 review and by `create.tsx`'s own placeholder
text ("Event creation form goes here").

**Scope**: the create-event form and the venue-selection/venue-creation flow
it depends on (the `venues` table currently has zero rows - no seed data
exists - so an organizer cannot create an event at all without also being
able to add a venue).

**Explicitly deferred** (not in this plan):
- Event detail/list screens (Discover currently only shows a raw event
  count; a richer list/detail view is a separate future feature).
- Join requests, chat, ratings.
- Interactive map-pin venue picker (see "Venue location" below).
- Editing/cancelling an existing event.

## Data model changes

New migration adds two columns to `public.events`:

```sql
alter table public.events
  add column description text,
  add column fee numeric not null default 0 check (fee >= 0);
```

`description` is nullable (optional field). `fee` defaults to 0 (free event)
and is constrained non-negative, mirroring the existing `check` style used
elsewhere in this table (`headcount_max > 0`, `skill_min between 1 and 18`,
etc.).

No RLS or grant changes needed: the existing `events_insert_own` policy
(`with check (auth.uid() = organizer_id)`) and the existing
`grant select, insert, update, delete on public.events to authenticated`
already cover the new columns - Postgres RLS/grants operate at the row/table
level, not per-column.

## Venue location: current-GPS pin, not an interactive map

New venues are created with a text name + address, plus a location captured
via `expo-location`'s `getCurrentPositionAsync` at the moment of creation -
**not** an interactive map where the organizer drops/drags a pin. This means
venue creation must happen while physically at (or very near) the venue.
That's an accepted limitation for this MVP pass: it avoids adding a
map-rendering dependency and a materially larger UI surface, matching this
project's pattern of picking the smallest workable slice (see the Google
sign-in design's OAuth-strategy tradeoff for precedent). Revisit if organizer
feedback shows people want to register a venue before arriving.

New dependency: `expo-location`. Requires:
- `app.json` plugin entry (`expo-location`) with
  `locationAlwaysAndWhenInUsePermission`/iOS `NSLocationWhenInUseUsageDescription`
  and Android `ACCESS_FINE_LOCATION` permission strings.
- Runtime permission request via `Location.requestForegroundPermissionsAsync()`
  before calling `getCurrentPositionAsync()`.

If permission is denied, the "Add venue" sub-form blocks submission (the
"Use current location" button shows an inline error with a retry action) -
there's no address-geocoding fallback in this scope, so a venue genuinely
cannot be created without granting location access.

## Venue selection UI

- On opening the venue step, fetch `select * from public.venues` (RLS:
  `venues_select_authenticated`, `using (true)` - any authenticated user can
  read all venues) and render as a plain selectable list. No search/filter
  control - the venue list is expected to be near-empty at MVP scale, so a
  search box would be over-building for the current data volume.
- An "Add new venue" row at the end of the list reveals an inline sub-form
  (name, address, "Use current location" button).
- Submitting the sub-form inserts into `venues`
  (`created_by: session.user.id`, RLS: `venues_insert_authenticated`, `with
  check (auth.uid() = created_by)`), then selects the newly created venue and
  collapses the sub-form back to the list view with the new venue shown
  selected.

## Create-event form fields

| Field | Type | Maps to | Validation |
|---|---|---|---|
| Title | text | `title` | required, non-empty |
| Description | multiline text | `description` | optional |
| Venue | selection (flow above) | `venue_id` | required |
| Headcount | number input | `headcount_max` | integer, > 0 |
| Fee | number input, labeled "NT$" | `fee` | number, >= 0, blank/0 = free |
| Date | date picker | (combined into `start_time`/`end_time`) | required, not in the past |
| Start time | time picker | (combined into `start_time`) | required |
| Duration | number input (minutes) | (combined into `end_time` = `start_time` + duration) | > 0 |
| Skill range | two band pickers (from-band, to-band) | `skill_min`, `skill_max` | from-band <= to-band |

**Date/time pickers**: use the `DateTimePicker` component bundled under
`@expo/ui`'s `community` submodule (`@expo/ui` is already an installed
dependency for this Expo 57 project - no new package needed for date/time
input). Picking a duration in minutes rather than a separate end-time picker
avoids the possibility of entering an end time before the start time.

**Skill range**: per `CONTEXT.md`'s Skill level/Skill band distinction, the
organizer picks two of the 7 named bands (novice, beginner,
early_intermediate, intermediate, intermediate_advanced, advanced,
professional - the same list `public.skill_band()` produces), matching how
players already think about skill everywhere else in the app. Each band maps
to a fixed `[min, max]` numeric range (e.g. "novice" -> `[1, 3]`,
"professional" -> `[16, 18]`); on submit, `skill_min` = the from-band's min,
`skill_max` = the to-band's max. This mapping must stay in sync with
`skill_band()`'s SQL `case` statement in `20260716084150_init_schema.sql` -
duplicated client-side (as a plain TS constant, not a network round-trip)
since there's no RPC that exposes the band boundaries themselves.

## Submission flow

1. Client-side validation mirrors the DB constraints listed in the table
   above, so obviously-invalid input never reaches the network.
2. Compute `start_time` = combined date + start-time as an ISO string;
   `end_time` = `start_time` + duration minutes.
3. Insert into `events` with `organizer_id: session.user.id` (from
   `useAuth()`'s `session`, same pattern as `profile.tsx`/`auth-context.tsx`).
4. On success: navigate to the Discover tab (`(tabs)/index`) - there's no
   event-detail screen yet for a more specific destination.
5. On failure: show the raw Supabase error message inline (matching the
   existing error-display pattern in `login.tsx`/`profile.tsx`), keep the
   form's entered values so the organizer can fix and retry without
   re-entering everything.

## Testing approach

Following this repo's established pattern (`tests/schema.test.mjs`,
`tests/rls.test.mjs`, `tests/auth-profile-metadata.test.mjs` - Node scripts
run end-to-end against the real local Supabase stack, per this project's
lean toward integration/e2e over unit tests) and this repo's global testing
preference:

- **Automated**: a new `tests/create-event.test.mjs` that signs in a real
  test user (mirroring `createSignedInUser` in `tests/rls.test.mjs`), inserts
  a venue, inserts an event exercising the new `description`/`fee` columns
  (including the `fee >= 0` check-constraint boundary and default-to-0
  behavior when `fee` is omitted), and confirms the row reads back correctly
  and that RLS still rejects `organizer_id` set to someone else's user id.
- **Manual, on-device**: actually running the form in Expo Go - filling every
  field, granting/denying the location permission prompt, submitting, and
  confirming the created event's row matches what was entered. This is a
  human step, not an automated test, same as this project's documented
  pattern for OAuth/on-device verification in the Google sign-in plan.

## Deferred items (not in this plan)

- Interactive map-pin venue picker (see "Venue location" above).
- Event detail/list screens, join requests, chat, ratings.
- Editing or cancelling an existing event.
- Address geocoding fallback when location permission is denied.
