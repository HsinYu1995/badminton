import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array.
const FAKE_SESSION = { user: { id: 'fake-user-id' } };

const ownProfileRow = { display_name: 'Fake Player', skill_level: 8, profile_contact: null };

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

const organizerProfileRow = {
  id: 'organizer-user-id',
  display_name: 'Coach Wu',
  skill_level: 13,
  profile_contact: { contact_info: 'LINE: coachwu' },
};

// Raw rows as returned by the single batched event_participants query (see
// getEventRosters) covering every organized/attending event at once: one
// pending request on the organized event, and the viewer's own accepted row
// on the attending event (that accepted row is what makes it "attending" -
// FellowParticipants filters it back out since it excludes the viewer).
const mockAllRosterRows = [
  {
    event_id: organizedEvent.id,
    user_id: 'participant-1',
    status: 'pending',
    profiles: { display_name: 'Newbie Player', skill_level: 2, is_anonymous: true, profile_contact: { contact_info: '090-1234' } },
  },
  {
    event_id: attendingEvent.id,
    user_id: 'fake-user-id',
    status: 'accepted',
    profiles: { display_name: 'Fake Player', skill_level: 8, is_anonymous: false, profile_contact: null },
  },
];

const mockLeaveEq = jest.fn(() => Promise.resolve({ error: null }));
// handleDecide's real query chains .update().eq('event_id',...).eq('user_id',...).select('user_id') -
// the .select() is what lets it detect an RLS-denied (zero-row) update instead of silently
// "succeeding" (see the comment on ProfileScreen's handleDecide).
const mockAcceptEq2 = jest.fn(() => ({ select: () => Promise.resolve({ data: [{ user_id: 'participant-1' }], error: null }) }));
const mockAcceptEq1 = jest.fn((_column: string, _value: string) => ({ eq: mockAcceptEq2 }));
const mockParticipantUpdate = jest.fn(() => ({
  eq: mockAcceptEq1,
}));

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
            eq: () => ({ single: () => Promise.resolve({ data: ownProfileRow, error: null }) }),
            in: () => Promise.resolve({ data: [organizerProfileRow], error: null }),
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
          update: mockParticipantUpdate,
          delete: () => ({ eq: () => ({ eq: mockLeaveEq }) }),
        };
      }
      if (table === 'ratings') {
        return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
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
    expect(await screen.findByText('👥 Requests (1)')).toBeTruthy();
    expect(screen.getByText('Newbie Player')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    // "Novice" also appears as a skill chip in "My profile" - two matches.
    expect(screen.getAllByText('Novice')).toHaveLength(2);
    expect(screen.getByText('090-1234')).toBeTruthy();

    // organizedEvent's only participant is still pending (not counted yet):
    // organizer (1) + 0 accepted = 1. attendingEvent's participant (the
    // viewer's own row) is accepted: organizer (1) + 1 accepted = 2.
    expect(screen.getByText('1/8 players')).toBeTruthy();
    expect(screen.getByText('2/8 players')).toBeTruthy();

    await fireEvent.press(screen.getByText('Leave event'));

    await waitFor(() => expect(mockLeaveEq).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(attendingEvent.title)).toBeNull();
    expect(screen.queryByText('🧑 Organized by Coach Wu')).toBeNull();
  },
  15000
);

it(
  'lets the organizer accept a pending request, updating the roster and the player count',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(organizedEvent.title);
    expect(await screen.findByText('👥 Requests (1)')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('1/8 players')).toBeTruthy();

    await fireEvent.press(screen.getByText('Accept'));

    await waitFor(() => expect(mockParticipantUpdate).toHaveBeenCalledTimes(1));
    expect(mockParticipantUpdate).toHaveBeenCalledWith({ status: 'accepted' });
    await waitFor(() => expect(mockAcceptEq1).toHaveBeenCalledTimes(1));
    expect(mockAcceptEq1).toHaveBeenCalledWith('event_id', organizedEvent.id);
    await waitFor(() => expect(mockAcceptEq2).toHaveBeenCalledTimes(1));
    expect(mockAcceptEq2).toHaveBeenCalledWith('user_id', 'participant-1');

    expect(await screen.findByText('Accepted')).toBeTruthy();
    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
    // organizedEvent's count bumped from 1/8 to 2/8 - which now coincides
    // with attendingEvent's already-accepted participant (also 2/8), so two
    // elements match instead of one.
    expect(screen.queryByText('1/8 players')).toBeNull();
    expect(screen.getAllByText('2/8 players')).toHaveLength(2);
  },
  15000
);

it(
  'shows a Guest badge for an anonymous attendee and not for a regular one',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });

    await screen.findByText(organizedEvent.title);
    expect(await screen.findByText('Newbie Player')).toBeTruthy();

    expect(screen.getByText('Guest')).toBeTruthy();
    expect(screen.queryAllByText('Guest')).toHaveLength(1);
  },
  15000
);
