# Guest Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player join a game without a Google account, via Supabase anonymous auth, limited to join/leave plus one mandatory one-time skill-range pick — no organizing, no rating, no full profile editing, no Profile or Create tab.

**Architecture:** Supabase's built-in `signInAnonymously()` produces a session identical in shape to a Google sign-in session, distinguished only by `session.user.is_anonymous`. A new `profiles.is_anonymous` column (mirrored from `auth.users.is_anonymous` by the existing `handle_new_user` trigger) is how the rest of the app tells a guest apart from a real account without touching `auth.users` directly. `AuthContext` gains a `needsGuestSkillPick` field driving a new mandatory onboarding screen; three RLS policies gain an anonymity check via the `is_anonymous` JWT claim; the Profile and Create tabs are both hidden for guest sessions via `Tabs.Protected` (Create is hidden too since RLS blocks a guest's event insert outright - no point showing a form that can only fail).

**Tech Stack:** React Native / Expo SDK 57, expo-router, TypeScript, Jest (`jest-expo` preset), Supabase (Postgres + GoTrue auth, local dev via Supabase CLI).

## Global Constraints

- Guests can join/leave events and use event chat. They cannot organize events, add venues, submit ratings (as rater), or edit any profile field except one mandatory one-time skill-range pick.
- `profiles.is_anonymous` is mirrored from `auth.users.is_anonymous` at insert time only — no update path, no guest-to-real-account upgrade in this plan.
- The one-time skill pick is a UX restriction, not a security one: `profiles_update_own`'s RLS policy (`auth.uid() = id`) is left completely unchanged.
- Chat (`chat_messages`) RLS is left completely unchanged — guests can read/send chat once accepted, same as any participant.
- Every existing test must keep passing unchanged — this plan's new zh-TW/guest coverage is added as new, separate test files/cases, never by editing existing assertions.
- Full plan is done when `npx jest` passes with zero failures, `npx tsc --noEmit` reports zero errors, and every new integration test (`tests/integration/*.test.mjs`) passes against the local Supabase instance.

---

### Task 1: Migration — `is_anonymous` column, fixed `handle_new_user` trigger, enable anonymous sign-ins

**Files:**
- Create: `supabase/migrations/20260728040000_guest_anonymous_auth.sql`
- Modify: `supabase/config.toml:191`
- Test: `tests/integration/guest-signup.test.mjs` (new)
- Modify: `package.json` (new `test:guest-signup` script)

**Interfaces:**
- Produces: `public.profiles.is_anonymous boolean not null default false`; `handle_new_user()` now handles a `NULL` email without crashing.

- [ ] **Step 1: Write the failing integration test**

