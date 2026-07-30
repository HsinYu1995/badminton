-- "Rate the host" (src/app/(tabs)/profile.tsx's RatingRow, rating
-- event.organizer_id) has been silently broken since ratings_insert_participant
-- was written: the ratee-side check required an accepted event_participants
-- row, but organizers never get one (see CONTEXT.md's Player count - "the
-- organizer, always exactly one - organizers have no event_participants row
-- of their own"). Confirmed live: an accepted attendee rating their event's
-- organizer was rejected with "new row violates row-level security policy".
--
-- Fix: a ratee is eligible if they're the event's organizer OR an accepted
-- participant - the same "organizer OR accepted participant" shape the rater
-- side already used. Also closes an adjacent gap while touching this clause:
-- nothing previously stopped rater_id = ratee_id (self-rating) on a raw
-- insert/update, even though the UI never offers it.
drop policy "ratings_insert_participant" on public.ratings;
create policy "ratings_insert_participant" on public.ratings
  for insert to authenticated with check (
    auth.uid() = rater_id
    and rater_id <> ratee_id
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

drop policy "ratings_update_own" on public.ratings;
create policy "ratings_update_own" on public.ratings
  for update to authenticated
  using (auth.uid() = rater_id)
  with check (
    auth.uid() = rater_id
    and rater_id <> ratee_id
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
