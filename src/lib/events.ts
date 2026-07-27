// A game's "current number of people" counts accepted requests only - a
// pending request doesn't occupy a spot until the organizer accepts it (see
// AttendeeRoster's Accept/Decline actions in src/app/(tabs)/profile.tsx).
// Declined requests are excluded the same as before.
export const ACTIVE_PARTICIPANT_STATUSES = ['accepted'] as const;

import type { LocaleTag } from '@/lib/i18n';

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

export function formatStartTime(startTime: string, locale: LocaleTag = 'en-US'): string {
  const date = new Date(startTime);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// No live FX source - a fixed, approximate, hardcoded rate for display
// purposes only, not a real currency conversion.
const NTD_TO_USD_RATE = 31.5;

export function formatFee(fee: number, locale?: LocaleTag): string {
  if (locale === undefined) {
    return fee === 0 ? 'Free' : `NT$${fee}`;
  }
  if (fee === 0) return locale === 'zh-TW' ? '免費' : 'Free';
  if (locale === 'zh-TW') return `NT$${fee}`;
  return `~$${(fee / NTD_TO_USD_RATE).toFixed(2)} USD`;
}

// Sub-kilometer distances read as meters (whole numbers - "450 m away"),
// anything further as kilometers to one decimal place ("2.3 km away"),
// matching how Google Maps/most map apps switch units. en-US uses the
// imperial equivalent (feet under ~0.1mi, else miles to one decimal).
export function formatDistance(meters: number, locale: LocaleTag = 'zh-TW'): string {
  if (locale === 'zh-TW') {
    if (meters < 1000) return `${Math.round(meters)} m away`;
    return `${(meters / 1000).toFixed(1)} km away`;
  }
  const miles = meters / 1609.34;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft away`;
  return `${miles.toFixed(1)} mi away`;
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
