import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

jest.mock('expo-location', () => ({
  reverseGeocodeAsync: () => Promise.reject(new Error('geocoding unavailable')),
}));

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [{ id: 'venue-1', name: 'Fake Court', address: '123 Fake Rd', address_zh: null, latitude: 25.033, longitude: 121.5654 }],
            error: null,
          }),
      }),
    }),
  },
}));

describe('VenuePicker under zh-TW locale when geocoding fails', () => {
  it('falls back to the original address', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    await screen.findByText('123 Fake Rd');
  });
});
