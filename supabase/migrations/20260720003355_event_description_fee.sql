alter table public.events
  add column description text,
  add column fee integer not null default 0 check (fee >= 0);
