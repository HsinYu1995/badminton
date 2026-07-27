import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

// Both events are in the past (today, per this session, is 2026-07-25) so
// rating controls are shown - see the design doc's "gated to past events
// only" decision.
const organizedEvent = {
  id: 'event-organized',
  organizer_id: 'fake-user-id',
  title: 'My Hosted Game',
  start_time: '2026-01-01T10:00:00.000Z',
  end_time: '2026-01-01T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Home Court' },
};

const attendingEvent = {
  id: 'event-attending',
  organizer_id: 'organizer-1',
  title: 'Joined Game',
  start_time: '2026-02-01T10:00:00.000Z',
  end_time: '2026-02-01T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venues: { name: 'Away Court' },
};

const ownProfile = { display_name: 'Fake Player', skill_level: 8, bio: null, contact_info: null };
const organizerProfile = { id: 'organizer-1', display_name: 'Coach Wu', skill_level: 13, contact_info: null };

// Raw rows as returned by the single batched event_participants query (see
// getEventRosters) covering both events at once.
const mockAllRosterRows = [
  {
    event_id: organizedEvent.id,
    user_id: 'newbie-id',
    status: 'pending',
    profiles: { display_name: 'Newbie', skill_level: 2, profile_contact: null },
  },
  {
    event_id: organizedEvent.id,
    user_id: 'vet-id',
    status: 'accepted',
    profiles: { display_name: 'Vet', skill_level: 10, profile_contact: null },
  },
  {
    event_id: attendingEvent.id,
    user_id: 'fake-user-id',
    status: 'accepted',
    profiles: { display_name: 'Fake Player', skill_level: 8, profile_contact: null },
  },
  {
    event_id: attendingEvent.id,
    user_id: 'buddy-id',
    status: 'accepted',
    profiles: { display_name: 'Buddy', skill_level: 7, profile_contact: null },
  },
];

const creditRows = [
  { profile_id: 'organizer-1', credit: '5.00', ratings_count: 1 },
  { profile_id: 'vet-id', credit: '4.00', ratings_count: 2 },
  { profile_id: 'fake-user-id', credit: '4.50', ratings_count: 3 },
];

const FAKE_SESSION = { user: { id: 'fake-user-id' } };
const mockRatingsUpsert = jest.fn(() => Promise.resolve({ error: null }));

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
            eq: (column: string) =>
              column === 'user_id'
                ? { eq: () => Promise.resolve({ data: [{ event_id: attendingEvent.id }], error: null }) }
                : Promise.resolve({ data: [], error: null }),
            // getEventRosters' single batched roster query: .in('event_id', ids).
            in: () => Promise.resolve({ data: mockAllRosterRows, error: null }),
          }),
        };
      }
      if (table === 'ratings') {
        return {
          select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
          upsert: mockRatingsUpsert,
        };
      }
      if (table === 'profile_credit') {
        return { select: () => ({ in: () => Promise.resolve({ data: creditRows, error: null }) }) };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  },
}));

it(
  'shows Credit and a rating control for the host, fellow participants, and organized-event attendees',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(organizedEvent.title);
    expect(screen.getByText(attendingEvent.title)).toBeTruthy();

    // The signed-in player's own read-only Credit, shown on "My profile".
    expect(await screen.findByText('★ 4.5 (3)')).toBeTruthy();

    // Host (organizer of the attending event) - credit + "Rate the host".
    expect(await screen.findByText('★ 5.0 (1)')).toBeTruthy();
    expect(screen.getByText('Rate the host')).toBeTruthy();

    // Fellow participant "Buddy" - unrated, but still ratable.
    expect(await screen.findByText('🏸 Also playing (1)')).toBeTruthy();
    expect(screen.getByText('Buddy')).toBeTruthy();

    // Organized event's roster: Vet (accepted, rated) and Newbie (pending, unrated).
    expect(await screen.findByText('★ 4.0 (2)')).toBeTruthy();
    expect(screen.getByText('Vet')).toBeTruthy();
    expect(screen.getByText('Newbie')).toBeTruthy();

    // Exactly 3 people are ratable here (host, Buddy, Vet) - Newbie (pending)
    // must not get a rating control.
    expect(screen.getAllByLabelText('Rate 5 stars')).toHaveLength(3);

    await fireEvent.press(screen.getAllByLabelText('Rate 4 stars')[0]);

    await waitFor(() => expect(mockRatingsUpsert).toHaveBeenCalledTimes(1));
    expect(mockRatingsUpsert).toHaveBeenCalledWith(
      { event_id: attendingEvent.id, rater_id: 'fake-user-id', ratee_id: 'organizer-1', score: 4 },
      { onConflict: 'event_id,rater_id,ratee_id' }
    );
  },
  20000
);
