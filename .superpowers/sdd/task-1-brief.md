### Task 1: `discover_events` Postgres function

**Files:**
- Create: `supabase/migrations/<timestamp>_discover_events.sql`
- Create: `tests/discover-events.test.mjs`
- Modify: `package.json` (add `test:discover-events` script)

**Interfaces:**
- Consumes: local Supabase stack (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, from prior plans), existing `public.events`/`public.venues`/`public.event_participants` tables and their RLS policies (`events_select_authenticated`, `venues_select_authenticated`, both `using (true)`).
- Produces: `public.discover_events(lat double precision default null, lng double precision default null, radius_meters double precision default null) returns table (id uuid, title text, description text, fee int, start_time timestamptz, end_time timestamptz, headcount_max int, skill_min smallint, skill_max smallint, venue_id uuid, venue_name text, venue_address text, distance_meters double precision)`, callable via `supabase.rpc('discover_events', { lat, lng, radius_meters })` or `supabase.rpc('discover_events', {})`. Task 4's Discover screen consumes this directly.

- [ ] **Step 1: Write the failing test**

```js
// tests/discover-events.test.mjs
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && serviceKey, 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');

const supabase = createClient(url, serviceKey);

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function main() {
  const { data: organizer, error: organizerErr } = await supabase.auth.admin.createUser({
    email: `discover-organizer-${Date.now()}@example.com`,
    password: 'password123',
    email_confirm: true,
  });
  assert(!organizerErr, `createUser (organizer) failed: ${organizerErr?.message}`);

  const { data: participant, error: participantErr } = await supabase.auth.admin.createUser({
    email: `discover-participant-${Date.now()}@example.com`,
    password: 'password123',
    email_confirm: true,
  });
  assert(!participantErr, `createUser (participant) failed: ${participantErr?.message}`);

  const { data: nearVenue, error: nearVenueErr } = await supabase
    .from('venues')
    .insert({
      name: 'Taipei Main Station Courts',
      address: '3 Zhongxiao W Rd, Taipei',
      location: 'SRID=4326;POINT(121.5170 25.0478)',
      created_by: organizer.user.id,
    })
    .select()
    .single();
  assert(!nearVenueErr, `insert near venue failed: ${nearVenueErr?.message}`);

  const { data: farVenue, error: farVenueErr } = await supabase
    .from('venues')
    .insert({
      name: 'Tamsui Courts',
      address: 'Tamsui District, New Taipei',
      location: 'SRID=4326;POINT(121.4488 25.1700)',
      created_by: organizer.user.id,
    })
    .select()
    .single();
  assert(!farVenueErr, `insert far venue failed: ${farVenueErr?.message}`);

  async function insertEvent(overrides) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        organizer_id: organizer.user.id,
        venue_id: nearVenue.id,
        title: 'Discover test event',
        start_time: minutesFromNow(60),
        end_time: minutesFromNow(120),
        headcount_max: 8,
        skill_min: 1,
        skill_max: 18,
        ...overrides,
      })
      .select()
      .single();
    assert(!error, `insert event failed: ${error?.message}`);
    return data;
  }

  const eventNearOpen = await insertEvent({
    title: 'Near, open, future',
    start_time: minutesFromNow(60),
    end_time: minutesFromNow(150),
  });
  const eventNotFullBoundary = await insertEvent({
    title: 'Near, open, future, one spot left',
    start_time: minutesFromNow(80),
    end_time: minutesFromNow(170),
    headcount_max: 2,
  });
  const eventFarOpen = await insertEvent({
    title: 'Far, open, future',
    venue_id: farVenue.id,
    start_time: minutesFromNow(100),
    end_time: minutesFromNow(190),
  });
  const eventFull = await insertEvent({
    title: 'Near, open, future, full',
    start_time: minutesFromNow(120),
    end_time: minutesFromNow(210),
    headcount_max: 1,
  });
  const eventCancelled = await insertEvent({
    title: 'Near, cancelled, future',
    start_time: minutesFromNow(140),
    end_time: minutesFromNow(230),
    status: 'cancelled',
  });
  const eventPast = await insertEvent({
    title: 'Near, open, past',
    start_time: minutesFromNow(-120),
    end_time: minutesFromNow(-60),
  });

  const { error: participant1Err } = await supabase.from('event_participants').insert({
    event_id: eventNotFullBoundary.id,
    user_id: participant.user.id,
    status: 'accepted',
  });
  assert(!participant1Err, `insert accepted participant (not-full event) failed: ${participant1Err?.message}`);

  const { error: participant2Err } = await supabase.from('event_participants').insert({
    event_id: eventFull.id,
    user_id: participant.user.id,
    status: 'accepted',
  });
  assert(!participant2Err, `insert accepted participant (full event) failed: ${participant2Err?.message}`);

  const { data: withRadius, error: withRadiusErr } = await supabase.rpc('discover_events', {
    lat: 25.0478,
    lng: 121.5170,
    radius_meters: 5000,
  });
  assert(!withRadiusErr, `discover_events (with radius) failed: ${withRadiusErr?.message}`);

  const withRadiusIds = withRadius.map((e) => e.id);
  assert(withRadiusIds.includes(eventNearOpen.id), 'expected near open future event within radius');
  assert(withRadiusIds.includes(eventNotFullBoundary.id), 'expected near event with one spot left within radius');
  assert(!withRadiusIds.includes(eventFarOpen.id), 'expected far event excluded by radius');
  assert(!withRadiusIds.includes(eventFull.id), 'expected full event excluded');
  assert(!withRadiusIds.includes(eventCancelled.id), 'expected cancelled event excluded');
  assert(!withRadiusIds.includes(eventPast.id), 'expected past event excluded');

  const nearIndex = withRadiusIds.indexOf(eventNearOpen.id);
  const notFullIndex = withRadiusIds.indexOf(eventNotFullBoundary.id);
  assert(nearIndex < notFullIndex, 'expected results ordered by start_time ascending');

  const nearRow = withRadius.find((e) => e.id === eventNearOpen.id);
  assert(nearRow.distance_meters < 50, `expected near event distance close to 0, got ${nearRow.distance_meters}`);

  const { data: withoutRadius, error: withoutRadiusErr } = await supabase.rpc('discover_events', {});
  assert(!withoutRadiusErr, `discover_events (without radius) failed: ${withoutRadiusErr?.message}`);

  const withoutRadiusIds = withoutRadius.map((e) => e.id);
  assert(withoutRadiusIds.includes(eventNearOpen.id), 'expected near event included without a radius filter');
  assert(withoutRadiusIds.includes(eventNotFullBoundary.id), 'expected not-full event included without a radius filter');
  assert(withoutRadiusIds.includes(eventFarOpen.id), 'expected far event included without a radius filter');
  assert(!withoutRadiusIds.includes(eventFull.id), 'expected full event still excluded without a radius filter');
  assert(!withoutRadiusIds.includes(eventCancelled.id), 'expected cancelled event still excluded without a radius filter');
  assert(!withoutRadiusIds.includes(eventPast.id), 'expected past event still excluded without a radius filter');

  const allDistancesNull = withoutRadius.every((e) => e.distance_meters === null);
  assert(allDistancesNull, 'expected distance_meters to be null when no location is provided');

  console.log('PASS: discover_events excludes past/cancelled/full events, applies the radius filter when given one, and is unfiltered/null-distance when not');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
```

Add to `package.json` scripts:

```json
"test:discover-events": "node --env-file=.env.local tests/discover-events.test.mjs"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:discover-events
```

Expected: FAIL - `discover_events` doesn't exist yet (PostgREST error like `Could not find the function public.discover_events`).

- [ ] **Step 3: Write the migration**

```bash
npx supabase migration new discover_events
```

This creates `supabase/migrations/<timestamp>_discover_events.sql`. Fill it with:

```sql
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
```

- [ ] **Step 4: Apply the migration**

```bash
npx supabase db reset
```

Expected: output ends with all migrations applying cleanly (no SQL errors).

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:discover-events
```

Expected: `PASS: discover_events excludes past/cancelled/full events, applies the radius filter when given one, and is unfiltered/null-distance when not`

Also re-run the pre-existing suites to confirm nothing regressed:

```bash
npm run test:schema
npm run test:rls
npm run test:create-event
npm run test:skill-bands
```

Expected: all four still `PASS`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/discover-events.test.mjs package.json
git commit -m "feat: add discover_events function for the Discover feed"
```

---

