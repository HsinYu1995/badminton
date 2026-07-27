import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: { user: { id: 'fake-user-id' } }, isLoading: false }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [] }) }),
      insert: () => Promise.resolve({ error: null }),
    }),
  },
}));

describe('Create screen under zh-TW locale', () => {
  it('renders Mandarin field labels', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    expect(screen.getByText('🏸 主辦比賽')).toBeTruthy();
    expect(screen.getByText('活動標題')).toBeTruthy();
    expect(screen.getByText('建立活動')).toBeTruthy();
  });
});
