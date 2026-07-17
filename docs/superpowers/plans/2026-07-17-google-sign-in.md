# Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder login screen and sibling `(auth)`/`(tabs)` route groups with a working Google sign-in flow: Supabase-backed OAuth, session-aware route protection, and sign-out.

**Architecture:** Google OAuth runs through Supabase Auth's generic `signInWithOAuth` + `expo-web-browser`'s system-browser session (not the native Google Sign-In SDK, and not an embedded WebView), so the whole flow keeps working in Expo Go. Session state is exposed via a small React Context (`AuthProvider`), and Expo Router's built-in `Stack.Protected` guards switch between the `(auth)` and `(tabs)` route groups based on that session.

**Tech Stack:** Expo Router (`Stack.Protected`), Supabase Auth (`signInWithOAuth`, `onAuthStateChange`), `expo-auth-session`, `expo-web-browser`, `expo-splash-screen` (via `expo-router`'s re-export).

## Global Constraints

- Scope: Google sign-in only. Apple Sign-In is explicitly out of scope for this plan (deferred until an Apple Developer Program membership exists).
- Use browser-based OAuth (`supabase.auth.signInWithOAuth` + `expo-web-browser`'s system-browser session), not the native `@react-native-google-signin/google-signin` SDK - the native SDK is not bundled in Expo Go and would require a custom dev-client build.
- Session storage stays on the existing AsyncStorage-backed persistence in `src/lib/supabase.ts` (from a prior plan) - do not introduce `expo-secure-store` in this plan.
- No em dashes in any generated docs, comments, or UI copy - use plain dashes.
- Testing philosophy: end-to-end tests against the real local Supabase stack (real Postgres, real Auth, real trigger), not mocks - except the actual Google consent-screen click-through, which is a manual verification step, not an automated test.
- The app's existing `"scheme": "badminton"` (in `app.json`) is reused for the OAuth redirect - no new URL scheme.
- Rate limiting is already covered by Supabase's default `[auth.rate_limit]` config (`sign_in_sign_ups`, `token_refresh`) - no new work needed for this plan.
- Full design rationale: `docs/superpowers/specs/2026-07-17-google-sign-in-design.md`.

---

## File Structure

```
badminton/
  supabase/
    config.toml                                    # Modify: add [auth.external.google]
    migrations/
      <timestamp>_google_profile_metadata.sql       # Create: handle_new_user Google metadata support
  tests/
    auth-profile-metadata.test.mjs                  # Create: verifies trigger populates from Google metadata
  src/
    lib/
      auth-context.tsx                              # Create: AuthProvider, useAuth, OAuth flow
    app/
      _layout.tsx                                   # Modify: Stack.Protected route guards
      (auth)/
        login.tsx                                    # Modify: real "Sign in with Google" button
      (tabs)/
        profile.tsx                                  # Modify: real "Sign out" button
  .env.local                                         # Modify: add Google OAuth secret (gitignored)
  .env.example                                       # Modify: add placeholder key (committed)
  package.json                                       # Modify: add expo-auth-session, test:auth-profile script
```

---

### Task 1: Google Cloud project + Supabase local auth config

**Files:**
- Modify: `supabase/config.toml`
- Modify: `.env.local`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a locally running Supabase Auth instance with the `google` external provider enabled, reachable by later tasks via the existing `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` (already in `.env.local` from a prior plan).

- [ ] **Step 1: Create the Google Cloud OAuth client**

This step is manual (Google's console isn't scriptable). In [Google Cloud Console](https://console.cloud.google.com/):

1. Create a new project (or select an existing one).
2. Go to **APIs & Services > OAuth consent screen**. Choose **External** user type. Fill in the required app name/support email fields. **Publishing status: Testing** is sufficient for local dev - you don't need to submit for verification.
3. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**. Application type: **Web application** (not Android/iOS - this project uses the browser-based OAuth flow, which only needs a Web client).
4. Under **Authorized redirect URIs**, add exactly:
   ```
   http://127.0.0.1:54321/auth/v1/callback
   ```
5. Save. Copy the **Client ID** and **Client secret** shown - you'll need both in the next step.

- [ ] **Step 2: Add the Google client ID and secret**

In `supabase/config.toml`, find the `[auth.external.apple]` block (used here only as a template for the shape - do not modify it) and add a new block directly after it:

```toml
[auth.external.google]
enabled = true
client_id = "PASTE_YOUR_GOOGLE_CLIENT_ID_HERE"
# DO NOT commit your OAuth provider secret to git. Use environment variable substitution instead:
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = ""
url = ""
# Required for local sign in with Google auth (see the same field's comment under [auth.external.apple]).
skip_nonce_check = true
```

Replace `PASTE_YOUR_GOOGLE_CLIENT_ID_HERE` with the real Client ID from Step 1. OAuth client IDs are meant to be public (unlike secrets), so committing it directly in `config.toml` is standard practice - this is the same pattern the file's own `[auth.external.apple]` template uses for its `client_id` field.

In `.env.local` (gitignored, do not commit), add:

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=PASTE_YOUR_GOOGLE_CLIENT_SECRET_HERE
```

Replace with the real Client secret from Step 1.

In `.env.example` (committed - placeholder only), add:

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=
```

- [ ] **Step 3: Restart the local Supabase stack**

Config changes like enabling an external provider require a full restart, not just `db reset` (which only re-applies migrations):

```bash
npx supabase stop
npx supabase start
```

- [ ] **Step 4: Verify the provider is enabled**

```bash
curl -s http://127.0.0.1:54321/auth/v1/settings
```

Expected: the output includes `"google":true` somewhere in the `external` object (e.g. `"external":{...,"google":true,...}`).

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml .env.example
git commit -m "chore: enable Google external auth provider in local Supabase config"
```

(`.env.local` is gitignored and intentionally not committed.)

---

### Task 2: Google-aware profile metadata trigger

**Files:**
- Create: `supabase/migrations/<timestamp>_google_profile_metadata.sql`
- Create: `tests/auth-profile-metadata.test.mjs`
- Modify: `package.json` (add `test:auth-profile` script)

**Interfaces:**
- Consumes: `public.handle_new_user()` trigger function and `public.profiles` table (from a prior plan's schema migration).
- Produces: `public.handle_new_user()` populates `profiles.display_name` from `raw_user_meta_data->>'full_name'` or `->>'name'` (Google's shape) when `display_name` isn't present, and populates `profiles.photo_url` from `raw_user_meta_data->>'avatar_url'` when present. Falls back to the email's local part for `display_name` when no metadata is present at all (existing behavior, unchanged).

- [ ] **Step 1: Write the failing test**

```js
// tests/auth-profile-metadata.test.mjs
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
```

Note: uses `process.exitCode` rather than `process.exit()`, same reason as this project's other test files (`process.exit()` crashes on this Windows + Node 24 machine due to an open `@supabase/supabase-js` handle).

Add to `package.json` scripts:

```json
"test:auth-profile": "node --env-file=.env.local tests/auth-profile-metadata.test.mjs"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:auth-profile
```

Expected: FAIL - the current `handle_new_user()` only reads `raw_user_meta_data->>'display_name'` (which Google's metadata shape doesn't set), so `googleProfile.display_name` will actually be the email local part (e.g. `google-user-1737...`), not `'Ada Lovelace'`. The assertion on that line throws.

- [ ] **Step 3: Write the migration**

```bash
npx supabase migration new google_profile_metadata
```

This creates `supabase/migrations/<timestamp>_google_profile_metadata.sql`. Fill it with:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, photo_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;
```

This replaces the function body only - the existing `on_auth_user_created` trigger (from a prior plan) already points to `public.handle_new_user()` by name, so it does not need to change.

- [ ] **Step 4: Apply the migration**

```bash
npx supabase db reset
```

Expected: all migrations (including this new one) apply cleanly in order.

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:auth-profile
```

Expected: `PASS: handle_new_user populates display_name/photo_url from Google metadata, and still falls back to the email local part when absent`

- [ ] **Step 6: Run the existing test suites as a regression check**

```bash
npm run test:schema
npm run test:rls
```

Expected: both still `PASS` (this migration only changes `handle_new_user()`, not the schema or RLS policies, but `db reset` re-applies every migration, so this confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations tests/auth-profile-metadata.test.mjs package.json
git commit -m "feat: populate profile display_name/photo_url from Google OAuth metadata"
```

---

### Task 3: AuthProvider and route protection

**Files:**
- Create: `src/lib/auth-context.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `package.json` (add `expo-auth-session` dependency)

**Interfaces:**
- Consumes: `supabase` client from `src/lib/supabase.ts` (from a prior plan).
- Produces: `AuthProvider` (React component, wraps the app) and `useAuth()` hook from `src/lib/auth-context.tsx`, returning `{ session: Session | null, isLoading: boolean, signInWithGoogle: () => Promise<void>, signOut: () => Promise<void> }`. Task 4 consumes `signInWithGoogle` and `signOut` from this hook.

- [ ] **Step 1: Install the new dependency**

```bash
npx expo install expo-auth-session
```

(`expo-web-browser` and `expo-linking` are already installed from a prior plan.)

- [ ] **Step 2: Write the auth context**

```tsx
// src/lib/auth-context.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return;

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    const redirectTo = makeRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;

    const result = await WebBrowser.openAuthSessionAsync(data?.url ?? '', redirectTo);
    if (result.type === 'success') {
      await createSessionFromUrl(result.url);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return (
    <AuthContext.Provider value={{ session, isLoading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
```

- [ ] **Step 3: Wire route protection into the root layout**

```tsx
// src/app/_layout.tsx
import { SplashScreen, Stack } from 'expo-router';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

function SplashScreenController() {
  const { isLoading } = useAuth();
  if (!isLoading) {
    SplashScreen.hide();
  }
  return null;
}

function RootNavigator() {
  const { session } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SplashScreenController />
      <RootNavigator />
    </AuthProvider>
  );
}
```

This replaces the current plain `Stack.Screen` siblings (from a prior plan) with `Stack.Protected` guards: signed-in users land on `(tabs)`, signed-out users land on `(auth)`, automatically - no manual redirect code, and no more cold-start ambiguity between the two route groups.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify the app still boots**

```bash
npx supabase status
npx expo start --android
```

(Start the Android emulator first if it isn't running.) Expected: the app boots to the "Sign in" placeholder screen (unchanged text - Task 4 wires the real button), with no crash and no red error screen. Since there's no session yet, `Stack.Protected guard={!session}` correctly shows `(auth)`. Stop the server once confirmed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth-context.tsx src/app/_layout.tsx package.json package-lock.json
git commit -m "feat: add AuthProvider and Stack.Protected route guards"
```

---

### Task 4: Sign-in and sign-out UI

**Files:**
- Modify: `src/app/(auth)/login.tsx`
- Modify: `src/app/(tabs)/profile.tsx`

**Interfaces:**
- Consumes: `useAuth()` from `src/lib/auth-context.tsx` (Task 3) - specifically `signInWithGoogle()` and `signOut()`.
- Produces: a working, human-clickable sign-in and sign-out flow. Nothing later in this plan consumes this task's output - it's the last task.

- [ ] **Step 1: Build the real login screen**

```tsx
// src/app/(auth)/login.tsx
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '@/lib/auth-context';

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handlePress() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      <Pressable style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonText}>Sign in with Google</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '600' },
  button: { backgroundColor: '#4285F4', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: 'red' },
});
```

- [ ] **Step 2: Add sign-out to the profile screen**

```tsx
// src/app/(tabs)/profile.tsx
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '@/lib/auth-context';

export default function ProfileScreen() {
  const { signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text>Profile + skill tier editing goes here (next plan).</Text>
      <Pressable style={styles.button} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '600' },
  button: { backgroundColor: '#ef4444', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify end-to-end manually**

This step needs a human with the app running on a device/emulator and a real Google account - it can't be scripted (see Global Constraints).

```bash
npx supabase status
npx expo start --android
```

In the running app:
1. Confirm you land on the "Sign in" screen with a "Sign in with Google" button.
2. Tap it. Confirm the system browser opens showing Google's real consent screen.
3. Complete sign-in with a real Google account. Confirm you're redirected back into the app and land on the Discover tab (not the sign-in screen).
4. Confirm the Discover tab shows a real event count (not a connection/RLS error) - since the request is now authenticated, `events_select_authenticated` should allow it.
5. Go to the Profile tab, tap "Sign out". Confirm you're returned to the "Sign in" screen.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/login.tsx" "src/app/(tabs)/profile.tsx"
git commit -m "feat: wire Google sign-in and sign-out UI"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the design's "Google Cloud + Supabase setup" section. Task 2 covers "Profile metadata from Google" with full TDD evidence (both the Google-metadata path and the existing email-fallback path are asserted, so the fallback can't silently regress). Task 3 covers "App-side OAuth flow" and "Route protection & session state" (the `AuthProvider`/`Stack.Protected` architecture). Task 4 covers the UI + the design's "manual verification" testing split. Session storage (kept as-is) and rate limiting (already covered by defaults) required no tasks, per the design - both are called out explicitly in Global Constraints so they aren't silently dropped. Apple Sign-In, `expo-secure-store`, CAPTCHA, and the native Google SDK are explicitly deferred per the design's "Deferred Items" section - no tasks for them here.
- **Placeholder scan:** all SQL, TypeScript, and test code above is complete and runnable as written; no TBD/TODO markers.
- **Type consistency:** `useAuth()`'s return shape (`session: Session | null`, `isLoading: boolean`, `signInWithGoogle: () => Promise<void>`, `signOut: () => Promise<void>`) is defined once in Task 3 and consumed with the exact same names/signatures in Task 4 (`signInWithGoogle`, `signOut`) and in `_layout.tsx` (`session`, `isLoading`). `profiles.display_name`/`photo_url` column names in Task 2's migration match the existing schema from a prior plan.
