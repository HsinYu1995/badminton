// tests/discover-pagination.test.mjs
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local');

const admin = createClient(url, serviceKey);

async function createSignedInUser(email) {
  const password = 'password123';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!error, `createUser failed: ${error?.message}`);
  const client = createClient(url, anonKey);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  assert(!signInErr, `signIn failed: ${signInErr?.message}`);
  return { client, userId: data.user.id };
}

// Taipei Main Station, used as the "near" venue / viewer point.
const NEAR = { lat: 25.0478, lng: 121.5170 };
// Tamsui - clearly farther from NEAR than a second venue placed a couple of
// blocks away from NEAR would be.
const FAR = { lat: 25.1700, lng: 121.4488 };

async function main() {
  const organizer = await createSignedInUser(`organizer-${Date.now()}@example.com`);

  const { data: nearVenue, error: nearVenueErr } = await organizer.client
    .from('venues')
    .insert({ name: 'Near Court', address: 'A', location: `SRID=4326;POINT(${NEAR.lng} ${NEAR.lat})`, created_by: organizer.userId })
    .select()
    .single();
  assert(!nearVenueErr, `near venue insert failed: ${nearVenueErr?.message}`);

  const { data: farVenue, error: farVenueErr } = await organizer.client
    .from('venues')
    .insert({ name: 'Far Court', address: 'B', location: `SRID=4326;POINT(${FAR.lng} ${FAR.lat})`, created_by: organizer.userId })
    .select()
    .single();
  assert(!farVenueErr, `far venue insert failed: ${farVenueErr?.message}`);

  async function createEvent(venueId, title, startOffsetMs) {
    const { data, error } = await organizer.client
      .from('events')
      .insert({
        organizer_id: organizer.userId,
        venue_id: venueId,
        title,
        start_time: new Date(Date.now() + startOffsetMs).toISOString(),
        end_time: new Date(Date.now() + startOffsetMs + 3600_000).toISOString(),
        headcount_max: 8,
        skill_min: 1,
        skill_max: 18,
      })
      .select()
      .single();
    assert(!error, `event insert failed for ${title}: ${error?.message}`);
    return data;
  }

  // Two events at the exact same start time, one near, one far - distance
  // should be the tiebreaker.
  const sameTime = 3600_000;
  const eventNear = await createEvent(nearVenue.id, 'Same Time Near', sameTime);
  const eventFar = await createEvent(farVenue.id, 'Same Time Far', sameTime);

  // A later event, always after the two same-time ones regardless of distance.
  const eventLater = await createEvent(nearVenue.id, 'Later Event', sameTime + 7200_000);

  // A past event and a cancelled event - both must be excluded.
  const pastEvent = await createEvent(nearVenue.id, 'Past Event', -7200_000);
  await admin.from('events').update({ end_time: new Date(Date.now() - 3600_000).toISOString() }).eq('id', pastEvent.id);
  const cancelledEvent = await createEvent(nearVenue.id, 'Cancelled Event', sameTime);
  await admin.from('events').update({ status: 'cancelled' }).eq('id', cancelledEvent.id);

  const { data: page, error: rpcErr } = await organizer.client.rpc('discover_events', {
    lat: NEAR.lat,
    lng: NEAR.lng,
    page_limit: 10,
    page_offset: 0,
  });
  assert(!rpcErr, `discover_events rpc failed: ${rpcErr?.message}`);

  const titles = page.map((e) => e.title);
  assert(!titles.includes('Past Event'), 'Past event must be excluded');
  assert(!titles.includes('Cancelled Event'), 'Cancelled event must be excluded');

  const relevant = page.filter((e) => [eventNear.id, eventFar.id, eventLater.id].includes(e.id));
  assert.strictEqual(relevant.length, 3, 'Expected exactly the 3 relevant events in the page');
  assert.strictEqual(relevant[0].id, eventNear.id, 'Near event should sort before the far event at the same start time');
  assert.strictEqual(relevant[1].id, eventFar.id, 'Far event should sort second, after near, before the later event');
  assert.strictEqual(relevant[2].id, eventLater.id, 'The later-starting event should sort last regardless of distance');
  assert(relevant[0].distance_meters < relevant[1].distance_meters, 'Near event distance should be smaller than far event distance');

  // Pagination: walking page_limit-2 pages should turn up the same 3
  // relevant events in the same relative order, with no gaps or dupes -
  // checked by accumulating pages (other tests' leftover events may be
  // interleaved, so this doesn't assume the relevant events fall within
  // any specific fixed page).
  const accumulated = [];
  const seenIds = new Set();
  for (let offset = 0; offset < 40; offset += 2) {
    const { data: pageRows, error: pageErr } = await organizer.client.rpc('discover_events', {
      lat: NEAR.lat,
      lng: NEAR.lng,
      page_limit: 2,
      page_offset: offset,
    });
    assert(!pageErr, `paginated discover_events call failed at offset ${offset}: ${pageErr?.message}`);
    for (const row of pageRows) {
      assert(!seenIds.has(row.id), `Row ${row.id} appeared twice across pages - pagination has a dupe`);
      seenIds.add(row.id);
    }
    accumulated.push(...pageRows);
    if (pageRows.length < 2) break;
    if (relevant.every((e) => seenIds.has(e.id))) break;
  }
  const accumulatedRelevantIds = accumulated.filter((e) => seenIds.has(e.id) && relevant.some((r) => r.id === e.id)).map((e) => e.id);
  assert.deepStrictEqual(accumulatedRelevantIds, relevant.map((e) => e.id), 'Paginated fetch should surface the relevant events in the same order as the single full-page fetch, with no gaps or dupes');

  // Null lat/lng: still returns results, ordered by time only, no error.
  const { data: noLocationPage, error: noLocationErr } = await organizer.client.rpc('discover_events', {
    lat: null,
    lng: null,
    page_limit: 10,
    page_offset: 0,
  });
  assert(!noLocationErr, `discover_events with null location failed: ${noLocationErr?.message}`);
  const noLocationRelevant = noLocationPage.filter((e) => [eventNear.id, eventFar.id, eventLater.id].includes(e.id));
  assert.strictEqual(noLocationRelevant.length, 3);
  for (const row of noLocationRelevant) {
    assert.strictEqual(row.distance_meters, null, 'distance_meters should be null when no location was provided');
  }

  console.log('PASS: discover_events orders by start_time then distance, paginates without gaps/dupes, excludes past/cancelled events, and degrades gracefully with no location');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
