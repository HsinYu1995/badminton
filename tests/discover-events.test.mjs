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
