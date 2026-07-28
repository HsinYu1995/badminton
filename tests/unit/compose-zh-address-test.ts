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
});
