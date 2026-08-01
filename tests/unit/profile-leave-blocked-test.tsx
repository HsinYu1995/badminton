import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array.
const FAKE_SESSION = { user: { id: 'fake-user-id' } };

const ownProfileRow = { display_name: 'Fake Player', skill_level: 8, profile_contact: null };

const attendingEvent = {
  id: 'event-attending',
  organizer_id: 'organizer-user-id',
  title: 'Joined Game',
  start_time: '2027-08-02T10:00:00.000Z',
  end_time: '2027-08-02T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Away Court' },
};

// Represents the row already being gone by the time the press lands (e.g.
// the organizer removed the event, or another tab already left it) - RLS
// matches zero rows and reports no error, exactly like a real blocked
// delete. Chainable AND directly awaitable, so it resolves the same way
// whether the caller reads it via .eq().eq() (today's un-guarded shape) or
// .eq().eq().select() (the guarded shape once handleLeaveEvent is fixed) -
// the point is that BOTH shapes see the same zero-rows-no-error result; only
// the guarded one actually looks at it.
function chainableZeroRows() {
  const result = { data: [], error: null };
  const chain: Record<string, unknown> = {
    eq: () => chain,
    select: () => Promise.resolve(result),
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  return chain;
}
const mockLeaveDelete = jest.fn(() => chainableZeroRows());

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
            eq: () => ({ single: () => Promise.resolve({ data: ownProfileRow, error: null }) }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
            in: () => ({ order: () => Promise.resolve({ data: [attendingEvent], error: null }) }),
          }),
        };
      }
      if (table === 'event_participants') {
        return {
          select: () => ({
            eq: (column: string) =>
              column === 'user_id'
                ? { eq: () => Promise.resolve({ data: [{ event_id: attendingEvent.id }], error: null }) }
                : Promise.resolve({ data: [], error: null }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
          delete: mockLeaveDelete,
        };
      }
      if (table === 'ratings') {
        return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      if (table === 'profile_credit') {
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'shows an error and keeps the event listed when leaving is silently blocked (zero rows matched)',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(attendingEvent.title);
    await fireEvent.press(screen.getByText('Leave event'));

    await waitFor(() => expect(mockLeaveDelete).toHaveBeenCalledTimes(1));

    // The mutation matched zero rows - it must surface as a visible error,
    // not a silent success that removes an event the database never
    // actually let go of.
    expect(await screen.findByText("You've already left this event.")).toBeTruthy();
    expect(screen.getByText(attendingEvent.title)).toBeTruthy();
  },
  15000
);
