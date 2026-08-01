-- Enforces that accepting a pending event_participants request never lets an
-- event's Player count (organizer + accepted rows, see CONTEXT.md) exceed
-- headcount_max, even when two accepts race for the same event's last spot.
-- The advisory lock is keyed on event_id, so only accepts for the SAME event
-- serialize against each other. See
-- docs/adr/0002-event-capacity-enforced-by-trigger.md for why this lives in a
-- trigger (applies to every write path) rather than an RPC (only protects
-- callers that use it).
create or replace function public.enforce_event_headcount()
returns trigger
language plpgsql
as $$
declare
  v_headcount_max int;
  v_accepted_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));

  select headcount_max into v_headcount_max from public.events where id = new.event_id;
  select count(*) into v_accepted_count from public.event_participants
    where event_id = new.event_id and status = 'accepted';

  -- Player count if this accept goes through: organizer (1) + already-accepted
  -- rows + this row transitioning to accepted.
  if 1 + v_accepted_count + 1 > v_headcount_max then
    raise exception 'Event is full' using errcode = 'EVFUL';
  end if;

  return new;
end;
$$;

create trigger enforce_event_headcount_on_accept
  before update on public.event_participants
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function public.enforce_event_headcount();
