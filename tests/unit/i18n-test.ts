import { en, zhTW, bucketLocale } from '@/lib/i18n';

describe('i18n dictionary parity', () => {
  it('has the exact same set of keys in every locale', () => {
    const enKeys = Object.keys(en).sort();
    const zhTWKeys = Object.keys(zhTW).sort();
    expect(zhTWKeys).toEqual(enKeys);
  });

  it('has no empty string values in any locale', () => {
    for (const [locale, dict] of Object.entries({ en, zhTW })) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value).not.toBe('');
      }
    }
  });
});

describe('bucketLocale', () => {
  it('buckets TW region to zh-TW', () => {
    expect(bucketLocale('en', 'TW')).toBe('zh-TW');
  });

  it('buckets zh language to zh-TW even outside Taiwan', () => {
    expect(bucketLocale('zh', 'US')).toBe('zh-TW');
  });

  it('falls back to en-US when neither signal matches', () => {
    expect(bucketLocale('en', 'US')).toBe('en-US');
    expect(bucketLocale(null, null)).toBe('en-US');
    expect(bucketLocale(undefined, undefined)).toBe('en-US');
  });
});
