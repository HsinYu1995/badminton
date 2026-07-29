import { validateEventDraft, type EventDraft } from '@/lib/event-draft';

const NOW = new Date('2026-08-01T10:00:00.000Z').getTime();
const FUTURE_DATE = new Date('2026-08-02T00:00:00.000Z');
const PAST_DATE = new Date('2020-01-01T00:00:00.000Z');

const validDraft: EventDraft = {
  title: 'Weekend Doubles',
  venueId: 'venue-1',
  headcountText: '8',
  feeText: '0',
  durationMinutesText: '90',
  fromBandId: 'novice',
  toBandId: 'professional',
  date: FUTURE_DATE,
  startTimeText: '18:30',
};

// startTimeText is combined with `date` via local-time setHours, so the
// exact resulting instant depends on the test runner's timezone - compute
// the expectation the same way rather than hardcoding a UTC ISO string, so
// this test is timezone-robust.
function expectedStart(date: Date, hours: number, minutes: number): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

it('accepts a fully valid draft and builds the event to insert', () => {
  const result = validateEventDraft(validDraft, NOW);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const start = expectedStart(FUTURE_DATE, 18, 30);
  expect(result.event).toEqual({
    title: 'Weekend Doubles',
    venueId: 'venue-1',
    headcountMax: 8,
    fee: 0,
    startTime: start,
    endTime: new Date(start.getTime() + 90 * 60_000),
    skillMin: 1,
    skillMax: 18,
  });
});

it('trims the title', () => {
  const result = validateEventDraft({ ...validDraft, title: '  Weekend Doubles  ' }, NOW);
  expect(result.ok && result.event.title).toBe('Weekend Doubles');
});

const rejectionCases: [string, Partial<EventDraft>, string][] = [
  ['empty title', { title: '' }, 'Title is required.'],
  ['no venue', { venueId: null }, 'Please select or add a venue.'],
  ['non-numeric headcount', { headcountText: 'abc' }, 'Number of people must be a positive whole number.'],
  ['zero headcount', { headcountText: '0' }, 'Number of people must be a positive whole number.'],
  ['negative fee', { feeText: '-5' }, 'Fee must be zero or a positive whole number.'],
  ['fractional fee', { feeText: '9.5' }, 'Fee must be zero or a positive whole number.'],
  ['zero duration', { durationMinutesText: '0' }, 'Duration must be a positive number of minutes.'],
  ['from-band above to-band', { fromBandId: 'professional', toBandId: 'novice' }, 'Skill range "from" must not be above "to".'],
  ['malformed start time', { startTimeText: '6:30pm' }, 'Start time must be in 24-hour HH:MM format, e.g. 18:30.'],
  ['empty start time', { startTimeText: '' }, 'Start time must be in 24-hour HH:MM format, e.g. 18:30.'],
];

it.each(rejectionCases)('rejects %s', (_name, overrides, expectedError) => {
  const result = validateEventDraft({ ...validDraft, ...overrides }, NOW);
  expect(result).toEqual({ ok: false, error: expectedError });
});

it('rejects a start time that is not in the future, without any Date.now mocking', () => {
  // A full day before `now`, regardless of timezone - the point is this
  // needs no jest.spyOn(Date, 'now') at all, just the injected clock.
  const result = validateEventDraft({ ...validDraft, date: PAST_DATE, startTimeText: '10:00' }, NOW);
  expect(result).toEqual({ ok: false, error: 'Start time must be in the future.' });
});

it('accepts a start time in the future relative to the injected clock', () => {
  // A full day after `now`, so the local-time setHours conversion (up to
  // ~14 hours either way depending on timezone) can never flip this to
  // being in the past.
  const wellInFuture = new Date(NOW + 24 * 3600_000);
  const result = validateEventDraft({ ...validDraft, date: wellInFuture, startTimeText: '12:00' }, NOW);
  expect(result.ok).toBe(true);
});

it('treats a blank fee as free (0)', () => {
  const result = validateEventDraft({ ...validDraft, feeText: '  ' }, NOW);
  expect(result.ok && result.event.fee).toBe(0);
});

// Documents a pre-existing quirk this extraction faithfully preserved
// (the grilling for this refactor explicitly chose zero behavior change):
// headcount and duration are parsed with parseInt, which truncates at the
// first non-digit rather than rejecting it, so "4.5" silently becomes 4.
// Fee uses Number() instead (see the "fractional fee" case above), which
// does reject non-integers correctly - the inconsistency is the bug.
it('BUG (pre-existing, not fixed here): silently truncates fractional headcount/duration instead of rejecting it', () => {
  const result = validateEventDraft({ ...validDraft, headcountText: '4.5', durationMinutesText: '90.9' }, NOW);
  expect(result.ok && result.event.headcountMax).toBe(4);
});
