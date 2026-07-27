import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

const FAKE_SESSION = { user: { id: 'fake-user-id', email: 'fake@example.com' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false, signOut: jest.fn() }),
}));

jest.mock('@/lib/profile-data', () => ({
  loadProfileSummary: () =>
    Promise.resolve({
      profile: null,
      organizedEvents: [],
      attendingEvents: [],
      playerCounts: {},
      profileError: null,
      organizedEventsError: null,
      attendingEventsError: null,
      rostersByEventId: {},
      creditsByUserId: {},
      myRatingsByEventId: {},
    }),
}));

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('Profile screen under zh-TW locale', () => {
  it('renders Mandarin section titles', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });
    expect(await screen.findByText('🏸 個人資料')).toBeTruthy();
    expect(await screen.findByText('我的資料')).toBeTruthy();
  });
});
