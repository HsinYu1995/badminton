import * as QueryParams from 'expo-auth-session/build/QueryParams.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// The `code` branch below handles a PKCE-flow redirect. It's unreachable today because
// the production client in ./supabase doesn't set `flowType: 'pkce'` (defaults to
// 'implicit'), so Google sign-in only ever produces access/refresh tokens, never a bare
// `code`. Left in as defensive handling for if the client's flow type ever changes; not
// covered by tests/auth-session.test.mjs for that reason.
//
// `client` is a parameter rather than importing the app's singleton because that
// singleton (src/lib/supabase.ts) pulls in react-native-url-polyfill/AsyncStorage/
// Platform, none of which resolve outside a React Native runtime - this function also
// needs to run under tests/auth-session.test.mjs's plain Node process, which constructs
// its own real SupabaseClient the same way every other tests/*.test.mjs file does.
export async function createSessionFromUrl(client: SupabaseClient, url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token, code } = params;

  if (access_token && refresh_token) {
    const { error } = await client.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return;
  }

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  throw new Error('No access/refresh tokens or auth code found in redirect URL.');
}
