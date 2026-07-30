import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array.
const FAKE_GUEST_SESSION = { user: { id: 'fake-guest-id', is_anonymous: true } };
const mockSignOut = jest.fn();

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_GUEST_SESSION,
    isLoading: false,
    signInWithGoogle: jest.fn(),
    signOut: mockSignOut,
  }),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string) => {
      if (fn === 'discover_events') return Promise.resolve({ data: [], error: null });
      throw new Error(`Unexpected rpc in mock: ${fn}`);
    },
    from: (table: string) => {
      if (table === 'event_participants') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
            in: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'shows a guest-exit control that calls signOut',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });
    await fireEvent.press(await screen.findByText('Exit guest mode'));
    expect(mockSignOut).toHaveBeenCalled();
  },
  15000
);
