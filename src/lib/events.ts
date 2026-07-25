// A game's "current number of people" counts pending + accepted requests,
// not accepted-only - there's no organizer accept/decline UI yet, so an
// accepted-only count would read as permanently empty even for events with
// real signups. Declined (withdrawn) requests are excluded either way.
export const ACTIVE_PARTICIPANT_STATUSES = ['pending', 'accepted'] as const;

export type EventListItem = {
  id: string;
  organizer_id: string;
  title: string;
  start_time: string;
  end_time: string;
  headcount_max: number;
  skill_min: number;
  skill_max: number;
  fee: number;
  venues: { name: string } | null;
};

export function formatStartTime(startTime: string): string {
  const date = new Date(startTime);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatFee(fee: number): string {
  return fee === 0 ? 'Free' : `NT$${fee}`;
}

export function isPastEvent(event: Pick<EventListItem, 'end_time'>, now: number = Date.now()): boolean {
  return new Date(event.end_time).getTime() < now;
}

// An event's Player count (see CONTEXT.md) is the organizer - always
// exactly one, since organizers have no event_participants row of their
// own - plus every pending/accepted request. Returns an entry for every
// id in `eventIds`, even ones with zero rows, so callers never need a
// `?? 0`/`?? 1` fallback at the point of use.
export function computePlayerCounts(
  eventIds: string[],
  activeParticipantRows: { event_id: string }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of eventIds) {
    counts[id] = 1;
  }
  for (const row of activeParticipantRows) {
    counts[row.event_id] = (counts[row.event_id] ?? 1) + 1;
  }
  return counts;
}
