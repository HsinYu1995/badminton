// tests/create-event.test.mjs
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

async function main() {
  const alice = await createSignedInUser(`alice-${Date.now()}@example.com`);
  const bob = await createSignedInUser(`bob-${Date.now()}@example.com`);

  const { data: venue, error: venueErr } = await alice.client
    .from('venues')
    .insert({
      name: 'Da-An Park Courts',
      address: '1 Xinsheng S Rd, Taipei',
      location: 'SRID=4326;POINT(121.535 25.026)',
      created_by: alice.userId,
    })
    .select()
    .single();
  assert(!venueErr, `venue insert failed: ${venueErr?.message}`);

  const { data: eventWithFee, error: feeErr } = await alice.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Casual Doubles',
      description: 'All levels welcome, bring your own racket.',
      fee: 150,
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!feeErr, `event insert with description/fee failed: ${feeErr?.message}`);
  assert.strictEqual(eventWithFee.description, 'All levels welcome, bring your own racket.', 'description should round-trip');
  assert.strictEqual(Number(eventWithFee.fee), 150, 'fee should round-trip');

  const { data: freeEvent, error: freeErr } = await alice.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Free Pickup Session',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!freeErr, `event insert without fee failed: ${freeErr?.message}`);
  assert.strictEqual(Number(freeEvent.fee), 0, 'fee should default to 0 when omitted');
  assert.strictEqual(freeEvent.description, null, 'description should default to null when omitted');

  const { error: negativeFeeErr } = await alice.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Invalid Fee Event',
      fee: -10,
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    });
  assert(negativeFeeErr, 'negative fee should be rejected by the fee >= 0 check constraint');

  const { error: forgedOrganizerErr } = await bob.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Forged Event',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    });
  assert(forgedOrganizerErr, 'RLS should block Bob from creating an event with organizer_id set to Alice');

  console.log('PASS: events.description/fee round-trip, default to null/0, fee check constraint, and organizer RLS all hold');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
