import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const mockInsert = jest.fn(() => Promise.resolve({ error: null }));

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array.
const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_SESSION,
    isLoading: false,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'venues') {
        return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
      }
      if (table === 'events') {
        return {
          select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
          insert: mockInsert,
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'shows a validation error and blocks submission when required fields are missing',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    await screen.findByText('🏸 Host a game');

    await fireEvent.press(screen.getByText('Create event'));

    expect(await screen.findByText('Title is required.')).toBeTruthy();
    expect(mockInsert).not.toHaveBeenCalled();
  },
  15000
);
