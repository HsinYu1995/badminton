# Guest Sign-In (Anonymous Auth)

## Overview

Lets a player join a game without a Google account, via Supabase's built-in
anonymous auth. A guest can browse Discover and request to join events; they
cannot organize events, add venues, rate other players, or edit a profile
beyond a single mandatory one-time skill-range pick (needed so an organizer
can judge fit when deciding to accept them). Everything else in the app
(RLS, session handling, screens not touched below) is unaffected.

## Why this scope

Two decisions shape everything below:

- **Guests are intentionally narrow** (join/leave only), not full accounts
  with a different display name source. The Credit/rating system exists to
  signal trustworthiness of *persistent* players; letting an anonymous,
  un-recoverable identity organize events or rate others would let it affect
  people's reputations with zero accountability (a guest session lost by
  reinstalling the app is gone forever - there's no email/password to
  recover it).
- **Skill range is the one exception**, because it's the one piece of
  profile data the accept/decline decision actually depends on - without
  it, an organizer has no way to judge whether a guest request is a good
  fit, which defeats the point of letting them request at all.

## Enabling guest sign-in

`supabase/config.toml`: flip `enable_anonymous_sign_ins` (currently
`false`, line 191) to `true`. Already rate-limited (`anonymous_users = 30`
per hour per IP, line 216) - no new rate-limiting work needed.

`src/lib/auth-context.tsx`: add `signInAsGuest()` alongside the existing
`signInWithGoogle()`:
```ts
async function signInAsGuest() {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}
```
Returns the same `Session` shape as Google sign-in - nothing downstream
needs to distinguish session *types* structurally. `AuthContextValue` gains
`signInAsGuest: () => Promise<void>`.

`src/app/(auth)/login.tsx`: a second button, "Continue as guest"
(`auth.continueAsGuest` translation key, both locales), calling
`signInAsGuest()`. Errors surface the same way `signInWithGoogle`'s
failures do today (existing `auth.signInFailed` key/pattern).

## Fixing the display-name trigger bug + tracking anonymity

Confirmed live on the local Supabase Postgres: `auth.users.is_anonymous
boolean not null default false` is a real, indexed column (Supabase's own
anonymous-auth support), and `public.profiles.display_name` is `text not
null` (`20260716084150_init_schema.sql:5`). The current
`handle_new_user()` trigger (`20260717060956_google_profile_metadata.sql`)
falls back to `split_part(new.email, '@', 1)` as its last resort - for an
anonymous user, `new.email` is `NULL`, so `split_part(null, '@', 1)` is
`NULL`, which would violate the `NOT NULL` constraint and make every guest
sign-up fail at the trigger. This is a real bug to fix regardless of
anything else here, the moment anonymous sign-ins are enabled.

New migration:
```sql
alter table public.profiles add column is_anonymous boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, photo_url, is_anonymous)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      case when new.email is not null then split_part(new.email, '@', 1) end,
      'Guest ' || substr(new.id::text, 1, 4)
    ),
    new.raw_user_meta_data->>'avatar_url',
    new.is_anonymous
  );
  return new;
end;
$$;
```
(The trigger itself is unchanged otherwise - same `on_auth_user_created`
trigger from `20260716084150_init_schema.sql`, just `create or replace
function`.)

`is_anonymous` is mirrored onto `profiles` at insert time only - there is
no update path (guests never convert to real accounts in this design; see
Out of scope). This is how every other part of the app tells a guest apart
from a real account, without needing to inspect `auth.users` (which isn't
safely exposed to client queries).

## Mandatory one-time skill-range gate

Supabase's client `Session.user.is_anonymous` mirrors the same column and
is available immediately after `signInAnonymously()` resolves - no DB
round-trip needed to know "this session is a guest."

`src/app/_layout.tsx`'s `RootNavigator` currently gates purely on
`session`/`isLoading` (`Stack.Protected guard={!!session}` /
`guard={!session}`). This adds a third state, checked only when
`session?.user.is_anonymous` is true: fetch this guest's own
`profiles.skill_level` (one row, `auth.uid() = id`, already permitted by
the existing `profiles_select_authenticated`/`profiles_update_own`
policies - no RLS change needed for this read or the write below). If it's
`null` (true for every freshly-created guest, same default as any new
profile), render a new screen - reusing the existing `SkillBandSelector`
component - instead of `(tabs)`. Selecting a band performs a single
`profiles` update (`skill_level`) and then proceeds into `(tabs)`.

