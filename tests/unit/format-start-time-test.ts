import { formatStartTime } from '@/lib/events';

describe('formatStartTime', () => {
  it('formats using en-US date/time conventions', () => {
    expect(formatStartTime('2026-08-01T10:00:00.000Z', 'en-US')).toBe(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-08-01T10:00:00.000Z'))
    );
  });

  it('formats using zh-TW date/time conventions', () => {
    expect(formatStartTime('2026-08-01T10:00:00.000Z', 'zh-TW')).toBe(
      new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-08-01T10:00:00.000Z'))
    );
  });
});
