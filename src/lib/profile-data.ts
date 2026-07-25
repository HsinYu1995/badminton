import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_PARTICIPANT_STATUSES, computePlayerCounts, type EventListItem } from '@/lib/events';

const EVENT_COLUMNS = 'id, organizer_id, title, start_time, end_time, headcount_max, skill_min, skill_max, fee, venues(name)';

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

export type Attendee = {
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  profiles: { display_name: string; skill_level: number | null; contact_info: string | null } | null;
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
};

// One profile's organizer isn't a roster (event_participants is one-to-many;
// events.organizer_id -> profiles is many-to-one) - kept as its own small
// query rather than folded into getEventRoster, which is a different shape
// for a different relationship. Internal to loadProfileSummary: no other
// caller needs "just the organizers of these events" today.
async function getEventOrganizers(
  supabase: SupabaseClient,
  organizerIds: string[]
): Promise<Map<string, OrganizerInfo>> {
  if (organizerIds.length === 0) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, skill_level, contact_info')
    .in('id', organizerIds);
  return new Map((data ?? []).map((row: OrganizerInfo & { id: string }) => [row.id, row]));
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
      supabase.from('profiles').select('display_name, skill_level, bio, contact_info').eq('id', userId).single(),
      supabase.from('events').select(EVENT_COLUMNS).eq('organizer_id', userId).order('start_time'),
    ]);

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
  let playerCounts: Record<string, number> = {};
  if (allEventIds.length > 0) {
    const { data: participantRows } = await supabase
      .from('event_participants')
      .select('event_id, status')
      .in('event_id', allEventIds)
      .in('status', ACTIVE_PARTICIPANT_STATUSES);
    playerCounts = computePlayerCounts(allEventIds, participantRows ?? []);
  }

  return {
    profile: profileErr ? null : profileData,
    profileError: profileErr?.message ?? null,
    organizedEvents,
    organizedEventsError: organizedEventsErr?.message ?? null,
    attendingEvents,
    attendingEventsError,
    playerCounts,
  };
}

// The roster of one Event - a one-to-many query, genuinely different from
// getEventOrganizers above. Has exactly one caller (AttendeeRoster) today,
// but lives here rather than inline in the component so it's testable
// without rendering anything.
export async function getEventRoster(supabase: SupabaseClient, eventId: string): Promise<Attendee[]> {
  const { data } = await supabase
    .from('event_participants')
    .select('user_id, status, profiles(display_name, skill_level, contact_info)')
    .eq('event_id', eventId);
  return (data as unknown as Attendee[] | null) ?? [];
}
