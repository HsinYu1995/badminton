-- Discover's top-10-then-infinite-scroll list needs server-side pagination
-- ordered by start_time first, distance second (see docs/superpowers/specs/
-- 2026-07-25-discovery-pagination-credit-splash-design.md) - a plain
-- .select().order().range() can't add a distance term computed from the
-- viewer's live coordinates, so this mirrors nearby_venues' RPC pattern.
-- lat/lng are nullable: when the caller has no location (permission denied,
-- or web), distance_meters is null for every row and the ORDER BY falls
-- back to start_time (then id, for a stable tiebreak across pages).
create or replace function public.discover_events(
  lat double precision default null,
  lng double precision default null,
  page_limit int default 10,
  page_offset int default 0
)
returns table (
  id uuid,
  organizer_id uuid,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  headcount_max int,
  skill_min smallint,
  skill_max smallint,
  fee int,
  venue_name text,
  distance_meters double precision
)
language sql
stable
as $$
  select
    e.id, e.organizer_id, e.title, e.start_time, e.end_time,
    e.headcount_max, e.skill_min, e.skill_max, e.fee,
    v.name as venue_name,
    case when lat is null or lng is null then null
      else st_distance(v.location, st_setsrid(st_point(lng, lat), 4326)::geography)
    end as distance_meters
  from public.events e
  join public.venues v on v.id = e.venue_id
  where e.status = 'open' and e.end_time > now()
  order by e.start_time asc, distance_meters asc nulls last, e.id asc
  limit page_limit offset page_offset;
$$;

grant execute on function public.discover_events(double precision, double precision, int, int) to authenticated, anon;
