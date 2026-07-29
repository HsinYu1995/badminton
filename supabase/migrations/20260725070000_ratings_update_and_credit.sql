-- Ratings can be updated later (a rater changing their mind about a score),
-- previously insert-only. Mirrors the insert policy's eligibility check so
-- an update can't be used to backdoor a rating past the same rules - only
-- the score/comment of an existing, already-eligible row can change.
create policy "ratings_update_own" on public.ratings
  for update to authenticated
  using (auth.uid() = rater_id)
  with check (
    auth.uid() = rater_id
    and (
      auth.uid() = (select organizer_id from public.events where id = ratings.event_id)
      or exists (
        select 1 from public.event_participants
        where event_id = ratings.event_id and user_id = auth.uid() and status = 'accepted'
      )
    )
    and exists (
      select 1 from public.event_participants
      where event_id = ratings.event_id and user_id = ratings.ratee_id and status = 'accepted'
    )
  );

grant update on public.ratings to authenticated;

-- Credit (see CONTEXT.md): the average of a Profile's received
-- ratings.score, computed on read - never stored, same pattern as
-- public.skill_band(). security_invoker means this view is evaluated under
-- the querying user's own RLS, not the view owner's - belt-and-suspenders
-- here since ratings_select_authenticated already grants select to every
-- authenticated user, but the correct default regardless.
create view public.profile_credit
  with (security_invoker = true) as
  select
    ratee_id as profile_id,
    avg(score)::numeric(3, 2) as credit,
    count(*) as ratings_count
  from public.ratings
  group by ratee_id;

-- service_role needs an explicit grant too - unlike RLS (which it bypasses
-- entirely), object-level privileges on a newly created view aren't
-- inherited from anywhere, matching how the init migration explicitly
-- granted service_role privileges on every base table it created.
grant select on public.profile_credit to authenticated, service_role;
