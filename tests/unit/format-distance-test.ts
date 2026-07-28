import { formatDistance } from '@/lib/events';

it('formats sub-kilometer distances in whole meters', () => {
  expect(formatDistance(450, 'zh-TW')).toBe('450 公尺');
  expect(formatDistance(999, 'zh-TW')).toBe('999 公尺');
});

it('rounds meters to the nearest whole number', () => {
  expect(formatDistance(450.6, 'zh-TW')).toBe('451 公尺');
});

it('formats distances of 1km or more in kilometers to one decimal place', () => {
  expect(formatDistance(1000, 'zh-TW')).toBe('1.0 公里');
  expect(formatDistance(2340, 'zh-TW')).toBe('2.3 公里');
});

describe('formatDistance locale handling', () => {
  it('renders km for zh-TW at a sub-kilometer distance', () => {
    expect(formatDistance(450, 'zh-TW')).toBe('450 公尺');
  });

  it('renders km for zh-TW past one kilometer', () => {
    expect(formatDistance(2300, 'zh-TW')).toBe('2.3 公里');
  });

  it('renders feet for en-US under roughly 0.1 miles', () => {
    expect(formatDistance(100, 'en-US')).toBe('328 ft away');
  });

  it('renders miles to one decimal for en-US past roughly 0.1 miles', () => {
    expect(formatDistance(2300, 'en-US')).toBe('1.4 mi away');
  });
});
