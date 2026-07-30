import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

const mockReverseGeocodeAsync = jest.fn();
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: () => Promise.resolve({ granted: true }),
  reverseGeocodeAsync: mockReverseGeocodeAsync,
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
            data: [
              {
                id: 'venue-1',
                name: 'Fake Court',
                address: '123 Fake Rd',
                address_zh: '台北市大安區和平東路二段106號',
                latitude: 25.033,
                longitude: 121.5654,
              },
            ],
            error: null,
          }),
      }),
    }),
  },
}));

describe('VenuePicker under zh-TW locale', () => {
  it('shows the organizer-authored address_zh without calling reverseGeocodeAsync', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    await screen.findByText('台北市大安區和平東路二段106號');
    expect(mockReverseGeocodeAsync).not.toHaveBeenCalled();
  });
});
