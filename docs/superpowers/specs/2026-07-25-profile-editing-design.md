# Profile Editing + Compact Header

## Overview

The Profile screen had a centered avatar/name/skill-pill/sign-out block
dominating the top of the screen, and no way to edit anything beyond
signing out - `skill_level` existed in the schema (explicitly commented as
"unset until the player self-reports during onboarding (a later plan)") but
had no UI to set it, and there was nowhere to add a bio or contact info at
all. This pass does both things the user asked for: shrinks the
name/sign-out block into a compact top-right cluster, and adds a real
editable "My profile" section.

## Layout change

The old centered header (72px avatar, name, skill pill, full-width
"Sign out" button) is replaced with a two-column top row: the screen's own
title ("🏸 Profile", matching Discover/Create's convention) on the left, and
a small right-aligned cluster (32px avatar + name on one line, a lightweight
text-link "Sign out" beneath) on the right. This reclaims most of the
vertical space the old block used for the new editable section below it.

## Data model changes

```sql
alter table public.profiles
  add column bio text,
  add column contact_info text;
```

Both nullable, following the exact same self-report pattern already
documented on `skill_level`: NULL means "hasn't filled it in", not a
fabricated default. No RLS or grant changes needed - `profiles_update_own`
(`using (auth.uid() = id)`) and `grant select, update on public.profiles to
authenticated` already cover the new columns.

`contact_info` is a single free-text field rather than structured
phone/email/social columns - players share very different things (LINE ID,
phone, Instagram handle), and a free-text field with a hinting placeholder
("e.g. LINE ID, phone number") covers all of them without guessing at a
schema that would need to change again.

## Skill level editing

Reuses the `SkillBandSelector` chip component already built for event
creation (now accepting `selectedId: SkillBandId | null` so an unset skill
level renders with nothing selected, rather than defaulting to a band that
was never actually chosen). Selecting a band stores that band's `min` level
as `skill_level` - consistent with how the event-creation form already maps
band selection to numeric ranges, and it round-trips correctly through
`bandForLevel()` for display everywhere else in the app.

## Save flow

A single "Save profile" button submits bio, contact info, and skill level
together in one `update` call - simpler than three independent save
actions, and matches this app's existing single-submit-button pattern
(Create event, Join, Remove outdated event all work the same way). Success
shows an inline "Profile saved." message; failure shows the raw Supabase
error, matching the existing error-display convention.

## Testing approach

Following this repo's established pattern:

- **Automated, e2e against real Postgres**: `tests/profile-edit.test.mjs` -
  self-update round-trips bio/contact_info/skill_level, and a second user's
  attempt to edit them is silently blocked by RLS (same shape as
  `rls.test.mjs`'s existing `display_name` check, extended to the new
  columns).
- **Automated, mocked-logged-in UI**: `__tests__/profile-edit-test.tsx` -
  renders Profile with a mocked already-logged-in session and an initial
  skill_level of 8 (intermediate), confirms the matching chip is
  pre-selected, edits all three fields, saves, and asserts the exact update
  payload plus the success message.
- **Manual, on-device**: visually confirmed the compact header and the new
  section render correctly on the Pixel_9a emulator against the real local
  Supabase stack.

## Implementation log

- `feat: add profiles.bio and profiles.contact_info columns` - migration +
  `tests/profile-edit.test.mjs`. Full suite (`npm test`) green, `tsc
  --noEmit` clean, `test:schema`/`test:rls` re-verified with no regressions.
- `feat(ui): allow SkillBandSelector to render with no selection` - loosened
  `selectedId` to `SkillBandId | null`.
- `feat(profile): editable skill level, bio, and contact info; compact
  header` - the screen rewrite itself.
- `test(profile): cover editing skill level, bio, and contact info` -
  `__tests__/profile-edit-test.tsx`, passed on the first run.
- Visual QA on the Pixel_9a emulator (real local Supabase, real signed-in
  Google account): compact header cluster confirmed to no longer dominate
  the screen; skill chips render correctly unselected for this account's
  actual `skill_level: null`; bio/contact-info fields and Save button render
  and are positioned correctly. Did not drive a full manual save through
  blind ADB taps once two consecutive tap-coordinate misfires happened (the
  same class of fragility hit earlier with the date-field keyboard) - the
  automated e2e coverage above (real-Postgres round-trip + RLS in
  `profile-edit.test.mjs`, exact payload assertion in
  `profile-edit-test.tsx`) already verifies the save mechanics precisely,
  so further blind-tap automation wasn't worth the risk of misreporting a
  UI-driver mistake as a product bug.
- Final verification: `npm test` -> 7/7 suites passing. `npx tsc --noEmit`
  -> clean. `git status --short` -> clean working tree.

## Deferred / explicitly not done

- Structured contact fields (phone/email/social as separate columns) - a
  single free-text field is deliberately kept flexible instead.
- A profile photo upload flow - `photo_url` already exists on `profiles`
  (populated from Google sign-in) but editing it wasn't requested.
- Any change to how skill level displays elsewhere (Discover/Profile "My
  events" cards) - unaffected, still reads via `bandForLevel()`.
