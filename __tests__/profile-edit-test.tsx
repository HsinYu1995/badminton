import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const initialProfile = { display_name: 'Fake Player', skill_level: 8, bio: null, contact_info: null };

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array.
const FAKE_SESSION = { user: { id: 'fake-user-id' } };
const mockProfileUpdateEq = jest.fn((_payload: unknown) => Promise.resolve({ error: null }));

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
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: initialProfile, error: null }),
            }),
          }),
          update: (payload: unknown) => ({ eq: () => mockProfileUpdateEq(payload) }),
        };
      }
      if (table === 'events') {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      if (table === 'event_participants') {
        return { select: () => ({ in: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'edits and saves skill level, bio, and contact info',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText('Fake Player');
    // skill_level 8 falls in the "intermediate" band (see src/lib/skill-bands.ts) - confirm it's pre-selected.
    expect(screen.getByRole('button', { name: 'Intermediate', selected: true })).toBeTruthy();

    await fireEvent.changeText(
      screen.getByPlaceholderText('Tell other players a bit about yourself'),
      'Weekend warrior, mostly doubles.'
    );
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. LINE ID, phone number'), 'LINE: fakeplayer');
    await fireEvent.press(screen.getByText('Advanced'));

    await fireEvent.press(screen.getByText('Save profile'));

    await waitFor(() => expect(mockProfileUpdateEq).toHaveBeenCalledTimes(1));
    expect(mockProfileUpdateEq).toHaveBeenCalledWith({
      display_name: 'Fake Player',
      bio: 'Weekend warrior, mostly doubles.',
      contact_info: 'LINE: fakeplayer',
      skill_level: 13,
    });
    expect(await screen.findByText('Profile saved.')).toBeTruthy();
  },
  15000
);
