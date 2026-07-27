import { getEventDateBounds } from '@/lib/date-range';

it('mins at the start of today, regardless of the current time of day', () => {
  const { min } = getEventDateBounds(new Date(2026, 6, 27, 23, 59, 59));
  expect(min).toEqual(new Date(2026, 6, 27, 0, 0, 0, 0));
});

it('maxes at December 31st of next year', () => {
  const { max } = getEventDateBounds(new Date(2026, 6, 27));
  expect(max).toEqual(new Date(2027, 11, 31));
});

it('still spans this year and next year when invoked near the start of a year', () => {
  const { min, max } = getEventDateBounds(new Date(2026, 0, 1));
  expect(min).toEqual(new Date(2026, 0, 1));
  expect(max).toEqual(new Date(2027, 11, 31));
});
