import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_PARTICIPANT_STATUSES, computePlayerCounts, type EventListItem } from '@/lib/events';
import { getCredits, getMyRatingsForEvents, type Credit } from '@/lib/ratings';

const EVENT_COLUMNS = 'id, organizer_id, title, start_time, end_time, headcount_max, skill_min, skill_max, fee, venues(name)';

// bio/contact_info live in profile_contact, not profiles - RLS there only
// returns a row when the viewer is the owner or shares an event with them
// (see 20260726120000_profile_contact_visibility.sql), so an unauthorized
// viewer gets no embedded row at all rather than the columns being present-
// but-null. Every read site below treats a missing profile_contact the same
// as one with null fields.
type ProfileContactRow = { bio: string | null; contact_info: string | null } | null;

export type ProfileRow = {
  display_name: string;
  skill_level: number | null;
  bio: string | null;
  contact_info: string | null;
};

export type OrganizerInfo = {
  display_name: string;
  skill_level: number | null;
  contact_info: string | null;
};

export type AttendingEvent = EventListItem & { organizer: OrganizerInfo | null };

export type EventDetail = EventListItem & { description: string | null; organizer: OrganizerInfo | null };

export type Attendee = {
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  profiles: { display_name: string; skill_level: number | null; contact_info: string | null; is_anonymous: boolean } | null;
};

export type ProfileSummary = {
  profile: ProfileRow | null;
  profileError: string | null;
  organizedEvents: EventListItem[];
  organizedEventsError: string | null;
  attendingEvents: AttendingEvent[];
  attendingEventsError: string | null;
  // See CONTEXT.md's "Player count" - always includes the organizer, keyed
  // by event id across both organizedEvents and attendingEvents.
  playerCounts: Record<string, number>;
  // Every organized/attending event's full roster (whatever getEventRosters
  // returned for that id - absent, not an empty array, for an event with no
  // rows), fetched in one batched query rather than one per event card.
  rostersByEventId: Record<string, Attendee[]>;
  // Credit for every id the Profile screen could possibly render: the
  // viewer's own id, every attending event's organizer, and everyone in
  // every roster above - deduped into a single getCredits call.
  creditsByUserId: Record<string, Credit>;
  // The viewer's own previously-given scores, keyed by event then ratee -
  // one batched query across every event instead of one per rating control.
  myRatingsByEventId: Record<string, Record<string, number>>;
};

// One profile's organizer isn't a roster (event_participants is one-to-many;
// events.organizer_id -> profiles is many-to-one) - kept as its own small
// query rather than folded into getEventRosters, which is a different shape
// for a different relationship. Internal to loadProfileSummary/getEventDetail:
// no other caller needs "just the organizers of these events" today.
async function getEventOrganizers(
  supabase: SupabaseClient,
  organizerIds: string[]
): Promise<Map<string, OrganizerInfo>> {
  if (organizerIds.length === 0) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, skill_level, profile_contact(contact_info)')
    .in('id', organizerIds);
  type Row = { id: string; display_name: string; skill_level: number | null; profile_contact: ProfileContactRow };
  return new Map(
    ((data as unknown as Row[] | null) ?? []).map((row) => [
      row.id,
      { display_name: row.display_name, skill_level: row.skill_level, contact_info: row.profile_contact?.contact_info ?? null },
    ])
  );
}

