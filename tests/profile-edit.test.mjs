// tests/profile-edit.test.mjs
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

  // skill_level still lives on profiles.
  const { data: updatedProfile, error: updateErr } = await alice.client
    .from('profiles')
    .update({ skill_level: 8 })
    .eq('id', alice.userId)
    .select('skill_level')
    .single();
  assert(!updateErr, `self profile update failed: ${updateErr?.message}`);
  assert.strictEqual(Number(updatedProfile.skill_level), 8, 'skill_level should round-trip');

  // bio/contact_info live in profile_contact (see
  // 20260726120000_profile_contact_visibility.sql) - upsert, since a fresh
  // profile has no row there yet.
  const { data: updatedContact, error: contactErr } = await alice.client
    .from('profile_contact')
    .upsert({ id: alice.userId, bio: 'Weekend warrior, mostly doubles.', contact_info: 'LINE: alice123' })
    .select('bio, contact_info')
    .single();
  assert(!contactErr, `self contact upsert failed: ${contactErr?.message}`);
  assert.strictEqual(updatedContact.bio, 'Weekend warrior, mostly doubles.', 'bio should round-trip');
  assert.strictEqual(updatedContact.contact_info, 'LINE: alice123', 'contact_info should round-trip');

  const { data: freshProfile, error: freshErr } = await admin
    .from('profile_contact')
    .select('bio, contact_info')
    .eq('id', alice.userId)
    .single();
  assert(!freshErr, `admin re-read failed: ${freshErr?.message}`);
  assert.strictEqual(freshProfile.bio, 'Weekend warrior, mostly doubles.', 'bio should persist');

  // Bob (no relationship to Alice at all) can't edit her skill_level...
  await bob.client.from('profiles').update({ skill_level: 1 }).eq('id', alice.userId);
  const { data: aliceProfileAfterBobAttempt } = await admin
    .from('profiles')
    .select('skill_level')
    .eq('id', alice.userId)
    .single();
  assert.strictEqual(Number(aliceProfileAfterBobAttempt.skill_level), 8, "RLS should block Bob from editing Alice's skill_level");

  // ...nor her bio/contact_info...
  await bob.client.from('profile_contact').upsert({ id: alice.userId, bio: 'Hacked bio', contact_info: 'Hacked contact' });
  const { data: aliceContactAfterBobAttempt } = await admin
    .from('profile_contact')
    .select('bio, contact_info')
    .eq('id', alice.userId)
    .single();
  assert.strictEqual(aliceContactAfterBobAttempt.bio, 'Weekend warrior, mostly doubles.', "RLS should block Bob from editing Alice's bio");
  assert.strictEqual(aliceContactAfterBobAttempt.contact_info, 'LINE: alice123', "RLS should block Bob from editing Alice's contact_info");

  // ...nor even READ it: no shared event, so Bob's select should come back
  // empty rather than exposing the row (see can_view_contact in the same
  // migration - this is the fix for the leak the migration closes).
  const { data: bobsView, error: bobsViewErr } = await bob.client.from('profile_contact').select('bio, contact_info').eq('id', alice.userId);
  assert(!bobsViewErr, `Bob's read attempt should not error, just return nothing: ${bobsViewErr?.message}`);
  assert.strictEqual((bobsView ?? []).length, 0, "RLS should hide Alice's contact row from unrelated Bob");

  const { error: clearErr } = await alice.client.from('profile_contact').upsert({ id: alice.userId, bio: null, contact_info: null });
  assert(!clearErr, `clearing bio/contact_info back to null failed: ${clearErr?.message}`);

  console.log(
    'PASS: profiles.skill_level and profile_contact.bio/contact_info round-trip on self-update, are RLS-protected from unrelated users, and unrelated users cannot even read the contact row'
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
