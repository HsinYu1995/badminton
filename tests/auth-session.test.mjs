import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';
import { createSessionFromUrl } from '../src/lib/auth-session.ts';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local');

const admin = createClient(url, serviceKey);

async function main() {
  // errorCode branch - never touches Supabase, per QueryParams.getQueryParams reading
  // `errorCode` straight off the query string before any token/code check runs.
  await assert.rejects(
    () => createSessionFromUrl(createClient(url, anonKey), 'myapp://redirect?errorCode=access_denied'),
    /access_denied/,
    'an errorCode param should surface as a thrown error'
  );

  // Neither tokens nor a code present - also never touches Supabase.
  await assert.rejects(
    () => createSessionFromUrl(createClient(url, anonKey), 'myapp://redirect'),
    /No access\/refresh tokens or auth code found/,
    'a redirect URL with neither tokens nor a code should throw the fallback error'
  );

  // Real access_token/refresh_token branch, against a real minted GoTrue session -
  // no mocking: a real user is created, a real session is signed in to, and the real
  // redirect URL Google sign-in would produce is built from its real tokens.
  const email = `auth-session-${Date.now()}@example.com`;
  const password = 'password123';
  const { error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!createErr, `createUser failed: ${createErr?.message}`);

  const signInClient = createClient(url, anonKey);
  const { data: signInData, error: signInErr } = await signInClient.auth.signInWithPassword({ email, password });
  assert(!signInErr, `signIn failed: ${signInErr?.message}`);
  const { access_token, refresh_token, user } = signInData.session;

  const freshClient = createClient(url, anonKey);
  const { data: beforeData } = await freshClient.auth.getSession();
  assert.strictEqual(beforeData.session, null, 'fresh client should start with no session');

  const redirectUrl = `myapp://redirect#access_token=${access_token}&refresh_token=${refresh_token}`;
  await createSessionFromUrl(freshClient, redirectUrl);

  const { data: afterData } = await freshClient.auth.getSession();
  assert(afterData.session, 'createSessionFromUrl should have established a session on the fresh client');
  assert.strictEqual(afterData.session.user.id, user.id, 'the established session should belong to the user that signed in');

  // The `code`/PKCE branch is not tested here: it's unreachable under this app's client
  // config (flowType defaults to 'implicit', see src/lib/auth-session.ts), so there is no
  // real redirect URL this app would ever produce that exercises it.

  console.log('PASS: createSessionFromUrl handles the errorCode, no-tokens/no-code, and real access_token/refresh_token branches');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });
