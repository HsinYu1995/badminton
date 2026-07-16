// tests/rls.test.mjs
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

  await bob.client.from('profiles').update({ display_name: 'Hacked' }).eq('id', alice.userId);
  const { data: aliceProfileAfter } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', alice.userId)
    .single();
  assert(aliceProfileAfter.display_name !== 'Hacked', 'RLS should have blocked Bob from updating Alice\'s profile');

  const { data: venue, error: venueErr } = await alice.client
    .from('venues')
    .insert({
      name: 'Test Court',
      address: '1 Test St',
      location: 'SRID=4326;POINT(121.5 25.0)',
      created_by: alice.userId,
    })
    .select()
    .single();
  assert(!venueErr, `venue insert failed: ${venueErr?.message}`);

  const { data: event, error: eventErr } = await alice.client
    .from('events')
    .insert({
      organizer_id: alice.userId,
      venue_id: venue.id,
      title: 'Friendly Doubles',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!eventErr, `event insert failed: ${eventErr?.message}`);

  await bob.client.from('events').update({ title: 'Hijacked' }).eq('id', event.id);
  const { data: eventAfter } = await admin.from('events').select('title').eq('id', event.id).single();
  assert(eventAfter.title !== 'Hijacked', 'RLS should have blocked Bob from updating Alice\'s event');

  const { error: joinErr } = await bob.client
    .from('event_participants')
    .insert({ event_id: event.id, user_id: bob.userId, status: 'pending' });
  assert(!joinErr, `Bob should be able to request to join: ${joinErr?.message}`);

  const { error: selfAcceptErr } = await bob.client
    .from('event_participants')
    .update({ status: 'accepted' })
    .eq('event_id', event.id)
    .eq('user_id', bob.userId);
  const { data: participantAfterSelfAccept } = await admin
    .from('event_participants')
    .select('status')
    .eq('event_id', event.id)
    .eq('user_id', bob.userId)
    .single();
  assert(
    selfAcceptErr || participantAfterSelfAccept.status !== 'accepted',
    'RLS should have blocked Bob from accepting his own join request'
  );

  const { error: chatBeforeAcceptErr } = await bob.client
    .from('chat_messages')
    .insert({ event_id: event.id, sender_id: bob.userId, body: 'hi' });
  assert(chatBeforeAcceptErr, 'Bob should NOT be able to chat before being accepted');

  const { error: acceptErr } = await alice.client
    .from('event_participants')
    .update({ status: 'accepted' })
    .eq('event_id', event.id)
    .eq('user_id', bob.userId);
  assert(!acceptErr, `organizer accept failed: ${acceptErr?.message}`);

  const { error: chatAfterAcceptErr } = await bob.client
    .from('chat_messages')
    .insert({ event_id: event.id, sender_id: bob.userId, body: 'hi' });
  assert(!chatAfterAcceptErr, `Bob should be able to chat after being accepted: ${chatAfterAcceptErr?.message}`);

  const carol = await createSignedInUser(`carol-${Date.now()}@example.com`);
  const { error: rateOutsiderErr } = await alice.client
    .from('ratings')
    .insert({ event_id: event.id, rater_id: alice.userId, ratee_id: carol.userId, score: 1 });
  assert(rateOutsiderErr, 'Alice should NOT be able to rate Carol, who never joined this event');

  const { error: rateParticipantErr } = await alice.client
    .from('ratings')
    .insert({ event_id: event.id, rater_id: alice.userId, ratee_id: bob.userId, score: 5 });
  assert(!rateParticipantErr, `Alice should be able to rate Bob, an accepted participant: ${rateParticipantErr?.message}`);

  console.log('PASS: RLS policies enforce ownership and participant-gated chat/rating access');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
