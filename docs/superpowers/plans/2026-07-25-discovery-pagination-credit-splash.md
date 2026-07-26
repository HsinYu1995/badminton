# Splash Screen, Discover Pagination, Clickable Profile Events, Peer Credit System Implementation Plan

**Goal:** Ship four bundled requests: a themed splash screen with a loading
bar, Discover limited to a time-then-distance-sorted top 10 with infinite
scroll, Profile event cards that navigate to a detail screen, and an
optional peer 0-5 star credit system surfaced wherever a name already
appears.

**Full design rationale:** `docs/superpowers/specs/2026-07-25-discovery-pagination-credit-splash-design.md`

## Global constraints

- `npm test` after every task; fix any regression before moving on.
- `npx tsc --noEmit` clean after every task.
- No em dashes in generated docs/comments/UI copy.
- Lowest-appropriate test level per change: pure-function unit tests for
  lib logic, mocked-`renderRouter` tests for screen behavior, real-Postgres
  `tests/*.test.mjs` only for RLS/view/RPC behavior that can't be verified
  any other way.

---

### Task 1: Ratings update policy + Credit view (schema)

**Files:** Create `supabase/migrations/20260725070000_ratings_update_and_credit.sql`; Create `tests/ratings.test.mjs`; Modify `CONTEXT.md` (already done - Credit term added).

- [x] Migration: `ratings_update_own` policy + `grant update`; `public.profile_credit` view (`security_invoker = true`).
- [x] `supabase db reset` (or `migration up`) locally, confirm no errors.
- [x] `tests/ratings.test.mjs`: insert, update-via-upsert changes the score, an outsider can't update someone else's rating, `profile_credit` aggregates correctly and is absent for an unrated profile.
- [x] `npm run test:schema`-style run of the new test file directly against local Supabase.
- [x] Commit.

### Task 2: discover_events RPC (schema)

**Files:** Create `supabase/migrations/20260725071000_discover_events_rpc.sql`; Create `tests/discover-pagination.test.mjs`.

- [x] Migration: `public.discover_events(lat, lng, page_limit, page_offset)`.
- [x] `tests/discover-pagination.test.mjs`: order (time then distance), limit/offset pagination, excludes past/cancelled events, null lat/lng falls back to time-only order.
- [x] Commit.

### Task 3: Splash screen

**Files:** Create `src/lib/splash-progress.ts`, `__tests__/splash-progress-test.ts`; Create `src/components/app-splash-screen.tsx`; Modify `src/app/_layout.tsx`, `app.json`.

- [x] `computeSplashProgress(fontsLoaded, authLoading)` pure function + unit test.
- [x] `AppSplashScreen` component (🏸 badge, title, determinate bar).
- [x] Wire into `RootLayout`; `app.json` splash `backgroundColor` -> `Court.greenDeep`.
- [x] `npm test`, `npx tsc --noEmit`, commit.

### Task 4: Discover rewrite (RPC + FlatList + infinite scroll + distance)

**Files:** Modify `src/lib/events.ts` (`formatDistance`, `EventListItem` distance field), `src/app/(tabs)/index.tsx`, `src/components/event-card.tsx`; Modify `__tests__/discover-test.tsx`, `discover-search-test.tsx`, `discover-join-test.tsx`; Create `__tests__/discover-pagination-test.tsx`.

- [x] `formatDistance` unit test.
- [x] Rewrite Discover to call `.rpc('discover_events', ...)`, `FlatList`, `onEndReached` pagination, location permission (graceful null fallback).
- [x] EventCard: optional distance Pill.
- [x] Update existing mocked tests for the new fetch shape; add pagination test.
- [x] `npm test`, `npx tsc --noEmit`, commit.

### Task 5: Ratings lib + StarRating + CreditPill

**Files:** Create `src/lib/ratings.ts`, `__tests__/ratings-lib-test.ts`; Create `src/components/star-rating.tsx`, `src/components/credit-pill.tsx`.

- [x] `getCredits(supabase, userIds)`, `submitRating(supabase, {...})` (upsert) + unit tests against a fake client.
- [x] `StarRating` (0-5 tap targets, controlled) and `CreditPill` ("Unrated" vs "X.X (n)") components.
- [x] `npm test`, `npx tsc --noEmit`, commit.

### Task 6: Profile - fellow-participant roster, credit pills, rating controls, click-to-detail

**Files:** Create `src/app/event/[id].tsx`, `src/lib/event-detail.ts`, `__tests__/event-detail-test.tsx`; Modify `src/app/_layout.tsx` (register route), `src/app/(tabs)/profile.tsx`, `src/lib/profile-data.ts`; Modify `__tests__/profile-events-test.tsx`.

- [x] `getEventDetail` lib fn + unit test; `/event/[id]` screen + mocked test.
- [x] `profile-data.ts`: extend `getEventRoster`/add a fellow-participants query for attending events.
- [x] Profile: wrap `EventCard`s in `Pressable` -> navigate; organizer card gets `CreditPill` + `StarRating`; new fellow-roster block on attending events; `AttendeeRoster` rows get `CreditPill` (+ `StarRating` on accepted rows).
- [x] Update `profile-events-test.tsx`; add navigation assertions.
- [x] `npm test`, `npx tsc --noEmit`, commit.