This is a deliberate asymmetry, not an oversight: real (Google) users have
never had a mandatory skill-onboarding gate - `skill_level` stays optional,
self-reported whenever they visit the Profile tab
(`src/app/(tabs)/profile.tsx`'s existing `SkillBandSelector` usage). Guests
get a required gate specifically because they get no other screen to set
it from (see below - no Profile tab for guests at all).

"Not editable afterward" is a UX decision enforced by never giving a guest
a screen to reach the picker again - it is **not** a security restriction.
The existing `profiles_update_own` RLS policy (`auth.uid() = id`) doesn't
distinguish anonymity and is left completely unchanged; a guest's own
client could technically call the same update twice. Nothing depends on
that being prevented.

`(tabs)/_layout.tsx` hides the Profile tab entirely for a guest session
(`session?.user.is_anonymous`). The exact Expo Router SDK 57 mechanism for
conditionally omitting a `Tabs.Screen` (`href: null` vs. conditionally not
rendering the JSX element vs. something else version-specific) is pinned
down precisely at plan-writing time against the exact versioned docs, per
this repo's AGENTS.md directive - not decided here.

## RLS scope enforcement

Supabase exposes anonymity inside RLS via the JWT claim
`(auth.jwt()->>'is_anonymous')::boolean` - the standard, documented pattern
for exactly this kind of restriction, needing no join back to `profiles`.
Following this repo's existing precedent for altering a policy (`drop
policy ...; create policy ...;`, see
`supabase/migrations/20260726130000_ratings_organizer_ratee.sql`), three
policies in `supabase/migrations/20260716201044_rls_policies.sql` gain an
added clause:

- `events_insert_own` - `with check (auth.uid() = organizer_id and not
  coalesce((auth.jwt()->>'is_anonymous')::boolean, false))`. A guest can
  never organize an event.
- `venues_insert_authenticated` - same added clause on `created_by`. A
  guest can never add a venue (consistent with never organizing an event,
  the only place venue creation happens today).
- `ratings_insert_participant` - the same added clause on the **rater**
  side only (`auth.uid() = rater_id and not coalesce(...)`). The **ratee**
  side is untouched: an organizer rating a guest attendee is harmless (the
  guest never sees or benefits from it, and it doesn't affect anyone else's
  future decisions) and stays allowed.

`profiles_update_own` is untouched - required for the one-time skill-level
write above, and harmless to leave as-is per the "UX not security" note.

`chat_messages`'s policies (`chat_select_participant`/
`chat_insert_participant`) are deliberately left untouched: once accepted,
a guest can read and send chat messages for that event like any other
accepted participant. Coordinating logistics with the people you're playing
with is part of "joining a game," not the organize/rate trust surface this
design restricts.

## Guest badge

`src/lib/profile-data.ts`: `Attendee.profiles`'s type
(`{ display_name, skill_level, contact_info }`) gains `is_anonymous:
boolean`; the embedded select at `profile-data.ts:188`
(`profiles(display_name, skill_level, profile_contact(contact_info))`)
becomes `profiles(display_name, skill_level, is_anonymous,
profile_contact(contact_info))`.

`src/app/(tabs)/profile.tsx`: `PersonRow` gains an `isGuest?: boolean`
prop, rendering a small `Pill` (new `profile.guestBadge` translation key,
both locales) next to the name when true. `AttendeeRoster` and
`FellowParticipants` (the two `PersonRow` call sites) pass
`isGuest={attendee.profiles?.is_anonymous ?? false}`.

## Testing

- Migration/trigger: an integration test (this repo's existing
  `tests/integration/*.test.mjs` pattern, which already hits a live local
  Supabase instance) confirming an anonymous sign-up succeeds and produces
  a `profiles` row with a non-null auto-generated `display_name` and
  `is_anonymous = true` - directly exercises the bug this design fixes.
- RLS: integration tests confirming a guest's insert into `events`,
  `venues`, and `ratings` (as rater) is rejected, while `event_participants`
  insert (join request) and a single `profiles.skill_level` update both
  succeed.
- Onboarding gate: a new `tests/unit/*-test.tsx` (component test, mocked
  auth/supabase per this repo's existing pattern) confirming a guest
  session with `skill_level: null` renders the skill picker instead of
  `(tabs)`, and a guest with `skill_level` already set goes straight to
  `(tabs)`.
- Guest badge: extend the existing `profile-events-test.tsx`/similar
  roster tests with a case asserting the badge renders for an
  `is_anonymous: true` attendee and not for a regular one.
- Every existing test keeps passing unchanged - none of them exercise
  anonymous sessions today.

## Out of scope

- **Upgrading a guest to a real (Google) account.** Supabase supports
  linking an anonymous identity to a permanent one
  (`linkIdentity`/`updateUser`), preserving the same user id and history.
  Not built here - a guest who wants a persistent account starts over with
  a real Google sign-in, losing whatever join history they had as a guest.
  Worth a future pass if guests turn out to want this.
- **A cut-down Profile tab for guests.** Explicitly decided against - the
  skill pick is one-time, not revisitable; getting it wrong means starting
  a new guest session.
- Localizing the new "Guest"/"Continue as guest" strings is just two more
  `en`/`zhTW` dictionary entries, following the existing i18n pattern from
  the US/Taiwan localization work - not a new localization design, so not
  elaborated further here.
