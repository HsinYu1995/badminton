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

(filled in as work proceeds)
