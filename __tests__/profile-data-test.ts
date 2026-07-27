import { loadProfileSummary, getEventDetail } from '@/lib/profile-data';

const ownProfileRow = { display_name: 'Fake Player', skill_level: 8, profile_contact: null };
const ownProfile = { display_name: 'Fake Player', skill_level: 8, bio: null, contact_info: null };
const organizedEvent = { id: 'event-organized', organizer_id: 'me' };
const attendingEvent = { id: 'event-attending', organizer_id: 'organizer-1' };
// Raw row shape as returned by the profiles<-profile_contact embed.
const organizerProfileRow = {
  id: 'organizer-1',
  display_name: 'Coach Wu',
  skill_level: 13,
  profile_contact: { contact_info: 'LINE: coachwu' },
};
// Flattened shape profile-data.ts hands back to callers (see getEventOrganizers).
const organizerProfile = { display_name: 'Coach Wu', skill_level: 13, contact_info: 'LINE: coachwu' };

// Raw rows as returned by the single batched event_participants<-profiles<-
// profile_contact query (see getEventRosters) - one accepted request on the
// organized event, nothing on the attending event. Accepted (not pending) -
// only accepted rows occupy a player-count spot (see ACTIVE_PARTICIPANT_STATUSES).
const rosterRows = [
  {
    event_id: organizedEvent.id,
    user_id: 'p1',
    status: 'accepted',
    profiles: { display_name: 'Newbie', skill_level: 2, profile_contact: null },
  },
];
const creditRows = [{ profile_id: 'organizer-1', credit: '4.50', ratings_count: 2 }];
const myRatingRows = [{ event_id: attendingEvent.id, ratee_id: 'organizer-1', score: 5 }];

function defaultFrom(table: string): unknown {
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
        // loadProfileSummary's own accepted-events lookup: .eq('user_id',
        // ...).eq('status', 'accepted').
        eq: (column: string) =>
          column === 'user_id'
            ? { eq: () => Promise.resolve({ data: [{ event_id: attendingEvent.id }], error: null }) }
            : Promise.resolve({ data: [], error: null }),
        // getEventRosters' single batched roster query: .in('event_id', ids).
        in: () => Promise.resolve({ data: rosterRows, error: null }),
      }),
    };
  }
  if (table === 'profile_credit') {
    return { select: () => ({ in: () => Promise.resolve({ data: creditRows, error: null }) }) };
  }
  if (table === 'ratings') {
    return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: myRatingRows, error: null }) }) }) };
  }
  throw new Error(`Unexpected table in fake: ${table}`);
}

function fakeSupabase(fromOverride?: (table: string) => unknown) {
  return { from: fromOverride ?? defaultFrom } as never;
}

it('assembles profile, organized/attending events with organizer info, player counts, rosters, credits, and ratings', async () => {
  const summary = await loadProfileSummary(fakeSupabase(), 'me');

  expect(summary.profile).toEqual(ownProfile);
  expect(summary.profileError).toBeNull();
  expect(summary.organizedEvents).toEqual([organizedEvent]);
  expect(summary.attendingEvents).toEqual([{ ...attendingEvent, organizer: organizerProfile }]);
  // organized event: organizer (1) + 1 accepted (from the roster fetch) = 2.
  // attending event: organizer (1) + 0 accepted rows in the roster fetch = 1.
  expect(summary.playerCounts).toEqual({ 'event-organized': 2, 'event-attending': 1 });
  // Only event-organized has any roster rows - event-attending is simply
  // absent, not an empty array (see getEventRosters).
  expect(summary.rostersByEventId).toEqual({
    'event-organized': [{ user_id: 'p1', status: 'accepted', profiles: { display_name: 'Newbie', skill_level: 2, contact_info: null } }],
  });
  expect(summary.creditsByUserId).toEqual({ 'organizer-1': { credit: 4.5, ratingsCount: 2 } });
  expect(summary.myRatingsByEventId).toEqual({ 'event-attending': { 'organizer-1': 5 } });
});

it('reports a profile fetch failure without blocking event sections from loading', async () => {
  const supabase = fakeSupabase((table) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'profile boom' } }) }),
          in: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    }
    return defaultFrom(table);
  });

  const summary = await loadProfileSummary(supabase, 'me');

  expect(summary.profile).toBeNull();
  expect(summary.profileError).toBe('profile boom');
  expect(summary.organizedEvents).toEqual([organizedEvent]);
});

it("fetches one event's full detail plus its organizer", async () => {
  const eventRow = {
    id: 'event-organized',
    organizer_id: 'organizer-1',
    title: 'My Hosted Game',
    description: 'Bring your own racket',
    start_time: '2027-08-01T10:00:00.000Z',
    end_time: '2027-08-01T12:00:00.000Z',
    headcount_max: 8,
    skill_min: 1,
    skill_max: 18,
    fee: 0,
    venues: { name: 'Home Court' },
  };
  const supabase = fakeSupabase((table) => {
    if (table === 'events') {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: eventRow, error: null }) }) }) };
    }
    return defaultFrom(table);
  });

  const detail = await getEventDetail(supabase, 'event-organized');
  expect(detail).toEqual({ ...eventRow, organizer: organizerProfile });
});

it('returns null for an event that fails to load', async () => {
  const supabase = fakeSupabase((table) => {
    if (table === 'events') {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) }) }) };
    }
    return defaultFrom(table);
  });

  expect(await getEventDetail(supabase, 'missing-event')).toBeNull();
});
