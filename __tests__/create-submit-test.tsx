import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

const mockVenue = { id: 'venue-1', name: 'Fake Court', address: '123 Fake Rd' };
const mockInsert = jest.fn(() => Promise.resolve({ error: null }));

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array (this test navigates to Discover
// on success, which does exactly that).
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
      if (table === 'venues') {
        return { select: () => ({ order: () => Promise.resolve({ data: [mockVenue], error: null }) }) };
      }
      if (table === 'events') {
        return {
          select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
          insert: mockInsert,
        };
      }
      if (table === 'event_participants') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'creates an event once all fields are valid, using the picker defaults as a future start time',
  async () => {
    const mountTime = Date.now();

    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    await screen.findByText('🏸 Host a game');

    await fireEvent.changeText(screen.getByPlaceholderText('Friendly doubles'), 'Weekend Doubles');
    await waitFor(() => screen.getByText(mockVenue.name));
    await fireEvent.press(screen.getByText(mockVenue.name));

    // Only Date.now() decides the "must be in the future" check (see
    // combineDateAndTime + the check in create.tsx) - the DatePicker/Picker
    // themselves are native SwiftUI-backed views we can't drive from a JS
    // test, so we hold their mount-time default and instead move what "now"
    // reads as, back behind that default, like a clock ticking forward past
    // the moment the organizer opened the form would.
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mountTime - 60_000);
    await fireEvent.press(screen.getByText('Create event'));
    // handleSubmit reads Date.now() synchronously before its first await, so
    // it's safe (and necessary - see below) to restore right after firing.
    dateNowSpy.mockRestore();

    // A frozen Date.now() would break waitFor's own elapsed-time polling, so
    // it must not still be mocked once we reach here.
    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizer_id: 'fake-user-id',
        venue_id: mockVenue.id,
        title: 'Weekend Doubles',
        headcount_max: 8,
        fee: 0,
        skill_min: 1,
        skill_max: 18,
      })
    );
  },
  15000
);
