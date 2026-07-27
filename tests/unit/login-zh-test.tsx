import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: null, isLoading: false, signInWithGoogle: jest.fn() }),
}));

describe('Login screen under zh-TW locale', () => {
  it('renders Mandarin sign-in copy', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/' });
    expect(screen.getByText('登入')).toBeTruthy();
    expect(screen.getByText('使用 Google 登入')).toBeTruthy();
  });
});
