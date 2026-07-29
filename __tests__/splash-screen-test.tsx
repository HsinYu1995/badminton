import { renderRouter, screen } from 'expo-router/testing-library';

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_SESSION,
    isLoading: true,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) },
}));

it(
  'shows the app splash screen (not the tab navigator) while auth is still loading',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    expect(await screen.findByTestId('app-splash-screen')).toBeTruthy();
    // Fonts load (real useFonts resolves in the test environment) but auth
    // never does here (isLoading: true forever), so progress should settle
    // at 50, not 0 or 100.
    expect(await screen.findByTestId('app-splash-progress-fill')).toHaveStyle({ width: '50%' });
    expect(screen.queryByText('🏸 Discover')).toBeNull();
  },
  15000
);
