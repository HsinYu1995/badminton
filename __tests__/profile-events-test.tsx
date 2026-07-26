import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array.
const FAKE_SESSION = { user: { id: 'fake-user-id' } };

const ownProfile = { display_name: 'Fake Player', skill_level: 8, bio: null, contact_info: null };

const organizedEvent = {
  id: 'event-organized',
  organizer_id: 'fake-user-id',
  title: 'My Hosted Game',
  start_time: '2027-08-01T10:00:00.000Z',
  end_time: '2027-08-01T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Home Court' },
};

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

const organizerProfile = {
  id: 'organizer-user-id',
  display_name: 'Coach Wu',
  skill_level: 13,
  contact_info: 'LINE: coachwu',
};

const rosterRows = [
  {
    user_id: 'participant-1',
    status: 'pending',
    profiles: { display_name: 'Newbie Player', skill_level: 2, contact_info: '090-1234' },
  },
];

const mockLeaveEq = jest.fn(() => Promise.resolve({ error: null }));

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
            in: () => Promise.resolve({ data: [organizerProfile], error: null }),
          }),
        };
      }
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: [organizedEvent], error: null }) }),
            in: () => ({ order: () => Promise.resolve({ data: [attendingEvent], error: null }) }),
          }),
        };
      }
      if (table === 'event_participants') {
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              if (column === 'user_id') {
                return { eq: () => Promise.resolve({ data: [{ event_id: attendingEvent.id }], error: null }) };
              }
              // column === 'event_id' - AttendeeRoster fetching a specific organized event's roster
              return Promise.resolve({ data: value === organizedEvent.id ? rosterRows : [], error: null });
            },
            in: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    { event_id: organizedEvent.id, status: 'pending' },
                    { event_id: attendingEvent.id, status: 'accepted' },
                  ],
                  error: null,
                }),
            }),
          }),
          delete: () => ({ eq: () => ({ eq: mockLeaveEq }) }),
        };
      }
      if (table === 'ratings') {
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) };
      }
      if (table === 'profile_credit') {
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'shows accepted games with organizer info, attendee rosters on organized events, and can leave a game',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(organizedEvent.title);
    expect(screen.getByText(attendingEvent.title)).toBeTruthy();

    // Games I'm playing: organizer info. "Advanced" also appears as one of
    // the seven skill chips in "My profile", so there are two matches.
    expect(screen.getByText('🧑 Organized by Coach Wu')).toBeTruthy();
    expect(screen.getAllByText('Advanced')).toHaveLength(2);
    expect(screen.getByText('LINE: coachwu')).toBeTruthy();

    // My events: attendee roster
    expect(await screen.findByText('👥 Players (1)')).toBeTruthy();
    expect(screen.getByText('Newbie Player')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    // "Novice" also appears as a skill chip in "My profile" - two matches.
    expect(screen.getAllByText('Novice')).toHaveLength(2);
    expect(screen.getByText('090-1234')).toBeTruthy();

    // Headcounts include the organizer (1 + 1 active participant each)
    expect(screen.getAllByText('2/8 players')).toHaveLength(2);

    await fireEvent.press(screen.getByText('Leave event'));

    await waitFor(() => expect(mockLeaveEq).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(attendingEvent.title)).toBeNull();
    expect(screen.queryByText('🧑 Organized by Coach Wu')).toBeNull();
  },
  15000
);
