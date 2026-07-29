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

  const { data: updated, error: updateErr } = await alice.client
    .from('profiles')
    .update({
      bio: 'Weekend warrior, mostly doubles.',
      contact_info: 'LINE: alice123',
      skill_level: 8,
    })
    .eq('id', alice.userId)
    .select('bio, contact_info, skill_level')
    .single();
  assert(!updateErr, `self profile update failed: ${updateErr?.message}`);
  assert.strictEqual(updated.bio, 'Weekend warrior, mostly doubles.', 'bio should round-trip');
  assert.strictEqual(updated.contact_info, 'LINE: alice123', 'contact_info should round-trip');
  assert.strictEqual(Number(updated.skill_level), 8, 'skill_level should round-trip');

  const { data: freshProfile, error: freshErr } = await admin
    .from('profiles')
    .select('bio, contact_info, skill_level')
    .eq('id', alice.userId)
    .single();
  assert(!freshErr, `admin re-read failed: ${freshErr?.message}`);
  assert.strictEqual(freshProfile.bio, 'Weekend warrior, mostly doubles.', 'bio should persist');

  await bob.client
    .from('profiles')
    .update({ bio: 'Hacked bio', contact_info: 'Hacked contact', skill_level: 1 })
    .eq('id', alice.userId);
  const { data: aliceAfterBobAttempt } = await admin
    .from('profiles')
    .select('bio, contact_info, skill_level')
    .eq('id', alice.userId)
    .single();
  assert.strictEqual(aliceAfterBobAttempt.bio, 'Weekend warrior, mostly doubles.', 'RLS should block Bob from editing Alice\'s bio');
  assert.strictEqual(aliceAfterBobAttempt.contact_info, 'LINE: alice123', 'RLS should block Bob from editing Alice\'s contact_info');
  assert.strictEqual(Number(aliceAfterBobAttempt.skill_level), 8, 'RLS should block Bob from editing Alice\'s skill_level');

  const { error: clearErr } = await alice.client
    .from('profiles')
    .update({ bio: null, contact_info: null })
    .eq('id', alice.userId);
  assert(!clearErr, `clearing bio/contact_info back to null failed: ${clearErr?.message}`);

  console.log('PASS: profiles.bio/contact_info/skill_level round-trip on self-update and are RLS-protected from other users');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
