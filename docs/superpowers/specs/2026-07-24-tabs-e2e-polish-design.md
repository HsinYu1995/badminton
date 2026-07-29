# Tabs E2E Test Coverage + UI Polish Design

## Overview

The three tab screens (Discover, Create, Profile) already implement the full
pickup-game flow - create an event, search/browse events, join an event, and
remove an outdated (past) event you organized - on top of a custom "court
card" design system (`src/constants/badminton-theme.ts`, `EventCard`, `Pill`,
`ActionButton`, `SearchBar`). Two things are missing:

1. **Test coverage gaps.** `__tests__/` already covers event creation
   (`create-validation-test.tsx`, `create-submit-test.tsx`) and a basic
   Discover-tab render (`discover-test.tsx`), all using the established
   mocked-logged-in-user pattern (`jest.mock('@/lib/auth-context', ...)` +
   `jest.mock('@/lib/supabase', ...)` + `expo-router/testing-library`). Not
   covered: searching/filtering the Discover list, joining an event, and
   removing an outdated event from Profile.
2. **A few targeted UI affordance touches**, not a redesign (confirmed with
   the user) - small additions that make button/search/skill-range intent
   readable at a glance, in the same visual language already established.

**Explicitly deferred:** any change to `src/app/(auth)/login.tsx` (out of
scope - the goal is the three tabs), any new backend query/column (e.g. live
participant counts), any animation/spinner rework.

## Test additions

New files under `__tests__/`, one behavior per file (matching the existing
one-`it()`-per-file convention), reusing the existing mock shape for
`@/lib/auth-context` (`session: { user: { id: 'fake-user-id' } }`) and
`@/lib/supabase`:

- **`discover-search-test.tsx`**: seed two events with distinct
  titles/venues via the `supabase.from('events').select().order()` mock,
  type a query that matches only one of them into the search bar
  (`accessibilityLabel="Search events"`), assert the matching event's title
  is still present and the non-matching one is gone.
- **`discover-join-test.tsx`**: seed one event not organized by
  `fake-user-id`, mock `event_participants` insert, press the event's "Join"
  button, assert the insert was called with
  `{ event_id, user_id: 'fake-user-id', status: 'pending' }` and that the
  button becomes a disabled "Requested" button.
- **`profile-remove-test.tsx`**: seed the signed-in user's profile plus two
  events they organize - one with `end_time` in the past, one in the future
  - assert only the past one renders a "Remove outdated event" button (the
  future one shows "Upcoming"), press it, mock the `events` delete call,
  assert it's called with `.eq('id', <past event id>)` and the row
  disappears from the list.

## UI polish

All three are additive to existing components/screens, no prop-shape
breaking changes:

- **`SearchBar`**: add a persistent 🔍 glyph inside the field (left-aligned,
  `Court.inkSecondary`) so the field reads as "search" even before/after text
  is typed, not only via placeholder copy that disappears on focus.
- **`EventCard`**: add a thin horizontal "skill gauge" - a 1-18 scale strip
  with the event's `[skill_min, skill_max]` segment highlighted in that
  band's `SkillBandAccents` color - placed next to the existing
  `"{band.label} · Lv {min}-{max}"` pill. Lets a player see how competitive
  an event is at a glance instead of parsing the numeric range.
- **Empty states**: replace the current plain-text empty states
  (`"No upcoming events yet..."` in Discover, `"You haven't organized any
  events yet."` in Profile) with an icon-forward version (large emoji +
  short heading + subtext), same visual weight as the rest of the
  screen's header treatment.

## Testing approach

Following this repo's TDD/e2e-leaning convention: each test file above is
written first, run to confirm the behavior it targets doesn't yet pass (for
the join/remove tests, this mostly means confirming the target UI elements
exist and behave correctly - Discover/Profile already implement the
underlying join/remove logic, so these are characterization/regression
tests locking in existing behavior), then, where a UI polish item changes
markup a test also asserts against (none of the three do - the gauge and
icon additions are visually additive, and searchable text stays intact).
`npm test` (the full Jest suite) is run after every single change, not just
at task boundaries.

## Deferred items

- Live participant counts / capacity meters (needs a new aggregate query).
- Any redesign of `src/app/(auth)/login.tsx`.
- Animated loading states.
