import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const mockSignInAsGuest = jest.fn(() => Promise.resolve());

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: null, isLoading: false, signInWithGoogle: jest.fn(), signInAsGuest: mockSignInAsGuest }),
}));

describe('Login screen guest button', () => {
  it('renders a Continue as guest button and calls signInAsGuest on press', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/' });
    const button = screen.getByText('Continue as guest');
    fireEvent.press(button);
    await waitFor(() => expect(mockSignInAsGuest).toHaveBeenCalledTimes(1));
  });
});
