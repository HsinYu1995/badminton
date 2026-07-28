import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local');

const admin = createClient(url, serviceKey);

async function main() {
  const client = createClient(url, anonKey);
  const { data, error } = await client.auth.signInAnonymously();
  assert(!error, `anonymous sign-in should succeed: ${error?.message}`);
  assert(data.session, 'anonymous sign-in should produce a session');
  assert.strictEqual(data.user.is_anonymous, true, 'the signed-in user should be flagged is_anonymous');

  const { data: profileRow, error: profileErr } = await admin
    .from('profiles')
    .select('display_name, is_anonymous')
    .eq('id', data.user.id)
    .single();
  assert(!profileErr, `profile row should exist for the new guest: ${profileErr?.message}`);
  assert(profileRow.display_name, 'guest profile should have a non-null, non-empty display_name');
  assert.strictEqual(profileRow.is_anonymous, true, 'guest profile should be flagged is_anonymous');

  console.log(`PASS: anonymous sign-up produces a valid profile (display_name: "${profileRow.display_name}")`);
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
