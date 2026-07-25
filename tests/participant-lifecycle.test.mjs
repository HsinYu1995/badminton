// tests/participant-lifecycle.test.mjs
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

async function createEvent(organizerClient, organizerId, venueId, title) {
  const { data, error } = await organizerClient
    .from('events')
    .insert({
      organizer_id: organizerId,
      venue_id: venueId,
      title,
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!error, `event insert failed: ${error?.message}`);
  return data;
}

async function main() {
  const alice = await createSignedInUser(`alice-${Date.now()}@example.com`);
  const bob = await createSignedInUser(`bob-${Date.now()}@example.com`);

  const { data: venue, error: venueErr } = await bob.client
    .from('venues')
    .insert({ name: 'Test Court', address: '1 Test St', location: 'SRID=4326;POINT(121.5 25.0)', created_by: bob.userId })
    .select()
    .single();
  assert(!venueErr, `venue insert failed: ${venueErr?.message}`);

  const eventA = await createEvent(bob.client, bob.userId, venue.id, 'Game A');
  const eventB = await createEvent(bob.client, bob.userId, venue.id, 'Game B');

  const { error: joinAErr } = await alice.client
    .from('event_participants')
    .insert({ event_id: eventA.id, user_id: alice.userId, status: 'pending' });
  assert(!joinAErr, `Alice joining Game A failed: ${joinAErr?.message}`);

  const { error: joinBErr } = await alice.client
    .from('event_participants')
    .insert({ event_id: eventB.id, user_id: alice.userId, status: 'pending' });
  assert(!joinBErr, `Alice joining Game B failed (should be allowed - unique constraint is per-event): ${joinBErr?.message}`);

  const { data: aliceRows } = await admin.from('event_participants').select('event_id, status').eq('user_id', alice.userId);
  assert.strictEqual(aliceRows.length, 2, 'Alice should hold two independent pending requests, one per event');

  const { error: withdrawErr } = await alice.client
    .from('event_participants')
    .update({ status: 'declined' })
    .eq('event_id', eventA.id)
    .eq('user_id', alice.userId);
  assert(!withdrawErr, `Alice withdrawing from Game A failed: ${withdrawErr?.message}`);

  const { data: gameBRow } = await admin
    .from('event_participants')
    .select('status')
    .eq('event_id', eventB.id)
    .eq('user_id', alice.userId)
    .single();
  assert.strictEqual(gameBRow.status, 'pending', "Withdrawing from Game A must not affect Alice's Game B request");

  const { error: reJoinErr } = await alice.client
    .from('event_participants')
    .insert({ event_id: eventA.id, user_id: alice.userId, status: 'pending' });
  assert(reJoinErr, 'Re-inserting into Game A after withdrawal should fail (unique(event_id, user_id) already holds a declined row)');

  console.log('PASS: a user can hold independent pending requests on multiple different events, withdrawing from one leaves the others untouched, and a withdrawn request cannot be silently re-created');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