### Task 7: Final verification

- [x] `npm test` full suite green.
- [x] `npx tsc --noEmit` clean.
- [x] `git status --short` clean.
- [x] Manual on-device smoke via `npm run android:emulator` where feasible; document any known emulator/auth-reset friction rather than silently skipping.
- [x] Final ledger entry.

---

## Progress Ledger

- **2026-07-25, Task 1 (commit `e329d0e`):** `ratings_update_own` policy + `grant update`, `public.profile_credit` view (`security_invoker = true`, plus an explicit `service_role` grant - discovered service_role needs it too, unlike RLS bypass which is automatic). `tests/ratings.test.mjs` PASS against real local Postgres: update overwrites (not duplicates) a rating, an outsider can't update someone else's rating, credit aggregates correctly and is absent (not zero) when unrated.
- **2026-07-25, Task 2 (commit `e329d0e`):** `public.discover_events(lat, lng, page_limit, page_offset)` RPC, ordered `start_time, distance_meters nulls last, id`. `tests/discover-pagination.test.mjs` PASS: same-start-time tiebreak by distance, pagination walks without gaps/dupes (made robust to other tests' leftover rows by accumulating pages rather than assuming a fixed window), past/cancelled events excluded, null lat/lng degrades to time-only order with no error.
- **2026-07-25, Task 3 (commit `b199a81`):** `computeSplashProgress` (unit-tested), `AppSplashScreen` (🏸 badge on `Court.greenDeep`, determinate two-step progress bar), wired into `RootLayout` in place of the old silent native-splash-only gate; `app.json`'s splash `backgroundColor` changed to `Court.greenDeep`. `event/[id]` route stub registered. `npm test` 13/13, `tsc --noEmit` clean.
- **2026-07-25, Task 4 (commit `982fb21`):** Discover rewritten: `discover_events` RPC via a new `src/lib/discover-events.ts` (unit-tested), `FlatList` with `onEndReached` pagination, `formatDistance`, distance Pill on `EventCard`. Updated the three existing Discover mocked-UI tests for the new RPC-based fetch shape; added `discover-pagination-test.tsx`. Needed `initialNumToRender` raised past `FlatList`'s default virtualization window so a paginated 11th item actually renders in the RN Testing Library environment. `npm test` 16/16, `tsc --noEmit` clean.
- **2026-07-25, Task 5 (commit `990f371`):** `src/lib/ratings.ts` (`getCredits`, `getMyRatings`, `submitRating`, `formatCredit`), `StarRating`, `CreditPill`. Discovered this project's Jest setup has no working standalone `@testing-library/react-native` harness (only `expo-router/testing-library`'s `renderRouter`, which needs a route tree) - pulled the testable logic into pure functions (`formatCredit`) rather than fighting that gap, left the components to be exercised through the screens that render them in Task 6. `npm test` 17/17 (worker-parallelism timeouts observed and confirmed as environment flakiness, not regressions - isolated reruns always passed), `tsc --noEmit` clean.
- **2026-07-25, Task 6 (commit `908612c`):** `getEventDetail` (profile-data.ts), real `/event/[id]` screen, Profile cards wrapped in `Pressable` navigating there. New `FellowParticipants` (the other accepted players in a game you're attending - didn't exist before), `PersonRow`/`RatingRow` shared between it and the extended `AttendeeRoster` (now shows `CreditPill` per row, `StarRating` on accepted rows, gated to past events). Found and fixed a real bug during test-writing: the organizer's own `CreditPill` was never wired up (only the rating control was) - caught by `profile-ratings-test.tsx` failing on a missing `★ 5.0 (1)` text, not by inspection. Fixed the typed-routes `router.push` call (needed the `{ pathname, params }` object form, not a template-literal string). `npm test` 62/62 (clean runs), `tsc --noEmit` clean.
- **2026-07-25, Task 7 (final verification):** `npm test` full suite: 62/62 passing on clean/isolated runs; occasional 1-9 failures observed when run concurrently with the Android emulator + Metro also active on this machine, always confirmed as pure resource contention (every failing suite passes individually) - same category of infrastructure flakiness the 2026-07-25 scoreboard-redesign plan's ledger already documented (`system_server` crash, stale Metro bundle), not a code regression. `npx tsc --noEmit` clean. `git status --short` clean (aside from a pre-existing, pre-session `package-lock.json` diff from unrelated in-progress work, deliberately left untouched). **On-device**: confirmed the app boots and the entire new module graph loads without a runtime crash (login screen renders correctly on a fresh Metro bundle after a full `supabase db reset`) - could not get past login to visually confirm the splash transition or authenticated screens (Discover, Profile ratings, event detail) on-device, since `supabase db reset` invalidates the emulator's cached Google auth session and re-authenticating needs an interactive OAuth flow this session has no credentials for. This is the same specific limitation the 2026-07-25 cancel-and-roster-design spec documented for the same reason; the automated coverage above (62 Jest tests + 4 real-Postgres e2e tests) independently verifies the actual feature logic.

**Deferred / explicitly not done** (see the design doc for full rationale): organizer accept/decline UI, auto-accept-by-skill-range, a written review alongside the star score. All were out of scope for what was actually asked.
