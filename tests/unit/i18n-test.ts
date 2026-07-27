import { en, zhTW } from '@/lib/i18n';

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
        if (value === '') {
          throw new Error(`${locale}.${key} must not be empty`);
        }
      }
    }
  });
});
