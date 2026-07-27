// tests/unit/tabs-titles-zh-test.tsx
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

describe('Tab bar under zh-TW locale', () => {
  it('renders Mandarin tab titles', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });
    expect(screen.getAllByText('探索').length).toBeGreaterThan(0);
  });
});
