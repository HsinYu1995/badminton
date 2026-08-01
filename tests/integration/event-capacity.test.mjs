// tests/integration/event-capacity.test.mjs
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

// Mirrors how the app computes an event's Player count: the organizer
// (always 1, no row of their own) plus every 'accepted' event_participants
// row - see src/lib/events.ts's ACTIVE_PARTICIPANT_STATUSES.
async function playerCount(eventId) {
  const { data, error } = await admin.from('event_participants').select('event_id').eq('event_id', eventId).eq('status', 'accepted');
  assert(!error, `player count query failed: ${error?.message}`);
  return 1 + data.length;
}

async function main() {
  const organizer = await createSignedInUser(`capacity-organizer-${Date.now()}@example.com`);

  const { data: venue, error: venueErr } = await organizer.client
    .from('venues')
    .insert({
      name: 'Capacity Test Court',
      address: '1 Test St',
      location: 'SRID=4326;POINT(121.5 25.0)',
      created_by: organizer.userId,
    })
    .select()
    .single();
  assert(!venueErr, `venue insert failed: ${venueErr?.message}`);

  // headcount_max=2: organizer (1) + one accepted spot = full. Two pending
  // requests race for that single remaining spot.
  const { data: event, error: eventErr } = await organizer.client
    .from('events')
    .insert({
      organizer_id: organizer.userId,
      venue_id: venue.id,
      title: 'Last Spot Game',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 2,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!eventErr, `event insert failed: ${eventErr?.message}`);

  const requesterA = await createSignedInUser(`capacity-requester-a-${Date.now()}@example.com`);
  const requesterB = await createSignedInUser(`capacity-requester-b-${Date.now()}@example.com`);

  for (const requester of [requesterA, requesterB]) {
    const { error: joinErr } = await requester.client
      .from('event_participants')
      .insert({ event_id: event.id, user_id: requester.userId, status: 'pending' });
    assert(!joinErr, `join failed: ${joinErr?.message}`);
  }

  assert.strictEqual(await playerCount(event.id), 1, 'two pending requests must not occupy any spots yet');

  // The organizer accepts both pending requests for the one remaining spot
  // at (as close as this client can get to) the same time - neither await
  // is resolved before the other request is sent.
  const [resultA, resultB] = await Promise.all([
    organizer.client.from('event_participants').update({ status: 'accepted' }).eq('event_id', event.id).eq('user_id', requesterA.userId).select('user_id'),
    organizer.client.from('event_participants').update({ status: 'accepted' }).eq('event_id', event.id).eq('user_id', requesterB.userId).select('user_id'),
  ]);

  const succeeded = [resultA, resultB].filter((r) => !r.error && r.data?.length);
  const rejected = [resultA, resultB].filter((r) => r.error);

  assert.strictEqual(
    succeeded.length,
    1,
    `exactly one of the two concurrent accepts should succeed when only one spot remains, but ${succeeded.length} did`
  );
  assert.strictEqual(rejected.length, 1, 'the other concurrent accept should be rejected, not silently succeed');
  assert.strictEqual(
    rejected[0].error.code,
    'EVFUL',
    `the rejected accept should fail with the event-full SQLSTATE, got: ${rejected[0].error.message} (code: ${rejected[0].error.code})`
  );

  assert.strictEqual(
    await playerCount(event.id),
    2,
    'final player count must never exceed headcount_max, even when two accepts race for the last spot'
  );

  console.log('PASS: concurrent accepts for the last spot in an event never push player count past headcount_max');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
