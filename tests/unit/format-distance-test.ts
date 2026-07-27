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

describe('formatDistance locale handling', () => {
  it('renders km for zh-TW at a sub-kilometer distance', () => {
    expect(formatDistance(450, 'zh-TW')).toBe('450 m away');
  });

  it('renders km for zh-TW past one kilometer', () => {
    expect(formatDistance(2300, 'zh-TW')).toBe('2.3 km away');
  });

  it('renders feet for en-US under roughly 0.1 miles', () => {
    expect(formatDistance(100, 'en-US')).toBe('328 ft away');
  });

  it('renders miles to one decimal for en-US past roughly 0.1 miles', () => {
    expect(formatDistance(2300, 'en-US')).toBe('1.4 mi away');
  });
});
