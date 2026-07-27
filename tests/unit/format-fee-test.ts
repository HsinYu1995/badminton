import { formatFee } from '@/lib/events';

describe('formatFee', () => {
  it('renders Free for a zero fee in zh-TW', () => {
    expect(formatFee(0, 'zh-TW')).toBe('免費');
  });

  it('renders NT$ for a nonzero fee in zh-TW', () => {
    expect(formatFee(200, 'zh-TW')).toBe('NT$200');
  });

  it('renders Free for a zero fee in en-US', () => {
    expect(formatFee(0, 'en-US')).toBe('Free');
  });

  it('renders an approximate USD conversion for a nonzero fee in en-US', () => {
    expect(formatFee(315, 'en-US')).toBe('~$10.00 USD');
  });
});

describe('formatFee legacy no-arg behavior', () => {
  it('reproduces the old zero-fee output when locale is omitted', () => {
    expect(formatFee(0)).toBe('Free');
  });

  it('reproduces the old nonzero-fee output when locale is omitted', () => {
    expect(formatFee(150)).toBe('NT$150');
  });
});