// Everything the Profile screen needs to know about the signed-in player:
// their own profile, the Events they organize, the Events they're an
// accepted participant in (with organizer info attached), and the Player
// count for every one of those Events. Errors are reported per section
// (not one combined failure) so a broken query in one area doesn't blank
// sections that loaded fine - matching the screen's existing behavior of
// showing whatever did load.
export async function loadProfileSummary(supabase: SupabaseClient, userId: string): Promise<ProfileSummary> {
  const [{ data: profileData, error: profileErr }, { data: organizedEventsData, error: organizedEventsErr }] =
    await Promise.all([
      supabase.from('profiles').select('display_name, skill_level, profile_contact(bio, contact_info)').eq('id', userId).single(),
      supabase.from('events').select(EVENT_COLUMNS).eq('organizer_id', userId).order('start_time'),
    ]);
  const profile: ProfileRow | null = profileData
    ? {
        display_name: (profileData as unknown as { display_name: string }).display_name,
        skill_level: (profileData as unknown as { skill_level: number | null }).skill_level,
        bio: (profileData as unknown as { profile_contact: ProfileContactRow }).profile_contact?.bio ?? null,
        contact_info: (profileData as unknown as { profile_contact: ProfileContactRow }).profile_contact?.contact_info ?? null,
      }
    : null;

  const organizedEvents = organizedEventsErr ? [] : ((organizedEventsData as unknown as EventListItem[] | null) ?? []);

  const { data: acceptedRows, error: acceptedErr } = await supabase
    .from('event_participants')
    .select('event_id')
    .eq('user_id', userId)
    .eq('status', 'accepted');

  let attendingEvents: AttendingEvent[] = [];
  let attendingEventsError: string | null = acceptedErr?.message ?? null;
  if (!acceptedErr) {
    const attendingEventIds = (acceptedRows ?? []).map((row: { event_id: string }) => row.event_id);
    if (attendingEventIds.length > 0) {
      const { data: attendingEventsData, error: attendingEventsErr } = await supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .in('id', attendingEventIds)
        .order('start_time');
      if (attendingEventsErr) {
        attendingEventsError = attendingEventsErr.message;
      } else {
        const rawAttendingEvents = (attendingEventsData as unknown as EventListItem[] | null) ?? [];
        const organizerById = await getEventOrganizers(
          supabase,
          [...new Set(rawAttendingEvents.map((event) => event.organizer_id))]
        );
        attendingEvents = rawAttendingEvents.map((event) => ({
          ...event,
          organizer: organizerById.get(event.organizer_id) ?? null,
        }));
      }
    }
  }

  const allEventIds = [...organizedEvents.map((event) => event.id), ...attendingEvents.map((event) => event.id)];

  // One roster query for every organized/attending event at once, instead of
  // one per event card (see getEventRosters below) - player counts are then
  // derived from the same fetch instead of a separate query, since "active
  // participants per event" is just a filter over data we already have.
  const rostersByEventId = await getEventRosters(supabase, allEventIds);
  const activeParticipantRows = Object.entries(rostersByEventId).flatMap(([eventId, attendees]) =>
    attendees.filter((a) => (ACTIVE_PARTICIPANT_STATUSES as readonly string[]).includes(a.status)).map((a) => ({ event_id: eventId }))
  );
  const playerCounts = allEventIds.length > 0 ? computePlayerCounts(allEventIds, activeParticipantRows) : {};

  // Credit for everyone the screen could render: the viewer's own id, every
  // attending event's organizer, and everyone in every roster above -
  // deduped into one getCredits call instead of one per card.
  const rosterUserIds = Object.values(rostersByEventId).flatMap((attendees) => attendees.map((a) => a.user_id));
  const organizerIds = attendingEvents.map((event) => event.organizer_id);
  const creditIds = [...new Set([userId, ...organizerIds, ...rosterUserIds])];
  const creditsByUserId = await getCredits(supabase, creditIds);

  // The viewer's own previously-given scores across every event at once,
  // instead of one query per rating control (the host's, and each fellow
  // participant's/roster member's).
  const myRatingsByEventId = await getMyRatingsForEvents(supabase, allEventIds, userId);

  return {
    profile: profileErr ? null : profile,
    profileError: profileErr?.message ?? null,
    organizedEvents,
    organizedEventsError: organizedEventsErr?.message ?? null,
    attendingEvents,
    attendingEventsError,
    playerCounts,
    rostersByEventId,
    creditsByUserId,
    myRatingsByEventId,
  };
}

// Every organized/attending event's roster in one query, grouped by event id
// - replaces one getEventRoster-per-event-card call. Internal to
// loadProfileSummary: no other caller needs "rosters for a set of events"
// today.
async function getEventRosters(supabase: SupabaseClient, eventIds: string[]): Promise<Record<string, Attendee[]>> {
  const result: Record<string, Attendee[]> = {};
  if (eventIds.length === 0) return result;
  const { data } = await supabase
    .from('event_participants')
    .select('event_id, user_id, status, profiles(display_name, skill_level, is_anonymous, profile_contact(contact_info))')
    .in('event_id', eventIds);
  type Row = {
    event_id: string;
    user_id: string;
    status: Attendee['status'];
    profiles: { display_name: string; skill_level: number | null; is_anonymous: boolean; profile_contact: ProfileContactRow } | null;
  };
  for (const row of (data as unknown as Row[] | null) ?? []) {
    const attendee: Attendee = {
      user_id: row.user_id,
      status: row.status,
      profiles: row.profiles
        ? {
            display_name: row.profiles.display_name,
            skill_level: row.profiles.skill_level,
            is_anonymous: row.profiles.is_anonymous,
            contact_info: row.profiles.profile_contact?.contact_info ?? null,
          }
        : null,
    };
    (result[row.event_id] ??= []).push(attendee);
  }
  return result;
}

const EVENT_DETAIL_COLUMNS =
  'id, organizer_id, title, description, start_time, end_time, headcount_max, skill_min, skill_max, fee, venues(name)';

// One Event's full info for the tap-through detail screen (src/app/event/
// [id].tsx) - deliberately just the event's own fields plus who organizes
// it, not a re-hosting of the roster/rating UI that already lives inline
// on Profile (see the design doc). Returns null for a missing/inaccessible
// event rather than throwing, so the screen can show a plain "not found."
export async function getEventDetail(supabase: SupabaseClient, eventId: string): Promise<EventDetail | null> {
  const { data, error } = await supabase.from('events').select(EVENT_DETAIL_COLUMNS).eq('id', eventId).single();
  if (error || !data) return null;
  const event = data as unknown as EventListItem & { description: string | null };
  const organizerById = await getEventOrganizers(supabase, [event.organizer_id]);
  return { ...event, organizer: organizerById.get(event.organizer_id) ?? null };
}
