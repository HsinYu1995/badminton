import { computePlayerCounts } from '@/lib/events';

it('always counts the organizer even with zero participants', () => {
  expect(computePlayerCounts(['event-1'], [])).toEqual({ 'event-1': 1 });
});

it('adds pending/accepted rows on top of the organizer', () => {
  const rows = [{ event_id: 'event-1' }, { event_id: 'event-1' }, { event_id: 'event-2' }];
  expect(computePlayerCounts(['event-1', 'event-2'], rows)).toEqual({ 'event-1': 3, 'event-2': 2 });
});

it('returns an entry for every event id, even ones with no rows', () => {
  expect(computePlayerCounts(['event-1', 'event-2'], [])).toEqual({ 'event-1': 1, 'event-2': 1 });
});

it('is defensive about rows referencing an id outside the given list', () => {
  expect(computePlayerCounts([], [{ event_id: 'event-1' }])).toEqual({ 'event-1': 2 });
});
