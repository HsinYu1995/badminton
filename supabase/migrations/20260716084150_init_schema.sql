create extension if not exists postgis;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  photo_url text,
  -- Nullable: unset until the player self-reports during onboarding (a later
  -- plan). NULL means "hasn't onboarded yet", not "novice" - a fabricated
  -- default would silently affect matching before the user ever chose it.
  skill_level smallint check (skill_level between 1 and 18),
  created_at timestamptz not null default now()
);

create or replace function public.skill_band(level smallint)
returns text
language sql
immutable
as $$
  select case
    when level between 1 and 3 then 'novice'
    when level between 4 and 5 then 'beginner'
    when level between 6 and 7 then 'early_intermediate'
    when level between 8 and 9 then 'intermediate'
    when level between 10 and 12 then 'intermediate_advanced'
    when level between 13 and 15 then 'advanced'
    when level between 16 and 18 then 'professional'
    else null
  end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  location geography(point, 4326) not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index venues_location_idx on public.venues using gist (location);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id),
  venue_id uuid not null references public.venues(id),
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  headcount_max int not null check (headcount_max > 0),
  skill_min smallint not null check (skill_min between 1 and 18),
  skill_max smallint not null check (skill_max between 1 and 18),
  status text not null default 'open' check (status in ('open','cancelled','completed')),
  created_at timestamptz not null default now(),
  check (skill_min <= skill_max)
);

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  joined_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  rater_id uuid not null references public.profiles(id),
  ratee_id uuid not null references public.profiles(id),
  score int not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (event_id, rater_id, ratee_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create or replace function public.nearby_venues(lat double precision, lng double precision, radius_meters double precision)
returns setof public.venues
language sql
stable
as $$
  select *
  from public.venues
  where st_dwithin(
    location,
    st_setsrid(st_point(lng, lat), 4326)::geography,
    radius_meters
  );
$$;

grant execute on function public.nearby_venues(double precision, double precision, double precision) to authenticated, anon;

-- This CLI/cloud default no longer auto-exposes new tables to Data API roles
-- without explicit GRANTs (see supabase/config.toml: auto_expose_new_tables).
-- service_role is the trusted backend key and bypasses RLS entirely, so it
-- needs baseline table privileges now, independent of RLS. anon/authenticated
-- grants are deliberately left out here - they belong with Task 5's RLS
-- policies, which will pair "enable RLS" with exactly the grants each policy
-- needs.
grant select, insert, update, delete on
  public.profiles,
  public.venues,
  public.events,
  public.event_participants,
  public.ratings,
  public.chat_messages
to service_role;