Confirmed live on this project's local Supabase Postgres (via `docker exec supabase_db_badminton psql`) that `auth.users.is_anonymous boolean not null default false` already exists — this is Supabase's own built-in column, not something this migration adds. This test proves the *current* `handle_new_user()` (before this task's fix) crashes on an anonymous sign-up, then (after Step 4) proves it's fixed.

```js
// tests/integration/guest-signup.test.mjs
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
```

Add to `package.json`'s `scripts` (alongside the existing `test:*` integration scripts, e.g. after `"test:discover-pagination"`):
```json
"test:guest-signup": "node --env-file=.env.local tests/integration/guest-signup.test.mjs",
```

- [ ] **Step 2: Enable anonymous sign-ins**

In `supabase/config.toml`, change line 191:
```toml
# before:
enable_anonymous_sign_ins = false
# after:
enable_anonymous_sign_ins = true
```
(Already rate-limited: `anonymous_users = 30` per hour per IP, line 216 — no change needed there.)

- [ ] **Step 3: Restart Supabase to pick up the config change, then run the test to confirm it fails**

Run: `npx supabase stop` then `npx supabase start`
Run: `npm run test:guest-signup`
Expected: FAIL — `profiles.display_name` violates its `NOT NULL` constraint (the trigger's `split_part(new.email, '@', 1)` call on a `NULL` email returns `NULL`), surfaced as a Postgres error during `signInAnonymously()`.

- [ ] **Step 4: Write the migration**

```sql
-- supabase/migrations/20260728040000_guest_anonymous_auth.sql
alter table public.profiles add column is_anonymous boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, photo_url, is_anonymous)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      case when new.email is not null then split_part(new.email, '@', 1) end,
      'Guest ' || substr(new.id::text, 1, 4)
    ),
    new.raw_user_meta_data->>'avatar_url',
    new.is_anonymous
  );
  return new;
end;
$$;
```

- [ ] **Step 5: Apply the migration and run the test to confirm it passes**

Run: `npx supabase migration up`
Run: `npm run test:guest-signup`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260728040000_guest_anonymous_auth.sql supabase/config.toml tests/integration/guest-signup.test.mjs package.json
git commit -m "feat(auth): enable anonymous sign-in, fix display_name trigger for guests"
```

---

### Task 2: `auth-context.tsx` — `signInAsGuest`, `needsGuestSkillPick`

**Files:**
- Modify: `src/lib/auth-context.tsx`
- Test: `tests/unit/auth-context-guest-test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AuthContextValue` gains `signInAsGuest: () => Promise<void>`, `needsGuestSkillPick: boolean | null` (`null` = still resolving — only ever true transiently for an anonymous session, always `false` immediately for a non-anonymous one), `markGuestSkillPicked: () => void`.
- Consumed by: Task 4 (`login.tsx`), Task 5 (`_layout.tsx`'s gate and the new `guest-skill.tsx` screen), Task 6 (`(tabs)/_layout.tsx`'s guard reads `session.user.is_anonymous` directly, no new field needed there).

Every other test in this codebase mocks `@/lib/auth-context` entirely (confirmed: every `tests/unit/*.tsx` file has a `jest.mock('@/lib/auth-context', ...)` line), which replaces `AuthProvider` with a fake and never executes its real logic. That means the new `useEffect` this task adds (the actual fetch-and-decide logic behind `needsGuestSkillPick`) needs its own dedicated test that renders the *real* `AuthProvider` — mocking only `@/lib/supabase` underneath it — instead of relying on some later task's test (which will only ever exercise a mocked stand-in).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/auth-context-guest-test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/auth-context';

let mockSession: { user: { id: string; is_anonymous?: boolean } } | null = null;
let mockSkillLevel: number | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockSession } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { skill_level: mockSkillLevel } }),
        }),
      }),
    }),
  },
}));

function GateProbe() {
  const { needsGuestSkillPick, markGuestSkillPicked } = useAuth();
  return (
    <>
      <Text testID="gate-probe">{String(needsGuestSkillPick)}</Text>
      <Pressable testID="mark-picked" onPress={markGuestSkillPicked}>
        <Text>mark</Text>
      </Pressable>
    </>
  );
}

describe('AuthProvider guest skill-pick gate', () => {
  it('resolves to false immediately for a non-anonymous session', async () => {
    mockSession = { user: { id: 'real-user-id' } };
    const { getByTestId } = render(
      <AuthProvider>
        <GateProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('false'));
  });

  it('resolves to true for an anonymous session with no skill_level yet', async () => {
    mockSession = { user: { id: 'guest-id', is_anonymous: true } };
    mockSkillLevel = null;
    const { getByTestId } = render(
      <AuthProvider>
        <GateProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('true'));
  });

  it('resolves to false for an anonymous session that already has a skill_level', async () => {
    mockSession = { user: { id: 'guest-id-2', is_anonymous: true } };
    mockSkillLevel = 5;
    const { getByTestId } = render(
      <AuthProvider>
        <GateProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('false'));
  });

  it('markGuestSkillPicked flips the gate to false without re-fetching', async () => {
    mockSession = { user: { id: 'guest-id-3', is_anonymous: true } };
    mockSkillLevel = null;
    const { getByTestId } = render(
      <AuthProvider>
        <GateProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('true'));
    fireEvent.press(getByTestId('mark-picked'));
    await waitFor(() => expect(getByTestId('gate-probe').props.children).toBe('false'));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/auth-context-guest-test.tsx`
Expected: FAIL — `useAuth()` doesn't yet return `needsGuestSkillPick`/`markGuestSkillPicked` (both `undefined` today), and the module doesn't yet import/use the new `profiles` query at all.

- [ ] **Step 3: Update `src/lib/auth-context.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { createSessionFromUrl } from '@/lib/auth-session';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  needsGuestSkillPick: boolean | null;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  markGuestSkillPicked: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsGuestSkillPick, setNeedsGuestSkillPick] = useState<boolean | null>(null);

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

  // A guest's `profiles.skill_level` is null until they complete the
  // mandatory one-time picker (Task 5) - `needsGuestSkillPick` stays `null`
  // (meaning "still resolving") only while that check is in flight for an
  // anonymous session, so AppBody (Task 5) can withhold rendering the app
  // until this is known, exactly like it already withholds on fontsLoaded/
  // isLoading - never flashing `(tabs)` before flipping to the picker.
  useEffect(() => {
    if (!session?.user.is_anonymous) {
      setNeedsGuestSkillPick(false);
      return;
    }
    let cancelled = false;
    setNeedsGuestSkillPick(null);
    supabase
      .from('profiles')
      .select('skill_level')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setNeedsGuestSkillPick((data as { skill_level: number | null } | null)?.skill_level == null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, session?.user.is_anonymous]);

  async function signInWithGoogle() {
    const redirectTo = makeRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;

    const result = await WebBrowser.openAuthSessionAsync(data?.url ?? '', redirectTo);
    if (result.type === 'success') {
      await createSessionFromUrl(supabase, result.url);
    }
  }

  async function signInAsGuest() {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  // Called by the skill-pick screen (Task 5) right after it successfully
  // writes skill_level - flips the gate immediately rather than re-fetching,
  // since the caller already knows what it just wrote (same "trust the
  // write we just made" shape as handleRate's optimistic update elsewhere
  // in this app).
  function markGuestSkillPicked() {
    setNeedsGuestSkillPick(false);
  }

  return (
    <AuthContext.Provider
      value={{ session, isLoading, needsGuestSkillPick, signInWithGoogle, signInAsGuest, signOut, markGuestSkillPicked }}
    >
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

- [ ] **Step 4: Run the new test to confirm it passes**

Run: `npx jest tests/unit/auth-context-guest-test.tsx`
Expected: PASS, all four cases.

- [ ] **Step 5: Run the TypeScript compiler to confirm this compiles**

Run: `npx tsc --noEmit`
Expected: zero errors — every existing consumer of `useAuth()` only reads `session`/`isLoading`/`signInWithGoogle`/`signOut`, all still present unchanged; nothing yet reads the three new fields.

- [ ] **Step 6: Run the full suite**

Run: `npx jest`
Expected: PASS, zero failures — every other test mocks `@/lib/auth-context` entirely, so this task's new logic is invisible to them.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth-context.tsx tests/unit/auth-context-guest-test.tsx
git commit -m "feat(auth): add signInAsGuest and needsGuestSkillPick gate state"
```

---

### Task 3: i18n dictionary keys

**Files:**
- Modify: `src/lib/i18n.tsx`

**Interfaces:**
- Produces: `'auth.continueAsGuest'`, `'profile.guestBadge'`, `'guestSkillPick.headerTitle'`, `'guestSkillPick.title'`, `'guestSkillPick.subtitle'`, `'guestSkillPick.continue'`, `'guestSkillPick.saving'`, `'guestSkillPick.couldNotSave'` — six new keys in both `en` and `zhTW`, added in this task so every later task can call `t()` with them immediately.
- Consumed by: Task 4 (`login.tsx`), Task 5 (`guest-skill.tsx`), Task 9 (`profile.tsx`'s Guest badge).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/i18n-test.ts already has a dictionary-parity test (`Object.keys(en)` vs
// `Object.keys(zhTW)`) that fails automatically the moment a key is added to one
// dictionary but not the other - no new test file needed. Instead, this step adds
// one assertion per new key's presence, appended inside the existing
// 'i18n dictionary parity' describe block:
it('has the new guest sign-in keys in both locales', () => {
  const keys = [
    'auth.continueAsGuest',
    'profile.guestBadge',
    'guestSkillPick.headerTitle',
    'guestSkillPick.title',
    'guestSkillPick.subtitle',
    'guestSkillPick.continue',
    'guestSkillPick.saving',
    'guestSkillPick.couldNotSave',
  ];
  for (const key of keys) {
    expect(en).toHaveProperty(key);
    expect(zhTW).toHaveProperty(key);
  }
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/i18n-test.ts`
Expected: FAIL — none of the six keys exist yet.

- [ ] **Step 3: Add the keys to `en`**

In `src/lib/i18n.tsx`, add to the `en` object (right after `'auth.signInFailed': 'Sign-in failed',` on line 23):
```ts
  'auth.continueAsGuest': 'Continue as guest',
```
Add to the `en` object (right after `'profile.statusPending': 'Pending',` on line 138):
```ts
  'profile.guestBadge': 'Guest',
```
Add a new section at the end of `en`, right before the closing `};` on line 162 (after `'splash.subtitle': 'Finding your next game...',`):
```ts
  'guestSkillPick.headerTitle': 'Pick your skill level',
  'guestSkillPick.title': "What's your skill level?",
  'guestSkillPick.subtitle': "This helps the organizer know if you're a good fit before accepting your request.",
  'guestSkillPick.continue': 'Continue',
  'guestSkillPick.saving': 'Saving...',
  'guestSkillPick.couldNotSave': 'Could not save your skill level.',
```

- [ ] **Step 4: Add the matching keys to `zhTW`, in the same relative positions**

After `'auth.signInFailed': '登入失敗',` (line 169):
```ts
  'auth.continueAsGuest': '以訪客身分繼續',
```
After `'profile.statusPending': '待審核',` (line 284):
```ts
  'profile.guestBadge': '訪客',
```
At the end of `zhTW`, right before the closing `};` (after `'splash.subtitle': '正在尋找您的下一場球局...',`):
```ts
  'guestSkillPick.headerTitle': '選擇您的程度',
  'guestSkillPick.title': '您的程度是？',
  'guestSkillPick.subtitle': '這能幫助主辦人判斷是否適合接受您的申請。',
  'guestSkillPick.continue': '繼續',
  'guestSkillPick.saving': '儲存中...',
  'guestSkillPick.couldNotSave': '無法儲存您的程度。',
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx jest tests/unit/i18n-test.ts`
Expected: PASS — both the new test and the existing key-parity test (`zhTW: Translations` also enforces this at compile time, so a mismatch would already be a TypeScript error before Jest even runs).

- [ ] **Step 6: Run the full suite**

Run: `npx jest`
Expected: PASS, zero failures.

- [ ] **Step 7: Commit**

```bash
git add src/lib/i18n.tsx tests/unit/i18n-test.ts
git commit -m "feat(i18n): add guest sign-in translation keys"
```

---

### Task 4: `login.tsx` — "Continue as guest" button

**Files:**
- Modify: `src/app/(auth)/login.tsx`
- Test: `tests/unit/login-guest-test.tsx` (new)

**Interfaces:**
- Consumes: `signInAsGuest` (Task 2), `t('auth.continueAsGuest')` (Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/login-guest-test.tsx
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const signInAsGuest = jest.fn(() => Promise.resolve());

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: null, isLoading: false, signInWithGoogle: jest.fn(), signInAsGuest }),
}));

describe('Login screen guest button', () => {
  it('renders a Continue as guest button and calls signInAsGuest on press', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/' });
    const button = screen.getByText('Continue as guest');
    fireEvent.press(button);
    await waitFor(() => expect(signInAsGuest).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/login-guest-test.tsx`
Expected: FAIL — `getByText('Continue as guest')` finds nothing.

- [ ] **Step 3: Update `src/app/(auth)/login.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';

export default function LoginScreen() {
  const { signInWithGoogle, signInAsGuest } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  async function handleGooglePress() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
    }
  }

  async function handleGuestPress() {
    setError(null);
    try {
      await signInAsGuest();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.signIn')}</Text>
      <Pressable style={styles.button} onPress={handleGooglePress}>
        <Text style={styles.buttonText}>{t('auth.signInWithGoogle')}</Text>
      </Pressable>
      <Pressable style={styles.guestButton} onPress={handleGuestPress}>
        <Text style={styles.guestButtonText}>{t('auth.continueAsGuest')}</Text>
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
  guestButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  guestButtonText: { color: '#4285F4', fontWeight: '600' },
  error: { color: 'red' },
});
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest tests/unit/login-guest-test.tsx`
Expected: PASS

- [ ] **Step 5: Confirm the existing zh-TW login test still passes unchanged**

Run: `npx jest tests/unit/login-zh-test.tsx`
Expected: PASS — that test only asserts on `'登入'`/`'使用 Google 登入'`, both still present unchanged; it doesn't assert anything about the guest button, so it needs no edit.

- [ ] **Step 6: Run the full suite**

Run: `npx jest`
Expected: PASS, zero failures.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(auth\)/login.tsx tests/unit/login-guest-test.tsx
git commit -m "feat(auth): add Continue as guest button to login screen"
```

---

### Task 5: Guest skill-pick screen + onboarding gate in `_layout.tsx`

**Files:**
- Create: `src/app/guest-skill.tsx`
- Modify: `src/app/_layout.tsx`
- Test: `tests/unit/guest-skill-pick-test.tsx` (new)

**Interfaces:**
- Consumes: `needsGuestSkillPick`, `markGuestSkillPicked` (Task 2); `SkillBandSelector` (existing component); `t('guestSkillPick.*')` (Task 3).
- Produces: a new top-level route `guest-skill`, gated in `RootNavigator` alongside `(tabs)` and `(auth)`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/guest-skill-pick-test.tsx
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const FAKE_GUEST_SESSION = { user: { id: 'fake-guest-id', is_anonymous: true } };
const updateMock = jest.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
const markGuestSkillPicked = jest.fn();

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_GUEST_SESSION,
    isLoading: false,
    needsGuestSkillPick: true,
    markGuestSkillPicked,
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ update: updateMock }) },
}));

describe('Guest skill-pick screen', () => {
  it('renders instead of the tabs when needsGuestSkillPick is true, saves the picked band, and calls markGuestSkillPicked', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    expect(screen.getByText("What's your skill level?")).toBeTruthy();
    expect(screen.queryByText('🏸 Discover')).toBeNull();

    fireEvent.press(screen.getByText('Novice'));
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ skill_level: 1 }));
    await waitFor(() => expect(markGuestSkillPicked).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/guest-skill-pick-test.tsx`
Expected: FAIL — `useAuth` mock is missing fields `_layout.tsx` doesn't yet read, and `src/app/guest-skill.tsx` doesn't exist, so the route 404s and none of the expected text renders.

- [ ] **Step 3: Create `src/app/guest-skill.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { SkillBandSelector } from '@/components/skill-band-selector';
import { SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { ActionButton } from '@/components/action-button';
import { Court, Space } from '@/constants/badminton-theme';

export default function GuestSkillPickScreen() {
  const { session, markGuestSkillPicked } = useAuth();
  const { t } = useI18n();
  const [skillBandId, setSkillBandId] = useState<SkillBandId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!session || !skillBandId) return;
    setSaving(true);
    setError(null);
    try {
      const band = SKILL_BANDS.find((b) => b.id === skillBandId);
      const { error: updateErr } = await supabase.from('profiles').update({ skill_level: band?.min ?? null }).eq('id', session.user.id);
      if (updateErr) throw updateErr;
      markGuestSkillPicked();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('guestSkillPick.couldNotSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('guestSkillPick.title')}</Text>
      <Text style={styles.subtitle}>{t('guestSkillPick.subtitle')}</Text>
      <SkillBandSelector selectedId={skillBandId} onSelect={setSkillBandId} />
      {error && <Text style={styles.error}>{error}</Text>}
      <ActionButton
        label={saving ? t('guestSkillPick.saving') : t('guestSkillPick.continue')}
        onPress={handleContinue}
        loading={saving}
        disabled={!skillBandId}
        style={styles.continueButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Space.lg, justifyContent: 'center', gap: Space.md },
  title: { fontSize: 22, fontWeight: '700', color: Court.ink },
  subtitle: { fontSize: 14, color: Court.inkSecondary, marginBottom: Space.sm },
  error: { color: Court.danger },
  continueButton: { marginTop: Space.lg, alignSelf: 'stretch' },
});
```

- [ ] **Step 4: Update `src/app/_layout.tsx`**

```tsx
import { SplashScreen, Stack } from 'expo-router';
import { useFonts, LeagueSpartan_700Bold, LeagueSpartan_800ExtraBold } from '@expo-google-fonts/league-spartan';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { AppSplashScreen } from '@/components/app-splash-screen';
import { computeSplashProgress } from '@/lib/splash-progress';

SplashScreen.preventAutoHideAsync();

// Hides the native (image-only) splash as soon as fonts are loaded - the
// app is ready to render *something* at that point - handing off to
// AppSplashScreen, which stays up with a real loading bar until auth has
// also resolved.
function SplashScreenController({ fontsLoaded }: { fontsLoaded: boolean }) {
  if (fontsLoaded) {
    SplashScreen.hide();
  }
  return null;
}

function RootNavigator() {
  const { session, needsGuestSkillPick } = useAuth();
  const { t } = useI18n();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session && !needsGuestSkillPick}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]" options={{ headerShown: true, title: t('eventDetail.headerTitle') }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !!needsGuestSkillPick}>
        <Stack.Screen name="guest-skill" options={{ headerShown: true, title: t('guestSkillPick.headerTitle') }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function AppBody({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { isLoading, needsGuestSkillPick } = useAuth();
  // needsGuestSkillPick is null only while it's still resolving for a fresh
  // anonymous session (see auth-context.tsx) - withheld from rendering the
  // same way fontsLoaded/isLoading already are, so RootNavigator never
  // flashes `(tabs)` before flipping to the guest-skill screen.
  const ready = fontsLoaded && !isLoading && needsGuestSkillPick !== null;

  return ready ? <RootNavigator /> : <AppSplashScreen progress={computeSplashProgress(fontsLoaded, isLoading)} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ LeagueSpartan_700Bold, LeagueSpartan_800ExtraBold });

  return (
    <I18nProvider>
      <AuthProvider>
        <SplashScreenController fontsLoaded={fontsLoaded} />
        <AppBody fontsLoaded={fontsLoaded} />
      </AuthProvider>
    </I18nProvider>
  );
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx jest tests/unit/guest-skill-pick-test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `npx jest`
Expected: PASS, zero failures — every existing test's `useAuth` mock omits `needsGuestSkillPick` entirely, which reads as `undefined`; `AppBody`'s `needsGuestSkillPick !== null` is `true` for `undefined` (only `null` blocks readiness), so every existing test's session (never anonymous) renders exactly as before.

- [ ] **Step 7: Commit**

```bash
git add src/app/guest-skill.tsx src/app/_layout.tsx tests/unit/guest-skill-pick-test.tsx
git commit -m "feat(auth): mandatory one-time skill-range gate for guest sessions"
```

---

### Task 6: Hide the Profile and Create tabs for guest sessions

**Files:**
- Modify: `src/app/(tabs)/_layout.tsx`
- Test: `tests/unit/tabs-guest-test.tsx` (new)

**Interfaces:**
- Consumes: `session.user.is_anonymous` directly from `useAuth()` (no new `AuthContext` field needed).

Checked the exact Expo Router docs (per this repo's AGENTS.md directive) for conditionally hiding one `Tabs.Screen`: `Tabs.Protected` (https://docs.expo.dev/router/advanced/protected/) wraps one or more `Tabs.Screen` elements with a `guard` boolean, the same "Protected routes" feature family as the `Stack.Protected` already used in this exact codebase's `_layout.tsx` (confirmed working at this app's Expo SDK 57 by that existing, already-functioning usage) — "Protected routes are also available for Tabs and Drawer navigators" per that doc.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/tabs-guest-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

const FAKE_GUEST_SESSION = { user: { id: 'fake-guest-id', is_anonymous: true } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_GUEST_SESSION, isLoading: false, needsGuestSkillPick: false }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [] }),
        eq: () => Promise.resolve({ data: [] }),
        order: () => Promise.resolve({ data: [] }),
      }),
    }),
  },
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => Promise.resolve({ granted: false }),
}));

describe('Tab bar for a guest session', () => {
  it('shows only Discover - hides both Create and Profile', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });
    expect(screen.getAllByText('Discover').length).toBeGreaterThan(0);
    expect(screen.queryByText('Create')).toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/tabs-guest-test.tsx`
Expected: FAIL — `Create` and `Profile` both still render in the tab bar for every session today, guest or not.

- [ ] **Step 3: Update `src/app/(tabs)/_layout.tsx`**

```tsx
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Court, Font } from '@/constants/badminton-theme';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const { t } = useI18n();
  const { session } = useAuth();
  const isGuest = !!session?.user.is_anonymous;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Court.featherDark,
        tabBarInactiveTintColor: Court.inkSecondary,
        tabBarStyle: { backgroundColor: Court.shuttle, borderTopColor: Court.line },
        tabBarLabelStyle: { fontFamily: Font.display, fontSize: 12 },
        headerStyle: { backgroundColor: Court.greenDeep },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: Font.displayBlack, fontSize: 20 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.discover'), tabBarIcon: ({ focused }) => <TabIcon emoji="🔎" focused={focused} /> }}
      />
      <Tabs.Protected guard={!isGuest}>
        <Tabs.Screen
          name="create"
          options={{ title: t('tabs.create'), tabBarIcon: ({ focused }) => <TabIcon emoji="🏸" focused={focused} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: t('tabs.profile'), tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
        />
      </Tabs.Protected>
    </Tabs>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest tests/unit/tabs-guest-test.tsx`
Expected: PASS

- [ ] **Step 5: Confirm the existing zh-TW tab-titles test still passes unchanged**

Run: `npx jest tests/unit/tabs-titles-zh-test.tsx`
Expected: PASS — that test's mocked session (`{ user: { id: 'fake-user-id' } }`) has no `is_anonymous` field, so `isGuest` is `false` and every tab (including Create and Profile) renders exactly as before.

- [ ] **Step 6: Run the full suite**

Run: `npx jest`
Expected: PASS, zero failures.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(tabs\)/_layout.tsx tests/unit/tabs-guest-test.tsx
git commit -m "feat(auth): hide the Profile and Create tabs for guest sessions"
```

---

### Task 7: RLS scope enforcement — block guest organize/venue/rating

**Files:**
- Create: `supabase/migrations/20260728050000_guest_rls_restrictions.sql`
- Test: `tests/integration/guest-rls.test.mjs` (new)
- Modify: `package.json` (new `test:guest-rls` script)

**Interfaces:**
- Produces: `events_insert_own`, `venues_insert_authenticated`, and `ratings_insert_participant` (rater side only) each gain `and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)`.

The *current, live* `ratings_insert_participant` policy is not the one in `20260716201044_rls_policies.sql` (superseded) but the one from `supabase/migrations/20260726130000_ratings_organizer_ratee.sql` — this task's migration must `drop`/`create` starting from that later definition, or it would silently revert the organizer-can-rate-attendees and no-self-rating fixes from that later migration.

- [ ] **Step 1: Write the failing integration test**

```js
// tests/integration/guest-rls.test.mjs
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
```

Add to `package.json`'s `scripts`:
```json
"test:guest-rls": "node --env-file=.env.local tests/integration/guest-rls.test.mjs",
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:guest-rls`
Expected: FAIL — the venue and event inserts currently succeed for a guest (no anonymity check exists yet), so the `assert(venueErr, ...)` and `assert(guestEventErr, ...)` lines fail.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260728050000_guest_rls_restrictions.sql
drop policy "events_insert_own" on public.events;
create policy "events_insert_own" on public.events
  for insert to authenticated with check (
    auth.uid() = organizer_id
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
  );

drop policy "venues_insert_authenticated" on public.venues;
create policy "venues_insert_authenticated" on public.venues
  for insert to authenticated with check (
    auth.uid() = created_by
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
  );

-- Rebuilt from supabase/migrations/20260726130000_ratings_organizer_ratee.sql's
-- definition (the current live policy), not the original
-- 20260716201044_rls_policies.sql one - only the rater-side anonymity check
-- is new here; the ratee-side organizer-or-accepted-participant check and the
-- rater_id <> ratee_id guard are unchanged and must be preserved verbatim.
drop policy "ratings_insert_participant" on public.ratings;
create policy "ratings_insert_participant" on public.ratings
  for insert to authenticated with check (
    auth.uid() = rater_id
    and rater_id <> ratee_id
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    and (
      auth.uid() = (select organizer_id from public.events where id = ratings.event_id)
      or exists (
        select 1 from public.event_participants
        where event_id = ratings.event_id and user_id = auth.uid() and status = 'accepted'
      )
    )
    and (
      ratee_id = (select organizer_id from public.events where id = ratings.event_id)
      or exists (
        select 1 from public.event_participants
        where event_id = ratings.event_id and user_id = ratings.ratee_id and status = 'accepted'
      )
    )
  );
```

- [ ] **Step 4: Apply the migration and run the test to confirm it passes**

Run: `npx supabase migration up`
Run: `npm run test:guest-rls`
Expected: PASS

- [ ] **Step 5: Run the pre-existing `rls.test.mjs` and `ratings.test.mjs` to confirm no regression**

Run: `npm run test:rls`
Run: `npm run test:ratings`
Expected: PASS — neither test signs in anonymously, so the added `not coalesce(...)` clauses evaluate against a real (non-anonymous) session's JWT, where the claim is absent and `coalesce(..., false)` makes the added condition `not false` = `true`, changing nothing for real users.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260728050000_guest_rls_restrictions.sql tests/integration/guest-rls.test.mjs package.json
git commit -m "feat(auth): restrict guests from organizing events, adding venues, or rating as rater"
```

---

### Task 8: Guest badge on the organizer's roster view

**Files:**
- Modify: `src/lib/profile-data.ts`
- Modify: `src/app/(tabs)/profile.tsx`
- Modify: `tests/unit/profile-events-test.tsx`

**Interfaces:**
- Consumes: `profiles.is_anonymous` (Task 1).
- Produces: `Attendee.profiles` gains `is_anonymous: boolean`; `PersonRow` gains `isGuest?: boolean`.

- [ ] **Step 1: Read `tests/unit/profile-events-test.tsx` in full to match its exact existing fixture shape**

Already done for this plan. Only `mockAllRosterRows`'s two `profiles` sub-objects (lines 53 and 59 - the shape that flows through `Attendee.profiles`) need `is_anonymous` added. `ownProfileRow` (line 8) and `organizerProfileRow` (lines 36-41) map to the unrelated `ProfileRow`/`OrganizerInfo` types and are untouched.

- [ ] **Step 2: Write the failing test addition**

In `tests/unit/profile-events-test.tsx`, change `mockAllRosterRows` (lines 48-61) from:
```tsx
const mockAllRosterRows = [
  {
    event_id: organizedEvent.id,
    user_id: 'participant-1',
    status: 'pending',
    profiles: { display_name: 'Newbie Player', skill_level: 2, profile_contact: { contact_info: '090-1234' } },
  },
  {
    event_id: attendingEvent.id,
    user_id: 'fake-user-id',
    status: 'accepted',
    profiles: { display_name: 'Fake Player', skill_level: 8, profile_contact: null },
  },
];
```
to:
```tsx
const mockAllRosterRows = [
  {
    event_id: organizedEvent.id,
    user_id: 'participant-1',
    status: 'pending',
    profiles: { display_name: 'Newbie Player', skill_level: 2, is_anonymous: true, profile_contact: { contact_info: '090-1234' } },
  },
  {
    event_id: attendingEvent.id,
    user_id: 'fake-user-id',
    status: 'accepted',
    profiles: { display_name: 'Fake Player', skill_level: 8, is_anonymous: false, profile_contact: null },
  },
];
```
Then add a new test at the end of the file, after the existing `'lets the organizer accept a pending request...'` test (matching that test's exact render/await idiom - `await screen.findByText(organizedEvent.title)` first, same as every other test in this file):
```tsx
it(
  'shows a Guest badge for an anonymous attendee and not for a regular one',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(organizedEvent.title);
    expect(await screen.findByText('Newbie Player')).toBeTruthy();

    expect(screen.getByText('Guest')).toBeTruthy();
    expect(screen.queryAllByText('Guest')).toHaveLength(1);
  },
  15000
);
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx jest tests/unit/profile-events-test.tsx`
Expected: FAIL — TypeScript error first (fixtures don't match the not-yet-updated `Attendee.profiles` type once Step 4 lands), or if run before Step 4, `getByText('Guest')` finds nothing.

- [ ] **Step 4: Update `src/lib/profile-data.ts`**

Change `Attendee`'s type (line 32-36):
```ts
export type Attendee = {
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  profiles: { display_name: string; skill_level: number | null; contact_info: string | null; is_anonymous: boolean } | null;
};
```
Change the embedded select in `getEventRosters` (line 188):
```ts
// before:
.select('event_id, user_id, status, profiles(display_name, skill_level, profile_contact(contact_info))')
// after:
.select('event_id, user_id, status, profiles(display_name, skill_level, is_anonymous, profile_contact(contact_info))')
```
Change the `Row` type and mapping in the same function (lines 190-207):
```ts
  type Row = {
    event_id: string;
    user_id: string;
    status: Attendee['status'];
    profiles: { display_name: string; skill_level: number | null; is_anonymous: boolean; profile_contact: ProfileContactRow } | null;
  };
  for (const row of (data as unknown as Row[] | null) ?? []) {
    const attendee: Attendee = {
      user_id: row.user_id,
      status: row.status,
      profiles: row.profiles
        ? {
            display_name: row.profiles.display_name,
            skill_level: row.profiles.skill_level,
            is_anonymous: row.profiles.is_anonymous,
            contact_info: row.profiles.profile_contact?.contact_info ?? null,
          }
        : null,
    };
    (result[row.event_id] ??= []).push(attendee);
  }
```

- [ ] **Step 5: Update `src/app/(tabs)/profile.tsx`**

`PersonRow`'s props (lines 388-406) gain `isGuest`:
```tsx
function PersonRow({
  name,
  skillLevel,
  contact,
  credit,
  statusLabel,
  statusTone,
  decision,
  rating,
  isGuest,
}: {
  name: string;
  skillLevel: number | null;
  contact?: string | null;
  credit: Credit | undefined;
  statusLabel?: string;
  statusTone?: 'green' | 'neutral' | 'danger';
  decision?: { onAccept: () => void; onDecline: () => void; loading?: boolean };
  rating?: { value: number; onChange: (score: number) => void; disabled?: boolean };
  isGuest?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.rosterRow}>
      <Text style={styles.rosterName}>{name}</Text>
      <View style={styles.pillRowSmall}>
        {statusLabel && <Pill label={statusLabel} tone={statusTone ?? 'neutral'} />}
        {isGuest && <Pill label={t('profile.guestBadge')} tone="neutral" />}
        {skillLevel != null && <Pill label={t(`skillBands.${bandForLevel(skillLevel).id}`)} tone="feather" />}
        <CreditPill credit={credit} />
        {contact && <Pill label={contact} tone="neutral" />}
      </View>
      {decision && (
        <View style={styles.decisionRow}>
          <ActionButton label={t('profile.accept')} onPress={decision.onAccept} loading={decision.loading} />
          <ActionButton label={t('profile.decline')} onPress={decision.onDecline} variant="danger" loading={decision.loading} />
        </View>
      )}
      {rating && <StarRating value={rating.value} onChange={rating.onChange} disabled={rating.disabled} />}
    </View>
  );
}
```
`FellowParticipants`'s `PersonRow` call (line 499-510) gains `isGuest={attendee.profiles?.is_anonymous ?? false}`:
```tsx
        <PersonRow
          key={attendee.user_id}
          name={attendee.profiles?.display_name ?? t('profile.unknownPlayer')}
          skillLevel={attendee.profiles?.skill_level ?? null}
          contact={attendee.profiles?.contact_info}
          credit={credits[attendee.user_id]}
          isGuest={attendee.profiles?.is_anonymous ?? false}
          rating={
            canRate
              ? { value: myRatings[attendee.user_id] ?? 0, onChange: (score) => handleRate(attendee.user_id, score) }
              : undefined
          }
        />
```
`AttendeeRoster`'s `PersonRow` call (line 568-596) gains the same:
```tsx
        <PersonRow
          key={attendee.user_id}
          name={attendee.profiles?.display_name ?? t('profile.unknownPlayer')}
          skillLevel={attendee.profiles?.skill_level ?? null}
          contact={attendee.profiles?.contact_info}
          credit={credits[attendee.user_id]}
          isGuest={attendee.profiles?.is_anonymous ?? false}
          statusLabel={
            attendee.status === 'accepted'
              ? t('profile.statusAccepted')
              : attendee.status === 'declined'
                ? t('profile.statusDeclined')
                : t('profile.statusPending')
          }
          statusTone={attendee.status === 'accepted' ? 'green' : attendee.status === 'declined' ? 'danger' : 'neutral'}
          decision={
            attendee.status === 'pending'
              ? {
                  onAccept: () => handleDecide(attendee.user_id, 'accepted'),
                  onDecline: () => handleDecide(attendee.user_id, 'declined'),
                  loading: decidingUserId === attendee.user_id,
                }
              : undefined
          }
          rating={
            canRate && attendee.status === 'accepted'
              ? { value: myRatings[attendee.user_id] ?? 0, onChange: (score) => handleRate(attendee.user_id, score) }
              : undefined
          }
        />
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `npx jest tests/unit/profile-events-test.tsx`
Expected: PASS

- [ ] **Step 7: Fix the one other test file with a real roster fixture**

Confirmed by checking every test file that mocks `event_participants`: `profile-edit-test.tsx`, `profile-navigation-test.tsx`, and `profile-remove-test.tsx` all mock an empty roster (`{ data: [], error: null }`) and need no change. Only `tests/unit/profile-ratings-test.tsx` has real `profiles` fixtures in its own `mockAllRosterRows` (lines 37-62) that will fail to type-check once `Attendee.profiles` requires `is_anonymous`. Change it from:
```tsx
const mockAllRosterRows = [
  {
    event_id: organizedEvent.id,
    user_id: 'newbie-id',
    status: 'pending',
    profiles: { display_name: 'Newbie', skill_level: 2, profile_contact: null },
  },
  {
    event_id: organizedEvent.id,
    user_id: 'vet-id',
    status: 'accepted',
    profiles: { display_name: 'Vet', skill_level: 10, profile_contact: null },
  },
  {
    event_id: attendingEvent.id,
    user_id: 'fake-user-id',
    status: 'accepted',
    profiles: { display_name: 'Fake Player', skill_level: 8, profile_contact: null },
  },
  {
    event_id: attendingEvent.id,
    user_id: 'buddy-id',
    status: 'accepted',
    profiles: { display_name: 'Buddy', skill_level: 7, profile_contact: null },
  },
];
```
to (adding `is_anonymous: false` to each - this file has no guest-related assertions of its own, it just needs to type-check):
```tsx
const mockAllRosterRows = [
  {
    event_id: organizedEvent.id,
    user_id: 'newbie-id',
    status: 'pending',
    profiles: { display_name: 'Newbie', skill_level: 2, is_anonymous: false, profile_contact: null },
  },
  {
    event_id: organizedEvent.id,
    user_id: 'vet-id',
    status: 'accepted',
    profiles: { display_name: 'Vet', skill_level: 10, is_anonymous: false, profile_contact: null },
  },
  {
    event_id: attendingEvent.id,
    user_id: 'fake-user-id',
    status: 'accepted',
    profiles: { display_name: 'Fake Player', skill_level: 8, is_anonymous: false, profile_contact: null },
  },
  {
    event_id: attendingEvent.id,
    user_id: 'buddy-id',
    status: 'accepted',
    profiles: { display_name: 'Buddy', skill_level: 7, is_anonymous: false, profile_contact: null },
  },
];
```

- [ ] **Step 8: Run the full suite**

Run: `npx jest`
Expected: PASS, zero failures.

- [ ] **Step 9: Commit**

```bash
git add src/lib/profile-data.ts src/app/\(tabs\)/profile.tsx tests/unit/profile-events-test.tsx tests/unit/profile-ratings-test.tsx
git commit -m "feat(profile): show a Guest badge for anonymous attendees on the roster"
```

---

### Task 9: Final full-suite and integration verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete unit/component suite**

Run: `npx jest`
Expected: PASS, zero failures, every suite from before this plan plus `login-guest-test.tsx`, `guest-skill-pick-test.tsx`, `tabs-guest-test.tsx`.

- [ ] **Step 2: Run the TypeScript compiler standalone**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Run every new integration test**

Run: `npm run test:guest-signup`
Run: `npm run test:guest-rls`
Expected: both PASS.

- [ ] **Step 4: Run the pre-existing integration tests to confirm no regression**

Run: `npm run test:rls`
Run: `npm run test:ratings`
Run: `npm run test:create-event`
Run: `npm run test:participant-lifecycle`
Run: `npm run test:participant-decision`
Expected: all PASS — none of this plan's RLS changes alter behavior for a non-anonymous session (verified per-clause in Task 7).

- [ ] **Step 5: Manually verify the migrations applied cleanly**

Run: `docker exec supabase_db_badminton psql -U postgres -d postgres -c "\d public.profiles"` and confirm `is_anonymous` appears.
Run: `docker exec supabase_db_badminton psql -U postgres -d postgres -c "\d public.events"` and confirm the `events_insert_own` check clause includes `is_anonymous`.

- [ ] **Step 6: Final commit (only if Steps 1-5 required any fixups not already committed)**

```bash
git add -A
git commit -m "chore(auth): final full-suite verification pass"
```

If nothing needed fixing, skip this step — there is nothing to commit.

---

## Self-Review

**Spec coverage:** Enabling guest sign-in (config flip, `signInAsGuest`, login button) — Tasks 1, 2, 4. Display-name trigger fix + `is_anonymous` tracking — Task 1. Mandatory one-time skill-range gate (including the concrete gating mechanism the spec explicitly deferred to plan time) — Tasks 2, 5. Hidden Profile and Create tabs (`Tabs.Protected`, the exact mechanism the spec deferred, cross-checked against this app's own already-working `Stack.Protected` plus the official docs) — Task 6. RLS scope enforcement (events/venues blocked, ratings rater-side blocked, ratee-side/`profiles_update_own`/chat explicitly left untouched and asserted as such) — Task 7. Guest badge — Task 8. Every bullet in the spec's Testing section has a concrete task: migration/trigger integration test (Task 1), RLS integration test (Task 7), onboarding-gate test (both the real-`AuthProvider` logic in Task 2 and the `_layout.tsx` wiring in Task 5), guest-badge test (Task 8). Out-of-scope items (account upgrade, cut-down Profile tab) are correctly absent from the task list.

**Placeholder scan:** grepped the full plan for TBD/TODO/"implement later"/"similar to Task N"/"add appropriate error handling" — none found. Every step has real, complete code or an exact command.

**Type consistency:** `AuthContextValue`'s three new fields (`needsGuestSkillPick: boolean | null`, `signInAsGuest: () => Promise<void>`, `markGuestSkillPicked: () => void`) are defined once in Task 2 and read with matching names/types in every later task (`login.tsx` Task 4, `_layout.tsx` and `guest-skill.tsx` Task 5) — no renamed field anywhere. `Attendee.profiles`'s `is_anonymous: boolean` (Task 8) matches the embedded-select shape it's populated from and the `PersonRow`'s `isGuest?: boolean` prop it feeds. The RLS clause `not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)` is copied verbatim across all three altered policies in Task 7. Confirmed a real gap during self-review — Task 2's new `AuthProvider` logic would otherwise never be exercised by any test in this plan (every existing test mocks `@/lib/auth-context` away) — and fixed it by adding a dedicated test in Task 2 that renders the real `AuthProvider` against a mocked `@/lib/supabase`.

**Resolved during review:** this plan's first draft flagged that the original spec only scoped hiding the Profile tab, leaving Create visible for a guest to fill out and hit a raw RLS-denied error on submit. The controller took this to the user, who decided to hide Create too, matching Profile - the design spec and Task 6 above were both updated accordingly before execution. A guest's tab bar shows Discover only.
