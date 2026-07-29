import { mapDiscoverRow, fetchDiscoverPage, DISCOVER_PAGE_SIZE, type DiscoverRow } from '@/lib/discover-events';

const baseRow: DiscoverRow = {
  id: 'event-1',
  organizer_id: 'organizer-1',
  title: 'Friendly Doubles',
  start_time: '2027-08-01T10:00:00.000Z',
  end_time: '2027-08-01T12:00:00.000Z',
  headcount_max: 8,
  skill_min: 1,
  skill_max: 18,
  fee: 0,
  venue_name: 'Riverside Court',
  distance_meters: 450,
};

it('maps a discover_events row into EventListItem + distance shape', () => {
  expect(mapDiscoverRow(baseRow)).toEqual({
    event: {
      id: 'event-1',
      organizer_id: 'organizer-1',
      title: 'Friendly Doubles',
      start_time: '2027-08-01T10:00:00.000Z',
      end_time: '2027-08-01T12:00:00.000Z',
      headcount_max: 8,
      skill_min: 1,
      skill_max: 18,
      fee: 0,
      venues: { name: 'Riverside Court' },
    },
    distanceMeters: 450,
  });
});

it('maps a null distance (no viewer location) straight through', () => {
  const mapped = mapDiscoverRow({ ...baseRow, distance_meters: null });
  expect(mapped.distanceMeters).toBeNull();
});

function fakeSupabase(rpcImpl: (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }>) {
  return { rpc: rpcImpl } as never;
}

it('fetches a page and reports hasMore=true when a full page comes back', async () => {
  const rows = Array.from({ length: DISCOVER_PAGE_SIZE }, (_, i) => ({ ...baseRow, id: `event-${i}` }));
  const supabase = fakeSupabase(async (fn, args) => {
    expect(fn).toBe('discover_events');
    expect(args).toEqual({ lat: 25.05, lng: 121.5, page_limit: DISCOVER_PAGE_SIZE, page_offset: 10 });
    return { data: rows, error: null };
  });

  const result = await fetchDiscoverPage(supabase, { latitude: 25.05, longitude: 121.5 }, 10);
  expect(result.items).toHaveLength(DISCOVER_PAGE_SIZE);
  expect(result.hasMore).toBe(true);
});

it('reports hasMore=false when a short (final) page comes back', async () => {
  const supabase = fakeSupabase(async () => ({ data: [baseRow], error: null }));
  const result = await fetchDiscoverPage(supabase, null, 20);
  expect(result.items).toHaveLength(1);
  expect(result.hasMore).toBe(false);
});

it('passes null lat/lng when no coordinates are available', async () => {
  const supabase = fakeSupabase(async (_fn, args) => {
    expect(args).toEqual({ lat: null, lng: null, page_limit: DISCOVER_PAGE_SIZE, page_offset: 0 });
    return { data: [], error: null };
  });
  await fetchDiscoverPage(supabase, null, 0);
});

it('throws on an RPC error', async () => {
  const supabase = fakeSupabase(async () => ({ data: null, error: { message: 'boom' } }));
  await expect(fetchDiscoverPage(supabase, null, 0)).rejects.toEqual({ message: 'boom' });
});
