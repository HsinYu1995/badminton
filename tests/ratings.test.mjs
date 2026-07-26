// tests/ratings.test.mjs
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
  const carol = await createSignedInUser(`carol-${Date.now()}@example.com`);

  const { data: venue, error: venueErr } = await alice.client
    .from('venues')
    .insert({ name: 'Test Court', address: '1 Test St', location: 'SRID=4326;POINT(121.5 25.0)', created_by: alice.userId })
    .select()
    .single();
  assert(!venueErr, `venue insert failed: ${venueErr?.message}`);

  const { data: event, error: eventErr } = await alice.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Ratings Test Game',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!eventErr, `event insert failed: ${eventErr?.message}`);

  const { error: joinErr } = await bob.client
    .from('event_participants')
    .insert({ event_id: event.id, user_id: bob.userId, status: 'pending' });
  assert(!joinErr, `Bob joining failed: ${joinErr?.message}`);
  const { error: acceptErr } = await alice.client
    .from('event_participants')
    .update({ status: 'accepted' })
    .eq('event_id', event.id)
    .eq('user_id', bob.userId);
  assert(!acceptErr, `Alice accepting Bob failed: ${acceptErr?.message}`);

  // No ratings yet: profile_credit has no row for Bob (absent, not zero).
  const { data: creditBefore, error: creditBeforeErr } = await admin
    .from('profile_credit')
    .select('*')
    .eq('profile_id', bob.userId)
    .maybeSingle();
  assert(!creditBeforeErr, `profile_credit select failed: ${creditBeforeErr?.message}`);
  assert.strictEqual(creditBefore, null, 'Bob should have no profile_credit row before any ratings');

  const { error: rateErr } = await alice.client
    .from('ratings')
    .insert({ event_id: event.id, rater_id: alice.userId, ratee_id: bob.userId, score: 4 });
  assert(!rateErr, `Alice rating Bob failed: ${rateErr?.message}`);

  const { data: creditAfterOne } = await admin.from('profile_credit').select('*').eq('profile_id', bob.userId).single();
  assert.strictEqual(Number(creditAfterOne.credit), 4, 'Credit should be 4.00 after one rating of 4');
  assert.strictEqual(Number(creditAfterOne.ratings_count), 1);

  // Updating (not re-inserting) the same rating - upsert on the unique
  // (event_id, rater_id, ratee_id) constraint.
  const { error: upsertErr } = await alice.client
    .from('ratings')
    .upsert({ event_id: event.id, rater_id: alice.userId, ratee_id: bob.userId, score: 2 }, { onConflict: 'event_id,rater_id,ratee_id' });
  assert(!upsertErr, `Alice updating her rating of Bob failed: ${upsertErr?.message}`);

  const { data: ratingsForBob } = await admin.from('ratings').select('score').eq('event_id', event.id).eq('ratee_id', bob.userId);
  assert.strictEqual(ratingsForBob.length, 1, 'Updating a rating should overwrite the row, not add a second one');
  assert.strictEqual(ratingsForBob[0].score, 2);

  const { data: creditAfterUpdate } = await admin.from('profile_credit').select('*').eq('profile_id', bob.userId).single();
  assert.strictEqual(Number(creditAfterUpdate.credit), 2, 'Credit should reflect the updated score, not the original');

  // Carol never rated Bob - she can't update Alice's rating row.
  const { error: outsiderUpdateErr } = await carol.client
    .from('ratings')
    .update({ score: 5 })
    .eq('event_id', event.id)
    .eq('rater_id', alice.userId)
    .eq('ratee_id', bob.userId);
  const { data: ratingAfterOutsiderAttempt } = await admin
    .from('ratings')
    .select('score')
    .eq('event_id', event.id)
    .eq('rater_id', alice.userId)
    .eq('ratee_id', bob.userId)
    .single();
  assert(
    outsiderUpdateErr || ratingAfterOutsiderAttempt.score !== 5,
    "RLS should block Carol from updating Alice's rating of Bob"
  );

  // Multiple ratings average correctly.
  const { error: bobRatesCarolSetup } = await carol.client
    .from('event_participants')
    .insert({ event_id: event.id, user_id: carol.userId, status: 'pending' });
  assert(!bobRatesCarolSetup, `Carol joining failed: ${bobRatesCarolSetup?.message}`);
  await alice.client.from('event_participants').update({ status: 'accepted' }).eq('event_id', event.id).eq('user_id', carol.userId);

  await bob.client.from('ratings').insert({ event_id: event.id, rater_id: bob.userId, ratee_id: carol.userId, score: 5 });
  await alice.client.from('ratings').insert({ event_id: event.id, rater_id: alice.userId, ratee_id: carol.userId, score: 3 });

  const { data: creditCarol } = await admin.from('profile_credit').select('*').eq('profile_id', carol.userId).single();
  assert.strictEqual(Number(creditCarol.credit), 4, 'Carol credit should average (5+3)/2 = 4.00');
  assert.strictEqual(Number(creditCarol.ratings_count), 2);

  console.log('PASS: ratings can be updated by their own rater (not others), and profile_credit aggregates correctly and is absent when unrated');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
