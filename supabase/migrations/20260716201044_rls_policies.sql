alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.ratings enable row level security;
alter table public.chat_messages enable row level security;

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id);

create policy "venues_select_authenticated" on public.venues
  for select to authenticated using (true);
create policy "venues_insert_authenticated" on public.venues
  for insert to authenticated with check (auth.uid() = created_by);
create policy "venues_update_own" on public.venues
  for update to authenticated using (auth.uid() = created_by);

create policy "events_select_authenticated" on public.events
  for select to authenticated using (true);
create policy "events_insert_own" on public.events
  for insert to authenticated with check (auth.uid() = organizer_id);
create policy "events_update_own" on public.events
  for update to authenticated using (auth.uid() = organizer_id);
create policy "events_delete_own" on public.events
  for delete to authenticated using (auth.uid() = organizer_id);

create policy "participants_select_authenticated" on public.event_participants
  for select to authenticated using (true);
create policy "participants_insert_own" on public.event_participants
  for insert to authenticated with check (auth.uid() = user_id and status = 'pending');
-- Requesters may only withdraw their own request (move it to 'declined'), never
-- accept it themselves - acceptance is the organizer's call alone. This is split
-- from the organizer policy below specifically so a requester can't bypass
-- organizer approval by updating their own row's status to 'accepted'.
create policy "participants_update_self_withdraw" on public.event_participants
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'declined');
create policy "participants_update_by_organizer" on public.event_participants
  for update to authenticated
  using (auth.uid() = (select organizer_id from public.events where id = event_id));

create policy "ratings_select_authenticated" on public.ratings
  for select to authenticated using (true);
-- The ratee must always be an accepted participant of the event - ratings are
-- between people who actually played together, not against arbitrary users.
-- The rater must be either an accepted participant themselves, or the event's
-- organizer: an organizer runs their own event but isn't required to have
-- joined it via event_participants (see participants_update_by_organizer
-- above, which checks events.organizer_id directly for the same reason), so
-- without this carve-out an organizer could never rate their own attendees.
create policy "ratings_insert_participant" on public.ratings
  for insert to authenticated with check (
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

create policy "chat_select_participant" on public.chat_messages
  for select to authenticated using (
    exists (
      select 1 from public.event_participants
      where event_id = chat_messages.event_id and user_id = auth.uid() and status = 'accepted'
    )
  );
create policy "chat_insert_participant" on public.chat_messages
  for insert to authenticated with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.event_participants
      where event_id = chat_messages.event_id and user_id = auth.uid() and status = 'accepted'
    )
  );

-- Task 4's migration deliberately withheld anon/authenticated table grants,
-- since this CLI's local Postgres doesn't auto-expose new tables to Data API
-- roles (see supabase/config.toml: auto_expose_new_tables) - it left them for
-- here, so each grant can be paired with exactly the RLS policies above that
-- rely on it. Without these grants, every query from `authenticated` fails at
-- the privilege layer ("permission denied for table X") before RLS is even
-- evaluated, no matter how permissive the policies are. Each grant below is
-- scoped to only the operations that table's policies actually allow - e.g.
-- profiles has no insert/delete policy, so it gets no insert/delete grant.
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.venues to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update on public.event_participants to authenticated;
grant select, insert on public.ratings to authenticated;
grant select, insert on public.chat_messages to authenticated;
