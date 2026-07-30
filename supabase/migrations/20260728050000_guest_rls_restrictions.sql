-- supabase/migrations/20260728050000_guest_rls_restrictions.sql
drop policy "events_insert_own" on public.events;
create policy "events_insert_own" on public.events
  for insert to authenticated with check (
    auth.uid() = organizer_id
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
  );

drop policy "venues_insert_authenticated" on public.venues;
create policy "venues_insert_authenticated" on public.venues
  for insert to authenticated with check (
    auth.uid() = created_by
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
  );

-- Rebuilt from supabase/migrations/20260726130000_ratings_organizer_ratee.sql's
-- definition (the current live policy), not the original
-- 20260716201044_rls_policies.sql one - only the rater-side anonymity check
-- is new here; the ratee-side organizer-or-accepted-participant check and the
-- rater_id <> ratee_id guard are unchanged and must be preserved verbatim.
drop policy "ratings_insert_participant" on public.ratings;
create policy "ratings_insert_participant" on public.ratings
  for insert to authenticated with check (
    auth.uid() = rater_id
    and rater_id <> ratee_id
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    and (
      auth.uid() = (select organizer_id from public.events where id = ratings.event_id)
      or exists (
        select 1 from public.event_participants
        where event_id = ratings.event_id and user_id = auth.uid() and status = 'accepted'
      )
    )
    and (
      ratee_id = (select organizer_id from public.events where id = ratings.event_id)
      or exists (
        select 1 from public.event_participants
        where event_id = ratings.event_id and user_id = ratings.ratee_id and status = 'accepted'
      )
    )
  );
