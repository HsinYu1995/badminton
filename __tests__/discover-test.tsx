import { renderRouter, screen } from 'expo-router/testing-library';

const mockEvents = [
  {
    id: 'event-1',
    title: 'Fake Friendly Doubles',
    start_time: '2026-08-01T10:00:00.000Z',
    headcount_max: 8,
    skill_min: 1,
    skill_max: 18,
    fee: 0,
    venues: { name: 'Fake Court' },
  },
  {
    id: 'event-2',
    title: 'Fake Advanced Singles',
    start_time: '2026-08-02T14:00:00.000Z',
    headcount_max: 4,
    skill_min: 13,
    skill_max: 18,
    fee: 150,
    venues: { name: 'Fake Gym' },
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

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'events') {
        return { select: () => ({ order: () => Promise.resolve({ data: mockEvents, error: null }) }) };
      }
      if (table === 'event_participants') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
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
  },
  15000
);
