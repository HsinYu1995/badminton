import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const mockEvent = {
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
};

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array.
const FAKE_SESSION = { user: { id: 'fake-user-id' } };

// Represents the request already being gone by the time the press lands
// (e.g. the organizer already declined it) - RLS matches zero rows and
// reports no error, exactly like a real blocked delete. Chainable AND
// directly awaitable, so it resolves the same way whether the caller reads
// it via .eq().eq() (today's un-guarded shape) or .eq().eq().select() (the
// guarded shape once handleCancelRequest is fixed) - only the guarded one
// actually looks at it.
function chainableZeroRows() {
  const result = { data: [], error: null };
  const chain: Record<string, unknown> = {
    eq: () => chain,
    select: () => Promise.resolve(result),
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  return chain;
}
const mockParticipantDelete = jest.fn(() => chainableZeroRows());

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
      if (fn === 'discover_events') return Promise.resolve({ data: [mockEvent], error: null });
      throw new Error(`Unexpected rpc in mock: ${fn}`);
    },
    from: (table: string) => {
      if (table === 'event_participants') {
        return {
          select: () => ({
            // loadParticipantCounts: .in('event_id', ids).in('status', ACTIVE_PARTICIPANT_STATUSES)
            in: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
            // loadMyRequests: .eq('user_id', userId) - the viewer already has a
            // pending request on mockEvent before this screen even loads.
            eq: () => Promise.resolve({ data: [{ event_id: mockEvent.id, status: 'pending' }], error: null }),
          }),
          delete: mockParticipantDelete,
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'shows an error and keeps the Cancel request state when cancelling is silently blocked (zero rows matched)',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    expect(await screen.findByText('Cancel request')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel request'));

    await waitFor(() => expect(mockParticipantDelete).toHaveBeenCalledTimes(1));

    // The mutation matched zero rows - it must surface as a visible error,
    // not a silent success that reverts to "Join" for a request the
    // database never actually withdrew.
    expect(await screen.findByText('This request was already withdrawn.')).toBeTruthy();
    expect(screen.getByText('Cancel request')).toBeTruthy();
    expect(screen.queryByText('Join')).toBeNull();
  },
  15000
);
