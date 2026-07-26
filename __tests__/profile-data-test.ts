import { loadProfileSummary, getEventRoster, getEventDetail } from '@/lib/profile-data';

const ownProfile = { display_name: 'Fake Player', skill_level: 8, bio: null, contact_info: null };
const organizedEvent = { id: 'event-organized', organizer_id: 'me' };
const attendingEvent = { id: 'event-attending', organizer_id: 'organizer-1' };
const organizerProfile = { id: 'organizer-1', display_name: 'Coach Wu', skill_level: 13, contact_info: 'LINE: coachwu' };

function defaultFrom(table: string): unknown {
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
        in: () => ({
          in: () => Promise.resolve({ data: [{ event_id: organizedEvent.id, status: 'pending' }], error: null }),
        }),
      }),
    };
  }
  throw new Error(`Unexpected table in fake: ${table}`);
}

function fakeSupabase(fromOverride?: (table: string) => unknown) {
  return { from: fromOverride ?? defaultFrom } as never;
}

it('assembles profile, organized events, attending events with organizer info, and player counts', async () => {
  const summary = await loadProfileSummary(fakeSupabase(), 'me');

  expect(summary.profile).toEqual(ownProfile);
  expect(summary.profileError).toBeNull();
  expect(summary.organizedEvents).toEqual([organizedEvent]);
  expect(summary.attendingEvents).toEqual([{ ...attendingEvent, organizer: organizerProfile }]);
  // organized event: organizer (1) + 1 pending = 2. attending event: organizer (1) + 0 active = 1.
  expect(summary.playerCounts).toEqual({ 'event-organized': 2, 'event-attending': 1 });
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

it('fetches the roster of a single event', async () => {
  const roster = [{ user_id: 'p1', status: 'pending', profiles: { display_name: 'Newbie', skill_level: 2, contact_info: null } }];
  const supabase = fakeSupabase((table) => {
    expect(table).toBe('event_participants');
    return { select: () => ({ eq: () => Promise.resolve({ data: roster, error: null }) }) };
  });

  expect(await getEventRoster(supabase, 'event-organized')).toEqual(roster);
});

it('fetches one event\'s full detail plus its organizer', async () => {
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
