-- Optional organizer-authored Mandarin address (see docs/superpowers/specs/
-- 2026-07-28-mandarin-venue-address-design.md). NULL means "not yet
-- translated" - the display-side fallback in venue-picker.tsx reverse-
-- geocodes the venue's own coordinates for a zh-TW viewer in that case.
alter table public.venues add column address_zh text;

-- Exposes venues.location's coordinates as plain doubles for the client -
-- there is no existing precedent in this codebase for reading raw lat/lng
-- off a geography column (the one existing consumer, discover_events,
-- computes st_distance entirely server-side and never returns
-- coordinates - confirmed by grep, no ST_Y/ST_X/latitude/longitude
-- anywhere in that migration). Generated + stored so they're computed once
-- from the existing `location` value with no application code needed to
-- keep them in sync.
alter table public.venues
  add column latitude double precision generated always as (st_y(location::geometry)) stored,
  add column longitude double precision generated always as (st_x(location::geometry)) stored;
