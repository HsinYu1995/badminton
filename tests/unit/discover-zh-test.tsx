import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false }),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => Promise.resolve({ granted: false }),
}));

jest.mock('@/lib/discover-events', () => ({
  DISCOVER_PAGE_SIZE: 10,
  fetchDiscoverPage: () =>
    Promise.resolve({
      items: [
        {
          event: {
            id: 'event-1',
            organizer_id: 'someone-else',
            title: 'Fake Friendly Doubles',
            start_time: '2026-08-01T10:00:00.000Z',
            end_time: '2026-08-01T12:00:00.000Z',
            headcount_max: 8,
            skill_min: 1,
            skill_max: 18,
            fee: 0,
            venues: { name: 'Fake Court' },
          },
          distanceMeters: null,
        },
      ],
      hasMore: false,
    }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({ in: () => Promise.resolve({ data: [] }) }),
        eq: () => Promise.resolve({ data: [] }),
      }),
    }),
  },
}));

describe('Discover screen under zh-TW locale', () => {
  it('renders Mandarin header and Join action', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });
    expect(await screen.findByText('🏸 探索')).toBeTruthy();
    expect(await screen.findByText('加入')).toBeTruthy();
  });
});
