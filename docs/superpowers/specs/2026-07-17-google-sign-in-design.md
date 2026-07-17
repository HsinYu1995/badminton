# Google Sign-In Design

## Overview

Replace the placeholder `(auth)/login.tsx` screen and the sibling `(auth)`/`(tabs)`
route groups with a working authentication flow: Google sign-in via Supabase
Auth, session-aware route protection, and sign-out. This is the "next plan"
referenced by Task 2 and Task 6 of the scaffold plan.

**Scope: Google only.** Apple Sign-In (also required by `PLAN.md`, since App
Store policy requires it once a third-party login option is offered) is
explicitly deferred to a follow-on plan - the developer does not yet have an
Apple Developer Program membership, and Apple's flow can't be tested
end-to-end without one. Building it now would produce untestable code.

## Google Cloud + Supabase setup (manual, non-code)

1. Create a Google Cloud project (or reuse one).
2. Configure the OAuth consent screen: External user type, Testing publishing
   status is sufficient for local dev.
3. Create an OAuth client of type **Web application** (not Android/iOS -
   see "Why browser-based OAuth" below). Authorized redirect URI:
   `http://127.0.0.1:54321/auth/v1/callback` (the local Supabase Auth
   external-provider callback).
4. Add the resulting Client ID and Secret to `.env.local` (gitignored, same
   pattern as the existing Supabase keys from Task 3), referenced from
   `supabase/config.toml` via `env()` substitution.
5. Add a `[auth.external.google]` block to `supabase/config.toml`, mirroring
   the existing `[auth.external.apple]` template's shape (`enabled`,
   `client_id`, `secret = "env(...)"`, `skip_nonce_check = true` - the
   config's own comment notes this is required for local Google sign-in
   testing).

## Why browser-based OAuth, not the native Google Sign-In SDK

Supabase's own Google-specific quickstart recommends
`@react-native-google-signin/google-signin` (native Credential Manager UI).
That package is a native module not bundled in Expo Go - using it would
require switching to a custom development build (`expo-dev-client` + EAS
Build) before any of this could be tested at all, on a project that
currently has no such build pipeline set up.

Decision: use Supabase's generic OAuth pattern instead -
`supabase.auth.signInWithOAuth()` + `expo-web-browser`'s
`openAuthSessionAsync` (system browser / Chrome Custom Tabs on Android,
`ASWebAuthenticationSession` on iOS - not an embedded WebView, so it's
compliant with Google's anti-embedded-webview OAuth policy). This keeps the
whole flow testable in Expo Go with the existing dev workflow, at the cost
of a less polished sign-in UX (a visible browser consent screen, no silent
re-auth for returning users) - an acceptable trade for this stage. Revisit
native SDK once a dev-client/EAS pipeline exists for other reasons (e.g.
building Apple Sign-In later, or nearing a real release).

## App-side OAuth flow

New dependency: `expo-auth-session` (`expo-web-browser` and `expo-linking`
are already installed from the Task 1 scaffold). Pattern, confirmed against
Supabase's official Expo deep-linking guide:

```tsx
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();
const redirectTo = makeRedirectUri();

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);
  const { access_token, refresh_token } = params;
  if (!access_token) return;
  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return data.session;
}

async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const res = await WebBrowser.openAuthSessionAsync(data?.url ?? '', redirectTo);
  if (res.type === 'success') await createSessionFromUrl(res.url);
}
```

Redirect URI reuses the existing `"scheme": "badminton"` from `app.json`
(Task 1) - no new scheme needed.

## Route protection & session state

- New `AuthProvider` (`src/lib/auth-context.tsx`): wraps
  `supabase.auth.onAuthStateChange` plus an initial
  `supabase.auth.getSession()` call, exposing `{ session, isLoading,
  signInWithGoogle, signOut }` via React Context.
- Root layout (`src/app/_layout.tsx`) replaces the current plain
  `Stack.Screen` siblings with Expo Router SDK 57's built-in `Stack.Protected`
  guards:

  ```tsx
  <Stack.Protected guard={!!session}>
    <Stack.Screen name="(tabs)" />
  </Stack.Protected>
  <Stack.Protected guard={!session}>
    <Stack.Screen name="(auth)" />
  </Stack.Protected>
  ```

  This resolves the routing ambiguity flagged in Task 2's review (cold-start
  landing screen was previously undetermined): signed-in users land on
  `(tabs)`, signed-out users land on `(auth)`, automatically.
