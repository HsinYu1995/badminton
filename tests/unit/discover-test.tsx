import { renderRouter, screen } from 'expo-router/testing-library';

const mockEvents = [
  {
    id: 'event-1',
    organizer_id: 'someone-else',
    title: 'Fake Friendly Doubles',
    start_time: '2026-08-01T10:00:00.000Z',
    end_time: '2026-08-01T12:00:00.000Z',
    headcount_max: 8,
    skill_min: 1,
    skill_max: 18,
    fee: 0,
    venue_name: 'Fake Court',
    distance_meters: null,
  },
  {
    id: 'event-2',
    organizer_id: 'someone-else',
    title: 'Fake Advanced Singles',
    start_time: '2026-08-02T14:00:00.000Z',
    end_time: '2026-08-02T16:00:00.000Z',
    headcount_max: 4,
    skill_min: 13,
    skill_max: 18,
    fee: 150,
    venue_name: 'Fake Gym',
    distance_meters: null,
  },
];

// A stable reference matters here: DiscoverScreen's loadEvents useCallback
// depends on [session], which feeds a useFocusEffect. A mock that returns a
// fresh `session` object literal on every call gives that dependency a new
// identity every render, re-firing the focus effect forever and hanging the
// test until Jest's own per-test timeout kills it.
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

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string) => {
      if (fn === 'discover_events') return Promise.resolve({ data: mockEvents, error: null });
      throw new Error(`Unexpected rpc in mock: ${fn}`);
    },
    from: (table: string) => {
      if (table === 'event_participants') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
            // A real query filters to ACTIVE_PARTICIPANT_STATUSES (accepted
            // only) server-side, so a pending row would never come back here -
            // this fixture only includes what a real accepted-only query
            // could actually return.
            in: () => ({
              in: () => Promise.resolve({ data: [{ event_id: 'event-1', status: 'accepted' }], error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'shows fake events on the Discover screen once already logged in',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    expect(await screen.findByText(mockEvents[0].title)).toBeTruthy();
    expect(screen.getByText(mockEvents[1].title)).toBeTruthy();
    expect(screen.getByText(/Fake Court/)).toBeTruthy();
    expect(screen.getByText(/Fake Gym/)).toBeTruthy();
    expect(screen.getByText(/Free/)).toBeTruthy();
    expect(screen.getByText(/NT\$150/)).toBeTruthy();
    // event-1 has 1 accepted participant row in the mock, plus the organizer
    // who has no event_participants row of their own; event-2 has none, so
    // it shows just the organizer.
    expect(screen.getByText('2/8 players')).toBeTruthy();
    expect(screen.getByText('1/4 players')).toBeTruthy();
  },
  15000
);
