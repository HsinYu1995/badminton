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
const mockParticipantUpdateEq2 = jest.fn(() => Promise.resolve({ error: null }));
const mockParticipantUpdate = jest.fn((_payload: unknown) => ({
  eq: () => ({ eq: mockParticipantUpdateEq2 }),
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
          update: mockParticipantUpdate,
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'joins an event, shows a Cancel request state, and can withdraw it',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    await screen.findByText(mockEvent.title);
    expect(screen.getByText('Up to 8 players')).toBeTruthy();
    await fireEvent.press(screen.getByText('Join'));

    await waitFor(() => expect(mockParticipantInsert).toHaveBeenCalledTimes(1));
    expect(mockParticipantInsert).toHaveBeenCalledWith({
      event_id: mockEvent.id,
      user_id: FAKE_SESSION.user.id,
      status: 'pending',
    });

    expect(await screen.findByText('Cancel request')).toBeTruthy();
    expect(screen.queryByText('Join')).toBeNull();
    expect(screen.getByText('1/8 players')).toBeTruthy();

    await fireEvent.press(screen.getByText('Cancel request'));

    await waitFor(() => expect(mockParticipantUpdate).toHaveBeenCalledWith({ status: 'declined' }));
    expect(await screen.findByText('Withdrawn')).toBeTruthy();
    expect(screen.queryByText('Cancel request')).toBeNull();
  },
  15000
);
