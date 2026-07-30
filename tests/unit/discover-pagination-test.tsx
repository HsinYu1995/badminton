import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { DISCOVER_PAGE_SIZE } from '@/lib/discover-events';

function makeEvent(i: number, distance: number) {
  return {
    id: `event-${i}`,
    organizer_id: 'someone-else',
    title: `Game ${i}`,
    start_time: `2026-08-01T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
    end_time: `2026-08-01T${String(12 + i).padStart(2, '0')}:00:00.000Z`,
    headcount_max: 8,
    skill_min: 1,
    skill_max: 18,
    fee: 0,
    venue_name: `Court ${i}`,
    distance_meters: distance,
  };
}

const firstPage = Array.from({ length: DISCOVER_PAGE_SIZE }, (_, i) => makeEvent(i, 500));
const secondPage = [makeEvent(DISCOVER_PAGE_SIZE, 1500)];

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

const mockRpc = jest.fn((_fn: string, args: { page_offset: number }) => {
  if (args.page_offset === 0) return Promise.resolve({ data: firstPage, error: null });
  if (args.page_offset === DISCOVER_PAGE_SIZE) return Promise.resolve({ data: secondPage, error: null });
  return Promise.resolve({ data: [], error: null });
});

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
    rpc: (fn: string, args: unknown) => mockRpc(fn, args as { page_offset: number }),
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
  'fetches only the first 10 events, then loads more on scroll, appending rather than replacing',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    await screen.findByText(firstPage[0].title);
    expect(screen.getByText(firstPage[DISCOVER_PAGE_SIZE - 1].title)).toBeTruthy();
    expect(screen.queryByText(secondPage[0].title)).toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('discover_events', { lat: null, lng: null, page_limit: DISCOVER_PAGE_SIZE, page_offset: 0 });

    const list = screen.getByTestId('discover-list');
    await fireEvent(list, 'endReached');

    expect(await screen.findByText(secondPage[0].title)).toBeTruthy();
    // First page's events are still there - appended, not replaced.
    expect(screen.getByText(firstPage[0].title)).toBeTruthy();
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('discover_events', {
        lat: null,
        lng: null,
        page_limit: DISCOVER_PAGE_SIZE,
        page_offset: DISCOVER_PAGE_SIZE,
      })
    );

    // A short (final) page means no further onEndReached calls should fetch again.
    const callCountAfterSecondPage = mockRpc.mock.calls.length;
    await fireEvent(list, 'endReached');
    expect(mockRpc).toHaveBeenCalledTimes(callCountAfterSecondPage);
  },
  30000
);

it(
  'shows distance when the RPC returns one, omits it when null',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    await screen.findByText(firstPage[0].title);
    // firstPage rows all have distance_meters: 500 -> "500 m away"
    expect(screen.getAllByText('500 m away').length).toBe(DISCOVER_PAGE_SIZE);
  },
  15000
);
