import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const mockEvent = {
  id: 'event-1',
  organizer_id: 'someone-else',
  title: 'Sunday Doubles Mixer',
  start_time: '2026-08-01T10:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Riverside Court' },
};

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array.
const FAKE_SESSION = { user: { id: 'fake-user-id' } };
const mockParticipantInsert = jest.fn(() => Promise.resolve({ error: null }));
const mockParticipantDeleteEq2 = jest.fn(() => Promise.resolve({ error: null }));
const mockParticipantDelete = jest.fn(() => ({
  eq: () => ({ eq: mockParticipantDeleteEq2 }),
}));

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
      if (table === 'events') {
        return { select: () => ({ order: () => Promise.resolve({ data: [mockEvent], error: null }) }) };
      }
      if (table === 'event_participants') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
            in: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
          }),
          insert: mockParticipantInsert,
          delete: mockParticipantDelete,
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'joins an event, shows a Cancel request state, and cancelling goes back to Join',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    await screen.findByText(mockEvent.title);
    // The organizer is always a player too, so an event nobody has joined
    // yet still shows 1, not "Up to 8 players".
    expect(screen.getByText('1/8 players')).toBeTruthy();
    await fireEvent.press(screen.getByText('Join'));

    await waitFor(() => expect(mockParticipantInsert).toHaveBeenCalledTimes(1));
    expect(mockParticipantInsert).toHaveBeenCalledWith({
      event_id: mockEvent.id,
      user_id: FAKE_SESSION.user.id,
      status: 'pending',
    });

    expect(await screen.findByText('Cancel request')).toBeTruthy();
    expect(screen.queryByText('Join')).toBeNull();
    expect(screen.getByText('2/8 players')).toBeTruthy();

    await fireEvent.press(screen.getByText('Cancel request'));

    await waitFor(() => expect(mockParticipantDelete).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Join')).toBeTruthy();
    expect(screen.queryByText('Cancel request')).toBeNull();
    expect(screen.getByText('1/8 players')).toBeTruthy();
  },
  15000
);
