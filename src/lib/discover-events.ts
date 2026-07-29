import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventListItem } from '@/lib/events';

// Discover shows the top 10 upcoming events (sorted by start time, then
// distance) and loads 10 more each time the user scrolls near the bottom -
// see docs/superpowers/specs/2026-07-25-discovery-pagination-credit-splash-design.md.
export const DISCOVER_PAGE_SIZE = 10;

export type DiscoverRow = {
  id: string;
  organizer_id: string;
  title: string;
  start_time: string;
  end_time: string;
  headcount_max: number;
  skill_min: number;
  skill_max: number;
  fee: number;
  venue_name: string | null;
  distance_meters: number | null;
};

export type DiscoverItem = {
  event: EventListItem;
  distanceMeters: number | null;
};

// The discover_events RPC returns a flat venue_name (it can't embed a
// foreign-table relationship like a plain PostgREST .select() can) - mapped
// back into EventListItem's nested `venues: { name }` shape so EventCard
// and every other EventListItem consumer don't need a second code path.
export function mapDiscoverRow(row: DiscoverRow): DiscoverItem {
  return {
    event: {
      id: row.id,
      organizer_id: row.organizer_id,
      title: row.title,
      start_time: row.start_time,
      end_time: row.end_time,
      headcount_max: row.headcount_max,
      skill_min: row.skill_min,
      skill_max: row.skill_max,
      fee: row.fee,
      venues: row.venue_name != null ? { name: row.venue_name } : null,
    },
    distanceMeters: row.distance_meters,
  };
}

export type Coordinates = { latitude: number; longitude: number } | null;

// One page of Discover, already mapped to EventListItem shape.
// `hasMore` is true iff a full page came back - a short page means this
// was the last one, so the caller can stop calling onEndReached again.
export async function fetchDiscoverPage(
  supabase: SupabaseClient,
  coords: Coordinates,
  offset: number
): Promise<{ items: DiscoverItem[]; hasMore: boolean }> {
  const { data, error } = await supabase.rpc('discover_events', {
    lat: coords?.latitude ?? null,
    lng: coords?.longitude ?? null,
    page_limit: DISCOVER_PAGE_SIZE,
    page_offset: offset,
  });
  if (error) throw error;
  const rows = (data as DiscoverRow[] | null) ?? [];
  return { items: rows.map(mapDiscoverRow), hasMore: rows.length === DISCOVER_PAGE_SIZE };
}
