import { renderRouter, screen } from 'expo-router/testing-library';

const eventRow = {
  id: 'event-1',
  organizer_id: 'organizer-1',
  title: 'Sunday Doubles Mixer',
  description: 'Bring your own racket and water.',
  start_time: '2027-08-01T10:00:00.000Z',
  end_time: '2027-08-01T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Riverside Court' },
};

const organizerProfileRow = {
  id: 'organizer-1',
  display_name: 'Coach Wu',
  skill_level: 13,
  profile_contact: { contact_info: 'LINE: coachwu' },
};

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
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: eventRow, error: null }) }) }) };
      }
      if (table === 'profiles') {
        return { select: () => ({ in: () => Promise.resolve({ data: [organizerProfileRow], error: null }) }) };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'shows an event\'s full detail, including description and organizer, at /event/[id]',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/event/event-1' });

    expect(await screen.findByText(eventRow.title)).toBeTruthy();
    expect(screen.getByText(eventRow.description)).toBeTruthy();
    expect(screen.getByText('🧑 Organized by Coach Wu')).toBeTruthy();
    expect(screen.getByText('LINE: coachwu')).toBeTruthy();
  },
  15000
);

it(
  'shows a not-found state for a missing event',
  async () => {
    const supabaseMock = jest.requireMock('@/lib/supabase') as { supabase: { from: (table: string) => unknown } };
    supabaseMock.supabase.from = (table: string) => {
      if (table === 'events') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) }) }) };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    };

    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/event/missing-event' });

    expect(await screen.findByText('Event not found.')).toBeTruthy();
  },
  15000
);
