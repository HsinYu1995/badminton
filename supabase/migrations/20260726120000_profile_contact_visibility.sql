-- profiles_select_authenticated (using (true)) let any authenticated user read
-- every profile's bio/contact_info directly via the Data API, not just people
-- who share an event with them - e.g. any signed-in user could dump every
-- player's phone/LINE ID, and /event/[id] exposed an organizer's contact_info
-- to a viewer with zero relationship to that event. RLS is row-level, not
-- column-level, so the fix is the same shape as ratings/profile_credit: split
-- the sensitive columns into their own table with a relationship-scoped
-- policy, leaving profiles' display_name/skill_level/photo_url public (still
-- needed for browsing and rosters before any relationship exists).
create table public.profile_contact (
  id uuid primary key references public.profiles(id) on delete cascade,
  bio text,
  contact_info text
);

insert into public.profile_contact (id, bio, contact_info)
select id, bio, contact_info from public.profiles
where bio is not null or contact_info is not null;

alter table public.profiles drop column bio, drop column contact_info;

-- Mirrors who can see a player's Credit (CONTEXT.md) plus the organizer's
-- need to vet not-yet-accepted requesters: self; the organizer of an event
-- the other person has any request row (pending or accepted) on; or two
-- people who are both accepted participants of the same event.
create or replace function public.can_view_contact(viewer uuid, owner uuid)
returns boolean
language sql
stable
as $$
  select viewer = owner
    or exists (
      select 1 from public.events e
      join public.event_participants ep on ep.event_id = e.id
      where e.organizer_id = owner and ep.user_id = viewer
    )
    or exists (
      select 1 from public.events e
      join public.event_participants ep on ep.event_id = e.id
      where e.organizer_id = viewer and ep.user_id = owner
    )
    or exists (
      select 1 from public.event_participants ep1
      join public.event_participants ep2 on ep1.event_id = ep2.event_id
      where ep1.user_id = viewer and ep1.status = 'accepted'
        and ep2.user_id = owner and ep2.status = 'accepted'
    );
$$;

alter table public.profile_contact enable row level security;

create policy "profile_contact_select_related" on public.profile_contact
  for select to authenticated using (public.can_view_contact(auth.uid(), id));
create policy "profile_contact_insert_own" on public.profile_contact
  for insert to authenticated with check (auth.uid() = id);
create policy "profile_contact_update_own" on public.profile_contact
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

grant select, insert, update on public.profile_contact to authenticated;
grant select, insert, update, delete on public.profile_contact to service_role;
