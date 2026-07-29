-- profiles.is_anonymous is mirrored from auth.users.is_anonymous at
-- insert time only (see 20260728040000_guest_anonymous_auth.sql) and is
-- the sole signal behind the organizer-facing "Guest" badge
-- (src/app/(tabs)/profile.tsx's PersonRow). RLS is row-level, not
-- column-level, so profiles_update_own's existing "auth.uid() = id"
-- check does not stop a guest from rewriting their own is_anonymous to
-- false - revoke UPDATE on this one column specifically so the badge
-- can't be spoofed by the person it identifies, while leaving every
-- other self-editable column (display_name, skill_level) untouched.
revoke update (is_anonymous) on public.profiles from authenticated;
