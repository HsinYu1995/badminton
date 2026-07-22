create or replace function public.discover_events(
  lat double precision default null,
  lng double precision default null,
  radius_meters double precision default null
)
returns table (
  id uuid,
  title text,
  description text,
  fee int,
  start_time timestamptz,
  end_time timestamptz,
  headcount_max int,
  skill_min smallint,
  skill_max smallint,
  venue_id uuid,
  venue_name text,
  venue_address text,
  distance_meters double precision
)
language sql
stable
as $$
  select
    e.id, e.title, e.description, e.fee, e.start_time, e.end_time,
    e.headcount_max, e.skill_min, e.skill_max,
    v.id, v.name, v.address,
    case
      when lat is not null and lng is not null
        then st_distance(v.location, st_setsrid(st_point(lng, lat), 4326)::geography)
      else null
    end as distance_meters
  from public.events e
  join public.venues v on v.id = e.venue_id
  where e.start_time > now()
    and e.status = 'open'
    and (
      select count(*) from public.event_participants p
      where p.event_id = e.id and p.status = 'accepted'
    ) < e.headcount_max
    and (
      lat is null or lng is null or radius_meters is null
      or st_dwithin(v.location, st_setsrid(st_point(lng, lat), 4326)::geography, radius_meters)
    )
  order by e.start_time asc;
$$;

grant execute on function public.discover_events(double precision, double precision, double precision)
  to authenticated;
