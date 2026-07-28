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

async function createGuest() {
  const client = createClient(url, anonKey);
  const { data, error } = await client.auth.signInAnonymously();
  assert(!error, `guest sign-in failed: ${error?.message}`);
  return { client, userId: data.user.id };
}

async function main() {
  const organizer = await createSignedInUser(`guest-rls-organizer-${Date.now()}@example.com`);
  const guest = await createGuest();

  // Guest cannot add a venue.
  const { error: venueErr } = await guest.client
    .from('venues')
    .insert({ name: 'Guest Court', address: '1 Guest St', location: 'SRID=4326;POINT(121.5 25.0)', created_by: guest.userId })
    .select()
    .single();
  assert(venueErr, 'RLS should block a guest from inserting a venue');

  // Guest cannot organize an event. Needs a real venue - the organizer creates one.
  const { data: venue, error: organizerVenueErr } = await organizer.client
    .from('venues')
    .insert({ name: 'Organizer Court', address: '1 Organizer St', location: 'SRID=4326;POINT(121.5 25.0)', created_by: organizer.userId })
    .select()
    .single();
  assert(!organizerVenueErr, `organizer venue insert failed: ${organizerVenueErr?.message}`);

  const { error: guestEventErr } = await guest.client
    .from('events')
    .insert({
      organizer_id: guest.userId,
      venue_id: venue.id,
      title: 'Guest-Organized Game',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(guestEventErr, 'RLS should block a guest from organizing an event');

  // Guest CAN join an event as a participant.
  const { data: event, error: eventErr } = await organizer.client
    .from('events')
    .insert({
      organizer_id: organizer.userId,
      venue_id: venue.id,
      title: 'Organizer Game',
      start_time: new Date(Date.now() + 3600_000).toISOString(),
      end_time: new Date(Date.now() + 7200_000).toISOString(),
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
    })
    .select()
    .single();
  assert(!eventErr, `organizer event insert failed: ${eventErr?.message}`);

  const { error: joinErr } = await guest.client
    .from('event_participants')
    .insert({ event_id: event.id, user_id: guest.userId, status: 'pending' });
  assert(!joinErr, `RLS should allow a guest to request to join: ${joinErr?.message}`);

  await admin.from('event_participants').update({ status: 'accepted' }).eq('event_id', event.id).eq('user_id', guest.userId);

  // Guest cannot rate as rater.
  const { error: guestRateErr } = await guest.client
    .from('ratings')
    .insert({ event_id: event.id, rater_id: guest.userId, ratee_id: organizer.userId, score: 5 });
  assert(guestRateErr, 'RLS should block a guest from submitting a rating as rater');

  // Organizer CAN rate the guest attendee (ratee side untouched).
  const { error: organizerRateGuestErr } = await organizer.client
    .from('ratings')
    .insert({ event_id: event.id, rater_id: organizer.userId, ratee_id: guest.userId, score: 5 });
  assert(!organizerRateGuestErr, `organizer should be able to rate a guest attendee: ${organizerRateGuestErr?.message}`);

  // Guest CAN set their own skill_level (profiles_update_own untouched).
  const { error: skillErr } = await guest.client.from('profiles').update({ skill_level: 3 }).eq('id', guest.userId);
  assert(!skillErr, `RLS should allow a guest to set their own skill_level: ${skillErr?.message}`);

  console.log('PASS: guest RLS restrictions (no venue/event insert, no rating as rater) and allowances (join, own skill_level, ratee-side rating) all hold');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
