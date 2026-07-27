import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const mockEvents = [
  {
    id: 'event-1',
    organizer_id: 'someone-else',
    title: 'Sunday Doubles Mixer',
    start_time: '2026-08-01T10:00:00.000Z',
    end_time: '2026-08-01T12:00:00.000Z',
    headcount_max: 8,
    skill_min: 1,
    skill_max: 18,
    fee: 0,
    venue_name: 'Riverside Court',
    distance_meters: null,
  },
  {
    id: 'event-2',
    organizer_id: 'someone-else',
    title: 'Advanced Singles Ladder',
    start_time: '2026-08-02T14:00:00.000Z',
    end_time: '2026-08-02T16:00:00.000Z',
    headcount_max: 4,
    skill_min: 13,
    skill_max: 18,
    fee: 150,
    venue_name: 'Hilltop Gym',
    distance_meters: null,
  },
];

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
            in: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'filters the Discover list by search query, matching title or venue',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    await screen.findByText(mockEvents[0].title);
    expect(screen.getByText(mockEvents[1].title)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Search events'), 'Riverside');

    expect(screen.getByText(mockEvents[0].title)).toBeTruthy();
    expect(screen.queryByText(mockEvents[1].title)).toBeNull();
  },
  15000
);
