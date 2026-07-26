import { formatDistance } from '@/lib/events';

it('formats sub-kilometer distances in whole meters', () => {
  expect(formatDistance(450)).toBe('450 m away');
  expect(formatDistance(999)).toBe('999 m away');
});

it('rounds meters to the nearest whole number', () => {
  expect(formatDistance(450.6)).toBe('451 m away');
});

it('formats distances of 1km or more in kilometers to one decimal place', () => {
  expect(formatDistance(1000)).toBe('1.0 km away');
  expect(formatDistance(2340)).toBe('2.3 km away');
});
