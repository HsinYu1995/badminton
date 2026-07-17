import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && serviceKey, 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.local, from `supabase status`)');

const admin = createClient(url, serviceKey);

async function main() {
  const { data: googleUser, error: googleErr } = await admin.auth.admin.createUser({
    email: `google-user-${Date.now()}@example.com`,
    password: 'password123',
    email_confirm: true,
    user_metadata: {
      full_name: 'Ada Lovelace',
      avatar_url: 'https://example.com/ada.jpg',
    },
  });
  assert(!googleErr, `createUser (google-shaped) failed: ${googleErr?.message}`);

  const { data: googleProfile, error: googleProfileErr } = await admin
    .from('profiles')
    .select('display_name, photo_url')
    .eq('id', googleUser.user.id)
    .single();
  assert(!googleProfileErr, `fetch google profile failed: ${googleProfileErr?.message}`);
  assert.strictEqual(
    googleProfile.display_name,
    'Ada Lovelace',
    'expected display_name to come from raw_user_meta_data.full_name'
  );
  assert.strictEqual(
    googleProfile.photo_url,
    'https://example.com/ada.jpg',
    'expected photo_url to come from raw_user_meta_data.avatar_url'
  );

  const emailOnlyAddress = `plain-user-${Date.now()}@example.com`;
  const emailLocalPart = emailOnlyAddress.split('@')[0];
  const { data: emailUser, error: emailErr } = await admin.auth.admin.createUser({
    email: emailOnlyAddress,
    password: 'password123',
    email_confirm: true,
  });
  assert(!emailErr, `createUser (email-only) failed: ${emailErr?.message}`);

  const { data: emailProfile, error: emailProfileErr } = await admin
    .from('profiles')
    .select('display_name, photo_url')
    .eq('id', emailUser.user.id)
    .single();
  assert(!emailProfileErr, `fetch email-only profile failed: ${emailProfileErr?.message}`);
  assert.strictEqual(
    emailProfile.display_name,
    emailLocalPart,
    'expected display_name to fall back to the email local part when no metadata is present'
  );
  assert.strictEqual(
    emailProfile.photo_url,
    null,
    'expected photo_url to stay null when no avatar_url is present'
  );

  console.log('PASS: handle_new_user populates display_name/photo_url from Google metadata, and still falls back to the email local part when absent');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