- While `isLoading` is true (initial session check on cold start), keep the
  splash screen visible (`expo-splash-screen`, already in the Task 1
  scaffold) rather than flashing the login screen first.
- `(auth)/login.tsx` replaces its placeholder text with a real "Sign in with
  Google" button wired to `signInWithGoogle()`.
- Sign-out: a real button on `(tabs)/profile.tsx` (already the natural home
  for account actions, currently a placeholder) calling `signOut()`.

## Session storage

Keep the existing AsyncStorage-backed persistence from Task 6
(`src/lib/supabase.ts`) rather than switching to `expo-secure-store`.
AsyncStorage is unencrypted at rest; SecureStore would improve on that, but
it's a hardening item for a pre-launch security pass, not this plan.
**Deferred, not forgotten** - see Deferred Items below.

## Profile metadata from Google

Task 4's `handle_new_user()` trigger currently only reads
`raw_user_meta_data->>'display_name'`, falling back to the email's local
part. Google's OAuth metadata populates `full_name`/`name`/`avatar_url`
instead, not `display_name` - so unmodified, a Google sign-in would get an
email-derived display name instead of the user's real Google name. Fix as
part of this plan: update the trigger to also check `full_name`/`name`, and
populate `profiles.photo_url` from `avatar_url` when present.

## Rate limiting / abuse protection

Already covered by Supabase Auth's built-in, enabled-by-default per-IP
limits (`supabase/config.toml`'s `[auth.rate_limit]` block) - no design
changes needed:
- `sign_in_sign_ups = 30` per 5 minutes per IP - bounds sign-in/token-exchange
  request abuse (the relevant one for this flow).
- `token_refresh = 150` per 5 minutes per IP - bounds session-refresh spam.

OAuth has no classic brute-force surface (credential verification happens
entirely on Google's side; our server never sees or checks a password), so
these existing limits are sufficient for this stage. CAPTCHA
(`[auth.captcha]`, currently disabled) is a further bot-abuse layer worth
considering once this is live publicly - **deferred, not forgotten**, see
below.

## Testing approach

OAuth has a hard automation boundary: actually completing Google's consent
screen requires a live Google account and a real browser, which isn't
practical to script for this stage. Split:

- **Automated, end-to-end against the real local Supabase stack** (same
  style as `tests/schema.test.mjs`/`tests/rls.test.mjs`): a new test that
  creates a user via `admin.auth.admin.createUser` with Google-shaped
  `raw_user_meta_data` (`full_name`, `avatar_url`, no `display_name`) and
  asserts the updated `handle_new_user` trigger populates
  `profiles.display_name`/`photo_url` correctly. This is the part of the
  flow that's actually ours to get right, and it's fully testable without a
  browser.
- **Manual verification** (same pattern as Task 6's Expo Go check): tapping
  "Sign in with Google" in the running app, completing the real Google
  consent screen, confirming landing on the Discover tab, and confirming
  sign-out returns to the login screen. Stays a human step, not an
  automated test.

## Deferred Items (not in this plan)

- Apple Sign-In - follow-on plan once an Apple Developer Program membership
  exists.
- `expo-secure-store`-backed encrypted session storage - pre-launch
  hardening pass.
- CAPTCHA on auth endpoints (`[auth.captcha]`) - once live publicly.
- Native Google Sign-In SDK (nicer UX, silent re-auth) - once a
  dev-client/EAS Build pipeline exists for other reasons.
