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
