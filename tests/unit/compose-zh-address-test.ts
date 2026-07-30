import { composeZhAddress } from '@/lib/venues';

describe('composeZhAddress', () => {
  it('concatenates every part, largest-to-smallest administrative unit', () => {
    expect(
      composeZhAddress({
        region: '台北市',
        city: '大安區',
        district: '文山里',
        street: '和平東路二段',
        streetNumber: '106號',
      })
    ).toBe('台北市大安區文山里和平東路二段106號');
  });

  it('skips null parts without leaving gaps', () => {
    expect(
      composeZhAddress({
        region: '台北市',
        city: null,
        district: null,
        street: '和平東路二段',
        streetNumber: '106號',
      })
    ).toBe('台北市和平東路二段106號');
  });

  it('returns null when every part is null', () => {
    expect(
      composeZhAddress({ region: null, city: null, district: null, street: null, streetNumber: null })
    ).toBeNull();
  });

  it('treats empty strings the same as null (returns null when all parts are empty)', () => {
    expect(composeZhAddress({ region: '', city: '', district: '', street: '', streetNumber: '' })).toBeNull();
  });

  it('drops an adjacent duplicate (region and city both resolving to the same string)', () => {
    expect(
      composeZhAddress({ region: '台北市', city: '台北市', district: '大安區', street: '和平東路二段', streetNumber: '106號' })
    ).toBe('台北市大安區和平東路二段106號');
  });
});
