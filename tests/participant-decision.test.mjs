// tests/participant-decision.test.mjs
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

// Mirrors how the app computes an event's Player count: the organizer
// (always 1, no row of their own) plus every 'accepted' event_participants
// row - see src/lib/events.ts's ACTIVE_PARTICIPANT_STATUSES.
async function playerCount(eventId) {
  const { data, error } = await admin
    .from('event_participants')
    .select('event_id')
    .eq('event_id', eventId)
    .eq('status', 'accepted');
  assert(!error, `player count query failed: ${error?.message}`);
  return 1 + data.length;
}

async function main() {
  const organizer = await createSignedInUser(`organizer-${Date.now()}@example.com`);
  const otherOrganizer = await createSignedInUser(`other-organizer-${Date.now()}@example.com`);
  const participant = await createSignedInUser(`participant-${Date.now()}@example.com`);

  const { data: venue, error: venueErr } = await organizer.client
    .from('venues')
    .insert({
      name: 'Decision Test Court',
      address: '1 Test St',
      location: 'SRID=4326;POINT(121.5 25.0)',
      created_by: organizer.userId,
    })
    .select()
    .single();
  assert(!venueErr, `venue insert failed: ${venueErr?.message}`);

  const event = await createEvent(organizer.client, organizer.userId, venue.id, 'Decision Test Game');

  const { error: joinErr } = await participant.client
    .from('event_participants')
    .insert({ event_id: event.id, user_id: participant.userId, status: 'pending' });
  assert(!joinErr, `participant join failed: ${joinErr?.message}`);

  assert.strictEqual(await playerCount(event.id), 1, 'a pending request must not occupy a spot yet');

  // The requester cannot accept their own request.
  const { error: selfAcceptErr } = await participant.client
    .from('event_participants')
    .update({ status: 'accepted' })
    .eq('event_id', event.id)
    .eq('user_id', participant.userId);
  const { data: afterSelfAcceptAttempt } = await admin
    .from('event_participants')
    .select('status')
    .eq('event_id', event.id)
    .eq('user_id', participant.userId)
    .single();
  assert(
    selfAcceptErr || afterSelfAcceptAttempt.status === 'pending',
    'RLS should block a requester from accepting their own request'
  );

  // A different organizer cannot decide on this request.
  const { error: wrongOrganizerErr } = await otherOrganizer.client
    .from('event_participants')
    .update({ status: 'accepted' })
    .eq('event_id', event.id)
    .eq('user_id', participant.userId);
  const { data: afterWrongOrganizerAttempt } = await admin
    .from('event_participants')
    .select('status')
    .eq('event_id', event.id)
    .eq('user_id', participant.userId)
    .single();
  assert(
    wrongOrganizerErr || afterWrongOrganizerAttempt.status === 'pending',
    "RLS should block an organizer from deciding on another organizer's event"
  );

  // The actual organizer accepts.
  const { error: acceptErr } = await organizer.client
    .from('event_participants')
    .update({ status: 'accepted' })
    .eq('event_id', event.id)
    .eq('user_id', participant.userId);
  assert(!acceptErr, `organizer accept failed: ${acceptErr?.message}`);

  // Both sides can now see the accepted request, each through their own
  // authenticated client (not the admin/service-role client).
  const { data: seenByOrganizer, error: organizerReadErr } = await organizer.client
    .from('event_participants')
    .select('user_id, status, profiles(display_name)')
    .eq('event_id', event.id)
    .eq('user_id', participant.userId)
    .single();
  assert(!organizerReadErr, `organizer roster read failed: ${organizerReadErr?.message}`);
  assert.strictEqual(seenByOrganizer.status, 'accepted', "organizer's roster should show the accepted status");

  const { data: seenByParticipant, error: participantReadErr } = await participant.client
    .from('event_participants')
    .select('status, events(title, organizer_id)')
    .eq('event_id', event.id)
    .eq('user_id', participant.userId)
    .single();
  assert(!participantReadErr, `participant read-back failed: ${participantReadErr?.message}`);
  assert.strictEqual(
    seenByParticipant.status,
    'accepted',
    "the participant's own view should show the accepted status"
  );
  assert.strictEqual(seenByParticipant.events.title, 'Decision Test Game');

  assert.strictEqual(await playerCount(event.id), 2, 'an accepted request must occupy a spot');

  // Second request on the same event, this time declined.
  const declinedParticipant = await createSignedInUser(`declined-${Date.now()}@example.com`);
  const { error: joinBErr } = await declinedParticipant.client
    .from('event_participants')
    .insert({ event_id: event.id, user_id: declinedParticipant.userId, status: 'pending' });
  assert(!joinBErr, `second participant join failed: ${joinBErr?.message}`);

  const { error: declineErr } = await organizer.client
    .from('event_participants')
    .update({ status: 'declined' })
    .eq('event_id', event.id)
    .eq('user_id', declinedParticipant.userId);
  assert(!declineErr, `organizer decline failed: ${declineErr?.message}`);

  assert.strictEqual(await playerCount(event.id), 2, 'a declined request must not occupy a spot');

  const { data: declinedRow } = await admin
    .from('event_participants')
    .select('status')
    .eq('event_id', event.id)
    .eq('user_id', declinedParticipant.userId)
    .single();
  assert.strictEqual(declinedRow.status, 'declined');

  // The declined requester can still remove their own row (and could re-request).
  const { error: selfDeleteErr } = await declinedParticipant.client
    .from('event_participants')
    .delete()
    .eq('event_id', event.id)
    .eq('user_id', declinedParticipant.userId);
  assert(!selfDeleteErr, `declined requester should be able to delete their own row: ${selfDeleteErr?.message}`);

  console.log(
    'PASS: organizer accept/decline updates status, both organizer and participant can independently see the accepted result, the player count only reflects accepted requests, and RLS blocks self-accept and cross-organizer decisions'
  );
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
