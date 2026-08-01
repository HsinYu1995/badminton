import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const pastEvent = {
  id: 'event-past',
  organizer_id: 'fake-user-id',
  title: 'Last Month Mixer',
  start_time: '2026-06-01T10:00:00.000Z',
  end_time: '2026-06-01T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Riverside Court' },
};

const upcomingEvent = {
  id: 'event-future',
  organizer_id: 'fake-user-id',
  title: 'Next Month Mixer',
  start_time: '2027-06-01T10:00:00.000Z',
  end_time: '2027-06-01T12:00:00.000Z',
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
const mockEventsDeleteEq = jest.fn(() => ({ select: () => Promise.resolve({ data: [{ id: pastEvent.id }], error: null }) }));

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
              single: () => Promise.resolve({ data: { display_name: 'Fake Player', skill_level: 9 }, error: null }),
            }),
          }),
        };
      }
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: [pastEvent, upcomingEvent], error: null }) }),
          }),
          delete: () => ({ eq: mockEventsDeleteEq }),
        };
      }
      if (table === 'event_participants') {
        return {
          select: () => ({
            // getEventRosters' batched roster query: .in('event_id', ids).
            in: () => Promise.resolve({ data: [], error: null }),
            eq: (column: string) =>
              column === 'user_id'
                ? { eq: () => Promise.resolve({ data: [], error: null }) }
                : Promise.resolve({ data: [], error: null }),
          }),
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
  'only offers to remove the past event, and removes it on press',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(pastEvent.title);
    expect(screen.getByText(upcomingEvent.title)).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();

    await fireEvent.press(screen.getByText('Remove outdated event'));

    await waitFor(() => expect(mockEventsDeleteEq).toHaveBeenCalledWith('id', pastEvent.id));
    expect(screen.queryByText(pastEvent.title)).toBeNull();
    expect(screen.getByText(upcomingEvent.title)).toBeTruthy();
  },
  15000
);
