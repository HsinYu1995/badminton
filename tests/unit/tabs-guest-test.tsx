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

  it('does not render the real Profile screen when navigated to directly', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });
    expect(screen.queryByText('🏸 Profile')).toBeNull();
  });

  it('does not render the real Create screen when navigated to directly', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    expect(screen.queryByText('🏸 Host a game')).toBeNull();
  });
});
