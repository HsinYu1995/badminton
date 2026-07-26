import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const organizedEvent = {
  id: 'event-organized',
  organizer_id: 'fake-user-id',
  title: 'My Hosted Game',
  description: 'Bring a racket',
  start_time: '2027-08-01T10:00:00.000Z',
  end_time: '2027-08-01T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Home Court' },
};

const ownProfile = { display_name: 'Fake Player', skill_level: 8, bio: null, contact_info: null };

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
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: () => Promise.resolve({ data: ownProfile, error: null }) }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === 'events') {
        return {
          select: () => ({
            eq: (column: string) => {
              if (column === 'organizer_id') return { order: () => Promise.resolve({ data: [organizedEvent], error: null }) };
              // getEventDetail: .eq('id', eventId).single()
              return { single: () => Promise.resolve({ data: organizedEvent, error: null }) };
            },
            in: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
          }),
        };
      }
      if (table === 'event_participants') {
        return {
          select: () => ({
            eq: (column: string) =>
              column === 'user_id' ? { eq: () => Promise.resolve({ data: [], error: null }) } : Promise.resolve({ data: [], error: null }),
            in: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'navigates to the event detail screen when a Profile event card is tapped',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(organizedEvent.title);
    await fireEvent.press(screen.getByText(organizedEvent.title));

    // The detail screen fetches and shows the event's description, which
    // never appears on the Profile list card - confirms we actually landed
    // on /event/[id], not just re-rendered the same card.
    expect(await screen.findByText(organizedEvent.description)).toBeTruthy();
  },
  15000
);
